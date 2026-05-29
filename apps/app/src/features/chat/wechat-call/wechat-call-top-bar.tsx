import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@yinjie/ui";

// 微信通话顶栏：左上收起（接 handleBack），可选居中标题/副标题（群用），
// 可选右上动作（切换到视频/语音）。
type WeChatCallTopBarProps = {
  onMinimize?: () => void;
  minimizeLabel: string;
  rightAction?: ReactNode;
  centerTitle?: string;
  centerSubtitle?: string;
  className?: string;
};

export function WeChatCallTopBar({
  onMinimize,
  minimizeLabel,
  rightAction,
  centerTitle,
  centerSubtitle,
  className,
}: WeChatCallTopBarProps) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3 px-4 py-3", className)}
    >
      <button
        type="button"
        onClick={onMinimize}
        aria-label={minimizeLabel}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--surface-card)]/12 text-[color:var(--text-on-brand)] transition active:bg-[color:var(--surface-card)]/20"
      >
        <ChevronDown size={22} />
      </button>

      {centerTitle ? (
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[length:var(--text-title)] font-medium text-[color:var(--text-on-brand)]">
            {centerTitle}
          </div>
          {centerSubtitle ? (
            <div className="mt-0.5 truncate text-[length:var(--text-caption)] text-[color:var(--text-on-brand)]/55">
              {centerSubtitle}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex min-w-10 justify-end">{rightAction}</div>
    </div>
  );
}
