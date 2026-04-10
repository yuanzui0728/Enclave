import type { Character } from "./characters";

export type CharacterBlueprintSourceType =
  | "default_seed"
  | "manual_admin"
  | "template_clone"
  | "ai_generated";

export type CharacterBlueprintStatus = "draft" | "published" | "archived";

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

export interface CharacterFactorySnapshot {
  character: Character;
  blueprint: CharacterBlueprint;
  diffSummary: {
    hasUnpublishedChanges: boolean;
    changedFields: string[];
  };
}
