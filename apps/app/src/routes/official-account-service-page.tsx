import { useMemo } from "react";
import {
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { parseDesktopOfficialMessageRouteHash } from "../features/desktop/chat/desktop-official-message-route-state";
import { OfficialAccountServiceThread } from "../features/official-accounts/service/official-account-service-thread";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";

export function OfficialAccountServicePage() {
  const { accountId } = useParams({
    from: "/official-accounts/service/$accountId",
  });
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const routeState = useMemo(
    () => parseDesktopOfficialMessageRouteHash(hash),
    [hash],
  );

  if (isDesktopLayout) {
    return (
      <DesktopChatWorkspace
        selectedServiceAccountId={accountId}
        selectedOfficialArticleId={routeState.articleId}
      />
    );
  }

  return (
    <AppPage className="flex h-full min-h-0 flex-col space-y-0 px-0 py-0">
      <OfficialAccountServiceThread
        accountId={accountId}
        onBack={() => {
          navigateBackOrFallback(() => {
            void navigate({ to: "/tabs/chat" });
          });
        }}
      />
    </AppPage>
  );
}
