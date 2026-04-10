import { useMemo } from "react";
import type {
  ConversationListItem,
  MessageReminderRecord,
} from "@yinjie/contracts";
import {
  buildChatReminderEntries,
  countChatReminderStatuses,
  formatChatReminderSummary,
  filterChatReminderEntries,
  getChatReminderStatus,
  groupChatReminderEntries,
} from "./chat-reminder-entries";
import { useChatReminderNowTimestamp } from "./use-chat-reminder-now-timestamp";

type UseChatReminderEntriesOptions = {
  reminders: readonly MessageReminderRecord[];
  conversations: readonly ConversationListItem[];
  keyword?: string;
};

export function useChatReminderEntries({
  reminders,
  conversations,
  keyword = "",
}: UseChatReminderEntriesOptions) {
  const nowTimestamp = useChatReminderNowTimestamp(reminders.length);

  const reminderEntries = useMemo(
    () => buildChatReminderEntries(reminders, conversations, nowTimestamp),
    [conversations, nowTimestamp, reminders],
  );
  const filteredReminderEntries = useMemo(
    () => filterChatReminderEntries(reminderEntries, keyword),
    [keyword, reminderEntries],
  );
  const dueReminderEntries = useMemo(
    () =>
      filteredReminderEntries.filter(
        (entry) => getChatReminderStatus(entry) === "due",
      ),
    [filteredReminderEntries],
  );
  const filteredReminderStatusCounts = useMemo(
    () => countChatReminderStatuses(filteredReminderEntries),
    [filteredReminderEntries],
  );
  const filteredReminderGroups = useMemo(
    () => groupChatReminderEntries(filteredReminderEntries),
    [filteredReminderEntries],
  );
  const filteredReminderSummary = useMemo(
    () => formatChatReminderSummary(filteredReminderStatusCounts),
    [filteredReminderStatusCounts],
  );

  return {
    nowTimestamp,
    reminderEntries,
    filteredReminderEntries,
    dueReminderEntries,
    filteredReminderStatusCounts,
    filteredReminderGroups,
    filteredReminderSummary,
    dueReminderCount: dueReminderEntries.length,
  };
}
