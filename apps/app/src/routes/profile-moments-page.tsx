import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera } from "lucide-react";
import {
  addMomentComment,
  deleteMoment,
  getMoments,
  toggleMomentLike,
  type Moment,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { getActiveLocale, useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { MomentShareCardModal } from "../components/moment-share-card-modal";
import { WeChatActionBubble } from "../components/wechat-action-bubble";
import {
  WeChatCommentBar,
  type WeChatCommentBarReplyTarget,
} from "../components/wechat-comment-bar";
import { WeChatMomentCard } from "../components/wechat-moment-card";
import { WeChatMomentsCover } from "../components/wechat-moments-cover";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { getMomentSummaryText } from "../features/moments/moment-content";
import {
  publishMomentComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import { useOptimisticMomentLikeHandlers } from "../features/moments/use-optimistic-like";
import { buildMobileMomentsPublishRouteHash } from "../features/moments/mobile-moments-publish-route-state";
import { usePullToRefresh } from "../features/moments/use-pull-to-refresh";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const DesktopProfileMomentsWorkspace = lazy(async () => {
  const mod = await import(
    "../features/desktop/moments/desktop-profile-moments-workspace"
  );
  return { default: mod.DesktopProfileMomentsWorkspace };
});

const DesktopMessageAvatarPopover = lazy(async () => {
  const mod = await import("../features/chat/message-avatar-popover-shell");
  return { default: mod.DesktopMessageAvatarPopover };
});

const PUBLISH_RETURN_HASH = buildMobileMomentsPublishRouteHash({
  returnPath: "/profile/moments",
});

export function ProfileMomentsPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
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
  const [desktopReplyTarget, setDesktopReplyTarget] = useState<{
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);
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
  const composeDraft = useMomentComposeDraft();

  const momentsQuery = useQuery({
    queryKey: ["app-moments", baseUrl],
    queryFn: () => getMoments(baseUrl),
  });

  const ownMoments = useMemo(() => {
    if (!momentsQuery.data || !ownerId) {
      return [];
    }
    return momentsQuery.data.filter(
      (moment) => moment.authorType === "user" && moment.authorId === ownerId,
    );
  }, [momentsQuery.data, ownerId]);

  const optimisticLike = useOptimisticMomentLikeHandlers({
    baseUrl,
    ownerId,
    ownerUsername: ownerName,
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

      const desktopTarget =
        desktopReplyTarget?.postId === momentId ? desktopReplyTarget : null;
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
      setDesktopReplyTarget((current) =>
        current?.postId === momentId ? null : current,
      );
      setNotice({
        tone: "success",
        message: t(msg`朋友圈互动已更新。`),
      });
      // fire-and-forget：await 会让"发表"按钮一直 disabled，公网隧道下卡几秒。
      void queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", baseUrl],
      });
    },
  });

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
      setNotice({
        tone: "success",
        message: t(msg`朋友圈已发布。`),
      });
      // 立刻 prepend 到 flat cache，本页（按 ownerId 过滤）也能马上看到刚发布的；
      // 后台 invalidate 再合并服务端最新状态（其它共享 cache 的页面同步）。
      queryClient.setQueryData<Moment[]>(["app-moments", baseUrl], (current) =>
        current ? [newMoment, ...current] : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", baseUrl],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (momentId: string) => deleteMoment(momentId, baseUrl),
    onMutate: async (momentId) => {
      await queryClient.cancelQueries({ queryKey: ["app-moments", baseUrl] });
      const snapshots = queryClient.getQueriesData<Moment[]>({
        queryKey: ["app-moments", baseUrl],
      });
      snapshots.forEach(([key, data]) => {
        if (!data) {
          return;
        }
        queryClient.setQueryData<Moment[]>(
          key,
          data.filter((item) => item.id !== momentId),
        );
      });
      return { snapshots };
    },
    onError: (_error, _momentId, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: () => {
      setNotice({
        tone: "success",
        message: t(msg`已删除这条朋友圈。`),
      });
      // fire-and-forget：optimistic 已把该条从 flat cache 抹掉；await 让删除按钮多卡 600ms+。
      void queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", baseUrl],
      });
    },
  });

  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;
  const pendingLikeMomentId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingDeleteMomentId = deleteMutation.isPending
    ? deleteMutation.variables
    : null;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!isDesktopLayout) return;
    setFavoriteSourceIds(
      readDesktopFavorites().map((item) => item.sourceId),
    );
  }, [isDesktopLayout]);

  const { containerRef, state: pullState } = usePullToRefresh({
    onRefresh: async () => {
      await momentsQuery.refetch();
    },
    enabled: !isDesktopLayout,
  });

  const goBack = () =>
    navigateBackOrFallback(() =>
      navigate({ to: "/tabs/profile", replace: true }),
    );

  const openLikerCharacterDetail = (like: MomentLike) => {
    if (like.authorType !== "character") {
      return;
    }
    void navigate({
      to: "/character/$characterId",
      params: { characterId: like.authorId },
      hash: buildCharacterDetailRouteHash({
        returnPath: "/profile/moments",
      }),
    });
  };

  const goPublish = () =>
    navigate({
      to: "/discover/moments/publish",
      hash: PUBLISH_RETURN_HASH,
    });

  const displayName = ownerName?.trim() || t(msg`世界主人`);

  if (isDesktopLayout) {
    const desktopErrors: string[] = [];
    if (momentsQuery.isError && momentsQuery.error instanceof Error) {
      desktopErrors.push(momentsQuery.error.message);
    }

    async function handleDesktopImageFilesSelected(files: FileList | null) {
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

    async function handleDesktopVideoFileSelected(file: File | null) {
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

    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面我的朋友圈`)}
            description={t(msg`正在载入桌面端我的朋友圈工作区。`)}
            loadingLabel={t(msg`载入桌面我的朋友圈...`)}
          />
        }
      >
        <DesktopProfileMomentsWorkspace
          commentDrafts={commentDrafts}
          commentErrorMessage={
            commentMutation.isError && commentMutation.error instanceof Error
              ? commentMutation.error.message
              : null
          }
          commentPendingMomentId={pendingCommentMomentId}
          commentReplyTarget={desktopReplyTarget}
          composeErrorMessage={
            composeDraft.mediaError ??
            (createMutation.isError && createMutation.error instanceof Error
              ? createMutation.error.message
              : null)
          }
          createPending={createMutation.isPending}
          deletePendingMomentId={pendingDeleteMomentId}
          deleteErrorMessage={
            deleteMutation.isError && deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : null
          }
          errors={desktopErrors}
          imageDrafts={composeDraft.imageDrafts}
          isLoading={momentsQuery.isLoading}
          likeErrorMessage={
            likeMutation.isError && likeMutation.error instanceof Error
              ? likeMutation.error.message
              : null
          }
          likePendingMomentId={pendingLikeMomentId}
          moments={ownMoments}
          ownerAvatar={ownerAvatar}
          ownerId={ownerId ?? null}
          ownerName={displayName}
          showCompose={showCompose}
          successNotice={notice?.message}
          text={composeDraft.text}
          videoDraft={composeDraft.videoDraft}
          isMomentFavorite={(momentId) =>
            favoriteSourceIds.includes(`moment-${momentId}`)
          }
          setShowCompose={setShowCompose}
          onBack={goBack}
          onCancelCommentReply={() => setDesktopReplyTarget(null)}
          onCommentChange={(momentId, value) =>
            setCommentDrafts((current) => ({
              ...current,
              [momentId]: value,
            }))
          }
          onCommentSubmit={(momentId) => commentMutation.mutate(momentId)}
          onCreate={() => createMutation.mutate()}
          onDelete={(momentId) => deleteMutation.mutate(momentId)}
          onImageFilesSelected={(files) => {
            void handleDesktopImageFilesSelected(files);
          }}
          onLike={(momentId) => likeMutation.mutate(momentId)}
          onOpenLikerPopover={({ anchorElement, like }) => {
            if (like.authorType === "character") {
              setDesktopAvatarPopover({
                anchorElement,
                kind: "character",
                characterId: like.authorId,
                fallbackAvatar: like.authorAvatar,
                fallbackName: like.authorName,
              });
            } else if (like.authorType === "user") {
              setDesktopAvatarPopover({
                anchorElement,
                kind: "owner",
              });
            }
          }}
          onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
          onRemoveVideo={() => composeDraft.clearVideoDraft()}
          onStartCommentReply={({ momentId, comment }) =>
            setDesktopReplyTarget({
              authorId: comment.authorId,
              authorName: comment.authorName,
              commentId: comment.id,
              postId: momentId,
            })
          }
          onTextChange={composeDraft.setText}
          onToggleFavorite={(momentId) => {
            const moment = ownMoments.find((item) => item.id === momentId);
            if (!moment) return;
            const sourceId = `moment-${moment.id}`;
            const collected = favoriteSourceIds.includes(sourceId);
            const nextFavorites = collected
              ? removeDesktopFavorite(sourceId)
              : upsertDesktopFavorite({
                  id: `favorite-${sourceId}`,
                  sourceId,
                  category: "moments",
                  title: moment.authorName,
                  description: getMomentSummaryText(moment),
                  meta: t(
                    msg`朋友圈 · ${formatTimestamp(moment.postedAt)}`,
                  ),
                  to: "/profile/moments",
                  badge: t(msg`朋友圈`),
                  avatarName: moment.authorName,
                  avatarSrc: moment.authorAvatar,
                });
            setFavoriteSourceIds(
              nextFavorites.map((favorite) => favorite.sourceId),
            );
          }}
          onVideoFileSelected={(file) => {
            void handleDesktopVideoFileSelected(file);
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

  const activeMoment = actionBubble
    ? ownMoments.find((moment) => moment.id === actionBubble.momentId) ?? null
    : null;
  const liked = Boolean(
    ownerId && activeMoment?.likes.some((like) => like.authorId === ownerId),
  );

  // 「分享图卡」目标 — 点 ⋯ → 分享时把 momentId 存下来。
  const [shareMomentId, setShareMomentId] = useState<string | null>(null);
  const shareMoment = shareMomentId
    ? ownMoments.find((moment) => moment.id === shareMomentId) ?? null
    : null;
  const shareLiked = Boolean(
    ownerId && shareMoment?.likes.some((like) => like.authorId === ownerId),
  );

  return (
    <AppPage className="relative space-y-0 bg-white px-0 py-0">
      <TabPageTopBar
        title={t(msg`我的朋友圈`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-white px-4 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
        leftActions={
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#1A1A1A] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
        rightActions={
          <button
            type="button"
            onClick={goPublish}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#1A1A1A] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`发条朋友圈`)}
          >
            <Camera size={20} strokeWidth={1.6} />
          </button>
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
          <WeChatMomentsCover nickname={displayName} avatarUrl={ownerAvatar} />

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

          {momentsQuery.isLoading ? (
            <div className="px-4 pt-10">
              <LoadingBlock label={t(msg`正在加载我的朋友圈`)} />
            </div>
          ) : null}

          {momentsQuery.isError && momentsQuery.error ? (
            <div className="px-4 pt-10">
              <ErrorBlock message={describeRequestError(momentsQuery.error)} />
            </div>
          ) : null}

          {!momentsQuery.isLoading &&
          !momentsQuery.isError &&
          ownMoments.length === 0 ? (
            <div className="px-4 pt-12">
              <EmptyState
                title={t(msg`还没有发布过朋友圈`)}
                description={t(msg`记录此刻，你的朋友圈会出现在这里。`)}
                action={
                  <Button
                    variant="primary"
                    className="rounded-full bg-[#07C160] px-5 text-[13px] text-white shadow-none hover:bg-[#06ad56]"
                    onClick={goPublish}
                  >
                    {t(msg`发条朋友圈`)}
                  </Button>
                }
              />
            </div>
          ) : null}

          {ownMoments.map((moment, index) => (
            <div
              key={moment.id}
              className={
                index === 0
                  ? "yj-list-item-virtual-card"
                  : "yj-list-item-virtual-card border-t border-[#ECECEC]"
              }
            >
              <PersonalAlbumRow
                moment={moment}
                ownerId={ownerId}
                onOpenActionMenu={(rect) =>
                  setActionBubble({ momentId: moment.id, anchorRect: rect })
                }
                onDoubleTapLike={() => likeMutation.mutate(moment.id)}
                onCommentTap={(comment) => onCommentTap(moment.id, comment)}
                onLikeAuthorTap={openLikerCharacterDetail}
                onDelete={() => {
                  if (deleteMutation.isPending) return;
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm(t(msg`确定删除这条朋友圈吗？`))
                  ) {
                    return;
                  }
                  deleteMutation.mutate(moment.id);
                }}
              />
            </div>
          ))}

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
        ownerId={ownerId}
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

function PersonalAlbumRow({
  moment,
  ownerId,
  onOpenActionMenu,
  onDoubleTapLike,
  onCommentTap,
  onLikeAuthorTap,
  onDelete,
}: {
  moment: Moment;
  ownerId: string | null;
  onOpenActionMenu: (rect: DOMRect) => void;
  onDoubleTapLike: () => void;
  onCommentTap: (comment: MomentComment | null) => void;
  onLikeAuthorTap: (like: MomentLike) => void;
  onDelete?: () => void;
}) {
  const date = new Date(moment.postedAt);
  const day = Number.isNaN(date.getTime())
    ? "--"
    : `${date.getDate()}`.padStart(2, "0");
  const monthLabel = Number.isNaN(date.getTime())
    ? "--"
    : new Intl.DateTimeFormat(getActiveLocale(), { month: "long" }).format(date);
  return (
    <div className="flex items-start gap-2 px-4 py-3.5">
      <div className="w-12 shrink-0 pt-1 text-right">
        <div className="text-[26px] font-semibold leading-none text-[#1A1A1A]">
          {day}
        </div>
        <div className="mt-1 text-[11px] tracking-[0.04em] text-[#9A9A9A]">
          {monthLabel}
        </div>
      </div>
      <div className="min-w-0 flex-1 pr-4">
        <WeChatMomentCard
          cardId={`moment-post-${moment.id}`}
          moment={moment}
          ownerId={ownerId}
          liked={
            Boolean(ownerId) &&
            moment.likes.some((like) => like.authorId === ownerId)
          }
          hideAuthor
          flush
          onOpenActionMenu={onOpenActionMenu}
          onDoubleTapLike={onDoubleTapLike}
          onCommentTap={onCommentTap}
          onLikeAuthorTap={onLikeAuthorTap}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

