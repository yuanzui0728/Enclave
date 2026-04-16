import type { Character } from "./characters";

export type CharacterBlueprintSourceType =
  | "default_seed"
  | "preset_catalog"
  | "manual_admin"
  | "template_clone"
  | "ai_generated";

export type CharacterBlueprintStatus = "draft" | "published" | "archived";
export type CharacterFactoryFieldSourceStatus =
  | "draft_only"
  | "published_sync"
  | "runtime_drift";

export interface CharacterBlueprintAiGenerationTrace {
  requestedAt: string;
  personName: string;
  chatSample: string;
  prompt: string;
  extractedProfile: {
    speechPatterns: string[];
    catchphrases: string[];
    topicsOfInterest: string[];
    emotionalTone: string;
    responseLength: "short" | "medium" | "long";
    emojiUsage: "none" | "occasional" | "frequent";
    memorySummary: string;
  };
  appliedFields: string[];
}

export interface CharacterBlueprintRecipe {
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
    responseLength: "short" | "medium" | "long";
    emojiUsage: "none" | "occasional" | "frequent";
    workStyle: string;
    socialStyle: string;
    taboos: string[];
    quirks: string[];
    coreDirective: string;
    basePrompt: string;
    systemPrompt: string;
  };
  memorySeed: {
    memorySummary: string;
    coreMemory: string;
    recentSummarySeed: string;
    forgettingCurve: number;
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
    onlineModeDefault: "auto" | "manual";
    activityModeDefault: "auto" | "manual";
    initialOnline: boolean;
    initialActivity: string | null;
  };
}

export interface CharacterBlueprint {
  id: string;
  characterId: string;
  sourceType: CharacterBlueprintSourceType;
  status: CharacterBlueprintStatus;
  draftRecipe: CharacterBlueprintRecipe;
  publishedRecipe?: CharacterBlueprintRecipe | null;
  publishedRevisionId?: string | null;
  publishedVersion: number;
  lastAiGeneration?: CharacterBlueprintAiGenerationTrace | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterBlueprintRevision {
  id: string;
  blueprintId: string;
  characterId: string;
  version: number;
  recipe: CharacterBlueprintRecipe;
  summary?: string | null;
  changeSource:
    | "publish"
    | "restore"
    | "seed_backfill"
    | "manual_snapshot";
  createdAt: string;
}

export interface CharacterFactoryFieldSource {
  label: string;
  targetField: string;
  recipeField: string;
  status: CharacterFactoryFieldSourceStatus;
  runtimeValue: string;
  publishedValue: string;
  draftValue: string;
  note: string;
}

export interface CharacterFactoryPublishDiffItem {
  label: string;
  targetField: string;
  recipeField: string;
  changed: boolean;
  currentValue: string;
  nextValue: string;
}

export interface CharacterFactorySnapshot {
  character: Character;
  blueprint: CharacterBlueprint;
  diffSummary: {
    hasUnpublishedChanges: boolean;
    changedFields: string[];
  };
  fieldSources: CharacterFactoryFieldSource[];
  publishDiff: {
    changedCount: number;
    items: CharacterFactoryPublishDiffItem[];
  };
}
