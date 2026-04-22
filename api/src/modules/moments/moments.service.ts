import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import type { AiMessagePart } from '../ai/ai.types';
import { CharactersService } from '../characters/characters.service';
import { MomentEntity } from './moment.entity';
import { MomentPostEntity } from './moment-post.entity';
import { MomentCommentEntity } from './moment-comment.entity';
import { MomentLikeEntity } from './moment-like.entity';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SocialService } from '../social/social.service';
import { FeedService } from '../feed/feed.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import {
  normalizeMomentMediaDisplayName,
  normalizeOptionalPositiveNumber,
  sanitizeMomentMediaFileName,
} from './moment-media.utils';
import {
  resolvePrimaryMomentMediaStorageDir,
  resolveReadableMomentMediaPath,
} from './moment-media.storage';
import {
  type CreateMomentInput,
  type MomentContentType,
  type MomentImageAsset,
  type MomentMediaAsset,
  type MomentVideoAsset,
} from './moment-media.types';

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
  contentType: MomentContentType;
  media: MomentMediaAsset[];
  postedAt: Date;
  likeCount: number;
  commentCount: number;
  likes: MomentLikeEntity[];
  comments: MomentCommentEntity[];
  // legacy support
  interactions: MomentInteraction[];
}

type MomentAvatarContext = {
  ownerAvatar: string;
  ownerId: string;
  visibleCharacterIds: Set<string>;
  characterAvatarById: Map<string, string>;
};

@Injectable()
export class MomentsService implements OnModuleInit {
  private readonly logger = new Logger(MomentsService.name);

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly socialService: SocialService,
    private readonly feedService: FeedService,
    private readonly cyberAvatar: CyberAvatarService,
    @InjectRepository(MomentEntity)
    private momentRepo: Repository<MomentEntity>,
    @InjectRepository(MomentPostEntity)
    private postRepo: Repository<MomentPostEntity>,
    @InjectRepository(MomentCommentEntity)
    private commentRepo: Repository<MomentCommentEntity>,
    @InjectRepository(MomentLikeEntity)
    private likeRepo: Repository<MomentLikeEntity>,
  ) {}

  async onModuleInit() {
    await this.backfillMomentAuthorAvatars();
  }

  async createUserMoment(input: CreateMomentInput): Promise<Moment> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const normalizedInput = this.normalizeCreateMomentInput(input);
    const post = this.postRepo.create({
      authorId: owner.id,
      authorName: owner.username?.trim() || 'You',
      authorAvatar: owner.avatar ?? '',
      authorType: 'user',
      text: normalizedInput.text,
      location: normalizedInput.location,
      contentType: normalizedInput.contentType,
      mediaPayload: this.serializeMomentMedia(normalizedInput.media),
    });
    await this.postRepo.save(post);
    void this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'moment_post',
      sourceSurface: 'moments',
      sourceEntityType: 'moment_post',
      sourceEntityId: post.id,
      dedupeKey: `moment_post:${post.id}`,
      summaryText: `发布朋友圈：${(normalizedInput.text || normalizedInput.contentType).slice(0, 120)}`,
      payload: {
        text: normalizedInput.text,
        contentType: normalizedInput.contentType,
        mediaCount: normalizedInput.media.length,
        location: normalizedInput.location ?? null,
      },
      occurredAt: post.postedAt ?? new Date(),
    });
    // Schedule AI reactions to user's moment
    void this.scheduleCharacterInteractions(post);
    return this._enrichPost(post);
  }

  async getFeed(): Promise<Moment[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const avatarContext = await this.buildMomentAvatarContext({
      ownerId: owner.id,
      ownerAvatar: owner.avatar,
    });
    const posts = await this.postRepo.find({ order: { postedAt: 'DESC' } });
    const visiblePosts = posts.filter((post) =>
      this.canOwnerViewPost(post, avatarContext.visibleCharacterIds),
    );
    return Promise.all(
      visiblePosts.map((post) => this._enrichPost(post, avatarContext)),
    );
  }

  async getPost(postId: string): Promise<Moment | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const avatarContext = await this.buildMomentAvatarContext({
      ownerId: owner.id,
      ownerAvatar: owner.avatar,
    });
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || !this.canOwnerViewPost(post, avatarContext.visibleCharacterIds))
      return null;
    return this._enrichPost(post, avatarContext);
  }

  async addOwnerComment(
    postId: string,
    text: string,
  ): Promise<MomentCommentEntity> {
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

  async addComment(
    postId: string,
    authorId: string,
    authorName: string,
    authorAvatar: string,
    text: string,
    authorType = 'user',
  ): Promise<MomentCommentEntity> {
    const comment = this.commentRepo.create({
      postId,
      authorId,
      authorName,
      authorAvatar,
      authorType,
      text,
    });
    const saved = await this.commentRepo.save(comment);
    await this.postRepo.increment({ id: postId }, 'commentCount', 1);
    // Schedule AI replies to user comment
    if (authorType === 'user') {
      void this.scheduleAiCommentReplies(postId, authorName, text);
    }
    return saved;
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

  async generateMomentForCharacter(
    characterId: string,
  ): Promise<Moment | null> {
    if (!(await this.isCharacterVisibleToOwner(characterId))) {
      return null;
    }

    const char = await this.characters.findById(characterId);
    const profile = await this.characters.getProfile(characterId);
    if (!char || !profile) return null;

    try {
      const text = await this.ai.generateMoment({
        profile,
        currentTime: new Date(),
        usageContext: {
          surface: 'app',
          scene: 'moment_post_generate',
          scopeType: 'character',
          scopeId: char.id,
          scopeLabel: char.name,
          characterId: char.id,
          characterName: char.name,
        },
      });
      if (!text) return null;

      const post = this.postRepo.create({
        authorId: characterId,
        authorName: char.name,
        authorAvatar: char.avatar,
        authorType: 'character',
        text,
        contentType: 'text',
        mediaPayload: this.serializeMomentMedia([]),
        generationKind: profile.realWorldContext?.realityMomentBrief
          ? 'reality_linked_ai'
          : 'routine_ai',
        generationMetadata: profile.realWorldContext
          ? {
              digestId: profile.realWorldContext.digestId ?? null,
              syncDate: profile.realWorldContext.syncDate ?? null,
              subjectName: profile.realWorldContext.subjectName ?? null,
              realityMomentBrief:
                profile.realWorldContext.realityMomentBrief ?? null,
            }
          : null,
      });
      await this.postRepo.save(post);
      await this.feedService.syncMomentPostToFeed(post, {
        sourceKind: 'character_generated',
      });

      // Schedule interactions from other characters (async, non-blocking)
      void this.scheduleCharacterInteractions(post);

      return this._enrichPost(post);
    } catch (err) {
      this.logger.error(`Failed to generate moment for ${characterId}`, err);
      return null;
    }
  }

  async generateAllMoments(): Promise<Moment[]> {
    const chars = await this.characters.findAllVisibleToOwner();
    const results: Moment[] = [];
    for (const char of chars) {
      const moment = await this.generateMomentForCharacter(char.id);
      if (moment) results.push(moment);
    }
    return results;
  }

  async saveUploadedMedia(
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname?: string;
      size: number;
    },
    metadata: { width?: number; height?: number; durationMs?: number },
  ): Promise<MomentMediaAsset> {
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    if (!isImage && !isVideo) {
      throw new BadRequestException('朋友圈当前仅支持图片或视频。');
    }

    const displayName = normalizeMomentMediaDisplayName(
      file.originalname,
      isImage ? 'moment-image' : 'moment-video',
      file.mimetype,
    );
    const extension = path.extname(displayName) || '.bin';
    const baseName = path.basename(displayName, extension) || 'moment-media';
    const storedFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeMomentMediaFileName(baseName)}${extension}`;
    const storageDir = this.resolveMomentMediaStorageDir();
    const normalizedMimeType = file.mimetype || 'application/octet-stream';

    await mkdir(storageDir, { recursive: true });
    await writeFile(path.join(storageDir, storedFileName), file.buffer);

    if (isImage) {
      const asset: MomentImageAsset = {
        id: storedFileName,
        kind: 'image',
        url: `${this.resolvePublicApiBaseUrl()}/api/moments/media/${storedFileName}`,
        thumbnailUrl: `${this.resolvePublicApiBaseUrl()}/api/moments/media/${storedFileName}`,
        mimeType: normalizedMimeType,
        fileName: displayName,
        size: file.size,
        width: normalizeOptionalPositiveNumber(metadata.width),
        height: normalizeOptionalPositiveNumber(metadata.height),
      };
      return asset;
    }

    const asset: MomentVideoAsset = {
      id: storedFileName,
      kind: 'video',
      url: `${this.resolvePublicApiBaseUrl()}/api/moments/media/${storedFileName}`,
      mimeType: normalizedMimeType,
      fileName: displayName,
      size: file.size,
      width: normalizeOptionalPositiveNumber(metadata.width),
      height: normalizeOptionalPositiveNumber(metadata.height),
      durationMs: normalizeOptionalPositiveNumber(metadata.durationMs),
    };
    return asset;
  }

  resolveMomentMediaFilePath(fileName: string): string {
    return resolveReadableMomentMediaPath(fileName);
  }

  normalizeMomentMediaFileName(fileName: string): string {
    const normalized = path.basename(fileName).trim();
    if (!normalized) {
      throw new NotFoundException('Moment media not found');
    }

    return normalized;
  }

  private async scheduleCharacterInteractions(post: MomentPostEntity) {
    const visibleCharacterIds = await this.getVisibleCharacterIdSet();
    if (
      post.authorType === 'character' &&
      !visibleCharacterIds.has(post.authorId)
    ) {
      return;
    }

    const allChars = (await this.characters.findAllVisibleToOwner()).filter(
      (character) =>
        character.id !== post.authorId && visibleCharacterIds.has(character.id),
    );

    allChars.forEach((char, i) => {
      const freq = char.activityFrequency ?? 'normal';
      const interactChance = freq === 'high' ? 0.6 : freq === 'low' ? 0.2 : 0.4;
      if (Math.random() > interactChance) return;

      // Delay based on activity frequency
      const baseDelay =
        freq === 'high'
          ? 2 * 60 * 1000 // 2 min
          : freq === 'low'
            ? 2 * 60 * 60 * 1000 // 2 hours
            : 15 * 60 * 1000; // 15 min

      const delay = baseDelay + Math.random() * baseDelay + i * 3000;

      setTimeout(() => {
        void (async () => {
          try {
            if (!(await this.isCharacterVisibleToOwner(char.id))) {
              return;
            }
            if (
              post.authorType === 'character' &&
              !(await this.isCharacterVisibleToOwner(post.authorId))
            ) {
              return;
            }

            const isComment = Math.random() < 0.4;
            if (isComment) {
              const profile = await this.characters.getProfile(char.id);
              if (!profile) return;
              const observation = await this.buildMomentAiObservation(post);
              const reply = await this.ai.generateReply({
                profile,
                conversationHistory: [],
                userMessage: `${post.authorName}发了一条朋友圈：${observation.summary}。用一句话自然地评论一下，不超过20字。`,
                userMessageParts: observation.parts,
                usageContext: {
                  surface: 'app',
                  scene: 'moment_comment_generate',
                  scopeType: 'character',
                  scopeId: char.id,
                  scopeLabel: char.name,
                  characterId: char.id,
                  characterName: char.name,
                },
              });
              await this.addComment(
                post.id,
                char.id,
                char.name,
                char.avatar,
                reply.text,
                'character',
              );
              return;
            }

            await this.toggleLike(
              post.id,
              char.id,
              char.name,
              char.avatar,
              'character',
            );
          } catch {
            // ignore
          }
        })();
      }, delay);
    });
  }

  private async scheduleAiCommentReplies(
    postId: string,
    commenterName: string,
    commentText: string,
  ) {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || post.authorType !== 'character') return;
    if (!(await this.isCharacterVisibleToOwner(post.authorId))) return;

    const char = await this.characters.findById(post.authorId);
    if (!char) return;

    const delay = 30000 + Math.random() * 60000; // 30s - 90s
    setTimeout(() => {
      void (async () => {
        try {
          if (!(await this.isCharacterVisibleToOwner(char.id))) {
            return;
          }

          const profile = await this.characters.getProfile(char.id);
          if (!profile) return;
          const observation = await this.buildMomentAiObservation(post);

          const reply = await this.ai.generateReply({
            profile,
            conversationHistory: [],
            userMessage: `${commenterName}在你的朋友圈评论了："${commentText}"，你的朋友圈内容是：${observation.summary}，回复一下，不超过20字。`,
            userMessageParts: observation.parts,
            usageContext: {
              surface: 'app',
              scene: 'moment_comment_generate',
              scopeType: 'character',
              scopeId: char.id,
              scopeLabel: char.name,
              characterId: char.id,
              characterName: char.name,
            },
          });
          await this.addComment(
            postId,
            char.id,
            char.name,
            char.avatar,
            reply.text,
            'character',
          );
        } catch {
          // ignore
        }
      })();
    }, delay);
  }

  private async getVisibleCharacterIds(): Promise<string[]> {
    const blockedCharacterIds = new Set(
      await this.socialService.getBlockedCharacterIds(),
    );
    const characters = await this.characters.findAllVisibleToOwner();
    return characters
      .map((character) => character.id)
      .filter((characterId) => !blockedCharacterIds.has(characterId));
  }

  private async getVisibleCharacterIdSet(): Promise<Set<string>> {
    return new Set(await this.getVisibleCharacterIds());
  }

  private async isCharacterVisibleToOwner(
    characterId: string,
  ): Promise<boolean> {
    return (await this.getVisibleCharacterIdSet()).has(characterId);
  }

  private canOwnerViewPost(
    post: MomentPostEntity,
    visibleCharacterIds: Set<string>,
  ): boolean {
    return (
      post.authorType !== 'character' || visibleCharacterIds.has(post.authorId)
    );
  }

  private async assertOwnerCanInteractWithPost(
    postId: string,
  ): Promise<MomentPostEntity> {
    const visibleCharacterIds = await this.getVisibleCharacterIdSet();
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || !this.canOwnerViewPost(post, visibleCharacterIds)) {
      throw new NotFoundException('Moment not found');
    }
    return post;
  }

  private async _enrichPost(
    post: MomentPostEntity,
    avatarContext?: MomentAvatarContext,
  ): Promise<Moment> {
    const resolvedAvatarContext =
      avatarContext ?? (await this.buildMomentAvatarContext());
    const [likes, comments] = await Promise.all([
      this.likeRepo.find({
        where: { postId: post.id },
        order: { createdAt: 'ASC' },
      }),
      this.commentRepo.find({
        where: { postId: post.id },
        order: { createdAt: 'ASC' },
      }),
    ]);
    const visibleLikes = likes.filter(
      (like) =>
        like.authorType !== 'character' ||
        resolvedAvatarContext.visibleCharacterIds.has(like.authorId),
    );
    const visibleComments = comments.filter(
      (comment) =>
        comment.authorType !== 'character' ||
        resolvedAvatarContext.visibleCharacterIds.has(comment.authorId),
    );
    const serializedLikes = visibleLikes.map((like) =>
      this.serializeMomentLike(like, resolvedAvatarContext),
    );
    const serializedComments = visibleComments.map((comment) =>
      this.serializeMomentComment(comment, resolvedAvatarContext),
    );

    return {
      id: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      authorAvatar: this.resolveMomentAuthorAvatar(
        post.authorType,
        post.authorId,
        post.authorAvatar,
        resolvedAvatarContext,
      ),
      authorType: post.authorType,
      text: post.text,
      location: post.location,
      contentType: this.normalizeMomentContentType(post.contentType),
      media: this.parseMomentMediaPayload(post.mediaPayload),
      postedAt: post.postedAt,
      likeCount: serializedLikes.length,
      commentCount: serializedComments.length,
      likes: serializedLikes,
      comments: serializedComments,
      interactions: [
        ...serializedLikes.map((like) => ({
          characterId: like.authorId,
          characterName: like.authorName,
          type: 'like' as const,
          createdAt: like.createdAt,
        })),
        ...serializedComments.map((comment) => ({
          characterId: comment.authorId,
          characterName: comment.authorName,
          type: 'comment' as const,
          commentText: comment.text,
          createdAt: comment.createdAt,
        })),
      ],
    };
  }

  private serializeMomentLike(
    like: MomentLikeEntity,
    avatarContext: MomentAvatarContext,
  ): MomentLikeEntity {
    return {
      ...like,
      authorAvatar: this.resolveMomentAuthorAvatar(
        like.authorType,
        like.authorId,
        like.authorAvatar,
        avatarContext,
      ),
    };
  }

  private serializeMomentComment(
    comment: MomentCommentEntity,
    avatarContext: MomentAvatarContext,
  ): MomentCommentEntity {
    return {
      ...comment,
      authorAvatar: this.resolveMomentAuthorAvatar(
        comment.authorType,
        comment.authorId,
        comment.authorAvatar,
        avatarContext,
      ),
    };
  }

  private async buildMomentAvatarContext(input?: {
    ownerId?: string;
    ownerAvatar?: string | null;
  }): Promise<MomentAvatarContext> {
    const owner =
      input?.ownerId === undefined
        ? await this.worldOwnerService.getOwnerOrThrow()
        : {
            id: input.ownerId,
            avatar: input.ownerAvatar ?? '',
          };
    const visibleCharacters = await this.characters.findAllVisibleToOwner(
      owner.id,
    );

    return {
      ownerAvatar: owner.avatar?.trim() || '',
      ownerId: owner.id,
      visibleCharacterIds: new Set(
        visibleCharacters.map((character) => character.id),
      ),
      characterAvatarById: new Map(
        visibleCharacters.map((character) => [
          character.id,
          character.avatar,
        ]),
      ),
    };
  }

  private resolveMomentAuthorAvatar(
    authorType: string | null | undefined,
    authorId: string | null | undefined,
    currentAvatar: string | null | undefined,
    avatarContext: MomentAvatarContext,
  ) {
    if (authorType === 'character' && authorId) {
      return avatarContext.characterAvatarById.get(authorId) ?? currentAvatar ?? '';
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

  private async backfillMomentAuthorAvatars() {
    const [owner, characters, posts, comments, likes] = await Promise.all([
      this.worldOwnerService.getOwnerOrThrow(),
      this.characters.findAll(),
      this.postRepo.find(),
      this.commentRepo.find(),
      this.likeRepo.find(),
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

    const pendingPostUpdates = posts.reduce<MomentPostEntity[]>(
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
    const pendingCommentUpdates = comments.reduce<MomentCommentEntity[]>(
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
    const pendingLikeUpdates = likes.reduce<MomentLikeEntity[]>(
      (updates, like) => {
        const nextAvatar = resolveAvatar(
          like.authorType,
          like.authorId,
          like.authorAvatar,
        );
        if (nextAvatar && nextAvatar !== like.authorAvatar) {
          updates.push({ ...like, authorAvatar: nextAvatar });
        }
        return updates;
      },
      [],
    );

    await Promise.all([
      pendingPostUpdates.length > 0 ? this.postRepo.save(pendingPostUpdates) : null,
      pendingCommentUpdates.length > 0
        ? this.commentRepo.save(pendingCommentUpdates)
        : null,
      pendingLikeUpdates.length > 0 ? this.likeRepo.save(pendingLikeUpdates) : null,
    ]);
  }

  private normalizeCreateMomentInput(input: CreateMomentInput) {
    const text = input.text?.trim() ?? '';
    const location = input.location?.trim() || undefined;
    const media = this.normalizeMomentMediaInput(input.media);
    const inferredContentType = this.inferMomentContentType(media);
    const contentType = this.normalizeMomentContentType(
      input.contentType ?? inferredContentType,
    );

    if (!text && media.length === 0) {
      throw new BadRequestException('朋友圈内容和媒体不能同时为空。');
    }

    this.assertMomentMediaMatchesContentType(contentType, media);

    return {
      text,
      location,
      contentType,
      media,
    };
  }

  private normalizeMomentMediaInput(input: MomentMediaAsset[] | undefined) {
    if (!Array.isArray(input) || input.length === 0) {
      return [];
    }

    return input.map((asset, index) =>
      this.normalizeMomentMediaAsset(asset, index),
    );
  }

  private normalizeMomentMediaAsset(
    asset: MomentMediaAsset,
    index: number,
  ): MomentMediaAsset {
    if (asset.kind === 'video') {
      return {
        id: asset.id?.trim() || `moment-video-${index + 1}`,
        kind: 'video',
        url: asset.url?.trim() || '',
        posterUrl: asset.posterUrl?.trim() || undefined,
        mimeType: asset.mimeType?.trim() || 'video/mp4',
        fileName: asset.fileName?.trim() || `video-${index + 1}`,
        size: Math.max(0, Math.round(asset.size ?? 0)),
        width: normalizeOptionalPositiveNumber(asset.width),
        height: normalizeOptionalPositiveNumber(asset.height),
        durationMs: normalizeOptionalPositiveNumber(asset.durationMs),
      };
    }

    return {
      id: asset.id?.trim() || `moment-image-${index + 1}`,
      kind: 'image',
      url: asset.url?.trim() || '',
      thumbnailUrl:
        asset.thumbnailUrl?.trim() || asset.url?.trim() || undefined,
      mimeType: asset.mimeType?.trim() || 'image/jpeg',
      fileName: asset.fileName?.trim() || `image-${index + 1}`,
      size: Math.max(0, Math.round(asset.size ?? 0)),
      width: normalizeOptionalPositiveNumber(asset.width),
      height: normalizeOptionalPositiveNumber(asset.height),
      livePhoto: asset.livePhoto?.enabled
        ? {
            enabled: true,
            motionUrl: asset.livePhoto.motionUrl?.trim() || undefined,
          }
        : undefined,
    };
  }

  private inferMomentContentType(media: MomentMediaAsset[]): MomentContentType {
    if (media.length === 0) {
      return 'text';
    }

    if (media.some((asset) => asset.kind === 'video')) {
      return 'video';
    }

    if (
      media.some((asset) => asset.kind === 'image' && asset.livePhoto?.enabled)
    ) {
      return 'live_photo';
    }

    return 'image_album';
  }

  private normalizeMomentContentType(value?: string): MomentContentType {
    return value === 'image_album' ||
      value === 'video' ||
      value === 'live_photo'
      ? value
      : 'text';
  }

  private assertMomentMediaMatchesContentType(
    contentType: MomentContentType,
    media: MomentMediaAsset[],
  ) {
    if (contentType === 'text') {
      if (media.length > 0) {
        throw new BadRequestException('纯文本朋友圈不能附带图片或视频。');
      }
      return;
    }

    if (contentType === 'video') {
      if (media.length !== 1 || media[0]?.kind !== 'video') {
        throw new BadRequestException('视频朋友圈必须且只能包含 1 条视频。');
      }

      if (
        (media[0] as MomentVideoAsset).durationMs &&
        (media[0] as MomentVideoAsset).durationMs! > 300000
      ) {
        throw new BadRequestException('朋友圈视频时长不能超过 5 分钟。');
      }
      return;
    }

    if (media.length < 1 || media.length > 9) {
      throw new BadRequestException('图片朋友圈最多支持 9 张图片。');
    }

    if (media.some((asset) => asset.kind !== 'image')) {
      throw new BadRequestException('图片朋友圈当前只支持图片资源。');
    }
  }

  private serializeMomentMedia(media: MomentMediaAsset[]) {
    return media.length ? JSON.stringify(media) : undefined;
  }

  private parseMomentMediaPayload(payload?: string | null): MomentMediaAsset[] {
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
          this.normalizeMomentMediaAsset(asset as MomentMediaAsset, index),
        )
        .filter((asset) => asset.url);
    } catch {
      return [];
    }
  }

  private buildMomentPromptSummary(post: MomentPostEntity) {
    const media = this.parseMomentMediaPayload(post.mediaPayload);
    const text = post.text?.trim();
    const mediaSummary = this.describeMomentMedia(
      this.normalizeMomentContentType(post.contentType),
      media,
    );

    if (text && mediaSummary) {
      return `“${text}”，并配有${mediaSummary}`;
    }

    if (text) {
      return `“${text}”`;
    }

    if (mediaSummary) {
      return `一条配有${mediaSummary}的朋友圈`;
    }

    return '一条朋友圈';
  }

  private async buildMomentAiObservation(post: MomentPostEntity): Promise<{
    summary: string;
    parts?: AiMessagePart[];
  }> {
    const media = this.parseMomentMediaPayload(post.mediaPayload);
    const parts: AiMessagePart[] = [];
    const contentType = this.normalizeMomentContentType(post.contentType);
    const summary = this.buildMomentPromptSummary(post);

    media
      .filter((asset): asset is MomentImageAsset => asset.kind === 'image')
      .slice(0, 4)
      .forEach((asset, index) => {
        parts.push({
          type: 'image',
          imageUrl: asset.url,
          mimeType: asset.mimeType,
          detail: 'auto',
          altText: `朋友圈配图 ${index + 1}`,
        });
      });

    if (contentType === 'video') {
      const video = media[0] as MomentVideoAsset | undefined;
      if (video?.posterUrl) {
        parts.push({
          type: 'image',
          imageUrl: video.posterUrl,
          detail: 'auto',
          altText: '朋友圈视频封面',
        });
      }
    }

    return {
      summary:
        (await this.appendMomentTranscriptSummary(summary, media)) ?? summary,
      parts: parts.length ? parts : undefined,
    };
  }

  private async appendMomentTranscriptSummary(
    summary: string,
    media: MomentMediaAsset[],
  ) {
    const video = media.find(
      (asset): asset is MomentVideoAsset => asset.kind === 'video',
    );
    if (!video) {
      return null;
    }

    const transcription = await this.ai.tryTranscribeMediaFromUrl({
      url: video.url,
      mimeType: video.mimeType,
      fileName: video.fileName,
      mode: 'moment_media',
    });
    if (!transcription?.text) {
      return null;
    }

    return `${summary}。视频音轨转写：${transcription.text}`;
  }

  private describeMomentMedia(
    contentType: MomentContentType,
    media: MomentMediaAsset[],
  ) {
    if (!media.length) {
      return '';
    }

    if (contentType === 'video') {
      const video = media[0] as MomentVideoAsset | undefined;
      if (!video) {
        return '1 条视频';
      }

      return video.durationMs
        ? `1 条时长约 ${Math.round(video.durationMs / 1000)} 秒的视频`
        : '1 条视频';
    }

    const imageCount = media.filter((asset) => asset.kind === 'image').length;
    if (contentType === 'live_photo') {
      return `${imageCount} 张图片（含实况照片）`;
    }

    return `${imageCount} 张图片`;
  }

  private resolveMomentMediaStorageDir(): string {
    return resolvePrimaryMomentMediaStorageDir();
  }

  private resolvePublicApiBaseUrl(): string {
    return (
      process.env.PUBLIC_API_BASE_URL?.trim() ||
      `http://localhost:${process.env.PORT ?? 3000}`
    ).replace(/\/+$/, '');
  }
}
