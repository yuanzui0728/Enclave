export type ActionRiskLevelValue =
  | 'read_only'
  | 'reversible_low_risk'
  | 'cost_or_irreversible';

export type ActionRunStatusValue =
  | 'draft'
  | 'awaiting_slots'
  | 'awaiting_confirmation'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type ActionRuntimePlannerModeValue =
  | 'heuristic'
  | 'llm'
  | 'llm_with_heuristic_fallback';

export type ActionConnectorProviderTypeValue =
  | 'mock'
  | 'http_bridge'
  | 'browser_operator'
  | 'official_api';

export type ActionConnectorStatusValue = 'disabled' | 'ready' | 'error';

export type ActionRuntimePromptTemplatesValue = {
  plannerSystemPrompt: string;
  clarificationTemplate: string;
  confirmationTemplate: string;
  successTemplate: string;
  failureTemplate: string;
  cancelledTemplate: string;
  pendingConfirmationReminderTemplate: string;
};

export type ActionRuntimePolicyValue = {
  enabled: boolean;
  selfRoleOnly: boolean;
  confirmationKeywords: string[];
  rejectionKeywords: string[];
  autoExecuteRiskLevels: ActionRiskLevelValue[];
  trustedOperationKeys: string[];
};

export type ActionRuntimeRulesValue = {
  plannerMode: ActionRuntimePlannerModeValue;
  promptTemplates: ActionRuntimePromptTemplatesValue;
  policy: ActionRuntimePolicyValue;
};

export type ActionConnectorOperationValue = {
  operationKey: string;
  domain: string;
  label: string;
  description: string;
  riskLevel: ActionRiskLevelValue;
  requiresConfirmation: boolean;
  requiredSlots: string[];
};

export type ActionPlanValue = {
  connectorKey: string;
  operationKey: string;
  domain: string;
  title: string;
  goal: string;
  rationale: string;
  riskLevel: ActionRiskLevelValue;
  requiresConfirmation: boolean;
  slots: Record<string, unknown>;
  missingSlots: string[];
  matchedKeywords: string[];
  promptPreview: string;
};

export type ActionExecutionResultValue = {
  resultSummary: string;
  executionPayload: Record<string, unknown>;
  resultPayload: Record<string, unknown>;
};

export type ActionHandlingResultValue = {
  handled: boolean;
  responseText?: string;
};

export type ActionConnectorTestResultValue = {
  ok: boolean;
  testedAt: string;
  sampleMessage: string;
  summary: string;
  connector: Record<string, unknown>;
  samplePlan?: ActionPlanValue | null;
  executionPayload?: Record<string, unknown> | null;
  resultPayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

export type ActionRunRetryNextStepValue =
  | 'awaiting_slots'
  | 'awaiting_confirmation'
  | 'executed';

export type ActionRunRetryResultValue = {
  nextStep: ActionRunRetryNextStepValue;
  responseText: string;
  run: Record<string, unknown>;
};

export type ActionConnectorSeedValue = {
  id: string;
  connectorKey: string;
  displayName: string;
  providerType: ActionConnectorProviderTypeValue;
  status: ActionConnectorStatusValue;
  endpointConfigPayload?: Record<string, unknown> | null;
  capabilitiesPayload: ActionConnectorOperationValue[];
};
