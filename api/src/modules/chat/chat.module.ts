import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AiModule } from '../ai/ai.module';
import { CharactersModule } from '../characters/characters.module';
import { ConversationEntity } from './conversation.entity';
import { MessageEntity } from './message.entity';

@Module({
  imports: [AiModule, CharactersModule, TypeOrmModule.forFeature([ConversationEntity, MessageEntity])],
  providers: [ChatGateway, ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
