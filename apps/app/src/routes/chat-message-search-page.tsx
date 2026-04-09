import { useNavigate, useParams } from "@tanstack/react-router";
import { InlineNotice } from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";

export function ChatMessageSearchPage() {
  const { conversationId } = useParams({ from: "/chat/$conversationId/search" });
  const navigate = useNavigate();

  return (
    <ChatDetailsShell
      title="查找聊天记录"
      onBack={() => {
        void navigate({ to: "/chat/$conversationId/details", params: { conversationId } });
      }}
    >
      <div className="px-3">
        <InlineNotice tone="muted">聊天记录搜索页骨架已接入，下一步补搜索框和消息结果列表。</InlineNotice>
      </div>
    </ChatDetailsShell>
  );
}
