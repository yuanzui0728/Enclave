import { useEffect, useState } from "react";
import { type Moment } from "@yinjie/contracts";
import { Button, TextField, cn } from "@yinjie/ui";
import {
  Bot,
  Heart,
  MapPin,
  MessageCircle,
  Star,
  UserRound,
} from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { formatTimestamp } from "../../../lib/format";

type DesktopMomentRowProps = {
  active: boolean;
  commentDraft: string;
  commentLoading: boolean;
  likeLoading: boolean;
  moment: Moment;
  ownerId?: string | null;
  favorite: boolean;
  onCommentChange: (value: string) => void;
  onCommentSubmit: () => void;
  onLike: () => void;
  onToggleFavorite: () => void;
  onOpenDetail: () => void;
  onSelectAuthor: () => void;
};

export function DesktopMomentRow({
  active,
  commentDraft,
  commentLoading,
  likeLoading,
  moment,
  ownerId,
  favorite,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onToggleFavorite,
  onOpenDetail,
  onSelectAuthor,
}: DesktopMomentRowProps) {
  const [showComposer, setShowComposer] = useState(false);
  const commentsPreview = moment.comments.slice(-2);
  const likedByOwner = Boolean(
    ownerId && moment.likes.some((like) => like.authorId === ownerId),
  );

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
          ? "border-[#cfe8d6] bg-[#f7fbf8] shadow-[0_12px_28px_rgba(15,23,42,0.05)]"
          : "border-black/6 bg-white hover:border-black/10 hover:bg-[#fcfcfc] hover:shadow-[0_10px_24px_rgba(15,23,42,0.05)]",
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
          aria-label={`查看 ${moment.authorName} 的朋友圈`}
        >
          <AvatarChip
            name={moment.authorName}
            src={moment.authorAvatar}
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
                {moment.authorName}
              </button>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium tracking-[0.12em]",
                  moment.authorType === "character"
                    ? "border-sky-100 bg-sky-50 text-sky-700"
                    : "border-black/6 bg-[#f6f6f6] text-[color:var(--text-secondary)]",
                )}
              >
                {moment.authorType === "character" ? (
                  <Bot size={11} />
                ) : (
                  <UserRound size={11} />
                )}
                {moment.authorType === "character" ? "角色" : "我"}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--text-muted)]">
              <span>{formatTimestamp(moment.postedAt)}</span>
              {moment.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} />
                  {moment.location}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-3 text-[15px] leading-7 text-[color:var(--text-primary)]">
            {moment.text}
          </div>

          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="text-[12px] text-[color:var(--text-muted)]">
              {moment.likeCount > 0 || moment.commentCount > 0
                ? `${moment.likeCount} 赞 · ${moment.commentCount} 评论`
                : "还没有互动"}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={likeLoading}
                onClick={(event) => {
                  event.stopPropagation();
                  onLike();
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-[background-color,border-color,color] disabled:opacity-55",
                  likedByOwner
                    ? "border-[#b7dfc0] bg-[#eaf8ef] text-[#15803d]"
                    : "border-transparent text-[color:var(--text-secondary)] hover:border-black/6 hover:bg-[#f6f6f6] hover:text-[color:var(--text-primary)]",
                )}
              >
                <Heart
                  size={14}
                  className={likedByOwner ? "fill-current" : ""}
                />
                {likeLoading ? "处理中..." : likedByOwner ? "已赞" : "赞"}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowComposer((current) => !current);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-[12px] text-[color:var(--text-secondary)] transition-[background-color,border-color,color] hover:border-black/6 hover:bg-[#f6f6f6] hover:text-[color:var(--text-primary)]"
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
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-[background-color,border-color,color]",
                  favorite
                    ? "border-[#ead9a6] bg-[#fbf7e8] text-[#8a6b11]"
                    : "border-transparent text-[color:var(--text-secondary)] hover:border-black/6 hover:bg-[#f6f6f6] hover:text-[color:var(--text-primary)]",
                )}
              >
                <Star size={14} className={favorite ? "fill-current" : ""} />
                {favorite ? "已收藏" : "收藏"}
              </button>
            </div>
          </div>

          {moment.likes.length > 0 || commentsPreview.length > 0 ? (
            <div
              className="mt-3 rounded-[14px] border border-black/6 bg-[#fafafa] px-4 py-3"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetail();
              }}
            >
              {moment.likes.length > 0 ? (
                <div className="text-[12px] leading-6 text-[color:var(--text-secondary)]">
                  <span className="font-medium text-[color:var(--text-primary)]">
                    点赞
                  </span>
                  <span className="mx-2 text-[color:var(--text-dim)]">/</span>
                  <span>
                    {moment.likes.map((like) => like.authorName).join("、")}
                  </span>
                </div>
              ) : null}
              {commentsPreview.length > 0 ? (
                <div
                  className={cn(
                    "space-y-2 text-[13px] leading-6 text-[color:var(--text-secondary)]",
                    moment.likes.length > 0
                      ? "mt-3 border-t border-black/6 pt-3"
                      : "",
                  )}
                >
                  {commentsPreview.map((comment) => (
                    <div key={comment.id}>
                      <span className="font-medium text-[color:var(--text-primary)]">
                        {comment.authorName}
                      </span>
                      <span className="text-[color:var(--text-dim)]">：</span>
                      <span>{comment.text}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {moment.comments.length > commentsPreview.length ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDetail();
                  }}
                  className="mt-3 text-[12px] font-medium text-[#15803d]"
                >
                  查看全部 {moment.commentCount} 条评论
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
                className="min-w-0 flex-1 rounded-xl border-black/8 bg-white px-4 py-2 text-[13px] shadow-none hover:bg-white focus:shadow-none"
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
