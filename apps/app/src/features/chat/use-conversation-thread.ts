import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConversationMessages,
  getConversations,
  markConversationRead,
  uploadChatAttachment,
  type Message,
  type SendMessagePayload,
  type StickerAttachment,
} from "@yinjie/contracts";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
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
import { sanitizeDisplayedChatText } from "../../lib/chat-text";
import { parseTimestamp } from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../store/world-owner-store";

export function useConversationThread(conversationId: string) {
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const username = useWorldOwnerStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
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
  const scrollAnchor = useScrollAnchor<HTMLDivElement>(messages.length);
  const {
    ref: scrollAnchorRef,
    suppressNextPendingCount,
  } = scrollAnchor;
  const loadMoreRequestRef = useRef<{
    previousCount: number;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["app-conversation-messages", baseUrl, conversationId, messageLimit],
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

  useEffect(() => {
    setMessages(messagesQuery.data ?? []);
  }, [messagesQuery.data]);

  useEffect(() => {
    setMessageLimit(INITIAL_MESSAGE_LIMIT);
    setHasOlderMessages(true);
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

    setSocketError(null);
    setTypingCharacterId(null);
    joinConversationRoom({ conversationId });
    void markConversationRead(conversationId, baseUrl).then(() => {
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    const offMessage = onChatMessage((payload) => {
      if (!("conversationId" in payload) || payload.conversationId !== conversationId) {
        return;
      }

      setSocketError(null);
      setMessages((current) => {
        const withoutPendingEcho =
          payload.senderType === "user" && payload.senderId === ownerId
            ? removePendingUserEcho(current, payload)
            : current;

        const existingIndex = withoutPendingEcho.findIndex(
          (item) => item.id === payload.id,
        );
        if (existingIndex >= 0) {
          const nextMessages = [...withoutPendingEcho];
          nextMessages[existingIndex] = payload;
          return nextMessages;
        }

        return [...withoutPendingEcho, payload];
      });
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
      setMessages((current) =>
        current.filter((item) => !item.id.startsWith("local_")),
      );
      setSocketError(message);
    });

    return () => {
      offMessage();
      offTypingStart();
      offTypingStop();
      offConversationUpdated();
      offError();
    };
  }, [baseUrl, conversationId, ownerId, queryClient, unreadSnapshotReady]);

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
        pendingLoad.scrollTop + (element.scrollHeight - pendingLoad.scrollHeight);
      element.scrollTop = nextScrollTop;
    });
  }, [messageLimit, messagesQuery.data, messagesQuery.isFetching, scrollAnchor.ref]);

  const sendMutation = useMutation({
    mutationFn: async (payload: SendMessagePayload) => {
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

      emitChatMessage(payload);

      setSocketError(null);
      setMessages((current) => [
        ...current,
        buildOptimisticMessage(payload, ownerId, username ?? "You"),
      ]);
      if (payload.type !== "sticker") {
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
      conversationId,
      characterId: targetCharacterId,
      text: trimmed,
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
      conversationId,
      characterId: targetCharacterId,
      type: "sticker",
      text: overrideText ?? `[表情包] ${sticker.label ?? sticker.stickerId}`,
      sticker: {
        packId: sticker.packId,
        stickerId: sticker.stickerId,
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
        conversationId,
        characterId: targetCharacterId,
        type: "image",
        text: overrideText,
        attachment: result.attachment,
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
        conversationId,
        characterId: targetCharacterId,
        type: "file",
        text: overrideText,
        attachment: result.attachment,
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
        conversationId,
        characterId: targetCharacterId,
        type: "voice",
        text: overrideText,
        attachment: result.attachment,
      });
      return;
    }

    if (payload.type === "contact_card") {
      await sendMutation.mutateAsync({
        conversationId,
        characterId: targetCharacterId,
        type: "contact_card",
        text: overrideText,
        attachment: payload.attachment,
      });
      return;
    }

    await sendMutation.mutateAsync({
      conversationId,
      characterId: targetCharacterId,
      type: "location_card",
      text: overrideText,
      attachment: payload.attachment,
    });
  };

  const renderedMessages = useMemo(() => {
    const deduped = new Map<string, Message>();
    for (const item of messages) {
      deduped.set(item.id, item);
    }
    return [...deduped.values()].sort(
      (left, right) =>
        (parseTimestamp(left.createdAt) ?? 0) -
        (parseTimestamp(right.createdAt) ?? 0),
    );
  }, [messages]);

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

  return {
    baseUrl,
    conversationTitle,
    conversationType: "direct" as "direct" | "group",
    initialUnreadCount,
    initialUnreadCutoff,
    hasOlderMessages,
    loadingOlderMessages:
      messagesQuery.isFetching && loadMoreRequestRef.current !== null,
    loadOlderMessages,
    messagesQuery,
    participants,
    renderedMessages,
    scrollAnchor,
    sendMutation,
    sendStickerMessage,
    sendAttachmentMessage,
    sendTextMessage,
    setSocketError,
    setText,
    socketError,
    text,
    typingCharacterId,
  };
}

const INITIAL_MESSAGE_LIMIT = 60;
const HISTORY_PAGE_SIZE = 40;

function removePendingUserEcho(current: Message[], incoming: Message) {
  const pendingIndex = current.findIndex(
    (item) =>
      item.id.startsWith("local_") &&
      item.senderType === "user" &&
      item.senderId === incoming.senderId &&
      item.text === incoming.text &&
      attachmentsEqual(item.attachment, incoming.attachment),
  );

  if (pendingIndex === -1) {
    return current;
  }

  return current.filter((_, index) => index !== pendingIndex);
}

function attachmentsEqual(
  left?: Message["attachment"],
  right?: Message["attachment"],
) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "sticker" && right.kind === "sticker") {
    return left.packId === right.packId && left.stickerId === right.stickerId;
  }

  if (left.kind === "image" && right.kind === "image") {
    return left.url === right.url && left.fileName === right.fileName;
  }

  if (left.kind === "file" && right.kind === "file") {
    return left.url === right.url && left.fileName === right.fileName;
  }

  if (left.kind === "voice" && right.kind === "voice") {
    return left.url === right.url && left.fileName === right.fileName;
  }

  if (left.kind === "contact_card" && right.kind === "contact_card") {
    return left.characterId === right.characterId;
  }

  if (left.kind === "location_card" && right.kind === "location_card") {
    return left.sceneId === right.sceneId && left.title === right.title;
  }

  return false;
}

function buildOptimisticMessage(
  payload: SendMessagePayload,
  ownerId: string,
  senderName: string,
): Message {
  const createdAt = String(Date.now());

  if (payload.type === "sticker") {
    const stickerLabel = sanitizeDisplayedChatText(payload.text ?? "").replace(
      /^\[表情包\]\s*/,
      "",
    );

    return {
      id: `local_${createdAt}`,
      conversationId: payload.conversationId,
      senderType: "user",
      senderId: ownerId,
      senderName,
      type: "sticker",
      text: payload.text ?? "[表情包]",
      attachment: {
        kind: "sticker",
        packId: payload.sticker.packId,
        stickerId: payload.sticker.stickerId,
        url: `/stickers/${payload.sticker.packId}/${payload.sticker.stickerId}.svg`,
        width: 160,
        height: 160,
        label: stickerLabel || payload.sticker.stickerId,
      },
      createdAt,
    };
  }

  if (
    payload.type === "image" ||
    payload.type === "file" ||
    payload.type === "voice" ||
    payload.type === "contact_card" ||
    payload.type === "location_card"
  ) {
    return {
      id: `local_${createdAt}`,
      conversationId: payload.conversationId,
      senderType: "user",
      senderId: ownerId,
      senderName,
      type: payload.type,
      text:
        payload.text ??
        (payload.type === "contact_card"
          ? `[名片] ${payload.attachment.name}`
          : payload.type === "location_card"
            ? `[位置] ${payload.attachment.title}`
            : payload.type === "voice"
              ? "[语音]"
              : payload.type === "file"
                ? `[文件] ${payload.attachment.fileName}`
                : `[图片] ${payload.attachment.fileName}`),
      attachment: payload.attachment,
      createdAt,
    };
  }

  return {
    id: `local_${createdAt}`,
    conversationId: payload.conversationId,
    senderType: "user",
    senderId: ownerId,
    senderName,
    type: "text",
    text: payload.text,
    createdAt,
  };
}

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
