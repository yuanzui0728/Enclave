export type CyberAvatarProfileStatus =
  | "draft"
  | "ready"
  | "paused"
  | "rebuilding"
  | "error";

export type CyberAvatarSignalStatus =
  | "pending"
  | "processing"
  | "merged"
  | "ignored"
  | "failed";

export type CyberAvatarSignalType =
  | "direct_message"
  | "group_message"
  | "moment_post"
  | "feed_post"
  | "channel_post"
  | "feed_interaction"
  | "friendship_event"
  | "owner_profile_update"
  | "search_activity"
  | "favorite_action"
  | "real_world_action"
  | "location_update"
  | "real_world_item"
  | "real_world_brief";

export type CyberAvatarRunMode =
  | "incremental"
  | "deep_refresh"
  | "full_rebuild"
  | "projection_only"
  | "preview"
  | "real_world_sync";

export type CyberAvatarRunTrigger =
  | "event_flush"
  | "scheduler"
  | "manual"
  | "backfill";

export type CyberAvatarRunStatus = "success" | "partial" | "skipped" | "failed";
export type CyberAvatarRealWorldItemStatus =
  | "accepted"
  | "filtered_duplicate"
  | "filtered_low_score"
  | "filtered_blocked_source";
export type CyberAvatarRealWorldBriefStatus = "active" | "archived" | "failed";
export type CyberAvatarRealWorldProviderMode = "mock" | "google_news_rss";

export interface CyberAvatarLiveState {
  focus: string[];
  mood: string;
  energy: string;
  socialTemperature: string;
  activeTopics: string[];
  openLoops: string[];
}

export interface CyberAvatarRecentState {
  recurringTopics: string[];
  recentGoals: string[];
  recentFriction: string[];
  recentPreferenceSignals: string[];
  recentRelationshipSignals: string[];
}

export interface CyberAvatarStableCore {
  identitySummary: string;
  communicationStyle: string[];
  decisionStyle: string[];
  preferenceModel: string[];
  socialPosture: string[];
  routinePatterns: string[];
  boundaries: string[];
  riskTolerance: string[];
}

export interface CyberAvatarConfidence {
  liveState: number;
  recentState: number;
  stableCore: number;
}

export interface CyberAvatarSourceCoverage {
  windowDays: number;
  signalCount: number;
  coveredSurfaces: string[];
  missingSurfaces: string[];
}

export interface CyberAvatarPromptProjection {
  coreInstruction: string;
  worldInteractionPrompt: string;
  realWorldInteractionPrompt: string;
  proactivePrompt: string;
  actionPlanningPrompt: string;
  memoryBlock: string;
}

export interface CyberAvatarProfile {
  id: string;
  ownerId: string;
  status: CyberAvatarProfileStatus;
  version: number;
  liveState: CyberAvatarLiveState;
  recentState: CyberAvatarRecentState;
  stableCore: CyberAvatarStableCore;
  confidence: CyberAvatarConfidence;
  sourceCoverage: CyberAvatarSourceCoverage;
  promptProjection: CyberAvatarPromptProjection;
  signalCount: number;
  pendingSignalCount: number;
  lastSignalAt?: string | null;
  lastBuiltAt?: string | null;
  lastProjectedAt?: string | null;
  lastRunId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CyberAvatarSignal {
  id: string;
  ownerId: string;
  signalType: CyberAvatarSignalType;
  sourceSurface: string;
  sourceEntityType: string;
  sourceEntityId: string;
  summaryText: string;
  payload: Record<string, unknown> | null;
  weight: number;
  status: CyberAvatarSignalStatus;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CyberAvatarRunSummary {
  id: string;
  ownerId: string;
  mode: CyberAvatarRunMode;
  trigger: CyberAvatarRunTrigger;
  status: CyberAvatarRunStatus;
  signalCount: number;
  profileVersion: number;
  skipReason?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CyberAvatarRunDetail extends CyberAvatarRunSummary {
  windowStartedAt?: string | null;
  windowEndedAt?: string | null;
  inputSnapshot?: Record<string, unknown> | null;
  aggregationPayload?: Record<string, unknown> | null;
  promptSnapshot?: Record<string, unknown> | null;
  llmOutputPayload?: Record<string, unknown> | null;
  mergeDiffPayload?: Record<string, unknown> | null;
}

export interface CyberAvatarPromptTemplates {
  incrementalDigestPrompt: string;
  deepRefreshPrompt: string;
  projectionCoreInstructionTemplate: string;
  projectionWorldInteractionTemplate: string;
  projectionRealWorldInteractionTemplate: string;
  projectionProactiveTemplate: string;
  projectionActionPlanningTemplate: string;
  projectionMemoryTemplate: string;
}

export interface CyberAvatarInteractionPromptTemplates {
  realWorldBriefPrompt: string;
}

// 单人世界中枢注入块的引导语 / 抽取 prompt（外部化自 world-context-hub + owner-open-question）。
// <tag> 包裹与结构留在代码里，只有可读引导语 / LLM 抽取 prompt 走配置。
export interface CyberAvatarContextHubTemplates {
  ownerPortraitGuidance: string;
  ownerPortraitLowConfidenceHint: string;
  worldFocusGuidance: string;
  worldRecentEpisodesGuidance: string;
  relevantMemoryGuidance: string;
  openQuestionsBlockGuidance: string;
  // 占位符 {{transcript}}=对话片段、{{openQuestions}}=此前已记录的待解决问题区块。
  openQuestionExtractionPrompt: string;
}

// 面向本人的「分析自己」提示词 + 兜底展示文案（原先硬编码在 cyber-avatar-self.service.ts）。
export interface CyberAvatarSelfFacingPromptConfig {
  // —— LLM 提示词 ——
  analysisPrompt: string; // 占位符 {{profile}}
  chatSystemPrompt: string; // 占位符 {{knowledge}} {{coreInstruction}} {{lowConfidenceNote}}
  chatLowConfidenceNote: string; // 仅 confidence.stableCore < 0.4 时填进 {{lowConfidenceNote}}
  // —— 兜底展示文案 ——
  analysisEmptyHeadline: string;
  analysisEmptyCaveat: string;
  analysisDefaultCaveat: string;
  chatNoDataReply: string;
}

export interface CyberAvatarSourceToggles {
  includeDirectMessages: boolean;
  includeGroupMessages: boolean;
  includeMomentPosts: boolean;
  includeFeedPosts: boolean;
  includeChannelPosts: boolean;
  includeFeedInteractions: boolean;
  includeFriendshipEvents: boolean;
  includeOwnerProfileUpdates: boolean;
  includeSearchActivity: boolean;
  includeFavoriteActions: boolean;
  includeRealWorldActions: boolean;
  includeLocationUpdates: boolean;
  includeRealWorldItems: boolean;
  includeRealWorldBriefs: boolean;
}

export interface CyberAvatarSchedulingRules {
  minSignalsPerIncrementalRun: number;
  maxSignalsPerIncrementalRun: number;
  minMinutesBetweenIncrementalRuns: number;
  incrementalScanEveryMinutes: number;
  deepRefreshEveryHours: number;
  recentWindowDays: number;
  stableCoreWindowDays: number;
  fullRebuildWindowDays: number;
}

export interface CyberAvatarMergeRules {
  stableCoreChangeThreshold: number;
  boundaryChangeThreshold: number;
  preferenceDecayDays: number;
  openLoopDecayDays: number;
}

export interface CyberAvatarInteractionGoogleNewsRules {
  editionLanguage: string;
  editionRegion: string;
  editionCeid: string;
  maxEntriesPerQuery: number;
  fallbackToMockOnEmpty: boolean;
}

export interface CyberAvatarInteractionRules {
  enabled: boolean;
  realWorldSyncEnabled: boolean;
  createSignals: boolean;
  feedNeedDiscoveryEnabled: boolean;
  providerMode: CyberAvatarRealWorldProviderMode;
  ownerQueryOverrides: string[];
  maxQueriesPerRun: number;
  defaultRecencyHours: number;
  maxItemsPerQuery: number;
  maxAcceptedItemsPerRun: number;
  maxItemsPerBrief: number;
  minimumItemScore: number;
  sourceAllowlist: string[];
  sourceBlocklist: string[];
  syncEveryHours: number;
  googleNews: CyberAvatarInteractionGoogleNewsRules;
  promptTemplates: CyberAvatarInteractionPromptTemplates;
}

export interface CyberAvatarRuntimeRules {
  enabled: boolean;
  captureEnabled: boolean;
  incrementalUpdateEnabled: boolean;
  deepRefreshEnabled: boolean;
  projectionEnabled: boolean;
  pauseAutoUpdates: boolean;
  sourceToggles: CyberAvatarSourceToggles;
  scheduling: CyberAvatarSchedulingRules;
  mergeRules: CyberAvatarMergeRules;
  signalWeights: Record<string, number>;
  promptTemplates: CyberAvatarPromptTemplates;
  contextHubTemplates: CyberAvatarContextHubTemplates;
  interaction: CyberAvatarInteractionRules;
  selfFacing: CyberAvatarSelfFacingPromptConfig;
}

export interface CyberAvatarRealWorldItem {
  id: string;
  ownerId: string;
  status: CyberAvatarRealWorldItemStatus;
  providerMode: CyberAvatarRealWorldProviderMode;
  queryText: string;
  sourceName: string;
  sourceUrl?: string | null;
  title: string;
  snippet: string;
  normalizedSummary: string;
  topicTags: string[];
  credibilityScore: number;
  relevanceScore: number;
  compositeScore: number;
  publishedAt?: string | null;
  capturedAt: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CyberAvatarRealWorldBrief {
  id: string;
  ownerId: string;
  status: CyberAvatarRealWorldBriefStatus;
  briefDate: string;
  title: string;
  summary: string;
  bulletPoints: string[];
  queryHints: string[];
  needSignals: string[];
  relatedItemIds: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CyberAvatarRealWorldOverview {
  rules: CyberAvatarInteractionRules;
  stats: {
    acceptedItems: number;
    filteredItems: number;
    activeBriefs: number;
    latestAcceptedAt?: string | null;
    latestBriefAt?: string | null;
  };
  recentItems: CyberAvatarRealWorldItem[];
  recentBriefs: CyberAvatarRealWorldBrief[];
  latestBrief: CyberAvatarRealWorldBrief | null;
  queryPreview: string[];
}

export interface CyberAvatarOverview {
  rules: CyberAvatarRuntimeRules;
  profile: CyberAvatarProfile;
  recentSignals: CyberAvatarSignal[];
  recentRuns: CyberAvatarRunSummary[];
  realWorld: CyberAvatarRealWorldOverview;
}

// ---- 用户态「赛博分身」(self) ----------------------------------------------
// 前台用户查看自己的分身画像 / 对话 / 结论分析 / 重建。区别于跨用户的「分身相遇」。

export type CyberAvatarSelfReadiness = "empty" | "building" | "ready";

// 分身专属 AI 立绘状态：none=未生成（前台回退 SVG 剪影占位）；ready=已生成有图。
// 生成中/失败是前台 mutation 瞬时态，不落库、不在此枚举。
export type CyberAvatarPortraitStatus = "none" | "ready";

export interface CyberAvatarSelfProfile {
  status: CyberAvatarProfileStatus;
  readiness: CyberAvatarSelfReadiness;
  version: number;
  liveState: CyberAvatarLiveState;
  recentState: CyberAvatarRecentState;
  stableCore: CyberAvatarStableCore;
  confidence: CyberAvatarConfidence;
  sourceCoverage: CyberAvatarSourceCoverage;
  signalCount: number;
  pendingSignalCount: number;
  lastBuiltAt?: string | null;
  lastSignalAt?: string | null;
  // 分身专属 AI 立绘（相对 URL，经 /api/moments/media/:file 内容寻址永久缓存 serve）。
  // 为空 → 前台渲 SVG 剪影占位（CyberAvatarFigure）；有值 → <img> 懒加载叠在占位上。
  portraitImageUrl?: string | null;
  portraitUpdatedAt?: string | null;
  portraitStatus?: CyberAvatarPortraitStatus;
}

export interface CyberAvatarSelfChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CyberAvatarSelfChatRequest {
  message: string;
}

export interface CyberAvatarSelfChatResponse {
  reply: string;
  readiness: CyberAvatarSelfReadiness;
  signalCount: number;
}

export interface CyberAvatarSelfChatHistoryResponse {
  turns: CyberAvatarSelfChatTurn[];
}

export interface CyberAvatarSelfAnalysisReport {
  generatedAt: string;
  basedOnSignalCount: number;
  confidenceLevel: "low" | "medium" | "high";
  headline: string;
  personalitySummary: string;
  strengths: string[];
  blindSpots: string[];
  recurringPatterns: string[];
  socialStyle: string;
  suggestions: string[];
  caveat: string;
}

export interface CyberAvatarSelfRebuildRequest {
  mode?: "incremental" | "full";
}

export interface CyberAvatarSelfRebuildResponse {
  status: CyberAvatarRunStatus;
  mode: CyberAvatarRunMode;
  signalCount: number;
  profileVersion: number;
  skipReason?: string | null;
  cooldownUntil?: string | null;
}
