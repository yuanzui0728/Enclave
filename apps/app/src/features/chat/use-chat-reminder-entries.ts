import { useMemo } from "react";
import type { ConversationListItem } from "@yinjie/contracts";
import {
  buildChatReminderEntries,
  filterChatReminderEntries,
} from "./chat-reminder-entries";
import type { LocalChatMessageReminderRecord } from "./local-chat-message-actions";
import { useChatReminderNowTimestamp } from "./use-chat-reminder-now-timestamp";

type UseChatReminderEntriesOptions = {
  reminders: readonly LocalChatMessageReminderRecord[];
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
    () => filteredReminderEntries.filter((entry) => entry.isDue),
    [filteredReminderEntries],
  );

  return {
    nowTimestamp,
    reminderEntries,
    filteredReminderEntries,
    dueReminderEntries,
    dueReminderCount: dueReminderEntries.length,
  };
}
