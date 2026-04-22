import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Coffee,
  Dumbbell,
  MapPin,
  Trees,
} from "lucide-react";
import { triggerSceneFriendRequest } from "@yinjie/contracts";
import {
  InlineNotice,
  cn,
} from "@yinjie/ui";
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
import { parseMobileDiscoverToolRouteState } from "../features/discover/mobile-discover-tool-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const scenes = [
  {
    id: "coffee_shop",
    label: "咖啡馆",
    description: "适合轻松开场和日常寒暄。",
    icon: Coffee,
  },
  {
    id: "gym",
    label: "健身房",
    description: "更容易遇到直接一点的搭话。",
    icon: Dumbbell,
  },
  {
    id: "library",
    label: "图书馆",
    description: "偏安静，也更像慢热型相遇。",
    icon: BookOpen,
  },
  {
    id: "park",
    label: "公园",
    description: "随机性更强，气氛也更开放。",
    icon: Trees,
  },
];

export function DiscoverScenePage() {
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
        description="桌面端的场景相遇入口已经收口到桌面发现工作区，先回到主发现页。"
        loadingLabel="正在切换到桌面发现页..."
      />
    );
  }

  return <MobileDiscoverScenePage />;
}

function MobileDiscoverScenePage() {
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

  const sceneMutation = useMutation({
    mutationFn: async (scene: string) => {
      const result = await triggerSceneFriendRequest(
        {
          scene,
        },
        baseUrl,
      );
      return { request: result, scene };
    },
    onSuccess: ({ request, scene }) => {
      const sceneLabel = scenes.find((item) => item.id === scene)?.label ?? scene;

      if (!request) {
        setMessage(`${sceneLabel} 里暂时没有新的相遇。`);
        return;
      }

      setMessage(`${request.characterName} 在${sceneLabel}里注意到了你：${request.greeting ?? "对你产生了兴趣。"}`);
      void queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
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
      title="场景相遇"
      subtitle="换一个地点，换一种相遇方式"
      shareTitle="场景相遇"
      shareSummary="选择一个地点，触发不同角色的靠近方式，并把结果直接写进新的好友申请。"
      heroTitle="选择一个地点"
      heroDescription="不同地点会触发不同角色的靠近方式，并把结果写进新的好友申请。"
      heroVisual={<MapPin size={28} />}
      notice={
        message ? (
          <InlineNotice
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone="info"
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
        <div className="grid grid-cols-2 gap-0.5 bg-black/5 p-0.5">
          {scenes.map((scene) => {
            const Icon = scene.icon;
            const busy =
              sceneMutation.isPending && sceneMutation.variables === scene.id;

            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => sceneMutation.mutate(scene.id)}
                disabled={sceneMutation.isPending}
                className={cn(
                  "bg-white px-4 py-4 text-left transition active:bg-[#f5f5f5]",
                  sceneMutation.isPending && !busy && "opacity-60",
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(7,193,96,0.12)] text-[#07c160]">
                  <Icon size={18} />
                </div>
                <div className="mt-3 text-[15px] font-medium text-[#111827]">
                  {busy ? `正在前往${scene.label}...` : scene.label}
                </div>
                <div className="mt-1 text-[12px] leading-5 text-[#8c8c8c]">
                  {scene.description}
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t border-black/5 px-4 py-3 text-[13px] leading-6 text-[#6b7280]">
          点一下就触发，不做多层确认，结果会直接回到好友申请里。
        </div>
      </section>

      {sceneMutation.isError && sceneMutation.error instanceof Error ? (
        <InlineNotice
          className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          tone="danger"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1">{sceneMutation.error.message}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              {sceneMutation.variables ? (
                <button
                  type="button"
                  onClick={() => sceneMutation.mutate(sceneMutation.variables)}
                  className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  重试
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleErrorNoticeBack}
                className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
              >
                {routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
                  ? "返回上一页"
                  : "回发现页"}
              </button>
            </div>
          </div>
        </InlineNotice>
      ) : null}
    </MobileDiscoverToolShell>
  );
}
