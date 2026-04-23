import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  ToggleChip,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminEmptyState,
  AdminMiniPanel,
  AdminPageHero,
  AdminSectionHeader,
  AdminSectionNav,
  AdminSubpanel,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

type CandidateDatasetKey = "active" | "recent";
type CandidateStatusFilter = "all" | NeedDiscoveryCandidateRecord["status"];
type CandidateCadenceFilter =
  | "all"
  | NeedDiscoveryCandidateRecord["cadenceType"];
type RunCadenceFilter = "all" | NeedDiscoveryRunRecord["cadenceType"];
type ShakeStatusFilter = "all" | ShakeDiscoverySessionRecord["status"];
type NeedDiscoveryJob =
  | "discover_need_characters_short_interval"
  | "discover_need_characters_daily";

const SECTION_IDS = {
  overview: "need-discovery-overview",
  operations: "need-discovery-operations",
  config: "need-discovery-config",
  shake: "need-discovery-shake",
} as const;

const NEED_DISCOVERY_NOTICES: Record<NeedDiscoveryJob, string> = {
  discover_need_characters_short_interval: "短周期需求发现已执行。",
  discover_need_characters_daily: "每日需求发现已执行。",
};

const CANDIDATE_STATUS_OPTIONS: Array<{
  value: Exclude<CandidateStatusFilter, "all">;
  label: string;
}> = [
  { value: "draft", label: "草稿" },
  { value: "friend_request_pending", label: "待通过" },
  { value: "accepted", label: "已接受" },
  { value: "declined", label: "已拒绝" },
  { value: "expired", label: "已过期" },
  { value: "deleted", label: "已删除" },
  { value: "generation_failed", label: "生成失败" },
];

const SHAKE_STATUS_OPTIONS: Array<{
  value: Exclude<ShakeStatusFilter, "all">;
  label: string;
}> = [
  { value: "preview_ready", label: "待决定" },
  { value: "kept", label: "已保留" },
  { value: "dismissed", label: "已跳过" },
  { value: "expired", label: "已过期" },
  { value: "failed", label: "生成失败" },
  { value: "generating", label: "生成中" },
];

export function NeedDiscoveryPage() {
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
  const [candidateDataset, setCandidateDataset] =
    useState<CandidateDatasetKey>("active");
  const [candidateStatusFilter, setCandidateStatusFilter] =
    useState<CandidateStatusFilter>("all");
  const [candidateCadenceFilter, setCandidateCadenceFilter] =
    useState<CandidateCadenceFilter>("all");
  const [runCadenceFilter, setRunCadenceFilter] =
    useState<RunCadenceFilter>("all");
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
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!shakeSessions.length) {
      setSelectedShakeSessionId(null);
      return;
    }

    setSelectedShakeSessionId((current) =>
      current && shakeSessions.some((item) => item.id === current)
        ? current
        : shakeSessions[0].id,
    );
  }, [shakeSessions]);

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
      setNotice("需求发现与摇一摇配置已保存。");
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

  const latestRun = overviewQuery.data?.recentRuns[0] ?? null;
  const activeCandidates = useMemo(
    () => overviewQuery.data?.activeCandidates ?? [],
    [overviewQuery.data?.activeCandidates],
  );
  const recentCandidates = useMemo(
    () => overviewQuery.data?.recentCandidates ?? [],
    [overviewQuery.data?.recentCandidates],
  );
  const selectedCandidateSource =
    candidateDataset === "active" ? activeCandidates : recentCandidates;
  const selectedShakeSession = useMemo(
    () =>
      shakeSessions.find((item) => item.id === selectedShakeSessionId) ?? null,
    [selectedShakeSessionId, shakeSessions],
  );

  const candidateStatusCounts = useMemo(
    () => buildCandidateStatusCounts(selectedCandidateSource),
    [selectedCandidateSource],
  );

  const candidateCadenceCounts = useMemo(
    () => ({
      short_interval: selectedCandidateSource.filter(
        (item) => item.cadenceType === "short_interval",
      ).length,
      daily: selectedCandidateSource.filter(
        (item) => item.cadenceType === "daily",
      ).length,
    }),
    [selectedCandidateSource],
  );

  const filteredCandidates = useMemo(() => {
    return sortCandidates(
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
    );
  }, [candidateCadenceFilter, candidateStatusFilter, selectedCandidateSource]);

  const filteredRuns = useMemo(() => {
    const runs = overviewQuery.data?.recentRuns ?? [];
    return runs.filter((run) =>
      runCadenceFilter === "all" ? true : run.cadenceType === runCadenceFilter,
    );
  }, [overviewQuery.data, runCadenceFilter]);

  const filteredShakeSessions = useMemo(() => {
    return shakeSessions.filter((session) =>
      shakeStatusFilter === "all" ? true : session.status === shakeStatusFilter,
    );
  }, [shakeSessions, shakeStatusFilter]);

  const hasUnsavedNeedConfig = useMemo(
    () =>
      Boolean(
        draft &&
        overviewQuery.data?.config &&
        !isSameSerialized(draft, overviewQuery.data.config),
      ),
    [draft, overviewQuery.data],
  );

  const hasUnsavedShakeConfig = useMemo(
    () =>
      Boolean(
        shakeDraft &&
        serverShakeConfig &&
        !isSameSerialized(shakeDraft, serverShakeConfig),
      ),
    [serverShakeConfig, shakeDraft],
  );

  const hasUnsavedChanges = hasUnsavedNeedConfig || hasUnsavedShakeConfig;
  const shakePendingCount = shakeSessions.filter(
    (item) => item.status === "preview_ready",
  ).length;
  const shakeKeptCount = shakeSessions.filter(
    (item) => item.status === "kept",
  ).length;
  const expiringSoonCount = activeCandidates.filter((item) =>
    isWithinHours(item.expiresAt, 24),
  ).length;
  const enabledCadenceCount =
    Number(draft?.shortInterval.enabled ?? false) +
    Number(draft?.daily.enabled ?? false);
  const recentFailedRunCount =
    overviewQuery.data?.recentRuns.filter((run) => run.status === "failed")
      .length ?? 0;

  const metrics = useMemo(
    () => [
      {
        label: "待处理候选",
        value: overviewQuery.data?.stats.pendingCandidates ?? 0,
      },
      {
        label: "最近失败运行",
        value: recentFailedRunCount,
      },
      {
        label: "24h 内将过期",
        value: expiringSoonCount,
      },
      {
        label: "摇一摇待决定",
        value: shakePendingCount,
      },
      {
        label: "摇一摇已保留",
        value: shakeKeptCount,
      },
      {
        label: "启用节奏",
        value: `${enabledCadenceCount}/2`,
      },
    ],
    [
      enabledCadenceCount,
      expiringSoonCount,
      overviewQuery.data,
      recentFailedRunCount,
      shakeKeptCount,
      shakePendingCount,
    ],
  );

  const focusItems = useMemo(
    () =>
      buildFocusItems({
        config: draft,
        hasUnsavedChanges,
        latestRun,
        activeCandidates,
        expiringSoonCount,
        shakePendingCount,
      }),
    [
      activeCandidates,
      draft,
      expiringSoonCount,
      hasUnsavedChanges,
      latestRun,
      shakePendingCount,
    ],
  );

  const navItems = useMemo(
    () => [
      {
        label: "运营总览",
        detail: "先判断节奏、候选池和当前风险。",
        onClick: () => scrollToSection(SECTION_IDS.overview),
      },
      {
        label: "候选与运行",
        detail: "筛选当前候选，回看最近执行结果。",
        onClick: () => scrollToSection(SECTION_IDS.operations),
      },
      {
        label: "规则配置",
        detail: "调整短周期、每日和共享约束。",
        onClick: () => scrollToSection(SECTION_IDS.config),
      },
      {
        label: "摇一摇工作台",
        detail: "管理即时相遇配置，并切换查看 session trace。",
        onClick: () => scrollToSection(SECTION_IDS.shake),
      },
    ],
    [],
  );

  const resetDrafts = () => {
    if (overviewQuery.data?.config) {
      setDraft(overviewQuery.data.config);
    }
    if (serverShakeConfig) {
      setShakeDraft(serverShakeConfig);
    }
    setNotice("已恢复为服务端当前配置。");
  };

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <LoadingBlock label="正在读取需求发现配置..." />;
  }

  if (overviewQuery.isError && overviewQuery.error instanceof Error) {
    return <ErrorBlock message={overviewQuery.error.message} />;
  }

  if (shakeStoreQuery.isError && shakeStoreQuery.error instanceof Error) {
    return <ErrorBlock message={shakeStoreQuery.error.message} />;
  }

  if (!overviewQuery.data || !draft || !shakeDraft) {
    return <LoadingBlock label="正在读取需求发现与摇一摇配置..." />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="需求发现"
        title="角色缺口识别与自动加友工作台"
        description="先看自动补位是否健康，再处理候选池和摇一摇即时相遇，最后再调规则。页面按运营排查顺序重组，减少在长表单里来回找状态。"
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
              立即跑短周期
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                runMutation.mutate("discover_need_characters_daily")
              }
              disabled={runMutation.isPending}
            >
              立即跑每日
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !hasUnsavedChanges}
            >
              保存全部配置
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

      <AdminCallout
        title={
          hasUnsavedChanges ? "当前有未保存改动" : "当前配置已与服务端同步"
        }
        tone={hasUnsavedChanges ? "warning" : "success"}
        description={
          <div className="space-y-3">
            <p>
              {hasUnsavedChanges
                ? "规则调整还没有写回服务端。建议先完成保存，再继续观察候选与运行态，避免判断基于旧配置。"
                : "可以直接围绕候选、运行和摇一摇 session 做排查；如需调整，再回到规则工作台。"}
            </p>
            <div className="flex flex-wrap gap-2">
              {hasUnsavedNeedConfig ? (
                <StatusPill tone="warning">自动补位规则待保存</StatusPill>
              ) : null}
              {hasUnsavedShakeConfig ? (
                <StatusPill tone="warning">摇一摇规则待保存</StatusPill>
              ) : null}
              {!hasUnsavedChanges ? (
                <StatusPill tone="healthy">可直接查看线上状态</StatusPill>
              ) : null}
            </div>
          </div>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetDrafts}
              disabled={!hasUnsavedChanges}
            >
              恢复服务端当前值
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
            >
              保存改动
            </Button>
          </>
        }
      />

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr),300px]">
        <div className="space-y-6">
          <section id={SECTION_IDS.overview} className="scroll-mt-28 space-y-6">
            <Card className="bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,248,239,0.95)_48%,rgba(242,251,246,0.96))]">
              <AdminSectionHeader
                title="运营总览"
                actions={
                  <StatusPill
                    tone={
                      focusItems.some((item) => item.tone === "warning")
                        ? "warning"
                        : "healthy"
                    }
                  >
                    {focusItems.some((item) => item.tone === "warning")
                      ? "需关注"
                      : "运行平稳"}
                  </StatusPill>
                }
              />
              <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                先用四个摘要回答运营最关心的问题：候选池有没有堵住、最近运行有没有出错、自动补位是否还开着、摇一摇里有没有待决定的临时候选。
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="候选池占用"
                  value={`${activeCandidates.length}/${draft.shared.pendingCandidateLimit}`}
                  detail="待处理候选过多会压住新的补位结果。"
                  meta={
                    <StatusPill
                      tone={
                        activeCandidates.length >=
                        draft.shared.pendingCandidateLimit
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
                  label="最近执行"
                  value={
                    latestRun
                      ? `${labelForRun(latestRun.status)} · ${formatCadenceLabel(
                          latestRun.cadenceType,
                        )}`
                      : "暂无"
                  }
                  detail={
                    latestRun
                      ? `${formatCompactDateTime(latestRun.startedAt)} · 信号 ${latestRun.signalCount} 条`
                      : "还没有 recent run。"
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
                  label="自动补位节奏"
                  value={`${enabledCadenceCount}/2`}
                  detail={`短周期 ${draft.shortInterval.enabled ? "开启" : "关闭"} · 每日 ${
                    draft.daily.enabled ? "开启" : "关闭"
                  }`}
                  meta={
                    <StatusPill
                      tone={enabledCadenceCount === 0 ? "warning" : "healthy"}
                    >
                      {enabledCadenceCount === 0 ? "已停用" : "运行中"}
                    </StatusPill>
                  }
                />
                <MetricCard
                  label="摇一摇待决定"
                  value={shakePendingCount}
                  detail={`已保留 ${shakeKeptCount} · 最近记录 ${shakeSessions.length}`}
                  meta={
                    <StatusPill
                      tone={shakePendingCount > 0 ? "warning" : "healthy"}
                    >
                      {shakePendingCount > 0 ? "待处理" : "已清空"}
                    </StatusPill>
                  }
                />
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              {focusItems.map((item) => (
                <AdminCallout
                  key={item.title}
                  title={item.title}
                  tone={item.tone}
                  description={item.description}
                />
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <CadenceSnapshotCard
                title="短周期补位"
                description="更偏即时信号和短期需求，适合捕捉最近刚冒头的缺口。"
                cadenceType="short_interval"
                config={draft.shortInterval}
                recentRuns={overviewQuery.data.recentRuns}
              />
              <CadenceSnapshotCard
                title="每日补位"
                description="更偏中长期缺口和稳定角色位，适合做结构性补齐。"
                cadenceType="daily"
                config={draft.daily}
                recentRuns={overviewQuery.data.recentRuns}
              />
              <SharedHealthCard
                config={draft}
                stats={overviewQuery.data.stats}
                activeCandidateCount={activeCandidates.length}
              />
            </div>
          </section>

          <section
            id={SECTION_IDS.operations}
            className="scroll-mt-28 space-y-6"
          >
            <AdminCallout
              title="候选与运行排查路径"
              tone="info"
              description="先看当前候选池是否接近上限，再按状态筛掉噪音，最后回看最近运行是失败、跳过还是成功。这样能更快判断问题是在规则、输入信号还是生成链路。"
            />

            <div className="grid gap-6 xl:grid-cols-[1.16fr,0.84fr]">
              <CandidateWorkbenchCard
                dataset={candidateDataset}
                onDatasetChange={setCandidateDataset}
                statusFilter={candidateStatusFilter}
                onStatusFilterChange={setCandidateStatusFilter}
                cadenceFilter={candidateCadenceFilter}
                onCadenceFilterChange={setCandidateCadenceFilter}
                activeCount={activeCandidates.length}
                recentCount={recentCandidates.length}
                sourceCount={selectedCandidateSource.length}
                filteredCandidates={filteredCandidates}
                statusCounts={candidateStatusCounts}
                cadenceCounts={candidateCadenceCounts}
              />

              <RunListCard
                runs={filteredRuns}
                cadenceFilter={runCadenceFilter}
                onCadenceFilterChange={setRunCadenceFilter}
              />
            </div>
          </section>

          <section id={SECTION_IDS.config} className="scroll-mt-28 space-y-6">
            <AdminCallout
              title="规则工作台"
              tone="muted"
              description="配置区按运营动作拆成了开关与模式、节奏与窗口、候选阈值、Prompt 四块。先调开关和上限，再看 Prompt，避免一上来就陷进大段文本。"
            />

            <CadenceCard
              title="短周期策略"
              description="更看重最近一段时间的压力、症状、即时求助信号。"
              cadenceType="short"
              config={draft}
              onChange={setDraft}
            />
            <CadenceCard
              title="每日策略"
              description="更看重反复出现的主题、长期缺口和稳定角色位。"
              cadenceType="daily"
              config={draft}
              onChange={setDraft}
            />
            <SharedCard config={draft} onChange={setDraft} />
          </section>

          <section id={SECTION_IDS.shake} className="scroll-mt-28 space-y-6">
            <AdminCallout
              title="摇一摇工作台"
              tone={shakePendingCount > 0 ? "warning" : "info"}
              description={
                shakePendingCount > 0
                  ? `当前有 ${shakePendingCount} 个待决定的即时相遇 session。建议优先看最近几条的 matchReason、方向和 prompt trace。`
                  : "摇一摇和自动补位不是一条链路：前者负责即时相遇和用户决定是否保留，后者负责系统自动补位。"
              }
            />

            <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
              <ShakeConfigCard config={shakeDraft} onChange={setShakeDraft} />

              <div className="space-y-6">
                <ShakeSessionWorkspace
                  sessions={filteredShakeSessions}
                  allSessions={shakeSessions}
                  statusFilter={shakeStatusFilter}
                  onStatusFilterChange={setShakeStatusFilter}
                  selectedSessionId={selectedShakeSessionId}
                  onSelectSession={setSelectedShakeSessionId}
                />
                <ShakeTraceCard session={selectedShakeSession} />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6 2xl:sticky 2xl:top-24 2xl:self-start">
          <AdminSectionNav title="页面导航" items={navItems} />
          <QuickPulseCard
            latestRun={latestRun}
            hasUnsavedChanges={hasUnsavedChanges}
            activeCandidateCount={activeCandidates.length}
            pendingCandidateLimit={draft.shared.pendingCandidateLimit}
            enabledCadenceCount={enabledCadenceCount}
            shakePendingCount={shakePendingCount}
          />
        </div>
      </div>
    </div>
  );
}

function QuickPulseCard({
  latestRun,
  hasUnsavedChanges,
  activeCandidateCount,
  pendingCandidateLimit,
  enabledCadenceCount,
  shakePendingCount,
}: {
  latestRun: NeedDiscoveryRunRecord | null;
  hasUnsavedChanges: boolean;
  activeCandidateCount: number;
  pendingCandidateLimit: number;
  enabledCadenceCount: number;
  shakePendingCount: number;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="当前脉冲"
        actions={
          <StatusPill tone={hasUnsavedChanges ? "warning" : "healthy"}>
            {hasUnsavedChanges ? "未保存" : "已同步"}
          </StatusPill>
        }
      />
      <div className="mt-4 grid gap-3">
        <AdminMiniPanel title="最近执行">
          <div className="text-sm text-[color:var(--text-primary)]">
            {latestRun
              ? `${formatCadenceLabel(latestRun.cadenceType)} · ${labelForRun(
                  latestRun.status,
                )}`
              : "暂无运行"}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {latestRun
              ? formatCompactDateTime(latestRun.startedAt)
              : "等待首次执行"}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="候选池">
          <div className="text-sm text-[color:var(--text-primary)]">
            {activeCandidateCount}/{pendingCandidateLimit}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {activeCandidateCount >= pendingCandidateLimit
              ? "已到上限，新的补位会受阻。"
              : "仍有可用余量。"}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="自动补位">
          <div className="text-sm text-[color:var(--text-primary)]">
            {enabledCadenceCount}/2 节奏开启
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            节奏越少，候选来源越单一。
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="摇一摇">
          <div className="text-sm text-[color:var(--text-primary)]">
            待决定 {shakePendingCount}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            适合快速抽查即时相遇质量。
          </div>
        </AdminMiniPanel>
      </div>
    </Card>
  );
}

function CadenceSnapshotCard({
  title,
  description,
  cadenceType,
  config,
  recentRuns,
}: {
  title: string;
  description: string;
  cadenceType: NeedDiscoveryRunRecord["cadenceType"];
  config: NeedDiscoveryConfig["shortInterval"] | NeedDiscoveryConfig["daily"];
  recentRuns: NeedDiscoveryRunRecord[];
}) {
  const latestRun =
    recentRuns.find((item) => item.cadenceType === cadenceType) ?? null;

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={title}
        actions={
          <StatusPill tone={config.enabled ? "healthy" : "warning"}>
            {config.enabled ? "启用中" : "已停用"}
          </StatusPill>
        }
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {description}
      </p>
      <div className="mt-4 grid gap-3">
        <AdminMiniPanel title="执行模式">
          <div className="text-sm text-[color:var(--text-primary)]">
            {formatExecutionMode(config.executionMode)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="运行节奏">
          <div className="text-sm text-[color:var(--text-primary)]">
            {formatCadenceSchedule(cadenceType, config)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="候选阈值">
          <div className="text-sm text-[color:var(--text-primary)]">
            单轮 {config.maxCandidatesPerRun} 个
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            最低置信度 {config.minConfidenceScore.toFixed(2)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="最近运行">
          <div className="text-sm text-[color:var(--text-primary)]">
            {latestRun ? labelForRun(latestRun.status) : "暂无"}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {latestRun
              ? `${formatCompactDateTime(latestRun.startedAt)} · 信号 ${latestRun.signalCount} 条`
              : "还没有 recent run。"}
          </div>
        </AdminMiniPanel>
      </div>
    </Card>
  );
}

function SharedHealthCard({
  config,
  stats,
  activeCandidateCount,
}: {
  config: NeedDiscoveryConfig;
  stats: {
    pendingCandidates: number;
    acceptedCandidates: number;
    declinedCandidates: number;
    expiredCandidates: number;
    deletedCandidates: number;
    dormantCharacters: number;
  };
  activeCandidateCount: number;
}) {
  const riskDomains = [
    config.shared.allowMedical ? "医疗" : null,
    config.shared.allowLegal ? "法律" : null,
    config.shared.allowFinance ? "金融" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="共享边界"
        actions={<StatusPill tone="muted">统一约束</StatusPill>}
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        这里决定两条自动补位节奏共用的上限、抑制期和风险领域边界。
      </p>
      <div className="mt-4 grid gap-3">
        <AdminMiniPanel title="队列上限">
          <div className="text-sm text-[color:var(--text-primary)]">
            {activeCandidateCount}/{config.shared.pendingCandidateLimit}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            每日创建上限 {config.shared.dailyCreationLimit}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="抑制与过期">
          <div className="text-sm text-[color:var(--text-primary)]">
            申请有效 {config.shared.expiryDays} 天
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            短周期抑制 {config.shared.shortSuppressionDays} 天 · 每日抑制{" "}
            {config.shared.dailySuppressionDays} 天
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="覆盖去重">
          <div className="text-sm text-[color:var(--text-primary)]">
            重叠阈值 {config.shared.coverageDomainOverlapThreshold.toFixed(2)}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            休眠角色 {stats.dormantCharacters} · 已接受{" "}
            {stats.acceptedCandidates}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="高风险领域">
          <div className="text-sm text-[color:var(--text-primary)]">
            {riskDomains.length ? riskDomains.join(" / ") : "全部关闭"}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            已拒绝 {stats.declinedCandidates} · 已过期 {stats.expiredCandidates}
          </div>
        </AdminMiniPanel>
      </div>
    </Card>
  );
}

function CandidateWorkbenchCard({
  dataset,
  onDatasetChange,
  statusFilter,
  onStatusFilterChange,
  cadenceFilter,
  onCadenceFilterChange,
  activeCount,
  recentCount,
  sourceCount,
  filteredCandidates,
  statusCounts,
  cadenceCounts,
}: {
  dataset: CandidateDatasetKey;
  onDatasetChange: (value: CandidateDatasetKey) => void;
  statusFilter: CandidateStatusFilter;
  onStatusFilterChange: (value: CandidateStatusFilter) => void;
  cadenceFilter: CandidateCadenceFilter;
  onCadenceFilterChange: (value: CandidateCadenceFilter) => void;
  activeCount: number;
  recentCount: number;
  sourceCount: number;
  filteredCandidates: NeedDiscoveryCandidateRecord[];
  statusCounts: Record<NeedDiscoveryCandidateRecord["status"], number>;
  cadenceCounts: Record<NeedDiscoveryCandidateRecord["cadenceType"], number>;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="候选工作台"
        actions={
          <StatusPill tone={filteredCandidates.length ? "healthy" : "muted"}>
            筛后 {filteredCandidates.length} 条
          </StatusPill>
        }
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        用范围、状态和 cadence 三层筛选快速收敛候选列表。当前数据源共{" "}
        {sourceCount} 条，优先看待通过、即将过期和生成失败。
      </p>

      <div className="mt-5 space-y-4">
        <FilterGroup label="候选范围">
          <ToggleChip
            label={`当前候选 ${activeCount}`}
            checked={dataset === "active"}
            onChange={() => onDatasetChange("active")}
          />
          <ToggleChip
            label={`最近候选 ${recentCount}`}
            checked={dataset === "recent"}
            onChange={() => onDatasetChange("recent")}
          />
        </FilterGroup>

        <FilterGroup label="状态筛选">
          <ToggleChip
            label={`全部 ${sourceCount}`}
            checked={statusFilter === "all"}
            onChange={() => onStatusFilterChange("all")}
          />
          {CANDIDATE_STATUS_OPTIONS.map((option) => (
            <ToggleChip
              key={option.value}
              label={`${option.label} ${statusCounts[option.value] ?? 0}`}
              checked={statusFilter === option.value}
              onChange={() => onStatusFilterChange(option.value)}
            />
          ))}
        </FilterGroup>

        <FilterGroup label="来源 cadence">
          <ToggleChip
            label={`全部 ${sourceCount}`}
            checked={cadenceFilter === "all"}
            onChange={() => onCadenceFilterChange("all")}
          />
          <ToggleChip
            label={`短周期 ${cadenceCounts.short_interval}`}
            checked={cadenceFilter === "short_interval"}
            onChange={() => onCadenceFilterChange("short_interval")}
          />
          <ToggleChip
            label={`每日 ${cadenceCounts.daily}`}
            checked={cadenceFilter === "daily"}
            onChange={() => onCadenceFilterChange("daily")}
          />
        </FilterGroup>
      </div>

      <div className="mt-5 space-y-4">
        {filteredCandidates.length === 0 ? (
          <AdminEmptyState
            title="当前筛选下没有候选"
            description="可以切换到另一组状态或候选范围，或者先执行一次短周期 / 每日调度。"
          />
        ) : (
          filteredCandidates.map((candidate) => (
            <CandidateRecordCard key={candidate.id} candidate={candidate} />
          ))
        )}
      </div>
    </Card>
  );
}

function CandidateRecordCard({
  candidate,
}: {
  candidate: NeedDiscoveryCandidateRecord;
}) {
  return (
    <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-[color:var(--text-primary)]">
              {candidate.characterName || candidate.needCategory}
            </div>
            <StatusPill tone={toneForCandidate(candidate.status)}>
              {labelForCandidate(candidate.status)}
            </StatusPill>
            <StatusPill tone="muted">
              {formatCadenceLabel(candidate.cadenceType)}
            </StatusPill>
          </div>
          <div className="mt-1 text-xs tracking-[0.14em] text-[color:var(--text-muted)]">
            {candidate.needKey}
          </div>
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          创建于 {formatCompactDateTime(candidate.createdAt)}
        </div>
      </div>

      <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {candidate.coverageGapSummary || "暂无缺口摘要。"}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <AdminMiniPanel title="优先级">
          <div className="text-sm text-[color:var(--text-primary)]">
            {candidate.priorityScore.toFixed(2)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="置信度">
          <div className="text-sm text-[color:var(--text-primary)]">
            {candidate.confidenceScore.toFixed(2)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="时效">
          <div className="text-sm text-[color:var(--text-primary)]">
            {buildCandidateTimingLabel(candidate)}
          </div>
        </AdminMiniPanel>
      </div>

      {candidate.evidenceHighlights.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {candidate.evidenceHighlights.map((item, index) => (
            <span
              key={`${candidate.id}-evidence-${index}`}
              className="rounded-full border border-[color:var(--border-faint)] bg-white/85 px-3 py-1 text-xs text-[color:var(--text-secondary)]"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}

      {candidate.friendRequestGreeting ? (
        <AdminSubpanel
          title="好友申请开场"
          className="mt-4 bg-white/80"
          contentClassName="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]"
        >
          {candidate.friendRequestGreeting}
        </AdminSubpanel>
      ) : null}
    </div>
  );
}

function RunListCard({
  runs,
  cadenceFilter,
  onCadenceFilterChange,
}: {
  runs: NeedDiscoveryRunRecord[];
  cadenceFilter: RunCadenceFilter;
  onCadenceFilterChange: (value: RunCadenceFilter) => void;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="最近运行"
        actions={
          <StatusPill tone={runs.length ? "healthy" : "muted"}>
            共 {runs.length} 条
          </StatusPill>
        }
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        用 cadence 切换看短周期或每日的执行结果，优先关注失败和连续跳过。
      </p>

      <div className="mt-5">
        <FilterGroup label="运行筛选">
          <ToggleChip
            label="全部"
            checked={cadenceFilter === "all"}
            onChange={() => onCadenceFilterChange("all")}
          />
          <ToggleChip
            label="短周期"
            checked={cadenceFilter === "short_interval"}
            onChange={() => onCadenceFilterChange("short_interval")}
          />
          <ToggleChip
            label="每日"
            checked={cadenceFilter === "daily"}
            onChange={() => onCadenceFilterChange("daily")}
          />
        </FilterGroup>
      </div>

      <div className="mt-5 space-y-4">
        {runs.length === 0 ? (
          <AdminEmptyState
            title="没有命中的运行记录"
            description="当前筛选条件下没有 recent run，可以切回全部或先手动执行一次。"
          />
        ) : (
          runs.map((run) => <RunRecordCard key={run.id} run={run} />)
        )}
      </div>
    </Card>
  );
}

function RunRecordCard({ run }: { run: NeedDiscoveryRunRecord }) {
  return (
    <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-base font-semibold text-[color:var(--text-primary)]">
            {formatCadenceLabel(run.cadenceType)}
          </div>
          <StatusPill tone={toneForRun(run.status)}>
            {labelForRun(run.status)}
          </StatusPill>
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          {formatCompactDateTime(run.startedAt)}
        </div>
      </div>

      <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {run.summary || run.skipReason || run.errorMessage || "暂无摘要"}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title="信号与窗口">
          <div className="text-sm text-[color:var(--text-primary)]">
            信号 {run.signalCount} 条
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {formatRunWindow(run)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="命中结果">
          <div className="text-sm text-[color:var(--text-primary)]">
            {run.selectedNeedKeys.length
              ? run.selectedNeedKeys.join(" / ")
              : "没有选中 need"}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            最近信号 {formatCompactDateTime(run.latestSignalAt)}
          </div>
        </AdminMiniPanel>
      </div>

      {run.errorMessage ? (
        <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-700">
          {run.errorMessage}
        </div>
      ) : null}
    </div>
  );
}

function ShakeSessionWorkspace({
  sessions,
  allSessions,
  statusFilter,
  onStatusFilterChange,
  selectedSessionId,
  onSelectSession,
}: {
  sessions: ShakeDiscoverySessionRecord[];
  allSessions: ShakeDiscoverySessionRecord[];
  statusFilter: ShakeStatusFilter;
  onStatusFilterChange: (value: ShakeStatusFilter) => void;
  selectedSessionId: string | null;
  onSelectSession: (value: string) => void;
}) {
  const counts = useMemo(
    () => buildShakeStatusCounts(allSessions),
    [allSessions],
  );

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="最近摇一摇 Session"
        actions={
          <StatusPill tone={sessions.length ? "healthy" : "muted"}>
            命中 {sessions.length} 条
          </StatusPill>
        }
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        先按状态筛选，再点具体 session 查看右侧
        trace。这样比默认只盯第一条更适合运营抽查质量。
      </p>

      <div className="mt-5">
        <FilterGroup label="状态筛选">
          <ToggleChip
            label={`全部 ${allSessions.length}`}
            checked={statusFilter === "all"}
            onChange={() => onStatusFilterChange("all")}
          />
          {SHAKE_STATUS_OPTIONS.map((option) => (
            <ToggleChip
              key={option.value}
              label={`${option.label} ${counts[option.value] ?? 0}`}
              checked={statusFilter === option.value}
              onChange={() => onStatusFilterChange(option.value)}
            />
          ))}
        </FilterGroup>
      </div>

      <div className="mt-5 space-y-3">
        {sessions.length === 0 ? (
          <AdminEmptyState
            title="当前筛选下没有摇一摇记录"
            description="可以切回全部，或者等用户产生新的 shake session 后再来查看。"
          />
        ) : (
          sessions.slice(0, 12).map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelectSession(session.id)}
              className={[
                "w-full rounded-[22px] border px-4 py-4 text-left transition",
                selectedSessionId === session.id
                  ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] shadow-[var(--shadow-card)]"
                  : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-soft)] hover:border-[color:var(--border-subtle)] hover:bg-white/90",
              ].join(" ")}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-[color:var(--text-primary)]">
                      {session.character.name}
                    </div>
                    <StatusPill tone={toneForShakeStatus(session.status)}>
                      {labelForShakeStatus(session.status)}
                    </StatusPill>
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {session.character.relationship}
                  </div>
                </div>
                <div className="text-xs text-[color:var(--text-muted)]">
                  {formatCompactDateTime(session.createdAt)}
                </div>
              </div>

              <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                {session.matchReason || session.failureReason || "暂无说明。"}
              </div>

              {session.selectedDirection ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[color:var(--border-faint)] bg-white/85 px-3 py-1 text-xs text-[color:var(--text-secondary)]">
                    {session.selectedDirection.relationshipLabel}
                  </span>
                  {session.selectedDirection.expertDomains.map((domain) => (
                    <span
                      key={`${session.id}-${domain}`}
                      className="rounded-full border border-[color:var(--border-faint)] bg-white/85 px-3 py-1 text-xs text-[color:var(--text-secondary)]"
                    >
                      {domain}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          ))
        )}
      </div>
    </Card>
  );
}

function ShakeTraceCard({
  session,
}: {
  session: ShakeDiscoverySessionRecord | null;
}) {
  if (!session) {
    return (
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader title="Session Trace" />
        <div className="mt-4">
          <AdminEmptyState
            title="还没有可查看的 trace"
            description="当右侧列表存在 session 时，点击任意一条即可查看方向规划和角色生成提示词。"
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="当前 Session Trace"
        actions={
          <StatusPill tone={toneForShakeStatus(session.status)}>
            {labelForShakeStatus(session.status)}
          </StatusPill>
        }
      />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title="角色预览">
          <div className="text-sm text-[color:var(--text-primary)]">
            {session.character.name}
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            {session.character.relationship}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="匹配说明">
          <div className="text-sm text-[color:var(--text-primary)]">
            {session.matchReason || "暂无"}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="问候语">
          <div className="text-sm text-[color:var(--text-primary)]">
            {session.greeting || "暂无"}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="有效期">
          <div className="text-sm text-[color:var(--text-primary)]">
            {session.expiresAt
              ? formatCompactDateTime(session.expiresAt)
              : "未记录"}
          </div>
        </AdminMiniPanel>
      </div>

      {session.selectedDirection ? (
        <div className="mt-4 grid gap-3">
          <AdminSubpanel
            title="选中方向"
            contentClassName="mt-3 space-y-3 text-sm text-[color:var(--text-secondary)]"
          >
            <div className="font-medium text-[color:var(--text-primary)]">
              {session.selectedDirection.relationshipLabel}
            </div>
            <div>{session.selectedDirection.whyNow}</div>
            <div className="flex flex-wrap gap-2">
              {session.selectedDirection.expertDomains.map((domain) => (
                <span
                  key={`${session.id}-trace-${domain}`}
                  className="rounded-full border border-[color:var(--border-faint)] bg-white/85 px-3 py-1 text-xs text-[color:var(--text-secondary)]"
                >
                  {domain}
                </span>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <AdminMiniPanel title="Fit">
                <div className="text-sm text-[color:var(--text-primary)]">
                  {session.selectedDirection.fitScore.toFixed(2)}
                </div>
              </AdminMiniPanel>
              <AdminMiniPanel title="Novelty">
                <div className="text-sm text-[color:var(--text-primary)]">
                  {session.selectedDirection.noveltyScore.toFixed(2)}
                </div>
              </AdminMiniPanel>
              <AdminMiniPanel title="Surprise">
                <div className="text-sm text-[color:var(--text-primary)]">
                  {session.selectedDirection.surpriseBoost.toFixed(2)}
                </div>
              </AdminMiniPanel>
            </div>
          </AdminSubpanel>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <AdminSubpanel title="方向规划提示词" contentClassName="mt-3">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[color:var(--text-secondary)]">
            {session.planningPrompt || "暂无"}
          </pre>
        </AdminSubpanel>
        <AdminSubpanel title="角色生成提示词" contentClassName="mt-3">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[color:var(--text-secondary)]">
            {session.generationPrompt || "暂无"}
          </pre>
        </AdminSubpanel>
      </div>
    </Card>
  );
}

function ShakeConfigCard({
  config,
  onChange,
}: {
  config: ShakeDiscoveryConfig;
  onChange: (next: ShakeDiscoveryConfig) => void;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="摇一摇即时生成"
        actions={
          <StatusPill tone={config.enabled ? "healthy" : "warning"}>
            {config.enabled ? "启用中" : "已停用"}
          </StatusPill>
        }
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        这里控制用户手动摇一摇时的即时相遇。运营关注点不是“是否自动补位”，而是“候选够不够新鲜、解释是否合理、有没有过度冒险”。
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title="时效与频控">
          <div className="text-sm text-[color:var(--text-primary)]">
            冷却 {config.cooldownMinutes} 分钟
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            单次有效 {config.sessionExpiryMinutes} 分钟 · 每日上限{" "}
            {config.maxSessionsPerDay}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="方向采样">
          <div className="text-sm text-[color:var(--text-primary)]">
            方向 {config.candidateDirectionCount} 个
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            回看 {config.evidenceWindowHours} 小时 · 证据最多{" "}
            {config.maxEvidenceItems} 条
          </div>
        </AdminMiniPanel>
      </div>

      <div className="mt-5 space-y-4">
        <ConfigBlock
          title="开关与时效"
          description="控制是否允许即时相遇，以及 session 的冷却和过期策略。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigCheckbox
              label="启用摇一摇生成"
              hint="关闭后用户仍可进入入口，但不会生成新候选。"
              checked={config.enabled}
              onChange={(checked) =>
                onChange({
                  ...config,
                  enabled: checked,
                })
              }
            />
            <ConfigCheckbox
              label="要求已有赛博分身信号"
              hint="开启后，只有画像足够完整时才允许生成临时候选。"
              checked={config.requireCyberAvatarSignals}
              onChange={(checked) =>
                onChange({
                  ...config,
                  requireCyberAvatarSignals: checked,
                })
              }
            />
            <ConfigNumber
              label="冷却分钟"
              hint="限制连续摇一摇频率，避免临时候选抖动过大。"
              value={config.cooldownMinutes}
              onChange={(value) =>
                onChange({
                  ...config,
                  cooldownMinutes: value,
                })
              }
            />
            <ConfigNumber
              label="会话有效期（分钟）"
              hint="超过这个时间，待决定的临时候选会自动过期。"
              value={config.sessionExpiryMinutes}
              onChange={(value) =>
                onChange({
                  ...config,
                  sessionExpiryMinutes: value,
                })
              }
            />
            <ConfigNumber
              label="每日最多摇一摇"
              hint="控制单日即时相遇曝光量。"
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
          title="方向采样与权重"
          description="控制一次摇一摇从多少证据里取样，以及生成方向的新鲜感和惊喜程度。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigNumber
              label="回看小时"
              hint="越长越稳定，越短越贴近当下状态。"
              value={config.evidenceWindowHours}
              onChange={(value) =>
                onChange({
                  ...config,
                  evidenceWindowHours: value,
                })
              }
            />
            <ConfigNumber
              label="最多证据条数"
              hint="限制一次规划时注入多少上游信号。"
              value={config.maxEvidenceItems}
              onChange={(value) =>
                onChange({
                  ...config,
                  maxEvidenceItems: value,
                })
              }
            />
            <ConfigNumber
              label="候选方向数"
              hint="方向数越多，运营可观察到的相遇分布越丰富。"
              value={config.candidateDirectionCount}
              onChange={(value) =>
                onChange({
                  ...config,
                  candidateDirectionCount: value,
                })
              }
            />
            <ConfigNumber
              label="新鲜感权重"
              hint="提高后更容易避开重复方向。"
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
              label="惊喜系数"
              hint="提高后会更愿意抽取非最稳妥但仍合理的方向。"
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
          title="高风险领域"
          description="手动摇一摇可以允许更强的即时性，但高风险领域仍要严格控边界。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigCheckbox
              label="允许医疗类角色"
              checked={config.allowMedical}
              onChange={(checked) =>
                onChange({
                  ...config,
                  allowMedical: checked,
                })
              }
            />
            <ConfigCheckbox
              label="允许法律类角色"
              checked={config.allowLegal}
              onChange={(checked) =>
                onChange({
                  ...config,
                  allowLegal: checked,
                })
              }
            />
            <ConfigCheckbox
              label="允许金融类角色"
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
          title="方向规划 Prompt"
          description="决定这次摇一摇应该往哪几类真实联系人方向去想。"
        >
          <PromptField
            label="方向规划提示词"
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
          title="角色生成 Prompt"
          description="决定方向确定后，如何把它落成一个用户愿意决定是否添加的真实联系人。"
        >
          <PromptField
            label="角色生成提示词"
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
  const cadence = cadenceType === "short" ? config.shortInterval : config.daily;

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={title}
        actions={
          <StatusPill tone={cadence.enabled ? "healthy" : "warning"}>
            {cadence.enabled ? "启用中" : "已停用"}
          </StatusPill>
        }
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {description}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminMiniPanel title="执行模式">
          <div className="text-sm text-[color:var(--text-primary)]">
            {formatExecutionMode(cadence.executionMode)}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="运行节奏">
          <div className="text-sm text-[color:var(--text-primary)]">
            {cadenceType === "short"
              ? `每 ${config.shortInterval.intervalMinutes} 分钟`
              : `每天 ${padNumber(config.daily.runAtHour)}:${padNumber(
                  config.daily.runAtMinute,
                )}`}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="回看窗口">
          <div className="text-sm text-[color:var(--text-primary)]">
            {cadenceType === "short"
              ? `${config.shortInterval.lookbackHours} 小时`
              : `${config.daily.lookbackDays} 天`}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="候选阈值">
          <div className="text-sm text-[color:var(--text-primary)]">
            最多 {cadence.maxCandidatesPerRun} 个
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            最低置信度 {cadence.minConfidenceScore.toFixed(2)}
          </div>
        </AdminMiniPanel>
      </div>

      <div className="mt-5 space-y-4">
        <ConfigBlock
          title="开关与执行模式"
          description="决定这条 cadence 是否参与自动补位，以及是直接发申请还是只生成草稿。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigCheckbox
              label="启用该节奏"
              hint="关闭后，该 cadence 不再产出新候选。"
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
              label="执行模式"
              hint="dry run 适合先观察候选质量，auto send 适合直接补位。"
              value={cadence.executionMode}
              options={[
                { value: "auto_send", label: "直接创建并发起好友申请" },
                { value: "dry_run", label: "只生成候选草稿" },
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
          title="节奏与窗口"
          description="决定这条 cadence 什么时候跑、看多久的信号，以及是否允许空跑。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {cadenceType === "short" ? (
              <>
                <ConfigNumber
                  label="间隔分钟"
                  hint="越短越敏感，越长越稳。"
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
                  label="回看小时"
                  hint="决定短周期会读到多长时间窗口的信号。"
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
                  label="无新信号则跳过"
                  hint="开启后能降低无效运行。"
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
                  label="执行小时"
                  hint="按本地时间设置每日启动点。"
                  value={config.daily.runAtHour}
                  onChange={(value) =>
                    onChange({
                      ...config,
                      daily: { ...config.daily, runAtHour: value },
                    })
                  }
                />
                <ConfigNumber
                  label="执行分钟"
                  hint="和执行小时组合成固定的日调度时间。"
                  value={config.daily.runAtMinute}
                  onChange={(value) =>
                    onChange({
                      ...config,
                      daily: { ...config.daily, runAtMinute: value },
                    })
                  }
                />
                <ConfigNumber
                  label="回看天数"
                  hint="越长越偏向结构性缺口。"
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
          title="候选阈值"
          description="控制每轮最多生成多少候选，以及需要多高的置信度才允许通过。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigNumber
              label="单次最多候选"
              hint="太高会让候选池快速堆积。"
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
              label="最低置信度"
              hint="太低会引入噪音，太高会错过边缘但有价值的候选。"
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
          title="分析 Prompt"
          description="决定这条 cadence 如何从最近信号中识别角色缺口和 need key。"
        >
          <PromptField
            label="分析提示词"
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
  const shared = config.shared;

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="共享约束"
        actions={<StatusPill tone="muted">跨节奏统一</StatusPill>}
      />
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        这里不是单条 cadence
        的细节，而是所有自动补位统一遵守的队列上限、抑制期和风险域边界。
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminMiniPanel title="队列上限">
          <div className="text-sm text-[color:var(--text-primary)]">
            待处理最多 {shared.pendingCandidateLimit}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="创建上限">
          <div className="text-sm text-[color:var(--text-primary)]">
            每日最多 {shared.dailyCreationLimit}
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="抑制期">
          <div className="text-sm text-[color:var(--text-primary)]">
            短周期 {shared.shortSuppressionDays} 天
          </div>
          <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
            每日 {shared.dailySuppressionDays} 天
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="风险域">
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
          title="容量与过期"
          description="控制候选池最多允许积压多少条，以及好友申请多久后视为无效。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigNumber
              label="待处理候选上限"
              hint="达到上限后，新候选会受抑制。"
              value={shared.pendingCandidateLimit}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: { ...shared, pendingCandidateLimit: value },
                })
              }
            />
            <ConfigNumber
              label="每日创建上限"
              hint="控制单日自动补位的整体产量。"
              value={shared.dailyCreationLimit}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: { ...shared, dailyCreationLimit: value },
                })
              }
            />
            <ConfigNumber
              label="好友申请有效期（天）"
              hint="超时后会自动按过期处理。"
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
          title="去重与抑制"
          description="避免相似方向反复命中，以及同一 need 在短期内被重复生成。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigNumber
              label="短周期抑制期（天）"
              hint="避免最近刚触发过的短期 need 反复进入候选池。"
              value={shared.shortSuppressionDays}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: { ...shared, shortSuppressionDays: value },
                })
              }
            />
            <ConfigNumber
              label="每日抑制期（天）"
              hint="避免每日策略反复生成同类稳定角色位。"
              value={shared.dailySuppressionDays}
              onChange={(value) =>
                onChange({
                  ...config,
                  shared: { ...shared, dailySuppressionDays: value },
                })
              }
            />
            <ConfigNumber
              label="领域重叠阈值"
              hint="值越低，越严格地把相似角色当成已覆盖。"
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
          title="高风险领域边界"
          description="医疗、法律、金融角色属于高风险方向，是否允许需要明确管理。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigCheckbox
              label="允许医疗类角色"
              checked={shared.allowMedical}
              onChange={(checked) =>
                onChange({
                  ...config,
                  shared: { ...shared, allowMedical: checked },
                })
              }
            />
            <ConfigCheckbox
              label="允许法律类角色"
              checked={shared.allowLegal}
              onChange={(checked) =>
                onChange({
                  ...config,
                  shared: { ...shared, allowLegal: checked },
                })
              }
            />
            <ConfigCheckbox
              label="允许金融类角色"
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
          title="角色生成 Prompt"
          description="当 need 确认通过后，决定最终角色草稿和好友申请文案如何生成。"
        >
          <PromptField
            label="角色生成提示词"
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

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
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

function buildFocusItems({
  config,
  hasUnsavedChanges,
  latestRun,
  activeCandidates,
  expiringSoonCount,
  shakePendingCount,
}: {
  config: NeedDiscoveryConfig | null;
  hasUnsavedChanges: boolean;
  latestRun: NeedDiscoveryRunRecord | null;
  activeCandidates: NeedDiscoveryCandidateRecord[];
  expiringSoonCount: number;
  shakePendingCount: number;
}) {
  const items: Array<{
    tone: "warning" | "success" | "info" | "muted";
    title: string;
    description: string;
  }> = [];

  if (config && !config.shortInterval.enabled && !config.daily.enabled) {
    items.push({
      tone: "warning",
      title: "自动补位已全部停用",
      description:
        "短周期和每日两个 cadence 都关闭了，系统不会继续自动补位新角色。",
    });
  }

  if (latestRun?.status === "failed") {
    items.push({
      tone: "warning",
      title: "最近一次调度失败",
      description:
        latestRun.errorMessage ||
        latestRun.summary ||
        "最近一次运行失败，但没有返回更多摘要。",
    });
  }

  if (
    config &&
    activeCandidates.length >= config.shared.pendingCandidateLimit
  ) {
    items.push({
      tone: "warning",
      title: "候选池已接近上限",
      description: `当前活跃候选 ${activeCandidates.length} 条，已触及共享上限 ${config.shared.pendingCandidateLimit}。建议先清理旧候选或下调生成量。`,
    });
  }

  if (expiringSoonCount > 0) {
    items.push({
      tone: "info",
      title: "有候选即将过期",
      description: `未来 24 小时内有 ${expiringSoonCount} 条候选会过期，适合优先排查是否是审批链路过慢或生成质量不够。`,
    });
  }

  if (shakePendingCount > 0) {
    items.push({
      tone: "info",
      title: "摇一摇存在待决定 session",
      description: `当前有 ${shakePendingCount} 条摇一摇临时候选待决定，建议抽查 matchReason 和 greeting 是否自然。`,
    });
  }

  if (hasUnsavedChanges) {
    items.push({
      tone: "info",
      title: "页面存在未保存改动",
      description:
        "规则已经在本地编辑但尚未保存，当前看到的运行状态仍对应旧配置。",
    });
  }

  if (!items.length) {
    items.push({
      tone: "success",
      title: "当前运行平稳",
      description:
        "自动补位未见明显阻塞，候选池和摇一摇都在可控范围内，可以按需细看具体候选质量。",
    });
  }

  return items.slice(0, 4);
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

function toneForRun(status: NeedDiscoveryRunRecord["status"]) {
  if (status === "failed") {
    return "warning" as const;
  }
  return status === "success" ? ("healthy" as const) : ("muted" as const);
}

function labelForRun(status: NeedDiscoveryRunRecord["status"]) {
  if (status === "failed") {
    return "失败";
  }
  return status === "success" ? "成功" : "跳过";
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
      return "待通过";
    case "accepted":
      return "已接受";
    case "declined":
      return "已拒绝";
    case "expired":
      return "已过期";
    case "deleted":
      return "已删除";
    case "generation_failed":
      return "生成失败";
    default:
      return "草稿";
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
      return "待决定";
    case "kept":
      return "已保留";
    case "dismissed":
      return "已跳过";
    case "expired":
      return "已过期";
    case "failed":
      return "生成失败";
    case "generating":
      return "生成中";
    default:
      return status;
  }
}

function formatCadenceLabel(
  cadenceType: NeedDiscoveryRunRecord["cadenceType"],
) {
  return cadenceType === "short_interval" ? "短周期" : "每日";
}

function formatExecutionMode(value: "dry_run" | "auto_send") {
  return value === "dry_run" ? "只生成草稿" : "直接创建并发起好友申请";
}

function formatCadenceSchedule(
  cadenceType: NeedDiscoveryRunRecord["cadenceType"],
  config: NeedDiscoveryConfig["shortInterval"] | NeedDiscoveryConfig["daily"],
) {
  if (cadenceType === "short_interval") {
    const shortConfig = config as NeedDiscoveryConfig["shortInterval"];
    return `每 ${shortConfig.intervalMinutes} 分钟，回看 ${shortConfig.lookbackHours} 小时`;
  }

  const dailyConfig = config as NeedDiscoveryConfig["daily"];
  return `每天 ${padNumber(dailyConfig.runAtHour)}:${padNumber(
    dailyConfig.runAtMinute,
  )}，回看 ${dailyConfig.lookbackDays} 天`;
}

function buildCandidateTimingLabel(candidate: NeedDiscoveryCandidateRecord) {
  if (candidate.acceptedAt) {
    return `接受于 ${formatCompactDateTime(candidate.acceptedAt)}`;
  }
  if (candidate.declinedAt) {
    return `拒绝于 ${formatCompactDateTime(candidate.declinedAt)}`;
  }
  if (candidate.expiresAt) {
    return `过期于 ${formatCompactDateTime(candidate.expiresAt)}`;
  }
  if (candidate.suppressedUntil) {
    return `抑制到 ${formatCompactDateTime(candidate.suppressedUntil)}`;
  }
  if (candidate.deletedAt) {
    return `删除于 ${formatCompactDateTime(candidate.deletedAt)}`;
  }
  return `更新于 ${formatCompactDateTime(candidate.updatedAt)}`;
}

function formatRunWindow(run: NeedDiscoveryRunRecord) {
  if (!run.windowStartedAt && !run.windowEndedAt) {
    return "未记录窗口";
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
    allowMedical ? "医疗" : null,
    allowLegal ? "法律" : null,
    allowFinance ? "金融" : null,
  ].filter((item): item is string => Boolean(item));

  return items.length ? items.join(" / ") : "全部关闭";
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

function scrollToSection(id: string) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatCompactDateTime(value?: string | null) {
  if (!value) {
    return "未记录";
  }

  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
