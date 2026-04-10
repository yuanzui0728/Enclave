const thoughtBlockPattern = /<thought\b[^>]*>[\s\S]*?<\/thought>/gi;
const internalReasoningBlockPattern =
  /<internal_reasoning\b[^>]*>[\s\S]*?<\/internal_reasoning>/gi;
const thoughtTagPattern = /<\/?thought\b[^>]*>/gi;
const internalReasoningTagPattern = /<\/?internal_reasoning\b[^>]*>/gi;
const internalSpeakerPrefixPattern = /^\[[^\]\n]{1,120}\]:\s*/gm;
const chatReplyPrefixPattern = /^\[\[chat_reply:([^\]]+)\]\]\n?/;

export type ChatReplyMetadata = {
  messageId: string;
  senderName: string;
  previewText: string;
};

export function sanitizeDisplayedChatText(text: string): string {
  const { body } = extractChatReplyMetadata(text);
  return sanitizeAssistantText(body);
}

export function extractChatReplyMetadata(text: string): {
  reply?: ChatReplyMetadata;
  body: string;
} {
  const match = text.match(chatReplyPrefixPattern);
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
      typeof parsed.messageId !== "string" ||
      typeof parsed.senderName !== "string" ||
      typeof parsed.previewText !== "string"
    ) {
      return { body: text };
    }

    return {
      reply: {
        messageId: parsed.messageId,
        senderName: parsed.senderName,
        previewText: parsed.previewText,
      },
      body,
    };
  } catch {
    return { body: text };
  }
}

export function encodeChatReplyText(
  body: string,
  reply: ChatReplyMetadata,
): string {
  const payload = encodeURIComponent(JSON.stringify(reply));
  const trimmedBody = body.trim();
  return `[[chat_reply:${payload}]]${trimmedBody ? `\n${trimmedBody}` : ""}`;
}

function sanitizeAssistantText(text: string): string {
  return text
    .replace(internalReasoningBlockPattern, "")
    .replace(thoughtBlockPattern, "")
    .replace(internalReasoningTagPattern, "")
    .replace(thoughtTagPattern, "")
    .replace(internalSpeakerPrefixPattern, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
