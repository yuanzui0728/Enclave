import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
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
  ChevronDown,
  ChevronRight,
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
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";

import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { OfficialServiceConversationCard } from "../components/official-service-conversation-card";
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
import { useMessageReminders } from "../features/chat/use-message-reminders";
import { useChatReminderActions } from "../features/chat/use-chat-reminder-actions";
import { useChatReminderEntries } from "../features/chat/use-chat-reminder-entries";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  getConversationPreviewParts,
  getConversationVisibleLastMessage,
} from "../lib/conversation-preview";
import { isPersistedGroupConversation } from "../lib/conversation-route";
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

const SWIPE_ACTION_BUTTON_WIDTH = 72;
const HIDE_UNDO_WINDOW_MS = 5_000;

export function ChatListPage() {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopChatWorkspace />;
  }

  return <MobileChatListPage />;
}

function MobileChatListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    refetchInterval: 3_000,
  });
  const messageEntriesQuery = useQuery({
    queryKey: ["app-official-message-entries", baseUrl],
    queryFn: () => getOfficialAccountMessageEntries(baseUrl),
    refetchInterval: 3_000,
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
    void navigate({ to });
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
    <AppPage className="space-y-0 bg-[#ededed] px-0 py-0">
      {isQuickMenuOpen ? (
        <button
          type="button"
          aria-label="关闭快捷菜单"
          onClick={() => setIsQuickMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/5"
        />
      ) : null}

      <TabPageTopBar
        title="消息"
        className="z-40 space-y-3 overflow-visible border-b border-black/5 bg-[#ededed] px-3 pb-2.5 pt-2.5 text-[color:var(--text-primary)] shadow-none"
        titleAlign="center"
        titleClassName="text-[17px] font-medium tracking-normal"
        rightActions={
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsQuickMenuOpen((current) => !current)}
              className="h-10 w-10 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/5"
              aria-label="打开快捷菜单"
            >
              <Plus size={16} strokeWidth={2.4} />
            </Button>

            {isQuickMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.45rem)] z-40 w-44 overflow-hidden rounded-[14px] bg-[rgba(44,44,44,0.96)] p-1.5 shadow-[0_14px_40px_rgba(15,23,42,0.22)]">
                {quickActionItems.map((item) => {
                  const Icon = item.icon;

                  if (item.to && !item.disabled) {
                    const to = item.to;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleNavigate(to)}
                        className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/10"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-white">
                          <Icon size={16} />
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
                        "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                        item.disabled
                          ? "cursor-not-allowed opacity-55"
                          : "hover:bg-white/10",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white",
                          item.disabled ? "bg-white/6" : "bg-white/10",
                        )}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div>{item.label}</div>
                        {item.disabledLabel ? (
                          <div className="mt-0.5 text-[11px] text-white/65">
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
            void navigate({ to: "/tabs/search" });
          }}
          className="relative block w-full text-left"
          aria-label="打开搜一搜"
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <div className="h-9 w-full rounded-[10px] border border-black/6 bg-white pl-10 pr-4 text-sm leading-9 text-[color:var(--text-dim)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]">
            搜索
          </div>
        </button>
      </TabPageTopBar>

      <div className="pb-6">
        {pendingHideConversation ? (
          <div className="px-3 pt-3">
            <InlineNotice tone="info">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {pendingHideConversation.title} 已从列表移除，5 秒内可撤销。
                </span>
                <button
                  type="button"
                  onClick={handleUndoHideConversation}
                  className="shrink-0 font-medium text-[#07c160]"
                >
                  撤销
                </button>
              </div>
            </InlineNotice>
          </div>
        ) : notice ? (
          <div className="px-3 pt-3">
            <InlineNotice tone="info">{notice}</InlineNotice>
          </div>
        ) : null}
        {conversationsQuery.isLoading ? (
          <div className="px-3 pt-3">
            <LoadingBlock label="正在读取会话..." />
          </div>
        ) : null}
        {conversationsQuery.isError &&
        conversationsQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={conversationsQuery.error.message} />
          </div>
        ) : null}
        {messageEntriesQuery.isError &&
        messageEntriesQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={messageEntriesQuery.error.message} />
          </div>
        ) : null}
        {reminderEntries.length ? (
          <section className="mt-2 overflow-hidden border-y border-black/6 bg-white">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 text-[15px] font-medium text-[#111827]">
                <BellRing size={16} className="text-[#07c160]" />
                <span>消息提醒</span>
              </div>
              <div className="text-[12px] text-[#8c8c8c]">
                {filteredReminderSummary}
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
                        <div className="flex items-center justify-between bg-[#f7faf7] px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium",
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
                          <div className="flex items-center gap-2">
                            {isChatReminderGroupClearable(group.status) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleClearReminderGroup(
                                    group.status,
                                    group.entries.map(
                                      (entry) => entry.messageId,
                                    ),
                                  );
                                }}
                                className="rounded-full border border-transparent bg-[#f3f6f4] px-2.5 py-1 text-[11px] text-[#5f6b63] transition-colors hover:bg-[#e9eeeb]"
                              >
                                {getChatReminderGroupClearLabel(group.status)}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() =>
                                setIsNotifiedReminderGroupExpanded(
                                  (current) => !current,
                                )
                              }
                              className="flex items-center gap-1.5 text-[11px] text-[#8c8c8c]"
                              aria-expanded={!collapsed}
                            >
                              <span>{group.count} 条</span>
                              <span>{collapsed ? "展开" : "收起"}</span>
                              {collapsed ? (
                                <ChevronRight size={13} />
                              ) : (
                                <ChevronDown size={13} />
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-[#f7faf7] px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium",
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
                          <div className="text-[11px] text-[#8c8c8c]">
                            {group.count} 条
                          </div>
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
                                "flex items-center gap-3 px-4 py-3",
                                index > 0
                                  ? "border-t border-[color:var(--border-faint)]"
                                  : "",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => openReminder(entry)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
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
                                  <span className="min-w-0 truncate text-[14px] font-medium text-[#111827]">
                                    {entry.title}
                                  </span>
                                </div>
                                <div className="mt-1 truncate text-[13px] text-[#5f6368]">
                                  {entry.previewText}
                                </div>
                                <div className="mt-1 text-[12px] text-[#8c8c8c]">
                                  {formatReminderListTimestamp(
                                    entry.remindAt,
                                    entry.isDue,
                                    entry.notifiedAt,
                                  )}
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void completeReminder(entry);
                                }}
                                className={cn(
                                  "shrink-0 rounded-full px-3 py-1.5 text-[12px] transition-colors",
                                  getChatReminderActionTone(entry) === "warning"
                                    ? "border border-[#f1d5a6] bg-[#fff8ec] text-[#b76a08] hover:bg-[#fff1dc]"
                                    : "border border-transparent bg-[#f3f6f4] text-[#5f6b63] hover:bg-[#e9eeeb]",
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

        {!conversationsQuery.isLoading && !conversationsQuery.isError ? (
          hasConversations ? (
            <section className="mt-2 overflow-hidden border-y border-black/6 bg-white">
              {showSubscriptionInboxItem && subscriptionInboxSummary ? (
                <SubscriptionInboxCard
                  summary={subscriptionInboxSummary}
                  onClick={() => {
                    void navigate({ to: "/chat/subscription-inbox" });
                  }}
                />
              ) : null}

              {serviceConversations.map((conversation) => (
                <OfficialServiceConversationCard
                  key={conversation.accountId}
                  conversation={conversation}
                  onClick={() => {
                    void navigate({
                      to: "/official-accounts/service/$accountId",
                      params: { accountId: conversation.accountId },
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
            <div className="px-3 pt-8">
              <EmptyState
                title="消息列表还是空的"
                description="等角色和服务号开始发消息后，这里会出现会话。"
              />
            </div>
          )
        ) : null}
      </div>
    </AppPage>
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
  const [swipeOffset, setSwipeOffset] = useState(open ? -swipeActionWidth : 0);
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

  useEffect(() => {
    if (!gestureRef.current?.dragging) {
      setSwipeOffset(open ? -swipeActionWidth : 0);
    }
  }, [open, swipeActionWidth]);

  const handleTouchStart = (event: TouchEvent<HTMLAnchorElement>) => {
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

  const handleTouchMove = (event: TouchEvent<HTMLAnchorElement>) => {
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
      setSwipeOffset(open ? -swipeActionWidth : 0);
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
    setSwipeOffset(nextOffset);
  };

  const handleTouchEnd = () => {
    const gesture = gestureRef.current;
    if (!gesture) {
      return;
    }

    gestureRef.current = null;
    const shouldOpen = swipeOffset <= -swipeActionWidth / 2;
    setSwipeOffset(shouldOpen ? -swipeActionWidth : 0);
    onOpenChange(shouldOpen);
  };

  const content = (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        isPinned ? "bg-[#f2f2f2]" : "bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <AvatarChip name={conversation.title} size="wechat" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-normal text-[color:var(--text-primary)]">
              {conversation.title}
            </div>
            <div className="mt-1 truncate text-[13px] text-[color:var(--text-muted)]">
              {preview.prefix}
              {preview.text}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="text-[11px] text-[color:var(--text-dim)]">
              {formatConversationTimestamp(
                visibleLastMessage?.createdAt ??
                  conversation.lastMessage?.createdAt ??
                  conversation.updatedAt,
              )}
            </div>
            <div className="flex min-h-5 items-center gap-1.5">
              {conversation.isMuted ? (
                <BellOff
                  size={12}
                  className="text-[color:var(--text-dim)]"
                  aria-label="消息免打扰"
                />
              ) : null}
              {hasUnreadMessages ? (
                showMutedUnreadDot ? (
                  <div
                    className="h-2.5 w-2.5 rounded-full bg-[#b8b8b8]"
                    aria-label="有未读消息"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#fa5151] px-1.5 text-[11px] leading-none text-white shadow-[0_4px_12px_rgba(250,81,81,0.22)]",
                      conversation.unreadCount > 9 ? "min-w-6" : undefined,
                    )}
                  >
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </div>
                )
              ) : isPinned ? (
                <Pin
                  size={11}
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={(event) => {
        if (open || swipeOffset !== 0) {
          event.preventDefault();
          setSwipeOffset(0);
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={(event) => {
        if (open || swipeOffset !== 0) {
          event.preventDefault();
          setSwipeOffset(0);
          onOpenChange(false);
        }
      }}
    >
      {content}
    </Link>
  );

  return (
    <div className={cn("relative overflow-hidden bg-[#c7c7cc]", className)}>
      <div className="absolute inset-y-0 right-0 flex">
        <button
          type="button"
          onClick={onTogglePinned}
          className="flex w-[72px] items-center justify-center bg-[#c7c7cc] text-white"
        >
          <div className="flex flex-col items-center gap-1 text-[11px]">
            <Pin size={15} />
            <span>{conversation.isPinned ? "取消置顶" : "置顶"}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggleMuted}
          className="flex w-[72px] items-center justify-center bg-[#f59e0b] text-white"
        >
          <div className="flex flex-col items-center gap-1 text-[11px]">
            <BellOff size={15} />
            <span>{conversation.isMuted ? "取消免打扰" : "免打扰"}</span>
          </div>
        </button>
        {showReadAction ? (
          <button
            type="button"
            onClick={onToggleReadState}
            className="flex w-[72px] items-center justify-center bg-[#5b8efc] text-white"
          >
            <div className="flex flex-col items-center gap-1 text-[11px]">
              {conversation.unreadCount > 0 ? (
                <CheckCheck size={15} />
              ) : (
                <Circle size={15} />
              )}
              <span>{readActionLabel}</span>
            </div>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onHide}
          className="flex w-[72px] items-center justify-center bg-[#fa5151] text-white"
        >
          <div className="flex flex-col items-center gap-1 text-[11px]">
            <Trash2 size={15} />
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
