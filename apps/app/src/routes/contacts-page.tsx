import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BookUser, Search, Tag, UserPlus, Users } from "lucide-react";
import { getFriendRequests, getFriends, getOrCreateConversation, listCharacters } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { ContactDetailPane } from "../features/contacts/contact-detail-pane";
import { ContactIndexList } from "../features/contacts/contact-index-list";
import { ContactShortcutList, type ContactShortcutListItem } from "../features/contacts/contact-shortcut-list";
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

type ShortcutRoute = "/group/new" | "/friend-requests";

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
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showWorldCharacters, setShowWorldCharacters] = useState(false);
  const [desktopSelection, setDesktopSelection] = useState<DesktopSelection>(null);
  const deferredSearchText = useDeferredValue(searchText);

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

  const startChatMutation = useMutation({
    mutationFn: (characterId: string) => getOrCreateConversation({ characterId }, baseUrl),
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }

      navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
    },
  });

  const pendingCharacterId = startChatMutation.isPending ? startChatMutation.variables : null;
  const normalizedSearchText = deferredSearchText.trim().toLowerCase();

  const friendIds = useMemo(() => new Set((friendsQuery.data ?? []).map(({ character }) => character.id)), [friendsQuery.data]);

  const friendDirectoryItems = useMemo(() => createFriendDirectoryItems(friendsQuery.data ?? []), [friendsQuery.data]);

  const worldCharacterDirectoryItems = useMemo(
    () =>
      createWorldCharacterDirectoryItems((charactersQuery.data ?? []).filter((character) => !friendIds.has(character.id))),
    [charactersQuery.data, friendIds],
  );

  const filteredFriendItems = useMemo(() => {
    if (!normalizedSearchText) {
      return friendDirectoryItems;
    }

    return friendDirectoryItems.filter((item) => matchesCharacterSearch(item.character, normalizedSearchText));
  }, [friendDirectoryItems, normalizedSearchText]);

  const filteredWorldCharacterItems = useMemo(() => {
    if (normalizedSearchText) {
      return worldCharacterDirectoryItems.filter((item) => matchesCharacterSearch(item.character, normalizedSearchText));
    }

    return showWorldCharacters ? worldCharacterDirectoryItems : [];
  }, [normalizedSearchText, showWorldCharacters, worldCharacterDirectoryItems]);

  const friendSections = useMemo(() => buildContactSections(filteredFriendItems), [filteredFriendItems]);

  const pendingRequestCount = useMemo(
    () => (friendRequestsQuery.data ?? []).filter((request) => request.status === "pending").length,
    [friendRequestsQuery.data],
  );

  const selectedFriendItem = useMemo(() => {
    if (desktopSelection?.kind !== "friend") {
      return null;
    }

    return (
      filteredFriendItems.find((item) => item.character.id === desktopSelection.id) ??
      friendDirectoryItems.find((item) => item.character.id === desktopSelection.id) ??
      null
    );
  }, [desktopSelection, filteredFriendItems, friendDirectoryItems]);

  const selectedWorldCharacterItem = useMemo(() => {
    if (desktopSelection?.kind !== "world-character") {
      return null;
    }

    return (
      filteredWorldCharacterItems.find((item) => item.character.id === desktopSelection.id) ??
      worldCharacterDirectoryItems.find((item) => item.character.id === desktopSelection.id) ??
      null
    );
  }, [desktopSelection, filteredWorldCharacterItems, worldCharacterDirectoryItems]);

  const resetStartChatMutation = useEffectEvent(() => {
    startChatMutation.reset();
  });

  useEffect(() => {
    resetStartChatMutation();
  }, [baseUrl, resetStartChatMutation]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    if (desktopSelection?.kind === "friend" && filteredFriendItems.some((item) => item.character.id === desktopSelection.id)) {
      return;
    }

    if (
      desktopSelection?.kind === "world-character" &&
      filteredWorldCharacterItems.some((item) => item.character.id === desktopSelection.id)
    ) {
      return;
    }

    if (filteredFriendItems[0]) {
      setDesktopSelection({ kind: "friend", id: filteredFriendItems[0].character.id });
      return;
    }

    if (filteredWorldCharacterItems[0]) {
      setDesktopSelection({ kind: "world-character", id: filteredWorldCharacterItems[0].character.id });
      return;
    }

    setDesktopSelection(null);
  }, [desktopSelection, filteredFriendItems, filteredWorldCharacterItems, isDesktopLayout]);

  function handleShortcutNavigate(to: ShortcutRoute) {
    setNotice(null);
    void navigate({ to });
  }

  function handleUnavailableAction(message: string) {
    setNotice(message);
  }

  function handleOpenWorldCharacters() {
    setNotice(null);
    setShowWorldCharacters(true);

    if (isDesktopLayout && worldCharacterDirectoryItems[0]) {
      setDesktopSelection({ kind: "world-character", id: worldCharacterDirectoryItems[0].character.id });
    }

    if (typeof document === "undefined") {
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

  function handleIndexJump(anchorId: string) {
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
      subtitle: pendingRequestCount > 0 ? `${pendingRequestCount} 条待处理申请` : "查看好友申请",
      badgeCount: pendingRequestCount,
      icon: UserPlus,
      iconClassName: "bg-[linear-gradient(135deg,#34d399,#16a34a)]",
      onClick: () => handleShortcutNavigate("/friend-requests"),
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
      key: "world-characters",
      label: "世界角色",
      subtitle: showWorldCharacters ? "角色目录已展开" : `还有 ${worldCharacterDirectoryItems.length} 个角色可认识`,
      icon: BookUser,
      iconClassName: "bg-[linear-gradient(135deg,#22c55e,#0f766e)]",
      onClick: handleOpenWorldCharacters,
    },
  ];

  if (isDesktopLayout) {
    return (
      <AppPage className="h-full min-h-0 space-y-0 bg-[linear-gradient(180deg,rgba(248,249,251,0.96),rgba(243,245,247,0.98))] px-0 py-0">
        <div className="flex h-full min-h-0">
          <section className="flex w-[340px] shrink-0 flex-col border-r border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(246,247,249,0.98),rgba(240,243,246,0.98))]">
            <div className="border-b border-[rgba(15,23,42,0.06)] px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="text-base font-medium text-[color:var(--text-primary)]">通讯录</div>
                <div className="text-xs text-[color:var(--text-muted)]">
                  {filteredFriendItems.length}
                  {filteredWorldCharacterItems.length ? ` + ${filteredWorldCharacterItems.length}` : ""}
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 rounded-[16px] border border-[rgba(15,23,42,0.06)] bg-white px-3 py-2.5 text-sm text-[color:var(--text-dim)] shadow-none">
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
              <ContactShortcutList items={shortcutItems} compact className="shadow-[0_10px_32px_rgba(15,23,42,0.05)]" />
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-[rgba(244,246,248,0.82)] pb-4">
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
              {charactersQuery.isError && charactersQuery.error instanceof Error ? (
                <div className="px-3 pb-3">
                  <ErrorBlock message={charactersQuery.error.message} />
                </div>
              ) : null}
              {friendRequestsQuery.isError && friendRequestsQuery.error instanceof Error ? (
                <div className="px-3 pb-3">
                  <ErrorBlock message={friendRequestsQuery.error.message} />
                </div>
              ) : null}
              {startChatMutation.isError && startChatMutation.error instanceof Error ? (
                <div className="px-3 pb-3">
                  <ErrorBlock message={startChatMutation.error.message} />
                </div>
              ) : null}

              {friendsQuery.isLoading ? <LoadingBlock className="px-4 py-6 text-left" label="正在读取联系人..." /> : null}

              {!friendsQuery.isLoading && friendSections.length ? (
                <div className="border-y border-[rgba(15,23,42,0.06)] bg-white">
                  {friendSections.map((section) => (
                    <div key={section.key} id={section.anchorId}>
                      <SectionHeader title={section.title} desktop />
                      {section.items.map((item, index) => (
                        <FriendListRow
                          key={item.character.id}
                          item={item}
                          index={index}
                          desktop
                          active={desktopSelection?.kind === "friend" && desktopSelection.id === item.character.id}
                          pendingCharacterId={pendingCharacterId}
                          onClick={() => setDesktopSelection({ kind: "friend", id: item.character.id })}
                          onDoubleClick={() => handleStartChat(item.character.id)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}

              {!friendsQuery.isLoading && !friendsQuery.isError && !friendSections.length ? (
                <div className="px-3">
                  <EmptyState
                    title={normalizedSearchText ? "没有找到匹配的联系人" : "通讯录还是空的"}
                    description={
                      normalizedSearchText
                        ? "换个关键词试试，或者展开世界角色目录继续找人。"
                        : "先从新的朋友里建立关系，或者去看看世界角色。"
                    }
                    action={
                      normalizedSearchText ? (
                        <Button variant="secondary" onClick={() => setSearchText("")}>
                          清空搜索
                        </Button>
                      ) : (
                        <Button variant="secondary" onClick={handleOpenWorldCharacters}>
                          浏览世界角色
                        </Button>
                      )
                    }
                  />
                </div>
              ) : null}

              {filteredWorldCharacterItems.length ? (
                <div id="world-character-directory" className="mt-3 border-y border-[rgba(15,23,42,0.06)] bg-white">
                  <SectionHeader title={normalizedSearchText ? "世界角色结果" : "世界角色"} desktop />
                  {filteredWorldCharacterItems.map((item, index) => (
                    <WorldCharacterRow
                      key={item.character.id}
                      item={item}
                      index={index}
                      desktop
                      active={desktopSelection?.kind === "world-character" && desktopSelection.id === item.character.id}
                      onClick={() => setDesktopSelection({ kind: "world-character", id: item.character.id })}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="min-w-0 flex-1">
            <ContactDetailPane
              character={selectedFriendItem?.character ?? selectedWorldCharacterItem?.character ?? null}
              friendship={selectedFriendItem?.friendship ?? null}
              onStartChat={
                selectedFriendItem
                  ? () => handleStartChat(selectedFriendItem.character.id)
                  : undefined
              }
              chatPending={selectedFriendItem?.character.id === pendingCharacterId}
              onOpenProfile={() => {
                const characterId = selectedFriendItem?.character.id ?? selectedWorldCharacterItem?.character.id;
                if (!characterId) {
                  return;
                }

                handleOpenProfile(characterId);
              }}
            />
          </section>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="relative min-h-full space-y-0 bg-[#ededed] px-0 py-0">
      <TabPageTopBar
        title="通讯录"
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-[rgba(15,23,42,0.08)] bg-[#f7f7f7] px-4 py-3 text-[color:var(--text-primary)] shadow-none"
      >
        <div className="pt-3">
          <label className="flex items-center gap-2 rounded-[10px] border border-[rgba(15,23,42,0.06)] bg-white px-3 py-2.5 text-sm text-[color:var(--text-dim)]">
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
        {friendRequestsQuery.isError && friendRequestsQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={friendRequestsQuery.error.message} />
          </div>
        ) : null}
        {startChatMutation.isError && startChatMutation.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={startChatMutation.error.message} />
          </div>
        ) : null}

        <ContactShortcutList items={shortcutItems} className="mt-2 border-x-0 shadow-none" />

        <section className="mt-2 overflow-hidden border-y border-[rgba(15,23,42,0.06)] bg-white">
          {friendsQuery.isLoading ? <LoadingBlock className="px-4 py-6 text-left" label="正在读取联系人..." /> : null}

          {!friendsQuery.isLoading && !friendSections.length ? (
            <div className="px-3 py-6">
              <EmptyState
                title={normalizedSearchText ? "没有找到匹配的联系人" : "通讯录还是空的"}
                description={
                  normalizedSearchText
                    ? "换个关键词试试，或者继续搜索世界角色。"
                    : "先处理新的朋友，或者去浏览世界角色。"
                }
                action={
                  normalizedSearchText ? (
                    <Button variant="secondary" onClick={() => setSearchText("")}>
                      清空搜索
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={handleOpenWorldCharacters}>
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
          <section id="world-character-directory" className="mt-2 overflow-hidden border-y border-[rgba(15,23,42,0.06)] bg-white">
            <SectionHeader title={normalizedSearchText ? "世界角色结果" : "世界角色"} />
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
          items={friendSections.map((section) => ({ key: section.anchorId, indexLabel: section.indexLabel }))}
          activeKey={friendSections[0]?.anchorId ?? null}
          className="fixed right-1 top-[55%] z-30 -translate-y-1/2"
          onSelect={handleIndexJump}
        />
      ) : null}
    </AppPage>
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
        "flex w-full items-center gap-3 bg-white text-left transition-colors",
        desktop ? "px-4 py-3.5 hover:bg-[rgba(15,23,42,0.04)]" : "px-4 py-3 hover:bg-[rgba(15,23,42,0.03)]",
        index > 0 ? "border-t border-[rgba(15,23,42,0.06)]" : undefined,
        active ? "bg-[rgba(22,163,74,0.08)]" : undefined,
      )}
    >
      <AvatarChip name={item.character.name} src={item.character.avatar} size="wechat" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] text-[color:var(--text-primary)]">{item.character.name}</div>
        <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
          {pendingCharacterId === item.character.id
            ? "正在打开会话..."
            : item.character.currentStatus?.trim() || item.character.relationship || "联系人"}
        </div>
      </div>
      {item.character.isOnline ? <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#22c55e]" /> : null}
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
        "flex w-full items-center gap-3 bg-white text-left transition-colors",
        desktop ? "px-4 py-3.5 hover:bg-[rgba(15,23,42,0.04)]" : "px-4 py-3 hover:bg-[rgba(15,23,42,0.03)]",
        index > 0 ? "border-t border-[rgba(15,23,42,0.06)]" : undefined,
        active ? "bg-[rgba(15,23,42,0.04)]" : undefined,
      )}
    >
      <AvatarChip name={item.character.name} src={item.character.avatar} size="wechat" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] text-[color:var(--text-primary)]">{item.character.name}</div>
        <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
          {item.character.relationship || item.character.currentStatus?.trim() || "查看角色资料"}
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
        "z-10 px-4 py-1.5 text-xs font-medium tracking-[0.08em] text-[#8c8c8c]",
        desktop ? "sticky top-0 bg-[rgba(244,246,248,0.96)] backdrop-blur" : "sticky top-[88px] bg-[#f5f5f5]",
      )}
    >
      {title}
    </div>
  );
}
