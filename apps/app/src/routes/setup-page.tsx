import { useNavigate } from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import { DesktopSetupPanel } from "../features/desktop/desktop-setup-panel";
import { MobileSetupPanel } from "../features/mobile/setup/mobile-setup-panel";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function SetupPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hasOwner = Boolean(useWorldOwnerStore((state) => state.id));

  function continueIntoWorld() {
    void navigate({
      to: hasOwner ? "/tabs/chat" : "/onboarding",
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
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-5">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">Desktop-first entry</div>
              <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                The connection model stays the same, but the setup surface is no longer a mobile card dropped into a desktop shell.
              </div>
            </div>
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-5">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">After entry</div>
              <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                Once setup is complete, the app can continue into the desktop chat workspace instead of the phone-style list page.
              </div>
            </div>
          </div>
        }
      >
        <div className="mx-auto w-full max-w-6xl">
          <DesktopSetupPanel hasOwner={hasOwner} onContinue={continueIntoWorld} />
        </div>
      </DesktopEntryShell>
    );
  }

  return (
    <AppPage className="pb-8">
      <MobileSetupPanel hasOwner={hasOwner} onContinue={continueIntoWorld} />
    </AppPage>
  );
}

