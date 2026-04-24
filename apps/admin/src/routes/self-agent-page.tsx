import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SelfAgentHeartbeatRun,
  SelfAgentRules,
  SelfAgentRunRecord,
  SelfAgentWorkspaceDocumentName,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminDraftStatusPill,
  AdminEmptyState,
  AdminMiniPanel,
  AdminPageHero,
  AdminRecordCard,
  AdminToggle,
  AdminSectionHeader,
  AdminSectionNav,
  AdminSoftBox,
  AdminTextArea,
  AdminTextField,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { formatAdminDateTime as formatDateTime } from "../lib/format";

const WORKSPACE_DOCUMENT_LABELS: Record<SelfAgentWorkspaceDocumentName, string> =
  {
    "AGENTS.md": "Standing Orders",
    "SOUL.md": "人格与语气",
    "USER.md": "世界主人画像",
    "IDENTITY.md": "外显身份",
    "TOOLS.md": "能力边界",
    "HEARTBEAT.md": "主动巡检",
    "MEMORY.md": "长期记忆",
  };

const WORKSPACE_DOCUMENT_ORDER: SelfAgentWorkspaceDocumentName[] = [
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "IDENTITY.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "MEMORY.md",
];

function resolveHeartbeatTone(status: SelfAgentHeartbeatRun["status"]) {
  if (status === "success") {
    return "healthy" as const;
  }
  if (status === "error") {
    return "warning" as const;
  }
  return "muted" as const;
}

function resolveHeartbeatLabel(status: SelfAgentHeartbeatRun["status"]) {
  if (status === "success") {
    return "命中待处理事项";
  }
  if (status === "error") {
    return "巡检失败";
  }
  return "本轮无动作";
}

function resolveRunTone(status: SelfAgentRunRecord["status"]) {
  if (status === "handled" || status === "suggested") {
    return "healthy" as const;
  }
  if (status === "blocked" || status === "error") {
    return "warning" as const;
  }
  return "muted" as const;
}

function resolveRunLabel(run: SelfAgentRunRecord) {
  if (run.status === "blocked") {
    return "被策略拦下";
  }
  if (run.policyDecision === "confirm_required") {
    return "已转确认";
  }
  if (run.policyDecision === "clarify_required") {
    return "已转补参数";
  }
  if (run.routeKey === "self_chat") {
    return "普通自我对话";
  }
  if (run.routeKey === "reminder_runtime") {
    return "提醒运行时";
  }
  if (run.routeKey === "action_runtime") {
    return "真实动作";
  }
  if (run.routeKey === "heartbeat") {
    return "heartbeat";
  }
  return "跳过";
}

function serializeRuleLines(items: string[]) {
  return items.join("\n");
}

function parseRuleLines(value: string) {
  return [...new Set(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))];
}

function formatCompactDateTime(value?: string | null) {
  return formatDateTime(
    value,
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
    "notOccurred",
  );
}

export function SelfAgentPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [selectedDocumentName, setSelectedDocumentName] =
    useState<SelfAgentWorkspaceDocumentName>("AGENTS.md");
  const [documentDraft, setDocumentDraft] = useState("");
  const [rulesDraft, setRulesDraft] = useState<SelfAgentRules | null>(null);
  const [blockedConnectorKeysText, setBlockedConnectorKeysText] = useState("");
  const [blockedOperationKeysText, setBlockedOperationKeysText] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["admin-self-agent-overview", baseUrl],
    queryFn: () => adminApi.getSelfAgentOverview(),
  });

  const documentQuery = useQuery({
    queryKey: [
      "admin-self-agent-workspace-document",
      baseUrl,
      selectedDocumentName,
    ],
    queryFn: () => adminApi.getSelfAgentWorkspaceDocument(selectedDocumentName),
  });

  useEffect(() => {
    const firstDocument = overviewQuery.data?.workspaceDocuments[0]?.name;
    if (
      firstDocument &&
      !overviewQuery.data?.workspaceDocuments.some(
        (item) => item.name === selectedDocumentName,
      )
    ) {
      setSelectedDocumentName(firstDocument);
    }
  }, [overviewQuery.data, selectedDocumentName]);

  useEffect(() => {
    if (documentQuery.data) {
      setDocumentDraft(documentQuery.data.content);
    }
  }, [documentQuery.data]);

  useEffect(() => {
    if (overviewQuery.data) {
      setRulesDraft((current) => current ?? overviewQuery.data.rules);
      setBlockedConnectorKeysText((current) =>
        current || serializeRuleLines(overviewQuery.data.rules.policy.blockedActionConnectorKeys),
      );
      setBlockedOperationKeysText((current) =>
        current || serializeRuleLines(overviewQuery.data.rules.policy.blockedActionOperationKeys),
      );
    }
  }, [overviewQuery.data]);

  const saveDocumentMutation = useMutation({
    mutationFn: (payload: {
      name: SelfAgentWorkspaceDocumentName;
      content: string;
    }) => adminApi.updateSelfAgentWorkspaceDocument(payload.name, payload.content),
    onSuccess: async (nextDocument) => {
      setDocumentDraft(nextDocument.content);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-self-agent-overview", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "admin-self-agent-workspace-document",
            baseUrl,
            nextDocument.name,
          ],
        }),
      ]);
    },
  });

  const runHeartbeatMutation = useMutation({
    mutationFn: () => adminApi.runSelfAgentHeartbeat(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-self-agent-overview", baseUrl],
      });
    },
  });

  const saveRulesMutation = useMutation({
    mutationFn: (payload: Partial<SelfAgentRules>) =>
      adminApi.setSelfAgentRules(payload),
    onSuccess: async (nextRules) => {
      setRulesDraft(nextRules);
      setBlockedConnectorKeysText(
        serializeRuleLines(nextRules.policy.blockedActionConnectorKeys),
      );
      setBlockedOperationKeysText(
        serializeRuleLines(nextRules.policy.blockedActionOperationKeys),
      );
      await queryClient.invalidateQueries({
        queryKey: ["admin-self-agent-overview", baseUrl],
      });
    },
  });

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <LoadingBlock label="正在读取 self-agent 总览..." />;
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <ErrorBlock
        title="self-agent 总览读取失败"
        message={
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "请检查管理后台和实例连通性。"
        }
      />
    );
  }

  const overview = overviewQuery.data;
  const activeDocumentSummary =
    overview.workspaceDocuments.find((item) => item.name === selectedDocumentName) ??
    overview.workspaceDocuments[0] ??
    null;
  const activeDocument = documentQuery.data ?? null;
  const documentDirty = activeDocument
    ? documentDraft !== activeDocument.content
    : false;
  const latestRun =
    runHeartbeatMutation.data ?? overview.recentHeartbeatRuns[0] ?? null;
  const effectiveRules = rulesDraft ?? overview.rules;
  const normalizedRulesDraft: SelfAgentRules = {
    ...effectiveRules,
    policy: {
      ...effectiveRules.policy,
      blockedActionConnectorKeys: parseRuleLines(blockedConnectorKeysText),
      blockedActionOperationKeys: parseRuleLines(blockedOperationKeysText),
    },
  };
  const rulesDirty =
    JSON.stringify(normalizedRulesDraft) !== JSON.stringify(overview.rules);

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="Self Agent"
        title="“我自己”主代理工作台"
        description="这里收口 self-agent 的长期 workspace、主动巡检和近期待处理事项，让“我自己”不再只是单条 prompt，而是一个可运营的主代理。"
        badges={[
          `世界主人：${overview.identity.ownerName}`,
          `主代理：${overview.identity.characterName}`,
          `Source Key：${overview.identity.characterSourceKey ?? "self"}`,
        ]}
        metrics={[
          {
            label: "未闭环事项",
            value: overview.stats.activeOpenLoopCount,
          },
          {
            label: "24h 提醒",
            value: overview.stats.upcomingReminderCount,
          },
          {
            label: "待确认动作",
            value: overview.stats.awaitingActionConfirmationCount,
          },
          {
            label: "待补参数动作",
            value: overview.stats.awaitingActionSlotsCount,
          },
        ]}
        actions={
          <Button
            variant="primary"
            onClick={() => runHeartbeatMutation.mutate()}
            disabled={runHeartbeatMutation.isPending}
          >
            {runHeartbeatMutation.isPending ? "正在巡检..." : "立即执行 heartbeat"}
          </Button>
        }
      />

      {latestRun ? (
        <AdminCallout
          tone={
            latestRun.status === "success"
              ? "info"
              : latestRun.status === "error"
                ? "warning"
                : "muted"
          }
          title={`最近一次巡检：${resolveHeartbeatLabel(latestRun.status)}`}
          description={`${latestRun.summary} 最近执行时间：${formatCompactDateTime(latestRun.updatedAt)}。`}
          actions={
            latestRun.suggestedMessage ? (
              <Button
                variant="secondary"
                onClick={() => setSelectedDocumentName("HEARTBEAT.md")}
              >
                查看 heartbeat 规则
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <AdminMiniPanel title="世界主人">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <div className="font-medium text-[color:var(--text-primary)]">
              {overview.identity.ownerName}
            </div>
            <div>{overview.identity.ownerSignature ?? "暂无签名"}</div>
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="主代理身份">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <div className="font-medium text-[color:var(--text-primary)]">
              {overview.identity.characterName}
            </div>
            <div>ID：{overview.identity.characterId}</div>
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="巡检节奏">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <div>自动 heartbeat：每 30 分钟一次</div>
            <div>近期巡检记录：{overview.stats.heartbeatRunCount} 条</div>
          </div>
        </AdminMiniPanel>
      </div>

      <Card className="space-y-4">
        <AdminSectionHeader
          title="统一 policy"
          actions={
            <div className="flex items-center gap-3">
              <AdminDraftStatusPill
                ready={Boolean(rulesDraft)}
                dirty={rulesDirty}
              />
              <Button
                variant="primary"
                onClick={() => saveRulesMutation.mutate(normalizedRulesDraft)}
                disabled={!rulesDirty || saveRulesMutation.isPending}
              >
                {saveRulesMutation.isPending ? "保存中..." : "保存规则"}
              </Button>
            </div>
          }
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <AdminSoftBox className="space-y-3">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              委托门控
            </div>
            <AdminToggle
              label="启用 self-agent 统一编排"
              checked={effectiveRules.policy.enabled}
              onChange={(checked) =>
                setRulesDraft((current) => ({
                  ...(current ?? overview.rules),
                  policy: {
                    ...(current?.policy ?? overview.rules.policy),
                    enabled: checked,
                  },
                }))
              }
            />
            <AdminToggle
              label="允许委托 action-runtime"
              checked={effectiveRules.policy.allowActionRuntimeDelegation}
              onChange={(checked) =>
                setRulesDraft((current) => ({
                  ...(current ?? overview.rules),
                  policy: {
                    ...(current?.policy ?? overview.rules.policy),
                    allowActionRuntimeDelegation: checked,
                  },
                }))
              }
            />
            <AdminToggle
              label="允许委托 reminder-runtime"
              checked={effectiveRules.policy.allowReminderRuntimeDelegation}
              onChange={(checked) =>
                setRulesDraft((current) => ({
                  ...(current ?? overview.rules),
                  policy: {
                    ...(current?.policy ?? overview.rules.policy),
                    allowReminderRuntimeDelegation: checked,
                  },
                }))
              }
            />
            <AdminToggle
              label="所有委托动作一律先确认"
              checked={effectiveRules.policy.forceConfirmationForDelegatedActions}
              onChange={(checked) =>
                setRulesDraft((current) => ({
                  ...(current ?? overview.rules),
                  policy: {
                    ...(current?.policy ?? overview.rules.policy),
                    forceConfirmationForDelegatedActions: checked,
                  },
                }))
              }
            />
          </AdminSoftBox>

          <AdminSoftBox className="space-y-3">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              Heartbeat 节奏
            </div>
            <AdminToggle
              label="启用 heartbeat"
              checked={effectiveRules.heartbeat.enabled}
              onChange={(checked) =>
                setRulesDraft((current) => ({
                  ...(current ?? overview.rules),
                  heartbeat: {
                    ...(current?.heartbeat ?? overview.rules.heartbeat),
                    enabled: checked,
                  },
                }))
              }
            />
            <AdminToggle
              label="非主动时段也允许静默巡检"
              checked={effectiveRules.heartbeat.allowNightlySilentScan}
              onChange={(checked) =>
                setRulesDraft((current) => ({
                  ...(current ?? overview.rules),
                  heartbeat: {
                    ...(current?.heartbeat ?? overview.rules.heartbeat),
                    allowNightlySilentScan: checked,
                  },
                }))
              }
            />
            <div className="grid gap-3 md:grid-cols-3">
              <AdminTextField
                label="巡检频率(分钟)"
                value={effectiveRules.heartbeat.everyMinutes}
                type="number"
                min={5}
                max={1440}
                onChange={(value) =>
                  setRulesDraft((current) => ({
                    ...(current ?? overview.rules),
                    heartbeat: {
                      ...(current?.heartbeat ?? overview.rules.heartbeat),
                      everyMinutes: Number(value) || 30,
                    },
                  }))
                }
              />
              <AdminTextField
                label="开始小时"
                value={effectiveRules.heartbeat.activeHoursStart}
                type="number"
                min={0}
                max={23}
                onChange={(value) =>
                  setRulesDraft((current) => ({
                    ...(current ?? overview.rules),
                    heartbeat: {
                      ...(current?.heartbeat ?? overview.rules.heartbeat),
                      activeHoursStart: Number(value) || 0,
                    },
                  }))
                }
              />
              <AdminTextField
                label="结束小时"
                value={effectiveRules.heartbeat.activeHoursEnd}
                type="number"
                min={0}
                max={23}
                onChange={(value) =>
                  setRulesDraft((current) => ({
                    ...(current ?? overview.rules),
                    heartbeat: {
                      ...(current?.heartbeat ?? overview.rules.heartbeat),
                      activeHoursEnd: Number(value) || 23,
                    },
                  }))
                }
              />
            </div>
            <AdminTextField
              label="每类最多扫描条数"
              value={effectiveRules.heartbeat.maxItemsPerCategory}
              type="number"
              min={1}
              max={10}
              onChange={(value) =>
                setRulesDraft((current) => ({
                  ...(current ?? overview.rules),
                  heartbeat: {
                    ...(current?.heartbeat ?? overview.rules.heartbeat),
                    maxItemsPerCategory: Number(value) || 3,
                  },
                }))
              }
            />
          </AdminSoftBox>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <AdminTextArea
            label="拦截的 connector keys"
            value={blockedConnectorKeysText}
            onChange={setBlockedConnectorKeysText}
            description="每行一个 connector key。命中后，self-agent 会直接拦下这类动作，不让 action-runtime 继续执行。"
            textareaClassName="min-h-32"
          />
          <AdminTextArea
            label="拦截的 operation keys"
            value={blockedOperationKeysText}
            onChange={setBlockedOperationKeysText}
            description="每行一个 operation key。用于从主代理层统一禁掉某些动作能力。"
            textareaClassName="min-h-32"
          />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <AdminSectionNav
          title="Workspace 文件"
          items={WORKSPACE_DOCUMENT_ORDER.map((name) => {
            const summary =
              overview.workspaceDocuments.find((item) => item.name === name) ?? null;
            return {
              id: name,
              label: WORKSPACE_DOCUMENT_LABELS[name],
              detail: summary
                ? `${summary.preview || "暂无内容"}${
                    summary.updatedAt
                      ? ` · 更新于 ${formatCompactDateTime(summary.updatedAt)}`
                      : ""
                  }`
                : "文档尚未初始化",
              onClick: () => setSelectedDocumentName(name),
            };
          })}
        />

        <Card className="space-y-4">
          <AdminSectionHeader
            title={WORKSPACE_DOCUMENT_LABELS[selectedDocumentName]}
            actions={
              <div className="flex items-center gap-3">
                <AdminDraftStatusPill
                  ready={Boolean(activeDocument)}
                  dirty={documentDirty}
                />
                <Button
                  variant="primary"
                  onClick={() =>
                    saveDocumentMutation.mutate({
                      name: selectedDocumentName,
                      content: documentDraft,
                    })
                  }
                  disabled={
                    !activeDocument ||
                    !documentDirty ||
                    saveDocumentMutation.isPending
                  }
                >
                  {saveDocumentMutation.isPending ? "保存中..." : "保存文档"}
                </Button>
              </div>
            }
          />

          {activeDocumentSummary ? (
            <AdminSoftBox>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <span>文件名：{activeDocumentSummary.name}</span>
                <span>大小：{activeDocumentSummary.size} B</span>
                <span>
                  更新时间：
                  {formatCompactDateTime(activeDocumentSummary.updatedAt)}
                </span>
              </div>
            </AdminSoftBox>
          ) : null}

          {documentQuery.isLoading && !activeDocument ? (
            <LoadingBlock label="正在读取 workspace 文档..." />
          ) : documentQuery.isError ? (
            <ErrorBlock
              title="workspace 文档读取失败"
              message={
                documentQuery.error instanceof Error
                  ? documentQuery.error.message
                  : "请稍后重试。"
              }
            />
          ) : (
            <AdminTextArea
              label={selectedDocumentName}
              value={documentDraft}
              onChange={setDocumentDraft}
              textareaClassName="min-h-[420px]"
              description="这里直接编辑 self-agent 的长期工作文件。普通对话回退到 self 回复链路时，会把这些文件注入系统提示。"
            />
          )}
        </Card>
      </div>

      <Card className="space-y-4">
        <AdminSectionHeader title="近期 heartbeat 记录" />
        {!overview.recentHeartbeatRuns.length ? (
          <AdminEmptyState
            title="还没有 heartbeat 记录"
            description="先执行一次手动巡检，或等待自动调度跑起来。"
          />
        ) : (
          <div className="grid gap-4">
            {overview.recentHeartbeatRuns.map((run) => (
              <AdminRecordCard
                key={run.id}
                title={run.summary}
                badges={
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={resolveHeartbeatTone(run.status)}>
                      {resolveHeartbeatLabel(run.status)}
                    </StatusPill>
                    <StatusPill tone="muted">
                      {run.triggerType === "scheduler" ? "自动调度" : "手动触发"}
                    </StatusPill>
                  </div>
                }
                meta={`执行时间：${formatCompactDateTime(run.updatedAt)}`}
                description={
                  run.suggestedMessage
                    ? `建议主动话术：${run.suggestedMessage}`
                    : "本轮没有生成建议主动话术。"
                }
                details={
                  run.findings.length ? (
                    <div className="space-y-3">
                      {run.findings.map((finding) => (
                        <AdminSoftBox key={`${run.id}-${finding.type}`}>
                          <div className="text-sm font-medium text-[color:var(--text-primary)]">
                            {finding.title} · {finding.count}
                          </div>
                          <div className="mt-1 text-sm leading-6">
                            {finding.summary}
                          </div>
                          {finding.items.length ? (
                            <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                              {finding.items.join(" / ")}
                            </div>
                          ) : null}
                        </AdminSoftBox>
                      ))}
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <AdminSectionHeader title="近期 self-agent runs" />
        {!overview.recentRuns.length ? (
          <AdminEmptyState
            title="还没有 self-agent run 记录"
            description="等“我自己”收到新消息，或 heartbeat 再跑几轮，这里就会开始积累主代理的真实编排轨迹。"
          />
        ) : (
          <div className="grid gap-4">
            {overview.recentRuns.map((run) => (
              <AdminRecordCard
                key={run.id}
                title={run.summary}
                badges={
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={resolveRunTone(run.status)}>
                      {resolveRunLabel(run)}
                    </StatusPill>
                    <StatusPill tone="muted">
                      {run.triggerType === "heartbeat" ? "heartbeat" : "conversation"}
                    </StatusPill>
                  </div>
                }
                meta={`执行时间：${formatCompactDateTime(run.updatedAt)}${
                  run.conversationId ? ` · 会话 ${run.conversationId}` : ""
                }`}
                description={
                  run.outputPreview ||
                  run.inputPreview ||
                  "当前没有可展示的输入/输出摘要。"
                }
                details={
                  <div className="space-y-3">
                    <AdminSoftBox>
                      路由：{run.routeKey} · 决策：{run.policyDecision}
                    </AdminSoftBox>
                    {run.inputPreview ? (
                      <AdminSoftBox>输入：{run.inputPreview}</AdminSoftBox>
                    ) : null}
                    {run.outputPreview ? (
                      <AdminSoftBox>输出：{run.outputPreview}</AdminSoftBox>
                    ) : null}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
