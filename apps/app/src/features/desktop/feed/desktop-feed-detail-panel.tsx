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
  const activeResidentSurfaceClassName =
    "border-[rgba(7,193,96,0.12)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary)]";
  const activeFavoriteClassName =
    "border-[rgba(180,123,23,0.18)] bg-white text-[color:var(--text-primary)] shadow-[inset_0_-2px_0_0_rgba(180,123,23,0.78)]";
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
    <div className="flex h-full min-h-0 flex-col bg-[rgba(247,250,250,0.82)]">
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-4 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
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
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-[13px] text-[color:var(--text-muted)]">
            当前动态不存在，或者已经被移除。
          </div>
        ) : null}

        {post ? (
          <>
            <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
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
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium",
                    post.authorType === "character"
                      ? "border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] text-[color:var(--brand-primary)]"
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
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
                    ? activeResidentSurfaceClassName
                    : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
                )}
              >
                <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
                  居民回应状态
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                  {post.aiReacted
                    ? "这条动态已经进入居民回应链，评论区里会更容易出现角色接话和后续互动。"
                    : "这条动态暂时还没有触发居民侧 AI 跟进，现在更像一条公开广播。"}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
                  <span className="rounded-md border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1">
                    居民评论 {residentCommentCount}
                  </span>
                  <span className="rounded-md border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1">
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
                  className="border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
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
                      ? activeFavoriteClassName
                      : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                  }
                >
                  <Star size={14} className={favorite ? "fill-current" : ""} />
                  {favorite ? "已收藏" : "收藏"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onSelectAuthor}
                  className="border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                >
                  查看 TA 的公开动态
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--text-primary)]">
                  <MessageCircle size={14} />
                  评论区
                </div>
                <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                  {post.commentCount} 条
                </span>
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
                      className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3"
                    >
                      <div className="flex items-center gap-2 text-[12px]">
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
                <div className="mt-4 rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-[13px] text-[color:var(--text-muted)]">
                  还没有评论，你可以成为第一个回应的人。
                </div>
              )}

              <div className="mt-4 border-t border-[color:var(--border-faint)] pt-4">
                <div className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
                  <span>直接在右栏继续回应当前公开动态。</span>
                  <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px]">
                    评论输入
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3">
                  <TextField
                    value={commentDraft}
                    onChange={(event) => onCommentChange(event.target.value)}
                    placeholder="在右栏继续写评论..."
                    className="min-w-0 flex-1 rounded-xl border-[color:var(--border-faint)] bg-white px-4 py-2.5 text-[13px] shadow-none hover:bg-white focus:border-[rgba(7,193,96,0.14)] focus:shadow-none"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!commentDraft.trim() || commentLoading}
                    onClick={onCommentSubmit}
                    className="bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
                  >
                    {commentLoading ? "发送中..." : "发送"}
                  </Button>
                </div>
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
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4">
      <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-[15px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
