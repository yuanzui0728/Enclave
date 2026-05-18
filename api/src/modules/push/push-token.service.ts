import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PushTokenEntity } from './push-token.entity';

const ALLOWED_PLATFORMS = new Set(['ios', 'android']);
const ALLOWED_ENVIRONMENTS = new Set(['production', 'development']);

export type RegisterPushTokenInput = {
  platform: string;
  token: string;
  bundleId: string;
  environment?: string | null;
  appVersion?: string | null;
  locale?: string | null;
};

@Injectable()
export class PushTokenService {
  constructor(
    @InjectRepository(PushTokenEntity)
    private readonly repo: Repository<PushTokenEntity>,
  ) {}

  async register(userId: string, input: RegisterPushTokenInput) {
    const platform = (input.platform ?? '').trim().toLowerCase();
    const token = (input.token ?? '').trim();
    const bundleId = (input.bundleId ?? '').trim();
    const environment = (input.environment ?? 'production').trim().toLowerCase();

    if (!ALLOWED_PLATFORMS.has(platform)) {
      throw new Error('platform must be one of: ios, android');
    }
    if (!token) {
      throw new Error('token is required');
    }
    if (!bundleId) {
      throw new Error('bundleId is required');
    }
    const normalizedEnv = ALLOWED_ENVIRONMENTS.has(environment)
      ? environment
      : 'production';

    const appVersion = input.appVersion?.trim() || null;
    const locale = input.locale?.trim() || null;

    // upsert by (platform, bundleId, token)：同一台设备的同一 build 只有一条
    const existing = await this.repo.findOne({
      where: { platform, bundleId, token },
    });

    if (existing) {
      existing.userId = userId;
      existing.environment = normalizedEnv;
      existing.appVersion = appVersion;
      existing.locale = locale;
      const saved = await this.repo.save(existing);
      return { id: saved.id, updated: true };
    }

    const created = this.repo.create({
      userId,
      platform,
      token,
      bundleId,
      environment: normalizedEnv,
      appVersion,
      locale,
    });
    const saved = await this.repo.save(created);
    return { id: saved.id, updated: false };
  }

  async unregister(userId: string, tokenId: string) {
    const tid = (tokenId ?? '').trim();
    if (!tid) {
      return { deleted: false };
    }

    const result = await this.repo.delete({ id: tid, userId });
    return { deleted: (result.affected ?? 0) > 0 };
  }

  async listByUser(userId: string) {
    return this.repo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }
}
