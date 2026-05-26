import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, LoadingBlock } from "@yinjie/ui";
import { buildDesktopFavoritesWorkspaceRouteHash } from "../features/favorites/favorites-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { MobileNotesPage } from "./mobile-notes-page";

export function NotesPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
    void navigate({
      to: "/tabs/favorites",
      hash:
        normalizedHash ||
        buildDesktopFavoritesWorkspaceRouteHash({
          category: "notes",
        }) ||
        undefined,
      replace: true,
    });
  }, [hash, isDesktopLayout, navigate]);

  if (!isDesktopLayout) {
    return <MobileNotesPage />;
  }

  return (
    <AppPage className="flex h-full items-center justify-center bg-[color:var(--bg-app)] px-5">
      <div className="w-full max-w-md rounded-[24px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
        <div className="text-lg font-semibold text-[color:var(--text-primary)]">
          {t(msg`正在切换到收藏`)}
        </div>
        <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          {t(msg`笔记已经并入收藏，这个兼容入口会自动带你回到收藏里的笔记视图。`)}
        </div>
        <div className="mt-6">
          <LoadingBlock label={t(msg`正在打开收藏笔记...`)} />
        </div>
      </div>
    </AppPage>
  );
}
