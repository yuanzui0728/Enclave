import type {
  ContactCardAttachment,
  FileAttachment,
  ImageAttachment,
  LocationCardAttachment,
} from "./attachments";

export const CHAT_NAMESPACE = "/chat";

export const CHAT_EVENTS = {
  joinConversation: "join_conversation",
  sendMessage: "send_message",
  newMessage: "new_message",
  typingStart: "typing_start",
  typingStop: "typing_stop",
  conversationUpdated: "conversation_updated",
  error: "error",
} as const;

export type ChatEventName = (typeof CHAT_EVENTS)[keyof typeof CHAT_EVENTS];

export interface JoinConversationPayload {
  conversationId: string;
}

export type SendMessagePayload =
  | {
      conversationId: string;
      characterId: string;
      type?: "text";
      text: string;
    }
  | {
      conversationId: string;
      characterId: string;
      type: "sticker";
      text?: string;
      sticker: {
        packId: string;
        stickerId: string;
      };
    }
  | {
      conversationId: string;
      characterId: string;
      type: "image";
      text?: string;
      attachment: ImageAttachment;
    }
  | {
      conversationId: string;
      characterId: string;
      type: "file";
      text?: string;
      attachment: FileAttachment;
    }
  | {
      conversationId: string;
      characterId: string;
      type: "contact_card";
      text?: string;
      attachment: ContactCardAttachment;
    }
  | {
      conversationId: string;
      characterId: string;
      type: "location_card";
      text?: string;
      attachment: LocationCardAttachment;
    };

export interface TypingPayload {
  conversationId: string;
  characterId: string;
}

export interface ConversationUpdatedPayload {
  id: string;
  type: "direct" | "group";
  title: string;
  participants: string[];
}

export interface ChatErrorPayload {
  message: string;
}
