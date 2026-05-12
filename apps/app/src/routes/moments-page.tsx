import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { ArrowLeft, Camera } from "lucide-react";
import {
  addMomentComment,
  deleteMoment,
  getBlockedCharacters,
  getMomentsPage,
  toggleMomentLike,
  type Moment,
  type MomentComment,
  type MomentLike,
  type MomentsPageResponse,
} from "@yinjie/contracts";
import type { MessageDescriptor } from "@lingui/core";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, InlineNotice } from "@yinjie/ui";
import { RouteRedirectState } from "../components/route-redirect-state";
import { MomentShareCardModal } from "../components/moment-share-card-modal";
import { WeChatActionBubble } from "../components/wechat-action-bubble";
import {
  WeChatCommentBar,
  type WeChatCommentBarReplyTarget,
} from "../components/wechat-comment-bar";
import { WeChatMomentCard } from "../components/wechat-moment-card";
import { WeChatMomentsCover } from "../components/wechat-moments-cover";
import { usePullToRefresh } from "../features/moments/use-pull-to-refresh";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { buildDesktopFriendMomentsRouteHash } from "../features/moments/friend-moments-route-state";
import { buildMobileFriendMomentsRouteHash } from "../features/moments/mobile-friend-moments-route-state";
import { buildMobileMomentsPublishRouteHash } from "../features/moments/mobile-moments-publish-route-state";
import {
  buildDesktopMomentsRouteHash,
  parseDesktopMomentsRouteState,
} from "../features/moments/moments-route-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { consumeMomentPublishFlash } from "../features/moments/moment-publish-flash";
import {
  publishMomentComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import { getMomentSummaryText } from "../features/moments/moment-content";
import { formatTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { normalizePathname } from "../lib/normalize-pathname";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const DesktopMomentsWorkspace = lazy(async () => {
  const mod =
    await import("../features/desktop/moments/desktop-moments-workspace");
  return { default: mod.DesktopMomentsWorkspace };
});

const DesktopMessageAvatarPopover = lazy(async () => {
  const mod = await import("../features/chat/message-avatar-popover-shell");
  return { default: mod.DesktopMessageAvatarPopover };
});

export function MomentsPage() {
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
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerUsername = useWorldOwnerStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const normalizedPathname = normalizePathname(pathname);
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
  // 移动端微信化交互状态
  const [actionBubble, setActionBubble] = useState<{
    momentId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [commentBarTarget, setCommentBarTarget] = useState<{
    momentId: string;
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
  const [desktopAvatarPopover, setDesktopAvatarPopover] = useState<
    | {
        anchorElement: HTMLButtonElement;
        kind: "character";
        characterId: string;
        fallbackAvatar?: string | null;
        fallbackName: string;
        returnHash?: string;
      }
    | {
        anchorElement: HTMLButtonElement;
        kind: "owner";
        returnHash?: string;
      }
    | null
  >(null);
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const routeState = parseDesktopMomentsRouteState(hash);
  const routeSelectedAuthorId = routeState.authorId ?? null;
  const routeSelectedMomentId = routeState.momentId ?? null;
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildDesktopMomentsRouteHash({
        authorId: routeSelectedAuthorId ?? undefined,
        momentId: routeSelectedMomentId ?? undefined,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [
      routeSelectedAuthorId,
      routeSelectedMomentId,
      safeReturnHash,
      safeReturnPath,
    ],
  );

  useEffect(() => {
    setDesktopAvatarPopover(null);
  }, [hash, pathname]);

  // 朋友圈用无限分页，避免一次性把所有动态都拉过来（之前 1 次 ≈ 139 条 SQL）。
  // 每页 20 条；触底 → fetchNextPage；下拉刷新 → 重置到第 1 页。
  const momentsQuery = useInfiniteQuery({
    queryKey: ["app-moments-paged", baseUrl],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getMomentsPage({ page: pageParam, limit: 20 }, baseUrl),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
  });
  // 按 id 去重：分页路径下若新发/删除导致页间边界偏移，page N 末尾和 page N+1 开头
  // 可能拿到同一条 moment。UI 层兜底去重，避免列表重复闪烁。
  const momentsData = useMemo<Moment[]>(() => {
    if (!momentsQuery.data) return [];
    const seen = new Set<string>();
    const items: Moment[] = [];
    for (const page of momentsQuery.data.pages) {
      for (const moment of page.items) {
        if (seen.has(moment.id)) continue;
        seen.add(moment.id);
        items.push(moment);
      }
    }
    return items;
  }, [momentsQuery.data]);
  const momentsHasNextPage = momentsQuery.hasNextPage;
  const momentsIsFetchingNextPage = momentsQuery.isFetchingNextPage;
  const momentsFetchNextPage = momentsQuery.fetchNextPage;
  // 桌面工作区不挂触底 sentinel：mount 后自动连续 prefetch 把所有页悄悄填上。
  // 移动端用 sentinel + IntersectionObserver 按需触发。
  useEffect(() => {
    if (!isDesktopLayout) return;
    if (momentsHasNextPage && !momentsIsFetchingNextPage) {
      void momentsFetchNextPage();
    }
  }, [
    isDesktopLayout,
    momentsHasNextPage,
    momentsIsFetchingNextPage,
    momentsFetchNextPage,
  ]);
  const blockedQuery = useQuery({
    queryKey: ["app-moments-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  function resetMomentsToFirstPage() {
    // 帖子数量变化（发布/删除）时把已加载多页收回 page 1：
    // 避免 invalidate 同时 refetch 多页造成的分页边界重复或丢失（page 1 末尾 = page 2 开头）。
    queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
      ["app-moments-paged", baseUrl],
      (current) =>
        current
          ? {
              pages: current.pages.slice(0, 1),
              pageParams: current.pageParams.slice(0, 1),
            }
          : current,
    );
  }

  const createMutation = useMutation({
    mutationFn: () =>
      publishMomentComposeDraft({
        text: composeDraft.text,
        imageDrafts: composeDraft.imageDrafts,
        videoDraft: composeDraft.videoDraft,
        baseUrl,
      }),
    onSuccess: (newMoment) => {
      composeDraft.reset();
      setShowCompose(false);
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`朋友圈已发布。`));
      // 立刻把新发布的 moment prepend 到 paged 头部并把已加载的多页砍回 1 页 ——
      // 之前 fire-and-forget invalidate 后 600ms+ 才更新 UI，用户感受到"得刷新才能看到"。
      queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
        ["app-moments-paged", baseUrl],
        (current) =>
          current && current.pages.length > 0
            ? {
                pages: [
                  {
                    ...current.pages[0]!,
                    items: [newMoment, ...current.pages[0]!.items],
                  },
                ],
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      queryClient.setQueryData<Moment[]>(["app-moments", baseUrl], (current) =>
        current ? [newMoment, ...current] : current,
      );
      // 后台 invalidate 让其它共享 cache 的页面（profile/friend-moments-page、search-index 等）也同步
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onMutate: async (momentId) => {
      if (!ownerId) {
        return {
          snapshots: [] as Array<
            [readonly unknown[], InfiniteData<MomentsPageResponse> | undefined]
          >,
        };
      }
      await queryClient.cancelQueries({ queryKey: ["app-moments-paged", baseUrl] });
      const snapshots = queryClient.getQueriesData<
        InfiniteData<MomentsPageResponse>
      >({
        queryKey: ["app-moments-paged", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data) {
          return;
        }
        queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((moment) => {
              if (moment.id !== momentId) {
                return moment;
              }
              const alreadyLiked = moment.likes.some(
                (like) => like.authorId === ownerId,
              );
              const nextLikes = alreadyLiked
                ? moment.likes.filter((like) => like.authorId !== ownerId)
                : [
                    ...moment.likes,
                    {
                      id: `optimistic-${ownerId}-${moment.id}`,
                      postId: moment.id,
                      authorId: ownerId,
                      authorName: ownerUsername ?? t(msg`我`),
                      authorAvatar: ownerAvatar ?? "",
                      authorType: "user" as const,
                      createdAt: new Date().toISOString(),
                    },
                  ];
              return {
                ...moment,
                likes: nextLikes,
                likeCount: Math.max(
                  0,
                  moment.likeCount + (alreadyLiked ? -1 : 1),
                ),
              };
            }),
          })),
        });
      });
      return { snapshots };
    },
    onError: (_error, _momentId, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: () => {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`朋友圈互动已更新。`));
      // 点赞 toggle 返回 { liked: boolean }，optimistic 已经把 ownerState 切对；
      // 服务端不会重算业务字段。完全省掉 invalidate，避免一次 GET /api/moments 全量
      // refetch 又拉回 30+ media 条件请求。
    },
  });

  // mutationFn 不能再次读 commentDrafts 取文本：onMutate 里的
  // setCommentDrafts(clear) 会在 onMutate 返回的微任务边界被 React 18 flush 掉，
  // 等 TanStack Query 调 mutationFn 时闭包里的 commentDrafts[momentId] 已经是 ""。
  // 在 onMutate 里把 text/target 写进 ref，mutationFn 直接读 ref。
  const commentSubmitArgsRef = useRef<
    Record<
      string,
      {
        text: string;
        target: { commentId: string; authorId: string } | null;
      }
    >
  >({});
  const commentMutation = useMutation({
    // onMutate: optimistic 插入临时评论 + 清输入/回复目标。
    // 公网隧道 ~600ms RTT 下，原 onSuccess 才清 drafts 会让用户看到输入框
    // 600ms 不消失；optimistic 插入还让评论立刻可见。临时 id 以 'optimistic-'
    // 前缀打标，onSuccess 通过 invalidate 让真实数据替换；onError 回滚 snapshot
    // 并恢复 drafts/reply target。
    onMutate: async (momentId: string) => {
      const text = commentDrafts[momentId]?.trim();
      if (!text || !ownerId) {
        return { skipped: true as const };
      }

      const desktopTarget =
        desktopReplyTarget && desktopReplyTarget.postId === momentId
          ? desktopReplyTarget
          : null;
      const mobileTarget =
        commentBarTarget?.momentId === momentId
          ? commentBarTarget.replyTo
          : null;
      const target = desktopTarget
        ? {
            commentId: desktopTarget.commentId,
            authorId: desktopTarget.authorId,
          }
        : mobileTarget;

      commentSubmitArgsRef.current[momentId] = { text, target };

      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["app-moments-paged", baseUrl],
        }),
        queryClient.cancelQueries({ queryKey: ["app-moments", baseUrl] }),
      ]);

      const flatSnapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments", baseUrl],
      });
      const pagedSnapshots = queryClient.getQueriesData<
        InfiniteData<MomentsPageResponse>
      >({
        queryKey: ["app-moments-paged", baseUrl],
      });

      const tempId = `optimistic-comment-${ownerId}-${Date.now()}`;
      const tempComment: MomentComment = {
        id: tempId,
        postId: momentId,
        authorId: ownerId,
        authorName: ownerUsername ?? t(msg`我`),
        authorAvatar: ownerAvatar ?? "",
        authorType: "user",
        text,
        replyToCommentId: target?.commentId ?? null,
        replyToAuthorId: target?.authorId ?? null,
        createdAt: new Date().toISOString(),
      };

      const appendComment = (moment: Moment): Moment =>
        moment.id !== momentId
          ? moment
          : {
              ...moment,
              comments: [...moment.comments, tempComment],
              commentCount: moment.commentCount + 1,
            };

      flatSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<Moment[]>(key, data.map(appendComment));
      });
      pagedSnapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map(appendComment),
          })),
        });
      });

      // 清输入与 reply target —— 用户看到立刻清空，体感"已发送"。
      const savedDraft = commentDrafts[momentId] ?? "";
      const savedDesktopReply =
        desktopReplyTarget && desktopReplyTarget.postId === momentId
          ? desktopReplyTarget
          : null;
      const savedMobileReply =
        commentBarTarget?.momentId === momentId ? commentBarTarget : null;

      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setDesktopReplyTarget((current) =>
        current?.postId === momentId ? null : current,
      );
      setCommentBarTarget((current) =>
        current?.momentId === momentId ? null : current,
      );

      return {
        skipped: false as const,
        flatSnapshots,
        pagedSnapshots,
        momentId,
        tempId,
        savedDraft,
        savedDesktopReply,
        savedMobileReply,
      };
    },
    mutationFn: (momentId: string) => {
      // 从 ref 读 onMutate 已捕获的 text/target，避免被 setCommentDrafts(clear) 抢跑
      const args = commentSubmitArgsRef.current[momentId];
      if (!args?.text) {
        throw new Error(t(msg`请先输入评论内容。`));
      }

      return addMomentComment(
        momentId,
        {
          text: args.text,
          replyToCommentId: args.target?.commentId,
          replyToAuthorId: args.target?.authorId,
        },
        baseUrl,
      );
    },
    onError: (_err, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      if (!context || context.skipped) return;
      context.flatSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      context.pagedSnapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      // 恢复 drafts / reply target，让用户能改后重发。
      setCommentDrafts((current) => ({
        ...current,
        [context.momentId]: context.savedDraft,
      }));
      if (context.savedDesktopReply) {
        setDesktopReplyTarget(context.savedDesktopReply);
      }
      if (context.savedMobileReply) {
        setCommentBarTarget(context.savedMobileReply);
      }
    },
    onSuccess: (realComment, momentId, context) => {
      delete commentSubmitArgsRef.current[momentId];
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`朋友圈互动已更新。`));
      // 把 optimistic temp（id=optimistic-comment-*）原地换成 server 真实评论。
      // 这样**完全省掉**一次 invalidate 触发的 GET /api/moments + paged refetch
      // ——公网隧道下 refetch 还会带回 30+ media 条件请求 RTT，是评论后体感
      // "页面又卡一下"的主要原因。staleTime 60s (mobile) 期间用户拿不到其他
      // NPC 同时段写的评论，但 pull-to-refresh / re-mount 都能补；可接受。
      if (context && !context.skipped) {
        const { tempId } = context;
        const replaceComment = (moment: Moment): Moment =>
          moment.id !== momentId
            ? moment
            : {
                ...moment,
                comments: moment.comments.map((c) =>
                  c.id === tempId ? realComment : c,
                ),
              };
        queryClient.setQueriesData<Moment[]>(
          { queryKey: ["app-moments", baseUrl] },
          (data) => (data ? data.map(replaceComment) : data),
        );
        queryClient.setQueriesData<InfiniteData<MomentsPageResponse>>(
          { queryKey: ["app-moments-paged", baseUrl] },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    items: page.items.map(replaceComment),
                  })),
                }
              : data,
        );
      }
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (momentId: string) => deleteMoment(momentId, baseUrl),
    onMutate: async (momentId) => {
      await queryClient.cancelQueries({ queryKey: ["app-moments-paged", baseUrl] });
      const snapshots = queryClient.getQueriesData<
        InfiniteData<MomentsPageResponse>
      >({
        queryKey: ["app-moments-paged", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== momentId),
          })),
        });
      });
      return { snapshots };
    },
    onError: (_error, _momentId, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: () => {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(t(msg`已删除这条朋友圈。`));
      // 删除会让分页边界前移：如不先把 cache 收回到 page 1，refetch 多页时下一页
      // 的第一条会被前面那页的末尾"吃掉"，造成中间漏一条。
      resetMomentsToFirstPage();
      // fire-and-forget：optimistic 已把这条从 cache 抹掉；await 会让删除按钮多卡 600ms+。
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });
  const pendingLikeMomentId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;
  const blockedCharacterIds = new Set(
    (blockedQuery.data ?? []).map((item) => item.characterId),
  );
  const visibleMoments = momentsData.filter(
    (moment) =>
      moment.authorType !== "character" ||
      !blockedCharacterIds.has(moment.authorId),
  );
  const routeSelectedMoment = routeSelectedMomentId
    ? visibleMoments.find((moment) => moment.id === routeSelectedMomentId) ?? null
    : null;
  const routeSelectedAuthorMoment = routeSelectedAuthorId
    ? routeSelectedMoment?.authorId === routeSelectedAuthorId
      ? routeSelectedMoment
      : visibleMoments.find((moment) => moment.authorId === routeSelectedAuthorId) ??
        null
    : null;
  const syncedRouteSelectedAuthorId =
    routeSelectedAuthorId &&
    routeSelectedAuthorMoment?.authorType === "character"
      ? routeSelectedAuthorId
      : undefined;
  const isDiscoverSubPage = normalizedPathname === "/discover/moments";
  const desktopMomentsPath = "/tabs/moments";
  const isDesktopMomentsRoute =
    normalizedPathname === desktopMomentsPath ||
    normalizedPathname === "/moments" ||
    normalizedPathname === "/discover/moments";
  const interactionActionLabel = safeReturnPath
    ? t(msg`返回上一页`)
    : t(msg`重试读取`);

  function openMobileMomentsPublishPage() {
    void navigate({
      to: "/discover/moments/publish",
      hash: buildMobileMomentsPublishRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function openMobileFriendMoments(characterId: string) {
    void navigate({
      to: "/friend-moments/$characterId",
      params: { characterId },
      hash: buildMobileFriendMomentsRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function openCharacterDetail(characterId: string) {
    void navigate({
      to: "/character/$characterId",
      params: { characterId },
      hash: buildCharacterDetailRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function openDesktopFriendMoments(targetMoment: Moment) {
    if (targetMoment?.authorType !== "character") {
      return;
    }
    void navigate({
      to: "/desktop/friend-moments/$characterId",
      params: { characterId: targetMoment.authorId },
      hash: buildDesktopFriendMomentsRouteHash({
        source: "moments",
        returnPath: desktopMomentsPath,
        returnHash: buildDesktopMomentsRouteHash({}),
      }),
    });
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

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    // 先收回到 page 1 再 refetch，避免多页 refetch 命中分页边界偏移
    resetMomentsToFirstPage();
    void momentsQuery.refetch();
    void blockedQuery.refetch();
  }

  function handleRetryLoad() {
    resetMomentsToFirstPage();
    void momentsQuery.refetch();
    void blockedQuery.refetch();
  }

  function handleEmptyStateAction() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    openMobileMomentsPublishPage();
  }

  useEffect(() => {
    resetComposeDraft();
    setCommentDrafts({});
    setShowCompose(false);
    const flashNotice = consumeMomentPublishFlash();
    if (flashNotice) {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(flashNotice);
      return;
    }

    setNoticeActionLabel(null);
    setNoticeAction(null);
    setNotice(""); // i18n-ignore-line: clearing state
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

    const timer = window.setTimeout(() => {
      setNotice(""); // i18n-ignore-line: clearing state
      setNoticeActionLabel(null);
      setNoticeAction(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const desktopPathMismatch = pathname !== desktopMomentsPath;

    if (
      !isDesktopLayout ||
      !isDesktopMomentsRoute ||
      syncedRouteSelectedAuthorId ||
      (!desktopPathMismatch && currentRouteHash === normalizedHash)
    ) {
      return;
    }

    void navigate({
      to: desktopMomentsPath,
      hash: currentRouteHash || undefined,
      replace: true,
    });
  }, [
    currentRouteHash,
    isDesktopLayout,
    isDesktopMomentsRoute,
    navigate,
    normalizedHash,
    pathname,
    syncedRouteSelectedAuthorId,
    desktopMomentsPath,
  ]);

  useEffect(() => {
    if (
      !isDesktopLayout ||
      !isDesktopMomentsRoute ||
      !syncedRouteSelectedAuthorId
    ) {
      return;
    }

    void navigate({
      to: "/desktop/friend-moments/$characterId",
      params: { characterId: syncedRouteSelectedAuthorId },
      hash: buildDesktopFriendMomentsRouteHash({
        momentId: routeSelectedMomentId ?? undefined,
        source: "moments",
        returnPath: desktopMomentsPath,
        returnHash: buildDesktopMomentsRouteHash({
          momentId: routeSelectedMomentId ?? undefined,
        }),
      }),
      replace: true,
    });
  }, [
    isDesktopLayout,
    isDesktopMomentsRoute,
    navigate,
    routeSelectedMomentId,
    syncedRouteSelectedAuthorId,
    desktopMomentsPath,
  ]);

  useEffect(() => {
    if (
      !isDesktopLayout ||
      !routeSelectedAuthorId ||
      syncedRouteSelectedAuthorId === routeSelectedAuthorId
    ) {
      return;
    }

    const nextHash = buildDesktopMomentsRouteHash({
      momentId: routeSelectedMomentId ?? undefined,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    });

    if ((nextHash ?? "") === normalizedHash) {
      return;
    }

    void navigate({
      to: pathname,
      hash: nextHash,
      replace: true,
    });
  }, [
    isDesktopLayout,
    navigate,
    normalizedHash,
    pathname,
    routeSelectedAuthorId,
    routeSelectedMomentId,
    safeReturnHash,
    safeReturnPath,
    syncedRouteSelectedAuthorId,
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
      !routeSelectedMomentId ||
      typeof document === "undefined"
    ) {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(`moment-post-${routeSelectedMomentId}`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    });
  }, [isDesktopLayout, routeSelectedMomentId, visibleMoments.length]);

  if (isDesktopLayout) {
    if (syncedRouteSelectedAuthorId) {
      return (
        <RouteRedirectState
          title={t(msg`正在打开好友朋友圈`)}
          description={t(msg`正在切换到桌面好友朋友圈工作区，马上显示对应居民的动态。`)}
          loadingLabel={t(msg`正在切换到桌面朋友圈...`)}
        />
      );
    }

    const errors: string[] = [];

    if (momentsQuery.isError && momentsQuery.error instanceof Error) {
      errors.push(momentsQuery.error.message);
    }

    if (blockedQuery.isError && blockedQuery.error instanceof Error) {
      errors.push(blockedQuery.error.message);
    }

    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面朋友圈`)}
            description={t(msg`正在载入桌面朋友圈工作区，马上显示动态和详情。`)}
            loadingLabel={t(msg`载入桌面朋友圈...`)}
          />
        }
      >
        <DesktopMomentsWorkspace
          commentDrafts={commentDrafts}
          commentErrorMessage={
            commentMutation.isError && commentMutation.error instanceof Error
              ? commentMutation.error.message
              : null
          }
          commentPendingMomentId={pendingCommentMomentId}
          composeErrorMessage={
            composeDraft.mediaError ??
            (createMutation.isError && createMutation.error instanceof Error
              ? createMutation.error.message
              : null)
          }
          createPending={createMutation.isPending}
          errors={errors}
          imageDrafts={composeDraft.imageDrafts}
          isLoading={momentsQuery.isLoading}
          likeErrorMessage={
            likeMutation.isError && likeMutation.error instanceof Error
              ? likeMutation.error.message
              : null
          }
          likePendingMomentId={pendingLikeMomentId}
          moments={visibleMoments}
          ownerAvatar={ownerAvatar}
          ownerId={ownerId}
          ownerUsername={ownerUsername}
          scrollToMomentId={routeSelectedMomentId}
          showCompose={showCompose}
          successNotice={notice}
          text={composeDraft.text}
          videoDraft={composeDraft.videoDraft}
          isMomentFavorite={(momentId) =>
            favoriteSourceIds.includes(`moment-${momentId}`)
          }
          commentReplyTarget={desktopReplyTarget}
          setShowCompose={setShowCompose}
          onCancelCommentReply={() => setDesktopReplyTarget(null)}
          onCommentChange={(momentId, value) =>
            setCommentDrafts((current) => ({
              ...current,
              [momentId]: value,
            }))
          }
          onCommentSubmit={(momentId) => commentMutation.mutate(momentId)}
          onStartCommentReply={({ momentId, comment }) =>
            setDesktopReplyTarget({
              authorId: comment.authorId,
              authorName: comment.authorName,
              commentId: comment.id,
              postId: momentId,
            })
          }
          onCreate={() => createMutation.mutate()}
          onImageFilesSelected={(files) => {
            void handleImageFilesSelected(files);
          }}
          onLike={(momentId) => likeMutation.mutate(momentId)}
          onOpenAuthorPopover={({ moment: targetMoment }) => {
            if (targetMoment?.authorType !== "character") {
              return;
            }

            openDesktopFriendMoments(targetMoment);
          }}
          onOpenLikerPopover={({ anchorElement, like }) => {
            const returnHash = currentRouteHash || undefined;
            if (like.authorType === "character") {
              setDesktopAvatarPopover({
                anchorElement,
                kind: "character",
                characterId: like.authorId,
                fallbackAvatar: like.authorAvatar,
                fallbackName: like.authorName,
                returnHash,
              });
            } else if (like.authorType === "user") {
              setDesktopAvatarPopover({
                anchorElement,
                kind: "owner",
                returnHash,
              });
            }
          }}
          onToggleFavorite={(momentId) => {
            const moment = visibleMoments.find((item) => item.id === momentId);
            if (!moment) {
              return;
            }

            const sourceId = `moment-${moment.id}`;
            const collected = favoriteSourceIds.includes(sourceId);
            const routeHash = buildDesktopMomentsRouteHash({
              momentId: moment.id,
            });
            const nextFavorites = collected
              ? removeDesktopFavorite(sourceId)
              : upsertDesktopFavorite({
                  id: `favorite-${sourceId}`,
                  sourceId,
                  category: "moments",
                  title: moment.authorName,
                  description: getMomentSummaryText(moment),
                  meta: t(msg`朋友圈 · ${formatTimestamp(moment.postedAt)}`),
                  to: `/tabs/moments${routeHash ? `#${routeHash}` : ""}`,
                  badge: t(msg`朋友圈`),
                  avatarName: moment.authorName,
                  avatarSrc: moment.authorAvatar,
                });

            setFavoriteSourceIds(
              nextFavorites.map((favorite) => favorite.sourceId),
            );
          }}
          onRefresh={() => {
            resetMomentsToFirstPage();
            void momentsQuery.refetch();
            if (ownerId) {
              void blockedQuery.refetch();
            }
          }}
          onTextChange={composeDraft.setText}
          onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
          onRemoveVideo={() => composeDraft.clearVideoDraft()}
          onVideoFileSelected={(file) => {
            void handleVideoFileSelected(file);
          }}
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
                navigationContext={{
                  momentsReturnHash: desktopAvatarPopover.returnHash,
                  momentsReturnPath: pathname,
                  profileReturnHash: desktopAvatarPopover.returnHash,
                  profileReturnPath: pathname,
                }}
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
    <MobileMomentsView
      isDiscoverSubPage={isDiscoverSubPage}
      ownerId={ownerId}
      ownerAvatar={ownerAvatar}
      ownerUsername={ownerUsername}
      visibleMoments={visibleMoments}
      momentsLoading={momentsQuery.isLoading}
      momentsError={
        momentsQuery.isError && momentsQuery.error instanceof Error
          ? momentsQuery.error
          : null
      }
      pendingCommentMomentId={pendingCommentMomentId}
      notice={notice}
      noticeTone={noticeTone}
      noticeActionLabel={noticeActionLabel}
      noticeAction={noticeAction}
      interactionActionLabel={interactionActionLabel}
      hasReturnPath={Boolean(safeReturnPath)}
      actionBubble={actionBubble}
      commentBarTarget={commentBarTarget}
      commentDrafts={commentDrafts}
      tx={t}
      onBack={() =>
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
      onCompose={openMobileMomentsPublishPage}
      onAuthorTap={(moment) => {
        if (moment.authorType === "character") {
          openMobileFriendMoments(moment.authorId);
        }
      }}
      onLikeAuthorTap={(like) => {
        if (like.authorType === "character") {
          openCharacterDetail(like.authorId);
        }
      }}
      onLikeMoment={(momentId) => likeMutation.mutate(momentId)}
      onDeleteMoment={(momentId) => {
        if (deleteMutation.isPending) return;
        if (
          typeof window !== "undefined" &&
          !window.confirm(t(msg`确定删除这条朋友圈吗？`))
        ) {
          return;
        }
        deleteMutation.mutate(momentId);
      }}
      onOpenActionMenu={(momentId, anchorRect) =>
        setActionBubble({ momentId, anchorRect })
      }
      onCloseActionMenu={() => setActionBubble(null)}
      onCommentTap={(momentId, comment) =>
        setCommentBarTarget({
          momentId,
          replyTo: comment
            ? {
                authorId: comment.authorId,
                authorName: comment.authorName,
                commentId: comment.id,
              }
            : null,
        })
      }
      onCloseCommentBar={() => setCommentBarTarget(null)}
      onCommentChange={(momentId, value) =>
        setCommentDrafts((current) => ({
          ...current,
          [momentId]: value,
        }))
      }
      onCommentSubmit={(momentId) => commentMutation.mutate(momentId)}
      onRefresh={async () => {
        // 下拉刷新只换头部 page 1，保留已加载的 page 2+：
        // 1) 旧逻辑把 N 页砍回 1 页 → 列表瞬间变短、撑不满视口 → iOS 上滑橡皮筋反弹
        //    + IntersectionObserver 串行一页一页 fetchNextPage 把内容堆回来，体感很慢；
        // 2) 顶部新发布的内容若把老 page 2 起点往下挤，由 momentsData 的 id 去重 useMemo 兜底重复。
        const key = ["app-moments-paged", baseUrl];
        await Promise.all([
          getMomentsPage({ page: 1, limit: 20 }, baseUrl).then((freshFirstPage) => {
            queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
              key,
              (current) => {
                if (!current || current.pages.length === 0) {
                  return { pages: [freshFirstPage], pageParams: [1] };
                }
                return {
                  pages: [freshFirstPage, ...current.pages.slice(1)],
                  pageParams: current.pageParams,
                };
              },
            );
          }),
          ownerId ? blockedQuery.refetch() : Promise.resolve(null),
        ]);
      }}
      hasNextPage={Boolean(momentsQuery.hasNextPage)}
      isFetchingNextPage={momentsQuery.isFetchingNextPage}
      onLoadMore={() => {
        if (momentsQuery.hasNextPage && !momentsQuery.isFetchingNextPage) {
          void momentsQuery.fetchNextPage();
        }
      }}
      onRetry={handleRetryLoad}
      onEmptyAction={handleEmptyStateAction}
      onNoticeBack={handleStatusBack}
      likeError={
        likeMutation.isError && likeMutation.error instanceof Error
          ? likeMutation.error
          : null
      }
      commentError={
        commentMutation.isError && commentMutation.error instanceof Error
          ? commentMutation.error
          : null
      }
    />
  );
}

type MobileMomentsViewProps = {
  isDiscoverSubPage: boolean;
  ownerId: string | null;
  ownerAvatar: string | null;
  ownerUsername: string | null;
  visibleMoments: Moment[];
  momentsLoading: boolean;
  momentsError: Error | null;
  pendingCommentMomentId: string | null | undefined;
  notice: string;
  noticeTone: "success" | "info";
  noticeActionLabel: string | null;
  noticeAction: (() => void) | null;
  interactionActionLabel: string;
  hasReturnPath: boolean;
  actionBubble: { momentId: string; anchorRect: DOMRect } | null;
  commentBarTarget: {
    momentId: string;
    replyTo: WeChatCommentBarReplyTarget | null;
  } | null;
  commentDrafts: Record<string, string>;
  tx: (descriptor: MessageDescriptor) => string;
  onBack: () => void;
  onCompose: () => void;
  onAuthorTap: (moment: Moment) => void;
  onLikeAuthorTap: (like: MomentLike) => void;
  onLikeMoment: (momentId: string) => void;
  onDeleteMoment: (momentId: string) => void;
  onOpenActionMenu: (momentId: string, anchorRect: DOMRect) => void;
  onCloseActionMenu: () => void;
  onCommentTap: (momentId: string, comment: MomentComment | null) => void;
  onCloseCommentBar: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onRefresh: () => Promise<unknown>;
  onRetry: () => void;
  onEmptyAction: () => void;
  onNoticeBack: () => void;
  likeError: Error | null;
  commentError: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
};

function MobileMomentsView({
  isDiscoverSubPage,
  ownerId,
  ownerAvatar,
  ownerUsername,
  visibleMoments,
  momentsLoading,
  momentsError,
  pendingCommentMomentId,
  notice,
  noticeTone,
  noticeActionLabel,
  noticeAction,
  interactionActionLabel,
  hasReturnPath,
  actionBubble,
  commentBarTarget,
  commentDrafts,
  tx,
  onBack,
  onCompose,
  onAuthorTap,
  onLikeAuthorTap,
  onLikeMoment,
  onDeleteMoment,
  onOpenActionMenu,
  onCloseActionMenu,
  onCommentTap,
  onCloseCommentBar,
  onCommentChange,
  onCommentSubmit,
  onRefresh,
  onRetry,
  onEmptyAction,
  onNoticeBack,
  likeError,
  commentError,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: MobileMomentsViewProps) {
  const t = tx;
  const { containerRef, state: pullState } = usePullToRefresh({
    onRefresh,
    enabled: true,
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // 触底加载：观察列表底部 sentinel；进入视野且还有下一页 → 自动触发 fetchNextPage。
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    const sentinel = loadMoreRef.current;
    const root = containerRef.current;
    if (!sentinel || !root) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { root, rootMargin: "240px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [containerRef, hasNextPage, isFetchingNextPage, onLoadMore]);

  const activeMoment = actionBubble
    ? visibleMoments.find((moment) => moment.id === actionBubble.momentId) ??
      null
    : null;
  const liked = Boolean(
    ownerId &&
      activeMoment?.likes.some((like) => like.authorId === ownerId),
  );
  const ownerName = ownerUsername?.trim() || t(msg`世界主人`);

  // 「分享图卡」目标。点 ⋯ → 「分享」时把当时 actionBubble 的 momentId 存下来，
  // 用 id 而不是整个 moment 对象 — 这样 visibleMoments 后续刷新时预览图也跟着新。
  const [shareMomentId, setShareMomentId] = useState<string | null>(null);
  const shareMoment = shareMomentId
    ? visibleMoments.find((moment) => moment.id === shareMomentId) ?? null
    : null;
  const shareLiked = Boolean(
    ownerId &&
      shareMoment?.likes.some((like) => like.authorId === ownerId),
  );

  return (
    <AppPage className="relative space-y-0 bg-white px-0 pb-0 pt-0">
      <TabPageTopBar
        title={t(msg`朋友圈`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-white px-4 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
        leftActions={
          isDiscoverSubPage ? (
            <Button
              onClick={onBack}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[#1A1A1A] active:bg-black/[0.05]"
              aria-label={t(msg`返回`)}
            >
              <ArrowLeft size={17} />
            </Button>
          ) : undefined
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[#1A1A1A] active:bg-black/[0.05]"
            onClick={onCompose}
            aria-label={t(msg`发一条朋友圈`)}
          >
            <Camera size={20} strokeWidth={1.6} />
          </Button>
        }
      />

      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto overscroll-contain bg-white"
        style={{ overflowAnchor: "none" }}
      >
        <PullToRefreshIndicator state={pullState} t={t} />

        <div
          style={{
            transform: `translateY(${pullState.offset}px)`,
            transition: pullState.pulling ? "none" : "transform 220ms ease-out",
          }}
        >
          <WeChatMomentsCover
            nickname={ownerName}
            avatarUrl={ownerAvatar}
          />

          {notice ? (
            <div className="px-4 pt-3">
              <MobileMomentsInlineNotice
                tone={noticeTone}
                action={
                  noticeTone === "info" ? (
                    <div className="flex items-center gap-1.5">
                      {noticeAction && noticeActionLabel ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 shrink-0 rounded-full border-[#E5E5E5] bg-white px-3 text-[11px]"
                          onClick={noticeAction}
                        >
                          {noticeActionLabel}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 shrink-0 rounded-full border-[#E5E5E5] bg-white px-3 text-[11px]"
                        onClick={onNoticeBack}
                      >
                        {interactionActionLabel}
                      </Button>
                    </div>
                  ) : undefined
                }
              >
                {notice}
              </MobileMomentsInlineNotice>
            </div>
          ) : null}

          {momentsLoading && !visibleMoments.length ? (
            <div className="px-4 pt-10 pb-12 text-center text-[12px] text-[#9A9A9A]">
              {t(msg`正在刷新朋友圈`)}
            </div>
          ) : null}

          {momentsError ? (
            <div className="px-4 pt-10 pb-12 text-center">
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {t(msg`朋友圈暂时不可用`)}
              </div>
              <div className="mt-2 text-[12px] text-[#9A9A9A]">
                {momentsError.message}
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[#E5E5E5] bg-white px-3.5 text-[11px]"
                  onClick={onRetry}
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[#E5E5E5] bg-white px-3.5 text-[11px]"
                  onClick={onNoticeBack}
                >
                  {hasReturnPath ? t(msg`返回上一页`) : t(msg`重试读取`)}
                </Button>
              </div>
            </div>
          ) : null}

          {visibleMoments.map((moment, index) => (
            <div
              key={moment.id}
              className={
                index === 0
                  ? "yj-list-item-virtual-card"
                  : "yj-list-item-virtual-card border-t border-[#ECECEC]"
              }
            >
              <WeChatMomentCard
                cardId={`moment-post-${moment.id}`}
                moment={moment}
                ownerId={ownerId}
                liked={
                  Boolean(ownerId) &&
                  moment.likes.some((like) => like.authorId === ownerId)
                }
                onAuthorTap={() => onAuthorTap(moment)}
                onOpenActionMenu={(rect) => onOpenActionMenu(moment.id, rect)}
                onDoubleTapLike={() => onLikeMoment(moment.id)}
                onCommentTap={(comment) => onCommentTap(moment.id, comment)}
                onLikeAuthorTap={onLikeAuthorTap}
                onDelete={
                  ownerId &&
                  moment.authorType === "user" &&
                  moment.authorId === ownerId
                    ? () => onDeleteMoment(moment.id)
                    : undefined
                }
              />
            </div>
          ))}

          {likeError ? (
            <div className="px-4 pt-3">
              <MobileMomentsInlineNotice tone="info">
                {likeError.message}
              </MobileMomentsInlineNotice>
            </div>
          ) : null}
          {commentError ? (
            <div className="px-4 pt-3">
              <MobileMomentsInlineNotice tone="info">
                {commentError.message}
              </MobileMomentsInlineNotice>
            </div>
          ) : null}

          {!momentsLoading && !momentsError && !visibleMoments.length ? (
            <div className="px-4 pt-12 pb-16 text-center">
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {t(msg`还很安静`)}
              </div>
              <div className="mt-2 text-[12px] text-[#9A9A9A]">
                {t(msg`你先发一条动态，或者等世界里的角色们先开口。`)}
              </div>
              <div className="mt-4 flex justify-center">
                <Button
                  variant="primary"
                  size="sm"
                  className="h-8 rounded-full bg-[#07C160] px-3.5 text-[12px] text-white hover:bg-[#06ad56]"
                  onClick={onEmptyAction}
                >
                  {hasReturnPath ? t(msg`返回上一页`) : t(msg`发一条朋友圈`)}
                </Button>
              </div>
            </div>
          ) : null}

          {visibleMoments.length > 0 ? (
            <>
              <div
                ref={loadMoreRef}
                className="h-1 w-full"
                aria-hidden="true"
              />
              {isFetchingNextPage ? (
                <div className="py-4 text-center text-[12px] text-[#9A9A9A]">
                  {t(msg`正在加载更多…`)}
                </div>
              ) : !hasNextPage ? (
                <div className="py-4 text-center text-[12px] text-[#C0C0C0]">
                  {t(msg`已经到底了`)}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="h-[calc(env(safe-area-inset-bottom,0px)+24px)]" />
        </div>
      </div>

      <WeChatActionBubble
        open={Boolean(actionBubble)}
        anchorRect={actionBubble?.anchorRect ?? null}
        liked={liked}
        onLike={() => {
          if (actionBubble) {
            onLikeMoment(actionBubble.momentId);
          }
        }}
        onComment={() => {
          if (actionBubble) {
            onCommentTap(actionBubble.momentId, null);
          }
        }}
        onShare={() => {
          if (actionBubble) {
            setShareMomentId(actionBubble.momentId);
          }
        }}
        onClose={onCloseActionMenu}
      />

      <MomentShareCardModal
        moment={shareMoment}
        liked={shareLiked}
        ownerId={ownerId}
        ownerDisplayName={ownerName}
        onClose={() => setShareMomentId(null)}
      />

      <WeChatCommentBar
        open={Boolean(commentBarTarget)}
        replyTo={commentBarTarget?.replyTo ?? null}
        value={
          commentBarTarget
            ? commentDrafts[commentBarTarget.momentId] ?? ""
            : ""
        }
        onChange={(value) => {
          if (commentBarTarget) {
            onCommentChange(commentBarTarget.momentId, value);
          }
        }}
        pending={
          commentBarTarget
            ? pendingCommentMomentId === commentBarTarget.momentId
            : false
        }
        onSubmit={() => {
          if (commentBarTarget) {
            onCommentSubmit(commentBarTarget.momentId);
          }
        }}
        onClose={onCloseCommentBar}
      />
    </AppPage>
  );
}

function PullToRefreshIndicator({
  state,
  t,
}: {
  state: { offset: number; refreshing: boolean; pulling: boolean };
  t: (descriptor: MessageDescriptor) => string;
}) {
  if (!state.offset && !state.refreshing) return null;
  const label = state.refreshing
    ? t(msg`正在刷新...`)
    : state.offset >= 64
      ? t(msg`松手刷新`)
      : t(msg`下拉刷新`);
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center justify-center text-[12px] text-[#9A9A9A]"
      style={{
        top: 0,
        height: `${state.offset || 60}px`,
        transform: `translateY(-${(state.offset || 60) - state.offset}px)`,
      }}
    >
      <span>{label}</span>
    </div>
  );
}

function MobileMomentsInlineNotice({
  children,
  tone,
  action,
}: {
  children: ReactNode;
  tone: "success" | "info";
  action?: ReactNode;
}) {
  return (
    <InlineNotice
      tone={tone}
      className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
    >
      {action ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1">{children}</span>
          {action}
        </div>
      ) : (
        children
      )}
    </InlineNotice>
  );
}
