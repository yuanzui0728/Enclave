export type TokenUsageStatus = "success" | "failed";

export type TokenUsageSurface = "app" | "admin" | "scheduler" | "system";

export type TokenUsageBillingSource = "owner_custom" | "instance_default";

export type TokenUsageScopeType =
  | "character"
  | "conversation"
  | "group"
  | "world"
  | "admin_task";

export type TokenUsageGrain = "day" | "week" | "month";

export type TokenUsageBudgetMetric = "tokens" | "cost";

export type TokenUsageBudgetState = "inactive" | "normal" | "warning" | "exceeded";

export type TokenUsageBudgetEnforcement = "monitor" | "downgrade" | "block";

export interface TokenPricingCatalogItem {
  model: string;
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  enabled: boolean;
  note?: string;
}

export interface TokenPricingCatalog {
  currency: "CNY" | "USD";
  items: TokenPricingCatalogItem[];
}

export interface TokenUsageBudgetRule {
  enabled: boolean;
  metric: TokenUsageBudgetMetric;
  enforcement?: TokenUsageBudgetEnforcement;
  downgradeModel?: string | null;
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  warningRatio?: number;
}

export interface TokenUsageCharacterBudgetRule extends TokenUsageBudgetRule {
  characterId: string;
  note?: string;
}

export interface TokenUsageBudgetConfig {
  overall: TokenUsageBudgetRule;
  characters: TokenUsageCharacterBudgetRule[];
}

export interface TokenUsageBudgetPeriodSummary {
  period: "daily" | "monthly";
  limit: number | null;
  used: number;
  remaining: number | null;
  ratio: number | null;
  state: TokenUsageBudgetState;
}

export interface TokenUsageBudgetStatus {
  enabled: boolean;
  metric: TokenUsageBudgetMetric;
  enforcement: TokenUsageBudgetEnforcement;
  downgradeModel: string | null;
  warningRatio: number;
  daily: TokenUsageBudgetPeriodSummary;
  monthly: TokenUsageBudgetPeriodSummary;
}

export interface TokenUsageBudgetAlert {
  level: "warning" | "exceeded";
  scope: "overall" | "character";
  characterId?: string | null;
  characterName?: string | null;
  period: "daily" | "monthly";
  metric: TokenUsageBudgetMetric;
  used: number;
  limit: number;
  ratio: number;
  message: string;
}

export interface TokenUsageCharacterBudgetStatus {
  characterId: string;
  characterName: string;
  note?: string;
  budget: TokenUsageBudgetStatus;
}

export interface TokenUsageBudgetSummary {
  currency: "CNY" | "USD";
  generatedAt: string;
  overall: TokenUsageBudgetStatus;
  characters: TokenUsageCharacterBudgetStatus[];
  alerts: TokenUsageBudgetAlert[];
}

export interface TokenUsageBudgetSnapshot {
  config: TokenUsageBudgetConfig;
  summary: TokenUsageBudgetSummary;
}

export interface TokenUsageOverview {
  currency: "CNY" | "USD";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  requestCount: number;
  successCount: number;
  failedCount: number;
  activeCharacterCount: number;
}

export interface TokenUsageTrendPoint {
  bucketStart: string;
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  requestCount: number;
  successCount: number;
  failedCount: number;
}

export interface TokenUsageBreakdownItem {
  key: string;
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  requestCount: number;
  successCount: number;
  failedCount: number;
}

export interface TokenUsageBreakdownResponse {
  currency: "CNY" | "USD";
  byCharacter: TokenUsageBreakdownItem[];
  byConversation: TokenUsageBreakdownItem[];
  byScene: TokenUsageBreakdownItem[];
  byModel: TokenUsageBreakdownItem[];
  byBillingSource: TokenUsageBreakdownItem[];
}

export interface TokenUsageRecord {
  id: string;
  occurredAt: string;
  status: TokenUsageStatus;
  surface: TokenUsageSurface;
  scene: string;
  scopeType: TokenUsageScopeType;
  scopeId?: string | null;
  targetLabel: string;
  characterId?: string | null;
  characterName?: string | null;
  conversationId?: string | null;
  groupId?: string | null;
  model?: string | null;
  billingSource?: TokenUsageBillingSource | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: "CNY" | "USD";
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface TokenUsageRecordListResponse {
  items: TokenUsageRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TokenUsageQuery {
  from?: string;
  to?: string;
  grain?: TokenUsageGrain;
  characterId?: string;
  conversationId?: string;
  groupId?: string;
  scene?: string;
  model?: string;
  billingSource?: TokenUsageBillingSource;
  status?: TokenUsageStatus;
  errorCode?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
}

export interface TokenUsageDowngradeModelSwitchItem {
  key: string;
  requestedModel: string | null;
  appliedModel: string | null;
  requestCount: number;
  successCount: number;
  estimatedCost: number;
  estimatedOriginalCost: number;
  estimatedSavings: number;
}

export interface TokenUsageDowngradeInsights {
  currency: "CNY" | "USD";
  requestCount: number;
  successCount: number;
  successRate: number | null;
  affectedCharacterCount: number;
  estimatedCost: number;
  estimatedOriginalCost: number;
  estimatedSavings: number;
  savingsRate: number | null;
  traceableRequestCount: number;
  untraceableRequestCount: number;
  byModelSwitch: TokenUsageDowngradeModelSwitchItem[];
}

export interface TokenUsageDowngradeReviewSample {
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
}

export interface TokenUsageDowngradeCharacterQualityItem {
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
  tooWeakSamples: TokenUsageDowngradeReviewSample[];
  pendingOutcomeSamples: TokenUsageDowngradeReviewSample[];
}

export interface TokenUsageDowngradeQualityInsights {
  generatedAt: string;
  requestCount: number;
  conversationScopedRequestCount: number;
  unscopedRequestCount: number;
  distinctConversationCount: number;
  reviewedConversationCount: number;
  resolvedConversationCount: number;
  importantConversationCount: number;
  acceptableConversationCount: number;
  tooWeakConversationCount: number;
  immediateContinuationCount: number;
  continuedWithin24hCount: number;
  postDowngradeFailureCount: number;
  postDowngradeBlockedCount: number;
  immediateContinuationRate: number | null;
  continuedWithin24hRate: number | null;
  postDowngradeFailureRate: number | null;
  postDowngradeBlockedRate: number | null;
  reviewCoverageRate: number | null;
  acceptableReviewRate: number | null;
  tooWeakReviewRate: number | null;
  proxyQualityScore: number | null;
  tooWeakSamples: TokenUsageDowngradeReviewSample[];
  pendingOutcomeSamples: TokenUsageDowngradeReviewSample[];
  byCharacter: TokenUsageDowngradeCharacterQualityItem[];
}
