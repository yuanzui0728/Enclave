import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AppError } from '../../common/app-error.exception';
import { isSharedWorldMode, TenantContextStore } from '../tenancy/tenant-context';
import { UserEntity } from './user.entity';
import { decryptUserApiKey, encryptUserApiKey } from './api-key-crypto';
import type { AiKeyOverride } from '../ai/ai.types';
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
};

@Injectable()
export class WorldOwnerService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

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

  // cron fan-out 用：列出共享库里所有 world_owner 租户（带 phone）。
  async listTenantOwners(): Promise<UserEntity[]> {
    return this.userRepo.find({
      where: { userType: 'world_owner' },
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
    };
  }

  private generatePlaceholderPasswordHash(): string {
    return `world_owner_${Date.now()}`;
  }
}
