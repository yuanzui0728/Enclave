// i18n-ignore-start: admin-only API, returns JSON for the cloud console.
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import {
  WikiUsersAdminService,
  type WikiUserListQuery,
} from './wiki-users-admin.service';

@Controller('admin/wiki-users')
@UseGuards(AdminGuard)
export class WikiUsersAdminController {
  constructor(private readonly service: WikiUsersAdminService) {}

  @Get()
  listUsers(@Query() query: WikiUserListQuery) {
    return this.service.listUsers(query ?? {});
  }

  // 创作者激励榜单：公开角色浏览/下载聚合 + 联系方式（人工发会员的依据）。
  // 放在 :userId 动态段之前，避免 "creator-rewards" 被当成 userId 吞掉。
  @Get('creator-rewards')
  listCreatorRewards() {
    return this.service.listCreatorRewardStats();
  }

  @Get(':userId/private-characters')
  listPrivateCharacters(@Param('userId') userId: string) {
    return this.service.listPrivateCharacters(userId);
  }

  // 管理员强制下架公开角色（公开角色不走巡查审核流，保留这个管控口子）。
  @Post('community-characters/:characterId/unpublish')
  forceUnpublish(@Param('characterId') characterId: string) {
    return this.service.forceUnpublish(characterId);
  }
}
// i18n-ignore-end
