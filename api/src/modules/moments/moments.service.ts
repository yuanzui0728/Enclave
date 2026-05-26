import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { sanitizeAiMessageText } from '../ai/ai-text-sanitizer';
import { SubscriptionExpiredException } from '../subscription/subscription-expired.exception';
import { AiSpeechAssetsService } from '../ai/ai-speech-assets.service';
import { WebSearchService } from '../ai/web-search.service';
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
  FriendRemarkResolver,
  type FriendRemarkMap,
} from '../social/friend-remark-resolver.service';
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
import {
  MinimaxQuotaService,
  parseMinimaxResetAt,
} from '../minimax/minimax-quota.service';
import { MinimaxClient, MinimaxClientError } from '../minimax/minimax.client';
import { MinimaxAssetStorage } from '../minimax/minimax-asset.storage';
import { MomentImageBudgetService } from './moment-image-budget.service';
import { composeMomentImagePrompt } from './moment-image-prompt';
import { WorldLanguageService } from '../config/world-language.service';
import type { MinimaxJobEntity } from '../minimax/minimax-job.entity';
import type { CharacterEntity } from '../characters/character.entity';

// minimax Token Plan 在 lyrics 端点撞 2056 时抛此错，调用方应当跳过整条音乐 moment
// （chat / music / video 共享同一池子，做下去全是浪费）。
class MusicQuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MusicQuotaExhaustedError';
  }
}

// 朋友圈正文 / 评论的服务端硬上限。前端 maxLength 是软约束（粘贴长字符串被
// 截断），但 curl / 第三方端可以绕过；服务端再卡一层避免 DB 爆 + 列表死渲染。
// 数值参照微信：正文 ~2000 字符（含媒体时其实更短，这里给统一上限），评论 ~500。
const MAX_MOMENT_TEXT_LENGTH = 2000;
const MAX_COMMENT_TEXT_LENGTH = 500;

// 朋友圈 media[].url 白名单：合法上传通过 POST /api/moments/media 一律返回相对路径
// `/api/moments/media/<fileName>`（见 saveUploadedMedia）。任何不匹配此模式的 URL —
// 无论是 `http://evil/track.gif` 还是其他相对路径——都不能在 createUserMoment
// 落库。否则 frontend 渲染时 <img src="https://evil/..."> 会把 user IP / 公网隧道
// token / Cookie 全部泄露到第三方域名（实际真机走查 Round 1 验证：直接 POST 一个
// SSRF 测试 URL 成功落库返回 200，前端会发起对 evil.example.com 的请求）。
// 字段：url / thumbnailUrl / posterUrl / livePhoto.motionUrl 都走这个白名单。
const MOMENT_MEDIA_URL_PREFIX = '/api/moments/media/';
function assertMomentMediaUrl(value: string | null | undefined, field: string): void {
  if (value === null || value === undefined || value === '') return;
  if (!value.startsWith(MOMENT_MEDIA_URL_PREFIX)) {
    throw new AppError('MOMENTS_MEDIA_URL_INVALID', {
      params: { field },
      legacyMessage: `朋友圈媒体 ${field} 必须来自上传接口。`,
    });
  }
  // 阻止 path traversal：尽管 normalizeMomentMediaFileName 在读取时会再卡一道，
  // 落库阶段就拦掉更保险——`/api/moments/media/../../etc/passwd` 这种 fileName
  // 会被 path.normalize 卷回上层目录。fileName 不允许包含 `..` / `/` / `\`。
  const fileName = value.slice(MOMENT_MEDIA_URL_PREFIX.length);
  if (!fileName || /[\\/]|\.\.|^\.+$/.test(fileName)) {
    throw new AppError('MOMENTS_MEDIA_URL_INVALID', {
      params: { field },
      legacyMessage: `朋友圈媒体 ${field} 文件名非法。`,
    });
  }
}

// trim 后再剥掉零宽字符（U+200B–U+200D / U+FEFF / U+2060）和**内部空白**。
// 用来判定 text 是不是"视觉为空"——纯 ZWS / ZWS+内部空格混排的正文/评论会让
// 卡片渲染出一行空白，但 likes/comments footer 依然挂着，看着像幽灵帖。
// wiki 的 isNameVisuallyEmpty 只剥 ZWS 不剥内部空白，对 "  ​​   ​   " 这种
// 漏判；这里也把 \s 剥掉，保证 "可见字符总数 = 0" 时拒收。
function isMomentTextVisuallyEmpty(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return trimmed.replace(/[​-‍﻿⁠\s]/g, '').length === 0;
}

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
  ownerUsername: string;
  ownerId: string;
  visibleCharacterIds: Set<string>;
  ownerFriendCharacterIds: Set<string>;
  // 走查新 R1：朋友资料 → 朋友权限管理 → 「我不看 TA 的朋友圈」开关勾掉的
  // characterId 集合。canOwnerViewPost 把 author 在这个集合里的 post 一并
  // 隐掉。之前这个开关存到 friendship.momentsHiddenFromMe，但 moments 服务
  // 完全没读它，UI toggle 等于 dead flag。
  momentsHiddenFromMeCharacterIds: Set<string>;
  characterAvatarById: Map<string, string>;
  // 走查 R2：和 ownerUsername 重映射对称——角色被改名后，历史 moment_post /
  // moment_like / moment_comment 的 authorName 字段仍是写入快照那一刻的旧名字。
  // 已有的 applyCharacterRemark 只能用 owner 主动设的备注覆盖；没设备注的角色
  // 改名后所有历史互动都挂着旧名字。把当前角色的 displayName/name 也带进
  // context，resolveMomentAuthorName 在没有 remark 时优先用 entity 当前名。
  characterNameById: Map<string, string>;
  remarkMap: FriendRemarkMap;
};

@Injectable()
export class MomentsService implements OnModuleInit {
  private readonly logger = new Logger(MomentsService.name);
  // 走查 R2：synthesizeMomentNarration TOCTOU — 两个并发请求（多端同时听同
  // 一条贴 / iPad + iPhone / 同 owner curl 重试）都先 findOneBy → 都 miss
  // 缓存 → 都各自打一次 MiniMax TTS HD，11000/天配额白白烧两份。前端
  // wechat-moment-card 自带 inflightRef 只挡同卡同帧双击，跨设备/客户端的
  // race 完全靠服务端兜。per-postId Promise 表共享 in-flight；任一抛错时
  // 立刻删 key 让下次重试重新触发；resolve 后也立刻删（不留长 cache，
  // 二次读走 generationMetadata.narration 的真缓存路径）。
  private readonly inFlightNarrations = new Map<
    string,
    Promise<{ audioUrl: string; durationMs?: number; cached: boolean }>
  >();

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly speechAssets: AiSpeechAssetsService,
    private readonly webSearch: WebSearchService,
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
    private readonly remarkResolver: FriendRemarkResolver,
    private readonly imageBudget: MomentImageBudgetService,
    @InjectRepository(MomentEntity)
    private momentRepo: Repository<MomentEntity>,
    @InjectRepository(MomentPostEntity)
    private postRepo: Repository<MomentPostEntity>,
    @InjectRepository(MomentCommentEntity)
    private commentRepo: Repository<MomentCommentEntity>,
    @InjectRepository(MomentLikeEntity)
    private likeRepo: Repository<MomentLikeEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    // 索引先建好再做后续清理：参考 feed.service 同模式。toggleLike 在
    // findOneBy → save 两步之间存在并发窗口，慢网+客户端连续点击或后台
    // schedule 任务并发到达，能让同一对 (postId, authorId) 落两行 like，
    // likeCount 漂移、UI 把"自己"算成点了两次。给 moment_likes 建
    // UNIQUE(postId, authorId) 在 DB 层兜底；entity 装饰器 unique 是
    // 陷阱（synchronize 早于 onModuleInit，老库重复行卡死整个 child），
    // 走 runtime DELETE+CREATE INDEX 幂等路径。
    // moment_posts 的 (authorId, postedAt) 复合索引让"我的朋友圈"、
    // friend-moments/$id 等 ownerOnly / characterAuthorId 路径不再
    // 退化成全表扫描。
    await this.ensureMomentUniqueIndexes();
    await this.backfillMomentAuthorAvatars();
    await this.backfillUserMomentVisibilityToFriends();
    await this.backfillCharacterMomentsToFeed();
    await this.cleanupLegacyDemoMomentPosts();
  }

  private async ensureMomentUniqueIndexes(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      // 1. 去重 moment_likes：每对 (postId, authorId) 只保留 createdAt 最早一行
      await queryRunner.query(`
        DELETE FROM moment_likes
        WHERE id NOT IN (
          SELECT MIN(id) FROM moment_likes GROUP BY postId, authorId
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_moment_likes_post_author
        ON moment_likes(postId, authorId)
      `);
      // 2. 用 like 表实际行数把 likeCount 拉回真值，修复历史漂移
      await queryRunner.query(`
        UPDATE moment_posts
        SET likeCount = COALESCE((
          SELECT COUNT(*) FROM moment_likes WHERE moment_likes.postId = moment_posts.id
        ), 0)
      `);
      // 3. commentCount 同理重算（rare race，但既然在跑就一起对齐）
      await queryRunner.query(`
        UPDATE moment_posts
        SET commentCount = COALESCE((
          SELECT COUNT(*) FROM moment_comments WHERE moment_comments.postId = moment_posts.id
        ), 0)
      `);
      // 4. authorId+postedAt 复合索引：ownerOnly / characterAuthorId 路径走索引
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_moment_posts_author_postedAt
        ON moment_posts(authorId, postedAt)
      `);
    } catch (error) {
      this.logger.error(
        `ensureMomentUniqueIndexes failed: ${(error as Error).message}`,
      );
    } finally {
      await queryRunner.release();
    }
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
    ownerOnly?: boolean;
    characterAuthorId?: string;
  }): Promise<{ items: Moment[]; total: number; hasMore: boolean } | Moment[]>;
  async getFeed(
    input?: {
      page?: number;
      limit?: number;
      ownerOnly?: boolean;
      characterAuthorId?: string;
    },
  ): Promise<Moment[] | { items: Moment[]; total: number; hasMore: boolean }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const avatarContext = await this.buildMomentAvatarContext({
      ownerId: owner.id,
      ownerAvatar: owner.avatar,
      ownerUsername: owner.username,
    });
    // ownerOnly：移动端"我的朋友圈"页用。直接在 DB 层 where 掉非主人 post，
    // 不再把 248+ 条全部拉回 Node 端 filter 一遍——典型 world owner 自己只发
    // 个位数条，省掉 ~95% 网络 + JSON 序列化开销。
    //
    // characterAuthorId：移动端 friend-moments 页用（/friend-moments/$id）。
    // 之前进单个角色朋友圈页要拉全表 110 条 ~724KB 再客户端 filter 出该角色的
    // 几条；改成 DB 层 where authorType='character' AND authorId=id 一次性收敛。
    // 还要走一遍 canOwnerViewPost（如果该 char 不是好友/被屏蔽，仍然 0 条返回）。
    const trimmedCharId = input?.characterAuthorId?.trim();
    // 走查 R1：postedAt 是秒级精度，同 1 秒发 2 条（NPC tick + 用户手动 / 两条
    // schedule 出来的 ai post）只按 postedAt DESC 排序在 SQLite 下顺序未定，
    // 翻页 slice 会把同时戳的两条在不同请求看到不同顺序。加 id DESC 做
    // tiebreaker —— id 是 uuid，DESC 序虽然没语义但稳定，保证翻页一致。
    const stableOrder = {
      postedAt: 'DESC' as const,
      id: 'DESC' as const,
    };
    const baseFindOptions = input?.ownerOnly
      ? {
          where: { authorType: 'user', authorId: owner.id },
          order: stableOrder,
        }
      : trimmedCharId
        ? {
            where: { authorType: 'character', authorId: trimmedCharId },
            order: stableOrder,
          }
        : { order: stableOrder };
    const posts = await this.postRepo.find(baseFindOptions);
    const visiblePosts = posts.filter((post) =>
      this.canOwnerViewPost(
        post,
        avatarContext.visibleCharacterIds,
        avatarContext.ownerFriendCharacterIds,
        avatarContext.momentsHiddenFromMeCharacterIds,
      ),
    );

    const hasPagination =
      input && (input.page !== undefined || input.limit !== undefined);
    if (!hasPagination) {
      return this._batchEnrichPosts(visiblePosts, avatarContext);
    }

    // 走 Number.isFinite 守 NaN：?page=abc / ?limit=abc 这种乱传不应该悄悄返回
    // 空列表，应当兜回默认页（page=1, limit=20）让 UI 还能正常加载。
    const rawPage = Number(input!.page);
    const page = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;
    const rawLimit = Number(input!.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(50, Math.max(1, Math.floor(rawLimit)))
      : 20;
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
      ownerUsername: owner.username,
    });
    const post = await this.postRepo.findOneBy({ id: postId });
    if (
      !post ||
      !this.canOwnerViewPost(
        post,
        avatarContext.visibleCharacterIds,
        avatarContext.ownerFriendCharacterIds,
        avatarContext.momentsHiddenFromMeCharacterIds,
      )
    )
      return null;
    return this._enrichPost(post, avatarContext);
  }

  // 朋友圈 / 视频号"听贴文"：把 post.text 通过 MiniMax TTS HD（speech-02-hd）合成
  // 朗读音频，结果缓存到 generationMetadata.narration{audioUrl,textHash,...}。同一段
  // 文本第二次调直接返回缓存；文本被改过（hash 不匹配）则重新合成。
  // voice 优先级：post.author（character）的 voicePreset → provider 默认音色。
  // 走 AiOrchestratorService.synthesizeSpeech，所以自动复用现有 token-plan 配额 +
  // 多 provider fallback 链，失败也走标准 AppError。
  async synthesizeMomentNarration(
    postId: string,
  ): Promise<{ audioUrl: string; durationMs?: number; cached: boolean }> {
    const existingInflight = this.inFlightNarrations.get(postId);
    if (existingInflight) return existingInflight;
    const job = this.synthesizeMomentNarrationInner(postId).finally(() => {
      this.inFlightNarrations.delete(postId);
    });
    this.inFlightNarrations.set(postId, job);
    return job;
  }

  private async synthesizeMomentNarrationInner(
    postId: string,
  ): Promise<{ audioUrl: string; durationMs?: number; cached: boolean }> {
    // 走查 R1：原版直接 findOneBy postId 然后合成，**没做可见性检查** ——
    // 任何登录用户可以朗读任何 post（包括被屏蔽的角色、设了 private 的别人贴
    // 等），既漏权限又烧 11000/天 的 TTS HD 配额。和 getPost / addOwnerComment
    // 同款的 owner visibility gate 走 canOwnerViewPost。
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const [visibleCharacterIds, ownerFriendCharacterIds, momentsHiddenFromMeCharacterIds] =
      await Promise.all([
        this.getVisibleCharacterIdSet(),
        this.characters.getActiveFriendCharacterIdSet(owner.id),
        this.remarkResolver.getMomentsHiddenFromMeCharacterIds(owner.id),
      ]);
    const post = await this.postRepo.findOneBy({ id: postId });
    if (
      !post ||
      !this.canOwnerViewPost(
        post,
        visibleCharacterIds,
        ownerFriendCharacterIds,
        momentsHiddenFromMeCharacterIds,
      )
    ) {
      throw new AppError('MOMENT_POST_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '朋友圈不存在或已删除。',
      });
    }
    const rawText = post.text?.trim();
    if (!rawText) {
      throw new AppError('MOMENT_POST_TEXT_EMPTY', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '这条内容没有可朗读的文本。',
      });
    }
    // 走查 R3：post.text 是 @Column('text')，理论无上限。MiniMax /t2a_v2 实测 ~10000
    // 字符上限，长文一次塞过去就 4xx；同时 11000/天 token-plan 配额按 token 数算，
    // 50KB 的 moment 会一次烧光大量配额。客户端实践里 moment 文本 <500，先 hard cap
    // 3000 字符（约 1.2KB UTF-8，TTS 单次合成 ~2.5min 音频）兜底，超长尾省略号截断。
    const MAX_NARRATION_CHARS = 3000;
    const text =
      rawText.length > MAX_NARRATION_CHARS
        ? `${rawText.slice(0, MAX_NARRATION_CHARS)}…`
        : rawText;

    // 走查 yuanzui0728 本次 R1：voice resolve 必须先于 cache 检查 —— 原版只
    // hash text，admin 改了 character.voicePreset 后老贴的 cache 仍命中、返回
    // 旧音色的 mp3，用户重听感受"为什么换了音色却没生效"。包进 hash key 后
    // voicePreset 一变，textHash 就 mismatch → 自然重合成。代价是 cache 命中
    // 也要查一次 characters.findById（~1ms），换正确性。
    // 角色作者 → 用其 voicePreset；user 作者 → 走全局默认音色。
    let voice: string | undefined;
    if (post.authorType === 'character') {
      const author = await this.characters.findById(post.authorId);
      voice = author?.voicePreset?.trim() || undefined;
    }

    // 按 text + voice 联合 hash 做 cache key；voice 变了自动失效。
    // 用 \x1f (Unit Separator) 分隔避免 "abc" + "def" 与 "ab" + "cdef" 撞 hash。
    const textHash = createHash('sha256')
      .update(`${text}\x1f${voice ?? ''}`)
      .digest('hex')
      .slice(0, 16);
    const meta = (post.generationMetadata ?? {}) as Record<string, unknown>;
    const cached = meta.narration as
      | {
          audioUrl?: string;
          durationMs?: number;
          textHash?: string;
        }
      | undefined;
    if (cached?.audioUrl && cached.textHash === textHash) {
      return {
        audioUrl: cached.audioUrl,
        durationMs: cached.durationMs,
        cached: true,
      };
    }

    const synthesized = await this.ai.synthesizeSpeech({
      text,
      characterId:
        post.authorType === 'character' ? post.authorId : undefined,
      voice,
    });
    const asset = await this.speechAssets.saveGeneratedSpeech(
      synthesized.buffer,
      {
        mimeType: synthesized.mimeType,
        fileExtension: synthesized.fileExtension,
        baseName: `moment-narration-${post.id}`,
      },
    );
    const updatedMeta = {
      ...meta,
      narration: {
        audioUrl: asset.audioUrl,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        durationMs: synthesized.durationMs,
        textHash,
        synthesizedAt: new Date().toISOString(),
      },
    };
    // 走查 yuanzui0728 本次 R3：原版 postRepo.save(post) 是 upsert 语义。
    // 如果 owner 在另一端 (iPad / 其他客户端) 在 TTS 合成期间删了这条贴，
    // 这里 save 会按 entity 整行 INSERT 回去 —— 死贴复活，连同新生成的
    // narration 一起。改用 update({ id }) 精确更新单列；行已删则 affected=0，
    // 我们仍把 audioUrl 返给用户（mp3 已生成，TTS 配额已消费，让他听一下不
    // 再多花什么），但下次再点会重合成 cache miss——和"贴不存在"的语义一致。
    const updateResult = await this.postRepo.update(
      { id: post.id },
      { generationMetadata: updatedMeta },
    );
    if (updateResult.affected === 0) {
      this.logger.warn(
        `moment narration saved but post=${post.id} disappeared mid-synthesis; not resurrecting`,
      );
    }
    return {
      audioUrl: asset.audioUrl,
      durationMs: synthesized.durationMs,
      cached: false,
    };
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
    // 前端 WeChatCommentBar 已经用 value.trim().length>0 拦过空提交，但 curl /
    // 第三方客户端直接 POST 仍能写入空字符串或纯空白，DB 里会出现"w："这种渲染
    // 不出正文的脏评论。在服务端再拦一次，统一入口。
    // trim 后再判 ZWS：之前能写一条纯零宽字符的评论，footer 上挂个 "w：" 但
    // 正文区是空——视觉跟空评论一样，但走 "empty" 校验是通过的。
    const trimmedText = typeof text === 'string' ? text.trim() : '';
    if (!trimmedText || isMomentTextVisuallyEmpty(trimmedText)) {
      // 用复数前缀 MOMENTS_* 跟 contracts errors.ts 白名单 + error-translate.ts
      // i18n 字典对齐——单数前缀 MOMENT_* 不在 contracts AppErrorCode union 里，
      // 前端 i18n 字典查不到只能 fall through 到 legacyMessage（永远是中文），
      // 非 zh-CN locale 用户拿不到本地化错误。
      throw new AppError('MOMENTS_COMMENT_EMPTY', {
        legacyMessage: '评论内容不能为空。',
        status: HttpStatus.BAD_REQUEST,
      });
    }
    if (trimmedText.length > MAX_COMMENT_TEXT_LENGTH) {
      throw new AppError('MOMENTS_COMMENT_TOO_LONG', {
        params: { max: MAX_COMMENT_TEXT_LENGTH },
        legacyMessage: `评论最多 ${MAX_COMMENT_TEXT_LENGTH} 字。`,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    // 校验 replyToCommentId 必须属于同一条 moment —— 否则 UI 找不到目标只能退化成
    // 普通评论展示，但 replyToAuthorId 还留着，语义错乱。
    const replyToCommentId = replyTo?.replyToCommentId?.trim() || null;
    if (replyToCommentId) {
      const target = await this.commentRepo.findOneBy({ id: replyToCommentId });
      if (!target || target.postId !== postId) {
        throw new AppError('MOMENTS_COMMENT_REPLY_TARGET_INVALID', {
          legacyMessage: '被回复的评论不存在或已被删除。',
          status: HttpStatus.BAD_REQUEST,
        });
      }
    }
    return this.addComment(
      postId,
      owner.id,
      owner.username?.trim() || 'You',
      owner.avatar ?? '',
      trimmedText,
      'user',
      { ...replyTo, replyToCommentId },
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
    // replyToAuthorId 必须有 replyToCommentId 才有意义——只有 reply-to-author 没有
    // reply-to-comment 是脏数据（前端绝不该这么发，但 curl / 第三方客户端能伪造）。
    // DB 里留着这种半残状态会让 visibleComments 上 reply 显示半残「回复 X：正文」
    // 但点过去找不到原评论的目标。trim 后纯空白也归零。
    let replyToAuthorId = replyToCommentId
      ? replyTo?.replyToAuthorId?.trim() || null
      : null;
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
    // 走查 R1：save + increment 之间崩溃（进程被 kill / DB busy timeout）会让
    // 评论已写入但 commentCount 永远 -1，onModuleInit 的 recount 要等下次重启
    // 才修。包成 transaction：commentCount 跟评论一起成功 / 一起回滚。
    const saved = await this.dataSource.transaction(async (manager) => {
      const persisted = await manager.save(MomentCommentEntity, comment);
      await manager.increment(
        MomentPostEntity,
        { id: postId },
        'commentCount',
        1,
      );
      return persisted;
    });
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
      // 并发窗口里 findOneBy 双方都看到 existing → 双方都跑 delete + decrement，
      // likeCount 会减成 -1 再被 onModuleInit recount 拉回。delete().affected 拿到
      // 真实删了多少行，只有真正赢得这次删除的那一次才扣 count。
      const result = await this.likeRepo.delete(existing.id);
      if ((result.affected ?? 0) > 0) {
        await this.postRepo.decrement({ id: postId }, 'likeCount', 1);
      }
      return { liked: false };
    }
    const like = this.likeRepo.create({
      postId,
      authorId,
      authorName,
      authorAvatar,
      authorType,
    });
    try {
      await this.likeRepo.save(like);
    } catch (error) {
      // uniq_moment_likes_post_author 撞了：并发两路 toggleLike 都看到没有
      // existing 然后同时 save，DB 层兜底唯一索引把第二路 abort。语义上
      // 这次 toggle 实际"已经"被另一路完成（liked=true），UI 也已 optimistic
      // 切到 liked 状态，再退一步反而把 UI 和 DB 弄反。直接当成成功返回。
      const message = (error as Error).message?.toLowerCase() ?? '';
      if (
        message.includes('uniq_moment_likes_post_author') ||
        message.includes('unique constraint') ||
        message.includes('sqlite_constraint')
      ) {
        return { liked: true };
      }
      throw error;
    }
    await this.postRepo.increment({ id: postId }, 'likeCount', 1);
    return { liked: true };
  }

  async deleteOwnerPost(postId: string): Promise<{ success: true; id: string }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post) {
      // 同上：复数前缀对齐 contracts errors.ts + i18n 字典；单数前缀走不进 i18n。
      throw new AppError('MOMENTS_NOT_FOUND', {
        legacyMessage: '该朋友圈不存在或已被删除。',
        status: HttpStatus.NOT_FOUND,
      });
    }
    if (post.authorType !== 'user' || post.authorId !== owner.id) {
      throw new AppError('MOMENTS_DELETE_FORBIDDEN', {
        legacyMessage: '只能删除自己发布的朋友圈。',
        status: HttpStatus.FORBIDDEN,
      });
    }
    // 走查 R1：三条独立 delete 之间没有事务保护——中间一条崩了会留下孤儿
    // moment_comments / moment_likes 永远查不到也删不掉，磁盘累积。包成一次
    // transaction：要么整组删，要么一行不删。
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(MomentCommentEntity, { postId });
      await manager.delete(MomentLikeEntity, { postId });
      await manager.delete(MomentPostEntity, postId);
    });
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
      // 角色开了 webSearchEnabled + 有 expertDomains → 追一次热点搜索，
      // 注入到 moment system prompt 让贴文贴近"今天发生的事"。失败/无配额 swallow。
      const momentExtraSystemSections: string[] = [];
      if (
        !reminderMoment &&
        char.webSearchEnabled === true &&
        char.expertDomains?.length
      ) {
        const trendQuery = `${char.expertDomains.slice(0, 2).join(' ')} 最新`;
        const injection = await this.webSearch.searchAndFormat(trendQuery);
        if (injection) momentExtraSystemSections.push(injection.markdown);
      }
      const text =
        reminderMoment?.text ??
        (await this.ai.generateMoment({
          profile,
          currentTime,
          extraSystemPromptSections: momentExtraSystemSections,
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

      // AI 生成的朋友圈正文过内容审核（命中违禁→替换安全话术）。reminder nudge
      // （晚安/喝水/番茄钟）是我们自己的安全文案，不必审。区域 cn/intl 由部署级 env 决定。
      const safeText = reminderMoment ? text : sanitizeAiMessageText(text);

      // 尝试为这条朋友圈配 1 张 AI 方图。受 3 层约束控制（任一失败都安全
      // fallback 为纯文本，不影响发帖本身）：
      //   1) MomentImageBudgetService —— 全 world 日上限 100 + world 内角色
      //      动态优先级均分
      //   2) MinimaxQuotaService.image-01 三态配额 —— 单 key 当日 120 张总额
      //   3) MiniMax API 实时熔断 —— 1042 / 2056 撞墙时 release 后 fallback
      //
      // 跳过：提醒角色发的"晚安/喝水/番茄钟"类系统消息（reminderMoment）。
      // 这种文案配 AI 图无意义还会破坏体验，也白烧 100/天的有限名额。
      const imageMedia = reminderMoment
        ? null
        : await this.tryGenerateMomentImage(
            char.id,
            char.name,
            safeText,
            profile,
          );

      const post = this.postRepo.create({
        authorId: characterId,
        authorName: char.name,
        authorAvatar: char.avatar,
        authorType: 'character',
        visibility: this.deriveDefaultVisibility(char.socialOpenness),
        text: safeText,
        contentType: imageMedia ? 'image_album' : 'text',
        mediaPayload: this.serializeMomentMedia(imageMedia ? [imageMedia] : []),
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
      // 会员到期必须 propagate：controller 直接 return 这个值，吞掉就让用户
      // 看到 null 不知道是过期(批量 generateAllMoments 也得早退)。
      if (err instanceof SubscriptionExpiredException) {
        throw err;
      }
      this.logger.error(`Failed to generate moment for ${characterId}`, err);
      return null;
    }
  }

  // 尝试为某条角色朋友圈生成 1 张 AI 配图。任何一步失败都返回 null，让调用方
  // 安全回退为纯文本 post。三态 image-01 quota 在异常路径上必须 release，
  // 否则 reserved 不归零会让今日剩余配额计数虚高。
  async tryGenerateMomentImage(
    characterId: string,
    characterName: string,
    postText: string,
    profile: PersonalityProfile,
  ): Promise<MomentImageAsset | null> {
    if (!this.minimaxClient.isConfigured()) return null;

    const allowed = await this.imageBudget.tryAllocate(characterId);
    if (!allowed) return null;

    const reserved = await this.minimaxQuota.tryReserve('image-01');
    if (!reserved) return null;

    try {
      const image = await this.minimaxClient.generateImage({
        model: 'image-01',
        prompt: composeMomentImagePrompt(characterName, postText, profile),
        aspectRatio: '1:1',
      });
      const persisted = await this.minimaxStorage.persist({
        buffer: image.buffer,
        mimeType: image.mimeType,
        kind: 'image',
        suffix: '-moment',
      });
      await this.minimaxQuota.commit('image-01');
      return {
        id: randomUUID(),
        kind: 'image',
        url: persisted.publicUrl,
        mimeType: image.mimeType,
        fileName: persisted.fileName,
        size: persisted.size,
      };
    } catch (err) {
      await this.minimaxQuota.release('image-01');
      this.logger.warn(
        `moment image gen failed for character ${characterId}: ${(err as Error)?.message}`,
      );
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

    // 走查 R3：空文件直接通过。CDP 实测之前 size=0 的 .png 也能 200 落盘，
    // 列表里再渲染时浏览器 decode 失败 → "破图"图标。前端 publish 路径不会
    // 主动发 0 字节（pickImageFiles 拿到 File 也是 > 0 字节），但第三方
    // curl / 移动端 picker 偶尔 cancel-after-select / SD 卡掉链能拿到空 File。
    // 多一行兜底，让 422 在上传那一刻就拒掉，避免列表里展示挂掉的图。
    // file.size 和 buffer.length 都校验：multer 在某些边界下两者不一致。
    if (file.size <= 0 || !file.buffer || file.buffer.length === 0) {
      throw new AppError('MOMENTS_MEDIA_REQUIRED', {
        legacyMessage: '上传的朋友圈媒体为空，请重新选择。',
        status: HttpStatus.BAD_REQUEST,
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

    // 关键：存相对 URL（`/api/moments/media/...`）而非拼了 PUBLIC_API_BASE_URL 的绝对 URL。
    // 历史 bug：上传时把当时的公网入口（含端口、含已废弃域名）固化到 mediaPayload 里，
    // 之后入口换端口/换协议（http→https 或 port migration），这些老帖的 URL 就永远 404。
    // minimax-asset.storage.ts 之前因为同一类 bug 已经改成相对路径，moments 这条上传通道
    // 漏了。前端 contracts/client.ts 的 normalizeAttachmentAssetUrl 会在渲染时基于当前
    // apiBaseUrl + /cloud/world-api 反代前缀正确 absolutize。
    if (isImage) {
      const asset: MomentImageAsset = {
        id: storedFileName,
        kind: 'image',
        url: `/api/moments/media/${storedFileName}`,
        thumbnailUrl: `/api/moments/media/${storedFileName}`,
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
      url: `/api/moments/media/${storedFileName}`,
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
      // legacyMessage 是非 i18n 客户端 / 直接 curl 调用的兜底显示文案；本仓库其它
      // 所有 MOMENTS_* 错误都用中文，单独这条用英文走的是「Moment media not found」
      // 会跨 locale 漏出，跟项目"中文兜底 + 前端再翻译"的约定不一致。
      throw new AppError('MOMENTS_MEDIA_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '朋友圈媒体不存在。',
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

    // 一次性给配图打 caption，缓存到 post.mediaPayload。后面每个角色的 setTimeout
    // 评论 closure 共享同一份 post 对象，buildMomentAiObservation 直接读 imageCaption，
    // 不再每个角色都重新跑 vision；也让默认 provider 不支持 image_url 的世界（如
    // MiniMax-M2.7）的角色能"看到"图。
    await this.ensureMomentImageCaptions(post);

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
    momentsHiddenFromMeCharacterIds?: Set<string>,
  ): boolean {
    if (post.authorType !== 'character') return true;
    if (!visibleCharacterIds.has(post.authorId)) return false;
    if (post.visibility === 'private') return false;
    // 朋友圈是「好友圈」语义：未加好友的角色无论是 public 还是 friends 都不在这里露出。
    // （想看所有角色的动态请去广场页面，那里走 feed.service 的查询，不受这个门控约束。）
    if (!ownerFriendCharacterIds?.has(post.authorId)) return false;
    // 走查新 R1：用户在朋友权限里关掉了"看 TA 的朋友圈"
    // (friendship.momentsHiddenFromMe=true) 就完整把 TA 的 moment 过滤掉。
    // 此前这个开关只存了 DB，没有任何路径会读，是个 dead UI。
    if (momentsHiddenFromMeCharacterIds?.has(post.authorId)) return false;
    return true;
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
    const [
      visibleCharacterIds,
      ownerFriendCharacterIds,
      momentsHiddenFromMeCharacterIds,
    ] = await Promise.all([
      this.getVisibleCharacterIdSet(),
      this.characters.getActiveFriendCharacterIdSet(owner.id),
      this.remarkResolver.getMomentsHiddenFromMeCharacterIds(owner.id),
    ]);
    const post = await this.postRepo.findOneBy({ id: postId });
    if (
      !post ||
      !this.canOwnerViewPost(
        post,
        visibleCharacterIds,
        ownerFriendCharacterIds,
        momentsHiddenFromMeCharacterIds,
      )
    ) {
      // 之前用 'Moment not found' 英文兜底，对齐 deleteOwnerPost 的中文兜底；
      // 老/非 i18n 客户端拿到 curl message 不会再出英文文案，跟其它 MOMENTS_*
      // 错误的中文风格一致。
      throw new AppError('MOMENTS_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '该朋友圈不存在或已被删除。',
      });
    }
    if (!this.canOwnerInteractWithPost(post, ownerFriendCharacterIds, owner.id)) {
      // 补句末句号，跟同模块其它 legacyMessage（如「评论内容不能为空。」）的
      // 标点风格对齐——前端 toast 拼接时不会出现「需先加为好友才能互动 朋友圈
      // 互动已更新。」这种半句缺标点。
      throw new AppError('MOMENTS_NOT_FRIEND', {
        status: HttpStatus.FORBIDDEN,
        legacyMessage: '需先加为好友才能互动。',
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
      authorName: this.remarkResolver.applyCharacterRemark(
        post.authorType,
        post.authorId,
        this.resolveMomentAuthorName(
          post.authorType,
          post.authorId,
          post.authorName,
          resolvedAvatarContext,
        ),
        resolvedAvatarContext.remarkMap,
      ),
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
      // 走查 R1：interactions 字段是 likes + comments 的扁平+带类型标签复刻视图。
      // grep 整个 monorepo（apps/app、apps/wiki、apps/admin、apps/site、所有 spec
      // 和 script）找消费者：0 个客户端在读 moment.interactions，唯一引用只剩
      // legacy MomentEntity（'moments' 表 21 行老数据，never queried by service）
      // + contracts 类型定义本身。但每条帖子的 interactions 字段大小约 =
      // likes 行数 × ~60 + 评论行数 × ~80 bytes：实测一条 54 评论帖单独占 9.8KB，
      // 而 page=1 limit=20 整页拉到 145KB 里 interactions 占 30-50KB。
      // 修法：保留 contract 字段（避免破坏向后兼容、type-check），server 始终
      // emit []，省掉 JSON 序列化 + 网络传输 + 客户端 parse 三段开销。哪天真有
      // 消费者要回填的时候再 inline 一次性恢复。
      interactions: [],
    };
  }

  private serializeMomentLike(
    like: MomentLikeEntity,
    avatarContext: MomentAvatarContext,
  ): MomentLikeEntity {
    return {
      ...like,
      authorName: this.remarkResolver.applyCharacterRemark(
        like.authorType,
        like.authorId,
        this.resolveMomentAuthorName(
          like.authorType,
          like.authorId,
          like.authorName,
          avatarContext,
        ),
        avatarContext.remarkMap,
      ),
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
      authorName: this.remarkResolver.applyCharacterRemark(
        comment.authorType,
        comment.authorId,
        this.resolveMomentAuthorName(
          comment.authorType,
          comment.authorId,
          comment.authorName,
          avatarContext,
        ),
        avatarContext.remarkMap,
      ),
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
    ownerUsername?: string | null;
  }): Promise<MomentAvatarContext> {
    // ownerUsername 没显式传时，必须从 owner 表实时查；
    // 不能从入参拼的 partial owner（只有 id/avatar）里漏出旧 username，
    // 否则 serializeMoment 会把旧名字回灌给前端 — 这正是改名后历史朋友圈
    // 还显示旧名字的根因。
    const owner =
      input?.ownerId === undefined
        ? await this.worldOwnerService.getOwnerOrThrow()
        : {
            id: input.ownerId,
            avatar: input.ownerAvatar ?? '',
          };
    // 走查第六轮 R1：getOwnerRemarkMap + getMomentsHiddenFromMeCharacterIds
    // 之前是两条独立 SQL 跑同一张 friendships 表、同 ownerId。每次 /moments
    // /moments?character / getPost / assertOwnerCanInteractWithPost 入口都
    // 走这里，热路径双倍 round-trip。合并成 getOwnerRemarkAndMomentsContext
    // 一次 select 后在 JS 里 fan-out，砍掉一半的 friendship 读。
    const [
      visibleCharacters,
      ownerFriendCharacterIds,
      { remarkMap, momentsHiddenFromMeCharacterIds },
    ] = await Promise.all([
      this.characters.findAllVisibleToOwner(owner.id),
      this.characters.getActiveFriendCharacterIdSet(owner.id),
      this.remarkResolver.getOwnerRemarkAndMomentsContext(owner.id),
    ]);

    let ownerUsername =
      input?.ownerUsername === undefined
        ? null
        : (input.ownerUsername ?? '').trim() || '';
    if (ownerUsername === null) {
      ownerUsername =
        'username' in owner
          ? (owner.username ?? '').trim()
          : ((await this.worldOwnerService.getOwnerOrThrow()).username ?? '')
              .trim();
    }
    return {
      ownerAvatar: owner.avatar?.trim() || '',
      ownerUsername,
      ownerId: owner.id,
      visibleCharacterIds: new Set(
        visibleCharacters.map((character) => character.id),
      ),
      ownerFriendCharacterIds,
      momentsHiddenFromMeCharacterIds,
      characterAvatarById: new Map(
        visibleCharacters.map((character) => [character.id, character.avatar]),
      ),
      characterNameById: new Map(
        // 角色没填 name 时（极少）退回空串，resolveMomentAuthorName 会自动
        // fallthrough 到 currentName 快照——比强行返回空名字安全。
        visibleCharacters.map((character) => [
          character.id,
          (character.name ?? '').trim(),
        ]),
      ),
      remarkMap,
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

  // 跟 resolveMomentAuthorAvatar 对称：moment_post / moment_comment / moment_like
  // 的 authorName 也是在写入那一刻拍快照。世界主人在「我」→「名字」改名后，
  // 历史的 post.authorName / like.authorName / comment.authorName 仍是旧名字，
  // 朋友圈页跟数据看起来好像没改名。这里在序列化时按当前 owner.username
  // 覆盖。
  //
  // 走查 R2 补：character 路径之前完全依赖快照 + applyCharacterRemark 二选一，
  // 角色被改名但 owner 没设备注时，所有历史 like/comment 还挂旧名字。这跟
  // owner rename 是对称的 UX hole；优先用 characterNameById（entity 当前名）
  // 覆盖，applyCharacterRemark 在外层 wrapper 里仍然有最高优先级——remark
  // 永远 win over 当前名，跟之前语义一致。
  private resolveMomentAuthorName(
    authorType: string | null | undefined,
    authorId: string | null | undefined,
    currentName: string | null | undefined,
    avatarContext: MomentAvatarContext,
  ) {
    if (
      authorType === 'user' &&
      authorId === avatarContext.ownerId &&
      avatarContext.ownerUsername
    ) {
      return avatarContext.ownerUsername;
    }
    if (authorType === 'character' && authorId) {
      const liveName = avatarContext.characterNameById.get(authorId);
      if (liveName) {
        return liveName;
      }
    }
    return currentName ?? '';
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
    // normalizeMomentContentType 把任何不识别的值（如 'image'、空串、拼错的
    // 'video_clip' 等）静默压成 'text'。和 `?? inferredContentType` 顺序结合
    // 后果是：客户端发 contentType='image' + 10 张图 → 压成 'text' →
    // assertMomentMediaMatchesContentType 抛 MOMENTS_TEXT_NO_MEDIA「纯文本
    // 朋友圈不能附带图片或视频」，错误指向完全反了，第三方/curl 调用者根本
    // 调不出来。
    // 走查 R2：input.contentType 给了但不在白名单里 → 当成"客户端没给"，
    // 走 inferredContentType。前端官方 client 永远发的是 contract 里的合法值，
    // 这个 fallback 只影响第三方 / 老 client / 拼写错误用例，行为更宽容。
    // input.contentType 明确给 'text'（仍在白名单内）+ media>0 的检测路径
    // 不受影响——normalize 那里就直接返回 'text'，下面 assertMatch 照样抛
    // MOMENTS_TEXT_NO_MEDIA（合理：明确要求 text 却带媒体 = 客户端语义冲突）。
    const KNOWN_TYPES: ReadonlySet<MomentContentType> = new Set([
      'text',
      'image_album',
      'video',
      'live_photo',
      'audio_card',
    ]);
    const explicitContentType =
      typeof input.contentType === 'string' &&
      KNOWN_TYPES.has(input.contentType as MomentContentType)
        ? (input.contentType as MomentContentType)
        : undefined;
    const contentType = explicitContentType ?? inferredContentType;
    const visibility = this.normalizeUserMomentVisibility(input.visibility);

    // 视觉为空（纯空白 / 纯 ZWS）且没附媒体 → 拒收。trim 后纯零宽字符在
    // `!text` 判定里是 truthy，会落库成一条无正文 + 无媒体的"幽灵帖"，列表
    // 卡片里只剩头像/时间，看起来像渲染挂了。
    if (media.length === 0 && (!text || isMomentTextVisuallyEmpty(text))) {
      throw new AppError('MOMENTS_EMPTY', {
        legacyMessage: '朋友圈内容和媒体不能同时为空。',
      });
    }

    if (text.length > MAX_MOMENT_TEXT_LENGTH) {
      throw new AppError('MOMENTS_TEXT_TOO_LONG', {
        params: { max: MAX_MOMENT_TEXT_LENGTH },
        legacyMessage: `朋友圈正文最多 ${MAX_MOMENT_TEXT_LENGTH} 字。`,
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
      const url = asset.url?.trim() || '';
      const posterUrl = asset.posterUrl?.trim() || undefined;
      // 阻止 SSRF：url / posterUrl 必须命中 /api/moments/media/ 白名单。
      assertMomentMediaUrl(url, 'video.url');
      assertMomentMediaUrl(posterUrl, 'video.posterUrl');
      const posterCaption = asset.posterCaption?.trim() || undefined;
      return {
        id: asset.id?.trim() || `moment-video-${index + 1}`,
        kind: 'video',
        url,
        posterUrl,
        mimeType: asset.mimeType?.trim() || 'video/mp4',
        fileName: asset.fileName?.trim() || `video-${index + 1}`,
        size: Math.max(0, Math.round(asset.size ?? 0)),
        width: normalizeOptionalPositiveNumber(asset.width),
        height: normalizeOptionalPositiveNumber(asset.height),
        durationMs: normalizeOptionalPositiveNumber(asset.durationMs),
        posterCaption,
      };
    }

    if (asset.kind === 'audio') {
      const url = asset.url?.trim() || '';
      const posterUrl = asset.posterUrl?.trim() || undefined;
      assertMomentMediaUrl(url, 'audio.url');
      assertMomentMediaUrl(posterUrl, 'audio.posterUrl');
      return {
        id: asset.id?.trim() || `moment-audio-${index + 1}`,
        kind: 'audio',
        url,
        posterUrl,
        mimeType: asset.mimeType?.trim() || 'audio/mpeg',
        fileName: asset.fileName?.trim() || `audio-${index + 1}`,
        size: Math.max(0, Math.round(asset.size ?? 0)),
        durationMs: normalizeOptionalPositiveNumber(asset.durationMs),
        title: asset.title?.trim() || undefined,
        lyrics: asset.lyrics?.trim() || undefined,
      };
    }

    const url = asset.url?.trim() || '';
    const thumbnailUrl = asset.thumbnailUrl?.trim() || url || undefined;
    const motionUrl = asset.livePhoto?.motionUrl?.trim() || undefined;
    assertMomentMediaUrl(url, 'image.url');
    assertMomentMediaUrl(thumbnailUrl, 'image.thumbnailUrl');
    assertMomentMediaUrl(motionUrl, 'image.livePhoto.motionUrl');
    const imageCaption = asset.imageCaption?.trim() || undefined;
    return {
      id: asset.id?.trim() || `moment-image-${index + 1}`,
      kind: 'image',
      url,
      thumbnailUrl,
      mimeType: asset.mimeType?.trim() || 'image/jpeg',
      fileName: asset.fileName?.trim() || `image-${index + 1}`,
      size: Math.max(0, Math.round(asset.size ?? 0)),
      width: normalizeOptionalPositiveNumber(asset.width),
      height: normalizeOptionalPositiveNumber(asset.height),
      livePhoto: asset.livePhoto?.enabled
        ? {
            enabled: true,
            motionUrl,
          }
        : undefined,
      imageCaption,
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

  // 朋友圈 AI 评论 / 文本模型路径里能"看到"的图上限——和 ensureMomentImageCaptions
  // 必须严格一致，否则会出现"打了 caption 的图没进 summary"或"summary 里提到第 5 张
  // 但 parts 只有 4 张"的不对齐问题。
  private static readonly MAX_AI_OBSERVABLE_IMAGES = 4;

  private collectObservableImagesWithIndex(
    media: MomentMediaAsset[],
  ): Array<{ mediaIndex: number; asset: MomentImageAsset }> {
    const out: Array<{ mediaIndex: number; asset: MomentImageAsset }> = [];
    for (let i = 0; i < media.length; i++) {
      const asset = media[i];
      if (asset.kind !== 'image') continue;
      out.push({ mediaIndex: i, asset });
      if (out.length >= MomentsService.MAX_AI_OBSERVABLE_IMAGES) break;
    }
    return out;
  }

  private async buildMomentAiObservation(post: MomentPostEntity): Promise<{
    summary: string;
    parts?: AiMessagePart[];
  }> {
    const media = this.parseMomentMediaPayload(post.mediaPayload);
    const parts: AiMessagePart[] = [];
    const contentType = this.normalizeMomentContentType(post.contentType);
    let summary = this.buildMomentPromptSummary(post);

    const imageEntries = this.collectObservableImagesWithIndex(media);

    imageEntries.forEach(({ asset }, index) => {
      parts.push({
        type: 'image',
        imageUrl: asset.url,
        mimeType: asset.mimeType,
        detail: 'auto',
        altText: `朋友圈配图 ${index + 1}`,
      });
    });

    const captionEntries: Array<{ label: string; caption: string }> = [];
    imageEntries.forEach(({ asset }, idx) => {
      const caption = asset.imageCaption?.trim();
      if (!caption) return;
      captionEntries.push({
        label:
          imageEntries.length > 1 ? `第${idx + 1}张` : '配图',
        caption,
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
        const posterCaption = video.posterCaption?.trim();
        if (posterCaption) {
          captionEntries.push({ label: '视频封面', caption: posterCaption });
        }
      }
    }

    summary =
      (await this.appendMomentTranscriptSummary(summary, media, post)) ??
      summary;

    summary = this.appendMomentImageCaptionSummary(summary, captionEntries);

    return {
      summary,
      parts: parts.length ? parts : undefined,
    };
  }

  private appendMomentImageCaptionSummary(
    summary: string,
    entries: Array<{ label: string; caption: string }>,
  ): string {
    if (!entries.length) {
      return summary;
    }
    if (entries.length === 1) {
      return `${summary}。${entries[0].label}内容（AI 视觉识别）：${entries[0].caption}`;
    }
    const lines = entries.map((entry) => `${entry.label}：${entry.caption}`);
    return `${summary}。配图内容（AI 视觉识别）：\n${lines.join('\n')}`;
  }

  /**
   * 走查时发现 yuanzui 的默认 provider 是 MiniMax-M2.7（不支持原生 image_url），
   * 用户发图到朋友圈后所有角色评论都回"图片我看不到"。这里在角色互动调度起跑前
   * 单次调用 vision-capable provider 给每张图出一段文字描述，缓存到 mediaPayload
   * 里；后续每个角色评论都能从 buildMomentAiObservation 拿到文字配图内容，不再依赖
   * 下游模型是否原生看图。
   *
   * 调用方式：scheduleCharacterInteractions 顶部 await 一次，10 个角色后续 setTimeout
   * 里读到的就是已缓存的 caption；不需要每次都重新跑 vision。
   */
  private async ensureMomentImageCaptions(
    post: MomentPostEntity,
  ): Promise<void> {
    const media = this.parseMomentMediaPayload(post.mediaPayload);
    if (!media.length) {
      return;
    }

    // 跟 buildMomentAiObservation 共用同一个 collectObservableImagesWithIndex；
    // 以前两边各自 filter+slice，mediaIndex 还是 filtered-images 数组的下标，写回
    // media[wrongIndex] 会改错对象（live_photo / 混合 media 时会撞）。这版统一走
    // "media 的真索引"。
    const imageTargets = this.collectObservableImagesWithIndex(media).filter(
      ({ asset }) => !asset.imageCaption?.trim(),
    );

    // video 帖的封面图也要单独走一次 caption，写回 video asset 的 posterCaption。
    let videoPosterTarget: {
      videoIndex: number;
      asset: MomentVideoAsset;
    } | null = null;
    const contentType = this.normalizeMomentContentType(post.contentType);
    if (contentType === 'video') {
      const video = media[0];
      if (
        video?.kind === 'video' &&
        video.posterUrl &&
        !video.posterCaption?.trim()
      ) {
        videoPosterTarget = { videoIndex: 0, asset: video };
      }
    }

    if (!imageTargets.length && !videoPosterTarget) {
      return;
    }

    const characterIdForKeyOverride =
      post.authorType === 'character' ? post.authorId : undefined;

    const captionJobs: Array<Promise<string | null>> = [
      ...imageTargets.map(({ asset }) =>
        this.ai.describeImageFromUrl({
          url: asset.url,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
          characterId: characterIdForKeyOverride,
        }),
      ),
    ];
    if (videoPosterTarget) {
      captionJobs.push(
        this.ai.describeImageFromUrl({
          url: videoPosterTarget.asset.posterUrl!,
          mimeType: 'image/jpeg',
          fileName: `${videoPosterTarget.asset.fileName}.poster`,
          characterId: characterIdForKeyOverride,
        }),
      );
    }

    const captions = await Promise.all(captionJobs);

    let changed = false;
    imageTargets.forEach(({ mediaIndex }, i) => {
      const caption = captions[i]?.trim();
      if (!caption) return;
      const target = media[mediaIndex];
      if (target.kind !== 'image') return; // 多一道防御，防止索引漂移
      target.imageCaption = caption;
      changed = true;
    });
    if (videoPosterTarget) {
      const posterCaption =
        captions[captions.length - 1]?.trim() || '';
      if (posterCaption) {
        const target = media[videoPosterTarget.videoIndex];
        if (target.kind === 'video') {
          target.posterCaption = posterCaption;
          changed = true;
        }
      }
    }

    if (!changed) {
      return;
    }

    // 关键：用 targeted update 只写 mediaPayload 一列，避免在 caption 异步等待期间被
    // 并发 toggleLike / addComment 增量改过的 likeCount / commentCount 被 save(post)
    // 整对象覆盖回旧值。post 对象在内存里也同步更新，下面 setTimeout closures 还能直接读。
    const nextPayload = this.serializeMomentMedia(media);
    post.mediaPayload = nextPayload;
    try {
      await this.postRepo.update({ id: post.id }, { mediaPayload: nextPayload });
    } catch (error) {
      // 落库失败也无所谓，本次调度的 closure 们仍持有同一份 post 对象的 imageCaption；
      // 顶多重启后再触发评论时需要重跑一次 vision。
      this.logger.warn(
        `ensureMomentImageCaptions: persist failed for post ${post.id}: ${(error as Error).message}`,
      );
    }
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
    const [ownerFriendCharacterIds, momentsHiddenFromThemCharacterIds] =
      await Promise.all([
        this.characters.getActiveFriendCharacterIdSet(owner.id),
        this.remarkResolver.getMomentsHiddenFromThemCharacterIds(owner.id),
      ]);

    for (const char of activeCandidates) {
      // 朋友圈是「好友圈」语义：非好友角色不会主动到任何朋友圈里露脸。
      if (!ownerFriendCharacterIds.has(char.id)) continue;

      const baseChance = char.proactiveBrowseChance ?? 0.1;
      const freqMul =
        FREQ_MULTIPLIER[char.activityFrequency ?? 'normal'] ?? 1.0;
      const browseChance = Math.min(0.5, baseChance * freqMul);
      if (Math.random() > browseChance) continue;

      participantCount += 1;

      // 走查 R2 复检：朋友权限页"TA 看不到我的朋友圈"开关一直是 dead flag——
      // 此时 npc tick 仍把用户最新 moment 推给这位 char 当候选，char 会
      // 点赞 / 评论，用户看到通知就知道开关白勾了。把 hiddenFromThem 的 char
      // 在看到 user authorType 的 post 时直接过滤掉，他俩之间的 user→char
      // 朋友圈链路就切干净了（char→user 方向由 momentsHiddenFromMe 兜底）。
      const hideUserPostsFromThisChar =
        momentsHiddenFromThemCharacterIds.has(char.id);

      const candidatePosts = recentPosts.filter(
        (post) =>
          post.authorId !== char.id &&
          !(
            hideUserPostsFromThisChar &&
            post.authorType === 'user' &&
            post.authorId === owner.id
          ),
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
  // Tier 3: 本地 composeMusicLyrics 模板
  //   注意：过去这里曾用 ai.generatePlainText 走通用 LLM（会被
  //   AiOrchestrator 兜底到 n1n.ai）。2026-05-13 撤掉——minimax 容量耗尽时
  //   每首歌都打一次 n1n 既贵又破坏"歌词全程留在 minimax tokenplan 内"的约束。
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
          // 服务端 2056 = Token Plan Max 当日整体耗尽：lyrics / chat / music 共享同一池子。
          // 既然 music 也满了，做歌词等于白调 n1n —— 同时标记 music-2.6 / music-2.5
          // exhausted，并抛 skip 错让 scheduleMinimaxMusicMoment 整条放弃。
          if (
            err instanceof MinimaxClientError &&
            err.code === 'MINIMAX_QUOTA_EXHAUSTED'
          ) {
            // 走查 yuanzui0728 本次 R5：parseMinimaxResetAt 让 5h-window 撞 2056
            // 后真窗口结束就自动解封，不再锁全 fleet 到明天。
            const resetAt = parseMinimaxResetAt(err.message);
            await this.minimaxQuota.markExhaustedToday('lyrics', resetAt);
            await this.minimaxQuota.markExhaustedToday('music-2.6', resetAt);
            await this.minimaxQuota.markExhaustedToday('music-2.5', resetAt);
            throw new MusicQuotaExhaustedError(
              `token plan exhausted via lyrics 2056; skip music moment for ${characterName}`,
            );
          }
          this.logger.warn(
            `minimax lyrics endpoint failed, falling back to minimax LLM: ${(err as Error)?.message}`,
          );
        }
      } else if (await this.minimaxQuota.isExhaustedToday('lyrics')) {
        // 之前已经撞过 2056 被本地标死 → 同 token plan 的 music 也用不了，整条放弃。
        throw new MusicQuotaExhaustedError(
          `lyrics quota already exhausted today; skip music moment for ${characterName}`,
        );
      } else {
        this.logger.debug(
          'minimax lyrics quota exhausted, falling back to minimax LLM',
        );
      }
    }

    // Tier 2: minimax chatcompletion_v2 + MiniMax-M2.7（tokenplan LLM）
    // 接入 quota service：撞 2056 后 markExhaustedToday，后续 tick 秒进 Tier3。
    if (this.minimaxClient.isConfigured()) {
      const m27Reserved = await this.minimaxQuota.tryReserve('MiniMax-M2.7');
      if (!m27Reserved) {
        this.logger.debug(
          'minimax M2.7 lyrics tier skipped (exhausted/pacing), falling to generic LLM',
        );
      } else {
        try {
          const result = await this.minimaxClient.chatCompletion({
            model: 'MiniMax-M2.7',
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 2000,
            temperature: 0.9,
          });
          await this.minimaxQuota.commit('MiniMax-M2.7');
          const cleaned = ensureVerseChorus(result.content);
          if (cleaned) {
            this.logger.log(
              `lyrics via minimax LLM (M2.7) for ${characterName} [theme=${theme}]`,
            );
            return cleaned;
          }
        } catch (err) {
          await this.minimaxQuota.release('MiniMax-M2.7');
          if (
            err instanceof MinimaxClientError &&
            err.code === 'MINIMAX_QUOTA_EXHAUSTED'
          ) {
            // M2.7 chat 也走同 Token Plan，2056 后熔断到真正 reset 时间。
            const resetAt = parseMinimaxResetAt(err.message);
            await this.minimaxQuota.markExhaustedToday(
              'MiniMax-M2.7',
              resetAt,
            );
          }
          this.logger.warn(
            `minimax LLM lyrics failed, falling back to generic LLM: ${(err as Error)?.message}`,
          );
        }
      }
    }

    // Tier 3: 本地模板（不再走 ai.generatePlainText，避免 orchestrator 兜底到 n1n）
    this.logger.log(
      `lyrics via local template for ${characterName} [theme=${theme}]`,
    );
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

    let lyrics: string;
    try {
      lyrics = await this.generateLyricsOrFallback(
        char.id,
        char.name,
        profile,
        seedText,
      );
    } catch (err) {
      if (err instanceof MusicQuotaExhaustedError) {
        this.logger.log(
          `skip music moment for ${char.name}: ${err.message}`,
        );
        return null;
      }
      throw err;
    }
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

    const videoMomentExtraSections: string[] = [];
    if (char.webSearchEnabled === true && char.expertDomains?.length) {
      const trendQuery = `${char.expertDomains.slice(0, 2).join(' ')} 最新`;
      const injection = await this.webSearch.searchAndFormat(trendQuery);
      if (injection) videoMomentExtraSections.push(injection.markdown);
    }
    let seedText = '';
    try {
      seedText = (
        await this.ai.generateMoment({
          profile,
          currentTime: new Date(),
          recentTopics: recentEvent ? [recentEvent] : undefined,
          extraSystemPromptSections: videoMomentExtraSections,
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
    // 视频朋友圈的 seedText 既作为可见正文落库（下面 text: seedText），又会喂进
    // composeMomentVideoPrompt 当视频 prompt，过一次内容审核（命中→安全话术）。
    seedText = sanitizeAiMessageText(seedText);

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
