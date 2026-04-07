import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, OctagonAlert, Users } from "lucide-react";
import { createModerationReport, getConversationMessages, getConversations, markConversationRead, type Message } from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { ChatComposer } from "../components/chat-composer";
import { ChatMessageList } from "../components/chat-message-list";
import { EmptyState } from "../components/empty-state";
import { useScrollAnchor } from "../hooks/use-scroll-anchor";
import { promptForSafetyReason } from "../lib/safety";
import {
  emitChatMessage,
  joinConversationRoom,
  onChatError,
  onChatMessage,
  onConversationUpdated,
  onTypingStart,
  onTypingStop,
} from "../lib/socket";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useSessionStore } from "../store/session-store";

export function ChatRoomPage() {
  const { conversationId } = useParams({ from: "/chat/$conversationId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);
  const username = useSessionStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingCharacterId, setTypingCharacterId] = useState<string | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [conversationType, setConversationType] = useState<"direct" | "group">("direct");
  const [conversationTitle, setConversationTitle] = useState("对话");
  const [participants, setParticipants] = useState<string[]>([]);
  const scrollAnchorRef = useScrollAnchor<HTMLDivElement>([messages.length, typingCharacterId, conversationId]);

  const messagesQuery = useQuery({
    queryKey: ["app-conversation-messages", baseUrl, conversationId],
    queryFn: () => getConversationMessages(conversationId),
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl, userId],
    queryFn: () => getConversations(userId!),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    setMessages([]);
    setTypingCharacterId(null);
    setSocketError(null);
    setConversationType("direct");
    setConversationTitle("对话");
    setParticipants([]);
  }, [baseUrl, conversationId]);

  useEffect(() => {
    setMessages(messagesQuery.data ?? []);
  }, [messagesQuery.data]);

  useEffect(() => {
    const conversation = conversationsQuery.data?.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    setConversationType(conversation.type);
    setConversationTitle(conversation.title);
    setParticipants(conversation.participants);
  }, [conversationId, conversationsQuery.data]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    setSocketError(null);
    joinConversationRoom({ conversationId, userId: userId ?? undefined });
    void markConversationRead(conversationId).then(() => {
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
          return current;
        }
        return [...withoutPendingEcho, payload];
      });
      void queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl, userId] });
    });

    const offTypingStart = onTypingStart((payload) => {
      if (payload.conversationId !== conversationId) {
        return;
      }
      setSocketError(null);
      setTypingCharacterId(payload.characterId);
    });
    const offTypingStop = onTypingStop((payload) => {
      if (payload.conversationId !== conversationId) {
        return;
      }
      setSocketError(null);
      setTypingCharacterId(null);
    });
    const offConversationUpdated = onConversationUpdated((payload) => {
      if (payload.id !== conversationId) {
        return;
      }

      setSocketError(null);
      setConversationType(payload.type);
      setConversationTitle(payload.title);
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
        setSocketError("当前会话目标未就绪，请稍后再试。");
        return;
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
          senderName: username ?? "我",
          type: "text",
          text: trimmed,
          createdAt: String(Date.now()),
        },
      ]);
      setText("");
    },
  });
  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!userId || conversationType !== "direct" || participants.length === 0) {
        return;
      }

      const reason = promptForSafetyReason(`举报 ${conversationTitle}`);
      if (!reason) {
        return;
      }

      return createModerationReport({
        userId,
        targetType: "character",
        targetId: participants[0]!,
        reason,
        details: `conversation:${conversationId}`,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["moderation-reports", baseUrl, userId] });
    },
  });

  const renderedMessages = useMemo(() => {
    const deduped = new Map<string, Message>();
    for (const item of messages) {
      deduped.set(item.id, item);
    }
    return [...deduped.values()].sort((left, right) => Number(left.createdAt) - Number(right.createdAt));
  }, [messages]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(7,12,20,0.3),rgba(7,12,20,0.5))] px-5 py-4 backdrop-blur-xl">
        <Button onClick={() => navigate({ to: "/tabs/chat" })} variant="ghost" size="icon" className="text-[color:var(--text-secondary)]">
          <ArrowLeft size={18} />
        </Button>
        <AvatarChip name={conversationTitle} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{conversationTitle}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
            {conversationType === "group" ? <Users size={12} /> : null}
            <span>{conversationType === "group" ? "临时协作群聊" : "单聊"}</span>
            {participants.length > 0 ? <span>成员 {participants.length}</span> : null}
          </div>
        </div>
        <Link to="/tabs/contacts" className="text-xs text-[color:var(--brand-secondary)]">
          通讯录
        </Link>
        {conversationType === "direct" && participants[0] ? (
          <button
            type="button"
            onClick={() => reportMutation.mutate()}
            className="text-xs text-[color:var(--brand-secondary)]"
          >
            <span className="inline-flex items-center gap-1">
              <OctagonAlert size={12} />
              举报
            </span>
          </button>
        ) : null}
      </header>

      <div ref={scrollAnchorRef} className="flex-1 space-y-4 overflow-auto px-5 py-5">
        {messagesQuery.isLoading ? <LoadingBlock label="正在读取对话..." /> : null}

        {messagesQuery.isError && messagesQuery.error instanceof Error ? <ErrorBlock message={messagesQuery.error.message} /> : null}
        {socketError ? <ErrorBlock message={socketError} /> : null}
        {reportMutation.isError && reportMutation.error instanceof Error ? <ErrorBlock message={reportMutation.error.message} /> : null}
        {reportMutation.isSuccess ? <InlineNotice tone="success">举报已提交，后续可以在资料页查看安全记录。</InlineNotice> : null}

        <ChatMessageList
          messages={renderedMessages}
          groupMode={conversationType === "group"}
          emptyState={
            !messagesQuery.isLoading && !messagesQuery.isError ? (
              <EmptyState title="还没有消息" description="你先开口，这段对话才会真正开始。" />
            ) : null
          }
        />

        {typingCharacterId ? (
          <div className="flex items-center gap-3 pt-1">
            <AvatarChip name={typingCharacterId} size="sm" />
            <div className="rounded-full border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.04))] px-4 py-2 text-xs text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]">
              对方正在输入...
            </div>
          </div>
        ) : null}

      </div>

      <ChatComposer
        value={text}
        placeholder="发消息"
        pending={sendMutation.isPending}
        error={sendMutation.error instanceof Error ? sendMutation.error.message : null}
        onChange={(value) => {
          if (socketError) {
            setSocketError(null);
          }
          setText(value);
        }}
        onSubmit={() => void sendMutation.mutateAsync()}
      />
    </div>
  );
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
