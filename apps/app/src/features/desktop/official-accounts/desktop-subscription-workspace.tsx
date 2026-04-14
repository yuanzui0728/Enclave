import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getOfficialAccountArticle,
  getOfficialAccountSubscriptionInbox,
  markOfficialAccountArticleRead,
  markOfficialAccountDeliveryRead,
} from "@yinjie/contracts";
import { Smartphone } from "lucide-react";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { EmptyState } from "../../../components/empty-state";
import { OfficialArticleViewer } from "../../../components/official-article-viewer";
import {
  formatConversationTimestamp,
  formatDesktopMessageTimestamp,
} from "../../../lib/format";
import { buildDesktopMobileOfficialHandoffHash } from "./desktop-mobile-official-handoff-route-state";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function DesktopSubscriptionWorkspace({
  selectedArticleId,
  onOpenAccount,
  onOpenArticle,
}: {
  selectedArticleId?: string;
  onOpenAccount?: (accountId: string, articleId?: string) => void;
  onOpenArticle?: (articleId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const lastMarkedDeliveryIdRef = useRef<string | null>(null);
  const lastMarkedArticleIdRef = useRef<string | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(
    selectedArticleId ?? null,
  );

  const inboxQuery = useQuery({
    queryKey: ["app-official-subscription-inbox", baseUrl],
    queryFn: () => getOfficialAccountSubscriptionInbox(baseUrl),
  });

  const markDeliveryReadMutation = useMutation({
    mutationFn: (deliveryId: string) =>
      markOfficialAccountDeliveryRead(deliveryId, baseUrl),
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

  const feedItems = inboxQuery.data?.feedItems ?? [];
  const activeDelivery = useMemo(
    () =>
      feedItems.find((delivery) => delivery.articleId === activeArticleId) ?? null,
    [activeArticleId, feedItems],
  );
  const hasReaderSurface =
    Boolean(activeArticleId) ||
    articleQuery.isLoading ||
    articleQuery.isError ||
    markArticleReadMutation.isError;
  const unreadCount = inboxQuery.data?.summary?.unreadCount ?? 0;
  const groupCount = inboxQuery.data?.groups.length ?? 0;
  const lastDeliveredLabel = inboxQuery.data?.summary?.lastDeliveredAt
    ? formatConversationTimestamp(inboxQuery.data.summary.lastDeliveredAt)
    : "暂无更新";

  useEffect(() => {
    if (
      selectedArticleId === undefined ||
      selectedArticleId === activeArticleId
    ) {
      return;
    }

    setActiveArticleId(selectedArticleId);
  }, [activeArticleId, selectedArticleId]);

  useEffect(() => {
    if (!activeArticleId && feedItems[0]?.articleId) {
      setActiveArticleId(feedItems[0].articleId);
      return;
    }

    if (
      !selectedArticleId &&
      activeArticleId &&
      feedItems.length > 0 &&
      !feedItems.some((delivery) => delivery.articleId === activeArticleId)
    ) {
      setActiveArticleId(feedItems[0]?.articleId ?? null);
    }
  }, [activeArticleId, feedItems, selectedArticleId]);

  useEffect(() => {
    if (selectedArticleId) {
      return;
    }

    if (feedItems.length > 0) {
      return;
    }

    setActiveArticleId(null);
  }, [feedItems.length, selectedArticleId]);

  useEffect(() => {
    if (
      !activeDelivery?.id ||
      activeDelivery.readAt ||
      lastMarkedDeliveryIdRef.current === activeDelivery.id
    ) {
      return;
    }

    lastMarkedDeliveryIdRef.current = activeDelivery.id;
    markDeliveryReadMutation.mutate(activeDelivery.id);
  }, [activeDelivery, markDeliveryReadMutation]);

  const articleQuery = useQuery({
    queryKey: ["app-official-account-article", baseUrl, activeArticleId],
    queryFn: () => getOfficialAccountArticle(activeArticleId!, baseUrl),
    enabled: Boolean(activeArticleId),
  });
  const markArticleReadMutation = useMutation({
    mutationFn: (articleId: string) =>
      markOfficialAccountArticleRead(articleId, baseUrl),
    onSuccess: async (updatedArticle) => {
      queryClient.setQueryData(
        ["app-official-account-article", baseUrl, updatedArticle.id],
        updatedArticle,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-official-accounts", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-official-account", baseUrl, updatedArticle.account.id],
        }),
      ]);
    },
  });

  useEffect(() => {
    if (
      !articleQuery.data?.id ||
      lastMarkedArticleIdRef.current === articleQuery.data.id
    ) {
      return;
    }

    lastMarkedArticleIdRef.current = articleQuery.data.id;
    markArticleReadMutation.mutate(articleQuery.data.id);
  }, [articleQuery.data?.id, markArticleReadMutation]);

  function handleSelectArticle(articleId: string) {
    setActiveArticleId(articleId);
    onOpenArticle?.(articleId);
  }

  function handleOpenMobileHandoff() {
    void navigate({
      to: "/desktop/mobile",
      hash: buildDesktopMobileOfficialHandoffHash({
        surface: "subscription",
        accountId: activeDelivery?.account.id,
        articleId: activeArticleId ?? undefined,
        accountName:
          activeDelivery?.account.name ?? articleQuery.data?.account.name,
        articleTitle: articleQuery.data?.title,
        accountType: "subscription",
      }),
    });
  }

  return (
    <div className="flex h-full min-h-0 bg-[color:var(--bg-app)]">
      <section className="flex w-[332px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[#ededed]">
        <div className="border-b border-[color:var(--border-faint)] bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
                订阅号消息
              </div>
              <div className="mt-0.5 truncate text-[10px] text-[color:var(--text-muted)]">
                {unreadCount} 条未读 · {groupCount} 个号 · {lastDeliveredLabel} 更新
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleOpenMobileHandoff}
              className="h-8 w-8 shrink-0 rounded-full text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
              aria-label="到手机继续"
            >
              <Smartphone size={15} />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#ededed]">
          {inboxQuery.isLoading ? (
            <div className="px-3 py-3">
              <LoadingBlock label="正在读取订阅号消息..." />
            </div>
          ) : null}
          {inboxQuery.isError && inboxQuery.error instanceof Error ? (
            <div className="px-3 pt-3">
              <ErrorBlock message={inboxQuery.error.message} />
            </div>
          ) : null}
          {markDeliveryReadMutation.isError &&
          markDeliveryReadMutation.error instanceof Error ? (
            <div className="px-3 pt-3">
              <ErrorBlock message={markDeliveryReadMutation.error.message} />
            </div>
          ) : null}

          {feedItems.length ? (
            <div className="bg-white">
              {feedItems.map((delivery, index) => (
                <button
                  key={delivery.id}
                  type="button"
                  onClick={() => handleSelectArticle(delivery.articleId)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition",
                    index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
                    activeArticleId === delivery.articleId
                      ? "bg-[rgba(7,193,96,0.05)]"
                      : "bg-white hover:bg-[rgba(15,23,42,0.02)]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                          {delivery.account.name}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[12px] leading-[1.2rem] text-[color:var(--text-secondary)]">
                          {delivery.article.title}
                        </div>
                      </div>
                      <div className="shrink-0 text-[10px] text-[color:var(--text-muted)]">
                        {formatDesktopMessageTimestamp(delivery.deliveredAt)}
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {!delivery.readAt ? (
                        <div
                          className="h-2 w-2 shrink-0 rounded-full bg-[#fa5151]"
                          aria-label="未读"
                        />
                      ) : null}
                      <div className="min-w-0 truncate text-[10px] text-[color:var(--text-muted)]">
                        {delivery.article.summary}
                      </div>
                    </div>
                  </div>
                  {delivery.article.coverImage ? (
                    <img
                      src={delivery.article.coverImage}
                      alt={delivery.article.title}
                      className="h-14 w-14 shrink-0 rounded-[10px] border border-[color:var(--border-faint)] object-cover"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {!inboxQuery.isLoading && !feedItems.length ? (
            <div className="px-3 py-3">
              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <EmptyState
                  title="还没有订阅号消息"
                  description="先关注一个订阅号，后续推送会汇总到这里。"
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section
        className={cn(
          "min-w-0 flex-1 overflow-auto",
          hasReaderSurface ? "bg-white" : "bg-[rgba(255,255,255,0.62)] p-6",
        )}
      >
        {articleQuery.isLoading ? (
          <div className="mx-auto max-w-[780px] px-8 py-10">
            <LoadingBlock label="正在读取文章..." />
          </div>
        ) : null}
        {articleQuery.isError && articleQuery.error instanceof Error ? (
          <div className="mx-auto max-w-[780px] px-8 py-10">
            <ErrorBlock message={articleQuery.error.message} />
          </div>
        ) : null}
        {markArticleReadMutation.isError &&
        markArticleReadMutation.error instanceof Error ? (
          <div className="mx-auto max-w-[780px] px-8 pt-8">
            <ErrorBlock message={markArticleReadMutation.error.message} />
          </div>
        ) : null}

        {articleQuery.data ? (
          <OfficialArticleViewer
            article={articleQuery.data}
            desktopSurface="reader"
            onOpenAccount={(accountId) => {
              if (onOpenAccount) {
                onOpenAccount(accountId, articleQuery.data.id);
                return;
              }

              void navigate({
                to: "/official-accounts/$accountId",
                params: { accountId },
              });
            }}
            onOpenArticle={handleSelectArticle}
          />
        ) : (
          <div className="mx-auto max-w-[560px] py-10">
            <EmptyState
              title="选择一篇推送开始阅读"
              description="左侧会按订阅号分组展示最近投递的文章。"
            />
          </div>
        )}
      </section>
    </div>
  );
}
