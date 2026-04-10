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
  MessageCircleMore,
  PlaySquare,
  RadioTower,
  RefreshCcw,
  ThumbsUp,
} from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { formatTimestamp } from "../../../lib/format";

type DesktopChannelsWorkspaceProps = {
  commentDrafts: Record<string, string>;
  commentPendingPostId: string | null;
  errorMessage?: string | null;
  isLoading: boolean;
  likePendingPostId: string | null;
  posts: FeedPostListItem[];
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

  useEffect(() => {
    if (!posts.length) {
      setSelectedPostId(null);
      return;
    }

    if (!selectedPostId || !posts.some((post) => post.id === selectedPostId)) {
      setSelectedPostId(posts[0]?.id ?? null);
    }
  }, [posts, selectedPostId]);

  const selectedPost =
    posts.find((post) => post.id === selectedPostId) ?? posts[0] ?? null;
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
    <div className="flex h-full min-h-0 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(255,247,239,0.96))]">
      <aside className="flex w-[292px] shrink-0 flex-col border-r border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.78)]">
        <div className="border-b border-[rgba(15,23,42,0.06)] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--brand-secondary)]">
            Channels
          </div>
          <div className="mt-2 text-[22px] font-semibold text-[color:var(--text-primary)]">
            视频号
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            桌面版按微信频道工作区组织 AI 生成短视频，左边浏览，右边持续接住评论和下一条推荐。
          </div>
        </div>

        <div className="space-y-4 overflow-auto px-4 py-4">
          <div className="rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white/90 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-xs text-[color:var(--text-muted)]">当前节奏</div>
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

          <div className="rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white/90 p-4 shadow-[var(--shadow-soft)]">
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
                      ? "border-[rgba(255,138,61,0.18)] bg-[rgba(255,244,235,0.92)]"
                      : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.88)] hover:bg-white",
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

          <div className="rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white/90 p-4 shadow-[var(--shadow-soft)]">
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
                      ? "border-[rgba(255,138,61,0.18)] bg-[rgba(255,244,235,0.92)]"
                      : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.88)] hover:bg-white",
                  )}
                >
                  <div className="line-clamp-2 text-sm leading-6 text-[color:var(--text-primary)]">
                    {post.text}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
                    <span>{post.authorName}</span>
                    <span>·</span>
                    <span>{formatTimestamp(post.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-[rgba(15,23,42,0.06)] px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-dim)]">
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
              <InlineNotice tone="success">{successNotice}</InlineNotice>
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
              <article className="overflow-hidden rounded-[34px] border border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,242,0.96))] shadow-[var(--shadow-card)]">
                <div className="relative bg-[#0f1115]">
                  <video
                    key={selectedPost.id}
                    src={selectedPost.mediaUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="mx-auto block max-h-[620px] w-full bg-black object-contain"
                  />
                  <div className="pointer-events-none absolute left-5 top-5 rounded-full bg-[rgba(15,23,42,0.65)] px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-white">
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
                            {formatTimestamp(selectedPost.createdAt)} · AI 世界内容
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

                  <div className="rounded-[24px] bg-[rgba(255,247,239,0.88)] p-3">
                    <div className="flex items-center gap-2">
                      <TextField
                        value={commentDrafts[selectedPost.id] ?? ""}
                        onChange={(event) =>
                          onCommentChange(selectedPost.id, event.target.value)
                        }
                        placeholder="写下你对这条视频号内容的评论..."
                        className="min-w-0 flex-1 rounded-full bg-white/88"
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

      <aside className="flex w-[320px] shrink-0 flex-col border-l border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.82)]">
        <div className="border-b border-[rgba(15,23,42,0.06)] px-5 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            互动侧栏
          </div>
          <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
            评论与下一条
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
          <div className="rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                当前内容
              </div>
              <PlaySquare size={16} className="text-[color:var(--brand-primary)]" />
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

          <div className="rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              最近评论
            </div>
            <div className="mt-3 space-y-3">
              {selectedPost?.commentsPreview.length ? (
                selectedPost.commentsPreview.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-[16px] bg-[rgba(248,250,252,0.92)] px-3 py-3"
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

          <div className="rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-white/92 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              下一条推荐
            </div>
            <div className="mt-3 space-y-2">
              {nextPosts.slice(0, 5).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setSelectedPostId(post.id)}
                  className="w-full rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-[rgba(255,248,239,0.70)] px-3 py-3 text-left transition hover:bg-white"
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
