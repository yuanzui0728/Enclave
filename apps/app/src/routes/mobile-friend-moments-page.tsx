import { useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  addMomentComment,
  getBlockedCharacters,
  getCharacter,
  getFriends,
  getMoments,
  toggleMomentLike,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { getActiveLocale, translateRuntimeMessage } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { ArrowLeft } from "lucide-react";
import { MomentShareCardModal } from "../components/moment-share-card-modal";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { WeChatActionBubble } from "../components/wechat-action-bubble";
import {
  WeChatCommentBar,
  type WeChatCommentBarReplyTarget,
} from "../components/wechat-comment-bar";
import { WeChatMomentCard } from "../components/wechat-moment-card";
import { WeChatMomentsCover } from "../components/wechat-moments-cover";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { getFriendDisplayName } from "../features/contacts/contact-utils";
import {
  buildMobileFriendMomentsRouteHash,
  parseMobileFriendMomentsRouteState,
} from "../features/moments/mobile-friend-moments-route-state";
import { usePullToRefresh } from "../features/moments/use-pull-to-refresh";
import { useOptimisticMomentLikeHandlers } from "../features/moments/use-optimistic-like";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const t = translateRuntimeMessage;

export function MobileFriendMomentsPage() {
  const { characterId } = useParams({
    strict: false,
  }) as {
    characterId?: string;
  };
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerUsername = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const resolvedCharacterId = characterId ?? "";
  const routeState = useMemo(
    () => parseMobileFriendMomentsRouteState(hash),
    [hash],
  );
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const statusBackLabel = safeReturnPath
    ? t(msg`返回上一页`)
    : resolvedCharacterId
      ? t(msg`查看角色资料`)
      : t(msg`回朋友圈主页`);
  const currentRouteHash = useMemo(
    () =>
      buildMobileFriendMomentsRouteHash({
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [safeReturnHash, safeReturnPath],
  );
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [actionBubble, setActionBubble] = useState<{
    momentId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [commentBarTarget, setCommentBarTarget] = useState<{
    momentId: string;
    replyTo: WeChatCommentBarReplyTarget | null;
  } | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, resolvedCharacterId],
    queryFn: () => getCharacter(resolvedCharacterId, baseUrl),
    enabled: Boolean(resolvedCharacterId),
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });
  const momentsQuery = useQuery({
    queryKey: ["app-moments", baseUrl],
    queryFn: () => getMoments(baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-moments-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(resolvedCharacterId),
  });

  const optimisticLike = useOptimisticMomentLikeHandlers({
    baseUrl,
    ownerId,
    ownerUsername,
    ownerAvatar,
  });
  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onMutate: optimisticLike.onMutate,
    onError: optimisticLike.onError,
    onSuccess: () => {
      setNotice({
        tone: "success",
        message: t(msg`朋友圈互动已更新。`),
      });
      // 点赞 toggle 是 boolean，optimistic 已把 likes 切对。完全省掉 invalidate，
      // 避免拉回 GET /api/moments 全量 + 30+ media 条件请求 RTT。
    },
  });
  const commentMutation = useMutation({
    mutationFn: (momentId: string) => {
      const text = commentDrafts[momentId]?.trim();
      if (!text) {
        throw new Error(t(msg`请先输入评论内容。`));
      }

      const target =
        commentBarTarget?.momentId === momentId
          ? commentBarTarget.replyTo
          : null;

      return addMomentComment(
        momentId,
        {
          text,
          replyToCommentId: target?.commentId,
          replyToAuthorId: target?.authorId,
        },
        baseUrl,
      );
    },
    onSuccess: (_, momentId) => {
      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setCommentBarTarget(null);
      setNotice({
        tone: "success",
        message: t(msg`朋友圈互动已更新。`),
      });
      // fire-and-forget：await refetch 会让"发表"按钮一直 disabled，
      // 公网隧道下感觉评论"卡好几秒"。让 invalidate 在后台跑就行。
      void queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", baseUrl],
      });
    },
  });

  const friendItem = useMemo(
    () =>
      (friendsQuery.data ?? []).find(
        (item) => item.character.id === resolvedCharacterId,
      ) ?? null,
    [friendsQuery.data, resolvedCharacterId],
  );
  const character = characterQuery.data ?? friendItem?.character ?? null;
  const isBlocked = Boolean(
    (blockedQuery.data ?? []).some(
      (item) => item.characterId === resolvedCharacterId,
    ),
  );
  const displayName = friendItem
    ? getFriendDisplayName(friendItem)
    : character?.name || t(msg`角色朋友圈`);
  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );
  const friendMoments = useMemo(
    () =>
      (momentsQuery.data ?? [])
        .filter(
          (moment) =>
            (moment.authorType !== "character" ||
              !blockedCharacterIds.has(moment.authorId)) &&
            moment.authorId === resolvedCharacterId,
        )
        .sort(
          (left, right) =>
            new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime(),
        ),
    [blockedCharacterIds, momentsQuery.data, resolvedCharacterId],
  );
  const relationshipLoading = friendsQuery.isLoading || blockedQuery.isLoading;
  const timelineLoading = momentsQuery.isLoading || relationshipLoading;
  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;

  const errors: string[] = [];
  if (characterQuery.isError && characterQuery.error instanceof Error) {
    errors.push(characterQuery.error.message);
  }
  if (friendsQuery.isError && friendsQuery.error instanceof Error) {
    errors.push(friendsQuery.error.message);
  }
  if (momentsQuery.isError && momentsQuery.error instanceof Error) {
    errors.push(momentsQuery.error.message);
  }
  if (blockedQuery.isError && blockedQuery.error instanceof Error) {
    errors.push(blockedQuery.error.message);
  }

  useEffect(() => {
    setCommentDrafts({});
    setNotice(null);
    setCommentBarTarget(null);
    setActionBubble(null);
  }, [baseUrl, resolvedCharacterId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

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

  function openCharacterDetail() {
    if (!resolvedCharacterId) {
      return false;
    }

    void navigate({
      to: "/character/$characterId",
      params: { characterId: resolvedCharacterId },
      hash: buildCharacterDetailRouteHash({
        returnPath: `/friend-moments/${resolvedCharacterId}`,
        returnHash: currentRouteHash || undefined,
      }),
    });
    return true;
  }

  function openLikerCharacterDetail(like: MomentLike) {
    if (like.authorType !== "character") {
      return;
    }
    void navigate({
      to: "/character/$characterId",
      params: { characterId: like.authorId },
      hash: buildCharacterDetailRouteHash({
        returnPath: `/friend-moments/${resolvedCharacterId}`,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function handleBack() {
    navigateBackOrFallback(() => {
      if (navigateToRouteStateReturn()) {
        return;
      }

      if (openCharacterDetail()) {
        return;
      }

      void navigate({ to: "/discover/moments" });
    });
  }

  function handleRetryLoad() {
    void momentsQuery.refetch();
    void blockedQuery.refetch();
  }

  const { containerRef, state: pullState } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([
        momentsQuery.refetch(),
        blockedQuery.refetch(),
        friendsQuery.refetch(),
        characterQuery.refetch(),
      ]);
    },
    enabled: Boolean(resolvedCharacterId),
  });

  if (!resolvedCharacterId) {
    return (
      <AppPage className="space-y-0 px-0 py-0">
        <TabPageTopBar
          title={t(msg`朋友圈`)}
          subtitle={t(msg`好友`)}
          titleAlign="center"
          className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-white px-4 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
          leftActions={
            <Button
              onClick={handleBack}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[#1A1A1A] active:bg-black/[0.05]"
            >
              <ArrowLeft size={17} />
            </Button>
          }
        />
        <div className="px-4 py-6">
          <ErrorBlock message={t(msg`角色资料不存在，暂时无法打开朋友圈。`)} />
        </div>
      </AppPage>
    );
  }

  const activeMoment = actionBubble
    ? friendMoments.find((moment) => moment.id === actionBubble.momentId) ??
      null
    : null;
  const liked = Boolean(
    activeMoment?.likes.some((like) => like.authorType === "user"),
  );

  // 「分享图卡」目标 — 点 ⋯ → 分享时把 momentId 存下来。
  // 用 id 而不是整个对象，friendMoments 后续刷新时预览也会跟着新。
  const [shareMomentId, setShareMomentId] = useState<string | null>(null);
  const shareMoment = shareMomentId
    ? friendMoments.find((moment) => moment.id === shareMomentId) ?? null
    : null;
  const shareLiked = Boolean(
    shareMoment?.likes.some((like) => like.authorType === "user"),
  );

  const onCommentTap = (momentId: string, comment: MomentComment | null) => {
    setCommentBarTarget({
      momentId,
      replyTo: comment
        ? {
            authorId: comment.authorId,
            authorName: comment.authorName,
            commentId: comment.id,
          }
        : null,
    });
  };

  return (
    <AppPage className="relative space-y-0 bg-white px-0 pb-0 pt-0">
      <TabPageTopBar
        title={displayName}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-white px-4 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
        leftActions={
          <Button
            onClick={handleBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[#1A1A1A] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
      />

      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto overscroll-contain bg-white"
        style={{ overflowAnchor: "none" }}
      >
        {pullState.offset || pullState.refreshing ? (
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 flex items-center justify-center text-[12px] text-[#9A9A9A]"
            style={{ top: 0, height: `${pullState.offset || 60}px` }}
          >
            <span>
              {pullState.refreshing
                ? t(msg`正在刷新...`)
                : pullState.offset >= 64
                  ? t(msg`松手刷新`)
                  : t(msg`下拉刷新`)}
            </span>
          </div>
        ) : null}

        <div
          style={{
            transform: `translateY(${pullState.offset}px)`,
            transition: pullState.pulling ? "none" : "transform 220ms ease-out",
          }}
        >
          <WeChatMomentsCover
            nickname={displayName}
            avatarUrl={character?.avatar}
            onAvatarTap={(event) => {
              event.stopPropagation();
              openCharacterDetail();
            }}
          />

          {notice ? (
            <div className="px-4 pt-3">
              <InlineNotice
                tone={notice.tone}
                className="rounded-[8px] border border-[#ECECEC] bg-white px-3 py-2 text-[12px] shadow-none"
              >
                {notice.message}
              </InlineNotice>
            </div>
          ) : null}

          {!character && (characterQuery.isLoading || friendsQuery.isLoading) ? (
            <div className="px-4 pt-10">
              <LoadingBlock
                label={t(msg`正在读取角色朋友圈...`)}
                className="border-0 bg-transparent py-2 shadow-none"
              />
            </div>
          ) : null}

          {!character &&
          !characterQuery.isLoading &&
          !friendsQuery.isLoading ? (
            <section className="mx-4 mt-4 rounded-[12px] border border-[#ECECEC] bg-white px-4 py-5">
              <div className="text-[16px] font-semibold text-[#1A1A1A]">
                {t(msg`无法打开这位角色的朋友圈`)}
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[#9A9A9A]">
                {t(msg`角色资料不存在，或者当前资料还没有同步完成。`)}
              </div>
              {errors.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {errors.map((message, index) => (
                    <ErrorBlock key={`${message}-${index}`} message={message} />
                  ))}
                </div>
              ) : null}
              <div className="mt-5 flex gap-2">
                <Button variant="secondary" onClick={handleBack}>
                  {t(msg`返回上一页`)}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (navigateToRouteStateReturn()) return;
                    if (openCharacterDetail()) return;
                    void navigate({ to: "/discover/moments" });
                  }}
                >
                  {safeReturnPath
                    ? t(msg`回到来源页`)
                    : resolvedCharacterId
                      ? t(msg`查看角色资料`)
                      : t(msg`去朋友圈主页`)}
                </Button>
              </div>
            </section>
          ) : null}

          {character && timelineLoading && !friendMoments.length ? (
            <div className="px-4 pt-10 pb-12 text-center text-[12px] text-[#9A9A9A]">
              {t(msg`正在刷新这位角色的朋友圈`)}
            </div>
          ) : null}

          {character && !timelineLoading && momentsQuery.isError ? (
            <div className="px-4 pt-10 pb-12 text-center">
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {t(msg`朋友圈暂时不可用`)}
              </div>
              <div className="mt-2 text-[12px] text-[#9A9A9A]">
                {momentsQuery.error instanceof Error
                  ? momentsQuery.error.message
                  : t(msg`读取这位角色的朋友圈时出错了。`)}
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[#E5E5E5] bg-white px-3.5 text-[11px]"
                  onClick={handleRetryLoad}
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[#E5E5E5] bg-white px-3.5 text-[11px]"
                  onClick={handleBack}
                >
                  {statusBackLabel}
                </Button>
              </div>
            </div>
          ) : null}

          {character && !timelineLoading && !momentsQuery.isError && isBlocked ? (
            <div className="px-4 pt-10 pb-12 text-center">
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {t(msg`这位角色的朋友圈当前不可见`)}
              </div>
              <div className="mt-2 text-[12px] text-[#9A9A9A]">
                {t(msg`你已经将这位角色加入黑名单，相关朋友圈内容会先隐藏。`)}
              </div>
            </div>
          ) : null}

          {character &&
          !timelineLoading &&
          !momentsQuery.isError &&
          !isBlocked &&
          !friendMoments.length ? (
            <div className="px-4 pt-12 pb-16 text-center">
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {t(msg`${displayName} 还没有发表朋友圈`)}
              </div>
              <div className="mt-2 text-[12px] text-[#9A9A9A]">
                {t(msg`先把这页留着，等 TA 下次更新时再回来看看。`)}
              </div>
            </div>
          ) : null}

          {character &&
          !timelineLoading &&
          !momentsQuery.isError &&
          !isBlocked &&
          friendMoments.length
            ? friendMoments.map((moment, index) => {
                const date = new Date(moment.postedAt);
                const dayLabel = Number.isNaN(date.getTime())
                  ? "--"
                  : `${date.getDate()}`.padStart(2, "0");
                const monthLabel = Number.isNaN(date.getTime())
                  ? "--"
                  : new Intl.DateTimeFormat(getActiveLocale(), { month: "long" }).format(date);
                return (
                  <div
                    key={moment.id}
                    className={
                      index === 0
                        ? "yj-list-item-virtual-card"
                        : "yj-list-item-virtual-card border-t border-[#ECECEC]"
                    }
                  >
                    <div className="flex items-start gap-2 px-4 py-3.5">
                      <div className="w-12 shrink-0 pt-1 text-right">
                        <div className="text-[26px] font-semibold leading-none text-[#1A1A1A]">
                          {dayLabel}
                        </div>
                        <div className="mt-1 text-[11px] tracking-[0.04em] text-[#9A9A9A]">
                          {monthLabel}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <WeChatMomentCard
                          cardId={`moment-post-${moment.id}`}
                          moment={moment}
                          ownerId={null}
                          liked={moment.likes.some(
                            (like) => like.authorType === "user",
                          )}
                          hideAuthor
                          flush
                          onAuthorTap={openCharacterDetail}
                          onOpenActionMenu={(rect) =>
                            setActionBubble({
                              momentId: moment.id,
                              anchorRect: rect,
                            })
                          }
                          onDoubleTapLike={() =>
                            likeMutation.mutate(moment.id)
                          }
                          onCommentTap={(comment) =>
                            onCommentTap(moment.id, comment)
                          }
                          onLikeAuthorTap={openLikerCharacterDetail}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            : null}

          {likeMutation.isError && likeMutation.error instanceof Error ? (
            <div className="px-4 pt-3">
              <InlineNotice
                tone="info"
                className="rounded-[8px] border border-[#ECECEC] bg-white px-3 py-2 text-[12px] shadow-none"
              >
                {likeMutation.error.message}
              </InlineNotice>
            </div>
          ) : null}

          {commentMutation.isError && commentMutation.error instanceof Error ? (
            <div className="px-4 pt-3">
              <InlineNotice
                tone="info"
                className="rounded-[8px] border border-[#ECECEC] bg-white px-3 py-2 text-[12px] shadow-none"
              >
                {commentMutation.error.message}
              </InlineNotice>
            </div>
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
            likeMutation.mutate(actionBubble.momentId);
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
        onClose={() => setActionBubble(null)}
      />

      <MomentShareCardModal
        moment={shareMoment}
        liked={shareLiked}
        ownerId={null}
        ownerDisplayName={displayName}
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
            setCommentDrafts((current) => ({
              ...current,
              [commentBarTarget.momentId]: value,
            }));
          }
        }}
        pending={
          commentBarTarget
            ? pendingCommentMomentId === commentBarTarget.momentId
            : false
        }
        onSubmit={() => {
          if (commentBarTarget) {
            commentMutation.mutate(commentBarTarget.momentId);
          }
        }}
        onClose={() => setCommentBarTarget(null)}
      />
    </AppPage>
  );
}
