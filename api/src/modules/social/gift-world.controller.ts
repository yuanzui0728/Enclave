import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { GiftInternalServiceTokenGuard } from './gift-internal-service-token.guard';
import { GiftWorldService } from './gift-world.service';

// cloud-api 经此（X-Service-Token + x-cloud-user-phone 建租户帧）通知 world：
// 用户送了 AI 好友礼物 → 落气泡 + 加亲密度。全路径 /api/internal/store-gifts/*。
@Controller('internal/store-gifts')
@UseGuards(GiftInternalServiceTokenGuard)
export class GiftWorldController {
  constructor(private readonly gift: GiftWorldService) {}

  @Post('inbound-from-user')
  async inboundFromUser(
    @Body()
    body: {
      giftRecordId: string;
      characterId: string;
      goodsCode: string;
      goodsName: string;
      quantity: number;
      message?: string;
    },
  ): Promise<{ intimacyDelta: number; newIntimacyLevel: number | null }> {
    return this.gift.inboundFromUser(body);
  }
}
