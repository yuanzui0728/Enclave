import type { Character, CharacterDraft } from "./characters";
export type {
  ShakeDiscoveryConfig,
  ShakeDiscoveryOverview,
  ShakeDiscoverySessionPreview,
  ShakeDiscoverySessionRecord,
  ShakeDiscoverySessionStatus,
  ShakeDiscoveryStats,
} from "./shake-discovery";
export {
  DEFAULT_SHAKE_DISCOVERY_CONFIG,
  SHAKE_DISCOVERY_CONFIG_KEY,
  SHAKE_DISCOVERY_SESSIONS_KEY,
} from "./shake-discovery";

export interface FriendRequest {
  id: string;
  characterId: string;
  characterName: string;
  characterAvatar: string;
  triggerScene?: string;
  greeting?: string;
  status: string;
  createdAt: string;
  expiresAt?: string;
  acceptAt?: string | null;
}

export interface Friendship {
  id: string;
  characterId: string;
  intimacyLevel: number;
  status: string;
  isStarred: boolean;
  starredAt?: string;
  remarkName?: string | null;
  region?: string | null;
  source?: string | null;
  tags?: string[] | null;
  createdAt: string;
  lastInteractedAt?: string;
  sparkStreak?: number;
  sparkStartedAt?: string | null;
  sparkLastDay?: string | null;
  momentsHiddenFromMe?: boolean;
  momentsHiddenFromThem?: boolean;
  chatOnly?: boolean;
}

export interface FriendListItem {
  friendship: Friendship;
  character: Character;
}

export interface BlockedCharacter {
  id: string;
  characterId: string;
  reason?: string;
  createdAt: string;
}

export interface SendFriendRequestRequest {
  characterId: string;
  greeting: string;
  autoAccept?: boolean;
}

export interface SetFriendStarredRequest {
  starred: boolean;
}

export interface UpdateFriendProfileRequest {
  remarkName?: string | null;
  tags?: string[] | null;
}

export interface TriggerSceneRequest {
  scene: string;
}

export type SceneMatchSource = "scene" | "fallback" | "none";

export interface TriggerSceneResponse {
  request: FriendRequest | null;
  matchSource: SceneMatchSource;
}

export interface ShakePreviewCharacter extends Pick<CharacterDraft, "id" | "name" | "avatar" | "relationship" | "expertDomains"> {
  id: string;
  name: string;
  avatar: string;
  relationship: string;
  expertDomains: string[];
}

export interface ShakeResult {
  character: ShakePreviewCharacter;
  greeting: string;
}

export interface BlockCharacterRequest {
  characterId: string;
  reason?: string;
}

export interface UnblockCharacterRequest {
  characterId: string;
}

export interface UpdateFriendPermissionsRequest {
  momentsHiddenFromMe?: boolean;
  momentsHiddenFromThem?: boolean;
  chatOnly?: boolean;
}

export type BulkFriendshipAction =
  | "add-tag"
  | "remove-tag"
  | "star"
  | "unstar"
  | "delete"
  | "block";

export interface BulkFriendshipRequest {
  characterIds: string[];
  action: BulkFriendshipAction;
  tag?: string;
}

export interface BulkFriendshipResponse {
  updated: number;
  failed: string[];
}
