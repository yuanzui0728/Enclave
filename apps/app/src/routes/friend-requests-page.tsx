import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookUser } from "lucide-react";
import {
  acceptFriendRequest,
  declineFriendRequest,
  getFriendRequests,
} from "@yinjie/contracts";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildDesktopContactsRouteHash } from "../features/desktop/contacts/desktop-contacts-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function FriendRequestsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [successNotice, setSuccessNotice] = useState("");

  const requestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
  });

  const acceptMutation = useMutation({
    mutationFn: (requestId: string) => acceptFriendRequest(requestId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("已通过好友申请。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-friends-quick-start", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-friends", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const declineMutation = useMutation({
    mutationFn: (requestId: string) => declineFriendRequest(requestId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("好友请求已处理。");
      await queryClient.invalidateQueries({
        queryKey: ["app-friend-requests", baseUrl],
      });
    },
  });

  useEffect(() => {
    setSuccessNotice("");
  }, [baseUrl]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({ pane: "new-friends" }),
      replace: true,
    });
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return null;
  }

  return (
    <AppPage className="space-y-0 bg-[#f5f5f5] px-0 py-0">
      <TabPageTopBar
        title="新的朋友"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/contacts" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-secondary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-secondary)] active:bg-black/[0.05]"
            onClick={() => {
              void navigate({ to: "/contacts/world-characters" });
            }}
            aria-label="浏览世界角色"
          >
            <BookUser size={17} />
          </Button>
        }
      />

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {requestsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileFriendRequestsStatusCard
              badge="读取中"
              title="正在读取好友请求"
              description="稍等一下，正在同步新的好友申请。"
              tone="loading"
            />
          </div>
        ) : null}
        {requestsQuery.isError && requestsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileFriendRequestsStatusCard
              badge="读取失败"
              title="新的朋友暂时不可用"
              description={requestsQuery.error.message}
              tone="danger"
            />
          </div>
        ) : null}
        {successNotice ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="success"
              className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              {successNotice}
            </InlineNotice>
          </div>
        ) : null}

        {(requestsQuery.data ?? []).length ? (
          <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {(requestsQuery.data ?? []).map((request, index) => (
              <div
                key={request.id}
                className={cn(
                  "px-4 py-3",
                  index > 0
                    ? "border-t border-[color:var(--border-faint)]"
                    : undefined,
                )}
              >
                <div className="flex items-start gap-3">
                  <AvatarChip
                    name={request.characterName}
                    src={request.characterAvatar}
                    size="wechat"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] text-[color:var(--text-primary)]">
                          {request.characterName}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                          {getFriendRequestSourceLabel(request.triggerScene)}
                        </div>
                      </div>
                      <div className="shrink-0 text-[10px] text-[color:var(--text-dim)]">
                        {formatFriendRequestDate(request.createdAt)}
                      </div>
                    </div>

                    <div className="mt-2 rounded-[12px] bg-[color:var(--surface-card-hover)] px-3 py-2 text-[13px] leading-5 text-[color:var(--text-secondary)]">
                      {request.greeting || "想认识你。"}
                    </div>

                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      <Button
                        disabled={
                          acceptMutation.isPending || declineMutation.isPending
                        }
                        onClick={() => declineMutation.mutate(request.id)}
                        variant="secondary"
                        size="sm"
                        className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[#f5f7f7]"
                      >
                        {declineMutation.isPending &&
                        declineMutation.variables === request.id
                          ? "处理中..."
                          : "拒绝"}
                      </Button>
                      <Button
                        disabled={
                          acceptMutation.isPending || declineMutation.isPending
                        }
                        onClick={() => acceptMutation.mutate(request.id)}
                        variant="primary"
                        size="sm"
                        className="h-8 rounded-[10px] bg-[#07c160] px-3 text-[12px] text-white shadow-none hover:bg-[#06ad56]"
                      >
                        {acceptMutation.isPending &&
                        acceptMutation.variables === request.id
                          ? "接受中..."
                          : "接受"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {acceptMutation.isError && acceptMutation.error instanceof Error ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="danger"
              className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              {acceptMutation.error.message}
            </InlineNotice>
          </div>
        ) : null}
        {declineMutation.isError && declineMutation.error instanceof Error ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="danger"
              className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              {declineMutation.error.message}
            </InlineNotice>
          </div>
        ) : null}

        {!requestsQuery.isLoading &&
        !requestsQuery.isError &&
        !requestsQuery.data?.length ? (
          <div className="px-4 pt-4">
            <MobileFriendRequestsStatusCard
              badge="新的朋友"
              title="暂时没有新的好友请求"
              description="去发现页摇一摇，或等待场景触发新的相遇。"
            />
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function getFriendRequestSourceLabel(triggerScene?: string) {
  if (!triggerScene) {
    return "新的朋友";
  }

  if (triggerScene === "shake") {
    return "来自摇一摇";
  }

  return `来自 ${triggerScene}`;
}

function formatFriendRequestDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();
  const sameDay = sameMonth && date.getDate() === now.getDate();

  if (sameDay) {
    return "今天";
  }

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date).replace(/\//g, "-");
}

function MobileFriendRequestsStatusCard({
  badge,
  title,
  description,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
    </section>
  );
}
