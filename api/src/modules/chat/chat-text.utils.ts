const CHAT_REPLY_PREFIX_PATTERN = /^\[\[chat_reply:([^\]]+)\]\]\n?/;
const MENTION_TOKEN_PATTERN = /@[\p{L}\p{N}_-]{1,40}/gu;
const MENTION_BOUNDARY_PATTERN = /[\s([{'"“‘，。！？、：；,.!?/\\-]/u;

export type ChatReplyMetadata = {
  messageId: string;
  senderName: string;
  previewText: string;
  quotedText?: string;
};

export type ChatMentionSummary = {
  hasMentionAll: boolean;
  mentions: string[];
};

export function extractChatReplyMetadata(text: string): {
  reply?: ChatReplyMetadata;
  body: string;
} {
  const match = text.match(CHAT_REPLY_PREFIX_PATTERN);
  if (!match) {
    return { body: text };
  }

  const payload = match[1];
  const body = text.slice(match[0].length);
  try {
    const parsed = JSON.parse(
      decodeURIComponent(payload),
    ) as Partial<ChatReplyMetadata>;
    if (
      typeof parsed.messageId !== 'string' ||
      typeof parsed.senderName !== 'string' ||
      typeof parsed.previewText !== 'string'
    ) {
      return { body: text };
    }

    return {
      reply: {
        messageId: parsed.messageId,
        senderName: parsed.senderName,
        previewText: parsed.previewText,
        quotedText:
          typeof parsed.quotedText === 'string' ? parsed.quotedText : undefined,
      },
      body,
    };
  } catch {
    return { body: text };
  }
}

export function stripChatReplyPrefix(text: string) {
  return text.replace(CHAT_REPLY_PREFIX_PATTERN, '');
}

export function summarizeChatMentions(text: string): ChatMentionSummary {
  const mentions: string[] = [];
  let lastIndex = -1;

  for (const match of text.matchAll(MENTION_TOKEN_PATTERN)) {
    const rawIndex = match.index ?? -1;
    const token = match[0];
    if (rawIndex < 0 || !token) {
      continue;
    }

    const beforeCharacter = rawIndex > 0 ? text[rawIndex - 1] : undefined;
    if (beforeCharacter && !MENTION_BOUNDARY_PATTERN.test(beforeCharacter)) {
      continue;
    }

    if (rawIndex === lastIndex) {
      continue;
    }

    mentions.push(token);
    lastIndex = rawIndex;
  }

  return {
    hasMentionAll: mentions.includes('@所有人'),
    mentions,
  };
}
