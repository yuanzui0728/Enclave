import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookText,
  BookUser,
  LoaderCircle,
  Mic,
  Plus,
  QrCode,
  Search,
  Square,
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
  getOrCreateConversation,
  getSavedGroups,
  listCharacters,
  setConversationMuted,
  setConversationPinned,
  setFriendStarred,
  unblockCharacter,
} from "@yinjie/contracts";
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
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { ContactDetailPane } from "../features/contacts/contact-detail-pane";
import { ContactIndexList } from "../features/contacts/contact-index-list";
import {
  ContactShortcutList,
  type ContactShortcutListItem,
} from "../features/contacts/contact-shortcut-list";
import { DesktopContactsWorkspace } from "../features/desktop/contacts/desktop-contacts-workspace";
import { DesktopContactsFriendRequestsPane } from "../features/desktop/contacts/desktop-contacts-friend-requests-pane";
import { DesktopContactsGroupsPane } from "../features/desktop/contacts/desktop-contacts-groups-pane";
import { DesktopContactsTagsPane } from "../features/desktop/contacts/desktop-contacts-tags-pane";
import { DesktopOfficialAccountsWorkspace } from "../features/desktop/official-accounts/desktop-official-accounts-workspace";
import {
  buildDesktopContactsRouteHash,
  parseDesktopContactsRouteState,
} from "../features/desktop/contacts/desktop-contacts-route-state";
import {
  buildContactSections,
  buildDesktopFriendSections,
  createFriendDirectoryItems,
  createWorldCharacterDirectoryItems,
  matchesCharacterSearch,
  matchesFriendSearch,
  type FriendDirectoryItem,
  type WorldCharacterDirectoryItem,
} from "../features/contacts/contact-utils";
import {
  DesktopSearchDropdownPanel,
  useDesktopSearchLauncher,
} from "../features/search/desktop-search-launcher";
import { buildDesktopFriendMomentsRouteHash } from "../features/desktop/moments/desktop-friend-moments-route-state";
import { buildSearchRouteHash } from "../features/search/search-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type ShortcutRoute =
  | "/contacts/groups"
  | "/contacts/tags"
  | "/friend-requests"
  | "/contacts/starred"
  | "/contacts/world-characters"
  | "/contacts/official-accounts";

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
      kind: "groups";
      id?: string;
    }
  | {
      kind: "tags";
    }
  | {
      kind: "official-accounts";
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

  if (routeState.pane === "groups") {
    return {
      kind: "groups",
      ...(routeState.characterId ? { id: routeState.characterId } : {}),
    };
  }

  if (routeState.pane === "tags") {
    return {
      kind: "tags",
    };
  }

  if (routeState.pane === "official-accounts") {
    return {
      kind: "official-accounts",
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

type MobileQuickActionItem = {
  key: string;
  label: string;
  icon: typeof Users;
  to?: "/group/new";
  disabled?: boolean;
  disabledLabel?: string;
};

const mobileQuickActionItems: MobileQuickActionItem[] = [
  {
    key: "create-group",
    label: "发起群聊",
    icon: Users,
    to: "/group/new",
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

export function ContactsPage() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = parseDesktopContactsRouteState(hash);
  const [searchText, setSearchText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showWorldCharacters, setShowWorldCharacters] = useState(
    routeState.showWorldCharacters,
  );
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [desktopSelection, setDesktopSelection] = useState<DesktopSelection>(
    () => buildDesktopSelectionFromRouteState(hash),
  );
  const [activeMobileIndexKey, setActiveMobileIndexKey] = useState<
    string | null
  >(null);
  const previousBaseUrlRef = useRef(baseUrl);
  const startChatResetRef = useRef<() => void>(() => {});
  const desktopSearchLauncher = useDesktopSearchLauncher({
    keyword: searchText,
    onKeywordChange: setSearchText,
    source: "contacts",
  });
  const effectiveSearchText = isDesktopLayout ? searchText : "";
  const deferredSearchText = useDeferredValue(effectiveSearchText);

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });

  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
  });

  const savedGroupsQuery = useQuery({
    queryKey: ["app-saved-groups", baseUrl],
    queryFn: () => getSavedGroups(baseUrl),
  });

  const blockedCharactersQuery = useQuery({
    queryKey: ["app-contacts-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: isDesktopLayout,
  });

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: isDesktopLayout,
  });

  const startChatMutation = useMutation({
    mutationFn: (characterId: string) =>
      getOrCreateConversation({ characterId }, baseUrl),
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }

      navigate({
        to: "/chat/$conversationId",
        params: { conversationId: conversation.id },
      });
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
        (charactersQuery.data ?? []).filter(
          (character) => !friendIds.has(character.id),
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
  const mobileIndexItems = useMemo(
    () =>
      friendSections.map((section) => ({
        key: section.anchorId,
        indexLabel: section.indexLabel,
      })),
    [friendSections],
  );

  const pendingRequestCount = useMemo(
    () =>
      (friendRequestsQuery.data ?? []).filter(
        (request) => request.status === "pending",
      ).length,
    [friendRequestsQuery.data],
  );
  const savedGroupCount = savedGroupsQuery.data?.length ?? 0;
  const tagCount = useMemo(
    () =>
      new Set(
        (friendsQuery.data ?? []).flatMap((item) =>
          (item.friendship.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
        ),
      ).size,
    [friendsQuery.data],
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

  function commitDesktopRouteState(
    nextSelection: DesktopSelection,
    nextShowWorldCharacters: boolean,
    replace = false,
  ) {
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
  }

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
          reason: "来自通讯录详情页加入黑名单",
        },
        baseUrl,
      );
    },
    onSuccess: async (_, variables) => {
      setNotice(variables.blocked ? "已移出黑名单。" : "已加入黑名单。");
      await Promise.all([
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
    onSuccess: async (_, requestId) => {
      const acceptedRequest =
        (friendRequestsQuery.data ?? []).find(
          (request) => request.id === requestId,
        ) ?? null;

      setNotice("已通过好友申请。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-friends-quick-start", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-friends", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);

      if (acceptedRequest?.characterId) {
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
    onSuccess: async () => {
      setNotice("好友请求已处理。");
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
      setNotice(variables.starred ? "已设为星标朋友。" : "已取消星标朋友。");
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
      const conversationId =
        selectedConversation?.participants.includes(characterId) &&
        !isPersistedGroupConversation(selectedConversation)
          ? selectedConversation.id
          : (await getOrCreateConversation({ characterId }, baseUrl)).id;

      return setConversationPinned(conversationId, { pinned }, baseUrl);
    },
    onSuccess: async (_, variables) => {
      setNotice(variables.pinned ? "聊天已置顶。" : "聊天已取消置顶。");
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
      const conversationId =
        selectedConversation?.participants.includes(characterId) &&
        !isPersistedGroupConversation(selectedConversation)
          ? selectedConversation.id
          : (await getOrCreateConversation({ characterId }, baseUrl)).id;

      return setConversationMuted(conversationId, { muted }, baseUrl);
    },
    onSuccess: async (_, variables) => {
      setNotice(variables.muted ? "已开启消息免打扰。" : "已关闭消息免打扰。");
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });
  const deleteFriendMutation = useMutation({
    mutationFn: (characterId: string) => deleteFriend(characterId, baseUrl),
    onSuccess: async () => {
      setNotice("已从通讯录删除联系人。");
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
    startChatResetRef.current();
  }, [baseUrl]);

  useEffect(() => {
    if (normalizedSearchText || !friendSections.length) {
      setActiveMobileIndexKey(null);
      return;
    }

    setActiveMobileIndexKey((current) => {
      if (
        current &&
        friendSections.some((section) => section.anchorId === current)
      ) {
        return current;
      }

      return friendSections[0]?.anchorId ?? null;
    });
  }, [friendSections, normalizedSearchText]);

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
      let nextActiveKey = friendSections[0]?.anchorId ?? null;

      for (const section of friendSections) {
        const sectionElement = document.getElementById(section.anchorId);
        if (!sectionElement) {
          continue;
        }

        const topOffset =
          sectionElement.getBoundingClientRect().top - containerRect.top;
        if (topOffset <= stickyOffset) {
          nextActiveKey = section.anchorId;
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
  }, [friendSections, isDesktopLayout, normalizedSearchText]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    if (desktopSelection?.kind !== "starred-friends") {
      return;
    }

    const nextSelection = desktopSelection.id
      ? ({
          kind: "friend",
          id: desktopSelection.id,
        } satisfies DesktopSelection)
      : desktopDefaultFriendItem
        ? ({
            kind: "friend",
            id: desktopDefaultFriendItem.character.id,
          } satisfies DesktopSelection)
        : null;

    setDesktopSelection(nextSelection);
    commitDesktopRouteState(nextSelection, showWorldCharacters, true);
  }, [
    desktopDefaultFriendItem,
    desktopSelection,
    isDesktopLayout,
    showWorldCharacters,
  ]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    if (
      desktopSelection?.kind === "new-friends" ||
      desktopSelection?.kind === "groups" ||
      desktopSelection?.kind === "tags" ||
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
    desktopDefaultFriendItem,
    desktopSelection,
    filteredWorldCharacterItems,
    isDesktopLayout,
    showWorldCharacters,
  ]);

  function handleShortcutNavigate(to: ShortcutRoute) {
    setNotice(null);
    void navigate({ to });
  }

  function handleDesktopSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.defaultPrevented) {
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    desktopSearchLauncher.openSearch();
  }

  function handleMobileQuickActionNavigate(to: "/group/new") {
    setIsQuickMenuOpen(false);
    setNotice(null);
    void navigate({ to });
  }

  function handleOpenWorldCharacters() {
    setNotice(null);

    if (!isDesktopLayout) {
      void navigate({ to: "/contacts/world-characters" });
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
    void navigate({ to: "/character/$characterId", params: { characterId } });
  }

  function handleOpenSelectedFriendMoments() {
    if (!selectedFriendItem) {
      return;
    }

    setNotice(null);
    void navigate({
      to: "/desktop/friend-moments/$characterId",
      params: { characterId: selectedFriendItem.character.id },
      hash: buildDesktopFriendMomentsRouteHash({
        source: "contacts",
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
  const shortcutItems: ContactShortcutListItem[] = [
    {
      key: "new-friends",
      label: "新的朋友",
      subtitle:
        pendingRequestCount > 0
          ? `${pendingRequestCount} 条待处理申请`
          : "查看好友申请",
      badgeCount: pendingRequestCount,
      active: desktopSelection?.kind === "new-friends",
      icon: UserPlus,
      iconClassName: "bg-[linear-gradient(135deg,#34d399,#16a34a)]",
      onClick: () => {
        if (!isDesktopLayout) {
          handleShortcutNavigate("/friend-requests");
          return;
        }

        const nextSelection = {
          kind: "new-friends",
        } satisfies DesktopSelection;
        setDesktopSelection(nextSelection);
        commitDesktopRouteState(nextSelection, showWorldCharacters);
      },
    },
    {
      key: "group-chat",
      label: "群聊",
      subtitle:
        savedGroupCount > 0
          ? `${savedGroupCount} 个已保存群聊`
          : "查看已保存群聊",
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
          ...(savedGroupsQuery.data?.[0]?.id
            ? { id: savedGroupsQuery.data[0].id }
            : {}),
        } satisfies DesktopSelection;
        setDesktopSelection(nextSelection);
        commitDesktopRouteState(nextSelection, showWorldCharacters);
      },
    },
    {
      key: "tags",
      label: "标签",
      subtitle: tagCount > 0 ? `${tagCount} 个联系人标签` : "查看联系人标签",
      active: desktopSelection?.kind === "tags",
      icon: Tag,
      iconClassName: "bg-[linear-gradient(135deg,#34d399,#07c160)]",
      onClick: () => {
        if (!isDesktopLayout) {
          handleShortcutNavigate("/contacts/tags");
          return;
        }

        const nextSelection = {
          kind: "tags",
        } satisfies DesktopSelection;
        setDesktopSelection(nextSelection);
        commitDesktopRouteState(nextSelection, showWorldCharacters);
      },
    },
    {
      key: "official-accounts",
      label: "公众号",
      subtitle: "查看已上线的内容账号",
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
        } satisfies DesktopSelection;
        setDesktopSelection(nextSelection);
        commitDesktopRouteState(nextSelection, showWorldCharacters);
      },
    },
    {
      key: "world-characters",
      label: "世界角色",
      subtitle: isDesktopLayout
        ? showWorldCharacters
          ? "收起角色目录"
          : worldCharacterDirectoryItems.length > 0
            ? `还有 ${worldCharacterDirectoryItems.length} 个角色可认识`
            : "当前没有新的角色可认识"
        : worldCharacterDirectoryItems.length > 0
          ? `还有 ${worldCharacterDirectoryItems.length} 个角色可认识`
          : "查看世界角色目录",
      active:
        (isDesktopLayout && showWorldCharacters) ||
        desktopSelection?.kind === "world-character",
      icon: BookUser,
      iconClassName: "bg-[linear-gradient(135deg,#22c55e,#0f766e)]",
      onClick: handleOpenWorldCharacters,
    },
  ];
  const desktopShortcutItems = shortcutItems.filter(
    (item) => item.key !== "starred-friends",
  );
  const mobileShortcutItems = shortcutItems;
  const mobileErrorItems = [
    friendsQuery.isError && friendsQuery.error instanceof Error
      ? {
          key: "friends",
          message: "联系人列表暂时没有刷新成功。",
          onRetry: () => {
            void friendsQuery.refetch();
          },
        }
      : null,
    charactersQuery.isError && charactersQuery.error instanceof Error
      ? {
          key: "characters",
          message: "世界角色目录暂时没有刷新成功。",
          onRetry: () => {
            void charactersQuery.refetch();
          },
        }
      : null,
    friendRequestsQuery.isError && friendRequestsQuery.error instanceof Error
      ? {
          key: "friend-requests",
          message: "好友申请入口暂时没有刷新成功。",
          onRetry: () => {
            void friendRequestsQuery.refetch();
          },
        }
      : null,
    savedGroupsQuery.isError && savedGroupsQuery.error instanceof Error
      ? {
          key: "saved-groups",
          message: "群聊入口暂时没有刷新成功。",
          onRetry: () => {
            void savedGroupsQuery.refetch();
          },
        }
      : null,
    startChatMutation.isError && startChatMutation.error instanceof Error
      ? {
          key: "start-chat",
          message: startChatMutation.error.message,
        }
      : null,
    setStarredMutation.isError && setStarredMutation.error instanceof Error
      ? {
          key: "set-starred",
          message: setStarredMutation.error.message,
        }
      : null,
  ].filter(
    (
      item,
    ): item is {
      key: string;
      message: string;
      onRetry?: () => void;
    } => item !== null,
  );
  const desktopErrors = [
    friendsQuery.error,
    charactersQuery.error,
    friendRequestsQuery.error,
    savedGroupsQuery.error,
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
      <DesktopContactsWorkspace
        directoryCountLabel={`${filteredFriendItems.length} 位联系人${
          showWorldCharacters || normalizedSearchText
            ? ` · ${filteredWorldCharacterItems.length} 个世界角色`
            : ""
        }`}
        searchContainerRef={desktopSearchLauncher.containerRef}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        onSearchOpen={() => desktopSearchLauncher.setIsOpen(true)}
        onSearchKeyDown={handleDesktopSearchKeyDown}
        searchPanel={
          desktopSearchLauncher.isOpen ? (
            <DesktopSearchDropdownPanel
              history={desktopSearchLauncher.history}
              keyword={searchText}
              onClose={desktopSearchLauncher.close}
              onOpenSearch={desktopSearchLauncher.openSearch}
              speechDisplayText={desktopSearchLauncher.speechDisplayText}
              speechError={desktopSearchLauncher.speechError}
              speechStatus={desktopSearchLauncher.speechStatus}
            />
          ) : null
        }
        speechListening={desktopSearchLauncher.speechListening}
        speechStatus={desktopSearchLauncher.speechStatus}
        speechSupported={desktopSearchLauncher.speechSupported}
        speechButtonDisabled={desktopSearchLauncher.speechButtonDisabled}
        onSpeechButtonClick={(event) => {
          event.preventDefault();
          desktopSearchLauncher.handleSpeechButtonClick();
        }}
        shortcutList={
          <ContactShortcutList
            items={desktopShortcutItems}
            compact
            variant="desktop-flat"
          />
        }
        notice={notice}
        errors={desktopErrors}
        loading={friendsQuery.isLoading}
        friendSections={desktopFriendSections}
        activeFriendId={
          desktopSelection?.kind === "friend" ? desktopSelection.id : null
        }
        pendingCharacterId={pendingCharacterId}
        onSelectFriend={(characterId) => {
          const nextSelection = {
            kind: "friend",
            id: characterId,
          } satisfies DesktopSelection;
          setDesktopSelection(nextSelection);
          commitDesktopRouteState(nextSelection, showWorldCharacters);
        }}
        onOpenFriendChat={handleStartChat}
        emptyState={
          !friendsQuery.isError ? (
            <div className="px-3">
              <EmptyState
                title={
                  normalizedSearchText
                    ? "没有找到匹配的联系人"
                    : "通讯录还是空的"
                }
                description={
                  normalizedSearchText
                    ? "换个关键词试试，或者展开世界角色目录继续找人。"
                    : "先从新的朋友里建立关系，或者去看看世界角色。"
                }
                action={
                  normalizedSearchText ? (
                    <Button
                      variant="secondary"
                      onClick={() => setSearchText("")}
                    >
                      清空搜索
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={handleOpenWorldCharacters}
                    >
                      浏览世界角色
                    </Button>
                  )
                }
              />
            </div>
          ) : null
        }
        worldCharacterTitle={
          normalizedSearchText ? "世界角色搜索结果" : "尚未成为联系人"
        }
        worldCharacterItems={filteredWorldCharacterItems}
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
              notice={notice}
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
            />
          ) : desktopSelection?.kind === "groups" ? (
            <DesktopContactsGroupsPane
              groups={savedGroupsQuery.data ?? []}
              selectedGroupId={desktopSelection.id ?? null}
              loading={savedGroupsQuery.isLoading}
              error={
                savedGroupsQuery.error instanceof Error
                  ? savedGroupsQuery.error.message
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
                  }),
                });
              }}
              onOpenGroup={(groupId) => {
                void navigate({
                  to: "/group/$groupId",
                  params: { groupId },
                });
              }}
              onOpenGroupDetails={(groupId) => {
                void navigate({
                  to: "/group/$groupId/details",
                  params: { groupId },
                });
              }}
            />
          ) : desktopSelection?.kind === "tags" ? (
            <DesktopContactsTagsPane />
          ) : desktopSelection?.kind === "official-accounts" ? (
            <DesktopOfficialAccountsWorkspace
              selectedAccountId={desktopSelection.accountId}
              selectedArticleId={desktopSelection.articleId}
              onOpenAccount={(accountId) => {
                const nextSelection = {
                  kind: "official-accounts",
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
                void navigate({ to: "/group/$groupId", params: { groupId } });
              }}
              onOpenMoments={
                selectedFriendItem ? handleOpenSelectedFriendMoments : undefined
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
              onToggleBlock={selectedFriendItem ? handleToggleBlock : undefined}
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
    );
  }

  return (
    <div ref={pageRef}>
      <AppPage className="relative min-h-full space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
        {isQuickMenuOpen ? (
          <button
            type="button"
            aria-label="关闭快捷菜单"
            onClick={() => setIsQuickMenuOpen(false)}
            className="fixed inset-0 z-30 bg-black/[0.03]"
          />
        ) : null}

        <TabPageTopBar
          title="通讯录"
          titleAlign="center"
          className="z-40 mx-0 mt-0 mb-0 overflow-visible border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
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
                  {mobileQuickActionItems.map((item) => {
                    const Icon = item.icon;

                    if (item.to && !item.disabled) {
                      const to = item.to;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => handleMobileQuickActionNavigate(to)}
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
              className="flex h-7.5 w-full items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 text-[12px] text-[color:var(--text-dim)]"
              aria-label="打开搜一搜"
            >
              <Search size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 text-left">搜索</span>
            </button>
          </div>
        </TabPageTopBar>

        <div className="pb-8">
          {notice || mobileErrorItems.length ? (
            <div className="space-y-1.5 px-3 pt-2">
              {notice ? (
                <InlineNotice
                  tone="info"
                  className="rounded-[11px] border-[rgba(96,165,250,0.16)] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
                >
                  {notice}
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
                    {item.onRetry ? (
                      <button
                        type="button"
                        onClick={item.onRetry}
                        className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                      >
                        重试
                      </button>
                    ) : null}
                  </div>
                </InlineNotice>
              ))}
            </div>
          ) : null}

          <ContactShortcutList
            items={mobileShortcutItems}
            mobileDense
            className="mt-0.5 border-x-0 shadow-none"
          />

          <section className="mt-1.5 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {friendsQuery.isLoading ? (
              <MobileContactsStatusCard
                badge="读取中"
                title="正在刷新通讯录"
                description="稍等一下，正在同步联系人、群聊和服务入口。"
                tone="loading"
              />
            ) : null}

            {!friendsQuery.isLoading &&
            !friendsQuery.isError &&
            !friendSections.length ? (
              <div className="px-3 py-3">
                <MobileContactsStatusCard
                  badge={normalizedSearchText ? "搜索" : "通讯录"}
                  title={
                    normalizedSearchText
                      ? "没有找到匹配的联系人"
                      : "通讯录还是空的"
                  }
                  description={
                    normalizedSearchText
                      ? "换个关键词试试，或者继续搜索世界角色。"
                      : "先处理新的朋友，或者去浏览世界角色。"
                  }
                  action={
                    normalizedSearchText ? (
                      <Button
                        variant="secondary"
                        onClick={() => setSearchText("")}
                        className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                      >
                        清空搜索
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={handleOpenWorldCharacters}
                        className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                      >
                        查看世界角色
                      </Button>
                    )
                  }
                />
              </div>
            ) : null}

            {friendSections.map((section) => (
              <div key={section.key} id={section.anchorId}>
                <SectionHeader title={section.title} />
                {section.items.map((item, index) => (
                  <FriendListRow
                    key={item.character.id}
                    item={item}
                    index={index}
                    onClick={() => handleOpenProfile(item.character.id)}
                  />
                ))}
              </div>
            ))}
          </section>
        </div>

        {!normalizedSearchText && friendSections.length ? (
          <ContactIndexList
            items={mobileIndexItems}
            activeKey={activeMobileIndexKey}
            compact
            className="fixed right-0.5 top-[55%] z-30 -translate-y-1/2"
            onSelect={handleIndexJumpWithBehavior}
          />
        ) : null}
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
  onClick,
  onDoubleClick,
}: {
  item: FriendDirectoryItem;
  index: number;
  pendingCharacterId?: string | null;
  desktop?: boolean;
  active?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] text-left transition-colors",
        desktop
          ? "px-4 py-3.5 hover:bg-[color:var(--surface-console)]"
          : "px-4 py-2.5 hover:bg-[color:var(--surface-card-hover)]",
        index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
        active
          ? "border border-[rgba(7,193,96,0.16)] bg-[rgba(240,247,243,0.94)] shadow-[inset_0_0_0_1px_rgba(7,193,96,0.06)]"
          : undefined,
      )}
    >
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
              ? "正在打开会话..."
              : item.displayName !== item.character.name
                ? `昵称：${item.character.name}`
                : item.character.currentStatus?.trim() ||
                  item.character.relationship ||
                  "保持联系"}
          </div>
        ) : null}
      </div>
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

function WorldCharacterRow({
  item,
  index,
  desktop = false,
  active = false,
  onClick,
}: {
  item: WorldCharacterDirectoryItem;
  index: number;
  desktop?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] text-left transition-colors",
        desktop
          ? "px-4 py-3.5 hover:bg-[color:var(--surface-console)]"
          : "px-4 py-2.5 hover:bg-[color:var(--surface-card-hover)]",
        index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
        active
          ? "border border-[rgba(7,193,96,0.14)] bg-[rgba(240,247,243,0.94)] shadow-[0_8px_22px_rgba(15,23,42,0.03)]"
          : undefined,
      )}
    >
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
          {item.character.name}
        </div>
        {desktop ? (
          <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
            {item.character.relationship ||
              item.character.currentStatus?.trim() ||
              "查看角色资料"}
          </div>
        ) : null}
      </div>
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
          : "sticky top-[78px] text-[11px] bg-[rgba(247,247,247,0.94)] backdrop-blur",
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
