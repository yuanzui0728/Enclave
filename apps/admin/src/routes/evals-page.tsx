import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  compareEvalRuns,
  getGenerationTrace,
  getEvalDataset,
  getEvalOverview,
  getEvalRun,
  listEvalComparisonsWithQuery,
  listEvalDatasets,
  listEvalExperimentPresets,
  listEvalExperimentReports,
  listEvalMemoryStrategies,
  listEvalPromptVariants,
  listEvalRunsWithQuery,
  listGenerationTracesWithQuery,
  runEvalDataset,
  runEvalExperimentPreset,
  runPairwiseEval,
  updateEvalReportDecision,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  ListItemCard,
  MetricCard,
  PanelEmpty,
  SelectField as UiSelectField,
  SectionHeading,
  SnapshotPanel,
  StatusPill,
  TagBadge,
  TextField,
} from "@yinjie/ui";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

const EVALS_STATE_KEY = "yinjie-admin-evals-state";
const EVALS_PRESETS_KEY = "yinjie-admin-evals-presets";
const EMPTY_LIST: never[] = [];

type EvalsViewState = {
  compactView: boolean;
  shareViewName: string;
  compareFiltersExpanded: boolean;
  traceFiltersExpanded: boolean;
  selectedReportId: string | null;
  traceSource: string;
  traceStatus: string;
  traceCharacterId: string;
  selectedRunId: string | null;
  selectedTraceId: string | null;
  selectedDatasetId: string | null;
  baselineRunId: string;
  candidateRunId: string;
  experimentLabel: string;
  historyProviderFilter: string;
  historyJudgeFilter: string;
  historyPromptVariantFilter: string;
  historyMemoryPolicyFilter: string;
  compareCaseFilter: "all" | "different" | "failed";
  compareOutcomeFilter: "all" | "win" | "lose" | "tie";
  compareFailureTagFilter: string;
  compareCaseSearch: string;
  traceScopeFilter: "all" | "run" | "compare";
  traceCaseFilter: string;
  traceFailureTagFilter: string;
  focusedCaseId: string | null;
  focusedTraceIds: string[];
};

type EvalsPreset = {
  name: string;
  pinned: boolean;
  compactView: boolean;
  shareViewName: string;
  selectedDatasetId: string | null;
  baselineRunId: string;
  candidateRunId: string;
  compareCaseFilter: "all" | "different" | "failed";
  compareOutcomeFilter: "all" | "win" | "lose" | "tie";
  compareFailureTagFilter: string;
  compareCaseSearch: string;
  traceScopeFilter: "all" | "run" | "compare";
  traceSource: string;
  traceStatus: string;
  traceCharacterId: string;
  traceCaseFilter: string;
  traceFailureTagFilter: string;
};

export function EvalsPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const persistedState = readInitialEvalsState(baseUrl);
  const [compactView, setCompactView] = useState(persistedState.compactView);
  const [shareViewName, setShareViewName] = useState(persistedState.shareViewName);
  const [compareFiltersExpanded, setCompareFiltersExpanded] = useState(persistedState.compareFiltersExpanded);
  const [traceFiltersExpanded, setTraceFiltersExpanded] = useState(persistedState.traceFiltersExpanded);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(persistedState.selectedReportId);
  const [traceSource, setTraceSource] = useState(persistedState.traceSource);
  const [traceStatus, setTraceStatus] = useState(persistedState.traceStatus);
  const [traceCharacterId, setTraceCharacterId] = useState(persistedState.traceCharacterId);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(persistedState.selectedRunId);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(persistedState.selectedTraceId);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(persistedState.selectedDatasetId);
  const [baselineRunId, setBaselineRunId] = useState<string>(persistedState.baselineRunId);
  const [candidateRunId, setCandidateRunId] = useState<string>(persistedState.candidateRunId);
  const [experimentLabel, setExperimentLabel] = useState(persistedState.experimentLabel);
  const [historyProviderFilter, setHistoryProviderFilter] = useState(persistedState.historyProviderFilter);
  const [historyJudgeFilter, setHistoryJudgeFilter] = useState(persistedState.historyJudgeFilter);
  const [historyPromptVariantFilter, setHistoryPromptVariantFilter] = useState(
    persistedState.historyPromptVariantFilter,
  );
  const [historyMemoryPolicyFilter, setHistoryMemoryPolicyFilter] = useState(
    persistedState.historyMemoryPolicyFilter,
  );
  const [compareCaseFilter, setCompareCaseFilter] = useState(persistedState.compareCaseFilter);
  const [compareOutcomeFilter, setCompareOutcomeFilter] = useState(persistedState.compareOutcomeFilter);
  const [compareFailureTagFilter, setCompareFailureTagFilter] = useState(persistedState.compareFailureTagFilter);
  const [compareCaseSearch, setCompareCaseSearch] = useState(persistedState.compareCaseSearch);
  const [traceScopeFilter, setTraceScopeFilter] = useState(persistedState.traceScopeFilter);
  const [traceCaseFilter, setTraceCaseFilter] = useState(persistedState.traceCaseFilter);
  const [traceFailureTagFilter, setTraceFailureTagFilter] = useState(persistedState.traceFailureTagFilter);
  const [focusedCaseId, setFocusedCaseId] = useState<string | null>(persistedState.focusedCaseId);
  const [focusedTraceIds, setFocusedTraceIds] = useState<string[]>(persistedState.focusedTraceIds);
  const [pairwiseProviderOverride, setPairwiseProviderOverride] = useState("");
  const [pairwiseJudgeModelOverride, setPairwiseJudgeModelOverride] = useState("");
  const [pairwisePromptVariant, setPairwisePromptVariant] = useState("warmer");
  const [pairwiseMemoryPolicyVariant, setPairwiseMemoryPolicyVariant] = useState("default");
  const [presetName, setPresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState<EvalsPreset[]>([]);
  const [successNotice, setSuccessNotice] = useState("");

  function persistSavedPresets(nextPresets: EvalsPreset[]) {
    setSavedPresets(nextPresets);
    const storage = getBrowserStorage();
    if (storage) {
      storage.setItem(getEvalStorageKey(EVALS_PRESETS_KEY, baseUrl), JSON.stringify(nextPresets));
    }
  }

  function sortSavedPresets(nextPresets: EvalsPreset[]) {
    return nextPresets.sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }

  const overviewQuery = useQuery({
    queryKey: ["admin-eval-overview", baseUrl],
    queryFn: () => getEvalOverview(baseUrl),
  });

  const datasetsQuery = useQuery({
    queryKey: ["admin-eval-datasets", baseUrl],
    queryFn: () => listEvalDatasets(baseUrl),
  });
  const datasetList = useMemo(() => datasetsQuery.data ?? EMPTY_LIST, [datasetsQuery.data]);

  const strategiesQuery = useQuery({
    queryKey: ["admin-eval-strategies", baseUrl],
    queryFn: () => listEvalMemoryStrategies(baseUrl),
  });
  const memoryStrategies = strategiesQuery.data ?? [];
  const memoryStrategyLabelMap = useMemo(
    () => new Map(memoryStrategies.map((strategy) => [strategy.id, strategy.label])),
    [memoryStrategies],
  );
  const promptVariantsQuery = useQuery({
    queryKey: ["admin-eval-prompt-variants", baseUrl],
    queryFn: () => listEvalPromptVariants(baseUrl),
  });
  const promptVariants = promptVariantsQuery.data ?? [];
  const promptVariantLabelMap = useMemo(
    () => new Map(promptVariants.map((variant) => [variant.id, variant.label])),
    [promptVariants],
  );
  const experimentPresetsQuery = useQuery({
    queryKey: ["admin-eval-experiment-presets", baseUrl],
    queryFn: () => listEvalExperimentPresets(baseUrl),
  });
  const experimentPresets = experimentPresetsQuery.data ?? [];
  const experimentReportsQuery = useQuery({
    queryKey: ["admin-eval-experiment-reports", baseUrl],
    queryFn: () => listEvalExperimentReports(baseUrl),
  });
  const experimentReports = useMemo(
    () => experimentReportsQuery.data ?? EMPTY_LIST,
    [experimentReportsQuery.data],
  );
  const selectedReport = experimentReports.find((report) => report.id === selectedReportId) ?? experimentReports[0] ?? null;

  const runsQuery = useQuery({
    queryKey: [
      "admin-eval-runs",
      baseUrl,
      selectedDatasetId,
      experimentLabel,
      historyProviderFilter,
      historyJudgeFilter,
      historyPromptVariantFilter,
      historyMemoryPolicyFilter,
    ],
    queryFn: () =>
      listEvalRunsWithQuery(
        {
          datasetId: selectedDatasetId ?? undefined,
          experimentLabel: experimentLabel || undefined,
          providerModel: historyProviderFilter || undefined,
          judgeModel: historyJudgeFilter || undefined,
          promptVariant: historyPromptVariantFilter || undefined,
          memoryPolicyVariant: historyMemoryPolicyFilter || undefined,
        },
        baseUrl,
      ),
  });
  const allRuns = useMemo(() => runsQuery.data ?? EMPTY_LIST, [runsQuery.data]);
  const recentRuns = allRuns.slice(0, 5);

  const comparisonsQuery = useQuery({
    queryKey: [
      "admin-eval-comparisons",
      baseUrl,
      selectedDatasetId,
      experimentLabel,
      historyProviderFilter,
      historyJudgeFilter,
      historyPromptVariantFilter,
      historyMemoryPolicyFilter,
    ],
    queryFn: () =>
      listEvalComparisonsWithQuery(
        {
          datasetId: selectedDatasetId ?? undefined,
          experimentLabel: experimentLabel || undefined,
          providerModel: historyProviderFilter || undefined,
          judgeModel: historyJudgeFilter || undefined,
          promptVariant: historyPromptVariantFilter || undefined,
          memoryPolicyVariant: historyMemoryPolicyFilter || undefined,
        },
        baseUrl,
      ),
  });

  const tracesQuery = useQuery({
    queryKey: ["admin-eval-traces", baseUrl, traceSource, traceStatus, traceCharacterId],
    queryFn: () =>
      listGenerationTracesWithQuery(
        {
          source: traceSource || undefined,
          status: traceStatus || undefined,
          characterId: traceCharacterId || undefined,
          limit: 50,
        },
        baseUrl,
      ),
  });

  const traceDetailQuery = useQuery({
    queryKey: ["admin-eval-trace-detail", baseUrl, selectedTraceId],
    queryFn: () => getGenerationTrace(selectedTraceId ?? "", baseUrl),
    enabled: Boolean(selectedTraceId),
  });

  const runDetailQuery = useQuery({
    queryKey: ["admin-eval-run-detail", baseUrl, selectedRunId],
    queryFn: () => getEvalRun(selectedRunId ?? "", baseUrl),
    enabled: Boolean(selectedRunId),
  });

  const datasetDetailQuery = useQuery({
    queryKey: ["admin-eval-dataset-detail", baseUrl, selectedDatasetId],
    queryFn: () => getEvalDataset(selectedDatasetId ?? "", baseUrl),
    enabled: Boolean(selectedDatasetId),
  });

  const compareQuery = useQuery({
    queryKey: ["admin-eval-compare", baseUrl, baselineRunId, candidateRunId],
    queryFn: () =>
      compareEvalRuns(
        {
          baselineRunId,
          candidateRunId,
        },
        baseUrl,
      ),
    enabled: Boolean(baselineRunId && candidateRunId && baselineRunId !== candidateRunId),
  });

  const runDatasetMutation = useMutation({
    mutationFn: (datasetId: string) =>
      runEvalDataset(
        {
          datasetId,
          experimentLabel: experimentLabel.trim() || undefined,
          providerOverride: pairwiseProviderOverride.trim() || undefined,
          judgeModelOverride: pairwiseJudgeModelOverride.trim() || undefined,
          promptVariant: pairwisePromptVariant.trim() || undefined,
          memoryPolicyVariant:
            pairwiseMemoryPolicyVariant === "default" ? undefined : pairwiseMemoryPolicyVariant,
        },
        baseUrl,
      ),
    onSuccess: async (result) => {
      setSuccessNotice(`数据集运行完成：${result.id}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-eval-overview", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-runs", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-comparisons", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-experiment-reports", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-traces", baseUrl] }),
      ]);
    },
  });
  const runPairwiseMutation = useMutation({
    mutationFn: (datasetId: string) =>
      runPairwiseEval(
        {
          datasetId,
          experimentLabel: experimentLabel.trim() || undefined,
          candidateProviderOverride: pairwiseProviderOverride.trim() || undefined,
          candidateJudgeModelOverride: pairwiseJudgeModelOverride.trim() || undefined,
          candidatePromptVariant: pairwisePromptVariant.trim() || undefined,
          candidateMemoryPolicyVariant:
            pairwiseMemoryPolicyVariant === "default" ? undefined : pairwiseMemoryPolicyVariant,
        },
        baseUrl,
      ),
    onSuccess: async (result) => {
      setSuccessNotice(`成对评测已完成：${result.comparison.id}`);
      setBaselineRunId(result.baselineRun.id);
      setCandidateRunId(result.candidateRun.id);
      setSelectedRunId(result.candidateRun.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-eval-overview", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-runs", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-comparisons", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-traces", baseUrl] }),
      ]);
    },
  });
  const runExperimentPresetMutation = useMutation({
    mutationFn: (presetId: string) => runEvalExperimentPreset(presetId, baseUrl),
    onSuccess: async (result) => {
      setSuccessNotice(`实验预设已执行完成：${result.preset.id}`);
      if (result.pairwiseRun) {
        setBaselineRunId(result.pairwiseRun.baselineRun.id);
        setCandidateRunId(result.pairwiseRun.candidateRun.id);
        setSelectedRunId(result.pairwiseRun.candidateRun.id);
      } else if (result.singleRun) {
        setSelectedRunId(result.singleRun.id);
        setSelectedDatasetId(result.singleRun.datasetId);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-eval-overview", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-runs", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-comparisons", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-eval-traces", baseUrl] }),
      ]);
    },
  });
  const updateReportDecisionMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      decisionStatus: "keep-testing" | "promote" | "rollback" | "archive";
      appliedAction: string;
    }) =>
      updateEvalReportDecision(
        payload.id,
        {
          decisionStatus: payload.decisionStatus,
          appliedAction: payload.appliedAction,
          decidedBy: "admin",
        },
        baseUrl,
      ),
    onSuccess: async (report) => {
      setSuccessNotice(`报告决策已更新：${formatDecisionStatus(report.decisionStatus)}`);
      setSelectedReportId(report.id);
      await queryClient.invalidateQueries({ queryKey: ["admin-eval-experiment-reports", baseUrl] });
    },
  });
  const evalRunBusy =
    runDatasetMutation.isPending || runPairwiseMutation.isPending || runExperimentPresetMutation.isPending;
  const reportDecisionBusy = updateReportDecisionMutation.isPending;
  const activeDatasetRunId = runDatasetMutation.isPending ? runDatasetMutation.variables : null;
  const activePairwiseRunId = runPairwiseMutation.isPending ? runPairwiseMutation.variables : null;
  const activePresetRunId = runExperimentPresetMutation.isPending ? runExperimentPresetMutation.variables : null;
  const activeReportDecisionId = updateReportDecisionMutation.isPending ? updateReportDecisionMutation.variables?.id : null;

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  const resetEvalMutations = useEffectEvent(() => {
    setSuccessNotice("");
    runDatasetMutation.reset();
    runPairwiseMutation.reset();
    runExperimentPresetMutation.reset();
    updateReportDecisionMutation.reset();
  });

  useEffect(() => {
    resetEvalMutations();
  }, [baseUrl, resetEvalMutations]);

  const selectedRunTraceIds = new Set((runDetailQuery.data?.caseResults ?? []).flatMap((caseResult) => caseResult.traceIds));
  const compareTraceIds = new Set((compareQuery.data?.caseComparisons ?? []).flatMap((comparison) => [
    ...comparison.baselineTraceIds,
    ...comparison.candidateTraceIds,
  ]));
  const traceCaseMap = new Map<string, Set<string>>();
  const traceFailureTagMap = new Map<string, Set<string>>();
  for (const caseResult of runDetailQuery.data?.caseResults ?? []) {
    for (const traceId of caseResult.traceIds) {
      const caseIds = traceCaseMap.get(traceId) ?? new Set<string>();
      caseIds.add(caseResult.caseId);
      traceCaseMap.set(traceId, caseIds);

      const failureTags = traceFailureTagMap.get(traceId) ?? new Set<string>();
      for (const tag of caseResult.failureTags) {
        failureTags.add(tag.key);
      }
      traceFailureTagMap.set(traceId, failureTags);
    }
  }
  for (const comparison of compareQuery.data?.caseComparisons ?? []) {
    for (const traceId of [...comparison.baselineTraceIds, ...comparison.candidateTraceIds]) {
      const caseIds = traceCaseMap.get(traceId) ?? new Set<string>();
      caseIds.add(comparison.caseId);
      traceCaseMap.set(traceId, caseIds);

      const failureTags = traceFailureTagMap.get(traceId) ?? new Set<string>();
      for (const tag of [...comparison.baselineFailureTags, ...comparison.candidateFailureTags]) {
        failureTags.add(tag.key);
      }
      traceFailureTagMap.set(traceId, failureTags);
    }
  }
  const tracePool = useMemo(() => tracesQuery.data ?? EMPTY_LIST, [tracesQuery.data]);
  const scopedTraces =
    traceScopeFilter === "run"
      ? tracePool.filter((trace) => selectedRunTraceIds.has(trace.id))
      : traceScopeFilter === "compare"
        ? tracePool.filter((trace) => compareTraceIds.has(trace.id))
        : tracePool;
  const filteredTraces = scopedTraces.filter((trace) => {
    if (traceCaseFilter && !traceCaseMap.get(trace.id)?.has(traceCaseFilter)) {
      return false;
    }
    if (traceFailureTagFilter && !traceFailureTagMap.get(trace.id)?.has(traceFailureTagFilter)) {
      return false;
    }
    return true;
  });
  const visibleTraces = focusedTraceIds.length > 0
    ? filteredTraces.filter((trace) => focusedTraceIds.includes(trace.id))
    : filteredTraces;
  const recentTraces = visibleTraces.slice(0, 8);
  const availableTraceCaseIds = Array.from(
    new Set(
      [...(runDetailQuery.data?.caseResults ?? []).map((caseResult) => caseResult.caseId), ...(compareQuery.data?.caseComparisons ?? []).map((comparison) => comparison.caseId)],
    ),
  ).sort();
  const availableTraceFailureTags = Array.from(
    new Set([...traceFailureTagMap.values()].flatMap((tagSet) => Array.from(tagSet))),
  ).sort();
  const availableCharacterIds = Array.from(
    new Set((tracesQuery.data ?? []).map((trace) => trace.characterId).filter(Boolean)),
  );
  const baselineRun = allRuns.find((run) => run.id === baselineRunId) ?? null;
  const candidateRun = allRuns.find((run) => run.id === candidateRunId) ?? null;
  const compareDatasetId = candidateRun?.datasetId || baselineRun?.datasetId || "";
  const comparableRuns = compareDatasetId
    ? allRuns.filter((run) => run.datasetId === compareDatasetId)
    : allRuns;
  const availableCompareFailureTags = Array.from(
    new Set(
      (compareQuery.data?.caseComparisons ?? []).flatMap((comparison) => [
        ...comparison.baselineFailureTags.map((tag) => tag.key),
        ...comparison.candidateFailureTags.map((tag) => tag.key),
      ]),
    ),
  ).sort();
  const selectedDatasetCaseMap = new Map(
    (datasetDetailQuery.data?.cases ?? []).map((caseRecord) => [caseRecord.id, caseRecord]),
  );
  const visibleComparisons = (compareQuery.data?.caseComparisons ?? []).filter((comparison) => {
    if (compareCaseSearch.trim()) {
      const keyword = compareCaseSearch.trim().toLowerCase();
      if (!comparison.caseId.toLowerCase().includes(keyword)) {
        return false;
      }
    }
    if (compareCaseFilter === "different") {
      return comparison.outcome !== "tie";
    }
    if (compareCaseFilter === "failed") {
      return comparison.baselineStatus === "failed" || comparison.candidateStatus === "failed";
    }
    if (compareOutcomeFilter !== "all" && comparison.outcome !== compareOutcomeFilter) {
      return false;
    }
    if (
      compareFailureTagFilter &&
      !comparison.baselineFailureTags.some((tag) => tag.key === compareFailureTagFilter) &&
      !comparison.candidateFailureTags.some((tag) => tag.key === compareFailureTagFilter)
    ) {
      return false;
    }
    return true;
  });
  const filteredComparisonSummary = visibleComparisons.reduce(
    (summary, comparison) => {
      if (comparison.outcome === "win") {
        summary.wins += 1;
      } else if (comparison.outcome === "lose") {
        summary.losses += 1;
      } else {
        summary.ties += 1;
      }
      return summary;
    },
    { wins: 0, losses: 0, ties: 0 },
  );
  const compactComparisons = visibleComparisons.filter(
    (comparison) =>
      comparison.outcome !== "tie" ||
      comparison.baselineStatus === "failed" ||
      comparison.candidateStatus === "failed",
  );
  const activeCompareFilterCount = [
    compareCaseSearch.trim(),
    baselineRunId,
    candidateRunId,
    compareCaseFilter !== "all" ? compareCaseFilter : "",
    compareOutcomeFilter !== "all" ? compareOutcomeFilter : "",
    compareFailureTagFilter,
  ].filter(Boolean).length;
  const activeTraceFilterCount = [
    traceScopeFilter !== "all" ? traceScopeFilter : "",
    traceCaseFilter,
    traceFailureTagFilter,
    traceSource,
    traceStatus,
    traceCharacterId,
    focusedCaseId,
  ].filter(Boolean).length;
  const selectedTraceCaseIds = selectedTraceId ? Array.from(traceCaseMap.get(selectedTraceId) ?? []) : [];
  const selectedTraceFailureTags = selectedTraceId ? Array.from(traceFailureTagMap.get(selectedTraceId) ?? []) : [];
  const selectedTraceLinkedRunCases = (runDetailQuery.data?.caseResults ?? [])
    .filter((caseResult) => selectedTraceId && caseResult.traceIds.includes(selectedTraceId))
    .map((caseResult) => caseResult.caseId);
  const selectedTraceComparisonMatches = (compareQuery.data?.caseComparisons ?? [])
    .flatMap((comparison) => {
      const roles: string[] = [];
      if (selectedTraceId && comparison.baselineTraceIds.includes(selectedTraceId)) {
        roles.push(`baseline:${comparison.caseId}`);
      }
      if (selectedTraceId && comparison.candidateTraceIds.includes(selectedTraceId)) {
        roles.push(`candidate:${comparison.caseId}`);
      }
      return roles;
    });
  const failureFocusedTraces = visibleTraces.filter(
    (trace) =>
      trace.status !== "success" ||
      (trace.evaluationSummary?.failureTags.length ?? 0) > 0,
  );
  const displayedComparisons = compactView ? compactComparisons : visibleComparisons;
  const displayedTraces = compactView ? failureFocusedTraces.slice(0, 8) : recentTraces;

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) {
      setSavedPresets([]);
      return;
    }
    try {
      const raw = storage.getItem(getEvalStorageKey(EVALS_PRESETS_KEY, baseUrl));
      if (!raw) {
        setSavedPresets([]);
        return;
      }
      setSavedPresets(sortSavedPresets(JSON.parse(raw) as EvalsPreset[]));
    } catch {
      setSavedPresets([]);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (recentRuns.length >= 2 && !baselineRunId && !candidateRunId) {
      setCandidateRunId(recentRuns[0].id);
      setBaselineRunId(recentRuns[1].id);
    }
  }, [baselineRunId, candidateRunId, recentRuns]);

  useEffect(() => {
    if (!baselineRunId || !candidateRunId) {
      return;
    }
    if (!baselineRun || !candidateRun) {
      return;
    }
    if (baselineRun.datasetId !== candidateRun.datasetId) {
      setBaselineRunId("");
    }
  }, [baselineRun, baselineRunId, candidateRun, candidateRunId]);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) {
      return;
    }
    storage.setItem(
      getEvalStorageKey(EVALS_STATE_KEY, baseUrl),
      JSON.stringify({
        traceSource,
        compactView,
        shareViewName,
        compareFiltersExpanded,
        traceFiltersExpanded,
        selectedReportId,
        traceStatus,
        traceCharacterId,
        selectedRunId,
        selectedTraceId,
        selectedDatasetId,
        baselineRunId,
        candidateRunId,
        experimentLabel,
        historyProviderFilter,
        historyJudgeFilter,
        historyPromptVariantFilter,
        historyMemoryPolicyFilter,
        compareCaseFilter,
        compareOutcomeFilter,
        compareFailureTagFilter,
        compareCaseSearch,
        traceScopeFilter,
        traceCaseFilter,
        traceFailureTagFilter,
        focusedCaseId,
        focusedTraceIds,
      }),
    );
  }, [
    baseUrl,
    baselineRunId,
    candidateRunId,
    compactView,
    compareFiltersExpanded,
    experimentLabel,
    compareCaseFilter,
    compareOutcomeFilter,
    compareFailureTagFilter,
    compareCaseSearch,
    focusedCaseId,
    focusedTraceIds,
    historyJudgeFilter,
    historyMemoryPolicyFilter,
    historyPromptVariantFilter,
    historyProviderFilter,
    shareViewName,
    selectedReportId,
    selectedDatasetId,
    selectedRunId,
    selectedTraceId,
    traceCharacterId,
    traceCaseFilter,
    traceFailureTagFilter,
    traceFiltersExpanded,
    traceScopeFilter,
    traceSource,
    traceStatus,
  ]);

  useEffect(() => {
    if (selectedReportId && !experimentReports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(null);
    }
  }, [experimentReports, selectedReportId]);

  useEffect(() => {
    if (selectedRunId && !allRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(null);
    }
    if (baselineRunId && !allRuns.some((run) => run.id === baselineRunId)) {
      setBaselineRunId("");
    }
    if (candidateRunId && !allRuns.some((run) => run.id === candidateRunId)) {
      setCandidateRunId("");
    }
  }, [allRuns, baselineRunId, candidateRunId, selectedRunId]);

  useEffect(() => {
    if (selectedDatasetId && !datasetList.some((dataset) => dataset.id === selectedDatasetId)) {
      setSelectedDatasetId(null);
    }
  }, [datasetList, selectedDatasetId]);

  useEffect(() => {
    if (selectedTraceId && !tracePool.some((trace) => trace.id === selectedTraceId)) {
      setSelectedTraceId(null);
    }

    setFocusedTraceIds((current) => current.filter((traceId) => tracePool.some((trace) => trace.id === traceId)));
  }, [selectedTraceId, tracePool]);

  useEffect(() => {
    if (focusedCaseId) {
      const caseExists =
        availableTraceCaseIds.includes(focusedCaseId) ||
        visibleComparisons.some((comparison) => comparison.caseId === focusedCaseId);
      if (!caseExists) {
        setFocusedCaseId(null);
      }
    }
  }, [availableTraceCaseIds, focusedCaseId, visibleComparisons]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setQueryParam(params, "compact", compactView ? "1" : null);
    setQueryParam(params, "view", shareViewName || null);
    setQueryParam(params, "report", selectedReportId);
    setQueryParam(params, "dataset", selectedDatasetId);
    setQueryParam(params, "run", selectedRunId);
    setQueryParam(params, "baseline", baselineRunId || null);
    setQueryParam(params, "candidate", candidateRunId || null);
    setQueryParam(params, "experiment", experimentLabel || null);
    setQueryParam(params, "historyProvider", historyProviderFilter || null);
    setQueryParam(params, "historyJudge", historyJudgeFilter || null);
    setQueryParam(params, "historyPrompt", historyPromptVariantFilter || null);
    setQueryParam(params, "historyMemory", historyMemoryPolicyFilter || null);
    setQueryParam(params, "compareFilter", compareCaseFilter === "all" ? null : compareCaseFilter);
    setQueryParam(params, "compareOutcome", compareOutcomeFilter === "all" ? null : compareOutcomeFilter);
    setQueryParam(params, "compareFailureTag", compareFailureTagFilter || null);
    setQueryParam(params, "compareSearch", compareCaseSearch || null);
    setQueryParam(params, "trace", selectedTraceId);
    setQueryParam(params, "traceScope", traceScopeFilter === "all" ? null : traceScopeFilter);
    setQueryParam(params, "traceCase", traceCaseFilter || null);
    setQueryParam(params, "traceFailureTag", traceFailureTagFilter || null);
    setQueryParam(params, "traceSource", traceSource || null);
    setQueryParam(params, "traceStatus", traceStatus || null);
    setQueryParam(params, "traceCharacter", traceCharacterId || null);
    setQueryParam(params, "case", focusedCaseId);
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState(null, "", url);
  }, [
    baselineRunId,
    candidateRunId,
    compactView,
    experimentLabel,
    compareCaseFilter,
    compareOutcomeFilter,
    compareFailureTagFilter,
    compareCaseSearch,
    focusedCaseId,
    historyJudgeFilter,
    historyMemoryPolicyFilter,
    historyPromptVariantFilter,
    historyProviderFilter,
    shareViewName,
    selectedReportId,
    selectedDatasetId,
    selectedRunId,
    selectedTraceId,
    traceCharacterId,
    traceCaseFilter,
    traceFailureTagFilter,
    traceScopeFilter,
    traceSource,
    traceStatus,
  ]);

  function focusCase(caseId: string, traceIds: string[]) {
    setFocusedCaseId(caseId);
    setFocusedTraceIds(traceIds);
    if (traceIds.length > 0) {
      setSelectedTraceId(traceIds[0]);
    }
  }

  function clearTraceFocus() {
    setFocusedCaseId(null);
    setFocusedTraceIds([]);
  }

  function selectDataset(datasetId: string) {
    setSelectedDatasetId(datasetId);
  }

  function selectRun(runId: string) {
    setSelectedRunId(runId);
    const run = (runsQuery.data ?? []).find((item) => item.id === runId);
    if (run) {
      setSelectedDatasetId(run.datasetId);
    }
    if (!candidateRunId) {
      setCandidateRunId(runId);
    } else if (candidateRun && candidateRun.datasetId !== run?.datasetId) {
      setCandidateRunId(runId);
      setBaselineRunId("");
    } else if (!baselineRunId && runId !== candidateRunId) {
      setBaselineRunId(runId);
    }
  }

  function currentViewUrl() {
    if (typeof window === "undefined") {
      return "";
    }
    const params = new URLSearchParams(window.location.search);
    setQueryParam(params, "compact", compactView ? "1" : null);
    setQueryParam(params, "view", shareViewName || null);
    const next = params.toString();
    return `${window.location.origin}${window.location.pathname}${next ? `?${next}` : ""}`;
  }

  async function copyCurrentViewLink() {
    if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(currentViewUrl());
  }

  async function copyPresetPayload(payload: string, promptLabel: string) {
    if (typeof window === "undefined") {
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(payload);
      return;
    }
    window.prompt(promptLabel, payload);
  }

  async function exportAllPresets() {
      await copyPresetPayload(JSON.stringify(savedPresets, null, 2), "复制预设 JSON");
  }

  async function exportCurrentPreset() {
    const name = presetName.trim();
    if (!name) {
      return;
    }
    const preset = savedPresets.find((item) => item.name === name) ?? currentPresetSnapshot(name);
    await copyPresetPayload(JSON.stringify(preset, null, 2), "复制当前预设 JSON");
  }

  function importPresets() {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.prompt("粘贴预设 JSON");
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const source = Array.isArray(parsed) ? parsed : [parsed];
      const normalized: EvalsPreset[] = source
        .filter((preset): preset is Partial<EvalsPreset> & { name: string } => Boolean(preset && typeof preset === "object" && typeof preset.name === "string"))
        .map((preset): EvalsPreset => ({
          name: preset.name,
          pinned: typeof preset.pinned === "boolean" ? preset.pinned : false,
          shareViewName: typeof preset.shareViewName === "string" ? preset.shareViewName : preset.name,
          selectedDatasetId: typeof preset.selectedDatasetId === "string" ? preset.selectedDatasetId : null,
          compactView: typeof preset.compactView === "boolean" ? preset.compactView : false,
          baselineRunId: typeof preset.baselineRunId === "string" ? preset.baselineRunId : "",
          candidateRunId: typeof preset.candidateRunId === "string" ? preset.candidateRunId : "",
          compareCaseFilter:
            preset.compareCaseFilter === "different" || preset.compareCaseFilter === "failed"
              ? preset.compareCaseFilter
              : "all",
          compareOutcomeFilter:
            preset.compareOutcomeFilter === "win" || preset.compareOutcomeFilter === "lose" || preset.compareOutcomeFilter === "tie"
              ? preset.compareOutcomeFilter
              : "all",
          compareFailureTagFilter: typeof preset.compareFailureTagFilter === "string" ? preset.compareFailureTagFilter : "",
          compareCaseSearch: typeof preset.compareCaseSearch === "string" ? preset.compareCaseSearch : "",
          traceScopeFilter:
            preset.traceScopeFilter === "run" || preset.traceScopeFilter === "compare"
              ? preset.traceScopeFilter
              : "all",
          traceSource: typeof preset.traceSource === "string" ? preset.traceSource : "",
          traceStatus: typeof preset.traceStatus === "string" ? preset.traceStatus : "",
          traceCharacterId: typeof preset.traceCharacterId === "string" ? preset.traceCharacterId : "",
          traceCaseFilter: typeof preset.traceCaseFilter === "string" ? preset.traceCaseFilter : "",
          traceFailureTagFilter: typeof preset.traceFailureTagFilter === "string" ? preset.traceFailureTagFilter : "",
        }))
      const mergedPresets = sortSavedPresets([
        ...savedPresets.filter((existing) => !normalized.some((incoming) => incoming.name === existing.name)),
        ...normalized,
      ]);
      persistSavedPresets(mergedPresets);
    } catch {
      window.alert("预设 JSON 无效");
    }
  }

  function currentPresetSnapshot(name: string): EvalsPreset {
    return {
      name,
      pinned: savedPresets.find((preset) => preset.name === name)?.pinned ?? false,
      selectedDatasetId,
      compactView,
      shareViewName,
      baselineRunId,
      candidateRunId,
      compareCaseFilter,
      compareOutcomeFilter,
      compareFailureTagFilter,
      compareCaseSearch,
      traceScopeFilter,
      traceSource,
      traceStatus,
      traceCharacterId,
      traceCaseFilter,
      traceFailureTagFilter,
    };
  }

  function saveCurrentPreset() {
    const name = presetName.trim();
    if (!name || typeof window === "undefined") {
      return;
    }
    const nextPreset = currentPresetSnapshot(name);
    persistSavedPresets(sortSavedPresets([...savedPresets.filter((preset) => preset.name !== name), nextPreset]));
  }

  function applyPreset(name: string) {
    const preset = savedPresets.find((item) => item.name === name);
    if (!preset) {
      return;
    }
    setPresetName(preset.name);
    setCompactView(preset.compactView);
    setShareViewName(preset.shareViewName);
    setSelectedDatasetId(preset.selectedDatasetId);
    setBaselineRunId(preset.baselineRunId);
    setCandidateRunId(preset.candidateRunId);
    setCompareCaseFilter(preset.compareCaseFilter);
    setCompareOutcomeFilter(preset.compareOutcomeFilter);
    setCompareFailureTagFilter(preset.compareFailureTagFilter);
    setCompareCaseSearch(preset.compareCaseSearch);
    setTraceScopeFilter(preset.traceScopeFilter);
    setTraceSource(preset.traceSource);
    setTraceStatus(preset.traceStatus);
    setTraceCharacterId(preset.traceCharacterId);
    setTraceCaseFilter(preset.traceCaseFilter);
    setTraceFailureTagFilter(preset.traceFailureTagFilter);
  }

  function deletePreset(name: string) {
    if (typeof window === "undefined") {
      return;
    }
    const nextPresets = savedPresets.filter((preset) => preset.name !== name);
    persistSavedPresets(nextPresets);
    if (presetName === name) {
      setPresetName("");
    }
  }

  function togglePresetPinned(name: string) {
    persistSavedPresets(
      sortSavedPresets(
        savedPresets.map((preset) =>
          preset.name === name ? { ...preset, pinned: !preset.pinned } : preset,
        ),
      ),
    );
  }

  function movePreset(name: string, direction: "up" | "down") {
    const index = savedPresets.findIndex((preset) => preset.name === name);
    if (index === -1) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= savedPresets.length) {
      return;
    }
    const nextPresets = [...savedPresets];
    const [current] = nextPresets.splice(index, 1);
    nextPresets.splice(targetIndex, 0, current);
    persistSavedPresets(nextPresets);
  }

  function resetViewState() {
    setTraceSource("");
    setCompactView(false);
    setShareViewName("");
    setCompareFiltersExpanded(true);
    setTraceFiltersExpanded(true);
    setSelectedReportId(null);
    setTraceStatus("");
    setTraceCharacterId("");
    setSelectedRunId(null);
    setSelectedTraceId(null);
    setSelectedDatasetId(null);
    setBaselineRunId("");
    setCandidateRunId("");
    setExperimentLabel("");
    setHistoryProviderFilter("");
    setHistoryJudgeFilter("");
    setHistoryPromptVariantFilter("");
    setHistoryMemoryPolicyFilter("");
    setCompareCaseFilter("all");
    setCompareOutcomeFilter("all");
    setCompareFailureTagFilter("");
    setCompareCaseSearch("");
    setTraceScopeFilter("all");
    setTraceCaseFilter("");
    setTraceFailureTagFilter("");
    setFocusedCaseId(null);
    setFocusedTraceIds([]);
    setPairwiseProviderOverride("");
    setPairwiseJudgeModelOverride("");
    setPairwisePromptVariant("warmer");
    setPairwiseMemoryPolicyVariant("default");
    setPresetName("");
  }

  function jumpToSection(sectionId: string) {
    if (typeof document === "undefined") {
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,247,235,0.92)_42%,rgba(237,250,244,0.95))]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">评测工作台</div>
              <h2 className="mt-3 text-3xl font-semibold text-[color:var(--text-primary)]">先选视图，再跑实验，再下钻链路。</h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                这里负责运行数据集、比较实验结果、查看实验报告，并沿着生成链路继续下钻到提示词与上下文。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant={compactView ? "primary" : "secondary"} onClick={() => setCompactView((value) => !value)}>
                {compactView ? "紧凑模式：开" : "紧凑模式：关"}
              </Button>
              <Button variant="secondary" onClick={resetViewState}>
                重置筛选
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="数据集" value={overviewQuery.data?.datasetCount ?? 0} />
            <MetricCard label="运行次数" value={overviewQuery.data?.runCount ?? 0} />
            <MetricCard label="链路数" value={overviewQuery.data?.traceCount ?? 0} />
            <MetricCard label="失败运行" value={overviewQuery.data?.failedRunCount ?? 0} />
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>当前聚焦</SectionHeading>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="显示模式"
              value={compactView ? "紧凑" : "完整"}
              meta={<StatusPill tone={compactView ? "warning" : "healthy"}>{compactView ? "聚焦异常" : "完整浏览"}</StatusPill>}
            />
            <MetricCard label="当前数据集" value={selectedDatasetId ?? "全部"} />
            <MetricCard label="当前运行" value={selectedRunId ?? "未选择"} />
            <MetricCard label="当前链路" value={selectedTraceId ?? "未选择"} />
            <MetricCard label="实验报告" value={selectedReport?.presetTitle ?? "未选择"} />
            <MetricCard label="用例聚焦" value={focusedCaseId ?? "未聚焦"} />
          </div>
          {shareViewName.trim() ? (
            <InlineNotice className="mt-4" tone="info">当前分享视图：{shareViewName.trim()}</InlineNotice>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>工作区导航</SectionHeading>
            <div className="mt-4 grid gap-2">
              <EvalWorkspaceNavButton label="评测概览" detail="看全局状态与视图配置" onClick={() => jumpToSection("eval-overview")} />
              <EvalWorkspaceNavButton label="已保存视图" detail="保存和复用筛选组合" onClick={() => jumpToSection("eval-presets")} />
              <EvalWorkspaceNavButton label="运行入口" detail="数据集、预设与最近运行" onClick={() => jumpToSection("eval-runs")} disabled={compactView} />
              <EvalWorkspaceNavButton label="实验报告" detail="查看决策与关键差异" onClick={() => jumpToSection("eval-reports")} disabled={compactView} />
              <EvalWorkspaceNavButton label="运行对比" detail="锁定基线和候选，缩小差异范围" onClick={() => jumpToSection("eval-compare")} />
              <EvalWorkspaceNavButton label="生成链路" detail="查看 prompt、上下文和失败标签" onClick={() => jumpToSection("eval-traces")} />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>快速状态</SectionHeading>
            <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
              <StaticPillRow label="最近运行" value={overviewQuery.data?.latestRunAt ?? "暂无"} />
              <StaticPillRow label="对比筛选" value={`${activeCompareFilterCount} 个`} />
              <StaticPillRow label="链路筛选" value={`${activeTraceFilterCount} 个`} />
              <StaticPillRow label="当前对比" value={baselineRunId && candidateRunId ? "已锁定" : "未锁定"} />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>预设速览</SectionHeading>
            <div className="mt-4 space-y-3">
              {savedPresets.slice(0, 4).map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setPresetName(preset.name);
                    applyPreset(preset.name);
                  }}
                  className="block w-full rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-[color:var(--text-primary)]">{preset.name}</div>
                    <StatusPill tone={preset.compactView ? "healthy" : "muted"}>
                      {preset.compactView ? "紧凑" : "完整"}
                    </StatusPill>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
                    {preset.shareViewName || "未命名视图"}
                  </div>
                </button>
              ))}
              {savedPresets.length === 0 ? <PanelEmpty message="还没有保存的视图预设。" /> : null}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
      <Card id="eval-overview" className="bg-[color:var(--surface-console)]">
        <SectionHeading>评测概览</SectionHeading>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="数据集" value={overviewQuery.data?.datasetCount ?? 0} />
          <MetricCard label="运行次数" value={overviewQuery.data?.runCount ?? 0} />
          <MetricCard label="链路数" value={overviewQuery.data?.traceCount ?? 0} />
          <MetricCard label="回退链路" value={overviewQuery.data?.fallbackTraceCount ?? 0} />
          <MetricCard label="失败运行" value={overviewQuery.data?.failedRunCount ?? 0} />
        </div>
        <div className="mt-4 text-sm text-[color:var(--text-secondary)]">
          最近运行：{overviewQuery.data?.latestRunAt ?? "暂无"}
        </div>
        {shareViewName.trim() ? (
          <div className="mt-4">
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-100">
              视图：{shareViewName.trim()}
            </span>
          </div>
        ) : null}
        <InlineNotice className="mt-4" tone={compactView ? "info" : "muted"}>
          {compactView
            ? "当前是紧凑模式，只优先展示失败、异常和差异明显的结果。"
            : "当前是完整模式，适合完整浏览运行记录、对比结果、实验报告和生成链路。"}
        </InlineNotice>
        <div className="mt-4 flex flex-wrap gap-3">
          <TextField
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            placeholder="预设名称"
            className="w-auto min-w-44 rounded-full py-2"
          />
          <TextField
            value={shareViewName}
            onChange={(event) => setShareViewName(event.target.value)}
            placeholder="分享视图名称"
            className="w-auto min-w-48 rounded-full py-2"
          />
          <Button variant="secondary" onClick={saveCurrentPreset}>
            保存预设
          </Button>
          <Button variant="secondary" onClick={() => {
            void exportCurrentPreset();
          }}>
            导出当前预设
          </Button>
          <Button variant="secondary" onClick={() => {
            void exportAllPresets();
          }}>
            导出全部预设
          </Button>
          <Button variant="secondary" onClick={importPresets}>
            导入预设
          </Button>
          <UiSelectField
            value={presetName}
            onChange={(event) => {
              setPresetName(event.target.value);
              applyPreset(event.target.value);
            }}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          >
            <option value="">应用预设</option>
            {savedPresets.map((preset) => (
              <option key={preset.name} value={preset.name}>
                {preset.name}
              </option>
            ))}
          </UiSelectField>
          {presetName && savedPresets.some((preset) => preset.name === presetName) ? (
            <Button variant="danger" onClick={() => deletePreset(presetName)}>
              删除预设
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => {
            void copyCurrentViewLink();
          }}>
            复制视图链接
          </Button>
        </div>
        {evalRunBusy || reportDecisionBusy ? (
          <InlineNotice className="mt-4" tone="info">
            {activeDatasetRunId
              ? `正在执行数据集 ${activeDatasetRunId}...`
              : activePairwiseRunId
                ? `正在执行 ${activePairwiseRunId} 的成对评测...`
                : activePresetRunId
                  ? `正在执行预设 ${activePresetRunId}...`
                  : activeReportDecisionId
                  ? `正在更新报告 ${activeReportDecisionId} 的决策...`
                  : "评测操作执行中..."}
          </InlineNotice>
        ) : null}
        {successNotice ? <InlineNotice className="mt-4" tone="success">{successNotice}</InlineNotice> : null}
        {runDatasetMutation.isError && runDatasetMutation.error instanceof Error ? <ErrorBlock className="mt-4" message={runDatasetMutation.error.message} /> : null}
        {runPairwiseMutation.isError && runPairwiseMutation.error instanceof Error ? <ErrorBlock className="mt-4" message={runPairwiseMutation.error.message} /> : null}
        {runExperimentPresetMutation.isError && runExperimentPresetMutation.error instanceof Error ? <ErrorBlock className="mt-4" message={runExperimentPresetMutation.error.message} /> : null}
        {updateReportDecisionMutation.isError && updateReportDecisionMutation.error instanceof Error ? <ErrorBlock className="mt-4" message={updateReportDecisionMutation.error.message} /> : null}
      </Card>

      <Card id="eval-presets" className="bg-[color:var(--surface-console)]">
        <SectionHeading>已保存视图</SectionHeading>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {savedPresets.map((preset) => (
            <div
              key={preset.name}
              className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-left text-sm text-[color:var(--text-secondary)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-[color:var(--text-primary)]">
                  {preset.name}
                  {preset.pinned ? " · 已置顶" : ""}
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone={preset.compactView ? "healthy" : "muted"}>
                    {preset.compactView ? "紧凑" : "完整"}
                  </StatusPill>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => togglePresetPinned(preset.name)}
                  >
                    {preset.pinned ? "取消置顶" : "置顶"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => movePreset(preset.name, "up")}
                  >
                    上移
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => movePreset(preset.name, "down")}
                  >
                    下移
                  </Button>
                </div>
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                {preset.shareViewName || "未命名视图"}
              </div>
              <div className="mt-3 grid gap-2 text-xs">
                <div>数据集：{preset.selectedDatasetId ?? "全部"}</div>
                <div>对比：{formatCompareCaseFilter(preset.compareCaseFilter)} / {formatCompareOutcomeFilter(preset.compareOutcomeFilter)}</div>
                <div>
                  链路：{formatTraceScope(preset.traceScopeFilter)} / {preset.traceSource ? formatTraceSource(preset.traceSource) : "全部来源"}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setPresetName(preset.name);
                  applyPreset(preset.name);
                }}
              >
                应用视图
              </Button>
            </div>
          ))}
          {savedPresets.length === 0 ? (
            <PanelEmpty message="当前还没有保存的视图。可以先把当前筛选状态保存为预设。" />
          ) : null}
        </div>
      </Card>

      {!compactView ? (
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card id="eval-runs" className="bg-[color:var(--surface-console)]">
          <SectionHeading>数据集运行</SectionHeading>
          <InlineNotice className="mt-4" tone="muted">
            这里是运行入口。先填实验标签和候选覆盖配置，再按数据集执行单次运行或成对评测。
          </InlineNotice>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <TextField
              value={experimentLabel}
              onChange={(event) => setExperimentLabel(event.target.value)}
              placeholder="实验标签"
              className="rounded-2xl"
            />
            <TextField
              value={pairwiseProviderOverride}
              onChange={(event) => setPairwiseProviderOverride(event.target.value)}
              placeholder="候选模型覆盖"
              className="rounded-2xl"
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <TextField
              value={pairwiseJudgeModelOverride}
              onChange={(event) => setPairwiseJudgeModelOverride(event.target.value)}
              placeholder="裁判模型覆盖"
              className="rounded-2xl"
            />
            <UiSelectField
              value={pairwisePromptVariant}
              onChange={(event) => setPairwisePromptVariant(event.target.value)}
              className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-primary)]"
            >
              {promptVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </UiSelectField>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <UiSelectField
              value={pairwiseMemoryPolicyVariant}
              onChange={(event) => setPairwiseMemoryPolicyVariant(event.target.value)}
              className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-primary)]"
            >
              <option value="default">默认记忆策略</option>
              {memoryStrategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.label}
                </option>
              ))}
            </UiSelectField>
          </div>
          <div className="mt-4 space-y-3">
            {(datasetsQuery.data ?? []).map((dataset) => {
              const pending = runDatasetMutation.isPending && runDatasetMutation.variables === dataset.id;
              const pairwisePending = runPairwiseMutation.isPending && runPairwiseMutation.variables === dataset.id;

              return (
                <ListItemCard
                  key={dataset.id}
                  onClick={() => selectDataset(dataset.id)}
                  className="cursor-pointer"
                  title={dataset.title}
                  subtitle={`${dataset.id} · ${formatEvalTargetType(dataset.targetType)} · ${dataset.version}`}
                  actions={
                    <>
                      <Button
                      variant="secondary"
                      size="sm"
                      className="text-xs uppercase tracking-[0.16em]"
                      onClick={(event) => {
                        event.stopPropagation();
                        runDatasetMutation.mutate(dataset.id);
                      }}
                      disabled={evalRunBusy}
                    >
                      {pending ? "执行中" : "运行数据集"}
                    </Button>
                      <Button
                      variant="primary"
                      size="sm"
                      className="text-xs uppercase tracking-[0.16em]"
                      onClick={(event) => {
                        event.stopPropagation();
                        runPairwiseMutation.mutate(dataset.id);
                      }}
                      disabled={evalRunBusy}
                    >
                      {pairwisePending ? "对比中..." : "运行成对评测"}
                    </Button>
                    </>
                  }
                  body={<div className="leading-6">{dataset.description}</div>}
                  footer={
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {dataset.caseIds.length} 个用例 · 评分规则：{dataset.rubricIds.join(", ")}
                    </div>
                  }
                />
              );
            })}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>实验预设</SectionHeading>
          <InlineNotice className="mt-4" tone="muted">
            预设适合把基线与候选的组合固化下来，重复执行同一实验。
          </InlineNotice>
          <div className="mt-4 space-y-3">
            {experimentPresets.map((preset) => {
              const pending =
                runExperimentPresetMutation.isPending && runExperimentPresetMutation.variables === preset.id;
              return (
                <ListItemCard
                  key={preset.id}
                  title={preset.title}
                  subtitle={`${preset.id} · ${formatEvalMode(preset.mode)} · ${preset.datasetId}`}
                  actions={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => runExperimentPresetMutation.mutate(preset.id)}
                      disabled={evalRunBusy}
                    >
                      {pending ? "执行中" : "运行预设"}
                    </Button>
                  }
                  body={<div className="leading-6">{preset.description}</div>}
                  footer={<div className="grid gap-2 text-xs text-[color:var(--text-muted)]">
                    <div>标签：{preset.experimentLabel ?? preset.id}</div>
                    <div>
                      基线：{preset.baseline?.providerOverride ?? "默认"} / {preset.baseline?.judgeModelOverride ?? "默认"} / {formatPromptVariantValue(preset.baseline?.promptVariant ?? null, promptVariantLabelMap)} / {formatMemoryStrategyValue(preset.baseline?.memoryPolicyVariant ?? null, memoryStrategyLabelMap)}
                    </div>
                    <div>
                      候选：{preset.candidate?.providerOverride ?? "默认"} / {preset.candidate?.judgeModelOverride ?? "默认"} / {formatPromptVariantValue(preset.candidate?.promptVariant ?? null, promptVariantLabelMap)} / {formatMemoryStrategyValue(preset.candidate?.memoryPolicyVariant ?? null, memoryStrategyLabelMap)}
                    </div>
                  </div>}
                />
              );
            })}
            {experimentPresets.length === 0 ? (
              <PanelEmpty message="当前还没有实验预设。" />
            ) : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>最近运行</SectionHeading>
          <div className="mt-4 flex flex-wrap gap-3">
            <UiSelectField
              value={selectedDatasetId ?? ""}
              onChange={(event) => setSelectedDatasetId(event.target.value || null)}
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              <option value="">全部数据集</option>
              {datasetList.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.title}
                </option>
              ))}
            </UiSelectField>
            <TextField
              value={historyProviderFilter}
              onChange={(event) => setHistoryProviderFilter(event.target.value)}
              placeholder="推理模型"
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
            />
            <TextField
              value={historyJudgeFilter}
              onChange={(event) => setHistoryJudgeFilter(event.target.value)}
              placeholder="裁判模型"
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
            />
            <UiSelectField
              value={historyPromptVariantFilter}
              onChange={(event) => setHistoryPromptVariantFilter(event.target.value)}
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              <option value="">全部提示词变体</option>
              {promptVariants.map((variant) => (
                <option key={`history-prompt-${variant.id}`} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </UiSelectField>
            <UiSelectField
              value={historyMemoryPolicyFilter}
              onChange={(event) => setHistoryMemoryPolicyFilter(event.target.value)}
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              <option value="">全部记忆策略</option>
              {memoryStrategies.map((strategy) => (
                <option key={`history-${strategy.id}`} value={strategy.id}>
                  {strategy.label}
                </option>
              ))}
            </UiSelectField>
          </div>
          <div className="mt-4 space-y-3">
            {recentRuns.length > 0 ? (
              recentRuns.map((run) => (
                <ListItemCard
                  key={run.id}
                  onClick={() => selectRun(run.id)}
                  className="cursor-pointer text-left"
                  title={run.datasetId}
                  subtitle={run.id}
                  actions={<StatusPill tone={run.status === "failed" ? "warning" : "healthy"}>{formatEvalStatus(run.status)}</StatusPill>}
                  footer={<div className="grid gap-2 text-sm">
                    <div>模式：{formatEvalMode(run.mode)}</div>
                    <div>实验：{run.experimentLabel ?? "无"}</div>
                    <div>推理模型：{run.effectiveProviderModel ?? "默认"}</div>
                    <div>裁判模型：{run.effectiveJudgeModel ?? "默认"}</div>
                    <div>提示词：{formatPromptVariantValue(run.promptVariant ?? null, promptVariantLabelMap)}</div>
                    <div>记忆：{formatMemoryStrategyValue(run.memoryPolicyVariant ?? null, memoryStrategyLabelMap)}</div>
                    <div>开始时间：{run.startedAt}</div>
                    <div>用例数：{run.summary.caseCount}</div>
                    <div>通过：{run.summary.passedCases}</div>
                    <div>失败：{run.summary.failedCases}</div>
                    <div>脚手架：{run.summary.scaffoldedCases}</div>
                  </div>}
                />
              ))
            ) : (
              <PanelEmpty message="当前还没有评测运行记录。先运行一个数据集开始。" />
            )}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>对比历史</SectionHeading>
          <div className="mt-4 space-y-3">
            {(comparisonsQuery.data ?? []).slice(0, 5).map((comparison) => (
              <ListItemCard
                key={comparison.id}
                onClick={() => {
                  setBaselineRunId(comparison.baselineRunId);
                  setCandidateRunId(comparison.candidateRunId);
                }}
                className="w-full cursor-pointer text-left"
                title={comparison.experimentLabel ?? comparison.id}
                subtitle={comparison.createdAt}
                actions={
                  <StatusPill tone={comparison.summary.wins > comparison.summary.losses ? "healthy" : "muted"}>
                    {comparison.summary.wins}-{comparison.summary.losses}-{comparison.summary.ties}
                  </StatusPill>
                }
                footer={<div className="grid gap-2">
                  <div>数据集：{comparison.candidateDatasetId}</div>
                  <div>基线 模型/裁判：{comparison.baselineProviderModel ?? "默认"} / {comparison.baselineJudgeModel ?? "默认"}</div>
                  <div>基线 提示词/记忆：{formatPromptVariantValue(comparison.baselinePromptVariant ?? null, promptVariantLabelMap)} / {formatMemoryStrategyValue(comparison.baselineMemoryPolicyVariant ?? null, memoryStrategyLabelMap)}</div>
                  <div>候选 模型/裁判：{comparison.candidateProviderModel ?? "默认"} / {comparison.candidateJudgeModel ?? "默认"}</div>
                  <div>候选 提示词/记忆：{formatPromptVariantValue(comparison.candidatePromptVariant ?? null, promptVariantLabelMap)} / {formatMemoryStrategyValue(comparison.candidateMemoryPolicyVariant ?? null, memoryStrategyLabelMap)}</div>
                </div>}
              />
            ))}
            {(comparisonsQuery.data ?? []).length === 0 ? (
              <PanelEmpty message="当前还没有保存的对比记录。先运行成对评测来积累实验历史。" />
            ) : null}
          </div>
        </Card>

        <Card id="eval-reports" className="bg-[color:var(--surface-console)]">
          <SectionHeading>实验报告</SectionHeading>
          <div className="mt-4 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
            {experimentReports.slice(0, 8).map((report) => (
              <ListItemCard
                key={report.id}
                onClick={() => setSelectedReportId(report.id)}
                className={`w-full cursor-pointer text-left transition hover:border-[color:var(--border-faint)] ${
                  selectedReport?.id === report.id ? "border-[color:var(--border-subtle)]" : "border-[color:var(--border-faint)]"
                }`}
                title={report.presetTitle}
                subtitle={`${report.createdAt} · ${report.presetId}`}
                actions={
                  <StatusPill tone={report.summary.wins > report.summary.losses ? "healthy" : "muted"}>
                    {formatEvalMode(report.mode)}
                  </StatusPill>
                }
                meta={<div className="grid gap-2">
                  <div>数据集：{report.datasetId}</div>
                  <div>汇总：{report.summary.wins} / {report.summary.losses} / {report.summary.ties}</div>
                  <div>标签：{report.experimentLabel ?? "无"}</div>
                </div>}
                body={
                  <>
                    {report.recommendations.length > 0 ? (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-emerald-100">建议</div>
                    <div className="mt-2 space-y-2">
                      {report.recommendations.slice(0, 3).map((item) => (
                        <div key={`${report.id}-recommend-${item}`} className="text-sm text-emerald-50">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                    {report.regressions.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-rose-100">回退点</div>
                    <div className="mt-2 space-y-2">
                      {report.regressions.slice(0, 3).map((item) => (
                        <div key={`${report.id}-regression-${item}`} className="text-sm text-rose-50">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                  </>
                }
                footer={
                  <>
                {report.keep.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {report.keep.slice(0, 3).map((item) => (
                      <TagBadge key={`${report.id}-keep-${item}`} tone="info">{item}</TagBadge>
                    ))}
                  </div>
                ) : null}
                {report.rollback.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.rollback.slice(0, 2).map((item) => (
                      <TagBadge key={`${report.id}-rollback-${item}`} tone="warning">{item}</TagBadge>
                    ))}
                  </div>
                ) : null}
                {report.topCaseDeltas.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">重点用例差异</div>
                    <div className="mt-2 space-y-2">
                      {report.topCaseDeltas.slice(0, 3).map((item) => (
                        <div key={`${report.id}-${item.caseId}`} className="flex items-center justify-between gap-3">
                          <div className="text-[color:var(--text-primary)]">{item.caseId}</div>
                          <div className="text-[color:var(--text-secondary)]">
                            {formatCompareOutcome(item.outcome)} · {item.scoreDelta >= 0 ? "+" : ""}{item.scoreDelta.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {report.failureTagDeltas.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.failureTagDeltas.slice(0, 4).map((item) => (
                      <TagBadge key={`${report.id}-${item.key}`} tone="warning">
                        {item.label} · {item.delta >= 0 ? "+" : ""}{item.delta}
                      </TagBadge>
                    ))}
                  </div>
                ) : null}
                  </>
                }
              />
            ))}
            {experimentReports.length === 0 ? (
              <PanelEmpty message="当前还没有实验报告。先运行一次实验预设。" />
            ) : null}
            </div>
            <div>
              {selectedReport ? (
                <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-[color:var(--text-primary)]">{selectedReport.presetTitle}</div>
                    <StatusPill tone={selectedReport.summary.wins > selectedReport.summary.losses ? "healthy" : "muted"}>
                      {formatEvalMode(selectedReport.mode)}
                    </StatusPill>
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    {selectedReport.createdAt} · {selectedReport.id}
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    <div>数据集：{selectedReport.datasetId}</div>
                    <div>标签：{selectedReport.experimentLabel ?? "无"}</div>
                    <div>单次运行：{selectedReport.singleRunId ?? "无"}</div>
                    <div>对比记录：{selectedReport.comparisonId ?? "无"}</div>
                    <div>基线运行：{selectedReport.baselineRunId ?? "无"}</div>
                    <div>候选运行：{selectedReport.candidateRunId ?? "无"}</div>
                    <div>决策：{formatDecisionStatus(selectedReport.decisionStatus)}</div>
                    <div>动作：{selectedReport.appliedAction ?? "无"}</div>
                    <div>决策时间：{selectedReport.decidedAt ?? "无"}</div>
                    <div>决策人：{selectedReport.decidedBy ?? "无"}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        updateReportDecisionMutation.mutate({
                          id: selectedReport.id,
                          decisionStatus: "keep-testing",
                          appliedAction: "continue-evaluating",
                        })
                      }
                      disabled={reportDecisionBusy}
                    >
                      {reportDecisionBusy && activeReportDecisionId === selectedReport.id ? "更新中..." : "继续测试"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="border-emerald-300/30 bg-emerald-500/10 text-emerald-100 hover:border-emerald-200/40"
                      onClick={() =>
                        updateReportDecisionMutation.mutate({
                          id: selectedReport.id,
                          decisionStatus: "promote",
                          appliedAction: "promote-candidate",
                        })
                      }
                      disabled={reportDecisionBusy}
                    >
                      采用候选
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="border-amber-300/30 bg-amber-500/10 text-amber-100 hover:border-amber-200/40"
                      onClick={() =>
                        updateReportDecisionMutation.mutate({
                          id: selectedReport.id,
                          decisionStatus: "rollback",
                          appliedAction: "rollback-to-baseline",
                        })
                      }
                      disabled={reportDecisionBusy}
                    >
                      回滚
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="border-rose-300/30 bg-rose-500/10 text-rose-100 hover:border-rose-200/40"
                      onClick={() =>
                        updateReportDecisionMutation.mutate({
                          id: selectedReport.id,
                          decisionStatus: "archive",
                          appliedAction: "archive-report",
                        })
                      }
                      disabled={reportDecisionBusy}
                    >
                      归档
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {selectedReport.singleRunId ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedRunId(selectedReport.singleRunId ?? null)}
                      >
                        打开单次运行
                      </Button>
                    ) : null}
                    {selectedReport.baselineRunId && selectedReport.candidateRunId ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="border-sky-400/30 bg-sky-500/10 text-sky-100 hover:border-sky-300/40"
                        onClick={() => {
                          setBaselineRunId(selectedReport.baselineRunId ?? "");
                          setCandidateRunId(selectedReport.candidateRunId ?? "");
                        }}
                      >
                        加载对比
                      </Button>
                    ) : null}
                    {selectedReport.candidateRunId ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedRunId(selectedReport.candidateRunId ?? null)}
                      >
                        打开候选运行
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <MetricCard label="用例数" value={selectedReport.summary.totalCases} />
                    <MetricCard label="胜出" value={selectedReport.summary.wins} />
                    <MetricCard label="落后" value={selectedReport.summary.losses} />
                    <MetricCard label="持平" value={selectedReport.summary.ties} />
                  </div>
                  {selectedReport.notes.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">备注</div>
                      <div className="mt-2 space-y-2">
                        {selectedReport.notes.map((note) => (
                          <div key={`${selectedReport.id}-${note}`} className="text-[color:var(--text-primary)]">
                            {note}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedReport.topCaseDeltas.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">重点用例差异</div>
                      <div className="mt-2 space-y-2">
                        {selectedReport.topCaseDeltas.map((item) => (
                          <div key={`${selectedReport.id}-detail-${item.caseId}`} className="flex items-center justify-between gap-3">
                            <div className="text-[color:var(--text-primary)]">{item.caseId}</div>
                            <div className="text-[color:var(--text-secondary)]">
                              {formatCompareOutcome(item.outcome)} · {item.scoreDelta >= 0 ? "+" : ""}{item.scoreDelta.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedReport.failureTagDeltas.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">失败标签差异</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedReport.failureTagDeltas.map((item) => (
                          <TagBadge key={`${selectedReport.id}-failure-${item.key}`} tone="warning">
                            {item.label} · {item.baselineCount}{"->"}{item.candidateCount} ({item.delta >= 0 ? "+" : ""}{item.delta})
                          </TagBadge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <PanelEmpty message="选择一份实验报告后，可查看它的汇总、备注和差异。" />
              )}
            </div>
          </div>
        </Card>
      </div>
      ) : null}

      {!compactView ? (
      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>数据集详情</SectionHeading>
        <div className="mt-4">
          {datasetDetailQuery.data ? (
            <div className="space-y-4">
              <ListItemCard
                title={datasetDetailQuery.data.manifest.title}
                subtitle={`${datasetDetailQuery.data.manifest.id} · ${formatEvalTargetType(datasetDetailQuery.data.manifest.targetType)} · ${datasetDetailQuery.data.manifest.version}`}
                actions={
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    归属：{datasetDetailQuery.data.manifest.owner}
                  </div>
                }
                body={<div className="leading-6">{datasetDetailQuery.data.manifest.description}</div>}
              />
              <div className="grid gap-3 xl:grid-cols-2">
                {datasetDetailQuery.data.cases.map((caseRecord) => (
                  <ListItemCard
                    key={caseRecord.id}
                    title={caseRecord.title}
                    subtitle={caseRecord.id}
                    actions={
                      <StatusPill tone={caseRecord.priority === "p0" ? "warning" : "muted"}>
                        {caseRecord.priority}
                      </StatusPill>
                    }
                    body={
                      <>
                        <div className="leading-6">{caseRecord.description}</div>
                        <div className="mt-4 grid gap-3">
                      <SnapshotPanel title="用例输入" value={caseRecord.input} />
                        </div>
                      </>
                    }
                    footer={
                      <>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">硬规则</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {caseRecord.expectations.hardRules.map((rule) => (
                          <TagBadge key={`${caseRecord.id}-rule-${rule}`}>{rule}</TagBadge>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">禁止结果</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {caseRecord.expectations.forbiddenOutcomes.map((outcome) => (
                          <TagBadge key={`${caseRecord.id}-outcome-${outcome}`} tone="danger">{outcome}</TagBadge>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">裁判规则</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {caseRecord.expectations.judgeRubrics.map((rubric) => (
                          <TagBadge key={`${caseRecord.id}-rubric-${rubric}`} tone="warning">{rubric}</TagBadge>
                        ))}
                      </div>
                    </div>
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <PanelEmpty message="选择一个数据集卡片后，可查看用例输入、硬规则、禁止结果和裁判规则。" />
          )}
        </div>
      </Card>
      ) : null}

      {!compactView ? (
      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>运行详情</SectionHeading>
        <div className="mt-4">
          {runDetailQuery.data ? (
            <div className="space-y-4">
              <ListItemCard
                title={runDetailQuery.data.datasetId}
                subtitle={runDetailQuery.data.id}
                actions={
                  <StatusPill tone={runDetailQuery.data.status === "failed" ? "warning" : "healthy"}>
                    {formatEvalStatus(runDetailQuery.data.status)}
                  </StatusPill>
                }
                footer={
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="模式" value={formatEvalMode(runDetailQuery.data.mode)} />
                    <MetricCard label="开始时间" value={runDetailQuery.data.startedAt} />
                    <MetricCard label="运行器" value={runDetailQuery.data.runnerVersion} />
                    <MetricCard label="裁判器" value={runDetailQuery.data.judgeVersion} />
                  </div>
                }
              />

              <div className="grid gap-3 xl:grid-cols-2">
                {runDetailQuery.data.caseResults.map((caseResult) => (
                  <div
                    key={caseResult.caseId}
                    onClick={() => focusCase(caseResult.caseId, caseResult.traceIds)}
                    className={`cursor-pointer rounded-2xl border bg-[color:var(--surface-card)] px-4 py-4 text-left text-sm text-[color:var(--text-secondary)] ${
                      focusedCaseId === caseResult.caseId ? "border-[color:var(--border-subtle)]" : "border-[color:var(--border-faint)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-[color:var(--text-primary)]">{caseResult.caseId}</div>
                      <StatusPill tone={caseResult.status === "failed" ? "warning" : caseResult.status === "scaffolded" ? "warning" : "healthy"}>
                        {formatEvalStatus(caseResult.status)}
                      </StatusPill>
                    </div>
                    <div className="mt-3 whitespace-pre-wrap break-words leading-6 text-[color:var(--text-primary)]">
                      {caseResult.output || "空"}
                    </div>
                    {caseResult.scores.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">评分</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {caseResult.scores.map((score) => (
                            <TagBadge key={`${caseResult.caseId}-${score.key}`} tone="success">
                              {score.label} · {score.value.toFixed(2)}
                            </TagBadge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {caseResult.judgeRationale ? (
                      <div className="mt-3 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                        {caseResult.judgeRationale}
                      </div>
                    ) : null}
                    {caseResult.ruleViolations.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">规则违背</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {caseResult.ruleViolations.map((violation) => (
                            <TagBadge key={violation} tone="warning">{violation}</TagBadge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {caseResult.failureTags.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">失败标签</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {caseResult.failureTags.map((tag) => (
                            <TagBadge key={`${caseResult.caseId}-${tag.key}`} tone="danger">
                              {tag.label}
                              {typeof tag.count === "number" ? ` · ${tag.count}` : ""}
                            </TagBadge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {caseResult.traceIds.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">链路关联</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {caseResult.traceIds.map((traceId) => (
                            <button
                              type="button"
                              key={traceId}
                              onClick={(event) => {
                                event.stopPropagation();
                                focusCase(caseResult.caseId, caseResult.traceIds);
                                setSelectedTraceId(traceId);
                              }}
                              className="rounded-full border border-[color:var(--border-faint)] px-3 py-1 text-xs text-[color:var(--text-primary)] transition hover:border-[color:var(--border-faint)]"
                            >
                              {traceId}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {selectedDatasetCaseMap.get(caseResult.caseId) ? (
                      <div className="mt-4 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">用例期望</div>
                        <div className="mt-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">输入</div>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[color:var(--text-primary)]">
                            {JSON.stringify(selectedDatasetCaseMap.get(caseResult.caseId)?.input ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div className="mt-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">硬规则</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(selectedDatasetCaseMap.get(caseResult.caseId)?.expectations.hardRules ?? []).map((rule) => (
                              <TagBadge key={`${caseResult.caseId}-expected-rule-${rule}`}>{rule}</TagBadge>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">禁止结果</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(selectedDatasetCaseMap.get(caseResult.caseId)?.expectations.forbiddenOutcomes ?? []).map((outcome) => (
                              <TagBadge key={`${caseResult.caseId}-expected-outcome-${outcome}`} tone="danger">{outcome}</TagBadge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <PanelEmpty message="选择最近一次运行后，可查看用例级输出、规则违背和链路关联。" />
          )}
        </div>
      </Card>
      ) : null}

      <Card id="eval-compare" className="bg-[color:var(--surface-console)]">
        <SectionHeading>运行对比</SectionHeading>
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCompareFiltersExpanded((value) => !value)}
            >
              {compareFiltersExpanded ? "隐藏对比筛选" : "显示对比筛选"}
            </Button>
            <div className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2 text-sm text-[color:var(--text-secondary)]">
              已启用 {activeCompareFilterCount} 个筛选
            </div>
            {compareDatasetId ? (
              <div className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2 text-sm text-[color:var(--text-secondary)]">
                数据集：{compareDatasetId}
              </div>
            ) : null}
          </div>
          <InlineNotice className="mb-4" tone="muted">
            先锁定基线与候选，再按用例结果、失败标签和搜索词收窄比较范围。
          </InlineNotice>
          {compareFiltersExpanded ? (
          <div className="mb-4 flex flex-wrap gap-3">
            <TextField
              value={compareCaseSearch}
              onChange={(event) => setCompareCaseSearch(event.target.value)}
              placeholder="搜索用例编号"
              className="w-auto min-w-44 rounded-full py-2"
            />
            <UiSelectField
              value={baselineRunId}
              onChange={(event) => setBaselineRunId(event.target.value)}
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              <option value="">选择基线运行</option>
              {comparableRuns.map((run) => (
                <option key={`baseline-${run.id}`} value={run.id}>
                  {run.datasetId} · {run.id}
                </option>
              ))}
            </UiSelectField>
            <UiSelectField
              value={candidateRunId}
              onChange={(event) => setCandidateRunId(event.target.value)}
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              <option value="">选择候选运行</option>
              {comparableRuns.map((run) => (
                <option key={`candidate-${run.id}`} value={run.id}>
                  {run.datasetId} · {run.id}
                </option>
              ))}
            </UiSelectField>
            <UiSelectField
              value={compareCaseFilter}
              onChange={(event) => setCompareCaseFilter(event.target.value as "all" | "different" | "failed")}
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              <option value="all">全部用例</option>
              <option value="different">仅差异用例</option>
              <option value="failed">仅失败用例</option>
            </UiSelectField>
            <UiSelectField
              value={compareOutcomeFilter}
              onChange={(event) => setCompareOutcomeFilter(event.target.value as "all" | "win" | "lose" | "tie")}
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              <option value="all">全部结果</option>
              <option value="win">候选胜出</option>
              <option value="lose">候选落后</option>
              <option value="tie">持平</option>
            </UiSelectField>
            <UiSelectField
              value={compareFailureTagFilter}
              onChange={(event) => setCompareFailureTagFilter(event.target.value)}
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              <option value="">全部失败标签</option>
              {availableCompareFailureTags.map((tagKey) => (
                <option key={tagKey} value={tagKey}>
                  {tagKey}
                </option>
              ))}
            </UiSelectField>
          </div>
          ) : null}
          {compareQuery.data ? (
            <div className="space-y-4">
              <ListItemCard
                title={`${compareQuery.data.candidateDatasetId} 对比 ${compareQuery.data.baselineDatasetId}`}
                footer={
                  <div className="grid gap-3 md:grid-cols-4">
                    <MetricCard label="用例数" value={displayedComparisons.length} />
                    <MetricCard label="胜出" value={filteredComparisonSummary.wins} />
                    <MetricCard label="落后" value={filteredComparisonSummary.losses} />
                    <MetricCard label="持平" value={filteredComparisonSummary.ties} />
                  </div>
                }
              />
              <div className="grid gap-3 xl:grid-cols-2">
                {displayedComparisons.map((comparison) => (
                  <div key={comparison.caseId} className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-[color:var(--text-primary)]">{comparison.caseId}</div>
                      <StatusPill tone={comparison.outcome === "lose" ? "warning" : comparison.outcome === "win" ? "healthy" : "muted"}>
                        {formatCompareOutcome(comparison.outcome)}
                      </StatusPill>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <div>基线状态：{comparison.baselineStatus ? formatEvalStatus(comparison.baselineStatus) : "无"}</div>
                      <div>候选状态：{comparison.candidateStatus ? formatEvalStatus(comparison.candidateStatus) : "无"}</div>
                      <div>基线得分：{comparison.baselineScoreTotal.toFixed(2)}</div>
                      <div>候选得分：{comparison.candidateScoreTotal.toFixed(2)}</div>
                      <div>分差：{comparison.scoreDelta >= 0 ? "+" : ""}{comparison.scoreDelta.toFixed(2)}</div>
                    </div>
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      <div className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">基线输出</div>
                        <div className="mt-2 whitespace-pre-wrap break-words leading-6 text-[color:var(--text-primary)]">
                          {comparison.baselineOutput || "空"}
                        </div>
                        {comparison.baselineRuleViolations.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {comparison.baselineRuleViolations.map((violation) => (
                              <TagBadge key={`baseline-${comparison.caseId}-${violation}`} tone="warning">{violation}</TagBadge>
                            ))}
                          </div>
                        ) : null}
                        {comparison.baselineScores.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">基线评分</div>
                            <div className="mt-2 space-y-2">
                              {comparison.baselineScores.map((score) => (
                                <div key={`baseline-score-${comparison.caseId}-${score.key}`} className="flex items-center justify-between gap-3">
                                  <div className="text-[color:var(--text-primary)]">{score.label}</div>
                                  <div className="text-[color:var(--text-secondary)]">{score.value.toFixed(2)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {comparison.baselineFailureTags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {comparison.baselineFailureTags.map((tag) => (
                              <TagBadge key={`baseline-tag-${comparison.caseId}-${tag.key}`} tone="danger">
                                {tag.label}
                                {typeof tag.count === "number" ? ` · ${tag.count}` : ""}
                              </TagBadge>
                            ))}
                          </div>
                        ) : null}
                        {comparison.baselineTraceIds.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {comparison.baselineTraceIds.map((traceId) => (
                              <Button
                                variant="secondary"
                                size="sm"
                                key={`baseline-trace-${traceId}`}
                                onClick={() => {
                                  setSelectedTraceId(traceId);
                                  focusCase(comparison.caseId, comparison.baselineTraceIds);
                                }}
                              >
                                基线链路
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">候选输出</div>
                        <div className="mt-2 whitespace-pre-wrap break-words leading-6 text-[color:var(--text-primary)]">
                          {comparison.candidateOutput || "空"}
                        </div>
                        {comparison.candidateRuleViolations.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {comparison.candidateRuleViolations.map((violation) => (
                              <TagBadge key={`candidate-${comparison.caseId}-${violation}`} tone="warning">{violation}</TagBadge>
                            ))}
                          </div>
                        ) : null}
                        {comparison.candidateScores.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">候选评分</div>
                            <div className="mt-2 space-y-2">
                              {comparison.candidateScores.map((score) => (
                                <div key={`candidate-score-${comparison.caseId}-${score.key}`} className="flex items-center justify-between gap-3">
                                  <div className="text-[color:var(--text-primary)]">{score.label}</div>
                                  <div className="text-[color:var(--text-secondary)]">{score.value.toFixed(2)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {comparison.candidateFailureTags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {comparison.candidateFailureTags.map((tag) => (
                              <TagBadge key={`candidate-tag-${comparison.caseId}-${tag.key}`} tone="danger">
                                {tag.label}
                                {typeof tag.count === "number" ? ` · ${tag.count}` : ""}
                              </TagBadge>
                            ))}
                          </div>
                        ) : null}
                        {comparison.candidateTraceIds.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {comparison.candidateTraceIds.map((traceId) => (
                              <Button
                                variant="secondary"
                                size="sm"
                                key={`candidate-trace-${traceId}`}
                                onClick={() => {
                                  setSelectedTraceId(traceId);
                                  focusCase(comparison.caseId, comparison.candidateTraceIds);
                                }}
                              >
                                候选链路
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <PanelEmpty message="至少运行两次评测后，才能解锁成对比较。" />
          )}
        </div>
      </Card>

      <Card id="eval-traces" className="bg-[color:var(--surface-console)]">
        <SectionHeading>生成链路</SectionHeading>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTraceFiltersExpanded((value) => !value)}
          >
            {traceFiltersExpanded ? "隐藏链路筛选" : "显示链路筛选"}
          </Button>
          <div className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2 text-sm text-[color:var(--text-secondary)]">
            已启用 {activeTraceFilterCount} 个筛选
          </div>
        </div>
        <InlineNotice className="mt-4" tone="muted">
          生成链路用于下钻提示词链、回退路径和失败标签。可以按运行、对比、用例和来源逐层收窄。
        </InlineNotice>
        {traceFiltersExpanded ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <UiSelectField
            value={traceScopeFilter}
            onChange={(event) => setTraceScopeFilter(event.target.value as "all" | "run" | "compare")}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          >
            <option value="all">全部链路</option>
            <option value="run">当前运行链路</option>
            <option value="compare">当前对比链路</option>
          </UiSelectField>
          <UiSelectField
            value={traceCaseFilter}
            onChange={(event) => setTraceCaseFilter(event.target.value)}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          >
            <option value="">全部用例</option>
            {availableTraceCaseIds.map((caseId) => (
              <option key={caseId} value={caseId}>
                {caseId}
              </option>
            ))}
          </UiSelectField>
          <UiSelectField
            value={traceFailureTagFilter}
            onChange={(event) => setTraceFailureTagFilter(event.target.value)}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          >
            <option value="">全部失败标签</option>
            {availableTraceFailureTags.map((tagKey) => (
              <option key={tagKey} value={tagKey}>
                {tagKey}
              </option>
            ))}
          </UiSelectField>
          <UiSelectField
            value={traceSource}
            onChange={(event) => setTraceSource(event.target.value)}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          >
            <option value="">全部来源</option>
            <option value="chat.reply">聊天直回</option>
            <option value="social.greeting">社交打招呼</option>
            <option value="group.intent">群聊意图判断</option>
            <option value="group.coordinator">群聊协调回复</option>
            <option value="memory.summary">记忆摘要</option>
          </UiSelectField>
          <UiSelectField
            value={traceStatus}
            onChange={(event) => setTraceStatus(event.target.value)}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          >
            <option value="">全部状态</option>
            <option value="success">成功</option>
            <option value="fallback">回退</option>
            <option value="error">错误</option>
          </UiSelectField>
          <UiSelectField
            value={traceCharacterId}
            onChange={(event) => setTraceCharacterId(event.target.value)}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          >
            <option value="">全部角色</option>
            {availableCharacterIds.map((characterId) => (
              <option key={characterId} value={characterId ?? ""}>
                {characterId}
              </option>
            ))}
          </UiSelectField>
          {focusedCaseId ? (
            <Button
              variant="secondary"
              size="sm"
              className="border-amber-400/30 bg-amber-500/10 text-amber-100"
              onClick={clearTraceFocus}
            >
              清除用例聚焦：{focusedCaseId}
            </Button>
          ) : null}
        </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-[color:var(--text-secondary)]">
          <div className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2">
            范围总数：{scopedTraces.length}
          </div>
          <div className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2">
            当前展示：{displayedTraces.length}
          </div>
          {focusedTraceIds.length > 0 ? (
            <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-amber-100">
              聚焦命中：{visibleTraces.length}
            </div>
          ) : null}
        </div>
        {traceDetailQuery.data ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill
                tone={
                  traceDetailQuery.data.status === "error"
                    ? "warning"
                    : traceDetailQuery.data.status === "fallback"
                      ? "warning"
                      : "healthy"
                }
              >
                已选链路：{traceDetailQuery.data.id}
              </StatusPill>
              <StatusPill>{formatTraceSource(traceDetailQuery.data.source)}</StatusPill>
              {focusedCaseId ? <StatusPill tone="warning">聚焦用例：{focusedCaseId}</StatusPill> : null}
              {selectedTraceCaseIds.length > 0 ? <StatusPill>关联用例：{selectedTraceCaseIds.length}</StatusPill> : null}
              {selectedTraceFailureTags.length > 0 ? (
                <StatusPill tone="warning">失败标签：{selectedTraceFailureTags.length}</StatusPill>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="mt-4 grid gap-6 xl:grid-cols-[0.8fr_1.05fr_0.95fr]">
          <div className="space-y-3">
            {displayedTraces.length > 0 ? (
              displayedTraces.map((trace) => (
                <button
                  type="button"
                  key={trace.id}
                  onClick={() => setSelectedTraceId(trace.id)}
                  className={`w-full rounded-2xl border bg-[color:var(--surface-card)] px-4 py-4 text-left text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-faint)] ${
                    selectedTraceId === trace.id || focusedTraceIds.includes(trace.id) ? "border-[color:var(--border-subtle)]" : "border-[color:var(--border-faint)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-[color:var(--text-primary)]">{formatTraceSource(trace.source)}</div>
                    <StatusPill tone={trace.status === "error" ? "warning" : trace.status === "fallback" ? "warning" : "healthy"}>
                      {formatEvalStatus(trace.status)}
                    </StatusPill>
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    {trace.id}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div>角色：{trace.characterId ?? "无"}</div>
                    <div>会话：{trace.conversationId ?? "无"}</div>
                    <div>创建时间：{trace.createdAt}</div>
                  </div>
                </button>
              ))
            ) : (
              <PanelEmpty message="当前还没有生成链路。先运行数据集或触发一次运行时生成。" />
            )}
          </div>
          <div>
            {traceDetailQuery.data ? (
              <div className="space-y-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-[color:var(--text-primary)]">{formatTraceSource(traceDetailQuery.data.source)}</div>
                  <StatusPill tone={traceDetailQuery.data.status === "error" ? "warning" : traceDetailQuery.data.status === "fallback" ? "warning" : "healthy"}>
                    {formatEvalStatus(traceDetailQuery.data.status)}
                  </StatusPill>
                </div>
                <div className="grid gap-2">
                  <div>链路：{traceDetailQuery.data.id}</div>
                  <div>角色：{traceDetailQuery.data.characterId ?? "无"}</div>
                  <div>模型：{traceDetailQuery.data.provider?.model ?? "无"}</div>
                  <div>耗时：{traceDetailQuery.data.latencyMs ?? 0} ms</div>
                </div>
                <div className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">筛选命中</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <TagBadge>
                      范围：{formatTraceScope(traceScopeFilter)}
                    </TagBadge>
                    {traceSource ? (
                      <TagBadge>
                        来源：{formatTraceSource(traceDetailQuery.data.source)}
                      </TagBadge>
                    ) : null}
                    {traceStatus ? (
                      <TagBadge>
                        状态：{formatEvalStatus(traceDetailQuery.data.status)}
                      </TagBadge>
                    ) : null}
                    {traceCharacterId ? (
                      <TagBadge>
                        角色：{traceDetailQuery.data.characterId ?? "无"}
                      </TagBadge>
                    ) : null}
                    {traceCaseFilter ? (
                      <TagBadge tone="warning">
                        用例：{selectedTraceCaseIds.join(", ") || "无关联用例"}
                      </TagBadge>
                    ) : null}
                    {traceFailureTagFilter ? (
                      <TagBadge tone="danger">
                        失败标签：{selectedTraceFailureTags.join(", ") || "无"}
                      </TagBadge>
                    ) : null}
                    {focusedCaseId ? (
                      <TagBadge tone="info">
                        聚焦用例：{focusedCaseId}
                      </TagBadge>
                    ) : null}
                    {selectedTraceLinkedRunCases.length > 0 ? (
                      <TagBadge tone="success">
                        选中运行：{selectedTraceLinkedRunCases.join(", ")}
                      </TagBadge>
                    ) : null}
                    {selectedTraceComparisonMatches.length > 0 ? (
                      <TagBadge tone="accent">
                        对比角色：{selectedTraceComparisonMatches.map(formatTraceCompareMatch).join(", ")}
                      </TagBadge>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">提示词消息</div>
                  <div className="mt-2 space-y-2">
                    {traceDetailQuery.data.input.promptMessages.map((message, index) => (
                      <div key={`${message.role}-${index}`} className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{formatPromptRole(message.role)}</div>
                        <div className="mt-2 whitespace-pre-wrap break-words leading-6 text-[color:var(--text-primary)]">{message.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">输出</div>
                  <div className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3 text-[color:var(--text-secondary)]">
                    {traceDetailQuery.data.output.normalizedOutput ??
                      traceDetailQuery.data.output.rawOutput ??
                      traceDetailQuery.data.output.errorMessage ??
                      "空"}
                  </div>
                </div>
              </div>
            ) : (
              <PanelEmpty message="选择一条链路后，可查看提示词消息、筛选命中和标准化输出。" />
            )}
          </div>
          <div>
            {traceDetailQuery.data ? (
              <div className="space-y-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">链路上下文</div>
                <div className="grid gap-3">
                  <SnapshotPanel title="请求配置" value={traceDetailQuery.data.input.requestConfig} />
                  <SnapshotPanel title="世界上下文快照" value={traceDetailQuery.data.input.worldContextSnapshot} />
                  <SnapshotPanel title="活动快照" value={traceDetailQuery.data.input.activitySnapshot} />
                  <SnapshotPanel title="记忆快照" value={traceDetailQuery.data.input.memorySnapshot} />
                </div>
                {traceDetailQuery.data.evaluationSummary ? (
                  <>
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">评测汇总</div>
                    <div className="grid gap-3">
                      <div className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">评分</div>
                        <div className="mt-2 space-y-2">
                          {traceDetailQuery.data.evaluationSummary.scores.map((score) => (
                            <div key={score.key} className="flex items-center justify-between gap-3">
                              <div className="text-[color:var(--text-primary)]">{score.label}</div>
                              <div className="text-[color:var(--text-secondary)]">{score.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">失败标签</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {traceDetailQuery.data.evaluationSummary.failureTags.length > 0 ? (
                            traceDetailQuery.data.evaluationSummary.failureTags.map((tag) => (
                              <TagBadge key={tag.key} tone="warning">
                                {tag.label}
                                {typeof tag.count === "number" ? ` · ${tag.count}` : ""}
                              </TagBadge>
                            ))
                          ) : (
                            <span className="text-[color:var(--text-secondary)]">无</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
                {runDetailQuery.data ? (
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">关联用例</div>
                ) : null}
                {runDetailQuery.data ? (
                  <div className="flex flex-wrap gap-2">
                    {runDetailQuery.data.caseResults
                      .filter((caseResult) => caseResult.traceIds.includes(traceDetailQuery.data.id))
                      .map((caseResult) => (
                        <Button
                          variant="secondary"
                          size="sm"
                          key={caseResult.caseId}
                          onClick={() => focusCase(caseResult.caseId, caseResult.traceIds)}
                        >
                          {caseResult.caseId}
                        </Button>
                      ))}
                    {runDetailQuery.data.caseResults.every((caseResult) => !caseResult.traceIds.includes(traceDetailQuery.data.id)) ? (
                      <span className="text-[color:var(--text-secondary)]">当前所选运行中无关联用例</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <PanelEmpty message="选择一条链路后，可查看快照、评测汇总和关联用例。" />
            )}
          </div>
        </div>
      </Card>
        </div>
      </div>
    </div>
  );
}

function formatEvalStatus(status: string) {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "运行中";
    case "passed":
      return "通过";
    case "failed":
      return "失败";
    case "success":
      return "成功";
    case "fallback":
      return "回退";
    case "error":
      return "错误";
    case "scaffolded":
      return "脚手架";
    case "completed":
      return "已完成";
    default:
      return status;
  }
}

function formatEvalMode(mode: string) {
  switch (mode) {
    case "single":
      return "单次";
    case "pairwise":
      return "成对";
    case "replay":
      return "回放";
    case "persona_gate":
      return "角色门控";
    default:
      return mode;
  }
}

function formatCompareOutcome(outcome: string) {
  switch (outcome) {
    case "win":
      return "候选胜出";
    case "lose":
      return "候选落后";
    case "tie":
      return "持平";
    default:
      return outcome;
  }
}

function formatCompareCaseFilter(filter: "all" | "different" | "failed") {
  switch (filter) {
    case "all":
      return "全部用例";
    case "different":
      return "仅差异用例";
    case "failed":
      return "仅失败用例";
    default:
      return filter;
  }
}

function formatCompareOutcomeFilter(filter: "all" | "win" | "lose" | "tie") {
  switch (filter) {
    case "all":
      return "全部结果";
    case "win":
      return "候选胜出";
    case "lose":
      return "候选落后";
    case "tie":
      return "持平";
    default:
      return filter;
  }
}

function formatTraceScope(scope: "all" | "run" | "compare") {
  switch (scope) {
    case "all":
      return "全部链路";
    case "run":
      return "当前运行";
    case "compare":
      return "当前对比";
    default:
      return scope;
  }
}

function formatTraceSource(source: string) {
  switch (source) {
    case "chat.reply":
      return "聊天直回";
    case "social.greeting":
      return "社交打招呼";
    case "group.intent":
      return "群聊意图判断";
    case "group.coordinator":
      return "群聊协调回复";
    case "memory.summary":
      return "记忆摘要";
    default:
      return source;
  }
}

function formatEvalTargetType(targetType: string) {
  switch (targetType) {
    case "turn":
      return "单轮";
    case "session":
      return "会话";
    case "world_event_chain":
      return "世界事件链";
    case "persona":
      return "人设";
    default:
      return targetType;
  }
}

function formatPromptRole(role: string) {
  switch (role) {
    case "system":
      return "系统";
    case "user":
      return "用户";
    case "assistant":
      return "助手";
    default:
      return role;
  }
}

function formatPromptVariantValue(
  value: string | null,
  labelMap: Map<string, string>,
) {
  if (!value) {
    return "默认";
  }

  return labelMap.get(value) ?? value;
}

function formatMemoryStrategyValue(
  value: string | null,
  labelMap: Map<string, string>,
) {
  if (!value || value === "default") {
    return "默认";
  }

  return labelMap.get(value) ?? value;
}

function formatTraceCompareMatch(value: string) {
  const [side, caseId] = value.split(":");
  if (!caseId) {
    return value;
  }

  return `${side === "baseline" ? "基线" : side === "candidate" ? "候选" : side} · ${caseId}`;
}

function formatDecisionStatus(status: "keep-testing" | "promote" | "rollback" | "archive") {
  switch (status) {
    case "keep-testing":
      return "继续测试";
    case "promote":
      return "采用候选";
    case "rollback":
      return "回滚";
    case "archive":
      return "归档";
    default:
      return status;
  }
}

function EvalWorkspaceNavButton({
  label,
  detail,
  onClick,
  disabled,
}: {
  label: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="font-semibold text-[color:var(--text-primary)]">{label}</div>
      <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">{detail}</div>
    </button>
  );
}

function StaticPillRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5">
      <span className="text-[color:var(--text-muted)]">{label}</span>
      <span className="text-right text-[color:var(--text-primary)]">{value}</span>
    </div>
  );
}

function readInitialEvalsState(baseUrl: string): EvalsViewState {
  const fallback: EvalsViewState = {
    compactView: false,
    shareViewName: "",
    compareFiltersExpanded: true,
    traceFiltersExpanded: true,
    selectedReportId: null as string | null,
    traceSource: "",
    traceStatus: "",
    traceCharacterId: "",
    selectedRunId: null as string | null,
    selectedTraceId: null as string | null,
    selectedDatasetId: null as string | null,
    baselineRunId: "",
    candidateRunId: "",
    experimentLabel: "",
    historyProviderFilter: "",
    historyJudgeFilter: "",
    historyPromptVariantFilter: "",
    historyMemoryPolicyFilter: "",
    compareCaseFilter: "all" as "all" | "different" | "failed",
    compareOutcomeFilter: "all" as "all" | "win" | "lose" | "tie",
    compareFailureTagFilter: "",
    compareCaseSearch: "",
    traceScopeFilter: "all" as "all" | "run" | "compare",
    traceCaseFilter: "",
    traceFailureTagFilter: "",
    focusedCaseId: null as string | null,
    focusedTraceIds: [] as string[],
  };
  const storage = getBrowserStorage();
  if (!storage) {
    return fallback;
  }

  let persisted = fallback;
  try {
    const raw = storage.getItem(getEvalStorageKey(EVALS_STATE_KEY, baseUrl));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EvalsViewState>;
      persisted = {
        ...fallback,
        ...parsed,
        compactView: Boolean(parsed.compactView),
        shareViewName: parsed.shareViewName ?? fallback.shareViewName,
        compareFiltersExpanded:
          typeof parsed.compareFiltersExpanded === "boolean"
            ? parsed.compareFiltersExpanded
            : fallback.compareFiltersExpanded,
        traceFiltersExpanded:
          typeof parsed.traceFiltersExpanded === "boolean"
            ? parsed.traceFiltersExpanded
            : fallback.traceFiltersExpanded,
        selectedReportId: parsed.selectedReportId ?? fallback.selectedReportId,
        focusedTraceIds: parsed.focusedTraceIds ?? fallback.focusedTraceIds,
        compareCaseFilter:
          parsed.compareCaseFilter === "different" || parsed.compareCaseFilter === "failed"
            ? parsed.compareCaseFilter
            : "all",
        compareOutcomeFilter:
          parsed.compareOutcomeFilter === "win" ||
          parsed.compareOutcomeFilter === "lose" ||
          parsed.compareOutcomeFilter === "tie"
            ? parsed.compareOutcomeFilter
            : "all",
        compareFailureTagFilter: parsed.compareFailureTagFilter ?? fallback.compareFailureTagFilter,
        compareCaseSearch: parsed.compareCaseSearch ?? fallback.compareCaseSearch,
        traceScopeFilter:
          parsed.traceScopeFilter === "run" || parsed.traceScopeFilter === "compare"
            ? parsed.traceScopeFilter
            : "all",
        traceCaseFilter: parsed.traceCaseFilter ?? fallback.traceCaseFilter,
        traceFailureTagFilter: parsed.traceFailureTagFilter ?? fallback.traceFailureTagFilter,
      };
    }
  } catch {
    persisted = fallback;
  }

  const params = new URLSearchParams(window.location.search);
  return {
    ...persisted,
    compactView: params.get("compact") === "1" ? true : persisted.compactView,
    shareViewName: params.get("view") ?? persisted.shareViewName,
    selectedReportId: params.get("report") ?? persisted.selectedReportId,
    traceSource: params.get("traceSource") ?? persisted.traceSource,
    traceStatus: params.get("traceStatus") ?? persisted.traceStatus,
    traceCharacterId: params.get("traceCharacter") ?? persisted.traceCharacterId,
    selectedRunId: params.get("run") ?? persisted.selectedRunId,
    selectedTraceId: params.get("trace") ?? persisted.selectedTraceId,
    selectedDatasetId: params.get("dataset") ?? persisted.selectedDatasetId,
    baselineRunId: params.get("baseline") ?? persisted.baselineRunId,
    candidateRunId: params.get("candidate") ?? persisted.candidateRunId,
    experimentLabel: params.get("experiment") ?? persisted.experimentLabel,
    historyProviderFilter: params.get("historyProvider") ?? persisted.historyProviderFilter,
    historyJudgeFilter: params.get("historyJudge") ?? persisted.historyJudgeFilter,
    historyPromptVariantFilter: params.get("historyPrompt") ?? persisted.historyPromptVariantFilter,
    historyMemoryPolicyFilter: params.get("historyMemory") ?? persisted.historyMemoryPolicyFilter,
    compareCaseFilter:
      params.get("compareFilter") === "different" || params.get("compareFilter") === "failed"
        ? (params.get("compareFilter") as "different" | "failed")
        : persisted.compareCaseFilter,
    compareOutcomeFilter:
      params.get("compareOutcome") === "win" ||
      params.get("compareOutcome") === "lose" ||
      params.get("compareOutcome") === "tie"
        ? (params.get("compareOutcome") as "win" | "lose" | "tie")
        : persisted.compareOutcomeFilter,
    compareFailureTagFilter: params.get("compareFailureTag") ?? persisted.compareFailureTagFilter,
    compareCaseSearch: params.get("compareSearch") ?? persisted.compareCaseSearch,
    traceScopeFilter:
      params.get("traceScope") === "run" || params.get("traceScope") === "compare"
        ? (params.get("traceScope") as "run" | "compare")
        : persisted.traceScopeFilter,
    traceCaseFilter: params.get("traceCase") ?? persisted.traceCaseFilter,
    traceFailureTagFilter: params.get("traceFailureTag") ?? persisted.traceFailureTagFilter,
    focusedCaseId: params.get("case") ?? persisted.focusedCaseId,
    focusedTraceIds: persisted.focusedTraceIds,
  };
}

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getEvalStorageKey(prefix: string, baseUrl: string) {
  return `${prefix}:${baseUrl || "default"}`;
}

function setQueryParam(params: URLSearchParams, key: string, value: string | null) {
  if (!value) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}
