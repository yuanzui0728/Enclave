import { BookOpenText } from "lucide-react";
import { cn } from "@yinjie/ui";
import { formatConversationTimestamp } from "../lib/format";

export function OfficialAccountsEntryCard({
  unreadCount,
  lastActivityAt,
  preview,
  active = false,
  onClick,
}: {
  unreadCount: number;
  lastActivityAt?: string;
  preview: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[0_8px_18px_rgba(7,193,96,0.06)]"
          : "border border-transparent hover:bg-[color:var(--surface-card-hover)]",
      )}
    >
      <div className="flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,#10b981,#0f766e)] text-white shadow-[var(--shadow-soft)]">
        <BookOpenText size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-normal text-[color:var(--text-primary)]">
              公众号
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[color:var(--text-muted)]">
              {preview}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="text-[10px] text-[color:var(--text-dim)]">
              {formatConversationTimestamp(lastActivityAt)}
            </div>
            {unreadCount > 0 ? (
              <div className="min-w-5 rounded-full bg-[#fa5151] px-1.5 py-0.5 text-center text-[10px] leading-none text-white shadow-[0_4px_12px_rgba(250,81,81,0.18)]">
                {unreadCount > 99 ? "99+" : unreadCount}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
