import { useEffect, useMemo, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";

type MessageDescriptor = ReturnType<typeof msg>;
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  NeedDiscoveryCandidateRecord,
  NeedDiscoveryConfig,
  NeedDiscoveryRunRecord,
  ShakeDiscoveryConfig,
  ShakeDiscoverySessionRecord,
} from "@yinjie/contracts";
import {
  DEFAULT_SHAKE_DISCOVERY_CONFIG,
  runSchedulerJob,
  SHAKE_DISCOVERY_CONFIG_KEY,
  SHAKE_DISCOVERY_SESSIONS_KEY,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminCodeBlock,
  AdminEmptyState,
  AdminMiniPanel,
  AdminPageHero,
  AdminSectionHeader,
  AdminSubpanel,
  AdminTabs,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { formatAdminDateTime as formatLocalizedDateTime } from "../lib/format";

type NeedDiscoveryView = "overview" | "candidates" | "config" | "shake";
type CandidateDatasetKey = "active" | "recent";
type CandidateStatusFilter = "all" | NeedDiscoveryCandidateRecord["status"];
type CandidateCadenceFilter =
  | "all"
  | NeedDiscoveryCandidateRecord["cadenceType"];
type RunCadenceFilter = "all" | NeedDiscoveryRunRecord["cadenceType"];
type ConfigPanelKey = "short" | "daily" | "shared";
type ShakePanelKey = "sessions" | "config";
type ShakeStatusFilter = "all" | ShakeDiscoverySessionRecord["status"];
type ShakeTraceTab = "planning" | "generation";
type NeedDiscoveryJob =
  | "discover_need_characters_short_interval"
  | "discover_need_characters_daily";

const NEED_DISCOVERY_NOTICES: Record<NeedDiscoveryJob, string> = {
  discover_need_characters_short_interval: "短周期需求发现已执行。", // i18n-ignore-line
  discover_need_characters_daily: "每日需求发现已执行。", // i18n-ignore-line
};

const WORKSPACE_TABS: Array<{ key: NeedDiscoveryView; label: MessageDescriptor }> = [
  { key: "overview", label: msg`总览` },
  { key: "candidates", label: msg`候选处理` },
  { key: "config", label: msg`规则配置` },
  { key: "shake", label: msg`摇一摇` },
];

const CONFIG_TABS: Array<{ key: ConfigPanelKey; label: MessageDescriptor }> = [
  { key: "short", label: msg`短周期` },
  { key: "daily", label: msg`每日` },
  { key: "shared", label: msg`共享约束` },
];

const SHAKE_TABS: Array<{ key: ShakePanelKey; label: MessageDescriptor }> = [
  { key: "sessions", label: msg`Session` },
  { key: "config", label: msg`配置` },
];

const SHAKE_TRACE_TABS: Array<{ key: ShakeTraceTab; label: MessageDescriptor }> = [
  { key: "planning", label: msg`方向规划 Prompt` },
  { key: "generation", label: msg`角色生成 Prompt` },
];

const CANDIDATE_STATUS_OPTIONS: Array<{
  value: CandidateStatusFilter;
  label: MessageDescriptor;
}> = [
  { value: "all", label: msg`全部` },
  { value: "draft", label: msg`草稿` },
  { value: "friend_request_pending", label: msg`待通过` },
  { value: "accepted", label: msg`已接受` },
  { value: "declined", label: msg`已拒绝` },
  { value: "expired", label: msg`已过期` },
  { value: "deleted", label: msg`已删除` },
  { value: "generation_failed", label: msg`生成失败` },
];

const SHAKE_STATUS_OPTIONS: Array<{
  value: ShakeStatusFilter;
  label: MessageDescriptor;
}> = [
  { value: "all", label: msg`全部` },
  { value: "preview_ready", label: msg`待决定` },
  { value: "kept", label: msg`已保留` },
  { value: "dismissed", label: msg`已跳过` },
  { value: "expired", label: msg`已过期` },
  { value: "failed", label: msg`生成失败` },
  { value: "generating", label: msg`生成中` },
];

export function NeedDiscoveryPage() {
  const t = translateRuntimeMessage;
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({
    queryKey: ["admin-need-discovery", baseUrl],
    queryFn: () => adminApi.getNeedDiscoveryOverview(),
  });
  const shakeStoreQuery = useQuery({
    queryKey: ["admin-shake-discovery-store", baseUrl],
    queryFn: () => adminApi.getConfig(),
  });

  const serverShakeConfig = useMemo(
    () =>
      shakeStoreQuery.data
        ? parseShakeDiscoveryConfig(
            shakeStoreQuery.data[SHAKE_DISCOVERY_CONFIG_KEY],
          )
        : null,
    [shakeStoreQuery.data],
  );

  const shakeSessions = useMemo(
    () =>
      parseShakeDiscoverySessions(
        shakeStoreQuery.data?.[SHAKE_DISCOVERY_SESSIONS_KEY],
      ),
    [shakeStoreQuery.data],
  );

  const [draft, setDraft] = useState<NeedDiscoveryConfig | null>(null);
  const [shakeDraft, setShakeDraft] = useState<ShakeDiscoveryConfig | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<NeedDiscoveryView>("overview");
  const [configPanel, setConfigPanel] = useState<ConfigPanelKey>("short");
  const [shakePanel, setShakePanel] = useState<ShakePanelKey>("sessions");
  const [shakeTraceTab, setShakeTraceTab] = useState<ShakeTraceTab>("planning");

  const [candidateDataset, setCandidateDataset] =
    useState<CandidateDatasetKey>("active");
  const [candidateStatusFilter, setCandidateStatusFilter] =
    useState<CandidateStatusFilter>("all");
  const [candidateCadenceFilter, setCandidateCadenceFilter] =
    useState<CandidateCadenceFilter>("all");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );

  const [runCadenceFilter, setRunCadenceFilter] =
    useState<RunCadenceFilter>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [shakeStatusFilter, setShakeStatusFilter] =
    useState<ShakeStatusFilter>("all");
  const [selectedShakeSessionId, setSelectedShakeSessionId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!draft && overviewQuery.data?.config) {
      setDraft(overviewQuery.data.config);
    }
  }, [draft, overviewQuery.data]);

  useEffect(() => {
    if (!shakeDraft && serverShakeConfig) {
      setShakeDraft(serverShakeConfig);
    }
  }, [serverShakeConfig, shakeDraft]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(""), 2600); // i18n-ignore-line: clear
    return () => window.clearTimeout(timer);
  }, [notice]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const [needConfig] = await Promise.all([
        adminApi.setNeedDiscoveryConfig(draft ?? {}),
        adminApi.setConfig(
          SHAKE_DISCOVERY_CONFIG_KEY,
          JSON.stringify(shakeDraft ?? DEFAULT_SHAKE_DISCOVERY_CONFIG),
        ),
      ]);
      return needConfig;
    },
    onSuccess: async (config) => {
      setDraft(config);
      setNotice(t(msg`需求发现与摇一摇配置已保存。`));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-need-discovery", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-shake-discovery-store", baseUrl],
        }),
      ]);
    },
  });

  const runMutation = useMutation({
    mutationFn: (jobId: NeedDiscoveryJob) => runSchedulerJob(jobId, baseUrl),
    onSuccess: async (_, jobId) => {
      setNotice(NEED_DISCOVERY_NOTICES[jobId]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-need-discovery", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-scheduler-status", baseUrl],
        }),
      ]);
    },
  });

  const allRuns = useMemo(
    () => overviewQuery.data?.recentRuns ?? [],
    [overviewQuery.data?.recentRuns],
  );
  const activeCandidates = useMemo(
    () => overviewQuery.data?.activeCandidates ?? [],
    [overviewQuery.data?.activeCandidates],
  );
  const recentCandidates = useMemo(
    () => overviewQuery.data?.recentCandidates ?? [],
    [overviewQuery.data?.recentCandidates],
  );
  const latestRun = allRuns[0] ?? null;

  const selectedCandidateSource =
    candidateDataset === "active" ? activeCandidates : recentCandidates;

  const filteredCandidates = useMemo(
    () =>
      sortCandidates(
        selectedCandidateSource.filter((candidate) => {
          if (
            candidateStatusFilter !== "all" &&
            candidate.status !== candidateStatusFilter
          ) {
            return false;
          }
          if (
            candidateCadenceFilter !== "all" &&
            candidate.cadenceType !== candidateCadenceFilter
          ) {
            return false;
          }
          return true;
        }),
      ),
    [candidateCadenceFilter, candidateStatusFilter, selectedCandidateSource],
  );

  const filteredRuns = useMemo(
    () =>
      allRuns.filter((run) =>
        runCadenceFilter === "all"
          ? true
          : run.cadenceType === runCadenceFilter,
      ),
    [allRuns, runCadenceFilter],
  );

  const filteredShakeSessions = useMemo(
    () =>
      shakeSessions.filter((session) =>
        shakeStatusFilter === "all"
          ? true
          : session.status === shakeStatusFilter,
      ),
    [shakeSessions, shakeStatusFilter],
  );

  useEffect(() => {
    if (!filteredCandidates.length) {
      setSelectedCandidateId(null);
      return;
    }

    setSelectedCandidateId((current) =>
      current && filteredCandidates.some((item) => item.id === current)
        ? current
        : filteredCandidates[0].id,
    );
  }, [filteredCandidates]);

  useEffect(() => {
    if (!filteredShakeSessions.length) {
      setSelectedShakeSessionId(null);
      return;
    }

    setSelectedShakeSessionId((current) =>
      current && filteredShakeSessions.some((item) => item.id === current)
        ? current
        : filteredShakeSessions[0].id,
    );
  }, [filteredShakeSessions]);

  useEffect(() => {
    const relatedRunId =
      filteredCandidates.find((item) => item.id === selectedCandidateId)
        ?.runId ?? null;
    const selectionPool = filteredRuns.length ? filteredRuns : allRuns;

    if (!selectionPool.length) {
      setSelectedRunId(null);
      return;
    }

    setSelectedRunId((current) => {
      if (current && allRuns.some((run) => run.id === current)) {
        return current;
      }
      if (relatedRunId && allRuns.some((run) => run.id === relatedRunId)) {
        return relatedRunId;
      }
      return selectionPool[0].id;
    });
  }, [allRuns, filteredCandidates, filteredRuns, selectedCandidateId]);

  const selectedCandidate =
    filteredCandidates.find((item) => item.id === selectedCandidateId) ?? null;
  const selectedRun =
    allRuns.find((item) => item.id === selectedRunId) ??
    (selectedCandidate?.runId
      ? (allRuns.find((item) => item.id === selectedCandidate.runId) ?? null)
      : null) ??
    filteredRuns[0] ??
    null;
  const selectedShakeSession =
    filteredShakeSessions.find((item) => item.id === selectedShakeSessionId) ??
    null;

  const candidateStatusCounts = useMemo(
    () => buildCandidateStatusCounts(selectedCandidateSource),
    [selectedCandidateSource],
  );
  const shakeStatusCounts = useMemo(
    () => buildShakeStatusCounts(shakeSessions),
    [shakeSessions],
  );

  const expiringSoonCount = activeCandidates.filter((item) =>
    isWithinHours(item.expiresAt, 24),
  ).length;
  const enabledCadenceCount =
    Number(draft?.shortInterval.enabled ?? false) +
    Number(draft?.daily.enabled ?? false);
  const hasUnsavedNeedConfig = Boolean(
    draft &&
    overviewQuery.data?.config &&
    !isSameSerialized(draft, overviewQuery.data.config),
  );
  const hasUnsavedShakeConfig = Boolean(
    shakeDraft &&
    serverShakeConfig &&
    !isSameSerialized(shakeDraft, serverShakeConfig),
  );
  const hasUnsavedChanges = hasUnsavedNeedConfig || hasUnsavedShakeConfig;
  const queueOccupancy = draft
    ? `${activeCandidates.length}/${draft.shared.pendingCandidateLimit}`
    : "0/0";
  const shakePendingCount = shakeStatusCounts.preview_ready;
  const metrics = [
    { label: t(msg`候选池`), value: queueOccupancy },
    {
      label: t(msg`最新运行`),
      value: latestRun
        ? `${formatCadenceLabel(latestRun.cadenceType)} · ${labelForRun(
            latestRun.status,
          )}`
        : t(msg`暂无`),
    },
    { label: t(msg`24h 将过期`), value: expiringSoonCount },
    { label: t(msg`摇一摇待决定`), value: shakePendingCount },
  ];

  const openCandidateQueue = (status?: CandidateStatusFilter) => {
    setView("candidates");
    setCandidateDataset("active");
    if (status) {
      setCandidateStatusFilter(status);
    }
  };

  const openRunWorkspace = (cadence?: RunCadenceFilter) => {
    setView("candidates");
    if (cadence) {
      setRunCadenceFilter(cadence);
    }
  };

  const openConfigWorkspace = (panel?: ConfigPanelKey) => {
    setView("config");
    if (panel) {
      setConfigPanel(panel);
    }
  };

  const openShakeWorkspace = (
    panel: ShakePanelKey = "sessions",
    status?: ShakeStatusFilter,
  ) => {
    setView("shake");
    setShakePanel(panel);
    if (status) {
      setShakeStatusFilter(status);
    }
  };

  const primaryCandidateStatus = pickPriorityCandidateStatus(activeCandidates);
  const todayActions = buildTodayActions({
    draft,
    hasUnsavedChanges,
    latestRun,
    activeCandidates,
    expiringSoonCount,
    shakePendingCount,
    primaryCandidateStatus,
    openCandidateQueue,
    openConfigWorkspace,
    openRunWorkspace,
    openShakeWorkspace,
  });

  const resetDrafts = () => {
    if (overviewQuery.data?.config) {
      setDraft(overviewQuery.data.config);
    }
    if (serverShakeConfig) {
      setShakeDraft(serverShakeConfig);
    }
    setNotice(t(msg`已恢复为服务端当前配置。`));
  };

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <LoadingBlock label={t(msg`正在读取需求发现配置...`)} />;
  }

  if (overviewQuery.isError && overviewQuery.error instanceof Error) {
    return <ErrorBlock message={overviewQuery.error.message} />;
  }

  if (shakeStoreQuery.isError && shakeStoreQuery.error instanceof Error) {
    return <ErrorBlock message={shakeStoreQuery.error.message} />;
  }

  if (!overviewQuery.data || !draft || !shakeDraft) {
    return <LoadingBlock label={t(msg`正在读取需求发现与摇一摇配置...`)} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow={t(msg`需求发现`)}
        title={t(msg`角色缺口识别与自动加友`)}
        description={t(msg`把今日排查、候选处理、规则调整和摇一摇检查拆成独立工作模式。先切到当下要做的那一件事，再进入详情，不再在长页里来回找。`)}
        metrics={metrics}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                runMutation.mutate("discover_need_characters_short_interval")
              }
              disabled={runMutation.isPending}
            >
              {t(msg`立即跑短周期`)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                runMutation.mutate("discover_need_characters_daily")
              }
              disabled={runMutation.isPending}
            >
              {t(msg`立即跑每日`)}
            </Button>
          </>
        }
      />

      {notice ? (
        <Card className="border border-emerald-200 bg-emerald-50/80 text-sm text-emerald-700">
          {notice}
        </Card>
      ) : null}
      {saveMutation.error instanceof Error ? (
        <ErrorBlock message={saveMutation.error.message} />
      ) : null}
      {runMutation.error instanceof Error ? (
        <ErrorBlock message={runMutation.error.message} />
      ) : null}

      <WorkspaceToolbar
        view={view}
        onViewChange={setView}
        primaryAction={todayActions[0] ?? null}
        hasUnsavedChanges={hasUnsavedChanges}
        hasUnsavedNeedConfig={hasUnsavedNeedConfig}
        hasUnsavedShakeConfig={hasUnsavedShakeConfig}
        onSave={() => saveMutation.mutate()}
        onReset={resetDrafts}
        saveDisabled={!hasUnsavedChanges || saveMutation.isPending}
        resetDisabled={!hasUnsavedChanges}
      />

      {view === "overview" ? (
        <OverviewWorkspace
          draft={draft}
          latestRun={latestRun}
          activeCandidates={activeCandidates}
          recentCandidates={recentCandidates}
          shakeSessions={shakeSessions}
          candidateStatusCounts={buildCandidateStatusCounts(activeCandidates)}
          shakeStatusCounts={shakeStatusCounts}
          expiringSoonCount={expiringSoonCount}
          queueOccupancy={queueOccupancy}
          enabledCadenceCount={enabledCadenceCount}
          todayActions={todayActions}
          openCandidateQueue={openCandidateQueue}
          openConfigWorkspace={openConfigWorkspace}
          openRunWorkspace={openRunWorkspace}
          openShakeWorkspace={openShakeWorkspace}
        />
      ) : null}

      {view === "candidates" ? (
        <CandidatesWorkspace
          dataset={candidateDataset}
          onDatasetChange={setCandidateDataset}
          statusFilter={candidateStatusFilter}
          onStatusFilterChange={setCandidateStatusFilter}
          cadenceFilter={candidateCadenceFilter}
          onCadenceFilterChange={setCandidateCadenceFilter}
          sourceCount={selectedCandidateSource.length}
          filteredCandidates={filteredCandidates}
          selectedCandidateId={selectedCandidateId}
          onSelectCandidate={setSelectedCandidateId}
          selectedCandidate={selectedCandidate}
          candidateStatusCounts={candidateStatusCounts}
          relatedRun={
            selectedCandidate?.runId
              ? (allRuns.find((run) => run.id === selectedCandidate.runId) ??
                null)
              : null
          }
          onOpenRelatedRun={(runId) => setSelectedRunId(runId)}
          runCadenceFilter={runCadenceFilter}
          onRunCadenceFilterChange={setRunCadenceFilter}
          runs={filteredRuns}
          selectedRun={selectedRun}
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
          expiringSoonCount={expiringSoonCount}
        />
      ) : null}

      {view === "config" ? (
        <ConfigWorkspace
          panel={configPanel}
          onPanelChange={setConfigPanel}
          draft={draft}
          onChange={setDraft}
          hasUnsavedNeedConfig={hasUnsavedNeedConfig}
          hasUnsavedShakeConfig={hasUnsavedShakeConfig}
        />
      ) : null}

      {view === "shake" ? (
        <ShakeWorkspace
          panel={shakePanel}
          onPanelChange={setShakePanel}
          traceTab={shakeTraceTab}
          onTraceTabChange={setShakeTraceTab}
          sessions={filteredShakeSessions}
          allSessions={shakeSessions}
          statusFilter={shakeStatusFilter}
          onStatusFilterChange={setShakeStatusFilter}
          selectedSession={selectedShakeSession}
          selectedSessionId={selectedShakeSessionId}
          onSelectSession={setSelectedShakeSessionId}
          config={shakeDraft}
          onConfigChange={setShakeDraft}
          statusCounts={shakeStatusCounts}
        />
      ) : null}
    </div>
  );
}

function WorkspaceToolbar({
  view,
  onViewChange,
  primaryAction,
  hasUnsavedChanges,
  hasUnsavedNeedConfig,
  hasUnsavedShakeConfig,
  onSave,
  onReset,
  saveDisabled,
  resetDisabled,
}: {
  view: NeedDiscoveryView;
  onViewChange: (view: NeedDiscoveryView) => void;
  primaryAction: TodayAction | null;
  hasUnsavedChanges: boolean;
  hasUnsavedNeedConfig: boolean;
  hasUnsavedShakeConfig: boolean;
  onSave: () => void;
  onReset: () => void;
  saveDisabled: boolean;
  resetDisabled: boolean;
}) {
  const t = translateRuntimeMessage;
  return (
    <Card className="sticky top-24 z-20 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,249,241,0.95),rgba(240,253,246,0.92))]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              {t(msg`当前优先动作`)}
            </div>
            <StatusPill tone={hasUnsavedChanges ? "warning" : "healthy"}>
              {hasUnsavedChanges ? t(msg`有未保存改动`) : t(msg`可直接按线上状态排查`)}
            </StatusPill>
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-primary)]">
            {primaryAction?.title ?? t(msg`当前无阻塞项`)}
          </div>
          <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
            {primaryAction?.description ??
              t(msg`候选、规则和摇一摇都处于可控状态，可以进入任意工作模式细看。`)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {hasUnsavedNeedConfig ? (
              <StatusPill tone="warning">{t(msg`自动补位规则待保存`)}</StatusPill>
            ) : (
              <StatusPill tone="healthy">{t(msg`自动补位规则已同步`)}</StatusPill>
            )}
            {hasUnsavedShakeConfig ? (
              <StatusPill tone="warning">{t(msg`摇一摇规则待保存`)}</StatusPill>
            ) : (
              <StatusPill tone="muted">{t(msg`摇一摇规则未改动`)}</StatusPill>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {primaryAction ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={primaryAction.onClick}
            >
              {primaryAction.actionLabel}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={resetDisabled}
          >
            {t(msg`恢复服务端当前值`)}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={saveDisabled}
          >
            {t(msg`保存全部配置`)}
          </Button>
        </div>
      </div>

      <AdminTabs
        tabs={WORKSPACE_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
        activeKey={view}
        onChange={(key) => onViewChange(key as NeedDiscoveryView)}
        className="mt-4"
      />
    </Card>
  );
}

type TodayAction = {
  key: string;
  title: string;
  description: string;
  actionLabel: string;
  tone: "warning" | "info" | "success";
  onClick: () => void;
};

function OverviewWorkspace({
  draft,
  latestRun,
  activeCandidates,
  recentCandidates,
  shakeSessions,
  candidateStatusCounts,
  shakeStatusCounts,
  expiringSoonCount,
  queueOccupancy,
  enabledCadenceCount,
  todayActions,
  openCandidateQueue,
  openConfigWorkspace,
  openRunWorkspace,
  openShakeWorkspace,
}: {
  draft: NeedDiscoveryConfig;
  latestRun: NeedDiscoveryRunRecord | null;
  activeCandidates: NeedDiscoveryCandidateRecord[];
  recentCandidates: NeedDiscoveryCandidateRecord[];
  shakeSessions: ShakeDiscoverySessionRecord[];
  candidateStatusCounts: Record<NeedDiscoveryCandidateRecord["status"], number>;
  shakeStatusCounts: Record<ShakeDiscoverySessionRecord["status"], number>;
  expiringSoonCount: number;
  queueOccupancy: string;
  enabledCadenceCount: number;
  todayActions: TodayAction[];
  openCandidateQueue: (status?: CandidateStatusFilter) => void;
  openConfigWorkspace: (panel?: ConfigPanelKey) => void;
  openRunWorkspace: (cadence?: RunCadenceFilter) => void;
  openShakeWorkspace: (
    panel?: ShakePanelKey,
    status?: ShakeStatusFilter,
  ) => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <div className="space-y-6">
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title={t(msg`今天先做什么`)}
          actions={
            <StatusPill
              tone={
                todayActions.some((item) => item.tone === "warning")
                  ? "warning"
                  : "healthy"
              }
            >
              {todayActions.some((item) => item.tone === "warning")
                ? t(msg`先处理阻塞`)
                : t(msg`状态平稳`)}
            </StatusPill>
          }
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {todayActions.slice(0, 2).map((action) => (
            <OverviewActionCard key={action.key} action={action} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          label={t(msg`候选池`)}
          value={queueOccupancy}
          detail={t(msg`待处理候选过多会压住新补位。`)}
          meta={
            <StatusPill
              tone={
                activeCandidates.length >= draft.shared.pendingCandidateLimit
                  ? "warning"
                  : "healthy"
              }
            >
              {Math.round(
                (activeCandidates.length /
                  Math.max(draft.shared.pendingCandidateLimit, 1)) *
                  100,
              )}
              %
            </StatusPill>
          }
        />
        <MetricCard
          label={t(msg`最新运行`)}
          value={
            latestRun
              ? `${formatCadenceLabel(latestRun.cadenceType)} · ${labelForRun(
                  latestRun.status,
                )}`
              : t(msg`暂无`)
          }
          detail={
            latestRun
              ? `${formatCompactDateTime(latestRun.startedAt)} · 信号 ${latestRun.signalCount} 条` // i18n-ignore-line
              : t(msg`等待首次调度。`)
          }
          meta={
            latestRun ? (
              <StatusPill tone={toneForRun(latestRun.status)}>
                {labelForRun(latestRun.status)}
              </StatusPill>
            ) : undefined
          }
        />
        <MetricCard
          label={t(msg`24h 将过期`)}
          value={expiringSoonCount}
          detail={t(msg`优先清掉将过期且仍待通过的候选。`)}
        />
        <MetricCard
          label={t(msg`摇一摇待决定`)}
          value={shakeStatusCounts.preview_ready}
          detail={`已保留 ${shakeStatusCounts.kept} · 最近 ${shakeSessions.length}`} // i18n-ignore-line
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
        <CadenceOverviewCard
          draft={draft}
          latestRun={latestRun}
          enabledCadenceCount={enabledCadenceCount}
          onOpenConfigWorkspace={openConfigWorkspace}
          onOpenRunWorkspace={openRunWorkspace}
        />
        <HealthOverviewCard
          activeCandidates={activeCandidates}
          recentCandidates={recentCandidates}
          candidateStatusCounts={candidateStatusCounts}
          shakeStatusCounts={shakeStatusCounts}
          onOpenCandidateQueue={openCandidateQueue}
          onOpenShakeWorkspace={openShakeWorkspace}
        />
      </div>
    </div>
  );
}

function OverviewActionCard({ action }: { action: TodayAction }) {
  const t = translateRuntimeMessage;
  return (
    <div
      className={[
        "rounded-[24px] border p-4 shadow-[var(--shadow-soft)]",
        action.tone === "warning"
          ? "border-amber-200 bg-[linear-gradient(160deg,rgba(255,251,235,0.98),rgba(255,243,219,0.92))]"
          : action.tone === "success"
            ? "border-emerald-200 bg-[linear-gradient(160deg,rgba(236,253,245,0.98),rgba(220,252,231,0.92))]"
            : "border-sky-200 bg-[linear-gradient(160deg,rgba(239,246,255,0.98),rgba(224,242,254,0.92))]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          {action.title}
        </div>
        <StatusPill
          tone={
            action.tone === "warning"
              ? "warning"
              : action.tone === "success"
                ? "healthy"
                : "muted"
          }
        >
          {action.tone === "warning"
            ? t(msg`优先`)
            : action.tone === "success"
              ? t(msg`稳定`)
              : t(msg`查看`)}
        </StatusPill>
      </div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
        {action.description}
      </div>
      <Button
        variant={action.tone === "warning" ? "primary" : "secondary"}
        size="sm"
        className="mt-4"
        onClick={action.onClick}
      >
        {action.actionLabel}
      </Button>
    </div>
  );
}

function CadenceOverviewCard({
  draft,
  latestRun,
  enabledCadenceCount,
  onOpenConfigWorkspace,
  onOpenRunWorkspace,
}: {
  draft: NeedDiscoveryConfig;
  latestRun: NeedDiscoveryRunRecord | null;
  enabledCadenceCount: number;
  onOpenConfigWorkspace: (panel?: ConfigPanelKey) => void;
  onOpenRunWorkspace: (cadence?: RunCadenceFilter) => void;
}) {
  const t = translateRuntimeMessage;
  const shortLatest =
    latestRun?.cadenceType === "short_interval" ? latestRun : null;
  const dailyLatest = latestRun?.cadenceType === "daily" ? latestRun : null;

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`自动补位概览`)}
        actions={
          <StatusPill tone={enabledCadenceCount === 0 ? "warning" : "healthy"}>
            {`${enabledCadenceCount}/2 ${t(msg`节奏开启`)}`}
          </StatusPill>
        }
      />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SummaryButtonCard
          title={t(msg`短周期补位`)}
          detail={`${
            draft.shortInterval.enabled ? t(msg`启用中`) : t(msg`已停用`)
          } · ${formatExecutionMode(draft.shortInterval.executionMode)}`}
          meta={`每 ${draft.shortInterval.intervalMinutes} 分钟 · 回看 ${draft.shortInterval.lookbackHours} 小时`} // i18n-ignore-line
          actionLabel={t(msg`查看短周期规则`)}
          onClick={() => onOpenConfigWorkspace("short")}
          tone={draft.shortInterval.enabled ? "healthy" : "warning"}
        />
        <SummaryButtonCard
          title={t(msg`每日补位`)}
          detail={`${
            draft.daily.enabled ? t(msg`启用中`) : t(msg`已停用`)
          } · ${formatExecutionMode(draft.daily.executionMode)}`}
          meta={t(msg`每天 ${padNumber(draft.daily.runAtHour)}:${padNumber(draft.daily.runAtMinute)} · 回看 ${draft.daily.lookbackDays} 天`)}
          actionLabel={t(msg`查看每日规则`)}
          onClick={() => onOpenConfigWorkspace("daily")}
          tone={draft.daily.enabled ? "healthy" : "warning"}
        />
        <SummaryButtonCard
          title={t(msg`共享约束`)}
          detail={`队列 ${draft.shared.pendingCandidateLimit} · 每日创建 ${draft.shared.dailyCreationLimit}`} // i18n-ignore-line
          meta={`抑制期 ${draft.shared.shortSuppressionDays}/${draft.shared.dailySuppressionDays} 天 · 风险域 ${formatRiskDomains( // i18n-ignore-line
            draft.shared.allowMedical,
            draft.shared.allowLegal,
            draft.shared.allowFinance,
          )}`}
          actionLabel={t(msg`查看共享约束`)}
          onClick={() => onOpenConfigWorkspace("shared")}
          tone="muted"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onOpenRunWorkspace("short_interval")}
          className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-white/90"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              {t(msg`最近短周期运行`)}
            </div>
            <StatusPill tone={toneForRun(shortLatest?.status ?? "skipped")}>
              {shortLatest ? labelForRun(shortLatest.status) : t(msg`暂无`)}
            </StatusPill>
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {shortLatest
              ? `${formatCompactDateTime(shortLatest.startedAt)} · 信号 ${shortLatest.signalCount} 条` // i18n-ignore-line
              : t(msg`还没有短周期 recent run。`)}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onOpenRunWorkspace("daily")}
          className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-white/90"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              {t(msg`最近每日运行`)}
            </div>
            <StatusPill tone={toneForRun(dailyLatest?.status ?? "skipped")}>
              {dailyLatest ? labelForRun(dailyLatest.status) : t(msg`暂无`)}
            </StatusPill>
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {dailyLatest
              ? `${formatCompactDateTime(dailyLatest.startedAt)} · 信号 ${dailyLatest.signalCount} 条` // i18n-ignore-line
              : t(msg`还没有每日 recent run。`)}
          </div>
        </button>
      </div>
    </Card>
  );
}

function HealthOverviewCard({
  activeCandidates,
  recentCandidates,
  candidateStatusCounts,
  shakeStatusCounts,
  onOpenCandidateQueue,
  onOpenShakeWorkspace,
}: {
  activeCandidates: NeedDiscoveryCandidateRecord[];
  recentCandidates: NeedDiscoveryCandidateRecord[];
  candidateStatusCounts: Record<NeedDiscoveryCandidateRecord["status"], number>;
  shakeStatusCounts: Record<ShakeDiscoverySessionRecord["status"], number>;
  onOpenCandidateQueue: (status?: CandidateStatusFilter) => void;
  onOpenShakeWorkspace: (
    panel?: ShakePanelKey,
    status?: ShakeStatusFilter,
  ) => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader title={t(msg`当前处理压力`)} />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SummaryButtonCard
          title={t(msg`待通过候选`)}
          detail={`${candidateStatusCounts.friend_request_pending} 条`} // i18n-ignore-line
          meta={t(msg`通常应优先处理，避免长期积压。`)}
          actionLabel={t(msg`打开候选队列`)}
          onClick={() => onOpenCandidateQueue("friend_request_pending")}
          tone={
            candidateStatusCounts.friend_request_pending > 0
              ? "warning"
              : "muted"
          }
        />
        <SummaryButtonCard
          title={t(msg`草稿候选`)}
          detail={`${candidateStatusCounts.draft} 条`} // i18n-ignore-line
          meta={t(msg`适合排查 need 识别质量和草稿阈值。`)}
          actionLabel={t(msg`查看草稿`)}
          onClick={() => onOpenCandidateQueue("draft")}
          tone={candidateStatusCounts.draft > 0 ? "info" : "muted"}
        />
        <SummaryButtonCard
          title={t(msg`生成失败`)}
          detail={`${candidateStatusCounts.generation_failed} 条`} // i18n-ignore-line
          meta={t(msg`优先确认是 Prompt、输入信号还是生成链路异常。`)}
          actionLabel={t(msg`查看失败候选`)}
          onClick={() => onOpenCandidateQueue("generation_failed")}
          tone={
            candidateStatusCounts.generation_failed > 0 ? "warning" : "muted"
          }
        />
        <SummaryButtonCard
          title={t(msg`摇一摇待决定`)}
          detail={`${shakeStatusCounts.preview_ready} 条`} // i18n-ignore-line
          meta={`已保留 ${shakeStatusCounts.kept} · 已过期 ${shakeStatusCounts.expired}`} // i18n-ignore-line
          actionLabel={t(msg`查看 session`)}
          onClick={() => onOpenShakeWorkspace("sessions", "preview_ready")}
          tone={shakeStatusCounts.preview_ready > 0 ? "info" : "muted"}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title={t(msg`当前候选池`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {t(msg`当前候选`)} {activeCandidates.length} {t(msg`条`)}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(msg`最近候选`)} {recentCandidates.length} {t(msg`条`)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`历史结果`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {t(msg`已接受`)} {candidateStatusCounts.accepted} · {t(msg`已拒绝`)}{" "}
            {candidateStatusCounts.declined}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(msg`已过期`)} {candidateStatusCounts.expired} · {t(msg`已删除`)}{" "}
            {candidateStatusCounts.deleted}
          </div>
        </AdminMiniPanel>
      </div>
    </Card>
  );
}

function SummaryButtonCard({
  title,
  detail,
  meta,
  actionLabel,
  onClick,
  tone,
}: {
  title: string;
  detail: string;
  meta: string;
  actionLabel: string;
  onClick: () => void;
  tone: "warning" | "healthy" | "info" | "muted";
}) {
  const t = translateRuntimeMessage;
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          {title}
        </div>
        <StatusPill
          tone={
            tone === "warning"
              ? "warning"
              : tone === "healthy"
                ? "healthy"
                : "muted"
          }
        >
          {tone === "warning"
            ? t(msg`需关注`)
            : tone === "healthy"
              ? t(msg`正常`)
              : tone === "info"
                ? t(msg`查看`)
                : t(msg`概览`)}
        </StatusPill>
      </div>
      <div className="mt-2 text-sm text-[color:var(--text-primary)]">
        {detail}
      </div>
      <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
        {meta}
      </div>
      <Button variant="ghost" size="sm" className="mt-3" onClick={onClick}>
        {actionLabel}
      </Button>
    </div>
  );
}

function CandidatesWorkspace({
  dataset,
  onDatasetChange,
  statusFilter,
  onStatusFilterChange,
  cadenceFilter,
  onCadenceFilterChange,
  sourceCount,
  filteredCandidates,
  selectedCandidateId,
  onSelectCandidate,
  selectedCandidate,
  candidateStatusCounts,
  relatedRun,
  onOpenRelatedRun,
  runCadenceFilter,
  onRunCadenceFilterChange,
  runs,
  selectedRun,
  selectedRunId,
  onSelectRun,
  expiringSoonCount,
}: {
  dataset: CandidateDatasetKey;
  onDatasetChange: (value: CandidateDatasetKey) => void;
  statusFilter: CandidateStatusFilter;
  onStatusFilterChange: (value: CandidateStatusFilter) => void;
  cadenceFilter: CandidateCadenceFilter;
  onCadenceFilterChange: (value: CandidateCadenceFilter) => void;
  sourceCount: number;
  filteredCandidates: NeedDiscoveryCandidateRecord[];
  selectedCandidateId: string | null;
  onSelectCandidate: (id: string) => void;
  selectedCandidate: NeedDiscoveryCandidateRecord | null;
  candidateStatusCounts: Record<NeedDiscoveryCandidateRecord["status"], number>;
  relatedRun: NeedDiscoveryRunRecord | null;
  onOpenRelatedRun: (runId: string) => void;
  runCadenceFilter: RunCadenceFilter;
  onRunCadenceFilterChange: (value: RunCadenceFilter) => void;
  runs: NeedDiscoveryRunRecord[];
  selectedRun: NeedDiscoveryRunRecord | null;
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  expiringSoonCount: number;
}) {
  const t = translateRuntimeMessage;
  return (
    <div className="space-y-6">
      <AdminCallout
        title={t(msg`候选处理工作区`)}
        tone="info"
        description={t(msg`左侧只看候选列表和筛选，右侧只看当前选中候选的完整信息；运行记录收在下方单独处理，避免在一大堆卡片里来回扫。`)}
      />

      <div className="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
        <CandidateQueueCard
          dataset={dataset}
          onDatasetChange={onDatasetChange}
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
          cadenceFilter={cadenceFilter}
          onCadenceFilterChange={onCadenceFilterChange}
          sourceCount={sourceCount}
          filteredCandidates={filteredCandidates}
          selectedCandidateId={selectedCandidateId}
          onSelectCandidate={onSelectCandidate}
          candidateStatusCounts={candidateStatusCounts}
          expiringSoonCount={expiringSoonCount}
        />

        <div className="space-y-6">
          <CandidateInspectorCard
            candidate={selectedCandidate}
            relatedRun={relatedRun}
            onOpenRelatedRun={onOpenRelatedRun}
          />
          <RunsInspectorCard
            cadenceFilter={runCadenceFilter}
            onCadenceFilterChange={onRunCadenceFilterChange}
            runs={runs}
            selectedRun={selectedRun}
            selectedRunId={selectedRunId}
            onSelectRun={onSelectRun}
          />
        </div>
      </div>
    </div>
  );
}

function CandidateQueueCard({
  dataset,
  onDatasetChange,
  statusFilter,
  onStatusFilterChange,
  cadenceFilter,
  onCadenceFilterChange,
  sourceCount,
  filteredCandidates,
  selectedCandidateId,
  onSelectCandidate,
  candidateStatusCounts,
  expiringSoonCount,
}: {
  dataset: CandidateDatasetKey;
  onDatasetChange: (value: CandidateDatasetKey) => void;
  statusFilter: CandidateStatusFilter;
  onStatusFilterChange: (value: CandidateStatusFilter) => void;
  cadenceFilter: CandidateCadenceFilter;
  onCadenceFilterChange: (value: CandidateCadenceFilter) => void;
  sourceCount: number;
  filteredCandidates: NeedDiscoveryCandidateRecord[];
  selectedCandidateId: string | null;
  onSelectCandidate: (id: string) => void;
  candidateStatusCounts: Record<NeedDiscoveryCandidateRecord["status"], number>;
  expiringSoonCount: number;
}) {
  const t = translateRuntimeMessage;
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`候选队列`)}
        actions={
          <StatusPill tone={filteredCandidates.length ? "healthy" : "muted"}>
            {t(msg`筛后`)} {filteredCandidates.length} {t(msg`条`)}
          </StatusPill>
        }
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        <AdminMiniPanel title={t(msg`当前数据源`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {dataset === "active" ? t(msg`当前候选`) : t(msg`最近候选`)}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(msg`共`)} {sourceCount} {t(msg`条`)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`待处理压力`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {t(msg`待通过`)} {candidateStatusCounts.friend_request_pending}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(msg`草稿`)} {candidateStatusCounts.draft} · {t(msg`失败`)}{" "}
            {candidateStatusCounts.generation_failed}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`时效提醒`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            24h {t(msg`将过期`)} {expiringSoonCount}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(msg`需要尽快处理待通过候选。`)}
          </div>
        </AdminMiniPanel>
      </div>

      <div className="mt-4 space-y-4">
        <SelectionBar
          label={t(msg`候选范围`)}
          options={[
            { key: "active", label: t(msg`当前候选`) },
            { key: "recent", label: t(msg`最近候选`) },
          ]}
          activeKey={dataset}
          onChange={(key) => onDatasetChange(key as CandidateDatasetKey)}
        />
        <SelectionBar
          label={t(msg`状态筛选`)}
          options={CANDIDATE_STATUS_OPTIONS.map((option) => ({
            key: option.value,
            label:
              option.value === "all"
                ? `${t(option.label)} ${sourceCount}`
                : `${t(option.label)} ${candidateStatusCounts[option.value] ?? 0}`,
          }))}
          activeKey={statusFilter}
          onChange={(key) => onStatusFilterChange(key as CandidateStatusFilter)}
        />
        <SelectionBar
          label={t(msg`来源 cadence`)}
          options={[
            { key: "all", label: `${t(msg`全部`)} ${sourceCount}` },
            {
              key: "short_interval",
              label: `${t(msg`短周期`)} ${filteredCandidates.filter((item) => item.cadenceType === "short_interval").length}`,
            },
            {
              key: "daily",
              label: `${t(msg`每日`)} ${filteredCandidates.filter((item) => item.cadenceType === "daily").length}`,
            },
          ]}
          activeKey={cadenceFilter}
          onChange={(key) =>
            onCadenceFilterChange(key as CandidateCadenceFilter)
          }
        />
      </div>

      <div className="mt-5 space-y-2">
        {filteredCandidates.length === 0 ? (
          <AdminEmptyState
            title={t(msg`当前筛选下没有候选`)}
            description={t(msg`可以切换状态或范围，也可以先手动执行一次短周期 / 每日调度。`)}
          />
        ) : (
          filteredCandidates.map((candidate) => (
            <CandidateListItem
              key={candidate.id}
              candidate={candidate}
              selected={selectedCandidateId === candidate.id}
              onClick={() => onSelectCandidate(candidate.id)}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function CandidateListItem({
  candidate,
  selected,
  onClick,
}: {
  candidate: NeedDiscoveryCandidateRecord;
  selected: boolean;
  onClick: () => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-[20px] border px-4 py-4 text-left transition",
        selected
          ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] shadow-[var(--shadow-card)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-soft)] hover:border-[color:var(--border-subtle)] hover:bg-white/90",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[color:var(--text-primary)]">
            {candidate.characterName || candidate.needCategory}
          </div>
          <div className="mt-1 truncate text-xs tracking-[0.14em] text-[color:var(--text-muted)]">
            {candidate.needKey}
          </div>
        </div>
        <StatusPill tone={toneForCandidate(candidate.status)}>
          {labelForCandidate(candidate.status)}
        </StatusPill>
      </div>

      <div className="mt-3 line-clamp-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {candidate.coverageGapSummary || t(msg`暂无缺口摘要。`)}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-muted)]">
        <span className="rounded-full border border-[color:var(--border-faint)] bg-white/85 px-2.5 py-1">
          {formatCadenceLabel(candidate.cadenceType)}
        </span>
        <span>P {candidate.priorityScore.toFixed(2)}</span>
        <span>C {candidate.confidenceScore.toFixed(2)}</span>
        <span>{formatCompactDateTime(candidate.createdAt)}</span>
      </div>
    </button>
  );
}

function CandidateInspectorCard({
  candidate,
  relatedRun,
  onOpenRelatedRun,
}: {
  candidate: NeedDiscoveryCandidateRecord | null;
  relatedRun: NeedDiscoveryRunRecord | null;
  onOpenRelatedRun: (runId: string) => void;
}) {
  const t = translateRuntimeMessage;
  if (!candidate) {
    return (
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader title={t(msg`候选详情`)} />
        <div className="mt-4">
          <AdminEmptyState
            title={t(msg`先从左侧选一个候选`)}
            description={t(msg`候选详情会显示完整缺口摘要、证据、好友申请开场以及对应运行。`)}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`候选详情`)}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={toneForCandidate(candidate.status)}>
              {labelForCandidate(candidate.status)}
            </StatusPill>
            <StatusPill tone="muted">
              {formatCadenceLabel(candidate.cadenceType)}
            </StatusPill>
          </div>
        }
      />

      <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">
            {candidate.characterName || candidate.needCategory}
          </div>
          <div className="mt-1 text-xs tracking-[0.16em] text-[color:var(--text-muted)]">
            {candidate.needKey}
          </div>
        </div>
        {relatedRun ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenRelatedRun(relatedRun.id)}
          >
            {t(msg`查看对应运行`)}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title={t(msg`Need 分类`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {candidate.needCategory}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`优先级`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {candidate.priorityScore.toFixed(2)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`置信度`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {candidate.confidenceScore.toFixed(2)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`时效`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {buildCandidateTimingLabel(candidate)}
          </div>
        </AdminMiniPanel>
      </div>

      <AdminCallout
        title={t(msg`缺口摘要`)}
        tone={
          candidate.status === "generation_failed" ||
          candidate.status === "declined" ||
          candidate.status === "expired"
            ? "warning"
            : candidate.status === "friend_request_pending"
              ? "info"
              : "muted"
        }
        className="mt-4"
        description={candidate.coverageGapSummary || t(msg`暂无缺口摘要。`)}
      />

      {candidate.evidenceHighlights.length ? (
        <AdminSubpanel title={t(msg`证据高亮`)} className="mt-4 bg-white/85">
          <div className="flex flex-wrap gap-2">
            {candidate.evidenceHighlights.map((item, index) => (
              <span
                key={`${candidate.id}-evidence-${index}`}
                className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-1 text-xs text-[color:var(--text-secondary)]"
              >
                {item}
              </span>
            ))}
          </div>
        </AdminSubpanel>
      ) : null}

      {candidate.friendRequestGreeting ? (
        <AdminSubpanel
          title={t(msg`好友申请开场`)}
          className="mt-4 bg-white/85"
          contentClassName="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]"
        >
          {candidate.friendRequestGreeting}
        </AdminSubpanel>
      ) : null}

      {relatedRun ? (
        <div className="mt-4 rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              {t(msg`对应运行`)}
            </div>
            <StatusPill tone={toneForRun(relatedRun.status)}>
              {labelForRun(relatedRun.status)}
            </StatusPill>
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {formatCadenceLabel(relatedRun.cadenceType)} ·{" "}
            {formatCompactDateTime(relatedRun.startedAt)} · {t(msg`信号`)}{" "}
            {relatedRun.signalCount} {t(msg`条`)}
          </div>
          <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {relatedRun.summary ||
              relatedRun.skipReason ||
              relatedRun.errorMessage ||
              t(msg`暂无摘要`)}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function RunsInspectorCard({
  cadenceFilter,
  onCadenceFilterChange,
  runs,
  selectedRun,
  selectedRunId,
  onSelectRun,
}: {
  cadenceFilter: RunCadenceFilter;
  onCadenceFilterChange: (value: RunCadenceFilter) => void;
  runs: NeedDiscoveryRunRecord[];
  selectedRun: NeedDiscoveryRunRecord | null;
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`运行详情`)}
        actions={
          <StatusPill tone={runs.length ? "healthy" : "muted"}>
            {runs.length} {t(msg`条`)}
          </StatusPill>
        }
      />

      <div className="mt-4">
        <SelectionBar
          label={t(msg`运行筛选`)}
          options={[
            { key: "all", label: t(msg`全部`) },
            { key: "short_interval", label: t(msg`短周期`) },
            { key: "daily", label: t(msg`每日`) },
          ]}
          activeKey={cadenceFilter}
          onChange={(key) => onCadenceFilterChange(key as RunCadenceFilter)}
        />
      </div>

      {runs.length === 0 ? (
        <div className="mt-4">
          <AdminEmptyState
            title={t(msg`当前筛选下没有运行记录`)}
            description={t(msg`可以切换 cadence，或者先执行一次短周期 / 每日调度。`)}
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-6 xl:grid-cols-[280px,minmax(0,1fr)]">
          <div className="space-y-2">
            {runs.map((run) => (
              <RunListItem
                key={run.id}
                run={run}
                selected={selectedRunId === run.id}
                onClick={() => onSelectRun(run.id)}
              />
            ))}
          </div>

          {selectedRun ? (
            <RunDetailCard run={selectedRun} />
          ) : (
            <AdminEmptyState
              title={t(msg`还没有选中运行`)}
              description={t(msg`从左侧选择一条运行记录后，这里会展示完整摘要和窗口信息。`)}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function RunListItem({
  run,
  selected,
  onClick,
}: {
  run: NeedDiscoveryRunRecord;
  selected: boolean;
  onClick: () => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-[20px] border px-4 py-4 text-left transition",
        selected
          ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] shadow-[var(--shadow-card)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-soft)] hover:border-[color:var(--border-subtle)] hover:bg-white/90",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          {formatCadenceLabel(run.cadenceType)}
        </div>
        <StatusPill tone={toneForRun(run.status)}>
          {labelForRun(run.status)}
        </StatusPill>
      </div>
      <div className="mt-2 text-xs text-[color:var(--text-muted)]">
        {formatCompactDateTime(run.startedAt)}
      </div>
      <div className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {run.summary || run.skipReason || run.errorMessage || t(msg`暂无摘要`)}
      </div>
    </button>
  );
}

function RunDetailCard({ run }: { run: NeedDiscoveryRunRecord }) {
  const t = translateRuntimeMessage;
  return (
    <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-[color:var(--text-primary)]">
              {formatCadenceLabel(run.cadenceType)}
            </div>
            <StatusPill tone={toneForRun(run.status)}>
              {labelForRun(run.status)}
            </StatusPill>
          </div>
          <div className="mt-2 text-xs text-[color:var(--text-muted)]">
            {formatCompactDateTime(run.startedAt)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title={t(msg`信号数`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {run.signalCount} {t(msg`条`)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`信号窗口`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {formatRunWindow(run)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`最近信号`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {formatCompactDateTime(run.latestSignalAt)}
          </div>
        </AdminMiniPanel>
      </div>

      <AdminCallout
        title={t(msg`运行摘要`)}
        tone={run.status === "failed" ? "warning" : "muted"}
        className="mt-4"
        description={
          run.summary || run.skipReason || run.errorMessage || t(msg`暂无摘要`)
        }
      />

      <AdminSubpanel title={t(msg`命中 need key`)} className="mt-4 bg-white/85">
        {run.selectedNeedKeys.length ? (
          <div className="flex flex-wrap gap-2">
            {run.selectedNeedKeys.map((item) => (
              <span
                key={item}
                className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-1 text-xs text-[color:var(--text-secondary)]"
              >
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[color:var(--text-secondary)]">
            {t(msg`没有选中 need key。`)}
          </div>
        )}
      </AdminSubpanel>

      {run.errorMessage ? (
        <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-700">
          {run.errorMessage}
        </div>
      ) : null}
    </div>
  );
}

function ConfigWorkspace({
  panel,
  onPanelChange,
  draft,
  onChange,
  hasUnsavedNeedConfig,
  hasUnsavedShakeConfig,
}: {
  panel: ConfigPanelKey;
  onPanelChange: (panel: ConfigPanelKey) => void;
  draft: NeedDiscoveryConfig;
  onChange: (next: NeedDiscoveryConfig) => void;
  hasUnsavedNeedConfig: boolean;
  hasUnsavedShakeConfig: boolean;
}) {
  const t = translateRuntimeMessage;
  return (
    <div className="space-y-6">
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title={t(msg`规则配置工作区`)}
          actions={
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={hasUnsavedNeedConfig ? "warning" : "healthy"}>
                自动补位 {hasUnsavedNeedConfig ? t(msg`待保存`) : t(msg`已同步`)}
              </StatusPill>
              <StatusPill tone={hasUnsavedShakeConfig ? "warning" : "muted"}>
                摇一摇 {hasUnsavedShakeConfig ? t(msg`待保存`) : t(msg`未改动`)}
              </StatusPill>
            </div>
          }
        />
        <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
          {t(msg`一次只编辑一组规则。先选短周期、每日或共享约束，再进入当前组的详细字段和 Prompt，避免在多组长表单间来回跳。`)}
        </p>
        <AdminTabs
          tabs={CONFIG_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
          activeKey={panel}
          onChange={(key) => onPanelChange(key as ConfigPanelKey)}
          className="mt-4"
        />
      </Card>

      {panel === "short" ? (
        <CadenceCard
          title={t(msg`短周期策略`)}
          description={t(msg`更看重最近一段时间的压力、症状、即时求助信号。`)}
          cadenceType="short"
          config={draft}
          onChange={onChange}
        />
      ) : null}

      {panel === "daily" ? (
        <CadenceCard
          title={t(msg`每日策略`)}
          description={t(msg`更看重反复出现的主题、长期缺口和稳定角色位。`)}
          cadenceType="daily"
          config={draft}
          onChange={onChange}
        />
      ) : null}

      {panel === "shared" ? (
        <SharedCard config={draft} onChange={onChange} />
      ) : null}
    </div>
  );
}

function ShakeWorkspace({
  panel,
  onPanelChange,
  traceTab,
  onTraceTabChange,
  sessions,
  allSessions,
  statusFilter,
  onStatusFilterChange,
  selectedSession,
  selectedSessionId,
  onSelectSession,
  config,
  onConfigChange,
  statusCounts,
}: {
  panel: ShakePanelKey;
  onPanelChange: (panel: ShakePanelKey) => void;
  traceTab: ShakeTraceTab;
  onTraceTabChange: (tab: ShakeTraceTab) => void;
  sessions: ShakeDiscoverySessionRecord[];
  allSessions: ShakeDiscoverySessionRecord[];
  statusFilter: ShakeStatusFilter;
  onStatusFilterChange: (value: ShakeStatusFilter) => void;
  selectedSession: ShakeDiscoverySessionRecord | null;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  config: ShakeDiscoveryConfig;
  onConfigChange: (next: ShakeDiscoveryConfig) => void;
  statusCounts: Record<ShakeDiscoverySessionRecord["status"], number>;
}) {
  const t = translateRuntimeMessage;
  return (
    <div className="space-y-6">
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title={t(msg`摇一摇工作区`)}
          actions={
            <StatusPill
              tone={statusCounts.preview_ready > 0 ? "warning" : "healthy"}
            >
              {t(msg`待决定`)} {statusCounts.preview_ready}
            </StatusPill>
          }
        />
        <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
          {t(msg`Session 和配置分开处理。抽查即时相遇质量时只看 session；改规则时只看配置，不把两类任务堆在同一屏里。`)}
        </p>
        <AdminTabs
          tabs={SHAKE_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
          activeKey={panel}
          onChange={(key) => onPanelChange(key as ShakePanelKey)}
          className="mt-4"
        />
      </Card>

      {panel === "sessions" ? (
        <div className="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
          <ShakeSessionQueueCard
            sessions={sessions}
            allSessions={allSessions}
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
            selectedSessionId={selectedSessionId}
            onSelectSession={onSelectSession}
            statusCounts={statusCounts}
          />
          <ShakeSessionInspectorCard
            session={selectedSession}
            traceTab={traceTab}
            onTraceTabChange={onTraceTabChange}
          />
        </div>
      ) : null}

      {panel === "config" ? (
        <ShakeConfigCard config={config} onChange={onConfigChange} />
      ) : null}
    </div>
  );
}

function ShakeSessionQueueCard({
  sessions,
  allSessions,
  statusFilter,
  onStatusFilterChange,
  selectedSessionId,
  onSelectSession,
  statusCounts,
}: {
  sessions: ShakeDiscoverySessionRecord[];
  allSessions: ShakeDiscoverySessionRecord[];
  statusFilter: ShakeStatusFilter;
  onStatusFilterChange: (value: ShakeStatusFilter) => void;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  statusCounts: Record<ShakeDiscoverySessionRecord["status"], number>;
}) {
  const t = translateRuntimeMessage;
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`Session 列表`)}
        actions={
          <StatusPill tone={sessions.length ? "healthy" : "muted"}>
            {sessions.length} {t(msg`条`)}
          </StatusPill>
        }
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        <AdminMiniPanel title={t(msg`待决定`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {statusCounts.preview_ready} {t(msg`条`)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`已保留 / 已过期`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {statusCounts.kept} / {statusCounts.expired}
          </div>
        </AdminMiniPanel>
      </div>

      <div className="mt-4">
        <SelectionBar
          label={t(msg`状态筛选`)}
          options={SHAKE_STATUS_OPTIONS.map((option) => ({
            key: option.value,
            label:
              option.value === "all"
                ? `${t(option.label)} ${allSessions.length}`
                : `${t(option.label)} ${statusCounts[option.value] ?? 0}`,
          }))}
          activeKey={statusFilter}
          onChange={(key) => onStatusFilterChange(key as ShakeStatusFilter)}
        />
      </div>

      <div className="mt-5 space-y-2">
        {sessions.length === 0 ? (
          <AdminEmptyState
            title={t(msg`当前筛选下没有 session`)}
            description={t(msg`可以切换状态，或者等待新的摇一摇记录产生后再抽查。`)}
          />
        ) : (
          sessions.map((session) => (
            <ShakeSessionListItem
              key={session.id}
              session={session}
              selected={selectedSessionId === session.id}
              onClick={() => onSelectSession(session.id)}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function ShakeSessionListItem({
  session,
  selected,
  onClick,
}: {
  session: ShakeDiscoverySessionRecord;
  selected: boolean;
  onClick: () => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-[20px] border px-4 py-4 text-left transition",
        selected
          ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] shadow-[var(--shadow-card)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-soft)] hover:border-[color:var(--border-subtle)] hover:bg-white/90",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[color:var(--text-primary)]">
            {session.character.name}
          </div>
          <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
            {session.character.relationship}
          </div>
        </div>
        <StatusPill tone={toneForShakeStatus(session.status)}>
          {labelForShakeStatus(session.status)}
        </StatusPill>
      </div>
      <div className="mt-3 line-clamp-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {session.matchReason || session.failureReason || t(msg`暂无说明。`)}
      </div>
      <div className="mt-3 text-xs text-[color:var(--text-muted)]">
        {formatCompactDateTime(session.createdAt)}
      </div>
    </button>
  );
}

function ShakeSessionInspectorCard({
  session,
  traceTab,
  onTraceTabChange,
}: {
  session: ShakeDiscoverySessionRecord | null;
  traceTab: ShakeTraceTab;
  onTraceTabChange: (tab: ShakeTraceTab) => void;
}) {
  const t = translateRuntimeMessage;
  if (!session) {
    return (
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader title={t(msg`Session 详情`)} />
        <div className="mt-4">
          <AdminEmptyState
            title={t(msg`先从左侧选一个 session`)}
            description={t(msg`这里会展示匹配理由、问候语、方向信息以及规划 / 生成 Prompt。`)}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`Session 详情`)}
        actions={
          <StatusPill tone={toneForShakeStatus(session.status)}>
            {labelForShakeStatus(session.status)}
          </StatusPill>
        }
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title={t(msg`角色`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {session.character.name}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`关系`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {session.character.relationship}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`创建时间`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {formatCompactDateTime(session.createdAt)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`有效期`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {session.expiresAt
              ? formatCompactDateTime(session.expiresAt)
              : t(msg`未记录`)}
          </div>
        </AdminMiniPanel>
      </div>

      <AdminCallout
        title={t(msg`匹配说明`)}
        tone={
          session.status === "failed"
            ? "warning"
            : session.status === "preview_ready"
              ? "info"
              : "muted"
        }
        className="mt-4"
        description={
          session.matchReason || session.failureReason || t(msg`暂无说明。`)
        }
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <AdminSubpanel title={t(msg`问候语`)} className="bg-white/85">
          <div className="text-sm leading-7 text-[color:var(--text-secondary)]">
            {session.greeting || t(msg`暂无`)}
          </div>
        </AdminSubpanel>

        <AdminSubpanel title={t(msg`方向摘要`)} className="bg-white/85">
          {session.selectedDirection ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {session.selectedDirection.relationshipLabel}
              </div>
              <div className="text-sm leading-6 text-[color:var(--text-secondary)]">
                {session.selectedDirection.whyNow}
              </div>
              <div className="flex flex-wrap gap-2">
                {session.selectedDirection.expertDomains.map((domain) => (
                  <span
                    key={`${session.id}-${domain}`}
                    className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-1 text-xs text-[color:var(--text-secondary)]"
                  >
                    {domain}
                  </span>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <AdminMiniPanel title="Fit"> {/* i18n-ignore-line: technical scoring term */}
                  <div className="text-sm text-[color:var(--text-primary)]">
                    {session.selectedDirection.fitScore.toFixed(2)}
                  </div>
                </AdminMiniPanel>
                <AdminMiniPanel title="Novelty"> {/* i18n-ignore-line: technical scoring term */}
                  <div className="text-sm text-[color:var(--text-primary)]">
                    {session.selectedDirection.noveltyScore.toFixed(2)}
                  </div>
                </AdminMiniPanel>
                <AdminMiniPanel title="Surprise"> {/* i18n-ignore-line: technical scoring term */}
                  <div className="text-sm text-[color:var(--text-primary)]">
                    {session.selectedDirection.surpriseBoost.toFixed(2)}
                  </div>
                </AdminMiniPanel>
              </div>
              {session.selectedDirection.riskFlags.length ? (
                <div className="flex flex-wrap gap-2">
                  {session.selectedDirection.riskFlags.map((flag, index) => (
                    <span
                      key={`${session.id}-risk-${index}`}
                      className="rounded-full border border-amber-200 bg-amber-50/80 px-3 py-1 text-xs text-amber-700"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-[color:var(--text-secondary)]">
              {t(msg`当前没有选中方向信息。`)}
            </div>
          )}
        </AdminSubpanel>
      </div>

      <div className="mt-4">
        <AdminTabs
          tabs={SHAKE_TRACE_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
          activeKey={traceTab}
          onChange={(key) => onTraceTabChange(key as ShakeTraceTab)}
        />
        <AdminSubpanel
          title={
            traceTab === "planning" ? t(msg`方向规划 Prompt`) : t(msg`角色生成 Prompt`)
          }
          className="mt-4 bg-white/85"
        >
          <AdminCodeBlock
            value={
              traceTab === "planning"
                ? session.planningPrompt || t(msg`暂无`)
                : session.generationPrompt || t(msg`暂无`)
            }
            className="border-0 bg-transparent p-0"
          />
        </AdminSubpanel>
      </div>
    </Card>
  );
}

function SelectionBar({
  label,
  options,
  activeKey,
  onChange,
}: {
  label: string;
  options: Array<{ key: string; label: ReactNode }>;
  activeKey: string;
  onChange: (key: string) => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={[
              "rounded-full border px-3 py-2 text-sm transition",
              option.key === activeKey
                ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
                : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-subtle)] hover:bg-white/90",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ShakeConfigCard({
  config,
  onChange,
}: {
  config: ShakeDiscoveryConfig;
  onChange: (next: ShakeDiscoveryConfig) => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`摇一摇即时生成`)}
        actions={
          <StatusPill tone={config.enabled ? "healthy" : "warning"}>
            {config.enabled ? t(msg`启用中`) : t(msg`已停用`)}
          </StatusPill>
        }
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {t(msg`这里只编辑摇一摇规则，不展示 session 列表。这样运营改参数时不会被即时记录打断，也更容易确认当前改的是哪一组策略。`)}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title={t(msg`时效与频控`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {t(msg`冷却`)} {config.cooldownMinutes} {t(msg`分钟`)}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(msg`单次有效`)} {config.sessionExpiryMinutes} {t(msg`分钟`)} · {t(msg`每日上限`)}{" "}
            {config.maxSessionsPerDay}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`方向采样`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {t(msg`方向`)} {config.candidateDirectionCount} {t(msg`个`)}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(msg`回看`)} {config.evidenceWindowHours} {t(msg`小时`)} · {t(msg`证据最多`)}{" "}
            {config.maxEvidenceItems} {t(msg`条`)}
          </div>
        </AdminMiniPanel>
      </div>

      <div className="mt-5 space-y-4">
        <ConfigBlock
          title={t(msg`开关与时效`)}
          description={t(msg`控制是否允许即时相遇，以及 session 的冷却和过期策略。`)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigCheckbox
              label={t(msg`启用摇一摇生成`)}
              hint={t(msg`关闭后用户仍可进入入口，但不会生成新候选。`)}
              checked={config.enabled}
              onChange={(checked) =>
                onChange({
                  ...config,
                  enabled: checked,
                })
              }
            />
            <ConfigCheckbox
              label={t(msg`要求已有赛博分身信号`)}
              hint={t(msg`开启后，只有画像足够完整时才允许生成临时候选。`)}
              checked={config.requireCyberAvatarSignals}
              onChange={(checked) =>
                onChange({
                  ...config,
                  requireCyberAvatarSignals: checked,
                })
              }
            />
            <ConfigNumber
              label={t(msg`冷却分钟`)}
              hint={t(msg`限制连续摇一摇频率，避免临时候选抖动过大。`)}
              value={config.cooldownMinutes}
              onChange={(value) =>
                onChange({
                  ...config,
                  cooldownMinutes: value,
                })
              }
            />
            <ConfigNumber
              label={t(msg`会话有效期（分钟）`)}
              hint={t(msg`超过这个时间，待决定的临时候选会自动过期。`)}
              value={config.sessionExpiryMinutes}
              onChange={(value) =>
                onChange({
                  ...config,
                  sessionExpiryMinutes: value,
                })
              }
            />
            <ConfigNumber
              label={t(msg`每日最多摇一摇`)}
              hint={t(msg`控制单日即时相遇曝光量。`)}
              value={config.maxSessionsPerDay}
              onChange={(value) =>
                onChange({
                  ...config,
                  maxSessionsPerDay: value,
                })
              }
            />
          </div>
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`方向采样与权重`)}
          description={t(msg`控制一次摇一摇从多少证据里取样，以及生成方向的新鲜感和惊喜程度。`)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigNumber
              label={t(msg`回看小时`)}
              hint={t(msg`越长越稳定，越短越贴近当下状态。`)}
              value={config.evidenceWindowHours}
              onChange={(value) =>
                onChange({
                  ...config,
                  evidenceWindowHours: value,
                })
              }
            />
            <ConfigNumber
              label={t(msg`最多证据条数`)}
              hint={t(msg`限制一次规划时注入多少上游信号。`)}
              value={config.maxEvidenceItems}
              onChange={(value) =>
                onChange({
                  ...config,
                  maxEvidenceItems: value,
                })
              }
            />
            <ConfigNumber
              label={t(msg`候选方向数`)}
              hint={t(msg`方向数越多，运营可观察到的相遇分布越丰富。`)}
              value={config.candidateDirectionCount}
              onChange={(value) =>
                onChange({
                  ...config,
                  candidateDirectionCount: value,
                })
              }
            />
            <ConfigNumber
              label={t(msg`新鲜感权重`)}
              hint={t(msg`提高后更容易避开重复方向。`)}
              step={0.05}
              value={config.noveltyWeight}
              onChange={(value) =>
                onChange({
                  ...config,
                  noveltyWeight: value,
                })
              }
            />
            <ConfigNumber
              label={t(msg`惊喜系数`)}
              hint={t(msg`提高后会更愿意抽取非最稳妥但仍合理的方向。`)}
              step={0.05}
              value={config.surpriseWeight}
              onChange={(value) =>
                onChange({
                  ...config,
                  surpriseWeight: value,
                })
              }
            />
          </div>
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`高风险领域`)}
          description={t(msg`手动摇一摇可以允许更强的即时性，但高风险领域仍要严格控边界。`)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigCheckbox
              label={t(msg`允许医疗类角色`)}
              checked={config.allowMedical}
              onChange={(checked) =>
                onChange({
                  ...config,
                  allowMedical: checked,
                })
              }
            />
            <ConfigCheckbox
              label={t(msg`允许法律类角色`)}
              checked={config.allowLegal}
              onChange={(checked) =>
                onChange({
                  ...config,
                  allowLegal: checked,
                })
              }
            />
            <ConfigCheckbox
              label={t(msg`允许金融类角色`)}
              checked={config.allowFinance}
              onChange={(checked) =>
                onChange({
                  ...config,
                  allowFinance: checked,
                })
              }
            />
          </div>
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`方向规划 Prompt`)}
          description={t(msg`决定这次摇一摇应该往哪几类真实联系人方向去想。`)}
        >
          <PromptField
            label={t(msg`方向规划提示词`)}
            value={config.planningPrompt}
            minHeightClassName="min-h-[240px]"
            onChange={(value) =>
              onChange({
                ...config,
                planningPrompt: value,
              })
            }
          />
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`角色生成 Prompt`)}
          description={t(msg`决定方向确定后，如何把它落成一个用户愿意决定是否添加的真实联系人。`)}
        >
          <PromptField
            label={t(msg`角色生成提示词`)}
            value={config.roleGenerationPrompt}
            minHeightClassName="min-h-[280px]"
            onChange={(value) =>
              onChange({
                ...config,
                roleGenerationPrompt: value,
              })
            }
          />
        </ConfigBlock>
      </div>
    </Card>
  );
}

function CadenceCard({
  title,
  description,
  cadenceType,
  config,
  onChange,
}: {
  title: string;
  description: string;
  cadenceType: "short" | "daily";
  config: NeedDiscoveryConfig;
  onChange: (next: NeedDiscoveryConfig) => void;
}) {
  const t = translateRuntimeMessage;
  const cadence = cadenceType === "short" ? config.shortInterval : config.daily;

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={title}
        actions={
          <StatusPill tone={cadence.enabled ? "healthy" : "warning"}>
            {cadence.enabled ? t(msg`启用中`) : t(msg`已停用`)}
          </StatusPill>
        }
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {description}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title={t(msg`执行模式`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {formatExecutionMode(cadence.executionMode)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`运行节奏`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {cadenceType === "short"
              ? `${t(msg`每`)} ${config.shortInterval.intervalMinutes} ${t(msg`分钟`)}`
              : `${t(msg`每天`)} ${padNumber(config.daily.runAtHour)}:${padNumber(
                  config.daily.runAtMinute,
                )}`}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`回看窗口`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {cadenceType === "short"
              ? `${config.shortInterval.lookbackHours} ${t(msg`小时`)}`
              : `${config.daily.lookbackDays} ${t(msg`天`)}`}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`候选阈值`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {t(msg`最多`)} {cadence.maxCandidatesPerRun} {t(msg`个`)}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(msg`最低置信度`)} {cadence.minConfidenceScore.toFixed(2)}
          </div>
        </AdminMiniPanel>
      </div>

      <div className="mt-5 space-y-4">
        <ConfigBlock
          title={t(msg`开关与执行模式`)}
          description={t(msg`决定这条 cadence 是否参与自动补位，以及是直接发申请还是只生成草稿。`)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigCheckbox
              label={t(msg`启用该节奏`)}
              hint={t(msg`关闭后，该 cadence 不再产出新候选。`)}
              checked={cadence.enabled}
              onChange={(checked) =>
                onChange({
                  ...config,
                  [cadenceType === "short" ? "shortInterval" : "daily"]: {
                    ...cadence,
                    enabled: checked,
                  },
                })
              }
            />
            <ConfigSelect
              label={t(msg`执行模式`)}
              hint={t(msg`dry run 适合先观察候选质量，auto send 适合直接补位。`)}
              value={cadence.executionMode}
              options={[
                { value: "auto_send", label: t(msg`直接创建并发起好友申请`) },
                { value: "dry_run", label: t(msg`只生成候选草稿`) },
              ]}
              onChange={(value) =>
                onChange({
                  ...config,
                  [cadenceType === "short" ? "shortInterval" : "daily"]: {
                    ...cadence,
                    executionMode:
                      value === "dry_run" ? "dry_run" : "auto_send",
                  },
                })
              }
            />
          </div>
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`节奏与窗口`)}
          description={t(msg`决定这条 cadence 什么时候跑、看多久的信号，以及是否允许空跑。`)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {cadenceType === "short" ? (
              <>
                <ConfigNumber
                  label={t(msg`间隔分钟`)}
                  hint={t(msg`越短越敏感，越长越稳。`)}
                  value={config.shortInterval.intervalMinutes}
                  onChange={(value) =>
                    onChange({
                      ...config,
                      shortInterval: {
                        ...config.shortInterval,
                        intervalMinutes: value,
                      },
                    })
                  }
                />
                <ConfigNumber
                  label={t(msg`回看小时`)}
                  hint={t(msg`决定短周期会读到多长时间窗口的信号。`)}
                  value={config.shortInterval.lookbackHours}
                  onChange={(value) =>
                    onChange({
                      ...config,
                      shortInterval: {
                        ...config.shortInterval,
                        lookbackHours: value,
                      },
                    })
                  }
                />
                <ConfigCheckbox
                  label={t(msg`无新信号则跳过`)}
                  hint={t(msg`开启后能降低无效运行。`)}
                  checked={config.shortInterval.skipIfNoNewSignals}
                  onChange={(checked) =>
                    onChange({
                      ...config,
                      shortInterval: {
                        ...config.shortInterval,
                        skipIfNoNewSignals: checked,
                      },
                    })
                  }
                />
              </>
            ) : (
              <>
                <ConfigNumber
                  label={t(msg`执行小时`)}
                  hint={t(msg`按本地时间设置每日启动点。`)}
                  value={config.daily.runAtHour}
                  onChange={(value) =>
                    onChange({
                      ...config,
                      daily: { ...config.daily, runAtHour: value },
                    })
                  }
                />
                <ConfigNumber
                  label={t(msg`执行分钟`)}
                  hint={t(msg`和执行小时组合成固定的日调度时间。`)}
                  value={config.daily.runAtMinute}
                  onChange={(value) =>
                    onChange({
                      ...config,
                      daily: { ...config.daily, runAtMinute: value },
                    })
                  }
                />
                <ConfigNumber
                  label={t(msg`回看天数`)}
                  hint={t(msg`越长越偏向结构性缺口。`)}
                  value={config.daily.lookbackDays}
                  onChange={(value) =>
                    onChange({
                      ...config,
                      daily: { ...config.daily, lookbackDays: value },
                    })
                  }
                />
              </>
            )}
          </div>
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`候选阈值`)}
          description={t(msg`控制每轮最多生成多少候选，以及需要多高的置信度才允许通过。`)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigNumber
              label={t(msg`单次最多候选`)}
              hint={t(msg`太高会让候选池快速堆积。`)}
              value={cadence.maxCandidatesPerRun}
              onChange={(value) =>
                onChange({
                  ...config,
                  [cadenceType === "short" ? "shortInterval" : "daily"]: {
                    ...cadence,
                    maxCandidatesPerRun: value,
                  },
                })
              }
            />
            <ConfigNumber
              label={t(msg`最低置信度`)}
              hint={t(msg`太低会引入噪音，太高会错过边缘但有价值的候选。`)}
              step={0.01}
              value={cadence.minConfidenceScore}
              onChange={(value) =>
                onChange({
                  ...config,
                  [cadenceType === "short" ? "shortInterval" : "daily"]: {
                    ...cadence,
                    minConfidenceScore: value,
                  },
                })
              }
            />
          </div>
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`分析 Prompt`)}
          description={t(msg`决定这条 cadence 如何从最近信号中识别角色缺口和 need key。`)}
        >
          <PromptField
            label={t(msg`分析提示词`)}
            value={cadence.promptTemplate}
            minHeightClassName="min-h-[240px]"
            onChange={(value) =>
              onChange({
                ...config,
                [cadenceType === "short" ? "shortInterval" : "daily"]: {
                  ...cadence,
                  promptTemplate: value,
                },
              })
            }
          />
        </ConfigBlock>
      </div>
    </Card>
  );
}

function SharedCard({
  config,
  onChange,
}: {
  config: NeedDiscoveryConfig;
  onChange: (next: NeedDiscoveryConfig) => void;
}) {
  const t = translateRuntimeMessage;
  const shared = config.shared;

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`共享约束`)}
        actions={<StatusPill tone="muted">{t(msg`跨节奏统一`)}</StatusPill>}
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {t(msg`这里不是单条 cadence 的细节，而是所有自动补位统一遵守的队列上限、抑制期和风险域边界。`)}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title={t(msg`队列上限`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {t(msg`待处理最多`)} {shared.pendingCandidateLimit}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`创建上限`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {t(msg`每日最多`)} {shared.dailyCreationLimit}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`抑制期`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {t(msg`短周期`)} {shared.shortSuppressionDays} {t(msg`天`)}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(msg`每日`)} {shared.dailySuppressionDays} {t(msg`天`)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title={t(msg`风险域`)}>
          <div className="text-sm text-[color:var(--text-primary)]">
            {formatRiskDomains(
              shared.allowMedical,
              shared.allowLegal,
              shared.allowFinance,
            )}
          </div>
        </AdminMiniPanel>
      </div>

      <div className="mt-5 space-y-4">
        <ConfigBlock
          title={t(msg`容量与过期`)}
          description={t(msg`控制候选池最多允许积压多少条，以及好友申请多久后视为无效。`)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigNumber
              label={t(msg`待处理候选上限`)}
              hint={t(msg`达到上限后，新候选会受抑制。`)}
              value={shared.pendingCandidateLimit}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: { ...shared, pendingCandidateLimit: value },
                })
              }
            />
            <ConfigNumber
              label={t(msg`每日创建上限`)}
              hint={t(msg`控制单日自动补位的整体产量。`)}
              value={shared.dailyCreationLimit}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: { ...shared, dailyCreationLimit: value },
                })
              }
            />
            <ConfigNumber
              label={t(msg`好友申请有效期（天）`)}
              hint={t(msg`超时后会自动按过期处理。`)}
              value={shared.expiryDays}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: { ...shared, expiryDays: value },
                })
              }
            />
          </div>
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`去重与抑制`)}
          description={t(msg`避免相似方向反复命中，以及同一 need 在短期内被重复生成。`)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigNumber
              label={t(msg`短周期抑制期（天）`)}
              hint={t(msg`避免最近刚触发过的短期 need 反复进入候选池。`)}
              value={shared.shortSuppressionDays}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: { ...shared, shortSuppressionDays: value },
                })
              }
            />
            <ConfigNumber
              label={t(msg`每日抑制期（天）`)}
              hint={t(msg`避免每日策略反复生成同类稳定角色位。`)}
              value={shared.dailySuppressionDays}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: { ...shared, dailySuppressionDays: value },
                })
              }
            />
            <ConfigNumber
              label={t(msg`领域重叠阈值`)}
              hint={t(msg`值越低，越严格地把相似角色当成已覆盖。`)}
              step={0.05}
              value={shared.coverageDomainOverlapThreshold}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: {
                    ...shared,
                    coverageDomainOverlapThreshold: value,
                  },
                })
              }
            />
          </div>
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`高风险领域边界`)}
          description={t(msg`医疗、法律、金融角色属于高风险方向，是否允许需要明确管理。`)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigCheckbox
              label={t(msg`允许医疗类角色`)}
              checked={shared.allowMedical}
              onChange={(checked) =>
                onChange({
                  ...config,
                  shared: { ...shared, allowMedical: checked },
                })
              }
            />
            <ConfigCheckbox
              label={t(msg`允许法律类角色`)}
              checked={shared.allowLegal}
              onChange={(checked) =>
                onChange({
                  ...config,
                  shared: { ...shared, allowLegal: checked },
                })
              }
            />
            <ConfigCheckbox
              label={t(msg`允许金融类角色`)}
              checked={shared.allowFinance}
              onChange={(checked) =>
                onChange({
                  ...config,
                  shared: { ...shared, allowFinance: checked },
                })
              }
            />
          </div>
        </ConfigBlock>

        <ConfigBlock
          title={t(msg`角色生成 Prompt`)}
          description={t(msg`当 need 确认通过后，决定最终角色草稿和好友申请文案如何生成。`)}
        >
          <PromptField
            label={t(msg`角色生成提示词`)}
            value={shared.roleGenerationPrompt}
            minHeightClassName="min-h-[300px]"
            onChange={(value) =>
              onChange({
                ...config,
                shared: { ...shared, roleGenerationPrompt: value },
              })
            }
          />
        </ConfigBlock>
      </div>
    </Card>
  );
}

function ConfigBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function PromptField({
  label,
  value,
  onChange,
  minHeightClassName = "min-h-[220px]",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minHeightClassName?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[color:var(--text-primary)]">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={[
          "mt-2 w-full rounded-2xl border border-[color:var(--border-subtle)] bg-white/90 px-4 py-3 text-sm leading-6 text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]",
          minHeightClassName,
        ].join(" ")}
      />
    </label>
  );
}

function ConfigNumber({
  label,
  hint,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[color:var(--text-primary)]">
        {label}
      </span>
      {hint ? (
        <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
          {hint}
        </div>
      ) : null}
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-2xl border border-[color:var(--border-subtle)] bg-white/90 px-3 py-2.5 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]"
      />
    </label>
  );
}

function ConfigSelect({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[color:var(--text-primary)]">
        {label}
      </span>
      {hint ? (
        <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
          {hint}
        </div>
      ) : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-[color:var(--border-subtle)] bg-white/90 px-3 py-2.5 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]"
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConfigCheckbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-4 py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <div>
          <div className="text-sm text-[color:var(--text-primary)]">
            {label}
          </div>
          {hint ? (
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              {hint}
            </div>
          ) : null}
        </div>
      </div>
    </label>
  );
}

function buildTodayActions({
  draft,
  hasUnsavedChanges,
  latestRun,
  activeCandidates,
  expiringSoonCount,
  shakePendingCount,
  primaryCandidateStatus,
  openCandidateQueue,
  openConfigWorkspace,
  openRunWorkspace,
  openShakeWorkspace,
}: {
  draft: NeedDiscoveryConfig | null;
  hasUnsavedChanges: boolean;
  latestRun: NeedDiscoveryRunRecord | null;
  activeCandidates: NeedDiscoveryCandidateRecord[];
  expiringSoonCount: number;
  shakePendingCount: number;
  primaryCandidateStatus: CandidateStatusFilter;
  openCandidateQueue: (status?: CandidateStatusFilter) => void;
  openConfigWorkspace: (panel?: ConfigPanelKey) => void;
  openRunWorkspace: (cadence?: RunCadenceFilter) => void;
  openShakeWorkspace: (
    panel?: ShakePanelKey,
    status?: ShakeStatusFilter,
  ) => void;
}) {
  const actions: TodayAction[] = [];

  if (hasUnsavedChanges) {
    actions.push({
      key: "save-draft",
      title: translateRuntimeMessage(msg`先处理未保存草稿`),
      description:
        translateRuntimeMessage(msg`当前页面的规则改动还没写回服务端。先确认是否保存，再继续看候选或运行，避免判断基于旧配置。`),
      actionLabel: translateRuntimeMessage(msg`去看规则`),
      tone: "warning",
      onClick: () => openConfigWorkspace("short"),
    });
  }

  if (draft && activeCandidates.length >= draft.shared.pendingCandidateLimit) {
    actions.push({
      key: "queue-full",
      title: translateRuntimeMessage(msg`候选池已到上限`),
      description: `当前活跃候选 ${activeCandidates.length} 条，已触及共享上限 ${draft.shared.pendingCandidateLimit}。建议先处理候选，再决定是否下调生成量。`, // i18n-ignore-line
      actionLabel: translateRuntimeMessage(msg`打开候选队列`),
      tone: "warning",
      onClick: () => openCandidateQueue(primaryCandidateStatus),
    });
  }

  if (latestRun?.status === "failed") {
    actions.push({
      key: "latest-run-failed",
      title: translateRuntimeMessage(msg`最近调度失败`),
      description:
        latestRun.errorMessage ||
        latestRun.summary ||
        translateRuntimeMessage(msg`最近一次运行失败，但没有返回更多摘要。`),
      actionLabel: translateRuntimeMessage(msg`查看运行详情`),
      tone: "warning",
      onClick: () => openRunWorkspace(latestRun.cadenceType),
    });
  }

  if (expiringSoonCount > 0) {
    actions.push({
      key: "candidate-expiring",
      title: translateRuntimeMessage(msg`有候选即将过期`),
      description: `未来 24 小时内有 ${expiringSoonCount} 条候选会过期，适合优先清理仍待通过的记录。`, // i18n-ignore-line
      actionLabel: translateRuntimeMessage(msg`查看待通过候选`),
      tone: "info",
      onClick: () => openCandidateQueue("friend_request_pending"),
    });
  }

  if (shakePendingCount > 0) {
    actions.push({
      key: "shake-pending",
      title: translateRuntimeMessage(msg`摇一摇存在待决定 session`),
      description: `当前有 ${shakePendingCount} 条即时相遇还没决定，建议抽查 matchReason、方向摘要和问候语。`, // i18n-ignore-line
      actionLabel: translateRuntimeMessage(msg`查看摇一摇 session`),
      tone: "info",
      onClick: () => openShakeWorkspace("sessions", "preview_ready"),
    });
  }

  if (!actions.length) {
    actions.push(
      {
        key: "stable-candidates",
        title: translateRuntimeMessage(msg`当前状态稳定`),
        description:
          translateRuntimeMessage(msg`自动补位没有明显阻塞。可以抽查候选质量，或者微调短周期 / 每日规则。`),
        actionLabel: translateRuntimeMessage(msg`打开候选处理`),
        tone: "success",
        onClick: () => openCandidateQueue("all"),
      },
      {
        key: "stable-config",
        title: translateRuntimeMessage(msg`规则可按需微调`),
        description:
          translateRuntimeMessage(msg`如果想更保守地控量，优先看共享约束；如果想提速补位，优先看短周期。`),
        actionLabel: translateRuntimeMessage(msg`查看共享约束`),
        tone: "info",
        onClick: () => openConfigWorkspace("shared"),
      },
      {
        key: "stable-shake",
        title: translateRuntimeMessage(msg`摇一摇可做抽样巡检`),
        description:
          translateRuntimeMessage(msg`当前没有明显待处理堆积，适合抽查 session 文案是否自然、方向是否足够多样。`),
        actionLabel: translateRuntimeMessage(msg`打开摇一摇`),
        tone: "info",
        onClick: () => openShakeWorkspace("sessions", "all"),
      },
    );
  }

  return actions.slice(0, 3);
}

function buildCandidateStatusCounts(
  candidates: NeedDiscoveryCandidateRecord[],
): Record<NeedDiscoveryCandidateRecord["status"], number> {
  return candidates.reduce(
    (accumulator, candidate) => {
      accumulator[candidate.status] += 1;
      return accumulator;
    },
    {
      draft: 0,
      friend_request_pending: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      deleted: 0,
      generation_failed: 0,
    } satisfies Record<NeedDiscoveryCandidateRecord["status"], number>,
  );
}

function buildShakeStatusCounts(
  sessions: ShakeDiscoverySessionRecord[],
): Record<ShakeDiscoverySessionRecord["status"], number> {
  return sessions.reduce(
    (accumulator, session) => {
      accumulator[session.status] += 1;
      return accumulator;
    },
    {
      generating: 0,
      preview_ready: 0,
      kept: 0,
      dismissed: 0,
      expired: 0,
      failed: 0,
    } satisfies Record<ShakeDiscoverySessionRecord["status"], number>,
  );
}

function sortCandidates(candidates: NeedDiscoveryCandidateRecord[]) {
  return [...candidates].sort((left, right) => {
    const statusDelta =
      candidateStatusWeight(left.status) - candidateStatusWeight(right.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const priorityDelta = right.priorityScore - left.priorityScore;
    if (Math.abs(priorityDelta) > 0.0001) {
      return priorityDelta;
    }

    const confidenceDelta = right.confidenceScore - left.confidenceScore;
    if (Math.abs(confidenceDelta) > 0.0001) {
      return confidenceDelta;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

function candidateStatusWeight(status: NeedDiscoveryCandidateRecord["status"]) {
  switch (status) {
    case "friend_request_pending":
      return 0;
    case "draft":
      return 1;
    case "generation_failed":
      return 2;
    case "declined":
      return 3;
    case "expired":
      return 4;
    case "accepted":
      return 5;
    case "deleted":
      return 6;
    default:
      return 10;
  }
}

function pickPriorityCandidateStatus(
  candidates: NeedDiscoveryCandidateRecord[],
): CandidateStatusFilter {
  if (candidates.some((item) => item.status === "friend_request_pending")) {
    return "friend_request_pending";
  }
  if (candidates.some((item) => item.status === "draft")) {
    return "draft";
  }
  if (candidates.some((item) => item.status === "generation_failed")) {
    return "generation_failed";
  }
  return "all";
}

function toneForRun(status: NeedDiscoveryRunRecord["status"]) {
  if (status === "failed") {
    return "warning" as const;
  }
  return status === "success" ? ("healthy" as const) : ("muted" as const);
}

function labelForRun(status: NeedDiscoveryRunRecord["status"]) {
  if (status === "failed") {
    return translateRuntimeMessage(msg`失败`);
  }
  return status === "success" ? translateRuntimeMessage(msg`成功`) : translateRuntimeMessage(msg`跳过`);
}

function toneForCandidate(status: NeedDiscoveryCandidateRecord["status"]) {
  if (
    status === "declined" ||
    status === "expired" ||
    status === "generation_failed"
  ) {
    return "warning" as const;
  }
  if (status === "accepted") {
    return "healthy" as const;
  }
  return "muted" as const;
}

function labelForCandidate(status: NeedDiscoveryCandidateRecord["status"]) {
  switch (status) {
    case "friend_request_pending":
      return translateRuntimeMessage(msg`待通过`);
    case "accepted":
      return translateRuntimeMessage(msg`已接受`);
    case "declined":
      return translateRuntimeMessage(msg`已拒绝`);
    case "expired":
      return translateRuntimeMessage(msg`已过期`);
    case "deleted":
      return translateRuntimeMessage(msg`已删除`);
    case "generation_failed":
      return translateRuntimeMessage(msg`生成失败`);
    default:
      return translateRuntimeMessage(msg`草稿`);
  }
}

function toneForShakeStatus(status: ShakeDiscoverySessionRecord["status"]) {
  if (status === "kept" || status === "preview_ready") {
    return "healthy" as const;
  }
  if (status === "failed") {
    return "warning" as const;
  }
  return "muted" as const;
}

function labelForShakeStatus(status: ShakeDiscoverySessionRecord["status"]) {
  switch (status) {
    case "preview_ready":
      return translateRuntimeMessage(msg`待决定`);
    case "kept":
      return translateRuntimeMessage(msg`已保留`);
    case "dismissed":
      return translateRuntimeMessage(msg`已跳过`);
    case "expired":
      return translateRuntimeMessage(msg`已过期`);
    case "failed":
      return translateRuntimeMessage(msg`生成失败`);
    case "generating":
      return translateRuntimeMessage(msg`生成中`);
    default:
      return status;
  }
}

function formatCadenceLabel(
  cadenceType: NeedDiscoveryRunRecord["cadenceType"],
) {
  return cadenceType === "short_interval" ? translateRuntimeMessage(msg`短周期`) : translateRuntimeMessage(msg`每日`);
}

function formatExecutionMode(value: "dry_run" | "auto_send") {
  return value === "dry_run" ? translateRuntimeMessage(msg`只生成草稿`) : translateRuntimeMessage(msg`直接创建并发起好友申请`);
}

function buildCandidateTimingLabel(candidate: NeedDiscoveryCandidateRecord) {
  if (candidate.acceptedAt) {
    return `${translateRuntimeMessage(msg`接受于`)} ${formatCompactDateTime(candidate.acceptedAt)}`;
  }
  if (candidate.declinedAt) {
    return `${translateRuntimeMessage(msg`拒绝于`)} ${formatCompactDateTime(candidate.declinedAt)}`;
  }
  if (candidate.expiresAt) {
    return `${translateRuntimeMessage(msg`过期于`)} ${formatCompactDateTime(candidate.expiresAt)}`;
  }
  if (candidate.suppressedUntil) {
    return `${translateRuntimeMessage(msg`抑制到`)} ${formatCompactDateTime(candidate.suppressedUntil)}`;
  }
  if (candidate.deletedAt) {
    return `${translateRuntimeMessage(msg`删除于`)} ${formatCompactDateTime(candidate.deletedAt)}`;
  }
  return `${translateRuntimeMessage(msg`更新于`)} ${formatCompactDateTime(candidate.updatedAt)}`;
}

function formatRunWindow(run: NeedDiscoveryRunRecord) {
  if (!run.windowStartedAt && !run.windowEndedAt) {
    return translateRuntimeMessage(msg`未记录窗口`);
  }

  return `${formatCompactDateTime(run.windowStartedAt)} -> ${formatCompactDateTime(
    run.windowEndedAt,
  )}`;
}

function formatRiskDomains(
  allowMedical: boolean,
  allowLegal: boolean,
  allowFinance: boolean,
) {
  const items = [
    allowMedical ? translateRuntimeMessage(msg`医疗`) : null,
    allowLegal ? translateRuntimeMessage(msg`法律`) : null,
    allowFinance ? translateRuntimeMessage(msg`金融`) : null,
  ].filter((item): item is string => Boolean(item));

  return items.length ? items.join(" / ") : translateRuntimeMessage(msg`全部关闭`);
}

function isWithinHours(value?: string | null, hours = 24) {
  if (!value) {
    return false;
  }

  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) {
    return false;
  }

  const delta = target - Date.now();
  return delta > 0 && delta <= hours * 60 * 60 * 1000;
}

function isSameSerialized(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatCompactDateTime(value?: string | null) {
  return formatLocalizedDateTime(
    value,
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
    "notRecorded",
  );
}

function parseShakeDiscoveryConfig(raw?: string | null): ShakeDiscoveryConfig {
  const fallback = DEFAULT_SHAKE_DISCOVERY_CONFIG;
  if (!raw?.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ShakeDiscoveryConfig>;
    return {
      enabled:
        typeof parsed.enabled === "boolean" ? parsed.enabled : fallback.enabled,
      cooldownMinutes: normalizeNumber(
        parsed.cooldownMinutes,
        fallback.cooldownMinutes,
        0,
        1440,
      ),
      sessionExpiryMinutes: normalizeNumber(
        parsed.sessionExpiryMinutes,
        fallback.sessionExpiryMinutes,
        5,
        24 * 60,
      ),
      maxSessionsPerDay: normalizeNumber(
        parsed.maxSessionsPerDay,
        fallback.maxSessionsPerDay,
        1,
        100,
      ),
      requireCyberAvatarSignals:
        typeof parsed.requireCyberAvatarSignals === "boolean"
          ? parsed.requireCyberAvatarSignals
          : fallback.requireCyberAvatarSignals,
      evidenceWindowHours: normalizeNumber(
        parsed.evidenceWindowHours,
        fallback.evidenceWindowHours,
        1,
        24 * 30,
      ),
      maxEvidenceItems: normalizeNumber(
        parsed.maxEvidenceItems,
        fallback.maxEvidenceItems,
        6,
        80,
      ),
      candidateDirectionCount: normalizeNumber(
        parsed.candidateDirectionCount,
        fallback.candidateDirectionCount,
        2,
        8,
      ),
      noveltyWeight: normalizeFloat(
        parsed.noveltyWeight,
        fallback.noveltyWeight,
      ),
      surpriseWeight: normalizeFloat(
        parsed.surpriseWeight,
        fallback.surpriseWeight,
      ),
      allowMedical:
        typeof parsed.allowMedical === "boolean"
          ? parsed.allowMedical
          : fallback.allowMedical,
      allowLegal:
        typeof parsed.allowLegal === "boolean"
          ? parsed.allowLegal
          : fallback.allowLegal,
      allowFinance:
        typeof parsed.allowFinance === "boolean"
          ? parsed.allowFinance
          : fallback.allowFinance,
      planningPrompt:
        typeof parsed.planningPrompt === "string" &&
        parsed.planningPrompt.trim()
          ? parsed.planningPrompt
          : fallback.planningPrompt,
      roleGenerationPrompt:
        typeof parsed.roleGenerationPrompt === "string" &&
        parsed.roleGenerationPrompt.trim()
          ? parsed.roleGenerationPrompt
          : fallback.roleGenerationPrompt,
    };
  } catch {
    return fallback;
  }
}

function parseShakeDiscoverySessions(raw?: string | null) {
  if (!raw?.trim()) {
    return [] as ShakeDiscoverySessionRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as ShakeDiscoverySessionRecord[];
    if (!Array.isArray(parsed)) {
      return [] as ShakeDiscoverySessionRecord[];
    }
    return parsed
      .filter((item): item is ShakeDiscoverySessionRecord =>
        Boolean(
          item && typeof item === "object" && typeof item.id === "string",
        ),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch {
    return [] as ShakeDiscoverySessionRecord[];
  }
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeFloat(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, parsed));
}
