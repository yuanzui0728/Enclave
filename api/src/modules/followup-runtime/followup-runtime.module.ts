import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';
import { ChatModule } from '../chat/chat.module';
import { SystemConfigModule } from '../config/config.module';
import { EventsModule } from '../events/events.module';
import { SocialModule } from '../social/social.module';
import { CharacterEntity } from '../characters/character.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { FollowupOpenLoopEntity } from './followup-open-loop.entity';
import { FollowupRecommendationEntity } from './followup-recommendation.entity';
import { FollowupRunEntity } from './followup-run.entity';
import { FollowupRuntimeController } from './followup-runtime.controller';
import { FollowupRuntimeLifecycleService } from './followup-runtime-lifecycle.service';
import { FollowupRuntimeRulesService } from './followup-runtime-rules.service';
import { FollowupRuntimeService } from './followup-runtime.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FollowupRunEntity,
      FollowupOpenLoopEntity,
      FollowupRecommendationEntity,
      CharacterEntity,
      ConversationEntity,
      MessageEntity,
      FriendshipEntity,
      FriendRequestEntity,
    ]),
    forwardRef(() => AiModule),
    AuthModule,
    CharactersModule,
    ChatModule,
    SystemConfigModule,
    EventsModule,
    SocialModule,
  ],
  providers: [
    FollowupRuntimeRulesService,
    FollowupRuntimeService,
    FollowupRuntimeLifecycleService,
  ],
  controllers: [FollowupRuntimeController],
  exports: [FollowupRuntimeRulesService, FollowupRuntimeService],
})
export class FollowupRuntimeModule {}
