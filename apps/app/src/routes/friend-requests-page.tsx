import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { acceptFriendRequest, declineFriendRequest, getFriendRequests } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function FriendRequestsPage() {
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
      setSuccessNotice("好友请求已处理。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends-quick-start", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-group-friends", baseUrl] }),
      ]);
    },
  });

  const declineMutation = useMutation({
    mutationFn: (requestId: string) => declineFriendRequest(requestId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("好友请求已处理。");
      await queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
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

  return (
    <AppPage className="space-y-0 bg-[#f5f5f5] px-0 py-0">
      <TabPageTopBar
        title="新的朋友"
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 py-3 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/contacts" });
              })
            }
            variant="ghost"
            size="icon"
            className="text-[color:var(--text-secondary)]"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {requestsQuery.isLoading ? (
          <div className="px-4 pt-4">
            <LoadingBlock label="正在读取好友请求..." />
          </div>
        ) : null}
        {requestsQuery.isError && requestsQuery.error instanceof Error ? (
          <div className="px-4 pt-4">
            <ErrorBlock message={requestsQuery.error.message} />
          </div>
        ) : null}
        {successNotice ? (
          <div className="px-4 pt-4">
            <InlineNotice tone="success">{successNotice}</InlineNotice>
          </div>
        ) : null}

        {(requestsQuery.data ?? []).length ? (
          <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {(requestsQuery.data ?? []).map((request, index) => (
              <div
                key={request.id}
                className={cn(
                  "px-4 py-3.5",
                  index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
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
                        <div className="truncate text-[16px] text-[color:var(--text-primary)]">
                          {request.characterName}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[color:var(--text-muted)]">
                          {getFriendRequestSourceLabel(request.triggerScene)}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-[color:var(--text-dim)]">
                        {formatFriendRequestDate(request.createdAt)}
                      </div>
                    </div>

                    <div className="mt-2 rounded-[14px] bg-[color:var(--surface-card-hover)] px-3 py-2.5 text-[14px] leading-6 text-[color:var(--text-secondary)]">
                      {request.greeting || "想认识你。"}
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      <Button
                        disabled={acceptMutation.isPending || declineMutation.isPending}
                        onClick={() => declineMutation.mutate(request.id)}
                        variant="secondary"
                        size="sm"
                        className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[#f5f7f7]"
                      >
                        {declineMutation.isPending && declineMutation.variables === request.id
                          ? "处理中..."
                          : "拒绝"}
                      </Button>
                      <Button
                        disabled={acceptMutation.isPending || declineMutation.isPending}
                        onClick={() => acceptMutation.mutate(request.id)}
                        variant="primary"
                        size="sm"
                        className="rounded-[10px] bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
                      >
                        {acceptMutation.isPending && acceptMutation.variables === request.id
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
          <div className="px-4 pt-4">
            <ErrorBlock message={acceptMutation.error.message} />
          </div>
        ) : null}
        {declineMutation.isError && declineMutation.error instanceof Error ? (
          <div className="px-4 pt-4">
            <ErrorBlock message={declineMutation.error.message} />
          </div>
        ) : null}

        {!requestsQuery.isLoading && !requestsQuery.isError && !requestsQuery.data?.length ? (
          <div className="px-4 pt-6">
            <EmptyState title="暂时没有新的好友请求" description="去发现页摇一摇，或等待场景触发新的相遇。" />
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
