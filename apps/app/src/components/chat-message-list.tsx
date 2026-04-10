import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { ContactRound, FileText, MapPin } from "lucide-react";
import { type MessageAttachment } from "@yinjie/contracts";
import { InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { GroupMessageContextMenu } from "../features/chat/group-message-context-menu";
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
  const contextMenuEnabled = isDesktop && groupMode;

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
  }, [messages]);

  if (!messages.length) {
    return emptyState ?? null;
  }

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
              onContextMenu={(event) => handleMessageContextMenu(event, message)}
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
          onCopySender={() => {
            void copyToClipboard(
              buildClipboardSender(contextMenuState.message),
              "发送者名称已复制。",
            );
            setContextMenuState(null);
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
}: {
  url: string;
  label: string;
  maxSize: number;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  if (loadFailed) {
    return (
      <div className="flex h-28 w-28 items-center justify-center rounded-[22px] border border-white/80 bg-white/90 px-3 text-center text-xs text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]">
        {label || "[图片]"}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={label}
      onError={() => setLoadFailed(true)}
      className="rounded-[18px] border border-black/5 bg-white object-cover shadow-none"
      style={{ maxWidth: `${maxSize}px`, maxHeight: `${maxSize}px` }}
      loading="lazy"
    />
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

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${size} B`;
}
