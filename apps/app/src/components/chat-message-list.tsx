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
  variant?: "mobile" | "desktop";
  emptyState?: React.ReactNode;
};

export function ChatMessageList({
  messages,
  groupMode = false,
  variant = "mobile",
  emptyState,
}: ChatMessageListProps) {
  const isDesktop = variant === "desktop";

  if (!messages.length) {
    return emptyState ?? null;
  }

  return (
    <div className={isDesktop ? "space-y-5" : "space-y-4"}>
      {messages.map((message) => {
        const isUser = message.senderType === "user";
        const isSystem = message.type === "system" || message.senderType === "system";

        if (isSystem) {
          return (
            <InlineNotice
              key={message.id}
              className={`mx-auto max-w-[84%] rounded-full px-3 py-1.5 text-center text-[11px] text-[color:var(--text-muted)] ${
                isDesktop
                  ? "border border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.86)]"
                  : "border border-white/70 bg-white/82 shadow-[var(--shadow-soft)]"
              }`}
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
                  className={`rounded-[18px] px-3.5 py-2.5 text-[15px] leading-6 ${
                    isUser
                      ? isDesktop
                        ? "bg-[rgba(149,236,105,0.98)] text-[color:#1f2329]"
                        : "bg-[linear-gradient(135deg,rgba(251,191,36,0.96),rgba(249,115,22,0.90))] text-white [animation:bubble-in_220ms_cubic-bezier(0.22,1,0.36,1)] shadow-[var(--shadow-soft)]"
                      : isDesktop
                        ? "border border-[rgba(15,23,42,0.08)] bg-white text-[color:var(--text-primary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                        : "border border-[rgba(255,240,220,0.80)] bg-[rgba(255,253,248,0.92)] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
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
