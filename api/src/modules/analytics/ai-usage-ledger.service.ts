import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, Repository } from 'typeorm';
import { AiUsageLedgerEntity } from './ai-usage-ledger.entity';
import { SystemConfigService } from '../config/config.service';
import { CharacterEntity } from '../characters/character.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { MessageEntity } from '../chat/message.entity';
import { AdminConversationReviewEntity } from '../admin/admin-conversation-review.entity';

type PricingCurrency = 'CNY' | 'USD';
type LedgerStatus = 'success' | 'failed';
type LedgerSurface = 'app' | 'admin' | 'scheduler' | 'system';
type LedgerBillingSource = 'owner_custom' | 'instance_default';
type LedgerScopeType =
  | 'character'
  | 'conversation'
  | 'group'
  | 'world'
  | 'admin_task';
type LedgerGrain = 'day' | 'week' | 'month';
type BudgetMetric = 'tokens' | 'cost';
type BudgetState = 'inactive' | 'normal' | 'warning' | 'exceeded';
type BudgetPeriod = 'daily' | 'monthly';
type BudgetEnforcement = 'monitor' | 'downgrade' | 'block';

type TokenPricingCatalogItem = {
  model: string;
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  enabled: boolean;
  note?: string;
};

type TokenPricingCatalog = {
  currency: PricingCurrency;
  items: TokenPricingCatalogItem[];
};

type TokenUsageBudgetRule = {
  enabled: boolean;
  metric: BudgetMetric;
  enforcement: BudgetEnforcement;
  downgradeModel: string | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  warningRatio: number;
};

type TokenUsageCharacterBudgetRule = TokenUsageBudgetRule & {
  characterId: string;
  note?: string;
};

type TokenUsageBudgetConfig = {
  overall: TokenUsageBudgetRule;
  characters: TokenUsageCharacterBudgetRule[];
};

type TokenUsageBudgetPeriodSummary = {
  period: BudgetPeriod;
  limit: number | null;
  used: number;
  remaining: number | null;
  ratio: number | null;
  state: BudgetState;
};

type TokenUsageBudgetStatus = {
  enabled: boolean;
  metric: BudgetMetric;
  enforcement: BudgetEnforcement;
  downgradeModel: string | null;
  warningRatio: number;
  daily: TokenUsageBudgetPeriodSummary;
  monthly: TokenUsageBudgetPeriodSummary;
};

type TokenUsageBudgetAlert = {
  level: 'warning' | 'exceeded';
  scope: 'overall' | 'character';
  characterId?: string | null;
  characterName?: string | null;
  period: BudgetPeriod;
  metric: BudgetMetric;
  used: number;
  limit: number;
  ratio: number;
  message: string;
};

type TokenUsageCharacterBudgetStatus = {
  characterId: string;
  characterName: string;
  note?: string;
  budget: TokenUsageBudgetStatus;
};

type TokenUsageBudgetSummary = {
  currency: PricingCurrency;
  generatedAt: string;
  overall: TokenUsageBudgetStatus;
  characters: TokenUsageCharacterBudgetStatus[];
  alerts: TokenUsageBudgetAlert[];
};

type TokenUsageBudgetSnapshot = {
  config: TokenUsageBudgetConfig;
  summary: TokenUsageBudgetSummary;
};

type UsageMetrics = {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  raw?: Record<string, unknown> | null;
};

type UsageAuditPayload = {
  budgetAction?: 'downgrade' | 'block';
  requestedModel?: string | null;
  appliedModel?: string | null;
  budgetScope?: 'overall' | 'character';
  budgetPeriod?: BudgetPeriod;
  budgetMetric?: BudgetMetric;
  budgetUsed?: number | null;
  budgetLimit?: number | null;
};

export type AiUsageRecordInput = {
  occurredAt?: Date;
  requestId?: string | null;
  status: LedgerStatus;
  surface: LedgerSurface;
  scene: string;
  scopeType: LedgerScopeType;
  scopeId?: string | null;
  scopeLabel?: string | null;
  ownerId?: string | null;
  characterId?: string | null;
  characterName?: string | null;
  conversationId?: string | null;
  groupId?: string | null;
  providerKey?: string | null;
  providerMode?: string | null;
  model?: string | null;
  apiStyle?: string | null;
  billingSource?: LedgerBillingSource | null;
  usage?: UsageMetrics | null;
  audit?: UsageAuditPayload | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

type TokenUsageQuery = {
  from?: string;
  to?: string;
  grain?: string;
  characterId?: string;
  conversationId?: string;
  groupId?: string;
  scene?: string;
  model?: string;
  billingSource?: string;
  status?: string;
  errorCode?: string;
  page?: number | string;
  pageSize?: number | string;
  limit?: number | string;
};

type NormalizedTokenUsageQuery = {
  from: Date;
  to: Date;
  grain: LedgerGrain;
  characterId?: string;
  conversationId?: string;
  groupId?: string;
  scene?: string;
  model?: string;
  billingSource?: LedgerBillingSource;
  status?: LedgerStatus;
  errorCode?: string;
  page: number;
  pageSize: number;
  limit: number;
};

type AggregateBucket = {
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

type BudgetUsageAggregate = {
  tokens: number;
  cost: number;
};

type BudgetUsageAccumulator = {
  daily: BudgetUsageAggregate;
  monthly: BudgetUsageAggregate;
};

type BudgetExecutionDecision = {
  action: 'block' | 'downgrade';
  scope: 'overall' | 'character';
  period: BudgetPeriod;
  metric: BudgetMetric;
  used: number;
  limit: number;
  characterId?: string;
  characterName?: string;
  downgradeModel?: string;
  message: string;
};

type DowngradeModelSwitchBucket = {
  key: string;
  requestedModel: string | null;
  appliedModel: string | null;
  requestCount: number;
  successCount: number;
  estimatedCost: number;
  estimatedOriginalCost: number;
  estimatedSavings: number;
};

type DowngradeReviewSample = {
  conversationId: string;
  occurredAt: string;
  reviewUpdatedAt: string;
  targetLabel: string;
  characterId?: string | null;
  characterName?: string | null;
  scene: string;
  reviewStatus: string;
  reviewTags: string[];
  reviewNote?: string | null;
};

type DowngradeCharacterQualityItem = {
  characterId?: string | null;
  characterName: string;
  requestCount: number;
  distinctConversationCount: number;
  reviewedConversationCount: number;
  acceptableConversationCount: number;
  tooWeakConversationCount: number;
  pendingOutcomeConversationCount: number;
  reviewCoverageRate: number | null;
  acceptableReviewRate: number | null;
  tooWeakReviewRate: number | null;
  tooWeakSamples: DowngradeReviewSample[];
  pendingOutcomeSamples: DowngradeReviewSample[];
};

const PRICING_CONFIG_KEY = 'token_pricing_catalog';
const BUDGET_CONFIG_KEY = 'token_budget_config';
const PRICING_CACHE_TTL_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const IMMEDIATE_CONTINUATION_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class AiUsageLedgerService {
  private pricingCache:
    | {
        expiresAt: number;
        value: TokenPricingCatalog;
      }
    | null = null;
  private budgetCache:
    | {
        expiresAt: number;
        value: TokenUsageBudgetConfig;
      }
    | null = null;

  constructor(
    @InjectRepository(AiUsageLedgerEntity)
    private readonly repo: Repository<AiUsageLedgerEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async record(input: AiUsageRecordInput) {
    const catalog = await this.getPricingCatalog();
    const pricing = this.findPricingItem(catalog, input.model);
    const promptTokens = this.normalizeInteger(input.usage?.promptTokens);
    const completionTokens = this.normalizeInteger(input.usage?.completionTokens);
    const totalTokens = this.normalizeInteger(
      input.usage?.totalTokens ??
        ((promptTokens ?? 0) || (completionTokens ?? 0)
          ? (promptTokens ?? 0) + (completionTokens ?? 0)
          : null),
    );
    const estimatedCost = this.roundCost(
      ((promptTokens ?? 0) / 1000) * (pricing?.inputPer1kTokens ?? 0) +
        ((completionTokens ?? 0) / 1000) * (pricing?.outputPer1kTokens ?? 0),
    );
    const rawUsagePayload = this.mergeRawUsagePayload(input.usage?.raw, input.audit);

    const entity = this.repo.create({
      occurredAt: input.occurredAt ?? new Date(),
      requestId: input.requestId ?? null,
      status: input.status,
      surface: input.surface,
      scene: input.scene,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      scopeLabel: input.scopeLabel ?? null,
      ownerId: input.ownerId ?? null,
      characterId: input.characterId ?? null,
      characterName: input.characterName ?? null,
      conversationId: input.conversationId ?? null,
      groupId: input.groupId ?? null,
      providerKey: input.providerKey ?? null,
      providerMode: input.providerMode ?? null,
      model: input.model ?? null,
      apiStyle: input.apiStyle ?? null,
      billingSource: input.billingSource ?? null,
      promptTokens,
      completionTokens,
      totalTokens,
      inputUnitPrice: pricing?.inputPer1kTokens ?? null,
      outputUnitPrice: pricing?.outputPer1kTokens ?? null,
      estimatedCost,
      currency: catalog.currency,
      rawUsagePayload: rawUsagePayload ? JSON.stringify(rawUsagePayload) : null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage
        ? input.errorMessage.slice(0, 1000)
        : null,
    });

    return this.repo.save(entity);
  }

  async getPricingCatalog(): Promise<TokenPricingCatalog> {
    if (
      this.pricingCache &&
      this.pricingCache.expiresAt > Date.now()
    ) {
      return this.pricingCache.value;
    }

    const raw = await this.systemConfig.getConfig(PRICING_CONFIG_KEY);
    const parsed = this.parsePricingCatalog(raw);
    this.pricingCache = {
      expiresAt: Date.now() + PRICING_CACHE_TTL_MS,
      value: parsed,
    };
    return parsed;
  }

  async setPricingCatalog(payload: TokenPricingCatalog) {
    const normalized = this.normalizePricingCatalog(payload);
    await this.systemConfig.setConfig(
      PRICING_CONFIG_KEY,
      JSON.stringify(normalized),
    );
    this.pricingCache = {
      expiresAt: Date.now() + PRICING_CACHE_TTL_MS,
      value: normalized,
    };
    return normalized;
  }

  async getBudgetConfig(): Promise<TokenUsageBudgetConfig> {
    if (
      this.budgetCache &&
      this.budgetCache.expiresAt > Date.now()
    ) {
      return this.budgetCache.value;
    }

    const raw = await this.systemConfig.getConfig(BUDGET_CONFIG_KEY);
    const parsed = this.parseBudgetConfig(raw);
    this.budgetCache = {
      expiresAt: Date.now() + PRICING_CACHE_TTL_MS,
      value: parsed,
    };
    return parsed;
  }

  async setBudgetConfig(
    payload: Partial<TokenUsageBudgetConfig> | null | undefined,
  ): Promise<TokenUsageBudgetSnapshot> {
    const normalized = this.normalizeBudgetConfig(payload);
    await this.systemConfig.setConfig(
      BUDGET_CONFIG_KEY,
      JSON.stringify(normalized),
    );
    this.budgetCache = {
      expiresAt: Date.now() + PRICING_CACHE_TTL_MS,
      value: normalized,
    };

    return {
      config: normalized,
      summary: await this.buildBudgetSummary(normalized),
    };
  }

  async getBudgetSnapshot(): Promise<TokenUsageBudgetSnapshot> {
    const config = await this.getBudgetConfig();
    return {
      config,
      summary: await this.buildBudgetSummary(config),
    };
  }

  async getBudgetExecutionDecision(input: {
    characterId?: string | null;
    characterName?: string | null;
    currentModel?: string | null;
  }): Promise<BudgetExecutionDecision | null> {
    const config = await this.getBudgetConfig();
    const overallRule = this.isActionableBudgetRule(config.overall)
      ? config.overall
      : null;
    const characterRule =
      input.characterId &&
      (config.characters.find(
        (item) =>
          item.characterId === input.characterId &&
          this.isActionableBudgetRule(item),
      ) ??
        null);

    if (!overallRule && !characterRule) {
      return null;
    }

    const now = new Date();
    const dayStart = this.getPeriodStart(now, 'daily');
    const monthStart = this.getPeriodStart(now, 'monthly');
    const decisions: BudgetExecutionDecision[] = [];
    const [
      overallDailyUsage,
      overallMonthlyUsage,
      characterDailyUsage,
      characterMonthlyUsage,
    ] = await Promise.all([
      overallRule ? this.getBudgetUsageAggregate(dayStart, now) : null,
      overallRule ? this.getBudgetUsageAggregate(monthStart, now) : null,
      characterRule && input.characterId
        ? this.getBudgetUsageAggregate(dayStart, now, input.characterId)
        : null,
      characterRule && input.characterId
        ? this.getBudgetUsageAggregate(monthStart, now, input.characterId)
        : null,
    ]);

    if (overallRule && overallDailyUsage && overallMonthlyUsage) {
      const overallStatus = this.buildBudgetStatus(overallRule, {
        daily: overallDailyUsage,
        monthly: overallMonthlyUsage,
      });
      const overallDecision = this.pickBudgetExecutionDecision(
        overallStatus,
        'overall',
        input.currentModel,
      );
      if (overallDecision) {
        decisions.push(overallDecision);
      }
    }

    if (
      characterRule &&
      input.characterId &&
      characterDailyUsage &&
      characterMonthlyUsage
    ) {
      const characterStatus = this.buildBudgetStatus(characterRule, {
        daily: characterDailyUsage,
        monthly: characterMonthlyUsage,
      });
      const characterDecision = this.pickBudgetExecutionDecision(
        characterStatus,
        'character',
        input.currentModel,
        {
          characterId: input.characterId,
          characterName: input.characterName?.trim() || input.characterId,
        },
      );
      if (characterDecision) {
        decisions.push(characterDecision);
      }
    }

    return this.selectBudgetExecutionDecision(decisions);
  }

  async getOverview(query: TokenUsageQuery) {
    const normalized = this.normalizeQuery(query);
    const records = await this.repo.find({
      where: this.buildWhere(normalized),
      order: { occurredAt: 'DESC' },
    });
    const currency = records[0]?.currency ?? (await this.getPricingCatalog()).currency;
    const activeCharacterCount = new Set(
      records
        .map((record) => record.characterId)
        .filter((value): value is string => Boolean(value)),
    ).size;

    return {
      currency,
      promptTokens: this.sum(records, 'promptTokens'),
      completionTokens: this.sum(records, 'completionTokens'),
      totalTokens: this.sum(records, 'totalTokens'),
      estimatedCost: this.roundCost(this.sum(records, 'estimatedCost')),
      requestCount: records.length,
      successCount: records.filter((record) => record.status === 'success').length,
      failedCount: records.filter((record) => record.status === 'failed').length,
      activeCharacterCount,
    };
  }

  async getTrend(query: TokenUsageQuery) {
    const normalized = this.normalizeQuery(query);
    const records = await this.repo.find({
      where: this.buildWhere(normalized),
      order: { occurredAt: 'ASC' },
    });
    const bucketMap = new Map<string, AggregateBucket>();

    records.forEach((record) => {
      const bucketStart = this.toBucketStart(record.occurredAt, normalized.grain);
      const key = bucketStart.toISOString();
      const bucket = this.ensureBucket(
        bucketMap,
        key,
        this.formatBucketLabel(bucketStart, normalized.grain),
      );
      this.accumulateBucket(bucket, record);
    });

    return Array.from(bucketMap.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, bucket]) => ({
        bucketStart: key,
        label: bucket.label,
        promptTokens: bucket.promptTokens,
        completionTokens: bucket.completionTokens,
        totalTokens: bucket.totalTokens,
        estimatedCost: this.roundCost(bucket.estimatedCost),
        requestCount: bucket.requestCount,
        successCount: bucket.successCount,
        failedCount: bucket.failedCount,
      }));
  }

  async getBreakdown(query: TokenUsageQuery) {
    const normalized = this.normalizeQuery(query);
    const records = await this.repo.find({
      where: this.buildWhere(normalized),
      order: { occurredAt: 'DESC' },
    });
    const currency = records[0]?.currency ?? (await this.getPricingCatalog()).currency;

    return {
      currency,
      byCharacter: this.groupBy(records, normalized.limit, (record) => ({
        key: record.characterId ?? '__unknown__',
        label:
          record.characterName?.trim() ||
          record.scopeLabel?.trim() ||
          record.characterId ||
          '未识别角色',
      })),
      byConversation: this.groupBy(records, normalized.limit, (record) => ({
        key:
          record.conversationId ??
          record.groupId ??
          record.scopeId ??
          '__unknown__',
        label:
          record.scopeLabel?.trim() ||
          record.characterName?.trim() ||
          record.conversationId ||
          record.groupId ||
          record.scopeId ||
          '未识别对象',
      })),
      byScene: this.groupBy(records, normalized.limit, (record) => ({
        key: record.scene,
        label: this.formatSceneLabel(record.scene),
      })),
      byModel: this.groupBy(records, normalized.limit, (record) => ({
        key: record.model?.trim() || '__unknown__',
        label: record.model?.trim() || '未记录模型',
      })),
      byBillingSource: this.groupBy(records, normalized.limit, (record) => ({
        key: record.billingSource?.trim() || '__unknown__',
        label:
          record.billingSource === 'owner_custom'
            ? '世界主人 Key'
            : record.billingSource === 'instance_default'
              ? '实例默认 Key'
              : '未记录来源',
      })),
    };
  }

  async getRecords(query: TokenUsageQuery) {
    const normalized = this.normalizeQuery(query);
    const where = this.buildWhere(normalized);
    const [total, records] = await Promise.all([
      this.repo.count({ where }),
      this.repo.find({
        where,
        order: { occurredAt: 'DESC' },
        skip: (normalized.page - 1) * normalized.pageSize,
        take: normalized.pageSize,
      }),
    ]);

    const labelMaps = await this.buildLabelMaps(records);

    return {
      items: records.map((record) => ({
        id: record.id,
        occurredAt: record.occurredAt.toISOString(),
        status: record.status as LedgerStatus,
        surface: record.surface as LedgerSurface,
        scene: record.scene,
        scopeType: record.scopeType as LedgerScopeType,
        scopeId: record.scopeId ?? null,
        targetLabel: this.resolveTargetLabel(record, labelMaps),
        characterId: record.characterId ?? null,
        characterName: record.characterName ?? null,
        conversationId: record.conversationId ?? null,
        groupId: record.groupId ?? null,
        model: record.model ?? null,
        billingSource:
          (record.billingSource as LedgerBillingSource | null) ?? null,
        promptTokens: record.promptTokens ?? 0,
        completionTokens: record.completionTokens ?? 0,
        totalTokens: record.totalTokens ?? 0,
        estimatedCost: this.roundCost(record.estimatedCost ?? 0),
        currency: (record.currency as PricingCurrency) ?? 'CNY',
        errorCode: record.errorCode ?? null,
        errorMessage: record.errorMessage ?? null,
      })),
      total,
      page: normalized.page,
      pageSize: normalized.pageSize,
      totalPages: Math.max(1, Math.ceil(total / normalized.pageSize)),
    };
  }

  async getDowngradeInsights(query: TokenUsageQuery) {
    const normalized = this.normalizeQuery({
      ...query,
      status: 'success',
      errorCode: 'BUDGET_DOWNGRADED',
    });
    const records = await this.repo.find({
      where: this.buildWhere(normalized),
      order: { occurredAt: 'DESC' },
    });
    const catalog = await this.getPricingCatalog();
    const currency =
      (records[0]?.currency as PricingCurrency | undefined) ?? catalog.currency;
    const characterIds = new Set<string>();
    const switchMap = new Map<string, DowngradeModelSwitchBucket>();
    let estimatedCost = 0;
    let estimatedOriginalCost = 0;
    let traceableRequestCount = 0;

    records.forEach((record) => {
      if (record.characterId) {
        characterIds.add(record.characterId);
      }

      const audit = this.parseUsageAuditPayload(record.rawUsagePayload);
      const requestedModel = audit?.requestedModel?.trim() || null;
      const appliedModel = audit?.appliedModel?.trim() || record.model?.trim() || null;
      const actualCost = this.normalizeAggregateNumber(record.estimatedCost);
      const originalCost = requestedModel
        ? this.estimateCostForModel(
            catalog,
            requestedModel,
            record.promptTokens ?? 0,
            record.completionTokens ?? 0,
          )
        : null;
      const comparableOriginalCost = originalCost ?? actualCost;
      const estimatedSavings = Math.max(0, comparableOriginalCost - actualCost);

      estimatedCost += actualCost;
      estimatedOriginalCost += comparableOriginalCost;
      if (requestedModel && appliedModel) {
        traceableRequestCount += 1;
      }

      const key = `${requestedModel ?? '__unknown__'}=>${appliedModel ?? '__unknown__'}`;
      const bucket = switchMap.get(key) ?? {
        key,
        requestedModel,
        appliedModel,
        requestCount: 0,
        successCount: 0,
        estimatedCost: 0,
        estimatedOriginalCost: 0,
        estimatedSavings: 0,
      };
      bucket.requestCount += 1;
      if (record.status === 'success') {
        bucket.successCount += 1;
      }
      bucket.estimatedCost += actualCost;
      bucket.estimatedOriginalCost += comparableOriginalCost;
      bucket.estimatedSavings += estimatedSavings;
      switchMap.set(key, bucket);
    });

    const requestCount = records.length;
    const successCount = records.filter((record) => record.status === 'success').length;
    const savingsValue = Math.max(0, estimatedOriginalCost - estimatedCost);

    return {
      currency,
      requestCount,
      successCount,
      successRate: requestCount ? successCount / requestCount : null,
      affectedCharacterCount: characterIds.size,
      estimatedCost: this.roundCost(estimatedCost),
      estimatedOriginalCost: this.roundCost(estimatedOriginalCost),
      estimatedSavings: this.roundCost(savingsValue),
      savingsRate:
        estimatedOriginalCost > 0 ? savingsValue / estimatedOriginalCost : null,
      traceableRequestCount,
      untraceableRequestCount: Math.max(0, requestCount - traceableRequestCount),
      byModelSwitch: Array.from(switchMap.values())
        .sort((left, right) => {
          if (right.estimatedSavings !== left.estimatedSavings) {
            return right.estimatedSavings - left.estimatedSavings;
          }
          if (right.requestCount !== left.requestCount) {
            return right.requestCount - left.requestCount;
          }
          return left.key.localeCompare(right.key);
        })
        .slice(0, normalized.limit)
        .map((item) => ({
          key: item.key,
          requestedModel: item.requestedModel,
          appliedModel: item.appliedModel,
          requestCount: item.requestCount,
          successCount: item.successCount,
          estimatedCost: this.roundCost(item.estimatedCost),
          estimatedOriginalCost: this.roundCost(item.estimatedOriginalCost),
          estimatedSavings: this.roundCost(item.estimatedSavings),
        })),
    };
  }

  async getDowngradeQuality(query: TokenUsageQuery) {
    const normalized = this.normalizeQuery({
      ...query,
      status: 'success',
      errorCode: 'BUDGET_DOWNGRADED',
    });
    const records = await this.repo.find({
      where: this.buildWhere(normalized),
      order: { occurredAt: 'ASC' },
    });
    const generatedAt = new Date().toISOString();
    const requestCount = records.length;
    const conversationScopedRecords = records.filter((record) =>
      Boolean(record.conversationId?.trim()),
    );
    const conversationScopedRequestCount = conversationScopedRecords.length;
    const unscopedRequestCount = requestCount - conversationScopedRequestCount;
    const conversationIds = Array.from(
      new Set(
        conversationScopedRecords.map((record) => record.conversationId!.trim()),
      ),
    );

    if (!conversationIds.length) {
      return {
        generatedAt,
        requestCount,
        conversationScopedRequestCount,
        unscopedRequestCount,
        distinctConversationCount: 0,
        reviewedConversationCount: 0,
        resolvedConversationCount: 0,
        importantConversationCount: 0,
        acceptableConversationCount: 0,
        tooWeakConversationCount: 0,
        immediateContinuationCount: 0,
        continuedWithin24hCount: 0,
        postDowngradeFailureCount: 0,
        postDowngradeBlockedCount: 0,
        immediateContinuationRate: null,
        continuedWithin24hRate: null,
        postDowngradeFailureRate: null,
        postDowngradeBlockedRate: null,
        reviewCoverageRate: null,
        acceptableReviewRate: null,
        tooWeakReviewRate: null,
        proxyQualityScore: null,
        tooWeakSamples: [],
        pendingOutcomeSamples: [],
        byCharacter: [],
      };
    }

    const earliestOccurredAt = conversationScopedRecords[0]?.occurredAt ?? new Date();
    const latestOccurredAt =
      conversationScopedRecords[conversationScopedRecords.length - 1]?.occurredAt ??
      earliestOccurredAt;
    const analysisEndAt = new Date(
      latestOccurredAt.getTime() + DAY_MS,
    );
    const messageRepo = this.repo.manager.getRepository(MessageEntity);
    const reviewRepo = this.repo.manager.getRepository(AdminConversationReviewEntity);
    const [messages, followupLedgerRecords, reviews, labelMaps] = await Promise.all([
      messageRepo.find({
        where: {
          conversationId: In(conversationIds),
          createdAt: Between(earliestOccurredAt, analysisEndAt),
        },
        order: { createdAt: 'ASC' },
      }),
      this.repo.find({
        where: {
          conversationId: In(conversationIds),
          occurredAt: Between(earliestOccurredAt, analysisEndAt),
        },
        order: { occurredAt: 'ASC' },
      }),
      reviewRepo.find({
        where: {
          conversationId: In(conversationIds),
        },
      }),
      this.buildLabelMaps(conversationScopedRecords),
    ]);

    const messagesByConversation = new Map<string, MessageEntity[]>();
    messages.forEach((message) => {
      const items = messagesByConversation.get(message.conversationId) ?? [];
      items.push(message);
      messagesByConversation.set(message.conversationId, items);
    });

    const ledgerByConversation = new Map<string, AiUsageLedgerEntity[]>();
    followupLedgerRecords.forEach((record) => {
      const conversationId = record.conversationId?.trim();
      if (!conversationId) {
        return;
      }
      const items = ledgerByConversation.get(conversationId) ?? [];
      items.push(record);
      ledgerByConversation.set(conversationId, items);
    });

    const reviewMap = new Map(
      reviews.map((review) => [review.conversationId, review]),
    );
    const latestDowngradeRecordByConversation =
      this.groupLatestUsageByConversation(conversationScopedRecords);

    let immediateContinuationCount = 0;
    let continuedWithin24hCount = 0;
    let postDowngradeFailureCount = 0;
    let postDowngradeBlockedCount = 0;

    conversationScopedRecords.forEach((record) => {
      const conversationId = record.conversationId!.trim();
      const recordTime = record.occurredAt.getTime();
      const continuationDeadline = recordTime + DAY_MS;
      const immediateDeadline = recordTime + IMMEDIATE_CONTINUATION_WINDOW_MS;
      const conversationMessages =
        messagesByConversation.get(conversationId) ?? [];
      const conversationLedger = ledgerByConversation.get(conversationId) ?? [];

      const hasImmediateContinuation = conversationMessages.some((message) => {
        const messageTime = message.createdAt.getTime();
        return messageTime > recordTime && messageTime <= immediateDeadline;
      });
      const hasContinuationWithin24h = conversationMessages.some((message) => {
        const messageTime = message.createdAt.getTime();
        return messageTime > recordTime && messageTime <= continuationDeadline;
      });
      const hasPostDowngradeFailure = conversationLedger.some((followup) => {
        if (followup.id === record.id) {
          return false;
        }
        const followupTime = followup.occurredAt.getTime();
        return (
          followupTime > recordTime &&
          followupTime <= continuationDeadline &&
          followup.status === 'failed'
        );
      });
      const hasPostDowngradeBlocked = conversationLedger.some((followup) => {
        if (followup.id === record.id) {
          return false;
        }
        const followupTime = followup.occurredAt.getTime();
        return (
          followupTime > recordTime &&
          followupTime <= continuationDeadline &&
          followup.errorCode === 'BUDGET_BLOCKED'
        );
      });

      if (hasImmediateContinuation) {
        immediateContinuationCount += 1;
      }
      if (hasContinuationWithin24h) {
        continuedWithin24hCount += 1;
      }
      if (hasPostDowngradeFailure) {
        postDowngradeFailureCount += 1;
      }
      if (hasPostDowngradeBlocked) {
        postDowngradeBlockedCount += 1;
      }
    });

    const reviewedConversationCount = reviews.length;
    const resolvedConversationCount = reviews.filter(
      (review) => review.status === 'resolved',
    ).length;
    const importantConversationCount = reviews.filter(
      (review) => review.status === 'important',
    ).length;
    const acceptableConversationCount = reviews.filter((review) =>
      this.reviewHasTag(review.tags, 'downgrade-acceptable'),
    ).length;
    const tooWeakConversationCount = reviews.filter((review) =>
      this.reviewHasTag(review.tags, 'downgrade-too-weak'),
    ).length;
    const distinctConversationCount = conversationIds.length;
    const immediateContinuationRate =
      requestCount > 0
        ? this.roundRatio(immediateContinuationCount / requestCount)
        : null;
    const continuedWithin24hRate =
      requestCount > 0
        ? this.roundRatio(continuedWithin24hCount / requestCount)
        : null;
    const postDowngradeFailureRate =
      requestCount > 0
        ? this.roundRatio(postDowngradeFailureCount / requestCount)
        : null;
    const postDowngradeBlockedRate =
      requestCount > 0
        ? this.roundRatio(postDowngradeBlockedCount / requestCount)
        : null;
    const reviewCoverageRate =
      distinctConversationCount > 0
        ? this.roundRatio(reviewedConversationCount / distinctConversationCount)
        : null;
    const acceptableReviewRate =
      reviewedConversationCount > 0
        ? this.roundRatio(acceptableConversationCount / reviewedConversationCount)
        : null;
    const tooWeakReviewRate =
      reviewedConversationCount > 0
        ? this.roundRatio(tooWeakConversationCount / reviewedConversationCount)
        : null;
    const tooWeakSamples = this.buildDowngradeReviewSamples({
      reviews,
      latestDowngradeRecordByConversation,
      labelMaps,
      limit: normalized.limit,
      predicate: (review) =>
        this.reviewHasTag(review.tags, 'downgrade-too-weak'),
    });
    const pendingOutcomeSamples = this.buildDowngradeReviewSamples({
      reviews,
      latestDowngradeRecordByConversation,
      labelMaps,
      limit: normalized.limit,
      predicate: (review) =>
        !this.reviewHasTag(review.tags, 'downgrade-acceptable') &&
        !this.reviewHasTag(review.tags, 'downgrade-too-weak'),
    });
    const byCharacter = this.buildDowngradeCharacterQualityItems({
      records: conversationScopedRecords,
      reviews,
      latestDowngradeRecordByConversation,
      labelMaps,
      limit: normalized.limit,
    });
    const proxyQualityScore =
      requestCount > 0
        ? this.roundRatio(
            ((immediateContinuationRate ?? 0) * 0.35) +
              ((continuedWithin24hRate ?? 0) * 0.25) +
              ((1 - (postDowngradeFailureRate ?? 0)) * 0.2) +
              ((1 - (postDowngradeBlockedRate ?? 0)) * 0.1) +
              ((reviewCoverageRate ?? 0) * 0.1),
          )
        : null;

    return {
      generatedAt,
      requestCount,
      conversationScopedRequestCount,
      unscopedRequestCount,
      distinctConversationCount,
      reviewedConversationCount,
      resolvedConversationCount,
      importantConversationCount,
      acceptableConversationCount,
      tooWeakConversationCount,
      immediateContinuationCount,
      continuedWithin24hCount,
      postDowngradeFailureCount,
      postDowngradeBlockedCount,
      immediateContinuationRate,
      continuedWithin24hRate,
      postDowngradeFailureRate,
      postDowngradeBlockedRate,
      reviewCoverageRate,
      acceptableReviewRate,
      tooWeakReviewRate,
      proxyQualityScore,
      tooWeakSamples,
      pendingOutcomeSamples,
      byCharacter,
    };
  }

  private reviewHasTag(tags: string[] | null | undefined, target: string) {
    if (!tags?.length) {
      return false;
    }
    return tags.some((tag) => tag.trim().toLowerCase() === target);
  }

  private buildDowngradeReviewSamples(input: {
    reviews: AdminConversationReviewEntity[];
    latestDowngradeRecordByConversation: Map<string, AiUsageLedgerEntity>;
    labelMaps: {
      conversationMap: Map<string, string>;
      groupMap: Map<string, string>;
      characterMap: Map<string, string>;
    };
    limit: number;
    predicate: (review: AdminConversationReviewEntity) => boolean;
  }): DowngradeReviewSample[] {
    return [...input.reviews]
      .filter(input.predicate)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, input.limit)
      .map((review) => {
        const record = input.latestDowngradeRecordByConversation.get(review.conversationId);
        return {
          conversationId: review.conversationId,
          occurredAt: (record?.occurredAt ?? review.updatedAt).toISOString(),
          reviewUpdatedAt: review.updatedAt.toISOString(),
          targetLabel: record
            ? this.resolveTargetLabel(record, input.labelMaps)
            : review.conversationId,
          characterId: record?.characterId ?? null,
          characterName: record?.characterName ?? null,
          scene: record?.scene ?? 'chat_reply',
          reviewStatus: review.status,
          reviewTags: Array.isArray(review.tags) ? review.tags : [],
          reviewNote: review.note ?? null,
        };
      });
  }

  private buildDowngradeCharacterQualityItems(input: {
    records: AiUsageLedgerEntity[];
    reviews: AdminConversationReviewEntity[];
    latestDowngradeRecordByConversation: Map<string, AiUsageLedgerEntity>;
    labelMaps: {
      conversationMap: Map<string, string>;
      groupMap: Map<string, string>;
      characterMap: Map<string, string>;
    };
    limit: number;
  }): DowngradeCharacterQualityItem[] {
    const buckets = new Map<
      string,
      {
        characterId?: string | null;
        characterName: string;
        requestCount: number;
        conversationIds: Set<string>;
        reviewedConversationCount: number;
        acceptableConversationCount: number;
        tooWeakConversationCount: number;
        pendingOutcomeConversationCount: number;
        tooWeakSamples: DowngradeReviewSample[];
        pendingOutcomeSamples: DowngradeReviewSample[];
      }
    >();

    const reviewMap = new Map(
      input.reviews.map((review) => [review.conversationId, review] as const),
    );

    const ensureBucket = (record: AiUsageLedgerEntity) => {
      const key =
        record.characterId?.trim() ||
        record.characterName?.trim() ||
        record.scopeId?.trim() ||
        '__unknown__';
      const existing = buckets.get(key);
      if (existing) {
        return existing;
      }
      const created = {
        characterId: record.characterId ?? null,
        characterName:
          record.characterName?.trim() ||
          record.scopeLabel?.trim() ||
          record.scopeId?.trim() ||
          'Unknown character',
        requestCount: 0,
        conversationIds: new Set<string>(),
        reviewedConversationCount: 0,
        acceptableConversationCount: 0,
        tooWeakConversationCount: 0,
        pendingOutcomeConversationCount: 0,
        tooWeakSamples: [],
        pendingOutcomeSamples: [],
      };
      buckets.set(key, created);
      return created;
    };

    input.records.forEach((record) => {
      const conversationId = record.conversationId?.trim();
      if (!conversationId) {
        return;
      }
      const bucket = ensureBucket(record);
      bucket.requestCount += 1;
      bucket.conversationIds.add(conversationId);
    });

    input.latestDowngradeRecordByConversation.forEach((record, conversationId) => {
      const review = reviewMap.get(conversationId);
      if (!review) {
        return;
      }
      const bucket = ensureBucket(record);
      bucket.reviewedConversationCount += 1;
      const acceptable = this.reviewHasTag(review.tags, 'downgrade-acceptable');
      const tooWeak = this.reviewHasTag(review.tags, 'downgrade-too-weak');
      if (acceptable) {
        bucket.acceptableConversationCount += 1;
      }
      if (tooWeak) {
        bucket.tooWeakConversationCount += 1;
      }
      if (!acceptable && !tooWeak) {
        bucket.pendingOutcomeConversationCount += 1;
      }

      const sample: DowngradeReviewSample = {
        conversationId: review.conversationId,
        occurredAt: (record.occurredAt ?? review.updatedAt).toISOString(),
        reviewUpdatedAt: review.updatedAt.toISOString(),
        targetLabel: this.resolveTargetLabel(record, input.labelMaps),
        characterId: record.characterId ?? null,
        characterName: record.characterName ?? null,
        scene: record.scene ?? 'chat_reply',
        reviewStatus: review.status,
        reviewTags: Array.isArray(review.tags) ? review.tags : [],
        reviewNote: review.note ?? null,
      };

      if (tooWeak && bucket.tooWeakSamples.length < 2) {
        bucket.tooWeakSamples.push(sample);
      }
      if (!acceptable && !tooWeak && bucket.pendingOutcomeSamples.length < 2) {
        bucket.pendingOutcomeSamples.push(sample);
      }
    });

    return Array.from(buckets.values())
      .map((bucket) => ({
        characterId: bucket.characterId ?? null,
        characterName: bucket.characterName,
        requestCount: bucket.requestCount,
        distinctConversationCount: bucket.conversationIds.size,
        reviewedConversationCount: bucket.reviewedConversationCount,
        acceptableConversationCount: bucket.acceptableConversationCount,
        tooWeakConversationCount: bucket.tooWeakConversationCount,
        pendingOutcomeConversationCount: bucket.pendingOutcomeConversationCount,
        reviewCoverageRate: bucket.conversationIds.size
          ? this.roundRatio(bucket.reviewedConversationCount / bucket.conversationIds.size)
          : null,
        acceptableReviewRate: bucket.reviewedConversationCount
          ? this.roundRatio(
              bucket.acceptableConversationCount / bucket.reviewedConversationCount,
            )
          : null,
        tooWeakReviewRate: bucket.reviewedConversationCount
          ? this.roundRatio(
              bucket.tooWeakConversationCount / bucket.reviewedConversationCount,
            )
          : null,
        tooWeakSamples: bucket.tooWeakSamples,
        pendingOutcomeSamples: bucket.pendingOutcomeSamples,
      }))
      .sort((left, right) => {
        if (right.tooWeakConversationCount !== left.tooWeakConversationCount) {
          return right.tooWeakConversationCount - left.tooWeakConversationCount;
        }
        if ((right.tooWeakReviewRate ?? 0) !== (left.tooWeakReviewRate ?? 0)) {
          return (right.tooWeakReviewRate ?? 0) - (left.tooWeakReviewRate ?? 0);
        }
        if (
          right.pendingOutcomeConversationCount !== left.pendingOutcomeConversationCount
        ) {
          return (
            right.pendingOutcomeConversationCount -
            left.pendingOutcomeConversationCount
          );
        }
        return right.requestCount - left.requestCount;
      })
      .slice(0, input.limit);
  }

  private groupLatestUsageByConversation(records: AiUsageLedgerEntity[]) {
    const grouped = new Map<string, AiUsageLedgerEntity>();
    records.forEach((record) => {
      const conversationId = record.conversationId?.trim();
      if (!conversationId) {
        return;
      }
      grouped.set(conversationId, record);
    });
    return grouped;
  }

  private async buildBudgetSummary(
    config: TokenUsageBudgetConfig,
  ): Promise<TokenUsageBudgetSummary> {
    const now = new Date();
    const dayStart = this.getPeriodStart(now, 'daily');
    const monthStart = this.getPeriodStart(now, 'monthly');
    const configuredCharacterIds = Array.from(
      new Set(config.characters.map((item) => item.characterId)),
    );

    const [catalog, records, characters] = await Promise.all([
      this.getPricingCatalog(),
      this.repo.find({
        where: {
          occurredAt: Between(monthStart, now),
        },
        order: { occurredAt: 'DESC' },
      }),
      configuredCharacterIds.length
        ? this.characterRepo.find({
            where: { id: In(configuredCharacterIds) },
          })
        : Promise.resolve([]),
    ]);

    const overallUsage = this.createBudgetAccumulator();
    const characterUsageMap = new Map<string, BudgetUsageAccumulator>();

    records.forEach((record) => {
      const isDaily = record.occurredAt >= dayStart;
      this.accumulateBudgetUsage(overallUsage, record, isDaily);
      if (!record.characterId) {
        return;
      }
      const current =
        characterUsageMap.get(record.characterId) ??
        this.createBudgetAccumulator();
      this.accumulateBudgetUsage(current, record, isDaily);
      characterUsageMap.set(record.characterId, current);
    });

    const characterNameMap = new Map(
      characters.map((character) => [character.id, character.name]),
    );
    const overall = this.buildBudgetStatus(config.overall, overallUsage);
    const characterStatuses = config.characters
      .map((rule) => ({
        characterId: rule.characterId,
        characterName:
          characterNameMap.get(rule.characterId) ?? rule.characterId,
        note: rule.note,
        budget: this.buildBudgetStatus(
          rule,
          characterUsageMap.get(rule.characterId) ??
            this.createBudgetAccumulator(),
        ),
      }))
      .sort((left, right) =>
        this.compareBudgetStatuses(left.budget, right.budget),
      );

    return {
      currency: catalog.currency,
      generatedAt: now.toISOString(),
      overall,
      characters: characterStatuses,
      alerts: this.collectBudgetAlerts(overall, characterStatuses),
    };
  }

  private isActionableBudgetRule(rule?: TokenUsageBudgetRule | null) {
    return Boolean(
      rule &&
        rule.enabled &&
        rule.enforcement !== 'monitor' &&
        (rule.dailyLimit != null || rule.monthlyLimit != null),
    );
  }

  private async getBudgetUsageAggregate(
    from: Date,
    to: Date,
    characterId?: string,
  ): Promise<BudgetUsageAggregate> {
    const qb = this.repo
      .createQueryBuilder('ledger')
      .select('COALESCE(SUM(ledger.totalTokens), 0)', 'tokens')
      .addSelect('COALESCE(SUM(ledger.estimatedCost), 0)', 'cost')
      .where('ledger.occurredAt BETWEEN :from AND :to', {
        from: from.toISOString(),
        to: to.toISOString(),
      });

    if (characterId) {
      qb.andWhere('ledger.characterId = :characterId', { characterId });
    }

    const raw = await qb.getRawOne<{
      tokens?: string | number | null;
      cost?: string | number | null;
    }>();

    return {
      tokens: this.normalizeAggregateNumber(raw?.tokens),
      cost: this.normalizeAggregateNumber(raw?.cost),
    };
  }

  private normalizeAggregateNumber(value: string | number | null | undefined) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private pickBudgetExecutionDecision(
    status: TokenUsageBudgetStatus,
    scope: 'overall' | 'character',
    currentModel?: string | null,
    character?: {
      characterId: string;
      characterName: string;
    },
  ): BudgetExecutionDecision | null {
    const exceededSummary =
      status.daily.state === 'exceeded'
        ? status.daily
        : status.monthly.state === 'exceeded'
          ? status.monthly
          : null;
    if (!exceededSummary || exceededSummary.limit == null) {
      return null;
    }

    const baseDecision = {
      scope,
      period: exceededSummary.period,
      metric: status.metric,
      used: exceededSummary.used,
      limit: exceededSummary.limit,
      characterId: character?.characterId,
      characterName: character?.characterName,
    };

    if (status.enforcement === 'block') {
      return {
        ...baseDecision,
        action: 'block',
        message: this.buildBudgetBlockMessage(
          scope,
          exceededSummary.period,
          character?.characterName,
        ),
      };
    }

    if (status.enforcement !== 'downgrade') {
      return null;
    }

    const downgradeModel = status.downgradeModel?.trim();
    if (!downgradeModel) {
      return {
        ...baseDecision,
        action: 'block',
        message: this.buildBudgetDowngradeBlockMessage(
          scope,
          exceededSummary.period,
          character?.characterName,
          'missing_model',
        ),
      };
    }

    if (
      currentModel?.trim() &&
      downgradeModel.toLowerCase() === currentModel.trim().toLowerCase()
    ) {
      return {
        ...baseDecision,
        action: 'block',
        message: this.buildBudgetDowngradeBlockMessage(
          scope,
          exceededSummary.period,
          character?.characterName,
          'same_model',
        ),
      };
    }

    return {
      ...baseDecision,
      action: 'downgrade',
      downgradeModel,
      message: this.buildBudgetDowngradeMessage(
        scope,
        exceededSummary.period,
        downgradeModel,
        character?.characterName,
      ),
    };
  }

  private buildBudgetBlockMessage(
    scope: 'overall' | 'character',
    period: BudgetPeriod,
    characterName?: string,
  ) {
    const scopeLabel =
      scope === 'overall'
        ? '当前实例'
        : `角色「${characterName ?? '未命名角色'}」`;
    const periodLabel = period === 'daily' ? '今日' : '本月';
    return `${scopeLabel}${periodLabel} AI 预算已用完，请稍后再试。`;
  }

  private selectBudgetExecutionDecision(
    decisions: BudgetExecutionDecision[],
  ): BudgetExecutionDecision | null {
    if (!decisions.length) {
      return null;
    }

    const priority = (decision: BudgetExecutionDecision) => {
      if (decision.action === 'block') {
        return decision.scope === 'character' ? 4 : 3;
      }
      return decision.scope === 'character' ? 2 : 1;
    };

    return decisions
      .slice()
      .sort((left, right) => priority(right) - priority(left))[0];
  }

  private buildBudgetDowngradeMessage(
    scope: 'overall' | 'character',
    period: BudgetPeriod,
    downgradeModel: string,
    characterName?: string,
  ) {
    const scopeLabel =
      scope === 'overall'
        ? '当前实例'
        : `角色「${characterName ?? '未命名角色'}」`;
    const periodLabel = period === 'daily' ? '今日' : '本月';
    return `${scopeLabel}${periodLabel} AI 预算已超限，已自动降级到模型 ${downgradeModel}。`;
  }

  private buildBudgetDowngradeBlockMessage(
    scope: 'overall' | 'character',
    period: BudgetPeriod,
    characterName: string | undefined,
    reason: 'missing_model' | 'same_model',
  ) {
    const scopeLabel =
      scope === 'overall'
        ? '当前实例'
        : `角色「${characterName ?? '未命名角色'}」`;
    const periodLabel = period === 'daily' ? '今日' : '本月';

    if (reason === 'same_model') {
      return `${scopeLabel}${periodLabel} AI 预算已超限，但降级模型与当前模型相同，已阻断请求。`;
    }

    return `${scopeLabel}${periodLabel} AI 预算已超限，但未配置可用的降级模型，已阻断请求。`;
  }

  private normalizeQuery(query: TokenUsageQuery): NormalizedTokenUsageQuery {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 6 * DAY_MS);
    defaultFrom.setHours(0, 0, 0, 0);

    const from = this.parseDate(query.from, defaultFrom, false);
    const to = this.parseDate(query.to, now, true);
    if (to < from) {
      return {
        ...this.normalizeQuery({
          ...query,
          from: query.to,
          to: query.from,
        }),
      };
    }

    const grain =
      query.grain === 'week' || query.grain === 'month'
        ? query.grain
        : 'day';
    const page = this.normalizePositiveInteger(query.page, 1);
    const pageSize = Math.min(
      100,
      Math.max(1, this.normalizePositiveInteger(query.pageSize, 20)),
    );
    const limit = Math.min(
      20,
      Math.max(1, this.normalizePositiveInteger(query.limit, 8)),
    );

    return {
      from,
      to,
      grain,
      characterId: this.normalizeString(query.characterId),
      conversationId: this.normalizeString(query.conversationId),
      groupId: this.normalizeString(query.groupId),
      scene: this.normalizeString(query.scene),
      model: this.normalizeString(query.model),
      billingSource: this.normalizeBillingSource(query.billingSource),
      status: this.normalizeStatus(query.status),
      errorCode: this.normalizeString(query.errorCode),
      page,
      pageSize,
      limit,
    };
  }

  private buildWhere(
    query: NormalizedTokenUsageQuery,
  ): FindOptionsWhere<AiUsageLedgerEntity> {
    const where: FindOptionsWhere<AiUsageLedgerEntity> = {
      occurredAt: Between(query.from, query.to),
    };

    if (query.characterId) {
      where.characterId = query.characterId;
    }
    if (query.conversationId) {
      where.conversationId = query.conversationId;
    }
    if (query.groupId) {
      where.groupId = query.groupId;
    }
    if (query.scene) {
      where.scene = query.scene;
    }
    if (query.model) {
      where.model = query.model;
    }
    if (query.billingSource) {
      where.billingSource = query.billingSource;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.errorCode) {
      where.errorCode = query.errorCode;
    }

    return where;
  }

  private parseBudgetConfig(raw: string | null): TokenUsageBudgetConfig {
    if (!raw?.trim()) {
      return this.normalizeBudgetConfig(undefined);
    }

    try {
      return this.normalizeBudgetConfig(
        JSON.parse(raw) as Partial<TokenUsageBudgetConfig>,
      );
    } catch {
      return this.normalizeBudgetConfig(undefined);
    }
  }

  private normalizeBudgetConfig(
    payload?: Partial<TokenUsageBudgetConfig> | null,
  ): TokenUsageBudgetConfig {
    const characters = Array.isArray(payload?.characters)
      ? payload.characters
          .map((item) => this.normalizeCharacterBudgetRule(item))
          .filter(
            (item): item is TokenUsageCharacterBudgetRule => item !== null,
          )
      : [];
    const dedupedCharacters = Array.from(
      new Map(characters.map((item) => [item.characterId, item])).values(),
    );

    return {
      overall: this.normalizeBudgetRule(payload?.overall),
      characters: dedupedCharacters,
    };
  }

  private normalizeBudgetRule(
    payload?: Partial<TokenUsageBudgetRule> | null,
  ): TokenUsageBudgetRule {
    return {
      enabled: payload?.enabled === true,
      metric: payload?.metric === 'cost' ? 'cost' : 'tokens',
      enforcement: this.normalizeBudgetEnforcement(payload?.enforcement),
      downgradeModel: this.normalizeString(payload?.downgradeModel) ?? null,
      dailyLimit: this.normalizeBudgetLimit(payload?.dailyLimit),
      monthlyLimit: this.normalizeBudgetLimit(payload?.monthlyLimit),
      warningRatio: this.normalizeWarningRatio(payload?.warningRatio),
    };
  }

  private normalizeCharacterBudgetRule(
    payload?: Partial<TokenUsageCharacterBudgetRule> | null,
  ): TokenUsageCharacterBudgetRule | null {
    const characterId = payload?.characterId?.trim();
    if (!characterId) {
      return null;
    }

    return {
      characterId,
      note: payload?.note?.trim() || undefined,
      ...this.normalizeBudgetRule(payload),
    };
  }

  private parsePricingCatalog(raw: string | null): TokenPricingCatalog {
    if (!raw?.trim()) {
      return this.normalizePricingCatalog(undefined);
    }

    try {
      return this.normalizePricingCatalog(
        JSON.parse(raw) as TokenPricingCatalog,
      );
    } catch {
      return this.normalizePricingCatalog(undefined);
    }
  }

  private normalizePricingCatalog(payload?: Partial<TokenPricingCatalog> | null) {
    const currency: PricingCurrency =
      payload?.currency === 'USD' ? 'USD' : 'CNY';
    const items = Array.isArray(payload?.items)
      ? payload.items
          .map((item) => this.normalizePricingItem(item))
          .filter(
            (item): item is TokenPricingCatalogItem => item !== null,
          )
      : [];

    return {
      currency,
      items,
    };
  }

  private normalizePricingItem(
    item?: Partial<TokenPricingCatalogItem> | null,
  ): TokenPricingCatalogItem | null {
    const model = item?.model?.trim();
    if (!model) {
      return null;
    }

    return {
      model,
      inputPer1kTokens: this.normalizeNonNegativeNumber(item?.inputPer1kTokens),
      outputPer1kTokens: this.normalizeNonNegativeNumber(
        item?.outputPer1kTokens,
      ),
      enabled: item?.enabled !== false,
      note: item?.note?.trim() || undefined,
    };
  }

  private mergeRawUsagePayload(
    usageRaw?: Record<string, unknown> | null,
    audit?: UsageAuditPayload | null,
  ) {
    const normalizedAudit = this.normalizeUsageAuditPayload(audit);
    if (!usageRaw && !normalizedAudit) {
      return null;
    }

    const payload: Record<string, unknown> = usageRaw ? { ...usageRaw } : {};
    if (normalizedAudit) {
      payload.__audit = normalizedAudit;
    }
    return payload;
  }

  private parseUsageAuditPayload(
    rawUsagePayload?: string | null,
  ): UsageAuditPayload | null {
    if (!rawUsagePayload?.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawUsagePayload) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const audit =
        parsed.__audit && typeof parsed.__audit === 'object'
          ? (parsed.__audit as Record<string, unknown>)
          : null;
      if (!audit) {
        return null;
      }

      const requestedModel = this.normalizeString(
        typeof audit.requestedModel === 'string' ? audit.requestedModel : undefined,
      );
      const appliedModel = this.normalizeString(
        typeof audit.appliedModel === 'string' ? audit.appliedModel : undefined,
      );
      const budgetAction =
        audit.budgetAction === 'block' || audit.budgetAction === 'downgrade'
          ? audit.budgetAction
          : undefined;
      const budgetScope =
        audit.budgetScope === 'overall' || audit.budgetScope === 'character'
          ? audit.budgetScope
          : undefined;
      const budgetPeriod =
        audit.budgetPeriod === 'daily' || audit.budgetPeriod === 'monthly'
          ? audit.budgetPeriod
          : undefined;
      const budgetMetric =
        audit.budgetMetric === 'tokens' || audit.budgetMetric === 'cost'
          ? audit.budgetMetric
          : undefined;
      const budgetUsed = this.normalizeOptionalNumber(audit.budgetUsed);
      const budgetLimit = this.normalizeOptionalNumber(audit.budgetLimit);

      if (
        !requestedModel &&
        !appliedModel &&
        !budgetAction &&
        !budgetScope &&
        !budgetPeriod &&
        !budgetMetric &&
        budgetUsed == null &&
        budgetLimit == null
      ) {
        return null;
      }

      return {
        budgetAction,
        requestedModel,
        appliedModel,
        budgetScope,
        budgetPeriod,
        budgetMetric,
        budgetUsed,
        budgetLimit,
      };
    } catch {
      return null;
    }
  }

  private normalizeUsageAuditPayload(
    audit?: UsageAuditPayload | null,
  ): Record<string, unknown> | null {
    if (!audit) {
      return null;
    }

    const normalized: Record<string, unknown> = {};
    const requestedModel = this.normalizeString(audit.requestedModel);
    const appliedModel = this.normalizeString(audit.appliedModel);
    const budgetUsed = this.normalizeOptionalNumber(audit.budgetUsed);
    const budgetLimit = this.normalizeOptionalNumber(audit.budgetLimit);

    if (audit.budgetAction === 'block' || audit.budgetAction === 'downgrade') {
      normalized.budgetAction = audit.budgetAction;
    }
    if (requestedModel) {
      normalized.requestedModel = requestedModel;
    }
    if (appliedModel) {
      normalized.appliedModel = appliedModel;
    }
    if (audit.budgetScope === 'overall' || audit.budgetScope === 'character') {
      normalized.budgetScope = audit.budgetScope;
    }
    if (audit.budgetPeriod === 'daily' || audit.budgetPeriod === 'monthly') {
      normalized.budgetPeriod = audit.budgetPeriod;
    }
    if (audit.budgetMetric === 'tokens' || audit.budgetMetric === 'cost') {
      normalized.budgetMetric = audit.budgetMetric;
    }
    if (budgetUsed != null) {
      normalized.budgetUsed = budgetUsed;
    }
    if (budgetLimit != null) {
      normalized.budgetLimit = budgetLimit;
    }

    return Object.keys(normalized).length ? normalized : null;
  }

  private estimateCostForModel(
    catalog: TokenPricingCatalog,
    model: string,
    promptTokens: number,
    completionTokens: number,
  ) {
    const pricing = this.findPricingItem(catalog, model);
    if (!pricing) {
      return null;
    }

    return (
      (this.normalizeAggregateNumber(promptTokens) / 1000) *
        pricing.inputPer1kTokens +
      (this.normalizeAggregateNumber(completionTokens) / 1000) *
        pricing.outputPer1kTokens
    );
  }

  private findPricingItem(
    catalog: TokenPricingCatalog,
    model?: string | null,
  ) {
    if (!model?.trim()) {
      return null;
    }

    const normalizedModel = model.trim().toLowerCase();
    return (
      catalog.items.find(
        (item) => item.enabled && item.model.trim().toLowerCase() === normalizedModel,
      ) ?? null
    );
  }

  private parseDate(value: string | undefined, fallback: Date, endOfDay: boolean) {
    if (!value?.trim()) {
      return new Date(fallback);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date(fallback);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      parsed.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    }

    return parsed;
  }

  private normalizePositiveInteger(value: number | string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private normalizeInteger(value: number | null | undefined) {
    if (value == null || !Number.isFinite(value)) {
      return null;
    }
    return Math.max(0, Math.round(value));
  }

  private normalizeNonNegativeNumber(value: number | null | undefined) {
    if (value == null || !Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Number(value));
  }

  private normalizeOptionalNumber(value: unknown) {
    if (value == null) {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  }

  private normalizeBudgetLimit(value: number | null | undefined) {
    if (value == null || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    return Number(value);
  }

  private normalizeWarningRatio(value: number | null | undefined) {
    if (value == null || !Number.isFinite(value)) {
      return 0.8;
    }
    return Math.min(0.99, Math.max(0.1, Number(value)));
  }

  private normalizeBudgetEnforcement(value?: string | null): BudgetEnforcement {
    if (value === 'block') {
      return 'block';
    }
    if (value === 'downgrade') {
      return 'downgrade';
    }
    return 'monitor';
  }

  private normalizeString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private normalizeStatus(value?: string | null): LedgerStatus | undefined {
    return value === 'failed' || value === 'success' ? value : undefined;
  }

  private normalizeBillingSource(
    value?: string | null,
  ): LedgerBillingSource | undefined {
    return value === 'owner_custom' || value === 'instance_default'
      ? value
      : undefined;
  }

  private toBucketStart(date: Date, grain: LedgerGrain) {
    const bucket = new Date(date);
    if (grain === 'month') {
      bucket.setUTCDate(1);
      bucket.setUTCHours(0, 0, 0, 0);
      return bucket;
    }
    if (grain === 'week') {
      const day = bucket.getUTCDay() || 7;
      bucket.setUTCDate(bucket.getUTCDate() - day + 1);
      bucket.setUTCHours(0, 0, 0, 0);
      return bucket;
    }
    bucket.setUTCHours(0, 0, 0, 0);
    return bucket;
  }

  private formatBucketLabel(date: Date, grain: LedgerGrain) {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');

    if (grain === 'month') {
      return `${year}-${month}`;
    }
    return `${year}-${month}-${day}`;
  }

  private ensureBucket(
    bucketMap: Map<string, AggregateBucket>,
    key: string,
    label: string,
  ) {
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        key,
        label,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        requestCount: 0,
        successCount: 0,
        failedCount: 0,
      };
      bucketMap.set(key, bucket);
    }
    return bucket;
  }

  private accumulateBucket(
    bucket: AggregateBucket,
    record: AiUsageLedgerEntity,
  ) {
    bucket.promptTokens += record.promptTokens ?? 0;
    bucket.completionTokens += record.completionTokens ?? 0;
    bucket.totalTokens += record.totalTokens ?? 0;
    bucket.estimatedCost += record.estimatedCost ?? 0;
    bucket.requestCount += 1;
    if (record.status === 'success') {
      bucket.successCount += 1;
    } else {
      bucket.failedCount += 1;
    }
  }

  private groupBy(
    records: AiUsageLedgerEntity[],
    limit: number,
    pick: (
      record: AiUsageLedgerEntity,
    ) => { key: string; label: string },
  ) {
    const buckets = new Map<string, AggregateBucket>();

    records.forEach((record) => {
      const descriptor = pick(record);
      const bucket = this.ensureBucket(buckets, descriptor.key, descriptor.label);
      this.accumulateBucket(bucket, record);
    });

    return Array.from(buckets.values())
      .sort((left, right) => {
        if (right.totalTokens !== left.totalTokens) {
          return right.totalTokens - left.totalTokens;
        }
        if (right.estimatedCost !== left.estimatedCost) {
          return right.estimatedCost - left.estimatedCost;
        }
        return right.requestCount - left.requestCount;
      })
      .slice(0, limit)
      .map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        promptTokens: bucket.promptTokens,
        completionTokens: bucket.completionTokens,
        totalTokens: bucket.totalTokens,
        estimatedCost: this.roundCost(bucket.estimatedCost),
        requestCount: bucket.requestCount,
        successCount: bucket.successCount,
        failedCount: bucket.failedCount,
      }));
  }

  private sum(
    records: AiUsageLedgerEntity[],
    field: 'promptTokens' | 'completionTokens' | 'totalTokens' | 'estimatedCost',
  ) {
    return records.reduce((total, record) => total + (record[field] ?? 0), 0);
  }

  private roundCost(value: number) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }

  private getPeriodStart(date: Date, period: BudgetPeriod) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    if (period === 'monthly') {
      start.setDate(1);
    }
    return start;
  }

  private createBudgetAccumulator(): BudgetUsageAccumulator {
    return {
      daily: { tokens: 0, cost: 0 },
      monthly: { tokens: 0, cost: 0 },
    };
  }

  private accumulateBudgetUsage(
    usage: BudgetUsageAccumulator,
    record: AiUsageLedgerEntity,
    includeDaily: boolean,
  ) {
    const tokens = record.totalTokens ?? 0;
    const cost = record.estimatedCost ?? 0;
    usage.monthly.tokens += tokens;
    usage.monthly.cost += cost;
    if (includeDaily) {
      usage.daily.tokens += tokens;
      usage.daily.cost += cost;
    }
  }

  private buildBudgetStatus(
    rule: TokenUsageBudgetRule,
    usage: BudgetUsageAccumulator,
  ): TokenUsageBudgetStatus {
    return {
      enabled: rule.enabled,
      metric: rule.metric,
      enforcement: rule.enforcement,
      downgradeModel: rule.downgradeModel,
      warningRatio: rule.warningRatio,
      daily: this.buildBudgetPeriodSummary('daily', rule, usage.daily),
      monthly: this.buildBudgetPeriodSummary('monthly', rule, usage.monthly),
    };
  }

  private buildBudgetPeriodSummary(
    period: BudgetPeriod,
    rule: TokenUsageBudgetRule,
    usage: BudgetUsageAggregate,
  ): TokenUsageBudgetPeriodSummary {
    const limit = period === 'daily' ? rule.dailyLimit : rule.monthlyLimit;
    const used = this.normalizeBudgetValue(
      rule.metric,
      this.pickBudgetMetricValue(rule.metric, usage),
    );
    if (!rule.enabled || limit == null) {
      return {
        period,
        limit,
        used,
        remaining: null,
        ratio: null,
        state: 'inactive',
      };
    }

    const ratio = limit > 0 ? used / limit : null;
    const remaining = this.normalizeBudgetValue(
      rule.metric,
      Math.max(0, limit - used),
    );

    return {
      period,
      limit: this.normalizeBudgetValue(rule.metric, limit),
      used,
      remaining,
      ratio: ratio == null ? null : this.roundRatio(ratio),
      state:
        ratio != null && ratio >= 1
          ? 'exceeded'
          : ratio != null && ratio >= rule.warningRatio
            ? 'warning'
            : 'normal',
    };
  }

  private pickBudgetMetricValue(
    metric: BudgetMetric,
    usage: BudgetUsageAggregate,
  ) {
    return metric === 'cost' ? usage.cost : usage.tokens;
  }

  private normalizeBudgetValue(metric: BudgetMetric, value: number) {
    return metric === 'cost' ? this.roundCost(value) : Math.round(value);
  }

  private roundRatio(value: number) {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }

  private compareBudgetStatuses(
    left: TokenUsageBudgetStatus,
    right: TokenUsageBudgetStatus,
  ) {
    const leftWeight = this.getBudgetStatusWeight(left);
    const rightWeight = this.getBudgetStatusWeight(right);
    if (rightWeight !== leftWeight) {
      return rightWeight - leftWeight;
    }

    const leftRatio = Math.max(left.daily.ratio ?? 0, left.monthly.ratio ?? 0);
    const rightRatio = Math.max(
      right.daily.ratio ?? 0,
      right.monthly.ratio ?? 0,
    );
    return rightRatio - leftRatio;
  }

  private getBudgetStatusWeight(status: TokenUsageBudgetStatus) {
    const states = [status.daily.state, status.monthly.state];
    if (states.includes('exceeded')) {
      return 3;
    }
    if (states.includes('warning')) {
      return 2;
    }
    if (states.includes('normal')) {
      return 1;
    }
    return 0;
  }

  private collectBudgetAlerts(
    overall: TokenUsageBudgetStatus,
    characters: TokenUsageCharacterBudgetStatus[],
  ): TokenUsageBudgetAlert[] {
    const alerts: TokenUsageBudgetAlert[] = [];
    const appendAlert = (
      status: TokenUsageBudgetStatus,
      scope: 'overall' | 'character',
      period: BudgetPeriod,
      character?: { id: string; name: string },
    ) => {
      const summary = period === 'daily' ? status.daily : status.monthly;
      if (
        summary.state !== 'warning' &&
        summary.state !== 'exceeded'
      ) {
        return;
      }
      if (summary.limit == null || summary.ratio == null) {
        return;
      }
      alerts.push({
        level: summary.state,
        scope,
        characterId: character?.id ?? null,
        characterName: character?.name ?? null,
        period,
        metric: status.metric,
        used: summary.used,
        limit: summary.limit,
        ratio: summary.ratio,
        message: this.formatBudgetAlertMessage(
          scope,
          period,
          summary.state,
          character?.name,
        ),
      });
    };

    appendAlert(overall, 'overall', 'daily');
    appendAlert(overall, 'overall', 'monthly');
    characters.forEach((item) => {
      appendAlert(item.budget, 'character', 'daily', {
        id: item.characterId,
        name: item.characterName,
      });
      appendAlert(item.budget, 'character', 'monthly', {
        id: item.characterId,
        name: item.characterName,
      });
    });

    return alerts.sort((left, right) => {
      if (left.level !== right.level) {
        return left.level === 'exceeded' ? -1 : 1;
      }
      return right.ratio - left.ratio;
    });
  }

  private formatBudgetAlertMessage(
    scope: 'overall' | 'character',
    period: BudgetPeriod,
    state: 'warning' | 'exceeded',
    characterName?: string,
  ) {
    const scopeLabel =
      scope === 'overall' ? '整体' : `${characterName ?? '角色'}`;
    const periodLabel = period === 'daily' ? '日' : '月';
    const actionLabel = state === 'exceeded' ? '已超出' : '已接近';
    return `${scopeLabel}${periodLabel}预算${actionLabel}阈值`;
  }

  private formatSceneLabel(scene: string) {
    const sceneMap: Record<string, string> = {
      chat_reply: '单聊回复',
      group_reply: '群聊回复',
      moment_post_generate: '朋友圈生成',
      moment_comment_generate: '朋友圈评论生成',
      feed_post_generate: '广场动态生成',
      feed_comment_generate: '动态评论生成',
      channel_post_generate: '视频号生成',
      social_greeting_generate: '社交问候生成',
      memory_compress: '记忆压缩',
      character_factory_extract: '角色工厂抽取',
      quick_character_generate: '快速生成角色',
      intent_classify: '意图分类',
    };

    return sceneMap[scene] ?? scene;
  }

  private async buildLabelMaps(records: AiUsageLedgerEntity[]) {
    const conversationIds = Array.from(
      new Set(
        records
          .map((record) => record.conversationId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const groupIds = Array.from(
      new Set(
        records
          .map((record) => record.groupId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const characterIds = Array.from(
      new Set(
        records
          .map((record) => record.characterId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [conversations, groups, characters] = await Promise.all([
      conversationIds.length
        ? this.conversationRepo.find({
            where: { id: In(conversationIds) },
          })
        : Promise.resolve([]),
      groupIds.length
        ? this.groupRepo.find({
            where: { id: In(groupIds) },
          })
        : Promise.resolve([]),
      characterIds.length
        ? this.characterRepo.find({
            where: { id: In(characterIds) },
          })
        : Promise.resolve([]),
    ]);

    return {
      conversationMap: new Map(conversations.map((item) => [item.id, item.title])),
      groupMap: new Map(groups.map((item) => [item.id, item.name])),
      characterMap: new Map(characters.map((item) => [item.id, item.name])),
    };
  }

  private resolveTargetLabel(
    record: AiUsageLedgerEntity,
    labelMaps: {
      conversationMap: Map<string, string>;
      groupMap: Map<string, string>;
      characterMap: Map<string, string>;
    },
  ) {
    if (record.scopeLabel?.trim()) {
      return record.scopeLabel.trim();
    }
    if (record.conversationId && labelMaps.conversationMap.has(record.conversationId)) {
      return labelMaps.conversationMap.get(record.conversationId) as string;
    }
    if (record.groupId && labelMaps.groupMap.has(record.groupId)) {
      return labelMaps.groupMap.get(record.groupId) as string;
    }
    if (record.characterName?.trim()) {
      return record.characterName.trim();
    }
    if (record.characterId && labelMaps.characterMap.has(record.characterId)) {
      return labelMaps.characterMap.get(record.characterId) as string;
    }
    return record.scopeId || record.characterId || record.groupId || '未识别对象';
  }
}
