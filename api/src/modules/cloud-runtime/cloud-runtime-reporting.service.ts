import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { MessageEntity } from '../chat/message.entity';
// Wiki contribution events 由独立的 wiki-app 进程上报，world child 不再依赖 wiki entity。
// 2026-05-20 wiki 拆库后，cloud-runtime 这里若还 inject CharacterRevisionEntity / EditSubmissionEntity
// 会因为 DataSource 不再注册这两个 entity，repository.find() 抛 EntityMetadataNotFoundError，
// 直接把新注册用户的 world child 启动早期崩出 code=1。

type RuntimeReportPayload = {
  apiBaseUrl?: string | null;
  adminUrl?: string | null;
  runtimeVersion?: string | null;
  healthStatus?: string | null;
  healthMessage?: string | null;
  reportedAt?: string | null;
  lastInteractiveAt?: string | null;
  lastUserMessageAt?: string | null;
};

type RevenueUsageEventPayload = {
  sourceEventId: string;
  eventType:
    | 'character_chat_message'
    | 'character_voice_turn'
    | 'character_video_turn'
    | 'character_content_use'
    | 'character_logic_run';
  characterId: string;
  characterName?: string | null;
  quantity?: number;
  occurredAt?: string | null;
  metadata?: Record<string, unknown> | null;
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
    @InjectRepository(AiUsageLedgerEntity)
    private readonly usageLedgerRepo: Repository<AiUsageLedgerEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(GroupMessageEntity)
    private readonly groupMessageRepo: Repository<GroupMessageEntity>,
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
      const [latestInteractiveAt, latestUserMessageAt] = await Promise.all([
        this.resolveLatestInteractiveAt(),
        this.resolveLatestUserMessageAt(),
      ]);
      const reportedAt = new Date().toISOString();
      const lastInteractiveIso = latestInteractiveAt?.toISOString() ?? null;
      const lastUserMessageIso = latestUserMessageAt?.toISOString() ?? null;

      const basePayload: RuntimeReportPayload = {
        apiBaseUrl: config.publicApiBaseUrl,
        runtimeVersion: config.runtimeVersion,
        healthStatus: 'healthy',
        healthMessage: 'World runtime heartbeat is healthy.',
        reportedAt,
        lastInteractiveAt: lastInteractiveIso,
        lastUserMessageAt: lastUserMessageIso,
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

      await this.reportRevenueEvents(config);
    } finally {
      this.reporting = false;
    }
  }

  private async reportRevenueEvents(config: ReportingConfig) {
    const usageEvents = await this.buildUsageRevenueEvents();
    // cloud-api 单批最多 100 条（ReportRevenueUsageEventsDto.events @ArrayMaxSize(100)）。
    const MAX_EVENTS_PER_BATCH = 100;
    for (let i = 0; i < usageEvents.length; i += MAX_EVENTS_PER_BATCH) {
      const chunk = usageEvents.slice(i, i + MAX_EVENTS_PER_BATCH);
      await this.postRevenueSignal(config, 'usage-events', { events: chunk });
    }
  }

  private async buildUsageRevenueEvents(): Promise<RevenueUsageEventPayload[]> {
    const records = await this.usageLedgerRepo.find({
      where: { status: 'success' },
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
      take: 100,
    });

    return records
      .filter((record) => Boolean(record.characterId))
      .map((record) => ({
        sourceEventId: `ai_usage:${record.id}`,
        eventType: this.resolveUsageRevenueEventType(record.scene),
        characterId: record.characterId as string,
        characterName: record.characterName ?? null,
        quantity: 1,
        occurredAt: record.occurredAt.toISOString(),
        metadata: {
          scene: record.scene,
          surface: record.surface,
          scopeType: record.scopeType,
          scopeId: record.scopeId ?? null,
          conversationId: record.conversationId ?? null,
          groupId: record.groupId ?? null,
          model: record.model ?? null,
          providerKey: record.providerKey ?? null,
          totalTokens: record.totalTokens ?? null,
          estimatedCost: record.estimatedCost ?? null,
          currency: record.currency,
        },
      }));
  }

  private resolveUsageRevenueEventType(scene: string): RevenueUsageEventPayload['eventType'] {
    const normalized = scene.toLowerCase();
    if (normalized.includes('voice')) return 'character_voice_turn';
    if (normalized.includes('video')) return 'character_video_turn';
    if (
      normalized.includes('moment') ||
      normalized.includes('feed') ||
      normalized.includes('channel') ||
      normalized.includes('post') ||
      normalized.includes('comment')
    ) {
      return 'character_content_use';
    }
    if (
      normalized.includes('factory') ||
      normalized.includes('memory') ||
      normalized.includes('extract') ||
      normalized.includes('plan') ||
      normalized.includes('runtime')
    ) {
      return 'character_logic_run';
    }
    return 'character_chat_message';
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

  private async resolveLatestUserMessageAt(): Promise<Date | null> {
    try {
      const [message, groupMessage] = await Promise.all([
        this.messageRepo.findOne({
          where: { senderType: 'user' },
          order: { createdAt: 'DESC' },
        }),
        this.groupMessageRepo.findOne({
          where: { senderType: 'user' },
          order: { createdAt: 'DESC' },
        }),
      ]);

      const candidates = [message?.createdAt, groupMessage?.createdAt].filter(
        (value): value is Date => Boolean(value),
      );

      if (!candidates.length) {
        return null;
      }

      return candidates.reduce((latest, current) =>
        current.getTime() > latest.getTime() ? current : latest,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to resolve latest user message: ${message}`);
      return null;
    }
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

  private async postRevenueSignal(
    config: ReportingConfig,
    action: 'usage-events',
    payload: {
      events: RevenueUsageEventPayload[];
    },
  ) {
    const response = await fetch(
      `${config.cloudPlatformBaseUrl}/internal/worlds/${config.worldId}/revenue/${action}`,
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
      this.logger.warn(`Failed to report revenue ${action} to cloud platform: ${message}`);
      return null;
    });

    if (!response) {
      return false;
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      this.logger.warn(
        `Cloud platform rejected revenue ${action} report with ${response.status}: ${responseText || 'no body'}`,
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
