import { Suspense, lazy, useEffect, useEffectEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Copy, Share2 } from "lucide-react";
import {
  followOfficialAccount,
  getOfficialAccount,
  unfollowOfficialAccount,
} from "@yinjie/contracts";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { OfficialArticleCard } from "../components/official-article-card";
import { RouteRedirectState } from "../components/route-redirect-state";
import {
  buildOfficialAccountFavoriteRecord,
  buildOfficialArticleSummaryFavoriteRecord,
} from "../features/favorites/official-account-favorite-records";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopContactsRouteRedirectShell = lazy(async () => {
  const mod =
    await import("../features/contacts/contacts-route-redirect-shell");
  return { default: mod.ContactsRouteRedirectShell };
});

export function OfficialAccountDetailPage() {
  const { accountId } = useParams({ from: "/official-accounts/$accountId" });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在切换到桌面公众号详情"
            description="正在跳转到桌面通讯录工作区中的公众号详情。"
            loadingLabel="切换桌面公众号详情..."
          />
        }
      >
        <DesktopContactsRouteRedirectShell
          pane="official-accounts"
          accountId={accountId}
        />
      </Suspense>
    );
  }

  return <MobileOfficialAccountDetailPage accountId={accountId} />;
}

function MobileOfficialAccountDetailPage({ accountId }: { accountId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>(() =>
    readDesktopFavorites().map((item) => item.sourceId),
  );
  const [actionNotice, setActionNotice] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);

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
  const headerSubtitle = account
    ? `${account.accountType === "service" ? "服务号" : "订阅号"} · @${
        account.handle
      }${account.isVerified ? " · 已认证" : ""}`
    : undefined;

  async function handleShareAccount() {
    if (!account) {
      return;
    }

    const accountPath = `/official-accounts/${account.id}`;
    const accountUrl =
      typeof window === "undefined"
        ? accountPath
        : `${window.location.origin}${accountPath}`;
    const accountSummary = [
      `${account.name} 公众号`,
      account.accountType === "service" ? "服务号" : "订阅号",
      `@${account.handle}`,
      accountUrl,
    ].join("\n");

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${account.name} 公众号`,
        text: accountSummary,
        url: accountUrl,
      });

      if (shared) {
        setActionNotice({
          tone: "success",
          message: "已打开系统分享面板。",
        });
        return;
      }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setActionNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制公众号摘要。",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(accountSummary);
      setActionNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制公众号摘要。"
          : "公众号摘要已复制。",
      });
    } catch {
      setActionNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制公众号摘要失败，请稍后重试。",
      });
    }
  }

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
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={account?.name ?? "公众号主页"}
        subtitle={headerSubtitle}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.96)] px-4 pb-2 pt-2 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/contacts/official-accounts" });
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
          account ? (
            <Button
              type="button"
              onClick={() => void handleShareAccount()}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
              aria-label={
                nativeMobileShareSupported ? "分享公众号" : "复制公众号摘要"
              }
            >
              {nativeMobileShareSupported ? (
                <Share2 size={17} />
              ) : (
                <Copy size={17} />
              )}
            </Button>
          ) : undefined
        }
      />

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {accountQuery.isLoading ? (
          <div className="mx-auto max-w-[24rem] px-3.5 pt-3">
            <MobileOfficialStatusCard
              badge="读取中"
              title="正在读取公众号"
              description="稍等一下，正在同步账号资料和最近文章。"
              tone="loading"
            />
          </div>
        ) : null}
        {accountQuery.isError && accountQuery.error instanceof Error ? (
          <div className="mx-auto max-w-[24rem] px-3.5 pt-3">
            <MobileOfficialStatusCard
              badge="读取失败"
              title="公众号主页暂时不可用"
              description={accountQuery.error.message}
              tone="danger"
            />
          </div>
        ) : null}
        {actionNotice ? (
          <div className="mx-auto max-w-[24rem] px-3.5 pt-3">
            <InlineNotice
              className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
              tone={actionNotice.tone}
            >
              {actionNotice.message}
            </InlineNotice>
          </div>
        ) : null}

        {account ? (
          <>
            <section className="mx-3.5 mt-3 overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 pb-4 pt-5">
              <div className="flex flex-col items-center text-center">
                <AvatarChip
                  name={account.name}
                  src={account.avatar}
                  size="xl"
                />
                <div className="mt-3 truncate text-[19px] font-semibold text-[color:var(--text-primary)]">
                  {account.name}
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                  @{account.handle}
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-[10px]">
                  <span className="rounded-full bg-[rgba(47,122,63,0.12)] px-2 py-0.5 text-[#2f7a3f]">
                    {account.accountType === "service" ? "服务号" : "订阅号"}
                  </span>
                  {account.isVerified ? (
                    <span className="rounded-full bg-[rgba(37,99,235,0.12)] px-2 py-0.5 text-[#2563eb]">
                      已认证
                    </span>
                  ) : null}
                  {account.isFollowing ? (
                    <span className="rounded-full bg-[rgba(7,193,96,0.1)] px-2 py-0.5 text-[color:var(--brand-primary)]">
                      已关注
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 max-w-[20rem] text-[12px] leading-6 text-[color:var(--text-secondary)]">
                  {account.description}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                  variant={account.isFollowing ? "secondary" : "primary"}
                  className="h-9 w-full rounded-[12px] text-[12px]"
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
                  className="h-9 w-full rounded-[12px] text-[12px]"
                >
                  {accountFavoriteSourceId &&
                  favoriteSourceIds.includes(accountFavoriteSourceId)
                    ? "取消收藏"
                    : "收藏主页"}
                </Button>
              </div>

              {followMutation.isError &&
              followMutation.error instanceof Error ? (
                <div className="mt-3">
                  <InlineNotice
                    className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
                    tone="danger"
                  >
                    {followMutation.error.message}
                  </InlineNotice>
                </div>
              ) : null}
            </section>

            <section className="mx-3.5 mt-3 overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-white">
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
                  <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                    {account.accountType === "service"
                      ? "服务号消息"
                      : "订阅号消息"}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-[1.125rem] text-[color:var(--text-muted)]">
                    {account.isFollowing
                      ? account.accountType === "service"
                        ? "已关注，可直接进入服务消息线程。"
                        : "已关注，后续推送会汇总到订阅号消息。"
                      : "关注后可从消息页查看这类内容。"}
                  </div>
                </div>
                {account.isFollowing ? (
                  <ChevronRight
                    size={14}
                    className="shrink-0 text-[color:var(--text-muted)]"
                  />
                ) : null}
              </button>
            </section>

            <section className="mx-3.5 mt-3 overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-white">
              <div className="border-b border-[color:var(--border-faint)] px-4 py-2.5">
                <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                  最近文章
                </div>
                <div className="mt-0.5 text-[10px] leading-[1.125rem] text-[color:var(--text-muted)]">
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
                  dense
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

function MobileOfficialStatusCard({
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
