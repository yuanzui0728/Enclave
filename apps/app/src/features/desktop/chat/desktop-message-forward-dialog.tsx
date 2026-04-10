import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { type ConversationListItem } from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { formatMessageTimestamp, parseTimestamp } from "../../../lib/format";

export type DesktopMessageForwardPreviewItem = {
  id: string;
  senderName: string;
  previewText: string;
  typeLabel: string;
};

type DesktopMessageForwardDialogProps = {
  open: boolean;
  messages: DesktopMessageForwardPreviewItem[];
  conversations: ConversationListItem[];
  variant?: "mobile" | "desktop";
  loading?: boolean;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onForward: (conversation: ConversationListItem) => void;
};

export function DesktopMessageForwardDialog({
  open,
  messages,
  conversations,
  variant,
  loading = false,
  pending = false,
  error,
  onClose,
  onForward,
}: DesktopMessageForwardDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const isMobile = variant ? variant === "mobile" : isCompactViewport;

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
  }, [open]);

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

  const filteredConversations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const ordered = [...conversations].sort(
      (left, right) =>
        (parseTimestamp(right.lastActivityAt) ?? 0) -
        (parseTimestamp(left.lastActivityAt) ?? 0),
    );

    if (!keyword) {
      return ordered;
    }

    return ordered.filter((conversation) =>
      conversation.title.toLowerCase().includes(keyword),
    );
  }, [conversations, searchTerm]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        isMobile
          ? "bg-[#ededed]"
          : "flex items-center justify-center bg-[rgba(22,18,14,0.38)] p-3 backdrop-blur-[4px] sm:p-4 lg:p-6",
      )}
    >
      {!isMobile ? (
        <button
          type="button"
          aria-label="关闭转发消息弹层"
          onClick={() => {
            if (!pending) {
              onClose();
            }
          }}
          className="absolute inset-0"
        />
      ) : null}

      <div
        className={cn(
          "relative flex min-w-0 flex-col overflow-hidden",
          isMobile
            ? "h-full bg-[#ededed]"
            : "h-[min(820px,92vh)] w-full max-w-[1080px] rounded-[22px] border border-white/20 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.30)] lg:h-[min(760px,80vh)] lg:flex-row lg:rounded-[30px]",
        )}
      >
        {isMobile ? (
          <MobileForwardHeader
            messageCount={messages.length}
            pending={pending}
            onClose={onClose}
          />
        ) : null}

        <section
          className={cn(
            "flex shrink-0 flex-col",
            isMobile
              ? "border-b border-black/5 bg-[#f6f6f6]"
              : "max-h-[38vh] w-full border-b border-black/6 bg-[#f7f7f7] lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r",
          )}
        >
          {!isMobile ? (
            <div className="border-b border-black/6 px-4 py-4 lg:px-5 lg:py-5">
              <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
                转发消息
              </div>
              <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
                {messages.length === 1
                  ? "把这条消息转发到最近会话。"
                  : `把选中的 ${messages.length} 条消息转发到最近会话。`}
              </div>
            </div>
          ) : (
            <div className="px-3 pb-3 pt-2">
              <div className="px-1 text-[12px] text-[#8c8c8c]">已选消息</div>
            </div>
          )}

          <div
            className={cn(
              "min-h-0 overflow-auto",
              isMobile
                ? "flex gap-2.5 px-3 pb-3"
                : "flex-1 space-y-3 px-3 py-3 lg:px-4 lg:py-4",
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
              : "bg-[linear-gradient(180deg,#fcfcfc,#f6f6f6)]",
          )}
        >
          {!isMobile ? (
            <div className="flex items-start justify-between gap-4 border-b border-black/6 px-4 py-4 lg:px-6 lg:py-5">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
                  最近会话
                </div>
                <div className="mt-2 text-[15px] font-medium text-[color:var(--text-primary)]">
                  选择要接收转发消息的聊天
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/6 bg-white text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="px-3 pb-2 pt-3">
              <div className="px-1 text-[12px] text-[#8c8c8c]">最近会话</div>
            </div>
          )}

          <div
            className={cn(
              "border-b border-black/6",
              isMobile ? "border-black/5 px-3 py-2" : "px-4 py-4 lg:px-6",
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
                placeholder="搜索最近会话"
                disabled={pending}
                className={cn(
                  "pl-10",
                  isMobile
                    ? "h-10 rounded-[12px] border-none bg-white shadow-none"
                    : "rounded-[22px]",
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
            {loading ? <LoadingBlock label="正在读取最近会话..." /> : null}
            {error ? <ErrorBlock message={error} /> : null}
            {!loading && !error && !conversations.length ? (
              <EmptyState
                title="还没有可转发的最近会话"
                description="先去消息列表里建立一些聊天线程，再回来转发消息。"
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
                    : "rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/78 px-4 py-5",
                )}
              >
                没有匹配的最近会话。
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
                    onClick={() => onForward(conversation)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60",
                      isMobile
                        ? `px-4 py-3 ${index > 0 ? "border-t border-black/5" : ""}`
                        : "rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)]",
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
                        <AvatarChip name={conversation.title} size="wechat" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {conversation.title}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {isGroup ? "群聊" : "单聊"} · 最近活跃{" "}
                          {formatMessageTimestamp(conversation.lastActivityAt)}
                        </div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        isMobile
                          ? "rounded-full bg-[rgba(7,193,96,0.12)] px-2.5 py-1 text-[#07c160]"
                          : "rounded-full bg-[rgba(249,115,22,0.10)] px-3 py-1 text-[color:var(--brand-secondary)]",
                      )}
                    >
                      {pending ? "正在转发" : isMobile ? "发送" : "转发"}
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
                : "flex flex-col items-stretch gap-3 border-black/6 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-6",
            )}
          >
            <div>会按照原消息顺序依次投递到目标会话。</div>
            {!isMobile ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={pending}
                className="rounded-2xl px-6"
              >
                取消
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function MobileForwardHeader({
  messageCount,
  pending,
  onClose,
}: {
  messageCount: number;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <header className="border-b border-black/5 bg-[rgba(247,247,247,0.96)] px-3 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] backdrop-blur-xl">
      <div className="relative flex min-h-11 items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="flex h-10 min-w-12 items-center justify-start rounded-[10px] px-1 text-[16px] text-[#111827] disabled:opacity-50"
        >
          取消
        </button>
        <div className="pointer-events-none absolute inset-x-12 text-center">
          <div className="truncate text-[17px] font-medium text-[#111827]">
            转发给
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
            已选 {messageCount} 条消息
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
        "border border-black/6 bg-white",
        mobile
          ? "w-[188px] shrink-0 rounded-[16px] px-3 py-3 shadow-none"
          : "rounded-[22px] px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]",
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
              ? "bg-[rgba(7,193,96,0.1)] text-[#07c160]"
              : "bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-secondary)]",
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
