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

export function buildOptimisticDirectMessage(input: {
  payload: SendMessagePayload;
  ownerId: string;
  senderName: string;
}): DirectThreadMessage {
  const { ownerId, payload, senderName } = input;
  const createdAt = String(Date.now());

  if (payload.type === "sticker") {
    const stickerLabel = sanitizeDisplayedChatText(payload.text ?? "").replace(
      /^\[表情包\]\s*/,
      "",
    );
    const optimisticAttachment = payload.attachment;

    return {
      id: `local_${createdAt}`,
      conversationId: payload.conversationId,
      senderType: "user",
      senderId: ownerId,
      senderName,
      type: "sticker",
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
      id: `local_${createdAt}`,
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
    id: `local_${createdAt}`,
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
  const messageType = payload.type ?? "text";

  return {
    id: `local_${createdAt}`,
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

function mergeThreadMessageWindow<
  TLocalMessage extends ThreadMessageLike & ChatLocalMessageState,
  TServerMessage extends ThreadMessageLike,
>(current: TLocalMessage[], incoming: TServerMessage[]) {
  let nextMessages = [...current];

  for (const message of incoming) {
    nextMessages = upsertIncomingThreadMessage(nextMessages, message);
  }

  return sortThreadMessages(nextMessages);
}

function upsertIncomingThreadMessage<
  TLocalMessage extends ThreadMessageLike & ChatLocalMessageState,
  TServerMessage extends ThreadMessageLike,
>(current: TLocalMessage[] | undefined, incoming: TServerMessage) {
  if (!current?.length) {
    return [incoming as unknown as TLocalMessage];
  }

  const exactIndex = current.findIndex((message) => message.id === incoming.id);
  if (exactIndex >= 0) {
    const nextMessages = [...current];
    nextMessages[exactIndex] = incoming as unknown as TLocalMessage;
    return sortThreadMessages(nextMessages);
  }

  const optimisticIndex = current.findIndex((message) =>
    isMatchingOptimisticEcho(message, incoming),
  );
  if (optimisticIndex >= 0) {
    const nextMessages = [...current];
    nextMessages[optimisticIndex] = incoming as unknown as TLocalMessage;
    return sortThreadMessages(nextMessages);
  }

  return sortThreadMessages([
    ...current,
    incoming as unknown as TLocalMessage,
  ]);
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

  return [...deduped.values()].sort(
    (left, right) =>
      (parseTimestamp(left.createdAt) ?? 0) -
      (parseTimestamp(right.createdAt) ?? 0),
  );
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
