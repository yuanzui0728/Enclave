// i18n-ignore-start: backend controller, errors are domain codes (not user-facing zh strings).
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { WikiGameArtifact } from '../wiki-game.types';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { WikiGameService } from '../services/wiki-game.service';

/**
 * 游戏的 CRUD + 公共画廊 + 一键复刻。AI 生成走 WikiGameAiGenerateController，
 * job 轮询走 WikiGameJobController。
 */
@Controller('wiki')
@UseGuards(JwtAuthGuard)
export class WikiGameController {
  constructor(private readonly service: WikiGameService) {}

  /** 公共画廊：所有 public 游戏（轻量摘要，不含 html）。 */
  @Get('games')
  listPublic() {
    return this.service.listPublicGames();
  }

  /** 公共游戏详情（含产物，供预览 + 复刻）。 */
  @Get('games/:gameId')
  getPublic(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
  ) {
    return this.service.getView(gameId, user.id);
  }

  /** 一键复刻一个公开游戏到自己的私有副本。 */
  @Post('games/:gameId/clone')
  clone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
  ) {
    return this.service.clone(user.id, gameId, user.username);
  }

  /** 我的游戏列表。 */
  @Get('my-games')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listMyGames(user.id);
  }

  @Get('my-games/:id')
  getMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.getView(id, user.id);
  }

  @Get('my-games/:id/history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.getHistory(user.id, id);
  }

  /** 手动保存一份编辑后的产物（前端微调 HTML / spec）。 */
  @Post('my-games/:id/revisions')
  async saveRevision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { artifact?: WikiGameArtifact },
  ) {
    if (!body?.artifact || typeof body.artifact !== 'object') {
      throw new BadRequestException('缺少 artifact');
    }
    if (typeof body.artifact.html !== 'string' || !body.artifact.html.trim()) {
      throw new BadRequestException('artifact.html 不能为空');
    }
    return this.service.saveManualRevision(user.id, id, body.artifact);
  }

  /** 公开 / 私有切换。 */
  @Patch('my-games/:id/visibility')
  async setVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { visibility?: string },
  ) {
    const v = body?.visibility;
    if (v !== 'public' && v !== 'private') {
      throw new BadRequestException("visibility 必须是 'public' 或 'private'");
    }
    await this.service.setVisibility(user.id, id, v);
    return { success: true, visibility: v };
  }

  @Delete('my-games/:id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.service.deleteGame(user.id, id);
    return { success: true };
  }
}
// i18n-ignore-end
