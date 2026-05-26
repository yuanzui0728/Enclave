// i18n-ignore-start: backend controller; domain errors (not user-facing UI strings).
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  GamePlayService,
  type GameAiTurnInput,
} from './game-play.service';

/**
 * embedded_web 游戏运行时的世界侧端点。App 经 /cloud/world-api 代理打到这里
 * （代理注入受信 x-cloud-user-phone → TenantContextMiddleware 解析租户身份，
 * 角色集合自动按当前世界隔离）。gameId 仅用于归因/日志，角色来自 tenant 上下文。
 */
@Controller('games')
export class GamePlayController {
  constructor(private readonly service: GamePlayService) {}

  @Get(':gameId/play-characters')
  playCharacters() {
    return this.service.listPlayCharacters();
  }

  @Post(':gameId/ai-turn')
  aiTurn(@Param('gameId') _gameId: string, @Body() body: GameAiTurnInput) {
    return this.service.aiTurn(body ?? ({} as GameAiTurnInput));
  }
}
// i18n-ignore-end
