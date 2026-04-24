import { msg } from "@lingui/macro";
import type { ConversationType } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";

export type ConversationThreadRef = {
  id?: string;
  type: ConversationType;
  source?: "conversation" | "group";
};

export function isPersistedGroupConversation(input: ConversationThreadRef) {
  if (input.source) {
    return input.source === "group";
  }

  return input.type === "group";
}

export function getConversationThreadType(
  input: ConversationThreadRef,
): ConversationType {
  return isPersistedGroupConversation(input) ? "group" : "direct";
}

export function getConversationThreadLabel(input: ConversationThreadRef) {
  return isPersistedGroupConversation(input)
    ? translateRuntimeMessage(msg`群聊`)
    : translateRuntimeMessage(msg`单聊`);
}

export function getConversationThreadPath(
  input: ConversationThreadRef & { id: string },
) {
  return isPersistedGroupConversation(input)
    ? `/group/${input.id}`
    : `/chat/${input.id}`;
}
