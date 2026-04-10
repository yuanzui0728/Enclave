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
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";
import { Button, ErrorBlock, LoadingBlock, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import {
  buildDesktopChatFilesRouteHash,
  parseDesktopChatFilesRouteState,
} from "../features/desktop/chat/desktop-chat-files-route-state";
import {
  openDesktopChatImageViewerWindow,
  type DesktopChatImageViewerSessionItem,
} from "../features/desktop/chat/desktop-chat-image-viewer-route-state";
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

type ImageAttachmentRow = AttachmentRow & {
  attachment: Extract<MessageAttachment, { kind: "image" }>;
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
  const [viewerAttachmentId, setViewerAttachmentId] = useState<string | null>(
    null,
  );
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
  const imageRows = useMemo(
    () => attachmentRows.filter(isImageAttachmentRow),
    [attachmentRows],
  );
  const activeImageIndex = viewerAttachmentId
    ? imageRows.findIndex((item) => item.id === viewerAttachmentId)
    : -1;
  const activeImage: ImageAttachmentRow | null =
    activeImageIndex >= 0 ? (imageRows[activeImageIndex] ?? null) : null;
  const standaloneViewerItems = useMemo(
    () =>
      imageRows.map(
        (item): DesktopChatImageViewerSessionItem => ({
          id: item.id,
          imageUrl: item.attachment.url,
          title: item.attachment.fileName,
          meta: `${item.conversationTitle} · ${item.senderName} · ${formatMessageTimestamp(item.createdAt)}`,
          returnTo: buildAttachmentMessagePath(item),
        }),
      ),
    [imageRows],
  );
  const visibleAttachmentRowCount = useMemo(
    () =>
      filterSearchableChatMessages(
        allAttachmentsQuery.data ?? [],
        localMessageActionState,
      ).length,
    [allAttachmentsQuery.data, localMessageActionState],
  );

  useEffect(() => {
    setViewerAttachmentId((current) =>
      current && imageRows.some((item) => item.id === current) ? current : null,
    );
  }, [imageRows]);

  if (!isDesktopLayout) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 bg-[#f5f5f5]">
      <section className="flex w-[300px] shrink-0 flex-col border-r border-black/6 bg-[#ededed]">
        <div className="border-b border-black/6 px-4 py-4">
          <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
            聊天文件
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            按会话聚合最近发送的图片和文件。
          </div>
          <TextField
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索文件名或消息内容"
            className="mt-4 h-9 rounded-[10px] border-black/8 bg-white px-3 text-sm shadow-none"
          />
        </div>

        <div className="flex items-center gap-2 px-4 py-3">
          {(["all", "image", "file"] as FileFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "rounded-[9px] border px-3 py-1.5 text-xs transition",
                filter === item
                  ? "border-[#d6d6d6] bg-white text-[color:var(--text-primary)]"
                  : "border-transparent bg-[#e3e3e3] text-[color:var(--text-secondary)] hover:border-black/6 hover:bg-[#e9e9e9]",
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

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setSelectedConversationId(null)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition",
                !selectedConversationId
                  ? "border-black/8 bg-white"
                  : "border-transparent bg-transparent hover:border-black/6 hover:bg-white/72",
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-black/6 bg-white text-sm font-medium text-[color:var(--text-secondary)]">
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
                  "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition",
                  conversation.id === selectedConversationId
                    ? "border-black/8 bg-white"
                    : "border-transparent bg-transparent hover:border-black/6 hover:bg-white/72",
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

      <section className="min-w-0 flex-1 overflow-auto p-4">
        {conversations.length ? (
          <DesktopEntryShell
            badge="聊天文件"
            title={selectedConversation?.title ?? "全部聊天文件"}
            description={
              selectedConversation
                ? "当前会话里的图片和文件会集中显示在这里。"
                : "这里会按会话聚合最近的聊天图片和文件。"
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
            <div className="space-y-3">
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
                const isImage = item.attachment.kind === "image";

                return (
                  <div
                    key={item.id}
                    className="rounded-[14px] border border-black/6 bg-white p-4 transition hover:border-black/10 hover:bg-[#fcfcfc]"
                  >
                    <div className="flex items-start gap-4">
                      {isImage ? (
                        <button
                          type="button"
                          onClick={() => setViewerAttachmentId(item.id)}
                          className="group relative block h-24 w-24 shrink-0 overflow-hidden rounded-[12px] border border-black/6 bg-[#f5f5f5]"
                        >
                          <img
                            src={item.attachment.url}
                            alt={item.attachment.fileName}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                          />
                          <div className="absolute inset-x-0 bottom-0 border-t border-black/6 bg-black/40 px-2 py-1.5 text-left text-[10px] text-white">
                            点击预览
                          </div>
                        </button>
                      ) : (
                        <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-[12px] border border-black/6 bg-[#f4f4f4] px-4 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4b5563]">
                            <FileText size={18} />
                          </div>
                          <div className="mt-3 line-clamp-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
                            {resolveAttachmentExtension(item.attachment.fileName)}
                          </div>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {item.attachment.fileName}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {item.senderName} · {item.conversationTitle} ·{" "}
                          {formatMessageTimestamp(item.createdAt)}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                          {item.text.trim() || "这条消息没有额外正文。"}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {isImage ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setViewerAttachmentId(item.id)}
                              className="h-8 rounded-[8px] border-black/8 bg-[#f7f7f7] px-3 text-[12px] shadow-none hover:bg-[#efefef]"
                            >
                              预览图片
                            </Button>
                          ) : null}
                          <a
                            href={item.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center justify-center rounded-[8px] bg-[#07c160] px-3 text-[12px] font-medium text-white transition hover:bg-[#06ad56]"
                          >
                            打开附件
                          </a>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              saveUrlAsFile(
                                item.attachment.url,
                                item.attachment.fileName,
                              )
                            }
                            className="h-8 rounded-[8px] border-black/8 bg-[#f7f7f7] px-3 text-[12px] shadow-none hover:bg-[#efefef]"
                          >
                            保存附件
                          </Button>
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
                            className="h-8 rounded-[8px] border-black/8 bg-[#f7f7f7] px-3 text-[12px] shadow-none hover:bg-[#efefef]"
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
                            className="h-8 rounded-[8px] border-black/8 bg-[#f7f7f7] px-3 text-[12px] shadow-none hover:bg-[#efefef]"
                          >
                            {collected ? "取消收藏" : "收藏"}
                          </Button>
                        </div>
                      </div>
                      <div className="shrink-0 rounded-[8px] bg-[#f5f5f5] px-2.5 py-1 text-xs text-[color:var(--text-muted)]">
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
      {activeImage ? (
        <DesktopChatFilesImageViewer
          item={activeImage}
          index={activeImageIndex}
          total={imageRows.length}
          onClose={() => setViewerAttachmentId(null)}
          onPrevious={
            activeImageIndex > 0
              ? () => setViewerAttachmentId(imageRows[activeImageIndex - 1].id)
              : undefined
          }
          onNext={
            activeImageIndex < imageRows.length - 1
              ? () => setViewerAttachmentId(imageRows[activeImageIndex + 1].id)
              : undefined
          }
          onOpenInWindow={() => {
            openDesktopChatImageViewerWindow({
              imageUrl: activeImage.attachment.url,
              title: activeImage.attachment.fileName,
              meta: `${activeImage.conversationTitle} · ${activeImage.senderName} · ${formatMessageTimestamp(activeImage.createdAt)}`,
              returnTo: buildAttachmentMessagePath(activeImage),
              items: standaloneViewerItems,
              activeId: activeImage.id,
            });
          }}
          onSave={() =>
            saveUrlAsFile(
              activeImage.attachment.url,
              activeImage.attachment.fileName,
            )
          }
        />
      ) : null}
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

function isImageAttachmentRow(
  item: AttachmentRow,
): item is ImageAttachmentRow {
  return item.attachment.kind === "image";
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

function resolveAttachmentExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return "文件";
  }

  return fileName.slice(dotIndex + 1).toUpperCase();
}

function saveUrlAsFile(url: string, fileName: string) {
  if (typeof document === "undefined") {
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-black/6 bg-[#f7f7f7] p-4">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function buildAttachmentMessagePath(item: AttachmentRow) {
  return item.conversationType === "group"
    ? `/group/${item.conversationId}#chat-message-${item.id}`
    : `/chat/${item.conversationId}#chat-message-${item.id}`;
}

function DesktopChatFilesImageViewer({
  item,
  index,
  total,
  onClose,
  onPrevious,
  onNext,
  onOpenInWindow,
  onSave,
}: {
  item: ImageAttachmentRow;
  index: number;
  total: number;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onOpenInWindow: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && onPrevious) {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrevious]);

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(17,24,39,0.72)] backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="关闭图片预览"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-white/10 px-6 py-4 text-white">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">
            {item.attachment.fileName}
          </div>
          <div className="mt-1 text-[12px] text-white/70">
            {item.conversationTitle} · {item.senderName} ·{" "}
            {formatMessageTimestamp(item.createdAt)}
          </div>
        </div>
        <div className="ml-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenInWindow}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
            aria-label="新窗口打开"
          >
            <ExternalLink size={16} />
          </button>
          <button
            type="button"
            onClick={onSave}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
            aria-label="保存图片"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {onPrevious ? (
        <button
          type="button"
          onClick={onPrevious}
          className="absolute left-6 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[12px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
          aria-label="上一张"
        >
          <ChevronLeft size={20} />
        </button>
      ) : null}

      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-6 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[12px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
          aria-label="下一张"
        >
          <ChevronRight size={20} />
        </button>
      ) : null}

      <div className="absolute inset-0 flex items-center justify-center px-24 pb-24 pt-24">
        <img
          src={item.attachment.url}
          alt={item.attachment.fileName}
          className="max-h-full max-w-full rounded-[18px] object-contain shadow-[0_24px_72px_rgba(15,23,42,0.36)]"
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between border-t border-white/10 px-6 py-4 text-white/76">
        <div className="text-[12px]">
          {formatAttachmentMeta(item.attachment)}
        </div>
        <div className="text-[12px]">
          {index + 1} / {total}
        </div>
      </div>
    </div>
  );
}
