/**
 * In-tree mirror of packages/contracts/src/wiki-game.ts. Kept here because the
 * API cannot import @yinjie/contracts (api/tsconfig.json has no path mapping and
 * api/package.json does not depend on it; same pattern as
 * api/src/common/app-error.types.ts and api/src/modules/admin/wiki-sync.types.ts).
 *
 * Keep both files in sync when changing the wiki-game contract.
 */

export type WikiGameArtifactSchemaVersion = 1;

export interface WikiGameSpec {
  title: string;
  pitch: string;
  genre: string;
  rules: string;
  controls: string;
  winLose: string;
}

export interface WikiGameConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  version?: number;
  at?: string;
}

export interface WikiGameArtifactMeta {
  estimatedBytes: number;
  hasExternalRefs: boolean;
  generatedModel?: string | null;
  truncated?: boolean;
}

export interface WikiGameArtifact {
  schemaVersion: WikiGameArtifactSchemaVersion;
  spec: WikiGameSpec;
  prompt: string;
  conversation: WikiGameConversationTurn[];
  html: string;
  meta: WikiGameArtifactMeta;
}

export type WikiGameVisibility = 'private' | 'public';

export type WikiGameRevisionChangeSource =
  | 'ai_create'
  | 'ai_refine'
  | 'manual_edit'
  | 'clone';

export interface WikiGameSummary {
  gameId: string;
  title: string;
  pitch: string;
  genre: string;
  visibility: WikiGameVisibility;
  ownerUserId: string;
  authorDisplayName?: string | null;
  forkedFromGameId?: string | null;
  publishedCatalogGameId?: string | null;
  publishedVersion?: number | null;
  lastPublishedAt?: string | null;
  latestVersion: number;
  updatedAt: string;
  createdAt: string;
}

export interface WikiGameView extends WikiGameSummary {
  version: number;
  revisionId: string;
  artifact: WikiGameArtifact;
  isOwner: boolean;
}

export interface WikiGameRevisionSummary {
  revisionId: string;
  version: number;
  instruction: string;
  changeSource: WikiGameRevisionChangeSource;
  createdAt: string;
}

export type WikiGameJobStatus = 'generating' | 'ready' | 'failed';

export interface WikiGameJobView {
  id: string;
  status: WikiGameJobStatus;
  gameId: string | null;
  revisionId: string | null;
  version: number | null;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
}
