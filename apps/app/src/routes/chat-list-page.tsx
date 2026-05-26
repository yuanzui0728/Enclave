import {
  Suspense,
  memo,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  getConversations,
  getOfficialAccountMessageEntries,
  hideConversation,
  hideGroup,
  isApiRequestError,
  markConversationRead,
  markConversationUnread,
  markGroupRead,
  markGroupUnread,
  setConversationMuted,
  setConversationPinned,
  setGroupPinned,
  updateGroupPreferences,
  type ConversationListItem,
  type GroupMessage,
  type Message,
} from "@yinjie/contracts";
import { upsertServerMessageInCache } from "../features/chat/chat-message-delivery";
import {
  BellOff,
  BellRing,
  CheckCheck,
  Circle,
  FileText,
  Plus,
  Pin,
  QrCode,
  Search,
  Trash2,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";

import { AvatarChip } from "../components/avatar-chip";
import { GroupAvatarChip } from "../components/group-avatar-chip";
import { OfficialServiceConversationCard } from "../components/official-service-conversation-card";
import { RouteRedirectState } from "../components/route-redirect-state";
import { SparkBadge } from "../components/spark-badge";
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
import { buildMobileAddFriendRouteHash } from "../features/contacts/mobile-add-friend-route-state";
import { buildMobileFriendRequestsRouteHash } from "../features/contacts/mobile-friend-requests-route-state";
import { createDesktopNoteDraft } from "../features/favorites/note-drafts-storage";
import { buildMobileNoteEditorRouteHash } from "../features/notes/mobile-note-editor-route-state";
import { buildSearchRouteHash } from "../features/search/search-route-state";
import { useMessageReminders } from "../features/chat/use-message-reminders";
import { useChatReminderActions } from "../features/chat/use-chat-reminder-actions";
import { useChatReminderEntries } from "../features/chat/use-chat-reminder-entries";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { normalizePathname } from "../lib/normalize-pathname";
import {
  getConversationDisplayTitle,
  getConversationPreviewParts,
  getConversationVisibleLastMessage,
} from "../lib/conversation-preview";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import { formatConversationTimestamp } from "../lib/format";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import {
  onChatMessage,
  onChatSocketConnect,
  onConversationUpdated,
} from "../lib/socket";

type QuickActionItem = {
  key: string;
  label: ChatListMessage;
  icon: typeof Users;
  to?: "/group/new" | "/friend-requests" | "/add-friend" | "/notes/new";
  disabled?: boolean;
  disabledLabel?: ChatListMessage;
};

type ChatListMessage = ReturnType<typeof msg>;

const quickActionItems: QuickActionItem[] = [
  {
    key: "create-group",
    label: msg`发起群聊`,
    icon: Users,
    to: "/group/new",
  },
  {
    key: "add-friend",
    label: msg`添加朋友`,
    icon: UserPlus,
    to: "/add-friend",
  },
  {
    key: "create-note",
    label: msg`新建笔记`,
    icon: FileText,
    to: "/notes/new",
  },
  {
    key: "scan",
    label: msg`扫一扫`,
    icon: QrCode,
    disabled: true,
    disabledLabel: msg`暂未开放`,
  },
  {
    key: "pay",
    label: msg`收付款`,
    icon: WalletCards,
    disabled: true,
    disabledLabel: msg`暂未开放`,
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
const SCROLL_POSITION_STORAGE_KEY = "yinjie-mobile-chat-list-scrolltop";
const DesktopChatWorkspace = lazy(async () => {
  const mod = await import("../features/chat/chat-tab-shell");
  return { default: mod.ChatTabShell };
});

export function ChatListPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const normalizedPathname = normalizePathname(pathname);
  const desktopPathMismatch = normalizedPathname !== "/tabs/chat";
  // 一旦在桌面布局下落到 /tabs/chat 就锁定；之后 useRouterState 在路由切换瞬间
  // 反映出新的 pathname 时不再把用户拉回——否则会拦截 + 菜单的 添加朋友 /
  // 发起群聊 / 新建笔记 等合法导航。
  const desktopPathStabilizedRef = useRef(false);

  useEffect(() => {
    if (!isDesktopLayout || !desktopPathMismatch) {
      if (!desktopPathMismatch) {
        desktopPathStabilizedRef.current = true;
      }
      return;
    }
    if (desktopPathStabilizedRef.current) {
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
            title={t(msg`正在打开桌面消息`)}
            description={t(msg`正在打开桌面消息，马上显示最近会话。`)}
            loadingLabel={t(msg`正在打开桌面消息...`)}
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
  const t = useRuntimeTranslator();
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
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const [isNotifiedReminderGroupExpanded, setIsNotifiedReminderGroupExpanded] =
    useState(false);
  // 失败 toast 必须能跟成功 toast 在样式上区分（红 vs 蓝），不然
  // pin/mute/markRead/delete 出错时用户看到的"操作失败请稍后再试"和成功
  // 提示用同一个 info 蓝条，肉眼几乎无差别 —— 用户以为操作生效了。
  const [notice, setNotice] = useState<
    { message: string; tone: "info" | "danger" } | null
  >(null);
  const setNoticeInfo = (message: string) =>
    setNotice({ message, tone: "info" });
  const setNoticeError = (message: string) =>
    setNotice({ message, tone: "danger" });
  const [openSwipeConversationId, setOpenSwipeConversationId] = useState<
    string | null
  >(null);
  const [pendingHideConversation, setPendingHideConversation] =
    useState<PendingHideConversation | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const pendingHideRef = useRef<PendingHideConversation | null>(null);
  // 走查新一轮 R1：用户在列表里滚到某条会话点进去聊天，返回后 scroll
  // 总是被掼回顶部。mobile-shell 的 MobileViewportPane 拿 path 当 key，
  // 路由切换就 unmount 整个 pane，scrollTop 归零；用户必须重新一路下滑
  // 找到那条会话。靠 sessionStorage 持久化滚动位置，mount 时 restore，
  // 滚动时 rAF throttled save。仅 chat-list 这一处，不影响其它 tab。
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const scrollRestoredRef = useRef(false);
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

  // 后端 conversation_updated/new_message 事件是房间级 emit（user 必须先
  // join_conversation 才会收到），chat-list 默认不在任何 room；所以这里把
  // refetchInterval 从 3s 拉长到 60s 当兜底，并通过 onConversationUpdated
  // 监听 + window focus 触发即时刷新——用户已经进过的会话仍能立即同步，
  // 公网隧道下空闲时网络请求量降一个数量级。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    refetchInterval: isActiveTab ? 60_000 : false,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
  const messageEntriesQuery = useQuery({
    queryKey: ["app-official-message-entries", baseUrl],
    queryFn: () => getOfficialAccountMessageEntries(baseUrl),
    refetchInterval: isActiveTab ? 60_000 : false,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
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
    // useChatReminderActions 不区分 info/danger，统一当 info 蓝条；reminder
    // 完成/出错回执都不是 mutation 级别的 hard fail，info 已经够提示。
    onNoticeChange: (message) =>
      message ? setNoticeInfo(message) : setNotice(null),
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

  // 「下方会话列表 section 该不该渲染」只看真正会塞进 section 的三类条目；
  // reminderEntries 走单独的「消息提醒」section（line 1020 起），不应该
  // 撑起一张空的会话 section。否则用户「只有提醒、没有会话」时下面就会
  // 多出一条 border-y 包着的空白横条。
  const hasConversationSectionContent =
    visibleConversations.length > 0 ||
    serviceConversations.length > 0 ||
    showSubscriptionInboxItem;
  const hasConversations =
    reminderEntries.length > 0 || hasConversationSectionContent;
  // 走查 R4：原版只看 isError，不区分「全无 cache」vs「有 cache 但 refetch
  // 失败」。结果是用户已经看到一份缓存的列表正常用着，refetch 在公网隧道
  // 超时一次（或服务端 5xx 一秒）整张列表就被红色全屏 error card 顶掉，
  // 直到 retry 成功才回来——其实手上那份 cache 仍然完全可用。WeChat / 微博
  // 等同类 app 的常规做法是：cache 有内容时退化成顶部小红条「无法刷新」+
  // 保留列表，只在「真·零数据」时才铺大卡。下面 hasConversationStaleData
  // / hasConversationFullLoadError 分别给两种渲染分支用。
  const hasConversationLoadError =
    conversationsQuery.isError && conversationsQuery.error instanceof Error;
  const hasConversationFullLoadError =
    hasConversationLoadError && conversations.length === 0;
  const hasConversationStaleData =
    conversationsQuery.isError && conversations.length > 0;
  const hasMessageEntriesError =
    messageEntriesQuery.isError && messageEntriesQuery.error instanceof Error;

  // optimistic helper: 把单个 conversation 的某些字段就地 patch，遍历所有
  // ["app-conversations", baseUrl, ...] 形态的 cache（含 hash 后缀的变种）。
  // 公网隧道 ~600ms RTT 下，pin/mute 不做 optimistic 会让用户看到 600ms 后
  // 才有 UI 反应。reorder=true 时按后端的排序规则
  // （isPinned → pinnedAt desc → lastActivityAt desc）就地重排，避免 pin
  // 之后会话留在原位置 600ms 才跳到顶部。
  //
  // 不再返回完整 snapshot —— 之前 onError 把整张 conversations cache 全覆盖
  // 回去，并发场景下（pin A 还在飞 → mute B / pin C 又乐观跑了 → pin A 失败）
  // 会把 B / C 的乐观更新一起冲掉，红心闪回旧态。改为 onError 在调用端拿
  // 旧字段值反向 patch 那一条，对其他行零影响（参见 discover-feed-page
  // likeMutation 同款修复）。
  const patchConversationCache = async (
    conversationId: string,
    patch: (item: ConversationListItem) => ConversationListItem,
    options?: { reorder?: boolean },
  ) => {
    await queryClient.cancelQueries({
      queryKey: ["app-conversations", baseUrl],
    });
    queryClient.setQueriesData<ConversationListItem[]>(
      { queryKey: ["app-conversations", baseUrl] },
      (data) => {
        if (!data) return data;
        const next = data.map((item) =>
          item.id === conversationId ? patch(item) : item,
        );
        return options?.reorder ? sortConversationsByBackendOrder(next) : next;
      },
    );
  };

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
    onMutate: async (variables) => {
      const now = new Date().toISOString();
      // 记下这一条 conv 改前的 isPinned / pinnedAt，onError 单独翻回去；
      // 全 snapshot rollback 会把并发的 mute/pin 一起冲掉，避坑。
      let previousPinned: boolean | undefined;
      let previousPinnedAt: string | null | undefined;
      const cached = queryClient.getQueriesData<ConversationListItem[]>({
        queryKey: ["app-conversations", baseUrl],
      });
      for (const [, data] of cached) {
        if (!data) continue;
        const found = data.find((item) => item.id === variables.conversationId);
        if (found) {
          previousPinned = found.isPinned;
          previousPinnedAt = found.pinnedAt ?? null;
          break;
        }
      }
      await patchConversationCache(
        variables.conversationId,
        (item) => ({
          ...item,
          isPinned: variables.pinned,
          pinnedAt: variables.pinned ? now : undefined,
        }),
        { reorder: true },
      );
      return { previousPinned, previousPinnedAt };
    },
    onError: (error, variables, context) => {
      if (context && context.previousPinned !== undefined) {
        void patchConversationCache(
          variables.conversationId,
          (item) => ({
            ...item,
            isPinned: context.previousPinned!,
            pinnedAt: context.previousPinnedAt ?? undefined,
          }),
          { reorder: true },
        );
      }
      // optimistic 已回滚，但用户看不到任何反馈：列表里 pin 状态默默闪回原样。
      // 公网隧道偶发超时 / cloud token 过期重连那几百 ms 都会触发，必须给个 toast，
      // 否则用户以为"系统忽略了我的点击"。
      setNoticeError(
        error instanceof Error && error.message
          ? error.message
          : variables.pinned
            ? t(msg`置顶失败，请稍后再试。`)
            : t(msg`取消置顶失败，请稍后再试。`),
      );
    },
    onSuccess: (_, variables) => {
      setNoticeInfo(
        variables.pinned ? t(msg`聊天已置顶。`) : t(msg`聊天已取消置顶。`),
      );
      // 新一轮走查 R2：原版 `await Promise.all([invalidate(app-conversations),
      // invalidate(app-group)])` 让 pinMutation.isPending 一直撑到这两条 GET
      // refetch 回来（公网隧道 ~600ms RTT × 2 路并发 ≈ 600ms）。但 line ~1442
      // 把 pinMutation.isPending && variables.conversationId === conversation.id
      // 塞进 `pending` prop，pending 真值时这一行 `pointer-events-none opacity-70`
      // —— 用户刚 pin 完想进群聊看消息，这行有近 1s 没法点击，看着像"卡死"。
      // optimistic 已经在 onMutate 里走 patchConversationCache(... reorder:true)
      // 把 cache + 排序就地改了，invalidate 只是兜底服务端 canonical，不必 await。
      // 同 group-chat-details-page leaveMutation/hideMutation 本会话 R1 / R3 改法。
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, variables.conversationId],
      });
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
    onMutate: async (variables) => {
      const now = new Date().toISOString();
      let previousMuted: boolean | undefined;
      let previousMutedAt: string | null | undefined;
      const cached = queryClient.getQueriesData<ConversationListItem[]>({
        queryKey: ["app-conversations", baseUrl],
      });
      for (const [, data] of cached) {
        if (!data) continue;
        const found = data.find((item) => item.id === variables.conversationId);
        if (found) {
          previousMuted = found.isMuted;
          previousMutedAt = found.mutedAt ?? null;
          break;
        }
      }
      await patchConversationCache(variables.conversationId, (item) => ({
        ...item,
        isMuted: variables.muted,
        mutedAt: variables.muted ? now : undefined,
      }));
      return { previousMuted, previousMutedAt };
    },
    onError: (error, variables, context) => {
      if (context && context.previousMuted !== undefined) {
        void patchConversationCache(variables.conversationId, (item) => ({
          ...item,
          isMuted: context.previousMuted!,
          mutedAt: context.previousMutedAt ?? undefined,
        }));
      }
      setNoticeError(
        error instanceof Error && error.message
          ? error.message
          : variables.muted
            ? t(msg`开启免打扰失败，请稍后再试。`)
            : t(msg`关闭免打扰失败，请稍后再试。`),
      );
    },
    onSuccess: (_, variables) => {
      setNoticeInfo(
        variables.muted
          ? t(msg`已开启消息免打扰。`)
          : t(msg`已关闭消息免打扰。`),
      );
      // 新一轮走查 R2：和 pinMutation 同款——原版 await 让 muteMutation.isPending
      // 一直撑到 invalidate refetch 完，line ~1445 把它接进 `pending` prop 让
      // 这一行近 1s 不可点击。optimistic 已在 onMutate 改 cache，fire-and-forget。
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, variables.conversationId],
      });
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
    // 标已读是日常超高频动作，公网隧道 RTT ~600ms 期间未读 badge 不消失，
    // 用户会以为点击没生效（pin/mute 已经做了 optimistic，这里没做留了一个
    // 一致性缺口）。优先 patch "read"→ unreadCount=0 + lastReadAt=now；
    // "unread" 因为服务端语义（重置到上一条消息前）不好本地纯计算，先不动。
    onMutate: async (variables) => {
      if (variables.action !== "read") {
        return undefined;
      }
      const now = new Date().toISOString();
      let previousUnreadCount: number | undefined;
      let previousLastReadAt: string | null | undefined;
      const cached = queryClient.getQueriesData<ConversationListItem[]>({
        queryKey: ["app-conversations", baseUrl],
      });
      for (const [, data] of cached) {
        if (!data) continue;
        const found = data.find((item) => item.id === variables.conversationId);
        if (found) {
          previousUnreadCount = found.unreadCount;
          previousLastReadAt = found.lastReadAt ?? null;
          break;
        }
      }
      await patchConversationCache(variables.conversationId, (item) => ({
        ...item,
        unreadCount: 0,
        lastReadAt: now,
      }));
      return { previousUnreadCount, previousLastReadAt };
    },
    onError: (error, variables, context) => {
      if (
        variables.action === "read" &&
        context &&
        context.previousUnreadCount !== undefined
      ) {
        void patchConversationCache(variables.conversationId, (item) => ({
          ...item,
          unreadCount: context.previousUnreadCount!,
          lastReadAt: context.previousLastReadAt ?? undefined,
        }));
      }
      setNoticeError(
        error instanceof Error && error.message
          ? error.message
          : variables.action === "read"
            ? t(msg`标记已读失败，请稍后再试。`)
            : t(msg`标记未读失败，请稍后再试。`),
      );
    },
    onSuccess: (_, variables) => {
      setNoticeInfo(
        variables.action === "read"
          ? t(msg`已标记为已读。`)
          : t(msg`已标记为未读。`),
      );
      // 新一轮走查 R2：和 pinMutation / muteMutation 同款——原版 await 让
      // readStateMutation.isPending 一直撑到 invalidate 回来（公网隧道 ~600ms
      // RTT），line ~1448 把它接进 `pending` prop 让这一行近 1s 不可点击。
      // optimistic 已经在 onMutate 把 unreadCount/lastReadAt 改了；invalidate
      // 只是兜底服务端 canonical，fire-and-forget。
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, variables.conversationId],
      });
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
        setNoticeInfo(t(msg`聊天已从列表移除。`));
      }
    } catch (error) {
      // 新会话走查 R6：原版任何 catch 都走红条「聊天移除失败」。但 hideConversation
      // / hideGroup 在另一端（其它设备 / admin 后台）已经把这条会话删掉时，server
      // 走 requireOwnedConversation 抛 CHAT_CONVERSATION_NOT_FOUND → 404。从用户
      // 视角：他们要删 A、A 现在确实不在了，是「成功」语义。原版红条让用户以为
      // 没生效，再次去找 A 又不在列表，体验更差。把 404 当成功处理；其它真错误
      // 仍然走红条。同款 idempotent-delete 模式在 React Native / Flutter 客户端
      // 都常见。
      if (
        isApiRequestError(error) &&
        error.statusCode === 404
      ) {
        if (showSuccessNotice) {
          setNoticeInfo(t(msg`聊天已从列表移除。`));
        }
      } else {
        setNoticeError(
          error instanceof Error
            ? error.message
            : t(msg`聊天移除失败，请稍后再试。`),
        );
      }
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
      // 走查 R2 新一轮：原版只清 pendingHide 状态再 await 服务端，公网隧道
      // ~600ms 期间 visibleConversations.filter(c => c.id !== pendingHide.id)
      // 失去 sentinel，但 conversations cache 还含这一条 → 会话在「成功
      // toast」出现的同时短暂闪回列表，user 看到刚刚说「已从列表移除」的
      // 会话又冒出来 ~600ms 后才真消失，疑惑「我是不是没删干净」。先用
      // setQueriesData 同步把这一条从 cache filter 掉，再清状态 + 落库；
      // 落库 .finally 的 invalidate 会用 server canonical 重新刷掉（成功
      // 路径相同），server 失败时 invalidate 把这条带回来 + setNoticeError
      // 红条，用户能看到「失败 + 会话回归」，比假装移除更不误导。
      //
      // 新会话走查 R5：和 patchConversationCache 对齐——先 await
      // cancelQueries 再 setQueriesData。否则 socket 触发 + refetchOnFocus +
      // 60s interval 任何一个在 commit 那一帧正好在飞的 refetch 完成后会
      // 用 server canonical（含被删 conv）覆盖我们刚 filter 掉的 cache，
      // 被删会话又冒回来；最终走 persistHiddenConversation 的 invalidate
      // 重新刷掉，但中间 ~600ms 视觉闪烁正是 R2 想避免的。
      await queryClient.cancelQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      queryClient.setQueriesData<ConversationListItem[]>(
        { queryKey: ["app-conversations", baseUrl] },
        (data) =>
          data
            ? data.filter((item) => item.id !== entry.conversationId)
            : data,
      );
      // 走查新一轮 R5：rapid A→B 删除——handleScheduleHideConversation 删 B 时
      // 把 A 的 commit fire-and-forget 调度出去；A 的 commit 在 await cancelQueries
      // 那个 microtask 边界 yields，handler 继续往下 pendingHideRef.current = B
      // / setPendingHide(B) / setTimeout(B) 全跑完，然后 A 的 commit 再回来把
      // 自己进入 if 判定时还指向 A 的 pendingHideRef.current 无脑 = null。结果
      //   · B 的 pendingHide state 被同步清空（顶部 5s 撤销条没了）
      //   · pendingHideRef.current = null 让 5s 后 B 的 setTimeout 走 early
      //     return（latestPending = null → 不 commit）
      //   · B 没有被 hide 到 server，cache 又因为 invalidate 重新加回 B；用户
      //     看到 B 还在列表里，且没有任何 toast / undo 入口提示「上一次删除
      //     失败/被跳过」
      // 再 check 一次：只有 ref 还指向同一条 entry 时才清。typical "B 在 await
      // 期间已经被新 pending 顶掉" → 跳过；A 仍按常规走 persistHiddenConversation
      // 落库，B 的 5s 撤销 / 落库由它自己的 timer 接管。
      if (pendingHideRef.current?.conversationId === entry.conversationId) {
        pendingHideRef.current = null;
        setPendingHideConversation(null);
      }
    }

    await persistHiddenConversation(entry, showSuccessNotice);
  };

  useEffect(() => {
    if (!isActiveTab) {
      setIsQuickMenuOpen(false);
      setOpenSwipeConversationId(null);
      return;
    }

    // 之前这里还 setSwipeResetVersion((c) => c + 1)，并且把 version 拼进
    // <ConversationListItemLink key=...>。结果每次进 /tabs/chat（包括首次
    // 挂载！）都会把所有会话行整体 unmount + remount —— 一遍正常 render
    // 用 key "0:id" 挂上去，紧接着 effect 立刻把 version 推到 1 又重挂一次。
    // 行内 ChatItem 已经把 open prop 同步到内部 swipeOffset（参见 useEffect
    // [open, swipeActionWidth]），父组件这里 setOpenSwipeConversationId(null)
    // 就够了，不需要再用 key 强制全表重挂。
    setOpenSwipeConversationId(null);
  }, [isActiveTab]);

  // 「聊天已置顶」「已开启消息免打扰」这类成功提示之前没有 auto-dismiss——
  // setNotice 后会一直挂在搜索框下面，直到用户下一次操作或离开 tab，看起来
  // 像未完成的状态。pendingHideConversation 有自己的 5s 撤销窗口，这里只
  // 给纯文本的 notice 加个 3.5s 自动消失。
  useEffect(() => {
    if (!notice || pendingHideConversation) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice, pendingHideConversation]);

  // 点 + 菜单容器之外（顶栏标题、搜索按钮、会话行等）任意位置都关菜单。
  // 之前用 z-30 fixed overlay 拦 click 会有两个问题：
  // 1) TabPageTopBar 是 sticky z-40，topbar 内的点击不会冒泡到 overlay；
  // 2) overlay 覆盖会话行的点击，菜单关闭但会话不会被点开（要点两次）。
  // 改用 pointerdown 文档级监听 + ref 判断，参考 chat-composer.tsx#885。
  useEffect(() => {
    if (!isQuickMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!quickMenuRef.current?.contains(event.target as Node)) {
        setIsQuickMenuOpen(false);
      }
    };
    // 走查 R2：aria-haspopup="menu" 摆好了但 ESC 完全不起作用。键盘 / 屏幕阅读器
    // 用户无法 dismiss；移动端虽然没硬键盘，外接键盘 / Bluetooth 也常用。Android
    // 硬件 Back 已经在下面的 registerAndroidBackInterceptor 兜了，这里只补 ESC。
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsQuickMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isQuickMenuOpen]);

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

  // 原生壳硬件 Back 键：在 /tabs/chat 上展开了 + 菜单 / 滑开了会话操作 /
  // 还在 5s 撤销删除窗口里时，BACK 应当先关掉这些瞬态层，而不是触发"再按
  // 一次返回退出"的根 tab 默认行为。优先级：撤销删除 > 滑开 > 快捷菜单。
  useEffect(() => {
    if (!isActiveTab) {
      return;
    }
    if (!pendingHideConversation && !openSwipeConversationId && !isQuickMenuOpen) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      if (pendingHideConversation) {
        event.preventDefault();
        // 直接 inline 撤销逻辑（原来调用的 handleUndoHideConversation 是组件内
        // function declaration，每次 render 重建一次，按 exhaustive-deps 必须
        // 进 deps 才不会拿到旧闭包；inline 后 ref / 稳定 setter 直接捕获，
        // effect 也不必跟着 handler ref 抖动）。
        if (hideTimeoutRef.current !== null) {
          window.clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
        pendingHideRef.current = null;
        setPendingHideConversation(null);
        setNotice({ message: t(msg`已撤销删除。`), tone: "info" });
        return true;
      }
      if (openSwipeConversationId) {
        event.preventDefault();
        setOpenSwipeConversationId(null);
        return true;
      }
      if (isQuickMenuOpen) {
        event.preventDefault();
        setIsQuickMenuOpen(false);
        return true;
      }
      return false;
    });
    return unregister;
  }, [
    isActiveTab,
    isQuickMenuOpen,
    openSwipeConversationId,
    pendingHideConversation,
    t,
  ]);

  useEffect(() => {
    return () => {
      clearPendingHideTimer();

      const pending = pendingHideRef.current;
      pendingHideRef.current = null;
      if (!pending) {
        return;
      }

      // 走查 R4：unmount 兜底落库 pending hide。.finally 不接 rejection——
       // 公网隧道超时 / cloud token 过期 / 服务端 5xx 时 hideGroup/hideConversation
       // 抛错 → 落 unhandledrejection 污染 telemetry。这条路径在用户离开 tab
       // 时跑，没地方挂 UI 提示，加 .catch 静默吞掉就好；下次进消息列表
       // invalidate 一定会重拉 conversations，列表上看不到这条聊天意味着实际
       // 没被 hide，对用户来说就是"没生效，可以再划一次"，比让 console / 远
       // 程 telemetry 多一条 unhandled error 更合适。
      //
      // 走查 R2（新一轮）：同 commitPendingHideConversation 一致——unmount 落库
      // 是 fire-and-forget，下一次进 chat-list 时 cache 直接读，若没先把这
      // 条 filter 掉、用户回到列表看到刚划掉的会话还在原位 ~600ms 后才
      // invalidate 刷掉。setQueriesData 同步把这一条从 cache 去掉，invalidate
      // 完后服务端 canonical 还会再 reconcile 一次。
      queryClient.setQueriesData<ConversationListItem[]>(
        { queryKey: ["app-conversations", baseUrl] },
        (data) =>
          data
            ? data.filter((item) => item.id !== pending.conversationId)
            : data,
      );

      // 新会话走查 R1：本 useEffect 既负责 unmount cleanup，也负责 baseUrl 变化
      // （多 world 切换 / 登出登录链路）触发的 effect 重跑 cleanup。原版只在
      //  pendingHideRef.current 上清，没动 pendingHideConversation 状态。
      //  - unmount 路径：组件即将被丢掉，setState 在 React 18+ 是 no-op，
      //    新增这行不影响。
      //  - baseUrl 变化路径：组件继续挂着，但 5s 定时器已被 clearPendingHideTimer
      //    干掉、pendingHideRef 也清空。结果 pendingHideConversation 状态留着 →
      //    顶部 InlineNotice「{title} 已从列表移除，5 秒内可撤销」永远不会撤
      //    （定时器没了），Undo 按钮按下走 handleUndoHideConversation 也只是
      //    把已 null 的 ref/state 再 null 一遍 + setNoticeInfo「已撤销删除」，
      //    而被 hide 的会话已经在 setQueriesData 里 filter 掉了 → 用户看到「已撤
      //    销」却找不到那条会话，状态彻底乱掉。补 setPendingHideConversation(null)
      //    + setNotice(null) 兜底 baseUrl 变化路径。
      setPendingHideConversation(null);
      setNotice(null);

      void (
        pending.isGroup
          ? hideGroup(pending.conversationId, baseUrl)
          : hideConversation(pending.conversationId, baseUrl)
      )
        .catch(() => {})
        .finally(() => {
          void queryClient.invalidateQueries({
            queryKey: ["app-conversations", baseUrl],
          });
        });
    };
  }, [baseUrl, queryClient]);

  // socket onConversationUpdated / onChatMessage 是房间级事件——chat-list 自身
  // 不在任何房间，但 socket 是全局复用的：用户曾打开过的聊天室仍然 join 着，
  // 那些会话变更可以即刻反映到列表上，不必等下一次 60s 兜底轮询。
  //
  // 走查 R1：原版每次 socket 推送都直接 invalidate → 一条消息触发
  // conversation_updated + new_message 至少两次 invalidate；多 AI 群批量回复
  // 时一秒内 10+ 个事件 = 10+ 次完整 getConversations 刷新（每次都要把整张
  // 列表序列化 + 走完 normalizeConversationListItem）。公网隧道 RTT 下完全是
  // 浪费——把 invalidate 攒到 250ms 的 trailing edge 上，用户感知不到延迟，
  // 高频频道下 RPC 次数和 CPU 都降一个数量级。setQueriesData 直接 patch 进
  // open chat-room messages cache 那部分仍逐条同步处理（消息要立刻显示）。
  useEffect(() => {
    let pendingInvalidate: number | null = null;
    const scheduleListInvalidate = () => {
      if (pendingInvalidate !== null) return;
      pendingInvalidate = window.setTimeout(() => {
        pendingInvalidate = null;
        void queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      }, 250);
    };
    const offUpdated = onConversationUpdated(() => {
      scheduleListInvalidate();
    });
    const offMessage = onChatMessage((payload) => {
      scheduleListInvalidate();
      // 直接把新消息写进对应会话的 messages cache：上一版用 invalidate 依赖
      // 下次 mount 触发 refetch，移动端 staleTime=60s 内 useQuery 可能仍然先
      // 把旧 cache 返回再后台 refetch → 用户进去先看到旧消息，AI 回复要 RTT
      // 后才出现。setQueriesData 直接合并新消息，进 chat-room 立刻就在。
      // partial queryKey 匹配所有 messageLimit 变体（60/100/...）。
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
    // 新会话走查 R7：socket disconnect 期间 server 给 chat-list 推的所有
    // conversation_updated / new_message 都丢了——socket.ts 重连时 server 端
    // Socket 实例是新的，历史房间记忆全无，per-thread-panel 的 onChatSocketConnect
    // 会自动 re-join 自己那一个房间（看 socket.ts:22 注释），但「断网期间
    // 在别的会话里收到的新消息」没人补救：chat-list 自己从不 join 任何房间，
    // 完全靠 conversation_updated 触发 invalidate。
    //
    // 这种 gap 在公网隧道 / 4G→WiFi 切换 / cloud token 续期那几秒频繁出现：
    // 用户站在 chat-list 不动，断网那阵子张三发的新消息直到 60s refetchInterval
    // 兜底（或下次 refetchOnWindowFocus）才显示，体感「微信里有消息但列表
    // 不动」。
    //
    // 挂 onChatSocketConnect → invalidate conversations + messageEntries，
    // 把 reconnect 当成显式 sync 时机。同款修法 use-conversation-thread /
    // group-chat-thread-panel 都有；scheduleListInvalidate 走 250ms debounce
    // 复用，多个 onConnect / onMessage 同帧触发只发一次 GET。
    const offConnect = onChatSocketConnect(() => {
      scheduleListInvalidate();
      void queryClient.invalidateQueries({
        queryKey: ["app-official-message-entries", baseUrl],
      });
    });
    return () => {
      if (pendingInvalidate !== null) {
        window.clearTimeout(pendingInvalidate);
        pendingInvalidate = null;
      }
      offUpdated();
      offMessage();
      offConnect();
    };
  }, [baseUrl, queryClient]);

  // 走查新一轮 R1：恢复列表滚动位置。
  // 触发条件：本组件实例有可滚动内容、还没 restore 过。一次性 restore +
  // 持续 save，组件 unmount 时移除监听。
  //
  // 新一轮走查 R1（新）：原版 gate 只看 conversations.length > 0 —— 用户
  // **没有任何直接/群聊会话**、只有「消息提醒」分组或「公众号入口」section
  // （订阅号 + 服务号会话）的场景下，reminderEntries.length /
  // hasConversationSectionContent 完全可以撑出可滚动高度（订阅 20+ 公众号 /
  // 数十条提醒），但 isConversationsListSettled 永远 false → 滚动监听器从
  // 不挂载，既不存 sessionStorage 也不 restore。进退一次后页面落回顶部，
  // 用户得重新滚回原位。改用 hasConversations（reminderEntries OR conv
  // section content）当 gate，覆盖所有有内容的场景；内层 walk-up 还会在
  // 「找不到可滚动祖先」时早 return，所以放宽 gate 没有副作用。
  const isConversationsListSettled =
    !conversationsQuery.isLoading && hasConversations;
  useEffect(() => {
    // StrictMode 兜底：原版把 restored 提到 early return 里，第一次 effect 跑
    // 完写好 restored=true → cleanup 摘掉 listener → 第二次 effect 因 restored
    // 已 true 直接 early return → listener 没再挂上 → 整段失效。改成 restored
    // 只 gate 一次性的 scrollTop 恢复，listener 每次 effect 跑都要重挂。
    if (!isConversationsListSettled) {
      return;
    }
    const anchor = scrollAnchorRef.current;
    if (!anchor) return;

    // 走查 R4 新一轮：原 walk-up 同时要求 overflowY:auto/scroll **且**
    // scrollHeight > clientHeight 才算「可挂监听器」。问题在于初次 mount 时
    // 列表可能短到刚好不需要滚（10 条短文本 + 1 屏可显示完），匹配失败 →
    // scrollEl=document.body → return → 永远不挂 listener。之后 socket 推
    // 新会话把列表撑到溢出 viewport 时已经错过 effect 唯一一次执行机会
    // （deps=[isConversationsListSettled] 不会因 conversations 引用变化重跑）。
    // 改成只按「overflowY 是否 auto/scroll」当 scroll container 探针——
    // mobile-shell 那一层 absolute inset-0 overflow-y-auto 永远成立；内部
    // handleScroll 自己用 maxScroll<100 闸门跳过实际无内容可滚的 noise event。
    let scrollEl: HTMLElement | null = anchor.parentElement;
    while (scrollEl && scrollEl !== document.body) {
      const style = window.getComputedStyle(scrollEl);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        break;
      }
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl || scrollEl === document.body) return;

    if (!scrollRestoredRef.current) {
      scrollRestoredRef.current = true;
      let saved: number | null = null;
      try {
        const raw = window.sessionStorage.getItem(SCROLL_POSITION_STORAGE_KEY);
        saved = raw ? Number.parseInt(raw, 10) : null;
      } catch {
        // sessionStorage 可能在 Safari 隐私模式 / iframe sandbox 下抛 SecurityError；
        // 静默兜底，不影响列表正常使用。
      }
      if (saved !== null && Number.isFinite(saved) && saved > 0) {
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        scrollEl.scrollTop = Math.min(saved, Math.max(0, maxScroll));
      }
    }

    let rafId: number | null = null;
    const handleScroll = () => {
      // 路由切走时 React 先 unmount 内层 children（列表 section 整片消失），
      // scrollHeight 暴跌到接近 clientHeight，浏览器把 scrollTop 强制 clamp 到
      // 0 并 fire 一次最后的 scroll 事件。这条幽灵事件如果落到 sessionStorage，
      // 就会把用户真实的 scrollTop=500 覆盖成 0，下次回来仍是从顶部开始。
      // 用 scrollHeight - clientHeight < 100 当哨兵：列表至少要有内容能滚才
      // 值得保存；不到 100px 的差值要么是列表小到不需要 restore，要么就是
      // unmount 路径的伪事件。
      const maxScroll = scrollEl!.scrollHeight - scrollEl!.clientHeight;
      if (maxScroll < 100) return;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        try {
          window.sessionStorage.setItem(
            SCROLL_POSITION_STORAGE_KEY,
            String(scrollEl!.scrollTop),
          );
        } catch {
          // 同上：写入失败静默
        }
      });
    };
    scrollEl.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollEl.removeEventListener("scroll", handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, [isConversationsListSettled]);

  function handleNavigate(
    to: "/group/new" | "/friend-requests" | "/add-friend" | "/notes/new",
  ) {
    setIsQuickMenuOpen(false);
    setNotice(null);

    if (to === "/notes/new") {
      const draft = createDesktopNoteDraft();
      const nextHash = buildMobileNoteEditorRouteHash({
        draftId: draft.draftId,
        returnPath: pathname,
      });
      void navigate({
        to,
        ...(nextHash ? { hash: nextHash } : {}),
      });
      return;
    }

    const nextHash =
      to === "/group/new"
        ? buildCreateGroupRouteHash({
            returnPath: pathname,
          })
        : to === "/add-friend"
          ? buildMobileAddFriendRouteHash({
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
    // 第四轮 R3：同一会话被连点两次「删除」时，原版会把 currentPending（其实
    // 就是它自己）立刻 commitPendingHideConversation 提交 → server DELETE，再
    // 重新 setTimeout(5s) 调度同一条 → 5s 后再 DELETE 一次 → 第二次走 404
    // catch 路径，把刚刚的「聊天已从列表移除」覆盖成「聊天移除失败」红条，
    // 用户以为没生效但其实早删了。同帧双击时 visibleConversations.filter 还
    // 没 commit，"删除"按钮仍可点中（行还没消失）。
    // 仅当 currentPending 不是同一条会话时才 commit（保留"先 A 再 B"的快速
    // 切换语义），同一条直接 no-op 保留已挂的 5s undo 窗口。
    if (
      currentPending &&
      currentPending.conversationId !== conversation.id
    ) {
      void commitPendingHideConversation(currentPending, false);
    } else if (currentPending) {
      return;
    }

    const nextPending: PendingHideConversation = {
      conversationId: conversation.id,
      isGroup: isPersistedGroupConversation(conversation),
      // 新会话走查 R2：和姊妹 e8aac574b（direct 会话标题 "未知联系人" /
      // "Direct conversation" 持久化中文字面量、切到 en/ja/ko 仍渲染原文）
      // 同款问题——原版存 raw conversation.title。后端 normalizeLegacy 写入
      // 中文 sentinel 时，pendingHide InlineNotice 在 en-US locale 渲染就
      // 变成「未知联系人 has been removed from the list, undo within 5s」
      // 中英文混杂。走 getConversationDisplayTitle 翻一遍 sentinel；普通
      // 业务标题（"苏澄"等）原样透传，零回归。
      title: getConversationDisplayTitle(conversation.title),
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
    setNoticeInfo(t(msg`已撤销删除。`));
  }

  // 第四轮 R1：「清空全部」按钮只挂 onClick={() => void handleClearReminderGroup(...)}，
  // 无任何双击兜底。clearReminders 内部 Promise.allSettled 一组 mutateAsync 出去，
  // 同帧第二次 click 也照样把同一份 messageIds 再打一遍 → server 端第二批拿到
  // 404（第一批已经把 reminder 删干净），clearReminders 把 rejected 抛出来 →
  // 本函数 catch 走 setNoticeError，把刚刚成功的「已清除 N 条提醒」蓝条覆盖成
  // 红色失败提示，用户以为没生效。和 chat-message-list 撤回/删除
  // / chat-details 危险操作的 sync ref 锁同款修法；status 区分锁，让"逾期"和
  // "已通知"两组互不影响。
  const clearReminderGroupBusyRef = useRef<Set<string>>(new Set());
  async function handleClearReminderGroup(
    status: "pending" | "due" | "notified",
    messageIds: string[],
  ) {
    if (!isChatReminderGroupClearable(status)) {
      return;
    }
    if (clearReminderGroupBusyRef.current.has(status)) {
      return;
    }

    clearReminderGroupBusyRef.current.add(status);
    try {
      await clearReminders(messageIds);
      setNoticeInfo(getChatReminderGroupClearNotice(status, messageIds.length));
    } catch (error) {
      setNoticeError(
        error instanceof Error
          ? error.message
          : getChatReminderGroupClearErrorMessage(status),
      );
    } finally {
      clearReminderGroupBusyRef.current.delete(status);
    }
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`消息`)}
        className="z-40 mx-0 mt-0 space-y-1.5 overflow-visible border-b border-[color:var(--border-faint)] bg-[rgba(250, 245, 237,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none sm:mx-0"
        titleAlign="center"
        titleClassName="text-[17px] font-medium tracking-normal"
        rightActions={
          <div ref={quickMenuRef} className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsQuickMenuOpen((current) => !current)}
              className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
              aria-label={
                isQuickMenuOpen ? t(msg`关闭快捷菜单`) : t(msg`打开快捷菜单`)
              }
              aria-expanded={isQuickMenuOpen}
              aria-haspopup="menu"
            >
              <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
            </Button>

            {isQuickMenuOpen ? (
              // role="menu" + role="menuitem" 对齐 aria-haspopup="menu"。原本
              // trigger 声明了 menu popup，弹层却没 menu 语义；屏幕阅读器把
              // 整块当通用 region，听不到「3 个菜单项里第 1 项」之类的导航。
              <div
                role="menu"
                aria-label={t(msg`快捷操作`)}
                className="absolute right-0 top-[calc(100%+0.3rem)] z-40 w-[10rem] overflow-hidden rounded-[12px] bg-[rgba(44,44,44,0.96)] p-1 shadow-[0_12px_32px_rgba(180, 130, 20, 0.2)]"
              >
                {quickActionItems.map((item) => {
                  const Icon = item.icon;

                  if (item.to && !item.disabled) {
                    const to = item.to;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        onClick={() => handleNavigate(to)}
                        className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12px] text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/10 active:bg-white/12"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-white/10 text-white">
                          {/*
                            走查再再一轮 R1：菜单项视觉文本（发起群聊 / 添加朋友 /
                            新建笔记）已经在 <span> 给出 accessible name；Lucide
                            icon 是装饰元素，但默认 <svg> 没挂任何 aria-* —— 部
                            分 AT 把 inline SVG 当 image，加念一遍冗余英文文件名
                            「users」/「user-plus」/「file-text」，覆盖视觉文本
                            的精确中文标签。同文件 line 1370 搜索 icon 已挂
                            aria-hidden 走的就是这条规约，这里 5 个菜单项 + 行
                            内 BellOff / Pin / Search / Plus 等都该一致。
                          */}
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <span>{t(item.label)}</span>
                      </button>
                    );
                  }

                  // 走查 R1：跟 contacts-page + 菜单同款，disabled 仍能 Tab 聚焦但
                  // Enter 没反应；tabIndex=-1 跳过 + aria-label 合并 「暂未开放」让
                  // 屏阅器一次播报"功能 + 暂未开放"，避免 Tab 进来不知所云。
                  const disabledItemLabel = item.disabled && item.disabledLabel
                    ? `${t(item.label)}，${t(item.disabledLabel)}`
                    : undefined;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      aria-disabled={item.disabled || undefined}
                      aria-label={disabledItemLabel}
                      tabIndex={item.disabled ? -1 : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12px] text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
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
                        {/* 同上：装饰 icon 不该被 AT 念额外英文文件名 */}
                        <Icon size={14} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div>{t(item.label)}</div>
                        {item.disabledLabel ? (
                          <div className="mt-0.5 text-[10px] text-white/62">
                            {t(item.disabledLabel)}
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
        >
          {/*
            新会话走查 R3：原版 aria-label="打开搜一搜" 跟视觉文本「搜索」不一致，
            违反 WCAG 2.5.3 (Label in Name) —— 语音控制软件用户念出他们看到的
            「搜索」，按钮的 accessible name 是「打开搜一搜」，匹配不上不响应；
            屏幕阅读器念到的也是「打开搜一搜」跟视觉表征对不上。改成不挂
            aria-label，让 accessible name 直接落在视觉文本「搜索」上；Search
            icon 仍 aria-hidden 不干扰。
          */}
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <div className="h-9 w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] pl-9 pr-4 text-[12px] leading-9 text-[color:var(--text-dim)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]">
            {t(msg`搜索`)}
          </div>
        </button>
      </TabPageTopBar>

      <div ref={scrollAnchorRef} className="pb-6">
        {pendingHideConversation ? (
          <div className="px-3 pt-2">
            {/*
              走查 R3：原版 InlineNotice 全程纯样式 div，没有 role/aria-live →
              屏幕阅读器对 pin/mute/标读未读/删除/撤销提醒等关键操作的回执完全
              静默，盲人用户没法验证操作是否生效。pendingHide / 成功 toast /
              清空提醒都是「操作完成态」用 role="status"（polite live region）；
              失败 toast / messageEntriesQuery 失败横条是「需要立即关注」用
              role="alert"（assertive）。注意 role="alert" 隐式 aria-live=
              "assertive"，跟下方红色错误条样式没冲突。
            */}
            <InlineNotice
              tone="info"
              role="status"
              className="rounded-[12px] border-[rgba(96,165,250,0.16)] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {t(
                    msg`${pendingHideConversation.title} 已从列表移除，5 秒内可撤销。`,
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleUndoHideConversation}
                  className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#f59e0b]"
                >
                  {t(msg`撤销`)}
                </button>
              </div>
            </InlineNotice>
          </div>
        ) : notice ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone={notice.tone}
              role={notice.tone === "danger" ? "alert" : "status"}
              className={cn(
                "rounded-[12px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none",
                notice.tone === "info"
                  ? "border-[rgba(96,165,250,0.16)]"
                  : undefined,
              )}
            >
              {notice.message}
            </InlineNotice>
          </div>
        ) : null}
        {hasMessageEntriesError ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="danger"
              role="alert"
              className="rounded-[12px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {t(msg`订阅号与服务号入口暂时没有刷新成功。`)}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openOfficialAccountsList}
                    className="rounded-full border border-[rgba(180, 130, 20, 0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                  >
                    {t(msg`查看公众号`)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void messageEntriesQuery.refetch();
                    }}
                    className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                  >
                    {t(msg`重试读取`)}
                  </button>
                </div>
              </div>
            </InlineNotice>
          </div>
        ) : null}
        {conversationsQuery.isLoading ? (
          <div className="px-3 pt-2">
            <MobileChatListStatusCard
              badge={t(msg`读取中`)}
              title={t(msg`正在刷新消息列表`)}
              description={t(msg`稍等一下，正在同步最近会话和消息入口。`)}
              tone="loading"
            />
          </div>
        ) : null}
        {hasConversationFullLoadError ? (
          <div className="px-3 pt-2">
            <MobileChatListStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`消息页暂时不可用`)}
              description={describeRequestError(conversationsQuery.error)}
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
                  {t(msg`重试读取`)}
                </Button>
              }
            />
          </div>
        ) : hasConversationStaleData ? (
          // 走查 R4：refetch 失败但 cache 还在 —— 用小红条提示，列表照常可用
          <div className="px-3 pt-2">
            <InlineNotice
              tone="danger"
              role="alert"
              className="rounded-[12px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {t(msg`消息列表暂时无法刷新，显示的是最近一次同步的数据。`)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void conversationsQuery.refetch();
                    void messageEntriesQuery.refetch();
                  }}
                  className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                >
                  {t(msg`重试`)}
                </button>
              </div>
            </InlineNotice>
          </div>
        ) : null}
        {reminderEntries.length ? (
          <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            <div className="flex items-center justify-between px-4 py-1.25">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--text-primary)]">
                <BellRing
                  size={13}
                  className="text-[#f59e0b]"
                  aria-hidden="true"
                />
                <span>{t(msg`消息提醒`)}</span>
              </div>
              <div className="text-[10px] text-[#8f9992]">
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
                                "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                group.status === "notified"
                                  ? "bg-[#fff7e6] text-[#d48806]"
                                  : group.status === "due"
                                    ? "bg-[#fff1f0] text-[#d74b45]"
                                    : "bg-[#eaf8ef] text-[#f59e0b]",
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
                                className="px-2 py-1 text-[10px] text-[#7b847e]"
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
                              className="px-2 py-1 text-[10px] text-[#8f9992]"
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
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-[color:var(--surface-panel)] px-4 py-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                group.status === "notified"
                                  ? "bg-[#fff7e6] text-[#d48806]"
                                  : group.status === "due"
                                    ? "bg-[#fff1f0] text-[#d74b45]"
                                    : "bg-[#eaf8ef] text-[#f59e0b]",
                              )}
                            >
                              {group.title}
                            </span>
                          </div>
                          <ChatReminderMetaPill className="px-1.5 py-0.5 text-[10px] text-[#8f9992]">
                            <ChatReminderCountText count={group.count} />
                          </ChatReminderMetaPill>
                        </div>
                      )}
                      {/* 第 3 次走查 R2：和姊妹 swipe-action 容器同款——collapsed
                          时 grid-rows-[0fr] opacity-0 + overflow-hidden 仅把 entries
                          视觉藏掉，DOM 里的 entry button / 完成按钮仍在 a11y tree
                          + Tab 焦点序里。「已通知」组默认 collapsed=true
                          （isNotifiedReminderGroupExpanded 初始 false），SR 用户
                          展开提醒区 section 时会被这些"看不见但能听到"的旧提醒
                          item 重复念一遍；Tab 键也会落进折叠区里循环，aria-expanded
                          虚晃一招其实控制不了内容暴露。补 inert + aria-hidden 同步
                          视觉折叠状态，跟 ConversationListItemLink swipe-action 容器
                          的 inert 修法一致。 */}
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                          collapsed
                            ? "grid-rows-[0fr] opacity-0"
                            : "grid-rows-[1fr] opacity-100",
                        )}
                        inert={collapsed || undefined}
                        aria-hidden={collapsed || undefined}
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
                                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                      getChatReminderStatus(entry) ===
                                        "notified"
                                        ? "bg-[#fff7e6] text-[#d48806]"
                                        : entry.isDue
                                          ? "bg-[#fff1f0] text-[#d74b45]"
                                          : "bg-[#eaf8ef] text-[#f59e0b]",
                                    )}
                                  >
                                    {getChatReminderStatusLabel(entry)}
                                  </span>
                                  <span className="min-w-0 truncate text-[11px] font-medium text-[color:var(--text-primary)]">
                                    {entry.title}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[#8c8c8c]">
                                  <span className="min-w-0 flex-1 truncate text-[11px] leading-[1.35] text-[#5f6368]">
                                    {entry.previewText}
                                  </span>
                                  <span className="shrink-0 text-[10px]">
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
                                  "shrink-0 self-center rounded-full px-2 py-1 text-[11px] leading-none transition-colors",
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

        {!conversationsQuery.isLoading && !hasConversationFullLoadError ? (
          hasConversationSectionContent ? (
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
          ) : pendingHideConversation || hasConversations ? null : (
            // pendingHideConversation 在 5s 撤销窗口内同时把 hasConversationSectionContent
            // 拉成 false——这时上方 InlineNotice 已经在显示「xxx 已从列表移除，5 秒内可
            // 撤销」，再叠一张「还没有新消息」会误导用户以为永久没了；空态等撤销
            // 窗口过期或被取消后下一次渲染再补。
            // hasConversations 但 !hasConversationSectionContent 的场景：用户只有
            // 「消息提醒」没有任何 conv / service / subscription，提醒 section 已经
            // 在上方独立渲染，这里再补「还没有新消息」会和已经在列的提醒自相矛盾。
            <div className="px-3 pt-2">
              <MobileChatListStatusCard
                badge={t(msg`消息`)}
                title={t(msg`还没有新消息`)}
                description={t(
                  msg`等角色、群聊或服务号开始发消息后，这里会显示最近会话。`,
                )}
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void navigate({ to: "/tabs/contacts" });
                    }}
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  >
                    {t(msg`去通讯录看看`)}
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
      // 走查 R3：原版仅靠样式表示「加载中 / 读取失败」，screen reader 进入页面
      // 时听不到任何状态。loading 走 role="status"（polite live region）让 SR
      // 在播完上文之后补一句「正在刷新消息列表 + 描述」；读取失败走 role="alert"
      // 立即播报让用户知道页面不可用。aria-busy=true 配合 loading 让 SR 给「忙
      // 等」反馈，等 isLoading=false 重渲后自动撤销。default tone（"还没有新消息"
      // 空态）不算瞬变状态，保留默认 section 语义不补 role 即可。
      role={loading ? "status" : tone === "danger" ? "alert" : undefined}
      aria-busy={loading || undefined}
      className={cn(
        "rounded-[20px] border px-4 py-5 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(245, 158, 11,0.1)] text-[#f59e0b]",
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

type ConversationListItemLinkProps = {
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
};

function ConversationListItemLinkImpl({
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
}: ConversationListItemLinkProps) {
  const t = useRuntimeTranslator();
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    initialOffset: number;
    dragging: boolean;
  } | null>(null);
  const showReadAction =
    conversation.unreadCount > 0 || canConversationBeMarkedUnread(conversation);
  const swipeActionWidth = (showReadAction ? 4 : 3) * SWIPE_ACTION_BUTTON_WIDTH;
  const readActionLabel =
    conversation.unreadCount > 0 ? t(msg`标已读`) : t(msg`标未读`);
  const muteActionClassName = conversation.isMuted
    ? "bg-[#f59e0b]"
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
      emptyText: t(msg`从这里开始第一句问候`),
    },
  );
  // 服务端 normalizeLegacyConversationEntity 在 title 全部 fallback 失败时
  // 持久化字面量 "未知联系人" / "Direct conversation"，切到英/日/韩 时仍渲染
  // 原始中文。这里用本地 i18n 把这两个 sentinel 翻译成当前 locale。
  const displayTitle = getConversationDisplayTitle(conversation.title);

  const updateSwipeOffset = (nextOffset: number) => {
    swipeOffsetRef.current = nextOffset;
    setSwipeOffset(nextOffset);
  };

  // 走查新一轮 R2：原版 deps=[open, swipeActionWidth]，对应一种"open 是状态
  // 唯一权威"的预设。但 handleTouchEnd 自己也会 setSwipeOffset(-swipeActionWidth)
  // 配合 onOpenChange(true)；如果同帧/同微任务里另一行也走完 touchend，
  //   setOpenSwipeConversationId(A.id) →（被覆盖）→ setOpenSwipeConversationId(B.id)
  // 在 React 18 自动 batch 下 commit 时 openSwipeConversationId 只剩 B：
  //   · A 的 open prop false→false（值未变），useEffect 不触发；
  //   · 但 A 自己的 handleTouchEnd 已经把 swipeOffset=-swipeActionWidth；
  //   · 结果 A 和 B 同时露出 swipe 四件套，跟 wechat "唯一展开" 语义对不上。
  // 典型 trigger：(a) 多指 swipe (b) 两根手指同时往左拖两行 (c) accessibility
  // 触控辅助 / 双触屏 dock 等冷门设备双触。
  // 修法：把 swipeOffset 自身也加进 deps，effect 在「offset 与 open 不一致」
  // 时强制同步——open=false 时本地却拉成 -272 → 立刻回弹到 0。无限循环风险用
  // `swipeOffsetRef.current !== nextOffset` gate 兜住。
  useEffect(() => {
    if (gestureRef.current?.dragging) {
      return;
    }
    const nextOffset = open ? -swipeActionWidth : 0;
    if (swipeOffsetRef.current === nextOffset) {
      return;
    }
    swipeOffsetRef.current = nextOffset;
    setSwipeOffset(nextOffset);
  }, [open, swipeActionWidth, swipeOffset]);

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
    // 容器 `touch-action: pan-y` 已经把横向手势让给了 JS（浏览器只负责竖向滚动），
    // 之前在 React onTouchMove 里 preventDefault 是 no-op + 控制台噪音，删掉。
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
        isPinned ? "bg-[#f5f1e6]" : "bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      {/* 走查第 3 次 R1：和 desktop-chat-workspace R35 同款——会话 isPinned 在
          移动端只通过 bg-[#f5f1e6] 视觉差 + 列表顶部位置表达，盲人 SR 用户
          只能听到会话名 / preview / 时间戳 / 未读数，听不出"这条是置顶的"。
          右侧的 Pin 图标仅在 !hasUnreadMessages 分支才渲染——有未读的置顶
          会话（典型用例：刚刚收到消息的我自己 / 工作群）SR 完全没有 pin
          线索。补一段 sr-only 文本到 content 开头，SR 朗读时会先报"已置顶
          + 会话名 ..."，明确表达列表里的位置语义；姊妹 isMuted 已经有
          BellOff aria-label 处理方向一致。 */}
      {isPinned ? (
        <span className="sr-only">{t(msg`已置顶`)}</span>
      ) : null}
      {/* 群聊和单聊用不同的头像组件——群聊后端没维护 avatar 字段（只有
          setGroupAvatar 这条没人调用的私有 API），AvatarChip 拿不到 src 就
          fallback 成"群名首字"单格占位（"林"），跟 /contacts/groups + 通讯录
          页用的 GroupAvatarChip 2×2 马赛克对不上——同一群在两处入口看见的
          icon 完全不一样。统一到 GroupAvatarChip，传 participants 让它按
          memberId 哈希出 4 格马赛克。 */}
      {isGroupConversation ? (
        <GroupAvatarChip
          name={displayTitle}
          members={conversation.participants}
          size="wechat"
        />
      ) : (
        <AvatarChip
          name={displayTitle}
          src={conversation.avatar}
          size="wechat"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-normal leading-[1.25] text-[color:var(--text-primary)]">
              {displayTitle}
            </div>
            <div className="mt-0.5 truncate text-[11px] leading-[1.35] text-[color:var(--text-muted)]">
              {preview.prefix}
              {preview.text}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
              {conversation.sparkStreak ? (
                <SparkBadge streak={conversation.sparkStreak} size="sm" />
              ) : null}
              <div className="text-[11px] text-[color:var(--text-dim)]">
                {/*
                  yuanzui0728 走查 R1：原版 fallback 链最后一级是
                  conversation.updatedAt——但 updatedAt 会被「mark read /
                  setConversationMuted / setConversationPinned / hideConversation
                  撤销」等纯元数据变更顺手 touch（ORM @UpdateDateColumn 行级别
                  自动刷新），并不代表"会话里有新东西发生"。实测：
                  _walk_emoji_69839 这条 direct conv 5/20 创建后再没真消息，
                  但 unread/pin 拨动让 updatedAt 跳到 2026-05-22 09:45 UTC →
                  chat-list 列出 "17:45 今天"，用户点进去发现空空如也。
                  改用 lastActivityAt（chat.service 显式按 message-write 维护）
                  作为更准确的 fallback，updatedAt 仅作为最终兜底（兼容
                  老数据 lastActivityAt 缺值的极端情况）。
                */}
                {formatConversationTimestamp(
                  visibleLastMessage?.createdAt ??
                    conversation.lastMessage?.createdAt ??
                    conversation.lastActivityAt ??
                    conversation.updatedAt,
                )}
              </div>
            </div>
            <div className="flex min-h-[18px] items-center gap-1">
              {conversation.isMuted ? (
                // 走查 R1（新一轮）：原版裸 <BellOff aria-label> 没挂 role；
                // 同行下方 R2 unread badge 已经统一到 role="img"（generic
                // 元素 / SVG 上 aria-label 行为 implementation-defined，VO
                // 严格模式或 Chromium AX 早期可能直接不暴露）。muted 是用
                // 户唯一的"会话静音"提示，盲人用户必须能可靠听到，跟下方
                // unread 走同一规约。Lucide 默认不挂任何 role。
                <BellOff
                  size={11}
                  className="text-[color:var(--text-dim)]"
                  role="img"
                  aria-label={t(msg`消息免打扰`)}
                />
              ) : null}
              {hasUnreadMessages ? (
                showMutedUnreadDot ? (
                  // 新一轮 R2 (a11y consistency)：原版裸 <div aria-label> 没挂
                  // role，按 ARIA 1.2 spec 在 generic 元素上 aria-label 行为
                  // implementation-defined（Chromium AX 早期 / VoiceOver 严格
                  // 模式可能直接不暴露）。同 OfficialMessageEntryRow R145、
                  // desktop-chat-workspace R106 已经标准化的 role="img" 写法对
                  // 齐：muted 变体只是一个 2×2 视觉小点，无 inner text，盲人
                  // 用户走静音会话行时这一个 aria-label 是仅有的未读信号，必
                  // 须可靠暴露。
                  <div
                    role="img"
                    className="h-2 w-2 rounded-full bg-[#b8b8b8]"
                    aria-label={
                      conversation.unreadCount > 99
                        ? t(msg`超过 99 条未读消息`)
                        : t(msg`${conversation.unreadCount} 条未读消息`)
                    }
                  />
                ) : (
                  // 新一轮 R2 (a11y consistency)：原 fix 用 role="status"——polite
                  // live region 语义是「操作完成态 / 临时状态变更」（如 toast
                  // / 加载完成），不适合长列表里 11 条静态未读 badge。每次
                  // refetchInterval=60s + socket scheduleListInvalidate 触发的
                  // 列表刷新，11 个 live region 都会被 SR 视为"新发生的状态
                  // 变化"重新公告一遍，盲人用户站在 chat-list 不动每分钟都
                  // 被「3 条未读消息 1 条未读消息 99+ 条未读消息 ...」打断。
                  // 改成 role="img"：跟 OfficialMessageEntryRow R145、
                  // desktop-chat-workspace R106 同款"被命名的视觉指示"，仍然
                  // 可靠暴露 aria-label，不再发动 live region。
                  <div
                    role="img"
                    aria-label={
                      conversation.unreadCount > 99
                        ? t(msg`超过 99 条未读消息`)
                        : t(
                            msg`${conversation.unreadCount} 条未读消息`,
                          )
                    }
                    className={cn(
                      "flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#fa5151] px-1 text-[11px] leading-none text-white shadow-[0_4px_12px_rgba(250,81,81,0.18)]",
                      conversation.unreadCount > 9 ? "min-w-[22px]" : undefined,
                    )}
                  >
                    <span aria-hidden="true">
                      {conversation.unreadCount > 99
                        ? "99+"
                        : conversation.unreadCount}
                    </span>
                  </div>
                )
              ) : isPinned ? (
                // 走查 R4：原 R1 加 role="img" + aria-label 引入了「已置顶」
                // 二次播报——content 开头第 3 次走查 R1 已经挂了 sr-only
                //「已置顶」，覆盖 pinned-with-unread / pinned-no-unread 两种
                // 状态。本 Pin 仅在 pinned-no-unread 才渲染，再带 aria-label
                // 会让 SR 在同一行行尾再听一次「置顶聊天」。aria-hidden 隔
                // 离掉避免 row 末尾重复播报，sr-only 在 row 头继续是唯一
                // pin 信号。
                <Pin
                  size={10}
                  className="text-[color:var(--text-dim)]"
                  aria-hidden="true"
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
      // 走查新一轮 R3：行容器之前只有 touch-pan-y，没挂 yj-no-callout。iOS Safari /
      // Android WebView 长按 <Link> 会弹出系统级 "Copy Link / Open in New Tab"
      // 菜单（TanStack Router 链接也命中，因为 DOM 上仍是真 <a href>），同时长
      // 按一秒以上会启动文本选区把标题/预览蓝色高亮——用户慢一拍开始横向 swipe
      // 时，gesture 被系统弹层 / 选区接管，应有的 pin/mute/标读/删除四件套永远
      // 进不去。其它 mobile-only 滑动列表（avatar-chip / group-avatar-chip /
      // mobile-shell bottom tab）都挂了这条类；唯独消息列表行漏了。加 yj-no-callout
      // 让 -webkit-touch-callout:none + user-select:none 沿 * 选择子件下沉到内层
      // Link / 文本 / swipe action button，swipe action button 不依赖 user-select
      // 仍然可点。
      className={cn(
        "yj-list-item-virtual yj-no-callout relative overflow-hidden bg-[#c4c7cc] touch-pan-y",
        className,
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/*
        新会话走查 R4：原版 linkClassName 在 pending 时挂 pointer-events-none
        让用户进不去聊天，但下面 absolute 定位的 4 个 swipe action button
        没禁。`pointer-events: none` 让 Link 对点击「透明」，hit-test 走到
        Link 下方的 action buttons 上（即便 swipe 已经在合上动画期间 / 已经
        合上视觉看不见，按钮还在 DOM 里并接收 click）。典型 trigger：
          1. 用户先 swipe 露 Pin/Mute/Mark/Delete 4 个按钮
          2. 点 Pin → setOpenSwipeConversationId(null) + pinMutation.mutate()
             同帧触发，pending=true 立刻挂上，但 swipeOffset 从 -272→0 还有
             ~150ms motion-fast 动画
          3. 这 150ms 里 Pin 已经透传不响应，但 Mute/Delete 仍然部分露出 +
             click 能穿透 Link 打到按钮 → 用户再点一下右侧任意位置 →
             muteMutation / hideMutation 同时入队，跟 pinMutation 抢同一会
             话的乐观更新，状态闪烁、optimistic rollback 互相冲掉
        给 action buttons 容器同款 pointer-events-none + 视觉 70% 透明，
        与 Link 一致表达「mutation 进行中、整行不可点」。
      */}
      {/*
        走查新一轮 R1（a11y critical）：原版 swipe-action 容器始终在 DOM 里，
        既没 aria-hidden 也没 inert——76 条会话 × 3~4 个按钮 = ~268 个隐藏
        button 永久挂在 AT tree 里。VoiceOver/TalkBack 顺序读到每一行时都先
        听见「取消置顶 取消免打扰 删除」再听 conversation 标题，盲人用户根本
        分不清这是当前会话已经"在执行什么"还是仅仅未展开的 swipe 选项；同时
        Tab 键焦点会跑进这 268 个不可见按钮里循环。
        实测 (playwright accessibility snapshot)：first row innerText =
        "取消置顶 取消免打扰 删除 🔧 陆辞..."。
        修法：!open 时给容器加 inert（React 19 原生支持），同时撤出 AT tree、
        撤出 Tab 焦点序、按钮也不可点（兼上面那条 pending 透传 hit-test 的
        担忧）；open=true 时正常暴露，用户已经主动 swipe 想用这些按钮。
      */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex",
          pending || !open ? "pointer-events-none" : undefined,
          pending ? "opacity-70" : undefined,
        )}
        inert={!open || undefined}
        aria-hidden={!open || undefined}
      >
        <button
          type="button"
          onClick={onTogglePinned}
          className="flex w-[68px] items-center justify-center bg-[#c4c7cc] text-white active:brightness-[0.96]"
        >
          <div className="flex flex-col items-center gap-0.5 text-[11px]">
            <Pin size={13} aria-hidden="true" />
            <span>
              {conversation.isPinned ? t(msg`取消置顶`) : t(msg`置顶`)}
            </span>
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
          <div className="flex flex-col items-center gap-0.5 text-[11px]">
            <BellOff size={13} aria-hidden="true" />
            <span>
              {conversation.isMuted ? t(msg`取消免打扰`) : t(msg`免打扰`)}
            </span>
          </div>
        </button>
        {showReadAction ? (
          <button
            type="button"
            onClick={onToggleReadState}
            className="flex w-[68px] items-center justify-center bg-[#5b8efc] text-white active:brightness-[0.96]"
          >
            <div className="flex flex-col items-center gap-0.5 text-[11px]">
              {conversation.unreadCount > 0 ? (
                <CheckCheck size={13} aria-hidden="true" />
              ) : (
                <Circle size={13} aria-hidden="true" />
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
          <div className="flex flex-col items-center gap-0.5 text-[11px]">
            <Trash2 size={13} aria-hidden="true" />
            <span>{t(msg`删除`)}</span>
          </div>
        </button>
      </div>
      {contentLink}
    </div>
  );
}

// memo + 自定义 comparator：parent visibleConversations.map 每次 render 都把
// onTogglePinned/onToggleMuted/... 当 inline arrow，每行新引用。这里只比较
// 数据属性，handler 引用变化忽略；optimistic pin/mute 时只有改动的会话的
// conversation 对象引用变 → 其他行跳过重渲染。
const ConversationListItemLink = memo(
  ConversationListItemLinkImpl,
  (prev, next) =>
    prev.conversation === next.conversation &&
    prev.localMessageActionState === next.localMessageActionState &&
    prev.open === next.open &&
    prev.pending === next.pending &&
    prev.className === next.className &&
    Boolean(prev.onToggleReadState) === Boolean(next.onToggleReadState),
);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// 与 api/src/modules/chat/chat.service.ts#listConversations 的排序规则保持一致：
// isPinned → pinnedAt desc → lastActivityAt desc。optimistic pin/取消置顶时本
// 地按同样的规则重排，避免会话在客户端留在旧位置直到下一次刷新。
function sortConversationsByBackendOrder<T extends ConversationListItem>(
  conversations: T[],
): T[] {
  const toMillis = (value: string | null | undefined) => {
    if (!value) return 0;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  };

  return [...conversations].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    const pinnedDelta = toMillis(right.pinnedAt) - toMillis(left.pinnedAt);
    if (pinnedDelta !== 0) {
      return pinnedDelta;
    }

    return toMillis(right.lastActivityAt) - toMillis(left.lastActivityAt);
  });
}

function canConversationBeMarkedUnread(conversation: ConversationListEntry) {
  return (
    conversation.unreadCount === 0 &&
    conversation.lastMessage?.senderType === "character"
  );
}
