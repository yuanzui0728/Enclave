import type { ConversationListItem } from "@yinjie/contracts";
import { formatMessageTimestamp, parseTimestamp } from "../../lib/format";
import type { LocalChatMessageReminderRecord } from "./local-chat-message-actions";

export type ChatReminderEntry = {
  messageId: string;
  threadId: string;
  threadType: "direct" | "group";
  title: string;
  previewText: string;
  remindAt: string;
  isDue: boolean;
  participants: string[];
  notifiedAt?: string;
};

export type ChatReminderTarget = Pick<
  ChatReminderEntry,
  "messageId" | "threadId" | "threadType"
>;

export type ChatReminderStatus = "pending" | "due" | "notified";

export function buildChatReminderEntries(
  reminders: readonly LocalChatMessageReminderRecord[],
  conversations: readonly ConversationListItem[],
  nowTimestamp: number,
): ChatReminderEntry[] {
  const conversationMap = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );

  return [...reminders]
    .filter((item) => item.threadId.trim())
    .map((item) => {
      const conversation = conversationMap.get(item.threadId);
      const remindTimestamp = parseTimestamp(item.remindAt) ?? 0;

      return {
        messageId: item.messageId,
        threadId: item.threadId,
        threadType: item.threadType,
        title:
          conversation?.title ||
          item.threadTitle?.trim() ||
          (item.threadType === "group" ? "群聊" : "聊天"),
        previewText: item.previewText?.trim() || "聊天消息",
        remindAt: item.remindAt,
        isDue: remindTimestamp <= nowTimestamp,
        participants: conversation?.participants ?? [],
        notifiedAt: item.notifiedAt,
      };
    })
    .sort((left, right) => {
      if (left.isDue !== right.isDue) {
        return left.isDue ? -1 : 1;
      }

      return (
        (parseTimestamp(left.remindAt) ?? 0) -
        (parseTimestamp(right.remindAt) ?? 0)
      );
    });
}

export function filterChatReminderEntries(
  entries: readonly ChatReminderEntry[],
  keyword: string,
) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return [...entries];
  }

  return entries.filter((entry) => {
    return (
      entry.title.toLowerCase().includes(normalizedKeyword) ||
      entry.previewText.toLowerCase().includes(normalizedKeyword) ||
      (entry.threadType === "group" ? "群聊" : "聊天").includes(
        normalizedKeyword,
      )
    );
  });
}

export function buildChatReminderHashValue(messageId: string) {
  return `chat-message-${messageId}`;
}

export function buildChatReminderPath(entry: ChatReminderTarget) {
  return entry.threadType === "group"
    ? `/group/${entry.threadId}`
    : `/chat/${entry.threadId}`;
}

export function buildChatReminderHref(entry: ChatReminderTarget) {
  return `${buildChatReminderPath(entry)}#${buildChatReminderHashValue(entry.messageId)}`;
}

export function buildChatReminderNavigation(entry: ChatReminderTarget) {
  const hash = buildChatReminderHashValue(entry.messageId);

  return entry.threadType === "group"
    ? {
        to: "/group/$groupId" as const,
        params: { groupId: entry.threadId },
        hash,
      }
    : {
        to: "/chat/$conversationId" as const,
        params: { conversationId: entry.threadId },
        hash,
      };
}

export function getChatReminderStatus({
  isDue,
  notifiedAt,
}: Pick<ChatReminderEntry, "isDue" | "notifiedAt">): ChatReminderStatus {
  if (notifiedAt) {
    return "notified";
  }

  return isDue ? "due" : "pending";
}

export function getChatReminderStatusLabel(
  entry: Pick<ChatReminderEntry, "isDue" | "notifiedAt">,
) {
  const status = getChatReminderStatus(entry);
  if (status === "notified") {
    return "已通知";
  }

  return status === "due" ? "已到时间" : "待提醒";
}

export function formatReminderListTimestamp(
  remindAt: string,
  isDue: boolean,
  notifiedAt?: string,
) {
  if (notifiedAt) {
    return `已于 ${formatMessageTimestamp(notifiedAt)} 通知`;
  }

  const label = formatMessageTimestamp(remindAt);
  return isDue ? `提醒时间 ${label}` : `将在 ${label} 提醒`;
}
