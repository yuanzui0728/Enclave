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
import { useRuntimeTranslator } from "@yinjie/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  EyeOff,
  MessageCircleMore,
  Music2,
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
  unfavoriteFeedPost,
  unfollowChannelAuthor,
  viewFeedPost,
  type FeedChannelHomeResponse,
  type FeedChannelHomeSection,
  type FeedComment,
  type FeedPostListItem,
  type FeedPostWithComments,
} from "@yinjie/contracts";
import { AppPage, Button, cn, InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { ChannelsForwardPicker } from "../components/channels-forward-picker";
import { resolveAppMediaUrl } from "../lib/media-url";
import { ExpandableText } from "../components/expandable-text";
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
import { normalizePathname } from "../lib/normalize-pathname";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const EMPTY_CHANNEL_POSTS: FeedPostListItem[] = [];
const CHANNELS_PAGE_LIMIT = 20;
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
  const t = useRuntimeTranslator();
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
  const normalizedPathname = normalizePathname(pathname);
  const routeState = useMemo(() => parseDesktopChannelsRouteHash(hash), [hash]);
  const normalizedDesktopReturnPath =
    isDesktopLayout && routeState.returnPath === "/discover/channels"
      ? "/tabs/channels"
      : routeState.returnPath;
  const isDesktopChannelsRoute =
    normalizedPathname === "/tabs/channels" ||
    normalizedPathname === "/channels" ||
    normalizedPathname === "/discover/channels";
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
  const [noticeActionLabel, setNoticeActionLabel] = useState<string | null>(
    null,
  );
  const [noticeAction, setNoticeAction] = useState<(() => void) | null>(null);
  // 视频号转发面板：null = 关闭，非空 = 当前要转发的 post 摘要
  const [forwardPickerPost, setForwardPickerPost] = useState<{
    id: string;
    excerpt: string;
  } | null>(null);
  const previousBaseUrlRef = useRef(baseUrl);

  const channelsQuery = useQuery({
    queryKey: ["app-channels-home", baseUrl, activeSection],
    queryFn: () =>
      getChannelHome(baseUrl, {
        section: activeSection,
        limit: CHANNELS_PAGE_LIMIT,
      }),
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) => likeFeedPost(postId, baseUrl),
    onMutate: async (postId) => {
      await queryClient.cancelQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
      const snapshots = queryClient.getQueriesData<FeedChannelHomeResponse>({
        queryKey: ["app-channels-home", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data?.posts) {
          return;
        }
        queryClient.setQueryData<FeedChannelHomeResponse>(key, {
          ...data,
          posts: data.posts.map((post) =>
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
      setNotice(t(msg`视频号互动已更新。`));
      // 点赞 toggle 是 boolean，optimistic 已经切对 hasLiked/likeCount。
      // 完全省掉 invalidate，避免视频号首页全量 + media 条件请求 RTT。
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
    onSuccess: (_, input) => {
      setCommentDrafts((current) => ({ ...current, [input.postId]: "" }));
      setMobileReplyTarget((current) =>
        current?.postId === input.postId ? null : current,
      );
      setDesktopReplyTarget((current) =>
        current?.postId === input.postId ? null : current,
      );
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        input.replyTarget
          ? t(msg`视频号回复已发送。`)
          : t(msg`视频号评论已发送。`),
      );
      // fire-and-forget：await 会让"发送"按钮一直 disabled。
      void queryClient.invalidateQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-feed-comments", baseUrl, input.postId],
      });
    },
  });
  const generateMutation = useMutation({
    mutationFn: () => generateChannelPost(baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`已生成一条新的 AI 视频号内容。`));
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
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        input.favorited
          ? t(msg`已取消收藏。`)
          : t(msg`已收藏这条视频号内容。`),
      );
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
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        input.following
          ? t(msg`已取消关注。`)
          : t(msg`已关注该视频号作者。`),
      );
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
    },
  });
  const notInterestedMutation = useMutation({
    mutationFn: (postId: string) => markFeedPostNotInterested(postId, baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`这类内容会减少推荐。`));
      await queryClient.invalidateQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
    },
  });
  const likeCommentMutation = useMutation({
    mutationFn: (input: { commentId: string; postId: string }) =>
      likeFeedComment(input.commentId, baseUrl),
    onSuccess: (_, input) => {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`评论互动已更新。`));
      // fire-and-forget：await 会让 like-comment 按钮一直 disabled。
      void queryClient.invalidateQueries({
        queryKey: ["app-channels-home", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-feed-comments", baseUrl, input.postId],
      });
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
        { key: "recommended", label: t(msg`推荐`), count: 0 },
        { key: "friends", label: t(msg`朋友`), count: 0 },
        { key: "following", label: t(msg`关注`), count: 0 },
        { key: "live", label: t(msg`直播`), count: 0 },
      ],
    [channelsQuery.data?.sections, t],
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
  const mobileCommentSheetRetryAction =
    mobileCommentsQuery.isError && mobileCommentSheetPostId
      ? {
          label: t(msg`重试读取评论`),
          onClick: () => {
            void mobileCommentsQuery.refetch();
          },
        }
      : likeCommentMutation.isError &&
          likeCommentMutation.error instanceof Error &&
          likeCommentMutation.variables?.postId === mobileCommentSheetPostId
        ? {
            label: t(msg`重试评论点赞`),
            onClick: () => {
              likeCommentMutation.mutate(likeCommentMutation.variables);
            },
          }
        : commentMutation.isError &&
            commentMutation.error instanceof Error &&
            commentMutation.variables?.postId === mobileCommentSheetPostId &&
            commentMutation.variables.text.trim()
          ? {
              label: commentMutation.variables.replyTarget
                ? t(msg`重试回复评论`)
                : t(msg`重试发送评论`),
              onClick: () => {
                commentMutation.mutate(commentMutation.variables);
              },
            }
          : null;
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
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(""); // i18n-ignore-line
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

    // URL 是 section 的真理之源；如果 React state 还没追平 URL（effect 578 还没跑完），
    // 不要拿旧 state 反向写 URL，否则会把刚发生的 tab 切换覆盖掉。
    const urlSection = routeState.section ?? "recommended";
    if (urlSection !== activeSection) {
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
    routeState.section,
  ]);

  useEffect(() => {
    if (isDesktopLayout || normalizedPathname !== "/discover/channels") {
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
    normalizedPathname,
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

    const timer = window.setTimeout(() => {
      setNotice(""); // i18n-ignore-line
      setNoticeActionLabel(null);
      setNoticeAction(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 视频号转发：点击转发按钮 → 弹好友选择器 → 用户选完调
  // forwardFeedPostToChat（在 ChannelsForwardPicker 内部完成）。
  function handleSharePost(post: (typeof visiblePosts)[number]) {
    setForwardPickerPost({
      id: post.id,
      excerpt: `${post.authorName}：${post.text ?? ""}`.slice(0, 80),
    });
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
        meta: t(msg`视频号 · ${formatTimestamp(post.createdAt)}`),
        to: `/tabs/channels${routeHash ? `#${routeHash}` : ""}`,
        badge: t(msg`视频号`),
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
      // 同步把 React state 切到新 section 并清掉旧 post 锚点，
      // 否则后面同步 URL 的 effect 会读到旧 state，把刚发生的 tab 切换覆盖回去。
      setActiveSection(section);
      setDesktopSelectedPostId(null);
      setDesktopReplyTarget(null);
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
        title={t(msg`正在定位桌面视频号内容`)}
        description={t(
          msg`当前链接指向的内容不在推荐流里，正在补齐这条视频后再切进工作区。`,
        )}
        loadingLabel={t(msg`定位视频号内容...`)}
      />
    );
  }

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面视频号`)}
            description={t(
              msg`正在载入桌面视频号工作区，马上显示当前频道内容。`,
            )}
            loadingLabel={t(msg`载入桌面视频号...`)}
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
        title={t(msg`视频号`)}
        subtitle={t(msg`内容推荐与视频动态`)}
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
            {generateMutation.isPending ? t(msg`生成中...`) : t(msg`换一批`)}
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
                "inline-flex h-9 items-center rounded-full px-3 text-[11px] transition",
                activeSection === section.key
                  ? "bg-[rgba(7,193,96,0.12)] font-medium text-[#07c160]"
                  : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-muted)]",
              )}
            >
              {section.label}
            </button>
          ))}
        </div>
      </TabPageTopBar>

      <div className="space-y-1.5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2.5">
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
        {errorMessage ? (
          <MobileChannelsStatusCard
            badge={t(msg`读取失败`)}
            description={errorMessage}
            title={t(msg`视频号暂时不可用`)}
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
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
        {channelsQuery.isLoading ? (
          <MobileChannelsStatusCard
            badge={t(msg`读取中`)}
            title={t(msg`正在刷新视频号内容`)}
            description={t(msg`稍等一下，正在同步推荐流和互动状态。`)}
            tone="loading"
          />
        ) : null}

        {!channelsQuery.isLoading && !visiblePosts.length ? (
          <MobileChannelsStatusCard
            badge={t(msg`视频号`)}
            title={t(msg`还没有内容`)}
            description={t(
              msg`再生成一批内容后，这里会逐步形成更连续的视频推荐流。`,
            )}
            action={
              <Button
                variant="primary"
                size="sm"
                className="h-8 rounded-full bg-[#07c160] px-3.5 text-[11px] text-white hover:bg-[#06ad56]"
                disabled={generateMutation.isPending}
                onClick={handleEmptyStateAction}
              >
                {safeReturnPath
                  ? t(msg`返回上一页`)
                  : generateMutation.isPending
                    ? t(msg`生成中...`)
                    : t(msg`换一批`)}
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
        errorActionLabel={mobileCommentSheetRetryAction?.label}
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
        onErrorAction={mobileCommentSheetRetryAction?.onClick}
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
      <ChannelsForwardPicker
        open={Boolean(forwardPickerPost)}
        postId={forwardPickerPost?.id ?? null}
        postExcerpt={forwardPickerPost?.excerpt}
        baseUrl={baseUrl}
        onClose={() => setForwardPickerPost(null)}
        onForwarded={(target) => {
          setNoticeTone("success");
          setNoticeActionLabel(null);
          setNoticeAction(null);
          setNotice(t(msg`已转发给 ${target.name}。`));
          // 让"我点过转发"的小角标 / shareCount 立即体现
          void queryClient.invalidateQueries({
            queryKey: ["app-channels-home", baseUrl],
          });
        }}
      />
    </AppPage>
  );
}

function MobileChannelMediaSurface({
  post,
  active,
  userUnmuted,
  onRequestUnmute,
}: {
  post: FeedPostListItem;
  active: boolean;
  userUnmuted: boolean;
  onRequestUnmute: () => void;
}) {
  const t = useRuntimeTranslator();
  const audioAsset = post.media?.find((asset) => asset.kind === "audio");
  const videoAsset = post.media?.find((asset) => asset.kind === "video");

  if (post.mediaType === "audio" && (audioAsset || post.mediaUrl)) {
    const images = (post.media ?? []).filter(
      (asset): asset is Extract<typeof asset, { kind: "image" }> =>
        asset.kind === "image",
    );
    // 兜底：历史 audio 帖只有封面，把它当成单图沉浸式背景
    const fallbackPoster = audioAsset?.posterUrl ?? post.coverUrl ?? null;
    return (
      <ChannelAudioPictorial
        title={
          audioAsset?.title ?? post.title ?? `${post.authorName}·${t(msg`音乐`)}`
        }
        audioUrl={audioAsset?.url ?? post.mediaUrl ?? ""}
        images={images.map((asset) => asset.url)}
        fallbackPosterUrl={fallbackPoster}
        active={active}
        userUnmuted={userUnmuted}
        onRequestUnmute={onRequestUnmute}
      />
    );
  }

  if (post.mediaType === "video" && (videoAsset?.url || post.mediaUrl)) {
    const rawVideoUrl = videoAsset?.url ?? post.mediaUrl ?? undefined;
    const rawPosterUrl = videoAsset?.posterUrl ?? post.coverUrl ?? undefined;
    return (
      <ChannelVideoSurface
        videoUrl={rawVideoUrl}
        posterUrl={rawPosterUrl}
        active={active}
        userUnmuted={userUnmuted}
        onRequestUnmute={onRequestUnmute}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] w-full items-center justify-center bg-black px-6 text-center">
      <div>
        <div className="text-[16px] font-semibold text-white">
          {t(msg`暂无可播放内容`)}
        </div>
        <div className="mt-2 text-[13px] leading-6 text-white/72">
          {t(msg`稍后再来看看`)}
        </div>
      </div>
    </div>
  );
}

// 视频号"图文视频"沉浸式渲染：全卡背景图 + 左右滑切配图 + dots + 音频自动播。
// 历史音乐帖没有多图（images=[]）时，使用 fallbackPosterUrl 当唯一背景，禁用滑动。
function ChannelAudioPictorial({
  title,
  audioUrl,
  images,
  fallbackPosterUrl,
  active,
  userUnmuted,
  onRequestUnmute,
}: {
  title: string;
  audioUrl: string;
  images: string[];
  fallbackPosterUrl: string | null;
  active: boolean;
  userUnmuted: boolean;
  onRequestUnmute: () => void;
}) {
  const t = useRuntimeTranslator();
  const displayImages =
    images.length > 0
      ? images
      : fallbackPosterUrl
        ? [fallbackPosterUrl]
        : [];
  const [imageIndex, setImageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const swipeHandledRef = useRef(false);

  // 进入 active 时播放，离开时暂停 + 复位（保证全局只有一条 audio 在响）。
  // 注意：userUnmuted 不是这里的依赖——否则用户主动暂停后再切静音，会被
  // 重新强制 play()，违反暂停意图。muted 同步交给下方独立 effect。
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (active && audioUrl) {
      audio.muted = !userUnmuted;
      const promise = audio.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          audio.muted = true;
          audio.play().catch(() => undefined);
        });
      }
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, audioUrl]);

  // mute 切换仅同步 audio.muted，不重新 play
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.muted = !userUnmuted;
  }, [userUnmuted]);

  // 切贴时重置图片索引
  useEffect(() => {
    if (!active) setImageIndex(0);
  }, [active]);

  const canSwipe = displayImages.length > 1;

  const goNext = () => {
    if (!canSwipe) return;
    setImageIndex((i) => (i + 1 >= displayImages.length ? 0 : i + 1));
  };
  const goPrev = () => {
    if (!canSwipe) return;
    setImageIndex((i) => (i - 1 < 0 ? displayImages.length - 1 : i - 1));
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    swipeHandledRef.current = false;
  };
  const handleTouchMove = (event: React.TouchEvent) => {
    if (swipeHandledRef.current) return;
    const touch = event.touches[0];
    if (!touch || touchStartXRef.current == null || touchStartYRef.current == null) {
      return;
    }
    const dx = touch.clientX - touchStartXRef.current;
    const dy = touch.clientY - touchStartYRef.current;
    // 横向位移占主导且超阈值 → 切图；竖向占主导 → 让外层 snap-y 接管
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swipeHandledRef.current = true;
      if (dx < 0) goNext();
      else goPrev();
    }
  };
  const handleTouchEnd = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.muted = !userUnmuted;
      // play() 可能被浏览器策略 reject（用户没解锁手势），这种情况下 audio
      // 实际并没开始播；不在这里乐观置 isPlaying=true，统一由下方 onPlay
      // 事件回调来同步状态，保证 UI 和真实播放状态一致。
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
      // 同理，由 onPause 事件回调统一置 isPlaying=false。
    }
  };

  const currentImage = displayImages[imageIndex];

  return (
    <div
      className="relative h-full min-h-[calc(100dvh-12rem)] w-full overflow-hidden bg-black"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {currentImage ? (
        <img
          key={currentImage}
          src={resolveAppMediaUrl(currentImage)}
          alt={title}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#1f2533] to-[#0a0c10]">
          <Music2 size={56} className="text-white/40" />
        </div>
      )}

      {/* 桌面/平板鼠标用左右大箭头 */}
      {canSwipe ? (
        <>
          <button
            type="button"
            aria-label={t(msg`上一张`)}
            onClick={goPrev}
            className="group absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white/80 backdrop-blur-sm transition hover:bg-black/50 md:flex"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            type="button"
            aria-label={t(msg`下一张`)}
            onClick={goNext}
            className="group absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/30 p-2 text-white/80 backdrop-blur-sm transition hover:bg-black/50 md:flex"
          >
            <ArrowLeft size={20} className="rotate-180" />
          </button>
        </>
      ) : null}

      {/* 顶部右上：静音切换 / 播放暂停 */}
      <div className="pointer-events-auto absolute right-3.5 top-12 z-20 flex flex-col items-end gap-2">
        <button
          type="button"
          aria-label={userUnmuted ? t(msg`静音`) : t(msg`取消静音`)}
          onClick={(event) => {
            event.stopPropagation();
            onRequestUnmute();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(15,23,42,0.55)] text-white backdrop-blur"
        >
          {userUnmuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button
          type="button"
          aria-label={isPlaying ? t(msg`暂停`) : t(msg`播放`)}
          onClick={(event) => {
            event.stopPropagation();
            togglePlay();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(15,23,42,0.55)] text-white backdrop-blur"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>

      {/* 底部居中 dots */}
      {canSwipe ? (
        <div className="pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5"
          style={{ bottom: "max(env(safe-area-inset-bottom,0px), 16rem)" }}
        >
          {displayImages.map((_, idx) => (
            <span
              key={idx}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === imageIndex
                  ? "w-5 bg-white"
                  : "w-1.5 bg-white/45",
              )}
            />
          ))}
        </div>
      ) : null}

      {/* 隐藏音频元素：实际播放走 useEffect 控制 */}
      <audio
        ref={audioRef}
        src={audioUrl ? resolveAppMediaUrl(audioUrl) : undefined}
        loop
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
}

// 视频沉浸式播放：active 时自动播 + muted 跟 userUnmuted；离开暂停 + 复位。
function ChannelVideoSurface({
  videoUrl,
  posterUrl,
  active,
  userUnmuted,
  onRequestUnmute,
}: {
  videoUrl: string | undefined;
  posterUrl: string | undefined;
  active: boolean;
  userUnmuted: boolean;
  onRequestUnmute: () => void;
}) {
  const t = useRuntimeTranslator();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 同 audio：userUnmuted 不当依赖，避免用户暂停后被强制 replay。
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active && videoUrl) {
      video.muted = !userUnmuted;
      const promise = video.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {
          video.muted = true;
          video.play().catch(() => undefined);
        });
      }
    } else {
      video.pause();
      video.currentTime = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = !userUnmuted;
  }, [userUnmuted]);

  return (
    <div className="relative h-full min-h-[calc(100dvh-12rem)] w-full bg-black">
      <video
        ref={videoRef}
        key={videoUrl}
        src={videoUrl ? resolveAppMediaUrl(videoUrl) : undefined}
        poster={posterUrl ? resolveAppMediaUrl(posterUrl) : undefined}
        playsInline
        loop
        preload="metadata"
        controls={false}
        className="h-full min-h-[calc(100dvh-12rem)] w-full object-cover"
      />
      <button
        type="button"
        aria-label={userUnmuted ? t(msg`静音`) : t(msg`取消静音`)}
        onClick={(event) => {
          event.stopPropagation();
          onRequestUnmute();
        }}
        className="absolute right-3.5 top-12 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(15,23,42,0.55)] text-white backdrop-blur"
      >
        {userUnmuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
    </div>
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
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.04em]",
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
  // 抖音风音频静音手势解锁：一旦用户首次点静音图标，整页保持解除静音
  const [userUnmuted, setUserUnmuted] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);

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

    observerRef.current = observer;
    cardRefs.current.forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  const registerCardRef = (postId: string, node: HTMLElement | null) => {
    const previous = cardRefs.current.get(postId);
    if (previous && previous !== node) {
      observerRef.current?.unobserve(previous);
    }

    if (node) {
      cardRefs.current.set(postId, node);
      observerRef.current?.observe(node);
    } else {
      cardRefs.current.delete(postId);
    }
  };

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
          setCardRef={(node) => registerCardRef(post.id, node)}
          userUnmuted={userUnmuted}
          onRequestUnmute={() => setUserUnmuted((prev) => !prev)}
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
  userUnmuted: boolean;
  onRequestUnmute: () => void;
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
  userUnmuted,
  onRequestUnmute,
  onLike,
  onOpenAuthor,
  onOpenComments,
  onNotInterested,
  onShare,
  onToggleFollowAuthor,
  onToggleFavorite,
}: MobileChannelsCardProps) {
  const t = useRuntimeTranslator();
  return (
    <article
      ref={setCardRef}
      data-post-id={post.id}
      className="snap-start scroll-mt-2 overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-white shadow-none"
    >
      <div className="relative min-h-[calc(100dvh-12rem)] bg-[#0f1115]">
        <MobileChannelMediaSurface
          post={post}
          active={active}
          userUnmuted={userUnmuted}
          onRequestUnmute={onRequestUnmute}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.88))]" />

        <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5">
          <div className="rounded-full bg-[rgba(15,23,42,0.62)] px-2.5 py-1 text-[10px] font-medium tracking-[0.04em] text-white">
            {t(msg`视频号推荐`)}
          </div>
        </div>

        <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
          <div className="flex flex-col items-center gap-2.5">
            <ActionRailButton
              active={Boolean(post.ownerState?.hasLiked)}
              label={likePending ? t(msg`处理中`) : String(post.likeCount)}
              onClick={onLike}
            >
              <ThumbsUp
                size={17}
                className={
                  post.ownerState?.hasLiked ? "fill-current" : undefined
                }
              />
            </ActionRailButton>
            <ActionRailButton
              label={String(post.commentCount)}
              onClick={onOpenComments}
            >
              <MessageCircleMore size={17} />
            </ActionRailButton>
            <ActionRailButton
              active={favorite}
              label={favorite ? t(msg`已收藏`) : t(msg`收藏`)}
              onClick={onToggleFavorite}
            >
              {favorite ? (
                <Bookmark size={17} className="fill-current" />
              ) : (
                <Bookmark size={17} />
              )}
            </ActionRailButton>
            <ActionRailButton label={t(msg`分享`)} onClick={onShare}>
              <Share2 size={17} />
            </ActionRailButton>
            <ActionRailButton
              label={t(msg`减少推荐`)}
              onClick={onNotInterested}
            >
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
                  <div className="mt-0.5 text-[11px] text-white/70">
                    {t(
                      msg`${formatTimestamp(post.createdAt)} · 视频号动态`,
                    )}
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
                {post.ownerState?.isFollowingAuthor
                  ? t(msg`已关注`)
                  : t(msg`+关注`)}
              </button>
            </div>
            {post.title ? (
              <div className="mt-2 text-[13px] font-medium text-white">
                {post.title}
              </div>
            ) : null}
            <ExpandableText
              text={post.text}
              className="mt-1"
              textClassName="text-[12px] leading-[1.35rem] text-white"
              toggleClassName="text-[11px] text-white/82"
            />
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
              {formatChannelMeta(post, t)}
            </div>
            <div className="mt-2 rounded-[16px] bg-[rgba(255,255,255,0.12)] px-2.5 py-2 text-[10px] leading-4 text-white/86 backdrop-blur">
              {post.commentsPreview.length ? (
                <>
                  <div className="mb-1 text-[9px] uppercase tracking-[0.03em] text-white/60">
                    {t(msg`最近评论`)}
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
                <span>{t(msg`还没有评论，先聊一句。`)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border-subtle)] bg-white px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[color:var(--text-muted)]">
          <span>
            {post.mediaType === "video" ? t(msg`短片`) : t(msg`内容卡片`)}
          </span>
          <span>{t(msg`${post.likeCount} 赞`)}</span>
          <span>{t(msg`${post.commentCount} 评论`)}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenComments}
          className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[#f8f8f8] px-3 text-[11px] text-[color:var(--text-primary)] shadow-none"
        >
          {t(msg`打开评论`)}
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
  errorActionLabel,
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
  onErrorAction,
  onLikeComment,
  onReply,
  onSubmit,
}: {
  comments: FeedComment[];
  draft: string;
  errorActionLabel?: string;
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
  onErrorAction?: () => void;
  onLikeComment: (comment: FeedComment) => void;
  onReply: (comment: FeedComment) => void;
  onSubmit: () => void;
}) {
  const t = useRuntimeTranslator();
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
        aria-label={t(msg`关闭评论面板`)}
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-[20px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] pt-2 shadow-[0_-14px_28px_rgba(15,23,42,0.10)]">
        <div className="flex justify-center pb-1.5">
          <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-[14px] font-medium text-[#111827]">
                {t(msg`评论`)}
              </div>
              <div className="rounded-full bg-[rgba(7,193,96,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#07c160]">
                {t(msg`${post.commentCount} 条`)}
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
                <div className="flex shrink-0 items-center gap-1.5">
                  {errorActionLabel && onErrorAction ? (
                    <button
                      type="button"
                      onClick={onErrorAction}
                      className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                    >
                      {errorActionLabel}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#6b7280]"
                  >
                    {t(msg`返回视频号`)}
                  </button>
                </div>
              </div>
            </InlineNotice>
          ) : null}
          {isLoading && !comments.length ? (
            <div className="rounded-[16px] border border-[color:var(--border-subtle)] bg-white px-4 py-5 text-center text-[12px] text-[#6b7280]">
              {t(msg`正在读取评论...`)}
            </div>
          ) : null}
          {!isLoading && !comments.length ? (
            <div className="rounded-[16px] border border-dashed border-[color:var(--border-subtle)] bg-white px-4 py-5 text-center text-[12px] leading-6 text-[#6b7280]">
              {t(msg`还没有评论，先发第一句。`)}
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
                              {t(msg`回复 ${replyTargetName}`)}
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
                            {t(msg`回复`)}
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
                              ? t(msg`处理中`)
                              : comment.likedByOwner
                                ? t(msg`已赞 ${comment.likeCount}`)
                                : t(msg`赞 ${comment.likeCount}`)}
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
              <div className="truncate">
                {t(msg`正在回复 ${replyTarget.authorName}`)}
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                className="text-[#166534] transition active:opacity-70"
              >
                {t(msg`取消`)}
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
                  ? t(msg`回复 ${replyTarget.authorName}...`)
                  : t(msg`说点什么...`)
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
              {submitPending ? t(msg`发送中...`) : t(msg`发送`)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatChannelMeta(
  post: FeedPostListItem,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  const pieces = [t(msg`${post.viewCount ?? 0} 播放`)];

  if (typeof post.durationMs === "number" && post.durationMs > 0) {
    const seconds = Math.max(1, Math.round(post.durationMs / 1000));
    pieces.push(t(msg`${seconds} 秒`));
  }

  if (post.topicTags?.length) {
    pieces.push(`#${post.topicTags[0]}`);
  }

  return pieces.join(" · ");
}
