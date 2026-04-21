import {
  Suspense,
  lazy,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Copy,
  ImagePlus,
  PenSquare,
  Share2,
  Video,
} from "lucide-react";
import {
  addFeedComment,
  getBlockedCharacters,
  getFeed,
  likeFeedPost,
} from "@yinjie/contracts";
import { AppPage, Button, InlineNotice, TextField } from "@yinjie/ui";
import { MobileSocialComposerCard } from "../components/mobile-social-composer-card";
import { MomentComposeMediaPreview } from "../components/moment-compose-media-preview";
import { MomentMediaGallery } from "../components/moment-media-gallery";
import { RouteRedirectState } from "../components/route-redirect-state";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { SocialPostCard } from "../components/social-post-card";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  publishFeedComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import {
  buildFeedRouteHash,
  parseFeedRouteHash,
} from "../features/feed/feed-route-state";
import {
  getFeedSummaryText,
  resolveFeedMomentContentType,
} from "../features/feed/feed-media";
import { formatTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const FEED_COMPOSER_SECTION_ID = "discover-feed-composer-card";
const FEED_COMPOSER_TEXTAREA_ID = "discover-feed-composer-input";
const DesktopFeedWorkspace = lazy(async () => {
  const mod = await import("../features/desktop/feed/desktop-feed-workspace");
  return { default: mod.DesktopFeedWorkspace };
});

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
  const composeDraft = useMomentComposeDraft();
  const resetComposeDraft = useEffectEvent(() => {
    composeDraft.reset();
  });
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [showCompose, setShowCompose] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const routeState = parseFeedRouteHash(hash);
  const normalizedDesktopReturnPath =
    isDesktopLayout && routeState.returnPath === "/discover/feed"
      ? "/tabs/feed"
      : routeState.returnPath;
  const routeSelectedPostId = routeState.postId;
  const [desktopSelectedPostId, setDesktopSelectedPostId] = useState<
    string | null
  >(routeSelectedPostId);
  const safeReturnPath =
    normalizedDesktopReturnPath &&
    !isDesktopOnlyPath(normalizedDesktopReturnPath)
      ? normalizedDesktopReturnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;

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
      publishFeedComposeDraft({
        text: composeDraft.text,
        imageDrafts: composeDraft.imageDrafts,
        videoDraft: composeDraft.videoDraft,
        baseUrl,
      }),
    onSuccess: async () => {
      composeDraft.reset();
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

    void feedQuery.refetch();
    void blockedQuery.refetch();
  }

  function handleEmptyStateAction() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    focusComposer();
  }
  const interactionActionLabel = safeReturnPath ? "返回上一页" : "重试";
  const composerErrorActionLabel = safeReturnPath ? "返回上一页" : "继续编辑";

  useEffect(() => {
    resetComposeDraft();
    setCommentDrafts({});
    setShowCompose(false);
    setNotice("");
  }, [baseUrl, resetComposeDraft]);

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

  useEffect(() => {
    setDesktopSelectedPostId(routeSelectedPostId);
  }, [routeSelectedPostId]);

  useEffect(() => {
    if (
      !isDesktopLayout ||
      pathname !== "/discover/feed" ||
      routeSelectedPostId === desktopSelectedPostId
    ) {
      return;
    }

    void navigate({
      to: "/tabs/feed",
      hash: buildFeedRouteHash({
        postId: desktopSelectedPostId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
      replace: true,
    });
  }, [
    desktopSelectedPostId,
    isDesktopLayout,
    navigate,
    pathname,
    routeSelectedPostId,
    safeReturnHash,
    safeReturnPath,
  ]);

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

  async function handleImageFilesSelected(files: FileList | null) {
    try {
      await composeDraft.addImageFiles(files);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : "图片选择失败，请稍后重试。",
      );
    }
  }

  async function handleVideoFileSelected(file: File | null) {
    try {
      await composeDraft.replaceVideoFile(file);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : "视频选择失败，请稍后重试。",
      );
    }
  }

  useEffect(() => {
    if (
      isDesktopLayout ||
      !routeSelectedPostId ||
      typeof document === "undefined"
    ) {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(`feed-post-${routeSelectedPostId}`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    });
  }, [isDesktopLayout, routeSelectedPostId, visiblePosts.length]);

  async function handleSharePost(post: (typeof visiblePosts)[number]) {
    const shareHash = buildFeedRouteHash({
      postId: post.id,
    });
    const sharePath = `${pathname}${shareHash ? `#${shareHash}` : ""}`;
    const shareUrl =
      typeof window === "undefined"
        ? sharePath
        : `${window.location.origin}${sharePath}`;
    const postSummary = getFeedSummaryText(post);
    const summaryText = `${post.authorName}：${postSummary}\n${shareUrl}`;

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${post.authorName} 的广场动态`,
        text: `${post.authorName}：${postSummary}`,
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
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在打开桌面发现"
            description="正在载入桌面看一看工作区，马上显示当前动态内容。"
            loadingLabel="载入桌面发现工作区..."
          />
        }
      >
        <DesktopFeedWorkspace
          baseUrl={baseUrl}
          canAddImages={composeDraft.canAddImages}
          canAddVideo={composeDraft.canAddVideo}
          commentDrafts={commentDrafts}
          commentErrorMessage={
            commentMutation.isError && commentMutation.error instanceof Error
              ? commentMutation.error.message
              : null
          }
          commentPendingPostId={pendingCommentPostId}
          composeErrorMessage={
            composeDraft.mediaError ??
            (createMutation.isError && createMutation.error instanceof Error
              ? createMutation.error.message
              : null)
          }
          createPending={createMutation.isPending}
          errors={errors}
          imageDrafts={composeDraft.imageDrafts}
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
          onSelectedPostChange={setDesktopSelectedPostId}
          routeSelectedPostId={routeSelectedPostId}
          showCompose={showCompose}
          successNotice={notice}
          text={composeDraft.text}
          videoDraft={composeDraft.videoDraft}
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
          onImageFilesSelected={(files) => {
            void handleImageFilesSelected(files);
          }}
          onLike={(postId) => likeMutation.mutate(postId)}
          onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
          onRemoveVideo={() => composeDraft.clearVideoDraft()}
          onRefresh={() => {
            void feedQuery.refetch();
            if (ownerId) {
              void blockedQuery.refetch();
            }
          }}
          onTextChange={composeDraft.setText}
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
                  description: getFeedSummaryText(post),
                  meta: `广场动态 · ${formatTimestamp(post.createdAt)}`,
                  to: `/tabs/feed${buildFeedRouteHash({ postId: post.id }) ? `#${buildFeedRouteHash({ postId: post.id })}` : ""}`,
                  badge: "广场动态",
                  avatarName: post.authorName,
                  avatarSrc: post.authorAvatar,
                });

            setFavoriteSourceIds(
              nextFavorites.map((favorite) => favorite.sourceId),
            );
          }}
          onVideoFileSelected={(file) => {
            void handleVideoFileSelected(file);
          }}
        />
      </Suspense>
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
                if (safeReturnPath) {
                  void navigate({
                    to: safeReturnPath,
                    ...(safeReturnHash ? { hash: safeReturnHash } : {}),
                  });
                  return;
                }

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
          value={composeDraft.text}
          onChange={composeDraft.setText}
          placeholder="写点想让世界居民都能看到的内容..."
          helperText="这条内容会进入公开动态流，更适合发讨论、状态和世界广播。"
          submitLabel="发布"
          submittingLabel="正在发布..."
          mediaPreview={
            composeDraft.imageDrafts.length > 0 || composeDraft.videoDraft ? (
              <MomentComposeMediaPreview
                imageDrafts={composeDraft.imageDrafts}
                videoDraft={composeDraft.videoDraft}
                onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
                onRemoveVideo={() => composeDraft.clearVideoDraft()}
                variant="mobile"
              />
            ) : null
          }
          mediaActions={
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !composeDraft.canAddImages || createMutation.isPending
                }
                className="h-9 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={14} className="mr-1" />
                添加图片
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!composeDraft.canAddVideo || createMutation.isPending}
                className="h-9 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
                onClick={() => videoInputRef.current?.click()}
              >
                <Video size={14} className="mr-1" />
                {composeDraft.videoDraft ? "更换视频" : "添加视频"}
              </Button>
            </>
          }
          pending={createMutation.isPending}
          disabled={!composeDraft.hasContent || createMutation.isPending}
          errorMessage={
            composeDraft.mediaError ??
            (createMutation.isError && createMutation.error instanceof Error
              ? createMutation.error.message
              : null)
          }
          errorActionLabel={composerErrorActionLabel}
          onErrorAction={() => {
            if (safeReturnPath) {
              handleStatusBack();
              return;
            }

            composeDraft.setMediaError(null);
            createMutation.reset();
          }}
          onSubmit={() => createMutation.mutate()}
        />

        <section className="space-y-2">
          <div className="px-1">
            <div className="text-[11px] text-[color:var(--text-muted)]">
              最近动态
            </div>
            <div className="mt-0.5 text-[10px] leading-4 text-[color:var(--text-muted)]">
              这里不只看朋友，也能看到世界里的居民正在说什么。
            </div>
          </div>
          {notice ? (
            <InlineNotice
              className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
              tone={noticeTone}
            >
              {notice}
            </InlineNotice>
          ) : null}
          {feedQuery.isLoading ? (
            <MobileFeedStatusCard
              badge="读取中"
              title="正在刷新广场动态"
              description="稍等一下，正在同步居民公开动态和互动状态。"
              tone="loading"
            />
          ) : null}
          {feedQuery.isError && feedQuery.error instanceof Error ? (
            <MobileFeedStatusCard
              badge="读取失败"
              title="广场动态暂时不可用"
              description={feedQuery.error.message}
              tone="danger"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={handleStatusBack}
                >
                  {safeReturnPath ? "返回上一页" : "重新加载"}
                </Button>
              }
            />
          ) : null}

          {visiblePosts.map((post) => {
            const sourceId = `feed-${post.id}`;
            const collected = favoriteSourceIds.includes(sourceId);
            const postSummaryText = getFeedSummaryText(post);
            const summaryText = post.text.trim() ? "" : postSummaryText;

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
                    aria-label={
                      nativeMobileShareSupported
                        ? "分享这条动态"
                        : "复制这条动态摘要"
                    }
                  >
                    {nativeMobileShareSupported ? (
                      <Share2 size={15} />
                    ) : (
                      <Copy size={15} />
                    )}
                  </Button>
                }
                body={
                  <div className="space-y-3">
                    {post.authorType === "user" ? (
                      <div className="inline-flex rounded-full bg-[rgba(7,193,96,0.12)] px-2 py-0.5 text-[10px] font-medium text-[#07c160]">
                        居民公开可见
                      </div>
                    ) : null}
                    {post.text.trim() ? <div>{post.text}</div> : null}
                    {post.media.length > 0 ? (
                      <MomentMediaGallery
                        contentType={resolveFeedMomentContentType(post.media)}
                        media={post.media}
                        variant="mobile"
                      />
                    ) : null}
                  </div>
                }
                summary={
                  post.likeCount > 0 || post.commentCount > 0
                    ? `${post.likeCount} 赞 · ${post.commentCount} 评论${post.aiReacted ? " · AI 已参与回应" : ""}`
                    : summaryText || undefined
                }
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
                              description: postSummaryText,
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
            <InlineNotice
              tone="info"
              className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {likeMutation.error.message}
                </span>
                <button
                  type="button"
                  onClick={handleStatusBack}
                  className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {interactionActionLabel}
                </button>
              </div>
            </InlineNotice>
          ) : null}
          {commentMutation.isError && commentMutation.error instanceof Error ? (
            <InlineNotice
              tone="info"
              className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {commentMutation.error.message}
                </span>
                <button
                  type="button"
                  onClick={handleStatusBack}
                  className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {interactionActionLabel}
                </button>
              </div>
            </InlineNotice>
          ) : null}

          {!feedQuery.isLoading &&
          !feedQuery.isError &&
          !visiblePosts.length ? (
            <MobileFeedStatusCard
              badge="广场"
              title="还没有新动态"
              description="你先发一条居民公开可见的动态，或者等世界里的居民先开口。"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  className="h-8 rounded-full bg-[#07c160] px-3.5 text-[11px] text-white hover:bg-[#06ad56]"
                  onClick={handleEmptyStateAction}
                >
                  {safeReturnPath ? "返回上一页" : "发一条广场动态"}
                </Button>
              }
            />
          ) : null}
        </section>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleImageFilesSelected(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          void handleVideoFileSelected(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
    </AppPage>
  );
}

function MobileFeedStatusCard({
  badge,
  title,
  description,
  tone = "default",
  action,
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
  action?: ReactNode;
}) {
  const loading = tone === "loading";

  return (
    <section
      className={
        tone === "danger"
          ? "rounded-[18px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-4 py-5 text-center shadow-none"
          : "rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-5 text-center shadow-none"
      }
    >
      <div
        className={
          tone === "danger"
            ? "mx-auto inline-flex rounded-full bg-[rgba(220,38,38,0.08)] px-2.5 py-1 text-[9px] font-medium tracking-[0.04em] text-[color:var(--state-danger-text)]"
            : "mx-auto inline-flex rounded-full bg-[rgba(7,193,96,0.1)] px-2.5 py-1 text-[9px] font-medium tracking-[0.04em] text-[#07c160]"
        }
      >
        {badge}
      </div>
      {loading ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-black/15 animate-pulse" />
          <span className="h-2 w-2 rounded-full bg-black/25 animate-pulse [animation-delay:120ms]" />
          <span className="h-2 w-2 rounded-full bg-[#8ecf9d] animate-pulse [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-3 text-[15px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-2 max-w-[18rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}
