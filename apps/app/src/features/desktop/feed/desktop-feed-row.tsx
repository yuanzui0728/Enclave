import { useEffect, useState } from "react";
import { type FeedPostListItem } from "@yinjie/contracts";
import { Button, TextField, cn } from "@yinjie/ui";
import { Bot, Heart, MessageCircle, Star, UserRound } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { formatTimestamp } from "../../../lib/format";

type DesktopFeedRowProps = {
  active: boolean;
  commentDraft: string;
  commentLoading: boolean;
  favorite: boolean;
  likeLoading: boolean;
  post: FeedPostListItem;
  onCommentChange: (value: string) => void;
  onCommentSubmit: () => void;
  onLike: () => void;
  onOpenDetail: () => void;
  onSelectAuthor: () => void;
  onToggleFavorite: () => void;
};

export function DesktopFeedRow({
  active,
  commentDraft,
  commentLoading,
  favorite,
  likeLoading,
  post,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onOpenDetail,
  onSelectAuthor,
  onToggleFavorite,
}: DesktopFeedRowProps) {
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => {
    if (commentDraft.trim()) {
      setShowComposer(true);
    }
  }, [commentDraft]);

  useEffect(() => {
    if (!commentLoading && !commentDraft.trim()) {
      setShowComposer(false);
    }
  }, [commentDraft, commentLoading]);

  const activeRowClassName =
    "border-[rgba(7,193,96,0.12)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary),0_10px_24px_rgba(15,23,42,0.05)]";

  return (
    <article
      onClick={onOpenDetail}
      className={cn(
        "cursor-pointer rounded-[16px] border px-4 py-4 transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? activeRowClassName
          : "border-[color:var(--border-faint)] bg-white hover:bg-[color:var(--surface-console)] hover:shadow-[var(--shadow-section)]",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectAuthor();
          }}
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
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectAuthor();
                }}
                className="truncate text-left text-[15px] font-semibold text-[color:var(--text-primary)]"
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
              {post.aiReacted ? (
                <span className="rounded-md border border-[rgba(7,193,96,0.12)] bg-white px-2 py-1 text-[10px] font-medium text-[color:var(--text-primary)] shadow-[inset_0_-2px_0_0_var(--brand-primary)]">
                  AI 已回应
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--text-muted)]">
              <span>{formatTimestamp(post.createdAt)}</span>
              <span>居民公开可见</span>
            </div>
          </div>

          <div className="mt-3 text-[15px] leading-7 text-[color:var(--text-primary)]">
            {post.text}
          </div>

          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="text-[12px] text-[color:var(--text-muted)]">
              {post.likeCount > 0 || post.commentCount > 0
                ? `${post.likeCount} 赞 · ${post.commentCount} 评论`
                : "还没有互动"}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={likeLoading}
                onClick={(event) => {
                  event.stopPropagation();
                  onLike();
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[color:var(--border-faint)] px-2.5 text-[12px] text-[color:var(--text-secondary)] transition-[background-color,color,border-color] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:opacity-55"
              >
                <Heart size={14} />
                {likeLoading ? "处理中..." : "点赞"}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowComposer((current) => !current);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[color:var(--border-faint)] px-2.5 text-[12px] text-[color:var(--text-secondary)] transition-[background-color,color,border-color] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
              >
                <MessageCircle size={14} />
                评论
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite();
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] transition-[background-color,color,border-color]",
                  favorite
                    ? "border-[#ead9a6] bg-[#fbf7e8] text-amber-700"
                    : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
                )}
              >
                <Star size={14} className={favorite ? "fill-current" : ""} />
                {favorite ? "已收藏" : "收藏"}
              </button>
            </div>
          </div>

          {post.commentsPreview.length > 0 ? (
            <div
              className="mt-3 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetail();
              }}
            >
              <div className="space-y-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                {post.commentsPreview.map((comment) => (
                  <div key={comment.id}>
                    <span className="font-medium text-[color:var(--text-primary)]">
                      {comment.authorName}
                    </span>
                    <span className="text-[color:var(--text-dim)]">：</span>
                    <span>{comment.text}</span>
                  </div>
                ))}
              </div>
              {post.commentCount > post.commentsPreview.length ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDetail();
                  }}
                  className="mt-3 text-[12px] font-medium text-[color:var(--brand-primary)]"
                >
                  查看全部 {post.commentCount} 条评论
                </button>
              ) : null}
            </div>
          ) : null}

          {showComposer ? (
            <div
              className="mt-3 flex items-center gap-2"
              onClick={(event) => event.stopPropagation()}
            >
              <TextField
                value={commentDraft}
                onChange={(event) => onCommentChange(event.target.value)}
                placeholder="写评论..."
                className="min-w-0 flex-1 rounded-xl border-[color:var(--border-faint)] bg-white px-4 py-2 text-[13px] shadow-none hover:bg-white focus:border-[rgba(7,193,96,0.18)] focus:shadow-none"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={!commentDraft.trim() || commentLoading}
                onClick={(event) => {
                  event.stopPropagation();
                  onCommentSubmit();
                }}
                className="bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
              >
                {commentLoading ? "发送中..." : "发送"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
