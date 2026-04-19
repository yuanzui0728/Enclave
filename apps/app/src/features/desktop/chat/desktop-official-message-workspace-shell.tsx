import { parseDesktopOfficialMessageRouteHash } from "./desktop-official-message-route-state";
import { DesktopChatWorkspace } from "./desktop-chat-workspace";

type DesktopOfficialMessageWorkspaceShellProps = {
  hash: string;
  selectedServiceAccountId?: string;
  selectedSpecialView?: "subscription-inbox";
};

export function DesktopOfficialMessageWorkspaceShell({
  hash,
  selectedServiceAccountId,
  selectedSpecialView,
}: DesktopOfficialMessageWorkspaceShellProps) {
  const routeState = parseDesktopOfficialMessageRouteHash(hash);

  return (
    <DesktopChatWorkspace
      selectedServiceAccountId={selectedServiceAccountId}
      selectedSpecialView={selectedSpecialView}
      selectedOfficialArticleId={routeState.articleId}
    />
  );
}
