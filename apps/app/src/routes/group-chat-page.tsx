import {
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import GroupChatThreadPanel from "../features/chat/group-chat-thread-panel-view";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function GroupChatPage() {
  const { groupId } = useParams({ from: "/group/$groupId" });
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const highlightedMessageId = parseHighlightedMessageId(hash);

  if (isDesktopLayout) {
    return (
      <DesktopChatWorkspace
        selectedConversationId={groupId}
        highlightedMessageId={highlightedMessageId}
      />
    );
  }

  return (
    <AppPage className="flex h-full min-h-0 flex-col space-y-0 bg-[linear-gradient(180deg,#f8fcf8,#f2f8f5)] px-0 py-0">
      <div className="h-full min-h-0 flex-1">
        <GroupChatThreadPanel
          groupId={groupId}
          highlightedMessageId={highlightedMessageId}
          onBack={() => {
            void navigate({ to: "/tabs/chat" });
          }}
        />
      </div>
    </AppPage>
  );
}

function parseHighlightedMessageId(hash: string) {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = "chat-message-";
  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : undefined;
}
