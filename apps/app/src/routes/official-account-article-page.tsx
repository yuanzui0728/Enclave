import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  getOfficialAccountArticle,
  markOfficialAccountArticleRead,
} from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { OfficialArticleViewer } from "../components/official-article-viewer";
import { buildOfficialArticleFavoriteRecord } from "../features/desktop/favorites/official-account-favorite-records";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { DesktopOfficialAccountsWorkspace } from "../features/desktop/official-accounts/desktop-official-accounts-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
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

  return (
    <AppPage className="space-y-5">
      <div className="flex items-center justify-between">
        <Button
          onClick={() => {
            if (article?.account.id) {
              void navigate({
                to: "/official-accounts/$accountId",
                params: { accountId: article.account.id },
              });
              return;
            }

            void navigate({ to: "/contacts/official-accounts" });
          }}
          variant="ghost"
          size="icon"
          className="text-[color:var(--text-secondary)]"
        >
          <ArrowLeft size={18} />
        </Button>
      </div>

      {articleQuery.isLoading ? <LoadingBlock label="正在读取文章..." /> : null}
      {articleQuery.isError && articleQuery.error instanceof Error ? (
        <ErrorBlock message={articleQuery.error.message} />
      ) : null}
      {markReadMutation.isError && markReadMutation.error instanceof Error ? (
        <ErrorBlock message={markReadMutation.error.message} />
      ) : null}

      {article ? (
        <OfficialArticleViewer
          article={article}
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
      ) : null}
    </AppPage>
  );
}
