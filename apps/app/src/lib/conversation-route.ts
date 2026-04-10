import type { ConversationType } from "@yinjie/contracts";

const DIRECT_CONVERSATION_PREFIX = "direct_";

export function isPersistedGroupConversation(input: {
  id: string;
  type: ConversationType;
}) {
  return input.type === "group" && !input.id.startsWith(DIRECT_CONVERSATION_PREFIX);
}
