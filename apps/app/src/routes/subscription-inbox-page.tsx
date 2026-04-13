import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookOpenText } from "lucide-react";
import {
  getOfficialAccountSubscriptionInbox,
  markOfficialAccountSubscriptionInboxRead,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  LoadingBlock,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { OfficialArticleCard } from "../components/official-article-card";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
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
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="订阅号消息"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/chat" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={() => {
              void navigate({ to: "/contacts/official-accounts" });
            }}
            aria-label="打开公众号列表"
          >
            <BookOpenText size={17} />
          </Button>
        }
      />

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {inboxQuery.isLoading ? (
          <div className="px-4 pt-2">
            <LoadingBlock label="正在读取订阅号消息..." />
          </div>
        ) : null}
        {inboxQuery.isError && inboxQuery.error instanceof Error ? (
          <div className="px-4 pt-2">
            <ErrorBlock message={inboxQuery.error.message} />
          </div>
        ) : null}
        {markReadMutation.isError && markReadMutation.error instanceof Error ? (
          <div className="px-4 pt-2">
            <ErrorBlock message={markReadMutation.error.message} />
          </div>
        ) : null}

        {inboxQuery.data?.groups.length ? (
          inboxQuery.data.groups.map((group) => (
            <section
              key={group.account.id}
              className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]"
            >
              <div className="border-b border-[color:var(--border-faint)] px-4 py-2">
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
                  <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                    {group.account.name}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-[1.125rem] text-[color:var(--text-muted)]">
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
                  dense
                  onClick={() => {
                    void navigate({
                      to: "/official-accounts/articles/$articleId",
                      params: { articleId: delivery.article.id },
                    });
                  }}
                />
              ))}
            </section>
          ))
        ) : !inboxQuery.isLoading ? (
          <div className="px-4 pt-4">
            <EmptyState
              title="还没有订阅号消息"
              description="先关注一个订阅号，后续推送会汇总到这里。"
            />
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}
