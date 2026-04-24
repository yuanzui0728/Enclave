export const SELF_AGENT_WORKSPACE_DOCUMENT_NAMES = [
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "IDENTITY.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "MEMORY.md",
] as const;

export type SelfAgentWorkspaceDocumentName =
  (typeof SELF_AGENT_WORKSPACE_DOCUMENT_NAMES)[number];

export type SelfAgentHeartbeatTrigger = "manual" | "scheduler";
export type SelfAgentHeartbeatRunStatus = "success" | "noop" | "error";
export type SelfAgentHeartbeatFindingType =
  | "open_loop"
  | "upcoming_reminder"
  | "action_confirmation"
  | "action_missing_slots";
export type SelfAgentRunTriggerType = "conversation" | "heartbeat";
export type SelfAgentRunStatus =
  | "handled"
  | "suggested"
  | "skipped"
  | "blocked"
  | "error";
export type SelfAgentRunRouteKey =
  | "action_runtime"
  | "reminder_runtime"
  | "self_chat"
  | "heartbeat"
  | "ignored";
export type SelfAgentRunPolicyDecision =
  | "delegated"
  | "confirm_required"
  | "clarify_required"
  | "suggest_only"
  | "fallback"
  | "blocked"
  | "disabled";

export interface SelfAgentWorkspaceDocumentSummary {
  name: SelfAgentWorkspaceDocumentName;
  exists: boolean;
  size: number;
  updatedAt: string | null;
  preview: string;
}

export interface SelfAgentWorkspaceDocument {
  name: SelfAgentWorkspaceDocumentName;
  content: string;
  size: number;
  updatedAt: string | null;
}

export interface SelfAgentHeartbeatFinding {
  type: SelfAgentHeartbeatFindingType;
  title: string;
  summary: string;
  count: number;
  items: string[];
}

export interface SelfAgentHeartbeatRun {
  id: string;
  triggerType: SelfAgentHeartbeatTrigger;
  status: SelfAgentHeartbeatRunStatus;
  summary: string;
  suggestedMessage?: string | null;
  findings: SelfAgentHeartbeatFinding[];
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SelfAgentOverviewIdentity {
  ownerId: string;
  ownerName: string;
  ownerSignature?: string | null;
  characterId: string;
  characterName: string;
  characterSourceKey?: string | null;
}

export interface SelfAgentOverviewStats {
  activeOpenLoopCount: number;
  upcomingReminderCount: number;
  awaitingActionConfirmationCount: number;
  awaitingActionSlotsCount: number;
  heartbeatRunCount: number;
  runCount: number;
}

export interface SelfAgentPolicyRules {
  enabled: boolean;
  allowActionRuntimeDelegation: boolean;
  allowReminderRuntimeDelegation: boolean;
  forceConfirmationForDelegatedActions: boolean;
  blockedActionConnectorKeys: string[];
  blockedActionOperationKeys: string[];
}

export interface SelfAgentHeartbeatRules {
  enabled: boolean;
  everyMinutes: number;
  activeHoursStart: number;
  activeHoursEnd: number;
  maxItemsPerCategory: number;
  allowNightlySilentScan: boolean;
}

export interface SelfAgentRules {
  policy: SelfAgentPolicyRules;
  heartbeat: SelfAgentHeartbeatRules;
}

export interface SelfAgentRunRecord {
  id: string;
  triggerType: SelfAgentRunTriggerType;
  status: SelfAgentRunStatus;
  routeKey: SelfAgentRunRouteKey;
  policyDecision: SelfAgentRunPolicyDecision;
  conversationId?: string | null;
  sourceMessageId?: string | null;
  ownerId?: string | null;
  characterId?: string | null;
  summary: string;
  inputPreview?: string | null;
  outputPreview?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SelfAgentOverview {
  identity: SelfAgentOverviewIdentity;
  rules: SelfAgentRules;
  workspaceDocuments: SelfAgentWorkspaceDocumentSummary[];
  stats: SelfAgentOverviewStats;
  recentHeartbeatRuns: SelfAgentHeartbeatRun[];
  recentRuns: SelfAgentRunRecord[];
}
