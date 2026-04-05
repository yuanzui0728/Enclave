import { useEffect, useState } from "react";
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
  AppHeader,
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

const EVALS_STATE_KEY = "yinjie-admin-evals-state";
const EVALS_PRESETS_KEY = "yinjie-admin-evals-presets";

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
  const baseUrl = import.meta.env.VITE_CORE_API_BASE_URL;
  const queryClient = useQueryClient();
  const persistedState = readInitialEvalsState();
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
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EVALS_PRESETS_KEY, JSON.stringify(nextPresets));
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
  const datasetList = datasetsQuery.data ?? [];

  const strategiesQuery = useQuery({
    queryKey: ["admin-eval-strategies", baseUrl],
    queryFn: () => listEvalMemoryStrategies(baseUrl),
  });
  const memoryStrategies = strategiesQuery.data ?? [];
  const promptVariantsQuery = useQuery({
    queryKey: ["admin-eval-prompt-variants", baseUrl],
    queryFn: () => listEvalPromptVariants(baseUrl),
  });
  const promptVariants = promptVariantsQuery.data ?? [];
  const experimentPresetsQuery = useQuery({
    queryKey: ["admin-eval-experiment-presets", baseUrl],
    queryFn: () => listEvalExperimentPresets(baseUrl),
  });
  const experimentPresets = experimentPresetsQuery.data ?? [];
  const experimentReportsQuery = useQuery({
    queryKey: ["admin-eval-experiment-reports", baseUrl],
    queryFn: () => listEvalExperimentReports(baseUrl),
  });
  const experimentReports = experimentReportsQuery.data ?? [];
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
  const allRuns = runsQuery.data ?? [];
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
      setSuccessNotice(`Dataset run completed: ${result.id}`);
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
      setSuccessNotice(`Pairwise run completed: ${result.comparison.id}`);
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
      setSuccessNotice(`Experiment preset completed: ${result.preset.id}`);
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
      setSuccessNotice(`Report decision updated: ${report.decisionStatus}`);
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
  const tracePool = tracesQuery.data ?? [];
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
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(EVALS_PRESETS_KEY);
      if (!raw) {
        setSavedPresets([]);
        return;
      }
      setSavedPresets(sortSavedPresets(JSON.parse(raw) as EvalsPreset[]));
    } catch {
      setSavedPresets([]);
    }
  }, []);

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
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      EVALS_STATE_KEY,
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
    await copyPresetPayload(JSON.stringify(savedPresets, null, 2), "copy presets json");
  }

  async function exportCurrentPreset() {
    const name = presetName.trim();
    if (!name) {
      return;
    }
    const preset = savedPresets.find((item) => item.name === name) ?? currentPresetSnapshot(name);
    await copyPresetPayload(JSON.stringify(preset, null, 2), "copy current preset json");
  }

  function importPresets() {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.prompt("paste presets json");
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
      window.alert("invalid presets json");
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
  }

  return (
    <div className="space-y-6">
      <AppHeader
        eyebrow="Eval Workspace"
        title="Evaluation Control Plane"
        description="先选择数据集和实验视图，再运行 dataset、pairwise 或 preset，对比后再进入 trace 细查。"
        actions={
          <div className="flex flex-wrap gap-3">
            <Button variant={compactView ? "primary" : "secondary"} onClick={() => setCompactView((value) => !value)}>
              {compactView ? "compact on" : "compact off"}
            </Button>
            <Button variant="secondary" onClick={resetViewState}>
              reset filters
            </Button>
          </div>
        }
      />

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>Eval Overview</SectionHeading>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Datasets" value={overviewQuery.data?.datasetCount ?? 0} />
          <MetricCard label="Runs" value={overviewQuery.data?.runCount ?? 0} />
          <MetricCard label="Traces" value={overviewQuery.data?.traceCount ?? 0} />
          <MetricCard label="Fallback Traces" value={overviewQuery.data?.fallbackTraceCount ?? 0} />
          <MetricCard label="Failed Runs" value={overviewQuery.data?.failedRunCount ?? 0} />
        </div>
        <div className="mt-4 text-sm text-[color:var(--text-secondary)]">
          latest run: {overviewQuery.data?.latestRunAt ?? "none"}
        </div>
        {shareViewName.trim() ? (
          <div className="mt-4">
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-100">
              view: {shareViewName.trim()}
            </span>
          </div>
        ) : null}
        <InlineNotice className="mt-4" tone={compactView ? "info" : "muted"}>
          {compactView
            ? "当前是 compact 模式，只优先展示失败、异常和差异明显的结果。"
            : "当前是 full 模式，适合完整浏览 runs、comparisons、reports 和 traces。"}
        </InlineNotice>
        <div className="mt-4 flex flex-wrap gap-3">
          <TextField
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            placeholder="preset name"
            className="w-auto min-w-44 rounded-full py-2"
          />
          <TextField
            value={shareViewName}
            onChange={(event) => setShareViewName(event.target.value)}
            placeholder="share view name"
            className="w-auto min-w-48 rounded-full py-2"
          />
          <Button variant="secondary" onClick={saveCurrentPreset}>
            save preset
          </Button>
          <Button variant="secondary" onClick={() => {
            void exportCurrentPreset();
          }}>
            export current preset
          </Button>
          <Button variant="secondary" onClick={() => {
            void exportAllPresets();
          }}>
            export all presets
          </Button>
          <Button variant="secondary" onClick={importPresets}>
            import presets
          </Button>
          <UiSelectField
            value={presetName}
            onChange={(event) => {
              setPresetName(event.target.value);
              applyPreset(event.target.value);
            }}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
          >
            <option value="">apply preset</option>
            {savedPresets.map((preset) => (
              <option key={preset.name} value={preset.name}>
                {preset.name}
              </option>
            ))}
          </UiSelectField>
          {presetName && savedPresets.some((preset) => preset.name === presetName) ? (
            <Button variant="danger" onClick={() => deletePreset(presetName)}>
              delete preset
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => {
            void copyCurrentViewLink();
          }}>
            copy view link
          </Button>
        </div>
        {evalRunBusy || reportDecisionBusy ? (
          <InlineNotice className="mt-4" tone="info">
            {activeDatasetRunId
              ? `Running dataset ${activeDatasetRunId}...`
              : activePairwiseRunId
                ? `Running pairwise eval for ${activePairwiseRunId}...`
                : activePresetRunId
                  ? `Running preset ${activePresetRunId}...`
                  : activeReportDecisionId
                  ? `Updating report decision for ${activeReportDecisionId}...`
                  : "Eval action in progress..."}
          </InlineNotice>
        ) : null}
        {successNotice ? <InlineNotice className="mt-4" tone="success">{successNotice}</InlineNotice> : null}
        {runDatasetMutation.isError && runDatasetMutation.error instanceof Error ? <ErrorBlock className="mt-4" message={runDatasetMutation.error.message} /> : null}
        {runPairwiseMutation.isError && runPairwiseMutation.error instanceof Error ? <ErrorBlock className="mt-4" message={runPairwiseMutation.error.message} /> : null}
        {runExperimentPresetMutation.isError && runExperimentPresetMutation.error instanceof Error ? <ErrorBlock className="mt-4" message={runExperimentPresetMutation.error.message} /> : null}
        {updateReportDecisionMutation.isError && updateReportDecisionMutation.error instanceof Error ? <ErrorBlock className="mt-4" message={updateReportDecisionMutation.error.message} /> : null}
      </Card>

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>Saved Views</SectionHeading>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {savedPresets.map((preset) => (
            <div
              key={preset.name}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-left text-sm text-[color:var(--text-secondary)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-white">
                  {preset.name}
                  {preset.pinned ? " · pinned" : ""}
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone={preset.compactView ? "healthy" : "muted"}>
                    {preset.compactView ? "compact" : "full"}
                  </StatusPill>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => togglePresetPinned(preset.name)}
                  >
                    {preset.pinned ? "unpin" : "pin"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => movePreset(preset.name, "up")}
                  >
                    up
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => movePreset(preset.name, "down")}
                  >
                    down
                  </Button>
                </div>
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                {preset.shareViewName || "unnamed view"}
              </div>
              <div className="mt-3 grid gap-2 text-xs">
                <div>dataset: {preset.selectedDatasetId ?? "all"}</div>
                <div>compare: {preset.compareCaseFilter} / {preset.compareOutcomeFilter}</div>
                <div>trace: {preset.traceScopeFilter} / {preset.traceSource || "all sources"}</div>
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
                apply view
              </Button>
            </div>
          ))}
          {savedPresets.length === 0 ? (
            <PanelEmpty message="No saved views yet. Save the current filter state as a preset." />
          ) : null}
        </div>
      </Card>

      {!compactView ? (
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Dataset Runs</SectionHeading>
          <InlineNotice className="mt-4" tone="muted">
            这里是运行入口。先填实验标签和 candidate override，再按数据集执行 single run 或 pairwise。
          </InlineNotice>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <TextField
              value={experimentLabel}
              onChange={(event) => setExperimentLabel(event.target.value)}
              placeholder="experiment label"
              className="rounded-2xl"
            />
            <TextField
              value={pairwiseProviderOverride}
              onChange={(event) => setPairwiseProviderOverride(event.target.value)}
              placeholder="candidate model override"
              className="rounded-2xl"
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <TextField
              value={pairwiseJudgeModelOverride}
              onChange={(event) => setPairwiseJudgeModelOverride(event.target.value)}
              placeholder="judge model override"
              className="rounded-2xl"
            />
            <UiSelectField
              value={pairwisePromptVariant}
              onChange={(event) => setPairwisePromptVariant(event.target.value)}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
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
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
            >
              <option value="default">default memory</option>
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
                  subtitle={`${dataset.id} · ${dataset.targetType} · ${dataset.version}`}
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
                      {pending ? "Running" : "Run Dataset"}
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
                      {pairwisePending ? "Pairwise..." : "Run Pairwise"}
                    </Button>
                    </>
                  }
                  body={<div className="leading-6">{dataset.description}</div>}
                  footer={
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {dataset.caseIds.length} cases · rubrics: {dataset.rubricIds.join(", ")}
                    </div>
                  }
                />
              );
            })}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Experiment Presets</SectionHeading>
          <InlineNotice className="mt-4" tone="muted">
            预设适合把 baseline/candidate 的组合固化下来，重复执行同一实验。
          </InlineNotice>
          <div className="mt-4 space-y-3">
            {experimentPresets.map((preset) => {
              const pending =
                runExperimentPresetMutation.isPending && runExperimentPresetMutation.variables === preset.id;
              return (
                <ListItemCard
                  key={preset.id}
                  title={preset.title}
                  subtitle={`${preset.id} · ${preset.mode} · ${preset.datasetId}`}
                  actions={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => runExperimentPresetMutation.mutate(preset.id)}
                      disabled={evalRunBusy}
                    >
                      {pending ? "Running" : "Run Preset"}
                    </Button>
                  }
                  body={<div className="leading-6">{preset.description}</div>}
                  footer={<div className="grid gap-2 text-xs text-[color:var(--text-muted)]">
                    <div>label: {preset.experimentLabel ?? preset.id}</div>
                    <div>
                      baseline: {preset.baseline?.providerOverride ?? "default"} / {preset.baseline?.judgeModelOverride ?? "default"} / {preset.baseline?.promptVariant ?? "default"} / {preset.baseline?.memoryPolicyVariant ?? "default"}
                    </div>
                    <div>
                      candidate: {preset.candidate?.providerOverride ?? "default"} / {preset.candidate?.judgeModelOverride ?? "default"} / {preset.candidate?.promptVariant ?? "default"} / {preset.candidate?.memoryPolicyVariant ?? "default"}
                    </div>
                  </div>}
                />
              );
            })}
            {experimentPresets.length === 0 ? (
              <PanelEmpty message="No asset experiment presets yet." />
            ) : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Recent Runs</SectionHeading>
          <div className="mt-4 flex flex-wrap gap-3">
            <UiSelectField
              value={selectedDatasetId ?? ""}
              onChange={(event) => setSelectedDatasetId(event.target.value || null)}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
            >
              <option value="">all datasets</option>
              {datasetList.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.title}
                </option>
              ))}
            </UiSelectField>
            <TextField
              value={historyProviderFilter}
              onChange={(event) => setHistoryProviderFilter(event.target.value)}
              placeholder="provider model"
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white placeholder:text-[color:var(--text-muted)]"
            />
            <TextField
              value={historyJudgeFilter}
              onChange={(event) => setHistoryJudgeFilter(event.target.value)}
              placeholder="judge model"
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white placeholder:text-[color:var(--text-muted)]"
            />
            <UiSelectField
              value={historyPromptVariantFilter}
              onChange={(event) => setHistoryPromptVariantFilter(event.target.value)}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
            >
              <option value="">all prompt variants</option>
              {promptVariants.map((variant) => (
                <option key={`history-prompt-${variant.id}`} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </UiSelectField>
            <UiSelectField
              value={historyMemoryPolicyFilter}
              onChange={(event) => setHistoryMemoryPolicyFilter(event.target.value)}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
            >
              <option value="">all memory policies</option>
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
                  actions={<StatusPill tone={run.status === "failed" ? "warning" : "healthy"}>{run.status}</StatusPill>}
                  footer={<div className="grid gap-2 text-sm">
                    <div>mode: {run.mode}</div>
                    <div>experiment: {run.experimentLabel ?? "none"}</div>
                    <div>provider: {run.effectiveProviderModel ?? "default"}</div>
                    <div>judge: {run.effectiveJudgeModel ?? "default"}</div>
                    <div>prompt: {run.promptVariant ?? "default"}</div>
                    <div>memory: {run.memoryPolicyVariant ?? "default"}</div>
                    <div>started: {run.startedAt}</div>
                    <div>cases: {run.summary.caseCount}</div>
                    <div>passed: {run.summary.passedCases}</div>
                    <div>failed: {run.summary.failedCases}</div>
                    <div>scaffolded: {run.summary.scaffoldedCases}</div>
                  </div>}
                />
              ))
            ) : (
              <PanelEmpty message="No eval runs yet. Start by running one of the datasets." />
            )}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Compare History</SectionHeading>
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
                  <div>dataset: {comparison.candidateDatasetId}</div>
                  <div>baseline provider/judge: {comparison.baselineProviderModel ?? "default"} / {comparison.baselineJudgeModel ?? "default"}</div>
                  <div>baseline prompt/memory: {comparison.baselinePromptVariant ?? "default"} / {comparison.baselineMemoryPolicyVariant ?? "default"}</div>
                  <div>candidate provider/judge: {comparison.candidateProviderModel ?? "default"} / {comparison.candidateJudgeModel ?? "default"}</div>
                  <div>candidate prompt/memory: {comparison.candidatePromptVariant ?? "default"} / {comparison.candidateMemoryPolicyVariant ?? "default"}</div>
                </div>}
              />
            ))}
            {(comparisonsQuery.data ?? []).length === 0 ? (
              <PanelEmpty message="No saved comparisons yet. Run pairwise evals to build experiment history." />
            ) : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Experiment Reports</SectionHeading>
          <div className="mt-4 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
            {experimentReports.slice(0, 8).map((report) => (
              <ListItemCard
                key={report.id}
                onClick={() => setSelectedReportId(report.id)}
                className={`w-full cursor-pointer text-left transition hover:border-white/20 ${
                  selectedReport?.id === report.id ? "border-white/30" : "border-white/10"
                }`}
                title={report.presetTitle}
                subtitle={`${report.createdAt} · ${report.presetId}`}
                actions={
                  <StatusPill tone={report.summary.wins > report.summary.losses ? "healthy" : "muted"}>
                    {report.mode}
                  </StatusPill>
                }
                meta={<div className="grid gap-2">
                  <div>dataset: {report.datasetId}</div>
                  <div>summary: {report.summary.wins} / {report.summary.losses} / {report.summary.ties}</div>
                  <div>label: {report.experimentLabel ?? "none"}</div>
                </div>}
                body={
                  <>
                    {report.recommendations.length > 0 ? (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-emerald-100">Recommendations</div>
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
                    <div className="text-xs uppercase tracking-[0.16em] text-rose-100">Regressions</div>
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
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Top Case Deltas</div>
                    <div className="mt-2 space-y-2">
                      {report.topCaseDeltas.slice(0, 3).map((item) => (
                        <div key={`${report.id}-${item.caseId}`} className="flex items-center justify-between gap-3">
                          <div className="text-white">{item.caseId}</div>
                          <div className="text-[color:var(--text-secondary)]">
                            {item.outcome} · {item.scoreDelta >= 0 ? "+" : ""}{item.scoreDelta.toFixed(2)}
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
              <PanelEmpty message="No experiment reports yet. Run an experiment preset first." />
            ) : null}
            </div>
            <div>
              {selectedReport ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-white">{selectedReport.presetTitle}</div>
                    <StatusPill tone={selectedReport.summary.wins > selectedReport.summary.losses ? "healthy" : "muted"}>
                      {selectedReport.mode}
                    </StatusPill>
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    {selectedReport.createdAt} · {selectedReport.id}
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    <div>dataset: {selectedReport.datasetId}</div>
                    <div>label: {selectedReport.experimentLabel ?? "none"}</div>
                    <div>single run: {selectedReport.singleRunId ?? "n/a"}</div>
                    <div>comparison: {selectedReport.comparisonId ?? "n/a"}</div>
                    <div>baseline run: {selectedReport.baselineRunId ?? "n/a"}</div>
                    <div>candidate run: {selectedReport.candidateRunId ?? "n/a"}</div>
                    <div>decision: {selectedReport.decisionStatus}</div>
                    <div>action: {selectedReport.appliedAction ?? "none"}</div>
                    <div>decided at: {selectedReport.decidedAt ?? "n/a"}</div>
                    <div>decided by: {selectedReport.decidedBy ?? "n/a"}</div>
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
                      {reportDecisionBusy && activeReportDecisionId === selectedReport.id ? "Updating..." : "keep-testing"}
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
                      promote
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
                      rollback
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
                      archive
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {selectedReport.singleRunId ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedRunId(selectedReport.singleRunId ?? null)}
                      >
                        open single run
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
                        load compare
                      </Button>
                    ) : null}
                    {selectedReport.candidateRunId ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedRunId(selectedReport.candidateRunId ?? null)}
                      >
                        open candidate run
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <MetricCard label="Cases" value={selectedReport.summary.totalCases} />
                    <MetricCard label="Wins" value={selectedReport.summary.wins} />
                    <MetricCard label="Losses" value={selectedReport.summary.losses} />
                    <MetricCard label="Ties" value={selectedReport.summary.ties} />
                  </div>
                  {selectedReport.notes.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Notes</div>
                      <div className="mt-2 space-y-2">
                        {selectedReport.notes.map((note) => (
                          <div key={`${selectedReport.id}-${note}`} className="text-white">
                            {note}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedReport.topCaseDeltas.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Top Case Deltas</div>
                      <div className="mt-2 space-y-2">
                        {selectedReport.topCaseDeltas.map((item) => (
                          <div key={`${selectedReport.id}-detail-${item.caseId}`} className="flex items-center justify-between gap-3">
                            <div className="text-white">{item.caseId}</div>
                            <div className="text-[color:var(--text-secondary)]">
                              {item.outcome} · {item.scoreDelta >= 0 ? "+" : ""}{item.scoreDelta.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedReport.failureTagDeltas.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Failure Tag Deltas</div>
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
                <PanelEmpty message="Select an experiment report to inspect its summary, notes, and deltas." />
              )}
            </div>
          </div>
        </Card>
      </div>
      ) : null}

      {!compactView ? (
      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>Dataset Detail</SectionHeading>
        <div className="mt-4">
          {datasetDetailQuery.data ? (
            <div className="space-y-4">
              <ListItemCard
                title={datasetDetailQuery.data.manifest.title}
                subtitle={`${datasetDetailQuery.data.manifest.id} · ${datasetDetailQuery.data.manifest.targetType} · ${datasetDetailQuery.data.manifest.version}`}
                actions={
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    owner: {datasetDetailQuery.data.manifest.owner}
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
                      <SnapshotPanel title="Case Input" value={caseRecord.input} />
                        </div>
                      </>
                    }
                    footer={
                      <>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Hard Rules</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {caseRecord.expectations.hardRules.map((rule) => (
                          <TagBadge key={`${caseRecord.id}-rule-${rule}`}>{rule}</TagBadge>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Forbidden Outcomes</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {caseRecord.expectations.forbiddenOutcomes.map((outcome) => (
                          <TagBadge key={`${caseRecord.id}-outcome-${outcome}`} tone="danger">{outcome}</TagBadge>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Judge Rubrics</div>
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
            <PanelEmpty message="Select a dataset card to inspect case input, hard rules, forbidden outcomes, and judge rubrics." />
          )}
        </div>
      </Card>
      ) : null}

      {!compactView ? (
      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>Run Detail</SectionHeading>
        <div className="mt-4">
          {runDetailQuery.data ? (
            <div className="space-y-4">
              <ListItemCard
                title={runDetailQuery.data.datasetId}
                subtitle={runDetailQuery.data.id}
                actions={
                  <StatusPill tone={runDetailQuery.data.status === "failed" ? "warning" : "healthy"}>
                    {runDetailQuery.data.status}
                  </StatusPill>
                }
                footer={
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Mode" value={runDetailQuery.data.mode} />
                    <MetricCard label="Started" value={runDetailQuery.data.startedAt} />
                    <MetricCard label="Runner" value={runDetailQuery.data.runnerVersion} />
                    <MetricCard label="Judge" value={runDetailQuery.data.judgeVersion} />
                  </div>
                }
              />

              <div className="grid gap-3 xl:grid-cols-2">
                {runDetailQuery.data.caseResults.map((caseResult) => (
                  <div
                    key={caseResult.caseId}
                    onClick={() => focusCase(caseResult.caseId, caseResult.traceIds)}
                    className={`cursor-pointer rounded-2xl border bg-black/20 px-4 py-4 text-left text-sm text-[color:var(--text-secondary)] ${
                      focusedCaseId === caseResult.caseId ? "border-white/30" : "border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white">{caseResult.caseId}</div>
                      <StatusPill tone={caseResult.status === "failed" ? "warning" : caseResult.status === "scaffolded" ? "warning" : "healthy"}>
                        {caseResult.status}
                      </StatusPill>
                    </div>
                    <div className="mt-3 whitespace-pre-wrap break-words leading-6 text-white">
                      {caseResult.output || "empty"}
                    </div>
                    {caseResult.scores.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Scores</div>
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
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                        {caseResult.judgeRationale}
                      </div>
                    ) : null}
                    {caseResult.ruleViolations.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Rule Violations</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {caseResult.ruleViolations.map((violation) => (
                            <TagBadge key={violation} tone="warning">{violation}</TagBadge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {caseResult.failureTags.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Failure Tags</div>
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
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Trace Links</div>
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
                              className="rounded-full border border-white/10 px-3 py-1 text-xs text-white transition hover:border-white/20"
                            >
                              {traceId}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {selectedDatasetCaseMap.get(caseResult.caseId) ? (
                      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Case Expectations</div>
                        <div className="mt-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Input</div>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-white">
                            {JSON.stringify(selectedDatasetCaseMap.get(caseResult.caseId)?.input ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div className="mt-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Hard Rules</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(selectedDatasetCaseMap.get(caseResult.caseId)?.expectations.hardRules ?? []).map((rule) => (
                              <TagBadge key={`${caseResult.caseId}-expected-rule-${rule}`}>{rule}</TagBadge>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Forbidden Outcomes</div>
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
            <PanelEmpty message="Select a recent run to inspect case-level outputs, rule violations, and trace links." />
          )}
        </div>
      </Card>
      ) : null}

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>Run Compare</SectionHeading>
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCompareFiltersExpanded((value) => !value)}
            >
              {compareFiltersExpanded ? "hide compare filters" : "show compare filters"}
            </Button>
            <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-[color:var(--text-secondary)]">
              {activeCompareFilterCount} filters active
            </div>
            {compareDatasetId ? (
              <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-[color:var(--text-secondary)]">
                dataset: {compareDatasetId}
              </div>
            ) : null}
          </div>
          <InlineNotice className="mb-4" tone="muted">
            先锁定 baseline/candidate，再按 case outcome、failure tag 和搜索词收窄比较范围。
          </InlineNotice>
          {compareFiltersExpanded ? (
          <div className="mb-4 flex flex-wrap gap-3">
            <TextField
              value={compareCaseSearch}
              onChange={(event) => setCompareCaseSearch(event.target.value)}
              placeholder="search caseId"
              className="w-auto min-w-44 rounded-full py-2"
            />
            <UiSelectField
              value={baselineRunId}
              onChange={(event) => setBaselineRunId(event.target.value)}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
            >
              <option value="">select baseline run</option>
              {comparableRuns.map((run) => (
                <option key={`baseline-${run.id}`} value={run.id}>
                  {run.datasetId} · {run.id}
                </option>
              ))}
            </UiSelectField>
            <UiSelectField
              value={candidateRunId}
              onChange={(event) => setCandidateRunId(event.target.value)}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
            >
              <option value="">select candidate run</option>
              {comparableRuns.map((run) => (
                <option key={`candidate-${run.id}`} value={run.id}>
                  {run.datasetId} · {run.id}
                </option>
              ))}
            </UiSelectField>
            <UiSelectField
              value={compareCaseFilter}
              onChange={(event) => setCompareCaseFilter(event.target.value as "all" | "different" | "failed")}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
            >
              <option value="all">all cases</option>
              <option value="different">different only</option>
              <option value="failed">failed only</option>
            </UiSelectField>
            <UiSelectField
              value={compareOutcomeFilter}
              onChange={(event) => setCompareOutcomeFilter(event.target.value as "all" | "win" | "lose" | "tie")}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
            >
              <option value="all">all outcomes</option>
              <option value="win">wins</option>
              <option value="lose">losses</option>
              <option value="tie">ties</option>
            </UiSelectField>
            <UiSelectField
              value={compareFailureTagFilter}
              onChange={(event) => setCompareFailureTagFilter(event.target.value)}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
            >
              <option value="">all failure tags</option>
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
                title={`${compareQuery.data.candidateDatasetId} vs ${compareQuery.data.baselineDatasetId}`}
                footer={
                  <div className="grid gap-3 md:grid-cols-4">
                    <MetricCard label="Cases" value={displayedComparisons.length} />
                    <MetricCard label="Wins" value={filteredComparisonSummary.wins} />
                    <MetricCard label="Losses" value={filteredComparisonSummary.losses} />
                    <MetricCard label="Ties" value={filteredComparisonSummary.ties} />
                  </div>
                }
              />
              <div className="grid gap-3 xl:grid-cols-2">
                {displayedComparisons.map((comparison) => (
                  <div key={comparison.caseId} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white">{comparison.caseId}</div>
                      <StatusPill tone={comparison.outcome === "lose" ? "warning" : comparison.outcome === "win" ? "healthy" : "muted"}>
                        {comparison.outcome}
                      </StatusPill>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <div>baseline: {comparison.baselineStatus ?? "n/a"}</div>
                      <div>candidate: {comparison.candidateStatus ?? "n/a"}</div>
                      <div>baseline score: {comparison.baselineScoreTotal.toFixed(2)}</div>
                      <div>candidate score: {comparison.candidateScoreTotal.toFixed(2)}</div>
                      <div>score delta: {comparison.scoreDelta >= 0 ? "+" : ""}{comparison.scoreDelta.toFixed(2)}</div>
                    </div>
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Baseline Output</div>
                        <div className="mt-2 whitespace-pre-wrap break-words leading-6 text-white">
                          {comparison.baselineOutput || "empty"}
                        </div>
                        {comparison.baselineRuleViolations.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {comparison.baselineRuleViolations.map((violation) => (
                              <TagBadge key={`baseline-${comparison.caseId}-${violation}`} tone="warning">{violation}</TagBadge>
                            ))}
                          </div>
                        ) : null}
                        {comparison.baselineScores.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Baseline Scores</div>
                            <div className="mt-2 space-y-2">
                              {comparison.baselineScores.map((score) => (
                                <div key={`baseline-score-${comparison.caseId}-${score.key}`} className="flex items-center justify-between gap-3">
                                  <div className="text-white">{score.label}</div>
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
                                baseline trace
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Candidate Output</div>
                        <div className="mt-2 whitespace-pre-wrap break-words leading-6 text-white">
                          {comparison.candidateOutput || "empty"}
                        </div>
                        {comparison.candidateRuleViolations.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {comparison.candidateRuleViolations.map((violation) => (
                              <TagBadge key={`candidate-${comparison.caseId}-${violation}`} tone="warning">{violation}</TagBadge>
                            ))}
                          </div>
                        ) : null}
                        {comparison.candidateScores.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Candidate Scores</div>
                            <div className="mt-2 space-y-2">
                              {comparison.candidateScores.map((score) => (
                                <div key={`candidate-score-${comparison.caseId}-${score.key}`} className="flex items-center justify-between gap-3">
                                  <div className="text-white">{score.label}</div>
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
                                candidate trace
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
            <PanelEmpty message="Run at least two eval runs to unlock pairwise comparison." />
          )}
        </div>
      </Card>

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>Generation Traces</SectionHeading>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTraceFiltersExpanded((value) => !value)}
          >
            {traceFiltersExpanded ? "hide trace filters" : "show trace filters"}
          </Button>
          <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-[color:var(--text-secondary)]">
            {activeTraceFilterCount} filters active
          </div>
        </div>
        <InlineNotice className="mt-4" tone="muted">
          traces 用来下钻 prompt chain、fallback 和 failure tag。可以按 run、compare、case 和 source 逐层收窄。
        </InlineNotice>
        {traceFiltersExpanded ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <UiSelectField
            value={traceScopeFilter}
            onChange={(event) => setTraceScopeFilter(event.target.value as "all" | "run" | "compare")}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
          >
            <option value="all">all traces</option>
            <option value="run">current run traces</option>
            <option value="compare">current compare traces</option>
          </UiSelectField>
          <UiSelectField
            value={traceCaseFilter}
            onChange={(event) => setTraceCaseFilter(event.target.value)}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
          >
            <option value="">all cases</option>
            {availableTraceCaseIds.map((caseId) => (
              <option key={caseId} value={caseId}>
                {caseId}
              </option>
            ))}
          </UiSelectField>
          <UiSelectField
            value={traceFailureTagFilter}
            onChange={(event) => setTraceFailureTagFilter(event.target.value)}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
          >
            <option value="">all failure tags</option>
            {availableTraceFailureTags.map((tagKey) => (
              <option key={tagKey} value={tagKey}>
                {tagKey}
              </option>
            ))}
          </UiSelectField>
          <UiSelectField
            value={traceSource}
            onChange={(event) => setTraceSource(event.target.value)}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
          >
            <option value="">all sources</option>
            <option value="chat.reply">chat.reply</option>
            <option value="social.greeting">social.greeting</option>
            <option value="group.intent">group.intent</option>
            <option value="group.coordinator">group.coordinator</option>
            <option value="memory.summary">memory.summary</option>
          </UiSelectField>
          <UiSelectField
            value={traceStatus}
            onChange={(event) => setTraceStatus(event.target.value)}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
          >
            <option value="">all status</option>
            <option value="success">success</option>
            <option value="fallback">fallback</option>
            <option value="error">error</option>
          </UiSelectField>
          <UiSelectField
            value={traceCharacterId}
            onChange={(event) => setTraceCharacterId(event.target.value)}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
          >
            <option value="">all characters</option>
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
              clear case focus: {focusedCaseId}
            </Button>
          ) : null}
        </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-[color:var(--text-secondary)]">
          <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2">
            scope total: {scopedTraces.length}
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2">
            showing: {displayedTraces.length}
          </div>
          {focusedTraceIds.length > 0 ? (
            <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-amber-100">
              focused matches: {visibleTraces.length}
            </div>
          ) : null}
        </div>
        {traceDetailQuery.data ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-secondary)]">
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
                selected trace: {traceDetailQuery.data.id}
              </StatusPill>
              <StatusPill>{traceDetailQuery.data.source}</StatusPill>
              {focusedCaseId ? <StatusPill tone="warning">focused case: {focusedCaseId}</StatusPill> : null}
              {selectedTraceCaseIds.length > 0 ? <StatusPill>linked cases: {selectedTraceCaseIds.length}</StatusPill> : null}
              {selectedTraceFailureTags.length > 0 ? (
                <StatusPill tone="warning">failure tags: {selectedTraceFailureTags.length}</StatusPill>
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
                  className={`w-full rounded-2xl border bg-black/20 px-4 py-4 text-left text-sm text-[color:var(--text-secondary)] transition hover:border-white/20 ${
                    selectedTraceId === trace.id || focusedTraceIds.includes(trace.id) ? "border-white/30" : "border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-white">{trace.source}</div>
                    <StatusPill tone={trace.status === "error" ? "warning" : trace.status === "fallback" ? "warning" : "healthy"}>
                      {trace.status}
                    </StatusPill>
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    {trace.id}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div>character: {trace.characterId ?? "n/a"}</div>
                    <div>conversation: {trace.conversationId ?? "n/a"}</div>
                    <div>created: {trace.createdAt}</div>
                  </div>
                </button>
              ))
            ) : (
              <PanelEmpty message="No generation traces yet. Run a dataset or trigger runtime generation first." />
            )}
          </div>
          <div>
            {traceDetailQuery.data ? (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-white">{traceDetailQuery.data.source}</div>
                  <StatusPill tone={traceDetailQuery.data.status === "error" ? "warning" : traceDetailQuery.data.status === "fallback" ? "warning" : "healthy"}>
                    {traceDetailQuery.data.status}
                  </StatusPill>
                </div>
                <div className="grid gap-2">
                  <div>trace: {traceDetailQuery.data.id}</div>
                  <div>character: {traceDetailQuery.data.characterId ?? "n/a"}</div>
                  <div>provider: {traceDetailQuery.data.provider?.model ?? "n/a"}</div>
                  <div>latency: {traceDetailQuery.data.latencyMs ?? 0} ms</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Filter Match</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <TagBadge>
                      scope: {traceScopeFilter}
                    </TagBadge>
                    {traceSource ? (
                      <TagBadge>
                        source: {traceDetailQuery.data.source}
                      </TagBadge>
                    ) : null}
                    {traceStatus ? (
                      <TagBadge>
                        status: {traceDetailQuery.data.status}
                      </TagBadge>
                    ) : null}
                    {traceCharacterId ? (
                      <TagBadge>
                        character: {traceDetailQuery.data.characterId ?? "n/a"}
                      </TagBadge>
                    ) : null}
                    {traceCaseFilter ? (
                      <TagBadge tone="warning">
                        case: {selectedTraceCaseIds.join(", ") || "no linked case"}
                      </TagBadge>
                    ) : null}
                    {traceFailureTagFilter ? (
                      <TagBadge tone="danger">
                        failure tags: {selectedTraceFailureTags.join(", ") || "none"}
                      </TagBadge>
                    ) : null}
                    {focusedCaseId ? (
                      <TagBadge tone="info">
                        focused case: {focusedCaseId}
                      </TagBadge>
                    ) : null}
                    {selectedTraceLinkedRunCases.length > 0 ? (
                      <TagBadge tone="success">
                        selected run: {selectedTraceLinkedRunCases.join(", ")}
                      </TagBadge>
                    ) : null}
                    {selectedTraceComparisonMatches.length > 0 ? (
                      <TagBadge tone="accent">
                        compare role: {selectedTraceComparisonMatches.join(", ")}
                      </TagBadge>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Prompt Messages</div>
                  <div className="mt-2 space-y-2">
                    {traceDetailQuery.data.input.promptMessages.map((message, index) => (
                      <div key={`${message.role}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{message.role}</div>
                        <div className="mt-2 whitespace-pre-wrap break-words leading-6 text-white">{message.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Output</div>
                  <div className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/20 p-3 text-white">
                    {traceDetailQuery.data.output.normalizedOutput ??
                      traceDetailQuery.data.output.rawOutput ??
                      traceDetailQuery.data.output.errorMessage ??
                      "empty"}
                  </div>
                </div>
              </div>
            ) : (
              <PanelEmpty message="Select a trace to inspect prompt messages, filter matches, and normalized output." />
            )}
          </div>
          <div>
            {traceDetailQuery.data ? (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Trace Context</div>
                <div className="grid gap-3">
                  <SnapshotPanel title="Request Config" value={traceDetailQuery.data.input.requestConfig} />
                  <SnapshotPanel title="World Context Snapshot" value={traceDetailQuery.data.input.worldContextSnapshot} />
                  <SnapshotPanel title="Activity Snapshot" value={traceDetailQuery.data.input.activitySnapshot} />
                  <SnapshotPanel title="Memory Snapshot" value={traceDetailQuery.data.input.memorySnapshot} />
                </div>
                {traceDetailQuery.data.evaluationSummary ? (
                  <>
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Evaluation Summary</div>
                    <div className="grid gap-3">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Scores</div>
                        <div className="mt-2 space-y-2">
                          {traceDetailQuery.data.evaluationSummary.scores.map((score) => (
                            <div key={score.key} className="flex items-center justify-between gap-3">
                              <div className="text-white">{score.label}</div>
                              <div className="text-[color:var(--text-secondary)]">{score.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Failure Tags</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {traceDetailQuery.data.evaluationSummary.failureTags.length > 0 ? (
                            traceDetailQuery.data.evaluationSummary.failureTags.map((tag) => (
                              <TagBadge key={tag.key} tone="warning">
                                {tag.label}
                                {typeof tag.count === "number" ? ` · ${tag.count}` : ""}
                              </TagBadge>
                            ))
                          ) : (
                            <span className="text-[color:var(--text-secondary)]">none</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
                {runDetailQuery.data ? (
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Linked Cases</div>
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
                      <span className="text-[color:var(--text-secondary)]">none in selected run</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <PanelEmpty message="Select a trace to inspect snapshots, evaluation summary, and linked cases." />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function readInitialEvalsState(): EvalsViewState {
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
  if (typeof window === "undefined") {
    return fallback;
  }

  let persisted = fallback;
  try {
    const raw = window.localStorage.getItem(EVALS_STATE_KEY);
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

function setQueryParam(params: URLSearchParams, key: string, value: string | null) {
  if (!value) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}
