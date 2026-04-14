import { type MouseEvent as ReactMouseEvent } from "react";
import type { OfficialAccountServiceConversationSummary } from "@yinjie/contracts";
import { AvatarChip } from "./avatar-chip";
import { OfficialMessageEntryRow } from "./official-message-entry-row";
import { formatConversationTimestamp } from "../lib/format";

export function OfficialServiceConversationCard({
  conversation,
  active = false,
  variant = "mobile",
  contextMenuOpen = false,
  onClick,
  onContextMenu,
  className,
}: {
  conversation: OfficialAccountServiceConversationSummary;
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
      title={conversation.account.name}
      preview={conversation.preview ?? "打开服务号消息"}
      timestampLabel={formatConversationTimestamp(conversation.lastDeliveredAt)}
      unreadCount={conversation.unreadCount}
      muted={conversation.isMuted}
      leading={
        <AvatarChip
          name={conversation.account.name}
          src={conversation.account.avatar}
          size={variant === "desktop" ? "md" : "wechat"}
        />
      }
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={className}
    />
  );
}
