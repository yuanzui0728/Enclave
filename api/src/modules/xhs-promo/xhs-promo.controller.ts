import { Body, Controller, Post } from '@nestjs/common';
import {
  XhsPromoService,
  type XhsPromoCopyResult,
  type XhsPromoImageResult,
} from './xhs-promo.service';

// 小红书发帖助手（world 端，租户上下文由全局中间件按 x-cloud-user-phone 注入，
// 同 /api/moments/*）。生成的文案/配图是给用户下载后自己去小红书发布的素材，
// 与「发帖凭证截图」无关——凭证走 cloud-api 的 /cloud/me/xhs-reward/submit。
@Controller('xhs-promo')
export class XhsPromoController {
  constructor(private readonly service: XhsPromoService) {}

  @Post('generate-copy')
  async generateCopy(
    @Body() body: { count?: number; angle?: string },
  ): Promise<XhsPromoCopyResult> {
    return this.service.generateCopy({
      count: body?.count,
      angle: body?.angle,
    });
  }

  @Post('generate-image')
  async generateImage(
    @Body() body: { promptHint?: string },
  ): Promise<XhsPromoImageResult> {
    return this.service.generateImage({ promptHint: body?.promptHint });
  }
}
