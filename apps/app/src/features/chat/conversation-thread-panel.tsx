import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Phone, Users, Video } from "lucide-react";
import { type StickerAttachment } from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { ChatComposer } from "../../components/chat-composer";
import {
  ChatMessageList,
  type ChatRenderableMessage,
} from "../../components/chat-message-list";
import {
  encodeChatReplyText,
  sanitizeDisplayedChatText,
  type ChatReplyMetadata,
} from "../../lib/chat-text";
import {
  DesktopChatHeaderActions,
  type DesktopChatCallKind,
  type DesktopChatSidePanelMode,
} from "./chat-header-actions";
import { DesktopDirectCallPanel } from "./direct-call-panel-shell";
import { type DesktopChatCallAction } from "../desktop/chat/desktop-chat-route-state";
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
import { ReminderTaskPanel } from "./reminder-task-panel";
import { findFirstUnreadMessageId } from "./chat-unread-marker";
import { useConversationBackground } from "./backgrounds/use-conversation-background";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useConversationThread } from "./use-conversation-thread";
import { useDigitalHumanEntryGuard } from "./use-digital-human-entry-guard";
import { useThreadEntryScrollToBottom } from "./use-thread-entry-scroll-to-bottom";
import { REMINDER_CHARACTER_ID } from "@yinjie/contracts";
import {
  buildMobileChatRouteHash,
  parseMobileChatRouteState,
} from "./mobile-chat-route-state";

type ConversationThreadPanelProps = {
  conversationId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
  desktopSidePanelMode?: DesktopChatSidePanelMode;
  desktopHeaderActionsRef?: Ref<HTMLDivElement>;
  onToggleDesktopHistory?: () => void;
  onToggleDesktopDetails?: () => void;
  onDesktopCallAction?: (kind: DesktopChatCallKind) => void;
  desktopCallRequest?: {
    kind: DesktopChatCallAction;
    token: number;
  } | null;
  onDesktopCallRequestHandled?: (token: number) => void;
  highlightedMessageId?: string;
  buildMessageReturnTo?: (messageId: string) => string | undefined;
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
  desktopHeaderActionsRef,
  onToggleDesktopHistory,
  onToggleDesktopDetails,
  onDesktopCallAction,
  desktopCallRequest = null,
  onDesktopCallRequestHandled,
  highlightedMessageId,
  buildMessageReturnTo,
  routeContextNotice,
  routeMobileShortcutAction = null,
  onRouteMobileShortcutHandled,
}: ConversationThreadPanelProps) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const currentMobileRouteHash = useMemo(
    () => buildMobileChatRouteHash(parseMobileChatRouteState(hash)),
    [hash],
  );
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
    unreadSnapshotReady,
    hasOlderMessages,
    loadingAnchorWindow,
    loadingOlderMessages,
    loadAnchorWindow,
    loadOlderMessages,
    messagesQuery,
    participants,
    renderedMessages,
    scrollAnchor,
    sendMutation,
    sendAttachmentMessage,
    sendStickerMessage,
    sendTextMessage,
    retryMessage,
    setSocketError,
    setText,
    socketError,
    text,
    typingState,
  } = useConversationThread(conversationId);
  const runtimeConfig = useAppRuntimeConfig();
  const backgroundQuery = useConversationBackground(conversationId);
  const isDesktop = variant === "desktop";
  const renderStatusBackAction = () =>
    !isDesktop && onBack ? (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
        onClick={onBack}
      >
        返回上一页
      </Button>
    ) : null;
  const renderStatusRetryAction = () =>
    !isDesktop ? (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
        onClick={() => {
          void messagesQuery.refetch();
        }}
      >
        重试读取
      </Button>
    ) : null;
  const renderStatusActions = () =>
    !isDesktop ? (
      <div className="flex flex-wrap justify-center gap-2">
        {renderStatusRetryAction()}
        {renderStatusBackAction()}
      </div>
    ) : null;
  const highlightedWindowRequestRef = useRef<string | null>(null);
  const handledDesktopCallRequestTokenRef = useRef<number | null>(null);
  const { entryNotice, clearEntryNotice, guardVideoEntry, resetEntryGuard } =
    useDigitalHumanEntryGuard({
      baseUrl,
      enabled: conversationType === "direct",
    });
  const {
    ref: scrollAnchorRef,
    isAtBottom,
    pendingCount,
    scrollToBottom,
  } = scrollAnchor;
  const effectiveBackground = backgroundQuery.data?.effectiveBackground ?? null;
  const isReminderConversation =
    conversationType === "direct" && participants[0] === REMINDER_CHARACTER_ID;
  const subtitle =
    conversationType === "group"
      ? `${participants.length || 0} 人群聊`
      : typingState?.stage === "image_generation"
        ? "对方正在生成图片..."
        : typingState
          ? "对方正在回复..."
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
  const replyPreview = replyDraft
    ? {
        senderName: replyDraft.senderName,
        text: replyDraft.quotedText?.trim() || replyDraft.previewText,
        modeLabel: replyDraft.quotedText ? "部分引用" : undefined,
      }
    : null;

  useThreadEntryScrollToBottom({
    threadKey: conversationId,
    ready: !messagesQuery.isLoading && unreadSnapshotReady,
    disabled: Boolean(highlightedMessageId),
    containerRef: scrollAnchorRef,
  });

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
    highlightedWindowRequestRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    if (
      !highlightedMessageId ||
      hasHighlightedMessage ||
      loadingOlderMessages ||
      loadingAnchorWindow
    ) {
      return;
    }

    if (highlightedWindowRequestRef.current === highlightedMessageId) {
      if (hasOlderMessages) {
        void loadOlderMessages();
      }
      return;
    }

    highlightedWindowRequestRef.current = highlightedMessageId;
    void loadAnchorWindow(highlightedMessageId).then((found) => {
      if (found || !hasOlderMessages) {
        return;
      }

      void loadOlderMessages();
    });
  }, [
    hasHighlightedMessage,
    hasOlderMessages,
    highlightedMessageId,
    loadAnchorWindow,
    loadOlderMessages,
    loadingAnchorWindow,
    loadingOlderMessages,
  ]);

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
      ...(currentMobileRouteHash ? { hash: currentMobileRouteHash } : {}),
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

  useEffect(() => {
    if (!isDesktop || !desktopCallRequest) {
      return;
    }

    if (handledDesktopCallRequestTokenRef.current === desktopCallRequest.token) {
      return;
    }

    handledDesktopCallRequestTokenRef.current = desktopCallRequest.token;
    handleDesktopCallAction(desktopCallRequest.kind);
    onDesktopCallRequestHandled?.(desktopCallRequest.token);
  }, [
    desktopCallRequest,
    handleDesktopCallAction,
    isDesktop,
    onDesktopCallRequestHandled,
  ]);

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDesktop ? "bg-[rgba(245,247,247,0.96)]" : "bg-[#ededed]"
      }`}
    >
      {isDesktop ? (
        <header className="relative z-20 flex items-center gap-3 border-b border-[rgba(0,0,0,0.06)] bg-white px-6 py-3">
          <div className="min-w-0 flex-1 px-1 py-1">
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
              containerRef={desktopHeaderActionsRef}
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
              ...(currentMobileRouteHash
                ? { hash: currentMobileRouteHash }
                : {}),
            });
          }}
        />
      )}

      {routeContextNotice ? (
        <div
          className={
            isDesktop
              ? "border-b border-[color:var(--border-faint)] bg-[rgba(249,251,250,0.92)] px-6 py-3"
              : "border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-2.5 py-1"
          }
        >
          <InlineNotice
            tone="info"
            className={
              isDesktop
                ? "border-[color:var(--border-faint)] bg-white"
                : "rounded-[12px] border-[rgba(7,193,96,0.14)] bg-[rgba(247,251,248,0.98)] px-2.5 py-1.5 text-[#166534] shadow-none"
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span
                className={`min-w-0 flex-1 ${
                  isDesktop
                    ? "text-xs leading-6 text-[color:var(--text-secondary)]"
                    : "text-[10px] leading-4 text-[#166534]"
                }`}
              >
                {routeContextNotice.description}
              </span>
              <div className="flex items-center justify-end gap-1.5">
                {routeContextNotice.secondaryActionLabel &&
                routeContextNotice.onSecondaryAction ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={routeContextNotice.onSecondaryAction}
                    className={
                      isDesktop
                        ? "shrink-0 rounded-full"
                        : "h-7 shrink-0 rounded-full px-2.5 text-[10px]"
                    }
                  >
                    {routeContextNotice.secondaryActionLabel}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={routeContextNotice.onAction}
                  className={
                    isDesktop
                      ? "shrink-0 rounded-full"
                      : "h-7 shrink-0 rounded-full px-2.5 text-[10px]"
                  }
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
              : "border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-2.5 py-1"
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
            compact={!isDesktop}
          />
        </div>
      ) : null}

      <div
        className={`relative flex-1 overflow-hidden ${
          isDesktop ? "bg-[#e9e9e9]" : "bg-[color:var(--bg-canvas)]"
        }`}
      >
        <div
          className={`absolute inset-0 ${
            isDesktop ? "bg-[#e9e9e9]" : "bg-[color:var(--bg-canvas)]"
          }`}
          style={buildChatBackgroundStyle(effectiveBackground)}
        />
        <div
          className={`absolute inset-0 ${
            isDesktop
              ? "bg-[rgba(245,245,245,0.64)]"
              : "bg-[rgba(239,243,244,0.74)]"
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
                : "relative flex h-full flex-col overflow-auto px-3 py-3.5"
            }
            onScrollCapture={handleDismissRouteContextNotice}
          >
            {messagesQuery.isLoading ? (
              isDesktop ? (
                <LoadingBlock label="正在读取会话..." />
              ) : (
                <MobileThreadStatusCard
                  badge="读取中"
                  title="正在读取会话"
                  description="稍等一下，正在同步这段聊天里的消息。"
                  tone="loading"
                />
              )
            ) : null}
            {messagesQuery.isError && messagesQuery.error instanceof Error ? (
              isDesktop ? (
                <ErrorBlock message={messagesQuery.error.message} />
              ) : (
                <MobileThreadStatusCard
                  badge="会话"
                  title="会话暂时不可用"
                  description={messagesQuery.error.message}
                  tone="danger"
                  action={renderStatusActions()}
                />
              )
            ) : null}
            {socketError ? (
              isDesktop ? (
                <ErrorBlock message={socketError} />
              ) : (
                <InlineNotice
                  tone="danger"
                  className="rounded-[14px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1">{socketError}</span>
                    {renderStatusBackAction()}
                  </div>
                </InlineNotice>
              )
            ) : null}
            {sendMutation.isError && sendMutation.error instanceof Error ? (
              isDesktop ? (
                <ErrorBlock message={sendMutation.error.message} />
              ) : (
                <InlineNotice
                  tone="danger"
                  className="rounded-[14px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1">
                      {sendMutation.error.message}
                    </span>
                    {renderStatusBackAction()}
                  </div>
                </InlineNotice>
              )
            ) : null}

            <ChatMessageList
              messages={renderedMessages}
              threadContext={{
                id: conversationId,
                type: "direct",
                title: conversationTitle,
              }}
              buildMessageReturnTo={buildMessageReturnTo}
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
              onRetryMessage={(message) => retryMessage(message.id)}
              onOpenDirectCallInvite={(input) => {
                handleDesktopCallAction(input.kind);
              }}
              onSelectionModeChange={setSelectionModeActive}
              errorActionLabel={!isDesktop && onBack ? "返回上一页" : undefined}
              onErrorAction={!isDesktop && onBack ? onBack : null}
              emptyState={
                !isDesktop &&
                !messagesQuery.isLoading &&
                !messagesQuery.isError ? (
                  <MobileThreadStatusCard
                    badge="聊天"
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
          <div className="pointer-events-none absolute right-2.5 bottom-3 z-10">
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
        <>
          {isReminderConversation ? (
            <ReminderTaskPanel
              conversationId={conversationId}
              variant={isDesktop ? "desktop" : "mobile"}
            />
          ) : null}
          <ChatComposer
            value={text}
            placeholder={
              isReminderConversation
                ? "直接说：明早8点提醒我吃药"
                : "输入消息"
            }
            variant={isDesktop ? "desktop" : "mobile"}
            pending={sendMutation.isPending}
            error={
              sendMutation.error instanceof Error
                ? sendMutation.error.message
                : null
            }
            errorActionLabel={!isDesktop && onBack ? "返回上一页" : undefined}
            onErrorAction={!isDesktop && onBack ? onBack : null}
            speechInput={{
              baseUrl,
              conversationId,
              characterId: participants[0],
              enabled: runtimeConfig.appPlatform !== "desktop",
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
            mobileShortcutRequest={mobileShortcutRequest}
            onMobileShortcutHandled={() => {
              setMobileShortcutRequest(null);
            }}
            onStartVoiceCall={() => {
              void navigate({
                to: "/chat/$conversationId/voice-call",
                params: { conversationId },
                ...(currentMobileRouteHash
                  ? { hash: currentMobileRouteHash }
                  : {}),
              });
            }}
            onStartVideoCall={() => {
              void navigate({
                to: "/chat/$conversationId/video-call",
                params: { conversationId },
                ...(currentMobileRouteHash
                  ? { hash: currentMobileRouteHash }
                  : {}),
              });
            }}
            replyPreview={replyPreview}
            onCancelReply={() => setReplyDraft(null)}
            onSubmit={() => void handleSubmit()}
          />
        </>
      ) : null}
    </div>
  );
}

function MobileThreadStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
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

  if (message.type === "note_card") {
    return "[笔记]";
  }

  if (message.type === "sticker") {
    return "[表情]";
  }

  return "消息";
}
