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
  | "location_update";

export type CyberAvatarRunMode =
  | "incremental"
  | "deep_refresh"
  | "full_rebuild"
  | "projection_only"
  | "preview";

export type CyberAvatarRunTrigger =
  | "event_flush"
  | "scheduler"
  | "manual"
  | "backfill";

export type CyberAvatarRunStatus = "success" | "partial" | "skipped" | "failed";

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

export interface CyberAvatarSourceToggles {
  includeDirectMessages: boolean;
  includeGroupMessages: boolean;
  includeMomentPosts: boolean;
  includeFeedPosts: boolean;
  includeChannelPosts: boolean;
  includeFeedInteractions: boolean;
  includeFriendshipEvents: boolean;
  includeOwnerProfileUpdates: boolean;
  includeLocationUpdates: boolean;
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
}

export interface CyberAvatarOverview {
  rules: CyberAvatarRuntimeRules;
  profile: CyberAvatarProfile;
  recentSignals: CyberAvatarSignal[];
  recentRuns: CyberAvatarRunSummary[];
}

