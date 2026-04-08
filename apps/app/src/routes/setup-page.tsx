import { useNavigate } from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import { DesktopSetupPanel } from "../features/desktop/setup/desktop-setup-panel";
import { MobileSetupPanel } from "../features/mobile/setup/mobile-setup-panel";
import { resolveAppRuntimeContext } from "../runtime/platform";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useSessionStore } from "../store/session-store";

export function SetupPage() {
  const navigate = useNavigate();
  const token = useSessionStore((state) => state.token);
  const runtimeConfig = useAppRuntimeConfig();
  const runtimeContext = resolveAppRuntimeContext(runtimeConfig.appPlatform);

  function continueIntoWorld() {
    void navigate({
      to: token ? "/tabs/chat" : "/onboarding",
      replace: true,
    });
  }

  return (
    <AppPage className="pb-8">
      {runtimeContext.deploymentMode === "local-hosted" ? (
        <DesktopSetupPanel token={token} onContinue={continueIntoWorld} />
      ) : (
        <MobileSetupPanel token={token} onContinue={continueIntoWorld} />
      )}
    </AppPage>
  );
}
