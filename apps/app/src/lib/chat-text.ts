const thoughtBlockPattern = /<thought\b[^>]*>[\s\S]*?<\/thought>/gi;
const internalReasoningBlockPattern =
  /<internal_reasoning\b[^>]*>[\s\S]*?<\/internal_reasoning>/gi;
const thoughtTagPattern = /<\/?thought\b[^>]*>/gi;
const internalReasoningTagPattern = /<\/?internal_reasoning\b[^>]*>/gi;
const internalSpeakerPrefixPattern = /^\[[^\]\n]{1,120}\]:\s*/gm;
const chatReplyPrefixPattern = /^\[\[chat_reply:([^\]]+)\]\]\n?/;
const mentionTokenPattern = /@[\p{L}\p{N}_-]{1,40}/gu;
const mentionTokenCharacterPattern = /[\p{L}\p{N}_-]/u;
const mentionBoundaryPattern = /[\s([{'"“‘，。！？、：；,.!?/\\-]/u;
const blockedMentionPrefixPattern = /[A-Za-z0-9._%+-]/u;

export type ChatReplyMetadata = {
  messageId: string;
  senderName: string;
  previewText: string;
  quotedText?: string;
};

export type ChatTextSegment =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "mention";
      text: string;
      tone: "member" | "all";
    };

export type ChatMentionSummary = {
  hasMentionAll: boolean;
  mentions: string[];
};

export function isChatMentionTokenCharacter(value?: string | null) {
  return Boolean(value && mentionTokenCharacterPattern.test(value));
}

export function isChatMentionPrefixBoundary(value?: string | null) {
  if (!value) {
    return true;
  }

  if (mentionBoundaryPattern.test(value)) {
    return true;
  }

  return !blockedMentionPrefixPattern.test(value);
}

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
        quotedText:
          typeof parsed.quotedText === "string" ? parsed.quotedText : undefined,
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

export function splitChatTextSegments(text: string): ChatTextSegment[] {
  const sanitized = sanitizeDisplayedChatText(text);
  if (!sanitized) {
    return [];
  }

  const segments: ChatTextSegment[] = [];
  let lastIndex = 0;

  for (const match of sanitized.matchAll(mentionTokenPattern)) {
    const rawIndex = match.index ?? -1;
    const token = match[0];
    if (rawIndex < 0 || !token) {
      continue;
    }

    const beforeCharacter = rawIndex > 0 ? sanitized[rawIndex - 1] : undefined;
    if (!isChatMentionPrefixBoundary(beforeCharacter)) {
      continue;
    }

    if (rawIndex > lastIndex) {
      segments.push({
        kind: "text",
        text: sanitized.slice(lastIndex, rawIndex),
      });
    }

    segments.push({
      kind: "mention",
      text: token,
      tone: token === "@所有人" ? "all" : "member",
    });
    lastIndex = rawIndex + token.length;
  }

  if (lastIndex < sanitized.length) {
    segments.push({
      kind: "text",
      text: sanitized.slice(lastIndex),
    });
  }

  return segments.length
    ? segments
    : [
        {
          kind: "text",
          text: sanitized,
        },
      ];
}

export function summarizeChatMentions(text: string): ChatMentionSummary {
  const segments = splitChatTextSegments(text);
  const mentions = segments
    .filter(
      (segment): segment is Extract<ChatTextSegment, { kind: "mention" }> =>
        segment.kind === "mention",
    )
    .map((segment) => segment.text);

  return {
    hasMentionAll: mentions.includes("@所有人"),
    mentions,
  };
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
