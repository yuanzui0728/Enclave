import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { FeedModule } from './modules/feed/feed.module';
import { WorldModule } from './modules/world/world.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { NarrativeModule } from './modules/narrative/narrative.module';

// Entities
import { CharacterEntity } from './modules/characters/character.entity';
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
import { FeedPostEntity } from './modules/feed/feed-post.entity';
import { FeedCommentEntity } from './modules/feed/feed-comment.entity';
import { WorldContextEntity } from './modules/world/world-context.entity';
import { NarrativeArcEntity } from './modules/narrative/narrative-arc.entity';
import { AIBehaviorLogEntity } from './modules/analytics/ai-behavior-log.entity';
import { UserFeedInteractionEntity } from './modules/analytics/user-feed-interaction.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'database.sqlite',
      entities: [
        CharacterEntity, UserEntity, ConversationEntity, MessageEntity,
        SystemConfigEntity, MomentEntity, MomentPostEntity, MomentCommentEntity,
        MomentLikeEntity, FriendshipEntity, FriendRequestEntity, AIRelationshipEntity,
        GroupEntity, GroupMemberEntity, GroupMessageEntity,
        FeedPostEntity, FeedCommentEntity, WorldContextEntity,
        NarrativeArcEntity, AIBehaviorLogEntity, UserFeedInteractionEntity,
      ],
      synchronize: true,
    }),
    AiModule,
    AuthModule,
    ChatModule,
    CharactersModule,
    MomentsModule,
    SystemConfigModule,
    SocialModule,
    FeedModule,
    WorldModule,
    SchedulerModule,
    NarrativeModule,
  ],
})
export class AppModule {}
