import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSystemStatus } from "@yinjie/contracts";
import { Button, useDesktopRuntime } from "@yinjie/ui";
import { requiresRemoteServiceConfiguration } from "../../lib/runtime-config";
import { resolveAppRuntimeContext } from "../../runtime/platform";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";

export function DesktopRuntimeGuard() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const runtimeContext = resolveAppRuntimeContext(runtimeConfig.appPlatform);
  const hasDesktopRuntimeControl = runtimeContext.hostRole === "host";
  const needsRemoteConfiguration = runtimeContext.deploymentMode === "remote-connected" && requiresRemoteServiceConfiguration();
  const onSetupRoute = pathname === "/setup";
  const attemptedAutostartRef = useRef(false);
  const {
    desktopAvailable,
    desktopStatusQuery,
    probeMutation,
    runtimeDiagnosticsQuery,
    startMutation,
  } = useDesktopRuntime({
    queryKeyPrefix: "desktop",
    statusRefetchInterval: 3_000,
  });

  const remoteStatusQuery = useQuery({
    queryKey: ["app-availability", runtimeConfig.apiBaseUrl ?? "default"],
    queryFn: () => getSystemStatus(runtimeConfig.apiBaseUrl),
    enabled: !hasDesktopRuntimeControl && !needsRemoteConfiguration,
    retry: false,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (!hasDesktopRuntimeControl || !desktopAvailable) {
      return;
    }

    const status = desktopStatusQuery.data;
    if (!status || status.reachable || startMutation.isPending || attemptedAutostartRef.current) {
      return;
    }

    attemptedAutostartRef.current = true;
    startMutation.mutate();
  }, [desktopAvailable, desktopStatusQuery.data, hasDesktopRuntimeControl, startMutation]);

  if (hasDesktopRuntimeControl && !desktopAvailable) {
    return null;
  }

  if (!hasDesktopRuntimeControl && needsRemoteConfiguration && onSetupRoute) {
    return null;
  }

  const desktopUnavailable = hasDesktopRuntimeControl && (!desktopStatusQuery.data || !desktopStatusQuery.data.reachable);
  const remoteUnavailable =
    !hasDesktopRuntimeControl &&
    (needsRemoteConfiguration ||
      remoteStatusQuery.error instanceof Error ||
      remoteStatusQuery.data?.coreApi.healthy === false);

  if (!desktopUnavailable && !remoteUnavailable) {
    return null;
  }

  const busy = hasDesktopRuntimeControl
    ? startMutation.isPending || probeMutation.isPending
    : remoteStatusQuery.isFetching;
  const diagnostics = runtimeDiagnosticsQuery.data;
  const title = hasDesktopRuntimeControl ? "隐界正在醒来" : "暂时无法进入隐界";

  const desktopDescription = diagnostics?.bundledCoreApiExists === false
    ? "当前桌面包里没有找到内置 Core API，宿主端还没法完整启动。"
    : diagnostics?.coreApiPortOccupied
      ? "本地端口似乎已被占用，桌面壳正在尝试重新接管入口。"
      : diagnostics?.lastCoreApiError?.trim()
        ? diagnostics.lastCoreApiError
        : "我们正在为你整理入口。稍等片刻，再试一次就好。";
  const description = hasDesktopRuntimeControl
    ? desktopDescription
    : needsRemoteConfiguration
      ? "当前设备还没有配置远程世界地址，请先回到 setup 连接你的实例。"
      : remoteStatusQuery.error instanceof Error
        ? remoteStatusQuery.error.message
        : "连接暂时不可用，请稍后再试。";
  const helperText = hasDesktopRuntimeControl
    ? diagnostics?.summary || "隐界会继续在后台恢复，你只需要稍候片刻。"
    : "如果长时间没有恢复，稍后重新打开应用即可。";

  function retry() {
    if (hasDesktopRuntimeControl) {
      attemptedAutostartRef.current = false;
      startMutation.mutate();
      return;
    }

    if (needsRemoteConfiguration) {
      void navigate({ to: "/setup", replace: true });
      return;
    }

    void remoteStatusQuery.refetch();
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[linear-gradient(180deg,rgba(7,10,18,0.96),rgba(9,13,21,0.98))] px-6">
      <div className="w-full max-w-md rounded-[32px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-6 text-[color:var(--text-primary)] shadow-[var(--shadow-shell)] backdrop-blur-xl">
        <div className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--brand-secondary)]">请稍候</div>
        <h2 className="mt-4 text-2xl font-semibold">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>

        <div className="mt-5 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
          {hasDesktopRuntimeControl && busy ? "正在唤醒隐界..." : busy ? "正在重新检查入口..." : helperText}
        </div>

        {hasDesktopRuntimeControl && diagnostics ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-xs leading-6 text-[color:var(--text-secondary)]">
            <div>命令来源：{diagnostics.coreApiCommandSource}</div>
            <div>内置 Core API：{diagnostics.bundledCoreApiExists ? "已找到" : "未找到"}</div>
            <div>端口占用：{diagnostics.coreApiPortOccupied ? "是" : "否"}</div>
          </div>
        ) : null}

        <div className="mt-5">
          <Button
            onClick={retry}
            disabled={busy}
            variant="primary"
            size="lg"
            className="w-full rounded-2xl"
          >
            {busy ? "请稍候..." : "再试一次"}
          </Button>
        </div>
      </div>
    </div>
  );
}
