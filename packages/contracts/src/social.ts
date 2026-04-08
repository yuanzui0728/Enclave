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
  userId?: string;
  characterId: string;
  greeting: string;
}

export interface TriggerSceneRequest {
  userId?: string;
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
  userId?: string;
  characterId: string;
  reason?: string;
}

export interface UnblockCharacterRequest {
  userId?: string;
  characterId: string;
}
