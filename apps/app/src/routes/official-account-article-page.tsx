import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import {
  getOfficialAccountArticle,
  markOfficialAccountArticleRead,
} from "@yinjie/contracts";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";
import { OfficialArticleViewer } from "../components/official-article-viewer";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildOfficialArticleFavoriteRecord } from "../features/favorites/official-account-favorite-records";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import {
  buildMobileOfficialRouteHash,
  parseMobileOfficialRouteState,
} from "../features/official-accounts/mobile-official-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatConversationTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopOfficialArticleRouteShell = lazy(async () => {
  const mod =
    await import("../features/official-accounts/official-article-route-shell");
  return { default: mod.OfficialArticleRouteShell };
});

export function OfficialAccountArticlePage() {
  const { articleId } = useParams({
    from: "/official-accounts/articles/$articleId",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在打开桌面公众号文章"
            description="正在载入桌面文章阅读视图，马上显示当前内容。"
            loadingLabel="载入桌面公众号文章..."
          />
        }
      >
        <DesktopOfficialArticleRouteShell articleId={articleId} />
      </Suspense>
    );
  }

  return <MobileOfficialAccountArticlePage articleId={articleId} />;
}

function MobileOfficialAccountArticlePage({
  articleId,
}: {
  articleId: string;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const lastMarkedArticleIdRef = useRef<string | null>(null);
  const routeState = useMemo(() => parseMobileOfficialRouteState(hash), [hash]);
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>(() =>
    readDesktopFavorites().map((item) => item.sourceId),
  );
  const [shareNotice, setShareNotice] = useState<{
    message: string;
    tone: "success" | "info";
  } | null>(null);
  const nativeMobileShareSupported = isNativeMobileShareSurface();

  const articleQuery = useQuery({
    queryKey: ["app-official-account-article", baseUrl, articleId],
    queryFn: () => getOfficialAccountArticle(articleId, baseUrl),
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

  const article = articleQuery.data;
  const articleFavoriteSourceId = article
    ? `official-article-${article.id}`
    : null;
  const articlePath = `/official-accounts/articles/${articleId}`;
  const articleUrl =
    typeof window === "undefined"
      ? articlePath
      : `${window.location.origin}${articlePath}`;
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildMobileOfficialRouteHash({
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [safeReturnHash, safeReturnPath],
  );

  useEffect(() => {
    if (!article?.id || lastMarkedArticleIdRef.current === article.id) {
      return;
    }

    lastMarkedArticleIdRef.current = article.id;
    markReadMutation.mutate(article.id);
  }, [article?.id, markReadMutation]);

  function navigateToRouteStateReturn() {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  }

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    if (article?.account.id) {
      void navigate({
        to: "/official-accounts/$accountId",
        params: { accountId: article.account.id },
      });
      return;
    }

    void navigate({ to: "/contacts/official-accounts" });
  }

  function handleRetryMarkRead() {
    if (!article?.id) {
      return;
    }

    setShareNotice(null);
    markReadMutation.mutate(article.id);
  }

  function handleRetryArticle() {
    void articleQuery.refetch();
  }

  const statusBackLabel = safeReturnPath
    ? "返回上一页"
    : article?.account.id
      ? "返回公众号主页"
      : "返回公众号列表";

  function toggleArticleFavorite() {
    if (!article) {
      return;
    }

    const sourceId = `official-article-${article.id}`;
    const nextFavorites = favoriteSourceIds.includes(sourceId)
      ? removeDesktopFavorite(sourceId)
      : upsertDesktopFavorite(buildOfficialArticleFavoriteRecord(article));

    setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
  }

  async function handleCopyArticleLink() {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setShareNotice({
        message: nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制文章链接。",
        tone: "info",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(articleUrl);
      setShareNotice({
        message: nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制文章链接。"
          : "文章链接已复制。",
        tone: "success",
      });
    } catch {
      setShareNotice({
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制文章链接失败，请稍后重试。",
        tone: "info",
      });
    }
  }

  async function handleShareArticle() {
    if (!article) {
      return;
    }

    if (!nativeMobileShareSupported) {
      await handleCopyArticleLink();
      return;
    }

    const shared = await shareWithNativeShell({
      title: article.title,
      text: `${article.account.name}\n${article.title}`,
      url: articleUrl,
    });

    if (shared) {
      setShareNotice({
        message: "已打开系统分享面板。",
        tone: "success",
      });
      return;
    }

    await handleCopyArticleLink();
  }

  return (
    <AppPage className="space-y-0 bg-white px-0 py-0">
      <TabPageTopBar
        title={article?.account.name ?? "公众号文章"}
        subtitle={
          article
            ? `${article.authorName} · ${formatConversationTimestamp(article.publishedAt)}`
            : undefined
        }
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.96)] px-4 pb-2 pt-2 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() => {
              navigateBackOrFallback(() => {
                if (navigateToRouteStateReturn()) {
                  return;
                }

                if (article?.account.id) {
                  void navigate({
                    to: "/official-accounts/$accountId",
                    params: { accountId: article.account.id },
                  });
                  return;
                }

                void navigate({ to: "/contacts/official-accounts" });
              });
            }}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          article ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
              onClick={() => void handleShareArticle()}
              aria-label={
                nativeMobileShareSupported ? "分享文章" : "复制文章链接"
              }
            >
              {nativeMobileShareSupported ? (
                <Share2 size={17} />
              ) : (
                <Copy size={17} />
              )}
            </Button>
          ) : null
        }
      />

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {articleQuery.isLoading ? (
          <div className="mx-auto max-w-[24rem] px-4 pt-2">
            <MobileOfficialArticleStatusCard
              badge="读取中"
              title="正在读取文章"
              description="稍等一下，正在同步正文内容和阅读状态。"
              tone="loading"
            />
          </div>
        ) : null}
        {articleQuery.isError && articleQuery.error instanceof Error ? (
          <div className="mx-auto max-w-[24rem] px-4 pt-2">
            <MobileOfficialArticleStatusCard
              badge="读取失败"
              title="文章暂时不可用"
              description={articleQuery.error.message}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleRetryArticle}
                  >
                    重试读取
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {statusBackLabel}
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}
        {markReadMutation.isError && markReadMutation.error instanceof Error ? (
          <div className="mx-auto max-w-[24rem] px-4 pt-2">
            <MobileOfficialArticleStatusCard
              badge="同步失败"
              title="阅读状态暂未同步"
              description={markReadMutation.error.message}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {article?.id ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                      onClick={handleRetryMarkRead}
                    >
                      重试同步
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {statusBackLabel}
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}
        {shareNotice ? (
          <div className="mx-auto max-w-[24rem] px-4 pt-2">
            <InlineNotice
              className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
              tone={shareNotice.tone}
            >
              {shareNotice.tone === "info" ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1">{shareNotice.message}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {statusBackLabel}
                  </Button>
                </div>
              ) : (
                shareNotice.message
              )}
            </InlineNotice>
          </div>
        ) : null}
        {!articleQuery.isLoading && !articleQuery.isError && !article ? (
          <div className="mx-auto max-w-[24rem] px-4 pt-2">
            <MobileOfficialArticleStatusCard
              badge="公众号文章"
              title="这篇文章暂时不可用"
              description="可以先回上一页，稍后再试。"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={handleStatusBack}
                >
                  {statusBackLabel}
                </Button>
              }
            />
          </div>
        ) : null}

        {article ? (
          <OfficialArticleViewer
            article={article}
            mobile
            favorite={
              articleFavoriteSourceId
                ? favoriteSourceIds.includes(articleFavoriteSourceId)
                : false
            }
            showShareAction={false}
            onOpenAccount={(accountId) => {
              void navigate({
                to: "/official-accounts/$accountId",
                params: { accountId },
                hash: buildMobileOfficialRouteHash({
                  returnPath: pathname,
                  returnHash: currentRouteHash || undefined,
                }),
              });
            }}
            onOpenArticle={(nextArticleId) => {
              void navigate({
                to: "/official-accounts/articles/$articleId",
                params: { articleId: nextArticleId },
                hash: buildMobileOfficialRouteHash({
                  returnPath: pathname,
                  returnHash: currentRouteHash || undefined,
                }),
              });
            }}
            onToggleFavorite={toggleArticleFavorite}
          />
        ) : null}
      </div>
    </AppPage>
  );
}

function MobileOfficialArticleStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
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
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}
