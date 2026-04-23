import { useEffect, useMemo, useState } from "react";
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

type ReminderTaskPanelProps = {
  conversationId: string;
  variant?: "mobile" | "desktop";
  surface?: "thread" | "details";
};

type ReminderPanelNotice = {
  tone: "success" | "danger";
  message: string;
};

const DEFAULT_VISIBLE_TASK_COUNT = 3;

export function ReminderTaskPanel({
  conversationId,
  variant = "mobile",
  surface = "thread",
}: ReminderTaskPanelProps) {
  const isDesktop = variant === "desktop";
  const isDetailsSurface = surface === "details";
  const [expanded, setExpanded] = useState(isDesktop);
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
    setExpanded(isDesktop);
    setNotice(null);
  }, [conversationId, isDesktop]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleTasks = useMemo(
    () => (expanded ? tasks : tasks.slice(0, DEFAULT_VISIBLE_TASK_COUNT)),
    [expanded, tasks],
  );
  const hiddenCount = Math.max(tasks.length - visibleTasks.length, 0);

  const handleComplete = async (task: ReminderTaskRecord) => {
    try {
      await completeTask(task.id);
      setNotice({
        tone: "success",
        message:
          task.kind === "one_time"
            ? `已完成：${task.title}`
            : `已记录这次完成：${task.title}`,
      });
    } catch (taskError) {
      setNotice({
        tone: "danger",
        message:
          taskError instanceof Error
            ? taskError.message
            : "完成提醒失败，请稍后再试。",
      });
    }
  };

  const handleSnooze30Minutes = async (task: ReminderTaskRecord) => {
    try {
      await snoozeTask(task.id, { minutes: 30 });
      setNotice({
        tone: "success",
        message: `${task.title} 已往后顺 30 分钟。`,
      });
    } catch (taskError) {
      setNotice({
        tone: "danger",
        message:
          taskError instanceof Error
            ? taskError.message
            : "延后提醒失败，请稍后再试。",
      });
    }
  };

  const handleSnoozeTomorrow = async (task: ReminderTaskRecord) => {
    try {
      const until = buildTomorrowReminderIso(task);
      await snoozeTask(task.id, { until });
      setNotice({
        tone: "success",
        message: `${task.title} 已顺到明天。`,
      });
    } catch (taskError) {
      setNotice({
        tone: "danger",
        message:
          taskError instanceof Error
            ? taskError.message
            : "延后提醒失败，请稍后再试。",
      });
    }
  };

  const handleCancel = async (task: ReminderTaskRecord) => {
    try {
      await cancelTask(task.id);
      setNotice({
        tone: "success",
        message: `已删除：${task.title}`,
      });
    } catch (taskError) {
      setNotice({
        tone: "danger",
        message:
          taskError instanceof Error
            ? taskError.message
            : "删除提醒失败，请稍后再试。",
      });
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
            : "rounded-[20px] border border-[rgba(7,193,96,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,251,247,0.98))] shadow-[0_14px_32px_-26px_rgba(15,23,42,0.45)]",
          !isDetailsSurface && (isDesktop ? "px-4 py-3" : "px-3 py-2.5"),
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(7,193,96,0.12)] text-[#07c160]">
                <BellRing size={16} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                  小盯替你记着 {tasks.length} 件事
                </div>
                <div className="mt-0.5 text-[11px] text-[color:var(--text-secondary)]">
                  直接点按就能完成、延后或删掉提醒。
                </div>
              </div>
            </div>
          </div>

          {tasks.length > DEFAULT_VISIBLE_TASK_COUNT ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-[11px]"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "收起" : "展开"}
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </Button>
          ) : null}
        </div>

        {notice ? (
          <InlineNotice
            tone={notice.tone === "success" ? "success" : "danger"}
            className="mt-3 rounded-[16px] px-3 py-2 text-[11px]"
          >
            {notice.message}
          </InlineNotice>
        ) : null}

        {error ? (
          <InlineNotice tone="danger" className="mt-3 rounded-[16px] px-3 py-2 text-[11px]">
            {error}
          </InlineNotice>
        ) : null}

        {isLoading ? (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-[color:var(--text-secondary)]">
            <LoaderCircle size={14} className="animate-spin" />
            正在同步提醒任务…
          </div>
        ) : tasks.length === 0 ? (
          <div className="mt-3 rounded-[16px] border border-dashed border-[rgba(15,23,42,0.1)] bg-[rgba(255,255,255,0.86)] px-3 py-3 text-[11px] leading-5 text-[color:var(--text-secondary)]">
            还没有在替你记的事。直接发一句“明早8点提醒我吃药”或“每周五提醒我买猫粮”就行。
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {visibleTasks.map((task) => {
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
                      label="完成"
                      icon={<CheckCheck size={13} />}
                      disabled={taskPending}
                      onClick={() => {
                        void handleComplete(task);
                      }}
                    />
                    <ActionButton
                      label="30分后"
                      disabled={taskPending}
                      onClick={() => {
                        void handleSnooze30Minutes(task);
                      }}
                    />
                    <ActionButton
                      label="明天"
                      disabled={taskPending}
                      onClick={() => {
                        void handleSnoozeTomorrow(task);
                      }}
                    />
                    <ActionButton
                      label="删除"
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

            {!expanded && hiddenCount > 0 ? (
              <div className="px-1 text-[11px] text-[color:var(--text-secondary)]">
                还有 {hiddenCount} 件提醒，点右上角展开。
              </div>
            ) : null}
          </div>
        )}
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
    return "长期";
  }
  if (task.kind === "recurring") {
    return "重复";
  }
  return task.priority === "hard" ? "硬提醒" : "一次";
}

function buildReminderTaskMeta(task: ReminderTaskRecord) {
  if (task.snoozedUntil) {
    return `已延后到 ${formatMessageTimestamp(task.snoozedUntil)}`;
  }

  const nextTimestamp = parseTimestamp(task.nextTriggerAt ?? task.dueAt);
  if (nextTimestamp != null) {
    return `下次提醒 ${formatMessageTimestamp(String(nextTimestamp))}`;
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
