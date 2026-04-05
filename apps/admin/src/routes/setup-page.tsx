import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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

export function SetupPage() {
  const baseUrl = import.meta.env.VITE_CORE_API_BASE_URL;

  const systemStatusQuery = useQuery({
    queryKey: ["admin-setup-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    retry: false,
  });

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
    queryKeyPrefix: "admin-setup-desktop",
    invalidateOnAction: [
      ["admin-setup-system-status", baseUrl],
      ["admin-system-status", baseUrl],
    ],
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
    baseUrl,
    enabled: coreApiReady || !desktopAvailable,
    queryKeyPrefix: "admin-setup",
    invalidateOnSave: [
      ["admin-setup-system-status", baseUrl],
      ["admin-provider-config", baseUrl],
      ["admin-system-status", baseUrl],
    ],
  });
  const runtimeDataReady = desktopAvailable ? Boolean(runtimeContextQuery.data?.runtimeDataDir) : true;
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
  const setupSteps = [
    {
      label: "Core API",
      ok: coreApiReady,
      hint: coreApiReady ? "运行时可达" : "本地服务尚未恢复",
    },
    {
      label: "Runtime Data",
      ok: runtimeDataReady,
      hint: runtimeDataReady ? "目录已解析" : "等待桌面壳返回路径",
    },
    {
      label: "Provider",
      ok: providerReady,
      hint: providerReady ? "真实生成链已可用" : "当前仍会回退到 fallback 文案",
    },
  ];

  return (
    <SetupScaffold
      badge="Runtime Setup"
      title="把本地控制面准备成可运维状态"
      description="这里集中处理桌面运行时恢复、provider 校验和首轮配置，不需要再从 Dashboard 各个卡片里找入口。"
      heroAside={
        <InlineNotice tone={coreApiReady ? (providerReady ? "success" : "warning") : "info"}>
          {coreApiReady
            ? providerReady
              ? "Core API、runtime data 和 provider 都已就绪，可以直接进入评测或回 Dashboard。"
              : "Core API 已恢复，但 provider 还未准备好，当前仍会回退到 fallback 文案。"
            : "先恢复 Core API，再继续配置 provider 和验证推理链。"}
        </InlineNotice>
      }
      left={
        <>
          <section className="rounded-[30px] border border-white/10 bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]">
            <SetupStepList steps={setupSteps} />

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <SetupStatusCard
                title="Core API"
                value={desktopAvailable ? desktopStatusQuery.data?.baseUrl ?? "loading" : systemStatusQuery.data?.coreApi.version ?? "offline"}
                detail={
                  desktopAvailable
                    ? desktopStatusQuery.data?.message ?? "桌面壳会托管本地 Core API。"
                    : systemStatusQuery.data?.coreApi.message ?? "浏览器模式下直接探测 Core API。"
                }
                ok={coreApiReady}
              />
              <SetupStatusCard
                title="Runtime Data"
                value={runtimeContextQuery.data?.runtimeDataDir ?? "runtime-data"}
                detail={runtimeContextQuery.data?.databasePath ?? "桌面模式会把日志、数据库和备份落到本地 app data 目录。"}
                ok={runtimeDataReady}
              />
              {desktopAvailable ? (
                <SetupStatusCard
                  title="Desktop Diagnostics"
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
            </div>

            {desktopAvailable ? (
              <div className="mt-6">
                <DesktopRuntimeActions
                  title="桌面恢复动作"
                  probeLabel={probeMutation.isPending ? "Probing..." : "Probe Core API"}
                  startLabel={startMutation.isPending ? "Starting..." : "Start Core API"}
                  restartLabel={restartMutation.isPending ? "Restarting..." : "Restart Core API"}
                  stopLabel={stopMutation.isPending ? "Stopping..." : "Stop Core API"}
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
                    "桌面环境会优先自动拉起 Core API，这里保留集中恢复入口。"
                  }
                />
              </div>
            ) : null}
          </section>
        </>
      }
      right={
        <ProviderSetupForm
          className="rounded-[30px] border border-white/10 bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]"
          title="Provider 配置"
          description="配好之后，聊天、动态、scheduler 和评测链都会优先走真实 provider。"
          statusLabel={providerReady ? "configured" : "pending"}
          endpointLabel="Endpoint"
          modeLabel="Mode"
          modelLabel="Model"
          apiKeyLabel="API Key"
          endpointPlaceholder="http://127.0.0.1:11434/v1"
          modelPlaceholder="deepseek-chat"
          apiKeyPlaceholder="可选；本地兼容 provider 通常可留空"
          probeLabel="Test Provider"
          saveLabel="Save Provider"
          draft={providerDraft}
          availableModels={availableModelsQuery.data?.models ?? []}
          availableModelsId="admin-setup-available-models"
          disabled={!coreApiReady}
          validationMessage={providerValidationMessage}
          errorMessage={providerLoadError}
          actionErrorMessage={providerActionError}
          footerMessage={
            !coreApiReady
              ? "先恢复 Core API，再测试或保存 provider。"
              : providerLoadError
                ? "Provider 配置或模型目录读取失败，先恢复本地 runtime 再继续。"
              : providerProbeMutation.data
                ? formatProbeMessage(providerProbeMutation.data)
                : providerSaveMutation.data
                  ? formatProviderSavedMessage(providerSaveMutation.data)
                  : "保存后，Dashboard 与主产品页面会自动使用新的 provider 运行状态。"
          }
          onSubmit={submitProviderSave}
          onProbe={submitProviderProbe}
          onChange={updateProviderDraft}
          probePending={providerProbeMutation.isPending}
          savePending={providerSaveMutation.isPending}
        />
      }
      footer={
        <section className="flex flex-wrap gap-3">
          <Link to="/">
            <Button variant="secondary">返回 Dashboard</Button>
          </Link>
          <Link to="/evals">
            <Button variant="secondary">去 Evals 验证</Button>
          </Link>
        </section>
      }
      className="px-0 py-0"
    />
  );
}

function formatProviderSavedMessage(values: {
  endpoint: string;
  model: string;
  mode: string;
}) {
  return `Saved provider ${values.model} (${values.mode}) at ${values.endpoint}.`;
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
