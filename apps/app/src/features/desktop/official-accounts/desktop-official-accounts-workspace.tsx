import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BookOpenText, MessageSquareText } from "lucide-react";
import {
  followOfficialAccount,
  getOfficialAccount,
  getOfficialAccountArticle,
  listOfficialAccounts,
  markOfficialAccountArticleRead,
  unfollowOfficialAccount,
} from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock, TextField } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { OfficialAccountListItem } from "../../../components/official-account-list-item";
import { OfficialArticleCard } from "../../../components/official-article-card";
import { OfficialArticleViewer } from "../../../components/official-article-viewer";
import { EmptyState } from "../../../components/empty-state";
import { buildDesktopOfficialMessageRouteHash } from "../chat/desktop-official-message-route-state";
import {
  buildOfficialAccountFavoriteRecord,
  buildOfficialArticleFavoriteRecord,
  buildOfficialArticleSummaryFavoriteRecord,
} from "../favorites/official-account-favorite-records";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../favorites/desktop-favorites-storage";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function DesktopOfficialAccountsWorkspace({
  selectedAccountId,
  selectedArticleId,
  onOpenAccount,
  onOpenArticle,
}: {
  selectedAccountId?: string;
  selectedArticleId?: string;
  onOpenAccount?: (accountId: string) => void;
  onOpenArticle?: (articleId: string, accountId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const lastMarkedArticleIdRef = useRef<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [accountFilter, setAccountFilter] = useState<"all" | "following">(
    "all",
  );
  const [detailTab, setDetailTab] = useState<"updates" | "profile">("updates");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>(() =>
    readDesktopFavorites().map((item) => item.sourceId),
  );

  useEffect(() => {
    if (!nativeDesktopFavorites) {
      return;
    }

    let cancelled = false;

    async function syncFavoriteSourceIds() {
      const favoriteSourceIds = (await hydrateDesktopFavoritesFromNative()).map(
        (item) => item.sourceId,
      );
      if (cancelled) {
        return;
      }

      setFavoriteSourceIds((current) =>
        JSON.stringify(current) === JSON.stringify(favoriteSourceIds)
          ? current
          : favoriteSourceIds,
      );
    }

    const handleFocus = () => {
      void syncFavoriteSourceIds();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncFavoriteSourceIds();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [nativeDesktopFavorites]);

  const accountsQuery = useQuery({
    queryKey: ["app-official-accounts", baseUrl],
    queryFn: () => listOfficialAccounts(baseUrl),
  });

  const filteredAccounts = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return (accountsQuery.data ?? []).filter((account) => {
      if (accountFilter === "following" && !account.isFollowing) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return (
        account.name.toLowerCase().includes(keyword) ||
        account.description.toLowerCase().includes(keyword) ||
        account.handle.toLowerCase().includes(keyword)
      );
    });
  }, [accountFilter, accountsQuery.data, searchTerm]);
  const hasAccountFiltering =
    accountFilter !== "all" || searchTerm.trim().length > 0;
  const followingCount = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.isFollowing).length,
    [accountsQuery.data],
  );
  const subscriptionCount = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (account) => account.accountType === "subscription",
      ).length,
    [accountsQuery.data],
  );
  const serviceCount = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (account) => account.accountType === "service",
      ).length,
    [accountsQuery.data],
  );

  const pinnedArticleQuery = useQuery({
    queryKey: ["app-official-account-article", baseUrl, selectedArticleId],
    queryFn: () => getOfficialAccountArticle(selectedArticleId!, baseUrl),
    enabled: Boolean(selectedArticleId),
  });

  const effectiveAccountId = useMemo(() => {
    if (
      selectedAccountId &&
      filteredAccounts.some((account) => account.id === selectedAccountId)
    ) {
      return selectedAccountId;
    }

    if (
      !hasAccountFiltering &&
      selectedAccountId &&
      (accountsQuery.data ?? []).some((account) => account.id === selectedAccountId)
    ) {
      return selectedAccountId;
    }

    if (!hasAccountFiltering && pinnedArticleQuery.data?.account.id) {
      return pinnedArticleQuery.data.account.id;
    }

    if (hasAccountFiltering) {
      return filteredAccounts[0]?.id;
    }

    return accountsQuery.data?.[0]?.id;
  }, [
    accountsQuery.data,
    filteredAccounts,
    hasAccountFiltering,
    pinnedArticleQuery.data?.account.id,
    selectedAccountId,
  ]);

  const accountDetailQuery = useQuery({
    queryKey: ["app-official-account", baseUrl, effectiveAccountId],
    queryFn: () => getOfficialAccount(effectiveAccountId!, baseUrl),
    enabled: Boolean(effectiveAccountId),
  });

  useEffect(() => {
    setDetailTab("updates");
  }, [effectiveAccountId]);

  const activeArticleId = useMemo(() => {
    if (!effectiveAccountId) {
      return null;
    }

    if (
      selectedArticleId &&
      pinnedArticleQuery.data?.account.id === effectiveAccountId &&
      (pinnedArticleQuery.isLoading || pinnedArticleQuery.data?.id === selectedArticleId)
    ) {
      return selectedArticleId;
    }

    return accountDetailQuery.data?.articles[0]?.id;
  }, [
    accountDetailQuery.data?.articles,
    effectiveAccountId,
    pinnedArticleQuery.data?.account.id,
    pinnedArticleQuery.data?.id,
    pinnedArticleQuery.isLoading,
    selectedArticleId,
  ]);

  const articleDetailQuery = useQuery({
    queryKey: ["app-official-account-reader", baseUrl, activeArticleId],
    queryFn: () => getOfficialAccountArticle(activeArticleId!, baseUrl),
    enabled: Boolean(activeArticleId),
  });

  const activeArticle =
    selectedArticleId &&
    pinnedArticleQuery.data?.account.id === effectiveAccountId
      ? (pinnedArticleQuery.data ?? articleDetailQuery.data)
      : articleDetailQuery.data;
  const account = accountDetailQuery.data;
  const accountFavoriteSourceId = account ? `official-${account.id}` : null;
  const articleFavoriteSourceId = activeArticle
    ? `official-article-${activeArticle.id}`
    : null;

  const followMutation = useMutation({
    mutationFn: () => {
      if (!account) {
        throw new Error("当前公众号资料尚未加载完成。");
      }

      return account.isFollowing
        ? unfollowOfficialAccount(account.id, baseUrl)
        : followOfficialAccount(account.id, baseUrl);
    },
    onSuccess: async (updatedAccount) => {
      queryClient.setQueryData(
        ["app-official-account", baseUrl, updatedAccount.id],
        updatedAccount,
      );

      await queryClient.invalidateQueries({
        queryKey: ["app-official-accounts", baseUrl],
      });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (targetArticleId: string) =>
      markOfficialAccountArticleRead(targetArticleId, baseUrl),
    onSuccess: async (updatedArticle) => {
      queryClient.setQueryData(
        ["app-official-account-article", baseUrl, updatedArticle.id],
        updatedArticle,
      );
      queryClient.setQueryData(
        ["app-official-account-reader", baseUrl, updatedArticle.id],
        updatedArticle,
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "app-official-account",
            baseUrl,
            updatedArticle.account.id,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-official-accounts", baseUrl],
        }),
      ]);
    },
  });

  useEffect(() => {
    if (
      !activeArticle?.id ||
      lastMarkedArticleIdRef.current === activeArticle.id
    ) {
      return;
    }

    lastMarkedArticleIdRef.current = activeArticle.id;
    markReadMutation.mutate(activeArticle.id);
  }, [activeArticle?.id, markReadMutation]);

  function toggleAccountFavorite() {
    if (!account) {
      return;
    }

    const sourceId = `official-${account.id}`;
    const nextFavorites = favoriteSourceIds.includes(sourceId)
      ? removeDesktopFavorite(sourceId)
      : upsertDesktopFavorite(buildOfficialAccountFavoriteRecord(account));

    setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
  }

  function toggleArticleFavorite() {
    if (!activeArticle) {
      return;
    }

    const sourceId = `official-article-${activeArticle.id}`;
    const nextFavorites = favoriteSourceIds.includes(sourceId)
      ? removeDesktopFavorite(sourceId)
      : upsertDesktopFavorite(
          buildOfficialArticleFavoriteRecord(activeArticle),
        );

    setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
  }

  function toggleArticleSummaryFavorite(articleId: string) {
    if (!account) {
      return;
    }

    const targetArticle = account.articles.find(
      (item) => item.id === articleId,
    );
    if (!targetArticle) {
      return;
    }

    const sourceId = `official-article-${targetArticle.id}`;
    const nextFavorites = favoriteSourceIds.includes(sourceId)
      ? removeDesktopFavorite(sourceId)
      : upsertDesktopFavorite(
          buildOfficialArticleSummaryFavoriteRecord(targetArticle, account),
        );

    setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
  }

  function handleOpenAccount(accountId: string) {
    if (onOpenAccount) {
      onOpenAccount(accountId);
      return;
    }

    void navigate({
      to: "/official-accounts/$accountId",
      params: { accountId },
    });
  }

  function handleOpenArticle(articleId: string, accountId: string) {
    if (onOpenArticle) {
      onOpenArticle(articleId, accountId);
      return;
    }

    void navigate({
      to: "/official-accounts/articles/$articleId",
      params: { articleId },
    });
  }

  function openServiceWorkspace(accountId: string, articleId?: string | null) {
    void navigate({
      to: "/official-accounts/service/$accountId",
      params: { accountId },
      hash: buildDesktopOfficialMessageRouteHash({
        articleId: articleId ?? undefined,
      }),
    });
  }

  function openSubscriptionWorkspace(articleId?: string | null) {
    void navigate({
      to: "/chat/subscription-inbox",
      hash: buildDesktopOfficialMessageRouteHash({
        articleId: articleId ?? undefined,
      }),
    });
  }

  return (
    <div className="flex h-full min-h-0 bg-[color:var(--bg-app)]">
      <section className="flex w-[300px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
        <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-4 py-4 backdrop-blur-xl">
          <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
            公众号
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
            已关注 {followingCount} · 订阅 {subscriptionCount} · 服务 {serviceCount}
          </div>
          <TextField
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜索公众号"
            className="mt-3 rounded-[14px] border-[color:var(--border-faint)] bg-white px-4 py-2.5 text-[13px] shadow-none hover:bg-[color:var(--surface-console)] focus:border-[rgba(7,193,96,0.14)] focus:shadow-none"
          />
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setAccountFilter("all")}
              className={
                accountFilter === "all"
                  ? "rounded-full border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)] shadow-none hover:bg-[rgba(7,193,96,0.08)]"
                  : "rounded-full border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
              }
            >
              全部
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setAccountFilter("following")}
              className={
                accountFilter === "following"
                  ? "rounded-full border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)] shadow-none hover:bg-[rgba(7,193,96,0.08)]"
                  : "rounded-full border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
              }
            >
              已关注
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2.5">
          {accountsQuery.isLoading ? (
            <LoadingBlock label="正在读取公众号..." />
          ) : null}
          {accountsQuery.isError && accountsQuery.error instanceof Error ? (
            <ErrorBlock message={accountsQuery.error.message} />
          ) : null}

          <div className="overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-white">
            {filteredAccounts.map((entry) => (
              <OfficialAccountListItem
                key={entry.id}
                account={entry}
                active={entry.id === effectiveAccountId}
                dense
                onClick={() => handleOpenAccount(entry.id)}
              />
            ))}
          </div>

          {!accountsQuery.isLoading && !filteredAccounts.length ? (
            <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-3 shadow-[var(--shadow-section)]">
              <EmptyState
                title="没有匹配的公众号"
                description={
                  accountFilter === "following"
                    ? "当前筛选下还没有已关注账号。"
                    : "换个关键词试试。"
                }
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex w-[420px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-white/88">
        <div className="border-b border-[color:var(--border-faint)] bg-white/82 px-5 py-5 backdrop-blur-xl">
          {account ? (
            <>
              <div className="flex items-start gap-4">
                <AvatarChip
                  name={account.name}
                  src={account.avatar}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[23px] font-semibold text-[color:var(--text-primary)]">
                    {account.name}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[color:var(--brand-primary)]">
                      {account.accountType === "service" ? "服务号" : "订阅号"}
                    </span>
                    <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1 text-[color:var(--text-muted)]">
                      @{account.handle}
                    </span>
                    {account.isVerified ? (
                      <span className="rounded-full border border-[#d7e5fb] bg-[#f3f7ff] px-3 py-1 text-[#315b9a]">
                        已认证
                      </span>
                    ) : null}
                    {account.isFollowing ? (
                      <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-1 text-[color:var(--text-secondary)]">
                        已关注
                      </span>
                    ) : null}
                    {account.accountType === "service" && account.isMuted ? (
                      <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-1 text-[color:var(--text-secondary)]">
                        已免打扰
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                    {account.description}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {account.accountType === "service" && account.isFollowing ? (
                  <Button
                    type="button"
                    variant="primary"
                    className="rounded-xl bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
                    onClick={() =>
                      openServiceWorkspace(account.id, activeArticleId)
                    }
                  >
                    <MessageSquareText size={15} />
                    发消息
                  </Button>
                ) : null}
                {account.accountType === "subscription" && account.isFollowing ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-xl border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                    onClick={() => openSubscriptionWorkspace(activeArticleId)}
                  >
                    <BookOpenText size={15} />
                    订阅号消息
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={account.isFollowing ? "secondary" : "primary"}
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                  className={
                    account.isFollowing
                      ? "rounded-xl border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                      : "rounded-xl bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
                  }
                >
                  {followMutation.isPending
                    ? "处理中..."
                    : account.isFollowing
                      ? "取消关注"
                      : "关注公众号"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={toggleAccountFavorite}
                  className="rounded-xl border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                >
                  {accountFavoriteSourceId &&
                  favoriteSourceIds.includes(accountFavoriteSourceId)
                    ? "取消收藏"
                    : "收藏主页"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                账号主页
              </div>
              <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                公众号
              </div>
              <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                这里会展示账号资料、最近文章和消息入口。
              </div>
            </>
          )}
        </div>

        <div className="border-b border-[color:var(--border-faint)] bg-white px-5 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDetailTab("updates")}
              className={
                detailTab === "updates"
                  ? "rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1.5 text-sm font-medium text-[color:var(--brand-primary)]"
                  : "rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1.5 text-sm text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
              }
            >
              消息
            </button>
            <button
              type="button"
              onClick={() => setDetailTab("profile")}
              className={
                detailTab === "profile"
                  ? "rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1.5 text-sm font-medium text-[color:var(--brand-primary)]"
                  : "rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1.5 text-sm text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
              }
            >
              资料
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[rgba(247,250,250,0.72)] px-4 py-4">
          {accountDetailQuery.isLoading ? (
            <LoadingBlock label="正在读取公众号主页..." />
          ) : null}
          {accountDetailQuery.isError &&
          accountDetailQuery.error instanceof Error ? (
            <ErrorBlock message={accountDetailQuery.error.message} />
          ) : null}
          {followMutation.isError && followMutation.error instanceof Error ? (
            <ErrorBlock message={followMutation.error.message} />
          ) : null}

          {account ? (
            detailTab === "updates" ? (
              <div className="space-y-4">
                <DesktopOfficialEntryCard
                  title={
                    account.accountType === "service"
                      ? "服务号消息"
                      : "订阅号消息"
                  }
                  description={
                    account.accountType === "service"
                      ? account.isFollowing
                        ? "这个服务号的通知、文章卡片和服务入口会出现在消息页。"
                        : "先关注后，服务消息和文章卡片才会进入消息页。"
                      : account.isFollowing
                        ? "这个订阅号的新推送会进入“订阅号消息”聚合流。"
                        : "先关注后，这个订阅号的推送才会进入聚合流。"
                  }
                  actionLabel={
                    account.accountType === "service"
                      ? "打开消息"
                      : "打开订阅号消息"
                  }
                  actionDisabled={!account.isFollowing}
                  onAction={() => {
                    if (account.accountType === "service") {
                      openServiceWorkspace(account.id, activeArticleId);
                      return;
                    }

                    openSubscriptionWorkspace(activeArticleId);
                  }}
                />

                <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
                  <div className="border-b border-[color:var(--border-faint)] px-4 py-3 text-sm font-medium text-[color:var(--text-primary)]">
                    最近文章
                  </div>
                  {account.articles.length ? (
                    account.articles.map((article) => (
                      <OfficialArticleCard
                        key={article.id}
                        article={article}
                        dense
                        active={article.id === activeArticleId}
                        favorite={favoriteSourceIds.includes(
                          `official-article-${article.id}`,
                        )}
                        onClick={() =>
                          handleOpenArticle(article.id, account.id)
                        }
                        onToggleFavorite={() =>
                          toggleArticleSummaryFavorite(article.id)
                        }
                      />
                    ))
                  ) : (
                    <div className="px-4 py-6">
                      <EmptyState
                        title="这个公众号还没有公开文章"
                        description="后续更新会直接出现在这里。"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <DesktopOfficialProfileRow
                  label="账号类型"
                  value={account.accountType === "service" ? "服务号" : "订阅号"}
                />
                <DesktopOfficialProfileRow
                  label="账号状态"
                  value={account.isFollowing ? "已关注" : "未关注"}
                />
                <DesktopOfficialProfileRow
                  label="消息状态"
                  value={
                    account.accountType === "service"
                      ? account.isMuted
                        ? "已开启消息免打扰"
                        : "正常接收消息"
                      : "通过订阅号消息聚合浏览"
                  }
                />
                <DesktopOfficialProfileRow
                  label="最近更新"
                  value={
                    account.articles[0]?.publishedAt
                      ? new Date(account.articles[0].publishedAt).toLocaleDateString(
                          "zh-CN",
                          {
                            month: "numeric",
                            day: "numeric",
                          },
                        )
                      : "暂无更新"
                  }
                />
                <DesktopOfficialProfileRow
                  label="文章数量"
                  value={`${account.articles.length} 篇`}
                />
                <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    账号简介
                  </div>
                  <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                    {account.description}
                  </div>
                </section>
              </div>
            )
          ) : null}
        </div>
      </section>

      <section className="min-w-0 flex-1 overflow-auto bg-[rgba(255,255,255,0.62)] p-6">
        {articleDetailQuery.isLoading && !activeArticle ? (
          <LoadingBlock label="正在读取文章..." />
        ) : null}
        {articleDetailQuery.isError &&
        articleDetailQuery.error instanceof Error ? (
          <ErrorBlock message={articleDetailQuery.error.message} />
        ) : null}
        {markReadMutation.isError && markReadMutation.error instanceof Error ? (
          <ErrorBlock message={markReadMutation.error.message} />
        ) : null}

        {activeArticle ? (
          <OfficialArticleViewer
            article={activeArticle}
            favorite={
              articleFavoriteSourceId
                ? favoriteSourceIds.includes(articleFavoriteSourceId)
                : false
            }
            onOpenAccount={handleOpenAccount}
            onOpenArticle={(nextArticleId) =>
              handleOpenArticle(nextArticleId, activeArticle.account.id)
            }
            onToggleFavorite={toggleArticleFavorite}
          />
        ) : (
          <div className="mx-auto max-w-[560px] py-10">
            <EmptyState
              title="还没有可读内容"
              description="先从左侧选择一个公众号，或等待该账号发布第一篇文章。"
            />
          </div>
        )}
      </section>
    </div>
  );
}

function DesktopOfficialEntryCard({
  title,
  description,
  actionLabel,
  actionDisabled = false,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
}) {
  return (
    <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
        {description}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={actionDisabled}
        className="mt-4 rounded-xl border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </section>
  );
}

function DesktopOfficialProfileRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <section className="flex items-center justify-between gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-3 shadow-[var(--shadow-section)]">
      <div className="text-sm text-[color:var(--text-muted)]">{label}</div>
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </section>
  );
}
