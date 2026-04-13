import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import {
  getOfficialAccountArticle,
  markOfficialAccountArticleRead,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { OfficialArticleViewer } from "../components/official-article-viewer";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildOfficialArticleFavoriteRecord } from "../features/desktop/favorites/official-account-favorite-records";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { DesktopOfficialAccountsWorkspace } from "../features/desktop/official-accounts/desktop-official-accounts-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import {
  isNativeMobileBridgeAvailable,
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function OfficialAccountArticlePage() {
  const { articleId } = useParams({
    from: "/official-accounts/articles/$articleId",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopOfficialAccountsWorkspace selectedArticleId={articleId} />;
  }

  return <MobileOfficialAccountArticlePage articleId={articleId} />;
}

function MobileOfficialAccountArticlePage({
  articleId,
}: {
  articleId: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const lastMarkedArticleIdRef = useRef<string | null>(null);
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>(() =>
    readDesktopFavorites().map((item) => item.sourceId),
  );
  const [shareNotice, setShareNotice] = useState<{
    message: string;
    tone: "success" | "info";
  } | null>(null);
  const nativeMobileShareSupported = isNativeMobileBridgeAvailable();

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

  useEffect(() => {
    if (!article?.id || lastMarkedArticleIdRef.current === article.id) {
      return;
    }

    lastMarkedArticleIdRef.current = article.id;
    markReadMutation.mutate(article.id);
  }, [article?.id, markReadMutation]);

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
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={article?.account.name ?? "公众号文章"}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() => {
              navigateBackOrFallback(() => {
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
              aria-label={nativeMobileShareSupported ? "分享文章" : "复制文章链接"}
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
          <div className="px-4 pt-2">
            <LoadingBlock label="正在读取文章..." />
          </div>
        ) : null}
        {articleQuery.isError && articleQuery.error instanceof Error ? (
          <div className="px-4 pt-2">
            <ErrorBlock message={articleQuery.error.message} />
          </div>
        ) : null}
        {markReadMutation.isError && markReadMutation.error instanceof Error ? (
          <div className="px-4 pt-2">
            <ErrorBlock message={markReadMutation.error.message} />
          </div>
        ) : null}
        {shareNotice ? (
          <div className="px-4 pt-2">
            <InlineNotice className="text-[12px] leading-5" tone={shareNotice.tone}>
              {shareNotice.message}
            </InlineNotice>
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
        ) : null}
      </div>
    </AppPage>
  );
}
