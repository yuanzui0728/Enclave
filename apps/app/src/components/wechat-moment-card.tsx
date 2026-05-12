import {
  forwardRef,
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { msg } from "@lingui/macro";
import {
  type Moment,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Heart, MapPin } from "lucide-react";
import { cn } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { MomentMediaGallery } from "./moment-media-gallery";

const t = translateRuntimeMessage;

type WeChatMomentCardProps = {
  moment: Moment;
  ownerId: string | null;
  liked: boolean;
  /** Hides the avatar+nickname header (used inside friend's own moments page). */
  hideAuthor?: boolean;
  /** Skip outer padding (px-4 pb-3.5 pt-3.5) — useful when wrapped in a row layout. */
  flush?: boolean;
  /** Highlight the card briefly after a like/comment to scroll-to-target use. */
  cardId?: string;
  /** When the user taps the ⋯ button. Parent should open the action bubble. */
  onOpenActionMenu: (anchorRect: DOMRect) => void;
  /** When the user taps the avatar/nickname. */
  onAuthorTap?: () => void;
  /** Double-tap anywhere on the card text/media area. Triggers like. */
  onDoubleTapLike?: () => void;
  /** When the user taps a comment row, start a reply targeting that comment. */
  onCommentTap?: (comment: MomentComment) => void;
  /** When the user taps a like row name (eg. to view profile). */
  onLikeAuthorTap?: (like: MomentLike) => void;
  /**
   * Tapping the inline 「删除」 link shown next to the timestamp on owner posts.
   * If omitted, the delete affordance is hidden entirely.
   */
  onDelete?: () => void;
};

const WECHAT_LINK_COLOR = "#576B95";
const WECHAT_TIMESTAMP_COLOR = "#9A9A9A";
const WECHAT_TEXT_COLOR = "#1A1A1A";

// memo + 自定义 comparator：朋友圈列表里 like / comment optimistic update 时
// setQueryData 用 data.map(m => m.id===target ? new : m) 保留其他 moment 对象
// 引用不变 — 包 memo 后 sibling card 跳过重渲染。
//
// 现实情况：caller (moments-page.tsx 等 7 处) 的 onAuthorTap / onOpenActionMenu
// 等 handler 都是 inline 箭头函数 (() => onLikeMoment(moment.id))，每次 parent
// render 都新引用。默认 shallow memo 看到 handler 引用变 → 重新渲染，等于没包。
// 这里改用 custom comparator 只比较"数据属性"，handler 引用变化不触发 re-render。
// 副作用：handler 内的闭包引用旧 parent 状态——但所有 handler 都是 fire-and-forget
// (调 mutation.mutate 等)，闭包的 stale 不会引发实际 bug（mutation 自身是稳定
// 引用，moment.id 通过 props 重新读到最新值）。
function arePropsEqual(
  prev: Readonly<WeChatMomentCardProps>,
  next: Readonly<WeChatMomentCardProps>,
) {
  return (
    prev.moment === next.moment &&
    prev.liked === next.liked &&
    prev.ownerId === next.ownerId &&
    prev.cardId === next.cardId &&
    prev.hideAuthor === next.hideAuthor &&
    prev.flush === next.flush &&
    // handler 「是否存在」也得比较 — 比如 onDelete 在非 owner moment 上是 undefined
    // 有/无的切换会改变 UI（删除链接显隐），不能忽略
    Boolean(prev.onDelete) === Boolean(next.onDelete) &&
    Boolean(prev.onAuthorTap) === Boolean(next.onAuthorTap) &&
    Boolean(prev.onDoubleTapLike) === Boolean(next.onDoubleTapLike) &&
    Boolean(prev.onCommentTap) === Boolean(next.onCommentTap) &&
    Boolean(prev.onLikeAuthorTap) === Boolean(next.onLikeAuthorTap)
  );
}

export const WeChatMomentCard = memo(forwardRef<HTMLElement, WeChatMomentCardProps>(
  function WeChatMomentCard(
    {
      moment,
      ownerId,
      liked,
      hideAuthor = false,
      flush = false,
      cardId,
      onOpenActionMenu,
      onAuthorTap,
      onDoubleTapLike,
      onCommentTap,
      onLikeAuthorTap,
      onDelete,
    },
    ref,
  ) {
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    const lastTapRef = useRef<number>(0);
    const [floatingHeart, setFloatingHeart] = useState(false);

    useEffect(() => {
      if (!floatingHeart) return;
      const timer = window.setTimeout(() => setFloatingHeart(false), 700);
      return () => window.clearTimeout(timer);
    }, [floatingHeart]);

    const handleAreaPointerDown = (event: PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      // Skip when tapping interactive children (buttons / links / textarea)
      if (target.closest("button,a,input,textarea,[data-no-doubletap]")) {
        return;
      }

      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        lastTapRef.current = 0;
        if (onDoubleTapLike && moment.canInteract) {
          onDoubleTapLike();
          setFloatingHeart(true);
        }
        return;
      }
      lastTapRef.current = now;
    };

    const openMoreMenu = (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const rect =
        moreButtonRef.current?.getBoundingClientRect() ??
        event.currentTarget.getBoundingClientRect();
      onOpenActionMenu(rect);
    };

    const hasText = Boolean(moment.text.trim());
    const hasMedia = moment.media.length > 0;
    const hasLikes = moment.likes.length > 0;
    const hasComments = moment.comments.length > 0;
    const showFooterBlock = hasLikes || hasComments;

    return (
      <article
        id={cardId}
        ref={ref}
        className={cn(
          "flex w-full items-start gap-2.5",
          flush ? "" : "px-4 pb-3.5 pt-3.5",
        )}
      >
        {!hideAuthor ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAuthorTap?.();
            }}
            aria-label={moment.authorName}
            className="shrink-0 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
          >
            <AvatarChip
              name={moment.authorName}
              src={moment.authorAvatar}
              size="wechat"
            />
          </button>
        ) : null}

        <div
          className="relative min-w-0 flex-1"
          onPointerDown={handleAreaPointerDown}
        >
          {!hideAuthor ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAuthorTap?.();
              }}
              className="block max-w-full truncate text-left text-[15px] font-medium leading-[20px]"
              style={{ color: WECHAT_LINK_COLOR }}
            >
              {moment.authorName}
            </button>
          ) : null}

          {hasText ? (
            <div
              className={cn(
                "whitespace-pre-wrap break-words text-[16px] leading-[24px]",
                hideAuthor ? "" : "mt-1.5",
              )}
              style={{ color: WECHAT_TEXT_COLOR }}
            >
              {moment.text}
            </div>
          ) : null}

          {hasMedia ? (
            <div
              className={cn(
                hasText ? "mt-2" : hideAuthor ? "" : "mt-1.5",
              )}
            >
              <MomentMediaGallery
                contentType={moment.contentType}
                media={moment.media}
                variant="mobile"
                stopPropagation
              />
            </div>
          ) : null}

          {moment.location ? (
            <div
              className="mt-2 inline-flex max-w-full items-center gap-0.5 truncate text-[12px]"
              style={{ color: WECHAT_LINK_COLOR }}
            >
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{moment.location}</span>
            </div>
          ) : null}

          <div
            className="mt-2 flex items-center justify-between gap-2 text-[12px]"
            style={{ color: WECHAT_TIMESTAMP_COLOR }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate">
                {formatWeChatTimestamp(moment.postedAt)}
              </span>
              {onDelete &&
              moment.authorType === "user" &&
              moment.authorId === ownerId ? (
                <>
                  <span style={{ color: WECHAT_TIMESTAMP_COLOR }}>·</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete();
                    }}
                    className="active:opacity-60"
                    style={{ color: WECHAT_LINK_COLOR }}
                    data-no-doubletap
                  >
                    {t(msg`删除`)}
                  </button>
                </>
              ) : null}
            </div>
            {moment.canInteract ? (
              <button
                ref={moreButtonRef}
                type="button"
                onClick={openMoreMenu}
                aria-label={t(msg`更多操作`)}
                className="inline-flex h-6 w-7 items-center justify-center rounded-[3px] bg-[#F2F2F2] text-[#4C4C4C] active:bg-[#E5E5E5]"
                data-no-doubletap
              >
                <MoreHorizontalDots />
              </button>
            ) : null}
          </div>

          {showFooterBlock ? (
            <div className="mt-2 overflow-hidden rounded-[3px] border border-[#EDEDED] bg-[#F7F7F7]">
              {hasLikes ? (
                <div className="flex flex-wrap items-start gap-1 px-2.5 py-1.5 text-[13px] leading-[20px]">
                  <Heart
                    size={13}
                    className="mt-1 shrink-0 fill-[#576B95] text-[#576B95]"
                  />
                  <div className="flex flex-wrap gap-x-1">
                    {moment.likes.map((like, index) => (
                      <span key={like.id ?? `${like.authorId}-${index}`}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onLikeAuthorTap?.(like);
                          }}
                          className="text-left hover:opacity-80"
                          style={{ color: WECHAT_LINK_COLOR }}
                          data-no-doubletap
                        >
                          {like.authorName}
                        </button>
                        {index < moment.likes.length - 1 ? (
                          <span style={{ color: WECHAT_LINK_COLOR }}>,</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasLikes && hasComments ? (
                <div className="h-px bg-[#EDEDED]" />
              ) : null}

              {hasComments ? (
                <div className="space-y-0.5 px-2.5 py-1.5 text-[13px] leading-[22px]">
                  {moment.comments.map((comment) => {
                    const replyToName = comment.replyToCommentId
                      ? moment.comments.find(
                          (item) => item.id === comment.replyToCommentId,
                        )?.authorName ?? null
                      : null;
                    return (
                      <button
                        key={comment.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCommentTap?.(comment);
                        }}
                        className="block w-full text-left active:bg-[#EFEFEF]"
                        style={{ color: WECHAT_TEXT_COLOR }}
                        data-no-doubletap
                      >
                        <span style={{ color: WECHAT_LINK_COLOR }}>
                          {comment.authorName}
                        </span>
                        {replyToName ? (
                          <>
                            <span> {t(msg`回复`)} </span>
                            <span style={{ color: WECHAT_LINK_COLOR }}>
                              {replyToName}
                            </span>
                          </>
                        ) : null}
                        <span>：{comment.text}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {floatingHeart ? <FloatingHeart liked={liked} /> : null}
        </div>
      </article>
    );
  },
), arePropsEqual);

function MoreHorizontalDots() {
  return (
    <svg
      width="14"
      height="3"
      viewBox="0 0 14 3"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="2" cy="1.5" r="1.2" />
      <circle cx="7" cy="1.5" r="1.2" />
      <circle cx="12" cy="1.5" r="1.2" />
    </svg>
  );
}

function FloatingHeart({ liked }: { liked: boolean }) {
  const style: CSSProperties = {
    animation:
      "wechat-double-tap-heart 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards",
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <Heart
        size={68}
        className={cn(
          "drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]",
          liked
            ? "fill-[#FA5151] text-[#FA5151]"
            : "fill-white/0 text-white/90",
        )}
        style={style}
      />
      <style>{`
        @keyframes wechat-double-tap-heart {
          0% { opacity: 0; transform: scale(0.5); }
          22% { opacity: 1; transform: scale(1.18); }
          50% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.92); }
        }
      `}</style>
    </div>
  );
}

function formatWeChatTimestamp(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) {
    return iso;
  }

  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return t(msg`刚刚`);
  if (diffMin < 60) return t(msg`${diffMin} 分钟前`);

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t(msg`${diffHour} 小时前`);

  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, yesterday)) return t(msg`昨天`);

  const diffDay = Math.floor((today.getTime() - ts) / 86400000);
  if (diffDay < 7) return t(msg`${diffDay} 天前`);

  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (date.getFullYear() === today.getFullYear()) {
    return t(msg`${month}月${day}日`);
  }
  return t(msg`${date.getFullYear()}年${month}月${day}日`);
}

