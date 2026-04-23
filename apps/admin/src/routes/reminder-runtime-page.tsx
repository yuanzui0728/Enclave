import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  runSchedulerJob,
  type SnoozeReminderTaskRequest,
  type ReminderRuntimeMomentRecord,
  type ReminderRuntimeMessageRecord,
  type ReminderTaskRecord,
} from "@yinjie/contracts";
import { Button, Card, ErrorBlock, LoadingBlock, StatusPill } from "@yinjie/ui";
import {
  AdminCallout,
  AdminEmptyState,
  AdminInfoRows,
  AdminMetaText,
  AdminPageHero,
  AdminRecordCard,
  AdminSectionHeader,
  AdminSoftBox,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

type ReminderSchedulerJob =
  | "trigger_due_reminder_tasks"
  | "trigger_reminder_checkins"
  | "check_moment_schedule";

const TASK_KIND_LABELS: Record<string, string> = {
  one_time: "单次",
  recurring: "重复",
  habit: "习惯",
};

const TASK_CATEGORY_LABELS: Record<string, string> = {
  general: "通用",
  growth: "成长",
  lifestyle: "生活",
  health: "健康",
  shopping: "采购",
};

const MOMENT_KIND_LABELS: Record<string, string> = {
  reminder_nudge: "定时轻提醒",
  routine_ai: "普通发圈",
  reality_linked_ai: "现实联动",
};

const JOB_SUCCESS_NOTICES: Record<ReminderSchedulerJob, string> = {
  trigger_due_reminder_tasks: "到点提醒调度已执行。",
  trigger_reminder_checkins: "提醒问询调度已执行。",
  check_moment_schedule: "提醒发圈窗口已执行。",
};

type ReminderTaskAction =
  | "complete"
  | "snooze_30m"
  | "snooze_tomorrow"
  | "cancel";

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

function formatCheckinHours(hours: number[]) {
  if (!hours.length) {
    return "未配置";
  }

  return hours
    .map((hour) => `${String(hour).padStart(2, "0")}:00`)
    .join(" / ");
}

function taskTone(task: ReminderTaskRecord) {
  return task.priority === "hard" ? "warning" : "muted";
}

function buildTaskBadges(task: ReminderTaskRecord) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill tone={taskTone(task)}>
        {task.priority === "hard" ? "硬提醒" : "轻提醒"}
      </StatusPill>
      <StatusPill tone={task.kind === "habit" ? "healthy" : "muted"}>
        {TASK_KIND_LABELS[task.kind] ?? task.kind}
      </StatusPill>
      <StatusPill tone="muted">
        {TASK_CATEGORY_LABELS[task.category] ?? task.category}
      </StatusPill>
    </div>
  );
}

function buildTaskMeta(task: ReminderTaskRecord) {
  const parts = [task.scheduleText];
  if (task.nextTriggerAt) {
    parts.push(`下次 ${formatDateTime(task.nextTriggerAt)}`);
  }
  return parts.join(" · ");
}

function buildTaskDetails(task: ReminderTaskRecord) {
  const items = [
    task.lastDeliveredAt
      ? `最近触发：${formatDateTime(task.lastDeliveredAt)}`
      : null,
    task.lastCompletedAt
      ? `最近完成：${formatDateTime(task.lastCompletedAt)}`
      : null,
    task.completionCount > 0 ? `累计完成 ${task.completionCount} 次` : null,
  ].filter((item): item is string => Boolean(item));

  if (!items.length) {
    return (
      <AdminSoftBox className="text-xs">
        还没有触发或完成记录。
      </AdminSoftBox>
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <AdminSoftBox key={item} className="text-xs">
          {item}
        </AdminSoftBox>
      ))}
    </div>
  );
}

function buildTomorrowReminderIso(task: ReminderTaskRecord) {
  const basisValue = task.nextTriggerAt ?? task.dueAt;
  const basis = basisValue ? new Date(basisValue) : new Date();
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(basis.getHours(), basis.getMinutes(), 0, 0);
  return next.toISOString();
}

function momentTone(moment: ReminderRuntimeMomentRecord) {
  return moment.generationKind === "reminder_nudge" ? "healthy" : "muted";
}

function MessageRecordCard({
  record,
}: {
  record: ReminderRuntimeMessageRecord;
}) {
  return (
    <AdminRecordCard
      title={formatDateTime(record.createdAt)}
      description={record.text}
      details={
        <AdminMetaText>
          会话 {record.conversationId}
        </AdminMetaText>
      }
    />
  );
}

function MomentRecordCard({
  moment,
}: {
  moment: ReminderRuntimeMomentRecord;
}) {
  return (
    <AdminRecordCard
      title={moment.slotLabel || MOMENT_KIND_LABELS[moment.generationKind] || moment.generationKind}
      badges={<StatusPill tone={momentTone(moment)}>{MOMENT_KIND_LABELS[moment.generationKind] || moment.generationKind}</StatusPill>}
      meta={`${formatDateTime(moment.postedAt)} · ${moment.likeCount} 赞 · ${moment.commentCount} 评论`}
      description={moment.text}
      details={
        moment.slot ? (
          <AdminSoftBox className="text-xs">
            时段：{moment.slot}
          </AdminSoftBox>
        ) : undefined
      }
    />
  );
}

export function ReminderRuntimePage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["admin-reminder-runtime", baseUrl],
    queryFn: () => adminApi.getReminderRuntimeOverview(),
  });

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const invalidateReminderRuntimeOverview = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["admin-reminder-runtime", baseUrl],
    });
  };

  const runMutation = useMutation({
    mutationFn: (jobId: ReminderSchedulerJob) => runSchedulerJob(jobId, baseUrl),
    onSuccess: async (_, jobId) => {
      setNotice(JOB_SUCCESS_NOTICES[jobId]);
      await Promise.all([
        invalidateReminderRuntimeOverview(),
        queryClient.invalidateQueries({
          queryKey: ["admin-scheduler-status", baseUrl],
        }),
      ]);
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => adminApi.completeReminderRuntimeTask(taskId),
    onSuccess: async ({ task }) => {
      setNotice(
        task.kind === "one_time"
          ? `已完成：${task.title}`
          : `已记录完成：${task.title}`,
      );
      await invalidateReminderRuntimeOverview();
    },
  });

  const snoozeTaskMutation = useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: string;
      payload: SnoozeReminderTaskRequest;
    }) => adminApi.snoozeReminderRuntimeTask(taskId, payload),
    onSuccess: async ({ task }, variables) => {
      setNotice(
        variables.payload.until
          ? `${task.title} 已顺到明天。`
          : `${task.title} 已往后顺 30 分钟。`,
      );
      await invalidateReminderRuntimeOverview();
    },
  });

  const cancelTaskMutation = useMutation({
    mutationFn: (taskId: string) => adminApi.cancelReminderRuntimeTask(taskId),
    onSuccess: async ({ task }) => {
      setNotice(`已删除：${task.title}`);
      await invalidateReminderRuntimeOverview();
    },
  });

  const taskActionError =
    completeTaskMutation.error instanceof Error
      ? completeTaskMutation.error
      : snoozeTaskMutation.error instanceof Error
        ? snoozeTaskMutation.error
        : cancelTaskMutation.error instanceof Error
          ? cancelTaskMutation.error
          : null;

  const activeTaskAction = useMemo(() => {
    if (completeTaskMutation.isPending) {
      return {
        taskId: completeTaskMutation.variables ?? null,
        action: "complete" as ReminderTaskAction,
      };
    }
    if (snoozeTaskMutation.isPending) {
      return {
        taskId: snoozeTaskMutation.variables?.taskId ?? null,
        action:
          snoozeTaskMutation.variables?.payload.until != null
            ? ("snooze_tomorrow" as ReminderTaskAction)
            : ("snooze_30m" as ReminderTaskAction),
      };
    }
    if (cancelTaskMutation.isPending) {
      return {
        taskId: cancelTaskMutation.variables ?? null,
        action: "cancel" as ReminderTaskAction,
      };
    }
    return {
      taskId: null,
      action: null as ReminderTaskAction | null,
    };
  }, [
    cancelTaskMutation.isPending,
    cancelTaskMutation.variables,
    completeTaskMutation.isPending,
    completeTaskMutation.variables,
    snoozeTaskMutation.isPending,
    snoozeTaskMutation.variables,
  ]);

  const metrics = useMemo(() => {
    const stats = overviewQuery.data?.stats;
    return [
      {
        label: "活跃提醒",
        value: stats?.activeTaskCount ?? 0,
      },
      {
        label: "习惯 / 硬提醒",
        value: `${stats?.habitTaskCount ?? 0} / ${stats?.hardTaskCount ?? 0}`,
      },
      {
        label: "今日触发 / 完成",
        value: `${stats?.deliveredTodayCount ?? 0} / ${stats?.completedTodayCount ?? 0}`,
      },
      {
        label: "今日发圈",
        value: stats?.momentCountToday ?? 0,
      },
    ];
  }, [overviewQuery.data]);

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <LoadingBlock label="正在读取提醒运行时概览..." />;
  }

  if (!overviewQuery.data) {
    return (
      <ErrorBlock
        message={
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "提醒运行时概览加载失败。"
        }
      />
    );
  }

  const { rules, stats } = overviewQuery.data;
  const runningJob = runMutation.variables ?? null;

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="提醒运行时"
        title="小盯的提醒任务、触发记录与轻提醒发圈"
        description="集中查看提醒角色当前在盯哪些事、最近有没有真正发出去，以及晨间 / 晚间的长期习惯轻提醒是否按窗口落地。"
        metrics={metrics}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => runMutation.mutate("trigger_due_reminder_tasks")}
              disabled={runMutation.isPending}
            >
              {runningJob === "trigger_due_reminder_tasks" ? "执行中..." : "执行到点提醒"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => runMutation.mutate("trigger_reminder_checkins")}
              disabled={runMutation.isPending}
            >
              {runningJob === "trigger_reminder_checkins" ? "执行中..." : "执行问询"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => runMutation.mutate("check_moment_schedule")}
              disabled={runMutation.isPending}
            >
              {runningJob === "check_moment_schedule" ? "执行中..." : "执行发圈窗口"}
            </Button>
          </>
        }
      />

      {notice ? (
        <Card className="border border-emerald-200 bg-emerald-50/80 text-sm text-emerald-700">
          {notice}
        </Card>
      ) : null}
      {runMutation.error instanceof Error ? (
        <ErrorBlock message={runMutation.error.message} />
      ) : null}
      {taskActionError ? (
        <ErrorBlock message={taskActionError.message} />
      ) : null}

      {stats.overdueTaskCount > 0 ? (
        <AdminCallout
          title="仍有逾期提醒未处理"
          tone="warning"
          description={`当前有 ${stats.overdueTaskCount} 条提醒已过触发时间，${stats.hardTaskCount} 条属于硬提醒。建议先执行一次“到点提醒”，再回看最近出站消息。`}
        />
      ) : (
        <AdminCallout
          title="提醒链路在线"
          tone="success"
          description="小盯的私聊提醒、定时问询和长期轻提醒发圈都已经接到同一条运行时数据上。这里看到的任务与用户聊天线程是一套数据。"
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
        <div className="space-y-6">
          <AdminInfoRows
            title="规则快照"
            rows={[
              {
                label: "默认单次提醒时间",
                value: `${String(rules.defaultReminderHour).padStart(2, "0")}:${String(rules.defaultReminderMinute).padStart(2, "0")}`,
              },
              {
                label: "习惯提醒默认时间",
                value: `${String(rules.habitDefaultHour).padStart(2, "0")}:${String(rules.habitDefaultMinute).padStart(2, "0")}`,
              },
              {
                label: "问询小时点",
                value: formatCheckinHours(rules.checkinHours),
              },
              {
                label: "最小问询间隔",
                value: `${rules.checkinMinIntervalHours} 小时`,
              },
              {
                label: "聊天列表最大项数",
                value: `${rules.maxListItems} 项`,
              },
            ]}
          />

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="活跃提醒任务"
              actions={
                <StatusPill tone={stats.activeTaskCount > 0 ? "healthy" : "muted"}>
                  {stats.activeTaskCount} 条
                </StatusPill>
              }
            />
            <div className="mt-4 space-y-3">
              {overviewQuery.data.activeTasks.length ? (
                overviewQuery.data.activeTasks.map((task) => (
                  <AdminRecordCard
                    key={task.id}
                    title={task.title}
                    badges={buildTaskBadges(task)}
                    meta={buildTaskMeta(task)}
                    description={task.detail || undefined}
                    details={buildTaskDetails(task)}
                    actions={
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(activeTaskAction.taskId)}
                          onClick={() => completeTaskMutation.mutate(task.id)}
                        >
                          {activeTaskAction.taskId === task.id &&
                          activeTaskAction.action === "complete"
                            ? "处理中..."
                            : "完成"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(activeTaskAction.taskId)}
                          onClick={() =>
                            snoozeTaskMutation.mutate({
                              taskId: task.id,
                              payload: { minutes: 30 },
                            })
                          }
                        >
                          {activeTaskAction.taskId === task.id &&
                          activeTaskAction.action === "snooze_30m"
                            ? "处理中..."
                            : "30 分后"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(activeTaskAction.taskId)}
                          onClick={() =>
                            snoozeTaskMutation.mutate({
                              taskId: task.id,
                              payload: {
                                until: buildTomorrowReminderIso(task),
                              },
                            })
                          }
                        >
                          {activeTaskAction.taskId === task.id &&
                          activeTaskAction.action === "snooze_tomorrow"
                            ? "处理中..."
                            : "明天"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                          disabled={Boolean(activeTaskAction.taskId)}
                          onClick={() => cancelTaskMutation.mutate(task.id)}
                        >
                          {activeTaskAction.taskId === task.id &&
                          activeTaskAction.action === "cancel"
                            ? "处理中..."
                            : "删除"}
                        </Button>
                      </div>
                    }
                  />
                ))
              ) : (
                <AdminEmptyState
                  title="当前没有活跃提醒"
                  description="用户还没有交给小盯新的提醒事项，或者当前活跃提醒已经全部完成 / 删除。"
                />
              )}
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="即将到点"
              actions={
                <StatusPill tone={stats.dueSoonTaskCount > 0 ? "warning" : "muted"}>
                  6 小时内 {stats.dueSoonTaskCount} 条
                </StatusPill>
              }
            />
            <div className="mt-4 space-y-3">
              {overviewQuery.data.upcomingTasks.length ? (
                overviewQuery.data.upcomingTasks.map((task) => (
                  <AdminRecordCard
                    key={task.id}
                    title={task.title}
                    badges={buildTaskBadges(task)}
                    meta={buildTaskMeta(task)}
                    details={buildTaskDetails(task)}
                  />
                ))
              ) : (
                <AdminEmptyState
                  title="接下来没有近期待提醒事项"
                  description="当前没有排在未来 6 小时内的提醒。"
                />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="最近触发与完成" />
            <div className="mt-4 grid gap-4">
              <section className="space-y-3">
                <AdminMetaText>最近触发</AdminMetaText>
                {overviewQuery.data.recentDeliveredTasks.length ? (
                  overviewQuery.data.recentDeliveredTasks.map((task) => (
                    <AdminRecordCard
                      key={task.id}
                      title={task.title}
                      badges={buildTaskBadges(task)}
                      meta={task.lastDeliveredAt ? `触发于 ${formatDateTime(task.lastDeliveredAt)}` : task.scheduleText}
                      details={buildTaskDetails(task)}
                    />
                  ))
                ) : (
                  <AdminEmptyState
                    title="还没有触发记录"
                    description="小盯最近还没有真正发出到点提醒。"
                  />
                )}
              </section>

              <section className="space-y-3">
                <AdminMetaText>最近完成</AdminMetaText>
                {overviewQuery.data.recentCompletedTasks.length ? (
                  overviewQuery.data.recentCompletedTasks.map((task) => (
                    <AdminRecordCard
                      key={task.id}
                      title={task.title}
                      badges={buildTaskBadges(task)}
                      meta={task.lastCompletedAt ? `完成于 ${formatDateTime(task.lastCompletedAt)}` : task.scheduleText}
                      details={buildTaskDetails(task)}
                    />
                  ))
                ) : (
                  <AdminEmptyState
                    title="还没有完成记录"
                    description="用户最近还没有在提醒线程里把事项标记为完成。"
                  />
                )}
              </section>
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="最近私聊出站消息" />
            <div className="mt-4 space-y-3">
              {overviewQuery.data.recentMessages.length ? (
                overviewQuery.data.recentMessages.map((record) => (
                  <MessageRecordCard key={record.id} record={record} />
                ))
              ) : (
                <AdminEmptyState
                  title="还没有提醒消息"
                  description="提醒角色尚未在聊天线程里主动发出新的消息。"
                />
              )}
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="最近朋友圈轻提醒" />
            <div className="mt-4 space-y-3">
              {overviewQuery.data.recentMoments.length ? (
                overviewQuery.data.recentMoments.map((moment) => (
                  <MomentRecordCard key={moment.id} moment={moment} />
                ))
              ) : (
                <AdminEmptyState
                  title="还没有提醒发圈记录"
                  description="小盯近期还没有发出晨间 / 晚间的长期习惯轻提醒朋友圈。"
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
