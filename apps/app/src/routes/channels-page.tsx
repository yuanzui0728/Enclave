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
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  EyeOff,
  MessageCircleMore,
  Pause,
  Play,
  Share2,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  addFeedComment,
  favoriteFeedPost,
  followChannelAuthor,
  generateChannelPost,
  getChannelAuthorProfile,
  getChannelHome,
  getFeedPost,
  likeFeedPost,
  likeFeedComment,
  listFeedComments,
  markFeedPostNotInterested,
  replyFeedComment,
  shareFeedPost,
  unfavoriteFeedPost,
  unfollowChannelAuthor,
  viewFeedPost,
  type FeedComment,
  type FeedChannelHomeSection,
  type FeedPostListItem,
  type FeedPostWithComments,
} from "@yinjie/contracts";
import { AppPage, Button, cn, InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { RouteRedirectState } from "../components/route-redirect-state";
import {
  buildDesktopChannelsRouteHash,
  parseDesktopChannelsRouteHash,
} from "../features/channels/channels-route-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const EMPTY_CHANNEL_POSTS: FeedPostListItem[] = [];
const DesktopChannelsWorkspace = lazy(async () => {
  const mod =
    await import("../features/desktop/channels/desktop-channels-workspace");
  return { default: mod.DesktopChannelsWorkspace };
});

type FeedCommentReplyTarget = {
  authorId: string;
  authorName: string;
  commentId: string;
  postId: string;
};

export function ChannelsPage() {
  const isDesktopLayout = useDesktopLayout();
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
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const routeState = useMemo(() => parseDesktopChannelsRouteHash(hash), [hash]);
  const normalizedDesktopReturnPath =
    isDesktopLayout && routeState.returnPath === "/discover/channels"
      ? "/tabs/channels"
      : routeState.returnPath;
  const isDesktopChannelsRoute =
    pathname === "/tabs/channels" || pathname === "/discover/channels";
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const safeReturnPath =
    normalizedDesktopReturnPath &&
    !isDesktopOnlyPath(normalizedDesktopReturnPath)
      ? normalizedDesktopReturnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const routeSelectedPostId = routeState.postId;
  const routeSelectedAuthorId = routeState.authorId;
  const [activeSection, setActiveSection] =
    useState<FeedChannelHomeSection>(routeState.section ?? "recommended");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [desktopSelectedPostId, setDesktopSelectedPostId] = useState<
    string | null
  >(routeSelectedPostId);
  const [mobileCommentSheetPostId, setMobileCommentSheetPostId] = useState<
    string | null
  >(null);
  const [mobileReplyTarget, setMobileReplyTarget] =
    useState<FeedCommentReplyTarget | null>(null);
  const [desktopReplyTarget, setDesktopReplyTarget] =
    useState<FeedCommentReplyTarget | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const previousBaseUrlRef = useRef(baseUrl);

  const channelsQuery = useQuery({
    queryKey: ["app-channels-home", baseUrl, activeSection],
    queryFn: () =>
      getChannelHome(baseUrl, {
        section: activeSection,
        limit: 20,
      }),
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) => likeFeedPost(postId, baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNotice("视频号互动已更新。");
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
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
        throw new Error("请先输入评论内容。");
      }

      if (input.replyTarget) {
        return replyFeedComment(
          input.replyTarget.commentId,
          {
            text,
          },
          baseUrl,
        );
      }

      return addFeedComment(
        input.postId,
        {
          text,
        },
        baseUrl,
      );
    },
    onSuccess: async (_, input) => {
      setCommentDrafts((current) => ({ ...current, [input.postId]: "" }));
      setMobileReplyTarget((current) =>
        current?.postId === input.postId ? null : current,
      );
      setDesktopReplyTarget((current) =>
        current?.postId === input.postId ? null : current,
      );
      setNoticeTone("success");
      setNotice(
        input.replyTarget ? "视频号回复已发送。" : "视频号评论已发送。",
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-channels-home", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-feed-comments", baseUrl, input.postId],
        }),
      ]);
    },
  });
  const generateMutation = useMutation({
    mutationFn: () => generateChannelPost(baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNotice("已生成一条新的 AI 视频号内容。");
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
    },
  });
  const favoriteMutation = useMutation({
    mutationFn: (input: { postId: string; favorited: boolean }) =>
      input.favorited
        ? unfavoriteFeedPost(input.postId, baseUrl)
        : favoriteFeedPost(input.postId, baseUrl),
    onSuccess: async (_, input) => {
      setNoticeTone("success");
      setNotice(input.favorited ? "已取消收藏。" : "已收藏这条视频号内容。");
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
    },
  });
  const followMutation = useMutation({
    mutationFn: (input: { authorId: string; following: boolean }) =>
      input.following
        ? unfollowChannelAuthor(input.authorId, baseUrl)
        : followChannelAuthor(input.authorId, baseUrl),
    onSuccess: async (_, input) => {
      setNoticeTone("success");
      setNotice(input.following ? "已取消关注。" : "已关注该视频号作者。");
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
    },
  });
  const notInterestedMutation = useMutation({
    mutationFn: (postId: string) => markFeedPostNotInterested(postId, baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNotice("这类内容会减少推荐。");
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
    },
  });
  const likeCommentMutation = useMutation({
    mutationFn: (input: { commentId: string; postId: string }) =>
      likeFeedComment(input.commentId, baseUrl),
    onSuccess: async (_, input) => {
      setNoticeTone("success");
      setNotice("评论互动已更新。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-channels-home", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-feed-comments", baseUrl, input.postId],
        }),
      ]);
    },
  });

  const visiblePosts = channelsQuery.data?.posts ?? EMPTY_CHANNEL_POSTS;
  const desktopMissingRoutePostId =
    isDesktopLayout &&
    routeSelectedPostId &&
    !visiblePosts.some((post) => post.id === routeSelectedPostId)
      ? routeSelectedPostId
      : null;
  const desktopMissingRoutePostQuery = useQuery({
    queryKey: ["app-feed-post", baseUrl, desktopMissingRoutePostId],
    queryFn: async () => {
      if (!desktopMissingRoutePostId) {
        return null;
      }

      const post = await getFeedPost(desktopMissingRoutePostId, baseUrl);
      if (!post || post.surface !== "channels") {
        return null;
      }

      return post;
    },
    enabled: Boolean(desktopMissingRoutePostId),
  });
  const desktopWorkspacePosts = useMemo(() => {
    const routePost = desktopMissingRoutePostQuery.data;
    if (!routePost || !desktopMissingRoutePostId) {
      return visiblePosts;
    }

    if (visiblePosts.some((post) => post.id === routePost.id)) {
      return visiblePosts;
    }

    return [createDesktopChannelRoutePost(routePost), ...visiblePosts];
  }, [
    desktopMissingRoutePostId,
    desktopMissingRoutePostQuery.data,
    visiblePosts,
  ]);
  const desktopRoutePostPending =
    Boolean(desktopMissingRoutePostId) && desktopMissingRoutePostQuery.isLoading;
  const desktopSelectedPost = useMemo(
    () =>
      desktopWorkspacePosts.find((post) => post.id === desktopSelectedPostId) ??
      null,
    [desktopSelectedPostId, desktopWorkspacePosts],
  );
  const syncedRouteSelectedAuthorId =
    routeSelectedAuthorId &&
    desktopSelectedPost?.authorId === routeSelectedAuthorId
      ? routeSelectedAuthorId
      : undefined;
  const mobileCommentSheetPost = useMemo(
    () =>
      visiblePosts.find((post) => post.id === mobileCommentSheetPostId) ?? null,
    [mobileCommentSheetPostId, visiblePosts],
  );
  const mobileCommentsQuery = useQuery({
    queryKey: ["app-feed-comments", baseUrl, mobileCommentSheetPostId],
    queryFn: () => listFeedComments(mobileCommentSheetPostId!, baseUrl),
    enabled: Boolean(mobileCommentSheetPostId),
    placeholderData: mobileCommentSheetPost?.commentsPreview ?? [],
  });
  const desktopCommentsQuery = useQuery({
    queryKey: ["app-feed-comments", baseUrl, desktopSelectedPostId],
    queryFn: () => listFeedComments(desktopSelectedPostId!, baseUrl),
    enabled: Boolean(isDesktopLayout && desktopSelectedPostId),
    placeholderData: desktopSelectedPost?.commentsPreview ?? [],
  });
  const desktopAuthorProfileQuery = useQuery({
    queryKey: ["app-channel-author", baseUrl, syncedRouteSelectedAuthorId],
    queryFn: () => getChannelAuthorProfile(syncedRouteSelectedAuthorId!, baseUrl),
    enabled: Boolean(isDesktopLayout && syncedRouteSelectedAuthorId),
  });
  const channelSections = useMemo<
    Array<{ key: FeedChannelHomeSection; label: string; count: number }>
  >(
    () =>
      channelsQuery.data?.sections ?? [
        { key: "recommended", label: "推荐", count: 0 },
        { key: "friends", label: "朋友", count: 0 },
        { key: "following", label: "关注", count: 0 },
        { key: "live", label: "直播", count: 0 },
      ],
    [channelsQuery.data?.sections],
  );
  const errorMessage =
    (channelsQuery.isError && channelsQuery.error instanceof Error
      ? channelsQuery.error.message
      : null) ??
    (likeMutation.isError && likeMutation.error instanceof Error
      ? likeMutation.error.message
      : null) ??
    (favoriteMutation.isError && favoriteMutation.error instanceof Error
      ? favoriteMutation.error.message
      : null) ??
    (followMutation.isError && followMutation.error instanceof Error
      ? followMutation.error.message
      : null) ??
    (notInterestedMutation.isError &&
    notInterestedMutation.error instanceof Error
      ? notInterestedMutation.error.message
      : null) ??
    (generateMutation.isError && generateMutation.error instanceof Error
      ? generateMutation.error.message
      : null) ??
    (desktopMissingRoutePostId &&
    desktopMissingRoutePostQuery.isError &&
    desktopMissingRoutePostQuery.error instanceof Error
      ? desktopMissingRoutePostQuery.error.message
      : null) ??
    (commentMutation.isError && commentMutation.error instanceof Error
      ? commentMutation.error.message
      : null);
  const mobileCommentSheetErrorMessage =
    (mobileCommentsQuery.isError && mobileCommentsQuery.error instanceof Error
      ? mobileCommentsQuery.error.message
      : null) ??
    (likeCommentMutation.isError &&
    likeCommentMutation.error instanceof Error &&
    likeCommentMutation.variables?.postId === mobileCommentSheetPostId
      ? likeCommentMutation.error.message
      : null) ??
    (commentMutation.isError &&
    commentMutation.error instanceof Error &&
    commentMutation.variables?.postId === mobileCommentSheetPostId
      ? commentMutation.error.message
      : null);
  const desktopCommentPanelErrorMessage =
    (desktopCommentsQuery.isError && desktopCommentsQuery.error instanceof Error
      ? desktopCommentsQuery.error.message
      : null) ??
    (likeCommentMutation.isError &&
    likeCommentMutation.error instanceof Error &&
    likeCommentMutation.variables?.postId === desktopSelectedPostId
      ? likeCommentMutation.error.message
      : null) ??
    (commentMutation.isError &&
    commentMutation.error instanceof Error &&
    commentMutation.variables?.postId === desktopSelectedPostId
      ? commentMutation.error.message
      : null);
  const pendingLikePostId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentPostId = commentMutation.isPending
    ? (commentMutation.variables?.postId ?? null)
    : null;
  const pendingLikeCommentId = likeCommentMutation.isPending
    ? (likeCommentMutation.variables?.commentId ?? null)
    : null;

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

    void channelsQuery.refetch();
  }

  function handleRetryLoad() {
    void channelsQuery.refetch();
  }

  function handleEmptyStateAction() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    generateMutation.mutate();
  }

  useEffect(() => {
    const baseUrlChanged = previousBaseUrlRef.current !== baseUrl;
    previousBaseUrlRef.current = baseUrl;

    if (baseUrlChanged) {
      setCommentDrafts({});
      setNotice("");
    }

    setDesktopSelectedPostId(routeSelectedPostId);
    setDesktopReplyTarget(null);
    setMobileCommentSheetPostId(null);
    setMobileReplyTarget(null);
  }, [baseUrl, routeSelectedPostId]);

  useEffect(() => {
    const routeSection = routeState.section ?? "recommended";
    setActiveSection((current) =>
      current === routeSection ? current : routeSection,
    );
  }, [routeState.section]);

  useEffect(() => {
    if (!desktopSelectedPostId) {
      return;
    }

    if (desktopRoutePostPending) {
      return;
    }

    if (!desktopWorkspacePosts.some((post) => post.id === desktopSelectedPostId)) {
      setDesktopSelectedPostId(null);
      setDesktopReplyTarget(null);
    }
  }, [desktopRoutePostPending, desktopSelectedPostId, desktopWorkspacePosts]);

  useEffect(() => {
    if (!isDesktopLayout || !isDesktopChannelsRoute) {
      return;
    }

    const nextHash = buildDesktopChannelsRouteHash({
      postId: desktopSelectedPostId,
      authorId: syncedRouteSelectedAuthorId,
      section: activeSection,
    });
    if (
      pathname === "/tabs/channels" &&
      (nextHash ?? "") === normalizedHash
    ) {
      return;
    }

    void navigate({
      to: "/tabs/channels",
      hash: nextHash,
      replace: true,
    });
  }, [
    activeSection,
    isDesktopChannelsRoute,
    syncedRouteSelectedAuthorId,
    normalizedHash,
    desktopSelectedPostId,
    isDesktopLayout,
    navigate,
    pathname,
  ]);

  useEffect(() => {
    if (isDesktopLayout || pathname !== "/discover/channels") {
      return;
    }

    const nextHash = buildDesktopChannelsRouteHash({
      postId:
        routeState.section === activeSection ? routeSelectedPostId : undefined,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
      section: activeSection,
    });
    if ((nextHash ?? "") === normalizedHash) {
      return;
    }

    void navigate({
      to: "/discover/channels",
      hash: nextHash,
      replace: true,
    });
  }, [
    activeSection,
    isDesktopLayout,
    navigate,
    normalizedHash,
    pathname,
    routeSelectedPostId,
    routeState.section,
    safeReturnHash,
    safeReturnPath,
  ]);

  useEffect(() => {
    if (!mobileCommentSheetPostId) {
      return;
    }

    if (!visiblePosts.some((post) => post.id === mobileCommentSheetPostId)) {
      setMobileCommentSheetPostId(null);
      setMobileReplyTarget(null);
    }
  }, [mobileCommentSheetPostId, visiblePosts]);

  useEffect(() => {
    if (!mobileReplyTarget) {
      return;
    }

    if (mobileReplyTarget.postId !== mobileCommentSheetPostId) {
      setMobileReplyTarget(null);
    }
  }, [mobileCommentSheetPostId, mobileReplyTarget]);

  useEffect(() => {
    if (!desktopReplyTarget) {
      return;
    }

    if (desktopReplyTarget.postId !== desktopSelectedPostId) {
      setDesktopReplyTarget(null);
    }
  }, [desktopReplyTarget, desktopSelectedPostId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function handleSharePost(post: (typeof visiblePosts)[number]) {
    const shareHash = buildDesktopChannelsRouteHash({
      postId: post.id,
      section: activeSection,
    });
    const sharePath = `${pathname}${shareHash ? `#${shareHash}` : ""}`;
    const shareUrl =
      typeof window === "undefined"
        ? sharePath
        : `${window.location.origin}${sharePath}`;
    const summaryText = `${post.authorName}：${post.text}\n${shareUrl}`;

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${post.authorName} 的视频号动态`,
        text: `${post.authorName}：${post.text}`,
        url: shareUrl,
      });

      if (shared) {
        await shareFeedPost(post.id, { channel: "native" }, baseUrl);
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
          : "当前环境暂不支持复制内容摘要。",
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(summaryText);
      await shareFeedPost(post.id, { channel: "copy" }, baseUrl);
      setNoticeTone("success");
      setNotice(
        nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制内容摘要。"
          : "内容摘要已复制。",
      );
    } catch {
      setNoticeTone("info");
      setNotice(
        nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制内容摘要失败，请稍后重试。",
      );
    }
  }

  function toggleFavorite(post: (typeof visiblePosts)[number]) {
    const sourceId = `channels-${post.id}`;
    const routeHash = buildDesktopChannelsRouteHash({
      postId: post.id,
      section: activeSection,
    });
    const alreadyFavorited = Boolean(post.ownerState?.hasFavorited);
    if (alreadyFavorited) {
      removeDesktopFavorite(sourceId);
    } else {
      upsertDesktopFavorite({
        id: `favorite-${sourceId}`,
        sourceId,
        category: "channels",
        title: post.authorName,
        description: post.text,
        meta: `视频号 · ${formatTimestamp(post.createdAt)}`,
        to: `/tabs/channels${routeHash ? `#${routeHash}` : ""}`,
        badge: "视频号",
        avatarName: post.authorName,
        avatarSrc: post.authorAvatar,
      });
    }

    favoriteMutation.mutate({
      postId: post.id,
      favorited: alreadyFavorited,
    });
  }

  function toggleFollowAuthor(post: (typeof visiblePosts)[number]) {
    followMutation.mutate({
      authorId: post.authorId,
      following: Boolean(post.ownerState?.isFollowingAuthor),
    });
  }

  function hidePost(postId: string) {
    notInterestedMutation.mutate(postId);
  }

  function handleSectionChange(section: FeedChannelHomeSection) {
    if (section === activeSection) {
      return;
    }

    if (isDesktopLayout) {
      void navigate({
        to: "/tabs/channels",
        hash: buildDesktopChannelsRouteHash({
          section,
        }),
        replace: true,
      });
      return;
    }

    setActiveSection(section);
  }

  function openChannelAuthor(
    authorId: string,
    options?: {
      sourcePostId?: string | null;
    },
  ) {
    const sourcePostId =
      options?.sourcePostId ?? desktopSelectedPostId ?? routeSelectedPostId;
    const sourceHash = buildDesktopChannelsRouteHash({
      postId: sourcePostId,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
      section: activeSection,
    });

    if (isDesktopLayout) {
      void navigate({
        to: "/tabs/channels",
        hash: buildDesktopChannelsRouteHash({
          postId: sourcePostId,
          authorId,
          section: activeSection,
        }),
      });
      return;
    }

    void navigate({
      to: "/channels/authors/$authorId",
      params: { authorId },
      hash: buildDesktopChannelsRouteHash({
        postId: sourcePostId,
        returnPath: pathname,
        returnHash: sourceHash,
        section: activeSection,
      }),
    });
  }

  function closeChannelAuthor() {
    void navigate({
      to: "/tabs/channels",
      hash: buildDesktopChannelsRouteHash({
        postId: desktopSelectedPostId,
        section: activeSection,
      }),
      replace: true,
    });
  }

  function openChannelAuthorPost(postId: string, authorId: string) {
    void navigate({
      to: "/tabs/channels",
      hash: buildDesktopChannelsRouteHash({
        postId,
        authorId,
        section: activeSection,
      }),
    });
  }

  function updateCommentDraft(postId: string, value: string) {
    setCommentDrafts((current) => ({
      ...current,
      [postId]: value,
    }));
  }

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

  if (isDesktopLayout && desktopRoutePostPending) {
    return (
      <RouteRedirectState
        title="正在定位桌面视频号内容"
        description="当前链接指向的内容不在推荐流里，正在补齐这条视频后再切进工作区。"
        loadingLabel="定位视频号内容..."
      />
    );
  }

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在打开桌面视频号"
            description="正在载入桌面视频号工作区，马上显示当前频道内容。"
            loadingLabel="载入桌面视频号..."
          />
        }
      >
        <DesktopChannelsWorkspace
          activeSection={activeSection}
          authorProfile={desktopAuthorProfileQuery.data ?? null}
          authorProfileErrorMessage={
            desktopAuthorProfileQuery.isError &&
            desktopAuthorProfileQuery.error instanceof Error
              ? desktopAuthorProfileQuery.error.message
              : null
          }
          authorProfileLoading={desktopAuthorProfileQuery.isLoading}
          commentDrafts={commentDrafts}
          commentPendingPostId={pendingCommentPostId}
          errorMessage={errorMessage}
          isLoading={channelsQuery.isLoading}
          likePendingPostId={pendingLikePostId}
          posts={desktopWorkspacePosts}
          routeSelectedAuthorId={syncedRouteSelectedAuthorId}
          routeSelectedPostId={routeSelectedPostId}
          sections={channelSections}
          successNotice={notice}
          isPostFavorite={(postId) =>
            desktopWorkspacePosts.find((post) => post.id === postId)
              ?.ownerState?.hasFavorited ?? false
          }
          onCommentChange={updateCommentDraft}
          onCommentSubmit={(postId) =>
            submitComment(postId, { replyTarget: desktopReplyTarget })
          }
          onLike={(postId) => likeMutation.mutate(postId)}
          onRefresh={() => generateMutation.mutate()}
          comments={desktopCommentsQuery.data ?? []}
          commentsErrorMessage={desktopCommentPanelErrorMessage}
          commentsLoading={desktopCommentsQuery.isLoading}
          commentReplyTarget={desktopReplyTarget}
          commentLikePendingId={pendingLikeCommentId}
          onCancelCommentReply={() => setDesktopReplyTarget(null)}
          onCloseAuthor={closeChannelAuthor}
          onOpenAuthor={openChannelAuthor}
          onOpenAuthorPost={openChannelAuthorPost}
          onToggleAuthorFollow={(authorId, following) =>
            followMutation.mutate({ authorId, following })
          }
          onSectionChange={handleSectionChange}
          onToggleFavorite={toggleFavorite}
          onLikeComment={(comment) =>
            likeCommentMutation.mutate({
              commentId: comment.id,
              postId: comment.postId,
            })
          }
          onReplyToComment={(comment) =>
            setDesktopReplyTarget({
              authorId: comment.authorId,
              authorName: comment.authorName,
              commentId: comment.id,
              postId: comment.postId,
            })
          }
          onSelectedPostChange={setDesktopSelectedPostId}
          onViewPost={(postId) => {
            void viewFeedPost(postId, { progressSeconds: 3 }, baseUrl);
          }}
        />
      </Suspense>
    );
  }

  return (
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      <TabPageTopBar
        title="视频号"
        subtitle="内容推荐与视频动态"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() => {
              navigateBackOrFallback(() => {
                if (safeReturnPath) {
                  void navigate({
                    to: safeReturnPath,
                    ...(safeReturnHash ? { hash: safeReturnHash } : {}),
                  });
                  return;
                }

                void navigate({ to: "/tabs/discover" });
              });
            }}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <Button
            onClick={() => generateMutation.mutate()}
            variant="ghost"
            size="sm"
            className="h-8 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3.5 text-[12px] font-medium text-[color:var(--text-primary)] hover:bg-white"
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? "生成中..." : "换一批"}
          </Button>
        }
      >
        <div className="mt-1.5 flex items-center gap-1">
          {channelSections.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => handleSectionChange(section.key)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[8px] transition",
                activeSection === section.key
                  ? "bg-[rgba(7,193,96,0.12)] font-medium text-[#07c160]"
                  : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-muted)]",
              )}
            >
              {section.label}
              {section.count > 0 ? ` ${section.count}` : ""}
            </button>
          ))}
        </div>
      </TabPageTopBar>

      <div className="space-y-1.5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2.5">
        <InlineNotice
          className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          tone="muted"
        >
          当前先聚焦推荐流体验，系统会持续补充 AI 生成的视频内容与互动演示。
        </InlineNotice>
        {notice ? (
          <InlineNotice
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone={noticeTone}
          >
            {noticeTone === "info" ? (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{notice}</span>
                <button
                  type="button"
                  onClick={handleStatusBack}
                  className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {safeReturnPath ? "返回上一页" : "重新加载"}
                </button>
              </div>
            ) : (
              notice
            )}
          </InlineNotice>
        ) : null}
        {errorMessage ? (
          <MobileChannelsStatusCard
            badge="读取失败"
            description={errorMessage}
            title="视频号暂时不可用"
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={handleRetryLoad}
                >
                  重试读取
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={handleStatusBack}
                >
                  {safeReturnPath ? "返回上一页" : "重新加载"}
                </Button>
              </div>
            }
          />
        ) : null}
        {channelsQuery.isLoading ? (
          <MobileChannelsStatusCard
            badge="读取中"
            title="正在刷新视频号内容"
            description="稍等一下，正在同步推荐流和互动状态。"
            tone="loading"
          />
        ) : null}

        {!channelsQuery.isLoading && !visiblePosts.length ? (
          <MobileChannelsStatusCard
            badge="视频号"
            title="还没有内容"
            description="再生成一批内容后，这里会逐步形成更连续的视频推荐流。"
            action={
              <Button
                variant="primary"
                size="sm"
                className="h-8 rounded-full bg-[#07c160] px-3.5 text-[11px] text-white hover:bg-[#06ad56]"
                disabled={generateMutation.isPending}
                onClick={handleEmptyStateAction}
              >
                {safeReturnPath
                  ? "返回上一页"
                  : generateMutation.isPending
                    ? "生成中..."
                    : "换一批"}
              </Button>
            }
          />
        ) : null}
        {!channelsQuery.isLoading && visiblePosts.length ? (
          <MobileChannelsViewport
            likePendingPostId={pendingLikePostId}
            posts={visiblePosts}
            routeSelectedPostId={routeSelectedPostId}
            onLike={(postId) => likeMutation.mutate(postId)}
            onOpenAuthor={(post) =>
              openChannelAuthor(post.authorId, { sourcePostId: post.id })
            }
            onOpenComments={(post) => {
              setMobileCommentSheetPostId(post.id);
              setMobileReplyTarget(null);
            }}
            onNotInterested={hidePost}
            onShare={(post) => void handleSharePost(post)}
            onToggleFollowAuthor={toggleFollowAuthor}
            onToggleFavorite={toggleFavorite}
            onVisiblePost={(postId) => {
              void viewFeedPost(postId, { progressSeconds: 1 }, baseUrl);
            }}
          />
        ) : null}
      </div>
      <MobileChannelCommentsSheet
        comments={mobileCommentsQuery.data ?? []}
        draft={
          mobileCommentSheetPost
            ? (commentDrafts[mobileCommentSheetPost.id] ?? "")
            : ""
        }
        errorMessage={mobileCommentSheetErrorMessage}
        isLoading={mobileCommentsQuery.isLoading}
        likePendingCommentId={pendingLikeCommentId}
        open={Boolean(mobileCommentSheetPost)}
        post={mobileCommentSheetPost}
        replyTarget={mobileReplyTarget}
        submitPending={pendingCommentPostId === mobileCommentSheetPost?.id}
        onCancelReply={() => setMobileReplyTarget(null)}
        onClose={() => {
          setMobileCommentSheetPostId(null);
          setMobileReplyTarget(null);
        }}
        onDraftChange={(value) => {
          if (!mobileCommentSheetPost) {
            return;
          }

          updateCommentDraft(mobileCommentSheetPost.id, value);
        }}
        onLikeComment={(comment) =>
          likeCommentMutation.mutate({
            commentId: comment.id,
            postId: comment.postId,
          })
        }
        onReply={(comment) =>
          setMobileReplyTarget({
            authorId: comment.authorId,
            authorName: comment.authorName,
            commentId: comment.id,
            postId: comment.postId,
          })
        }
        onSubmit={() => {
          if (!mobileCommentSheetPost) {
            return;
          }

          submitComment(mobileCommentSheetPost.id, {
            replyTarget: mobileReplyTarget,
          });
        }}
      />
    </AppPage>
  );
}

function MobileChannelsStatusCard({
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
      {loading ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-black/15 animate-pulse" />
          <span className="h-2 w-2 rounded-full bg-black/25 animate-pulse [animation-delay:120ms]" />
          <span className="h-2 w-2 rounded-full bg-[#8ecf9d] animate-pulse [animation-delay:240ms]" />
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

function createDesktopChannelRoutePost(
  post: FeedPostWithComments,
): FeedPostListItem {
  return {
    ...post,
    commentsPreview: post.comments,
  };
}

type MobileChannelsViewportProps = {
  likePendingPostId: string | null;
  posts: FeedPostListItem[];
  routeSelectedPostId: string | null;
  onLike: (postId: string) => void;
  onOpenAuthor: (post: FeedPostListItem) => void;
  onOpenComments: (post: FeedPostListItem) => void;
  onNotInterested: (postId: string) => void;
  onShare: (post: FeedPostListItem) => void;
  onToggleFollowAuthor: (post: FeedPostListItem) => void;
  onToggleFavorite: (post: FeedPostListItem) => void;
  onVisiblePost: (postId: string) => void;
};

function MobileChannelsViewport({
  likePendingPostId,
  posts,
  routeSelectedPostId,
  onLike,
  onOpenAuthor,
  onOpenComments,
  onNotInterested,
  onShare,
  onToggleFollowAuthor,
  onToggleFavorite,
  onVisiblePost,
}: MobileChannelsViewportProps) {
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!posts.length) {
      setActivePostId(null);
      return;
    }

    if (!activePostId || !posts.some((post) => post.id === activePostId)) {
      setActivePostId(posts[0]?.id ?? null);
    }
  }, [activePostId, posts]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio,
          )[0];
        const nextPostId = nextEntry?.target.getAttribute("data-post-id");
        if (nextPostId) {
          setActivePostId(nextPostId);
        }
      },
      {
        threshold: [0.45, 0.65, 0.85],
        rootMargin: "-10% 0px -14% 0px",
      },
    );

    cardRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [posts]);

  useEffect(() => {
    if (!routeSelectedPostId) {
      return;
    }

    const targetNode = cardRefs.current.get(routeSelectedPostId);
    if (!targetNode) {
      return;
    }

    window.requestAnimationFrame(() => {
      targetNode.scrollIntoView({ behavior: "smooth", block: "start" });
      setActivePostId(routeSelectedPostId);
    });
  }, [routeSelectedPostId, posts]);

  useEffect(() => {
    if (!activePostId) {
      return;
    }

    onVisiblePost(activePostId);
  }, [activePostId, onVisiblePost]);

  return (
    <div className="h-[calc(100dvh-9.6rem)] snap-y snap-mandatory space-y-2 overflow-y-auto overscroll-contain scroll-pb-2 pb-2">
      {posts.map((post) => (
        <MobileChannelsCard
          key={post.id}
          active={activePostId === post.id}
          favorite={Boolean(post.ownerState?.hasFavorited)}
          likePending={likePendingPostId === post.id}
          post={post}
          setCardRef={(node) => {
            if (node) {
              cardRefs.current.set(post.id, node);
              return;
            }

            cardRefs.current.delete(post.id);
          }}
          onLike={() => onLike(post.id)}
          onOpenAuthor={() => onOpenAuthor(post)}
          onOpenComments={() => onOpenComments(post)}
          onNotInterested={() => onNotInterested(post.id)}
          onShare={() => onShare(post)}
          onToggleFollowAuthor={() => onToggleFollowAuthor(post)}
          onToggleFavorite={() => onToggleFavorite(post)}
        />
      ))}
    </div>
  );
}

type MobileChannelsCardProps = {
  active: boolean;
  favorite: boolean;
  likePending: boolean;
  post: FeedPostListItem;
  setCardRef: (node: HTMLElement | null) => void;
  onLike: () => void;
  onOpenAuthor: () => void;
  onOpenComments: () => void;
  onNotInterested: () => void;
  onShare: () => void;
  onToggleFollowAuthor: () => void;
  onToggleFavorite: () => void;
};

function MobileChannelsCard({
  active,
  favorite,
  likePending,
  post,
  setCardRef,
  onLike,
  onOpenAuthor,
  onOpenComments,
  onNotInterested,
  onShare,
  onToggleFollowAuthor,
  onToggleFavorite,
}: MobileChannelsCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [manuallyPaused, setManuallyPaused] = useState(false);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!active) {
      video.pause();
      setManuallyPaused(false);
      return;
    }

    if (manuallyPaused) {
      video.pause();
      return;
    }

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }, [active, manuallyPaused]);

  return (
    <article
      ref={setCardRef}
      data-post-id={post.id}
      className="snap-start scroll-mt-2 overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-white shadow-none"
    >
      <div className="relative min-h-[calc(100dvh-12rem)] bg-[#0f1115]">
        <video
          ref={videoRef}
          src={post.mediaUrl}
          loop
          muted
          playsInline
          preload="metadata"
          className="block h-[64dvh] w-full bg-black object-cover"
          onClick={() => setManuallyPaused((current) => !current)}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.88))]" />

        <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5">
          <div className="rounded-full bg-[rgba(15,23,42,0.62)] px-2.5 py-1 text-[10px] font-medium tracking-[0.04em] text-white">
            视频号推荐
          </div>
          {post.aiReacted ? (
            <div className="rounded-full bg-[rgba(7,193,96,0.9)] px-2.5 py-1 text-[10px] font-medium text-white">
              AI 已互动
            </div>
          ) : null}
          {active ? (
            <div className="rounded-full bg-[rgba(7,193,96,0.82)] px-2.5 py-1 text-[10px] font-medium text-white">
              当前播放
            </div>
          ) : null}
        </div>

        <div className="absolute right-3.5 top-3.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted((current) => !current)}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(15,23,42,0.62)] text-white backdrop-blur transition active:scale-[0.97] active:bg-[rgba(15,23,42,0.78)]"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button
            type="button"
            onClick={() => setManuallyPaused((current) => !current)}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(15,23,42,0.62)] text-white backdrop-blur transition active:scale-[0.97] active:bg-[rgba(15,23,42,0.78)]"
          >
            {manuallyPaused ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </div>

        <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
          <div className="flex flex-col items-center gap-2.5">
            <ActionRailButton
              label={likePending ? "处理中" : String(post.likeCount)}
              onClick={onLike}
            >
              <ThumbsUp size={17} />
            </ActionRailButton>
            <ActionRailButton
              label={String(post.commentCount)}
              onClick={onOpenComments}
            >
              <MessageCircleMore size={17} />
            </ActionRailButton>
            <ActionRailButton
              active={favorite}
              label={favorite ? "已收藏" : "收藏"}
              onClick={onToggleFavorite}
            >
              {favorite ? (
                <Bookmark size={17} className="fill-current" />
              ) : (
                <Bookmark size={17} />
              )}
            </ActionRailButton>
            <ActionRailButton label="分享" onClick={onShare}>
              <Share2 size={17} />
            </ActionRailButton>
            <ActionRailButton label="减少推荐" onClick={onNotInterested}>
              <EyeOff size={17} />
            </ActionRailButton>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-3.5 pb-3.5">
          <div className="max-w-[calc(100%-4.25rem)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenAuthor}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <AvatarChip
                  name={post.authorName}
                  src={post.authorAvatar}
                  size="wechat"
                />
                <div className="min-w-0 flex-1 text-white">
                  <div className="truncate text-[12px] font-medium">
                    {post.authorName}
                  </div>
                  <div className="mt-0.5 text-[9px] text-white/70">
                    {formatTimestamp(post.createdAt)} · 视频号动态
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={onToggleFollowAuthor}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-medium transition",
                  post.ownerState?.isFollowingAuthor
                    ? "border border-white/20 bg-white/10 text-white/72"
                    : "bg-[#07c160] text-white",
                )}
              >
                {post.ownerState?.isFollowingAuthor ? "已关注" : "+关注"}
              </button>
            </div>
            {post.title ? (
              <div className="mt-2 text-[13px] font-medium text-white">
                {post.title}
              </div>
            ) : null}
            <div className="mt-1 text-[12px] leading-[1.35rem] text-white">
              {post.text}
            </div>
            {post.topicTags?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-white/72">
                {post.topicTags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[rgba(255,255,255,0.12)] px-2 py-1"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-2 text-[9px] text-white/65">
              {formatChannelMeta(post)}
            </div>
            <div className="mt-2 rounded-[16px] bg-[rgba(255,255,255,0.12)] px-2.5 py-2 text-[10px] leading-4 text-white/86 backdrop-blur">
              {post.commentsPreview.length ? (
                <>
                  <div className="mb-1 text-[9px] uppercase tracking-[0.03em] text-white/60">
                    最近评论
                  </div>
                  <div className="space-y-1">
                    {post.commentsPreview.slice(0, 2).map((comment) => (
                      <div key={comment.id}>
                        <span className="font-medium">
                          {comment.authorName}
                        </span>
                        {`：${comment.text}`}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <span>还没有评论，先聊一句。</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border-subtle)] bg-white px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[color:var(--text-muted)]">
          <span>{post.mediaType === "video" ? "短片" : "内容卡片"}</span>
          <span>{post.likeCount} 赞</span>
          <span>{post.commentCount} 评论</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenComments}
          className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[#f8f8f8] px-3 text-[11px] text-[color:var(--text-primary)] shadow-none"
        >
          打开评论
        </Button>
      </div>
    </article>
  );
}

function ActionRailButton({
  children,
  label,
  active = false,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 text-white transition-transform active:scale-[0.97]"
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(15,23,42,0.62)] backdrop-blur transition-colors",
          active && "bg-[#07c160] shadow-[0_10px_24px_rgba(7,193,96,0.14)]",
        )}
      >
        {children}
      </span>
      <span className="text-[9px]">{label}</span>
    </button>
  );
}

function MobileChannelCommentsSheet({
  comments,
  draft,
  errorMessage,
  isLoading,
  likePendingCommentId,
  open,
  post,
  replyTarget,
  submitPending,
  onCancelReply,
  onClose,
  onDraftChange,
  onLikeComment,
  onReply,
  onSubmit,
}: {
  comments: FeedComment[];
  draft: string;
  errorMessage?: string | null;
  isLoading: boolean;
  likePendingCommentId: string | null;
  open: boolean;
  post: FeedPostListItem | null;
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  submitPending: boolean;
  onCancelReply: () => void;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onReply: (comment: FeedComment) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commentAuthorNameMap = useMemo(() => {
    const map = new Map<string, string>();
    comments.forEach((comment) => {
      map.set(comment.id, comment.authorName);
    });
    return map;
  }, [comments]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [open, replyTarget?.commentId]);

  if (!open || !post) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.14)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭评论面板"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-[20px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] pt-2 shadow-[0_-14px_28px_rgba(15,23,42,0.10)]">
        <div className="flex justify-center pb-1.5">
          <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-[14px] font-medium text-[#111827]">评论</div>
              <div className="rounded-full bg-[rgba(7,193,96,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#07c160]">
                {post.commentCount} 条
              </div>
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-[1.35rem] text-[#6b7280]">
              {post.title ? `${post.title} · ${post.text}` : post.text}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#6b7280] transition active:bg-[color:var(--surface-card-hover)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {errorMessage ? (
            <InlineNotice
              tone="warning"
              className="rounded-[14px] border-[color:var(--border-danger)] bg-white"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#6b7280]"
                >
                  返回视频号
                </button>
              </div>
            </InlineNotice>
          ) : null}
          {isLoading && !comments.length ? (
            <div className="rounded-[16px] border border-[color:var(--border-subtle)] bg-white px-4 py-5 text-center text-[12px] text-[#6b7280]">
              正在读取评论...
            </div>
          ) : null}
          {!isLoading && !comments.length ? (
            <div className="rounded-[16px] border border-dashed border-[color:var(--border-subtle)] bg-white px-4 py-5 text-center text-[12px] leading-6 text-[#6b7280]">
              还没有评论，先发第一句。
            </div>
          ) : null}
          {comments.length ? (
            <div className="space-y-3">
              {comments.map((comment) => {
                const replyTargetName = comment.replyToCommentId
                  ? (commentAuthorNameMap.get(comment.replyToCommentId) ?? null)
                  : null;

                return (
                  <div
                    key={comment.id}
                    className="rounded-[16px] border border-[color:var(--border-subtle)] bg-white px-3.5 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <AvatarChip
                        name={comment.authorName}
                        src={comment.authorAvatar}
                        size="wechat"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="truncate font-medium text-[#111827]">
                            {comment.authorName}
                          </span>
                          <span className="text-[#9ca3af]">
                            {formatTimestamp(comment.createdAt)}
                          </span>
                        </div>
                        <div className="mt-1 text-[12px] leading-6 text-[#111827]">
                          {replyTargetName ? (
                            <span className="text-[#6b7280]">
                              回复 {replyTargetName}
                              {"："}
                            </span>
                          ) : null}
                          {comment.text}
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-[11px] text-[#6b7280]">
                          <button
                            type="button"
                            onClick={() => onReply(comment)}
                            className="transition active:text-[#111827]"
                          >
                            回复
                          </button>
                          <button
                            type="button"
                            disabled={
                              comment.likedByOwner ||
                              likePendingCommentId === comment.id
                            }
                            onClick={() => onLikeComment(comment)}
                            className={cn(
                              "inline-flex items-center gap-1 transition",
                              comment.likedByOwner
                                ? "text-[#07c160]"
                                : "active:text-[#111827]",
                            )}
                          >
                            <ThumbsUp size={12} />
                            {likePendingCommentId === comment.id
                              ? "处理中"
                              : comment.likedByOwner
                                ? `已赞 ${comment.likeCount}`
                                : `赞 ${comment.likeCount}`}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="border-t border-[color:var(--border-subtle)] bg-white px-4 pb-2 pt-3">
          {replyTarget ? (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-[12px] bg-[rgba(7,193,96,0.08)] px-3 py-2 text-[11px] text-[#166534]">
              <div className="truncate">正在回复 {replyTarget.authorName}</div>
              <button
                type="button"
                onClick={onCancelReply}
                className="text-[#166534] transition active:opacity-70"
              >
                取消
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={2}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={
                replyTarget
                  ? `回复 ${replyTarget.authorName}...`
                  : "说点什么..."
              }
              className="min-h-[72px] flex-1 rounded-[16px] border-[color:var(--border-subtle)] bg-[#f7f7f7] px-3 py-2 text-[13px] shadow-none focus:border-[rgba(7,193,96,0.2)] focus:bg-white"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={!draft.trim() || submitPending}
              onClick={onSubmit}
              className="mb-1 h-10 rounded-full bg-[#07c160] px-4 text-[12px] text-white shadow-none hover:bg-[#06ad56]"
            >
              {submitPending ? "发送中..." : "发送"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatChannelMeta(post: FeedPostListItem) {
  const pieces = [`${post.viewCount ?? 0} 播放`];

  if (typeof post.durationMs === "number" && post.durationMs > 0) {
    pieces.push(`${Math.max(1, Math.round(post.durationMs / 1000))} 秒`);
  }

  if (post.topicTags?.length) {
    pieces.push(`#${post.topicTags[0]}`);
  }

  return pieces.join(" · ");
}
