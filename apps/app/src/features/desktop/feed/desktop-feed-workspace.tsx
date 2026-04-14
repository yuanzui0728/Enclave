import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFeedPost, type FeedPostListItem } from "@yinjie/contracts";
import { parseTimestamp } from "../../../lib/format";
import { DesktopFeedComposePanel } from "./desktop-feed-compose-panel";
import { DesktopFeedList } from "./desktop-feed-list";
import {
  DesktopFeedSidebar,
  type DesktopFeedAuthorSummary,
} from "./desktop-feed-sidebar";
import { DesktopFeedToolbar } from "./desktop-feed-toolbar";

type DesktopFeedWorkspaceProps = {
  baseUrl?: string;
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  commentPendingPostId: string | null;
  composeErrorMessage?: string | null;
  createPending: boolean;
  errors?: string[];
  isLoading: boolean;
  likeErrorMessage?: string | null;
  likePendingPostId: string | null;
  ownerAvatar?: string | null;
  ownerUsername?: string | null;
  posts: FeedPostListItem[];
  routeSelectedPostId?: string | null;
  showCompose: boolean;
  successNotice?: string;
  text: string;
  isPostFavorite: (postId: string) => boolean;
  setShowCompose: (nextValue: boolean) => void;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onCreate: () => void;
  onLike: (postId: string) => void;
  onRefresh: () => void;
  onTextChange: (value: string) => void;
  onToggleFavorite: (postId: string) => void;
};

export function DesktopFeedWorkspace({
  baseUrl,
  commentDrafts,
  commentErrorMessage,
  commentPendingPostId,
  composeErrorMessage,
  createPending,
  errors = [],
  isLoading,
  likeErrorMessage,
  likePendingPostId,
  ownerAvatar,
  ownerUsername,
  posts,
  routeSelectedPostId = null,
  showCompose,
  successNotice,
  text,
  isPostFavorite,
  setShowCompose,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onLike,
  onRefresh,
  onTextChange,
  onToggleFavorite,
}: DesktopFeedWorkspaceProps) {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedPostId((current) =>
      current === routeSelectedPostId ? current : routeSelectedPostId,
    );
  }, [routeSelectedPostId]);

  const selectedPostQuery = useQuery({
    queryKey: ["app-feed-post", baseUrl, selectedPostId],
    queryFn: async () => {
      if (!selectedPostId) {
        return null;
      }

      return (await getFeedPost(selectedPostId, baseUrl)) ?? null;
    },
    enabled: Boolean(selectedPostId),
  });

  const authorSummaries = useMemo(() => {
    const map = new Map<string, Omit<DesktopFeedAuthorSummary, "authorId">>();

    posts.forEach((post) => {
      const current = map.get(post.authorId);
      if (current) {
        current.count += 1;
        current.commentCount += post.commentCount;
        current.aiReactionCount += post.aiReacted ? 1 : 0;
        if (current.latestCreatedAt < post.createdAt) {
          current.latestCreatedAt = post.createdAt;
        }
        return;
      }

      map.set(post.authorId, {
        authorAvatar: post.authorAvatar,
        authorName: post.authorName,
        authorType: post.authorType,
        aiReactionCount: post.aiReacted ? 1 : 0,
        commentCount: post.commentCount,
        count: 1,
        latestCreatedAt: post.createdAt,
      });
    });

    return Array.from(map.entries())
      .map(([authorId, summary]) => ({
        authorId,
        ...summary,
      }))
      .sort(
        (left, right) =>
          (parseTimestamp(right.latestCreatedAt) ?? 0) -
          (parseTimestamp(left.latestCreatedAt) ?? 0),
      );
  }, [posts]);

  useEffect(() => {
    if (selectedPostId && !posts.some((post) => post.id === selectedPostId)) {
      setSelectedPostId(null);
    }
  }, [posts, selectedPostId]);

  const residentPostsCount = useMemo(
    () => posts.filter((post) => post.authorType === "character").length,
    [posts],
  );
  const ownerPostsCount = useMemo(
    () => posts.filter((post) => post.authorType === "user").length,
    [posts],
  );
  const aiReactedPostsCount = useMemo(
    () => posts.filter((post) => post.aiReacted).length,
    [posts],
  );
  const recentPostsCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return posts.filter(
      (post) => (parseTimestamp(post.createdAt) ?? 0) >= cutoff,
    ).length;
  }, [posts]);

  return (
    <div className="relative flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <section className="min-w-0 flex-1 border-r border-[color:var(--border-faint)] bg-[rgba(245,248,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <DesktopFeedToolbar
            commentErrorMessage={commentErrorMessage}
            errors={errors}
            likeErrorMessage={likeErrorMessage}
            successNotice={successNotice}
            totalCount={posts.length}
            onBackToTop={() => {
              scrollViewportRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
            onOpenCompose={() => setShowCompose(true)}
            onRefresh={onRefresh}
          />

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-7 py-6"
          >
            <div className="mx-auto w-full max-w-[760px]">
              <DesktopFeedList
                commentDrafts={commentDrafts}
                commentPendingPostId={commentPendingPostId}
                isLoading={isLoading}
                likePendingPostId={likePendingPostId}
                posts={posts}
                selectedPostId={selectedPostId}
                isPostFavorite={isPostFavorite}
                onCommentChange={onCommentChange}
                onCommentSubmit={onCommentSubmit}
                onLike={onLike}
                onToggleFavorite={onToggleFavorite}
                onOpenCompose={() => setShowCompose(true)}
                onOpenDetail={setSelectedPostId}
              />
            </div>
          </div>
        </div>
      </section>

      <DesktopFeedSidebar
        authorSummaries={authorSummaries}
        commentDrafts={commentDrafts}
        commentPendingPostId={commentPendingPostId}
        detailErrorMessage={
          selectedPostQuery.isError && selectedPostQuery.error instanceof Error
            ? selectedPostQuery.error.message
            : null
        }
        detailLoading={selectedPostQuery.isLoading}
        likePendingPostId={likePendingPostId}
        mode={selectedPostId ? "detail" : "summary"}
        ownerAvatar={ownerAvatar}
        ownerPostsCount={ownerPostsCount}
        ownerUsername={ownerUsername}
        recentPostsCount={recentPostsCount}
        residentPostsCount={residentPostsCount}
        selectedPost={selectedPostQuery.data ?? null}
        selectedPostId={selectedPostId}
        totalPostsCount={posts.length}
        aiReactedPostsCount={aiReactedPostsCount}
        isPostFavorite={isPostFavorite}
        onCloseDetail={() => setSelectedPostId(null)}
        onCommentChange={onCommentChange}
        onCommentSubmit={onCommentSubmit}
        onLike={onLike}
        onOpenCompose={() => setShowCompose(true)}
        onToggleFavorite={onToggleFavorite}
      />

      {showCompose ? (
        <DesktopFeedComposePanel
          createPending={createPending}
          errorMessage={composeErrorMessage}
          ownerAvatar={ownerAvatar}
          ownerUsername={ownerUsername}
          text={text}
          onClose={() => setShowCompose(false)}
          onCreate={onCreate}
          onTextChange={onTextChange}
        />
      ) : null}
    </div>
  );
}
