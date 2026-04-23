import { useEffect, useEffectEvent, useRef, useState, type ReactNode, type RefObject } from "react";
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
  const [successNotice, setSuccessNotice] = useState("");
  const overviewSectionRef = useRef<HTMLDivElement>(null);
  const runtimeSectionRef = useRef<HTMLDivElement>(null);
  const signalsSectionRef = useRef<HTMLDivElement>(null);
  const schedulerSectionRef = useRef<HTMLDivElement>(null);
  const operationsSectionRef = useRef<HTMLDivElement>(null);

  const adminStatsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.getStats(),
    retry: false,
  });

  const adminSystemQuery = useQuery({
    queryKey: ["admin-system"],
    queryFn: () => adminApi.getSystem(),
    retry: false,
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
      prompt: "回一句自然的日常问候，不要解释。",
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
      setSuccessNotice("推理预览已完成。");
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
      setSuccessNotice("备份恢复已完成。");
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
      setSuccessNotice("调度任务已执行完成。");
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
  const primaryActionLabel = !desktopRuntimeReady || !providerConfigured ? "打开运行设置" : "前往评测验证";
  const nextActionMessage = !desktopRuntimeReady
    ? "运行时尚未完全恢复。先进入设置页确认远程 API、运行数据目录和桌面托管状态。"
    : !providerConfigured
      ? "核心接口已在线，但推理服务还未配置。下一步应完成设置。"
      : systemHealthy
        ? "系统已进入可运维状态。建议下一步进入评测页验证当前生成链质量。"
        : "核心接口仍未健康，优先排查设置页和运维操作区。";
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
  const overallLabel = blockerCount > 0 ? `${blockerCount} 个阻塞项` : watchItemCount > 0 ? `${watchItemCount} 个关注项` : "可继续运营";
  const overallSummary =
    blockerCount > 0
      ? "先处理阻塞项，再进入角色、内容或评测工作区。"
      : watchItemCount > 0
        ? "实例基本可用，但仍有运行面需要复核。"
        : "当前没有高优先级阻塞，可以继续做内容抽查和运营操作。";
  const heroTitle =
    blockerCount > 0
      ? "先处理运行阻塞，再进入具体运营工作区。"
      : watchItemCount > 0
        ? "实例已基本可用，继续复核剩余关注项。"
        : "实例已进入可运营状态，可以直接开始巡检与操作。";

  const dutyIssues: DutyIssue[] = [];

  if (desktopAvailable && !desktopRuntimeReady) {
    dutyIssues.push({
      key: "desktop-runtime",
      title: "桌面壳托管运行时未就绪",
      description: "桌面运行数据目录或受管 Core API 还没有完全恢复，桌面侧运维能力暂不可靠。",
      statusLabel: "高优先级",
      tone: "warning",
      meta: desktopStatusQuery.data?.message ?? "优先进入设置页检查桌面托管状态和运行路径。",
      actionLabel: "去运行设置",
      to: "/setup",
    });
  } else if (!systemHealthy) {
    dutyIssues.push({
      key: "core-api",
      title: "Core API 当前不健康",
      description: "核心接口还未恢复，后续角色、内容和调度数据都不适合作为稳定依据。",
      statusLabel: "高优先级",
      tone: "warning",
      meta: statusQuery.data?.coreApi.version ? `当前探测版本 ${statusQuery.data.coreApi.version}` : "等待健康探测",
      actionLabel: "去运行设置",
      to: "/setup",
    });
  }

  if (!providerConfigured) {
    dutyIssues.push({
      key: "provider",
      title: "推理服务尚未配置",
      description: "回复、评测和自动内容生成都会受到影响，运营动作缺乏可验证输出。",
      statusLabel: "高优先级",
      tone: "warning",
      meta: availableModelCount > 0 ? `模型目录已有 ${availableModelCount} 个候选模型` : "模型目录仍为空",
      actionLabel: "补齐推理配置",
      to: "/setup",
    });
  }

  if (ownerCount !== null && ownerCount !== 1) {
    dutyIssues.push({
      key: "owner-count",
      title: "世界主人数量异常",
      description: "当前实例不满足单世界主人约束，需要先确认数据状态，再继续做运营操作。",
      statusLabel: "关注",
      tone: "warning",
      meta: `当前 ownerCount = ${ownerCount}`,
      actionLabel: "查看运行体征",
      onAction: () => scrollToDashboardSection(runtimeSectionRef),
    });
  }

  if (!digitalHumanSummary.ready) {
    dutyIssues.push({
      key: "digital-human",
      title: "数字人链路仍有配置缺口",
      description: digitalHumanSummary.description,
      statusLabel: "关注",
      tone: "warning",
      meta: digitalHumanSummary.nextStep,
      actionLabel: "去运行设置",
      to: "/setup",
    });
  }

  if (hasSchedulerIssues) {
    dutyIssues.push({
      key: "scheduler",
      title: "最近调度存在失败记录",
      description: `最近 ${recentSchedulerErrorCount} 条调度记录返回 error，建议先复核 job 状态和最近执行摘要。`,
      statusLabel: "关注",
      tone: "warning",
      meta: recentSchedulerRuns.find((run) => run.status === "error")?.summary ?? "进入调度区查看最近失败详情。",
      actionLabel: "跳到调度排查",
      onAction: () => scrollToDashboardSection(schedulerSectionRef),
    });
  }

  if (hasEvalFailures) {
    dutyIssues.push({
      key: "evals",
      title: "评测运行中存在失败样本",
      description: `最近共有 ${failedEvalCount} 条失败评测，建议先确认是 provider 波动还是提示链路问题。`,
      statusLabel: "关注",
      tone: "warning",
      meta: `总运行 ${evalOverviewQuery.data?.runCount ?? 0} 次，trace ${evalOverviewQuery.data?.traceCount ?? 0} 条`,
      actionLabel: "打开评测页",
      to: "/evals",
    });
  }

  const resetDashboardMutations = useEffectEvent(() => {
    setSuccessNotice("");
    previewMutation.reset();
    exportDiagnosticsMutation.reset();
    createBackupMutation.reset();
    restoreBackupMutation.reset();
    schedulerRunMutation.reset();
  });

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  useEffect(() => {
    resetDashboardMutations();
  }, [baseUrl, resetDashboardMutations]);

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
                  <AdminEyebrow>运营值班首页</AdminEyebrow>
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
                        查看角色中心
                      </Button>
                    </Link>
                    <Link to="/reply-logic">
                      <Button variant="secondary" size="lg" className="rounded-2xl">
                        排查回复逻辑
                      </Button>
                    </Link>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <AdminCompactStatusCard
                      label="Core API"
                      value={systemHealthy ? "健康" : "待恢复"}
                      tone={systemHealthy ? "healthy" : "warning"}
                    />
                    <AdminCompactStatusCard
                      label="推理服务"
                      value={providerConfigured ? "已配置" : "待配置"}
                      tone={providerConfigured ? "healthy" : "warning"}
                    />
                    <AdminCompactStatusCard
                      label="数字人"
                      value={digitalHumanSummary.ready ? "正常" : "待补齐"}
                      tone={digitalHumanSummary.ready ? "healthy" : "warning"}
                    />
                    <AdminCompactStatusCard
                      label="世界主人"
                      value={ownerCount === 1 ? "单世界" : ownerCount === null ? "待确认" : `${ownerCount} 个`}
                      tone={ownerCount === 1 ? "healthy" : "warning"}
                    />
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/80 bg-white/70 p-5 shadow-[var(--shadow-card)]">
                  <AdminEyebrow>本班结论</AdminEyebrow>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="text-3xl font-semibold text-[color:var(--text-primary)]">{overallLabel}</div>
                    <StatusPill tone={overallTone}>{overallTone === "healthy" ? "可继续" : "待处理"}</StatusPill>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{overallSummary}</p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <MetricCard
                      className="border-0 bg-transparent p-0 shadow-none"
                      label="阻塞项"
                      value={blockerCount}
                      detail="优先影响接下来能否继续操作"
                    />
                    <MetricCard
                      className="border-0 bg-transparent p-0 shadow-none"
                      label="关注项"
                      value={watchItemCount}
                      detail="建议本班内完成复核"
                    />
                    <MetricCard
                      className="border-0 bg-transparent p-0 shadow-none"
                      label="在线角色"
                      value={`${onlineCharacterCount}/${totalCharacters}`}
                      detail="当前抽查到的在线角色占比"
                    />
                    <MetricCard
                      className="border-0 bg-transparent p-0 shadow-none"
                      label="内容产出"
                      value={`${momentsQuery.data?.length ?? 0}/${feedQuery.data?.total ?? 0}`}
                      detail="朋友圈 / 广场动态总数"
                    />
                  </div>

                  <InlineNotice className="mt-4" tone={dutyIssues.length ? "warning" : "success"}>
                    {dutyIssues.length
                      ? `优先从“待处理队列”第一项开始处理。当前首项为：${dutyIssues[0]?.title ?? "待处理事项"}.`
                      : "当前没有高优先级阻塞，建议下一步进入评测页验证最新生成链，或抽查角色与内容样本。"}
                  </InlineNotice>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <AdminJumpCard
                  to={primaryActionHref}
                  title={primaryActionLabel}
                  detail="优先处理当前实例最关键的阻塞项。"
                  emphasis="primary"
                />
                <AdminJumpCard to="/characters" title="进入角色中心" detail="查角色状态、打开工厂或运行逻辑台。" />
                <AdminJumpCard to="/reply-logic" title="查看回复逻辑" detail="排查真实回复链路和全局规则。" />
                <AdminJumpCard to="/evals" title="查看评测分析" detail="进入 runs、compare 和 trace 工作区。" />
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="待处理队列"
                  actions={<StatusPill tone={dutyIssues.length ? "warning" : "healthy"}>{dutyIssues.length ? `${dutyIssues.length} 项` : "当前无阻塞"}</StatusPill>}
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  按影响优先级排序，方便运营接班后直接进入处理动作。
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
                                {issue.actionLabel ?? "去处理"}
                              </Button>
                            </Link>
                          ) : issue.onAction ? (
                            <Button variant="secondary" size="sm" onClick={issue.onAction}>
                              {issue.actionLabel ?? "查看详情"}
                            </Button>
                          ) : null
                        }
                      />
                    ))
                  ) : (
                    <AdminCallout
                      tone="success"
                      title="当前首页没有待处理阻塞"
                      description="实例已经满足继续运营的基础条件，可以把注意力转向评测验证、角色巡检和内容抽查。"
                      actions={
                        <Link to="/evals">
                          <Button variant="secondary">打开评测页</Button>
                        </Link>
                      }
                    />
                  )}
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title="实例体征摘要" actions={<AdminMetaText>一屏巡检</AdminMetaText>} />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  把世界状态、内容产出、消息体量和运行版本压缩成一屏摘要，避免重复扫读多块卡片。
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <MetricCard
                    label="世界主人"
                    value={ownerCount ?? "待确认"}
                    meta={<StatusPill tone={ownerCount === 1 ? "healthy" : "warning"}>{ownerCount === 1 ? "单世界" : "异常"}</StatusPill>}
                  />
                  <MetricCard label="角色总数" value={totalCharacters} detail={`在线 ${onlineCharacterCount}`} />
                  <MetricCard label="消息总数" value={adminStatsQuery.data?.totalMessages ?? 0} detail="含全部单聊历史消息" />
                  <MetricCard label="智能回复" value={adminStatsQuery.data?.aiMessages ?? 0} detail="已落库的 AI 回复条数" />
                  <MetricCard label="朋友圈" value={momentsQuery.data?.length ?? 0} detail="当前世界动态总数" />
                  <MetricCard label="广场动态" value={feedQuery.data?.total ?? 0} detail="公开内容总数" />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <AdminSoftBox>
                    版本 {adminSystemQuery.data?.version ?? statusQuery.data?.coreApi.version ?? "待探测"} · 运行{" "}
                    {formatUptime(adminSystemQuery.data?.uptimeSeconds)}
                  </AdminSoftBox>
                  <AdminSoftBox>
                    数据库{" "}
                    {typeof adminSystemQuery.data?.dbSizeBytes === "number"
                      ? `${(adminSystemQuery.data.dbSizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : "待探测"}{" "}
                    · Node {adminSystemQuery.data?.nodeVersion ?? "待探测"}
                  </AdminSoftBox>
                  <AdminSoftBox className="md:col-span-2">
                    迁移模块：{statusQuery.data?.worldSurface.migratedModules.join("、") ?? "待迁移"}
                  </AdminSoftBox>
                </div>

                <AdminDetailPanel className="mt-4" title="世界上下文">
                  {worldContextQuery.data
                    ? `当前时间 ${worldContextQuery.data.localTime ?? "未知"} · 位置 ${worldContextQuery.data.location ?? "杭州"} · 天气 ${worldContextQuery.data.weather ?? "待获取"} · 季节 ${worldContextQuery.data.season ?? "未知"} · 节日 ${worldContextQuery.data.holiday ?? "无"}`
                    : "最新世界快照暂不可用。"}
                </AdminDetailPanel>
              </Card>
            </div>
          </div>

          <div ref={runtimeSectionRef} className="scroll-mt-24 space-y-4">
            <DashboardSectionLead
              eyebrow="运行体征"
              title="把运行链路、模型接入和数字人可用性放在同一个工作区。"
              description="运营先确认实例连通和模型可用，再决定是否继续做内容抽查、角色观察或回复排障。"
            />

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="运行时与 Core API"
                  actions={
                    <StatusPill tone={desktopRuntimeReady ? "healthy" : systemHealthy ? "muted" : "warning"}>
                      {desktopAvailable ? (desktopRuntimeReady ? "已就绪" : "待恢复") : systemHealthy ? "远程模式" : "待恢复"}
                    </StatusPill>
                  }
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  桌面壳模式下这里负责确认托管状态；远程模式下这里主要看 Core API 和运行目录是否稳定。
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <MetricCard
                    label="核心接口"
                    value={statusQuery.data?.coreApi.version ?? "离线"}
                    meta={
                      <StatusPill tone={systemHealthy ? "healthy" : "warning"}>
                        {statusQuery.isLoading ? "探测中" : systemHealthy ? "健康" : "待恢复"}
                      </StatusPill>
                    }
                  />
                  <MetricCard
                    label="受管地址"
                    value={desktopStatusQuery.data?.baseUrl ?? baseUrl}
                    detail={
                      desktopAvailable
                        ? desktopStatusQuery.data?.reachable
                          ? "桌面壳已接管"
                          : "等待桌面壳确认"
                        : "当前为远程连接模式"
                    }
                  />
                  <MetricCard
                    label="运行数据"
                    value={runtimeContextQuery.data?.runtimeDataDir ?? (desktopAvailable ? "加载中" : "远程实例")}
                    detail={runtimeContextQuery.data?.databasePath ?? desktopStatusQuery.data?.databasePath ?? "等待诊断"}
                  />
                  <MetricCard
                    label="日志数量"
                    value={logsQuery.data?.length ?? 0}
                    detail={logsQuery.isLoading ? "正在读取本地日志索引" : "可在调试与运维区查看"}
                  />
                </div>

                <InlineNotice className="mt-4" tone={desktopRuntimeReady ? "success" : "warning"}>
                  {desktopAvailable
                    ? desktopRuntimeReady
                      ? "桌面运行时已就绪。恢复、推理配置和手动管理入口已经统一收敛到设置页。"
                      : desktopStatusQuery.data?.message ?? "桌面运行时尚未完成初始化，进入设置页可集中恢复。"
                    : systemHealthy
                      ? "当前处于远程连接模式，Core API 健康，可继续做后台操作。"
                      : "当前为远程连接模式，但 Core API 还未健康，优先排查设置页与实例连通性。"}
                </InlineNotice>

                <AdminDetailPanel className="mt-4" title="运行诊断">
                  {desktopAvailable
                    ? runtimeDiagnosticsQuery.data
                      ? formatDesktopDiagnostics(runtimeDiagnosticsQuery.data)
                      : "正在读取桌面运行时诊断..."
                    : "当前不是桌面壳环境，桌面托管诊断不可用。"}
                </AdminDetailPanel>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Link to="/setup">
                    <Button variant="primary" size="lg" className="rounded-2xl">
                      打开运行设置
                    </Button>
                  </Link>
                  <Link to="/evals">
                    <Button variant="secondary" size="lg" className="rounded-2xl">
                      前往评测验证
                    </Button>
                  </Link>
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="模型、数字人与验证"
                  actions={<StatusPill tone={providerConfigured ? "healthy" : "warning"}>{providerConfigured ? "可验证" : "待配置"}</StatusPill>}
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  先确认模型、队列和数字人链路可用，再进入内容抽查或回复排障，避免把环境问题误判成业务问题。
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <MetricCard
                    label="当前模型"
                    value={providerConfigQuery.data?.model ?? aiModelQuery.data?.model ?? "待配置"}
                    detail={
                      statusQuery.data?.inferenceGateway.activeProvider
                        ? `网关：${statusQuery.data.inferenceGateway.activeProvider}`
                        : `模型目录数：${availableModelCount}`
                    }
                  />
                  <MetricCard
                    label="推理队列"
                    value={statusQuery.data?.inferenceGateway.queueDepth ?? 0}
                    detail={`处理中 ${statusQuery.data?.inferenceGateway.inFlightRequests ?? 0} · 最大并发 ${statusQuery.data?.inferenceGateway.maxConcurrency ?? 0}`}
                  />
                  <MetricCard label="最近成功时间" value={statusQuery.data?.inferenceGateway.lastSuccessAt ?? "暂无"} />
                  <MetricCard label="最近错误" value={statusQuery.data?.inferenceGateway.lastError ?? "无"} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <AdminSoftBox>
                    数字人模式：{digitalHumanSummary.modeLabel} · 状态：{digitalHumanSummary.statusLabel}
                  </AdminSoftBox>
                  <AdminSoftBox>播放器模板：{digitalHumanSummary.templateStatus}</AdminSoftBox>
                  <AdminSoftBox>回调鉴权：{digitalHumanSummary.callbackTokenStatus}</AdminSoftBox>
                  <AdminSoftBox>扩展参数：{digitalHumanSummary.paramsStatus}</AdminSoftBox>
                </div>

                <InlineNotice className="mt-4" tone={digitalHumanSummary.ready && providerConfigured ? "success" : "warning"}>
                  {digitalHumanSummary.description} {digitalHumanSummary.nextStep}
                </InlineNotice>

                <AdminDetailPanel className="mt-4" title="评测运行时">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-2xl font-semibold text-[color:var(--text-primary)]">
                      {evalOverviewQuery.data?.runCount ?? 0} 次运行 / {evalOverviewQuery.data?.traceCount ?? 0} 条链路
                    </div>
                    <Link to="/evals">
                      <Button variant="secondary" size="sm">
                        打开评测页
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div>数据集：{evalOverviewQuery.data?.datasetCount ?? 0}</div>
                    <div>失败运行：{failedEvalCount}</div>
                    <div>回退链路：{evalOverviewQuery.data?.fallbackTraceCount ?? 0}</div>
                  </div>
                </AdminDetailPanel>
              </Card>
            </div>
          </div>

          <div ref={signalsSectionRef} className="scroll-mt-24 space-y-4">
            <DashboardSectionLead
              eyebrow="运营信号"
              title="先看角色和内容有没有稳定产出，再决定是否深入到具体工作区。"
              description="这一块服务抽查而不是全面管理，所以只保留关键摘要和最新样本，减少视觉噪音。"
            />

            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader title="角色与内容摘要" actions={<AdminMetaText>抽查入口</AdminMetaText>} />
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="在线角色" value={onlineCharacterCount} detail={`总角色 ${totalCharacters}`} />
                <MetricCard label="朋友圈总数" value={momentsQuery.data?.length ?? 0} detail="最新动态已纳入抽查范围" />
                <MetricCard label="广场动态" value={feedQuery.data?.total ?? 0} detail="公开内容样本可直接抽查" />
                <MetricCard label="评测运行" value={evalOverviewQuery.data?.runCount ?? 0} detail={`Trace ${evalOverviewQuery.data?.traceCount ?? 0}`} />
              </div>
            </Card>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="角色抽查"
                  actions={
                    <Link to="/characters">
                      <Button variant="secondary" size="sm">
                        打开角色中心
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
                        actions={<StatusPill tone={character.isOnline ? "healthy" : "muted"}>{character.isOnline ? "在线" : "离线"}</StatusPill>}
                        body={<div>{character.relationship}</div>}
                        footer={<AdminMetaText>{character.id}</AdminMetaText>}
                      />
                    ))
                  ) : (
                    <AdminPanelEmpty
                      message={
                        charactersQuery.error instanceof Error
                          ? charactersQuery.error.message
                          : "新核心接口进程启动后，角色增删改查兼容路由即可正常使用。"
                      }
                    />
                  )}
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title="朋友圈样本" actions={<AdminMetaText>最近 3 条</AdminMetaText>} />
                <div className="mt-4 space-y-3">
                  {previewMoments.length ? (
                    previewMoments.map((moment) => (
                      <ListItemCard
                        key={moment.id}
                        className="py-3"
                        title={moment.authorName}
                        actions={<AdminMetaText>{moment.likeCount} 赞 / {moment.commentCount} 评论</AdminMetaText>}
                        body={<div className="line-clamp-3 whitespace-pre-wrap">{moment.text?.trim() || "暂无正文"}</div>}
                        footer={<AdminMetaText>{moment.id}</AdminMetaText>}
                      />
                    ))
                  ) : (
                    <AdminPanelEmpty
                      message={
                        momentsQuery.error instanceof Error
                          ? momentsQuery.error.message
                          : "新核心接口进程启动后，朋友圈兼容路由即可正常使用。"
                      }
                    />
                  )}
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title="广场动态样本" actions={<AdminMetaText>最近 3 条</AdminMetaText>} />
                <div className="mt-4 space-y-3">
                  {previewFeedPosts.length ? (
                    previewFeedPosts.map((post) => (
                      <ListItemCard
                        key={post.id}
                        className="py-3"
                        title={post.authorName}
                        actions={<AdminMetaText>{post.likeCount} 赞 / {post.commentCount} 评论</AdminMetaText>}
                        body={<div className="line-clamp-3 whitespace-pre-wrap">{post.text?.trim() || "暂无正文"}</div>}
                        footer={<AdminMetaText>{post.id}</AdminMetaText>}
                      />
                    ))
                  ) : (
                    <AdminPanelEmpty
                      message={
                        feedQuery.error instanceof Error ? feedQuery.error.message : "新核心接口进程启动后，广场兼容路由即可正常使用。"
                      }
                    />
                  )}
                </div>
              </Card>
            </div>
          </div>

          <div ref={schedulerSectionRef} className="scroll-mt-24 space-y-4">
            <DashboardSectionLead
              eyebrow="调度与实时"
              title="把自动运行风险和前端实时链路放在同一个排障平面。"
              description="先看最近有没有失败，再决定是手动触发 job，还是排查实时房间与客户端连接。"
            />

            <AdminCallout
              tone={hasSchedulerIssues ? "warning" : "success"}
              title={hasSchedulerIssues ? "最近调度存在异常，建议优先排查" : "最近调度稳定，可继续日常巡检"}
              description={
                hasSchedulerIssues
                  ? recentSchedulerRuns.find((run) => run.status === "error")?.summary ??
                    "最近存在调度失败记录，请先检查 job 状态和最近执行摘要。"
                  : "当前没有新的调度失败记录，若内容产出异常，可先手动执行关键 job 做一次验证。"
              }
            />

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="调度工作台"
                  actions={<StatusPill tone={hasSchedulerIssues ? "warning" : "healthy"}>{hasSchedulerIssues ? "有异常" : "稳定"}</StatusPill>}
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  把 job 状态、手动执行和最近记录收敛在同一块，减少来回滚动和切页成本。
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <MetricCard label="模式" value={schedulerQuery.data?.mode ?? "待初始化"} />
                  <MetricCard label="启用任务" value={enabledSchedulerJobCount} detail={`总任务 ${schedulerJobs.length}`} />
                  <MetricCard label="最近失败" value={recentSchedulerErrorCount} detail={`最近运行 ${schedulerQuery.data?.recentRuns.length ?? 0}`} />
                </div>

                <div className="mt-4 grid gap-3">
                  {schedulerJobs.map((job) => (
                    <ListItemCard
                      key={job.id}
                      className="py-3"
                      title={job.name}
                      subtitle={job.id}
                      actions={
                        <>
                          <StatusPill tone={job.running ? "warning" : job.enabled ? "healthy" : "muted"}>
                            {job.running ? "运行中" : job.enabled ? "已启用" : "已禁用"}
                          </StatusPill>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!job.enabled || job.running || schedulerRunMutation.isPending}
                            onClick={() => schedulerRunMutation.mutate(job.id)}
                          >
                            {runningSchedulerJobId === job.id ? "执行中..." : "立即执行"}
                          </Button>
                        </>
                      }
                      body={
                        <>
                          <div>{job.description}</div>
                          <AdminMetaText className="mt-2">
                            {job.cadence} / {job.nextRunHint}
                          </AdminMetaText>
                        </>
                      }
                      footer={
                        <div className="grid gap-2 md:grid-cols-3">
                          <AdminSoftBox>运行次数：{job.runCount}</AdminSoftBox>
                          <AdminSoftBox>耗时：{job.lastDurationMs ? `${job.lastDurationMs} ms` : "尚未执行"}</AdminSoftBox>
                          <AdminSoftBox>最近执行：{job.lastRunAt ?? "尚未执行"}</AdminSoftBox>
                        </div>
                      }
                    />
                  ))}

                  {schedulerRunMutation.isError ? (
                    <ErrorBlock
                      message={
                        schedulerRunMutation.error instanceof Error ? schedulerRunMutation.error.message : "调度任务执行失败。"
                      }
                    />
                  ) : null}

                  {!schedulerQuery.data && schedulerQuery.error instanceof Error ? <ErrorBlock message={schedulerQuery.error.message} /> : null}
                  {!schedulerJobs.length && !schedulerQuery.error ? <AdminPanelEmpty message="等待调度器对齐数据..." /> : null}
                </div>

                <AdminDetailPanel className="mt-4" title="最近调度记录" contentClassName="space-y-2">
                  {recentSchedulerRuns.length ? (
                    recentSchedulerRuns.map((event) => (
                      <ListItemCard
                        key={event.id}
                        className="py-3"
                        title={`${event.jobName} · ${event.status === "error" ? "失败" : "成功"}`}
                        body={<div>{event.summary}</div>}
                        footer={
                          <div className="text-xs text-[color:var(--text-muted)]">
                            {event.startedAt}
                            {event.durationMs ? ` · ${event.durationMs} ms` : ""}
                          </div>
                        }
                      />
                    ))
                  ) : (
                    <div>当前还没有调度任务执行记录。</div>
                  )}
                </AdminDetailPanel>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="实时连接与契约"
                  actions={
                    <StatusPill tone={(realtimeQuery.data?.connectedClients ?? 0) > 0 ? "healthy" : "muted"}>
                      {(realtimeQuery.data?.connectedClients ?? 0) > 0 ? "有活跃连接" : "暂无连接"}
                    </StatusPill>
                  }
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  这里主要服务“为什么前端没同步到最新消息或状态”的排查，而不是日常高频操作。
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <MetricCard label="已连接客户端" value={realtimeQuery.data?.connectedClients ?? 0} />
                  <MetricCard label="活跃房间" value={realtimeQuery.data?.activeRooms ?? 0} />
                </div>

                <AdminDetailPanel className="mt-4" title="命名空间与路径">
                  命名空间：{CHAT_NAMESPACE} · Socket 路径：{realtimeQuery.data?.socketPath ?? "/socket.io"}
                </AdminDetailPanel>

                <div className="mt-4 grid gap-3">
                  {previewRooms.length ? (
                    previewRooms.map((room) => (
                      <ListItemCard
                        key={room.roomId}
                        className="py-3"
                        title={room.roomId}
                        body={<div>订阅数：{room.subscriberCount}</div>}
                      />
                    ))
                  ) : realtimeQuery.error instanceof Error ? (
                    <ErrorBlock message={realtimeQuery.error.message} />
                  ) : (
                    <AdminPanelEmpty message="当前还没有活跃的实时房间。" />
                  )}
                </div>

                <AdminDetailPanel className="mt-4" title="最近实时事件" contentClassName="space-y-2">
                  {previewRealtimeEvents.length ? (
                    previewRealtimeEvents.map((event) => <ListItemCard key={event} className="py-3" title={event} />)
                  ) : (
                    <div>当前还没有实时事件。</div>
                  )}
                </AdminDetailPanel>

                <AdminDetailPanel className="mt-4" title="事件契约" contentClassName="grid gap-2 sm:grid-cols-2">
                  {Object.values(CHAT_EVENTS).map((eventName) => (
                    <AdminSoftBox key={eventName}>{eventName}</AdminSoftBox>
                  ))}
                </AdminDetailPanel>
              </Card>
            </div>
          </div>

          <div ref={operationsSectionRef} className="scroll-mt-24 space-y-4">
            <DashboardSectionLead
              eyebrow="调试与运维"
              title="把模型调试、诊断导出、备份恢复和日志入口收敛到页面尾部。"
              description="这些动作频率低于日常巡检，但必须保留清晰风险提示和执行反馈，方便值班人员临时处理。"
            />

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="推理预览"
                  actions={<StatusPill tone={previewMutation.data ? "healthy" : "muted"}>{previewMutation.data ? "已生成预览" : "等待预览"}</StatusPill>}
                />
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  这里只是直连当前 provider 的原始调试入口，不走角色运行时，也不是角色 system prompt 的编辑入口。
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <MetricCard
                    label="当前推理服务"
                    value={providerConfigQuery.data?.model ?? statusQuery.data?.inferenceGateway.activeProvider ?? "尚未配置"}
                  />
                  <MetricCard label="最近成功时间" value={statusQuery.data?.inferenceGateway.lastSuccessAt ?? "暂无"} />
                  <MetricCard label="队列深度" value={statusQuery.data?.inferenceGateway.queueDepth ?? 0} detail={`错误：${statusQuery.data?.inferenceGateway.lastError ?? "无"}`} />
                </div>

                <InlineNotice className="mt-4" tone={providerConfigured ? "success" : "warning"}>
                  {providerConfigQuery.isLoading
                    ? "正在加载已保存的推理服务配置..."
                    : providerConfigQuery.isError && providerConfigQuery.error instanceof Error
                      ? providerConfigQuery.error.message
                      : providerConfigured
                        ? "当前推理服务已配置，适合直接做联通性和基础输出验证。"
                        : "当前尚未配置推理服务。进入设置页可完成首轮配置并测试连通性。"}
                </InlineNotice>

                <form className="mt-4 space-y-4" onSubmit={previewForm.handleSubmit((values) => previewMutation.mutate(values))}>
                  <label className="block text-sm text-[color:var(--text-secondary)]">
                    附加 System Prompt（调试用，可留空）
                    <TextAreaField className="mt-2 min-h-24" {...previewForm.register("systemPrompt")} />
                  </label>
                  <label className="block text-sm text-[color:var(--text-secondary)]">
                    输入内容
                    <TextAreaField className="mt-2 min-h-32" {...previewForm.register("prompt")} />
                  </label>
                  <Button
                    className="w-full rounded-2xl bg-[linear-gradient(135deg,#22c55e,#86efac)] text-slate-950"
                    type="submit"
                    disabled={previewMutation.isPending}
                  >
                    {previewMutation.isPending ? "预览执行中..." : "执行推理预览"}
                  </Button>
                </form>

                <div className="mt-4 grid gap-3">
                  <AdminDetailPanel title="结果" contentClassName="whitespace-pre-wrap text-[color:var(--text-primary)]">
                    {previewMutation.data
                      ? previewMutation.data.output ?? previewMutation.data.error ?? "预览未返回任何输出。"
                      : previewMutation.isError && previewMutation.error instanceof Error
                        ? previewMutation.error.message
                        : "用当前生效的推理服务配置运行一条预览提示词。"}
                  </AdminDetailPanel>
                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard
                      label="模型"
                      value={previewMutation.data?.model ?? statusQuery.data?.inferenceGateway.activeProvider ?? "待执行"}
                    />
                    <MetricCard label="结束原因" value={previewMutation.data?.finishReason ?? "待执行"} />
                    <MetricCard label="令牌数" value={previewMutation.data?.usage?.totalTokens ?? 0} />
                  </div>
                </div>
              </Card>

              <div className="space-y-6">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title="运维操作" actions={<AdminMetaText>低频高风险</AdminMetaText>} />
                  <div className="mt-4 space-y-4">
                    <AdminActionGroup title="日常维护" description="先导出诊断和创建备份，这两项更适合巡检和日常留档。">
                      <div className="grid gap-3">
                        <Button
                          variant="secondary"
                          size="lg"
                          className="justify-start rounded-2xl"
                          disabled={operationsBusy}
                          onClick={() => exportDiagnosticsMutation.mutate()}
                        >
                          {exportDiagnosticsMutation.isPending ? "正在导出诊断包..." : "导出诊断包"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          className="justify-start rounded-2xl"
                          disabled={operationsBusy}
                          onClick={() => createBackupMutation.mutate()}
                        >
                          {createBackupMutation.isPending ? "正在创建备份..." : "创建本地备份"}
                        </Button>
                      </div>
                    </AdminActionGroup>

                    <AdminDangerZone title="高风险恢复" description="恢复备份会直接改写当前实例状态，只在确认需要回滚时执行。">
                      <Button
                        variant="secondary"
                        size="lg"
                        className="w-full justify-center rounded-2xl"
                        disabled={operationsBusy}
                        onClick={() => restoreBackupMutation.mutate()}
                      >
                        {restoreBackupMutation.isPending ? "正在恢复备份..." : "恢复备份"}
                      </Button>
                    </AdminDangerZone>
                  </div>

                  <div className="mt-4 space-y-3">
                    {operationsBusy ? (
                      <AdminActionFeedback
                        tone="busy"
                        title="运维任务执行中"
                        description="当前有运维任务执行中，其他维护操作暂时被锁定。"
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
                      <InlineNotice tone="muted">当前系统运维操作已经接入类型化契约层，随时可以切换到真实运行时实现。</InlineNotice>
                    ) : null}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader
                    title="日志索引"
                    actions={<StatusPill tone={previewLogs.length ? "healthy" : logsQuery.isLoading ? "muted" : "warning"}>{previewLogs.length ? `${previewLogs.length} 条` : logsQuery.isLoading ? "读取中" : "暂无日志"}</StatusPill>}
                  />
                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                    保留最近日志入口，方便做故障留痕和快速定位，不再让日志列表挤占首页中段。
                  </p>

                  <AdminDetailPanel className="mt-4" title="最近日志" contentClassName="space-y-2">
                    {previewLogs.map((logPath) => (
                      <ListItemCard key={logPath} className="py-3" title={logPath} />
                    ))}
                    {logsQuery.isLoading ? (
                      <LoadingBlock className="border-0 bg-transparent px-0 py-0 text-left text-sm shadow-none" label="正在加载本地运行时日志..." />
                    ) : null}
                    {!previewLogs.length && logsQuery.error instanceof Error ? <ErrorBlock message={logsQuery.error.message} /> : null}
                    {!logsQuery.isLoading && !previewLogs.length && !logsQuery.error ? <AdminPanelEmpty message="等待本地运行时日志..." /> : null}
                  </AdminDetailPanel>
                </Card>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 xl:order-2">
          <div className="space-y-4 xl:sticky xl:top-6">
            {successNotice ? (
              <AdminActionFeedback tone="success" title="操作已完成" description={successNotice} />
            ) : null}

            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader
                title="当前值班摘要"
                actions={<StatusPill tone={overallTone}>{overallLabel}</StatusPill>}
              />
              <div className="mt-4 grid gap-3">
                <AdminSoftBox>阻塞项：{blockerCount}</AdminSoftBox>
                <AdminSoftBox>关注项：{watchItemCount}</AdminSoftBox>
                <AdminSoftBox>最近日志：{logsQuery.data?.length ?? 0}</AdminSoftBox>
                <AdminSoftBox>活跃调度任务：{enabledSchedulerJobCount}</AdminSoftBox>
              </div>
              <InlineNotice className="mt-4" tone={dutyIssues.length ? "warning" : "success"}>
                {dutyIssues.length ? dutyIssues[0]?.title ?? "当前存在待处理项。" : "当前首页未发现高优先级阻塞。"}
              </InlineNotice>
            </Card>

            <AdminSectionNav
              title="页面导航"
              items={[
                {
                  label: "值班总览",
                  detail: "先看当前结论、待处理队列和实例体征摘要。",
                  onClick: () => scrollToDashboardSection(overviewSectionRef),
                },
                {
                  label: "运行体征",
                  detail: "查看 Core API、模型、数字人与评测运行时。",
                  onClick: () => scrollToDashboardSection(runtimeSectionRef),
                },
                {
                  label: "运营信号",
                  detail: "抽查角色、朋友圈和广场动态最新样本。",
                  onClick: () => scrollToDashboardSection(signalsSectionRef),
                },
                {
                  label: "调度与实时",
                  detail: "排查 job 失败、活跃房间和实时事件。",
                  onClick: () => scrollToDashboardSection(schedulerSectionRef),
                },
                {
                  label: "调试与运维",
                  detail: "做推理预览、导出诊断、备份恢复和日志查看。",
                  onClick: () => scrollToDashboardSection(operationsSectionRef),
                },
              ]}
            />

            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader title="快捷动作" />
              <div className="mt-4 grid gap-3">
                <QuickActionLink to="/setup" label="打开运行设置" detail="恢复实例、补齐 Provider、检查数字人参数。" />
                <QuickActionLink to="/characters" label="打开角色中心" detail="抽查角色在线状态、画像和运行工作区。" />
                <QuickActionLink to="/reply-logic" label="打开回复逻辑" detail="查看真实回复链路、规则和常量。" />
                <QuickActionLink to="/evals" label="打开评测分析" detail="验证生成链路质量，定位失败样本。" />
                <button
                  type="button"
                  onClick={() => scrollToDashboardSection(schedulerSectionRef)}
                  className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
                >
                  <div className="font-semibold text-[color:var(--text-primary)]">跳到调度排查</div>
                  <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                    当前有调度异常或需要手动触发 job 时，直接回到对应工作区。
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
  eyebrow: string;
  title: string;
  description: string;
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
  action = "进入",
}: {
  to: DashboardRoute;
  label: string;
  detail: string;
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
}) {
  const packageStatus = values.linuxMissingPackages.length
    ? `缺失依赖=${values.linuxMissingPackages.join(", ")}`
    : "Linux 依赖正常";
  const sidecarStatus = formatCommandSource(values.coreApiCommandSource, values.bundledCoreApiExists);
  const failureStatus =
    values.diagnosticsStatus === "port-occupied"
      ? "端口已占用"
      : values.diagnosticsStatus === "bundled-sidecar-missing"
        ? "内置 sidecar 缺失"
        : values.diagnosticsStatus === "spawn-failed"
          ? "拉起失败"
          : values.diagnosticsStatus === "health-probe-failed"
            ? "健康探测失败"
            : values.diagnosticsStatus ?? "未知";
  const managedStatus = values.managedByDesktopShell
    ? `由桌面壳托管${values.managedChildPid ? ` pid=${values.managedChildPid}` : ""}`
    : "未由桌面壳托管";
  const logPath = values.desktopLogPath ? ` · 日志=${values.desktopLogPath}` : "";
  const lastError = values.lastCoreApiError ? ` · 最近错误=${values.lastCoreApiError}` : "";

  return `${values.platform} · ${values.summary} · ${values.coreApiCommandResolved ? "命令正常" : "命令缺失"} · ${sidecarStatus} · ${failureStatus} · ${managedStatus} · ${packageStatus}${values.coreApiPortOccupied ? " · 端口占用中" : ""}${logPath}${lastError}`;
}

function formatCommandSource(source?: string, bundledExists?: boolean) {
  if (source === "bundled" || source === "bundled-sidecar") {
    return "内置 sidecar";
  }
  if (source === "env" || source === "env-override") {
    return "环境变量覆盖";
  }
  if (source === "path" || source === "path-lookup") {
    return bundledExists ? "PATH 查找（内置 sidecar 缺失）" : "PATH 查找";
  }

  return bundledExists ? "sidecar 已就绪" : "sidecar 缺失";
}

function formatUptime(uptimeSeconds?: number | null) {
  if (typeof uptimeSeconds !== "number") {
    return "待探测";
  }

  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  return `${hours} 小时 ${minutes} 分钟`;
}
