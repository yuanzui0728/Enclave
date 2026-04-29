import { useState } from "react";
import { Heart, MapPin, MessageCircle } from "lucide-react";
import { AvatarChip } from "./avatar-chip";
import { MomentCommentComposer } from "./moment-comment-composer";
import { formatTimestamp } from "../lib/format";

type MomentPostCardProps = {
  authorName: string;
  authorAvatar?: string | null;
  text: string;
  location?: string | null;
  postedAt: string;
  likes: { id: string; authorName: string }[];
  comments: { id: string; authorName: string; text: string }[];
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
    <div className="flex gap-3 border-b border-[rgba(0,0,0,0.06)] bg-white px-4 py-4">
      {/* Left: Avatar */}
      <div className="shrink-0">
        <AvatarChip name={authorName} src={authorAvatar} size="wechat" />
      </div>

      {/* Right: Content */}
      <div className="min-w-0 flex-1">
        {/* Author name */}
        <div className="text-[15px] font-medium text-[#15803d]">{authorName}</div>

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
              className="flex items-center gap-1 text-[color:var(--text-muted)] transition-colors hover:text-[#15803d] disabled:opacity-50"
            >
              <Heart size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowCommentBox((v) => !v)}
              className="flex items-center gap-1 text-[color:var(--text-muted)] transition-colors hover:text-[#15803d]"
            >
              <MessageCircle size={16} />
            </button>
          </div>
        </div>

        {/* Likes + Comments interaction area */}
        {(likes.length > 0 || comments.length > 0) ? (
          <div className="mt-2 rounded-[6px] bg-[rgba(0,0,0,0.04)] px-3 py-2 text-[13px] leading-[1.7]">
            {/* Likes */}
            {likes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-1">
                <Heart size={12} className="shrink-0 fill-[#15803d] text-[#15803d]" />
                <span className="text-[#15803d]">
                  {likes.map((l) => l.authorName).join("，")}
                </span>
              </div>
            ) : null}

            {/* Divider between likes and comments */}
            {likes.length > 0 && comments.length > 0 ? (
              <div className="my-1.5 border-t border-[rgba(0,0,0,0.08)]" />
            ) : null}

            {/* Comments */}
            {comments.map((comment) => (
              <div key={comment.id} className="text-[color:var(--text-primary)]">
                <span className="font-medium text-[#15803d]">{comment.authorName}</span>
                <span className="text-[color:var(--text-muted)]">：</span>
                <span>{comment.text}</span>
              </div>
            ))}
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
              placeholder="评论..."
              className="w-full"
              inputClassName="rounded-full py-1.5 text-[16px]"
              buttonClassName="bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
