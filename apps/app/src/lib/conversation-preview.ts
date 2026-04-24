import type { ConversationListItem } from "@yinjie/contracts";
import type { LocalChatMessageActionState } from "../features/chat/local-chat-message-actions";
import { shouldHideSearchableChatMessage } from "../features/chat/local-chat-message-actions";
import {
  getConversationThreadLabel,
  isPersistedGroupConversation,
} from "./conversation-route";
import { resolveMessageSemanticPreview } from "./message-attachment-semantic";

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
  return {
    prefix,
    text:
      resolveMessageSemanticPreview(lastMessage, {
        maxChars: 80,
        bracketedFallback: true,
      }) || getConversationOpenFallback(conversation),
  };
}

export function getConversationOpenFallback(
  conversation: Pick<ConversationListItem, "id" | "type" | "source">,
) {
  return isPersistedGroupConversation(conversation)
    ? "打开群聊查看最近消息。"
    : `打开这个${getConversationThreadLabel(conversation)}查看最近聊天记录。`;
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
