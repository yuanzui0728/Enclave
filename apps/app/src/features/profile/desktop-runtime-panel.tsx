import { Button, ErrorBlock, InlineNotice, LoadingBlock, SetupStatusCard, useDesktopRuntime } from "@yinjie/ui";

export function DesktopRuntimePanel() {
  const {
    desktopAvailable,
    desktopStatusQuery,
    probeMutation,
    restartMutation,
    runtimeDiagnosticsQuery,
    runtimeContextQuery,
    startMutation,
    stopMutation,
  } = useDesktopRuntime({
    queryKeyPrefix: "profile-desktop-runtime",
    statusRefetchInterval: 3_000,
  });

  if (!desktopAvailable) {
    return null;
  }

  const status = desktopStatusQuery.data;
  const runtimeContext = runtimeContextQuery.data;
  const diagnostics = runtimeDiagnosticsQuery.data;
  const busy =
    probeMutation.isPending ||
    startMutation.isPending ||
    stopMutation.isPending ||
    restartMutation.isPending;

  return (
    <section className="space-y-4">
      <div>
        <div className="text-sm font-medium text-white">桌面运行时</div>
        <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">这部分只在 PC 版出现，用于管理本地世界宿主、诊断和运行状态。</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SetupStatusCard
          title="Core API"
          value={status?.reachable ? "运行中" : status?.running ? "已启动未就绪" : "未运行"}
          detail={status?.message || "桌面壳会在后台尝试维护本地 Core API。"}
          ok={Boolean(status?.reachable)}
        />
        <SetupStatusCard
          title="Runtime Data"
          value={runtimeContext?.runtimeDataDir || "等待读取"}
          detail={runtimeContext?.databasePath || "数据库、日志和快照都落在本地 app data。"}
          ok={Boolean(runtimeContext?.runtimeDataDir)}
        />
        <SetupStatusCard
          title="Diagnostics"
          value={diagnostics?.diagnosticsStatus || "等待诊断"}
          detail={diagnostics?.summary || "这里会反映 sidecar、端口和最近错误状态。"}
          ok={Boolean(diagnostics?.coreApiCommandResolved)}
        />
      </div>

      {desktopStatusQuery.isLoading || runtimeContextQuery.isLoading || runtimeDiagnosticsQuery.isLoading ? (
        <LoadingBlock label="正在读取桌面运行时信息..." />
      ) : null}

      {desktopStatusQuery.isError && desktopStatusQuery.error instanceof Error ? (
        <ErrorBlock message={desktopStatusQuery.error.message} />
      ) : null}

      {runtimeContextQuery.isError && runtimeContextQuery.error instanceof Error ? (
        <ErrorBlock message={runtimeContextQuery.error.message} />
      ) : null}

      {runtimeDiagnosticsQuery.isError && runtimeDiagnosticsQuery.error instanceof Error ? (
        <ErrorBlock message={runtimeDiagnosticsQuery.error.message} />
      ) : null}

      {diagnostics?.lastCoreApiError ? (
        <InlineNotice tone="warning">最近错误：{diagnostics.lastCoreApiError}</InlineNotice>
      ) : null}

      {diagnostics?.coreApiPortOccupied && !status?.reachable ? (
        <InlineNotice tone="warning">本地端口似乎已被占用，桌面壳可能没能接管当前 Core API 进程。</InlineNotice>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => startMutation.mutate()} disabled={busy} variant="primary" size="lg">
          {startMutation.isPending ? "正在启动..." : "启动"}
        </Button>
        <Button onClick={() => stopMutation.mutate()} disabled={busy} variant="secondary" size="lg">
          {stopMutation.isPending ? "正在停止..." : "停止"}
        </Button>
        <Button onClick={() => restartMutation.mutate()} disabled={busy} variant="secondary" size="lg">
          {restartMutation.isPending ? "正在重启..." : "重启"}
        </Button>
        <Button onClick={() => probeMutation.mutate()} disabled={busy} variant="secondary" size="lg">
          {probeMutation.isPending ? "正在探测..." : "探测"}
        </Button>
      </div>

      {runtimeContext ? (
        <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.03))] px-4 py-3 text-sm leading-7 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]">
          <div>App Data：{runtimeContext.appDataDir}</div>
          <div>Runtime：{runtimeContext.runtimeDataDir}</div>
          <div>Core API：{runtimeContext.coreApiBaseUrl}</div>
        </div>
      ) : null}
    </section>
  );
}
