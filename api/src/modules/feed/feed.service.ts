import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { FeedPostEntity } from './feed-post.entity';
import { FeedCommentEntity } from './feed-comment.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { VideoChannelFollowEntity } from './video-channel-follow.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CharactersService } from '../characters/characters.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SocialService } from '../social/social.service';

type FeedSurface = 'feed' | 'channels';
type FeedChannelHomeSection = 'recommended' | 'friends' | 'following' | 'live';
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

type FeedListItem = ReturnType<FeedService['serializePost']> & {
  commentsPreview: ReturnType<FeedService['serializeComment']>[];
};

const CHANNEL_HOME_SECTION_LABELS: Record<FeedChannelHomeSection, string> = {
  recommended: '推荐',
  friends: '朋友',
  following: '关注',
  live: '直播',
};

const CHANNEL_DEMO_POSTS: Array<{
  title: string;
  text: string;
  coverUrl: string;
  mediaType: 'video';
  mediaUrl: string;
  durationMs: number;
  topicTags: string[];
  aspectRatio: number;
}> = [
  {
    title: '雾港夜巡',
    text: 'AI 夜航日志：雾港上空的低空巡游短片，第一视角穿过霓虹塔群。',
    coverUrl: 'https://placehold.co/720x1280/png?text=Yinjie+Night+Patrol',
    mediaType: 'video',
    mediaUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    durationMs: 26000,
    topicTags: ['夜景', '巡游', 'AI世界'],
    aspectRatio: 9 / 16,
  },
  {
    title: '晨光海岸',
    text: 'AI 居民拍到的晨光海岸，海风、长桥和低饱和城市天际线被压进 20 秒短片里。',
    coverUrl: 'https://placehold.co/720x1280/png?text=Yinjie+Morning+Coast',
    mediaType: 'video',
    mediaUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    durationMs: 20000,
    topicTags: ['海岸', '清晨', '城市'],
    aspectRatio: 9 / 16,
  },
  {
    title: '玻璃温室漫游',
    text: 'AI 合成的玻璃温室散步片段，镜头从花墙缓慢推到中央光井。',
    coverUrl: 'https://placehold.co/720x1280/png?text=Yinjie+Glasshouse',
    mediaType: 'video',
    mediaUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    durationMs: 18000,
    topicTags: ['温室', '漫游', '生活'],
    aspectRatio: 9 / 16,
  },
];

const CHANNEL_FALLBACK_OPENERS = [
  'AI 镜头记录',
  '今天的视频号片段',
  '刚刚捕捉到的世界画面',
  '这一帧想留给你看',
];

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @InjectRepository(FeedPostEntity)
    private readonly postRepo: Repository<FeedPostEntity>,
    @InjectRepository(FeedCommentEntity)
    private readonly commentRepo: Repository<FeedCommentEntity>,
    @InjectRepository(UserFeedInteractionEntity)
    private readonly interactionRepo: Repository<UserFeedInteractionEntity>,
    @InjectRepository(VideoChannelFollowEntity)
    private readonly followRepo: Repository<VideoChannelFollowEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly socialService: SocialService,
  ) {}

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
    const visiblePosts =
      surface === 'channels'
        ? await this.getVisibleChannelPosts(owner.id, 'recommended')
        : await this.getVisibleFeedPosts(surface);
    const pagedPosts = paginate(visiblePosts, page, limit);
    const [commentsPreviewMap, ownerStateMap] = await Promise.all([
      this.buildCommentsPreviewMap(pagedPosts.map((post) => post.id), owner.id),
      this.buildOwnerStateMap(pagedPosts, owner.id),
    ]);

    return {
      posts: pagedPosts.map((post) => ({
        ...this.serializePost(post, ownerStateMap.get(post.id)),
        commentsPreview: commentsPreviewMap.get(post.id) ?? [],
      })),
      total: visiblePosts.length,
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
    const section = input?.section ?? 'recommended';
    const page = input?.page ?? 1;
    const limit = input?.limit ?? 20;

    const allVisiblePosts = await this.getVisibleChannelPosts(owner.id, 'recommended');
    const postsForSection =
      section === 'recommended'
        ? allVisiblePosts
        : await this.getVisibleChannelPosts(owner.id, section);
    const pagedPosts = paginate(postsForSection, page, limit);

    const [commentsPreviewMap, ownerStateMap, authors, liveEntries, sectionCounts] =
      await Promise.all([
        this.buildCommentsPreviewMap(pagedPosts.map((post) => post.id), owner.id),
        this.buildOwnerStateMap(pagedPosts, owner.id),
        this.buildChannelAuthorSummaries(allVisiblePosts, owner.id),
        this.buildLiveEntries(allVisiblePosts),
        this.buildChannelSectionCounts(allVisiblePosts, owner.id),
      ]);

    return {
      sections: (Object.keys(CHANNEL_HOME_SECTION_LABELS) as FeedChannelHomeSection[]).map(
        (key) => ({
          key,
          label: CHANNEL_HOME_SECTION_LABELS[key],
          count: sectionCounts[key] ?? 0,
        }),
      ),
      activeSection: section,
      posts: pagedPosts.map((post) => ({
        ...this.serializePost(post, ownerStateMap.get(post.id)),
        commentsPreview: commentsPreviewMap.get(post.id) ?? [],
      })),
      authors,
      liveEntries,
      total: postsForSection.length,
    };
  }

  async getChannelAuthorProfile(authorId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const authorPosts = (await this.getVisibleChannelPosts(owner.id, 'recommended')).filter(
      (post) => post.authorId === authorId,
    );
    const latestPost = authorPosts[0] ?? (await this.postRepo.findOne({
      where: { authorId, surface: 'channels', publishStatus: 'published' },
      order: { createdAt: 'DESC' },
    }));

    if (!latestPost) {
      throw new NotFoundException('Channel author not found');
    }

    const [ownerStateMap, commentsPreviewMap, followerCount, isFollowing, bio] =
      await Promise.all([
        this.buildOwnerStateMap(authorPosts.slice(0, 12), owner.id),
        this.buildCommentsPreviewMap(
          authorPosts.slice(0, 12).map((post) => post.id),
          owner.id,
        ),
        this.followRepo.count({ where: { authorId } }),
        this.followRepo.findOneBy({ ownerId: owner.id, authorId }),
        this.resolveAuthorBio(latestPost.authorId, latestPost.authorType),
      ]);

    return {
      authorId: latestPost.authorId,
      authorName: latestPost.authorName,
      authorAvatar: latestPost.authorAvatar,
      authorType: latestPost.authorType,
      bio,
      followerCount,
      isFollowing: Boolean(isFollowing),
      recentPosts: authorPosts.slice(0, 12).map((post) => ({
        ...this.serializePost(post, ownerStateMap.get(post.id)),
        commentsPreview: commentsPreviewMap.get(post.id) ?? [],
      })),
    };
  }

  async getPostWithComments(postId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const post = await this.postRepo.findOneBy({ id: postId });

    if (!post || post.publishStatus === 'deleted') {
      return null;
    }

    const [comments, ownerStateMap] = await Promise.all([
      this.getComments(postId),
      this.buildOwnerStateMap([post], owner.id),
    ]);

    return {
      ...this.serializePost(post, ownerStateMap.get(post.id)),
      comments,
    };
  }

  async getComments(postId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const comments = await this.commentRepo.find({
      where: { postId, status: 'published' },
      order: { createdAt: 'ASC' },
    });
    const likedCommentIds = await this.buildLikedCommentIdSet(
      comments.map((comment) => comment.id),
      owner.id,
    );

    return comments.map((comment) =>
      this.serializeComment(comment, likedCommentIds.has(comment.id)),
    );
  }

  async createOwnerPost(
    text: string,
    options?: {
      title?: string;
      mediaType?: 'text' | 'image' | 'video';
      mediaUrl?: string;
      coverUrl?: string;
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
      mediaType: options?.mediaType,
      mediaUrl: options?.mediaUrl,
      coverUrl: options?.coverUrl,
      durationMs: options?.durationMs,
      aspectRatio: options?.aspectRatio,
      topicTags: options?.topicTags,
      sourceKind: 'owner_upload',
      surface: options?.surface,
      text,
    });
  }

  async createPost(input: {
    authorAvatar: string;
    authorId: string;
    authorName: string;
    authorType?: 'user' | 'character';
    text: string;
    title?: string;
    mediaType?: 'text' | 'image' | 'video';
    mediaUrl?: string;
    coverUrl?: string;
    durationMs?: number;
    aspectRatio?: number;
    topicTags?: string[];
    publishStatus?: 'draft' | 'published' | 'hidden' | 'deleted';
    shareCount?: number;
    favoriteCount?: number;
    viewCount?: number;
    watchCount?: number;
    completeCount?: number;
    sourceKind?: 'seed' | 'ai_generated' | 'owner_upload' | 'character_generated' | 'live_clip';
    recommendationScore?: number;
    statsPayload?: Record<string, unknown> | null;
    surface?: FeedSurface;
  }): Promise<FeedPostEntity> {
    const post = this.postRepo.create({
      authorAvatar: input.authorAvatar,
      authorId: input.authorId,
      authorName: input.authorName,
      authorType: input.authorType ?? 'user',
      text: input.text.trim(),
      title: input.title?.trim() || null,
      mediaType: input.mediaType ?? 'text',
      mediaUrl: input.mediaUrl?.trim() || undefined,
      coverUrl: input.coverUrl?.trim() || null,
      durationMs: input.durationMs ?? null,
      aspectRatio: input.aspectRatio ?? null,
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
    });
    return this.postRepo.save(post);
  }

  async addOwnerComment(postId: string, text: string): Promise<ReturnType<FeedService['serializeComment']>> {
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
    return saved;
  }

  async replyToComment(commentId: string, text: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const parentComment = await this.commentRepo.findOneBy({ id: commentId });

    if (!parentComment) {
      throw new NotFoundException('Comment not found');
    }

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
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.createPostInteraction({
      ownerId: owner.id,
      postId,
      type: 'like',
      incrementColumn: 'likeCount',
    });
  }

  async favoriteOwnerPost(postId: string): Promise<void> {
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
    await this.postRepo.increment({ id: postId }, 'shareCount', 1);
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
        typeof payload?.progressSeconds === 'number' ? payload.progressSeconds : null,
      completed: Boolean(payload?.completed),
    };

    if (!existing) {
      await this.interactionRepo.save(
        this.interactionRepo.create({
          ownerId: owner.id,
          postId,
          type: 'view',
          payload: nextPayload,
        }),
      );
      await this.postRepo.increment({ id: postId }, 'viewCount', 1);
      if (typeof nextPayload.progressSeconds === 'number' && nextPayload.progressSeconds > 0) {
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
      progressSeconds: Math.max(previousProgress, nextPayload.progressSeconds ?? 0) || null,
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
      throw new NotFoundException('Comment not found');
    }

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

  async generateFeedPostForCharacter(characterId: string): Promise<FeedPostEntity | null> {
    const char = await this.characters.findById(characterId);
    const profile = await this.characters.getProfile(characterId);
    if (!char || !profile) return null;

    try {
      const text = await this.ai.generateMoment({ profile, currentTime: new Date() });
      if (!text) return null;
      return this.createPost({
        authorAvatar: char.avatar,
        authorId: char.id,
        authorName: char.name,
        authorType: 'character',
        sourceKind: 'character_generated',
        surface: 'feed',
        text,
      });
    } catch (err) {
      this.logger.error(`Failed to generate feed post for ${characterId}`, err);
      return null;
    }
  }

  async generateChannelPost(
    characterId?: string,
    options?: { skipAi?: boolean },
  ): Promise<FeedPostEntity | null> {
    const candidates = await this.characters.findAll();
    const eligibleCharacters = candidates.filter((character) =>
      characterId ? character.id === characterId : character.feedFrequency > 0,
    );
    const selectedCharacter = characterId
      ? eligibleCharacters[0]
      : eligibleCharacters[Math.floor(Math.random() * eligibleCharacters.length)];
    if (!selectedCharacter) {
      return null;
    }

    const profile = await this.characters.getProfile(selectedCharacter.id);
    const media = this.pickChannelMedia(selectedCharacter.id);
    const fallbackText = this.buildFallbackChannelText(selectedCharacter.name);

    if (!profile || options?.skipAi) {
      return this.createPost({
        authorAvatar: selectedCharacter.avatar,
        authorId: selectedCharacter.id,
        authorName: selectedCharacter.name,
        authorType: 'character',
        title: media.title,
        mediaType: 'video',
        mediaUrl: media.mediaUrl,
        coverUrl: media.coverUrl,
        durationMs: media.durationMs,
        aspectRatio: media.aspectRatio,
        topicTags: media.topicTags,
        sourceKind: options?.skipAi ? 'seed' : 'ai_generated',
        recommendationScore: 80,
        surface: 'channels',
        text: fallbackText,
      });
    }

    try {
      const baseText = await this.ai.generateMoment({
        profile,
        currentTime: new Date(),
      });
      const text = baseText.trim() || fallbackText;

      return this.createPost({
        authorAvatar: selectedCharacter.avatar,
        authorId: selectedCharacter.id,
        authorName: selectedCharacter.name,
        authorType: 'character',
        title: media.title,
        mediaType: 'video',
        mediaUrl: media.mediaUrl,
        coverUrl: media.coverUrl,
        durationMs: media.durationMs,
        aspectRatio: media.aspectRatio,
        topicTags: media.topicTags,
        sourceKind: 'character_generated',
        recommendationScore: 100,
        surface: 'channels',
        text,
      });
    } catch (err) {
      this.logger.error(
        `Failed to generate channels post for ${selectedCharacter.id}`,
        err,
      );

      return this.createPost({
        authorAvatar: selectedCharacter.avatar,
        authorId: selectedCharacter.id,
        authorName: selectedCharacter.name,
        authorType: 'character',
        title: media.title,
        mediaType: 'video',
        mediaUrl: media.mediaUrl,
        coverUrl: media.coverUrl,
        durationMs: media.durationMs,
        aspectRatio: media.aspectRatio,
        topicTags: media.topicTags,
        sourceKind: 'seed',
        recommendationScore: 80,
        surface: 'channels',
        text: fallbackText,
      });
    }
  }

  async getPendingAiReaction(sinceMinutes = 30): Promise<FeedPostEntity[]> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    return this.postRepo
      .find({
        where: {
          aiReacted: false,
          authorType: 'user',
          publishStatus: 'published',
        },
        order: { createdAt: 'ASC' },
      })
      .then((posts) => posts.filter((post) => post.createdAt >= since));
  }

  async triggerAiReactionForPost(post: FeedPostEntity): Promise<void> {
    const blockedCharacterIds = new Set(await this.socialService.getBlockedCharacterIds());
    const chars = (await this.characters.findAll()).filter(
      (char) => !blockedCharacterIds.has(char.id),
    );
    const selected = chars.filter(() => Math.random() < 0.3).slice(0, 2);
    for (const char of selected) {
      const profile = await this.characters.getProfile(char.id);
      if (!profile) continue;
      try {
        const reply = await this.ai.generateReply({
          profile,
          conversationHistory: [],
          userMessage: `你在${post.surface === 'channels' ? '视频号' : '广场动态'}里看到一条内容："${post.text}"，用一句话自然地评论，不超过25字。`,
        });
        await this.addComment({
          postId: post.id,
          authorId: char.id,
          authorName: char.name,
          authorAvatar: char.avatar,
          authorType: 'character',
          text: reply.text,
        });
      } catch {
        // ignore
      }
    }
    await this.postRepo.update(post.id, { aiReacted: true });
  }

  async ensureChannelSeedData() {
    const existingCount = await this.postRepo.count({
      where: { surface: 'channels', publishStatus: 'published' },
    });
    if (existingCount > 0) {
      return;
    }

    const authors = (await this.characters.findAll()).slice(
      0,
      CHANNEL_DEMO_POSTS.length,
    );
    if (!authors.length) {
      return;
    }

    for (const [index, demoPost] of CHANNEL_DEMO_POSTS.entries()) {
      const author = authors[index % authors.length];
      await this.createPost({
        authorAvatar: author.avatar,
        authorId: author.id,
        authorName: author.name,
        authorType: 'character',
        title: demoPost.title,
        mediaType: demoPost.mediaType,
        mediaUrl: demoPost.mediaUrl,
        coverUrl: demoPost.coverUrl,
        durationMs: demoPost.durationMs,
        aspectRatio: demoPost.aspectRatio,
        topicTags: demoPost.topicTags,
        favoriteCount: 0,
        sourceKind: 'seed',
        surface: 'channels',
        text: demoPost.text,
        viewCount: 18 + index * 7,
        watchCount: 12 + index * 5,
      });
    }
  }

  async topUpChannelsIfNeeded(targetCount = 6) {
    const recentCount = await this.postRepo.count({
      where: {
        createdAt: MoreThanOrEqual(new Date(Date.now() - 48 * 60 * 60 * 1000)),
        publishStatus: 'published',
        surface: 'channels',
      },
    });

    if (recentCount >= targetCount) {
      return;
    }

    const missingCount = targetCount - recentCount;
    for (let index = 0; index < missingCount; index += 1) {
      await this.generateChannelPost(undefined, { skipAi: true });
    }
  }

  private async buildCommentsPreviewMap(postIds: string[], ownerId: string) {
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
    const commentMap = new Map<string, ReturnType<FeedService['serializeComment']>[]>();

    for (const comment of comments) {
      const currentComments = commentMap.get(comment.postId) ?? [];
      currentComments.push(
        this.serializeComment(comment, likedCommentIds.has(comment.id)),
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

  private async buildChannelAuthorSummaries(posts: FeedPostEntity[], ownerId: string) {
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
        authorAvatar: post.authorAvatar,
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

  private async buildLiveEntries(posts: FeedPostEntity[]) {
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
        authorAvatar: post.authorAvatar,
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
      friends: posts.filter((post) => friendCharacterIds.has(post.authorId)).length,
      following: posts.filter((post) => followedAuthorIds.has(post.authorId)).length,
      live: posts.filter(
        (post) =>
          post.sourceKind === 'live_clip' ||
          (post.topicTags ?? []).some((tag) => tag.includes('直播')),
      ).length,
    };
  }

  private async getVisibleFeedPosts(surface: FeedSurface) {
    return this.postRepo.find({
      where: { surface, publishStatus: 'published' },
      order:
        surface === 'channels'
          ? { recommendationScore: 'DESC', createdAt: 'DESC' }
          : { createdAt: 'DESC' },
    });
  }

  private async getVisibleChannelPosts(
    ownerId: string,
    section: FeedChannelHomeSection,
  ) {
    const [posts, blockedCharacterIds, notInterestedPostIds, followedAuthorIds, friendIds] =
      await Promise.all([
        this.getVisibleFeedPosts('channels'),
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
      if (post.authorType === 'character' && blockedCharacterIds.has(post.authorId)) {
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

  private async resolveChannelAuthor(authorId: string) {
    const latestPost = await this.postRepo.findOne({
      where: { authorId, surface: 'channels', publishStatus: 'published' },
      order: { createdAt: 'DESC' },
    });

    if (latestPost) {
      return {
        authorId: latestPost.authorId,
        authorName: latestPost.authorName,
        authorAvatar: latestPost.authorAvatar,
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

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    if (owner.id === authorId) {
      return {
        authorId: owner.id,
        authorName: owner.username?.trim() || 'You',
        authorAvatar: owner.avatar ?? '',
        authorType: 'user',
      };
    }

    throw new NotFoundException('Channel author not found');
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

  private serializePost(post: FeedPostEntity, ownerState?: FeedOwnerState) {
    return {
      id: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      authorAvatar: post.authorAvatar,
      authorType: post.authorType as 'user' | 'character',
      surface: post.surface as FeedSurface,
      text: post.text,
      title: post.title ?? null,
      mediaUrl: post.mediaUrl,
      coverUrl: post.coverUrl ?? null,
      mediaType: post.mediaType as 'text' | 'image' | 'video',
      durationMs: post.durationMs ?? null,
      aspectRatio: post.aspectRatio ?? null,
      topicTags: post.topicTags ?? [],
      publishStatus: post.publishStatus as 'draft' | 'published' | 'hidden' | 'deleted',
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

  private serializeComment(comment: FeedCommentEntity, likedByOwner: boolean) {
    return {
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      authorName: comment.authorName,
      authorAvatar: comment.authorAvatar,
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

  private async createPostInteraction(input: {
    ownerId: string;
    postId: string;
    type: string;
    incrementColumn?:
      | 'likeCount'
      | 'favoriteCount';
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

    if (input.incrementColumn) {
      await this.postRepo.increment({ id: input.postId }, input.incrementColumn, 1);
    }
  }

  private async assertPostExists(postId: string) {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || post.publishStatus === 'deleted') {
      throw new NotFoundException('Feed post not found');
    }
    return post;
  }

  private async decrementPostCounter(
    postId: string,
    key: 'favoriteCount',
  ) {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) {
      return;
    }

    const currentValue = Number(post[key] ?? 0);
    await this.postRepo.update(postId, {
      [key]: currentValue > 0 ? currentValue - 1 : 0,
    });
  }

  private buildFallbackChannelText(authorName: string) {
    const opener =
      CHANNEL_FALLBACK_OPENERS[
        Math.floor(Math.random() * CHANNEL_FALLBACK_OPENERS.length)
      ] ?? CHANNEL_FALLBACK_OPENERS[0];
    return `${opener}：${authorName} 刚刚发来一段 AI 生成的短片，适合停下来刷 10 秒。`;
  }

  private pickChannelMedia(seed: string) {
    let hash = 0;
    for (const character of seed) {
      hash = (hash * 33 + (character.codePointAt(0) ?? 0)) >>> 0;
    }

    return (
      CHANNEL_DEMO_POSTS[hash % CHANNEL_DEMO_POSTS.length] ??
      CHANNEL_DEMO_POSTS[0]
    );
  }
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
