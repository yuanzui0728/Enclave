import { InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { formatTimestamp } from "../lib/format";

type ChatRenderableMessage = {
  id: string;
  senderType: string;
  senderName?: string | null;
  type?: string | null;
  text: string;
  createdAt: string;
};

type ChatMessageListProps = {
  messages: ChatRenderableMessage[];
  groupMode?: boolean;
  emptyState?: React.ReactNode;
};

export function ChatMessageList({ messages, groupMode = false, emptyState }: ChatMessageListProps) {
  if (!messages.length) {
    return emptyState ?? null;
  }

  return (
    <>
      {messages.map((message) => {
        const isUser = message.senderType === "user";
        const isSystem = message.type === "system" || message.senderType === "system";

        if (isSystem) {
          return (
            <InlineNotice key={message.id} className="mx-auto max-w-[84%] text-center text-xs" tone="muted">
              {message.text}
            </InlineNotice>
          );
        }

        return (
          <div key={message.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
            {!isUser ? <AvatarChip name={message.senderName} size="sm" /> : null}
            <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
              {!isUser && groupMode ? (
                <div className="mb-1 text-[11px] text-[color:var(--text-muted)]">{message.senderName}</div>
              ) : null}
              <div
                className={`rounded-[22px] px-4 py-3 text-sm leading-7 ${
                  isUser
                    ? "bg-[linear-gradient(135deg,rgba(249,115,22,0.95),rgba(251,191,36,0.9))] text-white shadow-[var(--shadow-soft)]"
                    : "border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
                }`}
              >
                {message.text}
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">{formatTimestamp(message.createdAt)}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}
