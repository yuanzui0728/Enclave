import { Body, Controller, Get, NotFoundException, Post, Req, UseGuards } from "@nestjs/common";
import type { CheckoutResponse, SubscriptionStateResponse } from "@yinjie/contracts";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CloudClientAuthGuard } from "../auth/cloud-client-auth.guard";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { CheckoutDto } from "../http-dto/cloud-api.dto";
import { CloudConfigService } from "../cloud-config/cloud-config.service";
import { SubscriptionService } from "./subscription.service";

type CloudPhoneRequest = { cloudPhone?: string };

@Controller("cloud/me")
@UseGuards(CloudClientAuthGuard)
export class SubscriptionClientController {
  constructor(
    private readonly subscription: SubscriptionService,
    private readonly cloudConfig: CloudConfigService,
    @InjectRepository(CloudUserEntity)
    private readonly userRepo: Repository<CloudUserEntity>,
  ) {}

  @Get("subscription")
  async getMySubscription(@Req() req: CloudPhoneRequest): Promise<SubscriptionStateResponse> {
    const phone = req.cloudPhone;
    if (!phone) {
      throw new NotFoundException("会话未携带手机号。");
    }
    const user = await this.userRepo.findOne({ where: { phone } });
    if (!user) {
      throw new NotFoundException("当前手机号尚未注册云端用户。");
    }
    return this.subscription.buildClientState(user);
  }

  @Get("profile")
  async getMyProfile(@Req() req: CloudPhoneRequest) {
    const phone = req.cloudPhone;
    if (!phone) {
      throw new NotFoundException("会话未携带手机号。");
    }
    const user = await this.userRepo.findOne({ where: { phone } });
    if (!user) {
      throw new NotFoundException("当前手机号尚未注册云端用户。");
    }
    return {
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
      status: user.status,
      firstLoginAt: user.firstLoginAt?.toISOString() ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  @Post("checkout")
  async createCheckout(
    @Body() dto: CheckoutDto,
    @Req() req: CloudPhoneRequest,
  ): Promise<CheckoutResponse> {
    const phone = req.cloudPhone;
    if (!phone) {
      throw new NotFoundException("会话未携带手机号。");
    }
    const plan = await this.subscription.getPlanByCode(dto.planCode);
    if (!plan || !plan.isActive || !plan.isPubliclyPurchasable) {
      throw new NotFoundException("套餐不可购买。");
    }
    const [contact, hint] = await Promise.all([
      this.cloudConfig.getString("copy.checkoutContactInfo", ""),
      this.cloudConfig.getString(
        "copy.checkoutManualHint",
        "请联系运营开通会员，开通后将自动到账",
      ),
    ]);
    return {
      status: "manual",
      contact,
      hint,
    };
  }
}
