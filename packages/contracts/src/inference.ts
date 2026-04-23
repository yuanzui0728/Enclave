import type { Character } from "./characters";

export type InferenceProviderMode = "cloud" | "local-compatible";
export type InferenceApiStyle =
  | "openai-chat-completions"
  | "openai-responses";
export type InferenceProviderKind = "openai_compatible";
export type InferenceModelRegion = "global" | "domestic";
export type InferenceModelStatus = "active" | "preview" | "legacy";

export interface InferenceProviderAccount {
  id: string;
  name: string;
  providerKind: InferenceProviderKind;
  endpoint: string;
  defaultModelId: string;
  apiKey?: string;
  hasApiKey: boolean;
  mode: InferenceProviderMode;
  apiStyle: InferenceApiStyle;
  transcriptionEndpoint?: string | null;
  transcriptionModel?: string | null;
  transcriptionApiKey?: string;
  transcriptionHasApiKey: boolean;
  ttsModel?: string | null;
  ttsVoice?: string | null;
  isDefault: boolean;
  isEnabled: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InferenceProviderAccountDraft = Partial<InferenceProviderAccount> & {
  name: string;
  endpoint: string;
  defaultModelId: string;
};

export interface InferenceModelCatalogEntry {
  id: string;
  label: string;
  vendor: string;
  providerFamily: string;
  region: InferenceModelRegion;
  status: InferenceModelStatus;
  supportsText: boolean;
  supportsVision: boolean;
  supportsAudio: boolean;
  supportsReasoning: boolean;
  recommendedRoleName: string;
  defaultAvatar: string;
  rolePromptHint?: string | null;
  description?: string | null;
  sortOrder: number;
}

export interface InferenceRoleBindingSummary {
  totalCharacters: number;
  boundCharacters: number;
  modelPersonaCharacters: number;
}

export interface InferenceOverview {
  providerAccounts: InferenceProviderAccount[];
  modelCatalog: InferenceModelCatalogEntry[];
  roleBindingSummary: InferenceRoleBindingSummary;
}

export interface InstallModelPersonasRequest {
  modelIds?: string[];
  providerAccountId?: string;
  forceUpdateExisting?: boolean;
}

export interface InstallModelPersonasResult {
  installedCount: number;
  updatedCount: number;
  skippedCount: number;
  characters: Character[];
}

export interface RebindModelPersonasRequest {
  modelIds?: string[];
  providerAccountId?: string;
}

export interface RebindModelPersonasResult {
  updatedCount: number;
  skippedCount: number;
  missingCount: number;
  characters: Character[];
}
