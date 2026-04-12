import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getOfficialAccountArticle,
  getOfficialAccountSubscriptionInbox,
  markOfficialAccountArticleRead,
  markOfficialAccountSubscriptionInboxRead,
} from "@yinjie/contracts";
import { ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../../../components/empty-state";
import { OfficialArticleViewer } from "../../../components/official-article-viewer";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function DesktopSubscriptionWorkspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const lastAutoReadDeliveryRef = useRef<string | null>(null);
  const lastMarkedArticleIdRef = useRef<string | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

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

  const deliveries = useMemo(
    () => inboxQuery.data?.groups.flatMap((group) => group.deliveries) ?? [],
    [inboxQuery.data?.groups],
  );
  const unreadCount = inboxQuery.data?.summary?.unreadCount ?? 0;
  const groupCount = inboxQuery.data?.groups.length ?? 0;
  const lastDeliveredLabel = inboxQuery.data?.summary?.lastDeliveredAt
    ? new Date(inboxQuery.data.summary.lastDeliveredAt).toLocaleDateString(
        "zh-CN",
        {
          month: "numeric",
          day: "numeric",
        },
      )
    : "暂无推送";

  useEffect(() => {
    if (!activeArticleId && deliveries[0]?.articleId) {
      setActiveArticleId(deliveries[0].articleId);
      return;
    }

    if (
      activeArticleId &&
      deliveries.length > 0 &&
      !deliveries.some((delivery) => delivery.articleId === activeArticleId)
    ) {
      setActiveArticleId(deliveries[0]?.articleId ?? null);
    }
  }, [activeArticleId, deliveries]);

  useEffect(() => {
    if (deliveries.length > 0) {
      return;
    }

    setActiveArticleId(null);
  }, [deliveries.length]);

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

  return (
    <div className="flex h-full min-h-0 bg-[color:var(--bg-app)]">
      <section className="flex w-[360px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(242,246,245,0.78)]">
        <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-5 backdrop-blur-xl">
          <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
            聚合消息
          </div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
            订阅号消息
          </div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            已关注订阅号的最近推送会集中收口在这里，按微信式聚合流浏览。
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SidebarMetricCard label="未读推送" value={`${unreadCount} 条`} />
            <SidebarMetricCard label="账号分组" value={`${groupCount} 个`} />
            <SidebarMetricCard label="最近更新" value={lastDeliveredLabel} />
            <SidebarMetricCard label="文章总数" value={`${deliveries.length} 篇`} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-3 py-3">
          {inboxQuery.isLoading ? <LoadingBlock label="正在读取订阅号消息..." /> : null}
          {inboxQuery.isError && inboxQuery.error instanceof Error ? (
            <ErrorBlock message={inboxQuery.error.message} />
          ) : null}
          {markReadMutation.isError && markReadMutation.error instanceof Error ? (
            <ErrorBlock message={markReadMutation.error.message} />
          ) : null}

          {inboxQuery.data?.groups.map((group) => (
            <section
              key={group.account.id}
              className="mb-3 rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-4 shadow-[var(--shadow-section)] last:mb-0"
            >
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
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[color:var(--brand-primary)]">
                    {group.unreadCount > 0
                      ? `${group.unreadCount} 条未读推送`
                      : "最近推送"}
                  </span>
                  <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[color:var(--text-muted)]">
                    {group.deliveries.length} 篇
                  </span>
                </div>
              </button>

              <div className="mt-3 space-y-2">
                {group.deliveries.map((delivery) => (
                  <button
                    key={delivery.id}
                    type="button"
                    onClick={() => setActiveArticleId(delivery.articleId)}
                    className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${
                      activeArticleId === delivery.articleId
                        ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[var(--shadow-section)]"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[color:var(--text-primary)]">
                          {delivery.article.title}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                          {delivery.article.summary}
                        </div>
                      </div>
                      {group.unreadCount > 0 && !delivery.readAt ? (
                        <div className="rounded-full border border-[color:var(--border-faint)] bg-white px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
                          未读
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 text-[11px] text-[color:var(--text-dim)]">
                      {new Date(delivery.deliveredAt).toLocaleDateString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {!inboxQuery.isLoading && !inboxQuery.data?.groups.length ? (
            <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
              <EmptyState
                title="还没有订阅号消息"
                description="先关注一个订阅号，后续推送会汇总到这里。"
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 flex-1 overflow-auto bg-[rgba(255,255,255,0.62)] p-6">
        {articleQuery.isLoading ? <LoadingBlock label="正在读取文章..." /> : null}
        {articleQuery.isError && articleQuery.error instanceof Error ? (
          <ErrorBlock message={articleQuery.error.message} />
        ) : null}
        {markArticleReadMutation.isError &&
        markArticleReadMutation.error instanceof Error ? (
          <ErrorBlock message={markArticleReadMutation.error.message} />
        ) : null}

        {articleQuery.data ? (
          <OfficialArticleViewer
            article={articleQuery.data}
            onOpenAccount={(accountId) => {
              void navigate({
                to: "/official-accounts/$accountId",
                params: { accountId },
              });
            }}
            onOpenArticle={(articleId) => setActiveArticleId(articleId)}
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

function SidebarMetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border-faint)] bg-white p-3 shadow-[var(--shadow-section)]">
      <div className="text-[11px] text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium leading-6 text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
