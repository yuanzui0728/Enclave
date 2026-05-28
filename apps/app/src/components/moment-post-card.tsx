import { useState } from "react";
import { msg } from "@lingui/macro";
import { Heart, MapPin, MessageCircle } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { AvatarChip } from "./avatar-chip";
import { MomentCommentComposer } from "./moment-comment-composer";
import { formatTimestamp } from "../lib/format";

const t = translateRuntimeMessage;

type MomentPostCardComment = {
  id: string;
  authorName: string;
  text: string;
  replyToCommentId?: string | null;
  replyToAuthorName?: string | null;
};

type MomentPostCardProps = {
  authorName: string;
  authorAvatar?: string | null;
  text: string;
  location?: string | null;
  postedAt: string;
  likes: { id: string; authorName: string }[];
  comments: MomentPostCardComment[];
  onLike: () => void;
  likeLoading: boolean;
  commentDraft: string;
  onCommentChange: (v: string) => void;
  onCommentSubmit: () => void;
  commentLoading: boolean;
};

export function MomentPostCard({
  authorName,
  authorAvatar,
  text,
  location,
  postedAt,
  likes,
  comments,
  onLike,
  likeLoading,
  commentDraft,
  onCommentChange,
  onCommentSubmit,
  commentLoading,
}: MomentPostCardProps) {
  const [showCommentBox, setShowCommentBox] = useState(false);

  return (
    <div className="flex gap-3 border-b border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-4">
      {/* Left: Avatar */}
      <div className="shrink-0">
        <AvatarChip name={authorName} src={authorAvatar} size="wechat" />
      </div>

      {/* Right: Content */}
      <div className="min-w-0 flex-1">
        {/* Author name */}
        <div className="text-[15px] font-medium text-[color:var(--brand-primary)]">{authorName}</div>

        {/* Post text */}
        <div className="mt-1 text-[15px] leading-[1.6] text-[color:var(--text-primary)]">{text}</div>

        {/* Location */}
        {location ? (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-[color:var(--text-muted)]">
            <MapPin size={11} />
            <span>{location}</span>
          </div>
        ) : null}

        {/* Timestamp + action buttons */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-[color:var(--text-muted)]">{formatTimestamp(postedAt)}</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onLike}
              disabled={likeLoading}
              className="flex items-center gap-1 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--brand-primary)] disabled:opacity-50"
            >
              <Heart size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowCommentBox((v) => !v)}
              className="flex items-center gap-1 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--brand-primary)]"
            >
              <MessageCircle size={16} />
            </button>
          </div>
        </div>

        {/* Likes + Comments interaction area */}
        {(likes.length > 0 || comments.length > 0) ? (
          <div className="mt-2 rounded-[6px] bg-[color:var(--surface-secondary)] px-3 py-2 text-[13px] leading-[1.7]">
            {/* Likes */}
            {likes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-1">
                <Heart size={12} className="shrink-0 fill-[color:var(--brand-primary)] text-[color:var(--brand-primary)]" />
                <span className="text-[color:var(--brand-primary)]">
                  {likes.map((l) => l.authorName).join("，")}
                </span>
              </div>
            ) : null}

            {/* Divider between likes and comments */}
            {likes.length > 0 && comments.length > 0 ? (
              <div className="my-1.5 border-t border-[color:var(--border-faint)]" />
            ) : null}

            {/* Comments */}
            {comments.map((comment) => {
              const replyToName =
                comment.replyToCommentId && comment.replyToAuthorName
                  ? comment.replyToAuthorName
                  : null;
              return (
                <div key={comment.id} className="text-[color:var(--text-primary)]">
                  <span className="font-medium text-[color:var(--brand-primary)]">{comment.authorName}</span>
                  {replyToName ? (
                    <>
                      <span className="text-[color:var(--text-muted)]">{t(msg` 回复 `)}</span>
                      <span className="font-medium text-[color:var(--brand-primary)]">{replyToName}</span>
                    </>
                  ) : null}
                  <span className="text-[color:var(--text-muted)]">：</span>
                  <span>{comment.text}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Comment input */}
        {showCommentBox ? (
          <div className="mt-2">
            <MomentCommentComposer
              value={commentDraft}
              onChange={onCommentChange}
              onSubmit={onCommentSubmit}
              pending={commentLoading}
              placeholder={t(msg`评论...`)}
              className="w-full"
              inputClassName="rounded-full py-1.5 text-[16px]"
              buttonClassName="bg-[color:var(--brand-primary)] text-[#3b2206] shadow-none hover:bg-[color:var(--brand-primary)]"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
