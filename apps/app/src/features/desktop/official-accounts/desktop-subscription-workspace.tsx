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
import { Button, cn } from "@yinjie/ui";
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
      <section className="flex w-[332px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-white">
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

        <div className="min-h-0 flex-1 overflow-auto bg-white">
          {inboxQuery.isLoading ? (
            <SidebarStatusPane
              title="正在读取订阅号消息"
              description="稍等一下，正在同步最近的订阅推送。"
              tone="loading"
              className="m-3"
            />
          ) : null}
          {inboxQuery.isError && inboxQuery.error instanceof Error ? (
            <SidebarStatusPane
              title="订阅号消息暂时不可用"
              description={inboxQuery.error.message}
              tone="danger"
              className="m-3"
            />
          ) : null}
          {markDeliveryReadMutation.isError &&
          markDeliveryReadMutation.error instanceof Error ? (
            <SidebarInlineStatus
              message={markDeliveryReadMutation.error.message}
              tone="danger"
              className="mx-3 mt-3"
            />
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
                      : "bg-white hover:bg-[rgba(15,23,42,0.015)]",
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
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)] text-[10px] text-[color:var(--text-dim)]">
                      文章
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : null}

          {!inboxQuery.isLoading && !feedItems.length ? (
            <SidebarStatusPane
              title="还没有订阅号消息"
              description="先关注一个订阅号，后续推送会汇总到这里。"
              className="m-3"
            />
          ) : null}
        </div>
      </section>

      <section
        className="min-w-0 flex-1 overflow-auto bg-white"
      >
        {articleQuery.data ? (
          <>
            {markArticleReadMutation.isError &&
            markArticleReadMutation.error instanceof Error ? (
              <div className="mx-auto max-w-[780px] px-8 pt-6">
                <ReaderInlineStatus
                  message={markArticleReadMutation.error.message}
                  tone="danger"
                />
              </div>
            ) : null}
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
          </>
        ) : articleQuery.isLoading ? (
          <ReaderStatusPane
            badge="读取中"
            title="正在读取文章"
            description="稍等一下，正在准备这篇订阅号文章。"
            tone="loading"
          />
        ) : articleQuery.isError && articleQuery.error instanceof Error ? (
          <ReaderStatusPane
            badge="读取失败"
            title="文章暂时不可用"
            description={articleQuery.error.message}
            tone="danger"
          />
        ) : inboxQuery.isLoading ? (
          <ReaderStatusPane
            badge="准备中"
            title="正在准备阅读区"
            description="订阅号消息同步后，会在这里直接进入阅读。"
            tone="loading"
          />
        ) : inboxQuery.isError && inboxQuery.error instanceof Error ? (
          <ReaderStatusPane
            badge="读取失败"
            title="订阅号消息暂时不可用"
            description={inboxQuery.error.message}
            tone="danger"
          />
        ) : !feedItems.length ? (
          <ReaderStatusPane
            badge="订阅号"
            title="还没有订阅号消息"
            description="先关注一个订阅号，后续推送会直接在这里阅读。"
          />
        ) : (
          <ReaderStatusPane
            badge="阅读区"
            title="选择一篇推送开始阅读"
            description="左侧列表会按微信式订阅号消息节奏展示最近投递的文章。"
          />
        )}
      </section>
    </div>
  );
}

function ReaderStatusPane({
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
    <div className="mx-auto flex min-h-full max-w-[780px] items-center px-8 py-14">
      <div
        className={cn(
          "w-full rounded-[22px] border px-8 py-10 text-center shadow-none",
          tone === "danger"
            ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
            : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
        )}
      >
        <div
          className={cn(
            "mx-auto inline-flex rounded-full px-2.5 py-0.5 text-[10px]",
            tone === "danger"
              ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
              : tone === "loading"
                ? "bg-[rgba(15,23,42,0.05)] text-[color:var(--text-secondary)]"
                : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
          )}
        >
          {badge}
        </div>
        <div className="mt-4 text-[18px] font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        <p className="mx-auto mt-3 max-w-[28rem] text-[13px] leading-7 text-[color:var(--text-secondary)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function ReaderInlineStatus({
  message,
  tone = "default",
}: {
  message: string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border px-4 py-3 text-[13px] leading-6",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[rgba(254,242,242,0.9)] text-[color:var(--state-danger-text)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
      )}
    >
      {message}
    </div>
  );
}

function SidebarStatusPane({
  title,
  description,
  tone = "default",
  className,
}: {
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[18px] border px-4 py-5 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)]",
        className,
      )}
    >
      {tone === "loading" ? (
        <div className="flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div
        className={cn(
          "font-medium text-[13px] text-[color:var(--text-primary)]",
          tone === "loading" ? "mt-3" : undefined,
        )}
      >
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[15rem] text-[12px] leading-6 text-[color:var(--text-secondary)]">
        {description}
      </p>
    </div>
  );
}

function SidebarInlineStatus({
  message,
  tone = "default",
  className,
}: {
  message: string;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border px-3 py-2 text-[12px] leading-6 shadow-none",
        tone === "danger"
          ? "border-[rgba(220,38,38,0.18)] bg-[rgba(255,245,245,0.96)] text-[color:var(--state-danger-text)]"
          : "border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)] text-[color:var(--text-secondary)]",
        className,
      )}
    >
      {message}
    </div>
  );
}
