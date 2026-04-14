import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { FeedComment, FeedPostListItem } from "@yinjie/contracts";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import {
  Bookmark,
  Clapperboard,
  MessageCircleMore,
  PlaySquare,
  RadioTower,
  RefreshCcw,
  ThumbsUp,
} from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import {
  hydrateLiveCompanionFromNative,
  readLiveDraft,
  readLiveHistory,
  type LiveDraft,
  type LiveSessionRecord,
} from "./live-companion-storage";
import { formatTimestamp } from "../../../lib/format";

type DesktopChannelsWorkspaceProps = {
  comments: FeedComment[];
  commentsErrorMessage?: string | null;
  commentsLoading: boolean;
  commentDrafts: Record<string, string>;
  commentLikePendingId: string | null;
  commentPendingPostId: string | null;
  commentReplyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  errorMessage?: string | null;
  isLoading: boolean;
  likePendingPostId: string | null;
  posts: FeedPostListItem[];
  routeSelectedPostId?: string | null;
  successNotice?: string;
  isPostFavorite: (postId: string) => boolean;
  onCancelCommentReply: () => void;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onRefresh: () => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSelectedPostChange: (postId: string | null) => void;
  onToggleFollowAuthor: (post: FeedPostListItem) => void;
  onToggleFavorite: (post: FeedPostListItem) => void;
  onViewPost: (postId: string) => void;
};

export function DesktopChannelsWorkspace({
  comments,
  commentsErrorMessage,
  commentsLoading,
  commentDrafts,
  commentLikePendingId,
  commentPendingPostId,
  commentReplyTarget,
  errorMessage,
  isLoading,
  likePendingPostId,
  posts,
  routeSelectedPostId = null,
  successNotice,
  isPostFavorite,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onLikeComment,
  onRefresh,
  onReplyToComment,
  onSelectedPostChange,
  onToggleFollowAuthor,
  onToggleFavorite,
  onViewPost,
}: DesktopChannelsWorkspaceProps) {
  const navigate = useNavigate();
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [liveDraft, setLiveDraft] = useState<LiveDraft>(() => readLiveDraft());
  const [liveHistory, setLiveHistory] = useState<LiveSessionRecord[]>(() =>
    readLiveHistory(),
  );

  useEffect(() => {
    setSelectedPostId((current) =>
      current === routeSelectedPostId ? current : routeSelectedPostId,
    );
  }, [routeSelectedPostId]);

  useEffect(() => {
    if (!posts.length) {
      setSelectedPostId(null);
      return;
    }

    if (!selectedPostId || !posts.some((post) => post.id === selectedPostId)) {
      setSelectedPostId(posts[0]?.id ?? null);
    }
  }, [posts, selectedPostId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    const syncLiveCompanionState = async () => {
      const store = await hydrateLiveCompanionFromNative();
      if (cancelled) {
        return;
      }

      setLiveDraft(store.draft);
      setLiveHistory(store.history);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncLiveCompanionState();
      }
    };

    const handleFocus = () => {
      void syncLiveCompanionState();
    };

    void syncLiveCompanionState();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const selectedPost =
    posts.find((post) => post.id === selectedPostId) ?? posts[0] ?? null;
  const activeLiveSession =
    liveHistory.find((item) => item.status === "live") ?? null;
  const liveCompanionReferencePostId =
    activeLiveSession?.channelPostId ?? liveDraft.referencePostId;
  const liveCompanionReferencePost =
    posts.find((post) => post.id === liveCompanionReferencePostId) ?? null;
  const nextPosts = useMemo(
    () => posts.filter((post) => post.id !== selectedPost?.id),
    [posts, selectedPost?.id],
  );
  const selectedSidebarItemClassName =
    "border-[rgba(7,193,96,0.12)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary),0_8px_18px_rgba(15,23,42,0.04)]";
  const activeFavoriteActionClassName =
    "border-[rgba(180,123,23,0.18)] bg-white text-[color:var(--text-primary)] shadow-[inset_0_-2px_0_0_rgba(180,123,23,0.78)]";
  const authorSummaries = useMemo(() => {
    const map = new Map<
      string,
      { avatar: string; count: number; latestCreatedAt: string; name: string }
    >();

    posts.forEach((post) => {
      const current = map.get(post.authorId);
      if (current) {
        current.count += 1;
        if (current.latestCreatedAt < post.createdAt) {
          current.latestCreatedAt = post.createdAt;
        }
        return;
      }

      map.set(post.authorId, {
        avatar: post.authorAvatar,
        count: 1,
        latestCreatedAt: post.createdAt,
        name: post.authorName,
      });
    });

    return Array.from(map.entries())
      .map(([authorId, summary]) => ({
        authorId,
        ...summary,
      }))
      .sort((left, right) =>
        right.latestCreatedAt.localeCompare(left.latestCreatedAt),
      );
  }, [posts]);

  useEffect(() => {
    onSelectedPostChange(selectedPost?.id ?? null);

    if (!selectedPost?.id) {
      return;
    }

    onViewPost(selectedPost.id);
  }, [onSelectedPostChange, onViewPost, selectedPost?.id]);

  return (
    <div className="flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <aside className="flex w-[292px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
        <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-5 py-5 backdrop-blur-xl">
          <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
            Channels
          </div>
          <div className="mt-2 text-[22px] font-semibold text-[color:var(--text-primary)]">
            视频号
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            桌面版按微信频道工作区组织 AI
            生成短视频，左边浏览，右边持续接住评论和下一条推荐。
          </div>
        </div>

        <div className="space-y-4 overflow-auto px-4 py-4">
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="text-xs text-[color:var(--text-muted)]">
              当前节奏
            </div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
              推荐流 {posts.length} 条
            </div>
            {selectedPost ? (
              <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                当前播放：{selectedPost.authorName} ·{" "}
                {formatTimestamp(selectedPost.createdAt)}
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={onRefresh}>
                <RefreshCcw size={14} />
                换一批
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  void navigate({ to: "/desktop/channels/live-companion" })
                }
              >
                <RadioTower size={14} />
                直播伴侣
              </Button>
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                直播伴侣状态
              </div>
              <Clapperboard
                size={16}
                className="text-[color:var(--brand-primary)]"
              />
            </div>
            <div className="mt-2 text-sm leading-6 text-[color:var(--text-primary)]">
              {activeLiveSession?.title ||
                liveDraft.title.trim() ||
                "还没有直播准备稿"}
            </div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
              {activeLiveSession
                ? `直播中 · ${resolveLiveModeLabel(activeLiveSession.mode)} · ${resolveLiveQualityLabel(activeLiveSession.quality)}`
                : liveDraft.title.trim()
                  ? `准备中 · ${resolveLiveModeLabel(liveDraft.mode)} · ${resolveLiveQualityLabel(liveDraft.quality)}`
                  : "从直播伴侣挑一条内容后，这里会回带当前准备状态。"}
            </div>
            {liveCompanionReferencePost ? (
              <div className="mt-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3">
                <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
                  当前参考内容
                </div>
                <div className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--text-primary)]">
                  {liveCompanionReferencePost.text}
                </div>
                <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                  {liveCompanionReferencePost.authorName} ·{" "}
                  {formatTimestamp(liveCompanionReferencePost.createdAt)}
                </div>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  void navigate({ to: "/desktop/channels/live-companion" })
                }
              >
                <RadioTower size={14} />
                打开伴侣
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!liveCompanionReferencePost}
                onClick={() => {
                  if (liveCompanionReferencePost) {
                    setSelectedPostId(liveCompanionReferencePost.id);
                  }
                }}
              >
                定位参考内容
              </Button>
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              推荐作者
            </div>
            <div className="mt-3 space-y-2">
              {authorSummaries.map((author) => (
                <button
                  key={author.authorId}
                  type="button"
                  onClick={() => {
                    const nextPost = posts.find(
                      (post) => post.authorId === author.authorId,
                    );
                    if (nextPost) {
                      setSelectedPostId(nextPost.id);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition",
                    selectedPost?.authorId === author.authorId
                      ? selectedSidebarItemClassName
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
                  )}
                >
                  <AvatarChip name={author.name} src={author.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                      {author.name}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {author.count} 条内容 · 最近更新于{" "}
                      {formatTimestamp(author.latestCreatedAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                内容队列
              </div>
              <div className="text-xs text-[color:var(--text-muted)]">
                最近更新
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {posts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setSelectedPostId(post.id)}
                  className={cn(
                    "w-full rounded-[18px] border px-3 py-3 text-left transition",
                    selectedPost?.id === post.id
                      ? selectedSidebarItemClassName
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
                  )}
                >
                  <div className="line-clamp-2 text-sm leading-6 text-[color:var(--text-primary)]">
                    {post.text}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
                    <span>{post.authorName}</span>
                    <span>·</span>
                    <span>{formatTimestamp(post.createdAt)}</span>
                    {post.id === liveCompanionReferencePostId ? (
                      <>
                        <span>·</span>
                        <span className="rounded-md border border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)]">
                          直播参考
                        </span>
                      </>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-6 py-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
                AI 视频流
              </div>
              <div className="mt-1 text-[20px] font-semibold text-[color:var(--text-primary)]">
                推荐内容持续播放，右侧承接互动和下一条
              </div>
              <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
                首轮先只接 AI 生成内容与视频，不混入普通聊天域。
              </div>
            </div>
            {successNotice ? (
              <InlineNotice
                tone="success"
                className="border-[color:var(--border-faint)] bg-white"
              >
                {successNotice}
              </InlineNotice>
            ) : null}
          </div>
          {errorMessage ? (
            <div className="mt-4">
              <ErrorBlock message={errorMessage} />
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          {isLoading ? <LoadingBlock label="正在读取视频号内容..." /> : null}

          {!isLoading && !posts.length ? (
            <EmptyState
              title="视频号还没有内容"
              description="先等系统注入 AI 演示内容，或者后续接入真实生成视频后再回来查看。"
            />
          ) : null}

          {!isLoading && selectedPost ? (
            <div className="mx-auto max-w-[860px] space-y-5">
              <article className="overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
                <div className="relative bg-[#0f1115]">
                  <video
                    key={selectedPost.id}
                    src={selectedPost.mediaUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="mx-auto block max-h-[620px] w-full bg-black object-contain"
                  />
                  <div className="pointer-events-none absolute left-5 top-5 rounded-md bg-[rgba(15,23,42,0.68)] px-3 py-1 text-[11px] font-medium text-white">
                    视频号推荐
                  </div>
                </div>

                  <div className="space-y-5 px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            void navigate({
                              to: "/channels/authors/$authorId",
                              params: { authorId: selectedPost.authorId },
                            })
                          }
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <AvatarChip
                            name={selectedPost.authorName}
                            src={selectedPost.authorAvatar}
                            size="wechat"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-base font-semibold text-[color:var(--text-primary)]">
                              {selectedPost.authorName}
                            </div>
                            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                              {formatTimestamp(selectedPost.createdAt)} ·{" "}
                              {formatChannelMeta(selectedPost)}
                            </div>
                          </div>
                        </button>
                        <Button
                          variant={selectedPost.ownerState?.isFollowingAuthor ? "secondary" : "primary"}
                          size="sm"
                          onClick={() => onToggleFollowAuthor(selectedPost)}
                          className={selectedPost.ownerState?.isFollowingAuthor
                            ? "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                            : "bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"}
                        >
                          {selectedPost.ownerState?.isFollowingAuthor ? "已关注" : "+关注"}
                        </Button>
                      </div>
                      {selectedPost.title ? (
                        <div className="mt-4 text-[18px] font-semibold text-[color:var(--text-primary)]">
                          {selectedPost.title}
                        </div>
                      ) : null}
                      <div className="mt-4 text-[15px] leading-8 text-[color:var(--text-primary)]">
                        {selectedPost.text}
                      </div>
                      {selectedPost.topicTags?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedPost.topicTags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onLike(selectedPost.id)}
                        disabled={likePendingPostId === selectedPost.id}
                        className="border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                      >
                        <ThumbsUp size={15} />
                        {likePendingPostId === selectedPost.id
                          ? "处理中..."
                          : `${selectedPost.likeCount} 赞`}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedPostId(selectedPost.id)}
                        className="border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                      >
                        <MessageCircleMore size={15} />
                        {selectedPost.commentCount} 评论
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onToggleFavorite(selectedPost)}
                        className={isPostFavorite(selectedPost.id)
                          ? activeFavoriteActionClassName
                          : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"}
                      >
                        <Bookmark size={15} />
                        {isPostFavorite(selectedPost.id) ? "取消收藏" : "收藏"}
                      </Button>
                    </div>
                  </div>

                  <div className="border-t border-[color:var(--border-faint)] px-6 py-4">
                    <div className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
                      <span>完整评论面板已收进右侧，可以直接回复、点赞和发送。</span>
                      <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px]">
                        {selectedPost.commentCount} 条评论
                      </span>
                    </div>
                    <div className="mt-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3 text-[12px] leading-6 text-[color:var(--text-secondary)]">
                      右侧评论面板会展示完整评论链路，并持续接住当前内容的回复与互动。
                    </div>
                  </div>
                </div>
              </article>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="flex w-[320px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
        <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-5 py-4 backdrop-blur-xl">
          <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
            互动侧栏
          </div>
          <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
            评论与下一条
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                当前内容
              </div>
              <PlaySquare
                size={16}
                className="text-[color:var(--brand-primary)]"
              />
            </div>
            {selectedPost ? (
              <>
                <div className="mt-3 text-sm leading-7 text-[color:var(--text-primary)]">
                  {selectedPost.text}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[color:var(--text-muted)]">
                  <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1">
                    {selectedPost.likeCount} 赞
                  </span>
                  <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1">
                    {selectedPost.commentCount} 评论
                  </span>
                </div>
              </>
            ) : null}
          </div>

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  评论面板
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  当前内容下的完整评论列表与回复输入区
                </div>
              </div>
              <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                {selectedPost?.commentCount ?? 0} 条
              </span>
            </div>
            {commentsErrorMessage ? (
              <div className="mt-3">
                <ErrorBlock message={commentsErrorMessage} />
              </div>
            ) : null}
            <DesktopChannelCommentsPanel
              comments={comments}
              commentsLoading={commentsLoading}
              draft={selectedPost ? commentDrafts[selectedPost.id] ?? "" : ""}
              likePendingCommentId={commentLikePendingId}
              replyTarget={commentReplyTarget}
              selectedPost={selectedPost}
              submitPending={commentPendingPostId === selectedPost?.id}
              onCancelReply={onCancelCommentReply}
              onDraftChange={(value) => {
                if (!selectedPost) {
                  return;
                }

                onCommentChange(selectedPost.id, value);
              }}
              onLikeComment={onLikeComment}
              onReplyToComment={onReplyToComment}
              onSubmit={() => {
                if (!selectedPost) {
                  return;
                }

                onCommentSubmit(selectedPost.id);
              }}
            />
          </div>

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                下一条推荐
              </div>
              <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                {nextPosts.slice(0, 5).length} 条
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {nextPosts.slice(0, 5).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setSelectedPostId(post.id)}
                  className="w-full rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-left transition-[background-color,box-shadow] hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                >
                  <div className="line-clamp-2 text-sm leading-6 text-[color:var(--text-primary)]">
                    {post.text}
                  </div>
                  <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                    {post.authorName} · {formatTimestamp(post.createdAt)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function resolveLiveModeLabel(
  mode: LiveDraft["mode"] | LiveSessionRecord["mode"],
) {
  if (mode === "product") {
    return "产品讲解";
  }

  if (mode === "story") {
    return "剧情陪看";
  }

  return "单人控台";
}

function resolveLiveQualityLabel(
  quality: LiveDraft["quality"] | LiveSessionRecord["quality"],
) {
  if (quality === "standard") {
    return "标准";
  }

  if (quality === "ultra") {
    return "超清";
  }

  return "高清";
}

function formatChannelMeta(post: FeedPostListItem) {
  const pieces = [`${post.viewCount ?? 0} 播放`];

  if (typeof post.durationMs === "number" && post.durationMs > 0) {
    pieces.push(`${Math.max(1, Math.round(post.durationMs / 1000))} 秒`);
  }

  if (post.topicTags?.length) {
    pieces.push(`#${post.topicTags[0]}`);
  }

  return pieces.join(" · ");
}

function DesktopChannelCommentsPanel({
  comments,
  commentsLoading,
  draft,
  likePendingCommentId,
  replyTarget,
  selectedPost,
  submitPending,
  onCancelReply,
  onDraftChange,
  onLikeComment,
  onReplyToComment,
  onSubmit,
}: {
  comments: FeedComment[];
  commentsLoading: boolean;
  draft: string;
  likePendingCommentId: string | null;
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  selectedPost: FeedPostListItem | null;
  submitPending: boolean;
  onCancelReply: () => void;
  onDraftChange: (value: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSubmit: () => void;
}) {
  const commentAuthorNameMap = useMemo(() => {
    const map = new Map<string, string>();
    comments.forEach((comment) => {
      map.set(comment.id, comment.authorName);
    });
    return map;
  }, [comments]);
  const commentThreads = useMemo(() => {
    const commentMap = new Map(comments.map((comment) => [comment.id, comment]));
    const rootComments = comments.filter(
      (comment) =>
        !comment.parentCommentId ||
        !commentMap.has(comment.parentCommentId),
    );
    const repliesByRoot = new Map<string, FeedComment[]>();

    comments.forEach((comment) => {
      if (!comment.parentCommentId || !commentMap.has(comment.parentCommentId)) {
        return;
      }

      const currentReplies = repliesByRoot.get(comment.parentCommentId) ?? [];
      currentReplies.push(comment);
      repliesByRoot.set(comment.parentCommentId, currentReplies);
    });

    return rootComments.map((rootComment) => ({
      rootComment,
      replies: repliesByRoot.get(rootComment.id) ?? [],
    }));
  }, [comments]);

  return (
    <div className="mt-3 space-y-3">
      {commentsLoading && !comments.length ? (
        <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
          正在读取评论...
        </div>
      ) : null}
      {!commentsLoading && !comments.length ? (
        <div className="rounded-[14px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
          这条内容还没有评论，你可以先开口。
        </div>
      ) : null}
      {commentThreads.length ? (
        <div className="max-h-[320px] space-y-3 overflow-auto pr-1">
          {commentThreads.map(({ replies, rootComment }) => (
            <div
              key={rootComment.id}
              className="rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3"
            >
              <DesktopThreadCommentCard
                comment={rootComment}
                active={replyTarget?.commentId === rootComment.id}
                commentAuthorNameMap={commentAuthorNameMap}
                compact={false}
                likePendingCommentId={likePendingCommentId}
                onLikeComment={onLikeComment}
                onReplyToComment={onReplyToComment}
              />
              {replies.length ? (
                <div className="mt-3 rounded-[14px] border border-[rgba(7,193,96,0.12)] bg-white px-3 py-3">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-medium text-[color:var(--text-muted)]">
                    <span>楼中楼</span>
                    <span>{replies.length} 条跟帖</span>
                  </div>
                  <div className="space-y-2 border-l border-[rgba(7,193,96,0.14)] pl-3">
                    {replies.map((comment) => (
                      <DesktopThreadCommentCard
                        key={comment.id}
                        comment={comment}
                        active={replyTarget?.commentId === comment.id}
                        commentAuthorNameMap={commentAuthorNameMap}
                        compact
                        likePendingCommentId={likePendingCommentId}
                        onLikeComment={onLikeComment}
                        onReplyToComment={onReplyToComment}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3">
        {replyTarget ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[12px] bg-[rgba(7,193,96,0.08)] px-3 py-2 text-[11px] text-[color:var(--brand-primary)]">
            <div className="truncate">
              正在回复 {replyTarget.authorName}
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className="transition hover:opacity-75"
            >
              取消
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <TextField
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={
              replyTarget
                ? `回复 ${replyTarget.authorName}...`
                : selectedPost
                  ? "写下你对这条视频号内容的评论..."
                  : "先选择一条内容"
            }
            disabled={!selectedPost}
            className="min-w-0 flex-1 rounded-xl border-[color:var(--border-faint)] bg-white py-2.5 shadow-none hover:bg-white focus:border-[rgba(7,193,96,0.14)] focus:shadow-none"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedPost || !draft.trim() || submitPending}
            onClick={onSubmit}
            className="bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
          >
            {submitPending ? "发送中..." : "发送"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DesktopThreadCommentCard({
  active,
  comment,
  commentAuthorNameMap,
  compact,
  likePendingCommentId,
  onLikeComment,
  onReplyToComment,
}: {
  active: boolean;
  comment: FeedComment;
  commentAuthorNameMap: Map<string, string>;
  compact: boolean;
  likePendingCommentId: string | null;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
}) {
  const replyTargetName = comment.replyToCommentId
    ? commentAuthorNameMap.get(comment.replyToCommentId) ?? null
    : null;

  return (
    <div
      className={cn(
        "rounded-[14px] border px-3 py-3 transition-colors",
        compact
          ? "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
          : "border-[color:var(--border-faint)] bg-white",
        active &&
          "border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.06)] shadow-[inset_3px_0_0_0_var(--brand-primary)]",
      )}
    >
      <div className="flex items-start gap-3">
        <AvatarChip
          name={comment.authorName}
          src={comment.authorAvatar}
          size={compact ? "sm" : "wechat"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-[color:var(--text-primary)]">
              {comment.authorName}
            </span>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                comment.authorType === "character"
                  ? "border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] text-[color:var(--brand-primary)]"
                  : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)]",
              )}
            >
              {comment.authorType === "character" ? "居民" : "世界主人"}
            </span>
            {compact ? (
              <span className="rounded-md bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                回复层
              </span>
            ) : (
              <span className="rounded-md bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                主评论
              </span>
            )}
            <span className="text-[color:var(--text-dim)]">
              {formatTimestamp(comment.createdAt)}
            </span>
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
            {replyTargetName ? (
              <span className="text-[color:var(--text-muted)]">
                回复 {replyTargetName}
                {"："}
              </span>
            ) : null}
            {comment.text}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-[color:var(--text-muted)]">
            <button
              type="button"
              onClick={() => onReplyToComment(comment)}
              className="transition hover:text-[color:var(--text-primary)]"
            >
              回复
            </button>
            <button
              type="button"
              disabled={
                comment.likedByOwner ||
                likePendingCommentId === comment.id
              }
              onClick={() => onLikeComment(comment)}
              className={cn(
                "inline-flex items-center gap-1 transition",
                comment.likedByOwner
                  ? "text-[color:var(--brand-primary)]"
                  : "hover:text-[color:var(--text-primary)]",
              )}
            >
              <ThumbsUp size={12} />
              {likePendingCommentId === comment.id
                ? "处理中"
                : comment.likedByOwner
                  ? `已赞 ${comment.likeCount}`
                  : `赞 ${comment.likeCount}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
