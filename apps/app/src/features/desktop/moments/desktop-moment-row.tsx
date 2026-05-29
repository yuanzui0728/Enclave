import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { msg } from "@lingui/macro";
import {
  type Moment,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, cn } from "@yinjie/ui";
import {
  Bot,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { MomentCommentComposer } from "../../../components/moment-comment-composer";
import { MomentMediaGallery } from "../../../components/moment-media-gallery";
import { stripToolCallSyntax } from "../../moments/moment-content";
import { formatTimestamp } from "../../../lib/format";

export type MomentCommentReplyTarget = {
  authorId: string;
  authorName: string;
  commentId: string;
  postId: string;
};

type DesktopMomentRowProps = {
  authorActionAriaLabel?: string;
  authorActionLabel?: string;
  commentDraft: string;
  commentLoading: boolean;
  commentReplyTarget?: MomentCommentReplyTarget | null;
  deleteLoading?: boolean;
  likeLoading: boolean;
  moment: Moment;
  ownerId?: string | null;
  favorite: boolean;
  onCancelCommentReply?: () => void;
  onCommentChange: (value: string) => void;
  onCommentSubmit: () => void;
  onDelete?: () => void;
  onLike: () => void;
  /**
   * 点击「分享」时把这条 moment 抛上去做导出图卡。可选：不传时菜单里不显示分享项。
   */
  onShare?: () => void;
  onStartCommentReply?: (comment: MomentComment) => void;
  onToggleFavorite: () => void;
  onAuthorAction?: () => void;
  onSelectAuthor?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  /** Tap a name in the like row → open that user's profile/info card. */
  onSelectLiker?: (
    event: ReactMouseEvent<HTMLButtonElement>,
    like: MomentLike,
  ) => void;
};

function DesktopMomentRowInner({
  authorActionAriaLabel,
  authorActionLabel,
  commentDraft,
  commentLoading,
  commentReplyTarget = null,
  deleteLoading = false,
  likeLoading,
  moment,
  ownerId,
  favorite,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onDelete,
  onLike,
  onShare,
  onStartCommentReply,
  onToggleFavorite,
  onAuthorAction,
  onSelectAuthor,
  onSelectLiker,
}: DesktopMomentRowProps) {
  const t = useRuntimeTranslator();
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusComposer = () => {
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handleDocumentClick(event: MouseEvent) {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function handleDeleteClick() {
    if (!onDelete) {
      return;
    }
    setMenuOpen(false);
    if (
      typeof window !== "undefined" &&
      !window.confirm(t(msg`确定要删除这条朋友圈吗？此操作无法撤销。`))
    ) {
      return;
    }
    onDelete();
  }
  const likedByOwner = Boolean(
    ownerId && moment.likes.some((like) => like.authorId === ownerId),
  );
  const displayText = stripToolCallSyntax(moment.text);
  const hasText = Boolean(displayText);
  const canSelectAuthor = Boolean(onSelectAuthor);
  // 必须串上 moment.canInteract：父 workspace 无条件传 onStartCommentReply，
  // 但非好友角色的 moment 评论框是「加为好友后才能评论」placeholder ——
  // 之前 canReply 还是 true，评论行变成 button、点了能把 reply target 写入
  // state、UI 弹出"正在回复 X"，但下面没有 composer 可发送，用户卡死。
  const canReply = Boolean(onStartCommentReply) && moment.canInteract;
  const activeReply =
    canReply && commentReplyTarget && commentReplyTarget.postId === moment.id
      ? commentReplyTarget
      : null;
  const activeActionClassName =
    "border-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)] shadow-[inset_0_-2px_0_0_var(--brand-primary)]";

  const commentsById = useMemo(
    () =>
      new Map(moment.comments.map((comment) => [comment.id, comment] as const)),
    [moment.comments],
  );
  const authorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const comment of moment.comments) {
      if (comment.authorId && comment.authorName) {
        map.set(comment.authorId, comment.authorName);
      }
    }
    return map;
  }, [moment.comments]);
  // 走查电脑端朋友圈 R2（新一轮）：每条评论文本都要走 stripToolCallSyntax 把
  // AI 角色偶发漏出的 [TOOL_CALL] / <tool_call> 语法剥掉。之前 CommentLine
  // 内部 inline 算 + activeReply 那块 inline 算，整行 50 条评论 + 用户每按
  // 一键 commentDraft 变 → row 不命中 memo → 50 次正则；同样 activeReply 框里
  // replyTargetComment.text 也每帧 strip 一次。和 wechat-moment-card.tsx 行
  // 162-179 mobile 早就走的 cleanTextById 预计算同模式，按 moment.comments 引用
  // 变化做缓存 key，typing 期间 row 重渲只读 Map.get 不再扫正则。
  //
  // 走查 R8（本轮）：strip 后空文本的评论必须从渲染列表里整条砍掉，跟 mobile
  // wechat-moment-card.tsx 行 172-179 visibleComments 同模式。原版 desktop 走
  // 「comment.map → cleanText = (cleanCommentTextById.get(c.id) ?? c.text)」
  // 后直接渲染 CommentLine —— 一旦 cleanText 是空字符串，UI 上就冒一行
  // 「Mary：」后面什么都没有的孤儿评论（AI 角色把 [TOOL_CALL] / 一段 CoT
  // prose 当评论发出来 → stripToolCallSyntax → 空），用户读到「Mary：__空__」
  // 完全不懂在评什么。mobile 同源 bug 早就修了，desktop 漏。同时把 visible 评
  // 论的真实数量算出来，footer 头部「N 条」按 visible 计数显示，避免
  // server-side commentCount=50 但渲染只剩 48 的肉眼可见错位。
  const { cleanCommentTextById, visibleComments } = useMemo(() => {
    const map = new Map<string, string>();
    const visible: MomentComment[] = [];
    for (const c of moment.comments) {
      const cleanText = stripToolCallSyntax(c.text);
      map.set(c.id, cleanText);
      if (cleanText.trim().length === 0) continue;
      visible.push(c);
    }
    return { cleanCommentTextById: map, visibleComments: visible };
  }, [moment.comments]);

  function lookupReplyToName(comment: MomentComment) {
    if (!comment.replyToAuthorId) {
      return null;
    }
    if (comment.replyToCommentId) {
      const target = commentsById.get(comment.replyToCommentId);
      if (target?.authorName) {
        return target.authorName;
      }
    }
    return authorNameById.get(comment.replyToAuthorId) ?? null;
  }

  return (
    <article
      id={`desktop-moment-post-${moment.id}`}
      className="relative rounded-[var(--radius-md)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-[var(--shadow-section)]"
    >
      {onDelete || onShare ? (
        <div ref={menuRef} className="absolute right-3 top-3">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            disabled={deleteLoading}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t(msg`更多操作`)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:opacity-55"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-9 z-10 min-w-[140px] overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
            >
              {onShare ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onShare();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-caption)] text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--surface-console)]"
                >
                  <Share2 size={14} />
                  {t(msg`分享图卡`)}
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDeleteClick}
                  disabled={deleteLoading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-caption)] text-[color:var(--state-danger-text)] transition-colors hover:bg-[color:var(--state-danger-bg)] disabled:opacity-55"
                >
                  <Trash2 size={14} />
                  {deleteLoading ? t(msg`删除中...`) : t(msg`删除朋友圈`)}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        {canSelectAuthor ? (
          <button
            type="button"
            onClick={(event) => onSelectAuthor?.(event)}
            className="shrink-0 rounded-[18px]"
            aria-label={
              authorActionAriaLabel ??
              t(msg`查看 ${moment.authorName} 的朋友圈`)
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
            {/* 走查电脑端朋友圈 R1（本轮）：右上角 ⋯ 菜单按钮是 absolute right-3 top-3
                + h-8 w-8，正好压在 article px-4 + content (min-w-0 flex-1) 的右上
                28px 范围里。当 moment 是用户/角色自己发的（onDelete || onShare → 渲
                菜单按钮）且作者名较长（10+ 字符）或 i18n 把"角色"badge 翻译成更长
                的"NPC Character"等英文时，badge 会沉到 ⋯ 按钮底下被遮 ~28px。CDP
                实测 7+ 字符的中文用户名加上「角色」badge 已经卡在被遮边缘。给
                name+badge 行 + 时间戳行加 pr-9 (36px) 留出菜单按钮宽度（32px）
                + 几像素安全距离；只在菜单实际渲染时加，避免没有菜单时浪费右侧
                可视空间。其他行（text body / media gallery / comments）在菜单
                按钮 y 范围之外，不受影响，保持全宽显示。 */}
            <div
              className={cn(
                "flex items-center gap-2",
                (onDelete || onShare) && "pr-9",
              )}
            >
              {canSelectAuthor ? (
                <button
                  type="button"
                  onClick={(event) => onSelectAuthor?.(event)}
                  className="truncate text-left text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]"
                >
                  {moment.authorName}
                </button>
              ) : (
                <div className="truncate text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]">
                  {moment.authorName}
                </div>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium tracking-[0.12em]",
                  moment.authorType === "character"
                    ? "border-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)] text-[color:var(--brand-primary)]"
                    : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
                )}
              >
                {moment.authorType === "character" ? (
                  <Bot size={11} />
                ) : (
                  <UserRound size={11} />
                )}
                {moment.authorType === "character" ? t(msg`角色`) : t(msg`我`)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
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
            // 走查 R3：之前缺 whitespace-pre-wrap break-words —— 用户在 compose
            // 面板换行输入的多行 moment（比如"今天上午 …\n下午 …\n晚上 …"）
            // 在桌面端直接被压成单行；mobile WeChatMomentCard 早就挂着
            // whitespace-pre-wrap (line 235 周围)。另外没 break-words 时，
            // 一长串 URL / 不带空格的 ID 会撑破卡片宽度，把右侧 ⋯ 菜单挤出
            // 滚动条。两个 class 一并补齐。
            <div className="mt-3 whitespace-pre-wrap break-words text-[length:var(--text-base)] leading-7 text-[color:var(--text-primary)]">
              {displayText}
            </div>
          ) : null}

          {moment.media.length > 0 ? (
            <div className={hasText ? "mt-3" : "mt-4"}>
              <MomentMediaGallery
                contentType={moment.contentType}
                media={moment.media}
              />
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
              {/* 走查 R9：action 行的 "X 赞 · Y 评论" 摘要与下方 comment 头部
                  「N 条」用同一份 visible 计数，避免摘要写 50 评论、下面只展
                  开 48 条的可见错位（R8 已把渲染列表过滤到 visibleComments）。
                  likeCount 仍用 server 值——点赞列表没有「strip 后空内容」
                  的过滤需求，optimisticLike onMutate 已与 moment.likes 同步。 */}
              {moment.likeCount > 0 || visibleComments.length > 0
                ? t(msg`${moment.likeCount} 赞 · ${visibleComments.length} 评论`)
                : t(msg`还没有互动`)}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={likeLoading || !moment.canInteract}
                title={
                  !moment.canInteract
                    ? t(msg`加为好友后才能互动`)
                    : undefined
                }
                onClick={onLike}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[length:var(--text-caption)] transition-[background-color,border-color,color] disabled:opacity-55",
                  likedByOwner
                    ? activeActionClassName
                    : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
                )}
              >
                <Heart
                  size={14}
                  className={likedByOwner ? "fill-current" : ""}
                />
                {likeLoading
                  ? t(msg`处理中...`)
                  : likedByOwner
                    ? t(msg`已赞`)
                    : t(msg`赞`)}
              </button>
              <button
                type="button"
                onClick={onToggleFavorite}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[length:var(--text-caption)] transition-[background-color,border-color,color]",
                  favorite
                    ? "border-[color:var(--state-warning-bg)] bg-[color:var(--state-warning-bg)] text-[color:var(--state-warning-text)]"
                    : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)] hover:border-[color:var(--state-warning-bg)] hover:bg-[color:var(--state-warning-bg)] hover:text-[color:var(--text-primary)]",
                )}
              >
                <Star size={14} className={favorite ? "fill-current" : ""} />
                {favorite ? t(msg`已收藏`) : t(msg`收藏`)}
              </button>
              {onAuthorAction ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onAuthorAction}
                  className="border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                >
                  {authorActionLabel ?? t(msg`打开 TA 的朋友圈`)}
                </Button>
              ) : null}
            </div>
          </div>

          {moment.likes.length > 0 ? (
            <div className="mt-3 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-secondary)]">
                <Heart
                  size={12}
                  className="mr-1 text-[color:var(--brand-primary)]"
                />
                {moment.likes.map((like, index) => (
                  <span
                    key={like.id ?? `${like.authorId}-${index}`}
                    className="inline-flex items-center"
                  >
                    {onSelectLiker ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectLiker(event, like);
                        }}
                        className="text-[color:var(--brand-primary)] transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--brand-primary)_34%,transparent)] focus-visible:ring-offset-1"
                      >
                        {like.authorName}
                      </button>
                    ) : (
                      <span>{like.authorName}</span>
                    )}
                    {index < moment.likes.length - 1 ? (
                      <span className="px-0.5">、</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-3 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
                <MessageCircle size={13} />
                {t(msg`评论`)}
              </div>
              <span className="text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
                {/* 走查 R8：用 visibleComments.length 而不是 server-side
                    moment.commentCount —— 后者把空胶水帖评论也算进去，
                    渲染列表已经按 visibleComments 过滤掉空 cleanText 后，
                    header 文案再显示 commentCount 会出现「50 条」但下面
                    只渲染 48 条的肉眼可见错位。 */}
                {t(msg`${visibleComments.length} 条`)}
              </span>
            </div>

            {visibleComments.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {visibleComments.map((comment) => {
                  const replyToName = lookupReplyToName(comment);
                  const isActiveReply =
                    activeReply?.commentId === comment.id;
                  // 走查 R2：从 useMemo'd cleanCommentTextById 取已 strip 过的
                  // 文本，CommentLine 不再 inline 跑正则。
                  const cleanText =
                    cleanCommentTextById.get(comment.id) ?? comment.text;
                  if (!canReply) {
                    return (
                      <div
                        key={comment.id}
                        className="rounded-[10px] px-2 py-1.5 text-[length:var(--text-caption)] leading-6"
                      >
                        <CommentLine
                          authorName={comment.authorName}
                          replyToName={replyToName}
                          text={cleanText}
                        />
                      </div>
                    );
                  }
                  return (
                    <button
                      key={comment.id}
                      type="button"
                      onClick={() => {
                        onStartCommentReply?.(comment);
                        focusComposer();
                      }}
                      className={cn(
                        "block w-full rounded-[10px] px-2 py-1.5 text-left text-[length:var(--text-caption)] leading-6 transition-colors",
                        isActiveReply
                          ? "bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)]"
                          : "hover:bg-[color:var(--surface-card)]",
                      )}
                      title={t(msg`回复这条评论`)}
                    >
                      <CommentLine
                        authorName={comment.authorName}
                        replyToName={replyToName}
                        text={cleanText}
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                {/* canInteract=false 的角色 moment 底下评论框被换成「加为好友才能评论」， */}
                {/* 上面挂「成为第一个回应的人」会撞车 —— 用户读着像在被催促互动，结果发不出。 */}
                {moment.canInteract
                  ? t(msg`还没有评论，你可以成为第一个回应的人。`)
                  : t(msg`还没有评论。`)}
              </div>
            )}

            {activeReply ? (
              (() => {
                const replyTargetComment = commentsById.get(
                  activeReply.commentId,
                );
                return (
                  <div className="mt-3 flex items-start justify-between gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--brand-primary)_18%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)] px-3 py-2 text-[length:var(--text-caption)] text-[color:var(--text-secondary)]">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="truncate">
                        {t(msg`正在回复 ${activeReply.authorName}`)}
                      </div>
                      {replyTargetComment ? (
                        <div className="truncate text-[color:var(--text-muted)]">
                          {t(msg`「${cleanCommentTextById.get(replyTargetComment.id) ?? stripToolCallSyntax(replyTargetComment.text)}」`)}
                        </div>
                      ) : null}
                    </div>
                    {onCancelCommentReply ? (
                      <button
                        type="button"
                        onClick={onCancelCommentReply}
                        aria-label={t(msg`取消回复`)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)] hover:bg-[color:var(--surface-card)]"
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </div>
                );
              })()
            ) : null}

            <div className="mt-3 border-t border-[color:var(--border-faint)] pt-3">
              {moment.canInteract ? (
                <MomentCommentComposer
                  value={commentDraft}
                  onChange={onCommentChange}
                  onSubmit={onCommentSubmit}
                  pending={commentLoading}
                  inputRef={composerInputRef}
                  placeholder={
                    activeReply
                      ? t(msg`回复 ${activeReply.authorName}...`)
                      : t(msg`写评论...`)
                  }
                  inputClassName="rounded-xl border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2 text-[length:var(--text-caption)] shadow-none hover:bg-[color:var(--surface-card)] focus:border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] focus:shadow-none"
                  buttonClassName="bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)] shadow-none hover:opacity-95"
                />
              ) : (
                <div className="rounded-xl border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                  {t(msg`加为好友后才能评论。`)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

// 列表里通常一次只有 1 条 moment 真变（点赞/评论 optimistic patch 用
// items.map 显式保留未改条目的原引用），剩下 200+ 条 prev.moment === next.moment。
// 父组件的 inline callback 在重渲时换引用，但闭包里 bind 的还是同一个 moment.id，
// 所以忽略 callback 引用差异是安全的：跳过这种没意义的重渲是巨大的体感提升
// （之前在 compose 面板里打字每一个字符都让 249 行全跑一遍）。
export const DesktopMomentRow = memo(DesktopMomentRowInner, (prev, next) => {
  return (
    prev.moment === next.moment &&
    prev.ownerId === next.ownerId &&
    prev.favorite === next.favorite &&
    prev.commentDraft === next.commentDraft &&
    prev.commentLoading === next.commentLoading &&
    prev.likeLoading === next.likeLoading &&
    prev.deleteLoading === next.deleteLoading &&
    prev.commentReplyTarget === next.commentReplyTarget &&
    prev.authorActionAriaLabel === next.authorActionAriaLabel &&
    prev.authorActionLabel === next.authorActionLabel &&
    // 「能否执行某动作」由父级是否传 callback 决定。callback 本身换引用不重要，
    // 但有/无的状态切换必须让 row 重渲（比如解除拉黑后从只读切到可评论）。
    Boolean(prev.onDelete) === Boolean(next.onDelete) &&
    Boolean(prev.onShare) === Boolean(next.onShare) &&
    Boolean(prev.onStartCommentReply) === Boolean(next.onStartCommentReply) &&
    Boolean(prev.onSelectAuthor) === Boolean(next.onSelectAuthor) &&
    Boolean(prev.onSelectLiker) === Boolean(next.onSelectLiker) &&
    Boolean(prev.onAuthorAction) === Boolean(next.onAuthorAction)
  );
});

function CommentLine({
  authorName,
  replyToName,
  text,
}: {
  authorName: string;
  replyToName: string | null;
  /** 调用方已经过 stripToolCallSyntax 过滤——见 cleanCommentTextById 注释。 */
  text: string;
}) {
  const translate = useRuntimeTranslator();
  return (
    <span>
      <span className="font-medium text-[color:var(--brand-primary)]">{authorName}</span>
      {replyToName ? (
        <>
          <span className="text-[color:var(--text-secondary)]">
            {translate(msg` 回复 `)}
          </span>
          <span className="font-medium text-[color:var(--brand-primary)]">{replyToName}</span>
        </>
      ) : null}
      <span className="text-[color:var(--text-secondary)]">
        {translate(msg`：`)}
      </span>
      <span className="text-[color:var(--text-primary)]">{text}</span>
    </span>
  );
}
