import { useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  type Moment,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { ArrowLeft, PenSquare } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { MomentShareCardModal } from "../../../components/moment-share-card-modal";
import { parseTimestamp } from "../../../lib/format";
import { DesktopMomentComposePanel } from "./desktop-moment-compose-panel";
import {
  DesktopMomentRow,
  type MomentCommentReplyTarget,
} from "./desktop-moment-row";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";

type DesktopProfileMomentsWorkspaceProps = {
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  commentPendingMomentId: string | null;
  commentReplyTarget?: MomentCommentReplyTarget | null;
  composeErrorMessage?: string | null;
  createPending: boolean;
  deletePendingMomentId: string | null;
  deleteErrorMessage?: string | null;
  errors?: string[];
  imageDrafts: MomentImageDraft[];
  isLoading: boolean;
  likeErrorMessage?: string | null;
  likePendingMomentId: string | null;
  moments: Moment[];
  ownerAvatar?: string | null;
  ownerId: string | null;
  ownerName: string;
  showCompose: boolean;
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
  onDelete: (momentId: string) => void;
  onImageFilesSelected: (files: FileList | null) => void;
  onLike: (momentId: string) => void;
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

export function DesktopProfileMomentsWorkspace({
  commentDrafts,
  commentErrorMessage,
  commentPendingMomentId,
  commentReplyTarget = null,
  composeErrorMessage,
  createPending,
  deletePendingMomentId,
  deleteErrorMessage,
  errors = [],
  imageDrafts,
  isLoading,
  likeErrorMessage,
  likePendingMomentId,
  moments,
  ownerAvatar,
  ownerId,
  ownerName,
  showCompose,
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
  onDelete,
  onImageFilesSelected,
  onLike,
  onOpenLikerPopover,
  onRemoveImage,
  onRemoveVideo,
  onStartCommentReply,
  onTextChange,
  onToggleFavorite,
  onVideoFileSelected,
}: DesktopProfileMomentsWorkspaceProps) {
  const t = useRuntimeTranslator();
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

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

  function renderFeedContent() {
    if (isLoading) {
      return (
        <LoadingBlock
          label={t(msg`正在加载我的朋友圈`)}
          className="rounded-[20px] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
        />
      );
    }

    if (!sortedMoments.length) {
      return (
        <div className="mx-auto max-w-[560px] py-10">
          <EmptyState
            title={t(msg`还没有发布过朋友圈`)}
            description={t(msg`记录此刻，你的朋友圈会出现在这里。`)}
            action={
              <Button variant="primary" onClick={() => setShowCompose(true)}>
                {t(msg`发条朋友圈`)}
              </Button>
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
            commentDraft={commentDrafts[moment.id] ?? ""}
            commentLoading={commentPendingMomentId === moment.id}
            commentReplyTarget={
              commentReplyTarget?.postId === moment.id
                ? commentReplyTarget
                : null
            }
            deleteLoading={deletePendingMomentId === moment.id}
            likeLoading={likePendingMomentId === moment.id}
            moment={moment}
            ownerId={ownerId}
            favorite={isMomentFavorite(moment.id)}
            onCancelCommentReply={onCancelCommentReply}
            onCommentChange={(value) => onCommentChange(moment.id, value)}
            onCommentSubmit={() => onCommentSubmit(moment.id)}
            onDelete={() => onDelete(moment.id)}
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

  const displayName = ownerName?.trim() || t(msg`世界主人`);

  return (
    <div className="relative flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <section className="min-w-0 flex-1 bg-[rgba(245,248,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-4">
              <button
                type="button"
                onClick={onBack}
                aria-label={t(msg`返回上一页`)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
              >
                <ArrowLeft size={17} />
              </button>
              <div className="text-[15px] font-semibold text-[color:var(--text-primary)]">
                {t(msg`我的朋友圈`)}
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCompose(true)}
                className="shrink-0"
              >
                <PenSquare size={14} className="mr-1.5" />
                {t(msg`发朋友圈`)}
              </Button>
            </div>
          </div>

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto"
          >
            <section
              className="relative w-full bg-[rgba(245,248,247,0.96)]"
              style={{ height: 290 }}
            >
              <div
                className="absolute inset-x-0 top-0 overflow-hidden bg-[linear-gradient(135deg,#34a853_0%,#0f8b3a_55%,#085c25_100%)]"
                style={{ height: 260 }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.32),transparent_60%)]" />
              </div>
              <div className="absolute bottom-7 right-8 flex items-end gap-4">
                <div className="text-right text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
                  <div className="text-[18px] font-medium leading-tight">
                    {displayName}
                  </div>
                </div>
                <div className="translate-y-7">
                  <AvatarChip name={displayName} src={ownerAvatar} size="lg" />
                </div>
              </div>
            </section>

            <div className="mx-auto w-full max-w-[760px] px-7 pb-10 pt-12">
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

              {deleteErrorMessage ? (
                <div className="mb-4">
                  <ErrorBlock message={deleteErrorMessage} />
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
          ownerUsername={displayName}
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
        ownerId={ownerId}
        ownerDisplayName={displayName}
        onClose={() => setShareMomentId(null)}
      />
    </div>
  );
}
