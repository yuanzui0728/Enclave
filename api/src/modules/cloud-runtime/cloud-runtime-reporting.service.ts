import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { MessageEntity } from '../chat/message.entity';
import { CharacterRevisionEntity } from '../wiki/entities/character-revision.entity';
import { EditSubmissionEntity } from '../wiki/entities/edit-submission.entity';

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

type RevenueContributionEventPayload = {
  sourceEventId: string;
  eventType:
    | 'character_create'
    | 'character_content_edit_approved'
    | 'character_logic_edit_approved'
    | 'character_review_approved'
    | 'character_patrol'
    | 'character_logic_publish';
  characterId: string;
  contributorExternalRefType: 'wiki_user';
  contributorExternalRefId: string;
  occurredAt?: string | null;
  reversedAt?: string | null;
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
    @InjectRepository(CharacterRevisionEntity)
    private readonly characterRevisionRepo: Repository<CharacterRevisionEntity>,
    @InjectRepository(EditSubmissionEntity)
    private readonly editSubmissionRepo: Repository<EditSubmissionEntity>,
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
    const [usageEvents, contributionEvents] = await Promise.all([
      this.buildUsageRevenueEvents(),
      this.buildContributionRevenueEvents(),
    ]);

    // cloud-api 单批最多 100 条（ReportRevenueUsageEventsDto.events @ArrayMaxSize(100)）。
    // contribution-events 一条 revision 会展开 1-3 个事件（editor + 可能的 logic_publish +
    // 可能的 reviewer），100 个 revision 能轻松冲到 ~300，会被云端 400 拒掉整批。
    // 这里强制分批，每批不超 100。
    const MAX_EVENTS_PER_BATCH = 100;
    for (let i = 0; i < usageEvents.length; i += MAX_EVENTS_PER_BATCH) {
      const chunk = usageEvents.slice(i, i + MAX_EVENTS_PER_BATCH);
      await this.postRevenueSignal(config, 'usage-events', { events: chunk });
    }
    for (let i = 0; i < contributionEvents.length; i += MAX_EVENTS_PER_BATCH) {
      const chunk = contributionEvents.slice(i, i + MAX_EVENTS_PER_BATCH);
      await this.postRevenueSignal(config, 'contribution-events', {
        events: chunk,
      });
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

  private async buildContributionRevenueEvents(): Promise<
    RevenueContributionEventPayload[]
  > {
    const revisions = await this.characterRevisionRepo.find({
      where: { status: In(['approved', 'reverted']) },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const revisionIds = revisions.map((revision) => revision.id);
    const submissions = revisionIds.length
      ? await this.editSubmissionRepo.find({
          where: { revisionId: In(revisionIds) },
        })
      : [];
    const submissionByRevisionId = new Map(
      submissions.map((submission) => [submission.revisionId, submission]),
    );
    const events: RevenueContributionEventPayload[] = [];

    for (const revision of revisions) {
      const reversedAt =
        revision.status === 'reverted' ? new Date().toISOString() : null;
      const editorEventType =
        revision.operation === 'create'
          ? 'character_create'
          : revision.revisionKind === 'recipe'
            ? 'character_logic_edit_approved'
            : 'character_content_edit_approved';
      events.push({
        sourceEventId: `wiki_revision:${revision.id}:editor`,
        eventType: editorEventType,
        characterId: revision.characterId,
        contributorExternalRefType: 'wiki_user',
        contributorExternalRefId: revision.editorUserId,
        occurredAt: revision.createdAt.toISOString(),
        reversedAt,
        metadata: {
          revisionId: revision.id,
          version: revision.version,
          operation: revision.operation,
          revisionKind: revision.revisionKind,
          editSummary: revision.editSummary,
        },
      });

      if (revision.revisionKind === 'recipe') {
        events.push({
          sourceEventId: `wiki_revision:${revision.id}:logic_publish`,
          eventType: 'character_logic_publish',
          characterId: revision.characterId,
          contributorExternalRefType: 'wiki_user',
          contributorExternalRefId: revision.editorUserId,
          occurredAt: revision.createdAt.toISOString(),
          reversedAt,
          metadata: {
            revisionId: revision.id,
            version: revision.version,
            operation: revision.operation,
          },
        });
      }

      const submission = submissionByRevisionId.get(revision.id);
      if (submission?.decision === 'approve' && submission.reviewerId) {
        events.push({
          sourceEventId: `wiki_revision:${revision.id}:reviewer`,
          eventType: 'character_review_approved',
          characterId: revision.characterId,
          contributorExternalRefType: 'wiki_user',
          contributorExternalRefId: submission.reviewerId,
          occurredAt:
            submission.decidedAt?.toISOString() ?? revision.createdAt.toISOString(),
          reversedAt,
          metadata: {
            revisionId: revision.id,
            submissionId: submission.id,
            riskLevel: submission.riskLevel,
          },
        });
      }

      if (revision.patrolledBy) {
        events.push({
          sourceEventId: `wiki_revision:${revision.id}:patrol`,
          eventType: 'character_patrol',
          characterId: revision.characterId,
          contributorExternalRefType: 'wiki_user',
          contributorExternalRefId: revision.patrolledBy,
          occurredAt:
            revision.patrolledAt?.toISOString() ?? revision.createdAt.toISOString(),
          reversedAt,
          metadata: {
            revisionId: revision.id,
            version: revision.version,
          },
        });
      }
    }

    return events;
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
    action: 'usage-events' | 'contribution-events',
    payload: {
      events: RevenueUsageEventPayload[] | RevenueContributionEventPayload[];
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
