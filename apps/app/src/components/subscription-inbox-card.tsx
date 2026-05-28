import { type MouseEvent as ReactMouseEvent } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { OfficialAccountSubscriptionInboxSummary } from "@yinjie/contracts";
import { Newspaper } from "lucide-react";
import { cn } from "@yinjie/ui";
import { OfficialMessageEntryRow } from "./official-message-entry-row";
import { formatConversationTimestamp } from "../lib/format";

const t = translateRuntimeMessage;

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
      title={t(msg`订阅号消息`)}
      preview={summary.preview ?? t(msg`查看已关注订阅号的最近推送`)}
      timestampLabel={formatConversationTimestamp(summary.lastDeliveredAt)}
      unreadCount={summary.unreadCount}
      leading={
        <div
          className={cn(
            "flex shrink-0 items-center justify-center text-white shadow-[var(--shadow-soft)]",
            variant === "desktop"
              ? "h-11 w-11 rounded-[12px] bg-[linear-gradient(135deg,var(--brand-primary),var(--brand-primary))]"
              : "h-12 w-12 rounded-xl bg-[linear-gradient(135deg,var(--brand-primary),var(--brand-primary))]",
          )}
        >
          {/* 走查 R1（新一轮）：Newspaper 是装饰图标，row title「订阅号消
              息」已是 accessible name；Lucide 默认不挂 role/aria，部分 AT
              会把 inline SVG 念成「newspaper」覆盖标题。aria-hidden 隔离掉
              避免重复念。同 chat-list quick menu 5 个 icon 已经按这条规约。 */}
          <Newspaper size={variant === "desktop" ? 18 : 20} aria-hidden="true" />
        </div>
      }
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={className}
    />
  );
}
