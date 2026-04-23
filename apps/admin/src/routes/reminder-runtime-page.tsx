import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  runSchedulerJob,
  type SnoozeReminderTaskRequest,
  type ReminderRuntimeMomentRecord,
  type ReminderRuntimeOverview,
  type ReminderTaskRecord,
} from "@yinjie/contracts";
import { Button, Card, ErrorBlock, LoadingBlock, StatusPill, cn } from "@yinjie/ui";
import {
  AdminCallout,
  AdminEmptyState,
  AdminInfoRows,
  AdminMetaText,
  AdminMiniPanel,
  AdminPageHero,
  AdminPillSelectField,
  AdminPillTextField,
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

type ReminderTaskFilter = "all" | "focus" | "hard" | "habit";
type ReminderTaskQueue = "overdue" | "due_soon" | "routine";

type ReminderRuntimeActivityItem = {
  id: string;
  badge: string;
  tone: "healthy" | "warning" | "muted";
  title: string;
  description: string;
  meta?: string;
  timestamp: string;
};

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

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

function truncateText(value: string, maxLength = 96) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trimEnd()}…`;
}

function resolveTaskDueAt(task: ReminderTaskRecord) {
  return task.nextTriggerAt ?? task.dueAt ?? null;
}

function resolveTaskQueue(task: ReminderTaskRecord, now: Date): ReminderTaskQueue {
  const nextTrigger = resolveTaskDueAt(task);
  if (!nextTrigger) {
    return "routine";
  }

  const nextTimestamp = new Date(nextTrigger).getTime();
  if (Number.isNaN(nextTimestamp)) {
    return "routine";
  }

  if (nextTimestamp < now.getTime()) {
    return "overdue";
  }

  const dueSoonCutoff = new Date(now);
  dueSoonCutoff.setHours(dueSoonCutoff.getHours() + 6);
  if (nextTimestamp <= dueSoonCutoff.getTime()) {
    return "due_soon";
  }

  return "routine";
}

function queueTone(queue: ReminderTaskQueue) {
  if (queue === "overdue") {
    return "warning";
  }
  if (queue === "due_soon") {
    return "healthy";
  }
  return "muted";
}

function queueLabel(queue: ReminderTaskQueue) {
  if (queue === "overdue") {
    return "逾期";
  }
  if (queue === "due_soon") {
    return "6 小时内";
  }
  return "常规";
}

function buildTaskStatusSummary(task: ReminderTaskRecord, now: Date) {
  const queue = resolveTaskQueue(task, now);
  const dueAt = resolveTaskDueAt(task);

  if (!dueAt) {
    return "当前没有明确的下一次触发时间，依赖规则重新计算。";
  }

  if (task.snoozedUntil) {
    return `当前已顺延到 ${formatDateTime(task.snoozedUntil)}。`;
  }

  if (queue === "overdue") {
    return `原定 ${formatDateTime(dueAt)} 触发，当前已超过计划时间。`;
  }

  if (queue === "due_soon") {
    return `计划在 ${formatDateTime(dueAt)} 触发，处于未来 6 小时窗口。`;
  }

  return `下一次计划在 ${formatDateTime(dueAt)} 触发。`;
}

function buildTaskOperatorHint(task: ReminderTaskRecord, now: Date) {
  const queue = resolveTaskQueue(task, now);

  if (queue === "overdue") {
    return "先判断用户是否已经处理过；若已处理可直接完成，若仍需提醒可顺延后再观察。";
  }

  if (queue === "due_soon") {
    return "这条提醒快到点了，适合提前确认是否需要顺延，避免与其他提醒扎堆。";
  }

  if (task.kind === "habit") {
    return "习惯类提醒更看重连续性，优先结合最近完成次数判断是否需要调整节奏。";
  }

  return "这条提醒当前不紧急，适合用于回看排程与内容是否合理。";
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

function buildTomorrowReminderIso(task: ReminderTaskRecord) {
  const basisValue = task.nextTriggerAt ?? task.dueAt;
  const basis = basisValue ? new Date(basisValue) : new Date();
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(basis.getHours(), basis.getMinutes(), 0, 0);
  return next.toISOString();
}

function momentTone(
  moment: ReminderRuntimeMomentRecord,
): ReminderRuntimeActivityItem["tone"] {
  return moment.generationKind === "reminder_nudge" ? "healthy" : "muted";
}

function buildTaskFilterCount(
  filter: ReminderTaskFilter,
  overview: ReminderRuntimeOverview,
) {
  if (filter === "focus") {
    return overview.stats.overdueTaskCount + overview.stats.dueSoonTaskCount;
  }
  if (filter === "hard") {
    return overview.stats.hardTaskCount;
  }
  if (filter === "habit") {
    return overview.stats.habitTaskCount;
  }
  return overview.stats.activeTaskCount;
}

function buildOperationsSummary(overview: ReminderRuntimeOverview) {
  const { stats, recentMessages, recentMoments } = overview;

  if (stats.overdueTaskCount > 0) {
    return {
      tone: "warning" as const,
      title: `优先处理 ${stats.overdueTaskCount} 条逾期提醒`,
      description: `当前仍有 ${stats.overdueTaskCount} 条任务已超过计划时间，其中 ${stats.hardTaskCount} 条是硬提醒。建议先切到“优先处理”队列逐条判断是完成、顺延还是继续观察。`,
    };
  }

  if (stats.dueSoonTaskCount > 0) {
    return {
      tone: "info" as const,
      title: `未来 6 小时内有 ${stats.dueSoonTaskCount} 条提醒会到点`,
      description: "当前没有逾期项，但下一波提醒已经接近触发窗口，适合提前检查是否存在扎堆触发或需要顺延的事项。",
    };
  }

  if (stats.activeTaskCount === 0) {
    return {
      tone: "muted" as const,
      title: "当前没有活跃提醒",
      description: "值班侧重点可以转向最近出站内容和规则窗口，确认提醒角色近期是否仍有需要新增的盯办事项。",
    };
  }

  if (!recentMessages.length && !recentMoments.length) {
    return {
      tone: "info" as const,
      title: "提醒队列存在，但今天还没有对外动作",
      description: "可以先看值班工作台里的最近触发时间，必要时执行一次“到点提醒”验证链路是否按预期出站。",
    };
  }

  return {
    tone: "success" as const,
    title: "提醒链路运行稳定",
    description: `当前共有 ${stats.activeTaskCount} 条活跃提醒，今天已触发 ${stats.deliveredTodayCount} 次、完成 ${stats.completedTodayCount} 次，可继续回看最近输出内容和完成节奏。`,
  };
}

function matchesTaskFilter(
  task: ReminderTaskRecord,
  filter: ReminderTaskFilter,
  now: Date,
) {
  if (filter === "hard") {
    return task.priority === "hard";
  }

  if (filter === "habit") {
    return task.kind === "habit";
  }

  if (filter === "focus") {
    const queue = resolveTaskQueue(task, now);
    return queue === "overdue" || queue === "due_soon";
  }

  return true;
}

function matchesTaskSearch(task: ReminderTaskRecord, search: string) {
  if (!search) {
    return true;
  }

  const haystack = normalizeSearchText(
    [task.title, task.detail ?? "", task.category, task.scheduleText].join(" "),
  );
  return haystack.includes(search);
}

function buildRecentActivity(overview: ReminderRuntimeOverview) {
  const items: ReminderRuntimeActivityItem[] = [
    ...overview.recentDeliveredTasks
      .filter((task) => Boolean(task.lastDeliveredAt))
      .map<ReminderRuntimeActivityItem>((task) => ({
        id: `delivered-${task.id}`,
        badge: "触发",
        tone: task.priority === "hard" ? ("warning" as const) : ("muted" as const),
        title: task.title,
        description: task.detail || `已按计划发出提醒，调度为 ${task.scheduleText}。`,
        meta: task.lastDeliveredAt
          ? `任务触发 · ${formatDateTime(task.lastDeliveredAt)}`
          : "任务触发",
        timestamp: task.lastDeliveredAt ?? task.updatedAt,
      })),
    ...overview.recentCompletedTasks
      .filter((task) => Boolean(task.lastCompletedAt))
      .map<ReminderRuntimeActivityItem>((task) => ({
        id: `completed-${task.id}`,
        badge: "完成",
        tone: "healthy",
        title: task.title,
        description: task.detail || `累计已完成 ${task.completionCount} 次。`,
        meta: task.lastCompletedAt
          ? `任务完成 · ${formatDateTime(task.lastCompletedAt)}`
          : "任务完成",
        timestamp: task.lastCompletedAt ?? task.updatedAt,
      })),
    ...overview.recentMessages.map<ReminderRuntimeActivityItem>((record) => ({
      id: `message-${record.id}`,
      badge: "私聊",
      tone: "healthy" as const,
      title: "提醒私聊出站",
      description: truncateText(record.text, 120),
      meta: `会话 ${record.conversationId}`,
      timestamp: record.createdAt,
    })),
    ...overview.recentMoments.map<ReminderRuntimeActivityItem>((moment) => ({
      id: `moment-${moment.id}`,
      badge: "发圈",
      tone: momentTone(moment),
      title: moment.slotLabel || MOMENT_KIND_LABELS[moment.generationKind] || "提醒发圈",
      description: truncateText(moment.text, 120),
      meta: `${moment.likeCount} 赞 · ${moment.commentCount} 评论`,
      timestamp: moment.postedAt,
    })),
  ];

  return items
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 12);
}

function TaskFilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-2 text-sm transition",
        active
          ? "border-amber-300 bg-amber-50 text-amber-800 shadow-[var(--shadow-soft)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-subtle)] hover:text-[color:var(--text-primary)]",
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="ml-2 text-xs opacity-75">{count}</span>
    </button>
  );
}

function TaskQueueListItem({
  task,
  selected,
  now,
  onSelect,
}: {
  task: ReminderTaskRecord;
  selected: boolean;
  now: Date;
  onSelect: () => void;
}) {
  const queue = resolveTaskQueue(task, now);
  const latestAction =
    task.lastCompletedAt != null
      ? `最近完成 ${formatDateTime(task.lastCompletedAt)}`
      : task.lastDeliveredAt != null
        ? `最近触发 ${formatDateTime(task.lastDeliveredAt)}`
        : "还没有触发或完成记录";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-[20px] border p-4 text-left transition",
        selected
          ? "border-amber-300 bg-amber-50/70 shadow-[var(--shadow-soft)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:border-[color:var(--border-subtle)] hover:bg-white/95",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            {task.title}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">{buildTaskBadges(task)}</div>
        </div>
        <StatusPill tone={queueTone(queue)}>{queueLabel(queue)}</StatusPill>
      </div>
      <div className="mt-3 text-xs leading-5 text-[color:var(--text-muted)]">
        {buildTaskMeta(task)}
      </div>
      {task.detail ? (
        <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
          {truncateText(task.detail, 78)}
        </div>
      ) : null}
      <div className="mt-3 rounded-2xl border border-[color:var(--border-faint)] bg-white/70 px-3 py-2 text-xs text-[color:var(--text-secondary)]">
        {latestAction}
      </div>
    </button>
  );
}

function TaskDetailPanel({
  task,
  now,
  activeTaskAction,
  onComplete,
  onSnoozeMinutes,
  onSnoozeTomorrow,
  onCancel,
}: {
  task: ReminderTaskRecord;
  now: Date;
  activeTaskAction: {
    taskId: string | null;
    action: ReminderTaskAction | null;
  };
  onComplete: () => void;
  onSnoozeMinutes: () => void;
  onSnoozeTomorrow: () => void;
  onCancel: () => void;
}) {
  const queue = resolveTaskQueue(task, now);

  return (
    <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-5">
        <div>
          <AdminMetaText>焦点提醒</AdminMetaText>
          <h3 className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">
            {task.title}
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill tone={queueTone(queue)}>{queueLabel(queue)}</StatusPill>
            {buildTaskBadges(task)}
          </div>
        </div>

        <AdminCallout
          tone={queue === "overdue" ? "warning" : queue === "due_soon" ? "info" : "muted"}
          title={buildTaskStatusSummary(task, now)}
          description={buildTaskOperatorHint(task, now)}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <AdminMiniPanel title="下次触发" tone="soft">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {resolveTaskDueAt(task) ? formatDateTime(resolveTaskDueAt(task)) : "待计算"}
            </div>
          </AdminMiniPanel>
          <AdminMiniPanel title="最近触发" tone="soft">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {task.lastDeliveredAt ? formatDateTime(task.lastDeliveredAt) : "暂无"}
            </div>
          </AdminMiniPanel>
          <AdminMiniPanel title="最近完成" tone="soft">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {task.lastCompletedAt ? formatDateTime(task.lastCompletedAt) : "暂无"}
            </div>
          </AdminMiniPanel>
          <AdminMiniPanel title="累计完成" tone="soft">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {task.completionCount} 次
            </div>
          </AdminMiniPanel>
        </div>

        <div className="grid gap-3">
          <AdminSoftBox>调度文案：{task.scheduleText}</AdminSoftBox>
          {task.detail ? <AdminSoftBox>任务说明：{task.detail}</AdminSoftBox> : null}
          {task.snoozedUntil ? (
            <AdminSoftBox>当前顺延到：{formatDateTime(task.snoozedUntil)}</AdminSoftBox>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={Boolean(activeTaskAction.taskId)}
            onClick={onComplete}
          >
            {activeTaskAction.taskId === task.id && activeTaskAction.action === "complete"
              ? "处理中..."
              : "标记完成"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={Boolean(activeTaskAction.taskId)}
            onClick={onSnoozeMinutes}
          >
            {activeTaskAction.taskId === task.id &&
            activeTaskAction.action === "snooze_30m"
              ? "处理中..."
              : "顺延 30 分钟"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={Boolean(activeTaskAction.taskId)}
            onClick={onSnoozeTomorrow}
          >
            {activeTaskAction.taskId === task.id &&
            activeTaskAction.action === "snooze_tomorrow"
              ? "处理中..."
              : "顺到明天"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
            disabled={Boolean(activeTaskAction.taskId)}
            onClick={onCancel}
          >
            {activeTaskAction.taskId === task.id && activeTaskAction.action === "cancel"
              ? "处理中..."
              : "删除提醒"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ReminderRuntimePage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [taskFilter, setTaskFilter] = useState<ReminderTaskFilter>("focus");
  const [taskSearch, setTaskSearch] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const deferredTaskSearch = useDeferredValue(normalizeSearchText(taskSearch));

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
        label: "逾期 / 6 小时内",
        value: `${stats?.overdueTaskCount ?? 0} / ${stats?.dueSoonTaskCount ?? 0}`,
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

  const now = new Date();
  const activeTasks = overviewQuery.data?.activeTasks ?? [];
  const filteredTasks = activeTasks.filter(
    (task) =>
      matchesTaskFilter(task, taskFilter, now) &&
      matchesTaskSearch(task, deferredTaskSearch),
  );
  const selectedTask =
    filteredTasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? null;

  useEffect(() => {
    if (!filteredTasks.length) {
      if (selectedTaskId !== null) {
        setSelectedTaskId(null);
      }
      return;
    }

    if (!filteredTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks[0]?.id ?? null);
    }
  }, [filteredTasks, selectedTaskId]);

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
  const operationsSummary = buildOperationsSummary(overviewQuery.data);
  const taskGroups = [
    {
      key: "overdue" as const,
      label: "逾期",
      description: "已经超过计划时间，优先判断是否要立刻处置。",
      tasks: filteredTasks.filter((task) => resolveTaskQueue(task, now) === "overdue"),
    },
    {
      key: "due_soon" as const,
      label: "6 小时内到点",
      description: "下一波提醒即将触发，适合提前整理。",
      tasks: filteredTasks.filter((task) => resolveTaskQueue(task, now) === "due_soon"),
    },
    {
      key: "routine" as const,
      label: "常规排队",
      description: "暂不紧急，但仍可回看节奏与说明。",
      tasks: filteredTasks.filter((task) => resolveTaskQueue(task, now) === "routine"),
    },
  ].filter((group) => group.tasks.length > 0);
  const recentActivity = buildRecentActivity(overviewQuery.data);

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="提醒运行时"
        title="小盯值班台：先看风险，再处理提醒"
        description="把逾期、即将到点、最近触发与最近输出收敛到同一页，方便运营先判断优先级，再逐条完成、顺延或删除提醒。"
        badges={["承接角色：小盯"]}
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

      <AdminCallout
        title={operationsSummary.title}
        tone={operationsSummary.tone}
        description={operationsSummary.description}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="值班工作台"
              actions={
                <StatusPill tone={filteredTasks.length > 0 ? "healthy" : "muted"}>
                  显示 {filteredTasks.length} / {stats.activeTaskCount} 条
                </StatusPill>
              }
            />
            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-col gap-3 lg:flex-row">
                  <AdminPillTextField
                    value={taskSearch}
                    onChange={setTaskSearch}
                    placeholder="搜提醒标题、说明、分类或调度文案"
                    className="w-full lg:max-w-sm"
                  />
                  <AdminPillSelectField
                    value={taskFilter}
                    onChange={(value) =>
                      setTaskFilter(
                        value === "all" || value === "hard" || value === "habit"
                          ? value
                          : "focus",
                      )
                    }
                    className="w-full lg:w-[180px]"
                  >
                    <option value="focus">优先处理</option>
                    <option value="all">全部任务</option>
                    <option value="hard">只看硬提醒</option>
                    <option value="habit">只看习惯</option>
                  </AdminPillSelectField>
                </div>
                <div className="flex flex-wrap gap-2">
                  <TaskFilterChip
                    label="优先处理"
                    count={buildTaskFilterCount("focus", overviewQuery.data)}
                    active={taskFilter === "focus"}
                    onClick={() => setTaskFilter("focus")}
                  />
                  <TaskFilterChip
                    label="全部"
                    count={buildTaskFilterCount("all", overviewQuery.data)}
                    active={taskFilter === "all"}
                    onClick={() => setTaskFilter("all")}
                  />
                  <TaskFilterChip
                    label="硬提醒"
                    count={buildTaskFilterCount("hard", overviewQuery.data)}
                    active={taskFilter === "hard"}
                    onClick={() => setTaskFilter("hard")}
                  />
                  <TaskFilterChip
                    label="习惯"
                    count={buildTaskFilterCount("habit", overviewQuery.data)}
                    active={taskFilter === "habit"}
                    onClick={() => setTaskFilter("habit")}
                  />
                </div>
              </div>

              {overviewQuery.data.activeTasks.length ? (
                filteredTasks.length ? (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                    <div className="space-y-4">
                      {taskGroups.map((group) => (
                        <section key={group.key} className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                                {group.label}
                              </div>
                              <div className="text-xs leading-5 text-[color:var(--text-muted)]">
                                {group.description}
                              </div>
                            </div>
                            <StatusPill tone={queueTone(group.key)}>
                              {group.tasks.length} 条
                            </StatusPill>
                          </div>
                          <div className="space-y-3">
                            {group.tasks.map((task) => (
                              <TaskQueueListItem
                                key={task.id}
                                task={task}
                                now={now}
                                selected={selectedTask?.id === task.id}
                                onSelect={() => setSelectedTaskId(task.id)}
                              />
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>

                    {selectedTask ? (
                      <TaskDetailPanel
                        task={selectedTask}
                        now={now}
                        activeTaskAction={activeTaskAction}
                        onComplete={() => completeTaskMutation.mutate(selectedTask.id)}
                        onSnoozeMinutes={() =>
                          snoozeTaskMutation.mutate({
                            taskId: selectedTask.id,
                            payload: { minutes: 30 },
                          })
                        }
                        onSnoozeTomorrow={() =>
                          snoozeTaskMutation.mutate({
                            taskId: selectedTask.id,
                            payload: { until: buildTomorrowReminderIso(selectedTask) },
                          })
                        }
                        onCancel={() => cancelTaskMutation.mutate(selectedTask.id)}
                      />
                    ) : (
                      <AdminEmptyState
                        title="当前筛选下没有焦点提醒"
                        description="调整左侧筛选条件后，这里会展示一条可直接处理的焦点提醒。"
                      />
                    )}
                  </div>
                ) : (
                  <AdminEmptyState
                    title="没有匹配的提醒"
                    description="当前筛选和搜索条件下没有结果，建议清空关键字或切换到“全部任务”继续查看。"
                  />
                )
              ) : (
                <AdminEmptyState
                  title="当前没有活跃提醒"
                  description="用户还没有交给小盯新的提醒事项，或者当前活跃提醒已经全部完成 / 删除。"
                />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="值班摘要" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <AdminMiniPanel title="当前风险" tone="soft">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {stats.overdueTaskCount > 0
                    ? `${stats.overdueTaskCount} 条逾期`
                    : stats.dueSoonTaskCount > 0
                      ? `${stats.dueSoonTaskCount} 条即将到点`
                      : stats.activeTaskCount > 0
                        ? "队列稳定"
                        : "暂无活跃提醒"}
                </div>
              </AdminMiniPanel>
              <AdminMiniPanel title="最近私聊出站" tone="soft">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {overviewQuery.data.recentMessages[0]
                    ? formatDateTime(overviewQuery.data.recentMessages[0].createdAt)
                    : "暂无"}
                </div>
              </AdminMiniPanel>
              <AdminMiniPanel title="最近完成" tone="soft">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {overviewQuery.data.recentCompletedTasks[0]?.lastCompletedAt
                    ? formatDateTime(overviewQuery.data.recentCompletedTasks[0].lastCompletedAt)
                    : "暂无"}
                </div>
              </AdminMiniPanel>
              <AdminMiniPanel title="最近轻提醒发圈" tone="soft">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {overviewQuery.data.recentMoments[0]
                    ? formatDateTime(overviewQuery.data.recentMoments[0].postedAt)
                    : "暂无"}
                </div>
              </AdminMiniPanel>
            </div>
            <div className="mt-4 space-y-3">
              {overviewQuery.data.recentMessages[0] ? (
                <AdminSoftBox>
                  最新私聊：{truncateText(overviewQuery.data.recentMessages[0].text, 90)}
                </AdminSoftBox>
              ) : null}
              {overviewQuery.data.recentMoments[0] ? (
                <AdminSoftBox>
                  最新发圈：{truncateText(overviewQuery.data.recentMoments[0].text, 90)}
                </AdminSoftBox>
              ) : null}
            </div>
          </Card>

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
              title="最近执行流水"
              actions={
                <StatusPill tone={recentActivity.length > 0 ? "healthy" : "muted"}>
                  {recentActivity.length} 条
                </StatusPill>
              }
            />
            <div className="mt-4 space-y-3">
              {recentActivity.length ? (
                recentActivity.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[color:var(--text-primary)]">
                          {item.title}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {item.meta || formatDateTime(item.timestamp)}
                        </div>
                      </div>
                      <StatusPill tone={item.tone}>{item.badge}</StatusPill>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                      {item.description}
                    </div>
                  </div>
                ))
              ) : (
                <AdminEmptyState
                  title="还没有最近动作"
                  description="这里会汇总最近触发、完成、私聊出站和朋友圈轻提醒，方便运营快速回看刚刚发生了什么。"
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
