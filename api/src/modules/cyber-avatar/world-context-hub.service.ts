// i18n-ignore-start: prompt content — injected into LLM system prompt, not user-facing UI.
import { Injectable, Logger } from '@nestjs/common';
import { CyberAvatarService } from './cyber-avatar.service';

/**
 * 「单人世界 · 用户上下文中枢」(per-owner World Context Hub)。
 *
 * 中枢按当前 TenantContext 的 owner 装配「整个世界对这个用户的共享认知」，注入到
 * 每个日常角色的聊天 prompt——让全世界的角色都「懂用户」、围绕一个人协同。
 *
 * 分层（见 .claude/plans/context-context-rustling-lagoon.md）：
 *   A 用户画像      —— 本阶段：复用赛博分身三层画像，第三人称渲染成 <owner_portrait>
 *   B 跨角色共享记忆 —— Phase 2 接入
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
