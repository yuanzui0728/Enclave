import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { GamesService } from './games.service';

@Controller('admin/games')
@UseGuards(AdminGuard)
export class AdminGamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  getAdminCatalog() {
    return this.gamesService.getAdminCatalog();
  }
}
