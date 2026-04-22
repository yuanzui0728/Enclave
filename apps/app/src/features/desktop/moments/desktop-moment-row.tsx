import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
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
import { MomentMediaGallery } from "../../../components/moment-media-gallery";
import { formatTimestamp } from "../../../lib/format";

type DesktopMomentRowProps = {
  active: boolean;
  authorActionAriaLabel?: string;
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
  onSelectAuthor?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
};

export function DesktopMomentRow({
  active,
  authorActionAriaLabel,
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
  const hasText = Boolean(moment.text.trim());

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
  const activeActionClassName =
    "border-[rgba(7,193,96,0.12)] bg-white text-[color:var(--text-primary)] shadow-[inset_0_-2px_0_0_var(--brand-primary)]";
  const canSelectAuthor = Boolean(onSelectAuthor);

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
        {canSelectAuthor ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectAuthor?.(event);
            }}
            className="shrink-0 rounded-[18px]"
            aria-label={
              authorActionAriaLabel ?? `查看 ${moment.authorName} 的朋友圈`
            }
          >
            <AvatarChip
              name={moment.authorName}
              src={moment.authorAvatar}
              size="wechat"
            />
          </button>
        ) : (
          <AvatarChip
            name={moment.authorName}
            src={moment.authorAvatar}
            size="wechat"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {canSelectAuthor ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectAuthor?.(event);
                  }}
                  className="truncate text-left text-[15px] font-semibold text-[color:var(--text-primary)]"
                >
                  {moment.authorName}
                </button>
              ) : (
                <div className="truncate text-[15px] font-semibold text-[color:var(--text-primary)]">
                  {moment.authorName}
                </div>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium tracking-[0.12em]",
                  moment.authorType === "character"
                    ? "border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] text-[color:var(--brand-primary)]"
                    : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
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

          {hasText ? (
            <div className="mt-3 text-[15px] leading-7 text-[color:var(--text-primary)]">
              {moment.text}
            </div>
          ) : null}

          {moment.media.length > 0 ? (
            <div className={hasText ? "mt-3" : "mt-4"}>
              <MomentMediaGallery
                contentType={moment.contentType}
                media={moment.media}
                stopPropagation
              />
            </div>
          ) : null}

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
                    ? activeActionClassName
                    : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
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
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--border-faint)] px-2.5 text-[12px] text-[color:var(--text-secondary)] transition-[background-color,color] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
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
                    : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)] hover:border-[#ead9a6] hover:bg-[#fffaf0] hover:text-[color:var(--text-primary)]",
                )}
              >
                <Star size={14} className={favorite ? "fill-current" : ""} />
                {favorite ? "已收藏" : "收藏"}
              </button>
            </div>
          </div>

          {moment.likes.length > 0 || commentsPreview.length > 0 ? (
            <div
              className="mt-3 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3"
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
                      ? "mt-3 border-t border-[color:var(--border-faint)] pt-3"
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
                  className="mt-3 text-[12px] font-medium text-[color:var(--brand-primary)]"
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
                className="min-w-0 flex-1 rounded-xl border-[color:var(--border-faint)] bg-white px-4 py-2 text-[13px] shadow-none hover:bg-[color:var(--surface-console)] focus:border-[rgba(7,193,96,0.14)] focus:shadow-none"
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
