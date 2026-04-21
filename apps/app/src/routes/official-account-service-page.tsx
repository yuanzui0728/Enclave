import { Suspense, lazy, useMemo } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import { RouteRedirectState } from "../components/route-redirect-state";
import { OfficialAccountServiceThread } from "../features/official-accounts/service/official-account-service-thread";
import { parseMobileOfficialRouteState } from "../features/official-accounts/mobile-official-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";

const DesktopChatWorkspace = lazy(async () => {
  const mod =
    await import("../features/official-accounts/official-message-workspace-shell");
  return { default: mod.OfficialMessageWorkspaceShell };
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
  const routeState = useMemo(() => parseMobileOfficialRouteState(hash), [hash]);

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在打开桌面服务号会话"
            description="正在载入桌面消息工作区中的服务号会话。"
            loadingLabel="载入桌面服务号会话..."
          />
        }
      >
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
            if (
              routeState.returnPath &&
              !isDesktopOnlyPath(routeState.returnPath)
            ) {
              void navigate({
                to: routeState.returnPath,
                ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
              });
              return;
            }

            void navigate({ to: "/tabs/chat" });
          });
        }}
      />
    </AppPage>
  );
}
