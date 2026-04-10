import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { FeedPostEntity } from './feed-post.entity';
import { FeedCommentEntity } from './feed-comment.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CharactersService } from '../characters/characters.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SocialService } from '../social/social.service';

type FeedSurface = 'feed' | 'channels';

type FeedListItem = FeedPostEntity & {
  commentsPreview: FeedCommentEntity[];
};

const CHANNEL_DEMO_POSTS: Array<{
  text: string;
  mediaType: 'video';
  mediaUrl: string;
}> = [
  {
    text: 'AI 夜航日志：雾港上空的低空巡游短片，第一视角穿过霓虹塔群。',
    mediaType: 'video',
    mediaUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  },
  {
    text: 'AI 居民拍到的晨光海岸，海风、长桥和低饱和城市天际线被压进 20 秒短片里。',
    mediaType: 'video',
    mediaUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  },
  {
    text: 'AI 合成的玻璃温室散步片段，镜头从花墙缓慢推到中央光井。',
    mediaType: 'video',
    mediaUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
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
    private postRepo: Repository<FeedPostEntity>,
    @InjectRepository(FeedCommentEntity)
    private commentRepo: Repository<FeedCommentEntity>,
    @InjectRepository(UserFeedInteractionEntity)
    private interactionRepo: Repository<UserFeedInteractionEntity>,
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
    }

    const [posts, total] = await this.postRepo.findAndCount({
      where: { surface },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    if (!posts.length) {
      return { posts: [], total };
    }

    const postIds = posts.map((post) => post.id);
    const comments = await this.commentRepo.find({
      where: { postId: In(postIds) },
      order: { createdAt: 'ASC' },
    });
    const commentMap = new Map<string, FeedCommentEntity[]>();

    for (const comment of comments) {
      const currentComments = commentMap.get(comment.postId) ?? [];
      currentComments.push(comment);
      commentMap.set(comment.postId, currentComments.slice(-3));
    }

    return {
      posts: posts.map((post) => ({
        ...post,
        commentsPreview: commentMap.get(post.id) ?? [],
      })),
      total,
    };
  }

  async getPostWithComments(postId: string) {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) return null;
    const comments = await this.commentRepo.find({
      where: { postId },
      order: { createdAt: 'ASC' },
    });
    return { ...post, comments };
  }

  async createOwnerPost(
    text: string,
    options?: {
      mediaType?: 'text' | 'image' | 'video';
      mediaUrl?: string;
      surface?: FeedSurface;
    },
  ): Promise<FeedPostEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.createPost(
      {
        authorAvatar: owner.avatar ?? '',
        authorId: owner.id,
        authorName: owner.username?.trim() || 'You',
        authorType: 'user',
        mediaType: options?.mediaType,
        mediaUrl: options?.mediaUrl,
        surface: options?.surface,
        text,
      },
    );
  }

  async createPost(input: {
    authorAvatar: string;
    authorId: string;
    authorName: string;
    authorType?: 'user' | 'character';
    mediaType?: 'text' | 'image' | 'video';
    mediaUrl?: string;
    surface?: FeedSurface;
    text: string;
  }): Promise<FeedPostEntity> {
    const post = this.postRepo.create({
      authorAvatar: input.authorAvatar,
      authorId: input.authorId,
      authorName: input.authorName,
      authorType: input.authorType ?? 'user',
      mediaType: input.mediaType ?? 'text',
      mediaUrl: input.mediaUrl?.trim() || undefined,
      surface: input.surface ?? 'feed',
      text: input.text,
    });
    return this.postRepo.save(post);
  }

  async addOwnerComment(postId: string, text: string): Promise<FeedCommentEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.addComment(
      postId,
      owner.id,
      owner.username?.trim() || 'You',
      owner.avatar ?? '',
      text,
      'user',
    );
  }

  async addComment(postId: string, authorId: string, authorName: string, authorAvatar: string, text: string, authorType = 'user'): Promise<FeedCommentEntity> {
    const comment = this.commentRepo.create({ postId, authorId, authorName, authorAvatar, authorType, text });
    const saved = await this.commentRepo.save(comment);
    await this.postRepo.increment({ id: postId }, 'commentCount', 1);
    return saved;
  }

  async likeOwnerPost(postId: string): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.likePost(postId, owner.id);
  }

  async likePost(postId: string, ownerId: string): Promise<void> {
    const existing = await this.interactionRepo.findOneBy({ postId, ownerId, type: 'like' });
    if (existing) return;
    const interaction = this.interactionRepo.create({ postId, ownerId, type: 'like' });
    await this.interactionRepo.save(interaction);
    await this.postRepo.increment({ id: postId }, 'likeCount', 1);
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
    if (!profile) {
      return this.createPost({
        authorAvatar: selectedCharacter.avatar,
        authorId: selectedCharacter.id,
        authorName: selectedCharacter.name,
        authorType: 'character',
        mediaType: 'video',
        mediaUrl: media.mediaUrl,
        surface: 'channels',
        text: this.buildFallbackChannelText(selectedCharacter.name),
      });
    }

    try {
      const baseText = await this.ai.generateMoment({
        profile,
        currentTime: new Date(),
      });
      const text =
        baseText.trim() || this.buildFallbackChannelText(selectedCharacter.name);

      return this.createPost({
        authorAvatar: selectedCharacter.avatar,
        authorId: selectedCharacter.id,
        authorName: selectedCharacter.name,
        authorType: 'character',
        mediaType: 'video',
        mediaUrl: media.mediaUrl,
        surface: 'channels',
        text: `${text} #AI视频号`,
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
        mediaType: 'video',
        mediaUrl: media.mediaUrl,
        surface: 'channels',
        text: this.buildFallbackChannelText(selectedCharacter.name),
      });
    }
  }

  async getPendingAiReaction(sinceMinutes = 30): Promise<FeedPostEntity[]> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    return this.postRepo.find({
      where: { aiReacted: false, authorType: 'user' },
      order: { createdAt: 'ASC' },
    }).then(posts => posts.filter(p => p.createdAt >= since));
  }

  async triggerAiReactionForPost(post: FeedPostEntity): Promise<void> {
    const blockedCharacterIds = new Set(await this.socialService.getBlockedCharacterIds());
    const chars = (await this.characters.findAll()).filter((char) => !blockedCharacterIds.has(char.id));
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
        await this.addComment(post.id, char.id, char.name, char.avatar, reply.text, 'character');
      } catch {
        // ignore
      }
    }
    await this.postRepo.update(post.id, { aiReacted: true });
  }

  private async ensureChannelSeedData() {
    const existingCount = await this.postRepo.count({
      where: { surface: 'channels' },
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
        mediaType: demoPost.mediaType,
        mediaUrl: demoPost.mediaUrl,
        surface: 'channels',
        text: demoPost.text,
      });
    }
  }

  async topUpChannelsIfNeeded(targetCount = 6) {
    const recentCount = await this.postRepo.count({
      where: {
        createdAt: MoreThanOrEqual(new Date(Date.now() - 48 * 60 * 60 * 1000)),
        surface: 'channels',
      },
    });

    if (recentCount >= targetCount) {
      return;
    }

    const missingCount = targetCount - recentCount;
    for (let index = 0; index < missingCount; index += 1) {
      await this.generateChannelPost();
    }
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
