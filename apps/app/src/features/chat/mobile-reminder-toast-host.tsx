import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
import { BellRing, ChevronRight, X } from "lucide-react";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { buildDueChatReminderEntries } from "./chat-reminder-entries";
import {
  removeLocalChatMessageReminder,
  useLocalChatMessageActionState,
} from "./local-chat-message-actions";
import { formatMessageTimestamp } from "../../lib/format";

export function MobileReminderToastHost() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const { reminders } = useLocalChatMessageActionState();
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [dismissedMessageIds, setDismissedMessageIds] = useState<string[]>([]);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(baseUrl),
  });

  const dueReminders = useMemo(
    () =>
      buildDueChatReminderEntries(
        reminders,
        conversationsQuery.data ?? [],
        nowTimestamp,
      ),
    [conversationsQuery.data, nowTimestamp, reminders],
  );
  const activeReminder = useMemo(
    () =>
      dueReminders.find(
        (reminder) => !dismissedMessageIds.includes(reminder.messageId),
      ) ?? null,
    [dismissedMessageIds, dueReminders],
  );

  useEffect(() => {
    if (!reminders.length) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [reminders.length]);

  useEffect(() => {
    setDismissedMessageIds((current) =>
      current.filter((item) =>
        dueReminders.some((reminder) => reminder.messageId === item),
      ),
    );
  }, [dueReminders]);

  if (!activeReminder || pathname === "/tabs/chat") {
    return null;
  }

  const activePath =
    activeReminder.threadType === "group"
      ? `/group/${activeReminder.threadId}`
      : `/chat/${activeReminder.threadId}`;
  const activeHash = `#chat-message-${activeReminder.messageId}`;
  if (pathname === activePath && hash === activeHash) {
    return null;
  }

  const remainingCount = dueReminders.filter(
    (item) => item.messageId !== activeReminder.messageId,
  ).length;

  const handleDismiss = () => {
    setDismissedMessageIds((current) =>
      current.includes(activeReminder.messageId)
        ? current
        : [...current, activeReminder.messageId],
    );
  };

  const handleComplete = () => {
    removeLocalChatMessageReminder(activeReminder.messageId);
  };

  const handleOpen = () => {
    handleDismiss();

    if (activeReminder.threadType === "group") {
      void navigate({
        to: "/group/$groupId",
        params: { groupId: activeReminder.threadId },
        hash: `chat-message-${activeReminder.messageId}`,
      });
      return;
    }

    void navigate({
      to: "/chat/$conversationId",
      params: { conversationId: activeReminder.threadId },
      hash: `chat-message-${activeReminder.messageId}`,
    });
  };

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30">
      <div className="pointer-events-auto overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.82)] bg-[rgba(255,252,246,0.96)] shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(7,193,96,0.12)] text-[#07c160]">
            <BellRing size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-[14px] font-medium text-[#111827]">
                  消息提醒
                </div>
                {remainingCount > 0 ? (
                  <div className="shrink-0 rounded-full bg-[rgba(0,0,0,0.06)] px-2 py-0.5 text-[11px] text-[#5f6368]">
                    还有 {remainingCount} 条
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8c8c8c]"
                aria-label="暂时关闭提醒浮条"
              >
                <X size={15} />
              </button>
            </div>
            <div className="mt-1 truncate text-[13px] font-medium text-[#3f3f46]">
              {activeReminder.title}
            </div>
            <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#5f6368]">
              {activeReminder.previewText}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-[12px] text-[#8c8c8c]">
                提醒时间 {formatMessageTimestamp(activeReminder.remindAt)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleComplete}
                  className="rounded-full border border-black/8 px-3 py-1.5 text-[12px] text-[#5f6368]"
                >
                  完成
                </button>
                <button
                  type="button"
                  onClick={handleOpen}
                  className="inline-flex items-center gap-1 rounded-full bg-[#07c160] px-3 py-1.5 text-[12px] font-medium text-white"
                >
                  <span>查看</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
