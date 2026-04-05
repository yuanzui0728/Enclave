import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
import { getConversationMessages, getConversations, markConversationRead, type Message } from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { ChatComposer } from "../components/chat-composer";
import { ChatMessageList } from "../components/chat-message-list";
import { EmptyState } from "../components/empty-state";
import {
  emitChatMessage,
  joinConversationRoom,
  onChatMessage,
  onConversationUpdated,
  onTypingStart,
  onTypingStop,
} from "../lib/socket";
import { formatTimestamp } from "../lib/format";
import { useSessionStore } from "../store/session-store";

export function ChatRoomPage() {
  const { conversationId } = useParams({ from: "/chat/$conversationId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);
  const username = useSessionStore((state) => state.username);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingCharacterId, setTypingCharacterId] = useState<string | null>(null);
  const [conversationType, setConversationType] = useState<"direct" | "group">("direct");
  const [conversationTitle, setConversationTitle] = useState("对话");
  const [participants, setParticipants] = useState<string[]>([]);

  const messagesQuery = useQuery({
    queryKey: ["app-conversation-messages", conversationId],
    queryFn: () => getConversationMessages(conversationId),
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", userId],
    queryFn: () => getConversations(userId!),
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

    setConversationType(conversation.type);
    setConversationTitle(conversation.title);
    setParticipants(conversation.participants);
  }, [conversationId, conversationsQuery.data]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    joinConversationRoom({ conversationId });
    void markConversationRead(conversationId);

    const offMessage = onChatMessage((payload) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

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
      void queryClient.invalidateQueries({ queryKey: ["app-conversations", userId] });
    });

    const offTypingStart = onTypingStart((payload) => {
      if (payload.conversationId !== conversationId) {
        return;
      }
      setTypingCharacterId(payload.characterId);
    });
    const offTypingStop = onTypingStop((payload) => {
      if (payload.conversationId !== conversationId) {
        return;
      }
      setTypingCharacterId(null);
    });
    const offConversationUpdated = onConversationUpdated((payload) => {
      if (payload.id !== conversationId) {
        return;
      }

      setConversationType(payload.type);
      setConversationTitle(payload.title);
      setParticipants(payload.participants);
      void queryClient.invalidateQueries({ queryKey: ["app-conversations", userId] });
    });

    return () => {
      offMessage();
      offTypingStart();
      offTypingStop();
      offConversationUpdated();
    };
  }, [conversationId, queryClient, userId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const trimmed = text.trim();
      if (!trimmed || !userId) {
        return;
      }

      const targetCharacterId =
        messagesQuery.data?.find((item) => item.senderType === "character")?.senderId ??
        participants[0] ??
        "";

      emitChatMessage({
        conversationId,
        characterId: targetCharacterId,
        text: trimmed,
        userId,
      });

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

  const renderedMessages = useMemo(() => {
    const deduped = new Map<string, Message>();
    for (const item of messages) {
      deduped.set(item.id, item);
    }
    return [...deduped.values()].sort((left, right) => Number(left.createdAt) - Number(right.createdAt));
  }, [messages]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 border-b border-[color:var(--border-subtle)] bg-[rgba(7,12,20,0.45)] px-4 py-4">
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
      </header>

      <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
        {messagesQuery.isLoading ? <LoadingBlock label="正在读取对话..." /> : null}

        {messagesQuery.isError && messagesQuery.error instanceof Error ? <ErrorBlock message={messagesQuery.error.message} /> : null}

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
          <div className="flex items-center gap-3">
            <AvatarChip name={typingCharacterId} size="sm" />
            <div className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-xs text-[color:var(--text-secondary)]">
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
        onChange={setText}
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
