import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { AdminGamesController } from './admin-games.controller';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  providers: [GamesService, AdminGuard],
  controllers: [GamesController, AdminGamesController],
  exports: [GamesService],
})
export class GamesModule {}
