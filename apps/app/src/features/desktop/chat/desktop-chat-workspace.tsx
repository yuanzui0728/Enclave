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
  LoaderCircle,
  Mic,
  Plus,
  Square,
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
  leaveGroup,
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
  buildChatReminderNavigation,
  formatReminderListTimestamp,
  getChatReminderActionLabel,
  getChatReminderActionTone,
  getChatReminderGroupClearErrorMessage,
  getChatReminderGroupClearLabel,
  getChatReminderGroupClearNotice,
  getChatReminderStatus,
  getChatReminderStatusLabel,
  isChatReminderGroupCollapsible,
  isChatReminderGroupClearable,
  type ChatReminderStatus,
  type ChatReminderEntry,
} from "../../chat/chat-reminder-entries";
import {
  DesktopSearchDropdownPanel,
  useDesktopSearchLauncher,
} from "../../search/desktop-search-launcher";
import { useLocalChatMessageActionState } from "../../chat/local-chat-message-actions";
import { useChatReminderActions } from "../../chat/use-chat-reminder-actions";
import { useChatReminderEntries } from "../../chat/use-chat-reminder-entries";
import {
  ChatReminderControlButton,
  ChatReminderCountText,
  ChatReminderMetaPill,
  ChatReminderSummaryText,
  ChatReminderToggleButton,
} from "../../chat/chat-reminder-summary-text";
import { useMessageReminders } from "../../chat/use-message-reminders";
import {
  splitChatTextSegments,
  summarizeChatMentions,
} from "../../../lib/chat-text";
import {
  getConversationPreviewParts,
  getConversationVisibleLastMessage,
} from "../../../lib/conversation-preview";
import {
  getConversationThreadPath,
  getConversationThreadType,
  isPersistedGroupConversation,
} from "../../../lib/conversation-route";
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
import { DesktopChatConfirmDialog } from "./desktop-chat-confirm-dialog";
import { DesktopConversationContextMenu } from "./desktop-conversation-context-menu";
import { DesktopCreateGroupDialog } from "./desktop-create-group-dialog";
import { DesktopChatSidePanel } from "./desktop-chat-side-panel";
import { DesktopChatDetailsPanel } from "./desktop-chat-details-panel";
import { DesktopChatHistoryPanel } from "./desktop-chat-history-panel";
import { buildDesktopMobileCallHandoffHash } from "./desktop-mobile-call-handoff-route-state";
import { openDesktopNoteWindow } from "./desktop-note-window-route-state";
import { openDesktopChatWindow } from "./desktop-chat-window-route-state";

type DesktopChatWorkspaceProps = {
  selectedConversationId?: string;
  selectedServiceAccountId?: string;
  highlightedMessageId?: string;
  routeContextNotice?: ChatRouteContextNotice;
  selectedSpecialView?: "subscription-inbox";
  standaloneWindow?: boolean;
};

type DesktopQuickActionItem = {
  key: string;
  label: string;
  icon: typeof Users;
};

type DesktopConversationDangerAction = "hide" | "clear" | "delete" | "leave";

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
  standaloneWindow = false,
}: DesktopChatWorkspaceProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const localMessageActionState = useLocalChatMessageActionState();
  const { reminders, clearReminder, clearReminders } = useMessageReminders();
  const [searchTerm, setSearchTerm] = useState("");
  const [isNotifiedReminderGroupExpanded, setIsNotifiedReminderGroupExpanded] =
    useState(false);
  const [rightPanelMode, setRightPanelMode] =
    useState<DesktopChatSidePanelMode>(null);
  const [historyPanelFocusKey, setHistoryPanelFocusKey] = useState(0);
  const [historyPanelCanReturnToDetails, setHistoryPanelCanReturnToDetails] =
    useState(false);
  const [detailsAnnouncementRequest, setDetailsAnnouncementRequest] = useState<
    number | null
  >(null);
  const [detailsMemberSearchRequest, setDetailsMemberSearchRequest] = useState<
    number | null
  >(null);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conversationContextMenu, setConversationContextMenu] = useState<{
    conversation: ConversationListItem;
    x: number;
    y: number;
  } | null>(null);
  const [conversationDangerAction, setConversationDangerAction] = useState<{
    action: DesktopConversationDangerAction;
    conversation: ConversationListItem;
  } | null>(null);
  const [createGroupDialogState, setCreateGroupDialogState] = useState<{
    conversationId?: string;
    seedMemberIds: string[];
  } | null>(null);
  const desktopSearchLauncher = useDesktopSearchLauncher({
    keyword: searchTerm,
    onKeywordChange: setSearchTerm,
    source: "chat",
  });

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
  const {
    filteredReminderEntries,
    filteredReminderGroups,
    filteredReminderSummary,
  } = useChatReminderEntries({
    reminders,
    conversations,
    keyword: searchTerm,
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
  const subscriptionInboxSummary = messageEntriesQuery.data?.subscriptionInbox;
  const serviceConversations = useMemo(
    () => messageEntriesQuery.data?.serviceConversations ?? [],
    [messageEntriesQuery.data?.serviceConversations],
  );

  useEffect(() => {
    if (!hasNotifiedReminderGroup && isNotifiedReminderGroupExpanded) {
      setIsNotifiedReminderGroupExpanded(false);
    }
  }, [hasNotifiedReminderGroup, isNotifiedReminderGroupExpanded]);

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
  const selectedServiceConversationExists = useMemo(
    () =>
      selectedServiceAccountId
        ? serviceConversations.some(
            (conversation) =>
              conversation.accountId === selectedServiceAccountId,
          )
        : false,
    [selectedServiceAccountId, serviceConversations],
  );
  const selectedConversationExists = useMemo(
    () =>
      selectedConversationId
        ? conversations.some(
            (conversation) => conversation.id === selectedConversationId,
          )
        : false,
    [conversations, selectedConversationId],
  );

  const activeConversation = useMemo(() => {
    if (subscriptionInboxActive || serviceConversationActive) {
      return null;
    }

    if (!conversations.length && !filteredConversations.length) {
      return null;
    }

    if (selectedConversationId) {
      return (
        conversations.find(
          (conversation) => conversation.id === selectedConversationId,
        ) ?? null
      );
    }

    if (standaloneWindow) {
      return null;
    }

    return filteredConversations[0];
  }, [
    conversations,
    filteredConversations,
    selectedConversationId,
    serviceConversationActive,
    standaloneWindow,
    subscriptionInboxActive,
  ]);

  useEffect(() => {
    if (
      !selectedServiceAccountId ||
      subscriptionInboxActive ||
      conversationsQuery.isLoading ||
      conversationsQuery.isError ||
      messageEntriesQuery.isLoading ||
      messageEntriesQuery.isError ||
      selectedServiceConversationExists
    ) {
      return;
    }

    setRightPanelMode(null);
    setDetailsAnnouncementRequest(null);
    setDetailsMemberSearchRequest(null);
    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    messageEntriesQuery.isError,
    messageEntriesQuery.isLoading,
    navigate,
    selectedServiceAccountId,
    selectedServiceConversationExists,
    subscriptionInboxActive,
  ]);

  useEffect(() => {
    if (
      standaloneWindow ||
      !selectedConversationId ||
      subscriptionInboxActive ||
      serviceConversationActive ||
      conversationsQuery.isLoading ||
      conversationsQuery.isError ||
      selectedConversationExists
    ) {
      return;
    }

    setRightPanelMode(null);
    setDetailsAnnouncementRequest(null);
    setDetailsMemberSearchRequest(null);
    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    navigate,
    selectedConversationExists,
    selectedConversationId,
    serviceConversationActive,
    standaloneWindow,
    subscriptionInboxActive,
  ]);

  useEffect(() => {
    if (
      !activeConversation ||
      subscriptionInboxActive ||
      serviceConversationActive
    ) {
      setRightPanelMode(null);
      setDetailsAnnouncementRequest(null);
      setDetailsMemberSearchRequest(null);
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

  useEffect(() => {
    const hasActiveThread = Boolean(activeConversation);
    if (
      !hasActiveThread ||
      subscriptionInboxActive ||
      serviceConversationActive
    ) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "f"
      ) {
        return;
      }

      if (event.altKey) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setRightPanelMode("history");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeConversation, serviceConversationActive, subscriptionInboxActive]);

  const conversationActionMutation = useMutation({
    mutationFn: async ({
      action,
      conversation,
    }: {
      action:
        | "pin"
        | "mute"
        | "read"
        | "unread"
        | "hide"
        | "clear"
        | "delete"
        | "leave";
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
          case "leave":
            return leaveGroup(conversation.id, baseUrl);
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
        case "delete":
          return hideConversation(conversation.id, baseUrl);
      }
    },
    onSuccess: async (_, variables) => {
      const { action, conversation } = variables;
      const isGroupConversation = isPersistedGroupConversation(conversation);

      setConversationContextMenu(null);
      setConversationDangerAction(null);
      setNotice(buildConversationActionNotice(action, conversation));

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        isGroupConversation
          ? queryClient.invalidateQueries({
              queryKey: ["app-saved-groups", baseUrl],
            })
          : Promise.resolve(),
        isGroupConversation
          ? queryClient.invalidateQueries({
              queryKey: ["app-group", baseUrl, conversation.id],
            })
          : Promise.resolve(),
        action === "leave"
          ? queryClient.invalidateQueries({
              queryKey: ["app-group-members", baseUrl, conversation.id],
            })
          : Promise.resolve(),
        action === "clear" && isGroupConversation
          ? queryClient.invalidateQueries({
              queryKey: ["app-group-messages", baseUrl, conversation.id],
            })
          : Promise.resolve(),
        action === "leave" && isGroupConversation
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
        (action === "hide" || action === "delete" || action === "leave") &&
        (selectedConversationId === conversation.id ||
          activeConversation?.id === conversation.id)
      ) {
        setRightPanelMode(null);
        void navigate({ to: "/tabs/chat" });
      }
    },
    onError: (error) => {
      setConversationContextMenu(null);
      setConversationDangerAction(null);
      setNotice(error instanceof Error ? error.message : "会话操作失败。");
    },
  });

  const activeConversationDangerConfirm = useMemo(() => {
    if (!conversationDangerAction) {
      return null;
    }

    const { action, conversation } = conversationDangerAction;

    if (action === "hide") {
      return {
        title: "隐藏聊天",
        description: "确认将这段聊天从消息列表中隐藏吗？有新消息时会再次出现。",
        confirmLabel: "隐藏聊天",
        pendingLabel: "正在隐藏...",
        danger: false,
      };
    }

    if (action === "clear") {
      return {
        title: "清空聊天记录",
        description: isPersistedGroupConversation(conversation)
          ? "确认清空这个群聊的聊天记录吗？"
          : "确认清空这段聊天记录吗？",
        confirmLabel: "清空记录",
        pendingLabel: "正在清空...",
        danger: true,
      };
    }

    if (action === "leave") {
      return {
        title: "删除并退出",
        description: "删除并退出后，该群聊会从当前世界中移除。确认继续吗？",
        confirmLabel: "删除并退出",
        pendingLabel: "正在退出...",
        danger: true,
      };
    }

    return {
      title: "删除聊天",
      description: "删除后，这段聊天会从消息列表中移除；有新消息时会再次出现。",
      confirmLabel: "删除聊天",
      pendingLabel: "正在删除...",
      danger: true,
    };
  }, [conversationDangerAction]);

  function handleQuickAction(key: DesktopQuickActionItem["key"]) {
    setIsQuickMenuOpen(false);
    setNotice(null);

    if (key === "create-group") {
      setCreateGroupDialogState({
        conversationId:
          activeConversation &&
          !isPersistedGroupConversation(activeConversation)
            ? activeConversation.id
            : undefined,
        seedMemberIds:
          activeConversation &&
          !isPersistedGroupConversation(activeConversation)
            ? activeConversation.participants.slice(0, 1)
            : [],
      });
      return;
    }

    if (key === "add-friend") {
      void navigate({ to: "/desktop/add-friend" });
      return;
    }

    void openDesktopNoteWindow({
      returnTo:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.hash}`
          : "/tabs/chat",
    });
  }

  function handleToggleSidePanel(
    mode: Exclude<DesktopChatSidePanelMode, null>,
  ) {
    if (mode === "history") {
      setRightPanelMode((current) =>
        current === "history" ? null : "history",
      );
      setHistoryPanelCanReturnToDetails(false);
      setHistoryPanelFocusKey(Date.now());
      setDetailsAnnouncementRequest(null);
      setDetailsMemberSearchRequest(null);
      return;
    }

    setRightPanelMode((current) => (current === "details" ? null : "details"));
    setHistoryPanelCanReturnToDetails(false);
    setDetailsAnnouncementRequest(null);
    setDetailsMemberSearchRequest(null);
  }

  function handleOpenHistoryPanel(source: "header" | "details" = "header") {
    setRightPanelMode("history");
    setHistoryPanelCanReturnToDetails(source === "details");
    setHistoryPanelFocusKey(Date.now());
    setDetailsAnnouncementRequest(null);
    setDetailsMemberSearchRequest(null);
  }

  function handleOpenGroupAnnouncementDetails() {
    setRightPanelMode("details");
    setHistoryPanelCanReturnToDetails(false);
    setDetailsAnnouncementRequest(Date.now());
    setDetailsMemberSearchRequest(null);
  }

  function handleOpenGroupMemberSearch() {
    setRightPanelMode("details");
    setHistoryPanelCanReturnToDetails(false);
    setDetailsMemberSearchRequest(Date.now());
    setDetailsAnnouncementRequest(null);
  }

  function handleSearchFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    desktopSearchLauncher.openSearch();
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
        conversationType: getConversationThreadType(activeConversation),
        title: activeConversation.title,
      }),
    });
  }

  useEffect(() => {
    if (
      !activeConversation ||
      selectedServiceAccountId ||
      subscriptionInboxActive
    ) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }

      if (event.altKey || event.shiftKey) {
        return;
      }

      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      if (event.key.toLowerCase() !== "f") {
        return;
      }

      event.preventDefault();
      setRightPanelMode("history");
      setHistoryPanelCanReturnToDetails(false);
      setHistoryPanelFocusKey(Date.now());
      setDetailsAnnouncementRequest(null);
      setDetailsMemberSearchRequest(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeConversation, selectedServiceAccountId, subscriptionInboxActive]);

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

  async function handleOpenConversationWindow(
    conversation: ConversationListItem,
  ) {
    const opened = await openDesktopChatWindow({
      conversationId: conversation.id,
      conversationType: getConversationThreadType(conversation),
      title: conversation.title,
      returnTo: getConversationThreadPath(conversation),
    });

    setConversationContextMenu(null);
    setNotice(
      opened
        ? "已在独立窗口打开聊天。"
        : "浏览器阻止了新窗口，请检查弹窗权限。",
    );
  }

  async function handleClearReminderGroup(
    status: ChatReminderStatus,
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
    <div className="relative flex h-full min-h-0">
      {isQuickMenuOpen ? (
        <button
          type="button"
          aria-label="关闭快捷菜单"
          onClick={() => setIsQuickMenuOpen(false)}
          className="absolute inset-0 z-10 cursor-default"
        />
      ) : null}

      {standaloneWindow ? null : (
        <section className="flex w-[324px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
          <div className="border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] px-3 py-3 backdrop-blur-xl">
            <div className="relative z-20 flex items-center gap-2">
              <div
                ref={desktopSearchLauncher.containerRef}
                className="relative min-w-0 flex-1"
              >
                <TextField
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onClick={() => desktopSearchLauncher.setIsOpen(true)}
                  onFocus={() => desktopSearchLauncher.setIsOpen(true)}
                  onKeyDown={handleSearchFieldKeyDown}
                  placeholder="搜索"
                  className="flex-1 rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] py-2 pl-3.5 pr-11 text-[13px] shadow-none hover:bg-white focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-none"
                />
                <button
                  type="button"
                  onClick={desktopSearchLauncher.handleSpeechButtonClick}
                  className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-[color:var(--text-dim)] transition hover:bg-[color:var(--surface-card)] hover:text-[color:var(--text-primary)]"
                  aria-label={
                    desktopSearchLauncher.speechListening
                      ? "结束语音输入"
                      : "开始语音输入"
                  }
                  title={
                    desktopSearchLauncher.speechSupported
                      ? desktopSearchLauncher.speechListening
                        ? "结束语音输入"
                        : "语音输入"
                      : "当前浏览器不支持语音输入"
                  }
                  disabled={
                    desktopSearchLauncher.speechButtonDisabled ||
                    !desktopSearchLauncher.speechSupported
                  }
                >
                  {desktopSearchLauncher.speechStatus ===
                    "requesting-permission" ||
                  desktopSearchLauncher.speechStatus === "processing" ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : desktopSearchLauncher.speechListening ? (
                    <Square size={13} fill="currentColor" />
                  ) : (
                    <Mic size={15} />
                  )}
                </button>
                {desktopSearchLauncher.isOpen ? (
                  <DesktopSearchDropdownPanel
                    history={desktopSearchLauncher.history}
                    keyword={searchTerm}
                    onClose={desktopSearchLauncher.close}
                    onOpenSearch={desktopSearchLauncher.openSearch}
                    speechDisplayText={desktopSearchLauncher.speechDisplayText}
                    speechError={desktopSearchLauncher.speechError}
                    speechStatus={desktopSearchLauncher.speechStatus}
                  />
                ) : null}
              </div>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIsQuickMenuOpen((current) => !current)}
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
                  aria-label="打开快捷菜单"
                >
                  <Plus size={17} strokeWidth={2.2} />
                </button>

                {isQuickMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.4rem)] z-20 w-44 overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-white p-1.5 shadow-[var(--shadow-overlay)]">
                    {desktopQuickActionItems.map((item) => {
                      const Icon = item.icon;

                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => handleQuickAction(item.key)}
                          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-console)]"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]">
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
              <InlineNotice
                className="mt-3 border-[color:var(--border-faint)] bg-white text-xs"
                tone="info"
              >
                {notice}
              </InlineNotice>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-2.5">
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

            <div className="space-y-1">
              {filteredReminderEntries.length ? (
                <section className="overflow-hidden rounded-[12px] border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.05)] p-2 shadow-none">
                  <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]">
                        <BellRing size={14} />
                      </div>
                      <span>消息提醒</span>
                    </div>
                    <div className="text-[11px] text-[color:var(--text-dim)]">
                      <ChatReminderSummaryText
                        summary={filteredReminderSummary}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-0.5">
                    {filteredReminderGroups.map((group) =>
                      (() => {
                        const collapsible = isChatReminderGroupCollapsible(
                          group.status,
                        );
                        const collapsed =
                          collapsible && !isNotifiedReminderGroupExpanded;

                        return (
                          <section
                            key={group.status}
                            className="rounded-[12px] border border-white/80 bg-white/90"
                          >
                            {collapsible ? (
                              <div className="flex items-center justify-between px-3 py-1.5">
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                    group.status === "notified"
                                      ? "bg-[#fff7e6] text-[#d48806]"
                                      : group.status === "due"
                                        ? "bg-[#fff1f0] text-[#d74b45]"
                                        : "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]",
                                  )}
                                >
                                  {group.title}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  {isChatReminderGroupClearable(
                                    group.status,
                                  ) ? (
                                    <ChatReminderControlButton
                                      onClick={() => {
                                        void handleClearReminderGroup(
                                          group.status,
                                          group.entries.map(
                                            (entry) => entry.messageId,
                                          ),
                                        );
                                      }}
                                      className="px-2.5 text-[10px] text-[#717b75]"
                                    >
                                      {getChatReminderGroupClearLabel(
                                        group.status,
                                      )}
                                    </ChatReminderControlButton>
                                  ) : null}
                                  <ChatReminderToggleButton
                                    onClick={() =>
                                      setIsNotifiedReminderGroupExpanded(
                                        (current) => !current,
                                      )
                                    }
                                    className="px-2.5 text-[10px] text-[color:var(--text-dim)]"
                                    aria-label={
                                      collapsed
                                        ? "展开已通知提醒"
                                        : "收起已通知提醒"
                                    }
                                    aria-expanded={!collapsed}
                                    collapsed={collapsed}
                                    count={group.count}
                                    iconSize={12}
                                    iconClassName="opacity-75"
                                  />
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between px-3 py-1.5">
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                    group.status === "notified"
                                      ? "bg-[#fff7e6] text-[#d48806]"
                                      : group.status === "due"
                                        ? "bg-[#fff1f0] text-[#d74b45]"
                                        : "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]",
                                  )}
                                >
                                  {group.title}
                                </span>
                                <ChatReminderMetaPill className="px-2 text-[10px] text-[color:var(--text-dim)]">
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
                                <div className="space-y-0.5 border-t border-[color:var(--border-faint)]/70 p-1">
                                  {group.entries.map((entry) => (
                                    <DesktopReminderCard
                                      key={entry.messageId}
                                      entry={entry}
                                      active={
                                        entry.threadId ===
                                          selectedConversationId &&
                                        entry.messageId === highlightedMessageId
                                      }
                                      onOpen={openReminder}
                                      onDismiss={(targetEntry) => {
                                        void completeReminder(targetEntry);
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </section>
                        );
                      })(),
                    )}
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
                  contextMenuOpen={
                    conversationContextMenu?.conversation.id === conversation.id
                  }
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
              <div className="px-2 pt-5">
                <EmptyState
                  title="没有匹配的会话"
                  description="换个关键词试试。"
                />
              </div>
            ) : null}
          </div>
        </section>
      )}

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
              key={`group-thread-${activeConversation.id}`}
              groupId={activeConversation.id}
              variant="desktop"
              desktopSidePanelMode={rightPanelMode}
              onToggleDesktopHistory={() => handleToggleSidePanel("history")}
              onToggleDesktopDetails={() => handleToggleSidePanel("details")}
              onOpenDesktopAnnouncementDetails={
                handleOpenGroupAnnouncementDetails
              }
              onOpenDesktopMemberSearch={handleOpenGroupMemberSearch}
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
              key={`direct-thread-${activeConversation.id}`}
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
        ) : standaloneWindow ? (
          <div className="flex h-full items-center justify-center px-10">
            <div className="w-full max-w-md rounded-[18px] border border-[color:var(--border-faint)] bg-white px-8 py-10 shadow-[var(--shadow-section)]">
              <EmptyState
                title="这段聊天已经不存在"
                description="它可能已被隐藏、删除，或者当前上下文已经失效。"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-10">
            <div className="w-full max-w-md rounded-[18px] border border-[color:var(--border-faint)] bg-white/86 px-8 py-10 shadow-[var(--shadow-soft)]">
              <EmptyState
                title="选择一段聊天开始工作"
                description="左侧会话列表用于切换聊天，右侧再按需展开聊天信息或记录。"
              />
            </div>
          </div>
        )}
      </section>

      {activeConversation && rightPanelMode ? (
        <DesktopChatSidePanel
          mode={rightPanelMode}
          title={
            rightPanelMode === "history"
              ? "查找聊天记录"
              : activeConversation.title
          }
          subtitle={
            rightPanelMode === "history" ? activeConversation.title : "聊天信息"
          }
          onClose={() => {
            setRightPanelMode(null);
            setHistoryPanelCanReturnToDetails(false);
            setDetailsAnnouncementRequest(null);
            setDetailsMemberSearchRequest(null);
          }}
        >
          {rightPanelMode === "history" ? (
            <DesktopChatHistoryPanel
              conversation={activeConversation}
              focusRequestKey={historyPanelFocusKey}
              onClose={() => {
                setRightPanelMode(null);
                setHistoryPanelCanReturnToDetails(false);
              }}
              onBackToDetails={
                historyPanelCanReturnToDetails
                  ? () => {
                      setRightPanelMode("details");
                      setHistoryPanelCanReturnToDetails(false);
                      setDetailsAnnouncementRequest(null);
                      setDetailsMemberSearchRequest(null);
                    }
                  : undefined
              }
              onOpenMessage={(messageId) => {
                setRightPanelMode(null);
                setHistoryPanelCanReturnToDetails(false);

                if (isPersistedGroupConversation(activeConversation)) {
                  void navigate({
                    to: "/group/$groupId",
                    params: { groupId: activeConversation.id },
                    hash: `chat-message-${messageId}`,
                  });
                  return;
                }

                void navigate({
                  to: "/chat/$conversationId",
                  params: { conversationId: activeConversation.id },
                  hash: `chat-message-${messageId}`,
                });
              }}
            />
          ) : (
            <DesktopChatDetailsPanel
              conversation={activeConversation}
              announcementRequest={detailsAnnouncementRequest}
              memberSearchRequest={detailsMemberSearchRequest}
              onOpenHistory={() => {
                handleOpenHistoryPanel("details");
              }}
              onCreateGroup={(input) => {
                setCreateGroupDialogState(input);
              }}
            />
          )}
        </DesktopChatSidePanel>
      ) : null}

      <DesktopCreateGroupDialog
        open={Boolean(createGroupDialogState)}
        conversationId={createGroupDialogState?.conversationId}
        seedMemberIds={createGroupDialogState?.seedMemberIds}
        onClose={() => setCreateGroupDialogState(null)}
      />

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
          onOpenWindow={() =>
            void handleOpenConversationWindow(
              conversationContextMenu.conversation,
            )
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
          hideLabel="隐藏聊天"
          onHide={
            isPersistedGroupConversation(conversationContextMenu.conversation)
              ? () => {
                  setConversationContextMenu(null);
                  setConversationDangerAction({
                    action: "hide",
                    conversation: conversationContextMenu.conversation,
                  });
                }
              : undefined
          }
          onClear={() => {
            setConversationContextMenu(null);
            setConversationDangerAction({
              action: "clear",
              conversation: conversationContextMenu.conversation,
            });
          }}
          deleteLabel={
            isPersistedGroupConversation(conversationContextMenu.conversation)
              ? "删除并退出"
              : "删除聊天"
          }
          onDelete={() => {
            setConversationContextMenu(null);
            setConversationDangerAction({
              action: isPersistedGroupConversation(
                conversationContextMenu.conversation,
              )
                ? "leave"
                : "delete",
              conversation: conversationContextMenu.conversation,
            });
          }}
        />
      ) : null}

      <DesktopChatConfirmDialog
        open={Boolean(activeConversationDangerConfirm)}
        title={activeConversationDangerConfirm?.title ?? ""}
        description={activeConversationDangerConfirm?.description ?? ""}
        confirmLabel={activeConversationDangerConfirm?.confirmLabel}
        pendingLabel={activeConversationDangerConfirm?.pendingLabel}
        danger={activeConversationDangerConfirm?.danger}
        pending={conversationActionMutation.isPending}
        onClose={() => setConversationDangerAction(null)}
        onConfirm={() => {
          if (!conversationDangerAction) {
            return;
          }

          conversationActionMutation.mutate({
            action: conversationDangerAction.action,
            conversation: conversationDangerAction.conversation,
          });
        }}
      />
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
  onDismiss: (entry: ChatReminderEntry) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[14px] border px-2.5 py-2 transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "border-[rgba(7,193,96,0.14)] bg-white shadow-[0_8px_18px_rgba(7,193,96,0.06)]"
          : "border-white/70 bg-white/88 hover:bg-white",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left leading-tight"
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
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-medium",
                getChatReminderStatus(entry) === "notified"
                  ? "bg-[#fff7e6] text-[#d48806]"
                  : entry.isDue
                    ? "bg-[#fff1f0] text-[#d74b45]"
                    : "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]",
              )}
            >
              {getChatReminderStatusLabel(entry)}
            </span>
            <span className="min-w-0 truncate text-[12px] font-medium text-[color:var(--text-primary)]">
              {entry.title}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[color:var(--text-dim)]">
            <span className="min-w-0 flex-1 truncate text-[10px] leading-[1.35] text-[color:var(--text-secondary)]">
              {entry.previewText}
            </span>
            <span className="shrink-0 text-[9px]">
              {formatReminderListTimestamp(
                entry.remindAt,
                entry.isDue,
                entry.notifiedAt,
              )}
            </span>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onDismiss(entry)}
        className={cn(
          "shrink-0 self-center rounded-full px-2 py-[3px] text-[9px] leading-none transition-colors",
          getChatReminderActionTone(entry) === "warning"
            ? "border border-[#f3ddba] bg-[#fff9ef] text-[#ba740f] hover:bg-[#fff2df]"
            : "border border-transparent bg-[#f5f7f5] text-[#6b736d] hover:bg-[#edf1ee]",
        )}
      >
        {getChatReminderActionLabel(entry)}
      </button>
    </div>
  );
}

function ConversationCard({
  active,
  conversation,
  localMessageActionState,
  contextMenuOpen,
  onContextMenu,
}: {
  active: boolean;
  conversation: ConversationListItem;
  localMessageActionState: ReturnType<typeof useLocalChatMessageActionState>;
  contextMenuOpen: boolean;
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
      contextMenuOpen={contextMenuOpen}
      onContextMenu={onContextMenu}
    />
  );
}

function ConversationCardLink({
  active,
  conversation,
  localMessageActionState,
  contextMenuOpen,
  onContextMenu,
}: {
  active: boolean;
  conversation: ConversationListItem;
  localMessageActionState: ReturnType<typeof useLocalChatMessageActionState>;
  contextMenuOpen: boolean;
  onContextMenu: (
    event: MouseEvent<HTMLElement>,
    conversation: ConversationListItem,
  ) => void;
}) {
  const className = active
    ? "flex items-center gap-3 rounded-[10px] border border-[rgba(7,193,96,0.14)] bg-white px-3 py-2.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]"
    : contextMenuOpen
      ? "flex items-center gap-3 rounded-[10px] border border-[color:var(--border-faint)] bg-white/88 px-3 py-2.5"
      : conversation.isPinned
        ? "flex items-center gap-3 rounded-[10px] border border-transparent bg-[rgba(240,244,242,0.92)] px-3 py-2.5 transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[color:var(--border-faint)] hover:bg-[rgba(237,243,239,0.96)]"
        : "flex items-center gap-3 rounded-[10px] border border-transparent bg-transparent px-3 py-2.5 transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[color:var(--border-faint)] hover:bg-white/80";
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
            <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
              {conversation.title}
            </div>
            {isGroupConversation ? (
              <span className="shrink-0 rounded-full border border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)]">
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
          <div className="truncate text-[12px] text-[color:var(--text-secondary)]">
            {preview.prefix ? (
              <span className="text-[color:var(--text-muted)]">
                {preview.prefix}
              </span>
            ) : null}
            <span>{renderConversationPreviewText(preview.text)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasMentionAllReminder ? (
              <span className="shrink-0 rounded-full border border-[#f3ddba] bg-[#fff8ec] px-2 py-0.5 text-[10px] font-medium text-[#ba740f]">
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
                  className="h-2 w-2 rounded-full bg-[#fa5151]"
                  aria-label={`${conversation.unreadCount} 条未读消息`}
                />
              ) : (
                <div className="min-w-5 rounded-full bg-[#fa5151] px-1.5 py-0.5 text-center text-[10px] text-white">
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
  action:
    | "pin"
    | "mute"
    | "read"
    | "unread"
    | "hide"
    | "clear"
    | "delete"
    | "leave",
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
    case "delete":
      return "聊天已从列表移除。";
    case "leave":
      return "已删除并退出群聊。";
  }
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
    ),
  );
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
            ? "rounded-[7px] bg-[#fff4df] px-1 py-0.5 text-[#b67206]"
            : "rounded-[7px] bg-[rgba(7,193,96,0.07)] px-1 py-0.5 text-[color:var(--brand-primary)]"
        }
      >
        {segment.text}
      </span>
    );
  });
}
