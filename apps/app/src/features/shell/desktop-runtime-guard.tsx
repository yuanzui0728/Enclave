import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { getSystemStatus } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, useDesktopRuntime } from "@yinjie/ui";
import { requiresRemoteServiceConfiguration } from "../../lib/runtime-config";
import { resolveAppRuntimeContext } from "../../runtime/platform";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";

const REMOTE_GUARD_FAILURE_THRESHOLD = 2;

export function DesktopRuntimeGuard() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const runtimeContext = resolveAppRuntimeContext(runtimeConfig.appPlatform);
  const isMobileRuntime = runtimeContext.channel === "mobile";
  const hasDesktopRuntimeControl = runtimeContext.hostRole === "host";
  const needsRemoteConfiguration =
    runtimeContext.deploymentMode === "remote-connected" &&
    requiresRemoteServiceConfiguration();
  const onEntryRoute =
    pathname === "/setup" ||
    pathname === "/onboarding" ||
    pathname === "/welcome";
  const attemptedAutostartRef = useRef(false);
  const [remoteProbeState, setRemoteProbeState] = useState({
    hasSuccessfulProbe: false,
    consecutiveFailures: 0,
  });
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
    queryKey: ["app-availability", runtimeConfig.apiBaseUrl ?? "__default__"],
    queryFn: () => getSystemStatus(runtimeConfig.apiBaseUrl),
    enabled:
      !isMobileRuntime &&
      !hasDesktopRuntimeControl &&
      !needsRemoteConfiguration,
    retry: false,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (!hasDesktopRuntimeControl || !desktopAvailable) {
      return;
    }

    const status = desktopStatusQuery.data;
    if (
      !status ||
      status.reachable ||
      startMutation.isPending ||
      attemptedAutostartRef.current
    ) {
      return;
    }

    attemptedAutostartRef.current = true;
    startMutation.mutate();
  }, [
    desktopAvailable,
    desktopStatusQuery.data,
    hasDesktopRuntimeControl,
    startMutation,
  ]);

  useEffect(() => {
    setRemoteProbeState({
      hasSuccessfulProbe: false,
      consecutiveFailures: 0,
    });
  }, [runtimeConfig.apiBaseUrl]);

  useEffect(() => {
    if (hasDesktopRuntimeControl || needsRemoteConfiguration) {
      return;
    }

    if (
      remoteStatusQuery.errorUpdatedAt > remoteStatusQuery.dataUpdatedAt &&
      remoteStatusQuery.error instanceof Error
    ) {
      setRemoteProbeState((current) => ({
        hasSuccessfulProbe: current.hasSuccessfulProbe,
        consecutiveFailures: current.consecutiveFailures + 1,
      }));
      return;
    }

    if (remoteStatusQuery.dataUpdatedAt > 0) {
      setRemoteProbeState((current) => {
        if (current.hasSuccessfulProbe && current.consecutiveFailures === 0) {
          return current;
        }

        return {
          hasSuccessfulProbe: true,
          consecutiveFailures: 0,
        };
      });
    }
  }, [
    hasDesktopRuntimeControl,
    needsRemoteConfiguration,
    remoteStatusQuery.dataUpdatedAt,
    remoteStatusQuery.error,
    remoteStatusQuery.errorUpdatedAt,
  ]);

  if (isMobileRuntime) {
    return null;
  }

  if (hasDesktopRuntimeControl && !desktopAvailable) {
    return null;
  }

  if (
    !hasDesktopRuntimeControl &&
    onEntryRoute &&
    runtimeContext.capabilities.canConfigureRemoteService
  ) {
    return null;
  }

  const desktopUnavailable =
    hasDesktopRuntimeControl &&
    (!desktopStatusQuery.data || !desktopStatusQuery.data.reachable);
  const remoteProbeUnavailable =
    remoteStatusQuery.error instanceof Error &&
    (!remoteProbeState.hasSuccessfulProbe ||
      remoteProbeState.consecutiveFailures >= REMOTE_GUARD_FAILURE_THRESHOLD);
  const remoteCoreApiHealthy = remoteStatusQuery.data?.coreApi?.healthy;
  const remoteStatusMalformed =
    Boolean(remoteStatusQuery.data) && remoteCoreApiHealthy !== true;
  const remoteUnavailable =
    !hasDesktopRuntimeControl &&
    (needsRemoteConfiguration ||
      remoteProbeUnavailable ||
      remoteCoreApiHealthy === false ||
      remoteStatusMalformed);

  if (!desktopUnavailable && !remoteUnavailable) {
    return null;
  }

  const busy = hasDesktopRuntimeControl
    ? startMutation.isPending || probeMutation.isPending
    : remoteStatusQuery.isFetching;
  const diagnostics = runtimeDiagnosticsQuery.data;
  const title = hasDesktopRuntimeControl
    ? t(msg`隐界正在醒来`)
    : t(msg`暂时无法进入隐界`);

  const desktopDescription =
    diagnostics?.bundledCoreApiExists === false
      ? t(msg`当前桌面包里没有找到内置 Core API，宿主端还没法完整启动。`)
      : diagnostics?.coreApiPortOccupied
        ? t(msg`本地端口似乎已经被占用，桌面壳正在尝试重新接管入口。`)
        : diagnostics?.lastCoreApiError?.trim()
          ? diagnostics.lastCoreApiError
          : t(msg`我们正在为你整理入口，稍等片刻后再试一次就好。`);
  const description = hasDesktopRuntimeControl
    ? desktopDescription
    : needsRemoteConfiguration
      ? t(msg`当前设备还没有配置远程世界地址，请先回到 setup 连接你的实例。`)
      : t(msg`服务器暂时不可用，请稍后再试。`);
  const helperText = hasDesktopRuntimeControl
    ? diagnostics?.summary || t(msg`隐界会继续在后台恢复，你只需要稍候片刻。`)
    : t(msg`如果长时间没有恢复，稍后重新打开应用即可。`);
  const busyHelperText = hasDesktopRuntimeControl
    ? t(msg`正在唤醒隐界...`)
    : t(msg`正在重新检查入口...`);
  const bundledCoreApiStatusLabel = diagnostics?.bundledCoreApiExists
    ? t(msg`已找到`)
    : t(msg`未找到`);
  const portOccupiedLabel = diagnostics?.coreApiPortOccupied
    ? t(msg`是`)
    : t(msg`否`);

  function retry() {
    if (hasDesktopRuntimeControl) {
      attemptedAutostartRef.current = false;
      startMutation.mutate();
      return;
    }

    if (needsRemoteConfiguration) {
      void navigate({ to: "/welcome", replace: true });
      return;
    }

    void remoteStatusQuery.refetch();
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[linear-gradient(180deg,rgba(7,10,18,0.96),rgba(9,13,21,0.98))] px-6">
      <div className="w-full max-w-md rounded-[32px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-6 text-[color:var(--text-primary)] shadow-[var(--shadow-shell)] backdrop-blur-xl">
        <div className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--brand-secondary)]">
          {t(msg`请稍候`)}
        </div>
        <h2 className="mt-4 text-2xl font-semibold">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          {description}
        </p>

        <div className="mt-5 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
          {busy ? busyHelperText : helperText}
        </div>

        {hasDesktopRuntimeControl && diagnostics ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-xs leading-6 text-[color:var(--text-secondary)]">
            <div>{t(msg`命令来源：${diagnostics.coreApiCommandSource}`)}</div>
            <div>{t(msg`内置 Core API：${bundledCoreApiStatusLabel}`)}</div>
            <div>{t(msg`端口占用：${portOccupiedLabel}`)}</div>
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
            {busy ? t(msg`请稍候...`) : t(msg`再试一次`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
