import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
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
  endpointConfigText: string;
  testMessage: string;
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
  const [connectorTestResults, setConnectorTestResults] = useState<
    Record<string, ActionConnectorTestResult>
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
    }) =>
      adminApi.updateActionRuntimeConnector(payload.id, {
        displayName: payload.displayName,
        endpointConfig: payload.endpointConfig,
      }),
    onSuccess: (connector) => {
      setConnectorDraftErrors((current) => {
        const next: Record<string, string> = { ...current };
        delete next[connector.id];
        return next;
      });
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
          endpointConfigText: "",
          testMessage: "",
        }),
        ...patch,
      },
    }));
    setConnectorDraftErrors((current) => {
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
    });
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
                const testResult = connectorTestResults[connector.id];
                const connectorError = connectorDraftErrors[connector.id];
                const isSaving =
                  saveConnectorMutation.isPending &&
                  saveConnectorMutation.variables?.id === connector.id;
                const isToggling =
                  toggleConnectorStatusMutation.isPending &&
                  toggleConnectorStatusMutation.variables?.id === connector.id;
                const isTesting =
                  testConnectorMutation.isPending &&
                  testConnectorMutation.variables?.id === connector.id;
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
    endpointConfigText: formatEndpointConfig(connector.endpointConfig ?? null),
    testMessage: "",
  };
}

function isConnectorDirty(
  connector: ActionConnectorSummary,
  draft: ConnectorDraft,
) {
  return (
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
