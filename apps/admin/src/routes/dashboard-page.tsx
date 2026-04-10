import { useEffect, useEffectEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../lib/admin-api";
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
  AppHeader,
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  ListItemCard,
  LoadingBlock,
  MetricCard,
  PanelEmpty,
  SectionHeading,
  StatusPill,
  TextAreaField,
  useDesktopRuntime,
} from "@yinjie/ui";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

type InferencePreviewForm = {
  prompt: string;
  systemPrompt?: string;
};

export function DashboardPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();

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
  const [successNotice, setSuccessNotice] = useState("");
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
      prompt: "请从隐界推理网关返回一段问候语。",
      systemPrompt: "你正在验证新的隐界推理运行时。",
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
  const runningSchedulerJobId = schedulerRunMutation.isPending ? schedulerRunMutation.variables : null;
  const operationsBusy =
    exportDiagnosticsMutation.isPending || createBackupMutation.isPending || restoreBackupMutation.isPending;
  const providerConfigured = Boolean(providerConfigQuery.data?.model?.trim());
  const desktopRuntimeReady = desktopAvailable
    ? Boolean(desktopStatusQuery.data?.reachable && runtimeContextQuery.data?.runtimeDataDir)
    : Boolean(statusQuery.data?.coreApi.healthy);
  const systemHealthy = Boolean(statusQuery.data?.coreApi.healthy);
  const primaryActionHref = !desktopRuntimeReady || !providerConfigured ? "/setup" : "/evals";
  const primaryActionLabel = !desktopRuntimeReady || !providerConfigured ? "打开运行设置" : "前往评测验证";
  const nextActionMessage = !desktopRuntimeReady
    ? "本地运行时尚未完全恢复。先进入设置页恢复核心接口、运行数据和推理服务。"
    : !providerConfigured
      ? "核心接口已在线，但推理服务还未配置。下一步应完成设置。"
      : systemHealthy
        ? "系统已进入可运维状态。建议下一步进入评测页验证当前生成链质量。"
        : "核心接口仍未健康，优先排查设置页和运维操作区。";

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  const resetDashboardMutations = useEffectEvent(() => {
    setSuccessNotice("");
    previewMutation.reset();
    exportDiagnosticsMutation.reset();
    createBackupMutation.reset();
    restoreBackupMutation.reset();
    schedulerRunMutation.reset();
  });

  useEffect(() => {
    resetDashboardMutations();
  }, [baseUrl, resetDashboardMutations]);

  return (
    <div className="space-y-6">
      <AppHeader
        eyebrow="运行总览"
        title="实例运行概览"
        description="先判断系统是否健康，再决定进入设置、评测还是角色管理。"
        actions={
          <Link to={primaryActionHref}>
            <Button variant="primary" size="lg" className="rounded-2xl">
              {primaryActionLabel}
            </Button>
          </Link>
        }
      />
      {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}
      {adminStatsQuery.isError && adminStatsQuery.error instanceof Error ? (
        <ErrorBlock message={adminStatsQuery.error.message} />
      ) : null}
      {adminSystemQuery.isError && adminSystemQuery.error instanceof Error ? (
        <ErrorBlock message={adminSystemQuery.error.message} />
      ) : null}

      {/* NestJS 后端统计 */}
      {(adminStatsQuery.data || adminSystemQuery.data) && (
        <section className="rounded-[30px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">隐界后端 (NestJS)</div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {adminStatsQuery.data && (
              <>
          <MetricCard label="世界主人" value={String(adminStatsQuery.data.ownerCount)} meta={<StatusPill tone="healthy">单世界</StatusPill>} />
                <MetricCard label="角色" value={String(adminStatsQuery.data.characterCount)} meta={<StatusPill tone="healthy">角色</StatusPill>} />
                <MetricCard label="消息总数" value={String(adminStatsQuery.data.totalMessages)} meta={<StatusPill tone="healthy">消息</StatusPill>} />
                <MetricCard label="智能回复" value={String(adminStatsQuery.data.aiMessages)} meta={<StatusPill tone="healthy">智能</StatusPill>} />
              </>
            )}
          </div>
          {adminSystemQuery.data && (
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-[color:var(--text-muted)]">
              <span>版本 {adminSystemQuery.data.version}</span>
              <span>运行 {Math.floor(adminSystemQuery.data.uptimeSeconds / 3600)} 小时 {Math.floor((adminSystemQuery.data.uptimeSeconds % 3600) / 60)} 分钟</span>
              <span>数据库 {(adminSystemQuery.data.dbSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
              <span>运行时 {adminSystemQuery.data.nodeVersion}</span>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="bg-[color:var(--surface-console)]">
          <MetricCard
            className="border-0 bg-transparent p-0"
            label="核心接口"
            value={statusQuery.data?.coreApi.version ?? "离线"}
            meta={
              <StatusPill tone={systemHealthy ? "healthy" : "warning"}>
                {statusQuery.isLoading ? "探测中" : systemHealthy ? "健康" : "待恢复"}
              </StatusPill>
            }
          />
        </Card>
        <Card className="bg-[color:var(--surface-console)]">
          <MetricCard
            className="border-0 bg-transparent p-0"
            label="推理服务"
            value={providerConfigQuery.data?.model ?? "待配置"}
            meta={<StatusPill tone={providerConfigured ? "healthy" : "warning"}>{providerConfigured ? "已配置" : "缺失"}</StatusPill>}
          />
        </Card>
        <Card className="bg-[color:var(--surface-console)]">
          <MetricCard
            className="border-0 bg-transparent p-0"
            label="队列深度"
            value={statusQuery.data?.inferenceGateway.queueDepth ?? 0}
            detail={`处理中 ${statusQuery.data?.inferenceGateway.inFlightRequests ?? 0}`}
          />
        </Card>
        <Card className="bg-[color:var(--surface-console)]">
          <MetricCard
            className="border-0 bg-transparent p-0"
            label="评测"
            value={evalOverviewQuery.data?.runCount ?? 0}
            detail={`链路 ${evalOverviewQuery.data?.traceCount ?? 0}`}
          />
        </Card>
      </div>

      <InlineNotice tone={desktopRuntimeReady && providerConfigured && systemHealthy ? "success" : "warning"}>
        {nextActionMessage}
      </InlineNotice>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
      <div className="space-y-6">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>桌面运行时</SectionHeading>
          {desktopAvailable ? (
            <>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <MetricCard
                  label="受管核心接口"
                  value={desktopStatusQuery.data?.baseUrl ?? "加载中"}
                  meta={
                    <StatusPill tone={desktopStatusQuery.data?.reachable ? "healthy" : "warning"}>
                      {desktopStatusQuery.data?.running ? "已托管" : "未托管"}
                    </StatusPill>
                  }
                />

                <MetricCard
                  label="运行数据"
                  value={runtimeContextQuery.data?.runtimeDataDir ?? "加载中"}
                  detail={runtimeContextQuery.data?.databasePath ?? desktopStatusQuery.data?.databasePath ?? "加载中"}
                />
              </div>

              <InlineNotice className="mt-4" tone={desktopRuntimeReady ? "success" : "warning"}>
                {desktopRuntimeReady
                  ? "桌面运行时已就绪。恢复、推理服务配置和手动管理入口已经统一收敛到设置页面。"
                  : desktopStatusQuery.data?.message ?? "桌面运行时尚未完成初始化，进入设置页可集中恢复。"}
              </InlineNotice>

              <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 text-sm text-[color:var(--text-secondary)]">
                {runtimeDiagnosticsQuery.data
                  ? formatDesktopDiagnostics(runtimeDiagnosticsQuery.data)
                  : "正在读取桌面运行时诊断..."}
              </div>

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
            </>
          ) : (
            <InlineNotice className="mt-4 border-dashed" tone="muted">
              只有在 Tauri 桌面壳内打开本后台时，桌面运行时相关命令才可用。
            </InlineNotice>
          )}
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>系统概览</SectionHeading>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <MetricCard
              label="核心接口"
              value={statusQuery.data?.coreApi.version ?? "离线"}
              meta={
                <StatusPill tone={statusQuery.data?.coreApi.healthy ? "healthy" : "warning"}>
                  {statusQuery.isLoading ? "探测中" : statusQuery.data?.coreApi.healthy ? "健康" : "待恢复"}
                </StatusPill>
              }
            />

            <MetricCard
              label="推理队列"
              value={statusQuery.data?.inferenceGateway.queueDepth ?? 0}
              detail={`最大并发：${statusQuery.data?.inferenceGateway.maxConcurrency ?? 0} · 处理中：${statusQuery.data?.inferenceGateway.inFlightRequests ?? 0} · 成功探测：${statusQuery.data?.inferenceGateway.successfulRequests ?? 0} · 失败探测：${statusQuery.data?.inferenceGateway.failedRequests ?? 0}`}
            />

            <MetricCard
              label="当前模型"
              value={aiModelQuery.data?.model ?? "待配置"}
              detail={
                statusQuery.data?.inferenceGateway.activeProvider
                  ? `网关：${statusQuery.data.inferenceGateway.activeProvider}`
                  : `模型目录数：${availableModelsQuery.data?.models.length ?? 0}`
              }
            />

            <MetricCard
              label="角色"
              value={charactersQuery.data?.length ?? statusQuery.data?.worldSurface.charactersCount ?? 0}
              detail={`已迁移模块：${statusQuery.data?.worldSurface.migratedModules.join(", ") ?? "待迁移"}`}
            />

            <MetricCard
              label="叙事弧线"
              value={statusQuery.data?.worldSurface.narrativeArcsCount ?? 0}
              detail="已接纳的好友关系会同步保证兼容运行时的弧线记录"
            />

            <MetricCard
              label="行为日志"
              value={statusQuery.data?.worldSurface.behaviorLogsCount ?? 0}
              detail="用于追踪智能生成的朋友圈、好友请求、广场互动和群聊回复"
            />

            <MetricCard
              className="md:col-span-2"
              label="世界上下文"
              value={worldContextQuery.data?.localTime ?? "待生成"}
              detail={
                worldContextQuery.data?.season
                  ? `季节=${worldContextQuery.data.season} / 节日=${worldContextQuery.data.holiday ?? "无"}`
                  : "最新世界快照暂不可用。"
              }
            />

            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 md:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">评测运行时</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {evalOverviewQuery.data?.runCount ?? 0} 次运行 / {evalOverviewQuery.data?.traceCount ?? 0} 条链路
                  </div>
                </div>
                <Link to="/evals">
                  <Button variant="secondary" size="sm">
                    打开评测页
                  </Button>
                </Link>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-[color:var(--text-secondary)] md:grid-cols-3">
                <div>数据集：{evalOverviewQuery.data?.datasetCount ?? 0}</div>
                <div>失败运行：{evalOverviewQuery.data?.failedRunCount ?? 0}</div>
                <div>回退链路：{evalOverviewQuery.data?.fallbackTraceCount ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 text-sm leading-7 text-[color:var(--text-secondary)]">
            当前控制台已经与共享契约层对齐。已迁移的兼容面覆盖配置、角色、社交、聊天、朋友圈、广场和世界上下文。
            调度器也已经接入实际 Rust 运行切片，运行时统计和手动触发都已纳入本页。叙事弧线与智能行为日志也已经同步纳入新运行时。
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>角色面板</SectionHeading>
          <div className="mt-4 space-y-3">
            {previewCharacters.length > 0 ? (
              previewCharacters.map((character) => (
                <ListItemCard
                  key={character.id}
                  className="py-3"
                  title={character.name}
                  body={<div>{character.relationship}</div>}
                  footer={
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {character.id}
                    </div>
                  }
                />
              ))
            ) : (
              <PanelEmpty
                className="border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]"
                message={
                  charactersQuery.error instanceof Error
                    ? charactersQuery.error.message
                    : "新核心接口进程启动后，角色增删改查兼容路由即可正常使用。"
                }
              />
            )}
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>朋友圈面板</SectionHeading>
            <div className="mt-4 text-sm text-[color:var(--text-secondary)]">
              帖子总数：{momentsQuery.data?.length ?? 0}
            </div>
            <div className="mt-4 space-y-3">
              {previewMoments.length > 0 ? (
                previewMoments.map((moment) => (
                  <ListItemCard
                    key={moment.id}
                    className="py-3"
                    title={moment.authorName}
                    actions={
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                        {moment.likeCount} 赞 / {moment.commentCount} 评论
                      </div>
                    }
                    body={<div className="line-clamp-3">{moment.text}</div>}
                    footer={
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                        {moment.id}
                      </div>
                    }
                  />
                ))
              ) : (
                <PanelEmpty
                  className="border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]"
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
            <SectionHeading>广场面板</SectionHeading>
            <div className="mt-4 text-sm text-[color:var(--text-secondary)]">
              帖子总数：{feedQuery.data?.total ?? 0}
            </div>
            <div className="mt-4 space-y-3">
              {previewFeedPosts.length > 0 ? (
                previewFeedPosts.map((post) => (
                  <ListItemCard
                    key={post.id}
                    className="py-3"
                    title={post.authorName}
                    actions={
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                        {post.likeCount} 赞 / {post.commentCount} 评论
                      </div>
                    }
                    body={<div className="line-clamp-3">{post.text}</div>}
                    footer={
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                        {post.id}
                      </div>
                    }
                  />
                ))
              ) : (
                <PanelEmpty
                  className="border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]"
                  message={
                    feedQuery.error instanceof Error
                      ? feedQuery.error.message
                      : "新核心接口进程启动后，广场兼容路由即可正常使用。"
                  }
                />
              )}
            </div>
          </Card>
        </div>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>调度面板</SectionHeading>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricCard label="模式" value={schedulerQuery.data?.mode ?? "待初始化"} />
            <MetricCard
              label="世界快照"
              value={schedulerQuery.data?.worldSnapshots ?? statusQuery.data?.scheduler.worldSnapshots ?? 0}
            />
            <MetricCard label="最近运行" value={schedulerQuery.data?.recentRuns.length ?? 0} />
          </div>

          <div className="mt-4 grid gap-3">
            {schedulerQuery.data?.jobs.map((job) => (
              <ListItemCard
                key={job.id}
                className="py-3"
                title={job.name}
                subtitle={job.id}
                actions={
                  <>
                    <StatusPill tone={job.running ? "warning" : job.enabled ? "healthy" : "warning"}>
                      {job.running ? "运行中" : job.enabled ? "已启用" : "已禁用"}
                    </StatusPill>
                    <button
                      className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      disabled={!job.enabled || job.running || schedulerRunMutation.isPending}
                      onClick={() => schedulerRunMutation.mutate(job.id)}
                    >
                      {runningSchedulerJobId === job.id ? "执行中..." : "立即执行"}
                    </button>
                  </>
                }
                body={
                  <>
                    <div>{job.description}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {job.cadence} / {job.nextRunHint}
                    </div>
                  </>
                }
                footer={
                  <>
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2">
                        运行次数：{job.runCount}
                      </div>
                      <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2">
                        耗时：{job.lastDurationMs ? `${job.lastDurationMs} ms` : "尚未执行"}
                      </div>
                      <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2">
                        最近执行：{job.lastRunAt ?? "尚未执行"}
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--text-secondary)]">
                      {job.lastResult ?? "暂时还没有执行结果记录。"}
                    </div>
                  </>
                }
              />
            ))}
            {schedulerRunMutation.isError && (
              <ErrorBlock
                message={
                  schedulerRunMutation.error instanceof Error
                    ? schedulerRunMutation.error.message
                    : "调度任务执行失败。"
                }
              />
            )}
            {!schedulerQuery.data && schedulerQuery.error instanceof Error && (
              <ErrorBlock message={schedulerQuery.error.message} />
            )}
            {!schedulerQuery.data && !schedulerQuery.error && (
              <PanelEmpty className="border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]" message="等待调度器对齐数据..." />
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">最近调度记录</div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
              {schedulerQuery.data?.recentRuns.map((event) => (
                <ListItemCard key={event} className="py-3" title={event} />
              ))}
              {schedulerQuery.data && schedulerQuery.data.recentRuns.length === 0 && (
                <div>当前还没有调度任务执行记录。</div>
              )}
            </div>
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>实时契约</SectionHeading>
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 text-sm text-[color:var(--text-secondary)]">
            命名空间：{CHAT_NAMESPACE}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <MetricCard label="已连接客户端" value={realtimeQuery.data?.connectedClients ?? 0} />
            <MetricCard label="活跃房间" value={realtimeQuery.data?.activeRooms ?? 0} />
          </div>
          <div className="mt-4 grid gap-3">
            {Object.values(CHAT_EVENTS).map((eventName) => (
              <ListItemCard key={eventName} className="py-3" title={eventName} />
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 text-sm text-[color:var(--text-secondary)]">
            Socket 路径：{realtimeQuery.data?.socketPath ?? "/socket.io"}
          </div>
          <div className="mt-4 grid gap-3">
            {realtimeQuery.data?.rooms.map((room) => (
              <ListItemCard
                key={room.roomId}
                className="py-3"
                title={room.roomId}
                body={<div>订阅数：{room.subscriberCount}</div>}
              />
            ))}
            {realtimeQuery.data && realtimeQuery.data.rooms.length === 0 && (
              <PanelEmpty className="border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]" message="当前还没有活跃的实时房间。" />
            )}
            {!realtimeQuery.data && realtimeQuery.error instanceof Error && (
              <ErrorBlock message={realtimeQuery.error.message} />
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">最近实时事件</div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
              {realtimeQuery.data?.recentEvents.map((event) => (
                <ListItemCard key={event} className="py-3" title={event} />
              ))}
              {realtimeQuery.data && realtimeQuery.data.recentEvents.length === 0 && <div>当前还没有实时事件。</div>}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>推理服务运行时</SectionHeading>
          <InlineNotice className="mt-4" tone={providerConfigured ? "success" : "warning"}>
            {providerConfigQuery.isLoading
              ? "正在加载已保存的推理服务配置..."
              : providerConfigQuery.isError && providerConfigQuery.error instanceof Error
                ? providerConfigQuery.error.message
                : providerConfigured
                  ? "当前推理服务已配置，编辑、探测和保存入口已经统一收敛到设置页。"
                  : "当前尚未配置推理服务。进入设置页可完成首轮配置并测试连通性。"}
          </InlineNotice>

          <div className="mt-4 grid gap-3">
            <MetricCard
              label="当前推理服务"
              value={providerConfigQuery.data?.model ?? statusQuery.data?.inferenceGateway.activeProvider ?? "尚未配置"}
            />
            <MetricCard label="最近成功时间" value={statusQuery.data?.inferenceGateway.lastSuccessAt ?? "暂无"} />
            <MetricCard label="最近错误" value={statusQuery.data?.inferenceGateway.lastError ?? "无"} />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/setup">
              <Button variant="primary" size="lg" className="rounded-2xl">
                打开推理设置
              </Button>
            </Link>
            <Link to="/evals">
              <Button variant="secondary" size="lg" className="rounded-2xl">
                运行评测
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>推理预览</SectionHeading>
          <form
            className="mt-4 space-y-4"
            onSubmit={previewForm.handleSubmit((values) => previewMutation.mutate(values))}
          >
            <label className="block text-sm text-[color:var(--text-secondary)]">
              系统提示词
              <TextAreaField className="mt-2 min-h-24" {...previewForm.register("systemPrompt")} />
            </label>
            <label className="block text-sm text-[color:var(--text-secondary)]">
              用户提示词
              <TextAreaField className="mt-2 min-h-32" {...previewForm.register("prompt")} />
            </label>
            <Button className="w-full rounded-2xl bg-[linear-gradient(135deg,#22c55e,#86efac)] text-slate-950" type="submit" disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "预览执行中..." : "执行推理预览"}
            </Button>
          </form>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">结果</div>
              <div className="mt-2 whitespace-pre-wrap text-[color:var(--text-primary)]">
                {previewMutation.data
                  ? previewMutation.data.output ?? previewMutation.data.error ?? "预览未返回任何输出。"
                  : previewMutation.isError && previewMutation.error instanceof Error
                    ? previewMutation.error.message
                    : "用当前生效的推理服务配置运行一条预览提示词。"}
              </div>
            </div>
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

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>运维操作</SectionHeading>
          <div className="mt-4 grid gap-3">
            <Button variant="secondary" size="lg" className="justify-start rounded-2xl" disabled={operationsBusy} onClick={() => exportDiagnosticsMutation.mutate()}>
              {exportDiagnosticsMutation.isPending ? "正在导出诊断包..." : "导出诊断包"}
            </Button>
            <Button variant="secondary" size="lg" className="justify-start rounded-2xl" disabled={operationsBusy} onClick={() => createBackupMutation.mutate()}>
              {createBackupMutation.isPending ? "正在创建备份..." : "创建本地备份"}
            </Button>
            <Button variant="secondary" size="lg" className="justify-start rounded-2xl" disabled={operationsBusy} onClick={() => restoreBackupMutation.mutate()}>
              {restoreBackupMutation.isPending ? "正在恢复备份..." : "恢复备份"}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {operationsBusy ? (
              <InlineNotice tone="info">
                当前有运维任务执行中，其他维护操作暂时被锁定。
              </InlineNotice>
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
              <InlineNotice tone="muted">
                当前系统运维操作已经接入类型化契约层，随时可以切换到真实运行时实现。
              </InlineNotice>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">日志索引</div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
              {logsQuery.data?.map((logPath) => (
                <ListItemCard key={logPath} className="py-3" title={logPath} />
              ))}
              {logsQuery.isLoading ? <LoadingBlock className="px-0 py-0 text-left text-sm bg-transparent border-0 shadow-none" label="正在加载本地运行时日志..." /> : null}
              {!logsQuery.data && logsQuery.error instanceof Error ? <ErrorBlock message={logsQuery.error.message} /> : null}
              {!logsQuery.isLoading && !logsQuery.data && !logsQuery.error ? (
                <PanelEmpty className="border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]" message="等待本地运行时日志..." />
              ) : null}
            </div>
          </div>
        </Card>
      </div>
      </div>
    </div>
  );
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
