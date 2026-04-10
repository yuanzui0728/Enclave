import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  BookText,
  BookUser,
  Search,
  Star,
  Tag,
  UserPlus,
  Users,
} from "lucide-react";
import {
  blockCharacter,
  deleteFriend,
  getBlockedCharacters,
  getConversations,
  getFriendRequests,
  getFriends,
  getOrCreateConversation,
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
import {
  buildContactSections,
  createFriendDirectoryItems,
  createWorldCharacterDirectoryItems,
  matchesCharacterSearch,
  type FriendDirectoryItem,
  type WorldCharacterDirectoryItem,
} from "../features/contacts/contact-utils";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type ShortcutRoute =
  | "/group/new"
  | "/friend-requests"
  | "/contacts/starred"
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
  | null;

export function ContactsPage() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showWorldCharacters, setShowWorldCharacters] = useState(false);
  const [desktopSelection, setDesktopSelection] =
    useState<DesktopSelection>(null);
  const [activeMobileIndexKey, setActiveMobileIndexKey] = useState<
    string | null
  >(null);
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
      matchesCharacterSearch(item.character, normalizedSearchText),
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

  const pendingRequestCount = useMemo(
    () =>
      (friendRequestsQuery.data ?? []).filter(
        (request) => request.status === "pending",
      ).length,
    [friendRequestsQuery.data],
  );
  const starredFriendCount = useMemo(
    () =>
      (friendsQuery.data ?? []).filter((item) => item.friendship.isStarred)
        .length,
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
              conversation.type === "direct" &&
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
                conversation.type === "group" &&
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

  const resetStartChatMutation = useEffectEvent(() => {
    startChatMutation.reset();
  });

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
        selectedConversation.type === "direct"
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
        selectedConversation.type === "direct"
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
    resetStartChatMutation();
  }, [baseUrl, resetStartChatMutation]);

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

  const syncActiveMobileIndexKey = useEffectEvent(() => {
    if (
      isDesktopLayout ||
      normalizedSearchText ||
      !friendSections.length ||
      typeof document === "undefined"
    ) {
      return;
    }

    const scrollContainer = pageRef.current?.parentElement;
    if (!scrollContainer) {
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

    setActiveMobileIndexKey(nextActiveKey);
  });

  useEffect(() => {
    if (isDesktopLayout || normalizedSearchText || !friendSections.length) {
      return;
    }

    const scrollContainer = pageRef.current?.parentElement;
    if (!scrollContainer) {
      return;
    }

    syncActiveMobileIndexKey();
    scrollContainer.addEventListener("scroll", syncActiveMobileIndexKey, {
      passive: true,
    });

    return () => {
      scrollContainer.removeEventListener("scroll", syncActiveMobileIndexKey);
    };
  }, [
    friendSections,
    isDesktopLayout,
    normalizedSearchText,
    syncActiveMobileIndexKey,
  ]);

  useEffect(() => {
    if (!isDesktopLayout) {
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

    if (filteredFriendItems[0]) {
      setDesktopSelection({
        kind: "friend",
        id: filteredFriendItems[0].character.id,
      });
      return;
    }

    if (filteredWorldCharacterItems[0]) {
      setDesktopSelection({
        kind: "world-character",
        id: filteredWorldCharacterItems[0].character.id,
      });
      return;
    }

    setDesktopSelection(null);
  }, [
    desktopSelection,
    filteredFriendItems,
    filteredWorldCharacterItems,
    isDesktopLayout,
  ]);

  function handleShortcutNavigate(to: ShortcutRoute) {
    setNotice(null);
    void navigate({ to });
  }

  function handleUnavailableAction(message: string) {
    setNotice(message);
  }

  function handleOpenWorldCharacters() {
    setNotice(null);

    const willExpand = !showWorldCharacters;
    setShowWorldCharacters(willExpand);

    if (isDesktopLayout) {
      if (willExpand && worldCharacterDirectoryItems[0]) {
        setDesktopSelection({
          kind: "world-character",
          id: worldCharacterDirectoryItems[0].character.id,
        });
      } else if (
        !willExpand &&
        desktopSelection?.kind === "world-character" &&
        friendDirectoryItems[0]
      ) {
        setDesktopSelection({
          kind: "friend",
          id: friendDirectoryItems[0].character.id,
        });
      }
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

  function handleIndexJump(anchorId: string) {
    setActiveMobileIndexKey(anchorId);

    if (typeof document === "undefined") {
      return;
    }

    document.getElementById(anchorId)?.scrollIntoView({
      behavior: "smooth",
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
      icon: UserPlus,
      iconClassName: "bg-[linear-gradient(135deg,#34d399,#16a34a)]",
      onClick: () => handleShortcutNavigate("/friend-requests"),
    },
    {
      key: "starred-friends",
      label: "星标朋友",
      subtitle:
        starredFriendCount > 0
          ? `${starredFriendCount} 位常联系好友`
          : "查看星标朋友",
      icon: Star,
      iconClassName: "bg-[linear-gradient(135deg,#fbbf24,#f59e0b)]",
      onClick: () => handleShortcutNavigate("/contacts/starred"),
    },
    {
      key: "group-chat",
      label: "群聊",
      subtitle: "发起新的群聊",
      icon: Users,
      iconClassName: "bg-[linear-gradient(135deg,#60a5fa,#2563eb)]",
      onClick: () => handleShortcutNavigate("/group/new"),
    },
    {
      key: "tags",
      label: "标签",
      subtitle: "暂未开放",
      icon: Tag,
      iconClassName: "bg-[linear-gradient(135deg,#fb923c,#f97316)]",
      onClick: () => handleUnavailableAction("标签功能暂未开放。"),
    },
    {
      key: "official-accounts",
      label: "公众号",
      subtitle: "查看已上线的内容账号",
      icon: BookText,
      iconClassName: "bg-[linear-gradient(135deg,#5d67c9,#4951a3)]",
      onClick: () => handleShortcutNavigate("/contacts/official-accounts"),
    },
    {
      key: "world-characters",
      label: "世界角色",
      subtitle: showWorldCharacters
        ? "收起角色目录"
        : worldCharacterDirectoryItems.length > 0
          ? `还有 ${worldCharacterDirectoryItems.length} 个角色可认识`
          : "当前没有新的角色可认识",
      icon: BookUser,
      iconClassName: "bg-[linear-gradient(135deg,#22c55e,#0f766e)]",
      onClick: handleOpenWorldCharacters,
    },
  ];

  if (isDesktopLayout) {
    return (
      <div ref={pageRef} className="h-full min-h-0">
        <AppPage className="h-full min-h-0 space-y-0 bg-[linear-gradient(180deg,rgba(255,252,245,0.96),rgba(255,248,236,0.98))] px-0 py-0">
          <div className="flex h-full min-h-0">
            <section className="flex w-[340px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,248,238,0.96))]">
              <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-base font-medium text-[color:var(--text-primary)]">
                    通讯录
                  </div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {filteredFriendItems.length}
                    {filteredWorldCharacterItems.length
                      ? ` + ${filteredWorldCharacterItems.length}`
                      : ""}
                  </div>
                </div>

                <label className="mt-3 flex items-center gap-2 rounded-[16px] border border-[color:var(--border-faint)] bg-[rgba(255,249,238,0.85)] px-3 py-2.5 text-sm text-[color:var(--text-dim)] shadow-none">
                  <Search size={15} className="shrink-0" />
                  <input
                    type="search"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="搜索"
                    className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
                  />
                </label>
              </div>

              <div className="px-3 py-3">
                <ContactShortcutList
                  items={shortcutItems}
                  compact
                  className="shadow-[0_10px_32px_rgba(15,23,42,0.05)]"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-auto bg-[rgba(255,249,238,0.72)] pb-4">
                {notice ? (
                  <div className="px-3 pb-3">
                    <InlineNotice tone="info">{notice}</InlineNotice>
                  </div>
                ) : null}
                {friendsQuery.isError && friendsQuery.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={friendsQuery.error.message} />
                  </div>
                ) : null}
                {charactersQuery.isError &&
                charactersQuery.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={charactersQuery.error.message} />
                  </div>
                ) : null}
                {friendRequestsQuery.isError &&
                friendRequestsQuery.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={friendRequestsQuery.error.message} />
                  </div>
                ) : null}
                {blockedCharactersQuery.isError &&
                blockedCharactersQuery.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock
                      message={blockedCharactersQuery.error.message}
                    />
                  </div>
                ) : null}
                {conversationsQuery.isError &&
                conversationsQuery.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={conversationsQuery.error.message} />
                  </div>
                ) : null}
                {startChatMutation.isError &&
                startChatMutation.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={startChatMutation.error.message} />
                  </div>
                ) : null}
                {setStarredMutation.isError &&
                setStarredMutation.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={setStarredMutation.error.message} />
                  </div>
                ) : null}
                {blockMutation.isError &&
                blockMutation.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={blockMutation.error.message} />
                  </div>
                ) : null}
                {pinMutation.isError && pinMutation.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={pinMutation.error.message} />
                  </div>
                ) : null}
                {muteMutation.isError && muteMutation.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={muteMutation.error.message} />
                  </div>
                ) : null}
                {deleteFriendMutation.isError &&
                deleteFriendMutation.error instanceof Error ? (
                  <div className="px-3 pb-3">
                    <ErrorBlock message={deleteFriendMutation.error.message} />
                  </div>
                ) : null}

                {friendsQuery.isLoading ? (
                  <LoadingBlock
                    className="px-4 py-6 text-left"
                    label="正在读取联系人..."
                  />
                ) : null}

                {!friendsQuery.isLoading && friendSections.length ? (
                  <div className="border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
                    {friendSections.map((section) => (
                      <div key={section.key} id={section.anchorId}>
                        <SectionHeader title={section.title} desktop />
                        {section.items.map((item, index) => (
                          <FriendListRow
                            key={item.character.id}
                            item={item}
                            index={index}
                            desktop
                            active={
                              desktopSelection?.kind === "friend" &&
                              desktopSelection.id === item.character.id
                            }
                            pendingCharacterId={pendingCharacterId}
                            onClick={() =>
                              setDesktopSelection({
                                kind: "friend",
                                id: item.character.id,
                              })
                            }
                            onDoubleClick={() =>
                              handleStartChat(item.character.id)
                            }
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}

                {!friendsQuery.isLoading &&
                !friendsQuery.isError &&
                !friendSections.length ? (
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
                ) : null}

                {filteredWorldCharacterItems.length ? (
                  <div
                    id="world-character-directory"
                    className="mt-3 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]"
                  >
                    <SectionHeader
                      title={normalizedSearchText ? "世界角色结果" : "世界角色"}
                      desktop
                    />
                    {filteredWorldCharacterItems.map((item, index) => (
                      <WorldCharacterRow
                        key={item.character.id}
                        item={item}
                        index={index}
                        desktop
                        active={
                          desktopSelection?.kind === "world-character" &&
                          desktopSelection.id === item.character.id
                        }
                        onClick={() =>
                          setDesktopSelection({
                            kind: "world-character",
                            id: item.character.id,
                          })
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="min-w-0 flex-1">
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
            </section>
          </div>
        </AppPage>
      </div>
    );
  }

  return (
    <div ref={pageRef}>
      <AppPage className="relative min-h-full space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
        <TabPageTopBar
          title="通讯录"
          titleAlign="center"
          className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,248,239,0.94))] px-4 py-3 text-[color:var(--text-primary)] shadow-none"
        >
          <div className="pt-3">
            <button
              type="button"
              onClick={() => {
                void navigate({ to: "/tabs/search" });
              }}
              className="flex w-full items-center gap-2 rounded-[10px] border border-[color:var(--border-faint)] bg-[rgba(255,249,238,0.85)] px-3 py-2.5 text-sm text-[color:var(--text-dim)]"
              aria-label="打开搜一搜"
            >
              <Search size={15} className="shrink-0" />
              <span className="min-w-0 flex-1 text-left">搜索</span>
            </button>
          </div>
        </TabPageTopBar>

        <div className="pb-8">
          {notice ? (
            <div className="px-3 pt-3">
              <InlineNotice tone="info">{notice}</InlineNotice>
            </div>
          ) : null}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? (
            <div className="px-3 pt-3">
              <ErrorBlock message={friendsQuery.error.message} />
            </div>
          ) : null}
          {charactersQuery.isError && charactersQuery.error instanceof Error ? (
            <div className="px-3 pt-3">
              <ErrorBlock message={charactersQuery.error.message} />
            </div>
          ) : null}
          {friendRequestsQuery.isError &&
          friendRequestsQuery.error instanceof Error ? (
            <div className="px-3 pt-3">
              <ErrorBlock message={friendRequestsQuery.error.message} />
            </div>
          ) : null}
          {startChatMutation.isError &&
          startChatMutation.error instanceof Error ? (
            <div className="px-3 pt-3">
              <ErrorBlock message={startChatMutation.error.message} />
            </div>
          ) : null}
          {setStarredMutation.isError &&
          setStarredMutation.error instanceof Error ? (
            <div className="px-3 pt-3">
              <ErrorBlock message={setStarredMutation.error.message} />
            </div>
          ) : null}

          <ContactShortcutList
            items={shortcutItems}
            className="mt-2 border-x-0 shadow-none"
          />

          <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {friendsQuery.isLoading ? (
              <LoadingBlock
                className="px-4 py-6 text-left"
                label="正在读取联系人..."
              />
            ) : null}

            {!friendsQuery.isLoading && !friendSections.length ? (
              <div className="px-3 py-6">
                <EmptyState
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
            ) : null}

            {friendSections.map((section) => (
              <div key={section.key} id={section.anchorId}>
                <SectionHeader title={section.title} />
                {section.items.map((item, index) => (
                  <FriendListRow
                    key={item.character.id}
                    item={item}
                    index={index}
                    pendingCharacterId={pendingCharacterId}
                    onClick={() => handleStartChat(item.character.id)}
                  />
                ))}
              </div>
            ))}
          </section>

          {filteredWorldCharacterItems.length ? (
            <section
              id="world-character-directory"
              className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]"
            >
              <SectionHeader
                title={normalizedSearchText ? "世界角色结果" : "世界角色"}
              />
              {filteredWorldCharacterItems.map((item, index) => (
                <WorldCharacterRow
                  key={item.character.id}
                  item={item}
                  index={index}
                  onClick={() => handleOpenProfile(item.character.id)}
                />
              ))}
            </section>
          ) : null}
        </div>

        {!normalizedSearchText && friendSections.length ? (
          <ContactIndexList
            items={friendSections.map((section) => ({
              key: section.anchorId,
              indexLabel: section.indexLabel,
            }))}
            activeKey={activeMobileIndexKey}
            className="fixed right-1 top-[55%] z-30 -translate-y-1/2"
            onSelect={handleIndexJump}
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
          ? "px-4 py-3.5 hover:bg-[rgba(249,115,22,0.06)]"
          : "px-4 py-3 hover:bg-[rgba(249,115,22,0.05)]",
        index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
        active
          ? "bg-[rgba(22,163,74,0.10)] shadow-[inset_3px_0_0_0_#16a34a]"
          : undefined,
      )}
    >
      <AvatarChip
        name={item.character.name}
        src={item.character.avatar}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] text-[color:var(--text-primary)]">
          {item.character.name}
        </div>
        <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
          {pendingCharacterId === item.character.id
            ? "正在打开会话..."
            : item.character.currentStatus?.trim() ||
              item.character.relationship ||
              "保持联系"}
        </div>
      </div>
      {item.friendship.isStarred ? (
        <Star
          size={15}
          className="shrink-0 text-[#f59e0b]"
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
          ? "px-4 py-3.5 hover:bg-[rgba(249,115,22,0.06)]"
          : "px-4 py-3 hover:bg-[rgba(249,115,22,0.05)]",
        index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
        active
          ? "bg-[rgba(249,115,22,0.08)] shadow-[inset_3px_0_0_0_rgba(249,115,22,0.40)]"
          : undefined,
      )}
    >
      <AvatarChip
        name={item.character.name}
        src={item.character.avatar}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] text-[color:var(--text-primary)]">
          {item.character.name}
        </div>
        <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
          {item.character.relationship ||
            item.character.currentStatus?.trim() ||
            "查看角色资料"}
        </div>
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
        "z-10 px-4 py-1.5 text-xs font-medium tracking-[0.08em] text-[color:var(--text-muted)]",
        desktop
          ? "sticky top-0 bg-[rgba(255,250,240,0.96)] backdrop-blur"
          : "sticky top-[88px] bg-[rgba(255,249,238,0.92)]",
      )}
    >
      {title}
    </div>
  );
}
