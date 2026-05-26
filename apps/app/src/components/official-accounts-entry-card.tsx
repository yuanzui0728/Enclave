import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { BookOpenText } from "lucide-react";
import { OfficialMessageEntryRow } from "./official-message-entry-row";
import { formatConversationTimestamp } from "../lib/format";

const t = translateRuntimeMessage;

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
      title={t(msg`公众号`)}
      preview={preview}
      timestampLabel={formatConversationTimestamp(lastActivityAt)}
      unreadCount={unreadCount}
      leading={
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,#facc15,#f59e0b)] text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)]">
          <BookOpenText size={18} />
        </div>
      }
      onClick={onClick}
    />
  );
}
