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
}

export interface SelfAgentOverview {
  identity: SelfAgentOverviewIdentity;
  workspaceDocuments: SelfAgentWorkspaceDocumentSummary[];
  stats: SelfAgentOverviewStats;
  recentHeartbeatRuns: SelfAgentHeartbeatRun[];
}
