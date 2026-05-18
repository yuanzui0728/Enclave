import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { AccountSecurityPanel } from "../features/account-security/account-security-panel";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";

export function ProfileSettingsAccountSecurityPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();

  // 桌面端这页用不上——桌面在 /desktop/settings 里走 tab 切换；移动端用户切到桌面布局时
  // 直接重定向回桌面设置入口，避免出现一条独立的"账号安全"页跟 tab 体验冲突。
  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({
        to: "/desktop/settings",
        replace: true,
      });
    }
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return null;
  }

  const goBack = () =>
    navigateBackOrFallback(
      () => navigate({ to: "/profile/settings", replace: true }),
      "/profile/settings",
    );

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`账号安全`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
      />

      <div className="mt-3 px-4 pb-6">
        <AccountSecurityPanel />
      </div>
    </AppPage>
  );
}
