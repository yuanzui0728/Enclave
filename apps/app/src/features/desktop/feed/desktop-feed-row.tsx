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

  return (
    <article
      onClick={onOpenDetail}
      className={cn(
        "cursor-pointer rounded-[16px] border px-4 py-4 transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "border-[rgba(93,103,201,0.18)] bg-[rgba(248,249,255,0.98)] shadow-[0_12px_28px_rgba(93,103,201,0.08)]"
          : "border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.96)] hover:border-[rgba(93,103,201,0.12)] hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]",
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
              {post.aiReacted ? (
                <span className="rounded-full bg-[rgba(34,197,94,0.10)] px-2 py-1 text-[10px] font-medium tracking-[0.12em] text-emerald-700">
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
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-[color:var(--text-secondary)] transition-[background-color,color] hover:bg-[rgba(248,250,252,0.98)] hover:text-[color:var(--text-primary)] disabled:opacity-55"
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
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-[color:var(--text-secondary)] transition-[background-color,color] hover:bg-[rgba(248,250,252,0.98)] hover:text-[color:var(--text-primary)]"
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
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-[background-color,color]",
                  favorite
                    ? "bg-[rgba(250,204,21,0.16)] text-amber-700"
                    : "text-[color:var(--text-secondary)] hover:bg-[rgba(248,250,252,0.98)] hover:text-[color:var(--text-primary)]",
                )}
              >
                <Star size={14} className={favorite ? "fill-current" : ""} />
                {favorite ? "已收藏" : "收藏"}
              </button>
            </div>
          </div>

          {post.commentsPreview.length > 0 ? (
            <div
              className="mt-3 rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-3"
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
                  className="mt-3 text-[12px] font-medium text-[#4951a3]"
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
                className="min-w-0 flex-1 rounded-full border-[rgba(15,23,42,0.08)] bg-white px-4 py-2 text-[13px] shadow-none hover:bg-white focus:shadow-none"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!commentDraft.trim() || commentLoading}
                onClick={(event) => {
                  event.stopPropagation();
                  onCommentSubmit();
                }}
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
