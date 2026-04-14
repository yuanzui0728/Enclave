import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  followOfficialAccount,
  getOfficialAccount,
  getOfficialAccountArticle,
  getOfficialAccountSubscriptionInbox,
  listOfficialAccounts,
  type OfficialAccountArticleSummary,
  type OfficialAccountSummary,
  unfollowOfficialAccount,
} from "@yinjie/contracts";
import { BookOpenText, MessageSquareText } from "lucide-react";
import { Button, ErrorBlock, LoadingBlock, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { OfficialAccountListItem } from "../../../components/official-account-list-item";
import { OfficialArticleCard } from "../../../components/official-article-card";
import { buildDesktopOfficialMessageRouteHash } from "../chat/desktop-official-message-route-state";
import {
  buildOfficialAccountFavoriteRecord,
  buildOfficialArticleSummaryFavoriteRecord,
} from "../favorites/official-account-favorite-records";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../favorites/desktop-favorites-storage";
import {
  buildDesktopOfficialArticleWindowPath,
  openDesktopOfficialArticleWindow,
} from "./desktop-official-article-window-route-state";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

type DesktopOfficialDisplayMode = "feed" | "accounts";

type DesktopOfficialFeedItem = {
  id: string;
  account: OfficialAccountSummary;
  article: OfficialAccountArticleSummary;
  deliveredAt?: string;
  unread: boolean;
  source: "subscription" | "recent";
};

export function DesktopOfficialAccountsWorkspace({
  selectedAccountId,
  selectedArticleId,
  selectedMode,
  onOpenAccount,
  onOpenArticle,
  onModeChange,
  onOpenServiceMessages,
  onOpenSubscriptionInbox,
}: {
  selectedAccountId?: string;
  selectedArticleId?: string;
  selectedMode?: "feed" | "accounts";
  onOpenAccount?: (accountId: string) => void;
  onOpenArticle?: (articleId: string, accountId: string) => void;
  onModeChange?: (mode: "feed" | "accounts") => void;
  onOpenServiceMessages?: (
    accountId: string,
    articleId?: string | null,
  ) => void;
  onOpenSubscriptionInbox?: (articleId?: string | null) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const [searchTerm, setSearchTerm] = useState("");
  const [accountFilter, setAccountFilter] = useState<"all" | "following">(
    "all",
  );
  const [detailTab, setDetailTab] = useState<"updates" | "profile">("updates");
  const [displayMode, setDisplayMode] = useState<DesktopOfficialDisplayMode>(
    selectedMode ?? (selectedAccountId ? "accounts" : "feed"),
  );
  const [focusedArticleId, setFocusedArticleId] = useState<string | null>(
    selectedArticleId ?? null,
  );
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>(() =>
    readDesktopFavorites().map((item) => item.sourceId),
  );

  useEffect(() => {
    if (!nativeDesktopFavorites) {
      return;
    }

    let cancelled = false;

    async function syncFavoriteSourceIds() {
      const nextFavoriteSourceIds = (
        await hydrateDesktopFavoritesFromNative()
      ).map((item) => item.sourceId);
      if (cancelled) {
        return;
      }

      setFavoriteSourceIds((current) =>
        JSON.stringify(current) === JSON.stringify(nextFavoriteSourceIds)
          ? current
          : nextFavoriteSourceIds,
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

  useEffect(() => {
    if (!selectedMode) {
      return;
    }

    setDisplayMode(selectedMode);
  }, [selectedMode]);

  useEffect(() => {
    if (!selectedArticleId) {
      return;
    }

    setFocusedArticleId(selectedArticleId);
  }, [selectedArticleId]);

  useEffect(() => {
    if (!selectedAccountId || selectedMode) {
      return;
    }

    setDisplayMode("accounts");
  }, [selectedAccountId, selectedMode]);

  function handleDisplayModeChange(mode: DesktopOfficialDisplayMode) {
    setDisplayMode(mode);
    onModeChange?.(mode);
  }

  const accountsQuery = useQuery({
    queryKey: ["app-official-accounts", baseUrl],
    queryFn: () => listOfficialAccounts(baseUrl),
  });
  const subscriptionInboxQuery = useQuery({
    queryKey: ["app-official-subscription-inbox", baseUrl],
    queryFn: () => getOfficialAccountSubscriptionInbox(baseUrl),
  });

  const allAccounts = accountsQuery.data ?? [];
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredAccounts = useMemo(() => {
    return allAccounts.filter((account) => {
      if (accountFilter === "following" && !account.isFollowing) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return matchesOfficialAccountKeyword(account, normalizedSearchTerm);
    });
  }, [accountFilter, allAccounts, normalizedSearchTerm]);
  const followingAccounts = useMemo(
    () => allAccounts.filter((account) => account.isFollowing),
    [allAccounts],
  );
  const followingCount = followingAccounts.length;
  const subscriptionCount = useMemo(
    () =>
      allAccounts.filter((account) => account.accountType === "subscription")
        .length,
    [allAccounts],
  );
  const serviceCount = useMemo(
    () =>
      allAccounts.filter((account) => account.accountType === "service").length,
    [allAccounts],
  );

  const feedItems = useMemo<DesktopOfficialFeedItem[]>(() => {
    const items: DesktopOfficialFeedItem[] = [];
    const seenArticleIds = new Set<string>();

    for (const delivery of subscriptionInboxQuery.data?.feedItems ?? []) {
      seenArticleIds.add(delivery.article.id);
      items.push({
        id: delivery.id,
        account: delivery.account,
        article: delivery.article,
        deliveredAt: delivery.deliveredAt,
        unread: !delivery.readAt,
        source: "subscription",
      });
    }

    for (const account of followingAccounts) {
      const article = account.recentArticle;
      if (!article || seenArticleIds.has(article.id)) {
        continue;
      }

      items.push({
        id: `recent-${article.id}`,
        account,
        article,
        deliveredAt: account.lastPublishedAt,
        unread: false,
        source: "recent",
      });
    }

    return items.sort((left, right) => {
      const leftTimestamp = new Date(
        left.deliveredAt ?? left.article.publishedAt,
      ).getTime();
      const rightTimestamp = new Date(
        right.deliveredAt ?? right.article.publishedAt,
      ).getTime();
      return rightTimestamp - leftTimestamp;
    });
  }, [followingAccounts, subscriptionInboxQuery.data?.feedItems]);

  const filteredFeedItems = useMemo(() => {
    if (!normalizedSearchTerm) {
      return feedItems;
    }

    return feedItems.filter((item) =>
      [
        item.account.name,
        item.account.handle,
        item.article.title,
        item.article.summary,
      ].some((field) => field.toLowerCase().includes(normalizedSearchTerm)),
    );
  }, [feedItems, normalizedSearchTerm]);

  const frequentAccounts = useMemo(() => {
    const unreadAccountIds = new Set(
      (subscriptionInboxQuery.data?.groups ?? [])
        .filter((group) => group.unreadCount > 0)
        .map((group) => group.account.id),
    );
    const candidates = followingAccounts
      .filter((account) =>
        normalizedSearchTerm
          ? matchesOfficialAccountKeyword(account, normalizedSearchTerm)
          : true,
      )
      .sort((left, right) => {
        const leftScore = Number(unreadAccountIds.has(left.id));
        const rightScore = Number(unreadAccountIds.has(right.id));
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        const leftTimestamp = left.lastPublishedAt
          ? new Date(left.lastPublishedAt).getTime()
          : 0;
        const rightTimestamp = right.lastPublishedAt
          ? new Date(right.lastPublishedAt).getTime()
          : 0;
        return rightTimestamp - leftTimestamp;
      });

    return candidates.slice(0, 10);
  }, [
    followingAccounts,
    normalizedSearchTerm,
    subscriptionInboxQuery.data?.groups,
  ]);

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
      selectedAccountId &&
      allAccounts.some((account) => account.id === selectedAccountId)
    ) {
      return selectedAccountId;
    }

    if (pinnedArticleQuery.data?.account.id) {
      return pinnedArticleQuery.data.account.id;
    }

    if (displayMode === "accounts") {
      return (
        filteredAccounts[0]?.id ??
        followingAccounts[0]?.id ??
        allAccounts[0]?.id
      );
    }

    return undefined;
  }, [
    allAccounts,
    displayMode,
    filteredAccounts,
    followingAccounts,
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

  const account = accountDetailQuery.data;
  const accountFavoriteSourceId = account ? `official-${account.id}` : null;
  const activeAccountArticleId =
    focusedArticleId ?? selectedArticleId ?? account?.articles[0]?.id ?? null;
  const highlightedFeedArticleId =
    focusedArticleId ??
    selectedArticleId ??
    filteredFeedItems[0]?.article.id ??
    null;
  const feedUnreadCount = filteredFeedItems.filter(
    (item) => item.unread,
  ).length;
  const nextDisplayMode: DesktopOfficialDisplayMode =
    displayMode === "feed" ? "accounts" : "feed";
  const nextDisplayModeLabel =
    nextDisplayMode === "feed" ? "常看与文章" : "按号查看";
  const NextDisplayModeIcon =
    nextDisplayMode === "feed" ? BookOpenText : MessageSquareText;

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

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-official-accounts", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-official-subscription-inbox", baseUrl],
        }),
      ]);
    },
  });

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

  function toggleArticleSummaryFavorite(
    article: OfficialAccountArticleSummary,
    articleAccount: OfficialAccountSummary,
  ) {
    const sourceId = `official-article-${article.id}`;
    const nextFavorites = favoriteSourceIds.includes(sourceId)
      ? removeDesktopFavorite(sourceId)
      : upsertDesktopFavorite(
          buildOfficialArticleSummaryFavoriteRecord(article, articleAccount),
        );

    setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
  }

  function handleOpenAccount(accountId: string) {
    handleDisplayModeChange("accounts");

    if (onOpenAccount) {
      onOpenAccount(accountId);
      return;
    }

    void navigate({
      to: "/official-accounts/$accountId",
      params: { accountId },
    });
  }

  async function handleOpenArticleWindow(
    articleId: string,
    accountId: string,
    title: string,
    options?: {
      syncRoute?: boolean;
    },
  ) {
    setFocusedArticleId(articleId);

    if (options?.syncRoute) {
      onOpenArticle?.(articleId, accountId);
    }

    const returnTo =
      typeof window === "undefined"
        ? buildDesktopOfficialArticleWindowPath({
            articleId,
            accountId,
            title,
          })
        : `${window.location.pathname}${window.location.hash}`;

    await openDesktopOfficialArticleWindow({
      articleId,
      accountId,
      title,
      returnTo,
    });
  }

  function openServiceWorkspace(accountId: string, articleId?: string | null) {
    if (onOpenServiceMessages) {
      onOpenServiceMessages(accountId, articleId);
      return;
    }

    void navigate({
      to: "/official-accounts/service/$accountId",
      params: { accountId },
      hash: buildDesktopOfficialMessageRouteHash({
        articleId: articleId ?? undefined,
      }),
    });
  }

  function openSubscriptionWorkspace(articleId?: string | null) {
    if (onOpenSubscriptionInbox) {
      onOpenSubscriptionInbox(articleId);
      return;
    }

    void navigate({
      to: "/chat/subscription-inbox",
      hash: buildDesktopOfficialMessageRouteHash({
        articleId: articleId ?? undefined,
      }),
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-app)]">
      <header className="shrink-0 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.82)] px-5 py-4 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              公众号
            </div>
            <div className="mt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
              已关注 {followingCount} · 订阅 {subscriptionCount} · 服务{" "}
              {serviceCount}
              {displayMode === "feed" ? ` · 未读 ${feedUnreadCount}` : ""}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleDisplayModeChange(nextDisplayMode)}
              className="rounded-xl border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
            >
              <NextDisplayModeIcon size={14} />
              {nextDisplayModeLabel}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <TextField
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={
              displayMode === "feed" ? "搜索常看公众号或文章" : "搜索公众号"
            }
            className="rounded-[14px] border-[color:var(--border-faint)] bg-white px-4 py-2.5 text-[13px] shadow-none hover:bg-[color:var(--surface-console)] focus:border-[rgba(7,193,96,0.14)] focus:shadow-none"
          />
          {displayMode === "accounts" ? (
            <div className="flex gap-2">
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
          ) : null}
        </div>
      </header>

      {displayMode === "feed" ? (
        <DesktopOfficialFeedMode
          frequentAccounts={frequentAccounts}
          feedItems={filteredFeedItems}
          highlightedArticleId={highlightedFeedArticleId}
          favoriteSourceIds={favoriteSourceIds}
          loading={accountsQuery.isLoading || subscriptionInboxQuery.isLoading}
          errorMessage={
            accountsQuery.error instanceof Error
              ? accountsQuery.error.message
              : subscriptionInboxQuery.error instanceof Error
                ? subscriptionInboxQuery.error.message
                : null
          }
          onOpenAccount={handleOpenAccount}
          onOpenArticle={(item) => {
            void handleOpenArticleWindow(
              item.article.id,
              item.account.id,
              item.article.title,
            );
          }}
          onToggleFavorite={(item) =>
            toggleArticleSummaryFavorite(item.article, item.account)
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 bg-[color:var(--bg-app)]">
          <section className="flex w-[300px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
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

          <section className="min-h-0 min-w-0 flex-1 overflow-auto bg-[rgba(255,255,255,0.62)] p-5">
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
              <div className="mx-auto max-w-[920px]">
                <section className="rounded-[26px] border border-[color:var(--border-faint)] bg-white px-6 py-6 shadow-[var(--shadow-section)]">
                  <div className="flex items-start gap-4">
                    <AvatarChip
                      name={account.name}
                      src={account.avatar}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[24px] font-semibold text-[color:var(--text-primary)]">
                        {account.name}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[color:var(--brand-primary)]">
                          {account.accountType === "service"
                            ? "服务号"
                            : "订阅号"}
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
                        {account.accountType === "service" &&
                        account.isMuted ? (
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
                    {account.accountType === "service" &&
                    account.isFollowing ? (
                      <Button
                        type="button"
                        variant="primary"
                        className="rounded-xl bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
                        onClick={() =>
                          openServiceWorkspace(
                            account.id,
                            activeAccountArticleId,
                          )
                        }
                      >
                        <MessageSquareText size={15} />
                        发消息
                      </Button>
                    ) : null}
                    {account.accountType === "subscription" &&
                    account.isFollowing ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-xl border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                        onClick={() =>
                          openSubscriptionWorkspace(activeAccountArticleId)
                        }
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
                </section>

                <div className="mt-4 rounded-[22px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
                  <div className="border-b border-[color:var(--border-faint)] px-5 py-3">
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

                  <div className="bg-[rgba(247,250,250,0.72)] px-4 py-4">
                    {detailTab === "updates" ? (
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
                              openServiceWorkspace(
                                account.id,
                                activeAccountArticleId,
                              );
                              return;
                            }

                            openSubscriptionWorkspace(activeAccountArticleId);
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
                                active={article.id === activeAccountArticleId}
                                favorite={favoriteSourceIds.includes(
                                  `official-article-${article.id}`,
                                )}
                                onClick={() => {
                                  void handleOpenArticleWindow(
                                    article.id,
                                    account.id,
                                    article.title,
                                    { syncRoute: true },
                                  );
                                }}
                                onToggleFavorite={() =>
                                  toggleArticleSummaryFavorite(article, account)
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
                          value={
                            account.accountType === "service"
                              ? "服务号"
                              : "订阅号"
                          }
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
                              ? new Date(
                                  account.articles[0].publishedAt,
                                ).toLocaleDateString("zh-CN", {
                                  month: "numeric",
                                  day: "numeric",
                                })
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
                    )}
                  </div>
                </div>
              </div>
            ) : !accountDetailQuery.isLoading ? (
              <div className="mx-auto max-w-[560px] py-10">
                <EmptyState
                  title="还没有可浏览的公众号"
                  description="先从左侧选择一个公众号，或切回常看与文章模式查看精选流。"
                />
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

function DesktopOfficialFeedMode({
  frequentAccounts,
  feedItems,
  highlightedArticleId,
  favoriteSourceIds,
  loading,
  errorMessage,
  onOpenAccount,
  onOpenArticle,
  onToggleFavorite,
}: {
  frequentAccounts: OfficialAccountSummary[];
  feedItems: DesktopOfficialFeedItem[];
  highlightedArticleId?: string | null;
  favoriteSourceIds: string[];
  loading: boolean;
  errorMessage: string | null;
  onOpenAccount: (accountId: string) => void;
  onOpenArticle: (item: DesktopOfficialFeedItem) => void;
  onToggleFavorite: (item: DesktopOfficialFeedItem) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[rgba(250,251,250,0.82)] px-5 py-5">
      <div className="mx-auto max-w-[960px] space-y-5">
        {loading ? <LoadingBlock label="正在整理公众号内容..." /> : null}
        {errorMessage ? <ErrorBlock message={errorMessage} /> : null}

        <section className="rounded-[24px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                常看的号
              </div>
              <div className="mt-1 text-[22px] font-semibold text-[color:var(--text-primary)]">
                订阅精选
              </div>
            </div>
            <div className="text-[12px] text-[color:var(--text-muted)]">
              优先展示最近常看的公众号
            </div>
          </div>

          {frequentAccounts.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {frequentAccounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onOpenAccount(account.id)}
                  className="flex items-center gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)] px-4 py-3 text-left transition hover:border-[rgba(7,193,96,0.14)] hover:bg-[rgba(7,193,96,0.05)]"
                >
                  <AvatarChip
                    name={account.name}
                    src={account.avatar}
                    size="wechat"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                      {account.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                      {account.accountType === "service" ? "服务号" : "订阅号"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)] p-4">
              <EmptyState
                title="还没有常看的公众号"
                description="关注几个公众号后，这里会优先展示最近常看的号。"
              />
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
          <div className="border-b border-[color:var(--border-faint)] px-5 py-4">
            <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
              文章流
            </div>
            <div className="mt-1 text-[20px] font-semibold text-[color:var(--text-primary)]">
              最近内容
            </div>
          </div>

          {feedItems.length ? (
            <div className="divide-y divide-[color:var(--border-faint)]">
              {feedItems.map((item) => (
                <DesktopOfficialFeedArticleCard
                  key={item.id}
                  item={item}
                  active={item.article.id === highlightedArticleId}
                  favorite={favoriteSourceIds.includes(
                    `official-article-${item.article.id}`,
                  )}
                  onOpenAccount={() => onOpenAccount(item.account.id)}
                  onOpenArticle={() => onOpenArticle(item)}
                  onToggleFavorite={() => onToggleFavorite(item)}
                />
              ))}
            </div>
          ) : (
            <div className="px-5 py-8">
              <EmptyState
                title="还没有可读文章"
                description="可以换个关键词试试，或先关注几个公众号。"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DesktopOfficialFeedArticleCard({
  item,
  active,
  favorite,
  onOpenAccount,
  onOpenArticle,
  onToggleFavorite,
}: {
  item: DesktopOfficialFeedItem;
  active: boolean;
  favorite: boolean;
  onOpenAccount: () => void;
  onOpenArticle: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      className={cn(
        "px-5 py-4 transition",
        active ? "bg-[rgba(7,193,96,0.05)]" : "bg-white",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onOpenAccount}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <AvatarChip
            name={item.account.name}
            src={item.account.avatar}
            size="wechat"
          />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
              {item.account.name}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
              <span>
                {item.account.accountType === "service" ? "服务号" : "订阅号"}
              </span>
              {item.source === "subscription" ? (
                <span>订阅推送</span>
              ) : (
                <span>最近更新</span>
              )}
              {item.unread ? (
                <span className="rounded-full bg-[#fa5151] px-1.5 py-0.5 text-[10px] leading-none text-white">
                  未读
                </span>
              ) : null}
            </div>
          </div>
        </button>
        <div className="text-[11px] text-[color:var(--text-muted)]">
          {new Date(
            item.deliveredAt ?? item.article.publishedAt,
          ).toLocaleDateString("zh-CN", {
            month: "numeric",
            day: "numeric",
          })}
        </div>
      </div>

      <OfficialArticleCard
        article={item.article}
        compact
        active={active}
        favorite={favorite}
        onClick={onOpenArticle}
        onToggleFavorite={onToggleFavorite}
      />
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

function matchesOfficialAccountKeyword(
  account: OfficialAccountSummary,
  normalizedKeyword: string,
) {
  return [account.name, account.description, account.handle].some((field) =>
    field.toLowerCase().includes(normalizedKeyword),
  );
}
