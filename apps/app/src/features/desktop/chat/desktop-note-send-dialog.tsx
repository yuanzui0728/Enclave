import { useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { Search, X } from "lucide-react";
import {
  type ConversationListItem,
  type FavoriteNoteAsset,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, ErrorBlock, LoadingBlock, TextField } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import {
  getConversationThreadLabel,
  isPersistedGroupConversation,
} from "../../../lib/conversation-route";
import { formatMessageTimestamp, parseTimestamp } from "../../../lib/format";

export type DesktopNoteSendDialogNote = {
  noteId: string;
  title: string;
  excerpt: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
  updatedAt: string;
};

type DesktopNoteSendDialogProps = {
  open: boolean;
  note: DesktopNoteSendDialogNote | null;
  conversations: ConversationListItem[];
  loading?: boolean;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSend: (conversation: ConversationListItem) => void;
};

export function DesktopNoteSendDialog({
  open,
  note,
  conversations,
  loading = false,
  pending = false,
  error,
  onClose,
  onSend,
}: DesktopNoteSendDialogProps) {
  const t = translateRuntimeMessage;
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

  if (!open || !note) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-3 backdrop-blur-[3px] sm:p-4 lg:p-6">
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

      <div className="relative flex h-[min(760px,84vh)] w-full max-w-[1040px] min-w-0 overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]">
        <section className="flex w-[344px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-5 backdrop-blur-xl">
            <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
              {t(msg`发送笔记`)}
            </div>
            <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
              {t(msg`把这条收藏笔记发到最近会话。`)}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            <DesktopNotePreviewCard note={note} />
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col bg-[rgba(255,255,255,0.62)]">
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
            <div className="min-w-0">
              <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                {t(msg`最近会话`)}
              </div>
              <div className="mt-2 text-[15px] font-medium text-[color:var(--text-primary)]">
                {t(msg`选择要接收笔记的聊天`)}
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

          <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-6 py-4">
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
                className="h-10 rounded-[10px] border-[color:var(--border-faint)] bg-white pl-10 shadow-none"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
            {loading ? <LoadingBlock label={t(msg`正在读取最近会话...`)} /> : null}
            {error ? <ErrorBlock message={error} /> : null}
            {!loading && !error && !conversations.length ? (
              <EmptyState
                title={t(msg`还没有可发送的最近会话`)}
                description={t(msg`先去消息列表里建立一些聊天线程，再回来发送笔记。`)}
              />
            ) : null}
            {!loading &&
            !error &&
            conversations.length > 0 &&
            !filteredConversations.length ? (
              <div className="rounded-[12px] border border-dashed border-[color:var(--border-faint)] bg-white/84 px-4 py-5 text-sm text-[color:var(--text-secondary)]">
                {t(msg`没有匹配的最近会话。`)}
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
                    onClick={() => onSend(conversation)}
                    className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-3 text-left transition hover:bg-[color:var(--surface-console)] hover:shadow-[var(--shadow-soft)] disabled:cursor-not-allowed disabled:opacity-60"
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
                          {getConversationThreadLabel(conversation)} ·{" "}
                          {t(msg`最近活跃`)}{" "}
                          {formatMessageTimestamp(conversation.lastActivityAt)}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-[8px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-1 text-xs text-[color:var(--text-secondary)]">
                      {pending ? t(msg`发送中`) : t(msg`发送`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-[color:var(--border-faint)] bg-white/78 px-6 py-4 text-[12px] text-[color:var(--text-muted)] backdrop-blur-xl">
            <div>{t(msg`发送后会在目标会话里显示成一张可打开的笔记卡片。`)}</div>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-6 shadow-none hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`取消`)}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function DesktopNotePreviewCard({ note }: { note: DesktopNoteSendDialogNote }) {
  const t = translateRuntimeMessage;
  const previewImage = note.assets.find((asset) => asset.kind === "image");
  const fileCount = note.assets.filter((asset) => asset.kind === "file").length;
  const imageCount = note.assets.filter(
    (asset) => asset.kind === "image",
  ).length;

  return (
    <div className="overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-soft)]">
      {previewImage?.url ? (
        <div className="h-[184px] overflow-hidden bg-[rgba(15,23,42,0.05)]">
          <img
            src={previewImage.url}
            alt={note.title}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-[184px] items-end bg-[linear-gradient(160deg,#f3f6f5_0%,#dde6e3_100%)] px-5 py-5">
          <div className="rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-white/88 px-4 py-3 text-[11px] tracking-[0.16em] text-[color:var(--text-muted)] shadow-[var(--shadow-soft)]">
            {t(msg`收藏笔记`)}
          </div>
        </div>
      )}

      <div className="space-y-4 px-5 py-5">
        <div>
          <div className="line-clamp-2 text-[17px] font-medium leading-7 text-[color:var(--text-primary)]">
            {note.title}
          </div>
          <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
            {t(msg`更新于 ${formatMessageTimestamp(note.updatedAt)}`)}
          </div>
        </div>

        <div className="line-clamp-5 text-[13px] leading-7 text-[color:var(--text-secondary)]">
          {note.excerpt || t(msg`这条笔记还没有正文摘要。`)}
        </div>

        {note.tags.length ? (
          <div className="flex flex-wrap gap-2">
            {note.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[rgba(7,193,96,0.08)] px-3 py-1 text-[11px] text-[color:var(--brand-primary)]"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
          {imageCount ? <span>{t(msg`${imageCount} 张图片`)}</span> : null}
          {fileCount ? <span>{t(msg`${fileCount} 个文件`)}</span> : null}
          {!imageCount && !fileCount ? <span>{t(msg`纯文本笔记`)}</span> : null}
        </div>
      </div>
    </div>
  );
}
