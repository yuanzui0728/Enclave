import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type {
  ActionConnectorDiscoveryResult,
  ActionConnectorSummary,
  ActionConnectorTestResult,
  ActionRiskLevel,
  ActionRunDetail,
  ActionRunSummary,
  ActionRuntimeOverview,
  ActionRuntimeRules,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminCallout,
  AdminCodeBlock,
  AdminDraftStatusPill,
  AdminEmptyState,
  AdminInfoRows,
  AdminMiniPanel,
  AdminPageHero,
  AdminRecordCard,
  AdminSectionHeader,
  AdminSelectableCard,
  AdminSoftBox,
  AdminSubTabs,
  AdminTabs,
  AdminTextArea,
  AdminTextField,
  AdminToggle,
  AdminValueCard,
  AdminSelectField,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import {
  compareAdminText,
  formatAdminDateTime as formatLocalizedDateTime,
} from "../lib/format";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

type WorkspaceTab =
  | "overview"
  | "rules"
  | "preview"
  | "connectors"
  | "evidence";
type RulesTab = "policy" | "prompts";
type EvidenceTab = "all" | "attention" | "completed";

type ConnectorDraft = {
  displayName: string;
  discoveryQuery: string;
  endpointConfigText: string;
  testMessage: string;
  credential: string;
};

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: ReturnType<typeof msg> }> = [
  { key: "overview", label: msg`运营总览` },
  { key: "rules", label: msg`规则编辑` },
  { key: "preview", label: msg`消息预演` },
  { key: "connectors", label: msg`连接器编排` },
  { key: "evidence", label: msg`执行证据` },
];

const RULE_TABS: Array<{ key: RulesTab; label: ReturnType<typeof msg> }> = [
  { key: "policy", label: msg`门控策略` },
  { key: "prompts", label: msg`提示模板` },
];

// i18n-ignore-start: sample demo data for action planner preview
const PREVIEW_EXAMPLES = [
  {
    label: msg`智能家居`,
    message: "帮我把客厅空调调到 24 度，风速调成自动。",
  },
  {
    label: msg`轻食外卖`,
    message: "今晚帮我点个 40 块以内的轻食外卖。",
  },
  {
    label: msg`信息查询`,
    message: "帮我看看今天上海天气，顺便告诉我适不适合出门。",
  },
];
// i18n-ignore-end

const RISK_LEVEL_OPTIONS: Array<{
  value: ActionRiskLevel;
  label: ReturnType<typeof msg>;
  description: ReturnType<typeof msg>;
}> = [
  {
    value: "read_only",
    label: msg`只读`,
    description: msg`只整理候选、查询信息，不直接产生副作用。`,
  },
  {
    value: "reversible_low_risk",
    label: msg`低风险可逆`,
    description: msg`例如智能家居状态调整，可自动执行但仍需留痕。`,
  },
  {
    value: "cost_or_irreversible",
    label: msg`付费/不可逆`,
    description: msg`涉及下单、预订、付款，默认必须确认。`,
  },
];

const PLANNER_MODE_OPTIONS: Array<{
  value: ActionRuntimeRules["plannerMode"];
  label: ReturnType<typeof msg>;
}> = [
  {
    value: "llm_with_heuristic_fallback",
    label: msg`LLM 优先，失败回退规则`,
  },
  {
    value: "llm",
    label: msg`纯 LLM planner`,
  },
  {
    value: "heuristic",
    label: msg`纯规则 planner`,
  },
];

export function ActionRuntimePage() {
  const t = translateRuntimeMessage;
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [rulesTab, setRulesTab] = useState<RulesTab>("policy");
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>("attention");
  const [rulesDraft, setRulesDraft] = useState<ActionRuntimeRules | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedConnectorId, setSelectedConnectorId] = useState("");
  const [connectorDrafts, setConnectorDrafts] = useState<
    Record<string, ConnectorDraft>
  >({});
  const [connectorDraftErrors, setConnectorDraftErrors] = useState<
    Record<string, string>
  >({});
  const [connectorDraftFeedbacks, setConnectorDraftFeedbacks] = useState<
    Record<string, string>
  >({});
  const [connectorTestResults, setConnectorTestResults] = useState<
    Record<string, ActionConnectorTestResult>
  >({});
  const [connectorDiscoveryResults, setConnectorDiscoveryResults] = useState<
    Record<string, ActionConnectorDiscoveryResult>
  >({});
  const [runActionFeedback, setRunActionFeedback] = useState<string | null>(
    null,
  );

  const overviewQuery = useQuery({
    queryKey: ["admin-action-runtime-overview", baseUrl],
    queryFn: () => adminApi.getActionRuntimeOverview(),
  });

  const rawConnectors = overviewQuery.data?.connectors ?? [];
  const sortedConnectors = useMemo(
    () => sortConnectorsForOps(rawConnectors),
    [rawConnectors],
  );
  const rawRecentRuns = overviewQuery.data?.recentRuns ?? [];
  const attentionRuns = useMemo(
    () => filterActionRuns(rawRecentRuns, "attention"),
    [rawRecentRuns],
  );
  const completedRuns = useMemo(
    () => filterActionRuns(rawRecentRuns, "completed"),
    [rawRecentRuns],
  );
  const visibleRuns = useMemo(
    () => filterActionRuns(rawRecentRuns, evidenceTab),
    [rawRecentRuns, evidenceTab],
  );

  useEffect(() => {
    if (!overviewQuery.data) {
      return;
    }
    setRulesDraft((current) => current ?? overviewQuery.data.rules);
    setConnectorDrafts((current) =>
      syncConnectorDrafts(current, overviewQuery.data.connectors),
    );
  }, [overviewQuery.data]);

  useEffect(() => {
    if (!sortedConnectors.length) {
      if (selectedConnectorId) {
        setSelectedConnectorId("");
      }
      return;
    }
    if (
      !selectedConnectorId ||
      !sortedConnectors.some(
        (connector) => connector.id === selectedConnectorId,
      )
    ) {
      setSelectedConnectorId(sortedConnectors[0].id);
    }
  }, [sortedConnectors, selectedConnectorId]);

  useEffect(() => {
    if (!rawRecentRuns.length) {
      if (selectedRunId) {
        setSelectedRunId("");
      }
      return;
    }
    if (
      !selectedRunId ||
      !rawRecentRuns.some((run) => run.id === selectedRunId)
    ) {
      setSelectedRunId(rawRecentRuns[0].id);
    }
  }, [rawRecentRuns, selectedRunId]);

  useEffect(() => {
    if (!visibleRuns.length) {
      return;
    }
    if (!visibleRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(visibleRuns[0].id);
    }
  }, [visibleRuns, selectedRunId]);

  const runDetailQuery = useQuery({
    queryKey: ["admin-action-runtime-run", baseUrl, selectedRunId],
    queryFn: () => adminApi.getActionRuntimeRun(selectedRunId),
    enabled: Boolean(selectedRunId),
  });

  const saveRulesMutation = useMutation({
    mutationFn: (payload: ActionRuntimeRules) =>
      adminApi.setActionRuntimeRules(payload),
    onSuccess: (nextRules) => {
      setRulesDraft(nextRules);
      void queryClient.invalidateQueries({
        queryKey: ["admin-action-runtime-overview", baseUrl],
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: (message: string) => adminApi.previewActionRuntime(message),
  });

  const saveConnectorMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      displayName: string;
      endpointConfig: Record<string, unknown> | null;
      credential?: string | null;
      clearCredential?: boolean;
    }) =>
      adminApi.updateActionRuntimeConnector(payload.id, {
        displayName: payload.displayName,
        endpointConfig: payload.endpointConfig,
        credential: payload.credential,
        clearCredential: payload.clearCredential,
      }),
    onSuccess: (connector) => {
      setConnectorDraftErrors((current) => {
        const next: Record<string, string> = { ...current };
        delete next[connector.id];
        return next;
      });
      setConnectorDrafts((current) => ({
        ...current,
        [connector.id]: {
          ...(current[connector.id] ?? createConnectorDraft(connector)),
          displayName: connector.displayName,
          endpointConfigText: formatEndpointConfig(
            connector.endpointConfig ?? null,
          ),
          credential: "",
        },
      }));
      void queryClient.invalidateQueries({
        queryKey: ["admin-action-runtime-overview", baseUrl],
      });
    },
  });

  const toggleConnectorStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: "disabled" | "ready" }) =>
      adminApi.updateActionRuntimeConnector(payload.id, {
        status: payload.status,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-action-runtime-overview", baseUrl],
      });
    },
  });

  const testConnectorMutation = useMutation({
    mutationFn: (payload: { id: string; sampleMessage?: string | null }) =>
      adminApi.testActionRuntimeConnector(payload.id, {
        sampleMessage: payload.sampleMessage?.trim() || null,
      }),
    onSuccess: (result, variables) => {
      setConnectorTestResults((current) => ({
        ...current,
        [variables.id]: result,
      }));
      void queryClient.invalidateQueries({
        queryKey: ["admin-action-runtime-overview", baseUrl],
      });
    },
  });

  const discoverConnectorMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      query?: string | null;
      limit?: number | null;
      endpointConfig?: Record<string, unknown> | null;
      credential?: string | null;
    }) =>
      adminApi.discoverActionRuntimeConnector(payload.id, {
        query: payload.query?.trim() || null,
        limit: payload.limit ?? null,
        endpointConfig: payload.endpointConfig ?? null,
        credential: payload.credential ?? null,
      }),
    onSuccess: (result, variables) => {
      setConnectorDiscoveryResults((current) => ({
        ...current,
        [variables.id]: result,
      }));
    },
  });

  const retryRunMutation = useMutation({
    mutationFn: (id: string) => adminApi.retryActionRuntimeRun(id),
    onSuccess: (result) => {
      setRunActionFeedback(
        t(msg`已触发动作重试，当前阶段：${translateRunRetryStep(result.nextStep)}。`),
      );
      setSelectedRunId(result.run.id);
      setWorkspaceTab("evidence");
      setEvidenceTab("attention");
      void queryClient.invalidateQueries({
        queryKey: ["admin-action-runtime-overview", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin-action-runtime-run", baseUrl, result.run.id],
      });
    },
  });

  const isRulesDirty = useMemo(() => {
    if (!rulesDraft || !overviewQuery.data) {
      return false;
    }
    return (
      JSON.stringify(rulesDraft) !== JSON.stringify(overviewQuery.data.rules)
    );
  }, [overviewQuery.data, rulesDraft]);

  if (overviewQuery.isLoading) {
    return <LoadingBlock label={t(msg`正在读取 Action Runtime...`)} />;
  }

  if (overviewQuery.isError && overviewQuery.error instanceof Error) {
    return <ErrorBlock message={overviewQuery.error.message} />;
  }

  if (!overviewQuery.data || !rulesDraft) {
    return (
      <AdminEmptyState
        title={t(msg`Action Runtime 暂不可用`)}
        description={t(msg`稍后再刷新一次；如果持续为空，先检查后端 action-runtime 模块是否已成功加载。`)}
      />
    );
  }

  const overview = overviewQuery.data;
  const selectedConnector =
    sortedConnectors.find(
      (connector) => connector.id === selectedConnectorId,
    ) ?? null;
  const selectedConnectorDraft = selectedConnector
    ? (connectorDrafts[selectedConnector.id] ??
      createConnectorDraft(selectedConnector))
    : null;
  const selectedConnectorError = selectedConnector
    ? connectorDraftErrors[selectedConnector.id]
    : null;
  const selectedConnectorFeedback = selectedConnector
    ? (connectorDraftFeedbacks[selectedConnector.id] ?? null)
    : null;
  const selectedConnectorTestResult = selectedConnector
    ? (connectorTestResults[selectedConnector.id] ?? null)
    : null;
  const selectedConnectorDiscoveryResult = selectedConnector
    ? (connectorDiscoveryResults[selectedConnector.id] ?? null)
    : null;
  const selectedConnectorDirty =
    selectedConnector && selectedConnectorDraft
      ? isConnectorDirty(selectedConnector, selectedConnectorDraft)
      : false;
  const selectedConnectorSaving =
    selectedConnector &&
    saveConnectorMutation.isPending &&
    saveConnectorMutation.variables?.id === selectedConnector.id;
  const selectedConnectorToggling =
    selectedConnector &&
    toggleConnectorStatusMutation.isPending &&
    toggleConnectorStatusMutation.variables?.id === selectedConnector.id;
  const selectedConnectorTesting =
    selectedConnector &&
    testConnectorMutation.isPending &&
    testConnectorMutation.variables?.id === selectedConnector.id;
  const selectedConnectorDiscovering =
    selectedConnector &&
    discoverConnectorMutation.isPending &&
    discoverConnectorMutation.variables?.id === selectedConnector.id;

  const operatorSummary = buildActionOperatorSummary(
    overview,
    sortedConnectors,
  );
  const errorConnectors = sortedConnectors.filter(
    (connector) => connector.status === "error",
  );
  const latestRun = rawRecentRuns[0] ?? null;
  const evidenceTabs: Array<{ key: EvidenceTab; label: string }> = [
    { key: "all", label: t(msg`全部运行 (${rawRecentRuns.length})`) },
    { key: "attention", label: t(msg`待处理 (${attentionRuns.length})`) },
    { key: "completed", label: t(msg`已完成 (${completedRuns.length})`) },
  ];

  function resetRulesDraft() {
    setRulesDraft(overview.rules);
  }

  function patchRules(
    updater: (current: ActionRuntimeRules) => ActionRuntimeRules,
  ) {
    setRulesDraft((current) => (current ? updater(current) : current));
  }

  function setPromptTemplate(
    key: keyof ActionRuntimeRules["promptTemplates"],
    value: string,
  ) {
    patchRules((current) => ({
      ...current,
      promptTemplates: {
        ...current.promptTemplates,
        [key]: value,
      },
    }));
  }

  function setPolicyValue<K extends keyof ActionRuntimeRules["policy"]>(
    key: K,
    value: ActionRuntimeRules["policy"][K],
  ) {
    patchRules((current) => ({
      ...current,
      policy: {
        ...current.policy,
        [key]: value,
      },
    }));
  }

  function toggleRiskLevel(level: ActionRiskLevel) {
    patchRules((current) => {
      const hasLevel = current.policy.autoExecuteRiskLevels.includes(level);
      return {
        ...current,
        policy: {
          ...current.policy,
          autoExecuteRiskLevels: hasLevel
            ? current.policy.autoExecuteRiskLevels.filter(
                (item) => item !== level,
              )
            : [...current.policy.autoExecuteRiskLevels, level],
        },
      };
    });
  }

  function updateConnectorDraft(id: string, patch: Partial<ConnectorDraft>) {
    setConnectorDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {
          displayName: "",
          discoveryQuery: "",
          endpointConfigText: "",
          testMessage: "",
          credential: "",
        }),
        ...patch,
      },
    }));
    setConnectorDraftErrors((current) => {
      const next: Record<string, string> = { ...current };
      delete next[id];
      return next;
    });
    setConnectorDraftFeedbacks((current) => {
      const next: Record<string, string> = { ...current };
      delete next[id];
      return next;
    });
  }

  function handleSaveConnector(connector: ActionConnectorSummary) {
    const draft =
      connectorDrafts[connector.id] ?? createConnectorDraft(connector);
    const parsed = parseEndpointConfig(draft.endpointConfigText);
    if (parsed.error) {
      const errorMessage = parsed.error ?? "Endpoint Config 无法解析。"; // i18n-ignore-line: admin technical error fallback
      setConnectorDraftErrors((current) => ({
        ...current,
        [connector.id]: errorMessage,
      }));
      return;
    }

    saveConnectorMutation.mutate({
      id: connector.id,
      displayName: draft.displayName.trim() || connector.displayName,
      endpointConfig: parsed.value,
      credential: draft.credential.trim() || null,
    });
  }

  function handleClearConnectorCredential(connector: ActionConnectorSummary) {
    const draft =
      connectorDrafts[connector.id] ?? createConnectorDraft(connector);
    const parsed = parseEndpointConfig(draft.endpointConfigText);
    if (parsed.error) {
      const errorMessage = parsed.error ?? "Endpoint Config 无法解析。"; // i18n-ignore-line: admin technical error fallback
      setConnectorDraftErrors((current) => ({
        ...current,
        [connector.id]: errorMessage,
      }));
      return;
    }

    saveConnectorMutation.mutate({
      id: connector.id,
      displayName: draft.displayName.trim() || connector.displayName,
      endpointConfig: parsed.value,
      credential: null,
      clearCredential: true,
    });
  }

  async function handleDiscoverConnector(connector: ActionConnectorSummary) {
    const draft =
      connectorDrafts[connector.id] ?? createConnectorDraft(connector);
    const parsed = parseEndpointConfig(draft.endpointConfigText);
    if (parsed.error) {
      const errorMessage = parsed.error ?? "Endpoint Config 无法解析。"; // i18n-ignore-line: admin technical error fallback
      setConnectorDraftErrors((current) => ({
        ...current,
        [connector.id]: errorMessage,
      }));
      return;
    }

    try {
      await discoverConnectorMutation.mutateAsync({
        id: connector.id,
        query: draft.discoveryQuery,
        limit: 30,
        endpointConfig: parsed.value,
        credential: draft.credential.trim() || null,
      });
    } catch {
      return;
    }
  }

  function applyHomeAssistantTargetSuggestion(
    connector: ActionConnectorSummary,
    suggestion: ActionConnectorDiscoveryResult["items"][number],
  ) {
    applyHomeAssistantTargetSuggestions(connector, [suggestion], "all");
  }

  function applyHomeAssistantTargetSuggestions(
    connector: ActionConnectorSummary,
    suggestions: ActionConnectorDiscoveryResult["items"],
    mode: "all" | "missing",
  ) {
    const draft =
      connectorDrafts[connector.id] ?? createConnectorDraft(connector);
    const parsed = parseEndpointConfig(draft.endpointConfigText);
    if (parsed.error) {
      const errorMessage = parsed.error ?? "Endpoint Config 无法解析。"; // i18n-ignore-line: admin technical error fallback
      setConnectorDraftErrors((current) => ({
        ...current,
        [connector.id]: errorMessage,
      }));
      return;
    }

    const currentConfig = parsed.value ?? {};
    const mergeResult = mergeHomeAssistantTargetSuggestions({
      currentConfig,
      suggestions,
      mode,
    });
    if (mergeResult.appliedCount === 0) {
      setConnectorDraftFeedbacks((current) => ({
        ...current,
        [connector.id]:
          mode === "missing"
            ? t(msg`当前推荐项都已经存在，没有新增映射。`)
            : t(msg`当前没有可写入的推荐映射。`),
      }));
      return;
    }

    updateConnectorDraft(connector.id, {
      endpointConfigText: formatEndpointConfig(mergeResult.nextConfig),
    });
    setConnectorDraftFeedbacks((current) => ({
      ...current,
      [connector.id]:
        mode === "missing"
          ? t(msg`已补入 ${mergeResult.appliedCount} 条未配置映射，自动避开 ${mergeResult.disambiguatedCount} 个冲突 key，跳过 ${mergeResult.skippedCount} 条无法处理的项。`)
          : t(msg`已写入 ${mergeResult.appliedCount} 条推荐映射，自动避开 ${mergeResult.disambiguatedCount} 个冲突 key，跳过 ${mergeResult.skippedCount} 条无法处理的项。`),
    }));
  }

  function countExistingMappedTargets(connector: ActionConnectorSummary) {
    const draft =
      connectorDrafts[connector.id] ?? createConnectorDraft(connector);
    const parsed = parseEndpointConfig(draft.endpointConfigText);
    if (parsed.error || !parsed.value) {
      return 0;
    }

    const deviceTargets =
      parsed.value.deviceTargets &&
      typeof parsed.value.deviceTargets === "object" &&
      !Array.isArray(parsed.value.deviceTargets)
        ? (parsed.value.deviceTargets as Record<string, unknown>)
        : {};
    return Object.keys(deviceTargets).length;
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="Action Runtime"
        title={t(msg`行动助理真实世界动作工作台`)}
        description={t(msg`围绕运营人员的查看路径重排：先看当前动作链是否健康，再决定是改门控、跑预演、校连接器，还是回看执行证据。`)}
        metrics={[
          { label: t(msg`总动作数`), value: overview.counts.totalRuns },
          { label: t(msg`待处理动作`), value: attentionRuns.length },
          { label: t(msg`失败动作`), value: overview.counts.failed },
          { label: t(msg`已就绪连接器`), value: overview.counts.readyConnectors },
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: ["admin-action-runtime-overview", baseUrl],
                })
              }
            >
              {t(msg`刷新概览`)}
            </Button>
            <Button
              variant="secondary"
              disabled={!isRulesDirty}
              onClick={resetRulesDraft}
            >
              {t(msg`重置草稿`)}
            </Button>
            <Button
              variant="primary"
              disabled={!isRulesDirty || saveRulesMutation.isPending}
              onClick={() => saveRulesMutation.mutate(rulesDraft)}
            >
              {saveRulesMutation.isPending ? t(msg`保存中...`) : t(msg`保存规则`)}
            </Button>
          </>
        }
      />

      {operatorSummary.tone === "warning" ? (
        <AdminCallout
          tone={operatorSummary.tone}
          title={operatorSummary.title}
          description={
            <div className="space-y-2">
              {operatorSummary.notes.map((note) => (
                <AdminSoftBox key={note}>{note}</AdminSoftBox>
              ))}
            </div>
          }
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setWorkspaceTab("evidence");
                  setEvidenceTab("attention");
                }}
              >
                {t(msg`查看待处理动作`)}
              </Button>
              {errorConnectors.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedConnectorId(errorConnectors[0].id);
                    setWorkspaceTab("connectors");
                  }}
                >
                  {t(msg`检查错误连接器`)}
                </Button>
              ) : null}
            </>
          }
        />
      ) : null}

      {saveRulesMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title={t(msg`Action Runtime 规则已保存`)}
          description={t(msg`新的门控策略和提示模板已经写入系统配置。`)}
        />
      ) : null}
      {saveRulesMutation.isError && saveRulesMutation.error instanceof Error ? (
        <ErrorBlock message={saveRulesMutation.error.message} />
      ) : null}
      {runActionFeedback ? (
        <AdminActionFeedback
          tone="info"
          title={t(msg`动作重试已提交`)}
          description={runActionFeedback}
        />
      ) : null}
      {retryRunMutation.isError && retryRunMutation.error instanceof Error ? (
        <ErrorBlock message={retryRunMutation.error.message} />
      ) : null}

      <div className="space-y-6">
        <div className="sticky top-0 z-10 -mx-2 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-shell)] px-2 py-2 backdrop-blur">
          <AdminTabs
            tabs={WORKSPACE_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
            activeKey={workspaceTab}
            onChange={(key) => setWorkspaceTab(key as WorkspaceTab)}
          />
        </div>

          {workspaceTab === "overview" ? (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <AdminInfoRows
                  title={t(msg`当前门控`)}
                  rows={[
                    {
                      label: t(msg`动作入口`),
                      value: overview.rules.policy.enabled
                        ? t(msg`已启用`)
                        : t(msg`已关闭`),
                    },
                    {
                      label: t(msg`入口角色 sourceKey`),
                      value:
                        overview.rules.policy.entryCharacterSourceKey ||
                        t(msg`未限制`),
                    },
                    {
                      label: t(msg`确认关键词`),
                      value:
                        overview.rules.policy.confirmationKeywords.join(
                          " / ",
                        ) || t(msg`暂无`),
                    },
                    {
                      label: t(msg`拒绝关键词`),
                      value:
                        overview.rules.policy.rejectionKeywords.join(" / ") ||
                        t(msg`暂无`),
                    },
                  ]}
                />
                <AdminInfoRows
                  title={t(msg`当前任务压力`)}
                  rows={[
                    {
                      label: t(msg`待补参数`),
                      value: t(msg`${overview.counts.awaitingSlots} 条`),
                    },
                    {
                      label: t(msg`待确认`),
                      value: t(msg`${overview.counts.awaitingConfirmation} 条`),
                    },
                    {
                      label: t(msg`失败动作`),
                      value: t(msg`${overview.counts.failed} 条`),
                    },
                    {
                      label: t(msg`最近动作`),
                      value: latestRun
                        ? formatDateTime(latestRun.updatedAt)
                        : t(msg`暂无`),
                    },
                  ]}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader
                    title={t(msg`待运营处理`)}
                    actions={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setWorkspaceTab("evidence");
                          setEvidenceTab("attention");
                        }}
                      >
                        {t(msg`去执行证据`)}
                      </Button>
                    }
                  />
                  <div className="mt-4 space-y-3">
                    {attentionRuns.length ? (
                      attentionRuns.slice(0, 5).map((run) => (
                        <AdminRecordCard
                          key={run.id}
                          title={run.title}
                          badges={
                            <StatusPill tone={resolveRunTone(run.status)}>
                              {translateRunStatus(run.status)}
                            </StatusPill>
                          }
                          meta={`${run.connectorKey} · ${run.operationKey} · ${formatDateTime(run.updatedAt)}`}
                          description={
                            run.resultSummary ??
                            run.errorMessage ??
                            run.userGoal
                          }
                          actions={
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedRunId(run.id);
                                setWorkspaceTab("evidence");
                                setEvidenceTab("attention");
                              }}
                            >
                              {t(msg`查看详情`)}
                            </Button>
                          }
                        />
                      ))
                    ) : (
                      <AdminEmptyState
                        title={t(msg`当前没有待处理动作`)}
                        description={t(msg`没有待补参数、待确认或失败动作，当前动作链可以继续用来做预演和连接器维护。`)}
                      />
                    )}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader
                    title={t(msg`连接器状态`)}
                    actions={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setWorkspaceTab("connectors")}
                      >
                        {t(msg`去连接器编排`)}
                      </Button>
                    }
                  />
                  <div className="mt-4 space-y-3">
                    {sortedConnectors.length ? (
                      sortedConnectors.map((connector) => (
                        <AdminRecordCard
                          key={connector.id}
                          title={connector.displayName}
                          badges={
                            <StatusPill
                              tone={resolveConnectorTone(connector.status)}
                            >
                              {translateConnectorStatus(connector.status)}
                            </StatusPill>
                          }
                          meta={`${translateProviderType(connector.providerType)} · ${connector.connectorKey}`}
                          // i18n-ignore-start: nested template literal inside t(msg`...`)
                          description={t(msg`支持 ${connector.capabilities.length} 个操作${
                            connector.lastError
                              ? ` · 最近错误：${connector.lastError}`
                              : ""
                          }`)}
                          // i18n-ignore-end
                          actions={
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedConnectorId(connector.id);
                                setWorkspaceTab("connectors");
                              }}
                            >
                              {t(msg`打开`)}
                            </Button>
                          }
                        />
                      ))
                    ) : (
                      <AdminEmptyState
                        title={t(msg`当前没有连接器`)}
                        description={t(msg`Action Runtime 初始化完成后，这里会列出可执行的真实世界连接器。`)}
                      />
                    )}
                  </div>
                </Card>
              </div>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`最近成功动作`)}
                  actions={
                    completedRuns.length ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setWorkspaceTab("evidence");
                          setEvidenceTab("completed");
                        }}
                      >
                        {t(msg`查看全部`)}
                      </Button>
                    ) : null
                  }
                />
                <div className="mt-4 space-y-3">
                  {completedRuns.length ? (
                    completedRuns
                      .slice(0, 3)
                      .map((run) => (
                        <AdminRecordCard
                          key={run.id}
                          title={run.title}
                          badges={
                            <StatusPill tone={resolveRunTone(run.status)}>
                              {translateRunStatus(run.status)}
                            </StatusPill>
                          }
                          meta={`${run.connectorKey} · ${run.operationKey} · ${formatDateTime(run.updatedAt)}`}
                          description={run.resultSummary ?? run.userGoal}
                        />
                      ))
                  ) : (
                    <AdminEmptyState
                      title={t(msg`还没有完成动作`)}
                      description={t(msg`等动作真正执行成功或被取消后，这里会积累最近完成的样本。`)}
                    />
                  )}
                </div>
              </Card>
            </div>
          ) : null}

          {workspaceTab === "rules" ? (
            <div className="space-y-6">
              <AdminCallout
                tone="info"
                title={t(msg`规则编辑建议`)}
                description={t(msg`门控策略决定哪些消息会进入动作链，提示模板决定进入动作链后的对话方式。先改门控，再调模板，能更快定位问题。`)}
              />

              <div className="flex items-center justify-between gap-3">
                <AdminTabs
                  tabs={RULE_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
                  activeKey={rulesTab}
                  onChange={(key) => setRulesTab(key as RulesTab)}
                  className="flex-1"
                />
                <AdminDraftStatusPill
                  ready={Boolean(rulesDraft)}
                  dirty={isRulesDirty}
                />
              </div>

              {rulesTab === "policy" ? (
                <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader title={t(msg`Planner 与入口`)} />
                    <div className="mt-4 space-y-6">
                      <AdminSelectField
                        label="Planner Mode" // i18n-ignore-line: admin technical label
                        value={rulesDraft.plannerMode}
                        onChange={(value) =>
                          patchRules((current) => ({
                            ...current,
                            plannerMode:
                              value as ActionRuntimeRules["plannerMode"],
                          }))
                        }
                        options={PLANNER_MODE_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }))}
                      />

                      <div className="grid gap-4 md:grid-cols-2">
                        <AdminToggle
                          label={t(msg`启用动作入口`)}
                          checked={rulesDraft.policy.enabled}
                          onChange={(checked) =>
                            setPolicyValue("enabled", checked)
                          }
                        />
                        <AdminTextField
                          label={t(msg`入口角色 sourceKey`)}
                          value={rulesDraft.policy.entryCharacterSourceKey}
                          onChange={(value) =>
                            setPolicyValue("entryCharacterSourceKey", value)
                          }
                          placeholder="action_operator" // i18n-ignore-line: technical identifier placeholder
                        />
                      </div>
                      <div className="-mt-2 text-[12px] leading-5 text-[color:var(--text-dim)]">
                        {t(msg`默认是 \`action_operator\`。留空表示不限制角色，只建议用于兼容或排障。`)}
                      </div>

                      <AdminTextArea
                        label={t(msg`可信自动执行操作`)}
                        value={formatStringList(
                          rulesDraft.policy.trustedOperationKeys,
                        )}
                        onChange={(value) =>
                          setPolicyValue(
                            "trustedOperationKeys",
                            parseStringList(value),
                          )
                        }
                        description={t(msg`只有同时命中"自动执行风险等级"和这里的 operationKey，动作才会直接执行。`)}
                        textareaClassName="min-h-32"
                      />
                    </div>
                  </Card>

                  <div className="space-y-6">
                    <Card className="bg-[color:var(--surface-console)]">
                      <AdminSectionHeader title={t(msg`确认与拒绝语义`)} />
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <AdminTextArea
                          label={t(msg`确认关键词`)}
                          value={formatStringList(
                            rulesDraft.policy.confirmationKeywords,
                          )}
                          onChange={(value) =>
                            setPolicyValue(
                              "confirmationKeywords",
                              parseStringList(value),
                            )
                          }
                          description={t(msg`每行一个关键词；用户说到这些词时，待确认动作会继续执行。`)}
                          textareaClassName="min-h-32"
                        />
                        <AdminTextArea
                          label={t(msg`拒绝关键词`)}
                          value={formatStringList(
                            rulesDraft.policy.rejectionKeywords,
                          )}
                          onChange={(value) =>
                            setPolicyValue(
                              "rejectionKeywords",
                              parseStringList(value),
                            )
                          }
                          description={t(msg`每行一个关键词；命中后，待确认动作会直接取消。`)}
                          textareaClassName="min-h-32"
                        />
                      </div>
                    </Card>

                    <Card className="bg-[color:var(--surface-console)]">
                      <AdminSectionHeader title={t(msg`自动执行风险等级`)} />
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {RISK_LEVEL_OPTIONS.map((option) => {
                          const active =
                            rulesDraft.policy.autoExecuteRiskLevels.includes(
                              option.value,
                            );
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => toggleRiskLevel(option.value)}
                              className={[
                                "rounded-[18px] border p-4 text-left transition",
                                active
                                  ? "border-[color:var(--brand-primary)] bg-white shadow-[var(--shadow-soft)]"
                                  : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:border-[color:var(--border-subtle)]",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                                  {t(option.label)}
                                </div>
                                <StatusPill tone={active ? "healthy" : "muted"}>
                                  {active ? t(msg`自动执行`) : t(msg`需额外判断`)}
                                </StatusPill>
                              </div>
                              <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                                {t(option.description)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                </div>
              ) : null}

              {rulesTab === "prompts" ? (
                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader title={t(msg`Planner 与中间态文案`)} />
                    <div className="mt-4 space-y-4">
                      <AdminTextArea
                        label="Planner Prompt" // i18n-ignore-line: admin technical label
                        value={rulesDraft.promptTemplates.plannerSystemPrompt}
                        onChange={(value) =>
                          setPromptTemplate("plannerSystemPrompt", value)
                        }
                        textareaClassName="min-h-40"
                      />
                      <AdminTextArea
                        label={t(msg`澄清模板`)}
                        value={rulesDraft.promptTemplates.clarificationTemplate}
                        onChange={(value) =>
                          setPromptTemplate("clarificationTemplate", value)
                        }
                      />
                      <AdminTextArea
                        label={t(msg`确认模板`)}
                        value={rulesDraft.promptTemplates.confirmationTemplate}
                        onChange={(value) =>
                          setPromptTemplate("confirmationTemplate", value)
                        }
                      />
                      <AdminTextArea
                        label={t(msg`待确认提醒模板`)}
                        value={
                          rulesDraft.promptTemplates
                            .pendingConfirmationReminderTemplate
                        }
                        onChange={(value) =>
                          setPromptTemplate(
                            "pendingConfirmationReminderTemplate",
                            value,
                          )
                        }
                      />
                    </div>
                  </Card>

                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader title={t(msg`执行结果文案`)} />
                    <div className="mt-4 space-y-4">
                      <AdminTextArea
                        label={t(msg`成功模板`)}
                        value={rulesDraft.promptTemplates.successTemplate}
                        onChange={(value) =>
                          setPromptTemplate("successTemplate", value)
                        }
                      />
                      <AdminTextArea
                        label={t(msg`失败模板`)}
                        value={rulesDraft.promptTemplates.failureTemplate}
                        onChange={(value) =>
                          setPromptTemplate("failureTemplate", value)
                        }
                      />
                      <AdminTextArea
                        label={t(msg`取消模板`)}
                        value={rulesDraft.promptTemplates.cancelledTemplate}
                        onChange={(value) =>
                          setPromptTemplate("cancelledTemplate", value)
                        }
                      />
                    </div>
                  </Card>
                </div>
              ) : null}
            </div>
          ) : null}

          {workspaceTab === "preview" ? (
            <div className="space-y-6">
              <AdminCallout
                tone="info"
                title={t(msg`消息预演`)}
                description={t(msg`这里用来验证"某句话是否会命中真实世界动作链"。先预演，再回去改门控或提示模板，定位会更快。`)}
              />

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`预演输入`)}
                  actions={
                    <Button
                      variant="primary"
                      disabled={
                        !previewMessage.trim() || previewMutation.isPending
                      }
                      onClick={() =>
                        previewMutation.mutate(previewMessage.trim())
                      }
                    >
                      {previewMutation.isPending ? t(msg`预演中...`) : t(msg`运行预演`)}
                    </Button>
                  }
                />
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {PREVIEW_EXAMPLES.map((example) => (
                      <Button
                        key={t(example.label)}
                        variant="secondary"
                        size="sm"
                        onClick={() => setPreviewMessage(example.message)}
                      >
                        {t(example.label)}
                      </Button>
                    ))}
                    {previewMessage ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setPreviewMessage("");
                          previewMutation.reset();
                        }}
                      >
                        {t(msg`清空`)}
                      </Button>
                    ) : null}
                  </div>
                  <AdminTextArea
                    label={t(msg`候选消息`)}
                    value={previewMessage}
                    onChange={setPreviewMessage}
                    placeholder={t(msg`例如：帮我把客厅空调调到 24 度，或者今晚给我点个 40 块以内的轻食外卖。`)}
                    textareaClassName="min-h-32"
                  />
                </div>
              </Card>

              {previewMutation.isError &&
              previewMutation.error instanceof Error ? (
                <ErrorBlock message={previewMutation.error.message} />
              ) : null}

              {previewMutation.data ? (
                <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader
                      title={t(msg`预演结论`)}
                      actions={
                        <StatusPill
                          tone={
                            previewMutation.data.handled ? "healthy" : "muted"
                          }
                        >
                          {previewMutation.data.handled
                            ? t(msg`命中动作链`)
                            : t(msg`未命中`)}
                        </StatusPill>
                      }
                    />
                    <div className="mt-4 space-y-4">
                      <AdminSoftBox>
                        {t(msg`判定原因：${previewMutation.data.reason}`)}
                      </AdminSoftBox>
                      <AdminSoftBox>
                        {t(msg`回复预览：`)}
                        <div className="mt-2">
                          {previewMutation.data.responsePreview ??
                            t(msg`当前消息会继续走普通聊天链路。`)}
                        </div>
                      </AdminSoftBox>
                      {previewMutation.data.plan ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <AdminValueCard
                            label={t(msg`标题`)}
                            value={previewMutation.data.plan.title}
                          />
                          <AdminValueCard
                            label={t(msg`风险等级`)}
                            value={translateRiskLevel(
                              previewMutation.data.plan.riskLevel,
                            )}
                          />
                          <AdminValueCard
                            label={t(msg`是否要求确认`)}
                            value={
                              previewMutation.data.plan.requiresConfirmation
                                ? t(msg`是`)
                                : t(msg`否`)
                            }
                          />
                          <AdminValueCard
                            label={t(msg`缺失参数`)}
                            value={
                              previewMutation.data.plan.missingSlots.length
                                ? previewMutation.data.plan.missingSlots.join(
                                    " / ",
                                  )
                                : t(msg`无`)
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  </Card>

                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader title={t(msg`Plan 明细`)} />
                    <div className="mt-4">
                      {previewMutation.data.plan ? (
                        <AdminCodeBlock
                          value={prettyJson(previewMutation.data.plan)}
                        />
                      ) : (
                        <AdminEmptyState
                          title={t(msg`当前没有 plan`)}
                          description={t(msg`这条话术没有命中动作链，所以没有生成动作 plan。`)}
                        />
                      )}
                    </div>
                  </Card>
                </div>
              ) : (
                <AdminEmptyState
                  title={t(msg`还没有预演结果`)}
                  description={t(msg`输入一条候选消息后点"运行预演"，这里会显示是否命中动作链以及生成出的 plan。`)}
                />
              )}
            </div>
          ) : null}

          {workspaceTab === "connectors" ? (
            <div className="space-y-6">
              <AdminCallout
                tone={errorConnectors.length ? "warning" : "success"}
                title={
                  errorConnectors.length
                    ? t(msg`当前有连接器需要处理`)
                    : t(msg`连接器总体状态正常`)
                }
                description={
                  errorConnectors.length
                    ? t(msg`当前共有 ${errorConnectors.length} 个连接器处于 error。优先看最近错误、凭证状态和自检结果。`)
                    : t(msg`建议先选中某个连接器，再在右侧统一完成配置、自检和启停操作。`)
                }
              />

              <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title={t(msg`连接器列表`)} />
                  <div className="mt-4 space-y-3">
                    {sortedConnectors.length ? (
                      sortedConnectors.map((connector) => (
                        <AdminSelectableCard
                          key={connector.id}
                          active={selectedConnectorId === connector.id}
                          title={connector.displayName}
                          subtitle={t(msg`${translateProviderType(connector.providerType)} · ${connector.capabilities.length} 个动作`)}
                          meta={[
                            connector.connectorKey,
                            connector.lastHealthCheckAt
                              ? t(msg`最近自检 ${formatDateTime(
                                  connector.lastHealthCheckAt,
                                )}`)
                              : t(msg`尚未自检`),
                          ].join(" · ")}
                          badge={
                            <StatusPill
                              tone={resolveConnectorTone(connector.status)}
                            >
                              {translateConnectorStatus(connector.status)}
                            </StatusPill>
                          }
                          activeLabel={t(msg`当前编辑`)}
                          onClick={() => setSelectedConnectorId(connector.id)}
                        />
                      ))
                    ) : (
                      <AdminEmptyState
                        title={t(msg`还没有连接器`)}
                        description={t(msg`Action Runtime 初始化完成后，这里会列出真实世界连接器。`)}
                      />
                    )}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  {!selectedConnector || !selectedConnectorDraft ? (
                    <AdminEmptyState
                      title={t(msg`未选择连接器`)}
                      description={t(msg`从左侧点开一个连接器后，这里会展示它的配置、凭证、自检和映射详情。`)}
                    />
                  ) : (
                    <>
                      <AdminSectionHeader
                        title={selectedConnector.displayName}
                        actions={
                          <div className="flex flex-wrap gap-2">
                            <StatusPill
                              tone={resolveConnectorTone(
                                selectedConnector.status,
                              )}
                            >
                              {translateConnectorStatus(
                                selectedConnector.status,
                              )}
                            </StatusPill>
                            <AdminDraftStatusPill
                              ready
                              dirty={selectedConnectorDirty}
                            />
                          </div>
                        }
                      />

                      <div className="mt-4 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="primary"
                              disabled={
                                selectedConnectorSaving || !selectedConnectorDirty
                              }
                              onClick={() =>
                                handleSaveConnector(selectedConnector)
                              }
                            >
                              {selectedConnectorSaving ? t(msg`保存中...`) : t(msg`保存配置`)}
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={Boolean(selectedConnectorTesting)}
                              onClick={() =>
                                testConnectorMutation.mutate({
                                  id: selectedConnector.id,
                                  sampleMessage:
                                    selectedConnectorDraft.testMessage,
                                })
                              }
                            >
                              {selectedConnectorTesting
                                ? t(msg`自检中...`)
                                : t(msg`测试连接器`)}
                            </Button>
                            {selectedConnector.connectorKey ===
                            "official-home-assistant-smart-home" ? (
                              <Button
                                variant="secondary"
                                disabled={Boolean(selectedConnectorDiscovering)}
                                onClick={() =>
                                  void handleDiscoverConnector(selectedConnector)
                                }
                              >
                                {selectedConnectorDiscovering
                                  ? t(msg`发现中...`)
                                  : t(msg`发现实体`)}
                              </Button>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selectedConnector.status !== "ready" ? (
                              <Button
                                variant="secondary"
                                disabled={Boolean(selectedConnectorToggling)}
                                onClick={() =>
                                  toggleConnectorStatusMutation.mutate({
                                    id: selectedConnector.id,
                                    status: "ready",
                                  })
                                }
                              >
                                {selectedConnectorToggling &&
                                toggleConnectorStatusMutation.variables?.status ===
                                  "ready"
                                  ? t(msg`启用中...`)
                                  : t(msg`启用`)}
                              </Button>
                            ) : null}
                            {selectedConnector.status !== "disabled" ? (
                              <Button
                                variant="secondary"
                                disabled={Boolean(selectedConnectorToggling)}
                                onClick={() =>
                                  toggleConnectorStatusMutation.mutate({
                                    id: selectedConnector.id,
                                    status: "disabled",
                                  })
                                }
                              >
                                {selectedConnectorToggling &&
                                toggleConnectorStatusMutation.variables?.status ===
                                  "disabled"
                                  ? t(msg`停用中...`)
                                  : t(msg`停用`)}
                              </Button>
                            ) : null}
                            {(selectedConnector.providerType === "official_api" ||
                              selectedConnector.providerType === "http_bridge") &&
                            selectedConnector.credentialConfigured ? (
                              <Button
                                variant="secondary"
                                disabled={Boolean(selectedConnectorSaving)}
                                onClick={() =>
                                  handleClearConnectorCredential(
                                    selectedConnector,
                                  )
                                }
                              >
                                {t(msg`清除凭证`)}
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <AdminValueCard
                            label={t(msg`类型`)}
                            value={translateProviderType(
                              selectedConnector.providerType,
                            )}
                          />
                          <AdminValueCard
                            label={t(msg`能力数`)}
                            value={t(msg`${selectedConnector.capabilities.length} 项`)}
                          />
                          <AdminValueCard
                            label={t(msg`最近自检`)}
                            value={formatDateTime(
                              selectedConnector.lastHealthCheckAt,
                            )}
                          />
                          <AdminValueCard
                            label={t(msg`最后更新时间`)}
                            value={formatDateTime(selectedConnector.updatedAt)}
                          />
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <AdminMiniPanel title={t(msg`支持操作`)} tone="soft">
                            <div className="space-y-2">
                              {selectedConnector.capabilities.length ? (
                                selectedConnector.capabilities.map(
                                  (capability) => (
                                    <AdminSoftBox key={capability.operationKey}>
                                      <div className="font-medium text-[color:var(--text-primary)]">
                                        {capability.label}
                                      </div>
                                      <div className="mt-1 text-sm">
                                        {capability.domain} ·{" "}
                                        {translateRiskLevel(
                                          capability.riskLevel,
                                        )}
                                        {capability.requiresConfirmation
                                          ? t(msg` · 需确认`)
                                          : ""}
                                      </div>
                                    </AdminSoftBox>
                                  ),
                                )
                              ) : (
                                <AdminSoftBox>
                                  {t(msg`当前未声明可执行动作。`)}
                                </AdminSoftBox>
                              )}
                            </div>
                          </AdminMiniPanel>

                          <AdminMiniPanel title={t(msg`运维提示`)} tone="soft">
                            <div className="space-y-2">
                              <AdminSoftBox>
                                {selectedConnector.status === "error"
                                  ? t(msg`当前连接器处于 error，优先检查最近错误、自检结果和凭证。`)
                                  : selectedConnector.status === "disabled"
                                    ? t(msg`当前连接器已停用，保存配置后记得重新启用。`)
                                    : t(msg`当前连接器已就绪，可以直接做自检和预演验证。`)}
                              </AdminSoftBox>
                              {/* i18n-ignore-start: conditional values interpolated inside t(msg`...`) */}
                              <AdminSoftBox>
                                {t(msg`凭证状态：${selectedConnector.credentialConfigured
                                  ? "已配置"
                                  : "未配置"}`)}
                              </AdminSoftBox>
                              {/* i18n-ignore-end */}
                              <AdminSoftBox>
                                {t(msg`最后错误：${selectedConnector.lastError || "暂无"}`)}
                              </AdminSoftBox>
                            </div>
                          </AdminMiniPanel>
                        </div>

                        {selectedConnector.providerType === "http_bridge" ? (
                          <AdminCallout
                            tone="info"
                            title={t(msg`HTTP Bridge 契约`)}
                            description={t(msg`服务端会向 \`endpointConfig.url\` 发送 JSON：\`{ connectorKey, operationKey, domain, title, goal, riskLevel, requiresConfirmation, previewOnly, slots, missingSlots, sentAt }\`。返回 JSON 时优先读取 \`resultSummary\` / \`summary\`、\`result\`、\`execution\`。`)}
                          />
                        ) : null}

                        {selectedConnector.connectorKey ===
                        "official-home-assistant-smart-home" ? (
                          <div className="space-y-4">
                            <AdminCallout
                              tone="info"
                              title={t(msg`Home Assistant 配置方式`)}
                              description={t(msg`填写 \`baseUrl\`，把 Long-Lived Access Token 填进 credential。\`deviceTargets\` 用 "房间:设备" 作为 key，例如 \`客厅:空调\`；每个 target 至少包含 \`entityId\`，可选 \`serviceDomain\`、\`turnOnService\`、\`turnOffService\`、\`setTemperatureService\`、\`temperatureField\`。`)}
                            />
                            <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                                    {t(msg`实体发现与映射向导`)}
                                  </div>
                                  <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                                    {t(msg`会优先通过 Home Assistant WebSocket registry 识别 area / device / entity 关系，失败时回退到 \`/api/states\`，并给出推荐的 \`deviceTargets\` 键。`)}
                                  </div>
                                </div>
                                <Button
                                  variant="secondary"
                                  disabled={Boolean(
                                    selectedConnectorDiscovering,
                                  )}
                                  onClick={() =>
                                    void handleDiscoverConnector(
                                      selectedConnector,
                                    )
                                  }
                                >
                                  {selectedConnectorDiscovering
                                    ? t(msg`发现中...`)
                                    : t(msg`发现实体`)}
                                </Button>
                              </div>
                              <div className="mt-4">
                                <AdminTextField
                                  label={t(msg`发现筛选词`)}
                                  value={selectedConnectorDraft.discoveryQuery}
                                  onChange={(value) =>
                                    updateConnectorDraft(selectedConnector.id, {
                                      discoveryQuery: value,
                                    })
                                  }
                                  placeholder={t(msg`可按房间、设备、entity_id 检索，例如 客厅 / 空调 / light.`)}
                                />
                              </div>
                              {discoverConnectorMutation.isError &&
                              discoverConnectorMutation.error instanceof
                                Error &&
                              discoverConnectorMutation.variables?.id ===
                                selectedConnector.id ? (
                                <ErrorBlock
                                  className="mt-4"
                                  message={
                                    discoverConnectorMutation.error.message
                                  }
                                />
                              ) : null}
                              {selectedConnectorDiscoveryResult ? (
                                <div className="mt-4 space-y-3">
                                  <AdminCallout
                                    tone={
                                      selectedConnectorDiscoveryResult.topologySource ===
                                      "websocket_registry"
                                        ? "success"
                                        : selectedConnectorDiscoveryResult.itemCount
                                          ? "info"
                                          : "warning"
                                    }
                                    title={
                                      selectedConnectorDiscoveryResult.itemCount
                                        ? t(msg`发现到 ${selectedConnectorDiscoveryResult.itemCount} 个候选实体`)
                                        : t(msg`没有发现匹配实体`)
                                    }
                                    // i18n-ignore-start: nested template literals inside t(msg`...`)
                                    description={t(msg`拉取时间 ${formatDateTime(selectedConnectorDiscoveryResult.fetchedAt)}${
                                      selectedConnectorDiscoveryResult.query
                                        ? `，当前筛选：${selectedConnectorDiscoveryResult.query}`
                                        : ""
                                    }。房间识别模式：${translateDiscoveryTopologySource(
                                      selectedConnectorDiscoveryResult.topologySource,
                                    )}。点"写入映射"会把推荐 target 合并进当前草稿，不会自动保存。`)}
                                    // i18n-ignore-end
                                  />
                                  {selectedConnectorDiscoveryResult.warnings.map(
                                    (warning) => (
                                      <AdminCallout
                                        key={warning}
                                        tone="warning"
                                        title={t(msg`识别回退提示`)}
                                        description={warning}
                                      />
                                    ),
                                  )}
                                  {selectedConnectorFeedback ? (
                                    <AdminCallout
                                      tone="success"
                                      title={t(msg`映射草稿已更新`)}
                                      description={selectedConnectorFeedback}
                                    />
                                  ) : null}
                                  <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
                                    {/* i18n-ignore-start: multiline t(msg`...`) with interpolation */}
                                    <div className="text-sm leading-6 text-[color:var(--text-secondary)]">
                                      {t(msg`当前草稿已有 ${countExistingMappedTargets(
                                        selectedConnector,
                                      )} 条 deviceTargets 映射。`)}
                                    </div>
                                    {/* i18n-ignore-end */}
                                    <Button
                                      variant="secondary"
                                      disabled={
                                        !selectedConnectorDiscoveryResult.items
                                          .length
                                      }
                                      onClick={() =>
                                        applyHomeAssistantTargetSuggestions(
                                          selectedConnector,
                                          selectedConnectorDiscoveryResult.items,
                                          "missing",
                                        )
                                      }
                                    >
                                      {t(msg`只补未配置项`)}
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      disabled={
                                        !selectedConnectorDiscoveryResult.items
                                          .length
                                      }
                                      onClick={() =>
                                        applyHomeAssistantTargetSuggestions(
                                          selectedConnector,
                                          selectedConnectorDiscoveryResult.items,
                                          "all",
                                        )
                                      }
                                    >
                                      {t(msg`批量写入全部`)}
                                    </Button>
                                  </div>
                                  {selectedConnectorDiscoveryResult.items.map(
                                    (item) => (
                                      <div
                                        key={`${item.entityId}-${item.key}`}
                                        className="rounded-[16px] border border-[color:var(--border-faint)] bg-white p-4"
                                      >
                                        <div className="flex items-start justify-between gap-4">
                                          <div>
                                            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                                              {item.friendlyName}
                                            </div>
                                            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                                              {item.entityId} · {item.domain} ·
                                              {t(msg`当前状态 ${item.state}`)}
                                            </div>
                                          </div>
                                          <Button
                                            variant="secondary"
                                            onClick={() =>
                                              applyHomeAssistantTargetSuggestion(
                                                selectedConnector,
                                                item,
                                              )
                                            }
                                          >
                                            {t(msg`写入映射`)}
                                          </Button>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                                          <span>
                                            {t(msg`推荐房间`)}：
                                            {item.suggestedRoom || t(msg`未识别`)}
                                          </span>
                                          <span>
                                            {t(msg`推荐设备`)}：
                                            {item.suggestedDevice || t(msg`设备`)}
                                          </span>
                                          <span>
                                            {t(msg`映射键`)}：{item.key}
                                          </span>
                                        </div>
                                        {/* i18n-ignore-start: nested template literals inside t(msg`...`) */}
                                        <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                                          {t(msg`房间来源：${translateDiscoverySource(
                                            item.roomSource,
                                          )}${item.registryAreaName
                                            ? `（${item.registryAreaName}）`
                                            : ""} · 设备来源：${translateDiscoverySource(
                                            item.deviceSource,
                                          )}${item.registryDeviceName
                                            ? `（${item.registryDeviceName}）`
                                            : ""}`)}
                                        </div>
                                        {/* i18n-ignore-end */}
                                        <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                                          {t(msg`可执行动作：`)}
                                          {item.availableActions.join(" / ")}
                                        </div>
                                        <div className="mt-3">
                                          <LabeledCodeBlock
                                            label="Target Config" // i18n-ignore-line: admin technical label
                                            value={prettyJson(
                                              item.targetConfig,
                                            )}
                                          />
                                        </div>
                                      </div>
                                    ),
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        <AdminTextField
                          label={t(msg`显示名称`)}
                          value={selectedConnectorDraft.displayName}
                          onChange={(value) =>
                            updateConnectorDraft(selectedConnector.id, {
                              displayName: value,
                            })
                          }
                        />
                        <AdminTextArea
                          label="Endpoint Config JSON" // i18n-ignore-line: admin technical label
                          value={selectedConnectorDraft.endpointConfigText}
                          onChange={(value) =>
                            updateConnectorDraft(selectedConnector.id, {
                              endpointConfigText: value,
                            })
                          }
                          placeholder={t(msg`例如：{"city":"上海"}`)}
                          textareaClassName="min-h-36 font-mono text-xs"
                        />
                        <AdminTextArea
                          label={t(msg`测试消息`)}
                          value={selectedConnectorDraft.testMessage}
                          onChange={(value) =>
                            updateConnectorDraft(selectedConnector.id, {
                              testMessage: value,
                            })
                          }
                          placeholder={t(msg`留空则使用系统默认样例。`)}
                          textareaClassName="min-h-24"
                        />

                        {selectedConnector.providerType === "official_api" ||
                        selectedConnector.providerType === "http_bridge" ? (
                          <AdminTextField
                            label={
                              selectedConnector.providerType === "official_api"
                                ? "Access Token / Credential"
                                : "Bridge Secret / Credential"
                            }
                            value={selectedConnectorDraft.credential}
                            onChange={(value) =>
                              updateConnectorDraft(selectedConnector.id, {
                                credential: value,
                              })
                            }
                            placeholder={
                              selectedConnector.credentialConfigured
                                ? t(msg`已配置新凭证时再覆盖；留空则保持不变。`)
                                : t(msg`输入凭证后保存。`)
                            }
                          />
                        ) : null}

                        {selectedConnectorError ? (
                          <ErrorBlock message={selectedConnectorError} />
                        ) : null}
                        {saveConnectorMutation.isError &&
                        saveConnectorMutation.error instanceof Error &&
                        saveConnectorMutation.variables?.id ===
                          selectedConnector.id ? (
                          <ErrorBlock
                            message={saveConnectorMutation.error.message}
                          />
                        ) : null}
                        {toggleConnectorStatusMutation.isError &&
                        toggleConnectorStatusMutation.error instanceof Error &&
                        toggleConnectorStatusMutation.variables?.id ===
                          selectedConnector.id ? (
                          <ErrorBlock
                            message={
                              toggleConnectorStatusMutation.error.message
                            }
                          />
                        ) : null}
                        {testConnectorMutation.isError &&
                        testConnectorMutation.error instanceof Error &&
                        testConnectorMutation.variables?.id ===
                          selectedConnector.id ? (
                          <ErrorBlock
                            message={testConnectorMutation.error.message}
                          />
                        ) : null}

                        {selectedConnector.lastError ? (
                          <AdminCallout
                            tone="warning"
                            title={t(msg`最近一次连接器错误`)}
                            description={selectedConnector.lastError}
                          />
                        ) : null}

                        {selectedConnector.providerType === "official_api" ||
                        selectedConnector.providerType === "http_bridge" ? (
                          <AdminCallout
                            tone={
                              selectedConnector.credentialConfigured
                                ? "success"
                                : "warning"
                            }
                            title={
                              selectedConnector.credentialConfigured
                                ? t(msg`凭证已配置`)
                                : t(msg`凭证未配置`)
                            }
                            description={
                              selectedConnector.providerType === "official_api"
                                ? t(msg`官方 API 连接器不会回显已保存 token；填写新值并保存即可覆盖。`)
                                : t(msg`Bridge credential 同样只写入不回显；需要替换时重新填写并保存。`)
                            }
                          />
                        ) : null}

                        {selectedConnectorTestResult ? (
                          <div className="space-y-3">
                            <AdminCallout
                              tone={
                                selectedConnectorTestResult.ok
                                  ? "success"
                                  : "warning"
                              }
                              title={
                                selectedConnectorTestResult.ok
                                  ? t(msg`连接器自检通过`)
                                  : t(msg`连接器自检失败`)
                              }
                              description={
                                selectedConnectorTestResult.errorMessage ??
                                selectedConnectorTestResult.summary
                              }
                            />
                            <AdminCodeBlock
                              value={prettyJson({
                                testedAt: selectedConnectorTestResult.testedAt,
                                sampleMessage:
                                  selectedConnectorTestResult.sampleMessage,
                                samplePlan:
                                  selectedConnectorTestResult.samplePlan,
                                executionPayload:
                                  selectedConnectorTestResult.executionPayload,
                                resultPayload:
                                  selectedConnectorTestResult.resultPayload,
                              })}
                            />
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </div>
          ) : null}

          {workspaceTab === "evidence" ? (
            <div className="space-y-6">
              <AdminCallout
                tone={attentionRuns.length ? "warning" : "success"}
                title={
                  attentionRuns.length
                    ? t(msg`当前有待处理动作`)
                    : t(msg`当前没有待处理动作`)
                }
                description={
                  attentionRuns.length
                    ? t(msg`优先从"待处理"视角回看等待补参数、等待确认和执行失败的动作，再决定是改规则、补连接器还是重试。`)
                    : t(msg`最近动作已经基本收口，可以从"已完成"回看成功样本，或者去消息预演继续做验证。`)
                }
              />

              <AdminTabs
                tabs={evidenceTabs}
                activeKey={evidenceTab}
                onChange={(key) => setEvidenceTab(key as EvidenceTab)}
              />

              <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title={t(msg`运行列表`)} />
                  <div className="mt-4 space-y-3">
                    {visibleRuns.length ? (
                      visibleRuns.map((run) => (
                        <AdminSelectableCard
                          key={run.id}
                          active={selectedRunId === run.id}
                          title={run.title}
                          subtitle={
                            run.resultSummary ??
                            run.errorMessage ??
                            run.userGoal
                          }
                          meta={`${run.connectorKey} · ${run.operationKey} · ${formatDateTime(run.updatedAt)}`}
                          badge={
                            <StatusPill tone={resolveRunTone(run.status)}>
                              {translateRunStatus(run.status)}
                            </StatusPill>
                          }
                          activeLabel={t(msg`当前查看`)}
                          onClick={() => setSelectedRunId(run.id)}
                        />
                      ))
                    ) : (
                      <AdminEmptyState
                        title={t(msg`当前筛选下没有动作`)}
                        description={t(msg`切换到其它筛选，或者先在真实对话里触发一次动作链。`)}
                      />
                    )}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader
                    title={t(msg`动作详情`)}
                    actions={
                      selectedRunId &&
                      runDetailQuery.data &&
                      isRetryableRunStatus(runDetailQuery.data.status) ? (
                        <Button
                          variant="secondary"
                          disabled={retryRunMutation.isPending}
                          onClick={() => retryRunMutation.mutate(selectedRunId)}
                        >
                          {retryRunMutation.isPending
                            ? t(msg`重试中...`)
                            : t(msg`重试动作`)}
                        </Button>
                      ) : undefined
                    }
                  />
                  <div className="mt-4">
                    {!selectedRunId ? (
                      <AdminEmptyState
                        title={t(msg`还没有选中动作`)}
                        description={t(msg`从左侧点开一条运行记录后，这里会展示 plan、执行结果和完整 trace。`)}
                      />
                    ) : runDetailQuery.isLoading ? (
                      <LoadingBlock label={t(msg`正在读取动作详情...`)} />
                    ) : runDetailQuery.isError &&
                      runDetailQuery.error instanceof Error ? (
                      <ErrorBlock message={runDetailQuery.error.message} />
                    ) : runDetailQuery.data ? (
                      <ActionRunDetailPanel detail={runDetailQuery.data} />
                    ) : (
                      <AdminEmptyState
                        title={t(msg`动作详情暂不可用`)}
                        description={t(msg`刷新一次概览；如果仍然为空，说明当前动作还没写入详情。`)}
                      />
                    )}
                  </div>
                </Card>
              </div>
            </div>
          ) : null}
      </div>
    </div>
  );
}

function LabeledCodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <AdminCodeBlock value={value} />
    </div>
  );
}

type PayloadTabKey = "plan" | "execution" | "result" | "trace";

function ActionRunDetailPanel({ detail }: { detail: ActionRunDetail }) {
  const t = translateRuntimeMessage;
  const hint = buildActionRunHint(detail);
  const [payloadTab, setPayloadTab] = useState<PayloadTabKey>("result");

  return (
    <div className="space-y-4">
      <AdminCallout
        tone={hint.tone}
        title={hint.title}
        description={hint.description}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <AdminValueCard
          label={t(msg`状态`)}
          value={
            <StatusPill tone={resolveRunTone(detail.status)}>
              {translateRunStatus(detail.status)}
            </StatusPill>
          }
        />
        <AdminValueCard
          label={t(msg`风险等级`)}
          value={translateRiskLevel(detail.riskLevel)}
        />
        <AdminValueCard
          label={t(msg`是否要求确认`)}
          value={detail.requiresConfirmation ? t(msg`是`) : t(msg`否`)}
        />
        <AdminValueCard
          label={t(msg`更新时间`)}
          value={formatDateTime(detail.updatedAt)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminMiniPanel title={t(msg`动作摘要`)} tone="soft">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <AdminSoftBox>{t(msg`标题：${detail.title}`)}</AdminSoftBox>
            <AdminSoftBox>{t(msg`用户目标：${detail.userGoal}`)}</AdminSoftBox>
            <AdminSoftBox>
              {t(msg`连接器：${detail.connectorKey} · ${detail.operationKey}`)}
            </AdminSoftBox>
          </div>
        </AdminMiniPanel>

        <AdminMiniPanel title={t(msg`参数情况`)} tone="soft">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            {/* i18n-ignore-start: conditional values inside t(msg`...`) */}
            <AdminSoftBox>
              {t(msg`缺失参数：${detail.missingSlots.length
                ? detail.missingSlots.join(" / ")
                : "无"}`)}
            </AdminSoftBox>
            {/* i18n-ignore-end */}
            <AdminSoftBox>
              {t(msg`结果摘要：${detail.resultSummary || "暂无"}`)}
            </AdminSoftBox>
            <AdminSoftBox>
              {t(msg`错误信息：${detail.errorMessage || "暂无"}`)}
            </AdminSoftBox>
          </div>
        </AdminMiniPanel>
      </div>

      <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            {t(msg`Payload 详情`)}
          </div>
          <AdminSubTabs
            tabs={[
              { key: "result", label: t(msg`结果`) },
              { key: "execution", label: t(msg`执行`) },
              { key: "plan", label: "Plan" }, // i18n-ignore-line: admin technical label
              { key: "trace", label: "Trace" }, // i18n-ignore-line: admin technical label
            ]}
            activeKey={payloadTab}
            onChange={(key) => setPayloadTab(key as PayloadTabKey)}
          />
        </div>
        <div className="mt-4 space-y-4">
          {/* i18n-ignore-start: admin technical payload labels */}
          {payloadTab === "result" ? (
            <>
              <LabeledCodeBlock
                label="Result Payload"
                value={prettyJson(detail.resultPayload ?? {})}
              />
              <LabeledCodeBlock
                label="Error Payload"
                value={prettyJson(detail.errorPayload ?? {})}
              />
            </>
          ) : null}
          {payloadTab === "execution" ? (
            <>
              <LabeledCodeBlock
                label="Confirmation Payload"
                value={prettyJson(detail.confirmationPayload ?? {})}
              />
              <LabeledCodeBlock
                label="Execution Payload"
                value={prettyJson(detail.executionPayload ?? {})}
              />
            </>
          ) : null}
          {payloadTab === "plan" ? (
            <>
              <LabeledCodeBlock
                label="Plan Payload"
                value={prettyJson(detail.planPayload ?? {})}
              />
              <LabeledCodeBlock
                label="Policy Decision"
                value={prettyJson(detail.policyDecisionPayload ?? {})}
              />
            </>
          ) : null}
          {payloadTab === "trace" ? (
            <LabeledCodeBlock
              label="Trace Payload"
              value={prettyJson(detail.tracePayload ?? {})}
            />
          ) : null}
          {/* i18n-ignore-end */}
        </div>
      </div>
    </div>
  );
}

const RETRYABLE_RUN_STATUSES = new Set<ActionRunDetail["status"]>([
  "awaiting_slots",
  "awaiting_confirmation",
  "failed",
  "cancelled",
]);

function isRetryableRunStatus(status: ActionRunDetail["status"]): boolean {
  return RETRYABLE_RUN_STATUSES.has(status);
}

function buildActionOperatorSummary(
  overview: ActionRuntimeOverview,
  connectors: ActionConnectorSummary[],
) {
  const t = translateRuntimeMessage;
  const errorConnectors = connectors.filter(
    (connector) => connector.status === "error",
  );
  const notes: string[] = [];

  if (
    overview.rules.policy.entryCharacterSourceKey &&
    !overview.operatorCharacter
  ) {
    notes.push(
      t(msg`当前缺少 sourceKey = ${overview.rules.policy.entryCharacterSourceKey} 的动作角色，真实世界动作链不会正常工作。`),
    );
  }

  if (!overview.rules.policy.entryCharacterSourceKey) {
    notes.push(t(msg`当前未限制动作入口角色，任何角色消息都可能命中动作链。`));
  }

  if (!overview.rules.policy.enabled) {
    notes.push(t(msg`动作入口当前处于关闭状态，用户消息不会进入 Action Runtime。`));
  }

  if (overview.counts.readyConnectors === 0) {
    notes.push(t(msg`当前没有已就绪连接器，先去连接器编排完成配置和启用。`));
  }

  if (overview.counts.awaitingSlots > 0) {
    notes.push(t(msg`有 ${overview.counts.awaitingSlots} 条动作在等待补参数。`));
  }

  if (overview.counts.awaitingConfirmation > 0) {
    notes.push(
      t(msg`有 ${overview.counts.awaitingConfirmation} 条动作在等待用户确认。`),
    );
  }

  if (overview.counts.failed > 0) {
    notes.push(
      t(msg`最近有 ${overview.counts.failed} 条动作执行失败，需要回看 trace。`),
    );
  }

  if (errorConnectors.length > 0) {
    notes.push(
      t(msg`有 ${errorConnectors.length} 个连接器处于 error，优先检查最近错误和凭证状态。`),
    );
  }

  if (!notes.length) {
    return {
      tone: "success" as const,
      title: t(msg`动作链当前可用`),
      notes: [
        t(msg`动作角色、动作入口和连接器状态都正常，可以继续做消息预演或回看成功样本。`),
      ],
    };
  }

  return {
    tone: "warning" as const,
    title: t(msg`当前有动作链待处理事项`),
    notes,
  };
}

function buildActionRunHint(detail: ActionRunDetail) {
  const t = translateRuntimeMessage;
  if (detail.status === "awaiting_slots") {
    return {
      tone: "warning" as const,
      title: t(msg`当前动作在等待补参数`),
      description: detail.missingSlots.length
        ? t(msg`还缺 ${detail.missingSlots.join(" / ")}，先判断是用户表达不完整，还是连接器映射缺失。`)
        : t(msg`当前动作仍处于待补参数状态，先检查 plan 和 slotPayload。`),
    };
  }

  if (detail.status === "awaiting_confirmation") {
    return {
      tone: "info" as const,
      title: t(msg`当前动作在等待用户确认`),
      description:
        t(msg`先看风险等级、确认模板和 Policy Decision，再决定是否需要调整确认词或自动执行范围。`),
    };
  }

  if (detail.status === "failed") {
    return {
      tone: "warning" as const,
      title: t(msg`当前动作执行失败`),
      description:
        t(msg`优先看 Error Payload 和 Trace Payload，其次检查连接器状态、凭证和 endpoint config。`),
    };
  }

  if (detail.status === "succeeded") {
    return {
      tone: "success" as const,
      title: t(msg`当前动作已成功执行`),
      description:
        t(msg`可从 Result Payload 和 Trace Payload 回看动作副作用，并拿这条样本作为后续预演的基线。`),
    };
  }

  if (detail.status === "cancelled") {
    return {
      tone: "muted" as const,
      title: t(msg`当前动作已取消`),
      description: t(msg`回看确认链路和用户拒绝语义，确认这次取消是否符合预期。`),
    };
  }

  return {
    tone: "info" as const,
    title: t(msg`当前动作仍在处理中`),
    description:
      t(msg`继续关注 Trace Payload，确认 planner、执行器和连接器的阶段变化。`),
  };
}

function filterActionRuns(runs: ActionRunSummary[], tab: EvidenceTab) {
  if (tab === "attention") {
    return runs.filter(
      (run) =>
        run.status === "awaiting_slots" ||
        run.status === "awaiting_confirmation" ||
        run.status === "failed" ||
        run.status === "running",
    );
  }

  if (tab === "completed") {
    return runs.filter(
      (run) => run.status === "succeeded" || run.status === "cancelled",
    );
  }

  return runs;
}

function sortConnectorsForOps(connectors: ActionConnectorSummary[]) {
  const priority = new Map<ActionConnectorSummary["status"], number>([
    ["error", 0],
    ["disabled", 1],
    ["ready", 2],
  ]);

  return [...connectors].sort((left, right) => {
    const statusDelta =
      (priority.get(left.status) ?? 99) - (priority.get(right.status) ?? 99);
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return compareAdminText(left.displayName, right.displayName);
  });
}

function syncConnectorDrafts(
  current: Record<string, ConnectorDraft>,
  connectors: ActionConnectorSummary[],
) {
  return Object.fromEntries(
    connectors.map((connector) => [
      connector.id,
      current[connector.id] ?? createConnectorDraft(connector),
    ]),
  );
}

function translatePlannerMode(mode: ActionRuntimeRules["plannerMode"]) {
  const t = translateRuntimeMessage;
  if (mode === "llm_with_heuristic_fallback") {
    return t(msg`LLM 优先 + 回退`);
  }
  if (mode === "llm") {
    return t(msg`纯 LLM`);
  }
  return t(msg`纯规则`);
}

function translateRiskLevel(level: ActionRiskLevel) {
  const t = translateRuntimeMessage;
  if (level === "read_only") {
    return t(msg`只读`);
  }
  if (level === "reversible_low_risk") {
    return t(msg`低风险可逆`);
  }
  return t(msg`付费/不可逆`);
}

function translateRunStatus(status: ActionRunSummary["status"]) {
  const t = translateRuntimeMessage;
  if (status === "awaiting_slots") {
    return t(msg`待补参数`);
  }
  if (status === "awaiting_confirmation") {
    return t(msg`待确认`);
  }
  if (status === "succeeded") {
    return t(msg`已成功`);
  }
  if (status === "failed") {
    return t(msg`失败`);
  }
  if (status === "cancelled") {
    return t(msg`已取消`);
  }
  if (status === "running") {
    return t(msg`执行中`);
  }
  return t(msg`草稿`);
}

function translateConnectorStatus(status: ActionConnectorSummary["status"]) {
  const t = translateRuntimeMessage;
  if (status === "ready") {
    return t(msg`已就绪`);
  }
  if (status === "error") {
    return t(msg`错误`);
  }
  return t(msg`已停用`);
}

function translateProviderType(
  providerType: ActionConnectorSummary["providerType"],
) {
  const t = translateRuntimeMessage;
  if (providerType === "official_api") {
    return t(msg`官方 API`);
  }
  if (providerType === "http_bridge") {
    return "HTTP Bridge";
  }
  if (providerType === "browser_operator") {
    return t(msg`浏览器执行器`);
  }
  return "Mock";
}

function createConnectorDraft(
  connector: ActionConnectorSummary,
): ConnectorDraft {
  return {
    displayName: connector.displayName,
    discoveryQuery: "",
    endpointConfigText: formatEndpointConfig(connector.endpointConfig ?? null),
    testMessage: "",
    credential: "",
  };
}

function isConnectorDirty(
  connector: ActionConnectorSummary,
  draft: ConnectorDraft,
) {
  return (
    draft.credential.trim().length > 0 ||
    draft.displayName.trim() !== connector.displayName ||
    normalizeConfigText(draft.endpointConfigText) !==
      normalizeConfigText(
        formatEndpointConfig(connector.endpointConfig ?? null),
      )
  );
}

function formatEndpointConfig(value: Record<string, unknown> | null) {
  if (!value || !Object.keys(value).length) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function normalizeConfigText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

function parseEndpointConfig(value: string): {
  value: Record<string, unknown> | null;
  error?: string;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed === null) {
      return { value: null };
    }
    if (Array.isArray(parsed) || typeof parsed !== "object") {
      return { value: null, error: "Endpoint Config needs to be a JSON object." };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { value: null, error: "Endpoint Config is not valid JSON." };
  }
}

function mergeHomeAssistantTargetSuggestions(input: {
  currentConfig: Record<string, unknown>;
  suggestions: ActionConnectorDiscoveryResult["items"];
  mode: "all" | "missing";
}) {
  const existingTargets =
    input.currentConfig.deviceTargets &&
    typeof input.currentConfig.deviceTargets === "object" &&
    !Array.isArray(input.currentConfig.deviceTargets)
      ? (input.currentConfig.deviceTargets as Record<string, unknown>)
      : {};
  const nextTargets: Record<string, unknown> = { ...existingTargets };
  let appliedCount = 0;
  let skippedCount = 0;
  let disambiguatedCount = 0;

  for (const suggestion of input.suggestions) {
    const resolvedKey = resolveTargetSuggestionWriteKey({
      nextTargets,
      suggestion,
    });
    if (!resolvedKey) {
      skippedCount += 1;
      continue;
    }
    if (resolvedKey !== suggestion.key) {
      disambiguatedCount += 1;
    }
    nextTargets[resolvedKey] = {
      ...suggestion.targetConfig,
    };
    appliedCount += 1;
  }

  return {
    nextConfig: {
      ...input.currentConfig,
      provider:
        typeof input.currentConfig.provider === "string" &&
        input.currentConfig.provider.trim()
          ? input.currentConfig.provider
          : "home_assistant",
      deviceTargets: nextTargets,
    },
    appliedCount,
    skippedCount,
    disambiguatedCount,
  };
}

function resolveTargetSuggestionWriteKey(input: {
  nextTargets: Record<string, unknown>;
  suggestion: ActionConnectorDiscoveryResult["items"][number];
}) {
  const baseKey = input.suggestion.key.trim();
  if (!baseKey) {
    return null;
  }

  const existing = input.nextTargets[baseKey];
  if (!existing) {
    return baseKey;
  }
  if (isSameTargetEntity(existing, input.suggestion.targetConfig)) {
    return baseKey;
  }

  const room = input.suggestion.suggestedRoom.trim();
  const genericDevice = input.suggestion.suggestedDevice.trim();
  const entitySuffix = input.suggestion.entityId.includes(".")
    ? input.suggestion.entityId.split(".").slice(1).join(".")
    : input.suggestion.entityId;
  const candidates = [
    buildSpecificTargetKeyLabel(
      input.suggestion.registryDeviceName,
      room,
      genericDevice,
    ),
    buildSpecificTargetKeyLabel(
      input.suggestion.friendlyName,
      room,
      genericDevice,
    ),
    buildSpecificTargetKeyLabel(entitySuffix, room, genericDevice),
    `${genericDevice}-${entitySuffix}`,
    input.suggestion.entityId.replace(/\./g, ":"),
  ]
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => (room ? `${room}:${label}` : label));

  for (const candidate of Array.from(new Set(candidates))) {
    const candidateExisting = input.nextTargets[candidate];
    if (
      !candidateExisting ||
      isSameTargetEntity(candidateExisting, input.suggestion.targetConfig)
    ) {
      return candidate;
    }
  }

  return null;
}

function buildSpecificTargetKeyLabel(
  rawValue: string | null | undefined,
  room: string,
  genericDevice: string,
) {
  const normalized = (rawValue ?? "")
    .trim()
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  let text = normalized;
  if (room) {
    text = text.split(room).join(" ");
  }
  text = text
    .replace(
      /\b(light|lamp|switch|fan|climate|cover|media player|humidifier|vacuum)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text === genericDevice) {
    return "";
  }
  // i18n-ignore-start: device name normalization logic — CJK device category strings
  if (
    genericDevice === "灯" &&
    /^(主|副|床头|吊|台|壁|落地|氛围)$/u.test(text)
  ) {
    return `${text}灯`;
  }
  // i18n-ignore-end
  return text;
}

function isSameTargetEntity(
  existingTarget: unknown,
  nextTarget: Record<string, unknown>,
) {
  if (
    !existingTarget ||
    typeof existingTarget !== "object" ||
    Array.isArray(existingTarget)
  ) {
    return false;
  }
  const existingEntityId =
    typeof (existingTarget as Record<string, unknown>).entityId === "string"
      ? ((existingTarget as Record<string, unknown>).entityId as string).trim()
      : "";
  const nextEntityId =
    typeof nextTarget.entityId === "string" ? nextTarget.entityId.trim() : "";
  return Boolean(
    existingEntityId && nextEntityId && existingEntityId === nextEntityId,
  );
}

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatStringList(items: string[]) {
  return items.join("\n");
}

function parseStringList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDateTime(value?: string | null) {
  return formatLocalizedDateTime(
    value,
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
    "notRecorded",
  );
}

function resolveConnectorTone(
  status: ActionRuntimeOverview["connectors"][number]["status"],
) {
  if (status === "ready") {
    return "healthy" as const;
  }
  if (status === "error") {
    return "warning" as const;
  }
  return "muted" as const;
}

function resolveRunTone(
  status: ActionRuntimeOverview["recentRuns"][number]["status"],
) {
  if (status === "succeeded") {
    return "healthy" as const;
  }
  if (
    status === "failed" ||
    status === "awaiting_slots" ||
    status === "awaiting_confirmation"
  ) {
    return "warning" as const;
  }
  return "muted" as const;
}

function translateRunRetryStep(
  step: "awaiting_slots" | "awaiting_confirmation" | "executed",
) {
  const t = translateRuntimeMessage;
  if (step === "awaiting_slots") {
    return t(msg`待补参数`);
  }
  if (step === "awaiting_confirmation") {
    return t(msg`待确认`);
  }
  return t(msg`已重新执行`);
}

function translateDiscoveryTopologySource(source: string) {
  const t = translateRuntimeMessage;
  if (source === "websocket_registry") {
    return t(msg`WebSocket registry 优先`);
  }
  return t(msg`states 启发式`);
}

function translateDiscoverySource(source: string) {
  const t = translateRuntimeMessage;
  if (source === "entity_registry") {
    return "Entity Registry";
  }
  if (source === "device_registry") {
    return "Device Registry";
  }
  if (source === "heuristic") {
    return t(msg`名称启发式`);
  }
  if (source === "unresolved") {
    return t(msg`未识别`);
  }
  return source;
}
