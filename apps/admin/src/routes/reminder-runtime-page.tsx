import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  runSchedulerJob,
  type SnoozeReminderTaskRequest,
  type ReminderRuntimeMomentRecord,
  type ReminderRuntimeOverview,
  type ReminderRuntimePreviewResult,
  type ReminderRuntimeRules,
  type ReminderTaskRecord,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  StatusPill,
  cn,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminCodeBlock,
  AdminDraftStatusPill,
  AdminEmptyState,
  AdminMetaText,
  AdminMiniPanel,
  AdminPageHero,
  AdminPillTextField,
  AdminSectionHeader,
  AdminSoftBox,
  AdminTabs,
  AdminTextArea,
  AdminTextField,
  AdminValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { formatAdminDateTime as formatLocalizedDateTime } from "../lib/format";

type ReminderSchedulerJob =
  | "trigger_due_reminder_tasks"
  | "trigger_reminder_checkins"
  | "check_moment_schedule";

const TASK_KIND_LABELS: Record<string, ReturnType<typeof msg>> = {
  one_time: msg`单次`,
  recurring: msg`重复`,
  habit: msg`习惯`,
};

const TASK_CATEGORY_LABELS: Record<string, ReturnType<typeof msg>> = {
  general: msg`通用`,
  growth: msg`成长`,
  lifestyle: msg`生活`,
  health: msg`健康`,
  shopping: msg`采购`,
};

const MOMENT_KIND_LABELS: Record<string, ReturnType<typeof msg>> = {
  reminder_nudge: msg`定时轻提醒`,
  routine_ai: msg`普通发圈`,
  reality_linked_ai: msg`现实联动`,
};

const JOB_SUCCESS_NOTICES: Record<ReminderSchedulerJob, ReturnType<typeof msg>> = {
  trigger_due_reminder_tasks: msg`到点提醒调度已执行。`,
  trigger_reminder_checkins: msg`提醒问询调度已执行。`,
  check_moment_schedule: msg`提醒发圈窗口已执行。`,
};

type ReminderTaskAction =
  | "complete"
  | "snooze_30m"
  | "snooze_tomorrow"
  | "cancel";

type ReminderTaskFilter = "all" | "focus" | "hard" | "habit";
type ReminderTaskQueue = "overdue" | "due_soon" | "routine";
type ReminderConfigTab = "schedule" | "messages" | "moments" | "parser";
type ReminderParserArrayFieldKey =
  | "helpIntentPatterns"
  | "listIntentPatterns"
  | "cancelIntentPatterns"
  | "updateIntentPatterns"
  | "completeIntentPatterns"
  | "snoozeIntentPatterns"
  | "createIntentKeywords"
  | "dailyRecurrenceKeywords"
  | "weeklyRecurrenceKeywords"
  | "habitIntentKeywords"
  | "habitKeywords"
  | "hardReminderKeywords";
type ReminderParserCategoryKey =
  keyof ReminderRuntimeRules["parserRules"]["categoryKeywords"];
type ReminderParserPeriodKey =
  keyof ReminderRuntimeRules["parserRules"]["periodDefaultClocks"];

type ReminderRuntimeActivityItem = {
  id: string;
  badge: string;
  tone: "healthy" | "warning" | "muted";
  title: string;
  description: string;
  meta?: string;
  timestamp: string;
};

type ReminderNumberFieldKey =
  | "defaultReminderHour"
  | "defaultReminderMinute"
  | "habitDefaultHour"
  | "habitDefaultMinute"
  | "checkinMinIntervalHours"
  | "maxListItems";

const PARSER_PERIOD_FIELDS: Array<{
  key: ReminderParserPeriodKey;
  label: ReturnType<typeof msg>;
  description: ReturnType<typeof msg>;
}> = [
  {
    key: "sleepBefore",
    label: msg`睡前`,
    description: msg`兜住"睡前记得..."这类表达。`,
  },
  {
    key: "morning",
    label: msg`早上 / 明早`,
    description: msg`用于晨间默认时间，同时承接"今早 / 明早"。`,
  },
  {
    key: "lateMorning",
    label: msg`上午`,
    description: msg`上午但没写具体点数时，会默认落到这里。`,
  },
  {
    key: "noon",
    label: msg`中午`,
    description: msg`显式"中午"但没写分秒时，按这里落点。`,
  },
  {
    key: "afternoon",
    label: msg`下午`,
    description: msg`显式"下午"但没写具体时间时，按这里落点。`,
  },
  {
    key: "dusk",
    label: msg`傍晚`,
    description: msg`适合饭点前后的柔性提醒。`,
  },
  {
    key: "evening",
    label: msg`晚上 / 今晚 / 明晚`,
    description: msg`晚间默认时间，同时承接"今晚 / 明晚"。`,
  },
];

// i18n-ignore-start: sample demo data for reminder parser preview
const PARSER_PREVIEW_EXAMPLES: Array<{ label: ReturnType<typeof msg>; message: string }> = [
  {
    label: msg`单次提醒`,
    message: "明早8点提醒我吃药",
  },
  {
    label: msg`每周提醒`,
    message: "每周五晚上提醒我买猫粮",
  },
  {
    label: msg`习惯提醒`,
    message: "提醒我坚持学英语",
  },
  {
    label: msg`模型兜底`,
    message: "我明天得去复诊，别忘了",
  },
  {
    label: msg`完成提醒`,
    message: "买猫粮已经搞定了",
  },
];
// i18n-ignore-end

const PREVIEW_ACTION_LABELS: Record<string, ReturnType<typeof msg>> = {
  help: msg`帮助`,
  list: msg`列表`,
  cancel: msg`删除`,
  update: msg`修改`,
  complete: msg`完成`,
  snooze: msg`顺延`,
  create: msg`创建`,
  unhandled: msg`未命中`,
};

const PREVIEW_SOURCE_LABELS: Record<string, ReturnType<typeof msg>> = {
  rules: msg`规则命中`,
  llm_fallback: msg`模型兜底`,
  none: msg`未命中`,
};

function formatDateTime(value?: string | null) {
  return formatLocalizedDateTime(
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

function formatCheckinHours(hours: number[]) {
  const t = translateRuntimeMessage;
  if (!hours.length) {
    return t(msg`未配置`);
  }

  return hours.map((hour) => `${String(hour).padStart(2, "0")}:00`).join(" / ");
}

function formatCheckinHoursInput(hours: number[]) {
  return hours.join(", ");
}

function formatLineList(values: string[]) {
  return values.join("\n");
}

function parseCheckinHoursInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,，/]+/)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 23),
    ),
  )
    .sort((left, right) => left - right)
    .slice(0, 6);
}

function parseLineList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
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

function serializeRules(value: ReminderRuntimeRules | null) {
  return JSON.stringify(value ?? null);
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function resolveTaskDueAt(task: ReminderTaskRecord) {
  return task.nextTriggerAt ?? task.dueAt ?? null;
}

function resolveTaskQueue(
  task: ReminderTaskRecord,
  now: Date,
): ReminderTaskQueue {
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
  const t = translateRuntimeMessage;
  if (queue === "overdue") {
    return t(msg`逾期`);
  }
  if (queue === "due_soon") {
    return t(msg`6 小时内`);
  }
  return t(msg`常规`);
}

function buildTaskStatusSummary(task: ReminderTaskRecord, now: Date) {
  const t = translateRuntimeMessage;
  const queue = resolveTaskQueue(task, now);
  const dueAt = resolveTaskDueAt(task);

  if (!dueAt) {
    return t(msg`当前没有明确的下一次触发时间，依赖规则重新计算。`);
  }

  if (task.snoozedUntil) {
    return t(msg`当前已顺延到 ${formatDateTime(task.snoozedUntil)}。`);
  }

  if (queue === "overdue") {
    return t(msg`原定 ${formatDateTime(dueAt)} 触发，当前已超过计划时间。`);
  }

  if (queue === "due_soon") {
    return t(msg`计划在 ${formatDateTime(dueAt)} 触发，处于未来 6 小时窗口。`);
  }

  return t(msg`下一次计划在 ${formatDateTime(dueAt)} 触发。`);
}

function buildTaskOperatorHint(task: ReminderTaskRecord, now: Date) {
  const t = translateRuntimeMessage;
  const queue = resolveTaskQueue(task, now);

  if (queue === "overdue") {
    return t(msg`先判断用户是否已经处理过；若已处理可直接完成，若仍需提醒可顺延后再观察。`);
  }

  if (queue === "due_soon") {
    return t(msg`这条提醒快到点了，适合提前确认是否需要顺延，避免与其他提醒扎堆。`);
  }

  if (task.kind === "habit") {
    return t(msg`习惯类提醒更看重连续性，优先结合最近完成次数判断是否需要调整节奏。`);
  }

  return t(msg`这条提醒当前不紧急，适合用于回看排程与内容是否合理。`);
}

function buildTaskBadges(task: ReminderTaskRecord) {
  const t = translateRuntimeMessage;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill tone={taskTone(task)}>
        {task.priority === "hard" ? t(msg`硬提醒`) : t(msg`轻提醒`)}
      </StatusPill>
      <StatusPill tone={task.kind === "habit" ? "healthy" : "muted"}>
        {t(TASK_KIND_LABELS[task.kind] ?? msg`${task.kind}`)}
      </StatusPill>
      <StatusPill tone="muted">
        {t(TASK_CATEGORY_LABELS[task.category] ?? msg`${task.category}`)}
      </StatusPill>
    </div>
  );
}

function buildTaskMeta(task: ReminderTaskRecord) {
  const t = translateRuntimeMessage;
  const parts = [task.scheduleText];
  if (task.nextTriggerAt) {
    parts.push(t(msg`下次 ${formatDateTime(task.nextTriggerAt)}`));
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
  const t = translateRuntimeMessage;
  const items: ReminderRuntimeActivityItem[] = [
    ...overview.recentDeliveredTasks
      .filter((task) => Boolean(task.lastDeliveredAt))
      .map<ReminderRuntimeActivityItem>((task) => ({
        id: `delivered-${task.id}`,
        badge: t(msg`触发`),
        tone:
          task.priority === "hard" ? ("warning" as const) : ("muted" as const),
        title: task.title,
        description:
          task.detail || t(msg`已按计划发出提醒，调度为 ${task.scheduleText}。`),
        meta: task.lastDeliveredAt
          ? t(msg`任务触发 · ${formatDateTime(task.lastDeliveredAt)}`)
          : t(msg`任务触发`),
        timestamp: task.lastDeliveredAt ?? task.updatedAt,
      })),
    ...overview.recentCompletedTasks
      .filter((task) => Boolean(task.lastCompletedAt))
      .map<ReminderRuntimeActivityItem>((task) => ({
        id: `completed-${task.id}`,
        badge: t(msg`完成`),
        tone: "healthy",
        title: task.title,
        description: task.detail || t(msg`累计已完成 ${task.completionCount} 次。`),
        meta: task.lastCompletedAt
          ? t(msg`任务完成 · ${formatDateTime(task.lastCompletedAt)}`)
          : t(msg`任务完成`),
        timestamp: task.lastCompletedAt ?? task.updatedAt,
      })),
    ...overview.recentMessages.map<ReminderRuntimeActivityItem>((record) => ({
      id: `message-${record.id}`,
      badge: t(msg`私聊`),
      tone: "healthy" as const,
      title: t(msg`提醒私聊出站`),
      description: truncateText(record.text, 120),
      meta: t(msg`会话 ${record.conversationId}`),
      timestamp: record.createdAt,
    })),
    ...overview.recentMoments.map<ReminderRuntimeActivityItem>((moment) => ({
      id: `moment-${moment.id}`,
      badge: t(msg`发圈`),
      tone: momentTone(moment),
      title:
        moment.slotLabel ||
        t(MOMENT_KIND_LABELS[moment.generationKind] ?? msg`提醒发圈`),
      description: truncateText(moment.text, 120),
      meta: t(msg`${moment.likeCount} 赞 · ${moment.commentCount} 评论`),
      timestamp: moment.postedAt,
    })),
  ];

  return items
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() -
        new Date(left.timestamp).getTime(),
    )
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
  onComplete,
  onSnoozeMinutes,
  onCancel,
  activeTaskAction,
}: {
  task: ReminderTaskRecord;
  selected: boolean;
  now: Date;
  onSelect: () => void;
  onComplete: () => void;
  onSnoozeMinutes: () => void;
  onCancel: () => void;
  activeTaskAction: {
    taskId: string | null;
    action: ReminderTaskAction | null;
  };
}) {
  const t = translateRuntimeMessage;
  const queue = resolveTaskQueue(task, now);
  const latestAction =
    task.lastCompletedAt != null
      ? t(msg`最近完成 ${formatDateTime(task.lastCompletedAt)}`)
      : task.lastDeliveredAt != null
        ? t(msg`最近触发 ${formatDateTime(task.lastDeliveredAt)}`)
        : t(msg`还没有触发或完成记录`);
  const actionBusy = Boolean(activeTaskAction.taskId);
  const thisRowAction =
    activeTaskAction.taskId === task.id ? activeTaskAction.action : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          // 焦点在内嵌 <button> 上时不要把 Enter/Space 当作"选中该行"，
          // 否则点完成/顺延/删除的同时还会顺手把行选中并刷新右侧详情面板。
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "w-full cursor-pointer rounded-[20px] border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
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
          <div className="mt-2 flex flex-wrap gap-2">
            {buildTaskBadges(task)}
          </div>
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
      <div
        className="mt-3 flex flex-wrap gap-2"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="primary"
          size="sm"
          disabled={actionBusy}
          onClick={onComplete}
        >
          {thisRowAction === "complete" ? t(msg`处理中...`) : t(msg`完成`)}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={actionBusy}
          onClick={onSnoozeMinutes}
        >
          {thisRowAction === "snooze_30m"
            ? t(msg`处理中...`)
            : t(msg`顺延 30 分钟`)}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          disabled={actionBusy}
          onClick={onCancel}
        >
          {thisRowAction === "cancel" ? t(msg`处理中...`) : t(msg`删除`)}
        </Button>
      </div>
    </div>
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
  const t = translateRuntimeMessage;
  const queue = resolveTaskQueue(task, now);

  return (
    <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-5">
        <div>
          <AdminMetaText>{t(msg`焦点提醒`)}</AdminMetaText>
          <h3 className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">
            {task.title}
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill tone={queueTone(queue)}>{queueLabel(queue)}</StatusPill>
            {buildTaskBadges(task)}
          </div>
        </div>

        <AdminCallout
          tone={
            queue === "overdue"
              ? "warning"
              : queue === "due_soon"
                ? "info"
                : "muted"
          }
          title={buildTaskStatusSummary(task, now)}
          description={buildTaskOperatorHint(task, now)}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <AdminMiniPanel title={t(msg`下次触发`)} tone="soft">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {resolveTaskDueAt(task)
                ? formatDateTime(resolveTaskDueAt(task))
                : t(msg`待计算`)}
            </div>
          </AdminMiniPanel>
          <AdminMiniPanel title={t(msg`最近触发`)} tone="soft">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {task.lastDeliveredAt
                ? formatDateTime(task.lastDeliveredAt)
                : t(msg`暂无`)}
            </div>
          </AdminMiniPanel>
          <AdminMiniPanel title={t(msg`最近完成`)} tone="soft">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {task.lastCompletedAt
                ? formatDateTime(task.lastCompletedAt)
                : t(msg`暂无`)}
            </div>
          </AdminMiniPanel>
          <AdminMiniPanel title={t(msg`累计完成`)} tone="soft">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`${task.completionCount} 次`)}
            </div>
          </AdminMiniPanel>
        </div>

        <div className="grid gap-3">
          <AdminSoftBox>{t(msg`调度文案：${task.scheduleText}`)}</AdminSoftBox>
          {task.detail ? (
            <AdminSoftBox>{t(msg`任务说明：${task.detail}`)}</AdminSoftBox>
          ) : null}
          {task.snoozedUntil ? (
            <AdminSoftBox>
              {t(msg`当前顺延到：${formatDateTime(task.snoozedUntil)}`)}
            </AdminSoftBox>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={Boolean(activeTaskAction.taskId)}
            onClick={onComplete}
          >
            {activeTaskAction.taskId === task.id &&
            activeTaskAction.action === "complete"
              ? t(msg`处理中...`)
              : t(msg`标记完成`)}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={Boolean(activeTaskAction.taskId)}
            onClick={onSnoozeMinutes}
          >
            {activeTaskAction.taskId === task.id &&
            activeTaskAction.action === "snooze_30m"
              ? t(msg`处理中...`)
              : t(msg`顺延 30 分钟`)}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={Boolean(activeTaskAction.taskId)}
            onClick={onSnoozeTomorrow}
          >
            {activeTaskAction.taskId === task.id &&
            activeTaskAction.action === "snooze_tomorrow"
              ? t(msg`处理中...`)
              : t(msg`顺到明天`)}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
            disabled={Boolean(activeTaskAction.taskId)}
            onClick={onCancel}
          >
            {activeTaskAction.taskId === task.id &&
            activeTaskAction.action === "cancel"
              ? t(msg`处理中...`)
              : t(msg`删除提醒`)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReminderRuntimeConfigPanel({
  draft,
  dirty,
  activeTab,
  onTabChange,
  onChange,
  onSave,
  savePending,
  previewInput,
  onPreviewInputChange,
  onRunPreview,
  previewPending,
  previewResult,
  previewError,
}: {
  draft: ReminderRuntimeRules;
  dirty: boolean;
  activeTab: ReminderConfigTab;
  onTabChange: (tab: ReminderConfigTab) => void;
  onChange: (value: ReminderRuntimeRules) => void;
  onSave: () => void;
  savePending: boolean;
  previewInput: string;
  onPreviewInputChange: (value: string) => void;
  onRunPreview: () => void;
  previewPending: boolean;
  previewResult: ReminderRuntimePreviewResult | null;
  previewError: Error | null;
}) {
  const t = translateRuntimeMessage;
  const updateNumberField = (key: ReminderNumberFieldKey, value: number) => {
    onChange({
      ...draft,
      [key]: value,
    });
  };

  const updateTextTemplate = (
    key: keyof ReminderRuntimeRules["textTemplates"],
    value: string,
  ) => {
    onChange({
      ...draft,
      textTemplates: {
        ...draft.textTemplates,
        [key]: value,
      },
    });
  };

  const updatePromptTemplate = (
    key: keyof ReminderRuntimeRules["promptTemplates"],
    value: string,
  ) => {
    onChange({
      ...draft,
      promptTemplates: {
        ...draft.promptTemplates,
        [key]: value,
      },
    });
  };

  const updateParserMode = (
    value: ReminderRuntimeRules["parserRules"]["parserMode"],
  ) => {
    onChange({
      ...draft,
      parserRules: {
        ...draft.parserRules,
        parserMode: value,
      },
    });
  };

  const updateParserArrayField = (
    key: ReminderParserArrayFieldKey,
    value: string,
  ) => {
    onChange({
      ...draft,
      parserRules: {
        ...draft.parserRules,
        [key]: parseLineList(value),
      },
    });
  };

  const updateParserPrompt = (value: string) => {
    onChange({
      ...draft,
      parserRules: {
        ...draft.parserRules,
        llmFallbackPrompt: value,
      },
    });
  };

  const updateParserCategoryKeywords = (
    key: ReminderParserCategoryKey,
    value: string,
  ) => {
    onChange({
      ...draft,
      parserRules: {
        ...draft.parserRules,
        categoryKeywords: {
          ...draft.parserRules.categoryKeywords,
          [key]: parseLineList(value),
        },
      },
    });
  };

  const updateParserPeriodPatterns = (
    key: ReminderParserPeriodKey,
    value: string,
  ) => {
    onChange({
      ...draft,
      parserRules: {
        ...draft.parserRules,
        periodDefaultClocks: {
          ...draft.parserRules.periodDefaultClocks,
          [key]: {
            ...draft.parserRules.periodDefaultClocks[key],
            patterns: parseLineList(value),
          },
        },
      },
    });
  };

  const updateParserPeriodTime = (
    key: ReminderParserPeriodKey,
    field: "hour" | "minute",
    value: number,
  ) => {
    onChange({
      ...draft,
      parserRules: {
        ...draft.parserRules,
        periodDefaultClocks: {
          ...draft.parserRules.periodDefaultClocks,
          [key]: {
            ...draft.parserRules.periodDefaultClocks[key],
            [field]: value,
          },
        },
      },
    });
  };

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`规则与提示模板`)}
        actions={<AdminDraftStatusPill ready dirty={dirty} />}
      />
      <div className="mt-4 space-y-4">
        <AdminTabs
          tabs={[
            { key: "schedule", label: t(msg`调度规则`) },
            { key: "messages", label: t(msg`用户文案`) },
            { key: "moments", label: t(msg`发圈模板`) },
            { key: "parser", label: t(msg`解析规则`) },
          ]}
          activeKey={activeTab}
          onChange={(value) => onTabChange(value as ReminderConfigTab)}
        />

        {activeTab === "schedule" ? (
          <div className="space-y-4">
            <ConfigGroup
              title={t(msg`默认触发时间`)}
              description={t(msg`影响未显式指定时间时的默认落点。单次/重复提醒和习惯提醒分开配置。`)}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <NumberField
                  label={t(msg`默认单次提醒小时`)}
                  value={draft.defaultReminderHour}
                  min={0}
                  max={23}
                  onChange={(value) =>
                    updateNumberField("defaultReminderHour", value)
                  }
                />
                <NumberField
                  label={t(msg`默认单次提醒分钟`)}
                  value={draft.defaultReminderMinute}
                  min={0}
                  max={59}
                  onChange={(value) =>
                    updateNumberField("defaultReminderMinute", value)
                  }
                />
                <NumberField
                  label={t(msg`习惯提醒默认小时`)}
                  value={draft.habitDefaultHour}
                  min={0}
                  max={23}
                  onChange={(value) =>
                    updateNumberField("habitDefaultHour", value)
                  }
                />
                <NumberField
                  label={t(msg`习惯提醒默认分钟`)}
                  value={draft.habitDefaultMinute}
                  min={0}
                  max={59}
                  onChange={(value) =>
                    updateNumberField("habitDefaultMinute", value)
                  }
                />
              </div>
            </ConfigGroup>

            <ConfigGroup
              title={t(msg`问询节奏`)}
              description={t(msg`控制小盯主动问一句的时间窗口，以及一次列表展示的上限。`)}
            >
              <div className="space-y-4">
                <div>
                  <AdminTextField
                    label={t(msg`问询小时点`)}
                    value={formatCheckinHoursInput(draft.checkinHours)}
                    onChange={(value) =>
                      onChange({
                        ...draft,
                        checkinHours: parseCheckinHoursInput(value),
                      })
                    }
                  />
                  <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
                    {t(msg`用逗号分隔 0-23 的小时值，例如 \`9, 13, 21\`。`)}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <NumberField
                    label={t(msg`最小问询间隔（小时）`)}
                    value={draft.checkinMinIntervalHours}
                    min={1}
                    max={72}
                    onChange={(value) =>
                      updateNumberField("checkinMinIntervalHours", value)
                    }
                  />
                  <NumberField
                    label={t(msg`聊天列表最大项数`)}
                    value={draft.maxListItems}
                    min={1}
                    max={20}
                    onChange={(value) =>
                      updateNumberField("maxListItems", value)
                    }
                  />
                </div>
                <AdminSoftBox className="text-xs leading-5">
                  {t(msg`当前问询窗口：${formatCheckinHours(draft.checkinHours)}。`)}
                </AdminSoftBox>
              </div>
            </ConfigGroup>
          </div>
        ) : null}

        {activeTab === "messages" ? (
          <div className="space-y-4">
            <ConfigGroup
              title={t(msg`入口与列表文案`)}
              description={t(msg`决定用户问"你能做什么""我有哪些提醒"时，小盯如何回应。支持占位符：\`{{index}}\`、\`{{title}}\`、\`{{scheduleText}}\`。`)}
            >
              <div className="space-y-4">
                <AdminTextArea
                  label={t(msg`帮助文案`)}
                  value={draft.textTemplates.helpMessage}
                  onChange={(value) => updateTextTemplate("helpMessage", value)}
                  textareaClassName="min-h-24"
                />
                <div className="grid gap-4">
                  <AdminTextField
                    label={t(msg`空列表文案`)}
                    value={draft.textTemplates.taskListEmpty}
                    onChange={(value) =>
                      updateTextTemplate("taskListEmpty", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`列表头文案`)}
                    value={draft.textTemplates.taskListHeader}
                    onChange={(value) =>
                      updateTextTemplate("taskListHeader", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`列表项模板`)}
                    value={draft.textTemplates.taskListItem}
                    onChange={(value) =>
                      updateTextTemplate("taskListItem", value)
                    }
                  />
                </div>
              </div>
            </ConfigGroup>

            <ConfigGroup
              title={t(msg`任务处置文案`)}
              description={t(msg`用于删除、顺延、完成和创建提醒时的回执。支持占位符：\`{{title}}\`、\`{{untilLabel}}\`、\`{{scheduleText}}\`、\`{{time}}\`、\`{{weekdayLabel}}\`、\`{{dateTimeLabel}}\`。`)}
            >
              <div className="space-y-4">
                <div className="grid gap-4">
                  <AdminTextField
                    label={t(msg`删除失败文案`)}
                    value={draft.textTemplates.taskCancelMissing}
                    onChange={(value) =>
                      updateTextTemplate("taskCancelMissing", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`删除成功文案`)}
                    value={draft.textTemplates.taskCancelSuccess}
                    onChange={(value) =>
                      updateTextTemplate("taskCancelSuccess", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`顺延失败文案`)}
                    value={draft.textTemplates.taskSnoozeMissing}
                    onChange={(value) =>
                      updateTextTemplate("taskSnoozeMissing", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`顺延成功文案`)}
                    value={draft.textTemplates.taskSnoozeSuccess}
                    onChange={(value) =>
                      updateTextTemplate("taskSnoozeSuccess", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`完成失败文案`)}
                    value={draft.textTemplates.taskCompleteMissing}
                    onChange={(value) =>
                      updateTextTemplate("taskCompleteMissing", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`单次完成文案`)}
                    value={draft.textTemplates.taskCompleteOneTimeSuccess}
                    onChange={(value) =>
                      updateTextTemplate("taskCompleteOneTimeSuccess", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`重复完成文案`)}
                    value={draft.textTemplates.taskCompleteRecurringSuccess}
                    onChange={(value) =>
                      updateTextTemplate("taskCompleteRecurringSuccess", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`缺少事项文案`)}
                    value={draft.textTemplates.taskCreateMissingTitle}
                    onChange={(value) =>
                      updateTextTemplate("taskCreateMissingTitle", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`缺少时间文案`)}
                    value={draft.textTemplates.taskCreateMissingTime}
                    onChange={(value) =>
                      updateTextTemplate("taskCreateMissingTime", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`习惯创建文案`)}
                    value={draft.textTemplates.taskCreateHabitSuccess}
                    onChange={(value) =>
                      updateTextTemplate("taskCreateHabitSuccess", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`每天创建文案`)}
                    value={draft.textTemplates.taskCreateDailySuccess}
                    onChange={(value) =>
                      updateTextTemplate("taskCreateDailySuccess", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`每周创建文案`)}
                    value={draft.textTemplates.taskCreateWeeklySuccess}
                    onChange={(value) =>
                      updateTextTemplate("taskCreateWeeklySuccess", value)
                    }
                  />
                  <AdminTextField
                    label={t(msg`单次创建文案`)}
                    value={draft.textTemplates.taskCreateOneTimeSuccess}
                    onChange={(value) =>
                      updateTextTemplate("taskCreateOneTimeSuccess", value)
                    }
                  />
                </div>
              </div>
            </ConfigGroup>

            <ConfigGroup
              title={t(msg`主动提醒与问询文案`)}
              description={t(msg`影响真正发出的到点提醒和空闲时的小问询。支持占位符：\`{{title}}\`、\`{{activeCount}}\`。`)}
            >
              <div className="grid gap-4">
                <AdminTextField
                  label={t(msg`硬提醒文案`)}
                  value={draft.textTemplates.dueReminderHard}
                  onChange={(value) =>
                    updateTextTemplate("dueReminderHard", value)
                  }
                />
                <AdminTextField
                  label={t(msg`习惯提醒文案`)}
                  value={draft.textTemplates.dueReminderHabit}
                  onChange={(value) =>
                    updateTextTemplate("dueReminderHabit", value)
                  }
                />
                <AdminTextField
                  label={t(msg`普通提醒文案`)}
                  value={draft.textTemplates.dueReminderDefault}
                  onChange={(value) =>
                    updateTextTemplate("dueReminderDefault", value)
                  }
                />
                <AdminTextField
                  label={t(msg`有活跃任务时问询`)}
                  value={draft.textTemplates.checkinWithActiveTasks}
                  onChange={(value) =>
                    updateTextTemplate("checkinWithActiveTasks", value)
                  }
                />
                <AdminTextField
                  label={t(msg`无活跃任务时问询`)}
                  value={draft.textTemplates.checkinWithoutActiveTasks}
                  onChange={(value) =>
                    updateTextTemplate("checkinWithoutActiveTasks", value)
                  }
                />
              </div>
            </ConfigGroup>
          </div>
        ) : null}

        {activeTab === "moments" ? (
          <div className="space-y-4">
            <AdminCallout
              title={t(msg`发圈模板按"每行一条候选"生效`)}
              tone="info"
              description={t(msg`支持占位符：\`{{focus}}\`、\`{{title}}\`、\`{{category}}\`、\`{{scheduleText}}\`、\`{{completionCount}}\`、\`{{companionLine}}\`。同一时段会按种子稳定挑选其中一条。`)}
            />
            <ConfigGroup
              title={t(msg`轻提醒发圈模板`)}
              description={t(msg`把晨间、晚间和通用窗口拆开调，方便运营按语气分别收敛。`)}
            >
              <div className="space-y-4">
                <AdminTextArea
                  label={t(msg`晨间模板`)}
                  value={draft.promptTemplates.momentNudgeMorningTemplates}
                  onChange={(value) =>
                    updatePromptTemplate("momentNudgeMorningTemplates", value)
                  }
                  textareaClassName="min-h-32"
                />
                <AdminTextArea
                  label={t(msg`晚间模板`)}
                  value={draft.promptTemplates.momentNudgeEveningTemplates}
                  onChange={(value) =>
                    updatePromptTemplate("momentNudgeEveningTemplates", value)
                  }
                  textareaClassName="min-h-32"
                />
                <AdminTextArea
                  label={t(msg`通用模板`)}
                  value={draft.promptTemplates.momentNudgeGeneralTemplates}
                  onChange={(value) =>
                    updatePromptTemplate("momentNudgeGeneralTemplates", value)
                  }
                  textareaClassName="min-h-32"
                />
              </div>
            </ConfigGroup>
          </div>
        ) : null}

        {activeTab === "parser" ? (
          <div className="space-y-4">
            <AdminCallout
              title={t(msg`这里改的是"用户原话如何进提醒链"`)}
              tone="info"
              description={t(msg`帮助 / 列表 / 删除 / 完成 / 顺延按上到下顺序判断；只有前面都没命中，才会进入"创建提醒"解析。当前支持"纯规则"与"规则优先 + 模型兜底"两种模式。`)}
            />

            <ConfigGroup
              title={t(msg`解析模式`)}
              description={t(msg`建议默认走"规则优先 + 模型兜底"。模型不会直接写库，只会先把原话改写成标准提醒口令，再交回规则引擎处理。`)}
            >
              <div className="space-y-4">
                <SelectField
                  label={t(msg`当前模式`)}
                  value={draft.parserRules.parserMode}
                  onChange={(value) =>
                    updateParserMode(
                      value as ReminderRuntimeRules["parserRules"]["parserMode"],
                    )
                  }
                  options={[
                    {
                      value: "rules_with_llm_fallback",
                      label: t(msg`规则优先 + 模型兜底`),
                    },
                    {
                      value: "rules_only",
                      label: t(msg`纯规则`),
                    },
                  ]}
                />
                <AdminTextArea
                  label={t(msg`模型兜底提示模板`)}
                  value={draft.parserRules.llmFallbackPrompt}
                  onChange={updateParserPrompt}
                  textareaClassName="min-h-40"
                />
              </div>
            </ConfigGroup>

            <ConfigGroup
              title={t(msg`意图识别`)}
              description={t(msg`决定哪些话会被识别成帮助、列表、删除、修改、完成、顺延。这里适合放正则或强触发片段。`)}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <AdminTextArea
                  label={t(msg`帮助意图`)}
                  value={formatLineList(draft.parserRules.helpIntentPatterns)}
                  onChange={(value) =>
                    updateParserArrayField("helpIntentPatterns", value)
                  }
                  textareaClassName="min-h-24"
                />
                <AdminTextArea
                  label={t(msg`列表意图`)}
                  value={formatLineList(draft.parserRules.listIntentPatterns)}
                  onChange={(value) =>
                    updateParserArrayField("listIntentPatterns", value)
                  }
                  textareaClassName="min-h-24"
                />
                <AdminTextArea
                  label={t(msg`删除意图`)}
                  value={formatLineList(draft.parserRules.cancelIntentPatterns)}
                  onChange={(value) =>
                    updateParserArrayField("cancelIntentPatterns", value)
                  }
                  textareaClassName="min-h-24"
                />
                <AdminTextArea
                  label={t(msg`修改意图`)}
                  value={formatLineList(draft.parserRules.updateIntentPatterns)}
                  onChange={(value) =>
                    updateParserArrayField("updateIntentPatterns", value)
                  }
                  textareaClassName="min-h-24"
                />
                <AdminTextArea
                  label={t(msg`完成意图`)}
                  value={formatLineList(
                    draft.parserRules.completeIntentPatterns,
                  )}
                  onChange={(value) =>
                    updateParserArrayField("completeIntentPatterns", value)
                  }
                  textareaClassName="min-h-24"
                />
                <AdminTextArea
                  label={t(msg`顺延意图`)}
                  value={formatLineList(draft.parserRules.snoozeIntentPatterns)}
                  onChange={(value) =>
                    updateParserArrayField("snoozeIntentPatterns", value)
                  }
                  textareaClassName="min-h-24 xl:col-span-2"
                />
              </div>
            </ConfigGroup>

            <ConfigGroup
              title={t(msg`创建入口与类型识别`)}
              description={t(msg`先判断有没有进入"创建提醒"入口，再根据每天 / 每周 / 习惯类词汇决定落成单次、重复还是习惯提醒。`)}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <AdminTextArea
                  label={t(msg`创建提醒入口关键词`)}
                  value={formatLineList(draft.parserRules.createIntentKeywords)}
                  onChange={(value) =>
                    updateParserArrayField("createIntentKeywords", value)
                  }
                  textareaClassName="min-h-28"
                />
                <AdminTextArea
                  label={t(msg`每日重复关键词`)}
                  value={formatLineList(
                    draft.parserRules.dailyRecurrenceKeywords,
                  )}
                  onChange={(value) =>
                    updateParserArrayField("dailyRecurrenceKeywords", value)
                  }
                  textareaClassName="min-h-28"
                />
                <AdminTextArea
                  label={t(msg`每周重复前缀`)}
                  value={formatLineList(
                    draft.parserRules.weeklyRecurrenceKeywords,
                  )}
                  onChange={(value) =>
                    updateParserArrayField("weeklyRecurrenceKeywords", value)
                  }
                  textareaClassName="min-h-28"
                />
                <AdminTextArea
                  label={t(msg`习惯意图关键词`)}
                  value={formatLineList(draft.parserRules.habitIntentKeywords)}
                  onChange={(value) =>
                    updateParserArrayField("habitIntentKeywords", value)
                  }
                  textareaClassName="min-h-28"
                />
                <AdminTextArea
                  label={t(msg`习惯事项关键词`)}
                  value={formatLineList(draft.parserRules.habitKeywords)}
                  onChange={(value) =>
                    updateParserArrayField("habitKeywords", value)
                  }
                  textareaClassName="min-h-28"
                />
                <AdminTextArea
                  label={t(msg`硬提醒关键词`)}
                  value={formatLineList(draft.parserRules.hardReminderKeywords)}
                  onChange={(value) =>
                    updateParserArrayField("hardReminderKeywords", value)
                  }
                  textareaClassName="min-h-28"
                />
              </div>
            </ConfigGroup>

            <ConfigGroup
              title={t(msg`类别关键词`)}
              description={t(msg`创建提醒后会按标题命中类别关键词；命不中时落到 \`general\`。`)}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <AdminTextArea
                  label={t(msg`健康`)}
                  value={formatLineList(
                    draft.parserRules.categoryKeywords.health,
                  )}
                  onChange={(value) =>
                    updateParserCategoryKeywords("health", value)
                  }
                  textareaClassName="min-h-24"
                />
                <AdminTextArea
                  label={t(msg`采购`)}
                  value={formatLineList(
                    draft.parserRules.categoryKeywords.shopping,
                  )}
                  onChange={(value) =>
                    updateParserCategoryKeywords("shopping", value)
                  }
                  textareaClassName="min-h-24"
                />
                <AdminTextArea
                  label={t(msg`生活`)}
                  value={formatLineList(
                    draft.parserRules.categoryKeywords.lifestyle,
                  )}
                  onChange={(value) =>
                    updateParserCategoryKeywords("lifestyle", value)
                  }
                  textareaClassName="min-h-24"
                />
                <AdminTextArea
                  label={t(msg`成长`)}
                  value={formatLineList(
                    draft.parserRules.categoryKeywords.growth,
                  )}
                  onChange={(value) =>
                    updateParserCategoryKeywords("growth", value)
                  }
                  textareaClassName="min-h-24"
                />
              </div>
            </ConfigGroup>

            <ConfigGroup
              title={t(msg`时间语义默认值`)}
              description={t(msg`用户只说"早上 / 下午 / 晚上"而没写具体点数时，会落到这里。显式写了 \`8点\`、\`8:30\` 仍优先按显式时间解析。`)}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                {PARSER_PERIOD_FIELDS.map((field) => {
                  const value =
                    draft.parserRules.periodDefaultClocks[field.key];
                  return (
                    <div
                      key={field.key}
                      className="rounded-[18px] border border-[color:var(--border-faint)] bg-white/70 p-4"
                    >
                      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {t(field.label)}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                        {t(field.description)}
                      </div>
                      <div className="mt-4 space-y-4">
                        <AdminTextArea
                          label={t(msg`命中词`)}
                          value={formatLineList(value.patterns)}
                          onChange={(nextValue) =>
                            updateParserPeriodPatterns(field.key, nextValue)
                          }
                          textareaClassName="min-h-24"
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                          <NumberField
                            label={t(msg`默认小时`)}
                            value={value.hour}
                            min={0}
                            max={23}
                            onChange={(nextValue) =>
                              updateParserPeriodTime(
                                field.key,
                                "hour",
                                nextValue,
                              )
                            }
                          />
                          <NumberField
                            label={t(msg`默认分钟`)}
                            value={value.minute}
                            min={0}
                            max={59}
                            onChange={(nextValue) =>
                              updateParserPeriodTime(
                                field.key,
                                "minute",
                                nextValue,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ConfigGroup>

            <ConfigGroup
              title={t(msg`解析预览器`)}
              description={t(msg`输入一句候选用户原话，直接查看会不会命中提醒链、会落成什么提醒、命中了哪些规则。预览使用当前页面 draft，不会落库。`)}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {PARSER_PREVIEW_EXAMPLES.map((example) => (
                    <Button
                      key={String(example.label.id)}
                      variant="secondary"
                      size="sm"
                      onClick={() => onPreviewInputChange(example.message)}
                    >
                      {t(example.label)}
                    </Button>
                  ))}
                </div>
                <AdminTextArea
                  label={t(msg`候选原话`)}
                  value={previewInput}
                  onChange={onPreviewInputChange}
                  placeholder={t(msg`例如：明早8点提醒我吃药 / 每周五晚上提醒我买猫粮 / 今天先帮我记着晚上开会。`)}
                  textareaClassName="min-h-28"
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!previewInput.trim() || previewPending}
                    onClick={onRunPreview}
                  >
                    {previewPending ? t(msg`预演中...`) : t(msg`运行解析预演`)}
                  </Button>
                </div>

                {previewError ? (
                  <ErrorBlock message={previewError.message} />
                ) : null}

                {previewResult ? (
                  <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <AdminValueCard
                          label={t(msg`动作`)}
                          value={
                            t(PREVIEW_ACTION_LABELS[previewResult.action] ?? msg`${previewResult.action}`)
                          }
                        />
                        <AdminValueCard
                          label={t(msg`解析来源`)}
                          value={
                            t(PREVIEW_SOURCE_LABELS[previewResult.source] ?? msg`${previewResult.source}`)
                          }
                        />
                        <AdminValueCard
                          label={t(msg`处理结果`)}
                          value={
                            previewResult.handled
                              ? t(msg`会进入提醒运行时`)
                              : t(msg`继续走普通聊天链路`)
                          }
                        />
                        <AdminValueCard
                          label={t(msg`提取标题`)}
                          value={previewResult.extractedTitle || t(msg`未提取`)}
                        />
                        <AdminValueCard
                          label={t(msg`评估时间`)}
                          value={`${previewResult.timezone} · ${formatDateTime(
                            previewResult.evaluatedAt,
                          )}`}
                        />
                      </div>

                      <AdminSoftBox>
                        {t(msg`结论：`)}
                        <div className="mt-2 text-sm leading-6">
                          {previewResult.reason}
                        </div>
                      </AdminSoftBox>

                      <AdminSoftBox>
                        {t(msg`回复预览：`)}
                        <div className="mt-2 text-sm leading-6">
                          {previewResult.responseText ||
                            t(msg`当前消息不会由提醒运行时接管。`)}
                        </div>
                      </AdminSoftBox>

                      {previewResult.canonicalMessage ? (
                        <AdminSoftBox>
                          {t(msg`兜底标准口令：`)}
                          <div className="mt-2 text-sm leading-6">
                            {previewResult.canonicalMessage}
                          </div>
                          {previewResult.fallbackReason ? (
                            <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                              {t(msg`模型判断：${previewResult.fallbackReason}`)}
                            </div>
                          ) : null}
                        </AdminSoftBox>
                      ) : null}

                      {previewResult.parsedTask ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <AdminValueCard
                            label={t(msg`提醒类型`)}
                            value={
                              t(TASK_KIND_LABELS[previewResult.parsedTask.kind] ?? msg`${previewResult.parsedTask.kind}`)
                            }
                          />
                          <AdminValueCard
                            label={t(msg`优先级`)}
                            value={
                              previewResult.parsedTask.priority === "hard"
                                ? t(msg`硬提醒`)
                                : t(msg`轻提醒`)
                            }
                          />
                          <AdminValueCard
                            label={t(msg`类别`)}
                            value={
                              t(TASK_CATEGORY_LABELS[previewResult.parsedTask.category] ?? msg`${previewResult.parsedTask.category}`)
                            }
                          />
                          <AdminValueCard
                            label={t(msg`下一次触发`)}
                            value={formatDateTime(
                              previewResult.parsedTask.nextTriggerAt ??
                                previewResult.parsedTask.dueAt,
                            )}
                          />
                        </div>
                      ) : null}

                      {previewResult.referencedTask ? (
                        <AdminSoftBox>
                          {t(msg`当前命中的已有提醒：`)}
                          <div className="mt-2 text-sm leading-6">
                            {previewResult.referencedTask.title}
                            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                              {previewResult.referencedTask.scheduleText}
                            </div>
                          </div>
                        </AdminSoftBox>
                      ) : null}

                      {previewResult.needsClarification ? (
                        <AdminCallout
                          tone="warning"
                          title={t(msg`当前还需要澄清`)}
                          description={t(msg`说明规则已经命中提醒链，但标题或时间还不够完整，实际会回复用户继续补信息。`)}
                        />
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="mb-2 text-sm font-semibold text-[color:var(--text-primary)]">
                          {t(msg`命中规则`)}
                        </div>
                        <AdminCodeBlock
                          value={prettyJson(previewResult.matchedRules)}
                        />
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-semibold text-[color:var(--text-primary)]">
                          {t(msg`解析结果详情`)}
                        </div>
                        <AdminCodeBlock
                          value={prettyJson({
                            handled: previewResult.handled,
                            action: previewResult.action,
                            parsedTask: previewResult.parsedTask,
                            referencedTask: previewResult.referencedTask,
                          })}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <AdminEmptyState
                    title={t(msg`还没有解析结果`)}
                    description={t(msg`先输入一句候选用户原话，再点"运行解析预演"，这里会展示命中规则、解析结果和回复预览。`)}
                  />
                )}
              </div>
            </ConfigGroup>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={savePending || !dirty}
          >
            {savePending ? t(msg`保存中...`) : t(msg`保存规则与模板`)}
          </Button>
        </div>
      </div>
    </Card>
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
      <div className="font-semibold text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
      <div className="mt-4">{children}</div>
    </div>
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
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

export function ReminderRuntimePage() {
  const t = translateRuntimeMessage;
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ReminderRuntimeRules | null>(null);
  const [notice, setNotice] = useState("");
  const [taskFilter, setTaskFilter] = useState<ReminderTaskFilter>("focus");
  const [taskSearch, setTaskSearch] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [configTab, setConfigTab] = useState<ReminderConfigTab>("schedule");
  const [parserPreviewInput, setParserPreviewInput] =
    useState("明早8点提醒我吃药"); // i18n-ignore-line: sample demo initial value
  const deferredTaskSearch = useDeferredValue(normalizeSearchText(taskSearch));

  const overviewQuery = useQuery({
    queryKey: ["admin-reminder-runtime", baseUrl],
    queryFn: () => adminApi.getReminderRuntimeOverview(),
  });

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
    const timer = window.setTimeout(() => setNotice(""), 2600); // i18n-ignore-line: clears transient notice state
    return () => window.clearTimeout(timer);
  }, [notice]);

  const invalidateReminderRuntimeOverview = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["admin-reminder-runtime", baseUrl],
    });
  };

  const runMutation = useMutation({
    mutationFn: (jobId: ReminderSchedulerJob) =>
      runSchedulerJob(jobId, baseUrl),
    onSuccess: async (_, jobId) => {
      setNotice(t(JOB_SUCCESS_NOTICES[jobId]));
      await Promise.all([
        invalidateReminderRuntimeOverview(),
        queryClient.invalidateQueries({
          queryKey: ["admin-scheduler-status", baseUrl],
        }),
      ]);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => adminApi.setReminderRuntimeRules(draft ?? {}),
    onSuccess: async (rules) => {
      setDraft(rules);
      setNotice(t(msg`提醒运行时配置已保存。`));
      await queryClient.invalidateQueries({
        queryKey: ["admin-reminder-runtime", baseUrl],
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: ({
      message,
      rules,
    }: {
      message: string;
      rules: ReminderRuntimeRules;
    }) => adminApi.previewReminderRuntime(message, rules),
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) =>
      adminApi.completeReminderRuntimeTask(taskId),
    onSuccess: async ({ task }) => {
      setNotice(
        task.kind === "one_time"
          ? t(msg`已完成：${task.title}`)
          : t(msg`已记录完成：${task.title}`),
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
          ? t(msg`${task.title} 已顺到明天。`)
          : t(msg`${task.title} 已往后顺 30 分钟。`),
      );
      await invalidateReminderRuntimeOverview();
    },
  });

  const cancelTaskMutation = useMutation({
    mutationFn: (taskId: string) => adminApi.cancelReminderRuntimeTask(taskId),
    onSuccess: async ({ task }) => {
      setNotice(t(msg`已删除：${task.title}`));
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

  const previewError =
    previewMutation.error instanceof Error ? previewMutation.error : null;

  const metrics = useMemo(() => {
    const stats = overviewQuery.data?.stats;
    return [
      {
        label: t(msg`逾期 / 6 小时内`),
        value: `${stats?.overdueTaskCount ?? 0} / ${stats?.dueSoonTaskCount ?? 0}`,
      },
      {
        label: t(msg`习惯 / 硬提醒`),
        value: `${stats?.habitTaskCount ?? 0} / ${stats?.hardTaskCount ?? 0}`,
      },
      {
        label: t(msg`今日触发 / 完成`),
        value: `${stats?.deliveredTodayCount ?? 0} / ${stats?.completedTodayCount ?? 0}`,
      },
      {
        label: t(msg`今日发圈`),
        value: stats?.momentCountToday ?? 0,
      },
    ];
  }, [overviewQuery.data]);

  const dirty =
    draft != null &&
    overviewQuery.data != null &&
    serializeRules(draft) !== serializeRules(overviewQuery.data.rules);

  const now = new Date();
  const activeTasks = overviewQuery.data?.activeTasks ?? [];
  const filteredTasks = activeTasks.filter(
    (task) =>
      matchesTaskFilter(task, taskFilter, now) &&
      matchesTaskSearch(task, deferredTaskSearch),
  );
  const selectedTask =
    filteredTasks.find((task) => task.id === selectedTaskId) ??
    filteredTasks[0] ??
    null;

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
    return <LoadingBlock label={t(msg`正在读取提醒运行时概览...`)} />;
  }

  if (!overviewQuery.data) {
    return (
      <ErrorBlock
        message={
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : t(msg`提醒运行时概览加载失败。`)
        }
      />
    );
  }

  if (!draft) {
    return <LoadingBlock label={t(msg`正在同步提醒运行时配置...`)} />;
  }

  const { stats } = overviewQuery.data;
  const runningJob = runMutation.variables ?? null;
  const taskGroups = [
    {
      key: "overdue" as const,
      label: t(msg`逾期`),
      description: t(msg`已经超过计划时间，优先判断是否要立刻处置。`),
      tasks: filteredTasks.filter(
        (task) => resolveTaskQueue(task, now) === "overdue",
      ),
    },
    {
      key: "due_soon" as const,
      label: t(msg`6 小时内到点`),
      description: t(msg`下一波提醒即将触发，适合提前整理。`),
      tasks: filteredTasks.filter(
        (task) => resolveTaskQueue(task, now) === "due_soon",
      ),
    },
    {
      key: "routine" as const,
      label: t(msg`常规排队`),
      description: t(msg`暂不紧急，但仍可回看节奏与说明。`),
      tasks: filteredTasks.filter(
        (task) => resolveTaskQueue(task, now) === "routine",
      ),
    },
  ].filter((group) => group.tasks.length > 0);
  const recentActivity = buildRecentActivity(overviewQuery.data);

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow={t(msg`提醒运行时`)}
        title={t(msg`小盯值班台：先看风险，再处理提醒`)}
        description={t(msg`把逾期、即将到点、最近触发与最近输出收敛到同一页，方便运营先判断优先级，再逐条完成、顺延或删除提醒。`)}
        badges={[t(msg`承接角色：小盯`)]}
        metrics={metrics}
        metricsClassName="md:grid-cols-2"
        actions={
          <>
            <AdminDraftStatusPill ready dirty={dirty} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => runMutation.mutate("trigger_due_reminder_tasks")}
              disabled={runMutation.isPending}
            >
              {runningJob === "trigger_due_reminder_tasks"
                ? t(msg`执行中...`)
                : t(msg`执行到点提醒`)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => runMutation.mutate("trigger_reminder_checkins")}
              disabled={runMutation.isPending}
            >
              {runningJob === "trigger_reminder_checkins"
                ? t(msg`执行中...`)
                : t(msg`执行问询`)}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !dirty}
            >
              {saveMutation.isPending ? t(msg`保存中...`) : t(msg`保存配置`)}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => runMutation.mutate("check_moment_schedule")}
              disabled={runMutation.isPending}
            >
              {runningJob === "check_moment_schedule"
                ? t(msg`执行中...`)
                : t(msg`执行发圈窗口`)}
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
      {saveMutation.error instanceof Error ? (
        <ErrorBlock message={saveMutation.error.message} />
      ) : null}
      {taskActionError ? (
        <ErrorBlock message={taskActionError.message} />
      ) : null}

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title={t(msg`值班工作台`)}
          actions={
            <StatusPill tone={filteredTasks.length > 0 ? "healthy" : "muted"}>
              {t(msg`显示 ${filteredTasks.length} / ${stats.activeTaskCount} 条`)}
            </StatusPill>
          }
        />
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <TaskFilterChip
              label={t(msg`优先处理`)}
              count={buildTaskFilterCount("focus", overviewQuery.data)}
              active={taskFilter === "focus"}
              onClick={() => setTaskFilter("focus")}
            />
            <TaskFilterChip
              label={t(msg`全部`)}
              count={buildTaskFilterCount("all", overviewQuery.data)}
              active={taskFilter === "all"}
              onClick={() => setTaskFilter("all")}
            />
            <TaskFilterChip
              label={t(msg`硬提醒`)}
              count={buildTaskFilterCount("hard", overviewQuery.data)}
              active={taskFilter === "hard"}
              onClick={() => setTaskFilter("hard")}
            />
            <TaskFilterChip
              label={t(msg`习惯`)}
              count={buildTaskFilterCount("habit", overviewQuery.data)}
              active={taskFilter === "habit"}
              onClick={() => setTaskFilter("habit")}
            />
          </div>
          <AdminPillTextField
            value={taskSearch}
            onChange={setTaskSearch}
            placeholder={t(msg`搜提醒标题、说明、分类或调度文案`)}
            className="w-full sm:max-w-sm"
          />
        </div>

        <div className="mt-4">
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
                          {t(msg`${group.tasks.length} 条`)}
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
                            onComplete={() =>
                              completeTaskMutation.mutate(task.id)
                            }
                            onSnoozeMinutes={() =>
                              snoozeTaskMutation.mutate({
                                taskId: task.id,
                                payload: { minutes: 30 },
                              })
                            }
                            onCancel={() =>
                              cancelTaskMutation.mutate(task.id)
                            }
                            activeTaskAction={activeTaskAction}
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
                    onComplete={() =>
                      completeTaskMutation.mutate(selectedTask.id)
                    }
                    onSnoozeMinutes={() =>
                      snoozeTaskMutation.mutate({
                        taskId: selectedTask.id,
                        payload: { minutes: 30 },
                      })
                    }
                    onSnoozeTomorrow={() =>
                      snoozeTaskMutation.mutate({
                        taskId: selectedTask.id,
                        payload: {
                          until: buildTomorrowReminderIso(selectedTask),
                        },
                      })
                    }
                    onCancel={() =>
                      cancelTaskMutation.mutate(selectedTask.id)
                    }
                  />
                ) : (
                  <AdminEmptyState
                    title={t(msg`当前筛选下没有焦点提醒`)}
                    description={t(msg`调整左侧筛选条件后，这里会展示一条可直接处理的焦点提醒。`)}
                  />
                )}
              </div>
            ) : (
              <AdminEmptyState
                title={t(msg`没有匹配的提醒`)}
                description={t(msg`当前筛选和搜索条件下没有结果，建议清空关键字或切换到"全部任务"继续查看。`)}
              />
            )
          ) : (
            <AdminEmptyState
              title={t(msg`当前没有活跃提醒`)}
              description={t(msg`用户还没有交给小盯新的提醒事项，或者当前活跃提醒已经全部完成 / 删除。`)}
            />
          )}
        </div>
      </Card>

      <ReminderRuntimeConfigPanel
        draft={draft}
        dirty={dirty}
        activeTab={configTab}
        onTabChange={setConfigTab}
        onChange={setDraft}
        onSave={() => saveMutation.mutate()}
        savePending={saveMutation.isPending}
        previewInput={parserPreviewInput}
        onPreviewInputChange={setParserPreviewInput}
        onRunPreview={() => {
          if (!draft || !parserPreviewInput.trim()) {
            return;
          }
          previewMutation.mutate({
            message: parserPreviewInput.trim(),
            rules: draft,
          });
        }}
        previewPending={previewMutation.isPending}
        previewResult={previewMutation.data ?? null}
        previewError={previewError}
      />

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title={t(msg`最近执行流水`)}
          actions={
            <StatusPill tone={recentActivity.length > 0 ? "healthy" : "muted"}>
              {t(msg`${recentActivity.length} 条`)}
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
              title={t(msg`还没有最近动作`)}
              description={t(msg`这里会汇总最近触发、完成、私聊出站和朋友圈轻提醒，方便运营快速回看刚刚发生了什么。`)}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

