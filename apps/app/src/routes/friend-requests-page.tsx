import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { acceptFriendRequest, declineFriendRequest, getFriendRequests } from "@yinjie/contracts";
import { AppHeader, AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function FriendRequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
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
    <AppPage>
      <AppHeader
        eyebrow="社交"
        title="新的朋友"
        description="这个世界不会只等你去找人，它也会主动把相遇推到你面前。"
        actions={
          <Button
            onClick={() => navigate({ to: "/tabs/chat" })}
            variant="ghost"
            size="icon"
            className="text-[color:var(--text-secondary)]"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <div className="space-y-4">
        {requestsQuery.isLoading ? <LoadingBlock label="正在读取好友请求..." /> : null}
        {requestsQuery.isError && requestsQuery.error instanceof Error ? (
          <ErrorBlock message={requestsQuery.error.message} />
        ) : null}
        {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}

        {(requestsQuery.data ?? []).map((request) => (
          <div
            key={request.id}
            className="rounded-[30px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start gap-3">
              <AvatarChip name={request.characterName} src={request.characterAvatar} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">{request.characterName}</div>
                <div className="mt-3 rounded-[22px] bg-[color:var(--surface-soft)] px-4 py-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                  {request.greeting || "想认识你。"}
                </div>
                {request.triggerScene ? (
                  <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    来自场景 {request.triggerScene}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                disabled={acceptMutation.isPending || declineMutation.isPending}
                onClick={() => acceptMutation.mutate(request.id)}
                variant="primary"
                size="lg"
                className="rounded-2xl"
              >
                {acceptMutation.isPending && acceptMutation.variables === request.id ? "接受中..." : "接受"}
              </Button>
              <Button
                disabled={acceptMutation.isPending || declineMutation.isPending}
                onClick={() => declineMutation.mutate(request.id)}
                variant="secondary"
                size="lg"
                className="rounded-2xl"
              >
                {declineMutation.isPending && declineMutation.variables === request.id ? "处理中..." : "拒绝"}
              </Button>
            </div>
          </div>
        ))}

        {acceptMutation.isError && acceptMutation.error instanceof Error ? (
          <ErrorBlock message={acceptMutation.error.message} />
        ) : null}
        {declineMutation.isError && declineMutation.error instanceof Error ? (
          <ErrorBlock message={declineMutation.error.message} />
        ) : null}

        {!requestsQuery.isLoading && !requestsQuery.isError && !requestsQuery.data?.length ? (
          <EmptyState title="暂时没有新的好友请求" description="去发现页摇一摇，或等待场景触发新的相遇。" />
        ) : null}
      </div>
    </AppPage>
  );
}
