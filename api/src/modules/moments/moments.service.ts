import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import type { AiMessagePart, PersonalityProfile } from '../ai/ai.types';
import { pickThemeAndStyle } from './music-theme-catalog';
import { REMINDER_CHARACTER_ID } from '../characters/reminder-character';
import { CharactersService } from '../characters/characters.service';
import { MomentEntity } from './moment.entity';
import { MomentPostEntity } from './moment-post.entity';
import { MomentCommentEntity } from './moment-comment.entity';
import { MomentLikeEntity } from './moment-like.entity';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SocialService } from '../social/social.service';
import { CharacterFriendshipService } from '../social/character-friendship.service';
import {
  NPC_USER_POST_NEUTRAL_INTIMACY,
  npcIntimacyMultiplier,
  npcPostRecencyMultiplier,
  npcRelationCoolingFactor,
} from '../social/npc-engagement.utils';
import { FeedService } from '../feed/feed.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import { ReminderRuntimeService } from '../reminder-runtime/reminder-runtime.service';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
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
  type MomentAudioAsset,
  type MomentContentType,
  type MomentImageAsset,
  type MomentMediaAsset,
  type MomentVideoAsset,
} from './moment-media.types';
import { MinimaxJobService } from '../minimax/minimax-job.service';
import { MinimaxQuotaService } from '../minimax/minimax-quota.service';
import { MinimaxClient, MinimaxClientError } from '../minimax/minimax.client';
import { MinimaxAssetStorage } from '../minimax/minimax-asset.storage';
import { WorldLanguageService } from '../config/world-language.service';
import type { MinimaxJobEntity } from '../minimax/minimax-job.entity';
import type { CharacterEntity } from '../characters/character.entity';

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
  visibility: string;
  canInteract: boolean;
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
  ownerFriendCharacterIds: Set<string>;
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
    private readonly characterFriendships: CharacterFriendshipService,
    private readonly feedService: FeedService,
    private readonly cyberAvatar: CyberAvatarService,
    private readonly reminderRuntime: ReminderRuntimeService,
    private readonly minimaxJobs: MinimaxJobService,
    private readonly minimaxQuota: MinimaxQuotaService,
    private readonly minimaxClient: MinimaxClient,
    private readonly minimaxStorage: MinimaxAssetStorage,
    private readonly worldLanguage: WorldLanguageService,
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
    await this.backfillUserMomentVisibilityToFriends();
    await this.backfillCharacterMomentsToFeed();
    await this.cleanupLegacyDemoMomentPosts();
  }

  // 跟 feed.service 的 cleanupLegacyDemoChannelPosts 对称：May 9 切真生成之前
  // moments 也用 3 个 legacy 视频文件做兜底，部分账号库还囤着
  // 「MiniMax M1 拍了一段画面记录今天。」这样的模板朋友圈。这里硬删 post 本体
  // + 关联 moment_likes / moment_comments。重复执行无副作用。
  private async cleanupLegacyDemoMomentPosts() {
    try {
      const LEGACY_FILES = [
        '1778311410821-a746c78f-minimax-video.mp4',
        '1778311950732-f23b70af-minimax-video.mp4',
        '1778311207586-814b332b-minimax-video.mp4',
      ];
      const qb = this.postRepo.createQueryBuilder('post');
      const orClauses = LEGACY_FILES.map(
        (file, idx) => `post.mediaPayload LIKE :file${idx}`,
      ).join(' OR ');
      const params: Record<string, string> = {};
      LEGACY_FILES.forEach((file, idx) => {
        params[`file${idx}`] = `%${file}%`;
      });
      const candidates = await qb.where(orClauses, params).getMany();
      if (candidates.length === 0) return;

      const ids = candidates.map((post) => post.id);
      await this.commentRepo.delete({ postId: In(ids) });
      await this.likeRepo.delete({ postId: In(ids) });
      await this.postRepo.delete({ id: In(ids) });
      this.logger.log(
        `cleanupLegacyDemoMomentPosts: deleted ${ids.length} demo-era moment_post(s) + child rows`,
      );
    } catch (error) {
      this.logger.warn(
        `cleanupLegacyDemoMomentPosts failed: ${(error as Error).message}`,
      );
    }
  }

  async createUserMoment(input: CreateMomentInput): Promise<Moment> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const normalizedInput = this.normalizeCreateMomentInput(input);
    const post = this.postRepo.create({
      authorId: owner.id,
      authorName: owner.username?.trim() || 'You',
      authorAvatar: owner.avatar ?? '',
      authorType: 'user',
      visibility: normalizedInput.visibility,
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

  /**
   * 朋友圈分页拉取。
   * - 不传分页参数：保留旧行为（一次返回全部已过滤的 Moment[]），用于历史调用方（搜索索引、share 卡片等）。
   * - 传入 page/limit：返回 { items, total, hasMore }，配合前端无限滚动。
   * 内部统一走 batchEnrich（按 postId IN(...) 一次拉 likes + 一次拉 comments），消除 N+1。
   */
  async getFeed(): Promise<Moment[]>;
  async getFeed(input: {
    page?: number;
    limit?: number;
  }): Promise<{ items: Moment[]; total: number; hasMore: boolean }>;
  async getFeed(
    input?: { page?: number; limit?: number },
  ): Promise<Moment[] | { items: Moment[]; total: number; hasMore: boolean }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const avatarContext = await this.buildMomentAvatarContext({
      ownerId: owner.id,
      ownerAvatar: owner.avatar,
    });
    const posts = await this.postRepo.find({ order: { postedAt: 'DESC' } });
    const visiblePosts = posts.filter((post) =>
      this.canOwnerViewPost(
        post,
        avatarContext.visibleCharacterIds,
        avatarContext.ownerFriendCharacterIds,
      ),
    );

    if (!input) {
      return this._batchEnrichPosts(visiblePosts, avatarContext);
    }

    const page = Math.max(1, Math.floor(input.page ?? 1));
    const rawLimit = Math.floor(input.limit ?? 20);
    const limit = Math.min(50, Math.max(1, rawLimit));
    const start = (page - 1) * limit;
    const pageSlice = visiblePosts.slice(start, start + limit);
    const items = await this._batchEnrichPosts(pageSlice, avatarContext);
    return {
      items,
      total: visiblePosts.length,
      hasMore: start + limit < visiblePosts.length,
    };
  }

  async getPost(postId: string): Promise<Moment | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const avatarContext = await this.buildMomentAvatarContext({
      ownerId: owner.id,
      ownerAvatar: owner.avatar,
    });
    const post = await this.postRepo.findOneBy({ id: postId });
    if (
      !post ||
      !this.canOwnerViewPost(
        post,
        avatarContext.visibleCharacterIds,
        avatarContext.ownerFriendCharacterIds,
      )
    )
      return null;
    return this._enrichPost(post, avatarContext);
  }

  async addOwnerComment(
    postId: string,
    text: string,
    replyTo?: {
      replyToCommentId?: string | null;
      replyToAuthorId?: string | null;
    },
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
      replyTo,
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
    replyTo?: {
      replyToCommentId?: string | null;
      replyToAuthorId?: string | null;
    },
  ): Promise<MomentCommentEntity> {
    const replyToCommentId = replyTo?.replyToCommentId?.trim() || null;
    let replyToAuthorId = replyTo?.replyToAuthorId?.trim() || null;
    if (replyToCommentId && !replyToAuthorId) {
      const target = await this.commentRepo.findOneBy({ id: replyToCommentId });
      replyToAuthorId = target?.authorId ?? null;
    }
    const comment = this.commentRepo.create({
      postId,
      authorId,
      authorName,
      authorAvatar,
      authorType,
      text,
      replyToCommentId,
      replyToAuthorId,
    });
    const saved = await this.commentRepo.save(comment);
    await this.postRepo.increment({ id: postId }, 'commentCount', 1);
    // 朋友圈评论的 AI 回复链：
    // - 用户评论 / 其他角色评论 → 安排世界角色去回复
    // - 已经是「回复」的评论本身不再触发新回复，避免无限套娃
    if (!replyToCommentId) {
      void this.scheduleAiCommentReplies(postId, {
        commentId: saved.id,
        authorId,
        authorName,
        authorType,
        text,
      });
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

  async deleteOwnerPost(postId: string): Promise<{ success: true; id: string }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) {
      throw new AppError('MOMENT_NOT_FOUND', {
        legacyMessage: '该朋友圈不存在或已被删除。',
        status: HttpStatus.NOT_FOUND,
      });
    }
    if (post.authorType !== 'user' || post.authorId !== owner.id) {
      throw new AppError('MOMENT_DELETE_FORBIDDEN', {
        legacyMessage: '只能删除自己发布的朋友圈。',
        status: HttpStatus.FORBIDDEN,
      });
    }
    await this.commentRepo.delete({ postId });
    await this.likeRepo.delete({ postId });
    await this.postRepo.delete(postId);
    return { success: true, id: postId };
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
      const currentTime = new Date();
      const reminderMoment =
        characterId === REMINDER_CHARACTER_ID
          ? await this.reminderRuntime.buildMomentNudgePayload({
              now: currentTime,
              seedKey: `manual:${currentTime.toISOString().slice(0, 10)}`,
            })
          : null;
      const text =
        reminderMoment?.text ??
        (await this.ai.generateMoment({
          profile,
          currentTime,
          usageContext: {
            surface: 'app',
            scene: 'moment_post_generate',
            scopeType: 'character',
            scopeId: char.id,
            scopeLabel: char.name,
            characterId: char.id,
            characterName: char.name,
          },
        }));
      if (!text) return null;

      const post = this.postRepo.create({
        authorId: characterId,
        authorName: char.name,
        authorAvatar: char.avatar,
        authorType: 'character',
        visibility: this.deriveDefaultVisibility(char.socialOpenness),
        text,
        contentType: 'text',
        mediaPayload: this.serializeMomentMedia([]),
        // 把时间戳推到过去 0-15 分钟随机点，避免 cron tick 把分钟卡在 00/15/30/45。
        postedAt: this.jitterPastTimestamp(15 * 60 * 1000),
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
      // 镜像到广场时保留 moment 的抖动 postedAt，让两边时间一致。
      await this.feedService.syncMomentPostToFeed(post, {
        sourceKind: 'character_generated',
        preserveTimestamp: true,
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
      throw new AppError('MOMENTS_INVALID_MEDIA_TYPE', {
        legacyMessage: '朋友圈当前仅支持图片或视频。',
      });
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
      throw new AppError('MOMENTS_MEDIA_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Moment media not found',
      });
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

    let allChars = (await this.characters.findAllVisibleToOwner()).filter(
      (character) =>
        character.id !== post.authorId && visibleCharacterIds.has(character.id),
    );

    // 朋友圈是「好友圈」语义：所有帖子的点赞/评论候选都只从已加好友的角色里挑，
    // 与 canOwnerViewPost / _enrichPost 的展示门控保持一致。
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendCharacterIds =
      await this.characters.getActiveFriendCharacterIdSet(owner.id);
    allChars = allChars.filter((character) =>
      friendCharacterIds.has(character.id),
    );

    const intimacyByCharId = new Map<string, number>();
    if (post.authorType === 'character') {
      await Promise.all(
        allChars.map(async (char) => {
          const intimacy = await this.characterFriendships.getIntimacy(
            char.id,
            post.authorId,
          );
          intimacyByCharId.set(char.id, intimacy);
        }),
      );
    }

    allChars.forEach((char, i) => {
      const freq = char.activityFrequency ?? 'normal';
      // 改前 0.6 / 0.4 / 0.2，改后约 1/3
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

      // Delay based on activity frequency; closer friends react sooner
      const baseDelay =
        freq === 'high'
          ? 2 * 60 * 1000 // 2 min
          : freq === 'low'
            ? 2 * 60 * 60 * 1000 // 2 hours
            : 15 * 60 * 1000; // 15 min

      const intimacySpeedup = Math.max(0.3, 1 - intimacy / 150);
      const delay =
        (baseDelay + Math.random() * baseDelay + i * 3000) * intimacySpeedup;

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
              if (
                char.id === REMINDER_CHARACTER_ID &&
                post.authorType === 'user'
              ) {
                const reminderComment =
                  await this.reminderRuntime.buildMomentCommentNudgeText({
                    seedKey: post.id,
                    limit: 2,
                  });
                if (reminderComment) {
                  await this.addComment(
                    post.id,
                    char.id,
                    char.name,
                    char.avatar,
                    reminderComment,
                    'character',
                  );
                  return;
                }
              }

              const profile = await this.characters.getProfile(char.id);
              if (!profile) return;
              const observation = await this.buildMomentAiObservation(post);
              const userMessage = await this.worldLanguage.formatPostCommentTask({
                authorName: post.authorName,
                summary: observation.summary,
                surface: 'moments',
              });
              const reply = await this.ai.generateReply({
                profile,
                conversationHistory: [],
                userMessage,
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
              if (post.authorType === 'character') {
                await this.characterFriendships.bumpInteraction(
                  char.id,
                  post.authorId,
                );
              }
              return;
            }

            await this.toggleLike(
              post.id,
              char.id,
              char.name,
              char.avatar,
              'character',
            );
            if (post.authorType === 'character') {
              await this.characterFriendships.bumpInteraction(
                char.id,
                post.authorId,
              );
            }
          } catch {
            // ignore
          }
        })();
      }, delay);
    });
  }

  private async scheduleAiCommentReplies(
    postId: string,
    sourceComment: {
      commentId: string;
      authorId: string;
      authorName: string;
      authorType?: string;
      text: string;
    },
  ) {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || post.authorType !== 'character') return;

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const [visibleCharacterIds, friendCharacterIds] = await Promise.all([
      this.getVisibleCharacterIdSet(),
      this.characters.getActiveFriendCharacterIdSet(owner.id),
    ]);

    if (
      !visibleCharacterIds.has(post.authorId) ||
      !friendCharacterIds.has(post.authorId)
    ) {
      return;
    }

    // 来源评论者：若是角色，必须是已加好友（与展示门控保持一致）；
    // 用户自己的评论也允许触发。
    if (
      sourceComment.authorType === 'character' &&
      !friendCharacterIds.has(sourceComment.authorId)
    ) {
      return;
    }

    // 候选回复者集合：
    // 1) 贴主本人（贴主不能回复自己的评论）
    // 2) 30% 概率再随机挑一个「围观」好友角色插话
    const repliers: { id: string; name: string; avatar: string }[] = [];

    if (post.authorId !== sourceComment.authorId) {
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
      const allFriends = (await this.characters.findAllVisibleToOwner()).filter(
        (c) =>
          friendCharacterIds.has(c.id) &&
          visibleCharacterIds.has(c.id) &&
          c.id !== post.authorId &&
          c.id !== sourceComment.authorId,
      );
      if (allFriends.length > 0) {
        const bystander =
          allFriends[Math.floor(Math.random() * allFriends.length)];
        repliers.push({
          id: bystander.id,
          name: bystander.name,
          avatar: bystander.avatar,
        });
      }
    }

    if (repliers.length === 0) return;

    repliers.forEach((replier, index) => {
      const delay = 30000 + Math.random() * 60000 + index * 15000; // 30-90s，错开
      setTimeout(() => {
        void (async () => {
          try {
            if (!(await this.isCharacterVisibleToOwner(replier.id))) return;

            const profile = await this.characters.getProfile(replier.id);
            if (!profile) return;
            const observation = await this.buildMomentAiObservation(post);

            const isPostAuthor = replier.id === post.authorId;
            const userMessage =
              await this.worldLanguage.formatPostCommentReplyTask({
                postAuthorName: post.authorName,
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
                scene: 'moment_comment_generate',
                scopeType: 'character',
                scopeId: replier.id,
                scopeLabel: replier.name,
                characterId: replier.id,
                characterName: replier.name,
              },
            });
            await this.addComment(
              postId,
              replier.id,
              replier.name,
              replier.avatar,
              reply.text,
              'character',
              {
                replyToCommentId: sourceComment.commentId,
                replyToAuthorId: sourceComment.authorId,
              },
            );
          } catch {
            // ignore
          }
        })();
      }, delay);
    });
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
    ownerFriendCharacterIds?: Set<string>,
  ): boolean {
    if (post.authorType !== 'character') return true;
    if (!visibleCharacterIds.has(post.authorId)) return false;
    if (post.visibility === 'private') return false;
    // 朋友圈是「好友圈」语义：未加好友的角色无论是 public 还是 friends 都不在这里露出。
    // （想看所有角色的动态请去广场页面，那里走 feed.service 的查询，不受这个门控约束。）
    return !!ownerFriendCharacterIds?.has(post.authorId);
  }

  private canOwnerInteractWithPost(
    post: MomentPostEntity,
    ownerFriendCharacterIds: Set<string>,
    ownerId: string,
  ): boolean {
    if (post.authorType === 'user') {
      return true;
    }
    if (post.authorType === 'character') {
      return ownerFriendCharacterIds.has(post.authorId);
    }
    return post.authorId === ownerId;
  }

  private async assertOwnerCanInteractWithPost(
    postId: string,
  ): Promise<MomentPostEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const [visibleCharacterIds, ownerFriendCharacterIds] = await Promise.all([
      this.getVisibleCharacterIdSet(),
      this.characters.getActiveFriendCharacterIdSet(owner.id),
    ]);
    const post = await this.postRepo.findOneBy({ id: postId });
    if (
      !post ||
      !this.canOwnerViewPost(post, visibleCharacterIds, ownerFriendCharacterIds)
    ) {
      throw new AppError('MOMENTS_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Moment not found',
      });
    }
    if (!this.canOwnerInteractWithPost(post, ownerFriendCharacterIds, owner.id)) {
      throw new AppError('MOMENTS_NOT_FRIEND', {
        status: HttpStatus.FORBIDDEN,
        legacyMessage: '需先加为好友才能互动',
      });
    }
    return post;
  }

  private deriveDefaultVisibility(
    socialOpenness: string | null | undefined,
  ): 'public' | 'friends' {
    return socialOpenness === 'private' ? 'friends' : 'public';
  }

  /** 返回过去 [now - maxMs, now] 之间的一个随机时间戳，用于让 cron 触发的写入看起来更自然。 */
  private jitterPastTimestamp(maxMs: number): Date {
    const offset = Math.floor(Math.random() * Math.max(0, maxMs));
    return new Date(Date.now() - offset);
  }

  /**
   * 一次性给 N 条帖子拉 likes + comments，再在内存里分组——
   * 消掉 _enrichPost 单条循环里的 N+1（之前 69 帖 ≈ 139 次 SQL，现在 3 次）。
   */
  private async _batchEnrichPosts(
    posts: MomentPostEntity[],
    avatarContext?: MomentAvatarContext,
  ): Promise<Moment[]> {
    if (posts.length === 0) {
      return [];
    }
    const resolvedAvatarContext =
      avatarContext ?? (await this.buildMomentAvatarContext());
    const postIds = posts.map((post) => post.id);
    const [likes, comments] = await Promise.all([
      this.likeRepo.find({
        where: { postId: In(postIds) },
        order: { createdAt: 'ASC' },
      }),
      this.commentRepo.find({
        where: { postId: In(postIds) },
        order: { createdAt: 'ASC' },
      }),
    ]);
    const likesByPost = new Map<string, MomentLikeEntity[]>();
    for (const like of likes) {
      const list = likesByPost.get(like.postId);
      if (list) list.push(like);
      else likesByPost.set(like.postId, [like]);
    }
    const commentsByPost = new Map<string, MomentCommentEntity[]>();
    for (const comment of comments) {
      const list = commentsByPost.get(comment.postId);
      if (list) list.push(comment);
      else commentsByPost.set(comment.postId, [comment]);
    }
    return posts.map((post) =>
      this._buildMomentFromParts(
        post,
        likesByPost.get(post.id) ?? [],
        commentsByPost.get(post.id) ?? [],
        resolvedAvatarContext,
      ),
    );
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
    return this._buildMomentFromParts(
      post,
      likes,
      comments,
      resolvedAvatarContext,
    );
  }

  private _buildMomentFromParts(
    post: MomentPostEntity,
    likes: MomentLikeEntity[],
    comments: MomentCommentEntity[],
    resolvedAvatarContext: MomentAvatarContext,
  ): Moment {
    // 朋友圈是「好友圈」语义：非好友角色的点赞/评论不在这里露出。
    const visibleLikes = likes.filter(
      (like) =>
        like.authorType !== 'character' ||
        (resolvedAvatarContext.visibleCharacterIds.has(like.authorId) &&
          resolvedAvatarContext.ownerFriendCharacterIds.has(like.authorId)),
    );
    const visibleComments = comments.filter(
      (comment) =>
        comment.authorType !== 'character' ||
        (resolvedAvatarContext.visibleCharacterIds.has(comment.authorId) &&
          resolvedAvatarContext.ownerFriendCharacterIds.has(comment.authorId)),
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
      visibility: post.visibility,
      canInteract: this.canOwnerInteractWithPost(
        post,
        resolvedAvatarContext.ownerFriendCharacterIds,
        resolvedAvatarContext.ownerId,
      ),
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

  private resolveMomentAuthorAvatar(
    authorType: string | null | undefined,
    authorId: string | null | undefined,
    currentAvatar: string | null | undefined,
    avatarContext: MomentAvatarContext,
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

  private async backfillCharacterMomentsToFeed() {
    // 一次性回填：历史的角色朋友圈如果还没同步进 feed_posts，
    // 就把它们镜像到广场，让广场可以看到所有角色的动态。
    const characterPosts = await this.postRepo.find({
      where: { authorType: 'character' },
      order: { postedAt: 'ASC' },
    });
    if (characterPosts.length === 0) return;
    let created = 0;
    for (const post of characterPosts) {
      try {
        const before = await this.feedService.hasFeedPostSyncedFromMoment(
          post.id,
        );
        if (before) continue;
        const result = await this.feedService.syncMomentPostToFeed(post, {
          sourceKind: 'character_generated',
          preserveTimestamp: true,
        });
        if (result) created += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to backfill moment ${post.id} → feed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if (created > 0) {
      this.logger.log(
        `Backfilled ${created} character moment(s) into the plaza feed`,
      );
    }
  }

  private async backfillUserMomentVisibilityToFriends() {
    // 一次性迁移：历史用户朋友圈默认 public，与「朋友圈仅好友可见」语义不符。
    // 全量改成 'friends'，确保非好友角色不再可以看到 / 互动。
    const result = await this.postRepo
      .createQueryBuilder()
      .update(MomentPostEntity)
      .set({ visibility: 'friends' })
      .where('authorType = :authorType', { authorType: 'user' })
      .andWhere('visibility = :visibility', { visibility: 'public' })
      .execute();
    if (result.affected && result.affected > 0) {
      this.logger.log(
        `Backfilled ${result.affected} user moment(s) visibility public → friends`,
      );
    }
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
      pendingPostUpdates.length > 0
        ? this.postRepo.save(pendingPostUpdates)
        : null,
      pendingCommentUpdates.length > 0
        ? this.commentRepo.save(pendingCommentUpdates)
        : null,
      pendingLikeUpdates.length > 0
        ? this.likeRepo.save(pendingLikeUpdates)
        : null,
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
    const visibility = this.normalizeUserMomentVisibility(input.visibility);

    if (!text && media.length === 0) {
      throw new AppError('MOMENTS_EMPTY', {
        legacyMessage: '朋友圈内容和媒体不能同时为空。',
      });
    }

    this.assertMomentMediaMatchesContentType(contentType, media);

    return {
      text,
      location,
      contentType,
      media,
      visibility,
    };
  }

  private normalizeUserMomentVisibility(
    value: string | null | undefined,
  ): 'public' | 'friends' | 'private' {
    if (value === 'public' || value === 'private') {
      return value;
    }
    return 'friends';
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

    if (asset.kind === 'audio') {
      return {
        id: asset.id?.trim() || `moment-audio-${index + 1}`,
        kind: 'audio',
        url: asset.url?.trim() || '',
        posterUrl: asset.posterUrl?.trim() || undefined,
        mimeType: asset.mimeType?.trim() || 'audio/mpeg',
        fileName: asset.fileName?.trim() || `audio-${index + 1}`,
        size: Math.max(0, Math.round(asset.size ?? 0)),
        durationMs: normalizeOptionalPositiveNumber(asset.durationMs),
        title: asset.title?.trim() || undefined,
        lyrics: asset.lyrics?.trim() || undefined,
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

    if (media.some((asset) => asset.kind === 'audio')) {
      return 'audio_card';
    }

    if (media.some((asset) => asset.kind === 'video')) {
      return 'video';
    }

    if (
      media.some(
        (asset) => asset.kind === 'image' && (asset as MomentImageAsset).livePhoto?.enabled,
      )
    ) {
      return 'live_photo';
    }

    return 'image_album';
  }

  private normalizeMomentContentType(value?: string): MomentContentType {
    return value === 'image_album' ||
      value === 'video' ||
      value === 'live_photo' ||
      value === 'audio_card'
      ? value
      : 'text';
  }

  private assertMomentMediaMatchesContentType(
    contentType: MomentContentType,
    media: MomentMediaAsset[],
  ) {
    if (contentType === 'text') {
      if (media.length > 0) {
        throw new AppError('MOMENTS_TEXT_NO_MEDIA', {
          legacyMessage: '纯文本朋友圈不能附带图片或视频。',
        });
      }
      return;
    }

    if (contentType === 'video') {
      if (media.length !== 1 || media[0]?.kind !== 'video') {
        throw new AppError('MOMENTS_VIDEO_SINGLE', {
          legacyMessage: '视频朋友圈必须且只能包含 1 条视频。',
        });
      }

      if (
        (media[0] as MomentVideoAsset).durationMs &&
        (media[0] as MomentVideoAsset).durationMs! > 300000
      ) {
        throw new AppError('MOMENTS_VIDEO_TOO_LONG', {
          legacyMessage: '朋友圈视频时长不能超过 5 分钟。',
        });
      }
      return;
    }

    if (contentType === 'audio_card') {
      if (media.length !== 1 || media[0]?.kind !== 'audio') {
        throw new AppError('MOMENTS_AUDIO_SINGLE', {
          legacyMessage: '音乐朋友圈必须且只能包含 1 条音频。',
        });
      }
      return;
    }

    if (media.length < 1 || media.length > 9) {
      throw new AppError('MOMENTS_IMAGES_MAX', {
        params: { max: 9 },
        legacyMessage: '图片朋友圈最多支持 9 张图片。',
      });
    }

    if (media.some((asset) => asset.kind !== 'image')) {
      throw new AppError('MOMENTS_IMAGES_TYPE_ONLY', {
        legacyMessage: '图片朋友圈当前只支持图片资源。',
      });
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
        (await this.appendMomentTranscriptSummary(summary, media, post)) ??
        summary,
      parts: parts.length ? parts : undefined,
    };
  }

  private async appendMomentTranscriptSummary(
    summary: string,
    media: MomentMediaAsset[],
    post: MomentPostEntity,
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
      characterId: post.authorType === 'character' ? post.authorId : undefined,
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

    if (contentType === 'audio_card') {
      const audio = media[0];
      if (!audio || audio.kind !== 'audio') {
        return '1 段音乐';
      }
      const title = audio.title?.trim();
      const seconds = audio.durationMs
        ? `${Math.round(audio.durationMs / 1000)} 秒`
        : null;
      const parts = [title ? `《${title}》` : '一段音乐', seconds].filter(
        Boolean,
      );
      return parts.join('，');
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

  /**
   * NPC 自主巡查：让 manual_admin 角色主动浏览近期朋友圈、按 intimacy/兴趣点赞或评论。
   * 与 scheduleCharacterInteractions（被动反应）互补，确保即使无新帖也有持续社交活动。
   */
  async runNpcAutonomyTick(): Promise<{
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

    // 候选池放开到所有可见角色（preset / model_persona / default_seed 等）。
    // 之前只看 manual_admin，但 DB 里很少有这个 sourceType，导致 NPC 之间从不互动。
    const candidates = await this.characters.findAllVisibleToOwner();

    const activeCandidates = candidates.filter((char) => {
      const start = char.activeHoursStart ?? 8;
      const end = char.activeHoursEnd ?? 22;
      return hour >= start && hour <= end;
    });

    let llmCallsRemaining = MAX_LLM_CALLS_PER_TICK;
    let likeCount = 0;
    let commentCount = 0;
    let participantCount = 0;

    const recentPosts = await this.postRepo.find({
      where: { postedAt: MoreThanOrEqual(recentSince) },
      order: { postedAt: 'DESC' },
    });
    if (recentPosts.length === 0) {
      return {
        summary: `npc_autonomy_tick: 最近 7d 无帖子可巡查（候选 ${activeCandidates.length} 个）`,
        likeCount,
        commentCount,
      };
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const ownerFriendCharacterIds =
      await this.characters.getActiveFriendCharacterIdSet(owner.id);

    for (const char of activeCandidates) {
      // 朋友圈是「好友圈」语义：非好友角色不会主动到任何朋友圈里露脸。
      if (!ownerFriendCharacterIds.has(char.id)) continue;

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

      // Skip posts already liked by this NPC
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
            post.postedAt.getTime(),
          );
          const intimacyMul = npcIntimacyMultiplier(effectiveIntimacy);
          const engageMul = recencyMul * intimacyMul;
          // 排序得分仍带随机扰动；engageMul 用于掷骰子。
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
            const observation = await this.buildMomentAiObservation(post);
            const userMessage = await this.worldLanguage.formatPostCommentTask({
              authorName: post.authorName,
              summary: observation.summary,
              surface: 'moments',
            });
            const reply = await this.ai.generateReply({
              profile,
              conversationHistory: [],
              userMessage,
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
            llmCallsRemaining -= 1;
            const savedComment = await this.addComment(
              post.id,
              char.id,
              char.name,
              char.avatar,
              reply.text,
              'character',
            );
            // 同样把评论时间散开到过去 0-60 秒。
            await this.commentRepo.update(savedComment.id, {
              createdAt: this.jitterPastTimestamp(60_000),
            });
            commentCount += 1;
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

    return {
      summary: `npc_autonomy_tick: ${participantCount} 个 NPC 上线，点赞 ${likeCount} 次，评论 ${commentCount} 次（剩余 LLM 配额 ${llmCallsRemaining}）`,
      likeCount,
      commentCount,
    };
  }

  // ============= MiniMax 音乐贴 / 视频贴 =============

  // Tier 1: MiniMax /v1/lyrics_generation（专用歌词端点，短 prompt ≤290 字符）
  //   注意：sk-cp-* tokenplan key 当前对该端点持续回 2013 invalid params，
  //   失败会自动 fall through 到 Tier 2，保留入口以备 minimax 修好该端点
  // Tier 2: MiniMax /v1/text/chatcompletion_v2 + MiniMax-M2.7（tokenplan 主推 LLM）
  //   这就是"tokenplan 里 minimax 正常的 llm"，确认可用
  // Tier 3: ai.generatePlainText —— AiOrchestrator 走默认 chat provider（通常是 n1n）
  // Tier 4: 本地 composeMusicLyrics 模板
  // 前提：调用方 scheduleMinimaxMusicMoment 已经验证音乐配额非空。
  private async generateLyricsOrFallback(
    characterId: string,
    characterName: string,
    _profile: PersonalityProfile,
    seedText: string,
  ): Promise<string> {
    const { theme, style } = pickThemeAndStyle(characterId);
    const minimaxLyricsEnabled =
      (process.env.MINIMAX_LYRICS_ENABLED ?? 'true').toLowerCase() !== 'false';
    const prompt = composeLyricsPrompt({
      name: characterName,
      theme,
      style,
      seedText,
    });
    const localFallback = composeMusicLyrics(
      characterName,
      `${theme}：${seedText}`,
    );

    // Tier 1: /v1/lyrics_generation
    if (minimaxLyricsEnabled && this.minimaxClient.isConfigured()) {
      const reserved = await this.minimaxQuota.tryReserve('lyrics');
      if (reserved) {
        try {
          const result = await this.minimaxClient.generateLyrics({ prompt });
          await this.minimaxQuota.commit('lyrics');
          this.logger.log(
            `lyrics via minimax for ${characterName} [theme=${theme}, style=${style}]`,
          );
          return result.lyrics;
        } catch (err) {
          await this.minimaxQuota.release('lyrics');
          // 服务端确认今日 lyrics 额度耗尽 → 标本地不再 reserve，剩余 cron tick 全跳过
          if (
            err instanceof MinimaxClientError &&
            err.code === 'MINIMAX_QUOTA_EXHAUSTED'
          ) {
            this.minimaxQuota.markExhaustedToday('lyrics');
          }
          this.logger.warn(
            `minimax lyrics endpoint failed, falling back to minimax LLM: ${(err as Error)?.message}`,
          );
        }
      } else {
        this.logger.debug(
          'minimax lyrics quota exhausted, falling back to minimax LLM',
        );
      }
    }

    // Tier 2: minimax chatcompletion_v2 + MiniMax-M2.7（tokenplan LLM）
    if (this.minimaxClient.isConfigured()) {
      try {
        const result = await this.minimaxClient.chatCompletion({
          model: 'MiniMax-M2.7',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 2000,
          temperature: 0.9,
        });
        const cleaned = ensureVerseChorus(result.content);
        if (cleaned) {
          this.logger.log(
            `lyrics via minimax LLM (M2.7) for ${characterName} [theme=${theme}]`,
          );
          return cleaned;
        }
      } catch (err) {
        this.logger.warn(
          `minimax LLM lyrics failed, falling back to generic LLM: ${(err as Error)?.message}`,
        );
      }
    }

    // Tier 3: 通用 LLM（orchestrator 路由，通常落到 n1n）
    try {
      const text = await this.ai.generatePlainText({
        prompt,
        usageContext: {
          surface: 'app',
          scene: 'minimax_music_lyrics_fallback',
          scopeType: 'character',
          scopeId: characterId,
          scopeLabel: characterName,
          characterId,
          characterName,
        },
        maxTokens: 600,
        temperature: 0.9,
        fallback: localFallback,
      });
      const cleaned = ensureVerseChorus(text);
      if (cleaned) {
        this.logger.log(
          `lyrics via generic LLM fallback for ${characterName} [theme=${theme}]`,
        );
        return cleaned;
      }
    } catch (err) {
      this.logger.warn(
        `generic LLM lyrics fallback failed: ${(err as Error)?.message}`,
      );
    }

    // Tier 4: 本地模板
    return localFallback;
  }

  async scheduleMinimaxMusicMoment(
    char: CharacterEntity,
  ): Promise<MomentPostEntity | null> {
    // 提前拦截：MiniMax 未配置或配额耗尽时不浪费 LLM tokens 去生成种子文本。
    if (!this.minimaxClient.isConfigured()) return null;
    // music-2.6 主力 + music-2.5 fallback；任一有余额就值得继续
    const musicAvailable =
      (await this.minimaxQuota.availableToday('music-2.6')) > 0 ||
      (await this.minimaxQuota.availableToday('music-2.5')) > 0;
    if (!musicAvailable) {
      return null;
    }
    if (!(await this.isCharacterVisibleToOwner(char.id))) {
      return null;
    }
    const profile = await this.characters.getProfile(char.id);
    if (!profile) return null;

    // 不再调 LLM 生成 music seed text：每首歌都额外打一次 n1n 太贵。
    // 直接用本地主题模板兜底；minimax 自己会基于歌词 + 歌曲 prompt 出曲。
    const { theme: seedTheme } = pickThemeAndStyle(char.id);
    const seedText = `${char.name} 此刻心境与「${seedTheme}」相关，请围绕这一画面展开。`;

    const lyrics = await this.generateLyricsOrFallback(
      char.id,
      char.name,
      profile,
      seedText,
    );
    const job = await this.minimaxJobs.enqueueMusicJob({
      model: 'music-2.6',
      prompt: composeMusicPrompt(char.name, seedText),
      lyrics,
      characterId: char.id,
      characterName: char.name,
      characterAvatar: char.avatar,
      targetType: 'moment_post',
    });
    if (!job) {
      this.logger.warn(
        `enqueueMusicJob declined for ${char.id} (quota or config)`,
      );
      return null;
    }

    try {
      const post = this.postRepo.create({
        authorId: char.id,
        authorName: char.name,
        authorAvatar: char.avatar,
        authorType: 'character',
        visibility: this.deriveDefaultVisibility(char.socialOpenness),
        text: seedText,
        contentType: 'audio_card',
        mediaPayload: undefined,
        postedAt: this.jitterPastTimestamp(15 * 60 * 1000),
        generationKind: 'minimax_music',
        generationMetadata: {
          minimaxJobId: job.id,
          // 使用 job 实际占用的模型（可能是 fallback 后的 music-2.5）
          minimaxModel: job.model,
          pending: true,
        },
      });
      const saved = await this.postRepo.save(post);
      await this.minimaxJobs.attachTarget(job.id, saved.id);
      this.logger.log(
        `moment ${saved.id} queued minimax music job ${job.id} for ${char.name}`,
      );
      return saved;
    } catch (err) {
      // post 创建失败必须回滚 job：否则配额白扣，cron 还会去执行 orphan job
      await this.minimaxJobs.cancelJob(job.id);
      this.logger.error(
        `moment-music post creation failed, rolled back job ${job.id}: ${(err as Error)?.message}`,
      );
      throw err;
    }
  }

  // 视频生成上下文用：最近 7 天该角色任意一条朋友圈/Feed 的文本摘要（≤80 字）。
  // 没有则返回 null，由 LLM 自由发挥。
  private async pickRecentMomentSummary(charId: string): Promise<string | null> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = await this.postRepo.findOne({
      where: { authorId: charId, postedAt: MoreThanOrEqual(since) },
      order: { postedAt: 'DESC' },
    });
    const text = recent?.text?.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }

  async scheduleMinimaxVideoMoment(
    char: CharacterEntity,
    pickModel: () => Promise<
      'MiniMax-Hailuo-2.3-Fast' | 'MiniMax-Hailuo-2.3' | null
    >,
  ): Promise<MomentPostEntity | null> {
    if (!this.minimaxClient.isConfigured()) return null;
    if (!(await this.isCharacterVisibleToOwner(char.id))) {
      return null;
    }
    const model = await pickModel();
    if (!model) return null;

    const profile = await this.characters.getProfile(char.id);
    if (!profile) return null;

    // 抽最近 7 天该角色发过的一条 moment 文本作为「今天发生的事」喂给 LLM，
    // 让生成的 seedText 不再凭空抒情、贴角色当下生活。
    const recentEvent = await this.pickRecentMomentSummary(char.id);

    let seedText = '';
    try {
      seedText = (
        await this.ai.generateMoment({
          profile,
          currentTime: new Date(),
          recentTopics: recentEvent ? [recentEvent] : undefined,
          usageContext: {
            surface: 'app',
            scene: 'minimax_moment_video',
            scopeType: 'character',
            scopeId: char.id,
            scopeLabel: char.name,
            characterId: char.id,
            characterName: char.name,
          },
        })
      ).trim();
    } catch (err) {
      this.logger.warn(
        `moment-video text gen failed for ${char.id}: ${(err as Error)?.message}`,
      );
    }
    if (!seedText) seedText = `${char.name} 拍了一段画面记录今天。`;

    const personaBlock = extractPersonaBlock(profile);
    const job = await this.minimaxJobs.enqueueVideoJob({
      model,
      prompt: composeMomentVideoPrompt({
        characterName: char.name,
        personaBlock,
        currentActivity: char.currentActivity,
        recentEvent,
        seedText,
      }),
      resolution: '768P',
      characterId: char.id,
      characterName: char.name,
      characterAvatar: char.avatar,
      targetType: 'moment_post',
    });
    if (!job) return null;

    try {
      const post = this.postRepo.create({
        authorId: char.id,
        authorName: char.name,
        authorAvatar: char.avatar,
        authorType: 'character',
        visibility: this.deriveDefaultVisibility(char.socialOpenness),
        text: seedText,
        contentType: 'video',
        mediaPayload: undefined,
        postedAt: this.jitterPastTimestamp(15 * 60 * 1000),
        generationKind: 'minimax_video',
        generationMetadata: {
          minimaxJobId: job.id,
          minimaxModel: model,
          pending: true,
        },
      });
      const saved = await this.postRepo.save(post);
      await this.minimaxJobs.attachTarget(job.id, saved.id);
      this.logger.log(
        `moment ${saved.id} queued minimax video job ${job.id} (${model}) for ${char.name}`,
      );
      return saved;
    } catch (err) {
      await this.minimaxJobs.cancelJob(job.id);
      this.logger.error(
        `moment-video post creation failed, rolled back job ${job.id}: ${(err as Error)?.message}`,
      );
      throw err;
    }
  }

  async applyMinimaxMusicToPost(
    postId: string,
    audio: MomentAudioAsset,
  ): Promise<void> {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) {
      this.logger.warn(`applyMinimaxMusicToPost: post ${postId} missing`);
      return;
    }
    const meta: Record<string, unknown> = {
      ...(post.generationMetadata ?? {}),
    };
    delete meta.pending;
    post.contentType = 'audio_card';
    post.mediaPayload = this.serializeMomentMedia([audio]);
    post.generationMetadata = meta;
    const saved = await this.postRepo.save(post);
    void this.scheduleCharacterInteractions(saved);
  }

  async applyMinimaxVideoToPost(
    postId: string,
    video: MomentVideoAsset,
  ): Promise<void> {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) {
      this.logger.warn(`applyMinimaxVideoToPost: post ${postId} missing`);
      return;
    }
    const meta: Record<string, unknown> = {
      ...(post.generationMetadata ?? {}),
    };
    delete meta.pending;
    post.contentType = 'video';
    post.mediaPayload = this.serializeMomentMedia([video]);
    post.generationMetadata = meta;
    const saved = await this.postRepo.save(post);
    void this.scheduleCharacterInteractions(saved);
  }

  // 拼一段贴角色性格的 BGM prompt：取 emotionalTone / 关心话题 / 擅长领域作 mood
  // 提示，让不同角色发出来的 BGM 在风格上有区分（程序员→冷峻电子，治愈系→lofi
  // 钢琴…）。profile 拿不到时回退到中性 ambient。
  async resolveVideoBgmPrompt(
    characterId: string,
    characterName: string,
  ): Promise<string> {
    const profile = await this.characters
      .getProfile(characterId)
      .catch(() => null);
    const tone = profile?.traits?.emotionalTone?.replace(/\s+/g, ' ').trim();
    const interests = profile?.traits?.topicsOfInterest
      ?.slice(0, 2)
      .filter(Boolean)
      .join('、');
    const domains = profile?.expertDomains?.slice(0, 2).join('、');
    const moodHints: string[] = [];
    if (tone) moodHints.push(`情绪基调：${tone.slice(0, 40)}`);
    if (interests) moodHints.push(`常关心：${interests.slice(0, 40)}`);
    if (domains) moodHints.push(`擅长领域：${domains.slice(0, 40)}`);
    if (!moodHints.length) {
      moodHints.push('情绪基调：温和、生活感、不抢戏');
    }
    return [
      `${characterName} 朋友圈短视频的纯器乐 BGM，时长 30 秒以内，无人声。`,
      moodHints.join('；') + '。',
      '风格要贴这个角色——不要把所有人都做成 lofi 咖啡店；该工程感就工程感，该温柔就温柔。',
      '编曲简洁，可循环，作为 6 秒短片底噪不抢镜头。',
    ].join(' ');
  }

  // BGM 子任务回调：把已生成的 BGM 音频混入该 moment_post 的视频文件，
  // 替换 mediaPayload 指向新文件并清理旧文件。失败 → 静默保留静音视频。
  async applyBgmToVideoMomentPost(
    postId: string,
    bgmFileName: string,
  ): Promise<boolean> {
    // try/finally 确保 BGM 临时文件在任何返回路径上都被回收，避免磁盘泄漏。
    // unlinkIfExists 幂等，重复调用安全。
    try {
      const post = await this.postRepo.findOneBy({ id: postId });
      if (!post) {
        this.logger.warn(`applyBgmToVideoMomentPost: post ${postId} missing`);
        return false;
      }
      const media = this.parseMomentMediaPayload(post.mediaPayload);
      const video = media.find(
        (m): m is MomentVideoAsset => m.kind === 'video',
      );
      if (!video?.url) {
        this.logger.warn(
          `applyBgmToVideoMomentPost: post ${postId} has no video media yet`,
        );
        return false;
      }
      // 从 publicUrl `/api/moments/media/<file>` 抽 fileName
      const oldVideoFileName = video.url.split('/').pop();
      if (!oldVideoFileName) return false;
      const mixed = await this.minimaxStorage.mixVideoWithAudio({
        videoFileName: oldVideoFileName,
        audioFileName: bgmFileName,
      });
      if (!mixed) return false;
      const newVideo: MomentVideoAsset = {
        ...video,
        id: mixed.fileName,
        url: mixed.publicUrl,
        mimeType: mixed.mimeType,
        fileName: mixed.fileName,
        size: mixed.size,
      };
      post.mediaPayload = this.serializeMomentMedia([newVideo]);
      await this.postRepo.save(post);
      // 先把视频号 mediaPayload 指向新文件，再 unlink 旧静音视频；
      // 否则中间这一段时间视频号那条贴指向已删文件 → 404。
      try {
        await this.feedService.upsertChannelVideoPostFromMoment({
          momentPostId: postId,
          authorId: post.authorId,
          authorName: post.authorName,
          authorAvatar: post.authorAvatar,
          videoUrl: newVideo.url,
          posterUrl: newVideo.posterUrl ?? null,
          durationMs: newVideo.durationMs ?? null,
          mimeType: newVideo.mimeType,
          fileName: newVideo.fileName,
          size: newVideo.size,
          text: `${post.authorName} 拍了一段画面`,
        });
      } catch (err) {
        this.logger.warn(
          `channel video post refresh after bgm failed for moment ${postId}: ${(err as Error)?.message}`,
        );
      }
      // 视频号已经指向新文件后，安全回收旧静音视频
      await this.minimaxStorage.unlinkIfExists(oldVideoFileName);
      return true;
    } finally {
      // BGM 中间产物：成功也好失败也好都不再需要
      await this.minimaxStorage.unlinkIfExists(bgmFileName);
    }
  }

  async deleteMinimaxPlaceholderPost(postId: string): Promise<void> {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) return;
    const meta = (post.generationMetadata ?? {}) as Record<string, unknown>;
    if (meta?.pending !== true) {
      // 真实生成已落地，不应再删
      return;
    }
    await this.commentRepo.delete({ postId });
    await this.likeRepo.delete({ postId });
    await this.postRepo.delete(postId);
  }

  async tryRenderMinimaxMusicCover(
    job: MinimaxJobEntity,
    seedText: string,
  ): Promise<{
    url: string;
    fileName: string;
    mimeType: string;
    size: number;
  } | null> {
    if (!this.minimaxClient.isConfigured()) return null;
    const reserved = await this.minimaxQuota.tryReserve('image-01');
    if (!reserved) return null;
    try {
      const image = await this.minimaxClient.generateImage({
        model: 'image-01',
        prompt: composeMusicCoverPrompt(job.characterName, seedText),
        aspectRatio: '1:1',
      });
      const persisted = await this.minimaxStorage.persist({
        buffer: image.buffer,
        mimeType: image.mimeType,
        kind: 'image',
        suffix: '-cover',
      });
      await this.minimaxQuota.commit('image-01');
      return {
        url: persisted.publicUrl,
        fileName: persisted.fileName,
        mimeType: image.mimeType,
        size: persisted.size,
      };
    } catch (err) {
      await this.minimaxQuota.release('image-01');
      this.logger.warn(
        `music cover gen failed for job ${job.id}: ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  // 视频号图文视频：再额外渲染 N 张 9:16 配图。配额不够 / 单张失败都不报错，
  // 调用方按返回数组长度做 fallback（最少 0 张也允许）。
  async tryRenderMinimaxMusicPictorials(
    job: MinimaxJobEntity,
    seedText: string,
    count = 3,
  ): Promise<
    Array<{ url: string; fileName: string; mimeType: string; size: number }>
  > {
    if (!this.minimaxClient.isConfigured() || count <= 0) return [];
    const prompts = composeMusicPictorialPrompts(
      job.characterName,
      seedText,
    ).slice(0, count);
    const tasks = prompts.map(async (prompt, idx) => {
      const reserved = await this.minimaxQuota.tryReserve('image-01');
      if (!reserved) return null;
      try {
        const image = await this.minimaxClient.generateImage({
          model: 'image-01',
          prompt,
          aspectRatio: '9:16',
        });
        const persisted = await this.minimaxStorage.persist({
          buffer: image.buffer,
          mimeType: image.mimeType,
          kind: 'image',
          suffix: `-pictorial-${idx + 1}`,
        });
        await this.minimaxQuota.commit('image-01');
        return {
          url: persisted.publicUrl,
          fileName: persisted.fileName,
          mimeType: image.mimeType,
          size: persisted.size,
        };
      } catch (err) {
        await this.minimaxQuota.release('image-01');
        this.logger.warn(
          `music pictorial[${idx}] gen failed for job ${job.id}: ${(err as Error)?.message}`,
        );
        return null;
      }
    });
    const settled = await Promise.allSettled(tasks);
    const out: Array<{
      url: string;
      fileName: string;
      mimeType: string;
      size: number;
    }> = [];
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) out.push(r.value);
    }
    return out;
  }
}

function composeMusicPrompt(characterName: string, seedText: string): string {
  return [
    `${characterName} 心境的器乐 / 轻人声小品，1 分钟内。`,
    `情绪线索：${seedText.slice(0, 200)}`,
    '风格：电子流行 + 氛围合成器，节奏适中，情感清晰。',
  ].join(' ');
}

// 从 PersonalityProfile 抽取贴歌词最有用的几段：底层逻辑、朋友圈场景设定、
// 说话方式 / 口头禅 / 情绪基调、记忆摘要。每段独立截断，总长度控制在 ~800 字内
// 避免 minimax prompt 过长被截断。
function extractPersonaBlock(profile: PersonalityProfile): string {
  const segments: string[] = [];
  const push = (label: string, value: string | undefined, max = 200) => {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    if (cleaned) segments.push(`【${label}】${cleaned.slice(0, max)}`);
  };

  push('身份关系', profile.relationship);
  if (profile.expertDomains?.length) {
    push('擅长领域', profile.expertDomains.slice(0, 4).join('、'), 80);
  }
  push('底层逻辑', profile.coreLogic, 240);
  push('发朋友圈风格', profile.scenePrompts?.moments_post, 180);

  const traits = profile.traits;
  if (traits) {
    if (traits.speechPatterns?.length) {
      push('说话方式', traits.speechPatterns.slice(0, 3).join('；'), 120);
    }
    if (traits.catchphrases?.length) {
      push('口头禅', traits.catchphrases.slice(0, 4).join('、'), 80);
    }
    if (traits.emotionalTone) push('情绪基调', traits.emotionalTone, 60);
    if (traits.topicsOfInterest?.length) {
      push('关心的话题', traits.topicsOfInterest.slice(0, 4).join('、'), 100);
    }
  }
  push('记忆摘要', profile.memorySummary, 200);

  return segments.join('\n') || '（角色资料较少，请按主题自由发挥但保持一致人格）';
}

// MiniMax /v1/lyrics_generation 的 prompt 字段硬上限 300 字符，超出会回
// 2013 invalid params。这里只保留主题 / 风格 / 心境线索，输出格式由 minimax
// 自身保证（会自动产出 [verse]/[chorus] 段标）。
function composeLyricsPrompt(args: {
  name: string;
  theme: string;
  style: string;
  seedText: string;
}): string {
  const seed = args.seedText?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '';
  const head = `为「${args.name}」写一首中文歌：主题${args.theme}，风格${args.style}。`;
  const tail = seed ? `心境：${seed}` : '';
  const full = `${head}${tail}`;
  return full.length > 290 ? full.slice(0, 290) : full;
}

function composeMusicLyrics(_characterName: string, seedText: string): string {
  const trimmed = seedText.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return '\n[verse]\n慢慢走进灯光里\n收起一身风尘\n[chorus]\n这一刻让我留下\n继续向前再向前\n';
  }
  const lines = trimmed
    .split(/[，。！？!?,.\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  while (lines.length < 4) {
    lines.push(trimmed.slice(0, Math.min(20, trimmed.length)));
  }
  const verse = lines.slice(0, Math.ceil(lines.length / 2)).join('\n');
  const chorus = lines.slice(Math.ceil(lines.length / 2)).join('\n');
  return `\n[verse]\n${verse}\n[chorus]\n${chorus || verse}\n`;
}

// LLM 兜底出的歌词偶尔会缺段标或带多余前后缀。
// - 含 [verse] + [chorus] 直接用
// - 缺段标但有内容：前半行包成 verse、后半行包成 chorus
// - 完全空：返回空串，让上层走 localFallback
function ensureVerseChorus(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower.includes('[verse]') && lower.includes('[chorus]')) {
    return trimmed.startsWith('\n') ? trimmed : `\n${trimmed}\n`;
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !/^\[[a-z]+\]$/i.test(s));
  if (lines.length < 2) return '';
  const half = Math.max(1, Math.ceil(lines.length / 2));
  const verse = lines.slice(0, half).join('\n');
  const chorus = lines.slice(half).join('\n') || verse;
  return `\n[verse]\n${verse}\n[chorus]\n${chorus}\n`;
}

// 把角色档案 + 当前活动 + 最近事件 + LLM 情境一起塞进视频 prompt，
// 让画面物件、视角、场景能反映出角色身份；避免每个角色都拍同款空镜。
const ACTIVITY_LABELS: Record<string, string> = {
  working: '正在工作 / 专注做事',
  eating: '正在吃东西 / 用餐场景',
  resting: '正在休息 / 放空',
  commuting: '正在通勤 / 移动中',
  free: '空闲、随心所欲',
  sleeping: '准备休息 / 夜深',
};

function composeMomentVideoPrompt(args: {
  characterName: string;
  personaBlock: string;
  currentActivity?: string;
  recentEvent: string | null;
  seedText: string;
}): string {
  const activityLabel = args.currentActivity
    ? ACTIVITY_LABELS[args.currentActivity] ?? args.currentActivity
    : '';
  const sections: string[] = [
    `${args.characterName} 朋友圈短片，9:16 竖屏，6 秒。`,
    '— 角色档案 —',
    args.personaBlock,
  ];
  if (activityLabel) {
    sections.push(`此时此刻：${activityLabel}。`);
  }
  if (args.recentEvent) {
    sections.push(`最近发生（仅作上下文）：${args.recentEvent}`);
  }
  sections.push(`情境：${args.seedText.slice(0, 200)}。`);
  sections.push(
    '硬性要求：',
    '· 画面里出现的物件、场景、视角必须与角色身份和擅长领域一致——程序员→代码屏 / 键盘 / 工位；厨师→灶台 / 食材 / 刀工；歌手→话筒 / 排练室 / 后台；不要把所有人都拍成奶茶 + 街头空镜。',
    '· 镜头视角应像角色本人随手举起手机拍下的，第一视角或近景 OK。',
    '· 风格：生活感、真实光线、轻微镜头运动；6 秒一镜到底，不要快剪。',
  );
  return sections.join('\n');
}

function composeMusicCoverPrompt(
  characterName: string,
  seedText: string,
): string {
  return `音乐封面：${characterName} 视角，${seedText.slice(0, 80)}。极简电影风，柔和色调，正方形海报构图。`;
}

// 给视频号图文视频准备的 3 张 9:16 配图 prompt：人物特写 / 场景氛围 / 情绪隐喻。
function composeMusicPictorialPrompts(
  characterName: string,
  seedText: string,
): string[] {
  const mood = seedText.slice(0, 80);
  return [
    `${characterName} 当下心境的人物特写 / 立绘，电影感打光，背景虚化，情绪线索：${mood}。9:16 竖构图，画面留白足以叠加文字。`,
    `与 ${characterName} 心境呼应的环境画面：街道 / 室内 / 自然景物之一，无人物特写或仅留背影，氛围线索：${mood}。9:16 竖构图，胶片质感。`,
    `${characterName} 情绪的视觉隐喻：色彩 + 光影 + 几何，少量符号化元素，主题：${mood}。9:16 竖构图，抽象但有故事感。`,
  ];
}
// i18n-ignore-end
