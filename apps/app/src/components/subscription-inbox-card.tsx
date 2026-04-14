import { type MouseEvent as ReactMouseEvent } from "react";
import type { OfficialAccountSubscriptionInboxSummary } from "@yinjie/contracts";
import { Newspaper } from "lucide-react";
import { cn } from "@yinjie/ui";
import { OfficialMessageEntryRow } from "./official-message-entry-row";
import { formatConversationTimestamp } from "../lib/format";

export function SubscriptionInboxCard({
  summary,
  active = false,
  variant = "mobile",
  contextMenuOpen = false,
  onClick,
  onContextMenu,
  className,
}: {
  summary: OfficialAccountSubscriptionInboxSummary;
  active?: boolean;
  variant?: "mobile" | "desktop";
  contextMenuOpen?: boolean;
  onClick?: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  return (
    <OfficialMessageEntryRow
      variant={variant}
      active={active}
      contextMenuOpen={contextMenuOpen}
      title="订阅号消息"
      preview={summary.preview ?? "查看已关注订阅号的最近推送"}
      timestampLabel={formatConversationTimestamp(summary.lastDeliveredAt)}
      unreadCount={summary.unreadCount}
      leading={
        <div
          className={cn(
            "flex shrink-0 items-center justify-center text-white shadow-[var(--shadow-soft)]",
            variant === "desktop"
              ? "h-11 w-11 rounded-[12px] bg-[linear-gradient(135deg,#f59e0b,#f97316)]"
              : "h-12 w-12 rounded-xl bg-[linear-gradient(135deg,#f59e0b,#f97316)]",
          )}
        >
          <Newspaper size={variant === "desktop" ? 18 : 20} />
        </div>
      }
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={className}
    />
  );
}
