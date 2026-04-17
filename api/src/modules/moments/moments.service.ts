import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
import { FeedService } from '../feed/feed.service';
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

@Injectable()
export class MomentsService {
  private readonly logger = new Logger(MomentsService.name);

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly socialService: SocialService,
    private readonly feedService: FeedService,
    @InjectRepository(MomentEntity)
    private momentRepo: Repository<MomentEntity>,
    @InjectRepository(MomentPostEntity)
    private postRepo: Repository<MomentPostEntity>,
    @InjectRepository(MomentCommentEntity)
    private commentRepo: Repository<MomentCommentEntity>,
    @InjectRepository(MomentLikeEntity)
    private likeRepo: Repository<MomentLikeEntity>,
  ) {}

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
    // Schedule AI reactions to user's moment
    void this.scheduleCharacterInteractions(post);
    return this._enrichPost(post);
  }

  async getFeed(): Promise<Moment[]> {
    const visibleCharacterIds = await this.getVisibleCharacterIdSet();
    const posts = await this.postRepo.find({ order: { postedAt: 'DESC' } });
    const visiblePosts = posts.filter((post) =>
      this.canOwnerViewPost(post, visibleCharacterIds),
    );
    return Promise.all(visiblePosts.map((post) => this._enrichPost(post)));
  }

  async getPost(postId: string): Promise<Moment | null> {
    const visibleCharacterIds = await this.getVisibleCharacterIdSet();
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || !this.canOwnerViewPost(post, visibleCharacterIds)) return null;
    return this._enrichPost(post);
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
    const chars = await this.characters.findAll();
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

    const allChars = (await this.characters.findAll()).filter(
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
              const reply = await this.ai.generateReply({
                profile,
                conversationHistory: [],
                userMessage: `${post.authorName}发了一条朋友圈：${this.buildMomentPromptSummary(post)}。用一句话自然地评论一下，不超过20字。`,
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

          const reply = await this.ai.generateReply({
            profile,
            conversationHistory: [],
            userMessage: `${commenterName}在你的朋友圈评论了："${commentText}"，你的朋友圈内容是：${this.buildMomentPromptSummary(post)}，回复一下，不超过20字。`,
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
    const characters = await this.characters.findAll();
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

  private async _enrichPost(post: MomentPostEntity): Promise<Moment> {
    const visibleCharacterIds = await this.getVisibleCharacterIdSet();
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
        visibleCharacterIds.has(like.authorId),
    );
    const visibleComments = comments.filter(
      (comment) =>
        comment.authorType !== 'character' ||
        visibleCharacterIds.has(comment.authorId),
    );

    return {
      id: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      authorAvatar: post.authorAvatar,
      authorType: post.authorType,
      text: post.text,
      location: post.location,
      contentType: this.normalizeMomentContentType(post.contentType),
      media: this.parseMomentMediaPayload(post.mediaPayload),
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
