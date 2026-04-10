import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import {
  ChatBackgroundAssetsController,
  ConversationBackgroundController,
  GroupBackgroundController,
} from './chat-backgrounds.controller';
import { ChatBackgroundsService } from './chat-backgrounds.service';
import {
  ChatAttachmentController,
  ChatController,
  DigitalHumanCallsController,
  FavoritesController,
  GroupController,
  MessageRemindersController,
  VoiceCallsController,
} from './chat.controller';
import { DigitalHumanCallsService } from './digital-human-calls.service';
import { MockDigitalHumanProviderAdapter } from './digital-human-provider';
import { FavoritesService } from './favorites.service';
import { GroupService } from './group.service';
import { MessageRemindersService } from './message-reminders.service';
import { VoiceCallsService } from './voice-calls.service';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';
import { NarrativeModule } from '../narrative/narrative.module';
import { SystemConfigModule } from '../config/config.module';
import { ConversationEntity } from './conversation.entity';
import { MessageEntity } from './message.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';

@Module({
  imports: [
    AiModule,
    AuthModule,
    CharactersModule,
    NarrativeModule,
    SystemConfigModule,
    TypeOrmModule.forFeature([
      ConversationEntity,
      MessageEntity,
      GroupEntity,
      GroupMemberEntity,
      GroupMessageEntity,
    ]),
  ],
  providers: [
    ChatGateway,
    ChatService,
    ChatBackgroundsService,
    GroupService,
    FavoritesService,
    MessageRemindersService,
    DigitalHumanCallsService,
    MockDigitalHumanProviderAdapter,
    VoiceCallsService,
  ],
  controllers: [
    ChatController,
    ChatAttachmentController,
    VoiceCallsController,
    DigitalHumanCallsController,
    FavoritesController,
    MessageRemindersController,
    ConversationBackgroundController,
    GroupBackgroundController,
    ChatBackgroundAssetsController,
    GroupController,
  ],
  exports: [ChatService, ChatBackgroundsService, GroupService, ChatGateway],
})
export class ChatModule {}
