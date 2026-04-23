import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CyberAvatarProfileEntity } from './cyber-avatar-profile.entity';
import { CyberAvatarSignalEntity } from './cyber-avatar-signal.entity';
import { CyberAvatarRunEntity } from './cyber-avatar-run.entity';
import {
  CYBER_AVATAR_DEEP_REFRESH_CRON,
  CYBER_AVATAR_INCREMENTAL_SCAN_CRON,
  createEmptyCyberAvatarAggregation,
  createEmptyCyberAvatarProfile,
} from './cyber-avatar.constants';
import { CyberAvatarRulesService } from './cyber-avatar-rules.service';
import type {
  CyberAvatarAggregationPayload,
  CyberAvatarLiveState,
  CyberAvatarProfilePayload,
  CyberAvatarPromptProjection,
  CyberAvatarPromptProjectionSection,
  CyberAvatarRunMode,
  CyberAvatarRunTrigger,
  CyberAvatarSignalInput,
  CyberAvatarStableCore,
} from './cyber-avatar.types';

const STOP_WORDS = new Set([
  '用户',
  '今天',
  '刚刚',
  '最近',
  '然后',
  '这个',
  '那个',
  '已经',
  '还是',
  '自己',
  '我们',
  '他们',
  '你们',
  '一个',
  '一种',
  '但是',
  '因为',
  '所以',
  '以及',
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
]);

function renderTemplate(
  template: string,
  variables: Record<string, string | undefined | null>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
  );
}

function normalizeStringList(value: unknown, limit = 6) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

function normalizeScore(value: unknown, fallback = 0.5) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

function safeDate(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function summarizeArray(title: string, items: string[]) {
  if (!items.length) {
    return `${title}：暂无。`;
  }

  return `${title}：${items.join('；')}`;
}

type NormalizedIncrementalOutput = {
  liveState: CyberAvatarLiveState;
  recentState: CyberAvatarProfilePayload['recentState'];
  stableCoreCandidate: CyberAvatarStableCore;
  confidence: CyberAvatarProfilePayload['confidence'];
  changeSummary: string[];
  shouldRefreshStableCore: boolean;
};

const DEFAULT_PROMPT_SECTION_LABELS: Record<
  CyberAvatarPromptProjectionSection,
  string
> = {
  coreInstruction: '核心约束',
  worldInteractionPrompt: '世界内互动',
  realWorldInteractionPrompt: '真实世界互动',
  proactivePrompt: '主动跟进',
  actionPlanningPrompt: '动作规划',
  memoryBlock: '赛博分身记忆',
};

@Injectable()
export class CyberAvatarService {
  private readonly logger = new Logger(CyberAvatarService.name);

  constructor(
    @InjectRepository(CyberAvatarProfileEntity)
    private readonly profileRepo: Repository<CyberAvatarProfileEntity>,
    @InjectRepository(CyberAvatarSignalEntity)
    private readonly signalRepo: Repository<CyberAvatarSignalEntity>,
    @InjectRepository(CyberAvatarRunEntity)
    private readonly runRepo: Repository<CyberAvatarRunEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly rulesService: CyberAvatarRulesService,
  ) {}

  @Cron(CYBER_AVATAR_INCREMENTAL_SCAN_CRON)
  async runIncrementalRefreshCron() {
    const rules = await this.rulesService.getRules();
    if (
      !rules.enabled ||
      !rules.captureEnabled ||
      !rules.incrementalUpdateEnabled ||
      rules.pauseAutoUpdates
    ) {
      return;
    }

    await this.runIncrementalRefresh({ trigger: 'scheduler' });
  }

  @Cron(CYBER_AVATAR_DEEP_REFRESH_CRON)
  async runDeepRefreshCron() {
    const rules = await this.rulesService.getRules();
    if (
      !rules.enabled ||
      !rules.deepRefreshEnabled ||
      !rules.captureEnabled ||
      rules.pauseAutoUpdates
    ) {
      return;
    }

    await this.runDeepRefresh({ trigger: 'scheduler' });
  }

  async captureSignal(input: CyberAvatarSignalInput) {
    const rules = await this.rulesService.getRules();
    if (!rules.enabled || !rules.captureEnabled) {
      return null;
    }

    if (!this.isSignalEnabled(input.signalType, rules.sourceToggles)) {
      return null;
    }

    const dedupeKey = input.dedupeKey?.trim();
    if (dedupeKey) {
      const existing = await this.signalRepo.findOne({
        where: { ownerId: input.ownerId, dedupeKey },
      });
      if (existing) {
        return existing;
      }
    }

    const entity = this.signalRepo.create({
      ownerId: input.ownerId,
      signalType: input.signalType,
      sourceSurface: input.sourceSurface,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      dedupeKey: dedupeKey ?? null,
      summaryText: input.summaryText.trim(),
      payload: input.payload ?? null,
      weight:
        input.weight ??
        rules.signalWeights[input.signalType] ??
        rules.signalWeights[input.sourceEntityType] ??
        1,
      status: 'pending',
      occurredAt: input.occurredAt ?? new Date(),
    });
    const saved = await this.signalRepo.save(entity);
    await this.refreshProfileCounters(input.ownerId);
    return saved;
  }

  async getOverview() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const [rules, profile, recentSignals, recentRuns] = await Promise.all([
      this.rulesService.getRules(),
      this.ensureProfile(owner.id),
      this.listSignalEntities({ limit: 12 }),
      this.listRunEntities({ limit: 12 }),
    ]);

    return {
      rules,
      profile: this.serializeProfile(profile),
      recentSignals: recentSignals.map((item) => this.serializeSignal(item)),
      recentRuns: recentRuns.map((item) => this.serializeRunSummary(item)),
    };
  }

  async getRules() {
    return this.rulesService.getRules();
  }

  async setRules(input: Parameters<CyberAvatarRulesService['setRules']>[0]) {
    return this.rulesService.setRules(input);
  }

  async getProfile() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.serializeProfile(await this.ensureProfile(owner.id));
  }

  async buildPromptContext(options?: {
    sections?: CyberAvatarPromptProjectionSection[];
    sectionLabels?: Partial<Record<CyberAvatarPromptProjectionSection, string>>;
  }) {
    try {
      const profile = await this.getProfile();
      if ((profile.signalCount ?? 0) <= 0) {
        return '';
      }

      const sections =
        options?.sections?.length &&
        options.sections.every((section) => typeof section === 'string')
          ? options.sections
          : ([
              'coreInstruction',
              'worldInteractionPrompt',
              'memoryBlock',
            ] satisfies CyberAvatarPromptProjectionSection[]);

      return sections
        .map((section) => {
          const value = profile.promptProjection[section]?.trim();
          if (!value) {
            return '';
          }

          const label =
            options?.sectionLabels?.[section] ??
            DEFAULT_PROMPT_SECTION_LABELS[section];
          return label ? `【${label}】\n${value}` : value;
        })
        .filter(Boolean)
        .join('\n\n');
    } catch {
      return '';
    }
  }

  async buildPromptSections(options?: {
    sections?: CyberAvatarPromptProjectionSection[];
    sectionLabels?: Partial<Record<CyberAvatarPromptProjectionSection, string>>;
    tagName?: string;
  }) {
    const content = await this.buildPromptContext(options);
    if (!content) {
      return [] as string[];
    }

    const tagName = options?.tagName?.trim() || 'owner_cyber_avatar_context';
    return [`<${tagName}>\n${content}\n</${tagName}>`];
  }

  async listSignals(options?: { limit?: number }) {
    const signals = await this.listSignalEntities(options);
    return signals.map((item) => this.serializeSignal(item));
  }

  async listRuns(options?: { limit?: number }) {
    const runs = await this.listRunEntities(options);
    return runs.map((item) => this.serializeRunSummary(item));
  }

  private async listSignalEntities(options?: { limit?: number }) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.signalRepo.find({
      where: { ownerId: owner.id },
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
      take: options?.limit ?? 50,
    });
  }

  private async listRunEntities(options?: { limit?: number }) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.runRepo.find({
      where: { ownerId: owner.id },
      order: { createdAt: 'DESC' },
      take: options?.limit ?? 50,
    });
  }

  async getRunDetail(runId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const run = await this.runRepo.findOne({
      where: { id: runId, ownerId: owner.id },
    });
    return run ? this.serializeRunDetail(run) : null;
  }

  async runIncrementalRefresh(options?: { trigger?: CyberAvatarRunTrigger }) {
    return this.executeRefresh({
      mode: 'incremental',
      trigger: options?.trigger ?? 'manual',
    });
  }

  async runDeepRefresh(options?: { trigger?: CyberAvatarRunTrigger }) {
    return this.executeRefresh({
      mode: 'deep_refresh',
      trigger: options?.trigger ?? 'manual',
    });
  }

  async runFullRebuild(options?: { trigger?: CyberAvatarRunTrigger }) {
    return this.executeRefresh({
      mode: 'full_rebuild',
      trigger: options?.trigger ?? 'manual',
    });
  }

  async reprojectProfile(options?: { trigger?: CyberAvatarRunTrigger }) {
    return this.executeRefresh({
      mode: 'projection_only',
      trigger: options?.trigger ?? 'manual',
    });
  }

  private async executeRefresh(input: {
    mode: CyberAvatarRunMode;
    trigger: CyberAvatarRunTrigger;
  }) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const rules = await this.rulesService.getRules();
    const profile = await this.ensureProfile(owner.id);
    const now = new Date();

    if (!rules.enabled) {
      return this.createSkippedRun(profile, input, 'disabled');
    }
    if (rules.pauseAutoUpdates && input.trigger === 'scheduler') {
      return this.createSkippedRun(profile, input, 'paused');
    }
    if (input.mode === 'incremental' && !rules.incrementalUpdateEnabled) {
      return this.createSkippedRun(profile, input, 'incremental_disabled');
    }
    if (
      (input.mode === 'deep_refresh' || input.mode === 'full_rebuild') &&
      !rules.deepRefreshEnabled
    ) {
      return this.createSkippedRun(profile, input, 'deep_refresh_disabled');
    }
    if (input.mode === 'projection_only' && !rules.projectionEnabled) {
      return this.createSkippedRun(profile, input, 'projection_disabled');
    }

    if (
      input.mode === 'incremental' &&
      input.trigger === 'scheduler' &&
      profile.lastBuiltAt &&
      now.getTime() - profile.lastBuiltAt.getTime() <
        rules.scheduling.minMinutesBetweenIncrementalRuns * 60 * 1000
    ) {
      return this.createSkippedRun(profile, input, 'cooldown');
    }

    const sourceSignals =
      input.mode === 'incremental'
        ? await this.signalRepo.find({
            where: { ownerId: owner.id, status: 'pending' },
            order: { occurredAt: 'ASC', createdAt: 'ASC' },
            take: rules.scheduling.maxSignalsPerIncrementalRun,
          })
        : await this.signalRepo.find({
            where: {
              ownerId: owner.id,
              occurredAt: MoreThanOrEqual(
                new Date(
                  Date.now() -
                    (input.mode === 'full_rebuild'
                      ? rules.scheduling.fullRebuildWindowDays
                      : rules.scheduling.stableCoreWindowDays) *
                      24 *
                      60 *
                      60 *
                      1000,
                ),
              ),
            },
            order: { occurredAt: 'ASC', createdAt: 'ASC' },
            take:
              input.mode === 'full_rebuild'
                ? 300
                : rules.scheduling.maxSignalsPerIncrementalRun * 4,
          });

    if (
      !sourceSignals.length ||
      (input.mode === 'incremental' &&
        input.trigger === 'scheduler' &&
        sourceSignals.length < rules.scheduling.minSignalsPerIncrementalRun)
    ) {
      return this.createSkippedRun(profile, input, 'insufficient_signals');
    }

    if (input.mode === 'incremental') {
      await this.signalRepo.update(
        sourceSignals.map((item) => item.id),
        {
          status: 'processing',
        },
      );
    }

    try {
      const currentPayload = this.readProfilePayload(profile);
      const aggregation = this.aggregateSignals(sourceSignals);
      const promptSnapshot: Record<string, unknown> = {};
      let nextPayload = currentPayload;
      let llmOutputPayload: Record<string, unknown> | null = null;

      if (input.mode === 'projection_only') {
        nextPayload = {
          ...currentPayload,
          promptProjection: this.buildPromptProjection(currentPayload, rules),
        };
        promptSnapshot.projectionTemplates = {
          ...rules.promptTemplates,
        } as Record<string, unknown>;
      } else if (input.mode === 'incremental') {
        const prompt = renderTemplate(
          rules.promptTemplates.incrementalDigestPrompt,
          {
            currentProfile: JSON.stringify(currentPayload, null, 2),
            aggregation: JSON.stringify(aggregation, null, 2),
          },
        );
        promptSnapshot.incrementalDigestPrompt = prompt;
        llmOutputPayload = await this.ai.generateJsonObject({
          prompt,
          usageContext: {
            surface: input.trigger === 'scheduler' ? 'scheduler' : 'admin',
            scene: 'cyber_avatar_incremental',
            scopeType: 'world',
            scopeId: owner.id,
            scopeLabel: owner.username?.trim() || 'world-owner',
            ownerId: owner.id,
          },
          maxTokens: 1200,
          temperature: 0.25,
          fallback: {},
        });
        nextPayload = this.mergeIncrementalPayload(
          currentPayload,
          aggregation,
          llmOutputPayload,
          rules,
        );
      } else {
        const prompt = renderTemplate(rules.promptTemplates.deepRefreshPrompt, {
          currentProfile: JSON.stringify(currentPayload, null, 2),
          aggregation: JSON.stringify(aggregation, null, 2),
        });
        promptSnapshot.deepRefreshPrompt = prompt;
        llmOutputPayload = await this.ai.generateJsonObject({
          prompt,
          usageContext: {
            surface: input.trigger === 'scheduler' ? 'scheduler' : 'admin',
            scene:
              input.mode === 'full_rebuild'
                ? 'cyber_avatar_full_rebuild'
                : 'cyber_avatar_deep_refresh',
            scopeType: 'world',
            scopeId: owner.id,
            scopeLabel: owner.username?.trim() || 'world-owner',
            ownerId: owner.id,
          },
          maxTokens: 1500,
          temperature: 0.2,
          fallback: {},
        });
        nextPayload = this.mergeDeepPayload(
          currentPayload,
          aggregation,
          llmOutputPayload,
          rules,
        );
      }

      const previousVersion = profile.version;
      const nextVersion = previousVersion + 1;
      const pendingSignalCount = await this.signalRepo.count({
        where: { ownerId: owner.id, status: 'pending' },
      });
      const totalSignalCount = await this.signalRepo.count({
        where: { ownerId: owner.id },
      });

      const persisted = await this.profileRepo.save({
        ...profile,
        status: 'ready',
        version: nextVersion,
        liveStatePayload: nextPayload.liveState,
        recentStatePayload: nextPayload.recentState,
        stableCorePayload: nextPayload.stableCore,
        confidencePayload: nextPayload.confidence,
        sourceCoveragePayload: nextPayload.sourceCoverage,
        promptProjectionPayload: nextPayload.promptProjection,
        signalCount: totalSignalCount,
        pendingSignalCount,
        lastSignalAt:
          sourceSignals[sourceSignals.length - 1]?.occurredAt ??
          profile.lastSignalAt ??
          now,
        lastBuiltAt:
          input.mode === 'projection_only' ? profile.lastBuiltAt : now,
        lastProjectedAt: now,
      });

      const run = await this.runRepo.save(
        this.runRepo.create({
          ownerId: owner.id,
          mode: input.mode,
          trigger: input.trigger,
          status: 'success',
          signalCount: sourceSignals.length,
          profileVersion: nextVersion,
          windowStartedAt: sourceSignals[0]?.occurredAt ?? null,
          windowEndedAt:
            sourceSignals[sourceSignals.length - 1]?.occurredAt ?? null,
          inputSnapshot: {
            signalIds: sourceSignals.map((item) => item.id),
            signalSummaries: sourceSignals.map((item) => item.summaryText),
          },
          aggregationPayload: aggregation,
          promptSnapshot,
          llmOutputPayload,
          mergeDiffPayload: this.buildMergeDiff(currentPayload, nextPayload),
        }),
      );

      if (input.mode === 'incremental' && sourceSignals.length) {
        await this.signalRepo.update(
          sourceSignals.map((item) => item.id),
          { status: 'merged' },
        );
      }

      await this.profileRepo.save({
        ...persisted,
        lastRunId: run.id,
        pendingSignalCount: await this.signalRepo.count({
          where: { ownerId: owner.id, status: 'pending' },
        }),
      });

      return this.serializeRunDetail(run);
    } catch (error) {
      this.logger.error('Cyber avatar refresh failed', error);
      if (input.mode === 'incremental' && sourceSignals.length) {
        await this.signalRepo.update(
          sourceSignals.map((item) => item.id),
          { status: 'failed' },
        );
      }
      const failedRun = await this.runRepo.save(
        this.runRepo.create({
          ownerId: owner.id,
          mode: input.mode,
          trigger: input.trigger,
          status: 'failed',
          signalCount: sourceSignals.length,
          profileVersion: profile.version,
          skipReason: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Unknown cyber avatar error',
        }),
      );
      await this.profileRepo.save({
        ...profile,
        status: 'error',
        lastRunId: failedRun.id,
      });
      return this.serializeRunDetail(failedRun);
    } finally {
      await this.refreshProfileCounters(owner.id);
    }
  }

  private isSignalEnabled(
    signalType: string,
    toggles: Awaited<
      ReturnType<CyberAvatarRulesService['getRules']>
    >['sourceToggles'],
  ) {
    switch (signalType) {
      case 'direct_message':
        return toggles.includeDirectMessages;
      case 'group_message':
        return toggles.includeGroupMessages;
      case 'moment_post':
        return toggles.includeMomentPosts;
      case 'feed_post':
        return toggles.includeFeedPosts;
      case 'channel_post':
        return toggles.includeChannelPosts;
      case 'feed_interaction':
        return toggles.includeFeedInteractions;
      case 'friendship_event':
        return toggles.includeFriendshipEvents;
      case 'owner_profile_update':
        return toggles.includeOwnerProfileUpdates;
      case 'search_activity':
        return toggles.includeSearchActivity;
      case 'favorite_action':
        return toggles.includeFavoriteActions;
      case 'real_world_action':
        return toggles.includeRealWorldActions;
      case 'location_update':
        return toggles.includeLocationUpdates;
      case 'real_world_item':
        return toggles.includeRealWorldItems;
      case 'real_world_brief':
        return toggles.includeRealWorldBriefs;
      default:
        return true;
    }
  }

  private async createSkippedRun(
    profile: CyberAvatarProfileEntity,
    input: { mode: CyberAvatarRunMode; trigger: CyberAvatarRunTrigger },
    reason: string,
  ) {
    const run = await this.runRepo.save(
      this.runRepo.create({
        ownerId: profile.ownerId,
        mode: input.mode,
        trigger: input.trigger,
        status: 'skipped',
        signalCount: 0,
        profileVersion: profile.version,
        skipReason: reason,
      }),
    );
    await this.profileRepo.save({
      ...profile,
      lastRunId: run.id,
    });
    return this.serializeRunDetail(run);
  }

  private async ensureProfile(ownerId: string) {
    const existing = await this.profileRepo.findOne({ where: { ownerId } });
    if (existing) {
      return existing;
    }

    const empty = createEmptyCyberAvatarProfile();
    return this.profileRepo.save(
      this.profileRepo.create({
        ownerId,
        status: 'draft',
        version: 0,
        liveStatePayload: empty.liveState,
        recentStatePayload: empty.recentState,
        stableCorePayload: empty.stableCore,
        confidencePayload: empty.confidence,
        sourceCoveragePayload: empty.sourceCoverage,
        promptProjectionPayload: empty.promptProjection,
        signalCount: 0,
        pendingSignalCount: 0,
      }),
    );
  }

  private readProfilePayload(
    entity: CyberAvatarProfileEntity,
  ): CyberAvatarProfilePayload {
    const empty = createEmptyCyberAvatarProfile();
    return {
      liveState: {
        ...empty.liveState,
        ...(entity.liveStatePayload ?? {}),
      } as CyberAvatarLiveState,
      recentState: {
        ...empty.recentState,
        ...(entity.recentStatePayload ?? {}),
      },
      stableCore: {
        ...empty.stableCore,
        ...(entity.stableCorePayload ?? {}),
      } as CyberAvatarStableCore,
      confidence: {
        ...empty.confidence,
        ...(entity.confidencePayload ?? {}),
      },
      sourceCoverage: {
        ...empty.sourceCoverage,
        ...(entity.sourceCoveragePayload ?? {}),
      },
      promptProjection: {
        ...empty.promptProjection,
        ...(entity.promptProjectionPayload ?? {}),
      } as CyberAvatarPromptProjection,
    };
  }

  private aggregateSignals(
    signals: CyberAvatarSignalEntity[],
  ): CyberAvatarAggregationPayload {
    if (!signals.length) {
      return createEmptyCyberAvatarAggregation();
    }

    const signalTypes: Record<string, number> = {};
    const surfaces: Record<string, number> = {};
    const keywords = new Map<string, number>();

    for (const signal of signals) {
      signalTypes[signal.signalType] =
        (signalTypes[signal.signalType] ?? 0) + 1;
      surfaces[signal.sourceSurface] =
        (surfaces[signal.sourceSurface] ?? 0) + 1;

      for (const keyword of this.extractKeywords(signal.summaryText)) {
        keywords.set(keyword, (keywords.get(keyword) ?? 0) + signal.weight);
      }
    }

    return {
      signalCount: signals.length,
      signalTypes,
      surfaces,
      topKeywords: [...keywords.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 12)
        .map(([key]) => key),
      summaries: signals.map((item) => item.summaryText).slice(-20),
      earliestOccurredAt: safeDate(signals[0]?.occurredAt),
      latestOccurredAt: safeDate(signals[signals.length - 1]?.occurredAt),
    };
  }

  private extractKeywords(text: string) {
    const matches =
      text.toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z0-9][a-z0-9_-]{2,}/g) ??
      [];
    return [...new Set(matches.filter((item) => !STOP_WORDS.has(item)))];
  }

  private mergeIncrementalPayload(
    current: CyberAvatarProfilePayload,
    aggregation: CyberAvatarAggregationPayload,
    raw: Record<string, unknown> | null,
    rules: Awaited<ReturnType<CyberAvatarRulesService['getRules']>>,
  ): CyberAvatarProfilePayload {
    const normalized = this.normalizeIncrementalOutput(raw, aggregation);
    const stableCoreChanged =
      normalized.shouldRefreshStableCore ||
      normalized.confidence.stableCore >=
        rules.mergeRules.stableCoreChangeThreshold;
    const next: CyberAvatarProfilePayload = {
      liveState: normalized.liveState,
      recentState: normalized.recentState,
      stableCore: stableCoreChanged
        ? this.mergeStableCore(
            current.stableCore,
            normalized.stableCoreCandidate,
          )
        : current.stableCore,
      confidence: normalized.confidence,
      sourceCoverage: {
        windowDays: rules.scheduling.recentWindowDays,
        signalCount: aggregation.signalCount,
        coveredSurfaces: Object.keys(aggregation.surfaces),
        missingSurfaces: this.buildMissingSurfaces(
          Object.keys(aggregation.surfaces),
        ),
      },
      promptProjection: current.promptProjection,
    };
    next.promptProjection = this.buildPromptProjection(next, rules);
    return next;
  }

  private mergeDeepPayload(
    current: CyberAvatarProfilePayload,
    aggregation: CyberAvatarAggregationPayload,
    raw: Record<string, unknown> | null,
    rules: Awaited<ReturnType<CyberAvatarRulesService['getRules']>>,
  ): CyberAvatarProfilePayload {
    const fallback = this.buildFallbackProfile(current, aggregation);
    const stableCore = this.normalizeStableCore(
      raw?.stableCore,
      fallback.stableCore,
    );
    const next: CyberAvatarProfilePayload = {
      liveState: this.normalizeLiveState(raw?.liveState, fallback.liveState),
      recentState: this.normalizeRecentState(
        raw?.recentState,
        fallback.recentState,
      ),
      stableCore,
      confidence: {
        liveState: normalizeScore(
          (raw?.confidence as Record<string, unknown> | undefined)?.liveState,
          fallback.confidence.liveState,
        ),
        recentState: normalizeScore(
          (raw?.confidence as Record<string, unknown> | undefined)?.recentState,
          fallback.confidence.recentState,
        ),
        stableCore: normalizeScore(
          (raw?.confidence as Record<string, unknown> | undefined)?.stableCore,
          fallback.confidence.stableCore,
        ),
      },
      sourceCoverage: {
        windowDays:
          aggregation.signalCount > rules.scheduling.stableCoreWindowDays
            ? rules.scheduling.fullRebuildWindowDays
            : rules.scheduling.stableCoreWindowDays,
        signalCount: aggregation.signalCount,
        coveredSurfaces: Object.keys(aggregation.surfaces),
        missingSurfaces: this.buildMissingSurfaces(
          Object.keys(aggregation.surfaces),
        ),
      },
      promptProjection: current.promptProjection,
    };
    next.promptProjection = this.buildPromptProjection(next, rules);
    return next;
  }

  private normalizeIncrementalOutput(
    raw: Record<string, unknown> | null,
    aggregation: CyberAvatarAggregationPayload,
  ): NormalizedIncrementalOutput {
    const fallback = this.buildFallbackProfile(
      createEmptyCyberAvatarProfile(),
      aggregation,
    );
    return {
      liveState: this.normalizeLiveState(raw?.liveState, fallback.liveState),
      recentState: this.normalizeRecentState(
        raw?.recentState,
        fallback.recentState,
      ),
      stableCoreCandidate: this.normalizeStableCore(
        raw?.stableCoreCandidate,
        fallback.stableCore,
      ),
      confidence: {
        liveState: normalizeScore(
          (raw?.confidence as Record<string, unknown> | undefined)?.liveState,
          fallback.confidence.liveState,
        ),
        recentState: normalizeScore(
          (raw?.confidence as Record<string, unknown> | undefined)?.recentState,
          fallback.confidence.recentState,
        ),
        stableCore: normalizeScore(
          (raw?.confidence as Record<string, unknown> | undefined)?.stableCore,
          0.45,
        ),
      },
      changeSummary: normalizeStringList(raw?.changeSummary, 8),
      shouldRefreshStableCore: Boolean(raw?.shouldRefreshStableCore),
    };
  }

  private normalizeLiveState(
    raw: unknown,
    fallback: CyberAvatarLiveState,
  ): CyberAvatarLiveState {
    const value = (raw ?? {}) as Record<string, unknown>;
    return {
      focus: this.pickList(normalizeStringList(value.focus, 5), fallback.focus),
      mood:
        typeof value.mood === 'string' && value.mood.trim()
          ? value.mood.trim()
          : fallback.mood,
      energy:
        typeof value.energy === 'string' && value.energy.trim()
          ? value.energy.trim()
          : fallback.energy,
      socialTemperature:
        typeof value.socialTemperature === 'string' &&
        value.socialTemperature.trim()
          ? value.socialTemperature.trim()
          : fallback.socialTemperature,
      activeTopics: this.pickList(
        normalizeStringList(value.activeTopics, 6),
        fallback.activeTopics,
      ),
      openLoops: this.pickList(
        normalizeStringList(value.openLoops, 6),
        fallback.openLoops,
      ),
    };
  }

  private normalizeRecentState(
    raw: unknown,
    fallback: CyberAvatarProfilePayload['recentState'],
  ): CyberAvatarProfilePayload['recentState'] {
    const value = (raw ?? {}) as Record<string, unknown>;
    return {
      recurringTopics: this.pickList(
        normalizeStringList(value.recurringTopics, 6),
        fallback.recurringTopics,
      ),
      recentGoals: this.pickList(
        normalizeStringList(value.recentGoals, 6),
        fallback.recentGoals,
      ),
      recentFriction: this.pickList(
        normalizeStringList(value.recentFriction, 6),
        fallback.recentFriction,
      ),
      recentPreferenceSignals: this.pickList(
        normalizeStringList(value.recentPreferenceSignals, 6),
        fallback.recentPreferenceSignals,
      ),
      recentRelationshipSignals: this.pickList(
        normalizeStringList(value.recentRelationshipSignals, 6),
        fallback.recentRelationshipSignals,
      ),
    };
  }

  private normalizeStableCore(
    raw: unknown,
    fallback: CyberAvatarStableCore,
  ): CyberAvatarStableCore {
    const value = (raw ?? {}) as Record<string, unknown>;
    return {
      identitySummary:
        typeof value.identitySummary === 'string' &&
        value.identitySummary.trim()
          ? value.identitySummary.trim()
          : fallback.identitySummary,
      communicationStyle: this.pickList(
        normalizeStringList(value.communicationStyle, 6),
        fallback.communicationStyle,
      ),
      decisionStyle: this.pickList(
        normalizeStringList(value.decisionStyle, 6),
        fallback.decisionStyle,
      ),
      preferenceModel: this.pickList(
        normalizeStringList(value.preferenceModel, 6),
        fallback.preferenceModel,
      ),
      socialPosture: this.pickList(
        normalizeStringList(value.socialPosture, 6),
        fallback.socialPosture,
      ),
      routinePatterns: this.pickList(
        normalizeStringList(value.routinePatterns, 6),
        fallback.routinePatterns,
      ),
      boundaries: this.pickList(
        normalizeStringList(value.boundaries, 6),
        fallback.boundaries,
      ),
      riskTolerance: this.pickList(
        normalizeStringList(value.riskTolerance, 6),
        fallback.riskTolerance,
      ),
    };
  }

  private mergeStableCore(
    current: CyberAvatarStableCore,
    candidate: CyberAvatarStableCore,
  ): CyberAvatarStableCore {
    return {
      identitySummary: candidate.identitySummary || current.identitySummary,
      communicationStyle:
        candidate.communicationStyle.length > 0
          ? candidate.communicationStyle
          : current.communicationStyle,
      decisionStyle:
        candidate.decisionStyle.length > 0
          ? candidate.decisionStyle
          : current.decisionStyle,
      preferenceModel:
        candidate.preferenceModel.length > 0
          ? candidate.preferenceModel
          : current.preferenceModel,
      socialPosture:
        candidate.socialPosture.length > 0
          ? candidate.socialPosture
          : current.socialPosture,
      routinePatterns:
        candidate.routinePatterns.length > 0
          ? candidate.routinePatterns
          : current.routinePatterns,
      boundaries:
        candidate.boundaries.length > 0
          ? candidate.boundaries
          : current.boundaries,
      riskTolerance:
        candidate.riskTolerance.length > 0
          ? candidate.riskTolerance
          : current.riskTolerance,
    };
  }

  private buildFallbackProfile(
    current: CyberAvatarProfilePayload,
    aggregation: CyberAvatarAggregationPayload,
  ): CyberAvatarProfilePayload {
    const focus = aggregation.topKeywords.slice(0, 5);
    const summaries = aggregation.summaries.slice(-6);
    const signalTypes = aggregation.signalTypes;
    const socialSignals =
      (signalTypes.direct_message ?? 0) +
      (signalTypes.group_message ?? 0) +
      (signalTypes.friendship_event ?? 0);
    const contentSignals =
      (signalTypes.moment_post ?? 0) +
      (signalTypes.feed_post ?? 0) +
      (signalTypes.channel_post ?? 0);
    const realWorldSignals =
      (signalTypes.real_world_item ?? 0) + (signalTypes.real_world_brief ?? 0);

    const liveState: CyberAvatarLiveState = {
      focus,
      mood:
        summaries.length > 0
          ? '最近在持续输出和表达，状态偏动态。'
          : current.liveState.mood,
      energy:
        aggregation.signalCount >= 8
          ? '近期动作密度较高。'
          : aggregation.signalCount >= 3
            ? '近期有稳定活动。'
            : current.liveState.energy,
      socialTemperature:
        socialSignals >= contentSignals
          ? '近期更偏向人与人互动。'
          : contentSignals > 0
            ? '近期更偏向公开表达。'
            : realWorldSignals > 0
              ? '近期开始持续吸收外部世界信息。'
              : current.liveState.socialTemperature,
      activeTopics: aggregation.topKeywords.slice(0, 6),
      openLoops: summaries.slice(-3),
    };

    const recentState = {
      recurringTopics: aggregation.topKeywords.slice(0, 6),
      recentGoals: summaries.slice(0, 3),
      recentFriction: summaries.slice(3, 6),
      recentPreferenceSignals: Object.keys(aggregation.surfaces).map(
        (surface) => `最近在 ${surface} 上有持续行为痕迹。`,
      ),
      recentRelationshipSignals:
        signalTypes.friendship_event && signalTypes.friendship_event > 0
          ? ['最近联系人关系有调整。']
          : [],
    };

    const stableCore: CyberAvatarStableCore = {
      identitySummary:
        current.stableCore.identitySummary ||
        '这是一个会通过聊天、公开表达和互动持续暴露真实偏好的用户。',
      communicationStyle:
        current.stableCore.communicationStyle.length > 0
          ? current.stableCore.communicationStyle
          : ['表达偏真实场景驱动', '会通过持续互动暴露关注重点'],
      decisionStyle:
        current.stableCore.decisionStyle.length > 0
          ? current.stableCore.decisionStyle
          : ['最近决策证据仍不足，需要继续观察'],
      preferenceModel:
        current.stableCore.preferenceModel.length > 0
          ? current.stableCore.preferenceModel
          : Object.keys(aggregation.surfaces).map(
              (surface) => `偏好在 ${surface} 产生或留下行为痕迹。`,
            ),
      socialPosture:
        current.stableCore.socialPosture.length > 0
          ? current.stableCore.socialPosture
          : ['社交姿态仍在从近期互动中持续收敛'],
      routinePatterns:
        current.stableCore.routinePatterns.length > 0
          ? current.stableCore.routinePatterns
          : ['时间模式仍需更多信号观察'],
      boundaries:
        current.stableCore.boundaries.length > 0
          ? current.stableCore.boundaries
          : ['高风险决策仍需先澄清再执行'],
      riskTolerance:
        current.stableCore.riskTolerance.length > 0
          ? current.stableCore.riskTolerance
          : ['风险偏好仍需更多长期行为样本判断'],
    };

    const next: CyberAvatarProfilePayload = {
      liveState,
      recentState,
      stableCore,
      confidence: {
        liveState:
          aggregation.signalCount > 0 ? 0.6 : current.confidence.liveState,
        recentState:
          aggregation.signalCount >= 3 ? 0.55 : current.confidence.recentState,
        stableCore:
          aggregation.signalCount >= 15 ? 0.55 : current.confidence.stableCore,
      },
      sourceCoverage: {
        windowDays: 0,
        signalCount: aggregation.signalCount,
        coveredSurfaces: Object.keys(aggregation.surfaces),
        missingSurfaces: this.buildMissingSurfaces(
          Object.keys(aggregation.surfaces),
        ),
      },
      promptProjection: current.promptProjection,
    };
    return next;
  }

  private buildMissingSurfaces(covered: string[]) {
    const expected = [
      'chat',
      'group',
      'moments',
      'feed',
      'channels',
      'social',
      'owner',
      'real_world',
    ];
    return expected.filter((item) => !covered.includes(item));
  }

  private buildPromptProjection(
    payload: CyberAvatarProfilePayload,
    rules: Awaited<ReturnType<CyberAvatarRulesService['getRules']>>,
  ): CyberAvatarPromptProjection {
    const stableCore = this.stringifySection(payload.stableCore);
    const recentState = this.stringifySection(payload.recentState);
    const liveState = this.stringifySection(payload.liveState);

    return {
      coreInstruction: renderTemplate(
        rules.promptTemplates.projectionCoreInstructionTemplate,
        { stableCore, recentState, liveState },
      ),
      worldInteractionPrompt: renderTemplate(
        rules.promptTemplates.projectionWorldInteractionTemplate,
        { stableCore, recentState, liveState },
      ),
      realWorldInteractionPrompt: renderTemplate(
        rules.promptTemplates.projectionRealWorldInteractionTemplate,
        { stableCore, recentState, liveState },
      ),
      proactivePrompt: renderTemplate(
        rules.promptTemplates.projectionProactiveTemplate,
        { stableCore, recentState, liveState },
      ),
      actionPlanningPrompt: renderTemplate(
        rules.promptTemplates.projectionActionPlanningTemplate,
        { stableCore, recentState, liveState },
      ),
      memoryBlock: renderTemplate(
        rules.promptTemplates.projectionMemoryTemplate,
        { stableCore, recentState, liveState },
      ),
    };
  }

  private stringifySection(value: Record<string, unknown>) {
    return Object.entries(value)
      .map(([key, item]) => {
        if (Array.isArray(item)) {
          return summarizeArray(key, normalizeStringList(item, 10));
        }
        return `${key}：${typeof item === 'string' ? item : JSON.stringify(item)}`;
      })
      .join('\n');
  }

  private buildMergeDiff(
    current: CyberAvatarProfilePayload,
    next: CyberAvatarProfilePayload,
  ) {
    return {
      liveStateChanged:
        JSON.stringify(current.liveState) !== JSON.stringify(next.liveState),
      recentStateChanged:
        JSON.stringify(current.recentState) !==
        JSON.stringify(next.recentState),
      stableCoreChanged:
        JSON.stringify(current.stableCore) !== JSON.stringify(next.stableCore),
      promptProjectionChanged:
        JSON.stringify(current.promptProjection) !==
        JSON.stringify(next.promptProjection),
      previousConfidence: current.confidence,
      nextConfidence: next.confidence,
    };
  }

  private async refreshProfileCounters(ownerId: string) {
    const profile = await this.ensureProfile(ownerId);
    const [signalCount, pendingSignalCount, latestSignal] = await Promise.all([
      this.signalRepo.count({ where: { ownerId } }),
      this.signalRepo.count({ where: { ownerId, status: 'pending' } }),
      this.signalRepo.findOne({
        where: { ownerId },
        order: { occurredAt: 'DESC', createdAt: 'DESC' },
      }),
    ]);

    await this.profileRepo.save({
      ...profile,
      signalCount,
      pendingSignalCount,
      lastSignalAt: latestSignal?.occurredAt ?? profile.lastSignalAt ?? null,
    });
  }

  private serializeProfile(entity: CyberAvatarProfileEntity) {
    const payload = this.readProfilePayload(entity);
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      status: entity.status,
      version: entity.version,
      liveState: payload.liveState,
      recentState: payload.recentState,
      stableCore: payload.stableCore,
      confidence: payload.confidence,
      sourceCoverage: payload.sourceCoverage,
      promptProjection: payload.promptProjection,
      signalCount: entity.signalCount,
      pendingSignalCount: entity.pendingSignalCount,
      lastSignalAt: safeDate(entity.lastSignalAt),
      lastBuiltAt: safeDate(entity.lastBuiltAt),
      lastProjectedAt: safeDate(entity.lastProjectedAt),
      lastRunId: entity.lastRunId ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private serializeSignal(entity: CyberAvatarSignalEntity) {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      signalType: entity.signalType,
      sourceSurface: entity.sourceSurface,
      sourceEntityType: entity.sourceEntityType,
      sourceEntityId: entity.sourceEntityId,
      summaryText: entity.summaryText,
      payload: entity.payload ?? null,
      weight: entity.weight,
      status: entity.status,
      occurredAt: entity.occurredAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private serializeRunSummary(entity: CyberAvatarRunEntity) {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      mode: entity.mode,
      trigger: entity.trigger,
      status: entity.status,
      signalCount: entity.signalCount,
      profileVersion: entity.profileVersion,
      skipReason: entity.skipReason ?? null,
      errorMessage: entity.errorMessage ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private serializeRunDetail(entity: CyberAvatarRunEntity) {
    return {
      ...this.serializeRunSummary(entity),
      windowStartedAt: safeDate(entity.windowStartedAt),
      windowEndedAt: safeDate(entity.windowEndedAt),
      inputSnapshot: entity.inputSnapshot ?? null,
      aggregationPayload: entity.aggregationPayload ?? null,
      promptSnapshot: entity.promptSnapshot ?? null,
      llmOutputPayload: entity.llmOutputPayload ?? null,
      mergeDiffPayload: entity.mergeDiffPayload ?? null,
    };
  }

  private pickList(value: string[], fallback: string[]) {
    return value.length > 0 ? value : fallback;
  }
}
