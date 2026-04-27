export type ContactImportPlatformKey =
  | "wechat"
  | "qq"
  | "telegram"
  | "discord"
  | "whatsapp"
  | "line"
  | "instagram"
  | "slack"
  | "unknown";

export type ContactImportMessageDirection =
  | "owner"
  | "contact"
  | "group_member"
  | "system"
  | "unknown";

export type ContactImportEvidenceMessageMode = "recent" | "all";

export interface ContactImportMessageSample {
  timestamp: string;
  text: string;
  sender?: string | null;
  typeLabel?: string | null;
  direction?: ContactImportMessageDirection;
}

export interface ContactImportMomentHighlight {
  postedAt?: string | null;
  text: string;
  location?: string | null;
  mediaHint?: string | null;
}

export interface ContactImportEvidenceWindow {
  messageMode?: ContactImportEvidenceMessageMode;
  requestedMessageLimit?: number | null;
  fetchedMessageCount?: number | null;
  includeMoments?: boolean;
  requestedMomentLimit?: number | null;
  fetchedMomentCount?: number | null;
}

/**
 * Platform-agnostic contact import payload.
 * This is the long-term canonical shape that future QQ / Telegram / Discord
 * adapters should target before being mapped into any product-specific flow.
 */
export interface ContactImportBundle {
  platform: ContactImportPlatformKey;
  platformId: string;
  displayName: string;
  nickname?: string | null;
  remarkName?: string | null;
  alias?: string | null;
  detailDescription?: string | null;
  region?: string | null;
  avatarUrl?: string | null;
  source?: string | null;
  tags: string[];
  isGroup: boolean;
  messageCount: number;
  ownerMessageCount: number;
  contactMessageCount: number;
  latestMessageAt?: string | null;
  chatSummary?: string | null;
  topicKeywords: string[];
  sampleMessages: ContactImportMessageSample[];
  momentHighlights: ContactImportMomentHighlight[];
  evidenceWindow?: ContactImportEvidenceWindow | null;
}

export type ContactImportPlatformPhase =
  | "implemented"
  | "standardized"
  | "planned";

export interface ContactImportPlatformStatus {
  platform: ContactImportPlatformKey;
  phase: ContactImportPlatformPhase;
  notes: string;
}
