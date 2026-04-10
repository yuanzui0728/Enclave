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
import {
  DesktopFeedToolbar,
  type DesktopFeedFilter,
  type DesktopFeedSort,
} from "./desktop-feed-toolbar";

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
  const [activeFilter, setActiveFilter] = useState<DesktopFeedFilter>("all");
  const [activeSort, setActiveSort] = useState<DesktopFeedSort>("latest");
  const [searchText, setSearchText] = useState("");
  const [activeAuthorId, setActiveAuthorId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

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

  const filteredPosts = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return posts.filter((post) => {
      if (activeAuthorId && post.authorId !== activeAuthorId) {
        return false;
      }

      if (!activeAuthorId && activeFilter === "owner" && post.authorType !== "user") {
        return false;
      }

      if (!activeAuthorId && activeFilter === "resident" && post.authorType !== "character") {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const commentText = post.commentsPreview
        .map((comment) => comment.text)
        .join(" ")
        .toLowerCase();

      return (
        post.authorName.toLowerCase().includes(keyword) ||
        post.text.toLowerCase().includes(keyword) ||
        commentText.includes(keyword)
      );
    });
  }, [activeAuthorId, activeFilter, posts, searchText]);
  const sortedPosts = useMemo(
    () => [...filteredPosts].sort(createFeedPostSorter(activeSort)),
    [activeSort, filteredPosts],
  );

  const activeAuthorSummary =
    authorSummaries.find((author) => author.authorId === activeAuthorId) ?? null;
  const authorPosts = useMemo(() => {
    if (!activeAuthorId) {
      return [];
    }

    return posts
      .filter((post) => post.authorId === activeAuthorId)
      .sort(createFeedPostSorter(activeSort));
  }, [activeAuthorId, activeSort, posts]);

  const filteredCountLabel = useMemo(() => {
    if (activeAuthorSummary) {
      return `${activeAuthorSummary.authorName} · ${sortedPosts.length} 条`;
    }

    if (searchText.trim()) {
      return `搜索结果 ${sortedPosts.length} 条`;
    }

    switch (activeFilter) {
      case "owner":
        return `只看我 · ${sortedPosts.length} 条`;
      case "resident":
        return `只看居民 · ${sortedPosts.length} 条`;
      default:
        return `当前展示 ${sortedPosts.length} 条`;
    }
  }, [activeAuthorSummary, activeFilter, searchText, sortedPosts.length]);
  const currentSortLabel = useMemo(() => {
    switch (activeSort) {
      case "discussion":
        return "按讨论度排序，优先展示评论和互动更密集的动态。";
      case "ai-active":
        return "按 AI 在场排序，优先展示已经进入居民回应链的动态。";
      default:
        return "按最新发布排序，优先展示刚刚出现在公开流里的发言。";
    }
  }, [activeSort]);

  const currentFilterLabel = useMemo(() => {
    if (activeAuthorSummary) {
      return `当前正在看 ${activeAuthorSummary.authorName} 的公开动态，共 ${sortedPosts.length} 条。`;
    }

    if (searchText.trim()) {
      return `搜索词“${searchText.trim()}”匹配到 ${sortedPosts.length} 条公开动态。`;
    }

    if (activeFilter === "owner") {
      return `当前只展示世界主人发到公开流的动态。`;
    }

    if (activeFilter === "resident") {
      return `当前只展示世界居民的公开动态。`;
    }

    return `当前展示整个世界的公开流，包括世界主人与居民的发言。`;
  }, [activeAuthorSummary, activeFilter, searchText, sortedPosts.length]);

  useEffect(() => {
    if (
      selectedPostId &&
      !sortedPosts.some((post) => post.id === selectedPostId)
    ) {
      setSelectedPostId(null);
    }
  }, [sortedPosts, selectedPostId]);

  useEffect(() => {
    if (!activeAuthorId) {
      return;
    }

    if (!authorSummaries.some((author) => author.authorId === activeAuthorId)) {
      setActiveAuthorId(null);
    }
  }, [activeAuthorId, authorSummaries]);

  const sidebarMode = selectedPostId
    ? "detail"
    : activeAuthorSummary
      ? "author"
      : "summary";
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
    return posts.filter((post) => (parseTimestamp(post.createdAt) ?? 0) >= cutoff).length;
  }, [posts]);
  const activeResidentSummary = useMemo(() => {
    const residents = authorSummaries.filter((author) => author.authorType === "character");
    if (!residents.length) {
      return null;
    }

    return [...residents].sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      if (right.commentCount !== left.commentCount) {
        return right.commentCount - left.commentCount;
      }

      return (parseTimestamp(right.latestCreatedAt) ?? 0) - (parseTimestamp(left.latestCreatedAt) ?? 0);
    })[0] ?? null;
  }, [authorSummaries]);

  function focusAuthor(authorId: string) {
    setActiveFilter("all");
    setActiveAuthorId(authorId);
    setSelectedPostId(null);
  }

  return (
    <div className="relative flex h-full min-h-0 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(248,249,255,0.96))]">
      <section className="min-w-0 flex-1 border-r border-[rgba(15,23,42,0.06)]">
        <div className="flex h-full min-h-0 flex-col">
          <DesktopFeedToolbar
            activeFilter={activeFilter}
            activeSort={activeSort}
            commentErrorMessage={commentErrorMessage}
            errors={errors}
            filteredCountLabel={filteredCountLabel}
            likeErrorMessage={likeErrorMessage}
            searchText={searchText}
            selectedAuthorName={activeAuthorSummary?.authorName ?? null}
            successNotice={successNotice}
            onBackToTop={() => {
              scrollViewportRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
            onClearAuthor={() => setActiveAuthorId(null)}
            onFilterChange={setActiveFilter}
            onOpenCompose={() => setShowCompose(true)}
            onRefresh={onRefresh}
            onSearchChange={setSearchText}
            onSortChange={setActiveSort}
          />

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-6 py-5"
          >
            <div className="mx-auto w-full max-w-[720px]">
              <DesktopFeedList
                commentDrafts={commentDrafts}
                commentPendingPostId={commentPendingPostId}
                isLoading={isLoading}
                likePendingPostId={likePendingPostId}
                posts={sortedPosts}
                selectedPostId={selectedPostId}
                totalPostsCount={posts.length}
                isPostFavorite={isPostFavorite}
                onCommentChange={onCommentChange}
                onCommentSubmit={onCommentSubmit}
                onLike={onLike}
                onToggleFavorite={onToggleFavorite}
                onOpenCompose={() => setShowCompose(true)}
                onOpenDetail={setSelectedPostId}
                onSelectAuthor={focusAuthor}
              />
            </div>
          </div>
        </div>
      </section>

      <DesktopFeedSidebar
        activeAuthorId={activeAuthorId}
        activeAuthorSummary={activeAuthorSummary}
        authorPosts={authorPosts}
        authorSummaries={authorSummaries}
        commentDrafts={commentDrafts}
        commentPendingPostId={commentPendingPostId}
        currentFilterLabel={currentFilterLabel}
        currentSortLabel={currentSortLabel}
        detailErrorMessage={
          selectedPostQuery.isError && selectedPostQuery.error instanceof Error
            ? selectedPostQuery.error.message
            : null
        }
        detailLoading={selectedPostQuery.isLoading}
        likePendingPostId={likePendingPostId}
        mode={sidebarMode}
        ownerAvatar={ownerAvatar}
        ownerUsername={ownerUsername}
        activeResidentSummary={activeResidentSummary}
        aiReactedPostsCount={aiReactedPostsCount}
        ownerPostsCount={ownerPostsCount}
        recentPostsCount={recentPostsCount}
        residentPostsCount={residentPostsCount}
        selectedPost={selectedPostQuery.data ?? null}
        selectedPostId={selectedPostId}
        totalPostsCount={posts.length}
        visiblePostsCount={sortedPosts.length}
        isPostFavorite={isPostFavorite}
        onClearAuthor={() => setActiveAuthorId(null)}
        onCloseDetail={() => setSelectedPostId(null)}
        onCommentChange={onCommentChange}
        onCommentSubmit={onCommentSubmit}
        onLike={onLike}
        onOpenCompose={() => setShowCompose(true)}
        onSelectAuthor={focusAuthor}
        onSelectPost={setSelectedPostId}
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

function createFeedPostSorter(activeSort: DesktopFeedSort) {
  return (left: FeedPostListItem, right: FeedPostListItem) => {
    switch (activeSort) {
      case "discussion": {
        if (right.commentCount !== left.commentCount) {
          return right.commentCount - left.commentCount;
        }

        if (right.likeCount !== left.likeCount) {
          return right.likeCount - left.likeCount;
        }

        return (parseTimestamp(right.createdAt) ?? 0) - (parseTimestamp(left.createdAt) ?? 0);
      }
      case "ai-active": {
        if (Number(right.aiReacted) !== Number(left.aiReacted)) {
          return Number(right.aiReacted) - Number(left.aiReacted);
        }

        if (right.commentCount !== left.commentCount) {
          return right.commentCount - left.commentCount;
        }

        return (parseTimestamp(right.createdAt) ?? 0) - (parseTimestamp(left.createdAt) ?? 0);
      }
      default:
        return (parseTimestamp(right.createdAt) ?? 0) - (parseTimestamp(left.createdAt) ?? 0);
    }
  };
}
