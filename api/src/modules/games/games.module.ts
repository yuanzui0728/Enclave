import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { AdminGamesController } from './admin-games.controller';
import { AdminGuard } from '../admin/admin.guard';
import { GameCatalogEntity } from './game-catalog.entity';
import { GameOwnerStateEntity } from './game-owner-state.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameOwnerStateEntity, GameCatalogEntity]),
    AuthModule,
  ],
  providers: [GamesService, AdminGuard],
  controllers: [GamesController, AdminGamesController],
  exports: [GamesService],
})
export class GamesModule {}
