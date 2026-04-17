import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Compass, RefreshCcw, Sparkles, UserPlus } from "lucide-react";
import {
  dismissShakeSession,
  getActiveShakeSession,
  keepShakeSession,
  shake,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DiscoverEncounterPage() {
  return <MobileDiscoverEncounterPage />;
}

function MobileDiscoverEncounterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<
    Awaited<ReturnType<typeof getActiveShakeSession>>
  >(null);

  const activeSessionQuery = useQuery({
    queryKey: ["app-shake-session", baseUrl],
    queryFn: () => getActiveShakeSession(baseUrl),
  });

  const shakeMutation = useMutation({
    mutationFn: (payload?: { mode?: "new" | "reroll" }) =>
      shake(payload, baseUrl),
    onSuccess: async (result) => {
      if (!result) {
        setMessage("附近暂时没有新的相遇。");
        return;
      }

      setSession(result);
      setMessage("已为你生成一个新的相遇对象。");
      await queryClient.invalidateQueries({
        queryKey: ["app-shake-session", baseUrl],
      });
    },
  });

  const keepMutation = useMutation({
    mutationFn: (sessionId: string) => keepShakeSession(sessionId, baseUrl),
    onSuccess: async (result) => {
      setSession(null);
      setMessage(`${result.characterName} 已加入你的通讯录。`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-shake-session", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-friends-quick-start", baseUrl],
        }),
      ]);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: ({
      sessionId,
      reason,
    }: {
      sessionId: string;
      reason?: string | null;
    }) => dismissShakeSession(sessionId, { reason }, baseUrl),
    onSuccess: async () => {
      setSession(null);
      await queryClient.invalidateQueries({
        queryKey: ["app-shake-session", baseUrl],
      });
    },
  });

  async function handleBack() {
    if (session?.id) {
      try {
        await dismissMutation.mutateAsync({
          sessionId: session.id,
          reason: "page_exit",
        });
      } catch {
        // keep back navigation responsive even if dismiss fails
      }
    }

    await navigateBackOrFallback(() => {
      void navigate({ to: "/tabs/discover" });
    });
  }

  async function handleReroll() {
    await shakeMutation.mutateAsync({ mode: "reroll" });
  }

  useEffect(() => {
    setMessage("");
    setSession(null);
  }, [baseUrl]);

  useEffect(() => {
    if (activeSessionQuery.data === undefined) {
      return;
    }
    setSession(activeSessionQuery.data);
  }, [activeSessionQuery.data]);

  const expertDomains = session?.character.expertDomains ?? [];

  return (
    <MobileDiscoverToolShell
      title="摇一摇"
      subtitle="根据近期行为即时遇见新的世界居民"
      shareTitle="摇一摇"
      shareSummary="根据你最近的状态生成一次新的相遇，先预览，再决定要不要把这个人留下。"
      heroTitle={session ? "这次遇见的人" : "随机相遇"}
      heroDescription={
        session
          ? "这次先给你一个临时预览。只有你点击添加，这个角色才会真正进入你的世界。"
          : "每次摇一摇都会基于你最近的行为线索生成一个新的相遇对象。"
      }
      heroVisual={<Compass size={28} />}
      heroAction={
        session ? (
          <div className="grid w-full grid-cols-2 gap-3">
            <Button
              onClick={() => keepMutation.mutate(session.id)}
              disabled={keepMutation.isPending || dismissMutation.isPending}
              variant="primary"
              className="h-12 rounded-full bg-[#07c160] text-white hover:bg-[#06ad56]"
            >
              <UserPlus size={16} />
              {keepMutation.isPending ? "正在保留..." : "添加"}
            </Button>
            <Button
              onClick={() => void handleReroll()}
              disabled={shakeMutation.isPending || dismissMutation.isPending}
              variant="secondary"
              className="h-12 rounded-full"
            >
              <RefreshCcw size={16} />
              {shakeMutation.isPending || dismissMutation.isPending
                ? "正在换一个..."
                : "换一个"}
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => shakeMutation.mutate({ mode: "new" })}
            disabled={shakeMutation.isPending || activeSessionQuery.isLoading}
            variant="primary"
            className="h-12 w-full rounded-full bg-[#07c160] text-white hover:bg-[#06ad56]"
          >
            <Sparkles size={16} />
            {shakeMutation.isPending
              ? "正在寻找..."
              : activeSessionQuery.isLoading
                ? "正在恢复..."
                : "摇一摇"}
          </Button>
        )
      }
      notice={
        message ? (
          <InlineNotice
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone={message.includes("加入") ? "success" : "info"}
          >
            {message}
          </InlineNotice>
        ) : null
      }
      onBack={() => void handleBack()}
    >
      <section className="overflow-hidden rounded-[16px] border border-black/5 bg-white">
        <div className="grid grid-cols-2 divide-x divide-black/5">
          <div className="px-4 py-4">
            <div className="text-[12px] text-[#8c8c8c]">匹配方式</div>
            <div className="mt-1 text-[15px] font-medium text-[#111827]">
              行为驱动
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="text-[12px] text-[#8c8c8c]">结果处理</div>
            <div className="mt-1 text-[15px] font-medium text-[#111827]">
              先预览再保留
            </div>
          </div>
        </div>
        <div className="border-t border-black/5 px-4 py-3 text-[13px] leading-6 text-[#6b7280]">
          每次摇一摇都会结合你最近的聊天、互动和浏览行为生成一次新的相遇。你不点“添加”，这个人就不会进入你的世界。
        </div>
      </section>

      {session ? (
        <section className="space-y-3 overflow-hidden rounded-[16px] border border-[#07c160]/10 bg-white">
          <div className="flex items-start gap-3 px-4 py-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f3fbf6] text-[26px]">
              {session.character.avatar || "🙂"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-semibold text-[#111827]">
                {session.character.name}
              </div>
              <div className="mt-1 text-[13px] leading-6 text-[#4b5563]">
                {session.character.relationship}
              </div>
              {expertDomains.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {expertDomains.map((domain) => (
                    <span
                      key={domain}
                      className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] text-[#6b7280]"
                    >
                      {domain}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="border-t border-black/5 px-4 py-3">
            <div className="text-[12px] text-[#8c8c8c]">第一次打招呼</div>
            <div className="mt-2 rounded-[12px] bg-[#f8fafc] px-3 py-3 text-[14px] leading-6 text-[#111827]">
              {session.greeting}
            </div>
          </div>
          <div className="border-t border-black/5 px-4 py-3">
            <div className="text-[12px] text-[#8c8c8c]">为什么会遇见这个人</div>
            <div className="mt-2 text-[14px] leading-6 text-[#4b5563]">
              {session.matchReason}
            </div>
          </div>
        </section>
      ) : null}

      {(shakeMutation.isError || keepMutation.isError || dismissMutation.isError) &&
      (shakeMutation.error instanceof Error ||
        keepMutation.error instanceof Error ||
        dismissMutation.error instanceof Error) ? (
        <InlineNotice
          className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          tone="danger"
        >
          {shakeMutation.error instanceof Error
            ? shakeMutation.error.message
            : keepMutation.error instanceof Error
              ? keepMutation.error.message
              : dismissMutation.error instanceof Error
                ? dismissMutation.error.message
                : "摇一摇操作失败。"}
        </InlineNotice>
      ) : null}

      {activeSessionQuery.isLoading && !session ? (
        <AppPage className="px-0 py-0">
          <LoadingBlock label="正在恢复上一次摇一摇结果..." />
        </AppPage>
      ) : null}
    </MobileDiscoverToolShell>
  );
}
