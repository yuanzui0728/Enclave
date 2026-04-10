import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { type ConversationListItem } from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock, TextField } from "@yinjie/ui";
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
  loading = false,
  pending = false,
  error,
  onClose,
  onForward,
}: DesktopMessageForwardDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
  }, [open]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(22,18,14,0.38)] p-3 backdrop-blur-[4px] sm:p-4 lg:p-6">
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

      <div className="relative flex h-[min(820px,92vh)] w-full max-w-[1080px] flex-col overflow-hidden rounded-[22px] border border-white/20 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.30)] lg:h-[min(760px,80vh)] lg:flex-row lg:rounded-[30px]">
        <section className="flex max-h-[38vh] w-full shrink-0 flex-col border-b border-black/6 bg-[#f7f7f7] lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r">
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

          <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3 lg:px-4 lg:py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className="rounded-[22px] border border-black/6 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                    {message.senderName}
                  </div>
                  <span className="shrink-0 rounded-full bg-[rgba(249,115,22,0.10)] px-2.5 py-1 text-[11px] text-[color:var(--brand-secondary)]">
                    {message.typeLabel}
                  </span>
                </div>
                <div className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--text-muted)]">
                  {message.previewText}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,#fcfcfc,#f6f6f6)]">
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

          <div className="border-b border-black/6 px-4 py-4 lg:px-6">
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
                className="rounded-[22px] pl-10"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 lg:px-6 lg:py-6">
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
              <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/78 px-4 py-5 text-sm text-[color:var(--text-secondary)]">
                没有匹配的最近会话。
              </div>
            ) : null}

            <div className="space-y-2">
              {filteredConversations.map((conversation) => {
                const isGroup = isPersistedGroupConversation(conversation);
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    disabled={pending}
                    onClick={() => onForward(conversation)}
                    className="flex w-full items-center justify-between gap-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)] disabled:cursor-not-allowed disabled:opacity-60"
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
                    <span className="shrink-0 rounded-full bg-[rgba(249,115,22,0.10)] px-3 py-1 text-xs text-[color:var(--brand-secondary)]">
                      {pending ? "正在转发" : "转发"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 border-t border-black/6 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-6">
            <div className="text-[12px] text-[color:var(--text-muted)]">
              会按照原消息顺序依次投递到目标会话。
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
              className="rounded-2xl px-6"
            >
              取消
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
