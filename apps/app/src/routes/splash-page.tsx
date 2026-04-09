import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getWorldOwner } from "@yinjie/contracts";
import { AppPage, AppSection, InlineNotice } from "@yinjie/ui";
import { requiresRemoteServiceConfiguration } from "../lib/runtime-config";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { resolveAppRuntimeContext } from "../runtime/platform";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function SplashPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const runtimeContext = resolveAppRuntimeContext(runtimeConfig.appPlatform);
      if (runtimeContext.hostRole === "host" || requiresRemoteServiceConfiguration()) {
        void navigate({ to: "/setup", replace: true });
        return;
      }

      void getWorldOwner(runtimeConfig.apiBaseUrl)
        .then((owner) => {
          hydrateOwner(owner);
          void navigate({
            to: owner.onboardingCompleted ? "/tabs/chat" : "/onboarding",
            replace: true,
          });
        })
        .catch(() => {
          void navigate({ to: "/setup", replace: true });
        });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [hydrateOwner, navigate, runtimeConfig.apiBaseUrl, runtimeConfig.appPlatform, runtimeConfig.worldAccessMode]);

  return (
    <AppPage className="flex min-h-full flex-col items-center justify-center py-10 text-center">
      <AppSection className="w-full max-w-md bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,246,232,0.94)_42%,rgba(240,251,245,0.96))] px-8 py-10">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[rgba(255,179,71,0.24)] bg-white/78 px-3 py-1 text-[11px] uppercase tracking-[0.34em] text-[color:var(--brand-secondary)]">
          Beyond Reality
        </div>
        <div className="mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-[28px] bg-[var(--brand-gradient)] text-2xl font-semibold text-white shadow-[var(--shadow-lift)]">
          隐界
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">欢迎回到你的世界</h1>
        <p className="mt-4 text-sm leading-8 text-[color:var(--text-secondary)]">
          这里不是一串账号信息，而是一整片会继续生长、继续回应你的个人世界。
        </p>

        <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          <div className="rounded-[22px] bg-white/82 px-4 py-3 shadow-[var(--shadow-soft)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Step 1</div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">确认入口</div>
          </div>
          <div className="rounded-[22px] bg-white/82 px-4 py-3 shadow-[var(--shadow-soft)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Step 2</div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">同步世界主人</div>
          </div>
          <div className="rounded-[22px] bg-white/82 px-4 py-3 shadow-[var(--shadow-soft)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Step 3</div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">继续开启对话</div>
          </div>
        </div>

        <InlineNotice className="mt-6 text-left" tone="info">
          正在整理这次进入世界的路径，马上带你回到上次停留的地方。
        </InlineNotice>
      </AppSection>
    </AppPage>
  );
}
