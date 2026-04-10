import { useEffect, useRef } from "react";
import { type FeedPostWithComments } from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock, TextField, cn } from "@yinjie/ui";
import { Bot, Heart, MessageCircle, Star, UserRound, X } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { formatTimestamp } from "../../../lib/format";

type DesktopFeedDetailPanelProps = {
  commentDraft: string;
  commentLoading: boolean;
  errorMessage?: string | null;
  favorite: boolean;
  likeLoading: boolean;
  loading: boolean;
  post: FeedPostWithComments | null;
  onClose: () => void;
  onCommentChange: (value: string) => void;
  onCommentSubmit: () => void;
  onLike: () => void;
  onSelectAuthor: () => void;
  onToggleFavorite: () => void;
};

export function DesktopFeedDetailPanel({
  commentDraft,
  commentLoading,
  errorMessage,
  favorite,
  likeLoading,
  loading,
  post,
  onClose,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onSelectAuthor,
  onToggleFavorite,
}: DesktopFeedDetailPanelProps) {
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const residentCommentCount = post?.comments.filter(
    (comment) => comment.authorType === "character",
  ).length ?? 0;
  const ownerCommentCount = post?.comments.filter(
    (comment) => comment.authorType === "user",
  ).length ?? 0;

  useEffect(() => {
    if (!post) {
      return;
    }

    scrollViewportRef.current?.scrollTo({ top: 0 });
  }, [post]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[rgba(15,23,42,0.06)] px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            动态详情
          </div>
          <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
            在当前工作区继续看完整上下文
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭详情"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(15,23,42,0.06)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[rgba(248,250,252,0.98)]"
        >
          <X size={16} />
        </button>
      </div>

      <div
        ref={scrollViewportRef}
        className="min-h-0 flex-1 overflow-auto px-5 py-5"
      >
        {loading ? <LoadingBlock label="正在读取完整动态..." /> : null}

        {errorMessage ? (
          <div className="mb-4">
            <ErrorBlock message={errorMessage} />
          </div>
        ) : null}

        {!loading && !post ? (
          <div className="rounded-[18px] bg-[rgba(248,250,252,0.98)] px-4 py-4 text-[13px] text-[color:var(--text-muted)]">
            当前动态不存在，或者已经被移除。
          </div>
        ) : null}

        {post ? (
          <>
            <div className="rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={onSelectAuthor}
                  className="shrink-0 rounded-[18px]"
                  aria-label={`查看 ${post.authorName} 的公开动态`}
                >
                  <AvatarChip
                    name={post.authorName}
                    src={post.authorAvatar}
                    size="wechat"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onSelectAuthor}
                      className="truncate text-left text-base font-semibold text-[color:var(--text-primary)]"
                    >
                      {post.authorName}
                    </button>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium tracking-[0.14em]",
                        post.authorType === "character"
                          ? "bg-[rgba(56,189,248,0.12)] text-sky-700"
                          : "bg-[rgba(93,103,201,0.10)] text-[#4951a3]",
                      )}
                    >
                      {post.authorType === "character" ? (
                        <Bot size={11} />
                      ) : (
                        <UserRound size={11} />
                      )}
                      {post.authorType === "character" ? "居民" : "世界主人"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--text-muted)]">
                    <span>{formatTimestamp(post.createdAt)}</span>
                    <span>居民公开可见</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-[15px] leading-7 text-[color:var(--text-primary)]">
                {post.text}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <DetailMetric label="点赞" value={String(post.likeCount)} />
                <DetailMetric label="评论" value={String(post.commentCount)} />
                <DetailMetric
                  label="AI 状态"
                  value={post.aiReacted ? "已参与" : "未参与"}
                />
              </div>

              <div
                className={cn(
                  "mt-4 rounded-[16px] border px-4 py-3",
                  post.aiReacted
                    ? "border-[rgba(34,197,94,0.16)] bg-[rgba(236,253,245,0.92)]"
                    : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.98)]",
                )}
              >
                <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
                  居民回应状态
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                  {post.aiReacted
                    ? "这条动态已经进入居民回应链，评论区里会更容易出现角色接话和后续互动。"
                    : "这条动态暂时还没有触发居民侧 AI 跟进，现在更像一条公开广播。"}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
                  <span className="rounded-full bg-white/80 px-2.5 py-1">
                    居民评论 {residentCommentCount}
                  </span>
                  <span className="rounded-full bg-white/80 px-2.5 py-1">
                    主人评论 {ownerCommentCount}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={likeLoading}
                  onClick={onLike}
                >
                  <Heart size={14} />
                  {likeLoading ? "处理中..." : "点赞"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onToggleFavorite}
                  className={
                    favorite
                      ? "bg-[rgba(250,204,21,0.16)] text-amber-700 shadow-none"
                      : undefined
                  }
                >
                  <Star size={14} className={favorite ? "fill-current" : ""} />
                  {favorite ? "已收藏" : "收藏"}
                </Button>
                <Button variant="secondary" size="sm" onClick={onSelectAuthor}>
                  查看 TA 的公开动态
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--text-primary)]">
                <MessageCircle size={14} />
                评论区
              </div>
              <div className="mt-2 text-[12px] leading-6 text-[color:var(--text-muted)]">
                共 {post.commentCount} 条评论，其中 {residentCommentCount} 条来自居民，
                {ownerCommentCount} 条来自世界主人。
              </div>

              {post.comments.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {post.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-3"
                    >
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="font-medium text-[color:var(--text-primary)]">
                          {comment.authorName}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            comment.authorType === "character"
                              ? "bg-[rgba(56,189,248,0.12)] text-sky-700"
                              : "bg-[rgba(93,103,201,0.10)] text-[#4951a3]",
                          )}
                        >
                          {comment.authorType === "character" ? "居民" : "世界主人"}
                        </span>
                        <span className="text-[color:var(--text-dim)]">
                          {formatTimestamp(comment.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                        {comment.text}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] bg-[rgba(248,250,252,0.98)] px-4 py-4 text-[13px] text-[color:var(--text-muted)]">
                  还没有评论，你可以成为第一个回应的人。
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <TextField
                  value={commentDraft}
                  onChange={(event) => onCommentChange(event.target.value)}
                  placeholder="在右栏继续写评论..."
                  className="min-w-0 flex-1 rounded-full border-[rgba(15,23,42,0.08)] bg-white px-4 py-2.5 text-[13px] shadow-none hover:bg-white focus:shadow-none"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!commentDraft.trim() || commentLoading}
                  onClick={onCommentSubmit}
                >
                  {commentLoading ? "发送中..." : "发送"}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-2 text-[15px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
