import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CharactersService } from '../characters/characters.service';
import { MomentEntity } from './moment.entity';
import { MomentPostEntity } from './moment-post.entity';
import { MomentCommentEntity } from './moment-comment.entity';
import { MomentLikeEntity } from './moment-like.entity';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SocialService } from '../social/social.service';

export interface MomentInteraction {
  characterId: string;
  characterName: string;
  type: 'like' | 'comment';
  commentText?: string;
  createdAt: Date;
}

export interface Moment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: string;
  text: string;
  location?: string;
  postedAt: Date;
  likeCount: number;
  commentCount: number;
  likes: MomentLikeEntity[];
  comments: MomentCommentEntity[];
  // legacy support
  interactions: MomentInteraction[];
}

@Injectable()
export class MomentsService {
  private readonly logger = new Logger(MomentsService.name);

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly socialService: SocialService,
    @InjectRepository(MomentEntity)
    private momentRepo: Repository<MomentEntity>,
    @InjectRepository(MomentPostEntity)
    private postRepo: Repository<MomentPostEntity>,
    @InjectRepository(MomentCommentEntity)
    private commentRepo: Repository<MomentCommentEntity>,
    @InjectRepository(MomentLikeEntity)
    private likeRepo: Repository<MomentLikeEntity>,
  ) {}

  async createUserMoment(text: string): Promise<Moment> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const visibleCharacterIds = await this.getVisibleFriendCharacterIdSet();
    const post = this.postRepo.create({
      authorId: owner.id,
      authorName: owner.username?.trim() || 'You',
      authorAvatar: owner.avatar ?? '',
      authorType: 'user',
      text,
    });
    await this.postRepo.save(post);
    // Schedule AI reactions to user's moment
    void this.scheduleCharacterInteractions(post);
    return this._enrichPost(post, visibleCharacterIds);
  }

  async getFeed(): Promise<Moment[]> {
    const friendCharacterIds = await this.getVisibleFriendCharacterIds();
    const visibleCharacterIds = new Set(friendCharacterIds);
    const posts = await this.postRepo.find({ order: { postedAt: 'DESC' } });
    const visiblePosts = posts.filter((post) => this.canOwnerViewPost(post, visibleCharacterIds));
    return Promise.all(visiblePosts.map((post) => this._enrichPost(post, visibleCharacterIds)));
  }

  async getPost(postId: string): Promise<Moment | null> {
    const visibleCharacterIds = await this.getVisibleFriendCharacterIdSet();
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || !this.canOwnerViewPost(post, visibleCharacterIds)) return null;
    return this._enrichPost(post, visibleCharacterIds);
  }

  async addOwnerComment(postId: string, text: string): Promise<MomentCommentEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.assertOwnerCanInteractWithPost(postId);
    return this.addComment(
      postId,
      owner.id,
      owner.username?.trim() || 'You',
      owner.avatar ?? '',
      text,
      'user',
    );
  }

  async toggleOwnerLike(postId: string): Promise<{ liked: boolean }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.assertOwnerCanInteractWithPost(postId);
    return this.toggleLike(
      postId,
      owner.id,
      owner.username?.trim() || 'You',
      owner.avatar ?? '',
      'user',
    );
  }

  async addComment(postId: string, authorId: string, authorName: string, authorAvatar: string, text: string, authorType = 'user'): Promise<MomentCommentEntity> {
    const comment = this.commentRepo.create({ postId, authorId, authorName, authorAvatar, authorType, text });
    const saved = await this.commentRepo.save(comment);
    await this.postRepo.increment({ id: postId }, 'commentCount', 1);
    // Schedule AI replies to user comment
    if (authorType === 'user') {
      void this.scheduleAiCommentReplies(postId, authorName, text);
    }
    return saved;
  }

  async toggleLike(postId: string, authorId: string, authorName: string, authorAvatar: string, authorType = 'user'): Promise<{ liked: boolean }> {
    const existing = await this.likeRepo.findOneBy({ postId, authorId });
    if (existing) {
      await this.likeRepo.delete(existing.id);
      await this.postRepo.decrement({ id: postId }, 'likeCount', 1);
      return { liked: false };
    }
    const like = this.likeRepo.create({ postId, authorId, authorName, authorAvatar, authorType });
    await this.likeRepo.save(like);
    await this.postRepo.increment({ id: postId }, 'likeCount', 1);
    return { liked: true };
  }

  async generateMomentForCharacter(characterId: string): Promise<Moment | null> {
    const visibleCharacterIds = await this.getVisibleFriendCharacterIdSet();
    if (!visibleCharacterIds.has(characterId)) {
      return null;
    }

    const char = await this.characters.findById(characterId);
    const profile = await this.characters.getProfile(characterId);
    if (!char || !profile) return null;

    try {
      const text = await this.ai.generateMoment({ profile, currentTime: new Date() });
      if (!text) return null;

      const post = this.postRepo.create({
        authorId: characterId,
        authorName: char.name,
        authorAvatar: char.avatar,
        authorType: 'character',
        text,
      });
      await this.postRepo.save(post);

      // Schedule interactions from other characters (async, non-blocking)
      void this.scheduleCharacterInteractions(post);

      return this._enrichPost(post, visibleCharacterIds);
    } catch (err) {
      this.logger.error(`Failed to generate moment for ${characterId}`, err);
      return null;
    }
  }

  async generateAllMoments(): Promise<Moment[]> {
    const chars = await this.characters.findAll();
    const results: Moment[] = [];
    for (const char of chars) {
      const moment = await this.generateMomentForCharacter(char.id);
      if (moment) results.push(moment);
    }
    return results;
  }

  private async scheduleCharacterInteractions(post: MomentPostEntity) {
    const visibleCharacterIds = await this.getVisibleFriendCharacterIdSet();
    if (post.authorType === 'character' && !visibleCharacterIds.has(post.authorId)) {
      return;
    }

    const allChars = (await this.characters.findAll()).filter(
      (character) => character.id !== post.authorId && visibleCharacterIds.has(character.id),
    );

    allChars.forEach((char, i) => {
      const freq = char.activityFrequency ?? 'normal';
      const interactChance = freq === 'high' ? 0.6 : freq === 'low' ? 0.2 : 0.4;
      if (Math.random() > interactChance) return;

      // Delay based on activity frequency
      const baseDelay = freq === 'high'
        ? 2 * 60 * 1000   // 2 min
        : freq === 'low'
        ? 2 * 60 * 60 * 1000  // 2 hours
        : 15 * 60 * 1000;  // 15 min

      const delay = baseDelay + Math.random() * baseDelay + i * 3000;

      setTimeout(() => {
        void (async () => {
          try {
            if (!(await this.socialService.isFriendCharacter(char.id))) {
              return;
            }
            if (post.authorType === 'character' && !(await this.socialService.isFriendCharacter(post.authorId))) {
              return;
            }

            const isComment = Math.random() < 0.4;
            if (isComment) {
              const profile = await this.characters.getProfile(char.id);
              if (!profile) return;
              const reply = await this.ai.generateReply({
                profile,
                conversationHistory: [],
                userMessage: `你的朋友${post.authorName}发了一条朋友圈："${post.text}"，用一句话自然地评论一下，不超过20字。`,
              });
              await this.addComment(post.id, char.id, char.name, char.avatar, reply.text, 'character');
              return;
            }

            await this.toggleLike(post.id, char.id, char.name, char.avatar, 'character');
          } catch {
            // ignore
          }
        })();
      }, delay);
    });
  }

  private async scheduleAiCommentReplies(postId: string, commenterName: string, commentText: string) {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || post.authorType !== 'character') return;
    if (!(await this.socialService.isFriendCharacter(post.authorId))) return;

    const char = await this.characters.findById(post.authorId);
    if (!char) return;

    const delay = 30000 + Math.random() * 60000; // 30s - 90s
    setTimeout(() => {
      void (async () => {
        try {
          if (!(await this.socialService.isFriendCharacter(char.id))) {
            return;
          }

          const profile = await this.characters.getProfile(char.id);
          if (!profile) return;

          const reply = await this.ai.generateReply({
            profile,
            conversationHistory: [],
            userMessage: `${commenterName}在你的朋友圈评论了："${commentText}"，你的朋友圈内容是："${post.text}"，回复一下，不超过20字。`,
          });
          await this.addComment(postId, char.id, char.name, char.avatar, reply.text, 'character');
        } catch {
          // ignore
        }
      })();
    }, delay);
  }

  private async getVisibleFriendCharacterIds(): Promise<string[]> {
    return this.socialService.getFriendCharacterIds();
  }

  private async getVisibleFriendCharacterIdSet(): Promise<Set<string>> {
    return new Set(await this.getVisibleFriendCharacterIds());
  }

  private canOwnerViewPost(post: MomentPostEntity, visibleCharacterIds: Set<string>): boolean {
    return post.authorType !== 'character' || visibleCharacterIds.has(post.authorId);
  }

  private async assertOwnerCanInteractWithPost(postId: string): Promise<MomentPostEntity> {
    const visibleCharacterIds = await this.getVisibleFriendCharacterIdSet();
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || !this.canOwnerViewPost(post, visibleCharacterIds)) {
      throw new ForbiddenException('Moment is not visible to the current world owner');
    }
    return post;
  }

  private async _enrichPost(post: MomentPostEntity, visibleCharacterIds: Set<string>): Promise<Moment> {
    const [likes, comments] = await Promise.all([
      this.likeRepo.find({ where: { postId: post.id }, order: { createdAt: 'ASC' } }),
      this.commentRepo.find({ where: { postId: post.id }, order: { createdAt: 'ASC' } }),
    ]);
    const visibleLikes = likes.filter(
      (like) => like.authorType !== 'character' || visibleCharacterIds.has(like.authorId),
    );
    const visibleComments = comments.filter(
      (comment) => comment.authorType !== 'character' || visibleCharacterIds.has(comment.authorId),
    );

    return {
      id: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      authorAvatar: post.authorAvatar,
      authorType: post.authorType,
      text: post.text,
      location: post.location,
      postedAt: post.postedAt,
      likeCount: visibleLikes.length,
      commentCount: visibleComments.length,
      likes: visibleLikes,
      comments: visibleComments,
      interactions: [
        ...visibleLikes.map((like) => ({
          characterId: like.authorId,
          characterName: like.authorName,
          type: 'like' as const,
          createdAt: like.createdAt,
        })),
        ...visibleComments.map((comment) => ({
          characterId: comment.authorId,
          characterName: comment.authorName,
          type: 'comment' as const,
          commentText: comment.text,
          createdAt: comment.createdAt,
        })),
      ],
    };
  }
}
