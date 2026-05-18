import {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookText,
  BookUser,
  Plus,
  QrCode,
  Search,
  Settings,
  Star,
  Tag,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import {
  acceptFriendRequest,
  blockCharacter,
  declineFriendRequest,
  deleteFriend,
  getBlockedCharacters,
  getConversations,
  getFriendRequests,
  getFriends,
  getGroups,
  getOrCreateConversation,
  listCharacters,
  setConversationMuted,
  setConversationPinned,
  setFriendStarred,
  SELF_CHARACTER_ID,
  unblockCharacter,
} from "@yinjie/contracts";
import { AppPage, Button, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AvatarChip } from "../components/avatar-chip";
import { SparkBadge } from "../components/spark-badge";
import { EmptyState } from "../components/empty-state";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { ContactDetailPane } from "../features/contacts/contact-detail-pane";
import { ContactIndexList } from "../features/contacts/contact-index-list";
import { ContactsBulkActionBar } from "../features/contacts/management/contacts-bulk-action-bar";
import { ContactsManagementModal } from "../features/contacts/management/contacts-management-modal";
import {
  ContactShortcutList,
  type ContactShortcutListItem,
} from "../features/contacts/contact-shortcut-list";
import {
  buildDesktopContactsRouteHash,
  parseDesktopContactsRouteState,
} from "../features/contacts/contacts-route-state";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { buildMobileAddFriendRouteHash } from "../features/contacts/mobile-add-friend-route-state";
import { buildMobileFriendRequestsRouteHash } from "../features/contacts/mobile-friend-requests-route-state";
import { buildContactTagGroups } from "../features/contacts/contact-tag-groups";
import {
  buildContactSections,
  buildDesktopFriendSections,
  compareStarredFriends,
  createFriendDirectoryItems,
  createWorldCharacterDirectoryItems,
  matchesCharacterSearch,
  matchesFriendSearch,
  shouldIncludeInWorldCharacterDirectory,
  type FriendDirectoryItem,
} from "../features/contacts/contact-utils";
import { buildWorldCharactersRouteHash } from "../features/contacts/world-characters-route-state";
import { buildMobileGroupRouteHash } from "../features/chat/mobile-group-route-state";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
} from "../features/desktop/chat/desktop-chat-route-state";
import { buildDesktopFriendMomentsRouteHash } from "../features/moments/friend-moments-route-state";
import { buildMobileOfficialRouteHash } from "../features/official-accounts/mobile-official-route-state";
import { buildSearchRouteHash } from "../features/search/search-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import { normalizePathname } from "../lib/normalize-pathname";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopContactsWorkspace = lazy(async () => {
  const mod = await import("../features/contacts/contacts-workspace-shell");
  return { default: mod.ContactsWorkspaceShell };
});
const DesktopContactsFriendRequestsPane = lazy(async () => {
  const mod =
    await import("../features/desktop/contacts/desktop-contacts-friend-requests-pane");
  return { default: mod.DesktopContactsFriendRequestsPane };
});
const DesktopContactsGroupsPane = lazy(async () => {
  const mod =
    await import("../features/desktop/contacts/desktop-contacts-groups-pane");
  return { default: mod.DesktopContactsGroupsPane };
});
const DesktopContactsStarredFriendsPane = lazy(async () => {
  const mod =
    await import("../features/desktop/contacts/desktop-contacts-starred-friends-pane");
  return { default: mod.DesktopContactsStarredFriendsPane };
});
const DesktopContactsTagsPane = lazy(async () => {
  const mod =
    await import("../features/desktop/contacts/desktop-contacts-tags-pane");
  return { default: mod.DesktopContactsTagsPane };
});
const DesktopOfficialAccountsWorkspace = lazy(async () => {
  const mod =
    await import("../features/desktop/official-accounts/desktop-official-accounts-workspace");
  return { default: mod.DesktopOfficialAccountsWorkspace };
});

type ShortcutRoute =
  | "/contacts/groups"
  | "/friend-requests"
  | "/contacts/starred"
  | "/contacts/world-characters"
  | "/contacts/official-accounts";

type MobileErrorItem = {
  key: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type DesktopSelection =
  | {
      kind: "friend";
      id: string;
    }
  | {
      kind: "world-character";
      id: string;
    }
  | {
      kind: "new-friends";
    }
  | {
      kind: "starred-friends";
      id?: string;
    }
  | {
      kind: "tags";
    }
  | {
      kind: "groups";
      id?: string;
    }
  | {
      kind: "official-accounts";
      mode?: "feed" | "accounts";
      accountId?: string;
      articleId?: string;
    }
  | null;

function areDesktopSelectionsEqual(
  left: DesktopSelection,
  right: DesktopSelection,
) {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.kind === right.kind &&
    ("id" in left ? left.id : undefined) ===
      ("id" in right ? right.id : undefined) &&
    ("mode" in left ? left.mode : undefined) ===
      ("mode" in right ? right.mode : undefined) &&
    ("accountId" in left ? left.accountId : undefined) ===
      ("accountId" in right ? right.accountId : undefined) &&
    ("articleId" in left ? left.articleId : undefined) ===
      ("articleId" in right ? right.articleId : undefined)
  );
}

function buildDesktopSelectionFromRouteState(hash: string): DesktopSelection {
  const routeState = parseDesktopContactsRouteState(hash);
  if (routeState.pane === "new-friends") {
    return {
      kind: "new-friends",
    };
  }

  if (routeState.pane === "starred-friends") {
    return {
      kind: "starred-friends",
      ...(routeState.characterId ? { id: routeState.characterId } : {}),
    };
  }

  if (routeState.pane === "tags") {
    return {
      kind: "tags",
    };
  }

  if (routeState.pane === "groups") {
    return {
      kind: "groups",
      ...(routeState.characterId ? { id: routeState.characterId } : {}),
    };
  }

  if (routeState.pane === "official-accounts") {
    return {
      kind: "official-accounts",
      mode:
        routeState.officialMode ??
        (routeState.accountId || routeState.articleId ? "accounts" : "feed"),
      ...(routeState.accountId ? { accountId: routeState.accountId } : {}),
      ...(routeState.articleId ? { articleId: routeState.articleId } : {}),
    };
  }

  if (!routeState.characterId) {
    return null;
  }

  if (routeState.pane === "friend") {
    return {
      kind: "friend",
      id: routeState.characterId,
    };
  }

  return {
    kind: "world-character",
    id: routeState.characterId,
  };
}

type MobileQuickActionRoute = "/group/new" | "/add-friend";

type MobileQuickActionItem = {
  key: string;
  label: ContactsMessage;
  icon: typeof Users;
  to?: MobileQuickActionRoute;
  disabled?: boolean;
  disabledLabel?: ContactsMessage;
};

type ContactsMessage = ReturnType<typeof msg>;

const mobileQuickActionItems: MobileQuickActionItem[] = [
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

export function ContactsPage() {
  const t = useRuntimeTranslator();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const desktopDirectoryScrollRef = useRef<HTMLDivElement | null>(null);
  const quickMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = parseDesktopContactsRouteState(hash);
  const [searchText, setSearchText] = useState("");
  // 通讯录顶端的全局 notice：默认 info（成功类反馈），批量操作失败时走 danger。
  // 以前用 string + 渲染时硬编码 tone="info" 一刀切，批量删除/打标签/星标的整条
  // 调用挂掉（502 / 网络抖断）时弹出的"删除：操作失败：xxx" 也被画成蓝色 info，
  // 看上去跟"已置顶"这种成功反馈长得一模一样，用户察觉不到出错。
  const [notice, _setNotice] = useState<{
    message: string;
    tone: "info" | "danger";
  } | null>(null);
  const setNotice = useCallback((next: string | null) => {
    _setNotice(next ? { message: next, tone: "info" } : null);
  }, []);
  const setNoticeError = useCallback((next: string | null) => {
    _setNotice(next ? { message: next, tone: "danger" } : null);
  }, []);
  // 新的朋友面板专用的内联成功提示——全局 notice 会泄漏到这里（如改星标后切回，
  // 旧 isSuccess 还挂着会把"已设为星标朋友。"显示在好友申请面板里）。
  // 带 ts 防止连续两次同 message（如连点两条「接受」）setState 拿到一样的字符串
  // 引用被 React.Object.is 跳过，自清 timer 不重启，第二次只能蹭第一次剩余的时间。
  const [friendRequestSuccess, setFriendRequestSuccessState] = useState<
    { message: string; ts: number } | null
  >(null);
  const setFriendRequestSuccess = useCallback((message: string) => {
    setFriendRequestSuccessState({ message, ts: Date.now() });
  }, []);
  const [showWorldCharacters, setShowWorldCharacters] = useState(
    routeState.showWorldCharacters,
  );
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setBulkSelectedIds(new Set());
  }, []);
  // 部分操作失败时收敛选区到失败那几条；bulk 模式保留，让用户继续重试。
  const retainBulkFailures = useCallback((failedIds: string[]) => {
    setBulkSelectedIds(new Set(failedIds));
  }, []);
  const toggleBulkSelection = useCallback((characterId: string) => {
    // 走查 Round 2：char-default-self 后端的 deleteFriend / blockCharacter 已经兜底
    // 400 拒绝，但前端如果还允许把它放进 selectedIds，全选 + 删除走查到 1 项 failed
    // 是 self → 用户看到 "删除：1 项操作失败" 没法理解失败原因。直接在 toggle 层
    // 拦掉，让 self 行点击 / 全选都不进选区。
    if (characterId === SELF_CHARACTER_ID) {
      return;
    }
    setBulkSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(characterId)) {
        next.delete(characterId);
      } else {
        next.add(characterId);
      }
      return next;
    });
  }, []);
  const [desktopSelection, setDesktopSelection] = useState<DesktopSelection>(
    () => buildDesktopSelectionFromRouteState(hash),
  );
  const [activeMobileIndexKey, setActiveMobileIndexKey] = useState<
    string | null
  >(null);
  const [activeDesktopIndexKey, setActiveDesktopIndexKey] = useState<
    string | null
  >(null);
  const previousBaseUrlRef = useRef(baseUrl);
  const startChatResetRef = useRef<() => void>(() => {});
  // 之前写成 useDeferredValue("") —— deferredSearchText 永远是空串，导致桌面
  // 通讯录的内联搜索一直跑不到 matchesFriendSearch 分支：输入框打了字看上去没
  // 反应，「没有找到匹配的联系人」「清空搜索」这两个空态分支也永远不会亮起。
  // 必须把 searchText 真正喂进 useDeferredValue 才能让搜索生效。
  const deferredSearchText = useDeferredValue(searchText);
  const desktopContactsPath = "/tabs/contacts";
  const normalizedPathname = normalizePathname(pathname);
  const desktopPathMismatch = normalizedPathname !== desktopContactsPath;
  // 一旦在桌面布局下落到 /tabs/contacts 就锁定；之后 useRouterState 在路由切换瞬间
  // 反映出新的 pathname 时不再把用户拉回——否则会拦截 + 菜单的 发起群聊 等合法导航
  // （会在跳出 /tabs/contacts 前被 effect 强制回弹，落到默认 friend 面板，看起来像
  // 误跳到了好友信息页）。
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
      to: desktopContactsPath,
      hash: hash || undefined,
      replace: true,
    });
  }, [desktopContactsPath, desktopPathMismatch, hash, isDesktopLayout, navigate]);

  // 新一轮走查：通讯录主页是 tab bar 第二格，用户在 tabs/chat / tabs/contacts /
  // tabs/discover / tabs/me 之间频繁来回切，每次切回 /tabs/contacts 都把 4-6 条
  // query 全部 background refetch（staleTime 默认 0 → 进入立即 stale）。在弱网真机
  // 上 4 条并发请求 ≈ 400-800ms 无谓流量，电池/数据双费。所有 mutation 都
  // 显式 invalidate 这几条 key，跨会话变更交给 focus refetch 兜底即可，因此用
  // staleTime: 15-30s 配合 mobile-add-friend-page 同名 query 的窗口，让 tab
  // 切换在 15s 内复用缓存。
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });

  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
    staleTime: 30_000,
  });

  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
    staleTime: 15_000,
  });

  const contactGroupsQuery = useQuery({
    queryKey: ["app-contact-groups", baseUrl],
    queryFn: () => getGroups(baseUrl),
    staleTime: 30_000,
  });

  const blockedCharactersQuery = useQuery({
    queryKey: ["app-contacts-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: isDesktopLayout,
    staleTime: 30_000,
  });

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: isDesktopLayout,
    staleTime: 15_000,
  });

  const startChatMutation = useMutation({
    mutationFn: (characterId: string) =>
      getOrCreateConversation({ characterId }, baseUrl),
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }

      void navigate({
        to: isDesktopLayout
          ? buildDesktopChatThreadPath({ conversationId: conversation.id, })
          : "/chat/$conversationId",
        params: isDesktopLayout
          ? undefined
          : { conversationId: conversation.id },
      } as never);
    },
  });

  const pendingCharacterId = startChatMutation.isPending
    ? startChatMutation.variables
    : null;
  const normalizedSearchText = deferredSearchText.trim().toLowerCase();

  const friendIds = useMemo(
    () =>
      new Set((friendsQuery.data ?? []).map(({ character }) => character.id)),
    [friendsQuery.data],
  );

  const friendDirectoryItems = useMemo(
    () => createFriendDirectoryItems(friendsQuery.data ?? []),
    [friendsQuery.data],
  );

  const worldCharacterDirectoryItems = useMemo(
    () =>
      createWorldCharacterDirectoryItems(
        (charactersQuery.data ?? []).filter((character) =>
          shouldIncludeInWorldCharacterDirectory(character, friendIds),
        ),
      ),
    [charactersQuery.data, friendIds],
  );

  const filteredFriendItems = useMemo(() => {
    if (!normalizedSearchText) {
      return friendDirectoryItems;
    }

    return friendDirectoryItems.filter((item) =>
      matchesFriendSearch(item, normalizedSearchText),
    );
  }, [friendDirectoryItems, normalizedSearchText]);

  const filteredWorldCharacterItems = useMemo(() => {
    if (normalizedSearchText) {
      return worldCharacterDirectoryItems.filter((item) =>
        matchesCharacterSearch(item.character, normalizedSearchText),
      );
    }

    return showWorldCharacters ? worldCharacterDirectoryItems : [];
  }, [normalizedSearchText, showWorldCharacters, worldCharacterDirectoryItems]);

  const friendSections = useMemo(
    () => buildContactSections(filteredFriendItems),
    [filteredFriendItems],
  );
  const desktopFriendSections = useMemo(
    () => buildDesktopFriendSections(filteredFriendItems),
    [filteredFriendItems],
  );
  const worldCharacterSections = useMemo(
    () => buildContactSections(filteredWorldCharacterItems),
    [filteredWorldCharacterItems],
  );
  const desktopWorldCharacterSections = useMemo(
    () =>
      worldCharacterSections.map((section) => ({
        ...section,
        anchorId: `desktop-${section.anchorId}-world`,
      })),
    [worldCharacterSections],
  );
  const desktopWorldCharacterIndexItems = useMemo(
    () =>
      desktopWorldCharacterSections.map((section) => ({
        key: section.anchorId,
        indexLabel: section.indexLabel,
      })),
    [desktopWorldCharacterSections],
  );
  const mobileIndexItems = useMemo(
    () =>
      friendSections.map((section) => ({
        key: section.anchorId,
        indexLabel: section.indexLabel,
      })),
    [friendSections],
  );
  const desktopIndexItems = useMemo(
    () => [
      ...desktopFriendSections.map((section) => ({
        key: section.anchorId,
        indexLabel: section.indexLabel,
      })),
      ...desktopWorldCharacterIndexItems,
    ],
    [desktopFriendSections, desktopWorldCharacterIndexItems],
  );

  const pendingRequestCount = useMemo(
    () =>
      (friendRequestsQuery.data ?? []).filter(
        (request) => request.status === "pending",
      ).length,
    [friendRequestsQuery.data],
  );
  // 走查 Round 7：原版用 contactGroupsQuery.data.length 当 "X 个群聊" 副标，
  // 但 /contacts/groups 子页早在 Round 3 加了客户端过滤 isHidden=true，
  // visibleGroups 只统计未隐藏的——两边数对不上：父页"5 个群聊"，进去
  // 实际只能看到 2 条，差出来的 3 条是 hide 状态的。统一按 visible 口径
  // 算 count。
  const groupCount = useMemo(
    () =>
      (contactGroupsQuery.data ?? []).filter((group) => !group.isHidden)
        .length,
    [contactGroupsQuery.data],
  );

  const selectedFriendItem = useMemo(() => {
    if (desktopSelection?.kind !== "friend") {
      return null;
    }

    return (
      filteredFriendItems.find(
        (item) => item.character.id === desktopSelection.id,
      ) ??
      friendDirectoryItems.find(
        (item) => item.character.id === desktopSelection.id,
      ) ??
      null
    );
  }, [desktopSelection, filteredFriendItems, friendDirectoryItems]);

  const selectedWorldCharacterItem = useMemo(() => {
    if (desktopSelection?.kind !== "world-character") {
      return null;
    }

    return (
      filteredWorldCharacterItems.find(
        (item) => item.character.id === desktopSelection.id,
      ) ??
      worldCharacterDirectoryItems.find(
        (item) => item.character.id === desktopSelection.id,
      ) ??
      null
    );
  }, [
    desktopSelection,
    filteredWorldCharacterItems,
    worldCharacterDirectoryItems,
  ]);

  const selectedCharacterId =
    selectedFriendItem?.character.id ??
    selectedWorldCharacterItem?.character.id ??
    null;
  const selectedFriendBlocked = useMemo(
    () =>
      Boolean(
        selectedFriendItem &&
        (blockedCharactersQuery.data ?? []).some(
          (item) => item.characterId === selectedFriendItem.character.id,
        ),
      ),
    [blockedCharactersQuery.data, selectedFriendItem],
  );
  const selectedConversation = useMemo(
    () =>
      selectedFriendItem
        ? ((conversationsQuery.data ?? []).find(
            (conversation) =>
              !isPersistedGroupConversation(conversation) &&
              conversation.participants.includes(
                selectedFriendItem.character.id,
              ),
          ) ?? null)
        : null,
    [conversationsQuery.data, selectedFriendItem],
  );
  const commonGroups = useMemo(
    () =>
      selectedFriendItem
        ? (conversationsQuery.data ?? [])
            .filter(
              (conversation) =>
                isPersistedGroupConversation(conversation) &&
                conversation.participants.includes(
                  selectedFriendItem.character.id,
                ),
            )
            .map((conversation) => ({
              id: conversation.id,
              name: conversation.title,
            }))
        : [],
    [conversationsQuery.data, selectedFriendItem],
  );
  const desktopDefaultFriendItem = desktopFriendSections[0]?.items[0] ?? null;
  const starredFriends = useMemo(
    // 排序逻辑跟移动 starred-friends-page 共用：starredAt DESC → 显示名 → id。
    // 没排序时桌面星标列表的顺序就是 getFriends() 落库顺序，刚加星标的好友常常
    // 排到中间或末尾，用户找不到自己刚操作的那条；mobile 早就是 starredAt DESC，
    // 桌面这边一直没补。
    () =>
      (friendsQuery.data ?? [])
        .filter((item) => item.friendship.isStarred)
        .sort(compareStarredFriends),
    [friendsQuery.data],
  );
  // 把「星标好友的共同群聊 + 直通会话」两份索引合并到一次 conversations
  // 遍历里建好。原实现对每个 starred friend 都 .filter / .find 一遍整个
  // conversations 数组：O(starred × conversations)；用户星标多 + 群聊多时
  // 每次 conversationsQuery 变（来一条消息 / 切置顶都会变）这两条 useMemo
  // 全量重算，2.4s notice 还没消主线程已经被刷了两遍。反过来 outer-loop
  // conversations + inner-loop participants（群聊 ≤ 几十人 / 直通会话只有
  // 2 人）配合 starredIdSet O(1) 命中，总开销 ≈ O(conversations) + O(starred)。
  const { starredCommonGroupsByCharacterId, starredDirectConversationByCharacterId } = useMemo(() => {
    const commonGroupsMap: Record<string, Array<{ id: string; name: string }>> = {};
    const directConvMap: Record<
      string,
      { id: string; isPinned: boolean; isMuted: boolean }
    > = {};
    const starredIdSet = new Set(
      starredFriends.map((item) => item.character.id),
    );
    if (!starredIdSet.size) {
      return {
        starredCommonGroupsByCharacterId: commonGroupsMap,
        starredDirectConversationByCharacterId: directConvMap,
      };
    }
    // 预填 commonGroups 为 []：跟旧实现保持「starred 但 0 共同群聊」也有 entry，
    // 避免下游 `?? []` 形态差异（虽然语义等价，单测里曾经按 key 个数断言过）。
    for (const id of starredIdSet) {
      commonGroupsMap[id] = [];
    }
    const conversations = conversationsQuery.data ?? [];
    for (const conversation of conversations) {
      const isGroup = isPersistedGroupConversation(conversation);
      if (isGroup) {
        // participants 是 string[] 没去重保证：万一同一 starred 好友在同一群
        // participants 里出现两次（如服务端 join 漏 distinct），老 .filter()
        // 语义只算一条；这里 inner-loop 不加 seen 集合会重复 push 同一群。
        // 用一个轻量 Set 守住「同一 conversation 内对同一 participant 只算一次」。
        const seen = new Set<string>();
        for (const participantId of conversation.participants) {
          if (!starredIdSet.has(participantId) || seen.has(participantId)) {
            continue;
          }
          seen.add(participantId);
          commonGroupsMap[participantId]!.push({
            id: conversation.id,
            name: conversation.title,
          });
        }
        continue;
      }
      // 直通会话：找到 starred 对方那一位（参与者通常 2 人，包含 self；跳过 self
      // 以免误把自己当对面 starred 友的直通会话）。已经命中过的不再覆写，沿用
      // 旧 .find() 「第一条匹配」语义，避免后台并行返回多条直通时表现漂移。
      for (const participantId of conversation.participants) {
        if (!starredIdSet.has(participantId)) {
          continue;
        }
        if (directConvMap[participantId]) {
          continue;
        }
        directConvMap[participantId] = {
          id: conversation.id,
          isPinned: Boolean(conversation.isPinned),
          isMuted: Boolean(conversation.isMuted),
        };
      }
    }
    return {
      starredCommonGroupsByCharacterId: commonGroupsMap,
      starredDirectConversationByCharacterId: directConvMap,
    };
  }, [conversationsQuery.data, starredFriends]);
  const starredIsPinnedByCharacterId = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const [characterId, conversation] of Object.entries(
      starredDirectConversationByCharacterId,
    )) {
      map[characterId] = conversation.isPinned;
    }
    return map;
  }, [starredDirectConversationByCharacterId]);
  const starredIsMutedByCharacterId = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const [characterId, conversation] of Object.entries(
      starredDirectConversationByCharacterId,
    )) {
      map[characterId] = conversation.isMuted;
    }
    return map;
  }, [starredDirectConversationByCharacterId]);
  const blockedCharacterIdSet = useMemo(
    () =>
      new Set(
        (blockedCharactersQuery.data ?? []).map((item) => item.characterId),
      ),
    [blockedCharactersQuery.data],
  );
  const tagGroupCount = useMemo(
    () => buildContactTagGroups(friendsQuery.data ?? [], "").length,
    [friendsQuery.data],
  );
  // 桌面 / 移动「批量管理」全选时需要把所有可见好友的 characterId 拍平成一个数组。
  // 原来同样的 flatMap 在 JSX 里写了两遍（totalIds + onSelectAll 里），每渲染都新建
  // 数组；这里抽出来共用，避免在 ContactsBulkActionBar 里也无谓地拿到不同的引用
  // 触发 allSelected 的重比较。
  // 走查 Round 2：把 char-default-self 从全选集合里排除，跟 toggleBulkSelection 的
  // self 守卫一致；否则 bulkBar.allSelected 永远没法变 true（totalIds 含 self，
  // selectedIds 里 toggle 又永远进不去 self），「取消全选」按钮永远不亮。
  const desktopBulkAllIds = useMemo(
    () =>
      desktopFriendSections.flatMap((section) =>
        section.items
          .filter((item) => item.character.id !== SELF_CHARACTER_ID)
          .map((item) => item.character.id),
      ),
    [desktopFriendSections],
  );
  const mobileBulkAllIds = useMemo(
    () =>
      friendSections.flatMap((section) =>
        section.items
          .filter((item) => item.character.id !== SELF_CHARACTER_ID)
          .map((item) => item.character.id),
      ),
    [friendSections],
  );

  const commitDesktopRouteState = useCallback(
    (
      nextSelection: DesktopSelection,
      nextShowWorldCharacters: boolean,
      replace = false,
    ) => {
      const nextHash = buildDesktopContactsRouteHash({
        pane: nextSelection?.kind ?? "friend",
        characterId:
          nextSelection && "id" in nextSelection ? nextSelection.id : undefined,
        accountId:
          nextSelection?.kind === "official-accounts"
            ? nextSelection.accountId
            : undefined,
        articleId:
          nextSelection?.kind === "official-accounts"
            ? nextSelection.articleId
            : undefined,
        officialMode:
          nextSelection?.kind === "official-accounts"
            ? nextSelection.mode
            : undefined,
        showWorldCharacters: nextShowWorldCharacters,
      });
      const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

      if ((nextHash ?? "") === normalizedHash) {
        return;
      }

      void navigate({
        to: "/tabs/contacts",
        hash: nextHash,
        replace,
      });
    },
    [hash, navigate],
  );

  useEffect(() => {
    startChatResetRef.current = startChatMutation.reset;
  }, [startChatMutation.reset]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    const nextSelection = buildDesktopSelectionFromRouteState(hash);
    if (!areDesktopSelectionsEqual(desktopSelection, nextSelection)) {
      setDesktopSelection(nextSelection);
    }

    if (showWorldCharacters !== routeState.showWorldCharacters) {
      setShowWorldCharacters(routeState.showWorldCharacters);
    }
  }, [
    desktopSelection,
    hash,
    isDesktopLayout,
    routeState.showWorldCharacters,
    showWorldCharacters,
  ]);

  const blockMutation = useMutation({
    mutationFn: async ({
      characterId,
      blocked,
    }: {
      characterId: string;
      blocked: boolean;
    }) => {
      if (blocked) {
        return unblockCharacter({ characterId }, baseUrl);
      }

      return blockCharacter(
        {
          characterId,
          reason: "来自通讯录详情页加入黑名单", // i18n-ignore-line
        },
        baseUrl,
      );
    },
    onSuccess: async (_, variables) => {
      setNotice(
        variables.blocked ? t(msg`已移出黑名单。`) : t(msg`已加入黑名单。`),
      );
      await Promise.all([
        // 加入黑名单后服务端把 friendship.status 改成 'blocked'，getFriends() 会
        // 把它过滤掉。如果不 invalidate app-friends，列表里这位「已黑」联系人
        // 仍然显示成普通好友（连星标徽章都还在），看上去拉黑没生效。
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-contacts-blocked", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-chat-details-blocked", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-chat-blocked-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });
  const acceptFriendRequestMutation = useMutation({
    mutationFn: (requestId: string) => acceptFriendRequest(requestId, baseUrl),
    // mutate 开新一轮前先把对面 mutation 的错误清掉，否则用户点接受失败 → 改点
    // 拒绝成功，actionError 里那条旧的"接受失败"红字还会卡在面板顶端。
    // 同时把"点击时是否在 new-friends 面板"快照成 context，避免 onSuccess
    // 里再读 desktopSelection 时用户已经手动切到别处，被 auto-navigate 拽回来。
    // 还要清掉上一条 success 提示——否则新动作刚开始 pending 时 banner 里还
    // 挂着上次的"已通过/已忽略"，用户会以为"咦我刚点的已经成了？"。
    onMutate: () => {
      declineFriendRequestMutation.reset();
      setFriendRequestSuccessState(null);
      return {
        wasOnNewFriendsPane: desktopSelection?.kind === "new-friends",
      };
    },
    onSuccess: async (_data, requestId, context) => {
      const acceptedRequest =
        (friendRequestsQuery.data ?? []).find(
          (request) => request.id === requestId,
        ) ?? null;
      // 用户在「新的朋友」面板里多半是在批量处理；接受一条就强制跳到该好友详情
      // 等于把人甩出列表，下一条还得手动回来。这里只在用户原本就不在 new-friends
      // 面板（例如通知/路由直跳进来 accept）时才跳，避免打断批量流。
      const wasOnNewFriendsPane = context?.wasOnNewFriendsPane ?? false;

      setNotice(t(msg`已通过好友申请。`));
      setFriendRequestSuccess(t(msg`已通过好友申请。`));
      // 走查 R1：app-friends-quick-start 全代码库 0 个 useQuery 订阅；app-group-friends
      // 在 create-group-page 已统一到 app-friends。两条 invalidate 都是死代码。
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);

      if (!wasOnNewFriendsPane && acceptedRequest?.characterId) {
        const nextSelection = {
          kind: "friend",
          id: acceptedRequest.characterId,
        } satisfies DesktopSelection;
        setDesktopSelection(nextSelection);
        commitDesktopRouteState(nextSelection, showWorldCharacters);
      }
    },
  });
  const declineFriendRequestMutation = useMutation({
    mutationFn: (requestId: string) => declineFriendRequest(requestId, baseUrl),
    onMutate: (requestId: string) => {
      acceptFriendRequestMutation.reset();
      setFriendRequestSuccessState(null);
      // 桌面端「清除」/「拒绝」都走同一个 declineFriendRequest endpoint，但
      // success 文案要区分：过期请求点的是「清除」，反馈应该是「已清除过期
      // 请求。」；活跃请求点的是「拒绝」，反馈是「已忽略好友申请。」。请求是否
      // 过期得在点击瞬间从当前 list 里拍下来，onSuccess 那时数据已经被
      // invalidate 重拉、本条已经不在里面了。
      const target = (friendRequestsQuery.data ?? []).find(
        (item) => item.id === requestId,
      );
      const expired =
        target?.expiresAt != null &&
        !Number.isNaN(new Date(target.expiresAt).getTime()) &&
        new Date(target.expiresAt).getTime() <= Date.now();
      return { expired };
    },
    onSuccess: async (_data, _requestId, context) => {
      const message = context?.expired
        ? t(msg`已清除过期请求。`)
        : t(msg`已忽略好友申请。`);
      setNotice(message);
      setFriendRequestSuccess(message);
      await queryClient.invalidateQueries({
        queryKey: ["app-friend-requests", baseUrl],
      });
    },
  });
  const setStarredMutation = useMutation({
    mutationFn: ({
      characterId,
      starred,
    }: {
      characterId: string;
      starred: boolean;
    }) => setFriendStarred(characterId, { starred }, baseUrl),
    onSuccess: async (_, variables) => {
      setNotice(
        variables.starred ? t(msg`已设为星标朋友。`) : t(msg`已取消星标朋友。`),
      );
      await queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
    },
  });
  const pinMutation = useMutation({
    mutationFn: async ({
      characterId,
      pinned,
    }: {
      characterId: string;
      pinned: boolean;
    }) => {
      // 原实现只看 selectedConversation（来自 friend pane 选中的好友），
      // 在 starred-friends / tags / groups sub-pane 里 selectedFriendItem=null →
      // selectedConversation=null，所有 pin/mute 切换都白白多打一次 getOrCreate
      // 即便 conversationsQuery.data 里就有那条直通会话。先在 cache 里找；找不到
      // 才回退到 getOrCreate（新好友、刚加好友但还没生成 direct conversation）。
      const cachedConversation = (conversationsQuery.data ?? []).find(
        (conversation) =>
          !isPersistedGroupConversation(conversation) &&
          conversation.participants.includes(characterId),
      );
      const conversationId =
        cachedConversation?.id ??
        (await getOrCreateConversation({ characterId }, baseUrl)).id;

      return setConversationPinned(conversationId, { pinned }, baseUrl);
    },
    onSuccess: async (_, variables) => {
      setNotice(
        variables.pinned ? t(msg`聊天已置顶。`) : t(msg`聊天已取消置顶。`),
      );
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });
  const muteMutation = useMutation({
    mutationFn: async ({
      characterId,
      muted,
    }: {
      characterId: string;
      muted: boolean;
    }) => {
      const cachedConversation = (conversationsQuery.data ?? []).find(
        (conversation) =>
          !isPersistedGroupConversation(conversation) &&
          conversation.participants.includes(characterId),
      );
      const conversationId =
        cachedConversation?.id ??
        (await getOrCreateConversation({ characterId }, baseUrl)).id;

      return setConversationMuted(conversationId, { muted }, baseUrl);
    },
    onSuccess: async (_, variables) => {
      setNotice(
        variables.muted
          ? t(msg`已开启消息免打扰。`)
          : t(msg`已关闭消息免打扰。`),
      );
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });
  const deleteFriendMutation = useMutation({
    mutationFn: (characterId: string) => deleteFriend(characterId, baseUrl),
    onSuccess: async () => {
      setNotice(t(msg`已从通讯录删除联系人。`));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  useEffect(() => {
    if (previousBaseUrlRef.current === baseUrl) {
      return;
    }

    previousBaseUrlRef.current = baseUrl;
    // 切世界 / 切账号会让所有 character/friendship ID 整套换掉，bulk 选中的
    // characterIds 在新世界基本对不上号；如果不清，用户在 bulk 模式下切 world
    // 之后点删除 → bulkFriendshipAction 拿一堆"上个世界 ID"打过去，server 全
    // 部 SOCIAL_FRIEND_NOT_FOUND，看上去像批量删除整条挂掉。同理管理 modal /
    // + 快捷菜单 / 搜索框 / 提示条都是"上个世界的 UI 状态"，一并复位。
    setBulkMode(false);
    setBulkSelectedIds(new Set());
    setManagementOpen(false);
    setIsQuickMenuOpen(false);
    setSearchText("");
    _setNotice(null);
    startChatResetRef.current();
  }, [baseUrl]);

  // 通讯录全局 notice 完成动作后应该自然淡出，对齐 mobile-add-friend / friend-
  // requests 的自清模板。原本一律 2.4s，但 danger（批量失败）信息在 2.4s 里
  // 用户基本来不及读完红字 + 错误原因，延长到 4.5s。
  useEffect(() => {
    if (!notice) {
      return;
    }
    const delay = notice.tone === "danger" ? 4500 : 2400;
    const timer = window.setTimeout(() => _setNotice(null), delay);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!friendRequestSuccess) {
      return;
    }
    const timer = window.setTimeout(
      () => setFriendRequestSuccessState(null),
      2400,
    );
    return () => window.clearTimeout(timer);
  }, [friendRequestSuccess]);

  // 有待处理好友申请且在桌面布局下时，提前 warm 这个 lazy chunk。用户多半
  // 会点 sidebar 那个 shortcut，预加载后命中点击瞬间不再走 Suspense fallback。
  // chunk 很小（pane 自身 + AvatarChip），eager 一次没有成本顾虑。
  const hasPendingRequests = pendingRequestCount > 0;
  useEffect(() => {
    if (!isDesktopLayout || !hasPendingRequests) {
      return;
    }
    void import(
      "../features/desktop/contacts/desktop-contacts-friend-requests-pane"
    );
  }, [isDesktopLayout, hasPendingRequests]);

  // 同样地，有星标朋友时 warm 一下 starred-friends pane chunk——首次点
  // 「星标朋友」shortcut 时如果 chunk 没下，会走 Suspense fallback 显示
  // 「正在打开星标朋友...」loader，瞬态体验不好。friend-requests pane 已经
  // 有这套预热逻辑，starred pane 漏了。
  const hasStarredFriends = starredFriends.length > 0;
  useEffect(() => {
    if (!isDesktopLayout || !hasStarredFriends) {
      return;
    }
    void import(
      "../features/desktop/contacts/desktop-contacts-starred-friends-pane"
    );
  }, [isDesktopLayout, hasStarredFriends]);

  // 走查 R2：移动端用户点开 + 快捷菜单后，大概率会落到「发起群聊」或
  // 「添加朋友」其中一个。这两条路由在 router 里都是 lazy() 包的，chunk
  // 没预热的话从点 + → 选项 → navigate 这段会卡在 TanStack Router 的 Suspense
  // fallback（contact-page 整页白屏 → create-group / add-friend 才挂出来），
  // 慢网下 1-2 秒明显可见。router 的 defaultPreload:"intent" 只对 <Link>
  // 起 hover/focus 作用，这里两条都是 <button onClick={navigate}>，preload
  // 永远不会触发。menu 一打开就 warm 这两条 chunk，等用户的手指从 + 移到
  // 选项的几百毫秒里基本能拉完。React.lazy 内部对同一个 import URL 做了
  // promise dedupe，重开 + menu 不会重新拉。
  useEffect(() => {
    if (isDesktopLayout || !isQuickMenuOpen) {
      return;
    }
    void import("./create-group-page");
    void import("./mobile-add-friend-page");
  }, [isDesktopLayout, isQuickMenuOpen]);

  // 离开 new-friends 面板时清掉 success 提示。否则用户接受好友 → 切到其它
  // 面板 → 2.4s 内切回来，pane 重新挂载读到上次的 friendRequestSuccess，
  // 闪一遍旧确认条，看起来像新动作刚发生。
  useEffect(() => {
    if (desktopSelection?.kind !== "new-friends") {
      setFriendRequestSuccessState(null);
    }
  }, [desktopSelection?.kind]);

  // 原生壳硬件 Back（仅移动布局生效）：
  // 1) + 快捷菜单打开时先收菜单
  // 2) 批量管理模式时先退多选
  // 不接的话 BACK 会落到 root-tab 双击退出分支，看着像菜单/多选丢了。
  // 管理 modal 自己注册更晚 → 优先级更高，不会被这条吞掉。
  useEffect(() => {
    if (isDesktopLayout) {
      return;
    }
    if (!isQuickMenuOpen && !bulkMode) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      if (isQuickMenuOpen) {
        event.preventDefault();
        setIsQuickMenuOpen(false);
        return true;
      }
      if (bulkMode) {
        event.preventDefault();
        exitBulkMode();
        return true;
      }
      return false;
    });
    return unregister;
  }, [isDesktopLayout, isQuickMenuOpen, bulkMode, exitBulkMode]);

  // + 快捷菜单点空白收起：之前用 fixed inset-0 z-30 的全屏 button 接 onClick
  // 来关菜单。问题是这块 overlay 也盖住了底部 MobileShell 的 4 个 tab，用户在
  // 菜单展开时点 "我" 之类的底部 tab，第一下被 overlay 吃掉只关菜单、第二下
  // 才真的导航。改用 document pointerdown 监听 + 容器 ref，菜单外侧任何位置
  // 的点击都正常落到目标元素（tab/链接/按钮），同时也把菜单收起。
  // 走查新一轮 R1：跟 chat-list-page b45435c2 对齐补 ESC——aria-haspopup="menu"
  // 摆好了但 ESC 完全不起作用。外接键盘 / Bluetooth 键盘用户没法 dismiss；屏幕
  // 阅读器用户被困在菜单里。Android 硬件 Back 已经在上一条 effect 兜了，这里
  // 只补 ESC。
  useEffect(() => {
    if (isDesktopLayout || !isQuickMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const container = quickMenuContainerRef.current;
      if (!container) {
        return;
      }
      if (event.target instanceof Node && container.contains(event.target)) {
        return;
      }
      setIsQuickMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsQuickMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isDesktopLayout, isQuickMenuOpen]);

  useEffect(() => {
    if (normalizedSearchText || !friendSections.length) {
      setActiveMobileIndexKey(null);
      return;
    }

    setActiveMobileIndexKey((current) => {
      if (
        current &&
        mobileIndexItems.some((item) => item.key === current)
      ) {
        return current;
      }

      return mobileIndexItems[0]?.key ?? null;
    });
  }, [mobileIndexItems, friendSections, normalizedSearchText]);

  useEffect(() => {
    if (isDesktopLayout || normalizedSearchText || !friendSections.length) {
      return;
    }

    const scrollContainer = pageRef.current?.parentElement;
    if (!scrollContainer) {
      return;
    }

    const syncActiveMobileIndexKey = () => {
      if (typeof document === "undefined") {
        return;
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const stickyOffset = 104;
      let nextActiveKey = mobileIndexItems[0]?.key ?? null;

      for (const item of mobileIndexItems) {
        const anchorElement = document.getElementById(item.key);
        if (!anchorElement) {
          continue;
        }

        const topOffset =
          anchorElement.getBoundingClientRect().top - containerRect.top;
        if (topOffset <= stickyOffset) {
          nextActiveKey = item.key;
        } else {
          break;
        }
      }

      setActiveMobileIndexKey((current) =>
        current === nextActiveKey ? current : nextActiveKey,
      );
    };

    syncActiveMobileIndexKey();
    scrollContainer.addEventListener("scroll", syncActiveMobileIndexKey, {
      passive: true,
    });

    return () => {
      scrollContainer.removeEventListener("scroll", syncActiveMobileIndexKey);
    };
  }, [mobileIndexItems, friendSections, isDesktopLayout, normalizedSearchText]);

  useEffect(() => {
    if (!isDesktopLayout) {
      setActiveDesktopIndexKey(null);
      return;
    }

    setActiveDesktopIndexKey((current) => {
      if (
        current &&
        desktopIndexItems.some((item) => item.key === current)
      ) {
        return current;
      }

      return desktopIndexItems[0]?.key ?? null;
    });
  }, [desktopIndexItems, isDesktopLayout]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    const scrollContainer = desktopDirectoryScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const syncActiveDesktopIndexKey = () => {
      if (typeof document === "undefined") {
        return;
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const stickyOffset = 8;
      let nextActiveKey = desktopIndexItems[0]?.key ?? null;

      for (const item of desktopIndexItems) {
        const anchorElement = document.getElementById(item.key);
        if (!anchorElement) {
          continue;
        }

        const topOffset =
          anchorElement.getBoundingClientRect().top - containerRect.top;
        if (topOffset <= stickyOffset) {
          nextActiveKey = item.key;
        } else {
          break;
        }
      }

      setActiveDesktopIndexKey((current) =>
        current === nextActiveKey ? current : nextActiveKey,
      );
    };

    syncActiveDesktopIndexKey();
    scrollContainer.addEventListener("scroll", syncActiveDesktopIndexKey, {
      passive: true,
    });

    return () => {
      scrollContainer.removeEventListener("scroll", syncActiveDesktopIndexKey);
    };
  }, [desktopIndexItems, isDesktopLayout]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    // 离开 /tabs/contacts 的瞬间（比如点击 查看详细资料 跳 /character/$id）这条
    // effect 仍会以新的 hash 重新跑一次。此时 routeState 从空 hash 落到默认
    // pane=friend，会把 desktopSelection "自愈" 到默认好友，并 replace 回
    // /tabs/contacts，看起来像点资料按钮跳到了其他好友的详情页。
    if (desktopPathMismatch) {
      return;
    }

    if (
      desktopSelection?.kind === "new-friends" ||
      desktopSelection?.kind === "starred-friends" ||
      desktopSelection?.kind === "tags" ||
      desktopSelection?.kind === "groups" ||
      desktopSelection?.kind === "official-accounts"
    ) {
      return;
    }

    if (
      desktopSelection?.kind === "friend" &&
      filteredFriendItems.some(
        (item) => item.character.id === desktopSelection.id,
      )
    ) {
      return;
    }

    if (
      desktopSelection?.kind === "world-character" &&
      filteredWorldCharacterItems.some(
        (item) => item.character.id === desktopSelection.id,
      )
    ) {
      return;
    }

    if (
      routeState.pane === "world-character" &&
      filteredWorldCharacterItems[0]
    ) {
      const nextSelection = {
        kind: "world-character",
        id: filteredWorldCharacterItems[0].character.id,
      } satisfies DesktopSelection;
      setDesktopSelection(nextSelection);
      commitDesktopRouteState(nextSelection, true, true);
      return;
    }

    if (desktopDefaultFriendItem) {
      const nextSelection = {
        kind: "friend",
        id: desktopDefaultFriendItem.character.id,
      } satisfies DesktopSelection;
      setDesktopSelection(nextSelection);
      commitDesktopRouteState(nextSelection, showWorldCharacters, true);
      return;
    }

    if (filteredWorldCharacterItems[0]) {
      const nextSelection = {
        kind: "world-character",
        id: filteredWorldCharacterItems[0].character.id,
      } satisfies DesktopSelection;
      setDesktopSelection(nextSelection);
      commitDesktopRouteState(nextSelection, true, true);
      return;
    }

    setDesktopSelection(null);
    commitDesktopRouteState(null, showWorldCharacters, true);
  }, [
    commitDesktopRouteState,
    desktopDefaultFriendItem,
    desktopPathMismatch,
    desktopSelection,
    filteredFriendItems,
    filteredWorldCharacterItems,
    isDesktopLayout,
    routeState.pane,
    showWorldCharacters,
  ]);

  function handleShortcutNavigate(to: ShortcutRoute) {
    setNotice(null);
    const mobileHash =
      to === "/friend-requests"
        ? buildMobileFriendRequestsRouteHash({
            returnPath: pathname,
          })
        : to === "/contacts/groups"
          ? buildMobileGroupRouteHash({
              returnPath: pathname,
            })
          : to === "/contacts/world-characters"
            ? buildWorldCharactersRouteHash({
                keyword: "",
                returnPath: pathname,
              })
            : to === "/contacts/official-accounts"
              ? buildMobileOfficialRouteHash({
                  returnPath: pathname,
                })
              : undefined;

    void navigate({
      to,
      ...(mobileHash ? { hash: mobileHash } : {}),
    });
  }

  function handleMobileQuickActionNavigate(to: MobileQuickActionRoute) {
    setIsQuickMenuOpen(false);
    setNotice(null);
    if (to === "/add-friend") {
      void navigate({
        to,
        hash: buildMobileAddFriendRouteHash({
          returnPath: pathname,
        }),
      });
      return;
    }
    void navigate({
      to,
      hash: buildCreateGroupRouteHash({
        returnPath: pathname,
      }),
    });
  }

  function handleOpenWorldCharacters() {
    setNotice(null);

    if (!isDesktopLayout) {
      void navigate({
        to: "/contacts/world-characters",
        hash: buildWorldCharactersRouteHash({
          keyword: "",
          returnPath: pathname,
        }),
      });
      return;
    }

    const willExpand = !showWorldCharacters;
    setShowWorldCharacters(willExpand);

    if (willExpand && worldCharacterDirectoryItems[0]) {
      const nextSelection = {
        kind: "world-character",
        id: worldCharacterDirectoryItems[0].character.id,
      } satisfies DesktopSelection;
      setDesktopSelection(nextSelection);
      commitDesktopRouteState(nextSelection, true);
    } else if (
      !willExpand &&
      desktopSelection?.kind === "world-character" &&
      friendDirectoryItems[0]
    ) {
      const nextSelection = {
        kind: "friend",
        id: friendDirectoryItems[0].character.id,
      } satisfies DesktopSelection;
      setDesktopSelection(nextSelection);
      commitDesktopRouteState(nextSelection, false);
    } else {
      commitDesktopRouteState(desktopSelection, willExpand);
    }

    if (!willExpand || typeof document === "undefined") {
      return;
    }

    window.setTimeout(() => {
      document.getElementById("world-character-directory")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  function handleStartChat(characterId: string) {
    setNotice(null);
    startChatMutation.mutate(characterId);
  }

  function handleOpenProfile(characterId: string) {
    if (!isDesktopLayout) {
      void navigate({
        to: "/character/$characterId",
        params: { characterId },
        hash: buildCharacterDetailRouteHash({
          returnPath: pathname,
        }),
      });
      return;
    }

    const returnPane =
      desktopSelection?.kind === "world-character"
        ? "world-character"
        : desktopSelection?.kind === "starred-friends"
          ? "starred-friends"
          : desktopSelection?.kind === "tags"
            ? "tags"
            : "friend";
    const returnHash = buildDesktopContactsRouteHash({
      pane: returnPane,
      characterId:
        returnPane === "friend" ||
        returnPane === "world-character" ||
        returnPane === "starred-friends"
          ? characterId
          : undefined,
      showWorldCharacters:
        returnPane === "world-character" ? true : showWorldCharacters,
    });

    void navigate({
      to: "/character/$characterId",
      params: { characterId },
      hash: buildCharacterDetailRouteHash({
        returnPath: "/tabs/contacts",
        returnHash,
      }),
    });
  }

  function handleOpenSelectedFriendMoments() {
    if (!selectedFriendItem) {
      return;
    }

    setNotice(null);
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
    void navigate({
      to: "/desktop/friend-moments/$characterId",
      params: { characterId: selectedFriendItem.character.id },
      hash: buildDesktopFriendMomentsRouteHash({
        source: "contacts",
        returnPath: "/tabs/contacts",
        returnHash: normalizedHash || undefined,
      }),
    });
  }

  function handleToggleBlock() {
    if (!selectedFriendItem) {
      return;
    }

    setNotice(null);
    blockMutation.mutate({
      characterId: selectedFriendItem.character.id,
      blocked: selectedFriendBlocked,
    });
  }

  function handleIndexJumpWithBehavior(
    anchorId: string,
    behavior: ScrollBehavior = "smooth",
  ) {
    setActiveMobileIndexKey(anchorId);

    if (typeof document === "undefined") {
      return;
    }

    document.getElementById(anchorId)?.scrollIntoView({
      behavior,
      block: "start",
    });
  }

  function handleDesktopIndexJump(
    anchorId: string,
    behavior: ScrollBehavior = "smooth",
  ) {
    setActiveDesktopIndexKey(anchorId);

    if (typeof document === "undefined") {
      return;
    }

    const target = document.getElementById(anchorId);
    const container = desktopDirectoryScrollRef.current;
    if (!target || !container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offsetTop =
      targetRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({ top: offsetTop, behavior });
  }
  const shortcutItems: ContactShortcutListItem[] = [
    {
      key: "new-friends",
      label: t(msg`新的朋友`),
      subtitle:
        pendingRequestCount > 0
          ? t(msg`${pendingRequestCount} 条待处理申请`)
          : t(msg`查看好友申请`),
      badgeCount: pendingRequestCount,
      active: desktopSelection?.kind === "new-friends",
      icon: UserPlus,
      iconClassName: "bg-[linear-gradient(135deg,#34d399,#16a34a)]",
      onClick: () => {
        if (!isDesktopLayout) {
          handleShortcutNavigate("/friend-requests");
          return;
        }

        setNotice(null);
        commitDesktopRouteState(
          {
            kind: "new-friends",
          },
          showWorldCharacters,
        );
      },
    },
    {
      key: "group-chat",
      label: t(msg`群聊`),
      subtitle:
        groupCount > 0 ? t(msg`${groupCount} 个群聊`) : t(msg`查看全部群聊`),
      active: desktopSelection?.kind === "groups",
      icon: Users,
      iconClassName: "bg-[linear-gradient(135deg,#60a5fa,#2563eb)]",
      onClick: () => {
        if (!isDesktopLayout) {
          handleShortcutNavigate("/contacts/groups");
          return;
        }

        const nextSelection = {
          kind: "groups",
          ...(contactGroupsQuery.data?.[0]?.id
            ? { id: contactGroupsQuery.data[0].id }
            : {}),
        } satisfies DesktopSelection;
        setDesktopSelection(nextSelection);
        commitDesktopRouteState(nextSelection, showWorldCharacters);
      },
    },
    {
      key: "official-accounts",
      label: t(msg`公众号`),
      subtitle: t(msg`查看已上线的内容账号`),
      active: desktopSelection?.kind === "official-accounts",
      icon: BookText,
      iconClassName: "bg-[linear-gradient(135deg,#10b981,#0f766e)]",
      onClick: () => {
        if (!isDesktopLayout) {
          handleShortcutNavigate("/contacts/official-accounts");
          return;
        }

        const nextSelection = {
          kind: "official-accounts",
          mode: "feed",
        } satisfies DesktopSelection;
        setDesktopSelection(nextSelection);
        commitDesktopRouteState(nextSelection, showWorldCharacters);
      },
    },
    {
      key: "world-characters",
      label: t(msg`世界角色`),
      subtitle: isDesktopLayout
        ? showWorldCharacters
          ? t(msg`收起角色目录`)
          : worldCharacterDirectoryItems.length > 0
            ? t(
                msg`还有 ${worldCharacterDirectoryItems.length} 个世界角色可浏览`,
              )
            : t(msg`当前没有可浏览的世界角色`)
        : worldCharacterDirectoryItems.length > 0
          ? t(msg`还有 ${worldCharacterDirectoryItems.length} 个世界角色可浏览`)
          : t(msg`查看世界角色目录`),
      active:
        (isDesktopLayout && showWorldCharacters) ||
        desktopSelection?.kind === "world-character",
      icon: BookUser,
      iconClassName: "bg-[linear-gradient(135deg,#22c55e,#0f766e)]",
      onClick: handleOpenWorldCharacters,
    },
  ];
  const desktopShortcutItems: ContactShortcutListItem[] = [
    shortcutItems[0],
    {
      key: "starred-friends",
      label: t(msg`星标朋友`),
      subtitle:
        starredFriends.length > 0
          ? t(msg`${starredFriends.length} 位常联系好友`)
          : t(msg`快速查看设为星标的联系人`),
      active: desktopSelection?.kind === "starred-friends",
      icon: Star,
      iconClassName: "bg-[linear-gradient(135deg,#f59e0b,#d97706)]",
      onClick: () => {
        // 已经在 starred-friends pane 里再点这个 shortcut 时，不要把 selection 强
        // 行重置回 starredFriends[0]——用户可能已经在中间列表里选中了第 N 位，
        // 这一下又把他甩回第一位。只在首次进入（或从别的 pane 切回）时才用首项
        // 作为默认 id，已在该 pane 时保留 desktopSelection.id 原值。
        const currentId =
          desktopSelection?.kind === "starred-friends"
            ? (desktopSelection.id ?? null)
            : null;
        const nextId = currentId ?? starredFriends[0]?.character.id ?? null;
        const nextSelection = {
          kind: "starred-friends",
          ...(nextId ? { id: nextId } : {}),
        } satisfies DesktopSelection;
        setDesktopSelection(nextSelection);
        commitDesktopRouteState(nextSelection, showWorldCharacters);
      },
    },
    {
      key: "tags",
      label: t(msg`标签`),
      subtitle:
        tagGroupCount > 0
          ? t(msg`${tagGroupCount} 个标签分组`)
          : t(msg`按标签整理联系人`),
      active: desktopSelection?.kind === "tags",
      icon: Tag,
      iconClassName: "bg-[linear-gradient(135deg,#22c55e,#15803d)]",
      onClick: () => {
        const nextSelection = {
          kind: "tags",
        } satisfies DesktopSelection;
        setDesktopSelection(nextSelection);
        commitDesktopRouteState(nextSelection, showWorldCharacters);
      },
    },
    ...shortcutItems.slice(1),
  ];
  const mobileShortcutItems = shortcutItems;
  const mobileErrorItems: MobileErrorItem[] = [];
  if (friendsQuery.isError && friendsQuery.error instanceof Error) {
    mobileErrorItems.push({
      key: "friends",
      message: t(msg`联系人列表暂时没有刷新成功。`),
      onRetry: () => {
        void friendsQuery.refetch();
      },
      retryLabel: t(msg`重试读取`),
    });
  }
  if (charactersQuery.isError && charactersQuery.error instanceof Error) {
    mobileErrorItems.push({
      key: "characters",
      message: t(msg`世界角色目录暂时没有刷新成功。`),
      onRetry: () => {
        void charactersQuery.refetch();
      },
      retryLabel: t(msg`重试读取`),
      actionLabel: t(msg`浏览角色`),
      onAction: () => {
        handleShortcutNavigate("/contacts/world-characters");
      },
    });
  }
  if (
    friendRequestsQuery.isError &&
    friendRequestsQuery.error instanceof Error
  ) {
    mobileErrorItems.push({
      key: "friend-requests",
      message: t(msg`好友申请入口暂时没有刷新成功。`),
      onRetry: () => {
        void friendRequestsQuery.refetch();
      },
      retryLabel: t(msg`重试读取`),
      actionLabel: t(msg`查看新的朋友`),
      onAction: () => {
        handleShortcutNavigate("/friend-requests");
      },
    });
  }
  if (contactGroupsQuery.isError && contactGroupsQuery.error instanceof Error) {
    mobileErrorItems.push({
      key: "contact-groups",
      message: t(msg`群聊入口暂时没有刷新成功。`),
      onRetry: () => {
        void contactGroupsQuery.refetch();
      },
      retryLabel: t(msg`重试读取`),
      actionLabel: t(msg`查看群聊`),
      onAction: () => {
        handleShortcutNavigate("/contacts/groups");
      },
    });
  }
  if (startChatMutation.isError && startChatMutation.error instanceof Error) {
    mobileErrorItems.push({
      key: "start-chat",
      message: startChatMutation.error.message,
      actionLabel: startChatMutation.variables
        ? t(msg`重试打开聊天`)
        : undefined,
      onAction: startChatMutation.variables
        ? () => {
            handleStartChat(startChatMutation.variables);
          }
        : undefined,
    });
  }
  if (setStarredMutation.isError && setStarredMutation.error instanceof Error) {
    mobileErrorItems.push({
      key: "set-starred",
      message: setStarredMutation.error.message,
      actionLabel: setStarredMutation.variables
        ? setStarredMutation.variables.starred
          ? t(msg`重试设为星标`)
          : t(msg`重试取消星标`)
        : undefined,
      onAction: setStarredMutation.variables
        ? () => {
            setNotice(null);
            setStarredMutation.mutate(setStarredMutation.variables);
          }
        : undefined,
    });
  }
  const desktopErrors = [
    friendsQuery.error,
    charactersQuery.error,
    friendRequestsQuery.error,
    contactGroupsQuery.error,
    blockedCharactersQuery.error,
    conversationsQuery.error,
    startChatMutation.error,
    acceptFriendRequestMutation.error,
    declineFriendRequestMutation.error,
    setStarredMutation.error,
    blockMutation.error,
    pinMutation.error,
    muteMutation.error,
    deleteFriendMutation.error,
  ].flatMap((error) =>
    error instanceof Error && error.message.trim() ? [error.message] : [],
  );

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面通讯录`)}
            description={t(
              msg`正在载入桌面通讯录工作区，马上显示联系人和详情。`,
            )}
            loadingLabel={t(msg`载入桌面通讯录...`)}
          />
        }
      >
        <DesktopContactsWorkspace
          directoryCountLabel={`${t(msg`${filteredFriendItems.length} 位联系人`)}${
            showWorldCharacters || normalizedSearchText
              ? ` · ${t(msg`${filteredWorldCharacterItems.length} 个世界角色`)}`
              : ""
          }`}
          searchSource="contacts"
          searchText={searchText}
          onSearchTextChange={setSearchText}
          shortcutList={
            <ContactShortcutList
              items={desktopShortcutItems}
              compact
              variant="desktop-flat"
            />
          }
          indexList={
            desktopIndexItems.length ? (
              <ContactIndexList
                items={desktopIndexItems}
                activeKey={activeDesktopIndexKey}
                compact
                className="absolute right-1 top-1/2 z-10 -translate-y-1/2"
                onSelect={handleDesktopIndexJump}
              />
            ) : null
          }
          directoryScrollRef={desktopDirectoryScrollRef}
          notice={notice}
          errors={desktopErrors}
          loading={friendsQuery.isLoading}
          friendSections={desktopFriendSections}
          activeFriendId={
            desktopSelection?.kind === "friend" ? desktopSelection.id : null
          }
          pendingCharacterId={pendingCharacterId}
          bulkMode={bulkMode}
          bulkSelectedIds={bulkSelectedIds}
          onOpenManagement={() => setManagementOpen(true)}
          bulkActionBar={
            bulkMode ? (
              <ContactsBulkActionBar
                desktop
                selectedIds={Array.from(bulkSelectedIds)}
                totalIds={desktopBulkAllIds}
                onSelectAll={() =>
                  setBulkSelectedIds(new Set(desktopBulkAllIds))
                }
                onClearSelection={() => setBulkSelectedIds(new Set())}
                onDone={exitBulkMode}
                onPartialFailure={retainBulkFailures}
                setNotice={setNotice}
                setNoticeError={setNoticeError}
              />
            ) : null
          }
          onSelectFriend={(characterId) => {
            if (bulkMode) {
              toggleBulkSelection(characterId);
              return;
            }
            const nextSelection = {
              kind: "friend",
              id: characterId,
            } satisfies DesktopSelection;
            setDesktopSelection(nextSelection);
            commitDesktopRouteState(nextSelection, showWorldCharacters);
          }}
          onOpenFriendChat={(characterId) => {
            if (bulkMode) {
              toggleBulkSelection(characterId);
              return;
            }
            handleStartChat(characterId);
          }}
          emptyState={
            !friendsQuery.isError ? (
              <div className="px-3">
                <EmptyState
                  title={
                    normalizedSearchText
                      ? t(msg`没有找到匹配的联系人`)
                      : t(msg`通讯录还是空的`)
                  }
                  description={
                    normalizedSearchText
                      ? // 之前文案说"换个关键词试试，或者展开世界角色目录继续找人"，
                        // 但搜索激活时世界角色目录会一起被关键词过滤，命中 0 条
                        // 就整段隐藏 + 唯一 action 按钮也只是「清空搜索」。
                        // 用户读到「展开世界角色目录」却找不到按钮 → 文案和动作不一致。
                        t(msg`换个关键词试试，或者清空搜索回到完整通讯录。`)
                      : t(msg`先从新的朋友里建立关系，或者去看看世界角色。`)
                  }
                  action={
                    normalizedSearchText ? (
                      <Button
                        variant="secondary"
                        onClick={() => setSearchText("")}
                      >
                        {t(msg`清空搜索`)}
                      </Button>
                    ) : showWorldCharacters ? (
                      // 世界角色目录已经在下面展开（且为空态时通讯录里没好友），
                      // 这里再点「浏览世界角色」会调 handleOpenWorldCharacters，因为
                      // 它是 toggle —— 第二次按反而把下面已展开的角色列表收起来，
                      // 用户看着像「按下按钮内容消失了」。已经展开就别再给按钮。
                      null
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={handleOpenWorldCharacters}
                      >
                        {t(msg`浏览世界角色`)}
                      </Button>
                    )
                  }
                />
              </div>
            ) : null
          }
          worldCharacterTitle={
            normalizedSearchText
              ? t(msg`世界角色搜索结果`)
              : t(msg`世界角色目录`)
          }
          worldCharacterSections={desktopWorldCharacterSections}
          activeWorldCharacterId={
            desktopSelection?.kind === "world-character"
              ? desktopSelection.id
              : null
          }
          onSelectWorldCharacter={(characterId) => {
            const nextSelection = {
              kind: "world-character",
              id: characterId,
            } satisfies DesktopSelection;
            setShowWorldCharacters(true);
            setDesktopSelection(nextSelection);
            commitDesktopRouteState(nextSelection, true);
          }}
          detailContent={
            desktopSelection?.kind === "new-friends" ? (
              // 内层 Suspense：lazy pane chunk 第一次加载时只让右栏 detail
              // 区显示 loader，避免外层 RouteRedirectState 把已经渲染好的 sidebar
              // 也一起替换掉，用户瞬间失去通讯录上下文。fallback 用 LoadingBlock
              // 居中，跟 pane 自带的 loading 状态视觉一致。
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center bg-[rgba(245,247,247,0.96)]">
                    <LoadingBlock label={t(msg`正在打开新的朋友...`)} />
                  </div>
                }
              >
                <DesktopContactsFriendRequestsPane
                  requests={friendRequestsQuery.data ?? []}
                  loading={friendRequestsQuery.isLoading}
                  error={
                    friendRequestsQuery.error instanceof Error
                      ? friendRequestsQuery.error.message
                      : null
                  }
                  actionError={
                    acceptFriendRequestMutation.error instanceof Error
                      ? acceptFriendRequestMutation.error.message
                      : declineFriendRequestMutation.error instanceof Error
                        ? declineFriendRequestMutation.error.message
                        : null
                  }
                  actionSuccess={friendRequestSuccess?.message ?? null}
                  acceptPendingId={
                    acceptFriendRequestMutation.isPending
                      ? (acceptFriendRequestMutation.variables ?? null)
                      : null
                  }
                  declinePendingId={
                    declineFriendRequestMutation.isPending
                      ? (declineFriendRequestMutation.variables ?? null)
                      : null
                  }
                  onAccept={(requestId) =>
                    acceptFriendRequestMutation.mutate(requestId)
                  }
                  onDecline={(requestId) =>
                    declineFriendRequestMutation.mutate(requestId)
                  }
                  onRetry={() => {
                    void friendRequestsQuery.refetch();
                  }}
                />
              </Suspense>
            ) : desktopSelection?.kind === "starred-friends" ? (
              // 内层 Suspense：pane chunk 首次加载时只让右栏 detail 区显示 loader，
              // 否则外层 RouteRedirectState 会把整个 workspace（包括 sidebar 的
              // shortcut list + 联系人目录）都替换成"正在打开桌面通讯录"的占位，
              // 用户瞬间失去通讯录上下文。跟 new-friends pane 对齐。
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center bg-[rgba(245,247,247,0.96)]">
                    <LoadingBlock label={t(msg`正在打开星标朋友...`)} />
                  </div>
                }
              >
              <DesktopContactsStarredFriendsPane
                friends={starredFriends}
                selectedCharacterId={desktopSelection.id ?? null}
                loading={friendsQuery.isLoading}
                error={
                  friendsQuery.error instanceof Error
                    ? friendsQuery.error.message
                    : null
                }
                actionError={(() => {
                  // startChatMutation / setStarredMutation / pinMutation /
                  // muteMutation / blockMutation / deleteFriendMutation 在
                  // friend / world / tags / starred 四个 pane 之间共用同一份
                  // mutation 实例。原先只翻 startChat / setStarred 两条错；
                  // Round 1 把 pin/mute/block/delete 也纳入显示——但只按
                  // 「目标当前仍是 starred 好友」过滤，不够：用户给 Alice 点
                  // 「置顶聊天」失败 → 错误条挂在中间侧栏 → 切到 Bob（也是
                  // starred 好友），错误条没消，看起来像 Bob 的「置顶」出错。
                  // 进一步绑到「当前选中的那位」：mutation.variables.characterId
                  // 必须就是 selectedCharacterId，错误才在这个 pane 显示。
                  // 切走那位 → 错误隐藏；切回去 → 又出现。最左侧 workspace
                  // errors 区仍然保留全量错误兜底，不会丢。
                  const targetId = desktopSelection.id;
                  if (!targetId) {
                    return null;
                  }
                  const isCurrent = (characterId: string | undefined) =>
                    !!characterId && characterId === targetId;
                  if (
                    startChatMutation.error instanceof Error &&
                    isCurrent(startChatMutation.variables)
                  ) {
                    return startChatMutation.error.message;
                  }
                  if (
                    setStarredMutation.error instanceof Error &&
                    isCurrent(setStarredMutation.variables?.characterId)
                  ) {
                    return setStarredMutation.error.message;
                  }
                  if (
                    pinMutation.error instanceof Error &&
                    isCurrent(pinMutation.variables?.characterId)
                  ) {
                    return pinMutation.error.message;
                  }
                  if (
                    muteMutation.error instanceof Error &&
                    isCurrent(muteMutation.variables?.characterId)
                  ) {
                    return muteMutation.error.message;
                  }
                  if (
                    blockMutation.error instanceof Error &&
                    isCurrent(blockMutation.variables?.characterId)
                  ) {
                    return blockMutation.error.message;
                  }
                  if (
                    deleteFriendMutation.error instanceof Error &&
                    isCurrent(deleteFriendMutation.variables)
                  ) {
                    return deleteFriendMutation.error.message;
                  }
                  return null;
                })()}
                startChatPendingId={pendingCharacterId}
                starPendingId={
                  setStarredMutation.isPending
                    ? (setStarredMutation.variables?.characterId ?? null)
                    : null
                }
                commonGroupsByCharacterId={starredCommonGroupsByCharacterId}
                isPinnedByCharacterId={starredIsPinnedByCharacterId}
                isMutedByCharacterId={starredIsMutedByCharacterId}
                blockedCharacterIds={blockedCharacterIdSet}
                pinPendingCharacterId={
                  pinMutation.isPending
                    ? (pinMutation.variables?.characterId ?? null)
                    : null
                }
                mutePendingCharacterId={
                  muteMutation.isPending
                    ? (muteMutation.variables?.characterId ?? null)
                    : null
                }
                blockPendingCharacterId={
                  blockMutation.isPending
                    ? (blockMutation.variables?.characterId ?? null)
                    : null
                }
                deletePendingCharacterId={
                  deleteFriendMutation.isPending
                    ? (deleteFriendMutation.variables ?? null)
                    : null
                }
                onSelectCharacter={(characterId) => {
                  const nextSelection = {
                    kind: "starred-friends",
                    ...(characterId ? { id: characterId } : {}),
                  } satisfies DesktopSelection;
                  setDesktopSelection(nextSelection);
                  commitDesktopRouteState(
                    nextSelection,
                    showWorldCharacters,
                    true,
                  );
                }}
                onStartChat={handleStartChat}
                onToggleStarred={(characterId, starred) => {
                  setStarredMutation.mutate({
                    characterId,
                    starred,
                  });
                }}
                onOpenGroup={(groupId) => {
                  void navigate({
                    to: buildDesktopChatThreadPath({
                      conversationId: groupId,
                    }),
                  });
                }}
                onTogglePinned={(characterId, pinned) => {
                  pinMutation.mutate({ characterId, pinned });
                }}
                onToggleMuted={(characterId, muted) => {
                  muteMutation.mutate({ characterId, muted });
                }}
                onToggleBlock={(characterId, blocked) => {
                  setNotice(null);
                  blockMutation.mutate({ characterId, blocked });
                }}
                onDeleteFriend={(characterId) => {
                  deleteFriendMutation.mutate(characterId);
                }}
                onOpenProfile={handleOpenProfile}
                onOpenMoments={(characterId) => {
                  void navigate({
                    to: "/desktop/friend-moments/$characterId",
                    params: { characterId },
                    hash: buildDesktopFriendMomentsRouteHash({
                      source: "starred-friends",
                      returnPath: "/tabs/contacts",
                      returnHash: buildDesktopContactsRouteHash({
                        pane: "starred-friends",
                        characterId,
                        showWorldCharacters,
                      }),
                    }),
                  });
                }}
                onRetry={() => {
                  void friendsQuery.refetch();
                }}
              />
              </Suspense>
            ) : desktopSelection?.kind === "tags" ? (
              <DesktopContactsTagsPane />
            ) : desktopSelection?.kind === "groups" ? (
              <DesktopContactsGroupsPane
                groups={contactGroupsQuery.data ?? []}
                selectedGroupId={desktopSelection.id ?? null}
                loading={contactGroupsQuery.isLoading}
                error={
                  contactGroupsQuery.error instanceof Error
                    ? contactGroupsQuery.error.message
                    : null
                }
                onSelectGroup={(groupId) => {
                  const nextSelection = {
                    kind: "groups",
                    ...(groupId ? { id: groupId } : {}),
                  } satisfies DesktopSelection;
                  setDesktopSelection(nextSelection);
                  commitDesktopRouteState(
                    nextSelection,
                    showWorldCharacters,
                    true,
                  );
                }}
                onCreateGroup={() => {
                  void navigate({
                    to: "/group/new",
                    hash: buildCreateGroupRouteHash({
                      source: "group-contacts",
                      returnPath: pathname,
                      returnHash: buildDesktopContactsRouteHash({
                        pane: "groups",
                        showWorldCharacters,
                      }),
                    }),
                  });
                }}
                onOpenGroup={(groupId) => {
                  void navigate({
                    to: buildDesktopChatThreadPath({
                      conversationId: groupId,
                    }),
                  });
                }}
                onOpenGroupDetails={(groupId) => {
                  void navigate({
                    to: "/tabs/chat",
                    hash: buildDesktopChatRouteHash({
                      conversationId: groupId,
                      panel: "details",
                    }),
                  });
                }}
              />
            ) : desktopSelection?.kind === "official-accounts" ? (
              <DesktopOfficialAccountsWorkspace
                selectedMode={desktopSelection.mode}
                selectedAccountId={desktopSelection.accountId}
                selectedArticleId={desktopSelection.articleId}
                onHighlightFeedArticle={(articleId) => {
                  const nextSelection = {
                    kind: "official-accounts",
                    mode: "feed",
                    ...(articleId ? { articleId } : {}),
                  } satisfies DesktopSelection;
                  setDesktopSelection(nextSelection);
                  commitDesktopRouteState(
                    nextSelection,
                    showWorldCharacters,
                    true,
                  );
                }}
                onModeChange={(mode) => {
                  const nextSelection = {
                    kind: "official-accounts",
                    mode,
                    ...(desktopSelection.accountId
                      ? { accountId: desktopSelection.accountId }
                      : {}),
                    ...(desktopSelection.articleId
                      ? { articleId: desktopSelection.articleId }
                      : {}),
                  } satisfies DesktopSelection;
                  setDesktopSelection(nextSelection);
                  commitDesktopRouteState(
                    nextSelection,
                    showWorldCharacters,
                    true,
                  );
                }}
                onOpenAccount={(accountId) => {
                  const nextSelection = {
                    kind: "official-accounts",
                    mode: "accounts",
                    accountId,
                  } satisfies DesktopSelection;
                  setDesktopSelection(nextSelection);
                  commitDesktopRouteState(
                    nextSelection,
                    showWorldCharacters,
                    true,
                  );
                }}
                onOpenArticle={(articleId, accountId) => {
                  const nextSelection = {
                    kind: "official-accounts",
                    mode: "accounts",
                    accountId,
                    articleId,
                  } satisfies DesktopSelection;
                  setDesktopSelection(nextSelection);
                  commitDesktopRouteState(
                    nextSelection,
                    showWorldCharacters,
                    true,
                  );
                }}
              />
            ) : (
              <ContactDetailPane
                character={
                  selectedFriendItem?.character ??
                  selectedWorldCharacterItem?.character ??
                  null
                }
                friendship={selectedFriendItem?.friendship ?? null}
                commonGroups={commonGroups}
                onOpenGroup={(groupId) => {
                  void navigate({
                    to: buildDesktopChatThreadPath({
                      conversationId: groupId,
                    }),
                  });
                }}
                onOpenMoments={
                  selectedFriendItem
                    ? handleOpenSelectedFriendMoments
                    : undefined
                }
                onStartChat={
                  selectedFriendItem
                    ? () => handleStartChat(selectedFriendItem.character.id)
                    : undefined
                }
                chatPending={
                  selectedFriendItem?.character.id === pendingCharacterId
                }
                isPinned={selectedConversation?.isPinned ?? false}
                pinPending={
                  pinMutation.isPending &&
                  pinMutation.variables?.characterId === selectedCharacterId
                }
                onTogglePinned={
                  selectedFriendItem
                    ? () =>
                        pinMutation.mutate({
                          characterId: selectedFriendItem.character.id,
                          pinned: !(selectedConversation?.isPinned ?? false),
                        })
                    : undefined
                }
                isMuted={selectedConversation?.isMuted ?? false}
                mutePending={
                  muteMutation.isPending &&
                  muteMutation.variables?.characterId === selectedCharacterId
                }
                onToggleMuted={
                  selectedFriendItem
                    ? () =>
                        muteMutation.mutate({
                          characterId: selectedFriendItem.character.id,
                          muted: !(selectedConversation?.isMuted ?? false),
                        })
                    : undefined
                }
                isStarred={selectedFriendItem?.friendship.isStarred ?? false}
                starPending={
                  setStarredMutation.isPending &&
                  setStarredMutation.variables?.characterId ===
                    selectedCharacterId
                }
                onToggleStarred={
                  selectedFriendItem
                    ? () =>
                        setStarredMutation.mutate({
                          characterId: selectedFriendItem.character.id,
                          starred: !selectedFriendItem.friendship.isStarred,
                        })
                    : undefined
                }
                isBlocked={selectedFriendBlocked}
                blockPending={
                  blockMutation.isPending &&
                  blockMutation.variables?.characterId === selectedCharacterId
                }
                onToggleBlock={
                  selectedFriendItem ? handleToggleBlock : undefined
                }
                deletePending={
                  deleteFriendMutation.isPending &&
                  deleteFriendMutation.variables === selectedCharacterId
                }
                onDeleteFriend={
                  selectedFriendItem
                    ? () =>
                        deleteFriendMutation.mutate(
                          selectedFriendItem.character.id,
                        )
                    : undefined
                }
                onOpenProfile={() => {
                  const characterId =
                    selectedFriendItem?.character.id ??
                    selectedWorldCharacterItem?.character.id;
                  if (!characterId) {
                    return;
                  }

                  handleOpenProfile(characterId);
                }}
              />
            )
          }
        />
        <ContactsManagementModal
          open={managementOpen}
          onClose={() => setManagementOpen(false)}
          onEnterBulkMode={() => {
            setManagementOpen(false);
            setBulkSelectedIds(new Set());
            setBulkMode(true);
          }}
          onOpenTags={() => {
            setManagementOpen(false);
            void navigate({ to: "/contacts/tags" });
          }}
        />
      </Suspense>
    );
  }

  return (
    <div ref={pageRef}>
      <AppPage className="relative min-h-full space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
        <TabPageTopBar
          title={t(msg`通讯录`)}
          titleAlign="center"
          className="z-40 mx-0 mt-0 mb-0 overflow-visible border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
          rightActions={
            bulkMode ? (
              <Button
                type="button"
                variant="ghost"
                onClick={exitBulkMode}
                className="h-9 rounded-full bg-transparent px-3 text-[13px] text-[color:var(--text-primary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
                aria-label={t(msg`取消`)}
              >
                {t(msg`取消`)}
              </Button>
            ) : (
            <div
              ref={quickMenuContainerRef}
              className="relative flex items-center gap-1"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsQuickMenuOpen(false);
                  setManagementOpen(true);
                }}
                className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4 active:bg-black/[0.05]"
                aria-label={t(msg`通讯录管理`)}
              >
                <Settings size={15} />
              </Button>
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
                <Plus size={15} strokeWidth={2.4} />
              </Button>

              {isQuickMenuOpen && !bulkMode ? (
                // bg 必须完全不透明：rgba(44,44,44,0.96) 时 “新的朋友” 的红色 6 badge
                // 会从下层穿透到 “添加朋友” 行的右侧，看着像 + 菜单自己有红点。
                // 走查新一轮 R1：role="menu" + role="menuitem" 对齐 trigger 的
                // aria-haspopup="menu"。原本 trigger 声明了 menu popup 但弹层
                // 没 menu 语义，屏幕阅读器把整块当通用 region，听不到「4 个菜单项
                // 里第 1 项」之类导航。跟 chat-list-page b45435c2 修复对齐。
                <div
                  role="menu"
                  aria-label={t(msg`快捷操作`)}
                  className="absolute right-0 top-[calc(100%+0.3rem)] z-40 w-[10rem] overflow-hidden rounded-[11px] bg-[#2c2c2c] p-1 shadow-[0_12px_32px_rgba(15,23,42,0.2)]"
                >
                  {mobileQuickActionItems.map((item) => {
                    const Icon = item.icon;

                    if (item.to && !item.disabled) {
                      const to = item.to;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="menuitem"
                          onClick={() => handleMobileQuickActionNavigate(to)}
                          className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[12px] text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/10 active:bg-white/12"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-white/10 text-white">
                            <Icon size={14} />
                          </div>
                          <span>{t(item.label)}</span>
                        </button>
                      );
                    }

                    // 走查 R1：disabled menuitem（扫一扫 / 收付款）只设 disabled
                      // 在 iOS Safari + 部分 Android 壳里依旧能被 Tab 聚焦，键盘 / 屏
                      // 阅用户 Tab 到这里按 Enter 完全没反应，无法理解 "为什么聚到
                      // 这里又不能用"。tabIndex=-1 让 Tab 序列跳过这两项，仅靠视觉
                      // 「暂未开放」+ aria-disabled 提示功能未上线；以后开放时去掉
                      // disabled 即可恢复 Tab 顺序。aria-label 把主标题 + 「暂未开
                      // 放」合并播报，避免屏阅器只读到主标题就误以为可点。
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
            )
          }
        >
          {bulkMode ? null : (
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/tabs/search",
                    hash: buildSearchRouteHash({
                      category: "all",
                      keyword: "",
                      source: "contacts",
                    }),
                  });
                }}
                className="flex h-9 w-full items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 text-[12px] text-[color:var(--text-dim)]"
                aria-label={t(msg`打开搜一搜`)}
              >
                <Search size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 text-left">{t(msg`搜索`)}</span>
              </button>
            </div>
          )}
        </TabPageTopBar>

        <div className="pb-8">
          {notice || mobileErrorItems.length ? (
            <div className="space-y-1.5 px-3 pt-2">
              {notice ? (
                <InlineNotice
                  tone={notice.tone}
                  className={cn(
                    "rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none",
                    notice.tone === "danger"
                      ? "border-[rgba(220,38,38,0.18)]"
                      : "border-[rgba(96,165,250,0.16)]",
                  )}
                >
                  {notice.message}
                </InlineNotice>
              ) : null}
              {mobileErrorItems.map((item) => (
                <InlineNotice
                  key={item.key}
                  tone="danger"
                  className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1">{item.message}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.actionLabel && item.onAction ? (
                        <button
                          type="button"
                          onClick={item.onAction}
                          className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                        >
                          {item.actionLabel}
                        </button>
                      ) : null}
                      {item.onRetry ? (
                        <button
                          type="button"
                          onClick={item.onRetry}
                          className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                        >
                          {item.retryLabel ?? t(msg`重试`)}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </InlineNotice>
              ))}
            </div>
          ) : null}

          {bulkMode ? null : (
            <ContactShortcutList
              items={mobileShortcutItems}
              mobileDense
              className="mt-0.5 border-x-0 shadow-none"
            />
          )}

          <section className="mt-1.5 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {friendsQuery.isLoading ? (
              <MobileContactsStatusCard
                badge={t(msg`读取中`)}
                title={t(msg`正在刷新通讯录`)}
                description={t(msg`稍等一下，正在同步联系人、群聊和服务入口。`)}
                tone="loading"
              />
            ) : null}

            {!friendsQuery.isLoading &&
            !friendsQuery.isError &&
            !friendSections.length ? (
              <div className="px-3 py-3">
                <MobileContactsStatusCard
                  badge={normalizedSearchText ? t(msg`搜索`) : t(msg`通讯录`)}
                  title={
                    normalizedSearchText
                      ? t(msg`没有找到匹配的联系人`)
                      : t(msg`通讯录还是空的`)
                  }
                  description={
                    normalizedSearchText
                      ? t(msg`换个关键词试试，或者继续搜索世界角色。`)
                      : t(msg`先处理新的朋友，或者去浏览世界角色。`)
                  }
                  action={
                    normalizedSearchText ? (
                      <Button
                        variant="secondary"
                        onClick={() => setSearchText("")}
                        className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                      >
                        {t(msg`清空搜索`)}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={handleOpenWorldCharacters}
                        className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                      >
                        {t(msg`查看世界角色`)}
                      </Button>
                    )
                  }
                />
              </div>
            ) : null}

            {friendSections.map((section) => {
              // 新一轮走查：bulk 模式下把"我自己"过滤掉。原写法 friendSections 含
              // SELF，bulk 模式渲染 FriendListRow 时会显示空 checkbox 圆圈，但
              // toggleBulkSelection 的 SELF 守卫又会拒绝写入 → 用户点 SELF 行 checkbox
              // 没反应，看着像 App 卡了。totalIds / onSelectAll 已经把 SELF 排除，
              // 把渲染侧也对齐。section 全空时仍保留 header 占位，避免右侧 A-Z
              // 索引点 W 后 scrollIntoView 找不到锚点。
              const items =
                bulkMode
                  ? section.items.filter(
                      (item) => item.character.id !== SELF_CHARACTER_ID,
                    )
                  : section.items;
              return (
                // scroll-margin-top 跟 syncActiveMobileIndexKey 的 stickyOffset 保
                // 持 104px 一致：右侧 A-Z 索引点 "M" 后 scrollIntoView 把这块锚点
                // 对齐到 MobileViewportPane 滚动容器的 top，而 TabPageTopBar 是
                // sticky top-0 占着同一个位置，section header（字母 "M"）直接被
                // 盖住；加 104px scroll-margin 让锚点落在 top bar 下沿。
                <div
                  key={section.key}
                  id={section.anchorId}
                  style={{ scrollMarginTop: 104 }}
                >
                  <SectionHeader title={section.title} />
                  {items.map((item, index) => (
                    <FriendListRow
                      key={item.character.id}
                      item={item}
                      index={index}
                      bulkMode={bulkMode}
                      selected={bulkSelectedIds.has(item.character.id)}
                      onClick={() => {
                        if (bulkMode) {
                          toggleBulkSelection(item.character.id);
                          return;
                        }
                        handleOpenProfile(item.character.id);
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </section>
        </div>

        {!normalizedSearchText && friendSections.length && !bulkMode ? (
          <ContactIndexList
            items={mobileIndexItems}
            activeKey={activeMobileIndexKey}
            compact
            className="fixed right-0.5 top-[55%] z-30 -translate-y-1/2"
            onSelect={handleIndexJumpWithBehavior}
          />
        ) : null}

        {bulkMode ? (
          <ContactsBulkActionBar
            selectedIds={Array.from(bulkSelectedIds)}
            totalIds={mobileBulkAllIds}
            onSelectAll={() => setBulkSelectedIds(new Set(mobileBulkAllIds))}
            onClearSelection={() => setBulkSelectedIds(new Set())}
            onDone={exitBulkMode}
            onPartialFailure={retainBulkFailures}
            setNotice={setNotice}
            setNoticeError={setNoticeError}
          />
        ) : null}

        <ContactsManagementModal
          open={managementOpen}
          onClose={() => setManagementOpen(false)}
          onEnterBulkMode={() => {
            setManagementOpen(false);
            setBulkSelectedIds(new Set());
            setBulkMode(true);
          }}
          onOpenTags={() => {
            setManagementOpen(false);
            void navigate({ to: "/contacts/tags" });
          }}
        />
      </AppPage>
    </div>
  );
}

function FriendListRow({
  item,
  index,
  pendingCharacterId,
  desktop = false,
  active = false,
  bulkMode = false,
  selected = false,
  onClick,
  onDoubleClick,
}: {
  item: FriendDirectoryItem;
  index: number;
  pendingCharacterId?: string | null;
  desktop?: boolean;
  active?: boolean;
  bulkMode?: boolean;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const t = useRuntimeTranslator();

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "yj-list-item-virtual flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] text-left transition-colors",
        desktop
          ? "px-4 py-3.5 hover:bg-[color:var(--surface-console)]"
          : "py-2.5 pl-4 pr-7 hover:bg-[color:var(--surface-card-hover)]",
        index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
        active
          ? "border border-[rgba(7,193,96,0.16)] bg-[rgba(240,247,243,0.94)] shadow-[inset_0_0_0_1px_rgba(7,193,96,0.06)]"
          : undefined,
      )}
    >
      {bulkMode ? (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            selected
              ? "border-[#07c160] bg-[#07c160] text-white"
              : "border-[color:var(--border-subtle)] bg-white",
          )}
        >
          {selected ? (
            <svg
              viewBox="0 0 16 16"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 8.5 6.5 12 13 5" />
            </svg>
          ) : null}
        </span>
      ) : null}
      <AvatarChip
        name={item.character.name}
        src={item.character.avatar}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[color:var(--text-primary)]",
            desktop ? "text-[16px]" : "text-[14px]",
          )}
        >
          {item.displayName}
        </div>
        {desktop ? (
          <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
            {pendingCharacterId === item.character.id
              ? t(msg`正在打开会话...`)
              : item.displayName !== item.character.name
                ? t(msg`昵称：${item.character.name}`)
                : item.character.currentStatus?.trim() ||
                  item.character.relationship ||
                  t(msg`保持联系`)}
          </div>
        ) : null}
      </div>
      <SparkBadge streak={item.friendship.sparkStreak} size="sm" />
      {item.friendship.isStarred ? (
        <Star
          size={15}
          className="shrink-0 text-[#f3a311]"
          fill="currentColor"
        />
      ) : null}
    </button>
  );
}

function SectionHeader({
  title,
  desktop = false,
}: {
  title: string;
  desktop?: boolean;
}) {
  return (
    <div
      className={cn(
        "z-10 px-4 py-1.25 font-medium tracking-[0.08em] text-[color:var(--text-muted)]",
        desktop
          ? "sticky top-0 border-b border-[color:var(--border-faint)] bg-white/78 backdrop-blur-xl"
          : "text-[11px] bg-[rgba(247,247,247,0.94)]",
      )}
    >
      {title}
    </div>
  );
}

function MobileContactsStatusCard({
  badge,
  title,
  description,
  tone = "default",
  action,
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "loading";
  action?: ReactNode;
}) {
  const loading = tone === "loading";

  return (
    <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-5 text-center shadow-none">
      <div className="mx-auto inline-flex rounded-full bg-[rgba(7,193,96,0.1)] px-2.5 py-1 text-[9px] font-medium tracking-[0.04em] text-[#07c160]">
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
