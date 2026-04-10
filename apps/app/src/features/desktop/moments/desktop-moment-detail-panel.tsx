import { type Moment } from "@yinjie/contracts";
import { Button, TextField, cn } from "@yinjie/ui";
import { Bot, Heart, MapPin, MessageCircle, UserRound, X } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { formatTimestamp } from "../../../lib/format";

type DesktopMomentDetailPanelProps = {
  commentDraft: string;
  commentLoading: boolean;
  likeLoading: boolean;
  moment: Moment;
  ownerId?: string | null;
  onClose: () => void;
  onCommentChange: (value: string) => void;
  onCommentSubmit: () => void;
  onLike: () => void;
  onSelectAuthor: () => void;
};

export function DesktopMomentDetailPanel({
  commentDraft,
  commentLoading,
  likeLoading,
  moment,
  ownerId,
  onClose,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onSelectAuthor,
}: DesktopMomentDetailPanelProps) {
  const likedByOwner = Boolean(
    ownerId && moment.likes.some((like) => like.authorId === ownerId),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[rgba(15,23,42,0.06)] px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            动态详情
          </div>
          <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
            在当前工作区继续看完
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

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={onSelectAuthor}
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSelectAuthor}
                  className="truncate text-left text-base font-semibold text-[color:var(--text-primary)]"
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
          </div>

          <div className="mt-4 text-[15px] leading-7 text-[color:var(--text-primary)]">
            {moment.text}
          </div>

          <div className="mt-4 rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-3 text-[12px] leading-6 text-[color:var(--text-secondary)]">
            <span>{moment.likeCount} 赞</span>
            <span className="mx-2 text-[color:var(--text-dim)]">/</span>
            <span>{moment.commentCount} 评论</span>
            <span className="mx-2 text-[color:var(--text-dim)]">/</span>
            <span>{moment.authorType === "character" ? "角色动态" : "我的动态"}</span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={likeLoading}
              onClick={onLike}
              className={likedByOwner ? "bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)] shadow-none" : undefined}
            >
              <Heart size={14} className={likedByOwner ? "fill-current" : ""} />
              {likeLoading ? "处理中..." : likedByOwner ? "已点赞" : "点赞"}
            </Button>
            <Button variant="secondary" size="sm" onClick={onSelectAuthor}>
              查看 TA 的动态
            </Button>
          </div>
        </div>

        {moment.likes.length > 0 ? (
          <div className="mt-4 rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <div className="text-[13px] font-semibold text-[color:var(--text-primary)]">
              点赞的人
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {moment.likes.map((like) => (
                <span
                  key={like.id}
                  className="rounded-full bg-[rgba(248,250,252,0.98)] px-3 py-2 text-[12px] text-[color:var(--text-secondary)]"
                >
                  {like.authorName}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--text-primary)]">
            <MessageCircle size={14} />
            评论区
          </div>

          {moment.comments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {moment.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-3"
                  >
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="font-medium text-[color:var(--text-primary)]">
                      {comment.authorName}
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
      </div>
    </div>
  );
}
