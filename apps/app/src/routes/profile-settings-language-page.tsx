import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import {
  SUPPORTED_LOCALE_LABELS,
  SUPPORTED_LOCALES,
  useAppLocale,
  useRuntimeTranslator,
} from "@yinjie/i18n";
import { AppPage, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";

export function ProfileSettingsLanguagePage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const { isSwitchingLocale, requestedLocale, setLocale } = useAppLocale();

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/settings", replace: true });
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
        title={t(msg`多语言`)}
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

      <div
        // 跟 profile-settings-page 桌面端 tab/legal radiogroup（line 449/621）
        // 对齐：移动端这条 list 也是单选语义，加 role=radiogroup + aria-label，
        // SR/键盘用户才能感知到「这是单选」而不是一组独立 button。
        role="radiogroup"
        aria-label={t(msg`界面语言`)}
        data-i18n-skip="true"
        className={cn(
          "mt-1 divide-y divide-[color:var(--border-faint)] border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
          isSwitchingLocale && "pointer-events-none opacity-60",
        )}
      >
        {SUPPORTED_LOCALES.map((locale) => {
          const selected = locale === requestedLocale;
          return (
            <button
              key={locale}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setLocale(locale)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:bg-black/[0.04]"
            >
              <span className="text-[15px] text-[color:var(--text-primary)]">
                {SUPPORTED_LOCALE_LABELS[locale]}
              </span>
              {selected ? (
                <Check size={17} className="text-[#07c160]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {isSwitchingLocale ? (
        <div className="px-4 pt-2 text-[11px] leading-5 text-[color:var(--text-muted)]">
          <Trans>正在切换语言...</Trans>
        </div>
      ) : (
        <div className="px-4 pt-3 text-[11px] leading-5 text-[color:var(--text-muted)]">
          {t(msg`语言偏好保存在当前设备并立即生效，同时决定好友回复使用的语言。`)}
        </div>
      )}
    </AppPage>
  );
}
