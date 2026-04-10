import type { CharacterEntity } from './character.entity';

export type CharacterBlueprintSourceTypeValue =
  | 'default_seed'
  | 'manual_admin'
  | 'template_clone'
  | 'ai_generated';

export type CharacterBlueprintStatusValue =
  | 'draft'
  | 'published'
  | 'archived';

export interface CharacterBlueprintRecipeValue {
  identity: {
    name: string;
    relationship: string;
    relationshipType: string;
    avatar: string;
    bio: string;
    occupation: string;
    background: string;
    motivation: string;
    worldview: string;
  };
  expertise: {
    expertDomains: string[];
    expertiseDescription: string;
    knowledgeLimits: string;
    refusalStyle: string;
  };
  tone: {
    speechPatterns: string[];
    catchphrases: string[];
    topicsOfInterest: string[];
    emotionalTone: string;
    responseLength: string;
    emojiUsage: string;
    workStyle: string;
    socialStyle: string;
    taboos: string[];
    quirks: string[];
    basePrompt: string;
    systemPrompt: string;
  };
  memorySeed: {
    memorySummary: string;
    coreMemory: string;
    recentSummarySeed: string;
    forgettingCurve: number;
  };
  lifeStrategy: {
    activityFrequency: string;
    momentsFrequency: number;
    feedFrequency: number;
    activeHoursStart: number | null;
    activeHoursEnd: number | null;
    triggerScenes: string[];
  };
  publishMapping: {
    isTemplate: boolean;
    onlineModeDefault: 'auto' | 'manual';
    activityModeDefault: 'auto' | 'manual';
    initialOnline: boolean;
    initialActivity: string | null;
  };
}

export interface CharacterBlueprintContract {
  id: string;
  characterId: string;
  sourceType: CharacterBlueprintSourceTypeValue;
  status: CharacterBlueprintStatusValue;
  draftRecipe: CharacterBlueprintRecipeValue;
  publishedRecipe?: CharacterBlueprintRecipeValue | null;
  publishedRevisionId?: string | null;
  publishedVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterBlueprintRevisionContract {
  id: string;
  blueprintId: string;
  characterId: string;
  version: number;
  recipe: CharacterBlueprintRecipeValue;
  summary?: string | null;
  changeSource:
    | 'publish'
    | 'restore'
    | 'seed_backfill'
    | 'manual_snapshot';
  createdAt: string;
}

export interface CharacterFactorySnapshotContract {
  character: {
    id: string;
    name: string;
    avatar: string;
    relationship: string;
    relationshipType: CharacterEntity['relationshipType'];
    personality?: string;
    bio: string;
    isOnline: boolean;
    onlineMode?: 'auto' | 'manual' | null;
    isTemplate: boolean;
    expertDomains: string[];
    profile: CharacterEntity['profile'];
    activityFrequency: string;
    momentsFrequency: number;
    feedFrequency: number;
    activeHoursStart?: number | null;
    activeHoursEnd?: number | null;
    triggerScenes?: string[] | null;
    intimacyLevel: number;
    lastActiveAt?: string | null;
    aiRelationships?: CharacterEntity['aiRelationships'] | null;
    currentStatus?: string | null;
    currentActivity?: string | null;
    activityMode?: 'auto' | 'manual' | null;
  };
  blueprint: CharacterBlueprintContract;
  diffSummary: {
    hasUnpublishedChanges: boolean;
    changedFields: string[];
  };
}
