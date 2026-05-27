import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { CharacterEntity } from '../characters/character.entity';
import { UserEntity } from '../auth/user.entity';
import { AuthModule } from '../auth/auth.module';
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
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';
import { SelfAgentModule } from '../self-agent/self-agent.module';
import { MomentsModule } from '../moments/moments.module';
import { MinimaxModule } from '../minimax/minimax.module';
import { SystemConfigModule } from '../config/config.module';

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
    AuthModule,
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
    CyberAvatarModule,
    SelfAgentModule,
    MomentsModule,
    MinimaxModule,
    SystemConfigModule,
  ],
  providers: [SchedulerService, SchedulerTelemetryService],
  exports: [SchedulerService, SchedulerTelemetryService],
})
export class SchedulerModule {}
