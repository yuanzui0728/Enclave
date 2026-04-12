import type { OfficialAccountServiceConversationSummary } from "@yinjie/contracts";
import { cn } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { formatConversationTimestamp } from "../lib/format";

export function OfficialServiceConversationCard({
  conversation,
  active = false,
  variant = "mobile",
  onClick,
}: {
  conversation: OfficialAccountServiceConversationSummary;
  active?: boolean;
  variant?: "mobile" | "desktop";
  onClick?: () => void;
}) {
  const isDesktop = variant === "desktop";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        isDesktop
          ? "flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]"
          : "flex w-full items-center gap-3 px-4 py-3.5 text-left",
        isDesktop
          ? active
            ? "border border-[rgba(7,193,96,0.16)] bg-[linear-gradient(135deg,rgba(244,252,247,0.98),rgba(255,255,255,0.94))] shadow-[0_8px_18px_rgba(7,193,96,0.08)]"
            : "border border-transparent hover:bg-[color:var(--surface-card-hover)]"
          : active
            ? "bg-[rgba(7,193,96,0.08)]"
            : "bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <AvatarChip
        name={conversation.account.name}
        src={conversation.account.avatar}
        size="wechat"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
              {conversation.account.name}
            </div>
            <div className="mt-1 truncate text-[13px] text-[color:var(--text-muted)]">
              {conversation.preview ?? "打开服务号消息"}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="text-[11px] text-[color:var(--text-dim)]">
              {formatConversationTimestamp(conversation.lastDeliveredAt)}
            </div>
            {conversation.unreadCount > 0 ? (
              <div className="min-w-5 rounded-full bg-[var(--brand-gradient)] px-1.5 py-0.5 text-center text-[11px] leading-none text-white shadow-[var(--shadow-soft)]">
                {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
