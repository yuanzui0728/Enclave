type ConversationLike = {
  id?: string | null;
  type?: string | null;
};

const NON_USER_FACING_DIRECT_CONVERSATION_ID_PREFIXES = ['probe_'] as const;

export function isNonUserFacingDirectConversationId(
  conversationId?: string | null,
) {
  const normalizedConversationId = conversationId?.trim().toLowerCase();
  if (!normalizedConversationId) {
    return false;
  }

  return NON_USER_FACING_DIRECT_CONVERSATION_ID_PREFIXES.some((prefix) =>
    normalizedConversationId.startsWith(prefix),
  );
}

export function isUserFacingConversation(
  conversation?: ConversationLike | null,
) {
  if (!conversation) {
    return false;
  }

  if (conversation.type === 'group') {
    return true;
  }

  return !isNonUserFacingDirectConversationId(conversation.id);
}

export function filterUserFacingConversations<T extends ConversationLike>(
  conversations: readonly T[],
) {
  return conversations.filter((conversation) =>
    isUserFacingConversation(conversation),
  );
}
