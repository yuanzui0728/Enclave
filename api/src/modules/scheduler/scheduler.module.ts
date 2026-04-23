import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { CharacterEntity } from '../characters/character.entity';
import { UserEntity } from '../auth/user.entity';
import { WorldModule } from '../world/world.module';
import { AiModule } from '../ai/ai.module';
import { SocialModule } from '../social/social.module';
import { FeedModule } from '../feed/feed.module';
import { ChatModule } from '../chat/chat.module';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import { AIRelationshipEntity } from '../social/ai-relationship.entity';
import { SchedulerTelemetryService } from './scheduler-telemetry.service';
import { CharactersModule } from '../characters/characters.module';
import { NeedDiscoveryModule } from '../need-discovery/need-discovery.module';
import { EventsModule } from '../events/events.module';
import { RealWorldSyncModule } from '../real-world-sync/real-world-sync.module';
import { FollowupRuntimeModule } from '../followup-runtime/followup-runtime.module';
import { ReminderRuntimeModule } from '../reminder-runtime/reminder-runtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MomentPostEntity,
      FeedPostEntity,
      FriendRequestEntity,
      CharacterEntity,
      UserEntity,
      ConversationEntity,
      MessageEntity,
      AIRelationshipEntity,
    ]),
    forwardRef(() => WorldModule),
    forwardRef(() => AiModule),
    SocialModule,
    FeedModule,
    ChatModule,
    CharactersModule,
    NeedDiscoveryModule,
    EventsModule,
    RealWorldSyncModule,
    FollowupRuntimeModule,
    ReminderRuntimeModule,
  ],
  providers: [SchedulerService, SchedulerTelemetryService],
  exports: [SchedulerService, SchedulerTelemetryService],
})
export class SchedulerModule {}
