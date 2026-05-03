import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AiModule } from './modules/ai/ai.module';
import { ChatModule } from './modules/chat/chat.module';
import { CharactersModule } from './modules/characters/characters.module';
import { MomentsModule } from './modules/moments/moments.module';
import { AuthModule } from './modules/auth/auth.module';
import { SystemConfigModule } from './modules/config/config.module';
import { SocialModule } from './modules/social/social.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { FeedModule } from './modules/feed/feed.module';
import { GamesModule } from './modules/games/games.module';
import { OfficialAccountsModule } from './modules/official-accounts/official-accounts.module';
import { WorldModule } from './modules/world/world.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { NarrativeModule } from './modules/narrative/narrative.module';
import { AdminModule } from './modules/admin/admin.module';
import { CloudRuntimeModule } from './modules/cloud-runtime/cloud-runtime.module';
import { SystemModule } from './modules/system/system.module';
import { ActionRuntimeModule } from './modules/action-runtime/action-runtime.module';
import { CyberAvatarModule } from './modules/cyber-avatar/cyber-avatar.module';
import { NeedDiscoveryModule } from './modules/need-discovery/need-discovery.module';
import { RealWorldSyncModule } from './modules/real-world-sync/real-world-sync.module';
import { FollowupRuntimeModule } from './modules/followup-runtime/followup-runtime.module';
import { InferenceModule } from './modules/inference/inference.module';
import { ReminderRuntimeModule } from './modules/reminder-runtime/reminder-runtime.module';

// Entities
import { CharacterEntity } from './modules/characters/character.entity';
import { CharacterBlueprintEntity } from './modules/characters/character-blueprint.entity';
import { CharacterBlueprintRevisionEntity } from './modules/characters/character-blueprint-revision.entity';
import { UserEntity } from './modules/auth/user.entity';
import { ConversationEntity } from './modules/chat/conversation.entity';
import { MessageEntity } from './modules/chat/message.entity';
import { SystemConfigEntity } from './modules/config/config.entity';
import { MomentEntity } from './modules/moments/moment.entity';
import { MomentPostEntity } from './modules/moments/moment-post.entity';
import { MomentCommentEntity } from './modules/moments/moment-comment.entity';
import { MomentLikeEntity } from './modules/moments/moment-like.entity';
import { FriendshipEntity } from './modules/social/friendship.entity';
import { FriendRequestEntity } from './modules/social/friend-request.entity';
import { AIRelationshipEntity } from './modules/social/ai-relationship.entity';
import { GroupEntity } from './modules/chat/group.entity';
import { GroupMemberEntity } from './modules/chat/group-member.entity';
import { GroupMessageEntity } from './modules/chat/group-message.entity';
import { GroupReplyTaskEntity } from './modules/chat/group-reply-task.entity';
import { ReplyArtifactJobEntity } from './modules/chat/reply-artifact-job.entity';
import { MediaInsightJobEntity } from './modules/chat/media-insight-job.entity';
import { ChatCustomStickerEntity } from './modules/chat/custom-sticker.entity';
import { FeedPostEntity } from './modules/feed/feed-post.entity';
import { FeedCommentEntity } from './modules/feed/feed-comment.entity';
import { VideoChannelFollowEntity } from './modules/feed/video-channel-follow.entity';
import { GameCatalogEntity } from './modules/games/game-catalog.entity';
import { GameCatalogRevisionEntity } from './modules/games/game-catalog-revision.entity';
import { GameCenterCurationEntity } from './modules/games/game-center-curation.entity';
import { GameOwnerStateEntity } from './modules/games/game-owner-state.entity';
import { GameSubmissionEntity } from './modules/games/game-submission.entity';
import { WorldContextEntity } from './modules/world/world-context.entity';
import { NarrativeArcEntity } from './modules/narrative/narrative-arc.entity';
import { AIBehaviorLogEntity } from './modules/analytics/ai-behavior-log.entity';
import { AiUsageLedgerEntity } from './modules/analytics/ai-usage-ledger.entity';
import { UserFeedInteractionEntity } from './modules/analytics/user-feed-interaction.entity';
import { OfficialAccountEntity } from './modules/official-accounts/official-account.entity';
import { OfficialAccountArticleEntity } from './modules/official-accounts/official-account-article.entity';
import { OfficialAccountDeliveryEntity } from './modules/official-accounts/official-account-delivery.entity';
import { OfficialAccountFollowEntity } from './modules/official-accounts/official-account-follow.entity';
import { OfficialAccountServiceMessageEntity } from './modules/official-accounts/official-account-service-message.entity';
import { ModerationReportEntity } from './modules/moderation/moderation-report.entity';
import { AdminConversationReviewEntity } from './modules/admin/admin-conversation-review.entity';
import { ActionConnectorEntity } from './modules/action-runtime/action-connector.entity';
import { ActionRunEntity } from './modules/action-runtime/action-run.entity';
import { CyberAvatarProfileEntity } from './modules/cyber-avatar/cyber-avatar-profile.entity';
import { CyberAvatarRealWorldBriefEntity } from './modules/cyber-avatar/cyber-avatar-real-world-brief.entity';
import { CyberAvatarRealWorldItemEntity } from './modules/cyber-avatar/cyber-avatar-real-world-item.entity';
import { CyberAvatarSignalEntity } from './modules/cyber-avatar/cyber-avatar-signal.entity';
import { CyberAvatarRunEntity } from './modules/cyber-avatar/cyber-avatar-run.entity';
import { NeedDiscoveryRunEntity } from './modules/need-discovery/need-discovery-run.entity';
import { NeedDiscoveryCandidateEntity } from './modules/need-discovery/need-discovery-candidate.entity';
import { CharacterRealWorldSignalEntity } from './modules/real-world-sync/character-real-world-signal.entity';
import { CharacterRealWorldDigestEntity } from './modules/real-world-sync/character-real-world-digest.entity';
import { CharacterRealWorldSyncRunEntity } from './modules/real-world-sync/character-real-world-sync-run.entity';
import { FollowupRunEntity } from './modules/followup-runtime/followup-run.entity';
import { FollowupOpenLoopEntity } from './modules/followup-runtime/followup-open-loop.entity';
import { FollowupRecommendationEntity } from './modules/followup-runtime/followup-recommendation.entity';
import { ReminderTaskEntity } from './modules/reminder-runtime/reminder-task.entity';
import { InferenceProviderAccountEntity } from './modules/inference/inference-provider-account.entity';
import { InferenceModelCatalogEntryEntity } from './modules/inference/inference-model-catalog-entry.entity';
import { SelfAgentHeartbeatRunEntity } from './modules/self-agent/self-agent-heartbeat-run.entity';
import { SelfAgentRunEntity } from './modules/self-agent/self-agent-run.entity';
import { UserWikiProfileEntity } from './modules/wiki/entities/user-wiki-profile.entity';
import {
  prepareDatabasePath,
  resolveApiPath,
  resolveRepoPath,
} from './database/database-path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolveApiPath('.env'), resolveRepoPath('.env')],
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: prepareDatabasePath(config.get<string>('DATABASE_PATH')),
        entities: [
          CharacterEntity,
          UserEntity,
          ConversationEntity,
          MessageEntity,
          CharacterBlueprintEntity,
          CharacterBlueprintRevisionEntity,
          SystemConfigEntity,
          MomentEntity,
          MomentPostEntity,
          MomentCommentEntity,
          MomentLikeEntity,
          FriendshipEntity,
          FriendRequestEntity,
          AIRelationshipEntity,
          GroupEntity,
          GroupMemberEntity,
          GroupMessageEntity,
          GroupReplyTaskEntity,
          ReplyArtifactJobEntity,
          MediaInsightJobEntity,
          ChatCustomStickerEntity,
          FeedPostEntity,
          FeedCommentEntity,
          VideoChannelFollowEntity,
          GameCatalogEntity,
          GameCatalogRevisionEntity,
          GameCenterCurationEntity,
          GameOwnerStateEntity,
          GameSubmissionEntity,
          WorldContextEntity,
          NarrativeArcEntity,
          AIBehaviorLogEntity,
          AiUsageLedgerEntity,
          UserFeedInteractionEntity,
          OfficialAccountEntity,
          OfficialAccountArticleEntity,
          OfficialAccountDeliveryEntity,
          OfficialAccountFollowEntity,
          OfficialAccountServiceMessageEntity,
          ModerationReportEntity,
          AdminConversationReviewEntity,
          ActionConnectorEntity,
          ActionRunEntity,
          CyberAvatarProfileEntity,
          CyberAvatarRealWorldItemEntity,
          CyberAvatarRealWorldBriefEntity,
          CyberAvatarSignalEntity,
          CyberAvatarRunEntity,
          NeedDiscoveryRunEntity,
          NeedDiscoveryCandidateEntity,
          CharacterRealWorldSignalEntity,
          CharacterRealWorldDigestEntity,
          CharacterRealWorldSyncRunEntity,
          FollowupRunEntity,
          FollowupOpenLoopEntity,
          FollowupRecommendationEntity,
          ReminderTaskEntity,
          InferenceProviderAccountEntity,
          InferenceModelCatalogEntryEntity,
          SelfAgentHeartbeatRunEntity,
          SelfAgentRunEntity,
          UserWikiProfileEntity,
        ],
        synchronize: true,
      }),
    }),
    AiModule,
    AuthModule,
    ChatModule,
    CharactersModule,
    MomentsModule,
    SystemConfigModule,
    SocialModule,
    ModerationModule,
    FeedModule,
    GamesModule,
    OfficialAccountsModule,
    WorldModule,
    SchedulerModule,
    NarrativeModule,
    NeedDiscoveryModule,
    AdminModule,
    ActionRuntimeModule,
    CyberAvatarModule,
    RealWorldSyncModule,
    FollowupRuntimeModule,
    ReminderRuntimeModule,
    InferenceModule,
    CloudRuntimeModule,
    SystemModule,
  ],
})
export class AppModule {}
