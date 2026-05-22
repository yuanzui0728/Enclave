// i18n-ignore-start: cloud-api uplink — log strings only.
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MinimaxQuotaService, todayInShanghai } from './minimax-quota.service';

const DEFAULT_PULL_INTERVAL_MS = 60 * 1000;
const REPORT_DEDUPE_TTL_MS = 5 * 60 * 1000;
// 走查 yuanzui0728 本次 R1：cloud-api uplink fetch 原版裸 fetch 无 timeout。
// cloud-api 进程挂 / 网络黑洞时 push/pull 永远 hang，外层 `void ...catch(...)`
// 因为没有 rejection 也永远不会触发，promise + open socket 累积。pull 由
// setInterval(60s) 触发，若每次都 hang，几小时累积大量未释放的 fetch 连接。
// 真实业务影响：撞墙信号断流，N-1 其他 world 各自烧 1 unit TTS HD / web-search
// 才学到当日耗尽。15s timeout 对内网 cloud-api 调用够宽（正常 <100ms），异
// 常时及时止损让 .catch 走得到。
const CLOUD_UPLINK_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type SyncConfig = {
  cloudPlatformBaseUrl: string;
  worldId: string;
  callbackToken: string;
  pullIntervalMs: number;
};

// 跨 world 共享"今日已耗尽"状态的网络层：
//   - 上报：MinimaxQuotaService 撞墙时通过 setExhaustedListener 触发 push
//   - 拉取：onModuleInit 启动定时器，每分钟 GET cloud-api，把其它 world
//     已经报过的 model 合并进本地内存 Set（addRemoteExhaustedToday）
// 配置缺失时（CLOUD_PLATFORM_BASE_URL / CLOUD_WORLD_ID / CLOUD_WORLD_CALLBACK_TOKEN
// 任一未配）整个服务降级为 no-op，行为与改造前一致。
@Injectable()
export class MinimaxQuotaCloudSyncService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MinimaxQuotaCloudSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  // 同一进程同一 model 短期内重复 push 去重：5 分钟窗口。
  // 防止某些雪崩场景下 listener 被反复触发（理论上 markExhaustedToday 已经
  // 做了"首次撞墙"判断，这里再加一道兜底）。
  private readonly recentReports = new Map<string, number>();
  // 走查 yuanzui0728 本次 R1：pullOnce 由 setInterval(60s) 触发，原版无 in-
  // flight 守卫。给 timeout 后正常情况下不会重叠，但 cloud-api 慢到 8-15s
  // 之间反复发生时仍可能 overlap；用 promise 守一下，让 pull 真正完成后才
  // 让下一次 tick 进入，避免 fetch 资源浪费。
  private pullInFlight: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly quota: MinimaxQuotaService,
  ) {}

  onModuleInit(): void {
    const cfg = this.getConfig();
    if (!cfg) {
      this.logger.log(
        'cloud-api uplink disabled (missing CLOUD_PLATFORM_BASE_URL / CLOUD_WORLD_ID / CLOUD_WORLD_CALLBACK_TOKEN)',
      );
      return;
    }
    this.quota.setExhaustedListener((model) => this.scheduleReport(model));
    // 启动立刻拉一次：刚 spawn 的 child 立即继承全 fleet "今日已耗尽" 状态。
    void this.pullOnce();
    this.timer = setInterval(() => {
      void this.pullOnce();
    }, cfg.pullIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // 由 quota.markExhaustedToday 通过 listener 调用，不抛回调用方。
  private scheduleReport(model: string): void {
    const cfg = this.getConfig();
    if (!cfg) return;
    const key = `${model}:${todayInShanghai()}`;
    const lastAt = this.recentReports.get(key) ?? 0;
    if (Date.now() - lastAt < REPORT_DEDUPE_TTL_MS) return;
    this.recentReports.set(key, Date.now());
    void this.pushOnce(cfg, model).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`exhaustion push exception model=${model}: ${message}`);
    });
  }

  private async pushOnce(cfg: SyncConfig, model: string): Promise<void> {
    const usageDate = todayInShanghai();
    const body = { worldId: cfg.worldId, model, usageDate };
    const response = await fetchWithTimeout(
      `${cfg.cloudPlatformBaseUrl}/internal/cloud/minimax-quota/exhausted`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-world-callback-token': cfg.callbackToken,
        },
        body: JSON.stringify(body),
      },
      CLOUD_UPLINK_TIMEOUT_MS,
    ).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = (err as Error)?.name === 'AbortError';
      this.logger.warn(
        `exhaustion push ${isTimeout ? 'timed out' : 'request error'} model=${model}: ${message}`,
      );
      return null;
    });
    if (!response) return;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `exhaustion push rejected status=${response.status} model=${model}: ${text || 'no body'}`,
      );
    }
  }

  async pullOnce(): Promise<void> {
    // in-flight 守卫：cloud-api 慢时 setInterval 下一 tick 不再重复打 fetch。
    if (this.pullInFlight) return this.pullInFlight;
    const job = this.pullOnceInner().finally(() => {
      this.pullInFlight = null;
    });
    this.pullInFlight = job;
    return job;
  }

  private async pullOnceInner(): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg) return;
    const usageDate = todayInShanghai();
    const url = `${cfg.cloudPlatformBaseUrl}/internal/cloud/minimax-quota/exhausted-today?worldId=${encodeURIComponent(cfg.worldId)}&date=${encodeURIComponent(usageDate)}`;
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: { 'x-world-callback-token': cfg.callbackToken },
      },
      CLOUD_UPLINK_TIMEOUT_MS,
    ).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = (err as Error)?.name === 'AbortError';
      this.logger.warn(
        `exhaustion pull ${isTimeout ? 'timed out' : 'request error'}: ${message}`,
      );
      return null;
    });
    if (!response) return;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `exhaustion pull rejected status=${response.status}: ${text || 'no body'}`,
      );
      return;
    }
    try {
      const body = (await response.json()) as {
        usageDate?: string;
        models?: unknown;
      };
      const models = Array.isArray(body?.models)
        ? body.models.filter((m): m is string => typeof m === 'string' && m.length > 0)
        : [];
      this.quota.addRemoteExhaustedToday(models);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`exhaustion pull parse error: ${message}`);
    }
  }

  private getConfig(): SyncConfig | null {
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
      pullIntervalMs: parsePositiveInteger(
        this.configService.get<string>('CLOUD_MINIMAX_QUOTA_PULL_INTERVAL_MS'),
        DEFAULT_PULL_INTERVAL_MS,
      ),
    };
  }
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
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Number(raw ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
// i18n-ignore-end
