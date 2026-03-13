import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './modules/ai/ai.module';
import { ChatModule } from './modules/chat/chat.module';
import { CharactersModule } from './modules/characters/characters.module';
import { MomentsModule } from './modules/moments/moments.module';
import { ImportModule } from './modules/import/import.module';
import { AuthModule } from './modules/auth/auth.module';
import { SystemConfigModule } from './modules/config/config.module';
import { CharacterEntity } from './modules/characters/character.entity';
import { UserEntity } from './modules/auth/user.entity';
import { ConversationEntity } from './modules/chat/conversation.entity';
import { MessageEntity } from './modules/chat/message.entity';
import { SystemConfigEntity } from './modules/config/config.entity';
import { MomentEntity } from './modules/moments/moment.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'database.sqlite',
      entities: [CharacterEntity, UserEntity, ConversationEntity, MessageEntity, SystemConfigEntity, MomentEntity],
      synchronize: true,
    }),
    AiModule,
    AuthModule,
    ChatModule,
    CharactersModule,
    MomentsModule,
    ImportModule,
    SystemConfigModule,
  ],
})
export class AppModule {}
