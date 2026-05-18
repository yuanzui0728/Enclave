import { useMemo } from "react";
import { parseDesktopChatRouteHash } from "./chat-route-state";
import { DesktopChatWorkspace } from "./chat-workspace-shell";

export type ChatTabShellProps = {
  hash: string;
};

export function ChatTabShell({ hash }: ChatTabShellProps) {
  // hash 只有真改时才重新解析；上面父组件 useRouterState 一旦其它字段
  // 触发 re-render 也会把同一份 hash 再传一遍，避免每次都 URLSearchParams。
  const routeState = useMemo(
    () => parseDesktopChatRouteHash(hash),
    [hash],
  );

  return (
    <DesktopChatWorkspace
      selectedConversationId={
        routeState.officialView ? undefined : routeState.conversationId
      }
      highlightedMessageId={
        routeState.officialView ? undefined : routeState.messageId
      }
      selectedSidePanelMode={
        routeState.officialView ? undefined : routeState.panel
      }
      selectedCallAction={
        routeState.officialView ? undefined : routeState.callAction
      }
      selectedDetailsAction={
        routeState.officialView ? undefined : routeState.detailsAction
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
