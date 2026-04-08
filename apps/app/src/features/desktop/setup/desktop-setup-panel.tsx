import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  ProviderSetupForm,
  SetupScaffold,
  SetupStatusCard,
  SetupStepList,
  useDesktopRuntime,
  useProviderSetup,
} from "@yinjie/ui";

type DesktopSetupPanelProps = {
  token: string | null;
  onContinue: () => void;
};

export function DesktopSetupPanel({ token, onContinue }: DesktopSetupPanelProps) {
  const {
    desktopAvailable,
    desktopStatusQuery,
    probeMutation,
    runtimeContextQuery,
    runtimeDiagnosticsQuery,
    startMutation,
  } = useDesktopRuntime({
    queryKeyPrefix: "app-setup-desktop",
    statusRefetchInterval: 3_000,
    invalidateOnAction: [["app-setup-desktop", "provider-config"]],
  });

  const providerSetup = useProviderSetup({
    baseUrl: desktopStatusQuery.data?.baseUrl,
    enabled: desktopAvailable && Boolean(desktopStatusQuery.data?.reachable),
    queryKeyPrefix: "app-setup-desktop",
  });

  const busy = startMutation.isPending || probeMutation.isPending;
  const status = desktopStatusQuery.data;
  const runtimeContext = runtimeContextQuery.data;
  const diagnostics = runtimeDiagnosticsQuery.data;
  const providerConfigured = providerSetup.providerReady;

  const steps = [
    {
      label: "桌面壳可用",
      hint: desktopAvailable ? "当前运行在桌面壳内。" : "需要从桌面壳进入才能托管本地世界。",
      ok: desktopAvailable,
    },
    {
      label: "Core API 可达",
      hint: status?.reachable
        ? `当前地址：${status.baseUrl}`
        : diagnostics?.lastCoreApiError?.trim() || status?.message || "还没有连上本地 Core API。",
      ok: Boolean(status?.reachable),
    },
    {
      label: "Provider 已配置",
      hint: providerConfigured ? `当前模型：${providerSetup.providerDraft.model}` : "先保存 provider，后续聊天和生成链才会切到真实推理。",
      ok: providerConfigured,
    },
  ];

  return (
    <SetupScaffold
      badge="PC 版入口"
      title="先确认你的世界已经醒来"
      description="桌面版负责托管你的隐界实例。这里会检查本地 Core API、运行时目录和 provider 状态，再继续进入聊天与社交。"
      heroAside={
        <SetupStepList
          steps={steps}
        />
      }
      left={
        <div className="space-y-5">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SetupStatusCard
              title="Core API"
              value={status?.reachable ? "已就绪" : busy ? "正在恢复" : "未就绪"}
              detail={status?.message || "桌面壳会尝试自动拉起本地 Core API。"}
              ok={Boolean(status?.reachable)}
            />
            <SetupStatusCard
              title="Runtime Data"
              value={runtimeContext?.runtimeDataDir || "等待读取"}
              detail={runtimeContext?.databasePath || "桌面壳会在 app data 目录下托管数据库、日志和快照。"}
              ok={Boolean(runtimeContext?.runtimeDataDir)}
            />
            <SetupStatusCard
              title="Diagnostics"
              value={diagnostics?.diagnosticsStatus || "等待诊断"}
              detail={diagnostics?.summary || "这里会汇总 sidecar、端口和最近错误状态。"}
              ok={Boolean(diagnostics?.coreApiReachable && diagnostics?.coreApiCommandResolved)}
            />
          </section>

          {!desktopAvailable ? (
            <InlineNotice tone="warning">当前环境不是桌面壳，桌面宿主功能暂时不可用。</InlineNotice>
          ) : null}

          {desktopStatusQuery.isLoading || runtimeContextQuery.isLoading || runtimeDiagnosticsQuery.isLoading ? (
            <LoadingBlock label="正在读取桌面运行时状态..." />
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

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => startMutation.mutate()}
              disabled={!desktopAvailable || busy}
              variant="primary"
              size="lg"
            >
              {startMutation.isPending ? "正在启动..." : "启动本地 Core API"}
            </Button>
            <Button
              onClick={() => probeMutation.mutate()}
              disabled={!desktopAvailable || busy}
              variant="secondary"
              size="lg"
            >
              {probeMutation.isPending ? "正在检查..." : "重新检查"}
            </Button>
            <Button
              onClick={onContinue}
              disabled={!status?.reachable}
              variant="secondary"
              size="lg"
            >
              {token ? "进入隐界" : "继续进入"}
            </Button>
          </div>
        </div>
      }
      right={
        <div className="space-y-5">
          <ProviderSetupForm
            title="Provider 配置"
            description="桌面版负责维护本地世界的推理入口。这里继续保留 provider 的保存与连通性检查。"
            statusLabel={providerConfigured ? "configured" : "pending"}
            endpointLabel="Endpoint"
            modeLabel="Mode"
            modelLabel="Model"
            apiKeyLabel="API Key"
            apiKeyPlaceholder="输入推理服务的 API Key"
            endpointPlaceholder="https://api.openai.com/v1"
            modelPlaceholder="gpt-4.1-mini"
            probeLabel="测试连接"
            saveLabel="保存 Provider"
            draft={providerSetup.providerDraft}
            availableModels={providerSetup.availableModelsQuery.data?.models ?? []}
            availableModelsId="desktop-setup-provider-models"
            disabled={!desktopAvailable || !status?.reachable}
            validationMessage={providerSetup.providerValidationMessage}
            errorMessage={providerSetup.providerQuery.error instanceof Error ? providerSetup.providerQuery.error.message : null}
            actionErrorMessage={
              providerSetup.providerProbeMutation.error instanceof Error
                ? providerSetup.providerProbeMutation.error.message
                : providerSetup.providerSaveMutation.error instanceof Error
                  ? providerSetup.providerSaveMutation.error.message
                  : null
            }
            footerMessage={
              providerConfigured
                ? "Provider 已配置，后续聊天、朋友圈和主动消息会优先走真实推理。"
                : "当前还没有可用 provider，业务链路会继续回退到占位文案。"
            }
            onSubmit={providerSetup.submitProviderSave}
            onProbe={providerSetup.submitProviderProbe}
            onChange={providerSetup.updateProviderDraft}
            savePending={providerSetup.providerSaveMutation.isPending}
            probePending={providerSetup.providerProbeMutation.isPending}
          />

          {runtimeContext ? (
            <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] p-5 shadow-[var(--shadow-section)]">
              <div className="text-sm font-medium text-white">本地宿主上下文</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                <div>App Data：{runtimeContext.appDataDir}</div>
                <div>Runtime：{runtimeContext.runtimeDataDir}</div>
                <div>Database：{runtimeContext.databasePath}</div>
                <div>Core API：{runtimeContext.coreApiBaseUrl}</div>
              </div>
            </section>
          ) : null}
        </div>
      }
    />
  );
}
