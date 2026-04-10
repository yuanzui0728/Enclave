import {
  useProviderSetup,
  Button,
  Card,
  ProviderSetupForm,
  SectionHeading,
  SetupStatusCard,
  SetupStepList,
  StatusPill,
} from "@yinjie/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getSystemStatus } from "@yinjie/contracts";
import {
  AdminCallout,
  AdminInfoRows,
  AdminJumpCard,
  AdminPageHero,
  AdminStatusCard,
} from "../components/admin-workbench";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

function formatProviderMode(mode?: string | null) {
  if (mode === "cloud") {
    return "云端模式";
  }

  if (mode === "local-compatible") {
    return "本地兼容";
  }

  return mode ?? "未知";
}

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
  const worldOwnerReady = (systemStatusQuery.data?.worldSurface.ownerCount ?? 0) === 1;
  const schedulerReady = Boolean(systemStatusQuery.data?.scheduler.healthy);
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

  const readinessSummary = coreApiReady && providerReady
    ? "远程接口和推理服务均已就绪，当前实例已经可以进入角色、回复逻辑和评测工作区。"
    : coreApiReady
      ? "远程接口已连通，当前只差推理服务配置。"
      : "先恢复远程世界接口，再继续配置推理服务。";
  const setupFocusRows = [
    {
      label: "远程 API",
      value: `${coreApiReady ? "已连通" : "待恢复"}${systemStatusQuery.data?.coreApi.version ? ` · ${systemStatusQuery.data.coreApi.version}` : ""}`,
    },
    {
      label: "推理服务",
      value: providerReady
        ? `${providerSetup.providerDraft.model || "已配置"} · ${formatProviderMode(providerSetup.providerDraft.mode)}`
        : "待配置",
    },
    {
      label: "世界主人",
      value: worldOwnerReady
        ? "1 个，状态正确"
        : `${systemStatusQuery.data?.worldSurface.ownerCount ?? 0} 个，需要处理`,
    },
    {
      label: "下一步",
      value: !coreApiReady
        ? "先恢复远程 API"
        : !providerReady
          ? "保存并测试推理服务"
          : "进入角色 / 回复逻辑 / 评测工作区",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminPageHero
          eyebrow="运维准备"
          title="先打通实例，再补齐模型。"
          description={readinessSummary}
          actions={
            <>
              <Link to="/">
                <Button variant="secondary" size="lg">返回总览</Button>
              </Link>
              <Link to="/reply-logic">
                <Button variant="secondary" size="lg" disabled={!coreApiReady}>查看回复逻辑</Button>
              </Link>
            </>
          }
          metrics={[
            { label: "远程 API", value: coreApiReady ? "已连通" : "待恢复" },
            { label: "推理服务", value: providerReady ? "已配置" : "待配置" },
            { label: "调度器", value: schedulerReady ? "健康" : "待关注" },
            { label: "世界主人", value: String(systemStatusQuery.data?.worldSurface.ownerCount ?? 0) },
          ]}
        />

        <AdminInfoRows title="当前聚焦" rows={setupFocusRows} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>接入检查</SectionHeading>
            <div className="mt-4">
              <SetupStepList steps={setupSteps} />
            </div>

            {systemStatusQuery.isError && systemStatusQuery.error instanceof Error ? (
              <AdminCallout
                className="mt-4"
                tone="warning"
                title="实例状态读取失败"
                description={systemStatusQuery.error.message}
              />
            ) : null}

            <div className="mt-4 space-y-3">
              <AdminStatusCard
                title="先确认远程 API 可达"
                description="如果接口离线，先检查世界实例地址、反向代理和服务进程。"
                tone={coreApiReady ? "healthy" : "warning"}
                statusLabel={coreApiReady ? "完成" : "待处理"}
              />
              <AdminStatusCard
                title="确认世界主人数量正确"
                description="当前实例必须保持单世界主人语义，数量不为 1 时先处理数据状态。"
                tone={worldOwnerReady ? "healthy" : "warning"}
                statusLabel={worldOwnerReady ? "完成" : "待处理"}
              />
              <AdminStatusCard
                title="保存并测试推理服务"
                description="模型、接口地址和 API Key 都正确后，再进入回复逻辑和评测工作区。"
                tone={providerReady ? "healthy" : "warning"}
                statusLabel={providerReady ? "完成" : "待处理"}
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>实例状态详情</SectionHeading>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <SetupStatusCard
                title="远程 API"
                value={systemStatusQuery.data?.coreApi.version ?? "离线"}
                detail={
                  systemStatusQuery.data?.coreApi.message ??
                  "管理后台连接的是远程世界实例，而不是本地托管核心接口。"
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
                ok={schedulerReady}
              />
              <SetupStatusCard
                title="世界主人"
                value={String(systemStatusQuery.data?.worldSurface.ownerCount ?? 0)}
                detail="健康的单世界实例在运行时应当且仅应暴露一个世界主人。"
                ok={worldOwnerReady}
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>下一步建议</SectionHeading>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <AdminJumpCard
                title="进入角色中心"
                detail="接口和模型就绪后，优先检查角色资料、工厂和运行逻辑。"
                to="/characters"
                disabled={!coreApiReady}
              />
              <AdminJumpCard
                title="进入回复逻辑"
                detail="确认真实回复链路、上下文快照和规则配置。"
                to="/reply-logic"
                disabled={!coreApiReady || !providerReady}
              />
              <AdminJumpCard
                title="进入评测分析"
                detail="用 runs、compare 和 trace 验证配置改动是否生效。"
                to="/evals"
                disabled={!coreApiReady || !providerReady}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <ProviderSetupForm
            className="rounded-[30px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-card)]"
            title="推理服务配置"
            description="当世界主人没有配置个人 API 密钥时，这里保存实例级推理服务配置供当前世界兜底使用；语音转写可额外指定独立网关。"
            statusLabel={providerReady ? "已配置" : "待配置"}
            endpointLabel="接口地址"
            modeLabel="模式"
            modelLabel="模型"
            apiKeyLabel="API 密钥"
            transcriptionSectionTitle="独立语音转写"
            transcriptionSectionDescription="可选。这里单独指定 STT 网关、模型和密钥；留空时回退主推理服务配置。适合聊天走 DeepSeek、语音转写走 OpenAI 兼容网关。"
            transcriptionEndpointLabel="转写接口地址"
            transcriptionModelLabel="转写模型"
            transcriptionApiKeyLabel="转写 API 密钥"
            endpointPlaceholder="https://api.openai.com/v1"
            modelPlaceholder="gpt-4.1-mini"
            apiKeyPlaceholder="输入实例级推理服务 API 密钥"
            transcriptionEndpointPlaceholder="https://api.openai.com/v1"
            transcriptionModelPlaceholder="gpt-4o-mini-transcribe / whisper-1"
            transcriptionApiKeyPlaceholder="留空则复用主推理服务 API 密钥"
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
                    ? `已保存推理服务 ${providerSetup.providerSaveMutation.data.model}（${formatProviderMode(providerSetup.providerSaveMutation.data.mode)}）`
                    : "这里保存的是当前世界的实例级推理服务配置；语音转写也可以单独走另一条兼容网关。"
            }
            onSubmit={providerSetup.submitProviderSave}
            onProbe={providerSetup.submitProviderProbe}
            onChange={providerSetup.updateProviderDraft}
            probePending={providerSetup.providerProbeMutation.isPending}
            savePending={providerSetup.providerSaveMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}
