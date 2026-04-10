import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Phone, Users, Video } from "lucide-react";
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
import { DesktopDirectCallPanel } from "../desktop/chat/desktop-direct-call-panel";
import { buildDesktopMobileCallHandoffHash } from "../desktop/chat/desktop-mobile-call-handoff-route-state";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { ChatCallFallbackNotice } from "./chat-call-fallback-notice";
import { type ChatComposeShortcutAction } from "./chat-compose-shortcut-route";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import { buildDirectCallInviteMessage } from "./group-call-message";
import { MobileChatThreadHeader } from "./mobile-chat-thread-header";
import { MobileChatScrollBottomButton } from "./mobile-chat-scroll-bottom-button";
import {
  buildChatUnreadMarkerDomId,
  findFirstUnreadMessageId,
  hasLoadedReadBoundary,
} from "./chat-unread-marker";
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
  routeMobileShortcutAction?: ChatComposeShortcutAction | null;
  onRouteMobileShortcutHandled?: () => void;
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
  routeMobileShortcutAction = null,
  onRouteMobileShortcutHandled,
}: ConversationThreadPanelProps) {
  const navigate = useNavigate();
  const [replyDraft, setReplyDraft] = useState<ChatReplyMetadata | null>(null);
  const [desktopCallPanelKind, setDesktopCallPanelKind] =
    useState<DesktopChatCallKind | null>(null);
  const [pendingCallFallback, setPendingCallFallback] =
    useState<DesktopChatCallKind | null>(null);
  const [mobileShortcutRequest, setMobileShortcutRequest] = useState<{
    action: ChatComposeShortcutAction;
    nonce: number;
  } | null>(null);
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const {
    baseUrl,
    conversationTitle,
    conversationType,
    initialUnreadCount,
    initialUnreadCutoff,
    hasOlderMessages,
    loadingOlderMessages,
    loadOlderMessages,
    messagesQuery,
    participants,
    renderedMessages,
    scrollAnchor,
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
  const unreadMarkerScrolledRef = useRef(false);
  const {
    ref: scrollAnchorRef,
    isAtBottom,
    pendingCount,
    scrollToBottom,
  } = scrollAnchor;
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
  const unreadMarkerMessageId = useMemo(
    () =>
      findFirstUnreadMessageId(
        renderedMessages,
        initialUnreadCutoff,
        initialUnreadCount > 0,
      ),
    [initialUnreadCount, initialUnreadCutoff, renderedMessages],
  );
  const shouldLoadOlderForUnreadMarker =
    initialUnreadCount > 0 &&
    Boolean(initialUnreadCutoff) &&
    hasOlderMessages &&
    !loadingOlderMessages &&
    !hasLoadedReadBoundary(renderedMessages, initialUnreadCutoff);
  const replyPreview = replyDraft
    ? {
        senderName: replyDraft.senderName,
        text: replyDraft.quotedText?.trim() || replyDraft.previewText,
        modeLabel: replyDraft.quotedText ? "部分引用" : undefined,
      }
    : null;
  const sendCallInviteMutation = useMutation({
    mutationFn: (kind: DesktopChatCallKind) =>
      sendTextMessage(buildDirectCallInviteMessage(kind, conversationTitle)),
    onSuccess: async () => {
      scrollToBottom("smooth");
    },
  });

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
    unreadMarkerScrolledRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (!shouldLoadOlderForUnreadMarker) {
      return;
    }

    void loadOlderMessages();
  }, [loadOlderMessages, shouldLoadOlderForUnreadMarker]);

  useEffect(() => {
    if (
      highlightedMessageId ||
      !unreadMarkerMessageId ||
      unreadMarkerScrolledRef.current
    ) {
      return;
    }

    unreadMarkerScrolledRef.current = true;
    const markerId = buildChatUnreadMarkerDomId({
      id: conversationId,
      type: "direct",
    });

    window.requestAnimationFrame(() => {
      document
        .getElementById(markerId)
        ?.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [conversationId, highlightedMessageId, unreadMarkerMessageId]);

  const handleReplyMessage = (
    message: ChatRenderableMessage,
    options?: {
      quotedText?: string;
    },
  ) => {
    const senderName =
      message.senderType === "user"
        ? "我"
        : message.senderName?.trim() || "对方";
    const quotedText = options?.quotedText?.trim();
    setReplyDraft({
      messageId: message.id,
      senderName,
      previewText: describeReplyPreview(message),
      quotedText: quotedText || undefined,
    });
  };

  const handleSubmit = async () => {
    await sendTextMessage(
      replyDraft ? encodeChatReplyText(text, replyDraft) : undefined,
    );
    scrollToBottom("smooth");
    setReplyDraft(null);
  };

  const handleSendPresetText = async (presetText: string) => {
    await sendTextMessage(
      replyDraft ? encodeChatReplyText(presetText, replyDraft) : presetText,
    );
    scrollToBottom("smooth");
    setReplyDraft(null);
  };

  const handleSendSticker = async (sticker: StickerAttachment) => {
    await sendStickerMessage(
      sticker,
      replyDraft ? encodeChatReplyText("", replyDraft) : undefined,
    );
    scrollToBottom("smooth");
    setReplyDraft(null);
  };

  const handleSendAttachment = async (
    payload: ChatComposerAttachmentPayload,
  ) => {
    await sendAttachmentMessage(
      payload,
      replyDraft ? encodeChatReplyText("", replyDraft) : undefined,
    );
    scrollToBottom("smooth");
    setReplyDraft(null);
  };

  const handleDesktopCallAction = (kind: DesktopChatCallKind) => {
    if (isDesktop) {
      setDesktopCallPanelKind(kind);
      return;
    }

    setPendingCallFallback(kind);
    onDesktopCallAction?.(kind);
  };
  const handleApplyMobileCallFallback = (kind: DesktopChatCallKind) => {
    setMobileShortcutRequest({
      action: kind === "voice" ? "voice-message" : "camera",
      nonce: Date.now(),
    });
    setPendingCallFallback(null);
  };

  useEffect(() => {
    setDesktopCallPanelKind(null);
    setPendingCallFallback(null);
    setMobileShortcutRequest(null);
  }, [conversationId]);

  useEffect(() => {
    if (isDesktop || !routeMobileShortcutAction) {
      return;
    }

    setMobileShortcutRequest({
      action: routeMobileShortcutAction,
      nonce: Date.now(),
    });
    onRouteMobileShortcutHandled?.();
  }, [isDesktop, onRouteMobileShortcutHandled, routeMobileShortcutAction]);

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDesktop ? "bg-[#f5f5f5]" : "bg-[#ededed]"
      }`}
    >
      {isDesktop ? (
        <header className="flex items-center gap-3 border-b border-black/5 bg-[#f3f3f3] px-6 py-3">
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
              onSelectCall={handleDesktopCallAction}
            />
          </div>
        </header>
      ) : (
        <MobileChatThreadHeader
          title={conversationTitle}
          subtitle={subtitle}
          onBack={onBack}
          actions={
            conversationType === "direct"
              ? [
                  {
                    key: "voice-call",
                    icon: Phone,
                    label: "语音通话",
                    onClick: () => handleDesktopCallAction("voice"),
                  },
                  {
                    key: "video-call",
                    icon: Video,
                    label: "视频通话",
                    onClick: () => handleDesktopCallAction("video"),
                  },
                ]
              : undefined
          }
          onMore={() => {
            void navigate({
              to: "/chat/$conversationId/details",
              params: { conversationId },
            });
          }}
        />
      )}

      {pendingCallFallback && !isDesktop ? (
        <div className="border-b border-black/6 bg-white/82 px-3 py-2.5">
          <ChatCallFallbackNotice
            kind={pendingCallFallback}
            description={
              pendingCallFallback === "voice"
                ? "先切到底部按住说话，会更接近当前可用的体验。"
                : "先用拍摄或图片消息继续，把要表达的内容先发出去。"
            }
            primaryLabel={
              pendingCallFallback === "voice" ? "改发语音" : "改为拍摄"
            }
            secondaryLabel="收起"
            onPrimaryAction={() =>
              handleApplyMobileCallFallback(pendingCallFallback)
            }
            onSecondaryAction={() => setPendingCallFallback(null)}
          />
        </div>
      ) : null}

      {routeContextNotice ? (
        <div
          className={
            isDesktop
              ? "border-b border-black/5 bg-[#f7f7f7] px-6 py-3"
              : "border-b border-black/6 bg-white/82 px-3 py-2.5"
          }
        >
          <InlineNotice tone="info" className="border-black/6 bg-white">
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
          isDesktop ? "bg-[#e9e9e9]" : ""
        }`}
      >
        <div
          className={`absolute inset-0 ${
            isDesktop ? "bg-[#e9e9e9]" : "bg-[#ededed]"
          }`}
          style={buildChatBackgroundStyle(effectiveBackground)}
        />
        <div
          className={`absolute inset-0 ${
            isDesktop
              ? "bg-[rgba(245,245,245,0.64)]"
              : "bg-[rgba(237,237,237,0.74)]"
          }`}
        />

        {isDesktop && desktopCallPanelKind ? (
          <div className="relative h-full p-5">
            <DesktopDirectCallPanel
              kind={desktopCallPanelKind}
              conversationTitle={conversationTitle}
              inviteNoticePending={sendCallInviteMutation.isPending}
              onClose={() => setDesktopCallPanelKind(null)}
              onOpenMobileHandoff={() => {
                void navigate({
                  to: "/desktop/mobile",
                  hash: buildDesktopMobileCallHandoffHash({
                    kind: desktopCallPanelKind,
                    conversationId,
                    conversationType:
                      conversationType === "group" ? "group" : "direct",
                    title: conversationTitle,
                  }),
                });
              }}
              onSendInviteNotice={() => {
                void sendCallInviteMutation.mutateAsync(desktopCallPanelKind);
              }}
            />
          </div>
        ) : (
          <div
            ref={scrollAnchorRef}
            className={
              isDesktop
                ? "relative flex h-full flex-col space-y-4 overflow-auto px-7 py-5"
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
            {sendCallInviteMutation.isError &&
            sendCallInviteMutation.error instanceof Error ? (
              <ErrorBlock message={sendCallInviteMutation.error.message} />
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
              hasOlderMessages={hasOlderMessages}
              loadingOlderMessages={loadingOlderMessages}
              onLoadOlderMessages={() => {
                void loadOlderMessages();
              }}
              unreadMarkerMessageId={unreadMarkerMessageId}
              unreadMarkerCount={initialUnreadCount}
              onReplyMessage={handleReplyMessage}
              onOpenDirectCallInvite={(kind) => {
                if (isDesktop) {
                  setDesktopCallPanelKind(kind);
                }
              }}
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
        )}
        {!isDesktop &&
        !selectionModeActive &&
        (!isAtBottom || pendingCount > 0) ? (
          <div className="pointer-events-none absolute bottom-4 right-3 z-10">
            <div className="pointer-events-auto">
              <MobileChatScrollBottomButton
                pendingCount={pendingCount}
                onClick={() => scrollToBottom("smooth")}
              />
            </div>
          </div>
        ) : null}
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
          onSendPresetText={async (presetText) => {
            if (socketError) {
              setSocketError(null);
            }
            await handleSendPresetText(presetText);
          }}
          onOpenDesktopHistory={onToggleDesktopHistory}
          mobileShortcutRequest={mobileShortcutRequest}
          onMobileShortcutHandled={() => {
            setPendingCallFallback(null);
            setMobileShortcutRequest(null);
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

  if (message.type === "voice") {
    return "[语音]";
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
