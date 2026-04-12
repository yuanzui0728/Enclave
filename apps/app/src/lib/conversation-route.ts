import type { ConversationType } from "@yinjie/contracts";

export function isPersistedGroupConversation(input: {
  id?: string;
  type: ConversationType;
  source?: "conversation" | "group";
}) {
  if (input.source) {
    return input.source === "group";
  }

  return input.type === "group";
}
