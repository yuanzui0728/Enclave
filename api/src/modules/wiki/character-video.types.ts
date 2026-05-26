/**
 * In-tree mirror of packages/contracts/src/character-video.ts. Kept here because
 * the API cannot import @yinjie/contracts (api/tsconfig.json has no path mapping
 * and api/package.json does not depend on it; same pattern as wiki-game.types.ts).
 *
 * Keep both files in sync when changing the character-video contract.
 */

export type CharacterVideoStatus = 'generating' | 'ready' | 'failed';

export type CharacterVideoPublishState =
  | 'not_published'
  | 'pending'
  | 'published'
  | 'failed';

export interface CharacterVideoView {
  id: string;
  privateCharacterId: string;
  characterName: string;
  characterAvatar: string;
  prompt: string;
  status: CharacterVideoStatus;
  publishState: CharacterVideoPublishState;
  videoUrl: string | null;
  coverUrl: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCharacterVideoInput {
  privateCharacterId: string;
  prompt: string;
}

export interface CharacterVideoEnqueueResult {
  videoId: string;
  status: 'generating';
}
