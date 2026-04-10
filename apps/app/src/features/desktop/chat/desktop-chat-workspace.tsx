import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BellOff,
  BellRing,
  FileText,
  Plus,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import {
  clearConversationHistory,
  clearGroupMessages,
  getBlockedCharacters,
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
  type ConversationListItem,
} from "@yinjie/contracts";
import {
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import { OfficialServiceConversationCard } from "../../../components/official-service-conversation-card";
import { SubscriptionInboxCard } from "../../../components/subscription-inbox-card";
import { DesktopSubscriptionWorkspace } from "../official-accounts/desktop-subscription-workspace";
import { OfficialAccountServiceThread } from "../../official-accounts/service/official-account-service-thread";
import {
  buildChatReminderEntries,
  filterChatReminderEntries,
  formatReminderListTimestamp,
  type ChatReminderEntry,
} from "../../chat/chat-reminder-entries";
import { buildSearchRouteHash } from "../../search/search-route-state";
import {
  removeLocalChatMessageReminder,
  useLocalChatMessageActionState,
} from "../../chat/local-chat-message-actions";
import {
  splitChatTextSegments,
  summarizeChatMentions,
} from "../../../lib/chat-text";
import {
  getConversationPreviewParts,
  getConversationVisibleLastMessage,
} from "../../../lib/conversation-preview";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { formatConversationTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";
import {
  ConversationThreadPanel,
  type ChatRouteContextNotice,
} from "../../chat/conversation-thread-panel";
import GroupChatThreadPanel from "../../chat/group-chat-thread-panel-view";
import {
  type DesktopChatCallKind,
  type DesktopChatSidePanelMode,
} from "./desktop-chat-header-actions";
import { DesktopConversationContextMenu } from "./desktop-conversation-context-menu";
import { DesktopChatSidePanel } from "./desktop-chat-side-panel";
import { DesktopChatDetailsPanel } from "./desktop-chat-details-panel";
import { DesktopChatHistoryPanel } from "./desktop-chat-history-panel";
import { buildDesktopMobileCallHandoffHash } from "./desktop-mobile-call-handoff-route-state";
import { createDesktopNote } from "./desktop-notes-storage";

type DesktopChatWorkspaceProps = {
  selectedConversationId?: string;
  selectedServiceAccountId?: string;
  highlightedMessageId?: string;
  routeContextNotice?: ChatRouteContextNotice;
  selectedSpecialView?: "subscription-inbox";
};

type DesktopQuickActionItem = {
  key: string;
  label: string;
  icon: typeof Users;
};

const desktopQuickActionItems: DesktopQuickActionItem[] = [
  {
    key: "create-group",
    label: "发起群聊",
    icon: Users,
  },
  {
    key: "add-friend",
    label: "添加朋友",
    icon: UserPlus,
  },
  {
    key: "create-note",
    label: "新建笔记",
    icon: FileText,
  },
];

export function DesktopChatWorkspace({
  selectedConversationId,
  selectedServiceAccountId,
  highlightedMessageId,
  routeContextNotice,
  selectedSpecialView,
}: DesktopChatWorkspaceProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const localMessageActionState = useLocalChatMessageActionState();
  const [searchTerm, setSearchTerm] = useState("");
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [rightPanelMode, setRightPanelMode] =
    useState<DesktopChatSidePanelMode>(null);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conversationContextMenu, setConversationContextMenu] = useState<{
    conversation: ConversationListItem;
    x: number;
    y: number;
  } | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(ownerId),
    refetchInterval: 3_000,
  });
  const messageEntriesQuery = useQuery({
    queryKey: ["app-official-message-entries", baseUrl],
    queryFn: () => getOfficialAccountMessageEntries(baseUrl),
    enabled: Boolean(ownerId),
    refetchInterval: 3_000,
  });

  const blockedQuery = useQuery({
    queryKey: ["app-chat-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );

  const conversations = useMemo(
    () =>
      (conversationsQuery.data ?? []).filter(
        (conversation) =>
          isPersistedGroupConversation(conversation) ||
          !conversation.participants.some((id) => blockedCharacterIds.has(id)),
      ),
    [blockedCharacterIds, conversationsQuery.data],
  );

  const filteredConversations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const title = conversation.title.toLowerCase();
      const preview = getConversationPreviewParts(
        conversation,
        localMessageActionState,
      ).text.toLowerCase();
      return title.includes(keyword) || preview.includes(keyword);
    });
  }, [conversations, localMessageActionState, searchTerm]);
  const reminderEntries = useMemo(
    () =>
      buildChatReminderEntries(
        localMessageActionState.reminders,
        conversations,
        nowTimestamp,
      ),
    [conversations, localMessageActionState.reminders, nowTimestamp],
  );
  const filteredReminderEntries = useMemo(
    () => filterChatReminderEntries(reminderEntries, searchTerm),
    [reminderEntries, searchTerm],
  );
  const dueReminderCount = useMemo(
    () => filteredReminderEntries.filter((item) => item.isDue).length,
    [filteredReminderEntries],
  );
  const subscriptionInboxSummary = messageEntriesQuery.data?.subscriptionInbox;
  const serviceConversations = useMemo(
    () => messageEntriesQuery.data?.serviceConversations ?? [],
    [messageEntriesQuery.data?.serviceConversations],
  );
  const subscriptionInboxActive = selectedSpecialView === "subscription-inbox";
  const serviceConversationActive = Boolean(selectedServiceAccountId);
  const showSubscriptionInboxItem = useMemo(() => {
    if (!subscriptionInboxSummary) {
      return false;
    }

    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return true;
    }

    return (
      "订阅号消息".includes(keyword) ||
      (subscriptionInboxSummary.preview ?? "").toLowerCase().includes(keyword)
    );
  }, [searchTerm, subscriptionInboxSummary]);
  const filteredServiceConversations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return serviceConversations;
    }

    return serviceConversations.filter((conversation) => {
      return (
        conversation.account.name.toLowerCase().includes(keyword) ||
        (conversation.preview ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [searchTerm, serviceConversations]);

  const activeConversation = useMemo(() => {
    if (subscriptionInboxActive || serviceConversationActive) {
      return null;
    }

    if (!filteredConversations.length) {
      return null;
    }

    if (selectedConversationId) {
      return (
        filteredConversations.find(
          (conversation) => conversation.id === selectedConversationId,
        ) ?? filteredConversations[0]
      );
    }

    return filteredConversations[0];
  }, [
    filteredConversations,
    selectedConversationId,
    serviceConversationActive,
    subscriptionInboxActive,
  ]);

  useEffect(() => {
    if (
      !activeConversation ||
      subscriptionInboxActive ||
      serviceConversationActive
    ) {
      setRightPanelMode(null);
    }
  }, [activeConversation, serviceConversationActive, subscriptionInboxActive]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!reminderEntries.length) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [reminderEntries.length]);

  useEffect(() => {
    if (!conversationContextMenu) {
      return;
    }

    const closeMenu = () => setConversationContextMenu(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [conversationContextMenu]);

  const conversationActionMutation = useMutation({
    mutationFn: async ({
      action,
      conversation,
    }: {
      action: "pin" | "mute" | "read" | "unread" | "hide" | "clear";
      conversation: ConversationListItem;
    }) => {
      if (isPersistedGroupConversation(conversation)) {
        switch (action) {
          case "pin":
            return setGroupPinned(
              conversation.id,
              { pinned: !conversation.isPinned },
              baseUrl,
            );
          case "mute":
            return updateGroupPreferences(
              conversation.id,
              { isMuted: !conversation.isMuted },
              baseUrl,
            );
          case "read":
            return markGroupRead(conversation.id, baseUrl);
          case "unread":
            return markGroupUnread(conversation.id, baseUrl);
          case "hide":
            return hideGroup(conversation.id, baseUrl);
          case "clear":
            return clearGroupMessages(conversation.id, baseUrl);
        }
      }

      switch (action) {
        case "pin":
          return setConversationPinned(
            conversation.id,
            { pinned: !conversation.isPinned },
            baseUrl,
          );
        case "mute":
          return setConversationMuted(
            conversation.id,
            { muted: !conversation.isMuted },
            baseUrl,
          );
        case "read":
          return markConversationRead(conversation.id, baseUrl);
        case "unread":
          return markConversationUnread(conversation.id, baseUrl);
        case "hide":
          return hideConversation(conversation.id, baseUrl);
        case "clear":
          return clearConversationHistory(conversation.id, baseUrl);
      }
    },
    onSuccess: async (_, variables) => {
      const { action, conversation } = variables;
      const isGroupConversation = isPersistedGroupConversation(conversation);

      setConversationContextMenu(null);
      setNotice(buildConversationActionNotice(action, conversation));

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        isGroupConversation
          ? queryClient.invalidateQueries({
              queryKey: ["app-group", baseUrl, conversation.id],
            })
          : Promise.resolve(),
        action === "clear" && isGroupConversation
          ? queryClient.invalidateQueries({
              queryKey: ["app-group-messages", baseUrl, conversation.id],
            })
          : Promise.resolve(),
        action === "clear" && !isGroupConversation
          ? queryClient.invalidateQueries({
              queryKey: ["app-conversation-messages", baseUrl, conversation.id],
            })
          : Promise.resolve(),
      ]);

      if (
        action === "hide" &&
        (selectedConversationId === conversation.id ||
          activeConversation?.id === conversation.id)
      ) {
        setRightPanelMode(null);
        void navigate({ to: "/tabs/chat" });
      }
    },
    onError: (error) => {
      setConversationContextMenu(null);
      setNotice(error instanceof Error ? error.message : "会话操作失败。");
    },
  });

  function handleQuickAction(key: DesktopQuickActionItem["key"]) {
    setIsQuickMenuOpen(false);
    setNotice(null);

    if (key === "create-group") {
      void navigate({ to: "/group/new" });
      return;
    }

    if (key === "add-friend") {
      void navigate({ to: "/friend-requests" });
      return;
    }

    const note = createDesktopNote();
    void navigate({ to: "/notes", hash: note.id });
  }

  function handleToggleSidePanel(
    mode: Exclude<DesktopChatSidePanelMode, null>,
  ) {
    setRightPanelMode((current) => (current === mode ? null : mode));
  }

  function openDesktopSearch(keyword = searchTerm) {
    void navigate({
      to: "/tabs/search",
      hash: buildSearchRouteHash({
        category: "all",
        keyword,
      }),
    });
  }

  function handleSearchFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    openDesktopSearch();
  }

  function handleDesktopCallAction(kind: DesktopChatCallKind) {
    if (!activeConversation) {
      setNotice("当前会话暂时不可用，请回到消息列表再试一次。");
      return;
    }

    void navigate({
      to: "/desktop/mobile",
      hash: buildDesktopMobileCallHandoffHash({
        kind,
        conversationId: activeConversation.id,
        conversationType: isPersistedGroupConversation(activeConversation)
          ? "group"
          : "direct",
        title: activeConversation.title,
      }),
    });
  }

  function handleConversationContextMenu(
    event: MouseEvent<HTMLElement>,
    conversation: ConversationListItem,
  ) {
    event.preventDefault();
    setConversationContextMenu({
      conversation,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleOpenReminder(entry: ChatReminderEntry) {
    setNotice(null);

    if (entry.threadType === "group") {
      void navigate({
        to: "/group/$groupId",
        params: { groupId: entry.threadId },
        hash: `chat-message-${entry.messageId}`,
      });
      return;
    }

    void navigate({
      to: "/chat/$conversationId",
      params: { conversationId: entry.threadId },
      hash: `chat-message-${entry.messageId}`,
    });
  }

  function handleDismissReminder(messageId: string) {
    removeLocalChatMessageReminder(messageId);
    setNotice("已移除消息提醒。");
  }

  return (
    <div className="relative flex h-full min-h-0">
      {isQuickMenuOpen ? (
        <button
          type="button"
          aria-label="关闭快捷菜单"
          onClick={() => setIsQuickMenuOpen(false)}
          className="absolute inset-0 z-10 cursor-default"
        />
      ) : null}

      <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[#f5f5f5]">
        <div className="border-b border-[color:var(--border-faint)] bg-[#f7f7f7] px-4 py-4">
          <div className="relative z-20 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <TextField
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={handleSearchFieldKeyDown}
                placeholder="搜索"
                className="flex-1 rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] py-2.5 pl-4 pr-12 shadow-none hover:bg-white focus:shadow-none"
              />
              <button
                type="button"
                onClick={() => openDesktopSearch()}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--text-dim)] transition hover:bg-white hover:text-[color:var(--text-primary)]"
                aria-label="在搜一搜中搜索"
                title="回车或点击进入搜一搜"
              >
                <Search size={16} />
              </button>
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsQuickMenuOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)] transition hover:bg-white"
                aria-label="打开快捷菜单"
              >
                <Plus size={18} strokeWidth={2.2} />
              </button>

              {isQuickMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-44 overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.6)] bg-[rgba(44,44,44,0.96)] p-1.5 shadow-[0_14px_40px_rgba(15,23,42,0.22)]">
                  {desktopQuickActionItems.map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleQuickAction(item.key)}
                        className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/10"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-white">
                          <Icon size={16} />
                        </div>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
          {notice ? (
            <InlineNotice className="mt-3 text-xs" tone="info">
              {notice}
            </InlineNotice>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {conversationsQuery.isLoading ? (
            <LoadingBlock label="正在读取会话..." />
          ) : null}
          {conversationsQuery.isError &&
          conversationsQuery.error instanceof Error ? (
            <ErrorBlock message={conversationsQuery.error.message} />
          ) : null}
          {messageEntriesQuery.isError &&
          messageEntriesQuery.error instanceof Error ? (
            <ErrorBlock message={messageEntriesQuery.error.message} />
          ) : null}
          {blockedQuery.isError && blockedQuery.error instanceof Error ? (
            <ErrorBlock message={blockedQuery.error.message} />
          ) : null}

          <div className="space-y-1.5">
            {filteredReminderEntries.length ? (
              <section className="overflow-hidden rounded-[18px] border border-[#dcefe3] bg-[linear-gradient(145deg,rgba(238,248,241,0.96),rgba(255,255,255,0.98))] p-2 shadow-[0_10px_24px_rgba(7,193,96,0.08)]">
                <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eaf8ef] text-[#07c160]">
                      <BellRing size={14} />
                    </div>
                    <span>消息提醒</span>
                  </div>
                  <div className="text-[11px] text-[color:var(--text-dim)]">
                    {dueReminderCount > 0
                      ? `${dueReminderCount} 条已到时间`
                      : `${filteredReminderEntries.length} 条待提醒`}
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  {filteredReminderEntries.map((entry) => (
                    <DesktopReminderCard
                      key={entry.messageId}
                      entry={entry}
                      active={
                        entry.threadId === selectedConversationId &&
                        entry.messageId === highlightedMessageId
                      }
                      onOpen={handleOpenReminder}
                      onDismiss={handleDismissReminder}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {showSubscriptionInboxItem && subscriptionInboxSummary ? (
              <SubscriptionInboxCard
                summary={subscriptionInboxSummary}
                variant="desktop"
                active={subscriptionInboxActive}
                onClick={() => {
                  void navigate({ to: "/chat/subscription-inbox" });
                }}
              />
            ) : null}

            {filteredServiceConversations.map((conversation) => (
              <OfficialServiceConversationCard
                key={conversation.accountId}
                conversation={conversation}
                variant="desktop"
                active={conversation.accountId === selectedServiceAccountId}
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/service/$accountId",
                    params: { accountId: conversation.accountId },
                  });
                }}
              />
            ))}

            {filteredConversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                active={conversation.id === activeConversation?.id}
                conversation={conversation}
                localMessageActionState={localMessageActionState}
                onContextMenu={handleConversationContextMenu}
              />
            ))}
          </div>

          {!conversationsQuery.isLoading &&
          !filteredReminderEntries.length &&
          !filteredConversations.length &&
          !filteredServiceConversations.length &&
          !showSubscriptionInboxItem &&
          searchTerm.trim() ? (
            <div className="pt-4">
              <EmptyState
                title="没有匹配的会话"
                description="换个关键词试试。"
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 flex-1">
        {subscriptionInboxActive ? (
          <DesktopSubscriptionWorkspace />
        ) : selectedServiceAccountId ? (
          <OfficialAccountServiceThread
            accountId={selectedServiceAccountId}
            variant="desktop"
          />
        ) : activeConversation ? (
          isPersistedGroupConversation(activeConversation) ? (
            <GroupChatThreadPanel
              groupId={activeConversation.id}
              variant="desktop"
              desktopSidePanelMode={rightPanelMode}
              onToggleDesktopHistory={() => handleToggleSidePanel("history")}
              onToggleDesktopDetails={() => handleToggleSidePanel("details")}
              onDesktopCallAction={handleDesktopCallAction}
              highlightedMessageId={
                activeConversation.id === selectedConversationId
                  ? highlightedMessageId
                  : undefined
              }
              routeContextNotice={
                activeConversation.id === selectedConversationId
                  ? routeContextNotice
                  : undefined
              }
            />
          ) : (
            <ConversationThreadPanel
              conversationId={activeConversation.id}
              variant="desktop"
              desktopSidePanelMode={rightPanelMode}
              onToggleDesktopHistory={() => handleToggleSidePanel("history")}
              onToggleDesktopDetails={() => handleToggleSidePanel("details")}
              onDesktopCallAction={handleDesktopCallAction}
              highlightedMessageId={
                activeConversation.id === selectedConversationId
                  ? highlightedMessageId
                  : undefined
              }
              routeContextNotice={
                activeConversation.id === selectedConversationId
                  ? routeContextNotice
                  : undefined
              }
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center px-10" />
        )}
      </section>

      {activeConversation && rightPanelMode ? (
        <DesktopChatSidePanel
          mode={rightPanelMode}
          title={rightPanelMode === "history" ? "聊天记录" : "聊天信息"}
          subtitle={activeConversation.title}
          onClose={() => setRightPanelMode(null)}
        >
          {rightPanelMode === "history" ? (
            <DesktopChatHistoryPanel conversation={activeConversation} />
          ) : (
            <DesktopChatDetailsPanel
              conversation={activeConversation}
              onOpenHistory={() => setRightPanelMode("history")}
            />
          )}
        </DesktopChatSidePanel>
      ) : null}

      {conversationContextMenu ? (
        <DesktopConversationContextMenu
          x={conversationContextMenu.x}
          y={conversationContextMenu.y}
          isPinned={conversationContextMenu.conversation.isPinned}
          isMuted={conversationContextMenu.conversation.isMuted}
          showMarkRead={conversationContextMenu.conversation.unreadCount > 0}
          showMarkUnread={canConversationBeMarkedUnread(
            conversationContextMenu.conversation,
          )}
          busy={conversationActionMutation.isPending}
          onClose={() => setConversationContextMenu(null)}
          onTogglePinned={() =>
            conversationActionMutation.mutate({
              action: "pin",
              conversation: conversationContextMenu.conversation,
            })
          }
          onToggleMuted={() =>
            conversationActionMutation.mutate({
              action: "mute",
              conversation: conversationContextMenu.conversation,
            })
          }
          onMarkRead={() =>
            conversationActionMutation.mutate({
              action: "read",
              conversation: conversationContextMenu.conversation,
            })
          }
          onMarkUnread={() =>
            conversationActionMutation.mutate({
              action: "unread",
              conversation: conversationContextMenu.conversation,
            })
          }
          onHide={() =>
            conversationActionMutation.mutate({
              action: "hide",
              conversation: conversationContextMenu.conversation,
            })
          }
          onClear={() =>
            conversationActionMutation.mutate({
              action: "clear",
              conversation: conversationContextMenu.conversation,
            })
          }
        />
      ) : null}
    </div>
  );
}

function DesktopReminderCard({
  active,
  entry,
  onOpen,
  onDismiss,
}: {
  active: boolean;
  entry: ChatReminderEntry;
  onOpen: (entry: ChatReminderEntry) => void;
  onDismiss: (messageId: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[16px] border px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "border-[#07c160]/30 bg-white shadow-[0_8px_18px_rgba(7,193,96,0.08)]"
          : "border-white/70 bg-white/88 hover:bg-white",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {entry.threadType === "group" ? (
          <GroupAvatarChip
            name={entry.title}
            members={entry.participants}
            size="sm"
          />
        ) : (
          <AvatarChip name={entry.title} size="sm" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                entry.isDue
                  ? "bg-[#fff1f0] text-[#d74b45]"
                  : "bg-[#eaf8ef] text-[#07c160]",
              )}
            >
              {entry.isDue ? "已到时间" : "待提醒"}
            </span>
            <span className="min-w-0 truncate text-[13px] font-medium text-[color:var(--text-primary)]">
              {entry.title}
            </span>
          </div>
          <div className="mt-1 truncate text-[12px] text-[color:var(--text-secondary)]">
            {entry.previewText}
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
            {formatReminderListTimestamp(entry.remindAt, entry.isDue)}
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onDismiss(entry.messageId)}
        className="shrink-0 rounded-full border border-black/8 bg-white px-3 py-1.5 text-[11px] text-[color:var(--text-secondary)] transition hover:border-[#07c160]/30 hover:text-[#07c160]"
      >
        完成
      </button>
    </div>
  );
}

function ConversationCard({
  active,
  conversation,
  localMessageActionState,
  onContextMenu,
}: {
  active: boolean;
  conversation: ConversationListItem;
  localMessageActionState: ReturnType<typeof useLocalChatMessageActionState>;
  onContextMenu: (
    event: MouseEvent<HTMLElement>,
    conversation: ConversationListItem,
  ) => void;
}) {
  return (
    <ConversationCardLink
      active={active}
      conversation={conversation}
      localMessageActionState={localMessageActionState}
      onContextMenu={onContextMenu}
    />
  );
}

function ConversationCardLink({
  active,
  conversation,
  localMessageActionState,
  onContextMenu,
}: {
  active: boolean;
  conversation: ConversationListItem;
  localMessageActionState: ReturnType<typeof useLocalChatMessageActionState>;
  onContextMenu: (
    event: MouseEvent<HTMLElement>,
    conversation: ConversationListItem,
  ) => void;
}) {
  const className = active
    ? "flex items-center gap-3 rounded-[12px] border border-black/6 bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
    : conversation.isPinned
      ? "flex items-center gap-3 rounded-[12px] border border-transparent bg-[#ededed] px-4 py-3 transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[#e7e7e7]"
      : "flex items-center gap-3 rounded-[12px] border border-transparent bg-transparent px-4 py-3 transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white";
  const preview = getConversationPreviewParts(
    conversation,
    localMessageActionState,
  );
  const visibleLastMessage = getConversationVisibleLastMessage(
    conversation,
    localMessageActionState,
  );
  const isGroupConversation = isPersistedGroupConversation(conversation);
  const mentionSummary = isGroupConversation
    ? summarizeChatMentions(visibleLastMessage?.text ?? "")
    : null;
  const hasMentionAllReminder = Boolean(
    isGroupConversation &&
    conversation.unreadCount > 0 &&
    mentionSummary?.hasMentionAll,
  );

  const content = (
    <>
      {isGroupConversation ? (
        <GroupAvatarChip
          name={conversation.title}
          members={conversation.participants}
        />
      ) : (
        <AvatarChip name={conversation.title} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {conversation.title}
            </div>
            {isGroupConversation ? (
              <span className="shrink-0 rounded-full bg-[#ededed] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)]">
                群聊
              </span>
            ) : null}
          </div>
          <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
            {formatConversationTimestamp(
              visibleLastMessage?.createdAt ??
                conversation.lastMessage?.createdAt ??
                conversation.updatedAt,
            )}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="truncate text-sm text-[color:var(--text-secondary)]">
            {preview.prefix ? (
              <span className="text-[color:var(--text-muted)]">
                {preview.prefix}
              </span>
            ) : null}
            <span>{renderConversationPreviewText(preview.text)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasMentionAllReminder ? (
              <span className="shrink-0 rounded-full bg-[rgba(249,115,22,0.14)] px-2 py-0.5 text-[10px] font-medium text-[#c2410c]">
                有人@所有人
              </span>
            ) : null}
            {conversation.isMuted ? (
              <BellOff
                size={13}
                className="text-[color:var(--text-dim)]"
                aria-label="消息免打扰"
              />
            ) : null}
            {conversation.unreadCount > 0 ? (
              conversation.isMuted ? (
                <div
                  className="h-2.5 w-2.5 rounded-full bg-[#fa5151]"
                  aria-label={`${conversation.unreadCount} 条未读消息`}
                />
              ) : (
                <div className="min-w-6 rounded-full bg-[#fa5151] px-2 py-0.5 text-center text-[11px] text-white shadow-[0_4px_12px_rgba(250,81,81,0.22)]">
                  {conversation.unreadCount > 99
                    ? "99+"
                    : conversation.unreadCount}
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  if (isPersistedGroupConversation(conversation)) {
    return (
      <Link
        to="/group/$groupId"
        params={{ groupId: conversation.id }}
        className={className}
        onContextMenu={(event) => onContextMenu(event, conversation)}
      >
        {content}
      </Link>
    );
  }

  return (
    <Link
      to="/chat/$conversationId"
      params={{ conversationId: conversation.id }}
      className={className}
      onContextMenu={(event) => onContextMenu(event, conversation)}
    >
      {content}
    </Link>
  );
}

function buildConversationActionNotice(
  action: "pin" | "mute" | "read" | "unread" | "hide" | "clear",
  conversation: ConversationListItem,
) {
  switch (action) {
    case "pin":
      return conversation.isPinned ? "已取消置顶聊天。" : "聊天已置顶。";
    case "mute":
      return conversation.isMuted ? "已关闭消息免打扰。" : "已开启消息免打扰。";
    case "read":
      return "已标记为已读。";
    case "unread":
      return "已标记为未读。";
    case "hide":
      return isPersistedGroupConversation(conversation)
        ? "群聊已隐藏。"
        : "聊天已隐藏。";
    case "clear":
      return isPersistedGroupConversation(conversation)
        ? "群聊记录已清空。"
        : "聊天记录已清空。";
  }
}

function canConversationBeMarkedUnread(conversation: ConversationListItem) {
  return (
    conversation.unreadCount === 0 &&
    conversation.lastMessage?.senderType === "character"
  );
}

function renderConversationPreviewText(text: string): ReactNode {
  const segments = splitChatTextSegments(text);
  if (!segments.length) {
    return text;
  }

  return segments.map((segment, index) => {
    if (segment.kind === "text") {
      return <span key={`text-${index}`}>{segment.text}</span>;
    }

    return (
      <span
        key={`mention-${index}-${segment.text}`}
        className={
          segment.tone === "all"
            ? "rounded-[7px] bg-[rgba(249,115,22,0.14)] px-1 py-0.5 text-[#c2410c]"
            : "rounded-[7px] bg-[rgba(59,130,246,0.12)] px-1 py-0.5 text-[#2563eb]"
        }
      >
        {segment.text}
      </span>
    );
  });
}
