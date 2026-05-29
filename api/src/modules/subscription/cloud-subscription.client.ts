import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isSharedWorldMode,
  TenantContextStore,
} from '../tenancy/tenant-context';
import type {
  SubscriptionExpiredCopy,
  SubscriptionExpiredPlan,
} from './subscription-expired.exception';

export type CloudSubscriptionLookup = {
  status: 'active' | 'expired' | 'none';
  expiresAt: string | null;
  planCode: string | null;
  isTrial: boolean;
  hardBlockEnabled: boolean;
  copy: SubscriptionExpiredCopy;
  plans: SubscriptionExpiredPlan[];
};

// lookup 的三态结果——消费方据此决定 fail-closed 还是放行：
//   ok        命中订阅记录，按 value 判定
//   unmanaged cloud-api 400 拒绝（phone 格式非法/请求不合法）= 这串根本不是合法手机号，
//             不可能对应真实托管订阅 → 当作"本地/非托管"放行，而不是误当会员到期硬拦。
//             真实用户恒为合法数字号绝不 400；service token 配错返 401/403 不走这支。
//   transient 网络抖动 / 5xx / 401 / 403 / 429 等 = 状态未知 → 维持保守 fail-closed。
export type CloudSubscriptionLookupOutcome =
  | { kind: 'ok'; value: CloudSubscriptionLookup }
  | { kind: 'unmanaged' }
  | { kind: 'transient' };

@Injectable()
export class CloudSubscriptionClient {
  private readonly logger = new Logger(CloudSubscriptionClient.name);

  constructor(private readonly config: ConfigService) {}

  resolveOwnerPhone(): string | null {
    // shared 模式：phone 来自当前请求/cron 的租户上下文（一个进程服务多用户，CLOUD_OWNER_PHONE
    // env 已无意义）。LPP / wiki 模式：沿用 spawn 时注入的 CLOUD_OWNER_PHONE env。
    if (isSharedWorldMode()) {
      return TenantContextStore.get()?.phone ?? null;
    }
    return this.config.get<string>('CLOUD_OWNER_PHONE')?.trim() || null;
  }

  resolveCloudApiBaseUrl(): string | null {
    return this.config.get<string>('CLOUD_API_BASE_URL')?.trim() || null;
  }

  resolveServiceToken(): string | null {
    return this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim() || null;
  }

  async lookup(phone: string): Promise<CloudSubscriptionLookupOutcome> {
    const baseUrl = this.resolveCloudApiBaseUrl();
    const token = this.resolveServiceToken();
    if (!baseUrl || !token) {
      // 未配置 cloud-api 托管 = 本地/单机模式，放行（与 service 里 phone 为空一致）。
      return { kind: 'unmanaged' };
    }
    try {
      const url = new URL('/cloud/internal/subscription/lookup', baseUrl).toString();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': token,
        },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        // 400 = 请求被判非法（典型：phone 格式不正确）。这串不可能是真实托管订阅，
        // 当作非托管放行；其余非 2xx（401/403/429/5xx）状态未知 → 保守 fail-closed。
        if (res.status === 400) {
          this.logger.warn(
            `Cloud subscription lookup rejected as invalid (treated as unmanaged): phone=${phone}`,
          );
          return { kind: 'unmanaged' };
        }
        this.logger.warn(
          `Cloud subscription lookup failed: status=${res.status} phone=${phone}`,
        );
        return { kind: 'transient' };
      }
      return {
        kind: 'ok',
        value: (await res.json()) as CloudSubscriptionLookup,
      };
    } catch (error) {
      this.logger.warn(
        `Cloud subscription lookup error: ${(error as Error).message}`,
      );
      return { kind: 'transient' };
    }
  }
}
