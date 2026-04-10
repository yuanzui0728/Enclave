import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ContactRound,
  Download,
  ExternalLink,
  FileText,
  LocateFixed,
  MapPin,
  Printer,
  X,
} from "lucide-react";
import {
  getConversations,
  sendGroupMessage,
  type ConversationListItem,
  type MessageAttachment,
  type SendGroupMessageRequest,
  type SendMessagePayload,
} from "@yinjie/contracts";
import { Button, InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { GroupMessageContextMenu } from "../features/chat/group-message-context-menu";
import { MobileMessageActionSheet } from "../features/chat/mobile-message-action-sheet";
import {
  DesktopMessageForwardDialog,
  type DesktopMessageForwardPreviewItem,
} from "../features/desktop/chat/desktop-message-forward-dialog";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import {
  extractChatReplyMetadata,
  sanitizeDisplayedChatText,
  splitChatTextSegments,
} from "../lib/chat-text";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import {
  formatDetailedMessageTimestamp,
  formatMessageTimestamp,
  parseTimestamp,
} from "../lib/format";
import { emitChatMessage, joinConversationRoom } from "../lib/socket";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export type ChatRenderableMessage = {
  id: string;
  senderType: string;
  senderName?: string | null;
  type?: string | null;
  text: string;
  attachment?: MessageAttachment;
  createdAt: string;
};

type OpenableAttachment =
  | Extract<MessageAttachment, { kind: "image" }>
  | Extract<MessageAttachment, { kind: "file" }>;

type ChatMessageListProps = {
  messages: ChatRenderableMessage[];
  groupMode?: boolean;
  showGroupMemberNicknames?: boolean;
  variant?: "mobile" | "desktop";
  highlightedMessageId?: string;
  emptyState?: React.ReactNode;
  onReplyMessage?: (message: ChatRenderableMessage) => void;
  onSelectionModeChange?: (active: boolean) => void;
};

export function ChatMessageList({
  messages,
  groupMode = false,
  showGroupMemberNicknames = true,
  variant = "mobile",
  highlightedMessageId,
  emptyState,
  onReplyMessage,
  onSelectionModeChange,
}: ChatMessageListProps) {
  const isDesktop = variant === "desktop";
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "";
  const [activeHighlightedMessageId, setActiveHighlightedMessageId] = useState<
    string | undefined
  >(highlightedMessageId);
  const [actionNotice, setActionNotice] = useState<{
    message: string;
    tone: "success" | "danger";
  } | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    message: ChatRenderableMessage;
    x: number;
    y: number;
  } | null>(null);
  const [mobileActionMessage, setMobileActionMessage] =
    useState<ChatRenderableMessage | null>(null);
  const [viewerMessageId, setViewerMessageId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [selectionAnchorMessageId, setSelectionAnchorMessageId] = useState<
    string | null
  >(null);
  const [forwardMessages, setForwardMessages] = useState<
    ChatRenderableMessage[] | null
  >(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const contextMenuEnabled = isDesktop && !selectionMode;
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const [detailedTimestampMode, setDetailedTimestampMode] = useState(() =>
    readDetailedTimestampMode(),
  );

  useEffect(() => {
    if (!highlightedMessageId) {
      setActiveHighlightedMessageId(undefined);
      return;
    }

    setActiveHighlightedMessageId(highlightedMessageId);
    const timer = window.setTimeout(() => {
      setActiveHighlightedMessageId((current) =>
        current === highlightedMessageId ? undefined : current,
      );
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [highlightedMessageId]);

  useEffect(() => {
    if (!actionNotice) {
      return;
    }

    const timer = window.setTimeout(() => setActionNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const closeMenu = () => setContextMenuState(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [contextMenuState]);

  useEffect(() => {
    setContextMenuState(null);
    setMobileActionMessage(null);
    setSelectedMessageIds((current) =>
      current.filter((item) => messages.some((message) => message.id === item)),
    );
    setForwardMessages((current) =>
      current?.length
        ? current.filter((item) =>
            messages.some((message) => message.id === item.id),
          )
        : null,
    );
    setSelectionAnchorMessageId((current) =>
      current && messages.some((message) => message.id === current)
        ? current
        : null,
    );
    setViewerMessageId((current) =>
      current && messages.some((message) => message.id === current)
        ? current
        : null,
    );
  }, [messages]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, []);

  useEffect(() => {
    writeDetailedTimestampMode(detailedTimestampMode);
  }, [detailedTimestampMode]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setSelectionAnchorMessageId(null);
    setForwardMessages(null);
  }, [isDesktop]);

  useEffect(() => {
    if (selectionMode) {
      return;
    }

    setSelectedMessageIds([]);
    setSelectionAnchorMessageId(null);
  }, [selectionMode]);

  useEffect(() => {
    onSelectionModeChange?.(selectionMode);
  }, [onSelectionModeChange, selectionMode]);

  const forwardConversationsQuery = useQuery({
    queryKey: ["desktop-message-forward-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(forwardMessages?.length),
  });

  const forwardMutation = useMutation({
    mutationFn: async (conversation: ConversationListItem) => {
      const messageQueue = forwardMessages ?? [];
      if (!messageQueue.length) {
        return {
          conversationTitle: conversation.title,
          count: 0,
        };
      }

      for (const message of messageQueue) {
        await forwardMessageToConversation({
          baseUrl,
          conversation,
          message,
        });
      }

      return {
        conversationTitle: conversation.title,
        count: messageQueue.length,
      };
    },
    onSuccess: async ({ conversationTitle, count }) => {
      setForwardMessages(null);
      setSelectionMode(false);
      setSelectedMessageIds([]);
      setActionNotice({
        message:
          count <= 1
            ? `已转发到 ${conversationTitle}。`
            : `已转发 ${count} 条消息到 ${conversationTitle}。`,
        tone: "success",
      });

      window.setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      }, 500);
    },
    onError: (error) => {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "转发失败，请稍后再试。",
        tone: "danger",
      });
    },
  });

  const copyToClipboard = async (text: string, successMessage: string) => {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setActionNotice({
        message: "当前环境不支持剪贴板复制。",
        tone: "danger",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setActionNotice({
        message: successMessage,
        tone: "success",
      });
    } catch {
      setActionNotice({
        message: "复制失败，请稍后再试。",
        tone: "danger",
      });
    }
  };

  const handleMessageContextMenu = (
    event: MouseEvent<HTMLDivElement>,
    message: ChatRenderableMessage,
  ) => {
    if (!contextMenuEnabled) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    setContextMenuState({
      message,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const jumpToMessage = (messageId: string) => {
    setActiveHighlightedMessageId(messageId);
    window.setTimeout(() => {
      setActiveHighlightedMessageId((current) =>
        current === messageId ? undefined : current,
      );
    }, 2400);

    window.requestAnimationFrame(() => {
      const target = document.getElementById(`chat-message-${messageId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current === null) {
      longPressStartRef.current = null;
      return;
    }

    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  };

  const handleMobileMessagePointerDown = (
    event: PointerEvent<HTMLDivElement>,
    message: ChatRenderableMessage,
  ) => {
    if (isDesktop || event.pointerType === "mouse" || selectionMode) {
      return;
    }

    longPressStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      setMobileActionMessage(message);
      clearLongPressTimer();
    }, 380);
  };

  const handleMobileMessagePointerMove = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (
      isDesktop ||
      event.pointerType === "mouse" ||
      !longPressStartRef.current
    ) {
      return;
    }

    if (
      Math.abs(event.clientX - longPressStartRef.current.x) > 8 ||
      Math.abs(event.clientY - longPressStartRef.current.y) > 8
    ) {
      clearLongPressTimer();
    }
  };

  const imageMessages = messages
    .filter(
      (
        message,
      ): message is ChatRenderableMessage & {
        type: "image";
        attachment: Extract<MessageAttachment, { kind: "image" }>;
      } => message.type === "image" && message.attachment?.kind === "image",
    )
    .map((message) => ({
      id: message.id,
      url: message.attachment.url,
      label:
        message.attachment.fileName ||
        sanitizeDisplayedChatText(message.text) ||
        "[图片]",
      fileName: message.attachment.fileName,
    }));
  const activeImageIndex = viewerMessageId
    ? imageMessages.findIndex((message) => message.id === viewerMessageId)
    : -1;
  const activeImage =
    activeImageIndex >= 0 ? imageMessages[activeImageIndex] : null;

  const openImageByIndex = (nextIndex: number) => {
    const target = imageMessages[nextIndex];
    if (!target) {
      return;
    }

    setViewerMessageId(target.id);
  };

  useEffect(() => {
    if (!isDesktop || !activeImage) {
      return;
    }

    const openImageFromKeyboard = (nextIndex: number) => {
      const target = imageMessages[nextIndex];
      if (!target) {
        return;
      }

      setViewerMessageId(target.id);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewerMessageId(null);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        openImageFromKeyboard(Math.max(activeImageIndex - 1, 0));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        openImageFromKeyboard(
          Math.min(activeImageIndex + 1, imageMessages.length - 1),
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeImage, activeImageIndex, imageMessages, isDesktop]);

  const handleToggleFavorite = (message: ChatRenderableMessage) => {
    const sourceId = buildFavoriteSourceId(message.id);
    const collected = favoriteSourceIds.includes(sourceId);

    if (collected) {
      const nextFavorites = removeDesktopFavorite(sourceId);
      setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
      setActionNotice({
        message: "已取消收藏消息。",
        tone: "success",
      });
      return;
    }

    const nextFavorites = upsertDesktopFavorite(
      buildMessageFavoriteRecord(message, groupMode),
    );
    setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
    setActionNotice({
      message: "消息已加入收藏。",
      tone: "success",
    });
  };

  const openAttachment = (message: ChatRenderableMessage) => {
    if (message.type === "image" && message.attachment?.kind === "image") {
      setViewerMessageId(message.id);
      return;
    }

    const attachment = getOpenableAttachment(message);
    if (!attachment || attachment.kind !== "file") {
      return;
    }

    window.open(attachment.url, "_blank", "noopener,noreferrer");
    setActionNotice({
      message: "已打开文件。",
      tone: "success",
    });
  };

  const saveAttachment = (message: ChatRenderableMessage) => {
    const attachment = getOpenableAttachment(message);
    if (!attachment || typeof document === "undefined") {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = attachment.url;
    anchor.download =
      attachment.kind === "file"
        ? attachment.fileName
        : attachment.fileName || "image";
    anchor.rel = "noreferrer";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    setActionNotice({
      message:
        attachment.kind === "image" ? "图片开始下载。" : "文件开始下载。",
      tone: "success",
    });
  };

  const showUnavailableActionNotice = (message: string) => {
    setActionNotice({
      message,
      tone: "danger",
    });
  };
  const selectedMessageIdSet = useMemo(
    () => new Set(selectedMessageIds),
    [selectedMessageIds],
  );
  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedMessageIdSet.has(message.id)),
    [messages, selectedMessageIdSet],
  );
  const forwardPreviewItems: DesktopMessageForwardPreviewItem[] = useMemo(
    () =>
      (forwardMessages ?? []).map((message) => ({
        id: message.id,
        senderName: buildClipboardSender(message),
        previewText: buildForwardPreviewText(message),
        typeLabel: resolveForwardTypeLabel(message),
      })),
    [forwardMessages],
  );

  if (!messages.length) {
    return emptyState ?? null;
  }

  const enterSelectionMode = (messageId: string) => {
    setSelectionMode(true);
    setSelectedMessageIds([messageId]);
    setSelectionAnchorMessageId(messageId);
  };

  const toggleSelectedMessage = (messageId: string) => {
    const removing = selectedMessageIdSet.has(messageId);
    const nextSelectedMessageIds = removing
      ? selectedMessageIds.filter((item) => item !== messageId)
      : [...selectedMessageIds, messageId];

    setSelectedMessageIds(nextSelectedMessageIds);
    if (removing && selectionAnchorMessageId === messageId) {
      setSelectionAnchorMessageId(nextSelectedMessageIds[0] ?? null);
      return;
    }

    if (!removing && !selectionAnchorMessageId) {
      setSelectionAnchorMessageId(messageId);
    }
  };

  const selectMessageRangeTo = (targetMessageId: string) => {
    if (!selectionAnchorMessageId) {
      return;
    }

    const anchorIndex = messages.findIndex(
      (message) => message.id === selectionAnchorMessageId,
    );
    const targetIndex = messages.findIndex(
      (message) => message.id === targetMessageId,
    );
    if (anchorIndex < 0 || targetIndex < 0) {
      return;
    }

    const [startIndex, endIndex] =
      anchorIndex <= targetIndex
        ? [anchorIndex, targetIndex]
        : [targetIndex, anchorIndex];
    const rangeIds = new Set(
      messages
        .slice(startIndex, endIndex + 1)
        .map((message) => message.id),
    );
    const nextSelectedMessageIds = messages
      .filter(
        (message) =>
          selectedMessageIdSet.has(message.id) || rangeIds.has(message.id),
      )
      .map((message) => message.id);

    setSelectedMessageIds(nextSelectedMessageIds);
    setActionNotice({
      message: `已选择到这里，共 ${nextSelectedMessageIds.length} 条消息。`,
      tone: "success",
    });
  };

  return (
    <div className={isDesktop ? "space-y-5" : "space-y-4"}>
      {actionNotice ? (
        <InlineNotice className="text-xs" tone={actionNotice.tone}>
          {actionNotice.message}
        </InlineNotice>
      ) : null}
      {selectionMode ? (
        isDesktop ? (
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-[20px] border border-black/6 bg-white/92 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="text-sm text-[color:var(--text-primary)]">
              已选择 {selectedMessageIds.length} 条消息
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSelectionMode(false)}
                className="rounded-full"
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!selectedMessageIds.length}
                onClick={() => setForwardMessages(selectedMessages)}
                className="rounded-full"
              >
                逐条转发
              </Button>
            </div>
          </div>
        ) : (
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-black/6 bg-[rgba(247,247,247,0.96)] px-1 py-2.5 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setSelectionMode(false)}
              className="flex h-10 min-w-12 items-center justify-start rounded-[10px] px-2 text-[16px] text-[#111827]"
            >
              取消
            </button>
            <div className="text-[16px] font-medium text-[#111827]">
              已选 {selectedMessageIds.length} 条
            </div>
            <button
              type="button"
              disabled={!selectedMessageIds.length}
              onClick={() => setForwardMessages(selectedMessages)}
              className="flex h-10 min-w-12 items-center justify-end rounded-[10px] px-2 text-[16px] font-medium text-[#07c160] disabled:text-[#b8b8b8]"
            >
              转发
            </button>
          </div>
        )
      ) : null}
      {messages.map((message, index) => {
        const previousMessage = index > 0 ? messages[index - 1] : undefined;
        const showTimestamp = shouldShowMessageTimestamp(
          message.createdAt,
          previousMessage?.createdAt,
        );
        const isUser = message.senderType === "user";
        const isSystem =
          message.type === "system" || message.senderType === "system";
        const isHighlighted = message.id === activeHighlightedMessageId;
        const isSelected = selectedMessageIdSet.has(message.id);
        const replyContent = extractChatReplyMetadata(message.text);
        const displayText =
          isUser && !isSystem
            ? replyContent.body.trim()
            : sanitizeDisplayedChatText(message.text);
        const replyPreview = replyContent.reply;

        if (isSystem) {
          return (
            <InlineNotice
              key={message.id}
              id={`chat-message-${message.id}`}
              className={`mx-auto max-w-[84%] rounded-full px-3 py-1.5 text-center text-[11px] text-[color:var(--text-muted)] ${
                isDesktop
                  ? "border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]"
                  : "border border-black/5 bg-[rgba(255,255,255,0.82)] shadow-none"
              } ${isHighlighted ? "ring-2 ring-[rgba(255,191,0,0.34)] ring-offset-2 ring-offset-transparent" : ""}`}
              tone="muted"
            >
              {displayText}
            </InlineNotice>
          );
        }

        return (
          <div key={message.id}>
            {showTimestamp ? (
              <div className="pb-2 pt-1 text-center">
                <button
                  type="button"
                  onClick={() =>
                    setDetailedTimestampMode((current) => !current)
                  }
                  className="inline-flex rounded-full bg-[rgba(0,0,0,0.08)] px-3 py-1 text-[11px] text-[#7d7d7d] transition active:bg-[rgba(0,0,0,0.12)]"
                  aria-label={
                    detailedTimestampMode
                      ? "切换为简略时间显示"
                      : "切换为完整日期显示"
                  }
                >
                  {detailedTimestampMode
                    ? formatDetailedMessageTimestamp(message.createdAt)
                    : formatMessageTimestamp(message.createdAt)}
                </button>
              </div>
            ) : null}
            <div
              id={`chat-message-${message.id}`}
              onClick={
                selectionMode
                  ? () => {
                      toggleSelectedMessage(message.id);
                    }
                  : undefined
              }
              onContextMenu={(event) =>
                handleMessageContextMenu(event, message)
              }
              onPointerDown={(event) =>
                handleMobileMessagePointerDown(event, message)
              }
              onPointerUp={clearLongPressTimer}
              onPointerCancel={clearLongPressTimer}
              onPointerMove={handleMobileMessagePointerMove}
              className={`space-y-1.5 rounded-[22px] px-2 py-1.5 transition-[background-color,box-shadow] duration-300 ${
                isHighlighted
                  ? "bg-[rgba(255,224,120,0.15)] shadow-[0_0_0_1px_rgba(255,191,0,0.16)]"
                  : isSelected
                    ? "bg-[rgba(7,193,96,0.08)] shadow-[0_0_0_1px_rgba(7,193,96,0.16)]"
                    : ""
              }`}
            >
              <div
                className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && selectionMode ? (
                  <SelectionToggle
                    checked={isSelected}
                    onClick={() => toggleSelectedMessage(message.id)}
                  />
                ) : null}
                {!isUser ? (
                  <AvatarChip name={message.senderName} size="wechat" />
                ) : null}
                <div
                  className={`flex max-w-[78%] flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  {!isUser && groupMode && showGroupMemberNicknames ? (
                    <div className="mb-1 px-1 text-[11px] text-[color:var(--text-muted)]">
                      {message.senderName}
                    </div>
                  ) : null}
                  {replyPreview ? (
                    <ReplyQuoteCard
                      messageId={replyPreview.messageId}
                      senderName={replyPreview.senderName}
                      previewText={replyPreview.previewText}
                      align={isUser ? "right" : "left"}
                      variant={variant}
                      onJump={jumpToMessage}
                      disabled={selectionMode}
                    />
                  ) : null}
                  {message.type === "sticker" &&
                  message.attachment?.kind === "sticker" ? (
                    <StickerMessage
                      url={message.attachment.url}
                      label={message.attachment.label ?? displayText}
                      maxSize={isDesktop ? 160 : 132}
                    />
                  ) : message.type === "image" &&
                    message.attachment?.kind === "image" ? (
                    <ImageMessage
                      url={message.attachment.url}
                      label={message.attachment.fileName || displayText}
                      maxSize={isDesktop ? 180 : 144}
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => setViewerMessageId(message.id)
                      }
                    />
                  ) : message.type === "file" &&
                    message.attachment?.kind === "file" ? (
                    <FileAttachmentMessage attachment={message.attachment} />
                  ) : message.type === "contact_card" &&
                    message.attachment?.kind === "contact_card" ? (
                    <ContactCardMessage attachment={message.attachment} />
                  ) : message.type === "location_card" &&
                    message.attachment?.kind === "location_card" ? (
                    <LocationCardMessage attachment={message.attachment} />
                  ) : (
                    <div
                      className={`rounded-[18px] px-3.5 py-2.5 text-[15px] leading-6 ${
                        isUser
                          ? isDesktop
                            ? "bg-[var(--brand-gradient)] text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)]"
                            : "bg-[#95ec69] text-[#111827] [animation:bubble-in_220ms_cubic-bezier(0.22,1,0.36,1)] shadow-none"
                          : isDesktop
                            ? "border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
                            : "border border-black/5 bg-white text-[color:var(--text-primary)] shadow-none"
                      } whitespace-pre-wrap break-words`}
                    >
                      {renderTextWithMentions(displayText)}
                    </div>
                  )}
                </div>
                {isUser ? <AvatarChip name="我" size="wechat" /> : null}
                {isUser && selectionMode ? (
                  <SelectionToggle
                    checked={isSelected}
                    onClick={() => toggleSelectedMessage(message.id)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      {contextMenuState ? (
        <GroupMessageContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          onClose={() => setContextMenuState(null)}
          onReply={
            onReplyMessage
              ? () => {
                  onReplyMessage(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          onForward={
            canForwardMessage(contextMenuState.message)
              ? () => {
                  setForwardMessages([contextMenuState.message]);
                  setContextMenuState(null);
                }
              : undefined
          }
          onMultiSelect={() => {
            enterSelectionMode(contextMenuState.message.id);
            setContextMenuState(null);
          }}
          onSetReminder={() => {
            showUnavailableActionNotice(
              "消息提醒能力待接服务端提醒接口，当前先保留微信式入口。",
            );
            setContextMenuState(null);
          }}
          reminderLabel="提醒"
          onCopyText={() => {
            void copyToClipboard(
              buildClipboardText(contextMenuState.message),
              "消息内容已复制。",
            );
            setContextMenuState(null);
          }}
          onToggleFavorite={() => {
            handleToggleFavorite(contextMenuState.message);
            setContextMenuState(null);
          }}
          favoriteLabel={
            favoriteSourceIds.includes(
              buildFavoriteSourceId(contextMenuState.message.id),
            )
              ? "取消收藏"
              : "收藏消息"
          }
          onOpenAttachment={
            getOpenableAttachment(contextMenuState.message)
              ? () => {
                  openAttachment(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          openAttachmentLabel={
            contextMenuState.message.type === "image" ? "打开图片" : "打开文件"
          }
          onSaveAttachment={
            getOpenableAttachment(contextMenuState.message)
              ? () => {
                  saveAttachment(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          saveAttachmentLabel={
            contextMenuState.message.type === "image" ? "另存图片" : "另存文件"
          }
          onCopySender={() => {
            void copyToClipboard(
              buildClipboardSender(contextMenuState.message),
              "发送者名称已复制。",
            );
            setContextMenuState(null);
          }}
          onRecall={
            contextMenuState.message.senderType === "user"
              ? () => {
                  showUnavailableActionNotice(
                    "撤回消息能力待接消息级接口，当前先保留微信式入口。",
                  );
                  setContextMenuState(null);
                }
              : undefined
          }
          recallLabel="撤回"
          onDelete={() => {
            showUnavailableActionNotice(
              "删除消息能力待接消息级接口，当前先保留微信式入口。",
            );
            setContextMenuState(null);
          }}
          deleteLabel="删除"
        />
      ) : null}
      <MobileMessageActionSheet
        open={Boolean(mobileActionMessage)}
        onClose={() => setMobileActionMessage(null)}
        title={
          mobileActionMessage?.senderType === "user" ? "我的消息" : "消息操作"
        }
        onReply={
          mobileActionMessage && onReplyMessage
            ? () => {
                onReplyMessage(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        onForward={
          mobileActionMessage && canForwardMessage(mobileActionMessage)
            ? () => {
                setForwardMessages([mobileActionMessage]);
                setMobileActionMessage(null);
              }
            : undefined
        }
        onMultiSelect={
          mobileActionMessage
            ? () => {
                enterSelectionMode(mobileActionMessage.id);
                setMobileActionMessage(null);
              }
            : undefined
        }
        onSelectToHere={
          mobileActionMessage &&
          selectionMode &&
          selectionAnchorMessageId &&
          mobileActionMessage.id !== selectionAnchorMessageId
            ? () => {
                selectMessageRangeTo(mobileActionMessage.id);
                setMobileActionMessage(null);
              }
            : undefined
        }
        onSetReminder={
          mobileActionMessage
            ? () => {
                showUnavailableActionNotice(
                  "消息提醒能力待接服务端提醒接口，当前先保留微信式入口。",
                );
                setMobileActionMessage(null);
              }
            : undefined
        }
        reminderLabel="提醒"
        onToggleFavorite={
          mobileActionMessage
            ? () => {
                handleToggleFavorite(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        favoriteLabel={
          mobileActionMessage &&
          favoriteSourceIds.includes(
            buildFavoriteSourceId(mobileActionMessage.id),
          )
            ? "取消收藏"
            : "收藏"
        }
        onCopy={() => {
          if (!mobileActionMessage) {
            return;
          }

          void copyToClipboard(
            buildClipboardText(mobileActionMessage),
            "消息内容已复制。",
          );
          setMobileActionMessage(null);
        }}
        onCopySender={
          mobileActionMessage &&
          groupMode &&
          mobileActionMessage.senderType !== "user"
            ? () => {
                void copyToClipboard(
                  buildClipboardSender(mobileActionMessage),
                  "发送者名称已复制。",
                );
                setMobileActionMessage(null);
              }
            : undefined
        }
        onOpenAttachment={
          mobileActionMessage && getOpenableAttachment(mobileActionMessage)
            ? () => {
                openAttachment(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        openAttachmentLabel={
          mobileActionMessage?.type === "image" ? "查看图片" : "打开文件"
        }
        onSaveAttachment={
          mobileActionMessage && getOpenableAttachment(mobileActionMessage)
            ? () => {
                saveAttachment(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        saveAttachmentLabel={
          mobileActionMessage?.type === "image" ? "保存图片" : "保存文件"
        }
        onRecall={
          mobileActionMessage?.senderType === "user"
            ? () => {
                showUnavailableActionNotice(
                  "撤回消息能力待接消息级接口，当前先保留微信式入口。",
                );
                setMobileActionMessage(null);
              }
            : undefined
        }
        recallLabel="撤回"
        onDelete={
          mobileActionMessage
            ? () => {
                showUnavailableActionNotice(
                  "删除消息能力待接消息级接口，当前先保留微信式入口。",
                );
                setMobileActionMessage(null);
              }
            : undefined
        }
        deleteLabel="删除"
      />
      {activeImage ? (
        <ImageViewerOverlay
          variant={variant}
          activeImage={activeImage}
          activeIndex={activeImageIndex}
          total={imageMessages.length}
          onClose={() => setViewerMessageId(null)}
          onPrevious={
            activeImageIndex > 0
              ? () => openImageByIndex(activeImageIndex - 1)
              : undefined
          }
          onNext={
            activeImageIndex < imageMessages.length - 1
              ? () => openImageByIndex(activeImageIndex + 1)
              : undefined
          }
          onLocate={() => {
            setViewerMessageId(null);
            jumpToMessage(activeImage.id);
          }}
          onSave={() =>
            saveUrlAsFile(
              activeImage.url,
              activeImage.fileName || activeImage.label || "image",
            )
          }
          onOpenInWindow={
            isDesktop
              ? () => {
                  if (
                    openUrlInNewWindow(activeImage.url, "noopener,noreferrer")
                  ) {
                    setActionNotice({
                      message: "已在新窗口打开图片。",
                      tone: "success",
                    });
                    return;
                  }

                  setActionNotice({
                    message: "浏览器阻止了新窗口，请检查弹窗权限。",
                    tone: "danger",
                  });
                }
              : undefined
          }
          onPrint={
            isDesktop
              ? () => {
                  if (
                    openPrintWindow({
                      title:
                        activeImage.fileName || activeImage.label || "图片",
                      imageUrl: activeImage.url,
                    })
                  ) {
                    setActionNotice({
                      message: "已打开图片打印窗口。",
                      tone: "success",
                    });
                    return;
                  }

                  setActionNotice({
                    message: "浏览器阻止了打印窗口，请检查弹窗权限。",
                    tone: "danger",
                  });
                }
              : undefined
          }
        />
      ) : null}
      <DesktopMessageForwardDialog
        open={Boolean(forwardMessages?.length)}
        messages={forwardPreviewItems}
        conversations={forwardConversationsQuery.data ?? []}
        variant={variant}
        loading={forwardConversationsQuery.isLoading}
        pending={forwardMutation.isPending}
        error={
          forwardConversationsQuery.error instanceof Error
            ? forwardConversationsQuery.error.message
            : null
        }
        onClose={() => setForwardMessages(null)}
        onForward={(conversation) => {
          void forwardMutation.mutateAsync(conversation);
        }}
      />
    </div>
  );
}

function shouldShowMessageTimestamp(
  createdAt?: string | null,
  previousCreatedAt?: string | null,
) {
  if (!createdAt) {
    return false;
  }

  if (!previousCreatedAt) {
    return true;
  }

  const currentTimestamp = parseTimestamp(createdAt);
  const previousTimestamp = parseTimestamp(previousCreatedAt);
  if (currentTimestamp === null || previousTimestamp === null) {
    return true;
  }

  return currentTimestamp - previousTimestamp >= 5 * 60 * 1000;
}

const DETAILED_TIMESTAMP_MODE_STORAGE_KEY = "chat-detailed-timestamp-mode";

function readDetailedTimestampMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.localStorage.getItem(DETAILED_TIMESTAMP_MODE_STORAGE_KEY) === "1"
  );
}

function writeDetailedTimestampMode(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DETAILED_TIMESTAMP_MODE_STORAGE_KEY,
    enabled ? "1" : "0",
  );
}

function buildClipboardSender(message: ChatRenderableMessage) {
  if (message.senderType === "user") {
    return "我";
  }

  return message.senderName?.trim() || "群成员";
}

function buildClipboardText(message: ChatRenderableMessage) {
  const replyContent = extractChatReplyMetadata(message.text);
  const displayedText =
    message.senderType === "user"
      ? replyContent.body.trim()
      : sanitizeDisplayedChatText(message.text).trim();

  if (displayedText) {
    return displayedText;
  }

  if (message.type === "image") {
    return message.attachment?.kind === "image" && message.attachment.fileName
      ? `[图片] ${message.attachment.fileName}`
      : "[图片]";
  }

  if (message.type === "file") {
    return message.attachment?.kind === "file" && message.attachment.fileName
      ? `[文件] ${message.attachment.fileName}`
      : "[文件]";
  }

  if (message.type === "contact_card") {
    return message.attachment?.kind === "contact_card"
      ? `[名片] ${message.attachment.name}`
      : "[名片]";
  }

  if (message.type === "location_card") {
    return message.attachment?.kind === "location_card"
      ? `[位置] ${message.attachment.title}`
      : "[位置]";
  }

  if (message.type === "sticker") {
    return message.attachment?.kind === "sticker" && message.attachment.label
      ? `[表情] ${message.attachment.label}`
      : "[表情]";
  }

  return "消息";
}

function buildForwardPreviewText(message: ChatRenderableMessage) {
  const forwardedText = getForwardMessageText(message);
  if (forwardedText) {
    return forwardedText;
  }

  return buildClipboardText(message);
}

function resolveForwardTypeLabel(message: ChatRenderableMessage) {
  if (message.type === "image") {
    return "图片";
  }

  if (message.type === "file") {
    return "文件";
  }

  if (message.type === "contact_card") {
    return "名片";
  }

  if (message.type === "location_card") {
    return "位置";
  }

  if (message.type === "sticker") {
    return "表情";
  }

  return "消息";
}

function getForwardMessageText(message: ChatRenderableMessage) {
  const replyContent = extractChatReplyMetadata(message.text);
  const displayedText =
    message.senderType === "user"
      ? replyContent.body.trim()
      : sanitizeDisplayedChatText(message.text).trim();

  return displayedText || undefined;
}

function buildFavoriteSourceId(messageId: string) {
  return `chat-message-${messageId}`;
}

function buildMessageFavoriteRecord(
  message: ChatRenderableMessage,
  groupMode: boolean,
) {
  const senderName = buildClipboardSender(message);
  const description = buildClipboardText(message);
  const currentPath =
    typeof window === "undefined"
      ? "/tabs/chat"
      : `${window.location.pathname}${window.location.search}#chat-message-${message.id}`;

  return {
    id: `favorite-${buildFavoriteSourceId(message.id)}`,
    sourceId: buildFavoriteSourceId(message.id),
    category: "messages" as const,
    title: senderName,
    description,
    meta: formatMessageTimestamp(message.createdAt),
    to: currentPath,
    badge: groupMode ? "群聊消息" : "聊天消息",
    avatarName: senderName,
  };
}

function getOpenableAttachment(
  message: ChatRenderableMessage,
): OpenableAttachment | null {
  if (
    message.type === "image" &&
    message.attachment?.kind === "image" &&
    message.attachment.url
  ) {
    return message.attachment;
  }

  if (
    message.type === "file" &&
    message.attachment?.kind === "file" &&
    message.attachment.url
  ) {
    return message.attachment;
  }

  return null;
}

function canForwardMessage(message: ChatRenderableMessage) {
  return message.type !== "sticker";
}

async function forwardMessageToConversation(input: {
  baseUrl?: string;
  conversation: ConversationListItem;
  message: ChatRenderableMessage;
}) {
  if (isPersistedGroupConversation(input.conversation)) {
    const payload = buildGroupForwardPayload(input.message);
    if (!payload) {
      throw new Error("当前消息暂不支持转发到群聊。");
    }

    await sendGroupMessage(input.conversation.id, payload, input.baseUrl);
    return;
  }

  const payload = buildDirectForwardPayload(input.conversation, input.message);
  if (!payload) {
    throw new Error("这条单聊暂时没有可用的角色目标，无法完成转发。");
  }

  joinConversationRoom({ conversationId: input.conversation.id });
  emitChatMessage(payload);
}

function buildGroupForwardPayload(
  message: ChatRenderableMessage,
): SendGroupMessageRequest | null {
  const text = getForwardMessageText(message);

  if (message.type === "image" && message.attachment?.kind === "image") {
    return {
      type: "image",
      text,
      attachment: message.attachment,
    };
  }

  if (message.type === "file" && message.attachment?.kind === "file") {
    return {
      type: "file",
      text,
      attachment: message.attachment,
    };
  }

  if (
    message.type === "contact_card" &&
    message.attachment?.kind === "contact_card"
  ) {
    return {
      type: "contact_card",
      text,
      attachment: message.attachment,
    };
  }

  if (
    message.type === "location_card" &&
    message.attachment?.kind === "location_card"
  ) {
    return {
      type: "location_card",
      text,
      attachment: message.attachment,
    };
  }

  if (message.type === "sticker") {
    return null;
  }

  return {
    text: text ?? buildClipboardText(message),
  };
}

function buildDirectForwardPayload(
  conversation: ConversationListItem,
  message: ChatRenderableMessage,
): SendMessagePayload | null {
  const characterId = conversation.participants[0];
  if (!characterId) {
    return null;
  }

  const text = getForwardMessageText(message);

  if (message.type === "image" && message.attachment?.kind === "image") {
    return {
      conversationId: conversation.id,
      characterId,
      type: "image",
      text,
      attachment: message.attachment,
    };
  }

  if (message.type === "file" && message.attachment?.kind === "file") {
    return {
      conversationId: conversation.id,
      characterId,
      type: "file",
      text,
      attachment: message.attachment,
    };
  }

  if (
    message.type === "contact_card" &&
    message.attachment?.kind === "contact_card"
  ) {
    return {
      conversationId: conversation.id,
      characterId,
      type: "contact_card",
      text,
      attachment: message.attachment,
    };
  }

  if (
    message.type === "location_card" &&
    message.attachment?.kind === "location_card"
  ) {
    return {
      conversationId: conversation.id,
      characterId,
      type: "location_card",
      text,
      attachment: message.attachment,
    };
  }

  if (message.type === "sticker") {
    return null;
  }

  return {
    conversationId: conversation.id,
    characterId,
    text: text ?? buildClipboardText(message),
  };
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

function openUrlInNewWindow(url: string, features?: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.open(url, "_blank", features));
}

function openPrintWindow(input: { title: string; imageUrl: string }) {
  if (typeof window === "undefined") {
    return false;
  }

  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) {
    return false;
  }

  const escapedTitle = escapeHtml(input.title);
  const escapedImageUrl = escapeHtml(input.imageUrl);
  printWindow.document.write(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #0f172a;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      img {
        max-width: 100%;
        max-height: calc(100vh - 48px);
        object-fit: contain;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
      }
    </style>
  </head>
  <body>
    <img src="${escapedImageUrl}" alt="${escapedTitle}" />
  </body>
</html>`);
  printWindow.document.close();

  const printedImage = printWindow.document.querySelector(
    "img",
  ) as HTMLImageElement | null;
  if (printedImage) {
    printedImage.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  } else {
    printWindow.focus();
    printWindow.print();
  }

  return true;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTextWithMentions(text: string): ReactNode {
  const segments = splitChatTextSegments(text);
  if (!segments.length) {
    return text;
  }

  return segments.map((segment, index) => {
    if (segment.kind === "text") {
      return <span key={`text-${index}`}>{segment.text}</span>;
    }

    return (
      <span
        key={`mention-${index}-${segment.text}`}
        className={
          segment.tone === "all"
            ? "rounded-[8px] bg-[rgba(249,115,22,0.14)] px-1 py-0.5 text-[#c2410c]"
            : "rounded-[8px] bg-[rgba(59,130,246,0.12)] px-1 py-0.5 text-[#2563eb]"
        }
      >
        {segment.text}
      </span>
    );
  });
}

function ReplyQuoteCard({
  messageId,
  senderName,
  previewText,
  align,
  variant,
  onJump,
  disabled = false,
}: {
  messageId: string;
  senderName: string;
  previewText: string;
  align: "left" | "right";
  variant: "mobile" | "desktop";
  onJump: (messageId: string) => void;
  disabled?: boolean;
}) {
  const isDesktop = variant === "desktop";
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) {
          onJump(messageId);
        }
      }}
      className={`mb-2 w-full overflow-hidden rounded-[14px] border px-3 py-2 ${
        align === "right"
          ? isDesktop
            ? "border-[rgba(160,90,10,0.14)] bg-[rgba(255,244,227,0.92)] text-[color:var(--text-primary)]"
            : "border-[rgba(22,163,74,0.16)] bg-[rgba(255,255,255,0.72)] text-[color:var(--text-primary)]"
          : "border-black/6 bg-[rgba(248,248,248,0.96)] text-[color:var(--text-primary)]"
      } text-left transition ${disabled ? "cursor-default opacity-90" : "hover:opacity-90"}`}
    >
      <div className="truncate text-[11px] font-medium text-[color:var(--text-secondary)]">
        回复 {senderName}
      </div>
      <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[color:var(--text-muted)]">
        {renderTextWithMentions(previewText)}
      </div>
    </button>
  );
}

function ImageMessage({
  url,
  label,
  maxSize,
  onOpen,
}: {
  url: string;
  label: string;
  maxSize: number;
  onOpen?: () => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  if (loadFailed) {
    return (
      <div className="flex h-28 w-28 items-center justify-center rounded-[22px] border border-white/80 bg-white/90 px-3 text-center text-xs text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]">
        {label || "[图片]"}
      </div>
    );
  }

  const image = (
    <img
      src={url}
      alt={label}
      onError={() => setLoadFailed(true)}
      className="rounded-[18px] border border-black/5 bg-white object-cover shadow-none"
      style={{ maxWidth: `${maxSize}px`, maxHeight: `${maxSize}px` }}
      loading="lazy"
    />
  );

  if (!onOpen) {
    return image;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="transition hover:opacity-95"
      aria-label={`查看图片 ${label}`}
    >
      {image}
    </button>
  );
}

function SelectionToggle({
  checked,
  onClick,
}: {
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition ${
        checked
          ? "border-[rgba(7,193,96,0.22)] bg-[#07c160] text-white shadow-[0_8px_18px_rgba(7,193,96,0.20)]"
          : "border-black/10 bg-white text-transparent hover:border-[rgba(7,193,96,0.28)]"
      }`}
      aria-label={checked ? "取消选择消息" : "选择消息"}
    >
      ✓
    </button>
  );
}

function ContactCardMessage({
  attachment,
}: {
  attachment: Extract<MessageAttachment, { kind: "contact_card" }>;
}) {
  return (
    <div className="w-[220px] rounded-[18px] border border-black/5 bg-white p-3 shadow-none">
      <div className="flex items-center gap-3">
        <AvatarChip
          name={attachment.name}
          src={attachment.avatar}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {attachment.name}
          </div>
          <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
            {attachment.relationship || "世界联系人"}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        <ContactRound size={12} />
        <span>角色名片</span>
      </div>
    </div>
  );
}

function FileAttachmentMessage({
  attachment,
}: {
  attachment: Extract<MessageAttachment, { kind: "file" }>;
}) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="block w-[220px] rounded-[18px] border border-black/5 bg-white p-3 shadow-none transition-colors hover:bg-[#fafafa]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,rgba(196,181,253,0.25),rgba(129,140,248,0.2))] text-[color:var(--brand-primary)]">
          <FileText size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {attachment.fileName}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {formatFileSize(attachment.size)}
          </div>
        </div>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        文件
      </div>
    </a>
  );
}

function LocationCardMessage({
  attachment,
}: {
  attachment: Extract<MessageAttachment, { kind: "location_card" }>;
}) {
  return (
    <div className="w-[220px] rounded-[18px] border border-black/5 bg-white p-3 shadow-none">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        <MapPin size={12} />
        <span>位置</span>
      </div>
      <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
        {attachment.title}
      </div>
      {attachment.subtitle ? (
        <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
          {attachment.subtitle}
        </div>
      ) : null}
    </div>
  );
}

function StickerMessage({
  url,
  label,
  maxSize,
}: {
  url: string;
  label: string;
  maxSize: number;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  if (loadFailed) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded-[22px] border border-white/80 bg-white/90 px-3 text-center text-xs text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]">
        {label || "[表情包]"}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={label}
      onError={() => setLoadFailed(true)}
      className="rounded-[18px] bg-white/70 object-contain shadow-none"
      style={{ maxWidth: `${maxSize}px`, maxHeight: `${maxSize}px` }}
      loading="lazy"
    />
  );
}

function ImageViewerOverlay({
  variant,
  activeImage,
  activeIndex,
  total,
  onClose,
  onPrevious,
  onNext,
  onLocate,
  onSave,
  onOpenInWindow,
  onPrint,
}: {
  variant: "mobile" | "desktop";
  activeImage: {
    id: string;
    url: string;
    label: string;
    fileName?: string;
  };
  activeIndex: number;
  total: number;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onLocate: () => void;
  onSave: () => void;
  onOpenInWindow?: () => void;
  onPrint?: () => void;
}) {
  const isDesktop = variant === "desktop";
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDeltaXRef = useRef(0);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchDeltaXRef.current = 0;
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const start = touchStartRef.current;
    if (!touch || !start) {
      return;
    }

    touchDeltaXRef.current = touch.clientX - start.x;
  };

  const handleTouchEnd = () => {
    const deltaX = touchDeltaXRef.current;
    const threshold = 48;

    if (deltaX <= -threshold && onNext) {
      onNext();
    } else if (deltaX >= threshold && onPrevious) {
      onPrevious();
    }

    touchStartRef.current = null;
    touchDeltaXRef.current = 0;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.86)] backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label="关闭图片查看器"
      />

      {isDesktop ? (
        <>
          <div className="absolute inset-x-0 top-5 z-10 flex items-start justify-between gap-4 px-8 text-white">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {activeImage.fileName || activeImage.label}
              </div>
              <div className="mt-1 text-xs text-white/70">
                {activeIndex + 1} / {total}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onOpenInWindow ? (
                <ViewerActionButton label="新窗口打开" onClick={onOpenInWindow}>
                  <ExternalLink size={16} />
                </ViewerActionButton>
              ) : null}
              {onPrint ? (
                <ViewerActionButton label="打印图片" onClick={onPrint}>
                  <Printer size={16} />
                </ViewerActionButton>
              ) : null}
              <ViewerActionButton label="保存图片" onClick={onSave}>
                <Download size={16} />
              </ViewerActionButton>
              <ViewerActionButton label="定位到聊天位置" onClick={onLocate}>
                <LocateFixed size={16} />
              </ViewerActionButton>
              <ViewerActionButton label="关闭图片查看器" onClick={onClose}>
                <X size={16} />
              </ViewerActionButton>
            </div>
          </div>

          {onPrevious ? (
            <ViewerNavButton
              side="left"
              label="上一张图片"
              onClick={onPrevious}
            >
              <ChevronLeft size={22} />
            </ViewerNavButton>
          ) : null}
          {onNext ? (
            <ViewerNavButton side="right" label="下一张图片" onClick={onNext}>
              <ChevronRight size={22} />
            </ViewerNavButton>
          ) : null}
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-10 flex items-start justify-between gap-3 px-3 text-white">
            <ViewerActionButton
              compact
              label="关闭图片查看器"
              onClick={onClose}
            >
              <X size={16} />
            </ViewerActionButton>
            <div className="min-w-0 flex-1 pt-1 text-center">
              <div className="truncate text-sm font-medium">
                {activeImage.fileName || activeImage.label}
              </div>
              <div className="mt-1 text-xs text-white/70">
                {activeIndex + 1} / {total}
              </div>
            </div>
            <ViewerActionButton compact label="保存图片" onClick={onSave}>
              <Download size={16} />
            </ViewerActionButton>
          </div>

          {total > 1 ? (
            <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] z-10 px-6 text-center text-xs text-white/70">
              左右滑动切换图片
            </div>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/10 bg-[rgba(15,23,42,0.58)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 backdrop-blur-xl">
            <div className="flex items-center justify-center gap-3">
              <ViewerActionButton
                compact
                label="定位到聊天位置"
                onClick={onLocate}
              >
                <LocateFixed size={16} />
              </ViewerActionButton>
              {onPrevious ? (
                <ViewerActionButton
                  compact
                  label="上一张图片"
                  onClick={onPrevious}
                >
                  <ChevronLeft size={18} />
                </ViewerActionButton>
              ) : null}
              {onNext ? (
                <ViewerActionButton compact label="下一张图片" onClick={onNext}>
                  <ChevronRight size={18} />
                </ViewerActionButton>
              ) : null}
            </div>
          </div>
        </>
      )}

      <div
        className={`absolute inset-0 flex items-center justify-center ${
          isDesktop
            ? "px-24 pb-10 pt-24"
            : "px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.75rem)] pt-24"
        }`}
        onTouchStart={isDesktop ? undefined : handleTouchStart}
        onTouchMove={isDesktop ? undefined : handleTouchMove}
        onTouchEnd={isDesktop ? undefined : handleTouchEnd}
      >
        <img
          src={activeImage.url}
          alt={activeImage.label}
          className={`max-h-full max-w-full object-contain shadow-[0_32px_80px_rgba(0,0,0,0.34)] ${
            isDesktop ? "rounded-[20px]" : "rounded-[14px]"
          }`}
        />
      </div>
    </div>
  );
}

function ViewerActionButton({
  children,
  compact = false,
  label,
  onClick,
}: {
  children: ReactNode;
  compact?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className={`flex items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/16 ${
        compact ? "h-10 w-10 justify-center" : "h-10 gap-2 px-4 text-sm"
      }`}
      aria-label={label}
      title={label}
    >
      {children}
      {!compact ? <span>{label}</span> : null}
    </button>
  );
}

function ViewerNavButton({
  children,
  compact = false,
  label,
  onClick,
  side,
}: {
  children: ReactNode;
  compact?: boolean;
  label: string;
  onClick: () => void;
  side: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/16 ${
        compact ? "h-10 w-10" : "h-12 w-12"
      } ${
        side === "left"
          ? compact
            ? "left-3"
            : "left-8"
          : compact
            ? "right-3"
            : "right-8"
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${size} B`;
}
