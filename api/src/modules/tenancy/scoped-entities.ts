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

let registered = false;

export function registerAllScopedEntities(): void {
  if (registered) return;
  for (const entity of ALREADY_SCOPED_ENTITIES) {
    registerTenantScopedEntity(entity);
  }
  registered = true;
}
