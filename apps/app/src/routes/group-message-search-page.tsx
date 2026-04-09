import { useNavigate, useParams } from "@tanstack/react-router";
import { InlineNotice } from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";

export function GroupMessageSearchPage() {
  const { groupId } = useParams({ from: "/group/$groupId/search" });
  const navigate = useNavigate();

  return (
    <ChatDetailsShell
      title="查找聊天记录"
      onBack={() => {
        void navigate({ to: "/group/$groupId/details", params: { groupId } });
      }}
    >
      <div className="px-3">
        <InlineNotice tone="muted">群聊记录搜索页骨架已接入，下一步补搜索框和群消息结果列表。</InlineNotice>
      </div>
    </ChatDetailsShell>
  );
}
