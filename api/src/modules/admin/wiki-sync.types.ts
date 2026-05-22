/**
 * Mirror of packages/contracts/src/wiki-sync.ts. Kept in-tree so the API can
 * type-check without depending on the workspace package.
 */

export const WIKI_SYNC_CONTENT_FIELDS = [
  'name',
  'avatar',
  'bio',
  'personality',
  'expertDomains',
  'triggerScenes',
  'relationship',
  'relationshipType',
  'region',
] as const;

export type WikiSyncContentField = (typeof WIKI_SYNC_CONTENT_FIELDS)[number];

export type WikiSyncStatus =
  | 'in_sync'
  | 'drift'
  | 'wiki_only'
  | 'live_only'
  | 'no_stable_revision';

export type WikiSyncContentDiffEntry = {
  field: WikiSyncContentField;
  liveValue: unknown;
  wikiValue: unknown;
};

export type WikiSyncRecipeDiffEntry = {
  path: string;
  liveValue: unknown;
  wikiValue: unknown;
};

export type WikiSyncPreviewItem = {
  characterId: string;
  name: string;
  avatar: string | null;
  status: WikiSyncStatus;
  contentDiff: WikiSyncContentDiffEntry[];
  recipeDiff: WikiSyncRecipeDiffEntry[];
  stableRevisionId: string | null;
  stableRevisionVersion: number | null;
  stableRevisionEditedAt: string | null;
  liveCharacterUpdatedAt: string | null;
};

export type WikiSyncPreviewFilter = 'drift' | 'all' | 'wiki_only';

export type WikiSyncPreviewResponse = {
  generatedAt: string;
  items: WikiSyncPreviewItem[];
};

export type WikiSyncApplyItemRequest = {
  characterId: string;
  contentFields: WikiSyncContentField[];
  recipePaths: string[];
  expectedStableRevisionId: string;
};

export type WikiSyncApplyRequest = {
  items: WikiSyncApplyItemRequest[];
  editSummary?: string | null;
};

export type WikiSyncApplyItemStatus =
  | 'applied'
  | 'no_changes'
  | 'stale_revision'
  | 'live_missing'
  | 'no_stable_revision'
  | 'error';

export type WikiSyncApplyItemResult = {
  characterId: string;
  status: WikiSyncApplyItemStatus;
  appliedFields: WikiSyncContentField[];
  appliedRecipePaths: string[];
  newRevisionId: string | null;
  newRevisionVersion: number | null;
  errorMessage: string | null;
};

export type WikiSyncApplyResponse = {
  results: WikiSyncApplyItemResult[];
};

export type WikiSyncImportRequest = {
  characterId: string;
  expectedStableRevisionId: string;
};

export type WikiSyncImportResult = WikiSyncApplyItemResult;
