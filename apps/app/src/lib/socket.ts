import { io, type Socket } from "socket.io-client";
import {
  CHAT_EVENTS,
  CHAT_NAMESPACE,
  type ChatErrorPayload,
  type ConversationUpdatedPayload,
  type JoinConversationPayload,
  type RealtimeChatMessage,
  type SendMessagePayload,
  type TypingPayload,
} from "@yinjie/contracts";
import { resolveAppSocketBaseUrl } from "./runtime-config";
import { APP_RUNTIME_SOCKET_CONFIG_CHANGE_EVENT } from "../runtime/runtime-config-events";

let socket: Socket | null = null;
let activeSocketBaseUrl: string | null = null;
let runtimeConfigListenerAttached = false;

function socketBaseUrl() {
  return resolveAppSocketBaseUrl();
}

function ensureRuntimeConfigListener() {
  if (runtimeConfigListenerAttached || typeof window === "undefined") {
    return;
  }

  window.addEventListener(
    APP_RUNTIME_SOCKET_CONFIG_CHANGE_EVENT,
    disconnectChatSocket,
  );
  runtimeConfigListenerAttached = true;
}

export function getChatSocket() {
  const nextSocketBaseUrl = socketBaseUrl();
  ensureRuntimeConfigListener();

  if (socket && activeSocketBaseUrl === nextSocketBaseUrl) {
    return socket;
  }

  disconnectChatSocket();
  activeSocketBaseUrl = nextSocketBaseUrl;
  socket = io(`${nextSocketBaseUrl}${CHAT_NAMESPACE}`, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  return socket;
}

export function disconnectChatSocket() {
  if (!socket) {
    activeSocketBaseUrl = null;
    return;
  }

  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  activeSocketBaseUrl = null;
}

export function joinConversationRoom(payload: JoinConversationPayload) {
  getChatSocket().emit(CHAT_EVENTS.joinConversation, payload);
}

export function emitChatMessage(payload: SendMessagePayload) {
  getChatSocket().emit(CHAT_EVENTS.sendMessage, payload);
}

export function onChatMessage(handler: (payload: RealtimeChatMessage) => void) {
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

export function onChatError(handler: (message: string) => void) {
  const active = getChatSocket();
  const listener = (payload: ChatErrorPayload | string) => {
    if (typeof payload === "string") {
      handler(payload);
      return;
    }

    handler(payload.message);
  };

  active.on(CHAT_EVENTS.error, listener);
  return () => active.off(CHAT_EVENTS.error, listener);
}
