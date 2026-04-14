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
          : "flex w-full items-center gap-2.5 px-4 py-2.5 text-left",
        isDesktop
          ? active
            ? "border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[0_8px_18px_rgba(7,193,96,0.06)]"
            : "border border-transparent hover:bg-[color:var(--surface-card-hover)]"
          : active
            ? "bg-[rgba(7,193,96,0.07)]"
            : "bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center text-white shadow-[var(--shadow-soft)]",
          isDesktop
            ? "h-10.5 w-10.5 rounded-[12px] bg-[linear-gradient(135deg,#f59e0b,#f97316)]"
            : "h-12 w-12 rounded-xl bg-[linear-gradient(135deg,#f59e0b,#f97316)]",
        )}
      >
        <Newspaper size={isDesktop ? 18 : 20} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "truncate font-normal text-[color:var(--text-primary)]",
                isDesktop ? "text-[15px]" : "text-[14px] leading-[1.25]",
              )}
            >
              订阅号消息
            </div>
            <div
              className={cn(
                "mt-0.5 truncate text-[color:var(--text-muted)]",
                isDesktop ? "text-[12px]" : "text-[11px] leading-[1.35]",
              )}
            >
              {summary.preview ?? "查看已关注订阅号的最近推送"}
            </div>
          </div>
          <div
            className={cn(
              "flex shrink-0 flex-col items-end",
              isDesktop ? "gap-1" : "gap-0.5",
            )}
          >
            <div
              className={cn(
                "text-[color:var(--text-dim)]",
                isDesktop ? "text-[10px]" : "text-[9px]",
              )}
            >
              {formatConversationTimestamp(summary.lastDeliveredAt)}
            </div>
            {summary.unreadCount > 0 ? (
              <div
                className={cn(
                  "flex min-h-[18px] items-center justify-center rounded-full bg-[#fa5151] px-1 text-center leading-none text-white shadow-[0_4px_12px_rgba(250,81,81,0.18)]",
                  isDesktop
                    ? "min-w-[20px] text-[10px]"
                    : "min-w-[18px] text-[9px]",
                  summary.unreadCount > 9
                    ? isDesktop
                      ? "min-w-[24px]"
                      : "min-w-[22px]"
                    : undefined,
                )}
              >
                {summary.unreadCount > 99 ? "99+" : summary.unreadCount}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
