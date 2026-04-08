import { useNavigate } from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
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
        badge="世界入口"
        title="先确认你要进入哪一个世界"
        description="桌面端同样保持 remote-connected 模式，但入口页会用宽布局展示连接状态、云世界和本地世界选择。"
        aside={
          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-5">
              <div className="text-sm font-medium text-white">桌面首版策略</div>
              <div className="mt-2 text-sm leading-7 text-slate-200/80">
                保持现有连接逻辑不变，只把入口体验改成桌面化编排。
              </div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-5">
              <div className="text-sm font-medium text-white">进入后</div>
              <div className="mt-2 text-sm leading-7 text-slate-200/80">
                登录后的消息页会直接进入三栏聊天工作台。
              </div>
            </div>
          </div>
        }
      >
        <div className="mx-auto w-full max-w-5xl">
          <MobileSetupPanel token={token} onContinue={continueIntoWorld} />
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
