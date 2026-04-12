import type { ReactNode } from "react";
import { Button, cn } from "@yinjie/ui";
import {
  CheckCircle2,
  Clock3,
  Pin,
  Share2,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { formatConversationTimestamp } from "../../lib/format";
import { isNativeMobileBridgeAvailable } from "../../runtime/mobile-bridge";
import {
  getMiniProgramToneStyle,
  type ResolvedMiniProgramWorkspaceTask,
  type MiniProgramEntry,
} from "./mini-programs-data";
import { MiniProgramGlyph } from "./mini-program-glyph";

type MiniProgramOpenPanelProps = {
  miniProgram: MiniProgramEntry;
  isActive: boolean;
  isPinned: boolean;
  launchCount: number;
  lastOpenedAt?: string;
  tasks: ResolvedMiniProgramWorkspaceTask[];
  compact?: boolean;
  onDismiss?: () => void;
  onCopyToMobile?: (miniProgramId: string) => void;
  copyActionHint?: string;
  copyActionIcon?: ReactNode;
  copyActionLabel?: string;
  onOpen: (miniProgramId: string) => void;
  onToggleTask: (miniProgramId: string, taskId: string) => void;
  onTogglePinned: (miniProgramId: string) => void;
};

export function MiniProgramOpenPanel({
  miniProgram,
  isActive,
  isPinned,
  launchCount,
  lastOpenedAt,
  tasks,
  compact = false,
  onDismiss,
  onCopyToMobile,
  copyActionHint,
  copyActionIcon,
  copyActionLabel,
  onOpen,
  onToggleTask,
  onTogglePinned,
}: MiniProgramOpenPanelProps) {
  const tone = getMiniProgramToneStyle(miniProgram.tone);
  const nativeMobileShareSupported = isNativeMobileBridgeAvailable();
  const resolvedCopyActionHint =
    copyActionHint ??
    (nativeMobileShareSupported
      ? "当前先由轻工作台承接上下文，也可以直接通过系统分享发给联系人或其他应用。"
      : "当前先由轻工作台承接上下文，也可以直接发到手机继续处理。");
  const resolvedCopyActionIcon =
    copyActionIcon ??
    (nativeMobileShareSupported ? <Share2 size={16} /> : <Smartphone size={16} />);
  const resolvedCopyActionLabel =
    copyActionLabel ?? (nativeMobileShareSupported ? "系统分享" : "发到手机");

  return (
    <section
      className={cn(
        "rounded-[30px] border p-5 shadow-[var(--shadow-soft)]",
        tone.mutedPanelClassName,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          <MiniProgramGlyph miniProgram={miniProgram} size={compact ? "md" : "lg"} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-medium",
                  tone.badgeClassName,
                )}
              >
                {isActive ? "已打开" : "待打开"}
              </div>
              <div className="text-[11px] text-[color:var(--text-muted)]">
                {isActive ? "最近一次打开的小程序面板" : "点击后写入最近使用和打开态"}
              </div>
            </div>
            <div className="mt-3 text-lg font-semibold text-[color:var(--text-primary)]">
              {isActive ? `继续使用 ${miniProgram.name}` : miniProgram.name}
            </div>
            <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              {miniProgram.openHint}
            </div>
          </div>
        </div>
        {isActive && onDismiss ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="shrink-0 rounded-2xl border border-white/80 bg-white/72"
          >
            <X size={16} />
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-4 grid gap-3",
          compact ? "grid-cols-1" : "sm:grid-cols-3",
        )}
      >
        <PanelMetric
          icon={<Sparkles size={15} className={tone.softTextClassName} />}
          label="当前状态"
          value={miniProgram.serviceLabel}
        />
        <PanelMetric
          icon={<Pin size={15} className={tone.softTextClassName} />}
          label="我的小程序"
          value={isPinned ? "已加入常用入口" : "尚未加入我的小程序"}
        />
        <PanelMetric
          icon={<Clock3 size={15} className={tone.softTextClassName} />}
          label="打开记录"
          value={`${launchCount} 次`}
          detail={
            lastOpenedAt
              ? `上次打开 ${formatConversationTimestamp(lastOpenedAt)}`
              : "还没有使用过"
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {miniProgram.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-white/84 px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]"
          >
            {tag}
          </span>
        ))}
      </div>

      {tasks.length ? (
        <div className="mt-5 rounded-[24px] border border-white/80 bg-white/78 p-4">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            当前工作台
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            打开后先承接一组本地待办，让这个面板不只是一次“已打开”的记录。
          </div>

          <div className="mt-4 space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-[20px] border border-[rgba(15,23,42,0.06)] bg-white/86 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {task.title}
                      </div>
                      {task.completed ? (
                        <span className="rounded-full bg-[rgba(47,122,63,0.1)] px-2.5 py-1 text-[10px] text-[#2f7a3f]">
                          已完成
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                      {task.detail}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onToggleTask(miniProgram.id, task.id)}
                    className="shrink-0 border-white/80 bg-white"
                  >
                    <CheckCircle2 size={14} />
                    {task.completed ? "撤销" : task.actionLabel}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => onOpen(miniProgram.id)}>
          {isActive ? "继续使用" : "打开小程序"}
        </Button>
        {onCopyToMobile ? (
          <Button
            variant="secondary"
            onClick={() => onCopyToMobile(miniProgram.id)}
            className="border-white/80 bg-white/88"
          >
            {resolvedCopyActionIcon}
            {resolvedCopyActionLabel}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => onTogglePinned(miniProgram.id)}
          className="border-white/80 bg-white/88"
        >
          {isPinned ? "移出我的小程序" : "加入我的小程序"}
        </Button>
        <div className="flex items-center text-xs leading-6 text-[color:var(--text-muted)]">
          {isActive
            ? onCopyToMobile
              ? resolvedCopyActionHint
              : "当前先由轻工作台承接上下文。"
            : "打开后会同步更新最近使用、打开次数和当前承接面板。"}
        </div>
      </div>
    </section>
  );
}

function PanelMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 text-[11px] leading-5 text-[color:var(--text-dim)]">
          {detail}
        </div>
      ) : null}
    </div>
  );
}
