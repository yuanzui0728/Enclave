import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ContactRound,
  FileText,
  LocateFixed,
  MapPin,
  X,
} from "lucide-react";
import { type MessageAttachment } from "@yinjie/contracts";
import { InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { GroupMessageContextMenu } from "../features/chat/group-message-context-menu";
import { MobileMessageActionSheet } from "../features/chat/mobile-message-action-sheet";
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
import { formatMessageTimestamp, parseTimestamp } from "../lib/format";

export type ChatRenderableMessage = {
  id: string;
  senderType: string;
  senderName?: string | null;
  type?: string | null;
  text: string;
  attachment?: MessageAttachment;
  createdAt: string;
};

type ChatMessageListProps = {
  messages: ChatRenderableMessage[];
  groupMode?: boolean;
  showGroupMemberNicknames?: boolean;
  variant?: "mobile" | "desktop";
  highlightedMessageId?: string;
  emptyState?: React.ReactNode;
  onReplyMessage?: (message: ChatRenderableMessage) => void;
};

export function ChatMessageList({
  messages,
  groupMode = false,
  showGroupMemberNicknames = true,
  variant = "mobile",
  highlightedMessageId,
  emptyState,
  onReplyMessage,
}: ChatMessageListProps) {
  const isDesktop = variant === "desktop";
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
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const contextMenuEnabled = isDesktop;
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);

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
    if (!isDesktop) {
      setFavoriteSourceIds([]);
      return;
    }

    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, [isDesktop]);

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
    if (isDesktop || event.pointerType === "mouse") {
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewerMessageId(null);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        openImageByIndex(Math.max(activeImageIndex - 1, 0));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        openImageByIndex(
          Math.min(activeImageIndex + 1, imageMessages.length - 1),
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeImage, activeImageIndex, imageMessages, isDesktop]);

  if (!messages.length) {
    return emptyState ?? null;
  }

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
    const attachment = getOpenableAttachment(message);
    if (!attachment) {
      return;
    }

    window.open(attachment.url, "_blank", "noopener,noreferrer");
    setActionNotice({
      message: attachment.kind === "image" ? "已打开图片。" : "已打开文件。",
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

  return (
    <div className={isDesktop ? "space-y-5" : "space-y-4"}>
      {actionNotice ? (
        <InlineNotice className="text-xs" tone={actionNotice.tone}>
          {actionNotice.message}
        </InlineNotice>
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
                <span className="inline-flex rounded-full bg-[rgba(0,0,0,0.08)] px-3 py-1 text-[11px] text-[#7d7d7d]">
                  {formatMessageTimestamp(message.createdAt)}
                </span>
              </div>
            ) : null}
            <div
              id={`chat-message-${message.id}`}
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
                  : ""
              }`}
            >
              <div
                className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
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
                      onOpen={() => setViewerMessageId(message.id)}
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
        />
      ) : null}
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

function getOpenableAttachment(message: ChatRenderableMessage) {
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
}: {
  messageId: string;
  senderName: string;
  previewText: string;
  align: "left" | "right";
  variant: "mobile" | "desktop";
  onJump: (messageId: string) => void;
}) {
  const isDesktop = variant === "desktop";
  return (
    <button
      type="button"
      onClick={() => onJump(messageId)}
      className={`mb-2 w-full overflow-hidden rounded-[14px] border px-3 py-2 ${
        align === "right"
          ? isDesktop
            ? "border-[rgba(160,90,10,0.14)] bg-[rgba(255,244,227,0.92)] text-[color:var(--text-primary)]"
            : "border-[rgba(22,163,74,0.16)] bg-[rgba(255,255,255,0.72)] text-[color:var(--text-primary)]"
          : "border-black/6 bg-[rgba(248,248,248,0.96)] text-[color:var(--text-primary)]"
      } text-left transition hover:opacity-90`}
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
}) {
  const isDesktop = variant === "desktop";

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.86)] backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label="关闭图片查看器"
      />

      <div
        className={`absolute inset-x-0 z-10 flex items-start justify-between gap-4 px-4 text-white ${
          isDesktop
            ? "top-5 px-8"
            : "top-[calc(env(safe-area-inset-top,0px)+0.75rem)]"
        }`}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {activeImage.fileName || activeImage.label}
          </div>
          <div className="mt-1 text-xs text-white/70">
            {activeIndex + 1} / {total}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ViewerActionButton
            compact={!isDesktop}
            label="定位到聊天位置"
            onClick={onLocate}
          >
            <LocateFixed size={16} />
          </ViewerActionButton>
          <ViewerActionButton
            compact={!isDesktop}
            label="关闭图片查看器"
            onClick={onClose}
          >
            <X size={16} />
          </ViewerActionButton>
        </div>
      </div>

      {onPrevious ? (
        <ViewerNavButton
          compact={!isDesktop}
          side="left"
          label="上一张图片"
          onClick={onPrevious}
        >
          <ChevronLeft size={22} />
        </ViewerNavButton>
      ) : null}
      {onNext ? (
        <ViewerNavButton
          compact={!isDesktop}
          side="right"
          label="下一张图片"
          onClick={onNext}
        >
          <ChevronRight size={22} />
        </ViewerNavButton>
      ) : null}

      <div
        className={`absolute inset-0 flex items-center justify-center ${
          isDesktop ? "px-24 pb-10 pt-24" : "px-4 pb-8 pt-24"
        }`}
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
