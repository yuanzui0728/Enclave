import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';
import { AiModule } from '../ai/ai.module';
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { AdminGamesController } from './admin-games.controller';
import { GamePlayController } from './game-play.controller';
import { GamePlayService } from './game-play.service';
import { AdminGuard } from '../admin/admin.guard';
import { GameCatalogEntity } from './game-catalog.entity';
import { GameCatalogRevisionEntity } from './game-catalog-revision.entity';
import { GameCenterCurationEntity } from './game-center-curation.entity';
import { GameOwnerStateEntity } from './game-owner-state.entity';
import { GameSubmissionEntity } from './game-submission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameOwnerStateEntity,
      GameCatalogEntity,
      GameCatalogRevisionEntity,
      GameCenterCurationEntity,
      GameSubmissionEntity,
    ]),
    AuthModule,
    CharactersModule,
    AiModule,
    CyberAvatarModule,
  ],
  providers: [GamesService, GamePlayService, AdminGuard],
  controllers: [GamesController, AdminGamesController, GamePlayController],
  exports: [GamesService],
})
export class GamesModule {}
