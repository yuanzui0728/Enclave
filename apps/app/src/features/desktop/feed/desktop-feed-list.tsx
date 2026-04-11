import { type FeedPostListItem } from "@yinjie/contracts";
import { Button, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../../../components/empty-state";
import { DesktopFeedRow } from "./desktop-feed-row";

type DesktopFeedListProps = {
  commentDrafts: Record<string, string>;
  commentPendingPostId: string | null;
  isLoading: boolean;
  likePendingPostId: string | null;
  posts: FeedPostListItem[];
  selectedPostId: string | null;
  totalPostsCount: number;
  isPostFavorite: (postId: string) => boolean;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onToggleFavorite: (postId: string) => void;
  onOpenCompose: () => void;
  onOpenDetail: (postId: string) => void;
  onSelectAuthor: (authorId: string) => void;
};

export function DesktopFeedList({
  commentDrafts,
  commentPendingPostId,
  isLoading,
  likePendingPostId,
  posts,
  selectedPostId,
  totalPostsCount,
  isPostFavorite,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onToggleFavorite,
  onOpenCompose,
  onOpenDetail,
  onSelectAuthor,
}: DesktopFeedListProps) {
  return (
    <>
      {isLoading ? (
        <LoadingBlock
          label="正在读取广场动态..."
          className="rounded-[20px] border-black/6 bg-white py-10 shadow-[0_14px_36px_rgba(15,23,42,0.05)]"
        />
      ) : null}

      {!isLoading && posts.length > 0 ? (
        <div className="space-y-4 pb-6">
          {posts.map((post) => (
            <DesktopFeedRow
              key={post.id}
              active={post.id === selectedPostId}
              commentDraft={commentDrafts[post.id] ?? ""}
              commentLoading={commentPendingPostId === post.id}
              favorite={isPostFavorite(post.id)}
              likeLoading={likePendingPostId === post.id}
              post={post}
              onCommentChange={(value) => onCommentChange(post.id, value)}
              onCommentSubmit={() => onCommentSubmit(post.id)}
              onLike={() => onLike(post.id)}
              onOpenDetail={() => onOpenDetail(post.id)}
              onSelectAuthor={() => onSelectAuthor(post.authorId)}
              onToggleFavorite={() => onToggleFavorite(post.id)}
            />
          ))}
        </div>
      ) : null}

      {!isLoading && !posts.length ? (
        <div className="mx-auto max-w-[560px] py-10">
          <EmptyState
            title={totalPostsCount ? "当前筛选下没有动态" : "广场还没有新动态"}
            description={
              totalPostsCount
                ? "换个筛选条件试试，或者直接发一条新的公开动态。"
                : "你先发一条居民公开可见的动态，或者等世界里的居民先开口。"
            }
            action={
              <Button variant="primary" onClick={onOpenCompose}>
                发广场动态
              </Button>
            }
          />
        </div>
      ) : null}
    </>
  );
}
