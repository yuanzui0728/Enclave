import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type { SubscriptionPlanSummary } from "@yinjie/contracts";
import { AdminGuard } from "../auth/admin.guard";
import { UpsertSubscriptionPlanDto } from "../http-dto/cloud-api.dto";
import { SubscriptionService } from "./subscription.service";

@Controller("cloud/admin/subscription-plans")
@UseGuards(AdminGuard)
export class SubscriptionAdminController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get()
  async list(): Promise<SubscriptionPlanSummary[]> {
    return this.subscription.listAllPlans();
  }

  @Post()
  async upsert(@Body() dto: UpsertSubscriptionPlanDto): Promise<SubscriptionPlanSummary> {
    return this.subscription.upsertPlan({
      id: dto.id,
      code: dto.code,
      name: dto.name,
      durationDays: dto.durationDays,
      priceCents: dto.priceCents,
      currency: dto.currency,
      isActive: dto.isActive,
      isTrial: dto.isTrial,
      isPubliclyPurchasable: dto.isPubliclyPurchasable,
      sortOrder: dto.sortOrder,
      description: dto.description ?? null,
    });
  }
}
