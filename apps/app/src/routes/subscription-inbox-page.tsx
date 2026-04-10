import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  getOfficialAccountSubscriptionInbox,
  markOfficialAccountSubscriptionInboxRead,
} from "@yinjie/contracts";
import {
  AppHeader,
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  LoadingBlock,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { OfficialArticleCard } from "../components/official-article-card";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function SubscriptionInboxPage() {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopChatWorkspace selectedSpecialView="subscription-inbox" />;
  }

  return <MobileSubscriptionInboxPage />;
}

function MobileSubscriptionInboxPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const lastAutoReadDeliveryRef = useRef<string | null>(null);

  const inboxQuery = useQuery({
    queryKey: ["app-official-subscription-inbox", baseUrl],
    queryFn: () => getOfficialAccountSubscriptionInbox(baseUrl),
  });

  const markReadMutation = useMutation({
    mutationFn: () => markOfficialAccountSubscriptionInboxRead(baseUrl),
    onSuccess: (updatedInbox) => {
      queryClient.setQueryData(
        ["app-official-subscription-inbox", baseUrl],
        updatedInbox,
      );
      void queryClient.invalidateQueries({
        queryKey: ["app-official-message-entries", baseUrl],
      });
    },
  });

  useEffect(() => {
    const latestDeliveryAt = inboxQuery.data?.summary?.lastDeliveredAt;
    if (
      !inboxQuery.data?.summary?.unreadCount ||
      !latestDeliveryAt ||
      lastAutoReadDeliveryRef.current === latestDeliveryAt
    ) {
      return;
    }

    lastAutoReadDeliveryRef.current = latestDeliveryAt;
    markReadMutation.mutate();
  }, [
    inboxQuery.data?.summary?.lastDeliveredAt,
    inboxQuery.data?.summary?.unreadCount,
    markReadMutation,
  ]);

  return (
    <AppPage>
      <AppHeader
        eyebrow="消息"
        title="订阅号消息"
        description="已关注订阅号的最近推送会汇总在这里。"
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

      {inboxQuery.isLoading ? <LoadingBlock label="正在读取订阅号消息..." /> : null}
      {inboxQuery.isError && inboxQuery.error instanceof Error ? (
        <ErrorBlock message={inboxQuery.error.message} />
      ) : null}
      {markReadMutation.isError && markReadMutation.error instanceof Error ? (
        <ErrorBlock message={markReadMutation.error.message} />
      ) : null}

      {inboxQuery.data?.groups.length ? (
        inboxQuery.data.groups.map((group) => (
          <AppSection key={group.account.id} className="space-y-4">
            <div>
              <button
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/$accountId",
                    params: { accountId: group.account.id },
                  });
                }}
                className="text-left"
              >
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {group.account.name}
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  {group.unreadCount > 0
                    ? `${group.unreadCount} 条新推送`
                    : "最近推送"}
                </div>
              </button>
            </div>

            {group.deliveries.map((delivery) => (
              <OfficialArticleCard
                key={delivery.id}
                article={delivery.article}
                compact
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/articles/$articleId",
                    params: { articleId: delivery.article.id },
                  });
                }}
              />
            ))}
          </AppSection>
        ))
      ) : !inboxQuery.isLoading ? (
        <EmptyState
          title="还没有订阅号消息"
          description="先关注一个订阅号，后续推送会汇总到这里。"
        />
      ) : null}
    </AppPage>
  );
}
