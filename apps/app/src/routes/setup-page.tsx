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

  function continueIntoWorld(ownerReady: boolean) {
    void navigate({
      to: ownerReady ? "/tabs/chat" : "/onboarding",
      replace: true,
    });
  }

  if (isDesktopLayout) {
    return (
      <DesktopEntryShell
        badge="世界入口"
        title="先决定这台设备要进入哪一片世界"
        description="无论接入官方云世界还是你自己的实例，这一步都会先把入口整理好，再继续回到聊天与发现。"
        aside={
          <div className="space-y-3">
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">远程连接，不降级体验</div>
              <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                桌面端依然保持 remote-connected 模式，但入口体验会直接按桌面场景组织，不再像手机卡片一样拥挤。
              </div>
            </div>
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">确认后直接继续</div>
              <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                入口确认完成后，可以直接回到桌面聊天工作台或继续完成世界主人的首次初始化。
              </div>
            </div>
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">整个世界只服务你</div>
              <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                这是一个单世界主人的实例，所有入口、资料和后续体验都会围绕你的节奏来展开。
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

