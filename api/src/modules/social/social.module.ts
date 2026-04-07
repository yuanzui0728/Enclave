import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { FriendshipEntity } from './friendship.entity';
import { FriendRequestEntity } from './friend-request.entity';
import { AIRelationshipEntity } from './ai-relationship.entity';
import { CharacterEntity } from '../characters/character.entity';
import { AiModule } from '../ai/ai.module';
import { NarrativeModule } from '../narrative/narrative.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FriendshipEntity, FriendRequestEntity, AIRelationshipEntity, CharacterEntity]),
    AiModule,
    NarrativeModule,
  ],
  providers: [SocialService],
  controllers: [SocialController],
  exports: [SocialService],
})
export class SocialModule {}
