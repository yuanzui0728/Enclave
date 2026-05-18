import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { BellRing, Check, ChevronRight, X } from "lucide-react";
import { normalizePathname } from "../../lib/normalize-pathname";
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

const t = translateRuntimeMessage;

const EMPTY_CONVERSATIONS = Object.freeze([]);

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
  const normalizedPathname = normalizePathname(pathname);
  const { reminders, clearReminder, notifyReminder } = useMessageReminders();
  const [dismissedMessageIds, setDismissedMessageIds] = useState<string[]>([]);
  const [documentVisibility, setDocumentVisibility] = useState<
    DocumentVisibilityState | null
  >(() =>
    typeof document === "undefined" ? null : document.visibilityState,
  );

  // 走查 R4（第 4 轮）：和 chat-list-page / chat-room-page / chat-details /
  // mobile-ai-call-screen / mobile-shell 共享 ["app-conversations", baseUrl]，
  // 其余 5 处对齐到 15s staleTime；本观察者裸跑 → 原生壳 10s 默认 stale 跨
  // 路由切换时容易触发重复 GET /conversations，且本 host 只读 conversation
  // 的 title 用于 reminder toast，15s 足够新鲜。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(baseUrl),
    staleTime: 15_000,
  });
  const conversations = useMemo(
    () => conversationsQuery.data ?? EMPTY_CONVERSATIONS,
    [conversationsQuery.data],
  );

  const { dueReminderEntries: dueReminders } = useChatReminderEntries({
    reminders,
    conversations,
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
    setDismissedMessageIds((current) => {
      const next = current.filter((item) =>
        dueReminders.some((reminder) => reminder.messageId === item),
      );
      return next.length === current.length ? current : next;
    });
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

  // 已经触发过 showLocalNotification 的 messageId —— 防 effect 在
  // notifiedAt 真正落库前因为别的原因再 re-run 时重复弹通知。
  // 原写法：deps=[activeReminder, documentVisibility, notifyReminder]，但：
  //   - useMessageReminders 返回的 notifyReminder 是 function declaration，每
  //     次 render 换引用 → 任何无关 setState 都会重跑这个 effect。
  //   - activeReminder 通过 useChatReminderEntries 派生，reminders refetch
  //     30s 一次 + 窗口聚焦也刷新，每次得到的也是新对象引用即使 messageId 同。
  //   - notifyReminder 是异步 mutation，落库前 activeReminder.notifiedAt 还是
  //     null，期间任何 re-render 都会再次走到 showLocalNotification → 同一条
  //     提醒在锁屏通知中心刷两遍 / 推 2 次 markNotified API。
  // 用 ref 集合按 messageId 兜底，整页生命周期内同一条提醒只推一次。
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (
      !activeReminder ||
      activeReminder.notifiedAt ||
      documentVisibility !== "hidden"
    ) {
      return;
    }

    if (notifiedMessageIdsRef.current.has(activeReminder.messageId)) {
      return;
    }
    notifiedMessageIdsRef.current.add(activeReminder.messageId);

    const targetMessageId = activeReminder.messageId;
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
        // showLocalNotification 没真正弹（权限被拒 / OS 静默），不算"已通知"，
        // 释放标记让下一次条件再满足时可以重试。
        notifiedMessageIdsRef.current.delete(targetMessageId);
        return;
      }

      // notifyReminder 走 markNotifiedMutation.mutateAsync，markMessageReminderNotified
      // 后端 4xx/5xx / cloud token 过期重连都会让它 reject；用 .catch 释放
      // ref 标记让下次 effect 再满足条件时可以重试，同时避免 rejection 冒到
      // window.unhandledrejection 污染 telemetry。落 catch 之前 markNotified
      // 尝试已经完成（mutation onError 也会记录 mutation.error），失败不阻塞
      // UI——下一轮 refetch 拿到 notifiedAt=null 自然又会进这条分支重试。
      notifyReminder(targetMessageId).catch(() => {
        notifiedMessageIdsRef.current.delete(targetMessageId);
      });
    });
  }, [activeReminder, documentVisibility, notifyReminder]);

  // 走查 2026-05-18 移动端群聊 R2：reminder toast 顶端定位 calc(safe-area-top
  // + 6.5rem) ≈ y=104 是按"clear 单行 / 双行 topbar"算的；但 /chat/$id/search 和
  // /group/$id/search 这两条路由 topbar 只是 56-60px 的标题行，正下方紧跟一条
  // sticky 的搜索框（搜索 input 中心 y≈121），落在 toast bbox y=104..249 内 —
  // dueReminders 非空时整个搜索框被 reminder 卡盖死，用户点不进去敲字。
  // 这两条路由本身就是用户在做"找消息"专注任务，跟当前 reminder 并不互动，沿
  // /tabs/chat 思路一起隐藏 toast（提醒还会留在 chat 列表 + 30s refetch 不掉）。
  const isFocusedSearchRoute =
    /^\/(?:chat|group)\/[^/]+\/search$/.test(normalizedPathname);
  const shouldHideActiveReminder =
    !activeReminder ||
    normalizedPathname === "/tabs/chat" ||
    isFocusedSearchRoute ||
    (() => {
      const activePath = buildChatReminderPath(activeReminder);
      const activeHash = `#${buildChatReminderHashValue(activeReminder.messageId)}`;
      return (
        normalizePathname(activePath) === normalizedPathname &&
        hash === activeHash
      );
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
    <div
      className="pointer-events-none absolute z-30 space-y-2"
      style={{
        // 走查 2026-05-18 新会话 R1：原来 top 只让出 0.75rem，在挂了 TabPageTopBar
        // (sticky top-0 z-20) 的页面（channels/discover/contacts/me 等）reminder
        // card (~110px 高) 直接盖到 topbar 的 title 行 + 视频号场景下还盖死 section
        // tabs 行 → 用户点「朋友/关注/直播」tab 时 pointer event 落到 reminder
        // 内部 pointer-events-auto 的卡上（实测 playwright「<span>苏澄</span> from
        // pointer-events-none absolute z-30 subtree intercepts pointer events」）。
        // 用户唯一变通是先 dismiss reminder 才能点 tab，体感「reminder 卡住了视频号
        // 切换」。
        // 推到 6.5rem (~104px)：清掉 TabPageTopBar 含 tabs 行最高 ~98px + 6px 视觉
        // 间距；单行 topbar (~56px) 留 48px 间距视觉上 reminder 浮在 topbar 下方，
        // 可接受；reminder 仍然位于"上方区域"维持"刚收到提醒"的提示力度。
        top: "calc(var(--safe-area-inset-top) + 6.5rem)",
        right: "calc(var(--safe-area-inset-right) + 0.75rem)",
        left: "calc(var(--safe-area-inset-left) + 0.75rem)",
      }}
    >
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
              aria-label={t(msg`关闭提醒结果提示`)}
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
                    {t(msg`消息提醒`)}
                  </div>
                  {remainingCount > 0 ? (
                    <div className="shrink-0 rounded-full bg-[rgba(0,0,0,0.06)] px-2 py-0.5 text-[11px] text-[#5f6368]">
                      {t(msg`还有 ${remainingCount} 条`)}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8c8c8c]"
                  aria-label={t(msg`暂时关闭提醒浮条`)}
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
                    <span>{t(msg`查看`)}</span>
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
