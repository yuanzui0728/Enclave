import { useEffect, useEffectEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import {
  followOfficialAccount,
  getOfficialAccount,
  unfollowOfficialAccount,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  LoadingBlock,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { OfficialArticleCard } from "../components/official-article-card";
import { buildOfficialAccountFavoriteRecord } from "../features/desktop/favorites/official-account-favorite-records";
import { buildOfficialArticleSummaryFavoriteRecord } from "../features/desktop/favorites/official-account-favorite-records";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { DesktopOfficialAccountsWorkspace } from "../features/desktop/official-accounts/desktop-official-accounts-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function OfficialAccountDetailPage() {
  const { accountId } = useParams({ from: "/official-accounts/$accountId" });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopOfficialAccountsWorkspace selectedAccountId={accountId} />;
  }

  return <MobileOfficialAccountDetailPage accountId={accountId} />;
}

function MobileOfficialAccountDetailPage({ accountId }: { accountId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>(() =>
    readDesktopFavorites().map((item) => item.sourceId),
  );

  const accountQuery = useQuery({
    queryKey: ["app-official-account", baseUrl, accountId],
    queryFn: () => getOfficialAccount(accountId, baseUrl),
  });

  const followMutation = useMutation({
    mutationFn: () =>
      accountQuery.data?.isFollowing
        ? unfollowOfficialAccount(accountId, baseUrl)
        : followOfficialAccount(accountId, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-official-accounts", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-official-account", baseUrl, accountId],
        }),
      ]);
    },
  });

  const resetFollowMutation = useEffectEvent(() => {
    followMutation.reset();
  });

  useEffect(() => {
    resetFollowMutation();
  }, [accountId, baseUrl, resetFollowMutation]);

  const account = accountQuery.data;
  const accountFavoriteSourceId = account ? `official-${account.id}` : null;

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

  function toggleArticleFavorite(articleId: string) {
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

  return (
    <AppPage className="space-y-0 bg-[#f5f5f5] px-0 py-0">
      <TabPageTopBar
        title={account?.name ?? "公众号主页"}
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 py-3 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/contacts/official-accounts" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)]"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {accountQuery.isLoading ? (
          <div className="px-3 pt-3">
            <LoadingBlock label="正在读取公众号..." />
          </div>
        ) : null}
        {accountQuery.isError && accountQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={accountQuery.error.message} />
          </div>
        ) : null}

        {account ? (
          <>
          <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-white">
            <div className="flex items-center gap-4 px-4 py-4">
              <AvatarChip name={account.name} src={account.avatar} size="lg" />
              <div className="min-w-0">
                <div className="text-xl font-semibold text-[color:var(--text-primary)]">
                  {account.name}
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  @{account.handle}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-[rgba(47,122,63,0.12)] px-3 py-1 text-[#2f7a3f]">
                    {account.accountType === "service" ? "服务号" : "订阅号"}
                  </span>
                  {account.isVerified ? (
                    <span className="rounded-full bg-[rgba(37,99,235,0.12)] px-3 py-1 text-[#2563eb]">
                      已认证
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-[color:var(--border-faint)] px-4 py-3">
              <Button
                type="button"
                onClick={() => followMutation.mutate()}
                disabled={followMutation.isPending}
                variant={account.isFollowing ? "secondary" : "primary"}
                className="w-full rounded-[10px]"
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
                className="w-full rounded-[10px]"
              >
                {accountFavoriteSourceId &&
                favoriteSourceIds.includes(accountFavoriteSourceId)
                  ? "取消收藏"
                  : "收藏主页"}
              </Button>
            </div>

            {followMutation.isError && followMutation.error instanceof Error ? (
              <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
                <ErrorBlock message={followMutation.error.message} />
              </div>
            ) : null}
          </section>

          <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-white">
            <button
              type="button"
              disabled={!account.isFollowing}
              onClick={() => {
                if (account.accountType === "service") {
                  void navigate({
                    to: "/official-accounts/service/$accountId",
                    params: { accountId: account.id },
                  });
                  return;
                }

                void navigate({ to: "/chat/subscription-inbox" });
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default disabled:opacity-80"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                  {account.accountType === "service" ? "服务消息" : "订阅号消息"}
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  {account.isFollowing
                    ? account.accountType === "service"
                      ? "已关注，可直接进入服务消息线程。"
                      : "已关注，后续推送会汇总到订阅号消息。"
                    : "关注后可从消息页查看这类内容。"}
                </div>
              </div>
              {account.isFollowing ? (
                <ChevronRight
                  size={16}
                  className="shrink-0 text-[color:var(--text-dim)]"
                />
              ) : null}
            </button>
          </section>

          <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-white">
            <div className="border-b border-[color:var(--border-faint)] px-5 py-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                最近文章
              </div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                {account.articles.length
                  ? `${account.articles.length} 篇最近推送`
                  : "这个公众号还没有公开文章。"}
              </div>
            </div>

            {account.articles.map((article) => (
              <OfficialArticleCard
                key={article.id}
                article={article}
                favorite={favoriteSourceIds.includes(
                  `official-article-${article.id}`,
                )}
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/articles/$articleId",
                    params: { articleId: article.id },
                  });
                }}
                onToggleFavorite={() => toggleArticleFavorite(article.id)}
              />
            ))}
          </section>
          </>
        ) : null}
      </div>
    </AppPage>
  );
}
