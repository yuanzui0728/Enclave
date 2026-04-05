import { io, type Socket } from "socket.io-client";
import {
  CHAT_EVENTS,
  CHAT_NAMESPACE,
  DEFAULT_CORE_API_BASE_URL,
  type ConversationUpdatedPayload,
  type JoinConversationPayload,
  type Message,
  type SendMessagePayload,
  type TypingPayload,
} from "@yinjie/contracts";

let socket: Socket | null = null;

function socketBaseUrl() {
  return import.meta.env.VITE_CORE_API_BASE_URL || DEFAULT_CORE_API_BASE_URL;
}

export function getChatSocket() {
  if (socket) {
    return socket;
  }

  socket = io(`${socketBaseUrl()}${CHAT_NAMESPACE}`, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  return socket;
}

export function joinConversationRoom(payload: JoinConversationPayload) {
  getChatSocket().emit(CHAT_EVENTS.joinConversation, payload);
}

export function emitChatMessage(payload: SendMessagePayload) {
  getChatSocket().emit(CHAT_EVENTS.sendMessage, payload);
}

export function onChatMessage(handler: (payload: Message) => void) {
  const active = getChatSocket();
  active.on(CHAT_EVENTS.newMessage, handler);
  return () => active.off(CHAT_EVENTS.newMessage, handler);
}

export function onTypingStart(handler: (payload: TypingPayload) => void) {
  const active = getChatSocket();
  active.on(CHAT_EVENTS.typingStart, handler);
  return () => active.off(CHAT_EVENTS.typingStart, handler);
}

export function onTypingStop(handler: (payload: TypingPayload) => void) {
  const active = getChatSocket();
  active.on(CHAT_EVENTS.typingStop, handler);
  return () => active.off(CHAT_EVENTS.typingStop, handler);
}

export function onConversationUpdated(handler: (payload: ConversationUpdatedPayload) => void) {
  const active = getChatSocket();
  active.on(CHAT_EVENTS.conversationUpdated, handler);
  return () => active.off(CHAT_EVENTS.conversationUpdated, handler);
}
