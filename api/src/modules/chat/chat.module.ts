import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController, GroupController } from './chat.controller';
import { GroupService } from './group.service';
import { AiModule } from '../ai/ai.module';
import { CharactersModule } from '../characters/characters.module';
import { NarrativeModule } from '../narrative/narrative.module';
import { ConversationEntity } from './conversation.entity';
import { MessageEntity } from './message.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';

@Module({
  imports: [
    AiModule,
    CharactersModule,
    NarrativeModule,
    TypeOrmModule.forFeature([
      ConversationEntity, MessageEntity,
      GroupEntity, GroupMemberEntity, GroupMessageEntity,
    ]),
  ],
  providers: [ChatGateway, ChatService, GroupService],
  controllers: [ChatController, GroupController],
  exports: [ChatService, GroupService, ChatGateway],
})
export class ChatModule {}
