import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BellOff,
  BellRing,
  BookOpenText,
  CheckCheck,
  ExternalLink,
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
  markOfficialAccountServiceMessagesRead,
  markOfficialAccountSubscriptionInboxRead,
  type OfficialAccountServiceConversationSummary,
  type OfficialAccountSubscriptionInboxSummary,
  setConversationMuted,
  setConversationPinned,
  setGroupPinned,
  updateOfficialAccountPreferences,
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
import { OfficialAccountsEntryCard } from "../../../components/official-accounts-entry-card";
import { OfficialServiceConversationCard } from "../../../components/official-service-conversation-card";
import { SubscriptionInboxCard } from "../../../components/subscription-inbox-card";
import { DesktopOfficialAccountsWorkspace } from "../official-accounts/desktop-official-accounts-workspace";
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
  getConversationThreadType,
  isPersistedGroupConversation,
} from "../../../lib/conversation-route";
import { formatConversationTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { getCurrentWindowTargetPath } from "../../../runtime/desktop-windowing";
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
import {
  DesktopOfficialMessageContextMenu,
  type DesktopOfficialMessageContextMenuItem,
} from "./desktop-official-message-context-menu";
import { DesktopChatSidePanel } from "./desktop-chat-side-panel";
import { DesktopChatDetailsPanel } from "./desktop-chat-details-panel";
import { DesktopChatHistoryPanel } from "./desktop-chat-history-panel";
import {
  buildDesktopMessageEntries,
  type DesktopMessageEntry,
} from "./desktop-message-entry-types";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
  type DesktopChatCallAction,
  type DesktopChatDetailsAction,
  type DesktopChatRouteState,
} from "./desktop-chat-route-state";
import { buildDesktopMobileCallHandoffHash } from "./desktop-mobile-call-handoff-route-state";
import { buildDesktopNoteWindowRouteHash } from "./desktop-note-window-route-state";
import { createDesktopNoteDraft } from "./desktop-notes-storage";
import { openDesktopChatWindow } from "./desktop-chat-window-route-state";

type DesktopChatWorkspaceProps = {
  selectedConversationId?: string;
  selectedSidePanelMode?: DesktopChatSidePanelMode;
  selectedCallAction?: DesktopChatCallAction;
  selectedDetailsAction?: DesktopChatDetailsAction;
  selectedServiceAccountId?: string;
  selectedOfficialAccountId?: string;
  selectedOfficialArticleId?: string;
  selectedOfficialDisplayMode?: "feed" | "accounts";
  highlightedMessageId?: string;
  buildMessageReturnTo?: (messageId: string) => string | undefined;
  routeContextNotice?: ChatRouteContextNotice;
  selectedSpecialView?: "subscription-inbox" | "official-accounts";
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
  selectedSidePanelMode,
  selectedCallAction,
  selectedDetailsAction,
  selectedServiceAccountId,
  selectedOfficialAccountId,
  selectedOfficialArticleId,
  selectedOfficialDisplayMode,
  highlightedMessageId,
  buildMessageReturnTo,
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
  const [detailsActionRequest, setDetailsActionRequest] = useState<{
    kind: DesktopChatDetailsAction;
    token: number;
  } | null>(null);
  const [desktopCallRequest, setDesktopCallRequest] = useState<{
    kind: DesktopChatCallAction;
    conversationId: string;
    token: number;
  } | null>(null);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conversationContextMenu, setConversationContextMenu] = useState<{
    conversation: ConversationListItem;
    x: number;
    y: number;
  } | null>(null);
  const [officialMessageContextMenu, setOfficialMessageContextMenu] = useState<
    | {
        kind: "subscription";
        summary: OfficialAccountSubscriptionInboxSummary;
        x: number;
        y: number;
      }
    | {
        kind: "service";
        conversation: OfficialAccountServiceConversationSummary;
        x: number;
        y: number;
      }
    | null
  >(null);
  const [conversationDangerAction, setConversationDangerAction] = useState<{
    action: DesktopConversationDangerAction;
    conversation: ConversationListItem;
  } | null>(null);
  const [createGroupDialogState, setCreateGroupDialogState] = useState<{
    conversationId?: string;
    seedMemberIds: string[];
  } | null>(null);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<HTMLElement | null>(null);
  const desktopHeaderActionsRef = useRef<HTMLDivElement | null>(null);
  const handledRouteCallActionKeyRef = useRef<string | null>(null);
  const desktopSearchLauncher = useDesktopSearchLauncher({
    keyword: searchTerm,
    onKeywordChange: setSearchTerm,
    source: "chat",
  });
  const navigateToChatWorkspace = useCallback(
    ({
      hash,
      replace,
    }: {
      hash?: string;
      replace?: boolean;
    } = {}) => {
      void navigate({
        to: "/tabs/chat",
        search: {},
        hash,
        replace,
      });
    },
    [navigate],
  );

  const closeRightPanel = useCallback(() => {
    setRightPanelMode(null);
    setHistoryPanelCanReturnToDetails(false);
    setDetailsActionRequest(null);
  }, []);

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
      void navigate(
        buildChatReminderNavigation(entry, {
          desktopLayout: true,
        }),
      );
    },
    onNoticeChange: setNotice,
    onCompleteReminder: clearReminder,
  });
  const subscriptionInboxSummary = messageEntriesQuery.data?.subscriptionInbox;
  const serviceConversations = useMemo(
    () => messageEntriesQuery.data?.serviceConversations ?? [],
    [messageEntriesQuery.data?.serviceConversations],
  );
  const desktopMessageEntries = useMemo(
    () =>
      buildDesktopMessageEntries({
        conversations,
        subscriptionInboxSummary,
        serviceConversations,
        searchTerm,
        getConversationPreviewText: (conversation) =>
          getConversationPreviewParts(conversation, localMessageActionState)
            .text,
      }),
    [
      conversations,
      localMessageActionState,
      searchTerm,
      serviceConversations,
      subscriptionInboxSummary,
    ],
  );
  const filteredConversations = useMemo(
    () =>
      desktopMessageEntries.flatMap((entry) =>
        entry.kind === "conversation" ? [entry.conversation] : [],
      ),
    [desktopMessageEntries],
  );

  useEffect(() => {
    if (!hasNotifiedReminderGroup && isNotifiedReminderGroupExpanded) {
      setIsNotifiedReminderGroupExpanded(false);
    }
  }, [hasNotifiedReminderGroup, isNotifiedReminderGroupExpanded]);

  const subscriptionInboxActive = selectedSpecialView === "subscription-inbox";
  const officialAccountsActive = selectedSpecialView === "official-accounts";
  const serviceConversationActive = Boolean(selectedServiceAccountId);
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
    if (
      subscriptionInboxActive ||
      officialAccountsActive ||
      serviceConversationActive
    ) {
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
    officialAccountsActive,
    serviceConversationActive,
    standaloneWindow,
    subscriptionInboxActive,
  ]);

  const buildCurrentChatRouteHash = useCallback(
    (
      overrides: Partial<
        Pick<DesktopChatRouteState, "panel" | "detailsAction" | "messageId">
      > = {},
    ) => {
      const baseState: DesktopChatRouteState =
        selectedSpecialView === "subscription-inbox"
          ? {
              officialView: "subscription-inbox",
              articleId: selectedOfficialArticleId,
            }
          : selectedSpecialView === "official-accounts"
            ? {
                officialView: "official-accounts",
                officialMode: selectedOfficialDisplayMode,
                accountId: selectedOfficialAccountId,
                articleId: selectedOfficialArticleId,
              }
            : selectedServiceAccountId
              ? {
                  officialView: "service-account",
                  accountId: selectedServiceAccountId,
                  articleId: selectedOfficialArticleId,
                }
              : activeConversation
                ? {
                    conversationId: activeConversation.id,
                    messageId:
                      activeConversation.id === selectedConversationId
                        ? highlightedMessageId
                        : undefined,
                  }
                : selectedConversationId
                  ? {
                      conversationId: selectedConversationId,
                      messageId: highlightedMessageId,
                    }
                  : {};

      return buildDesktopChatRouteHash({
        ...baseState,
        panel: overrides.panel,
        detailsAction:
          overrides.panel === "details" ? overrides.detailsAction : undefined,
        messageId:
          "messageId" in overrides ? overrides.messageId : baseState.messageId,
      });
    },
    [
      activeConversation,
      highlightedMessageId,
      selectedConversationId,
      selectedOfficialAccountId,
      selectedOfficialArticleId,
      selectedOfficialDisplayMode,
      selectedServiceAccountId,
      selectedSpecialView,
    ],
  );

  const dismissSidePanel = useCallback(() => {
    closeRightPanel();
    navigateToChatWorkspace({
      hash: buildCurrentChatRouteHash(),
      replace: true,
    });
  }, [buildCurrentChatRouteHash, closeRightPanel, navigateToChatWorkspace]);

  const handleWorkspacePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!rightPanelMode) {
        return;
      }

      const target = event.target as Node;
      if (sidePanelRef.current?.contains(target)) {
        return;
      }

      if (desktopHeaderActionsRef.current?.contains(target)) {
        return;
      }

      dismissSidePanel();
    },
    [dismissSidePanel, rightPanelMode],
  );

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

    closeRightPanel();
    navigateToChatWorkspace({ replace: true });
  }, [
    closeRightPanel,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    messageEntriesQuery.isError,
    messageEntriesQuery.isLoading,
    navigateToChatWorkspace,
    selectedServiceAccountId,
    selectedServiceConversationExists,
    subscriptionInboxActive,
  ]);

  useEffect(() => {
    if (
      standaloneWindow ||
      !selectedConversationId ||
      subscriptionInboxActive ||
      officialAccountsActive ||
      serviceConversationActive ||
      conversationsQuery.isLoading ||
      conversationsQuery.isError ||
      selectedConversationExists
    ) {
      return;
    }

    closeRightPanel();
    navigateToChatWorkspace({ replace: true });
  }, [
    closeRightPanel,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    navigateToChatWorkspace,
    officialAccountsActive,
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
      officialAccountsActive ||
      serviceConversationActive
    ) {
      closeRightPanel();
      return;
    }

    if (!selectedSidePanelMode) {
      closeRightPanel();
      return;
    }
  }, [
    activeConversation,
    closeRightPanel,
    officialAccountsActive,
    serviceConversationActive,
    selectedSidePanelMode,
    subscriptionInboxActive,
  ]);

  useEffect(() => {
    if (
      !activeConversation ||
      !selectedSidePanelMode ||
      subscriptionInboxActive ||
      officialAccountsActive ||
      serviceConversationActive
    ) {
      return;
    }

    setRightPanelMode(selectedSidePanelMode);
    setHistoryPanelCanReturnToDetails(false);
    setDetailsActionRequest(
      selectedSidePanelMode === "details" && selectedDetailsAction
        ? {
            kind: selectedDetailsAction,
            token: Date.now(),
          }
        : null,
    );
    if (selectedSidePanelMode === "history") {
      setHistoryPanelFocusKey(Date.now());
    }
  }, [
    activeConversation,
    officialAccountsActive,
    selectedDetailsAction,
    selectedSidePanelMode,
    serviceConversationActive,
    subscriptionInboxActive,
  ]);

  useEffect(() => {
    if (!selectedCallAction) {
      handledRouteCallActionKeyRef.current = null;
    }
  }, [selectedCallAction]);

  useEffect(() => {
    if (
      !selectedCallAction ||
      !selectedConversationId ||
      !activeConversation ||
      activeConversation.id !== selectedConversationId ||
      subscriptionInboxActive ||
      officialAccountsActive ||
      serviceConversationActive
    ) {
      return;
    }

    const requestKey = `${selectedConversationId}:${selectedCallAction}`;
    if (handledRouteCallActionKeyRef.current === requestKey) {
      return;
    }

    handledRouteCallActionKeyRef.current = requestKey;
    setDesktopCallRequest({
      kind: selectedCallAction,
      conversationId: selectedConversationId,
      token: Date.now(),
    });
    navigateToChatWorkspace({
      hash: buildCurrentChatRouteHash({
        panel: selectedSidePanelMode ?? undefined,
        detailsAction:
          selectedSidePanelMode === "details" ? selectedDetailsAction : undefined,
      }),
      replace: true,
    });
  }, [
    activeConversation,
    buildCurrentChatRouteHash,
    navigateToChatWorkspace,
    officialAccountsActive,
    selectedCallAction,
    selectedConversationId,
    selectedDetailsAction,
    selectedSidePanelMode,
    serviceConversationActive,
    subscriptionInboxActive,
  ]);

  useEffect(() => {
    if (
      !desktopCallRequest ||
      activeConversation?.id === desktopCallRequest.conversationId
    ) {
      return;
    }

    setDesktopCallRequest(null);
  }, [activeConversation, desktopCallRequest]);

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
    if (!officialMessageContextMenu) {
      return;
    }

    const closeMenu = () => setOfficialMessageContextMenu(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [officialMessageContextMenu]);

  useEffect(() => {
    if (!isQuickMenuOpen) {
      return;
    }

    const closeMenu = () => setIsQuickMenuOpen(false);
    const handlePointerDown = (event: PointerEvent) => {
      if (quickMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeMenu();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      closeMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isQuickMenuOpen]);

  useEffect(() => {
    if (!rightPanelMode) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (sidePanelRef.current?.contains(target)) {
        return;
      }

      if (desktopHeaderActionsRef.current?.contains(target)) {
        return;
      }

      dismissSidePanel();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      dismissSidePanel();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissSidePanel, rightPanelMode]);

  useEffect(() => {
    const hasActiveThread = Boolean(activeConversation);
    if (
      !hasActiveThread ||
      subscriptionInboxActive ||
      officialAccountsActive ||
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
  }, [
    activeConversation,
    officialAccountsActive,
    serviceConversationActive,
    subscriptionInboxActive,
  ]);

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
              queryKey: ["app-contact-groups", baseUrl],
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
        closeRightPanel();
        navigateToChatWorkspace({ replace: true });
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

  const officialMessageActionMutation = useMutation({
    mutationFn: async (
      action:
        | { kind: "subscription-read" }
        | {
            kind: "service-read";
            conversation: OfficialAccountServiceConversationSummary;
          }
        | {
            kind: "service-mute";
            conversation: OfficialAccountServiceConversationSummary;
          },
    ) => {
      switch (action.kind) {
        case "subscription-read":
          return markOfficialAccountSubscriptionInboxRead(baseUrl);
        case "service-read":
          return markOfficialAccountServiceMessagesRead(
            action.conversation.accountId,
            baseUrl,
          );
        case "service-mute":
          return updateOfficialAccountPreferences(
            action.conversation.accountId,
            { isMuted: !action.conversation.isMuted },
            baseUrl,
          );
      }
    },
    onSuccess: async (_, action) => {
      setOfficialMessageContextMenu(null);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-official-message-entries", baseUrl],
        }),
        action.kind === "subscription-read"
          ? queryClient.invalidateQueries({
              queryKey: ["app-official-subscription-inbox", baseUrl],
            })
          : Promise.resolve(),
        action.kind !== "subscription-read"
          ? queryClient.invalidateQueries({
              queryKey: [
                "app-official-service-messages",
                baseUrl,
                action.conversation.accountId,
              ],
            })
          : Promise.resolve(),
        action.kind === "service-mute"
          ? queryClient.invalidateQueries({
              queryKey: [
                "app-official-account",
                baseUrl,
                action.conversation.accountId,
              ],
            })
          : Promise.resolve(),
        action.kind === "service-mute"
          ? queryClient.invalidateQueries({
              queryKey: ["app-official-accounts", baseUrl],
            })
          : Promise.resolve(),
      ]);

      setNotice(
        action.kind === "subscription-read"
          ? "已将订阅号消息标为已读。"
          : action.kind === "service-read"
            ? `已将 ${action.conversation.account.name} 标为已读。`
            : action.conversation.isMuted
              ? `已关闭 ${action.conversation.account.name} 的消息免打扰。`
              : `已开启 ${action.conversation.account.name} 的消息免打扰。`,
      );
    },
    onError: (error) => {
      setOfficialMessageContextMenu(null);
      setNotice(
        error instanceof Error ? error.message : "公众号消息操作失败。",
      );
    },
  });

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

    const draft = createDesktopNoteDraft();
    void navigate({
      to: "/tabs/favorites",
      hash: buildDesktopNoteWindowRouteHash({
        draftId: draft.draftId,
        returnTo:
          typeof window !== "undefined"
            ? getCurrentWindowTargetPath()
            : "/tabs/chat",
      }),
    });
  }

  function handleToggleSidePanel(
    mode: Exclude<DesktopChatSidePanelMode, null>,
  ) {
    if (mode === "history") {
      if (rightPanelMode === "history") {
        dismissSidePanel();
        return;
      }

      setRightPanelMode("history");
      setHistoryPanelCanReturnToDetails(false);
      setHistoryPanelFocusKey(Date.now());
      setDetailsActionRequest(null);
      navigateToChatWorkspace({
        hash: buildCurrentChatRouteHash({
          panel: "history",
          detailsAction: undefined,
        }),
        replace: true,
      });
      return;
    }

    if (rightPanelMode === "details") {
      dismissSidePanel();
      return;
    }

    setRightPanelMode("details");
    setHistoryPanelCanReturnToDetails(false);
    setDetailsActionRequest(null);
    navigateToChatWorkspace({
      hash: buildCurrentChatRouteHash({
        panel: "details",
        detailsAction: undefined,
      }),
      replace: true,
    });
  }

  function handleOpenHistoryPanel(source: "header" | "details" = "header") {
    setRightPanelMode("history");
    setHistoryPanelCanReturnToDetails(source === "details");
    setHistoryPanelFocusKey(Date.now());
    setDetailsActionRequest(null);
    navigateToChatWorkspace({
      hash: buildCurrentChatRouteHash({
        panel: "history",
        detailsAction: undefined,
      }),
      replace: true,
    });
  }

  function handleOpenGroupAnnouncementDetails() {
    setRightPanelMode("details");
    setHistoryPanelCanReturnToDetails(false);
    setDetailsActionRequest({
      kind: "announcement",
      token: Date.now(),
    });
    navigateToChatWorkspace({
      hash: buildCurrentChatRouteHash({
        panel: "details",
        detailsAction: "announcement",
      }),
      replace: true,
    });
  }

  function handleOpenGroupMemberSearch() {
    setRightPanelMode("details");
    setHistoryPanelCanReturnToDetails(false);
    setDetailsActionRequest({
      kind: "member-search",
      token: Date.now(),
    });
    navigateToChatWorkspace({
      hash: buildCurrentChatRouteHash({
        panel: "details",
        detailsAction: "member-search",
      }),
      replace: true,
    });
  }

  function handleSearchFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.defaultPrevented) {
      return;
    }

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
      subscriptionInboxActive ||
      officialAccountsActive
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
      setDetailsActionRequest(null);
      navigateToChatWorkspace({
        hash: buildCurrentChatRouteHash({
          panel: "history",
          detailsAction: undefined,
        }),
        replace: true,
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeConversation,
    buildCurrentChatRouteHash,
    navigateToChatWorkspace,
    officialAccountsActive,
    selectedServiceAccountId,
    subscriptionInboxActive,
  ]);

  function handleConversationContextMenu(
    event: MouseEvent<HTMLElement>,
    conversation: ConversationListItem,
  ) {
    event.preventDefault();
    setOfficialMessageContextMenu(null);
    setConversationContextMenu({
      conversation,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleSubscriptionContextMenu(
    event: MouseEvent<HTMLElement>,
    summary: OfficialAccountSubscriptionInboxSummary,
  ) {
    event.preventDefault();
    setConversationContextMenu(null);
    setOfficialMessageContextMenu({
      kind: "subscription",
      summary,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleServiceConversationContextMenu(
    event: MouseEvent<HTMLElement>,
    conversation: OfficialAccountServiceConversationSummary,
  ) {
    event.preventDefault();
    setConversationContextMenu(null);
    setOfficialMessageContextMenu({
      kind: "service",
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
      returnTo: buildDesktopChatThreadPath({
        conversationId: conversation.id,
      }),
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
    <div
      className="relative flex h-full min-h-0"
      onPointerDownCapture={handleWorkspacePointerDownCapture}
    >
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
              <div ref={quickMenuRef} className="relative shrink-0">
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

              {desktopMessageEntries.map((entry) => (
                <DesktopMessageEntryCard
                  key={entry.id}
                  entry={entry}
                  activeConversationId={activeConversation?.id}
                  officialAccountsActive={officialAccountsActive}
                  selectedOfficialAccountId={selectedOfficialAccountId}
                  selectedServiceAccountId={selectedServiceAccountId}
                  selectedOfficialArticleId={selectedOfficialArticleId}
                  selectedOfficialDisplayMode={selectedOfficialDisplayMode}
                  subscriptionInboxActive={subscriptionInboxActive}
                  localMessageActionState={localMessageActionState}
                  conversationContextMenuId={
                    conversationContextMenu?.conversation.id
                  }
                  officialMessageContextMenu={
                    officialMessageContextMenu?.kind === "subscription"
                      ? { kind: "subscription" }
                      : officialMessageContextMenu?.kind === "service"
                        ? {
                            kind: "service",
                            accountId:
                              officialMessageContextMenu.conversation.accountId,
                          }
                        : null
                  }
                  onConversationContextMenu={handleConversationContextMenu}
                  onSubscriptionContextMenu={handleSubscriptionContextMenu}
                  onServiceConversationContextMenu={
                    handleServiceConversationContextMenu
                  }
                />
              ))}
            </div>

            {!conversationsQuery.isLoading &&
            !filteredReminderEntries.length &&
            !desktopMessageEntries.length &&
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
        {officialAccountsActive ? (
          <DesktopOfficialAccountsWorkspace
            selectedAccountId={selectedOfficialAccountId}
            selectedArticleId={selectedOfficialArticleId}
            selectedMode={selectedOfficialDisplayMode}
            onHighlightFeedArticle={(articleId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "official-accounts",
                  officialMode: "feed",
                  articleId: articleId ?? undefined,
                }),
                replace: true,
              });
            }}
            onOpenAccount={(accountId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "official-accounts",
                  officialMode: "accounts",
                  accountId,
                }),
                replace: true,
              });
            }}
            onOpenArticle={(articleId, accountId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "official-accounts",
                  officialMode: "accounts",
                  accountId,
                  articleId,
                }),
                replace: true,
              });
            }}
            onModeChange={(officialMode) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "official-accounts",
                  officialMode,
                  accountId: selectedOfficialAccountId,
                  articleId: selectedOfficialArticleId,
                }),
                replace: true,
              });
            }}
            onOpenServiceMessages={(accountId, articleId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "service-account",
                  accountId,
                  articleId: articleId ?? undefined,
                }),
                replace: true,
              });
            }}
            onOpenSubscriptionInbox={(articleId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "subscription-inbox",
                  articleId: articleId ?? undefined,
                }),
                replace: true,
              });
            }}
          />
        ) : subscriptionInboxActive ? (
          <DesktopSubscriptionWorkspace
            selectedArticleId={selectedOfficialArticleId}
            onOpenArticle={(articleId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "subscription-inbox",
                  articleId,
                }),
                replace: true,
              });
            }}
            onOpenAccount={(accountId, articleId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "official-accounts",
                  officialMode: "accounts",
                  accountId,
                  articleId,
                }),
                replace: true,
              });
            }}
          />
        ) : selectedServiceAccountId ? (
          <OfficialAccountServiceThread
            accountId={selectedServiceAccountId}
            variant="desktop"
            selectedArticleId={selectedOfficialArticleId}
            onCloseArticle={(accountId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "service-account",
                  accountId,
                }),
                replace: true,
              });
            }}
            onOpenArticle={(articleId, accountId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "service-account",
                  accountId,
                  articleId,
                }),
                replace: true,
              });
            }}
            onOpenAccount={(accountId, articleId) => {
              navigateToChatWorkspace({
                hash: buildDesktopChatRouteHash({
                  officialView: "official-accounts",
                  officialMode: "accounts",
                  accountId,
                  articleId,
                }),
                replace: true,
              });
            }}
          />
        ) : activeConversation ? (
          isPersistedGroupConversation(activeConversation) ? (
            <GroupChatThreadPanel
              key={`group-thread-${activeConversation.id}`}
              groupId={activeConversation.id}
              variant="desktop"
              desktopSidePanelMode={rightPanelMode}
              desktopCallRequest={
                activeConversation.id === desktopCallRequest?.conversationId
                  ? desktopCallRequest
                  : null
              }
              desktopHeaderActionsRef={desktopHeaderActionsRef}
              onToggleDesktopHistory={() => handleToggleSidePanel("history")}
              onToggleDesktopDetails={() => handleToggleSidePanel("details")}
              onOpenDesktopAnnouncementDetails={
                handleOpenGroupAnnouncementDetails
              }
              onOpenDesktopMemberSearch={handleOpenGroupMemberSearch}
              onDesktopCallAction={handleDesktopCallAction}
              onDesktopCallRequestHandled={(token) => {
                setDesktopCallRequest((current) =>
                  current?.token === token ? null : current,
                );
              }}
              highlightedMessageId={
                activeConversation.id === selectedConversationId
                  ? highlightedMessageId
                  : undefined
              }
              buildMessageReturnTo={buildMessageReturnTo}
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
              desktopCallRequest={
                activeConversation.id === desktopCallRequest?.conversationId
                  ? desktopCallRequest
                  : null
              }
              desktopHeaderActionsRef={desktopHeaderActionsRef}
              onToggleDesktopHistory={() => handleToggleSidePanel("history")}
              onToggleDesktopDetails={() => handleToggleSidePanel("details")}
              onDesktopCallAction={handleDesktopCallAction}
              onDesktopCallRequestHandled={(token) => {
                setDesktopCallRequest((current) =>
                  current?.token === token ? null : current,
                );
              }}
              highlightedMessageId={
                activeConversation.id === selectedConversationId
                  ? highlightedMessageId
                  : undefined
              }
              buildMessageReturnTo={buildMessageReturnTo}
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
          panelRef={sidePanelRef}
          mode={rightPanelMode}
          title={
            rightPanelMode === "history"
              ? "查找聊天记录"
              : activeConversation.title
          }
          subtitle={
            rightPanelMode === "history" ? activeConversation.title : "聊天信息"
          }
          detailsVariant={
            rightPanelMode === "details" &&
            isPersistedGroupConversation(activeConversation)
              ? "wechat"
              : "default"
          }
          onBack={
            rightPanelMode === "history" && historyPanelCanReturnToDetails
              ? () => {
                  setRightPanelMode("details");
                  setHistoryPanelCanReturnToDetails(false);
                  setDetailsActionRequest(null);
                  navigateToChatWorkspace({
                    hash: buildCurrentChatRouteHash({
                      panel: "details",
                      detailsAction: undefined,
                    }),
                    replace: true,
                  });
                }
              : undefined
          }
          onClose={() => {
            dismissSidePanel();
          }}
        >
          {rightPanelMode === "history" ? (
            <DesktopChatHistoryPanel
              conversation={activeConversation}
              focusRequestKey={historyPanelFocusKey}
              onClose={() => {
                dismissSidePanel();
              }}
              onBackToDetails={
                historyPanelCanReturnToDetails
                  ? () => {
                      setRightPanelMode("details");
                      setHistoryPanelCanReturnToDetails(false);
                      setDetailsActionRequest(null);
                      navigateToChatWorkspace({
                        hash: buildCurrentChatRouteHash({
                          panel: "details",
                          detailsAction: undefined,
                        }),
                        replace: true,
                      });
                    }
                  : undefined
              }
              onOpenMessage={(messageId) => {
                setRightPanelMode(null);
                setHistoryPanelCanReturnToDetails(false);

                void navigate({
                  to: buildDesktopChatThreadPath({
                    conversationId: activeConversation.id,
                    messageId,
                  }),
                });
              }}
            />
          ) : (
            <DesktopChatDetailsPanel
              conversation={activeConversation}
              actionRequest={detailsActionRequest}
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

      {officialMessageContextMenu ? (
        <DesktopOfficialMessageContextMenu
          x={officialMessageContextMenu.x}
          y={officialMessageContextMenu.y}
          onClose={() => setOfficialMessageContextMenu(null)}
          items={
            officialMessageContextMenu.kind === "subscription"
              ? ([
                  {
                    key: "open-subscription",
                    label: "打开订阅号消息",
                    icon: <BookOpenText size={15} />,
                    onClick: () => {
                      setOfficialMessageContextMenu(null);
                      navigateToChatWorkspace({
                        hash: buildDesktopChatRouteHash({
                          officialView: "subscription-inbox",
                          articleId:
                            subscriptionInboxActive && selectedOfficialArticleId
                              ? selectedOfficialArticleId
                              : undefined,
                        }),
                      });
                    },
                  },
                  {
                    key: "open-directory",
                    label:
                      subscriptionInboxActive && selectedOfficialArticleId
                        ? "在通讯录中打开当前文章"
                        : "打开公众号目录",
                    icon: <ExternalLink size={15} />,
                    dividerBefore: true,
                    onClick: () => {
                      setOfficialMessageContextMenu(null);

                      if (
                        subscriptionInboxActive &&
                        selectedOfficialArticleId
                      ) {
                        navigateToChatWorkspace({
                          hash: buildDesktopChatRouteHash({
                            officialView: "official-accounts",
                            officialMode: "accounts",
                            articleId: selectedOfficialArticleId,
                          }),
                        });
                        return;
                      }

                      navigateToChatWorkspace({
                        hash: buildDesktopChatRouteHash({
                          officialView: "official-accounts",
                          officialMode: "feed",
                        }),
                      });
                    },
                  },
                  officialMessageContextMenu.summary.unreadCount > 0
                    ? {
                        key: "subscription-read",
                        label: "标记全部已读",
                        icon: <CheckCheck size={15} />,
                        dividerBefore: true,
                        disabled: officialMessageActionMutation.isPending,
                        onClick: () => {
                          officialMessageActionMutation.mutate({
                            kind: "subscription-read",
                          });
                        },
                      }
                    : null,
                ].filter(Boolean) as DesktopOfficialMessageContextMenuItem[])
              : ([
                  {
                    key: "open-service",
                    label: "打开服务号消息",
                    icon: <BookOpenText size={15} />,
                    onClick: () => {
                      setOfficialMessageContextMenu(null);
                      navigateToChatWorkspace({
                        hash: buildDesktopChatRouteHash({
                          officialView: "service-account",
                          accountId:
                            officialMessageContextMenu.conversation.accountId,
                          articleId:
                            selectedServiceAccountId ===
                              officialMessageContextMenu.conversation
                                .accountId && selectedOfficialArticleId
                              ? selectedOfficialArticleId
                              : undefined,
                        }),
                      });
                    },
                  },
                  {
                    key: "open-account",
                    label: "打开公众号主页",
                    icon: <ExternalLink size={15} />,
                    dividerBefore: true,
                    onClick: () => {
                      setOfficialMessageContextMenu(null);
                      navigateToChatWorkspace({
                        hash: buildDesktopChatRouteHash({
                          officialView: "official-accounts",
                          officialMode: "accounts",
                          accountId:
                            officialMessageContextMenu.conversation.accountId,
                          articleId:
                            selectedServiceAccountId ===
                            officialMessageContextMenu.conversation.accountId
                              ? selectedOfficialArticleId
                              : undefined,
                        }),
                      });
                    },
                  },
                  officialMessageContextMenu.conversation.unreadCount > 0
                    ? {
                        key: "service-read",
                        label: "标记已读",
                        icon: <CheckCheck size={15} />,
                        dividerBefore: true,
                        disabled: officialMessageActionMutation.isPending,
                        onClick: () => {
                          officialMessageActionMutation.mutate({
                            kind: "service-read",
                            conversation:
                              officialMessageContextMenu.conversation,
                          });
                        },
                      }
                    : null,
                  {
                    key: "service-mute",
                    label: officialMessageContextMenu.conversation.isMuted
                      ? "关闭免打扰"
                      : "消息免打扰",
                    icon: officialMessageContextMenu.conversation.isMuted ? (
                      <BellRing size={15} />
                    ) : (
                      <BellOff size={15} />
                    ),
                    dividerBefore:
                      officialMessageContextMenu.conversation.unreadCount === 0,
                    disabled: officialMessageActionMutation.isPending,
                    onClick: () => {
                      officialMessageActionMutation.mutate({
                        kind: "service-mute",
                        conversation: officialMessageContextMenu.conversation,
                      });
                    },
                  },
                ].filter(Boolean) as DesktopOfficialMessageContextMenuItem[])
          }
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

function DesktopMessageEntryCard({
  entry,
  activeConversationId,
  officialAccountsActive,
  selectedOfficialAccountId,
  selectedServiceAccountId,
  selectedOfficialArticleId,
  selectedOfficialDisplayMode,
  subscriptionInboxActive,
  localMessageActionState,
  conversationContextMenuId,
  officialMessageContextMenu,
  onConversationContextMenu,
  onSubscriptionContextMenu,
  onServiceConversationContextMenu,
}: {
  entry: DesktopMessageEntry;
  activeConversationId?: string;
  officialAccountsActive: boolean;
  selectedOfficialAccountId?: string;
  selectedServiceAccountId?: string;
  selectedOfficialArticleId?: string;
  selectedOfficialDisplayMode?: "feed" | "accounts";
  subscriptionInboxActive: boolean;
  localMessageActionState: ReturnType<typeof useLocalChatMessageActionState>;
  conversationContextMenuId?: string;
  officialMessageContextMenu:
    | {
        kind: "subscription";
      }
    | {
        kind: "service";
        accountId: string;
      }
    | null;
  onConversationContextMenu: (
    event: MouseEvent<HTMLElement>,
    conversation: ConversationListItem,
  ) => void;
  onSubscriptionContextMenu: (
    event: MouseEvent<HTMLElement>,
    summary: OfficialAccountSubscriptionInboxSummary,
  ) => void;
  onServiceConversationContextMenu: (
    event: MouseEvent<HTMLElement>,
    conversation: OfficialAccountServiceConversationSummary,
  ) => void;
}) {
  const navigate = useNavigate();

  if (entry.kind === "official-accounts") {
    return (
      <OfficialAccountsEntryCard
        unreadCount={entry.summary.unreadCount}
        lastActivityAt={entry.summary.lastActivityAt}
        preview={entry.summary.preview}
        active={officialAccountsActive}
        onClick={() => {
          const accountId = officialAccountsActive
            ? selectedOfficialAccountId
            : selectedServiceAccountId;
          const articleId =
            officialAccountsActive ||
            selectedServiceAccountId ||
            subscriptionInboxActive
              ? selectedOfficialArticleId
              : undefined;

          void navigate({
            to: "/tabs/chat",
            search: {},
            hash: buildDesktopChatRouteHash({
              officialView: "official-accounts",
              officialMode:
                selectedOfficialDisplayMode === "accounts"
                  ? "accounts"
                  : "feed",
              accountId,
              articleId,
            }),
          });
        }}
      />
    );
  }

  if (entry.kind === "subscription-inbox") {
    return (
      <SubscriptionInboxCard
        summary={entry.summary}
        variant="desktop"
        active={subscriptionInboxActive}
        contextMenuOpen={officialMessageContextMenu?.kind === "subscription"}
        onClick={() => {
          void navigate({
            to: "/tabs/chat",
            search: {},
            hash: buildDesktopChatRouteHash({
              officialView: "subscription-inbox",
              articleId:
                subscriptionInboxActive && selectedOfficialArticleId
                  ? selectedOfficialArticleId
                  : undefined,
            }),
          });
        }}
        onContextMenu={(event) =>
          onSubscriptionContextMenu(event, entry.summary)
        }
      />
    );
  }

  if (entry.kind === "service-account") {
    return (
      <OfficialServiceConversationCard
        conversation={entry.conversation}
        variant="desktop"
        active={entry.conversation.accountId === selectedServiceAccountId}
        contextMenuOpen={
          officialMessageContextMenu?.kind === "service" &&
          officialMessageContextMenu.accountId === entry.conversation.accountId
        }
        onClick={() => {
          void navigate({
            to: "/tabs/chat",
            search: {},
            hash: buildDesktopChatRouteHash({
              officialView: "service-account",
              accountId: entry.conversation.accountId,
              articleId:
                entry.conversation.accountId === selectedServiceAccountId &&
                selectedOfficialArticleId
                  ? selectedOfficialArticleId
                  : undefined,
            }),
          });
        }}
        onContextMenu={(event) =>
          onServiceConversationContextMenu(event, entry.conversation)
        }
      />
    );
  }

  return (
    <ConversationCard
      active={entry.conversation.id === activeConversationId}
      conversation={entry.conversation}
      localMessageActionState={localMessageActionState}
      contextMenuOpen={conversationContextMenuId === entry.conversation.id}
      onContextMenu={onConversationContextMenu}
    />
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
          <AvatarChip name={entry.title} src={entry.avatar} size="sm" />
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
        <AvatarChip name={conversation.title} src={conversation.avatar} />
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
        to={
          buildDesktopChatThreadPath({
            conversationId: conversation.id,
          }) as never
        }
        className={className}
        onContextMenu={(event) => onContextMenu(event, conversation)}
      >
        {content}
      </Link>
    );
  }

  return (
    <Link
      to={
        buildDesktopChatThreadPath({
          conversationId: conversation.id,
        }) as never
      }
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
