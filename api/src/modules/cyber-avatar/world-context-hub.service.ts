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

  // Stratum B 拉取范围：从最近的信号里取 80 条，过滤出有意义的、近 30 天的，再压到 ≤10 条。
  // 这个数量级在 sqlite 上是 ms 级查询；不去 LLM 蒸馏，省一遍调用 + 保留原始事实粒度。
  private static readonly SHARED_MEMORY_FETCH_LIMIT = 80;
  private static readonly SHARED_MEMORY_RENDER_LIMIT = 10;
  private static readonly SHARED_MEMORY_RECENCY_DAYS = 30;
  private static readonly SHARED_MEMORY_PER_LINE_MAX = 120;
  // 权重低于这个阈值的信号视为「噪声」（feed_interaction/location_update 等），不进共享记忆。
  // 阈值参考 cyber-avatar.constants.ts signalWeights：≥1.0 = direct_message/group_message/moment_post
  // /feed_post/channel_post/feed_post(各 1.1+)/friendship_event/favorite_action/real_world_*。
  private static readonly SHARED_MEMORY_MIN_WEIGHT = 1.0;

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
      const signals = await this.cyberAvatar.listSignals({
        limit: WorldContextHubService.SHARED_MEMORY_FETCH_LIMIT,
      });
      if (!signals || signals.length === 0) {
        return '';
      }

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
        const occurredAt = signal.occurredAt
          ? new Date(signal.occurredAt).getTime()
          : NaN;
        if (Number.isFinite(occurredAt) && occurredAt < cutoff) {
          continue;
        }
        // 去重：summaryText 前 50 字相同视为同一事件（兜底 dedupeKey 漏网）。
        const dedupe = summary.slice(0, 50);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);

        const when = this.relativeDayLabel(occurredAt);
        const trimmedSummary = this.truncate(
          summary,
          WorldContextHubService.SHARED_MEMORY_PER_LINE_MAX,
        );
        lines.push(`- ${when ? `(${when}) ` : ''}${trimmedSummary}`);
      }

      if (lines.length === 0) {
        return '';
      }

      const body = this.truncate(
        lines.join('\n'),
        WorldContextHubService.SHARED_MEMORY_MAX_CHARS,
      );

      return [
        '<world_recent_episodes>',
        '【近期世界对 Ta 的具体观察——任一角色、朋友圈、视频号或现实世界里发生过的事，',
        '其他角色也该自然知晓；可主动关心进展、续上未了结的话题，但不要逐条复读或盘问】',
        body,
        '</world_recent_episodes>',
      ].join('\n');
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
   * 一次性装配 owner 的所有中枢块（portrait + shared memory）。调用方按需用。
   * 并行取，避免聊天主路径多花一次 round-trip。
   */
  async buildOwnerContextBlocks(): Promise<{
    portrait: string;
    sharedMemory: string;
  }> {
    const [portrait, sharedMemory] = await Promise.all([
      this.buildOwnerPortrait(),
      this.buildWorldRecentEpisodes(),
    ]);
    return { portrait, sharedMemory };
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
