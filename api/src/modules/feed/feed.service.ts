import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedPostEntity } from './feed-post.entity';
import { FeedCommentEntity } from './feed-comment.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CharactersService } from '../characters/characters.service';
import { WorldOwnerService } from '../auth/world-owner.service';

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
  ) {}

  async getFeed(page = 1, limit = 20): Promise<{ posts: FeedPostEntity[]; total: number }> {
    const [posts, total] = await this.postRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { posts, total };
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

  async createOwnerPost(text: string): Promise<FeedPostEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.createPost(
      owner.id,
      owner.username?.trim() || 'You',
      owner.avatar ?? '',
      text,
      'user',
    );
  }

  async createPost(authorId: string, authorName: string, authorAvatar: string, text: string, authorType = 'user'): Promise<FeedPostEntity> {
    const post = this.postRepo.create({ authorId, authorName, authorAvatar, authorType, text });
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
      return this.createPost(char.id, char.name, char.avatar, text, 'character');
    } catch (err) {
      this.logger.error(`Failed to generate feed post for ${characterId}`, err);
      return null;
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
    const chars = await this.characters.findAll();
    const selected = chars.filter(() => Math.random() < 0.3).slice(0, 2);
    for (const char of selected) {
      const profile = await this.characters.getProfile(char.id);
      if (!profile) continue;
      try {
        const reply = await this.ai.generateReply({
          profile,
          conversationHistory: [],
          userMessage: `你在视频号看到一条内容："${post.text}"，用一句话自然地评论，不超过25字。`,
        });
        await this.addComment(post.id, char.id, char.name, char.avatar, reply.text, 'character');
      } catch {
        // ignore
      }
    }
    await this.postRepo.update(post.id, { aiReacted: true });
  }
}
