import { type MouseEvent as ReactMouseEvent } from "react";
import type { OfficialAccountSubscriptionInboxSummary } from "@yinjie/contracts";
import { Newspaper } from "lucide-react";
import { cn } from "@yinjie/ui";
import { formatConversationTimestamp } from "../lib/format";

export function SubscriptionInboxCard({
  summary,
  active = false,
  variant = "mobile",
  onClick,
  onContextMenu,
}: {
  summary: OfficialAccountSubscriptionInboxSummary;
  active?: boolean;
  variant?: "mobile" | "desktop";
  onClick?: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const isDesktop = variant === "desktop";

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        isDesktop
          ? "flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]"
          : "flex w-full items-center gap-2.5 px-4 py-3 text-left",
        isDesktop
          ? active
            ? "border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[0_8px_18px_rgba(7,193,96,0.06)]"
            : "border border-transparent hover:bg-[color:var(--surface-card-hover)]"
          : active
            ? "bg-[rgba(7,193,96,0.07)]"
            : "bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div className="flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,#f59e0b,#f97316)] text-white shadow-[var(--shadow-soft)]">
        <Newspaper size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-normal text-[color:var(--text-primary)]">
              订阅号消息
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[color:var(--text-muted)]">
              {summary.preview ?? "查看已关注订阅号的最近推送"}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="text-[10px] text-[color:var(--text-dim)]">
              {formatConversationTimestamp(summary.lastDeliveredAt)}
            </div>
            {summary.unreadCount > 0 ? (
              <div className="min-w-5 rounded-full bg-[#fa5151] px-1.5 py-0.5 text-center text-[10px] leading-none text-white shadow-[0_4px_12px_rgba(250,81,81,0.18)]">
                {summary.unreadCount > 99 ? "99+" : summary.unreadCount}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
