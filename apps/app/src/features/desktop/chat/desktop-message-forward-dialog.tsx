import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { msg } from "@lingui/macro";
import { Search, X } from "lucide-react";
import { type ConversationListItem } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, LoadingBlock, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import {
  getConversationThreadLabel,
  isPersistedGroupConversation,
} from "../../../lib/conversation-route";
import { formatMessageTimestamp, parseTimestamp } from "../../../lib/format";

export type DesktopMessageForwardPreviewItem = {
  id: string;
  senderName: string;
  previewText: string;
  typeLabel: string;
};

export type DesktopMessageForwardMode = "separate" | "merged";

type DesktopMessageForwardDialogProps = {
  open: boolean;
  messages: DesktopMessageForwardPreviewItem[];
  conversations: ConversationListItem[];
  supportsSeparateMode?: boolean;
  variant?: "mobile" | "desktop";
  loading?: boolean;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onForward: (
    conversation: ConversationListItem,
    mode: DesktopMessageForwardMode,
  ) => void;
};

export function DesktopMessageForwardDialog({
  open,
  messages,
  conversations,
  supportsSeparateMode = true,
  variant,
  loading = false,
  pending = false,
  error,
  onClose,
  onForward,
}: DesktopMessageForwardDialogProps) {
  const t = useRuntimeTranslator();
  const [searchTerm, setSearchTerm] = useState("");
  // 走查 R3：和姊妹 picker / removal-picker / create-group-dialog / browser
  // 一批 dialog 同款 keystroke 卡顿。filteredConversations 直接吃 searchTerm，
  // 每次按键先做 [...conversations].sort() 再 filter；活跃用户 100+ 会话时
  // 输入框可见 backlog。useDeferredValue 让 React 先把字打进输入框、过滤排
  // 到下个 idle 帧。
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [forwardMode, setForwardMode] =
    useState<DesktopMessageForwardMode>("separate");
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const isMobile = variant ? variant === "mobile" : isCompactViewport;
  const titleId = useId();
  const descId = useId();
  // 同步防双击锁——下面会话行 button 用 `disabled={pending}` 兜底，pending 是
  // 父组件的 forwardMutation.isPending 经 React commit 才更新。同帧连点同一行
  // 2 次会同时通过 disabled=false → 两次 onForward(conv, mode) → 父组件的
  // forwardMutation.mutate 飞 2 次，目标群里收 2 条一模一样的转发消息。ref
  // 同步赋值挡掉同帧第二次 click；pending 翻 true 后 disabled 接管常规 click，
  // pending 翻回 false（mutation 完成 / 失败）时通过下方 useEffect 复位 ref。
  const forwardSubmittingRef = useRef(false);
  useEffect(() => {
    if (!pending) {
      forwardSubmittingRef.current = false;
    }
  }, [pending]);
  const handleForwardRowClick = (conversation: ConversationListItem) => {
    if (forwardSubmittingRef.current || pending) return;
    forwardSubmittingRef.current = true;
    onForward(conversation, forwardMode);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
    setForwardMode(supportsSeparateMode ? "separate" : "merged");
  }, [open, supportsSeparateMode]);

  useEffect(() => {
    if (supportsSeparateMode || forwardMode !== "separate") {
      return;
    }

    setForwardMode("merged");
  }, [forwardMode, supportsSeparateMode]);

  useEffect(() => {
    if (variant || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsCompactViewport(mediaQuery.matches);
    syncViewport();

    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, [variant]);

  // 转发还在 pending 的时候不能用 Esc 强制关掉——服务端那一发已经在
  // 飞，弹层一关 pending state 就消失，用户拿不到任何成功/失败反馈。
  // 等 mutation 落地后由 onClose 自然处理。
  useEffect(() => {
    if (!open || pending) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      // 转发弹层是 modal 层；Esc 应只关掉它，避免冒泡到 workspace
      // dismissSidePanel 把背后的详情/查找记录侧栏也一并关掉。
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, pending]);

  // 走查 R3：把 sort 和 filter 拆开。原版 useMemo 把 [...conversations].sort()
  // 也放在 deferredSearchTerm dep 内，每个 keystroke 都重排一次。conversations
  // 本身只在 query refetch 才换引用，把 sort 单独 memoize 节省 N log N。
  const orderedConversations = useMemo(
    () =>
      [...conversations].sort(
        (left, right) =>
          (parseTimestamp(right.lastActivityAt) ?? 0) -
          (parseTimestamp(left.lastActivityAt) ?? 0),
      ),
    [conversations],
  );
  const filteredConversations = useMemo(() => {
    const keyword = deferredSearchTerm.trim().toLowerCase();
    if (!keyword) {
      return orderedConversations;
    }

    return orderedConversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(keyword),
    );
  }, [deferredSearchTerm, orderedConversations]);

  if (!open) {
    return null;
  }

  return (
    // 走查新一轮 R12：和姊妹 confirm/text-edit dialog 同款 portal-shield。
    // 转发弹层是从消息列表 / 多选「转发」打开，desktop 路径下背后通常有
    // 「聊天信息」侧栏；用户在 dialog 里点搜索框 / 会话行时 workspace
    // pointerdown capture 会把侧栏偷关。Esc 路径已 stopPropagation。
    <div
      data-yj-portal-shield="desktop-message-forward-dialog"
      className={cn(
        "fixed inset-0 z-50",
        isMobile
          ? "bg-[#ededed]"
          : "flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-3 backdrop-blur-[3px] sm:p-4 lg:p-6",
      )}
    >
      {!isMobile ? (
        <button
          type="button"
          aria-label={t(msg`关闭转发消息弹层`)}
          onClick={() => {
            if (!pending) {
              onClose();
            }
          }}
          className="absolute inset-0"
        />
      ) : null}

      {/* 走查 R3：和 R2 confirm/text-edit、姊妹 feature-unavailable / mobile sheet
          系列同款 a11y 缺漏——modal 但没挂 role="dialog" + aria-modal +
          aria-labelledby / aria-describedby。单聊消息列表右键「转发」、桌面
          多选「转发」都会弹这个 dialog；盲人用户屏幕阅读器只听到「关闭转发消息
          弹层 按钮」+ 输入框 + 会话行，无从知道这是个转发对话框。补语义。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={cn(
          "relative flex min-w-0 flex-col overflow-hidden",
          isMobile
            ? "h-full bg-[#ededed]"
            : "max-h-[85vh] w-full max-w-[1080px] rounded-[22px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)] lg:max-h-[80vh] lg:flex-row",
        )}
      >
        {isMobile ? (
          <MobileForwardHeader
            messageCount={messages.length}
            titleId={titleId}
            descId={descId}
            pending={pending}
            onClose={onClose}
          />
        ) : null}

        <section
          className={cn(
            "flex shrink-0 flex-col",
            isMobile
              ? "border-b border-black/5 bg-[#f6f6f6]"
              : "max-h-[38vh] w-full border-b border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)] lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r",
          )}
        >
          {!isMobile ? (
            <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-4 py-4 backdrop-blur-xl lg:px-5 lg:py-5">
              <div
                id={titleId}
                className="text-[18px] font-medium text-[color:var(--text-primary)]"
              >
                {t(msg`转发消息`)}
              </div>
              <div
                id={descId}
                className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]"
              >
                {messages.length === 1
                  ? t(msg`把这条消息转发到最近会话。`)
                  : t(msg`把选中的 ${messages.length} 条消息转发到最近会话。`)}
              </div>
            </div>
          ) : (
            <div className="px-3 pb-3 pt-2">
              <div className="px-1 text-[12px] text-[#8c8c8c]">{t(msg`已选消息`)}</div>
            </div>
          )}

          <div
            className={cn(
              "min-h-0 overflow-auto",
              isMobile
                ? "flex gap-2.5 px-3 pb-3"
                : "flex-1 space-y-3 bg-[rgba(242,246,245,0.76)] px-3 py-3 lg:px-4 lg:py-4",
            )}
          >
            {messages.map((message) => (
              <ForwardPreviewCard
                key={message.id}
                message={message}
                mobile={isMobile}
              />
            ))}
          </div>
        </section>

        <section
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            isMobile
              ? "bg-[#ededed]"
              : "bg-[rgba(255,255,255,0.62)]",
          )}
        >
          {!isMobile ? (
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-4 py-4 backdrop-blur-xl lg:px-6 lg:py-4">
              <div className="min-w-0">
                <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                  {t(msg`最近会话`)}
                </div>
                <div className="mt-2 text-[15px] font-medium text-[color:var(--text-primary)]">
                  {t(msg`选择要接收转发消息的聊天`)}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={t(msg`关闭`)}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="px-3 pb-2 pt-3">
              <div className="px-1 text-[12px] text-[#8c8c8c]">{t(msg`最近会话`)}</div>
            </div>
          )}

          <div
            className={cn(
              "border-b border-[color:var(--border-faint)]",
              isMobile ? "border-black/5 px-3 py-2.5" : "bg-white/72 px-4 py-3 lg:px-6",
            )}
          >
            <div className="flex items-center gap-2">
              <ForwardModeButton
                active={forwardMode === "separate"}
                disabled={pending || !supportsSeparateMode}
                label={isMobile ? t(msg`逐条`) : t(msg`逐条转发`)}
                description={
                  supportsSeparateMode
                    ? t(msg`保持原消息结构依次投递`)
                    : t(msg`当前选择里包含仅支持合并转发的消息`)
                }
                onClick={() => setForwardMode("separate")}
              />
              <ForwardModeButton
                active={forwardMode === "merged"}
                disabled={pending}
                label={isMobile ? t(msg`合并`) : t(msg`合并转发`)}
                description={t(msg`汇总为一条聊天记录摘要`)}
                onClick={() => setForwardMode("merged")}
              />
            </div>
          </div>

          <div
            className={cn(
              "border-b border-[color:var(--border-faint)]",
              isMobile ? "border-black/5 px-3 py-2" : "bg-white/72 px-4 py-4 lg:px-6",
            )}
          >
            <label className="relative block">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
              />
              <TextField
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t(msg`搜索最近会话`)}
                disabled={pending}
                className={cn(
                  "pl-10",
                  isMobile
                    ? "h-10 rounded-[12px] border-none bg-white shadow-none"
                    : "h-10 rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none",
                )}
              />
            </label>
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 overflow-auto",
              isMobile ? "px-3 py-3" : "px-4 py-4 lg:px-6 lg:py-6",
            )}
          >
            {loading ? <LoadingBlock label={t(msg`正在读取最近会话...`)} /> : null}
            {error ? <ErrorBlock message={error} /> : null}
            {!loading && !error && !conversations.length ? (
              <EmptyState
                title={t(msg`还没有可转发的最近会话`)}
                description={t(msg`先去消息列表里建立一些聊天线程，再回来转发消息。`)}
              />
            ) : null}
            {!loading &&
            !error &&
            conversations.length > 0 &&
            !filteredConversations.length ? (
              <div
                className={cn(
                  "text-sm text-[color:var(--text-secondary)]",
                  isMobile
                    ? "rounded-[16px] border border-black/5 bg-white px-4 py-5"
                    : "rounded-[12px] border border-dashed border-[color:var(--border-faint)] bg-white/84 px-4 py-5",
                )}
              >
                {t(msg`没有匹配的最近会话。`)}
              </div>
            ) : null}

            <div
              className={cn(
                isMobile
                  ? "overflow-hidden rounded-[18px] border border-black/5 bg-white"
                  : "space-y-2",
              )}
            >
              {filteredConversations.map((conversation, index) => {
                const isGroup = isPersistedGroupConversation(conversation);
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    disabled={pending}
                    onClick={() => handleForwardRowClick(conversation)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60",
                      isMobile
                        ? `px-4 py-3 ${index > 0 ? "border-t border-black/5" : ""}`
                        : "rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-3 transition hover:bg-[color:var(--surface-console)] hover:shadow-[var(--shadow-soft)]",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {isGroup ? (
                        <GroupAvatarChip
                          name={conversation.title}
                          members={conversation.participants}
                          size="wechat"
                        />
                      ) : (
                        <AvatarChip
                          name={conversation.title}
                          src={conversation.avatar}
                          size="wechat"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {conversation.title}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {t(msg`${getConversationThreadLabel(conversation)} · 最近活跃 ${formatMessageTimestamp(conversation.lastActivityAt)}`)}
                        </div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        isMobile
                          ? "rounded-full bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[color:var(--brand-primary)]"
                          : "rounded-[8px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-1 text-[color:var(--text-secondary)]",
                      )}
                    >
                      {pending
                        ? t(msg`正在转发`)
                        : forwardMode === "merged"
                          ? isMobile
                            ? t(msg`合并`)
                            : t(msg`合并转发`)
                          : isMobile
                            ? t(msg`发送`)
                            : t(msg`转发`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={cn(
              "border-t text-[12px] text-[color:var(--text-muted)]",
              isMobile
                ? "border-black/5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.85rem)] pt-3"
                : "flex flex-col items-stretch gap-3 border-[color:var(--border-faint)] bg-white/78 px-4 py-4 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-6",
            )}
          >
            <div>
              {forwardMode === "merged"
                ? t(msg`会把选中的消息汇总成一条聊天摘要，再发送到目标会话。`)
                : t(msg`会按照原消息顺序依次投递到目标会话。`)}
            </div>
            {!isMobile ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={pending}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-6 shadow-none hover:bg-[color:var(--surface-console)]"
              >
                {t(msg`取消`)}
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function ForwardModeButton({
  active,
  disabled,
  label,
  description,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-start rounded-[14px] border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)]"
          : "border-[color:var(--border-faint)] bg-white hover:bg-[color:var(--surface-console)]",
      )}
    >
      <span
        className={cn(
          "text-[13px] font-medium",
          active ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-primary)]",
        )}
      >
        {label}
      </span>
      <span className="mt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
        {description}
      </span>
    </button>
  );
}

function MobileForwardHeader({
  messageCount,
  titleId,
  descId,
  pending,
  onClose,
}: {
  messageCount: number;
  titleId?: string;
  descId?: string;
  pending: boolean;
  onClose: () => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <header className="border-b border-black/5 bg-[rgba(247,247,247,0.96)] px-3 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] backdrop-blur-xl">
      <div className="relative flex min-h-11 items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="flex h-10 min-w-12 items-center justify-start rounded-[10px] px-1 text-[16px] text-[#111827] disabled:opacity-50"
        >
          {t(msg`取消`)}
        </button>
        <div className="pointer-events-none absolute inset-x-12 text-center">
          <div
            id={titleId}
            className="truncate text-[17px] font-medium text-[#111827]"
          >
            {t(msg`转发给`)}
          </div>
          <div
            id={descId}
            className="mt-0.5 truncate text-[11px] text-[#8c8c8c]"
          >
            {t(msg`已选 ${messageCount} 条消息`)}
          </div>
        </div>
        <div className="h-10 min-w-12" aria-hidden="true" />
      </div>
    </header>
  );
}

function ForwardPreviewCard({
  message,
  mobile,
}: {
  message: DesktopMessageForwardPreviewItem;
  mobile: boolean;
}) {
  return (
    <div
      className={cn(
        "border border-[color:var(--border-faint)] bg-white",
        mobile
          ? "w-[188px] shrink-0 rounded-[16px] px-3 py-3 shadow-none"
          : "rounded-[14px] px-4 py-3 shadow-[var(--shadow-soft)]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
          {message.senderName}
        </div>
        <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[11px]",
          mobile
            ? "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
            : "rounded-[8px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
        )}
      >
          {message.typeLabel}
        </span>
      </div>
      <div
        className={cn(
          "mt-2 text-sm leading-6 text-[color:var(--text-muted)]",
          mobile ? "line-clamp-2" : "line-clamp-3",
        )}
      >
        {message.previewText}
      </div>
    </div>
  );
}
