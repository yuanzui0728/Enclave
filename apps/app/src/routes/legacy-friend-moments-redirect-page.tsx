import { useEffect } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { AppPage, LoadingBlock } from "@yinjie/ui";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function LegacyFriendMomentsRedirectPage() {
  const { characterId } = useParams({
    strict: false,
  }) as {
    characterId?: string;
  };
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const isDesktopLayout = useDesktopLayout();

  useEffect(() => {
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if (!characterId) {
      void navigate({
        to: isDesktopLayout ? "/tabs/moments" : "/discover/moments",
        replace: true,
      });
      return;
    }

    if (isDesktopLayout) {
      void navigate({
        to: "/desktop/friend-moments/$characterId",
        params: { characterId },
        ...(normalizedHash ? { hash: normalizedHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({
      to: "/friend-moments/$characterId",
      params: { characterId },
      ...(normalizedHash ? { hash: normalizedHash } : {}),
      replace: true,
    });
  }, [characterId, hash, isDesktopLayout, navigate]);

  return (
    <AppPage className="flex min-h-full items-center justify-center bg-[#f2f2f2] px-4 py-8">
      <LoadingBlock
        label="正在打开角色朋友圈..."
        className="w-full max-w-[360px] rounded-[24px] border-[color:var(--border-faint)] bg-white py-8 shadow-[var(--shadow-section)]"
      />
    </AppPage>
  );
}
