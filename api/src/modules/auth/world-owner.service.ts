import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { AppError } from '../../common/app-error.exception';
import {
  GLOBAL_WORLD_OWNER_ID,
  GLOBAL_WORLD_OWNER_PHONE,
  isSharedWorldMode,
  TenantContextStore,
} from '../tenancy/tenant-context';
import { SubscriptionExpiredException } from '../subscription/subscription-expired.exception';
import { UserEntity } from './user.entity';
import { decryptUserApiKey, encryptUserApiKey } from './api-key-crypto';
import type { AiKeyOverride, UserProfileContext } from '../ai/ai.types';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { VideoChannelFollowEntity } from '../feed/video-channel-follow.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import type { ChatBackgroundAsset } from '../chat/chat-background.types';
import {
  normalizeChatBackgroundAsset,
  parseChatBackgroundAsset,
} from '../chat/chat-background.utils';
const MIN_OWNER_NAME_LENGTH = 2;
// 与移动端 profile-info-name-page MAX=20 / signature MAX=60 对齐，但服务端给
// 一点宽容（粘贴时多空格、不同前端版本）。avatar 接受 URL 或 base64 data URL，
// 1MB 文件 → ~1.33MB base64，给 2MB 上限挡掉粘贴 10MB 大字符串 / 恶意客户端。
// 之前完全没卡 → 同 phone 反复 PATCH 巨型 avatar 让 DB 行膨胀、每次 GET owner
// 都把整坨拉回前端。
const MAX_OWNER_NAME_LENGTH = 64;
const MAX_OWNER_SIGNATURE_LENGTH = 300;
const MAX_OWNER_AVATAR_LENGTH = 2 * 1024 * 1024;

// username 内嵌 \r \n \t 等控制字符是脏数据：profile-page 头部 truncate 会让
// "foo\nbar" 看成 "foo bar"，但下游某些 chat sender / moments author 会照原样
// 渲染断行。前端 sanitize 已落，这里再兜一次，挡住老客户端 / curl 直调。
const CONTROL_CHAR_REGEX = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f]+', 'g');
function sanitizeOwnerName(value: string): string {
  return value.replace(CONTROL_CHAR_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

// signature 也按单行存：前端 profile-info-signature-page.tsx 早就 sanitize
// 把 \r\n\t 折成空格、压连续空白；profile-page / profile-info-page 都是单行
// truncate / line-clamp-1 展示。但 R1 走查实测 curl 直 PATCH
// `{"signature":"foo\nbar\n\n\tbaz"}` 服务端只 trim() 不剥换行，原样落库——
// 下游 desktop-message-avatar-popover / desktop-friend-moments-workspace 等
// 把 signature 渲染成原文（不带 truncate）的位置就会出现意外断行。同款 sanitize
// 兜底，挡住老客户端 / curl 直调，跟 username 一致。
function sanitizeOwnerSignature(value: string): string {
  return value.replace(CONTROL_CHAR_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

// 联系方式（微信号 / 手机号 / 社交账号）按单行存：剥控制字符、折叠空白。
// 上限给 100 字符——真实 handle 都很短，挡住有人把整段文本塞进去。
const MAX_OWNER_CONTACT_LENGTH = 100;
const OWNER_CONTACT_KINDS = new Set(['wechat', 'phone', 'other']);
function sanitizeOwnerContact(value: string): string {
  return value.replace(CONTROL_CHAR_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

// 个人资料字段（职业 / 所在地 / 兴趣 / 称呼语气 / 回避话题）：同款单行 sanitize
// （剥控制字符 + 折叠空白 + trim）。这些会被注入 AI prompt，控制字符 / 多余换行
// 既污染 prompt 结构也无意义。各设上限挡住塞整段文本。
function sanitizeProfileField(value: string): string {
  return value.replace(CONTROL_CHAR_REGEX, ' ').replace(/\s+/g, ' ').trim();
}
const OWNER_GENDERS = new Set(['male', 'female', 'other']);
const MIN_OWNER_AGE = 1;
const MAX_OWNER_AGE = 120;
const MAX_OWNER_OCCUPATION_LENGTH = 40;
const MAX_OWNER_REGION_LENGTH = 40;
const MAX_OWNER_INTERESTS_LENGTH = 200;
const MAX_OWNER_ADDRESS_TONE_LENGTH = 100;
const MAX_OWNER_AVOID_TOPICS_LENGTH = 200;

// 个人资料里的可空文本字段：统一「校类型 → sanitize → 校长度」。空串归一成 null
// （= 清空该字段）。返回 `undefined` 表示调用方没传这个字段、不动库里现值。
function normalizeProfileTextField(
  value: string | undefined,
  maxLength: number,
  errorCode: string,
  fieldLabel: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new AppError(errorCode, {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: `${fieldLabel}必须是字符串。`,
    });
  }
  const sanitized = sanitizeProfileField(value);
  if (sanitized.length > maxLength) {
    throw new AppError(errorCode, {
      status: HttpStatus.BAD_REQUEST,
      params: { maxLength },
      legacyMessage: `${fieldLabel}最多 ${maxLength} 个字符。`,
    });
  }
  return sanitized.length > 0 ? sanitized : null;
}

// 跟客户端 profile-info-avatar-page.tsx 的 MIN_AVATAR_DATA_URL_LENGTH 同步：
// 短于 32 字符的 data URL（如 "data:image/x;," / "data:image/png;base64," 等）
// 解码后没有像素内容，AvatarChip 加载会失败回 fallback——用户以为头像改好
// 了 profile 里却是 initials，毫无线索可查。R2 走查实测 curl PATCH
// `"data:image/x;,"` 服务端原样落库即印证。客户端 gate 同口径，但 curl /
// 老客户端能绕过，所以这里再兜一次。
const MIN_AVATAR_DATA_URL_LENGTH = 32;

// avatar 字段允许的协议：http / https / data:image/*。其它（javascript: /
// vbscript: / file: / ftp: / data:text/... 等）一律拒——即便 <img src> 不
// 执行 javascript:，落库的脏值会被其它复用 owner.avatar 的组件（社交分享、
// 第三方 webview、未来某个 <a href>）命中。
function isSafeAvatarValue(value: string): boolean {
  if (!value) return true; // 空 = 恢复默认，安全
  if (/^data:image\//i.test(value)) {
    // 短 / 空 data URL 落库后 <img> 加载失败回 fallback；客户端早就 gate，
    // 这里同口径兜底防绕过。
    return value.length >= MIN_AVATAR_DATA_URL_LENGTH;
  }
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!schemeMatch) {
    // 无 scheme：可能是相对路径（/avatars/...）。允许 / 开头的同源相对路径，
    // 拒绝裸 "abc" 这种垃圾输入。
    // 新会话2 R1：除了字面 `//`，`/\`、`\/`、`\\` 都被 WHATWG URL parser 归
    // 一成 `//` (即 scheme-relative 外链)，全部 reject。单个 `\` 开头会被归
    // 一成 `/`，仍是同源路径所以放过。
    if (/^[/\\][/\\]/.test(value)) return false;
    return value.startsWith('/');
  }
  const scheme = schemeMatch[1]!.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return false;
  // R2 走查实测 curl `"avatar":"http://"` 服务端 schemeMatch 通过原样落库——
  // 客户端 `new URL("http://")` 一定抛 → blocked，但服务端只 sniff 前缀没
  // 真正 parse。用 URL 构造器把 "http://" / "https:" 这种缺 host 的串挡掉，
  // 跟客户端 checkAvatarUrlInput 同口径。
  try {
    const parsed = new URL(value);
    if (!parsed.hostname) return false;
  } catch {
    return false;
  }
  return true;
}

type UpdateWorldOwnerInput = {
  username?: string;
  avatar?: string;
  signature?: string;
  onboardingCompleted?: boolean;
  contact?: string;
  contactKind?: string;
  encounterOptedIn?: boolean;
  // 个人资料：注入 AI prompt 的结构化信息。
  gender?: string | null;
  age?: number | null;
  occupation?: string;
  region?: string;
  interests?: string;
  aiAddressTone?: string;
  avoidTopics?: string;
};

type WorldOwnerProfile = {
  id: string;
  username: string;
  onboardingCompleted: boolean;
  avatar?: string;
  signature?: string;
  hasCustomApiKey: boolean;
  customApiBase?: string | null;
  defaultChatBackground?: ChatBackgroundAsset | null;
  createdAt: string;
  contact: string | null;
  contactKind: 'wechat' | 'phone' | 'other' | null;
  encounterOptedIn: boolean;
  gender: 'male' | 'female' | 'other' | null;
  age: number | null;
  occupation: string | null;
  region: string | null;
  interests: string | null;
  aiAddressTone: string | null;
  avoidTopics: string | null;
};

@Injectable()
export class WorldOwnerService implements OnModuleInit {
  private readonly logger = new Logger(WorldOwnerService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // 自愈：shared 模式 synchronize:false，新加的 UserEntity 列不会自动建。个人资料字段
  // （gender/age/occupation/... 由「个人资料注入 AI 对话」功能新增）若 live 库缺列，
  // TenantContextMiddleware 读 users 会 `no such column` 崩 → 所有租户上下文建立失败 =
  // 全员 500（实测：未补列时 :4200 每请求都 "no such column: UserEntity.gender"）。这里
  // 幂等补列（SQLite ADD COLUMN 无 IF NOT EXISTS，已存在抛错吞掉即可；仿 self-agent /
  // parking-war occupancy 的 onModuleInit 自愈）。LPP/wiki 走 synchronize:true 自动建，跳过。
  async onModuleInit(): Promise<void> {
    if (!isSharedWorldMode()) return;
    const profileColumns: Array<[string, string]> = [
      ['gender', 'text'],
      ['age', 'integer'],
      ['occupation', 'text'],
      ['region', 'text'],
      ['interests', 'text'],
      ['aiAddressTone', 'text'],
      ['avoidTopics', 'text'],
    ];
    for (const [name, type] of profileColumns) {
      try {
        await this.dataSource.query(
          `ALTER TABLE users ADD COLUMN ${name} ${type}`,
        );
      } catch {
        // 列已存在（幂等自愈），忽略。
      }
    }
  }

  // cron fan-out 助手：shared 模式下把回调在每个 world_owner 的租户帧里各跑一遍，
  // 逐 owner 独立 try/catch（一个 owner 失败不连累其余），SubscriptionExpiredException
  // 只 debug 不刷 error。语义与 TenantService.runForAllTenants 一致，但直接用
  // listTenantOwners + TenantContextStore（纯工具、无 DI），避免 cyber-avatar/games
  // 注入 TenantService 引入 CyberAvatar→TenantService→Social→CyberAvatar 这条 DI 环。
  // LPP / wiki：单 owner 独占库，直接跑一次（无帧，getOwnerOrThrow 走 legacy 分支）。
  async forEachOwner(
    fn: (ctx: { ownerId: string; phone: string }) => Promise<void>,
    label = 'tenant cron',
  ): Promise<void> {
    if (!isSharedWorldMode()) {
      await fn({ ownerId: '', phone: '' });
      return;
    }
    const owners = await this.listTenantOwners();
    for (const owner of owners) {
      const ctx = { ownerId: owner.id, phone: owner.cloudPhone ?? '' };
      try {
        await TenantContextStore.run(ctx, () => fn(ctx));
      } catch (error) {
        if (error instanceof SubscriptionExpiredException) {
          this.logger.debug(`${label} owner=${owner.id}: subscription expired, skipped`);
          continue;
        }
        this.logger.warn(
          `${label} failed owner=${owner.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async ensureSingleOwnerMigration(): Promise<UserEntity> {
    // 硬门禁：这个方法会把「多余的」world_owner 连同其数据全部删掉，是单进程单 owner
    // 时代的迁移逻辑。共享 world 库里有 N 个 owner，一旦在 shared 模式跑就会删掉除一人
    // 外所有租户的数据——绝对禁止。
    if (isSharedWorldMode()) {
      throw new AppError('SINGLE_OWNER_MIGRATION_FORBIDDEN_IN_SHARED_MODE', {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        legacyMessage: '共享 world 模式禁止单 owner 迁移。',
      });
    }
    const users = await this.userRepo.find({
      where: { userType: 'world_owner' },
      order: { createdAt: 'ASC' },
    });

    if (users.length === 0) {
      const owner = this.userRepo.create({
        username: '',
        passwordHash: this.generatePlaceholderPasswordHash(),
        onboardingCompleted: false,
        avatar: '',
        signature: '',
        customApiKey: null,
        customApiBase: null,
        defaultChatBackgroundPayload: null,
        userType: 'world_owner',
      });
      const saved = await this.userRepo.save(owner);
      // "我" 角色的欢迎消息由 social 模块的 InitialMessageService 在
      // ensureDefaultFriendships 时统一调度，这里不再单独发，避免出现两条对话条目。
      return saved;
    }

    const [owner, ...others] = users;
    if (others.length === 0) {
      return owner;
    }

    const removedOwnerIds = others.map((entry) => entry.id);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(FriendshipEntity).delete({ ownerId: In(removedOwnerIds) });
      await manager.getRepository(FriendRequestEntity).delete({ ownerId: In(removedOwnerIds) });
      await manager.getRepository(NarrativeArcEntity).delete({ ownerId: In(removedOwnerIds) });
      await manager.getRepository(VideoChannelFollowEntity).delete({ ownerId: In(removedOwnerIds) });
      await manager.getRepository(UserFeedInteractionEntity).delete({ ownerId: In(removedOwnerIds) });

      await manager
        .createQueryBuilder()
        .delete()
        .from(MomentLikeEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(MomentCommentEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(MomentPostEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(FeedCommentEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(FeedPostEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      const ownerConversations = await manager.getRepository(ConversationEntity).find({
        select: ['id'],
        where: { ownerId: owner.id },
      });
      const ownerConversationIds = ownerConversations.map((entry) => entry.id);

      await manager.getRepository(ConversationEntity).delete({ ownerId: In(removedOwnerIds) });

      await manager
        .createQueryBuilder()
        .delete()
        .from(MessageEntity)
        .where('senderType = :senderType AND senderId IN (:...ids)', {
          senderType: 'user',
          ids: removedOwnerIds,
        })
        .execute();

      if (ownerConversationIds.length > 0) {
        await manager
          .createQueryBuilder()
          .delete()
          .from(MessageEntity)
          .where('conversationId NOT IN (:...conversationIds)', {
            conversationIds: ownerConversationIds,
          })
          .execute();
      }

      const removedGroups = await manager.getRepository(GroupEntity).find({
        select: ['id'],
        where: {
          creatorType: 'user',
          creatorId: In(removedOwnerIds),
        },
      });
      const removedGroupIds = removedGroups.map((entry) => entry.id);

      if (removedGroupIds.length > 0) {
        await manager.getRepository(GroupMemberEntity).delete({ groupId: In(removedGroupIds) });
        await manager.getRepository(GroupMessageEntity).delete({ groupId: In(removedGroupIds) });
        await manager.getRepository(GroupEntity).delete({ id: In(removedGroupIds) });
      }

      await manager.getRepository(UserEntity).delete({ id: In(removedOwnerIds) });
    });

    return this.getOwnerOrThrow();
  }

  // 共享 world 多租户：按 phone 建档 + 查回 owner（create-on-first-touch）。
  // 并发首触靠 cloudPhone UNIQUE 约束兜底——抢插失败就回查已存在的那行。
  // 返回 created 标志，供调用方（TenantService）决定是否跑 owner 级首触种子。
  async ensureOwnerForPhone(
    phone: string,
  ): Promise<{ owner: UserEntity; created: boolean }> {
    const normalized = phone?.trim();
    if (!normalized) {
      throw new AppError('TENANT_PHONE_REQUIRED', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '缺少租户 phone。',
      });
    }

    const existing = await this.userRepo.findOne({
      where: { userType: 'world_owner', cloudPhone: normalized },
    });
    if (existing) {
      return { owner: existing, created: false };
    }

    try {
      const owner = this.userRepo.create({
        // users.username 有 unique 索引：LPP 单 owner 用 '' 永不撞；shared 多 owner 必须
        // 唯一占位（onboardingCompleted=false 驱动 onboarding，落地时 updateOwner 覆盖真名）。
        // ⚠️ Phase 8 schema：world_owner 的 username 全局唯一约束需放宽（多用户同名 / onboarding
        // 取同名会撞）——unique 应仅对 wiki_member 句柄生效或按 userType 作用域化。
        username: `__pending_${randomUUID()}`,
        passwordHash: this.generatePlaceholderPasswordHash(),
        onboardingCompleted: false,
        avatar: '',
        signature: '',
        customApiKey: null,
        customApiBase: null,
        defaultChatBackgroundPayload: null,
        userType: 'world_owner',
        cloudPhone: normalized,
      });
      const saved = await this.userRepo.save(owner);
      return { owner: saved, created: true };
    } catch (error) {
      // UNIQUE(cloudPhone) 冲突 = 另一并发请求已建档，回查那行。
      const raced = await this.userRepo.findOne({
        where: { userType: 'world_owner', cloudPhone: normalized },
      });
      if (raced) {
        return { owner: raced, created: false };
      }
      throw error;
    }
  }

  // 账号注销：把当前租户帧 owner 的身份键 cloudPhone 解绑成 tombstone（cloud-api 传入
  // `archived:<cloudUserId>`，仍满足 UNIQUE）。解绑后 ensureOwnerForPhone(原phone) 查不到
  // → 同号重新注册建全新 owner + 跑全新种子（不追回旧数据）；而本 owner 连同全部 world
  // 内数据原样保留，凭 tombstone（= 归档 cloud_worlds 行的 phone）仍可被后台 world-admin
  // 反代寻址浏览。cloud-api 注入 x-cloud-user-phone=原phone，本方法在该租户帧内执行。
  //
  // 幂等/重试安全：若已存在 cloudPhone=tombstone 的 owner（上一次已解绑成功），直接 no-op
  // 返回——避免重试时把「中间件按原phone新建的空 owner」也强行写成同一 tombstone 撞 UNIQUE。
  async archiveCurrentOwner(
    tombstone: string,
  ): Promise<{ ownerId: string; alreadyArchived: boolean }> {
    const normalized = tombstone?.trim();
    if (!normalized) {
      throw new AppError('OWNER_ARCHIVE_TOMBSTONE_REQUIRED', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '缺少注销 tombstone。',
      });
    }

    const already = await this.userRepo.findOne({
      where: { cloudPhone: normalized },
    });
    if (already) {
      return { ownerId: already.id, alreadyArchived: true };
    }

    const owner = await this.getOwnerOrThrow();
    owner.cloudPhone = normalized;
    await this.userRepo.save(owner);
    return { ownerId: owner.id, alreadyArchived: false };
  }

  // 「世界居民」全局哨兵 owner 建档（固定 id，幂等）。getOwnerOrThrow 依赖此行存在；
  // 全局广场内容（feed surface='feed' 的 preset 角色帖 + AI 互动）都归属它。
  // 不能复用 ensureOwnerForPhone —— 那个生成随机 id，这里需要固定 GLOBAL_WORLD_OWNER_ID。
  async ensureGlobalOwnerRow(): Promise<UserEntity> {
    const existing = await this.userRepo.findOne({
      where: { id: GLOBAL_WORLD_OWNER_ID },
    });
    if (existing) {
      return existing;
    }
    try {
      const owner = this.userRepo.create({
        id: GLOBAL_WORLD_OWNER_ID,
        username: '__global_world_owner__',
        passwordHash: this.generatePlaceholderPasswordHash(),
        // onboarding 完成态：哨兵 owner 不走引导流程。
        onboardingCompleted: true,
        avatar: '',
        signature: '',
        customApiKey: null,
        customApiBase: null,
        defaultChatBackgroundPayload: null,
        userType: 'world_owner',
        cloudPhone: GLOBAL_WORLD_OWNER_PHONE,
      });
      return await this.userRepo.save(owner);
    } catch (error) {
      // 并发首触 / 重启：UNIQUE(id|username|cloudPhone) 冲突 = 已建档，回查。
      const raced = await this.userRepo.findOne({
        where: { id: GLOBAL_WORLD_OWNER_ID },
      });
      if (raced) {
        return raced;
      }
      throw error;
    }
  }

  // cron fan-out 用：列出共享库里所有 world_owner 租户（带 phone）。
  // 排除「世界居民」全局哨兵 owner —— 它不是真实用户，全局广场内容由专门的全局帧
  // (runForOwner(GLOBAL_WORLD_OWNER_ID)) 驱动，绝不能被 per-owner fan-out 当普通用户跑。
  // 这是单一收口点，同时挡住 TenantService.runForAllTenants 和 WorldOwnerService.forEachOwner。
  async listTenantOwners(): Promise<UserEntity[]> {
    return this.userRepo.find({
      where: { userType: 'world_owner', id: Not(GLOBAL_WORLD_OWNER_ID) },
      order: { createdAt: 'ASC' },
    });
  }

  async getOwnerOrThrow(): Promise<UserEntity> {
    // shared 模式：owner 完全由请求级 TenantContext 决定。绝不回退到「第一个
    // world_owner 行」——那会把别人的数据当成当前用户返回（最严重的串号面）。
    const ctx = TenantContextStore.get();
    if (ctx) {
      const owner = await this.userRepo.findOne({ where: { id: ctx.ownerId } });
      if (!owner) {
        throw new AppError('TENANT_OWNER_NOT_FOUND', {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          legacyMessage: '租户 owner 不存在。',
        });
      }
      return owner;
    }
    if (isSharedWorldMode()) {
      // shared 进程里没有上下文还来查 owner = 漏接的后台路径，fail-closed。
      throw new AppError('TENANT_CONTEXT_MISSING', {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        legacyMessage: '缺少租户上下文。',
      });
    }

    // LPP / wiki 进程：单 owner 旧路径，行为完全不变。
    const owner = await this.userRepo.findOne({
      where: { userType: 'world_owner' },
      order: { createdAt: 'ASC' },
    });

    if (!owner) {
      return this.ensureSingleOwnerMigration();
    }

    return owner;
  }

  async getOwnerProfile(): Promise<WorldOwnerProfile> {
    const owner = await this.getOwnerOrThrow();
    return this.serializeOwner(owner);
  }

  // 把当前 owner 的「个人资料」映射成注入聊天 prompt 的 UserProfileContext。
  // 单聊/群聊/主动消息各路径共用，避免重复映射逻辑。联系方式故意不带（分身相遇专用）。
  // 占位用户名（__pending_xxx / 全局哨兵 __xxx）不当真名注入。
  buildUserProfileContext(owner: UserEntity): UserProfileContext {
    return {
      displayName: owner.username?.startsWith('__') ? null : owner.username,
      gender: owner.gender as 'male' | 'female' | 'other' | null,
      age: owner.age,
      occupation: owner.occupation,
      region: owner.region,
      interests: owner.interests,
      aiAddressTone: owner.aiAddressTone,
      avoidTopics: owner.avoidTopics,
    };
  }

  // 没有现成 owner 实体的调用方（群聊编排 / 调度器主动消息）用这个——按当前租户帧取
  // owner 再映射。失败返回 undefined，调用方据此跳过注入而不是让整轮回复崩。
  async getUserProfileContext(): Promise<UserProfileContext | undefined> {
    try {
      const owner = await this.getOwnerOrThrow();
      return this.buildUserProfileContext(owner);
    } catch {
      return undefined;
    }
  }

  // 被动推断回填（Phase 4）：把赛博分身从行为里推断出来的资料，**只填到当前为空的字段**，
  // 用户手填过的字段（非空）绝不覆盖（默认静默推断，但「用户显式声明」永远优先）。
  // 故意走独立路径而非 updateOwner——updateOwner 会触发 owner_profile_update 信号捕获，
  // 而本方法由赛博分身深度刷新尾部调用，若再发信号会形成「推断→信号→再推断」反馈环。
  // 返回被填充的字段名列表（供日志/可观测）。
  async fillInferredProfileFields(inferred: {
    occupation?: string | null;
    region?: string | null;
    interests?: string | null;
    aiAddressTone?: string | null;
  }): Promise<{ filled: string[] }> {
    const owner = await this.getOwnerOrThrow();
    const filled: string[] = [];
    const fillIfEmpty = (
      field: 'occupation' | 'region' | 'interests' | 'aiAddressTone',
      value: string | null | undefined,
      maxLength: number,
    ) => {
      const current = owner[field];
      if (typeof current === 'string' && current.trim()) {
        return; // 用户手填过，永不覆盖
      }
      if (typeof value !== 'string') return;
      const sanitized = sanitizeProfileField(value);
      if (!sanitized) return;
      owner[field] = sanitized.slice(0, maxLength);
      filled.push(field);
    };

    fillIfEmpty('occupation', inferred.occupation, MAX_OWNER_OCCUPATION_LENGTH);
    fillIfEmpty('region', inferred.region, MAX_OWNER_REGION_LENGTH);
    fillIfEmpty('interests', inferred.interests, MAX_OWNER_INTERESTS_LENGTH);
    fillIfEmpty(
      'aiAddressTone',
      inferred.aiAddressTone,
      MAX_OWNER_ADDRESS_TONE_LENGTH,
    );

    if (filled.length > 0) {
      await this.userRepo.save(owner);
    }
    return { filled };
  }

  async updateOwner(input: UpdateWorldOwnerInput): Promise<WorldOwnerProfile> {
    const owner = await this.getOwnerOrThrow();
    // 类型守卫：controller 拿 `@Body() body: {...}` 是 TypeScript 编译期类型，
    // 运行时不做校验。curl/老客户端/恶意请求发 `{"username":123}` 这种非字符串
    // 直接走到下面 sanitizeOwnerName/Signature 的 `.replace(...)` 会 throw
    // `value.replace is not a function` → 全局过滤器吐 500 + 内部错误堆栈，
    // 信息泄漏（R3 走查实测）。这里提前判类型，统一抛清楚的 400。
    if (input.username !== undefined && typeof input.username !== 'string') {
      throw new AppError('WORLD_OWNER_NAME_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '世界主人昵称必须是字符串。',
      });
    }
    if (input.avatar !== undefined && typeof input.avatar !== 'string') {
      throw new AppError('WORLD_OWNER_AVATAR_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '头像必须是字符串（URL 或 data:image/ 数据）。',
      });
    }
    if (input.signature !== undefined && typeof input.signature !== 'string') {
      throw new AppError('WORLD_OWNER_SIGNATURE_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '个性签名必须是字符串。',
      });
    }
    if (input.contact !== undefined && typeof input.contact !== 'string') {
      throw new AppError('WORLD_OWNER_SIGNATURE_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '联系方式必须是字符串。',
      });
    }
    // username: 先 sanitize（剥控制字符 + 折叠空白）再校长度，跟前端
    // profile-info-name-page 同款；这样 curl 直调 / 老客户端 PATCH
    // "foo\nbar" 时落库的也是 "foo bar"，不会污染 chat sender 渲染。
    const nextUsername =
      input.username === undefined
        ? undefined
        : sanitizeOwnerName(input.username);
    const nextAvatar = input.avatar?.trim();
    const nextSignature =
      input.signature === undefined
        ? undefined
        : sanitizeOwnerSignature(input.signature);
    const nextContact =
      input.contact === undefined
        ? undefined
        : sanitizeOwnerContact(input.contact);

    // 历史上前端只校验 trim() 非空，导致大量用户用单字 "w" 过 onboarding。
    // 后端在这里兜底：写入 username 时必须 ≥ 2 个字符，过短直接拒绝。
    if (nextUsername !== undefined && nextUsername.length < MIN_OWNER_NAME_LENGTH) {
      throw new AppError('WORLD_OWNER_NAME_TOO_SHORT', {
        status: HttpStatus.BAD_REQUEST,
        params: { minLength: MIN_OWNER_NAME_LENGTH },
        legacyMessage: `世界主人昵称至少 ${MIN_OWNER_NAME_LENGTH} 个字。`,
      });
    }
    if (nextUsername !== undefined && nextUsername.length > MAX_OWNER_NAME_LENGTH) {
      throw new AppError('WORLD_OWNER_NAME_TOO_LONG', {
        status: HttpStatus.BAD_REQUEST,
        params: { maxLength: MAX_OWNER_NAME_LENGTH },
        legacyMessage: `世界主人昵称最多 ${MAX_OWNER_NAME_LENGTH} 个字符。`,
      });
    }
    if (
      nextSignature !== undefined &&
      nextSignature.length > MAX_OWNER_SIGNATURE_LENGTH
    ) {
      throw new AppError('WORLD_OWNER_SIGNATURE_TOO_LONG', {
        status: HttpStatus.BAD_REQUEST,
        params: { maxLength: MAX_OWNER_SIGNATURE_LENGTH },
        legacyMessage: `个性签名最多 ${MAX_OWNER_SIGNATURE_LENGTH} 个字符。`,
      });
    }
    if (
      nextAvatar !== undefined &&
      nextAvatar.length > MAX_OWNER_AVATAR_LENGTH
    ) {
      throw new AppError('WORLD_OWNER_AVATAR_TOO_LARGE', {
        status: HttpStatus.BAD_REQUEST,
        params: { maxBytes: MAX_OWNER_AVATAR_LENGTH },
        legacyMessage: '头像图片超过 2MB 上限，请压缩后再试。',
      });
    }
    if (nextAvatar !== undefined && !isSafeAvatarValue(nextAvatar)) {
      throw new AppError('WORLD_OWNER_AVATAR_UNSAFE_URL', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage:
          '头像链接必须是 http/https 图片地址，或 data:image/ 开头的图片数据。',
      });
    }
    if (
      nextContact !== undefined &&
      nextContact.length > MAX_OWNER_CONTACT_LENGTH
    ) {
      throw new AppError('WORLD_OWNER_SIGNATURE_TOO_LONG', {
        status: HttpStatus.BAD_REQUEST,
        params: { maxLength: MAX_OWNER_CONTACT_LENGTH },
        legacyMessage: `联系方式最多 ${MAX_OWNER_CONTACT_LENGTH} 个字符。`,
      });
    }
    if (
      input.contactKind !== undefined &&
      !OWNER_CONTACT_KINDS.has(input.contactKind)
    ) {
      throw new AppError('WORLD_OWNER_SIGNATURE_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '联系方式类型不合法。',
      });
    }

    owner.username = nextUsername ?? owner.username;
    owner.avatar = nextAvatar ?? owner.avatar ?? '';
    owner.signature = nextSignature ?? owner.signature ?? '';
    if (typeof input.onboardingCompleted === 'boolean') {
      owner.onboardingCompleted = input.onboardingCompleted;
    }
    if (nextContact !== undefined) {
      // 空串 = 清空联系方式（退出可被披露），落 null。
      owner.encounterContactField = nextContact.length > 0 ? nextContact : null;
    }
    if (input.contactKind !== undefined) {
      owner.encounterContactKind = input.contactKind;
    }
    if (typeof input.encounterOptedIn === 'boolean') {
      owner.encounterOptedIn = input.encounterOptedIn;
    }

    // 个人资料字段（会注入 AI prompt）。统一规则：undefined=不动现值，
    // 空串/null=清空(落 null)，否则 sanitize + 校长度/枚举/范围后落库。
    if (input.gender !== undefined) {
      const raw =
        typeof input.gender === 'string' ? input.gender.trim() : input.gender;
      if (raw === null || raw === '') {
        owner.gender = null;
      } else if (typeof raw === 'string' && OWNER_GENDERS.has(raw)) {
        owner.gender = raw;
      } else {
        throw new AppError('WORLD_OWNER_GENDER_INVALID', {
          status: HttpStatus.BAD_REQUEST,
          legacyMessage: '性别取值不合法。',
        });
      }
    }
    if (input.age !== undefined) {
      if (input.age === null) {
        owner.age = null;
      } else if (
        typeof input.age === 'number' &&
        Number.isInteger(input.age) &&
        input.age >= MIN_OWNER_AGE &&
        input.age <= MAX_OWNER_AGE
      ) {
        owner.age = input.age;
      } else {
        throw new AppError('WORLD_OWNER_AGE_INVALID', {
          status: HttpStatus.BAD_REQUEST,
          params: { minAge: MIN_OWNER_AGE, maxAge: MAX_OWNER_AGE },
          legacyMessage: `年龄需是 ${MIN_OWNER_AGE}-${MAX_OWNER_AGE} 之间的整数。`,
        });
      }
    }
    const nextOccupation = normalizeProfileTextField(
      input.occupation,
      MAX_OWNER_OCCUPATION_LENGTH,
      'WORLD_OWNER_OCCUPATION_TOO_LONG',
      '职业',
    );
    if (nextOccupation !== undefined) owner.occupation = nextOccupation;
    const nextRegion = normalizeProfileTextField(
      input.region,
      MAX_OWNER_REGION_LENGTH,
      'WORLD_OWNER_REGION_TOO_LONG',
      '所在地',
    );
    if (nextRegion !== undefined) owner.region = nextRegion;
    const nextInterests = normalizeProfileTextField(
      input.interests,
      MAX_OWNER_INTERESTS_LENGTH,
      'WORLD_OWNER_INTERESTS_TOO_LONG',
      '兴趣爱好',
    );
    if (nextInterests !== undefined) owner.interests = nextInterests;
    const nextAddressTone = normalizeProfileTextField(
      input.aiAddressTone,
      MAX_OWNER_ADDRESS_TONE_LENGTH,
      'WORLD_OWNER_ADDRESS_TONE_TOO_LONG',
      '称呼/语气偏好',
    );
    if (nextAddressTone !== undefined) owner.aiAddressTone = nextAddressTone;
    const nextAvoidTopics = normalizeProfileTextField(
      input.avoidTopics,
      MAX_OWNER_AVOID_TOPICS_LENGTH,
      'WORLD_OWNER_AVOID_TOPICS_TOO_LONG',
      '回避话题',
    );
    if (nextAvoidTopics !== undefined) owner.avoidTopics = nextAvoidTopics;

    await this.userRepo.save(owner);
    return this.serializeOwner(owner);
  }

  async setOwnerApiKey(
    apiKey: string,
    apiBase?: string,
  ): Promise<WorldOwnerProfile> {
    const owner = await this.getOwnerOrThrow();
    owner.customApiKey = encryptUserApiKey(apiKey.trim());
    owner.customApiBase = apiBase?.trim() ? apiBase.trim() : null;
    await this.userRepo.save(owner);
    return this.serializeOwner(owner);
  }

  async setDefaultChatBackground(
    background: ChatBackgroundAsset,
  ): Promise<WorldOwnerProfile> {
    const owner = await this.getOwnerOrThrow();
    owner.defaultChatBackgroundPayload = JSON.stringify(
      normalizeChatBackgroundAsset(background),
    );
    await this.userRepo.save(owner);
    return this.serializeOwner(owner);
  }

  async clearDefaultChatBackground(): Promise<WorldOwnerProfile> {
    const owner = await this.getOwnerOrThrow();
    owner.defaultChatBackgroundPayload = null;
    await this.userRepo.save(owner);
    return this.serializeOwner(owner);
  }

  async getDefaultChatBackground(): Promise<ChatBackgroundAsset | null> {
    const owner = await this.getOwnerOrThrow();
    return parseChatBackgroundAsset(owner.defaultChatBackgroundPayload);
  }

  async clearOwnerApiKey(): Promise<WorldOwnerProfile> {
    const owner = await this.getOwnerOrThrow();
    owner.customApiKey = null;
    owner.customApiBase = null;
    await this.userRepo.save(owner);
    return this.serializeOwner(owner);
  }

  async getOwnerAiConfig(): Promise<AiKeyOverride | null> {
    const owner = await this.getOwnerOrThrow();
    const decryptedApiKey = decryptUserApiKey(owner.customApiKey);
    if (!decryptedApiKey?.trim()) {
      return null;
    }

    return {
      apiKey: decryptedApiKey,
      apiBase: owner.customApiBase ?? undefined,
    };
  }

  private serializeOwner(owner: UserEntity): WorldOwnerProfile {
    return {
      id: owner.id,
      username: owner.username,
      onboardingCompleted: owner.onboardingCompleted,
      avatar: owner.avatar ?? '',
      signature: owner.signature ?? '',
      hasCustomApiKey: Boolean(owner.customApiKey),
      customApiBase: owner.customApiBase ?? null,
      defaultChatBackground:
        parseChatBackgroundAsset(owner.defaultChatBackgroundPayload) ?? null,
      createdAt: owner.createdAt.toISOString(),
      contact: owner.encounterContactField ?? null,
      contactKind:
        (owner.encounterContactKind as 'wechat' | 'phone' | 'other' | null) ??
        null,
      // 列默认 true；存量行经 ADD COLUMN DEFAULT 1 回填，但防御性地把 null/undefined 视为开启。
      encounterOptedIn: owner.encounterOptedIn !== false,
      gender:
        (owner.gender as 'male' | 'female' | 'other' | null) ?? null,
      age: owner.age ?? null,
      occupation: owner.occupation ?? null,
      region: owner.region ?? null,
      interests: owner.interests ?? null,
      aiAddressTone: owner.aiAddressTone ?? null,
      avoidTopics: owner.avoidTopics ?? null,
    };
  }

  private generatePlaceholderPasswordHash(): string {
    return `world_owner_${Date.now()}`;
  }
}
