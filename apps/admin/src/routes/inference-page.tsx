import { useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  InferenceDiagnosticCapability,
  InferenceDiagnosticResult,
  InferenceModelCatalogEntry,
  InferenceProviderAccount,
  InferenceProviderAccountDraft,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  Card,
  InlineNotice,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminDraftStatusPill,
  AdminErrorState,
  AdminPageHero,
  AdminSectionHeader,
  AdminSelectableCard,
  AdminSelectField as SelectField,
  AdminSkeletonCard,
  AdminSoftBox,
  AdminTabs,
  AdminTextArea as TextAreaField,
  AdminTextField as Field,
  AdminToggle as Toggle,
  AdminValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { formatAdminDateTime as formatLocalizedDateTime } from "../lib/format";

type WorkspaceTab = "overview" | "providers" | "models";
type ModelStatusFilter = "all" | InferenceModelCatalogEntry["status"];
type ModelCapabilityFilter = "all" | "reasoning" | "vision" | "audio";
type RuntimeMessage = Parameters<typeof translateRuntimeMessage>[0];

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: ReturnType<typeof msg> }> = [
  { key: "overview", label: msg`总览` },
  { key: "providers", label: msg`Provider 账户` },
  { key: "models", label: msg`模型人格` },
];

const emptyDraft: InferenceProviderAccountDraft = {
  name: "", // i18n-ignore-line: empty default value
  endpoint: "https://api.openai.com/v1",
  defaultModelId: "gpt-4.1-mini",
  apiKey: "",
  mode: "cloud",
  apiStyle: "openai-chat-completions",
  transcriptionEndpoint: "",
  transcriptionModel: "",
  transcriptionApiKey: "",
  ttsEndpoint: "",
  ttsApiKey: "",
  ttsModel: "gpt-4o-mini-tts",
  ttsVoice: "alloy",
  imageGenerationEndpoint: "",
  imageGenerationModel: "",
  imageGenerationApiKey: "",
  isEnabled: true,
  notes: "",
};

const PROVIDER_MODE_LABELS: Record<
  NonNullable<InferenceProviderAccountDraft["mode"]>,
  ReturnType<typeof msg>
> = {
  cloud: msg`云端模式`,
  "local-compatible": msg`本地兼容`,
};

const MODEL_STATUS_LABELS: Record<
  InferenceModelCatalogEntry["status"],
  ReturnType<typeof msg>
> = {
  active: msg`活跃`,
  preview: msg`预览`,
  legacy: msg`旧版`,
};

const REGION_LABELS: Record<InferenceModelCatalogEntry["region"], ReturnType<typeof msg>> = {
  domestic: msg`国内`,
  global: msg`国际`,
};

const MODEL_STATUS_FILTER_OPTIONS: Array<{
  value: ModelStatusFilter;
  label: ReturnType<typeof msg>;
}> = [
  { value: "all", label: msg`全部状态` },
  { value: "active", label: msg`活跃` },
  { value: "preview", label: msg`预览` },
  { value: "legacy", label: msg`旧版` },
];

const MODEL_CAPABILITY_OPTIONS: Array<{
  value: ModelCapabilityFilter;
  label: ReturnType<typeof msg>;
}> = [
  { value: "all", label: msg`全部能力` },
  { value: "reasoning", label: msg`reasoning` },
  { value: "vision", label: msg`vision` },
  { value: "audio", label: msg`audio` },
];

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
    ttsEndpoint: account.ttsEndpoint ?? "",
    ttsApiKey: account.ttsApiKey ?? "",
    ttsModel: account.ttsModel ?? "",
    ttsVoice: account.ttsVoice ?? "",
    imageGenerationEndpoint: account.imageGenerationEndpoint ?? "",
    imageGenerationModel: account.imageGenerationModel ?? "",
    imageGenerationApiKey: account.imageGenerationApiKey ?? "",
    isEnabled: account.isEnabled,
    notes: account.notes ?? "",
  };
}

function normalizeDraftForCompare(draft: InferenceProviderAccountDraft) {
  return {
    name: draft.name?.trim() ?? "",
    endpoint: draft.endpoint?.trim() ?? "",
    defaultModelId: draft.defaultModelId?.trim() ?? "",
    apiKey: draft.apiKey?.trim() ?? "",
    mode: draft.mode ?? "cloud",
    apiStyle: draft.apiStyle ?? "openai-chat-completions",
    transcriptionEndpoint: draft.transcriptionEndpoint?.trim() ?? "",
    transcriptionModel: draft.transcriptionModel?.trim() ?? "",
    transcriptionApiKey: draft.transcriptionApiKey?.trim() ?? "",
    ttsEndpoint: draft.ttsEndpoint?.trim() ?? "",
    ttsApiKey: draft.ttsApiKey?.trim() ?? "",
    ttsModel: draft.ttsModel?.trim() ?? "",
    ttsVoice: draft.ttsVoice?.trim() ?? "",
    imageGenerationEndpoint: draft.imageGenerationEndpoint?.trim() ?? "",
    imageGenerationModel: draft.imageGenerationModel?.trim() ?? "",
    imageGenerationApiKey: draft.imageGenerationApiKey?.trim() ?? "",
    isEnabled: draft.isEnabled ?? true,
    notes: draft.notes?.trim() ?? "",
  };
}

const DIAGNOSTIC_CAPABILITIES: Array<{
  capability: InferenceDiagnosticCapability;
  label: RuntimeMessage;
}> = [
  { capability: "text", label: msg`文本` },
  { capability: "image_input", label: msg`图片理解` },
  { capability: "audio_input", label: msg`原生音频理解` },
  { capability: "transcription", label: msg`语音转写` },
  { capability: "tts", label: msg`TTS` },
  { capability: "image_generation", label: msg`图片生成` },
  { capability: "digital_human", label: msg`数字人` },
];

const DIAGNOSTIC_CAPABILITY_LABELS: Partial<
  Record<InferenceDiagnosticCapability, RuntimeMessage>
> = {
  audio_input: msg`原生音频理解`,
};

const DIAGNOSTIC_MESSAGE_LABELS: Record<string, RuntimeMessage> = {
  INFERENCE_DIAGNOSTIC_AUDIO_INPUT_MISSING_PROVIDER_CONFIG: msg`原生音频输入诊断缺少主推理 API Key 或默认模型。`,
  INFERENCE_DIAGNOSTIC_AUDIO_INPUT_UNDECLARED_CAPABILITY: msg`当前模型目录或启发式判断未声明 Chat Completions 原生音频输入能力。`,
  INFERENCE_DIAGNOSTIC_AUDIO_INPUT_MISSING_PROBE_TTS_CONFIG: msg`未配置可用 TTS 探针，当前无法做真实的原生音频语义校验。`,
  INFERENCE_DIAGNOSTIC_AUDIO_INPUT_SEMANTIC_PROBE_FAILED: msg`原生音频输入请求已发出，但语义探针未通过，不能算真实音频理解可用。`,
  INFERENCE_DIAGNOSTIC_AUDIO_INPUT_SUCCESS: msg`原生音频语义探针通过，系统已确认存在真实可用的音频理解模型。`,
};

function resolveDiagnosticCapabilityLabel(
  capability: InferenceDiagnosticCapability,
  fallback: string | RuntimeMessage,
) {
  const label = DIAGNOSTIC_CAPABILITY_LABELS[capability];
  if (label) {
    return translateRuntimeMessage(label);
  }
  return typeof fallback === "string"
    ? fallback
    : translateRuntimeMessage(fallback);
}

function resolveDiagnosticMessage(message: string) {
  const label = DIAGNOSTIC_MESSAGE_LABELS[message];
  return label ? translateRuntimeMessage(label) : message;
}

function formatDateTime(value?: string | null) {
  return formatLocalizedDateTime(
    value,
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
    "none",
  );
}

function getEndpointLabel(endpoint?: string | null) {
  if (!endpoint?.trim()) {
    return translateRuntimeMessage(msg`未配置`);
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

function resolveDiagnosticStatusTone(
  status: InferenceDiagnosticResult["status"] | "not_run",
  realReady: boolean,
) {
  if (realReady) {
    return "healthy" as const;
  }
  if (status === "failed" || status === "unavailable") {
    return "warning" as const;
  }
  return "muted" as const;
}

function resolveDiagnosticStatusLabel(
  status: InferenceDiagnosticResult["status"] | "not_run",
  realReady: boolean,
) {
  if (realReady) {
    return translateRuntimeMessage(msg`真实可用`);
  }
  if (status === "not_run") {
    return translateRuntimeMessage(msg`未诊断`);
  }
  if (status === "failed") {
    return translateRuntimeMessage(msg`诊断失败`);
  }
  if (status === "unavailable") {
    return translateRuntimeMessage(msg`不可用`);
  }
  return translateRuntimeMessage(msg`未证明`);
}

function matchesCapability(
  entry: InferenceModelCatalogEntry,
  capability: ModelCapabilityFilter,
) {
  if (capability === "reasoning") {
    return entry.supportsReasoning;
  }
  if (capability === "vision") {
    return entry.supportsVision;
  }
  if (capability === "audio") {
    return entry.supportsAudio;
  }
  return true;
}

function resolveCapabilityTags(entry: InferenceModelCatalogEntry) {
  const tags = [
    `${entry.vendor} / ${entry.providerFamily}`,
    translateRuntimeMessage(REGION_LABELS[entry.region]),
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
  const t = translateRuntimeMessage;
  const queryClient = useQueryClient();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [bulkProviderId, setBulkProviderId] = useState("");
  const [providerDraft, setProviderDraft] =
    useState<InferenceProviderAccountDraft>(emptyDraft);
  const [modelSearch, setModelSearch] = useState("");
  const [modelStatusFilter, setModelStatusFilter] =
    useState<ModelStatusFilter>("all");
  const [modelCapabilityFilter, setModelCapabilityFilter] =
    useState<ModelCapabilityFilter>("all");
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [diagnosticResult, setDiagnosticResult] =
    useState<InferenceDiagnosticResult | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["admin-inference-overview"],
    queryFn: () => adminApi.getInferenceOverview(),
  });

  const multimodalOverviewQuery = useQuery({
    queryKey: ["admin-inference-multimodal-overview"],
    queryFn: () => adminApi.getInferenceMultimodalOverview(),
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

    if (
      !selectedProviderId ||
      (selectedProviderId !== "new" &&
        !providerAccounts.some((item) => item.id === selectedProviderId))
    ) {
      setSelectedProviderId(
        providerAccounts.find((item) => item.isDefault)?.id ??
          providerAccounts[0].id,
      );
    }
  }, [providerAccounts, selectedProviderId]);

  useEffect(() => {
    if (!providerAccounts.length) {
      setBulkProviderId("");
      return;
    }

    if (providerAccounts.some((item) => item.id === bulkProviderId)) {
      return;
    }

    setBulkProviderId(
      providerAccounts.find((item) => item.isDefault)?.id ??
        providerAccounts[0].id,
    );
  }, [bulkProviderId, providerAccounts]);

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
  const bulkProviderAccount = useMemo(
    () => providerAccounts.find((item) => item.id === bulkProviderId) ?? null,
    [bulkProviderId, providerAccounts],
  );
  const providerBaseline = useMemo(
    () =>
      selectedProviderId === "new"
        ? emptyDraft
        : toDraft(selectedAccount ?? null),
    [selectedAccount, selectedProviderId],
  );
  const providerDirty = useMemo(
    () =>
      JSON.stringify(normalizeDraftForCompare(providerDraft)) !==
      JSON.stringify(normalizeDraftForCompare(providerBaseline)),
    [providerBaseline, providerDraft],
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
  const filteredModels = useMemo(() => {
    const normalizedSearch = modelSearch.trim().toLowerCase();

    return modelCatalog.filter((entry) => {
      if (modelStatusFilter !== "all" && entry.status !== modelStatusFilter) {
        return false;
      }
      if (!matchesCapability(entry, modelCapabilityFilter)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }

      return [
        entry.id,
        entry.label,
        entry.vendor,
        entry.providerFamily,
        entry.recommendedRoleName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [modelCapabilityFilter, modelCatalog, modelSearch, modelStatusFilter]);
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
  const roleBindingSummary = overviewQuery.data?.roleBindingSummary;

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
      if (selectedProviderId === "new") {
        setBulkProviderId(provider.id);
      }
      setSelectedProviderId(provider.id);
      await queryClient.invalidateQueries({
        queryKey: ["admin-inference-overview"],
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => adminApi.testInferenceProvider(providerDraft),
  });

  const diagnosticMutation = useMutation({
    mutationFn: (capability: InferenceDiagnosticCapability) =>
      adminApi.runInferenceDiagnostic(capability, {
        providerAccountId:
          selectedProviderId && selectedProviderId !== "new"
            ? selectedProviderId
            : undefined,
        prompt: "请只回复 ok。", // i18n-ignore-line: AI diagnostic prompt, not user-facing UI
      }),
    onSuccess: async (result) => {
      setDiagnosticResult(result);
      await queryClient.invalidateQueries({
        queryKey: ["admin-inference-multimodal-overview"],
      });
    },
  });

  const runAllDiagnosticMutation = useMutation({
    mutationFn: () =>
      adminApi.runAllInferenceDiagnostics({
        providerAccountId:
          selectedProviderId && selectedProviderId !== "new"
            ? selectedProviderId
            : undefined,
        prompt: "请只回复 ok。", // i18n-ignore-line: AI diagnostic prompt, not user-facing UI
      }),
    onSuccess: async (snapshot) => {
      setDiagnosticResult(snapshot.results.at(-1) ?? null);
      await queryClient.invalidateQueries({
        queryKey: ["admin-inference-multimodal-overview"],
      });
    },
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

  const installFamilyMutation = useMutation({
    mutationFn: (forceUpdateExisting: boolean) =>
      adminApi.installVendorFamilyPersonas({ forceUpdateExisting }),
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
        providerAccountId: bulkProviderId || undefined,
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
        providerAccountId: bulkProviderId || undefined,
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
  const canRunBulkAction = Boolean(bulkProviderId);
  const canInstallSelected = selectedModelIds.length > 0 && canRunBulkAction;
  const canRebindSelected = selectedModelIds.length > 0 && canRunBulkAction;

  const bulkTargetNotice = useMemo(() => {
    if (!bulkProviderAccount) {
      return {
        tone: "warning" as const,
        message: t(msg`当前没有可用的批量目标 Provider。`),
      };
    }

    if (!bulkProviderAccount.isEnabled) {
      return {
        tone: "warning" as const,
        message: t(msg`${bulkProviderAccount.name} 当前已停用，批量安装后角色仍会绑定到这个账户。`),
      };
    }

    if (!bulkProviderAccount.hasApiKey) {
      return {
        tone: "warning" as const,
        message: t(msg`${bulkProviderAccount.name} 尚未配置主 Key，绑定到它的角色后续仍无法实际调用。`),
      };
    }

    return {
      tone: "info" as const,
      message: t(msg`当前批量动作将写入 ${bulkProviderAccount.name}，不再跟随正在编辑的 Provider 自动切换。`),
    };
  }, [bulkProviderAccount]);

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
        eyebrow={t(msg`模型与路由`)}
        title={t(msg`模型路由运营工作台`)}
        description={t(msg`把默认路由检查、Provider 维护、模型人格批量处理拆成三个独立工作区，减少阅读负担，也避免编辑中的 Provider 误伤批量目标。`)}
        badges={[t(msg`默认路由`), t(msg`Provider 账户`), t(msg`模型人格`)]}
        metrics={[
          { label: t(msg`Provider 账户`), value: providerAccounts.length },
          { label: t(msg`启用中账户`), value: enabledProviderCount },
          { label: t(msg`活跃模型`), value: activeModelCount },
          { label: t(msg`支持 reasoning`), value: reasoningModelCount },
          {
            label: t(msg`模型人格角色`),
            value: roleBindingSummary?.modelPersonaCharacters ?? 0,
          },
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setWorkspaceTab("providers");
                setSelectedProviderId("new");
              }}
            >{t(msg`新建 Provider`)}</Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => setWorkspaceTab("models")}
            >{t(msg`打开模型人格工作区`)}</Button>
          </>
        }
      />

      {overviewQuery.isLoading ? (
        <AdminSkeletonCard rows={4} showAction />
      ) : null}
      {overviewQuery.isError && overviewQuery.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`模型路由工作台读取失败`)}
          detail={overviewQuery.error.message}
          onRetry={() => overviewQuery.refetch()}
        />
      ) : null}

      {saveMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title={t(msg`Provider 账户已保存`)}
          description={t(msg`配置已写入，并同步回默认兼容链路。`)}
        />
      ) : null}
      {testMutation.data ? (
        <AdminActionFeedback
          tone={testMutation.data.success ? "success" : "warning"}
          title={
            testMutation.data.success ? t(msg`连通性测试成功`) : t(msg`连通性测试失败`)
          }
          description={testMutation.data.message}
        />
      ) : null}
      {installSelectedMutation.data ? (
        <AdminActionFeedback
          tone="success"
          title={t(msg`选中模型人格处理完成`)}
          description={t(msg`新增 ${installSelectedMutation.data.installedCount} 个，更新 ${installSelectedMutation.data.updatedCount} 个，跳过 ${installSelectedMutation.data.skippedCount} 个。`)}
        />
      ) : null}
      {rebindMutation.data ? (
        <AdminActionFeedback
          tone={rebindMutation.data.missingCount > 0 ? "warning" : "success"}
          title={t(msg`模型人格角色换绑完成`)}
          description={t(msg`已更新 ${rebindMutation.data.updatedCount} 个，跳过 ${rebindMutation.data.skippedCount} 个，未安装 ${rebindMutation.data.missingCount} 个。`)}
        />
      ) : null}
      {installFamilyMutation.data ? (
        <AdminActionFeedback
          tone="success"
          title={t(msg`厂商家族角色处理完成`)}
          description={t(msg`新增 ${installFamilyMutation.data.installedCount} 个，更新 ${installFamilyMutation.data.updatedCount} 个，跳过 ${installFamilyMutation.data.skippedCount} 个。`)}
        />
      ) : null}
      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`保存 Provider 账户失败`)}
          detail={saveMutation.error.message}
          onRetry={() => saveMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}
      {testMutation.isError && testMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`连通性测试失败`)}
          detail={testMutation.error.message}
          onRetry={() => testMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}
      {diagnosticMutation.isError && diagnosticMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`单项诊断失败`)}
          detail={diagnosticMutation.error.message}
          onRetry={() => diagnosticMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}
      {runAllDiagnosticMutation.isError &&
      runAllDiagnosticMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`全量诊断失败`)}
          detail={runAllDiagnosticMutation.error.message}
          onRetry={() => runAllDiagnosticMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}
      {installSelectedMutation.isError &&
      installSelectedMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`选中模型人格安装失败`)}
          detail={installSelectedMutation.error.message}
          onRetry={() => installSelectedMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}
      {rebindMutation.isError && rebindMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`模型人格换绑失败`)}
          detail={rebindMutation.error.message}
          onRetry={() => rebindMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}
      {installFamilyMutation.isError &&
      installFamilyMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`厂商家族角色安装失败`)}
          detail={installFamilyMutation.error.message}
          onRetry={() => installFamilyMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}

      <AdminTabs
        tabs={WORKSPACE_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
        activeKey={workspaceTab}
        onChange={(key) => setWorkspaceTab(key as WorkspaceTab)}
      />

      {workspaceTab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title={t(msg`默认路由`)}
              actions={
                defaultProviderAccount ? (
                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      tone={
                        defaultProviderAccount.isEnabled
                          ? "healthy"
                          : "warning"
                      }
                    >
                      {defaultProviderAccount.isEnabled ? t(msg`启用中`) : t(msg`已停用`)}
                    </StatusPill>
                    <StatusPill
                      tone={
                        defaultProviderAccount.hasApiKey
                          ? "healthy"
                          : "warning"
                      }
                    >
                      {defaultProviderAccount.hasApiKey
                        ? t(msg`Key 已配置`)
                        : t(msg`缺少 Key`)}
                    </StatusPill>
                  </div>
                ) : (
                  <StatusPill tone="warning">{t(msg`未设置默认路由`)}</StatusPill>
                )
              }
            />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <AdminValueCard
                label={t(msg`默认 Provider`)}
                value={defaultProviderAccount?.name ?? t(msg`未设置`)}
              />
              <AdminValueCard
                label={t(msg`默认模型`)}
                value={defaultProviderAccount?.defaultModelId ?? t(msg`未设置`)}
              />
              <AdminValueCard
                label={t(msg`接口地址`)}
                value={
                  defaultProviderAccount
                    ? getEndpointLabel(defaultProviderAccount.endpoint)
                    : t(msg`未设置`)
                }
              />
              <AdminValueCard
                label={t(msg`最近更新时间`)}
                value={formatDateTime(defaultProviderAccount?.updatedAt)}
              />
            </div>
            <AdminSoftBox className="mt-4">
              {t(msg`默认账户会继续兼容旧版 /system/provider。切默认时，旧链路也会一起切换。`)}
            </AdminSoftBox>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title={t(msg`角色绑定概况`)}
              actions={
                <StatusPill
                  tone={
                    (roleBindingSummary?.boundCharacters ?? 0) > 0
                      ? "healthy"
                      : "muted"
                  }
                >
                  {t(msg`绑定率`)}{" "}
                  {roleBindingSummary && roleBindingSummary.totalCharacters > 0
                    ? `${Math.round(
                        (roleBindingSummary.boundCharacters /
                          roleBindingSummary.totalCharacters) *
                          100,
                      )}%`
                    : "—"}
                </StatusPill>
              }
            />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <AdminValueCard
                label={t(msg`角色总数`)}
                value={roleBindingSummary?.totalCharacters ?? 0}
              />
              <AdminValueCard
                label={t(msg`已绑定模型路由`)}
                value={roleBindingSummary?.boundCharacters ?? 0}
              />
              <AdminValueCard
                label={t(msg`模型人格角色`)}
                value={roleBindingSummary?.modelPersonaCharacters ?? 0}
              />
              <AdminValueCard
                label={t(msg`已配置主 Key 账户`)}
                value={t(msg`${providerWithApiKeyCount} 个`)}
              />
            </div>
            <AdminSoftBox className="mt-4">
              {t(msg`Hero 顶栏已经汇总账户与模型总数；这里只看与角色挂接相关的运营状态。`)}
            </AdminSoftBox>
          </Card>
        </div>
      ) : null}

      {workspaceTab === "providers" ? (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title={t(msg`账户列表`)}
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedProviderId("new")}
                >{t(msg`新建`)}</Button>
              }
            />
            <div className="mt-4 space-y-3">
              {providerAccounts.map((account) => (
                <AdminSelectableCard
                  key={account.id}
                  active={account.id === selectedProviderId}
                  title={account.name}
                  subtitle={account.defaultModelId}
                  meta={`${t(PROVIDER_MODE_LABELS[account.mode])} · ${getEndpointLabel(account.endpoint)}`}
                  activeLabel={t(msg`当前编辑`)}
                  onClick={() => setSelectedProviderId(account.id)}
                  badge={
                    <div className="flex flex-col items-end gap-2">
                      {account.isDefault ? (
                        <StatusPill tone="healthy">{t(msg`默认`)}</StatusPill>
                      ) : null}
                      <StatusPill
                        tone={account.isEnabled ? "healthy" : "warning"}
                      >
                        {account.isEnabled ? t(msg`启用`) : t(msg`停用`)}
                      </StatusPill>
                    </div>
                  }
                />
              ))}

              <AdminSelectableCard
                active={selectedProviderId === "new"}
                title={t(msg`新建 Provider 账户`)}
                subtitle={t(msg`不会自动切换默认路由`)}
                meta={t(msg`保存后才会进入账户池，也不会自动成为批量目标。`)}
                activeLabel={t(msg`当前新建`)}
                onClick={() => setSelectedProviderId("new")}
                badge={<StatusPill tone="muted">{t(msg`草稿`)}</StatusPill>}
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title={
                <div className="flex flex-col">
                  <span>
                    {selectedProviderId === "new"
                      ? t(msg`新建 Provider`)
                      : t(msg`编辑 Provider`)}
                  </span>
                  {selectedProviderId !== "new" && selectedAccount?.updatedAt ? (
                    <span className="mt-1 text-xs font-normal text-[color:var(--text-tertiary)]">
                      {t(msg`最近更新`)} {formatDateTime(selectedAccount.updatedAt)}
                    </span>
                  ) : null}
                </div>
              }
              actions={
                <div className="flex flex-wrap gap-2">
                  <AdminDraftStatusPill ready dirty={providerDirty} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => testMutation.mutate()}
                    disabled={!canSave || testMutation.isPending}
                  >
                    {testMutation.isPending ? t(msg`测试中...`) : t(msg`测试连接`)}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={!canSave || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? t(msg`保存中...`) : t(msg`保存`)}
                  </Button>
                  {selectedAccount && !selectedAccount.isDefault ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setDefaultMutation.mutate(selectedAccount.id)
                      }
                      disabled={setDefaultMutation.isPending}
                    >
                      {setDefaultMutation.isPending ? t(msg`切换中...`) : t(msg`设为默认`)}
                    </Button>
                  ) : null}
                </div>
              }
            />

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <AdminValueCard
                label={t(msg`主 Key`)}
                value={
                  selectedAccount?.hasApiKey || providerDraft.apiKey?.trim()
                    ? t(msg`已配置`)
                    : t(msg`未配置`)
                }
              />
              <AdminValueCard
                label={t(msg`转写 Key`)}
                value={
                  selectedAccount?.transcriptionHasApiKey ||
                  providerDraft.transcriptionApiKey?.trim()
                    ? t(msg`已配置`)
                    : t(msg`未配置`)
                }
              />
              <AdminValueCard
                label={t(msg`TTS Key`)}
                value={
                  selectedAccount?.ttsHasApiKey ||
                  providerDraft.ttsApiKey?.trim()
                    ? t(msg`已配置`)
                    : t(msg`未配置`)
                }
              />
              <AdminValueCard
                label={t(msg`图片生成 Key`)}
                value={
                  selectedAccount?.imageGenerationHasApiKey ||
                  providerDraft.imageGenerationApiKey?.trim()
                    ? t(msg`已配置`)
                    : t(msg`未配置`)
                }
              />
            </div>

            {selectedProviderId === "new" ? (
              <InlineNotice className="mt-4" tone="info">
                {t(msg`新建账户保存前不会成为默认路由，也不会自动成为模型人格的批量目标。`)}
              </InlineNotice>
            ) : null}
            {!canSave ? (
              <InlineNotice className="mt-4" tone="warning">
                {t(msg`账户名称、接口地址和默认模型 ID 必填。`)}
              </InlineNotice>
            ) : null}

            <section className="mt-5 space-y-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-elevated)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t(msg`真实多模态诊断`)}</div>
                  <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                    {t(msg`一键运行会写入最新快照，系统状态页只按这份真实诊断结果展示多模态就绪状态。`)}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => runAllDiagnosticMutation.mutate()}
                  disabled={
                    selectedProviderId === "new" ||
                    diagnosticMutation.isPending ||
                    runAllDiagnosticMutation.isPending
                  }
                >
                  {runAllDiagnosticMutation.isPending
                    ? t(msg`全量诊断中...`)
                    : t(msg`运行全部诊断`)}
                </Button>
              </div>
              <details className="group rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-xs">
                <summary className="cursor-pointer list-none select-none text-[color:var(--text-secondary)] [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-1">
                    <span className="transition group-open:rotate-90">▸</span>
                    {t(msg`按能力单独诊断`)}
                  </span>
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {DIAGNOSTIC_CAPABILITIES.map((item) => (
                    <Button
                      key={item.capability}
                      variant="secondary"
                      size="sm"
                      onClick={() => diagnosticMutation.mutate(item.capability)}
                      disabled={
                        selectedProviderId === "new" ||
                        diagnosticMutation.isPending ||
                        runAllDiagnosticMutation.isPending
                      }
                    >
                      {diagnosticMutation.isPending &&
                      diagnosticMutation.variables === item.capability
                        ? t(msg`诊断中...`)
                        : resolveDiagnosticCapabilityLabel(
                            item.capability,
                            item.label,
                          )}
                    </Button>
                  ))}
                </div>
              </details>
              {selectedProviderId === "new" ? (
                <InlineNotice tone="warning">
                  {t(msg`请先保存 Provider 账户，再进行真实通道诊断。`)}
                </InlineNotice>
              ) : null}
              {diagnosticResult ? (
                <InlineNotice
                  tone={
                    diagnosticResult.status === "ok"
                      ? "success"
                      : diagnosticResult.status === "unavailable"
                        ? "warning"
                        : "danger"
                  }
                >
                  {diagnosticResult.capability} · {diagnosticResult.status} ·{" "}
                  {diagnosticResult.real ? t(msg`真实可用`) : t(msg`未证明可用`)} ·{" "}
                  {resolveDiagnosticMessage(diagnosticResult.message)}
                </InlineNotice>
              ) : null}
              {multimodalOverviewQuery.data?.latestDiagnostics ? (
                <AdminSoftBox>
                  {t(msg`最近快照：`)}{formatDateTime(
                    multimodalOverviewQuery.data.latestDiagnostics.ranAt,
                  )}{" "}
                  {t(msg`· 真实可用`)}{" "}
                  {multimodalOverviewQuery.data.latestDiagnostics.summary.real}/
                  {multimodalOverviewQuery.data.latestDiagnostics.summary.total}
                  {t(msg`，失败`)}{" "}
                  {multimodalOverviewQuery.data.latestDiagnostics.summary.failed}
                  {t(msg`，不可用`)}{" "}
                  {
                    multimodalOverviewQuery.data.latestDiagnostics.summary
                      .unavailable
                  }
                </AdminSoftBox>
              ) : (
                <AdminSoftBox>{t(msg`尚未保存真实诊断快照。`)}</AdminSoftBox>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {(multimodalOverviewQuery.data?.capabilityMatrix ?? []).map(
                  (item) => (
                    <div
                      key={item.capability}
                      className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[color:var(--text-primary)]">
                            {resolveDiagnosticCapabilityLabel(
                              item.capability,
                              item.label,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-[color:var(--text-tertiary)]">
                            {item.model ?? item.providerName ?? t(msg`未绑定诊断结果`)}
                          </div>
                        </div>
                        <StatusPill
                          tone={resolveDiagnosticStatusTone(
                            item.status,
                            item.realReady,
                          )}
                        >
                          {resolveDiagnosticStatusLabel(
                            item.status,
                            item.realReady,
                          )}
                        </StatusPill>
                      </div>
                      <div className="mt-3 text-xs leading-5 text-[color:var(--text-secondary)]">
                        {resolveDiagnosticMessage(item.message)}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[color:var(--text-tertiary)]">
                        <span>{item.configured ? t(msg`已配置`) : t(msg`未配置`)}</span>
                        <span>{item.declared ? t(msg`已声明`) : t(msg`未声明`)}</span>
                        <span>
                          {item.lastCheckedAt
                            ? formatDateTime(item.lastCheckedAt)
                            : t(msg`未检查`)}
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>

            <div className="mt-5 space-y-5">
              <section className="space-y-4 border-t border-[color:var(--border-faint)] pt-5 first:border-t-0 first:pt-0">
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  {t(msg`基础接入`)}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label={t(msg`账户名称`)}
                    value={providerDraft.name ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        name: value,
                      }))
                    }
                  />
                  <Field
                    label={t(msg`默认模型 ID`)}
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
                    label={t(msg`接口地址`)}
                    value={providerDraft.endpoint ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        endpoint: value,
                      }))
                    }
                  />
                  <SelectField
                    label={t(msg`模式`)}
                    value={providerDraft.mode ?? "cloud"}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        mode: value as InferenceProviderAccountDraft["mode"],
                      }))
                    }
                    options={[
                      { value: "cloud", label: t(msg`云端模式`) },
                      { value: "local-compatible", label: t(msg`本地兼容`) },
                    ]}
                  />
                  <SelectField
                    label={t(msg`API 风格`)}
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
                        label: "Chat Completions", // i18n-ignore-line: admin technical label
                      },
                      { value: "openai-responses", label: "Responses" }, // i18n-ignore-line: admin technical label
                    ]}
                  />
                  <Field
                    label={t(msg`API Key`)}
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
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  {t(msg`语音能力`)}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label={t(msg`语音转写接口`)}
                    value={providerDraft.transcriptionEndpoint ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        transcriptionEndpoint: value,
                      }))
                    }
                  />
                  <Field
                    label={t(msg`语音转写模型`)}
                    value={providerDraft.transcriptionModel ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        transcriptionModel: value,
                      }))
                    }
                  />
                  <Field
                    label={t(msg`语音转写 Key`)}
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
                    label={t(msg`TTS 接口`)}
                    value={providerDraft.ttsEndpoint ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        ttsEndpoint: value,
                      }))
                    }
                  />
                  <Field
                    label={t(msg`TTS 模型`)}
                    value={providerDraft.ttsModel ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        ttsModel: value,
                      }))
                    }
                  />
                  <Field
                    label={t(msg`TTS Key`)}
                    type="password"
                    value={providerDraft.ttsApiKey ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        ttsApiKey: value,
                      }))
                    }
                  />
                  <Field
                    label={t(msg`TTS 音色`)}
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
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  {t(msg`图片回复能力`)}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label={t(msg`图片生成接口`)}
                    value={providerDraft.imageGenerationEndpoint ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        imageGenerationEndpoint: value,
                      }))
                    }
                  />
                  <Field
                    label={t(msg`图片生成模型`)}
                    value={providerDraft.imageGenerationModel ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        imageGenerationModel: value,
                      }))
                    }
                  />
                  <Field
                    label={t(msg`图片生成 Key`)}
                    type="password"
                    value={providerDraft.imageGenerationApiKey ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        imageGenerationApiKey: value,
                      }))
                    }
                  />
                </div>
              </section>

              <section className="space-y-4 border-t border-[color:var(--border-faint)] pt-5">
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  {t(msg`维护信息`)}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Toggle
                    label={t(msg`启用该账户`)}
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
                  label={t(msg`备注`)}
                  value={providerDraft.notes ?? ""}
                  onChange={(value) =>
                    setProviderDraft((current) => ({
                      ...current,
                      notes: value,
                    }))
                  }
                />
              </section>
            </div>
          </Card>
        </div>
      ) : null}

      {workspaceTab === "models" ? (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title={t(msg`批量动作`)}
              actions={
                <StatusPill tone={bulkProviderAccount ? "healthy" : "warning"}>
                  {bulkProviderAccount ? t(msg`目标已选择`) : t(msg`未选择目标`)}
                </StatusPill>
              }
            />

            <div className="mt-4 space-y-4">
              <SelectField
                label={t(msg`目标 Provider`)}
                value={bulkProviderId}
                onChange={setBulkProviderId}
                options={providerAccounts.map((account) => ({
                  value: account.id,
                  label: `${account.name}${account.isDefault ? t(msg`（默认）`) : ""}${account.isEnabled ? "" : t(msg`（停用）`)}`,
                }))}
              />

              <div className="grid gap-3">
                <AdminValueCard
                  label={t(msg`已选模型`)}
                  value={t(msg`${selectedModelIds.length} 个`)}
                />
                <AdminValueCard
                  label={t(msg`当前筛选结果`)}
                  value={t(msg`${filteredModels.length} 个`)}
                />
                <AdminValueCard
                  label={t(msg`目标模型`)}
                  value={bulkProviderAccount?.defaultModelId ?? t(msg`未选择`)}
                />
              </div>

              <InlineNotice tone={bulkTargetNotice.tone}>
                {bulkTargetNotice.message}
              </InlineNotice>

              <div className="space-y-3">
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onClick={() => installSelectedMutation.mutate(false)}
                  disabled={
                    !canInstallSelected || installSelectedMutation.isPending
                  }
                >
                  {installSelectedMutation.isPending
                    ? t(msg`安装中...`)
                    : t(msg`安装选中模型人格`)}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => installSelectedMutation.mutate(true)}
                  disabled={
                    !canInstallSelected || installSelectedMutation.isPending
                  }
                >
                  {installSelectedMutation.isPending
                    ? t(msg`刷新中...`)
                    : t(msg`覆盖刷新选中`)}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => rebindMutation.mutate()}
                  disabled={!canRebindSelected || rebindMutation.isPending}
                >
                  {rebindMutation.isPending ? t(msg`换绑中...`) : t(msg`换绑选中角色`)}
                </Button>
              </div>

              <div className="h-px bg-[color:var(--border-faint)]" />

              <div className="space-y-3">
                <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                  {t(msg`推荐：把 30+ 个旧模型人格折叠为 12 个厂商家族角色（OpenAI/Anthropic/Google/...），实际推理走全局默认 provider，提示词里模仿对应厂商风格。覆盖刷新会重建 system prompt。首次执行后请运行 scripts/migrate-model-persona-merge.mjs 把旧聊天记录迁到新角色。`)}
                </div>
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onClick={() => installFamilyMutation.mutate(false)}
                  disabled={installFamilyMutation.isPending}
                >
                  {installFamilyMutation.isPending
                    ? t(msg`安装中...`)
                    : t(msg`安装厂商家族角色 (12 个)`)}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => installFamilyMutation.mutate(true)}
                  disabled={installFamilyMutation.isPending}
                >
                  {installFamilyMutation.isPending
                    ? t(msg`刷新中...`)
                    : t(msg`覆盖刷新全部家族角色`)}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title={t(msg`模型目录`)}
              actions={
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone="muted">{t(msg`活跃`)} {activeModelCount}</StatusPill>
                  {previewModelCount > 0 ? (
                    <StatusPill tone="warning">
                      {t(msg`预览`)} {previewModelCount}
                    </StatusPill>
                  ) : null}
                  <StatusPill
                    tone={selectedModelIds.length > 0 ? "healthy" : "muted"}
                  >
                    {t(msg`已选`)} {selectedModelIds.length}
                  </StatusPill>
                </div>
              }
            />

            <div className="mt-4 space-y-3">
              <Field
                label={t(msg`搜索模型 / 角色名 / 厂商`)}
                value={modelSearch}
                onChange={setModelSearch}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <SelectField
                  label={t(msg`状态`)}
                  value={modelStatusFilter}
                  onChange={(value) =>
                    setModelStatusFilter(value as ModelStatusFilter)
                  }
                  options={MODEL_STATUS_FILTER_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                />
                <SelectField
                  label={t(msg`能力`)}
                  value={modelCapabilityFilter}
                  onChange={(value) =>
                    setModelCapabilityFilter(value as ModelCapabilityFilter)
                  }
                  options={MODEL_CAPABILITY_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleVisibleModelSelection}
                  disabled={visibleModelIds.length === 0}
                >
                  {visibleModelIds.length > 0 &&
                  selectedVisibleCount === visibleModelIds.length
                    ? t(msg`取消当前筛选`)
                    : t(msg`选中当前筛选`)}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedModelIds([])}
                  disabled={selectedModelIds.length === 0}
                >{t(msg`清空选择`)}</Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {filteredModels.map((entry) => {
                const selected = selectedModelIdSet.has(entry.id);

                return (
                  <div
                    key={entry.id}
                    className={`rounded-[20px] border px-4 py-4 shadow-[var(--shadow-soft)] ${
                      selected
                        ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)]"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{entry.defaultAvatar}</span>
                          <div className="truncate text-base font-semibold text-[color:var(--text-primary)]">
                            {entry.label}
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                          {entry.vendor} · {entry.providerFamily} ·{" "}
                          {t(REGION_LABELS[entry.region])}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusPill tone={resolveModelStatusTone(entry.status)}>
                          {t(MODEL_STATUS_LABELS[entry.status])}
                        </StatusPill>
                        <label className="inline-flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[color:var(--brand-primary)]"
                            checked={selected}
                            onChange={() => toggleModelSelection(entry.id)}
                          />{t(msg`选中`)}</label>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <AdminValueCard
                        label={t(msg`推荐角色`)}
                        value={entry.recommendedRoleName}
                      />
                      <AdminValueCard label={t(msg`模型 ID`)} value={entry.id} />
                    </div>

                    {entry.description ? (
                      <div className="mt-4 text-sm leading-6 text-[color:var(--text-secondary)]">
                        {entry.description}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {resolveCapabilityTags(entry).map((tag) => (
                        <StatusPill key={`${entry.id}-${tag}`} tone="muted">
                          {tag}
                        </StatusPill>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredModels.length === 0 ? (
              <div className="mt-4">
                <InlineNotice tone="warning">{t(msg`没有匹配的模型目录项。`)}</InlineNotice>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
