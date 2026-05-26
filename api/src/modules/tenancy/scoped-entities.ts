import { registerTenantScopedEntity } from './tenant-scoped.decorator';

// 集中注册「租户级」实体（按 ownerId 隔离），避免改每个实体文件。这里先登记**已经带
// ownerId 列**的存量实体——它们的 service 查询本就 where:{ownerId} 过滤，shared 模式
// 下 owner 由 ALS 决定即自动隔离正确；注册后再叠加写入侧 subscriber 盖章/校验。
//
// 本轮新加 ownerId 的表（characters / feed / moments / messages / groups / favorites /
// ai_relationship / world_context …）等列落库后再在此登记。
import { ActionRunEntity } from '../action-runtime/action-run.entity';
import { AdminConversationReviewEntity } from '../admin/admin-conversation-review.entity';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { ChatCustomStickerEntity } from '../chat/custom-sticker.entity';
import { CyberAvatarProfileEntity } from '../cyber-avatar/cyber-avatar-profile.entity';
import { CyberAvatarRealWorldBriefEntity } from '../cyber-avatar/cyber-avatar-real-world-brief.entity';
import { CyberAvatarRealWorldItemEntity } from '../cyber-avatar/cyber-avatar-real-world-item.entity';
import { CyberAvatarRunEntity } from '../cyber-avatar/cyber-avatar-run.entity';
import { CyberAvatarSignalEntity } from '../cyber-avatar/cyber-avatar-signal.entity';
import { VideoChannelFollowEntity } from '../feed/video-channel-follow.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { FeedPostLikeEntity } from '../feed/feed-post-like.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { MomentEntity } from '../moments/moment.entity';
import { MessageEntity } from '../chat/message.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { GroupReplyTaskEntity } from '../chat/group-reply-task.entity';
import { ReplyArtifactJobEntity } from '../chat/reply-artifact-job.entity';
import { MediaInsightJobEntity } from '../chat/media-insight-job.entity';
import { FavoriteEntity } from '../chat/favorite.entity';
import { FavoriteNoteEntity } from '../chat/favorite-note.entity';
import { WorldContextEntity } from '../world/world-context.entity';
import { FarmCheckinEntity } from '../games/farm/entities/farm-checkin.entity';
import { FarmEventLogEntity } from '../games/farm/entities/farm-event-log.entity';
import { FarmNpcStateEntity } from '../games/farm/entities/farm-npc-state.entity';
import { FarmPlayerStateEntity } from '../games/farm/entities/farm-player-state.entity';
import { FarmQuestProgressEntity } from '../games/farm/entities/farm-quest-progress.entity';
import { GameOwnerStateEntity } from '../games/game-owner-state.entity';
import { ParkingWarEventLogEntity } from '../games/parking-war/entities/parking-war-event-log.entity';
import { ParkingWarNpcStateEntity } from '../games/parking-war/entities/parking-war-npc-state.entity';
import { ParkingWarPlayerStateEntity } from '../games/parking-war/entities/parking-war-player-state.entity';
import { ModerationReportEntity } from '../moderation/moderation-report.entity';
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { OfficialAccountDeliveryEntity } from '../official-accounts/official-account-delivery.entity';
import { OfficialAccountFollowEntity } from '../official-accounts/official-account-follow.entity';
import { OfficialAccountServiceMessageEntity } from '../official-accounts/official-account-service-message.entity';
import { ReminderTaskEntity } from '../reminder-runtime/reminder-task.entity';
import { SelfAgentRunEntity } from '../self-agent/self-agent-run.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { FriendshipEntity } from '../social/friendship.entity';

// 已带 ownerId 的存量实体（30 个）。
const ALREADY_SCOPED_ENTITIES: Function[] = [
  ActionRunEntity,
  AdminConversationReviewEntity,
  AiUsageLedgerEntity,
  UserFeedInteractionEntity,
  ConversationEntity,
  ChatCustomStickerEntity,
  CyberAvatarProfileEntity,
  CyberAvatarRealWorldBriefEntity,
  CyberAvatarRealWorldItemEntity,
  CyberAvatarRunEntity,
  CyberAvatarSignalEntity,
  VideoChannelFollowEntity,
  FarmCheckinEntity,
  FarmEventLogEntity,
  FarmNpcStateEntity,
  FarmPlayerStateEntity,
  FarmQuestProgressEntity,
  GameOwnerStateEntity,
  ParkingWarEventLogEntity,
  ParkingWarNpcStateEntity,
  ParkingWarPlayerStateEntity,
  ModerationReportEntity,
  NarrativeArcEntity,
  OfficialAccountDeliveryEntity,
  OfficialAccountFollowEntity,
  OfficialAccountServiceMessageEntity,
  ReminderTaskEntity,
  SelfAgentRunEntity,
  FriendRequestEntity,
  FriendshipEntity,
];

// 本轮新加 ownerId 列、已登记的表。读查询改写按域逐步推进（写入侧 subscriber 即覆盖）；
// 复合主键/唯一索引按 ownerId 重做随迁移期（Phase 8）落，不在实体层改。
const NEWLY_SCOPED_ENTITIES: Function[] = [
  // feed + moments（AI 内容主面）
  FeedPostEntity,
  FeedCommentEntity,
  FeedPostLikeEntity,
  MomentPostEntity,
  MomentCommentEntity,
  MomentLikeEntity,
  MomentEntity,
  // chat（会话子表 message 经 conversationId、群及其成员/消息、回复/媒体后台任务、收藏）
  MessageEntity,
  GroupEntity,
  GroupMemberEntity,
  GroupMessageEntity,
  GroupReplyTaskEntity,
  ReplyArtifactJobEntity,
  MediaInsightJobEntity,
  FavoriteEntity,
  FavoriteNoteEntity,
  // world（每用户世界时间/天气快照）
  WorldContextEntity,
  // ⚠️ 暂不登记（随 characters 一起到 Phase 8）：
  //   - characters：复合主键 (ownerId,id) + fixed-id 冲突
  //   - AIRelationshipEntity / CharacterFriendshipEntity：角色-角色关系，由全局 boot
  //     种子 ensureAiRelationshipSeed 创建（无租户上下文），且引用的 characters 当前仍是
  //     全局行；过早登记会让 boot 种子撞写守卫 TENANT_WRITE_WITHOUT_CONTEXT。等 characters
  //     转 per-owner、关系种子移到首触后再登记。ownerId 列已加（additive，无害）。
];

let registered = false;

export function registerAllScopedEntities(): void {
  if (registered) return;
  for (const entity of [...ALREADY_SCOPED_ENTITIES, ...NEWLY_SCOPED_ENTITIES]) {
    registerTenantScopedEntity(entity);
  }
  registered = true;
}
