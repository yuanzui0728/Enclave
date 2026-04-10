import type { ReactNode } from "react";
import { Button, cn } from "@yinjie/ui";
import { Clock3, Pin, Sparkles, X } from "lucide-react";
import { formatConversationTimestamp } from "../../lib/format";
import {
  getMiniProgramToneStyle,
  type MiniProgramEntry,
} from "./mini-programs-data";
import { MiniProgramGlyph } from "./mini-program-glyph";

type MiniProgramOpenPanelProps = {
  miniProgram: MiniProgramEntry;
  isActive: boolean;
  isPinned: boolean;
  launchCount: number;
  lastOpenedAt?: string;
  compact?: boolean;
  onDismiss?: () => void;
  onOpen: (miniProgramId: string) => void;
  onTogglePinned: (miniProgramId: string) => void;
};

export function MiniProgramOpenPanel({
  miniProgram,
  isActive,
  isPinned,
  launchCount,
  lastOpenedAt,
  compact = false,
  onDismiss,
  onOpen,
  onTogglePinned,
}: MiniProgramOpenPanelProps) {
  const tone = getMiniProgramToneStyle(miniProgram.tone);

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

      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => onOpen(miniProgram.id)}>
          {isActive ? "继续使用" : "打开小程序"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onTogglePinned(miniProgram.id)}
          className="border-white/80 bg-white/88"
        >
          {isPinned ? "移出我的小程序" : "加入我的小程序"}
        </Button>
        <div className="flex items-center text-xs leading-6 text-[color:var(--text-muted)]">
          {isActive
            ? "首版先由面板承接上下文，不直接进入真实小程序容器。"
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
