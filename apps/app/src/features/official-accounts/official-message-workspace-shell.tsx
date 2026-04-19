import { DesktopChatWorkspace } from "../chat/chat-workspace-shell";
import { parseDesktopOfficialMessageRouteHash } from "./official-message-route-state";

export type OfficialMessageWorkspaceShellProps = {
  hash: string;
  selectedServiceAccountId?: string;
  selectedSpecialView?: "subscription-inbox";
};

export function OfficialMessageWorkspaceShell({
  hash,
  selectedServiceAccountId,
  selectedSpecialView,
}: OfficialMessageWorkspaceShellProps) {
  const routeState = parseDesktopOfficialMessageRouteHash(hash);

  return (
    <DesktopChatWorkspace
      selectedServiceAccountId={selectedServiceAccountId}
      selectedSpecialView={selectedSpecialView}
      selectedOfficialArticleId={routeState.articleId}
    />
  );
}
