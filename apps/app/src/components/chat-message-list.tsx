import {
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
import { useNavigate } from "@tanstack/react-router";
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
} from "@yinjie/contracts";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";
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
import {
  DesktopMessageForwardDialog,
  type DesktopMessageForwardMode,
  type DesktopMessageForwardPreviewItem,
} from "../features/desktop/chat/desktop-message-forward-dialog";
import {
  openDesktopChatImageViewerWindow,
  type DesktopChatImageViewerSessionItem,
} from "../features/desktop/chat/desktop-chat-image-viewer-route-state";
import {
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import {
  extractChatReplyMetadata,
  sanitizeDisplayedChatText,
  splitChatTextSegments,
} from "../lib/chat-text";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import {
  formatDetailedMessageTimestamp,
  formatMessageTimestamp,
  parseTimestamp,
} from "../lib/format";
import { emitChatMessage, joinConversationRoom } from "../lib/socket";
import { requestNotificationPermission } from "../runtime/mobile-bridge";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { buildChatUnreadMarkerDomId } from "../features/chat/chat-unread-marker";
import { DigitalHumanEntryNotice } from "../features/chat/digital-human-entry-notice";
import { useMessageReminders } from "../features/chat/use-message-reminders";
import { useDigitalHumanEntryGuard } from "../features/chat/use-digital-human-entry-guard";
import {
  parseDirectCallInviteMessage,
  formatGroupCallStatusLabel,
  parseGroupCallInviteMessage,
  type CallInviteSource,
} from "../features/chat/group-call-message";
import { parseGroupRelaySummaryMessage } from "../features/mini-programs/group-relay-message";

export type ChatRenderableMessage = {
  id: string;
  senderType: string;
  senderName?: string | null;
  type?: string | null;
  text: string;
  attachment?: MessageAttachment;
  createdAt: string;
};

type OpenableAttachment =
  | Extract<MessageAttachment, { kind: "image" }>
  | Extract<MessageAttachment, { kind: "file" }>
  | Extract<MessageAttachment, { kind: "contact_card" }>
  | Extract<MessageAttachment, { kind: "location_card" }>;

type SaveableAttachment =
  | Extract<MessageAttachment, { kind: "image" }>
  | Extract<MessageAttachment, { kind: "file" }>;

type ChatMessageListProps = {
  messages: ChatRenderableMessage[];
  threadContext?: {
    id: string;
    type: "direct" | "group";
    title?: string;
  };
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
};

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
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[14px] border border-black/6 bg-white text-[12px] transition active:bg-[#f5f5f5] disabled:bg-[#f8f8f8] disabled:text-[#b8b8b8] ${
        danger ? "text-[#d74b45]" : "text-[#111827]"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function ChatMessageList({
  messages,
  threadContext,
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
  onOpenDirectCallInvite,
  onOpenGroupCallInvite,
  onSelectionModeChange,
}: ChatMessageListProps) {
  const isDesktop = variant === "desktop";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "";
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
    tone: "success" | "danger";
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [selectionAnchorMessageId, setSelectionAnchorMessageId] = useState<
    string | null
  >(null);
  const [selectionActionPending, setSelectionActionPending] = useState<
    "favorite" | "delete" | "recall" | null
  >(null);
  const [forwardMessages, setForwardMessages] = useState<
    ChatRenderableMessage[] | null
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
    readDetailedTimestampMode(),
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

    const timer = window.setTimeout(() => setActionNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  useEffect(() => {
    setPendingDirectCallInvite(null);
    resetEntryGuard();
  }, [resetEntryGuard, threadContext?.id]);

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
      current.filter((item) => messages.some((message) => message.id === item)),
    );
    setForwardMessages((current) =>
      current?.length
        ? current.filter((item) =>
            messages.some((message) => message.id === item.id),
          )
        : null,
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
  }, [messages]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    writeDetailedTimestampMode(detailedTimestampMode);
  }, [detailedTimestampMode]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setSelectionAnchorMessageId(null);
    setForwardMessages(null);
  }, [isDesktop]);

  useEffect(() => {
    if (selectionMode) {
      return;
    }

    setSelectedMessageIds([]);
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
      setFavoriteSourceIds(
        mergeDesktopFavoriteRecords(remoteFavorites, readDesktopFavorites()).map(
          (item) => item.sourceId,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    syncFavoriteSourceIds(favoritesQuery.data ?? []);
  }, [favoritesQuery.data, syncFavoriteSourceIds]);

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
    onError: (error) => {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "转发失败，请稍后再试。",
        tone: "danger",
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
    onError: (error) => {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "撤回失败，请稍后再试。",
        tone: "danger",
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
    onError: (error) => {
      setActionNotice({
        message:
          error instanceof Error ? error.message : "删除失败，请稍后再试。",
        tone: "danger",
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
    unreadMarkerMessageId && collapsedMessageRedirects.has(unreadMarkerMessageId)
      ? collapsedMessageRedirects.get(unreadMarkerMessageId) ?? null
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
      const returnTo = threadContext
        ? threadContext.type === "group"
          ? `/group/${threadContext.id}#chat-message-${message.id}`
          : `/chat/${threadContext.id}#chat-message-${message.id}`
        : undefined;
      const meta = threadContext?.title?.trim()
        ? `${threadContext.title} · ${formatMessageTimestamp(message.createdAt)}`
        : formatMessageTimestamp(message.createdAt);

      return {
        id: message.id,
        url: message.attachment.url,
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

  const openImageByIndex = (nextIndex: number) => {
    const target = imageMessages[nextIndex];
    if (!target) {
      return;
    }

    setViewerMessageId(target.id);
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
      });
    }
  };

  const openAttachment = (message: ChatRenderableMessage) => {
    if (message.type === "image" && message.attachment?.kind === "image") {
      setViewerMessageId(message.id);
      return;
    }

    const attachment = getOpenableAttachment(message);
    if (!attachment) {
      return;
    }

    if (attachment.kind === "contact_card") {
      void navigate({
        to: "/character/$characterId",
        params: {
          characterId: attachment.characterId,
        },
      });
      return;
    }

    if (attachment.kind === "location_card") {
      setLocationViewerMessageId(message.id);
      return;
    }

    if (attachment.kind === "file") {
      window.open(attachment.url, "_blank", "noopener,noreferrer");
      setActionNotice({
        message: "已打开文件。",
        tone: "success",
      });
    }
  };

  const saveAttachment = (message: ChatRenderableMessage) => {
    const attachment = getSaveableAttachment(message);
    if (!attachment || typeof document === "undefined") {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = attachment.url;
    anchor.download =
      attachment.kind === "file"
        ? attachment.fileName
        : attachment.fileName || "image";
    anchor.rel = "noreferrer";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    setActionNotice({
      message:
        attachment.kind === "image" ? "图片开始下载。" : "文件开始下载。",
      tone: "success",
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
      });
      return;
    }

    void requestNotificationPermission().then((permissionState) => {
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
          message: `已设为消息提醒 · ${summary}，系统通知未开启。`,
          tone: "success",
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

    const deletedMessageIdSet = new Set(
      messagesToDelete.map((message) => message.id),
    );
    setSelectionActionPending("delete");

    try {
      if (threadContext) {
        for (const message of messagesToDelete) {
          if (threadContext.type === "group") {
            await deleteGroupMessage(threadContext.id, message.id, baseUrl);
          } else {
            await deleteConversationMessage(
              threadContext.id,
              message.id,
              baseUrl,
            );
          }
          clearTransientMessageState(message.id);
        }

        if (threadContext.type === "group") {
          updateGroupMessageQueries(
            threadContext.id,
            (current) =>
              current?.filter((item) => !deletedMessageIdSet.has(item.id)) ??
              current,
          );
          await queryClient.invalidateQueries({
            queryKey: ["app-group-messages", baseUrl, threadContext.id],
          });
        } else {
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

        await queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      } else {
        let nextState = readLocalChatMessageActionState();
        for (const message of messagesToDelete) {
          nextState = hideLocalChatMessage(message.id);
        }

        setHiddenMessageIds(nextState.hiddenMessageIds);
        setRecalledMessageIds(nextState.recalledMessageIds);
        setViewerMessageId((current) =>
          current && deletedMessageIdSet.has(current) ? null : current,
        );
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
      });
    } finally {
      setSelectionActionPending(null);
    }
  };

  return (
    <div className={isDesktop ? "space-y-4" : "space-y-4"}>
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
        <InlineNotice className="text-xs" tone={actionNotice.tone}>
          {actionNotice.message}
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
                : "inline-flex min-h-8 items-center justify-center rounded-full bg-[rgba(0,0,0,0.08)] px-3.5 text-[12px] text-[#7d7d7d] transition active:bg-[rgba(0,0,0,0.12)] disabled:opacity-60"
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
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-black/6 bg-[rgba(247,247,247,0.96)] px-1 py-2.5 backdrop-blur-xl">
            <button
              type="button"
              onClick={resetSelectionMode}
              className="flex h-10 min-w-12 items-center justify-start rounded-[10px] px-2 text-[16px] text-[#111827]"
            >
              取消
            </button>
            <div className="text-[16px] font-medium text-[#111827]">
              已选 {selectedMessageIds.length} 条
            </div>
            <button
              type="button"
              disabled={
                !visibleMessages.length || selectionActionPending !== null
              }
              onClick={handleToggleSelectAllMessages}
              className="flex h-10 min-w-16 items-center justify-end rounded-[10px] px-2 text-[16px] font-medium text-[#07c160] disabled:text-[#b8b8b8]"
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
        const isRecalled =
          message.senderType === "user" && recalledMessageIdSet.has(message.id);
        const isSystem =
          message.type === "system" || message.senderType === "system";
        const isHighlighted = message.id === resolvedHighlightedMessageId;
        const isSelected = selectedMessageIdSet.has(message.id);
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

        if (isSystem || isRecalled) {
          return (
            <div key={message.id} className="space-y-2">
              {resolvedUnreadMarkerMessageId === message.id ? (
                <UnreadMarkerDivider
                  id={unreadMarkerDomId}
                  label={resolvedUnreadMarkerLabel}
                  variant={variant}
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
                  className={`mx-auto max-w-[84%] rounded-full px-3 py-1.5 text-center text-[11px] text-[color:var(--text-muted)] ${
                    isDesktop
                      ? "border border-black/6 bg-[#f7f7f7]"
                      : "border border-black/5 bg-[rgba(255,255,255,0.82)] shadow-none"
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
              <div className="pb-2 pt-1 text-center">
                <button
                  type="button"
                  onClick={() =>
                    setDetailedTimestampMode((current) => !current)
                  }
                  className={
                    isDesktop
                      ? "inline-flex rounded-full bg-transparent px-2.5 py-0.5 text-[11px] text-[#9a9a9a] transition hover:bg-white/50"
                      : "inline-flex rounded-full bg-[rgba(0,0,0,0.08)] px-3 py-1 text-[11px] text-[#7d7d7d] transition active:bg-[rgba(0,0,0,0.12)]"
                  }
                  aria-label={
                    detailedTimestampMode
                      ? "切换为简略时间显示"
                      : "切换为完整日期显示"
                  }
                >
                  {detailedTimestampMode
                    ? formatDetailedMessageTimestamp(message.createdAt)
                    : formatMessageTimestamp(message.createdAt)}
                </button>
              </div>
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
              className={`space-y-1.5 rounded-[16px] px-2 py-1.5 transition-[background-color,box-shadow] duration-300 ${
                isHighlighted
                  ? "bg-[rgba(255,224,120,0.15)] shadow-[0_0_0_1px_rgba(255,191,0,0.16)]"
                  : isSelected
                    ? "bg-[rgba(7,193,96,0.08)] shadow-[0_0_0_1px_rgba(7,193,96,0.16)]"
                    : ""
              }`}
            >
              <div
                className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && selectionMode ? (
                  <SelectionToggle
                    checked={isSelected}
                    onClick={() => toggleSelectedMessage(message.id)}
                  />
                ) : null}
                {!isUser ? (
                  <AvatarChip name={message.senderName} size="wechat" />
                ) : null}
                <div
                  className={`flex max-w-[78%] flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  {isSharedHistoryMessage ? (
                    <div
                      className={cn(
                        "mb-1 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium",
                        isUser
                          ? "bg-[rgba(148,163,184,0.18)] text-[color:var(--text-secondary)]"
                          : "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-secondary)]",
                      )}
                    >
                      聊天记录
                    </div>
                  ) : null}
                  {!isUser && groupMode && showGroupMemberNicknames ? (
                    <div className="mb-1 px-1 text-[10px] text-[color:var(--text-muted)]">
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
                      maxSize={isDesktop ? 160 : 132}
                    />
                  ) : message.type === "image" &&
                    message.attachment?.kind === "image" ? (
                    <ImageMessage
                      url={message.attachment.url}
                      label={message.attachment.fileName || displayText}
                      maxSize={isDesktop ? 180 : 144}
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => setViewerMessageId(message.id)
                      }
                    />
                  ) : message.type === "file" &&
                    message.attachment?.kind === "file" ? (
                    <FileAttachmentMessage
                      attachment={message.attachment}
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
                      own={isUser}
                    />
                  ) : message.type === "contact_card" &&
                    message.attachment?.kind === "contact_card" ? (
                    <ContactCardMessage
                      attachment={message.attachment}
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
                      onOpen={
                        selectionMode
                          ? undefined
                          : () => openAttachment(message)
                      }
                    />
                  ) : directCallInvite ? (
                    <DirectCallInviteMessage
                      own={isUser}
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
                                    : groupCallInvite.activeCount?.current ??
                                      null,
                                totalCount:
                                  groupCallInvite.status === "ended"
                                    ? null
                                    : groupCallInvite.activeCount?.total ?? null,
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
                                to: "/tabs/mini-programs",
                                search: `?${query.toString()}`,
                              });
                            }
                      }
                    />
                  ) : (
                    <div
                      className={`rounded-[16px] px-3.5 py-2.5 text-[15px] leading-6 ${
                        isUser
                          ? isDesktop
                            ? "bg-[#95ec69] text-[#111827] shadow-none"
                            : "bg-[#95ec69] text-[#111827] [animation:bubble-in_220ms_cubic-bezier(0.22,1,0.36,1)] shadow-none"
                          : isDesktop
                            ? "border border-black/6 bg-white text-[color:var(--text-primary)] shadow-none"
                            : "border border-black/5 bg-white text-[color:var(--text-primary)] shadow-none"
                      } whitespace-pre-wrap break-words`}
                    >
                      {renderTextWithMentions(displayText)}
                    </div>
                  )}
                  {reminderRecord ? (
                    <div className="mt-1 px-1 text-[11px] text-[#8c8c8c]">
                      已设提醒 ·{" "}
                      {formatReminderSummary(reminderRecord.remindAt)}
                    </div>
                  ) : null}
                </div>
                {isUser ? <AvatarChip name="我" size="wechat" /> : null}
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
        <div className="sticky bottom-0 z-20 border-t border-black/6 bg-[rgba(247,247,247,0.98)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] pt-2.5 backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-2">
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
          )}
          onSaveAttachment={
            getSaveableAttachment(contextMenuState.message)
              ? () => {
                  saveAttachment(contextMenuState.message);
                  setContextMenuState(null);
                }
              : undefined
          }
          saveAttachmentLabel={
            contextMenuState.message.type === "image" ? "另存图片" : "另存文件"
          }
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
            ? resolveOpenAttachmentLabel(mobileActionMessage)
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
          mobileActionMessage?.type === "image" ? "保存图片" : "保存文件"
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
            saveUrlAsFile(
              activeImage.url,
              activeImage.fileName || activeImage.label || "image",
            )
          }
          onOpenInWindow={
            isDesktop
              ? () => {
                  if (
                    openDesktopChatImageViewerWindow({
                      imageUrl: activeImage.url,
                      title:
                        activeImage.fileName || activeImage.label || "图片",
                      meta: activeImage.meta,
                      returnTo: activeImage.returnTo,
                      items: standaloneViewerItems,
                      activeId: activeImage.id,
                    })
                  ) {
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
                }
              : undefined
          }
          onPrint={
            isDesktop
              ? () => {
                  if (
                    openPrintWindow({
                      title:
                        activeImage.fileName || activeImage.label || "图片",
                      imageUrl: activeImage.url,
                    })
                  ) {
                    setActionNotice({
                      message: "已打开图片打印窗口。",
                      tone: "success",
                    });
                    return;
                  }

                  setActionNotice({
                    message: "浏览器阻止了打印窗口，请检查弹窗权限。",
                    tone: "danger",
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
          onCopy={() => {
            void copyToClipboard(
              buildLocationAttachmentSummary(activeLocation.attachment),
              "位置内容已复制。",
            );
          }}
        />
      ) : null}
      <DesktopMessageForwardDialog
        open={Boolean(forwardMessages?.length)}
        messages={forwardPreviewItems}
        conversations={forwardConversationsQuery.data ?? []}
        supportsSeparateMode={(forwardMessages ?? []).every(canForwardMessage)}
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
    </div>
  );
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
    <div id={id} className="flex items-center gap-3 py-1.5">
      <div
        className={
          isDesktop ? "h-px flex-1 bg-black/8" : "h-px flex-1 bg-black/8"
        }
      />
      <div
        className={
          isDesktop
            ? "rounded-full border border-black/6 bg-[#f7f7f7] px-3 py-1 text-[11px] font-medium text-[#7f7f7f]"
            : "rounded-full bg-[rgba(7,193,96,0.12)] px-3 py-1 text-[11px] font-medium text-[#07a35a]"
        }
      >
        {label}
      </div>
      <div
        className={
          isDesktop ? "h-px flex-1 bg-black/10" : "h-px flex-1 bg-black/8"
        }
      />
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

const DETAILED_TIMESTAMP_MODE_STORAGE_KEY = "chat-detailed-timestamp-mode";

function readDetailedTimestampMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.localStorage.getItem(DETAILED_TIMESTAMP_MODE_STORAGE_KEY) === "1"
  );
}

function writeDetailedTimestampMode(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DETAILED_TIMESTAMP_MODE_STORAGE_KEY,
    enabled ? "1" : "0",
  );
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
        "mx-auto max-w-[84%] rounded-[16px] border px-4 py-3 text-center",
        isDesktop
          ? "border-black/6 bg-[linear-gradient(180deg,#fafafa,#f2f2f2)]"
          : "border-black/5 bg-[rgba(255,255,255,0.92)]",
        highlighted
          ? "ring-2 ring-[rgba(255,191,0,0.34)] ring-offset-2 ring-offset-transparent"
          : "",
      )}
    >
      <div className="flex items-center justify-center gap-2 text-[12px] font-medium text-[color:var(--text-primary)]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/5 text-[color:var(--text-secondary)]">
          <FileText size={13} />
        </span>
        <span>聊天记录已导入当前群聊</span>
      </div>
      <div className="mt-1.5 text-[11px] leading-5 text-[color:var(--text-muted)]">
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

  if (message.type === "sticker") {
    return "表情";
  }

  return "消息";
}

function resolveOpenAttachmentLabel(message: ChatRenderableMessage) {
  if (message.type === "image") {
    return "查看图片";
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

  return "打开附件";
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

  if (message.type === "sticker") {
    return null;
  }

  return {
    conversationId: conversation.id,
    characterId,
    text: text ?? buildClipboardText(message),
  };
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

function saveUrlAsFile(url: string, fileName: string) {
  if (typeof document === "undefined") {
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function openPrintWindow(input: { title: string; imageUrl: string }) {
  if (typeof window === "undefined") {
    return false;
  }

  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) {
    return false;
  }

  const escapedTitle = escapeHtml(input.title);
  const escapedImageUrl = escapeHtml(input.imageUrl);
  printWindow.document.write(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #0f172a;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      img {
        max-width: 100%;
        max-height: calc(100vh - 48px);
        object-fit: contain;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
      }
    </style>
  </head>
  <body>
    <img src="${escapedImageUrl}" alt="${escapedTitle}" />
  </body>
</html>`);
  printWindow.document.close();

  const printedImage = printWindow.document.querySelector(
    "img",
  ) as HTMLImageElement | null;
  if (printedImage) {
    printedImage.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  } else {
    printWindow.focus();
    printWindow.print();
  }

  return true;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
      className={`mb-2 w-full overflow-hidden rounded-[12px] border px-3 py-2 ${
        align === "right"
          ? isDesktop
            ? "border-[rgba(110,168,62,0.24)] bg-[rgba(237,248,223,0.96)] text-[color:var(--text-primary)]"
            : "border-[rgba(22,163,74,0.16)] bg-[rgba(255,255,255,0.72)] text-[color:var(--text-primary)]"
          : isDesktop
            ? "border-black/6 bg-[#f7f7f7] text-[color:var(--text-primary)]"
            : "border-black/6 bg-[rgba(248,248,248,0.96)] text-[color:var(--text-primary)]"
      } text-left transition ${disabled ? "cursor-default opacity-90" : "hover:opacity-90"}`}
    >
      <div className="flex items-center gap-2">
        <div className="truncate text-[11px] font-medium text-[color:var(--text-secondary)]">
          回复 {senderName}
        </div>
        {modeLabel ? (
          <div className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
            {modeLabel}
          </div>
        ) : null}
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
  onOpen,
}: {
  url: string;
  label: string;
  maxSize: number;
  onOpen?: () => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  if (loadFailed) {
    return (
      <div className="flex h-28 w-28 items-center justify-center rounded-[22px] border border-white/80 bg-white/90 px-3 text-center text-xs text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]">
        {label || "[图片]"}
      </div>
    );
  }

  const image = (
    <img
      src={url}
      alt={label}
      onError={() => setLoadFailed(true)}
      className="rounded-[16px] border border-black/6 bg-white object-cover shadow-none"
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
      className="transition hover:opacity-95"
      aria-label={`查看图片 ${label}`}
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
      className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition ${
        checked
          ? "border-[rgba(7,193,96,0.22)] bg-[#07c160] text-white shadow-[0_8px_18px_rgba(7,193,96,0.20)]"
          : "border-black/10 bg-white text-transparent hover:border-[rgba(7,193,96,0.28)]"
      }`}
      aria-label={checked ? "取消选择消息" : "选择消息"}
    >
      ✓
    </button>
  );
}

function ContactCardMessage({
  attachment,
  onOpen,
}: {
  attachment: Extract<MessageAttachment, { kind: "contact_card" }>;
  onOpen?: () => void;
}) {
  const card = (
    <div className="w-[220px] rounded-[16px] border border-black/6 bg-white p-3 shadow-none">
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

function FileAttachmentMessage({
  attachment,
  onOpen,
}: {
  attachment: Extract<MessageAttachment, { kind: "file" }>;
  onOpen?: () => void;
}) {
  const card = (
    <div className="w-[220px] rounded-[16px] border border-black/6 bg-white p-3 shadow-none">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#f3f4f6] text-[color:var(--text-secondary)]">
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
  onOpen,
}: {
  attachment: Extract<MessageAttachment, { kind: "location_card" }>;
  onOpen?: () => void;
}) {
  const card = (
    <div className="w-[220px] rounded-[16px] border border-black/6 bg-white p-3 shadow-none">
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
  own,
}: {
  attachment: Extract<MessageAttachment, { kind: "voice" }>;
  own: boolean;
}) {
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
      className={`flex min-w-[148px] max-w-[220px] items-center gap-3 rounded-[18px] px-3 py-2.5 ${
        own
          ? "bg-[#95ec69] text-[#111827]"
          : "border border-black/5 bg-white text-[color:var(--text-primary)]"
      }`}
    >
      <button
        type="button"
        onClick={togglePlayback}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          own ? "bg-white/55" : "bg-[#f3f4f6]"
        }`}
        aria-label={playing ? "暂停语音" : "播放语音"}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className={`h-2.5 w-1 rounded-full ${playing ? "animate-pulse" : ""} ${
            own ? "bg-[#3d7f1a]" : "bg-[#9ca3af]"
          }`}
        />
        <span
          className={`h-4 w-1 rounded-full ${playing ? "animate-pulse [animation-delay:90ms]" : ""} ${
            own ? "bg-[#4a8f24]" : "bg-[#6b7280]"
          }`}
        />
        <span
          className={`h-6 w-1 rounded-full ${playing ? "animate-pulse [animation-delay:180ms]" : ""} ${
            own ? "bg-[#5aa72c]" : "bg-[#4b5563]"
          }`}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-black/60">
        {formatVoiceDurationLabel(attachment.durationMs)}
      </span>
      <audio ref={audioRef} src={attachment.url} preload="none" />
    </div>
  );
}

function GroupRelaySummaryMessage({
  own,
  summary,
  onOpen,
}: {
  own: boolean;
  summary: ReturnType<typeof parseGroupRelaySummaryMessage>;
  onOpen?: () => void;
}) {
  if (!summary) {
    return null;
  }

  const completionTimeLabel = resolveGroupRelayCompletionTime(summary);
  const publishRangeLabel = relayPublishRangeLabel(summary);
  const publishStageBadge = resolveGroupRelayPublishStageBadge(summary);
  const completionBadge = resolveGroupRelayCompletionBadge(summary);
  const card = (
    <div
      className={`w-[252px] rounded-[18px] border px-4 py-4 shadow-none ${
        own
          ? "border-[rgba(110,168,62,0.22)] bg-[linear-gradient(180deg,rgba(237,248,223,0.98),rgba(255,255,255,0.94))]"
          : "border-[rgba(245,158,11,0.16)] bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,255,255,0.94))]"
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
          <div
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-medium",
              summary.publishedSource === "mobile"
                ? "bg-[rgba(59,130,246,0.12)] text-[#2563eb]"
                : "bg-[rgba(245,158,11,0.12)] text-[#b45309]",
            )}
          >
            {summary.publishedSource === "mobile" ? "手机回填" : "桌面回填"}
          </div>
          {summary.launchSourceLabel ? (
            <div className="rounded-full bg-[rgba(15,23,42,0.06)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--text-secondary)]">
              {summary.launchSource === "mobile" ? "手机发起" : "桌面发起"}
            </div>
          ) : null}
          {summary.statusLabel ? (
            <div
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-medium",
                summary.statusLabel === "已回填"
                  ? "bg-[rgba(34,197,94,0.14)] text-[#15803d]"
                  : summary.statusLabel === "已完成"
                    ? "bg-[rgba(59,130,246,0.12)] text-[#2563eb]"
                    : "bg-[rgba(245,158,11,0.16)] text-[#b45309]",
              )}
            >
              {summary.statusLabel}
            </div>
          ) : null}
          {publishStageBadge ? (
            <div
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-medium",
                publishStageBadge.tone === "success"
                  ? "bg-[rgba(34,197,94,0.14)] text-[#15803d]"
                  : "bg-[rgba(59,130,246,0.12)] text-[#2563eb]",
              )}
            >
              {publishStageBadge.label}
            </div>
          ) : null}
          {completionBadge ? (
            <div
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-medium",
                completionBadge.tone === "success"
                  ? "bg-[rgba(34,197,94,0.14)] text-[#15803d]"
                  : "bg-[rgba(245,158,11,0.16)] text-[#b45309]",
              )}
            >
              {completionBadge.label}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {summary.timestampLabel ? (
          <CallInviteMetric label="时间" value={summary.timestampLabel} />
        ) : null}
        {completionTimeLabel ? (
          <CallInviteMetric label="完成时间" value={completionTimeLabel} />
        ) : null}
        {typeof publishRangeLabel === "string" ? (
          <CallInviteMetric label="起止时间" value={publishRangeLabel} />
        ) : null}
        {summary.activeRelayCountLabel ? (
          <CallInviteMetric label="进行中" value={summary.activeRelayCountLabel} />
        ) : null}
        {summary.pendingMemberCountLabel ? (
          <CallInviteMetric label="待确认" value={summary.pendingMemberCountLabel} />
        ) : null}
        {summary.publishCountLabel ? (
          <CallInviteMetric label="回填次数" value={summary.publishCountLabel} />
        ) : null}
        {summary.resultSummaryLabel ? (
          <CallInviteMetric label="结果摘要" value={summary.resultSummaryLabel} />
        ) : null}
        {summary.summaryLines.map((line) => (
          <div
            key={line}
            className="rounded-[14px] bg-white/72 px-3 py-2 text-[13px] leading-6 text-[color:var(--text-secondary)]"
          >
            {line}
          </div>
        ))}
      </div>

      {onOpen ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/6 pt-3">
          <div className="text-[11px] leading-5 text-[color:var(--text-muted)]">
            点击继续查看和回填接龙
          </div>
          <div className="text-[11px] font-medium text-[#b45309]">继续接龙</div>
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
      aria-label={`继续查看 ${summary.sourceGroupName} 的群接龙`}
    >
      {card}
    </button>
  );
}

function resolveGroupRelayCompletionTime(
  summary: NonNullable<ReturnType<typeof parseGroupRelaySummaryMessage>>,
) {
  if (summary.statusLabel === "已回填") {
    return summary.publishedAtLabel ?? summary.timestampLabel ?? null;
  }

  if (summary.statusLabel === "已完成") {
    return summary.timestampLabel ?? null;
  }

  return null;
}

function relayPublishRangeLabel(
  summary: NonNullable<ReturnType<typeof parseGroupRelaySummaryMessage>>,
) {
  if (!summary.publishedAtLabel || !summary.timestampLabel) {
    return null;
  }

  const startedAtTs = parseTimestamp(summary.timestampLabel);
  const endedAtTs = parseTimestamp(summary.publishedAtLabel);
  if (startedAtTs === null || endedAtTs === null) {
    return `${summary.timestampLabel} - ${summary.publishedAtLabel}`;
  }

  const startedAt = new Date(startedAtTs);
  const endedAt = new Date(endedAtTs);
  const sameDay =
    startedAt.getFullYear() === endedAt.getFullYear() &&
    startedAt.getMonth() === endedAt.getMonth() &&
    startedAt.getDate() === endedAt.getDate();

  if (sameDay) {
    return `${formatMessageTimestamp(summary.timestampLabel)} - ${new Intl.DateTimeFormat(
      "zh-CN",
      {
        hour: "2-digit",
        minute: "2-digit",
      },
    ).format(endedAt)}`;
  }

  return `${formatMessageTimestamp(summary.timestampLabel)} - ${formatMessageTimestamp(summary.publishedAtLabel)}`;
}

function resolveGroupRelayPublishStageBadge(
  summary: NonNullable<ReturnType<typeof parseGroupRelaySummaryMessage>>,
) {
  const publishCount = parseGroupRelayPublishCount(summary.publishCountLabel);
  if (publishCount === null) {
    return null;
  }

  if (publishCount <= 1) {
    return {
      label: "首次回填",
      tone: "info" as const,
    };
  }

  return {
    label: "多次回填",
    tone: "success" as const,
  };
}

function resolveGroupRelayCompletionBadge(
  summary: NonNullable<ReturnType<typeof parseGroupRelaySummaryMessage>>,
) {
  const pendingCount = parseGroupRelayCount(summary.pendingMemberCountLabel);
  if (pendingCount === null) {
    return null;
  }

  if (pendingCount === 0) {
    return {
      label: "已全部确认",
      tone: "success" as const,
    };
  }

  return {
    label: "仍有待确认",
    tone: "warning" as const,
  };
}

function parseGroupRelayPublishCount(label: string | null | undefined) {
  return parseGroupRelayCount(label);
}

function parseGroupRelayCount(label: string | null | undefined) {
  if (!label) {
    return null;
  }

  const matched = label.match(/\d+/);
  if (!matched) {
    return null;
  }

  const count = Number(matched[0]);
  return Number.isFinite(count) ? count : null;
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
  const isSystem =
    message.type === "system" || message.senderType === "system";
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
  invite,
  onOpen,
}: {
  own: boolean;
  invite: ReturnType<typeof parseGroupCallInviteMessage>;
  onOpen?: () => void;
}) {
  if (!invite) {
    return null;
  }

  const canReopenCall = Boolean(onOpen);
  const footerDescription =
    invite.status === "ended"
      ? canReopenCall
        ? invite.kind === "video"
          ? "点击可基于这张卡片重新发起当前群视频通话。"
          : "点击可基于这张卡片重新发起当前群语音通话。"
        : invite.kind === "video"
          ? "这轮群视频通话已经结束，当前保留为状态记录卡片。"
          : "这轮群语音通话已经结束，当前保留为状态记录卡片。"
      : canReopenCall
        ? invite.kind === "video"
          ? "点击可回到当前群视频通话工作台。"
          : "点击可回到当前群语音通话工作台。"
        : invite.kind === "video"
          ? "当前消息已转成群视频通话卡片，便于群成员识别画面状态。"
          : "当前消息已转成群语音通话卡片，便于群成员识别状态。";
  const footerActionLabel =
    invite.status === "ended"
      ? canReopenCall
        ? "重新发起"
        : "查看记录"
      : canReopenCall
        ? invite.kind === "voice"
          ? "回到语音"
          : "回到视频"
        : invite.kind === "voice"
          ? "语音中"
          : "视频中";
  const completionBadge = resolveGroupCallCompletionBadge(invite);

  const card = (
    <div
      className={cn(
        "w-[264px] rounded-[18px] border px-4 py-4 shadow-none",
        own
          ? "border-[rgba(110,168,62,0.22)] bg-[linear-gradient(180deg,rgba(237,248,223,0.98),rgba(255,255,255,0.94))]"
          : "border-[rgba(59,130,246,0.16)] bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(255,255,255,0.94))]",
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
          <div
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-medium",
              invite.status === "ended"
                ? "bg-[rgba(239,68,68,0.10)] text-[#d74b45]"
                : "bg-[rgba(59,130,246,0.12)] text-[#2563eb]",
            )}
          >
            {invite.status === "ended"
              ? "已结束"
              : invite.sourceLabel
                ? `${invite.sourceLabel}发起`
                : "桌面发起"}
          </div>
          {completionBadge ? (
            <div
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-medium",
                completionBadge.tone === "success"
                  ? "bg-[rgba(34,197,94,0.14)] text-[#15803d]"
                  : completionBadge.tone === "warning"
                    ? "bg-[rgba(245,158,11,0.16)] text-[#b45309]"
                    : "bg-[rgba(239,68,68,0.12)] text-[#d74b45]",
              )}
            >
              {completionBadge.label}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <CallInviteMetric
          label="当前状态"
          value={formatGroupCallStatusLabel(invite.kind, invite.status)}
        />
        {invite.timestampLabel ? (
          <CallInviteMetric label="时间" value={invite.timestampLabel} />
        ) : null}
        {invite.status === "ended" &&
        invite.startedAt &&
        invite.recordedAt ? (
          <CallInviteMetric
            label="起止时间"
            value={formatGroupCallRangeSummary(invite.startedAt, invite.recordedAt)}
          />
        ) : null}
        {invite.durationLabel ? (
          <CallInviteMetric label="本轮时长" value={invite.durationLabel} />
        ) : null}
        {invite.sourceLabel ? (
          <CallInviteMetric label="发起端" value={invite.sourceLabel} />
        ) : null}
        {invite.snapshotLabel ? (
          <CallInviteMetric label="人数快照" value={invite.snapshotLabel} />
        ) : null}
        {invite.activeCount ? (
          <div className="grid grid-cols-2 gap-2">
            <CallInviteMetric
              label="当前在线"
              value={`${invite.activeCount.current}/${invite.activeCount.total}`}
            />
            <CallInviteMetric
              label="待加入"
              value={`${invite.waitingCount ?? Math.max(invite.activeCount.total - invite.activeCount.current, 0)} 人`}
            />
          </div>
        ) : null}
        {invite.summaryLines.map((line) => (
          <div
            key={line}
            className="rounded-[14px] bg-white/72 px-3 py-2 text-[13px] leading-6 text-[color:var(--text-secondary)]"
          >
            {line}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/6 pt-3">
        <div className="text-[11px] leading-5 text-[color:var(--text-muted)]">
          {footerDescription}
        </div>
        <div className="text-[11px] font-medium text-[#2563eb]">
          {footerActionLabel}
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
      aria-label={
        invite.status === "ended"
          ? `重新发起 ${invite.groupName} 的群通话`
          : `回到 ${invite.groupName} 的群通话工作台`
      }
    >
      {card}
    </button>
  );
}

function CallInviteMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-white/72 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function DirectCallInviteMessage({
  own,
  invite,
  onOpen,
}: {
  own: boolean;
  invite: ReturnType<typeof parseDirectCallInviteMessage>;
  onOpen?: () => void;
}) {
  if (!invite) {
    return null;
  }

  const canReopenCall = Boolean(onOpen);
  const footerDescription =
    invite.connectionStatus === "ended"
      ? canReopenCall
        ? invite.kind === "video"
          ? "点击可基于这张卡片重新发起当前单聊视频通话。"
          : "点击可基于这张卡片重新发起当前单聊语音通话。"
        : invite.kind === "video"
          ? "这轮单聊视频通话已经结束，当前保留为状态记录卡片。"
          : "这轮单聊语音通话已经结束，当前保留为状态记录卡片。"
      : canReopenCall
        ? invite.kind === "video"
          ? "点击可回到当前单聊视频通话工作台。"
          : "点击可回到当前单聊语音通话工作台。"
        : invite.kind === "video"
          ? "当前消息已转成单聊视频通话卡片，方便快速识别状态。"
          : "当前消息已转成单聊语音通话卡片，方便快速识别状态。";
  const footerActionLabel =
    invite.connectionStatus === "ended"
      ? canReopenCall
        ? "重新发起"
        : "查看记录"
      : canReopenCall
        ? invite.kind === "voice"
          ? "回到语音"
          : "回到视频"
        : invite.kind === "voice"
          ? "语音中"
          : "视频中";

  const card = (
    <div
      className={cn(
        "w-[264px] rounded-[18px] border px-4 py-4 shadow-none",
        own
          ? "border-[rgba(110,168,62,0.22)] bg-[linear-gradient(180deg,rgba(237,248,223,0.98),rgba(255,255,255,0.94))]"
          : "border-[rgba(59,130,246,0.16)] bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(255,255,255,0.94))]",
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
        <div
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-medium",
            invite.connectionStatus === "ended"
              ? "bg-[rgba(239,68,68,0.10)] text-[#d74b45]"
              : "bg-[rgba(59,130,246,0.12)] text-[#2563eb]",
          )}
        >
          {invite.connectionStatus === "ended"
            ? "已结束"
            : invite.sourceLabel
              ? `${invite.sourceLabel}发起`
              : "桌面发起"}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {invite.connectionStatus ? (
          <CallInviteMetric
            label="当前状态"
            value={
              invite.connectionStatus === "ended"
                ? "已结束"
                : invite.connectionStatus === "connected"
                  ? invite.kind === "video"
                    ? "画面已接通"
                    : "已接通"
                  : invite.kind === "video"
                    ? "等待接入画面"
                    : "等待接听"
            }
          />
        ) : null}
        {invite.timestampLabel ? (
          <CallInviteMetric label="时间" value={invite.timestampLabel} />
        ) : null}
        {invite.durationLabel ? (
          <CallInviteMetric label="最近一轮" value={invite.durationLabel} />
        ) : null}
        {invite.sourceLabel ? (
          <CallInviteMetric label="发起端" value={invite.sourceLabel} />
        ) : null}
        {invite.summaryLines.map((line) => (
          <div
            key={line}
            className="rounded-[14px] bg-white/72 px-3 py-2 text-[13px] leading-6 text-[color:var(--text-secondary)]"
          >
            {line}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/6 pt-3">
        <div className="text-[11px] leading-5 text-[color:var(--text-muted)]">
          {footerDescription}
        </div>
        <div className="text-[11px] font-medium text-[#2563eb]">
          {footerActionLabel}
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
      aria-label={
        invite.connectionStatus === "ended"
          ? `重新发起 ${invite.title} 的单聊通话`
          : `回到 ${invite.title} 的单聊通话工作台`
      }
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
  onCopy,
}: {
  variant: "mobile" | "desktop";
  attachment: Extract<MessageAttachment, { kind: "location_card" }>;
  onClose: () => void;
  onLocate: () => void;
  onCopy: () => void;
}) {
  const isDesktop = variant === "desktop";

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
          <ViewerActionButton label="复制位置" onClick={onCopy}>
            <Copy size={16} />
          </ViewerActionButton>
          <ViewerActionButton label="定位消息" onClick={onLocate}>
            <LocateFixed size={16} />
          </ViewerActionButton>
        </div>
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

function resolveGroupCallCompletionBadge(
  invite: NonNullable<ReturnType<typeof parseGroupCallInviteMessage>>,
) {
  if (invite.status !== "ended" || !invite.activeCount) {
    return null;
  }

  if (invite.activeCount.current <= 0) {
    return {
      label: "无人加入",
      tone: "danger" as const,
    };
  }

  if (invite.activeCount.current >= invite.activeCount.total) {
    return {
      label: "全员加入",
      tone: "success" as const,
    };
  }

  return {
    label: "部分加入",
    tone: "warning" as const,
  };
}

function formatGroupCallRangeSummary(startedAt: string, endedAt: string) {
  const startedAtTs = parseTimestamp(startedAt);
  const endedAtTs = parseTimestamp(endedAt);
  if (startedAtTs === null || endedAtTs === null) {
    return `开始于 ${startedAt} · 结束于 ${endedAt}`;
  }

  const startedAtDate = new Date(startedAtTs);
  const endedAtDate = new Date(endedAtTs);
  const sameDay =
    startedAtDate.getFullYear() === endedAtDate.getFullYear() &&
    startedAtDate.getMonth() === endedAtDate.getMonth() &&
    startedAtDate.getDate() === endedAtDate.getDate();

  if (sameDay) {
    return `${formatCallClockLabel(startedAtDate)} - ${formatCallClockLabel(endedAtDate)}`;
  }

  return `${formatCallDayClockLabel(startedAtDate)} - ${formatCallDayClockLabel(endedAtDate)}`;
}

function formatCallClockLabel(date: Date) {
  return `${padCallTimeSegment(date.getHours())}:${padCallTimeSegment(date.getMinutes())}`;
}

function formatCallDayClockLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()} ${formatCallClockLabel(date)}`;
}

function padCallTimeSegment(value: number) {
  return value.toString().padStart(2, "0");
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
