// i18n-ignore-start: 平台后台运维接口 / 内部数据聚合 —— 非终端用户 UI。
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityTarget, type ObjectLiteral } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { MessageEntity } from '../chat/message.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { VideoChannelFollowEntity } from '../feed/video-channel-follow.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';

// 与 @yinjie/contracts 的 CloudWorldActivitySummaryItem 同形（api 进程不解析 contracts 包，
// 本地复刻类型，契约真相在 packages/contracts/src/cloud.ts）。
export interface CloudWorldActivitySummaryItem {
  phone: string;
  lastUserMessageAt?: string | null;
  lastUserBehaviorAt?: string | null;
  lastInteractiveAt?: string | null;
}

// 多租户共享 world（单进程服务全部 owner）下的跨租户活动聚合。
//
// 背景：cutover 后旧的 per-world push 心跳（cloud-runtime-reporting）只对单个 CLOUD_WORLD_ID
// 上报一次「全库最新」时间戳，导致 cloud-api cloud_worlds 表里除该单一世界外，其余 ~106 个
// 世界的活动时间列永久冻结（停在 cutover 时刻）。本服务让 cloud-api 改为按需 PULL：一次性
// 返回「每个 owner 最近一次各类活动时间」，cloud-api join 后 overlay 到列表，活动列回归真实。
//
// 关键：这是**平台级跨租户**读取——绝不能被 TenantRepository 的 WHERE ownerId 约束或
// afterLoad 读守卫切到单个 owner。实现上一律用 dataSource.getRepository(...)（基础 repo，
// 永不被租户包装）+ getRawMany（只取聚合行、不 hydrate 实体 → 不触发 afterLoad 守卫），
// 故无论调用方有没有建租户帧（cloud-api 经 platform owner phone 过中间件会建帧），聚合都跨全部 owner。
@Injectable()
export class RuntimeActivityAdminService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getActivitySummary(): Promise<CloudWorldActivitySummaryItem[]> {
    // 各源表「按 owner 取 MAX(时间)」。聊天/朋友圈/广场评论限 user/真人，互动·关注·会话天然真人/混合。
    const [
      userMsg,
      groupMsg,
      momentComment,
      momentLike,
      feedComment,
      feedInteraction,
      videoFollow,
      conversation,
      group,
    ] = await Promise.all([
      this.maxByOwner(MessageEntity, 'createdAt', 'senderType'),
      this.maxByOwner(GroupMessageEntity, 'createdAt', 'senderType'),
      this.maxByOwner(MomentCommentEntity, 'createdAt', 'authorType'),
      this.maxByOwner(MomentLikeEntity, 'createdAt', 'authorType'),
      this.maxByOwner(FeedCommentEntity, 'createdAt', 'authorType'),
      // user_feed_interactions / video_channel_follows 的行天然都是真人发起（owner 即真人，
      // character 不写这两张表），与 cloud-runtime-reporting 语义一致，不加 authorType 过滤。
      this.maxByOwner(UserFeedInteractionEntity, 'createdAt'),
      this.maxByOwner(VideoChannelFollowEntity, 'createdAt'),
      this.maxByOwner(ConversationEntity, 'lastActivityAt'),
      this.maxByOwner(GroupEntity, 'lastActivityAt'),
    ]);

    const lastUserMessage = mergeMax(userMsg, groupMsg);
    const lastUserBehavior = mergeMax(
      momentComment,
      momentLike,
      feedComment,
      feedInteraction,
      videoFollow,
    );
    const lastInteractive = mergeMax(conversation, group);

    const phoneByOwner = await this.loadPhoneByOwner();

    const items: CloudWorldActivitySummaryItem[] = [];
    for (const [ownerId, phone] of phoneByOwner) {
      const msg = lastUserMessage.get(ownerId) ?? null;
      const behavior = lastUserBehavior.get(ownerId) ?? null;
      const interactive = lastInteractive.get(ownerId) ?? null;
      // 全空的 owner 不返回（cloud-api 端缺省退回 stored 列），减小载荷。
      if (!msg && !behavior && !interactive) {
        continue;
      }
      items.push({
        phone,
        lastUserMessageAt: msg,
        lastUserBehaviorAt: behavior,
        lastInteractiveAt: interactive,
      });
    }
    return items;
  }

  // 单表「按 owner 取 MAX(dateProp) 的 ISO」。userColumn 给定时限该列 = 'user'（聊天/评论只算真人）。
  private async maxByOwner<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    dateProp: string,
    userColumn?: string,
  ): Promise<Map<string, string>> {
    const repo = this.dataSource.getRepository(entity);
    const qb = repo
      .createQueryBuilder('t')
      .select('t.ownerId', 'ownerId')
      .addSelect(`MAX(t.${dateProp})`, 'ts')
      .where('t.ownerId IS NOT NULL');
    if (userColumn) {
      qb.andWhere(`t.${userColumn} = :userKind`, { userKind: 'user' });
    }
    qb.groupBy('t.ownerId');
    const rows = await qb.getRawMany<{ ownerId: string; ts: string | null }>();
    const map = new Map<string, string>();
    for (const row of rows) {
      const iso = toIso(row.ts);
      if (row.ownerId && iso) {
        map.set(row.ownerId, iso);
      }
    }
    return map;
  }

  // ownerId(=users.id) → cloudPhone。只取有 cloudPhone 的 world_owner（与 cloud_worlds.phone 对齐）。
  private async loadPhoneByOwner(): Promise<Map<string, string>> {
    const rows = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.cloudPhone', 'cloudPhone')
      .where('u.cloudPhone IS NOT NULL')
      .getRawMany<{ id: string; cloudPhone: string | null }>();
    const map = new Map<string, string>();
    for (const row of rows) {
      const phone = row.cloudPhone?.trim();
      if (row.id && phone) {
        map.set(row.id, phone);
      }
    }
    return map;
  }
}

// sqlite datetime 列以 UTC 存为 'YYYY-MM-DD HH:MM:SS[.sss]'（无时区后缀）。getRawMany 绕过
// TypeORM 的 Date transformer，故在此显式按 UTC 归一成 ISO（带 Z），保证 cloud-api 端
// new Date() 与 Date.now() 的比较在同一时间基准上。
function toIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  }
  const withT = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const withMs = /\.\d+$/.test(withT) ? withT : `${withT}.000`;
  return `${withMs}Z`;
}

// 多个 Map<owner, ISO> 合并：每个 owner 取最大（同格式 ISO 字符串字典序即时间序）。
function mergeMax(...maps: Map<string, string>[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const map of maps) {
    for (const [owner, iso] of map) {
      const prev = out.get(owner);
      if (!prev || iso > prev) {
        out.set(owner, iso);
      }
    }
  }
  return out;
}
// i18n-ignore-end
