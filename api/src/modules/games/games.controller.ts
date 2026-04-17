import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('home')
  getGameCenterHome() {
    return this.gamesService.getGameCenterHome();
  }

  @Get('owner-state')
  getOwnerState() {
    return this.gamesService.getOwnerState();
  }

  @Post(':gameId/launch')
  launchGame(@Param('gameId') gameId: string) {
    return this.gamesService.launchGame(gameId);
  }

  @Post(':gameId/pin')
  pinGame(@Param('gameId') gameId: string) {
    return this.gamesService.setPinnedState(gameId, true);
  }

  @Delete(':gameId/pin')
  unpinGame(@Param('gameId') gameId: string) {
    return this.gamesService.setPinnedState(gameId, false);
  }

  @Delete('active-game')
  dismissActiveGame() {
    return this.gamesService.dismissActiveGame();
  }
}
