import { type Moment } from "@yinjie/contracts";
import { Button, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../../../components/empty-state";
import { DesktopMomentRow } from "./desktop-moment-row";

type DesktopMomentsFeedProps = {
  commentDrafts: Record<string, string>;
  commentPendingMomentId: string | null;
  isLoading: boolean;
  likePendingMomentId: string | null;
  moments: Moment[];
  ownerId?: string | null;
  selectedMomentId: string | null;
  totalMomentsCount: number;
  isMomentFavorite: (momentId: string) => boolean;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onLike: (momentId: string) => void;
  onToggleFavorite: (momentId: string) => void;
  onOpenCompose: () => void;
  onOpenDetail: (momentId: string) => void;
  onSelectAuthor: (authorId: string) => void;
};

export function DesktopMomentsFeed({
  commentDrafts,
  commentPendingMomentId,
  isLoading,
  likePendingMomentId,
  moments,
  ownerId,
  selectedMomentId,
  totalMomentsCount,
  isMomentFavorite,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onToggleFavorite,
  onOpenCompose,
  onOpenDetail,
  onSelectAuthor,
}: DesktopMomentsFeedProps) {
  return (
    <>
      {isLoading ? <LoadingBlock label="正在读取朋友圈..." /> : null}

      {!isLoading && moments.length > 0 ? (
        <div className="space-y-3">
          {moments.map((moment) => (
            <DesktopMomentRow
              key={moment.id}
              active={moment.id === selectedMomentId}
              commentDraft={commentDrafts[moment.id] ?? ""}
              commentLoading={commentPendingMomentId === moment.id}
              likeLoading={likePendingMomentId === moment.id}
              moment={moment}
              ownerId={ownerId}
              favorite={isMomentFavorite(moment.id)}
              onCommentChange={(value) => onCommentChange(moment.id, value)}
              onCommentSubmit={() => onCommentSubmit(moment.id)}
              onLike={() => onLike(moment.id)}
              onToggleFavorite={() => onToggleFavorite(moment.id)}
              onOpenDetail={() => onOpenDetail(moment.id)}
              onSelectAuthor={() => onSelectAuthor(moment.authorId)}
            />
          ))}
        </div>
      ) : null}

      {!isLoading && !moments.length ? (
        <EmptyState
          title={totalMomentsCount ? "当前筛选下没有动态" : "朋友圈还很安静"}
          description={
            totalMomentsCount
              ? "换个筛选条件试试，或者直接发一条新的朋友圈。"
              : "你先发一条，或者等世界里的其他人先开口。"
          }
          action={
            <Button variant="primary" onClick={onOpenCompose}>
              发朋友圈
            </Button>
          }
        />
      ) : null}
    </>
  );
}
