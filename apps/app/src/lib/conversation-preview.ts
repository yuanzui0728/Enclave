import type { ConversationListItem } from "@yinjie/contracts";
import type { LocalChatMessageActionState } from "../features/chat/local-chat-message-actions";
import { shouldHideSearchableChatMessage } from "../features/chat/local-chat-message-actions";
import { sanitizeDisplayedChatText } from "./chat-text";
import { isPersistedGroupConversation } from "./conversation-route";

type ConversationPreviewOptions = {
  emptyText?: string;
};

export function getConversationVisibleLastMessage(
  conversation: ConversationListItem,
  localMessageActionState: LocalChatMessageActionState,
) {
  const lastMessage = conversation.lastMessage;
  if (!lastMessage) {
    return null;
  }

  return shouldHideSearchableChatMessage(
    lastMessage.id,
    localMessageActionState,
  )
    ? null
    : lastMessage;
}

export function getConversationPreviewParts(
  conversation: ConversationListItem,
  localMessageActionState: LocalChatMessageActionState,
  options?: ConversationPreviewOptions,
) {
  const lastMessage = getConversationVisibleLastMessage(
    conversation,
    localMessageActionState,
  );

  if (!lastMessage) {
    if (
      conversation.lastMessage &&
      localMessageActionState.recalledMessageIds.includes(
        conversation.lastMessage.id,
      )
    ) {
      return {
        prefix: "",
        text: getConversationRecalledPreviewText(
          conversation,
          conversation.lastMessage,
        ),
      };
    }

    return {
      prefix: "",
      text: conversation.lastMessage
        ? getConversationOpenFallback(conversation)
        : (options?.emptyText ?? getConversationOpenFallback(conversation)),
    };
  }

  const prefix =
    isPersistedGroupConversation(conversation) &&
    lastMessage.senderType !== "system"
      ? `${lastMessage.senderType === "user" ? "我" : lastMessage.senderName || "群成员"}：`
      : "";

  if (lastMessage.type === "image") {
    return { prefix, text: "[图片]" };
  }

  if (lastMessage.type === "file") {
    return { prefix, text: "[文件]" };
  }

  if (lastMessage.type === "voice") {
    return { prefix, text: "[语音]" };
  }

  if (lastMessage.type === "contact_card") {
    return { prefix, text: "[名片]" };
  }

  if (lastMessage.type === "location_card") {
    return { prefix, text: "[位置]" };
  }

  if (lastMessage.type === "sticker") {
    return {
      prefix,
      text:
        lastMessage.attachment?.kind === "sticker" &&
        lastMessage.attachment.label
          ? `[表情] ${lastMessage.attachment.label}`
          : "[表情]",
    };
  }

  const sanitizedText = sanitizeDisplayedChatText(lastMessage.text);
  return {
    prefix,
    text: sanitizedText || getConversationOpenFallback(conversation),
  };
}

export function getConversationOpenFallback(
  conversation: Pick<ConversationListItem, "id" | "type">,
) {
  return isPersistedGroupConversation(conversation)
    ? "打开群聊查看最近消息。"
    : "打开这个会话查看最近聊天记录。";
}

function getConversationRecalledPreviewText(
  conversation: ConversationListItem,
  lastMessage: NonNullable<ConversationListItem["lastMessage"]>,
) {
  if (lastMessage.senderType === "user") {
    return "你撤回了一条消息";
  }

  if (isPersistedGroupConversation(conversation)) {
    return `${lastMessage.senderName || "群成员"}撤回了一条消息`;
  }

  return "对方撤回了一条消息";
}
