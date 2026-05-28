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
import { SkillRunEntity } from '../character-skill/skill-run.entity';
import { SkillArtifactJobEntity } from '../character-skill/skill-artifact-job.entity';
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
import { ParkingWarOccupancyEntity } from '../games/parking-war/entities/parking-war-occupancy.entity';
import { ParkingWarPlayerStateEntity } from '../games/parking-war/entities/parking-war-player-state.entity';
import { ModerationReportEntity } from '../moderation/moderation-report.entity';
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { OfficialAccountDeliveryEntity } from '../official-accounts/official-account-delivery.entity';
import { OfficialAccountFollowEntity } from '../official-accounts/official-account-follow.entity';
import { OfficialAccountServiceMessageEntity } from '../official-accounts/official-account-service-message.entity';
import { ReminderTaskEntity } from '../reminder-runtime/reminder-task.entity';
import { SelfAgentRunEntity } from '../self-agent/self-agent-run.entity';
import { SelfAgentHeartbeatRunEntity } from '../self-agent/self-agent-heartbeat-run.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { CharacterEntity } from '../characters/character.entity';
import { CharacterUnlockEntity } from '../characters/character-unlock.entity';
import { VoiceCloneEntity } from '../ai/voice-clone.entity';
import { AIRelationshipEntity } from '../social/ai-relationship.entity';
import { CharacterFriendshipEntity } from '../social/character-friendship.entity';
import { CharacterBlueprintEntity } from '../characters/character-blueprint.entity';
import { CharacterBlueprintRevisionEntity } from '../characters/character-blueprint-revision.entity';
import { AIBehaviorLogEntity } from '../analytics/ai-behavior-log.entity';
import { NeedDiscoveryCandidateEntity } from '../need-discovery/need-discovery-candidate.entity';
import { NeedDiscoveryRunEntity } from '../need-discovery/need-discovery-run.entity';
import { FollowupRunEntity } from '../followup-runtime/followup-run.entity';
import { FollowupOpenLoopEntity } from '../followup-runtime/followup-open-loop.entity';
import { FollowupRecommendationEntity } from '../followup-runtime/followup-recommendation.entity';
import { CharacterRealWorldDigestEntity } from '../real-world-sync/character-real-world-digest.entity';
import { CharacterRealWorldSignalEntity } from '../real-world-sync/character-real-world-signal.entity';
import { CharacterRealWorldSyncRunEntity } from '../real-world-sync/character-real-world-sync-run.entity';

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
  // 角色技能产出（PPT/Word/Excel）的跨回合状态 + 异步渲染 job。
  // 均带 ownerId；job 仿 ReplyArtifactJob 全局轮询后逐 owner 帧执行。
  SkillRunEntity,
  SkillArtifactJobEntity,
  FavoriteEntity,
  FavoriteNoteEntity,
  // world（每用户世界时间/天气快照）
  WorldContextEntity,
  // characters + 角色-角色关系（模式感知复合主键 (ownerId,id)，见 tenant-entity.ts）。
  // 全局 boot 种子已搬到首触 per-owner（TenantService.seedNewOwner），boot 不再无上下文写
  // 这三张表，故现在登记安全：afterLoad 读泄漏雷达 + beforeInsert/Update 写盖章/校验生效。
  CharacterEntity,
  // 付费角色解锁权益（模式感知复合主键 (ownerId,id)）。owner-scoped：读守卫 + 写盖章。
  CharacterUnlockEntity,
  AIRelationshipEntity,
  CharacterFriendshipEntity,
  // 角色工厂/行为日志/需求发现候选（原「无 ownerId 已知缺口」，Phase 8r 补收口）。
  // blueprint id=`blueprint_<characterId>`，preset 跨租户重合 → 模式感知复合主键 (id,ownerId)；
  // revision/behavior-log/need-discovery 的 id 是 uuid 全局唯一 → 普通可空 ownerId 列即可。
  CharacterBlueprintEntity,
  CharacterBlueprintRevisionEntity,
  AIBehaviorLogEntity,
  NeedDiscoveryCandidateEntity,
  // need-discovery run-ledger（Phase 8s 补 ownerId；uuid id 全局唯一 → 普通可空列）。
  NeedDiscoveryRunEntity,
  // followup-runtime + real-world-sync 子系统（Phase 8r·9 补 ownerId 收口——原漏建、shared
  // 模式下曾跨 owner 静默混 character 派生数据）。uuid id 全局唯一 → 普通可空 ownerId 列。
  FollowupRunEntity,
  FollowupOpenLoopEntity,
  FollowupRecommendationEntity,
  CharacterRealWorldDigestEntity,
  CharacterRealWorldSignalEntity,
  CharacterRealWorldSyncRunEntity,
  // parking-war occupancy（Phase 8u·4 补 ownerId 收口——原表 npc 侧 keyed 用跨 owner 共用
  // 的 characterId，shared 下裸读/QB 删跨 owner）。uuid id 全局唯一 → 普通可空 ownerId 列。
  ParkingWarOccupancyEntity,
  // self-agent 心跳 run-ledger（Phase 8v 补 ownerId——原漏建、shared 下 getAdminOverview /
  // heartbeat cron 裸 find 跨 owner 静默混）。uuid id 全局唯一 → 普通可空 ownerId 列。
  SelfAgentHeartbeatRunEntity,
  // 用户声音克隆（owner-scoped）。uuid id 全局唯一 → 普通可空 ownerId 列；读守卫 + 写盖章。
  VoiceCloneEntity,
];

let registered = false;

export function registerAllScopedEntities(): void {
  if (registered) return;
  for (const entity of [...ALREADY_SCOPED_ENTITIES, ...NEWLY_SCOPED_ENTITIES]) {
    registerTenantScopedEntity(entity);
  }
  registered = true;
}
