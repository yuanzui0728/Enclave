import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  BellRing,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { Button, InlineNotice, TagBadge, cn } from "@yinjie/ui";
import { type ReminderTaskRecord } from "@yinjie/contracts";
import { formatMessageTimestamp, parseTimestamp } from "../../lib/format";
import { useReminderRuntimeTasks } from "./use-reminder-runtime-tasks";

const t = translateRuntimeMessage;

type ReminderTaskPanelProps = {
  conversationId: string;
  variant?: "mobile" | "desktop";
  surface?: "thread" | "details";
};

type ReminderPanelNotice = {
  tone: "success" | "danger";
  message: string;
};

export function ReminderTaskPanel({
  conversationId,
  variant = "mobile",
  surface = "thread",
}: ReminderTaskPanelProps) {
  const isDesktop = variant === "desktop";
  const isDetailsSurface = surface === "details";
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<ReminderPanelNotice | null>(null);
  const {
    tasks,
    isLoading,
    error,
    completeTask,
    snoozeTask,
    cancelTask,
    completePendingTaskId,
    snoozePendingTaskId,
    cancelPendingTaskId,
  } = useReminderRuntimeTasks();

  useEffect(() => {
    setExpanded(false);
    setNotice(null);
  }, [conversationId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 走查新一轮 R7：4 个 action 按钮（完成 / 30 分后 / 明天 / 删除）都只靠
  // `disabled={taskPending}` 兜双触发，taskPending 是 mutation.variables 经 React
  // commit 才更新的状态。同帧连点同一个按钮 2 次都能同时通过 disabled=false →
  // 两次 mutateAsync 同时发 POST /reminder-tasks/$id/$action。server 端 complete /
  // cancel 是 idempotent (第二次 409)，snooze 不是 idempotent → 两次 snooze 30
  // 分钟实际把任务往后顺了 60 分钟（server 在当前 remindAt 上再加 30 分钟）。
  // 加 sync ref 锁，按 (taskId, action) 上锁，finally 解锁；不同任务/动作互不影响。
  const taskActionBusyKeysRef = useRef<Set<string>>(new Set());
  const buildTaskActionKey = (taskId: string, action: string) =>
    `${taskId}::${action}`;
  const handleComplete = async (task: ReminderTaskRecord) => {
    const key = buildTaskActionKey(task.id, "complete");
    if (taskActionBusyKeysRef.current.has(key)) {
      return;
    }
    taskActionBusyKeysRef.current.add(key);
    try {
      await completeTask(task.id);
      setNotice({
        tone: "success",
        message:
          task.kind === "one_time"
            ? t(msg`已完成：${task.title}`)
            : t(msg`已记录这次完成：${task.title}`),
      });
    } catch (taskError) {
      setNotice({
        tone: "danger",
        message:
          taskError instanceof Error
            ? taskError.message
            : t(msg`完成提醒失败，请稍后再试。`),
      });
    } finally {
      taskActionBusyKeysRef.current.delete(key);
    }
  };

  const handleSnooze30Minutes = async (task: ReminderTaskRecord) => {
    const key = buildTaskActionKey(task.id, "snooze-30m");
    if (taskActionBusyKeysRef.current.has(key)) {
      return;
    }
    taskActionBusyKeysRef.current.add(key);
    try {
      await snoozeTask(task.id, { minutes: 30 });
      setNotice({
        tone: "success",
        message: t(msg`${task.title} 已往后顺 30 分钟。`),
      });
    } catch (taskError) {
      setNotice({
        tone: "danger",
        message:
          taskError instanceof Error
            ? taskError.message
            : t(msg`延后提醒失败，请稍后再试。`),
      });
    } finally {
      taskActionBusyKeysRef.current.delete(key);
    }
  };

  const handleSnoozeTomorrow = async (task: ReminderTaskRecord) => {
    const key = buildTaskActionKey(task.id, "snooze-tomorrow");
    if (taskActionBusyKeysRef.current.has(key)) {
      return;
    }
    taskActionBusyKeysRef.current.add(key);
    try {
      const until = buildTomorrowReminderIso(task);
      await snoozeTask(task.id, { until });
      setNotice({
        tone: "success",
        message: t(msg`${task.title} 已顺到明天。`),
      });
    } catch (taskError) {
      setNotice({
        tone: "danger",
        message:
          taskError instanceof Error
            ? taskError.message
            : t(msg`延后提醒失败，请稍后再试。`),
      });
    } finally {
      taskActionBusyKeysRef.current.delete(key);
    }
  };

  const handleCancel = async (task: ReminderTaskRecord) => {
    const key = buildTaskActionKey(task.id, "cancel");
    if (taskActionBusyKeysRef.current.has(key)) {
      return;
    }
    taskActionBusyKeysRef.current.add(key);
    try {
      await cancelTask(task.id);
      setNotice({
        tone: "success",
        message: t(msg`已删除：${task.title}`),
      });
    } catch (taskError) {
      setNotice({
        tone: "danger",
        message:
          taskError instanceof Error
            ? taskError.message
            : t(msg`删除提醒失败，请稍后再试。`),
      });
    } finally {
      taskActionBusyKeysRef.current.delete(key);
    }
  };

  return (
    <section
      className={cn(
        !isDetailsSurface &&
          "border-t border-[color:var(--border-faint)] bg-[rgba(248,250,249,0.96)]",
        isDetailsSurface ? "px-0 py-0" : isDesktop ? "px-5 py-3" : "px-2.5 py-2.5",
      )}
    >
      <div
        className={cn(
          isDetailsSurface
            ? isDesktop
              ? "px-4 py-3"
              : "px-4 py-3"
            : "rounded-[20px] border border-[rgba(245, 158, 11,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,251,247,0.98))] shadow-[0_14px_32px_-26px_rgba(15,23,42,0.45)]",
          !isDetailsSurface && (isDesktop ? "px-4 py-3" : "px-3 py-2.5"),
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(245, 158, 11,0.12)] text-[#f59e0b]">
                <BellRing size={16} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                  {t(msg`小盯替你记着 ${tasks.length} 件事`)}
                </div>
                <div className="mt-0.5 text-[11px] text-[color:var(--text-secondary)]">
                  {expanded
                    ? t(msg`直接点按就能完成、延后或删掉提醒。`)
                    : t(msg`点按展开查看提醒。`)}
                </div>
              </div>
            </div>
          </div>

          <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[11px] text-[color:var(--text-secondary)]">
            {expanded ? t(msg`收起`) : t(msg`展开`)}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {expanded ? (
          <>
            {notice ? (
              // R56：notice 是 2200ms 自动消失 (line 62 setTimeout) 的
              // transient toast，反馈「完成 / 延后 / 删除」mutation 结果。
              // success → polite，danger → assertive 立刻打断。
              <InlineNotice
                role={notice.tone === "success" ? "status" : "alert"}
                aria-live={notice.tone === "success" ? "polite" : "assertive"}
                tone={notice.tone === "success" ? "success" : "danger"}
                className="mt-3 rounded-[16px] px-3 py-2 text-[11px]"
              >
                {notice.message}
              </InlineNotice>
            ) : null}

            {error ? (
              // R56 续：error 是 reminderTasksQuery 读取失败兜底，盲人
              // 在展开区里只看到「正在同步」消失却不知道为什么列表是空的。
              <InlineNotice
                role="alert"
                aria-live="assertive"
                tone="danger"
                className="mt-3 rounded-[16px] px-3 py-2 text-[11px]"
              >
                {error}
              </InlineNotice>
            ) : null}

            {isLoading ? (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-[color:var(--text-secondary)]">
                <LoaderCircle size={14} className="animate-spin" />
                {t(msg`正在同步提醒任务…`)}
              </div>
            ) : tasks.length === 0 ? (
              <div className="mt-3 rounded-[16px] border border-dashed border-[rgba(15,23,42,0.1)] bg-[rgba(255,255,255,0.86)] px-3 py-3 text-[11px] leading-5 text-[color:var(--text-secondary)]">
                {t(msg`还没有在替你记的事。直接发一句“明早8点提醒我吃药”或“每周五提醒我买猫粮”就行。`)}
              </div>
            ) : (
              <div className="mt-3 space-y-2.5">
                {tasks.map((task) => {
                  const taskPending =
                    completePendingTaskId === task.id ||
                    snoozePendingTaskId === task.id ||
                    cancelPendingTaskId === task.id;

                  return (
                    <article
                      key={task.id}
                      className="rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-white/95 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                              {task.title}
                            </div>
                            <TagBadge
                              tone={task.priority === "hard" ? "warning" : "info"}
                              className="px-2 py-0.5 text-[10px]"
                            >
                              {getReminderTaskBadgeLabel(task)}
                            </TagBadge>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[color:var(--text-secondary)]">
                            <Clock3 size={12} />
                            <span>{buildReminderTaskMeta(task)}</span>
                          </div>
                        </div>

                        {taskPending ? (
                          <LoaderCircle
                            size={14}
                            className="mt-0.5 shrink-0 animate-spin text-[color:var(--text-muted)]"
                          />
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton
                          label={t(msg`完成`)}
                          icon={<CheckCheck size={13} />}
                          disabled={taskPending}
                          onClick={() => {
                            void handleComplete(task);
                          }}
                        />
                        <ActionButton
                          label={t(msg`30分后`)}
                          disabled={taskPending}
                          onClick={() => {
                            void handleSnooze30Minutes(task);
                          }}
                        />
                        <ActionButton
                          label={t(msg`明天`)}
                          disabled={taskPending}
                          onClick={() => {
                            void handleSnoozeTomorrow(task);
                          }}
                        />
                        <ActionButton
                          label={t(msg`删除`)}
                          icon={<Trash2 size={12} />}
                          tone="danger"
                          disabled={taskPending}
                          onClick={() => {
                            void handleCancel(task);
                          }}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

function ActionButton({
  label,
  icon,
  tone = "default",
  disabled,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-[11px]",
        tone === "danger"
          ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          : "",
      )}
    >
      {icon}
      {label}
    </Button>
  );
}

function getReminderTaskBadgeLabel(task: ReminderTaskRecord) {
  if (task.kind === "habit") {
    return t(msg`长期`);
  }
  if (task.kind === "recurring") {
    return t(msg`重复`);
  }
  return task.priority === "hard" ? t(msg`硬提醒`) : t(msg`一次`);
}

function buildReminderTaskMeta(task: ReminderTaskRecord) {
  if (task.snoozedUntil) {
    const snoozedTimestamp = formatMessageTimestamp(task.snoozedUntil);
    return t(msg`已延后到 ${snoozedTimestamp}`);
  }

  const nextTimestamp = parseTimestamp(task.nextTriggerAt ?? task.dueAt);
  if (nextTimestamp != null) {
    const nextLabel = formatMessageTimestamp(String(nextTimestamp));
    return t(msg`下次提醒 ${nextLabel}`);
  }

  return task.scheduleText;
}

function buildTomorrowReminderIso(task: ReminderTaskRecord) {
  const basisTimestamp =
    parseTimestamp(task.nextTriggerAt) ??
    parseTimestamp(task.dueAt) ??
    Date.now();
  const basis = new Date(basisTimestamp);
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(basis.getHours(), basis.getMinutes(), 0, 0);
  return next.toISOString();
}
