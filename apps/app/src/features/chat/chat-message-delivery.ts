import type {
  GroupMessage,
  Message,
  MessageAttachment,
  SendGroupMessageRequest,
  SendMessagePayload,
} from "@yinjie/contracts";
import { sanitizeDisplayedChatText } from "../../lib/chat-text";
import { parseTimestamp } from "../../lib/format";

export type ChatLocalMessageStatus = "sending" | "failed";

type ChatLocalMessageState = {
  localStatus?: ChatLocalMessageStatus;
};

type ThreadMessageLike = {
  id: string;
  senderType: string;
  senderId?: string | null;
  text: string;
  type: string;
  attachment?: MessageAttachment;
  createdAt: string;
};

export type DirectThreadMessage = Message & ChatLocalMessageState;
export type GroupThreadMessage = GroupMessage & ChatLocalMessageState;

// 走查 Round 3：原版 `local_${Date.now()}` 在同一毫秒内会撞 id；
// mergeThreadMessageWindow / sortThreadMessages 用 Map<id, msg> 去重 → 同一
// ms 内发出的两条本地消息只剩一条，UI 上"消息凭空消失"。粘贴/双击 send /
// 连发表情都会复现。createdAt 维持 Date.now() 与时间戳排序一致，id 用
// createdAt + 随机后缀避免碰撞。
let optimisticLocalCounter = 0;
function nextLocalMessageId(createdAt: string): string {
  optimisticLocalCounter = (optimisticLocalCounter + 1) % 100000;
  const suffix = Math.random().toString(36).slice(2, 8);
  return `local_${createdAt}_${optimisticLocalCounter}_${suffix}`;
}

export function buildOptimisticDirectMessage(input: {
  payload: SendMessagePayload;
  ownerId: string;
  senderName: string;
}): DirectThreadMessage {
  const { ownerId, payload, senderName } = input;
  const createdAt = String(Date.now());
  const localId = nextLocalMessageId(createdAt);

  if (payload.type === "sticker") {
    const stickerLabel = sanitizeDisplayedChatText(payload.text ?? "").replace(
      // i18n-ignore-next-line: protocol marker stripped from text field
      /^\[表情包\]\s*/,
      "",
    );
    const optimisticAttachment = payload.attachment;

    return {
      id: localId,
      conversationId: payload.conversationId,
      senderType: "user",
      senderId: ownerId,
      senderName,
      type: "sticker",
      // i18n-ignore-next-line: protocol marker for sticker text payload
      text: payload.text ?? "[表情包]",
      attachment: optimisticAttachment
        ? {
            ...optimisticAttachment,
            label:
              stickerLabel || optimisticAttachment.label || payload.sticker.stickerId,
          }
        : {
            kind: "sticker",
            sourceType: payload.sticker.sourceType ?? "builtin",
            packId: payload.sticker.packId,
            stickerId: payload.sticker.stickerId,
            url:
              payload.sticker.packId
                ? `/stickers/${payload.sticker.packId}/${payload.sticker.stickerId}.svg`
                : "",
            width: 160,
            height: 160,
            label: stickerLabel || payload.sticker.stickerId,
          },
      createdAt,
      localStatus: "sending",
    };
  }

  if (
    payload.type === "image" ||
    payload.type === "file" ||
    payload.type === "voice" ||
    payload.type === "contact_card" ||
    payload.type === "location_card" ||
    payload.type === "note_card"
  ) {
    return {
      id: localId,
      conversationId: payload.conversationId,
      senderType: "user",
      senderId: ownerId,
      senderName,
      type: payload.type,
      text:
        payload.text ??
        buildImplicitAttachmentText(payload.type, payload.attachment),
      attachment: payload.attachment,
      createdAt,
      localStatus: "sending",
    };
  }

  return {
    id: localId,
    conversationId: payload.conversationId,
    senderType: "user",
    senderId: ownerId,
    senderName,
    type: "text",
    text: payload.text,
    createdAt,
    localStatus: "sending",
  };
}

export function buildOptimisticGroupMessage(input: {
  payload: SendGroupMessageRequest;
  groupId: string;
  ownerId?: string | null;
  senderName: string;
  senderAvatar?: string | null;
}): GroupThreadMessage {
  const { groupId, ownerId, payload, senderAvatar, senderName } = input;
  const createdAt = String(Date.now());
  const localId = nextLocalMessageId(createdAt);
  const messageType = payload.type ?? "text";

  return {
    id: localId,
    groupId,
    senderId: ownerId?.trim() || "world-owner",
    senderType: payload.senderType ?? "user",
    senderName,
    senderAvatar: senderAvatar ?? undefined,
    text:
      payload.text ??
      ("attachment" in payload && payload.attachment
        ? buildImplicitAttachmentText(messageType, payload.attachment)
        : ""),
    type: messageType,
    attachment: "attachment" in payload ? payload.attachment : undefined,
    createdAt,
    localStatus: "sending",
  };
}

export function mergeDirectMessageWindow(
  current: DirectThreadMessage[],
  incoming: Message[],
) {
  return mergeThreadMessageWindow(current, incoming);
}

export function mergeGroupMessageWindow(
  current: GroupThreadMessage[],
  incoming: GroupMessage[],
) {
  return mergeThreadMessageWindow(current, incoming);
}

export function upsertIncomingDirectMessage(
  current: DirectThreadMessage[] | undefined,
  incoming: Message,
) {
  return upsertIncomingThreadMessage(current, incoming);
}

export function upsertIncomingGroupMessage(
  current: GroupThreadMessage[] | undefined,
  incoming: GroupMessage,
) {
  return upsertIncomingThreadMessage(current, incoming);
}

// 写入 react-query messages cache 用：cache 里只放 server 消息，没有 local_* 乐观
// 消息，所以不需要 echo 匹配。仅做"同 id 替换 / 否则追加 + 按 createdAt 排序"。
export function upsertServerMessageInCache<
  TMessage extends ThreadMessageLike,
>(cache: TMessage[] | undefined, incoming: TMessage): TMessage[] | undefined {
  if (!cache) return cache;
  const idx = cache.findIndex((m) => m.id === incoming.id);
  if (idx >= 0) {
    const next = [...cache];
    next[idx] = incoming;
    return next;
  }
  // 走查 R1：和姊妹函数 sortThreadMessages 同款 Schwartzian transform——原版
  // comparator 每次都 parseTimestamp(a.createdAt) + parseTimestamp(b.createdAt)，
  // N=200 条 cache + 1 incoming 的 sort 约 1500 次比较 × 2 parseTimestamp ≈ 3000
  // 次 Date.parse。socket 单条 echo 是 hot path，活跃群每秒可能多次走这里。
  // 先一次性 decorate 出 [ts, msg]，sort 只比 number，每条消息恰好 1 次 parseTimestamp。
  return decorateAndSortByTimestamp([...cache, incoming]);
}

function decorateAndSortByTimestamp<TMessage extends ThreadMessageLike>(
  messages: TMessage[],
) {
  const decorated: Array<[number, TMessage]> = new Array(messages.length);
  for (let i = 0; i < messages.length; i += 1) {
    decorated[i] = [parseTimestamp(messages[i]!.createdAt) ?? 0, messages[i]!];
  }
  decorated.sort((left, right) => left[0] - right[0]);
  const sorted = new Array<TMessage>(decorated.length);
  for (let i = 0; i < decorated.length; i += 1) {
    sorted[i] = decorated[i]![1];
  }
  return sorted;
}

export function markThreadMessagesFailed<
  TMessage extends ThreadMessageLike & ChatLocalMessageState,
>(current: TMessage[], messageIds?: string[]) {
  const failedMessageIdSet =
    messageIds && messageIds.length ? new Set(messageIds) : null;

  return current.map((message) =>
    isLocalThreadMessage(message) &&
    (!failedMessageIdSet || failedMessageIdSet.has(message.id)) &&
    message.localStatus !== "failed"
      ? {
          ...message,
          localStatus: "failed" as const,
        }
      : message,
  );
}

export function markThreadMessageSending<
  TMessage extends ThreadMessageLike & ChatLocalMessageState,
>(current: TMessage[], messageId: string) {
  return current.map((message) =>
    message.id === messageId
      ? {
          ...message,
          localStatus: "sending" as const,
        }
      : message,
  );
}

export function replaceDirectLocalMessage(
  current: DirectThreadMessage[],
  localId: string,
  incoming: Message,
) {
  return replaceLocalThreadMessage(current, localId, incoming);
}

export function replaceGroupLocalMessage(
  current: GroupThreadMessage[],
  localId: string,
  incoming: GroupMessage,
) {
  return replaceLocalThreadMessage(current, localId, incoming);
}

export function buildDirectRetryPayload(input: {
  message: DirectThreadMessage;
  characterId: string;
}): SendMessagePayload | null {
  const { characterId, message } = input;
  if (!characterId.trim()) {
    return null;
  }

  if (message.type === "sticker" && message.attachment?.kind === "sticker") {
    return {
      conversationId: message.conversationId,
      characterId,
      type: "sticker",
      text: message.text.trim() || undefined,
      sticker: {
        sourceType: message.attachment.sourceType,
        packId: message.attachment.packId,
        stickerId: message.attachment.stickerId,
      },
      attachment: message.attachment,
    };
  }

  if (message.type === "image" && message.attachment?.kind === "image") {
    return {
      conversationId: message.conversationId,
      characterId,
      type: "image",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (message.type === "file" && message.attachment?.kind === "file") {
    return {
      conversationId: message.conversationId,
      characterId,
      type: "file",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (message.type === "voice" && message.attachment?.kind === "voice") {
    return {
      conversationId: message.conversationId,
      characterId,
      type: "voice",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (
    message.type === "contact_card" &&
    message.attachment?.kind === "contact_card"
  ) {
    return {
      conversationId: message.conversationId,
      characterId,
      type: "contact_card",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (
    message.type === "location_card" &&
    message.attachment?.kind === "location_card"
  ) {
    return {
      conversationId: message.conversationId,
      characterId,
      type: "location_card",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (message.type === "note_card" && message.attachment?.kind === "note_card") {
    return {
      conversationId: message.conversationId,
      characterId,
      type: "note_card",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (message.type === "text") {
    const nextText = message.text.trim();
    if (!nextText) {
      return null;
    }

    return {
      conversationId: message.conversationId,
      characterId,
      text: nextText,
    };
  }

  return null;
}

export function buildGroupRetryPayload(
  message: GroupThreadMessage,
): SendGroupMessageRequest | null {
  if (message.type === "sticker" && message.attachment?.kind === "sticker") {
    return {
      type: "sticker",
      text: message.text.trim() || undefined,
      attachment: message.attachment,
    };
  }

  if (message.type === "image" && message.attachment?.kind === "image") {
    return {
      type: "image",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (message.type === "file" && message.attachment?.kind === "file") {
    return {
      type: "file",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (message.type === "voice" && message.attachment?.kind === "voice") {
    return {
      type: "voice",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (
    message.type === "contact_card" &&
    message.attachment?.kind === "contact_card"
  ) {
    return {
      type: "contact_card",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (
    message.type === "location_card" &&
    message.attachment?.kind === "location_card"
  ) {
    return {
      type: "location_card",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (message.type === "note_card" && message.attachment?.kind === "note_card") {
    return {
      type: "note_card",
      text: normalizeRetryText(message),
      attachment: message.attachment,
    };
  }

  if (message.type === "text") {
    const nextText = message.text.trim();
    if (!nextText) {
      return null;
    }

    return { text: nextText };
  }

  return null;
}

// mergeThreadMessageWindow 在批量合并历史消息窗口（initial 60 / "查看更多消息"
// 100/140/... / aroundMessageId window）时被调用，每次都拿 60+ 条 incoming 在循环
// 里 upsert。原版 upsertIncomingThreadMessage 每次内部都 sortThreadMessages 一次
// → 60 条 incoming 触发 60 次 Map+sort（每次都是 O(N log N) parseTimestamp 调用，
// 长聊天滚到 200 条时 ≈ 656K parseTimestamp + Map.set 调用）；socket 单条消息
// 进 cache 也会重跑这段。改成循环里只做 upsert（O(1) 替换 / O(N) 查找），最末
// 统一 sortThreadMessages 一次。public 的 upsertIncomingThreadMessage 仍保持单
// 次 sort 语义，让 socket onMessage 单条投递的 caller 不用关心顺序。
function mergeThreadMessageWindow<
  TLocalMessage extends ThreadMessageLike & ChatLocalMessageState,
  TServerMessage extends ThreadMessageLike,
>(current: TLocalMessage[], incoming: TServerMessage[]) {
  let nextMessages: TLocalMessage[] = [...current];

  for (const message of incoming) {
    nextMessages = upsertIncomingThreadMessageWithoutSort(nextMessages, message);
  }

  return sortThreadMessages(nextMessages);
}

function upsertIncomingThreadMessageWithoutSort<
  TLocalMessage extends ThreadMessageLike & ChatLocalMessageState,
  TServerMessage extends ThreadMessageLike,
>(current: TLocalMessage[] | undefined, incoming: TServerMessage): TLocalMessage[] {
  if (!current?.length) {
    return [incoming as unknown as TLocalMessage];
  }

  const exactIndex = current.findIndex((message) => message.id === incoming.id);
  if (exactIndex >= 0) {
    const nextMessages = [...current];
    nextMessages[exactIndex] = incoming as unknown as TLocalMessage;
    return nextMessages;
  }

  const optimisticIndex = current.findIndex((message) =>
    isMatchingOptimisticEcho(message, incoming),
  );
  if (optimisticIndex >= 0) {
    const nextMessages = [...current];
    nextMessages[optimisticIndex] = incoming as unknown as TLocalMessage;
    return nextMessages;
  }

  return [...current, incoming as unknown as TLocalMessage];
}

function upsertIncomingThreadMessage<
  TLocalMessage extends ThreadMessageLike & ChatLocalMessageState,
  TServerMessage extends ThreadMessageLike,
>(current: TLocalMessage[] | undefined, incoming: TServerMessage) {
  return sortThreadMessages(
    upsertIncomingThreadMessageWithoutSort(current, incoming),
  );
}

function replaceLocalThreadMessage<
  TLocalMessage extends ThreadMessageLike & ChatLocalMessageState,
  TServerMessage extends ThreadMessageLike,
>(current: TLocalMessage[], localId: string, incoming: TServerMessage) {
  const nextMessages = [...current];
  const localIndex = nextMessages.findIndex((message) => message.id === localId);

  if (localIndex >= 0) {
    nextMessages[localIndex] = incoming as unknown as TLocalMessage;
    return sortThreadMessages(nextMessages);
  }

  return upsertIncomingThreadMessage(nextMessages, incoming);
}

function sortThreadMessages<
  TMessage extends ThreadMessageLike & ChatLocalMessageState,
>(messages: TMessage[]) {
  const deduped = new Map<string, TMessage>();

  for (const message of messages) {
    deduped.set(message.id, message);
  }

  // 走查 R1：原版 comparator 内每次都 parseTimestamp(left.createdAt) +
  // parseTimestamp(right.createdAt)，N=200 条消息每次 sort 约 1500 次比较 ×
  // 2 parseTimestamp ≈ 3000 次 Date.parse。本函数是 mergeThreadMessageWindow
  // 收尾 + upsertIncomingThreadMessage 每条 socket echo / replaceLocalThreadMessage
  // 每次重试 echo 的 hot path，typing tick / AI 回声追加的高频 re-render
  // 上叠出来。Schwartzian transform：先 decorate 一次性算 [ts, msg]，sort 只比
  // number，每条消息恰好 1 次 parseTimestamp，省掉 log2(N)×2 倍重复解析。
  return decorateAndSortByTimestamp([...deduped.values()]);
}

function isMatchingOptimisticEcho(
  localMessage: ThreadMessageLike & ChatLocalMessageState,
  incoming: ThreadMessageLike,
) {
  return (
    isLocalThreadMessage(localMessage) &&
    localMessage.senderType === "user" &&
    localMessage.senderId === incoming.senderId &&
    localMessage.text === incoming.text &&
    attachmentsEqual(localMessage.attachment, incoming.attachment)
  );
}

function isLocalThreadMessage(message: ThreadMessageLike & ChatLocalMessageState) {
  return message.id.startsWith("local_");
}

function attachmentsEqual(left?: MessageAttachment, right?: MessageAttachment) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right || left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "sticker" && right.kind === "sticker") {
    return (
      (left.sourceType ?? "builtin") === (right.sourceType ?? "builtin") &&
      (left.packId ?? "") === (right.packId ?? "") &&
      left.stickerId === right.stickerId
    );
  }

  if (left.kind === "image" && right.kind === "image") {
    return left.url === right.url && left.fileName === right.fileName;
  }

  if (left.kind === "file" && right.kind === "file") {
    return left.url === right.url && left.fileName === right.fileName;
  }

  if (left.kind === "voice" && right.kind === "voice") {
    return left.url === right.url && left.fileName === right.fileName;
  }

  if (left.kind === "contact_card" && right.kind === "contact_card") {
    return left.characterId === right.characterId;
  }

  if (left.kind === "location_card" && right.kind === "location_card") {
    return left.sceneId === right.sceneId && left.title === right.title;
  }

  if (left.kind === "note_card" && right.kind === "note_card") {
    return left.noteId === right.noteId && left.updatedAt === right.updatedAt;
  }

  return false;
}

function normalizeRetryText(message: ThreadMessageLike) {
  const text = message.text.trim();
  if (!text) {
    return undefined;
  }

  const implicitText = buildImplicitAttachmentText(message.type, message.attachment);
  return implicitText && text === implicitText ? undefined : text;
}

// i18n-ignore-start: protocol markers for attachment text field, used for round-trip matching
function buildImplicitAttachmentText(
  type: string,
  attachment?: MessageAttachment,
) {
  if (!attachment) {
    return "";
  }

  if (type === "contact_card" && attachment.kind === "contact_card") {
    return `[名片] ${attachment.name}`;
  }

  if (type === "location_card" && attachment.kind === "location_card") {
    return `[位置] ${attachment.title}`;
  }

  if (type === "note_card" && attachment.kind === "note_card") {
    return `[笔记] ${attachment.title}`;
  }

  if (type === "voice" && attachment.kind === "voice") {
    return "[语音]";
  }

  if (type === "file" && attachment.kind === "file") {
    return `[文件] ${attachment.fileName}`;
  }

  if (type === "image" && attachment.kind === "image") {
    return `[图片] ${attachment.fileName}`;
  }

  return "";
}
// i18n-ignore-end
