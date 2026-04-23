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
  ttsEndpoint?: string | null;
  ttsApiKey?: string;
  ttsHasApiKey: boolean;
  ttsModel?: string | null;
  ttsVoice?: string | null;
  imageGenerationEndpoint?: string | null;
  imageGenerationModel?: string | null;
  imageGenerationApiKey?: string;
  imageGenerationHasApiKey: boolean;
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

export type InferenceDiagnosticCapability =
  | "text"
  | "image_input"
  | "transcription"
  | "tts"
  | "image_generation"
  | "digital_human";

export type InferenceDiagnosticStatus = "ok" | "unavailable" | "failed";

export interface InferenceDiagnosticRequest {
  providerAccountId?: string;
  characterId?: string;
  prompt?: string;
}

export interface InferenceDiagnosticsRunRequest
  extends InferenceDiagnosticRequest {
  capabilities?: InferenceDiagnosticCapability[];
}

export interface InferenceDiagnosticResult {
  capability: InferenceDiagnosticCapability;
  status: InferenceDiagnosticStatus;
  success: boolean;
  real: boolean;
  message: string;
  providerAccountId?: string;
  providerName?: string;
  endpoint?: string;
  model?: string;
  latencyMs: number;
  checkedAt: string;
  metadata?: Record<string, unknown>;
}

export interface InferenceDiagnosticSummary {
  total: number;
  ok: number;
  unavailable: number;
  failed: number;
  real: number;
}

export interface InferenceDiagnosticSnapshot {
  ranAt: string;
  results: InferenceDiagnosticResult[];
  summary: InferenceDiagnosticSummary;
}

export interface InferenceCapabilityMatrixItem {
  capability: InferenceDiagnosticCapability;
  label: string;
  configured: boolean;
  declared: boolean;
  realReady: boolean;
  status: InferenceDiagnosticStatus | "not_run";
  message: string;
  providerName?: string;
  endpoint?: string;
  model?: string;
  latencyMs?: number;
  lastCheckedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface InferenceMultimodalOverview {
  provider: {
    accountId: string;
    accountName: string;
    model: string;
    endpoint: string;
    apiStyle: InferenceApiStyle;
    mode: InferenceProviderMode;
  };
  capabilityMatrix: InferenceCapabilityMatrixItem[];
  latestDiagnostics: InferenceDiagnosticSnapshot | null;
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
