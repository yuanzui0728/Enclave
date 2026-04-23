export type CyberAvatarProfileStatus =
  | 'draft'
  | 'ready'
  | 'paused'
  | 'rebuilding'
  | 'error';

export type CyberAvatarSignalStatus =
  | 'pending'
  | 'processing'
  | 'merged'
  | 'ignored'
  | 'failed';

export type CyberAvatarSignalType =
  | 'direct_message'
  | 'group_message'
  | 'moment_post'
  | 'feed_post'
  | 'channel_post'
  | 'feed_interaction'
  | 'friendship_event'
  | 'owner_profile_update'
  | 'search_activity'
  | 'favorite_action'
  | 'real_world_action'
  | 'location_update'
  | 'real_world_item'
  | 'real_world_brief';

export type CyberAvatarRunMode =
  | 'incremental'
  | 'deep_refresh'
  | 'full_rebuild'
  | 'projection_only'
  | 'preview'
  | 'real_world_sync';

export type CyberAvatarRunTrigger =
  | 'event_flush'
  | 'scheduler'
  | 'manual'
  | 'backfill';

export type CyberAvatarRunStatus = 'success' | 'partial' | 'skipped' | 'failed';
export type CyberAvatarRealWorldItemStatus =
  | 'accepted'
  | 'filtered_duplicate'
  | 'filtered_low_score'
  | 'filtered_blocked_source';
export type CyberAvatarRealWorldBriefStatus = 'active' | 'archived' | 'failed';
export type CyberAvatarRealWorldProviderMode = 'mock' | 'google_news_rss';

export type CyberAvatarSignalInput = {
  ownerId: string;
  signalType: CyberAvatarSignalType;
  sourceSurface: string;
  sourceEntityType: string;
  sourceEntityId: string;
  dedupeKey?: string | null;
  summaryText: string;
  payload?: Record<string, unknown> | null;
  weight?: number | null;
  occurredAt?: Date | null;
};

export type CyberAvatarLiveState = {
  focus: string[];
  mood: string;
  energy: string;
  socialTemperature: string;
  activeTopics: string[];
  openLoops: string[];
};

export type CyberAvatarRecentState = {
  recurringTopics: string[];
  recentGoals: string[];
  recentFriction: string[];
  recentPreferenceSignals: string[];
  recentRelationshipSignals: string[];
};

export type CyberAvatarStableCore = {
  identitySummary: string;
  communicationStyle: string[];
  decisionStyle: string[];
  preferenceModel: string[];
  socialPosture: string[];
  routinePatterns: string[];
  boundaries: string[];
  riskTolerance: string[];
};

export type CyberAvatarConfidence = {
  liveState: number;
  recentState: number;
  stableCore: number;
};

export type CyberAvatarSourceCoverage = {
  windowDays: number;
  signalCount: number;
  coveredSurfaces: string[];
  missingSurfaces: string[];
};

export type CyberAvatarPromptProjection = {
  coreInstruction: string;
  worldInteractionPrompt: string;
  realWorldInteractionPrompt: string;
  proactivePrompt: string;
  actionPlanningPrompt: string;
  memoryBlock: string;
};

export type CyberAvatarProfilePayload = {
  liveState: CyberAvatarLiveState;
  recentState: CyberAvatarRecentState;
  stableCore: CyberAvatarStableCore;
  confidence: CyberAvatarConfidence;
  sourceCoverage: CyberAvatarSourceCoverage;
  promptProjection: CyberAvatarPromptProjection;
};

export type CyberAvatarPromptTemplates = {
  incrementalDigestPrompt: string;
  deepRefreshPrompt: string;
  projectionCoreInstructionTemplate: string;
  projectionWorldInteractionTemplate: string;
  projectionRealWorldInteractionTemplate: string;
  projectionProactiveTemplate: string;
  projectionActionPlanningTemplate: string;
  projectionMemoryTemplate: string;
};

export type CyberAvatarInteractionPromptTemplates = {
  realWorldBriefPrompt: string;
};

export type CyberAvatarSourceToggles = {
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
};

export type CyberAvatarSchedulingRules = {
  minSignalsPerIncrementalRun: number;
  maxSignalsPerIncrementalRun: number;
  minMinutesBetweenIncrementalRuns: number;
  incrementalScanEveryMinutes: number;
  deepRefreshEveryHours: number;
  recentWindowDays: number;
  stableCoreWindowDays: number;
  fullRebuildWindowDays: number;
};

export type CyberAvatarMergeRules = {
  stableCoreChangeThreshold: number;
  boundaryChangeThreshold: number;
  preferenceDecayDays: number;
  openLoopDecayDays: number;
};

export type CyberAvatarInteractionGoogleNewsRules = {
  editionLanguage: string;
  editionRegion: string;
  editionCeid: string;
  maxEntriesPerQuery: number;
  fallbackToMockOnEmpty: boolean;
};

export type CyberAvatarInteractionRules = {
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
};

export type CyberAvatarRuntimeRules = {
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
  interaction: CyberAvatarInteractionRules;
};

export type CyberAvatarAggregationPayload = {
  signalCount: number;
  signalTypes: Record<string, number>;
  surfaces: Record<string, number>;
  topKeywords: string[];
  summaries: string[];
  latestOccurredAt?: string | null;
  earliestOccurredAt?: string | null;
};
