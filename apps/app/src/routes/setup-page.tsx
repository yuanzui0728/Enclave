import { useNavigate } from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import { DesktopSetupPanel } from "../features/desktop/desktop-setup-panel";
import { MobileSetupPanel } from "../features/mobile/setup/mobile-setup-panel";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useSessionStore } from "../store/session-store";

export function SetupPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const token = useSessionStore((state) => state.token);

  function continueIntoWorld() {
    void navigate({
      to: token ? "/tabs/chat" : "/onboarding",
      replace: true,
    });
  }

  if (isDesktopLayout) {
    return (
      <DesktopEntryShell
        badge="World Entry"
        title="Choose which world this desktop should enter."
        description="The desktop shell stays remote-connected, but the entry flow now uses a dedicated wide layout for local and cloud world setup."
        aside={
          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-5">
              <div className="text-sm font-medium text-white">Desktop-first entry</div>
              <div className="mt-2 text-sm leading-7 text-slate-200/80">
                The connection model stays the same, but the setup surface is no longer a mobile card dropped into a desktop shell.
              </div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-5">
              <div className="text-sm font-medium text-white">After entry</div>
              <div className="mt-2 text-sm leading-7 text-slate-200/80">
                Once setup is complete, the app can continue into the desktop chat workspace instead of the phone-style list page.
              </div>
            </div>
          </div>
        }
      >
        <div className="mx-auto w-full max-w-6xl">
          <DesktopSetupPanel token={token} onContinue={continueIntoWorld} />
        </div>
      </DesktopEntryShell>
    );
  }

  return (
    <AppPage className="pb-8">
      <MobileSetupPanel token={token} onContinue={continueIntoWorld} />
    </AppPage>
  );
}
