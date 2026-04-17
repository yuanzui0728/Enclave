export type FollowupRuntimeExecutionMode = "dry_run" | "emit_messages";
export type FollowupRunStatus = "success" | "skipped" | "failed";
export type FollowupOpenLoopStatus =
  | "open"
  | "watching"
  | "recommended"
  | "resolved"
  | "dismissed"
  | "expired";
export type FollowupRecommendationStatus =
  | "draft"
  | "sent"
  | "opened"
  | "friend_request_started"
  | "friend_request_pending"
  | "friend_added"
  | "chat_started"
  | "resolved"
  | "dismissed"
  | "expired";
export type FollowupSourceThreadType = "direct" | "group";
export type FollowupRecommendationRelationshipState =
  | "friend"
  | "pending"
  | "not_friend";

export interface FollowupRuntimeCandidateWeights {
  existingFriendBoost: number;
  domainMatchWeight: number;
  relationshipMatchWeight: number;
  sameSourcePenalty: number;
  pendingRequestPenalty: number;
  recentRecommendationPenalty: number;
}

export interface FollowupRuntimePromptTemplates {
  openLoopExtractionPrompt: string;
  handoffMessagePrompt: string;
  friendRequestGreetingPrompt: string;
  friendRequestNoticePrompt: string;
}

export interface FollowupRuntimeTextTemplates {
  jobSummarySuccess: string;
  jobSummarySkippedDisabled: string;
  jobSummarySkippedNoSignals: string;
  fallbackMessage: string;
  recommendationBadge: string;
  friendRequestFallbackGreeting: string;
  friendRequestFallbackMessage: string;
  friendRequestBadge: string;
}

export interface FollowupRuntimeRules {
  enabled: boolean;
  executionMode: FollowupRuntimeExecutionMode;
  autoSendFriendRequestToNotFriend: boolean;
  scanIntervalMinutes: number;
  lookbackHours: number;
  quietHoursThreshold: number;
  maxSourceMessagesPerThread: number;
  maxOpenLoopsPerRun: number;
  maxRecommendationsPerRun: number;
  dailyRecommendationLimit: number;
  minOpenLoopScore: number;
  minHandoffNeedScore: number;
  sameTopicCooldownHours: number;
  candidateWeights: FollowupRuntimeCandidateWeights;
  promptTemplates: FollowupRuntimePromptTemplates;
  textTemplates: FollowupRuntimeTextTemplates;
}

export interface FollowupRunRecord {
  id: string;
  triggerType: "scheduler" | "manual" | "event";
  status: FollowupRunStatus;
  startedAt: string;
  finishedAt?: string | null;
  sourceWindowStartedAt?: string | null;
  sourceWindowEndedAt?: string | null;
  candidateLoopCount: number;
  selectedLoopCount: number;
  emittedRecommendationCount: number;
  summary?: string | null;
  skipReason?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowupOpenLoopRecord {
  id: string;
  topicKey: string;
  status: FollowupOpenLoopStatus;
  summary: string;
  sourceThreadId: string;
  sourceThreadType: FollowupSourceThreadType;
  sourceThreadTitle?: string | null;
  sourceMessageId?: string | null;
  sourceCharacterIds: string[];
  domainHints: string[];
  targetRelationshipType?: string | null;
  urgencyScore: number;
  closureScore: number;
  handoffNeedScore: number;
  reasonSummary?: string | null;
  lastMentionedAt: string;
  recommendedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowupRecommendationAttachmentMetadata {
  recommendationId: string;
  reasonSummary: string;
  sourceThreadId: string;
  sourceThreadType: FollowupSourceThreadType;
  sourceThreadTitle?: string | null;
  sourceMessageId?: string | null;
  relationshipState: FollowupRecommendationRelationshipState;
  badgeLabel?: string | null;
}

export interface FollowupRecommendationRecord {
  id: string;
  openLoopId: string;
  status: FollowupRecommendationStatus;
  recommenderCharacterId: string;
  recommenderCharacterName: string;
  targetCharacterId: string;
  targetCharacterName: string;
  targetCharacterAvatar?: string | null;
  targetCharacterRelationship?: string | null;
  relationshipState: FollowupRecommendationRelationshipState;
  reasonSummary: string;
  handoffSummary?: string | null;
  sourceThreadId: string;
  sourceThreadType: FollowupSourceThreadType;
  sourceThreadTitle?: string | null;
  messageConversationId?: string | null;
  messageId?: string | null;
  cardMessageId?: string | null;
  friendRequestId?: string | null;
  openedAt?: string | null;
  friendRequestStartedAt?: string | null;
  friendAddedAt?: string | null;
  chatStartedAt?: string | null;
  resolvedAt?: string | null;
  dismissedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowupRuntimeStats {
  activeOpenLoopCount: number;
  recommendedOpenLoopCount: number;
  sentRecommendationCount: number;
  openedRecommendationCount: number;
  friendRequestPendingCount: number;
  friendAddedCount: number;
  recentRunCount: number;
}

export interface FollowupRuntimeOverview {
  rules: FollowupRuntimeRules;
  stats: FollowupRuntimeStats;
  recentRuns: FollowupRunRecord[];
  activeOpenLoops: FollowupOpenLoopRecord[];
  recentRecommendations: FollowupRecommendationRecord[];
}

export interface FollowupRecommendationEventResult {
  id: string;
  status: FollowupRecommendationStatus;
  updatedAt: string;
}

export interface MarkFollowupRecommendationFriendRequestPendingRequest {
  friendRequestId: string;
}
