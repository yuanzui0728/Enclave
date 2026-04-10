import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  followOfficialAccount,
  getOfficialAccount,
  getOfficialAccountArticle,
  listOfficialAccounts,
  markOfficialAccountArticleRead,
  unfollowOfficialAccount,
} from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock, TextField } from "@yinjie/ui";
import { OfficialAccountListItem } from "../../../components/official-account-list-item";
import { OfficialArticleCard } from "../../../components/official-article-card";
import { OfficialArticleViewer } from "../../../components/official-article-viewer";
import { EmptyState } from "../../../components/empty-state";
import {
  buildOfficialAccountFavoriteRecord,
  buildOfficialArticleFavoriteRecord,
} from "../favorites/official-account-favorite-records";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../favorites/desktop-favorites-storage";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function DesktopOfficialAccountsWorkspace({
  selectedAccountId,
  selectedArticleId,
}: {
  selectedAccountId?: string;
  selectedArticleId?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const lastMarkedArticleIdRef = useRef<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [accountFilter, setAccountFilter] = useState<"all" | "following">(
    "all",
  );
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>(() =>
    readDesktopFavorites().map((item) => item.sourceId),
  );

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

  const pinnedArticleQuery = useQuery({
    queryKey: ["app-official-account-article", baseUrl, selectedArticleId],
    queryFn: () => getOfficialAccountArticle(selectedArticleId!, baseUrl),
    enabled: Boolean(selectedArticleId),
  });

  const effectiveAccountId = useMemo(() => {
    if (selectedAccountId) {
      return selectedAccountId;
    }

    if (pinnedArticleQuery.data?.account.id) {
      return pinnedArticleQuery.data.account.id;
    }

    return filteredAccounts[0]?.id ?? accountsQuery.data?.[0]?.id;
  }, [
    accountsQuery.data,
    filteredAccounts,
    pinnedArticleQuery.data?.account.id,
    selectedAccountId,
  ]);

  const accountDetailQuery = useQuery({
    queryKey: ["app-official-account", baseUrl, effectiveAccountId],
    queryFn: () => getOfficialAccount(effectiveAccountId!, baseUrl),
    enabled: Boolean(effectiveAccountId),
  });

  const activeArticleId =
    selectedArticleId ?? accountDetailQuery.data?.articles[0]?.id;

  const articleDetailQuery = useQuery({
    queryKey: ["app-official-account-reader", baseUrl, activeArticleId],
    queryFn: () => getOfficialAccountArticle(activeArticleId!, baseUrl),
    enabled: Boolean(activeArticleId),
  });

  const activeArticle = selectedArticleId
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

  return (
    <div className="flex h-full min-h-0 bg-[linear-gradient(180deg,rgba(255,252,245,0.96),rgba(255,248,236,0.98))]">
      <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,248,238,0.96))]">
        <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
          <div className="text-base font-medium text-[color:var(--text-primary)]">
            公众号
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            从通讯录进入，按微信式阅读路径浏览账号与文章。
          </div>
          <TextField
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜索公众号"
            className="mt-3 rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2.5 shadow-none hover:bg-white focus:shadow-none"
          />
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={accountFilter === "all" ? "primary" : "secondary"}
              onClick={() => setAccountFilter("all")}
              className="rounded-full"
            >
              全部
            </Button>
            <Button
              type="button"
              size="sm"
              variant={accountFilter === "following" ? "primary" : "secondary"}
              onClick={() => setAccountFilter("following")}
              className="rounded-full"
            >
              已关注
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {accountsQuery.isLoading ? (
            <LoadingBlock label="正在读取公众号..." />
          ) : null}
          {accountsQuery.isError && accountsQuery.error instanceof Error ? (
            <ErrorBlock message={accountsQuery.error.message} />
          ) : null}

          {filteredAccounts.map((entry) => (
            <OfficialAccountListItem
              key={entry.id}
              account={entry}
              active={entry.id === effectiveAccountId}
              onClick={() => {
                void navigate({
                  to: "/official-accounts/$accountId",
                  params: { accountId: entry.id },
                });
              }}
            />
          ))}

          {!accountsQuery.isLoading && !filteredAccounts.length ? (
            <div className="p-3">
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

      <section className="flex w-[420px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(255,249,240,0.76)]">
        <div className="border-b border-[color:var(--border-faint)] px-5 py-5">
          <div className="text-xs uppercase tracking-[0.26em] text-[color:var(--text-muted)]">
            账号主页
          </div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
            {account?.name ?? "公众号"}
          </div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            {account?.description ?? "这里会展示账号资料、最近文章和历史推送。"}
          </div>
          {account ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[rgba(47,122,63,0.12)] px-3 py-1 text-[#2f7a3f]">
                {account.accountType === "service" ? "服务号" : "订阅号"}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-[color:var(--text-muted)]">
                @{account.handle}
              </span>
              {account.isFollowing ? (
                <span className="rounded-full bg-[rgba(93,103,201,0.12)] px-3 py-1 text-[#4951a3]">
                  已关注
                </span>
              ) : null}
            </div>
          ) : null}
          {account ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant={account.isFollowing ? "secondary" : "primary"}
                onClick={() => followMutation.mutate()}
                disabled={followMutation.isPending}
                className="rounded-full"
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
                className="rounded-full"
              >
                {accountFavoriteSourceId &&
                favoriteSourceIds.includes(accountFavoriteSourceId)
                  ? "取消收藏"
                  : "收藏主页"}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
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

          {account?.articles?.map((article) => (
            <OfficialArticleCard
              key={article.id}
              article={article}
              active={article.id === activeArticleId}
              onClick={() => {
                void navigate({
                  to: "/official-accounts/articles/$articleId",
                  params: { articleId: article.id },
                });
              }}
            />
          ))}
        </div>
      </section>

      <section className="min-w-0 flex-1 overflow-auto p-6">
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
            onOpenAccount={(accountId) => {
              void navigate({
                to: "/official-accounts/$accountId",
                params: { accountId },
              });
            }}
            onOpenArticle={(nextArticleId) => {
              void navigate({
                to: "/official-accounts/articles/$articleId",
                params: { articleId: nextArticleId },
              });
            }}
            onToggleFavorite={toggleArticleFavorite}
          />
        ) : (
          <EmptyState
            title="还没有可读内容"
            description="先从左侧选择一个公众号，或等待该账号发布第一篇文章。"
          />
        )}
      </section>
    </div>
  );
}
