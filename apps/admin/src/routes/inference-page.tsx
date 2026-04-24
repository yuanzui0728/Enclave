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
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminCallout,
  AdminDraftStatusPill,
  AdminPageHero,
  AdminSectionHeader,
  AdminSelectableCard,
  AdminSelectField as SelectField,
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

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "overview", label: "总览" },
  { key: "providers", label: "Provider 账户" },
  { key: "models", label: "模型人格" },
];

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
  string
> = {
  cloud: "云端模式",
  "local-compatible": "本地兼容",
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

const MODEL_STATUS_FILTER_OPTIONS: Array<{
  value: ModelStatusFilter;
  label: string;
}> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "活跃" },
  { value: "preview", label: "预览" },
  { value: "legacy", label: "旧版" },
];

const MODEL_CAPABILITY_OPTIONS: Array<{
  value: ModelCapabilityFilter;
  label: string;
}> = [
  { value: "all", label: "全部能力" },
  { value: "reasoning", label: "reasoning" },
  { value: "vision", label: "vision" },
  { value: "audio", label: "audio" },
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
  label: string | RuntimeMessage;
}> = [
  { capability: "text", label: "文本" },
  { capability: "image_input", label: "图片理解" },
  { capability: "audio_input", label: msg`原生音频理解` },
  { capability: "transcription", label: "语音转写" },
  { capability: "tts", label: "TTS" },
  { capability: "image_generation", label: "图片生成" },
  { capability: "digital_human", label: "数字人" },
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
    return "真实可用";
  }
  if (status === "not_run") {
    return "未诊断";
  }
  if (status === "failed") {
    return "诊断失败";
  }
  if (status === "unavailable") {
    return "不可用";
  }
  return "未证明";
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
        prompt: "请只回复 ok。",
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
        prompt: "请只回复 ok。",
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

  const installMutation = useMutation({
    mutationFn: (forceUpdateExisting: boolean) =>
      adminApi.installModelPersonas({
        providerAccountId: bulkProviderId || undefined,
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

  const overviewLead = useMemo(() => {
    if (!defaultProviderAccount) {
      return {
        tone: "warning" as const,
        title: "先创建默认 Provider",
        description:
          "当前还没有默认路由。先创建一个可用账户，再做模型人格安装和角色换绑。",
      };
    }

    if (!defaultProviderAccount.isEnabled) {
      return {
        tone: "warning" as const,
        title: "默认路由已停用",
        description: `${defaultProviderAccount.name} 当前被停用。先恢复默认账户，再做后续批量动作。`,
      };
    }

    if (!defaultProviderAccount.hasApiKey) {
      return {
        tone: "warning" as const,
        title: "默认路由缺少主 Key",
        description: `${defaultProviderAccount.name} 还没有主 API Key。建议先补 Key 并做连通性测试。`,
      };
    }

    return {
      tone: "success" as const,
      title: "默认路由可用",
      description: `${defaultProviderAccount.name} 正在承接默认模型 ${defaultProviderAccount.defaultModelId}。可以继续维护 Provider，或进入模型人格工作区做批量安装和换绑。`,
    };
  }, [defaultProviderAccount]);

  const bulkTargetNotice = useMemo(() => {
    if (!bulkProviderAccount) {
      return {
        tone: "warning" as const,
        message: "当前没有可用的批量目标 Provider。",
      };
    }

    if (!bulkProviderAccount.isEnabled) {
      return {
        tone: "warning" as const,
        message: `${bulkProviderAccount.name} 当前已停用，批量安装后角色仍会绑定到这个账户。`,
      };
    }

    if (!bulkProviderAccount.hasApiKey) {
      return {
        tone: "warning" as const,
        message: `${bulkProviderAccount.name} 尚未配置主 Key，绑定到它的角色后续仍无法实际调用。`,
      };
    }

    return {
      tone: "info" as const,
      message: `当前批量动作将写入 ${bulkProviderAccount.name}，不再跟随正在编辑的 Provider 自动切换。`,
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
        eyebrow="模型与路由"
        title="模型路由运营工作台"
        description="把默认路由检查、Provider 维护、模型人格批量处理拆成三个独立工作区，减少阅读负担，也避免编辑中的 Provider 误伤批量目标。"
        badges={["默认路由", "Provider 账户", "模型人格"]}
        metrics={[
          { label: "Provider 账户", value: providerAccounts.length },
          { label: "启用中账户", value: enabledProviderCount },
          { label: "模型目录", value: modelCatalog.length },
          {
            label: "模型人格角色",
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
            >
              新建 Provider
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => setWorkspaceTab("models")}
            >
              打开模型人格工作区
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
          description="配置已写入，并同步回默认兼容链路。"
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
          title="全量模型人格处理完成"
          description={`新增 ${installMutation.data.installedCount} 个，更新 ${installMutation.data.updatedCount} 个，跳过 ${installMutation.data.skippedCount} 个。`}
        />
      ) : null}
      {installSelectedMutation.data ? (
        <AdminActionFeedback
          tone="success"
          title="选中模型人格处理完成"
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
      {diagnosticMutation.isError && diagnosticMutation.error instanceof Error ? (
        <ErrorBlock message={diagnosticMutation.error.message} />
      ) : null}
      {runAllDiagnosticMutation.isError &&
      runAllDiagnosticMutation.error instanceof Error ? (
        <ErrorBlock message={runAllDiagnosticMutation.error.message} />
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

      <AdminTabs
        tabs={WORKSPACE_TABS}
        activeKey={workspaceTab}
        onChange={(key) => setWorkspaceTab(key as WorkspaceTab)}
      />

      {workspaceTab === "overview" ? (
        <div className="space-y-6">
          <AdminCallout
            tone={overviewLead.tone}
            title={overviewLead.title}
            description={overviewLead.description}
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setWorkspaceTab("providers");
                    setSelectedProviderId(defaultProviderAccount?.id ?? "new");
                  }}
                >
                  维护 Provider
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setWorkspaceTab("models")}
                >
                  去做模型人格批量处理
                </Button>
              </>
            }
          />

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader
                title="默认路由"
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
                        {defaultProviderAccount.isEnabled ? "启用中" : "已停用"}
                      </StatusPill>
                      <StatusPill
                        tone={
                          defaultProviderAccount.hasApiKey
                            ? "healthy"
                            : "warning"
                        }
                      >
                        {defaultProviderAccount.hasApiKey
                          ? "Key 已配置"
                          : "缺少 Key"}
                      </StatusPill>
                    </div>
                  ) : (
                    <StatusPill tone="warning">未设置默认路由</StatusPill>
                  )
                }
              />
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <AdminValueCard
                  label="默认 Provider"
                  value={defaultProviderAccount?.name ?? "未设置"}
                />
                <AdminValueCard
                  label="默认模型"
                  value={defaultProviderAccount?.defaultModelId ?? "未设置"}
                />
                <AdminValueCard
                  label="接口地址"
                  value={
                    defaultProviderAccount
                      ? getEndpointLabel(defaultProviderAccount.endpoint)
                      : "未设置"
                  }
                />
                <AdminValueCard
                  label="最近更新时间"
                  value={formatDateTime(defaultProviderAccount?.updatedAt)}
                />
              </div>
              <AdminSoftBox className="mt-4">
                默认账户会继续兼容旧版
                `/system/provider`。切默认时，旧链路也会一起切换。
              </AdminSoftBox>
            </Card>

            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader title="快捷操作" />
              <div className="mt-4 grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceTab("providers");
                    setSelectedProviderId(defaultProviderAccount?.id ?? "new");
                  }}
                  className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
                >
                  <div className="font-semibold text-[color:var(--text-primary)]">
                    维护默认 Provider
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                    直接进入账户编辑，做保存、测试和设默认。
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceTab("providers");
                    setSelectedProviderId("new");
                  }}
                  className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
                >
                  <div className="font-semibold text-[color:var(--text-primary)]">
                    新建一个额外 Provider
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                    录入新账户，不影响当前默认路由。
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceTab("models")}
                  className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
                >
                  <div className="font-semibold text-[color:var(--text-primary)]">
                    批量处理模型人格
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                    先选目标 Provider，再安装、覆盖刷新或换绑。
                  </div>
                </button>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader title="Provider 池概况" />
              <div className="mt-4 grid gap-3">
                <AdminValueCard
                  label="账户总数"
                  value={providerAccounts.length}
                />
                <AdminValueCard
                  label="启用中"
                  value={`${enabledProviderCount} 个`}
                />
                <AdminValueCard
                  label="已配置主 Key"
                  value={`${providerWithApiKeyCount} 个`}
                />
              </div>
            </Card>

            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader title="模型目录概况" />
              <div className="mt-4 grid gap-3">
                <AdminValueCard label="目录总数" value={modelCatalog.length} />
                <AdminValueCard
                  label="活跃模型"
                  value={`${activeModelCount} 个`}
                />
                <AdminValueCard
                  label="预览模型"
                  value={`${previewModelCount} 个`}
                />
                <AdminValueCard
                  label="支持 reasoning"
                  value={`${reasoningModelCount} 个`}
                />
              </div>
            </Card>

            <Card className="bg-[color:var(--surface-console)]">
              <AdminSectionHeader title="角色绑定概况" />
              <div className="mt-4 grid gap-3">
                <AdminValueCard
                  label="角色总数"
                  value={roleBindingSummary?.totalCharacters ?? 0}
                />
                <AdminValueCard
                  label="已绑定模型路由"
                  value={roleBindingSummary?.boundCharacters ?? 0}
                />
                <AdminValueCard
                  label="模型人格角色"
                  value={roleBindingSummary?.modelPersonaCharacters ?? 0}
                />
                <AdminValueCard
                  label="当前批量目标"
                  value={bulkProviderAccount?.name ?? "未选择"}
                />
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {workspaceTab === "providers" ? (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="账户列表"
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedProviderId("new")}
                >
                  新建
                </Button>
              }
            />
            <div className="mt-4 space-y-3">
              {providerAccounts.map((account) => (
                <AdminSelectableCard
                  key={account.id}
                  active={account.id === selectedProviderId}
                  title={account.name}
                  subtitle={account.defaultModelId}
                  meta={`${PROVIDER_MODE_LABELS[account.mode]} · ${getEndpointLabel(account.endpoint)}`}
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
                    </div>
                  }
                />
              ))}

              <AdminSelectableCard
                active={selectedProviderId === "new"}
                title="新建 Provider 账户"
                subtitle="不会自动切换默认路由"
                meta="保存后才会进入账户池，也不会自动成为批量目标。"
                activeLabel="当前新建"
                onClick={() => setSelectedProviderId("new")}
                badge={<StatusPill tone="muted">草稿</StatusPill>}
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title={
                selectedProviderId === "new" ? "新建 Provider" : "编辑 Provider"
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
                    {testMutation.isPending ? "测试中..." : "测试连接"}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={!canSave || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? "保存中..." : "保存"}
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
                      {setDefaultMutation.isPending ? "切换中..." : "设为默认"}
                    </Button>
                  ) : null}
                </div>
              }
            />

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <AdminValueCard
                label="状态"
                value={(providerDraft.isEnabled ?? true) ? "启用中" : "停用中"}
              />
              <AdminValueCard
                label="主 Key"
                value={
                  selectedAccount?.hasApiKey || providerDraft.apiKey?.trim()
                    ? "已配置"
                    : "未配置"
                }
              />
              <AdminValueCard
                label="转写 Key"
                value={
                  selectedAccount?.transcriptionHasApiKey ||
                  providerDraft.transcriptionApiKey?.trim()
                    ? "已配置"
                    : "未配置"
                }
              />
              <AdminValueCard
                label="TTS Key"
                value={
                  selectedAccount?.ttsHasApiKey ||
                  providerDraft.ttsApiKey?.trim()
                    ? "已配置"
                    : "未配置"
                }
              />
              <AdminValueCard
                label="图片生成 Key"
                value={
                  selectedAccount?.imageGenerationHasApiKey ||
                  providerDraft.imageGenerationApiKey?.trim()
                    ? "已配置"
                    : "未配置"
                }
              />
              <AdminValueCard
                label="最近更新时间"
                value={formatDateTime(selectedAccount?.updatedAt)}
              />
            </div>

            {selectedProviderId === "new" ? (
              <InlineNotice className="mt-4" tone="info">
                新建账户保存前不会成为默认路由，也不会自动成为模型人格的批量目标。
              </InlineNotice>
            ) : null}
            {!canSave ? (
              <InlineNotice className="mt-4" tone="warning">
                账户名称、接口地址和默认模型 ID 必填。
              </InlineNotice>
            ) : null}

            <section className="mt-5 space-y-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-elevated)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                    真实多模态诊断
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                    一键运行会写入最新快照，系统状态页只按这份真实诊断结果展示多模态就绪状态。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
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
                      ? "全量诊断中..."
                      : "运行全部诊断"}
                  </Button>
                  {DIAGNOSTIC_CAPABILITIES.map((item) => (
                    <Button
                      key={item.capability}
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        diagnosticMutation.mutate(item.capability)
                      }
                      disabled={
                        selectedProviderId === "new" ||
                        diagnosticMutation.isPending ||
                        runAllDiagnosticMutation.isPending
                      }
                    >
                      {diagnosticMutation.isPending &&
                      diagnosticMutation.variables === item.capability
                        ? "诊断中..."
                        : resolveDiagnosticCapabilityLabel(
                            item.capability,
                            item.label,
                          )}
                    </Button>
                  ))}
                </div>
              </div>
              {selectedProviderId === "new" ? (
                <InlineNotice tone="warning">
                  请先保存 Provider 账户，再进行真实通道诊断。
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
                  {diagnosticResult.real ? "真实可用" : "未证明可用"} ·{" "}
                  {resolveDiagnosticMessage(diagnosticResult.message)}
                </InlineNotice>
              ) : null}
              {multimodalOverviewQuery.data?.latestDiagnostics ? (
                <AdminSoftBox>
                  最近快照：{formatDateTime(
                    multimodalOverviewQuery.data.latestDiagnostics.ranAt,
                  )}{" "}
                  · 真实可用{" "}
                  {multimodalOverviewQuery.data.latestDiagnostics.summary.real}/
                  {multimodalOverviewQuery.data.latestDiagnostics.summary.total}
                  ，失败{" "}
                  {multimodalOverviewQuery.data.latestDiagnostics.summary.failed}
                  ，不可用{" "}
                  {
                    multimodalOverviewQuery.data.latestDiagnostics.summary
                      .unavailable
                  }
                </AdminSoftBox>
              ) : (
                <AdminSoftBox>尚未保存真实诊断快照。</AdminSoftBox>
              )}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                            {item.model ?? item.providerName ?? "未绑定诊断结果"}
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
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-tertiary)]">
                        <span>{item.configured ? "已配置" : "未配置"}</span>
                        <span>{item.declared ? "已声明" : "未声明"}</span>
                        <span>
                          {item.lastCheckedAt
                            ? formatDateTime(item.lastCheckedAt)
                            : "未检查"}
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
                  基础接入
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="账户名称"
                    value={providerDraft.name ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        name: value,
                      }))
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
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  语音能力
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
                    label="TTS 接口"
                    value={providerDraft.ttsEndpoint ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        ttsEndpoint: value,
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
                    label="TTS Key"
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
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  图片回复能力
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="图片生成接口"
                    value={providerDraft.imageGenerationEndpoint ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        imageGenerationEndpoint: value,
                      }))
                    }
                  />
                  <Field
                    label="图片生成模型"
                    value={providerDraft.imageGenerationModel ?? ""}
                    onChange={(value) =>
                      setProviderDraft((current) => ({
                        ...current,
                        imageGenerationModel: value,
                      }))
                    }
                  />
                  <Field
                    label="图片生成 Key"
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
                  维护信息
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
              title="批量动作"
              actions={
                <StatusPill tone={bulkProviderAccount ? "healthy" : "warning"}>
                  {bulkProviderAccount ? "目标已选择" : "未选择目标"}
                </StatusPill>
              }
            />

            <div className="mt-4 space-y-4">
              <SelectField
                label="目标 Provider"
                value={bulkProviderId}
                onChange={setBulkProviderId}
                options={providerAccounts.map((account) => ({
                  value: account.id,
                  label: `${account.name}${account.isDefault ? "（默认）" : ""}${account.isEnabled ? "" : "（停用）"}`,
                }))}
              />

              <div className="grid gap-3">
                <AdminValueCard
                  label="已选模型"
                  value={`${selectedModelIds.length} 个`}
                />
                <AdminValueCard
                  label="当前筛选结果"
                  value={`${filteredModels.length} 个`}
                />
                <AdminValueCard
                  label="目标模型"
                  value={bulkProviderAccount?.defaultModelId ?? "未选择"}
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
                    ? "安装中..."
                    : "安装选中模型人格"}
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
                    ? "刷新中..."
                    : "覆盖刷新选中"}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => rebindMutation.mutate()}
                  disabled={!canRebindSelected || rebindMutation.isPending}
                >
                  {rebindMutation.isPending ? "换绑中..." : "换绑选中角色"}
                </Button>
              </div>

              <div className="h-px bg-[color:var(--border-faint)]" />

              <div className="space-y-3">
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => installMutation.mutate(false)}
                  disabled={!canRunBulkAction || installMutation.isPending}
                >
                  {installMutation.isPending ? "安装中..." : "安装全部模型人格"}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => installMutation.mutate(true)}
                  disabled={!canRunBulkAction || installMutation.isPending}
                >
                  {installMutation.isPending ? "刷新中..." : "覆盖刷新全部"}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="模型目录"
              actions={
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone="muted">活跃 {activeModelCount}</StatusPill>
                  {previewModelCount > 0 ? (
                    <StatusPill tone="warning">
                      预览 {previewModelCount}
                    </StatusPill>
                  ) : null}
                  <StatusPill
                    tone={selectedModelIds.length > 0 ? "healthy" : "muted"}
                  >
                    已选 {selectedModelIds.length}
                  </StatusPill>
                </div>
              }
            />

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto_auto]">
              <Field
                label="搜索模型 / 角色名 / 厂商"
                value={modelSearch}
                onChange={setModelSearch}
              />
              <SelectField
                label="状态"
                value={modelStatusFilter}
                onChange={(value) =>
                  setModelStatusFilter(value as ModelStatusFilter)
                }
                options={MODEL_STATUS_FILTER_OPTIONS}
              />
              <SelectField
                label="能力"
                value={modelCapabilityFilter}
                onChange={(value) =>
                  setModelCapabilityFilter(value as ModelCapabilityFilter)
                }
                options={MODEL_CAPABILITY_OPTIONS}
              />
              <div className="flex items-end">
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
              </div>
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedModelIds([])}
                  disabled={selectedModelIds.length === 0}
                >
                  清空选择
                </Button>
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
                          {REGION_LABELS[entry.region]}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusPill tone={resolveModelStatusTone(entry.status)}>
                          {MODEL_STATUS_LABELS[entry.status]}
                        </StatusPill>
                        <label className="inline-flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[color:var(--brand-primary)]"
                            checked={selected}
                            onChange={() => toggleModelSelection(entry.id)}
                          />
                          选中
                        </label>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <AdminValueCard
                        label="推荐角色"
                        value={entry.recommendedRoleName}
                      />
                      <AdminValueCard label="模型 ID" value={entry.id} />
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
                <InlineNotice tone="warning">
                  没有匹配的模型目录项。
                </InlineNotice>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
