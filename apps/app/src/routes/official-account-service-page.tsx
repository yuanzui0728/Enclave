import { Suspense, lazy } from "react";
import {
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import { OfficialAccountServiceThread } from "../features/official-accounts/service/official-account-service-thread";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";

const DesktopChatWorkspace = lazy(async () => {
  const mod = await import(
    "../features/desktop/chat/desktop-official-message-workspace-shell"
  );
  return { default: mod.DesktopOfficialMessageWorkspaceShell };
});

export function OfficialAccountServicePage() {
  const { accountId } = useParams({
    from: "/official-accounts/service/$accountId",
  });
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });

  if (isDesktopLayout) {
    return (
      <Suspense fallback={null}>
        <DesktopChatWorkspace
          hash={hash}
          selectedServiceAccountId={accountId}
        />
      </Suspense>
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
