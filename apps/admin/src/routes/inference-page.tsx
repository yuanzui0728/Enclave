import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  InferenceProviderAccount,
  InferenceProviderAccountDraft,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  SectionHeading,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminCallout,
  AdminPageHero,
  AdminSectionHeader,
  AdminSelectField as SelectField,
  AdminTextArea as TextAreaField,
  AdminTextField as Field,
  AdminToggle as Toggle,
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

export function InferencePage() {
  const queryClient = useQueryClient();
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [providerDraft, setProviderDraft] =
    useState<InferenceProviderAccountDraft>(emptyDraft);
  const [modelSearch, setModelSearch] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["admin-inference-overview"],
    queryFn: () => adminApi.getInferenceOverview(),
  });

  const providerAccounts = overviewQuery.data?.providerAccounts ?? [];
  const modelCatalog = overviewQuery.data?.modelCatalog ?? [];

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

  const filteredModels = useMemo(() => {
    const normalizedSearch = modelSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return modelCatalog;
    }

    return modelCatalog.filter((entry) =>
      [entry.id, entry.label, entry.vendor, entry.providerFamily]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [modelCatalog, modelSearch]);

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

  const canSave = Boolean(
    providerDraft.name?.trim() &&
      providerDraft.endpoint?.trim() &&
      providerDraft.defaultModelId?.trim(),
  );
  const canInstall = Boolean(
    (selectedProviderId && selectedProviderId !== "new") ||
      providerAccounts.some((item) => item.isDefault),
  );

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="模型与路由"
        title="多模型账户、模型目录与角色绑定"
        description="把默认推理账户、多个 Provider Key、模型目录和模型角色批量安装收口到一个工作台。角色编辑页里可以直接切换到任意默认路由或角色专属模型。"
        metrics={[
          {
            label: "Provider 账户",
            value: providerAccounts.length,
          },
          {
            label: "模型目录",
            value: modelCatalog.length,
          },
          {
            label: "已绑定角色",
            value: overviewQuery.data?.roleBindingSummary.boundCharacters ?? 0,
          },
          {
            label: "模型人格角色",
            value:
              overviewQuery.data?.roleBindingSummary.modelPersonaCharacters ?? 0,
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

      {overviewQuery.isLoading ? <LoadingBlock label="正在读取模型路由工作台..." /> : null}
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
          title={testMutation.data.success ? "连通性测试成功" : "连通性测试失败"}
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
      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <ErrorBlock message={saveMutation.error.message} />
      ) : null}
      {testMutation.isError && testMutation.error instanceof Error ? (
        <ErrorBlock message={testMutation.error.message} />
      ) : null}
      {installMutation.isError && installMutation.error instanceof Error ? (
        <ErrorBlock message={installMutation.error.message} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="Provider 账户"
            actions={
              <StatusPill tone="muted">
                默认账户会继续兼容旧版 `/system/provider`
              </StatusPill>
            }
          />
          <div className="mt-4 space-y-3">
            {providerAccounts.map((account) => {
              const active = account.id === selectedProviderId;
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelectedProviderId(account.id)}
                  className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${
                    active
                      ? "border-[color:var(--border-brand)] bg-[color:var(--surface-card)] shadow-[var(--shadow-soft)]"
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {account.name}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                        {account.defaultModelId}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {account.isDefault ? (
                        <StatusPill tone="healthy">默认</StatusPill>
                      ) : null}
                      <StatusPill tone={account.isEnabled ? "healthy" : "warning"}>
                        {account.isEnabled ? "启用" : "停用"}
                      </StatusPill>
                    </div>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
                    {account.endpoint}
                  </div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setSelectedProviderId("new")}
              className={`w-full rounded-[20px] border border-dashed px-4 py-3 text-left text-sm transition ${
                selectedProviderId === "new"
                  ? "border-[color:var(--border-brand)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)]"
                  : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card)]"
              }`}
            >
              新建一个额外 Provider 账户
            </button>
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title={selectedProviderId === "new" ? "新建 Provider 账户" : "编辑 Provider 账户"}
            actions={
              selectedAccount?.isDefault ? (
                <StatusPill tone="healthy">当前默认路由</StatusPill>
              ) : null
            }
          />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                setProviderDraft((current) => ({ ...current, endpoint: value }))
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
                  apiStyle: value as InferenceProviderAccountDraft["apiStyle"],
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
                setProviderDraft((current) => ({ ...current, apiKey: value }))
              }
            />
            <Field
              label="TTS 模型"
              value={providerDraft.ttsModel ?? ""}
              onChange={(value) =>
                setProviderDraft((current) => ({ ...current, ttsModel: value }))
              }
            />
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
              label="TTS 音色"
              value={providerDraft.ttsVoice ?? ""}
              onChange={(value) =>
                setProviderDraft((current) => ({ ...current, ttsVoice: value }))
              }
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
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
            className="mt-4"
            label="备注"
            value={providerDraft.notes ?? ""}
            onChange={(value) =>
              setProviderDraft((current) => ({ ...current, notes: value }))
            }
          />
          {!canSave ? (
            <InlineNotice className="mt-4" tone="warning">
              账户名称、接口地址和默认模型 ID 必填。
            </InlineNotice>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
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
        </Card>
      </div>

      <AdminCallout
        tone="info"
        title="模型角色批量安装"
        description="点击“安装全部模型角色”后，系统会为目录里的主流模型各建一个世界角色，并把角色路由锁到它对应的模型。后续你也可以在角色编辑页单独换模型、换 Provider 账户。"
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

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title="模型目录"
          actions={
            <div className="w-[280px]">
              <Field
                label="搜索模型"
                value={modelSearch}
                onChange={setModelSearch}
              />
            </div>
          }
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredModels.map((entry) => (
            <div
              key={entry.id}
              className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-[color:var(--text-primary)]">
                    {entry.defaultAvatar} {entry.label}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                    {entry.vendor} · {entry.region === "domestic" ? "国内" : "国际"}
                  </div>
                </div>
                <StatusPill
                  tone={
                    entry.status === "active"
                      ? "healthy"
                      : entry.status === "preview"
                        ? "warning"
                        : "muted"
                  }
                >
                  {entry.status}
                </StatusPill>
              </div>
              <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                {entry.description}
              </div>
              <div className="mt-3 rounded-[16px] bg-[color:var(--surface-console)] px-3 py-2 text-xs leading-5 text-[color:var(--text-muted)]">
                模型 ID：{entry.id}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill tone="muted">{entry.providerFamily}</StatusPill>
                {entry.supportsVision ? <StatusPill tone="muted">vision</StatusPill> : null}
                {entry.supportsAudio ? <StatusPill tone="muted">audio</StatusPill> : null}
                {entry.supportsReasoning ? (
                  <StatusPill tone="muted">reasoning</StatusPill>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {filteredModels.length === 0 ? (
          <div className="mt-4">
            <InlineNotice tone="warning">没有匹配的模型目录项。</InlineNotice>
          </div>
        ) : null}
      </Card>

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>当前落地口径</SectionHeading>
        <div className="mt-4 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          <p>1. 实例默认账户继续兼容旧版 `system/provider`，避免已有链路直接失效。</p>
          <p>2. 角色可切换为“继承默认路由”或“角色专属模型路由”。</p>
          <p>3. 同一个实例可以挂多个 Provider 账户，每个账户有自己的默认模型与独立 Key。</p>
          <p>4. 模型角色批量安装器会把目录模型转成世界角色，并默认关闭角色级 owner key 覆盖。</p>
        </div>
      </Card>
    </div>
  );
}
