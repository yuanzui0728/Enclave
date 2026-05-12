import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Copy,
  Image as ImageIcon,
  PenSquare,
  Share2,
} from "lucide-react";
import {
  addFeedComment,
  getBlockedCharacters,
  getFeed,
  likeFeedPost,
  replyFeedComment,
  type FeedAuthorType,
  type FeedComment,
  type FeedListResponse,
} from "@yinjie/contracts";
import { AppPage, Button, InlineNotice } from "@yinjie/ui";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { FeedPostShareCardModal } from "../components/feed-post-share-card-modal";
import { MomentMediaGallery } from "../components/moment-media-gallery";
import { RouteRedirectState } from "../components/route-redirect-state";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { SocialPostCard } from "../components/social-post-card";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { WeChatActionBubble } from "../components/wechat-action-bubble";
import {
  WeChatCommentBar,
  type WeChatCommentBarReplyTarget,
} from "../components/wechat-comment-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  publishFeedComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import {
  buildFeedRouteHash,
  parseFeedRouteHash,
} from "../features/feed/feed-route-state";
import { buildMobileFeedPublishRouteHash } from "../features/feed/mobile-feed-publish-route-state";
import { consumeFeedPublishFlash } from "../features/feed/feed-publish-flash";
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
const DesktopFeedWorkspace = lazy(async () => {
  const mod = await import("../features/desktop/feed/desktop-feed-workspace");
  return { default: mod.DesktopFeedWorkspace };
});

const DesktopMessageAvatarPopover = lazy(async () => {
  const mod = await import("../features/chat/message-avatar-popover-shell");
  return { default: mod.DesktopMessageAvatarPopover };
});

export function DiscoverFeedPage() {
  const t = useRuntimeTranslator();
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
  const resetComposeDraft = composeDraft.reset;
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [desktopReplyTarget, setDesktopReplyTarget] = useState<{
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null>(null);
  const [actionBubble, setActionBubble] = useState<{
    postId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [commentBarTarget, setCommentBarTarget] = useState<{
    postId: string;
    replyTo: WeChatCommentBarReplyTarget | null;
  } | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const [noticeActionLabel, setNoticeActionLabel] = useState<string | null>(
    null,
  );
  const [noticeAction, setNoticeAction] = useState<(() => void) | null>(null);
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  // 「分享图卡」目标 post id — 与 link-share 分开存，用户可以两种都点。
  const [shareCardPostId, setShareCardPostId] = useState<string | null>(null);
  const [desktopAvatarPopover, setDesktopAvatarPopover] = useState<
    | {
        anchorElement: HTMLButtonElement;
        kind: "character";
        characterId: string;
        fallbackAvatar?: string | null;
        fallbackName: string;
      }
    | {
        anchorElement: HTMLButtonElement;
        kind: "owner";
      }
    | null
  >(null);
  const routeState = parseFeedRouteHash(hash);
  const normalizedDesktopReturnPath =
    isDesktopLayout && routeState.returnPath === "/discover/feed"
      ? "/tabs/feed"
      : routeState.returnPath;
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const desktopPathMismatch = pathname !== "/tabs/feed";
  const routeSelectedPostId = routeState.postId;
  const [desktopSelectedPostId, setDesktopSelectedPostId] = useState<
    string | null
  >(routeSelectedPostId);
  const routeSelectionAlreadySynced =
    !desktopPathMismatch && routeSelectedPostId === desktopSelectedPostId;
  const safeReturnPath =
    normalizedDesktopReturnPath &&
    !isDesktopOnlyPath(normalizedDesktopReturnPath)
      ? normalizedDesktopReturnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;

  // 广场用无限分页：首屏 20 条，触底拉下一页，避免一次性把 200 条都拉过来
  // （后端那侧虽有 page 但前端老 client 写死 limit=200，整体反序列化和 JSON 媒体载荷都很沉）。
  const feedQuery = useInfiniteQuery({
    queryKey: ["app-feed-paged", baseUrl],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getFeed(pageParam, 20, baseUrl),
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce(
        (acc, page) => acc + page.posts.length,
        0,
      );
      return fetched < lastPage.total ? allPages.length + 1 : undefined;
    },
  });
  // 按 id 去重：分页路径下若新发/删除导致页间边界偏移，page N 末尾和 page N+1 开头
  // 可能拿到同一条 post。UI 层兜底去重，避免列表重复闪烁。
  const feedPosts = useMemo(() => {
    if (!feedQuery.data) return [] as FeedListResponse["posts"];
    const seen = new Set<string>();
    const items: FeedListResponse["posts"] = [];
    for (const page of feedQuery.data.pages) {
      for (const post of page.posts) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        items.push(post);
      }
    }
    return items;
  }, [feedQuery.data]);
  // 触底加载：sentinel 进入视口 → fetchNextPage。
  // 用默认 root=null（viewport）+ rootMargin 提前触发，避免触到底再等。
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const hasNextFeedPage = feedQuery.hasNextPage;
  const isFetchingNextFeedPage = feedQuery.isFetchingNextPage;
  const fetchNextFeedPage = feedQuery.fetchNextPage;
  useEffect(() => {
    if (!hasNextFeedPage || isFetchingNextFeedPage) {
      return;
    }
    const sentinel = loadMoreRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchNextFeedPage();
        }
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextFeedPage, hasNextFeedPage, isFetchingNextFeedPage]);

  // 桌面端没有触底 sentinel：mount 后自动连续 prefetch，把后续页悄悄填上，
  // 保证用户在桌面工作区也能看到全部动态（首屏仍只渲染第一页，省时间）。
  useEffect(() => {
    if (!isDesktopLayout) return;
    if (hasNextFeedPage && !isFetchingNextFeedPage) {
      void fetchNextFeedPage();
    }
  }, [
    isDesktopLayout,
    hasNextFeedPage,
    isFetchingNextFeedPage,
    fetchNextFeedPage,
  ]);

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
    onSuccess: (newPost) => {
      composeDraft.reset();
      setShowCompose(false);
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`广场动态已发布，世界居民公开可见。`));
      // 立刻把新 post prepend 到 paged 头部 + 平铺 flat cache，本页就能马上看到刚发的内容；
      // 顺便把已加载的多页砍回 1 页（发布后分页边界后移，避免 page 1 末尾和 page 2 开头重复）。
      const newListItem = { ...newPost, commentsPreview: [] };
      queryClient.setQueryData<InfiniteData<FeedListResponse>>(
        ["app-feed-paged", baseUrl],
        (current) =>
          current && current.pages.length > 0
            ? {
                pages: [
                  {
                    ...current.pages[0]!,
                    posts: [newListItem, ...current.pages[0]!.posts],
                    total: current.pages[0]!.total + 1,
                  },
                ],
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      queryClient.setQueryData<FeedListResponse>(
        ["app-feed", baseUrl],
        (current) =>
          current
            ? {
                posts: [newListItem, ...current.posts],
                total: current.total + 1,
              }
            : current,
      );
      // 后台 invalidate 让 discover-page、search-index 等共用 cache 的页面也合并最新状态
      void queryClient.invalidateQueries({
        queryKey: ["app-feed-paged", baseUrl],
      });
      void queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
      void queryClient.invalidateQueries({ queryKey: ["app-feed-post", baseUrl] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) => likeFeedPost(postId, baseUrl),
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: ["app-feed-paged", baseUrl] });
      const snapshots = queryClient.getQueriesData<
        InfiniteData<FeedListResponse>
      >({
        queryKey: ["app-feed-paged", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data) {
          return;
        }
        queryClient.setQueryData<InfiniteData<FeedListResponse>>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            posts: page.posts.map((post) =>
              post.id === postId && !post.ownerState?.hasLiked
                ? {
                    ...post,
                    likeCount: post.likeCount + 1,
                    ownerState: {
                      ...(post.ownerState ?? {
                        hasLiked: false,
                        hasFavorited: false,
                        isFollowingAuthor: false,
                        isNotInterested: false,
                        hasViewed: false,
                        hasShared: false,
                        lastViewedAt: null,
                        watchProgressSeconds: null,
                        completed: false,
                      }),
                      hasLiked: true,
                    },
                  }
                : post,
            ),
          })),
        });
      });
      return { snapshots };
    },
    onError: (_error, _postId, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: () => {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`广场互动已更新。`));
      // 点赞 toggle 是 boolean，optimistic 已经把 likeCount/hasLiked 切对。
      // 完全省掉 invalidate，避免拉回 paged 多页 + 30+ media 条件请求 RTT。
    },
  });

  const commentMutation = useMutation({
    mutationFn: (input: {
      postId: string;
      replyTarget?: {
        authorId: string;
        authorName: string;
        commentId: string;
        postId: string;
      } | null;
      text: string;
    }) => {
      const text = input.text.trim();
      if (!text) {
        throw new Error(t(msg`请先输入评论内容。`));
      }

      if (input.replyTarget) {
        return replyFeedComment(
          input.replyTarget.commentId,
          { text },
          baseUrl,
        );
      }

      return addFeedComment(input.postId, { text }, baseUrl);
    },
    onSuccess: (_, input) => {
      setCommentDrafts((current) => ({ ...current, [input.postId]: "" }));
      setDesktopReplyTarget((current) =>
        current?.postId === input.postId ? null : current,
      );
      setCommentBarTarget((current) =>
        current?.postId === input.postId ? null : current,
      );
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        input.replyTarget
          ? t(msg`广场回复已发送。`)
          : t(msg`广场互动已更新。`),
      );
      // fire-and-forget：await 会让"发送"按钮一直 disabled，公网隧道下卡几秒。
      void queryClient.invalidateQueries({ queryKey: ["app-feed-paged", baseUrl] });
      void queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
      void queryClient.invalidateQueries({ queryKey: ["app-feed-post", baseUrl] });
    },
  });

  function submitComment(
    postId: string,
    options?: {
      replyTarget?: {
        authorId: string;
        authorName: string;
        commentId: string;
        postId: string;
      } | null;
    },
  ) {
    commentMutation.mutate({
      postId,
      replyTarget: options?.replyTarget ?? null,
      text: commentDrafts[postId] ?? "",
    });
  }

const pendingLikePostId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentPostId = commentMutation.isPending
    ? (commentMutation.variables?.postId ?? null)
    : null;
  const blockedCharacterIds = new Set(
    (blockedQuery.data ?? []).map((item) => item.characterId),
  );
  const visiblePosts = feedPosts.filter(
    (post) =>
      post.authorType !== "character" ||
      !blockedCharacterIds.has(post.authorId),
  );

  function toggleFavoriteByPostId(postId: string) {
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
          meta: t(msg`广场动态 · ${formatTimestamp(post.createdAt)}`),
          to: `/tabs/feed${buildFeedRouteHash({ postId: post.id }) ? `#${buildFeedRouteHash({ postId: post.id })}` : ""}`,
          badge: t(msg`广场动态`),
          avatarName: post.authorName,
          avatarSrc: post.authorAvatar,
        });

    setFavoriteSourceIds(
      nextFavorites.map((favorite) => favorite.sourceId),
    );
  }

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

  function resetFeedToFirstPage() {
    queryClient.setQueryData<InfiniteData<FeedListResponse>>(
      ["app-feed-paged", baseUrl],
      (current) =>
        current
          ? {
              pages: current.pages.slice(0, 1),
              pageParams: current.pageParams.slice(0, 1),
            }
          : current,
    );
  }

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    resetFeedToFirstPage();
    void feedQuery.refetch();
    void blockedQuery.refetch();
  }

  function handleRetryLoad() {
    resetFeedToFirstPage();
    void feedQuery.refetch();
    void blockedQuery.refetch();
  }

  function openMobileFeedPublishPage() {
    const currentHash = hash.startsWith("#") ? hash.slice(1) : hash;
    void navigate({
      to: "/discover/feed/publish",
      hash: buildMobileFeedPublishRouteHash({
        returnPath: pathname,
        returnHash: currentHash || undefined,
      }),
    });
  }

  function openCharacterDetail(
    authorId: string,
    authorType: FeedAuthorType,
  ) {
    if (authorType !== "character" || !authorId) {
      return;
    }
    const currentHash = hash.startsWith("#") ? hash.slice(1) : hash;
    void navigate({
      to: "/character/$characterId",
      params: { characterId: authorId },
      hash: buildCharacterDetailRouteHash({
        returnPath: pathname,
        returnHash: currentHash || undefined,
      }),
    });
  }

  function handleEmptyStateAction() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    openMobileFeedPublishPage();
  }
  const interactionActionLabel = safeReturnPath
    ? t(msg`返回上一页`)
    : t(msg`重试读取`);

  useEffect(() => {
    setDesktopAvatarPopover(null);
  }, [hash, pathname]);

  useEffect(() => {
    resetComposeDraft();
    setCommentDrafts({});
    setActionBubble(null);
    setCommentBarTarget(null);
    setShowCompose(false);
    setNoticeActionLabel(null);
    setNoticeAction(null);
    setNotice(""); // i18n-ignore-line
  }, [baseUrl, resetComposeDraft]);

  useEffect(() => {
    if (isDesktopLayout) {
      return;
    }
    const flash = consumeFeedPublishFlash();
    if (flash) {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(flash);
    }
  }, [isDesktopLayout]);

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

    const timer = window.setTimeout(() => {
      setNotice(""); // i18n-ignore-line
      setNoticeActionLabel(null);
      setNoticeAction(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setDesktopSelectedPostId(routeSelectedPostId);
  }, [routeSelectedPostId]);

  useEffect(() => {
    if (
      !isDesktopLayout ||
      (routeSelectionAlreadySynced &&
        normalizedHash ===
          (buildFeedRouteHash({
            postId: desktopSelectedPostId,
            returnPath: safeReturnPath,
            returnHash: safeReturnHash,
          }) ?? ""))
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
    desktopPathMismatch,
    desktopSelectedPostId,
    isDesktopLayout,
    navigate,
    normalizedHash,
    routeSelectionAlreadySynced,
    safeReturnHash,
    safeReturnPath,
  ]);

  async function handleImageFilesSelected(files: FileList | null) {
    try {
      await composeDraft.addImageFiles(files);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error
          ? error.message
          : t(msg`图片选择失败，请稍后重试。`),
      );
    }
  }

  async function handleVideoFileSelected(file: File | null) {
    try {
      await composeDraft.replaceVideoFile(file);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error
          ? error.message
          : t(msg`视频选择失败，请稍后重试。`),
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
        title: t(msg`${post.authorName} 的广场动态`),
        text: t(msg`${post.authorName}：${postSummary}`),
        url: shareUrl,
      });

      if (shared) {
        setNoticeTone("success");
        setNoticeActionLabel(null);
        setNoticeAction(null);
        setNotice(t(msg`已打开系统分享面板。`));
        return;
      }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNoticeTone("info");
      setNoticeActionLabel(
        nativeMobileShareSupported ? t(msg`重试分享`) : t(msg`重试复制`),
      );
      setNoticeAction(() => () => {
        void handleSharePost(post);
      });
      setNotice(
        nativeMobileShareSupported
          ? t(msg`当前设备暂时无法打开系统分享，请稍后重试。`)
          : t(msg`当前环境暂不支持复制动态摘要。`),
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(summaryText);
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        nativeMobileShareSupported
          ? t(msg`系统分享暂时不可用，已复制动态摘要。`)
          : t(msg`动态摘要已复制。`),
      );
    } catch {
      setNoticeTone("info");
      setNoticeActionLabel(
        nativeMobileShareSupported ? t(msg`重试分享`) : t(msg`重试复制`),
      );
      setNoticeAction(() => () => {
        void handleSharePost(post);
      });
      setNotice(
        nativeMobileShareSupported
          ? t(msg`系统分享失败，请稍后重试。`)
          : t(msg`复制动态摘要失败，请稍后重试。`),
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
            title={t(msg`正在打开桌面发现`)}
            description={t(
              msg`正在载入桌面看一看工作区，马上显示当前动态内容。`,
            )}
            loadingLabel={t(msg`载入桌面发现工作区...`)}
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
          commentReplyTarget={desktopReplyTarget}
          onCancelCommentReply={() => setDesktopReplyTarget(null)}
          onCommentChange={(postId, value) =>
            setCommentDrafts((current) => ({
              ...current,
              [postId]: value,
            }))
          }
          onCommentSubmit={(postId) =>
            submitComment(postId, { replyTarget: desktopReplyTarget })
          }
          onStartCommentReply={(comment: FeedComment) =>
            setDesktopReplyTarget({
              authorId: comment.authorId,
              authorName: comment.authorName,
              commentId: comment.id,
              postId: comment.postId,
            })
          }
          onSelectCommentAuthor={(event, comment) => {
            if (comment.authorType === "character") {
              setDesktopAvatarPopover({
                anchorElement: event.currentTarget,
                kind: "character",
                characterId: comment.authorId,
                fallbackAvatar: comment.authorAvatar,
                fallbackName: comment.authorName,
              });
            } else if (comment.authorType === "user") {
              setDesktopAvatarPopover({
                anchorElement: event.currentTarget,
                kind: "owner",
              });
            }
          }}
          onCreate={() => createMutation.mutate()}
          onImageFilesSelected={(files) => {
            void handleImageFilesSelected(files);
          }}
          onLike={(postId) => likeMutation.mutate(postId)}
          onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
          onRemoveVideo={() => composeDraft.clearVideoDraft()}
          onRefresh={() => {
            resetFeedToFirstPage();
            void feedQuery.refetch();
            if (ownerId) {
              void blockedQuery.refetch();
            }
          }}
          onTextChange={composeDraft.setText}
          onToggleFavorite={(postId) => toggleFavoriteByPostId(postId)}
          onShare={(postId) => setShareCardPostId(postId)}
          onVideoFileSelected={(file) => {
            void handleVideoFileSelected(file);
          }}
        />
        <FeedPostShareCardModal
          post={
            shareCardPostId
              ? visiblePosts.find((item) => item.id === shareCardPostId) ?? null
              : null
          }
          ownerDisplayName={ownerUsername?.trim() || t(msg`世界主人`)}
          onClose={() => setShareCardPostId(null)}
        />
        {desktopAvatarPopover ? (
          <Suspense fallback={null}>
            {desktopAvatarPopover.kind === "character" ? (
              <DesktopMessageAvatarPopover
                anchorElement={desktopAvatarPopover.anchorElement}
                kind="character"
                characterId={desktopAvatarPopover.characterId}
                fallbackAvatar={desktopAvatarPopover.fallbackAvatar}
                fallbackName={desktopAvatarPopover.fallbackName}
                onClose={() => setDesktopAvatarPopover(null)}
              />
            ) : (
              <DesktopMessageAvatarPopover
                anchorElement={desktopAvatarPopover.anchorElement}
                kind="owner"
                onClose={() => setDesktopAvatarPopover(null)}
              />
            )}
          </Suspense>
        ) : null}
      </Suspense>
    );
  }

  return (
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      <TabPageTopBar
        title={t(msg`广场动态`)}
        subtitle={t(msg`世界居民公开可见`)}
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
            onClick={openMobileFeedPublishPage}
            aria-label={t(msg`发一条广场动态`)}
          >
            <PenSquare size={17} />
          </Button>
        }
      />

      <div className="space-y-2.5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2.5">
        <section className="space-y-2">
          <div className="px-1">
            <div className="text-[11px] text-[color:var(--text-muted)]">
              {t(msg`最近动态`)}
            </div>
            <div className="mt-0.5 text-[10px] leading-4 text-[color:var(--text-muted)]">
              {t(msg`这里不只看朋友，也能看到世界里的居民正在说什么。`)}
            </div>
          </div>
          {notice ? (
            <InlineNotice
              className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
              tone={noticeTone}
            >
              {noticeTone === "info" ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1">{notice}</span>
                  <div className="flex items-center gap-1.5">
                    {noticeAction && noticeActionLabel ? (
                      <button
                        type="button"
                        onClick={noticeAction}
                        className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                      >
                        {noticeActionLabel}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleStatusBack}
                      className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                    >
                      {safeReturnPath ? t(msg`返回上一页`) : t(msg`重试读取`)}
                    </button>
                  </div>
                </div>
              ) : (
                notice
              )}
            </InlineNotice>
          ) : null}
          {feedQuery.isLoading ? (
            <MobileFeedStatusCard
              badge={t(msg`读取中`)}
              title={t(msg`正在刷新广场动态`)}
              description={t(msg`稍等一下，正在同步居民公开动态和互动状态。`)}
              tone="loading"
            />
          ) : null}
          {feedQuery.isError && feedQuery.error instanceof Error ? (
            <MobileFeedStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`广场动态暂时不可用`)}
              description={feedQuery.error.message}
              tone="danger"
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleRetryLoad}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath ? t(msg`返回上一页`) : t(msg`重试读取`)}
                  </Button>
                </div>
              }
            />
          ) : null}

          {visiblePosts.map((post) => {
            const sourceId = `feed-${post.id}`;
            const postSummaryText = getFeedSummaryText(post);
            const summaryText = post.text.trim() ? "" : postSummaryText;

            return (
              <div key={post.id} className="yj-list-item-virtual-card">
              <SocialPostCard
                cardId={`feed-post-${post.id}`}
                authorName={post.authorName}
                authorAvatar={post.authorAvatar}
                meta={`${formatTimestamp(post.createdAt)} · ${
                  post.authorType === "user"
                    ? t(msg`世界主人`)
                    : t(msg`居民动态`)
                }`}
                headerActions={
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-[color:var(--text-muted)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)]"
                      onClick={() => setShareCardPostId(post.id)}
                      aria-label={t(msg`生成分享图卡`)}
                    >
                      <ImageIcon size={15} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-[color:var(--text-muted)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)]"
                      onClick={() => void handleSharePost(post)}
                      aria-label={
                        nativeMobileShareSupported
                          ? t(msg`分享这条动态`)
                          : t(msg`复制这条动态摘要`)
                      }
                    >
                      {nativeMobileShareSupported ? (
                        <Share2 size={15} />
                      ) : (
                        <Copy size={15} />
                      )}
                    </Button>
                  </div>
                }
                body={
                  <div className="space-y-3">
                    {post.authorType === "user" ? (
                      <div className="inline-flex rounded-full bg-[rgba(7,193,96,0.12)] px-2 py-0.5 text-[10px] font-medium text-[#07c160]">
                        {t(msg`居民公开可见`)}
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
                    ? `${t(msg`${post.likeCount} 赞`)} · ${t(
                        msg`${post.commentCount} 评论`,
                      )}`
                    : summaryText || undefined
                }
                actions={
                  post.canInteract ? (
                    <div className="flex w-full justify-end">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          setActionBubble({ postId: post.id, anchorRect: rect });
                        }}
                        aria-label={t(msg`更多操作`)}
                        className="inline-flex h-7 w-9 items-center justify-center rounded-[4px] bg-[#F2F2F2] text-[#4C4C4C] active:bg-[#E5E5E5]"
                      >
                        <MoreHorizontalDots />
                      </button>
                    </div>
                  ) : null
                }
                secondary={
                  post.commentsPreview.length > 0 ? (
                    <div className="overflow-hidden rounded-[3px] border border-[#EDEDED] bg-[#F7F7F7]">
                      <div className="space-y-0.5 px-2.5 py-1.5 text-[13px] leading-[22px]">
                        {post.commentsPreview.map((comment) => {
                          const replyToComment = comment.replyToCommentId
                            ? post.commentsPreview.find(
                                (item) => item.id === comment.replyToCommentId,
                              ) ?? null
                            : null;
                          const replyToName = replyToComment?.authorName ?? null;
                          const openReply = () => {
                            if (!post.canInteract) return;
                            setCommentBarTarget({
                              postId: post.id,
                              replyTo: {
                                authorId: comment.authorId,
                                authorName: comment.authorName,
                                commentId: comment.id,
                              },
                            });
                          };
                          return (
                            <div
                              key={comment.id}
                              role="button"
                              tabIndex={0}
                              onClick={openReply}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openReply();
                                }
                              }}
                              className="block w-full cursor-pointer text-left text-[#1A1A1A] active:bg-[#EFEFEF]"
                            >
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openCharacterDetail(
                                    comment.authorId,
                                    comment.authorType,
                                  );
                                }}
                                className="text-[#576B95] hover:opacity-80"
                              >
                                {comment.authorName}
                              </button>
                              {replyToName ? (
                                <>
                                  <span> {t(msg`回复`)} </span>
                                  {replyToComment ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openCharacterDetail(
                                          replyToComment.authorId,
                                          replyToComment.authorType,
                                        );
                                      }}
                                      className="text-[#576B95] hover:opacity-80"
                                    >
                                      {replyToName}
                                    </button>
                                  ) : (
                                    <span className="text-[#576B95]">
                                      {replyToName}
                                    </span>
                                  )}
                                </>
                              ) : null}
                              <span>：{comment.text}</span>
                            </div>
                          );
                        })}
                        {post.commentCount > post.commentsPreview.length ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!post.canInteract) return;
                              setCommentBarTarget({
                                postId: post.id,
                                replyTo: null,
                              });
                            }}
                            className="mt-1 block text-left text-[12px] text-[#576B95] active:opacity-60"
                          >
                            {t(msg`查看全部 ${post.commentCount} 条评论`)}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null
                }
              />
              </div>
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

          {visiblePosts.length > 0 ? (
            <>
              <div ref={loadMoreRef} className="h-1 w-full" aria-hidden="true" />
              {isFetchingNextFeedPage ? (
                <div className="py-3 text-center text-[11px] text-[color:var(--text-muted)]">
                  {t(msg`正在加载更多…`)}
                </div>
              ) : !hasNextFeedPage ? (
                <div className="py-3 text-center text-[11px] text-[color:var(--text-muted)]">
                  {t(msg`已经到底了`)}
                </div>
              ) : null}
            </>
          ) : null}

          {!feedQuery.isLoading &&
          !feedQuery.isError &&
          !visiblePosts.length ? (
            <MobileFeedStatusCard
              badge={t(msg`广场`)}
              title={t(msg`还没有新动态`)}
              description={t(
                msg`你先发一条居民公开可见的动态，或者等世界里的居民先开口。`,
              )}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  className="h-8 rounded-full bg-[#07c160] px-3.5 text-[11px] text-white hover:bg-[#06ad56]"
                  onClick={handleEmptyStateAction}
                >
                  {safeReturnPath ? t(msg`返回上一页`) : t(msg`发一条广场动态`)}
                </Button>
              }
            />
          ) : null}
        </section>
      </div>

      <FeedPostShareCardModal
        post={
          shareCardPostId
            ? visiblePosts.find((item) => item.id === shareCardPostId) ?? null
            : null
        }
        ownerDisplayName={
          ownerUsername?.trim() || t(msg`世界主人`)
        }
        onClose={() => setShareCardPostId(null)}
      />

      <WeChatActionBubble
        open={Boolean(actionBubble)}
        anchorRect={actionBubble?.anchorRect ?? null}
        liked={
          actionBubble
            ? Boolean(
                visiblePosts.find((item) => item.id === actionBubble.postId)
                  ?.ownerState?.hasLiked,
              )
            : false
        }
        favorited={
          actionBubble
            ? favoriteSourceIds.includes(`feed-${actionBubble.postId}`)
            : false
        }
        onLike={() => {
          if (!actionBubble) return;
          likeMutation.mutate(actionBubble.postId);
        }}
        onComment={() => {
          if (!actionBubble) return;
          setCommentBarTarget({
            postId: actionBubble.postId,
            replyTo: null,
          });
        }}
        onFavorite={() => {
          if (!actionBubble) return;
          toggleFavoriteByPostId(actionBubble.postId);
        }}
        onClose={() => setActionBubble(null)}
      />

      <WeChatCommentBar
        open={Boolean(commentBarTarget)}
        replyTo={commentBarTarget?.replyTo ?? null}
        value={
          commentBarTarget
            ? (commentDrafts[commentBarTarget.postId] ?? "")
            : ""
        }
        onChange={(value: string) => {
          if (!commentBarTarget) return;
          setCommentDrafts((current) => ({
            ...current,
            [commentBarTarget.postId]: value,
          }));
        }}
        pending={
          commentBarTarget
            ? pendingCommentPostId === commentBarTarget.postId
            : false
        }
        onSubmit={() => {
          if (!commentBarTarget) return;
          submitComment(commentBarTarget.postId, {
            replyTarget: commentBarTarget.replyTo
              ? {
                  authorId: commentBarTarget.replyTo.authorId,
                  authorName: commentBarTarget.replyTo.authorName,
                  commentId: commentBarTarget.replyTo.commentId,
                  postId: commentBarTarget.postId,
                }
              : null,
          });
        }}
        onClose={() => setCommentBarTarget(null)}
      />
    </AppPage>
  );
}

function MoreHorizontalDots() {
  return (
    <svg
      width="14"
      height="3"
      viewBox="0 0 14 3"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="2" cy="1.5" r="1.2" />
      <circle cx="7" cy="1.5" r="1.2" />
      <circle cx="12" cy="1.5" r="1.2" />
    </svg>
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
