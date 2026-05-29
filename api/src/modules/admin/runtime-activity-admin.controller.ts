// i18n-ignore-start: 平台后台运维接口 —— 非终端用户 UI。
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { RuntimeActivityAdminService } from './runtime-activity-admin.service';

// GET /api/admin/runtime/activity-summary —— 平台级跨租户活动聚合（每 owner 最近活动时间）。
// cloud-api 经 platform owner phone + x-admin-secret 调用，用于「用户世界」列表的活动列复活
// 与在线/离线真实判定。AdminGuard 校验 x-admin-secret；服务内部跨全部 owner 聚合（见 service 注释）。
@Controller('admin/runtime')
@UseGuards(AdminGuard)
export class RuntimeActivityAdminController {
  constructor(
    private readonly runtimeActivityAdminService: RuntimeActivityAdminService,
  ) {}

  @Get('activity-summary')
  getActivitySummary() {
    return this.runtimeActivityAdminService.getActivitySummary();
  }
}
// i18n-ignore-end
