import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConversationMessages,
  getConversations,
  markConversationRead,
  uploadChatAttachment,
  type ConversationListItem,
  type Message,
  type SendMessagePayload,
  type StickerAttachment,
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
  joinConversationRoom,
  onChatError,
  onChatMessage,
  onConversationUpdated,
  onTypingStart,
  onTypingStop,
} from "../../lib/socket";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../store/world-owner-store";

export function useConversationThread(conversationId: string) {
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const username = useWorldOwnerStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<DirectThreadMessage[]>([]);
  const [typingCharacterId, setTypingCharacterId] = useState<string | null>(
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
    setTypingCharacterId(null);
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

      if (payload.senderType === "character") {
        void markActiveConversationRead();
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    const offTypingStart = onTypingStart((payload) => {
      if (payload.conversationId === conversationId) {
        setTypingCharacterId(payload.characterId);
      }
    });

    const offTypingStop = onTypingStop((payload) => {
      if (payload.conversationId === conversationId) {
        setTypingCharacterId(null);
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

    const offError = onChatError((message) => {
      setMessages((current) => markThreadMessagesFailed(current));
      setSocketError(message);
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
    mutationFn: async (input: {
      payload: SendMessagePayload;
      retryMessageId?: string;
    }) => {
      if (!ownerId) {
        return;
      }

      setSocketError(null);
      emitChatMessage(input.payload);
      setMessages((current) =>
        input.retryMessageId
          ? markThreadMessageSending(current, input.retryMessageId)
          : [
              ...current,
              buildOptimisticDirectMessage({
                payload: input.payload,
                ownerId,
                senderName: username ?? "You",
              }),
            ],
      );
      if (!input.retryMessageId && input.payload.type !== "sticker") {
        setText("");
      }
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
      throw new Error("The target character is not ready yet.");
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
      throw new Error("The target character is not ready yet.");
    }

    await sendMutation.mutateAsync({
      payload: {
        conversationId,
        characterId: targetCharacterId,
        type: "sticker",
        text: overrideText ?? `[表情包] ${sticker.label ?? sticker.stickerId}`,
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
      throw new Error("The target character is not ready yet.");
    }

    if (payload.type === "image") {
      const formData = new FormData();
      formData.set("file", payload.file);
      formData.set("width", String(payload.width ?? ""));
      formData.set("height", String(payload.height ?? ""));
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "image") {
        throw new Error("图片上传结果异常。");
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
        throw new Error("文件上传结果异常。");
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
        throw new Error("语音上传结果异常。");
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
        throw new Error("这条消息暂时无法重试发送。");
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
    typingCharacterId,
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
