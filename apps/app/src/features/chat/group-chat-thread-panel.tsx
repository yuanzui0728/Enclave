import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Phone, Video } from "lucide-react";
import {
  getConversations,
  getFriends,
  getGroup,
  getGroupMembers,
  getGroupMessages,
  type FriendListItem,
  markGroupRead,
  sendGroupMessage,
  type SendGroupMessageRequest,
  type StickerAttachment,
  uploadChatAttachment,
} from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { ChatComposer } from "../../components/chat-composer";
import { ChatMessageList } from "../../components/chat-message-list";
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
import { buildDesktopMobileCallHandoffHash } from "../desktop/chat/desktop-mobile-call-handoff-route-state";
import { DesktopGroupCallPanel } from "../desktop/chat/desktop-group-call-panel";
import { type ChatRenderableMessage } from "../../components/chat-message-list";
import { type ChatRouteContextNotice } from "./conversation-thread-panel";
import { type ChatComposeShortcutAction } from "./chat-compose-shortcut-route";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import {
  buildGroupCallInviteMessage,
  type CallInviteSource,
  type GroupCallInviteStatus,
} from "./group-call-message";
import { buildMobileGroupCallRouteHash } from "./mobile-group-call-route-state";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { findFirstUnreadMessageId } from "./chat-unread-marker";
import { MobileChatScrollBottomButton } from "./mobile-chat-scroll-bottom-button";
import { MobileChatThreadHeader } from "./mobile-chat-thread-header";
import { useGroupBackground } from "./backgrounds/use-conversation-background";
import { useScrollAnchor } from "../../hooks/use-scroll-anchor";
import { getFriendDisplayName } from "../contacts/contact-utils";
import { formatTimestamp, parseTimestamp } from "../../lib/format";
import { isPersistedGroupConversation } from "../../lib/conversation-route";
import {
  joinConversationRoom,
  onChatMessage,
  onConversationUpdated,
} from "../../lib/socket";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../store/world-owner-store";
import {
  buildGroupRetryPayload,
  buildOptimisticGroupMessage,
  type GroupThreadMessage,
  markThreadMessageSending,
  markThreadMessagesFailed,
  mergeGroupMessageWindow,
  replaceGroupLocalMessage,
  upsertIncomingGroupMessage,
} from "./chat-message-delivery";
import { useThreadEntryScrollToBottom } from "./use-thread-entry-scroll-to-bottom";

type GroupChatThreadPanelProps = {
  groupId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
  desktopSidePanelMode?: DesktopChatSidePanelMode;
  desktopHeaderActionsRef?: Ref<HTMLDivElement>;
  onToggleDesktopHistory?: () => void;
  onToggleDesktopDetails?: () => void;
  onOpenDesktopAnnouncementDetails?: () => void;
  onOpenDesktopMemberSearch?: () => void;
  onDesktopCallAction?: (kind: DesktopChatCallKind) => void;
  highlightedMessageId?: string;
  buildMessageReturnTo?: (messageId: string) => string | undefined;
  routeContextNotice?: ChatRouteContextNotice;
  routeMobileShortcutAction?: ChatComposeShortcutAction | null;
  onRouteMobileShortcutHandled?: () => void;
};

export function GroupChatThreadPanel({
  groupId,
  variant = "mobile",
  onBack,
  desktopSidePanelMode = null,
  desktopHeaderActionsRef,
  onToggleDesktopHistory,
  onToggleDesktopDetails,
  onOpenDesktopAnnouncementDetails,
  onDesktopCallAction,
  highlightedMessageId,
  buildMessageReturnTo,
  routeContextNotice,
  routeMobileShortcutAction = null,
  onRouteMobileShortcutHandled,
}: GroupChatThreadPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const backgroundQuery = useGroupBackground(groupId);
  const [text, setText] = useState("");
  const [replyDraft, setReplyDraft] = useState<ChatReplyMetadata | null>(null);
  const [messages, setMessages] = useState<GroupThreadMessage[]>([]);
  const [desktopCallPanelState, setDesktopCallPanelState] = useState<{
    kind: DesktopChatCallKind;
    source: CallInviteSource | null;
  } | null>(null);
  const [mobileShortcutRequest, setMobileShortcutRequest] = useState<{
    action: ChatComposeShortcutAction;
    nonce: number;
  } | null>(null);
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const [lastPublishedCallCounts, setLastPublishedCallCounts] = useState<{
    kind: DesktopChatCallKind;
    source: CallInviteSource | null;
    activeCount: number;
    totalCount: number;
  } | null>(null);
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);
  const [initialUnreadCutoff, setInitialUnreadCutoff] = useState<string | null>(
    null,
  );
  const [unreadSnapshotReady, setUnreadSnapshotReady] = useState(false);
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [loadingAnchorWindow, setLoadingAnchorWindow] = useState(false);
  const isDesktop = variant === "desktop";
  const loadMoreRequestRef = useRef<{
    previousCount: number;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const highlightedWindowRequestRef = useRef<string | null>(null);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const messagesQuery = useQuery({
    queryKey: ["app-group-messages", baseUrl, groupId, messageLimit],
    queryFn: () => getGroupMessages(groupId, baseUrl, { limit: messageLimit }),
  });
  const {
    ref: scrollAnchorRef,
    isAtBottom,
    pendingCount,
    suppressNextPendingCount,
    scrollToBottom,
  } = useScrollAnchor<HTMLDivElement>(messages.length);
  const handleDismissRouteContextNotice = () => {
    routeContextNotice?.onDismiss?.();
  };

  useEffect(() => {
    setText("");
    setMessages([]);
    setReplyDraft(null);
    setDesktopCallPanelState(null);
    setMobileShortcutRequest(null);
    setSelectionModeActive(false);
    setLastPublishedCallCounts(null);
    setInitialUnreadCount(0);
    setInitialUnreadCutoff(null);
    setUnreadSnapshotReady(false);
    setMessageLimit(INITIAL_MESSAGE_LIMIT);
    setHasOlderMessages(true);
    setLoadingAnchorWindow(false);
    loadMoreRequestRef.current = null;
    highlightedWindowRequestRef.current = null;
  }, [baseUrl, groupId]);

  useEffect(() => {
    setMessages((current) =>
      mergeGroupMessageWindow(current, messagesQuery.data ?? []),
    );
  }, [messagesQuery.data]);

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

  const activeConversation = conversationsQuery.data?.find(
    (item) => item.id === groupId && isPersistedGroupConversation(item),
  );

  useEffect(() => {
    if (unreadSnapshotReady || !conversationsQuery.isFetched) {
      return;
    }

    setInitialUnreadCount(activeConversation?.unreadCount ?? 0);
    setInitialUnreadCutoff(activeConversation?.lastReadAt ?? null);
    setUnreadSnapshotReady(true);
  }, [
    activeConversation?.lastReadAt,
    activeConversation?.unreadCount,
    conversationsQuery.isFetched,
    unreadSnapshotReady,
  ]);

  useEffect(() => {
    if (!groupId) {
      return;
    }

    joinConversationRoom({ conversationId: groupId });

    const offMessage = onChatMessage((payload) => {
      if (!("groupId" in payload) || payload.groupId !== groupId) {
        return;
      }

      setMessages((current) => upsertIncomingGroupMessage(current, payload));
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    const offConversationUpdated = onConversationUpdated((payload) => {
      if (payload.type !== "group" || payload.id !== groupId) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-messages", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    return () => {
      offMessage();
      offConversationUpdated();
    };
  }, [baseUrl, groupId, queryClient]);

  useEffect(() => {
    if (!groupId || !unreadSnapshotReady) {
      return;
    }

    void markGroupRead(groupId, baseUrl).then(() => {
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });
  }, [
    baseUrl,
    groupId,
    messagesQuery.data?.length,
    queryClient,
    unreadSnapshotReady,
  ]);

  const sendMutation = useMutation({
    mutationFn: async (input: {
      payload: SendGroupMessageRequest;
      localMessageId: string;
    }) => {
      const message = await sendGroupMessage(groupId, input.payload, baseUrl);
      return {
        ...input,
        message,
      };
    },
    onSuccess: async (result) => {
      setMessages((current) =>
        replaceGroupLocalMessage(current, result.localMessageId, result.message),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
    onError: (_error, input) => {
      setMessages((current) =>
        markThreadMessagesFailed(current, [input.localMessageId]),
      );
    },
  });

  const sendCallInviteMutation = useMutation({
    mutationFn: (input: {
      kind: DesktopChatCallKind;
      status: GroupCallInviteStatus;
      activeCount: number;
      totalCount: number;
      source: CallInviteSource;
      durationMs?: number;
      startedAt?: string;
    }) =>
      sendGroupMessage(
        groupId,
        {
          text: buildGroupCallInviteMessage(
            input.kind,
            groupQuery.data?.name ?? "当前群聊",
            {
              activeCount: input.activeCount,
              totalCount: input.totalCount,
            },
            input.status,
            undefined,
            input.source,
            undefined,
            input.durationMs,
            input.startedAt,
          ),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      scrollToBottom("smooth");
    },
  });

  const orderedMessages = useMemo(
    () =>
      [...messages].sort(
        (left, right) =>
          (parseTimestamp(left.createdAt) ?? 0) -
          (parseTimestamp(right.createdAt) ?? 0),
      ),
    [messages],
  );
  const enqueueOutgoingGroupMessage = useCallback(
    (payload: SendGroupMessageRequest) => {
      const optimisticMessage = buildOptimisticGroupMessage({
        payload,
        groupId,
        ownerId,
        senderName: ownerName?.trim() || "我",
        senderAvatar: ownerAvatar,
      });
      setMessages((current) =>
        mergeGroupMessageWindow(current, [optimisticMessage]),
      );
      return optimisticMessage.id;
    },
    [groupId, ownerAvatar, ownerId, ownerName],
  );
  const submitOutgoingGroupMessage = useCallback(
    async (payload: SendGroupMessageRequest) => {
      const localMessageId = enqueueOutgoingGroupMessage(payload);
      await sendMutation.mutateAsync({
        payload,
        localMessageId,
      });
    },
    [enqueueOutgoingGroupMessage, sendMutation],
  );
  const friendMap = useMemo<Map<string, FriendListItem>>(
    () =>
      new Map(
        (friendsQuery.data ?? []).map((item) => [item.character.id, item] as const),
      ),
    [friendsQuery.data],
  );
  const resolveCharacterDisplayName = useCallback(
    (characterId?: string | null, fallbackName?: string | null) => {
      if (characterId) {
        const friend = friendMap.get(characterId);
        if (friend) {
          return getFriendDisplayName(friend);
        }
      }

      return fallbackName?.trim() || "群成员";
    },
    [friendMap],
  );
  const renderableMessages = useMemo(
    () =>
      orderedMessages.map((message) =>
        message.senderType === "character"
          ? {
              ...message,
              senderName: resolveCharacterDisplayName(
                message.senderId,
                message.senderName,
              ),
            }
          : message,
      ),
    [orderedMessages, resolveCharacterDisplayName],
  );
  const hasHighlightedMessage = orderedMessages.some(
    (message) => message.id === highlightedMessageId,
  );
  const unreadMarkerMessageId = useMemo(
    () =>
      findFirstUnreadMessageId(
        orderedMessages,
        initialUnreadCutoff,
        initialUnreadCount > 0,
      ),
    [initialUnreadCount, initialUnreadCutoff, orderedMessages],
  );
  const sendError =
    sendMutation.error instanceof Error ? sendMutation.error.message : null;
  const effectiveBackground = backgroundQuery.data?.effectiveBackground ?? null;
  const announcement = groupQuery.data?.announcement?.trim() ?? "";
  const mobileSubtitle = membersQuery.data
    ? `${membersQuery.data.length} 人群聊${
        groupQuery.data?.isMuted ? " · 免打扰" : ""
      }`
    : groupQuery.data?.isMuted
      ? "群聊 · 免打扰"
      : undefined;

  useThreadEntryScrollToBottom({
    threadKey: groupId,
    ready:
      !messagesQuery.isLoading &&
      !groupQuery.isLoading &&
      unreadSnapshotReady,
    disabled: Boolean(highlightedMessageId),
    containerRef: scrollAnchorRef,
  });

  useEffect(() => {
    const loadedCount = messagesQuery.data?.length ?? 0;
    const pendingLoad = loadMoreRequestRef.current;

    if (loadedCount < messageLimit) {
      setHasOlderMessages(false);
    } else if (!pendingLoad) {
      setHasOlderMessages(true);
    }

    if (!pendingLoad || messagesQuery.isFetching) {
      return;
    }

    loadMoreRequestRef.current = null;
    if (loadedCount <= pendingLoad.previousCount) {
      setHasOlderMessages(false);
      return;
    }

    window.requestAnimationFrame(() => {
      const element = scrollAnchorRef.current;
      if (!element) {
        return;
      }

      element.scrollTop =
        pendingLoad.scrollTop +
        (element.scrollHeight - pendingLoad.scrollHeight);
    });
  }, [
    messageLimit,
    messagesQuery.data,
    messagesQuery.isFetching,
    scrollAnchorRef,
  ]);

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

  const sendAttachmentMessage = async (
    payload: ChatComposerAttachmentPayload,
  ) => {
    const replyText = replyDraft ? encodeChatReplyText("", replyDraft) : "";

    if (payload.type === "image") {
      const formData = new FormData();
      formData.set("file", payload.file);
      formData.set("width", String(payload.width ?? ""));
      formData.set("height", String(payload.height ?? ""));
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "image") {
        throw new Error("图片上传结果异常。");
      }

      setReplyDraft(null);
      await submitOutgoingGroupMessage({
        type: "image",
        text: replyText || undefined,
        attachment: result.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    if (payload.type === "file") {
      const formData = new FormData();
      formData.set("file", payload.file);
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "file") {
        throw new Error("文件上传结果异常。");
      }

      setReplyDraft(null);
      await submitOutgoingGroupMessage({
        type: "file",
        text: replyText || undefined,
        attachment: result.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    if (payload.type === "voice") {
      const formData = new FormData();
      formData.set("file", payload.file, payload.fileName);
      if (payload.durationMs) {
        formData.set("durationMs", String(payload.durationMs));
      }
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "voice") {
        throw new Error("语音上传结果异常。");
      }

      setReplyDraft(null);
      await submitOutgoingGroupMessage({
        type: "voice",
        text: replyText || undefined,
        attachment: result.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    if (payload.type === "contact_card") {
      setReplyDraft(null);
      await submitOutgoingGroupMessage({
        type: "contact_card",
        text: replyText || undefined,
        attachment: payload.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    setReplyDraft(null);
    await submitOutgoingGroupMessage({
      type: "location_card",
      text: replyText || undefined,
      attachment: payload.attachment,
    });
    scrollToBottom("smooth");
  };

  const handleSendSticker = async (sticker: StickerAttachment) => {
    setReplyDraft(null);
    await submitOutgoingGroupMessage({
      type: "sticker",
      text: replyDraft ? encodeChatReplyText("", replyDraft) : undefined,
      attachment: sticker,
    });
    scrollToBottom("smooth");
  };

  const handleSendPresetText = async (presetText: string) => {
    setText("");
    setReplyDraft(null);
    await submitOutgoingGroupMessage({
      text: replyDraft
        ? encodeChatReplyText(presetText, replyDraft)
        : presetText.trim(),
    });
    scrollToBottom("smooth");
  };

  const handleSubmit = async () => {
    setText("");
    setReplyDraft(null);
    await submitOutgoingGroupMessage({
      text: replyDraft ? encodeChatReplyText(text, replyDraft) : text.trim(),
    });
    scrollToBottom("smooth");
  };

  const retryMessage = useCallback(
    async (messageId: string) => {
      const failedMessage = messages.find(
        (message) =>
          message.id === messageId && message.localStatus === "failed",
      );
      if (!failedMessage) {
        return;
      }

      const payload = buildGroupRetryPayload(failedMessage);
      if (!payload) {
        throw new Error("这条消息暂时无法重试发送。");
      }

      setMessages((current) => markThreadMessageSending(current, messageId));
      await sendMutation.mutateAsync({
        payload,
        localMessageId: messageId,
      });
    },
    [messages, sendMutation],
  );

  const loadOlderMessages = useCallback(async () => {
    if (messagesQuery.isFetching || !hasOlderMessages) {
      return;
    }

    const element = scrollAnchorRef.current;
    suppressNextPendingCount();
    loadMoreRequestRef.current = {
      previousCount: messagesQuery.data?.length ?? 0,
      scrollHeight: element?.scrollHeight ?? 0,
      scrollTop: element?.scrollTop ?? 0,
    };
    setMessageLimit((current) => current + HISTORY_PAGE_SIZE);
  }, [
    hasOlderMessages,
    messagesQuery.data?.length,
    messagesQuery.isFetching,
    scrollAnchorRef,
    suppressNextPendingCount,
  ]);

  const loadAnchorWindow = useCallback(
    async (messageId: string) => {
      const normalizedMessageId = messageId.trim();
      if (!normalizedMessageId || loadingAnchorWindow) {
        return false;
      }

      setLoadingAnchorWindow(true);
      try {
        const windowMessages = await getGroupMessages(groupId, baseUrl, {
          aroundMessageId: normalizedMessageId,
          before: 24,
          after: 24,
        });
        if (!windowMessages.length) {
          return false;
        }

        suppressNextPendingCount();
        setMessages((current) =>
          mergeGroupMessageWindow(current, windowMessages),
        );
        return windowMessages.some(
          (message) => message.id === normalizedMessageId,
        );
      } catch {
        return false;
      } finally {
        setLoadingAnchorWindow(false);
      }
    },
    [baseUrl, groupId, loadingAnchorWindow, suppressNextPendingCount],
  );

  useEffect(() => {
    if (
      !highlightedMessageId ||
      hasHighlightedMessage ||
      messagesQuery.isFetching ||
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
    messagesQuery.isFetching,
  ]);

  const replyPreview = replyDraft
    ? {
        senderName: replyDraft.senderName,
        text: replyDraft.quotedText?.trim() || replyDraft.previewText,
        modeLabel: replyDraft.quotedText ? "部分引用" : undefined,
      }
    : null;
  const mentionCandidates = useMemo(() => {
    const candidates: Array<{
      id: string;
      name: string;
      subtitle?: string;
      avatar?: string | null;
    }> = [
      {
        id: "mention-all",
        name: "所有人",
        subtitle: "提醒全部群成员",
        avatar: null,
      },
    ];
    const seenIds = new Set<string>();

    for (const member of membersQuery.data ?? []) {
      if (member.memberType !== "character") {
        continue;
      }

      if (seenIds.has(member.memberId)) {
        continue;
      }

      seenIds.add(member.memberId);
      const rawName = member.memberName?.trim() || member.memberId;
      const displayName = resolveCharacterDisplayName(member.memberId, rawName);
      const roleLabel = member.role === "admin" ? "管理员" : "群成员";
      candidates.push({
        id: member.memberId,
        name: displayName,
        subtitle:
          displayName !== rawName ? `昵称：${rawName} · ${roleLabel}` : roleLabel,
        avatar: member.memberAvatar,
      });
    }

    return candidates;
  }, [membersQuery.data, resolveCharacterDisplayName]);

  const handleReplyMessage = (
    message: ChatRenderableMessage,
    options?: {
      quotedText?: string;
    },
  ) => {
    const senderName =
      message.senderType === "user"
        ? "我"
        : message.senderName?.trim() || "群成员";
    const previewText = describeReplyPreview(message);
    const quotedText = options?.quotedText?.trim();
    setReplyDraft({
      messageId: message.id,
      senderName,
      previewText,
      quotedText: quotedText || undefined,
    });
  };

  const handleDesktopCallAction = (kind: DesktopChatCallKind) => {
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
          ? "/group/$groupId/voice-call"
          : "/group/$groupId/video-call",
      params: { groupId },
    });
    onDesktopCallAction?.(kind);
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDesktop
          ? "bg-[rgba(245,247,247,0.96)]"
          : "bg-[color:var(--bg-canvas)]"
      }`}
    >
      {isDesktop ? (
        <header className="relative z-20 flex items-center gap-3 border-b border-[rgba(0,0,0,0.06)] bg-white px-6 py-3">
          <div className="min-w-0 flex-1 px-1 py-1">
            <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
              {groupQuery.data?.name ?? "群聊"}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
              {(membersQuery.data?.length ?? 0).toString()} 人群聊
            </div>
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
          title={groupQuery.data?.name ?? "群聊"}
          subtitle={mobileSubtitle}
          onBack={onBack}
          actions={[
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
          ]}
          onMore={() => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
            });
          }}
        />
      )}

      {isDesktop ? (
        <div className="flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-[rgba(249,251,250,0.92)] px-6 py-3">
          <button
            type="button"
            onClick={() => {
              onOpenDesktopAnnouncementDetails?.();
            }}
            className="flex min-w-0 flex-1 items-start gap-3 text-left transition hover:opacity-90"
          >
            <span className="mt-0.5 shrink-0 rounded-full bg-[rgba(7,193,96,0.08)] px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-[color:var(--brand-primary)]">
              群公告
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-[color:var(--text-primary)]">
                {announcement || "暂无群公告，点击填写本群说明。"}
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                {announcement
                  ? `最近更新 ${formatTimestamp(groupQuery.data?.updatedAt)}`
                  : "群接龙与群协作入口先收口到聊天信息侧栏"}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              void navigate({
                to: "/group/$groupId/announcement",
                params: { groupId },
              });
            }}
            className="shrink-0 rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
            aria-label="打开群公告页"
            title="打开群公告页"
          >
            公告页
          </button>
        </div>
      ) : null}

      {!isDesktop && announcement ? (
        <div className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-2.5 py-1">
          <button
            type="button"
            onClick={() => {
              void navigate({
                to: "/group/$groupId/details",
                params: { groupId },
              });
            }}
            className="flex w-full items-center gap-2 rounded-[12px] border border-[rgba(7,193,96,0.12)] bg-[rgba(247,251,248,0.96)] px-2.5 py-1.5 text-left active:bg-white"
          >
            <span className="shrink-0 rounded-full bg-[rgba(7,193,96,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#15803d]">
              群公告
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--text-primary)]">
              {announcement}
            </span>
            <span className="shrink-0 text-[10px] text-[color:var(--text-muted)]">
              查看
            </span>
          </button>
        </div>
      ) : null}

      {routeContextNotice ? (
        isDesktop ? (
          <div className="border-b border-[color:var(--border-faint)] bg-[rgba(249,251,250,0.92)] px-6 py-3">
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
        ) : (
          <div className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-2.5 py-1">
            <div className="rounded-[12px] border border-[rgba(7,193,96,0.14)] bg-[rgba(247,251,248,0.98)] px-2.5 py-1.5 shadow-none">
              <div className="text-[10px] leading-4 text-[#166534]">
                {routeContextNotice.description}
              </div>
              <div className="mt-2 flex items-center justify-end gap-1.5">
                {routeContextNotice.secondaryActionLabel &&
                routeContextNotice.onSecondaryAction ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={routeContextNotice.onSecondaryAction}
                    className="h-7 shrink-0 rounded-full px-2.5 text-[10px]"
                  >
                    {routeContextNotice.secondaryActionLabel}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={routeContextNotice.onAction}
                  className="h-7 shrink-0 rounded-full px-2.5 text-[10px]"
                >
                  {routeContextNotice.actionLabel}
                </Button>
              </div>
            </div>
          </div>
        )
      ) : null}

      <div className="relative flex-1 overflow-hidden">
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
              : "bg-[rgba(239,243,244,0.72)]"
          }`}
        />

        {isDesktop && desktopCallPanelState ? (
          <div className="relative h-full p-5">
            <DesktopGroupCallPanel
              kind={desktopCallPanelState.kind}
              groupId={groupId}
              groupName={groupQuery.data?.name ?? "群聊"}
              members={membersQuery.data ?? []}
              lastSyncedCounts={
                lastPublishedCallCounts?.kind === desktopCallPanelState.kind &&
                lastPublishedCallCounts?.source === desktopCallPanelState.source
                  ? {
                      activeCount: lastPublishedCallCounts.activeCount,
                      totalCount: lastPublishedCallCounts.totalCount,
                    }
                  : null
              }
              inviteNoticePending={sendCallInviteMutation.isPending}
              endNoticePending={sendCallInviteMutation.isPending}
              onClose={() => setDesktopCallPanelState(null)}
              onPanelOpened={(counts) => {
                void sendCallInviteMutation
                  .mutateAsync({
                    kind: desktopCallPanelState.kind,
                    status: "ongoing",
                    activeCount: counts.activeCount,
                    totalCount: counts.totalCount,
                    source: desktopCallPanelState.source ?? "desktop",
                  })
                  .then(() => {
                    setLastPublishedCallCounts({
                      kind: desktopCallPanelState.kind,
                      source: desktopCallPanelState.source,
                      activeCount: counts.activeCount,
                      totalCount: counts.totalCount,
                    });
                  });
              }}
              onOpenMobileHandoff={() => {
                void navigate({
                  to: "/desktop/mobile",
                  hash: buildDesktopMobileCallHandoffHash({
                    kind: desktopCallPanelState.kind,
                    conversationId: groupId,
                    conversationType: "group",
                    title: groupQuery.data?.name ?? "群聊",
                  }),
                });
              }}
              onSendInviteNotice={(counts) => {
                void sendCallInviteMutation
                  .mutateAsync({
                    kind: desktopCallPanelState.kind,
                    status: "ongoing",
                    activeCount: counts.activeCount,
                    totalCount: counts.totalCount,
                    source: desktopCallPanelState.source ?? "desktop",
                  })
                  .then(() => {
                    setLastPublishedCallCounts({
                      kind: desktopCallPanelState.kind,
                      source: desktopCallPanelState.source,
                      activeCount: counts.activeCount,
                      totalCount: counts.totalCount,
                    });
                  });
              }}
              onEndCall={(counts) => {
                void sendCallInviteMutation
                  .mutateAsync({
                    kind: desktopCallPanelState.kind,
                    status: "ended",
                    activeCount: counts.activeCount,
                    totalCount: counts.totalCount,
                    source: desktopCallPanelState.source ?? "desktop",
                    durationMs: counts.durationMs,
                    startedAt: counts.startedAt,
                  })
                  .then(() => {
                    setLastPublishedCallCounts(null);
                    setDesktopCallPanelState(null);
                  });
              }}
            />
          </div>
        ) : (
          <div
            ref={scrollAnchorRef}
            className={`relative flex h-full flex-col overflow-auto ${
              isDesktop ? "px-7 py-5" : "px-3 py-3.5"
            }`}
            onScrollCapture={handleDismissRouteContextNotice}
          >
            {groupQuery.isError && groupQuery.error instanceof Error ? (
              isDesktop ? (
                <ErrorBlock
                  className="mb-3"
                  message={groupQuery.error.message}
                />
              ) : (
                <MobileGroupThreadStatusCard
                  badge="群聊"
                  title="群聊信息暂时不可用"
                  description={groupQuery.error.message}
                  tone="danger"
                />
              )
            ) : null}
            {membersQuery.isError && membersQuery.error instanceof Error ? (
              isDesktop ? (
                <ErrorBlock
                  className="mb-3"
                  message={membersQuery.error.message}
                />
              ) : (
                <MobileGroupThreadStatusCard
                  badge="成员"
                  title="群成员信息暂时不可用"
                  description={membersQuery.error.message}
                  tone="danger"
                />
              )
            ) : null}
            {messagesQuery.isLoading ? (
              isDesktop ? (
                <LoadingBlock label="正在读取群消息..." />
              ) : (
                <MobileGroupThreadStatusCard
                  badge="读取中"
                  title="正在读取群消息"
                  description="稍等一下，正在同步这段群聊里的消息。"
                  tone="loading"
                />
              )
            ) : null}
            {messagesQuery.isError && messagesQuery.error instanceof Error ? (
              isDesktop ? (
                <ErrorBlock message={messagesQuery.error.message} />
              ) : (
                <MobileGroupThreadStatusCard
                  badge="消息"
                  title="群消息暂时不可用"
                  description={messagesQuery.error.message}
                  tone="danger"
                />
              )
            ) : null}

            <ChatMessageList
              messages={renderableMessages}
              threadContext={{
                id: groupId,
                type: "group",
                title: groupQuery.data?.name ?? "群聊",
              }}
              buildMessageReturnTo={buildMessageReturnTo}
              groupMode
              showGroupMemberNicknames={
                groupQuery.data?.showMemberNicknames ?? true
              }
              variant={isDesktop ? "desktop" : "mobile"}
              highlightedMessageId={highlightedMessageId}
              hasOlderMessages={hasOlderMessages}
              loadingOlderMessages={
                messagesQuery.isFetching && loadMoreRequestRef.current !== null
              }
              onLoadOlderMessages={() => {
                void loadOlderMessages();
              }}
              unreadMarkerMessageId={unreadMarkerMessageId}
              unreadMarkerCount={initialUnreadCount}
              onReplyMessage={handleReplyMessage}
              onRetryMessage={(message) => retryMessage(message.id)}
              onOpenGroupCallInvite={(input) => {
                if (isDesktop) {
                  setDesktopCallPanelState(input);
                  return;
                }

                void navigate({
                  to:
                    input.kind === "voice"
                      ? "/group/$groupId/voice-call"
                      : "/group/$groupId/video-call",
                  params: { groupId },
                  hash: buildMobileGroupCallRouteHash({
                    source: input.source,
                    activeCount: input.activeCount,
                    totalCount: input.totalCount,
                    recordedAt: input.recordedAt ?? undefined,
                    snapshotRecordedAt: input.snapshotRecordedAt ?? undefined,
                  }),
                });
              }}
              onSelectionModeChange={setSelectionModeActive}
              emptyState={
                !isDesktop &&
                !messagesQuery.isLoading &&
                !messagesQuery.isError ? (
                  <MobileGroupThreadStatusCard
                    badge="群聊"
                    title="群里还没有消息"
                    description="发一条消息，让这个群先热起来。"
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

      {!selectionModeActive && !(isDesktop && desktopCallPanelState) ? (
        <ChatComposer
          value={text}
          placeholder="输入消息"
          variant={isDesktop ? "desktop" : "mobile"}
          pending={sendMutation.isPending}
          error={sendError}
          speechInput={{
            baseUrl,
            conversationId: groupId,
            enabled: runtimeConfig.appPlatform !== "desktop",
          }}
          onChange={(value) => {
            handleDismissRouteContextNotice();
            setText(value);
          }}
          onSendSticker={async (sticker) => {
            await handleSendSticker(sticker);
            setReplyDraft(null);
          }}
          onSendAttachment={sendAttachmentMessage}
          onSendPresetText={handleSendPresetText}
          mentionCandidates={mentionCandidates}
          mobileShortcutRequest={mobileShortcutRequest}
          onMobileShortcutHandled={() => {
            setMobileShortcutRequest(null);
          }}
          replyPreview={replyPreview}
          onCancelReply={() => setReplyDraft(null)}
          onStartVoiceCall={() => {
            void navigate({
              to: "/group/$groupId/voice-call",
              params: { groupId },
            });
          }}
          onStartVideoCall={() => {
            void navigate({
              to: "/group/$groupId/video-call",
              params: { groupId },
            });
          }}
          onSubmit={() => void handleSubmit()}
        />
      ) : null}
    </div>
  );
}

function MobileGroupThreadStatusCard({
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

const INITIAL_MESSAGE_LIMIT = 60;
const HISTORY_PAGE_SIZE = 40;

function escapeIdSelector(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value;
}
