import { useEffect, useState } from "react";
import { ContactRound, FileText, MapPin } from "lucide-react";
import { type MessageAttachment } from "@yinjie/contracts";
import { InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { sanitizeDisplayedChatText } from "../lib/chat-text";
import { formatMessageTimestamp } from "../lib/format";

type ChatRenderableMessage = {
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
  variant?: "mobile" | "desktop";
  highlightedMessageId?: string;
  emptyState?: React.ReactNode;
};

export function ChatMessageList({
  messages,
  groupMode = false,
  variant = "mobile",
  highlightedMessageId,
  emptyState,
}: ChatMessageListProps) {
  const isDesktop = variant === "desktop";
  const [activeHighlightedMessageId, setActiveHighlightedMessageId] = useState<
    string | undefined
  >(highlightedMessageId);

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

  if (!messages.length) {
    return emptyState ?? null;
  }

  return (
    <div className={isDesktop ? "space-y-5" : "space-y-4"}>
      {messages.map((message) => {
        const isUser = message.senderType === "user";
        const isSystem =
          message.type === "system" || message.senderType === "system";
        const isHighlighted = message.id === activeHighlightedMessageId;
        const displayText =
          isUser && !isSystem
            ? message.text
            : sanitizeDisplayedChatText(message.text);

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
          <div
            key={message.id}
            id={`chat-message-${message.id}`}
            className={`space-y-1.5 rounded-[22px] px-2 py-1.5 transition-[background-color,box-shadow] duration-300 ${
              isHighlighted
                ? "bg-[rgba(255,224,120,0.15)] shadow-[0_0_0_1px_rgba(255,191,0,0.16)]"
                : ""
            }`}
          >
            <div className="text-center text-[11px] text-[color:var(--text-dim)]">
              {formatMessageTimestamp(message.createdAt)}
            </div>
            <div
              className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser ? (
                <AvatarChip name={message.senderName} size="wechat" />
              ) : null}
              <div
                className={`flex max-w-[78%] flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                {!isUser && groupMode ? (
                  <div className="mb-1 px-1 text-[11px] text-[color:var(--text-muted)]">
                    {message.senderName}
                  </div>
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
                    }`}
                  >
                    {displayText}
                  </div>
                )}
              </div>
              {isUser ? <AvatarChip name="我" size="wechat" /> : null}
            </div>
          </div>
        );
      })}
    </div>
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
