import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequireRole } from '../decorators/require-role.decorator';
import { WikiRoleGuard } from '../guards/wiki-role.guard';
import { WikiPrivateCharacterService } from '../services/wiki-private-character.service';

/**
 * 角色广场的管理员侧：创作者激励榜单 + 强制下架。
 *
 * 用 wiki 自己的 JWT + 角色门禁（@RequireRole('admin')），让 wiki 后台（5184，
 * 用普通 admin 账号登录）可直接访问 —— 与 WikiStatsController 同模式。
 * 注意区别于 /admin/wiki-users（AdminGuard / x-admin-secret，cloud-console 用）。
 */
@Controller('wiki/admin/community')
@UseGuards(JwtAuthGuard, WikiRoleGuard)
@RequireRole('admin')
export class WikiCommunityAdminController {
  constructor(private readonly service: WikiPrivateCharacterService) {}

  @Get('creator-rewards')
  creatorRewards() {
    return this.service.listCreatorRewardStats();
  }

  @Post('characters/:id/unpublish')
  async unpublish(@Param('id') id: string) {
    const changed = await this.service.adminSetPublic(id, false);
    return { changed };
  }
}
