import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Compass, Sparkles } from "lucide-react";
import { keepShakeSession, shake } from "@yinjie/contracts";
import {
  Button,
  InlineNotice,
} from "@yinjie/ui";
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
import { parseMobileDiscoverToolRouteState } from "../features/discover/mobile-discover-tool-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DiscoverEncounterPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({ to: "/tabs/discover", replace: true });
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title="正在切换到桌面发现页"
        description="桌面端的发现入口已经收口到桌面发现工作区，先回到主发现页。"
        loadingLabel="正在切换到桌面发现页..."
      />
    );
  }

  return <MobileDiscoverEncounterPage />;
}

function MobileDiscoverEncounterPage() {
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [message, setMessage] = useState("");
  const routeState = useMemo(
    () => parseMobileDiscoverToolRouteState(hash),
    [hash],
  );

  const shakeMutation = useMutation({
    mutationFn: async () => {
      const preview = await shake(undefined, baseUrl);
      if (!preview) {
        return null;
      }

      await keepShakeSession(preview.id, baseUrl);
      return preview;
    },
    onSuccess: (result) => {
      if (!result) {
        setMessage("附近暂时没有新的相遇。");
        return;
      }

      setMessage(`${result.character.name} 已加入通讯录：${result.greeting}`);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl] }),
      ]);
    },
  });

  useEffect(() => {
    setMessage("");
  }, [baseUrl]);

  function navigateToRouteStateReturn() {
    if (
      !routeState.returnPath ||
      isDesktopOnlyPath(routeState.returnPath)
    ) {
      return false;
    }

    void navigate({
      to: routeState.returnPath,
      ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
    });
    return true;
  }

  const handleErrorNoticeBack = () => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({ to: "/tabs/discover" });
  };

  return (
    <MobileDiscoverToolShell
      title="摇一摇"
      subtitle="随机遇见新的世界居民"
      shareTitle="摇一摇"
      shareSummary="随机遇见新的世界居民，点一下就会尝试安排一次新的相遇，并直接保留到你的通讯录。"
      heroTitle="随机相遇"
      heroDescription="每次摇一摇都会先生成一个新的相遇结果；当前页面会直接保留这次结果，并把对方加入你的通讯录。"
      heroVisual={<Compass size={28} />}
      heroAction={
        <Button
          onClick={() => shakeMutation.mutate()}
          disabled={shakeMutation.isPending}
          variant="primary"
          className="h-12 w-full rounded-full bg-[#07c160] text-white hover:bg-[#06ad56]"
        >
          <Sparkles size={16} />
          {shakeMutation.isPending ? "正在寻找..." : "摇一摇"}
        </Button>
      }
      notice={
        message ? (
          <InlineNotice
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone={message.includes("好友申请") ? "success" : "info"}
          >
            {message}
          </InlineNotice>
        ) : null
      }
      onBack={() =>
        navigateBackOrFallback(() => {
          if (navigateToRouteStateReturn()) {
            return;
          }

          void navigate({ to: "/tabs/discover" });
        })
      }
    >
      <section className="overflow-hidden rounded-[16px] border border-black/5 bg-white">
        <div className="grid grid-cols-2 divide-x divide-black/5">
          <div className="px-4 py-4">
            <div className="text-[12px] text-[#8c8c8c]">匹配方式</div>
            <div className="mt-1 text-[15px] font-medium text-[#111827]">
              随机安排
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="text-[12px] text-[#8c8c8c]">结果处理</div>
            <div className="mt-1 text-[15px] font-medium text-[#111827]">
              直接保留
            </div>
          </div>
        </div>
        <div className="border-t border-black/5 px-4 py-3 text-[13px] leading-6 text-[#6b7280]">
          当前先采用轻入口方案：点一下就完成一次相遇并保留结果，后续再补更细的预览与确认流程。
        </div>
      </section>

      {shakeMutation.isError && shakeMutation.error instanceof Error ? (
        <InlineNotice
          className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          tone="danger"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1">{shakeMutation.error.message}</span>
            <button
              type="button"
              onClick={handleErrorNoticeBack}
              className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
            >
              {routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
                ? "返回上一页"
                : "回发现页"}
            </button>
          </div>
        </InlineNotice>
      ) : null}
    </MobileDiscoverToolShell>
  );
}
