import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { ChatComposer } from "../../components/chat-composer";
import {
  ChatMessageList,
  type ChatRenderableMessage,
} from "../../components/chat-message-list";
import { EmptyState } from "../../components/empty-state";
import {
  encodeChatReplyText,
  sanitizeDisplayedChatText,
  type ChatReplyMetadata,
} from "../../lib/chat-text";
import {
  DesktopChatHeaderActions,
  type DesktopChatCallKind,
  type DesktopChatSidePanelMode,
} from "../desktop/chat/desktop-chat-header-actions";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import { MobileChatThreadHeader } from "./mobile-chat-thread-header";
import { useConversationBackground } from "./backgrounds/use-conversation-background";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useConversationThread } from "./use-conversation-thread";
import { type StickerAttachment } from "@yinjie/contracts";

type ConversationThreadPanelProps = {
  conversationId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
  desktopSidePanelMode?: DesktopChatSidePanelMode;
  onToggleDesktopHistory?: () => void;
  onToggleDesktopDetails?: () => void;
  onDesktopCallAction?: (kind: DesktopChatCallKind) => void;
  highlightedMessageId?: string;
  routeContextNotice?: ChatRouteContextNotice;
};

export type ChatRouteContextNotice = {
  actionLabel: string;
  description: string;
  onAction: () => void;
};

export function ConversationThreadPanel({
  conversationId,
  variant = "mobile",
  onBack,
  desktopSidePanelMode = null,
  onToggleDesktopHistory,
  onToggleDesktopDetails,
  onDesktopCallAction,
  highlightedMessageId,
  routeContextNotice,
}: ConversationThreadPanelProps) {
  const navigate = useNavigate();
  const [replyDraft, setReplyDraft] = useState<ChatReplyMetadata | null>(null);
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const {
    baseUrl,
    conversationTitle,
    conversationType,
    messagesQuery,
    participants,
    renderedMessages,
    scrollAnchorRef,
    sendMutation,
    sendAttachmentMessage,
    sendStickerMessage,
    sendTextMessage,
    setSocketError,
    setText,
    socketError,
    text,
    typingCharacterId,
  } = useConversationThread(conversationId);
  const runtimeConfig = useAppRuntimeConfig();
  const backgroundQuery = useConversationBackground(conversationId);
  const isDesktop = variant === "desktop";
  const effectiveBackground = backgroundQuery.data?.effectiveBackground ?? null;
  const subtitle =
    conversationType === "group"
      ? `${participants.length || 0} 人群聊`
      : typingCharacterId
        ? "对方正在输入..."
        : undefined;

  const hasHighlightedMessage = renderedMessages.some(
    (message) => message.id === highlightedMessageId,
  );
  const replyPreview = replyDraft
    ? {
        senderName: replyDraft.senderName,
        text: replyDraft.previewText,
      }
    : null;

  useEffect(() => {
    if (!highlightedMessageId || !hasHighlightedMessage) {
      return;
    }

    const target = document.getElementById(
      `chat-message-${highlightedMessageId}`,
    );
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hasHighlightedMessage, highlightedMessageId]);

  useEffect(() => {
    setReplyDraft(null);
    setSelectionModeActive(false);
  }, [conversationId]);

  const handleReplyMessage = (message: ChatRenderableMessage) => {
    const senderName =
      message.senderType === "user"
        ? "我"
        : message.senderName?.trim() || "对方";
    setReplyDraft({
      messageId: message.id,
      senderName,
      previewText: describeReplyPreview(message),
    });
  };

  const handleSubmit = async () => {
    await sendTextMessage(
      replyDraft ? encodeChatReplyText(text, replyDraft) : undefined,
    );
    setReplyDraft(null);
  };

  const handleSendSticker = async (sticker: StickerAttachment) => {
    await sendStickerMessage(
      sticker,
      replyDraft ? encodeChatReplyText("", replyDraft) : undefined,
    );
    setReplyDraft(null);
  };

  const handleSendAttachment = async (
    payload: ChatComposerAttachmentPayload,
  ) => {
    await sendAttachmentMessage(
      payload,
      replyDraft ? encodeChatReplyText("", replyDraft) : undefined,
    );
    setReplyDraft(null);
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDesktop
          ? "bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(255,247,238,0.98))]"
          : "bg-[#ededed]"
      }`}
    >
      {isDesktop ? (
        <header className="flex items-center gap-3 border-b border-black/6 bg-[#f7f7f7] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
              {conversationTitle}
            </div>
            {subtitle ? (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
                {conversationType === "group" ? <Users size={12} /> : null}
                <span>{subtitle}</span>
              </div>
            ) : null}
          </div>

          <div className="hidden items-center xl:flex">
            <DesktopChatHeaderActions
              activePanelMode={desktopSidePanelMode}
              onToggleHistory={() => onToggleDesktopHistory?.()}
              onToggleDetails={() => onToggleDesktopDetails?.()}
              onSelectCall={(kind) => onDesktopCallAction?.(kind)}
            />
          </div>
        </header>
      ) : (
        <MobileChatThreadHeader
          title={conversationTitle}
          subtitle={subtitle}
          onBack={onBack}
          onMore={() => {
            void navigate({
              to: "/chat/$conversationId/details",
              params: { conversationId },
            });
          }}
        />
      )}

      {routeContextNotice ? (
        <div
          className={
            isDesktop
              ? "border-b border-black/6 bg-white/70 px-5 py-3"
              : "border-b border-black/6 bg-white/82 px-3 py-2.5"
          }
        >
          <InlineNotice tone="info" className="border-white/70 bg-white/90">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs leading-6 text-[color:var(--text-secondary)]">
                {routeContextNotice.description}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={routeContextNotice.onAction}
                className="shrink-0 rounded-full"
              >
                {routeContextNotice.actionLabel}
              </Button>
            </div>
          </InlineNotice>
        </div>
      ) : null}

      <div
        className={`relative flex-1 overflow-hidden ${
          isDesktop
            ? "bg-[linear-gradient(180deg,rgba(255,252,246,0.94),rgba(255,248,240,0.96))]"
            : ""
        }`}
      >
        <div
          className={`absolute inset-0 ${
            isDesktop
              ? "bg-[linear-gradient(180deg,rgba(255,252,246,0.94),rgba(255,248,240,0.96))]"
              : "bg-[#ededed]"
          }`}
          style={buildChatBackgroundStyle(effectiveBackground)}
        />
        <div
          className={`absolute inset-0 ${
            isDesktop
              ? "bg-[rgba(255,249,242,0.36)]"
              : "bg-[rgba(237,237,237,0.74)]"
          }`}
        />

        <div
          ref={scrollAnchorRef}
          className={
            isDesktop
              ? "relative flex h-full flex-col space-y-4 overflow-auto px-8 py-6"
              : "relative flex h-full flex-col overflow-auto px-3 py-4"
          }
        >
          {messagesQuery.isLoading ? (
            <LoadingBlock label="正在读取会话..." />
          ) : null}
          {messagesQuery.isError && messagesQuery.error instanceof Error ? (
            <ErrorBlock message={messagesQuery.error.message} />
          ) : null}
          {socketError ? <ErrorBlock message={socketError} /> : null}
          {sendMutation.isError && sendMutation.error instanceof Error ? (
            <ErrorBlock message={sendMutation.error.message} />
          ) : null}

          <ChatMessageList
            messages={renderedMessages}
            threadContext={{
              id: conversationId,
              type: "direct",
              title: conversationTitle,
            }}
            groupMode={conversationType === "group"}
            variant={isDesktop ? "desktop" : "mobile"}
            highlightedMessageId={highlightedMessageId}
            onReplyMessage={handleReplyMessage}
            onSelectionModeChange={setSelectionModeActive}
            emptyState={
              !isDesktop &&
              !messagesQuery.isLoading &&
              !messagesQuery.isError ? (
                <EmptyState
                  title="还没有消息"
                  description="先发一句开场白，把这段对话真正聊起来。"
                />
              ) : null
            }
          />
        </div>
      </div>

      {!selectionModeActive ? (
        <ChatComposer
          value={text}
          placeholder="输入消息"
          variant={isDesktop ? "desktop" : "mobile"}
          pending={sendMutation.isPending}
          error={
            sendMutation.error instanceof Error
              ? sendMutation.error.message
              : null
          }
          speechInput={{
            baseUrl,
            conversationId,
            enabled: runtimeConfig.appPlatform === "web",
          }}
          onChange={(value) => {
            if (socketError) {
              setSocketError(null);
            }
            setText(value);
          }}
          onSendSticker={async (sticker) => {
            if (socketError) {
              setSocketError(null);
            }
            await handleSendSticker(sticker);
          }}
          onSendAttachment={async (payload) => {
            if (socketError) {
              setSocketError(null);
            }
            await handleSendAttachment(payload);
          }}
          replyPreview={replyPreview}
          onCancelReply={() => setReplyDraft(null)}
          onSubmit={() => void handleSubmit()}
        />
      ) : null}
    </div>
  );
}

function describeReplyPreview(message: ChatRenderableMessage) {
  const text = sanitizeDisplayedChatText(message.text);
  if (text) {
    return text;
  }

  if (message.type === "image") {
    return "[图片]";
  }

  if (message.type === "file") {
    return "[文件]";
  }

  if (message.type === "contact_card") {
    return "[名片]";
  }

  if (message.type === "location_card") {
    return "[位置]";
  }

  if (message.type === "sticker") {
    return "[表情]";
  }

  return "消息";
}
