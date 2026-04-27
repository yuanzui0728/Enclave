import type { CharacterEntity } from '../characters/character.entity';

export type WechatSyncMessageDirectionValue =
  | 'owner'
  | 'contact'
  | 'group_member'
  | 'system'
  | 'unknown';

export type WechatSyncEvidenceMessageModeValue = 'recent' | 'all';

export interface WechatSyncMessageSampleValue {
  timestamp: string;
  text: string;
  sender?: string | null;
  typeLabel?: string | null;
  direction?: WechatSyncMessageDirectionValue;
}

export interface WechatSyncMomentHighlightValue {
  postedAt?: string | null;
  text: string;
  location?: string | null;
  mediaHint?: string | null;
}

export interface WechatSyncEvidenceWindowValue {
  messageMode?: WechatSyncEvidenceMessageModeValue;
  requestedMessageLimit?: number | null;
  fetchedMessageCount?: number | null;
  includeMoments?: boolean;
  requestedMomentLimit?: number | null;
  fetchedMomentCount?: number | null;
}

export interface WechatSyncContactBundleValue {
  username: string;
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
  sampleMessages: WechatSyncMessageSampleValue[];
  momentHighlights: WechatSyncMomentHighlightValue[];
  evidenceWindow?: WechatSyncEvidenceWindowValue | null;
}

export interface WechatSyncPreviewRequestValue {
  contacts: WechatSyncContactBundleValue[];
}

export interface WechatSyncPreviewItemValue {
  contact: WechatSyncContactBundleValue;
  draftCharacter: Partial<CharacterEntity>;
  warnings: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface WechatSyncPreviewResponseValue {
  items: WechatSyncPreviewItemValue[];
}

export interface WechatSyncImportItemValue {
  contact: WechatSyncContactBundleValue;
  draftCharacter: Partial<CharacterEntity>;
  autoAddFriend?: boolean;
  seedMoments?: boolean;
  importMode?: 'preview_import' | 'snapshot_restore';
  restoredFromVersion?: number | null;
}

export interface WechatSyncImportRequestValue {
  items: WechatSyncImportItemValue[];
}

export interface WechatSyncImportedItemValue {
  contactUsername: string;
  displayName: string;
  status: 'created' | 'updated';
  friendshipCreated: boolean;
  seededMomentCount: number;
  character: CharacterEntity;
}

export interface WechatSyncSkippedItemValue {
  contactUsername: string;
  displayName: string;
  reason: string;
}

export interface WechatSyncImportResponseValue {
  importedCount: number;
  items: WechatSyncImportedItemValue[];
  skipped: WechatSyncSkippedItemValue[];
}

export interface WechatSyncHistoryItemValue {
  character: CharacterEntity;
  importedAt?: string | null;
  friendshipStatus?: string | null;
  friendshipCreatedAt?: string | null;
  lastInteractedAt?: string | null;
  seededMomentCount: number;
  remarkName?: string | null;
  region?: string | null;
  tags: string[];
}

export interface WechatSyncHistoryResponseValue {
  items: WechatSyncHistoryItemValue[];
}

export interface WechatSyncRetryFriendshipResponseValue {
  characterId: string;
  friendshipCreated: boolean;
  friendshipStatus: string;
}

export interface WechatSyncRollbackResponseValue {
  success: true;
  characterId: string;
}
