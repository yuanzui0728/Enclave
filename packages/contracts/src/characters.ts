export type RelationshipType = "family" | "friend" | "expert" | "mentor" | "custom" | "self";
export type CharacterSourceType = "default_seed" | "preset_catalog" | "manual_admin";
export type CharacterDeletionPolicy = "protected" | "archive_allowed";
export type ResponseLength = "short" | "medium" | "long";
export type EmojiUsage = "none" | "occasional" | "frequent";

export interface PersonalityTraits {
  speechPatterns: string[];
  catchphrases: string[];
  topicsOfInterest: string[];
  emotionalTone: string;
  responseLength: ResponseLength;
  emojiUsage: EmojiUsage;
}

export interface CharacterIdentity {
  occupation: string;
  background: string;
  motivation: string;
  worldview: string;
}

export interface BehavioralPatterns {
  workStyle: string;
  socialStyle: string;
  taboos: string[];
  quirks: string[];
}

export interface CognitiveBoundaries {
  expertiseDescription: string;
  knowledgeLimits: string;
  refusalStyle: string;
}

export interface ReasoningConfig {
  enableCoT: boolean;
  enableReflection: boolean;
  enableRouting: boolean;
}

export interface MemoryLayers {
  coreMemory: string;
  recentSummary: string;
  forgettingCurve: number;
}

export interface PersonalityProfile {
  characterId: string;
  name: string;
  relationship: string;
  expertDomains: string[];
  basePrompt?: string;
  traits: PersonalityTraits;
  memorySummary: string;
  systemPrompt?: string;
  identity?: CharacterIdentity;
  behavioralPatterns?: BehavioralPatterns;
  cognitiveBoundaries?: CognitiveBoundaries;
  reasoningConfig?: ReasoningConfig;
  memory?: MemoryLayers;
}

export interface CharacterAiRelationship {
  characterId: string;
  relationshipType: string;
  strength: number;
}

export interface Character {
  id: string;
  name: string;
  avatar: string;
  relationship: string;
  relationshipType: RelationshipType;
  personality?: string;
  bio: string;
  isOnline: boolean;
  onlineMode?: "auto" | "manual";
  sourceType?: CharacterSourceType;
  sourceKey?: string | null;
  deletionPolicy?: CharacterDeletionPolicy;
  isTemplate: boolean;
  expertDomains: string[];
  profile: PersonalityProfile;
  activityFrequency: string;
  momentsFrequency: number;
  feedFrequency: number;
  activeHoursStart?: number | null;
  activeHoursEnd?: number | null;
  triggerScenes?: string[] | null;
  intimacyLevel: number;
  lastActiveAt?: string | null;
  aiRelationships?: CharacterAiRelationship[] | null;
  currentStatus?: string | null;
  currentActivity?: string | null;
  activityMode?: "auto" | "manual";
}

export interface CharacterPresetSummary {
  presetKey: string;
  id: string;
  name: string;
  avatar: string;
  relationship: string;
  description: string;
  expertDomains: string[];
  installed: boolean;
  installedCharacterId?: string | null;
  installedCharacterName?: string | null;
}

export type CharacterDraft = Partial<Character>;
