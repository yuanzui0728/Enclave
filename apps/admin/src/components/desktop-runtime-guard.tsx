import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useDesktopRuntime } from "@yinjie/ui";

export function DesktopRuntimeGuard() {
  const attemptedAutostartRef = useRef(false);
  const {
    desktopAvailable,
    desktopStatusQuery,
    probeMutation,
    runtimeContextQuery,
    runtimeDiagnosticsQuery,
    startMutation,
  } = useDesktopRuntime({
    queryKeyPrefix: "admin-desktop",
    statusRefetchInterval: 3_000,
    invalidateOnAction: [["admin-system-status"]],
  });

  useEffect(() => {
    if (!desktopAvailable) {
      return;
    }

    const status = desktopStatusQuery.data;
    if (!status || status.reachable || startMutation.isPending || attemptedAutostartRef.current) {
      return;
    }

    attemptedAutostartRef.current = true;
    startMutation.mutate();
  }, [desktopAvailable, desktopStatusQuery.data, startMutation]);

  if (!desktopAvailable) {
    return null;
  }

  const status = desktopStatusQuery.data;
  const shouldBlock = !status || !status.reachable;
  const busy = startMutation.isPending || probeMutation.isPending;
  const errorMessage =
    (startMutation.error instanceof Error && startMutation.error.message) ||
    (probeMutation.error instanceof Error && probeMutation.error.message) ||
    null;

  if (!shouldBlock) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[linear-gradient(180deg,rgba(6,9,16,0.96),rgba(9,12,20,0.98))] px-6">
      <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]">
        <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--brand-secondary)]">Desktop Boot</div>
        <div className="mt-4 text-3xl font-semibold text-white">Local Control Plane Is Waiting For Core API</div>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-secondary)]">
          The desktop shell is checking whether the local Rust runtime is reachable. If it is not ready yet, the shell will try to launch it automatically before this admin surface continues.
        </p>

        <div className="mt-5 grid gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
            状态：{startMutation.isPending ? "正在启动 Core API..." : status?.message ?? "等待桌面状态..."}
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
            地址：{status?.baseUrl ?? runtimeContextQuery.data?.coreApiBaseUrl ?? "loading"}
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
            目录：{runtimeContextQuery.data?.runtimeDataDir ?? "loading"}
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
            诊断：{runtimeDiagnosticsQuery.data ? formatDesktopDiagnostics(runtimeDiagnosticsQuery.data) : "正在读取桌面诊断..."}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => startMutation.mutate()}
            disabled={busy}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
          >
            {startMutation.isPending ? "启动中..." : "再试一次"}
          </button>
          <button
            type="button"
            onClick={() => probeMutation.mutate()}
            disabled={busy}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {probeMutation.isPending ? "探活中..." : "探活"}
          </button>
          <Link
            to="/setup"
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
          >
            打开 Setup
          </Link>
        </div>

        <div className="mt-4 text-xs leading-6 text-[color:var(--text-muted)]">
          {probeMutation.data?.message ??
            startMutation.data?.message ??
            "如果长时间没有恢复，检查桌面环境中是否存在可执行的 yinjie-core-api 或设置了 YINJIE_CORE_API_CMD。"}
        </div>
        {errorMessage ? <div className="mt-3 text-sm text-[#fda4af]">{errorMessage}</div> : null}
      </div>
    </div>
  );
}

function formatDesktopDiagnostics(values: {
  platform: string;
  coreApiCommandResolved: boolean;
  linuxMissingPackages: string[];
  summary: string;
}) {
  const packageStatus = values.linuxMissingPackages.length
    ? `missing=${values.linuxMissingPackages.join(", ")}`
    : "linux deps ok";

  return `${values.platform} · ${values.summary} · ${values.coreApiCommandResolved ? "command ok" : "command missing"} · ${packageStatus}`;
}
