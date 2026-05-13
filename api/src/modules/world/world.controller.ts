import { Body, Controller, Delete, Get, Patch } from '@nestjs/common';
import { WorldService } from './world.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import type { ChatBackgroundAsset } from '../chat/chat-background.types';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
@Controller('world')
export class WorldController {
  constructor(
    private readonly worldService: WorldService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly cyberAvatar: CyberAvatarService,
  ) {}

  @Get('context')
  getLatest() {
    return this.worldService.getLatest();
  }

  // cloud-api spawn child 后会 ping 这个端点确认起来的是"自家"world child；
  // 仅返回 spawn 时注入的 worldId/phone（来自 CLOUD_WORLD_ID/CLOUD_OWNER_PHONE 环境变量），
  // 没访问任何业务数据。撞端口时（被另一个号的 child 或孤儿 cloud-api 占着）这里返回的 worldId
  // 不会匹配，pingHealth 即可拒绝误判。
  @Get('identity')
  getIdentity() {
    return {
      worldId: process.env.CLOUD_WORLD_ID ?? null,
      phone: process.env.CLOUD_OWNER_PHONE ?? null,
    };
  }

  @Get('owner')
  getOwner() {
    return this.worldOwnerService.getOwnerProfile();
  }

  @Patch('owner')
  async updateOwner(
    @Body()
    body: {
      username?: string;
      avatar?: string;
      signature?: string;
      onboardingCompleted?: boolean;
    },
  ) {
    const owner = await this.worldOwnerService.updateOwner(body);
    const changedFields = Object.entries(body)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);

    if (changedFields.length > 0) {
      await this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'owner_profile_update',
        sourceSurface: 'world',
        sourceEntityType: 'world_owner_profile',
        sourceEntityId: owner.id,
        dedupeKey: `owner-profile:${owner.id}:${Date.now()}`,
        summaryText: `用户更新了自己的资料字段：${changedFields.join('、')}。`,
        payload: {
          changedFields,
          username: body.username,
          avatar: body.avatar,
          signature: body.signature,
          onboardingCompleted: body.onboardingCompleted,
        },
        occurredAt: new Date(),
      });
    }

    return owner;
  }

  @Patch('owner/api-key')
  setOwnerApiKey(@Body() body: { apiKey: string; apiBase?: string }) {
    return this.worldOwnerService.setOwnerApiKey(body.apiKey, body.apiBase);
  }

  @Patch('owner/chat-background')
  setOwnerChatBackground(@Body() body: { background: ChatBackgroundAsset }) {
    return this.worldOwnerService.setDefaultChatBackground(body.background);
  }

  @Delete('owner/chat-background')
  clearOwnerChatBackground() {
    return this.worldOwnerService.clearDefaultChatBackground();
  }

  @Delete('owner/api-key')
  clearOwnerApiKey() {
    return this.worldOwnerService.clearOwnerApiKey();
  }
}
// i18n-ignore-end
