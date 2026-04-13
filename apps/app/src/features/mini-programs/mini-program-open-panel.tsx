import type { ReactNode } from "react";
import { Button, cn } from "@yinjie/ui";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Pin,
  Share2,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { useDesktopLayout } from "../shell/use-desktop-layout";
import { formatConversationTimestamp } from "../../lib/format";
import {
  isMobileWebShareSurface,
  isNativeMobileShareSurface,
} from "../../runtime/mobile-share-surface";
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
  const isDesktopLayout = useDesktopLayout();
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const mobileWebCopyFallback = isMobileWebShareSurface({
    isDesktopLayout,
  });
  const resolvedCopyActionHint =
    copyActionHint ??
    (nativeMobileShareSupported
      ? "当前先由轻工作台承接上下文，也可以直接通过系统分享发给联系人或其他应用。"
      : mobileWebCopyFallback
        ? "当前先由轻工作台承接上下文，也可以直接复制入口链接继续使用。"
        : "当前先由轻工作台承接上下文，也可以直接发到手机继续处理。");
  const resolvedCopyActionIcon =
    copyActionIcon ??
    (nativeMobileShareSupported ? (
      <Share2 size={16} />
    ) : mobileWebCopyFallback ? (
      <Copy size={16} />
    ) : (
      <Smartphone size={16} />
    ));
  const resolvedCopyActionLabel = copyActionLabel
    ? copyActionLabel
    : nativeMobileShareSupported
      ? "系统分享"
      : mobileWebCopyFallback
        ? "复制入口"
        : "发到手机";

  return (
    <section
      className={cn(
        compact
          ? "rounded-[16px] border p-3.5 shadow-none"
          : "rounded-[30px] border p-5 shadow-[var(--shadow-soft)]",
        tone.mutedPanelClassName,
      )}
    >
      <div className={cn("flex items-start justify-between", compact ? "gap-3" : "gap-4")}>
        <div className={cn("flex min-w-0", compact ? "gap-3" : "gap-4")}>
          <MiniProgramGlyph miniProgram={miniProgram} size={compact ? "md" : "lg"} />
          <div className="min-w-0">
            <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
              <div
                className={cn(
                  compact
                    ? "rounded-full border px-2 py-0.5 text-[9px] font-medium"
                    : "rounded-full border px-2.5 py-1 text-[10px] font-medium",
                  tone.badgeClassName,
                )}
              >
                {isActive ? "已打开" : "待打开"}
              </div>
              <div className={cn("text-[color:var(--text-muted)]", compact ? "text-[9px]" : "text-[11px]")}>
                {isActive ? "最近一次打开的小程序面板" : "点击后写入最近使用和打开态"}
              </div>
            </div>
            <div
              className={cn(
                "font-semibold text-[color:var(--text-primary)]",
                compact ? "mt-1.5 text-[14px]" : "mt-3 text-lg",
              )}
            >
              {isActive ? `继续使用 ${miniProgram.name}` : miniProgram.name}
            </div>
            <div
              className={cn(
                "text-[color:var(--text-secondary)]",
                compact ? "mt-1 text-[11px] leading-[1.35rem]" : "mt-2 text-sm leading-7",
              )}
            >
              {miniProgram.openHint}
            </div>
          </div>
        </div>
        {isActive && onDismiss ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className={cn(
              "shrink-0 border border-white/80 bg-white/72",
              compact ? "h-8 w-8 rounded-full" : "rounded-2xl",
            )}
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
          compact={compact}
        />
        <PanelMetric
          icon={<Pin size={15} className={tone.softTextClassName} />}
          label="我的小程序"
          value={isPinned ? "已加入常用入口" : "尚未加入我的小程序"}
          compact={compact}
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
          compact={compact}
        />
      </div>

      <div className={cn("mt-4 flex flex-wrap", compact ? "gap-1.5" : "gap-2")}>
        {miniProgram.tags.map((tag) => (
          <span
            key={tag}
            className={cn(
              "rounded-full bg-white/84 text-[color:var(--text-muted)]",
              compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
            )}
          >
            {tag}
          </span>
        ))}
      </div>

      {tasks.length ? (
        <div
          className={cn(
            "mt-4.5 border border-white/80 bg-white/78",
            compact ? "rounded-[16px] p-3" : "rounded-[24px] p-4",
          )}
        >
          <div
            className={cn(
              "font-medium text-[color:var(--text-primary)]",
              compact ? "text-[13px]" : "text-sm",
            )}
          >
            当前工作台
          </div>
          <div
            className={cn(
              "mt-1 text-[color:var(--text-muted)]",
              compact ? "text-[10px] leading-[1.35rem]" : "text-xs leading-5",
            )}
          >
            打开后先承接一组本地待办，让这个面板不只是一次“已打开”的记录。
          </div>

          <div className={cn("mt-3.5", compact ? "space-y-2" : "space-y-3")}>
            {tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "border border-[rgba(15,23,42,0.06)] bg-white/86",
                  compact ? "rounded-[15px] px-3 py-2.5" : "rounded-[20px] px-4 py-4",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className={cn(
                          "font-medium text-[color:var(--text-primary)]",
                          compact ? "text-[12px]" : "text-sm",
                        )}
                      >
                        {task.title}
                      </div>
                      {task.completed ? (
                        <span
                          className={cn(
                            "rounded-full bg-[rgba(47,122,63,0.1)] text-[#2f7a3f]",
                            compact ? "px-1.5 py-0.5 text-[8px]" : "px-2.5 py-1 text-[10px]",
                          )}
                        >
                          已完成
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "mt-1.5 text-[color:var(--text-secondary)]",
                        compact ? "text-[10px] leading-[1.35rem]" : "text-xs leading-6",
                      )}
                    >
                      {task.detail}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onToggleTask(miniProgram.id, task.id)}
                    className={cn(
                      "shrink-0 border-white/80 bg-white",
                      compact && "h-8 rounded-full px-3 text-[11px]",
                    )}
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

      <div className={cn("mt-5 flex flex-wrap", compact ? "gap-2" : "gap-3")}>
        <Button
          variant="primary"
          onClick={() => onOpen(miniProgram.id)}
          className={compact ? "h-8 rounded-full px-3.5 text-[11px]" : undefined}
        >
          {isActive ? "继续使用" : "打开小程序"}
        </Button>
        {onCopyToMobile ? (
          <Button
            variant="secondary"
            onClick={() => onCopyToMobile(miniProgram.id)}
            className={cn(
              "border-white/80 bg-white/88",
              compact && "h-8 rounded-full px-3.5 text-[11px]",
            )}
          >
            {resolvedCopyActionIcon}
            {resolvedCopyActionLabel}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => onTogglePinned(miniProgram.id)}
          className={cn(
            "border-white/80 bg-white/88",
            compact && "h-8 rounded-full px-3.5 text-[11px]",
          )}
        >
          {isPinned ? "移出我的小程序" : "加入我的小程序"}
        </Button>
        <div
          className={cn(
            "flex items-center text-[color:var(--text-muted)]",
            compact ? "text-[11px] leading-[1.35rem]" : "text-xs leading-6",
          )}
        >
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
  compact = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "border border-white/80 bg-white/84",
        compact ? "rounded-[15px] px-2.5 py-2.5" : "rounded-[22px] px-4 py-4",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 uppercase text-[color:var(--text-muted)]",
          compact ? "text-[9px] tracking-[0.12em]" : "text-[11px] tracking-[0.14em]",
        )}
      >
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "font-medium text-[color:var(--text-primary)]",
          compact ? "mt-1 text-[12px] leading-5" : "mt-2 text-sm",
        )}
      >
        {value}
      </div>
      {detail ? (
        <div
          className={cn(
            "text-[color:var(--text-dim)]",
            compact ? "mt-0.5 text-[9px] leading-4" : "mt-1 text-[11px] leading-5",
          )}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}
