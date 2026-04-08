import { useEffect, useState } from "react";
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

type InferencePreviewForm = {
  prompt: string;
  systemPrompt?: string;
};

export function DashboardPage() {
  const baseUrl = import.meta.env.VITE_CORE_API_BASE_URL;
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
    queryFn: () => getMoments(undefined, baseUrl),
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
      prompt: "Say hello from the Yinjie inference gateway.",
      systemPrompt: "You are validating the new Yinjie inference runtime.",
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
      setSuccessNotice("Inference preview completed.");
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
      setSuccessNotice("Backup restore completed.");
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
      setSuccessNotice("Scheduler job finished.");
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
  const primaryActionLabel = !desktopRuntimeReady || !providerConfigured ? "Open Runtime Setup" : "Validate In Evals";
  const nextActionMessage = !desktopRuntimeReady
    ? "本地运行时尚未完全恢复。先进入 Setup 恢复 Core API、runtime data 和 provider。"
    : !providerConfigured
      ? "Core API 已在线，但 provider 还未配置。下一步应完成 Setup。"
      : systemHealthy
        ? "系统已进入可运维状态。建议下一步进入 Evals 验证当前生成链质量。"
        : "Core API 尚未健康，优先排查 Setup 和 Operations 区域。";

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  useEffect(() => {
    setSuccessNotice("");
    previewMutation.reset();
    exportDiagnosticsMutation.reset();
    createBackupMutation.reset();
    restoreBackupMutation.reset();
    schedulerRunMutation.reset();
  }, [baseUrl]);

  return (
    <div className="space-y-6">
      <AppHeader
        eyebrow="Control Plane"
        title="Local Runtime Overview"
        description="先判断系统是否健康，再决定去 Setup、Evals 还是 Character Registry。"
        actions={
          <Link to={primaryActionHref}>
            <Button variant="primary" size="lg" className="rounded-2xl">
              {primaryActionLabel}
            </Button>
          </Link>
        }
      />
      {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}

      {/* NestJS 后端统计 */}
      {(adminStatsQuery.data || adminSystemQuery.data) && (
        <section className="rounded-[30px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">隐界后端 (NestJS)</div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {adminStatsQuery.data && (
              <>
          <MetricCard label="世界主人" value={String(adminStatsQuery.data.ownerCount)} meta={<StatusPill tone="healthy">single</StatusPill>} />
                <MetricCard label="角色" value={String(adminStatsQuery.data.characterCount)} meta={<StatusPill tone="healthy">characters</StatusPill>} />
                <MetricCard label="消息总数" value={String(adminStatsQuery.data.totalMessages)} meta={<StatusPill tone="healthy">messages</StatusPill>} />
                <MetricCard label="AI 回复" value={String(adminStatsQuery.data.aiMessages)} meta={<StatusPill tone="healthy">ai</StatusPill>} />
              </>
            )}
          </div>
          {adminSystemQuery.data && (
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-[color:var(--text-muted)]">
              <span>版本 {adminSystemQuery.data.version}</span>
              <span>运行 {Math.floor(adminSystemQuery.data.uptimeSeconds / 3600)}h {Math.floor((adminSystemQuery.data.uptimeSeconds % 3600) / 60)}m</span>
              <span>DB {(adminSystemQuery.data.dbSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
              <span>Node {adminSystemQuery.data.nodeVersion}</span>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="bg-[color:var(--surface-console)]">
          <MetricCard
            className="border-0 bg-transparent p-0"
            label="Core API"
            value={statusQuery.data?.coreApi.version ?? "offline"}
            meta={
              <StatusPill tone={systemHealthy ? "healthy" : "warning"}>
                {statusQuery.isLoading ? "probing" : systemHealthy ? "healthy" : "waiting"}
              </StatusPill>
            }
          />
        </Card>
        <Card className="bg-[color:var(--surface-console)]">
          <MetricCard
            className="border-0 bg-transparent p-0"
            label="Provider"
            value={providerConfigQuery.data?.model ?? "pending"}
            meta={<StatusPill tone={providerConfigured ? "healthy" : "warning"}>{providerConfigured ? "configured" : "missing"}</StatusPill>}
          />
        </Card>
        <Card className="bg-[color:var(--surface-console)]">
          <MetricCard
            className="border-0 bg-transparent p-0"
            label="Queue Depth"
            value={statusQuery.data?.inferenceGateway.queueDepth ?? 0}
            detail={`in flight ${statusQuery.data?.inferenceGateway.inFlightRequests ?? 0}`}
          />
        </Card>
        <Card className="bg-[color:var(--surface-console)]">
          <MetricCard
            className="border-0 bg-transparent p-0"
            label="Evals"
            value={evalOverviewQuery.data?.runCount ?? 0}
            detail={`traces ${evalOverviewQuery.data?.traceCount ?? 0}`}
          />
        </Card>
      </div>

      <InlineNotice tone={desktopRuntimeReady && providerConfigured && systemHealthy ? "success" : "warning"}>
        {nextActionMessage}
      </InlineNotice>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
      <div className="space-y-6">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Desktop Runtime</SectionHeading>
          {desktopAvailable ? (
            <>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <MetricCard
                  label="Managed Core API"
                  value={desktopStatusQuery.data?.baseUrl ?? "loading"}
                  meta={
                    <StatusPill tone={desktopStatusQuery.data?.reachable ? "healthy" : "warning"}>
                      {desktopStatusQuery.data?.running ? "managed" : "not managed"}
                    </StatusPill>
                  }
                />

                <MetricCard
                  label="Runtime Data"
                  value={runtimeContextQuery.data?.runtimeDataDir ?? "loading"}
                  detail={runtimeContextQuery.data?.databasePath ?? desktopStatusQuery.data?.databasePath ?? "loading"}
                />
              </div>

              <InlineNotice className="mt-4" tone={desktopRuntimeReady ? "success" : "warning"}>
                {desktopRuntimeReady
                  ? "桌面运行时已就绪。恢复、provider 配置和手动管理入口已经统一收敛到 Setup 页面。"
                  : desktopStatusQuery.data?.message ?? "桌面运行时尚未完成初始化，进入 Setup 页面可集中恢复。"}
              </InlineNotice>

              <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 text-sm text-[color:var(--text-secondary)]">
                {runtimeDiagnosticsQuery.data
                  ? formatDesktopDiagnostics(runtimeDiagnosticsQuery.data)
                  : "正在读取桌面运行时诊断..."}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link to="/setup">
                  <Button variant="primary" size="lg" className="rounded-2xl">
                    Open Runtime Setup
                  </Button>
                </Link>
                <Link to="/evals">
                  <Button variant="secondary" size="lg" className="rounded-2xl">
                    Validate In Evals
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <InlineNotice className="mt-4 border-dashed" tone="muted">
              Desktop runtime commands are only available when this admin surface is opened inside the Tauri shell.
            </InlineNotice>
          )}
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>System Overview</SectionHeading>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <MetricCard
              label="Core API"
              value={statusQuery.data?.coreApi.version ?? "offline"}
              meta={
                <StatusPill tone={statusQuery.data?.coreApi.healthy ? "healthy" : "warning"}>
                  {statusQuery.isLoading ? "probing" : statusQuery.data?.coreApi.healthy ? "healthy" : "waiting"}
                </StatusPill>
              }
            />

            <MetricCard
              label="Inference Queue"
              value={statusQuery.data?.inferenceGateway.queueDepth ?? 0}
              detail={`max concurrency: ${statusQuery.data?.inferenceGateway.maxConcurrency ?? 0} · in flight: ${statusQuery.data?.inferenceGateway.inFlightRequests ?? 0} · successful probes: ${statusQuery.data?.inferenceGateway.successfulRequests ?? 0} · failed probes: ${statusQuery.data?.inferenceGateway.failedRequests ?? 0}`}
            />

            <MetricCard
              label="Active AI Model"
              value={aiModelQuery.data?.model ?? "pending"}
              detail={
                statusQuery.data?.inferenceGateway.activeProvider
                  ? `gateway: ${statusQuery.data.inferenceGateway.activeProvider}`
                  : `catalog size: ${availableModelsQuery.data?.models.length ?? 0}`
              }
            />

            <MetricCard
              label="Characters"
              value={charactersQuery.data?.length ?? statusQuery.data?.worldSurface.charactersCount ?? 0}
              detail={`migrated modules: ${statusQuery.data?.worldSurface.migratedModules.join(", ") ?? "pending"}`}
            />

            <MetricCard
              label="Narrative Arcs"
              value={statusQuery.data?.worldSurface.narrativeArcsCount ?? 0}
              detail="accepted friendships now ensure runtime-compatible arc records"
            />

            <MetricCard
              label="Behavior Logs"
              value={statusQuery.data?.worldSurface.behaviorLogsCount ?? 0}
              detail="tracks AI-generated moments, friend requests, feed reactions, and group replies"
            />

            <MetricCard
              className="md:col-span-2"
              label="World Context"
              value={worldContextQuery.data?.localTime ?? "pending"}
              detail={
                worldContextQuery.data?.season
                  ? `season=${worldContextQuery.data.season} / holiday=${worldContextQuery.data.holiday ?? "none"}`
                  : "Latest world snapshot is not available yet."
              }
            />

            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 md:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Eval Runtime</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {evalOverviewQuery.data?.runCount ?? 0} runs / {evalOverviewQuery.data?.traceCount ?? 0} traces
                  </div>
                </div>
                <Link to="/evals">
                  <Button variant="secondary" size="sm">
                    Open Evals
                  </Button>
                </Link>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-[color:var(--text-secondary)] md:grid-cols-3">
                <div>datasets: {evalOverviewQuery.data?.datasetCount ?? 0}</div>
                <div>failed runs: {evalOverviewQuery.data?.failedRunCount ?? 0}</div>
                <div>fallback traces: {evalOverviewQuery.data?.fallbackTraceCount ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 text-sm leading-7 text-[color:var(--text-secondary)]">
            This control plane is now aligned with the shared contract layer. The migrated compatibility surface covers
            config, characters, social, chat, moments, feed, and world context. Scheduler parity now has a live
            Rust execution slice with runtime stats and manual triggers wired into this dashboard. Narrative arcs and AI
            behavior logs are now also tracked in the new runtime for migration parity.
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Character Surface</SectionHeading>
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
                    : "Character CRUD compatibility routes are online once the new Core API process is running."
                }
              />
            )}
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>Moments Surface</SectionHeading>
            <div className="mt-4 text-sm text-[color:var(--text-secondary)]">
              total posts: {momentsQuery.data?.length ?? 0}
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
                        {moment.likeCount} likes / {moment.commentCount} comments
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
                      : "Moments compatibility routes are online once the new Core API process is running."
                  }
                />
              )}
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>Feed Surface</SectionHeading>
            <div className="mt-4 text-sm text-[color:var(--text-secondary)]">
              total posts: {feedQuery.data?.total ?? 0}
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
                        {post.likeCount} likes / {post.commentCount} comments
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
                      : "Feed compatibility routes are online once the new Core API process is running."
                  }
                />
              )}
            </div>
          </Card>
        </div>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Scheduler Surface</SectionHeading>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricCard label="Mode" value={schedulerQuery.data?.mode ?? "pending"} />
            <MetricCard
              label="World Snapshots"
              value={schedulerQuery.data?.worldSnapshots ?? statusQuery.data?.scheduler.worldSnapshots ?? 0}
            />
            <MetricCard label="Recent Runs" value={schedulerQuery.data?.recentRuns.length ?? 0} />
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
                      {job.running ? "running" : job.enabled ? "enabled" : "disabled"}
                    </StatusPill>
                    <button
                      className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      disabled={!job.enabled || job.running || schedulerRunMutation.isPending}
                      onClick={() => schedulerRunMutation.mutate(job.id)}
                    >
                      {runningSchedulerJobId === job.id ? "Running..." : "Run now"}
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
                        runs: {job.runCount}
                      </div>
                      <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2">
                        duration: {job.lastDurationMs ? `${job.lastDurationMs} ms` : "not yet run"}
                      </div>
                      <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2">
                        last run: {job.lastRunAt ?? "not yet run"}
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--text-secondary)]">
                      {job.lastResult ?? "No execution result recorded yet."}
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
                    : "Scheduler run failed."
                }
              />
            )}
            {!schedulerQuery.data && schedulerQuery.error instanceof Error && (
              <ErrorBlock message={schedulerQuery.error.message} />
            )}
            {!schedulerQuery.data && !schedulerQuery.error && (
              <PanelEmpty className="border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]" message="Waiting for scheduler parity data." />
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Recent scheduler runs</div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
              {schedulerQuery.data?.recentRuns.map((event) => (
                <ListItemCard key={event} className="py-3" title={event} />
              ))}
              {schedulerQuery.data && schedulerQuery.data.recentRuns.length === 0 && (
                <div>No scheduler jobs have been executed yet.</div>
              )}
            </div>
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Realtime Contract</SectionHeading>
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 text-sm text-[color:var(--text-secondary)]">
            namespace: {CHAT_NAMESPACE}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <MetricCard label="Connected Clients" value={realtimeQuery.data?.connectedClients ?? 0} />
            <MetricCard label="Active Rooms" value={realtimeQuery.data?.activeRooms ?? 0} />
          </div>
          <div className="mt-4 grid gap-3">
            {Object.values(CHAT_EVENTS).map((eventName) => (
              <ListItemCard key={eventName} className="py-3" title={eventName} />
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 text-sm text-[color:var(--text-secondary)]">
            socket path: {realtimeQuery.data?.socketPath ?? "/socket.io"}
          </div>
          <div className="mt-4 grid gap-3">
            {realtimeQuery.data?.rooms.map((room) => (
              <ListItemCard
                key={room.roomId}
                className="py-3"
                title={room.roomId}
                body={<div>subscribers: {room.subscriberCount}</div>}
              />
            ))}
            {realtimeQuery.data && realtimeQuery.data.rooms.length === 0 && (
              <PanelEmpty className="border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]" message="No active realtime rooms yet." />
            )}
            {!realtimeQuery.data && realtimeQuery.error instanceof Error && (
              <ErrorBlock message={realtimeQuery.error.message} />
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Recent realtime events</div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
              {realtimeQuery.data?.recentEvents.map((event) => (
                <ListItemCard key={event} className="py-3" title={event} />
              ))}
              {realtimeQuery.data && realtimeQuery.data.recentEvents.length === 0 && <div>No realtime events yet.</div>}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Provider Runtime</SectionHeading>
          <InlineNotice className="mt-4" tone={providerConfigured ? "success" : "warning"}>
            {providerConfigQuery.isLoading
              ? "Loading saved provider configuration..."
              : providerConfigQuery.isError && providerConfigQuery.error instanceof Error
                ? providerConfigQuery.error.message
                : providerConfigured
                  ? "当前 provider 已配置，编辑、探测和保存入口已统一收敛到 Setup 页面。"
                  : "当前尚未配置 provider。进入 Setup 页面可完成首轮配置并测试连通性。"}
          </InlineNotice>

          <div className="mt-4 grid gap-3">
            <MetricCard
              label="Active Provider"
              value={providerConfigQuery.data?.model ?? statusQuery.data?.inferenceGateway.activeProvider ?? "not configured yet"}
            />
            <MetricCard label="Last Success" value={statusQuery.data?.inferenceGateway.lastSuccessAt ?? "none yet"} />
            <MetricCard label="Last Error" value={statusQuery.data?.inferenceGateway.lastError ?? "none"} />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/setup">
              <Button variant="primary" size="lg" className="rounded-2xl">
                Open Provider Setup
              </Button>
            </Link>
            <Link to="/evals">
              <Button variant="secondary" size="lg" className="rounded-2xl">
                Run Evals
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Inference Preview</SectionHeading>
          <form
            className="mt-4 space-y-4"
            onSubmit={previewForm.handleSubmit((values) => previewMutation.mutate(values))}
          >
            <label className="block text-sm text-[color:var(--text-secondary)]">
              System Prompt
              <TextAreaField className="mt-2 min-h-24" {...previewForm.register("systemPrompt")} />
            </label>
            <label className="block text-sm text-[color:var(--text-secondary)]">
              User Prompt
              <TextAreaField className="mt-2 min-h-32" {...previewForm.register("prompt")} />
            </label>
            <Button className="w-full rounded-2xl bg-[linear-gradient(135deg,#22c55e,#86efac)] text-slate-950" type="submit" disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "Running preview..." : "Run Inference Preview"}
            </Button>
          </form>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Result</div>
              <div className="mt-2 whitespace-pre-wrap text-[color:var(--text-primary)]">
                {previewMutation.data
                  ? previewMutation.data.output ?? previewMutation.data.error ?? "No preview output returned."
                  : previewMutation.isError && previewMutation.error instanceof Error
                    ? previewMutation.error.message
                    : "Run a preview prompt against the active provider profile."}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Model"
                value={previewMutation.data?.model ?? statusQuery.data?.inferenceGateway.activeProvider ?? "pending"}
              />
              <MetricCard label="Finish" value={previewMutation.data?.finishReason ?? "pending"} />
              <MetricCard label="Tokens" value={previewMutation.data?.usage?.totalTokens ?? 0} />
            </div>
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Operations</SectionHeading>
          <div className="mt-4 grid gap-3">
            <Button variant="secondary" size="lg" className="justify-start rounded-2xl" disabled={operationsBusy} onClick={() => exportDiagnosticsMutation.mutate()}>
              {exportDiagnosticsMutation.isPending ? "Exporting diagnostics..." : "Export diagnostics bundle"}
            </Button>
            <Button variant="secondary" size="lg" className="justify-start rounded-2xl" disabled={operationsBusy} onClick={() => createBackupMutation.mutate()}>
              {createBackupMutation.isPending ? "Creating backup..." : "Create local backup"}
            </Button>
            <Button variant="secondary" size="lg" className="justify-start rounded-2xl" disabled={operationsBusy} onClick={() => restoreBackupMutation.mutate()}>
              {restoreBackupMutation.isPending ? "Restoring backup..." : "Restore backup"}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {operationsBusy ? (
              <InlineNotice tone="info">
                Operation in progress. Other maintenance actions are temporarily locked.
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
                System operations are now wired through the typed contract layer and ready for the real runtime implementation.
              </InlineNotice>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Log Index</div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
              {logsQuery.data?.map((logPath) => (
                <ListItemCard key={logPath} className="py-3" title={logPath} />
              ))}
              {logsQuery.isLoading ? <LoadingBlock className="px-0 py-0 text-left text-sm bg-transparent border-0 shadow-none" label="Loading local runtime logs..." /> : null}
              {!logsQuery.data && logsQuery.error instanceof Error ? <ErrorBlock message={logsQuery.error.message} /> : null}
              {!logsQuery.isLoading && !logsQuery.data && !logsQuery.error ? (
                <PanelEmpty className="border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]" message="Waiting for local runtime logs." />
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
    ? `missing=${values.linuxMissingPackages.join(", ")}`
    : "linux deps ok";
  const sidecarStatus = formatCommandSource(values.coreApiCommandSource, values.bundledCoreApiExists);
  const failureStatus =
    values.diagnosticsStatus === "port-occupied"
      ? "port occupied"
      : values.diagnosticsStatus === "bundled-sidecar-missing"
        ? "bundled sidecar missing"
        : values.diagnosticsStatus === "spawn-failed"
          ? "spawn failed"
          : values.diagnosticsStatus === "health-probe-failed"
            ? "health probe failed"
            : values.diagnosticsStatus ?? "unknown";
  const managedStatus = values.managedByDesktopShell
    ? `managed${values.managedChildPid ? ` pid=${values.managedChildPid}` : ""}`
    : "unmanaged";
  const logPath = values.desktopLogPath ? ` · log=${values.desktopLogPath}` : "";
  const lastError = values.lastCoreApiError ? ` · last-error=${values.lastCoreApiError}` : "";

  return `${values.platform} · ${values.summary} · ${values.coreApiCommandResolved ? "command ok" : "command missing"} · ${sidecarStatus} · ${failureStatus} · ${managedStatus} · ${packageStatus}${values.coreApiPortOccupied ? " · port-in-use" : ""}${logPath}${lastError}`;
}

function formatCommandSource(source?: string, bundledExists?: boolean) {
  if (source === "bundled" || source === "bundled-sidecar") {
    return "bundled sidecar";
  }
  if (source === "env" || source === "env-override") {
    return "env override";
  }
  if (source === "path" || source === "path-lookup") {
    return bundledExists ? "path lookup (bundled missing)" : "path lookup";
  }

  return bundledExists ? "sidecar ready" : "sidecar missing";
}
