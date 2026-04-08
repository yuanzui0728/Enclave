import { useNavigate, useParams } from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import { ConversationThreadPanel } from "../features/chat/conversation-thread-panel";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function ChatRoomPage() {
  const { conversationId } = useParams({ from: "/chat/$conversationId" });
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopChatWorkspace selectedConversationId={conversationId} />;
  }

  return (
    <AppPage className="px-0 pb-0">
      <ConversationThreadPanel
        conversationId={conversationId}
        onBack={() => {
          void navigate({ to: "/tabs/chat" });
        }}
      />
    </AppPage>
  );
}
