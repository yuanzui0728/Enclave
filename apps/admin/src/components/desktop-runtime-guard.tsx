import { Link } from "@tanstack/react-router";
import { useDesktopRuntime } from "@yinjie/ui";

export function DesktopRuntimeGuard() {
  const {
    desktopAvailable,
    desktopStatusQuery,
    probeMutation,
    runtimeContextQuery,
    runtimeDiagnosticsQuery,
  } = useDesktopRuntime({
    queryKeyPrefix: "admin-desktop",
    statusRefetchInterval: 3_000,
    invalidateOnAction: [["admin-system-status"]],
  });

  if (!desktopAvailable) {
    return null;
  }

  const status = desktopStatusQuery.data;
  const shouldBlock = !status || !status.reachable;
  const busy = probeMutation.isPending || desktopStatusQuery.isFetching;
  const errorMessage =
    (probeMutation.error instanceof Error && probeMutation.error.message) ||
    (desktopStatusQuery.error instanceof Error &&
      desktopStatusQuery.error.message) ||
    null;

  if (!shouldBlock) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[linear-gradient(180deg,rgba(6,9,16,0.96),rgba(9,12,20,0.98))] px-6">
      <div className="w-full max-w-xl rounded-[32px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]">
        <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--brand-secondary)]">桌面远程连接</div>
        <div className="mt-4 text-3xl font-semibold text-[color:var(--text-primary)]">管理后台正在等待远程核心接口</div>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-secondary)]">
          桌面壳只负责连接远程世界实例。请确认设置页里的服务器地址可访问，或通过环境变量提供桌面壳探活地址。
        </p>

        <div className="mt-5 grid gap-3">
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
            状态：{probeMutation.isPending ? "正在重新检查远程接口..." : status?.message ?? "等待桌面状态..."}
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
            地址：{status?.baseUrl ?? runtimeContextQuery.data?.coreApiBaseUrl ?? "加载中"}
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
            目录：{runtimeContextQuery.data?.runtimeDataDir ?? "加载中"}
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
            诊断：{runtimeDiagnosticsQuery.data ? formatDesktopDiagnostics(runtimeDiagnosticsQuery.data) : "正在读取桌面诊断..."}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => probeMutation.mutate()}
            disabled={busy}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
          >
            {probeMutation.isPending ? "检查中..." : "重新检查"}
          </button>
          <button
            type="button"
            onClick={() => probeMutation.mutate()}
            disabled={busy}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] disabled:opacity-60"
          >
            {probeMutation.isPending ? "探活中..." : "探活"}
          </button>
          <Link
            to="/setup"
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          >
            打开设置页
          </Link>
        </div>

        <div className="mt-4 text-xs leading-6 text-[color:var(--text-muted)]">
          {probeMutation.data?.message ??
            "如果长时间没有恢复，先检查远程 API 地址、反向代理 /health、网络连通性和桌面运行时配置。"}
        </div>
        {errorMessage ? <div className="mt-3 text-sm text-[#fda4af]">{errorMessage}</div> : null}
      </div>
    </div>
  );
}

function formatDesktopDiagnostics(values: {
  platform: string;
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
  const remoteMode =
    values.coreApiCommandSource === "remote" ||
    values.diagnosticsStatus?.startsWith("remote-");
  const logPath = values.desktopLogPath ? ` · 日志=${values.desktopLogPath}` : "";
  const lastError = values.lastCoreApiError ? ` · 最近错误=${values.lastCoreApiError}` : "";

  if (remoteMode) {
    return `${values.platform} · ${values.summary}${logPath}${lastError}`;
  }

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

  return `${values.platform} · ${values.summary} · ${values.coreApiCommandResolved ? "命令正常" : "命令缺失"} · ${sidecarStatus} · ${failureStatus} · ${managedStatus} · ${packageStatus}${values.coreApiPortOccupied ? " · 端口占用中" : ""}${logPath}${lastError}`;
}

function formatCommandSource(source?: string, bundledExists?: boolean) {
  if (source === "remote") {
    return "远程连接";
  }
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
