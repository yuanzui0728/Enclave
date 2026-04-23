import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  MetricCard,
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
  AdminSectionNav,
  AdminSelectableCard,
  AdminSoftBox,
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

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "overview", label: "运营总览" },
  { key: "rules", label: "规则编辑" },
  { key: "preview", label: "消息预演" },
  { key: "connectors", label: "连接器编排" },
  { key: "evidence", label: "执行证据" },
];

const RULE_TABS: Array<{ key: RulesTab; label: string }> = [
  { key: "policy", label: "门控策略" },
  { key: "prompts", label: "提示模板" },
];

const PREVIEW_EXAMPLES = [
  {
    label: "智能家居",
    message: "帮我把客厅空调调到 24 度，风速调成自动。",
  },
  {
    label: "轻食外卖",
    message: "今晚帮我点个 40 块以内的轻食外卖。",
  },
  {
    label: "信息查询",
    message: "帮我看看今天上海天气，顺便告诉我适不适合出门。",
  },
];

const RISK_LEVEL_OPTIONS: Array<{
  value: ActionRiskLevel;
  label: string;
  description: string;
}> = [
  {
    value: "read_only",
    label: "只读",
    description: "只整理候选、查询信息，不直接产生副作用。",
  },
  {
    value: "reversible_low_risk",
    label: "低风险可逆",
    description: "例如智能家居状态调整，可自动执行但仍需留痕。",
  },
  {
    value: "cost_or_irreversible",
    label: "付费/不可逆",
    description: "涉及下单、预订、付款，默认必须确认。",
  },
];

const PLANNER_MODE_OPTIONS: Array<{
  value: ActionRuntimeRules["plannerMode"];
  label: string;
}> = [
  {
    value: "llm_with_heuristic_fallback",
    label: "LLM 优先，失败回退规则",
  },
  {
    value: "llm",
    label: "纯 LLM planner",
  },
  {
    value: "heuristic",
    label: "纯规则 planner",
  },
];

export function ActionRuntimePage() {
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
        `已触发动作重试，当前阶段：${translateRunRetryStep(result.nextStep)}。`,
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
    return <LoadingBlock label="正在读取 Action Runtime..." />;
  }

  if (overviewQuery.isError && overviewQuery.error instanceof Error) {
    return <ErrorBlock message={overviewQuery.error.message} />;
  }

  if (!overviewQuery.data || !rulesDraft) {
    return (
      <AdminEmptyState
        title="Action Runtime 暂不可用"
        description="稍后再刷新一次；如果持续为空，先检查后端 action-runtime 模块是否已成功加载。"
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
  const disabledConnectors = sortedConnectors.filter(
    (connector) => connector.status === "disabled",
  );
  const latestSucceededRun =
    completedRuns.find((run) => run.status === "succeeded") ?? null;
  const latestRun = rawRecentRuns[0] ?? null;
  const evidenceTabs: Array<{ key: EvidenceTab; label: string }> = [
    { key: "all", label: `全部运行 (${rawRecentRuns.length})` },
    { key: "attention", label: `待处理 (${attentionRuns.length})` },
    { key: "completed", label: `已完成 (${completedRuns.length})` },
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
      const errorMessage = parsed.error ?? "Endpoint Config 无法解析。";
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
      const errorMessage = parsed.error ?? "Endpoint Config 无法解析。";
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
      const errorMessage = parsed.error ?? "Endpoint Config 无法解析。";
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
      const errorMessage = parsed.error ?? "Endpoint Config 无法解析。";
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
            ? "当前推荐项都已经存在，没有新增映射。"
            : "当前没有可写入的推荐映射。",
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
          ? `已补入 ${mergeResult.appliedCount} 条未配置映射，自动避开 ${mergeResult.disambiguatedCount} 个冲突 key，跳过 ${mergeResult.skippedCount} 条无法处理的项。`
          : `已写入 ${mergeResult.appliedCount} 条推荐映射，自动避开 ${mergeResult.disambiguatedCount} 个冲突 key，跳过 ${mergeResult.skippedCount} 条无法处理的项。`,
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
        title="行动助理真实世界动作工作台"
        description="围绕运营人员的查看路径重排：先看当前动作链是否健康，再决定是改门控、跑预演、校连接器，还是回看执行证据。"
        badges={[
          `承接角色：${
            overview.operatorCharacter?.name ??
            (overview.rules.policy.entryCharacterSourceKey || "未限制角色")
          }`,
        ]}
        metrics={[
          { label: "总动作数", value: overview.counts.totalRuns },
          { label: "待处理动作", value: attentionRuns.length },
          { label: "失败动作", value: overview.counts.failed },
          { label: "已就绪连接器", value: overview.counts.readyConnectors },
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
              刷新概览
            </Button>
            <Button
              variant="secondary"
              disabled={!isRulesDirty}
              onClick={resetRulesDraft}
            >
              重置草稿
            </Button>
            <Button
              variant="primary"
              disabled={!isRulesDirty || saveRulesMutation.isPending}
              onClick={() => saveRulesMutation.mutate(rulesDraft)}
            >
              {saveRulesMutation.isPending ? "保存中..." : "保存规则"}
            </Button>
          </>
        }
      />

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
              查看待处理动作
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (errorConnectors[0]) {
                  setSelectedConnectorId(errorConnectors[0].id);
                  setWorkspaceTab("connectors");
                  return;
                }
                setWorkspaceTab("preview");
              }}
            >
              {errorConnectors.length ? "检查错误连接器" : "去消息预演"}
            </Button>
          </>
        }
      />

      {saveRulesMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title="Action Runtime 规则已保存"
          description="新的门控策略和提示模板已经写入系统配置。"
        />
      ) : null}
      {saveRulesMutation.isError && saveRulesMutation.error instanceof Error ? (
        <ErrorBlock message={saveRulesMutation.error.message} />
      ) : null}
      {runActionFeedback ? (
        <AdminActionFeedback
          tone="info"
          title="动作重试已提交"
          description={runActionFeedback}
        />
      ) : null}
      {retryRunMutation.isError && retryRunMutation.error instanceof Error ? (
        <ErrorBlock message={retryRunMutation.error.message} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.34fr_0.66fr]">
        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <AdminSectionNav
            title="工作区"
            items={[
              {
                label: "运营总览",
                detail:
                  "先确认动作入口、动作角色、待处理动作和连接器是否健康。",
                onClick: () => setWorkspaceTab("overview"),
              },
              {
                label: "规则编辑",
                detail: "拆开看门控策略和提示模板，减少长页面滚动。",
                onClick: () => setWorkspaceTab("rules"),
              },
              {
                label: "消息预演",
                detail: "快速验证一条用户话术是否会命中真实世界动作链。",
                onClick: () => setWorkspaceTab("preview"),
              },
              {
                label: "连接器编排",
                detail: "按选中连接器查看配置、自检、凭证和实体映射。",
                onClick: () => setWorkspaceTab("connectors"),
              },
              {
                label: "执行证据",
                detail: "按待处理、已完成两种视角回看动作运行与完整 trace。",
                onClick: () => setWorkspaceTab("evidence"),
              },
            ]}
          />

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="当前脉冲" />
            <div className="mt-4 grid gap-3">
              <AdminValueCard
                label="动作角色"
                value={
                  overview.operatorCharacter ? (
                    <StatusPill tone="healthy">
                      {overview.operatorCharacter.name}
                    </StatusPill>
                  ) : overview.rules.policy.entryCharacterSourceKey ? (
                    <StatusPill tone="warning">
                      {overview.rules.policy.entryCharacterSourceKey}
                    </StatusPill>
                  ) : (
                    <StatusPill tone="muted">未限制角色</StatusPill>
                  )
                }
              />
              <AdminValueCard
                label="动作入口"
                value={
                  <StatusPill
                    tone={overview.rules.policy.enabled ? "healthy" : "warning"}
                  >
                    {overview.rules.policy.enabled ? "已启用" : "已关闭"}
                  </StatusPill>
                }
              />
              <AdminValueCard
                label="Planner"
                value={translatePlannerMode(overview.rules.plannerMode)}
              />
              <AdminValueCard
                label="待处理动作"
                value={`${attentionRuns.length} 条`}
              />
              <AdminValueCard
                label="错误连接器"
                value={`${errorConnectors.length} 个`}
              />
              <AdminValueCard
                label="最近成功"
                value={
                  latestSucceededRun
                    ? formatDateTime(latestSucceededRun.updatedAt)
                    : "暂无"
                }
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="快捷操作" />
            <div className="mt-4 grid gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setWorkspaceTab("evidence");
                  setEvidenceTab("attention");
                }}
              >
                处理待运营动作
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setWorkspaceTab("connectors");
                  if (errorConnectors[0]) {
                    setSelectedConnectorId(errorConnectors[0].id);
                  }
                }}
              >
                检查连接器
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPreviewMessage(PREVIEW_EXAMPLES[0].message);
                  setWorkspaceTab("preview");
                }}
              >
                预填智能家居示例
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setWorkspaceTab("rules");
                  setRulesTab("policy");
                }}
              >
                编辑动作规则
              </Button>
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="当前选中连接器"
              actions={
                selectedConnector ? (
                  <StatusPill
                    tone={resolveConnectorTone(selectedConnector.status)}
                  >
                    {translateConnectorStatus(selectedConnector.status)}
                  </StatusPill>
                ) : null
              }
            />
            <div className="mt-4">
              {selectedConnector ? (
                <div className="grid gap-3">
                  <AdminValueCard
                    label="名称"
                    value={selectedConnector.displayName}
                  />
                  <AdminValueCard
                    label="类型"
                    value={translateProviderType(
                      selectedConnector.providerType,
                    )}
                  />
                  <AdminValueCard
                    label="能力数"
                    value={`${selectedConnector.capabilities.length} 项`}
                  />
                  <AdminValueCard
                    label="最近自检"
                    value={formatDateTime(selectedConnector.lastHealthCheckAt)}
                  />
                </div>
              ) : (
                <AdminEmptyState
                  title="还没有连接器"
                  description="等 Action Runtime 初始化完连接器后，这里会显示当前选中的一项。"
                />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <AdminTabs
            tabs={WORKSPACE_TABS}
            activeKey={workspaceTab}
            onChange={(key) => setWorkspaceTab(key as WorkspaceTab)}
          />

          {workspaceTab === "overview" ? (
            <div className="space-y-6">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="动作链状态概览"
                  actions={
                    overview.operatorCharacter ? (
                      <StatusPill tone="healthy">
                        动作角色：{overview.operatorCharacter.name}
                      </StatusPill>
                    ) : overview.rules.policy.entryCharacterSourceKey ? (
                      <StatusPill tone="warning">
                        缺少 {overview.rules.policy.entryCharacterSourceKey}
                      </StatusPill>
                    ) : (
                      <StatusPill tone="muted">未限制入口角色</StatusPill>
                    )
                  }
                />
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Planner"
                    value={translatePlannerMode(overview.rules.plannerMode)}
                  />
                  <MetricCard
                    label="自动执行风险等级"
                    value={
                      overview.rules.policy.autoExecuteRiskLevels.length
                        ? overview.rules.policy.autoExecuteRiskLevels
                            .map(translateRiskLevel)
                            .join(" / ")
                        : "无"
                    }
                  />
                  <MetricCard
                    label="可信自动执行操作"
                    value={overview.rules.policy.trustedOperationKeys.length}
                  />
                  <MetricCard
                    label="已停用连接器"
                    value={disabledConnectors.length}
                  />
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <AdminInfoRows
                  title="当前门控"
                  rows={[
                    {
                      label: "动作入口",
                      value: overview.rules.policy.enabled
                        ? "已启用"
                        : "已关闭",
                    },
                    {
                      label: "入口角色 sourceKey",
                      value:
                        overview.rules.policy.entryCharacterSourceKey ||
                        "未限制",
                    },
                    {
                      label: "确认关键词",
                      value:
                        overview.rules.policy.confirmationKeywords.join(
                          " / ",
                        ) || "暂无",
                    },
                    {
                      label: "拒绝关键词",
                      value:
                        overview.rules.policy.rejectionKeywords.join(" / ") ||
                        "暂无",
                    },
                  ]}
                />
                <AdminInfoRows
                  title="当前任务压力"
                  rows={[
                    {
                      label: "待补参数",
                      value: `${overview.counts.awaitingSlots} 条`,
                    },
                    {
                      label: "待确认",
                      value: `${overview.counts.awaitingConfirmation} 条`,
                    },
                    {
                      label: "失败动作",
                      value: `${overview.counts.failed} 条`,
                    },
                    {
                      label: "最近动作",
                      value: latestRun
                        ? formatDateTime(latestRun.updatedAt)
                        : "暂无",
                    },
                  ]}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader
                    title="待运营处理"
                    actions={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setWorkspaceTab("evidence");
                          setEvidenceTab("attention");
                        }}
                      >
                        去执行证据
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
                              查看详情
                            </Button>
                          }
                        />
                      ))
                    ) : (
                      <AdminEmptyState
                        title="当前没有待处理动作"
                        description="没有待补参数、待确认或失败动作，当前动作链可以继续用来做预演和连接器维护。"
                      />
                    )}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader
                    title="连接器状态"
                    actions={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setWorkspaceTab("connectors")}
                      >
                        去连接器编排
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
                          description={`支持 ${connector.capabilities.length} 个操作${
                            connector.lastError
                              ? ` · 最近错误：${connector.lastError}`
                              : ""
                          }`}
                          actions={
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedConnectorId(connector.id);
                                setWorkspaceTab("connectors");
                              }}
                            >
                              打开
                            </Button>
                          }
                        />
                      ))
                    ) : (
                      <AdminEmptyState
                        title="当前没有连接器"
                        description="Action Runtime 初始化完成后，这里会列出可执行的真实世界连接器。"
                      />
                    )}
                  </div>
                </Card>
              </div>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title="最近完成动作" />
                <div className="mt-4 space-y-3">
                  {completedRuns.length ? (
                    completedRuns
                      .slice(0, 4)
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
                      title="还没有完成动作"
                      description="等动作真正执行成功或被取消后，这里会积累最近完成的样本。"
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
                title="规则编辑建议"
                description="门控策略决定哪些消息会进入动作链，提示模板决定进入动作链后的对话方式。先改门控，再调模板，能更快定位问题。"
              />

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="规则编辑"
                  actions={
                    <AdminDraftStatusPill
                      ready={Boolean(rulesDraft)}
                      dirty={isRulesDirty}
                    />
                  }
                />
                <div className="mt-4">
                  <AdminTabs
                    tabs={RULE_TABS}
                    activeKey={rulesTab}
                    onChange={(key) => setRulesTab(key as RulesTab)}
                  />
                </div>
              </Card>

              {rulesTab === "policy" ? (
                <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader title="Planner 与入口" />
                    <div className="mt-4 space-y-6">
                      <AdminSelectField
                        label="Planner Mode"
                        value={rulesDraft.plannerMode}
                        onChange={(value) =>
                          patchRules((current) => ({
                            ...current,
                            plannerMode:
                              value as ActionRuntimeRules["plannerMode"],
                          }))
                        }
                        options={PLANNER_MODE_OPTIONS}
                      />

                      <div className="grid gap-4 md:grid-cols-2">
                        <AdminToggle
                          label="启用动作入口"
                          checked={rulesDraft.policy.enabled}
                          onChange={(checked) =>
                            setPolicyValue("enabled", checked)
                          }
                        />
                        <AdminTextField
                          label="入口角色 sourceKey"
                          value={rulesDraft.policy.entryCharacterSourceKey}
                          onChange={(value) =>
                            setPolicyValue("entryCharacterSourceKey", value)
                          }
                          placeholder="action_operator"
                        />
                      </div>
                      <div className="-mt-2 text-[12px] leading-5 text-[color:var(--text-dim)]">
                        默认是
                        `action_operator`。留空表示不限制角色，只建议用于兼容或排障。
                      </div>

                      <AdminTextArea
                        label="可信自动执行操作"
                        value={formatStringList(
                          rulesDraft.policy.trustedOperationKeys,
                        )}
                        onChange={(value) =>
                          setPolicyValue(
                            "trustedOperationKeys",
                            parseStringList(value),
                          )
                        }
                        description="只有同时命中“自动执行风险等级”和这里的 operationKey，动作才会直接执行。"
                        textareaClassName="min-h-32"
                      />
                    </div>
                  </Card>

                  <div className="space-y-6">
                    <Card className="bg-[color:var(--surface-console)]">
                      <AdminSectionHeader title="确认与拒绝语义" />
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <AdminTextArea
                          label="确认关键词"
                          value={formatStringList(
                            rulesDraft.policy.confirmationKeywords,
                          )}
                          onChange={(value) =>
                            setPolicyValue(
                              "confirmationKeywords",
                              parseStringList(value),
                            )
                          }
                          description="每行一个关键词；用户说到这些词时，待确认动作会继续执行。"
                          textareaClassName="min-h-32"
                        />
                        <AdminTextArea
                          label="拒绝关键词"
                          value={formatStringList(
                            rulesDraft.policy.rejectionKeywords,
                          )}
                          onChange={(value) =>
                            setPolicyValue(
                              "rejectionKeywords",
                              parseStringList(value),
                            )
                          }
                          description="每行一个关键词；命中后，待确认动作会直接取消。"
                          textareaClassName="min-h-32"
                        />
                      </div>
                    </Card>

                    <Card className="bg-[color:var(--surface-console)]">
                      <AdminSectionHeader title="自动执行风险等级" />
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                                  {option.label}
                                </div>
                                <StatusPill tone={active ? "healthy" : "muted"}>
                                  {active ? "自动执行" : "需额外判断"}
                                </StatusPill>
                              </div>
                              <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                                {option.description}
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
                    <AdminSectionHeader title="Planner 与中间态文案" />
                    <div className="mt-4 space-y-4">
                      <AdminTextArea
                        label="Planner Prompt"
                        value={rulesDraft.promptTemplates.plannerSystemPrompt}
                        onChange={(value) =>
                          setPromptTemplate("plannerSystemPrompt", value)
                        }
                        textareaClassName="min-h-40"
                      />
                      <AdminTextArea
                        label="澄清模板"
                        value={rulesDraft.promptTemplates.clarificationTemplate}
                        onChange={(value) =>
                          setPromptTemplate("clarificationTemplate", value)
                        }
                      />
                      <AdminTextArea
                        label="确认模板"
                        value={rulesDraft.promptTemplates.confirmationTemplate}
                        onChange={(value) =>
                          setPromptTemplate("confirmationTemplate", value)
                        }
                      />
                      <AdminTextArea
                        label="待确认提醒模板"
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
                    <AdminSectionHeader title="执行结果文案" />
                    <div className="mt-4 space-y-4">
                      <AdminTextArea
                        label="成功模板"
                        value={rulesDraft.promptTemplates.successTemplate}
                        onChange={(value) =>
                          setPromptTemplate("successTemplate", value)
                        }
                      />
                      <AdminTextArea
                        label="失败模板"
                        value={rulesDraft.promptTemplates.failureTemplate}
                        onChange={(value) =>
                          setPromptTemplate("failureTemplate", value)
                        }
                      />
                      <AdminTextArea
                        label="取消模板"
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
                title="消息预演"
                description="这里用来验证“某句话是否会命中真实世界动作链”。先预演，再回去改门控或提示模板，定位会更快。"
              />

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="预演输入"
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
                      {previewMutation.isPending ? "预演中..." : "运行预演"}
                    </Button>
                  }
                />
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {PREVIEW_EXAMPLES.map((example) => (
                      <Button
                        key={example.label}
                        variant="secondary"
                        size="sm"
                        onClick={() => setPreviewMessage(example.message)}
                      >
                        {example.label}
                      </Button>
                    ))}
                  </div>
                  <AdminTextArea
                    label="候选消息"
                    value={previewMessage}
                    onChange={setPreviewMessage}
                    placeholder="例如：帮我把客厅空调调到 24 度，或者今晚给我点个 40 块以内的轻食外卖。"
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
                      title="预演结论"
                      actions={
                        <StatusPill
                          tone={
                            previewMutation.data.handled ? "healthy" : "muted"
                          }
                        >
                          {previewMutation.data.handled
                            ? "命中动作链"
                            : "未命中"}
                        </StatusPill>
                      }
                    />
                    <div className="mt-4 space-y-4">
                      <AdminSoftBox>
                        判定原因：{previewMutation.data.reason}
                      </AdminSoftBox>
                      <AdminSoftBox>
                        回复预览：
                        <div className="mt-2">
                          {previewMutation.data.responsePreview ??
                            "当前消息会继续走普通聊天链路。"}
                        </div>
                      </AdminSoftBox>
                      {previewMutation.data.plan ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <AdminValueCard
                            label="标题"
                            value={previewMutation.data.plan.title}
                          />
                          <AdminValueCard
                            label="风险等级"
                            value={translateRiskLevel(
                              previewMutation.data.plan.riskLevel,
                            )}
                          />
                          <AdminValueCard
                            label="是否要求确认"
                            value={
                              previewMutation.data.plan.requiresConfirmation
                                ? "是"
                                : "否"
                            }
                          />
                          <AdminValueCard
                            label="缺失参数"
                            value={
                              previewMutation.data.plan.missingSlots.length
                                ? previewMutation.data.plan.missingSlots.join(
                                    " / ",
                                  )
                                : "无"
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  </Card>

                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader title="Plan 明细" />
                    <div className="mt-4">
                      {previewMutation.data.plan ? (
                        <AdminCodeBlock
                          value={prettyJson(previewMutation.data.plan)}
                        />
                      ) : (
                        <AdminEmptyState
                          title="当前没有 plan"
                          description="这条话术没有命中动作链，所以没有生成动作 plan。"
                        />
                      )}
                    </div>
                  </Card>
                </div>
              ) : (
                <AdminEmptyState
                  title="还没有预演结果"
                  description="输入一条候选消息后点“运行预演”，这里会显示是否命中动作链以及生成出的 plan。"
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
                    ? "当前有连接器需要处理"
                    : "连接器总体状态正常"
                }
                description={
                  errorConnectors.length
                    ? `当前共有 ${errorConnectors.length} 个连接器处于 error。优先看最近错误、凭证状态和自检结果。`
                    : "建议先选中某个连接器，再在右侧统一完成配置、自检和启停操作。"
                }
              />

              <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title="连接器列表" />
                  <div className="mt-4 space-y-3">
                    {sortedConnectors.length ? (
                      sortedConnectors.map((connector) => (
                        <AdminSelectableCard
                          key={connector.id}
                          active={selectedConnectorId === connector.id}
                          title={connector.displayName}
                          subtitle={`${translateProviderType(connector.providerType)} · ${connector.capabilities.length} 个动作`}
                          meta={[
                            connector.connectorKey,
                            connector.lastHealthCheckAt
                              ? `最近自检 ${formatDateTime(
                                  connector.lastHealthCheckAt,
                                )}`
                              : "尚未自检",
                          ].join(" · ")}
                          badge={
                            <StatusPill
                              tone={resolveConnectorTone(connector.status)}
                            >
                              {translateConnectorStatus(connector.status)}
                            </StatusPill>
                          }
                          activeLabel="当前编辑"
                          onClick={() => setSelectedConnectorId(connector.id)}
                        />
                      ))
                    ) : (
                      <AdminEmptyState
                        title="还没有连接器"
                        description="Action Runtime 初始化完成后，这里会列出真实世界连接器。"
                      />
                    )}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  {!selectedConnector || !selectedConnectorDraft ? (
                    <AdminEmptyState
                      title="未选择连接器"
                      description="从左侧点开一个连接器后，这里会展示它的配置、凭证、自检和映射详情。"
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
                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="secondary"
                            disabled={
                              selectedConnectorSaving || !selectedConnectorDirty
                            }
                            onClick={() =>
                              handleSaveConnector(selectedConnector)
                            }
                          >
                            {selectedConnectorSaving ? "保存中..." : "保存配置"}
                          </Button>
                          {selectedConnector.providerType === "official_api" ||
                          selectedConnector.providerType === "http_bridge" ? (
                            <Button
                              variant="secondary"
                              disabled={
                                selectedConnectorSaving ||
                                !selectedConnector.credentialConfigured
                              }
                              onClick={() =>
                                handleClearConnectorCredential(
                                  selectedConnector,
                                )
                              }
                            >
                              清除凭证
                            </Button>
                          ) : null}
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
                              ? "自检中..."
                              : "测试连接器"}
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
                                ? "发现中..."
                                : "发现实体"}
                            </Button>
                          ) : null}
                          <Button
                            variant="secondary"
                            disabled={
                              Boolean(selectedConnectorToggling) ||
                              selectedConnector.status === "ready"
                            }
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
                              ? "启用中..."
                              : "启用"}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={
                              Boolean(selectedConnectorToggling) ||
                              selectedConnector.status === "disabled"
                            }
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
                              ? "停用中..."
                              : "停用"}
                          </Button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <AdminValueCard
                            label="类型"
                            value={translateProviderType(
                              selectedConnector.providerType,
                            )}
                          />
                          <AdminValueCard
                            label="能力数"
                            value={`${selectedConnector.capabilities.length} 项`}
                          />
                          <AdminValueCard
                            label="最近自检"
                            value={formatDateTime(
                              selectedConnector.lastHealthCheckAt,
                            )}
                          />
                          <AdminValueCard
                            label="最后更新时间"
                            value={formatDateTime(selectedConnector.updatedAt)}
                          />
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <AdminMiniPanel title="支持操作" tone="soft">
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
                                          ? " · 需确认"
                                          : ""}
                                      </div>
                                    </AdminSoftBox>
                                  ),
                                )
                              ) : (
                                <AdminSoftBox>
                                  当前未声明可执行动作。
                                </AdminSoftBox>
                              )}
                            </div>
                          </AdminMiniPanel>

                          <AdminMiniPanel title="运维提示" tone="soft">
                            <div className="space-y-2">
                              <AdminSoftBox>
                                {selectedConnector.status === "error"
                                  ? "当前连接器处于 error，优先检查最近错误、自检结果和凭证。"
                                  : selectedConnector.status === "disabled"
                                    ? "当前连接器已停用，保存配置后记得重新启用。"
                                    : "当前连接器已就绪，可以直接做自检和预演验证。"}
                              </AdminSoftBox>
                              <AdminSoftBox>
                                凭证状态：
                                {selectedConnector.credentialConfigured
                                  ? " 已配置"
                                  : " 未配置"}
                              </AdminSoftBox>
                              <AdminSoftBox>
                                最后错误：
                                {selectedConnector.lastError || " 暂无"}
                              </AdminSoftBox>
                            </div>
                          </AdminMiniPanel>
                        </div>

                        {selectedConnector.providerType === "http_bridge" ? (
                          <AdminCallout
                            tone="info"
                            title="HTTP Bridge 契约"
                            description="服务端会向 `endpointConfig.url` 发送 JSON：`{ connectorKey, operationKey, domain, title, goal, riskLevel, requiresConfirmation, previewOnly, slots, missingSlots, sentAt }`。返回 JSON 时优先读取 `resultSummary` / `summary`、`result`、`execution`。"
                          />
                        ) : null}

                        {selectedConnector.connectorKey ===
                        "official-home-assistant-smart-home" ? (
                          <div className="space-y-4">
                            <AdminCallout
                              tone="info"
                              title="Home Assistant 配置方式"
                              description="填写 `baseUrl`，把 Long-Lived Access Token 填进 credential。`deviceTargets` 用 “房间:设备” 作为 key，例如 `客厅:空调`；每个 target 至少包含 `entityId`，可选 `serviceDomain`、`turnOnService`、`turnOffService`、`setTemperatureService`、`temperatureField`。"
                            />
                            <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                                    实体发现与映射向导
                                  </div>
                                  <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                                    会优先通过 Home Assistant WebSocket registry
                                    识别 area / device / entity
                                    关系，失败时回退到
                                    `/api/states`，并给出推荐的 `deviceTargets`
                                    键。
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
                                    ? "发现中..."
                                    : "发现实体"}
                                </Button>
                              </div>
                              <div className="mt-4">
                                <AdminTextField
                                  label="发现筛选词"
                                  value={selectedConnectorDraft.discoveryQuery}
                                  onChange={(value) =>
                                    updateConnectorDraft(selectedConnector.id, {
                                      discoveryQuery: value,
                                    })
                                  }
                                  placeholder="可按房间、设备、entity_id 检索，例如 客厅 / 空调 / light."
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
                                        ? `发现到 ${selectedConnectorDiscoveryResult.itemCount} 个候选实体`
                                        : "没有发现匹配实体"
                                    }
                                    description={`拉取时间 ${formatDateTime(selectedConnectorDiscoveryResult.fetchedAt)}${
                                      selectedConnectorDiscoveryResult.query
                                        ? `，当前筛选：${selectedConnectorDiscoveryResult.query}`
                                        : ""
                                    }。房间识别模式：${translateDiscoveryTopologySource(
                                      selectedConnectorDiscoveryResult.topologySource,
                                    )}。点“写入映射”会把推荐 target 合并进当前草稿，不会自动保存。`}
                                  />
                                  {selectedConnectorDiscoveryResult.warnings.map(
                                    (warning) => (
                                      <AdminCallout
                                        key={warning}
                                        tone="warning"
                                        title="识别回退提示"
                                        description={warning}
                                      />
                                    ),
                                  )}
                                  {selectedConnectorFeedback ? (
                                    <AdminCallout
                                      tone="success"
                                      title="映射草稿已更新"
                                      description={selectedConnectorFeedback}
                                    />
                                  ) : null}
                                  <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
                                    <div className="text-sm leading-6 text-[color:var(--text-secondary)]">
                                      当前草稿已有{" "}
                                      {countExistingMappedTargets(
                                        selectedConnector,
                                      )}{" "}
                                      条 deviceTargets 映射。
                                    </div>
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
                                      只补未配置项
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
                                      批量写入全部
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
                                              当前状态 {item.state}
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
                                            写入映射
                                          </Button>
                                        </div>
                                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                                          <MetricCard
                                            label="推荐房间"
                                            value={
                                              item.suggestedRoom || "未识别"
                                            }
                                          />
                                          <MetricCard
                                            label="推荐设备"
                                            value={
                                              item.suggestedDevice || "设备"
                                            }
                                          />
                                          <MetricCard
                                            label="映射键"
                                            value={item.key}
                                          />
                                        </div>
                                        <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                                          房间来源：
                                          {translateDiscoverySource(
                                            item.roomSource,
                                          )}
                                          {item.registryAreaName
                                            ? `（${item.registryAreaName}）`
                                            : ""}{" "}
                                          · 设备来源：
                                          {translateDiscoverySource(
                                            item.deviceSource,
                                          )}
                                          {item.registryDeviceName
                                            ? `（${item.registryDeviceName}）`
                                            : ""}
                                        </div>
                                        <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                                          可执行动作：
                                          {item.availableActions.join(" / ")}
                                        </div>
                                        <div className="mt-3">
                                          <LabeledCodeBlock
                                            label="Target Config"
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
                          label="显示名称"
                          value={selectedConnectorDraft.displayName}
                          onChange={(value) =>
                            updateConnectorDraft(selectedConnector.id, {
                              displayName: value,
                            })
                          }
                        />
                        <AdminTextArea
                          label="Endpoint Config JSON"
                          value={selectedConnectorDraft.endpointConfigText}
                          onChange={(value) =>
                            updateConnectorDraft(selectedConnector.id, {
                              endpointConfigText: value,
                            })
                          }
                          placeholder='例如：{"city":"上海"}'
                          textareaClassName="min-h-36 font-mono text-xs"
                        />
                        <AdminTextArea
                          label="测试消息"
                          value={selectedConnectorDraft.testMessage}
                          onChange={(value) =>
                            updateConnectorDraft(selectedConnector.id, {
                              testMessage: value,
                            })
                          }
                          placeholder="留空则使用系统默认样例。"
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
                                ? "已配置新凭证时再覆盖；留空则保持不变。"
                                : "输入凭证后保存。"
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
                            title="最近一次连接器错误"
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
                                ? "凭证已配置"
                                : "凭证未配置"
                            }
                            description={
                              selectedConnector.providerType === "official_api"
                                ? "官方 API 连接器不会回显已保存 token；填写新值并保存即可覆盖。"
                                : "Bridge credential 同样只写入不回显；需要替换时重新填写并保存。"
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
                                  ? "连接器自检通过"
                                  : "连接器自检失败"
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
                    ? "当前有待处理动作"
                    : "当前没有待处理动作"
                }
                description={
                  attentionRuns.length
                    ? "优先从“待处理”视角回看等待补参数、等待确认和执行失败的动作，再决定是改规则、补连接器还是重试。"
                    : "最近动作已经基本收口，可以从“已完成”回看成功样本，或者去消息预演继续做验证。"
                }
              />

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title="运行筛选" />
                <div className="mt-4">
                  <AdminTabs
                    tabs={evidenceTabs}
                    activeKey={evidenceTab}
                    onChange={(key) => setEvidenceTab(key as EvidenceTab)}
                  />
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title="运行列表" />
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
                          activeLabel="当前查看"
                          onClick={() => setSelectedRunId(run.id)}
                        />
                      ))
                    ) : (
                      <AdminEmptyState
                        title="当前筛选下没有动作"
                        description="切换到其它筛选，或者先在真实对话里触发一次动作链。"
                      />
                    )}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader
                    title="动作详情"
                    actions={
                      selectedRunId ? (
                        <Button
                          variant="secondary"
                          disabled={retryRunMutation.isPending}
                          onClick={() => retryRunMutation.mutate(selectedRunId)}
                        >
                          {retryRunMutation.isPending
                            ? "重试中..."
                            : "重试动作"}
                        </Button>
                      ) : undefined
                    }
                  />
                  <div className="mt-4">
                    {!selectedRunId ? (
                      <AdminEmptyState
                        title="还没有选中动作"
                        description="从左侧点开一条运行记录后，这里会展示 plan、执行结果和完整 trace。"
                      />
                    ) : runDetailQuery.isLoading ? (
                      <LoadingBlock label="正在读取动作详情..." />
                    ) : runDetailQuery.isError &&
                      runDetailQuery.error instanceof Error ? (
                      <ErrorBlock message={runDetailQuery.error.message} />
                    ) : runDetailQuery.data ? (
                      <ActionRunDetailPanel detail={runDetailQuery.data} />
                    ) : (
                      <AdminEmptyState
                        title="动作详情暂不可用"
                        description="刷新一次概览；如果仍然为空，说明当前动作还没写入详情。"
                      />
                    )}
                  </div>
                </Card>
              </div>
            </div>
          ) : null}
        </div>
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

function ActionRunDetailPanel({ detail }: { detail: ActionRunDetail }) {
  const hint = buildActionRunHint(detail);

  return (
    <div className="space-y-4">
      <AdminCallout
        tone={hint.tone}
        title={hint.title}
        description={hint.description}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminValueCard
          label="状态"
          value={
            <StatusPill tone={resolveRunTone(detail.status)}>
              {translateRunStatus(detail.status)}
            </StatusPill>
          }
        />
        <AdminValueCard
          label="风险等级"
          value={translateRiskLevel(detail.riskLevel)}
        />
        <AdminValueCard
          label="是否要求确认"
          value={detail.requiresConfirmation ? "是" : "否"}
        />
        <AdminValueCard
          label="更新时间"
          value={formatDateTime(detail.updatedAt)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminMiniPanel title="动作摘要" tone="soft">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <AdminSoftBox>标题：{detail.title}</AdminSoftBox>
            <AdminSoftBox>用户目标：{detail.userGoal}</AdminSoftBox>
            <AdminSoftBox>
              连接器：{detail.connectorKey} · {detail.operationKey}
            </AdminSoftBox>
          </div>
        </AdminMiniPanel>

        <AdminMiniPanel title="参数情况" tone="soft">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <AdminSoftBox>
              缺失参数：
              {detail.missingSlots.length
                ? detail.missingSlots.join(" / ")
                : " 无"}
            </AdminSoftBox>
            <AdminSoftBox>
              结果摘要：{detail.resultSummary || "暂无"}
            </AdminSoftBox>
            <AdminSoftBox>
              错误信息：{detail.errorMessage || "暂无"}
            </AdminSoftBox>
          </div>
        </AdminMiniPanel>
      </div>

      <LabeledCodeBlock
        label="Plan Payload"
        value={prettyJson(detail.planPayload ?? {})}
      />
      <LabeledCodeBlock
        label="Policy Decision"
        value={prettyJson(detail.policyDecisionPayload ?? {})}
      />
      <LabeledCodeBlock
        label="Confirmation Payload"
        value={prettyJson(detail.confirmationPayload ?? {})}
      />
      <LabeledCodeBlock
        label="Execution Payload"
        value={prettyJson(detail.executionPayload ?? {})}
      />
      <LabeledCodeBlock
        label="Result Payload"
        value={prettyJson(detail.resultPayload ?? {})}
      />
      <LabeledCodeBlock
        label="Error Payload"
        value={prettyJson(detail.errorPayload ?? {})}
      />
      <LabeledCodeBlock
        label="Trace Payload"
        value={prettyJson(detail.tracePayload ?? {})}
      />
    </div>
  );
}

function buildActionOperatorSummary(
  overview: ActionRuntimeOverview,
  connectors: ActionConnectorSummary[],
) {
  const errorConnectors = connectors.filter(
    (connector) => connector.status === "error",
  );
  const notes: string[] = [];

  if (
    overview.rules.policy.entryCharacterSourceKey &&
    !overview.operatorCharacter
  ) {
    notes.push(
      `当前缺少 sourceKey = ${overview.rules.policy.entryCharacterSourceKey} 的动作角色，真实世界动作链不会正常工作。`,
    );
  }

  if (!overview.rules.policy.entryCharacterSourceKey) {
    notes.push("当前未限制动作入口角色，任何角色消息都可能命中动作链。");
  }

  if (!overview.rules.policy.enabled) {
    notes.push("动作入口当前处于关闭状态，用户消息不会进入 Action Runtime。");
  }

  if (overview.counts.readyConnectors === 0) {
    notes.push("当前没有已就绪连接器，先去连接器编排完成配置和启用。");
  }

  if (overview.counts.awaitingSlots > 0) {
    notes.push(`有 ${overview.counts.awaitingSlots} 条动作在等待补参数。`);
  }

  if (overview.counts.awaitingConfirmation > 0) {
    notes.push(
      `有 ${overview.counts.awaitingConfirmation} 条动作在等待用户确认。`,
    );
  }

  if (overview.counts.failed > 0) {
    notes.push(
      `最近有 ${overview.counts.failed} 条动作执行失败，需要回看 trace。`,
    );
  }

  if (errorConnectors.length > 0) {
    notes.push(
      `有 ${errorConnectors.length} 个连接器处于 error，优先检查最近错误和凭证状态。`,
    );
  }

  if (!notes.length) {
    return {
      tone: "success" as const,
      title: "动作链当前可用",
      notes: [
        "动作角色、动作入口和连接器状态都正常，可以继续做消息预演或回看成功样本。",
      ],
    };
  }

  return {
    tone: "warning" as const,
    title: "当前有动作链待处理事项",
    notes,
  };
}

function buildActionRunHint(detail: ActionRunDetail) {
  if (detail.status === "awaiting_slots") {
    return {
      tone: "warning" as const,
      title: "当前动作在等待补参数",
      description: detail.missingSlots.length
        ? `还缺 ${detail.missingSlots.join(" / ")}，先判断是用户表达不完整，还是连接器映射缺失。`
        : "当前动作仍处于待补参数状态，先检查 plan 和 slotPayload。",
    };
  }

  if (detail.status === "awaiting_confirmation") {
    return {
      tone: "info" as const,
      title: "当前动作在等待用户确认",
      description:
        "先看风险等级、确认模板和 Policy Decision，再决定是否需要调整确认词或自动执行范围。",
    };
  }

  if (detail.status === "failed") {
    return {
      tone: "warning" as const,
      title: "当前动作执行失败",
      description:
        "优先看 Error Payload 和 Trace Payload，其次检查连接器状态、凭证和 endpoint config。",
    };
  }

  if (detail.status === "succeeded") {
    return {
      tone: "success" as const,
      title: "当前动作已成功执行",
      description:
        "可从 Result Payload 和 Trace Payload 回看动作副作用，并拿这条样本作为后续预演的基线。",
    };
  }

  if (detail.status === "cancelled") {
    return {
      tone: "muted" as const,
      title: "当前动作已取消",
      description: "回看确认链路和用户拒绝语义，确认这次取消是否符合预期。",
    };
  }

  return {
    tone: "info" as const,
    title: "当前动作仍在处理中",
    description:
      "继续关注 Trace Payload，确认 planner、执行器和连接器的阶段变化。",
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
  if (mode === "llm_with_heuristic_fallback") {
    return "LLM 优先 + 回退";
  }
  if (mode === "llm") {
    return "纯 LLM";
  }
  return "纯规则";
}

function translateRiskLevel(level: ActionRiskLevel) {
  if (level === "read_only") {
    return "只读";
  }
  if (level === "reversible_low_risk") {
    return "低风险可逆";
  }
  return "付费/不可逆";
}

function translateRunStatus(status: ActionRunSummary["status"]) {
  if (status === "awaiting_slots") {
    return "待补参数";
  }
  if (status === "awaiting_confirmation") {
    return "待确认";
  }
  if (status === "succeeded") {
    return "已成功";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "cancelled") {
    return "已取消";
  }
  if (status === "running") {
    return "执行中";
  }
  return "草稿";
}

function translateConnectorStatus(status: ActionConnectorSummary["status"]) {
  if (status === "ready") {
    return "已就绪";
  }
  if (status === "error") {
    return "错误";
  }
  return "已停用";
}

function translateProviderType(
  providerType: ActionConnectorSummary["providerType"],
) {
  if (providerType === "official_api") {
    return "官方 API";
  }
  if (providerType === "http_bridge") {
    return "HTTP Bridge";
  }
  if (providerType === "browser_operator") {
    return "浏览器执行器";
  }
  return "Mock";
}

function createConnectorDrafts(connectors: ActionConnectorSummary[]) {
  return Object.fromEntries(
    connectors.map((connector) => [
      connector.id,
      createConnectorDraft(connector),
    ]),
  );
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
      return { value: null, error: "Endpoint Config 需要是 JSON 对象。" };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { value: null, error: "Endpoint Config 不是合法 JSON。" };
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
  if (
    genericDevice === "灯" &&
    /^(主|副|床头|吊|台|壁|落地|氛围)$/u.test(text)
  ) {
    return `${text}灯`;
  }
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
  if (step === "awaiting_slots") {
    return "待补参数";
  }
  if (step === "awaiting_confirmation") {
    return "待确认";
  }
  return "已重新执行";
}

function translateDiscoveryTopologySource(source: string) {
  if (source === "websocket_registry") {
    return "WebSocket registry 优先";
  }
  return "states 启发式";
}

function translateDiscoverySource(source: string) {
  if (source === "entity_registry") {
    return "Entity Registry";
  }
  if (source === "device_registry") {
    return "Device Registry";
  }
  if (source === "heuristic") {
    return "名称启发式";
  }
  if (source === "unresolved") {
    return "未识别";
  }
  return source;
}
