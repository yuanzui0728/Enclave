import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ServiceTokenGuard } from "../auth/service-token.guard";
import { SubscriptionLookupDto } from "../http-dto/cloud-api.dto";
import { SubscriptionService } from "./subscription.service";

@Controller("cloud/internal/subscription")
@UseGuards(ServiceTokenGuard)
export class SubscriptionInternalController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Post("lookup")
  async lookup(@Body() dto: SubscriptionLookupDto) {
    return this.subscription.buildLookupResponse(dto.phone);
  }
}
