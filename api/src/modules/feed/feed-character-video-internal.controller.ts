import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedInternalServiceTokenGuard } from './feed-internal-service-token.guard';

// world 侧私有角色视频注入入口（由 cloud-api DOWN 调用，全局前缀 /api →
// /api/internal/feed/channels/inject-character-video）。cloud-api 注入的
// x-cloud-user-phone 经 TenantContextMiddleware 已建好租户帧，injectCharacterVideoPost
// 内 scopedRepo 自动按该 owner 过滤角色；LPP 单 owner 时中间件 no-op 也正确。
@Controller('internal/feed/channels')
@UseGuards(FeedInternalServiceTokenGuard)
export class FeedCharacterVideoInternalController {
  constructor(private readonly feed: FeedService) {}

  @Post('inject-character-video')
  async inject(
    @Body()
    body: {
      cloudVideoId?: string;
      sourceCharacterId?: string;
      text?: string;
      title?: string | null;
      mediaUrl?: string;
      coverUrl?: string | null;
      durationMs?: number | null;
    },
  ): Promise<{ injected: boolean; reason?: string }> {
    const cloudVideoId = (body?.cloudVideoId ?? '').trim();
    const sourceCharacterId = (body?.sourceCharacterId ?? '').trim();
    const mediaUrl = (body?.mediaUrl ?? '').trim();
    if (!cloudVideoId || !sourceCharacterId || !mediaUrl) {
      return { injected: false, reason: 'bad_request' };
    }
    return this.feed.injectCharacterVideoPost({
      cloudVideoId,
      sourceCharacterId,
      text: body?.text ?? '',
      title: body?.title ?? null,
      mediaUrl,
      coverUrl: body?.coverUrl ?? null,
      durationMs: body?.durationMs ?? null,
    });
  }
}
