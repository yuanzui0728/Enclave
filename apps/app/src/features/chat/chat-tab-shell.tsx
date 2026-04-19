import { parseDesktopChatRouteHash } from "../desktop/chat/desktop-chat-route-state";
import { DesktopChatWorkspace } from "../desktop/chat/desktop-chat-workspace";

export type ChatTabShellProps = {
  hash: string;
};

export function ChatTabShell({ hash }: ChatTabShellProps) {
  const routeState = parseDesktopChatRouteHash(hash);

  return (
    <DesktopChatWorkspace
      selectedConversationId={
        routeState.officialView ? undefined : routeState.conversationId
      }
      highlightedMessageId={
        routeState.officialView ? undefined : routeState.messageId
      }
      selectedServiceAccountId={
        routeState.officialView === "service-account"
          ? routeState.accountId
          : undefined
      }
      selectedOfficialArticleId={routeState.articleId}
      selectedOfficialDisplayMode={routeState.officialMode}
      selectedSpecialView={
        routeState.officialView === "subscription-inbox"
          ? "subscription-inbox"
          : routeState.officialView === "official-accounts"
            ? "official-accounts"
            : undefined
      }
      selectedOfficialAccountId={
        routeState.officialView === "official-accounts"
          ? routeState.accountId
          : undefined
      }
    />
  );
}
