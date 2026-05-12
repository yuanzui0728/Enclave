import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  getConversationMessages,
  getConversations,
  markConversationRead,
  REMINDER_CHARACTER_ID,
  uploadChatAttachment,
  type ConversationListItem,
  type Message,
  type SendMessagePayload,
  type StickerAttachment,
  type TypingPayload,
} from "@yinjie/contracts";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import {
  buildDirectRetryPayload,
  buildOptimisticDirectMessage,
  type DirectThreadMessage,
  markThreadMessageSending,
  markThreadMessagesFailed,
  mergeDirectMessageWindow,
  upsertIncomingDirectMessage,
} from "./chat-message-delivery";
import { useScrollAnchor } from "../../hooks/use-scroll-anchor";
import {
  emitChatMessage,
  getChatSocket,
  joinConversationRoom,
  onChatError,
  onChatMessage,
  onConversationUpdated,
  onTypingStart,
  onTypingStop,
} from "../../lib/socket";
import { handleSocketSubscriptionExpiredError } from "../../lib/subscription-expired";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../store/world-owner-store";

const t = translateRuntimeMessage;

export function useConversationThread(conversationId: string) {
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const username = useWorldOwnerStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<DirectThreadMessage[]>([]);
  const [typingState, setTypingState] = useState<{
    characterId: string;
    stage?: TypingPayload["stage"];
  } | null>(
    null,
  );
  const [socketError, setSocketError] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("Conversation");
  const [participants, setParticipants] = useState<string[]>([]);
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);
  const [initialUnreadCutoff, setInitialUnreadCutoff] = useState<string | null>(
    null,
  );
  const [unreadSnapshotReady, setUnreadSnapshotReady] = useState(false);
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [loadingAnchorWindow, setLoadingAnchorWindow] = useState(false);
  const scrollAnchor = useScrollAnchor<HTMLDivElement>(messages.length);
  const { ref: scrollAnchorRef, suppressNextPendingCount } = scrollAnchor;
  const loadMoreRequestRef = useRef<{
    previousCount: number;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);

  const messagesQuery = useQuery({
    queryKey: [
      "app-conversation-messages",
      baseUrl,
      conversationId,
      messageLimit,
    ],
    queryFn: () =>
      getConversationMessages(conversationId, baseUrl, { limit: messageLimit }),
    enabled: Boolean(conversationId),
  });

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(ownerId),
  });
  const activeConversation = conversationsQuery.data?.find(
    (item) => item.id === conversationId,
  );
  const isReminderConversation =
    conversationId === `direct_${REMINDER_CHARACTER_ID}` ||
    activeConversation?.participants.includes(REMINDER_CHARACTER_ID) === true;
  const invalidateReminderQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["app-reminder-runtime-tasks", baseUrl],
      }),
      queryClient.invalidateQueries({
        queryKey: ["app-reminder-runtime-upcoming", baseUrl],
      }),
    ]);
  }, [baseUrl, queryClient]);
  const syncConversationListCache = useCallback(
    (updater: (current: ConversationListItem[]) => ConversationListItem[]) => {
      queryClient.setQueryData<ConversationListItem[]>(
        ["app-conversations", baseUrl],
        (current) => (current ? updater(current) : current),
      );
    },
    [baseUrl, queryClient],
  );
  const syncActiveConversationMessage = useCallback(
    (message: Message) => {
      syncConversationListCache((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                lastMessage: message,
                lastActivityAt: message.createdAt,
                updatedAt: message.createdAt,
              }
            : item,
        ),
      );
    },
    [conversationId, syncConversationListCache],
  );
  const syncActiveConversationReadState = useCallback(
    (readAt: string) => {
      syncConversationListCache((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                unreadCount: 0,
                lastReadAt: readAt,
              }
            : item,
        ),
      );
    },
    [conversationId, syncConversationListCache],
  );

  useEffect(() => {
    setMessages((current) =>
      mergeDirectMessageWindow(current, messagesQuery.data ?? []),
    );
  }, [messagesQuery.data]);

  useEffect(() => {
    setMessageLimit(INITIAL_MESSAGE_LIMIT);
    setHasOlderMessages(true);
    setLoadingAnchorWindow(false);
    loadMoreRequestRef.current = null;
    setInitialUnreadCount(0);
    setInitialUnreadCutoff(null);
    setUnreadSnapshotReady(false);
  }, [conversationId]);

  useEffect(() => {
    const conversation = activeConversation;
    if (!conversation) {
      return;
    }

    setConversationTitle(conversation.title);
    setParticipants(conversation.participants.slice(0, 1));
  }, [activeConversation]);

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
    if (!conversationId || !unreadSnapshotReady) {
      return;
    }

    const markActiveConversationRead = async () => {
      const readAt = new Date().toISOString();
      syncActiveConversationReadState(readAt);

      try {
        await markConversationRead(conversationId, baseUrl);
      } finally {
        await queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      }
    };

    setSocketError(null);
    setTypingState(null);
    joinConversationRoom({ conversationId });
    void markActiveConversationRead();

    const offMessage = onChatMessage((payload) => {
      if (
        !("conversationId" in payload) ||
        payload.conversationId !== conversationId
      ) {
        return;
      }

      setSocketError(null);
      setMessages((current) => upsertIncomingDirectMessage(current, payload));
      syncActiveConversationMessage(payload);
      if (isReminderConversation) {
        void invalidateReminderQueries();
      }

      if (payload.senderType === "character") {
        setTypingState((current) =>
          current?.characterId === payload.senderId ? null : current,
        );
        void markActiveConversationRead();
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    const offTypingStart = onTypingStart((payload) => {
      if (payload.conversationId === conversationId) {
        setTypingState({
          characterId: payload.characterId,
          stage: payload.stage,
        });
      }
    });

    const offTypingStop = onTypingStop((payload) => {
      if (payload.conversationId === conversationId) {
        setTypingState((current) => {
          if (!current || current.characterId !== payload.characterId) {
            return current;
          }

          if (payload.stage && current.stage && payload.stage !== current.stage) {
            return current;
          }

          return null;
        });
      }
    });

    const offConversationUpdated = onConversationUpdated((payload) => {
      if (payload.id !== conversationId) {
        return;
      }

      setConversationTitle(payload.title);
      setParticipants(payload.participants.slice(0, 1));
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    const offError = onChatError((payload) => {
      setMessages((current) => markThreadMessagesFailed(current));
      handleSocketSubscriptionExpiredError(payload);
      setSocketError(payload.message);
    });

    return () => {
      offMessage();
      offTypingStart();
      offTypingStop();
      offConversationUpdated();
      offError();
    };
  }, [
    baseUrl,
    conversationId,
    invalidateReminderQueries,
    isReminderConversation,
    ownerId,
    queryClient,
    syncActiveConversationMessage,
    syncActiveConversationReadState,
    unreadSnapshotReady,
  ]);

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
      const element = scrollAnchor.ref.current;
      if (!element) {
        return;
      }

      const nextScrollTop =
        pendingLoad.scrollTop +
        (element.scrollHeight - pendingLoad.scrollHeight);
      element.scrollTop = nextScrollTop;
    });
  }, [
    messageLimit,
    messagesQuery.data,
    messagesQuery.isFetching,
    scrollAnchor.ref,
  ]);

  const sendMutation = useMutation({
    // optimistic UI 在 onMutate 里做：消息立刻出现、输入框立刻清空。mutationFn
    // 只负责真正的副作用 (socket emit)，throw 时 onError 把对应本地消息标记为
    // failed，避免「socket 离线时点发送 → 消息永远卡 sending」。
    onMutate: (input: {
      payload: SendMessagePayload;
      retryMessageId?: string;
    }) => {
      if (!ownerId) return { messageId: undefined };

      setSocketError(null);

      let messageId: string | undefined;
      if (input.retryMessageId) {
        messageId = input.retryMessageId;
        setMessages((current) =>
          markThreadMessageSending(current, input.retryMessageId!),
        );
      } else {
        const optimistic = buildOptimisticDirectMessage({
          payload: input.payload,
          ownerId,
          senderName: username ?? "You",
        });
        messageId = optimistic.id;
        setMessages((current) => [...current, optimistic]);
      }

      if (!input.retryMessageId && input.payload.type !== "sticker") {
        setText("");
      }

      return { messageId };
    },
    mutationFn: async (input: {
      payload: SendMessagePayload;
      retryMessageId?: string;
    }) => {
      if (!ownerId) return;

      // Fail-fast：socket 断开时不要让消息卡在 sending。socket.io-client 在
      // 断开期间会 buffer emits 并在重连后 replay，但用户当下不知道，体感是
      // 「发了没动静」。直接抛错让 onError 把消息标 failed + 显示重试按钮。
      if (!getChatSocket().connected) {
        throw new Error("socket-disconnected");
      }
      emitChatMessage(input.payload);
    },
    onError: (_err, _variables, context) => {
      const messageId = context?.messageId;
      if (!messageId) return;
      setMessages((current) =>
        markThreadMessagesFailed(current, [messageId]),
      );
    },
  });

  const sendTextMessage = async (overrideText?: string) => {
    const trimmed = (overrideText ?? text).trim();
    if (!trimmed || !ownerId) {
      return;
    }

    const targetCharacterId = resolveTargetCharacterId({
      conversationId,
      ownerId,
      messages,
      participants,
    });

    if (!targetCharacterId) {
      throw new Error(t(msg`The target character is not ready yet.`));
    }

    await sendMutation.mutateAsync({
      payload: {
        conversationId,
        characterId: targetCharacterId,
        text: trimmed,
      },
    });
  };

  const sendStickerMessage = async (
    sticker: StickerAttachment,
    overrideText?: string,
  ) => {
    if (!ownerId) {
      return;
    }

    const targetCharacterId = resolveTargetCharacterId({
      conversationId,
      ownerId,
      messages,
      participants,
    });

    if (!targetCharacterId) {
      throw new Error(t(msg`The target character is not ready yet.`));
    }

    await sendMutation.mutateAsync({
      payload: {
        conversationId,
        characterId: targetCharacterId,
        type: "sticker",
        // i18n-ignore-next-line: protocol marker for sticker text payload
        text: overrideText ?? t(msg`[表情包] ${sticker.label ?? sticker.stickerId}`),
        sticker: {
          sourceType: sticker.sourceType,
          packId: sticker.packId,
          stickerId: sticker.stickerId,
        },
        attachment: sticker,
      },
    });
  };

  const sendAttachmentMessage = async (
    payload: ChatComposerAttachmentPayload,
    overrideText?: string,
  ) => {
    if (!ownerId) {
      return;
    }

    const targetCharacterId = resolveTargetCharacterId({
      conversationId,
      ownerId,
      messages,
      participants,
    });

    if (!targetCharacterId) {
      throw new Error(t(msg`The target character is not ready yet.`));
    }

    if (payload.type === "image") {
      const formData = new FormData();
      formData.set("file", payload.file);
      formData.set("width", String(payload.width ?? ""));
      formData.set("height", String(payload.height ?? ""));
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "image") {
        throw new Error(t(msg`图片上传结果异常。`));
      }

      await sendMutation.mutateAsync({
        payload: {
          conversationId,
          characterId: targetCharacterId,
          type: "image",
          text: overrideText,
          attachment: result.attachment,
        },
      });
      return;
    }

    if (payload.type === "file") {
      const formData = new FormData();
      formData.set("file", payload.file);
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "file") {
        throw new Error(t(msg`文件上传结果异常。`));
      }

      await sendMutation.mutateAsync({
        payload: {
          conversationId,
          characterId: targetCharacterId,
          type: "file",
          text: overrideText,
          attachment: result.attachment,
        },
      });
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
        throw new Error(t(msg`语音上传结果异常。`));
      }

      await sendMutation.mutateAsync({
        payload: {
          conversationId,
          characterId: targetCharacterId,
          type: "voice",
          text: overrideText,
          attachment: result.attachment,
        },
      });
      return;
    }

    if (payload.type === "contact_card") {
      await sendMutation.mutateAsync({
        payload: {
          conversationId,
          characterId: targetCharacterId,
          type: "contact_card",
          text: overrideText,
          attachment: payload.attachment,
        },
      });
      return;
    }

    await sendMutation.mutateAsync({
      payload: {
        conversationId,
        characterId: targetCharacterId,
        type: "location_card",
        text: overrideText,
        attachment: payload.attachment,
      },
    });
  };

  const retryMessage = useCallback(
    async (messageId: string) => {
      if (!ownerId) {
        return;
      }

      const failedMessage = messages.find(
        (message) =>
          message.id === messageId && message.localStatus === "failed",
      );
      if (!failedMessage) {
        return;
      }

      const targetCharacterId = resolveTargetCharacterId({
        conversationId,
        ownerId,
        messages,
        participants,
      });
      const payload = buildDirectRetryPayload({
        message: failedMessage,
        characterId: targetCharacterId,
      });

      if (!payload) {
        throw new Error(t(msg`这条消息暂时无法重试发送。`));
      }

      await sendMutation.mutateAsync({
        payload,
        retryMessageId: messageId,
      });
    },
    [conversationId, messages, ownerId, participants, sendMutation],
  );

  const renderedMessages = useMemo(() => messages, [messages]);

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
        const windowMessages = await getConversationMessages(
          conversationId,
          baseUrl,
          {
            aroundMessageId: normalizedMessageId,
            before: 24,
            after: 24,
          },
        );
        if (!windowMessages.length) {
          return false;
        }

        suppressNextPendingCount();
        setMessages((current) =>
          mergeDirectMessageWindow(current, windowMessages),
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
    [baseUrl, conversationId, loadingAnchorWindow, suppressNextPendingCount],
  );

  return {
    baseUrl,
    conversationTitle,
    conversationType: "direct" as "direct" | "group",
    initialUnreadCount,
    initialUnreadCutoff,
    unreadSnapshotReady,
    hasOlderMessages,
    loadingOlderMessages:
      messagesQuery.isFetching && loadMoreRequestRef.current !== null,
    loadingAnchorWindow,
    loadOlderMessages,
    loadAnchorWindow,
    messagesQuery,
    participants,
    renderedMessages,
    scrollAnchor,
    sendMutation,
    sendStickerMessage,
    sendAttachmentMessage,
    sendTextMessage,
    retryMessage,
    setSocketError,
    setText,
    socketError,
    text,
    typingState,
  };
}

const INITIAL_MESSAGE_LIMIT = 60;
const HISTORY_PAGE_SIZE = 40;

function resolveTargetCharacterId(input: {
  conversationId: string;
  ownerId: string;
  messages: Message[];
  participants: string[];
}) {
  const fromMessages = input.messages.find(
    (item) => item.senderType === "character",
  )?.senderId;
  if (fromMessages) {
    return fromMessages;
  }

  const fromParticipants = input.participants[0];
  if (fromParticipants) {
    return fromParticipants;
  }

  const directPrefix = "direct_";
  if (input.conversationId.startsWith(directPrefix)) {
    const inferred = input.conversationId.slice(directPrefix.length).trim();
    if (inferred) {
      return inferred;
    }
  }

  return "";
}
