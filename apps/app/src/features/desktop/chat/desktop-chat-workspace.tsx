import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage, useRuntimeTranslator } from "@yinjie/i18n";
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
  type GroupMessage,
  type Message,
} from "@yinjie/contracts";
import { upsertServerMessageInCache } from "../../chat/chat-message-delivery";
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
import { SparkBadge } from "../../../components/spark-badge";
import { SubscriptionInboxCard } from "../../../components/subscription-inbox-card";
// 官号 / 订阅工作区是低频访问（用户在 chat 列表才偶尔切到），原静态 import
// 把它们硬塞进 chat-workspace-shell 132KB chunk。改成 lazy import 单独成
// chunk，桌面用户进聊天界面立刻能用，访问官号/订阅再现拉。
const DesktopOfficialAccountsWorkspace = lazy(async () => {
  const mod = await import(
    "../official-accounts/desktop-official-accounts-workspace"
  );
  return { default: mod.DesktopOfficialAccountsWorkspace };
});
const DesktopSubscriptionWorkspace = lazy(async () => {
  const mod = await import(
    "../official-accounts/desktop-subscription-workspace"
  );
  return { default: mod.DesktopSubscriptionWorkspace };
});
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
  getConversationDisplayTitle,
  getConversationPreviewParts,
  getConversationVisibleLastMessage,
} from "../../../lib/conversation-preview";
import {
  getConversationThreadType,
  isPersistedGroupConversation,
} from "../../../lib/conversation-route";
import { formatConversationTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { onChatMessage, onConversationUpdated } from "../../../lib/socket";
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
import { DesktopChatHistoryDialog } from "./desktop-chat-history-dialog";
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
  label: ReturnType<typeof msg>;
  icon: typeof Users;
};

type DesktopConversationDangerAction = "hide" | "clear" | "delete" | "leave";

const desktopQuickActionItems: DesktopQuickActionItem[] = [
  {
    key: "create-group",
    label: msg`发起群聊`,
    icon: Users,
  },
  {
    key: "add-friend",
    label: msg`添加朋友`,
    icon: UserPlus,
  },
  {
    key: "create-note",
    label: msg`新建笔记`,
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
  const t = useRuntimeTranslator();
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
  const threadSectionRef = useRef<HTMLElement | null>(null);
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

  // 与移动端 chat-list 同样：3s 轮询 → 60s 兜底 + onWindowFocus + 接 socket
  // onConversationUpdated/onChatMessage 即时 invalidate。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(ownerId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
  const messageEntriesQuery = useQuery({
    queryKey: ["app-official-message-entries", baseUrl],
    queryFn: () => getOfficialAccountMessageEntries(baseUrl),
    enabled: Boolean(ownerId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const blockedQuery = useQuery({
    queryKey: ["app-chat-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
    // 切到聊天 tab / 重 mount workspace 时不必每次都重拉黑名单——这份
    // 数据日常几乎不变（拉黑/解除是稀有操作，触发时都会主动 invalidate）。
    // 公网隧道 RTT ~600ms，省一次是一次。与 desktop-message-avatar-popover
    // / desktop-chat-details-panel 的 30s 对齐。
    staleTime: 30_000,
  });

  useEffect(() => {
    const offUpdated = onConversationUpdated(() => {
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });
    const offMessage = onChatMessage((payload) => {
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      // 直接把新消息写进对应会话的 messages cache：staleTime 内 useQuery 会先
      // 返回旧 cache 再后台 refetch，用户切到该会话先看不到新消息。setQueriesData
      // 直接合并进所有 messageLimit 变体的 cache，切到 chat-room 立刻就在。
      if ("conversationId" in payload) {
        queryClient.setQueriesData<Message[]>(
          { queryKey: ["app-conversation-messages", baseUrl, payload.conversationId] },
          (current) => upsertServerMessageInCache(current, payload),
        );
      } else if ("groupId" in payload) {
        queryClient.setQueriesData<GroupMessage[]>(
          { queryKey: ["app-group-messages", baseUrl, payload.groupId] },
          (current) => upsertServerMessageInCache(current, payload),
        );
      }
    });
    return () => {
      offUpdated();
      offMessage();
    };
  }, [baseUrl, queryClient]);

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
    keyword: "",
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
        searchTerm: "",
        getConversationPreviewText: (conversation) =>
          getConversationPreviewParts(conversation, localMessageActionState)
            .text,
      }),
    [
      conversations,
      localMessageActionState,
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

  // 多处 useEffect 用 activeConversation 整对象当 deps，conversationsQuery
  // 每 60s 轮询都给一个新引用，effect 跟着 cleanup → re-run，纯白用功。把 id
  // 提出来用，下游 effect 的 deps 改成稳定字符串。
  const activeConversationId = activeConversation?.id ?? null;

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
              : activeConversationId
                ? {
                    conversationId: activeConversationId,
                    messageId:
                      activeConversationId === selectedConversationId
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
      activeConversationId,
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

      if (rightPanelMode === "history") {
        return;
      }

      const target = event.target as Node;
      if (sidePanelRef.current?.contains(target)) {
        return;
      }

      if (desktopHeaderActionsRef.current?.contains(target)) {
        return;
      }

      // 不要把 thread 区（消息列表 / composer / 图片预览等）当成"点击外部"。
      // 详情侧栏开着时给中间 section 加了 xl:pr-[352px]，pointerdown 阶段
      // dismiss 一关 panel 整栏 padding 立刻消失，composer 右半边（含发送按钮）
      // 整体往右移；用户原 mousedown 落点上的 DOM 节点已经换走，pointerup
      // 命中不到原按钮，click 根本不 fire。结果就是「点了发送但没发出去 +
      // 侧栏被偷偷关掉」。thread 区交互的 dismiss 由 Esc / 关闭按钮 / 切会话
      // 各自处理，pointer 兜底只覆盖左侧会话列表 / 头像菜单这种远端区域。
      if (threadSectionRef.current?.contains(target)) {
        return;
      }

      // 走查新一轮 R1：avatar popover 等通过 createPortal 渲染到 document.body
      // 的浮层不在 threadSectionRef DOM 子树里——用户点 popover 卡片任意空白
      // 处时这里 dismiss 会把背后的「聊天信息」侧栏一起关掉。popover 自己打了
      // data-yj-portal-shield 标记，closest 命中就跳过 dismiss。
      if (
        target instanceof Element &&
        target.closest('[data-yj-portal-shield]')
      ) {
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
      !activeConversationId ||
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
    activeConversationId,
    closeRightPanel,
    officialAccountsActive,
    serviceConversationActive,
    selectedSidePanelMode,
    subscriptionInboxActive,
  ]);

  // 这里只依赖会话 id，不要把 activeConversation 整对象塞进去。
  // conversationsQuery 每 60s 轮询 / onWindowFocus / socket 推消息时都会拿到
  // 新的 conversation 对象引用，整 effect 会跟着重跑：
  //   - setDetailsActionRequest 用 Date.now() 现刷 token →
  //     DesktopChatDetailsPanel 那个 [actionRequest] effect 把 member-search /
  //     announcement / nickname 等动作再回放一次（已经在编辑的弹层被重新打开）
  //   - setHistoryPanelFocusKey(Date.now()) → DesktopChatHistoryPanel 那个
  //     [focusRequestKey] effect 把搜索框 focus + select 再来一遍，用户在
  //     查找记录里搜到一半时，下一次轮询会把已经输入的关键词全选高亮，
  //     下一个按键直接覆盖掉
  useEffect(() => {
    if (
      !activeConversationId ||
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
    activeConversationId,
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
      !activeConversationId ||
      activeConversationId !== selectedConversationId ||
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
    activeConversationId,
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
      activeConversationId === desktopCallRequest.conversationId
    ) {
      return;
    }

    setDesktopCallRequest(null);
  }, [activeConversationId, desktopCallRequest]);

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
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        // 不 preventDefault：下面那条 dismissSidePanel 用 window keydown +
        // queueMicrotask 兜底（line 919），defaultPrevented = false 就接着跑。
        // 用户在桌面单聊开着「聊天信息」侧栏然后右键会话列表里的另一段会话
        // 打开 contextMenu，按 Esc 会同时把 contextMenu 和背后的侧栏一起关
        // 掉。和 image viewer / chat-message-list contextMenu 同款修法。
        event.preventDefault();
        closeMenu();
      }
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [conversationContextMenu]);

  useEffect(() => {
    if (!officialMessageContextMenu) {
      return;
    }

    const closeMenu = () => setOfficialMessageContextMenu(null);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        // 跟上面 conversationContextMenu 同款：不 preventDefault 会让
        // dismissSidePanel 兜底把背后的「聊天信息」侧栏一起关掉。
        event.preventDefault();
        closeMenu();
      }
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
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

      // 跟其他 contextMenu Esc 同款：不 preventDefault 的话下面那条
      // dismissSidePanel microtask 兜底会接着跑。用户在桌面单聊开着「聊天
      // 信息」侧栏然后点 + 按钮打开 quick menu (发起群聊/添加朋友/新建笔记)，
      // 按 Esc 会同时把 menu 和背后的侧栏一起关掉。
      event.preventDefault();
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
    if (!rightPanelMode || rightPanelMode === "history") {
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

      // 同 handleWorkspacePointerDownCapture：thread 区交互（消息列表 /
      // composer / 图片预览等）不算"点击外部"——否则 details 侧栏开着时
      // 点发送按钮会先 dismiss 让 section padding 收回去，composer 整栏右
      // 移，原 mousedown 落点上的 DOM 已经换人，click 不 fire，消息没发出。
      if (threadSectionRef.current?.contains(target)) {
        return;
      }

      // 同 handleWorkspacePointerDownCapture：portal 浮层 (avatar popover 等)
      // 不在 threadSectionRef 子树里，用 data-yj-portal-shield 跳过 dismiss。
      if (
        target instanceof Element &&
        target.closest('[data-yj-portal-shield]')
      ) {
        return;
      }

      dismissSidePanel();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      // 这条 window keydown 是 details 侧栏开着时的「按 Esc 关侧栏」兜底。
      // 问题是 confirm/text-edit/forward/create-group 这些 dialog 的 Esc
      // handler 也都挂在 window 上 —— stopPropagation 在「同元素同事件」上
      // 不会阻断后续 sibling listener（MDN：use stopImmediatePropagation
      // for that）。worskpace effect 在 rightPanelMode 变 details 时挂上，
      // 早于 dialog 挂载；所以 Esc 时 workspace 先 fire，dismissSidePanel
      // 直接把侧栏关了，然后 dialog 再 fire 把弹窗也关了 —— 用户看到的是
      // "Esc 同时把弹窗和背后的侧栏都关掉"。Round 5/6/7 给 dialog Esc 补
      // stopPropagation 在 popover（document/bubble，在 window 之前）那条
      // 路径上有效，但 window/bubble 同元素 sibling 上根本拦不住。
      //
      // 走查电脑端群聊 R11：原写法把 dismissSidePanel 推到 queueMicrotask 期望
      //「所有同步 keydown listener 跑完后再检查 defaultPrevented」。但 HTML
      // 规范要求每个 event listener invocation 之间都跑一次 microtask
      // checkpoint —— Chromium / Firefox / Safari 实测都遵守。诊断 walk 实证：
      //   capture 听 ESC + queueMicrotask → 微任务在下一个 listener 之前就跑完
      //   workspace bubble 听 ESC + queueMicrotask → 在 dialog bubble 之前跑完
      // 所以 workspace 微任务里 `event.defaultPrevented` 永远是 false（dialog
      // bubble 还没机会 fire 它的 preventDefault），dismissSidePanel 直接执行
      // —— 「按 Esc 把弹窗和侧栏一起关掉」从来没真的修过。
      //
      // 改法：不靠 defaultPrevented，直接查 DOM ——
      // - dialog/modal 挂 `role="dialog"` aria-modal="true"（之前 a11y 走查 R1
      //   给一批 dialog 补齐过 + Cmd+F handler line 1097-1101 用同款查询）
      // - 消息 / 会话 / 官号 上下文菜单挂 `role="menu"`（group-message-context-menu /
      //   desktop-conversation-context-menu / desktop-official-message-context-menu
      //   a11y 都已经补齐）
      // microtask 时这些 overlay 还在 DOM 里（onClose 走 setState 异步），有就
      // skip。无 overlay 才真的 dismiss。注意不查 [data-yj-portal-shield] ——
      // workspace 自己的搜索框 / quick-menu 容器也用这个 attr 但是常驻元素，
      // 永远命中（和 Cmd+F handler 同款 caveat）。
      queueMicrotask(() => {
        if (
          typeof document !== "undefined" &&
          // 走查电脑端群聊新会话 R114b：原版 `[role="dialog"][aria-modal="true"],
          // [role="menu"]` 把 non-modal popover（StickerPanel / 各种 popup
          // dialog）排除在外，按 Esc 关那些 panel 时把侧栏一起 dismiss。放宽
          // 成 `[role="dialog"]` 单条命中即跳过 — semantic 上"任何 dialog/popover
          // 打开时按 Esc 都应该先关那个 dialog，不该顺手关侧栏"。已修过的
          // viewer/dialog 都还在白名单内（它们仍带 aria-modal=true，新查询也命
          // 中）；StickerPanel 这类 non-modal popup 终于能命中跳过 dismiss。
          document.querySelector(
            '[role="dialog"], [role="menu"]',
          )
        ) {
          return;
        }
        dismissSidePanel();
      });
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissSidePanel, rightPanelMode]);

  useEffect(() => {
    // 只依赖 id：activeConversation 整对象每次 conversationsQuery 轮询都换
    // 引用，把 effect 拖去 cleanup → re-attach window keydown，纯白用功。
    const hasActiveThread = Boolean(activeConversationId);
    if (
      !hasActiveThread ||
      subscriptionInboxActive ||
      officialAccountsActive ||
      serviceConversationActive
    ) {
      return;
    }

    // 「发起群聊」/「确认隐藏/清空/退群」对话框打开时不能再被 Cmd+F 抢
    // 走聚焦——用户按 Cmd+F 是希望在 dialog 内（如群聊搜索成员）触发
    // 浏览器原生 Find，或者就让按键穿透；不应该弹出右栏「聊天记录」遮住
    // 当前 dialog。
    const dialogActive =
      Boolean(createGroupDialogState) ||
      Boolean(conversationDangerAction) ||
      Boolean(conversationContextMenu) ||
      Boolean(officialMessageContextMenu);

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

      if (dialogActive) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      // 走查电脑端群聊 R8：dialogActive 只追踪 workspace 顶层 state 上挂的
      // 4 个 dialog；侧栏内嵌的 dialog（DesktopGroupMemberPicker /
      // DesktopGroupMemberRemovalPicker / DesktopGroupMemberBrowserDialog /
      // DesktopChatTextEditDialog / DesktopMessageForwardDialog 等）是
      // GroupChatDetailsPanel / 子组件自己的 useState，外面看不到。用户开着
      // 这些 dialog 按 Cmd+F → workspace 把 rightPanelMode 改成 "history" →
      // details panel unmount → 这些子 dialog 也跟着 unmount，用户当前的
      // 选成员/编辑名/转发流程被冲掉，右栏切到"查找聊天记录"。这些 dialog
      // 都挂了 role="dialog" aria-modal="true"（之前的 a11y 走查 R1 给一批
      // dialog 补齐过），DOM 查询能识别。注意不能查 [data-yj-portal-shield]
      // ——workspace 自己的搜索框 / quick-menu 容器也用这个 attr 但是常驻
      // 元素，永远命中。
      if (
        typeof document !== "undefined" &&
        document.querySelector('[role="dialog"][aria-modal="true"]')
      ) {
        return;
      }

      event.preventDefault();
      setRightPanelMode("history");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeConversationId,
    conversationContextMenu,
    conversationDangerAction,
    createGroupDialogState,
    officialAccountsActive,
    officialMessageContextMenu,
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
      setNotice(
        error instanceof Error ? error.message : t(msg`会话操作失败。`),
      );
    },
  });

  // 走查新一轮 R31：和 details-panel R29 (commit 01dcc31c6) 同款 — 会话右键
  // context menu 的「置顶 / 免打扰 / 标已读 / 标未读」4 个 toggle action 只挂
  // disabled={busy=conversationActionMutation.isPending}，busy 走 React state
  // 要等 commit 才生效。menu 在 pending 期间不会自动关（仅 hide/clear/leave
  // 走 danger 流程时手动 setConversationContextMenu(null)），同帧 <16ms double-
  // click 都看到 disabled=false → mutate 飞 2 次，公网隧道 RTT 双倍消耗 +
  // onSuccess 让 conversations / group-messages 缓存被重 invalidate 一次。
  // 叠 sync ref 锁兜同帧 double-tap，pending 翻 false 后 useEffect 复位。
  const conversationActionSubmittingRef = useRef(false);
  useEffect(() => {
    if (!conversationActionMutation.isPending) {
      conversationActionSubmittingRef.current = false;
    }
  }, [conversationActionMutation.isPending]);
  const guardedMutateConversationAction = useCallback(
    (variables: {
      action: "pin" | "mute" | "read" | "unread" | "hide" | "clear" | "delete" | "leave";
      conversation: ConversationListItem;
    }) => {
      if (conversationActionSubmittingRef.current) {
        return;
      }
      conversationActionSubmittingRef.current = true;
      conversationActionMutation.mutate(variables);
    },
    [conversationActionMutation],
  );

  const activeConversationDangerConfirm = useMemo(() => {
    if (!conversationDangerAction) {
      return null;
    }

    const { action, conversation } = conversationDangerAction;

    if (action === "hide") {
      return {
        title: t(msg`隐藏聊天`),
        description: t(
          msg`确认将这段聊天从消息列表中隐藏吗？有新消息时会再次出现。`,
        ),
        confirmLabel: t(msg`隐藏聊天`),
        pendingLabel: t(msg`正在隐藏...`),
        danger: false,
      };
    }

    if (action === "clear") {
      return {
        title: t(msg`清空聊天记录`),
        description: isPersistedGroupConversation(conversation)
          ? t(msg`确认清空这个群聊的聊天记录吗？`)
          : t(msg`确认清空这段聊天记录吗？`),
        confirmLabel: t(msg`清空记录`),
        pendingLabel: t(msg`正在清空...`),
        danger: true,
      };
    }

    if (action === "leave") {
      return {
        title: t(msg`删除并退出`),
        description: t(
          msg`删除并退出后，该群聊会从当前世界中移除。确认继续吗？`,
        ),
        confirmLabel: t(msg`删除并退出`),
        pendingLabel: t(msg`正在退出...`),
        danger: true,
      };
    }

    return {
      title: t(msg`删除聊天`),
      description: t(
        msg`删除后，这段聊天会从消息列表中移除；有新消息时会再次出现。`,
      ),
      confirmLabel: t(msg`删除聊天`),
      pendingLabel: t(msg`正在删除...`),
      danger: true,
    };
  }, [conversationDangerAction, t]);

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
          ? t(msg`已将订阅号消息标为已读。`)
          : action.kind === "service-read"
            ? t(msg`已将 ${action.conversation.account.name} 标为已读。`)
            : action.conversation.isMuted
              ? t(msg`已关闭 ${action.conversation.account.name} 的消息免打扰。`)
              : t(msg`已开启 ${action.conversation.account.name} 的消息免打扰。`),
      );
    },
    onError: (error) => {
      setOfficialMessageContextMenu(null);
      setNotice(
        error instanceof Error ? error.message : t(msg`公众号消息操作失败。`),
      );
    },
  });

  // 走查新一轮 R31：和上面 conversationActionMutation 同款 — 公众号消息
  // context menu 的「标记全部已读 / 标记已读 / 消息免打扰」3 个 action 同样
  // 只挂 disabled={isPending}，菜单不自动关，同帧 double-click 漏。
  const officialMessageActionSubmittingRef = useRef(false);
  useEffect(() => {
    if (!officialMessageActionMutation.isPending) {
      officialMessageActionSubmittingRef.current = false;
    }
  }, [officialMessageActionMutation.isPending]);
  const guardedMutateOfficialMessageAction = useCallback(
    (
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
      if (officialMessageActionSubmittingRef.current) {
        return;
      }
      officialMessageActionSubmittingRef.current = true;
      officialMessageActionMutation.mutate(action);
    },
    [officialMessageActionMutation],
  );

  // 走查 R1：「+」快捷菜单点 action 后只走 setIsQuickMenuOpen(false) 关菜单——
  // React state 要等 commit 才把 menu DOM 撤掉，同帧 <16ms double-click 都能
  // 命中 handleQuickAction。「新建笔记」分支 createDesktopNoteDraft() 不带任
  // 何 noteId/draftId hint，dedup 短路 (existing) 永远 miss → 两次同帧双击
  // 各 buildDraftId() 落 2 条 UUID 不同的草稿到 localStorage：一条被 navigate
  // 带去 /tabs/favorites 打开编辑器，另一条无主孤悬在草稿列表里。用户结束这次
  // 编辑回到 favorites 看到莫名其妙多出一条空草稿，得手动清。「发起群聊」/
  // 「添加朋友」两条同款双击下场：群聊弹层 setState 幂等问题不大，但 navigate
  // 也会被打两次，tanstack router 在同 hash 上重复 push 倒不至于多帧。统一
  // 用 requestAnimationFrame 兜同帧锁，下一帧自动复位让用户后续点击照常生效。
  const quickActionFiredRef = useRef(false);
  function handleQuickAction(key: DesktopQuickActionItem["key"]) {
    if (quickActionFiredRef.current) {
      return;
    }
    quickActionFiredRef.current = true;
    requestAnimationFrame(() => {
      quickActionFiredRef.current = false;
    });

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

  // 走查 R3：handleDesktopCallAction / 历史记录弹层 onOpenMessage 都靠
  // `void navigate(...)` 直冲，同帧 <16ms 双击：
  // · header 通话菜单「语音通话/视频通话」CallMenuButton onClick = setCallMenuOpen(false)
  //   + onSelectCall(kind) → handleDesktopCallAction → push 2 条 /desktop/mobile 历史
  //   项（call handoff 入口），用户从手机端回到桌面要按 2 次 Back。
  // · 查找记录弹层 result row「定位到聊天位置」按钮 onClick = onOpenMessage(id) →
  //   workspace setRightPanelMode(null) + navigate(threadPath) push 2 条相同 thread
  //   history，highlight 滚动也会拉两次 RAF。
  // 共享 rowNavigateFiredRef + raf 复位，和姊妹 chat-details-page guardRowNavigation
  // / 本文件 quickActionFiredRef 同款。
  const rowNavigateFiredRef = useRef(false);
  const guardRowNavigation = useCallback(
    <Args extends unknown[]>(handler: (...args: Args) => void) => {
      return (...args: Args) => {
        if (rowNavigateFiredRef.current) return;
        rowNavigateFiredRef.current = true;
        handler(...args);
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            rowNavigateFiredRef.current = false;
          });
        }
      };
    },
    [],
  );

  const handleDesktopCallAction = guardRowNavigation(
    (kind: DesktopChatCallKind) => {
      if (!activeConversation) {
        setNotice(t(msg`当前会话暂时不可用，请回到消息列表再试一次。`));
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
    },
  );

  const handleConversationContextMenu = useCallback(
    (
      event: MouseEvent<HTMLElement>,
      conversation: ConversationListItem,
    ) => {
      event.preventDefault();
      setOfficialMessageContextMenu(null);
      setConversationContextMenu({
        conversation,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  const handleSubscriptionContextMenu = useCallback(
    (
      event: MouseEvent<HTMLElement>,
      summary: OfficialAccountSubscriptionInboxSummary,
    ) => {
      event.preventDefault();
      setConversationContextMenu(null);
      setOfficialMessageContextMenu({
        kind: "subscription",
        summary,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  const handleServiceConversationContextMenu = useCallback(
    (
      event: MouseEvent<HTMLElement>,
      conversation: OfficialAccountServiceConversationSummary,
    ) => {
      event.preventDefault();
      setConversationContextMenu(null);
      setOfficialMessageContextMenu({
        kind: "service",
        conversation,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  // DesktopMessageEntryCard 是 memo 的，但内联拼对象会让每次 workspace 重渲染
  // （搜索框输入、reminders tick、conversationsQuery 60s refresh 等）都把所有
  // 会话卡片重渲染一遍。把这条 prop 抽出来 useMemo，保持引用稳定。
  const officialMessageContextMenuProp = useMemo(() => {
    if (officialMessageContextMenu?.kind === "subscription") {
      return { kind: "subscription" as const };
    }
    if (officialMessageContextMenu?.kind === "service") {
      return {
        kind: "service" as const,
        accountId: officialMessageContextMenu.conversation.accountId,
      };
    }
    return null;
  }, [officialMessageContextMenu]);

  // 走查新一轮 R7：context menu「在独立窗口打开」无任何同步锁，第一次
  // setConversationContextMenu(null) 走 React state，菜单不会立即从 DOM
  // 移走 — 同帧 <16ms double-click 都进入 handleOpenConversationWindow。
  // openDesktopStandaloneWindow 内部按 windowLabel 查重，但两次并发执行
  // 都先后跑 WebviewWindow.getByLabel：第一次 getByLabel→undefined→new
  // WebviewWindow 还在 Tauri 内部 settle 期间，第二次 getByLabel 也拿不到
  // → 也尝试 new WebviewWindow(same label) → Tauri 返回「window already
  // exists」走 tauri://error → 这条 Promise resolve 出 false → 用户看到
  // 「浏览器阻止了新窗口，请检查弹窗权限」红色 notice，但第一次明明成功了。
  // 按 conversationId 上锁（连续右键 2 段不同会话打开窗口是合法用法）。
  const openingWindowConversationIdsRef = useRef<Set<string>>(new Set());
  async function handleOpenConversationWindow(
    conversation: ConversationListItem,
  ) {
    if (openingWindowConversationIdsRef.current.has(conversation.id)) {
      return;
    }
    openingWindowConversationIdsRef.current.add(conversation.id);
    try {
      const opened = await openDesktopChatWindow({
        conversationId: conversation.id,
        conversationType: getConversationThreadType(conversation),
        // R1：和 ConversationCardLink 同款，独立窗口 title 也得翻 sentinel——
        // 否则 Tauri 把 raw「未知联系人」/「Direct conversation」当 OS-level
        // window title 写进任务栏/Mission Control，跨 locale 用户看到字面量。
        title: getConversationDisplayTitle(conversation.title),
        returnTo: buildDesktopChatThreadPath({
          conversationId: conversation.id,
        }),
      });

      setConversationContextMenu(null);
      setNotice(
        opened
          ? t(msg`已在独立窗口打开聊天。`)
          : t(msg`浏览器阻止了新窗口，请检查弹窗权限。`),
      );
    } finally {
      openingWindowConversationIdsRef.current.delete(conversation.id);
    }
  }

  // 走查新一轮 R7：消息提醒 section「清空已通知」/ 类似分组清空按钮 onClick
  // 是 `void handleClearReminderGroup(status, messageIds)`，handleClearReminderGroup
  // 无任何同步锁。clearReminders 内部 Promise.allSettled 跑 N 个 DELETE，第一次
  // 跑完后所有 reminders 都已经从 server 端删掉；同帧 double-click 起飞的第二
  // 次 handleClearReminderGroup 拿着同一份 messageIds，clearReminder(messageId)
  // 闭包里读到的 reminderMap 是上一次 render 的快照（localReminders state 没
  // 提交），仍然找到 reminder → mutateAsync(sourceId) 命中 server 已删的资源
  // → 404 → Promise.allSettled rejected → clearReminders throw → catch 分支
  // setNotice 写「清空失败」红色 notice 覆盖前一次的「已清空 N 条提醒」绿色
  // notice，但 server 端早就成功。和姊妹 chat-message-list R6 handleClearReminder
  // 同款 false-failure 修法，按 status 上锁（不同 status 分组互不影响）。
  const clearingReminderStatusRef = useRef<Set<ChatReminderStatus>>(new Set());
  async function handleClearReminderGroup(
    status: ChatReminderStatus,
    messageIds: string[],
  ) {
    if (!isChatReminderGroupClearable(status)) {
      return;
    }

    if (clearingReminderStatusRef.current.has(status)) {
      return;
    }
    clearingReminderStatusRef.current.add(status);

    try {
      await clearReminders(messageIds);
      setNotice(getChatReminderGroupClearNotice(status, messageIds.length));
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : getChatReminderGroupClearErrorMessage(status),
      );
    } finally {
      clearingReminderStatusRef.current.delete(status);
    }
  }

  // 兜底拦掉 drop：composer 自己有完整的拖拽附件流程，但用户把文件拖出
  // composer、drop 到会话列表 / 消息列表 / 侧栏这些没 drop 处理的区域时，
  // 浏览器默认行为是「把文件 URL 当导航跑」—— 整页跳走打开本地文件，所有
  // 未发完的消息和状态全没了。这里在 workspace 根上 preventDefault 兜底，
  // composer 内部 drop 不受影响（composer onDragOver/onDrop 仍然在 React
  // 事件冒泡前被调用，attachment 流程照常）。
  const handleWorkspaceDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) {
        return;
      }
      if (!event.dataTransfer.types.includes("Files")) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "none";
    },
    [],
  );
  const handleWorkspaceDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) {
        return;
      }
      if (!event.dataTransfer.types.includes("Files")) {
        return;
      }
      event.preventDefault();
    },
    [],
  );

  return (
    <div
      className="relative flex h-full min-h-0"
      onPointerDownCapture={handleWorkspacePointerDownCapture}
      onDragOver={handleWorkspaceDragOver}
      onDrop={handleWorkspaceDrop}
    >
      {standaloneWindow ? null : (
        <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
          <div className="border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] px-3 py-3 backdrop-blur-xl">
            <div className="relative z-20 flex items-center gap-2">
              {/* 走查新一轮 R13：和 R11 quickMenu 同款思路。聊天列表顶部的
                  搜索框 + 展开的 DesktopSearchDropdownPanel 都在 chat list 子树
                  里、不在 threadSectionRef / sidePanelRef / desktopHeaderActionsRef
                  保护区。用户开着「聊天信息」侧栏想点搜索框「随手搜一下」时，
                  pointerdown capture 兜底先 dismissSidePanel —— 还没开始打字
                  当前会话的详情侧栏就已经被偷关。搜索结果点击导航走 React Router，
                  会通过 workspace 自己的 useEffect 链根据新 routeState 处理侧栏，
                  不依赖这个 dismiss。所以给搜索容器加 shield 安全。 */}
              <div
                ref={desktopSearchLauncher.containerRef}
                className="relative min-w-0 flex-1"
                data-yj-portal-shield="desktop-chat-search-launcher"
              >
                <TextField
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onClick={() => desktopSearchLauncher.setIsOpen(true)}
                  onFocus={() => desktopSearchLauncher.setIsOpen(true)}
                  onKeyDown={handleSearchFieldKeyDown}
                  placeholder={t(msg`搜索`)}
                  // 走查 R75：原版只有 placeholder=「搜索」单字，SR (NVDA/JAWS)
                  // 多数实现在用户开始打字后就不再朗读 placeholder。盲人用户
                  // focus 进来只听到「编辑栏 搜索 空」或「编辑栏」，不知道
                  // 这是搜索什么（联系人？聊天记录？全部？）。本字段是 chat
                  // workspace 顶栏的全局搜索，open 后弹 DesktopSearchDropdownPanel
                  // 覆盖聊天/联系人/收藏多个 scope。和姊妹搜索框 R23/R24
                  // 同款补 aria-label 让意图明确。
                  aria-label={t(msg`搜索聊天和联系人`)}
                  className="flex-1 rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] py-2 pl-3.5 pr-11 text-[13px] shadow-none hover:bg-white focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-none"
                />
                <button
                  type="button"
                  onClick={desktopSearchLauncher.handleSpeechButtonClick}
                  className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-[color:var(--text-dim)] transition hover:bg-[color:var(--surface-card)] hover:text-[color:var(--text-primary)]"
                  aria-label={
                    desktopSearchLauncher.speechListening
                      ? t(msg`结束语音输入`)
                      : t(msg`开始语音输入`)
                  }
                  title={
                    desktopSearchLauncher.speechSupported
                      ? desktopSearchLauncher.speechListening
                        ? t(msg`结束语音输入`)
                        : t(msg`语音输入`)
                      : t(msg`当前浏览器不支持语音输入`)
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
                    source="chat"
                    speechDisplayText={desktopSearchLauncher.speechDisplayText}
                    speechError={desktopSearchLauncher.speechError}
                    speechStatus={desktopSearchLauncher.speechStatus}
                  />
                ) : null}
              </div>
              {/* 走查新一轮 R11：「+」快捷按钮 + 展开的下拉菜单都在 chat list
                  里，不在 threadSectionRef / sidePanelRef / desktopHeaderActionsRef
                  保护区，开着「聊天信息」侧栏点 + 按钮的瞬间 workspace
                  pointerdown capture 兜底就 dismissSidePanel —— 用户原意只是
                  打开快捷菜单（发起群聊 / 添加朋友 / 新建笔记），结果当前会话
                  的详情侧栏被偷偷关掉，发起群聊弹框出来后用户回头发现侧栏没了。
                  对发起群聊这条尤其坑：用户点取消时已经回不到原来的浏览状态。
                  和 R10 给 conversation / official context menu 同款思路：
                  整段 quickMenu wrapper（含按钮 + dropdown）挂 portal-shield。 */}
              <div
                ref={quickMenuRef}
                className="relative shrink-0"
                data-yj-portal-shield="desktop-chat-quick-menu"
              >
                <button
                  type="button"
                  onClick={() => setIsQuickMenuOpen((current) => !current)}
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
                  aria-label={
                    isQuickMenuOpen ? t(msg`关闭快捷菜单`) : t(msg`打开快捷菜单`)
                  }
                  aria-haspopup="menu"
                  aria-expanded={isQuickMenuOpen}
                >
                  <Plus size={17} strokeWidth={2.2} />
                </button>

                {isQuickMenuOpen ? (
                  // 走查新一轮 R8：和 R6 / 官号 context menu 同款 a11y——「+」
                  // 按钮已经挂了 aria-label，但展开后的浮层是个裸 div，盲人
                  // 屏幕阅读器只听到一串「发起群聊 / 添加朋友 / 新建笔记」
                  // button label 浮空，不知道是「快捷菜单」。补 role="menu" +
                  // aria-label 让 SR 知道是上下文菜单。
                  <div
                    role="menu"
                    aria-label={t(msg`快捷操作菜单`)}
                    className="absolute right-0 top-[calc(100%+0.4rem)] z-20 w-44 overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-white p-1.5 shadow-[var(--shadow-overlay)]"
                  >
                    {desktopQuickActionItems.map((item) => {
                      const Icon = item.icon;

                      return (
                        <button
                          key={item.key}
                          type="button"
                          // R63 续：父 role="menu" 需要 menuitem 子元素，
                          // 否则 VoiceOver / JAWS menu 模式跳过这些 button。
                          role="menuitem"
                          onClick={() => handleQuickAction(item.key)}
                          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-console)]"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]">
                            <Icon size={16} />
                          </div>
                          <span>{t(item.label)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            {notice ? (
              // R36：notice 是 2400ms 自动消失的 transient toast（line 826
              // useEffect 设的 setTimeout），用来反馈右键 / quick-menu 操作结果
              // （置顶 / 标已读 / 删除 / 清空 / 退出群聊 等）。原版只是 div，
              // 盲人 SR 完全感知不到这条短暂的状态反馈，操作完没有 audible
              // 信号。补 role="status" + aria-live="polite"，让 SR 在 notice
              // 渲染时朗读一遍；polite 不抢 SR 当前正在朗读的内容，2.4s 内
              // 消失也来得及念完一条 toast。
              <InlineNotice
                role="status"
                aria-live="polite"
                className="mt-3 border-[color:var(--border-faint)] bg-white text-xs"
                tone="info"
              >
                {notice}
              </InlineNotice>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-2.5">
            {conversationsQuery.isLoading ? (
              <LoadingBlock label={t(msg`正在读取会话...`)} />
            ) : null}
            {/* R50：电脑端聊天工作区左侧会话列表的 3 个 ErrorBlock 都裸 <div>，
                没 role / aria-live。conversations / messageEntries / blocked
                是单聊主入口的核心 cache（公网隧道首次加载或网络中断时 4xx/5xx
                极易触发），盲人 SR 用户进 chat workspace 听到「正在读取会话」
                消失却不知道为什么列表是空的。挂 role="alert" 让 SR 立刻播报。 */}
            {conversationsQuery.isError &&
            conversationsQuery.error instanceof Error ? (
              <ErrorBlock role="alert" message={conversationsQuery.error.message} />
            ) : null}
            {messageEntriesQuery.isError &&
            messageEntriesQuery.error instanceof Error ? (
              <ErrorBlock role="alert" message={messageEntriesQuery.error.message} />
            ) : null}
            {blockedQuery.isError && blockedQuery.error instanceof Error ? (
              <ErrorBlock role="alert" message={blockedQuery.error.message} />
            ) : null}

            <div className="space-y-1">
              {filteredReminderEntries.length ? (
                // 走查新一轮 R14：和 R11 quickMenu / R13 搜索容器同款。消息提醒
                // section（展开 / 收起 / 清空已通知 / 单条「完成」按钮）这些动作
                // 都是 in-place mutate state，不导航。但 section 在 chat list 子树
                // 里、不在保护区，开着「聊天信息」侧栏的用户点提醒上的「完成」按钮
                // 想关掉一条提醒时，pointerdown capture 把背后的详情侧栏一起偷关。
                // 提醒卡的「打开」按钮才是 navigate（onOpen 走 chatReminderNavigation
                // → 切会话），那条配合 dismiss 是合理的；但 React Router 路由变化
                // 后 workspace 会经 useEffect 链自然处理侧栏，不依赖这条 dismiss。
                // 给整个 reminder section 加 shield 是安全的。
                <section
                  data-yj-portal-shield="desktop-chat-reminder-section"
                  className="overflow-hidden rounded-[12px] border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.05)] p-2 shadow-none"
                >
                  <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]">
                        <BellRing size={14} />
                      </div>
                      <span>{t(msg`消息提醒`)}</span>
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
                                        ? t(msg`展开已通知提醒`)
                                        : t(msg`收起已通知提醒`)
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
                  officialMessageContextMenu={officialMessageContextMenuProp}
                  onConversationContextMenu={handleConversationContextMenu}
                  onSubscriptionContextMenu={handleSubscriptionContextMenu}
                  onServiceConversationContextMenu={
                    handleServiceConversationContextMenu
                  }
                />
              ))}
            </div>

          </div>
        </section>
      )}

      {/* 详情侧栏开着时给中间这一栏加上 352px 右内边距：DesktopChatSidePanel
          走 absolute（top-[64px] right-0 w-[352px] xl:flex），不占 flex 空间，
          没这层 padding 的话用户消息和 composer 右半部分（含发送按钮）会被
          panel 整块盖住——1440 屏实测用户气泡 (1075~1324) 整条都掉进 aside
          (1066~1418) 区域里看不见，发送按钮也躲在 panel 后面点不到。查找记录
          走中央弹窗，不进这条 padding。 */}
      <section
        ref={threadSectionRef}
        className={cn(
          "min-w-0 flex-1",
          rightPanelMode === "details" ? "xl:pr-[352px]" : "",
        )}
      >
        {officialAccountsActive ? (
          <Suspense fallback={null}>
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
          </Suspense>
        ) : subscriptionInboxActive ? (
          <Suspense fallback={null}>
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
          </Suspense>
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
                title={t(msg`这段聊天已经不存在`)}
                description={t(msg`它可能已被隐藏、删除，或者当前上下文已经失效。`)}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-10">
            <div className="w-full max-w-md rounded-[18px] border border-[color:var(--border-faint)] bg-white/86 px-8 py-10 shadow-[var(--shadow-soft)]">
              <EmptyState
                title={t(msg`选择一段聊天开始工作`)}
                description={t(
                  msg`左侧会话列表用于切换聊天，右侧再按需展开聊天信息或记录。`,
                )}
              />
            </div>
          </div>
        )}
      </section>

      {activeConversation && rightPanelMode === "details" ? (
        <DesktopChatSidePanel
          panelRef={sidePanelRef}
          mode={rightPanelMode}
          title={
            getConversationDisplayTitle(activeConversation.title) ||
            (isPersistedGroupConversation(activeConversation)
              ? t(msg`群聊`)
              : t(msg`聊天`))
          }
          subtitle={t(msg`聊天信息`)}
          detailsVariant={
            isPersistedGroupConversation(activeConversation)
              ? "wechat"
              : "default"
          }
          onClose={() => {
            dismissSidePanel();
          }}
        >
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
        </DesktopChatSidePanel>
      ) : null}

      {activeConversation && rightPanelMode === "history" ? (
        <DesktopChatHistoryDialog
          open
          conversation={activeConversation}
          focusRequestKey={historyPanelFocusKey}
          canReturnToDetails={historyPanelCanReturnToDetails}
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
          onOpenMessage={guardRowNavigation((messageId: string) => {
            setRightPanelMode(null);
            setHistoryPanelCanReturnToDetails(false);

            void navigate({
              to: buildDesktopChatThreadPath({
                conversationId: activeConversation.id,
                messageId,
              }),
            });
          })}
        />
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
            guardedMutateConversationAction({
              action: "pin",
              conversation: conversationContextMenu.conversation,
            })
          }
          onToggleMuted={() =>
            guardedMutateConversationAction({
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
            guardedMutateConversationAction({
              action: "read",
              conversation: conversationContextMenu.conversation,
            })
          }
          onMarkUnread={() =>
            guardedMutateConversationAction({
              action: "unread",
              conversation: conversationContextMenu.conversation,
            })
          }
          hideLabel={t(msg`隐藏聊天`)}
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
              ? t(msg`删除并退出`)
              : t(msg`删除聊天`)
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
                    label: t(msg`打开订阅号消息`),
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
                        ? t(msg`在通讯录中打开当前文章`)
                        : t(msg`打开公众号目录`),
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
                        label: t(msg`标记全部已读`),
                        icon: <CheckCheck size={15} />,
                        dividerBefore: true,
                        disabled: officialMessageActionMutation.isPending,
                        onClick: () => {
                          guardedMutateOfficialMessageAction({
                            kind: "subscription-read",
                          });
                        },
                      }
                    : null,
                ].filter(Boolean) as DesktopOfficialMessageContextMenuItem[])
              : ([
                  {
                    key: "open-service",
                    label: t(msg`打开服务号消息`),
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
                    label: t(msg`打开公众号主页`),
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
                        label: t(msg`标记已读`),
                        icon: <CheckCheck size={15} />,
                        dividerBefore: true,
                        disabled: officialMessageActionMutation.isPending,
                        onClick: () => {
                          guardedMutateOfficialMessageAction({
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
                      ? t(msg`关闭免打扰`)
                      : t(msg`消息免打扰`),
                    icon: officialMessageContextMenu.conversation.isMuted ? (
                      <BellRing size={15} />
                    ) : (
                      <BellOff size={15} />
                    ),
                    dividerBefore:
                      officialMessageContextMenu.conversation.unreadCount === 0,
                    disabled: officialMessageActionMutation.isPending,
                    onClick: () => {
                      guardedMutateOfficialMessageAction({
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

          guardedMutateConversationAction({
            action: conversationDangerAction.action,
            conversation: conversationDangerAction.conversation,
          });
        }}
      />
    </div>
  );
}

const DesktopMessageEntryCard = memo(function DesktopMessageEntryCard({
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
    <ConversationCardLink
      active={entry.conversation.id === activeConversationId}
      conversation={entry.conversation}
      localMessageActionState={localMessageActionState}
      contextMenuOpen={conversationContextMenuId === entry.conversation.id}
      onContextMenu={onConversationContextMenu}
    />
  );
});

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
        // 走查电脑端群聊 R96：和姊妹 ConversationCardLink R22 同款修法——
        // 桌面工作区左侧「消息提醒」面板里 reminder 行的 active 态（当前
        // selectedConversationId + 当前 highlightedMessageId 命中时点亮绿边框 +
        // 白底 + soft shadow）只是视觉差。盲人 SR 走过去逐条听 reminder 状态 +
        // 标题 + 预览 + 时间，听不到"这条提醒就是当前正在右侧聊天窗高亮的
        // 那条群消息提醒"。entry.threadType=group 时 reminder 也走这条卡片，
        // 群消息提醒同款问题。SR 用方向键或 Tab 浏览整列时缺 anchoring。
        // aria-current="true" 让 SR 在朗读 button 时附加"当前"语义，和
        // ConversationCardLink 已挂的 aria-current="page" 协调一致——这里
        // 不是 page 导航是 message-anchor，spec 允许 true / location / step /
        // page 等离散值，用 "true" 表达"当前选中项"。
        aria-current={active ? "true" : undefined}
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

const ConversationCardLink = memo(function ConversationCardLink({
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
  const t = useRuntimeTranslator();
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
  // 走查 R1：移动端 chat-list-page / chat-details-page / chat-message-search-page
  // / chat-background-page / use-conversation-thread 都经
  // getConversationDisplayTitle(conversation.title) 把服务端持久化的中/英文
  // 占位 sentinel（normalizeLegacyConversationEntity 写入的「未知联系人」/
  //「Direct conversation」）翻成当前 locale；桌面端会话列表 ConversationCardLink
  // 直接渲染 raw conversation.title → en-US/ja-JP/ko-KR 用户在列表里看到
  // 突兀的中文「未知联系人」（或反过来 zh-CN 用户看到英文「Direct conversation」）。
  // GroupAvatarChip / AvatarChip 的 name 还用来跑 SVG fallback 首字，sentinel
  // 字面量被取首字「未」/「D」也不合 locale；统一翻一遍。
  const displayTitle = getConversationDisplayTitle(conversation.title);

  const content = (
    <>
      {/* R35：会话 isPinned 只通过 className 切到 bg-[rgba(240,244,242,0.92)]
          的视觉差表达，没有任何 SR 可感知的文本。盲人用户在会话列表里只能
          听到会话名 / preview / 时间戳 / 未读数，听不出"这条是置顶的"。
          桌面端 contextMenu 已经能改置顶状态（置顶聊天 / 取消置顶），但
          state 反馈完全是视觉的；和姊妹 isMuted 已有 BellOff + aria-label
          的处理方向一致。补一段 sr-only 文本到 content 开头，SR 朗读时
          会先报"已置顶 + 会话名 ..."，明确表达列表里的位置语义。 */}
      {conversation.isPinned ? (
        <span className="sr-only">{t(msg`已置顶`)}</span>
      ) : null}
      {isGroupConversation ? (
        <GroupAvatarChip
          name={displayTitle}
          members={conversation.participants}
        />
      ) : (
        <AvatarChip name={displayTitle} src={conversation.avatar} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
              {displayTitle}
            </div>
            {isGroupConversation ? (
              <span className="shrink-0 rounded-full border border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)]">
                {t(msg`群聊`)}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
            {conversation.sparkStreak ? (
              <SparkBadge streak={conversation.sparkStreak} size="sm" />
            ) : null}
            <span>
              {formatConversationTimestamp(
                visibleLastMessage?.createdAt ??
                  conversation.lastMessage?.createdAt ??
                  conversation.updatedAt,
              )}
            </span>
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
                {t(msg`有人@所有人`)}
              </span>
            ) : null}
            {conversation.isMuted ? (
              <BellOff
                size={13}
                className="text-[color:var(--text-dim)]"
                aria-label={t(msg`消息免打扰`)}
              />
            ) : null}
            {conversation.unreadCount > 0 ? (
              conversation.isMuted ? (
                // 走查电脑端群聊 R106：和姊妹 R105 GroupAvatarChip 同款 — 裸 <div>
                // 挂 aria-label 没 role，按 ARIA 1.2 spec 在 generic 元素上 aria-label
                // 行为是 implementation-defined，部分 SR（Chromium AX tree 早期版本 /
                // VoiceOver 严格模式）不暴露。muted 变体只是一个红色 2×2 视觉小点，
                // 没有 inner text 也没 role，盲人 SR 走会话卡片时根本听不到"N 条
                // 未读消息"提示——muted 群尤其需要这层 fallback 反馈（既然把通知
                // 静音了，列表里这个红点几乎是用户唯一的未读信号）。补 role="img"
                // 把它当作"一张被命名的视觉指示"，AT 一致暴露 aria-label。
                <div
                  role="img"
                  className="h-2 w-2 rounded-full bg-[#fa5151]"
                  aria-label={t(msg`${conversation.unreadCount} 条未读消息`)}
                />
              ) : (
                // 走查新一轮 R3：muted 变体已挂 aria-label「${count} 条未读
                // 消息」（line 上方），非 muted 变体只渲染数字 / "99+" 裸 text。
                // SR 走到会话卡片，逐字朗读完会话名 + lastMessage + 时间戳后只
                // 听到一句「5」/「99+」——无上下文，盲人用户得自己猜这个数字
                // 是什么。补 aria-label 把语义补齐，inner span 用 aria-hidden
                // 隔离视觉数字避免某些 SR 实现把 aria-label + 子文本重复念两遍。
                // 和姊妹 official-message-entry-row 同款问题，下方一并修。
                //
                // 走查电脑端群聊 R106：同上 — 补 role="img" 让 aria-label 在
                // 不带 role 的 generic <div> 上仍被 AT 暴露。inner <span
                // aria-hidden="true"> 防"99+"裸文本被某些 SR 在 role="img"
                // 名称之外又复读一遍。
                <div
                  role="img"
                  className="min-w-5 rounded-full bg-[#fa5151] px-1.5 py-0.5 text-center text-[10px] text-white"
                  aria-label={t(msg`${conversation.unreadCount} 条未读消息`)}
                >
                  <span aria-hidden="true">
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </span>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <Link
      to={
        buildDesktopChatThreadPath({
          conversationId: conversation.id,
        }) as never
      }
      className={className}
      // R22：桌面会话列表的 active 态只靠 className 视觉边框区分（白底 + 绿色
      // 边框 + soft shadow），盲人屏幕阅读器 Tab 走到列表里逐项朗读会话名 +
      // lastMessage + 时间戳，但听不到"这条是当前正在右侧显示的会话"。
      // SR 通过 aria-current 才能在 link 列表里识别"当前页/项"，否则盲人用户
      // 切回会话列表用方向键浏览时根本不知道焦点是不是已经回到了原来那条。
      // 和姊妹移动端 chat-list-page 一致（mobile 走 active style + aria-current
      // 都已有）；桌面端单聊这条入口长期缺。
      aria-current={active ? "page" : undefined}
      onContextMenu={(event) => onContextMenu(event, conversation)}
    >
      {content}
    </Link>
  );
});

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
      return conversation.isPinned
        ? translateRuntimeMessage(msg`已取消置顶聊天。`)
        : translateRuntimeMessage(msg`聊天已置顶。`);
    case "mute":
      return conversation.isMuted
        ? translateRuntimeMessage(msg`已关闭消息免打扰。`)
        : translateRuntimeMessage(msg`已开启消息免打扰。`);
    case "read":
      return translateRuntimeMessage(msg`已标记为已读。`);
    case "unread":
      return translateRuntimeMessage(msg`已标记为未读。`);
    case "hide":
      return isPersistedGroupConversation(conversation)
        ? translateRuntimeMessage(msg`群聊已隐藏。`)
        : translateRuntimeMessage(msg`聊天已隐藏。`);
    case "clear":
      return isPersistedGroupConversation(conversation)
        ? translateRuntimeMessage(msg`群聊记录已清空。`)
        : translateRuntimeMessage(msg`聊天记录已清空。`);
    case "delete":
      return translateRuntimeMessage(msg`聊天已从列表移除。`);
    case "leave":
      return translateRuntimeMessage(msg`已删除并退出群聊。`);
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

    if (segment.kind === "sticker") {
      return (
        <img
          key={`sticker-${index}-${segment.packId}-${segment.stickerId}`}
          src={segment.src}
          alt={segment.label}
          draggable={false}
          // 走查电脑端单聊 R84：和姊妹 chat-message-list renderTextWithMentions
          // (line 5830-5839) 同款 — 那边 sticker <img> 早已挂 loading="lazy"
          // + decoding="async"，本会话列表 preview 里的 builtin sticker
          // emoji 漏挂。chat list 一进入桌面 workspace 通常渲染 50+ 会话，
          // 每条 lastMessage preview 都跑一遍 splitChatTextSegments，命中
          // builtin sticker 的（"在吗 [微笑]" / "[偷笑] 看下这张图" 等）
          // 全部 eager 加载——虽然 sticker assets 是 Vite bundle 同源、单
          // 文件小，但首屏 N 个 <img> 同时进 decode 队列、抢主线程，列表
          // 渲染稍卡。和 chat-message-list 那边对齐补两个 attr。
          loading="lazy"
          decoding="async"
          className="inline-block h-5 w-5 align-[-0.35em] object-contain"
        />
      );
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
