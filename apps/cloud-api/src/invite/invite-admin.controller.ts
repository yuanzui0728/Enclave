import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { InviteRedemptionListResponse } from "@yinjie/contracts";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import {
  ListInviteRedemptionsDto,
  RejectInviteRedemptionDto,
} from "../http-dto/cloud-api.dto";
import { InviteService } from "./invite.service";

@Controller("cloud/admin/invites")
@UseGuards(AdminGuard)
export class InviteAdminController {
  constructor(private readonly invite: InviteService) {}

  @Get("redemptions")
  async list(@Query() query: ListInviteRedemptionsDto): Promise<InviteRedemptionListResponse> {
    return this.invite.listRedemptionsAdmin({
      query: query.query,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post("redemptions/:id/reject")
  async reject(
    @Param("id") id: string,
    @Body() dto: RejectInviteRedemptionDto,
    @Req() request: AdminRequest,
  ) {
    const actor = request.cloudAdminSessionId
      ? `cloud-admin:${request.cloudAdminSessionId}`
      : "cloud-admin:secret";
    const result = await this.invite.rejectRedemption(id, dto.reason, actor);
    if (!result) {
      throw new NotFoundException("邀请记录不存在。");
    }
    return { success: true as const };
  }
}
