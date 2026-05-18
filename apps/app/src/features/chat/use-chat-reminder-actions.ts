import { useEffect, useRef, useState } from "react";
import {
  getChatReminderActionErrorMessage,
  getChatReminderActionNotice,
  type ChatReminderEntry,
} from "./chat-reminder-entries";
import { removeLocalChatMessageReminder } from "./local-chat-message-actions";

export const CHAT_REMINDER_ACTION_NOTICE_DURATION_MS = 2_400;

type UseChatReminderActionsOptions = {
  navigateToReminder: (entry: ChatReminderEntry) => void;
  onNoticeChange?: (notice: string | null) => void;
  autoClearLocalNoticeMs?: number | null;
  onCompleteReminder?: (messageId: string) => Promise<void> | void;
};

export function useChatReminderActions({
  navigateToReminder,
  onNoticeChange,
  autoClearLocalNoticeMs = null,
  onCompleteReminder,
}: UseChatReminderActionsOptions) {
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  // 第四轮 R2：completeReminder 原版无双击锁，chat-list 提醒分组里每条
  // 「完成」/「我办了」按钮 + mobile-reminder-toast-host 顶部 toast 的「我办了」
  // 都用 onClick={() => void completeReminder(entry)} 形态接进来。同帧第二次
  // click 走到 onCompleteReminder（→ clearReminder → removeReminderMutation
  // .mutateAsync）就会让同一 sourceId 走 DELETE 两次，第二次 404；catch 分支
  // 把刚刚成功的「已完成」蓝条覆盖成「完成失败」红条。和 chat-list-page R1
  // / chat-message-list 撤回/删除 同款 sync ref 锁；按 messageId 分锁，
  // 不同提醒互不影响。
  const completingMessageIdsRef = useRef<Set<string>>(new Set());
  // 走查电脑端群聊 R3：openReminder 原版无双击锁。DesktopReminderCard 内
  // 「开」按钮 onClick={() => onOpen(entry)} → openReminder(entry) →
  // navigateToReminder(entry)（desktop-chat-workspace inline 是
  // `void navigate(buildChatReminderNavigation(entry, {desktopLayout: true}))`）
  // 直接发 push history。同帧 <16ms 双击都通过 → 2 条相同 /tabs/chat?... history
  // 项 → 用户从被定位的群消息回到提醒卡片需要按 2 次返回；group reminder 的
  // 定位逻辑还要走 useGroupBackground + getGroupMessages around-message 公网
  // RTT，第 2 次也会重复发出。和姊妹 completeReminder 一样按 messageId 分锁
  // 同时给一个 raf 释放兜底"navigate 没真正切走"的边界（disabled / 同会话
  // 内 hash-update）。不同 reminder 互不影响——用户连续点两条不同提醒是合法
  // 操作。
  const openingMessageIdsRef = useRef<Set<string>>(new Set());

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
    if (openingMessageIdsRef.current.has(entry.messageId)) {
      return;
    }
    openingMessageIdsRef.current.add(entry.messageId);
    onNoticeChange?.(null);
    setLocalNotice(null);
    navigateToReminder(entry);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        openingMessageIdsRef.current.delete(entry.messageId);
      });
    } else {
      openingMessageIdsRef.current.delete(entry.messageId);
    }
  }

  async function completeReminder(entry: ChatReminderEntry) {
    if (completingMessageIdsRef.current.has(entry.messageId)) {
      return;
    }
    completingMessageIdsRef.current.add(entry.messageId);
    const noticeMessage = getChatReminderActionNotice(entry);

    try {
      await (onCompleteReminder?.(entry.messageId) ??
        Promise.resolve(removeLocalChatMessageReminder(entry.messageId)));
      onNoticeChange?.(noticeMessage);
      setLocalNotice(noticeMessage);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : getChatReminderActionErrorMessage(entry);
      onNoticeChange?.(message);
      setLocalNotice(message);
    } finally {
      completingMessageIdsRef.current.delete(entry.messageId);
    }
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
