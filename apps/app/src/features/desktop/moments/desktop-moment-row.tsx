import { useEffect, useState } from "react";
import { type Moment } from "@yinjie/contracts";
import { Button, TextField, cn } from "@yinjie/ui";
import { Bot, Heart, MapPin, MessageCircle, UserRound } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { formatTimestamp } from "../../../lib/format";

type DesktopMomentRowProps = {
  active: boolean;
  commentDraft: string;
  commentLoading: boolean;
  likeLoading: boolean;
  moment: Moment;
  ownerId?: string | null;
  onCommentChange: (value: string) => void;
  onCommentSubmit: () => void;
  onLike: () => void;
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
  onCommentChange,
  onCommentSubmit,
  onLike,
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

  return (
    <article
      className={cn(
        "rounded-[26px] border px-5 py-5 transition-[border-color,background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "border-[rgba(249,115,22,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,239,0.98))] shadow-[0_16px_36px_rgba(255,138,61,0.10)]"
          : "border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.96)] hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.16)] hover:bg-white hover:shadow-[var(--shadow-card)]",
      )}
    >
      <div className="flex items-start gap-4">
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
          <div className="flex items-start justify-between gap-4">
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
                    "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium tracking-[0.14em]",
                    moment.authorType === "character"
                      ? "bg-[rgba(56,189,248,0.12)] text-sky-700"
                      : "bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)]",
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
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--text-muted)]">
                <span>{formatTimestamp(moment.postedAt)}</span>
                {moment.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} />
                    {moment.location}
                  </span>
                ) : null}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetail();
              }}
              className="rounded-full px-3"
            >
              查看详情
            </Button>
          </div>

          <button
            type="button"
            onClick={onOpenDetail}
            className="mt-4 block w-full text-left"
          >
            <div className="text-[15px] leading-8 text-[color:var(--text-primary)]">
              {moment.text}
            </div>
          </button>

          <div className="mt-4 flex items-center justify-between gap-4">
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
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] transition-[border-color,background-color,color] disabled:opacity-55",
                  likedByOwner
                    ? "border-[rgba(249,115,22,0.18)] bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)]"
                    : "border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.92)] text-[color:var(--text-secondary)] hover:border-[rgba(249,115,22,0.16)] hover:text-[color:var(--text-primary)]",
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
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.92)] px-3 text-[12px] text-[color:var(--text-secondary)] transition-[border-color,background-color,color] hover:border-[rgba(249,115,22,0.16)] hover:text-[color:var(--text-primary)]"
              >
                <MessageCircle size={14} />
                评论
              </button>
            </div>
          </div>

          {moment.likes.length > 0 ? (
            <div className="mt-4 rounded-[18px] bg-[rgba(248,250,252,0.94)] px-4 py-3 text-[12px] leading-6 text-[color:var(--text-secondary)]">
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
            <div className="mt-3 rounded-[18px] bg-[rgba(248,250,252,0.94)] px-4 py-3">
              <div className="space-y-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
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
            <div className="mt-4 flex items-center gap-2">
              <TextField
                value={commentDraft}
                onChange={(event) => onCommentChange(event.target.value)}
                placeholder="写评论..."
                className="min-w-0 flex-1 rounded-full border-[rgba(15,23,42,0.08)] bg-white px-4 py-2.5 text-[13px] shadow-none hover:bg-white focus:shadow-none"
              />
              <Button
                variant="primary"
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
