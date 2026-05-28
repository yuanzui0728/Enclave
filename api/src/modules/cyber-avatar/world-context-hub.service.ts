// i18n-ignore-start: prompt content — injected into LLM system prompt, not user-facing UI.
import { Injectable, Logger } from '@nestjs/common';
import { CyberAvatarService } from './cyber-avatar.service';

// CyberAvatarService.listSignals 返回的序列化信号里，本服务只用到这几个字段。
type SignalLike = {
  summaryText?: string | null;
  weight?: number | null;
  occurredAt?: string | null;
};

/**
 * 「单人世界 · 用户上下文中枢」(per-owner World Context Hub)。
 *
 * 中枢按当前 TenantContext 的 owner 装配「整个世界对这个用户的共享认知」，注入到
 * 每个日常角色的聊天 prompt——让全世界的角色都「懂用户」、围绕一个人协同。
 *
 * 分层（见 .claude/plans/context-context-rustling-lagoon.md）：
 *   A 用户画像        —— 复用赛博分身三层画像，第三人称渲染成 <owner_portrait>
 *   B 跨角色共享记忆  —— 跨任何角色/朋友圈/视频号的具体事实/事件，渲染成 <world_recent_episodes>
 *   C 角色互知/社交全景 —— Phase 3 接入
 *
 * 关键红线：所有读取都经 CyberAvatarService（getOwnerOrThrow → TenantContext 作用域），
 * 绝不跨 owner；任何异常一律吞掉返回空串，绝不影响聊天主路径。
 */
@Injectable()
export class WorldContextHubService {
  private readonly logger = new Logger(WorldContextHubService.name);

  // 单块上限，控制每轮注入的 token 体量（中枢未来会叠 B/C，给 A 留个保守上限）。
  private static readonly PORTRAIT_MAX_CHARS = 1100;
  private static readonly SHARED_MEMORY_MAX_CHARS = 1000;

  // Stratum B 拉取范围：取最近 200 条信号（一次查询，同时喂「近期(recency)」和
  // 「相关(relevance)」两个派生块）。sqlite 上仍是 ms 级；不调 LLM，保留原始事实粒度。
  private static readonly SHARED_MEMORY_FETCH_LIMIT = 200;
  private static readonly SHARED_MEMORY_RENDER_LIMIT = 10;
  private static readonly SHARED_MEMORY_RECENCY_DAYS = 30;
  private static readonly SHARED_MEMORY_PER_LINE_MAX = 120;
  // 权重低于这个阈值的信号视为「噪声」（feed_interaction/location_update 等），不进共享记忆。
  // 阈值参考 cyber-avatar.constants.ts signalWeights：≥1.0 = direct_message/group_message/moment_post
  // /feed_post/channel_post/feed_post(各 1.1+)/friendship_event/favorite_action/real_world_*。
  private static readonly SHARED_MEMORY_MIN_WEIGHT = 1.0;

  // Stratum B·语义召回（Phase 5 首版，词法相关性，非向量）：按当前消息相关度从**全部** 200
  // 条信号里捞最相关的几条——突破「只按最近 N 条」的窗口，让"上个月聊过的相关事"也能被召回。
  // 真·embedding 向量召回是后续升级（需迁移 1.8G 库 + 接 embedding provider + 用户授权）。
  private static readonly RELEVANT_RENDER_LIMIT = 5;
  private static readonly RELEVANCE_FLOOR = 0.2; // 与 followup recommendation-matching 同阈值
  private static readonly RELEVANT_RECENCY_DAYS = 120; // 相关召回窗口比近期宽（4 个月）
  private static readonly RELEVANT_QUERY_MIN_LEN = 4;

  constructor(private readonly cyberAvatar: CyberAvatarService) {}

  /**
   * Stratum A：把当前 owner 的赛博分身画像渲染成第三人称 <owner_portrait> 块，
   * 供「服务这个用户的其他角色」自然代入。无信号 / 取不到 → 返回 ''（调用方据此跳过注入）。
   */
  async buildOwnerPortrait(): Promise<string> {
    try {
      const profile = await this.cyberAvatar.getProfile();
      if (!profile || (profile.signalCount ?? 0) <= 0) {
        return '';
      }

      const core = profile.stableCore;
      const recent = profile.recentState;
      const live = profile.liveState;

      const lines = [
        this.kv('身份概述', core?.identitySummary),
        this.kv('沟通风格', core?.communicationStyle),
        this.kv('决策风格', core?.decisionStyle),
        this.kv('偏好', core?.preferenceModel),
        this.kv('社交姿态', core?.socialPosture),
        this.kv('作息规律', core?.routinePatterns),
        this.kv('边界（务必尊重）', core?.boundaries),
        this.kv('风险偏好', core?.riskTolerance),
        this.kv('反复在意的主题', recent?.recurringTopics),
        this.kv('最近的目标', recent?.recentGoals),
        this.kv('最近的烦心 / 摩擦', recent?.recentFriction),
        this.kv('最近在聊', live?.activeTopics),
        this.kv('当前情绪', live?.mood),
        this.kv('当前精力', live?.energy),
        this.kv('还没了结、可能在意的事', live?.openLoops),
      ].filter(Boolean);

      if (lines.length === 0) {
        return '';
      }

      // 置信度低时主动提示别装笃定（复用赛博分身自聊的同款门控阈值 0.4）。
      const stableConfidence = profile.confidence?.stableCore ?? 0;
      if (stableConfidence < 0.4) {
        lines.push(
          '（以上是世界对 Ta 的初步观察，了解还不深——别表现得过分笃定，拿不准就坦诚说「我了解到的还有限」。）',
        );
      }

      const body = this.truncate(
        lines.join('\n'),
        WorldContextHubService.PORTRAIT_MAX_CHARS,
      );

      return [
        '<owner_portrait>',
        '【关于你正在服务的这个人——这是整个世界从 Ta 的真实行为里逐步了解到的，自然地放在心上，',
        '不要生硬复述、逐条念出来、或拿来盘问 Ta；这是背景认知，不是要交付的报告】',
        body,
        '</owner_portrait>',
      ].join('\n');
    } catch (error) {
      this.logger.debug(
        `buildOwnerPortrait skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return '';
    }
  }

  /**
   * Stratum B：跨任何角色/朋友圈/视频号的「具体事实/近期事件」时间线，第三人称注入到
   * 当前角色的 prompt。这是「打通」的核心——角色 A 在直聊里学到的事实（"用户下周三去东京"）
   * 经信号管线沉淀后，自动出现在角色 B 的 prompt 里。
   *
   * 实现路径：直接读取最近的高权重 signals（已是跨面采集），按时间倒序 / 去重 / 截长。
   * 不再调一次 LLM 蒸馏——signal 的 summaryText 已是事实级粒度（"单聊对 Alice 发送：..."），
   * 保留原始事实比 LLM 二次概括更准。后续如需进一步抽象，可在深度刷新里追加。
   */
  async buildWorldRecentEpisodes(): Promise<string> {
    try {
      const signals = await this.fetchSignals();
      return this.renderRecentEpisodes(signals);
    } catch (error) {
      this.logger.debug(
        `buildWorldRecentEpisodes skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return '';
    }
  }

  /**
   * 一次性装配 owner 的所有中枢块。signals 只查一次，同时派生「近期(recency)」+
   * 「相关(relevance)」两块，避免聊天主路径重复查询。
   * @param opts.relevanceQuery 当前用户消息——传入则额外产出语义相关召回块（Stratum B·Phase 5）。
   */
  async buildOwnerContextBlocks(opts?: { relevanceQuery?: string }): Promise<{
    portrait: string;
    sharedMemory: string;
    relevantMemory: string;
  }> {
    const [portrait, signals] = await Promise.all([
      this.buildOwnerPortrait(),
      this.fetchSignals().catch(() => [] as SignalLike[]),
    ]);
    const sharedMemory = this.renderRecentEpisodes(signals);
    const relevantMemory = opts?.relevanceQuery
      ? this.renderRelevantEpisodes(signals, opts.relevanceQuery)
      : '';
    return { portrait, sharedMemory, relevantMemory };
  }

  private async fetchSignals(): Promise<SignalLike[]> {
    const signals = await this.cyberAvatar.listSignals({
      limit: WorldContextHubService.SHARED_MEMORY_FETCH_LIMIT,
    });
    return (signals ?? []) as SignalLike[];
  }

  /** 近期（recency）：按时间倒序、过滤噪声/超窗、去重，渲染 <world_recent_episodes>。 */
  private renderRecentEpisodes(signals: SignalLike[]): string {
    if (!signals || signals.length === 0) return '';
    const cutoff =
      Date.now() -
      WorldContextHubService.SHARED_MEMORY_RECENCY_DAYS * 86_400_000;
    const seen = new Set<string>();
    const lines: string[] = [];

    for (const signal of signals) {
      if (lines.length >= WorldContextHubService.SHARED_MEMORY_RENDER_LIMIT) {
        break;
      }
      const summary = signal.summaryText?.trim();
      if (!summary) continue;
      if ((signal.weight ?? 0) < WorldContextHubService.SHARED_MEMORY_MIN_WEIGHT) {
        continue;
      }
      const occurredAt = this.occurredAtMs(signal);
      if (Number.isFinite(occurredAt) && occurredAt < cutoff) continue;
      const dedupe = summary.slice(0, 50);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const when = this.relativeDayLabel(occurredAt);
      lines.push(
        `- ${when ? `(${when}) ` : ''}${this.truncate(
          summary,
          WorldContextHubService.SHARED_MEMORY_PER_LINE_MAX,
        )}`,
      );
    }
    if (lines.length === 0) return '';

    return [
      '<world_recent_episodes>',
      '【近期世界对 Ta 的具体观察——任一角色、朋友圈、视频号或现实世界里发生过的事，',
      '其他角色也该自然知晓；可主动关心进展、续上未了结的话题，但不要逐条复读或盘问】',
      this.truncate(
        lines.join('\n'),
        WorldContextHubService.SHARED_MEMORY_MAX_CHARS,
      ),
      '</world_recent_episodes>',
    ].join('\n');
  }

  /**
   * 相关召回（relevance，Phase 5 首版）：用词法相似度从全部信号里捞和当前消息最相关的几条，
   * 突破「只按最近 N 条」的窗口——上个月聊过的相关事也能被召回到当前对话。
   * 词法相似 = token 重合 ∪ CJK bigram Dice（与 followup recommendation-matching 同思路）。
   */
  private renderRelevantEpisodes(signals: SignalLike[], query: string): string {
    const q = query?.trim() ?? '';
    if (q.length < WorldContextHubService.RELEVANT_QUERY_MIN_LEN) return '';
    if (!signals || signals.length === 0) return '';

    const cutoff =
      Date.now() -
      WorldContextHubService.RELEVANT_RECENCY_DAYS * 86_400_000;
    const seen = new Set<string>();
    const scored: Array<{ summary: string; score: number; when: number }> = [];

    for (const signal of signals) {
      const summary = signal.summaryText?.trim();
      if (!summary) continue;
      if ((signal.weight ?? 0) < WorldContextHubService.SHARED_MEMORY_MIN_WEIGHT) {
        continue;
      }
      const occurredAt = this.occurredAtMs(signal);
      if (Number.isFinite(occurredAt) && occurredAt < cutoff) continue;
      const dedupe = summary.slice(0, 50);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const score = this.relevanceScore(q, summary);
      if (score < WorldContextHubService.RELEVANCE_FLOOR) continue;
      scored.push({ summary, score, when: occurredAt });
    }

    if (scored.length === 0) return '';
    scored.sort((a, b) => b.score - a.score);

    const lines = scored
      .slice(0, WorldContextHubService.RELEVANT_RENDER_LIMIT)
      .map((s) => {
        const when = this.relativeDayLabel(s.when);
        return `- ${when ? `(${when}) ` : ''}${this.truncate(
          s.summary,
          WorldContextHubService.SHARED_MEMORY_PER_LINE_MAX,
        )}`;
      });

    return [
      '<relevant_memory>',
      '【和当前话题相关的过往——从 Ta 在这个世界里的历史里捞出来的，可能不是最近发生的，',
      '但和现在聊的相关；自然续上即可，不确定是否同一件事就别强行联系】',
      this.truncate(
        lines.join('\n'),
        WorldContextHubService.SHARED_MEMORY_MAX_CHARS,
      ),
      '</relevant_memory>',
    ].join('\n');
  }

  // ---- 词法相关性（自包含，避免耦合 followup-runtime 内部） ----

  private relevanceScore(query: string, text: string): number {
    const overlap = this.tokenOverlap(query, text);
    const bigram = this.bigramDice(query, text);
    return Math.max(overlap, bigram);
  }

  private tokenize(value: string): string[] {
    const lower = value.toLowerCase();
    // 拉丁词（≥2 字符）
    const latin = lower.match(/[a-z0-9]{2,}/g) ?? [];
    // CJK 单字
    const cjk = lower.match(/[一-龥]/g) ?? [];
    return [...latin, ...cjk];
  }

  private tokenOverlap(a: string, b: string): number {
    const setA = new Set(this.tokenize(a));
    const setB = new Set(this.tokenize(b));
    if (setA.size === 0 || setB.size === 0) return 0;
    let hit = 0;
    for (const t of setA) if (setB.has(t)) hit += 1;
    // 以查询侧为分母：查询里有多少比例的词在历史事件里出现
    return hit / setA.size;
  }

  private cjkBigrams(value: string): Set<string> {
    const chars = value.toLowerCase().match(/[一-龥a-z0-9]/g) ?? [];
    const out = new Set<string>();
    for (let i = 0; i < chars.length - 1; i += 1) {
      out.add(chars[i] + chars[i + 1]);
    }
    return out;
  }

  private bigramDice(a: string, b: string): number {
    const setA = this.cjkBigrams(a);
    const setB = this.cjkBigrams(b);
    if (setA.size === 0 || setB.size === 0) return 0;
    let inter = 0;
    for (const g of setA) if (setB.has(g)) inter += 1;
    return (2 * inter) / (setA.size + setB.size);
  }

  private occurredAtMs(signal: SignalLike): number {
    return signal.occurredAt ? new Date(signal.occurredAt).getTime() : NaN;
  }

  private relativeDayLabel(occurredAtMs: number): string {
    if (!Number.isFinite(occurredAtMs)) return '';
    const diffMs = Date.now() - occurredAtMs;
    if (diffMs < 0) return '刚刚';
    const days = Math.floor(diffMs / 86_400_000);
    if (days <= 0) {
      const hours = Math.floor(diffMs / 3_600_000);
      if (hours <= 0) return '刚刚';
      return `${hours}小时前`;
    }
    if (days === 1) return '昨天';
    if (days <= 7) return `${days}天前`;
    if (days <= 30) return `${Math.floor(days / 7)}周前`;
    return `${Math.floor(days / 30)}个月前`;
  }

  private kv(label: string, value?: string | string[] | null): string {
    if (!value) {
      return '';
    }
    const text = Array.isArray(value)
      ? value
          .filter((item) => typeof item === 'string' && item.trim())
          .map((item) => item.trim())
          .slice(0, 6)
          .join('、')
      : value.trim();
    return text ? `- ${label}：${text}` : '';
  }

  private truncate(text: string, max: number): string {
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max).trimEnd()}…`;
  }
}
// i18n-ignore-end
