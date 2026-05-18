import {
  Suspense,
  lazy,
  useCallback,
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
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import {
  RotateCcw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Forward,
  LocateFixed,
  MapPin,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Printer,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  ApiRequestError,
  createMessageFavorite,
  createSpeechSynthesis,
  deleteConversationMessage,
  deleteGroupMessage,
  getFavoriteNote,
  getFavorites,
  getConversations,
  getOrCreateConversation,
  markFollowupRecommendationChatStarted,
  markFollowupRecommendationOpened,
  recallConversationMessage,
  recallGroupMessage,
  removeFavorite,
  sendGroupMessage,
  type ConversationListItem,
  type FavoriteNoteDocument,
  type GroupMessage,
  type MessageAttachment,
  type Message,
  type SendGroupMessageRequest,
  type SendMessagePayload,
  uploadCustomSticker,
} from "@yinjie/contracts";
import { getActiveLocale, translateRuntimeMessage, useRuntimeTranslator } from "@yinjie/i18n";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { InlineNoticeActionButton } from "./inline-notice-action-button";
import {
  DETAILED_TIMESTAMP_MODE_STORAGE_KEY,
  DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY,
  hydrateDetailedTimestampModeFromNative,
  readDetailedTimestampModeEnabled,
  writeDetailedTimestampModeEnabled,
} from "../features/chat/detailed-timestamp-mode";
import { GroupMessageContextMenu } from "../features/chat/group-message-context-menu";
import {
  hideLocalChatMessage,
  readLocalChatMessageActionState,
} from "../features/chat/local-chat-message-actions";
import {
  MobileMessageReminderSheet,
  type MobileMessageReminderOption,
} from "../features/chat/mobile-message-reminder-sheet";
import { MessageQuoteSelectionSheet } from "../features/chat/message-quote-selection-sheet";
import { MobileMessageActionSheet } from "../features/chat/mobile-message-action-sheet";
import type {
  DesktopMessageForwardMode,
  DesktopMessageForwardPreviewItem,
} from "../features/chat/message-forward-dialog-shell";
import type { DesktopChatImageViewerSessionItem } from "../features/chat/chat-image-viewer-route-state";
import {
  DESKTOP_FAVORITES_STORAGE_KEY,
  hydrateDesktopFavoritesFromNative,
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import {
  isFavoriteNoteMissingError,
  isSafeFavoriteAssetUrl,
} from "../features/favorites/note-editor-helpers";
import { buildMobileNoteEditorRouteHash } from "../features/notes/mobile-note-editor-route-state";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { buildDesktopChannelsRouteHash } from "../features/channels/channels-route-state";
import { stripToolCallSyntax } from "../features/moments/moment-content";
import { resolveAppMediaUrl } from "../lib/media-url";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import {
  extractChatReplyMetadata,
  isServerRecalledSystemMessage,
  sanitizeDisplayedChatText,
  splitChatTextSegments,
} from "../lib/chat-text";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import {
  formatDesktopMessageTimestamp,
  formatDetailedMessageTimestamp,
  formatMessageTimestamp,
  parseTimestamp,
} from "../lib/format";
import { resolveMessageSemanticPreview } from "../lib/message-attachment-semantic";
import { resolveConfiguredCoreApiBaseUrl } from "../lib/runtime-config";
import { buildPublicShareUrl } from "../lib/share-url";
import { buildYinjieId } from "../lib/yinjie-id";
import { emitChatMessage, joinConversationRoom } from "../lib/socket";
import {
  openAppSettings,
  requestNotificationPermission,
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { openRemoteFile } from "../runtime/open-remote-file";
import { saveRemoteFile } from "../runtime/save-remote-file";
import { revealSavedFile } from "../runtime/reveal-saved-file";
import { getCurrentWindowTargetPath } from "../runtime/desktop-windowing";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";
import { buildChatUnreadMarkerDomId } from "../features/chat/chat-unread-marker";
import { DigitalHumanEntryNotice } from "../features/chat/digital-human-entry-notice";
import { ResultCardBadge } from "../features/chat/result-card-badge";
import { prepareRemoteCustomStickerUpload } from "../features/chat/stickers/prepare-custom-sticker-upload";
import { resolveResultCardFooterActionClassName } from "../features/chat/result-card-footer";
import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";
import {
  resolveDirectCallFooterCopy,
  resolveDirectCallStatusLabel,
} from "../features/chat/direct-call-card";
import {
  formatGroupCallRangeSummary,
  resolveGroupCallCompletionBadge,
  resolveGroupCallFooterCopy,
} from "../features/chat/group-call-card";
import { useMessageReminders } from "../features/chat/use-message-reminders";
import { useDigitalHumanEntryGuard } from "../features/chat/use-digital-human-entry-guard";
import {
  parseDirectCallInviteMessage,
  parseGroupCallInviteMessage,
  type CallInviteSource,
} from "../features/chat/group-call-message";
import {
  buildDirectCallWorkspaceSummaryLines,
  buildGroupCallWorkspaceSummaryLines,
  getGroupCallStatusLabel,
} from "../features/chat/group-call-presentation";
import {
  resolveGroupRelayCompletionBadge,
  resolveGroupRelayCompletionTime,
  resolveGroupRelayCtaCopy,
  resolveGroupRelayPublishRangeLabel,
  resolveGroupRelayPublishStageBadge,
} from "../features/mini-programs/group-relay-card";
import { parseGroupRelaySummaryMessage } from "../features/mini-programs/group-relay-message";
import { type ChatLocalMessageStatus } from "../features/chat/chat-message-delivery";

export type ChatRenderableMessage = {
  id: string;
  senderType: string;
  senderId?: string | null;
  senderName?: string | null;
  senderAvatar?: string | null;
  type?: string | null;
  text: string;
  attachment?: MessageAttachment;
  createdAt: string;
  localStatus?: ChatLocalMessageStatus;
};

type OpenableAttachment =
  | Extract<MessageAttachment, { kind: "image" }>
  | Extract<MessageAttachment, { kind: "file" }>
  | Extract<MessageAttachment, { kind: "contact_card" }>
  | Extract<MessageAttachment, { kind: "location_card" }>
  | Extract<MessageAttachment, { kind: "note_card" }>
  | Extract<MessageAttachment, { kind: "feed_post_card" }>;

type SaveableAttachment =
  | Extract<MessageAttachment, { kind: "image" }>
  | Extract<MessageAttachment, { kind: "file" }>
  | Extract<MessageAttachment, { kind: "contact_card" }>
  | Extract<MessageAttachment, { kind: "location_card" }>;

type ChatMessageListProps = {
  messages: ChatRenderableMessage[];
  threadContext?: {
    id: string;
    type: "direct" | "group";
    title?: string;
  };
  buildMessageReturnTo?: (messageId: string) => string | undefined;
  groupMode?: boolean;
  showGroupMemberNicknames?: boolean;
  variant?: "mobile" | "desktop";
  highlightedMessageId?: string;
  emptyState?: React.ReactNode;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
  unreadMarkerMessageId?: string | null;
  unreadMarkerCount?: number;
  unreadMarkerLabel?: string;
  onReplyMessage?: (
    message: ChatRenderableMessage,
    options?: {
      quotedText?: string;
    },
  ) => void;
  onRetryMessage?: (message: ChatRenderableMessage) => Promise<void> | void;
  onOpenDirectCallInvite?: (input: {
    kind: "voice" | "video";
    source: CallInviteSource | null;
  }) => void;
  onOpenGroupCallInvite?: (input: {
    kind: "voice" | "video";
    source: CallInviteSource | null;
    activeCount: number | null;
    totalCount: number | null;
    recordedAt?: string | null;
    snapshotRecordedAt?: string | null;
  }) => void;
  onSelectionModeChange?: (active: boolean) => void;
  errorActionLabel?: string;
  onErrorAction?: (() => void) | null;
  onMediaReady?: () => void;
};

const DesktopMessageForwardDialog = lazy(async () => {
  const mod = await import(
    "../features/chat/message-forward-dialog-shell"
  );
  return { default: mod.DesktopMessageForwardDialog };
});

const DesktopMessageAvatarPopover = lazy(async () => {
  const mod = await import(
    "../features/chat/message-avatar-popover-shell"
  );
  return { default: mod.DesktopMessageAvatarPopover };
});

async function openDesktopChatImageViewerWindowOnDemand(input: {
  imageUrl: string;
  title: string;
  meta?: string;
  returnTo?: string;
  items?: readonly DesktopChatImageViewerSessionItem[];
  activeId?: string;
  autoPrint?: boolean;
}) {
  const { openDesktopChatImageViewerWindow } = await import(
    "../features/chat/chat-image-viewer-route-state"
  );
  return openDesktopChatImageViewerWindow(input);
}

async function buildDesktopAddFriendRouteHashOnDemand(input: {
  keyword: string;
  characterId?: string;
  openCompose?: boolean;
  recommendationId?: string;
}) {
  const { buildDesktopAddFriendRouteHash } = await import(
    "../features/contacts/add-friend-route-state"
  );
  return buildDesktopAddFriendRouteHash(input);
}

async function buildDesktopNoteWindowRouteHashOnDemand(input: {
  noteId: string;
  returnTo?: string;
}) {
  const [{ buildDesktopNoteWindowRouteHash }, { createDesktopNoteDraft }] =
    await Promise.all([
      import("../features/favorites/note-window-route-state"),
      import("../features/favorites/note-drafts-storage"),
    ]);
  const draft = createDesktopNoteDraft({
    draftId: input.noteId,
    noteId: input.noteId,
  });

  return buildDesktopNoteWindowRouteHash({
    draftId: draft.draftId,
    noteId: input.noteId,
    returnTo: input.returnTo,
  });
}

function SelectionModeActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-1 text-[11px] font-medium transition active:bg-[color:var(--surface-card-hover)] disabled:bg-[color:var(--bg-canvas)] disabled:text-[#b8b8b8] ${
        danger ? "text-[#d74b45]" : "text-[#111827]"
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/92 text-current shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function ChatMessageList({
  messages,
  threadContext,
  buildMessageReturnTo,
  groupMode = false,
  showGroupMemberNicknames = true,
  variant = "mobile",
  highlightedMessageId,
  emptyState,
  hasOlderMessages = false,
  loadingOlderMessages = false,
  onLoadOlderMessages,
  unreadMarkerMessageId = null,
  unreadMarkerCount = 0,
  unreadMarkerLabel,
  onReplyMessage,
  onRetryMessage,
  onOpenDirectCallInvite,
  onOpenGroupCallInvite,
  onSelectionModeChange,
  errorActionLabel,
  onErrorAction = null,
  onMediaReady,
}: ChatMessageListProps) {
  const t = useRuntimeTranslator();
  const isDesktop = variant === "desktop";
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "";
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const nativeDesktopDetailedTimestampMode =
    runtimeConfig.appPlatform === "desktop";
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const { entryNotice, clearEntryNotice, guardVideoEntry, resetEntryGuard } =
    useDigitalHumanEntryGuard({
      baseUrl,
      enabled: threadContext?.type === "direct",
    });
  const [activeHighlightedMessageId, setActiveHighlightedMessageId] = useState<
    string | undefined
  >(highlightedMessageId);
  const [actionNotice, setActionNotice] = useState<{
    message: string;
    tone: "success" | "danger" | "warning";
    actionLabel?: string;
    onAction?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
  } | null>(null);
  const [pendingDirectCallInvite, setPendingDirectCallInvite] = useState<{
    source: CallInviteSource | null;
  } | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    message: ChatRenderableMessage;
    x: number;
    y: number;
  } | null>(null);
  const [mobileActionMessage, setMobileActionMessage] =
    useState<ChatRenderableMessage | null>(null);
  const [reminderTargetMessage, setReminderTargetMessage] =
    useState<ChatRenderableMessage | null>(null);
  const [quoteSelectionMessage, setQuoteSelectionMessage] =
    useState<ChatRenderableMessage | null>(null);
  const [viewerMessageId, setViewerMessageId] = useState<string | null>(null);
  const [locationViewerMessageId, setLocationViewerMessageId] = useState<
    string | null
  >(null);
  const [noteViewerMessageId, setNoteViewerMessageId] = useState<string | null>(
    null,
  );
  const normalizedCurrentHash = useMemo(
    () => (hash.startsWith("#") ? hash.slice(1) : hash) || undefined,
    [hash],
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [selectionAnchorMessageId, setSelectionAnchorMessageId] = useState<
    string | null
  >(null);
  const buildCharacterProfileHash = useCallback(
    ({
      recommendationId,
    }: {
      recommendationId?: string;
    } = {}) =>
      buildCharacterDetailRouteHash({
        recommendationId,
        returnPath: pathname,
        returnHash: normalizedCurrentHash,
      }),
    [normalizedCurrentHash, pathname],
  );
  const [selectionActionPending, setSelectionActionPending] = useState<
    "favorite" | "delete" | "recall" | null
  >(null);
  // 同步防双击锁——下面多选 action bar 上「收藏 / 撤回 / 删除」3 个按钮都
  // 用 `disabled={selectionActionPending !== null}` 兜底，但 selectionActionPending
  // 是 React state，要等 commit 才进 DOM。多选 8 条群消息后双击「删除」 →
  // 两份 handleDeleteSelectedMessages 同时跑 → 同一批 8 个 messageId 各被
  // POST /groups/$id/messages/$mid DELETE 2 遍。第二轮全部 404 server log
  // 飘红，UI 上则跑到 setActionNotice("批量删除失败...") 让用户以为操作没
  // 成功——其实第一轮已经全删了。ref 同步赋值挡掉同帧第二次 click。
  const selectionActionBusyRef = useRef(false);
  // 走查 R3：单条消息「撤回 / 删除」按钮在 context menu / mobile action sheet
  // 上原本只有 setContextMenuState(null) / setMobileActionMessage(null) 关弹
  // 层，但 sheet/menu 关闭是 React state，要等 commit 才生效，同帧第二次
  // click 仍能进 onClick → recallMutation.mutate(message) 飞两份相同 POST。
  // 后端 recallOwnerMessage 第一次把 message senderType 改成 system，第二次
  // 看到 message.senderType !== "user" → 抛 CHAT_REVOKE_OWN_ONLY「只能撤回
  // 自己发送的消息」；deleteMessage 第二次直接 404。两条错误都会被 onError
  // 写进 actionNotice，把"已撤回这条消息"/"已删除这条消息"成功提示覆盖掉，
  // 用户看着像失败但操作其实成功了。按 messageId 上锁，onSettled 解锁，
  // 不同消息互不影响。triggerRecallMessage / triggerDeleteMessage 定义在
  // recallMutation / deleteMutation 之后，避免 closure 时 mutation 还未声明。
  const recallingMessageIdsRef = useRef<Set<string>>(new Set());
  const deletingMessageIdsRef = useRef<Set<string>>(new Set());
  const [forwardMessages, setForwardMessages] = useState<
    ChatRenderableMessage[] | null
  >(null);
  const [desktopAvatarPopover, setDesktopAvatarPopover] = useState<
    | {
        anchorElement: HTMLButtonElement;
        kind: "owner";
      }
    | {
        anchorElement: HTMLButtonElement;
        kind: "character";
        characterId: string;
        senderName: string;
        senderAvatar?: string | null;
      }
    | null
  >(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const speakAudioRef = useRef<HTMLAudioElement | null>(null);
  // 每次发起朗读请求自增，await 回来时和当前值比对 —— 用户中途切到别条
  // 消息（或点了同条停止）时把旧请求的回调彻底作废，避免两条音频抢着播。
  const speakRequestRef = useRef(0);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const contextMenuEnabled = isDesktop && !selectionMode;
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>(
    () => readLocalChatMessageActionState().hiddenMessageIds,
  );
  const [recalledMessageIds, setRecalledMessageIds] = useState<string[]>(
    () => readLocalChatMessageActionState().recalledMessageIds,
  );
  const {
    reminders: messageReminders,
    clearReminder,
    setReminder,
  } = useMessageReminders();
  const [detailedTimestampMode, setDetailedTimestampMode] = useState(() =>
    readDetailedTimestampModeEnabled(),
  );
  const resolveAttachmentUrl = useCallback(
    (url: string) => resolveRuntimeAttachmentUrl(url, baseUrl),
    [baseUrl],
  );

  // mobile 长按消息气泡时 Android WebView 会同时触发系统 selection 工具栏，
  // 跟自家的 MessageActionSheet 重叠。yj-no-callout 关 webkit-user-select
  // 还不够 —— Chromium 在 long-press 触发 selectstart 之后才看 user-select，
  // 必须在 selectstart 阶段就 preventDefault。React 没有 onSelectStart 类型，
  // 这里 mobile 平台用 document-level listener，按 [data-yj-msg-bubble] 命中。
  useEffect(() => {
    if (isDesktop || typeof document === "undefined") {
      return;
    }
    const blockOnBubble = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-yj-msg-bubble='1']")) {
        event.preventDefault();
      }
    };
    document.addEventListener("selectstart", blockOnBubble, true);
    document.addEventListener("contextmenu", blockOnBubble, true);
    return () => {
      document.removeEventListener("selectstart", blockOnBubble, true);
      document.removeEventListener("contextmenu", blockOnBubble, true);
    };
  }, [isDesktop]);

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

    const timer = window.setTimeout(
      () => setActionNotice(null),
      actionNotice.actionLabel ? 5000 : 2200,
    );
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  useEffect(() => {
    setPendingDirectCallInvite(null);
    resetEntryGuard();
  }, [resetEntryGuard, threadContext?.id]);

  useEffect(() => {
    setDesktopAvatarPopover(null);
  }, [selectionMode, threadContext?.id]);

  // 卸载组件 / 切换会话时停掉正在播的朗读音频，避免跳路由后还在响
  useEffect(() => {
    return () => {
      speakRequestRef.current += 1;
      const audio = speakAudioRef.current;
      if (audio) {
        try {
          audio.pause();
        } catch {
          // ignore
        }
        speakAudioRef.current = null;
      }
    };
  }, [threadContext?.id]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const closeMenu = () => setContextMenuState(null);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        // 不 preventDefault：desktop-chat-workspace 那条 window keydown
        // microtask 兜底（line 919）会接着跑 dismissSidePanel。用户在
        // 桌面单聊开着「聊天信息」侧栏然后右键消息打开 contextMenu，按
        // Esc 会同时把 contextMenu 和背后的侧栏一起关掉。和 image
        // viewer / dialog 同款修法。
        event.preventDefault();
        closeMenu();
      }
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenuState]);

  useEffect(() => {
    // 注释原本说"长按 sheet 只在目标消息消失时关——socket 推新消息也会
    // 触发这个 effect，如果无条件清空会把用户的点击意图打断。和下面
    // reminderTarget / quoteSelection / forward 等 7 个面板的 pattern 对齐。"
    // 但 contextMenuState 反倒是上面那个例外——之前一直无条件 setNull，
    // 桌面右键消息打开 menu 时只要 AI 回一句话，messages 数组变了 effect
    // 重跑，菜单就被强制关掉了，用户的点击意图被 socket 打断。补成同款
    // 条件式：目标消息还在就保留，消失才关。
    //
    // 这里 9 条 setX 都依赖"目标 id 是否还在 messages 里"。每条单独
    // .some() 是 O(n)，9 条加起来 9·n。socket 一推消息（reply / typing tick /
    // 任何 setQueriesData）就跑一遍，长聊天里 messages 长度 ~200 时每次状态
    // 变化 ~1800 次比较；最后那条 avatar popover 还要按 senderId 扫一遍
    // character 消息。一次性把 id 集合和 character senderId 集合算出来，
    // 后面所有 has() 走 O(1)。
    const messageIdSet = new Set(messages.map((message) => message.id));
    setContextMenuState((current) =>
      current && messageIdSet.has(current.message.id) ? current : null,
    );
    setMobileActionMessage((current) =>
      current && messageIdSet.has(current.id) ? current : null,
    );
    setReminderTargetMessage((current) =>
      current && messageIdSet.has(current.id) ? current : null,
    );
    setQuoteSelectionMessage((current) =>
      current && messageIdSet.has(current.id) ? current : null,
    );
    setSelectedMessageIds((current) =>
      filterStableStringIds(current, (item) => messageIdSet.has(item)),
    );
    setForwardMessages((current) =>
      filterStableMessageList(current, (item) => messageIdSet.has(item.id)),
    );
    setSelectionAnchorMessageId((current) =>
      current && messageIdSet.has(current) ? current : null,
    );
    setViewerMessageId((current) =>
      current && messageIdSet.has(current) ? current : null,
    );
    setLocationViewerMessageId((current) =>
      current && messageIdSet.has(current) ? current : null,
    );
    setNoteViewerMessageId((current) =>
      current && messageIdSet.has(current) ? current : null,
    );
    setDesktopAvatarPopover((current) => {
      if (!current) {
        return current;
      }
      if (current.kind === "owner") {
        return current;
      }
      for (const message of messages) {
        if (
          message.senderType === "character" &&
          message.senderId === current.characterId
        ) {
          return current;
        }
      }
      return null;
    });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (readDetailedTimestampModeEnabled() === detailedTimestampMode) {
      return;
    }

    writeDetailedTimestampModeEnabled(detailedTimestampMode);
  }, [detailedTimestampMode]);

  useEffect(() => {
    if (!isDesktop || !nativeDesktopDetailedTimestampMode) {
      return;
    }

    let cancelled = false;

    const syncDetailedTimestampMode = async () => {
      const nextState = await hydrateDetailedTimestampModeFromNative();
      if (cancelled) {
        return;
      }

      setDetailedTimestampMode((current) =>
        current === nextState.enabled ? current : nextState.enabled,
      );
    };
    const handleFocus = () => {
      void syncDetailedTimestampMode();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncDetailedTimestampMode();
    };
    // 走查 R1：原版 storage 监听对任何 OTHER tab 的 localStorage 写入都触发
    // syncDetailedTimestampMode → 拍 hydrateDetailedTimestampModeFromNative
    // 的 Tauri invoke IPC + setState；和 local-chat-message-actions / chat-room-page
    // 同款 storage event 漏 gate 问题。chat-message-list 在单聊 / 群聊都挂着，
    // 多 tab 时主题切换 / 草稿落盘 / 收藏指纹更新等等都会无意义地把这条 invoke
    // 打一遍。按 STORAGE_KEY gate：只在 chat-detailed-timestamp-mode 自己那两个
    // key 上同步；event.key=null 是 Safari localStorage.clear()，仍按全量同步对待。
    const handleStorageSync = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== DETAILED_TIMESTAMP_MODE_STORAGE_KEY &&
        event.key !== DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY
      ) {
        return;
      }
      void syncDetailedTimestampMode();
    };

    void syncDetailedTimestampMode();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorageSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorageSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isDesktop, nativeDesktopDetailedTimestampMode]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedMessageIds((current) => (current.length ? [] : current));
    setSelectionAnchorMessageId(null);
    setForwardMessages(null);
  }, [isDesktop]);

  useEffect(() => {
    if (selectionMode) {
      return;
    }

    setSelectedMessageIds((current) => (current.length ? [] : current));
    setSelectionAnchorMessageId(null);
  }, [selectionMode]);

  useEffect(() => {
    onSelectionModeChange?.(selectionMode);
  }, [onSelectionModeChange, selectionMode]);

  // 原生壳硬件 Back：移动端多选模式打开时，BACK 应该先退出多选，而不是
  // 直接 history.back 退聊天页（用户进了多选准备转发/删除，BACK 误退会
  // 让选好的几条全没了）。desktop 注册没副作用。
  useEffect(() => {
    if (isDesktop || !selectionMode) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      setSelectionMode(false);
      return true;
    });
    return unregister;
  }, [isDesktop, selectionMode]);

  // perf：原来用独立 cache key ["desktop-message-forward-conversations"]，
  // 跟全 app 其它十几处统一的 ["app-conversations", baseUrl]
  // （chat-list / desktop-chat-window-page / discover-page / group-chat-thread-panel /
  // use-conversation-thread / desktop-notes-workspace 等都用这个 key）两份
  // 完全独立的 cache。chat-list 早就把 app-conversations 拉热了，但开"转发"
  // 弹层（dialog 在 desktop 和 mobile 都用，long-press → 转发都走这条）这边
  // cache 是冷的，要等 getConversations 网络回来才能渲染目标 picker —— 公网
  // 隧道 ~600ms RTT。统一到 app-conversations 复用主缓存。
  // 同 desktop-notes-workspace.tsx 走查 R10 / create-group-page.tsx app-friends
  // R1 同款修法。
  // 走查 R7（第 7 轮）：原注释承诺「配 60s staleTime」但代码漏写，实际裸跑
  // 默认 mobile-web 60s / 其它 10s。和兄弟入口（chat-list / chat-room /
  // chat-details 等 8 处）对齐到 15s。
  const forwardConversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(forwardMessages?.length),
    staleTime: 15_000,
  });
  // 走查 R7（第 7 轮）：和 mobile-chat-plus-panel 同 queryKey "app-favorites"
  // 共享 cache，那边配 30s（收藏只读、频繁开合不必重抓）；本观察者每个聊天
  // 页都挂着裸跑，跨页面切换原生壳 10s 默认就 stale，会无谓重发一次 GET
  // /favorites（公网隧道 ~600ms）。对齐 30s。
  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
    staleTime: 30_000,
  });

  const updateGroupMessageQueries = (
    groupId: string,
    updater: (
      messages: GroupMessage[] | undefined,
    ) => GroupMessage[] | undefined,
  ) => {
    queryClient.setQueriesData<GroupMessage[] | undefined>(
      {
        queryKey: ["app-group-messages", baseUrl, groupId],
      },
      updater,
    );
  };

  const updateConversationMessageQueries = (
    conversationId: string,
    updater: (messages: Message[] | undefined) => Message[] | undefined,
  ) => {
    queryClient.setQueriesData<Message[] | undefined>(
      {
        queryKey: ["app-conversation-messages", baseUrl, conversationId],
      },
      updater,
    );
  };

  const syncFavoriteSourceIds = useCallback(
    (remoteFavorites: Awaited<ReturnType<typeof getFavorites>> = []) => {
      const nextSourceIds = mergeDesktopFavoriteRecords(
        remoteFavorites,
        readDesktopFavorites(),
      ).map((item) => item.sourceId);
      setFavoriteSourceIds((current) =>
        areStringListsEqual(current, nextSourceIds) ? current : nextSourceIds,
      );
    },
    [],
  );

  useEffect(() => {
    syncFavoriteSourceIds(favoritesQuery.data ?? []);
  }, [favoritesQuery.data, syncFavoriteSourceIds]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    let cancelled = false;

    const syncDesktopFavorites = async () => {
      if (nativeDesktopFavorites) {
        await hydrateDesktopFavoritesFromNative();
      }

      if (cancelled) {
        return;
      }

      syncFavoriteSourceIds(favoritesQuery.data ?? []);
    };

    const handleFocus = () => {
      void syncDesktopFavorites();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncDesktopFavorites();
    };
    // 走查 R1：和上方 detailedTimestamp 同款 storage event 漏 gate。
    // chat-message-list 在所有单聊 / 群聊里都挂着，多 tab 时主题 / 草稿 / 已读
    // 标记等 OTHER tab 写 localStorage 都触发 syncDesktopFavorites →
    // hydrateDesktopFavoritesFromNative 拍 Tauri invoke IPC + readDesktopFavorites
    // JSON.parse 整份收藏列表。按 DESKTOP_FAVORITES_STORAGE_KEY gate，event.key=null
    // (Safari localStorage.clear()) 仍按全量同步处理避免静默 stale。
    const handleStorageSync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== DESKTOP_FAVORITES_STORAGE_KEY) {
        return;
      }
      void syncDesktopFavorites();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorageSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorageSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    favoritesQuery.data,
    isDesktop,
    nativeDesktopFavorites,
    syncFavoriteSourceIds,
  ]);

  const forwardMutation = useMutation({
    mutationFn: async (input: {
      conversation: ConversationListItem;
      mode: DesktopMessageForwardMode;
    }) => {
      const { conversation, mode } = input;
      const messageQueue = forwardMessages ?? [];
      if (!messageQueue.length) {
        return {
          conversationTitle: conversation.title,
          count: 0,
          mode,
        };
      }

      if (mode === "merged") {
        await forwardMergedMessagesToConversation({
          t,
          baseUrl,
          conversation,
          messages: messageQueue,
        });

        return {
          conversationTitle: conversation.title,
          count: messageQueue.length,
          mode,
        };
      }

      for (const message of messageQueue) {
        await forwardMessageToConversation({
          t,
          baseUrl,
          conversation,
          message,
        });
      }

      return {
        conversationTitle: conversation.title,
        count: messageQueue.length,
        mode,
      };
    },
    onSuccess: async ({ conversationTitle, count, mode }) => {
      setForwardMessages(null);
      setSelectionMode(false);
      setSelectedMessageIds([]);
      setActionNotice({
        message:
          mode === "merged"
            ? count <= 1
              ? t(msg`已合并转发到 ${conversationTitle}。`)
              : t(msg`已合并转发 ${count} 条消息到 ${conversationTitle}。`)
            : count <= 1
              ? t(msg`已转发到 ${conversationTitle}。`)
              : t(msg`已转发 ${count} 条消息到 ${conversationTitle}。`),
        tone: "success",
      });

      window.setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      }, 500);
    },
    onError: (error, input) => {
      setActionNotice({
        message:
          error instanceof Error
            ? error.message
            : t(msg`转发失败，请稍后再试。`),
        tone: "danger",
        actionLabel: t(msg`继续转发消息`),
        onAction: () => {
          forwardMutation.mutate(input);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    },
  });
  // 用 mutate() 而不是 mutateAsync()——forwardMutation 同文件 line 4018 的
  // sheet onForward 也是同样的 fire-and-forget 场景。把上面 onAction 里
  // void forwardMutation.mutateAsync(input) 换成 mutate() 是为了避免转发
  // 重试再次失败时落 window.unhandledrejection（这里 onError 已重新挂出
  // notice，业务上不需要 await 结果）。

  const recallMutation = useMutation({
    mutationFn: async (message: ChatRenderableMessage) => {
      if (!threadContext) {
        throw new Error(t(msg`当前线程暂不支持撤回消息。`));
      }

      if (threadContext.type === "group") {
        const recalledMessage = await recallGroupMessage(
          threadContext.id,
          message.id,
          baseUrl,
        );

        return {
          threadType: "group" as const,
          recalledMessage,
        };
      }

      const recalledMessage = await recallConversationMessage(
        threadContext.id,
        message.id,
        baseUrl,
      );

      return {
        threadType: "direct" as const,
        recalledMessage,
      };
    },
    onSuccess: async (result, message) => {
      if (!threadContext) {
        return;
      }

      if (result.threadType === "group") {
        updateGroupMessageQueries(
          threadContext.id,
          (current) =>
            current?.map((item) =>
              item.id === result.recalledMessage.id
                ? result.recalledMessage
                : item,
            ) ?? current,
        );
      } else {
        updateConversationMessageQueries(
          threadContext.id,
          (current) =>
            current?.map((item) =>
              item.id === result.recalledMessage.id
                ? result.recalledMessage
                : item,
            ) ?? current,
        );
      }

      setViewerMessageId((current) =>
        current === message.id ? null : current,
      );
      setActionNotice({
        message: t(msg`已撤回这条消息。`),
        tone: "success",
      });

      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (error, message) => {
      setActionNotice({
        message:
          error instanceof Error
            ? error.message
            : t(msg`撤回失败，请稍后再试。`),
        tone: "danger",
        actionLabel: t(msg`继续撤回`),
        onAction: () => {
          triggerRecallMessage(message);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (message: ChatRenderableMessage) => {
      if (!threadContext) {
        throw new Error(t(msg`当前线程暂不支持删除消息。`));
      }

      if (threadContext.type === "group") {
        await deleteGroupMessage(threadContext.id, message.id, baseUrl);

        return {
          threadType: "group" as const,
        };
      }

      await deleteConversationMessage(threadContext.id, message.id, baseUrl);

      return {
        threadType: "direct" as const,
      };
    },
    onSuccess: async (result, message) => {
      if (!threadContext) {
        return;
      }

      clearTransientMessageState(message.id);
      // perf：和姊妹 recallMutation.onSuccess 对齐——updateXxxMessageQueries
      // 已经用 setQueriesData 把这条消息从 cache 里 filter 掉，再追加
      // invalidate(["app-group-messages" / "app-conversation-messages"]) 等于
      // 强制 GET /messages?limit=60 把刚 filter 完的 cache 拉回来重渲染一次
      // （公网隧道 ~600ms RTT × N 条消息体）。recall 路径只 invalidate
      // conversations 让 chat-list 同步 lastMessage 即可；删除走完全一样的
      // 后端 emitGroupConversationUpdated → socket 路径，messages cache
      // 本地 filter 已经是 canonical 形态。同 group-chat-thread-panel.tsx
      // sendMutation R3 / sendCallInviteMutation R1 同款修法。
      if (result.threadType === "group") {
        updateGroupMessageQueries(
          threadContext.id,
          (current) =>
            current?.filter((item) => item.id !== message.id) ?? current,
        );
      } else {
        updateConversationMessageQueries(
          threadContext.id,
          (current) =>
            current?.filter((item) => item.id !== message.id) ?? current,
        );
      }

      setActionNotice({
        message: t(msg`已删除这条消息。`),
        tone: "success",
      });

      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (error, message) => {
      setActionNotice({
        message:
          error instanceof Error
            ? error.message
            : t(msg`删除失败，请稍后再试。`),
        tone: "danger",
        actionLabel: t(msg`继续删除`),
        onAction: () => {
          triggerDeleteMessage(message);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    },
  });

  // 见上方 recallingMessageIdsRef / deletingMessageIdsRef 注释——按 messageId
  // 上同步锁，挡掉同帧第二次 click 让两份相同 POST 飞出去把成功 notice 覆盖
  // 成失败提示。
  const triggerRecallMessage = (message: ChatRenderableMessage) => {
    if (recallingMessageIdsRef.current.has(message.id)) {
      return;
    }
    recallingMessageIdsRef.current.add(message.id);
    recallMutation.mutate(message, {
      onSettled: () => {
        recallingMessageIdsRef.current.delete(message.id);
      },
    });
  };
  const triggerDeleteMessage = (message: ChatRenderableMessage) => {
    if (deletingMessageIdsRef.current.has(message.id)) {
      return;
    }
    deletingMessageIdsRef.current.add(message.id);
    deleteMutation.mutate(message, {
      onSettled: () => {
        deletingMessageIdsRef.current.delete(message.id);
      },
    });
  };

  const addToStickerMutation = useMutation({
    mutationFn: async (message: ChatRenderableMessage) => {
      const source = resolveCustomStickerUploadSource(
        message,
        resolveAttachmentUrl,
      );
      if (!source) {
        throw new Error(t(msg`当前消息暂不支持添加到表情。`));
      }

      const prepared = await prepareRemoteCustomStickerUpload(source);
      const payload = new FormData();
      payload.set("file", prepared.file, prepared.file.name);
      payload.set("width", String(prepared.width));
      payload.set("height", String(prepared.height));
      if (prepared.label) {
        payload.set("label", prepared.label);
      }

      return uploadCustomSticker(payload, baseUrl);
    },
    onSuccess: async () => {
      setActionNotice({
        message: t(msg`已添加到自定义表情。`),
        tone: "success",
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-sticker-catalog", baseUrl],
      });
    },
    onError: (error, message) => {
      setActionNotice({
        message:
          error instanceof Error
            ? error.message
            : t(msg`添加到表情失败，请稍后再试。`),
        tone: "danger",
        actionLabel: t(msg`继续添加到表情`),
        onAction: () => {
          addToStickerMutation.mutate(message);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
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
        message: t(msg`当前环境不支持剪贴板复制。`),
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
        message: t(msg`复制失败，请稍后再试。`),
        tone: "danger",
        actionLabel: t(msg`重试复制`),
        onAction: () => {
          void copyToClipboard(text, successMessage);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    }
  };

  const stopSpeakingMessage = () => {
    // 自增请求号 —— 所有还在 await 的 createSpeechSynthesis 回调走到下面
    // 时都会发现自己的 requestId 已经过期，直接 return，不再 setSpeakingMessageId
    // 也不再挂 audio 上去。
    speakRequestRef.current += 1;
    const audio = speakAudioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch {
        // ignore
      }
      speakAudioRef.current = null;
    }
    setSpeakingMessageId(null);
  };

  const extractSpeakableMessageText = (message: ChatRenderableMessage) => {
    // 取消息原文，跳过 buildClipboardText 的"消息"占位 fallback ——
    // 那个 fallback 是给复制按钮用的，朗读"消息"两个字毫无意义
    const replyContent = extractChatReplyMetadata(message.text);
    return message.senderType === "user"
      ? replyContent.body.trim()
      : sanitizeDisplayedChatText(message.text).trim();
  };

  const speakMessage = async (message: ChatRenderableMessage) => {
    const text = extractSpeakableMessageText(message);
    if (!text) {
      setActionNotice({
        message: t(msg`此消息没有可朗读的文本。`),
        tone: "warning",
      });
      return;
    }
    // 同条消息再点 = 停止；不同条消息 = 切换
    if (speakingMessageId === message.id) {
      stopSpeakingMessage();
      return;
    }
    stopSpeakingMessage();
    const requestId = ++speakRequestRef.current;
    setSpeakingMessageId(message.id);
    try {
      const result = await createSpeechSynthesis(
        {
          text,
          conversationId:
            threadContext?.type === "direct" ? threadContext.id : undefined,
          characterId:
            message.senderType !== "user" && message.senderId
              ? message.senderId
              : undefined,
        },
        baseUrl,
      );
      if (speakRequestRef.current !== requestId) {
        // 在 await 期间用户点了别的消息或同条 stop —— 本次结果作废，
        // 不要触碰 speakAudioRef / speakingMessageId 状态
        return;
      }
      const audioUrl = resolveAppMediaUrl(result.audioUrl);
      const audio = new Audio(audioUrl);
      speakAudioRef.current = audio;
      audio.onended = () => {
        if (speakAudioRef.current === audio) {
          speakAudioRef.current = null;
          setSpeakingMessageId((current) =>
            current === message.id ? null : current,
          );
        }
      };
      audio.onerror = () => {
        if (speakAudioRef.current === audio) {
          speakAudioRef.current = null;
          setSpeakingMessageId((current) =>
            current === message.id ? null : current,
          );
          setActionNotice({
            message: t(msg`语音播放失败，请稍后再试。`),
            tone: "danger",
          });
        }
      };
      await audio.play();
    } catch (error) {
      if (speakRequestRef.current !== requestId) {
        return;
      }
      // 失败时清掉 ref —— 比如 audio.play() 被浏览器 autoplay policy 拒绝，
      // 此时 audio 已经赋给了 ref 但实际没在播；不清掉的话下一次 stop
      // 会去 pause 一个根本没播的 audio，状态错乱
      speakAudioRef.current = null;
      setSpeakingMessageId((current) =>
        current === message.id ? null : current,
      );
      const isQuotaExhausted =
        error instanceof ApiRequestError &&
        (error.errorCode === "AI_TTS_QUOTA_EXHAUSTED" ||
          error.statusCode === 429);
      setActionNotice({
        message: isQuotaExhausted
          ? t(msg`今日语音合成额度已用完，请稍后再试。`)
          : t(msg`生成语音失败，请稍后再试。`),
        tone: "danger",
        actionLabel: isQuotaExhausted ? undefined : t(msg`重试`),
        onAction: isQuotaExhausted
          ? undefined
          : () => {
              void speakMessage(message);
            },
      });
    }
  };

  const shareLocationSummary = async (
    attachment: Extract<MessageAttachment, { kind: "location_card" }>,
  ) => {
    const summary = buildLocationAttachmentSummary(attachment);
    if (!isNativeMobileShareSurface()) {
      await copyToClipboard(summary, t(msg`位置内容已复制。`));
      return;
    }

    const shared = await shareWithNativeShell({
      title: attachment.title,
      text: summary,
    });

    if (shared) {
      setActionNotice({
        message: t(msg`已打开系统分享面板。`),
        tone: "success",
      });
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setActionNotice({
        message: t(msg`当前设备暂时无法打开系统分享，请稍后重试。`),
        tone: "danger",
        actionLabel: t(msg`重试分享`),
        onAction: () => {
          void shareLocationSummary(attachment);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setActionNotice({
        message: t(msg`系统分享暂时不可用，已复制位置内容。`),
        tone: "success",
      });
    } catch {
      setActionNotice({
        message: t(msg`系统分享失败，请稍后重试。`),
        tone: "danger",
        actionLabel: t(msg`重试分享`),
        onAction: () => {
          void shareLocationSummary(attachment);
        },
        secondaryActionLabel: errorActionLabel ?? undefined,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    }
  };

  const shareContactSummary = async (
    attachment: Extract<MessageAttachment, { kind: "contact_card" }>,
  ) => {
    const profilePath = `/character/${attachment.characterId}`;
    const profileUrl = buildPublicShareUrl(profilePath);
    const summary = buildContactAttachmentSummary(attachment, profileUrl);

    if (!isNativeMobileShareSurface()) {
      await copyToClipboard(summary, t(msg`名片摘要已复制。`));
      return;
    }

    const shared = await shareWithNativeShell({
      title: t(msg`${attachment.name} 的隐界名片`),
      text: summary,
      url: profileUrl,
    });

    if (shared) {
      setActionNotice({
        message: t(msg`已打开系统分享面板。`),
        tone: "success",
      });
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setActionNotice({
        message: t(msg`当前设备暂时无法打开系统分享，请稍后重试。`),
        tone: "danger",
        actionLabel: t(msg`重试分享`),
        onAction: () => {
          void shareContactSummary(attachment);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setActionNotice({
        message: t(msg`系统分享暂时不可用，已复制名片摘要。`),
        tone: "success",
      });
    } catch {
      setActionNotice({
        message: t(msg`系统分享失败，请稍后重试。`),
        tone: "danger",
        actionLabel: t(msg`重试分享`),
        onAction: () => {
          void shareContactSummary(attachment);
        },
        secondaryActionLabel: errorActionLabel ?? undefined,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    }
  };

  const shareNoteSummary = async (
    attachment: Extract<MessageAttachment, { kind: "note_card" }>,
  ) => {
    const summary = buildNoteAttachmentSummary(attachment);

    if (!isNativeMobileShareSurface()) {
      await copyToClipboard(summary, t(msg`笔记摘要已复制。`));
      return;
    }

    const shared = await shareWithNativeShell({
      title: attachment.title,
      text: summary,
    });

    if (shared) {
      setActionNotice({
        message: t(msg`已打开系统分享面板。`),
        tone: "success",
      });
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setActionNotice({
        message: t(msg`当前设备暂时无法打开系统分享，请稍后重试。`),
        tone: "danger",
        actionLabel: t(msg`重试分享`),
        onAction: () => {
          void shareNoteSummary(attachment);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setActionNotice({
        message: t(msg`系统分享暂时不可用，已复制笔记摘要。`),
        tone: "success",
      });
    } catch {
      setActionNotice({
        message: t(msg`系统分享失败，请稍后重试。`),
        tone: "danger",
        actionLabel: t(msg`重试分享`),
        onAction: () => {
          void shareNoteSummary(attachment);
        },
        secondaryActionLabel: errorActionLabel ?? undefined,
        onSecondaryAction: onErrorAction ?? undefined,
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

  const handleDesktopAvatarClick = (
    event: MouseEvent<HTMLButtonElement>,
    message: ChatRenderableMessage,
  ) => {
    event.stopPropagation();
    const characterId = message.senderId?.trim();
    if (!characterId) {
      return;
    }

    setDesktopAvatarPopover({
      anchorElement: event.currentTarget,
      kind: "character",
      characterId,
      senderName: message.senderName?.trim() || t(msg`对方`),
      senderAvatar: message.senderAvatar,
    });
  };

  const handleMobileCharacterAvatarClick = (
    event: MouseEvent<HTMLButtonElement>,
    message: ChatRenderableMessage,
  ) => {
    event.stopPropagation();
    const characterId = message.senderId?.trim();
    if (!characterId) {
      return;
    }

    void navigate({
      to: "/character/$characterId",
      params: { characterId },
      hash: buildCharacterProfileHash(),
    });
  };

  const handleDesktopOwnerAvatarClick = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    setDesktopAvatarPopover({
      anchorElement: event.currentTarget,
      kind: "owner",
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

  const hiddenMessageIdSet = useMemo(
    () => new Set(hiddenMessageIds),
    [hiddenMessageIds],
  );
  const recalledMessageIdSet = useMemo(
    () => new Set(recalledMessageIds),
    [recalledMessageIds],
  );
  const messageReminderMap = useMemo(
    () => new Map(messageReminders.map((item) => [item.messageId, item])),
    [messageReminders],
  );
  const visibleMessagesSnapshot = useMemo(
    () =>
      collapseGroupCallMessages(
        messages.filter((message) => !hiddenMessageIdSet.has(message.id)),
      ),
    [hiddenMessageIdSet, messages],
  );
  const visibleMessages = visibleMessagesSnapshot.messages;
  const collapsedMessageRedirects = visibleMessagesSnapshot.redirectedIds;
  const resolvedUnreadMarkerMessageId =
    unreadMarkerMessageId &&
    collapsedMessageRedirects.has(unreadMarkerMessageId)
      ? (collapsedMessageRedirects.get(unreadMarkerMessageId) ?? null)
      : unreadMarkerMessageId;
  const resolvedHighlightedMessageId =
    activeHighlightedMessageId &&
    collapsedMessageRedirects.has(activeHighlightedMessageId)
      ? collapsedMessageRedirects.get(activeHighlightedMessageId)
      : activeHighlightedMessageId;
  const importedSharedMessageIdSet = useMemo(() => {
    const nextIds = new Set<string>();
    let pendingImportCount = 0;

    for (const message of visibleMessages) {
      const isSystem =
        message.type === "system" || message.senderType === "system";
      if (isSystem) {
        const summary = parseSharedHistorySummaryMessage(t,
          sanitizeDisplayedChatText(message.text),
        );
        pendingImportCount = summary?.count ?? 0;
        continue;
      }

      if (pendingImportCount > 0) {
        nextIds.add(message.id);
        pendingImportCount -= 1;
      }
    }

    return nextIds;
    // t 必须进 deps：parseSharedHistorySummaryMessage 用 t 来识别"已转发 N 条
    // 消息"系统提示的本地化前缀，locale 切换后旧 closure 用上个 locale 的前缀
    // 匹配，会漏判 → 转发卡片在新 locale 下不会被标成 imported。
  }, [t, visibleMessages]);

  // useMemo：每次父组件渲染（typing 指示器 tick / 任何 state 变化）都会
  // 走到这里，filter + map 历史里所有图片消息 → 让下游 standaloneViewerItems
  // 的 useMemo 也跟着重算。长聊天滚动到顶后历史里图片 ≥10 张时这层 O(n) 是
  // 可见开销。挂 useMemo 后只在 visibleMessages / recalledMessageIdSet /
  // buildMessageReturnTo / threadContext / resolveAttachmentUrl 真变了时重算。
  const imageMessages = useMemo(
    () =>
      visibleMessages
        .filter(
          (
            message,
          ): message is ChatRenderableMessage & {
            type: "image";
            attachment: Extract<MessageAttachment, { kind: "image" }>;
          } =>
            !recalledMessageIdSet.has(message.id) &&
            message.type === "image" &&
            message.attachment?.kind === "image",
        )
        .map((message) => {
          const label =
            message.attachment.fileName ||
            sanitizeDisplayedChatText(message.text) ||
            t(msg`[图片]`);
          const returnTo =
            buildMessageReturnTo?.(message.id) ??
            (threadContext
              ? threadContext.type === "group"
                ? `/group/${threadContext.id}#chat-message-${message.id}`
                : `/chat/${threadContext.id}#chat-message-${message.id}`
              : undefined);
          const meta = threadContext?.title?.trim()
            ? `${threadContext.title} · ${formatMessageTimestamp(message.createdAt)}`
            : formatMessageTimestamp(message.createdAt);

          return {
            id: message.id,
            url: resolveAttachmentUrl(message.attachment.url),
            label,
            fileName: message.attachment.fileName,
            createdAt: message.createdAt,
            meta,
            returnTo,
          };
        }),
    [
      buildMessageReturnTo,
      recalledMessageIdSet,
      resolveAttachmentUrl,
      t,
      threadContext,
      visibleMessages,
    ],
  );
  const standaloneViewerItems = useMemo(
    () =>
      imageMessages.map(
        (image): DesktopChatImageViewerSessionItem => ({
          id: image.id,
          imageUrl: image.url,
          title: image.fileName || image.label || t(msg`图片`),
          meta: image.meta,
          returnTo: image.returnTo,
        }),
      ),
    // t 必须进 deps：fallback title t(msg`图片`)（图片无 fileName/label 时）
    // 漏 dep 会让 locale 切换后 viewer 标题卡在上个 locale 的"图片"。
    [imageMessages, t],
  );
  const unreadMarkerDomId = buildChatUnreadMarkerDomId(threadContext);
  const resolvedUnreadMarkerLabel =
    unreadMarkerLabel ??
    (unreadMarkerCount > 0
      ? t(msg`以下是 ${unreadMarkerCount} 条新消息`)
      : t(msg`以下是新消息`));
  const activeImageIndex = viewerMessageId
    ? imageMessages.findIndex((message) => message.id === viewerMessageId)
    : -1;
  const activeImage =
    activeImageIndex >= 0 ? imageMessages[activeImageIndex] : null;
  const activeLocationMessage = locationViewerMessageId
    ? visibleMessages.find((message) => message.id === locationViewerMessageId)
    : null;
  const activeLocation =
    activeLocationMessage?.type === "location_card" &&
    activeLocationMessage.attachment?.kind === "location_card" &&
    !recalledMessageIdSet.has(activeLocationMessage.id)
      ? {
          id: activeLocationMessage.id,
          attachment: activeLocationMessage.attachment,
        }
      : null;
  const activeNoteMessage = noteViewerMessageId
    ? visibleMessages.find((message) => message.id === noteViewerMessageId)
    : null;
  const activeNote =
    activeNoteMessage?.type === "note_card" &&
    activeNoteMessage.attachment?.kind === "note_card" &&
    !recalledMessageIdSet.has(activeNoteMessage.id)
      ? {
          id: activeNoteMessage.id,
          attachment: activeNoteMessage.attachment,
          previewImageUrl: resolveNotePreviewImageUrl(
            activeNoteMessage.attachment,
            resolveAttachmentUrl,
          ),
        }
      : null;

  const openImageByIndex = (nextIndex: number) => {
    const target = imageMessages[nextIndex];
    if (!target) {
      return;
    }

    setViewerMessageId(target.id);
  };

  const openImagePreview = (messageId: string) => {
    const target = imageMessages.find((item) => item.id === messageId);
    if (!target) {
      return;
    }

    if (!isDesktop) {
      setViewerMessageId(target.id);
      return;
    }

    void openDesktopChatImageViewerWindowOnDemand({
      imageUrl: target.url,
      title: target.fileName || target.label || t(msg`图片`),
      meta: target.meta,
      returnTo: target.returnTo,
      items: standaloneViewerItems,
      activeId: target.id,
    })
      .then((opened) => {
        if (opened) {
          return;
        }

        setViewerMessageId(target.id);
        setActionNotice({
          message: t(msg`浏览器阻止了新窗口，已改为当前页预览。`),
          tone: "warning",
        });
      })
      .catch(() => {
        setViewerMessageId(target.id);
        setActionNotice({
          message: t(msg`图片预览打开失败，已改为当前页预览。`),
          tone: "warning",
        });
      });
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
        // 不 preventDefault 的话 desktop-chat-workspace 的 window keydown
        // microtask 兜底会接着跑 dismissSidePanel —— 用户开着「聊天信息」/
        // 「查找记录」侧栏然后点开消息里的图片预览，按 Esc 会同时把图片查
        // 看器和背后的侧栏一起关掉。和 Round 5/6/7 给 popover / confirm /
        // text-edit dialog 补的 preventDefault 同款修法。
        event.preventDefault();
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

  const handleToggleFavorite = async (message: ChatRenderableMessage) => {
    const sourceId = buildFavoriteSourceId(message.id);
    const collected = favoriteSourceIds.includes(sourceId);

    setFavoriteSourceIds((current) =>
      collected
        ? current.filter((id) => id !== sourceId)
        : current.includes(sourceId)
          ? current
          : [sourceId, ...current],
    );

    try {
      if (threadContext) {
        if (collected) {
          await removeFavorite(sourceId, baseUrl);
          removeDesktopFavorite(sourceId);
          const nextRemoteFavorites = await queryClient.fetchQuery({
            queryKey: ["app-favorites", baseUrl],
            queryFn: () => getFavorites(baseUrl),
            staleTime: 0,
          });
          syncFavoriteSourceIds(nextRemoteFavorites);
          setActionNotice({
            message: t(msg`已取消收藏消息。`),
            tone: "success",
          });
          return;
        }

        await createMessageFavorite(
          {
            threadId: threadContext.id,
            threadType: threadContext.type,
            messageId: message.id,
          },
          baseUrl,
        );
        const nextRemoteFavorites = await queryClient.fetchQuery({
          queryKey: ["app-favorites", baseUrl],
          queryFn: () => getFavorites(baseUrl),
          staleTime: 0,
        });
        syncFavoriteSourceIds(nextRemoteFavorites);
        setActionNotice({
          message: t(msg`消息已加入收藏。`),
          tone: "success",
        });
        return;
      }

      if (collected) {
        const nextFavorites = removeDesktopFavorite(sourceId);
        setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
        setActionNotice({
          message: t(msg`已取消收藏消息。`),
          tone: "success",
        });
        return;
      }

      const nextFavorites = upsertDesktopFavorite(
        buildMessageFavoriteRecord(t, message, groupMode, threadContext),
      );
      setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
      setActionNotice({
        message: t(msg`消息已加入收藏。`),
        tone: "success",
      });
    } catch (error) {
      setFavoriteSourceIds((current) =>
        collected
          ? current.includes(sourceId)
            ? current
            : [sourceId, ...current]
          : current.filter((id) => id !== sourceId),
      );
      setActionNotice({
        message:
          error instanceof Error
            ? error.message
            : t(msg`收藏失败，请稍后再试。`),
        tone: "danger",
        actionLabel: collected ? t(msg`继续取消收藏`) : t(msg`继续收藏`),
        onAction: () => {
          void handleToggleFavorite(message);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    }
  };

  const openAttachment = (message: ChatRenderableMessage) => {
    if (message.type === "image" && message.attachment?.kind === "image") {
      openImagePreview(message.id);
      return;
    }

    const attachment = getOpenableAttachment(message);
    if (!attachment) {
      return;
    }

    if (attachment.kind === "contact_card") {
      const recommendationId =
        attachment.recommendationMetadata?.recommendationId ?? undefined;
      if (recommendationId) {
        void markFollowupRecommendationOpened(recommendationId, baseUrl).catch(
          () => undefined,
        );
      }

      if (variant === "desktop") {
        if (attachment.recommendationMetadata?.relationshipState === "friend") {
          void getOrCreateConversation(
            { characterId: attachment.characterId },
            baseUrl,
          )
            .then((conversation) => {
              if (recommendationId) {
                void markFollowupRecommendationChatStarted(
                  recommendationId,
                  baseUrl,
                ).catch(() => undefined);
              }
              void navigate({
                to: buildDesktopChatThreadPath({
                  conversationId: conversation.id,
                }),
              });
            })
            // 桌面单聊里点联系人名片 → getOrCreateConversation 失败时原来
            // 直接 .catch(() => undefined) 静默吞掉，用户点了卡片却毫无反
            // 应，会反复点。和下面 add-friend 分支的 catch 行为对齐，弹
            // ActionNotice 让用户知道这次失败了。
            .catch((error) => {
              setActionNotice({
                message:
                  error instanceof Error
                    ? error.message
                    : t(msg`打开聊天失败，请稍后重试。`),
                tone: "danger",
              });
            });
          return;
        }

        void buildDesktopAddFriendRouteHashOnDemand({
          keyword: attachment.name,
          characterId: attachment.characterId,
          openCompose:
            attachment.recommendationMetadata?.relationshipState !== "pending",
          recommendationId,
        })
          .then((desktopHash) => {
            void navigate({
              to: "/desktop/add-friend",
              hash: desktopHash,
            });
          })
          .catch(() => {
            setActionNotice({
              message: t(msg`打开添加朋友页失败，请稍后重试。`),
              tone: "danger",
            });
          });
        return;
      }

      void navigate({
        to: "/character/$characterId",
        params: {
          characterId: attachment.characterId,
        },
        hash: buildCharacterProfileHash({
          recommendationId,
        }),
      });
      return;
    }

    if (attachment.kind === "location_card") {
      setLocationViewerMessageId(message.id);
      return;
    }

    if (attachment.kind === "note_card") {
      if (variant === "desktop") {
        void buildDesktopNoteWindowRouteHashOnDemand({
          noteId: attachment.noteId,
          returnTo:
            typeof window !== "undefined"
              ? getCurrentWindowTargetPath()
              : "/tabs/favorites",
        })
          .then((desktopHash) => {
            void navigate({
              to: "/tabs/favorites",
              hash: desktopHash,
            });
          })
          .catch(() => {
            setActionNotice({
              message: t(msg`打开笔记失败，请稍后重试。`),
              tone: "danger",
            });
          });
        return;
      }

      setNoteViewerMessageId(message.id);
      return;
    }

    if (attachment.kind === "feed_post_card") {
      // 视频号转发卡片点开 → 跳到对应视频号详情。复用 channels-route-state
      // 的 hash 编码（postId / section / returnPath）。
      //
      // 走查 R4：原 channelsHash 没带 returnPath / returnHash，用户在聊天里点
      // 视频号卡跳到 /discover/channels 后，ChannelsPage 的「返回」按钮拿不到
      // safeReturnPath 兜底落到 /tabs/discover，把用户从「上一条对话」甩到发现
      // 首页，下一句不知道往哪回。带上当前 chat 的 pathname + hash，让返回能回
      // 到这条对话原来的位置。
      const channelsHash = buildDesktopChannelsRouteHash({
        postId: attachment.postId,
        section: "recommended",
        returnPath: pathname,
        returnHash: hash || undefined,
      });
      // 走查 R3 新一轮：原注释/代码两路对调了——channels-page 的 URL hash
      // 同步 effect 是「桌面走 /tabs/channels（effect L1196 cond `!isDesktopLayout
      // || !isDesktopChannelsRoute` + navigate to /tabs/channels），移动走
      // /discover/channels（effect L1237 cond `normalizedPathname !==
      // "/discover/channels"`）」。原代码把 desktop 推到 /discover/channels、
      // mobile 推到 /tabs/channels，结果用户在聊天里点 feed_post_card 跳到视频号后
      // 改 section / 选 post，URL hash 永远不同步——刷新整页就退回 recommended，
      // 转发链接也带不上 postId。和 discover-page 的入口（mobile 一直走
      // /discover/channels，line 178）以及 channels-page 的 effect 保持一致。
      if (variant === "desktop") {
        void navigate({ to: "/tabs/channels", hash: channelsHash });
      } else {
        void navigate({ to: "/discover/channels", hash: channelsHash });
      }
      return;
    }

    if (attachment.kind === "file") {
      const openFileAttachment = () =>
        openRemoteFile({
          url: resolveAttachmentUrl(attachment.url),
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          dialogTitle: t(msg`打开文件`),
        });

      const showFileOpenResult = (result: Awaited<ReturnType<typeof openRemoteFile>>) => {
        setActionNotice({
          message: result.message,
          tone: result.opened ? "success" : "danger",
          actionLabel: result.opened ? undefined : t(msg`重试打开文件`),
          onAction: result.opened
            ? undefined
            : () => {
                void openFileAttachment().then(showFileOpenResult);
              },
          secondaryActionLabel: errorActionLabel,
          onSecondaryAction: onErrorAction ?? undefined,
        });
      };

      void openFileAttachment().then(showFileOpenResult);
    }
  };

  const saveAttachmentFile = (input: {
    url: string;
    fileName: string;
    kind: "image" | "file";
  }) => {
    const retryLabel =
      input.kind === "image" ? t(msg`重试保存图片`) : t(msg`重试保存文件`);

    void saveRemoteFile({
      url: input.url,
      fileName: input.fileName,
      kind: input.kind,
      dialogTitle:
        input.kind === "image" ? t(msg`保存图片`) : t(msg`保存文件`),
    }).then((result) => {
      if (result.status === "cancelled") {
        return;
      }

      const canRevealSavedFile =
        result.status === "saved" && Boolean(result.savedPath?.trim());
      const savedPath = canRevealSavedFile ? result.savedPath!.trim() : null;

      setActionNotice({
        message: result.message,
        tone: result.status === "failed" ? "danger" : "success",
        actionLabel:
          result.status === "failed"
            ? retryLabel
            : canRevealSavedFile
              ? t(msg`打开位置`)
              : undefined,
        onAction:
          result.status === "failed"
            ? () => {
                saveAttachmentFile(input);
              }
            : savedPath
              ? () => {
                  void revealSavedFile(savedPath).then((revealed) => {
                    setActionNotice({
                      message: revealed
                        ? t(msg`已打开所在位置。`)
                        : t(msg`打开所在位置失败，请稍后再试。`),
                      tone: revealed ? "success" : "danger",
                    });
                  });
                }
              : undefined,
        secondaryActionLabel:
          result.status === "failed" ? errorActionLabel : undefined,
        onSecondaryAction:
          result.status === "failed" ? onErrorAction ?? undefined : undefined,
      });
    });
  };

  const saveAttachment = (message: ChatRenderableMessage) => {
    const attachment = getSaveableAttachment(message);
    if (!attachment) {
      return;
    }

    if (attachment.kind === "location_card") {
      void shareLocationSummary(attachment);
      return;
    }

    if (attachment.kind === "contact_card") {
      void shareContactSummary(attachment);
      return;
    }

    saveAttachmentFile({
      url: resolveAttachmentUrl(attachment.url),
      fileName:
        attachment.kind === "file"
          ? attachment.fileName
          : attachment.fileName || "image",
      kind: attachment.kind === "image" ? "image" : "file",
    });
  };

  const clearTransientMessageState = (targetMessageId: string) => {
    setSelectedMessageIds((current) =>
      current.filter((item) => item !== targetMessageId),
    );
    setSelectionAnchorMessageId((current) =>
      current === targetMessageId ? null : current,
    );
    setForwardMessages(
      (current) =>
        current?.filter((item) => item.id !== targetMessageId) ?? null,
    );
    setViewerMessageId((current) =>
      current === targetMessageId ? null : current,
    );
    setLocationViewerMessageId((current) =>
      current === targetMessageId ? null : current,
    );
  };

  const applyLocalMessageActionState = (
    nextState: ReturnType<typeof readLocalChatMessageActionState>,
    targetMessageId: string,
  ) => {
    setHiddenMessageIds(nextState.hiddenMessageIds);
    setRecalledMessageIds(nextState.recalledMessageIds);
    clearTransientMessageState(targetMessageId);
  };

  const handleDeleteMessage = (message: ChatRenderableMessage) => {
    if (isLocalOnlyMessage(message)) {
      const nextState = hideLocalChatMessage(message.id);
      applyLocalMessageActionState(nextState, message.id);
      setActionNotice({
        message: t(msg`已从当前设备删除这条消息。`),
        tone: "success",
      });
      return;
    }

    if (threadContext) {
      triggerDeleteMessage(message);
      return;
    }

    const nextState = hideLocalChatMessage(message.id);
    applyLocalMessageActionState(nextState, message.id);
    setActionNotice({
      message: t(msg`已从当前设备删除这条消息。`),
      tone: "success",
    });
  };

  const handleRetryMessage = async (message: ChatRenderableMessage) => {
    if (!onRetryMessage || message.localStatus !== "failed") {
      return;
    }

    try {
      await onRetryMessage(message);
      setActionNotice({
        message: t(msg`已重新尝试发送。`),
        tone: "success",
      });
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error
            ? error.message
            : t(msg`重试发送失败，请稍后再试。`),
        tone: "danger",
        actionLabel: t(msg`继续重试发送`),
        onAction: () => {
          void handleRetryMessage(message);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    }
  };

  const reminderOptions = buildReminderOptions(t, new Date());

  const handleSetReminder = (message: ChatRenderableMessage) => {
    setReminderTargetMessage(message);
  };

  const handleClearReminder = async (messageId: string) => {
    // clearReminder 走的是 removeReminderMutation.mutateAsync —— 公网隧道
    // 偶发超时 / cloud token 重连那几百 ms 都会 reject。caller 是
    // void handleClearReminder(...) fire-and-forget，漏 try/catch 整条
    // rejection 直接落 unhandledrejection 污染 telemetry，用户那边还看不到
    // 任何 toast，以为操作生效了。
    try {
      await clearReminder(messageId);
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error
            ? error.message
            : t(msg`取消提醒失败，请稍后再试。`),
        tone: "danger",
        actionLabel: t(msg`继续取消提醒`),
        onAction: () => {
          void handleClearReminder(messageId);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
      return;
    }
    setReminderTargetMessage((current) =>
      current?.id === messageId ? null : current,
    );
    setActionNotice({
      message: t(msg`已取消这条消息的提醒。`),
      tone: "success",
    });
  };

  const handleToggleReminder = (message: ChatRenderableMessage) => {
    if (messageReminderMap.has(message.id)) {
      void handleClearReminder(message.id);
      return;
    }

    handleSetReminder(message);
  };

  const handleOpenQuoteSelection = (message: ChatRenderableMessage) => {
    if (!getPartialQuoteSourceText(message)) {
      setActionNotice({
        message: t(msg`当前消息暂不支持部分引用。`),
        tone: "danger",
      });
      return;
    }

    setQuoteSelectionMessage(message);
  };

  const handleConfirmQuoteSelection = (selectedText: string) => {
    if (!quoteSelectionMessage || !onReplyMessage) {
      return;
    }

    onReplyMessage(quoteSelectionMessage, { quotedText: selectedText });
    setQuoteSelectionMessage(null);
    setActionNotice({
      message: t(msg`已带入所选文字。`),
      tone: "success",
    });
  };

  const handleSelectReminder = async (option: MobileMessageReminderOption) => {
    if (!reminderTargetMessage) {
      return;
    }

    try {
      await setReminder(
        {
          messageId: reminderTargetMessage.id,
          remindAt: option.remindAt,
          threadId: threadContext?.id ?? "",
          threadType: threadContext?.type ?? "direct",
        },
        {
          messageId: reminderTargetMessage.id,
          remindAt: option.remindAt,
          threadId: threadContext?.id ?? "",
          threadType: threadContext?.type ?? "direct",
          threadTitle: threadContext?.title,
          previewText: buildClipboardText(t, reminderTargetMessage),
        },
      );
      setReminderTargetMessage(null);
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error
            ? error.message
            : t(msg`设置提醒失败，请稍后再试。`),
        tone: "danger",
        actionLabel: t(msg`继续设置提醒`),
        onAction: () => {
          void handleSelectReminder(option);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
      return;
    }

    void requestNotificationPermission().then((permissionState) => {
      const nativeMobileShareSupported = isNativeMobileShareSurface();
      const summary = formatReminderSummary(t, option.remindAt);
      if (permissionState === "granted") {
        setActionNotice({
          message: t(msg`已设为消息提醒 · ${summary}，系统通知已开启。`),
          tone: "success",
        });
        return;
      }

      if (permissionState === "denied") {
        setActionNotice({
          message: nativeMobileShareSupported
            ? t(msg`已设为消息提醒 · ${summary}，系统通知未开启。可前往系统设置继续打开通知。`)
            : t(msg`已设为消息提醒 · ${summary}，系统通知未开启。`),
          tone: "warning",
          actionLabel: nativeMobileShareSupported ? t(msg`去设置`) : undefined,
          onAction: nativeMobileShareSupported
            ? () => {
                void openAppSettings();
              }
            : undefined,
          secondaryActionLabel: errorActionLabel,
          onSecondaryAction: onErrorAction ?? undefined,
        });
        return;
      }

      setActionNotice({
        message: t(msg`已设为消息提醒 · ${summary}。`),
        tone: "success",
      });
    });
  };

  const selectedMessageIdSet = useMemo(
    () => new Set(selectedMessageIds),
    [selectedMessageIds],
  );
  const selectedMessages = useMemo(
    () =>
      visibleMessages.filter((message) => selectedMessageIdSet.has(message.id)),
    [selectedMessageIdSet, visibleMessages],
  );
  const recallableSelectedMessages = useMemo(
    () =>
      selectedMessages.filter((message) =>
        canRecallMessage(message, threadContext),
      ),
    [selectedMessages, threadContext],
  );
  const allVisibleSelected =
    visibleMessages.length > 0 &&
    visibleMessages.every((message) => selectedMessageIdSet.has(message.id));
  const forwardPreviewItems: DesktopMessageForwardPreviewItem[] = useMemo(
    () =>
      (forwardMessages ?? []).map((message) => ({
        id: message.id,
        senderName: buildClipboardSender(t, message),
        previewText: buildForwardPreviewText(t, message),
        typeLabel: resolveForwardTypeLabel(t, message),
      })),
    // t 必须进 deps：buildClipboardSender / buildForwardPreviewText /
    // resolveForwardTypeLabel 都通过 t 渲染本地化文案（发送者别名 / "图片"
    // / "语音" 等类型标签），locale 切换后转发预览卡片会卡上个语言。
    [forwardMessages, t],
  );

  const handleOpenDirectCallInviteCard = (input: {
    kind: "voice" | "video";
    source: CallInviteSource | null;
  }) => {
    if (!onOpenDirectCallInvite) {
      return;
    }

    if (input.kind === "video" && !guardVideoEntry()) {
      setPendingDirectCallInvite({ source: input.source });
      return;
    }

    setPendingDirectCallInvite(null);
    clearEntryNotice();
    onOpenDirectCallInvite(input);
  };

  if (!visibleMessages.length) {
    return emptyState ?? null;
  }

  const resetSelectionMode = () => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setSelectionAnchorMessageId(null);
  };

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

    const anchorIndex = visibleMessages.findIndex(
      (message) => message.id === selectionAnchorMessageId,
    );
    const targetIndex = visibleMessages.findIndex(
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
      visibleMessages
        .slice(startIndex, endIndex + 1)
        .map((message) => message.id),
    );
    const nextSelectedMessageIds = visibleMessages
      .filter(
        (message) =>
          selectedMessageIdSet.has(message.id) || rangeIds.has(message.id),
      )
      .map((message) => message.id);

    setSelectedMessageIds(nextSelectedMessageIds);
    setActionNotice({
      message: t(msg`已选择到这里，共 ${nextSelectedMessageIds.length} 条消息。`),
      tone: "success",
    });
  };

  const handleToggleSelectAllMessages = () => {
    if (allVisibleSelected) {
      setSelectedMessageIds([]);
      setSelectionAnchorMessageId(null);
      return;
    }

    const nextSelectedMessageIds = visibleMessages.map((message) => message.id);
    setSelectedMessageIds(nextSelectedMessageIds);
    setSelectionAnchorMessageId(nextSelectedMessageIds[0] ?? null);
  };

  const handleFavoriteSelectedMessages = async () => {
    const messagesToFavorite = [...selectedMessages];
    if (!messagesToFavorite.length) {
      return;
    }
    if (selectionActionBusyRef.current) {
      return;
    }

    selectionActionBusyRef.current = true;
    setSelectionActionPending("favorite");
    try {
      if (threadContext) {
        await Promise.all(
          messagesToFavorite.map((message) =>
            createMessageFavorite(
              {
                threadId: threadContext.id,
                threadType: threadContext.type,
                messageId: message.id,
              },
              baseUrl,
            ),
          ),
        );
        const nextRemoteFavorites = await queryClient.fetchQuery({
          queryKey: ["app-favorites", baseUrl],
          queryFn: () => getFavorites(baseUrl),
          staleTime: 0,
        });
        syncFavoriteSourceIds(nextRemoteFavorites);
      } else {
        let nextFavorites = readDesktopFavorites();
        for (const message of messagesToFavorite) {
          nextFavorites = upsertDesktopFavorite(
            buildMessageFavoriteRecord(t, message, groupMode, threadContext),
          );
        }

        setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
      }
      resetSelectionMode();
      setActionNotice({
        message:
          messagesToFavorite.length === 1
            ? t(msg`已收藏 1 条消息。`)
            : t(msg`已收藏 ${messagesToFavorite.length} 条消息。`),
        tone: "success",
      });
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error
            ? error.message
            : t(msg`收藏失败，请稍后再试。`),
        tone: "danger",
        actionLabel: t(msg`继续收藏所选消息`),
        onAction: () => {
          void handleFavoriteSelectedMessages();
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    } finally {
      selectionActionBusyRef.current = false;
      setSelectionActionPending(null);
    }
  };

  const handleDeleteSelectedMessages = async () => {
    const messagesToDelete = [...selectedMessages];
    if (!messagesToDelete.length) {
      return;
    }
    if (selectionActionBusyRef.current) {
      return;
    }

    const deletedMessageIdSet = new Set<string>();
    // 走查新一轮 R1：原版 for-await 一路裸跑，第 K 条 deleteXxxMessage 抛错
    // （网络抖 / cloud token 续期 / 群被对方移除致 403）→ 整个函数 throw 出去
    // 直接 catch 显示"批量删除失败"；但前 K-1 条服务端已经删掉，本地 cache
    // 完全没动（cache 更新挂在 try 块 throw 点之后）。结果：
    //   · UI 仍显示前 K-1 条消息（cache 没 filter）
    //   · 用户点"继续删除所选消息"重试，selectedMessageIds 还含前 K-1 条 →
    //     再 DELETE 一次 → 服务端返 404 → 又"批量删除失败"，死循环看着没动
    //   · 用户最后强退多选，下次进群聊 messagesQuery refetch 才发现"咦怎么
    //     少了几条"，跟自己最初的预期对不上
    // 群聊里多选删 5-10 条很常见（清整段调试消息 / 清掉一段无关 AI 闲聊），
    // 公网隧道 ~600ms RTT × 10 条 = 6 秒滚动，中途 timeout 的概率不低。
    // 改成 per-iteration try/catch：成功的 add 到 set 继续往后跑；记下第一
    // 条错误的 message 用于 notice；走完循环统一把 deletedMessageIdSet 拍进
    // cache，部分成功也写回，UI 与服务端一致。
    let firstError: unknown = null;
    selectionActionBusyRef.current = true;
    setSelectionActionPending("delete");

    try {
      if (threadContext) {
        let nextLocalState: ReturnType<
          typeof readLocalChatMessageActionState
        > | null = null;

        for (const message of messagesToDelete) {
          if (isLocalOnlyMessage(message)) {
            nextLocalState = hideLocalChatMessage(message.id);
            clearTransientMessageState(message.id);
            deletedMessageIdSet.add(message.id);
            continue;
          }

          try {
            if (threadContext.type === "group") {
              await deleteGroupMessage(threadContext.id, message.id, baseUrl);
            } else {
              await deleteConversationMessage(
                threadContext.id,
                message.id,
                baseUrl,
              );
            }
            deletedMessageIdSet.add(message.id);
            clearTransientMessageState(message.id);
          } catch (error) {
            if (firstError === null) {
              firstError = error;
            }
          }
        }

        if (nextLocalState) {
          setHiddenMessageIds(nextLocalState.hiddenMessageIds);
          setRecalledMessageIds(nextLocalState.recalledMessageIds);
        }

        // perf：和 deleteMutation / 姊妹 handleRecallSelectedMessages 对齐
        // —— updateXxxMessageQueries 已经把要删的消息从 cache 里 filter 掉，
        // 再走一次 invalidate(["app-group-messages" / "app-conversation-messages"])
        // 会强制 GET /messages?limit=N 把刚刚 filter 完的 cache 拉回来重渲染
        // 一次（多选删除一次能命中几十条 → 几十次 RTT 上没价值的 N 条 payload）。
        // recall 路径只 invalidate conversations 让 chat-list 同步 lastMessage 即可；
        // 删除走完全一样的后端 emit 路径，messages cache 本地 filter 已经是
        // canonical 形态。同 group-chat-thread-panel sendMutation R3 同款修法。
        if (deletedMessageIdSet.size > 0 && threadContext.type === "group") {
          updateGroupMessageQueries(
            threadContext.id,
            (current) =>
              current?.filter((item) => !deletedMessageIdSet.has(item.id)) ??
              current,
          );
        } else if (deletedMessageIdSet.size > 0) {
          updateConversationMessageQueries(
            threadContext.id,
            (current) =>
              current?.filter((item) => !deletedMessageIdSet.has(item.id)) ??
              current,
          );
        }

        if (deletedMessageIdSet.size > 0) {
          await queryClient.invalidateQueries({
            queryKey: ["app-conversations", baseUrl],
          });
        }
      } else {
        let nextState = readLocalChatMessageActionState();
        for (const message of messagesToDelete) {
          nextState = hideLocalChatMessage(message.id);
          clearTransientMessageState(message.id);
          deletedMessageIdSet.add(message.id);
        }

        setHiddenMessageIds(nextState.hiddenMessageIds);
        setRecalledMessageIds(nextState.recalledMessageIds);
      }

      const failedCount = messagesToDelete.length - deletedMessageIdSet.size;
      if (failedCount === 0) {
        resetSelectionMode();
        setActionNotice({
          message:
            messagesToDelete.length === 1
              ? t(msg`已删除 1 条消息。`)
              : t(msg`已删除 ${messagesToDelete.length} 条消息。`),
          tone: "success",
        });
      } else if (deletedMessageIdSet.size === 0) {
        setActionNotice({
          message:
            firstError instanceof Error && firstError.message
              ? firstError.message
              : t(msg`批量删除失败，请稍后再试。`),
          tone: "danger",
          actionLabel: t(msg`继续删除所选消息`),
          onAction: () => {
            void handleDeleteSelectedMessages();
          },
          secondaryActionLabel: errorActionLabel,
          onSecondaryAction: onErrorAction ?? undefined,
        });
      } else {
        // 部分成功：cache 已经过滤掉成功的，selectedMessageIds 的 messages-changed
        // effect (line ~615) 会顺手清掉成功条 → 留下未删的几条等用户重试或取消。
        setActionNotice({
          message:
            firstError instanceof Error && firstError.message
              ? t(msg`已删除 ${deletedMessageIdSet.size} 条；剩余 ${failedCount} 条未删除：${firstError.message}`)
              : t(msg`已删除 ${deletedMessageIdSet.size} 条；剩余 ${failedCount} 条删除失败，请稍后再试。`),
          tone: "danger",
          actionLabel: t(msg`继续删除剩余消息`),
          onAction: () => {
            void handleDeleteSelectedMessages();
          },
          secondaryActionLabel: errorActionLabel,
          onSecondaryAction: onErrorAction ?? undefined,
        });
      }
    } finally {
      selectionActionBusyRef.current = false;
      setSelectionActionPending(null);
    }
  };

  const handleRecallSelectedMessages = async () => {
    const messagesToRecall = [...recallableSelectedMessages];
    if (!messagesToRecall.length || !threadContext) {
      return;
    }
    if (selectionActionBusyRef.current) {
      return;
    }

    const skippedCount = selectedMessages.length - messagesToRecall.length;
    selectionActionBusyRef.current = true;
    setSelectionActionPending("recall");
    // 走查新一轮 R1：和姊妹 handleDeleteSelectedMessages 同款问题——原版
    // for-await 撤回 N 条，第 K 条失败（公网隧道 timeout / cloud token 续期 /
    // 服务端窗口期判定 GROUP_MESSAGE_RECALL_EXPIRED）就把整段循环 throw 出去，
    // 前 K-1 条服务端已经成功撤回但 cache 完全没动（updateXxxMessageQueries
    // 在 catch 之外的 throw 点之后）。结果：群里 K-1 条已经显示为"[消息已撤回]"，
    // 但当前用户的本地 UI 还显示正文；下次 mount refetch 才发现差异，跟"撤回"
    // 的"立即可见"语义严重不符。改成 per-iteration try/catch，把成功的累计
    // 到 recalledMessageMap，循环走完之后统一拍回 cache；notice 分 all-success
    // / partial / total-fail 三档展示。

    let firstError: unknown = null;
    const groupRecalled = new Map<string, GroupMessage>();
    const directRecalled = new Map<string, Message>();
    try {
      if (threadContext.type === "group") {
        for (const message of messagesToRecall) {
          try {
            const recalledMessage = await recallGroupMessage(
              threadContext.id,
              message.id,
              baseUrl,
            );
            groupRecalled.set(recalledMessage.id, recalledMessage);
          } catch (error) {
            if (firstError === null) {
              firstError = error;
            }
          }
        }

        if (groupRecalled.size > 0) {
          updateGroupMessageQueries(
            threadContext.id,
            (current): GroupMessage[] | undefined =>
              current?.map(
                (item): GroupMessage => groupRecalled.get(item.id) ?? item,
              ) ?? current,
          );
        }
      } else {
        for (const message of messagesToRecall) {
          try {
            const recalledMessage = await recallConversationMessage(
              threadContext.id,
              message.id,
              baseUrl,
            );
            directRecalled.set(recalledMessage.id, recalledMessage);
          } catch (error) {
            if (firstError === null) {
              firstError = error;
            }
          }
        }

        if (directRecalled.size > 0) {
          updateConversationMessageQueries(
            threadContext.id,
            (current): Message[] | undefined =>
              current?.map(
                (item): Message => directRecalled.get(item.id) ?? item,
              ) ?? current,
          );
        }
      }

      const succeededCount =
        threadContext.type === "group" ? groupRecalled.size : directRecalled.size;
      const failedCount = messagesToRecall.length - succeededCount;
      if (failedCount === 0) {
        resetSelectionMode();
        setActionNotice({
          message:
            skippedCount > 0
              ? t(msg`已撤回 ${messagesToRecall.length} 条消息，另有 ${skippedCount} 条不支持撤回。`)
              : messagesToRecall.length === 1
                ? t(msg`已撤回 1 条消息。`)
                : t(msg`已撤回 ${messagesToRecall.length} 条消息。`),
          tone: "success",
        });
      } else if (succeededCount === 0) {
        setActionNotice({
          message:
            firstError instanceof Error && firstError.message
              ? firstError.message
              : t(msg`批量撤回失败，请稍后再试。`),
          tone: "danger",
          actionLabel: t(msg`继续撤回所选消息`),
          onAction: () => {
            void handleRecallSelectedMessages();
          },
          secondaryActionLabel: errorActionLabel,
          onSecondaryAction: onErrorAction ?? undefined,
        });
      } else {
        setActionNotice({
          message:
            firstError instanceof Error && firstError.message
              ? t(msg`已撤回 ${succeededCount} 条；剩余 ${failedCount} 条未撤回：${firstError.message}`)
              : t(msg`已撤回 ${succeededCount} 条；剩余 ${failedCount} 条撤回失败，请稍后再试。`),
          tone: "danger",
          actionLabel: t(msg`继续撤回剩余消息`),
          onAction: () => {
            void handleRecallSelectedMessages();
          },
          secondaryActionLabel: errorActionLabel,
          onSecondaryAction: onErrorAction ?? undefined,
        });
      }

      if (succeededCount > 0) {
        await queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      }
    } finally {
      selectionActionBusyRef.current = false;
      setSelectionActionPending(null);
    }
  };

  return (
    <div className={isDesktop ? "space-y-4" : "space-y-3.5"}>
      {entryNotice && pendingDirectCallInvite ? (
        <DigitalHumanEntryNotice
          tone={entryNotice.tone}
          message={entryNotice.message}
          continueLabel={entryNotice.continueLabel}
          voiceLabel={entryNotice.voiceLabel}
          onContinue={() => {
            resetEntryGuard();
            setPendingDirectCallInvite(null);
            onOpenDirectCallInvite?.({
              kind: "video",
              source: pendingDirectCallInvite.source,
            });
          }}
          onSwitchToVoice={() => {
            resetEntryGuard();
            setPendingDirectCallInvite(null);
            onOpenDirectCallInvite?.({
              kind: "voice",
              source: pendingDirectCallInvite.source,
            });
          }}
        />
      ) : null}
      {actionNotice ? (
        <InlineNotice
          className="flex items-center justify-between gap-3 text-xs"
          tone={actionNotice.tone}
        >
          <span>{actionNotice.message}</span>
          {actionNotice.actionLabel && actionNotice.onAction ? (
            <div className="flex items-center gap-2">
              <InlineNoticeActionButton
                label={actionNotice.actionLabel}
                onClick={actionNotice.onAction}
              />
              {actionNotice.secondaryActionLabel &&
              actionNotice.onSecondaryAction ? (
                <InlineNoticeActionButton
                  label={actionNotice.secondaryActionLabel}
                  onClick={actionNotice.onSecondaryAction}
                />
              ) : null}
            </div>
          ) : actionNotice.tone === "danger" &&
            errorActionLabel &&
            onErrorAction ? (
            <InlineNoticeActionButton
              label={errorActionLabel}
              onClick={onErrorAction}
            />
          ) : null}
        </InlineNotice>
      ) : null}
      {hasOlderMessages || loadingOlderMessages ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => onLoadOlderMessages?.()}
            disabled={!onLoadOlderMessages || loadingOlderMessages}
            className={
              isDesktop
                ? "inline-flex min-h-9 items-center justify-center rounded-full border border-black/6 bg-[#f7f7f7] px-4 text-[12px] text-[color:var(--text-secondary)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                : "inline-flex min-h-8 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-white/92 px-3.5 text-[12px] text-[color:var(--text-secondary)] shadow-[0_4px_12px_rgba(15,23,42,0.08)] transition active:bg-[color:var(--surface-card-hover)] disabled:opacity-60"
            }
          >
            {loadingOlderMessages ? t(msg`正在加载更早消息...`) : t(msg`查看更多消息`)}
          </button>
        </div>
      ) : null}
      {selectionMode ? (
        isDesktop ? (
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-[12px] border border-black/6 bg-[#f7f7f7] px-4 py-3 backdrop-blur">
            <div>
              <div className="text-sm text-[color:var(--text-primary)]">
                {t(msg`已选择 ${selectedMessageIds.length} 条消息`)}
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                {t(msg`\`Shift + 点击\` 可连续选择消息`)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={resetSelectionMode}
                className="rounded-full"
              >
                {t(msg`取消`)}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !selectedMessageIds.length || selectionActionPending !== null
                }
                onClick={handleFavoriteSelectedMessages}
                className="rounded-full"
              >
                {selectionActionPending === "favorite"
                  ? t(msg`收藏中...`)
                  : t(msg`收藏`)}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  !selectedMessageIds.length || selectionActionPending !== null
                }
                onClick={() => setForwardMessages(selectedMessages)}
                className="rounded-full"
              >
                {t(msg`转发`)}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !recallableSelectedMessages.length ||
                  selectionActionPending !== null
                }
                onClick={() => {
                  void handleRecallSelectedMessages();
                }}
                className="rounded-full"
              >
                {selectionActionPending === "recall"
                  ? t(msg`撤回中...`)
                  : t(msg`撤回`)}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !selectedMessageIds.length || selectionActionPending !== null
                }
                onClick={() => {
                  void handleDeleteSelectedMessages();
                }}
                className="rounded-full text-[#d74b45]"
              >
                {selectionActionPending === "delete"
                  ? t(msg`删除中...`)
                  : t(msg`删除`)}
              </Button>
            </div>
          </div>
        ) : (
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[color:var(--border-subtle)] bg-[rgba(247,247,247,0.94)] px-2 py-2 backdrop-blur-xl">
            <button
              type="button"
              onClick={resetSelectionMode}
              className="flex h-9 min-w-14 items-center justify-start rounded-[10px] px-2.5 text-[15px] text-[color:var(--text-secondary)] transition active:bg-white/80"
            >
              {t(msg`取消`)}
            </button>
            <div className="text-[15px] font-medium text-[#111827]">
              {t(msg`已选 ${selectedMessageIds.length} 条`)}
            </div>
            <button
              type="button"
              disabled={
                !visibleMessages.length || selectionActionPending !== null
              }
              onClick={handleToggleSelectAllMessages}
              className="flex h-9 min-w-16 items-center justify-end rounded-[10px] px-2.5 text-[15px] font-medium text-[#07c160] transition active:bg-white/80 disabled:text-[#b8b8b8]"
            >
              {allVisibleSelected ? t(msg`全不选`) : t(msg`全选`)}
            </button>
          </div>
        )
      ) : null}
      {visibleMessages.map((message, index) => {
        const previousMessage =
          index > 0 ? visibleMessages[index - 1] : undefined;
        const showTimestamp = shouldShowMessageTimestamp(
          message.createdAt,
          previousMessage?.createdAt,
        );
        const isUser = message.senderType === "user";
        const previousIsSystemLike =
          previousMessage?.type === "system" ||
          previousMessage?.senderType === "system" ||
          (previousMessage?.senderType === "user" &&
            recalledMessageIdSet.has(previousMessage.id));
        const isRecalled =
          message.senderType === "user" && recalledMessageIdSet.has(message.id);
        const isSystem =
          message.type === "system" || message.senderType === "system";
        // 服务端 recall（chat.service.ts:506 / group.service.ts:579）把消息
        // 整段重写成 senderType=system + 中文 text "你撤回了一条消息"，refresh
        // 后或 socket echo 路径都拿到的是这个原文。en/ja/ko locale 用户会原样
        // 看到中文。客户端识别 marker，仍走 buildRecalledMessageNotice 翻译输出。
        const isServerSideRecalled = isServerRecalledSystemMessage(message);
        const isHighlighted = message.id === resolvedHighlightedMessageId;
        const isSelected = selectedMessageIdSet.has(message.id);
        const continuesMessageRun =
          !isDesktop &&
          !showTimestamp &&
          !previousIsSystemLike &&
          !!previousMessage &&
          previousMessage.senderType === message.senderType &&
          (previousMessage.senderType === "user" ||
            (previousMessage.senderName ?? "") === (message.senderName ?? ""));
        const showSenderName =
          !isUser &&
          groupMode &&
          showGroupMemberNicknames &&
          (isDesktop ||
            showTimestamp ||
            previousMessage?.senderType !== message.senderType ||
            (previousMessage?.senderName ?? "") !== (message.senderName ?? ""));
        const isSharedHistoryMessage = importedSharedMessageIdSet.has(
          message.id,
        );
        const reminderRecord = messageReminderMap.get(message.id);
        const replyContent = extractChatReplyMetadata(message.text);
        const displayText =
          isUser && !isSystem
            ? replyContent.body.trim()
            : sanitizeDisplayedChatText(message.text);
        const replyPreview = replyContent.reply;
        const directCallInvite = parseDirectCallInviteMessage(displayText);
        const groupCallInvite = parseGroupCallInviteMessage(displayText);
        const groupRelaySummary = parseGroupRelaySummaryMessage(displayText);
        const sharedHistorySummary =
          parseSharedHistorySummaryMessage(t, displayText);
        const timestampLabel = detailedTimestampMode
          ? formatDetailedMessageTimestamp(message.createdAt)
          : isDesktop
            ? formatDesktopMessageTimestamp(message.createdAt)
            : formatMessageTimestamp(message.createdAt);

        if (isSystem || isRecalled) {
          return (
            <div
              key={message.id}
              className={isDesktop ? "space-y-2" : "space-y-1.5"}
            >
              {resolvedUnreadMarkerMessageId === message.id ? (
                <UnreadMarkerDivider
                  id={unreadMarkerDomId}
                  label={resolvedUnreadMarkerLabel}
                  variant={variant}
                />
              ) : null}
              {showTimestamp ? (
                <MessageTimestampDivider
                  isDesktop={isDesktop}
                  label={timestampLabel}
                  detailedTimestampMode={detailedTimestampMode}
                  onToggle={() =>
                    setDetailedTimestampMode((current) => !current)
                  }
                />
              ) : null}
              {sharedHistorySummary && !isRecalled && !isServerSideRecalled ? (
                <SharedHistorySummaryNotice
                  id={`chat-message-${message.id}`}
                  summary={sharedHistorySummary}
                  isDesktop={isDesktop}
                  highlighted={isHighlighted}
                />
              ) : (
                <InlineNotice
                  id={`chat-message-${message.id}`}
                  className={`mx-auto max-w-[84%] text-center text-[color:var(--text-muted)] ${
                    isDesktop
                      ? "rounded-full border border-black/6 bg-[#f7f7f7] px-3 py-1.5 text-[11px]"
                      : "rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 py-1 text-[10px] leading-5 shadow-none"
                  } ${isHighlighted ? "ring-2 ring-[rgba(255,191,0,0.34)] ring-offset-2 ring-offset-transparent" : ""}`}
                  tone="muted"
                >
                  {isRecalled
                    ? buildRecalledMessageNotice(t, message)
                    : isServerSideRecalled
                      ? // 服务端 recall 是 owner-only：能落到这个 marker 的一定是
                        // 用户自己撤回的。actor 走"你"分支，复用同款翻译。
                        buildRecalledMessageNotice(t, {
                          ...message,
                          senderType: "user",
                        })
                      : displayText}
                </InlineNotice>
              )}
            </div>
          );
        }

        return (
          <div key={message.id}>
            {resolvedUnreadMarkerMessageId === message.id ? (
              <UnreadMarkerDivider
                id={unreadMarkerDomId}
                label={resolvedUnreadMarkerLabel}
                variant={variant}
              />
            ) : null}
            {showTimestamp ? (
              <MessageTimestampDivider
                isDesktop={isDesktop}
                label={timestampLabel}
                detailedTimestampMode={detailedTimestampMode}
                onToggle={() => setDetailedTimestampMode((current) => !current)}
              />
            ) : null}
            <div
              id={`chat-message-${message.id}`}
              onClick={
                selectionMode
                  ? (event) => {
                      if (isDesktop && event.shiftKey) {
                        selectMessageRangeTo(message.id);
                        return;
                      }

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
              data-yj-msg-bubble={isDesktop ? undefined : "1"}
              className={`rounded-[16px] transition-[background-color,box-shadow] duration-300 ${
                isDesktop
                  ? "space-y-1.5 px-2 py-1.5"
                  : `yj-no-callout ${
                      continuesMessageRun
                        ? "space-y-0.5 px-1.5 py-0.5"
                        : "space-y-1 px-1.5 py-1"
                    }`
              } ${
                isHighlighted
                  ? "bg-[rgba(255,224,120,0.15)] shadow-[0_0_0_1px_rgba(255,191,0,0.16)]"
                  : isSelected
                    ? "bg-[rgba(7,193,96,0.06)] shadow-[0_0_0_1px_rgba(7,193,96,0.12)]"
                    : ""
              }`}
            >
              <div
                className={`flex items-start ${
                  isDesktop
                    ? "gap-2.5"
                    : continuesMessageRun
                      ? "gap-1.5"
                      : "gap-2"
                } ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && selectionMode ? (
                  <SelectionToggle
                    checked={isSelected}
                    onClick={() => toggleSelectedMessage(message.id)}
                  />
                ) : null}
                {!isUser ? (
                  resolveCharacterAvatarAction(
                    message,
                    isDesktop,
                    selectionMode,
                    threadContext?.type,
                  ) ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        const avatarAction = resolveCharacterAvatarAction(
                          message,
                          isDesktop,
                          selectionMode,
                          threadContext?.type,
                        );
                        if (avatarAction === "desktop-popover") {
                          handleDesktopAvatarClick(event, message);
                          return;
                        }

                        handleMobileCharacterAvatarClick(event, message);
                      }}
                      className="rounded-xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(7,193,96,0.34)] focus-visible:ring-offset-2"
                      aria-label={t(msg`查看${message.senderName?.trim() || t(msg`联系人`)}资料`)}
                    >
                      <AvatarChip
                        name={message.senderName}
                        src={message.senderAvatar}
                        size={isDesktop ? "wechat" : "sm"}
                      />
                    </button>
                  ) : (
                    <AvatarChip
                      name={message.senderName}
                      src={message.senderAvatar}
                      size={isDesktop ? "wechat" : "sm"}
                    />
                  )
                ) : null}
                <div
                  className={`flex ${isDesktop ? "max-w-[78%]" : "max-w-[79%]"} flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  {isSharedHistoryMessage ? (
                    <div
                      className={cn(
                        isDesktop
                          ? "mb-1 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium"
                          : "mb-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium",
                        isUser
                          ? "bg-[rgba(148,163,184,0.18)] text-[color:var(--text-secondary)]"
                          : "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-secondary)]",
                      )}
                    >
                      {t(msg`聊天记录`)}
                    </div>
                  ) : null}
                  {showSenderName ? (
                    <div
                      className={`px-1 text-[color:var(--text-muted)] ${
                        isDesktop
                          ? "mb-1 text-[10px]"
                          : "mb-px px-0.5 text-[10px] leading-4"
                      }`}
                    >
                      {message.senderName}
                    </div>
                  ) : null}
                  {replyPreview ? (
                    <ReplyQuoteCard
                      messageId={replyPreview.messageId}
                      senderName={replyPreview.senderName}
                      previewText={
                        replyPreview.quotedText?.trim() ||
                        replyPreview.previewText
                      }
                      modeLabel={
                        replyPreview.quotedText ? t(msg`部分引用`) : undefined
                      }
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
                      maxSize={isDesktop ? 160 : 124}
                      onMediaReady={onMediaReady}
                    />
                  ) : message.type === "image" &&
                    message.attachment?.kind === "image" ? (
                    <ImageMessage
                      url={resolveAttachmentUrl(message.attachment.url)}
                      label={message.attachment.fileName || displayText}
                      variant={variant}
                      maxSize={isDesktop ? 180 : 136}
                      // 真实图片宽高，让浏览器在加载完成前就按 aspect-ratio
                      // 占位，避免 60 条历史里每张图加载完再撑高一格 → 整列
                      // 跳动（CLS）。server 早已返回，但之前没透传进 <img>。
                      width={message.attachment.width}
                      height={message.attachment.height}
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => openImagePreview(message.id)
                      }
                      onMediaReady={onMediaReady}
                    />
                  ) : message.type === "file" &&
                    message.attachment?.kind === "file" ? (
                    <FileAttachmentMessage
                      attachment={message.attachment}
                      variant={variant}
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => openAttachment(message)
                      }
                    />
                  ) : message.type === "voice" &&
                    message.attachment?.kind === "voice" ? (
                    <VoiceMessage
                      attachment={message.attachment}
                      url={resolveAttachmentUrl(message.attachment.url)}
                      own={isUser}
                      variant={variant}
                    />
                  ) : message.type === "contact_card" &&
                    message.attachment?.kind === "contact_card" ? (
                    <ContactCardMessage
                      attachment={message.attachment}
                      variant={variant}
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => openAttachment(message)
                      }
                    />
                  ) : message.type === "location_card" &&
                    message.attachment?.kind === "location_card" ? (
                    <LocationCardMessage
                      attachment={message.attachment}
                      variant={variant}
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => openAttachment(message)
                      }
                    />
                  ) : message.type === "note_card" &&
                    message.attachment?.kind === "note_card" ? (
                    <NoteCardMessage
                      attachment={message.attachment}
                      variant={variant}
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => openAttachment(message)
                      }
                    />
                  ) : message.type === "feed_post_card" &&
                    message.attachment?.kind === "feed_post_card" ? (
                    <FeedPostCardMessage
                      attachment={message.attachment}
                      variant={variant}
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => openAttachment(message)
                      }
                    />
                  ) : directCallInvite ? (
                    <DirectCallInviteMessage
                      own={isUser}
                      variant={variant}
                      invite={directCallInvite}
                      onOpen={
                        selectionMode ||
                        threadContext?.type !== "direct" ||
                        !onOpenDirectCallInvite
                          ? undefined
                          : () =>
                              handleOpenDirectCallInviteCard({
                                kind: directCallInvite.kind,
                                source: directCallInvite.source,
                              })
                      }
                    />
                  ) : groupCallInvite ? (
                    <GroupCallInviteMessage
                      own={isUser}
                      variant={variant}
                      invite={groupCallInvite}
                      onOpen={
                        selectionMode ||
                        threadContext?.type !== "group" ||
                        !onOpenGroupCallInvite
                          ? undefined
                          : () =>
                              onOpenGroupCallInvite({
                                kind: groupCallInvite.kind,
                                source: groupCallInvite.source,
                                activeCount:
                                  groupCallInvite.status === "ended"
                                    ? null
                                    : (groupCallInvite.activeCount?.current ??
                                      null),
                                totalCount:
                                  groupCallInvite.status === "ended"
                                    ? null
                                    : (groupCallInvite.activeCount?.total ??
                                      null),
                                recordedAt:
                                  groupCallInvite.status === "ended"
                                    ? null
                                    : groupCallInvite.recordedAt,
                                snapshotRecordedAt:
                                  groupCallInvite.status === "ended"
                                    ? null
                                    : groupCallInvite.snapshotRecordedAt,
                              })
                      }
                    />
                  ) : groupRelaySummary ? (
                    <GroupRelaySummaryMessage
                      own={isUser}
                      variant={variant}
                      summary={groupRelaySummary}
                      onOpen={
                        selectionMode ||
                        threadContext?.type !== "group" ||
                        !threadContext.id
                          ? undefined
                          : () => {
                              const query = new URLSearchParams({
                                miniProgram: "group-relay",
                                sourceGroupId: threadContext.id,
                                sourceGroupName:
                                  threadContext.title ??
                                  groupRelaySummary.sourceGroupName,
                              });
                              void navigate({
                                to: isDesktop
                                  ? "/tabs/mini-programs"
                                  : "/discover/mini-programs",
                                search: `?${query.toString()}`,
                              });
                            }
                      }
                    />
                  ) : (
                    <div
                      className={`rounded-[17px] px-3.5 py-2 text-[15px] leading-6 ${
                        isUser
                          ? isDesktop
                            ? "bg-[#95ec69] text-[#111827] shadow-none"
                            : "bg-[#95ec69] text-[#111827] [animation:bubble-in_220ms_cubic-bezier(0.22,1,0.36,1)] shadow-none"
                          : isDesktop
                            ? "border border-black/6 bg-white text-[color:var(--text-primary)] shadow-none"
                            : "border border-[color:var(--border-subtle)] bg-white text-[color:var(--text-primary)] shadow-none"
                      } whitespace-pre-wrap break-words`}
                    >
                      {renderTextWithMentions(displayText)}
                    </div>
                  )}
                  {reminderRecord ? (
                    <div
                      className={`px-1 text-[#8c8c8c] ${
                        isDesktop
                          ? "mt-1 text-[11px]"
                          : "mt-px px-0.5 text-[10px]"
                      }`}
                    >
                      {t(msg`已设提醒 · ${formatReminderSummary(t, reminderRecord.remindAt)}`)}
                    </div>
                  ) : null}
                  {isUser && !selectionMode && message.localStatus === "failed" ? (
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-1 text-[#d74b45]",
                        isDesktop
                          ? "mt-1 text-[11px]"
                          : "mt-px px-0.5 text-[10px]",
                      )}
                    >
                      <span>{t(msg`发送失败`)}</span>
                      {onRetryMessage ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRetryMessage(message);
                          }}
                          className="rounded-full px-1.5 font-medium text-[#d74b45] transition hover:bg-[#fdeceb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(215,75,69,0.22)]"
                        >
                          {t(msg`重试`)}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {isUser ? (
                  isDesktop && !selectionMode ? (
                    <button
                      type="button"
                      onClick={handleDesktopOwnerAvatarClick}
                      className="rounded-xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(7,193,96,0.34)] focus-visible:ring-offset-2"
                      aria-label={t(msg`查看${ownerName?.trim() || t(msg`我的`)}资料`)}
                    >
                      <AvatarChip
                        name={ownerName ?? t(msg`我`)}
                        src={ownerAvatar}
                        size={isDesktop ? "wechat" : "sm"}
                      />
                    </button>
                  ) : (
                    <AvatarChip
                      name={ownerName ?? t(msg`我`)}
                      src={ownerAvatar}
                      size={isDesktop ? "wechat" : "sm"}
                    />
                  )
                ) : null}
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
      {selectionMode && !isDesktop ? (
        <div className="sticky bottom-0 z-20 border-t border-[color:var(--border-subtle)] bg-[rgba(247,247,247,0.96)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] pt-2 backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-1.5">
            <SelectionModeActionButton
              icon={<Star size={17} />}
              label={
                selectionActionPending === "favorite"
                  ? t(msg`收藏中`)
                  : t(msg`收藏`)
              }
              disabled={
                !selectedMessageIds.length || selectionActionPending !== null
              }
              onClick={handleFavoriteSelectedMessages}
            />
            <SelectionModeActionButton
              icon={<Forward size={17} />}
              label={t(msg`转发`)}
              disabled={
                !selectedMessageIds.length || selectionActionPending !== null
              }
              onClick={() => setForwardMessages(selectedMessages)}
            />
            <SelectionModeActionButton
              icon={<RotateCcw size={17} />}
              label={
                selectionActionPending === "recall"
                  ? t(msg`撤回中`)
                  : t(msg`撤回`)
              }
              disabled={
                !recallableSelectedMessages.length ||
                selectionActionPending !== null
              }
              onClick={() => {
                void handleRecallSelectedMessages();
              }}
            />
            <SelectionModeActionButton
              icon={<Trash2 size={17} />}
              label={
                selectionActionPending === "delete"
                  ? t(msg`删除中`)
                  : t(msg`删除`)
              }
              danger
              disabled={
                !selectedMessageIds.length || selectionActionPending !== null
              }
              onClick={() => {
                void handleDeleteSelectedMessages();
              }}
            />
          </div>
        </div>
      ) : null}
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
          onQuoteSelection={
            onReplyMessage &&
            getPartialQuoteSourceText(contextMenuState.message)
              ? () => {
                  handleOpenQuoteSelection(contextMenuState.message);
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
            handleToggleReminder(contextMenuState.message);
            setContextMenuState(null);
          }}
          reminderLabel={
            messageReminderMap.has(contextMenuState.message.id)
              ? t(msg`取消提醒`)
              : t(msg`提醒`)
          }
          onCopyText={() => {
            void copyToClipboard(
              buildClipboardText(t, contextMenuState.message),
              t(msg`消息内容已复制。`),
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
              ? t(msg`取消收藏`)
              : t(msg`收藏消息`)
          }
          onAddToStickers={
            canAddMessageToStickers(contextMenuState.message)
              ? () => {
                  addToStickerMutation.mutate(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          onOpenAttachment={
            getOpenableAttachment(contextMenuState.message)
              ? () => {
                  openAttachment(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          openAttachmentLabel={resolveOpenAttachmentLabel(
            t,
            contextMenuState.message,
            variant,
          )}
          onSaveAttachment={
            getSaveableAttachment(contextMenuState.message)
              ? () => {
                  saveAttachment(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          saveAttachmentLabel={resolveSaveAttachmentLabel(
            t,
            contextMenuState.message,
            "desktop",
          )}
          onCopySender={() => {
            void copyToClipboard(
              buildClipboardSender(t, contextMenuState.message),
              t(msg`发送者名称已复制。`),
            );
            setContextMenuState(null);
          }}
          onSpeakAloud={
            extractSpeakableMessageText(contextMenuState.message)
              ? () => {
                  void speakMessage(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          speakAloudLabel={
            speakingMessageId === contextMenuState.message.id
              ? t(msg`停止朗读`)
              : t(msg`朗读`)
          }
          onRecall={
            canRecallMessage(contextMenuState.message, threadContext)
              ? () => {
                  triggerRecallMessage(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          recallLabel={t(msg`撤回`)}
          onDelete={() => {
            handleDeleteMessage(contextMenuState.message);
            setContextMenuState(null);
          }}
          deleteLabel={t(msg`删除`)}
        />
      ) : null}
      <MobileMessageActionSheet
        open={Boolean(mobileActionMessage)}
        onClose={() => setMobileActionMessage(null)}
        title={
          mobileActionMessage?.senderType === "user"
            ? t(msg`我的消息`)
            : t(msg`消息操作`)
        }
        preview={
          mobileActionMessage
            ? {
                senderName:
                  groupMode && mobileActionMessage.senderType !== "user"
                    ? buildClipboardSender(t, mobileActionMessage)
                    : undefined,
                text: buildClipboardText(t, mobileActionMessage),
                own: mobileActionMessage.senderType === "user",
              }
            : undefined
        }
        onReply={
          mobileActionMessage && onReplyMessage
            ? () => {
                onReplyMessage(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        onQuoteSelection={
          mobileActionMessage &&
          onReplyMessage &&
          getPartialQuoteSourceText(mobileActionMessage)
            ? () => {
                handleOpenQuoteSelection(mobileActionMessage);
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
                handleToggleReminder(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        reminderLabel={
          mobileActionMessage && messageReminderMap.has(mobileActionMessage.id)
            ? t(msg`取消提醒`)
            : t(msg`提醒`)
        }
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
            ? t(msg`取消收藏`)
            : t(msg`收藏`)
        }
        onCopy={() => {
          if (!mobileActionMessage) {
            return;
          }

          void copyToClipboard(
            buildClipboardText(t, mobileActionMessage),
            t(msg`消息内容已复制。`),
          );
          setMobileActionMessage(null);
        }}
        onCopySender={
          mobileActionMessage &&
          groupMode &&
          mobileActionMessage.senderType !== "user"
            ? () => {
                void copyToClipboard(
                  buildClipboardSender(t, mobileActionMessage),
                  t(msg`发送者名称已复制。`),
                );
                setMobileActionMessage(null);
              }
            : undefined
        }
        onSpeakAloud={
          mobileActionMessage &&
          extractSpeakableMessageText(mobileActionMessage)
            ? () => {
                void speakMessage(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        speakAloudLabel={
          mobileActionMessage && speakingMessageId === mobileActionMessage.id
            ? t(msg`停止朗读`)
            : t(msg`朗读`)
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
          mobileActionMessage
            ? resolveOpenAttachmentLabel(t, mobileActionMessage, variant)
            : t(msg`打开附件`)
        }
        onSaveAttachment={
          mobileActionMessage && getSaveableAttachment(mobileActionMessage)
            ? () => {
                saveAttachment(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        saveAttachmentLabel={
          mobileActionMessage
            ? resolveSaveAttachmentLabel(t, mobileActionMessage, "mobile")
            : t(msg`保存附件`)
        }
        onRecall={
          mobileActionMessage &&
          canRecallMessage(mobileActionMessage, threadContext)
            ? () => {
                triggerRecallMessage(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        recallLabel={t(msg`撤回`)}
        onDelete={
          mobileActionMessage
            ? () => {
                handleDeleteMessage(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        deleteLabel={t(msg`删除`)}
      />
      <MobileMessageReminderSheet
        open={Boolean(reminderTargetMessage)}
        variant={variant}
        previewText={
          reminderTargetMessage
            ? buildClipboardText(t, reminderTargetMessage)
            : undefined
        }
        options={reminderOptions}
        onClose={() => setReminderTargetMessage(null)}
        onSelect={handleSelectReminder}
      />
      <MessageQuoteSelectionSheet
        open={Boolean(quoteSelectionMessage)}
        variant={variant}
        senderName={
          quoteSelectionMessage
            ? buildClipboardSender(t, quoteSelectionMessage)
            : t(msg`消息`)
        }
        messageText={
          quoteSelectionMessage
            ? (getPartialQuoteSourceText(quoteSelectionMessage) ?? "")
            : ""
        }
        onClose={() => setQuoteSelectionMessage(null)}
        onConfirm={handleConfirmQuoteSelection}
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
            saveAttachmentFile({
              url: activeImage.url,
              fileName: activeImage.fileName || activeImage.label || "image",
              kind: "image",
            })
          }
          onOpenInWindow={
            isDesktop
              ? () => {
                  // 上面 openImagePreview 那条同款链有 .catch 兜底（line 1803）。
                  // 这两个 overlay 上的「在独立窗口打开 / 打印」按钮一直只有
                  // .then 没 .catch —— openDesktopChatImageViewerWindowOnDemand
                  // 本质是 dynamic import + 跨窗口 IPC，chunk 拉失败 / 桌面
                  // shell 没起来都会让它 reject，这条 rejection 走 void 直接
                  // 落 window.unhandledrejection 污染 telemetry。补一条
                  // ActionNotice 反馈 + .catch 吞掉冒泡。
                  void openDesktopChatImageViewerWindowOnDemand({
                    imageUrl: activeImage.url,
                    title: activeImage.fileName || activeImage.label || t(msg`图片`),
                    meta: activeImage.meta,
                    returnTo: activeImage.returnTo,
                    items: standaloneViewerItems,
                    activeId: activeImage.id,
                  })
                    .then((opened) => {
                      if (opened) {
                        setActionNotice({
                          message: t(msg`已在独立窗口打开图片。`),
                          tone: "success",
                        });
                        return;
                      }

                      setActionNotice({
                        message: t(msg`浏览器阻止了新窗口，请检查弹窗权限。`),
                        tone: "danger",
                      });
                    })
                    .catch(() => {
                      setActionNotice({
                        message: t(msg`打开独立窗口失败，请稍后再试。`),
                        tone: "danger",
                      });
                    });
                }
              : undefined
          }
          onPrint={
            isDesktop
              ? () => {
                  void openDesktopChatImageViewerWindowOnDemand({
                    imageUrl: activeImage.url,
                    title: activeImage.fileName || activeImage.label || t(msg`图片`),
                    meta: activeImage.meta,
                    returnTo: activeImage.returnTo,
                    items: standaloneViewerItems,
                    activeId: activeImage.id,
                    autoPrint: true,
                  })
                    .then((opened) => {
                      if (opened) {
                        setActionNotice({
                          message: t(msg`已打开图片打印视图。`),
                          tone: "success",
                        });
                        return;
                      }

                      setActionNotice({
                        message: t(msg`浏览器阻止了打印窗口，请检查弹窗权限。`),
                        tone: "danger",
                      });
                    })
                    .catch(() => {
                      setActionNotice({
                        message: t(msg`打开打印窗口失败，请稍后再试。`),
                        tone: "danger",
                      });
                    });
                }
              : undefined
          }
        />
      ) : null}
      {activeLocation ? (
        <LocationViewerOverlay
          variant={variant}
          attachment={activeLocation.attachment}
          onClose={() => setLocationViewerMessageId(null)}
          onLocate={() => {
            setLocationViewerMessageId(null);
            jumpToMessage(activeLocation.id);
          }}
          onShareOrCopy={() => {
            void shareLocationSummary(activeLocation.attachment);
          }}
        />
      ) : null}
      {activeNote ? (
        <NoteViewerOverlay
          attachment={activeNote.attachment}
          previewImageUrl={activeNote.previewImageUrl}
          baseUrl={baseUrl}
          onClose={() => setNoteViewerMessageId(null)}
          onLocate={() => {
            setNoteViewerMessageId(null);
            jumpToMessage(activeNote.id);
          }}
          onShareOrCopy={() => {
            void shareNoteSummary(activeNote.attachment);
          }}
        />
      ) : null}
      {forwardMessages?.length ? (
        <Suspense fallback={null}>
          <DesktopMessageForwardDialog
            open
            messages={forwardPreviewItems}
            conversations={forwardConversationsQuery.data ?? []}
            supportsSeparateMode={forwardMessages.every(canForwardMessage)}
            variant={variant}
            loading={forwardConversationsQuery.isLoading}
            pending={forwardMutation.isPending}
            error={
              forwardConversationsQuery.error instanceof Error
                ? forwardConversationsQuery.error.message
                : null
            }
            onClose={() => setForwardMessages(null)}
            onForward={(conversation, mode) => {
              forwardMutation.mutate({ conversation, mode });
            }}
          />
        </Suspense>
      ) : null}
      {isDesktop && desktopAvatarPopover ? (
        <Suspense fallback={null}>
          {desktopAvatarPopover.kind === "owner" ? (
            <DesktopMessageAvatarPopover
              anchorElement={desktopAvatarPopover.anchorElement}
              kind="owner"
              onClose={() => setDesktopAvatarPopover(null)}
            />
          ) : (
            <DesktopMessageAvatarPopover
              anchorElement={desktopAvatarPopover.anchorElement}
              kind="character"
              characterId={desktopAvatarPopover.characterId}
              fallbackName={desktopAvatarPopover.senderName}
              fallbackAvatar={desktopAvatarPopover.senderAvatar}
              threadContext={threadContext}
              onClose={() => setDesktopAvatarPopover(null)}
            />
          )}
        </Suspense>
      ) : null}
    </div>
  );
}

function canOpenDesktopAvatarPopover(
  message: ChatRenderableMessage,
  isDesktop: boolean,
  selectionMode: boolean,
) {
  return (
    isDesktop &&
    !selectionMode &&
    message.senderType === "character" &&
    Boolean(message.senderId?.trim())
  );
}

function resolveCharacterAvatarAction(
  message: ChatRenderableMessage,
  isDesktop: boolean,
  selectionMode: boolean,
  threadType?: "direct" | "group",
) {
  if (canOpenDesktopAvatarPopover(message, isDesktop, selectionMode)) {
    return "desktop-popover" as const;
  }

  if (
    selectionMode ||
    message.senderType !== "character" ||
    !message.senderId?.trim()
  ) {
    return null;
  }

  // 走查 R1：原版仅 threadType==="direct" 时才挂 mobile-profile，群聊里点
  // 角色头像 → button 路径走不进 → fallback 到不可交互的 <AvatarChip>，移
  // 动端群聊里完全没法点头像查资料。group-chat-details-page 的成员九宫格 R1
  // 已经把死链补成跳 /character/$id，桌面群聊也走 desktop-popover 弹层有
  // 反馈；唯独移动端群聊消息列表里头像还是哑的。补成 group / direct 同源
  // mobile-profile，handleMobileCharacterAvatarClick 已经 buildCharacterProfileHash
  // 带 returnPath 回得来。
  return threadType ? ("mobile-profile" as const) : null;
}

function UnreadMarkerDivider({
  id,
  label,
  variant,
}: {
  id: string;
  label: string;
  variant: "mobile" | "desktop";
}) {
  const isDesktop = variant === "desktop";

  return (
    <div
      id={id}
      className={`flex items-center ${isDesktop ? "gap-3 py-1.5" : "gap-2.5 py-1"}`}
    >
      <div
        className={
          isDesktop
            ? "h-px flex-1 bg-black/8"
            : "h-px flex-1 bg-[rgba(7,193,96,0.1)]"
        }
      />
      <div
        className={
          isDesktop
            ? "rounded-full border border-black/6 bg-[#f7f7f7] px-3 py-1 text-[11px] font-medium text-[#7f7f7f]"
            : "rounded-full border border-[rgba(7,193,96,0.12)] bg-[color:var(--surface-panel)] px-2.5 py-0.5 text-[10px] font-medium text-[#059652]"
        }
      >
        {label}
      </div>
      <div
        className={
          isDesktop
            ? "h-px flex-1 bg-black/10"
            : "h-px flex-1 bg-[rgba(7,193,96,0.1)]"
        }
      />
    </div>
  );
}

function MessageTimestampDivider({
  isDesktop,
  label,
  detailedTimestampMode,
  onToggle,
}: {
  isDesktop: boolean;
  label: string;
  detailedTimestampMode: boolean;
  onToggle: () => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <div
      className={isDesktop ? "pb-2 pt-1 text-center" : "pb-2 pt-1 text-center"}
    >
      <button
        type="button"
        onClick={onToggle}
        className={
          isDesktop
            ? "inline-flex items-center rounded-full border border-black/6 bg-[rgba(242,242,242,0.96)] px-3 py-1 text-[11px] text-[#8c8c8c] transition hover:bg-white"
            : "inline-flex rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-2.5 py-0.5 text-[10px] text-[color:var(--text-muted)] transition active:bg-[color:var(--surface-card-hover)]"
        }
        aria-label={
          detailedTimestampMode
        ? t(msg`切换为简略时间显示`)
        : t(msg`切换为完整日期显示`)
        }
      >
        {label}
      </button>
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

  const currentDate = new Date(currentTimestamp);
  const previousDate = new Date(previousTimestamp);
  if (!isSameCalendarDay(currentDate, previousDate)) {
    return true;
  }

  return currentTimestamp - previousTimestamp >= 5 * 60 * 1000;
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function areStringListsEqual(
  left: readonly string[],
  right: readonly string[],
) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
}

function filterStableStringIds(
  current: string[],
  predicate: (value: string) => boolean,
) {
  const next = current.filter(predicate);
  return areStringListsEqual(current, next) ? current : next;
}

function filterStableMessageList(
  current: ChatRenderableMessage[] | null,
  predicate: (value: ChatRenderableMessage) => boolean,
) {
  if (!current?.length) {
    return null;
  }

  const next = current.filter(predicate);
  if (!next.length) {
    return null;
  }

  if (
    next.length === current.length &&
    next.every((item, index) => item.id === current[index]?.id)
  ) {
    return current;
  }

  return next;
}

function parseSharedHistorySummaryMessage(t: Translator, text: string) {
  const normalized = text.trim();
  const match = normalized.match(/^已分享你和(.+?)的(\d+)条聊天记录$/); // i18n-ignore-line: protocol data regex
  if (!match) {
    return null;
  }

  return {
    participantName: match[1]?.trim() || t(msg`对方`),
    count: Number(match[2]) || 0,
  };
}

function SharedHistorySummaryNotice({
  id,
  summary,
  isDesktop,
  highlighted,
}: {
  id: string;
  summary: {
    participantName: string;
    count: number;
  };
  isDesktop: boolean;
  highlighted: boolean;
}) {
  const t = useRuntimeTranslator();
  return (
    <div
      id={id}
      className={cn(
        "mx-auto max-w-[84%] border text-center",
        isDesktop
          ? "rounded-[16px] border-black/6 bg-[linear-gradient(180deg,#fafafa,#f2f2f2)] px-4 py-3"
          : "rounded-[14px] border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3.5 py-2.5",
        highlighted
          ? "ring-2 ring-[rgba(255,191,0,0.34)] ring-offset-2 ring-offset-transparent"
          : "",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center gap-2 font-medium text-[color:var(--text-primary)]",
          isDesktop ? "text-[12px]" : "text-[11px]",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-black/5 text-[color:var(--text-secondary)]",
            isDesktop ? "h-6 w-6" : "h-5 w-5",
          )}
        >
          <FileText size={13} />
        </span>
        <span>{t(msg`聊天记录已导入当前群聊`)}</span>
      </div>
      <div
        className={cn(
          "text-[color:var(--text-muted)]",
          isDesktop
            ? "mt-1.5 text-[11px] leading-5"
            : "mt-1 text-[10px] leading-[18px]",
        )}
      >
        {t(msg`来自你和 ${summary.participantName} 的 ${summary.count} 条消息`)}
      </div>
    </div>
  );
}

function buildRecalledMessageNotice(
  t: Translator,
  message: ChatRenderableMessage,
) {
  const actor =
    message.senderType === "user"
      ? t(msg`你`)
      : message.senderName?.trim() || t(msg`对方`);
  return t(msg`${actor}撤回了一条消息`);
}

function buildReminderOptions(
  t: Translator,
  now: Date,
): MobileMessageReminderOption[] {
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const tonight = new Date(now);
  tonight.setHours(20, 0, 0, 0);
  // 20:00 已过的话推到第二天，并把 label 改成「明晚 20:00」——
  // 否则用户会看到 label「今晚 20:00」、副标题却写「明天 20:00」，前后矛盾。
  const tonightPassed = tonight.getTime() <= now.getTime();
  if (tonightPassed) {
    tonight.setDate(tonight.getDate() + 1);
  }
  const tonightLabel = tonightPassed
    ? t(msg`明晚 20:00`)
    : t(msg`今晚 20:00`);

  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  return [
    {
      id: "one-hour",
      label: t(msg`1 小时后`),
      detail: formatReminderSummary(t, oneHourLater.toISOString()),
      remindAt: oneHourLater.toISOString(),
    },
    {
      id: "tonight",
      label: tonightLabel,
      detail: formatReminderSummary(t, tonight.toISOString()),
      remindAt: tonight.toISOString(),
    },
    {
      id: "tomorrow-morning",
      label: t(msg`明天上午 09:00`),
      detail: formatReminderSummary(t, tomorrowMorning.toISOString()),
      remindAt: tomorrowMorning.toISOString(),
    },
  ];
}

function formatReminderSummary(t: Translator, remindAt: string) {
  const date = new Date(remindAt);
  if (Number.isNaN(date.getTime())) {
    return t(msg`稍后`);
  }

  const now = new Date();
  const sameYear = now.getFullYear() === date.getFullYear();
  const sameMonth = now.getMonth() === date.getMonth();
  const sameDate = now.getDate() === date.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    tomorrow.getFullYear() === date.getFullYear() &&
    tomorrow.getMonth() === date.getMonth() &&
    tomorrow.getDate() === date.getDate();

  const timeLabel = date.toLocaleTimeString(getActiveLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (sameYear && sameMonth && sameDate) {
    return t(msg`今天 ${timeLabel}`);
  }

  if (isTomorrow) {
    return t(msg`明天 ${timeLabel}`);
  }

  const dateLabel = date.toLocaleDateString(getActiveLocale(), {
    month: "numeric",
    day: "numeric",
  });
  return `${dateLabel} ${timeLabel}`;
}

type Translator = ReturnType<typeof useRuntimeTranslator>;

function buildClipboardSender(t: Translator, message: ChatRenderableMessage) {
  if (message.senderType === "user") {
    return t(msg`我`);
  }

  return message.senderName?.trim() || t(msg`群成员`);
}

function buildClipboardText(t: Translator, message: ChatRenderableMessage) {
  const replyContent = extractChatReplyMetadata(message.text);
  const displayedText =
    message.senderType === "user"
      ? replyContent.body.trim()
      : sanitizeDisplayedChatText(message.text).trim();

  if (displayedText) {
    return displayedText;
  }

  return (
    resolveMessageSemanticPreview(message, {
      maxChars: 400,
      bracketedFallback: true,
    }) || t(msg`消息`)
  );
}

function buildForwardPreviewText(t: Translator, message: ChatRenderableMessage) {
  const forwardedText = getForwardMessageText(message);
  if (forwardedText) {
    return forwardedText;
  }

  return buildClipboardText(t, message);
}

function resolveForwardTypeLabel(t: Translator, message: ChatRenderableMessage) {
  if (message.type === "image") {
    return t(msg`图片`);
  }

  if (message.type === "file") {
    return t(msg`文件`);
  }

  if (message.type === "voice") {
    return t(msg`语音`);
  }

  if (message.type === "contact_card") {
    return t(msg`名片`);
  }

  if (message.type === "location_card") {
    return t(msg`位置`);
  }

  if (message.type === "note_card") {
    return t(msg`笔记`);
  }

  if (message.type === "sticker") {
    return t(msg`表情`);
  }

  return t(msg`消息`);
}

function resolveOpenAttachmentLabel(
  t: Translator,
  message: ChatRenderableMessage,
  variant: "mobile" | "desktop",
) {
  if (message.type === "image") {
    return variant === "desktop" ? t(msg`预览图片`) : t(msg`查看图片`);
  }

  if (message.type === "file") {
    return t(msg`打开文件`);
  }

  if (message.type === "contact_card") {
    return t(msg`查看名片`);
  }

  if (message.type === "location_card") {
    return t(msg`查看位置`);
  }

  if (message.type === "note_card") {
    return variant === "desktop" ? t(msg`打开笔记`) : t(msg`查看笔记摘要`);
  }

  return t(msg`打开附件`);
}

function resolveSaveAttachmentLabel(
  t: Translator,
  message: ChatRenderableMessage,
  variant: "mobile" | "desktop",
) {
  if (message.type === "contact_card") {
    return isNativeMobileShareSurface({
      isDesktopLayout: variant === "desktop",
    })
      ? t(msg`系统分享`)
      : t(msg`复制名片`);
  }

  if (message.type === "location_card") {
    return isNativeMobileShareSurface({
      isDesktopLayout: variant === "desktop",
    })
      ? t(msg`系统分享`)
      : t(msg`复制位置`);
  }

  if (message.type === "image") {
    return variant === "mobile" ? t(msg`保存图片`) : t(msg`另存图片`);
  }

  if (message.type === "file") {
    return variant === "mobile" ? t(msg`保存文件`) : t(msg`另存文件`);
  }

  return variant === "mobile" ? t(msg`保存附件`) : t(msg`另存为`);
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
  t: Translator,
  message: ChatRenderableMessage,
  groupMode: boolean,
  threadContext: ChatMessageListProps["threadContext"],
) {
  const senderName = buildClipboardSender(t, message);
  const description = buildClipboardText(t, message);
  // 之前用 window.location.pathname 拼乐观 to——桌面端 pathname 永远是
  // /tabs/chat（conversationId 在 hash 里），结果乐观记录的 to 长成
  // /tabs/chat?...#chat-message-XXX，没有会话标识。搜索结果点击 → 跳到
  // /tabs/chat 但 conversationId 解析不出来 → 工作区选不出会话。
  // 后端返回的 to 走的是 mobile 风格 /chat/<id>#chat-message-<id>，
  // 搜索导航解析器会把它转换成桌面端 hash，这里跟齐就行。
  const threadPath = threadContext?.id
    ? threadContext.type === "group"
      ? `/group/${threadContext.id}#chat-message-${message.id}`
      : `/chat/${threadContext.id}#chat-message-${message.id}`
    : `#chat-message-${message.id}`;

  return {
    id: `favorite-${buildFavoriteSourceId(message.id)}`,
    sourceId: buildFavoriteSourceId(message.id),
    category: "messages" as const,
    title: senderName,
    description,
    meta: formatMessageTimestamp(message.createdAt),
    to: threadPath,
    badge: groupMode ? t(msg`群聊消息`) : t(msg`聊天消息`),
    avatarName: senderName,
    // 走查新一轮 R3：群聊消息的 senderAvatar 是真实角色头像 URL（群成员可能
    // 是多个不同 character，每个有自己的形象），原版只塞 avatarName 走
    // AvatarChip 的 seed 灰底首字 fallback，收藏列表里所有群消息看上去都是
    // 一堆"阿"/"林"/"老"的色块，互相分不清；FavoriteRecord 早就有 avatarSrc
    // 字段（contracts/favorites.ts:20）+ 渲染端（mobile-favorites-page:563 /
    // favorites-page:913）已经 <AvatarChip src={item.avatarSrc} /> 走通了，
    // 只是 builder 没把数据接上。null → undefined 避免 contract 类型不匹配。
    avatarSrc: message.senderAvatar ?? undefined,
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

  if (
    message.type === "contact_card" &&
    message.attachment?.kind === "contact_card"
  ) {
    return message.attachment;
  }

  if (
    message.type === "location_card" &&
    message.attachment?.kind === "location_card"
  ) {
    return message.attachment;
  }

  if (
    message.type === "note_card" &&
    message.attachment?.kind === "note_card"
  ) {
    return message.attachment;
  }

  if (
    message.type === "feed_post_card" &&
    message.attachment?.kind === "feed_post_card"
  ) {
    return message.attachment;
  }

  return null;
}

function getSaveableAttachment(
  message: ChatRenderableMessage,
): SaveableAttachment | null {
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

  if (
    message.type === "contact_card" &&
    message.attachment?.kind === "contact_card"
  ) {
    return message.attachment;
  }

  if (
    message.type === "location_card" &&
    message.attachment?.kind === "location_card"
  ) {
    return message.attachment;
  }

  return null;
}

function getPartialQuoteSourceText(message: ChatRenderableMessage) {
  const text = sanitizeDisplayedChatText(message.text).trim();
  return text || null;
}

function canForwardMessage(message: ChatRenderableMessage) {
  return message.type !== "sticker";
}

function canRecallMessage(
  message: ChatRenderableMessage,
  threadContext?: {
    id: string;
    type: "direct" | "group";
    title?: string;
  },
) {
  return Boolean(
    threadContext &&
    message.senderType === "user" &&
    !message.id.startsWith("local_"),
  );
}

function isLocalOnlyMessage(message: ChatRenderableMessage) {
  return message.id.startsWith("local_");
}

async function forwardMessageToConversation(input: {
  t: Translator;
  baseUrl?: string;
  conversation: ConversationListItem;
  message: ChatRenderableMessage;
}) {
  if (isPersistedGroupConversation(input.conversation)) {
    const payload = buildGroupForwardPayload(input.t, input.message);
    if (!payload) {
      throw new Error(input.t(msg`当前消息暂不支持转发到群聊。`));
    }

    await sendGroupMessage(input.conversation.id, payload, input.baseUrl);
    return;
  }

  const payload = buildDirectForwardPayload(
    input.t,
    input.conversation,
    input.message,
  );
  if (!payload) {
    throw new Error(input.t(msg`这条单聊暂时没有可用的角色目标，无法完成转发。`));
  }

  joinConversationRoom({ conversationId: input.conversation.id });
  emitChatMessage(payload);
}

async function forwardMergedMessagesToConversation(input: {
  t: Translator;
  baseUrl?: string;
  conversation: ConversationListItem;
  messages: ChatRenderableMessage[];
}) {
  const mergedText = buildMergedForwardText(input.t, input.messages);
  if (!mergedText) {
    throw new Error(input.t(msg`当前没有可合并转发的消息内容。`));
  }

  if (isPersistedGroupConversation(input.conversation)) {
    await sendGroupMessage(
      input.conversation.id,
      {
        text: mergedText,
      },
      input.baseUrl,
    );
    return;
  }

  const characterId = input.conversation.participants[0];
  if (!characterId) {
    throw new Error(input.t(msg`这条单聊暂时没有可用的角色目标，无法完成转发。`));
  }

  joinConversationRoom({ conversationId: input.conversation.id });
  emitChatMessage({
    conversationId: input.conversation.id,
    characterId,
    text: mergedText,
  });
}

function buildGroupForwardPayload(
  t: Translator,
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

  if (message.type === "voice" && message.attachment?.kind === "voice") {
    return {
      type: "voice",
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

  if (
    message.type === "note_card" &&
    message.attachment?.kind === "note_card"
  ) {
    return {
      type: "note_card",
      text,
      attachment: message.attachment,
    };
  }

  if (message.type === "sticker") {
    return null;
  }

  return {
    text: text ?? buildClipboardText(t, message),
  };
}

function buildDirectForwardPayload(
  t: Translator,
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

  if (message.type === "voice" && message.attachment?.kind === "voice") {
    return {
      conversationId: conversation.id,
      characterId,
      type: "voice",
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

  if (
    message.type === "note_card" &&
    message.attachment?.kind === "note_card"
  ) {
    return {
      conversationId: conversation.id,
      characterId,
      type: "note_card",
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
    text: text ?? buildClipboardText(t, message),
  };
}

function resolveCustomStickerUploadSource(
  message: ChatRenderableMessage,
  resolveUrl: (url: string) => string,
) {
  if (
    message.type === "image" &&
    message.attachment?.kind === "image" &&
    message.attachment.url
  ) {
    return {
      url: resolveUrl(message.attachment.url),
      fileName: message.attachment.fileName,
      mimeType: message.attachment.mimeType,
      label: stripFileExtension(message.attachment.fileName) || translateRuntimeMessage(msg`图片表情`),
    };
  }

  if (
    message.type === "sticker" &&
    message.attachment?.kind === "sticker" &&
    message.attachment.url
  ) {
    return {
      url: resolveUrl(message.attachment.url),
      fileName:
        message.attachment.label ||
        `${message.attachment.stickerId}.${guessMessageAttachmentExtension(message.attachment.mimeType)}`,
      mimeType: message.attachment.mimeType,
      label: message.attachment.label || message.attachment.stickerId,
    };
  }

  return null;
}

function canAddMessageToStickers(message: ChatRenderableMessage) {
  return (
    (message.type === "image" && message.attachment?.kind === "image") ||
    (message.type === "sticker" && message.attachment?.kind === "sticker")
  );
}

function stripFileExtension(fileName?: string | null) {
  return fileName?.replace(/\.[^.]+$/, "").trim() || "";
}

function guessMessageAttachmentExtension(mimeType?: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

function buildMergedForwardText(t: Translator, messages: ChatRenderableMessage[]) {
  const sections = messages
    .map((message) => {
      const sender = buildClipboardSender(t, message);
      const body = buildClipboardText(t, message).trim();
      if (!body) {
        return null;
      }

      return `${sender}: ${body}`;
    })
    .filter((item): item is string => Boolean(item));

  if (!sections.length) {
    return "";
  }

  return [t(msg`[聊天记录]`), ...sections].join("\n");
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

    if (segment.kind === "sticker") {
      return (
        <img
          key={`sticker-${index}-${segment.packId}-${segment.stickerId}`}
          src={segment.src}
          alt={segment.label}
          draggable={false}
          loading="lazy"
          decoding="async"
          className="inline-block h-7 w-7 align-[-0.45em] object-contain"
        />
      );
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
  modeLabel,
  align,
  variant,
  onJump,
  disabled = false,
}: {
  messageId: string;
  senderName: string;
  previewText: string;
  modeLabel?: string;
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
      className={`w-full overflow-hidden border text-left transition ${
        align === "right"
          ? isDesktop
            ? "mb-2 rounded-[12px] border-[rgba(110,168,62,0.24)] bg-[rgba(237,248,223,0.96)] px-3 py-2 text-[color:var(--text-primary)]"
            : "mb-1.5 rounded-[11px] border-[rgba(22,163,74,0.14)] bg-[rgba(247,251,248,0.96)] px-2.5 py-1.5 text-[color:var(--text-primary)]"
          : isDesktop
            ? "mb-2 rounded-[12px] border-black/6 bg-[#f7f7f7] px-3 py-2 text-[color:var(--text-primary)]"
            : "mb-1.5 rounded-[11px] border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-2.5 py-1.5 text-[color:var(--text-primary)]"
      } ${disabled ? "cursor-default opacity-90" : "hover:opacity-90"}`}
    >
      <div className={`flex items-center ${isDesktop ? "gap-2" : "gap-1.5"}`}>
        <div
          className={`truncate font-medium text-[color:var(--text-secondary)] ${
            isDesktop ? "text-[11px]" : "text-[10px]"
          }`}
        >
          {translateRuntimeMessage(msg`回复`)} {senderName}
        </div>
        {modeLabel ? (
          <div
            className={`rounded-full bg-black/5 text-[color:var(--text-muted)] ${
              isDesktop ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-px text-[9px]"
            }`}
          >
            {modeLabel}
          </div>
        ) : null}
      </div>
      <div
        className={`line-clamp-2 text-[color:var(--text-muted)] ${
          isDesktop
            ? "mt-1 text-[12px] leading-5"
            : "mt-0.5 text-[11px] leading-[18px]"
        }`}
      >
        {renderTextWithMentions(previewText)}
      </div>
    </button>
  );
}

function ImageMessage({
  url,
  label,
  variant,
  maxSize,
  width,
  height,
  onOpen,
  onMediaReady,
}: {
  url: string;
  label: string;
  variant: "mobile" | "desktop";
  maxSize: number;
  width?: number;
  height?: number;
  onOpen?: () => void;
  onMediaReady?: () => void;
}) {
  const isDesktop = variant === "desktop";
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [url]);

  if (loadFailed) {
    return (
      <div
        className={`flex items-center justify-center px-3 text-center text-xs text-[color:var(--text-secondary)] ${
          isDesktop
            ? "h-28 w-28 rounded-[22px] border border-white/80 bg-white/90 shadow-[var(--shadow-soft)]"
            : "h-24 w-24 rounded-[16px] border border-[color:var(--border-subtle)] bg-white"
        }`}
      >
        {label || translateRuntimeMessage(msg`[图片]`)}
      </div>
    );
  }

  // 用真实宽高按 maxSize 等比缩放占位：CLS 修复关键 — 图片加载前
  // <img> 就有 aspect-ratio + 真实显示尺寸，60 条历史的图陆续完成
  // 解码时不会让列高一格一格往上长。server 没给尺寸时回退到老行为
  // （maxWidth + maxHeight 双向 cap，加载完才知道高度）。
  const renderedSize =
    width && height && width > 0 && height > 0
      ? width >= height
        ? { width: maxSize, height: Math.round((height / width) * maxSize) }
        : { width: Math.round((width / height) * maxSize), height: maxSize }
      : null;

  const image = (
    <img
      src={url}
      alt={label}
      width={renderedSize?.width}
      height={renderedSize?.height}
      onError={() => setLoadFailed(true)}
      onLoad={onMediaReady}
      className={`bg-white object-cover shadow-none ${
        isDesktop
          ? "rounded-[16px] border border-black/6"
          : "rounded-[13px] border border-[color:var(--border-subtle)]"
      }`}
      style={
        renderedSize
          ? {
              width: `${renderedSize.width}px`,
              height: `${renderedSize.height}px`,
              maxWidth: `${maxSize}px`,
              maxHeight: `${maxSize}px`,
            }
          : { maxWidth: `${maxSize}px`, maxHeight: `${maxSize}px` }
      }
      loading="lazy"
      decoding="async"
    />
  );

  if (!onOpen) {
    return image;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`transition hover:opacity-95 ${isDesktop ? "cursor-zoom-in" : ""}`}
      aria-label={`${translateRuntimeMessage(isDesktop ? msg`预览图片` : msg`查看图片`)} ${label}`}
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
      className={`mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium transition ${
        checked
          ? "border-[rgba(7,193,96,0.2)] bg-[#07c160] text-white shadow-[0_4px_10px_rgba(7,193,96,0.16)]"
          : "border-[color:var(--border-subtle)] bg-white/92 text-transparent hover:border-[rgba(7,193,96,0.24)]"
      }`}
      aria-label={checked ? translateRuntimeMessage(msg`取消选择消息`) : translateRuntimeMessage(msg`选择消息`)}
    >
      ✓
    </button>
  );
}

function ContactCardMessage({
  attachment,
  variant,
  onOpen,
}: {
  attachment: Extract<MessageAttachment, { kind: "contact_card" }>;
  variant: "mobile" | "desktop";
  onOpen?: () => void;
}) {
  const isDesktop = variant === "desktop";
  const recommendation = attachment.recommendationMetadata;
  const card = (
    <div
      className={`bg-white shadow-none ${
        isDesktop
          ? "w-[220px] rounded-[16px] border border-black/6 p-3"
          : "w-[204px] rounded-[13px] border border-[color:var(--border-subtle)] p-2.5"
      }`}
    >
      {recommendation ? (
        <div
          className={`inline-flex rounded-full bg-[#07c160]/10 px-2 py-0.5 text-[10px] font-medium text-[#07c160] ${
            isDesktop ? "mb-2.5" : "mb-2"
          }`}
        >
          {recommendation.badgeLabel || translateRuntimeMessage(msg`继续聊`)}
        </div>
      ) : null}
      <div className={`flex items-center ${isDesktop ? "gap-3" : "gap-2.5"}`}>
        <AvatarChip
          name={attachment.name}
          src={attachment.avatar}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-medium text-[color:var(--text-primary)] ${
              isDesktop ? "text-sm" : "text-[13px]"
            }`}
          >
            {attachment.name}
          </div>
          <div
            className={`truncate text-[color:var(--text-muted)] ${
              isDesktop ? "mt-0.5 text-xs" : "mt-px text-[11px]"
            }`}
          >
            {attachment.relationship || translateRuntimeMessage(msg`世界联系人`)}
          </div>
        </div>
      </div>
      {recommendation?.reasonSummary ? (
        <div
          className={`line-clamp-2 text-[color:var(--text-secondary)] ${
            isDesktop
              ? "mt-2 text-[12px] leading-5"
              : "mt-2 text-[11px] leading-4.5"
          }`}
        >
          {recommendation.reasonSummary}
        </div>
      ) : null}
      <div
        className={`flex items-center gap-2 uppercase tracking-[0.12em] text-[color:var(--text-muted)] ${
          isDesktop ? "mt-3 text-[11px]" : "mt-2.5 text-[10px]"
        }`}
      >
        <ContactRound size={12} />
        <span>{recommendation ? translateRuntimeMessage(msg`推荐联系人`) : translateRuntimeMessage(msg`角色名片`)}</span>
      </div>
    </div>
  );

  if (!onOpen) {
    return card;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition hover:opacity-95"
      aria-label={`${translateRuntimeMessage(msg`查看名片`)} ${attachment.name}`}
    >
      {card}
    </button>
  );
}

function NoteCardMessage({
  attachment,
  variant,
  onOpen,
}: {
  attachment: Extract<MessageAttachment, { kind: "note_card" }>;
  variant: "mobile" | "desktop";
  onOpen?: () => void;
}) {
  const isDesktop = variant === "desktop";
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  // 拉最新笔记数据让缩略图跟原笔记编辑实时同步；笔记被删除时静默回退 snapshot，
  // 不在历史气泡上突然标红。
  const noteQuery = useQuery({
    queryKey: ["favorite-note", baseUrl, attachment.noteId],
    queryFn: () => getFavoriteNote(attachment.noteId, baseUrl),
    enabled: Boolean(attachment.noteId),
    staleTime: 30_000,
    retry: false,
  });
  const noteDocument = noteQuery.data;
  const title =
    (noteDocument?.title?.trim() || attachment.title || "").trim();
  const excerpt = noteDocument?.excerpt?.trim() || attachment.excerpt || "";
  const tags = noteDocument?.tags?.length ? noteDocument.tags : attachment.tags;
  const assets = noteDocument?.assets ?? attachment.assets;
  const previewImage = assets.find((asset) => asset.kind === "image");
  const fileCount = assets.filter((asset) => asset.kind === "file").length;
  const card = (
    <div
      className={`overflow-hidden bg-white shadow-none ${
        isDesktop
          ? "w-[248px] rounded-[16px] border border-black/6"
          : "w-[220px] rounded-[13px] border border-[color:var(--border-subtle)]"
      }`}
    >
      {previewImage?.url ? (
        <div className={isDesktop ? "h-[104px]" : "h-[92px]"}>
          <img
            src={previewImage.url}
            alt={title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div
          className={`flex items-end bg-[linear-gradient(160deg,#f3f6f5_0%,#dde6e3_100%)] ${
            isDesktop ? "h-[104px] px-3.5 py-3.5" : "h-[92px] px-3 py-3"
          }`}
        >
          <div
            className={`rounded-[14px] border border-[rgba(15,23,42,0.08)] bg-white/88 text-[color:var(--text-muted)] shadow-[var(--shadow-soft)] ${
              isDesktop
                ? "px-3 py-2 text-[11px] tracking-[0.16em]"
                : "px-2.5 py-1.5 text-[10px] tracking-[0.14em]"
            }`}
          >
            {translateRuntimeMessage(msg`收藏笔记`)}
          </div>
        </div>
      )}
      <div
        className={
          isDesktop ? "space-y-2.5 px-3.5 py-3.5" : "space-y-2 px-3 py-3"
        }
      >
        <div
          className={`line-clamp-2 font-medium text-[color:var(--text-primary)] ${
            isDesktop ? "text-sm leading-6" : "text-[13px] leading-5"
          }`}
        >
          {title}
        </div>
        <div
          className={`line-clamp-3 text-[color:var(--text-muted)] ${
            isDesktop ? "text-xs leading-5" : "text-[11px] leading-[18px]"
          }`}
        >
          {excerpt || translateRuntimeMessage(msg`点击查看完整笔记`)}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.06)] pt-2.5">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]"
              >
                #{tag}
              </span>
            ))}
          </div>
          <div className="shrink-0 text-[10px] tracking-[0.12em] text-[color:var(--text-dim)]">
            {fileCount ? `${fileCount} ${translateRuntimeMessage(msg`个文件`)}` : translateRuntimeMessage(msg`笔记`)}
          </div>
        </div>
      </div>
    </div>
  );

  if (!onOpen) {
    return card;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition hover:opacity-95"
      aria-label={`${translateRuntimeMessage(variant === "desktop" ? msg`打开笔记` : msg`查看笔记摘要`)} ${title}`}
    >
      {card}
    </button>
  );
}

/**
 * 视频号转发卡片：用户/角色把视频号一条帖子转发进来时显示的卡片，
 * 点开走 buildDesktopChannelsRouteHash 跳到该 postId 的视频号详情。
 *
 * 没有封面就用 video / audio / 文本图标兜底。
 */
function FeedPostCardMessage({
  attachment,
  variant,
  onOpen,
}: {
  attachment: Extract<MessageAttachment, { kind: "feed_post_card" }>;
  variant: "mobile" | "desktop";
  onOpen?: () => void;
}) {
  const isDesktop = variant === "desktop";
  const cover = attachment.coverUrl
    ? resolveAppMediaUrl(attachment.coverUrl)
    : null;
  // 走查 2026-05-17 新会话 R5：attachment.excerpt 由 server forwardChannelPost
  // ToChat 写入，直接是 post.text.slice(0,160)，没过 stripToolCallSyntax。
  // AI 生成的视频号偶发把 <tool_call>...</tool_call> / [TOOL_CALL] 等当成
  // 正文落到 post.text，转发卡会把这串 XML/JSON 当成"动态摘要"原样塞到
  // line-clamp-2 里炸开。视频号 home / 评论 sheet 都已经走 stripToolCallSyntax
  // 过滤，这条聊天里"二次展现"的入口也要对齐。
  // 走查 R5：跟视频号卡封面 img 同款问题——minimax cover 偶发 404 / cloud-api
  // 反代 token 边界 401 / 资源被回收。原本浏览器原生 broken-image icon 直接
  // 占满整条 feed_post_card，对方收到的转发卡看着像「这条视频号坏了」实际只是
  // 缩略图没拉到。回退到无 cover 的渐变 + mediaLabel 占位（同款视觉），用户至少
  // 能看到这条是「视频/音频/图文」并点开尝试播放。
  const [coverFailed, setCoverFailed] = useState(false);
  const mediaLabel = (() => {
    if (attachment.mediaType === "video") return translateRuntimeMessage(msg`视频`);
    if (attachment.mediaType === "audio") return translateRuntimeMessage(msg`音频`);
    if (attachment.mediaType === "image") return translateRuntimeMessage(msg`图文`);
    // 走查 R2（本轮）：text 类型走到这条默认分支只能拿"视频号"——但那是品牌名、
    // 跟 video/audio/image 的"内容形态标签"风格不一致。yuanzui R3 测试 text 帖被
    // 转发到聊天里时占位卡上写"视频号"，对方看不出这是文字动态。给 text 一条
    // 明确的"文字动态"标签，对齐其它形态。
    if (attachment.mediaType === "text") return translateRuntimeMessage(msg`文字动态`);
    return translateRuntimeMessage(msg`视频号`);
  })();
  const card = (
    <div
      className={`overflow-hidden bg-white shadow-none ${
        isDesktop
          ? "w-[260px] rounded-[16px] border border-black/6"
          : "w-[228px] rounded-[13px] border border-[color:var(--border-subtle)]"
      }`}
    >
      {cover && !coverFailed ? (
        <div className={isDesktop ? "h-[140px]" : "h-[124px]"}>
          <img
            src={cover}
            alt={attachment.title ?? attachment.authorName}
            loading="lazy"
            decoding="async"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div
          className={`flex items-center justify-center bg-[linear-gradient(140deg,#1a1a1a_0%,#3b3b3b_100%)] text-white ${
            isDesktop ? "h-[140px]" : "h-[124px]"
          }`}
        >
          <span className="text-xs uppercase tracking-[0.18em] opacity-80">
            {mediaLabel}
          </span>
        </div>
      )}
      <div className={isDesktop ? "space-y-2 px-3.5 py-3" : "space-y-1.5 px-3 py-3"}>
        <div
          className={`line-clamp-2 font-medium text-[color:var(--text-primary)] ${
            isDesktop ? "text-sm leading-5" : "text-[13px] leading-5"
          }`}
        >
          {attachment.title?.trim() ||
            stripToolCallSyntax(attachment.excerpt ?? "") ||
            translateRuntimeMessage(msg`视频号动态`)}
        </div>
        <div
          className={`flex items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.06)] pt-2 text-[color:var(--text-muted)] ${
            isDesktop ? "text-[11px]" : "text-[10px]"
          }`}
        >
          <span className="truncate">
            {translateRuntimeMessage(msg`视频号 · ${attachment.authorName}`)}
          </span>
          <span className="shrink-0 tracking-[0.12em] text-[color:var(--brand-primary)]">
            {translateRuntimeMessage(msg`查看`)}
          </span>
        </div>
      </div>
    </div>
  );

  if (!onOpen) {
    return card;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition hover:opacity-95"
      aria-label={`${translateRuntimeMessage(msg`打开视频号`)} ${attachment.authorName}`}
    >
      {card}
    </button>
  );
}

function FileAttachmentMessage({
  attachment,
  variant,
  onOpen,
}: {
  attachment: Extract<MessageAttachment, { kind: "file" }>;
  variant: "mobile" | "desktop";
  onOpen?: () => void;
}) {
  const isDesktop = variant === "desktop";
  const card = (
    <div
      className={`bg-white shadow-none ${
        isDesktop
          ? "w-[220px] rounded-[16px] border border-black/6 p-3"
          : "w-[204px] rounded-[13px] border border-[color:var(--border-subtle)] p-2.5"
      }`}
    >
      <div className={`flex items-center ${isDesktop ? "gap-3" : "gap-2.5"}`}>
        <div
          className={`flex items-center justify-center text-[color:var(--text-secondary)] ${
            isDesktop
              ? "h-12 w-12 rounded-[14px] bg-[#f3f4f6]"
              : "h-10 w-10 rounded-[11px] bg-[color:var(--surface-console)]"
          }`}
        >
          <FileText size={isDesktop ? 20 : 18} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-medium text-[color:var(--text-primary)] ${
              isDesktop ? "text-sm" : "text-[13px]"
            }`}
          >
            {attachment.fileName}
          </div>
          <div
            className={`text-[color:var(--text-muted)] ${
              isDesktop ? "mt-1 text-xs" : "mt-0.5 text-[11px]"
            }`}
          >
            {formatFileSize(attachment.size)}
          </div>
        </div>
      </div>
      <div
        className={`uppercase tracking-[0.12em] text-[color:var(--text-muted)] ${
          isDesktop ? "mt-3 text-[11px]" : "mt-2.5 text-[10px]"
        }`}
      >
        {translateRuntimeMessage(msg`文件`)}
      </div>
    </div>
  );

  if (!onOpen) {
    return card;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition hover:opacity-95"
      aria-label={`${translateRuntimeMessage(msg`打开文件`)} ${attachment.fileName}`}
    >
      {card}
    </button>
  );
}

function LocationCardMessage({
  attachment,
  variant,
  onOpen,
}: {
  attachment: Extract<MessageAttachment, { kind: "location_card" }>;
  variant: "mobile" | "desktop";
  onOpen?: () => void;
}) {
  const isDesktop = variant === "desktop";
  const card = (
    <div
      className={`bg-white shadow-none ${
        isDesktop
          ? "w-[220px] rounded-[16px] border border-black/6 p-3"
          : "w-[204px] rounded-[13px] border border-[color:var(--border-subtle)] p-2.5"
      }`}
    >
      <div
        className={`flex items-center gap-2 uppercase tracking-[0.12em] text-[color:var(--text-muted)] ${
          isDesktop ? "text-[11px]" : "text-[10px]"
        }`}
      >
        <MapPin size={12} />
        <span>{translateRuntimeMessage(msg`位置`)}</span>
      </div>
      <div
        className={`font-medium text-[color:var(--text-primary)] ${
          isDesktop ? "mt-3 text-sm" : "mt-2.5 text-[13px]"
        }`}
      >
        {attachment.title}
      </div>
      {attachment.subtitle ? (
        <div
          className={`text-[color:var(--text-muted)] ${
            isDesktop
              ? "mt-1 text-xs leading-5"
              : "mt-0.5 text-[11px] leading-[18px]"
          }`}
        >
          {attachment.subtitle}
        </div>
      ) : null}
    </div>
  );

  if (!onOpen) {
    return card;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition hover:opacity-95"
      aria-label={`${translateRuntimeMessage(msg`查看位置`)} ${attachment.title}`}
    >
      {card}
    </button>
  );
}

function VoiceMessage({
  attachment,
  url,
  own,
  variant,
}: {
  attachment: Extract<MessageAttachment, { kind: "voice" }>;
  url: string;
  own: boolean;
  variant: "mobile" | "desktop";
}) {
  const isDesktop = variant === "desktop";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // 切到别条消息时把自己暂停 —— 浏览器不会自动 mutual-exclude 多个 <audio>，
  // 用户连点两条会同时响。MessageList 里 TTS 朗读用 speakRequestRef 串行化，
  // voice 附件这条以前没有同款机制。
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    return () => {
      activeVoiceMessageAudios.delete(audio);
      audio.pause();
    };
  }, []);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      stopOtherVoiceMessages(audio);
      activeVoiceMessageAudios.add(audio);
      void audio.play().catch(() => {
        activeVoiceMessageAudios.delete(audio);
        setPlaying(false);
      });
      return;
    }

    audio.pause();
  };

  return (
    <div
      className={`flex items-center ${
        isDesktop
          ? "min-w-[148px] max-w-[220px] gap-3 px-3 py-2.5"
          : "min-w-[140px] max-w-[208px] gap-2.5 px-2.5 py-2"
      } ${
        own
          ? "bg-[#95ec69] text-[#111827]"
          : isDesktop
            ? "rounded-[18px] border border-black/5 bg-white text-[color:var(--text-primary)]"
            : "rounded-[16px] border border-[color:var(--border-subtle)] bg-white text-[color:var(--text-primary)]"
      }`}
    >
      <button
        type="button"
        onClick={togglePlayback}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          own
            ? "bg-white/55"
            : isDesktop
              ? "bg-[#f3f4f6]"
              : "bg-[color:var(--surface-console)]"
        }`}
        aria-label={playing ? translateRuntimeMessage(msg`暂停语音`) : translateRuntimeMessage(msg`播放语音`)}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div
        className={`flex min-w-0 flex-1 items-center ${isDesktop ? "gap-1.5" : "gap-1"}`}
      >
        <span
          className={`${isDesktop ? "h-2.5 w-1" : "h-2 w-1"} rounded-full ${playing ? "animate-pulse" : ""} ${
            own ? "bg-[#3d7f1a]" : "bg-[#9ca3af]"
          }`}
        />
        <span
          className={`${isDesktop ? "h-4 w-1" : "h-3.5 w-1"} rounded-full ${playing ? "animate-pulse [animation-delay:90ms]" : ""} ${
            own ? "bg-[#4a8f24]" : "bg-[#6b7280]"
          }`}
        />
        <span
          className={`${isDesktop ? "h-6 w-1" : "h-5 w-1"} rounded-full ${playing ? "animate-pulse [animation-delay:180ms]" : ""} ${
            own ? "bg-[#5aa72c]" : "bg-[#4b5563]"
          }`}
        />
      </div>
      <span
        className={`shrink-0 tabular-nums text-black/60 ${isDesktop ? "text-xs" : "text-[11px]"}`}
      >
        {formatVoiceDurationLabel(attachment.durationMs)}
      </span>
      <audio ref={audioRef} src={url} preload="none" />
    </div>
  );
}

// 模块级，跨 VoiceMessage 实例。点新一条就把其它正在播的暂停。
const activeVoiceMessageAudios = new Set<HTMLAudioElement>();

function stopOtherVoiceMessages(except: HTMLAudioElement) {
  for (const audio of activeVoiceMessageAudios) {
    if (audio === except) {
      continue;
    }
    audio.pause();
    activeVoiceMessageAudios.delete(audio);
  }
}

function GroupRelaySummaryMessage({
  own,
  variant,
  summary,
  onOpen,
}: {
  own: boolean;
  variant: "mobile" | "desktop";
  summary: ReturnType<typeof parseGroupRelaySummaryMessage>;
  onOpen?: () => void;
}) {
  if (!summary) {
    return null;
  }

  const isDesktop = variant === "desktop";
  const completionTimeLabel = resolveGroupRelayCompletionTime(summary);
  const publishRangeLabel = resolveGroupRelayPublishRangeLabel(summary);
  const publishStageBadge = resolveGroupRelayPublishStageBadge(summary);
  const completionBadge = resolveGroupRelayCompletionBadge(summary);
  const ctaCopy = resolveGroupRelayCtaCopy(summary);
  const card = (
    <div
      className={`border shadow-none ${
        isDesktop
          ? own
            ? "w-[252px] rounded-[18px] border-[rgba(110,168,62,0.22)] bg-[linear-gradient(180deg,rgba(237,248,223,0.98),rgba(255,255,255,0.94))] px-4 py-4"
            : "w-[252px] rounded-[18px] border-[rgba(245,158,11,0.16)] bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,255,255,0.94))] px-4 py-4"
          : own
            ? "w-[236px] rounded-[15px] border-[rgba(22,163,74,0.14)] bg-[rgba(247,251,248,0.96)] px-3 py-3"
            : "w-[236px] rounded-[15px] border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 py-3"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
            {translateRuntimeMessage(msg`群接龙`)}
          </div>
          <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
            {summary.sourceGroupName}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <ResultCardBadge
            tone={summary.publishedSource === "mobile" ? "info" : "warning"}
            label={
              summary.publishedSource === "mobile" ? translateRuntimeMessage(msg`手机回填`) : translateRuntimeMessage(msg`桌面回填`)
            }
          />
          {summary.launchSourceLabel ? (
            <ResultCardBadge
              tone="neutral"
              label={
                summary.launchSource === "mobile" ? translateRuntimeMessage(msg`手机发起`) : translateRuntimeMessage(msg`桌面发起`)
              }
            />
          ) : null}
          {summary.statusLabel ? (
            <ResultCardBadge
              tone={
                summary.statusLabel === "已回填" // i18n-ignore-line: protocol data
                  ? "success"
                  : summary.statusLabel === "已完成" // i18n-ignore-line: protocol data
                    ? "info"
                    : "warning"
              }
              label={summary.statusLabel}
            />
          ) : null}
          {publishStageBadge ? (
            <ResultCardBadge
              tone={publishStageBadge.tone}
              label={publishStageBadge.label}
            />
          ) : null}
          {completionBadge ? (
            <ResultCardBadge
              tone={completionBadge.tone}
              label={completionBadge.label}
            />
          ) : null}
        </div>
      </div>

      <div className={isDesktop ? "mt-3 space-y-2" : "mt-2.5 space-y-1.5"}>
        {summary.timestampLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`时间`)}
            value={summary.timestampLabel}
            variant={variant}
          />
        ) : null}
        {completionTimeLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`完成时间`)}
            value={completionTimeLabel}
            variant={variant}
          />
        ) : null}
        {typeof publishRangeLabel === "string" ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`起止时间`)}
            value={publishRangeLabel}
            variant={variant}
          />
        ) : null}
        {summary.activeRelayCountLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`进行中`)}
            value={summary.activeRelayCountLabel}
            variant={variant}
          />
        ) : null}
        {summary.pendingMemberCountLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`待确认`)}
            value={summary.pendingMemberCountLabel}
            variant={variant}
          />
        ) : null}
        {summary.publishCountLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`回填次数`)}
            value={summary.publishCountLabel}
            variant={variant}
          />
        ) : null}
        {summary.resultSummaryLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`结果摘要`)}
            value={summary.resultSummaryLabel}
            variant={variant}
          />
        ) : null}
        {summary.summaryLines.map((line) => (
          <div
            key={line}
            className={
              isDesktop
                ? "rounded-[14px] bg-white/72 px-3 py-2 text-[13px] leading-6 text-[color:var(--text-secondary)]"
                : "rounded-[11px] bg-[color:var(--bg-canvas)] px-2.5 py-1.5 text-[11px] leading-[18px] text-[color:var(--text-secondary)]"
            }
          >
            {line}
          </div>
        ))}
      </div>

      {onOpen ? (
        <div
          className={`${isDesktop ? "mt-4 gap-3 pt-3" : "mt-3 gap-2.5 pt-2.5"} flex items-center justify-between ${
            isDesktop
              ? "border-t border-black/6"
              : "border-t border-[color:var(--border-subtle)]"
          }`}
        >
          <div
            className={`text-[color:var(--text-muted)] ${isDesktop ? "text-[11px] leading-5" : "text-[10px] leading-[18px]"}`}
          >
            {ctaCopy.description}
          </div>
          <div
            className={cn(
              isDesktop ? "text-[11px] font-medium" : "text-[10px] font-medium",
              resolveResultCardFooterActionClassName(ctaCopy.tone),
            )}
          >
            {ctaCopy.actionLabel}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (!onOpen) {
    return card;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition hover:opacity-95"
      aria-label={ctaCopy.ariaLabel}
    >
      {card}
    </button>
  );
}

function collapseGroupCallMessages(messages: ChatRenderableMessage[]) {
  const redirectedIds = new Map<string, string>();
  const collapsedMessages: ChatRenderableMessage[] = [];

  for (const message of messages) {
    const previousMessage =
      collapsedMessages.length > 0
        ? collapsedMessages[collapsedMessages.length - 1]
        : null;

    if (
      previousMessage &&
      (shouldCollapseGroupCallMessage(previousMessage, message) ||
        shouldCollapseGroupRelayMessage(previousMessage, message))
    ) {
      redirectCollapsedMessage(redirectedIds, previousMessage.id, message.id);
      collapsedMessages[collapsedMessages.length - 1] = message;
      continue;
    }

    collapsedMessages.push(message);
  }

  return {
    messages: collapsedMessages,
    redirectedIds,
  };
}

function resolveGroupCallInvite(message: ChatRenderableMessage) {
  const isSystem = message.type === "system" || message.senderType === "system";
  // 走查新一轮 R1：原版还排除了 `senderType === "user"`——但 yinjie 架构里群
  // 通话邀请永远是 user 发出（mobile-group-call-screen 的 syncStatus/endStatus +
  // group-chat-thread-panel.sendCallInviteMutation 走 sendGroupMessage →
  // sendOwnerMessage → senderType:'user'，character 这边没有发起群通话的代码
  // 路径）。结果整套 collapseGroupCallMessages 在所有真实群通话场景下都不工作：
  // mobile-group-call-screen panel-opened 立刻 fire 一份 "ongoing"，1200ms
  // 后 deferred sync effect 再发一份，counts 每变一次又一份，每按一下"同步最
  // 新状态"又一份——yuanzui 实测群 (group-douyin-d2-trio) 一轮通话里堆出 10+
  // 张 "进行中" 卡片不折叠。SQLite 一查全是 senderType=user 的群语音/群视频
  // invite 消息。摘掉 user 排除，剩下 status==="ongoing" 的 prev 规则就够：
  // ongoing→ongoing 同类同群名 → 折叠成最新一张；ongoing→ended 收口成 ended；
  // ended→ongoing 是新一轮通话，自然不折叠。
  if (isSystem) {
    return null;
  }

  const invite = parseGroupCallInviteMessage(
    sanitizeDisplayedChatText(message.text),
  );
  if (!invite) {
    return null;
  }

  return invite;
}

function shouldCollapseGroupCallMessage(
  previousMessage: ChatRenderableMessage | null,
  currentMessage: ChatRenderableMessage,
) {
  if (!previousMessage) {
    return false;
  }

  const currentInvite = resolveGroupCallInvite(currentMessage);
  const previousInvite = resolveGroupCallInvite(previousMessage);

  return Boolean(
    currentInvite &&
    previousInvite &&
    previousInvite.status === "ongoing" &&
    currentInvite.kind === previousInvite.kind &&
    currentInvite.groupName === previousInvite.groupName,
  );
}

function shouldCollapseGroupRelayMessage(
  previousMessage: ChatRenderableMessage | null,
  currentMessage: ChatRenderableMessage,
) {
  if (!previousMessage) {
    return false;
  }

  const currentSummary = resolveGroupRelaySummary(currentMessage);
  const previousSummary = resolveGroupRelaySummary(previousMessage);

  return Boolean(
    currentSummary &&
    previousSummary &&
    currentSummary.sourceGroupName === previousSummary.sourceGroupName,
  );
}

function redirectCollapsedMessage(
  redirectedIds: Map<string, string>,
  previousMessageId: string,
  nextMessageId: string,
) {
  redirectedIds.set(previousMessageId, nextMessageId);
  for (const [sourceId, targetId] of redirectedIds.entries()) {
    if (targetId === previousMessageId) {
      redirectedIds.set(sourceId, nextMessageId);
    }
  }
}

function resolveGroupRelaySummary(message: ChatRenderableMessage) {
  return parseGroupRelaySummaryMessage(resolveRenderableMessageText(message));
}

function resolveRenderableMessageText(message: ChatRenderableMessage) {
  const isSystem = message.type === "system" || message.senderType === "system";
  if (message.senderType === "user" && !isSystem) {
    return extractChatReplyMetadata(message.text).body.trim();
  }

  return sanitizeDisplayedChatText(message.text);
}

function GroupCallInviteMessage({
  own,
  variant,
  invite,
  onOpen,
}: {
  own: boolean;
  variant: "mobile" | "desktop";
  invite: ReturnType<typeof parseGroupCallInviteMessage>;
  onOpen?: () => void;
}) {
  if (!invite) {
    return null;
  }

  const isDesktop = variant === "desktop";
  const canReopenCall = Boolean(onOpen);
  const footerCopy = resolveGroupCallFooterCopy(invite, canReopenCall);
  const completionBadge = resolveGroupCallCompletionBadge(invite);
  const translatedSummaryLines = buildGroupCallWorkspaceSummaryLines({
    kind: invite.kind,
    status: invite.status,
    sourceLabel: invite.sourceLabel,
    counts: invite.activeCount
      ? {
          activeCount: invite.activeCount.current,
          totalCount: invite.activeCount.total,
          waitingCount:
            invite.waitingCount ??
            Math.max(invite.activeCount.total - invite.activeCount.current, 0),
        }
      : null,
  });

  const card = (
    <div
      className={cn(
        "border shadow-none",
        isDesktop
          ? own
            ? "w-[264px] rounded-[18px] border-[rgba(110,168,62,0.22)] bg-[linear-gradient(180deg,rgba(237,248,223,0.98),rgba(255,255,255,0.94))] px-4 py-4"
            : "w-[264px] rounded-[18px] border-[rgba(59,130,246,0.16)] bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(255,255,255,0.94))] px-4 py-4"
          : own
            ? "w-[238px] rounded-[15px] border-[rgba(22,163,74,0.14)] bg-[rgba(247,251,248,0.96)] px-3 py-3"
            : "w-[238px] rounded-[15px] border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 py-3",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
            {translateRuntimeMessage(invite.kind === "voice" ? msg`群语音通话` : msg`群视频通话`)}
          </div>
          <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
            {invite.groupName}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <ResultCardBadge
            tone={invite.status === "ended" ? "danger" : "info"}
            label={
              invite.status === "ended"
                ? translateRuntimeMessage(msg`已结束`)
                : invite.sourceLabel
                  ? `${invite.sourceLabel}${translateRuntimeMessage(msg`发起`)}`
                  : translateRuntimeMessage(msg`桌面发起`)
            }
          />
          {completionBadge ? (
            <ResultCardBadge
              tone={completionBadge.tone}
              label={completionBadge.label}
            />
          ) : null}
        </div>
      </div>

      <div className={isDesktop ? "mt-3 space-y-2" : "mt-2.5 space-y-1.5"}>
        <ResultCardMetric
          label={translateRuntimeMessage(msg`当前状态`)}
          value={getGroupCallStatusLabel(invite.kind, invite.status)}
          variant={variant}
        />
        {invite.timestampLabel ? (
          <ResultCardMetric
            label={
              invite.status === "ended"
                ? translateRuntimeMessage(msg`结束于`)
                : translateRuntimeMessage(msg`发起于`)
            }
            value={
              invite.recordedAt
                ? formatDetailedMessageTimestamp(invite.recordedAt)
                : invite.timestampLabel
            }
            variant={variant}
          />
        ) : null}
        {invite.status === "ended" && invite.startedAt && invite.recordedAt ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`起止时间`)}
            value={formatGroupCallRangeSummary(
              invite.startedAt,
              invite.recordedAt,
            )}
            variant={variant}
          />
        ) : null}
        {invite.durationLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`本轮时长`)}
            value={invite.durationLabel}
            variant={variant}
          />
        ) : null}
        {invite.sourceLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`发起端`)}
            value={invite.sourceLabel}
            variant={variant}
          />
        ) : null}
        {invite.snapshotLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`人数快照`)}
            value={invite.snapshotLabel}
            variant={variant}
          />
        ) : null}
        {invite.activeCount ? (
          <div
            className={
              isDesktop ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-1.5"
            }
          >
            <ResultCardMetric
              label={translateRuntimeMessage(msg`当前在线`)}
              value={`${invite.activeCount.current}/${invite.activeCount.total}`}
              variant={variant}
            />
            <ResultCardMetric
              label={translateRuntimeMessage(msg`待加入`)}
              value={`${invite.waitingCount ?? Math.max(invite.activeCount.total - invite.activeCount.current, 0)} ${translateRuntimeMessage(msg`人`)}`}
              variant={variant}
            />
          </div>
        ) : null}
        {translatedSummaryLines.map((line) => (
          <div
            key={line}
            className={
              isDesktop
                ? "rounded-[14px] bg-white/72 px-3 py-2 text-[13px] leading-6 text-[color:var(--text-secondary)]"
                : "rounded-[11px] bg-[color:var(--bg-canvas)] px-2.5 py-1.5 text-[11px] leading-[18px] text-[color:var(--text-secondary)]"
            }
          >
            {line}
          </div>
        ))}
      </div>

      <div
        className={`${isDesktop ? "mt-4 gap-3 pt-3" : "mt-3 gap-2.5 pt-2.5"} flex items-center justify-between ${
          isDesktop
            ? "border-t border-black/6"
            : "border-t border-[color:var(--border-subtle)]"
        }`}
      >
        <div
          className={`text-[color:var(--text-muted)] ${isDesktop ? "text-[11px] leading-5" : "text-[10px] leading-[18px]"}`}
        >
          {footerCopy.description}
        </div>
        <div
          className={cn(
            isDesktop ? "text-[11px] font-medium" : "text-[10px] font-medium",
            resolveResultCardFooterActionClassName(footerCopy.tone),
          )}
        >
          {footerCopy.actionLabel}
        </div>
      </div>
    </div>
  );

  if (!onOpen) {
    return card;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition hover:opacity-95"
      aria-label={footerCopy.ariaLabel}
    >
      {card}
    </button>
  );
}

function ResultCardMetric({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "mobile" | "desktop";
}) {
  const isDesktop = variant === "desktop";
  return (
    <div
      className={
        isDesktop
          ? "rounded-[14px] bg-white/72 px-3 py-2"
          : "rounded-[11px] bg-[color:var(--bg-canvas)] px-2.5 py-1.5"
      }
    >
      <div
        className={`uppercase tracking-[0.12em] text-[color:var(--text-dim)] ${
          isDesktop ? "text-[10px]" : "text-[9px]"
        }`}
      >
        {label}
      </div>
      <div
        className={`font-medium text-[color:var(--text-primary)] ${
          isDesktop ? "mt-1 text-[13px]" : "mt-0.5 text-[12px]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DirectCallInviteMessage({
  own,
  variant,
  invite,
  onOpen,
}: {
  own: boolean;
  variant: "mobile" | "desktop";
  invite: ReturnType<typeof parseDirectCallInviteMessage>;
  onOpen?: () => void;
}) {
  if (!invite) {
    return null;
  }

  const isDesktop = variant === "desktop";
  const canReopenCall = Boolean(onOpen);
  const footerCopy = resolveDirectCallFooterCopy(invite, canReopenCall);
  const translatedSummaryLines = buildDirectCallWorkspaceSummaryLines({
    kind: invite.kind,
    status: invite.connectionStatus ?? "waiting",
    sourceLabel: invite.sourceLabel,
  });

  const card = (
    <div
      className={cn(
        "border shadow-none",
        isDesktop
          ? own
            ? "w-[264px] rounded-[18px] border-[rgba(110,168,62,0.22)] bg-[linear-gradient(180deg,rgba(237,248,223,0.98),rgba(255,255,255,0.94))] px-4 py-4"
            : "w-[264px] rounded-[18px] border-[rgba(59,130,246,0.16)] bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(255,255,255,0.94))] px-4 py-4"
          : own
            ? "w-[238px] rounded-[15px] border-[rgba(22,163,74,0.14)] bg-[rgba(247,251,248,0.96)] px-3 py-3"
            : "w-[238px] rounded-[15px] border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 py-3",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
            {translateRuntimeMessage(invite.kind === "voice" ? msg`语音通话` : msg`视频通话`)}
          </div>
          <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
            {invite.title}
          </div>
        </div>
        <ResultCardBadge
          tone={invite.connectionStatus === "ended" ? "danger" : "info"}
          label={
            invite.connectionStatus === "ended"
              ? translateRuntimeMessage(msg`已结束`)
              : invite.sourceLabel
                ? `${invite.sourceLabel}${translateRuntimeMessage(msg`发起`)}`
                : translateRuntimeMessage(msg`桌面发起`)
          }
        />
      </div>

      <div className={isDesktop ? "mt-3 space-y-2" : "mt-2.5 space-y-1.5"}>
        {invite.connectionStatus ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`当前状态`)}
            value={resolveDirectCallStatusLabel(invite)}
            variant={variant}
          />
        ) : null}
        {invite.timestampLabel ? (
          <ResultCardMetric
            label={
              invite.connectionStatus === "ended"
                ? translateRuntimeMessage(msg`结束于`)
                : translateRuntimeMessage(msg`发起于`)
            }
            value={
              invite.recordedAt
                ? formatDetailedMessageTimestamp(invite.recordedAt)
                : invite.timestampLabel
            }
            variant={variant}
          />
        ) : null}
        {invite.durationLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`最近一轮`)}
            value={invite.durationLabel}
            variant={variant}
          />
        ) : null}
        {invite.sourceLabel ? (
          <ResultCardMetric
            label={translateRuntimeMessage(msg`发起端`)}
            value={invite.sourceLabel}
            variant={variant}
          />
        ) : null}
        {translatedSummaryLines.map((line) => (
          <div
            key={line}
            className={
              isDesktop
                ? "rounded-[14px] bg-white/72 px-3 py-2 text-[13px] leading-6 text-[color:var(--text-secondary)]"
                : "rounded-[11px] bg-[color:var(--bg-canvas)] px-2.5 py-1.5 text-[11px] leading-[18px] text-[color:var(--text-secondary)]"
            }
          >
            {line}
          </div>
        ))}
      </div>

      <div
        className={`${isDesktop ? "mt-4 gap-3 pt-3" : "mt-3 gap-2.5 pt-2.5"} flex items-center justify-between ${
          isDesktop
            ? "border-t border-black/6"
            : "border-t border-[color:var(--border-subtle)]"
        }`}
      >
        <div
          className={`text-[color:var(--text-muted)] ${isDesktop ? "text-[11px] leading-5" : "text-[10px] leading-[18px]"}`}
        >
          {footerCopy.description}
        </div>
        <div
          className={cn(
            isDesktop ? "text-[11px] font-medium" : "text-[10px] font-medium",
            resolveResultCardFooterActionClassName(footerCopy.tone),
          )}
        >
          {footerCopy.actionLabel}
        </div>
      </div>
    </div>
  );

  if (!onOpen) {
    return card;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition hover:opacity-95"
      aria-label={footerCopy.ariaLabel}
    >
      {card}
    </button>
  );
}

function StickerMessage({
  url,
  label,
  maxSize,
  onMediaReady,
}: {
  url: string;
  label: string;
  maxSize: number;
  onMediaReady?: () => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [url]);

  if (loadFailed) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded-[22px] border border-white/80 bg-white/90 px-3 text-center text-xs text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]">
        {label || translateRuntimeMessage(msg`[表情包]`)}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={label}
      width={maxSize}
      height={maxSize}
      loading="lazy"
      decoding="async"
      onError={() => setLoadFailed(true)}
      onLoad={onMediaReady}
      className="rounded-[18px] bg-white/70 object-contain shadow-none"
      style={{
        width: `${maxSize}px`,
        height: `${maxSize}px`,
        maxWidth: `${maxSize}px`,
        maxHeight: `${maxSize}px`,
      }}
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

  // 原生壳硬件 Back 键：图片查看器打开时 BACK 应当先关查看器，不要直接
  // history.back 跳出聊天页。desktop 形态注册没副作用。
  useEffect(() => {
    if (isDesktop) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
    return unregister;
  }, [isDesktop, onClose]);

  // 第三轮 R1：mobile variant ESC 漏挂。父组件 chat-message-list 在 line 1920
  // 那条 ESC + ←/→ 键盘 nav effect 加了 `if (!isDesktop) return`——desktop 才
  // 接监听；mobile 这边只挂了 Android Back，外接键盘 / iPad Magic Keyboard /
  // 模拟器 / 桌面 web 移动模拟（chrome devtools "mobile responsive"）按 ESC
  // 关不掉图片查看器，只能点 backdrop。和姊妹 LocationViewerOverlay
  // （本文件下方）/ 单聊里其他 sheet 都已经统一兜过 ESC，这里补齐。
  // isDesktop 时让位给父组件那条带 ←/→ 翻图的 handler，避免双重监听。
  // defaultPrevented 时让位：嵌套子模态（理论上没有，但保留语义）。
  useEffect(() => {
    if (isDesktop) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop, onClose]);

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
        aria-label={translateRuntimeMessage(msg`关闭图片查看器`)}
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
                <ViewerActionButton label={translateRuntimeMessage(msg`新窗口打开`)} onClick={onOpenInWindow}>
                  <ExternalLink size={16} />
                </ViewerActionButton>
              ) : null}
              {onPrint ? (
                <ViewerActionButton label={translateRuntimeMessage(msg`打印图片`)} onClick={onPrint}>
                  <Printer size={16} />
                </ViewerActionButton>
              ) : null}
              <ViewerActionButton label={translateRuntimeMessage(msg`保存图片`)} onClick={onSave}>
                <Download size={16} />
              </ViewerActionButton>
              <ViewerActionButton label={translateRuntimeMessage(msg`定位到聊天位置`)} onClick={onLocate}>
                <LocateFixed size={16} />
              </ViewerActionButton>
              <ViewerActionButton label={translateRuntimeMessage(msg`关闭图片查看器`)} onClick={onClose}>
                <X size={16} />
              </ViewerActionButton>
            </div>
          </div>

          {onPrevious ? (
            <ViewerNavButton
              side="left"
              label={translateRuntimeMessage(msg`上一张图片`)}
              onClick={onPrevious}
            >
              <ChevronLeft size={22} />
            </ViewerNavButton>
          ) : null}
          {onNext ? (
            <ViewerNavButton side="right" label={translateRuntimeMessage(msg`下一张图片`)} onClick={onNext}>
              <ChevronRight size={22} />
            </ViewerNavButton>
          ) : null}
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-10 flex items-start justify-between gap-3 px-3 text-white">
            <ViewerActionButton
              compact
              label={translateRuntimeMessage(msg`关闭图片查看器`)}
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
            <ViewerActionButton compact label={translateRuntimeMessage(msg`保存图片`)} onClick={onSave}>
              <Download size={16} />
            </ViewerActionButton>
          </div>

          {total > 1 ? (
            <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] z-10 px-6 text-center text-xs text-white/70">
              {translateRuntimeMessage(msg`左右滑动切换图片`)}
            </div>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/10 bg-[rgba(15,23,42,0.58)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 backdrop-blur-xl">
            <div className="flex items-center justify-center gap-3">
              <ViewerActionButton
                compact
                label={translateRuntimeMessage(msg`定位到聊天位置`)}
                onClick={onLocate}
              >
                <LocateFixed size={16} />
              </ViewerActionButton>
              {onPrevious ? (
                <ViewerActionButton
                  compact
                  label={translateRuntimeMessage(msg`上一张图片`)}
                  onClick={onPrevious}
                >
                  <ChevronLeft size={18} />
                </ViewerActionButton>
              ) : null}
              {onNext ? (
                <ViewerActionButton compact label={translateRuntimeMessage(msg`下一张图片`)} onClick={onNext}>
                  <ChevronRight size={18} />
                </ViewerActionButton>
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* 走查新一轮 R2：这一层 `absolute inset-0` 把上面那个 backdrop 关闭按钮
          整张盖住了——后兄弟元素永远在前兄弟上面，背景按钮根本收不到点击。
          移动端用户看 chat 里 1 张图 → 全屏查看器，点周围"黑色背景"想关，
          只能找右上角 ✕（mobile 在左上角）；标准 photo viewer 模式（IG / 微信 /
          系统相册）都是"图片以外的黑色区域 tap 关闭"。给容器自己挂 onClick：
          target === currentTarget 时（点的是容器本身的 padding 区，不是 <img>）
          才关闭，点图片本身不关。同时手势 onTouchEnd 也补一份 fallback——
          mobile 的 React 合成 click 在 touchmove 后偶发不触发，借助现有
          touchDeltaXRef 判定"无横向滑动"再 close，等价于点击意图。 */}
      <div
        className={`absolute inset-0 flex items-center justify-center ${
          isDesktop
            ? "px-24 pb-10 pt-24"
            : "px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.75rem)] pt-24"
        }`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
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

function LocationViewerOverlay({
  variant,
  attachment,
  onClose,
  onLocate,
  onShareOrCopy,
}: {
  variant: "mobile" | "desktop";
  attachment: Extract<MessageAttachment, { kind: "location_card" }>;
  onClose: () => void;
  onLocate: () => void;
  onShareOrCopy: () => void;
}) {
  const isDesktop = variant === "desktop";
  const nativeMobileShareSupported = !isDesktop && isNativeMobileShareSurface();

  // 原生壳硬件 Back：位置查看器打开时 BACK 关查看器，不退聊天页。
  useEffect(() => {
    if (isDesktop) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
    return unregister;
  }, [isDesktop, onClose]);

  // 桌面键盘 Esc：位置查看器是 fixed inset-0 全屏模态，desktop 用户
  // 不该只能点 ✕ 或 backdrop 关。和 image viewer 父级的 Esc 处理对齐。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(5,10,20,0.88)] backdrop-blur-md">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label={translateRuntimeMessage(msg`关闭位置查看器`)}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.22),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.12),rgba(15,23,42,0.72))]" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top,0px),1rem)] text-white">
          <div>
            <div className="text-[12px] uppercase tracking-[0.18em] text-white/60">
              {translateRuntimeMessage(msg`聊天位置`)}
            </div>
            <div className="mt-1 text-[18px] font-medium">
              {attachment.title}
            </div>
          </div>
          <ViewerActionButton compact label={translateRuntimeMessage(msg`关闭位置查看器`)} onClick={onClose}>
            <X size={18} />
          </ViewerActionButton>
        </div>

        {/* 走查新一轮 R3：同 ImageViewerOverlay R2 — 上面那个 absolute inset-0
            backdrop 按钮被后兄弟（radial gradient + 这条 relative flex h-full）
            完全覆盖，点不到。位置查看器的可视 backdrop 区域只剩中间这条
            `flex-1` 的 padding（卡片以外的暗色环绕区）。给容器自己挂 onClick：
            target === currentTarget（点在 padding 上而不是卡片）才关闭，点卡片
            本身不关。 */}
        <div
          className="relative flex-1 px-4 pb-5 pt-2"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <div
            className={`relative h-full overflow-hidden rounded-[30px] border border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.28)] ${
              isDesktop ? "mx-auto max-w-4xl" : ""
            }`}
          >
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(236,253,245,0.24),rgba(187,247,208,0.1)),linear-gradient(180deg,rgba(148,163,184,0.12),rgba(15,23,42,0.3))]" />
            <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
            <div className="absolute inset-x-[14%] top-[18%] h-24 rounded-full bg-[rgba(74,222,128,0.12)] blur-3xl" />
            <div className="absolute right-[18%] top-[30%] h-20 w-20 rounded-full bg-[rgba(59,130,246,0.12)] blur-3xl" />

            <div className="relative flex h-full flex-col justify-between p-5">
              <div className="self-start rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] tracking-[0.12em] text-white/72">
                {translateRuntimeMessage(msg`来自聊天中的位置卡片`)}
              </div>

              <div className="flex flex-1 items-center justify-center">
                <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-white/16 bg-white/12 shadow-[0_18px_48px_rgba(15,23,42,0.32)]">
                  <div className="absolute inset-3 rounded-full border border-white/12" />
                  <MapPin size={34} className="text-white" />
                </div>
              </div>

              <div className="rounded-[24px] border border-white/12 bg-[rgba(10,15,28,0.56)] p-4 text-white shadow-[0_18px_48px_rgba(0,0,0,0.2)]">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-[rgba(74,222,128,0.18)] p-2 text-[#bbf7d0]">
                    <LocateFixed size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[18px] font-medium leading-7">
                      {attachment.title}
                    </div>
                    <div className="mt-1 text-[13px] leading-6 text-white/72">
                      {attachment.subtitle?.trim() ||
                        translateRuntimeMessage(msg`这条位置消息来自当前聊天场景，可继续回到消息定位。`)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2">
          <ViewerActionButton
            label={translateRuntimeMessage(nativeMobileShareSupported ? msg`系统分享` : msg`复制位置`)}
            onClick={onShareOrCopy}
          >
            {nativeMobileShareSupported ? (
              <Share2 size={16} />
            ) : (
              <Copy size={16} />
            )}
          </ViewerActionButton>
          <ViewerActionButton label={translateRuntimeMessage(msg`定位消息`)} onClick={onLocate}>
            <LocateFixed size={16} />
          </ViewerActionButton>
        </div>
      </div>
    </div>
  );
}

function NoteViewerOverlay({
  attachment,
  previewImageUrl,
  baseUrl,
  onClose,
  onLocate,
  onShareOrCopy,
}: {
  attachment: Extract<MessageAttachment, { kind: "note_card" }>;
  previewImageUrl: string | null;
  baseUrl: string;
  onClose: () => void;
  onLocate: () => void;
  onShareOrCopy: () => void;
}) {
  const navigate = useNavigate();
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const [actionMenuOpen, setActionMenuOpen] = useState(false);

  // 原生壳硬件 Back：笔记卡片查看器打开时 BACK 优先关 action 子菜单 → 再
  // 关查看器，最后再退聊天页。
  useEffect(() => {
    const unregister = registerAndroidBackInterceptor((event) => {
      if (actionMenuOpen) {
        event.preventDefault();
        setActionMenuOpen(false);
        return true;
      }
      event.preventDefault();
      onClose();
      return true;
    });
    return unregister;
  }, [actionMenuOpen, onClose]);

  // 桌面键盘 Esc：笔记查看器同样是 fixed inset-0 全屏模态，Esc 先关
  // action 子菜单，再关查看器。和原生壳 Back 拦截器的 fallback 顺序对齐。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      if (actionMenuOpen) {
        setActionMenuOpen(false);
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionMenuOpen, onClose]);
  // 走查 R2：上方 NoteCardAttachment（消息气泡里的笔记缩略卡）已经把
  // 同 queryKey 的 noteQuery 设了 staleTime: 30_000；这条「全屏查看器」
  // 没设 → 用户在聊天里点缩略卡打开查看器时，react-query 看到 observer
  // 的 staleTime=0 立刻重发一次 getFavoriteNote。两份 observer 共享同一
  // cache，新的那条没必要再发。对齐 30s。
  const noteQuery = useQuery({
    queryKey: ["favorite-note", baseUrl, attachment.noteId],
    queryFn: () => getFavoriteNote(attachment.noteId, baseUrl),
    enabled: Boolean(attachment.noteId),
    staleTime: 30_000,
  });
  const document: FavoriteNoteDocument | undefined = noteQuery.data;
  const noteMissing = isFavoriteNoteMissingError(noteQuery.error);
  const updatedAtLabel = formatMessageTimestamp(
    document?.updatedAt ?? attachment.updatedAt,
  );
  const title = (document?.title || attachment.title || "").trim() || translateRuntimeMessage(msg`未命名笔记`);
  const tags = document?.tags?.length ? document.tags : attachment.tags;
  // 防御性 URL 过滤：后端 R1/R3 已经在 normalizeFavoriteNoteAssets 里拦了
  // javascript:/vbscript:/data:text。这里再加一层，覆盖老数据 + 透传给
  // <a href> / <img src> 时绝不会带危险协议。
  const fileAssets = (document?.assets ?? attachment.assets).filter(
    (asset) => asset.kind === "file" && isSafeFavoriteAssetUrl(asset.url),
  );
  const imageAssetsFallback = (document?.assets ?? attachment.assets).filter(
    (asset) => asset.kind === "image" && isSafeFavoriteAssetUrl(asset.url),
  );
  const hasContentHtml = Boolean(document?.contentHtml?.trim());

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#ededed]">
      <div className="flex items-center gap-1 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-2 pb-1.5 pt-[max(env(safe-area-inset-top,0px),0.5rem)] text-[color:var(--text-primary)]">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
          aria-label={translateRuntimeMessage(msg`返回`)}
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 text-center text-[16px] font-medium tracking-normal">
          {translateRuntimeMessage(msg`笔记`)}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setActionMenuOpen(true)}
          className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
          aria-label={translateRuntimeMessage(msg`更多操作`)}
        >
          <MoreHorizontal size={20} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {noteMissing ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              {translateRuntimeMessage(msg`笔记已被删除或不可见`)}
            </div>
            <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]">
              {translateRuntimeMessage(msg`该笔记可能已经被发送者删除，或你不再有查看权限。`)}
            </div>
          </div>
        ) : (
          <div className="px-5 pb-10 pt-5">
            <div className="text-[22px] font-semibold leading-8 text-[color:var(--text-primary)]">
              {title}
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {translateRuntimeMessage(msg`编辑于`)} {updatedAtLabel}
            </div>

            <div className="mt-4">
              {noteQuery.isLoading && !document ? (
                <div className="space-y-2.5">
                  <div className="h-4 w-3/4 rounded bg-[rgba(15,23,42,0.06)]" />
                  <div className="h-4 w-full rounded bg-[rgba(15,23,42,0.06)]" />
                  <div className="h-4 w-5/6 rounded bg-[rgba(15,23,42,0.06)]" />
                </div>
              ) : hasContentHtml ? (
                <div
                  className={cn(
                    "text-[15px] leading-7 text-[color:var(--text-primary)]",
                    "[&_a[data-note-file='true']]:my-1.5 [&_a[data-note-file='true']]:inline-flex [&_a[data-note-file='true']]:items-center [&_a[data-note-file='true']]:rounded-[12px] [&_a[data-note-file='true']]:border [&_a[data-note-file='true']]:border-[rgba(15,23,42,0.08)] [&_a[data-note-file='true']]:bg-[rgba(243,244,246,0.82)] [&_a[data-note-file='true']]:px-3 [&_a[data-note-file='true']]:py-2 [&_a[data-note-file='true']]:text-[13px] [&_a[data-note-file='true']]:text-[color:var(--text-primary)] [&_a[data-note-file='true']]:no-underline",
                    "[&_img[data-note-image='true']]:my-2 [&_img[data-note-image='true']]:max-h-[60vw] [&_img[data-note-image='true']]:max-w-full [&_img[data-note-image='true']]:rounded-[14px] [&_img[data-note-image='true']]:border [&_img[data-note-image='true']]:border-[rgba(15,23,42,0.08)]",
                    "[&_[data-note-checkbox='false']]:cursor-default [&_[data-note-checkbox='true']]:cursor-default [&_[data-note-checkbox='true']]:text-[color:var(--brand-primary)]",
                  )}
                  dangerouslySetInnerHTML={{
                    __html: document!.contentHtml,
                  }}
                />
              ) : (
                <>
                  {previewImageUrl ? (
                    <img
                      src={previewImageUrl}
                      alt={title}
                      loading="lazy"
                      decoding="async"
                      className="my-2 max-h-[60vw] w-full rounded-[14px] border border-[rgba(15,23,42,0.08)] object-cover"
                    />
                  ) : null}
                  <div className="text-[15px] leading-7 text-[color:var(--text-primary)]">
                    {attachment.excerpt?.trim() || translateRuntimeMessage(msg`这条笔记暂时没有正文内容。`)}
                  </div>
                  {imageAssetsFallback
                    .filter((asset) => asset.url && asset.url !== previewImageUrl)
                    .map((asset) => (
                      <img
                        key={asset.id}
                        src={asset.url}
                        alt={asset.fileName}
                        loading="lazy"
                        decoding="async"
                        className="my-2 max-h-[60vw] w-full rounded-[14px] border border-[rgba(15,23,42,0.08)] object-cover"
                      />
                    ))}
                  {fileAssets.map((asset) => (
                    <a
                      key={asset.id}
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="my-1.5 inline-flex items-center gap-2 rounded-[12px] border border-[rgba(15,23,42,0.08)] bg-[rgba(243,244,246,0.82)] px-3 py-2 text-[13px] text-[color:var(--text-primary)] no-underline"
                    >
                      <FileText size={14} />
                      <span className="max-w-[60vw] truncate">
                        {asset.fileName}
                      </span>
                    </a>
                  ))}
                </>
              )}
            </div>

            {tags.length ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-[rgba(7,193,96,0.08)] px-3 py-1 text-[12px] text-[color:var(--brand-primary)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {actionMenuOpen ? (
        <NoteDetailActionSheet
          shareLabel={
            nativeMobileShareSupported ? translateRuntimeMessage(msg`系统分享`) : translateRuntimeMessage(msg`复制摘要`)
          }
          shareIcon={
            nativeMobileShareSupported ? (
              <Share2 size={16} />
            ) : (
              <Copy size={16} />
            )
          }
          canEdit={
            Boolean(attachment.noteId) && !noteMissing && !noteQuery.isLoading
          }
          onEdit={() => {
            setActionMenuOpen(false);
            const currentPath =
              typeof window !== "undefined" ? window.location.pathname : "/";
            const currentHash =
              typeof window !== "undefined"
                ? window.location.hash.replace(/^#/, "")
                : undefined;
            onClose();
            void navigate({
              to: "/notes/new",
              hash: buildMobileNoteEditorRouteHash({
                draftId: attachment.noteId,
                noteId: attachment.noteId,
                returnPath: currentPath,
                returnHash: currentHash || undefined,
              }),
            });
          }}
          onShareOrCopy={() => {
            setActionMenuOpen(false);
            onShareOrCopy();
          }}
          onLocate={() => {
            setActionMenuOpen(false);
            onLocate();
          }}
          onClose={() => setActionMenuOpen(false)}
        />
      ) : null}
    </div>
  );
}

function NoteDetailActionSheet({
  shareLabel,
  shareIcon,
  canEdit,
  onEdit,
  onShareOrCopy,
  onLocate,
  onClose,
}: {
  shareLabel: string;
  shareIcon: ReactNode;
  canEdit: boolean;
  onEdit: () => void;
  onShareOrCopy: () => void;
  onLocate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-[rgba(15,23,42,0.14)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={translateRuntimeMessage(msg`关闭操作菜单`)}
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 rounded-t-[20px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-[0_-14px_28px_rgba(15,23,42,0.10)]">
        <div className="flex justify-center pb-2">
          <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-3 rounded-[12px] px-4 py-3 text-left text-[15px] text-[color:var(--text-primary)] transition active:bg-black/[0.04]"
          >
            <span className="flex h-7 w-7 items-center justify-center text-[color:var(--text-secondary)]">
              <Pencil size={16} />
            </span>
            {translateRuntimeMessage(msg`编辑笔记`)}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onShareOrCopy}
          className="flex items-center gap-3 rounded-[12px] px-4 py-3 text-left text-[15px] text-[color:var(--text-primary)] transition active:bg-black/[0.04]"
        >
          <span className="flex h-7 w-7 items-center justify-center text-[color:var(--text-secondary)]">
            {shareIcon}
          </span>
          {shareLabel}
        </button>
        <button
          type="button"
          onClick={onLocate}
          className="flex items-center gap-3 rounded-[12px] px-4 py-3 text-left text-[15px] text-[color:var(--text-primary)] transition active:bg-black/[0.04]"
        >
          <span className="flex h-7 w-7 items-center justify-center text-[color:var(--text-secondary)]">
            <LocateFixed size={16} />
          </span>
          {translateRuntimeMessage(msg`定位消息`)}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 rounded-[12px] bg-white px-4 py-3 text-center text-[15px] font-medium text-[color:var(--text-primary)] shadow-[0_1px_0_rgba(15,23,42,0.04)]"
        >
          {translateRuntimeMessage(msg`取消`)}
        </button>
      </div>
    </div>
  );
}

function buildLocationAttachmentSummary(
  attachment: Extract<MessageAttachment, { kind: "location_card" }>,
) {
  return attachment.subtitle?.trim()
    ? `${attachment.title}\n${attachment.subtitle.trim()}`
    : attachment.title;
}

function buildContactAttachmentSummary(
  attachment: Extract<MessageAttachment, { kind: "contact_card" }>,
  profileUrl: string,
) {
  return [
    `${attachment.name}${translateRuntimeMessage(msg` 的隐界名片`)}`,
    attachment.relationship?.trim() || translateRuntimeMessage(msg`世界联系人`),
    `${translateRuntimeMessage(msg`隐界号：`)}${buildYinjieId(attachment.characterId)}`,
    profileUrl,
  ].join("\n");
}

function buildNoteAttachmentSummary(
  attachment: Extract<MessageAttachment, { kind: "note_card" }>,
) {
  const imageCount = attachment.assets.filter(
    (asset) => asset.kind === "image",
  ).length;
  const fileCount = attachment.assets.filter(
    (asset) => asset.kind === "file",
  ).length;

  return [
    `${attachment.title}`,
    attachment.excerpt?.trim() || translateRuntimeMessage(msg`这是一条来自聊天中的收藏笔记。`),
    attachment.tags.length
      ? `${translateRuntimeMessage(msg`标签：`)}${attachment.tags.map((tag) => `#${tag}`).join(" ")}`
      : null,
    imageCount > 0 ? `${translateRuntimeMessage(msg`图片：`)}${imageCount} ${translateRuntimeMessage(msg` 张`)}` : null,
    fileCount > 0 ? `${translateRuntimeMessage(msg`文件：`)}${fileCount} ${translateRuntimeMessage(msg` 个`)}` : null,
    `${translateRuntimeMessage(msg`更新于`)} ${formatMessageTimestamp(attachment.updatedAt)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveNotePreviewImageUrl(
  attachment: Extract<MessageAttachment, { kind: "note_card" }>,
  resolveAttachmentUrl: (url: string) => string,
) {
  // 跟 fileAssets/imageAssetsFallback 一样过滤危险协议——封面图也走同一关。
  const previewImage = attachment.assets.find(
    (asset) => asset.kind === "image" && isSafeFavoriteAssetUrl(asset.url),
  );
  return previewImage?.url ? resolveAttachmentUrl(previewImage.url) : null;
}

function formatVoiceDurationLabel(durationMs?: number) {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return '1"';
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}`
    : `${seconds}"`;
}

function resolveRuntimeAttachmentUrl(url: string, runtimeBaseUrl?: string) {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return normalizedUrl;
  }

  if (normalizedUrl.startsWith("blob:") || normalizedUrl.startsWith("data:")) {
    return normalizedUrl;
  }

  const runtimeUrl = tryParseUrl(
    normalizeOptionalUrl(runtimeBaseUrl) ??
      normalizeOptionalUrl(resolveConfiguredCoreApiBaseUrl()),
  );
  const browserOriginUrl =
    typeof window !== "undefined" ? tryParseUrl(window.location.origin) : null;
  const resolvedUrl =
    tryParseUrl(normalizedUrl, runtimeUrl?.toString()) ??
    tryParseUrl(normalizedUrl, browserOriginUrl?.toString());

  if (!resolvedUrl) {
    return normalizedUrl;
  }

  const rebaseTarget =
    runtimeUrl && shouldRebasePrivateAttachment(resolvedUrl, runtimeUrl)
      ? runtimeUrl
      : !runtimeUrl &&
          browserOriginUrl &&
          shouldRebasePrivateAttachment(resolvedUrl, browserOriginUrl)
        ? browserOriginUrl
        : null;

  if (!rebaseTarget) {
    return resolvedUrl.toString();
  }

  return rebaseAttachmentUrl(resolvedUrl, rebaseTarget);
}

function shouldRebasePrivateAttachment(assetUrl: URL, targetUrl: URL) {
  return (
    isPrivateHostname(assetUrl.hostname) && assetUrl.origin !== targetUrl.origin
  );
}

function rebaseAttachmentUrl(assetUrl: URL, targetUrl: URL) {
  const assetPath = `${assetUrl.pathname}${assetUrl.search}${assetUrl.hash}`;
  const normalizedTargetPath = targetUrl.pathname.replace(/\/+$/, "");
  if (
    normalizedTargetPath &&
    (assetUrl.pathname === normalizedTargetPath ||
      assetUrl.pathname.startsWith(`${normalizedTargetPath}/`))
  ) {
    return `${targetUrl.origin}${assetPath}`;
  }

  return `${targetUrl.toString().replace(/\/+$/, "")}${assetPath}`;
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (
    [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "10.0.2.2",
      "host.docker.internal",
    ].includes(normalized)
  ) {
    return true;
  }

  const match = normalized.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (!match) {
    return false;
  }

  const firstOctet = Number(match[1]);
  const secondOctet = Number(match[2]);

  if (firstOctet === 10 || firstOctet === 127) {
    return true;
  }

  if (firstOctet === 192 && secondOctet === 168) {
    return true;
  }

  return firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31;
}

function normalizeOptionalUrl(value?: string | null) {
  const normalizedValue = value?.trim();
  return normalizedValue || undefined;
}

function tryParseUrl(value?: string | null, base?: string) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return null;
  }

  try {
    return new URL(normalizedValue, base);
  } catch {
    return null;
  }
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
