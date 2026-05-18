// i18n-ignore-start: telemetry uplink — log strings only.
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { MinimaxRateLimitKind } from './minimax.client';

type Bucket = { calls: number; rpmLimited: number; quotaLimited: number };
type PushItem = {
  hour: string;
  calls: number;
  rpmLimited: number;
  quotaLimited: number;
};
type ReporterConfig = {
  cloudPlatformBaseUrl: string;
  worldId: string;
  callbackToken: string;
  intervalMs: number;
};

const DEFAULT_INTERVAL_MS = 60 * 1000;
const SHUTDOWN_FLUSH_TIMEOUT_MS = 5_000;

@Injectable()
export class MinimaxUsageReporterService
  implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(MinimaxUsageReporterService.name);
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const config = this.getConfig();
    if (!config) {
      return;
    }
    this.timer = setInterval(() => {
      void this.flush();
    }, config.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async onApplicationShutdown() {
    if (!this.getConfig()) return;
    const flush = this.flush().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Final flush failed: ${message}`);
    });
    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, SHUTDOWN_FLUSH_TIMEOUT_MS),
    );
    await Promise.race([flush, timeout]);
  }

  // 计数从不外抛：minimax 客户端调用栈对 telemetry 完全免疫。
  recordCall(kind: MinimaxRateLimitKind): void {
    try {
      const hour = currentHourBucket();
      const cur =
        this.buckets.get(hour) ?? { calls: 0, rpmLimited: 0, quotaLimited: 0 };
      cur.calls += 1;
      if (kind === 'rpm') cur.rpmLimited += 1;
      else if (kind === 'quota') cur.quotaLimited += 1;
      this.buckets.set(hour, cur);
    } catch {
      // never throw back into caller
    }
  }

  async flush(): Promise<void> {
    if (this.syncing) return;
    const config = this.getConfig();
    if (!config) return;
    if (this.buckets.size === 0) return;
    this.syncing = true;

    const snapshot: PushItem[] = [];
    for (const [hour, bucket] of this.buckets.entries()) {
      snapshot.push({
        hour,
        calls: bucket.calls,
        rpmLimited: bucket.rpmLimited,
        quotaLimited: bucket.quotaLimited,
      });
    }
    this.buckets.clear();

    try {
      const ok = await this.postOnce(config, snapshot);
      if (!ok) {
        this.restoreBuckets(snapshot);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Minimax usage push exception: ${message}`);
      this.restoreBuckets(snapshot);
    } finally {
      this.syncing = false;
    }
  }

  private restoreBuckets(snapshot: PushItem[]) {
    for (const item of snapshot) {
      const cur =
        this.buckets.get(item.hour) ?? {
          calls: 0,
          rpmLimited: 0,
          quotaLimited: 0,
        };
      cur.calls += item.calls;
      cur.rpmLimited += item.rpmLimited;
      cur.quotaLimited += item.quotaLimited;
      this.buckets.set(item.hour, cur);
    }
  }

  private async postOnce(
    config: ReporterConfig,
    buckets: PushItem[],
  ): Promise<boolean> {
    const body = { worldId: config.worldId, buckets };
    const response = await fetch(
      `${config.cloudPlatformBaseUrl}/internal/cloud/minimax-usage/hourly`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-world-callback-token': config.callbackToken,
        },
        body: JSON.stringify(body),
      },
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Minimax usage push request error: ${message}`);
      return null;
    });
    if (!response) return false;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `Minimax usage push rejected with ${response.status}: ${text || 'no body'}`,
      );
      return false;
    }
    return true;
  }

  private getConfig(): ReporterConfig | null {
    const cloudPlatformBaseUrl = trimTrailingSlash(
      this.configService.get<string>('CLOUD_PLATFORM_BASE_URL'),
    );
    const worldId = trimToNull(
      this.configService.get<string>('CLOUD_WORLD_ID'),
    );
    const callbackToken = trimToNull(
      this.configService.get<string>('CLOUD_WORLD_CALLBACK_TOKEN'),
    );
    if (!cloudPlatformBaseUrl || !worldId || !callbackToken) {
      return null;
    }
    return {
      cloudPlatformBaseUrl,
      worldId,
      callbackToken,
      intervalMs: parsePositiveInteger(
        this.configService.get<string>('CLOUD_MINIMAX_USAGE_SYNC_INTERVAL_MS'),
        DEFAULT_INTERVAL_MS,
      ),
    };
  }
}

function currentHourBucket(): string {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  return now.toISOString();
}

function trimToNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function trimTrailingSlash(value: string | undefined | null): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

function parsePositiveInteger(
  rawValue: string | undefined,
  fallback: number,
): number {
  const parsed = Number(rawValue ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
// i18n-ignore-end
