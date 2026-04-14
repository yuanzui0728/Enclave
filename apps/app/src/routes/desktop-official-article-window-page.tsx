import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, X } from "lucide-react";
import {
  getOfficialAccountArticle,
  markOfficialAccountArticleRead,
} from "@yinjie/contracts";
import { Button, InlineNotice } from "@yinjie/ui";
import { OfficialArticleViewer } from "../components/official-article-viewer";
import { EmptyState } from "../components/empty-state";
import { buildOfficialArticleFavoriteRecord } from "../features/desktop/favorites/official-account-favorite-records";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import {
  buildDesktopOfficialArticleWindowPath,
  buildDesktopOfficialArticleWindowRouteHash,
  parseDesktopOfficialArticleWindowRouteHash,
} from "../features/desktop/official-accounts/desktop-official-article-window-route-state";
import {
  closeCurrentDesktopWindow,
  DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
  focusMainDesktopWindow,
  type DesktopStandaloneWindowNavigatePayload,
} from "../runtime/desktop-windowing";
import { openExternalUrl } from "../runtime/external-url";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DesktopOfficialArticleWindowPage() {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopShell = runtimeConfig.appPlatform === "desktop";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(
    () => parseDesktopOfficialArticleWindowRouteHash(hash),
    [hash],
  );
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>(() =>
    readDesktopFavorites().map((item) => item.sourceId),
  );
  const [notice, setNotice] = useState<string | null>(null);

  const articleQuery = useQuery({
    queryKey: ["app-official-account-article", baseUrl, routeState?.articleId],
    queryFn: () => getOfficialAccountArticle(routeState!.articleId, baseUrl),
    enabled: Boolean(routeState?.articleId),
  });

  const markReadMutation = useMutation({
    mutationFn: (articleId: string) =>
      markOfficialAccountArticleRead(articleId, baseUrl),
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
          queryKey: ["app-official-accounts", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "app-official-account",
            baseUrl,
            updatedArticle.account.id,
          ],
        }),
      ]);
    },
  });

  const article = articleQuery.data;
  const articlePath = article
    ? buildDesktopOfficialArticleWindowPath({
        articleId: article.id,
        accountId: article.account.id,
        title: article.title,
        returnTo: routeState?.returnTo,
      })
    : null;
  const articleSourceId = article ? `official-article-${article.id}` : null;
  const fallbackPath = routeState?.returnTo ?? "/tabs/chat";

  useEffect(() => {
    if (!article?.id || markReadMutation.isPending) {
      return;
    }

    markReadMutation.mutate(article.id);
  }, [article?.id]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!nativeDesktopShell) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    async function bindStandaloneWindowNavigation() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const currentWindow = getCurrentWindow();

        unlisten =
          await currentWindow.listen<DesktopStandaloneWindowNavigatePayload>(
            DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
            ({ payload }) => {
              const nextTarget = payload.targetPath.trim();
              if (
                typeof window !== "undefined" &&
                nextTarget &&
                `${window.location.pathname}${window.location.hash}` !==
                  nextTarget
              ) {
                window.location.assign(nextTarget);
                return;
              }

              if (typeof window !== "undefined") {
                window.focus();
              }
            },
          );

        if (cancelled) {
          unlisten?.();
          unlisten = null;
        }
      } catch {
        // Ignore event binding failures outside the native Tauri shell.
      }
    }

    void bindStandaloneWindowNavigation();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [nativeDesktopShell]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeStandaloneWindow(fallbackPath);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fallbackPath]);

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

  async function handleOpenInBrowser() {
    if (!article) {
      return;
    }

    const articleUrl =
      typeof window === "undefined"
        ? `/official-accounts/articles/${article.id}`
        : `${window.location.origin}/official-accounts/articles/${article.id}`;
    const opened = await openExternalUrl(articleUrl);
    setNotice(opened ? "已在默认浏览器打开文章。" : "打开浏览器失败。");
  }

  function handleOpenAccount(accountId: string) {
    void focusMainDesktopWindow(`/official-accounts/${accountId}`).then(
      (focused) => {
        if (!focused && typeof window !== "undefined") {
          window.location.assign(`/official-accounts/${accountId}`);
        }
      },
    );
  }

  function handleOpenRelatedArticle(articleId: string) {
    if (!article) {
      return;
    }

    const nextPath = buildDesktopOfficialArticleWindowPath({
      articleId,
      accountId: article.account.id,
      returnTo: routeState?.returnTo,
    });
    void navigate({
      to: "/desktop/official-article-window",
      hash: buildDesktopOfficialArticleWindowRouteHash({
        articleId,
        accountId: article.account.id,
        returnTo: routeState?.returnTo,
      }),
      replace: true,
    });

    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", nextPath);
    }
  }

  if (!routeState) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[color:var(--bg-app)] p-6">
        <div className="w-full max-w-lg rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
          <EmptyState
            title="文章窗口缺少上下文"
            description="这篇公众号文章的窗口参数已经失效，请回到公众号页重新打开。"
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => {
                void focusMainDesktopWindow("/tabs/chat");
              }}
              className="h-9 rounded-[9px] bg-[color:var(--brand-primary)] px-4 text-white hover:opacity-95"
            >
              回到消息页
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-app)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] px-4 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="inline-flex rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[11px] tracking-[0.08em] text-[color:var(--brand-primary)]">
            公众号文章
          </div>
          <div className="mt-2 truncate text-[15px] font-medium text-[color:var(--text-primary)]">
            {article?.title ?? routeState.title ?? "正在读取文章"}
          </div>
          <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
            {article?.account.name ?? "在独立窗口中阅读公众号内容"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StandaloneActionButton
            label="回到来源"
            onClick={() => closeStandaloneWindow(fallbackPath)}
          >
            <ArrowLeft size={16} />
          </StandaloneActionButton>
          <StandaloneActionButton
            label="默认浏览器打开"
            onClick={() => {
              void handleOpenInBrowser();
            }}
          >
            <ExternalLink size={16} />
          </StandaloneActionButton>
          <StandaloneActionButton
            label="关闭窗口"
            onClick={() => closeStandaloneWindow(fallbackPath)}
          >
            <X size={16} />
          </StandaloneActionButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-[rgba(255,255,255,0.62)] p-6">
        {notice ? (
          <InlineNotice
            className="mx-auto mb-4 max-w-[840px] text-sm"
            tone="info"
          >
            {notice}
          </InlineNotice>
        ) : null}

        {articleQuery.isLoading ? (
          <div className="mx-auto max-w-[840px] rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
            <EmptyState
              title="正在读取文章"
              description="稍等一下，正在同步正文内容。"
            />
          </div>
        ) : null}

        {articleQuery.isError && articleQuery.error instanceof Error ? (
          <div className="mx-auto max-w-[840px] rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
            <EmptyState
              title="文章暂时不可用"
              description={articleQuery.error.message}
            />
          </div>
        ) : null}

        {article ? (
          <OfficialArticleViewer
            article={article}
            desktopSurface="reader"
            favorite={
              articleSourceId
                ? favoriteSourceIds.includes(articleSourceId)
                : false
            }
            onOpenAccount={handleOpenAccount}
            onOpenArticle={handleOpenRelatedArticle}
            onToggleFavorite={toggleArticleFavorite}
          />
        ) : null}
      </div>
    </div>
  );
}

function StandaloneActionButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
    >
      {children}
    </button>
  );
}

function closeStandaloneWindow(fallbackPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  void closeCurrentDesktopWindow().then((closed) => {
    if (closed) {
      return;
    }

    window.close();
    window.setTimeout(() => {
      if (!window.closed) {
        void focusMainDesktopWindow(fallbackPath).then((focused) => {
          if (!focused) {
            window.location.assign(fallbackPath);
          }
        });
      }
    }, 120);
  });
}
