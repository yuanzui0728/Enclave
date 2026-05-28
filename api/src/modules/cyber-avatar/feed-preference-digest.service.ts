// i18n-ignore-start: prompt/signal content — fed into LLM context, not user-facing UI.
import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { sleepForWorldJitter } from '../../common/cron-jitter.util';
import { GLOBAL_WORLD_OWNER_ID } from '../tenancy/tenant-context';
import { WorldOwnerService } from '../auth/world-owner.service';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { CyberAvatarRulesService } from './cyber-avatar-rules.service';
import { CyberAvatarService } from './cyber-avatar.service';

/**
 * 单人世界中枢 P4 信号回填：发现页 feed 偏好摘要。
 *
 * 用户在「发现」里 like/favorite/share/not_interested 的是内容偏好的强信号，但单条互动太碎、
 * 直接当 episodes 会刷屏。这里周期性（每 2h）把近 7 天互动蒸成 **一条** 偏好摘要信号
 * （weight 0.6 < 共享记忆阈值 1.0 → 只喂用户画像、不进 <world_recent_episodes>），
 * 让全世界角色懂「Ta 爱看什么、明确不爱看什么、常回看谁」。
 *
 * 纯聚合，不调 LLM（topicTags / authorName 已是结构化标签，频次统计足够）。
 * 红线：per-owner fan-out + 显式 ownerId 过滤；captureSignal 自带 enabled/dedupe 门控；异常吞掉。
 */
@Injectable()
export class FeedPreferenceDigestService {
  private readonly logger = new Logger(FeedPreferenceDigestService.name);

  private static readonly LOOKBACK_DAYS = 7;
  private static readonly FETCH_LIMIT = 200; // 近 7 天互动条数上限，sqlite ms 级
  private static readonly TOP_TOPICS = 5;
  private static readonly TOP_CREATORS = 3;
  private static readonly TOP_DISLIKES = 3;
  private static readonly POSITIVE_TYPES = new Set([
    'like',
    'favorite',
    'share',
    'comment_like',
  ]);

  constructor(
    @InjectRepository(UserFeedInteractionEntity)
    private readonly interactionRepo: Repository<UserFeedInteractionEntity>,
    @InjectRepository(FeedPostEntity)
    private readonly postRepo: Repository<FeedPostEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly rulesService: CyberAvatarRulesService,
    private readonly cyberAvatar: CyberAvatarService,
  ) {}

  // 每 2 小时 :15 跑一次，错开 cyber-avatar 增量(:4-59/5)/深刷(:30 4点)。
  @Cron('15 */2 * * *')
  async runDigestCron() {
    await sleepForWorldJitter(60_000);
    await this.worldOwnerService.forEachOwner(async () => {
      try {
        const rules = await this.rulesService.getRules();
        if (!rules.enabled || rules.pauseAutoUpdates) return;
        await this.runForCurrentOwner();
      } catch (error) {
        this.logger.debug(
          `feed-preference-digest skipped for owner: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }, 'feed-preference-digest');
  }

  /**
   * 当前租户帧内执行：聚合近 7 天 feed 互动 → 一条偏好摘要信号。无有效互动则不发。
   */
  async runForCurrentOwner(): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const cutoff = new Date(
      Date.now() -
        FeedPreferenceDigestService.LOOKBACK_DAYS * 86_400_000,
    );

    const interactions = await this.interactionRepo.find({
      where: { ownerId: owner.id, createdAt: MoreThan(cutoff) },
      order: { createdAt: 'DESC' },
      take: FeedPreferenceDigestService.FETCH_LIMIT,
    });
    if (interactions.length === 0) return;

    const positivePostIds = new Set<string>();
    const dislikePostIds = new Set<string>();
    let positiveCount = 0;
    let dislikeCount = 0;
    for (const it of interactions) {
      if (FeedPreferenceDigestService.POSITIVE_TYPES.has(it.type)) {
        positivePostIds.add(it.postId);
        positiveCount += 1;
      } else if (it.type === 'not_interested') {
        dislikePostIds.add(it.postId);
        dislikeCount += 1;
      }
    }
    if (positivePostIds.size === 0 && dislikePostIds.size === 0) return;

    const posts = await this.loadPosts(
      [...positivePostIds, ...dislikePostIds],
      owner.id,
    );

    const likedTopics = new Map<string, number>();
    const likedCreators = new Map<string, number>();
    const dislikedTopics = new Map<string, number>();

    for (const id of positivePostIds) {
      const post = posts.get(id);
      if (!post) continue;
      for (const tag of post.topicTags ?? []) {
        this.bump(likedTopics, tag);
      }
      const creator = post.authorName?.trim();
      if (creator) this.bump(likedCreators, creator);
    }
    for (const id of dislikePostIds) {
      const post = posts.get(id);
      if (!post) continue;
      for (const tag of post.topicTags ?? []) {
        this.bump(dislikedTopics, tag);
      }
    }

    const topTopics = this.top(
      likedTopics,
      FeedPreferenceDigestService.TOP_TOPICS,
    );
    const topCreators = this.top(
      likedCreators,
      FeedPreferenceDigestService.TOP_CREATORS,
    );
    const topDislikes = this.top(
      dislikedTopics,
      FeedPreferenceDigestService.TOP_DISLIKES,
    );

    const parts: string[] = [];
    if (topTopics.length) {
      parts.push(`偏爱 ${topTopics.join('/')} 类话题（正向互动 ${positiveCount} 次）`);
    }
    if (topCreators.length) {
      parts.push(`高频回看创作者「${topCreators.join('」「')}」`);
    }
    if (topDislikes.length) {
      parts.push(`明确划掉 ${topDislikes.join('/')}（不感兴趣 ${dislikeCount} 次）`);
    }
    if (parts.length === 0) return; // 有互动但帖子缺标签 → 没有可注入的偏好

    const summaryText = `近 7 天发现页偏好：${parts.join('；')}`;

    // 2 小时桶 dedupeKey：同窗口重复跑 cron 不重复写。
    const bucket = Math.floor(Date.now() / (2 * 3_600_000));
    await this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'feed_preference_digest',
      sourceSurface: 'feed',
      sourceEntityType: 'feed_interaction_aggregate',
      sourceEntityId: `digest:${bucket}`,
      dedupeKey: `feed_preference_digest:${owner.id}:${bucket}`,
      summaryText,
      payload: { topTopics, topCreators, topDislikes, positiveCount, dislikeCount },
      weight: 0.6,
    });
  }

  private async loadPosts(
    postIds: string[],
    ownerId: string,
  ): Promise<Map<string, FeedPostEntity>> {
    const map = new Map<string, FeedPostEntity>();
    if (postIds.length === 0) return map;
    // feed_posts 是 scoped 实体（TenantOwnershipSubscriber afterLoad 读守卫）：广场是全员共享
    // 内容池，帖子 ownerId 多为 GLOBAL_WORLD_OWNER_ID 或当前 owner。必须按 [owner, 全局哨兵]
    // 过滤，否则裸 find 命中第三方 owner 行会触发 TENANT_READ_LEAK（与 feed.service 同手法）。
    const rows = await this.postRepo.find({
      where: { id: In(postIds), ownerId: In([ownerId, GLOBAL_WORLD_OWNER_ID]) },
    });
    for (const r of rows) map.set(r.id, r);
    return map;
  }

  private bump(map: Map<string, number>, key: string) {
    const k = key.trim();
    if (!k) return;
    map.set(k, (map.get(k) ?? 0) + 1);
  }

  private top(map: Map<string, number>, n: number): string[] {
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);
  }
}
// i18n-ignore-end
