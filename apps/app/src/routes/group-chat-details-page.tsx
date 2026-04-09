import { useNavigate, useParams } from "@tanstack/react-router";
import { InlineNotice } from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";

export function GroupChatDetailsPage() {
  const { groupId } = useParams({ from: "/group/$groupId/details" });
  const navigate = useNavigate();

  return (
    <ChatDetailsShell
      title="群聊信息"
      subtitle={`群 ${groupId}`}
      onBack={() => {
        void navigate({ to: "/group/$groupId", params: { groupId } });
      }}
    >
      <div className="px-3">
        <InlineNotice tone="muted">群聊详情页骨架已接入，下一步补成员宫格、基础信息区和开关区。</InlineNotice>
      </div>
    </ChatDetailsShell>
  );
}
