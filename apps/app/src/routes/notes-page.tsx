import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AppPage, Button, LoadingBlock } from "@yinjie/ui";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function NotesPage() {
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
      hash: normalizedHash || undefined,
      replace: true,
    });
  }, [hash, isDesktopLayout, navigate]);

  if (!isDesktopLayout) {
    return (
      <AppPage className="flex h-full items-center justify-center bg-[color:var(--bg-app)] px-5">
        <div className="w-full max-w-md rounded-[22px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">
            笔记当前仅提供桌面布局
          </div>
          <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            微信式笔记编辑器目前只在 Web
            端桌面布局和桌面壳内启用，移动端先回到消息页继续使用。
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate({ to: "/tabs/chat" })}
            className="mt-6 w-full rounded-xl bg-[color:var(--brand-primary)] text-white hover:opacity-95"
          >
            返回消息
          </Button>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="flex h-full items-center justify-center bg-[color:var(--bg-app)] px-5">
      <div className="w-full max-w-md rounded-[22px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
        <div className="text-lg font-semibold text-[color:var(--text-primary)]">
          正在切换到收藏
        </div>
        <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          笔记已经并入收藏，这个兼容入口会自动带你回到收藏里的笔记视图。
        </div>
        <div className="mt-6">
          <LoadingBlock label="正在打开收藏笔记..." />
        </div>
      </div>
    </AppPage>
  );
}
