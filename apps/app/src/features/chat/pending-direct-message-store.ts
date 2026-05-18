import type {
  ChatLocalMessageStatus,
  DirectThreadMessage,
} from "./chat-message-delivery";

// 跨 unmount 缓存"乐观但未被服务端回声替换"的直聊消息。
// 修复：sleeping/busy 角色把 user msg 入库延迟到 8-22s 后才完成，
// 用户立刻返回再进入时，DB 还没这条 → 列表只有历史 → 视觉上消失。
// 模块级 Map → SPA 内任何导航都保留；只有整页刷新才丢，符合预期。
const pendingByConversation = new Map<string, DirectThreadMessage[]>();

export function loadPendingDirectMessages(
  conversationId: string,
): DirectThreadMessage[] {
  return pendingByConversation.get(conversationId)?.slice() ?? [];
}

export function upsertPendingDirectMessage(
  conversationId: string,
  message: DirectThreadMessage,
) {
  const current = pendingByConversation.get(conversationId) ?? [];
  const next = [
    ...current.filter((existing) => existing.id !== message.id),
    message,
  ];
  pendingByConversation.set(conversationId, next);
}

export function removePendingDirectMessage(
  conversationId: string,
  messageId: string,
) {
  const current = pendingByConversation.get(conversationId);
  if (!current) {
    return;
  }
  const next = current.filter((message) => message.id !== messageId);
  if (next.length === 0) {
    pendingByConversation.delete(conversationId);
  } else {
    pendingByConversation.set(conversationId, next);
  }
}

export function updatePendingDirectMessageStatus(
  conversationId: string,
  messageIds: string[] | null,
  status: ChatLocalMessageStatus,
) {
  const current = pendingByConversation.get(conversationId);
  if (!current) {
    return;
  }
  const targetSet = messageIds ? new Set(messageIds) : null;
  pendingByConversation.set(
    conversationId,
    current.map((message) =>
      !targetSet || targetSet.has(message.id)
        ? { ...message, localStatus: status }
        : message,
    ),
  );
}

export function reconcilePendingDirectMessages(
  conversationId: string,
  surviving: DirectThreadMessage[],
) {
  const current = pendingByConversation.get(conversationId);
  if (!current?.length) {
    return;
  }
  const survivingIds = new Set(surviving.map((message) => message.id));
  const next = current.filter((message) => survivingIds.has(message.id));
  if (next.length === 0) {
    pendingByConversation.delete(conversationId);
    return;
  }
  if (next.length !== current.length) {
    pendingByConversation.set(conversationId, next);
  }
}
