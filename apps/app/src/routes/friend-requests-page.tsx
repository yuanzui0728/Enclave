import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { acceptFriendRequest, declineFriendRequest, getFriendRequests } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { useSessionStore } from "../store/session-store";

export function FriendRequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);
  const [successNotice, setSuccessNotice] = useState("");

  const requestsQuery = useQuery({
    queryKey: ["app-friend-requests", userId],
    queryFn: () => getFriendRequests(userId!),
    enabled: Boolean(userId),
  });

  const acceptMutation = useMutation({
    mutationFn: (requestId: string) => acceptFriendRequest(requestId, { userId: userId! }),
    onSuccess: async () => {
      setSuccessNotice("好友申请已处理。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-friend-requests", userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", userId] }),
      ]);
    },
  });

  const declineMutation = useMutation({
    mutationFn: (requestId: string) => declineFriendRequest(requestId, { userId: userId! }),
    onSuccess: async () => {
      setSuccessNotice("好友申请已处理。");
      await queryClient.invalidateQueries({ queryKey: ["app-friend-requests", userId] });
    },
  });
  const pendingAcceptRequestId = acceptMutation.isPending ? acceptMutation.variables : null;
  const pendingDeclineRequestId = declineMutation.isPending ? declineMutation.variables : null;

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  return (
    <AppPage>
      <div className="flex items-center gap-3">
        <Button
          onClick={() => navigate({ to: "/tabs/chat" })}
          variant="ghost"
          size="icon"
          className="text-[color:var(--text-secondary)]"
        >
          <ArrowLeft size={18} />
        </Button>
        <div>
          <div className="text-lg font-semibold text-white">新的朋友</div>
          <div className="text-xs text-[color:var(--text-muted)]">这个世界会主动来找你</div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {requestsQuery.isLoading ? <LoadingBlock label="正在读取好友申请..." /> : null}

        {requestsQuery.isError && requestsQuery.error instanceof Error ? <ErrorBlock message={requestsQuery.error.message} /> : null}

        {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}

        {(requestsQuery.data ?? []).map((request) => (
          <div key={request.id} className="rounded-[28px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] p-4">
            <div className="flex items-start gap-3">
              <AvatarChip name={request.characterName} src={request.characterAvatar} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">{request.characterName}</div>
                <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
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
                {pendingAcceptRequestId === request.id ? "接受中..." : "接受"}
              </Button>
              <Button
                disabled={acceptMutation.isPending || declineMutation.isPending}
                onClick={() => declineMutation.mutate(request.id)}
                variant="secondary"
                size="lg"
                className="rounded-2xl"
              >
                {pendingDeclineRequestId === request.id ? "处理中..." : "拒绝"}
              </Button>
            </div>
          </div>
        ))}

        {acceptMutation.isError && acceptMutation.error instanceof Error ? <ErrorBlock message={acceptMutation.error.message} /> : null}

        {declineMutation.isError && declineMutation.error instanceof Error ? <ErrorBlock message={declineMutation.error.message} /> : null}

        {!requestsQuery.isLoading && !requestsQuery.isError && !requestsQuery.data?.length ? (
          <EmptyState title="暂时没有新的好友申请" description="去发现页摇一摇，或等待场景触发新的相遇。" />
        ) : null}
      </div>
    </AppPage>
  );
}
