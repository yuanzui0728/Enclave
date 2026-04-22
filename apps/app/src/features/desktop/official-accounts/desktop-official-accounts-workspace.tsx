import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { BookOpenText, MessageSquareText, Star } from "lucide-react";
import { Button, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { OfficialAccountListItem } from "../../../components/official-account-list-item";
import { OfficialArticleCard } from "../../../components/official-article-card";
import { formatDesktopMessageTimestamp } from "../../../lib/format";
import { buildDesktopContactsRouteHash } from "../../contacts/contacts-route-state";
import {
  buildDesktopOfficialServiceThreadPath,
  buildDesktopSubscriptionInboxPath,
} from "../chat/desktop-chat-route-state";
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
import { getCurrentWindowTargetPath } from "../../../runtime/desktop-windowing";
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
  onHighlightFeedArticle,
  onOpenArticle,
  onModeChange,
  onOpenServiceMessages,
  onOpenSubscriptionInbox,
}: {
  selectedAccountId?: string;
  selectedArticleId?: string;
  selectedMode?: "feed" | "accounts";
  onOpenAccount?: (accountId: string) => void;
  onHighlightFeedArticle?: (articleId?: string) => void;
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
  const autoSyncedFeedSelectionRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (
      displayMode !== "accounts" ||
      !selectedAccountId ||
      selectedMode ||
      !onModeChange
    ) {
      return;
    }

    onModeChange("accounts");
  }, [displayMode, onModeChange, selectedAccountId, selectedMode]);

  const openDesktopAccountWorkspace = useCallback(
    (accountId: string, articleId?: string | null) => {
      void navigate({
        to: "/tabs/contacts",
        hash: buildDesktopContactsRouteHash({
          pane: "official-accounts",
          accountId,
          articleId: articleId ?? undefined,
          officialMode: "accounts",
        }),
      });
    },
    [navigate],
  );

  function handleDisplayModeChange(mode: DesktopOfficialDisplayMode) {
    setDisplayMode(mode);
    onModeChange?.(mode);
  }

  const syncAccountRouteSelection = useCallback(
    (accountId: string, articleId?: string | null) => {
      if (articleId && onOpenArticle) {
        onOpenArticle(articleId, accountId);
        return;
      }

      if (!articleId && onOpenAccount) {
        onOpenAccount(accountId);
        return;
      }

      openDesktopAccountWorkspace(accountId, articleId);
    },
    [onOpenAccount, onOpenArticle, openDesktopAccountWorkspace],
  );

  const accountsQuery = useQuery({
    queryKey: ["app-official-accounts", baseUrl],
    queryFn: () => listOfficialAccounts(baseUrl),
  });
  const subscriptionInboxQuery = useQuery({
    queryKey: ["app-official-subscription-inbox", baseUrl],
    queryFn: () => getOfficialAccountSubscriptionInbox(baseUrl),
  });

  const allAccounts = useMemo(
    () => accountsQuery.data ?? [],
    [accountsQuery.data],
  );
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
  const currentFeedArticleIds = useMemo(
    () => new Set(filteredFeedItems.map((item) => item.article.id)),
    [filteredFeedItems],
  );

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
  const currentAccountArticleIds = useMemo(
    () => new Set((account?.articles ?? []).map((article) => article.id)),
    [account?.articles],
  );
  const activeAccountArticleId =
    (focusedArticleId && currentAccountArticleIds.has(focusedArticleId)
      ? focusedArticleId
      : null) ??
    (selectedArticleId && currentAccountArticleIds.has(selectedArticleId)
      ? selectedArticleId
      : null) ??
    account?.articles[0]?.id ??
    null;

  useEffect(() => {
    if (displayMode !== "accounts" || !effectiveAccountId || !account) {
      return;
    }

    const selectedAccountMatches = selectedAccountId === effectiveAccountId;
    const selectedArticleMatchesAccount = selectedArticleId
      ? currentAccountArticleIds.has(selectedArticleId)
      : false;

    if (
      selectedAccountMatches &&
      (!selectedArticleId || selectedArticleMatchesAccount)
    ) {
      return;
    }

    if (selectedArticleId) {
      syncAccountRouteSelection(
        effectiveAccountId,
        selectedArticleMatchesAccount
          ? selectedArticleId
          : activeAccountArticleId,
      );
      return;
    }

    syncAccountRouteSelection(effectiveAccountId);
  }, [
    account,
    activeAccountArticleId,
    currentAccountArticleIds,
    displayMode,
    effectiveAccountId,
    selectedAccountId,
    selectedArticleId,
    syncAccountRouteSelection,
  ]);

  const highlightedFeedArticleId =
    (focusedArticleId && currentFeedArticleIds.has(focusedArticleId)
      ? focusedArticleId
      : null) ??
    (selectedArticleId && currentFeedArticleIds.has(selectedArticleId)
      ? selectedArticleId
      : null) ??
    filteredFeedItems[0]?.article.id ??
    null;
  const feedUnreadCount = filteredFeedItems.filter(
    (item) => item.unread,
  ).length;

  useEffect(() => {
    if (
      displayMode !== "feed" ||
      !focusedArticleId ||
      currentFeedArticleIds.has(focusedArticleId)
    ) {
      return;
    }

    setFocusedArticleId(null);
  }, [currentFeedArticleIds, displayMode, focusedArticleId]);

  useEffect(() => {
    if (displayMode !== "feed" || !onHighlightFeedArticle) {
      autoSyncedFeedSelectionRef.current = null;
      return;
    }

    const nextArticleId = highlightedFeedArticleId ?? undefined;
    const routeAlreadyMatchesFeedSelection =
      selectedMode === "feed" &&
      !selectedAccountId &&
      (selectedArticleId ?? undefined) === nextArticleId;

    if (routeAlreadyMatchesFeedSelection) {
      autoSyncedFeedSelectionRef.current = null;
      return;
    }

    const syncKey = `${selectedMode ?? "unset"}:${selectedAccountId ?? "none"}:${
      selectedArticleId ?? "none"
    }->${nextArticleId ?? "empty"}`;
    if (autoSyncedFeedSelectionRef.current === syncKey) {
      return;
    }

    autoSyncedFeedSelectionRef.current = syncKey;
    onHighlightFeedArticle(nextArticleId);
  }, [
    displayMode,
    highlightedFeedArticleId,
    onHighlightFeedArticle,
    selectedAccountId,
    selectedArticleId,
    selectedMode,
  ]);

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

    openDesktopAccountWorkspace(accountId);
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
        : getCurrentWindowTargetPath();

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
      to: buildDesktopOfficialServiceThreadPath({
        accountId,
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
      to: buildDesktopSubscriptionInboxPath({
        articleId: articleId ?? undefined,
      }),
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-app)]">
      <header className="shrink-0 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.92)] px-5 py-3.5 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
              公众号
            </div>
            <div className="mt-0.5 text-[11px] leading-5 text-[color:var(--text-muted)]">
              已关注 {followingCount} · 订阅 {subscriptionCount} · 服务{" "}
              {serviceCount}
              {displayMode === "feed" ? ` · 未读 ${feedUnreadCount}` : ""}
            </div>
          </div>

          <div className="flex items-center rounded-full border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.92)] p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDisplayModeChange("feed")}
              className={cn(
                "h-8 rounded-full px-3 text-[12px] shadow-none",
                displayMode === "feed"
                  ? "bg-white text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-secondary)] hover:bg-white/80",
              )}
            >
              <BookOpenText size={14} />
              常看与文章
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDisplayModeChange("accounts")}
              className={cn(
                "h-8 rounded-full px-3 text-[12px] shadow-none",
                displayMode === "accounts"
                  ? "bg-white text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-secondary)] hover:bg-white/80",
              )}
            >
              <MessageSquareText size={14} />
              按号查看
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <TextField
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={
              displayMode === "feed" ? "搜索常看公众号或文章" : "搜索公众号"
            }
            className="rounded-full border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.92)] px-4 py-2.5 text-[13px] shadow-none hover:bg-white focus:translate-y-0 focus:border-[rgba(7,193,96,0.14)] focus:bg-white focus:shadow-none"
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
          <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-white">
            <div className="border-b border-[color:var(--border-faint)] px-4 py-3">
              <div className="text-[12px] font-medium text-[color:var(--text-primary)]">
                {accountFilter === "following" ? "已关注公众号" : "全部公众号"}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                {filteredAccounts.length} 个结果
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {accountsQuery.isLoading ? (
                <OfficialWorkspaceStatusPane
                  title="正在读取公众号"
                  description="稍等一下，正在同步账号目录。"
                  tone="loading"
                  className="m-4"
                />
              ) : null}
              {accountsQuery.isError && accountsQuery.error instanceof Error ? (
                <OfficialWorkspaceStatusPane
                  title="公众号目录暂时不可用"
                  description={accountsQuery.error.message}
                  tone="danger"
                  className="m-4"
                />
              ) : null}

              <div className="bg-white">
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
                <OfficialWorkspaceStatusPane
                  title="没有匹配的公众号"
                  description={
                    accountFilter === "following"
                      ? "当前筛选下还没有已关注账号。"
                      : "换个关键词试试。"
                  }
                  className="m-4"
                />
              ) : null}
            </div>
          </section>

          <section className="min-h-0 min-w-0 flex-1 overflow-auto bg-white">
            {accountDetailQuery.isLoading ? (
              <OfficialWorkspaceStatusPane
                title="正在读取公众号主页"
                description="稍等一下，正在同步账号资料和最近文章。"
                tone="loading"
                className="mx-auto mt-5 max-w-[820px]"
              />
            ) : null}
            {accountDetailQuery.isError &&
            accountDetailQuery.error instanceof Error ? (
              <OfficialWorkspaceStatusPane
                title="公众号主页暂时不可用"
                description={accountDetailQuery.error.message}
                tone="danger"
                className="mx-auto mt-5 max-w-[820px]"
              />
            ) : null}
            {followMutation.isError && followMutation.error instanceof Error ? (
              <OfficialWorkspaceInlineNotice
                message={followMutation.error.message}
                tone="danger"
                className="mx-auto mt-5 max-w-[820px]"
              />
            ) : null}

            {account ? (
              <div className="mx-auto max-w-[820px]">
                <section className="border-b border-[color:var(--border-faint)] px-7 py-7">
                  <div className="flex items-start gap-4">
                    <AvatarChip
                      name={account.name}
                      src={account.avatar}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[22px] font-semibold text-[color:var(--text-primary)]">
                        {account.name}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[color:var(--brand-primary)]">
                          {account.accountType === "service"
                            ? "服务号"
                            : "订阅号"}
                        </span>
                        <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-2.5 py-1 text-[color:var(--text-muted)]">
                          @{account.handle}
                        </span>
                        {account.isVerified ? (
                          <span className="rounded-full border border-[#d7e5fb] bg-[#f3f7ff] px-2.5 py-1 text-[#315b9a]">
                            已认证
                          </span>
                        ) : null}
                        {account.isFollowing ? (
                          <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[color:var(--text-secondary)]">
                            已关注
                          </span>
                        ) : null}
                        {account.accountType === "service" &&
                        account.isMuted ? (
                          <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[color:var(--text-secondary)]">
                            已免打扰
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 max-w-[40rem] text-[14px] leading-7 text-[color:var(--text-secondary)]">
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

                <div className="bg-white">
                  <div className="border-b border-[color:var(--border-faint)] px-7 py-3">
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

                  <div className="bg-white px-7 py-5">
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

                        <div className="overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-white">
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
                      <div className="space-y-4">
                        <div className="overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-white">
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
                            last
                          />
                        </div>
                        <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.62)] p-4">
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
              <OfficialWorkspaceStatusPane
                title="还没有可浏览的公众号"
                description="先从左侧选择一个公众号，或切回常看与文章模式查看精选流。"
                className="mx-auto mt-5 max-w-[560px]"
              />
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
    <div className="min-h-0 flex-1 overflow-auto bg-white">
      <div className="mx-auto max-w-[820px]">
        <section className="border-b border-[color:var(--border-faint)] px-7 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                常看与文章
              </div>
              <div className="mt-1 text-[18px] font-medium text-[color:var(--text-primary)]">
                最近常读和最新推送
              </div>
            </div>
            <div className="text-[11px] text-[color:var(--text-muted)]">
              按最近推送排序
            </div>
          </div>
        </section>

        {loading ? (
          <OfficialWorkspaceStatusPane
            title="正在整理公众号内容"
            description="稍等一下，正在准备最近常读和最新推送。"
            tone="loading"
            className="mx-7 my-5"
          />
        ) : null}
        {errorMessage ? (
          <OfficialWorkspaceStatusPane
            title="公众号内容暂时不可用"
            description={errorMessage}
            tone="danger"
            className="mx-7 my-5"
          />
        ) : null}

        {!loading && !errorMessage ? (
          <>
            <section className="border-b border-[color:var(--border-faint)] px-7 py-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                  常看公众号
                </div>
                <div className="text-[11px] text-[color:var(--text-muted)]">
                  {frequentAccounts.length} 个
                </div>
              </div>

              {frequentAccounts.length ? (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {frequentAccounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => onOpenAccount(account.id)}
                      className="flex items-center gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.62)] px-4 py-3 text-left transition hover:bg-white"
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
                          {account.accountType === "service"
                            ? "服务号"
                            : "订阅号"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[16px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.62)] px-4 py-5 text-center">
                  <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                    还没有常看的公众号
                  </div>
                  <p className="mx-auto mt-1.5 max-w-[22rem] text-[12px] leading-6 text-[color:var(--text-secondary)]">
                    关注几个公众号后，这里会优先展示最近常看的号。
                  </p>
                </div>
              )}
            </section>

            <section className="pb-4">
              <div className="border-b border-[color:var(--border-faint)] px-7 py-3">
                <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                  最近内容
                </div>
              </div>

              {feedItems.length ? (
                <div>
                  {feedItems.map((item) => (
                    <DesktopOfficialFeedArticleRow
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
                <OfficialWorkspaceStatusPane
                  title="还没有可读文章"
                  description="可以换个关键词试试，或先关注几个公众号。"
                  className="mx-7 my-5"
                />
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DesktopOfficialFeedArticleRow({
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
        "border-b border-[color:var(--border-faint)] px-7 py-4 transition",
        active ? "bg-[rgba(7,193,96,0.04)]" : "bg-white hover:bg-[rgba(15,23,42,0.015)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onOpenAccount}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-[#fa5151]" />
              ) : null}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-[color:var(--text-muted)]">
            {formatDesktopMessageTimestamp(
              item.deliveredAt ?? item.article.publishedAt,
            )}
          </div>
          <button
            type="button"
            onClick={onToggleFavorite}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border transition",
              favorite
                ? "border-[#d8d1a9] bg-[#fbf7e8] text-[#8a6b11]"
                : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-muted)] hover:bg-[rgba(247,250,250,0.92)] hover:text-[color:var(--text-primary)]",
            )}
            aria-label={favorite ? "取消收藏文章" : "收藏文章"}
          >
            <Star size={14} className={favorite ? "fill-current" : ""} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenArticle}
        className={cn(
          "mt-3 flex w-full items-start gap-3 rounded-[18px] border px-4 py-4 text-left transition",
          active
            ? "border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.06)]"
            : "border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.62)] hover:bg-white",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] text-[color:var(--text-muted)]">
            {item.article.isPinned ? (
              <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-1.5 py-0.5 text-[9px] text-[color:var(--brand-primary)]">
                置顶
              </span>
            ) : null}
            <span>{item.article.authorName}</span>
          </div>
          <div className="mt-2 text-[15px] font-medium leading-6 text-[color:var(--text-primary)]">
            {item.article.title}
          </div>
          <div className="mt-1.5 line-clamp-2 text-[12px] leading-6 text-[color:var(--text-secondary)]">
            {item.article.summary}
          </div>
        </div>
        {item.article.coverImage ? (
          <img
            src={item.article.coverImage}
            alt={item.article.title}
            className="h-[5.5rem] w-[5.5rem] shrink-0 rounded-[12px] border border-[color:var(--border-faint)] object-cover"
          />
        ) : (
          <div className="flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center rounded-[12px] border border-[color:var(--border-faint)] bg-white text-[11px] text-[color:var(--text-dim)]">
            文章
          </div>
        )}
      </button>
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
    <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          <div className="mt-1.5 text-sm leading-7 text-[color:var(--text-secondary)]">
            {description}
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={actionDisabled}
          className="shrink-0 rounded-full border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.82)] text-[color:var(--text-secondary)] shadow-none hover:bg-white"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </div>
    </section>
  );
}

function DesktopOfficialProfileRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex items-center justify-between gap-3 bg-white px-4 py-3",
        last ? undefined : "border-b border-[color:var(--border-faint)]",
      )}
    >
      <div className="text-sm text-[color:var(--text-muted)]">{label}</div>
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </section>
  );
}

function OfficialWorkspaceStatusPane({
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
    <section
      className={cn(
        "rounded-[18px] border px-4 py-5 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.98),rgba(254,242,242,0.95))]"
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
      <div className={cn("font-medium text-[color:var(--text-primary)]", tone === "loading" ? "mt-3" : undefined)}>
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[26rem] text-[12px] leading-6 text-[color:var(--text-secondary)]">
        {description}
      </p>
    </section>
  );
}

function OfficialWorkspaceInlineNotice({
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

function matchesOfficialAccountKeyword(
  account: OfficialAccountSummary,
  normalizedKeyword: string,
) {
  return [account.name, account.description, account.handle].some((field) =>
    field.toLowerCase().includes(normalizedKeyword),
  );
}
