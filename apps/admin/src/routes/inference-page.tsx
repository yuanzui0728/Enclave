import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  InferenceModelCatalogEntry,
  InferenceProviderAccount,
  InferenceProviderAccountDraft,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  MetricCard,
  SectionHeading,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminCallout,
  AdminMetaText,
  AdminPageHero,
  AdminSectionHeader,
  AdminSelectableCard,
  AdminSelectField as SelectField,
  AdminSoftBox,
  AdminTextArea as TextAreaField,
  AdminTextField as Field,
  AdminToggle as Toggle,
  AdminValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";

const emptyDraft: InferenceProviderAccountDraft = {
  name: "",
  endpoint: "https://api.openai.com/v1",
  defaultModelId: "gpt-4.1-mini",
  apiKey: "",
  mode: "cloud",
  apiStyle: "openai-chat-completions",
  transcriptionEndpoint: "",
  transcriptionModel: "",
  transcriptionApiKey: "",
  ttsModel: "gpt-4o-mini-tts",
  ttsVoice: "alloy",
  isEnabled: true,
  notes: "",
};

const PROVIDER_MODE_LABELS: Record<
  NonNullable<InferenceProviderAccountDraft["mode"]>,
  string
> = {
  cloud: "云端模式",
  "local-compatible": "本地兼容",
};

const API_STYLE_LABELS: Record<
  NonNullable<InferenceProviderAccountDraft["apiStyle"]>,
  string
> = {
  "openai-chat-completions": "Chat Completions",
  "openai-responses": "Responses",
};

const MODEL_STATUS_LABELS: Record<
  InferenceModelCatalogEntry["status"],
  string
> = {
  active: "活跃",
  preview: "预览",
  legacy: "旧版",
};

const REGION_LABELS: Record<InferenceModelCatalogEntry["region"], string> = {
  domestic: "国内",
  global: "国际",
};

function toDraft(
  account?: InferenceProviderAccount | null,
): InferenceProviderAccountDraft {
  if (!account) {
    return emptyDraft;
  }

  return {
    id: account.id,
    name: account.name,
    endpoint: account.endpoint,
    defaultModelId: account.defaultModelId,
    apiKey: account.apiKey ?? "",
    mode: account.mode,
    apiStyle: account.apiStyle,
    transcriptionEndpoint: account.transcriptionEndpoint ?? "",
    transcriptionModel: account.transcriptionModel ?? "",
    transcriptionApiKey: account.transcriptionApiKey ?? "",
    ttsModel: account.ttsModel ?? "",
    ttsVoice: account.ttsVoice ?? "",
    isEnabled: account.isEnabled,
    notes: account.notes ?? "",
  };
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getEndpointLabel(endpoint?: string | null) {
  if (!endpoint?.trim()) {
    return "未配置";
  }

  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint.replace(/^https?:\/\//, "");
  }
}

function resolveModelStatusTone(status: InferenceModelCatalogEntry["status"]) {
  if (status === "active") {
    return "healthy" as const;
  }

  if (status === "preview") {
    return "warning" as const;
  }

  return "muted" as const;
}

function resolveCapabilityTags(entry: InferenceModelCatalogEntry) {
  const tags = [
    `${entry.vendor} / ${entry.providerFamily}`,
    REGION_LABELS[entry.region],
  ];
  if (entry.supportsText) {
    tags.push("text");
  }
  if (entry.supportsVision) {
    tags.push("vision");
  }
  if (entry.supportsAudio) {
    tags.push("audio");
  }
  if (entry.supportsReasoning) {
    tags.push("reasoning");
  }
  return tags;
}

export function InferencePage() {
  const queryClient = useQueryClient();
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [providerDraft, setProviderDraft] =
    useState<InferenceProviderAccountDraft>(emptyDraft);
  const [modelSearch, setModelSearch] = useState("");
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

  const overviewQuery = useQuery({
    queryKey: ["admin-inference-overview"],
    queryFn: () => adminApi.getInferenceOverview(),
  });

  const providerAccounts = useMemo(
    () => overviewQuery.data?.providerAccounts ?? [],
    [overviewQuery.data?.providerAccounts],
  );
  const modelCatalog = useMemo(
    () => overviewQuery.data?.modelCatalog ?? [],
    [overviewQuery.data?.modelCatalog],
  );

  useEffect(() => {
    if (!providerAccounts.length) {
      setSelectedProviderId("new");
      return;
    }

    if (!selectedProviderId) {
      setSelectedProviderId(
        providerAccounts.find((item) => item.isDefault)?.id ??
          providerAccounts[0].id,
      );
    }
  }, [providerAccounts, selectedProviderId]);

  useEffect(() => {
    if (selectedProviderId === "new") {
      setProviderDraft(emptyDraft);
      return;
    }

    const selectedAccount =
      providerAccounts.find((item) => item.id === selectedProviderId) ?? null;
    if (selectedAccount) {
      setProviderDraft(toDraft(selectedAccount));
    }
  }, [providerAccounts, selectedProviderId]);

  const selectedAccount = useMemo(
    () =>
      providerAccounts.find((item) => item.id === selectedProviderId) ?? null,
    [providerAccounts, selectedProviderId],
  );
  const defaultProviderAccount = useMemo(
    () => providerAccounts.find((item) => item.isDefault) ?? null,
    [providerAccounts],
  );
  const enabledProviderCount = useMemo(
    () => providerAccounts.filter((item) => item.isEnabled).length,
    [providerAccounts],
  );
  const providerWithApiKeyCount = useMemo(
    () => providerAccounts.filter((item) => item.hasApiKey).length,
    [providerAccounts],
  );
  const selectedModelIdSet = useMemo(
    () => new Set(selectedModelIds),
    [selectedModelIds],
  );
  const selectedRoutingProviderId = useMemo(
    () =>
      selectedProviderId && selectedProviderId !== "new"
        ? selectedProviderId
        : (providerAccounts.find((item) => item.isDefault)?.id ?? ""),
    [providerAccounts, selectedProviderId],
  );
  const selectedRoutingProvider = useMemo(
    () =>
      providerAccounts.find((item) => item.id === selectedRoutingProviderId) ??
      null,
    [providerAccounts, selectedRoutingProviderId],
  );
  const currentDraftHasApiKey = Boolean(
    selectedAccount?.hasApiKey || providerDraft.apiKey?.trim(),
  );
  const currentDraftHasTranscriptionKey = Boolean(
    selectedAccount?.transcriptionHasApiKey ||
    providerDraft.transcriptionApiKey?.trim(),
  );
  const filteredModels = useMemo(() => {
    const normalizedSearch = modelSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return modelCatalog;
    }

    return modelCatalog.filter((entry) =>
      [
        entry.id,
        entry.label,
        entry.vendor,
        entry.providerFamily,
        entry.recommendedRoleName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [modelCatalog, modelSearch]);
  const visibleModelIds = useMemo(
    () => filteredModels.map((entry) => entry.id),
    [filteredModels],
  );
  const selectedVisibleCount = useMemo(
    () =>
      filteredModels.filter((entry) => selectedModelIdSet.has(entry.id)).length,
    [filteredModels, selectedModelIdSet],
  );
  const activeModelCount = useMemo(
    () => modelCatalog.filter((entry) => entry.status === "active").length,
    [modelCatalog],
  );
  const previewModelCount = useMemo(
    () => modelCatalog.filter((entry) => entry.status === "preview").length,
    [modelCatalog],
  );
  const reasoningModelCount = useMemo(
    () => modelCatalog.filter((entry) => entry.supportsReasoning).length,
    [modelCatalog],
  );

  useEffect(() => {
    const knownModelIds = new Set(modelCatalog.map((entry) => entry.id));
    setSelectedModelIds((current) =>
      current.filter((modelId) => knownModelIds.has(modelId)),
    );
  }, [modelCatalog]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (selectedProviderId && selectedProviderId !== "new") {
        return adminApi.updateInferenceProviderAccount(
          selectedProviderId,
          providerDraft,
        );
      }

      return adminApi.createInferenceProviderAccount(providerDraft);
    },
    onSuccess: async (provider) => {
      setSelectedProviderId(provider.id);
      await queryClient.invalidateQueries({
        queryKey: ["admin-inference-overview"],
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => adminApi.testInferenceProvider(providerDraft),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (providerId: string) =>
      adminApi.setDefaultInferenceProviderAccount(providerId),
    onSuccess: async (provider) => {
      setSelectedProviderId(provider.id);
      await queryClient.invalidateQueries({
        queryKey: ["admin-inference-overview"],
      });
    },
  });

  const installMutation = useMutation({
    mutationFn: (forceUpdateExisting: boolean) =>
      adminApi.installModelPersonas({
        providerAccountId:
          selectedProviderId && selectedProviderId !== "new"
            ? selectedProviderId
            : providerAccounts.find((item) => item.isDefault)?.id,
        forceUpdateExisting,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-inference-overview"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud"],
        }),
      ]);
    },
  });

  const installSelectedMutation = useMutation({
    mutationFn: (forceUpdateExisting: boolean) =>
      adminApi.installModelPersonas({
        providerAccountId: selectedRoutingProviderId || undefined,
        modelIds: selectedModelIds,
        forceUpdateExisting,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-inference-overview"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud"],
        }),
      ]);
    },
  });

  const rebindMutation = useMutation({
    mutationFn: () =>
      adminApi.rebindModelPersonas({
        providerAccountId: selectedRoutingProviderId || undefined,
        modelIds: selectedModelIds,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-inference-overview"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud"],
        }),
      ]);
    },
  });

  const canSave = Boolean(
    providerDraft.name?.trim() &&
    providerDraft.endpoint?.trim() &&
    providerDraft.defaultModelId?.trim(),
  );
  const canInstall = Boolean(
    (selectedProviderId && selectedProviderId !== "new") ||
    providerAccounts.some((item) => item.isDefault),
  );
  const canInstallSelected = selectedModelIds.length > 0 && canInstall;
  const canRebindSelected = Boolean(
    selectedModelIds.length > 0 && selectedRoutingProviderId,
  );

  const toggleModelSelection = (modelId: string) => {
    setSelectedModelIds((current) => {
      if (current.includes(modelId)) {
        return current.filter((item) => item !== modelId);
      }
      return [...current, modelId];
    });
  };

  const toggleVisibleModelSelection = () => {
    setSelectedModelIds((current) => {
      const next = new Set(current);
      const allVisibleSelected =
        visibleModelIds.length > 0 &&
        visibleModelIds.every((modelId) => next.has(modelId));
      if (allVisibleSelected) {
        visibleModelIds.forEach((modelId) => next.delete(modelId));
      } else {
        visibleModelIds.forEach((modelId) => next.add(modelId));
      }
      return Array.from(next);
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="模型与路由"
        title="默认路由、Provider 账户与模型人格工作台"
        description="把运营最常用的三类动作收口在一页里：先检查默认路由是否可用，再维护 Provider 接入信息，最后批量安装或换绑模型人格角色。页面优先展示当前路由状态和可执行动作，避免在长表单里反复来回找入口。"
        badges={["默认路由摘要", "多 Provider 管理", "模型人格批量处理"]}
        metrics={[
          {
            label: "Provider 账户",
            value: providerAccounts.length,
          },
          {
            label: "启用中账户",
            value: enabledProviderCount,
          },
          {
            label: "模型目录",
            value: modelCatalog.length,
          },
          {
            label: "已绑定角色",
            value: overviewQuery.data?.roleBindingSummary.boundCharacters ?? 0,
          },
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setSelectedProviderId("new")}
            >
              新建 Provider 账户
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => installMutation.mutate(false)}
              disabled={!canInstall || installMutation.isPending}
            >
              {installMutation.isPending ? "安装中..." : "安装全部模型角色"}
            </Button>
          </>
        }
      />

      {overviewQuery.isLoading ? (
        <LoadingBlock label="正在读取模型路由工作台..." />
      ) : null}
      {overviewQuery.isError && overviewQuery.error instanceof Error ? (
        <ErrorBlock message={overviewQuery.error.message} />
      ) : null}

      {saveMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title="Provider 账户已保存"
          description="多模型路由配置已落库，默认链路会自动同步旧版 system/provider 兼容配置。"
        />
      ) : null}
      {testMutation.data ? (
        <AdminActionFeedback
          tone={testMutation.data.success ? "success" : "warning"}
          title={
            testMutation.data.success ? "连通性测试成功" : "连通性测试失败"
          }
          description={testMutation.data.message}
        />
      ) : null}
      {installMutation.data ? (
        <AdminActionFeedback
          tone="success"
          title="模型角色安装完成"
          description={`新增 ${installMutation.data.installedCount} 个，更新 ${installMutation.data.updatedCount} 个，跳过 ${installMutation.data.skippedCount} 个。`}
        />
      ) : null}
      {installSelectedMutation.data ? (
        <AdminActionFeedback
          tone="success"
          title="选中模型角色已处理"
          description={`新增 ${installSelectedMutation.data.installedCount} 个，更新 ${installSelectedMutation.data.updatedCount} 个，跳过 ${installSelectedMutation.data.skippedCount} 个。`}
        />
      ) : null}
      {rebindMutation.data ? (
        <AdminActionFeedback
          tone={rebindMutation.data.missingCount > 0 ? "warning" : "success"}
          title="模型人格角色换绑完成"
          description={`已更新 ${rebindMutation.data.updatedCount} 个，跳过 ${rebindMutation.data.skippedCount} 个，未安装 ${rebindMutation.data.missingCount} 个。`}
        />
      ) : null}
      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <ErrorBlock message={saveMutation.error.message} />
      ) : null}
      {testMutation.isError && testMutation.error instanceof Error ? (
        <ErrorBlock message={testMutation.error.message} />
      ) : null}
      {installMutation.isError && installMutation.error instanceof Error ? (
        <ErrorBlock message={installMutation.error.message} />
      ) : null}
      {installSelectedMutation.isError &&
      installSelectedMutation.error instanceof Error ? (
        <ErrorBlock message={installSelectedMutation.error.message} />
      ) : null}
      {rebindMutation.isError && rebindMutation.error instanceof Error ? (
        <ErrorBlock message={rebindMutation.error.message} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="默认路由摘要"
            actions={
              defaultProviderAccount ? (
                <div className="flex flex-wrap gap-2">
                  <StatusPill
                    tone={
                      defaultProviderAccount.isEnabled ? "healthy" : "warning"
                    }
                  >
                    {defaultProviderAccount.isEnabled
                      ? "默认路由启用中"
                      : "默认路由已停用"}
                  </StatusPill>
                  <StatusPill
                    tone={
                      defaultProviderAccount.hasApiKey ? "healthy" : "warning"
                    }
                  >
                    {defaultProviderAccount.hasApiKey
                      ? "Key 已配置"
                      : "缺少 Key"}
                  </StatusPill>
                </div>
              ) : (
                <StatusPill tone="warning">尚未配置默认路由</StatusPill>
              )
            }
          />

          {defaultProviderAccount ? (
            <>
              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <AdminMetaText>当前默认 Provider</AdminMetaText>
                  <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                    {defaultProviderAccount.name}
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                    默认模型 `{defaultProviderAccount.defaultModelId}`
                  </div>
                </div>
                <div className="text-sm text-[color:var(--text-secondary)]">
                  最近更新时间{" "}
                  {formatDateTime(defaultProviderAccount.updatedAt)}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <MetricCard
                  label="请求模式"
                  value={PROVIDER_MODE_LABELS[defaultProviderAccount.mode]}
                  detail={API_STYLE_LABELS[defaultProviderAccount.apiStyle]}
                />
                <MetricCard
                  label="接口地址"
                  value={getEndpointLabel(defaultProviderAccount.endpoint)}
                  detail={defaultProviderAccount.endpoint}
                />
                <MetricCard
                  label="语音转写"
                  value={
                    defaultProviderAccount.transcriptionModel || "未单独配置"
                  }
                  detail={
                    defaultProviderAccount.transcriptionEndpoint
                      ? getEndpointLabel(
                          defaultProviderAccount.transcriptionEndpoint,
                        )
                      : "默认跟随主接口或当前未启用"
                  }
                />
                <MetricCard
                  label="语音播报"
                  value={defaultProviderAccount.ttsModel || "未配置"}
                  detail={
                    defaultProviderAccount.ttsVoice
                      ? `音色 ${defaultProviderAccount.ttsVoice}`
                      : "未配置音色"
                  }
                />
              </div>

              <AdminSoftBox className="mt-4">
                默认账户会继续兼容旧版
                `/system/provider`。如果这里被切换或停用，旧链路也会同步受到影响。
              </AdminSoftBox>
            </>
          ) : (
            <InlineNotice className="mt-4" tone="warning">
              当前还没有默认
              Provider。建议先创建一个可用账户，并补齐接口地址、默认模型和 API
              Key。
            </InlineNotice>
          )}
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="运营操作流"
            actions={
              <StatusPill
                tone={selectedModelIds.length > 0 ? "healthy" : "muted"}
              >
                已选 {selectedModelIds.length} 个模型
              </StatusPill>
            }
          />

          <div className="mt-4 grid gap-3">
            <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-[var(--shadow-soft)]">
              <AdminMetaText>STEP 1</AdminMetaText>
              <div className="mt-2 text-base font-semibold text-[color:var(--text-primary)]">
                检查默认路由是否可用
              </div>
              <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                {defaultProviderAccount
                  ? `${defaultProviderAccount.name} 正在承接默认模型 ${defaultProviderAccount.defaultModelId}。`
                  : "当前还没有默认账户，批量动作无法稳定落地。"}
              </div>
            </div>

            <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-[var(--shadow-soft)]">
              <AdminMetaText>STEP 2</AdminMetaText>
              <div className="mt-2 text-base font-semibold text-[color:var(--text-primary)]">
                维护 Provider 账户池
              </div>
              <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                当前共有 {providerAccounts.length} 个账户，其中{" "}
                {enabledProviderCount} 个启用，{providerWithApiKeyCount}{" "}
                个已配置主 Key。
              </div>
            </div>

            <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-[var(--shadow-soft)]">
              <AdminMetaText>STEP 3</AdminMetaText>
              <div className="mt-2 text-base font-semibold text-[color:var(--text-primary)]">
                批量安装或换绑模型人格
              </div>
              <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                当前批量动作目标：
                {selectedRoutingProvider
                  ? `${selectedRoutingProvider.name} · ${selectedRoutingProvider.defaultModelId}`
                  : "未选择 Provider"}
              </div>
            </div>
          </div>

          {!defaultProviderAccount ? (
            <InlineNotice className="mt-4" tone="warning">
              建议先创建默认 Provider，否则模型人格安装和换绑会缺少稳定落点。
            </InlineNotice>
          ) : null}
          {defaultProviderAccount && !defaultProviderAccount.hasApiKey ? (
            <InlineNotice className="mt-4" tone="warning">
              默认 Provider 尚未配置主 API Key。运营可以先补 Key
              再做连通性测试和模型人格批量安装。
            </InlineNotice>
          ) : null}
          {selectedProviderId === "new" && providerAccounts.length > 0 ? (
            <InlineNotice className="mt-4" tone="info">
              当前处于新建 Provider 模式。下方模型批量动作会自动回退到默认
              Provider，不会绑定到未保存草稿。
            </InlineNotice>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="Provider 账户池"
            actions={
              <StatusPill
                tone={enabledProviderCount > 0 ? "healthy" : "warning"}
              >
                启用中 {enabledProviderCount}
              </StatusPill>
            }
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <AdminValueCard
              label="默认账户"
              value={defaultProviderAccount?.name ?? "未设置"}
            />
            <AdminValueCard
              label="可用主 Key"
              value={`${providerWithApiKeyCount} / ${providerAccounts.length}`}
            />
          </div>

          <div className="mt-4 space-y-3">
            {providerAccounts.map((account) => (
              <AdminSelectableCard
                key={account.id}
                active={account.id === selectedProviderId}
                title={account.name}
                subtitle={account.defaultModelId}
                meta={`${PROVIDER_MODE_LABELS[account.mode]} · ${API_STYLE_LABELS[account.apiStyle]} · ${getEndpointLabel(account.endpoint)} · 更新于 ${formatDateTime(account.updatedAt)}`}
                activeLabel="当前编辑"
                onClick={() => setSelectedProviderId(account.id)}
                badge={
                  <div className="flex flex-col items-end gap-2">
                    {account.isDefault ? (
                      <StatusPill tone="healthy">默认</StatusPill>
                    ) : null}
                    <StatusPill
                      tone={account.isEnabled ? "healthy" : "warning"}
                    >
                      {account.isEnabled ? "启用" : "停用"}
                    </StatusPill>
                    <StatusPill
                      tone={account.hasApiKey ? "healthy" : "warning"}
                    >
                      {account.hasApiKey ? "Key" : "无 Key"}
                    </StatusPill>
                  </div>
                }
              />
            ))}

            <AdminSelectableCard
              active={selectedProviderId === "new"}
              title="新建 Provider 账户"
              subtitle="录入新的接口地址、默认模型和密钥"
              meta="未保存前不会影响当前默认路由。保存后可再决定是否切成默认。"
              activeLabel="当前新建"
              onClick={() => setSelectedProviderId("new")}
              badge={<StatusPill tone="muted">草稿</StatusPill>}
            />
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title={
              selectedProviderId === "new"
                ? "新建 Provider 账户"
                : "编辑 Provider 账户"
            }
            actions={
              <div className="flex flex-wrap gap-2">
                {selectedAccount?.isDefault ? (
                  <StatusPill tone="healthy">当前默认路由</StatusPill>
                ) : null}
                <StatusPill
                  tone={
                    (providerDraft.isEnabled ?? true) ? "healthy" : "warning"
                  }
                >
                  {(providerDraft.isEnabled ?? true) ? "已启用" : "已停用"}
                </StatusPill>
              </div>
            }
          />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <AdminValueCard
              label="主 Key 状态"
              value={currentDraftHasApiKey ? "已配置或沿用现有值" : "未配置"}
            />
            <AdminValueCard
              label="转写 Key 状态"
              value={
                currentDraftHasTranscriptionKey
                  ? "已配置或沿用现有值"
                  : "未配置"
              }
            />
            <AdminValueCard
              label="批量动作目标"
              value={
                selectedProviderId === "new"
                  ? (selectedRoutingProvider?.name ?? "未选择")
                  : (selectedAccount?.name ?? providerDraft.name) ||
                    "未命名草稿"
              }
            />
          </div>

          <AdminSoftBox className="mt-4">
            当前编辑的 Provider
            会成为下方模型人格批量动作的默认目标。若你正在新建账户，批量动作会临时回退到已有默认
            Provider。
          </AdminSoftBox>

          <div className="mt-5 space-y-5">
            <section className="space-y-4 border-t border-[color:var(--border-faint)] pt-5 first:border-t-0 first:pt-0">
              <div>
                <AdminMetaText>基础接入</AdminMetaText>
                <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                  决定默认模型、主接口地址和请求协议，是运营最常改的部分。
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="账户名称"
                  value={providerDraft.name ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({ ...current, name: value }))
                  }
                />
                <Field
                  label="默认模型 ID"
                  value={providerDraft.defaultModelId ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      defaultModelId: value,
                    }))
                  }
                />
                <Field
                  className="md:col-span-2"
                  label="接口地址"
                  value={providerDraft.endpoint ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      endpoint: value,
                    }))
                  }
                />
                <SelectField
                  label="模式"
                  value={providerDraft.mode ?? "cloud"}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      mode: value as InferenceProviderAccountDraft["mode"],
                    }))
                  }
                  options={[
                    { value: "cloud", label: "云端模式" },
                    { value: "local-compatible", label: "本地兼容" },
                  ]}
                />
                <SelectField
                  label="API 风格"
                  value={providerDraft.apiStyle ?? "openai-chat-completions"}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      apiStyle:
                        value as InferenceProviderAccountDraft["apiStyle"],
                    }))
                  }
                  options={[
                    {
                      value: "openai-chat-completions",
                      label: "Chat Completions",
                    },
                    { value: "openai-responses", label: "Responses" },
                  ]}
                />
                <Field
                  label="API Key"
                  type="password"
                  value={providerDraft.apiKey ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      apiKey: value,
                    }))
                  }
                />
              </div>
            </section>

            <section className="space-y-4 border-t border-[color:var(--border-faint)] pt-5">
              <div>
                <AdminMetaText>语音能力</AdminMetaText>
                <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                  按需补充转写和 TTS。若转写接口留空，默认视为未单独配置。
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="语音转写接口"
                  value={providerDraft.transcriptionEndpoint ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      transcriptionEndpoint: value,
                    }))
                  }
                />
                <Field
                  label="语音转写模型"
                  value={providerDraft.transcriptionModel ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      transcriptionModel: value,
                    }))
                  }
                />
                <Field
                  label="语音转写 Key"
                  type="password"
                  value={providerDraft.transcriptionApiKey ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      transcriptionApiKey: value,
                    }))
                  }
                />
                <Field
                  label="TTS 模型"
                  value={providerDraft.ttsModel ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      ttsModel: value,
                    }))
                  }
                />
                <Field
                  label="TTS 音色"
                  value={providerDraft.ttsVoice ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      ttsVoice: value,
                    }))
                  }
                />
              </div>
            </section>

            <section className="space-y-4 border-t border-[color:var(--border-faint)] pt-5">
              <div>
                <AdminMetaText>维护信息</AdminMetaText>
                <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                  用于记录用途、限流约束、适配模型或团队约定。
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Toggle
                  label="启用该账户"
                  checked={providerDraft.isEnabled ?? true}
                  onChange={(checked) =>
                    setProviderDraft((current) => ({
                      ...current,
                      isEnabled: checked,
                    }))
                  }
                />
              </div>
              <TextAreaField
                label="备注"
                value={providerDraft.notes ?? ""}
                onChange={(value) =>
                  setProviderDraft((current) => ({ ...current, notes: value }))
                }
              />
            </section>
          </div>

          {!canSave ? (
            <InlineNotice className="mt-4" tone="warning">
              账户名称、接口地址和默认模型 ID 必填。
            </InlineNotice>
          ) : null}
          {!currentDraftHasApiKey ? (
            <InlineNotice className="mt-4" tone="info">
              当前未填写主 API Key。若这是已有账户，留空会沿用旧
              Key；若是新建账户，保存后仍无法实际发起调用。
            </InlineNotice>
          ) : null}

          <div className="mt-5 rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-[var(--shadow-soft)]">
            <AdminMetaText>发布操作</AdminMetaText>
            <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
              建议先做连通性测试，再保存；非默认账户保存后不会自动切流，仍需手动设为默认。
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => testMutation.mutate()}
                disabled={!canSave || testMutation.isPending}
              >
                {testMutation.isPending ? "测试中..." : "测试连接"}
              </Button>
              <Button
                variant="primary"
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending}
              >
                {saveMutation.isPending ? "保存中..." : "保存账户"}
              </Button>
              {selectedAccount && !selectedAccount.isDefault ? (
                <Button
                  variant="secondary"
                  onClick={() => setDefaultMutation.mutate(selectedAccount.id)}
                  disabled={setDefaultMutation.isPending}
                >
                  {setDefaultMutation.isPending ? "切换中..." : "设为默认"}
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      <AdminCallout
        tone="info"
        title="模型人格批量处理"
        description="先通过搜索和卡片筛选出目标模型，再决定是安装、覆盖刷新，还是把已经存在的模型人格角色统一换绑到当前 Provider。整体批量动作默认跟随当前选中的 Provider；若当前在新建模式，则回退到默认账户。"
        actions={
          <Button
            variant="secondary"
            onClick={() => installMutation.mutate(true)}
            disabled={!canInstall || installMutation.isPending}
          >
            {installMutation.isPending ? "刷新中..." : "覆盖刷新全部模型角色"}
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.38fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="批量动作"
            actions={
              <StatusPill
                tone={selectedRoutingProvider ? "healthy" : "warning"}
              >
                {selectedRoutingProvider ? "目标已锁定" : "缺少目标 Provider"}
              </StatusPill>
            }
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <MetricCard
              label="已选模型"
              value={selectedModelIds.length}
              detail={
                selectedVisibleCount > 0
                  ? `当前筛选结果里已选 ${selectedVisibleCount} 个`
                  : "可通过右侧目录卡片直接点选"
              }
            />
            <MetricCard
              label="当前目标"
              value={selectedRoutingProvider?.name ?? "未选择 Provider"}
              detail={
                selectedRoutingProvider
                  ? `${selectedRoutingProvider.defaultModelId} · ${PROVIDER_MODE_LABELS[selectedRoutingProvider.mode]}`
                  : "请先准备默认账户或选择已有 Provider"
              }
            />
            <MetricCard
              label="活跃模型"
              value={activeModelCount}
              detail={`预览 ${previewModelCount} · 推理能力 ${reasoningModelCount}`}
            />
            <MetricCard
              label="当前结果集"
              value={filteredModels.length}
              detail={modelSearch ? `搜索词：${modelSearch}` : "未设置筛选条件"}
            />
          </div>

          {selectedRoutingProvider ? (
            <AdminSoftBox className="mt-4">
              批量安装和换绑会写入到 `{selectedRoutingProvider.name}
              `。如果你刚切换了左侧账户，先确认这里的目标是否符合预期。
            </AdminSoftBox>
          ) : (
            <InlineNotice className="mt-4" tone="warning">
              当前没有可用于批量动作的 Provider。请先创建或修复默认账户。
            </InlineNotice>
          )}

          <div className="mt-5 space-y-3">
            <Button
              variant="secondary"
              onClick={() => installSelectedMutation.mutate(false)}
              disabled={
                !canInstallSelected || installSelectedMutation.isPending
              }
              className="w-full justify-center"
            >
              {installSelectedMutation.isPending
                ? "安装中..."
                : "安装选中模型角色"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => installSelectedMutation.mutate(true)}
              disabled={
                !canInstallSelected || installSelectedMutation.isPending
              }
              className="w-full justify-center"
            >
              {installSelectedMutation.isPending
                ? "刷新中..."
                : "覆盖刷新选中角色"}
            </Button>
            <Button
              variant="primary"
              onClick={() => rebindMutation.mutate()}
              disabled={!canRebindSelected || rebindMutation.isPending}
              className="w-full justify-center"
            >
              {rebindMutation.isPending
                ? "换绑中..."
                : "换绑选中模型人格角色到当前 Provider"}
            </Button>
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="模型目录"
            actions={
              <div className="flex flex-wrap items-end justify-end gap-3">
                <div className="w-[280px]">
                  <Field
                    label="搜索模型 / 角色名 / 厂商"
                    value={modelSearch}
                    onChange={setModelSearch}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleVisibleModelSelection}
                  disabled={visibleModelIds.length === 0}
                >
                  {visibleModelIds.length > 0 &&
                  selectedVisibleCount === visibleModelIds.length
                    ? "取消当前筛选"
                    : "选中当前筛选"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedModelIds([])}
                  disabled={selectedModelIds.length === 0}
                >
                  清空选择
                </Button>
              </div>
            }
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusPill tone="muted">目录 {modelCatalog.length}</StatusPill>
            <StatusPill tone="muted">
              当前结果 {filteredModels.length}
            </StatusPill>
            <StatusPill tone="muted">活跃 {activeModelCount}</StatusPill>
            {previewModelCount > 0 ? (
              <StatusPill tone="warning">预览 {previewModelCount}</StatusPill>
            ) : null}
            <StatusPill
              tone={selectedModelIds.length > 0 ? "healthy" : "muted"}
            >
              已选 {selectedModelIds.length}
            </StatusPill>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {filteredModels.map((entry) => {
              const selected = selectedModelIdSet.has(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => toggleModelSelection(entry.id)}
                  className={`rounded-[22px] border px-4 py-4 text-left shadow-[var(--shadow-soft)] transition ${
                    selected
                      ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand-primary)]/20"
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg">{entry.defaultAvatar}</span>
                        <span className="text-base font-semibold text-[color:var(--text-primary)]">
                          {entry.label}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                        {entry.vendor} · {entry.providerFamily} ·{" "}
                        {REGION_LABELS[entry.region]}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusPill tone={selected ? "healthy" : "muted"}>
                        {selected ? "已选" : "点击选中"}
                      </StatusPill>
                      <StatusPill tone={resolveModelStatusTone(entry.status)}>
                        {MODEL_STATUS_LABELS[entry.status]}
                      </StatusPill>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <AdminValueCard
                      label="推荐角色名"
                      value={entry.recommendedRoleName}
                    />
                    <AdminValueCard
                      label="目录状态"
                      value={`${MODEL_STATUS_LABELS[entry.status]} · ${REGION_LABELS[entry.region]}`}
                    />
                  </div>

                  {entry.description ? (
                    <div className="mt-4 text-sm leading-6 text-[color:var(--text-secondary)]">
                      {entry.description}
                    </div>
                  ) : null}

                  {entry.rolePromptHint ? (
                    <AdminSoftBox className="mt-4">
                      角色提示：{entry.rolePromptHint}
                    </AdminSoftBox>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {resolveCapabilityTags(entry).map((tag) => (
                      <StatusPill key={`${entry.id}-${tag}`} tone="muted">
                        {tag}
                      </StatusPill>
                    ))}
                  </div>

                  <div className="mt-4 rounded-[16px] bg-[color:var(--surface-console)] px-3 py-2 text-xs leading-5 text-[color:var(--text-muted)]">
                    模型 ID：{entry.id}
                  </div>
                </button>
              );
            })}
          </div>

          {filteredModels.length === 0 ? (
            <div className="mt-4">
              <InlineNotice tone="warning">没有匹配的模型目录项。</InlineNotice>
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>当前落地口径</SectionHeading>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm leading-7 text-[color:var(--text-secondary)]">
            默认账户继续兼容旧版 `system/provider`，避免已有链路直接失效。
          </div>
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm leading-7 text-[color:var(--text-secondary)]">
            角色可切换为“继承默认路由”或“角色专属模型路由”。
          </div>
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm leading-7 text-[color:var(--text-secondary)]">
            同一个实例可以挂多个 Provider 账户，每个账户有自己的默认模型与独立
            Key。
          </div>
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm leading-7 text-[color:var(--text-secondary)]">
            模型角色批量安装器会把目录模型转成世界角色，并默认关闭角色级 owner
            key 覆盖。
          </div>
        </div>
      </Card>
    </div>
  );
}
