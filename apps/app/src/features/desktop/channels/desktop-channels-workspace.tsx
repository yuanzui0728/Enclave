import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  FeedChannelAuthorProfile,
  FeedChannelHomeSection,
  FeedComment,
  FeedPostListItem,
} from "@yinjie/contracts";
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
  ChevronDown,
  ChevronRight,
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
  activeSection: FeedChannelHomeSection;
  authorProfile: FeedChannelAuthorProfile | null;
  authorProfileErrorMessage?: string | null;
  authorProfileLoading: boolean;
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
  routeSelectedAuthorId?: string | null;
  routeSelectedPostId?: string | null;
  successNotice?: string;
  isPostFavorite: (postId: string) => boolean;
  onCloseAuthor: () => void;
  onCancelCommentReply: () => void;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onOpenAuthor: (authorId: string) => void;
  onOpenAuthorPost: (postId: string, authorId: string) => void;
  onRefresh: () => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSectionChange: (section: FeedChannelHomeSection) => void;
  onSelectedPostChange: (postId: string | null) => void;
  onToggleAuthorFollow: (authorId: string, following: boolean) => void;
  onToggleFavorite: (post: FeedPostListItem) => void;
  onViewPost: (postId: string) => void;
  sections: Array<{
    key: FeedChannelHomeSection;
    label: string;
    count: number;
  }>;
};

const DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY =
  "yinjie:channels:desktop-comment-threads";

export function DesktopChannelsWorkspace({
  activeSection,
  authorProfile,
  authorProfileErrorMessage,
  authorProfileLoading,
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
  routeSelectedAuthorId = null,
  routeSelectedPostId = null,
  successNotice,
  isPostFavorite,
  onCloseAuthor,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onLikeComment,
  onOpenAuthor,
  onOpenAuthorPost,
  onRefresh,
  onReplyToComment,
  onSectionChange,
  onSelectedPostChange,
  onToggleAuthorFollow,
  onToggleFavorite,
  onViewPost,
  sections,
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
  const activeFavoriteActionClassName =
    "border-[rgba(180,123,23,0.18)] bg-white text-[color:var(--text-primary)] shadow-[inset_0_-2px_0_0_rgba(180,123,23,0.78)]";
  const authorPanelVisible = Boolean(routeSelectedAuthorId);
  const activeSectionLabel =
    sections.find((section) => section.key === activeSection)?.label ?? "推荐";

  useEffect(() => {
    onSelectedPostChange(selectedPost?.id ?? null);

    if (!selectedPost?.id) {
      return;
    }

    onViewPost(selectedPost.id);
  }, [onSelectedPostChange, onViewPost, selectedPost?.id]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[rgba(244,247,246,0.98)]">
      <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
              Channels
            </div>
            <div className="mt-1 text-[22px] font-semibold text-[color:var(--text-primary)]">
              视频号
            </div>
            <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
              桌面端收成微信式内容浏览结构，主区域看视频，右侧接住作者、评论和推荐队列。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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

        <div className="mt-4 flex flex-wrap gap-2">
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              aria-pressed={activeSection === section.key}
              onClick={() => onSectionChange(section.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[12px] transition",
                activeSection === section.key
                  ? "border-[rgba(7,193,96,0.22)] bg-[rgba(7,193,96,0.12)] font-medium text-[#07c160]"
                  : "border-[color:var(--border-subtle)] bg-white text-[color:var(--text-secondary)] hover:border-[rgba(7,193,96,0.2)] hover:text-[color:var(--text-primary)]",
              )}
            >
              {section.label}
              {section.count > 0 ? ` ${section.count}` : ""}
            </button>
          ))}
        </div>

        {selectedPost ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1">
              {activeSectionLabel} {posts.length} 条
            </span>
            <span>当前播放：{selectedPost.authorName}</span>
            <span>·</span>
            <span>{formatTimestamp(selectedPost.createdAt)}</span>
            <span>·</span>
            <span>{formatChannelMeta(selectedPost)}</span>
          </div>
        ) : null}

        {successNotice ? (
          <div className="mt-4">
            <InlineNotice
              tone="success"
              className="border-[color:var(--border-faint)] bg-white"
            >
              {successNotice}
            </InlineNotice>
          </div>
        ) : null}
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
          <div className="mx-auto grid max-w-[1240px] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0">
              <article className="overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
                <div className="relative bg-[#0f1115]">
                  <video
                    key={selectedPost.id}
                    src={selectedPost.mediaUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="mx-auto block max-h-[720px] w-full bg-black object-contain"
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
                          onClick={() => onOpenAuthor(selectedPost.authorId)}
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
                          variant={
                            selectedPost.ownerState?.isFollowingAuthor
                              ? "secondary"
                              : "primary"
                          }
                          size="sm"
                          onClick={() =>
                            onToggleAuthorFollow(
                              selectedPost.authorId,
                              Boolean(selectedPost.ownerState?.isFollowingAuthor),
                            )
                          }
                          className={
                            selectedPost.ownerState?.isFollowingAuthor
                              ? "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                              : "bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
                          }
                        >
                          {selectedPost.ownerState?.isFollowingAuthor
                            ? "已关注"
                            : "+关注"}
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
                        onClick={() => {
                          if (typeof document !== "undefined") {
                            document
                              .getElementById("desktop-channel-comments-panel")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                          }
                        }}
                        className="border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                      >
                        <MessageCircleMore size={15} />
                        {selectedPost.commentCount} 评论
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onToggleFavorite(selectedPost)}
                        className={
                          isPostFavorite(selectedPost.id)
                            ? activeFavoriteActionClassName
                            : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                        }
                      >
                        <Bookmark size={15} />
                        {isPostFavorite(selectedPost.id) ? "取消收藏" : "收藏"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3 text-[12px] leading-6 text-[color:var(--text-secondary)]">
                    评论、作者入口和推荐队列已经收进右侧，主区域只保留当前内容播放和正文信息。
                  </div>
                </div>
              </article>
            </section>

            <aside className="space-y-4">
              {authorPanelVisible ? (
                <DesktopChannelAuthorPanel
                  authorId={routeSelectedAuthorId}
                  errorMessage={authorProfileErrorMessage}
                  isLoading={authorProfileLoading}
                  profile={authorProfile}
                  selectedPostId={selectedPost.id}
                  onClose={onCloseAuthor}
                  onOpenPost={onOpenAuthorPost}
                  onToggleFollow={onToggleAuthorFollow}
                />
              ) : (
                <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                  <div className="flex items-start gap-3">
                    <AvatarChip
                      name={selectedPost.authorName}
                      src={selectedPost.authorAvatar}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16px] font-semibold text-[color:var(--text-primary)]">
                        {selectedPost.authorName}
                      </div>
                      <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
                        {formatTimestamp(selectedPost.createdAt)} ·{" "}
                        {selectedPost.viewCount} 播放
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenAuthor(selectedPost.authorId)}
                    >
                      <PlaySquare size={14} />
                      作者主页
                    </Button>
                    <Button
                      variant={
                        selectedPost.ownerState?.isFollowingAuthor
                          ? "secondary"
                          : "primary"
                      }
                      size="sm"
                      onClick={() =>
                        onToggleAuthorFollow(
                          selectedPost.authorId,
                          Boolean(selectedPost.ownerState?.isFollowingAuthor),
                        )
                      }
                      className={
                        selectedPost.ownerState?.isFollowingAuthor
                          ? "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                          : "bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
                      }
                    >
                      {selectedPost.ownerState?.isFollowingAuthor
                        ? "已关注"
                        : "+关注"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    直播伴侣
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

              <div
                id="desktop-channel-comments-panel"
                className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]"
              >
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
                    {selectedPost.commentCount} 条
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
                  draft={commentDrafts[selectedPost.id] ?? ""}
                  likePendingCommentId={commentLikePendingId}
                  replyTarget={commentReplyTarget}
                  selectedPost={selectedPost}
                  submitPending={commentPendingPostId === selectedPost.id}
                  onCancelReply={onCancelCommentReply}
                  onDraftChange={(value) => onCommentChange(selectedPost.id, value)}
                  onLikeComment={onLikeComment}
                  onReplyToComment={onReplyToComment}
                  onSubmit={() => onCommentSubmit(selectedPost.id)}
                />
              </div>

              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    推荐队列
                  </div>
                  <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                    {posts.length} 条
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {posts.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => setSelectedPostId(post.id)}
                      className={cn(
                        "w-full rounded-[16px] border px-3 py-3 text-left transition-[background-color,box-shadow]",
                        selectedPost.id === post.id
                          ? "border-[rgba(7,193,96,0.14)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary),0_8px_18px_rgba(15,23,42,0.04)]"
                          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.04)]",
                      )}
                    >
                      <div className="line-clamp-2 text-sm leading-6 text-[color:var(--text-primary)]">
                        {post.text}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-muted)]">
                        <span>{post.authorName}</span>
                        <span>·</span>
                        <span>{formatTimestamp(post.createdAt)}</span>
                        {post.id === liveCompanionReferencePostId ? (
                          <span className="rounded-md border border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)]">
                            直播参考
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DesktopChannelAuthorPanel({
  authorId,
  errorMessage,
  isLoading,
  profile,
  selectedPostId,
  onClose,
  onOpenPost,
  onToggleFollow,
}: {
  authorId: string | null;
  errorMessage?: string | null;
  isLoading: boolean;
  profile: FeedChannelAuthorProfile | null;
  selectedPostId: string | null;
  onClose: () => void;
  onOpenPost: (postId: string, authorId: string) => void;
  onToggleFollow: (authorId: string, following: boolean) => void;
}) {
  const fallbackBio =
    profile?.authorType === "character"
      ? "这位居民暂时还没有填写视频号简介。"
      : "这个视频号作者暂时还没有填写简介。";
  const recentPosts = profile?.recentPosts.slice(0, 5) ?? [];
  const liveClipCount = (profile?.recentPosts ?? []).filter(
    (post) => post.sourceKind === "live_clip",
  ).length;

  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            作者主页
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
            桌面端把作者资料收进当前工作区，避免单开整页后丢掉当前内容上下文。
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          回到内容
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-4">
          <LoadingBlock label="正在读取作者主页..." />
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4">
          <ErrorBlock message={errorMessage} />
        </div>
      ) : null}

      {!isLoading && !errorMessage && !profile ? (
        <div className="mt-4">
          <EmptyState
            title="作者主页暂时不可用"
            description="这位作者的信息还没有准备好，稍后再试。"
          />
        </div>
      ) : null}

      {!isLoading && !errorMessage && profile ? (
        <>
          <div className="mt-4 flex items-start gap-3">
            <AvatarChip
              name={profile.authorName}
              src={profile.authorAvatar}
              size="wechat"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-[16px] font-semibold text-[color:var(--text-primary)]">
                  {profile.authorName}
                </div>
                <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                  {profile.authorType === "character" ? "居民作者" : "世界主人"}
                </span>
              </div>
              <div className="mt-2 text-[12px] leading-6 text-[color:var(--text-secondary)]">
                {profile.bio?.trim() || fallbackBio}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
              {profile.followerCount} 关注者
            </span>
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
              {profile.recentPosts.length} 条内容
            </span>
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
              {liveClipCount} 条直播回放
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant={profile.isFollowing ? "secondary" : "primary"}
              size="sm"
              onClick={() =>
                onToggleFollow(profile.authorId, profile.isFollowing)
              }
              className={
                profile.isFollowing
                  ? "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                  : "bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
              }
            >
              {profile.isFollowing ? "已关注" : "+关注"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!selectedPostId}
              onClick={onClose}
            >
              当前内容
            </Button>
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              最近内容
            </div>
            <div className="mt-3 space-y-2">
              {recentPosts.length ? (
                recentPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => onOpenPost(post.id, profile.authorId)}
                    className={cn(
                      "w-full rounded-[16px] border px-3 py-3 text-left transition",
                      selectedPostId === post.id
                        ? "border-[rgba(7,193,96,0.14)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary),0_8px_18px_rgba(15,23,42,0.04)]"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.04)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {post.title?.trim() || "查看这条内容"}
                      </div>
                      <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                        {post.sourceKind === "live_clip"
                          ? "直播回放"
                          : post.mediaType === "video"
                            ? "视频"
                            : "动态"}
                      </span>
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                      {post.text}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
                      <span>{formatTimestamp(post.createdAt)}</span>
                      <span>·</span>
                      <span>{formatChannelMeta(post)}</span>
                      {selectedPostId === post.id ? (
                        <>
                          <span>·</span>
                          <span className="font-medium text-[color:var(--brand-primary)]">
                            当前内容
                          </span>
                        </>
                      ) : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
                  这位作者暂时还没有可以展示的内容。
                </div>
              )}
            </div>
          </div>

          {authorId && profile.authorId !== authorId ? (
            <div className="mt-4 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
              当前路由和作者数据还在同步，稍后会自动收敛到最新作者资料。
            </div>
          ) : null}
        </>
      ) : null}
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
  const selectedPostId = selectedPost?.id ?? null;
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
  const threadIdsWithReplies = useMemo(
    () =>
      commentThreads
        .filter(({ replies }) => replies.length > 0)
        .map(({ rootComment }) => rootComment.id),
    [commentThreads],
  );
  const [collapsedThreadsByPostId, setCollapsedThreadsByPostId] = useState<
    Record<string, string[]>
  >(() => readStoredCollapsedChannelCommentThreads());
  const collapsedThreadIds = useMemo(() => {
    if (!selectedPostId) {
      return [];
    }

    return normalizeCollapsedThreadIds(
      collapsedThreadsByPostId[selectedPostId] ?? [],
      threadIdsWithReplies,
    );
  }, [collapsedThreadsByPostId, selectedPostId, threadIdsWithReplies]);

  function updateCollapsedThreadIds(
    updater: string[] | ((current: string[]) => string[]),
  ) {
    if (!selectedPostId) {
      return;
    }

    setCollapsedThreadsByPostId((current) => {
      const currentIds = normalizeCollapsedThreadIds(
        current[selectedPostId] ?? [],
        threadIdsWithReplies,
      );
      const nextIdsRaw =
        typeof updater === "function" ? updater(currentIds) : updater;
      const nextIds = normalizeCollapsedThreadIds(
        nextIdsRaw,
        threadIdsWithReplies,
      );

      if (areThreadIdsEqual(currentIds, nextIds)) {
        return current;
      }

      return {
        ...current,
        [selectedPostId]: nextIds,
      };
    });
  }

  useEffect(() => {
    if (!selectedPostId) {
      return;
    }

    setCollapsedThreadsByPostId((current) => {
      const currentIds = current[selectedPostId] ?? [];
      const nextIds = normalizeCollapsedThreadIds(
        currentIds,
        threadIdsWithReplies,
      );
      if (areThreadIdsEqual(currentIds, nextIds)) {
        return current;
      }

      return {
        ...current,
        [selectedPostId]: nextIds,
      };
    });
  }, [selectedPostId, threadIdsWithReplies]);

  useEffect(() => {
    writeStoredCollapsedChannelCommentThreads(collapsedThreadsByPostId);
  }, [collapsedThreadsByPostId]);

  useEffect(() => {
    if (!replyTarget || !selectedPostId) {
      return;
    }

    const matchingThread = commentThreads.find(
      ({ replies, rootComment }) =>
        rootComment.id === replyTarget.commentId ||
        replies.some((comment) => comment.id === replyTarget.commentId),
    );
    if (!matchingThread?.replies.length) {
      return;
    }

    setCollapsedThreadsByPostId((current) => {
      const currentIds = normalizeCollapsedThreadIds(
        current[selectedPostId] ?? [],
        threadIdsWithReplies,
      );

      if (!currentIds.includes(matchingThread.rootComment.id)) {
        return current;
      }

      return {
        ...current,
        [selectedPostId]: currentIds.filter(
          (threadId) => threadId !== matchingThread.rootComment.id,
        ),
      };
    });
  }, [commentThreads, replyTarget, selectedPostId, threadIdsWithReplies]);

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
      {threadIdsWithReplies.length ? (
        <div className="flex items-center justify-between rounded-[12px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[11px] text-[color:var(--text-secondary)]">
          <span>共 {threadIdsWithReplies.length} 个可折叠线程</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateCollapsedThreadIds([])}
              className="rounded-full border border-[color:var(--border-faint)] px-2.5 py-1 transition hover:bg-[color:var(--surface-console)]"
            >
              全部展开
            </button>
            <button
              type="button"
              onClick={() => updateCollapsedThreadIds(threadIdsWithReplies)}
              className="rounded-full border border-[color:var(--border-faint)] px-2.5 py-1 transition hover:bg-[color:var(--surface-console)]"
            >
              全部收起
            </button>
          </div>
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
                <DesktopCommentThreadReplies
                  collapsed={collapsedThreadIds.includes(rootComment.id)}
                  replies={replies}
                  replyTarget={replyTarget}
                  commentAuthorNameMap={commentAuthorNameMap}
                  likePendingCommentId={likePendingCommentId}
                  onLikeComment={onLikeComment}
                  onReplyToComment={onReplyToComment}
                  onToggleCollapsed={() =>
                    updateCollapsedThreadIds((current) =>
                      current.includes(rootComment.id)
                        ? current.filter((threadId) => threadId !== rootComment.id)
                        : [...current, rootComment.id],
                    )
                  }
                />
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

function DesktopCommentThreadReplies({
  collapsed,
  commentAuthorNameMap,
  likePendingCommentId,
  onLikeComment,
  onReplyToComment,
  onToggleCollapsed,
  replies,
  replyTarget,
}: {
  collapsed: boolean;
  commentAuthorNameMap: Map<string, string>;
  likePendingCommentId: string | null;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  onToggleCollapsed: () => void;
  replies: FeedComment[];
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
}) {
  const latestReply = replies[replies.length - 1] ?? null;

  return (
    <div className="mt-3 rounded-[14px] border border-[rgba(7,193,96,0.12)] bg-white px-3 py-3">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 text-[10px] font-medium text-[color:var(--text-muted)]">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span>楼中楼</span>
        </div>
        <span className="text-[10px] text-[color:var(--text-muted)]">
          {collapsed ? `展开 ${replies.length} 条跟帖` : `收起 ${replies.length} 条跟帖`}
        </span>
      </button>
      {collapsed ? (
        <div className="mt-3 rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3 text-[11px] leading-6 text-[color:var(--text-secondary)]">
          {latestReply ? (
            <>
              <span className="font-medium text-[color:var(--text-primary)]">
                {latestReply.authorName}
              </span>
              {`：${latestReply.text}`}
            </>
          ) : (
            "这个线程里还有跟帖。"
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-l border-[rgba(7,193,96,0.14)] pl-3">
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
      )}
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

function readStoredCollapsedChannelCommentThreads() {
  if (typeof window === "undefined") {
    return {} as Record<string, string[]>;
  }

  try {
    const rawValue = window.localStorage.getItem(
      DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY,
    );
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([postId, threadIds]) => [
        postId,
        Array.isArray(threadIds)
          ? threadIds.filter((threadId): threadId is string => typeof threadId === "string")
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

function writeStoredCollapsedChannelCommentThreads(
  collapsedThreadsByPostId: Record<string, string[]>,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const sanitized = Object.fromEntries(
      Object.entries(collapsedThreadsByPostId).filter(
        ([, threadIds]) => threadIds.length > 0,
      ),
    );
    if (!Object.keys(sanitized).length) {
      window.localStorage.removeItem(
        DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY,
      );
      return;
    }

    window.localStorage.setItem(
      DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY,
      JSON.stringify(sanitized),
    );
  } catch {
    return;
  }
}

function normalizeCollapsedThreadIds(
  threadIds: string[],
  availableThreadIds: string[],
) {
  const availableThreadIdSet = new Set(availableThreadIds);
  const nextThreadIds: string[] = [];

  threadIds.forEach((threadId) => {
    if (
      availableThreadIdSet.has(threadId) &&
      !nextThreadIds.includes(threadId)
    ) {
      nextThreadIds.push(threadId);
    }
  });

  return nextThreadIds;
}

function areThreadIdsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((threadId, index) => threadId === right[index]);
}
