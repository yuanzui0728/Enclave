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
import { OfficialAccountsModule } from './modules/official-accounts/official-accounts.module';
import { WorldModule } from './modules/world/world.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { NarrativeModule } from './modules/narrative/narrative.module';
import { AdminModule } from './modules/admin/admin.module';
import { SystemModule } from './modules/system/system.module';

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
import { ChatCustomStickerEntity } from './modules/chat/custom-sticker.entity';
import { FeedPostEntity } from './modules/feed/feed-post.entity';
import { FeedCommentEntity } from './modules/feed/feed-comment.entity';
import { WorldContextEntity } from './modules/world/world-context.entity';
import { NarrativeArcEntity } from './modules/narrative/narrative-arc.entity';
import { AIBehaviorLogEntity } from './modules/analytics/ai-behavior-log.entity';
import { UserFeedInteractionEntity } from './modules/analytics/user-feed-interaction.entity';
import { OfficialAccountEntity } from './modules/official-accounts/official-account.entity';
import { OfficialAccountArticleEntity } from './modules/official-accounts/official-account-article.entity';
import { OfficialAccountDeliveryEntity } from './modules/official-accounts/official-account-delivery.entity';
import { OfficialAccountFollowEntity } from './modules/official-accounts/official-account-follow.entity';
import { OfficialAccountServiceMessageEntity } from './modules/official-accounts/official-account-service-message.entity';
import { ModerationReportEntity } from './modules/moderation/moderation-report.entity';
import { prepareDatabasePath, resolveApiPath, resolveRepoPath } from './database/database-path';

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
          CharacterEntity, UserEntity, ConversationEntity, MessageEntity,
          CharacterBlueprintEntity, CharacterBlueprintRevisionEntity,
          SystemConfigEntity, MomentEntity, MomentPostEntity, MomentCommentEntity,
          MomentLikeEntity, FriendshipEntity, FriendRequestEntity, AIRelationshipEntity,
          GroupEntity, GroupMemberEntity, GroupMessageEntity, ChatCustomStickerEntity,
          FeedPostEntity, FeedCommentEntity, WorldContextEntity,
          NarrativeArcEntity, AIBehaviorLogEntity, UserFeedInteractionEntity,
          OfficialAccountEntity, OfficialAccountArticleEntity, OfficialAccountDeliveryEntity, OfficialAccountFollowEntity, OfficialAccountServiceMessageEntity,
          ModerationReportEntity,
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
    OfficialAccountsModule,
    WorldModule,
    SchedulerModule,
    NarrativeModule,
    AdminModule,
    SystemModule,
  ],
})
export class AppModule {}
