import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Copy, PenSquare, Share2 } from "lucide-react";
import {
  addFeedComment,
  createFeedPost,
  getBlockedCharacters,
  getFeed,
  likeFeedPost,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { MobileSocialComposerCard } from "../components/mobile-social-composer-card";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { SocialPostCard } from "../components/social-post-card";
import { DesktopFeedWorkspace } from "../features/desktop/feed/desktop-feed-workspace";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const FEED_COMPOSER_SECTION_ID = "discover-feed-composer-card";
const FEED_COMPOSER_TEXTAREA_ID = "discover-feed-composer-input";

export function DiscoverFeedPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerUsername = useWorldOwnerStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const [text, setText] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [showCompose, setShowCompose] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const routeSelectedPostId = parseDesktopFeedRouteHash(hash);

  const feedQuery = useQuery({
    queryKey: ["app-feed", baseUrl],
    queryFn: () => getFeed(1, 20, baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-discover-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createFeedPost(
        {
          text: text.trim(),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setText("");
      setShowCompose(false);
      setNoticeTone("success");
      setNotice("广场动态已发布，世界居民公开可见。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-feed-post", baseUrl] }),
      ]);
    },
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) => likeFeedPost(postId, baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNotice("广场互动已更新。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-feed-post", baseUrl] }),
      ]);
    },
  });

  const commentMutation = useMutation({
    mutationFn: (postId: string) => {
      const text = commentDrafts[postId]?.trim();
      if (!text) {
        throw new Error("请先输入评论内容。");
      }

      return addFeedComment(
        postId,
        {
          text,
        },
        baseUrl,
      );
    },
    onSuccess: async (_, postId) => {
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setNoticeTone("success");
      setNotice("广场互动已更新。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-feed-post", baseUrl] }),
      ]);
    },
  });

  const pendingLikePostId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentPostId = commentMutation.isPending
    ? commentMutation.variables
    : null;
  const blockedCharacterIds = new Set(
    (blockedQuery.data ?? []).map((item) => item.characterId),
  );
  const visiblePosts = (feedQuery.data?.posts ?? []).filter(
    (post) =>
      post.authorType !== "character" ||
      !blockedCharacterIds.has(post.authorId),
  );

  useEffect(() => {
    setText("");
    setCommentDrafts({});
    setShowCompose(false);
    setNotice("");
  }, [baseUrl]);

  useEffect(() => {
    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, []);

  useEffect(() => {
    if (!nativeDesktopFavorites) {
      return;
    }

    let cancelled = false;

    async function syncFavoriteSourceIds() {
      const favoriteSourceIds = (await hydrateDesktopFavoritesFromNative()).map(
        (item) => item.sourceId,
      );
      if (cancelled) {
        return;
      }

      setFavoriteSourceIds((current) =>
        JSON.stringify(current) === JSON.stringify(favoriteSourceIds)
          ? current
          : favoriteSourceIds,
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
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function focusComposer() {
    if (typeof document === "undefined") {
      return;
    }

    document
      .getElementById(FEED_COMPOSER_SECTION_ID)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });

    window.requestAnimationFrame(() => {
      const textarea = document.getElementById(FEED_COMPOSER_TEXTAREA_ID);
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus();
      }
    });
  }

  useEffect(() => {
    if (isDesktopLayout || !routeSelectedPostId || typeof document === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(`feed-post-${routeSelectedPostId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [isDesktopLayout, routeSelectedPostId, visiblePosts.length]);

  async function handleSharePost(post: (typeof visiblePosts)[number]) {
    const shareHash = buildDesktopFeedRouteHash(post.id);
    const sharePath = `${pathname}${shareHash ? `#${shareHash}` : ""}`;
    const shareUrl =
      typeof window === "undefined"
        ? sharePath
        : `${window.location.origin}${sharePath}`;
    const summaryText = `${post.authorName}：${post.text}\n${shareUrl}`;

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${post.authorName} 的广场动态`,
        text: `${post.authorName}：${post.text}`,
        url: shareUrl,
      });

      if (shared) {
        setNoticeTone("success");
        setNotice("已打开系统分享面板。");
        return;
      }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNoticeTone("info");
      setNotice(
        nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制动态摘要。",
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(summaryText);
      setNoticeTone("success");
      setNotice(
        nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制动态摘要。"
          : "动态摘要已复制。",
      );
    } catch {
      setNoticeTone("info");
      setNotice(
        nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制动态摘要失败，请稍后重试。",
      );
    }
  }

  if (isDesktopLayout) {
    const errors: string[] = [];

    if (feedQuery.isError && feedQuery.error instanceof Error) {
      errors.push(feedQuery.error.message);
    }

    if (blockedQuery.isError && blockedQuery.error instanceof Error) {
      errors.push(blockedQuery.error.message);
    }

    return (
      <DesktopFeedWorkspace
        baseUrl={baseUrl}
        commentDrafts={commentDrafts}
        commentErrorMessage={
          commentMutation.isError && commentMutation.error instanceof Error
            ? commentMutation.error.message
            : null
        }
        commentPendingPostId={pendingCommentPostId}
        composeErrorMessage={
          createMutation.isError && createMutation.error instanceof Error
            ? createMutation.error.message
            : null
        }
        createPending={createMutation.isPending}
        errors={errors}
        isLoading={feedQuery.isLoading}
        likeErrorMessage={
          likeMutation.isError && likeMutation.error instanceof Error
            ? likeMutation.error.message
            : null
        }
        likePendingPostId={pendingLikePostId}
        ownerAvatar={ownerAvatar}
        ownerUsername={ownerUsername}
        posts={visiblePosts}
        routeSelectedPostId={routeSelectedPostId}
        showCompose={showCompose}
        successNotice={notice}
        text={text}
        isPostFavorite={(postId) =>
          favoriteSourceIds.includes(`feed-${postId}`)
        }
        setShowCompose={setShowCompose}
        onCommentChange={(postId, value) =>
          setCommentDrafts((current) => ({
            ...current,
            [postId]: value,
          }))
        }
        onCommentSubmit={(postId) => commentMutation.mutate(postId)}
        onCreate={() => createMutation.mutate()}
        onLike={(postId) => likeMutation.mutate(postId)}
        onRefresh={() => {
          void feedQuery.refetch();
          if (ownerId) {
            void blockedQuery.refetch();
          }
        }}
        onTextChange={setText}
        onToggleFavorite={(postId) => {
          const post = visiblePosts.find((item) => item.id === postId);
          if (!post) {
            return;
          }

          const sourceId = `feed-${post.id}`;
          const collected = favoriteSourceIds.includes(sourceId);
          const nextFavorites = collected
            ? removeDesktopFavorite(sourceId)
            : upsertDesktopFavorite({
                id: `favorite-${sourceId}`,
                sourceId,
                category: "feed",
                title: post.authorName,
                description: post.text,
                meta: `广场动态 · ${formatTimestamp(post.createdAt)}`,
                to: `/tabs/feed${buildDesktopFeedRouteHash(post.id) ? `#${buildDesktopFeedRouteHash(post.id)}` : ""}`,
                badge: "广场动态",
                avatarName: post.authorName,
                avatarSrc: post.authorAvatar,
              });

          setFavoriteSourceIds(
            nextFavorites.map((favorite) => favorite.sourceId),
          );
        }}
      />
    );
  }

  return (
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      <TabPageTopBar
        title="广场动态"
        subtitle="世界居民公开可见"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/discover" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={focusComposer}
            aria-label="发一条广场动态"
          >
            <PenSquare size={17} />
          </Button>
        }
      />

      <div className="space-y-2.5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2.5">
        <MobileSocialComposerCard
          sectionId={FEED_COMPOSER_SECTION_ID}
          textareaId={FEED_COMPOSER_TEXTAREA_ID}
          title="发一条广场动态"
          description="发到广场后，世界里的居民都可能看到、点赞，甚至继续接话。"
          scopeLabel="公开可见"
          scopeClassName="bg-[rgba(7,193,96,0.12)] text-[#07c160]"
          value={text}
          onChange={setText}
          placeholder="写点想让世界居民都能看到的内容..."
          helperText="这条内容会进入公开动态流，更适合发讨论、状态和世界广播。"
          submitLabel="发布"
          submittingLabel="正在发布..."
          pending={createMutation.isPending}
          disabled={!text.trim() || createMutation.isPending}
          errorMessage={
            createMutation.isError && createMutation.error instanceof Error
              ? createMutation.error.message
              : null
          }
          onSubmit={() => createMutation.mutate()}
        />

        <section className="space-y-2.5">
          <div className="px-1">
            <div className="text-[12px] text-[color:var(--text-muted)]">最近动态</div>
            <div className="mt-0.5 text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
              这里不只看朋友，也能看到世界里的居民正在说什么。
            </div>
          </div>
          {notice ? (
            <InlineNotice className="text-[12px] leading-5" tone={noticeTone}>
              {notice}
            </InlineNotice>
          ) : null}
          {feedQuery.isLoading ? (
            <LoadingBlock label="正在读取广场动态..." />
          ) : null}
          {feedQuery.isError && feedQuery.error instanceof Error ? (
            <ErrorBlock message={feedQuery.error.message} />
          ) : null}

          {visiblePosts.map((post) => {
            const sourceId = `feed-${post.id}`;
            const collected = favoriteSourceIds.includes(sourceId);

            return (
              <SocialPostCard
                cardId={`feed-post-${post.id}`}
                key={post.id}
                authorName={post.authorName}
                authorAvatar={post.authorAvatar}
                meta={`${formatTimestamp(post.createdAt)} · ${post.authorType === "user" ? "世界主人" : "居民动态"}`}
                headerActions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-[color:var(--text-muted)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)]"
                    onClick={() => void handleSharePost(post)}
                    aria-label={nativeMobileShareSupported ? "分享这条动态" : "复制这条动态摘要"}
                  >
                    {nativeMobileShareSupported ? (
                      <Share2 size={15} />
                    ) : (
                      <Copy size={15} />
                    )}
                  </Button>
                }
                body={
                  <>
                    {post.authorType === "user" ? (
                      <div className="mb-2 inline-flex rounded-full bg-[rgba(7,193,96,0.12)] px-2 py-0.5 text-[10px] font-medium text-[#07c160]">
                        居民公开可见
                      </div>
                    ) : null}
                    <div>{post.text}</div>
                  </>
                }
                summary={`${post.likeCount} 赞 · ${post.commentCount} 评论${post.aiReacted ? " · AI 已参与回应" : ""}`}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={likeMutation.isPending}
                      onClick={() => likeMutation.mutate(post.id)}
                      variant="secondary"
                      size="sm"
                    >
                      {pendingLikePostId === post.id ? "处理中..." : "点赞"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const nextFavorites = collected
                          ? removeDesktopFavorite(sourceId)
                          : upsertDesktopFavorite({
                              id: `favorite-${sourceId}`,
                              sourceId,
                              category: "feed",
                              title: post.authorName,
                              description: post.text,
                              meta: `广场动态 · ${formatTimestamp(post.createdAt)}`,
                              to: "/tabs/feed",
                              badge: "广场动态",
                              avatarName: post.authorName,
                              avatarSrc: post.authorAvatar,
                            });

                        setFavoriteSourceIds(
                          nextFavorites.map((favorite) => favorite.sourceId),
                        );
                      }}
                    >
                      {collected ? "取消收藏" : "收藏"}
                    </Button>
                  </div>
                }
                secondary={
                  post.commentsPreview.length > 0 ? (
                    <div className="space-y-1.5 rounded-[14px] bg-[color:var(--surface-soft)] p-2.5">
                      {post.commentsPreview.map((comment) => (
                        <div
                          key={comment.id}
                          className="text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]"
                        >
                          <span className="text-[color:var(--text-primary)]">
                            {comment.authorName}
                          </span>
                          {`：${comment.text}`}
                        </div>
                      ))}
                    </div>
                  ) : null
                }
                composer={
                  <>
                    <TextField
                      value={commentDrafts[post.id] ?? ""}
                      onChange={(event) =>
                        setCommentDrafts((current) => ({
                          ...current,
                          [post.id]: event.target.value,
                        }))
                      }
                      placeholder="写评论..."
                      className="min-w-0 flex-1 rounded-full py-1.5 text-[12px]"
                    />
                    <Button
                      disabled={
                        !(commentDrafts[post.id] ?? "").trim() ||
                        commentMutation.isPending
                      }
                      onClick={() => commentMutation.mutate(post.id)}
                      variant="primary"
                      size="sm"
                      className="h-8 px-3 text-[12px]"
                    >
                      {pendingCommentPostId === post.id ? "发送中..." : "发送"}
                    </Button>
                  </>
                }
              />
            );
          })}

          {likeMutation.isError && likeMutation.error instanceof Error ? (
            <ErrorBlock message={likeMutation.error.message} />
          ) : null}
          {commentMutation.isError && commentMutation.error instanceof Error ? (
            <ErrorBlock message={commentMutation.error.message} />
          ) : null}

          {!feedQuery.isLoading && !feedQuery.isError && !visiblePosts.length ? (
            <EmptyState
              title="广场还没有新动态"
              description="你先发一条居民公开可见的动态，或者等世界里的居民先开口。"
            />
          ) : null}
        </section>
      </div>
    </AppPage>
  );
}

function parseDesktopFeedRouteHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  return params.get("post")?.trim() || null;
}

function buildDesktopFeedRouteHash(postId?: string | null) {
  if (!postId) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("post", postId);
  return params.toString();
}
