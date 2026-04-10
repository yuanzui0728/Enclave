import { useEffect, useState } from "react";
import type { ChatReminderEntry } from "./chat-reminder-entries";
import { removeLocalChatMessageReminder } from "./local-chat-message-actions";

export const CHAT_REMINDER_COMPLETION_NOTICE = "已完成消息提醒。";
export const CHAT_REMINDER_ACTION_NOTICE_DURATION_MS = 2_400;

type UseChatReminderActionsOptions = {
  navigateToReminder: (entry: ChatReminderEntry) => void;
  onNoticeChange?: (notice: string | null) => void;
  autoClearLocalNoticeMs?: number | null;
};

export function useChatReminderActions({
  navigateToReminder,
  onNoticeChange,
  autoClearLocalNoticeMs = null,
}: UseChatReminderActionsOptions) {
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!localNotice || !autoClearLocalNoticeMs) {
      return;
    }

    const timer = window.setTimeout(
      () => setLocalNotice(null),
      autoClearLocalNoticeMs,
    );
    return () => window.clearTimeout(timer);
  }, [autoClearLocalNoticeMs, localNotice]);

  function openReminder(entry: ChatReminderEntry) {
    onNoticeChange?.(null);
    setLocalNotice(null);
    navigateToReminder(entry);
  }

  function completeReminder(messageId: string) {
    removeLocalChatMessageReminder(messageId);
    onNoticeChange?.(CHAT_REMINDER_COMPLETION_NOTICE);
    setLocalNotice(CHAT_REMINDER_COMPLETION_NOTICE);
  }

  function clearLocalNotice() {
    setLocalNotice(null);
  }

  return {
    localNotice,
    clearLocalNotice,
    openReminder,
    completeReminder,
  };
}
