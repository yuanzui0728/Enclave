import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import {
  CHAT_EVENTS,
  CHAT_NAMESPACE,
  createBackup,
  exportDiagnostics,
  getAiModel,
  getAvailableModels,
  getEvalOverview,
  getFeed,
  getProviderConfig,
  getLatestWorldContext,
  getMoments,
  getRealtimeStatus,
  getSchedulerStatus,
  getSystemLogs,
  getSystemStatus,
  listCharacters,
  restoreBackup,
  runInferencePreview,
  runSchedulerJob,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  ListItemCard,
  LoadingBlock,
  MetricCard,
  StatusPill,
  TextAreaField,
  useDesktopRuntime,
} from "@yinjie/ui";
import { translateRuntimeMessage, useAppLocale } from "@yinjie/i18n";
import {
  AdminActionFeedback,
  AdminActionGroup,
  AdminCallout,
  AdminCompactStatusCard,
  AdminDetailPanel,
  AdminDangerZone,
  AdminEyebrow,
  AdminJumpCard,
  AdminMetaText,
  AdminPanelEmpty,
  AdminRecordCard,
  AdminSectionHeader,
  AdminSectionNav,
  AdminSoftBox,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { buildDigitalHumanAdminSummary } from "../lib/digital-human-admin-summary";

type InferencePreviewForm = {
  prompt: string;
  systemPrompt?: string;
};

type DashboardRoute = "/" | "/setup" | "/characters" | "/evals" | "/reply-logic";

type DutyIssue = {
  key: string;
  title: string;
  description: string;
  statusLabel: string;
  tone: "healthy" | "warning" | "muted";
  meta?: string;
  actionLabel?: string;
  to?: DashboardRoute;
  onAction?: () => void;
};

export function DashboardPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const { locale } = useAppLocale();
  const t = translateRuntimeMessage;
  const [successNotice, setSuccessNotice] = useState("");
  const overviewSectionRef = useRef<HTMLDivElement>(null);
  const runtimeSectionRef = useRef<HTMLDivElement>(null);
  const signalsSectionRef = useRef<HTMLDivElement>(null);
  const schedulerSectionRef = useRef<HTMLDivElement>(null);
  const operationsSectionRef = useRef<HTMLDivElement>(null);

  const adminStatsQuery = useQuery({
    queryKey: ["admin-stats", baseUrl],
    queryFn: () => adminApi.getStats(baseUrl),
    retry: 2,
  });

  const adminSystemQuery = useQuery({
    queryKey: ["admin-system", baseUrl],
    queryFn: () => adminApi.getSystem(baseUrl),
    retry: 2,
  });

  const { desktopAvailable, desktopStatusQuery, runtimeContextQuery, runtimeDiagnosticsQuery } = useDesktopRuntime({
    queryKeyPrefix: "admin-desktop",
    invalidateOnAction: [["admin-system-status"]],
  });

  const statusQuery = useQuery({
    queryKey: ["admin-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });

  const charactersQuery = useQuery({
    queryKey: ["admin-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });

  const aiModelQuery = useQuery({
    queryKey: ["admin-ai-model", baseUrl],
    queryFn: () => getAiModel(baseUrl),
  });

  const providerConfigQuery = useQuery({
    queryKey: ["admin-provider-config", baseUrl],
    queryFn: () => getProviderConfig(baseUrl),
  });

  const availableModelsQuery = useQuery({
    queryKey: ["admin-available-models", baseUrl],
    queryFn: () => getAvailableModels(baseUrl),
  });

  const logsQuery = useQuery({
    queryKey: ["admin-system-logs", baseUrl],
    queryFn: () => getSystemLogs(baseUrl),
  });

  const worldContextQuery = useQuery({
    queryKey: ["admin-world-context", baseUrl],
    queryFn: () => getLatestWorldContext(baseUrl),
  });

  const schedulerQuery = useQuery({
    queryKey: ["admin-scheduler-status", baseUrl],
    queryFn: () => getSchedulerStatus(baseUrl),
  });

  const realtimeQuery = useQuery({
    queryKey: ["admin-realtime-status", baseUrl],
    queryFn: () => getRealtimeStatus(baseUrl),
  });

  const momentsQuery = useQuery({
    queryKey: ["admin-moments", baseUrl],
    queryFn: () => getMoments(baseUrl),
  });

  const feedQuery = useQuery({
    queryKey: ["admin-feed", baseUrl],
    queryFn: () => getFeed(1, 6, baseUrl),
  });

  const evalOverviewQuery = useQuery({
    queryKey: ["admin-eval-overview", baseUrl],
    queryFn: () => getEvalOverview(baseUrl),
  });

  const previewForm = useForm<InferencePreviewForm>({
    defaultValues: {
      prompt: t(msg`回一句自然的日常问候，不要解释。`),
      systemPrompt: "",
    },
  });

  const previewMutation = useMutation({
    mutationFn: (values: InferencePreviewForm) =>
      runInferencePreview(
        {
          prompt: values.prompt.trim(),
          systemPrompt: values.systemPrompt?.trim() ? values.systemPrompt.trim() : undefined,
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setSuccessNotice(t(msg`推理预览已完成。`));
      await queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] });
    },
  });

  const exportDiagnosticsMutation = useMutation({
    mutationFn: () => exportDiagnostics(baseUrl),
    onSuccess: (result) => {
      setSuccessNotice(result.message);
    },
  });

  const createBackupMutation = useMutation({
    mutationFn: () => createBackup(baseUrl),
    onSuccess: (result) => {
      setSuccessNotice(result.message);
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: () => restoreBackup(baseUrl),
    onSuccess: async () => {
      setSuccessNotice(t(msg`备份恢复已完成。`));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-provider-config", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-ai-model", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-world-context", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-scheduler-status", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-moments", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-feed", baseUrl] }),
      ]);
    },
  });

  const schedulerRunMutation = useMutation({
    mutationFn: (jobId: string) => runSchedulerJob(jobId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice(t(msg`调度任务已执行完成。`));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-world-context", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-scheduler-status", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-moments", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-feed", baseUrl] }),
      ]);
    },
  });

  const previewCharacters = charactersQuery.data?.slice(0, 5) ?? [];
  const previewMoments = momentsQuery.data?.slice(0, 3) ?? [];
  const previewFeedPosts = feedQuery.data?.posts.slice(0, 3) ?? [];
  const previewRooms = realtimeQuery.data?.rooms.slice(0, 6) ?? [];
  const previewRealtimeEvents = realtimeQuery.data?.recentEvents.slice(0, 6) ?? [];
  const previewLogs = logsQuery.data?.slice(0, 6) ?? [];
  const recentSchedulerRuns = schedulerQuery.data?.recentRuns.slice(0, 5) ?? [];
  const runningSchedulerJobId = schedulerRunMutation.isPending ? schedulerRunMutation.variables : null;
  const operationsBusy =
    exportDiagnosticsMutation.isPending || createBackupMutation.isPending || restoreBackupMutation.isPending;
  const providerConfigured = Boolean(providerConfigQuery.data?.model?.trim());
  const digitalHumanSummary = buildDigitalHumanAdminSummary(statusQuery.data?.digitalHumanGateway);
  const desktopRuntimeReady = desktopAvailable
    ? Boolean(desktopStatusQuery.data?.reachable && runtimeContextQuery.data?.runtimeDataDir)
    : Boolean(statusQuery.data?.coreApi.healthy);
  const systemHealthy = Boolean(statusQuery.data?.coreApi.healthy);
  const primaryActionHref = !desktopRuntimeReady || !providerConfigured ? "/setup" : "/evals";
  const primaryActionLabel =
    !desktopRuntimeReady || !providerConfigured
      ? t(msg`打开运行设置`)
      : t(msg`前往评测验证`);
  const nextActionMessage = !desktopRuntimeReady
    ? t(msg`运行时尚未完全恢复。先进入设置页确认远程 API、运行数据目录和桌面托管状态。`)
    : !providerConfigured
      ? t(msg`核心接口已在线，但推理服务还未配置。下一步应完成设置。`)
      : systemHealthy
        ? t(msg`系统已进入可运维状态。建议下一步进入评测页验证当前生成链质量。`)
        : t(msg`核心接口仍未健康，优先排查设置页和运维操作区。`);
  const totalCharacters = charactersQuery.data?.length ?? statusQuery.data?.worldSurface.charactersCount ?? 0;
  const onlineCharacterCount = previewCharacters.filter((item) => item.isOnline).length;
  const ownerCount = statusQuery.data?.worldSurface.ownerCount ?? adminStatsQuery.data?.ownerCount ?? null;
  const availableModelCount = availableModelsQuery.data?.models.length ?? 0;
  const schedulerJobs = schedulerQuery.data?.jobs ?? [];
  const enabledSchedulerJobCount = schedulerJobs.filter((job) => job.enabled).length;
  const recentSchedulerErrorCount = (schedulerQuery.data?.recentRuns ?? []).filter((run) => run.status === "error").length;
  const hasSchedulerIssues = recentSchedulerErrorCount > 0;
  const failedEvalCount = evalOverviewQuery.data?.failedRunCount ?? 0;
  const hasEvalFailures = failedEvalCount > 0;
  const blockerCount = [
    desktopAvailable && !desktopRuntimeReady,
    !desktopAvailable && !systemHealthy,
    !providerConfigured,
  ].filter(Boolean).length;
  const watchItemCount = [
    ownerCount !== null && ownerCount !== 1,
    !digitalHumanSummary.ready,
    hasSchedulerIssues,
    hasEvalFailures,
  ].filter(Boolean).length;
  const overallTone = blockerCount > 0 || watchItemCount > 0 ? "warning" : "healthy";
  const overallLabel =
    blockerCount > 0
      ? t(msg`${blockerCount} 个阻塞项`)
      : watchItemCount > 0
        ? t(msg`${watchItemCount} 个关注项`)
        : t(msg`可继续运营`);
  const overallSummary =
    blockerCount > 0
      ? t(msg`先处理阻塞项，再进入角色、内容或评测工作区。`)
      : watchItemCount > 0
        ? t(msg`实例基本可用，但仍有运行面需要复核。`)
        : t(msg`当前没有高优先级阻塞，可以继续做内容抽查和运营操作。`);
  const heroTitle =
    blockerCount > 0
      ? t(msg`先处理运行阻塞，再进入具体运营工作区。`)
      : watchItemCount > 0
        ? t(msg`实例已基本可用，继续复核剩余关注项。`)
        : t(msg`实例已进入可运营状态，可以直接开始巡检与操作。`);

  const dutyIssues: DutyIssue[] = [];

  if (desktopAvailable && !desktopRuntimeReady) {
    dutyIssues.push({
      key: "desktop-runtime",
      title: t(msg`桌面壳托管运行时未就绪`),
      description: t(msg`桌面运行数据目录或受管 Core API 还没有完全恢复，桌面侧运维能力暂不可靠。`),
      statusLabel: t(msg`高优先级`),
      tone: "warning",
      meta: desktopStatusQuery.data?.message ?? t(msg`优先进入设置页检查桌面托管状态和运行路径。`),
      actionLabel: t(msg`去运行设置`),
      to: "/setup",
    });
  } else if (!systemHealthy) {
    dutyIssues.push({
      key: "core-api",
      title: t(msg`Core API 当前不健康`),
      description: t(msg`核心接口还未恢复，后续角色、内容和调度数据都不适合作为稳定依据。`),
      statusLabel: t(msg`高优先级`),
      tone: "warning",
      meta: statusQuery.data?.coreApi.version
        ? t(msg`当前探测版本 ${statusQuery.data.coreApi.version}`)
        : t(msg`等待健康探测`),
      actionLabel: t(msg`去运行设置`),
      to: "/setup",
    });
  }

  if (!providerConfigured) {
    dutyIssues.push({
      key: "provider",
      title: t(msg`推理服务尚未配置`),
      description: t(msg`回复、评测和自动内容生成都会受到影响，运营动作缺乏可验证输出。`),
      statusLabel: t(msg`高优先级`),
      tone: "warning",
      meta:
        availableModelCount > 0
          ? t(msg`模型目录已有 ${availableModelCount} 个候选模型`)
          : t(msg`模型目录仍为空`),
      actionLabel: t(msg`补齐推理配置`),
      to: "/setup",
    });
  }

  if (ownerCount !== null && ownerCount !== 1) {
    dutyIssues.push({
      key: "owner-count",
      title: t(msg`世界主人数量异常`),
      description: t(msg`当前实例不满足单世界主人约束，需要先确认数据状态，再继续做运营操作。`),
      statusLabel: t(msg`关注`),
      tone: "warning",
      meta: `当前 ownerCount = ${ownerCount}`,
      actionLabel: t(msg`查看运行体征`),
      onAction: () => scrollToDashboardSection(runtimeSectionRef),
    });
  }

  if (!digitalHumanSummary.ready) {
    dutyIssues.push({
      key: "digital-human",
      title: t(msg`数字人链路仍有配置缺口`),
      description: digitalHumanSummary.description,
      statusLabel: t(msg`关注`),
      tone: "warning",
      meta: digitalHumanSummary.nextStep,
      actionLabel: t(msg`去运行设置`),
      to: "/setup",
    });
  }

  if (hasSchedulerIssues) {
    dutyIssues.push({
      key: "scheduler",
      title: t(msg`最近调度存在失败记录`),
      description: t(msg`最近 ${recentSchedulerErrorCount} 条调度记录返回 error，建议先复核 job 状态和最近执行摘要。`),
      statusLabel: t(msg`关注`),
      tone: "warning",
      meta: recentSchedulerRuns.find((run) => run.status === "error")?.summary
        ? translateSchedulerSummary(
            recentSchedulerRuns.find((run) => run.status === "error")?.summary,
            t,
          )
        : t(msg`进入调度区查看最近失败详情。`),
      actionLabel: t(msg`跳到调度排查`),
      onAction: () => scrollToDashboardSection(schedulerSectionRef),
    });
  }

  if (hasEvalFailures) {
    dutyIssues.push({
      key: "evals",
      title: t(msg`评测运行中存在失败样本`),
      description: t(msg`最近共有 ${failedEvalCount} 条失败评测，建议先确认是 provider 波动还是提示链路问题。`),
      statusLabel: t(msg`关注`),
      tone: "warning",
      meta: t(msg`总运行 ${evalOverviewQuery.data?.runCount ?? 0} 次，trace ${evalOverviewQuery.data?.traceCount ?? 0} 条`),
      actionLabel: t(msg`打开评测页`),
      to: "/evals",
    });
  }

  const resetDashboardMutationsRef = useRef(() => {});
  resetDashboardMutationsRef.current = () => {
    setSuccessNotice("");
    previewMutation.reset();
    exportDiagnosticsMutation.reset();
    createBackupMutation.reset();
    restoreBackupMutation.reset();
    schedulerRunMutation.reset();
  };

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  useEffect(() => {
    resetDashboardMutationsRef.current();
  }, [baseUrl]);

  const pendingIssueTitle = dutyIssues[0]?.title ?? t(msg`待处理事项`);
  const unknownLabel = t(msg`未知`);
  const hangzhouLabel = t(msg`杭州`);
  const pendingFetchLabel = t(msg`待获取`);
  const noneLabel = t(msg`无`);
  const localTime = translateWorldContextValue(
    worldContextQuery.data?.localTime,
    locale,
  );
  const worldLocation = translateWorldContextValue(
    worldContextQuery.data?.location ?? hangzhouLabel,
    locale,
  );
  const worldWeather = translateWorldContextValue(
    worldContextQuery.data?.weather ?? pendingFetchLabel,
    locale,
  );
  const worldSeason = translateWorldContextValue(
    worldContextQuery.data?.season ?? unknownLabel,
    locale,
  );
  const worldHoliday = translateWorldContextValue(
    worldContextQuery.data?.holiday ?? noneLabel,
    locale,
  );
  const worldContextSummary = worldContextQuery.data
    ? t(
        msg`当前时间 ${localTime ?? unknownLabel} · 位置 ${worldLocation ?? hangzhouLabel} · 天气 ${worldWeather ?? pendingFetchLabel} · 季节 ${worldSeason ?? unknownLabel} · 节日 ${worldHoliday ?? noneLabel}`,
      )
    : t(msg`最新世界快照暂不可用。`);
  const inferenceGatewayLastError =
    statusQuery.data?.inferenceGateway.lastError ?? t(msg`无`);

  return (
    <div className="space-y-6">
      {adminStatsQuery.isError && adminStatsQuery.error instanceof Error ? (
        <ErrorBlock message={adminStatsQuery.error.message} />
      ) : null}
      {adminSystemQuery.isError && adminSystemQuery.error instanceof Error ? (
        <ErrorBlock message={adminSystemQuery.error.message} />
      ) : null}
      {statusQuery.isError && statusQuery.error instanceof Error ? <ErrorBlock message={statusQuery.error.message} /> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 space-y-6 xl:order-1">
          <div ref={overviewSectionRef} className="scroll-mt-24 space-y-4">
            <Card className="overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,247,235,0.92)_45%,rgba(237,250,244,0.96))]">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                <div>
                  <AdminEyebrow>{t(msg`运营值班首页`)}</AdminEyebrow>
                  <h2 className="mt-3 text-3xl font-semibold text-[color:var(--text-primary)]">{heroTitle}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--text-secondary)]">
                    {nextActionMessage}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link to={primaryActionHref}>
                      <Button variant="primary" size="lg" className="rounded-2xl">
                        {primaryActionLabel}
                      </Button>
                    </Link>
                    <Link to="/characters">
                      <Button variant="secondary" size="lg" className="rounded-2xl">
                        {t(msg`查看角色中心`)}
                      </Button>
                    </Link>
                    <Link to="/reply-logic">
                      <Button variant="secondary" size="lg" className="rounded-2xl">
                        {t(msg`排查回复逻辑`)}
                      </Button>
                    </Link>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <AdminCompactStatusCard
                      label={t(msg`Core API`)}
                      value={systemHealthy ? t(msg`健康`) : t(msg`待恢复`)}
                      tone={systemHealthy ? "healthy" : "warning"}
                    />
                    <AdminCompactStatusCard
                      label={t(msg`推理服务`)}
                      value={providerConfigured ? t(msg`已配置`) : t(msg`待配置`)}
                      tone={providerConfigured ? "healthy" : "warning"}
                    />
                    <AdminCompactStatusCard
                      label={t(msg`数字人`)}
                      value={digitalHumanSummary.ready ? t(msg`正常`) : t(msg`待补齐`)}
                      tone={digitalHumanSummary.ready ? "healthy" : "warning"}
                    />
                    <AdminCompactStatusCard
                      label={t(msg`世界主人`)}
                      value={ownerCount === 1 ? t(msg`单世界`) : ownerCount === null ? t(msg`待确认`) : t(msg`${ownerCount} 个`)}
                      tone={ownerCount === 1 ? "healthy" : "warning"}
                    />
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/80 bg-white/70 p-5 shadow-[var(--shadow-card)]">
                  <AdminEyebrow>{t(msg`本班结论`)}</AdminEyebrow>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="text-3xl font-semibold text-[color:var(--text-primary)]">{overallLabel}</div>
                    <StatusPill tone={overallTone}>{overallTone === "healthy" ? t(msg`可继续`) : t(msg`待处理`)}</StatusPill>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{overallSummary}</p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <MetricCard
                      className="border-0 bg-transparent p-0 shadow-none"
                      label={t(msg`阻塞项`)}
                      value={blockerCount}
                      detail={t(msg`优先影响接下来能否继续操作`)}
                    />
                    <MetricCard
                      className="border-0 bg-transparent p-0 shadow-none"
                      label={t(msg`关注项`)}
                      value={watchItemCount}
                      detail={t(msg`建议本班内完成复核`)}
                    />
                    <MetricCard
                      className="border-0 bg-transparent p-0 shadow-none"
                      label={t(msg`在线角色`)}
                      value={`${onlineCharacterCount}/${totalCharacters}`}
                      detail={t(msg`当前抽查到的在线角色占比`)}
                    />
                    <MetricCard
                      className="border-0 bg-transparent p-0 shadow-none"
                      label={t(msg`内容产出`)}
                      value={`${momentsQuery.data?.length ?? 0}/${feedQuery.data?.total ?? 0}`}
                      detail={t(msg`朋友圈 / 广场动态总数`)}
                    />
                  </div>

                  <InlineNotice className="mt-4" tone={dutyIssues.length ? "warning" : "success"}>
                    {dutyIssues.length
                      ? t(msg`优先从“待处理队列”第一项开始处理。当前首项为：${pendingIssueTitle}。`)
                      : t(msg`当前没有高优先级阻塞，建议下一步进入评测页验证最新生成链，或抽查角色与内容样本。`)}
                  </InlineNotice>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <AdminJumpCard
                  to={primaryActionHref}
                  title={primaryActionLabel}
                  detail={t(msg`优先处理当前实例最关键的阻塞项。`)}
                  emphasis="primary"
                />
                <AdminJumpCard to="/characters" title={t(msg`进入角色中心`)} detail={t(msg`查角色状态、打开工厂或运行逻辑台。`)} />
                <AdminJumpCard to="/reply-logic" title={t(msg`查看回复逻辑`)} detail={t(msg`排查真实回复链路和全局规则。`)} />
                <AdminJumpCard to="/evals" title={t(msg`查看评测分析`)} detail={t(msg`进入 runs、compare 和 trace 工作区。`)} />
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`待处理队列`)}
                  actions={<StatusPill tone={dutyIssues.length ? "warning" : "healthy"}>{dutyIssues.length ? t(msg`${dutyIssues.length} 项`) : t(msg`当前无阻塞`)}</StatusPill>}
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {t(msg`按影响优先级排序，方便运营接班后直接进入处理动作。`)}
                </p>

                <div className="mt-4 space-y-3">
                  {dutyIssues.length ? (
                    dutyIssues.map((issue) => (
                      <AdminRecordCard
                        key={issue.key}
                        title={issue.title}
                        badges={<StatusPill tone={issue.tone}>{issue.statusLabel}</StatusPill>}
                        meta={issue.meta}
                        description={issue.description}
                        actions={
                          issue.to ? (
                            <Link to={issue.to}>
                              <Button variant="secondary" size="sm">
                                {issue.actionLabel ?? t(msg`去处理`)}
                              </Button>
                            </Link>
                          ) : issue.onAction ? (
                            <Button variant="secondary" size="sm" onClick={issue.onAction}>
                              {issue.actionLabel ?? t(msg`查看详情`)}
                            </Button>
                          ) : null
                        }
                      />
                    ))
                  ) : (
                    <AdminCallout
                      tone="success"
                      title={t(msg`当前首页没有待处理阻塞`)}
                      description={t(msg`实例已经满足继续运营的基础条件，可以把注意力转向评测验证、角色巡检和内容抽查。`)}
                      actions={
                        <Link to="/evals">
                          <Button variant="secondary">{t(msg`打开评测页`)}</Button>
                        </Link>
                      }
                    />
                  )}
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title={t(msg`实例体征摘要`)} actions={<AdminMetaText>{t(msg`一屏巡检`)}</AdminMetaText>} />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {t(msg`把世界状态、内容产出、消息体量和运行版本压缩成一屏摘要，避免重复扫读多块卡片。`)}
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <MetricCard
                    label={t(msg`世界主人`)}
                    value={ownerCount ?? t(msg`待确认`)}
                    meta={<StatusPill tone={ownerCount === 1 ? "healthy" : "warning"}>{ownerCount === 1 ? t(msg`单世界`) : t(msg`异常`)}</StatusPill>}
                  />
                  <MetricCard label={t(msg`角色总数`)} value={totalCharacters} detail={t(msg`在线 ${onlineCharacterCount}`)} />
                  <MetricCard label={t(msg`消息总数`)} value={adminStatsQuery.data?.totalMessages ?? 0} detail={t(msg`含全部单聊历史消息`)} />
                  <MetricCard label={t(msg`智能回复`)} value={adminStatsQuery.data?.aiMessages ?? 0} detail={t(msg`已落库的 AI 回复条数`)} />
                  <MetricCard label={t(msg`朋友圈`)} value={momentsQuery.data?.length ?? 0} detail={t(msg`当前世界动态总数`)} />
                  <MetricCard label={t(msg`广场动态`)} value={feedQuery.data?.total ?? 0} detail={t(msg`公开内容总数`)} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <AdminSoftBox>
                    {t(msg`版本`)} {adminSystemQuery.data?.version ?? statusQuery.data?.coreApi.version ?? t(msg`待探测`)} · {t(msg`运行`)}{" "}
                    {formatUptime(adminSystemQuery.data?.uptimeSeconds, t)}
                  </AdminSoftBox>
                  <AdminSoftBox>
                    {t(msg`数据库`)}{" "}
                    {typeof adminSystemQuery.data?.dbSizeBytes === "number"
                      ? `${(adminSystemQuery.data.dbSizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : t(msg`待探测`)}{" "}
                    · Node {adminSystemQuery.data?.nodeVersion ?? t(msg`待探测`)}
                  </AdminSoftBox>
                  <AdminSoftBox className="md:col-span-2">
                    {t(msg`迁移模块`)}：{statusQuery.data?.worldSurface.migratedModules.join("、") ?? t(msg`待迁移`)}
                  </AdminSoftBox>
                </div>

                <AdminDetailPanel className="mt-4" title={t(msg`世界上下文`)}>
                  {worldContextSummary}
                </AdminDetailPanel>
              </Card>
            </div>
          </div>

          <div ref={runtimeSectionRef} className="scroll-mt-24 space-y-4">
            <DashboardSectionLead
              eyebrow={t(msg`运行体征`)}
              title={t(msg`把运行链路、模型接入和数字人可用性放在同一个工作区。`)}
              description={t(msg`运营先确认实例连通和模型可用，再决定是否继续做内容抽查、角色观察或回复排障。`)}
            />

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`运行时与 Core API`)}
                  actions={
                    <StatusPill tone={desktopRuntimeReady ? "healthy" : systemHealthy ? "muted" : "warning"}>
                      {desktopAvailable
                        ? desktopRuntimeReady
                          ? t(msg`已就绪`)
                          : t(msg`待恢复`)
                        : systemHealthy
                          ? t(msg`远程模式`)
                          : t(msg`待恢复`)}
                    </StatusPill>
                  }
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {t(msg`桌面壳模式下这里负责确认托管状态；远程模式下这里主要看 Core API 和运行目录是否稳定。`)}
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <MetricCard
                    label={t(msg`核心接口`)}
                    value={statusQuery.data?.coreApi.version ?? t(msg`离线`)}
                    meta={
                      <StatusPill tone={systemHealthy ? "healthy" : "warning"}>
                        {statusQuery.isLoading ? t(msg`探测中`) : systemHealthy ? t(msg`健康`) : t(msg`待恢复`)}
                      </StatusPill>
                    }
                  />
                  <MetricCard
                    label={t(msg`受管地址`)}
                    value={desktopStatusQuery.data?.baseUrl ?? baseUrl}
                    detail={
                      desktopAvailable
                        ? desktopStatusQuery.data?.reachable
                          ? t(msg`桌面壳已接管`)
                          : t(msg`等待桌面壳确认`)
                        : t(msg`当前为远程连接模式`)
                    }
                  />
                  <MetricCard
                    label={t(msg`运行数据`)}
                    value={runtimeContextQuery.data?.runtimeDataDir ?? (desktopAvailable ? t(msg`加载中`) : t(msg`远程实例`))}
                    detail={runtimeContextQuery.data?.databasePath ?? desktopStatusQuery.data?.databasePath ?? t(msg`等待诊断`)}
                  />
                  <MetricCard
                    label={t(msg`日志数量`)}
                    value={logsQuery.data?.length ?? 0}
                    detail={logsQuery.isLoading ? t(msg`正在读取本地日志索引`) : t(msg`可在调试与运维区查看`)}
                  />
                </div>

                <InlineNotice className="mt-4" tone={desktopRuntimeReady ? "success" : "warning"}>
                  {desktopAvailable
                    ? desktopRuntimeReady
                      ? t(msg`桌面运行时已就绪。恢复、推理配置和手动管理入口已经统一收敛到设置页。`)
                      : desktopStatusQuery.data?.message ?? t(msg`桌面运行时尚未完成初始化，进入设置页可集中恢复。`)
                    : systemHealthy
                      ? t(msg`当前处于远程连接模式，Core API 健康，可继续做后台操作。`)
                      : t(msg`当前为远程连接模式，但 Core API 还未健康，优先排查设置页与实例连通性。`)}
                </InlineNotice>

                <AdminDetailPanel className="mt-4" title={t(msg`运行诊断`)}>
                  {desktopAvailable
                      ? runtimeDiagnosticsQuery.data
                      ? formatDesktopDiagnostics(runtimeDiagnosticsQuery.data, t)
                      : t(msg`正在读取桌面运行时诊断...`)
                    : t(msg`当前不是桌面壳环境，桌面托管诊断不可用。`)}
                </AdminDetailPanel>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Link to="/setup">
                    <Button variant="primary" size="lg" className="rounded-2xl">
                      {t(msg`打开运行设置`)}
                    </Button>
                  </Link>
                  <Link to="/evals">
                    <Button variant="secondary" size="lg" className="rounded-2xl">
                      {t(msg`前往评测验证`)}
                    </Button>
                  </Link>
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`模型、数字人与验证`)}
                  actions={<StatusPill tone={providerConfigured ? "healthy" : "warning"}>{providerConfigured ? t(msg`可验证`) : t(msg`待配置`)}</StatusPill>}
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {t(msg`先确认模型、队列和数字人链路可用，再进入内容抽查或回复排障，避免把环境问题误判成业务问题。`)}
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <MetricCard
                    label={t(msg`当前模型`)}
                    value={providerConfigQuery.data?.model ?? aiModelQuery.data?.model ?? t(msg`待配置`)}
                    detail={
                      statusQuery.data?.inferenceGateway.activeProvider
                        ? t(msg`网关：${statusQuery.data.inferenceGateway.activeProvider}`)
                        : t(msg`模型目录数：${availableModelCount}`)
                    }
                  />
                  <MetricCard
                    label={t(msg`推理队列`)}
                    value={statusQuery.data?.inferenceGateway.queueDepth ?? 0}
                    detail={t(msg`处理中 ${statusQuery.data?.inferenceGateway.inFlightRequests ?? 0} · 最大并发 ${statusQuery.data?.inferenceGateway.maxConcurrency ?? 0}`)}
                  />
                  <MetricCard label={t(msg`最近成功时间`)} value={statusQuery.data?.inferenceGateway.lastSuccessAt ?? t(msg`暂无`)} />
                  <MetricCard label={t(msg`最近错误`)} value={statusQuery.data?.inferenceGateway.lastError ?? t(msg`无`)} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <AdminSoftBox>
                    {t(msg`数字人模式`)}：{digitalHumanSummary.modeLabel} · {t(msg`状态`)}：{digitalHumanSummary.statusLabel}
                  </AdminSoftBox>
                  <AdminSoftBox>{t(msg`播放器模板`)}：{digitalHumanSummary.templateStatus}</AdminSoftBox>
                  <AdminSoftBox>{t(msg`回调鉴权`)}：{digitalHumanSummary.callbackTokenStatus}</AdminSoftBox>
                  <AdminSoftBox>{t(msg`扩展参数`)}：{digitalHumanSummary.paramsStatus}</AdminSoftBox>
                </div>

                <InlineNotice className="mt-4" tone={digitalHumanSummary.ready && providerConfigured ? "success" : "warning"}>
                  {digitalHumanSummary.description} {digitalHumanSummary.nextStep}
                </InlineNotice>

                <AdminDetailPanel className="mt-4" title={t(msg`评测运行时`)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-2xl font-semibold text-[color:var(--text-primary)]">
                      {t(msg`${evalOverviewQuery.data?.runCount ?? 0} 次运行 / ${evalOverviewQuery.data?.traceCount ?? 0} 条链路`)}
                    </div>
                    <Link to="/evals">
                      <Button variant="secondary" size="sm">
                        {t(msg`打开评测页`)}
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div>{t(msg`数据集`)}：{evalOverviewQuery.data?.datasetCount ?? 0}</div>
                    <div>{t(msg`失败运行`)}：{failedEvalCount}</div>
                    <div>{t(msg`回退链路`)}：{evalOverviewQuery.data?.fallbackTraceCount ?? 0}</div>
                  </div>
                </AdminDetailPanel>
              </Card>
            </div>
          </div>

          <div ref={signalsSectionRef} className="scroll-mt-24 space-y-4">
            <DashboardSectionLead
              eyebrow={t(msg`运营信号`)}
              title={t(msg`先看角色和内容有没有稳定产出，再决定是否深入到具体工作区。`)}
              description={t(msg`这一块服务抽查而不是全面管理，所以只保留关键摘要和最新样本，减少视觉噪音。`)}
            />

            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader title={t(msg`角色与内容摘要`)} actions={<AdminMetaText>{t(msg`抽查入口`)}</AdminMetaText>} />
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label={t(msg`在线角色`)} value={onlineCharacterCount} detail={t(msg`总角色 ${totalCharacters}`)} />
                <MetricCard label={t(msg`朋友圈总数`)} value={momentsQuery.data?.length ?? 0} detail={t(msg`最新动态已纳入抽查范围`)} />
                <MetricCard label={t(msg`广场动态`)} value={feedQuery.data?.total ?? 0} detail={t(msg`公开内容样本可直接抽查`)} />
                <MetricCard label={t(msg`评测运行`)} value={evalOverviewQuery.data?.runCount ?? 0} detail={t(msg`Trace ${evalOverviewQuery.data?.traceCount ?? 0}`)} />
              </div>
            </Card>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`角色抽查`)}
                  actions={
                    <Link to="/characters">
                      <Button variant="secondary" size="sm">
                        {t(msg`打开角色中心`)}
                      </Button>
                    </Link>
                  }
                />
                <div className="mt-4 space-y-3">
                  {previewCharacters.length ? (
                    previewCharacters.map((character) => (
                      <ListItemCard
                        key={character.id}
                        className="py-3"
                        title={character.name}
                        actions={<StatusPill tone={character.isOnline ? "healthy" : "muted"}>{character.isOnline ? t(msg`在线`) : t(msg`离线`)}</StatusPill>}
                        body={<div>{character.relationship}</div>}
                        footer={<AdminMetaText>{character.id}</AdminMetaText>}
                      />
                    ))
                  ) : (
                    <AdminPanelEmpty
                      message={
                        charactersQuery.error instanceof Error
                          ? charactersQuery.error.message
                          : t(msg`新核心接口进程启动后，角色增删改查兼容路由即可正常使用。`)
                      }
                    />
                  )}
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title={t(msg`朋友圈样本`)} actions={<AdminMetaText>{t(msg`最近 3 条`)}</AdminMetaText>} />
                <div className="mt-4 space-y-3">
                  {previewMoments.length ? (
                    previewMoments.map((moment) => (
                      <ListItemCard
                        key={moment.id}
                        className="py-3"
                        title={moment.authorName}
                        actions={<AdminMetaText>{t(msg`${moment.likeCount} 赞 / ${moment.commentCount} 评论`)}</AdminMetaText>}
                        body={<div className="line-clamp-3 whitespace-pre-wrap">{moment.text?.trim() || t(msg`暂无正文`)}</div>}
                        footer={<AdminMetaText>{moment.id}</AdminMetaText>}
                      />
                    ))
                  ) : (
                    <AdminPanelEmpty
                      message={
                        momentsQuery.error instanceof Error
                          ? momentsQuery.error.message
                          : t(msg`新核心接口进程启动后，朋友圈兼容路由即可正常使用。`)
                      }
                    />
                  )}
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title={t(msg`广场动态样本`)} actions={<AdminMetaText>{t(msg`最近 3 条`)}</AdminMetaText>} />
                <div className="mt-4 space-y-3">
                  {previewFeedPosts.length ? (
                    previewFeedPosts.map((post) => (
                      <ListItemCard
                        key={post.id}
                        className="py-3"
                        title={post.authorName}
                        actions={<AdminMetaText>{t(msg`${post.likeCount} 赞 / ${post.commentCount} 评论`)}</AdminMetaText>}
                        body={<div className="line-clamp-3 whitespace-pre-wrap">{post.text?.trim() || t(msg`暂无正文`)}</div>}
                        footer={<AdminMetaText>{post.id}</AdminMetaText>}
                      />
                    ))
                  ) : (
                    <AdminPanelEmpty
                      message={
                        feedQuery.error instanceof Error ? feedQuery.error.message : t(msg`新核心接口进程启动后，广场兼容路由即可正常使用。`)
                      }
                    />
                  )}
                </div>
              </Card>
            </div>
          </div>

          <div ref={schedulerSectionRef} className="scroll-mt-24 space-y-4">
            <DashboardSectionLead
              eyebrow={t(msg`调度与实时`)}
              title={t(msg`把自动运行风险和前端实时链路放在同一个排障平面。`)}
              description={t(msg`先看最近有没有失败，再决定是手动触发 job，还是排查实时房间与客户端连接。`)}
            />

            <AdminCallout
              tone={hasSchedulerIssues ? "warning" : "success"}
              title={hasSchedulerIssues ? t(msg`最近调度存在异常，建议优先排查`) : t(msg`最近调度稳定，可继续日常巡检`)}
              description={
                hasSchedulerIssues
                  ? recentSchedulerRuns.find((run) => run.status === "error")?.summary
                    ? translateSchedulerSummary(
                        recentSchedulerRuns.find((run) => run.status === "error")?.summary,
                        t,
                      )
                    : t(msg`最近存在调度失败记录，请先检查 job 状态和最近执行摘要。`)
                  : t(msg`当前没有新的调度失败记录，若内容产出异常，可先手动执行关键 job 做一次验证。`)
              }
            />

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`调度工作台`)}
                  actions={<StatusPill tone={hasSchedulerIssues ? "warning" : "healthy"}>{hasSchedulerIssues ? t(msg`有异常`) : t(msg`稳定`)}</StatusPill>}
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {t(msg`把 job 状态、手动执行和最近记录收敛在同一块，减少来回滚动和切页成本。`)}
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <MetricCard label={t(msg`模式`)} value={schedulerQuery.data?.mode ?? t(msg`待初始化`)} />
                  <MetricCard label={t(msg`启用任务`)} value={enabledSchedulerJobCount} detail={t(msg`总任务 ${schedulerJobs.length}`)} />
                  <MetricCard label={t(msg`最近失败`)} value={recentSchedulerErrorCount} detail={t(msg`最近运行 ${schedulerQuery.data?.recentRuns.length ?? 0}`)} />
                </div>

                <div className="mt-4 grid gap-3">
                  {schedulerJobs.map((job) => (
                    <ListItemCard
                      key={job.id}
                      className="py-3"
                      title={translateSchedulerJobName(job.id, job.name, t)}
                      subtitle={job.id}
                      actions={
                        <>
                          <StatusPill tone={job.running ? "warning" : job.enabled ? "healthy" : "muted"}>
                            {job.running ? t(msg`运行中`) : job.enabled ? t(msg`已启用`) : t(msg`已禁用`)}
                          </StatusPill>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!job.enabled || job.running || schedulerRunMutation.isPending}
                            onClick={() => schedulerRunMutation.mutate(job.id)}
                          >
                            {runningSchedulerJobId === job.id ? t(msg`执行中...`) : t(msg`立即执行`)}
                          </Button>
                        </>
                      }
                      body={
                        <>
                          <div>{translateSchedulerJobDescription(job.id, job.description, t)}</div>
                          <AdminMetaText className="mt-2">
                            {job.cadence} / {translateSchedulerRunHint(job.id, job.nextRunHint, t)}
                          </AdminMetaText>
                        </>
                      }
                      footer={
                        <div className="grid gap-2 md:grid-cols-3">
                          <AdminSoftBox>{t(msg`运行次数`)}：{job.runCount}</AdminSoftBox>
                          <AdminSoftBox>{t(msg`耗时`)}：{job.lastDurationMs ? `${job.lastDurationMs} ms` : t(msg`尚未执行`)}</AdminSoftBox>
                          <AdminSoftBox>{t(msg`最近执行`)}：{job.lastRunAt ?? t(msg`尚未执行`)}</AdminSoftBox>
                        </div>
                      }
                    />
                  ))}

                  {schedulerRunMutation.isError ? (
                    <ErrorBlock
                      message={
                        schedulerRunMutation.error instanceof Error ? schedulerRunMutation.error.message : t(msg`调度任务执行失败。`)
                      }
                    />
                  ) : null}

                  {!schedulerQuery.data && schedulerQuery.error instanceof Error ? <ErrorBlock message={schedulerQuery.error.message} /> : null}
                  {!schedulerJobs.length && !schedulerQuery.error ? <AdminPanelEmpty message={t(msg`等待调度器对齐数据...`)} /> : null}
                </div>

                <AdminDetailPanel className="mt-4" title={t(msg`最近调度记录`)} contentClassName="space-y-2">
                  {recentSchedulerRuns.length ? (
                    recentSchedulerRuns.map((event) => (
                      <ListItemCard
                        key={event.id}
                        className="py-3"
                        title={`${translateSchedulerJobName(event.jobId, event.jobName, t)} · ${event.status === "error" ? t(msg`失败`) : t(msg`成功`)}`}
                        body={<div>{translateSchedulerSummary(event.summary, t)}</div>}
                        footer={
                          <div className="text-xs text-[color:var(--text-muted)]">
                            {event.startedAt}
                            {event.durationMs ? ` · ${event.durationMs} ms` : ""}
                          </div>
                        }
                      />
                    ))
                  ) : (
                    <div>{t(msg`当前还没有调度任务执行记录。`)}</div>
                  )}
                </AdminDetailPanel>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`实时连接与契约`)}
                  actions={
                    <StatusPill tone={(realtimeQuery.data?.connectedClients ?? 0) > 0 ? "healthy" : "muted"}>
                      {(realtimeQuery.data?.connectedClients ?? 0) > 0 ? t(msg`有活跃连接`) : t(msg`暂无连接`)}
                    </StatusPill>
                  }
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {t(msg`这里主要服务“为什么前端没同步到最新消息或状态”的排查，而不是日常高频操作。`)}
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <MetricCard label={t(msg`已连接客户端`)} value={realtimeQuery.data?.connectedClients ?? 0} />
                  <MetricCard label={t(msg`活跃房间`)} value={realtimeQuery.data?.activeRooms ?? 0} />
                </div>

                <AdminDetailPanel className="mt-4" title={t(msg`命名空间与路径`)}>
                  {t(msg`命名空间`)}：{CHAT_NAMESPACE} · Socket {t(msg`路径`)}：{realtimeQuery.data?.socketPath ?? "/socket.io"}
                </AdminDetailPanel>

                <div className="mt-4 grid gap-3">
                  {previewRooms.length ? (
                    previewRooms.map((room) => (
                      <ListItemCard
                        key={room.roomId}
                        className="py-3"
                        title={room.roomId}
                        body={<div>{t(msg`订阅数`)}：{room.subscriberCount}</div>}
                      />
                    ))
                  ) : realtimeQuery.error instanceof Error ? (
                    <ErrorBlock message={realtimeQuery.error.message} />
                  ) : (
                    <AdminPanelEmpty message={t(msg`当前还没有活跃的实时房间。`)} />
                  )}
                </div>

                <AdminDetailPanel className="mt-4" title={t(msg`最近实时事件`)} contentClassName="space-y-2">
                  {previewRealtimeEvents.length ? (
                    previewRealtimeEvents.map((event) => <ListItemCard key={event} className="py-3" title={event} />)
                  ) : (
                    <div>{t(msg`当前还没有实时事件。`)}</div>
                  )}
                </AdminDetailPanel>

                <AdminDetailPanel className="mt-4" title={t(msg`事件契约`)} contentClassName="grid gap-2 sm:grid-cols-2">
                  {Object.values(CHAT_EVENTS).map((eventName) => (
                    <AdminSoftBox key={eventName}>{eventName}</AdminSoftBox>
                  ))}
                </AdminDetailPanel>
              </Card>
            </div>
          </div>

          <div ref={operationsSectionRef} className="scroll-mt-24 space-y-4">
            <DashboardSectionLead
              eyebrow={t(msg`调试与运维`)}
              title={t(msg`把模型调试、诊断导出、备份恢复和日志入口收敛到页面尾部。`)}
              description={t(msg`这些动作频率低于日常巡检，但必须保留清晰风险提示和执行反馈，方便值班人员临时处理。`)}
            />

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`推理预览`)}
                  actions={<StatusPill tone={previewMutation.data ? "healthy" : "muted"}>{previewMutation.data ? t(msg`已生成预览`) : t(msg`等待预览`)}</StatusPill>}
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {t(msg`这里只是直连当前 provider 的原始调试入口，不走角色运行时，也不是角色 system prompt 的编辑入口。`)}
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <MetricCard
                    label={t(msg`当前推理服务`)}
                    value={providerConfigQuery.data?.model ?? statusQuery.data?.inferenceGateway.activeProvider ?? t(msg`尚未配置`)}
                  />
                  <MetricCard label={t(msg`最近成功时间`)} value={statusQuery.data?.inferenceGateway.lastSuccessAt ?? t(msg`暂无`)} />
                  <MetricCard label={t(msg`队列深度`)} value={statusQuery.data?.inferenceGateway.queueDepth ?? 0} detail={t(msg`错误：${inferenceGatewayLastError}`)} />
                </div>

                <InlineNotice className="mt-4" tone={providerConfigured ? "success" : "warning"}>
                  {providerConfigQuery.isLoading
                    ? t(msg`正在加载已保存的推理服务配置...`)
                    : providerConfigQuery.isError && providerConfigQuery.error instanceof Error
                      ? providerConfigQuery.error.message
                      : providerConfigured
                        ? t(msg`当前推理服务已配置，适合直接做联通性和基础输出验证。`)
                        : t(msg`当前尚未配置推理服务。进入设置页可完成首轮配置并测试连通性。`)}
                </InlineNotice>

                <form className="mt-4 space-y-4" onSubmit={previewForm.handleSubmit((values) => previewMutation.mutate(values))}>
                  <label className="block text-sm text-[color:var(--text-secondary)]">
                    {t(msg`附加 System Prompt（调试用，可留空）`)}
                    <TextAreaField className="mt-2 min-h-24" {...previewForm.register("systemPrompt")} />
                  </label>
                  <label className="block text-sm text-[color:var(--text-secondary)]">
                    {t(msg`输入内容`)}
                    <TextAreaField className="mt-2 min-h-32" {...previewForm.register("prompt")} />
                  </label>
                  <Button
                    className="w-full rounded-2xl bg-[linear-gradient(135deg,#22c55e,#86efac)] text-slate-950"
                    type="submit"
                    disabled={previewMutation.isPending}
                  >
                    {previewMutation.isPending ? t(msg`预览执行中...`) : t(msg`执行推理预览`)}
                  </Button>
                </form>

                <div className="mt-4 grid gap-3">
                  <AdminDetailPanel title={t(msg`结果`)} contentClassName="whitespace-pre-wrap text-[color:var(--text-primary)]">
                    {previewMutation.data
                      ? previewMutation.data.output ?? previewMutation.data.error ?? t(msg`预览未返回任何输出。`)
                      : previewMutation.isError && previewMutation.error instanceof Error
                        ? previewMutation.error.message
                        : t(msg`用当前生效的推理服务配置运行一条预览提示词。`)}
                  </AdminDetailPanel>
                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard
                      label={t(msg`模型`)}
                      value={previewMutation.data?.model ?? statusQuery.data?.inferenceGateway.activeProvider ?? t(msg`待执行`)}
                    />
                    <MetricCard label={t(msg`结束原因`)} value={previewMutation.data?.finishReason ?? t(msg`待执行`)} />
                    <MetricCard label={t(msg`令牌数`)} value={previewMutation.data?.usage?.totalTokens ?? 0} />
                  </div>
                </div>
              </Card>

              <div className="space-y-6">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title={t(msg`运维操作`)} actions={<AdminMetaText>{t(msg`低频高风险`)}</AdminMetaText>} />
                  <div className="mt-4 space-y-4">
                    <AdminActionGroup title={t(msg`日常维护`)} description={t(msg`先导出诊断和创建备份，这两项更适合巡检和日常留档。`)}>
                      <div className="grid gap-3">
                        <Button
                          variant="secondary"
                          size="lg"
                          className="justify-start rounded-2xl"
                          disabled={operationsBusy}
                          onClick={() => exportDiagnosticsMutation.mutate()}
                        >
                          {exportDiagnosticsMutation.isPending ? t(msg`正在导出诊断包...`) : t(msg`导出诊断包`)}
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          className="justify-start rounded-2xl"
                          disabled={operationsBusy}
                          onClick={() => createBackupMutation.mutate()}
                        >
                          {createBackupMutation.isPending ? t(msg`正在创建备份...`) : t(msg`创建本地备份`)}
                        </Button>
                      </div>
                    </AdminActionGroup>

                    <AdminDangerZone title={t(msg`高风险恢复`)} description={t(msg`恢复备份会直接改写当前实例状态，只在确认需要回滚时执行。`)}>
                      <Button
                        variant="secondary"
                        size="lg"
                        className="w-full justify-center rounded-2xl"
                        disabled={operationsBusy}
                        onClick={() => restoreBackupMutation.mutate()}
                      >
                        {restoreBackupMutation.isPending ? t(msg`正在恢复备份...`) : t(msg`恢复备份`)}
                      </Button>
                    </AdminDangerZone>
                  </div>

                  <div className="mt-4 space-y-3">
                    {operationsBusy ? (
                      <AdminActionFeedback
                        tone="busy"
                        title={t(msg`运维任务执行中`)}
                        description={t(msg`当前有运维任务执行中，其他维护操作暂时被锁定。`)}
                      />
                    ) : null}
                    {exportDiagnosticsMutation.isError && exportDiagnosticsMutation.error instanceof Error ? (
                      <ErrorBlock message={exportDiagnosticsMutation.error.message} />
                    ) : null}
                    {createBackupMutation.isError && createBackupMutation.error instanceof Error ? (
                      <ErrorBlock message={createBackupMutation.error.message} />
                    ) : null}
                    {restoreBackupMutation.isError && restoreBackupMutation.error instanceof Error ? (
                      <ErrorBlock message={restoreBackupMutation.error.message} />
                    ) : null}
                    {!operationsBusy &&
                    !exportDiagnosticsMutation.isError &&
                    !createBackupMutation.isError &&
                    !restoreBackupMutation.isError ? (
                      <InlineNotice tone="muted">{t(msg`当前系统运维操作已经接入类型化契约层，随时可以切换到真实运行时实现。`)}</InlineNotice>
                    ) : null}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader
                    title={t(msg`日志索引`)}
                    actions={<StatusPill tone={previewLogs.length ? "healthy" : logsQuery.isLoading ? "muted" : "warning"}>{previewLogs.length ? t(msg`${previewLogs.length} 条`) : logsQuery.isLoading ? t(msg`读取中`) : t(msg`暂无日志`)}</StatusPill>}
                  />
                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                    {t(msg`保留最近日志入口，方便做故障留痕和快速定位，不再让日志列表挤占首页中段。`)}
                  </p>

                  <AdminDetailPanel className="mt-4" title={t(msg`最近日志`)} contentClassName="space-y-2">
                    {previewLogs.map((logPath) => (
                      <ListItemCard key={logPath} className="py-3" title={logPath} />
                    ))}
                    {logsQuery.isLoading ? (
                      <LoadingBlock className="border-0 bg-transparent px-0 py-0 text-left text-sm shadow-none" label={t(msg`正在加载本地运行时日志...`)} />
                    ) : null}
                    {!previewLogs.length && logsQuery.error instanceof Error ? <ErrorBlock message={logsQuery.error.message} /> : null}
                    {!logsQuery.isLoading && !previewLogs.length && !logsQuery.error ? <AdminPanelEmpty message={t(msg`等待本地运行时日志...`)} /> : null}
                  </AdminDetailPanel>
                </Card>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 xl:order-2">
          <div className="space-y-4 xl:sticky xl:top-6">
            {successNotice ? (
              <AdminActionFeedback tone="success" title={t(msg`操作已完成`)} description={successNotice} />
            ) : null}

            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader
                title={t(msg`当前值班摘要`)}
                actions={<StatusPill tone={overallTone}>{overallLabel}</StatusPill>}
              />
              <div className="mt-4 grid gap-3">
                <AdminSoftBox>{t(msg`阻塞项`)}：{blockerCount}</AdminSoftBox>
                <AdminSoftBox>{t(msg`关注项`)}：{watchItemCount}</AdminSoftBox>
                <AdminSoftBox>{t(msg`最近日志`)}：{logsQuery.data?.length ?? 0}</AdminSoftBox>
                <AdminSoftBox>{t(msg`活跃调度任务`)}：{enabledSchedulerJobCount}</AdminSoftBox>
              </div>
              <InlineNotice className="mt-4" tone={dutyIssues.length ? "warning" : "success"}>
                {dutyIssues.length ? dutyIssues[0]?.title ?? t(msg`当前存在待处理项。`) : t(msg`当前首页未发现高优先级阻塞。`)}
              </InlineNotice>
            </Card>

            <AdminSectionNav
              title={t(msg`页面导航`)}
              items={[
                {
                  label: t(msg`值班总览`),
                  detail: t(msg`先看当前结论、待处理队列和实例体征摘要。`),
                  onClick: () => scrollToDashboardSection(overviewSectionRef),
                },
                {
                  label: t(msg`运行体征`),
                  detail: t(msg`查看 Core API、模型、数字人与评测运行时。`),
                  onClick: () => scrollToDashboardSection(runtimeSectionRef),
                },
                {
                  label: t(msg`运营信号`),
                  detail: t(msg`抽查角色、朋友圈和广场动态最新样本。`),
                  onClick: () => scrollToDashboardSection(signalsSectionRef),
                },
                {
                  label: t(msg`调度与实时`),
                  detail: t(msg`排查 job 失败、活跃房间和实时事件。`),
                  onClick: () => scrollToDashboardSection(schedulerSectionRef),
                },
                {
                  label: t(msg`调试与运维`),
                  detail: t(msg`做推理预览、导出诊断、备份恢复和日志查看。`),
                  onClick: () => scrollToDashboardSection(operationsSectionRef),
                },
              ]}
            />

            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader title={t(msg`快捷动作`)} />
              <div className="mt-4 grid gap-3">
                <QuickActionLink to="/setup" label={t(msg`打开运行设置`)} detail={t(msg`恢复实例、补齐 Provider、检查数字人参数。`)} action={t(msg`进入`)} />
                <QuickActionLink to="/characters" label={t(msg`打开角色中心`)} detail={t(msg`抽查角色在线状态、画像和运行工作区。`)} action={t(msg`进入`)} />
                <QuickActionLink to="/reply-logic" label={t(msg`打开回复逻辑`)} detail={t(msg`查看真实回复链路、规则和常量。`)} action={t(msg`进入`)} />
                <QuickActionLink to="/evals" label={t(msg`打开评测分析`)} detail={t(msg`验证生成链路质量，定位失败样本。`)} action={t(msg`进入`)} />
                <button
                  type="button"
                  onClick={() => scrollToDashboardSection(schedulerSectionRef)}
                  className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
                >
                  <div className="font-semibold text-[color:var(--text-primary)]">{t(msg`跳到调度排查`)}</div>
                  <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                    {t(msg`当前有调度异常或需要手动触发 job 时，直接回到对应工作区。`)}
                  </div>
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardSectionLead({
  eyebrow,
  title,
  description,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div>
      <AdminEyebrow>{eyebrow}</AdminEyebrow>
      <h3 className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">{title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>
    </div>
  );
}

function QuickActionLink({
  to,
  label,
  detail,
  action,
}: {
  to: DashboardRoute;
  label: ReactNode;
  detail: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="font-semibold text-[color:var(--text-primary)]">{label}</div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{detail}</div>
      <div className="mt-4">
        <Link to={to}>
          <Button variant="secondary" size="sm">
            {action}
          </Button>
        </Link>
      </div>
    </div>
  );
}

function scrollToDashboardSection(ref: RefObject<HTMLDivElement | null>) {
  ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
}

type DashboardTranslator = typeof translateRuntimeMessage;

function translateSchedulerJobName(
  jobId: string,
  fallback: string,
  t: DashboardTranslator,
) {
  switch (jobId) {
    case "trigger_due_reminder_tasks":
      return t(msg`到点提醒调度`);
    case "trigger_reminder_checkins":
      return t(msg`提醒问询调度`);
    case "world_context_snapshot":
      return t(msg`世界快照`);
    case "expire_friend_requests":
      return t(msg`过期好友请求`);
    case "discover_need_characters_short_interval":
      return t(msg`需求发现短周期`);
    case "discover_need_characters_daily":
      return t(msg`需求发现日更`);
    case "update_ai_active_status":
      return t(msg`在线状态调度`);
    case "trigger_followup_recommendations":
      return t(msg`追问推荐调度`);
    case "trigger_self_agent_heartbeat":
      return t(msg`主代理巡检调度`);
    case "check_real_world_news_bulletins":
      return t(msg`界闻简报调度`);
    case "check_moment_schedule":
      return t(msg`朋友圈调度`);
    case "trigger_scene_friend_requests":
      return t(msg`场景加好友调度`);
    case "process_pending_feed_reactions":
      return t(msg`广场反应调度`);
    case "check_channels_schedule":
      return t(msg`视频号调度`);
    case "update_character_status":
      return t(msg`活动状态调度`);
    case "trigger_memory_proactive_messages":
      return t(msg`主动提醒调度`);
    case "update_recent_memory_daily":
      return t(msg`近期摘要日更`);
    case "update_core_memory_weekly":
      return t(msg`核心记忆周更`);
    default:
      return fallback;
  }
}

function translateSchedulerJobDescription(
  jobId: string,
  fallback: string,
  t: DashboardTranslator,
) {
  switch (jobId) {
    case "trigger_due_reminder_tasks":
      return t(msg`扫描到点的提醒任务，并通过提醒角色发出私聊提醒。`);
    case "trigger_reminder_checkins":
      return t(msg`按小时判断是否需要由提醒角色主动追问有没有新的待提醒事项。`);
    case "world_context_snapshot":
      return t(msg`刷新 WorldContext 快照，供回复链路读取当前世界状态。`);
    case "expire_friend_requests":
      return t(msg`清理当天过期的待处理好友请求。`);
    case "discover_need_characters_short_interval":
      return t(msg`短周期扫描新的人物需求，并生成候选角色。`);
    case "discover_need_characters_daily":
      return t(msg`按日维度刷新人物需求候选和覆盖缺口。`);
    case "update_ai_active_status":
      return t(msg`根据活跃时间窗口更新角色在线状态，并推进 AI 角色关系。`);
    case "trigger_followup_recommendations":
      return t(msg`扫描适合跟进的话题并生成追问推荐。`);
    case "trigger_self_agent_heartbeat":
      return t(msg`扫描 self-agent 的未闭环事项、到期提醒和待确认动作。`);
    case "check_real_world_news_bulletins":
      return t(msg`检查界闻早报、午报、晚报是否需要补发。`);
    case "check_moment_schedule":
      return t(msg`检查角色是否应发布朋友圈内容。`);
    case "trigger_scene_friend_requests":
      return t(msg`按场景触发新的好友请求机会。`);
    case "process_pending_feed_reactions":
      return t(msg`处理待执行的 AI 广场互动。`);
    case "check_channels_schedule":
      return t(msg`按频率生成视频号内容，并补足基础内容池。`);
    case "update_character_status":
      return t(msg`根据时间段刷新角色当前活动状态。`);
    case "trigger_memory_proactive_messages":
      return t(msg`扫描角色记忆，在合适时机主动给用户发提醒。`);
    case "update_recent_memory_daily":
      return t(msg`每日从近7天互动记录中自动提取并更新近期摘要。`);
    case "update_core_memory_weekly":
      return t(msg`每周从近30天全量交互数据中自动提取并更新核心记忆。`);
    default:
      return fallback;
  }
}

function translateSchedulerRunHint(
  jobId: string,
  fallback: string,
  t: DashboardTranslator,
) {
  switch (jobId) {
    case "trigger_due_reminder_tasks":
    case "process_pending_feed_reactions":
      return t(msg`每 5 分钟`);
    case "trigger_reminder_checkins":
      return t(msg`每小时整点`);
    case "world_context_snapshot":
    case "trigger_self_agent_heartbeat":
      return t(msg`每 30 分钟`);
    case "expire_friend_requests":
      return t(msg`每日 23:59`);
    case "discover_need_characters_short_interval":
    case "discover_need_characters_daily":
    case "update_ai_active_status":
    case "trigger_followup_recommendations":
    case "check_real_world_news_bulletins":
      return t(msg`每 10 分钟`);
    case "check_moment_schedule":
      return t(msg`每 15 分钟`);
    case "trigger_scene_friend_requests":
      return t(msg`每日 10:00 / 14:00 / 19:00`);
    case "check_channels_schedule":
      return t(msg`每 20 分钟`);
    case "update_character_status":
      return t(msg`每 2 小时`);
    case "trigger_memory_proactive_messages":
      return t(msg`每日 20:00`);
    case "update_recent_memory_daily":
      return t(msg`每日 03:00`);
    case "update_core_memory_weekly":
      return t(msg`每周一 04:00`);
    default:
      return fallback;
  }
}

// i18n-ignore-start: runtime Chinese scheduler/world-context summaries are parsed into translated messages below.
function translateSchedulerSummary(
  summary: string | undefined,
  t: DashboardTranslator,
) {
  if (!summary) {
    return "";
  }

  const expiredFriendRequests = summary.match(/^已过期 (\d+) 条好友请求。$/);
  if (expiredFriendRequests) {
    return t(msg`已过期 ${expiredFriendRequests[1]} 条好友请求。`);
  }

  const activeStatus = summary.match(
    /^检查 (\d+) 个角色，在线状态变更 (\d+) 次，人工锁定 (\d+) 个，角色关系更新 (\d+) 次。$/,
  );
  if (activeStatus) {
    return t(
      msg`检查 ${activeStatus[1]} 个角色，在线状态变更 ${activeStatus[2]} 次，人工锁定 ${activeStatus[3]} 个，角色关系更新 ${activeStatus[4]} 次。`,
    );
  }

  const moments = summary.match(
    /^检查 (\d+) 个可见角色，本轮生成 (\d+) 条朋友圈内容。$/,
  );
  if (moments) {
    return t(
      msg`检查 ${moments[1]} 个可见角色，本轮生成 ${moments[2]} 条朋友圈内容。`,
    );
  }

  const feedReactions = summary.match(/^已处理 (\d+) 条待执行广场互动。$/);
  if (feedReactions) {
    return t(msg`已处理 ${feedReactions[1]} 条待执行广场互动。`);
  }

  const channels = summary.match(
    /^检查 (\d+) 个角色，生成 (\d+) 条视频号内容，并执行内容池补足。$/,
  );
  if (channels) {
    return t(
      msg`检查 ${channels[1]} 个角色，生成 ${channels[2]} 条视频号内容，并执行内容池补足。`,
    );
  }

  const characterStatus = summary.match(
    /^检查 (\d+) 个角色，活动状态变更 (\d+) 次，人工锁定 (\d+) 个。$/,
  );
  if (characterStatus) {
    return t(
      msg`检查 ${characterStatus[1]} 个角色，活动状态变更 ${characterStatus[2]} 次，人工锁定 ${characterStatus[3]} 个。`,
    );
  }

  const proactiveHour = summary.match(
    /^当前小时 (\d+) 不等于主动提醒小时 (\d+)，跳过本轮。$/,
  );
  if (proactiveHour) {
    return t(
      msg`当前小时 ${proactiveHour[1]} 不等于主动提醒小时 ${proactiveHour[2]}，跳过本轮。`,
    );
  }

  const proactiveMessages = summary.match(
    /^检查 (\d+) 个有记忆种子的角色，发送 (\d+) 条主动提醒消息。$/,
  );
  if (proactiveMessages) {
    return t(
      msg`检查 ${proactiveMessages[1]} 个有记忆种子的角色，发送 ${proactiveMessages[2]} 条主动提醒消息。`,
    );
  }

  const recentMemory = summary.match(
    /^近期摘要日更：检查 (\d+) 个角色，更新 (\d+) 个，跳过 (\d+) 个（无近期消息）。$/,
  );
  if (recentMemory) {
    return t(
      msg`近期摘要日更：检查 ${recentMemory[1]} 个角色，更新 ${recentMemory[2]} 个，跳过 ${recentMemory[3]} 个（无近期消息）。`,
    );
  }

  const coreMemory = summary.match(
    /^核心记忆周更：检查 (\d+) 个角色，更新 (\d+) 个，跳过 (\d+) 个（无足够交互数据）。$/,
  );
  if (coreMemory) {
    return t(
      msg`核心记忆周更：检查 ${coreMemory[1]} 个角色，更新 ${coreMemory[2]} 个，跳过 ${coreMemory[3]} 个（无足够交互数据）。`,
    );
  }

  const followupLimit = summary.match(
    /^今天已经发出 (\d+) 条主动跟进推荐，这轮先收住。$/,
  );
  if (followupLimit) {
    return t(
      msg`今天已经发出 ${followupLimit[1]} 条主动跟进推荐，这轮先收住。`,
    );
  }

  const needDiscoveryCandidates = summary.match(
    /^现在还有 (\d+) 个候选没处理，这轮先不继续生新角色。$/,
  );
  if (needDiscoveryCandidates) {
    return t(
      msg`现在还有 ${needDiscoveryCandidates[1]} 个候选没处理，这轮先不继续生新角色。`,
    );
  }

  const heartbeatFindings = summary.match(/^heartbeat 命中了 (\d+) 类待处理事项。$/);
  if (heartbeatFindings) {
    return t(msg`heartbeat 命中了 ${heartbeatFindings[1]} 类待处理事项。`);
  }

  switch (summary) {
    case "WorldContext 快照已更新。":
      return t(msg`WorldContext 快照已更新。`);
    case "当前不在界闻早报、午报或晚报窗口，且未指定补发时段。":
      return t(msg`当前不在界闻早报、午报或晚报窗口，且未指定补发时段。`);
    case "当前没有到点的提醒任务。":
      return t(msg`当前没有到点的提醒任务。`);
    case "当前没有可见角色，跳过朋友圈调度。":
      return t(msg`当前没有可见角色，跳过朋友圈调度。`);
    case "场景加好友命中概率门控，本轮未触发。":
      return t(msg`场景加好友命中概率门控，本轮未触发。`);
    case "近期无互动记录，跳过记忆更新。":
      return t(msg`近期无互动记录，跳过记忆更新。`);
    default:
      return summary;
  }
}

function translateWorldContextValue(value: string | undefined, locale: string) {
  if (!value || locale !== "en-US") {
    return value;
  }

  const afternoonTime = value.match(/^下午(\d+)点(\d+)分$/);
  if (afternoonTime) {
    const hour = Number(afternoonTime[1]);
    const minute = afternoonTime[2].padStart(2, "0");
    return `${hour > 12 ? hour - 12 : hour}:${minute} PM`;
  }

  const morningTime = value.match(/^上午(\d+)点(\d+)分$/);
  if (morningTime) {
    const hour = Number(morningTime[1]);
    const minute = morningTime[2].padStart(2, "0");
    return `${hour}:${minute} AM`;
  }

  const replacements: Record<string, string> = {
    无: "None",
    未知: "Unknown",
    待获取: "Pending fetch",
    杭州: "Hangzhou",
    春天: "Spring",
    夏天: "Summer",
    秋天: "Autumn",
    冬天: "Winter",
    多云: "Cloudy",
    阴天但空气清新: "Cloudy with fresh air",
  };

  return replacements[value] ?? value.replace(/^多云\\s*/, "Cloudy ");
}
// i18n-ignore-end

function formatDesktopDiagnostics(values: {
  platform: string;
  coreApiCommand: string;
  diagnosticsStatus?: string;
  coreApiCommandSource?: string;
  coreApiCommandResolved: boolean;
  coreApiPortOccupied?: boolean;
  bundledCoreApiExists?: boolean;
  managedByDesktopShell?: boolean;
  managedChildPid?: number | null;
  desktopLogPath?: string;
  lastCoreApiError?: string | null;
  linuxMissingPackages: string[];
  summary: string;
}, t: DashboardTranslator) {
  const packageStatus = values.linuxMissingPackages.length
    ? t(msg`缺失依赖=${values.linuxMissingPackages.join(", ")}`)
    : t(msg`Linux 依赖正常`);
  const sidecarStatus = formatCommandSource(values.coreApiCommandSource, values.bundledCoreApiExists, t);
  const failureStatus =
    values.diagnosticsStatus === "port-occupied"
      ? t(msg`端口已占用`)
      : values.diagnosticsStatus === "bundled-sidecar-missing"
        ? t(msg`内置 sidecar 缺失`)
        : values.diagnosticsStatus === "spawn-failed"
          ? t(msg`拉起失败`)
          : values.diagnosticsStatus === "health-probe-failed"
            ? t(msg`健康探测失败`)
            : values.diagnosticsStatus ?? t(msg`未知`);
  const managedStatus = values.managedByDesktopShell
    ? t(msg`由桌面壳托管${values.managedChildPid ? ` pid=${values.managedChildPid}` : ""}`)
    : t(msg`未由桌面壳托管`);
  const logPath = values.desktopLogPath ? t(msg` · 日志=${values.desktopLogPath}`) : "";
  const lastError = values.lastCoreApiError ? t(msg` · 最近错误=${values.lastCoreApiError}`) : "";

  return `${values.platform} · ${values.summary} · ${values.coreApiCommandResolved ? t(msg`命令正常`) : t(msg`命令缺失`)} · ${sidecarStatus} · ${failureStatus} · ${managedStatus} · ${packageStatus}${values.coreApiPortOccupied ? t(msg` · 端口占用中`) : ""}${logPath}${lastError}`;
}

function formatCommandSource(
  source: string | undefined,
  bundledExists: boolean | undefined,
  t: DashboardTranslator,
) {
  if (source === "bundled" || source === "bundled-sidecar") {
    return t(msg`内置 sidecar`);
  }
  if (source === "env" || source === "env-override") {
    return t(msg`环境变量覆盖`);
  }
  if (source === "path" || source === "path-lookup") {
    return bundledExists ? t(msg`PATH 查找（内置 sidecar 缺失）`) : t(msg`PATH 查找`);
  }

  return bundledExists ? t(msg`sidecar 已就绪`) : t(msg`sidecar 缺失`);
}

function formatUptime(uptimeSeconds: number | null | undefined, t: DashboardTranslator) {
  if (typeof uptimeSeconds !== "number") {
    return t(msg`待探测`);
  }

  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  return t(msg`${hours} 小时 ${minutes} 分钟`);
}
