import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getConversationMessages,
  getConversations,
  getGroupMessages,
  type GroupMessage,
  type Message,
  type MessageAttachment,
} from "@yinjie/contracts";
import { FileText, ImageIcon } from "lucide-react";
import { Button, ErrorBlock, LoadingBlock, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  formatConversationTimestamp,
  formatMessageTimestamp,
  parseTimestamp,
} from "../lib/format";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type FileFilter = "all" | "image" | "file";

type AttachmentRow = {
  id: string;
  attachment: Extract<MessageAttachment, { kind: "image" | "file" }>;
  createdAt: string;
  senderName: string;
  text: string;
};

export function DesktopChatFilesPage() {
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, []);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const conversations = conversationsQuery.data ?? [];

  useEffect(() => {
    if (!conversations.length) {
      setSelectedConversationId(null);
      return;
    }

    if (
      selectedConversationId &&
      conversations.some((item) => item.id === selectedConversationId)
    ) {
      return;
    }

    setSelectedConversationId(conversations[0].id);
  }, [conversations, selectedConversationId]);

  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? null;

  const messagesQuery = useQuery({
    queryKey: [
      "desktop-chat-files",
      baseUrl,
      selectedConversation?.id,
      selectedConversation?.type,
    ],
    queryFn: async () => {
      if (!selectedConversation) {
        return [];
      }

      if (isPersistedGroupConversation(selectedConversation)) {
        return getGroupMessages(selectedConversation.id, baseUrl);
      }

      return getConversationMessages(selectedConversation.id, baseUrl);
    },
    enabled: Boolean(selectedConversation),
  });

  const attachmentRows = useMemo(
    () =>
      normalizeAttachmentRows(messagesQuery.data ?? [])
        .filter((item) => matchesAttachmentFilter(item, filter))
        .filter((item) => matchesAttachmentSearch(item, searchText))
        .sort(
          (left, right) =>
            (parseTimestamp(right.createdAt) ?? 0) -
            (parseTimestamp(left.createdAt) ?? 0),
        ),
    [filter, messagesQuery.data, searchText],
  );

  if (!isDesktopLayout) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,249,240,0.96))]">
      <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,248,238,0.96))]">
        <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
          <div className="text-base font-medium text-[color:var(--text-primary)]">
            聊天文件
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            先按会话聚合图片和文件附件，后续再补跨会话筛选与搜索。
          </div>
          <TextField
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索文件名或消息内容"
            className="mt-4 rounded-[18px] border-[color:var(--border-faint)] bg-white/92 px-4 py-2.5 shadow-none"
          />
        </div>

        <div className="flex items-center gap-2 px-4 py-3">
          {(["all", "image", "file"] as FileFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                filter === item
                  ? "border-[rgba(249,115,22,0.18)] bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)]"
                  : "border-[color:var(--border-faint)] bg-white/88 text-[color:var(--text-secondary)]",
              )}
            >
              {item === "all" ? "全部" : item === "image" ? "图片" : "文件"}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {conversationsQuery.isLoading ? (
            <LoadingBlock label="正在读取会话..." />
          ) : null}
          {conversationsQuery.isError &&
          conversationsQuery.error instanceof Error ? (
            <ErrorBlock message={conversationsQuery.error.message} />
          ) : null}

          <div className="space-y-1.5">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedConversationId(conversation.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition",
                  conversation.id === selectedConversationId
                    ? "border-[rgba(249,115,22,0.20)] bg-white/94 shadow-[var(--shadow-soft)]"
                    : "border-transparent bg-transparent hover:border-[color:var(--border-faint)] hover:bg-white/82",
                )}
              >
                <AvatarChip name={conversation.title} size="wechat" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                    {conversation.title}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {conversation.type === "group" ? "群聊" : "单聊"} ·{" "}
                    {formatConversationTimestamp(conversation.lastActivityAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {!conversationsQuery.isLoading && !conversations.length ? (
            <div className="pt-4">
              <EmptyState
                title="还没有可聚合的会话"
                description="先在消息里发一些图片或文件，这里就会开始出现内容。"
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 flex-1 overflow-auto p-6">
        {selectedConversation ? (
          <DesktopEntryShell
            badge="Files"
            title={selectedConversation.title}
            description="当前先聚合这一会话内的图片和文件附件，后续再补跨会话总览、批量操作和回跳原消息。"
            aside={
              <div className="space-y-3">
                <InfoCard
                  label="会话类型"
                  value={
                    selectedConversation.type === "group" ? "群聊" : "单聊"
                  }
                />
                <InfoCard
                  label="筛选范围"
                  value={
                    filter === "all"
                      ? "图片与文件"
                      : filter === "image"
                        ? "仅图片"
                        : "仅文件"
                  }
                />
                <InfoCard
                  label="当前结果"
                  value={`${attachmentRows.length} 项`}
                />
              </div>
            }
          >
            <div className="space-y-4">
              {messagesQuery.isLoading ? (
                <LoadingBlock label="正在读取附件..." />
              ) : null}
              {messagesQuery.isError && messagesQuery.error instanceof Error ? (
                <ErrorBlock message={messagesQuery.error.message} />
              ) : null}

              {attachmentRows.map((item) => {
                const sourceId = `chat-file-${item.id}`;
                const collected = favoriteSourceIds.includes(sourceId);

                return (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)] transition hover:border-[rgba(249,115,22,0.18)]"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[rgba(255,138,61,0.10)] text-[color:var(--brand-primary)]">
                        {item.attachment.kind === "image" ? (
                          <ImageIcon size={18} />
                        ) : (
                          <FileText size={18} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {item.attachment.fileName}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {item.senderName} ·{" "}
                          {formatMessageTimestamp(item.createdAt)}
                        </div>
                        <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                          {item.text.trim() || "这条消息没有额外正文。"}
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <a
                            href={item.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--brand-gradient)] px-4 text-xs font-medium text-white"
                          >
                            打开附件
                          </a>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const nextFavorites = collected
                                ? removeDesktopFavorite(sourceId)
                                : upsertDesktopFavorite({
                                    id: `favorite-${sourceId}`,
                                    sourceId,
                                    category: "messages",
                                    title: item.attachment.fileName,
                                    description:
                                      item.text.trim() ||
                                      `${item.senderName} 分享的聊天附件`,
                                    meta: `${selectedConversation.title} · ${formatMessageTimestamp(item.createdAt)}`,
                                    to: "/desktop/chat-files",
                                    badge: "聊天文件",
                                    avatarName: selectedConversation.title,
                                  });

                              setFavoriteSourceIds(
                                nextFavorites.map(
                                  (favorite) => favorite.sourceId,
                                ),
                              );
                            }}
                            className="rounded-full"
                          >
                            {collected ? "取消收藏" : "收藏"}
                          </Button>
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-[color:var(--text-muted)]">
                        {formatAttachmentMeta(item.attachment)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!messagesQuery.isLoading && !attachmentRows.length ? (
                <EmptyState
                  title="当前筛选下没有附件"
                  description="换一个会话、筛选类型，或者先在聊天里发一张图片或文件。"
                />
              ) : null}
            </div>
          </DesktopEntryShell>
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="先从左侧选择一个会话"
              description="聊天文件会按会话聚合展示，方便从桌面直接整理最近发过的附件。"
            />
          </div>
        )}
      </section>
    </div>
  );
}

function normalizeAttachmentRows(
  messages: Message[] | GroupMessage[],
): AttachmentRow[] {
  return messages.flatMap((item) => {
    const attachment = item.attachment;

    if (
      !attachment ||
      (attachment.kind !== "image" && attachment.kind !== "file")
    ) {
      return [];
    }

    return [
      {
        id: item.id,
        attachment,
        createdAt: item.createdAt,
        senderName: item.senderName,
        text: item.text,
      },
    ];
  });
}

function matchesAttachmentFilter(item: AttachmentRow, filter: FileFilter) {
  if (filter === "all") {
    return true;
  }

  return item.attachment.kind === filter;
}

function matchesAttachmentSearch(item: AttachmentRow, searchText: string) {
  const normalized = searchText.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    item.attachment.fileName.toLowerCase().includes(normalized) ||
    item.senderName.toLowerCase().includes(normalized) ||
    item.text.toLowerCase().includes(normalized)
  );
}

function formatAttachmentMeta(
  attachment: Extract<MessageAttachment, { kind: "image" | "file" }>,
) {
  const sizeLabel = formatBytes(attachment.size);

  if (attachment.kind === "image") {
    const dimensions =
      attachment.width && attachment.height
        ? `${attachment.width}×${attachment.height}`
        : "图片";
    return `${dimensions} · ${sizeLabel}`;
  }

  return sizeLabel;
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "未知大小";
  }

  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(size / 1024, 0.1).toFixed(1)} KB`;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white/88 p-4">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
