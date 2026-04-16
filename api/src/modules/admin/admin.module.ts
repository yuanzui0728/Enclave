import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { UserEntity } from '../auth/user.entity';
import { CharacterEntity } from '../characters/character.entity';
import { MessageEntity } from '../chat/message.entity';
import { SystemConfigEntity } from '../config/config.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { GroupReplyTaskEntity } from '../chat/group-reply-task.entity';
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { WorldModule } from '../world/world.module';
import { SystemConfigModule } from '../config/config.module';
import { CharactersModule } from '../characters/characters.module';
import { ChatModule } from '../chat/chat.module';
import { ReplyLogicAdminService } from './reply-logic-admin.service';
import { ChatRecordsAdminService } from './chat-records-admin.service';
import { ChatRecordsAdminController } from './chat-records-admin.controller';
import { AdminConversationReviewEntity } from './admin-conversation-review.entity';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { FriendshipEntity } from '../social/friendship.entity';

@Module({
  imports: [
    AuthModule,
    AiModule,
    CharactersModule,
    ChatModule,
    WorldModule,
    SystemConfigModule,
    SchedulerModule,
    TypeOrmModule.forFeature([
      UserEntity,
      CharacterEntity,
      MessageEntity,
      SystemConfigEntity,
      ConversationEntity,
      GroupEntity,
      GroupMemberEntity,
      GroupMessageEntity,
      GroupReplyTaskEntity,
      NarrativeArcEntity,
      MomentPostEntity,
      FeedPostEntity,
      AiUsageLedgerEntity,
      AdminConversationReviewEntity,
      FriendshipEntity,
    ]),
  ],
  providers: [
    AdminService,
    ReplyLogicAdminService,
    ChatRecordsAdminService,
    AdminGuard,
  ],
  controllers: [AdminController, ChatRecordsAdminController],
})
export class AdminModule {}
