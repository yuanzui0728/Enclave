import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  CHAT_EVENTS,
  CHAT_NAMESPACE,
  createBackup,
  exportDiagnostics,
  getAiModel,
  getAvailableModels,
  getFeed,
  getLatestWorldContext,
  getMoments,
  getRealtimeStatus,
  getSchedulerStatus,
  getSystemLogs,
  getSystemStatus,
  listCharacters,
  restoreBackup,
  runSchedulerJob,
  testProviderConnection,
} from "@yinjie/contracts";
import { providerConfigSchema, type ProviderConfig } from "@yinjie/config";
import { Card, SectionHeading, StatusPill } from "@yinjie/ui";

export function DashboardPage() {
  const baseUrl = import.meta.env.VITE_CORE_API_BASE_URL;
  const queryClient = useQueryClient();

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

  const form = useForm<ProviderConfig>({
    resolver: zodResolver(providerConfigSchema),
    defaultValues: {
      endpoint: "http://127.0.0.1:11434/v1",
      model: "deepseek-chat",
      mode: "local-compatible",
      apiKey: "",
    },
  });

  const providerMutation = useMutation({
    mutationFn: (values: ProviderConfig) =>
      testProviderConnection(
        {
          endpoint: values.endpoint,
          model: values.model,
          apiKey: values.apiKey,
        },
        baseUrl,
      ),
  });

  const exportDiagnosticsMutation = useMutation({
    mutationFn: () => exportDiagnostics(baseUrl),
  });

  const createBackupMutation = useMutation({
    mutationFn: () => createBackup(baseUrl),
  });

  const restoreBackupMutation = useMutation({
    mutationFn: () => restoreBackup(baseUrl),
  });

  const schedulerRunMutation = useMutation({
    mutationFn: (jobId: string) => runSchedulerJob(jobId, baseUrl),
    onSuccess: async () => {
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

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
      <div className="space-y-6">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>System Overview</SectionHeading>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Core API</div>
              <div className="mt-2 text-2xl font-semibold">{statusQuery.data?.coreApi.version ?? "offline"}</div>
              <div className="mt-3">
                <StatusPill tone={statusQuery.data?.coreApi.healthy ? "healthy" : "warning"}>
                  {statusQuery.isLoading ? "probing" : statusQuery.data?.coreApi.healthy ? "healthy" : "waiting"}
                </StatusPill>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Inference Queue</div>
              <div className="mt-2 text-2xl font-semibold">{statusQuery.data?.inferenceGateway.queueDepth ?? 0}</div>
              <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
                max concurrency: {statusQuery.data?.inferenceGateway.maxConcurrency ?? 0}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Active AI Model</div>
              <div className="mt-2 text-2xl font-semibold">{aiModelQuery.data?.model ?? "pending"}</div>
              <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
                catalog size: {availableModelsQuery.data?.models.length ?? 0}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Characters</div>
              <div className="mt-2 text-2xl font-semibold">
                {charactersQuery.data?.length ?? statusQuery.data?.legacySurface.charactersCount ?? 0}
              </div>
              <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
                migrated modules: {statusQuery.data?.legacySurface.migratedModules.join(", ") ?? "pending"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 md:col-span-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">World Context</div>
              <div className="mt-2 text-2xl font-semibold">{worldContextQuery.data?.localTime ?? "pending"}</div>
              <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
                {worldContextQuery.data?.season
                  ? `season=${worldContextQuery.data.season} / holiday=${worldContextQuery.data.holiday ?? "none"}`
                  : "Latest world snapshot is not available yet."}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-[color:var(--text-secondary)]">
            This control plane is now aligned with the shared contract layer. The migrated compatibility surface covers
            config, auth, characters, social, chat, moments, feed, and world context. Scheduler parity now has a live
            Rust execution slice with runtime stats and manual triggers wired into this dashboard.
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Character Surface</SectionHeading>
          <div className="mt-4 space-y-3">
            {previewCharacters.length > 0 ? (
              previewCharacters.map((character) => (
                <div
                  key={character.id}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]"
                >
                  <div className="font-semibold text-white">{character.name}</div>
                  <div className="mt-1">{character.relationship}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    {character.id}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-[color:var(--text-secondary)]">
                {charactersQuery.error instanceof Error
                  ? charactersQuery.error.message
                  : "Character CRUD compatibility routes are online once the new Core API process is running."}
              </div>
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
                  <div
                    key={moment.id}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white">{moment.authorName}</div>
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                        {moment.likeCount} likes / {moment.commentCount} comments
                      </div>
                    </div>
                    <div className="mt-2 line-clamp-3">{moment.text}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {moment.id}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-[color:var(--text-secondary)]">
                  {momentsQuery.error instanceof Error
                    ? momentsQuery.error.message
                    : "Moments compatibility routes are online once the new Core API process is running."}
                </div>
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
                  <div
                    key={post.id}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white">{post.authorName}</div>
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                        {post.likeCount} likes / {post.commentCount} comments
                      </div>
                    </div>
                    <div className="mt-2 line-clamp-3">{post.text}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {post.id}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-[color:var(--text-secondary)]">
                  {feedQuery.error instanceof Error
                    ? feedQuery.error.message
                    : "Feed compatibility routes are online once the new Core API process is running."}
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Scheduler Surface</SectionHeading>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Mode</div>
              <div className="mt-2 text-lg font-semibold text-white">{schedulerQuery.data?.mode ?? "pending"}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">World Snapshots</div>
              <div className="mt-2 text-lg font-semibold text-white">
                {schedulerQuery.data?.worldSnapshots ?? statusQuery.data?.scheduler.worldSnapshots ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Recent Runs</div>
              <div className="mt-2 text-lg font-semibold text-white">{schedulerQuery.data?.recentRuns.length ?? 0}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {schedulerQuery.data?.jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{job.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {job.id}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusPill tone={job.running ? "warning" : job.enabled ? "healthy" : "warning"}>
                      {job.running ? "running" : job.enabled ? "enabled" : "disabled"}
                    </StatusPill>
                    <button
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      disabled={!job.enabled || job.running || schedulerRunMutation.isPending}
                      onClick={() => schedulerRunMutation.mutate(job.id)}
                    >
                      {runningSchedulerJobId === job.id ? "Running..." : "Run now"}
                    </button>
                  </div>
                </div>

                <div className="mt-2">{job.description}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                  {job.cadence} / {job.nextRunHint}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                    runs: {job.runCount}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                    duration: {job.lastDurationMs ? `${job.lastDurationMs} ms` : "not yet run"}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                    last run: {job.lastRunAt ?? "not yet run"}
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-2 text-sm text-[color:var(--text-secondary)]">
                  {job.lastResult ?? "No execution result recorded yet."}
                </div>
              </div>
            ))}

            {schedulerRunMutation.isSuccess && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {schedulerRunMutation.data.message}
              </div>
            )}
            {schedulerRunMutation.isError && (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {schedulerRunMutation.error instanceof Error
                  ? schedulerRunMutation.error.message
                  : "Scheduler run failed."}
              </div>
            )}
            {!schedulerQuery.data && schedulerQuery.error instanceof Error && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-[color:var(--text-secondary)]">
                {schedulerQuery.error.message}
              </div>
            )}
            {!schedulerQuery.data && !schedulerQuery.error && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-[color:var(--text-secondary)]">
                Waiting for scheduler parity data.
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Recent scheduler runs</div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
              {schedulerQuery.data?.recentRuns.map((event) => (
                <div key={event}>{event}</div>
              ))}
              {schedulerQuery.data && schedulerQuery.data.recentRuns.length === 0 && (
                <div>No scheduler jobs have been executed yet.</div>
              )}
            </div>
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Realtime Contract</SectionHeading>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-[color:var(--text-secondary)]">
            namespace: {CHAT_NAMESPACE}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              connected clients: {realtimeQuery.data?.connectedClients ?? 0}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              active rooms: {realtimeQuery.data?.activeRooms ?? 0}
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {Object.values(CHAT_EVENTS).map((eventName) => (
              <div
                key={eventName}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]"
              >
                {eventName}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-[color:var(--text-secondary)]">
            socket path: {realtimeQuery.data?.socketPath ?? "/socket.io"}
          </div>
          <div className="mt-4 grid gap-3">
            {realtimeQuery.data?.rooms.map((room) => (
              <div
                key={room.roomId}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]"
              >
                <div className="font-semibold text-white">{room.roomId}</div>
                <div className="mt-1">subscribers: {room.subscriberCount}</div>
              </div>
            ))}
            {realtimeQuery.data && realtimeQuery.data.rooms.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-[color:var(--text-secondary)]">
                No active realtime rooms yet.
              </div>
            )}
            {!realtimeQuery.data && realtimeQuery.error instanceof Error && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-[color:var(--text-secondary)]">
                {realtimeQuery.error.message}
              </div>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Recent realtime events</div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
              {realtimeQuery.data?.recentEvents.map((event) => (
                <div key={event}>{event}</div>
              ))}
              {realtimeQuery.data && realtimeQuery.data.recentEvents.length === 0 && <div>No realtime events yet.</div>}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Provider Probe</SectionHeading>
          <form
            className="mt-4 space-y-4"
            onSubmit={form.handleSubmit((values) => providerMutation.mutate(values))}
          >
            <label className="block text-sm text-[color:var(--text-secondary)]">
              Endpoint
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                {...form.register("endpoint")}
              />
            </label>
            <label className="block text-sm text-[color:var(--text-secondary)]">
              Model
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                {...form.register("model")}
              />
            </label>
            <label className="block text-sm text-[color:var(--text-secondary)]">
              API Key
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                type="password"
                {...form.register("apiKey")}
              />
            </label>
            <button
              className="w-full rounded-2xl bg-[linear-gradient(135deg,#f97316,#fbbf24)] px-4 py-3 text-sm font-semibold text-slate-950"
              type="submit"
            >
              Probe Provider
            </button>
          </form>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-[color:var(--text-secondary)]">
            {providerMutation.isPending && "Probing provider endpoint..."}
            {providerMutation.isSuccess && providerMutation.data.message}
            {providerMutation.isError &&
              (providerMutation.error instanceof Error
                ? providerMutation.error.message
                : "Provider probe failed")}
            {!providerMutation.isPending && !providerMutation.isSuccess && !providerMutation.isError
              ? "The inference gateway will normalize cloud and local compatible providers behind one runtime queue."
              : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Operations</SectionHeading>
          <div className="mt-4 grid gap-3">
            <button
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-white transition hover:bg-black/30"
              type="button"
              onClick={() => exportDiagnosticsMutation.mutate()}
            >
              Export diagnostics bundle
            </button>
            <button
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-white transition hover:bg-black/30"
              type="button"
              onClick={() => createBackupMutation.mutate()}
            >
              Create local backup
            </button>
            <button
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-white transition hover:bg-black/30"
              type="button"
              onClick={() => restoreBackupMutation.mutate()}
            >
              Restore backup
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-[color:var(--text-secondary)]">
            {exportDiagnosticsMutation.isSuccess && <div>{exportDiagnosticsMutation.data.message}</div>}
            {createBackupMutation.isSuccess && <div>{createBackupMutation.data.message}</div>}
            {restoreBackupMutation.isSuccess && <div>{restoreBackupMutation.data.message}</div>}
            {exportDiagnosticsMutation.isError && exportDiagnosticsMutation.error instanceof Error && (
              <div>{exportDiagnosticsMutation.error.message}</div>
            )}
            {createBackupMutation.isError && createBackupMutation.error instanceof Error && (
              <div>{createBackupMutation.error.message}</div>
            )}
            {restoreBackupMutation.isError && restoreBackupMutation.error instanceof Error && (
              <div>{restoreBackupMutation.error.message}</div>
            )}
            {!exportDiagnosticsMutation.isSuccess &&
            !createBackupMutation.isSuccess &&
            !restoreBackupMutation.isSuccess &&
            !exportDiagnosticsMutation.isError &&
            !createBackupMutation.isError &&
            !restoreBackupMutation.isError
              ? "System operations are now wired through the typed contract layer and ready for the real runtime implementation."
              : null}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Log Index</div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
              {logsQuery.data?.map((logPath) => (
                <div key={logPath}>{logPath}</div>
              ))}
              {!logsQuery.data && logsQuery.error instanceof Error && <div>{logsQuery.error.message}</div>}
              {!logsQuery.data && !logsQuery.error ? <div>Waiting for local runtime logs.</div> : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
