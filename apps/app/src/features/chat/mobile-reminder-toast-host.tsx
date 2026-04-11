import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
import { BellRing, Check, ChevronRight, X } from "lucide-react";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  buildChatReminderHashValue,
  buildChatReminderHref,
  buildChatReminderNavigation,
  buildChatReminderPath,
  getChatReminderActionLabel,
  getChatReminderActionTone,
  formatReminderListTimestamp,
  getChatReminderStatusLabel,
} from "./chat-reminder-entries";
import {
  CHAT_REMINDER_ACTION_NOTICE_DURATION_MS,
  useChatReminderActions,
} from "./use-chat-reminder-actions";
import { useMessageReminders } from "./use-message-reminders";
import { useChatReminderEntries } from "./use-chat-reminder-entries";
import { showLocalNotification } from "../../runtime/mobile-bridge";

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
  const { reminders, clearReminder, notifyReminder } = useMessageReminders();
  const [dismissedMessageIds, setDismissedMessageIds] = useState<string[]>([]);
  const [documentVisibility, setDocumentVisibility] = useState<
    DocumentVisibilityState | null
  >(() =>
    typeof document === "undefined" ? null : document.visibilityState,
  );

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(baseUrl),
  });

  const { dueReminderEntries: dueReminders } = useChatReminderEntries({
    reminders,
    conversations: conversationsQuery.data ?? [],
  });
  const activeReminder = useMemo(
    () =>
      dueReminders.find(
        (reminder) => !dismissedMessageIds.includes(reminder.messageId),
      ) ?? null,
    [dismissedMessageIds, dueReminders],
  );
  const dismissReminder = (messageId: string) => {
    setDismissedMessageIds((current) =>
      current.includes(messageId) ? current : [...current, messageId],
    );
  };
  const {
    localNotice: actionNotice,
    clearLocalNotice,
    openReminder,
    completeReminder,
  } = useChatReminderActions({
    navigateToReminder: (entry) => {
      dismissReminder(entry.messageId);
      void navigate(buildChatReminderNavigation(entry));
    },
    autoClearLocalNoticeMs: CHAT_REMINDER_ACTION_NOTICE_DURATION_MS,
    onCompleteReminder: clearReminder,
  });

  useEffect(() => {
    setDismissedMessageIds((current) =>
      current.filter((item) =>
        dueReminders.some((reminder) => reminder.messageId === item),
      ),
    );
  }, [dueReminders]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const syncVisibility = () => {
      setDocumentVisibility(document.visibilityState);
    };

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (
      !activeReminder ||
      activeReminder.notifiedAt ||
      documentVisibility !== "hidden"
    ) {
      return;
    }

    void showLocalNotification({
      id: `chat-reminder-${activeReminder.messageId}`,
      title: activeReminder.title,
      body: activeReminder.previewText,
      route: buildChatReminderHref(activeReminder),
      conversationId:
        activeReminder.threadType === "direct"
          ? activeReminder.threadId
          : undefined,
      groupId:
        activeReminder.threadType === "group"
          ? activeReminder.threadId
          : undefined,
      source: "local_reminder",
    }).then((shown) => {
      if (!shown) {
        return;
      }

      void notifyReminder(activeReminder.messageId);
    });
  }, [activeReminder, documentVisibility, notifyReminder]);

  const shouldHideActiveReminder =
    !activeReminder ||
    pathname === "/tabs/chat" ||
    (() => {
      const activePath = buildChatReminderPath(activeReminder);
      const activeHash = `#${buildChatReminderHashValue(activeReminder.messageId)}`;
      return pathname === activePath && hash === activeHash;
    })();

  if (shouldHideActiveReminder && !actionNotice) {
    return null;
  }

  const remainingCount = activeReminder
    ? dueReminders.filter((item) => item.messageId !== activeReminder.messageId)
        .length
    : 0;
  const activeReminderStatusLabel = activeReminder
    ? getChatReminderStatusLabel(activeReminder)
    : null;

  const handleDismiss = () => {
    if (!activeReminder) {
      return;
    }

    dismissReminder(activeReminder.messageId);
  };

  const handleComplete = () => {
    if (!activeReminder) {
      return;
    }

    dismissReminder(activeReminder.messageId);
    void completeReminder(activeReminder);
  };

  const handleOpen = () => {
    if (!activeReminder) {
      return;
    }

    openReminder(activeReminder);
  };

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 space-y-2">
      {actionNotice ? (
        <div className="pointer-events-auto overflow-hidden rounded-[20px] border border-[rgba(255,255,255,0.82)] bg-[rgba(249,255,251,0.97)] shadow-[0_12px_28px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(7,193,96,0.12)] text-[#07c160]">
              <Check size={16} />
            </div>
            <div className="min-w-0 flex-1 text-[13px] font-medium text-[#111827]">
              {actionNotice}
            </div>
            <button
              type="button"
              onClick={clearLocalNotice}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8c8c8c]"
              aria-label="关闭提醒结果提示"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
      {!shouldHideActiveReminder && activeReminder ? (
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
                <span>{activeReminder.title}</span>
                {activeReminderStatusLabel ? (
                  <span className="ml-2 rounded-full bg-[rgba(0,0,0,0.06)] px-2 py-0.5 text-[11px] font-normal text-[#5f6368]">
                    {activeReminderStatusLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#5f6368]">
                {activeReminder.previewText}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-[12px] text-[#8c8c8c]">
                  {formatReminderListTimestamp(
                    activeReminder.remindAt,
                    activeReminder.isDue,
                    activeReminder.notifiedAt,
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleComplete}
                    className={[
                      "rounded-full px-3 py-1.5 text-[12px] transition-colors",
                      getChatReminderActionTone(activeReminder) === "warning"
                        ? "border border-[#f1d5a6] bg-[#fff8ec] text-[#b76a08]"
                        : "border border-transparent bg-[#f3f6f4] text-[#5f6b63]",
                    ].join(" ")}
                  >
                    {getChatReminderActionLabel(activeReminder)}
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
      ) : null}
    </div>
  );
}
