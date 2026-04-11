import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { triggerSceneFriendRequest } from "@yinjie/contracts";
import {
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const scenes = [
  { id: "coffee_shop", label: "咖啡馆" },
  { id: "gym", label: "健身房" },
  { id: "library", label: "图书馆" },
  { id: "park", label: "公园" },
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
      <AppPage className="px-6 py-6">
        <LoadingBlock label="正在切换到桌面发现页..." />
      </AppPage>
    );
  }

  return <MobileDiscoverScenePage />;
}

function MobileDiscoverScenePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [message, setMessage] = useState("");

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

  return (
    <AppPage>
      <TabPageTopBar
        title="场景相遇"
        titleAlign="center"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/discover" });
              })
            }
            variant="ghost"
            size="icon"
            className="border border-white/70 bg-white/82 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <AppSection className="space-y-4 bg-[color:var(--brand-soft)]">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">选择一个地点</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">不同地点会触发不同角色的靠近方式，并写入新的好友申请。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {scenes.map((scene) => (
            <Button
              key={scene.id}
              onClick={() => sceneMutation.mutate(scene.id)}
              disabled={sceneMutation.isPending}
              variant="secondary"
              size="sm"
            >
              {sceneMutation.isPending && sceneMutation.variables === scene.id ? `正在前往${scene.label}...` : scene.label}
            </Button>
          ))}
        </div>
        {message ? <InlineNotice tone="info">{message}</InlineNotice> : null}
        {sceneMutation.isError && sceneMutation.error instanceof Error ? <ErrorBlock message={sceneMutation.error.message} /> : null}
      </AppSection>
    </AppPage>
  );
}
