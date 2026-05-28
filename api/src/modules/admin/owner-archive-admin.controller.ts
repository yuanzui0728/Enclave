// i18n-ignore-start: internal trust-boundary admin endpoint — never reaches end users.
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { WorldOwnerService } from '../auth/world-owner.service';
import { AdminGuard } from './admin.guard';

// 账号注销专用 owner 解绑端点。cloud-api 的 AccountDeletionService 注销时调它（裸
// http.request + x-cloud-user-phone=被注销phone + x-admin-secret），在该 phone 的租户帧
// 内把当前 owner 的 cloudPhone 解绑成 tombstone，使同号重新注册拿到全新 owner，而旧数据
// 凭 tombstone 仍可被后台寻址。仅服务端（持 X-Admin-Secret）可调，不下发浏览器。
@Controller('admin/owner')
@UseGuards(AdminGuard)
export class OwnerArchiveAdminController {
  constructor(private readonly worldOwner: WorldOwnerService) {}

  @Post('archive')
  async archive(@Body() body: { tombstone?: string }) {
    const tombstone = body?.tombstone?.trim();
    if (!tombstone) {
      throw new AppError('OWNER_ARCHIVE_TOMBSTONE_REQUIRED', {
        status: 400,
        legacyMessage: '缺少注销 tombstone。',
      });
    }
    const result = await this.worldOwner.archiveCurrentOwner(tombstone);
    return { ok: true, ...result };
  }
}
// i18n-ignore-end
