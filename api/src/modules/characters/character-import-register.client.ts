// i18n-ignore-start: backend service, logs are operational (not user-facing UI).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isSharedWorldMode, TenantContextStore } from '../tenancy/tenant-context';
import type { UserEntity } from '../auth/user.entity';

/**
 * world 导入私有角色后，把 (sourceCharacterId, ownerPhone, localCharacterId) 上报到
 * cloud-api 登记表，作为「私有角色视频」跨-world 扇出的名单来源。复用 matchmaking-sync
 * 同款：CLOUD_API_BASE_URL + X-Service-Token + phone 解析。失败静默（撮合/视频未配
 * 或 world 无 phone 时不阻断导入），由 cloud-api 兜底 + 下次导入再登记。
 */
@Injectable()
export class CharacterImportRegisterClient {
  private readonly logger = new Logger(CharacterImportRegisterClient.name);

  constructor(private readonly config: ConfigService) {}

  async register(input: {
    sourceCharacterId: string;
    localCharacterId: string;
    owner: UserEntity;
  }): Promise<void> {
    const sourceCharacterId = input.sourceCharacterId.trim();
    if (!sourceCharacterId) return;
    const phone = this.resolveOwnerPhone(input.owner);
    const baseUrl = this.config.get<string>('CLOUD_API_BASE_URL')?.trim();
    const token = this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim();
    if (!phone || !baseUrl || !token) return; // 未配 / 无 phone：静默跳过

    let url: string;
    try {
      url = new URL('/cloud/internal/character-imports/register', baseUrl).toString();
    } catch {
      this.logger.warn(`Invalid CLOUD_API_BASE_URL: ${baseUrl}`);
      return;
    }
    // 登记是「谁导入了该角色」的唯一入口：扇出名单与唤醒拉取都基于它。一次失败就漏掉
    // 这个 owner（除非再次导入），故 3 次重试 + 退避，最大化命中。仍失败则静默放弃。
    const body = JSON.stringify({
      sourceCharacterId,
      ownerPhone: phone,
      localCharacterId: input.localCharacterId,
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
          body,
        });
        if (res.ok) return;
        this.logger.warn(
          `character import register HTTP ${res.status} (attempt ${attempt}, src=${sourceCharacterId})`,
        );
      } catch (err) {
        this.logger.warn(
          `character import register failed (attempt ${attempt}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }

  private resolveOwnerPhone(owner: UserEntity): string | null {
    if (isSharedWorldMode()) {
      return TenantContextStore.get()?.phone ?? owner.cloudPhone ?? null;
    }
    return this.config.get<string>('CLOUD_OWNER_PHONE')?.trim() || null;
  }
}
// i18n-ignore-end
