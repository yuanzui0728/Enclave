import { InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { formatMessageTimestamp } from "../lib/format";

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
    <div className="space-y-4">
      {messages.map((message) => {
        const isUser = message.senderType === "user";
        const isSystem = message.type === "system" || message.senderType === "system";

        if (isSystem) {
          return (
            <InlineNotice
              key={message.id}
              className="mx-auto max-w-[84%] rounded-full border border-white/70 bg-white/82 px-3 py-1.5 text-center text-[11px] text-[color:var(--text-muted)] shadow-[var(--shadow-soft)]"
              tone="muted"
            >
              {message.text}
            </InlineNotice>
          );
        }

        return (
          <div key={message.id} className="space-y-1.5">
            <div className="text-center text-[11px] text-[color:var(--text-dim)]">{formatMessageTimestamp(message.createdAt)}</div>
            <div className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser ? <AvatarChip name={message.senderName} size="wechat" /> : null}
              <div className={`flex max-w-[78%] flex-col ${isUser ? "items-end" : "items-start"}`}>
                {!isUser && groupMode ? (
                  <div className="mb-1 px-1 text-[11px] text-[color:var(--text-muted)]">{message.senderName}</div>
                ) : null}
                <div
                  className={`rounded-[20px] px-3.5 py-2.5 text-[15px] leading-6 shadow-[var(--shadow-soft)] ${
                    isUser
                      ? "bg-[linear-gradient(135deg,rgba(255,205,132,0.98),rgba(255,154,92,0.94))] text-[color:var(--text-primary)]"
                      : "border border-white/80 bg-white/88 text-[color:var(--text-primary)]"
                  }`}
                >
                  {message.text}
                </div>
              </div>
              {isUser ? <AvatarChip name="我" size="wechat" /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
