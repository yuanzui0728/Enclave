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
    <AppPage className="flex h-full min-h-0 flex-col space-y-0 bg-[linear-gradient(180deg,#f8fcf8,#f2f8f5)] px-0 py-0">
      <div className="h-full min-h-0 flex-1">
        <ConversationThreadPanel
          conversationId={conversationId}
          onBack={() => {
            void navigate({ to: "/tabs/chat" });
          }}
        />
      </div>
    </AppPage>
  );
}
