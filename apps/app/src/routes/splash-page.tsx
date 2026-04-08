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

      void getWorldOwner(runtimeConfig.apiBaseUrl ?? "default")
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
      <AppSection className="w-full max-w-sm bg-[linear-gradient(135deg,rgba(249,115,22,0.2),rgba(255,255,255,0.04)_42%,rgba(15,23,42,0.28)_100%)] px-8 py-10">
        <div className="text-[11px] uppercase tracking-[0.42em] text-[color:var(--text-muted)]">
          Beyond Reality
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-[0.22em] text-white">隐界</h1>
        <p className="mt-5 text-sm leading-8 text-[color:var(--text-secondary)]">
          你连接的不是一个账号，而是一整个持续运转的个人世界。
        </p>
        <InlineNotice className="mt-6 text-left" tone="info">
          正在整理进入这片世界的路径。
        </InlineNotice>
      </AppSection>
    </AppPage>
  );
}
