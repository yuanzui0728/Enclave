import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, QrCode, Sparkles } from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";

export function ProfileInfoPlaceholderPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const kind = pathname.endsWith("/qr") ? "qr" : "more";

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/settings", replace: true });
    }
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return null;
  }

  const title = kind === "qr" ? t(msg`我的二维码名片`) : t(msg`更多信息`);
  const Icon = kind === "qr" ? QrCode : Sparkles;
  const tip =
    kind === "qr"
      ? t(msg`二维码名片功能开发中，敬请期待。`)
      : t(msg`更多资料字段开发中，敬请期待。`);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={title}
        titleAlign="center"
        leftActions={
          <button
            type="button"
            onClick={() =>
              navigateBackOrFallback(
                () => navigate({ to: "/profile/info", replace: true }),
                "/profile/info",
              )
            }
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
      />

      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-dim)] shadow-[var(--shadow-soft)]">
          <Icon size={36} strokeWidth={1.5} />
        </div>
        <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
          {t(msg`敬请期待`)}
        </div>
        <p className="max-w-[18rem] text-[12px] leading-5 text-[color:var(--text-muted)]">
          {tip}
        </p>
      </div>
    </AppPage>
  );
}
