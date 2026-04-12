import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Phone, Users, Video } from "lucide-react";
import { type StickerAttachment } from "@yinjie/contracts";
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
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { type ChatComposeShortcutAction } from "./chat-compose-shortcut-route";
import { DigitalHumanEntryNotice } from "./digital-human-entry-notice";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import {
  buildDirectCallInviteMessage,
  type CallInviteSource,
} from "./group-call-message";
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
import { useDigitalHumanEntryGuard } from "./use-digital-human-entry-guard";

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
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  onDismiss?: () => void;
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
  const [desktopCallPanelState, setDesktopCallPanelState] = useState<{
    kind: DesktopChatCallKind;
    source: CallInviteSource | null;
  } | null>(null);
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
  const { entryNotice, clearEntryNotice, guardVideoEntry, resetEntryGuard } =
    useDigitalHumanEntryGuard({
      baseUrl,
      enabled: conversationType === "direct",
    });
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

  useEffect(() => {
    if (!highlightedMessageId || !hasHighlightedMessage) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const targetSelector = escapeIdSelector(
        `chat-message-${highlightedMessageId}`,
      );
      const target = scrollAnchorRef.current?.querySelector<HTMLElement>(
        `#${targetSelector}`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasHighlightedMessage, highlightedMessageId, scrollAnchorRef]);

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
      !highlightedMessageId ||
      hasHighlightedMessage ||
      loadingOlderMessages ||
      !hasOlderMessages
    ) {
      return;
    }

    void loadOlderMessages();
  }, [
    hasHighlightedMessage,
    hasOlderMessages,
    highlightedMessageId,
    loadOlderMessages,
    loadingOlderMessages,
  ]);

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
      const markerSelector = escapeIdSelector(markerId);
      scrollAnchorRef.current
        ?.querySelector<HTMLElement>(`#${markerSelector}`)
        ?.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [conversationId, highlightedMessageId, scrollAnchorRef, unreadMarkerMessageId]);

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

  const startDirectCall = (kind: DesktopChatCallKind) => {
    if (isDesktop) {
      setDesktopCallPanelState({
        kind,
        source: "desktop",
      });
      return;
    }

    void navigate({
      to:
        kind === "voice"
          ? "/chat/$conversationId/voice-call"
          : "/chat/$conversationId/video-call",
      params: { conversationId },
    });
    onDesktopCallAction?.(kind);
  };

  const handleDesktopCallAction = (kind: DesktopChatCallKind) => {
    if (kind === "video" && !guardVideoEntry()) {
      return;
    }

    clearEntryNotice();
    startDirectCall(kind);
  };

  const handleDismissRouteContextNotice = () => {
    routeContextNotice?.onDismiss?.();
  };

  useEffect(() => {
    setDesktopCallPanelState(null);
    setMobileShortcutRequest(null);
    resetEntryGuard();
  }, [conversationId, resetEntryGuard]);

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
        isDesktop ? "bg-[rgba(245,247,247,0.96)]" : "bg-[#ededed]"
      }`}
    >
      {isDesktop ? (
        <header className="flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-white/74 px-6 py-3 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => onToggleDesktopDetails?.()}
            className="min-w-0 flex-1 rounded-[10px] px-1 py-1 text-left transition hover:bg-[color:var(--surface-console)]"
            aria-label="打开聊天信息"
            title="打开聊天信息"
          >
            <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
              {conversationTitle}
            </div>
            {subtitle ? (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
                {conversationType === "group" ? <Users size={12} /> : null}
                <span>{subtitle}</span>
              </div>
            ) : null}
          </button>

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

      {routeContextNotice ? (
        <div
          className={
            isDesktop
              ? "border-b border-[color:var(--border-faint)] bg-[rgba(249,251,250,0.92)] px-6 py-3"
              : "border-b border-[color:var(--border-faint)] bg-[rgba(249,251,250,0.92)] px-3 py-2.5"
          }
        >
          <InlineNotice
            tone="info"
            className="border-[color:var(--border-faint)] bg-white"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 flex-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                {routeContextNotice.description}
              </span>
              <div className="flex items-center justify-end gap-1.5">
                {routeContextNotice.secondaryActionLabel &&
                routeContextNotice.onSecondaryAction ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={routeContextNotice.onSecondaryAction}
                    className="shrink-0 rounded-full"
                  >
                    {routeContextNotice.secondaryActionLabel}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={routeContextNotice.onAction}
                  className="shrink-0 rounded-full"
                >
                  {routeContextNotice.actionLabel}
                </Button>
              </div>
            </div>
          </InlineNotice>
        </div>
      ) : null}
      {entryNotice ? (
        <div
          className={
            isDesktop
              ? "border-b border-[color:var(--border-faint)] bg-[rgba(249,251,250,0.92)] px-6 py-3"
              : "border-b border-[color:var(--border-faint)] bg-[rgba(249,251,250,0.92)] px-3 py-2.5"
          }
        >
          <DigitalHumanEntryNotice
            tone={entryNotice.tone}
            message={entryNotice.message}
            continueLabel={entryNotice.continueLabel}
            onDismiss={() => {
              resetEntryGuard();
            }}
            voiceLabel={entryNotice.voiceLabel}
            onContinue={() => {
              resetEntryGuard();
              startDirectCall("video");
            }}
            onSwitchToVoice={() => {
              resetEntryGuard();
              startDirectCall("voice");
            }}
          />
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

        {isDesktop && desktopCallPanelState ? (
          <div className="relative h-full p-5">
            <DesktopDirectCallPanel
              kind={desktopCallPanelState.kind}
              conversationId={conversationId}
              characterId={participants[0]}
              conversationTitle={conversationTitle}
              onClose={() => setDesktopCallPanelState(null)}
              onPanelOpened={async () => {
                await sendTextMessage(
                  buildDirectCallInviteMessage(
                    desktopCallPanelState.kind,
                    conversationTitle,
                    {
                      status: "waiting",
                      source: desktopCallPanelState.source ?? "desktop",
                    },
                  ),
                );
                scrollToBottom("smooth");
              }}
              onSessionConnected={async (result) => {
                await sendTextMessage(
                  buildDirectCallInviteMessage(
                    desktopCallPanelState.kind,
                    conversationTitle,
                    {
                      status: "connected",
                      durationMs: result.totalDurationMs,
                      source: desktopCallPanelState.source ?? "desktop",
                    },
                  ),
                );
                scrollToBottom("smooth");
              }}
              onEndCall={async () => {
                await sendTextMessage(
                  buildDirectCallInviteMessage(
                    desktopCallPanelState.kind,
                    conversationTitle,
                    {
                      status: "ended",
                      source: desktopCallPanelState.source ?? "desktop",
                    },
                  ),
                );
                scrollToBottom("smooth");
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
            onScrollCapture={handleDismissRouteContextNotice}
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
              hasOlderMessages={hasOlderMessages}
              loadingOlderMessages={loadingOlderMessages}
              onLoadOlderMessages={() => {
                void loadOlderMessages();
              }}
              unreadMarkerMessageId={unreadMarkerMessageId}
              unreadMarkerCount={initialUnreadCount}
              onReplyMessage={handleReplyMessage}
              onOpenDirectCallInvite={(input) => {
                handleDesktopCallAction(input.kind);
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
            handleDismissRouteContextNotice();
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
            setMobileShortcutRequest(null);
          }}
          onStartVoiceCall={() => {
            void navigate({
              to: "/chat/$conversationId/voice-call",
              params: { conversationId },
            });
          }}
          onStartVideoCall={() => {
            void navigate({
              to: "/chat/$conversationId/video-call",
              params: { conversationId },
            });
          }}
          replyPreview={replyPreview}
          onCancelReply={() => setReplyDraft(null)}
          onSubmit={() => void handleSubmit()}
        />
      ) : null}
    </div>
  );
}

function escapeIdSelector(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value;
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
