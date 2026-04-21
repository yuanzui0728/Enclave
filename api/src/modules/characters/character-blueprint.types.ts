import type { CharacterEntity } from './character.entity';
import type { RealityLinkConfigValue } from '../real-world-sync/real-world-sync.types';

export type CharacterBlueprintSourceTypeValue =
  | 'default_seed'
  | 'preset_catalog'
  | 'manual_admin'
  | 'template_clone'
  | 'ai_generated'
  | 'need_generated'
  | 'shake_generated';

export type CharacterBlueprintStatusValue = 'draft' | 'published' | 'archived';

export interface CharacterBlueprintAiGenerationTraceValue {
  requestedAt: string;
  personName: string;
  chatSample: string;
  prompt: string;
  extractedProfile: {
    speechPatterns: string[];
    catchphrases: string[];
    topicsOfInterest: string[];
    emotionalTone: string;
    responseLength: 'short' | 'medium' | 'long';
    emojiUsage: 'none' | 'occasional' | 'frequent';
    memorySummary: string;
  };
  appliedFields: string[];
}

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
    responseLength: 'short' | 'medium' | 'long';
    emojiUsage: 'none' | 'occasional' | 'frequent';
    workStyle: string;
    socialStyle: string;
    taboos: string[];
    quirks: string[];
    coreDirective: string;
    basePrompt: string;
    systemPrompt: string;
  };
  prompting: {
    coreLogic: string;
    scenePrompts: {
      chat: string;
      moments_post: string;
      moments_comment: string;
      feed_post: string;
      channel_post: string;
      feed_comment: string;
      greeting: string;
      proactive: string;
    };
  };
  memorySeed: {
    memorySummary: string;
    coreMemory: string;
    recentSummarySeed: string;
    forgettingCurve: number;
    recentSummaryPrompt: string;
    coreMemoryPrompt: string;
  };
  reasoning: {
    enableCoT: boolean;
    enableReflection: boolean;
    enableRouting: boolean;
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
  realityLink?: RealityLinkConfigValue | null;
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
  lastAiGeneration?: CharacterBlueprintAiGenerationTraceValue | null;
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
  changeSource: 'publish' | 'restore' | 'seed_backfill' | 'manual_snapshot';
  createdAt: string;
}

export interface CharacterFactoryFieldSourceContract {
  label: string;
  targetField: string;
  recipeField: string;
  status: 'draft_only' | 'published_sync' | 'runtime_drift';
  runtimeValue: string;
  publishedValue: string;
  draftValue: string;
  note: string;
}

export interface CharacterFactoryPublishDiffItemContract {
  label: string;
  targetField: string;
  recipeField: string;
  changed: boolean;
  currentValue: string;
  nextValue: string;
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
  fieldSources: CharacterFactoryFieldSourceContract[];
  publishDiff: {
    changedCount: number;
    items: CharacterFactoryPublishDiffItemContract[];
  };
}
