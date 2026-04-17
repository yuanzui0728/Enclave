import { Controller, Get } from '@nestjs/common';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('home')
  getGameCenterHome() {
    return this.gamesService.getGameCenterHome();
  }
}
