export const CHAT_NAMESPACE = "/chat";

export const CHAT_EVENTS = {
  joinConversation: "join_conversation",
  sendMessage: "send_message",
  newMessage: "new_message",
  typingStart: "typing_start",
  typingStop: "typing_stop",
  conversationUpdated: "conversation_updated",
} as const;

export type ChatEventName = (typeof CHAT_EVENTS)[keyof typeof CHAT_EVENTS];

export interface JoinConversationPayload {
  conversationId: string;
}

export interface SendMessagePayload {
  conversationId: string;
  characterId: string;
  text: string;
  userId?: string;
}

export interface TypingPayload {
  characterId: string;
}

export interface ConversationUpdatedPayload {
  id: string;
  type: "direct" | "group";
  title: string;
  participants: string[];
}
