import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConversationMessages, getConversations, markConversationRead, type Message, type SendMessagePayload, type StickerAttachment } from "@yinjie/contracts";
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
  const [typingCharacterId, setTypingCharacterId] = useState<string | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("Conversation");
  const [conversationType, setConversationType] = useState<"direct" | "group">("direct");
  const [participants, setParticipants] = useState<string[]>([]);
  const scrollAnchorRef = useScrollAnchor<HTMLDivElement>(
    `${conversationId}:${messages.length}:${typingCharacterId ?? ""}`,
  );

  const messagesQuery = useQuery({
    queryKey: ["app-conversation-messages", baseUrl, conversationId],
    queryFn: () => getConversationMessages(conversationId, baseUrl),
    enabled: Boolean(conversationId),
  });

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(ownerId),
  });

  useEffect(() => {
    setMessages(messagesQuery.data ?? []);
  }, [messagesQuery.data]);

  useEffect(() => {
    const conversation = conversationsQuery.data?.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    setConversationTitle(conversation.title);
    setConversationType(conversation.type);
    setParticipants(conversation.participants);
  }, [conversationId, conversationsQuery.data]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    setSocketError(null);
    setTypingCharacterId(null);
    joinConversationRoom({ conversationId });
    void markConversationRead(conversationId, baseUrl).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl] });
    });

    const offMessage = onChatMessage((payload) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

      setSocketError(null);
      setMessages((current) => {
        const withoutPendingEcho =
          payload.senderType === "user" && payload.senderId === ownerId
            ? removePendingUserEcho(current, payload)
            : current;

        if (withoutPendingEcho.some((item) => item.id === payload.id)) {
          return withoutPendingEcho;
        }

        return [...withoutPendingEcho, payload];
      });
      void queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl] });
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
      setConversationType(payload.type);
      setParticipants(payload.participants);
      void queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl] });
    });

    const offError = onChatError((message) => {
      setMessages((current) => current.filter((item) => !item.id.startsWith("local_")));
      setSocketError(message);
    });

    return () => {
      offMessage();
      offTypingStart();
      offTypingStop();
      offConversationUpdated();
      offError();
    };
  }, [baseUrl, conversationId, ownerId, queryClient]);

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
      setMessages((current) => [...current, buildOptimisticMessage(payload, ownerId, username ?? "You")]);
      if (payload.type !== "sticker") {
        setText("");
      }
    },
  });

  const sendTextMessage = async () => {
    const trimmed = text.trim();
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

  const sendStickerMessage = async (sticker: StickerAttachment) => {
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
      text: `[表情包] ${sticker.label ?? sticker.stickerId}`,
      sticker: {
        packId: sticker.packId,
        stickerId: sticker.stickerId,
      },
    });
  };

  const renderedMessages = useMemo(() => {
    const deduped = new Map<string, Message>();
    for (const item of messages) {
      deduped.set(item.id, item);
    }
    return [...deduped.values()].sort(
      (left, right) => (parseTimestamp(left.createdAt) ?? 0) - (parseTimestamp(right.createdAt) ?? 0),
    );
  }, [messages]);

  return {
    baseUrl,
    conversationTitle,
    conversationType,
    messagesQuery,
    participants,
    renderedMessages,
    scrollAnchorRef,
    sendMutation,
    sendStickerMessage,
    sendTextMessage,
    setSocketError,
    setText,
    socketError,
    text,
    typingCharacterId,
  };
}

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

function attachmentsEqual(left?: Message["attachment"], right?: Message["attachment"]) {
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

  return false;
}

function buildOptimisticMessage(payload: SendMessagePayload, ownerId: string, senderName: string): Message {
  const createdAt = String(Date.now());

  if (payload.type === "sticker") {
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
        label: payload.text?.replace(/^\[表情包\]\s*/, "") || payload.sticker.stickerId,
      },
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
  const fromMessages = input.messages.find((item) => item.senderType === "character")?.senderId;
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
