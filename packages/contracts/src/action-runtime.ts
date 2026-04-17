export type ActionRiskLevel =
  | "read_only"
  | "reversible_low_risk"
  | "cost_or_irreversible";

export type ActionRunStatus =
  | "draft"
  | "awaiting_slots"
  | "awaiting_confirmation"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ActionRunRetryNextStep =
  | "awaiting_slots"
  | "awaiting_confirmation"
  | "executed";

export type ActionRuntimePlannerMode =
  | "heuristic"
  | "llm"
  | "llm_with_heuristic_fallback";

export type ActionConnectorProviderType =
  | "mock"
  | "http_bridge"
  | "browser_operator"
  | "official_api";

export type ActionConnectorStatus = "disabled" | "ready" | "error";

export interface ActionRuntimePromptTemplates {
  plannerSystemPrompt: string;
  clarificationTemplate: string;
  confirmationTemplate: string;
  successTemplate: string;
  failureTemplate: string;
  cancelledTemplate: string;
  pendingConfirmationReminderTemplate: string;
}

export interface ActionRuntimePolicy {
  enabled: boolean;
  selfRoleOnly: boolean;
  confirmationKeywords: string[];
  rejectionKeywords: string[];
  autoExecuteRiskLevels: ActionRiskLevel[];
  trustedOperationKeys: string[];
}

export interface ActionRuntimeRules {
  plannerMode: ActionRuntimePlannerMode;
  promptTemplates: ActionRuntimePromptTemplates;
  policy: ActionRuntimePolicy;
}

export interface ActionConnectorOperationSummary {
  operationKey: string;
  domain: string;
  label: string;
  description: string;
  riskLevel: ActionRiskLevel;
  requiresConfirmation: boolean;
  requiredSlots: string[];
}

export interface ActionConnectorSummary {
  id: string;
  connectorKey: string;
  displayName: string;
  providerType: ActionConnectorProviderType;
  status: ActionConnectorStatus;
  endpointConfig?: Record<string, unknown> | null;
  credentialConfigured: boolean;
  capabilities: ActionConnectorOperationSummary[];
  lastHealthCheckAt?: string | null;
  lastError?: string | null;
  updatedAt: string;
}

export interface ActionPlanSummary {
  connectorKey: string;
  operationKey: string;
  domain: string;
  title: string;
  goal: string;
  rationale: string;
  riskLevel: ActionRiskLevel;
  requiresConfirmation: boolean;
  slots: Record<string, unknown>;
  missingSlots: string[];
  matchedKeywords: string[];
  promptPreview: string;
}

export interface ActionRunSummary {
  id: string;
  conversationId: string;
  ownerId: string;
  characterId: string;
  connectorKey: string;
  operationKey: string;
  status: ActionRunStatus;
  title: string;
  userGoal: string;
  riskLevel: ActionRiskLevel;
  requiresConfirmation: boolean;
  slotPayload: Record<string, unknown>;
  missingSlots: string[];
  resultSummary?: string | null;
  errorMessage?: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface ActionRunDetail extends ActionRunSummary {
  planPayload?: ActionPlanSummary | null;
  policyDecisionPayload?: Record<string, unknown> | null;
  confirmationPayload?: Record<string, unknown> | null;
  executionPayload?: Record<string, unknown> | null;
  resultPayload?: Record<string, unknown> | null;
  errorPayload?: Record<string, unknown> | null;
  tracePayload?: Record<string, unknown> | null;
}

export interface ActionRuntimeOverview {
  rules: ActionRuntimeRules;
  connectors: ActionConnectorSummary[];
  recentRuns: ActionRunSummary[];
  counts: {
    totalRuns: number;
    awaitingSlots: number;
    awaitingConfirmation: number;
    succeeded: number;
    failed: number;
    readyConnectors: number;
  };
  selfCharacter: {
    id: string;
    name: string;
  } | null;
}

export interface ActionRuntimePreviewResult {
  handled: boolean;
  reason: string;
  plan?: ActionPlanSummary | null;
  responsePreview?: string | null;
}

export interface ActionConnectorDiscoveryItem {
  key: string;
  entityId: string;
  domain: string;
  friendlyName: string;
  state: string;
  suggestedRoom: string;
  suggestedDevice: string;
  targetConfig: Record<string, unknown>;
  availableActions: string[];
  attributes: Record<string, unknown>;
}

export interface ActionConnectorDiscoveryResult {
  connector: ActionConnectorSummary;
  provider: string;
  fetchedAt: string;
  query: string;
  itemCount: number;
  items: ActionConnectorDiscoveryItem[];
}

export interface ActionConnectorTestResult {
  ok: boolean;
  testedAt: string;
  sampleMessage: string;
  summary: string;
  connector: ActionConnectorSummary;
  samplePlan?: ActionPlanSummary | null;
  executionPayload?: Record<string, unknown> | null;
  resultPayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

export interface ActionRunRetryResult {
  nextStep: ActionRunRetryNextStep;
  responseText: string;
  run: ActionRunDetail;
}

export interface UpdateActionConnectorRequest {
  displayName?: string;
  status?: ActionConnectorStatus;
  endpointConfig?: Record<string, unknown> | null;
  credential?: string | null;
  clearCredential?: boolean;
}
