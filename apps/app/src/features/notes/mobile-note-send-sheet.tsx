import { useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { Search, X } from "lucide-react";
import { type ConversationListItem } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, LoadingBlock, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { GroupAvatarChip } from "../../components/group-avatar-chip";
import {
  getConversationThreadLabel,
  isPersistedGroupConversation,
} from "../../lib/conversation-route";
import { formatMessageTimestamp, parseTimestamp } from "../../lib/format";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";
import type { NoteSendDialogNote } from "../favorites/note-editor-helpers";

type MobileNoteSendSheetProps = {
  open: boolean;
  note: NoteSendDialogNote | null;
  conversations: ConversationListItem[];
  loading?: boolean;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSend: (conversation: ConversationListItem) => void;
};

export function MobileNoteSendSheet({
  open,
  note,
  conversations,
  loading = false,
  pending = false,
  error,
  onClose,
  onSend,
}: MobileNoteSendSheetProps) {
  const t = useRuntimeTranslator();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setSearchTerm("");
  }, [open]);

  // 原生壳硬件 Back 键：sheet 打开时先关 sheet，不让 BACK 同时 history.back
  // 把用户从笔记编辑页带回上一级。pending 中（消息正在发送）不拦，避免
  // 中途打断。
  useEffect(() => {
    if (!open || pending) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
    return unregister;
  }, [open, onClose, pending]);

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

  if (!open || !note) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(17,24,39,0.42)]">
      <button
        type="button"
        aria-label={t(msg`关闭发送笔记弹层`)}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <div
        className={cn(
          "relative flex max-h-[88vh] min-h-0 flex-col rounded-t-[22px] bg-white shadow-[0_-12px_32px_rgba(15,23,42,0.16)]",
          // pb 接 --keyboard-inset：sheet 里有「搜索最近会话」TextField，iOS
          // WKWebView 上聚焦后软键盘弹起会盖住底部「会以笔记卡片形式出现…/
          // 取消」action 栏 —— 跟 mobile-add-friend 的 SendSheet 一样要用
          // max(safe-area, --keyboard-inset)（mobile-shell.useKeyboardInset
          // 写入根 :root）抬高 sheet 底，保证 cancel 永远高于键盘。
          "pb-[calc(max(env(safe-area-inset-bottom,0px),var(--keyboard-inset,0px)))]",
        )}
      >
        <div className="mt-2 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-[color:var(--border-strong)]/40" />
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-faint)] px-5 py-3">
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              {t(msg`发送笔记`)}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[color:var(--text-muted)]">
              {note.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t(msg`关闭`)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-[color:var(--border-faint)] px-5 py-3">
          <label className="relative block">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
            />
            <TextField
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t(msg`搜索最近会话`)}
              disabled={pending}
              // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
              className="h-9 rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] pl-9 text-[16px] shadow-none"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="px-3 py-4">
              <LoadingBlock label={t(msg`正在读取最近会话...`)} />
            </div>
          ) : null}
          {error ? (
            <div className="px-3 py-4">
              <ErrorBlock message={error} />
            </div>
          ) : null}
          {!loading && !error && !conversations.length ? (
            <div className="rounded-[12px] border border-dashed border-[color:var(--border-faint)] bg-white px-4 py-5 text-center text-[13px] text-[color:var(--text-secondary)]">
              {t(msg`先去消息列表里建立一些聊天，再回来发送笔记。`)}
            </div>
          ) : null}
          {!loading &&
          !error &&
          conversations.length > 0 &&
          !filteredConversations.length ? (
            <div className="rounded-[12px] border border-dashed border-[color:var(--border-faint)] bg-white px-4 py-4 text-center text-[13px] text-[color:var(--text-secondary)]">
              {t(msg`没有匹配的最近会话。`)}
            </div>
          ) : null}

          <div className="space-y-1.5">
            {filteredConversations.map((conversation) => {
              const isGroup = isPersistedGroupConversation(conversation);
              return (
                <button
                  key={conversation.id}
                  type="button"
                  disabled={pending}
                  onClick={() => onSend(conversation)}
                  className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition active:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
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
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                      {conversation.title}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
                      {getConversationThreadLabel(conversation)} ·{" "}
                      {formatMessageTimestamp(conversation.lastActivityAt)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[color:var(--surface-console)] px-3 py-1 text-[11px] text-[color:var(--text-secondary)]">
                    {pending ? t(msg`发送中`) : t(msg`发送`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border-faint)] px-5 py-3">
          <div className="text-[11px] leading-5 text-[color:var(--text-muted)]">
            {t(msg`会以笔记卡片形式出现在对话里。`)}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="h-9 rounded-[10px] border-[color:var(--border-faint)] bg-white px-4 shadow-none"
          >
            {t(msg`取消`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
