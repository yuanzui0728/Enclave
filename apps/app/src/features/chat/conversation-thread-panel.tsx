import { Link, useNavigate } from "@tanstack/react-router";
import { Ellipsis, Phone, Search, Users, Video } from "lucide-react";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { ChatComposer } from "../../components/chat-composer";
import { ChatMessageList } from "../../components/chat-message-list";
import { EmptyState } from "../../components/empty-state";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { MobileChatThreadHeader } from "./mobile-chat-thread-header";
import { useConversationBackground } from "./backgrounds/use-conversation-background";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useConversationThread } from "./use-conversation-thread";

type ConversationThreadPanelProps = {
  conversationId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
  inspectorOpen?: boolean;
  onToggleInspector?: () => void;
};

export function ConversationThreadPanel({
  conversationId,
  variant = "mobile",
  onBack,
  inspectorOpen = false,
  onToggleInspector,
}: ConversationThreadPanelProps) {
  const navigate = useNavigate();
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
        : "连接顺畅";

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDesktop
          ? "bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(255,247,238,0.98))]"
          : "bg-[linear-gradient(180deg,#fffdf7,#fff9ee)]"
      }`}
    >
      {isDesktop ? (
        <header className="flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,254,249,0.96),rgba(255,248,239,0.96))] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
              {conversationTitle}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
              {conversationType === "group" ? <Users size={12} /> : null}
              <span>{subtitle}</span>
            </div>
          </div>

          <div className="hidden items-center gap-1.5 xl:flex">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]"
              aria-label="搜索"
            >
              <Search size={16} />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]"
              aria-label="语音通话"
            >
              <Phone size={16} />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]"
              aria-label="视频通话"
            >
              <Video size={16} />
            </button>
            <Link
              to="/tabs/contacts"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]"
              aria-label="通讯录"
            >
              <Users size={16} />
            </Link>
            <button
              type="button"
              onClick={onToggleInspector}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition ${
                inspectorOpen
                  ? "bg-[color:var(--surface-soft)] text-[color:var(--brand-primary)]"
                  : "hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]"
              }`}
              aria-label="更多"
            >
              <Ellipsis size={16} />
            </button>
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
              : "bg-[linear-gradient(180deg,#fffdf7,#fff9ee)]"
          }`}
          style={buildChatBackgroundStyle(effectiveBackground)}
        />
        <div
          className={`absolute inset-0 ${
            isDesktop
              ? "bg-[rgba(255,249,242,0.36)]"
              : "bg-[rgba(255,250,244,0.30)]"
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
            groupMode={conversationType === "group"}
            variant={isDesktop ? "desktop" : "mobile"}
            emptyState={
              !messagesQuery.isLoading && !messagesQuery.isError ? (
                <EmptyState
                  title="还没有消息"
                  description="先发一句开场白，把这段对话真正聊起来。"
                />
              ) : null
            }
          />

          {typingCharacterId && !isDesktop ? (
            <InlineNotice
              tone="muted"
              className="mt-3 border-white/70 bg-white/82 text-[color:var(--text-muted)]"
            >
              对方正在输入...
            </InlineNotice>
          ) : null}
        </div>
      </div>

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
          await sendStickerMessage(sticker);
        }}
        onSendAttachment={async (payload) => {
          if (socketError) {
            setSocketError(null);
          }
          await sendAttachmentMessage(payload);
        }}
        onSubmit={() => void sendTextMessage()}
      />
    </div>
  );
}
