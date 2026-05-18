import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersService } from './characters.service';
import { CharactersController } from './characters.controller';
import { CharacterEntity } from './character.entity';
import { CharacterBlueprintEntity } from './character-blueprint.entity';
import { CharacterBlueprintRevisionEntity } from './character-blueprint-revision.entity';
import { CharacterBlueprintService } from './character-blueprint.service';
import { AiModule } from '../ai/ai.module';
import { FriendshipEntity } from '../social/friendship.entity';
import { AuthModule } from '../auth/auth.module';
import { RealWorldSyncModule } from '../real-world-sync/real-world-sync.module';
import { AdminGuard } from '../admin/admin.guard';
import { PrivateCharacterRateLimitGuard } from './guards/private-character-rate-limit.guard';

@Module({
  imports: [
    forwardRef(() => AiModule),
    AuthModule,
    RealWorldSyncModule,
    TypeOrmModule.forFeature([
      CharacterEntity,
      CharacterBlueprintEntity,
      CharacterBlueprintRevisionEntity,
      FriendshipEntity,
    ]),
  ],
  providers: [
    CharactersService,
    CharacterBlueprintService,
    AdminGuard,
    PrivateCharacterRateLimitGuard,
  ],
  controllers: [CharactersController],
  exports: [
    CharactersService,
    CharacterBlueprintService,
    PrivateCharacterRateLimitGuard,
  ],
})
export class CharactersModule {}
