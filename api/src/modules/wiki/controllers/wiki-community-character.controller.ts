import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt-auth.guard';
import { WikiPrivateCharacterService } from '../services/wiki-private-character.service';
import { sendCharacterExportBundle } from './character-export-response';

/**
 * 「角色广场」：用户主动公开的私有角色（isPublic=true）。
 *
 * - 列表 / 详情：匿名可浏览（OptionalJwtAuthGuard，沿用 wiki 公开页模式），
 *   详情访问累计浏览量（owner 自看不计）。
 * - 下载导出：强制登录（JwtAuthGuard），累计下载量（owner 自下不计）；
 *   复用私有角色的 toExportBundle，下载的 .character.json 可直接走
 *   POST /wiki/my-characters/import 导入到自己的私有库。
 *
 * 与 character_pages（巡查审核流的公开词条）是两套独立体系，不混在一起。
 */
@Controller('wiki/community-characters')
export class WikiCommunityCharacterController {
  constructor(private readonly service: WikiPrivateCharacterService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list() {
    return this.service.listPublic();
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async detail(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const detail = await this.service.getPublicById(id);
    // owner 自己浏览不计数；匿名访客与其他登录用户都计。
    if (!user || user.id !== detail.ownerUserId) {
      await this.service.incrementView(id);
      // 让返回的 payload 体现刚自增后的值，避免前端要等下次刷新才看到 +1。
      detail.viewCount += 1;
    }
    return detail;
  }

  @Get(':id/export')
  @UseGuards(JwtAuthGuard)
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const record = await this.service.getPublicEntity(id);
    const bundle = this.service.toExportBundle(record, user.id);
    // owner 下载自己的角色不计下载量（避免创作者自刷激励数据）。
    if (user.id !== record.ownerUserId) {
      await this.service.incrementDownload(id);
    }
    sendCharacterExportBundle(res, bundle, record.name);
  }
}
