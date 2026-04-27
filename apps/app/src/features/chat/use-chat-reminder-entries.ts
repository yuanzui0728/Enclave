import { useMemo } from "react";
import type {
  ConversationListItem,
  MessageReminderRecord,
} from "@yinjie/contracts";
import { useAppLocale } from "@yinjie/i18n";
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
  const { activationVersion, locale } = useAppLocale();
  const nowTimestamp = useChatReminderNowTimestamp(reminders.length);

  const reminderEntries = useMemo(
    () => buildChatReminderEntries(reminders, conversations, nowTimestamp),
    [activationVersion, conversations, locale, nowTimestamp, reminders],
  );
  const filteredReminderEntries = useMemo(
    () => filterChatReminderEntries(reminderEntries, keyword),
    [activationVersion, keyword, locale, reminderEntries],
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
    [activationVersion, filteredReminderEntries, locale],
  );
  const filteredReminderSummary = useMemo(
    () => formatChatReminderSummary(filteredReminderStatusCounts),
    [activationVersion, filteredReminderStatusCounts, locale],
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
