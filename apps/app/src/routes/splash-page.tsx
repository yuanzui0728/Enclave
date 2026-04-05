import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AppPage, AppSection, InlineNotice } from "@yinjie/ui";
import { isDesktopRuntimeAvailable } from "../lib/desktop-runtime";
import { useSessionStore } from "../store/session-store";

export function SplashPage() {
  const navigate = useNavigate();
  const token = useSessionStore((state) => state.token);
  const onboardingCompleted = useSessionStore((state) => state.onboardingCompleted);
  const desktopSetupCompleted = useSessionStore((state) => state.desktopSetupCompleted);
  const desktopAvailable = isDesktopRuntimeAvailable();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!token) {
        navigate({ to: desktopAvailable && !desktopSetupCompleted ? "/setup" : "/onboarding", replace: true });
        return;
      }

      navigate({ to: onboardingCompleted ? "/tabs/chat" : "/onboarding", replace: true });
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [desktopAvailable, desktopSetupCompleted, navigate, onboardingCompleted, token]);

  return (
    <AppPage className="flex min-h-full flex-col items-center justify-center py-10 text-center">
      <AppSection className="w-full max-w-sm bg-[linear-gradient(135deg,rgba(249,115,22,0.2),rgba(255,255,255,0.04)_42%,rgba(15,23,42,0.28)_100%)] px-8 py-10">
        <div className="text-[11px] uppercase tracking-[0.42em] text-[color:var(--text-muted)]">在现实之外</div>
        <h1 className="mt-5 text-4xl font-semibold tracking-[0.22em] text-white">隐界</h1>
        <p className="mt-5 text-sm leading-8 text-[color:var(--text-secondary)]">你推开的不是一个工具，而是另一个仍在运转的世界。</p>
        <InlineNotice className="mt-6 text-left" tone="info">
          {desktopAvailable && !desktopSetupCompleted ? "桌面首启会先检查本地运行时与 provider 状态。" : "正在整理进入路径。"}
        </InlineNotice>
      </AppSection>
    </AppPage>
  );
}
