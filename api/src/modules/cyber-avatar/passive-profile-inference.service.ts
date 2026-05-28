// i18n-ignore-start: inference heuristics — derived data, not user-facing UI.
import { Injectable, Logger } from '@nestjs/common';
import { WorldOwnerService } from '../auth/world-owner.service';
import type {
  CyberAvatarLiveState,
  CyberAvatarRecentState,
  CyberAvatarStableCore,
} from './cyber-avatar.types';

// 常见职业关键词——从 identitySummary 这种自由文本里轻量抽取。命中即用，不强求穷尽。
const OCCUPATION_KEYWORDS = [
  '工程师',
  '程序员',
  '开发者',
  '设计师',
  '产品经理',
  '医生',
  '护士',
  '教师',
  '老师',
  '学生',
  '研究员',
  '律师',
  '会计',
  '运营',
  '市场',
  '销售',
  '编辑',
  '记者',
  '作家',
  '创业者',
  '老板',
  '自由职业',
  '咨询师',
  '分析师',
  '投资人',
  '艺术家',
];

// 常见地名关键词（中国主要城市 + 省/直辖市），从 identitySummary/routinePatterns 里轻量抽取。
const REGION_KEYWORDS = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '成都',
  '武汉',
  '南京',
  '西安',
  '重庆',
  '苏州',
  '天津',
  '长沙',
  '郑州',
  '青岛',
  '厦门',
  '合肥',
  '东京',
  '纽约',
  '伦敦',
  '新加坡',
];

type InferenceInputProfile = {
  stableCore?: Partial<CyberAvatarStableCore> | null;
  recentState?: Partial<CyberAvatarRecentState> | null;
  liveState?: Partial<CyberAvatarLiveState> | null;
  signalCount?: number | null;
  confidence?: { stableCore?: number } | null;
};

/**
 * 被动推断（Phase 4，默认静默）：从赛博分身已建好的画像里，轻量推断用户的
 * 职业 / 所在地 / 兴趣 / 偏好语气，**只回填到当前为空的资料字段**（用户手填永远优先）。
 *
 * 价值：8 字段「个人资料」从 Phase 1 起就注入每个角色的 prompt（<user_profile> 块），
 * 但绝大多数用户从不填表 → 长期为空。这里让它从观察到的行为自动长出来，
 * 让「角色懂用户」对没填表的用户也成立。
 *
 * 红线：纯启发式 + 只填空，零 LLM 调用、零 schema 变更；写库走
 * WorldOwnerService.fillInferredProfileFields（独立路径，不触发 owner_profile_update
 * 信号，避免推断→信号→再推断反馈环）。
 */
@Injectable()
export class PassiveProfileInferenceService {
  private readonly logger = new Logger(PassiveProfileInferenceService.name);

  // 画像太空（信号太少 / 置信度过低）时不推断，避免拿噪声污染资料。
  private static readonly MIN_SIGNALS = 8;
  private static readonly MIN_STABLE_CONFIDENCE = 0.3;
  private static readonly MAX_INTERESTS = 5;

  constructor(private readonly worldOwner: WorldOwnerService) {}

  /**
   * 用一份已构建好的画像推断并回填当前 owner 的空资料字段。
   * 由赛博分身深度刷新尾部调用（已在 owner 租户帧内）。best-effort，异常吞掉。
   */
  async inferAndFillFromProfile(
    profile: InferenceInputProfile | null | undefined,
  ): Promise<{ filled: string[] }> {
    try {
      if (!profile) return { filled: [] };
      if ((profile.signalCount ?? 0) < PassiveProfileInferenceService.MIN_SIGNALS) {
        return { filled: [] };
      }
      if (
        (profile.confidence?.stableCore ?? 0) <
        PassiveProfileInferenceService.MIN_STABLE_CONFIDENCE
      ) {
        return { filled: [] };
      }

      const inferred = {
        occupation: this.inferOccupation(profile),
        region: this.inferRegion(profile),
        interests: this.inferInterests(profile),
        aiAddressTone: this.inferAddressTone(profile),
      };

      const result = await this.worldOwner.fillInferredProfileFields(inferred);
      if (result.filled.length > 0) {
        this.logger.log(
          `passive profile inference filled empty fields: ${result.filled.join(', ')}`,
        );
      }
      return result;
    } catch (error) {
      this.logger.debug(
        `inferAndFillFromProfile skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { filled: [] };
    }
  }

  private inferOccupation(profile: InferenceInputProfile): string | undefined {
    const haystack = [
      profile.stableCore?.identitySummary ?? '',
      ...(profile.stableCore?.routinePatterns ?? []),
    ].join(' ');
    return OCCUPATION_KEYWORDS.find((kw) => haystack.includes(kw));
  }

  private inferRegion(profile: InferenceInputProfile): string | undefined {
    const haystack = [
      profile.stableCore?.identitySummary ?? '',
      ...(profile.stableCore?.routinePatterns ?? []),
      ...(profile.recentState?.recurringTopics ?? []),
    ].join(' ');
    return REGION_KEYWORDS.find((kw) => haystack.includes(kw));
  }

  private inferInterests(profile: InferenceInputProfile): string | undefined {
    const topics = [
      ...(profile.recentState?.recurringTopics ?? []),
      ...(profile.liveState?.activeTopics ?? []),
    ]
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter(Boolean);
    if (topics.length === 0) return undefined;
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const t of topics) {
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(t);
      if (unique.length >= PassiveProfileInferenceService.MAX_INTERESTS) break;
    }
    return unique.length > 0 ? unique.join('、') : undefined;
  }

  private inferAddressTone(profile: InferenceInputProfile): string | undefined {
    const styles = (profile.stableCore?.communicationStyle ?? [])
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean)
      .slice(0, 3);
    if (styles.length === 0) return undefined;
    return `Ta 习惯的沟通风格：${styles.join('、')}（自然贴合即可）`;
  }
}
// i18n-ignore-end
