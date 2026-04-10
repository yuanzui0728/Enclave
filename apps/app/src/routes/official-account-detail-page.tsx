import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  followOfficialAccount,
  getOfficialAccount,
  unfollowOfficialAccount,
} from "@yinjie/contracts";
import {
  AppHeader,
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
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

  useEffect(() => {
    followMutation.reset();
  }, [accountId, baseUrl]);

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
    <AppPage>
      <AppHeader
        eyebrow="公众号"
        title={account?.name ?? "公众号主页"}
        description={
          account?.description ?? "查看账号资料、最近文章和历史推送。"
        }
        actions={
          <Button
            onClick={() => navigate({ to: "/contacts/official-accounts" })}
            variant="ghost"
            size="icon"
            className="text-[color:var(--text-secondary)]"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      {accountQuery.isLoading ? (
        <LoadingBlock label="正在读取公众号..." />
      ) : null}
      {accountQuery.isError && accountQuery.error instanceof Error ? (
        <ErrorBlock message={accountQuery.error.message} />
      ) : null}

      {account ? (
        <>
          <AppSection className="space-y-5 p-6">
            <div className="flex items-center gap-4">
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
                    <span className="rounded-full bg-[rgba(93,103,201,0.12)] px-3 py-1 text-[#4951a3]">
                      已认证
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => followMutation.mutate()}
                disabled={followMutation.isPending}
                variant={account.isFollowing ? "secondary" : "primary"}
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
              >
                {accountFavoriteSourceId &&
                favoriteSourceIds.includes(accountFavoriteSourceId)
                  ? "取消收藏"
                  : "收藏主页"}
              </Button>
            </div>

            {followMutation.isError && followMutation.error instanceof Error ? (
              <ErrorBlock message={followMutation.error.message} />
            ) : null}
          </AppSection>

          <AppSection className="space-y-3">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {account.accountType === "service" ? "服务消息" : "订阅号消息"}
            </div>
            <div className="text-sm leading-7 text-[color:var(--text-secondary)]">
              {account.accountType === "service"
                ? "服务号后续会作为独立消息项进入消息页，承接通知、文章卡片和菜单回复。"
                : "订阅号后续会收口到“消息 -> 订阅号消息”聚合入口，不会长期占据普通私聊列表。"}
            </div>
            <InlineNotice tone="info">
              {account.accountType === "service"
                ? account.isFollowing
                  ? "已关注后，这个服务号会作为独立消息项出现在消息列表。"
                  : "关注后，这个服务号会作为独立消息项出现在消息列表。"
                : account.isFollowing
                  ? "已关注后，后续推送会汇总到订阅号消息聚合流。"
                  : "关注后，后续推送会汇总到订阅号消息聚合流。"}
            </InlineNotice>
            {account.isFollowing ? (
              <Button
                type="button"
                variant="secondary"
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
              >
                {account.accountType === "service"
                  ? "打开服务消息"
                  : "打开订阅号消息"}
              </Button>
            ) : null}
          </AppSection>

          <AppSection className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                最近文章
              </div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                对齐微信式公众号主页，从账号资料进入最近推送与历史文章。
              </div>
            </div>

            {account.articles.map((article) => (
              <OfficialArticleCard
                key={article.id}
                article={article}
                compact
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
          </AppSection>
        </>
      ) : null}
    </AppPage>
  );
}
