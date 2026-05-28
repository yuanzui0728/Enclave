import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';
import { SystemConfigService } from '../config/config.service';

const PLATFORM_DEFAULTS_CONFIG_KEY = 'token_usage_platform_defaults';

export type TokenUsagePlatformDefaultsSnapshot = {
  worldId: string;
  fetchedAt: string;
  budget: {
    global: PlatformBudgetItem | null;
    world: PlatformBudgetItem | null;
    resolved: PlatformBudgetItem | null;
  };
  pricing: PlatformPricingCatalog | null;
};

type PlatformBudgetItem = {
  worldId: string | null;
  enabled: boolean;
  metric: 'tokens' | 'cost';
  enforcement: 'monitor' | 'downgrade' | 'block';
  downgradeModel: string | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  warningRatio: number;
  note: string | null;
  updatedAt: string;
};

type PlatformPricingCatalog = {
  currency: 'CNY' | 'USD';
  items: Array<{
    model: string;
    inputPer1kTokens: number;
    outputPer1kTokens: number;
    enabled: boolean;
    note?: string;
  }>;
};

type LedgerOverview = {
  currency: 'CNY' | 'USD';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  requestCount: number;
  successCount: number;
  failedCount: number;
  activeCharacterCount: number;
};

type LedgerBreakdownItem = {
  key: string;
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  requestCount: number;
  successCount: number;
  failedCount: number;
};

type LedgerBreakdownResponse = {
  currency: 'CNY' | 'USD';
  byCharacter: LedgerBreakdownItem[];
  byConversation: LedgerBreakdownItem[];
  byScene: LedgerBreakdownItem[];
  byModel: LedgerBreakdownItem[];
  byBillingSource: LedgerBreakdownItem[];
};

type DailyPushItem = {
  dimension:
    | 'character'
    | 'conversation'
    | 'scene'
    | 'model'
    | 'billingSource';
  key: string;
  label?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  requestCount: number;
  successCount: number;
  failedCount: number;
};

type DailyPushPayload = {
  worldId: string;
  bucketDate: string;
  overview: LedgerOverview;
  breakdowns: DailyPushItem[];
};

type SyncConfig = {
  cloudPlatformBaseUrl: string;
  worldId: string;
  callbackToken: string;
  intervalMs: number;
};

// Default to 5min so cloud-console reflects each running world within a tight
// freshness window. Override via CLOUD_TOKEN_USAGE_SYNC_INTERVAL_MS if a
// deployment wants the historical 60min cadence.
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const SHUTDOWN_FLUSH_TIMEOUT_MS = 5_000;

// NOTE: 共享 world 多租户 cutover 后，daily-push（getConfig 需 LPP 注入的
// CLOUD_WORLD_ID/CALLBACK_TOKEN）在共享单进程下永远拿不到配置 → runSync 的推送半边
// 是 no-op。平台 token 统计改由 cloud-api 主动拉取（apps/cloud-api 的
// TokenUsagePullService）。本服务仍保留：pullPlatformDefaults + 三个 admin 端点
// （cloud-sync/run、platform-defaults、platform-defaults/apply）仍在用。
@Injectable()
export class CloudTokenUsageSyncService
  implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(CloudTokenUsageSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly usageLedger: AiUsageLedgerService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  static readonly PLATFORM_DEFAULTS_CONFIG_KEY = PLATFORM_DEFAULTS_CONFIG_KEY;

  onModuleInit() {
    const config = this.getConfig();
    if (!config) {
      return;
    }
    this.timer = setInterval(() => {
      void this.runSync();
    }, config.intervalMs);
    this.timer.unref?.();
    void this.runSync();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Best-effort final flush before the process exits (covers world suspend
   * and graceful shutdown). Bounded by SHUTDOWN_FLUSH_TIMEOUT_MS so a hung
   * cloud-api never blocks the world from exiting.
   */
  async onApplicationShutdown() {
    const config = this.getConfig();
    if (!config) return;
    const flush = this.runSync().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Final flush failed: ${message}`);
    });
    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, SHUTDOWN_FLUSH_TIMEOUT_MS),
    );
    await Promise.race([flush, timeout]);
  }

  async runSync(): Promise<void> {
    if (this.syncing) {
      return;
    }
    const config = this.getConfig();
    if (!config) {
      return;
    }
    this.syncing = true;
    try {
      const today = isoDate(new Date());
      const yesterday = isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
      await this.syncBucket(config, yesterday);
      await this.syncBucket(config, today);
      await this.pullPlatformDefaults(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Token usage cloud sync failed: ${message}`);
    } finally {
      this.syncing = false;
    }
  }

  async getPlatformDefaultsSnapshot(): Promise<TokenUsagePlatformDefaultsSnapshot | null> {
    const raw = await this.systemConfig.getConfig(PLATFORM_DEFAULTS_CONFIG_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TokenUsagePlatformDefaultsSnapshot;
    } catch {
      return null;
    }
  }

  async applyPlatformDefaults(): Promise<{
    appliedBudget: boolean;
    appliedPricing: boolean;
  }> {
    const snapshot = await this.getPlatformDefaultsSnapshot();
    if (!snapshot) {
      return { appliedBudget: false, appliedPricing: false };
    }

    let appliedBudget = false;
    let appliedPricing = false;

    if (snapshot.budget.resolved) {
      const rule = snapshot.budget.resolved;
      await this.usageLedger.setBudgetConfig({
        overall: {
          enabled: rule.enabled,
          metric: rule.metric,
          enforcement: rule.enforcement,
          downgradeModel: rule.downgradeModel,
          dailyLimit: rule.dailyLimit,
          monthlyLimit: rule.monthlyLimit,
          warningRatio: rule.warningRatio,
        },
        characters: [],
      });
      appliedBudget = true;
    }

    if (snapshot.pricing && snapshot.pricing.items.length > 0) {
      await this.usageLedger.setPricingCatalog(snapshot.pricing);
      appliedPricing = true;
    }

    return { appliedBudget, appliedPricing };
  }

  private async pullPlatformDefaults(config: SyncConfig) {
    try {
      const url = `${config.cloudPlatformBaseUrl}/internal/cloud/token-usage/config?worldId=${encodeURIComponent(config.worldId)}`;
      const response = await fetch(url, {
        headers: {
          'x-world-callback-token': config.callbackToken,
        },
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Token usage config pull request error: ${message}`);
        return null;
      });

      if (!response || !response.ok) {
        if (response) {
          const body = await response.text().catch(() => '');
          this.logger.warn(
            `Token usage config pull rejected with ${response.status}: ${body || 'no body'}`,
          );
        }
        return;
      }

      const body = (await response.json()) as {
        worldId: string;
        budget: TokenUsagePlatformDefaultsSnapshot['budget'];
        pricing: TokenUsagePlatformDefaultsSnapshot['pricing'];
        generatedAt: string;
      };

      const snapshot: TokenUsagePlatformDefaultsSnapshot = {
        worldId: body.worldId,
        fetchedAt: new Date().toISOString(),
        budget: body.budget,
        pricing: body.pricing,
      };
      await this.systemConfig.setConfig(
        PLATFORM_DEFAULTS_CONFIG_KEY,
        JSON.stringify(snapshot),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Token usage config persist failed: ${message}`);
    }
  }

  private async syncBucket(config: SyncConfig, bucketDate: string) {
    const range = bucketRange(bucketDate);
    const overview = (await this.usageLedger.getOverview({
      from: range.from,
      to: range.to,
    })) as LedgerOverview;

    if (overview.requestCount === 0) {
      return;
    }

    const breakdown = (await this.usageLedger.getBreakdown({
      from: range.from,
      to: range.to,
    })) as LedgerBreakdownResponse;

    const breakdowns = flattenBreakdown(breakdown);
    const payload: DailyPushPayload = {
      worldId: config.worldId,
      bucketDate,
      overview,
      breakdowns,
    };

    await this.postWithRetry(config, payload);
  }

  private async postWithRetry(
    config: SyncConfig,
    payload: DailyPushPayload,
  ) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const ok = await this.postOnce(config, payload);
      if (ok) {
        return;
      }
      if (attempt < maxAttempts) {
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
    this.logger.warn(
      `Token usage daily push failed after ${maxAttempts} attempts for ${payload.bucketDate}.`,
    );
  }

  private async postOnce(
    config: SyncConfig,
    payload: DailyPushPayload,
  ): Promise<boolean> {
    const response = await fetch(
      `${config.cloudPlatformBaseUrl}/internal/cloud/token-usage/daily`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-world-callback-token': config.callbackToken,
        },
        body: JSON.stringify(payload),
      },
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Token usage push request error: ${message}`);
      return null;
    });

    if (!response) {
      return false;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(
        `Token usage push rejected with ${response.status}: ${body || 'no body'}`,
      );
      return false;
    }
    return true;
  }

  private getConfig(): SyncConfig | null {
    const cloudPlatformBaseUrl = trimTrailingSlash(
      this.configService.get<string>('CLOUD_PLATFORM_BASE_URL'),
    );
    const worldId = trimToNull(this.configService.get<string>('CLOUD_WORLD_ID'));
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
        this.configService.get<string>('CLOUD_TOKEN_USAGE_SYNC_INTERVAL_MS'),
        DEFAULT_INTERVAL_MS,
      ),
    };
  }
}

function flattenBreakdown(
  breakdown: LedgerBreakdownResponse,
): DailyPushItem[] {
  const out: DailyPushItem[] = [];
  pushDimension(out, 'character', breakdown.byCharacter);
  pushDimension(out, 'conversation', breakdown.byConversation);
  pushDimension(out, 'scene', breakdown.byScene);
  pushDimension(out, 'model', breakdown.byModel);
  pushDimension(out, 'billingSource', breakdown.byBillingSource);
  return out;
}

function pushDimension(
  bucket: DailyPushItem[],
  dimension: DailyPushItem['dimension'],
  items: LedgerBreakdownItem[] | undefined,
) {
  if (!items) return;
  for (const item of items) {
    bucket.push({
      dimension,
      key: item.key,
      label: item.label,
      promptTokens: item.promptTokens,
      completionTokens: item.completionTokens,
      totalTokens: item.totalTokens,
      estimatedCost: item.estimatedCost,
      requestCount: item.requestCount,
      successCount: item.successCount,
      failedCount: item.failedCount,
    });
  }
}

function bucketRange(bucketDate: string) {
  return {
    from: `${bucketDate}T00:00:00.000Z`,
    to: `${bucketDate}T23:59:59.999Z`,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function trimToNull(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function trimTrailingSlash(value: string | undefined | null) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, '');
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number) {
  const parsed = Number(rawValue ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
