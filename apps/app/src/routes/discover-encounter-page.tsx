import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Compass, Sparkles } from "lucide-react";
import { sendFriendRequest, shake } from "@yinjie/contracts";
import {
  AppPage,
  Button,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
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
      <AppPage className="px-6 py-6">
        <LoadingBlock label="正在切换到桌面发现页..." />
      </AppPage>
    );
  }

  return <MobileDiscoverEncounterPage />;
}

function MobileDiscoverEncounterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [message, setMessage] = useState("");

  const shakeMutation = useMutation({
    mutationFn: async () => {
      const result = await shake(baseUrl);
      if (!result) {
        return null;
      }

      await sendFriendRequest(
        {
          characterId: result.character.id,
          greeting: result.greeting,
        },
        baseUrl,
      );

      return result;
    },
    onSuccess: (result) => {
      if (!result) {
        setMessage("附近暂时没有新的相遇。");
        return;
      }

      setMessage(`${result.character.name} 向你发来了好友申请：${result.greeting}`);
      void queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
    },
  });

  useEffect(() => {
    setMessage("");
  }, [baseUrl]);

  return (
    <MobileDiscoverToolShell
      title="摇一摇"
      subtitle="随机遇见新的世界居民"
      shareTitle="摇一摇"
      shareSummary="随机遇见新的世界居民，点一下就会尝试安排一次新的相遇，并自动写入好友申请。"
      heroTitle="随机相遇"
      heroDescription="每次摇一摇都会尝试为你安排一次新的相遇，并自动写入一条好友申请。"
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
              自动申请
            </div>
          </div>
        </div>
        <div className="border-t border-black/5 px-4 py-3 text-[13px] leading-6 text-[#6b7280]">
          更像微信里“摇一摇”的轻入口：点一下就出结果，不要求你先填资料或做多步确认。
        </div>
      </section>

      {shakeMutation.isError && shakeMutation.error instanceof Error ? (
        <InlineNotice
          className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          tone="danger"
        >
          {shakeMutation.error.message}
        </InlineNotice>
      ) : null}
    </MobileDiscoverToolShell>
  );
}
