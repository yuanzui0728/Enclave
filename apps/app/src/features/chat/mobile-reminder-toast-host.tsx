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

  // 走查 R3：dueReminders 来自 useChatReminderEntries，内部按 nowTimestamp
  // (1 分钟 ticker) + conversationsQuery (15s staleTime + window focus) refetch
  // 各 useMemo，每次都返回新数组引用 —— 即使 reminder 列表内容完全没变。原版
  // effect 把整个 dueReminders 当 dep，每分钟跑一遍 setDismissedMessageIds
  // filter（内容相等时早返不会触发实际 state 更新，但每个 tick 都跑 .filter +
  // .some 嵌套 O(N*M)）。改成 dep 用稳定的 id 串，效果一致，每 minute tick 不
  // 再跑这条逻辑。和 conversation-strong-reminder-host R3 同款收 deps 的修法。
  const dueReminderIdSignature = useMemo(
    () =>
      dueReminders
        .map((reminder) => reminder.messageId)
        .join("|"),
    [dueReminders],
  );
  useEffect(() => {
    setDismissedMessageIds((current) => {
      if (current.length === 0) {
        return current;
      }
      const activeMessageIds = new Set(
        dueReminderIdSignature ? dueReminderIdSignature.split("|") : [],
      );
      const next = current.filter((item) => activeMessageIds.has(item));
      return next.length === current.length ? current : next;
    });
    // dueReminderIdSignature changes only when the id set actually changes
    // (not on identity churn from nowTimestamp / refetch).
  }, [dueReminderIdSignature]);

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

  // 走查 2026-05-18 移动端群聊 R3：reminder toast 顶端 calc(safe-area-top + 6.5rem)
  // ≈ y=104，bbox 占到 y=104..249（约 145px 高，含 title + preview + 双按钮）。
  // 在 /chat/$id 和 /group/$id 这种聊天主线程页面，下方就是消息列表，toast 浮在
  // 顶部不挡操作；但所有 thread 的二级页面（/details, /search, /edit/*,
  // /announcement, /background, /qr, /members/add, /members/remove, /voice-call,
  // /video-call）都把表单/输入/按钮/QR 排在 topbar 紧下方 102~250 这个高度，
  // dueReminders 非空时整个交互区域被 reminder 卡盖死：
  //   - /announcement 群公告 textarea y=102..320 被覆盖 70%
  //   - /edit/name & /edit/nickname input y=102..146 整段盖死
  //   - /members/add & /members/remove & /group/new 搜索框 y=168..191 + 选项行
  //   - /background 背景方案 grid + /qr QR 码主体
  //   - /chat|group/$id/search 搜索 input（R2 已修单条路由）
  // 这些都是"焦点操作"页，用户不需要 reminder 来切断流程，跟 /tabs/chat 同思路
  // 隐藏 toast；reminder 仍在数据层保留，30s 内自然 refetch / 用户回到聊天主页
  // 或别的 tab 时还会弹出。/group/new 也归类为「焦点操作页」。
  const isFocusedThreadSubRoute =
    /^\/(?:chat|group)\/[^/]+\/.+$/.test(normalizedPathname);
  const isFocusedCreationRoute = normalizedPathname === "/group/new";
  // 新一轮走查 R1：/contacts/groups（通讯录 → 群聊列表）跟 /tabs/chat 形态
  // 一样——长列表 + sticky 顶部搜索框 + 每行可点击进群——reminder toast
  // y=104..249 把列表前 2-3 行整行盖死（实测 391×844 屏首行群聊 y=104..172
  // 完全消失，第二行只露半截 y=172..240）。/tabs/chat 已经在 hide 名单里
  // 因为本来就有 inline reminder，/contacts/groups 没 inline 入口，但用户
  // 既然已经在 /tabs/contacts 看过 toast、再点进群聊列表是要"挑一个群进去"
  // 的专注流程，沿同一思路一起隐藏，避免首屏 1/3 列表被盖。
  const isGroupListRoute = normalizedPathname === "/contacts/groups";
  const shouldHideActiveReminder =
    !activeReminder ||
    normalizedPathname === "/tabs/chat" ||
    isFocusedThreadSubRoute ||
    isFocusedCreationRoute ||
    isGroupListRoute ||
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
        <div className="pointer-events-auto overflow-hidden rounded-[var(--radius-lg)] border border-[rgba(255,255,255,0.82)] bg-[color:var(--surface-card)] shadow-[0_12px_28px_rgba(60, 40, 110, 0.12)] backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--brand-primary)]/12 text-[color:var(--brand-primary)]">
              <Check size={16} />
            </div>
            <div className="min-w-0 flex-1 text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
              {actionNotice}
            </div>
            <button
              type="button"
              onClick={clearLocalNotice}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)]"
              aria-label={t(msg`关闭提醒结果提示`)}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}
      {!shouldHideActiveReminder && activeReminder ? (
        <div className="pointer-events-auto overflow-hidden rounded-[var(--radius-xl)] border border-[rgba(255,255,255,0.82)] bg-[color:var(--state-warning-bg)] shadow-[0_18px_40px_rgba(60, 40, 110, 0.16)] backdrop-blur-xl">
          <div className="flex items-start gap-3 px-4 py-3.5">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--brand-primary)]/12 text-[color:var(--brand-primary)]">
              <BellRing size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-[length:var(--text-body)] font-medium text-[color:var(--text-primary)]">
                    {t(msg`消息提醒`)}
                  </div>
                  {remainingCount > 0 ? (
                    <div className="shrink-0 rounded-full bg-[color:var(--surface-secondary)] px-2 py-0.5 text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
                      {t(msg`还有 ${remainingCount} 条`)}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)]"
                  aria-label={t(msg`暂时关闭提醒浮条`)}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="mt-1 truncate text-[length:var(--text-caption)] font-medium text-[color:var(--text-secondary)]">
                <span>{activeReminder.title}</span>
                {activeReminderStatusLabel ? (
                  <span className="ml-2 rounded-full bg-[color:var(--surface-secondary)] px-2 py-0.5 text-[length:var(--text-eyebrow)] font-normal text-[color:var(--text-secondary)]">
                    {activeReminderStatusLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 line-clamp-2 text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]">
                {activeReminder.previewText}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
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
                      "rounded-full px-3 py-1.5 text-[length:var(--text-caption)] transition-colors",
                      getChatReminderActionTone(activeReminder) === "warning"
                        ? "border border-[color:var(--state-warning-bg)] bg-[color:var(--surface-card)] text-[color:var(--state-warning-text)]"
                        : "border border-transparent bg-[color:var(--surface-secondary)] text-[color:var(--text-secondary)]",
                    ].join(" ")}
                  >
                    {getChatReminderActionLabel(activeReminder)}
                  </button>
                  <button
                    type="button"
                    onClick={handleOpen}
                    className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-primary)] px-3 py-1.5 text-[length:var(--text-caption)] font-medium text-[color:var(--text-on-brand)]"
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
