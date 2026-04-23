import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FollowupOpenLoopRecord,
  FollowupRecommendationRecord,
  FollowupRunRecord,
  FollowupRuntimeRules,
} from "@yinjie/contracts";
import { runSchedulerJob } from "@yinjie/contracts";
import { Button, Card, ErrorBlock, LoadingBlock, StatusPill } from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminCallout,
  AdminDraftStatusPill,
  AdminEmptyState,
  AdminInfoRows,
  AdminMetaText,
  AdminPageHero,
  AdminRecordCard,
  AdminSectionHeader,
  AdminSelectableCard,
  AdminSoftBox,
  AdminSubTabs,
  AdminTabs,
  AdminValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

type WorkspaceTab = "open_loops" | "recommendations" | "runs";
type ConfigTab = "policy" | "weights" | "copy";
type OpenLoopScope = "attention" | "recommended" | "closed";
type RecommendationScope = "in_progress" | "converted" | "closed";
type RunScope = "attention" | "healthy" | "all";

export function FollowupRuntimePage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ["admin-followup-runtime", baseUrl],
    queryFn: () => adminApi.getFollowupRuntimeOverview(),
  });
  const [draft, setDraft] = useState<FollowupRuntimeRules | null>(null);
  const [notice, setNotice] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("open_loops");
  const [configTab, setConfigTab] = useState<ConfigTab>("policy");

  useEffect(() => {
    if (!overviewQuery.data || draft) {
      return;
    }
    setDraft(overviewQuery.data.rules);
  }, [draft, overviewQuery.data]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const saveMutation = useMutation({
    mutationFn: () => adminApi.setFollowupRuntimeRules(draft ?? {}),
    onSuccess: async (rules) => {
      setDraft(rules);
      setNotice("主动跟进规则已保存。");
      await queryClient.invalidateQueries({
        queryKey: ["admin-followup-runtime", baseUrl],
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: () =>
      runSchedulerJob("trigger_followup_recommendations", baseUrl),
    onSuccess: async () => {
      setNotice("主动跟进调度已执行。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-followup-runtime", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-scheduler-status", baseUrl],
        }),
      ]);
    },
  });

  const metrics = useMemo(() => {
    const recentRecommendations =
      overviewQuery.data?.recentRecommendations ?? [];
    const inProgressRecommendationCount = recentRecommendations.filter(
      isInProgressRecommendation,
    ).length;
    const latestRun = overviewQuery.data?.recentRuns[0] ?? null;

    return [
      {
        label: "待判断 open loop",
        value:
          overviewQuery.data?.activeOpenLoops.filter((loop) =>
            isAttentionLoopStatus(loop.status),
          ).length ?? 0,
      },
      {
        label: "推进中推荐",
        value: inProgressRecommendationCount,
      },
      {
        label: "待确认好友申请",
        value: overviewQuery.data?.stats.friendRequestPendingCount ?? 0,
      },
      {
        label: "已成好友",
        value: overviewQuery.data?.stats.friendAddedCount ?? 0,
      },
      {
        label: "最近运行",
        value: latestRun ? labelFromRunStatus(latestRun.status) : "无记录",
      },
    ];
  }, [overviewQuery.data]);

  const dirty = useMemo(() => {
    if (!overviewQuery.data || !draft) {
      return false;
    }
    return serializeRules(draft) !== serializeRules(overviewQuery.data.rules);
  }, [draft, overviewQuery.data]);

  const attentionSummary = useMemo(() => {
    const recentRun = overviewQuery.data?.recentRuns[0] ?? null;
    const activeLoops = overviewQuery.data?.activeOpenLoops ?? [];
    const recentRecommendations =
      overviewQuery.data?.recentRecommendations ?? [];
    const attentionOpenLoopCount = activeLoops.filter((loop) =>
      isAttentionLoopStatus(loop.status),
    ).length;
    const inProgressRecommendationCount = recentRecommendations.filter(
      isInProgressRecommendation,
    ).length;
    const pendingFriendRequests =
      overviewQuery.data?.stats.friendRequestPendingCount ?? 0;

    if (!draft?.enabled) {
      return {
        tone: "warning" as const,
        title: "主动跟进当前停用",
        description:
          "调度不会真正处理新的闭环线索。建议先确认是否需要恢复启用，再决定是否执行手动调度。",
      };
    }

    if (dirty) {
      return {
        tone: "info" as const,
        title: "存在未保存草稿",
        description:
          "页面中的门槛、权重或文案已经调整，但服务端还在使用旧规则。先保存，再决定是否立即复跑。",
      };
    }

    if (recentRun?.status === "failed") {
      return {
        tone: "warning" as const,
        title: "最近一轮运行失败",
        description:
          "优先查看运行记录里的错误信息，确认是调度异常、规则冲突，还是下游写入失败。",
      };
    }

    if (pendingFriendRequests > 0) {
      return {
        tone: "info" as const,
        title: "存在待确认的好友申请链路",
        description: `当前有 ${pendingFriendRequests} 条推荐已经进入好友申请阶段，建议先核对这些链路是否继续推进。`,
      };
    }

    if (inProgressRecommendationCount > 0) {
      return {
        tone: "info" as const,
        title: "推荐闭环正在推进",
        description: `最近有 ${inProgressRecommendationCount} 条推荐还在推进中，先看推荐闭环是否已经被打开、加友或转成聊天。`,
      };
    }

    if (attentionOpenLoopCount > 0) {
      return {
        tone: "warning" as const,
        title: "还有待判断的 open loop",
        description: `当前仍有 ${attentionOpenLoopCount} 条线索处于观察或待推荐阶段，建议先看分数和来源是否与当前阈值匹配。`,
      };
    }

    return {
      tone: "success" as const,
      title: "当前闭环节奏稳定",
      description:
        "没有明显堆积的待跟进事项。此时更适合微调阈值和文案，而不是大幅度改动策略。",
    };
  }, [dirty, draft?.enabled, overviewQuery.data]);

  const strategyRows = useMemo(() => {
    if (!draft) {
      return [];
    }

    const latestRun = overviewQuery.data?.recentRuns[0] ?? null;

    return [
      {
        label: "调度状态",
        value: draft.enabled ? "启用中" : "已停用",
      },
      {
        label: "执行模式",
        value: labelFromExecutionMode(draft.executionMode),
      },
      {
        label: "自动补好友申请",
        value: draft.autoSendFriendRequestToNotFriend ? "开启" : "关闭",
      },
      {
        label: "扫描节奏",
        value: `${draft.scanIntervalMinutes} 分钟 / 回看 ${draft.lookbackHours} 小时`,
      },
      {
        label: "核心阈值",
        value: `Open loop ${formatScore(draft.minOpenLoopScore)} / Handoff ${formatScore(draft.minHandoffNeedScore)}`,
      },
      {
        label: "最近执行",
        value: latestRun ? formatDateTime(latestRun.startedAt) : "暂无",
      },
    ];
  }, [draft, overviewQuery.data]);

  const actionFeedback = useMemo(() => {
    if (saveMutation.isPending) {
      return {
        tone: "busy" as const,
        title: "正在保存规则",
        description: "规则更新会覆盖当前服务端配置，保存完成后会自动刷新总览数据。",
      };
    }

    if (runMutation.isPending) {
      return {
        tone: "busy" as const,
        title: "正在执行主动跟进调度",
        description: "本轮会重新扫描最近安静下来的线程，并刷新 open loop 与推荐结果。",
      };
    }

    if (notice) {
      return {
        tone: "success" as const,
        title: "操作完成",
        description: notice,
      };
    }

    return null;
  }, [notice, runMutation.isPending, saveMutation.isPending]);

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <LoadingBlock label="正在读取主动跟进配置..." />;
  }

  if (overviewQuery.isError && overviewQuery.error instanceof Error) {
    return <ErrorBlock message={overviewQuery.error.message} />;
  }

  if (!overviewQuery.data || !draft) {
    return <LoadingBlock label="正在同步主动跟进工作台..." />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="主动跟进"
        title="我自己回捞未闭环事项"
        description="把“需要再接一下”的事情和“已经推进中的推荐”拆开来看。运营先判断当前闭环卡在哪，再决定是调规则还是直接复跑。"
        badges={["承接角色：我自己"]}
        metrics={metrics}
        actions={
          <>
            <AdminDraftStatusPill ready dirty={dirty} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? "执行中..." : "立即执行"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !dirty}
            >
              {saveMutation.isPending ? "保存中..." : "保存规则"}
            </Button>
          </>
        }
      />

      {actionFeedback ? (
        <AdminActionFeedback
          tone={actionFeedback.tone}
          title={actionFeedback.title}
          description={actionFeedback.description}
        />
      ) : null}
      {saveMutation.error instanceof Error ? (
        <ErrorBlock message={saveMutation.error.message} />
      ) : null}
      {runMutation.error instanceof Error ? (
        <ErrorBlock message={runMutation.error.message} />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <AdminCallout
          title={attentionSummary.title}
          description={attentionSummary.description}
          tone={attentionSummary.tone}
        />
        <AdminInfoRows title="当前策略快照" rows={strategyRows} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr,0.95fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="运营工作台"
            actions={
              <StatusPill tone={draft.enabled ? "healthy" : "warning"}>
                {draft.enabled ? "运行中" : "停用中"}
              </StatusPill>
            }
          />
          <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            先处理眼前需要判断和推进的事项，再回看最近运行是否稳定。
          </div>
          <AdminTabs
            className="mt-4"
            tabs={[
              { key: "open_loops", label: "Open Loop 队列" },
              { key: "recommendations", label: "推荐闭环" },
              { key: "runs", label: "运行记录" },
            ]}
            activeKey={workspaceTab}
            onChange={(value) => setWorkspaceTab(value as WorkspaceTab)}
          />

          {workspaceTab === "open_loops" ? (
            <OpenLoopWorkbench
              loops={overviewQuery.data.activeOpenLoops}
              rules={draft}
            />
          ) : null}
          {workspaceTab === "recommendations" ? (
            <RecommendationWorkbench
              recommendations={overviewQuery.data.recentRecommendations}
            />
          ) : null}
          {workspaceTab === "runs" ? (
            <RunWorkbench runs={overviewQuery.data.recentRuns} />
          ) : null}
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="规则编辑"
            actions={<AdminDraftStatusPill ready dirty={dirty} />}
          />
          <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            先调调度门槛，再调候选权重，Prompt 和文案放到最后处理，避免一次改太多变量。
          </div>
          {dirty ? (
            <AdminSoftBox className="mt-4 text-xs leading-5">
              当前页面存在未保存草稿。执行调度仍会使用服务端旧规则，保存后才会切到新配置。
            </AdminSoftBox>
          ) : null}
          <AdminTabs
            className="mt-4"
            tabs={[
              { key: "policy", label: "调度门槛" },
              { key: "weights", label: "候选打分" },
              { key: "copy", label: "Prompt 与文案" },
            ]}
            activeKey={configTab}
            onChange={(value) => setConfigTab(value as ConfigTab)}
          />

          {configTab === "policy" ? (
            <PolicyConfigSection draft={draft} onChange={setDraft} />
          ) : null}
          {configTab === "weights" ? (
            <WeightConfigSection draft={draft} onChange={setDraft} />
          ) : null}
          {configTab === "copy" ? (
            <CopyConfigSection draft={draft} onChange={setDraft} />
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function OpenLoopWorkbench({
  loops,
  rules,
}: {
  loops: FollowupOpenLoopRecord[];
  rules: FollowupRuntimeRules;
}) {
  const [scope, setScope] = useState<OpenLoopScope>("attention");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orderedLoops = useMemo(
    () => [...loops].sort(compareOpenLoops),
    [loops],
  );

  const buckets = useMemo(
    () => ({
      attention: orderedLoops.filter((loop) =>
        isAttentionLoopStatus(loop.status),
      ),
      recommended: orderedLoops.filter((loop) => loop.status === "recommended"),
      closed: orderedLoops.filter((loop) => isClosedLoopStatus(loop.status)),
    }),
    [orderedLoops],
  );

  const visibleLoops = buckets[scope];

  useEffect(() => {
    if (!visibleLoops.length) {
      setSelectedId(null);
      return;
    }
    if (!visibleLoops.some((loop) => loop.id === selectedId)) {
      setSelectedId(visibleLoops[0].id);
    }
  }, [selectedId, visibleLoops]);

  const selectedLoop =
    visibleLoops.find((loop) => loop.id === selectedId) ?? visibleLoops[0] ?? null;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <AdminMetaText>
          先看仍需要运营判断的线索，再看已经推荐出去的条目。
        </AdminMetaText>
        <AdminSubTabs
          tabs={[
            { key: "attention", label: `待判断 ${buckets.attention.length}` },
            { key: "recommended", label: `已推荐 ${buckets.recommended.length}` },
            { key: "closed", label: `已结束 ${buckets.closed.length}` },
          ]}
          activeKey={scope}
          onChange={(value) => setScope(value as OpenLoopScope)}
        />
      </div>

      {!visibleLoops.length ? (
        <AdminEmptyState
          title="当前没有对应的 open loop"
          description="如果你刚执行过调度但这里还是空的，通常代表最近没有满足门槛的线索。"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.92fr,1.08fr]">
          <div className="space-y-3">
            {visibleLoops.map((loop) => (
              <AdminSelectableCard
                key={loop.id}
                active={selectedLoop?.id === loop.id}
                onClick={() => setSelectedId(loop.id)}
                title={loop.summary}
                subtitle={loop.sourceThreadTitle || loop.sourceThreadId}
                meta={`${labelFromLoopStatus(loop.status)} · 最近提及 ${formatDateTime(loop.lastMentionedAt)}`}
                badge={
                  <StatusPill tone={toneFromLoopStatus(loop.status)}>
                    {formatScore(loop.handoffNeedScore)}
                  </StatusPill>
                }
                activeLabel="当前查看"
              />
            ))}
          </div>

          {selectedLoop ? (
            <OpenLoopDetail loop={selectedLoop} rules={rules} />
          ) : (
            <AdminEmptyState
              title="没有可查看的线索"
              description="切换筛选后如果为空，说明这个阶段当前没有数据。"
            />
          )}
        </div>
      )}
    </div>
  );
}

function OpenLoopDetail({
  loop,
  rules,
}: {
  loop: FollowupOpenLoopRecord;
  rules: FollowupRuntimeRules;
}) {
  const diagnosis = describeOpenLoop(loop, rules);

  return (
    <div className="space-y-4">
      <AdminCallout
        title={diagnosis.title}
        description={diagnosis.description}
        tone={diagnosis.tone}
      />

      <AdminRecordCard
        title={loop.summary}
        badges={
          <StatusPill tone={toneFromLoopStatus(loop.status)}>
            {labelFromLoopStatus(loop.status)}
          </StatusPill>
        }
        meta={`${labelFromThreadType(loop.sourceThreadType)} · ${loop.sourceThreadTitle || loop.sourceThreadId}`}
        description={
          loop.reasonSummary ||
          "这条线索目前没有额外原因摘要，可以先结合分数和来源线程判断。"
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <ScoreCard
          label="紧急度"
          score={loop.urgencyScore}
          description="越高越值得优先回捞。"
        />
        <ScoreCard
          label="已收口感"
          score={loop.closureScore}
          description="越高说明更像已经接住。"
        />
        <ScoreCard
          label="Handoff 需要度"
          score={loop.handoffNeedScore}
          description={`当前阈值 ${formatScore(rules.minHandoffNeedScore)}`}
          tone={
            loop.handoffNeedScore >= rules.minHandoffNeedScore
              ? "healthy"
              : "warning"
          }
        />
      </div>

      <AdminInfoRows
        title="线索上下文"
        rows={[
          {
            label: "当前阶段",
            value: labelFromLoopStatus(loop.status),
          },
          {
            label: "来源线程",
            value: loop.sourceThreadTitle || loop.sourceThreadId,
          },
          {
            label: "来源角色数",
            value: `${loop.sourceCharacterIds.length} 个`,
          },
          {
            label: "最近提及",
            value: formatDateTime(loop.lastMentionedAt),
          },
          {
            label: "最近推荐",
            value: loop.recommendedAt ? formatDateTime(loop.recommendedAt) : "未推荐",
          },
          {
            label: "主题键",
            value: loop.topicKey,
          },
        ]}
      />

      {loop.domainHints.length ? (
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader title="领域提示" />
          <div className="mt-4 flex flex-wrap gap-2">
            {loop.domainHints.map((hint) => (
              <StatusPill key={hint} tone="muted">
                {hint}
              </StatusPill>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function RecommendationWorkbench({
  recommendations,
}: {
  recommendations: FollowupRecommendationRecord[];
}) {
  const [scope, setScope] = useState<RecommendationScope>("in_progress");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orderedRecommendations = useMemo(
    () => [...recommendations].sort(compareRecommendations),
    [recommendations],
  );

  const buckets = useMemo(
    () => ({
      in_progress: orderedRecommendations.filter(isInProgressRecommendation),
      converted: orderedRecommendations.filter(isConvertedRecommendation),
      closed: orderedRecommendations.filter(isClosedRecommendation),
    }),
    [orderedRecommendations],
  );

  const visibleRecommendations = buckets[scope];

  useEffect(() => {
    if (!visibleRecommendations.length) {
      setSelectedId(null);
      return;
    }
    if (!visibleRecommendations.some((item) => item.id === selectedId)) {
      setSelectedId(visibleRecommendations[0].id);
    }
  }, [selectedId, visibleRecommendations]);

  const selectedRecommendation =
    visibleRecommendations.find((item) => item.id === selectedId) ??
    visibleRecommendations[0] ??
    null;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <AdminMetaText>
          这里重点看“推荐发出去之后卡在哪一步”。
        </AdminMetaText>
        <AdminSubTabs
          tabs={[
            {
              key: "in_progress",
              label: `推进中 ${buckets.in_progress.length}`,
            },
            { key: "converted", label: `已转化 ${buckets.converted.length}` },
            { key: "closed", label: `已结束 ${buckets.closed.length}` },
          ]}
          activeKey={scope}
          onChange={(value) => setScope(value as RecommendationScope)}
        />
      </div>

      {!visibleRecommendations.length ? (
        <AdminEmptyState
          title="当前没有对应的推荐记录"
          description="如果刚执行过调度，这里为空通常代表暂时没有生成新的推荐。"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
          <div className="space-y-3">
            {visibleRecommendations.map((item) => (
              <AdminSelectableCard
                key={item.id}
                active={selectedRecommendation?.id === item.id}
                onClick={() => setSelectedId(item.id)}
                title={item.targetCharacterName}
                subtitle={item.sourceThreadTitle || item.sourceThreadId}
                meta={`${labelFromRecommendationStatus(item.status)} · ${labelFromRelationshipState(item.relationshipState)}`}
                badge={
                  <StatusPill tone={toneFromRecommendationStatus(item.status)}>
                    {labelFromRecommendationStatus(item.status)}
                  </StatusPill>
                }
                activeLabel="当前查看"
              />
            ))}
          </div>

          {selectedRecommendation ? (
            <RecommendationDetail recommendation={selectedRecommendation} />
          ) : (
            <AdminEmptyState
              title="没有可查看的推荐"
              description="切换筛选后如果为空，说明这一阶段当前没有数据。"
            />
          )}
        </div>
      )}
    </div>
  );
}

function RecommendationDetail({
  recommendation,
}: {
  recommendation: FollowupRecommendationRecord;
}) {
  const stage = describeRecommendation(recommendation);
  const timeline = [
    `创建推荐：${formatDateTime(recommendation.createdAt)}`,
    recommendation.openedAt
      ? `已打开推荐：${formatDateTime(recommendation.openedAt)}`
      : null,
    recommendation.friendRequestStartedAt
      ? `已发起好友申请：${formatDateTime(recommendation.friendRequestStartedAt)}`
      : null,
    recommendation.friendAddedAt
      ? `已成为好友：${formatDateTime(recommendation.friendAddedAt)}`
      : null,
    recommendation.chatStartedAt
      ? `已开始聊天：${formatDateTime(recommendation.chatStartedAt)}`
      : null,
    recommendation.resolvedAt
      ? `已完成闭环：${formatDateTime(recommendation.resolvedAt)}`
      : null,
    recommendation.dismissedAt
      ? `已忽略：${formatDateTime(recommendation.dismissedAt)}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="space-y-4">
      <AdminCallout
        title={stage.title}
        description={stage.description}
        tone={stage.tone}
      />

      <AdminRecordCard
        title={recommendation.targetCharacterName}
        badges={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={toneFromRecommendationStatus(recommendation.status)}>
              {labelFromRecommendationStatus(recommendation.status)}
            </StatusPill>
            <StatusPill tone={toneFromRelationshipState(recommendation.relationshipState)}>
              {labelFromRelationshipState(recommendation.relationshipState)}
            </StatusPill>
          </div>
        }
        meta={`${labelFromThreadType(recommendation.sourceThreadType)} · ${recommendation.sourceThreadTitle || recommendation.sourceThreadId}`}
        description={recommendation.reasonSummary}
        details={
          recommendation.handoffSummary ? (
            <AdminSoftBox className="text-xs leading-5">
              {recommendation.handoffSummary}
            </AdminSoftBox>
          ) : undefined
        }
      />

      <AdminInfoRows
        title="闭环上下文"
        rows={[
          {
            label: "推荐人",
            value: recommendation.recommenderCharacterName,
          },
          {
            label: "关系状态",
            value: labelFromRelationshipState(recommendation.relationshipState),
          },
          {
            label: "角色定位",
            value: recommendation.targetCharacterRelationship || "未设置",
          },
          {
            label: "来源线程",
            value: recommendation.sourceThreadTitle || recommendation.sourceThreadId,
          },
          {
            label: "最近更新",
            value: formatDateTime(recommendation.updatedAt),
          },
          {
            label: "消息线程",
            value: recommendation.messageConversationId || "未写入",
          },
        ]}
      />

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader title="关键时间点" />
        <div className="mt-4 space-y-2">
          {timeline.map((item) => (
            <AdminSoftBox key={item} className="text-xs leading-5">
              {item}
            </AdminSoftBox>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RunWorkbench({ runs }: { runs: FollowupRunRecord[] }) {
  const [scope, setScope] = useState<RunScope>("attention");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orderedRuns = useMemo(() => [...runs].sort(compareRuns), [runs]);

  const buckets = useMemo(
    () => ({
      attention: orderedRuns.filter((run) => run.status !== "success"),
      healthy: orderedRuns.filter((run) => run.status === "success"),
      all: orderedRuns,
    }),
    [orderedRuns],
  );

  const visibleRuns = buckets[scope];

  useEffect(() => {
    if (!visibleRuns.length) {
      setSelectedId(null);
      return;
    }
    if (!visibleRuns.some((run) => run.id === selectedId)) {
      setSelectedId(visibleRuns[0].id);
    }
  }, [selectedId, visibleRuns]);

  const selectedRun =
    visibleRuns.find((run) => run.id === selectedId) ?? visibleRuns[0] ?? null;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <AdminMetaText>
          运行记录用于判断这轮调度是“没信号”，还是“真异常”。
        </AdminMetaText>
        <AdminSubTabs
          tabs={[
            { key: "attention", label: `待排查 ${buckets.attention.length}` },
            { key: "healthy", label: `成功 ${buckets.healthy.length}` },
            { key: "all", label: `全部 ${buckets.all.length}` },
          ]}
          activeKey={scope}
          onChange={(value) => setScope(value as RunScope)}
        />
      </div>

      {!visibleRuns.length ? (
        <AdminEmptyState
          title="当前没有对应的运行记录"
          description="如果这里为空，说明最近没有触发主动跟进调度。"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
          <div className="space-y-3">
            {visibleRuns.map((run) => (
              <AdminSelectableCard
                key={run.id}
                active={selectedRun?.id === run.id}
                onClick={() => setSelectedId(run.id)}
                title={run.summary || labelFromRunStatus(run.status)}
                subtitle={formatDateTime(run.startedAt)}
                meta={`候选 ${run.candidateLoopCount} / 选中 ${run.selectedLoopCount} / 发出 ${run.emittedRecommendationCount}`}
                badge={
                  <StatusPill tone={toneFromRunStatus(run.status)}>
                    {labelFromRunStatus(run.status)}
                  </StatusPill>
                }
                activeLabel="当前查看"
              />
            ))}
          </div>

          {selectedRun ? (
            <RunDetail run={selectedRun} />
          ) : (
            <AdminEmptyState
              title="没有可查看的运行"
              description="切换筛选后如果为空，说明这一阶段当前没有记录。"
            />
          )}
        </div>
      )}
    </div>
  );
}

function RunDetail({ run }: { run: FollowupRunRecord }) {
  const diagnosis = describeRun(run);

  return (
    <div className="space-y-4">
      <AdminCallout
        title={diagnosis.title}
        description={diagnosis.description}
        tone={diagnosis.tone}
      />

      <AdminRecordCard
        title={run.summary || "本轮未写入总结。"}
        badges={
          <StatusPill tone={toneFromRunStatus(run.status)}>
            {labelFromRunStatus(run.status)}
          </StatusPill>
        }
        meta={`${labelFromTriggerType(run.triggerType)} · ${formatDateTime(run.startedAt)}`}
        description={
          run.skipReason ||
          run.errorMessage ||
          "这轮运行没有额外的跳过原因或错误信息。"
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <AdminValueCard
          label="候选"
          value={`${run.candidateLoopCount} 条`}
        />
        <AdminValueCard
          label="选中"
          value={`${run.selectedLoopCount} 条`}
        />
        <AdminValueCard
          label="发出"
          value={`${run.emittedRecommendationCount} 条`}
        />
      </div>

      <AdminInfoRows
        title="运行上下文"
        rows={[
          {
            label: "触发方式",
            value: labelFromTriggerType(run.triggerType),
          },
          {
            label: "开始时间",
            value: formatDateTime(run.startedAt),
          },
          {
            label: "结束时间",
            value: run.finishedAt ? formatDateTime(run.finishedAt) : "未写入",
          },
          {
            label: "扫描起点",
            value: run.sourceWindowStartedAt
              ? formatDateTime(run.sourceWindowStartedAt)
              : "未写入",
          },
          {
            label: "扫描终点",
            value: run.sourceWindowEndedAt
              ? formatDateTime(run.sourceWindowEndedAt)
              : "未写入",
          },
          {
            label: "记录更新时间",
            value: formatDateTime(run.updatedAt),
          },
        ]}
      />

      {run.errorMessage ? (
        <AdminSoftBox className="text-xs leading-5 text-rose-700">
          错误信息：{run.errorMessage}
        </AdminSoftBox>
      ) : null}
      {run.skipReason ? (
        <AdminSoftBox className="text-xs leading-5">
          跳过原因：{run.skipReason}
        </AdminSoftBox>
      ) : null}
    </div>
  );
}

function PolicyConfigSection({
  draft,
  onChange,
}: {
  draft: FollowupRuntimeRules;
  onChange: (value: FollowupRuntimeRules) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <ConfigGroup
        title="运行开关"
        description="先决定这套机制是否真正发消息，再决定遇到非好友时要不要自动补发好友申请。"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <CheckboxField
            label="启用主动跟进"
            checked={draft.enabled}
            onChange={(checked) =>
              onChange({
                ...draft,
                enabled: checked,
              })
            }
          />
          <SelectField
            label="执行模式"
            value={draft.executionMode}
            options={[
              { value: "emit_messages", label: "直接发我自己消息 + 名片" },
              { value: "dry_run", label: "只记录候选，不发消息" },
            ]}
            onChange={(value) =>
              onChange({
                ...draft,
                executionMode:
                  value === "dry_run" ? "dry_run" : "emit_messages",
              })
            }
          />
          <CheckboxField
            label="候选还不是好友时自动发申请"
            checked={draft.autoSendFriendRequestToNotFriend}
            onChange={(checked) =>
              onChange({
                ...draft,
                autoSendFriendRequestToNotFriend: checked,
              })
            }
          />
        </div>
      </ConfigGroup>

      <ConfigGroup
        title="调度窗口"
        description="控制多频繁扫描，以及多旧、多安静的线程会被视为值得再次回捞。"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField
            label="扫描间隔（分钟）"
            value={draft.scanIntervalMinutes}
            min={10}
            onChange={(value) =>
              onChange({
                ...draft,
                scanIntervalMinutes: value,
              })
            }
          />
          <NumberField
            label="回看窗口（小时）"
            value={draft.lookbackHours}
            min={6}
            onChange={(value) =>
              onChange({
                ...draft,
                lookbackHours: value,
              })
            }
          />
          <NumberField
            label="安静阈值（小时）"
            value={draft.quietHoursThreshold}
            min={1}
            onChange={(value) =>
              onChange({
                ...draft,
                quietHoursThreshold: value,
              })
            }
          />
          <NumberField
            label="同题冷却（小时）"
            value={draft.sameTopicCooldownHours}
            min={1}
            onChange={(value) =>
              onChange({
                ...draft,
                sameTopicCooldownHours: value,
              })
            }
          />
        </div>
      </ConfigGroup>

      <ConfigGroup
        title="吞吐与阈值"
        description="限制每轮读取与发送的强度，并控制什么样的线索才值得进入 handoff 阶段。"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField
            label="每日推荐上限"
            value={draft.dailyRecommendationLimit}
            min={0}
            onChange={(value) =>
              onChange({
                ...draft,
                dailyRecommendationLimit: value,
              })
            }
          />
          <NumberField
            label="每线程最多读消息"
            value={draft.maxSourceMessagesPerThread}
            min={4}
            onChange={(value) =>
              onChange({
                ...draft,
                maxSourceMessagesPerThread: value,
              })
            }
          />
          <NumberField
            label="每轮最多 open loop"
            value={draft.maxOpenLoopsPerRun}
            min={0}
            onChange={(value) =>
              onChange({
                ...draft,
                maxOpenLoopsPerRun: value,
              })
            }
          />
          <NumberField
            label="每轮最多发推荐"
            value={draft.maxRecommendationsPerRun}
            min={0}
            onChange={(value) =>
              onChange({
                ...draft,
                maxRecommendationsPerRun: value,
              })
            }
          />
          <NumberField
            label="open loop 最低分"
            value={draft.minOpenLoopScore}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) =>
              onChange({
                ...draft,
                minOpenLoopScore: value,
              })
            }
          />
          <NumberField
            label="handoff 最低分"
            value={draft.minHandoffNeedScore}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) =>
              onChange({
                ...draft,
                minHandoffNeedScore: value,
              })
            }
          />
        </div>
      </ConfigGroup>
    </div>
  );
}

function WeightConfigSection({
  draft,
  onChange,
}: {
  draft: FollowupRuntimeRules;
  onChange: (value: FollowupRuntimeRules) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <AdminSoftBox className="text-xs leading-5">
        权重负责“推荐给谁”的排序。先调大方向，再微调惩罚项，避免一次把所有候选顺序打乱。
      </AdminSoftBox>

      <ConfigGroup
        title="推荐打分权重"
        description="正向项负责把更合适的人推上来，惩罚项负责压住重复推荐和关系冲突。"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField
            label="已有好友加成"
            value={draft.candidateWeights.existingFriendBoost}
            min={0}
            max={2}
            step={0.01}
            onChange={(value) =>
              onChange({
                ...draft,
                candidateWeights: {
                  ...draft.candidateWeights,
                  existingFriendBoost: value,
                },
              })
            }
          />
          <NumberField
            label="领域匹配权重"
            value={draft.candidateWeights.domainMatchWeight}
            min={0}
            max={2}
            step={0.01}
            onChange={(value) =>
              onChange({
                ...draft,
                candidateWeights: {
                  ...draft.candidateWeights,
                  domainMatchWeight: value,
                },
              })
            }
          />
          <NumberField
            label="关系匹配权重"
            value={draft.candidateWeights.relationshipMatchWeight}
            min={0}
            max={2}
            step={0.01}
            onChange={(value) =>
              onChange({
                ...draft,
                candidateWeights: {
                  ...draft.candidateWeights,
                  relationshipMatchWeight: value,
                },
              })
            }
          />
          <NumberField
            label="同来源惩罚"
            value={draft.candidateWeights.sameSourcePenalty}
            min={0}
            max={2}
            step={0.01}
            onChange={(value) =>
              onChange({
                ...draft,
                candidateWeights: {
                  ...draft.candidateWeights,
                  sameSourcePenalty: value,
                },
              })
            }
          />
          <NumberField
            label="待处理好友申请惩罚"
            value={draft.candidateWeights.pendingRequestPenalty}
            min={0}
            max={2}
            step={0.01}
            onChange={(value) =>
              onChange({
                ...draft,
                candidateWeights: {
                  ...draft.candidateWeights,
                  pendingRequestPenalty: value,
                },
              })
            }
          />
          <NumberField
            label="近期已推荐惩罚"
            value={draft.candidateWeights.recentRecommendationPenalty}
            min={0}
            max={2}
            step={0.01}
            onChange={(value) =>
              onChange({
                ...draft,
                candidateWeights: {
                  ...draft.candidateWeights,
                  recentRecommendationPenalty: value,
                },
              })
            }
          />
        </div>
      </ConfigGroup>
    </div>
  );
}

function CopyConfigSection({
  draft,
  onChange,
}: {
  draft: FollowupRuntimeRules;
  onChange: (value: FollowupRuntimeRules) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <AdminSoftBox className="text-xs leading-5">
        只有在门槛和权重稳定后，再改 Prompt 与文案。否则很难判断是“策略问题”还是“表达问题”。
      </AdminSoftBox>

      <ConfigGroup
        title="Prompt 模板"
        description="这些提示词决定 open loop 提取、我自己消息、好友申请招呼语和申请后通知的生成方式。"
      >
        <div className="space-y-4">
          <TextareaField
            label="Open loop 提取 Prompt"
            rows={14}
            value={draft.promptTemplates.openLoopExtractionPrompt}
            onChange={(value) =>
              onChange({
                ...draft,
                promptTemplates: {
                  ...draft.promptTemplates,
                  openLoopExtractionPrompt: value,
                },
              })
            }
          />
          <TextareaField
            label="我自己主动跟进 Prompt"
            rows={12}
            value={draft.promptTemplates.handoffMessagePrompt}
            onChange={(value) =>
              onChange({
                ...draft,
                promptTemplates: {
                  ...draft.promptTemplates,
                  handoffMessagePrompt: value,
                },
              })
            }
          />
          <TextareaField
            label="好友申请招呼语 Prompt"
            rows={10}
            value={draft.promptTemplates.friendRequestGreetingPrompt}
            onChange={(value) =>
              onChange({
                ...draft,
                promptTemplates: {
                  ...draft.promptTemplates,
                  friendRequestGreetingPrompt: value,
                },
              })
            }
          />
          <TextareaField
            label="申请后通知 Prompt"
            rows={10}
            value={draft.promptTemplates.friendRequestNoticePrompt}
            onChange={(value) =>
              onChange({
                ...draft,
                promptTemplates: {
                  ...draft.promptTemplates,
                  friendRequestNoticePrompt: value,
                },
              })
            }
          />
        </div>
      </ConfigGroup>

      <ConfigGroup
        title="系统文案"
        description="这些短文案会直接影响运营回看和用户感知，建议先保证语义稳定，再调语气。"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="成功总结文案"
            value={draft.textTemplates.jobSummarySuccess}
            onChange={(value) =>
              onChange({
                ...draft,
                textTemplates: {
                  ...draft.textTemplates,
                  jobSummarySuccess: value,
                },
              })
            }
          />
          <TextField
            label="停用跳过文案"
            value={draft.textTemplates.jobSummarySkippedDisabled}
            onChange={(value) =>
              onChange({
                ...draft,
                textTemplates: {
                  ...draft.textTemplates,
                  jobSummarySkippedDisabled: value,
                },
              })
            }
          />
          <TextField
            label="无信号跳过文案"
            value={draft.textTemplates.jobSummarySkippedNoSignals}
            onChange={(value) =>
              onChange({
                ...draft,
                textTemplates: {
                  ...draft.textTemplates,
                  jobSummarySkippedNoSignals: value,
                },
              })
            }
          />
          <TextField
            label="兜底消息文案"
            value={draft.textTemplates.fallbackMessage}
            onChange={(value) =>
              onChange({
                ...draft,
                textTemplates: {
                  ...draft.textTemplates,
                  fallbackMessage: value,
                },
              })
            }
          />
          <TextField
            label="名片角标"
            value={draft.textTemplates.recommendationBadge}
            onChange={(value) =>
              onChange({
                ...draft,
                textTemplates: {
                  ...draft.textTemplates,
                  recommendationBadge: value,
                },
              })
            }
          />
          <TextField
            label="好友申请兜底招呼语"
            value={draft.textTemplates.friendRequestFallbackGreeting}
            onChange={(value) =>
              onChange({
                ...draft,
                textTemplates: {
                  ...draft.textTemplates,
                  friendRequestFallbackGreeting: value,
                },
              })
            }
          />
          <TextField
            label="申请后通知兜底文案"
            value={draft.textTemplates.friendRequestFallbackMessage}
            onChange={(value) =>
              onChange({
                ...draft,
                textTemplates: {
                  ...draft.textTemplates,
                  friendRequestFallbackMessage: value,
                },
              })
            }
          />
          <TextField
            label="已发申请角标"
            value={draft.textTemplates.friendRequestBadge}
            onChange={(value) =>
              onChange({
                ...draft,
                textTemplates: {
                  ...draft.textTemplates,
                  friendRequestBadge: value,
                },
              })
            }
          />
        </div>
      </ConfigGroup>
    </div>
  );
}

function ConfigGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white/75 p-4 shadow-[var(--shadow-soft)]">
      <div className="font-semibold text-[color:var(--text-primary)]">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ScoreCard({
  label,
  score,
  description,
  tone = score >= 0.6 ? "healthy" : "warning",
}: {
  label: string;
  score: number;
  description: string;
  tone?: "healthy" | "warning";
}) {
  return (
    <AdminValueCard
      label={label}
      value={
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <StatusPill tone={tone}>{formatScore(score)}</StatusPill>
          </div>
          <div className="text-xs leading-5 text-[color:var(--text-muted)]">
            {description}
          </div>
        </div>
      }
    />
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-xs font-medium text-[color:var(--text-secondary)]">
        {label}
      </div>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]"
      />
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-white/70 px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[color:var(--brand-primary)]"
      />
      <span className="text-sm text-[color:var(--text-primary)]">{label}</span>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-xs font-medium text-[color:var(--text-secondary)]">
        {label}
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-xs font-medium text-[color:var(--text-secondary)]">
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-xs font-medium text-[color:var(--text-secondary)]">
        {label}
      </div>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm leading-6 text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]"
      />
    </label>
  );
}

function serializeRules(value: FollowupRuntimeRules | null) {
  return JSON.stringify(value ?? null);
}

function compareOpenLoops(a: FollowupOpenLoopRecord, b: FollowupOpenLoopRecord) {
  return (
    b.handoffNeedScore - a.handoffNeedScore ||
    b.urgencyScore - a.urgencyScore ||
    compareDates(b.lastMentionedAt, a.lastMentionedAt)
  );
}

function compareRecommendations(
  a: FollowupRecommendationRecord,
  b: FollowupRecommendationRecord,
) {
  return (
    recommendationRank(a.status) - recommendationRank(b.status) ||
    compareDates(b.updatedAt, a.updatedAt)
  );
}

function compareRuns(a: FollowupRunRecord, b: FollowupRunRecord) {
  return compareDates(b.startedAt, a.startedAt);
}

function compareDates(a?: string | null, b?: string | null) {
  return new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime();
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "未发生";
  }

  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatScore(value: number) {
  return value.toFixed(2);
}

function labelFromExecutionMode(mode: FollowupRuntimeRules["executionMode"]) {
  return mode === "dry_run" ? "只记录候选" : "直接发消息";
}

function labelFromThreadType(type: FollowupOpenLoopRecord["sourceThreadType"]) {
  return type === "group" ? "群聊" : "私聊";
}

function labelFromLoopStatus(status: FollowupOpenLoopRecord["status"]) {
  switch (status) {
    case "open":
      return "待判断";
    case "watching":
      return "继续观察";
    case "recommended":
      return "已推荐";
    case "resolved":
      return "已解决";
    case "dismissed":
      return "已忽略";
    case "expired":
      return "已过期";
    default:
      return status;
  }
}

function labelFromRecommendationStatus(
  status: FollowupRecommendationRecord["status"],
) {
  switch (status) {
    case "draft":
      return "草稿";
    case "sent":
      return "已发出";
    case "opened":
      return "已打开";
    case "friend_request_started":
      return "已发起申请";
    case "friend_request_pending":
      return "等待通过";
    case "friend_added":
      return "已成好友";
    case "chat_started":
      return "已开始聊天";
    case "resolved":
      return "已完成";
    case "dismissed":
      return "已忽略";
    case "expired":
      return "已过期";
    default:
      return status;
  }
}

function labelFromRelationshipState(
  state: FollowupRecommendationRecord["relationshipState"],
) {
  switch (state) {
    case "friend":
      return "已是好友";
    case "pending":
      return "申请处理中";
    case "not_friend":
      return "尚未加友";
    default:
      return state;
  }
}

function labelFromRunStatus(status: FollowupRunRecord["status"]) {
  switch (status) {
    case "success":
      return "成功";
    case "failed":
      return "失败";
    default:
      return "跳过";
  }
}

function labelFromTriggerType(type: FollowupRunRecord["triggerType"]) {
  switch (type) {
    case "manual":
      return "手动触发";
    case "event":
      return "事件触发";
    default:
      return "调度器触发";
  }
}

function isAttentionLoopStatus(status: FollowupOpenLoopRecord["status"]) {
  return status === "open" || status === "watching";
}

function isClosedLoopStatus(status: FollowupOpenLoopRecord["status"]) {
  return status === "resolved" || status === "dismissed" || status === "expired";
}

function isInProgressRecommendation(item: FollowupRecommendationRecord) {
  return (
    item.status === "draft" ||
    item.status === "sent" ||
    item.status === "opened" ||
    item.status === "friend_request_started" ||
    item.status === "friend_request_pending"
  );
}

function isConvertedRecommendation(item: FollowupRecommendationRecord) {
  return (
    item.status === "friend_added" ||
    item.status === "chat_started" ||
    item.status === "resolved"
  );
}

function isClosedRecommendation(item: FollowupRecommendationRecord) {
  return item.status === "dismissed" || item.status === "expired";
}

function recommendationRank(
  status: FollowupRecommendationRecord["status"],
) {
  switch (status) {
    case "friend_request_pending":
      return 0;
    case "friend_request_started":
      return 1;
    case "opened":
      return 2;
    case "sent":
      return 3;
    case "draft":
      return 4;
    case "chat_started":
      return 5;
    case "friend_added":
      return 6;
    case "resolved":
      return 7;
    case "dismissed":
      return 8;
    case "expired":
      return 9;
    default:
      return 10;
  }
}

function describeOpenLoop(
  loop: FollowupOpenLoopRecord,
  rules: FollowupRuntimeRules,
) {
  if (loop.status === "recommended") {
    return {
      tone: "success" as const,
      title: "这条线索已经进入推荐阶段",
      description: "当前更值得运营关注的是推荐后有没有真正被打开、加友和继续对话。",
    };
  }

  if (loop.handoffNeedScore >= rules.minHandoffNeedScore) {
    return {
      tone: "warning" as const,
      title: "这条线索已经达到 handoff 阈值",
      description: "如果它仍停留在待判断或观察阶段，优先检查本轮容量限制、冷却规则或候选排序是否把它压住了。",
    };
  }

  if (loop.closureScore >= 0.7) {
    return {
      tone: "info" as const,
      title: "这条线索看起来已经部分收口",
      description: "当前更像是“已有人接住但还没完全闭环”，不一定需要再主动打扰一次。",
    };
  }

  return {
    tone: "info" as const,
    title: "这条线索仍在观察窗口内",
    description: "优先看 handoff 需要度、来源线程和最近提及时间，判断是否要通过调阈值把它提上来。",
  };
}

function describeRecommendation(recommendation: FollowupRecommendationRecord) {
  switch (recommendation.status) {
    case "friend_request_pending":
      return {
        tone: "warning" as const,
        title: "推荐已经进入等待通过阶段",
        description: "当前的关键不是继续多发，而是确认好友申请是否会被处理，避免重复打扰。",
      };
    case "opened":
      return {
        tone: "info" as const,
        title: "推荐已被打开，但还未形成关系推进",
        description: "说明内容已经被看到，下一步重点看是否需要更强的招呼语或更明确的角色匹配。",
      };
    case "friend_added":
    case "chat_started":
    case "resolved":
      return {
        tone: "success" as const,
        title: "这条推荐已经完成主要转化",
        description: "可以把它当成有效样本，回头观察推荐理由和关系匹配是否值得复制。",
      };
    case "dismissed":
    case "expired":
      return {
        tone: "warning" as const,
        title: "这条推荐已经自然结束",
        description: "适合回看原因摘要和目标角色定位，判断是时机不对，还是推荐对象不合适。",
      };
    default:
      return {
        tone: "info" as const,
        title: "推荐正在推进中",
        description: "优先核对来源线程、关系状态和目标角色定位，判断当前链路是否合理。",
      };
  }
}

function describeRun(run: FollowupRunRecord) {
  if (run.status === "failed") {
    return {
      tone: "warning" as const,
      title: "这轮运行失败，需要先排查",
      description:
        "先看错误信息和扫描窗口，再判断是调度异常、数据写入失败，还是下游链路不通。",
    };
  }

  if (run.status === "skipped") {
    return {
      tone: "info" as const,
      title: "这轮运行被跳过",
      description:
        "跳过不一定是坏事。优先看 skip reason，确认是主动停用、无信号，还是被容量门槛拦住。",
    };
  }

  return {
    tone: "success" as const,
    title: "这轮运行完成",
    description:
      "重点看候选数、选中数和发出数是否符合预期，用来判断当前门槛是不是过松或过紧。",
  };
}

function toneFromRunStatus(status: FollowupRunRecord["status"]) {
  switch (status) {
    case "success":
      return "healthy" as const;
    case "failed":
      return "warning" as const;
    default:
      return "muted" as const;
  }
}

function toneFromLoopStatus(status: FollowupOpenLoopRecord["status"]) {
  if (status === "recommended") {
    return "healthy" as const;
  }
  if (status === "resolved") {
    return "muted" as const;
  }
  return "warning" as const;
}

function toneFromRecommendationStatus(
  status: FollowupRecommendationRecord["status"],
) {
  if (status === "chat_started" || status === "resolved" || status === "friend_added") {
    return "healthy" as const;
  }
  if (status === "dismissed" || status === "expired") {
    return "warning" as const;
  }
  return "muted" as const;
}

function toneFromRelationshipState(
  state: FollowupRecommendationRecord["relationshipState"],
) {
  if (state === "friend") {
    return "healthy" as const;
  }
  if (state === "pending") {
    return "warning" as const;
  }
  return "muted" as const;
}
