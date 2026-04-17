import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActionConnectorDiscoveryResult,
  ActionConnectorSummary,
  ActionConnectorTestResult,
  ActionRiskLevel,
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
  AdminEmptyState,
  AdminInfoRows,
  AdminPageHero,
  AdminRecordCard,
  AdminSelectField,
  AdminSectionHeader,
  AdminTextArea,
  AdminTextField,
  AdminToggle,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

type ConnectorDraft = {
  displayName: string;
  discoveryQuery: string;
  endpointConfigText: string;
  testMessage: string;
  credential: string;
};

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
  const [rulesDraft, setRulesDraft] = useState<ActionRuntimeRules | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
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

  useEffect(() => {
    if (!overviewQuery.data) {
      return;
    }
    setRulesDraft(overviewQuery.data.rules);
    setConnectorDrafts(createConnectorDrafts(overviewQuery.data.connectors));
    if (!selectedRunId && overviewQuery.data.recentRuns[0]) {
      setSelectedRunId(overviewQuery.data.recentRuns[0].id);
    }
  }, [overviewQuery.data, selectedRunId]);

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
          endpointConfigText: formatEndpointConfig(connector.endpointConfig ?? null),
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
    }) =>
      adminApi.discoverActionRuntimeConnector(payload.id, {
        query: payload.query?.trim() || null,
        limit: payload.limit ?? null,
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
      if (isConnectorDirty(connector, draft)) {
        await saveConnectorMutation.mutateAsync({
          id: connector.id,
          displayName: draft.displayName.trim() || connector.displayName,
          endpointConfig: parsed.value,
          credential: draft.credential.trim() || null,
        });
      }
      await discoverConnectorMutation.mutateAsync({
        id: connector.id,
        query: draft.discoveryQuery,
        limit: 30,
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
          ? `已补入 ${mergeResult.appliedCount} 条未配置映射，跳过 ${mergeResult.skippedCount} 条已存在项。`
          : `已写入 ${mergeResult.appliedCount} 条推荐映射，其中覆盖 ${mergeResult.overwrittenCount} 条已存在项。`,
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
        title="self 角色真实世界动作台"
        description="这一版把 self 角色的真实世界动作链补到可运维：规则门控、提示模板、连接器配置、连接器自检、动作重试和完整 trace 都能在后台直接查看和调整。"
        metrics={[
          { label: "总动作数", value: overview.counts.totalRuns },
          { label: "待补参数", value: overview.counts.awaitingSlots },
          { label: "待确认", value: overview.counts.awaitingConfirmation },
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
              variant="primary"
              disabled={!isRulesDirty || saveRulesMutation.isPending}
              onClick={() => saveRulesMutation.mutate(rulesDraft)}
            >
              {saveRulesMutation.isPending ? "保存中..." : "保存规则"}
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

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="运行总览"
              actions={
                overview.selfCharacter ? (
                  <StatusPill tone="healthy">
                    self 角色：{overview.selfCharacter.name}
                  </StatusPill>
                ) : (
                  <StatusPill tone="warning">缺少 self 角色</StatusPill>
                )
              }
            />
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Planner" value={overview.rules.plannerMode} />
              <MetricCard
                label="自动执行风险等级"
                value={
                  overview.rules.policy.autoExecuteRiskLevels.join(" / ") ||
                  "无"
                }
              />
              <MetricCard
                label="可信自动执行操作"
                value={overview.rules.policy.trustedOperationKeys.length}
              />
            </div>
            <div className="mt-4">
              <AdminInfoRows
                title="当前门控"
                rows={[
                  {
                    label: "动作入口",
                    value: overview.rules.policy.enabled ? "已启用" : "已关闭",
                  },
                  {
                    label: "仅 self 角色",
                    value: overview.rules.policy.selfRoleOnly ? "是" : "否",
                  },
                  {
                    label: "确认关键词",
                    value:
                      overview.rules.policy.confirmationKeywords.join(" / "),
                  },
                  {
                    label: "拒绝关键词",
                    value: overview.rules.policy.rejectionKeywords.join(" / "),
                  },
                ]}
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="规则与提示模板"
              actions={
                <StatusPill tone={isRulesDirty ? "warning" : "muted"}>
                  {isRulesDirty ? "草稿未保存" : "已同步"}
                </StatusPill>
              }
            />
            <div className="mt-4 space-y-6">
              <AdminSelectField
                label="Planner Mode"
                value={rulesDraft.plannerMode}
                onChange={(value) =>
                  patchRules((current) => ({
                    ...current,
                    plannerMode: value as ActionRuntimeRules["plannerMode"],
                  }))
                }
                options={PLANNER_MODE_OPTIONS}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <AdminToggle
                  label="启用动作入口"
                  checked={rulesDraft.policy.enabled}
                  onChange={(checked) => setPolicyValue("enabled", checked)}
                />
                <AdminToggle
                  label="仅对 self 角色生效"
                  checked={rulesDraft.policy.selfRoleOnly}
                  onChange={(checked) =>
                    setPolicyValue("selfRoleOnly", checked)
                  }
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
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
                  textareaClassName="min-h-28"
                />
                <AdminTextArea
                  label="拒绝关键词"
                  value={formatStringList(rulesDraft.policy.rejectionKeywords)}
                  onChange={(value) =>
                    setPolicyValue("rejectionKeywords", parseStringList(value))
                  }
                  description="每行一个关键词；命中后，待确认动作会直接取消。"
                  textareaClassName="min-h-28"
                />
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                  自动执行风险等级
                </div>
                <div className="grid gap-3 md:grid-cols-3">
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
              </div>

              <AdminTextArea
                label="可信自动执行操作"
                value={formatStringList(rulesDraft.policy.trustedOperationKeys)}
                onChange={(value) =>
                  setPolicyValue("trustedOperationKeys", parseStringList(value))
                }
                description="只有同时命中“自动执行风险等级”和这里的 operationKey，动作才会直接执行。"
                textareaClassName="min-h-28"
              />

              <AdminTextArea
                label="Planner Prompt"
                value={rulesDraft.promptTemplates.plannerSystemPrompt}
                onChange={(value) =>
                  setPromptTemplate("plannerSystemPrompt", value)
                }
                textareaClassName="min-h-36"
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
              <div className="grid gap-4 xl:grid-cols-2">
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
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <AdminTextArea
                  label="取消模板"
                  value={rulesDraft.promptTemplates.cancelledTemplate}
                  onChange={(value) =>
                    setPromptTemplate("cancelledTemplate", value)
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
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="消息预演"
              actions={
                <Button
                  variant="primary"
                  disabled={!previewMessage.trim() || previewMutation.isPending}
                  onClick={() => previewMutation.mutate(previewMessage.trim())}
                >
                  {previewMutation.isPending ? "预演中..." : "运行预演"}
                </Button>
              }
            />
            <div className="mt-4">
              <AdminTextArea
                label="候选消息"
                value={previewMessage}
                onChange={setPreviewMessage}
                placeholder="例如：帮我把客厅空调调到 24 度，或者今晚给我点个 40 块以内的轻食外卖。"
              />
            </div>
            {previewMutation.isError &&
            previewMutation.error instanceof Error ? (
              <ErrorBlock
                className="mt-4"
                message={previewMutation.error.message}
              />
            ) : null}
            {previewMutation.data ? (
              <div className="mt-4 space-y-4">
                <AdminRecordCard
                  title={
                    previewMutation.data.handled ? "命中动作链" : "未命中动作链"
                  }
                  badges={
                    <StatusPill
                      tone={previewMutation.data.handled ? "healthy" : "muted"}
                    >
                      {previewMutation.data.reason}
                    </StatusPill>
                  }
                  description={
                    previewMutation.data.responsePreview ??
                    "当前消息会继续走普通聊天链路。"
                  }
                />
                {previewMutation.data.plan ? (
                  <AdminCodeBlock
                    value={prettyJson(previewMutation.data.plan)}
                  />
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="连接器" />
            <div className="mt-4 space-y-4">
              {overview.connectors.map((connector) => {
                const draft =
                  connectorDrafts[connector.id] ??
                  createConnectorDraft(connector);
                const discoveryResult =
                  connectorDiscoveryResults[connector.id] ?? null;
                const testResult = connectorTestResults[connector.id];
                const connectorError = connectorDraftErrors[connector.id];
                const connectorFeedback =
                  connectorDraftFeedbacks[connector.id] ?? null;
                const isSaving =
                  saveConnectorMutation.isPending &&
                  saveConnectorMutation.variables?.id === connector.id;
                const isToggling =
                  toggleConnectorStatusMutation.isPending &&
                  toggleConnectorStatusMutation.variables?.id === connector.id;
                const isTesting =
                  testConnectorMutation.isPending &&
                  testConnectorMutation.variables?.id === connector.id;
                const isDiscovering =
                  discoverConnectorMutation.isPending &&
                  discoverConnectorMutation.variables?.id === connector.id;
                const isDirty = isConnectorDirty(connector, draft);

                return (
                  <AdminRecordCard
                    key={connector.id}
                    title={connector.displayName}
                    badges={
                      <StatusPill tone={resolveConnectorTone(connector.status)}>
                        {connector.status}
                      </StatusPill>
                    }
                    meta={[
                      connector.connectorKey,
                      connector.providerType,
                      connector.lastHealthCheckAt
                        ? `最近自检 ${formatDateTime(connector.lastHealthCheckAt)}`
                        : "尚未自检",
                    ].join(" · ")}
                    description={connector.capabilities
                      .map((item) => `${item.label}(${item.riskLevel})`)
                      .join(" / ")}
                    details={
                      <div className="space-y-4">
                        {connector.providerType === "http_bridge" ? (
                          <AdminCallout
                            tone="info"
                            title="HTTP Bridge 契约"
                            description='服务端会向 `endpointConfig.url` 发送 JSON：`{ connectorKey, operationKey, domain, title, goal, riskLevel, requiresConfirmation, previewOnly, slots, missingSlots, sentAt }`。返回 JSON 时优先读取 `resultSummary` / `summary`、`result`、`execution`。'
                          />
                        ) : null}
                        {connector.connectorKey ===
                        "official-home-assistant-smart-home" ? (
                          <div className="space-y-4">
                            <AdminCallout
                              tone="info"
                              title="Home Assistant 配置方式"
                              description='填写 `baseUrl`，把 Long-Lived Access Token 填进 credential。`deviceTargets` 用 “房间:设备” 作为 key，例如 `客厅:空调`；每个 target 至少包含 `entityId`，可选 `serviceDomain`、`turnOnService`、`turnOffService`、`setTemperatureService`、`temperatureField`。'
                            />
                            <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                                    实体发现与映射向导
                                  </div>
                                  <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                                    会优先通过 Home Assistant WebSocket registry
                                    识别 area / device / entity 关系，失败时回退到
                                    `/api/states`，并给出推荐的 `deviceTargets` 键。
                                  </div>
                                </div>
                                <Button
                                  variant="secondary"
                                  disabled={isDiscovering}
                                  onClick={() => void handleDiscoverConnector(connector)}
                                >
                                  {isDiscovering ? "发现中..." : "发现实体"}
                                </Button>
                              </div>
                              <div className="mt-4">
                                <AdminTextField
                                  label="发现筛选词"
                                  value={draft.discoveryQuery}
                                  onChange={(value) =>
                                    updateConnectorDraft(connector.id, {
                                      discoveryQuery: value,
                                    })
                                  }
                                  placeholder="可按房间、设备、entity_id 检索，例如 客厅 / 空调 / light."
                                />
                              </div>
                              {discoverConnectorMutation.isError &&
                              discoverConnectorMutation.error instanceof Error &&
                              discoverConnectorMutation.variables?.id ===
                                connector.id ? (
                                <ErrorBlock
                                  className="mt-4"
                                  message={discoverConnectorMutation.error.message}
                                />
                              ) : null}
                              {discoveryResult ? (
                                <div className="mt-4 space-y-3">
                                  <AdminCallout
                                    tone={
                                      discoveryResult.topologySource ===
                                      "websocket_registry"
                                        ? "success"
                                        : discoveryResult.itemCount
                                          ? "info"
                                          : "warning"
                                    }
                                    title={
                                      discoveryResult.itemCount
                                        ? `发现到 ${discoveryResult.itemCount} 个候选实体`
                                        : "没有发现匹配实体"
                                    }
                                    description={`拉取时间 ${formatDateTime(discoveryResult.fetchedAt)}${
                                      discoveryResult.query
                                        ? `，当前筛选：${discoveryResult.query}`
                                        : ""
                                    }。房间识别模式：${translateDiscoveryTopologySource(
                                      discoveryResult.topologySource,
                                    )}。点“写入映射”会把推荐 target 合并进当前草稿，不会自动保存。`}
                                  />
                                  {discoveryResult.warnings.map((warning) => (
                                    <AdminCallout
                                      key={warning}
                                      tone="warning"
                                      title="识别回退提示"
                                      description={warning}
                                    />
                                  ))}
                                  {connectorFeedback ? (
                                    <AdminCallout
                                      tone="success"
                                      title="映射草稿已更新"
                                      description={connectorFeedback}
                                    />
                                  ) : null}
                                  <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
                                    <div className="text-sm leading-6 text-[color:var(--text-secondary)]">
                                      当前草稿已有 {countExistingMappedTargets(connector)} 条
                                      deviceTargets 映射。
                                    </div>
                                    <Button
                                      variant="secondary"
                                      disabled={!discoveryResult.items.length}
                                      onClick={() =>
                                        applyHomeAssistantTargetSuggestions(
                                          connector,
                                          discoveryResult.items,
                                          "missing",
                                        )
                                      }
                                    >
                                      只补未配置项
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      disabled={!discoveryResult.items.length}
                                      onClick={() =>
                                        applyHomeAssistantTargetSuggestions(
                                          connector,
                                          discoveryResult.items,
                                          "all",
                                        )
                                      }
                                    >
                                      批量写入全部
                                    </Button>
                                  </div>
                                  {discoveryResult.items.map((item) => (
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
                                            {item.entityId} · {item.domain} · 当前状态{" "}
                                            {item.state}
                                          </div>
                                        </div>
                                        <Button
                                          variant="secondary"
                                          onClick={() =>
                                            applyHomeAssistantTargetSuggestion(
                                              connector,
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
                                          value={item.suggestedRoom || "未识别"}
                                        />
                                        <MetricCard
                                          label="推荐设备"
                                          value={item.suggestedDevice || "设备"}
                                        />
                                        <MetricCard
                                          label="映射键"
                                          value={item.key}
                                        />
                                      </div>
                                      <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                                        房间来源：{translateDiscoverySource(item.roomSource)}
                                        {item.registryAreaName
                                          ? `（${item.registryAreaName}）`
                                          : ""}{" "}
                                        · 设备来源：{translateDiscoverySource(
                                          item.deviceSource,
                                        )}
                                        {item.registryDeviceName
                                          ? `（${item.registryDeviceName}）`
                                          : ""}
                                      </div>
                                      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                                        可执行动作：{item.availableActions.join(" / ")}
                                      </div>
                                      <div className="mt-3">
                                        <LabeledCodeBlock
                                          label="Target Config"
                                          value={prettyJson(item.targetConfig)}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        <AdminTextField
                          label="显示名称"
                          value={draft.displayName}
                          onChange={(value) =>
                            updateConnectorDraft(connector.id, {
                              displayName: value,
                            })
                          }
                        />
                        <AdminTextArea
                          label="Endpoint Config JSON"
                          value={draft.endpointConfigText}
                          onChange={(value) =>
                            updateConnectorDraft(connector.id, {
                              endpointConfigText: value,
                            })
                          }
                          placeholder='例如：{"city":"上海"}'
                          textareaClassName="min-h-32 font-mono text-xs"
                        />
                        <AdminTextArea
                          label="测试消息"
                          value={draft.testMessage}
                          onChange={(value) =>
                            updateConnectorDraft(connector.id, {
                              testMessage: value,
                            })
                          }
                          placeholder="留空则使用系统默认样例。"
                          textareaClassName="min-h-24"
                        />
                        {(connector.providerType === "official_api" ||
                          connector.providerType === "http_bridge") ? (
                          <AdminTextField
                            label={
                              connector.providerType === "official_api"
                                ? "Access Token / Credential"
                                : "Bridge Secret / Credential"
                            }
                            value={draft.credential}
                            onChange={(value) =>
                              updateConnectorDraft(connector.id, {
                                credential: value,
                              })
                            }
                            placeholder={
                              connector.credentialConfigured
                                ? "已配置新凭证时再覆盖；留空则保持不变。"
                                : "输入凭证后保存。"
                            }
                          />
                        ) : null}
                        {connectorError ? (
                          <ErrorBlock message={connectorError} />
                        ) : null}
                        {saveConnectorMutation.isError &&
                        saveConnectorMutation.error instanceof Error &&
                        saveConnectorMutation.variables?.id === connector.id ? (
                          <ErrorBlock
                            message={saveConnectorMutation.error.message}
                          />
                        ) : null}
                        {toggleConnectorStatusMutation.isError &&
                        toggleConnectorStatusMutation.error instanceof Error &&
                        toggleConnectorStatusMutation.variables?.id ===
                          connector.id ? (
                          <ErrorBlock
                            message={
                              toggleConnectorStatusMutation.error.message
                            }
                          />
                        ) : null}
                        {testConnectorMutation.isError &&
                        testConnectorMutation.error instanceof Error &&
                        testConnectorMutation.variables?.id === connector.id ? (
                          <ErrorBlock
                            message={testConnectorMutation.error.message}
                          />
                        ) : null}
                        {connector.lastError ? (
                          <AdminCallout
                            tone="warning"
                            title="最近一次连接器错误"
                            description={connector.lastError}
                          />
                        ) : null}
                        {(connector.providerType === "official_api" ||
                          connector.providerType === "http_bridge") ? (
                          <AdminCallout
                            tone={connector.credentialConfigured ? "success" : "warning"}
                            title={
                              connector.credentialConfigured
                                ? "凭证已配置"
                                : "凭证未配置"
                            }
                            description={
                              connector.providerType === "official_api"
                                ? "官方 API 连接器不会回显已保存 token；填写新值并保存即可覆盖。"
                                : "Bridge credential 同样只写入不回显；需要替换时重新填写并保存。"
                            }
                          />
                        ) : null}
                        {testResult ? (
                          <div className="space-y-3">
                            <AdminCallout
                              tone={testResult.ok ? "success" : "warning"}
                              title={
                                testResult.ok
                                  ? "连接器自检通过"
                                  : "连接器自检失败"
                              }
                              description={
                                testResult.errorMessage ?? testResult.summary
                              }
                            />
                            <AdminCodeBlock
                              value={prettyJson({
                                testedAt: testResult.testedAt,
                                sampleMessage: testResult.sampleMessage,
                                samplePlan: testResult.samplePlan,
                                executionPayload: testResult.executionPayload,
                                resultPayload: testResult.resultPayload,
                              })}
                            />
                          </div>
                        ) : null}
                      </div>
                    }
                    actions={
                      <>
                        <Button
                          variant="secondary"
                          disabled={isSaving || !isDirty}
                          onClick={() => handleSaveConnector(connector)}
                        >
                          {isSaving ? "保存中..." : "保存配置"}
                        </Button>
                        {(connector.providerType === "official_api" ||
                          connector.providerType === "http_bridge") ? (
                          <Button
                            variant="secondary"
                            disabled={isSaving || !connector.credentialConfigured}
                            onClick={() => handleClearConnectorCredential(connector)}
                          >
                            清除凭证
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          disabled={isTesting}
                          onClick={() =>
                            testConnectorMutation.mutate({
                              id: connector.id,
                              sampleMessage: draft.testMessage,
                            })
                          }
                        >
                          {isTesting ? "自检中..." : "测试连接器"}
                        </Button>
                        {connector.connectorKey ===
                        "official-home-assistant-smart-home" ? (
                          <Button
                            variant="secondary"
                            disabled={isDiscovering}
                            onClick={() => void handleDiscoverConnector(connector)}
                          >
                            {isDiscovering ? "发现中..." : "发现实体"}
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          disabled={isToggling || connector.status === "ready"}
                          onClick={() =>
                            toggleConnectorStatusMutation.mutate({
                              id: connector.id,
                              status: "ready",
                            })
                          }
                        >
                          {isToggling &&
                          toggleConnectorStatusMutation.variables?.status ===
                            "ready"
                            ? "启用中..."
                            : "启用"}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={
                            isToggling || connector.status === "disabled"
                          }
                          onClick={() =>
                            toggleConnectorStatusMutation.mutate({
                              id: connector.id,
                              status: "disabled",
                            })
                          }
                        >
                          {isToggling &&
                          toggleConnectorStatusMutation.variables?.status ===
                            "disabled"
                            ? "停用中..."
                            : "停用"}
                        </Button>
                      </>
                    }
                  />
                );
              })}
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="最近动作运行" />
            {overview.recentRuns.length ? (
              <div className="mt-4 space-y-3">
                {overview.recentRuns.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => setSelectedRunId(run.id)}
                    className={[
                      "w-full rounded-[18px] border p-4 text-left transition",
                      selectedRunId === run.id
                        ? "border-[color:var(--brand-primary)] bg-white shadow-[var(--shadow-soft)]"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:border-[color:var(--border-subtle)]",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {run.title}
                      </div>
                      <StatusPill tone={resolveRunTone(run.status)}>
                        {run.status}
                      </StatusPill>
                    </div>
                    <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                      {run.connectorKey} · {run.operationKey} ·{" "}
                      {formatDateTime(run.updatedAt)}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                      {run.resultSummary ?? run.errorMessage ?? run.userGoal}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <AdminEmptyState
                title="还没有动作运行记录"
                description="等 self 会话里第一次命中动作链后，这里会出现澄清、确认和执行轨迹。"
                className="mt-4"
              />
            )}
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
                    {retryRunMutation.isPending ? "重试中..." : "重试动作"}
                  </Button>
                ) : undefined
              }
            />
            {!selectedRunId ? (
              <AdminEmptyState
                title="还没有选中动作"
                description="点左侧任意一条最近动作运行记录，这里会展示完整 trace。"
                className="mt-4"
              />
            ) : runDetailQuery.isLoading ? (
              <LoadingBlock label="正在读取动作详情..." />
            ) : runDetailQuery.isError &&
              runDetailQuery.error instanceof Error ? (
              <ErrorBlock message={runDetailQuery.error.message} />
            ) : runDetailQuery.data ? (
              <div className="mt-4 space-y-4">
                <AdminInfoRows
                  title="当前状态"
                  rows={[
                    { label: "标题", value: runDetailQuery.data.title },
                    { label: "状态", value: runDetailQuery.data.status },
                    { label: "风险等级", value: runDetailQuery.data.riskLevel },
                    {
                      label: "是否要求确认",
                      value: runDetailQuery.data.requiresConfirmation
                        ? "是"
                        : "否",
                    },
                    {
                      label: "更新时间",
                      value: formatDateTime(runDetailQuery.data.updatedAt),
                    },
                  ]}
                />
                <LabeledCodeBlock
                  label="Plan Payload"
                  value={prettyJson(runDetailQuery.data.planPayload ?? {})}
                />
                <LabeledCodeBlock
                  label="Policy Decision"
                  value={prettyJson(
                    runDetailQuery.data.policyDecisionPayload ?? {},
                  )}
                />
                <LabeledCodeBlock
                  label="Confirmation Payload"
                  value={prettyJson(
                    runDetailQuery.data.confirmationPayload ?? {},
                  )}
                />
                <LabeledCodeBlock
                  label="Execution Payload"
                  value={prettyJson(runDetailQuery.data.executionPayload ?? {})}
                />
                <LabeledCodeBlock
                  label="Result Payload"
                  value={prettyJson(runDetailQuery.data.resultPayload ?? {})}
                />
                <LabeledCodeBlock
                  label="Error Payload"
                  value={prettyJson(runDetailQuery.data.errorPayload ?? {})}
                />
                <LabeledCodeBlock
                  label="Trace Payload"
                  value={prettyJson(runDetailQuery.data.tracePayload ?? {})}
                />
              </div>
            ) : (
              <AdminEmptyState
                title="动作详情暂不可用"
                description="刷新一次概览；如果仍然为空，说明当前动作还没写入详情。"
                className="mt-4"
              />
            )}
          </Card>
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
  let overwrittenCount = 0;
  let skippedCount = 0;

  for (const suggestion of input.suggestions) {
    const exists = Object.prototype.hasOwnProperty.call(
      nextTargets,
      suggestion.key,
    );
    if (input.mode === "missing" && exists) {
      skippedCount += 1;
      continue;
    }
    if (exists) {
      overwrittenCount += 1;
    }
    nextTargets[suggestion.key] = suggestion.targetConfig;
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
    overwrittenCount,
    skippedCount,
  };
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
  if (!value) {
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    status === "cancelled" ||
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
