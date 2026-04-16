import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';

type RuntimeReportPayload = {
  apiBaseUrl?: string | null;
  adminUrl?: string | null;
  runtimeVersion?: string | null;
  healthStatus?: string | null;
  healthMessage?: string | null;
  reportedAt?: string | null;
  lastInteractiveAt?: string | null;
};

type ReportingConfig = {
  cloudPlatformBaseUrl: string;
  worldId: string;
  callbackToken: string;
  publicApiBaseUrl: string;
  intervalMs: number;
  runtimeVersion: string;
};

@Injectable()
export class CloudRuntimeReportingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CloudRuntimeReportingService.name);
  private timer: NodeJS.Timeout | null = null;
  private bootstrapReported = false;
  private reporting = false;
  private lastReportedInteractiveAt: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
  ) {}

  onModuleInit() {
    const config = this.getReportingConfig();
    if (!config) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runReportCycle();
    }, config.intervalMs);
    this.timer.unref?.();
    void this.runReportCycle();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runReportCycle() {
    if (this.reporting) {
      return;
    }

    const config = this.getReportingConfig();
    if (!config) {
      return;
    }

    this.reporting = true;
    try {
      const latestInteractiveAt = await this.resolveLatestInteractiveAt();
      const reportedAt = new Date().toISOString();
      const lastInteractiveIso = latestInteractiveAt?.toISOString() ?? null;

      const basePayload: RuntimeReportPayload = {
        apiBaseUrl: config.publicApiBaseUrl,
        runtimeVersion: config.runtimeVersion,
        healthStatus: 'healthy',
        healthMessage: 'World runtime heartbeat is healthy.',
        reportedAt,
        lastInteractiveAt: lastInteractiveIso,
      };

      if (!this.bootstrapReported) {
        const bootstrapSucceeded = await this.postRuntimeSignal(config, 'bootstrap', {
          ...basePayload,
          adminUrl: null,
        });
        if (bootstrapSucceeded) {
          this.bootstrapReported = true;
        }
      }

      await this.postRuntimeSignal(config, 'heartbeat', basePayload);

      if (lastInteractiveIso && lastInteractiveIso !== this.lastReportedInteractiveAt) {
        const activitySucceeded = await this.postRuntimeSignal(config, 'activity', {
          reportedAt,
          lastInteractiveAt: lastInteractiveIso,
        });
        if (activitySucceeded) {
          this.lastReportedInteractiveAt = lastInteractiveIso;
        }
      }
    } finally {
      this.reporting = false;
    }
  }

  private async resolveLatestInteractiveAt() {
    const [conversation, group] = await Promise.all([
      this.conversationRepo.findOne({
        where: {},
        order: { lastActivityAt: 'DESC' },
      }),
      this.groupRepo.findOne({
        where: {},
        order: { lastActivityAt: 'DESC' },
      }),
    ]);

    const candidates = [conversation?.lastActivityAt, group?.lastActivityAt].filter(
      (value): value is Date => Boolean(value),
    );

    if (!candidates.length) {
      return null;
    }

    return candidates.reduce((latest, current) =>
      current.getTime() > latest.getTime() ? current : latest,
    );
  }

  private async postRuntimeSignal(
    config: ReportingConfig,
    action: 'bootstrap' | 'heartbeat' | 'activity',
    payload: RuntimeReportPayload,
  ) {
    const response = await fetch(
      `${config.cloudPlatformBaseUrl}/internal/worlds/${config.worldId}/${action}`,
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
      this.logger.warn(`Failed to report ${action} to cloud platform: ${message}`);
      return null;
    });

    if (!response) {
      return false;
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      this.logger.warn(
        `Cloud platform rejected ${action} report with ${response.status}: ${responseText || 'no body'}`,
      );
      return false;
    }

    return true;
  }

  private getReportingConfig(): ReportingConfig | null {
    const cloudPlatformBaseUrl = this.trimTrailingSlash(
      this.configService.get<string>('CLOUD_PLATFORM_BASE_URL'),
    );
    const worldId = this.trimToNull(this.configService.get<string>('CLOUD_WORLD_ID'));
    const callbackToken = this.trimToNull(
      this.configService.get<string>('CLOUD_WORLD_CALLBACK_TOKEN'),
    );
    const publicApiBaseUrl = this.trimTrailingSlash(
      this.configService.get<string>('PUBLIC_API_BASE_URL'),
    );

    if (!cloudPlatformBaseUrl || !worldId || !callbackToken || !publicApiBaseUrl) {
      return null;
    }

    return {
      cloudPlatformBaseUrl,
      worldId,
      callbackToken,
      publicApiBaseUrl,
      intervalMs: this.parsePositiveInteger(
        this.configService.get<string>('CLOUD_WORLD_HEARTBEAT_INTERVAL_MS'),
        30_000,
      ),
      runtimeVersion: process.env.npm_package_version?.trim() || '0.0.0',
    };
  }

  private parsePositiveInteger(rawValue: string | undefined, fallback: number) {
    const parsed = Number(rawValue ?? String(fallback));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }

  private trimToNull(value: string | undefined | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private trimTrailingSlash(value: string | undefined | null) {
    const trimmed = this.trimToNull(value);
    if (!trimmed) {
      return null;
    }

    return trimmed.replace(/\/+$/, '');
  }
}
