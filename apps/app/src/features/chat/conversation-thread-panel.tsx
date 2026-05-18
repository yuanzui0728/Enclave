import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { msg } from "@lingui/macro";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Phone, Users, Video } from "lucide-react";
import { type StickerAttachment } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { track } from "@yinjie/analytics";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { ChatComposer } from "../../components/chat-composer";
import { FeatureUnavailableDialog } from "../../components/feature-unavailable-dialog";
import {
  ChatMessageList,
  type ChatRenderableMessage,
} from "../../components/chat-message-list";
import {
  encodeChatReplyText,
  type ChatReplyMetadata,
} from "../../lib/chat-text";
import { resolveMessageSemanticPreview } from "../../lib/message-attachment-semantic";
import {
  DesktopChatHeaderActions,
  type DesktopChatCallKind,
  type DesktopChatSidePanelMode,
} from "./chat-header-actions";
import { DesktopDirectCallPanel } from "./direct-call-panel-shell";
import { type DesktopChatCallAction } from "../desktop/chat/desktop-chat-route-state";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { type ChatComposeShortcutAction } from "./chat-compose-shortcut-route";
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
import { useThreadEntryScrollToBottom } from "./use-thread-entry-scroll-to-bottom";
import { REMINDER_CHARACTER_ID } from "@yinjie/contracts";
import {
  buildMobileChatRouteHash,
  parseMobileChatRouteState,
} from "./mobile-chat-route-state";

const t = translateRuntimeMessage;

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
        {t(msg`返回上一页`)}
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
        {t(msg`重试读取`)}
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
  // 走查新一轮 R5：单聊「发送」按钮 + Enter / Cmd-Enter 快捷键都只靠
  // `disabled={composerPending}` 兜双触发，composerPending = sendMutation.isPending
  // 经 React commit 才进 DOM。同帧连点 / 同帧两次 Enter 都能同时通过 → 两份
  // sendTextMessage 跑下来 onMutate 各自 push 不同 local id 的 optimistic 消息 →
  // emitChatMessage 飞两次 → 对端连收 2 条一模一样的用户消息。和群聊
  // group-chat-thread-panel `sendingTextRef`（commit 56ed67e4）同款修法。
  const sendingTextRef = useRef(false);
  const {
    ref: scrollAnchorRef,
    isAtBottom,
    isAtBottomRef,
    pendingCount,
    scrollToBottom,
  } = scrollAnchor;
  const handleMessageMediaReady = useCallback(() => {
    if (isAtBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [isAtBottomRef, scrollToBottom]);
  const effectiveBackground = backgroundQuery.data?.effectiveBackground ?? null;
  // 走查 R73：buildChatBackgroundStyle 之前直接挂在 JSX style= 上，每次 render
  // 都 new 一个 `{backgroundImage,...}` 对象 → React 比 prop ref 不等 → DOM
  // 触发一次 style 重设（即使值完全一样）。ConversationThreadPanel 在 typing
  // tick / socket / hash change / mention picker 等都 re-render，hot path 上
  // 每分钟数十次无意义 style diff。memo 到 effectiveBackground 引用稳定。
  const backgroundStyle = useMemo(
    () => buildChatBackgroundStyle(effectiveBackground),
    [effectiveBackground],
  );
  const isReminderConversation =
    conversationType === "direct" && participants[0] === REMINDER_CHARACTER_ID;
  const subtitle =
    conversationType === "group"
      ? t(msg`${participants.length} 人群聊`)
      : typingState?.stage === "image_generation"
        ? t(msg`对方正在生成图片...`)
        : typingState
          ? t(msg`对方正在回复...`)
          : undefined;

  // 走查电脑端单聊新一轮 R1：原版无 highlightedMessageId 时也 .some 全表扫
  // renderedMessages 找 `m.id === undefined`，全程必然 false 但走完整条 O(n)。
  // 长聊 200+ 条历史叠 typing tick / socket / state 一改就 re-render，每帧
  // 200 次字符串比较纯白用功。绝大多数会话进来没有 highlight（只在「查找
  // 聊天记录」/ 「消息提醒」点结果跳转时才有 highlightedMessageId），常驻
  // 短路成 false，让下游 useEffect 的 hasHighlightedMessage dep 也稳住 false
  // 引用避免无意义重跑。
  const hasHighlightedMessage = highlightedMessageId
    ? renderedMessages.some(
        (message) => message.id === highlightedMessageId,
      )
    : false;
  const unreadMarkerMessageId = useMemo(
    () =>
      findFirstUnreadMessageId(
        renderedMessages,
        initialUnreadCutoff,
        initialUnreadCount > 0,
      ),
    [initialUnreadCount, initialUnreadCutoff, renderedMessages],
  );
  // 走查 R2：原版直接在 JSX 里 `[participants[0]]`，每次 render 都 new 一个数组 →
  // MobileChatPlusPanel 里 useMemo(excludeIdSet) 的 dep 跟着每帧失效 → 每帧
  // new Set + filter 66 个好友。这条 useMemo 把数组引用稳定下来。
  const contactPickerExcludeIds = useMemo<readonly string[] | undefined>(
    () => (participants[0] ? [participants[0]] : undefined),
    [participants],
  );
  // 走查新一轮 R1：原版直接在 JSX 里 `threadContext={{ id, type, title }}` 每次
  // render 都 new 一个对象 → ChatMessageList 内 imageMessages useMemo（line 1768）
  // 把 threadContext 整对象作 dep，每个父帧失效 → 每帧 filter(visibleMessages)
  // 找出所有图片消息再 map 一遍，长聊滚到 100+ 条历史里有 30 张图时这层 O(n)
  // 每个 typing tick / 任何 state 变化都白跑一次；standaloneViewerItems 跟着
  // 重算。和 contactPickerExcludeIds R2 同款修法，把引用稳定下来。
  const messageListThreadContext = useMemo(
    () => ({
      id: conversationId,
      type: "direct" as const,
      title: conversationTitle,
    }),
    [conversationId, conversationTitle],
  );
  const replyPreview = replyDraft
    ? {
        senderName: replyDraft.senderName,
        text: replyDraft.quotedText?.trim() || replyDraft.previewText,
        modeLabel: replyDraft.quotedText ? t(msg`部分引用`) : undefined,
      }
    : null;

  // 走查 R9：mobile 单聊主路径之前没有任何 aria-live 区域，TalkBack / VoiceOver
  // 用户开着这个聊天页时 AI 回复来了听不到——只能主动把焦点重新移到列表才能发现
  // 新内容。同 actionNotice (chat-message-list aria-live) 的语义，给"对端新消息"
  // 加一条 polite 公告，仅广播 mount 之后到达的真消息（不要把进入聊天时既有的
  // 历史一次性念出来）。短描述用 resolveMessageSemanticPreview 拿 30 字以内的
  // 摘要 + sender 称呼，避免长消息读半天。
  const characterIncomingAnnouncerSeenIdRef = useRef<string | null>(null);
  const characterIncomingAnnouncerMountedRef = useRef(false);
  const [characterIncomingAnnouncement, setCharacterIncomingAnnouncement] =
    useState("");

  useEffect(() => {
    characterIncomingAnnouncerMountedRef.current = false;
    characterIncomingAnnouncerSeenIdRef.current = null;
    setCharacterIncomingAnnouncement("");
  }, [conversationId]);

  useEffect(() => {
    // 走查 R10：原版 [...renderedMessages].reverse().find(...) 每次 effect 跑
    // 都拷贝 + 反转一个 200 条数组。renderedMessages 在 socket tick / typing
    // tick / setQueriesData 都会换引用 → effect 跑得很勤；用 .findLast 走原
    // 数组从尾到头，无额外分配。Node 20+ / 所有现代浏览器自 2022 起原生支持。
    let latestCharacterMessage: ChatRenderableMessage | undefined;
    for (let i = renderedMessages.length - 1; i >= 0; i -= 1) {
      const candidate = renderedMessages[i];
      if (candidate?.senderType === "character") {
        latestCharacterMessage = candidate;
        break;
      }
    }
    if (!latestCharacterMessage) {
      // 把"基线 id"标稳：下一条真的 AI 回复才会触发 announcer。
      characterIncomingAnnouncerMountedRef.current = true;
      return;
    }
    if (!characterIncomingAnnouncerMountedRef.current) {
      characterIncomingAnnouncerMountedRef.current = true;
      characterIncomingAnnouncerSeenIdRef.current = latestCharacterMessage.id;
      return;
    }
    if (
      characterIncomingAnnouncerSeenIdRef.current === latestCharacterMessage.id
    ) {
      return;
    }
    characterIncomingAnnouncerSeenIdRef.current = latestCharacterMessage.id;
    const senderName =
      latestCharacterMessage.senderName?.trim() ||
      conversationTitle ||
      t(msg`对方`);
    // 走查 R10：resolveMessageSemanticPreview 的 maxChars 只截 attachment 分支
    // (lib/message-attachment-semantic.ts:20-23 文本分支直接返回 sanitized text
    // 不截)。多段 AI 长回复全文塞给 SR 会被念几分钟 → 在外层手动截断。60
    // 字以内的纯文本足够让 SR 用户判断"谁发了什么"再决定要不要展开。
    const rawPreview =
      resolveMessageSemanticPreview(latestCharacterMessage, {
        maxChars: 60,
        bracketedFallback: true,
      }) || t(msg`新消息`);
    const ANNOUNCEMENT_MAX_CHARS = 60;
    const preview =
      rawPreview.length > ANNOUNCEMENT_MAX_CHARS
        ? `${rawPreview.slice(0, ANNOUNCEMENT_MAX_CHARS).trim()}…`
        : rawPreview;
    setCharacterIncomingAnnouncement(t(msg`${senderName}：${preview}`));
  }, [conversationId, conversationTitle, renderedMessages]);

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
        ? t(msg`我`)
        : message.senderName?.trim() || t(msg`对方`);
    const quotedText = options?.quotedText?.trim();
    setReplyDraft({
      messageId: message.id,
      senderName,
      previewText: describeReplyPreview(message),
      quotedText: quotedText || undefined,
    });
  };

  const handleSubmit = async () => {
    // onSubmit prop 上挂的是 `() => void handleSubmit()` 形态的 fire-and-forget。
    // sendTextMessage 在 resolveTargetCharacterId 拿不到 char id（角色被删/
    // participants 还没回 + conversationId 不是 direct_ 前缀）会同步 throw
    // "目标角色还没准备好"——这条 throw 发生在 runSendMutation 之前，外层吞
    // mutation error 的 try/catch 兜不到，rejection 一路冒到 window.unhandled
    // rejection 污染 telemetry。
    if (sendingTextRef.current) {
      return;
    }
    if (!text.trim()) {
      return;
    }
    sendingTextRef.current = true;
    const submittedTextLength = text.length;
    try {
      try {
        await sendTextMessage(
          replyDraft ? encodeChatReplyText(text, replyDraft) : undefined,
          // 走查 R1：明确告诉 use-conversation-thread 这次是「用户从 composer
          // 真按了发送」，可以把 composer 清掉。preset / 通话邀请 / 附件等
          // 走同一个 mutation 但 overrideText 用法不一样，那些路径不传这个
          // flag → 用户在 composer 里没发完的草稿不会被秒清。
          { clearComposerDraft: true },
        );
      } catch (sendError) {
        setSocketError(
          sendError instanceof Error
            ? sendError.message
            : t(msg`发送失败，请稍后再试。`),
        );
        return;
      }
      track("chat_message_sent", {
        conversationKind: "direct",
        kind: "text",
        hasReply: Boolean(replyDraft),
        textLength: submittedTextLength,
      });
      scrollToBottom("smooth");
      setReplyDraft(null);
    } finally {
      sendingTextRef.current = false;
    }
  };

  const handleSendPresetText = async (presetText: string) => {
    await sendTextMessage(
      replyDraft ? encodeChatReplyText(presetText, replyDraft) : presetText,
    );
    track("chat_message_sent", {
      conversationKind: "direct",
      kind: "preset",
      hasReply: Boolean(replyDraft),
    });
    scrollToBottom("smooth");
    setReplyDraft(null);
  };

  const handleSendSticker = async (sticker: StickerAttachment) => {
    await sendStickerMessage(
      sticker,
      replyDraft ? encodeChatReplyText("", replyDraft) : undefined,
    );
    track("chat_message_sent", {
      conversationKind: "direct",
      kind: "sticker",
      hasReply: Boolean(replyDraft),
    });
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
    track("chat_message_sent", {
      conversationKind: "direct",
      kind: "attachment",
      attachmentType: payload?.type ?? null,
      hasReply: Boolean(replyDraft),
    });
    scrollToBottom("smooth");
    setReplyDraft(null);
  };

  // 走查新会话 R1：mobile 单聊「拨打通话」有两条入口——
  //   1) MobileChatThreadHeader 顶部「语音通话/视频通话」icon → 走 startDirectCall，
  //      header 内部有 actionFiredRef 守住同帧双击。
  //   2) ChatComposer 的 + 面板 (MobileChatPlusPanel) 里的 voice-call/video-call
  //      tile → 通过 onStartVoiceCall/onStartVideoCall props 传进来，原版直接
  //      inline `void navigate({...})`，没挂 disabled / 没同步 ref 守。
  // 入口 2 同帧 <16ms 双击就 push 2 条相同 history 项，用户从 call 屏返回还要
  // 按 2 次返回才能回到聊天。把 onStartVoiceCall/onStartVideoCall 改成统一走
  // startDirectCall，再给 startDirectCall（mobile 路径）补 sync ref 锁；header
  // 路径不动（header 的 guardAction 已经兜了），多一层无副作用。
  const startDirectCallFiredRef = useRef(false);
  const startDirectCall = (kind: DesktopChatCallKind) => {
    if (isDesktop) {
      setDesktopCallPanelState({
        kind,
        source: "desktop",
      });
      return;
    }

    if (startDirectCallFiredRef.current) {
      return;
    }
    startDirectCallFiredRef.current = true;
    void navigate({
      to:
        kind === "voice"
          ? "/chat/$conversationId/voice-call"
          : "/chat/$conversationId/video-call",
      params: { conversationId },
      ...(currentMobileRouteHash ? { hash: currentMobileRouteHash } : {}),
    });
    onDesktopCallAction?.(kind);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        startDirectCallFiredRef.current = false;
      });
    }
  };

  const [callUnavailableKind, setCallUnavailableKind] =
    useState<DesktopChatCallKind | null>(null);
  // 必须 useCallback：下方 useEffect deps 用了它，不固化每次 render 都换引用 →
  // effect 每个 render 都跑一遍（token guard 是兜底，不是节流）。
  const handleDesktopCallAction = useCallback(
    (kind: DesktopChatCallKind) => {
      setCallUnavailableKind(kind);
    },
    [],
  );

  // 容器挂载后 useScrollAnchor 的 useLayoutEffect 会同步把 scrollTop 顶
  // 到 scrollHeight（首次加载消息时一定会跑），scroll 事件就跟着触发
  // onScrollCapture。如果不区分是不是用户手势，notice 在 callReturn /
  // game-invite / group-invite 场景刚显示就被 mount 自身的 auto-scroll
  // 干掉，用户根本没机会看到。isAtBottomRef.current 在 mount auto-scroll
  // 内被 scrollToBottom 同步写 true，stays true 直到用户真手势把列表拖出
  // 贴底窗口 → 此时再 dismiss 才是用户意图。
  const handleScrollDismissRouteContextNotice = () => {
    if (scrollAnchor.isAtBottomRef.current) {
      return;
    }
    routeContextNotice?.onDismiss?.();
  };
  // 上一版本把 scroll-guard 一起套到 composer onChange 上 —— 用户在贴底状态
  // 下打字时 isAtBottomRef === true，typing 也走不到 onDismiss。打字属于
  // 明确的用户意图（"我要继续聊"），照常 dismiss，不走 guard。
  const handleTypingDismissRouteContextNotice = () => {
    routeContextNotice?.onDismiss?.();
  };

  useEffect(() => {
    setDesktopCallPanelState(null);
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
        <header className="relative z-20 flex min-h-[64px] items-center gap-3 border-b border-[rgba(0,0,0,0.06)] bg-white px-6 py-3">
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
                    label: t(msg`语音通话`),
                    onClick: () => startDirectCall("voice"),
                  },
                  {
                    key: "video-call",
                    icon: Video,
                    label: t(msg`视频通话`),
                    onClick: () => startDirectCall("video"),
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
      {/* 走查 R9：屏幕阅读器（VoiceOver / TalkBack）对端新消息的播报通道。
          visually-hidden 但 aria-live="polite" 让 SR 在 idle 时朗读最新一条 AI
          回复的"角色名：内容摘要"。aria-atomic 防止 SR 只念差量（替换 vs 追加） */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none sr-only"
      >
        {characterIncomingAnnouncement}
      </div>
      <div
        className={`relative flex-1 overflow-hidden ${
          isDesktop ? "bg-[#e9e9e9]" : "bg-[color:var(--bg-canvas)]"
        }`}
      >
        <div
          className={`absolute inset-0 ${
            isDesktop ? "bg-[#e9e9e9]" : "bg-[color:var(--bg-canvas)]"
          }`}
          style={backgroundStyle}
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
                : // overscroll-contain：web 移动端 iOS Safari 在聊天滚动到顶/
                  // 底继续拖时不再把滚动冒泡给外层 mobile-shell viewport pane，
                  // 避免误触发"页面整体下拽 / 顶部导航条收放"的浏览器手势。
                  "relative flex h-full flex-col overflow-auto overscroll-contain px-3 py-3.5"
            }
            onScrollCapture={handleScrollDismissRouteContextNotice}
          >
            {messagesQuery.isLoading ? (
              isDesktop ? (
                <LoadingBlock label={t(msg`正在读取会话...`)} />
              ) : (
                <MobileThreadStatusCard
                  badge={t(msg`读取中`)}
                  title={t(msg`正在读取会话`)}
                  description={t(msg`稍等一下，正在同步这段聊天里的消息。`)}
                  tone="loading"
                />
              )
            ) : null}
            {messagesQuery.isError && messagesQuery.error instanceof Error ? (
              isDesktop ? (
                // R51：单聊核心消息流 messagesQuery 失败时，desktop 用裸
                // <ErrorBlock>（mobile 用 MobileThreadStatusCard 自带语义）。
                // 失败路径常见于公网隧道断 / cloud-api OOM / world child
                // 重启时，盲人 SR 完全没反馈，会在空白聊天里一直按上下箭头
                // 找消息。挂 role="alert"。
                <ErrorBlock role="alert" message={messagesQuery.error.message} />
              ) : (
                <MobileThreadStatusCard
                  badge={t(msg`会话`)}
                  title={t(msg`会话暂时不可用`)}
                  description={messagesQuery.error.message}
                  tone="danger"
                  action={renderStatusActions()}
                />
              )
            ) : null}
            {socketError ? (
              isDesktop ? (
                // R51 续：socketError 是 WS 断连 / cloud-api gateway 401 /
                // session 失效的兜底文案。SR 必须立刻知道（"socket-disconnected"
                // 来不及播报，用户已经在敲下一条）。挂 role="alert"。
                <ErrorBlock role="alert" message={socketError} />
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
            {/* sendMutation.error 由 ChatComposer 的 error prop（→ MobileComposerStatusRail
                / desktopComposerStatus）渲染在 composer 上方紧贴输入框那一栏，
                这里再叠一张同样文案、同样 tone="danger" 的 InlineNotice 在消息列表
                顶部纯属重复——同一个错误用户会同时在屏幕两端看到，且消息列表那张
                没有「重试发送」按钮，反而像个孤立的错误条。删掉，composer 内置的
                那个能跟着输入框走、还能挂"返回上一页"action。 */}

            <ChatMessageList
              messages={renderedMessages}
              threadContext={messageListThreadContext}
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
                // mobile 有真实的 /voice-call & /video-call 路由；之前一刀切
                // 走 handleDesktopCallAction 让移动端用户点"通话开始/结束"卡片
                // 也吃到桌面端那张"功能开发中"对话框，明明能拨却报开发中。
                if (isDesktop) {
                  handleDesktopCallAction(input.kind);
                  return;
                }
                startDirectCall(input.kind);
              }}
              onSelectionModeChange={setSelectionModeActive}
              errorActionLabel={
                !isDesktop && onBack ? t(msg`返回上一页`) : undefined
              }
              onErrorAction={!isDesktop && onBack ? onBack : null}
              onMediaReady={handleMessageMediaReady}
              emptyState={
                !isDesktop &&
                !messagesQuery.isLoading &&
                !messagesQuery.isError ? (
                  <MobileThreadStatusCard
                    badge={t(msg`聊天`)}
                    title={t(msg`还没有消息`)}
                    description={t(msg`先发一句开场白，把这段对话真正聊起来。`)}
                  />
                ) : null
              }
            />
          </div>
        )}
        {!selectionModeActive && (!isAtBottom || pendingCount > 0) ? (
          <div
            className={`pointer-events-none absolute z-10 ${
              isDesktop ? "right-5 bottom-5" : "right-2.5 bottom-3"
            }`}
          >
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
              key={`${conversationId}:reminder-panel-v2`}
              conversationId={conversationId}
              variant={isDesktop ? "desktop" : "mobile"}
            />
          ) : null}
          <ChatComposer
            value={text}
            placeholder={
              isReminderConversation
                ? t(msg`直接说：明早8点提醒我吃药`)
                : t(msg`输入消息`)
            }
            variant={isDesktop ? "desktop" : "mobile"}
            pending={sendMutation.isPending}
            error={
              sendMutation.error instanceof Error
                ? sendMutation.error.message
                : null
            }
            errorActionLabel={!isDesktop && onBack ? t(msg`返回上一页`) : undefined}
            onErrorAction={!isDesktop && onBack ? onBack : null}
            speechInput={{
              baseUrl,
              conversationId,
              characterId: participants[0],
              enabled: runtimeConfig.appPlatform !== "desktop",
            }}
            onChange={(value) => {
              handleTypingDismissRouteContextNotice();
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
            onStartVoiceCall={() => startDirectCall("voice")}
            onStartVideoCall={() => startDirectCall("video")}
            contactPickerExcludeIds={contactPickerExcludeIds}
            replyPreview={replyPreview}
            onCancelReply={() => setReplyDraft(null)}
            onSubmit={() => void handleSubmit()}
          />
        </>
      ) : null}

      <FeatureUnavailableDialog
        open={callUnavailableKind !== null}
        title={
          callUnavailableKind === "video"
            ? t(msg`视频通话功能开发中`)
            : t(msg`语音通话功能开发中`)
        }
        description={t(msg`该功能暂未开放，敬请期待。`)}
        onClose={() => setCallUnavailableKind(null)}
      />
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
  return (
    resolveMessageSemanticPreview(message, {
      maxChars: 120,
      bracketedFallback: true,
    }) || t(msg`消息`)
  );
}
