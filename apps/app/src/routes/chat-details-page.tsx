import { useNavigate, useParams } from "@tanstack/react-router";
import { InlineNotice } from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";

export function ChatDetailsPage() {
  const { conversationId } = useParams({ from: "/chat/$conversationId/details" });
  const navigate = useNavigate();

  return (
    <ChatDetailsShell
      title="聊天信息"
      subtitle={`会话 ${conversationId}`}
      onBack={() => {
        void navigate({ to: "/chat/$conversationId", params: { conversationId } });
      }}
    >
      <div className="px-3">
        <InlineNotice tone="muted">聊天详情页骨架已接入，下一步补齐成员宫格、开关区和危险操作区。</InlineNotice>
      </div>
    </ChatDetailsShell>
  );
}
