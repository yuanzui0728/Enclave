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
              className="mx-auto max-w-[84%] rounded-xl border-none bg-[#d9d9d9] px-3 py-1.5 text-center text-[11px] text-[#6e6e73]"
              tone="muted"
            >
              {message.text}
            </InlineNotice>
          );
        }

        return (
          <div key={message.id} className="space-y-1.5">
            <div className="text-center text-[11px] text-[#9a9a9a]">{formatMessageTimestamp(message.createdAt)}</div>
            <div className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser ? <AvatarChip name={message.senderName} size="wechat" /> : null}
              <div className={`flex max-w-[78%] flex-col ${isUser ? "items-end" : "items-start"}`}>
                {!isUser && groupMode ? (
                  <div className="mb-1 px-1 text-[11px] text-[#8e8e93]">{message.senderName}</div>
                ) : null}
                <div
                  className={`rounded-[6px] px-3.5 py-2.5 text-[15px] leading-6 shadow-[0_1px_1px_rgba(0,0,0,0.04)] ${
                    isUser
                      ? "bg-[#95ec69] text-[#111111]"
                      : "bg-white text-[#111111]"
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
