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
import {
  RotateCcw,
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
  Pause,
  Play,
  Printer,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  createMessageFavorite,
  deleteConversationMessage,
  deleteGroupMessage,
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
  type GroupMessage,
  type MessageAttachment,
  type Message,
  type SendGroupMessageRequest,
  type SendMessagePayload,
  uploadCustomSticker,
} from "@yinjie/contracts";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
import { InlineNoticeActionButton } from "./inline-notice-action-button";
import {
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
  hydrateDesktopFavoritesFromNative,
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import {
  extractChatReplyMetadata,
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
import { resolveConfiguredCoreApiBaseUrl } from "../lib/runtime-config";
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
  formatGroupCallStatusLabel,
  parseGroupCallInviteMessage,
  type CallInviteSource,
} from "../features/chat/group-call-message";
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
  | Extract<MessageAttachment, { kind: "note_card" }>;

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
}: ChatMessageListProps) {
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
    setReminderTargetMessage((current) =>
      current && messages.some((message) => message.id === current.id)
        ? current
        : null,
    );
    setQuoteSelectionMessage((current) =>
      current && messages.some((message) => message.id === current.id)
        ? current
        : null,
    );
    setSelectedMessageIds((current) =>
      filterStableStringIds(current, (item) =>
        messages.some((message) => message.id === item),
      ),
    );
    setForwardMessages((current) =>
      filterStableMessageList(current, (item) =>
        messages.some((message) => message.id === item.id),
      ),
    );
    setSelectionAnchorMessageId((current) =>
      current && messages.some((message) => message.id === current)
        ? current
        : null,
    );
    setViewerMessageId((current) =>
      current && messages.some((message) => message.id === current)
        ? current
        : null,
    );
    setLocationViewerMessageId((current) =>
      current && messages.some((message) => message.id === current)
        ? current
        : null,
    );
    setNoteViewerMessageId((current) =>
      current && messages.some((message) => message.id === current)
        ? current
        : null,
    );
    setDesktopAvatarPopover((current) =>
      current &&
      (current.kind === "owner" ||
        messages.some(
          (message) =>
            message.senderType === "character" &&
            message.senderId === current.characterId,
        ))
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

    void syncDetailedTimestampMode();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
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

  const forwardConversationsQuery = useQuery({
    queryKey: ["desktop-message-forward-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(forwardMessages?.length),
  });
  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
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

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
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
              ? `已合并转发到 ${conversationTitle}。`
              : `已合并转发 ${count} 条消息到 ${conversationTitle}。`
            : count <= 1
              ? `已转发到 ${conversationTitle}。`
              : `已转发 ${count} 条消息到 ${conversationTitle}。`,
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
          error instanceof Error ? error.message : "转发失败，请稍后再试。",
        tone: "danger",
        actionLabel: "继续转发消息",
        onAction: () => {
          void forwardMutation.mutateAsync(input);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    },
  });

  const recallMutation = useMutation({
    mutationFn: async (message: ChatRenderableMessage) => {
      if (!threadContext) {
        throw new Error("当前线程暂不支持撤回消息。");
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
        message: "已撤回这条消息。",
        tone: "success",
      });

      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (error, message) => {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "撤回失败，请稍后再试。",
        tone: "danger",
        actionLabel: "继续撤回",
        onAction: () => {
          recallMutation.mutate(message);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (message: ChatRenderableMessage) => {
      if (!threadContext) {
        throw new Error("当前线程暂不支持删除消息。");
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
      if (result.threadType === "group") {
        updateGroupMessageQueries(
          threadContext.id,
          (current) =>
            current?.filter((item) => item.id !== message.id) ?? current,
        );
        await queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, threadContext.id],
        });
      } else {
        updateConversationMessageQueries(
          threadContext.id,
          (current) =>
            current?.filter((item) => item.id !== message.id) ?? current,
        );
        await queryClient.invalidateQueries({
          queryKey: ["app-conversation-messages", baseUrl, threadContext.id],
        });
      }

      setActionNotice({
        message: "已删除这条消息。",
        tone: "success",
      });

      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (error, message) => {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "删除失败，请稍后再试。",
        tone: "danger",
        actionLabel: "继续删除",
        onAction: () => {
          deleteMutation.mutate(message);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    },
  });

  const addToStickerMutation = useMutation({
    mutationFn: async (message: ChatRenderableMessage) => {
      const source = resolveCustomStickerUploadSource(
        message,
        resolveAttachmentUrl,
      );
      if (!source) {
        throw new Error("当前消息暂不支持添加到表情。");
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
        message: "已添加到自定义表情。",
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
            : "添加到表情失败，请稍后再试。",
        tone: "danger",
        actionLabel: "继续添加到表情",
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
        actionLabel: "重试复制",
        onAction: () => {
          void copyToClipboard(text, successMessage);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    }
  };

  const shareLocationSummary = async (
    attachment: Extract<MessageAttachment, { kind: "location_card" }>,
  ) => {
    const summary = buildLocationAttachmentSummary(attachment);
    if (!isNativeMobileShareSurface()) {
      await copyToClipboard(summary, "位置内容已复制。");
      return;
    }

    const shared = await shareWithNativeShell({
      title: attachment.title,
      text: summary,
    });

    if (shared) {
      setActionNotice({
        message: "已打开系统分享面板。",
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
        message: "当前设备暂时无法打开系统分享，请稍后重试。",
        tone: "danger",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setActionNotice({
        message: "系统分享暂时不可用，已复制位置内容。",
        tone: "success",
      });
    } catch {
      setActionNotice({
        message: "系统分享失败，请稍后重试。",
        tone: "danger",
        actionLabel: "重试分享",
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
    const profileUrl =
      typeof window === "undefined"
        ? profilePath
        : `${window.location.origin}${profilePath}`;
    const summary = buildContactAttachmentSummary(attachment, profileUrl);

    if (!isNativeMobileShareSurface()) {
      await copyToClipboard(summary, "名片摘要已复制。");
      return;
    }

    const shared = await shareWithNativeShell({
      title: `${attachment.name} 的隐界名片`,
      text: summary,
      url: profileUrl,
    });

    if (shared) {
      setActionNotice({
        message: "已打开系统分享面板。",
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
        message: "当前设备暂时无法打开系统分享，请稍后重试。",
        tone: "danger",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setActionNotice({
        message: "系统分享暂时不可用，已复制名片摘要。",
        tone: "success",
      });
    } catch {
      setActionNotice({
        message: "系统分享失败，请稍后重试。",
        tone: "danger",
        actionLabel: "重试分享",
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
      await copyToClipboard(summary, "笔记摘要已复制。");
      return;
    }

    const shared = await shareWithNativeShell({
      title: attachment.title,
      text: summary,
    });

    if (shared) {
      setActionNotice({
        message: "已打开系统分享面板。",
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
        message: "当前设备暂时无法打开系统分享，请稍后重试。",
        tone: "danger",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setActionNotice({
        message: "系统分享暂时不可用，已复制笔记摘要。",
        tone: "success",
      });
    } catch {
      setActionNotice({
        message: "系统分享失败，请稍后重试。",
        tone: "danger",
        actionLabel: "重试分享",
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
      senderName: message.senderName?.trim() || "对方",
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
        const summary = parseSharedHistorySummaryMessage(
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
  }, [visibleMessages]);

  const imageMessages = visibleMessages
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
        "[图片]";
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
    });
  const standaloneViewerItems = useMemo(
    () =>
      imageMessages.map(
        (image): DesktopChatImageViewerSessionItem => ({
          id: image.id,
          imageUrl: image.url,
          title: image.fileName || image.label || "图片",
          meta: image.meta,
          returnTo: image.returnTo,
        }),
      ),
    [imageMessages],
  );
  const unreadMarkerDomId = buildChatUnreadMarkerDomId(threadContext);
  const resolvedUnreadMarkerLabel =
    unreadMarkerLabel ??
    (unreadMarkerCount > 0
      ? `以下是 ${unreadMarkerCount} 条新消息`
      : "以下是新消息");
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
      title: target.fileName || target.label || "图片",
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
          message: "浏览器阻止了新窗口，已改为当前页预览。",
          tone: "warning",
        });
      })
      .catch(() => {
        setViewerMessageId(target.id);
        setActionNotice({
          message: "图片预览打开失败，已改为当前页预览。",
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

    try {
      if (threadContext) {
        if (collected) {
          await removeFavorite(sourceId, baseUrl);
          removeDesktopFavorite(sourceId);
          const nextRemoteFavorites = await queryClient.fetchQuery({
            queryKey: ["app-favorites", baseUrl],
            queryFn: () => getFavorites(baseUrl),
          });
          syncFavoriteSourceIds(nextRemoteFavorites);
          setActionNotice({
            message: "已取消收藏消息。",
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
        });
        syncFavoriteSourceIds(nextRemoteFavorites);
        setActionNotice({
          message: "消息已加入收藏。",
          tone: "success",
        });
        return;
      }

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
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "收藏失败，请稍后再试。",
        tone: "danger",
        actionLabel: collected ? "继续取消收藏" : "继续收藏",
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
            .catch(() => undefined);
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
              message: "打开添加朋友页失败，请稍后重试。",
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
              message: "打开笔记失败，请稍后重试。",
              tone: "danger",
            });
          });
        return;
      }

      setNoteViewerMessageId(message.id);
      return;
    }

    if (attachment.kind === "file") {
      const openFileAttachment = () =>
        openRemoteFile({
          url: resolveAttachmentUrl(attachment.url),
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          dialogTitle: "打开文件",
        });

      const showFileOpenResult = (result: Awaited<ReturnType<typeof openRemoteFile>>) => {
        setActionNotice({
          message: result.message,
          tone: result.opened ? "success" : "danger",
          actionLabel: result.opened ? undefined : "重试打开文件",
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
    const retryLabel = input.kind === "image" ? "重试保存图片" : "重试保存文件";

    void saveRemoteFile({
      url: input.url,
      fileName: input.fileName,
      kind: input.kind,
      dialogTitle: input.kind === "image" ? "保存图片" : "保存文件",
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
              ? "打开位置"
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
                        ? "已打开所在位置。"
                        : "打开所在位置失败，请稍后再试。",
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
        message: "已从当前设备删除这条消息。",
        tone: "success",
      });
      return;
    }

    if (threadContext) {
      deleteMutation.mutate(message);
      return;
    }

    const nextState = hideLocalChatMessage(message.id);
    applyLocalMessageActionState(nextState, message.id);
    setActionNotice({
      message: "已从当前设备删除这条消息。",
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
        message: "已重新尝试发送。",
        tone: "success",
      });
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "重试发送失败，请稍后再试。",
        tone: "danger",
        actionLabel: "继续重试发送",
        onAction: () => {
          void handleRetryMessage(message);
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    }
  };

  const reminderOptions = buildReminderOptions(new Date());

  const handleSetReminder = (message: ChatRenderableMessage) => {
    setReminderTargetMessage(message);
  };

  const handleClearReminder = async (messageId: string) => {
    await clearReminder(messageId);
    setReminderTargetMessage((current) =>
      current?.id === messageId ? null : current,
    );
    setActionNotice({
      message: "已取消这条消息的提醒。",
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
        message: "当前消息暂不支持部分引用。",
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
      message: "已带入所选文字。",
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
          previewText: buildClipboardText(reminderTargetMessage),
        },
      );
      setReminderTargetMessage(null);
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "设置提醒失败，请稍后再试。",
        tone: "danger",
        actionLabel: "继续设置提醒",
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
      const summary = formatReminderSummary(option.remindAt);
      if (permissionState === "granted") {
        setActionNotice({
          message: `已设为消息提醒 · ${summary}，系统通知已开启。`,
          tone: "success",
        });
        return;
      }

      if (permissionState === "denied") {
        setActionNotice({
          message: nativeMobileShareSupported
            ? `已设为消息提醒 · ${summary}，系统通知未开启。可前往系统设置继续打开通知。`
            : `已设为消息提醒 · ${summary}，系统通知未开启。`,
          tone: "warning",
          actionLabel: nativeMobileShareSupported ? "去设置" : undefined,
          onAction: nativeMobileShareSupported
            ? () => {
                void openAppSettings();
              }
            : undefined,
        });
        return;
      }

      setActionNotice({
        message: `已设为消息提醒 · ${summary}。`,
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
        senderName: buildClipboardSender(message),
        previewText: buildForwardPreviewText(message),
        typeLabel: resolveForwardTypeLabel(message),
      })),
    [forwardMessages],
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
      message: `已选择到这里，共 ${nextSelectedMessageIds.length} 条消息。`,
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
        });
        syncFavoriteSourceIds(nextRemoteFavorites);
      } else {
        let nextFavorites = readDesktopFavorites();
        for (const message of messagesToFavorite) {
          nextFavorites = upsertDesktopFavorite(
            buildMessageFavoriteRecord(message, groupMode),
          );
        }

        setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
      }
      resetSelectionMode();
      setActionNotice({
        message:
          messagesToFavorite.length === 1
            ? "已收藏 1 条消息。"
            : `已收藏 ${messagesToFavorite.length} 条消息。`,
        tone: "success",
      });
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "收藏失败，请稍后再试。",
        tone: "danger",
        actionLabel: "继续收藏所选消息",
        onAction: () => {
          void handleFavoriteSelectedMessages();
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    } finally {
      setSelectionActionPending(null);
    }
  };

  const handleDeleteSelectedMessages = async () => {
    const messagesToDelete = [...selectedMessages];
    if (!messagesToDelete.length) {
      return;
    }

    const deletedMessageIdSet = new Set<string>();
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
            continue;
          }

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
        }

        if (nextLocalState) {
          setHiddenMessageIds(nextLocalState.hiddenMessageIds);
          setRecalledMessageIds(nextLocalState.recalledMessageIds);
        }

        if (deletedMessageIdSet.size > 0 && threadContext.type === "group") {
          updateGroupMessageQueries(
            threadContext.id,
            (current) =>
              current?.filter((item) => !deletedMessageIdSet.has(item.id)) ??
              current,
          );
          await queryClient.invalidateQueries({
            queryKey: ["app-group-messages", baseUrl, threadContext.id],
          });
        } else if (deletedMessageIdSet.size > 0) {
          updateConversationMessageQueries(
            threadContext.id,
            (current) =>
              current?.filter((item) => !deletedMessageIdSet.has(item.id)) ??
              current,
          );
          await queryClient.invalidateQueries({
            queryKey: ["app-conversation-messages", baseUrl, threadContext.id],
          });
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

      resetSelectionMode();
      setActionNotice({
        message:
          messagesToDelete.length === 1
            ? "已删除 1 条消息。"
            : `已删除 ${messagesToDelete.length} 条消息。`,
        tone: "success",
      });
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "批量删除失败，请稍后再试。",
        tone: "danger",
        actionLabel: "继续删除所选消息",
        onAction: () => {
          void handleDeleteSelectedMessages();
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    } finally {
      setSelectionActionPending(null);
    }
  };

  const handleRecallSelectedMessages = async () => {
    const messagesToRecall = [...recallableSelectedMessages];
    if (!messagesToRecall.length || !threadContext) {
      return;
    }

    const skippedCount = selectedMessages.length - messagesToRecall.length;
    setSelectionActionPending("recall");

    try {
      if (threadContext.type === "group") {
        const recalledMessageMap = new Map<string, GroupMessage>();
        for (const message of messagesToRecall) {
          const recalledMessage = await recallGroupMessage(
            threadContext.id,
            message.id,
            baseUrl,
          );
          recalledMessageMap.set(recalledMessage.id, recalledMessage);
        }

        updateGroupMessageQueries(
          threadContext.id,
          (current): GroupMessage[] | undefined =>
            current?.map(
              (item): GroupMessage => recalledMessageMap.get(item.id) ?? item,
            ) ?? current,
        );
      } else {
        const recalledMessageMap = new Map<string, Message>();
        for (const message of messagesToRecall) {
          const recalledMessage = await recallConversationMessage(
            threadContext.id,
            message.id,
            baseUrl,
          );
          recalledMessageMap.set(recalledMessage.id, recalledMessage);
        }

        updateConversationMessageQueries(
          threadContext.id,
          (current): Message[] | undefined =>
            current?.map(
              (item): Message => recalledMessageMap.get(item.id) ?? item,
            ) ?? current,
        );
      }

      resetSelectionMode();
      setActionNotice({
        message:
          skippedCount > 0
            ? `已撤回 ${messagesToRecall.length} 条消息，另有 ${skippedCount} 条不支持撤回。`
            : messagesToRecall.length === 1
              ? "已撤回 1 条消息。"
              : `已撤回 ${messagesToRecall.length} 条消息。`,
        tone: "success",
      });

      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    } catch (error) {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "批量撤回失败，请稍后再试。",
        tone: "danger",
        actionLabel: "继续撤回所选消息",
        onAction: () => {
          void handleRecallSelectedMessages();
        },
        secondaryActionLabel: errorActionLabel,
        onSecondaryAction: onErrorAction ?? undefined,
      });
    } finally {
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
            {loadingOlderMessages ? "正在加载更早消息..." : "查看更多消息"}
          </button>
        </div>
      ) : null}
      {selectionMode ? (
        isDesktop ? (
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-[12px] border border-black/6 bg-[#f7f7f7] px-4 py-3 backdrop-blur">
            <div>
              <div className="text-sm text-[color:var(--text-primary)]">
                已选择 {selectedMessageIds.length} 条消息
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                `Shift + 点击` 可连续选择消息
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
                取消
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
                {selectionActionPending === "favorite" ? "收藏中..." : "收藏"}
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
                转发
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
                {selectionActionPending === "recall" ? "撤回中..." : "撤回"}
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
                {selectionActionPending === "delete" ? "删除中..." : "删除"}
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
              取消
            </button>
            <div className="text-[15px] font-medium text-[#111827]">
              已选 {selectedMessageIds.length} 条
            </div>
            <button
              type="button"
              disabled={
                !visibleMessages.length || selectionActionPending !== null
              }
              onClick={handleToggleSelectAllMessages}
              className="flex h-9 min-w-16 items-center justify-end rounded-[10px] px-2.5 text-[15px] font-medium text-[#07c160] transition active:bg-white/80 disabled:text-[#b8b8b8]"
            >
              {allVisibleSelected ? "全不选" : "全选"}
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
          parseSharedHistorySummaryMessage(displayText);
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
              {sharedHistorySummary && !isRecalled ? (
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
                    ? buildRecalledMessageNotice(message)
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
              className={`rounded-[16px] transition-[background-color,box-shadow] duration-300 ${
                isDesktop
                  ? "space-y-1.5 px-2 py-1.5"
                  : continuesMessageRun
                    ? "space-y-0.5 px-1.5 py-0.5"
                    : "space-y-1 px-1.5 py-1"
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
                      aria-label={`查看${message.senderName?.trim() || "联系人"}资料`}
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
                      聊天记录
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
                        replyPreview.quotedText ? "部分引用" : undefined
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
                    />
                  ) : message.type === "image" &&
                    message.attachment?.kind === "image" ? (
                    <ImageMessage
                      url={resolveAttachmentUrl(message.attachment.url)}
                      label={message.attachment.fileName || displayText}
                      variant={variant}
                      maxSize={isDesktop ? 180 : 136}
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => openImagePreview(message.id)
                      }
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
                      已设提醒 ·{" "}
                      {formatReminderSummary(reminderRecord.remindAt)}
                    </div>
                  ) : null}
                  {isUser && !selectionMode && message.localStatus ? (
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-1",
                        isDesktop
                          ? "mt-1 text-[11px]"
                          : "mt-px px-0.5 text-[10px]",
                        message.localStatus === "failed"
                          ? "text-[#d74b45]"
                          : "text-[#8c8c8c]",
                      )}
                    >
                      <span>
                        {message.localStatus === "failed"
                          ? "发送失败"
                          : "发送中..."}
                      </span>
                      {message.localStatus === "failed" && onRetryMessage ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRetryMessage(message);
                          }}
                          className="rounded-full px-1.5 font-medium text-[#d74b45] transition hover:bg-[#fdeceb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(215,75,69,0.22)]"
                        >
                          重试
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
                      aria-label={`查看${ownerName?.trim() || "我的"}资料`}
                    >
                      <AvatarChip
                        name={ownerName ?? "我"}
                        src={ownerAvatar}
                        size={isDesktop ? "wechat" : "sm"}
                      />
                    </button>
                  ) : (
                    <AvatarChip
                      name={ownerName ?? "我"}
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
              label={selectionActionPending === "favorite" ? "收藏中" : "收藏"}
              disabled={
                !selectedMessageIds.length || selectionActionPending !== null
              }
              onClick={handleFavoriteSelectedMessages}
            />
            <SelectionModeActionButton
              icon={<Forward size={17} />}
              label="转发"
              disabled={
                !selectedMessageIds.length || selectionActionPending !== null
              }
              onClick={() => setForwardMessages(selectedMessages)}
            />
            <SelectionModeActionButton
              icon={<RotateCcw size={17} />}
              label={selectionActionPending === "recall" ? "撤回中" : "撤回"}
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
              label={selectionActionPending === "delete" ? "删除中" : "删除"}
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
              ? "取消提醒"
              : "提醒"
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
            contextMenuState.message,
            "desktop",
          )}
          onCopySender={() => {
            void copyToClipboard(
              buildClipboardSender(contextMenuState.message),
              "发送者名称已复制。",
            );
            setContextMenuState(null);
          }}
          onRecall={
            canRecallMessage(contextMenuState.message, threadContext)
              ? () => {
                  recallMutation.mutate(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          recallLabel="撤回"
          onDelete={() => {
            handleDeleteMessage(contextMenuState.message);
            setContextMenuState(null);
          }}
          deleteLabel="删除"
        />
      ) : null}
      <MobileMessageActionSheet
        open={Boolean(mobileActionMessage)}
        onClose={() => setMobileActionMessage(null)}
        title={
          mobileActionMessage?.senderType === "user" ? "我的消息" : "消息操作"
        }
        preview={
          mobileActionMessage
            ? {
                senderName:
                  groupMode && mobileActionMessage.senderType !== "user"
                    ? buildClipboardSender(mobileActionMessage)
                    : undefined,
                text: buildClipboardText(mobileActionMessage),
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
            ? "取消提醒"
            : "提醒"
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
            ? "取消收藏"
            : "收藏"
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
            ? resolveOpenAttachmentLabel(mobileActionMessage, variant)
            : "打开附件"
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
            ? resolveSaveAttachmentLabel(mobileActionMessage, "mobile")
            : "保存附件"
        }
        onRecall={
          mobileActionMessage &&
          canRecallMessage(mobileActionMessage, threadContext)
            ? () => {
                recallMutation.mutate(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        recallLabel="撤回"
        onDelete={
          mobileActionMessage
            ? () => {
                handleDeleteMessage(mobileActionMessage);
                setMobileActionMessage(null);
              }
            : undefined
        }
        deleteLabel="删除"
      />
      <MobileMessageReminderSheet
        open={Boolean(reminderTargetMessage)}
        previewText={
          reminderTargetMessage
            ? buildClipboardText(reminderTargetMessage)
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
            ? buildClipboardSender(quoteSelectionMessage)
            : "消息"
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
                  void openDesktopChatImageViewerWindowOnDemand({
                    imageUrl: activeImage.url,
                    title: activeImage.fileName || activeImage.label || "图片",
                    meta: activeImage.meta,
                    returnTo: activeImage.returnTo,
                    items: standaloneViewerItems,
                    activeId: activeImage.id,
                  }).then((opened) => {
                    if (opened) {
                      setActionNotice({
                        message: "已在独立窗口打开图片。",
                        tone: "success",
                      });
                      return;
                    }

                    setActionNotice({
                      message: "浏览器阻止了新窗口，请检查弹窗权限。",
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
                    title: activeImage.fileName || activeImage.label || "图片",
                    meta: activeImage.meta,
                    returnTo: activeImage.returnTo,
                    items: standaloneViewerItems,
                    activeId: activeImage.id,
                    autoPrint: true,
                  }).then((opened) => {
                    if (opened) {
                      setActionNotice({
                        message: "已打开图片打印视图。",
                        tone: "success",
                      });
                      return;
                    }

                    setActionNotice({
                      message: "浏览器阻止了打印窗口，请检查弹窗权限。",
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
              void forwardMutation.mutateAsync({ conversation, mode });
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

  return threadType === "direct" ? ("mobile-profile" as const) : null;
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
          detailedTimestampMode ? "切换为简略时间显示" : "切换为完整日期显示"
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

function parseSharedHistorySummaryMessage(text: string) {
  const normalized = text.trim();
  const match = normalized.match(/^已分享你和(.+?)的(\d+)条聊天记录$/);
  if (!match) {
    return null;
  }

  return {
    participantName: match[1]?.trim() || "对方",
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
        <span>聊天记录已导入当前群聊</span>
      </div>
      <div
        className={cn(
          "text-[color:var(--text-muted)]",
          isDesktop
            ? "mt-1.5 text-[11px] leading-5"
            : "mt-1 text-[10px] leading-[18px]",
        )}
      >
        来自你和 {summary.participantName} 的 {summary.count} 条消息
      </div>
    </div>
  );
}

function buildRecalledMessageNotice(message: ChatRenderableMessage) {
  const actor =
    message.senderType === "user" ? "你" : message.senderName?.trim() || "对方";
  return `${actor}撤回了一条消息`;
}

function buildReminderOptions(now: Date): MobileMessageReminderOption[] {
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const tonight = new Date(now);
  tonight.setHours(20, 0, 0, 0);
  if (tonight.getTime() <= now.getTime()) {
    tonight.setDate(tonight.getDate() + 1);
  }

  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  return [
    {
      id: "one-hour",
      label: "1 小时后",
      detail: formatReminderSummary(oneHourLater.toISOString()),
      remindAt: oneHourLater.toISOString(),
    },
    {
      id: "tonight",
      label: "今晚 20:00",
      detail: formatReminderSummary(tonight.toISOString()),
      remindAt: tonight.toISOString(),
    },
    {
      id: "tomorrow-morning",
      label: "明天上午 09:00",
      detail: formatReminderSummary(tomorrowMorning.toISOString()),
      remindAt: tomorrowMorning.toISOString(),
    },
  ];
}

function formatReminderSummary(remindAt: string) {
  const date = new Date(remindAt);
  if (Number.isNaN(date.getTime())) {
    return "稍后";
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

  const timeLabel = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (sameYear && sameMonth && sameDate) {
    return `今天 ${timeLabel}`;
  }

  if (isTomorrow) {
    return `明天 ${timeLabel}`;
  }

  return `${date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  })} ${timeLabel}`;
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

  if (message.type === "voice") {
    return message.attachment?.kind === "voice"
      ? `[语音] ${formatVoiceDurationLabel(message.attachment.durationMs)}`
      : "[语音]";
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

  if (message.type === "note_card") {
    return message.attachment?.kind === "note_card"
      ? `[笔记] ${message.attachment.title}`
      : "[笔记]";
  }

  if (message.type === "sticker") {
    return message.attachment?.kind === "sticker" && message.attachment.label
      ? `[表情] ${message.attachment.label}`
      : "[表情]";
  }

  return "消息";
}

function buildForwardPreviewText(message: ChatRenderableMessage) {
  const forwardedText = getForwardMessageText(message);
  if (forwardedText) {
    return forwardedText;
  }

  return buildClipboardText(message);
}

function resolveForwardTypeLabel(message: ChatRenderableMessage) {
  if (message.type === "image") {
    return "图片";
  }

  if (message.type === "file") {
    return "文件";
  }

  if (message.type === "voice") {
    return "语音";
  }

  if (message.type === "contact_card") {
    return "名片";
  }

  if (message.type === "location_card") {
    return "位置";
  }

  if (message.type === "note_card") {
    return "笔记";
  }

  if (message.type === "sticker") {
    return "表情";
  }

  return "消息";
}

function resolveOpenAttachmentLabel(
  message: ChatRenderableMessage,
  variant: "mobile" | "desktop",
) {
  if (message.type === "image") {
    return variant === "desktop" ? "预览图片" : "查看图片";
  }

  if (message.type === "file") {
    return "打开文件";
  }

  if (message.type === "contact_card") {
    return "查看名片";
  }

  if (message.type === "location_card") {
    return "查看位置";
  }

  if (message.type === "note_card") {
    return variant === "desktop" ? "打开笔记" : "查看笔记摘要";
  }

  return "打开附件";
}

function resolveSaveAttachmentLabel(
  message: ChatRenderableMessage,
  variant: "mobile" | "desktop",
) {
  if (message.type === "contact_card") {
    return isNativeMobileShareSurface({
      isDesktopLayout: variant === "desktop",
    })
      ? "系统分享"
      : "复制名片";
  }

  if (message.type === "location_card") {
    return isNativeMobileShareSurface({
      isDesktopLayout: variant === "desktop",
    })
      ? "系统分享"
      : "复制位置";
  }

  if (message.type === "image") {
    return variant === "mobile" ? "保存图片" : "另存图片";
  }

  if (message.type === "file") {
    return variant === "mobile" ? "保存文件" : "另存文件";
  }

  return variant === "mobile" ? "保存附件" : "另存为";
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
  baseUrl?: string;
  conversation: ConversationListItem;
  message: ChatRenderableMessage;
}) {
  if (isPersistedGroupConversation(input.conversation)) {
    const payload = buildGroupForwardPayload(input.message);
    if (!payload) {
      throw new Error("当前消息暂不支持转发到群聊。");
    }

    await sendGroupMessage(input.conversation.id, payload, input.baseUrl);
    return;
  }

  const payload = buildDirectForwardPayload(input.conversation, input.message);
  if (!payload) {
    throw new Error("这条单聊暂时没有可用的角色目标，无法完成转发。");
  }

  joinConversationRoom({ conversationId: input.conversation.id });
  emitChatMessage(payload);
}

async function forwardMergedMessagesToConversation(input: {
  baseUrl?: string;
  conversation: ConversationListItem;
  messages: ChatRenderableMessage[];
}) {
  const mergedText = buildMergedForwardText(input.messages);
  if (!mergedText) {
    throw new Error("当前没有可合并转发的消息内容。");
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
    throw new Error("这条单聊暂时没有可用的角色目标，无法完成转发。");
  }

  joinConversationRoom({ conversationId: input.conversation.id });
  emitChatMessage({
    conversationId: input.conversation.id,
    characterId,
    text: mergedText,
  });
}

function buildGroupForwardPayload(
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
    text: text ?? buildClipboardText(message),
  };
}

function buildDirectForwardPayload(
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
    text: text ?? buildClipboardText(message),
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
      label: stripFileExtension(message.attachment.fileName) || "图片表情",
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

function buildMergedForwardText(messages: ChatRenderableMessage[]) {
  const sections = messages
    .map((message) => {
      const sender = buildClipboardSender(message);
      const body = buildClipboardText(message).trim();
      if (!body) {
        return null;
      }

      return `${sender}: ${body}`;
    })
    .filter((item): item is string => Boolean(item));

  if (!sections.length) {
    return "";
  }

  return ["[聊天记录]", ...sections].join("\n");
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
          回复 {senderName}
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
  onOpen,
}: {
  url: string;
  label: string;
  variant: "mobile" | "desktop";
  maxSize: number;
  onOpen?: () => void;
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
        {label || "[图片]"}
      </div>
    );
  }

  const image = (
    <img
      src={url}
      alt={label}
      onError={() => setLoadFailed(true)}
      className={`bg-white object-cover shadow-none ${
        isDesktop
          ? "rounded-[16px] border border-black/6"
          : "rounded-[13px] border border-[color:var(--border-subtle)]"
      }`}
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
      className={`transition hover:opacity-95 ${isDesktop ? "cursor-zoom-in" : ""}`}
      aria-label={`${isDesktop ? "预览图片" : "查看图片"} ${label}`}
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
      aria-label={checked ? "取消选择消息" : "选择消息"}
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
          {recommendation.badgeLabel || "继续聊"}
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
            {attachment.relationship || "世界联系人"}
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
        <span>{recommendation ? "推荐联系人" : "角色名片"}</span>
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
      aria-label={`查看名片 ${attachment.name}`}
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
  const previewImage = attachment.assets.find(
    (asset) => asset.kind === "image",
  );
  const fileCount = attachment.assets.filter(
    (asset) => asset.kind === "file",
  ).length;
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
            alt={attachment.title}
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
            收藏笔记
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
          {attachment.title}
        </div>
        <div
          className={`line-clamp-3 text-[color:var(--text-muted)] ${
            isDesktop ? "text-xs leading-5" : "text-[11px] leading-[18px]"
          }`}
        >
          {attachment.excerpt || "点击查看完整笔记"}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.06)] pt-2.5">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {attachment.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]"
              >
                #{tag}
              </span>
            ))}
          </div>
          <div className="shrink-0 text-[10px] tracking-[0.12em] text-[color:var(--text-dim)]">
            {fileCount ? `${fileCount} 个文件` : "笔记"}
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
      aria-label={`${variant === "desktop" ? "打开笔记" : "查看笔记摘要"} ${attachment.title}`}
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
        文件
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
      aria-label={`打开文件 ${attachment.fileName}`}
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
        <span>位置</span>
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
      aria-label={`查看位置 ${attachment.title}`}
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

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
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
        aria-label={playing ? "暂停语音" : "播放语音"}
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
            群接龙
          </div>
          <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
            {summary.sourceGroupName}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <ResultCardBadge
            tone={summary.publishedSource === "mobile" ? "info" : "warning"}
            label={
              summary.publishedSource === "mobile" ? "手机回填" : "桌面回填"
            }
          />
          {summary.launchSourceLabel ? (
            <ResultCardBadge
              tone="neutral"
              label={
                summary.launchSource === "mobile" ? "手机发起" : "桌面发起"
              }
            />
          ) : null}
          {summary.statusLabel ? (
            <ResultCardBadge
              tone={
                summary.statusLabel === "已回填"
                  ? "success"
                  : summary.statusLabel === "已完成"
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
            label="时间"
            value={summary.timestampLabel}
            variant={variant}
          />
        ) : null}
        {completionTimeLabel ? (
          <ResultCardMetric
            label="完成时间"
            value={completionTimeLabel}
            variant={variant}
          />
        ) : null}
        {typeof publishRangeLabel === "string" ? (
          <ResultCardMetric
            label="起止时间"
            value={publishRangeLabel}
            variant={variant}
          />
        ) : null}
        {summary.activeRelayCountLabel ? (
          <ResultCardMetric
            label="进行中"
            value={summary.activeRelayCountLabel}
            variant={variant}
          />
        ) : null}
        {summary.pendingMemberCountLabel ? (
          <ResultCardMetric
            label="待确认"
            value={summary.pendingMemberCountLabel}
            variant={variant}
          />
        ) : null}
        {summary.publishCountLabel ? (
          <ResultCardMetric
            label="回填次数"
            value={summary.publishCountLabel}
            variant={variant}
          />
        ) : null}
        {summary.resultSummaryLabel ? (
          <ResultCardMetric
            label="结果摘要"
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
  if (isSystem || message.senderType === "user") {
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
            {invite.kind === "voice" ? "群语音通话" : "群视频通话"}
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
                ? "已结束"
                : invite.sourceLabel
                  ? `${invite.sourceLabel}发起`
                  : "桌面发起"
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
          label="当前状态"
          value={formatGroupCallStatusLabel(invite.kind, invite.status)}
          variant={variant}
        />
        {invite.timestampLabel ? (
          <ResultCardMetric
            label="时间"
            value={invite.timestampLabel}
            variant={variant}
          />
        ) : null}
        {invite.status === "ended" && invite.startedAt && invite.recordedAt ? (
          <ResultCardMetric
            label="起止时间"
            value={formatGroupCallRangeSummary(
              invite.startedAt,
              invite.recordedAt,
            )}
            variant={variant}
          />
        ) : null}
        {invite.durationLabel ? (
          <ResultCardMetric
            label="本轮时长"
            value={invite.durationLabel}
            variant={variant}
          />
        ) : null}
        {invite.sourceLabel ? (
          <ResultCardMetric
            label="发起端"
            value={invite.sourceLabel}
            variant={variant}
          />
        ) : null}
        {invite.snapshotLabel ? (
          <ResultCardMetric
            label="人数快照"
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
              label="当前在线"
              value={`${invite.activeCount.current}/${invite.activeCount.total}`}
              variant={variant}
            />
            <ResultCardMetric
              label="待加入"
              value={`${invite.waitingCount ?? Math.max(invite.activeCount.total - invite.activeCount.current, 0)} 人`}
              variant={variant}
            />
          </div>
        ) : null}
        {invite.summaryLines.map((line) => (
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
            {invite.kind === "voice" ? "语音通话" : "视频通话"}
          </div>
          <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
            {invite.title}
          </div>
        </div>
        <ResultCardBadge
          tone={invite.connectionStatus === "ended" ? "danger" : "info"}
          label={
            invite.connectionStatus === "ended"
              ? "已结束"
              : invite.sourceLabel
                ? `${invite.sourceLabel}发起`
                : "桌面发起"
          }
        />
      </div>

      <div className={isDesktop ? "mt-3 space-y-2" : "mt-2.5 space-y-1.5"}>
        {invite.connectionStatus ? (
          <ResultCardMetric
            label="当前状态"
            value={resolveDirectCallStatusLabel(invite)}
            variant={variant}
          />
        ) : null}
        {invite.timestampLabel ? (
          <ResultCardMetric
            label="时间"
            value={invite.timestampLabel}
            variant={variant}
          />
        ) : null}
        {invite.durationLabel ? (
          <ResultCardMetric
            label="最近一轮"
            value={invite.durationLabel}
            variant={variant}
          />
        ) : null}
        {invite.sourceLabel ? (
          <ResultCardMetric
            label="发起端"
            value={invite.sourceLabel}
            variant={variant}
          />
        ) : null}
        {invite.summaryLines.map((line) => (
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
}: {
  url: string;
  label: string;
  maxSize: number;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [url]);

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
        aria-label="关闭图片查看器"
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
                <ViewerActionButton label="新窗口打开" onClick={onOpenInWindow}>
                  <ExternalLink size={16} />
                </ViewerActionButton>
              ) : null}
              {onPrint ? (
                <ViewerActionButton label="打印图片" onClick={onPrint}>
                  <Printer size={16} />
                </ViewerActionButton>
              ) : null}
              <ViewerActionButton label="保存图片" onClick={onSave}>
                <Download size={16} />
              </ViewerActionButton>
              <ViewerActionButton label="定位到聊天位置" onClick={onLocate}>
                <LocateFixed size={16} />
              </ViewerActionButton>
              <ViewerActionButton label="关闭图片查看器" onClick={onClose}>
                <X size={16} />
              </ViewerActionButton>
            </div>
          </div>

          {onPrevious ? (
            <ViewerNavButton
              side="left"
              label="上一张图片"
              onClick={onPrevious}
            >
              <ChevronLeft size={22} />
            </ViewerNavButton>
          ) : null}
          {onNext ? (
            <ViewerNavButton side="right" label="下一张图片" onClick={onNext}>
              <ChevronRight size={22} />
            </ViewerNavButton>
          ) : null}
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-10 flex items-start justify-between gap-3 px-3 text-white">
            <ViewerActionButton
              compact
              label="关闭图片查看器"
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
            <ViewerActionButton compact label="保存图片" onClick={onSave}>
              <Download size={16} />
            </ViewerActionButton>
          </div>

          {total > 1 ? (
            <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] z-10 px-6 text-center text-xs text-white/70">
              左右滑动切换图片
            </div>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/10 bg-[rgba(15,23,42,0.58)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 backdrop-blur-xl">
            <div className="flex items-center justify-center gap-3">
              <ViewerActionButton
                compact
                label="定位到聊天位置"
                onClick={onLocate}
              >
                <LocateFixed size={16} />
              </ViewerActionButton>
              {onPrevious ? (
                <ViewerActionButton
                  compact
                  label="上一张图片"
                  onClick={onPrevious}
                >
                  <ChevronLeft size={18} />
                </ViewerActionButton>
              ) : null}
              {onNext ? (
                <ViewerActionButton compact label="下一张图片" onClick={onNext}>
                  <ChevronRight size={18} />
                </ViewerActionButton>
              ) : null}
            </div>
          </div>
        </>
      )}

      <div
        className={`absolute inset-0 flex items-center justify-center ${
          isDesktop
            ? "px-24 pb-10 pt-24"
            : "px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.75rem)] pt-24"
        }`}
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

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(5,10,20,0.88)] backdrop-blur-md">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label="关闭位置查看器"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.22),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.12),rgba(15,23,42,0.72))]" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top,0px),1rem)] text-white">
          <div>
            <div className="text-[12px] uppercase tracking-[0.18em] text-white/60">
              聊天位置
            </div>
            <div className="mt-1 text-[18px] font-medium">
              {attachment.title}
            </div>
          </div>
          <ViewerActionButton compact label="关闭位置查看器" onClick={onClose}>
            <X size={18} />
          </ViewerActionButton>
        </div>

        <div className="relative flex-1 px-4 pb-5 pt-2">
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
                来自聊天中的位置卡片
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
                        "这条位置消息来自当前聊天场景，可继续回到消息定位。"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2">
          <ViewerActionButton
            label={nativeMobileShareSupported ? "系统分享" : "复制位置"}
            onClick={onShareOrCopy}
          >
            {nativeMobileShareSupported ? (
              <Share2 size={16} />
            ) : (
              <Copy size={16} />
            )}
          </ViewerActionButton>
          <ViewerActionButton label="定位消息" onClick={onLocate}>
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
  onClose,
  onLocate,
  onShareOrCopy,
}: {
  attachment: Extract<MessageAttachment, { kind: "note_card" }>;
  previewImageUrl: string | null;
  onClose: () => void;
  onLocate: () => void;
  onShareOrCopy: () => void;
}) {
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const imageCount = attachment.assets.filter(
    (asset) => asset.kind === "image",
  ).length;
  const fileCount = attachment.assets.filter(
    (asset) => asset.kind === "file",
  ).length;
  const updatedAtLabel = formatMessageTimestamp(attachment.updatedAt);

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(5,10,20,0.88)] backdrop-blur-md">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label="关闭笔记预览"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(7,193,96,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.12),rgba(15,23,42,0.74))]" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top,0px),1rem)] text-white">
          <div>
            <div className="text-[12px] uppercase tracking-[0.18em] text-white/60">
              聊天笔记
            </div>
            <div className="mt-1 text-[18px] font-medium">笔记摘要</div>
          </div>
          <ViewerActionButton compact label="关闭笔记预览" onClick={onClose}>
            <X size={18} />
          </ViewerActionButton>
        </div>

        <div className="min-h-0 flex-1 px-4 pb-5 pt-2">
          <div className="mx-auto flex h-full max-w-xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[rgba(10,15,28,0.56)] shadow-[0_32px_80px_rgba(0,0,0,0.28)]">
            {previewImageUrl ? (
              <div className="relative h-48 overflow-hidden border-b border-white/10 bg-black/20">
                <img
                  src={previewImageUrl}
                  alt={attachment.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.08),rgba(15,23,42,0.32))]" />
              </div>
            ) : (
              <div className="flex h-40 items-end border-b border-white/10 bg-[linear-gradient(160deg,rgba(243,246,245,0.2),rgba(221,230,227,0.1))] px-5 py-5">
                <div className="rounded-[16px] border border-white/12 bg-white/10 px-4 py-2 text-[12px] tracking-[0.18em] text-white/72">
                  收藏笔记
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto px-5 py-5 text-white">
              <div className="text-[22px] font-semibold leading-8">
                {attachment.title}
              </div>
              <div className="mt-2 text-[12px] text-white/62">
                最近更新于 {updatedAtLabel}
              </div>

              <div className="mt-4 rounded-[20px] border border-white/10 bg-white/6 px-4 py-4 text-[14px] leading-7 text-white/82">
                {attachment.excerpt?.trim() || "这条笔记暂时没有可展示的摘要内容。"}
              </div>

              {attachment.tags.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {attachment.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[rgba(255,255,255,0.12)] bg-white/8 px-3 py-1 text-[11px] text-white/78"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                <NoteViewerMetric
                  label="图片"
                  value={imageCount > 0 ? `${imageCount} 张` : "无"}
                />
                <NoteViewerMetric
                  label="文件"
                  value={fileCount > 0 ? `${fileCount} 个` : "无"}
                />
                <NoteViewerMetric
                  label="内容"
                  value={attachment.excerpt?.trim() ? "有摘要" : "待补充"}
                />
              </div>

              <div className="mt-5 rounded-[18px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] px-4 py-3 text-[12px] leading-6 text-white/70">
                手机端当前提供笔记摘要预览；完整编辑与详情工作区仍需在桌面布局中打开。
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2">
          <ViewerActionButton
            label={nativeMobileShareSupported ? "系统分享" : "复制摘要"}
            onClick={onShareOrCopy}
          >
            {nativeMobileShareSupported ? (
              <Share2 size={16} />
            ) : (
              <Copy size={16} />
            )}
          </ViewerActionButton>
          <ViewerActionButton label="定位消息" onClick={onLocate}>
            <FileText size={16} />
          </ViewerActionButton>
        </div>
      </div>
    </div>
  );
}

function NoteViewerMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/6 px-3.5 py-3 text-center">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/52">
        {label}
      </div>
      <div className="mt-2 text-[14px] font-medium text-white">{value}</div>
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
    `${attachment.name} 的隐界名片`,
    attachment.relationship?.trim() || "世界联系人",
    `隐界号：yinjie_${attachment.characterId.slice(0, 8)}`,
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
    attachment.excerpt?.trim() || "这是一条来自聊天中的收藏笔记。",
    attachment.tags.length
      ? `标签：${attachment.tags.map((tag) => `#${tag}`).join(" ")}`
      : null,
    imageCount > 0 ? `图片：${imageCount} 张` : null,
    fileCount > 0 ? `文件：${fileCount} 个` : null,
    `更新于 ${formatMessageTimestamp(attachment.updatedAt)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveNotePreviewImageUrl(
  attachment: Extract<MessageAttachment, { kind: "note_card" }>,
  resolveAttachmentUrl: (url: string) => string,
) {
  const previewImage = attachment.assets.find((asset) => asset.kind === "image");
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
