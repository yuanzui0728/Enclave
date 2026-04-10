import type { Character, CharacterDraft } from "./characters";

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
}

export interface SetFriendStarredRequest {
  starred: boolean;
}

export interface UpdateFriendProfileRequest {
  remarkName?: string | null;
  region?: string | null;
  source?: string | null;
  tags?: string[] | null;
}

export interface TriggerSceneRequest {
  scene: string;
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
