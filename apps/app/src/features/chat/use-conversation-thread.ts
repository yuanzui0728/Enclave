import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConversationMessages, getConversations, markConversationRead, type Message } from "@yinjie/contracts";
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
import { useSessionStore } from "../../store/session-store";

export function useConversationThread(conversationId: string) {
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);
  const username = useSessionStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingCharacterId, setTypingCharacterId] = useState<string | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("Conversation");
  const [conversationType, setConversationType] = useState<"direct" | "group">("direct");
  const [participants, setParticipants] = useState<string[]>([]);
  const scrollAnchorRef = useScrollAnchor<HTMLDivElement>([messages.length, typingCharacterId, conversationId]);

  const messagesQuery = useQuery({
    queryKey: ["app-conversation-messages", baseUrl, conversationId],
    queryFn: () => getConversationMessages(conversationId, baseUrl),
    enabled: Boolean(conversationId),
  });

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl, userId],
    queryFn: () => getConversations(userId!, baseUrl),
    enabled: Boolean(userId),
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
    joinConversationRoom({ conversationId, userId: userId ?? undefined });
    void markConversationRead(conversationId, baseUrl).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl, userId] });
    });

    const offMessage = onChatMessage((payload) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

      setSocketError(null);
      setMessages((current) => {
        const withoutPendingEcho =
          payload.senderType === "user" && payload.senderId === userId
            ? removePendingUserEcho(current, payload)
            : current;

        if (withoutPendingEcho.some((item) => item.id === payload.id)) {
          return withoutPendingEcho;
        }

        return [...withoutPendingEcho, payload];
      });
      void queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl, userId] });
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
      void queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl, userId] });
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
  }, [baseUrl, conversationId, queryClient, userId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const trimmed = text.trim();
      if (!trimmed || !userId) {
        return;
      }

      const targetCharacterId = resolveTargetCharacterId({
        conversationId,
        userId,
        messages,
        participants,
      });

      if (!targetCharacterId) {
        throw new Error("The target character is not ready yet.");
      }

      emitChatMessage({
        conversationId,
        characterId: targetCharacterId,
        text: trimmed,
        userId,
      });

      setSocketError(null);
      setMessages((current) => [
        ...current,
        {
          id: `local_${Date.now()}`,
          conversationId,
          senderType: "user",
          senderId: userId,
          senderName: username ?? "You",
          type: "text",
          text: trimmed,
          createdAt: String(Date.now()),
        },
      ]);
      setText("");
    },
  });

  const renderedMessages = useMemo(() => {
    const deduped = new Map<string, Message>();
    for (const item of messages) {
      deduped.set(item.id, item);
    }
    return [...deduped.values()].sort((left, right) => Number(left.createdAt) - Number(right.createdAt));
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
      item.text === incoming.text,
  );

  if (pendingIndex === -1) {
    return current;
  }

  return current.filter((_, index) => index !== pendingIndex);
}

function resolveTargetCharacterId(input: {
  conversationId: string;
  userId: string;
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

  const directPrefix = `${input.userId}_`;
  if (input.conversationId.startsWith(directPrefix)) {
    const inferred = input.conversationId.slice(directPrefix.length).trim();
    if (inferred) {
      return inferred;
    }
  }

  return "";
}
