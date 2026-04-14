import { BookOpenText } from "lucide-react";
import { OfficialMessageEntryRow } from "./official-message-entry-row";
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
    <OfficialMessageEntryRow
      variant="desktop"
      active={active}
      title="公众号"
      preview={preview}
      timestampLabel={formatConversationTimestamp(lastActivityAt)}
      unreadCount={unreadCount}
      leading={
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,#10b981,#0f766e)] text-white shadow-[var(--shadow-soft)]">
          <BookOpenText size={18} />
        </div>
      }
      onClick={onClick}
    />
  );
}
