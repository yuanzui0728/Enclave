import {
  Suspense,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  getConversations,
  getOfficialAccountMessageEntries,
  hideConversation,
  hideGroup,
  markConversationRead,
  markConversationUnread,
  markGroupRead,
  markGroupUnread,
  setConversationMuted,
  setConversationPinned,
  setGroupPinned,
  updateGroupPreferences,
} from "@yinjie/contracts";
import {
  BellOff,
  BellRing,
  CheckCheck,
  Circle,
  Plus,
  Pin,
  QrCode,
  Search,
  Trash2,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";

import { AvatarChip } from "../components/avatar-chip";
import { OfficialServiceConversationCard } from "../components/official-service-conversation-card";
import { RouteRedirectState } from "../components/route-redirect-state";
import { SubscriptionInboxCard } from "../components/subscription-inbox-card";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useLocalChatMessageActionState } from "../features/chat/local-chat-message-actions";
import {
  getChatReminderActionLabel,
  getChatReminderActionTone,
  buildChatReminderNavigation,
  getChatReminderGroupClearErrorMessage,
  getChatReminderGroupClearLabel,
  getChatReminderGroupClearNotice,
  getChatReminderStatus,
  getChatReminderStatusLabel,
  isChatReminderGroupCollapsible,
  isChatReminderGroupClearable,
  formatReminderListTimestamp,
} from "../features/chat/chat-reminder-entries";
import {
  ChatReminderControlButton,
  ChatReminderCountText,
  ChatReminderMetaPill,
  ChatReminderSummaryText,
  ChatReminderToggleButton,
} from "../features/chat/chat-reminder-summary-text";
import {
  buildMobileOfficialRouteHash,
  parseMobileOfficialRouteState,
} from "../features/official-accounts/mobile-official-route-state";
import { buildMobileFriendRequestsRouteHash } from "../features/contacts/mobile-friend-requests-route-state";
import { buildSearchRouteHash } from "../features/search/search-route-state";
import { useMessageReminders } from "../features/chat/use-message-reminders";
import { useChatReminderActions } from "../features/chat/use-chat-reminder-actions";
import { useChatReminderEntries } from "../features/chat/use-chat-reminder-entries";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { normalizePathname } from "../lib/normalize-pathname";
import {
  getConversationPreviewParts,
  getConversationVisibleLastMessage,
} from "../lib/conversation-preview";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import { formatConversationTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type QuickActionItem = {
  key: string;
  label: string;
  icon: typeof Users;
  to?: "/group/new" | "/friend-requests";
  disabled?: boolean;
  disabledLabel?: string;
};

const quickActionItems: QuickActionItem[] = [
  {
    key: "create-group",
    label: "发起群聊",
    icon: Users,
    to: "/group/new",
  },
  {
    key: "add-friend",
    label: "添加朋友",
    icon: UserPlus,
    to: "/friend-requests",
  },
  {
    key: "scan",
    label: "扫一扫",
    icon: QrCode,
    disabled: true,
    disabledLabel: "暂未开放",
  },
  {
    key: "pay",
    label: "收付款",
    icon: WalletCards,
    disabled: true,
    disabledLabel: "暂未开放",
  },
];

type ConversationListEntry = Awaited<
  ReturnType<typeof getConversations>
>[number];
type PendingHideConversation = {
  conversationId: string;
  isGroup: boolean;
  title: string;
};

const SWIPE_ACTION_BUTTON_WIDTH = 68;
const HIDE_UNDO_WINDOW_MS = 5_000;
const DesktopChatWorkspace = lazy(async () => {
  const mod = await import("../features/chat/chat-tab-shell");
  return { default: mod.ChatTabShell };
});

export function ChatListPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const normalizedPathname = normalizePathname(pathname);
  const desktopPathMismatch = normalizedPathname !== "/tabs/chat";

  useEffect(() => {
    if (!isDesktopLayout || !desktopPathMismatch) {
      return;
    }

    void navigate({
      to: "/tabs/chat",
      hash: hash || undefined,
      replace: true,
    });
  }, [desktopPathMismatch, hash, isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在打开桌面消息"
            description="正在载入桌面消息工作区，马上显示最近会话。"
            loadingLabel="载入桌面消息工作区..."
          />
        }
      >
        <DesktopChatWorkspace hash={hash} />
      </Suspense>
    );
  }

  return <MobileChatListPage />;
}

function MobileChatListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const localMessageActionState = useLocalChatMessageActionState();
  const { reminders, clearReminder, clearReminders } = useMessageReminders();
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [isNotifiedReminderGroupExpanded, setIsNotifiedReminderGroupExpanded] =
    useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openSwipeConversationId, setOpenSwipeConversationId] = useState<
    string | null
  >(null);
  const [pendingHideConversation, setPendingHideConversation] =
    useState<PendingHideConversation | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const pendingHideRef = useRef<PendingHideConversation | null>(null);
  const normalizedPathname = normalizePathname(pathname);
  const isActiveTab = normalizedPathname === "/tabs/chat";
  const officialRouteState = useMemo(
    () => parseMobileOfficialRouteState(hash),
    [hash],
  );
  const currentOfficialRouteHash = useMemo(
    () =>
      buildMobileOfficialRouteHash({
        returnPath: officialRouteState.returnPath,
        returnHash: officialRouteState.returnHash,
      }),
    [officialRouteState.returnHash, officialRouteState.returnPath],
  );

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    refetchInterval: isActiveTab ? 3_000 : false,
  });
  const messageEntriesQuery = useQuery({
    queryKey: ["app-official-message-entries", baseUrl],
    queryFn: () => getOfficialAccountMessageEntries(baseUrl),
    refetchInterval: isActiveTab ? 3_000 : false,
  });

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );
  const { reminderEntries, filteredReminderGroups, filteredReminderSummary } =
    useChatReminderEntries({
      reminders,
      conversations,
    });
  const hasNotifiedReminderGroup = useMemo(
    () => filteredReminderGroups.some((group) => group.status === "notified"),
    [filteredReminderGroups],
  );
  const { openReminder, completeReminder } = useChatReminderActions({
    navigateToReminder: (entry) => {
      void navigate(buildChatReminderNavigation(entry));
    },
    onNoticeChange: setNotice,
    onCompleteReminder: clearReminder,
  });
  const visibleConversations = useMemo(
    () =>
      pendingHideConversation
        ? conversations.filter(
            (conversation) =>
              conversation.id !== pendingHideConversation.conversationId,
          )
        : conversations,
    [conversations, pendingHideConversation],
  );
  const subscriptionInboxSummary = messageEntriesQuery.data?.subscriptionInbox;
  const serviceConversations =
    messageEntriesQuery.data?.serviceConversations ?? [];
  const showSubscriptionInboxItem = Boolean(subscriptionInboxSummary);

  useEffect(() => {
    if (!hasNotifiedReminderGroup && isNotifiedReminderGroupExpanded) {
      setIsNotifiedReminderGroupExpanded(false);
    }
  }, [hasNotifiedReminderGroup, isNotifiedReminderGroupExpanded]);

  const hasConversations =
    reminderEntries.length > 0 ||
    visibleConversations.length > 0 ||
    serviceConversations.length > 0 ||
    showSubscriptionInboxItem;
  const hasConversationLoadError =
    conversationsQuery.isError && conversationsQuery.error instanceof Error;
  const hasMessageEntriesError =
    messageEntriesQuery.isError && messageEntriesQuery.error instanceof Error;

  const pinMutation = useMutation({
    mutationFn: async ({
      conversationId,
      pinned,
      isGroup,
    }: {
      conversationId: string;
      pinned: boolean;
      isGroup: boolean;
    }) =>
      isGroup
        ? setGroupPinned(conversationId, { pinned }, baseUrl)
        : setConversationPinned(conversationId, { pinned }, baseUrl),
    onSuccess: async (_, variables) => {
      setNotice(variables.pinned ? "聊天已置顶。" : "聊天已取消置顶。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, variables.conversationId],
        }),
      ]);
    },
  });
  const muteMutation = useMutation({
    mutationFn: async ({
      conversationId,
      muted,
      isGroup,
    }: {
      conversationId: string;
      muted: boolean;
      isGroup: boolean;
    }) =>
      isGroup
        ? updateGroupPreferences(conversationId, { isMuted: muted }, baseUrl)
        : setConversationMuted(conversationId, { muted }, baseUrl),
    onSuccess: async (_, variables) => {
      setNotice(variables.muted ? "已开启消息免打扰。" : "已关闭消息免打扰。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, variables.conversationId],
        }),
      ]);
    },
  });
  const readStateMutation = useMutation({
    mutationFn: async ({
      conversationId,
      action,
      isGroup,
    }: {
      conversationId: string;
      action: "read" | "unread";
      isGroup: boolean;
    }) =>
      isGroup
        ? action === "read"
          ? markGroupRead(conversationId, baseUrl)
          : markGroupUnread(conversationId, baseUrl)
        : action === "read"
          ? markConversationRead(conversationId, baseUrl)
          : markConversationUnread(conversationId, baseUrl),
    onSuccess: async (_, variables) => {
      setNotice(
        variables.action === "read" ? "已标记为已读。" : "已标记为未读。",
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, variables.conversationId],
        }),
      ]);
    },
  });

  const persistHiddenConversation = async (
    entry: PendingHideConversation,
    showSuccessNotice: boolean,
  ) => {
    try {
      if (entry.isGroup) {
        await hideGroup(entry.conversationId, baseUrl);
      } else {
        await hideConversation(entry.conversationId, baseUrl);
      }

      if (showSuccessNotice) {
        setNotice("聊天已从列表移除。");
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "聊天移除失败，请稍后再试。",
      );
    } finally {
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    }
  };

  const clearPendingHideTimer = () => {
    if (hideTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = null;
  };

  const commitPendingHideConversation = async (
    entry: PendingHideConversation,
    showSuccessNotice: boolean,
  ) => {
    clearPendingHideTimer();
    if (pendingHideRef.current?.conversationId === entry.conversationId) {
      pendingHideRef.current = null;
      setPendingHideConversation(null);
    }

    await persistHiddenConversation(entry, showSuccessNotice);
  };

  useEffect(() => {
    if (
      openSwipeConversationId &&
      !visibleConversations.some(
        (conversation) => conversation.id === openSwipeConversationId,
      )
    ) {
      setOpenSwipeConversationId(null);
    }
  }, [openSwipeConversationId, visibleConversations]);

  useEffect(() => {
    return () => {
      clearPendingHideTimer();

      const pending = pendingHideRef.current;
      pendingHideRef.current = null;
      if (!pending) {
        return;
      }

      void (
        pending.isGroup
          ? hideGroup(pending.conversationId, baseUrl)
          : hideConversation(pending.conversationId, baseUrl)
      ).finally(() => {
        void queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      });
    };
  }, [baseUrl, queryClient]);

  function handleNavigate(to: "/group/new" | "/friend-requests") {
    setIsQuickMenuOpen(false);
    setNotice(null);
    const nextHash =
      to === "/group/new"
        ? buildCreateGroupRouteHash({
            returnPath: pathname,
          })
        : buildMobileFriendRequestsRouteHash({
            returnPath: pathname,
          });
    void navigate({
      to,
      ...(nextHash ? { hash: nextHash } : {}),
    });
  }

  function openOfficialAccountsList() {
    setNotice(null);
    void navigate({
      to: "/contacts/official-accounts",
      hash: buildMobileOfficialRouteHash({
        returnPath: pathname,
        returnHash: currentOfficialRouteHash || undefined,
      }),
    });
  }

  function handleScheduleHideConversation(conversation: ConversationListEntry) {
    setOpenSwipeConversationId(null);
    setNotice(null);

    const currentPending = pendingHideRef.current;
    if (currentPending) {
      void commitPendingHideConversation(currentPending, false);
    }

    const nextPending: PendingHideConversation = {
      conversationId: conversation.id,
      isGroup: isPersistedGroupConversation(conversation),
      title: conversation.title,
    };

    pendingHideRef.current = nextPending;
    setPendingHideConversation(nextPending);
    hideTimeoutRef.current = window.setTimeout(() => {
      const latestPending = pendingHideRef.current;
      if (
        !latestPending ||
        latestPending.conversationId !== nextPending.conversationId
      ) {
        return;
      }

      void commitPendingHideConversation(nextPending, true);
    }, HIDE_UNDO_WINDOW_MS);
  }

  function handleUndoHideConversation() {
    clearPendingHideTimer();
    pendingHideRef.current = null;
    setPendingHideConversation(null);
    setNotice("已撤销删除。");
  }

  async function handleClearReminderGroup(
    status: "pending" | "due" | "notified",
    messageIds: string[],
  ) {
    if (!isChatReminderGroupClearable(status)) {
      return;
    }

    try {
      await clearReminders(messageIds);
      setNotice(getChatReminderGroupClearNotice(status, messageIds.length));
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : getChatReminderGroupClearErrorMessage(status),
      );
    }
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      {isQuickMenuOpen ? (
        <button
          type="button"
          aria-label="关闭快捷菜单"
          onClick={() => setIsQuickMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/[0.03]"
        />
      ) : null}

      <TabPageTopBar
        title="消息"
        className="z-40 mx-0 mt-0 space-y-1.5 overflow-visible border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none sm:mx-0"
        titleAlign="center"
        titleClassName="text-[17px] font-medium tracking-normal"
        rightActions={
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsQuickMenuOpen((current) => !current)}
              className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
              aria-label="打开快捷菜单"
            >
              <Plus size={15} strokeWidth={2.4} />
            </Button>

            {isQuickMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.3rem)] z-40 w-[10rem] overflow-hidden rounded-[11px] bg-[rgba(44,44,44,0.96)] p-1 shadow-[0_12px_32px_rgba(15,23,42,0.2)]">
                {quickActionItems.map((item) => {
                  const Icon = item.icon;

                  if (item.to && !item.disabled) {
                    const to = item.to;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleNavigate(to)}
                        className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[12px] text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/10 active:bg-white/12"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-white/10 text-white">
                          <Icon size={14} />
                        </div>
                        <span>{item.label}</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={item.key}
                      type="button"
                      disabled={item.disabled}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[12px] text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                        item.disabled
                          ? "cursor-not-allowed opacity-55"
                          : "hover:bg-white/10 active:bg-white/12",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-white",
                          item.disabled ? "bg-white/6" : "bg-white/10",
                        )}
                      >
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div>{item.label}</div>
                        {item.disabledLabel ? (
                          <div className="mt-0.5 text-[10px] text-white/62">
                            {item.disabledLabel}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        }
      >
        <button
          type="button"
          onClick={() => {
            void navigate({
              to: "/tabs/search",
              hash: buildSearchRouteHash({
                category: "all",
                keyword: "",
                source: "chat",
              }),
            });
          }}
          className="relative block w-full text-left"
          aria-label="打开搜一搜"
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <div className="h-7.5 w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] pl-9 pr-4 text-[12px] leading-[30px] text-[color:var(--text-dim)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]">
            搜索
          </div>
        </button>
      </TabPageTopBar>

      <div className="pb-6">
        {pendingHideConversation ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="info"
              className="rounded-[11px] border-[rgba(96,165,250,0.16)] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {pendingHideConversation.title} 已从列表移除，5 秒内可撤销。
                </span>
                <button
                  type="button"
                  onClick={handleUndoHideConversation}
                  className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#07c160]"
                >
                  撤销
                </button>
              </div>
            </InlineNotice>
          </div>
        ) : notice ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="info"
              className="rounded-[11px] border-[rgba(96,165,250,0.16)] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              {notice}
            </InlineNotice>
          </div>
        ) : null}
        {hasMessageEntriesError ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="danger"
              className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  订阅号与服务号入口暂时没有刷新成功。
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openOfficialAccountsList}
                    className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                  >
                    查看公众号
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void messageEntriesQuery.refetch();
                    }}
                    className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                  >
                    重试读取
                  </button>
                </div>
              </div>
            </InlineNotice>
          </div>
        ) : null}
        {conversationsQuery.isLoading ? (
          <div className="px-3 pt-2">
            <MobileChatListStatusCard
              badge="读取中"
              title="正在刷新消息列表"
              description="稍等一下，正在同步最近会话和消息入口。"
              tone="loading"
            />
          </div>
        ) : null}
        {hasConversationLoadError ? (
          <div className="px-3 pt-2">
            <MobileChatListStatusCard
              badge="读取失败"
              title="消息页暂时不可用"
              description={conversationsQuery.error.message}
              tone="danger"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void conversationsQuery.refetch();
                    void messageEntriesQuery.refetch();
                  }}
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                >
                  重试读取
                </Button>
              }
            />
          </div>
        ) : null}
        {reminderEntries.length ? (
          <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            <div className="flex items-center justify-between px-4 py-1.25">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#111827]">
                <BellRing size={13} className="text-[#07c160]" />
                <span>消息提醒</span>
              </div>
              <div className="text-[8px] text-[#8f9992]">
                <ChatReminderSummaryText
                  summary={filteredReminderSummary}
                  className="opacity-80"
                />
              </div>
            </div>
            {filteredReminderGroups.map((group, groupIndex) => (
              <div
                key={group.status}
                className={cn(
                  groupIndex > 0
                    ? "border-t border-[color:var(--border-faint)]"
                    : "",
                )}
              >
                {(() => {
                  const collapsible = isChatReminderGroupCollapsible(
                    group.status,
                  );
                  const collapsed =
                    collapsible && !isNotifiedReminderGroupExpanded;

                  return (
                    <>
                      {collapsible ? (
                        <div className="flex items-center justify-between bg-[color:var(--surface-panel)] px-4 py-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[8px] font-medium",
                                group.status === "notified"
                                  ? "bg-[#fff7e6] text-[#d48806]"
                                  : group.status === "due"
                                    ? "bg-[#fff1f0] text-[#d74b45]"
                                    : "bg-[#eaf8ef] text-[#07c160]",
                              )}
                            >
                              {group.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isChatReminderGroupClearable(group.status) ? (
                              <ChatReminderControlButton
                                onClick={() => {
                                  void handleClearReminderGroup(
                                    group.status,
                                    group.entries.map(
                                      (entry) => entry.messageId,
                                    ),
                                  );
                                }}
                                className="px-2 py-0.5 text-[8px] text-[#7b847e]"
                              >
                                {getChatReminderGroupClearLabel(group.status)}
                              </ChatReminderControlButton>
                            ) : null}
                            <ChatReminderToggleButton
                              onClick={() =>
                                setIsNotifiedReminderGroupExpanded(
                                  (current) => !current,
                                )
                              }
                              className="px-2 py-0.5 text-[8px] text-[#8f9992]"
                              aria-label={
                                collapsed ? "展开已通知提醒" : "收起已通知提醒"
                              }
                              aria-expanded={!collapsed}
                              collapsed={collapsed}
                              count={group.count}
                              iconSize={12}
                              iconClassName="opacity-75"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-[color:var(--surface-panel)] px-4 py-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[8px] font-medium",
                                group.status === "notified"
                                  ? "bg-[#fff7e6] text-[#d48806]"
                                  : group.status === "due"
                                    ? "bg-[#fff1f0] text-[#d74b45]"
                                    : "bg-[#eaf8ef] text-[#07c160]",
                              )}
                            >
                              {group.title}
                            </span>
                          </div>
                          <ChatReminderMetaPill className="px-1.5 py-0.5 text-[8px] text-[#8f9992]">
                            <ChatReminderCountText count={group.count} />
                          </ChatReminderMetaPill>
                        </div>
                      )}
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                          collapsed
                            ? "grid-rows-[0fr] opacity-0"
                            : "grid-rows-[1fr] opacity-100",
                        )}
                      >
                        <div className="overflow-hidden">
                          {group.entries.map((entry, index) => (
                            <div
                              key={entry.messageId}
                              className={cn(
                                "flex items-center gap-1.5 px-4 py-1.25",
                                index > 0
                                  ? "border-t border-[color:var(--border-faint)]"
                                  : "",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => openReminder(entry)}
                                className="min-w-0 flex-1 text-left leading-tight"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "rounded-full px-1.5 py-[1px] text-[7px] font-medium",
                                      getChatReminderStatus(entry) ===
                                        "notified"
                                        ? "bg-[#fff7e6] text-[#d48806]"
                                        : entry.isDue
                                          ? "bg-[#fff1f0] text-[#d74b45]"
                                          : "bg-[#eaf8ef] text-[#07c160]",
                                    )}
                                  >
                                    {getChatReminderStatusLabel(entry)}
                                  </span>
                                  <span className="min-w-0 truncate text-[9.5px] font-medium text-[#111827]">
                                    {entry.title}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[#8c8c8c]">
                                  <span className="min-w-0 flex-1 truncate text-[8px] leading-[1.35] text-[#5f6368]">
                                    {entry.previewText}
                                  </span>
                                  <span className="shrink-0 text-[7px]">
                                    {formatReminderListTimestamp(
                                      entry.remindAt,
                                      entry.isDue,
                                      entry.notifiedAt,
                                    )}
                                  </span>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void completeReminder(entry);
                                }}
                                className={cn(
                                  "shrink-0 self-center rounded-full px-1.5 py-0.5 text-[7px] leading-none transition-colors",
                                  getChatReminderActionTone(entry) === "warning"
                                    ? "border border-[#f3ddba] bg-[#fff9ef] text-[#ba740f] hover:bg-[#fff2df]"
                                    : "border border-transparent bg-[#f5f7f5] text-[#6b736d] hover:bg-[#edf1ee]",
                                )}
                              >
                                {getChatReminderActionLabel(entry)}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </section>
        ) : null}

        {!conversationsQuery.isLoading && !hasConversationLoadError ? (
          hasConversations ? (
            <section className="mt-1.5 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
              {showSubscriptionInboxItem && subscriptionInboxSummary ? (
                <SubscriptionInboxCard
                  summary={subscriptionInboxSummary}
                  onClick={() => {
                    void navigate({
                      to: "/chat/subscription-inbox",
                      hash: buildMobileOfficialRouteHash({
                        returnPath: pathname,
                        returnHash: currentOfficialRouteHash || undefined,
                      }),
                    });
                  }}
                />
              ) : null}

              {serviceConversations.map((conversation, index) => (
                <OfficialServiceConversationCard
                  key={conversation.accountId}
                  conversation={conversation}
                  className={
                    showSubscriptionInboxItem || index > 0
                      ? "border-t border-[color:var(--border-faint)]"
                      : undefined
                  }
                  onClick={() => {
                    void navigate({
                      to: "/official-accounts/service/$accountId",
                      params: { accountId: conversation.accountId },
                      hash: buildMobileOfficialRouteHash({
                        returnPath: pathname,
                        returnHash: currentOfficialRouteHash || undefined,
                      }),
                    });
                  }}
                />
              ))}

              {visibleConversations.map((conversation, index) => (
                <ConversationListItemLink
                  key={conversation.id}
                  conversation={conversation}
                  localMessageActionState={localMessageActionState}
                  open={openSwipeConversationId === conversation.id}
                  pending={
                    (pinMutation.isPending &&
                      pinMutation.variables?.conversationId ===
                        conversation.id) ||
                    (muteMutation.isPending &&
                      muteMutation.variables?.conversationId ===
                        conversation.id) ||
                    (readStateMutation.isPending &&
                      readStateMutation.variables?.conversationId ===
                        conversation.id)
                  }
                  onOpenChange={(nextOpen) => {
                    setOpenSwipeConversationId(
                      nextOpen ? conversation.id : null,
                    );
                  }}
                  onTogglePinned={() => {
                    setOpenSwipeConversationId(null);
                    pinMutation.mutate({
                      conversationId: conversation.id,
                      pinned: !conversation.isPinned,
                      isGroup: isPersistedGroupConversation(conversation),
                    });
                  }}
                  onToggleMuted={() => {
                    setOpenSwipeConversationId(null);
                    muteMutation.mutate({
                      conversationId: conversation.id,
                      muted: !conversation.isMuted,
                      isGroup: isPersistedGroupConversation(conversation),
                    });
                  }}
                  onToggleReadState={
                    conversation.unreadCount > 0 ||
                    canConversationBeMarkedUnread(conversation)
                      ? () => {
                          setOpenSwipeConversationId(null);
                          readStateMutation.mutate({
                            conversationId: conversation.id,
                            action:
                              conversation.unreadCount > 0 ? "read" : "unread",
                            isGroup: isPersistedGroupConversation(conversation),
                          });
                        }
                      : undefined
                  }
                  onHide={() => {
                    handleScheduleHideConversation(conversation);
                  }}
                  className={cn(
                    "transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                    index > 0 ||
                      showSubscriptionInboxItem ||
                      serviceConversations.length > 0
                      ? "border-t border-[color:var(--border-faint)]"
                      : undefined,
                  )}
                />
              ))}
            </section>
          ) : (
            <div className="px-3 pt-2">
              <MobileChatListStatusCard
                badge="消息"
                title="还没有新消息"
                description="等角色、群聊或服务号开始发消息后，这里会显示最近会话。"
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void navigate({ to: "/tabs/contacts" });
                    }}
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  >
                    去通讯录看看
                  </Button>
                }
              />
            </div>
          )
        ) : null}
      </div>
    </AppPage>
  );
}

function MobileChatListStatusCard({
  badge,
  title,
  description,
  tone = "default",
  action,
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
  action?: ReactNode;
}) {
  const loading = tone === "loading";

  return (
    <section
      className={cn(
        "rounded-[18px] border px-4 py-5 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2.5 py-1 text-[9px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {loading ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-3 text-[15px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-2 max-w-[18rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}

function ConversationListItemLink({
  conversation,
  localMessageActionState,
  open,
  pending = false,
  onOpenChange,
  onTogglePinned,
  onToggleMuted,
  onToggleReadState,
  onHide,
  className,
}: {
  conversation: ConversationListEntry;
  localMessageActionState: ReturnType<typeof useLocalChatMessageActionState>;
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onTogglePinned: () => void;
  onToggleMuted: () => void;
  onToggleReadState?: () => void;
  onHide: () => void;
  className?: string;
}) {
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    initialOffset: number;
    dragging: boolean;
  } | null>(null);
  const showReadAction =
    conversation.unreadCount > 0 || canConversationBeMarkedUnread(conversation);
  const swipeActionWidth = (showReadAction ? 4 : 3) * SWIPE_ACTION_BUTTON_WIDTH;
  const readActionLabel = conversation.unreadCount > 0 ? "标已读" : "标未读";
  const muteActionClassName = conversation.isMuted
    ? "bg-[#07c160]"
    : "bg-[#9aa0a6]";
  const [swipeOffset, setSwipeOffset] = useState(open ? -swipeActionWidth : 0);
  const swipeOffsetRef = useRef(swipeOffset);
  const hasUnreadMessages = conversation.unreadCount > 0;
  const isPinned = conversation.isPinned;
  const isGroupConversation = isPersistedGroupConversation(conversation);
  const showMutedUnreadDot = conversation.isMuted && hasUnreadMessages;
  const visibleLastMessage = getConversationVisibleLastMessage(
    conversation,
    localMessageActionState,
  );
  const preview = getConversationPreviewParts(
    conversation,
    localMessageActionState,
    {
      emptyText: "从这里开始第一句问候",
    },
  );

  const updateSwipeOffset = (nextOffset: number) => {
    swipeOffsetRef.current = nextOffset;
    setSwipeOffset(nextOffset);
  };

  useEffect(() => {
    if (!gestureRef.current?.dragging) {
      const nextOffset = open ? -swipeActionWidth : 0;
      swipeOffsetRef.current = nextOffset;
      setSwipeOffset(nextOffset);
    }
  }, [open, swipeActionWidth]);

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (pending) {
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    gestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      initialOffset: open ? -swipeActionWidth : 0,
      dragging: true,
    };
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture?.dragging) {
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (Math.abs(deltaY) > 14 && Math.abs(deltaY) > Math.abs(deltaX)) {
      gestureRef.current = null;
      updateSwipeOffset(open ? -swipeActionWidth : 0);
      return;
    }

    const nextOffset = clamp(
      gesture.initialOffset + deltaX,
      -swipeActionWidth,
      0,
    );
    if (Math.abs(deltaX) > 6) {
      event.preventDefault();
    }
    updateSwipeOffset(nextOffset);
  };

  const handleTouchEnd = () => {
    const gesture = gestureRef.current;
    if (!gesture) {
      return;
    }

    gestureRef.current = null;
    const shouldOpen = swipeOffsetRef.current <= -swipeActionWidth / 2;
    updateSwipeOffset(shouldOpen ? -swipeActionWidth : 0);
    onOpenChange(shouldOpen);
  };

  const content = (
    <div
      className={cn(
        "flex items-center gap-2.5 px-4 py-2.5",
        isPinned
          ? "bg-[color:var(--surface-panel)]"
          : "bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <AvatarChip
        name={conversation.title}
        src={conversation.avatar}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-normal leading-[1.25] text-[color:var(--text-primary)]">
              {conversation.title}
            </div>
            <div className="mt-0.5 truncate text-[11px] leading-[1.35] text-[color:var(--text-muted)]">
              {preview.prefix}
              {preview.text}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <div className="text-[9px] text-[color:var(--text-dim)]">
              {formatConversationTimestamp(
                visibleLastMessage?.createdAt ??
                  conversation.lastMessage?.createdAt ??
                  conversation.updatedAt,
              )}
            </div>
            <div className="flex min-h-[18px] items-center gap-1">
              {conversation.isMuted ? (
                <BellOff
                  size={11}
                  className="text-[color:var(--text-dim)]"
                  aria-label="消息免打扰"
                />
              ) : null}
              {hasUnreadMessages ? (
                showMutedUnreadDot ? (
                  <div
                    className="h-2 w-2 rounded-full bg-[#b8b8b8]"
                    aria-label="有未读消息"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#fa5151] px-1 text-[9px] leading-none text-white shadow-[0_4px_12px_rgba(250,81,81,0.18)]",
                      conversation.unreadCount > 9 ? "min-w-[22px]" : undefined,
                    )}
                  >
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </div>
                )
              ) : isPinned ? (
                <Pin
                  size={10}
                  className="text-[color:var(--text-dim)]"
                  aria-label="置顶聊天"
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const linkClassName = cn(
    "relative block transition-transform duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
    pending ? "pointer-events-none opacity-70" : "",
  );

  const contentLink = isGroupConversation ? (
    <Link
      to="/group/$groupId"
      params={{ groupId: conversation.id }}
      search={{}}
      className={linkClassName}
      style={{ transform: `translateX(${swipeOffset}px)` }}
      onClick={(event) => {
        if (open || swipeOffset !== 0) {
          event.preventDefault();
          updateSwipeOffset(0);
          onOpenChange(false);
        }
      }}
    >
      {content}
    </Link>
  ) : (
    <Link
      to="/chat/$conversationId"
      params={{ conversationId: conversation.id }}
      search={{}}
      className={linkClassName}
      style={{ transform: `translateX(${swipeOffset}px)` }}
      onClick={(event) => {
        if (open || swipeOffset !== 0) {
          event.preventDefault();
          updateSwipeOffset(0);
          onOpenChange(false);
        }
      }}
    >
      {content}
    </Link>
  );

  return (
    <div
      className={cn("relative overflow-hidden bg-[#c4c7cc]", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className="absolute inset-y-0 right-0 flex">
        <button
          type="button"
          onClick={onTogglePinned}
          className="flex w-[68px] items-center justify-center bg-[#c4c7cc] text-white active:brightness-[0.96]"
        >
          <div className="flex flex-col items-center gap-0.5 text-[9px]">
            <Pin size={13} />
            <span>{conversation.isPinned ? "取消置顶" : "置顶"}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggleMuted}
          className={cn(
            "flex w-[68px] items-center justify-center text-white active:brightness-[0.96]",
            muteActionClassName,
          )}
        >
          <div className="flex flex-col items-center gap-0.5 text-[9px]">
            <BellOff size={13} />
            <span>{conversation.isMuted ? "取消免打扰" : "免打扰"}</span>
          </div>
        </button>
        {showReadAction ? (
          <button
            type="button"
            onClick={onToggleReadState}
            className="flex w-[68px] items-center justify-center bg-[#5b8efc] text-white active:brightness-[0.96]"
          >
            <div className="flex flex-col items-center gap-0.5 text-[9px]">
              {conversation.unreadCount > 0 ? (
                <CheckCheck size={13} />
              ) : (
                <Circle size={13} />
              )}
              <span>{readActionLabel}</span>
            </div>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onHide}
          className="flex w-[68px] items-center justify-center bg-[#fa5151] text-white active:brightness-[0.96]"
        >
          <div className="flex flex-col items-center gap-0.5 text-[9px]">
            <Trash2 size={13} />
            <span>删除</span>
          </div>
        </button>
      </div>
      {contentLink}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function canConversationBeMarkedUnread(conversation: ConversationListEntry) {
  return (
    conversation.unreadCount === 0 &&
    conversation.lastMessage?.senderType === "character"
  );
}
