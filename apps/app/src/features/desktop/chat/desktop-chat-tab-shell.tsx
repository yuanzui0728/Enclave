import { parseDesktopChatRouteHash } from "./desktop-chat-route-state";
import { DesktopChatWorkspace } from "./desktop-chat-workspace";

type DesktopChatTabShellProps = {
  hash: string;
};

export function DesktopChatTabShell({ hash }: DesktopChatTabShellProps) {
  const routeState = parseDesktopChatRouteHash(hash);

  return (
    <DesktopChatWorkspace
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
