import { getBuiltinStickerByLabel } from "@yinjie/contracts";

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
    }
  | {
      kind: "sticker";
      text: string;
      label: string;
      src: string;
      packId: string;
      stickerId: string;
      width: number;
      height: number;
    };

const builtinStickerTokenPattern = /\[([^\[\]\n]{1,40})\]/g;

function expandBuiltinStickerSegments(
  source: ChatTextSegment,
): ChatTextSegment[] {
  if (source.kind !== "text") {
    return [source];
  }

  const text = source.text;
  if (!text || text.indexOf("[") < 0) {
    return [source];
  }

  const out: ChatTextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(builtinStickerTokenPattern)) {
    const start = match.index ?? -1;
    if (start < 0) {
      continue;
    }
    const label = match[1];
    const sticker = label ? getBuiltinStickerByLabel(label) : null;
    if (!sticker) {
      continue;
    }

    if (start > cursor) {
      out.push({ kind: "text", text: text.slice(cursor, start) });
    }
    out.push({
      kind: "sticker",
      text: match[0],
      label: sticker.label,
      src: sticker.src,
      packId: sticker.packId,
      stickerId: sticker.stickerId,
      width: sticker.width,
      height: sticker.height,
    });
    cursor = start + match[0].length;
  }

  if (cursor === 0) {
    return [source];
  }
  if (cursor < text.length) {
    out.push({ kind: "text", text: text.slice(cursor) });
  }
  return out;
}

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

// 服务端 recall 把消息 senderType/type 改成 'system' 并塞硬编码中文 text
// "你撤回了一条消息"。en/ja/ko locale 用户从 cache（refresh / 重新进会话）/
// socket echo 拿到的撤回提示会原样显示中文。客户端需要识别这串 marker text
// 然后用 i18n 翻译版本去渲染。chat.service.ts:506 + group.service.ts:579 是
// 数据源；老库已有数据全是中文文本，不能光改服务端，必须在客户端识别。
//
// 这是 owner 自己撤回 → 翻译要走"你"actor 分支（buildRecalledMessageNotice
// 里 senderType === "user" 这条），因为服务端 recall 在 chat-only-own
// guard 后才允许写入，能落到这条 marker 上的一定是 owner 自己撤回的。
export const SERVER_RECALL_MARKER_TEXT = "你撤回了一条消息";

export function isServerRecalledSystemMessage(message: {
  senderType?: string | null;
  type?: string | null;
  text: string;
}): boolean {
  if (!message) {
    return false;
  }
  if (message.senderType !== "system" && message.type !== "system") {
    return false;
  }
  return message.text === SERVER_RECALL_MARKER_TEXT;
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
      // i18n-ignore-next-line: mention token identifier used for matching, not UI label
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

  const baseSegments: ChatTextSegment[] = segments.length
    ? segments
    : [
        {
          kind: "text",
          text: sanitized,
        },
      ];

  return baseSegments.flatMap(expandBuiltinStickerSegments);
}

export function summarizeChatMentions(text: string): ChatMentionSummary {
  // 走查电脑端群聊 R5：DesktopConversationRow 渲染每条群会话时都会 inline 调
  // summarizeChatMentions(visibleLastMessage?.text)，splitChatTextSegments 内
  // 先跑 sanitizeDisplayedChatText（chatReply regex + 5 路 sanitizeAssistantText
  // replace）+ matchAll(mentionTokenPattern) + flatMap(expandBuiltinStickerSegments)
  // 全过一遍——长会话列表 60+ 条里 group 占比再加 typing socket / unread tick /
  // local action store 触发的整列重渲（聊天列表非 memo 子组件，父 workspace
  // 任何 state 变都连带渲染所有 row），绝大多数普通消息（没 @）跑了一遍只
  // 为得到 mentions=[]。@ 不在文本里就早退，跳过所有 O(n) 字符串清洗。
  if (!text.includes("@")) {
    return {
      hasMentionAll: false,
      mentions: [],
    };
  }
  const segments = splitChatTextSegments(text);
  const mentions = segments
    .filter(
      (segment): segment is Extract<ChatTextSegment, { kind: "mention" }> =>
        segment.kind === "mention",
    )
    .map((segment) => segment.text);

  return {
    // i18n-ignore-next-line: mention token identifier, not UI label
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
