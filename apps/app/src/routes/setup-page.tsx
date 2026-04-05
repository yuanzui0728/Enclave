import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { getSystemStatus } from "@yinjie/contracts";
import {
  Button,
  InlineNotice,
  DesktopRuntimeActions,
  ProviderSetupForm,
  SetupScaffold,
  SetupStatusCard,
  SetupStepList,
  useDesktopRuntime,
  useProviderSetup,
} from "@yinjie/ui";
import { useSessionStore } from "../store/session-store";

export function SetupPage() {
  const navigate = useNavigate();
  const completeDesktopSetup = useSessionStore((state) => state.completeDesktopSetup);
  const {
    desktopAvailable,
    desktopStatusQuery,
    probeMutation,
    restartMutation,
    runtimeContextQuery,
    runtimeDiagnosticsQuery,
    startMutation,
    stopMutation,
  } = useDesktopRuntime({
    queryKeyPrefix: "setup-desktop",
    invalidateOnAction: [["setup-system-status"]],
  });

  const systemStatusQuery = useQuery({
    queryKey: ["setup-system-status"],
    queryFn: () => getSystemStatus(),
    enabled: !desktopAvailable,
    retry: false,
  });

  const desktopCoreApiReachable = Boolean(desktopStatusQuery.data?.reachable);
  const coreApiReady = desktopAvailable
    ? desktopCoreApiReachable
    : Boolean(systemStatusQuery.data?.coreApi.healthy);

  const {
    availableModelsQuery,
    providerDraft,
    providerProbeMutation,
    providerQuery,
    providerReady,
    providerSaveMutation,
    providerValidationMessage,
    submitProviderProbe,
    submitProviderSave,
    updateProviderDraft,
  } = useProviderSetup({
    enabled: !desktopAvailable || coreApiReady,
    queryKeyPrefix: "setup",
    invalidateOnSave: [["setup-system-status"]],
  });
  const runtimeDataReady = desktopAvailable ? Boolean(runtimeContextQuery.data?.runtimeDataDir) : true;
  const setupSteps = [
    {
      label: "本地 Core API",
      ok: coreApiReady,
      hint: coreApiReady ? "已可达" : "需要先启动或恢复本地服务",
    },
    {
      label: "Runtime Data",
      ok: runtimeDataReady,
      hint: runtimeDataReady ? "运行目录已解析" : "等待桌面壳返回本地运行目录",
    },
    {
      label: "Provider",
      ok: providerReady,
      hint: providerReady ? "已具备真实生成链" : "可选，未配置时会走 fallback 文案",
    },
  ];
  const readyStepCount = setupSteps.filter((step) => step.ok).length;
  const primaryEntryLabel = !coreApiReady ? "先启动 Core API" : providerReady ? "进入隐界" : "继续进入隐界";
  const primaryEntryDescription = !coreApiReady
    ? "Core API 还没准备好，先把本地世界拉起来。"
    : providerReady
      ? "核心运行时和 provider 都已就绪，可以直接进入。"
      : "你也可以现在直接进入；聊天和动态会先使用 fallback 文案。";
  const desktopRuntimeBusy =
    probeMutation.isPending || startMutation.isPending || restartMutation.isPending || stopMutation.isPending;
  const desktopRuntimeError =
    (probeMutation.error instanceof Error && probeMutation.error.message) ||
    (startMutation.error instanceof Error && startMutation.error.message) ||
    (restartMutation.error instanceof Error && restartMutation.error.message) ||
    (stopMutation.error instanceof Error && stopMutation.error.message) ||
    null;
  const providerLoadError =
    (providerQuery.error instanceof Error && providerQuery.error.message) ||
    (availableModelsQuery.error instanceof Error && availableModelsQuery.error.message) ||
    null;
  const providerActionError =
    (providerProbeMutation.error instanceof Error && providerProbeMutation.error.message) ||
    (providerSaveMutation.error instanceof Error && providerSaveMutation.error.message) ||
    null;

  function continueIntoWorld() {
    completeDesktopSetup({ providerConfigured: providerReady });
    void navigate({ to: "/onboarding" });
  }

  return (
    <SetupScaffold
      badge="首次启动"
      title="先确认这个世界能自己运转"
      description="桌面版第一次打开时，先检查本地 Core API、运行目录和当前 provider 配置。准备好之后，再进入隐界。"
      heroAside={
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">进度</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {readyStepCount}/{setupSteps.length}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            {primaryEntryDescription}
          </div>
        </div>
      }
      left={
        <>
          <section className="space-y-3">
            <SetupStepList steps={setupSteps} />
            <SetupStatusCard
              title="Core API"
              value={
                desktopAvailable
                  ? desktopStatusQuery.data?.baseUrl ?? "loading"
                  : systemStatusQuery.data?.coreApi.version ?? "http://127.0.0.1:39091"
              }
              detail={
                desktopAvailable
                  ? desktopStatusQuery.data?.message ?? "桌面壳会托管本地 Core API 进程。"
                  : systemStatusQuery.data?.coreApi.message ?? "浏览器模式下直接探测 Core API。"
              }
              ok={coreApiReady}
            />
            <SetupStatusCard
              title="Provider"
              value={providerQuery.data?.model ?? "未配置"}
              detail={
                providerReady
                  ? `${providerQuery.data?.mode ?? "local-compatible"} · ${providerQuery.data?.endpoint ?? ""}`
                  : coreApiReady
                    ? "当前没有可用 provider 配置时，业务仍会走 fallback 文案。"
                    : "等待 Core API 可达后再读取 provider 配置。"
              }
              ok={providerReady}
            />
            <SetupStatusCard
              title="Runtime Data"
              value={runtimeContextQuery.data?.runtimeDataDir ?? "runtime-data"}
              detail={runtimeContextQuery.data?.databasePath ?? "桌面模式会把 SQLite 和日志落到本地 app data 目录。"}
              ok={runtimeDataReady}
            />
            {desktopAvailable ? (
              <SetupStatusCard
                title="桌面诊断"
                value={runtimeDiagnosticsQuery.data?.platform ?? "desktop"}
                detail={
                  runtimeDiagnosticsQuery.data
                    ? formatDesktopDiagnostics(runtimeDiagnosticsQuery.data)
                    : "正在读取桌面运行时诊断..."
                }
                ok={
                  Boolean(runtimeDiagnosticsQuery.data?.coreApiCommandResolved) &&
                  (runtimeDiagnosticsQuery.data?.linuxMissingPackages.length ?? 0) === 0
                }
              />
            ) : null}
          </section>

          {desktopAvailable ? (
              <DesktopRuntimeActions
                title="桌面运行时操作"
                probeLabel={probeMutation.isPending ? "探活中..." : "探活"}
                startLabel={startMutation.isPending ? "启动中..." : "启动 Core API"}
                restartLabel={restartMutation.isPending ? "重启中..." : "重启 Core API"}
                stopLabel={stopMutation.isPending ? "停止中..." : "停止 Core API"}
                onProbe={() => probeMutation.mutate()}
                onStart={() => startMutation.mutate()}
                onRestart={() => restartMutation.mutate()}
                onStop={() => stopMutation.mutate()}
                busy={desktopRuntimeBusy}
                errorMessage={desktopRuntimeError}
                message={
                  probeMutation.data?.message ??
                  startMutation.data?.message ??
                  restartMutation.data?.message ??
                  stopMutation.data?.message ??
                  desktopStatusQuery.data?.message ??
                  "桌面壳会优先尝试自动拉起 Core API；这里保留手动恢复入口。"
                }
              />
            ) : null}
        </>
      }
      right={
        <>
          <ProviderSetupForm
            title="Provider 配置"
            description="首次启动建议在这里完成最小 provider 设置。没有 provider 时系统仍可运行，但只会使用 fallback 文案。"
            statusLabel={providerReady ? "configured" : "pending"}
            endpointLabel="Endpoint"
            modeLabel="Mode"
            modelLabel="Model"
            apiKeyLabel="API Key"
            endpointPlaceholder="http://127.0.0.1:11434/v1"
            modelPlaceholder="deepseek-chat"
            apiKeyPlaceholder="可选；本地兼容 provider 通常可留空"
            probeLabel="测试 Provider"
            saveLabel="保存配置"
            draft={providerDraft}
            availableModels={availableModelsQuery.data?.models ?? []}
            availableModelsId="setup-available-models"
            disabled={!coreApiReady}
            validationMessage={coreApiReady ? providerValidationMessage : null}
            errorMessage={coreApiReady ? providerLoadError : null}
            actionErrorMessage={coreApiReady ? providerActionError : null}
            footerMessage={
              !coreApiReady
                ? "先让本地 Core API 可达，再测试或保存 provider。"
                : providerLoadError
                  ? "Provider 配置或模型目录读取失败，请先修复本地 Core API / provider 状态。"
                : providerProbeMutation.data
                  ? formatProbeMessage(providerProbeMutation.data)
                  : providerSaveMutation.data
                    ? formatProviderSavedMessage(providerSaveMutation.data)
                    : "Provider 保存后，后续 moments / chat / scheduler 生成链会优先走真实 gateway。"
            }
            onSubmit={submitProviderSave}
            onProbe={submitProviderProbe}
            onChange={updateProviderDraft}
            probePending={providerProbeMutation.isPending}
            savePending={providerSaveMutation.isPending}
          />

          <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-medium text-white">下一步</div>
            <InlineNotice className="mt-3" tone={coreApiReady ? (providerReady ? "success" : "warning") : "info"}>
              {primaryEntryDescription}
            </InlineNotice>
            <div className="mt-4 space-y-3">
              {coreApiReady ? (
                <Button onClick={continueIntoWorld} variant="primary" size="lg" className="w-full rounded-2xl">
                  {primaryEntryLabel}
                </Button>
              ) : (
                <Button onClick={() => startMutation.mutate()} variant="secondary" size="lg" className="w-full rounded-2xl">
                  {primaryEntryLabel}
                </Button>
              )}
              <Link to="/login" className="block">
                <Button variant="secondary" size="lg" className="w-full rounded-2xl">
                  我已有账号
                </Button>
              </Link>
            </div>
          </section>
        </>
      }
    />
  );
}

function formatDesktopDiagnostics(values: {
  coreApiCommand: string;
  coreApiCommandResolved: boolean;
  linuxMissingPackages: string[];
  summary: string;
}) {
  const commandStatus = values.coreApiCommandResolved ? "command ok" : "command missing";
  const packageStatus = values.linuxMissingPackages.length
    ? `missing=${values.linuxMissingPackages.join(", ")}`
    : "linux deps ok";

  return `${values.summary} · ${commandStatus} · ${packageStatus} · ${values.coreApiCommand}`;
}

function formatProviderSavedMessage(values: {
  endpoint: string;
  model: string;
  mode: string;
}) {
  return `已保存 ${values.model} (${values.mode}) @ ${values.endpoint}`;
}

function formatProbeMessage(values: {
  message: string;
  normalizedEndpoint?: string;
  statusCode?: number;
}) {
  if (values.normalizedEndpoint && typeof values.statusCode === "number") {
    return `${values.message} normalized=${values.normalizedEndpoint} status=${values.statusCode}`;
  }

  if (values.normalizedEndpoint) {
    return `${values.message} normalized=${values.normalizedEndpoint}`;
  }

  return values.message;
}
