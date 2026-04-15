import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, BookOpenText } from "lucide-react";
import {
  getOfficialAccountSubscriptionInbox,
  markOfficialAccountSubscriptionInboxRead,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  InlineNotice,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { parseDesktopOfficialMessageRouteHash } from "../features/desktop/chat/desktop-official-message-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatConversationTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function SubscriptionInboxPage() {
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const routeState = useMemo(
    () => parseDesktopOfficialMessageRouteHash(hash),
    [hash],
  );

  if (isDesktopLayout) {
    return (
      <DesktopChatWorkspace
        selectedSpecialView="subscription-inbox"
        selectedOfficialArticleId={routeState.articleId}
      />
    );
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

  const unreadCount = inboxQuery.data?.summary?.unreadCount ?? 0;
  const groupCount = inboxQuery.data?.groups.length ?? 0;
  const lastDeliveredLabel = inboxQuery.data?.summary?.lastDeliveredAt
    ? formatConversationTimestamp(inboxQuery.data.summary.lastDeliveredAt)
    : "暂无更新";
  const headerSubtitle = groupCount
    ? `${groupCount}个号 · ${lastDeliveredLabel}${
        unreadCount ? ` · ${unreadCount}条未读` : ""
      }`
    : undefined;

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="订阅号消息"
        subtitle={headerSubtitle}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.96)] px-4 pb-2 pt-2 text-[color:var(--text-primary)] shadow-none"
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
          <div className="mx-auto max-w-[24rem] px-3.5 pt-3">
            <MobileSubscriptionInboxStatusCard
              badge="读取中"
              title="正在读取订阅号消息"
              description="稍等一下，正在同步最近的订阅推送。"
              tone="loading"
            />
          </div>
        ) : null}
        {inboxQuery.isError && inboxQuery.error instanceof Error ? (
          <div className="mx-auto max-w-[24rem] px-3.5 pt-3">
            <MobileSubscriptionInboxStatusCard
              badge="读取失败"
              title="订阅号消息暂时不可用"
              description={inboxQuery.error.message}
              tone="danger"
            />
          </div>
        ) : null}
        {markReadMutation.isError && markReadMutation.error instanceof Error ? (
          <div className="mx-auto max-w-[24rem] px-3.5 pt-3">
            <InlineNotice
              className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
              tone="danger"
            >
              {markReadMutation.error.message}
            </InlineNotice>
          </div>
        ) : null}

        {inboxQuery.data?.groups.length ? (
          inboxQuery.data.groups.map((group) => (
            <section
              key={group.account.id}
              className="mx-3.5 mt-3 overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-white shadow-none"
            >
              <button
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/$accountId",
                    params: { accountId: group.account.id },
                  });
                }}
                className="flex w-full items-center gap-3 border-b border-[color:var(--border-faint)] px-4 py-3 text-left active:bg-[rgba(15,23,42,0.02)]"
              >
                <AvatarChip
                  name={group.account.name}
                  src={group.account.avatar}
                  size="wechat"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                    {group.account.name}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-[1.125rem] text-[color:var(--text-muted)]">
                    {group.lastDeliveredAt
                      ? formatConversationTimestamp(group.lastDeliveredAt)
                      : "最近推送"}
                  </div>
                </div>
                {group.unreadCount > 0 ? (
                  <span className="rounded-full bg-[#fa5151] px-1.5 py-0.5 text-[10px] leading-none text-white">
                    {group.unreadCount}
                  </span>
                ) : null}
              </button>

              {group.deliveries.map((delivery) => (
                <MobileSubscriptionArticleRow
                  key={delivery.id}
                  delivery={delivery}
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
          <div className="mx-auto max-w-[24rem] px-3.5 pt-4">
            <MobileSubscriptionInboxStatusCard
              badge="暂时空白"
              title="还没有订阅号消息"
              description="先关注一个订阅号，后续推送会汇总到这里。"
            />
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function MobileSubscriptionArticleRow({
  delivery,
  onClick,
}: {
  delivery: NonNullable<
    Awaited<ReturnType<typeof getOfficialAccountSubscriptionInbox>>
  >["groups"][number]["deliveries"][number];
  onClick: () => void;
}) {
  const publishedLabel = formatConversationTimestamp(
    delivery.deliveredAt ?? delivery.article.publishedAt,
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 border-t border-[color:var(--border-faint)] px-4 py-3 text-left active:bg-[rgba(15,23,42,0.03)]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[10px] text-[color:var(--text-muted)]">
          {delivery.article.isPinned ? (
            <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-1.5 py-0.5 text-[9px] text-[color:var(--brand-primary)]">
              置顶
            </span>
          ) : null}
          <span>{publishedLabel}</span>
        </div>
        <div className="mt-1.5 line-clamp-2 text-[14px] font-medium leading-5 text-[color:var(--text-primary)]">
          {delivery.article.title}
        </div>
        <div className="mt-1.5 line-clamp-2 text-[11px] leading-[1.2rem] text-[color:var(--text-secondary)]">
          {delivery.article.summary}
        </div>
      </div>
      {delivery.article.coverImage ? (
        <img
          src={delivery.article.coverImage}
          alt={delivery.article.title}
          className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-[10px] border border-[color:var(--border-faint)] object-cover"
        />
      ) : (
        <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)] text-[10px] text-[color:var(--text-dim)]">
          文章
        </div>
      )}
    </button>
  );
}

function MobileSubscriptionInboxStatusCard({
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
