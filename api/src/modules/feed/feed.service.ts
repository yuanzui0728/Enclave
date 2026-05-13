// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { FeedPostEntity } from './feed-post.entity';
import { FeedCommentEntity } from './feed-comment.entity';
import { FeedPostLikeEntity } from './feed-post-like.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { VideoChannelFollowEntity } from './video-channel-follow.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import type { AiMessagePart } from '../ai/ai.types';
import { CharactersService } from '../characters/characters.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SocialService } from '../social/social.service';
import { CharacterFriendshipService } from '../social/character-friendship.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import type {
  MomentImageAsset,
  MomentMediaAsset,
  MomentVideoAsset,
} from '../moments/moment-media.types';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { resolveReadableMomentMediaPath } from '../moments/moment-media.storage';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import type { FeedPostCardAttachment } from '../chat/chat.types';
import {
  NPC_USER_POST_NEUTRAL_INTIMACY,
  npcIntimacyMultiplier,
  npcPostRecencyMultiplier,
  npcRelationCoolingFactor,
} from '../social/npc-engagement.utils';
import { WorldLanguageService } from '../config/world-language.service';
import { MinimaxJobService } from '../minimax/minimax-job.service';
import { MinimaxQuotaService } from '../minimax/minimax-quota.service';
import { MinimaxClient } from '../minimax/minimax.client';
import type { MinimaxVideoModel } from '../minimax/minimax.types';

type FeedSurface = 'feed' | 'channels';
type FeedChannelHomeSection = 'recommended' | 'friends' | 'following' | 'live';
type FeedMediaType = 'text' | 'image' | 'video' | 'audio';
type FeedSourceKind =
  | 'seed'
  | 'ai_generated'
  | 'owner_upload'
  | 'character_generated'
  | 'live_clip';
type FeedOwnerState = {
  hasLiked: boolean;
  hasFavorited: boolean;
  isFollowingAuthor: boolean;
  isNotInterested: boolean;
  hasViewed: boolean;
  hasShared: boolean;
  lastViewedAt: string | null;
  watchProgressSeconds: number | null;
  completed: boolean;
};

type FeedAvatarContext = {
  ownerAvatar: string;
  ownerId: string;
  visibleCharacterIds: Set<string>;
  ownerFriendCharacterIds: Set<string>;
  characterAvatarById: Map<string, string>;
};

type FeedListItem = ReturnType<FeedService['serializePost']> & {
  commentsPreview: ReturnType<FeedService['serializeComment']>[];
};

const CHANNEL_HOME_SECTION_LABELS: Record<FeedChannelHomeSection, string> = {
  recommended: '推荐',
  friends: '朋友',
  following: '关注',
  live: '直播',
};

const CHANNEL_VIDEO_TOPIC_TAGS = ['AI世界', '隐界'];
const CHANNEL_VIDEO_ASPECT_RATIO = 9 / 16;

const MAX_FEED_IMAGE_COUNT = 9;
const MAX_FEED_VIDEO_DURATION_MS = 5 * 60 * 1000;

// 已知失效的外部媒体 host（持续返 403/410 / DNS 不通）。
// 视频号过滤会把指向这些 host 的视频/音频帖隐藏。新增条目时小写域名即可。
const FEED_DEAD_MEDIA_HOSTS = new Set<string>([
  'commondatastorage.googleapis.com',
]);

// 角色主动转发时附带短评的清洗：去掉换行 / 引号 / 末尾省略号，强制 ≤ 24 字。
function sanitizeForwardQuip(raw: string | undefined | null): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/^["“”'']+|["“”'']+$/g, '')
    .trim();
  if (!cleaned) return '';
  // 留 24 个 unicode "字"——简化用 Array.from 近似，不严格按 grapheme 拆分
  const chars = Array.from(cleaned);
  return chars.length <= 24 ? cleaned : `${chars.slice(0, 23).join('')}…`;
}

@Injectable()
export class FeedService implements OnModuleInit {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @InjectRepository(FeedPostEntity)
    private readonly postRepo: Repository<FeedPostEntity>,
    @InjectRepository(FeedCommentEntity)
    private readonly commentRepo: Repository<FeedCommentEntity>,
    @InjectRepository(FeedPostLikeEntity)
    private readonly likeRepo: Repository<FeedPostLikeEntity>,
    @InjectRepository(UserFeedInteractionEntity)
    private readonly interactionRepo: Repository<UserFeedInteractionEntity>,
    @InjectRepository(VideoChannelFollowEntity)
    private readonly followRepo: Repository<VideoChannelFollowEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly socialService: SocialService,
    private readonly characterFriendships: CharacterFriendshipService,
    private readonly cyberAvatar: CyberAvatarService,
    private readonly worldLanguage: WorldLanguageService,
    private readonly minimaxJobs: MinimaxJobService,
    private readonly minimaxQuota: MinimaxQuotaService,
    private readonly minimaxClient: MinimaxClient,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  async onModuleInit() {
    await this.backfillFeedAuthorAvatars();
    await this.cleanupBrokenChannelPosts();
    await this.cleanupLegacyDemoChannelPosts();
  }

  async getFeed(
    page = 1,
    limit = 20,
    surface: FeedSurface = 'feed',
  ): Promise<{ posts: FeedListItem[]; total: number }> {
    if (surface === 'channels') {
      await this.ensureChannelSeedData();
      await this.topUpChannelsIfNeeded();
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const avatarContext = await this.buildFeedAvatarContext({
      ownerId: owner.id,
      ownerAvatar: owner.avatar,
    });

    let pagedPosts: FeedPostEntity[];
    let total: number;
    if (surface === 'feed') {
      // 广场：SQL 层完成 visibility 过滤 + skip/take，避免拉全表后再内存过滤
      const result = await this.findVisibleFeedPostsPaged(
        owner.id,
        page,
        limit,
      );
      pagedPosts = result.posts;
      total = result.total;
    } else {
      // 视频号：保留旧路径——需要叠 blocked / not_interested / section 等复合规则，
      // 全集语义在 channels 还有 ChannelHome 等多个调用方依赖。
      const visiblePosts = await this.getVisibleChannelPosts(
        owner.id,
        'recommended',
      );
      pagedPosts = paginate(visiblePosts, page, limit);
      total = visiblePosts.length;
    }

    const [commentsPreviewMap, ownerStateMap] = await Promise.all([
      this.buildCommentsPreviewMap(
        pagedPosts.map((post) => post.id),
        owner.id,
        avatarContext,
      ),
      this.buildOwnerStateMap(pagedPosts, owner.id),
    ]);

    return {
      posts: pagedPosts.map((post) => ({
        ...this.serializePost(post, ownerStateMap.get(post.id), avatarContext),
        commentsPreview: commentsPreviewMap.get(post.id) ?? [],
      })),
      total,
    };
  }

  async getChannelHome(input?: {
    section?: FeedChannelHomeSection;
    page?: number;
    limit?: number;
  }) {
    await this.ensureChannelSeedData();
    await this.topUpChannelsIfNeeded();

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const avatarContext = await this.buildFeedAvatarContext({
      ownerId: owner.id,
      ownerAvatar: owner.avatar,
    });
    const section = input?.section ?? 'recommended';
    const page = input?.page ?? 1;
    const limit = input?.limit ?? 20;

    const allVisiblePosts = await this.getVisibleChannelPosts(
      owner.id,
      'recommended',
    );
    const postsForSection =
      section === 'recommended'
        ? allVisiblePosts
        : await this.getVisibleChannelPosts(owner.id, section);
    const pagedPosts = paginate(postsForSection, page, limit);

    const [
      commentsPreviewMap,
      ownerStateMap,
      authors,
      liveEntries,
      sectionCounts,
    ] = await Promise.all([
      this.buildCommentsPreviewMap(
        pagedPosts.map((post) => post.id),
        owner.id,
        avatarContext,
      ),
      this.buildOwnerStateMap(pagedPosts, owner.id),
      this.buildChannelAuthorSummaries(
        allVisiblePosts,
        owner.id,
        avatarContext,
      ),
      this.buildLiveEntries(allVisiblePosts, avatarContext),
      this.buildChannelSectionCounts(allVisiblePosts, owner.id),
    ]);

    return {
      sections: (
        Object.keys(CHANNEL_HOME_SECTION_LABELS) as FeedChannelHomeSection[]
      ).map((key) => ({
        key,
        label: CHANNEL_HOME_SECTION_LABELS[key],
        count: sectionCounts[key] ?? 0,
      })),
      activeSection: section,
      posts: pagedPosts.map((post) => ({
        ...this.serializePost(post, ownerStateMap.get(post.id), avatarContext),
        commentsPreview: commentsPreviewMap.get(post.id) ?? [],
      })),
      authors,
      liveEntries,
      total: postsForSection.length,
    };
  }

  async getChannelAuthorProfile(authorId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const avatarContext = await this.buildFeedAvatarContext({
      ownerId: owner.id,
      ownerAvatar: owner.avatar,
    });
    const authorPosts = (
      await this.getVisibleChannelPosts(owner.id, 'recommended')
    ).filter((post) => post.authorId === authorId);
    const latestPost =
      authorPosts[0] ??
      (await this.postRepo.findOne({
        where: { authorId, surface: 'channels', publishStatus: 'published' },
        order: { createdAt: 'DESC' },
      }));

    if (!latestPost) {
      throw new AppError('FEED_CHANNEL_AUTHOR_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Channel author not found',
      });
    }

    const [ownerStateMap, commentsPreviewMap, followerCount, isFollowing, bio] =
      await Promise.all([
        this.buildOwnerStateMap(authorPosts.slice(0, 12), owner.id),
        this.buildCommentsPreviewMap(
          authorPosts.slice(0, 12).map((post) => post.id),
          owner.id,
          avatarContext,
        ),
        this.followRepo.count({ where: { authorId } }),
        this.followRepo.findOneBy({ ownerId: owner.id, authorId }),
        this.resolveAuthorBio(latestPost.authorId, latestPost.authorType),
      ]);

    return {
      authorId: latestPost.authorId,
      authorName: latestPost.authorName,
      authorAvatar: this.resolveFeedAuthorAvatar(
        latestPost.authorType,
        latestPost.authorId,
        latestPost.authorAvatar,
        avatarContext,
      ),
      authorType: latestPost.authorType,
      bio,
      followerCount,
      isFollowing: Boolean(isFollowing),
      recentPosts: authorPosts.slice(0, 12).map((post) => ({
        ...this.serializePost(post, ownerStateMap.get(post.id), avatarContext),
        commentsPreview: commentsPreviewMap.get(post.id) ?? [],
      })),
    };
  }

  async getPostWithComments(postId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const avatarContext = await this.buildFeedAvatarContext({
      ownerId: owner.id,
      ownerAvatar: owner.avatar,
    });
    const post = await this.postRepo.findOneBy({ id: postId });

    if (!post || post.publishStatus === 'deleted') {
      return null;
    }

    const [comments, ownerStateMap] = await Promise.all([
      this.getComments(postId, avatarContext),
      this.buildOwnerStateMap([post], owner.id),
    ]);

    return {
      ...this.serializePost(post, ownerStateMap.get(post.id), avatarContext),
      comments,
    };
  }

  async getComments(postId: string, avatarContext?: FeedAvatarContext) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const resolvedAvatarContext =
      avatarContext ??
      (await this.buildFeedAvatarContext({
        ownerId: owner.id,
        ownerAvatar: owner.avatar,
      }));
    const comments = await this.commentRepo.find({
      where: { postId, status: 'published' },
      order: { createdAt: 'ASC' },
    });
    const likedCommentIds = await this.buildLikedCommentIdSet(
      comments.map((comment) => comment.id),
      owner.id,
    );

    return comments.map((comment) =>
      this.serializeComment(
        comment,
        likedCommentIds.has(comment.id),
        resolvedAvatarContext,
      ),
    );
  }

  async createOwnerPost(
    text: string | undefined,
    options?: {
      title?: string;
      media?: MomentMediaAsset[];
      mediaType?: FeedMediaType;
      mediaUrl?: string;
      coverUrl?: string | null;
      durationMs?: number;
      aspectRatio?: number;
      topicTags?: string[];
      surface?: FeedSurface;
    },
  ): Promise<FeedPostEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.createPost({
      authorAvatar: owner.avatar ?? '',
      authorId: owner.id,
      authorName: owner.username?.trim() || 'You',
      authorType: 'user',
      title: options?.title,
      media: options?.media,
      mediaType: options?.mediaType,
      mediaUrl: options?.mediaUrl,
      coverUrl: options?.coverUrl,
      durationMs: options?.durationMs,
      aspectRatio: options?.aspectRatio,
      topicTags: options?.topicTags,
      sourceKind: 'owner_upload',
      surface: options?.surface,
      text: text ?? '',
    });
  }

  async createPost(input: {
    authorAvatar: string;
    authorId: string;
    authorName: string;
    authorType?: 'user' | 'character';
    text: string;
    title?: string;
    media?: MomentMediaAsset[];
    mediaType?: FeedMediaType;
    mediaUrl?: string;
    coverUrl?: string | null;
    durationMs?: number;
    aspectRatio?: number;
    topicTags?: string[];
    publishStatus?: 'draft' | 'published' | 'hidden' | 'deleted';
    shareCount?: number;
    favoriteCount?: number;
    viewCount?: number;
    watchCount?: number;
    completeCount?: number;
    sourceKind?: FeedSourceKind;
    recommendationScore?: number;
    statsPayload?: Record<string, unknown> | null;
    surface?: FeedSurface;
    visibility?: 'public' | 'friends' | 'private';
  }): Promise<FeedPostEntity> {
    const normalizedInput = this.normalizeCreatePostInput({
      ...input,
      publishStatus: input.publishStatus,
    });
    const post = this.postRepo.create({
      authorAvatar: input.authorAvatar,
      authorId: input.authorId,
      authorName: input.authorName,
      authorType: input.authorType ?? 'user',
      text: normalizedInput.text,
      title: normalizedInput.title,
      mediaPayload: this.serializeFeedMedia(normalizedInput.media),
      mediaType: normalizedInput.mediaType,
      mediaUrl: normalizedInput.mediaUrl,
      coverUrl: normalizedInput.coverUrl,
      durationMs: normalizedInput.durationMs,
      aspectRatio: normalizedInput.aspectRatio,
      topicTags: normalizeTags(input.topicTags),
      publishStatus: input.publishStatus ?? 'published',
      shareCount: input.shareCount ?? 0,
      favoriteCount: input.favoriteCount ?? 0,
      viewCount: input.viewCount ?? 0,
      watchCount: input.watchCount ?? 0,
      completeCount: input.completeCount ?? 0,
      sourceKind: input.sourceKind ?? 'owner_upload',
      recommendationScore: input.recommendationScore ?? 0,
      statsPayload: input.statsPayload ?? null,
      surface: input.surface ?? 'feed',
      visibility: input.visibility ?? 'public',
    });
    const saved = await this.postRepo.save(post);
    if (saved.authorType === 'user') {
      void this.cyberAvatar.captureSignal({
        ownerId: saved.authorId,
        signalType: saved.surface === 'channels' ? 'channel_post' : 'feed_post',
        sourceSurface: saved.surface === 'channels' ? 'channels' : 'feed',
        sourceEntityType: 'feed_post',
        sourceEntityId: saved.id,
        dedupeKey: `feed_post:${saved.id}`,
        summaryText: `发布${saved.surface === 'channels' ? '视频号' : '动态'}：${(saved.title || saved.text || saved.mediaType).slice(0, 120)}`,
        payload: {
          text: saved.text,
          title: saved.title ?? null,
          mediaType: saved.mediaType,
          surface: saved.surface,
          topicTags: saved.topicTags ?? [],
        },
        occurredAt: saved.createdAt ?? new Date(),
      });
    }
    // 视频号已发布且媒体可播放 → 排角色即时反应。draft 状态（minimax 视频还没回来）
    // 不调，等 applyMinimaxVideoToChannelPost / applyMinimaxAudioToChannelPost 时再触发。
    if (saved.surface === 'channels' && saved.publishStatus === 'published') {
      void this.scheduleChannelsCharacterReactions(saved);
    }
    return saved;
  }

  async syncMomentPostToFeed(
    post: MomentPostEntity,
    options?: {
      sourceKind?: FeedSourceKind;
      recommendationScore?: number;
      preserveTimestamp?: boolean;
    },
  ): Promise<FeedPostEntity | null> {
    if (post.authorType !== 'character') {
      return null;
    }

    const existing = await this.findFeedPostSyncedFromMoment(post.id);
    if (existing) {
      return existing;
    }

    const character = await this.characters.findById(post.authorId);

    const created = await this.createPost({
      authorAvatar: character?.avatar ?? post.authorAvatar,
      authorId: post.authorId,
      authorName: post.authorName,
      authorType: 'character',
      text: post.text ?? '',
      media: this.parseFeedMediaPayload(post.mediaPayload),
      sourceKind: options?.sourceKind ?? 'character_generated',
      recommendationScore: options?.recommendationScore ?? 0,
      statsPayload: {
        momentPostId: post.id,
        momentContentType: post.contentType ?? 'text',
        momentLocation: post.location ?? null,
        syncedFrom: 'moments',
      },
      surface: 'feed',
      visibility: (post.visibility as 'public' | 'friends' | 'private') ?? 'public',
    });

    if (options?.preserveTimestamp && post.postedAt) {
      // 回填历史动态时保留原始时间戳，避免广场顺序混乱。
      await this.postRepo.update(created.id, { createdAt: post.postedAt });
      created.createdAt = post.postedAt;
    }

    return created;
  }

  async addOwnerComment(
    postId: string,
    text: string,
  ): Promise<ReturnType<FeedService['serializeComment']>> {
    await this.assertOwnerCanInteractWithPost(postId);
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const comment = await this.addComment({
      postId,
      authorId: owner.id,
      authorName: owner.username?.trim() || 'You',
      authorAvatar: owner.avatar ?? '',
      authorType: 'user',
      text,
    });
    return this.serializeComment(comment, false);
  }

  async addComment(input: {
    postId: string;
    authorId: string;
    authorName: string;
    authorAvatar: string;
    authorType?: 'user' | 'character';
    text: string;
    parentCommentId?: string | null;
    replyToCommentId?: string | null;
    replyToAuthorId?: string | null;
  }): Promise<FeedCommentEntity> {
    await this.assertPostExists(input.postId);
    const comment = this.commentRepo.create({
      postId: input.postId,
      authorId: input.authorId,
      authorName: input.authorName,
      authorAvatar: input.authorAvatar,
      authorType: input.authorType ?? 'user',
      text: input.text.trim(),
      parentCommentId: input.parentCommentId ?? null,
      replyToCommentId: input.replyToCommentId ?? null,
      replyToAuthorId: input.replyToAuthorId ?? null,
      status: 'published',
    });
    const saved = await this.commentRepo.save(comment);
    await this.postRepo.increment({ id: input.postId }, 'commentCount', 1);
    if (input.authorType === 'user') {
      void this.cyberAvatar.captureSignal({
        ownerId: input.authorId,
        signalType: 'feed_interaction',
        sourceSurface: 'feed',
        sourceEntityType: 'feed_comment',
        sourceEntityId: saved.id,
        dedupeKey: `feed_comment:${saved.id}`,
        summaryText: `评论动态：${input.text.trim().slice(0, 120)}`,
        payload: {
          postId: input.postId,
          text: input.text.trim(),
          parentCommentId: input.parentCommentId ?? null,
          replyToCommentId: input.replyToCommentId ?? null,
        },
        occurredAt: saved.createdAt ?? new Date(),
      });
    }
    // 视频号评论：调度 AI 角色回复，形成评论回复链。replyDepth 通过递归层数控制 ≤ 2，
    // 避免无限循环（角色回复角色 → 角色再回复 …）。
    void this.maybeScheduleChannelsCommentReplies(input.postId, saved);
    return saved;
  }

  private async maybeScheduleChannelsCommentReplies(
    postId: string,
    comment: FeedCommentEntity,
  ): Promise<void> {
    try {
      const post = await this.postRepo.findOneBy({ id: postId });
      if (!post || post.surface !== 'channels') return;
      const depth = await this.computeCommentReplyDepth(comment);
      await this.scheduleAiChannelsCommentReplies(
        postId,
        {
          commentId: comment.id,
          authorId: comment.authorId,
          authorName: comment.authorName,
          authorType: comment.authorType,
          text: comment.text,
        },
        depth,
      );
    } catch {
      // ignore
    }
  }

  // 沿 replyToCommentId 链路向上数到根，得到本评论在回复树中的深度。
  // depth=0：根评论；depth=1：根评论的回复；depth=2：根评论的回复的回复。
  private async computeCommentReplyDepth(
    comment: FeedCommentEntity,
  ): Promise<number> {
    let depth = 0;
    let cursor: FeedCommentEntity | null = comment;
    while (cursor?.replyToCommentId && depth < 5) {
      depth += 1;
      cursor = await this.commentRepo.findOneBy({
        id: cursor.replyToCommentId,
      });
    }
    return depth;
  }

  async replyToComment(commentId: string, text: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const parentComment = await this.commentRepo.findOneBy({ id: commentId });

    if (!parentComment) {
      throw new AppError('FEED_COMMENT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Comment not found',
      });
    }

    await this.assertOwnerCanInteractWithPost(parentComment.postId);

    const reply = await this.addComment({
      postId: parentComment.postId,
      authorId: owner.id,
      authorName: owner.username?.trim() || 'You',
      authorAvatar: owner.avatar ?? '',
      authorType: 'user',
      text,
      parentCommentId: parentComment.parentCommentId ?? parentComment.id,
      replyToCommentId: parentComment.id,
      replyToAuthorId: parentComment.authorId,
    });

    return this.serializeComment(reply, false);
  }

  async likeOwnerPost(postId: string): Promise<void> {
    await this.assertOwnerCanInteractWithPost(postId);
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.createPostInteraction({
      ownerId: owner.id,
      postId,
      type: 'like',
      incrementColumn: 'likeCount',
    });
  }

  async favoriteOwnerPost(postId: string): Promise<void> {
    await this.assertOwnerCanInteractWithPost(postId);
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.createPostInteraction({
      ownerId: owner.id,
      postId,
      type: 'favorite',
      incrementColumn: 'favoriteCount',
    });
  }

  async unfavoriteOwnerPost(postId: string): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const existing = await this.interactionRepo.findOneBy({
      ownerId: owner.id,
      postId,
      type: 'favorite',
    });

    if (!existing) {
      return;
    }

    await this.interactionRepo.delete(existing.id);
    await this.decrementPostCounter(postId, 'favoriteCount');
  }

  async shareOwnerPost(
    postId: string,
    channel?: 'native' | 'copy' | 'system' | 'unknown',
  ): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.assertPostExists(postId);
    const interaction = this.interactionRepo.create({
      ownerId: owner.id,
      postId,
      type: 'share',
      payload: channel ? { channel } : null,
    });
    await this.interactionRepo.save(interaction);
    void this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'feed_interaction',
      sourceSurface: 'feed',
      sourceEntityType: 'feed_interaction',
      sourceEntityId: interaction.id,
      dedupeKey: `feed_interaction:${interaction.id}`,
      summaryText: `分享动态到 ${channel ?? 'unknown'}`,
      payload: {
        postId,
        type: 'share',
        channel: channel ?? 'unknown',
      },
      occurredAt: interaction.createdAt ?? new Date(),
    });
    await this.postRepo.increment({ id: postId }, 'shareCount', 1);
  }

  /**
   * 把视频号一条帖子转发为一张 feed_post_card 卡片消息塞进与目标好友的私聊。
   *
   * 使用者：
   *  - 用户主动转发（actorType='user'）：senderId/Name 取 owner，conversationId 由
   *    chatService.getOrCreateConversation('direct_<targetCharacterId>') 解析得到。
   *  - 角色主动转发（actorType='character'）：actorId 必须等于 targetCharacterId
   *    （角色就是消息发送方，发到角色与用户的私聊里）；卡片在该 character 的对话里出现。
   */
  async forwardChannelPostToChat(input: {
    actorType: 'user' | 'character';
    actorId: string;
    actorName: string;
    actorAvatar?: string;
    postId: string;
    targetCharacterId: string;
    note?: string;
  }): Promise<{ messageId: string; conversationId: string }> {
    const post = await this.postRepo.findOneBy({ id: input.postId });
    if (!post) {
      throw new AppError('FEED_POST_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Feed post not found',
      });
    }
    if (post.surface !== 'channels') {
      throw new AppError('FEED_FORWARD_NOT_CHANNELS', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Only channels posts can be forwarded',
      });
    }
    if (post.publishStatus !== 'published') {
      throw new AppError('FEED_POST_NOT_PUBLISHED', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Cannot forward an unpublished post',
      });
    }
    if (
      (post.mediaType === 'video' || post.mediaType === 'audio') &&
      !this.isPostMediaPlayable(post)
    ) {
      throw new AppError('FEED_FORWARD_MEDIA_BROKEN', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Post media is not playable',
      });
    }

    if (input.actorType === 'character' && input.actorId !== input.targetCharacterId) {
      // 角色发起的转发只能进入「该角色 ↔ 用户」的私聊，避免错把内容塞到其它人的会话里。
      throw new AppError('FEED_FORWARD_CHARACTER_ACTOR_MISMATCH', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage:
          'Character actor must equal targetCharacterId for forwards',
      });
    }

    // 校验目标角色真实存在——否则 chatService.getOrCreateConversation 会用
    // characterId 当 title 兜底创建一个空壳 conversation，体验很怪。
    const targetCharacter = await this.characters.findById(
      input.targetCharacterId,
    );
    if (!targetCharacter) {
      throw new AppError('FEED_FORWARD_TARGET_REQUIRED', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Target character not found',
      });
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const conv = await this.chatService.getOrCreateConversation(
      input.targetCharacterId,
    );
    const conversationId = conv.id;

    const primaryUrl = this.resolvePrimaryFeedMediaUrl(post);
    const attachment: FeedPostCardAttachment = {
      kind: 'feed_post_card',
      postId: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      authorAvatar: post.authorAvatar,
      title: post.title ?? undefined,
      excerpt: (post.text ?? '').slice(0, 160),
      mediaType: post.mediaType as FeedPostCardAttachment['mediaType'],
      coverUrl: post.coverUrl ?? undefined,
      primaryMediaUrl: primaryUrl ?? undefined,
      durationMs: post.durationMs ?? undefined,
      surface: 'channels',
    };

    // 两条路径都走「直接写消息 + socket emit」，不要走 sendMessage —— 那会等
    // 一次 LLM 回包，HTTP 请求会卡到 5-10s，前端 toast 慢。微信视频号转发到
    // 聊天的体感本来也是「卡片即时出现，对方再不再回是看心情」。
    const savedMessage =
      input.actorType === 'character'
        ? await this.chatGateway.sendProactiveAttachmentMessage(
            conversationId,
            input.actorId,
            input.actorName,
            attachment,
            input.note?.trim() || undefined,
          )
        : await this.chatGateway.sendUserAttachmentMessage(
            conversationId,
            input.actorId,
            input.actorName,
            attachment,
            input.note?.trim() || undefined,
          );

    await this.postRepo.increment({ id: post.id }, 'shareCount', 1);

    const interaction = this.interactionRepo.create({
      ownerId: owner.id,
      postId: post.id,
      type: 'forward_to_chat',
      payload: {
        targetCharacterId: input.targetCharacterId,
        viaActor: input.actorId,
        viaActorType: input.actorType,
      },
    });
    await this.interactionRepo.save(interaction);

    void this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'feed_interaction',
      sourceSurface: 'feed',
      sourceEntityType: 'feed_interaction',
      sourceEntityId: interaction.id,
      dedupeKey: `feed_forward:${interaction.id}`,
      summaryText:
        input.actorType === 'character'
          ? `${input.actorName} 转发了一条视频号给你`
          : `转发视频号给 ${input.targetCharacterId}`,
      payload: {
        postId: post.id,
        targetCharacterId: input.targetCharacterId,
        viaActor: input.actorId,
        viaActorType: input.actorType,
      },
      occurredAt: interaction.createdAt ?? new Date(),
    });

    return {
      messageId: savedMessage?.id ?? '',
      conversationId,
    };
  }

  /**
   * Owner-发起的转发包装：解析当前 owner 身份，再走通用 forwardChannelPostToChat。
   * Controller 入口走这个；角色主动转发由 cron 直接调用 forwardChannelPostToChat。
   */
  async forwardOwnerChannelPostToChat(
    postId: string,
    body: { targetCharacterId: string; note?: string },
  ): Promise<{ messageId: string; conversationId: string }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const targetCharacterId = body.targetCharacterId?.trim();
    if (!targetCharacterId) {
      throw new AppError('FEED_FORWARD_TARGET_REQUIRED', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'targetCharacterId is required',
      });
    }
    return this.forwardChannelPostToChat({
      actorType: 'user',
      actorId: owner.id,
      actorName: owner.username?.trim() || 'You',
      actorAvatar: owner.avatar ?? undefined,
      postId,
      targetCharacterId,
      note: body.note,
    });
  }

  // 抽出一个统一的「拿首选可播放 URL」的小工具，供卡片快照引用。
  private resolvePrimaryFeedMediaUrl(post: FeedPostEntity): string | null {
    try {
      const arr = JSON.parse(post.mediaPayload ?? '[]') as Array<{
        kind?: string;
        url?: string;
      }>;
      for (const a of Array.isArray(arr) ? arr : []) {
        if (a?.kind === post.mediaType && a.url?.trim()) {
          return a.url.trim();
        }
      }
    } catch {
      /* fallthrough */
    }
    return post.mediaUrl?.trim() || null;
  }

  async viewOwnerPost(
    postId: string,
    payload?: { progressSeconds?: number; completed?: boolean },
  ): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.assertPostExists(postId);

    const existing = await this.interactionRepo.findOneBy({
      ownerId: owner.id,
      postId,
      type: 'view',
    });

    const nextPayload = {
      progressSeconds:
        typeof payload?.progressSeconds === 'number'
          ? payload.progressSeconds
          : null,
      completed: Boolean(payload?.completed),
    };

    if (!existing) {
      const savedInteraction = await this.interactionRepo.save(
        this.interactionRepo.create({
          ownerId: owner.id,
          postId,
          type: 'view',
          payload: nextPayload,
        }),
      );
      void this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'feed_interaction',
        sourceSurface: 'feed',
        sourceEntityType: 'feed_interaction',
        sourceEntityId: savedInteraction.id,
        dedupeKey: `feed_interaction:${savedInteraction.id}`,
        summaryText: `浏览动态`,
        payload: {
          postId,
          type: 'view',
          ...nextPayload,
        },
        occurredAt: savedInteraction.createdAt ?? new Date(),
      });
      await this.postRepo.increment({ id: postId }, 'viewCount', 1);
      if (
        typeof nextPayload.progressSeconds === 'number' &&
        nextPayload.progressSeconds > 0
      ) {
        await this.postRepo.increment({ id: postId }, 'watchCount', 1);
      }
      if (nextPayload.completed) {
        await this.postRepo.increment({ id: postId }, 'completeCount', 1);
      }
      return;
    }

    const previousCompleted = Boolean(existing.payload?.completed);
    const previousProgress = Number(existing.payload?.progressSeconds ?? 0);
    existing.payload = {
      progressSeconds:
        Math.max(previousProgress, nextPayload.progressSeconds ?? 0) || null,
      completed: previousCompleted || nextPayload.completed,
    };
    await this.interactionRepo.save(existing);

    if (previousProgress <= 0 && (nextPayload.progressSeconds ?? 0) > 0) {
      await this.postRepo.increment({ id: postId }, 'watchCount', 1);
    }
    if (!previousCompleted && nextPayload.completed) {
      await this.postRepo.increment({ id: postId }, 'completeCount', 1);
    }
  }

  async markOwnerPostNotInterested(postId: string): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.createPostInteraction({
      ownerId: owner.id,
      postId,
      type: 'not_interested',
    });
  }

  async likeOwnerComment(commentId: string): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const comment = await this.commentRepo.findOneBy({ id: commentId });

    if (!comment) {
      throw new AppError('FEED_COMMENT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Comment not found',
      });
    }

    await this.assertOwnerCanInteractWithPost(comment.postId);

    const existing = await this.interactionRepo.find({
      where: {
        ownerId: owner.id,
        postId: comment.postId,
        type: 'comment_like',
      },
    });
    const hasLiked = existing.some(
      (item) => item.payload?.commentId === commentId,
    );

    if (hasLiked) {
      return;
    }

    await this.interactionRepo.save(
      this.interactionRepo.create({
        ownerId: owner.id,
        postId: comment.postId,
        type: 'comment_like',
        payload: { commentId },
      }),
    );
    await this.commentRepo.increment({ id: commentId }, 'likeCount', 1);
  }

  async followChannelAuthor(authorId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    if (owner.id !== authorId) {
      const author = await this.resolveChannelAuthor(authorId);
      const existing = await this.followRepo.findOneBy({
        ownerId: owner.id,
        authorId,
      });

      if (!existing) {
        await this.followRepo.save(
          this.followRepo.create({
            ownerId: owner.id,
            authorId,
            authorType: author.authorType,
            muted: false,
          }),
        );
      }
    }

    return this.getChannelAuthorProfile(authorId);
  }

  async unfollowChannelAuthor(authorId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.followRepo.delete({ ownerId: owner.id, authorId });
    return this.getChannelAuthorProfile(authorId);
  }

  async generateFeedPostForCharacter(
    characterId: string,
  ): Promise<FeedPostEntity | null> {
    const char = await this.characters.findById(characterId);
    const profile = await this.characters.getProfile(characterId);
    if (!char || !profile) return null;

    try {
      const text = await this.ai.generateMoment({
        profile,
        currentTime: new Date(),
        usageContext: {
          surface: 'app',
          scene: 'feed_post_generate',
          scopeType: 'character',
          scopeId: char.id,
          scopeLabel: char.name,
          characterId: char.id,
          characterName: char.name,
        },
      });
      if (!text) return null;
      const created = await this.createPost({
        authorAvatar: char.avatar,
        authorId: char.id,
        authorName: char.name,
        authorType: 'character',
        sourceKind: 'character_generated',
        surface: 'feed',
        text,
      });
      // 把广场动态的时间戳推到过去 0-15 分钟随机点，避免 cron tick 集中。
      const jittered = new Date(
        Date.now() - Math.floor(Math.random() * 15 * 60 * 1000),
      );
      await this.postRepo.update(created.id, { createdAt: jittered });
      created.createdAt = jittered;
      return created;
    } catch (err) {
      this.logger.error(`Failed to generate feed post for ${characterId}`, err);
      return null;
    }
  }

  async generateChannelPost(
    characterId?: string,
    options?: { skipAi?: boolean },
  ): Promise<FeedPostEntity | null> {
    if (options?.skipAi) {
      // 视频号失败时跳过：topUp 路径不再用 demo 兜底，避免重复占视频额度。
      return null;
    }

    if (!this.minimaxClient.isConfigured()) {
      this.logger.warn(
        'generateChannelPost skipped: MINIMAX_API_KEY not configured',
      );
      return null;
    }

    const model = await this.pickVideoModel();
    if (!model) {
      this.logger.warn(
        'generateChannelPost skipped: MiniMax video quota exhausted today',
      );
      return null;
    }

    const candidates = await this.characters.findAllVisibleToOwner();
    const eligibleCharacters = candidates.filter((character) =>
      characterId ? character.id === characterId : character.feedFrequency > 0,
    );
    const selectedCharacter = characterId
      ? eligibleCharacters[0]
      : eligibleCharacters[
          Math.floor(Math.random() * eligibleCharacters.length)
        ];
    if (!selectedCharacter) {
      return null;
    }

    const profile = await this.characters.getProfile(selectedCharacter.id);
    const fallbackText = await this.worldLanguage.buildChannelFallbackText(
      selectedCharacter.name,
    );

    // 视频号不再调 LLM 生成 baseText：每个视频草稿都额外打一次 n1n 太贵；
    // 真正的画面内容由 minimax 视频模型基于 videoPrompt 决定，文字部分用本地
    // 兜底文案即可，配额耗尽 / minimax 失败时整条草稿都会被回滚。
    const text = fallbackText;

    const videoPrompt = composeChannelVideoPrompt(
      selectedCharacter.name,
      profile?.relationship,
      text,
    );
    const job = await this.minimaxJobs.enqueueVideoJob({
      model,
      prompt: videoPrompt,
      resolution: '768P',
      characterId: selectedCharacter.id,
      characterName: selectedCharacter.name,
      characterAvatar: selectedCharacter.avatar,
      targetType: 'channel_post',
    });
    if (!job) {
      return null;
    }

    try {
      const draft = await this.createPost({
        authorAvatar: selectedCharacter.avatar,
        authorId: selectedCharacter.id,
        authorName: selectedCharacter.name,
        authorType: 'character',
        title: composeChannelTitle(selectedCharacter.name, text),
        mediaType: 'video',
        mediaUrl: '',
        coverUrl: null,
        durationMs: undefined,
        aspectRatio: CHANNEL_VIDEO_ASPECT_RATIO,
        topicTags: CHANNEL_VIDEO_TOPIC_TAGS,
        sourceKind: 'character_generated',
        recommendationScore: 100,
        surface: 'channels',
        publishStatus: 'draft',
        statsPayload: { minimaxJobId: job.id, minimaxModel: model },
        text,
      });
      await this.minimaxJobs.attachTarget(job.id, draft.id);
      this.logger.log(
        `channel draft ${draft.id} queued minimax video job ${job.id} (${model})`,
      );
      return draft;
    } catch (err) {
      // createPost / attachTarget 失败必须回滚 job：否则配额白扣、cron 会
      // 去执行一个没有目标可挂的 orphan job。
      await this.minimaxJobs.cancelJob(job.id);
      this.logger.error(
        `channel post creation failed, rolled back minimax job ${job.id}: ${(err as Error)?.message}`,
      );
      throw err;
    }
  }

  async applyMinimaxVideoToChannelPost(
    postId: string,
    media: {
      mediaUrl: string;
      coverUrl: string | null;
      durationMs: number | null;
    },
  ): Promise<void> {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) {
      this.logger.warn(`applyMinimaxVideoToChannelPost: post ${postId} missing`);
      return;
    }
    const jittered = new Date(
      Date.now() - Math.floor(Math.random() * 15 * 60 * 1000),
    );
    await this.postRepo.update(postId, {
      mediaUrl: media.mediaUrl,
      coverUrl: media.coverUrl,
      durationMs: media.durationMs,
      mediaType: 'video',
      aspectRatio: CHANNEL_VIDEO_ASPECT_RATIO,
      publishStatus: 'published',
      createdAt: jittered,
    });
    // Minimax 视频回包 → 帖子从 draft 转 published 才有 mediaUrl，
    // 这里是真正可播放后的最早时机，调度角色即时反应。
    const refreshed = await this.postRepo.findOneBy({ id: postId });
    if (refreshed) void this.scheduleChannelsCharacterReactions(refreshed);
  }

  async applyMinimaxAudioToChannelPost(
    postId: string,
    media: {
      audioUrl: string;
      posterUrl: string | null;
      durationMs: number | null;
    },
  ): Promise<void> {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) {
      this.logger.warn(`applyMinimaxAudioToChannelPost: post ${postId} missing`);
      return;
    }
    const jittered = new Date(
      Date.now() - Math.floor(Math.random() * 15 * 60 * 1000),
    );
    await this.postRepo.update(postId, {
      mediaUrl: media.audioUrl,
      coverUrl: media.posterUrl,
      durationMs: media.durationMs,
      mediaType: 'audio',
      aspectRatio: 1,
      publishStatus: 'published',
      createdAt: jittered,
    });
    const refreshed = await this.postRepo.findOneBy({ id: postId });
    if (refreshed) void this.scheduleChannelsCharacterReactions(refreshed);
  }

  async deleteChannelDraftPost(postId: string): Promise<void> {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || post.publishStatus !== 'draft') {
      return;
    }
    await this.postRepo.delete(postId);
  }

  // 视频朋友圈双发到视频号：根据 momentPostId 幂等地创建或更新 channels 那条
  // feed_post（用同一段 mp4），让用户在朋友圈和视频号都能看到这条视频。
  // BGM 完成后会再次调用以更新 mediaPayload 指向带 BGM 的新文件。
  async upsertChannelVideoPostFromMoment(input: {
    momentPostId: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string | null;
    videoUrl: string;
    posterUrl?: string | null;
    durationMs?: number | null;
    mimeType?: string;
    fileName?: string | null;
    size?: number;
    text: string;
    title?: string | null;
    topicTags?: string[];
  }): Promise<FeedPostEntity> {
    const media: MomentMediaAsset[] = [
      {
        id: input.fileName ?? `feed-video-${Date.now()}`,
        kind: 'video',
        url: input.videoUrl,
        posterUrl: input.posterUrl ?? undefined,
        mimeType: input.mimeType ?? 'video/mp4',
        fileName: input.fileName ?? 'feed-video.mp4',
        size: input.size ?? 0,
        durationMs: input.durationMs ?? undefined,
      },
    ];

    const existing = await this.postRepo
      .createQueryBuilder('post')
      .where('post.surface = :surface', { surface: 'channels' })
      .andWhere('post.statsPayload LIKE :marker', {
        marker: `%\"momentPostId\":\"${input.momentPostId}\"%`,
      })
      .orderBy('post.createdAt', 'DESC')
      .getOne();

    if (existing) {
      existing.mediaPayload = this.serializeFeedMedia(media);
      existing.mediaType = 'video';
      existing.mediaUrl = input.videoUrl;
      existing.coverUrl = input.posterUrl ?? existing.coverUrl;
      existing.durationMs = input.durationMs ?? existing.durationMs;
      const updated = await this.postRepo.save(existing);
      this.logger.log(
        `channel video post ${updated.id} mediaPayload refreshed for moment ${input.momentPostId}`,
      );
      return updated;
    }

    return this.createPost({
      authorAvatar: input.authorAvatar ?? '',
      authorId: input.authorId,
      authorName: input.authorName,
      authorType: 'character',
      text: input.text,
      title: input.title ?? undefined,
      media,
      mediaType: 'video',
      mediaUrl: input.videoUrl,
      coverUrl: input.posterUrl ?? null,
      durationMs: input.durationMs ?? undefined,
      aspectRatio: 9 / 16,
      topicTags: input.topicTags ?? ['日常', 'AI世界'],
      sourceKind: 'character_generated',
      recommendationScore: 80,
      surface: 'channels',
      publishStatus: 'published',
      statsPayload: { momentPostId: input.momentPostId, syncedFrom: 'moments' },
    });
  }

  async createChannelAudioPost(input: {
    authorId: string;
    authorName: string;
    authorAvatar?: string | null;
    audioUrl: string;
    posterUrl?: string | null;
    durationMs?: number | null;
    text: string;
    title?: string | null;
    topicTags?: string[];
    // 视频号图文视频：可附带 N 张配图，前端按抖音风左右滑展示
    images?: MomentImageAsset[];
  }): Promise<FeedPostEntity> {
    const audioAsset: MomentMediaAsset = {
      id: `feed-audio-${Date.now()}`,
      kind: 'audio',
      url: input.audioUrl,
      posterUrl: input.posterUrl ?? undefined,
      mimeType: 'audio/mpeg',
      fileName: 'feed-audio.mp3',
      size: 0,
      durationMs: input.durationMs ?? undefined,
      title: input.title ?? `${input.authorName}·音乐`,
    };
    const images = input.images ?? [];
    const media: MomentMediaAsset[] = [audioAsset, ...images];
    return this.createPost({
      authorAvatar: input.authorAvatar ?? '',
      authorId: input.authorId,
      authorName: input.authorName,
      authorType: 'character',
      text: input.text,
      title: input.title ?? `${input.authorName}·音乐`,
      media,
      mediaType: 'audio',
      mediaUrl: input.audioUrl,
      coverUrl: input.posterUrl ?? null,
      durationMs: input.durationMs ?? undefined,
      aspectRatio: images.length > 0 ? 9 / 16 : 1,
      topicTags: input.topicTags ?? ['音乐', 'AI世界'],
      sourceKind: 'character_generated',
      recommendationScore: 90,
      surface: 'channels',
      publishStatus: 'published',
    });
  }

  private async pickVideoModel(): Promise<MinimaxVideoModel | null> {
    if ((await this.minimaxQuota.availableToday('MiniMax-Hailuo-2.3-Fast')) > 0) {
      return 'MiniMax-Hailuo-2.3-Fast';
    }
    if ((await this.minimaxQuota.availableToday('MiniMax-Hailuo-2.3')) > 0) {
      return 'MiniMax-Hailuo-2.3';
    }
    return null;
  }

  async toggleLike(
    postId: string,
    authorId: string,
    authorName: string,
    authorAvatar: string,
    authorType = 'user',
  ): Promise<{ liked: boolean }> {
    const existing = await this.likeRepo.findOneBy({ postId, authorId });
    if (existing) {
      await this.likeRepo.delete(existing.id);
      await this.postRepo.decrement({ id: postId }, 'likeCount', 1);
      return { liked: false };
    }
    const like = this.likeRepo.create({
      postId,
      authorId,
      authorName,
      authorAvatar,
      authorType,
    });
    await this.likeRepo.save(like);
    await this.postRepo.increment({ id: postId }, 'likeCount', 1);
    return { liked: true };
  }

  private jitterPastTimestamp(maxMs: number): Date {
    return new Date(Date.now() - Math.floor(Math.random() * maxMs));
  }

  /**
   * 视频号新帖发布即调度角色即时反应（点赞 / 评论），平均 2~30 分钟内随机散开，
   * 制造「刚发就有动静」的体感。对应朋友圈的 scheduleCharacterInteractions。
   *
   * 仅对真实可播放的视频/音频/图文帖触发；调用方需要在帖子可播放后再调（draft 状态不调）。
   */
  private async scheduleChannelsCharacterReactions(
    post: FeedPostEntity,
  ): Promise<void> {
    if (post.surface !== 'channels') return;
    if (post.publishStatus !== 'published') return;
    if (
      (post.mediaType === 'video' || post.mediaType === 'audio') &&
      !this.isPostMediaPlayable(post)
    ) {
      return;
    }

    try {
      const owner = await this.worldOwnerService.getOwnerOrThrow();
      const [visibleCharacterIds, blockedSet] = await Promise.all([
        this.getVisibleCharacterIdSet(owner.id),
        this.socialService
          .getBlockedCharacterIds(owner.id)
          .then((ids) => new Set(ids)),
      ]);

      const allChars = (
        await this.characters.findAllVisibleToOwner(owner.id)
      ).filter(
        (character) =>
          character.id !== post.authorId &&
          visibleCharacterIds.has(character.id) &&
          !blockedSet.has(character.id),
      );
      if (allChars.length === 0) return;

      const intimacyByCharId = new Map<string, number>();
      if (post.authorType === 'character') {
        // 单角色 getIntimacy 失败不该让整批反应都丢——用 allSettled，
        // 拿不到的就当 0（中性）继续走概率筛。
        const results = await Promise.allSettled(
          allChars.map(async (char) => {
            const intimacy = await this.characterFriendships.getIntimacy(
              char.id,
              post.authorId,
            );
            return [char.id, intimacy] as const;
          }),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') {
            intimacyByCharId.set(r.value[0], r.value[1]);
          }
        }
      }

      allChars.forEach((char, i) => {
        const freq = char.activityFrequency ?? 'normal';
        const baseChance = freq === 'high' ? 0.2 : freq === 'low' ? 0.07 : 0.13;
        const intimacy = intimacyByCharId.get(char.id) ?? 0;
        const effectiveIntimacy =
          post.authorType === 'character'
            ? intimacy
            : NPC_USER_POST_NEUTRAL_INTIMACY;
        const interactChance = Math.min(
          0.5,
          baseChance * npcIntimacyMultiplier(effectiveIntimacy),
        );
        if (Math.random() > interactChance) return;

        // 视频号节奏比朋友圈快：2-30 分钟为主，比 moments 更短随机
        const baseDelay =
          freq === 'high'
            ? 2 * 60 * 1000 // 2 min
            : freq === 'low'
              ? 30 * 60 * 1000 // 30 min
              : 8 * 60 * 1000; // 8 min
        const intimacySpeedup = Math.max(0.3, 1 - intimacy / 150);
        const delay =
          (baseDelay + Math.random() * baseDelay + i * 2000) * intimacySpeedup;

        setTimeout(() => {
          void (async () => {
            try {
              const fresh = await this.postRepo.findOneBy({ id: post.id });
              if (!fresh || fresh.publishStatus !== 'published') return;
              if (
                (fresh.mediaType === 'video' || fresh.mediaType === 'audio') &&
                !this.isPostMediaPlayable(fresh)
              ) {
                return;
              }
              const stillVisible = (
                await this.getVisibleCharacterIdSet(owner.id)
              ).has(char.id);
              if (!stillVisible) return;

              // 与 cron tick 共享后端表，必须查重防止：
              //   · toggleLike 重入 → 已有的 like 被反向删掉
              //   · 同一角色同一 post 被刷出多条 AI 评论
              const [existingLike, existingCommentCount] = await Promise.all([
                this.likeRepo.findOneBy({ postId: fresh.id, authorId: char.id }),
                this.commentRepo.count({
                  where: { postId: fresh.id, authorId: char.id },
                }),
              ]);
              const hasComment = existingCommentCount > 0;
              if (existingLike && hasComment) return;

              // 60% 评论 / 40% 点赞（与 plan 一致）；若该路径已有产物则走另一条
              let isComment = Math.random() < 0.6;
              if (isComment && hasComment) isComment = false;
              if (!isComment && existingLike) isComment = !hasComment;

              if (isComment) {
                const profile = await this.characters.getProfile(char.id);
                if (!profile) return;
                const observation = await this.buildFeedAiObservation(fresh);
                const userMessage =
                  await this.worldLanguage.formatPostCommentTask({
                    authorName: fresh.authorName,
                    summary: observation.summary,
                    surface: 'channels',
                  });
                const reply = await this.ai.generateReply({
                  profile,
                  conversationHistory: [],
                  userMessage,
                  userMessageParts: observation.parts,
                  usageContext: {
                    surface: 'app',
                    scene: 'feed_comment_generate',
                    scopeType: 'character',
                    scopeId: char.id,
                    scopeLabel: char.name,
                    characterId: char.id,
                    characterName: char.name,
                  },
                });
                await this.addComment({
                  postId: fresh.id,
                  authorId: char.id,
                  authorName: char.name,
                  authorAvatar: char.avatar,
                  authorType: 'character',
                  text: reply.text,
                });
                if (fresh.authorType === 'character') {
                  await this.characterFriendships.bumpInteraction(
                    char.id,
                    fresh.authorId,
                  );
                }
                await this.postRepo.update(
                  { id: fresh.id },
                  { aiReacted: true },
                );
                return;
              }

              if (existingLike) return;
              await this.toggleLike(
                fresh.id,
                char.id,
                char.name,
                char.avatar,
                'character',
              );
              if (fresh.authorType === 'character') {
                await this.characterFriendships.bumpInteraction(
                  char.id,
                  fresh.authorId,
                );
              }
              await this.postRepo.update(
                { id: fresh.id },
                { aiReacted: true },
              );
            } catch {
              // ignore — 散点失败不影响其它角色
            }
          })();
        }, delay);
      });
    } catch (error) {
      this.logger.warn(
        `scheduleChannelsCharacterReactions failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 视频号帖被评论后，1-30min 内挑 1~2 个相关角色（贴主本人 + 30% 概率围观者）
   * 给该评论生成 AI 回复，形成评论回复链。replyDepth ≤ 2 通过 parentCommentId 链路控制。
   */
  private async scheduleAiChannelsCommentReplies(
    postId: string,
    sourceComment: {
      commentId: string;
      authorId: string;
      authorName: string;
      authorType?: string;
      text: string;
    },
    replyDepth = 0,
  ): Promise<void> {
    if (replyDepth >= 2) return;
    try {
      const post = await this.postRepo.findOneBy({ id: postId });
      if (!post || post.surface !== 'channels') return;
      if (post.publishStatus !== 'published') return;

      const owner = await this.worldOwnerService.getOwnerOrThrow();
      const [visibleCharacterIds, blockedSet] = await Promise.all([
        this.getVisibleCharacterIdSet(owner.id),
        this.socialService
          .getBlockedCharacterIds(owner.id)
          .then((ids) => new Set(ids)),
      ]);

      // 候选回复者：
      // 1) 贴主本人（若是角色且未被屏蔽，且不是评论作者本人）
      // 2) 30% 概率再随机挑一个围观角色插话
      const repliers: { id: string; name: string; avatar: string }[] = [];
      if (
        post.authorType === 'character' &&
        post.authorId !== sourceComment.authorId &&
        visibleCharacterIds.has(post.authorId) &&
        !blockedSet.has(post.authorId)
      ) {
        const author = await this.characters.findById(post.authorId);
        if (author) {
          repliers.push({
            id: author.id,
            name: author.name,
            avatar: author.avatar,
          });
        }
      }

      if (Math.random() < 0.3) {
        const bystanders = (
          await this.characters.findAllVisibleToOwner(owner.id)
        ).filter(
          (c) =>
            visibleCharacterIds.has(c.id) &&
            !blockedSet.has(c.id) &&
            c.id !== post.authorId &&
            c.id !== sourceComment.authorId,
        );
        if (bystanders.length > 0) {
          const bystander =
            bystanders[Math.floor(Math.random() * bystanders.length)];
          repliers.push({
            id: bystander.id,
            name: bystander.name,
            avatar: bystander.avatar,
          });
        }
      }

      if (repliers.length === 0) return;

      // 取/构造 parent comment id。若已是回复（有 parentCommentId）则继续挂在同 parent 下。
      const sourceCommentRow = await this.commentRepo.findOneBy({
        id: sourceComment.commentId,
      });
      const parentCommentId =
        sourceCommentRow?.parentCommentId ?? sourceComment.commentId;

      repliers.forEach((replier, index) => {
        const delay = 60_000 + Math.random() * 4 * 60_000 + index * 30_000; // 1-5min，错开
        setTimeout(() => {
          void (async () => {
            try {
              const fresh = await this.postRepo.findOneBy({ id: postId });
              if (!fresh || fresh.publishStatus !== 'published') return;
              const stillVisible = (
                await this.getVisibleCharacterIdSet(owner.id)
              ).has(replier.id);
              if (!stillVisible) return;

              // 防止同一 replier 对同一源评论生成多条回复（cron 触发 + 用户多次评论可能并发）。
              const alreadyReplied = await this.commentRepo.findOneBy({
                authorId: replier.id,
                replyToCommentId: sourceComment.commentId,
              });
              if (alreadyReplied) return;

              const profile = await this.characters.getProfile(replier.id);
              if (!profile) return;
              const observation = await this.buildFeedAiObservation(fresh);
              const isPostAuthor = replier.id === fresh.authorId;
              const userMessage =
                await this.worldLanguage.formatPostCommentReplyTask({
                  postAuthorName: fresh.authorName,
                  sourceCommenterName: sourceComment.authorName,
                  sourceCommentText: sourceComment.text,
                  summary: observation.summary,
                  isPostAuthor,
                });
              const reply = await this.ai.generateReply({
                profile,
                conversationHistory: [],
                userMessage,
                userMessageParts: observation.parts,
                usageContext: {
                  surface: 'app',
                  scene: 'feed_comment_generate',
                  scopeType: 'character',
                  scopeId: replier.id,
                  scopeLabel: replier.name,
                  characterId: replier.id,
                  characterName: replier.name,
                },
              });
              await this.addComment({
                postId,
                authorId: replier.id,
                authorName: replier.name,
                authorAvatar: replier.avatar,
                authorType: 'character',
                text: reply.text,
                parentCommentId,
                replyToCommentId: sourceComment.commentId,
                replyToAuthorId: sourceComment.authorId,
              });
              await this.postRepo.update(
                { id: postId },
                { aiReacted: true },
              );
            } catch {
              // ignore — 单角色失败不阻塞其它人
            }
          })();
        }, delay);
      });
    } catch (error) {
      this.logger.warn(
        `scheduleAiChannelsCommentReplies failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 广场 / 视频号版「NPC autonomy tick」。和朋友圈的 runNpcAutonomyTick 等价，但：
   *  - 同时覆盖 surface='feed' 和 'channels'（视频号也复用同一逻辑——
   *    旧 triggerAiReactionForPost 也是不分 surface 处理用户帖的）。
   *  - 候选池是「全部可见且未被屏蔽」的角色——广场/视频号是 public，不受 owner 好友圈限制。
   *  - 用户帖与角色帖都参与，使 NPC 可以互相点赞/评论形成正反馈。
   *  - 任何被 NPC 互动过的帖子会被回写 aiReacted=true，前端的「AI 已参与回应」标识依赖该字段。
   */
  async runFeedNpcAutonomyTick(): Promise<{
    summary: string;
    likeCount: number;
    commentCount: number;
  }> {
    const MAX_LLM_CALLS_PER_TICK = 30;
    const FREQ_MULTIPLIER: Record<string, number> = {
      high: 1.5,
      normal: 1.0,
      low: 0.5,
    };
    // 候选窗口扩到 7d；旧帖通过 npcPostRecencyMultiplier 在掷骰子层衰减/截断。
    const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const LIKE_BASE = 0.2;
    const COMMENT_BASE = 0.07;

    const now = new Date();
    const nowMs = now.getTime();
    const recentSince = new Date(nowMs - RECENT_WINDOW_MS);
    const hour = now.getHours();

    const blockedCharacterIds = new Set(
      await this.socialService.getBlockedCharacterIds(),
    );
    const candidates = (await this.characters.findAllVisibleToOwner()).filter(
      (char) => !blockedCharacterIds.has(char.id),
    );

    const activeCandidates = candidates.filter((char) => {
      const start = char.activeHoursStart ?? 8;
      const end = char.activeHoursEnd ?? 22;
      return hour >= start && hour <= end;
    });

    let llmCallsRemaining = MAX_LLM_CALLS_PER_TICK;
    let likeCount = 0;
    let commentCount = 0;
    let participantCount = 0;
    // 追踪被 NPC 触动过的帖子，结束时统一回写 aiReacted=true，
    // 让前端「AI 已参与回应」角标继续生效（对齐旧 triggerAiReactionForPost 的语义）。
    const reactedPostIds = new Set<string>();

    const recentPosts = await this.postRepo.find({
      where: {
        surface: In(['feed', 'channels']),
        publishStatus: 'published',
        createdAt: MoreThanOrEqual(recentSince),
      },
      order: { createdAt: 'DESC' },
    });
    if (recentPosts.length === 0) {
      return {
        summary: `process_pending_feed_reactions: 最近 7d 广场/视频号无帖子可巡查（候选 ${activeCandidates.length} 个）`,
        likeCount,
        commentCount,
      };
    }

    for (const char of activeCandidates) {
      const baseChance = char.proactiveBrowseChance ?? 0.1;
      const freqMul =
        FREQ_MULTIPLIER[char.activityFrequency ?? 'normal'] ?? 1.0;
      const browseChance = Math.min(0.5, baseChance * freqMul);
      if (Math.random() > browseChance) continue;

      participantCount += 1;

      const candidatePosts = recentPosts.filter(
        (post) => post.authorId !== char.id,
      );
      if (candidatePosts.length === 0) continue;

      // 跳过已经赞过的帖子，避免反复点赞同一条。
      const alreadyLiked = await this.likeRepo.find({
        where: {
          authorId: char.id,
          postId: In(candidatePosts.map((p) => p.id)),
        },
        select: ['postId'],
      });
      const likedIds = new Set(alreadyLiked.map((row) => row.postId));
      const fresh = candidatePosts.filter((post) => !likedIds.has(post.id));
      if (fresh.length === 0) continue;

      const scored = await Promise.all(
        fresh.map(async (post) => {
          let effectiveIntimacy: number;
          if (post.authorType === 'character') {
            const rel = await this.characterFriendships.getRelation(
              char.id,
              post.authorId,
            );
            effectiveIntimacy =
              rel.intimacy *
              npcRelationCoolingFactor(nowMs, rel.lastInteractedAt);
          } else {
            effectiveIntimacy = NPC_USER_POST_NEUTRAL_INTIMACY;
          }
          const recencyMul = npcPostRecencyMultiplier(
            nowMs,
            post.createdAt.getTime(),
          );
          const intimacyMul = npcIntimacyMultiplier(effectiveIntimacy);
          const engageMul = recencyMul * intimacyMul;
          const score =
            effectiveIntimacy / 50 + recencyMul + Math.random() * 0.3;
          return { post, score, engageMul };
        }),
      );
      scored.sort((a, b) => b.score - a.score);
      const TOP_K = 2;
      const top = scored.slice(0, TOP_K);

      for (const { post, engageMul } of top) {
        if (engageMul <= 0) continue; // 7d 硬截断 / 关系完全冷却
        if (Math.random() < LIKE_BASE * engageMul) {
          try {
            await this.toggleLike(
              post.id,
              char.id,
              char.name,
              char.avatar,
              'character',
            );
            // 把点赞时间打散到过去 0-60 秒，避免一拨点赞全卡 cron tick 整点。
            await this.likeRepo.update(
              { postId: post.id, authorId: char.id },
              { createdAt: this.jitterPastTimestamp(60_000) },
            );
            likeCount += 1;
            reactedPostIds.add(post.id);
            if (post.authorType === 'character') {
              await this.characterFriendships.bumpInteraction(
                char.id,
                post.authorId,
              );
            }
          } catch {
            // ignore
          }
        }

        if (llmCallsRemaining > 0 && Math.random() < COMMENT_BASE * engageMul) {
          try {
            const profile = await this.characters.getProfile(char.id);
            if (!profile) continue;
            const observation = await this.buildFeedAiObservation(post);
            const userMessage = await this.worldLanguage.formatPostCommentTask({
              authorName: post.authorName,
              summary: observation.summary,
              surface: post.surface === 'channels' ? 'channels' : 'feed',
            });
            const reply = await this.ai.generateReply({
              profile,
              conversationHistory: [],
              userMessage,
              userMessageParts: observation.parts,
              usageContext: {
                surface: 'app',
                scene: 'feed_comment_generate',
                scopeType: 'character',
                scopeId: char.id,
                scopeLabel: char.name,
                characterId: char.id,
                characterName: char.name,
              },
            });
            llmCallsRemaining -= 1;
            const savedComment = await this.addComment({
              postId: post.id,
              authorId: char.id,
              authorName: char.name,
              authorAvatar: char.avatar,
              authorType: 'character',
              text: reply.text,
            });
            await this.commentRepo.update(savedComment.id, {
              createdAt: this.jitterPastTimestamp(60_000),
            });
            commentCount += 1;
            reactedPostIds.add(post.id);
            if (post.authorType === 'character') {
              await this.characterFriendships.bumpInteraction(
                char.id,
                post.authorId,
              );
            }
          } catch {
            // ignore
          }
        }
      }
    }

    if (reactedPostIds.size > 0) {
      await this.postRepo.update(
        { id: In(Array.from(reactedPostIds)) },
        { aiReacted: true },
      );
    }

    return {
      summary: `process_pending_feed_reactions: ${participantCount} 个 NPC 上线，点赞 ${likeCount} 次，评论 ${commentCount} 次（剩余 LLM 配额 ${llmCallsRemaining}）`,
      likeCount,
      commentCount,
    };
  }

  /**
   * 角色主动把热门视频号帖子转发到好友（owner）的私聊里。
   *
   * 节流策略（业务上必须有，否则一上线就会被卡片刷屏）：
   *  - 每个 owner 每天最多收到 3 条角色主动转发
   *  - 同一角色 24h 内最多发 1 条
   *  - 角色不会重复转发自己曾经转过的帖子
   *
   * 候选帖：surface=channels, mediaType in (video,audio), 创建于 3d 内，
   * recommendationScore ≥ 50，且 isPostMediaPlayable 为真。
   *
   * LLM 配额：本 cron 单独限 6 次（短评生成）；超过 → 不再给 note 文案，仅卡片。
   */
  async runChannelProactiveForwardTick(): Promise<{
    summary: string;
    forwarded: number;
  }> {
    const MAX_FORWARDS_PER_OWNER_PER_DAY = 3;
    const MAX_LLM_CALLS_PER_TICK = 6;
    const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
    const RECOMMENDATION_THRESHOLD = 50;
    const BASE_BROWSE_CHANCE = 0.05;

    const nowMs = Date.now();
    const recentSince = new Date(nowMs - RECENT_WINDOW_MS);
    const dayWindowSince = new Date(nowMs - 24 * 60 * 60 * 1000);

    let owner;
    try {
      owner = await this.worldOwnerService.getOwnerOrThrow();
    } catch {
      return {
        summary: 'channel_proactive_forward: 无 owner 上下文，跳过',
        forwarded: 0,
      };
    }

    // 当日已收到的角色主动转发计数（用于全局上限）
    const recentForwards = await this.interactionRepo.find({
      where: {
        ownerId: owner.id,
        type: 'forward_to_chat',
        createdAt: MoreThanOrEqual(dayWindowSince),
      },
      select: ['id', 'postId', 'payload', 'createdAt'],
    });
    const sentByCharCount = new Map<string, number>();
    const characterForwardedPostIds = new Map<string, Set<string>>();
    // 跨角色去重：同一帖子 24h 内最多只被任一角色主动转发一次。
    // 否则 3 个角色都挑中同一爆款 → user 在 3 个不同私聊里收到同一卡片，刷屏。
    const postsForwardedToday = new Set<string>();
    let totalProactiveForwardsToday = 0;
    for (const row of recentForwards) {
      const payload = row.payload as
        | { viaActor?: string; viaActorType?: string }
        | null;
      const actor = payload?.viaActor;
      if (payload?.viaActorType !== 'character' || !actor) continue;
      totalProactiveForwardsToday += 1;
      sentByCharCount.set(actor, (sentByCharCount.get(actor) ?? 0) + 1);
      if (!characterForwardedPostIds.has(actor)) {
        characterForwardedPostIds.set(actor, new Set());
      }
      characterForwardedPostIds.get(actor)!.add(row.postId);
      postsForwardedToday.add(row.postId);
    }
    if (totalProactiveForwardsToday >= MAX_FORWARDS_PER_OWNER_PER_DAY) {
      return {
        summary: `channel_proactive_forward: owner 24h 内已收到 ${totalProactiveForwardsToday} 条转发，达到上限`,
        forwarded: 0,
      };
    }
    const remainingGlobalQuota =
      MAX_FORWARDS_PER_OWNER_PER_DAY - totalProactiveForwardsToday;

    // 候选帖
    const candidatePostsRaw = await this.postRepo.find({
      where: [
        {
          surface: 'channels',
          publishStatus: 'published',
          mediaType: 'video',
          createdAt: MoreThanOrEqual(recentSince),
        },
        {
          surface: 'channels',
          publishStatus: 'published',
          mediaType: 'audio',
          createdAt: MoreThanOrEqual(recentSince),
        },
      ],
      order: { recommendationScore: 'DESC', createdAt: 'DESC' },
    });
    const candidatePosts = candidatePostsRaw.filter(
      (post) =>
        (post.recommendationScore ?? 0) >= RECOMMENDATION_THRESHOLD &&
        this.isPostMediaPlayable(post),
    );
    if (candidatePosts.length === 0) {
      return {
        summary:
          'channel_proactive_forward: 近 3d 无符合阈值的可转发视频号帖，跳过',
        forwarded: 0,
      };
    }

    // 候选角色：与 owner 的角色好友（避免给陌生角色发）
    const friendCharacterIds = await this.socialService.getFriendCharacterIds(
      owner.id,
    );
    if (friendCharacterIds.length === 0) {
      return {
        summary: 'channel_proactive_forward: owner 还没有角色好友',
        forwarded: 0,
      };
    }
    const blockedSet = new Set(
      await this.socialService.getBlockedCharacterIds(owner.id),
    );
    const allCharacters = await this.characters.findAllVisibleToOwner(owner.id);
    const characterById = new Map(allCharacters.map((c) => [c.id, c]));
    const friendCharacters = friendCharacterIds
      .map((id) => characterById.get(id))
      .filter(
        (c): c is (typeof allCharacters)[number] =>
          Boolean(c) && !blockedSet.has(c!.id),
      );

    let llmCallsRemaining = MAX_LLM_CALLS_PER_TICK;
    let forwarded = 0;

    // 角色顺序随机化，避免每次都是同一个先发
    const shuffledFriends = [...friendCharacters].sort(
      () => Math.random() - 0.5,
    );

    for (const char of shuffledFriends) {
      if (forwarded >= remainingGlobalQuota) break;
      // 每角色每天 1 条
      if ((sentByCharCount.get(char.id) ?? 0) >= 1) continue;
      // 概率筛
      if (Math.random() > BASE_BROWSE_CHANCE) continue;

      // 该角色已经发过的帖子集合
      const alreadySentPosts =
        characterForwardedPostIds.get(char.id) ?? new Set<string>();

      // 给候选帖打分（亲密度 × 时效 + 推荐分），跳过已发过的、跳过自己当作者的、
      // 跳过 24h 内已被任意角色转过的（跨角色去重，避免同一帖子刷屏）
      const scored = await Promise.all(
        candidatePosts
          .filter(
            (post) =>
              post.authorId !== char.id &&
              !alreadySentPosts.has(post.id) &&
              !postsForwardedToday.has(post.id),
          )
          .map(async (post) => {
            let intimacy = NPC_USER_POST_NEUTRAL_INTIMACY;
            if (post.authorType === 'character') {
              const rel = await this.characterFriendships.getRelation(
                char.id,
                post.authorId,
              );
              intimacy =
                rel.intimacy *
                npcRelationCoolingFactor(nowMs, rel.lastInteractedAt);
            }
            const recencyMul = npcPostRecencyMultiplier(
              nowMs,
              post.createdAt.getTime(),
            );
            const intimacyMul = npcIntimacyMultiplier(intimacy);
            const score =
              (post.recommendationScore ?? 0) / 100 +
              intimacyMul +
              recencyMul +
              Math.random() * 0.1;
            return { post, score };
          }),
      );
      if (scored.length === 0) continue;
      scored.sort((a, b) => b.score - a.score);
      const pick = scored[0]?.post;
      if (!pick) continue;

      // 生成可选短评（≤ 24 字）
      let note: string | undefined;
      if (llmCallsRemaining > 0) {
        try {
          const profile = await this.characters.getProfile(char.id);
          if (profile) {
            const observation = await this.buildFeedAiObservation(pick);
            // 单独的 forward-quip 提示，避免和 formatPostCommentTask 的"评论一下"冲突。
            // 不通过 worldLanguage 是因为这是新 surface，目前还没本地化模板；
            // 中文一句话足够，AI 会按角色 persona 自然改写。
            const userMessage =
              `${pick.authorName} 在视频号发了：${observation.summary}。\n` +
              `用一句话简短地把它转给好友，像在微信里顺手说"看看这个"那样自然，` +
              `不要客套，不要解释，不要复述内容，≤ 24 字。`;
            const reply = await this.ai.generateReply({
              profile,
              conversationHistory: [],
              userMessage,
              userMessageParts: observation.parts,
              usageContext: {
                surface: 'app',
                scene: 'channel_forward_quip',
                scopeType: 'character',
                scopeId: char.id,
                scopeLabel: char.name,
                characterId: char.id,
                characterName: char.name,
              },
            });
            llmCallsRemaining -= 1;
            const trimmed = sanitizeForwardQuip(reply.text);
            if (trimmed) note = trimmed;
          }
        } catch {
          // ignore — note 是可选的，没有就纯卡片
        }
      }

      try {
        await this.forwardChannelPostToChat({
          actorType: 'character',
          actorId: char.id,
          actorName: char.name,
          actorAvatar: char.avatar,
          postId: pick.id,
          targetCharacterId: char.id,
          note,
        });
        forwarded += 1;
        sentByCharCount.set(char.id, (sentByCharCount.get(char.id) ?? 0) + 1);
        const seen =
          characterForwardedPostIds.get(char.id) ?? new Set<string>();
        seen.add(pick.id);
        characterForwardedPostIds.set(char.id, seen);
        // 同 tick 内后续角色不再选这条
        postsForwardedToday.add(pick.id);
      } catch (error) {
        this.logger.warn(
          `runChannelProactiveForwardTick: forward failed for char=${char.id} post=${pick.id}: ${(error as Error).message}`,
        );
      }
    }

    return {
      summary: `channel_proactive_forward: 投递 ${forwarded} 条角色主动转发（剩余配额 ${remainingGlobalQuota - forwarded}/${MAX_FORWARDS_PER_OWNER_PER_DAY}，本次 LLM 用量 ${MAX_LLM_CALLS_PER_TICK - llmCallsRemaining}）`,
      forwarded,
    };
  }

  async ensureChannelSeedData() {
    // 视频号已切换到 MiniMax 真实生成；冷启不再用 demo 占位（用户决策：失败时跳过）。
    // 留空方法保持调用点向后兼容。
  }

  async topUpChannelsIfNeeded(_targetCount = 6) {
    // 真实视频依赖 MiniMax Token Plan 配额（4 次/日全局），不再做用户访问期填充。
    // 视频号产出由 scheduler 的 channels cron 按角色频率推动。
    void _targetCount;
  }

  private async buildCommentsPreviewMap(
    postIds: string[],
    ownerId: string,
    avatarContext?: FeedAvatarContext,
  ) {
    if (!postIds.length) {
      return new Map<string, ReturnType<FeedService['serializeComment']>[]>();
    }

    const comments = await this.commentRepo.find({
      where: { postId: In(postIds), status: 'published' },
      order: { createdAt: 'ASC' },
    });
    const likedCommentIds = await this.buildLikedCommentIdSet(
      comments.map((comment) => comment.id),
      ownerId,
    );
    const commentMap = new Map<
      string,
      ReturnType<FeedService['serializeComment']>[]
    >();

    for (const comment of comments) {
      const currentComments = commentMap.get(comment.postId) ?? [];
      currentComments.push(
        this.serializeComment(
          comment,
          likedCommentIds.has(comment.id),
          avatarContext,
        ),
      );
      commentMap.set(comment.postId, currentComments.slice(-3));
    }

    return commentMap;
  }

  private async buildOwnerStateMap(posts: FeedPostEntity[], ownerId: string) {
    const stateMap = new Map<string, FeedOwnerState>();
    const postIds = posts.map((post) => post.id);
    const authorIds = unique(posts.map((post) => post.authorId));

    if (!postIds.length) {
      return stateMap;
    }

    const [interactions, follows] = await Promise.all([
      this.interactionRepo.find({
        where: { ownerId, postId: In(postIds) },
      }),
      authorIds.length
        ? this.followRepo.find({
            where: { ownerId, authorId: In(authorIds) },
          })
        : Promise.resolve([]),
    ]);

    const followedAuthorIds = new Set(follows.map((follow) => follow.authorId));

    for (const post of posts) {
      stateMap.set(post.id, {
        hasLiked: false,
        hasFavorited: false,
        isFollowingAuthor: followedAuthorIds.has(post.authorId),
        isNotInterested: false,
        hasViewed: false,
        hasShared: false,
        lastViewedAt: null,
        watchProgressSeconds: null,
        completed: false,
      });
    }

    for (const interaction of interactions) {
      const current = stateMap.get(interaction.postId);
      if (!current) {
        continue;
      }

      switch (interaction.type) {
        case 'like':
          current.hasLiked = true;
          break;
        case 'favorite':
          current.hasFavorited = true;
          break;
        case 'share':
          current.hasShared = true;
          break;
        case 'not_interested':
          current.isNotInterested = true;
          break;
        case 'view':
          current.hasViewed = true;
          current.lastViewedAt = interaction.updatedAt.toISOString();
          current.watchProgressSeconds =
            typeof interaction.payload?.progressSeconds === 'number'
              ? Number(interaction.payload.progressSeconds)
              : null;
          current.completed = Boolean(interaction.payload?.completed);
          break;
        default:
          break;
      }
    }

    return stateMap;
  }

  private async buildLikedCommentIdSet(commentIds: string[], ownerId: string) {
    if (!commentIds.length) {
      return new Set<string>();
    }

    const interactions = await this.interactionRepo.find({
      where: { ownerId, type: 'comment_like' },
    });

    return new Set(
      interactions
        .map((item) => String(item.payload?.commentId ?? '').trim())
        .filter((item) => item && commentIds.includes(item)),
    );
  }

  private async buildChannelAuthorSummaries(
    posts: FeedPostEntity[],
    ownerId: string,
    avatarContext?: FeedAvatarContext,
  ) {
    const followedAuthorIds = new Set(
      (
        await this.followRepo.find({
          where: { ownerId },
        })
      ).map((item) => item.authorId),
    );
    const followerMap = new Map<string, number>();
    const authorIds = unique(posts.map((post) => post.authorId));

    if (authorIds.length > 0) {
      const follows = await this.followRepo.find({
        where: { authorId: In(authorIds) },
      });
      for (const follow of follows) {
        followerMap.set(
          follow.authorId,
          (followerMap.get(follow.authorId) ?? 0) + 1,
        );
      }
    }

    const authorMap = new Map<
      string,
      {
        authorAvatar: string;
        authorName: string;
        authorType: string;
        latestCreatedAt: Date;
        postCount: number;
      }
    >();

    for (const post of posts) {
      const existing = authorMap.get(post.authorId);
      if (existing) {
        existing.postCount += 1;
        if (existing.latestCreatedAt < post.createdAt) {
          existing.latestCreatedAt = post.createdAt;
        }
        continue;
      }

      authorMap.set(post.authorId, {
        authorAvatar:
          avatarContext === undefined
            ? post.authorAvatar
            : this.resolveFeedAuthorAvatar(
                post.authorType,
                post.authorId,
                post.authorAvatar,
                avatarContext,
              ),
        authorName: post.authorName,
        authorType: post.authorType,
        latestCreatedAt: post.createdAt,
        postCount: 1,
      });
    }

    return Array.from(authorMap.entries())
      .map(([authorId, value]) => ({
        authorId,
        authorName: value.authorName,
        authorAvatar: value.authorAvatar,
        authorType: value.authorType,
        followerCount: followerMap.get(authorId) ?? 0,
        postCount: value.postCount,
        isFollowing: followedAuthorIds.has(authorId),
        latestCreatedAt: value.latestCreatedAt.toISOString(),
      }))
      .sort((left, right) =>
        right.latestCreatedAt.localeCompare(left.latestCreatedAt),
      )
      .slice(0, 12);
  }

  private async buildLiveEntries(
    posts: FeedPostEntity[],
    avatarContext?: FeedAvatarContext,
  ) {
    return posts
      .filter(
        (post) =>
          post.sourceKind === 'live_clip' ||
          (post.topicTags ?? []).some((tag) => tag.includes('直播')),
      )
      .slice(0, 6)
      .map((post) => ({
        id: `live-${post.id}`,
        postId: post.id,
        title: post.title?.trim() || `${post.authorName} 的视频号直播`,
        authorId: post.authorId,
        authorName: post.authorName,
        authorAvatar:
          avatarContext === undefined
            ? post.authorAvatar
            : this.resolveFeedAuthorAvatar(
                post.authorType,
                post.authorId,
                post.authorAvatar,
                avatarContext,
              ),
        startedAt: post.createdAt.toISOString(),
        status: 'replay' as const,
        coverUrl: post.coverUrl ?? null,
      }));
  }

  private async buildChannelSectionCounts(
    posts: FeedPostEntity[],
    ownerId: string,
  ): Promise<Record<FeedChannelHomeSection, number>> {
    const [followedAuthorIds, friendCharacterIds] = await Promise.all([
      this.followRepo
        .find({ where: { ownerId } })
        .then((rows) => new Set(rows.map((row) => row.authorId))),
      this.socialService
        .getFriendCharacterIds(ownerId)
        .then((ids) => new Set(ids)),
    ]);

    return {
      recommended: posts.length,
      friends: posts.filter((post) => friendCharacterIds.has(post.authorId))
        .length,
      following: posts.filter((post) => followedAuthorIds.has(post.authorId))
        .length,
      live: posts.filter(
        (post) =>
          post.sourceKind === 'live_clip' ||
          (post.topicTags ?? []).some((tag) => tag.includes('直播')),
      ).length,
    };
  }

  // 视频号死链/无 URL 的视频/音频帖直接不展示。
  // 文本/图片帖不在本规则管辖范围（用户决策：只隐藏死链/无 URL 的视频音频帖）。
  private isPostMediaPlayable(post: FeedPostEntity): boolean {
    if (post.mediaType !== 'video' && post.mediaType !== 'audio') return true;

    const urls: string[] = [];
    try {
      const arr = JSON.parse(post.mediaPayload ?? '[]') as Array<{
        kind?: string;
        url?: string;
      }>;
      for (const a of Array.isArray(arr) ? arr : []) {
        if (
          a?.kind === post.mediaType &&
          typeof a.url === 'string' &&
          a.url.trim()
        ) {
          urls.push(a.url.trim());
        }
      }
    } catch {
      /* malformed payload — fall through to legacy mediaUrl */
    }
    if (post.mediaUrl?.trim()) urls.push(post.mediaUrl.trim());
    if (urls.length === 0) return false;

    return urls.some((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return true;
      if (url.startsWith('/api/moments/media/')) {
        // 去掉 ?token=...# 之类后缀，再 basename 防 ../traversal
        const cleanPath = url.split('?')[0].split('#')[0];
        const rawName = cleanPath.slice('/api/moments/media/'.length);
        const fileName = path.basename(rawName).trim();
        if (!fileName) return false;
        return existsSync(resolveReadableMomentMediaPath(fileName));
      }
      try {
        const host = new URL(url).hostname.toLowerCase();
        return !FEED_DEAD_MEDIA_HOSTS.has(host);
      } catch {
        return false;
      }
    });
  }

  // 启动时把死链/无 URL 的视频号视频/音频帖批量标 hidden，避免每次请求重算。
  // 重复跑无副作用：已经 hidden 的不会再次匹配 publishStatus='published' 条件。
  private async cleanupBrokenChannelPosts() {
    try {
      const candidates = await this.postRepo.find({
        where: [
          {
            surface: 'channels',
            publishStatus: 'published',
            mediaType: 'video',
          },
          {
            surface: 'channels',
            publishStatus: 'published',
            mediaType: 'audio',
          },
        ],
      });
      const broken = candidates.filter(
        (post) => !this.isPostMediaPlayable(post),
      );
      if (broken.length === 0) return;
      await this.postRepo.update(
        { id: In(broken.map((post) => post.id)) },
        { publishStatus: 'hidden' },
      );
      this.logger.log(
        `cleanupBrokenChannelPosts: hid ${broken.length} channels post(s) without playable media`,
      );
    } catch (error) {
      this.logger.warn(
        `cleanupBrokenChannelPosts failed: ${(error as Error).message}`,
      );
    }
  }

  // 切 MiniMax 真生成（17ee2503，May 9）之前，视频号有一段 demo 兜底期：
  // ensureChannelSeedData / topUp 会把 3 个本地视频文件 + placehold.co 占位封面
  // 套到所有可见角色身上，结果每个老账号库都囤着 46 条「Paul Graham/张雪峰/...
  // 一个接一个发同一支《晨光海岸》」的假数据，用户在 视频号 里反复滑到同样的
  // 3 支片子，体感就是「全是不能看的东西」。这些帖的文件实际存在能播放（所以
  // cleanupBrokenChannelPosts 不会管它），但内容上就是 demo 污染。这里直接
  // 硬 DELETE：feed_posts 本体 + 子表 feed_comments / feed_post_likes /
  // user_feed_interactions 一起清掉；不动 mediaType=audio 真音乐贴（封面要么是
  // 真 jpg 要么干脆没封面，不会命中）。重复执行无副作用。
  //
  // 识别条件（任一即认定为 demo）：
  // 1. coverUrl 指向 placehold.co（早期占位封面）
  // 2. mediaUrl 指向 3 个已知 legacy 视频文件之一（一份 demo 被多角色复用）
  private async cleanupLegacyDemoChannelPosts() {
    try {
      const candidates = await this.postRepo
        .createQueryBuilder('post')
        .where('post.surface = :surface', { surface: 'channels' })
        .andWhere(
          "(post.coverUrl LIKE '%placehold.co%' OR post.mediaUrl LIKE '%/1778311410821-a746c78f-minimax-video.mp4%' OR post.mediaUrl LIKE '%/1778311950732-f23b70af-minimax-video.mp4%' OR post.mediaUrl LIKE '%/1778311207586-814b332b-minimax-video.mp4%')",
        )
        .getMany();
      if (candidates.length === 0) return;

      const ids = candidates.map((post) => post.id);
      await this.commentRepo.delete({ postId: In(ids) });
      await this.likeRepo.delete({ postId: In(ids) });
      await this.interactionRepo.delete({ postId: In(ids) });
      await this.postRepo.delete({ id: In(ids) });
      this.logger.log(
        `cleanupLegacyDemoChannelPosts: deleted ${ids.length} demo-era channels post(s) + child rows`,
      );
    } catch (error) {
      this.logger.warn(
        `cleanupLegacyDemoChannelPosts failed: ${(error as Error).message}`,
      );
    }
  }

  private async getVisibleFeedPosts(surface: FeedSurface, ownerId: string) {
    const posts = await this.postRepo.find({
      where: { surface, publishStatus: 'published' },
      order:
        surface === 'channels'
          ? { recommendationScore: 'DESC', createdAt: 'DESC' }
          : { createdAt: 'DESC' },
    });
    const [visibleCharacterIds, ownerFriendIds] = await Promise.all([
      this.getVisibleCharacterIdSet(ownerId),
      this.characters.getActiveFriendCharacterIdSet(ownerId),
    ]);
    return posts.filter((post) => {
      if (post.authorType !== 'character') return true;
      if (!visibleCharacterIds.has(post.authorId)) return false;
      if (post.visibility === 'private') return false;
      // 视频号过滤：视频/音频帖必须有可播放 URL（本地文件存在或非死链外站）。
      if (surface === 'channels' && !this.isPostMediaPlayable(post)) {
        return false;
      }
      // 广场（surface='feed'）公开可见：所有非屏蔽角色都展示，无论是否好友；
      // 视频号（surface='channels'）保留 friends 仅好友可见的语义。
      if (surface === 'feed') {
        return true;
      }
      if (post.visibility === 'friends') {
        return ownerFriendIds.has(post.authorId);
      }
      return true;
    });
  }

  /**
   * 广场专用 SQL 分页路径：把 visibility 过滤下推到 WHERE 子句，避免拉全表后再内存过滤。
   * 仅供 surface='feed'（广场动态）使用——视频号（'channels'）还要叠 blocked/not_interested/section
   * 等过滤，逻辑更复杂，保留旧的 getVisibleChannelPosts。
   */
  private async findVisibleFeedPostsPaged(
    ownerId: string,
    page: number,
    limit: number,
  ): Promise<{ posts: FeedPostEntity[]; total: number }> {
    const visibleCharacterIds = await this.getVisibleCharacterIdSet(ownerId);
    const visibleIds = Array.from(visibleCharacterIds);

    const qb = this.postRepo
      .createQueryBuilder('post')
      .where('post.surface = :surface', { surface: 'feed' })
      .andWhere('post.publishStatus = :status', { status: 'published' });

    if (visibleIds.length === 0) {
      qb.andWhere("post.authorType <> 'character'");
    } else {
      qb.andWhere(
        "(post.authorType <> 'character' OR (post.authorId IN (:...visibleIds) AND post.visibility <> 'private'))",
        { visibleIds },
      );
    }

    qb.orderBy('post.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [posts, total] = await qb.getManyAndCount();
    return { posts, total };
  }

  private async getVisibleChannelPosts(
    ownerId: string,
    section: FeedChannelHomeSection,
  ) {
    const [
      posts,
      blockedCharacterIds,
      notInterestedPostIds,
      followedAuthorIds,
      friendIds,
    ] = await Promise.all([
      this.getVisibleFeedPosts('channels', ownerId),
      this.socialService
        .getBlockedCharacterIds(ownerId)
        .then((ids) => new Set(ids)),
      this.interactionRepo
        .find({ where: { ownerId, type: 'not_interested' } })
        .then((items) => new Set(items.map((item) => item.postId))),
      this.followRepo
        .find({ where: { ownerId } })
        .then((items) => new Set(items.map((item) => item.authorId))),
      this.socialService
        .getFriendCharacterIds(ownerId)
        .then((ids) => new Set(ids)),
    ]);

    return posts.filter((post) => {
      if (
        post.authorType === 'character' &&
        blockedCharacterIds.has(post.authorId)
      ) {
        return false;
      }
      if (notInterestedPostIds.has(post.id)) {
        return false;
      }
      if (section === 'friends') {
        return friendIds.has(post.authorId);
      }
      if (section === 'following') {
        return followedAuthorIds.has(post.authorId);
      }
      if (section === 'live') {
        return (
          post.sourceKind === 'live_clip' ||
          (post.topicTags ?? []).some((tag) => tag.includes('直播'))
        );
      }
      return true;
    });
  }

  private async getVisibleCharacterIdSet(ownerId: string) {
    const characters = await this.characters.findAllVisibleToOwner(ownerId);
    return new Set(characters.map((item) => item.id));
  }

  private async resolveChannelAuthor(authorId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const latestPost = await this.postRepo.findOne({
      where: { authorId, surface: 'channels', publishStatus: 'published' },
      order: { createdAt: 'DESC' },
    });

    if (latestPost) {
      const character =
        latestPost.authorType === 'character'
          ? await this.characters.findById(latestPost.authorId)
          : null;
      return {
        authorId: latestPost.authorId,
        authorName: latestPost.authorName,
        authorAvatar:
          character?.avatar ??
          (latestPost.authorId === owner.id && owner.avatar
            ? owner.avatar
            : latestPost.authorAvatar),
        authorType: latestPost.authorType,
      };
    }

    const character = await this.characters.findById(authorId);
    if (character) {
      return {
        authorId: character.id,
        authorName: character.name,
        authorAvatar: character.avatar,
        authorType: 'character',
      };
    }

    if (owner.id === authorId) {
      return {
        authorId: owner.id,
        authorName: owner.username?.trim() || 'You',
        authorAvatar: owner.avatar ?? '',
        authorType: 'user',
      };
    }

    throw new AppError('FEED_CHANNEL_AUTHOR_NOT_FOUND', {
      status: HttpStatus.NOT_FOUND,
      legacyMessage: 'Channel author not found',
    });
  }

  private async resolveAuthorBio(authorId: string, authorType: string) {
    if (authorType === 'character') {
      const character = await this.characters.findById(authorId);
      return character?.bio ?? null;
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    if (owner.id === authorId) {
      return owner.signature?.trim() || null;
    }

    return null;
  }

  private normalizeCreatePostInput(input: {
    text: string;
    title?: string;
    media?: MomentMediaAsset[];
    mediaType?: FeedMediaType;
    mediaUrl?: string;
    coverUrl?: string | null;
    durationMs?: number;
    aspectRatio?: number;
    publishStatus?: 'draft' | 'published' | 'hidden' | 'deleted';
  }) {
    const text = input.text.trim();
    const explicitMedia = this.normalizeFeedMediaInput(input.media);
    const media =
      explicitMedia.length > 0
        ? explicitMedia
        : this.buildFeedMediaFromLegacyInput(input);
    const mediaType = this.inferFeedMediaType(media, input.mediaType);

    if (!text && media.length === 0 && input.publishStatus !== 'draft') {
      throw new AppError('FEED_EMPTY', {
        legacyMessage: '动态内容和媒体不能同时为空。',
      });
    }

    if (input.publishStatus !== 'draft') {
      this.assertFeedMediaMatchesMediaType(mediaType, media);
    }
    const primaryMedia = media[0];

    return {
      text,
      title: input.title?.trim() || null,
      media,
      mediaType,
      mediaUrl: primaryMedia?.url || undefined,
      coverUrl:
        primaryMedia?.kind === 'video'
          ? (primaryMedia.posterUrl ?? null)
          : primaryMedia?.kind === 'image'
            ? (primaryMedia.thumbnailUrl ?? primaryMedia.url)
            : null,
      durationMs:
        primaryMedia?.kind === 'video'
          ? (primaryMedia.durationMs ?? null)
          : null,
      aspectRatio:
        resolveFeedMediaAspectRatio(primaryMedia) ??
        normalizeOptionalPositiveFloat(input.aspectRatio) ??
        null,
    };
  }

  private normalizeFeedMediaInput(input: MomentMediaAsset[] | undefined) {
    if (!Array.isArray(input) || input.length === 0) {
      return [];
    }

    return input
      .map((asset, index) => normalizeFeedMediaAsset(asset, index))
      .filter((asset) => asset.url);
  }

  private buildFeedMediaFromLegacyInput(input: {
    mediaType?: FeedMediaType;
    mediaUrl?: string;
    coverUrl?: string | null;
    durationMs?: number;
    aspectRatio?: number;
  }): MomentMediaAsset[] {
    const mediaUrl = input.mediaUrl?.trim();
    if (!mediaUrl) {
      return [];
    }

    const legacyMediaType =
      input.mediaType === 'video' ||
      input.mediaType === 'image' ||
      input.mediaType === 'audio'
        ? input.mediaType
        : 'image';
    const approximateDimensions = buildApproximateFeedMediaDimensions(
      input.aspectRatio,
    );

    if (legacyMediaType === 'audio') {
      return [
        {
          id: 'feed-audio-legacy',
          kind: 'audio',
          url: mediaUrl,
          posterUrl: input.coverUrl?.trim() || undefined,
          mimeType: 'audio/mpeg',
          fileName: 'feed-audio',
          size: 0,
          durationMs: normalizeOptionalPositiveInteger(input.durationMs),
        },
      ];
    }

    if (legacyMediaType === 'video') {
      return [
        {
          id: 'feed-video-legacy',
          kind: 'video',
          url: mediaUrl,
          posterUrl: input.coverUrl?.trim() || undefined,
          mimeType: 'video/mp4',
          fileName: 'feed-video',
          size: 0,
          width: approximateDimensions?.width,
          height: approximateDimensions?.height,
          durationMs: normalizeOptionalPositiveInteger(input.durationMs),
        },
      ];
    }

    return [
      {
        id: 'feed-image-legacy',
        kind: 'image',
        url: mediaUrl,
        thumbnailUrl: input.coverUrl?.trim() || mediaUrl,
        mimeType: 'image/jpeg',
        fileName: 'feed-image',
        size: 0,
        width: approximateDimensions?.width,
        height: approximateDimensions?.height,
      },
    ];
  }

  private inferFeedMediaType(
    media: MomentMediaAsset[],
    fallback?: FeedMediaType,
  ): FeedMediaType {
    if (media[0]?.kind === 'audio') {
      return 'audio';
    }
    if (media[0]?.kind === 'video') {
      return 'video';
    }

    if (media.length > 0) {
      return 'image';
    }

    if (
      fallback === 'image' ||
      fallback === 'video' ||
      fallback === 'audio'
    ) {
      return fallback;
    }
    return 'text';
  }

  private assertFeedMediaMatchesMediaType(
    mediaType: FeedMediaType,
    media: MomentMediaAsset[],
  ) {
    if (mediaType === 'text') {
      if (media.length > 0) {
        throw new AppError('FEED_TEXT_NO_MEDIA', {
          legacyMessage: '纯文本动态不能附带图片或视频。',
        });
      }
      return;
    }

    if (mediaType === 'video') {
      if (media.length !== 1 || media[0]?.kind !== 'video') {
        throw new AppError('FEED_VIDEO_SINGLE', {
          legacyMessage: '视频动态必须且只能包含 1 条视频。',
        });
      }

      const video = media[0] as MomentVideoAsset;
      if (video.durationMs && video.durationMs > MAX_FEED_VIDEO_DURATION_MS) {
        throw new AppError('FEED_VIDEO_TOO_LONG', {
          legacyMessage: '视频时长不能超过 5 分钟。',
        });
      }
      return;
    }

    if (mediaType === 'audio') {
      if (media.length !== 1 || media[0]?.kind !== 'audio') {
        throw new AppError('FEED_AUDIO_SINGLE', {
          legacyMessage: '音频动态必须且只能包含 1 条音频。',
        });
      }
      return;
    }

    if (media.length < 1 || media.length > MAX_FEED_IMAGE_COUNT) {
      throw new AppError('FEED_IMAGES_MAX', {
        params: { max: MAX_FEED_IMAGE_COUNT },
        legacyMessage: `图片动态最多支持 ${MAX_FEED_IMAGE_COUNT} 张图片。`,
      });
    }

    if (media.some((asset) => asset.kind !== 'image')) {
      throw new AppError('FEED_IMAGES_TYPE_ONLY', {
        legacyMessage: '图片动态当前只支持图片资源。',
      });
    }
  }

  private serializeFeedMedia(media: MomentMediaAsset[]) {
    return media.length ? JSON.stringify(media) : undefined;
  }

  private parseFeedMediaPayload(payload?: string | null): MomentMediaAsset[] {
    if (!payload?.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(payload);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((asset, index) =>
          normalizeFeedMediaAsset(asset as MomentMediaAsset, index),
        )
        .filter((asset) => asset.url);
    } catch {
      return [];
    }
  }

  private resolveFeedPostMedia(post: FeedPostEntity) {
    const media = this.parseFeedMediaPayload(post.mediaPayload);
    if (media.length > 0) {
      return media;
    }

    return this.buildFeedMediaFromLegacyInput({
      mediaType: post.mediaType as FeedMediaType,
      mediaUrl: post.mediaUrl,
      coverUrl: post.coverUrl,
      durationMs: post.durationMs ?? undefined,
      aspectRatio: post.aspectRatio ?? undefined,
    });
  }

  private async buildFeedAiObservation(post: FeedPostEntity): Promise<{
    summary: string;
    parts?: AiMessagePart[];
  }> {
    const media = this.resolveFeedPostMedia(post);
    const parts: AiMessagePart[] = [];
    const mediaType = this.inferFeedMediaType(
      media,
      post.mediaType as FeedMediaType,
    );
    const baseSummary = `标题：${post.title?.trim() || '未命名'}；正文：${post.text?.trim() || '无正文'}；媒体：${this.describeFeedMediaForAi(media, mediaType)}`;

    media
      .filter((asset): asset is MomentImageAsset => asset.kind === 'image')
      .slice(0, 4)
      .forEach((asset, index) => {
        parts.push({
          type: 'image',
          imageUrl: asset.url,
          mimeType: asset.mimeType,
          detail: 'auto',
          altText: `${post.surface === 'channels' ? '视频号' : '广场动态'}配图 ${index + 1}`,
        });
      });

    const primaryMedia = media[0];
    if (primaryMedia?.kind === 'video' && primaryMedia.posterUrl) {
      parts.push({
        type: 'image',
        imageUrl: primaryMedia.posterUrl,
        detail: 'auto',
        altText: `${post.surface === 'channels' ? '视频号' : '广场动态'}视频封面`,
      });
    }

    const transcription =
      primaryMedia?.kind === 'video'
        ? await this.ai.tryTranscribeMediaFromUrl({
            url: primaryMedia.url,
            mimeType: primaryMedia.mimeType,
            fileName: primaryMedia.fileName,
            characterId:
              post.authorType === 'character' ? post.authorId : undefined,
            mode: 'feed_media',
          })
        : null;

    return {
      summary: transcription?.text
        ? `${baseSummary}；视频音轨转写：${transcription.text}`
        : baseSummary,
      parts: parts.length ? parts : undefined,
    };
  }

  private describeFeedMediaForAi(
    media: MomentMediaAsset[],
    mediaType: FeedMediaType,
  ) {
    if (!media.length) {
      return '无媒体';
    }

    if (mediaType === 'video') {
      const video = media[0] as MomentVideoAsset | undefined;
      if (!video) {
        return '1 条视频';
      }

      return video.durationMs
        ? `1 条时长约 ${Math.round(video.durationMs / 1000)} 秒的视频`
        : '1 条视频';
    }

    const imageCount = media.filter((asset) => asset.kind === 'image').length;
    return `${imageCount} 张图片`;
  }

  private canOwnerInteractWithFeedPost(
    post: FeedPostEntity,
    avatarContext?: FeedAvatarContext,
  ): boolean {
    if (post.authorType !== 'character') return true;
    // 广场（surface='feed'）所有人都能互动；视频号仍保留好友限制。
    if (post.surface === 'feed') return true;
    if (!avatarContext) return false;
    return avatarContext.ownerFriendCharacterIds.has(post.authorId);
  }

  private serializePost(
    post: FeedPostEntity,
    ownerState?: FeedOwnerState,
    avatarContext?: FeedAvatarContext,
  ) {
    const media = this.resolveFeedPostMedia(post);
    const primaryMedia = media[0];

    return {
      id: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      authorAvatar:
        avatarContext === undefined
          ? post.authorAvatar
          : this.resolveFeedAuthorAvatar(
              post.authorType,
              post.authorId,
              post.authorAvatar,
              avatarContext,
            ),
      authorType: post.authorType as 'user' | 'character',
      visibility: (post.visibility ?? 'public') as
        | 'public'
        | 'friends'
        | 'private',
      canInteract: this.canOwnerInteractWithFeedPost(post, avatarContext),
      surface: post.surface as FeedSurface,
      text: post.text,
      title: post.title ?? null,
      media,
      mediaUrl: post.mediaUrl ?? primaryMedia?.url,
      coverUrl:
        post.coverUrl ??
        (primaryMedia?.kind === 'video'
          ? (primaryMedia.posterUrl ?? null)
          : primaryMedia?.kind === 'image'
            ? (primaryMedia.thumbnailUrl ?? primaryMedia.url)
            : null) ??
        null,
      mediaType: this.inferFeedMediaType(
        media,
        post.mediaType as FeedMediaType,
      ),
      durationMs:
        post.durationMs ??
        (primaryMedia?.kind === 'video'
          ? (primaryMedia.durationMs ?? null)
          : null),
      aspectRatio:
        post.aspectRatio ?? resolveFeedMediaAspectRatio(primaryMedia) ?? null,
      topicTags: post.topicTags ?? [],
      publishStatus: post.publishStatus as
        | 'draft'
        | 'published'
        | 'hidden'
        | 'deleted',
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      shareCount: post.shareCount,
      favoriteCount: post.favoriteCount,
      viewCount: post.viewCount,
      watchCount: post.watchCount,
      completeCount: post.completeCount,
      aiReacted: post.aiReacted,
      sourceKind: post.sourceKind as
        | 'seed'
        | 'ai_generated'
        | 'owner_upload'
        | 'character_generated'
        | 'live_clip',
      recommendationScore: post.recommendationScore,
      statsPayload: post.statsPayload ?? null,
      ownerState: ownerState
        ? {
            ...ownerState,
          }
        : undefined,
      createdAt: post.createdAt.toISOString(),
    };
  }

  private serializeComment(
    comment: FeedCommentEntity,
    likedByOwner: boolean,
    avatarContext?: FeedAvatarContext,
  ) {
    return {
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      authorName: comment.authorName,
      authorAvatar:
        avatarContext === undefined
          ? comment.authorAvatar
          : this.resolveFeedAuthorAvatar(
              comment.authorType,
              comment.authorId,
              comment.authorAvatar,
              avatarContext,
            ),
      authorType: comment.authorType as 'user' | 'character',
      text: comment.text,
      parentCommentId: comment.parentCommentId ?? null,
      replyToCommentId: comment.replyToCommentId ?? null,
      replyToAuthorId: comment.replyToAuthorId ?? null,
      likeCount: comment.likeCount,
      status: comment.status as 'published' | 'hidden' | 'deleted',
      likedByOwner,
      createdAt: comment.createdAt.toISOString(),
    };
  }

  private async buildFeedAvatarContext(input?: {
    ownerId?: string;
    ownerAvatar?: string | null;
  }): Promise<FeedAvatarContext> {
    const owner =
      input?.ownerId === undefined
        ? await this.worldOwnerService.getOwnerOrThrow()
        : {
            id: input.ownerId,
            avatar: input.ownerAvatar ?? '',
          };
    const [visibleCharacters, ownerFriendCharacterIds] = await Promise.all([
      this.characters.findAllVisibleToOwner(owner.id),
      this.characters.getActiveFriendCharacterIdSet(owner.id),
    ]);

    return {
      ownerAvatar: owner.avatar?.trim() || '',
      ownerId: owner.id,
      visibleCharacterIds: new Set(
        visibleCharacters.map((character) => character.id),
      ),
      ownerFriendCharacterIds,
      characterAvatarById: new Map(
        visibleCharacters.map((character) => [character.id, character.avatar]),
      ),
    };
  }

  private resolveFeedAuthorAvatar(
    authorType: string | null | undefined,
    authorId: string | null | undefined,
    currentAvatar: string | null | undefined,
    avatarContext: FeedAvatarContext,
  ) {
    if (authorType === 'character' && authorId) {
      return (
        avatarContext.characterAvatarById.get(authorId) ?? currentAvatar ?? ''
      );
    }

    if (
      authorType === 'user' &&
      authorId === avatarContext.ownerId &&
      avatarContext.ownerAvatar
    ) {
      return avatarContext.ownerAvatar;
    }

    return currentAvatar ?? '';
  }

  private async backfillFeedAuthorAvatars() {
    const [owner, characters, posts, comments] = await Promise.all([
      this.worldOwnerService.getOwnerOrThrow(),
      this.characters.findAll(),
      this.postRepo.find(),
      this.commentRepo.find(),
    ]);
    const characterAvatarById = new Map(
      characters.map((character) => [character.id, character.avatar]),
    );
    const ownerAvatar = owner.avatar?.trim() || '';

    const resolveAvatar = (
      authorType: string | null | undefined,
      authorId: string | null | undefined,
      currentAvatar: string | null | undefined,
    ) => {
      if (authorType === 'character' && authorId) {
        return characterAvatarById.get(authorId) ?? currentAvatar ?? '';
      }

      if (authorType === 'user' && authorId === owner.id && ownerAvatar) {
        return ownerAvatar;
      }

      return currentAvatar ?? '';
    };

    const pendingPostUpdates = posts.reduce<FeedPostEntity[]>(
      (updates, post) => {
        const nextAvatar = resolveAvatar(
          post.authorType,
          post.authorId,
          post.authorAvatar,
        );
        if (nextAvatar && nextAvatar !== post.authorAvatar) {
          updates.push({ ...post, authorAvatar: nextAvatar });
        }
        return updates;
      },
      [],
    );
    const pendingCommentUpdates = comments.reduce<FeedCommentEntity[]>(
      (updates, comment) => {
        const nextAvatar = resolveAvatar(
          comment.authorType,
          comment.authorId,
          comment.authorAvatar,
        );
        if (nextAvatar && nextAvatar !== comment.authorAvatar) {
          updates.push({ ...comment, authorAvatar: nextAvatar });
        }
        return updates;
      },
      [],
    );

    await Promise.all([
      pendingPostUpdates.length > 0
        ? this.postRepo.save(pendingPostUpdates)
        : null,
      pendingCommentUpdates.length > 0
        ? this.commentRepo.save(pendingCommentUpdates)
        : null,
    ]);
  }

  private async createPostInteraction(input: {
    ownerId: string;
    postId: string;
    type: string;
    incrementColumn?: 'likeCount' | 'favoriteCount';
    payload?: Record<string, unknown> | null;
  }) {
    await this.assertPostExists(input.postId);
    const existing = await this.interactionRepo.findOneBy({
      ownerId: input.ownerId,
      postId: input.postId,
      type: input.type,
    });

    if (existing) {
      return;
    }

    await this.interactionRepo.save(
      this.interactionRepo.create({
        ownerId: input.ownerId,
        postId: input.postId,
        type: input.type,
        payload: input.payload ?? null,
      }),
    );
    void this.cyberAvatar.captureSignal({
      ownerId: input.ownerId,
      signalType: 'feed_interaction',
      sourceSurface: 'feed',
      sourceEntityType: 'feed_interaction',
      sourceEntityId: `${input.postId}:${input.type}`,
      dedupeKey: `feed_interaction:${input.ownerId}:${input.postId}:${input.type}`,
      summaryText: `对动态执行 ${input.type}`,
      payload: {
        postId: input.postId,
        type: input.type,
        payload: input.payload ?? null,
      },
    });

    if (input.incrementColumn) {
      await this.postRepo.increment(
        { id: input.postId },
        input.incrementColumn,
        1,
      );
    }
  }

  private async assertPostExists(postId: string) {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || post.publishStatus === 'deleted') {
      throw new AppError('FEED_POST_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Feed post not found',
      });
    }
    return post;
  }

  private async assertOwnerCanInteractWithPost(postId: string) {
    const post = await this.assertPostExists(postId);
    if (post.authorType !== 'character') return post;
    // 广场（surface='feed'）开放给所有人评论 / 点赞，不再要求加好友。
    if (post.surface === 'feed') return post;
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendIds = await this.characters.getActiveFriendCharacterIdSet(
      owner.id,
    );
    if (!friendIds.has(post.authorId)) {
      throw new AppError('FEED_NOT_FRIEND', {
        status: HttpStatus.FORBIDDEN,
        legacyMessage: '需先加为好友才能互动',
      });
    }
    return post;
  }

  async hasFeedPostSyncedFromMoment(momentPostId: string): Promise<boolean> {
    const existing = await this.findFeedPostSyncedFromMoment(momentPostId);
    return Boolean(existing);
  }

  private async findFeedPostSyncedFromMoment(momentPostId: string) {
    return this.postRepo
      .createQueryBuilder('post')
      .where('post.surface = :surface', { surface: 'feed' })
      .andWhere('post.statsPayload LIKE :marker', {
        marker: `%\"momentPostId\":\"${momentPostId}\"%`,
      })
      .orderBy('post.createdAt', 'DESC')
      .getOne();
  }

  private async decrementPostCounter(postId: string, key: 'favoriteCount') {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) {
      return;
    }

    const currentValue = Number(post[key] ?? 0);
    await this.postRepo.update(postId, {
      [key]: currentValue > 0 ? currentValue - 1 : 0,
    });
  }

}

function composeChannelVideoPrompt(
  characterName: string,
  relationship: string | undefined,
  text: string,
): string {
  const personaSnippet = relationship?.trim()
    ? `角色定位：${relationship.slice(0, 120)}。`
    : '';
  const trimmedText = text.replace(/\s+/g, ' ').trim().slice(0, 300);
  return [
    `${characterName} 的视频号短片，9:16 竖屏，6 秒。`,
    personaSnippet,
    `画面主题：${trimmedText || '城市夜景慢镜头，空气中带着 AI 隐界的氛围'}。`,
    '风格：电影感、低饱和、柔和光线、轻微镜头运动。',
  ]
    .filter(Boolean)
    .join(' ');
}

function composeChannelTitle(characterName: string, text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return `${characterName}·视频`;
  return trimmed.length <= 24 ? trimmed : `${trimmed.slice(0, 20)}…`;
}

function normalizeFeedMediaAsset(
  asset: MomentMediaAsset,
  index: number,
): MomentMediaAsset {
  if (asset.kind === 'video') {
    return {
      id: asset.id?.trim() || `feed-video-${index + 1}`,
      kind: 'video',
      url: asset.url?.trim() || '',
      posterUrl: asset.posterUrl?.trim() || undefined,
      mimeType: asset.mimeType?.trim() || 'video/mp4',
      fileName: asset.fileName?.trim() || `video-${index + 1}`,
      size: Math.max(0, Math.round(asset.size ?? 0)),
      width: normalizeOptionalPositiveInteger(asset.width),
      height: normalizeOptionalPositiveInteger(asset.height),
      durationMs: normalizeOptionalPositiveInteger(asset.durationMs),
    };
  }

  if (asset.kind === 'audio') {
    return {
      id: asset.id?.trim() || `feed-audio-${index + 1}`,
      kind: 'audio',
      url: asset.url?.trim() || '',
      posterUrl: asset.posterUrl?.trim() || undefined,
      mimeType: asset.mimeType?.trim() || 'audio/mpeg',
      fileName: asset.fileName?.trim() || `audio-${index + 1}`,
      size: Math.max(0, Math.round(asset.size ?? 0)),
      durationMs: normalizeOptionalPositiveInteger(asset.durationMs),
      title: asset.title?.trim() || undefined,
      lyrics: asset.lyrics?.trim() || undefined,
    };
  }

  return {
    id: asset.id?.trim() || `feed-image-${index + 1}`,
    kind: 'image',
    url: asset.url?.trim() || '',
    thumbnailUrl: asset.thumbnailUrl?.trim() || asset.url?.trim() || undefined,
    mimeType: asset.mimeType?.trim() || 'image/jpeg',
    fileName: asset.fileName?.trim() || `image-${index + 1}`,
    size: Math.max(0, Math.round(asset.size ?? 0)),
    width: normalizeOptionalPositiveInteger(asset.width),
    height: normalizeOptionalPositiveInteger(asset.height),
    livePhoto: asset.livePhoto?.enabled
      ? {
          enabled: true,
          motionUrl: asset.livePhoto.motionUrl?.trim() || undefined,
        }
      : undefined,
  };
}

function normalizeOptionalPositiveInteger(value?: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.round(value);
}

function normalizeOptionalPositiveFloat(value?: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function resolveFeedMediaAspectRatio(media?: MomentMediaAsset | null) {
  if (!media || media.kind === 'audio') {
    return undefined;
  }

  if (
    typeof media.width === 'number' &&
    media.width > 0 &&
    typeof media.height === 'number' &&
    media.height > 0
  ) {
    return media.width / media.height;
  }

  return undefined;
}

function buildApproximateFeedMediaDimensions(aspectRatio?: number | null) {
  const normalizedAspectRatio = normalizeOptionalPositiveFloat(aspectRatio);
  if (!normalizedAspectRatio) {
    return undefined;
  }

  return {
    width: Math.max(1, Math.round(normalizedAspectRatio * 1000)),
    height: 1000,
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeTags(tags?: string[] | null) {
  const normalized = (tags ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  return normalized.length ? normalized : null;
}

function paginate<T>(items: T[], page: number, limit: number) {
  const normalizedPage = Number.isFinite(page) && page > 0 ? page : 1;
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? limit : 20;
  const start = (normalizedPage - 1) * normalizedLimit;
  return items.slice(start, start + normalizedLimit);
}
// i18n-ignore-end
