import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  type Character,
  type Moment,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { ArrowLeft, Clock3, MessageCircle, Newspaper } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { MomentShareCardModal } from "../../../components/moment-share-card-modal";
import { formatTimestamp, parseTimestamp } from "../../../lib/format";
import { DesktopMomentComposePanel } from "./desktop-moment-compose-panel";
import {
  DesktopMomentRow,
  type MomentCommentReplyTarget,
} from "./desktop-moment-row";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";

type DesktopFriendMomentsWorkspaceProps = {
  character: Character;
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  commentPendingMomentId: string | null;
  commentReplyTarget?: MomentCommentReplyTarget | null;
  composeErrorMessage?: string | null;
  createPending: boolean;
  displayName: string;
  errors?: string[];
  imageDrafts: MomentImageDraft[];
  isBlocked?: boolean;
  isLoading: boolean;
  likeErrorMessage?: string | null;
  likePendingMomentId: string | null;
  moments: Moment[];
  ownerAvatar?: string | null;
  ownerId?: string | null;
  ownerUsername?: string | null;
  scrollToMomentId?: string | null;
  showCompose: boolean;
  signature: string;
  successNotice?: string;
  text: string;
  videoDraft: MomentVideoDraft | null;
  isMomentFavorite: (momentId: string) => boolean;
  setShowCompose: (nextValue: boolean) => void;
  onBack: () => void;
  onCancelCommentReply?: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onCreate: () => void;
  onImageFilesSelected: (files: FileList | null) => void;
  onLike: (momentId: string) => void;
  onOpenMomentsHome: () => void;
  onOpenProfile: () => void;
  onOpenProfilePopover?: (input: {
    anchorElement: HTMLButtonElement;
    momentId?: string;
  }) => void;
  onOpenLikerPopover?: (input: {
    anchorElement: HTMLButtonElement;
    momentId: string;
    like: MomentLike;
  }) => void;
  onRemoveImage: (id: string) => void;
  onRemoveVideo: () => void;
  onStartCommentReply?: (input: {
    momentId: string;
    comment: MomentComment;
  }) => void;
  onTextChange: (value: string) => void;
  onToggleFavorite: (momentId: string) => void;
  onVideoFileSelected: (file: File | null) => void;
};

export function DesktopFriendMomentsWorkspace({
  character,
  commentDrafts,
  commentErrorMessage,
  commentPendingMomentId,
  commentReplyTarget = null,
  composeErrorMessage,
  createPending,
  displayName,
  errors = [],
  imageDrafts,
  isBlocked = false,
  isLoading,
  likeErrorMessage,
  likePendingMomentId,
  moments,
  ownerAvatar,
  ownerId,
  ownerUsername,
  scrollToMomentId = null,
  showCompose,
  signature,
  successNotice,
  text,
  videoDraft,
  isMomentFavorite,
  setShowCompose,
  onBack,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onImageFilesSelected,
  onLike,
  onOpenMomentsHome,
  onOpenProfile,
  onOpenProfilePopover,
  onOpenLikerPopover,
  onRemoveImage,
  onRemoveVideo,
  onStartCommentReply,
  onTextChange,
  onToggleFavorite,
  onVideoFileSelected,
}: DesktopFriendMomentsWorkspaceProps) {
  const t = useRuntimeTranslator();
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const profileActionAriaLabel = t(msg`查看 ${displayName} 的资料`);

  const [shareMomentId, setShareMomentId] = useState<string | null>(null);
  const shareMoment = shareMomentId
    ? moments.find((moment) => moment.id === shareMomentId) ?? null
    : null;
  const shareLiked = Boolean(
    ownerId && shareMoment?.likes.some((like) => like.authorId === ownerId),
  );

  const sortedMoments = useMemo(
    () =>
      [...moments].sort(
        (left, right) =>
          (parseTimestamp(right.postedAt) ?? 0) -
          (parseTimestamp(left.postedAt) ?? 0),
      ),
    [moments],
  );
  const totalCommentCount = useMemo(
    () => sortedMoments.reduce((total, moment) => total + moment.commentCount, 0),
    [sortedMoments],
  );
  const latestMoment = sortedMoments[0] ?? null;

  useEffect(() => {
    if (!scrollToMomentId || typeof document === "undefined") {
      return;
    }

    if (!sortedMoments.some((moment) => moment.id === scrollToMomentId)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`desktop-moment-post-${scrollToMomentId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollToMomentId, sortedMoments]);

  function openProfilePopover(
    anchorElement: HTMLButtonElement,
    momentId?: string,
  ) {
    if (onOpenProfilePopover) {
      onOpenProfilePopover({
        anchorElement,
        momentId,
      });
      return;
    }

    onOpenProfile();
  }

  function renderFeedContent() {
    if (isLoading) {
      return (
        <LoadingBlock
          label={t(msg`正在读取这位角色的朋友圈...`)}
          className="rounded-[20px] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
        />
      );
    }

    if (!sortedMoments.length) {
      return (
        <div className="mx-auto max-w-[560px] py-10">
          <EmptyState
            title={
              isBlocked
                ? t(msg`这位角色的朋友圈当前不可见`)
                : t(msg`${displayName} 还没有发表朋友圈`)
            }
            description={
              isBlocked
                ? t(msg`你已经将这位角色加入黑名单，相关朋友圈内容会先隐藏。`)
                : t(msg`后续有新动态时，会直接显示在这个独立页面里。`)
            }
            action={
              <div className="flex items-center justify-center gap-2">
                <Button variant="secondary" onClick={onOpenProfile}>
                  {t(msg`查看资料`)}
                </Button>
                <Button variant="primary" onClick={onOpenMomentsHome}>
                  {t(msg`返回朋友圈`)}
                </Button>
              </div>
            }
          />
        </div>
      );
    }

    return (
      <div className="space-y-4 pb-6">
        {sortedMoments.map((moment) => (
          <DesktopMomentRow
            key={moment.id}
            authorActionAriaLabel={t(msg`查看 ${displayName} 的资料`)}
            authorActionLabel={t(msg`查看资料`)}
            commentDraft={commentDrafts[moment.id] ?? ""}
            commentLoading={commentPendingMomentId === moment.id}
            commentReplyTarget={
              commentReplyTarget?.postId === moment.id
                ? commentReplyTarget
                : null
            }
            likeLoading={likePendingMomentId === moment.id}
            moment={moment}
            ownerId={ownerId}
            favorite={isMomentFavorite(moment.id)}
            onCancelCommentReply={onCancelCommentReply}
            onCommentChange={(value) => onCommentChange(moment.id, value)}
            onCommentSubmit={() => onCommentSubmit(moment.id)}
            onLike={() => onLike(moment.id)}
            onShare={() => setShareMomentId(moment.id)}
            onStartCommentReply={
              onStartCommentReply
                ? (comment) =>
                    onStartCommentReply({
                      momentId: comment.postId,
                      comment,
                    })
                : undefined
            }
            onAuthorAction={onOpenProfile}
            onSelectAuthor={(event) =>
              openProfilePopover(event.currentTarget, moment.id)
            }
            onSelectLiker={
              onOpenLikerPopover
                ? (event, like) =>
                    onOpenLikerPopover({
                      anchorElement: event.currentTarget,
                      momentId: moment.id,
                      like,
                    })
                : undefined
            }
            onToggleFavorite={() => onToggleFavorite(moment.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <section className="min-w-0 flex-1 bg-[rgba(245,248,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-5 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[760px] items-start justify-between gap-5">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label={t(msg`返回上一页`)}
                  className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
                >
                  <ArrowLeft size={17} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start gap-4">
                    <button
                      type="button"
                      onClick={(event) => openProfilePopover(event.currentTarget)}
                      className="shrink-0 rounded-[18px] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(7,193,96,0.34)] focus-visible:ring-offset-2"
                      aria-label={profileActionAriaLabel}
                    >
                      <AvatarChip
                        name={displayName}
                        src={character.avatar}
                        size="wechat"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => openProfilePopover(event.currentTarget)}
                      className="min-w-0 text-left transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(7,193,96,0.34)] focus-visible:ring-offset-2"
                      aria-label={profileActionAriaLabel}
                    >
                      <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                        {t(msg`角色朋友圈`)}
                      </div>
                      <div className="mt-1 truncate text-[20px] font-semibold text-[color:var(--text-primary)]">
                        {displayName}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                        {signature}
                      </div>
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1">
                      <Newspaper size={13} />
                      {t(msg`${sortedMoments.length} 条动态`)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1">
                      <MessageCircle size={13} />
                      {t(msg`${totalCommentCount} 条评论`)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1">
                      <Clock3 size={13} />
                      {latestMoment
                        ? t(
                            msg`最近更新 ${formatTimestamp(latestMoment.postedAt)}`,
                          )
                        : t(msg`暂未更新`)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={onOpenProfile}>
                  {t(msg`查看资料`)}
                </Button>
                <Button variant="secondary" size="sm" onClick={onOpenMomentsHome}>
                  {t(msg`返回朋友圈`)}
                </Button>
                <Button variant="primary" size="sm" onClick={() => setShowCompose(true)}>
                  {t(msg`发朋友圈`)}
                </Button>
              </div>
            </div>
          </div>

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-7 py-6"
          >
            <div className="mx-auto w-full max-w-[760px]">
              {successNotice ? (
                <div className="mb-4">
                  <InlineNotice
                    tone="success"
                    className="border-[color:var(--border-faint)] bg-white"
                  >
                    {successNotice}
                  </InlineNotice>
                </div>
              ) : null}

              {errors.length > 0 ? (
                <div className="mb-4 space-y-3">
                  {errors.map((message, index) => (
                    <ErrorBlock key={`${message}-${index}`} message={message} />
                  ))}
                </div>
              ) : null}

              {likeErrorMessage ? (
                <div className="mb-4">
                  <ErrorBlock message={likeErrorMessage} />
                </div>
              ) : null}

              {commentErrorMessage ? (
                <div className="mb-4">
                  <ErrorBlock message={commentErrorMessage} />
                </div>
              ) : null}

              {renderFeedContent()}
            </div>
          </div>
        </div>
      </section>

      {showCompose ? (
        <DesktopMomentComposePanel
          createPending={createPending}
          canAddImages={imageDrafts.length < 9 && !videoDraft}
          canAddVideo={!imageDrafts.length}
          errorMessage={composeErrorMessage}
          imageDrafts={imageDrafts}
          ownerAvatar={ownerAvatar}
          ownerUsername={ownerUsername}
          text={text}
          videoDraft={videoDraft}
          onClose={() => setShowCompose(false)}
          onCreate={onCreate}
          onImageFilesSelected={onImageFilesSelected}
          onRemoveImage={onRemoveImage}
          onRemoveVideo={onRemoveVideo}
          onTextChange={onTextChange}
          onVideoFileSelected={onVideoFileSelected}
        />
      ) : null}

      <MomentShareCardModal
        moment={shareMoment}
        liked={shareLiked}
        ownerId={ownerId ?? null}
        ownerDisplayName={displayName}
        onClose={() => setShareMomentId(null)}
      />
    </div>
  );
}
