import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
  PushTokenService,
  type RegisterPushTokenInput,
} from './push-token.service';

type RegisterPushTokenBody = {
  platform?: string;
  token?: string;
  bundleId?: string;
  environment?: string | null;
  appVersion?: string | null;
  locale?: string | null;
};

@Controller('push/tokens')
export class PushTokenController {
  constructor(
    private readonly service: PushTokenService,
    private readonly worldOwnerService: WorldOwnerService,
  ) {}

  @Post()
  async register(@Body() body: RegisterPushTokenBody) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();

    const input: RegisterPushTokenInput = {
      platform: body.platform ?? '',
      token: body.token ?? '',
      bundleId: body.bundleId ?? '',
      environment: body.environment ?? null,
      appVersion: body.appVersion ?? null,
      locale: body.locale ?? null,
    };

    try {
      const result = await this.service.register(owner.id, input);
      return { ok: true, tokenId: result.id, updated: result.updated };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'failed to register push token',
      );
    }
  }

  @Delete(':tokenId')
  async unregister(@Param('tokenId') tokenId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const result = await this.service.unregister(owner.id, tokenId);
    return { ok: true, deleted: result.deleted };
  }

  @Get()
  async list() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const tokens = await this.service.listByUser(owner.id);
    return {
      ok: true,
      tokens: tokens.map((row) => ({
        id: row.id,
        platform: row.platform,
        bundleId: row.bundleId,
        environment: row.environment,
        appVersion: row.appVersion,
        locale: row.locale,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }
}
