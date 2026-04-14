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
          className="rounded-[20px] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
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
            title="广场还没有新动态"
            description="你先发一条居民公开可见的动态，或者等世界里的居民先开口。"
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
