import { useProviderSetup, Button, InlineNotice, ProviderSetupForm, SetupScaffold, SetupStatusCard, SetupStepList } from "@yinjie/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getSystemStatus } from "@yinjie/contracts";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

export function SetupPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();

  const systemStatusQuery = useQuery({
    queryKey: ["admin-setup-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    retry: false,
  });

  const providerSetup = useProviderSetup({
    baseUrl,
    enabled: Boolean(systemStatusQuery.data?.coreApi.healthy),
    queryKeyPrefix: "admin-setup",
    invalidateOnSave: [
      ["admin-setup-system-status", baseUrl],
      ["admin-provider-config", baseUrl],
      ["admin-system-status", baseUrl],
    ],
  });

  const coreApiReady = Boolean(systemStatusQuery.data?.coreApi.healthy);
  const providerReady = providerSetup.providerReady;
  const setupSteps = [
    {
      label: "远程 API",
      ok: coreApiReady,
      hint: coreApiReady ? "世界实例可访问" : "远程世界 API 暂不可访问",
    },
    {
      label: "推理服务",
      ok: providerReady,
      hint: providerReady ? "推理服务已配置" : "先保存推理服务，才能启用真实生成",
    },
    {
      label: "后台就绪",
      ok: coreApiReady && providerReady,
      hint: coreApiReady && providerReady ? "实例运维已就绪" : "请先完成 API 和推理服务配置",
    },
  ];

  const providerLoadError =
    (providerSetup.providerQuery.error instanceof Error && providerSetup.providerQuery.error.message) ||
    (providerSetup.availableModelsQuery.error instanceof Error &&
      providerSetup.availableModelsQuery.error.message) ||
    null;

  const providerActionError =
    (providerSetup.providerProbeMutation.error instanceof Error &&
      providerSetup.providerProbeMutation.error.message) ||
    (providerSetup.providerSaveMutation.error instanceof Error &&
      providerSetup.providerSaveMutation.error.message) ||
    null;

  return (
    <SetupScaffold
      badge="后台设置"
      title="为当前世界实例完成运维准备"
      description="管理后台现在面向单用户世界实例。先确认远程 API 可达，再配置当前世界使用的推理服务。"
      heroAside={<SetupStepList steps={setupSteps} />}
      left={
        <section className="space-y-4 rounded-[30px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]">
          <div className="grid gap-4 md:grid-cols-2">
            <SetupStatusCard
              title="远程 API"
              value={systemStatusQuery.data?.coreApi.version ?? "离线"}
              detail={
                systemStatusQuery.data?.coreApi.message ??
                "管理后台连接的是远程世界实例，而不是本地托管 Core API。"
              }
              ok={coreApiReady}
            />
            <SetupStatusCard
              title="数据库"
              value={systemStatusQuery.data?.database.path ?? "未知"}
              detail={
                systemStatusQuery.data
                  ? `已连接=${systemStatusQuery.data.database.connected} · WAL=${systemStatusQuery.data.database.walEnabled}`
                  : "等待实例状态..."
              }
              ok={Boolean(systemStatusQuery.data?.database.connected)}
            />
            <SetupStatusCard
              title="调度器"
              value={systemStatusQuery.data?.scheduler.mode ?? "未知"}
              detail={
                systemStatusQuery.data
                  ? `${systemStatusQuery.data.scheduler.jobs.length} 个任务 · 快照=${systemStatusQuery.data.scheduler.worldSnapshots}`
                  : "等待调度器状态..."
              }
              ok={Boolean(systemStatusQuery.data?.scheduler.healthy)}
            />
            <SetupStatusCard
              title="世界主人"
              value={String(systemStatusQuery.data?.worldSurface.ownerCount ?? 0)}
              detail="健康的单世界实例在运行时应当且仅应暴露一个世界主人。"
              ok={(systemStatusQuery.data?.worldSurface.ownerCount ?? 0) === 1}
            />
          </div>

          {systemStatusQuery.isError && systemStatusQuery.error instanceof Error ? (
            <InlineNotice tone="warning">{systemStatusQuery.error.message}</InlineNotice>
          ) : null}

          <InlineNotice tone={coreApiReady ? "success" : "warning"}>
            {coreApiReady
              ? providerReady
                ? "远程 API 和推理服务均已就绪。当前世界已经可以运行聊天、广场、朋友圈和调度流程。"
                : "远程 API 已可访问，下一步请完成推理服务配置。"
              : "管理后台暂时还未连接到远程世界 API。"}
          </InlineNotice>
        </section>
      }
      right={
        <ProviderSetupForm
          className="rounded-[30px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]"
          title="推理服务配置"
          description="当世界主人没有配置个人 API Key 时，这里保存实例级推理服务配置供当前世界兜底使用。"
          statusLabel={providerReady ? "已配置" : "待配置"}
          endpointLabel="接口地址"
          modeLabel="模式"
          modelLabel="模型"
          apiKeyLabel="API 密钥"
          endpointPlaceholder="https://api.openai.com/v1"
          modelPlaceholder="gpt-4.1-mini"
          apiKeyPlaceholder="输入实例级推理服务 API Key"
          probeLabel="测试连接"
          saveLabel="保存配置"
          draft={providerSetup.providerDraft}
          availableModels={providerSetup.availableModelsQuery.data?.models ?? []}
          availableModelsId="admin-setup-available-models"
          disabled={!coreApiReady}
          validationMessage={providerSetup.providerValidationMessage}
          errorMessage={providerLoadError}
          actionErrorMessage={providerActionError}
          footerMessage={
            !coreApiReady
              ? "请先连通远程世界 API。"
              : providerSetup.providerProbeMutation.data
                ? providerSetup.providerProbeMutation.data.message
                : providerSetup.providerSaveMutation.data
                  ? `已保存推理服务 ${providerSetup.providerSaveMutation.data.model}（${providerSetup.providerSaveMutation.data.mode}）`
                  : "这里保存的是当前世界的实例级推理服务配置。"
          }
          onSubmit={providerSetup.submitProviderSave}
          onProbe={providerSetup.submitProviderProbe}
          onChange={providerSetup.updateProviderDraft}
          probePending={providerSetup.providerProbeMutation.isPending}
          savePending={providerSetup.providerSaveMutation.isPending}
        />
      }
      footer={
        <section className="flex flex-wrap gap-3">
          <Link to="/">
            <Button variant="secondary">返回总览</Button>
          </Link>
        </section>
      }
      className="px-0 py-0"
    />
  );
}
