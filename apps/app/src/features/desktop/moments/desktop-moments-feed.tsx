import { msg } from "@lingui/macro";
import {
  type Moment,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../../../components/empty-state";
import {
  DesktopMomentRow,
  type MomentCommentReplyTarget,
} from "./desktop-moment-row";

type DesktopMomentsFeedProps = {
  commentDrafts: Record<string, string>;
  commentPendingMomentId: string | null;
  commentReplyTarget?: MomentCommentReplyTarget | null;
  isLoading: boolean;
  likePendingMomentId: string | null;
  moments: Moment[];
  ownerId?: string | null;
  isMomentFavorite: (momentId: string) => boolean;
  onCancelCommentReply?: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onLike: (momentId: string) => void;
  /** 可选：点击行内「分享」时上抛，由调用方弹出分享图卡。 */
  onShare?: (momentId: string) => void;
  onStartCommentReply?: (comment: MomentComment) => void;
  onToggleFavorite: (momentId: string) => void;
  onOpenCompose: () => void;
  onSelectAuthor?: (input: {
    anchorElement: HTMLButtonElement;
    moment: Moment;
  }) => void;
  onSelectLiker?: (input: {
    anchorElement: HTMLButtonElement;
    moment: Moment;
    like: MomentLike;
  }) => void;
};

export function DesktopMomentsFeed({
  commentDrafts,
  commentPendingMomentId,
  commentReplyTarget = null,
  isLoading,
  likePendingMomentId,
  moments,
  ownerId,
  isMomentFavorite,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onShare,
  onStartCommentReply,
  onToggleFavorite,
  onOpenCompose,
  onSelectAuthor,
  onSelectLiker,
}: DesktopMomentsFeedProps) {
  const t = useRuntimeTranslator();
  return (
    <>
      {isLoading ? (
        <LoadingBlock
          label={t(msg`正在读取朋友圈...`)}
          className="rounded-[20px] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
        />
      ) : null}

      {!isLoading && moments.length > 0 ? (
        <div className="space-y-4 pb-6">
          {moments.map((moment) => (
            <DesktopMomentRow
              key={moment.id}
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
              onShare={onShare ? () => onShare(moment.id) : undefined}
              onStartCommentReply={onStartCommentReply}
              onToggleFavorite={() => onToggleFavorite(moment.id)}
              onSelectAuthor={
                moment.authorType === "character" && onSelectAuthor
                  ? (event) =>
                      onSelectAuthor({
                        anchorElement: event.currentTarget,
                        moment,
                      })
                  : undefined
              }
              onSelectLiker={
                onSelectLiker
                  ? (event, like) =>
                      onSelectLiker({
                        anchorElement: event.currentTarget,
                        moment,
                        like,
                      })
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}

      {!isLoading && !moments.length ? (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-[560px] items-center justify-center py-10">
          <EmptyState
            title={t(msg`朋友圈还很安静`)}
            description={t(msg`你先发一条，或者等世界里的其他人先开口。`)}
            action={
              <Button variant="primary" onClick={onOpenCompose}>
                {t(msg`发朋友圈`)}
              </Button>
            }
          />
        </div>
      ) : null}
    </>
  );
}
