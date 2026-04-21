import type {
  ConversationListItem,
  MessageReminderRecord,
} from "@yinjie/contracts";
import { buildDesktopChatRouteHash } from "./chat-route-state";
import { formatMessageTimestamp, parseTimestamp } from "../../lib/format";

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

export type ChatReminderStatusCounts = {
  totalCount: number;
  dueCount: number;
  notifiedCount: number;
  pendingCount: number;
};

export type ChatReminderGroup = {
  status: ChatReminderStatus;
  title: string;
  count: number;
  entries: ChatReminderEntry[];
};

export type ChatReminderActionTone = "secondary" | "warning";

export function buildChatReminderEntries(
  reminders: readonly MessageReminderRecord[],
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
    .sort(compareChatReminderEntries);
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

export function buildChatReminderNavigation(
  entry: ChatReminderTarget,
  options?: {
    desktopLayout?: boolean;
  },
) {
  if (options?.desktopLayout) {
    return {
      to: "/tabs/chat" as const,
      hash: buildDesktopChatRouteHash({
        conversationId: entry.threadId,
        messageId: entry.messageId,
      }),
    };
  }

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

export function getChatReminderActionLabel(
  entry: Pick<ChatReminderEntry, "isDue" | "notifiedAt">,
) {
  return getChatReminderStatus(entry) === "pending" ? "取消提醒" : "完成";
}

export function getChatReminderActionNotice(
  entry: Pick<ChatReminderEntry, "isDue" | "notifiedAt">,
) {
  return getChatReminderStatus(entry) === "pending"
    ? "已取消消息提醒。"
    : "已完成消息提醒。";
}

export function getChatReminderActionErrorMessage(
  entry: Pick<ChatReminderEntry, "isDue" | "notifiedAt">,
) {
  return getChatReminderStatus(entry) === "pending"
    ? "取消提醒失败，请稍后再试。"
    : "完成提醒失败，请稍后再试。";
}

export function getChatReminderActionTone(
  entry: Pick<ChatReminderEntry, "isDue" | "notifiedAt">,
): ChatReminderActionTone {
  return getChatReminderStatus(entry) === "pending" ? "warning" : "secondary";
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

export function countChatReminderStatuses(
  entries: readonly Pick<ChatReminderEntry, "isDue" | "notifiedAt">[],
): ChatReminderStatusCounts {
  const counts: ChatReminderStatusCounts = {
    totalCount: entries.length,
    dueCount: 0,
    notifiedCount: 0,
    pendingCount: 0,
  };

  entries.forEach((entry) => {
    const status = getChatReminderStatus(entry);
    if (status === "notified") {
      counts.notifiedCount += 1;
      return;
    }

    if (status === "due") {
      counts.dueCount += 1;
      return;
    }

    counts.pendingCount += 1;
  });

  return counts;
}

export function formatChatReminderSummary(counts: ChatReminderStatusCounts) {
  const parts = [
    counts.dueCount > 0 ? `${counts.dueCount} 条已到时间` : null,
    counts.notifiedCount > 0 ? `${counts.notifiedCount} 条已通知` : null,
    counts.pendingCount > 0 ? `${counts.pendingCount} 条待提醒` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : "暂无提醒";
}

export function groupChatReminderEntries(
  entries: readonly ChatReminderEntry[],
): ChatReminderGroup[] {
  const groups = new Map<ChatReminderStatus, ChatReminderEntry[]>();

  entries.forEach((entry) => {
    const status = getChatReminderStatus(entry);
    const current = groups.get(status);
    if (current) {
      current.push(entry);
      return;
    }

    groups.set(status, [entry]);
  });

  return getOrderedChatReminderStatuses()
    .map((status) => {
      const statusEntries = groups.get(status) ?? [];
      if (statusEntries.length === 0) {
        return null;
      }

      return {
        status,
        title: getChatReminderStatusTitle(status),
        count: statusEntries.length,
        entries: statusEntries,
      };
    })
    .filter((group): group is ChatReminderGroup => Boolean(group));
}

export function isChatReminderGroupCollapsible(status: ChatReminderStatus) {
  return status === "notified";
}

export function isChatReminderGroupClearable(status: ChatReminderStatus) {
  return status === "notified";
}

export function getChatReminderGroupClearLabel(status: ChatReminderStatus) {
  return status === "notified" ? "清理已通知" : "清理提醒";
}

export function getChatReminderGroupClearNotice(
  status: ChatReminderStatus,
  count: number,
) {
  return status === "notified"
    ? `已清理 ${count} 条已通知提醒。`
    : `已清理 ${count} 条提醒。`;
}

export function getChatReminderGroupClearErrorMessage(
  status: ChatReminderStatus,
) {
  return status === "notified"
    ? "清理已通知提醒失败，请稍后再试。"
    : "清理提醒失败，请稍后再试。";
}

function compareChatReminderEntries(
  left: ChatReminderEntry,
  right: ChatReminderEntry,
) {
  const leftStatus = getChatReminderStatus(left);
  const rightStatus = getChatReminderStatus(right);
  const statusDiff =
    getChatReminderStatusPriority(leftStatus) -
    getChatReminderStatusPriority(rightStatus);
  if (statusDiff !== 0) {
    return statusDiff;
  }

  if (leftStatus === "notified" && rightStatus === "notified") {
    return (
      (parseTimestamp(right.notifiedAt ?? right.remindAt) ?? 0) -
      (parseTimestamp(left.notifiedAt ?? left.remindAt) ?? 0)
    );
  }

  return (
    (parseTimestamp(left.remindAt) ?? 0) - (parseTimestamp(right.remindAt) ?? 0)
  );
}

function getChatReminderStatusPriority(status: ChatReminderStatus) {
  switch (status) {
    case "due":
      return 0;
    case "notified":
      return 1;
    case "pending":
      return 2;
  }
}

function getOrderedChatReminderStatuses(): ChatReminderStatus[] {
  return ["due", "notified", "pending"];
}

function getChatReminderStatusTitle(status: ChatReminderStatus) {
  switch (status) {
    case "due":
      return "已到时间";
    case "notified":
      return "已通知";
    case "pending":
      return "待提醒";
  }
}
