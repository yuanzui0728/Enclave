import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { FeedPostListItem } from "@yinjie/contracts";
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
  readLiveDraft,
  readLiveHistory,
  type LiveDraft,
  type LiveSessionRecord,
} from "./live-companion-storage";
import { formatTimestamp } from "../../../lib/format";

type DesktopChannelsWorkspaceProps = {
  commentDrafts: Record<string, string>;
  commentPendingPostId: string | null;
  errorMessage?: string | null;
  isLoading: boolean;
  likePendingPostId: string | null;
  posts: FeedPostListItem[];
  routeSelectedPostId?: string | null;
  successNotice?: string;
  isPostFavorite: (postId: string) => boolean;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onRefresh: () => void;
  onToggleFavorite: (post: FeedPostListItem) => void;
};

export function DesktopChannelsWorkspace({
  commentDrafts,
  commentPendingPostId,
  errorMessage,
  isLoading,
  likePendingPostId,
  posts,
  routeSelectedPostId = null,
  successNotice,
  isPostFavorite,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onRefresh,
  onToggleFavorite,
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

    const syncLiveCompanionState = () => {
      setLiveDraft(readLiveDraft());
      setLiveHistory(readLiveHistory());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncLiveCompanionState();
      }
    };

    window.addEventListener("focus", syncLiveCompanionState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", syncLiveCompanionState);
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
                      ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
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
                      ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
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
                        <span className="rounded-md bg-[rgba(7,193,96,0.07)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)]">
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
                            {formatTimestamp(selectedPost.createdAt)} · AI
                            世界内容
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 text-[15px] leading-8 text-[color:var(--text-primary)]">
                        {selectedPost.text}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onLike(selectedPost.id)}
                        disabled={likePendingPostId === selectedPost.id}
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
                      >
                        <MessageCircleMore size={15} />
                        {selectedPost.commentCount} 评论
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onToggleFavorite(selectedPost)}
                      >
                        <Bookmark size={15} />
                        {isPostFavorite(selectedPost.id) ? "取消收藏" : "收藏"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3">
                    <div className="flex items-center gap-2">
                      <TextField
                        value={commentDrafts[selectedPost.id] ?? ""}
                        onChange={(event) =>
                          onCommentChange(selectedPost.id, event.target.value)
                        }
                        placeholder="写下你对这条视频号内容的评论..."
                        className="min-w-0 flex-1 rounded-xl bg-white"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={
                          !(commentDrafts[selectedPost.id] ?? "").trim() ||
                          commentPendingPostId === selectedPost.id
                        }
                        onClick={() => onCommentSubmit(selectedPost.id)}
                      >
                        {commentPendingPostId === selectedPost.id
                          ? "发送中..."
                          : "发送"}
                      </Button>
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
                <div className="mt-3 text-xs text-[color:var(--text-muted)]">
                  {selectedPost.likeCount} 赞 · {selectedPost.commentCount} 评论
                </div>
              </>
            ) : null}
          </div>

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              最近评论
            </div>
            <div className="mt-3 space-y-3">
              {selectedPost?.commentsPreview.length ? (
                selectedPost.commentsPreview.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3"
                  >
                    <div className="text-xs font-medium text-[color:var(--text-primary)]">
                      {comment.authorName}
                    </div>
                    <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                      {comment.text}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                  这条内容还没有评论，你可以先开口。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              下一条推荐
            </div>
            <div className="mt-3 space-y-2">
              {nextPosts.slice(0, 5).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setSelectedPostId(post.id)}
                  className="w-full rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-left transition hover:bg-white"
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
