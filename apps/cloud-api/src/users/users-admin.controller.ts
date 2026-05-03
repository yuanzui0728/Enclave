import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  CloudUserDetail,
  CloudUserListResponse,
  SubscriptionRecordSummary,
} from "@yinjie/contracts";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import {
  BanCloudUserDto,
  GrantSubscriptionDto,
  ListCloudUsersDto,
} from "../http-dto/cloud-api.dto";
import { SubscriptionService } from "../subscription/subscription.service";
import { UsersService } from "./users.service";

@Controller("cloud/admin/users")
@UseGuards(AdminGuard)
export class UsersAdminController {
  constructor(
    private readonly users: UsersService,
    private readonly subscription: SubscriptionService,
  ) {}

  @Get()
  async list(@Query() query: ListCloudUsersDto): Promise<CloudUserListResponse> {
    return this.users.listUsersAdmin({
      query: query.query,
      subscriptionStatus: query.subscriptionStatus,
      status: query.status,
      inviterPhone: query.inviterPhone,
      registeredFrom: query.registeredFrom,
      registeredTo: query.registeredTo,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string): Promise<CloudUserDetail> {
    return this.users.getUserDetailAdmin(id);
  }

  @Post(":id/subscriptions")
  async grant(
    @Param("id") id: string,
    @Body() dto: GrantSubscriptionDto,
    @Req() request: AdminRequest,
  ): Promise<SubscriptionRecordSummary> {
    const user = await this.users.getUserById(id);
    if (!user) throw new NotFoundException("用户不存在。");
    const actor = request.cloudAdminSessionId
      ? `cloud-admin:${request.cloudAdminSessionId}`
      : "cloud-admin:secret";
    const record = await this.subscription.grantSubscription({
      userId: user.id,
      planCode: dto.planCode,
      durationDays: dto.durationDays,
      source: dto.source ?? "admin_grant",
      note: dto.note,
      createdBy: actor,
    });
    const planName = dto.planCode
      ? (await this.subscription.getPlanByCode(dto.planCode))?.name
      : undefined;
    return this.subscription.serializeRecord(record, planName);
  }

  @Post(":id/ban")
  async ban(@Param("id") id: string, @Body() dto: BanCloudUserDto) {
    await this.users.banUser(id, dto.reason);
    return { success: true as const };
  }

  @Post(":id/unban")
  async unban(@Param("id") id: string) {
    await this.users.unbanUser(id);
    return { success: true as const };
  }
}
