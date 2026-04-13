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
      <AvatarChip
        name={conversation.account.name}
        src={conversation.account.avatar}
        size="wechat"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-normal text-[color:var(--text-primary)]">
              {conversation.account.name}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[color:var(--text-muted)]">
              {conversation.preview ?? "打开服务号消息"}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="text-[10px] text-[color:var(--text-dim)]">
              {formatConversationTimestamp(conversation.lastDeliveredAt)}
            </div>
            {conversation.unreadCount > 0 ? (
              <div className="min-w-5 rounded-full bg-[color:var(--brand-primary)] [background-image:var(--brand-gradient)] px-1.5 py-0.5 text-center text-[10px] leading-none text-white shadow-[0_4px_12px_rgba(7,193,96,0.14)]">
                {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
