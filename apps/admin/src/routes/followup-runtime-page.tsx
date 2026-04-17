import { useEffect, useMemo, useState } from "react";
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
  AdminPageHero,
  AdminSectionHeader,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

export function FollowupRuntimePage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ["admin-followup-runtime", baseUrl],
    queryFn: () => adminApi.getFollowupRuntimeOverview(),
  });
  const [draft, setDraft] = useState<FollowupRuntimeRules | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!overviewQuery.data) {
      return;
    }
    setDraft(overviewQuery.data.rules);
  }, [overviewQuery.data]);

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

  const metrics = useMemo(
    () => [
      {
        label: "活跃 open loop",
        value: overviewQuery.data?.stats.activeOpenLoopCount ?? 0,
      },
      {
        label: "已发推荐",
        value: overviewQuery.data?.stats.sentRecommendationCount ?? 0,
      },
      {
        label: "待确认好友申请",
        value: overviewQuery.data?.stats.friendRequestPendingCount ?? 0,
      },
      {
        label: "已成好友",
        value: overviewQuery.data?.stats.friendAddedCount ?? 0,
      },
    ],
    [overviewQuery.data],
  );

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <LoadingBlock label="正在读取主动跟进配置..." />;
  }

  if (!overviewQuery.data || !draft) {
    return (
      <ErrorBlock
        message={
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "主动跟进数据加载失败。"
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="主动跟进"
        title="我自己回捞未闭环事项"
        description="扫描已经安静下来的私聊，把没真正解决的事从“我自己”里捞回来；能直接接住的人，必要时会先自动发出好友申请。"
        metrics={metrics}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              立即执行
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              保存规则
            </Button>
          </>
        }
      />

      {notice ? (
        <Card className="border border-emerald-200 bg-emerald-50/80 text-sm text-emerald-700">
          {notice}
        </Card>
      ) : null}
      {saveMutation.error instanceof Error ? (
        <ErrorBlock message={saveMutation.error.message} />
      ) : null}
      {runMutation.error instanceof Error ? (
        <ErrorBlock message={runMutation.error.message} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.9fr]">
        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="调度与门槛"
              actions={
                <StatusPill tone={draft.enabled ? "healthy" : "muted"}>
                  {draft.enabled ? "启用中" : "已停用"}
                </StatusPill>
              }
            />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <CheckboxField
                label="启用主动跟进"
                checked={draft.enabled}
                onChange={(checked) =>
                  setDraft({
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
                  setDraft({
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
                  setDraft({
                    ...draft,
                    autoSendFriendRequestToNotFriend: checked,
                  })
                }
              />
              <NumberField
                label="扫描间隔（分钟）"
                value={draft.scanIntervalMinutes}
                min={10}
                onChange={(value) =>
                  setDraft({
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
                  setDraft({
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
                  setDraft({
                    ...draft,
                    quietHoursThreshold: value,
                  })
                }
              />
              <NumberField
                label="每日推荐上限"
                value={draft.dailyRecommendationLimit}
                min={0}
                onChange={(value) =>
                  setDraft({
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
                  setDraft({
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
                  setDraft({
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
                  setDraft({
                    ...draft,
                    maxRecommendationsPerRun: value,
                  })
                }
              />
              <NumberField
                label="同题冷却（小时）"
                value={draft.sameTopicCooldownHours}
                min={1}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    sameTopicCooldownHours: value,
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
                  setDraft({
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
                  setDraft({
                    ...draft,
                    minHandoffNeedScore: value,
                  })
                }
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="推荐打分权重" />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <NumberField
                label="已有好友加成"
                value={draft.candidateWeights.existingFriendBoost}
                min={0}
                max={2}
                step={0.01}
                onChange={(value) =>
                  setDraft({
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
                  setDraft({
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
                  setDraft({
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
                  setDraft({
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
                  setDraft({
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
                  setDraft({
                    ...draft,
                    candidateWeights: {
                      ...draft.candidateWeights,
                      recentRecommendationPenalty: value,
                    },
                  })
                }
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="提示词与文案" />
            <div className="mt-4 space-y-4">
              <TextareaField
                label="Open loop 提取 Prompt"
                rows={16}
                value={draft.promptTemplates.openLoopExtractionPrompt}
                onChange={(value) =>
                  setDraft({
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
                  setDraft({
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
                rows={12}
                value={draft.promptTemplates.friendRequestGreetingPrompt}
                onChange={(value) =>
                  setDraft({
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
                rows={12}
                value={draft.promptTemplates.friendRequestNoticePrompt}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    promptTemplates: {
                      ...draft.promptTemplates,
                      friendRequestNoticePrompt: value,
                    },
                  })
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="成功总结文案"
                  value={draft.textTemplates.jobSummarySuccess}
                  onChange={(value) =>
                    setDraft({
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
                    setDraft({
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
                    setDraft({
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
                    setDraft({
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
                    setDraft({
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
                    setDraft({
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
                    setDraft({
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
                    setDraft({
                      ...draft,
                      textTemplates: {
                        ...draft.textTemplates,
                        friendRequestBadge: value,
                      },
                    })
                  }
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <RunListCard runs={overviewQuery.data.recentRuns} />
          <OpenLoopListCard loops={overviewQuery.data.activeOpenLoops} />
          <RecommendationListCard
            recommendations={overviewQuery.data.recentRecommendations}
          />
        </div>
      </div>
    </div>
  );
}

function RunListCard({ runs }: { runs: FollowupRunRecord[] }) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader title="最近运行" />
      <div className="mt-4 space-y-3">
        {runs.length ? (
          runs.map((run) => (
            <div
              key={run.id}
              className="rounded-2xl border border-[color:var(--border-faint)] bg-white/75 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {run.summary || "本轮未写入总结。"}
                </div>
                <StatusPill tone={toneFromRunStatus(run.status)}>
                  {labelFromRunStatus(run.status)}
                </StatusPill>
              </div>
              <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                {run.startedAt}
              </div>
              <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                候选 {run.candidateLoopCount} / 选中 {run.selectedLoopCount} /
                发出 {run.emittedRecommendationCount}
              </div>
              {run.skipReason ? (
                <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
                  跳过原因：{run.skipReason}
                </div>
              ) : null}
              {run.errorMessage ? (
                <div className="mt-2 text-xs leading-5 text-rose-600">
                  {run.errorMessage}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyConsoleState label="还没有主动跟进运行记录。" />
        )}
      </div>
    </Card>
  );
}

function OpenLoopListCard({ loops }: { loops: FollowupOpenLoopRecord[] }) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader title="当前 Open Loop" />
      <div className="mt-4 space-y-3">
        {loops.length ? (
          loops.map((loop) => (
            <div
              key={loop.id}
              className="rounded-2xl border border-[color:var(--border-faint)] bg-white/75 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {loop.summary}
                </div>
                <StatusPill tone={toneFromLoopStatus(loop.status)}>
                  {loop.status}
                </StatusPill>
              </div>
              <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                来源：{loop.sourceThreadTitle || loop.sourceThreadId}
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-secondary)]">
                urgency {loop.urgencyScore.toFixed(2)} / closure{" "}
                {loop.closureScore.toFixed(2)} / handoff{" "}
                {loop.handoffNeedScore.toFixed(2)}
              </div>
              {loop.domainHints.length ? (
                <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
                  领域：{loop.domainHints.join("、")}
                </div>
              ) : null}
              {loop.reasonSummary ? (
                <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
                  {loop.reasonSummary}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyConsoleState label="当前没有待跟进的 open loop。" />
        )}
      </div>
    </Card>
  );
}

function RecommendationListCard({
  recommendations,
}: {
  recommendations: FollowupRecommendationRecord[];
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader title="最近推荐" />
      <div className="mt-4 space-y-3">
        {recommendations.length ? (
          recommendations.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[color:var(--border-faint)] bg-white/75 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {item.targetCharacterName}
                </div>
                <StatusPill tone={toneFromRecommendationStatus(item.status)}>
                  {item.status}
                </StatusPill>
              </div>
              <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                来源：{item.sourceThreadTitle || item.sourceThreadId}
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-secondary)]">
                关系：{item.relationshipState} · 角色定位：{" "}
                {item.targetCharacterRelationship || "未设置"}
              </div>
              <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
                {item.reasonSummary}
              </div>
              {item.handoffSummary ? (
                <div className="mt-2 rounded-2xl bg-[color:var(--surface-secondary)] px-3 py-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                  {item.handoffSummary}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyConsoleState label="最近还没有推荐记录。" />
        )}
      </div>
    </Card>
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

function EmptyConsoleState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--border-faint)] px-4 py-5 text-sm text-[color:var(--text-muted)]">
      {label}
    </div>
  );
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
  if (status === "chat_started" || status === "resolved") {
    return "healthy" as const;
  }
  if (status === "dismissed" || status === "expired") {
    return "warning" as const;
  }
  return "muted" as const;
}
