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
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { WorldModule } from '../world/world.module';
import { SystemConfigModule } from '../config/config.module';
import { CharactersModule } from '../characters/characters.module';
import { ReplyLogicAdminService } from './reply-logic-admin.service';

@Module({
  imports: [
    AuthModule,
    AiModule,
    CharactersModule,
    WorldModule,
    SystemConfigModule,
    TypeOrmModule.forFeature([
      UserEntity,
      CharacterEntity,
      MessageEntity,
      SystemConfigEntity,
      ConversationEntity,
      GroupEntity,
      GroupMemberEntity,
      GroupMessageEntity,
      NarrativeArcEntity,
    ]),
  ],
  providers: [AdminService, ReplyLogicAdminService, AdminGuard],
  controllers: [AdminController],
})
export class AdminModule {}
