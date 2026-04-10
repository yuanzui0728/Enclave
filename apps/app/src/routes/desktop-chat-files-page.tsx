import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
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
import {
  buildDesktopChatFilesRouteHash,
  parseDesktopChatFilesRouteState,
} from "../features/desktop/chat/desktop-chat-files-route-state";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import {
  filterSearchableChatMessages,
  useLocalChatMessageActionState,
} from "../features/chat/local-chat-message-actions";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatMessageTimestamp, parseTimestamp } from "../lib/format";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type FileFilter = "all" | "image" | "file";

type AttachmentRow = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  conversationType: "direct" | "group";
  attachment: Extract<MessageAttachment, { kind: "image" | "file" }>;
  createdAt: string;
  senderName: string;
  text: string;
};

export function DesktopChatFilesPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "";
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseDesktopChatFilesRouteState(hash);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(routeState.conversationId ?? null);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const localMessageActionState = useLocalChatMessageActionState();

  useEffect(() => {
    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, []);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );

  useEffect(() => {
    if (routeState.conversationId === selectedConversationId) {
      return;
    }

    setSelectedConversationId(routeState.conversationId ?? null);
  }, [routeState.conversationId, selectedConversationId]);

  useEffect(() => {
    if (!conversations.length) {
      setSelectedConversationId(null);
      return;
    }

    if (
      routeState.conversationId &&
      conversations.some((item) => item.id === routeState.conversationId)
    ) {
      if (selectedConversationId !== routeState.conversationId) {
        setSelectedConversationId(routeState.conversationId);
      }
      return;
    }

    if (
      selectedConversationId &&
      conversations.some((item) => item.id === selectedConversationId)
    ) {
      return;
    }
  }, [conversations, routeState.conversationId, selectedConversationId]);

  useEffect(() => {
    const nextHash = buildDesktopChatFilesRouteHash(selectedConversationId);
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if (normalizedHash === (nextHash ?? "")) {
      return;
    }

    void navigate({
      to: "/desktop/chat-files",
      hash: nextHash,
      replace: true,
    });
  }, [hash, navigate, selectedConversationId]);

  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? null;
  const allAttachmentsQuery = useQuery({
    queryKey: [
      "desktop-chat-files",
      baseUrl,
      conversations.map((item) => `${item.id}:${item.type}`),
    ],
    queryFn: async () => {
      if (!baseUrl) {
        return [];
      }

      const rows = await Promise.all(
        conversations.map((conversation) =>
          fetchConversationAttachmentRows(conversation, baseUrl),
        ),
      );

      return rows.flat();
    },
    enabled: Boolean(baseUrl) && conversations.length > 0,
  });

  const baseAttachmentRows = useMemo(() => {
    const rows = filterSearchableChatMessages(
      allAttachmentsQuery.data ?? [],
      localMessageActionState,
    );

    if (!selectedConversationId) {
      return rows;
    }

    return rows.filter(
      (item) => item.conversationId === selectedConversationId,
    );
  }, [
    allAttachmentsQuery.data,
    localMessageActionState,
    selectedConversationId,
  ]);

  const attachmentCounts = useMemo(
    () =>
      filterSearchableChatMessages(
        allAttachmentsQuery.data ?? [],
        localMessageActionState,
      ).reduce<Record<string, number>>((result, item) => {
        result[item.conversationId] = (result[item.conversationId] ?? 0) + 1;
        return result;
      }, {}),
    [allAttachmentsQuery.data, localMessageActionState],
  );

  const attachmentRows = useMemo(
    () =>
      baseAttachmentRows
        .filter((item) => matchesAttachmentFilter(item, filter))
        .filter((item) => matchesAttachmentSearch(item, searchText))
        .sort(
          (left, right) =>
            (parseTimestamp(right.createdAt) ?? 0) -
            (parseTimestamp(left.createdAt) ?? 0),
        ),
    [baseAttachmentRows, filter, searchText],
  );
  const visibleAttachmentRowCount = useMemo(
    () =>
      filterSearchableChatMessages(
        allAttachmentsQuery.data ?? [],
        localMessageActionState,
      ).length,
    [allAttachmentsQuery.data, localMessageActionState],
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
            现在支持跨会话聚合浏览，也能从当前聊天直接带着上下文跳进来。
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
            <button
              type="button"
              onClick={() => setSelectedConversationId(null)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition",
                !selectedConversationId
                  ? "border-[rgba(249,115,22,0.20)] bg-white/94 shadow-[var(--shadow-soft)]"
                  : "border-transparent bg-transparent hover:border-[color:var(--border-faint)] hover:bg-white/82",
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(255,138,61,0.12)] text-sm font-medium text-[color:var(--brand-primary)]">
                全部
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                  全部会话
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {visibleAttachmentRowCount} 项附件
                </div>
              </div>
            </button>

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
                    {attachmentCounts[conversation.id] ?? 0} 项附件
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
        {conversations.length ? (
          <DesktopEntryShell
            badge="Files"
            title={selectedConversation?.title ?? "全部会话聊天文件"}
            description={
              selectedConversation
                ? "当前会话内的图片和文件已经集中到这里，也支持回跳原消息继续处理。"
                : "桌面端聊天文件现在支持跨会话聚合，方便像微信一样统一翻最近发过的图片和文件。"
            }
            aside={
              <div className="space-y-3">
                <InfoCard
                  label="会话类型"
                  value={
                    selectedConversation
                      ? selectedConversation.type === "group"
                        ? "群聊"
                        : "单聊"
                      : "全部会话"
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
              {allAttachmentsQuery.isLoading ? (
                <LoadingBlock label="正在读取附件..." />
              ) : null}
              {allAttachmentsQuery.isError &&
              allAttachmentsQuery.error instanceof Error ? (
                <ErrorBlock message={allAttachmentsQuery.error.message} />
              ) : null}

              {attachmentRows.map((item) => {
                const sourceId = `chat-file-${item.id}`;
                const collected = favoriteSourceIds.includes(sourceId);
                const favoriteRouteHash = buildDesktopChatFilesRouteHash(
                  item.conversationId,
                );

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
                          {item.senderName} · {item.conversationTitle} ·{" "}
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
                              if (item.conversationType === "group") {
                                void navigate({
                                  to: "/group/$groupId",
                                  params: { groupId: item.conversationId },
                                  hash: `chat-message-${item.id}`,
                                });
                                return;
                              }

                              void navigate({
                                to: "/chat/$conversationId",
                                params: {
                                  conversationId: item.conversationId,
                                },
                                hash: `chat-message-${item.id}`,
                              });
                            }}
                            className="rounded-full"
                          >
                            定位到原消息
                          </Button>
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
                                    meta: `${item.conversationTitle} · ${formatMessageTimestamp(item.createdAt)}`,
                                    to: `/desktop/chat-files${favoriteRouteHash ? `#${favoriteRouteHash}` : ""}`,
                                    badge: "聊天文件",
                                    avatarName: item.conversationTitle,
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

              {!allAttachmentsQuery.isLoading && !attachmentRows.length ? (
                <EmptyState
                  title="当前筛选下没有附件"
                  description={
                    selectedConversation
                      ? "换一个会话、筛选类型，或者先在聊天里发一张图片或文件。"
                      : "试试筛选图片或文件，或者先在聊天里发一张图片或文件。"
                  }
                />
              ) : null}
            </div>
          </DesktopEntryShell>
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="还没有聊天文件"
              description="先在消息里发一张图片或文件，这里就会开始按会话和跨会话聚合。"
            />
          </div>
        )}
      </section>
    </div>
  );
}

function normalizeAttachmentRows(
  conversation: {
    id: string;
    title: string;
    type: "direct" | "group";
  },
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
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        conversationType: conversation.type,
        attachment,
        createdAt: item.createdAt,
        senderName: item.senderName,
        text: item.text,
      },
    ];
  });
}

async function fetchConversationAttachmentRows(
  conversation: {
    id: string;
    title: string;
    type: "direct" | "group";
  },
  baseUrl: string,
) {
  const messages = isPersistedGroupConversation(conversation)
    ? await getGroupMessages(conversation.id, baseUrl)
    : await getConversationMessages(conversation.id, baseUrl);

  return normalizeAttachmentRows(conversation, messages);
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
    item.conversationTitle.toLowerCase().includes(normalized) ||
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
