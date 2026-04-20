export type EvalTargetType = "turn" | "session" | "world_event_chain" | "persona";

export type EvalRunStatus = "queued" | "running" | "completed" | "failed";

export type GenerationTraceStatus = "success" | "fallback" | "error";

export type EvalJudgeSource = "llm" | "heuristic" | "scaffolded";

export interface GenerationTraceInput {
  trigger?: string;
  worldContextSnapshot?: Record<string, unknown> | null;
  activitySnapshot?: Record<string, unknown> | null;
  memorySnapshot?: Record<string, unknown> | null;
  promptMessages: Array<{
    role: string;
    content: string;
  }>;
  requestConfig?: Record<string, unknown> | null;
}

export interface GenerationTraceOutput {
  rawOutput?: string | null;
  normalizedOutput?: string | null;
  fallbackReason?: string | null;
  errorMessage?: string | null;
  judgePayload?: Record<string, unknown> | null;
}

export interface EvalScore {
  key: string;
  label: string;
  value: number;
  rationale?: string;
}

export interface EvalFailureTag {
  key: string;
  label: string;
  count?: number;
}

export interface GenerationTrace {
  id: string;
  createdAt: string;
  source: string;
  status: GenerationTraceStatus;
  conversationId?: string | null;
  characterId?: string | null;
  relatedCharacterIds: string[];
  ownerId?: string | null;
  jobId?: string | null;
  provider?: {
    endpoint?: string | null;
    model?: string | null;
    mode?: string | null;
  } | null;
  latencyMs?: number | null;
  historyWindowSize?: number | null;
  input: GenerationTraceInput;
  output: GenerationTraceOutput;
  evaluationSummary?: {
    scores: EvalScore[];
    failureTags: EvalFailureTag[];
    judgeSource?: EvalJudgeSource;
    judgeRationale?: string | null;
    ruleViolations?: string[];
  } | null;
}

export interface EvalDatasetManifest {
  id: string;
  title: string;
  scope: string;
  targetType: EvalTargetType;
  description: string;
  caseIds: string[];
  rubricIds: string[];
  defaultJudgeConfig?: Record<string, unknown>;
  owner: string;
  version: string;
}

export interface EvalRubricRecord {
  id: string;
  label: string;
  description: string;
}

export interface EvalMemoryStrategyRecord {
  id: string;
  label: string;
  description: string;
  keepRecentTurns?: number;
  truncateMemoryChars?: number;
  dropMemory: boolean;
  promptInstruction?: string;
}

export interface EvalPromptVariantRecord {
  id: string;
  label: string;
  description: string;
  instruction: string;
}

export interface EvalExperimentConfigRecord {
  providerOverride?: string | null;
  judgeModelOverride?: string | null;
  promptVariant?: string | null;
  memoryPolicyVariant?: string | null;
}

export interface EvalExperimentPresetRecord {
  id: string;
  title: string;
  description: string;
  datasetId: string;
  mode: "single" | "pairwise";
  experimentLabel?: string | null;
  baseline?: EvalExperimentConfigRecord | null;
  candidate?: EvalExperimentConfigRecord | null;
}

export interface EvalCaseRecord {
  id: string;
  datasetId: string;
  targetType: EvalTargetType;
  title: string;
  description: string;
  tags: string[];
  priority: "p0" | "p1" | "p2";
  input: Record<string, unknown>;
  expectations: {
    hardRules: string[];
    judgeRubrics: string[];
    forbiddenOutcomes: string[];
  };
  baselineNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvalDatasetDetail {
  manifest: EvalDatasetManifest;
  cases: EvalCaseRecord[];
}

export interface EvalCaseResult {
  caseId: string;
  status: "scaffolded" | "passed" | "failed";
  output?: string;
  scores: EvalScore[];
  failureTags: EvalFailureTag[];
  judgeSource?: EvalJudgeSource;
  judgeRationale?: string;
  ruleViolations: string[];
  traceIds: string[];
  judgeTraceIds?: string[];
  comparison?: {
    outcome: "win" | "lose" | "tie";
    baselineRunId?: string;
  } | null;
}

export interface EvalRunRecord {
  id: string;
  datasetId: string;
  mode: "single" | "pairwise" | "replay" | "persona_gate";
  experimentLabel?: string | null;
  startedAt: string;
  completedAt?: string;
  status: EvalRunStatus;
  runnerVersion: string;
  judgeVersion: string;
  effectiveProviderModel?: string | null;
  effectiveJudgeModel?: string | null;
  providerOverride?: string | null;
  judgeModelOverride?: string | null;
  promptVariant?: string | null;
  memoryPolicyVariant?: string | null;
  summary: {
    caseCount: number;
    completedCases: number;
    passedCases: number;
    failedCases: number;
    scaffoldedCases: number;
    topFailureTags: EvalFailureTag[];
  };
  caseResults: EvalCaseResult[];
}

export interface EvalComparisonRecord {
  id: string;
  createdAt: string;
  experimentLabel?: string | null;
  baselineRunId: string;
  candidateRunId: string;
  baselineDatasetId: string;
  candidateDatasetId: string;
  baselineProviderModel?: string | null;
  candidateProviderModel?: string | null;
  baselineJudgeModel?: string | null;
  candidateJudgeModel?: string | null;
  baselinePromptVariant?: string | null;
  candidatePromptVariant?: string | null;
  baselineMemoryPolicyVariant?: string | null;
  candidateMemoryPolicyVariant?: string | null;
  summary: {
    totalCases: number;
    wins: number;
    losses: number;
    ties: number;
  };
  caseComparisons: Array<{
    caseId: string;
    baselineStatus?: string;
    candidateStatus?: string;
    baselineOutput?: string;
    candidateOutput?: string;
    baselineScoreTotal: number;
    candidateScoreTotal: number;
    scoreDelta: number;
    baselineScores: EvalScore[];
    candidateScores: EvalScore[];
    baselineFailureTags: EvalFailureTag[];
    candidateFailureTags: EvalFailureTag[];
    baselineRuleViolations: string[];
    candidateRuleViolations: string[];
    baselineTraceIds: string[];
    candidateTraceIds: string[];
    outcome: "win" | "lose" | "tie";
  }>;
}

export interface EvalOverview {
  datasetCount: number;
  runCount: number;
  traceCount: number;
  fallbackTraceCount: number;
  failedRunCount: number;
  latestRunAt?: string;
}

export interface ReplayStepRecord {
  id: string;
  kind: string;
  input: Record<string, unknown>;
}

export interface ReplayScenarioRecord {
  id: string;
  title: string;
  description: string;
  participants: string[];
  successCriteria: string[];
  steps: ReplayStepRecord[];
}

export interface PersonaAssetRecord {
  id: string;
  version: string;
  name: string;
  status: "draft" | "reviewing" | "sandboxed" | "approved" | "rejected";
  identity: Record<string, unknown>;
  surfaceStyle: Record<string, unknown>;
  deepTraits: Record<string, unknown>;
  relationPolicy: Record<string, unknown>;
  domainBoundary: Record<string, unknown>;
  rhythm: Record<string, unknown>;
  memoryBias: Record<string, unknown>;
  triggerMap: Record<string, unknown>;
  sampleUtterances: string[];
  evalSummary?: Record<string, unknown>;
  populationDistance?: number;
}

export interface PersonaReviewRecord {
  personaId: string;
  reviewer: string;
  decision: "approved" | "rejected" | "needs_revision";
  notes?: string;
  createdAt: string;
}

export interface RunEvalDatasetRequest {
  datasetId: string;
  mode?: "single" | "pairwise";
  experimentLabel?: string;
  providerOverride?: string;
  judgeModelOverride?: string;
  promptVariant?: string;
  memoryPolicyVariant?: string;
}

export interface CompareEvalRunsRequest {
  baselineRunId: string;
  candidateRunId: string;
}

export interface RunPairwiseEvalRequest {
  datasetId: string;
  experimentLabel?: string;
  baselineProviderOverride?: string;
  baselineJudgeModelOverride?: string;
  baselinePromptVariant?: string;
  baselineMemoryPolicyVariant?: string;
  candidateProviderOverride?: string;
  candidateJudgeModelOverride?: string;
  candidatePromptVariant?: string;
  candidateMemoryPolicyVariant?: string;
}

export interface PairwiseEvalRunResponse {
  baselineRun: EvalRunRecord;
  candidateRun: EvalRunRecord;
  comparison: EvalComparisonRecord;
}

export interface EvalExperimentRunResponse {
  preset: EvalExperimentPresetRecord;
  singleRun?: EvalRunRecord | null;
  pairwiseRun?: PairwiseEvalRunResponse | null;
}

export interface EvalFailureTagDeltaRecord {
  key: string;
  label: string;
  baselineCount: number;
  candidateCount: number;
  delta: number;
}

export interface EvalCaseDeltaRecord {
  caseId: string;
  outcome: "win" | "lose" | "tie";
  scoreDelta: number;
  baselineStatus?: string;
  candidateStatus?: string;
}

export interface EvalExperimentReportRecord {
  id: string;
  createdAt: string;
  presetId: string;
  presetTitle: string;
  datasetId: string;
  experimentLabel?: string | null;
  mode: "single" | "pairwise";
  singleRunId?: string | null;
  baselineRunId?: string | null;
  candidateRunId?: string | null;
  comparisonId?: string | null;
  summary: {
    totalCases: number;
    wins: number;
    losses: number;
    ties: number;
  };
  topCaseDeltas: EvalCaseDeltaRecord[];
  failureTagDeltas: EvalFailureTagDeltaRecord[];
  keep: string[];
  regressions: string[];
  rollback: string[];
  recommendations: string[];
  decisionStatus: "keep-testing" | "promote" | "rollback" | "archive";
  appliedAction?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
  notes: string[];
}

export interface UpdateEvalReportDecisionRequest {
  decisionStatus: "keep-testing" | "promote" | "rollback" | "archive";
  appliedAction?: string;
  decidedBy?: string;
  note?: string;
}

export interface ListEvalRunsQuery {
  datasetId?: string;
  experimentLabel?: string;
  providerModel?: string;
  judgeModel?: string;
  promptVariant?: string;
  memoryPolicyVariant?: string;
}

export interface ListEvalComparisonsQuery {
  datasetId?: string;
  experimentLabel?: string;
  providerModel?: string;
  judgeModel?: string;
  promptVariant?: string;
  memoryPolicyVariant?: string;
}
