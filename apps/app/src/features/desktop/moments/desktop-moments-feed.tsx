import { type Moment } from "@yinjie/contracts";
import { Button, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../../../components/empty-state";
import { DesktopMomentRow } from "./desktop-moment-row";

type DesktopMomentsFeedProps = {
  activeAuthorId: string | null;
  activeAuthorName?: string | null;
  commentDrafts: Record<string, string>;
  commentPendingMomentId: string | null;
  isLoading: boolean;
  likePendingMomentId: string | null;
  moments: Moment[];
  ownerId?: string | null;
  searchText: string;
  selectedMomentId: string | null;
  totalMomentsCount: number;
  isMomentFavorite: (momentId: string) => boolean;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onClearAuthor: () => void;
  onLike: (momentId: string) => void;
  onToggleFavorite: (momentId: string) => void;
  onOpenCompose: () => void;
  onOpenDetail: (momentId: string) => void;
  onSelectAuthor: (authorId: string) => void;
};

export function DesktopMomentsFeed({
  activeAuthorId,
  activeAuthorName,
  commentDrafts,
  commentPendingMomentId,
  isLoading,
  likePendingMomentId,
  moments,
  ownerId,
  searchText,
  selectedMomentId,
  totalMomentsCount,
  isMomentFavorite,
  onCommentChange,
  onCommentSubmit,
  onClearAuthor,
  onLike,
  onToggleFavorite,
  onOpenCompose,
  onOpenDetail,
  onSelectAuthor,
}: DesktopMomentsFeedProps) {
  const hasAuthorFocus = Boolean(activeAuthorId);
  const hasSearchText = Boolean(searchText.trim());

  return (
    <>
      {isLoading ? (
        <LoadingBlock
          label="正在读取朋友圈..."
          className="rounded-[20px] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
        />
      ) : null}

      {!isLoading && moments.length > 0 ? (
        <div className="space-y-4 pb-6">
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
        <div className="mx-auto max-w-[560px] py-10">
          <EmptyState
            title={
              hasAuthorFocus && !hasSearchText
                ? activeAuthorName
                  ? `${activeAuthorName} 还没有发表朋友圈`
                  : "当前无法查看这个联系人的朋友圈"
                : totalMomentsCount
                  ? "当前筛选下没有动态"
                  : "朋友圈还很安静"
            }
            description={
              hasAuthorFocus && !hasSearchText
                ? activeAuthorName
                  ? "后续有新动态时，会直接出现在这里。"
                  : "这个联系人暂时没有可展示的朋友圈内容，稍后可以再回来看看。"
                : totalMomentsCount
                  ? "换个筛选条件试试，或者直接发一条新的朋友圈。"
                  : "你先发一条，或者等世界里的其他人先开口。"
            }
            action={
              hasAuthorFocus && !hasSearchText ? (
                <div className="flex items-center justify-center gap-2">
                  <Button variant="secondary" onClick={onClearAuthor}>
                    查看全部朋友圈
                  </Button>
                  <Button variant="primary" onClick={onOpenCompose}>
                    发朋友圈
                  </Button>
                </div>
              ) : (
                <Button variant="primary" onClick={onOpenCompose}>
                  发朋友圈
                </Button>
              )
            }
          />
        </div>
      ) : null}
    </>
  );
}
