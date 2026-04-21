import type {
  Character,
  CharacterDraft,
  WechatSyncImportMode,
} from "./characters";

export type WechatSyncMessageDirection =
  | "owner"
  | "contact"
  | "group_member"
  | "system"
  | "unknown";

export interface WechatSyncMessageSample {
  timestamp: string;
  text: string;
  sender?: string | null;
  typeLabel?: string | null;
  direction?: WechatSyncMessageDirection;
}

export interface WechatSyncMomentHighlight {
  postedAt?: string | null;
  text: string;
  location?: string | null;
  mediaHint?: string | null;
}

export interface WechatSyncContactBundle {
  username: string;
  displayName: string;
  nickname?: string | null;
  remarkName?: string | null;
  region?: string | null;
  source?: string | null;
  tags: string[];
  isGroup: boolean;
  messageCount: number;
  ownerMessageCount: number;
  contactMessageCount: number;
  latestMessageAt?: string | null;
  chatSummary?: string | null;
  topicKeywords: string[];
  sampleMessages: WechatSyncMessageSample[];
  momentHighlights: WechatSyncMomentHighlight[];
}

export interface WechatSyncPreviewRequest {
  contacts: WechatSyncContactBundle[];
}

export interface WechatSyncPreviewItem {
  contact: WechatSyncContactBundle;
  draftCharacter: CharacterDraft;
  warnings: string[];
  confidence: "high" | "medium" | "low";
}

export interface WechatSyncPreviewResponse {
  items: WechatSyncPreviewItem[];
}

export interface WechatSyncImportItem {
  contact: WechatSyncContactBundle;
  draftCharacter: CharacterDraft;
  autoAddFriend?: boolean;
  seedMoments?: boolean;
  importMode?: WechatSyncImportMode;
  restoredFromVersion?: number | null;
}

export interface WechatSyncImportRequest {
  items: WechatSyncImportItem[];
}

export interface WechatSyncImportedItem {
  contactUsername: string;
  displayName: string;
  status: "created" | "updated";
  friendshipCreated: boolean;
  seededMomentCount: number;
  character: Character;
}

export interface WechatSyncSkippedItem {
  contactUsername: string;
  displayName: string;
  reason: string;
}

export interface WechatSyncImportResponse {
  importedCount: number;
  items: WechatSyncImportedItem[];
  skipped: WechatSyncSkippedItem[];
}

export interface WechatSyncHistoryItem {
  character: Character;
  importedAt?: string | null;
  friendshipStatus?: string | null;
  friendshipCreatedAt?: string | null;
  lastInteractedAt?: string | null;
  seededMomentCount: number;
  remarkName?: string | null;
  region?: string | null;
  tags: string[];
}

export interface WechatSyncHistoryResponse {
  items: WechatSyncHistoryItem[];
}

export interface WechatSyncRetryFriendshipResponse {
  characterId: string;
  friendshipCreated: boolean;
  friendshipStatus: string;
}

export interface WechatSyncRollbackResponse {
  success: true;
  characterId: string;
}
