import type {
  RealityLinkApplyMode,
  RealityLinkConfig,
  RealityLinkSubjectType,
  ScenePrompts,
} from "./characters";

export type RealWorldSyncProviderMode = "mock" | "google_news_rss";
export type RealWorldNewsBulletinSlot = "morning" | "noon" | "evening";
export type RealWorldSignalStatus =
  | "accepted"
  | "filtered_low_confidence"
  | "filtered_identity_mismatch"
  | "filtered_duplicate"
  | "manual_excluded";
export type RealWorldSignalType =
  | "news_article"
  | "official_post"
  | "interview"
  | "public_appearance"
  | "product_release"
  | "other";
export type RealWorldDigestStatus =
  | "draft"
  | "active"
  | "superseded"
  | "failed";
export type RealWorldDigestApplyMode = "shadow" | "live" | "manual";
export type RealWorldSyncRunType =
  | "signal_collect"
  | "digest_generate"
  | "manual_resync";
export type RealWorldSyncRunStatus =
  | "running"
  | "success"
  | "failed"
  | "partial";

export interface RealWorldSyncPromptTemplates {
  signalNormalizationPrompt: string;
  dailyDigestPrompt: string;
  scenePatchPrompt: string;
  realityMomentPrompt: string;
}

export interface RealWorldSyncGoogleNewsConfig {
  editionLanguage: string;
  editionRegion: string;
  editionCeid: string;
  maxEntriesPerQuery: number;
  fallbackToMockOnEmpty: boolean;
}

export interface RealWorldSyncRules {
  providerMode: RealWorldSyncProviderMode;
  defaultLocale: string;
  defaultSourceAllowlist: string[];
  defaultSourceBlocklist: string[];
  defaultRecencyHours: number;
  defaultMaxSignalsPerRun: number;
  defaultMinimumConfidence: number;
  googleNews: RealWorldSyncGoogleNewsConfig;
  promptTemplates: RealWorldSyncPromptTemplates;
}

export interface RealWorldSignalRecord {
  id: string;
  characterId: string;
  syncDate: string;
  signalType: RealWorldSignalType;
  title: string;
  sourceName: string;
  sourceUrl?: string | null;
  publishedAt?: string | null;
  capturedAt: string;
  snippet?: string | null;
  normalizedSummary?: string | null;
  credibilityScore: number;
  relevanceScore: number;
  identityMatchScore: number;
  status: RealWorldSignalStatus;
  metadata?: Record<string, unknown> | null;
}

export interface RealWorldDigestRecord {
  id: string;
  characterId: string;
  syncDate: string;
  status: RealWorldDigestStatus;
  signalIds: string[];
  dailySummary: string;
  behaviorSummary?: string | null;
  stanceShiftSummary?: string | null;
  scenePatchPayload: ScenePrompts;
  globalOverlay?: string | null;
  realityMomentAnchorSignalId?: string | null;
  realityMomentBrief?: string | null;
  appliedMode?: RealWorldDigestApplyMode | null;
  appliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RealWorldSyncRunRecord {
  id: string;
  characterId: string;
  runType: RealWorldSyncRunType;
  status: RealWorldSyncRunStatus;
  startedAt: string;
  finishedAt?: string | null;
  searchQuery?: string | null;
  acceptedSignalCount: number;
  filteredSignalCount: number;
  digestId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RealWorldSyncCharacterSummary {
  characterId: string;
  characterName: string;
  characterAvatar: string;
  isWorldNewsDesk: boolean;
  enabled: boolean;
  applyMode: RealityLinkApplyMode;
  subjectType: RealityLinkSubjectType;
  subjectName: string;
  hasActiveDigest: boolean;
  activeDigestId?: string | null;
  latestRunStatus?: RealWorldSyncRunStatus | null;
  latestRunAt?: string | null;
  todayAcceptedSignalCount: number;
  hasRealityLinkedMomentToday: boolean;
  todayBulletinSlots: RealWorldNewsBulletinSlot[];
}

export interface RealWorldSyncOverview {
  rules: RealWorldSyncRules;
  stats: {
    enabledCharacters: number;
    liveCharacters: number;
    activeDigests: number;
    signalsToday: number;
    realityLinkedMomentsToday: number;
    newsBulletinsToday: number;
  };
  recentRuns: RealWorldSyncRunRecord[];
  recentSignals: RealWorldSignalRecord[];
  activeDigests: RealWorldDigestRecord[];
  characters: RealWorldSyncCharacterSummary[];
}

export interface RealWorldSyncCharacterDetail {
  characterId: string;
  characterName: string;
  characterAvatar: string;
  isWorldNewsDesk: boolean;
  config: RealityLinkConfig;
  activeDigest?: RealWorldDigestRecord | null;
  recentRuns: RealWorldSyncRunRecord[];
  recentSignals: RealWorldSignalRecord[];
  recentDigests: RealWorldDigestRecord[];
  hasRealityLinkedMomentToday: boolean;
  todayBulletinSlots: RealWorldNewsBulletinSlot[];
}

export interface RealWorldSyncRunRequest {
  characterId?: string | null;
}

export interface RealWorldSyncRunResult {
  success: boolean;
  successCount: number;
  failedCount: number;
  touchedCharacterIds: string[];
}

export interface RealWorldNewsBulletinPublishRequest {
  slot?: RealWorldNewsBulletinSlot | null;
}

export interface RealWorldNewsBulletinPublishResult {
  success: boolean;
  created: boolean;
  slot: RealWorldNewsBulletinSlot | null;
  summary: string;
  postId?: string | null;
}
