import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search, Tag } from "lucide-react";
import {
  blockCharacter,
  deleteFriend,
  getBlockedCharacters,
  getConversations,
  getFriends,
  getOrCreateConversation,
  setConversationMuted,
  setConversationPinned,
  setFriendStarred,
  unblockCharacter,
  type ConversationListItem,
  type FriendListItem,
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
import { matchesCharacterSearch } from "../features/contacts/contact-utils";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type ContactTagGroup = {
  tag: string;
  items: FriendListItem[];
};

export function TagsPage() {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopTagsPage />;
  }

  return <MobileTagsPage />;
}

function MobileTagsPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const tagGroups = useMemo(
    () => buildContactTagGroups(friendsQuery.data ?? [], searchText),
    [friendsQuery.data, searchText],
  );
  const hasSearchText = searchText.trim().length > 0;

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="标签"
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 py-3 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)]"
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/contacts" });
              })
            }
            aria-label="返回通讯录"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      >
        <div className="pt-3">
          <label className="flex items-center gap-2 rounded-[10px] border border-black/5 bg-white px-3 py-2.5 text-sm text-[color:var(--text-dim)]">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索标签或联系人"
              className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {friendsQuery.isLoading ? (
          <div className="px-3 pt-3">
            <LoadingBlock label="正在读取标签..." />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={friendsQuery.error.message} />
          </div>
        ) : null}

        {!friendsQuery.isLoading &&
        !friendsQuery.isError &&
        !tagGroups.length ? (
          <div className="px-3 pt-6">
            <EmptyState
              title={hasSearchText ? "没有找到匹配的标签" : "还没有联系人标签"}
              description={
                hasSearchText
                  ? "换个标签名或联系人名称试试。"
                  : "先在联系人资料里补上标签，通讯录标签页就会自动聚合。"
              }
            />
          </div>
        ) : null}

        {tagGroups.length ? (
          <div className="space-y-4 pt-3">
            {tagGroups.map((group) => (
              <section
                key={group.tag}
                className="overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-[15px] font-medium text-[color:var(--text-primary)]">
                    <Tag size={15} className="text-[#15803d]" />
                    <span>{group.tag}</span>
                  </div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {group.items.length} 位联系人
                  </div>
                </div>

                {group.items.map((item, index) => (
                  <button
                    key={`${group.tag}-${item.character.id}`}
                    type="button"
                    onClick={() => {
                      void navigate({
                        to: "/character/$characterId",
                        params: { characterId: item.character.id },
                      });
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[rgba(7,193,96,0.05)]",
                      index > 0
                        ? "border-t border-[color:var(--border-faint)]"
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
                        {getFriendDisplayName(item)}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
                        {item.character.name}
                      </div>
                    </div>
                  </button>
                ))}
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function DesktopTagsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null,
  );

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-contacts-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
  });

  const startChatMutation = useMutation({
    mutationFn: (characterId: string) =>
      getOrCreateConversation({ characterId }, baseUrl),
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }

      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: conversation.id },
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
        selectedConversation &&
        isDirectConversationForCharacter(selectedConversation, characterId)
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
        selectedConversation &&
        isDirectConversationForCharacter(selectedConversation, characterId)
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
          reason: "来自标签页加入黑名单",
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
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const tagGroups = useMemo(
    () => buildContactTagGroups(friendsQuery.data ?? [], searchText),
    [friendsQuery.data, searchText],
  );
  const selectedGroup =
    tagGroups.find((group) => group.tag === selectedTag) ?? null;
  const selectedFriend =
    selectedGroup?.items.find(
      (item) => item.character.id === selectedCharacterId,
    ) ??
    tagGroups
      .flatMap((group) => group.items)
      .find((item) => item.character.id === selectedCharacterId) ??
    null;
  const selectedConversation = useMemo(
    () =>
      selectedFriend
        ? ((conversationsQuery.data ?? []).find((conversation) =>
            isDirectConversationForCharacter(
              conversation,
              selectedFriend.character.id,
            ),
          ) ?? null)
        : null,
    [conversationsQuery.data, selectedFriend],
  );
  const commonGroups = useMemo(
    () =>
      selectedFriend
        ? (conversationsQuery.data ?? [])
            .filter(
              (conversation) =>
                isPersistedGroupConversation(conversation) &&
                conversation.participants.includes(selectedFriend.character.id),
            )
            .map((conversation) => ({
              id: conversation.id,
              name: conversation.title,
            }))
        : [],
    [conversationsQuery.data, selectedFriend],
  );
  const selectedFriendBlocked = useMemo(
    () =>
      Boolean(
        selectedFriend &&
        (blockedQuery.data ?? []).some(
          (item) => item.characterId === selectedFriend.character.id,
        ),
      ),
    [blockedQuery.data, selectedFriend],
  );

  useEffect(() => {
    if (
      selectedGroup &&
      tagGroups.some((group) => group.tag === selectedGroup.tag)
    ) {
      return;
    }

    setSelectedTag(tagGroups[0]?.tag ?? null);
  }, [selectedGroup, tagGroups]);

  useEffect(() => {
    if (
      selectedFriend &&
      selectedGroup?.items.some(
        (item) => item.character.id === selectedFriend.character.id,
      )
    ) {
      return;
    }

    setSelectedCharacterId(selectedGroup?.items[0]?.character.id ?? null);
  }, [selectedFriend, selectedGroup]);

  const taggedFriendCount = useMemo(
    () =>
      new Set(
        tagGroups.flatMap((group) =>
          group.items.map((item) => item.character.id),
        ),
      ).size,
    [tagGroups],
  );

  return (
    <AppPage className="h-full min-h-0 space-y-0 bg-[linear-gradient(180deg,rgba(255,252,245,0.96),rgba(255,248,236,0.98))] px-0 py-0">
      <div className="flex h-full min-h-0">
        <section className="flex w-[360px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,248,238,0.96))]">
          <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-medium text-[color:var(--text-primary)]">
                  标签
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {tagGroups.length} 个标签 · {taggedFriendCount} 位联系人
                </div>
              </div>
            </div>

            <label className="mt-3 flex items-center gap-2 rounded-[16px] border border-[color:var(--border-faint)] bg-[rgba(255,249,238,0.85)] px-3 py-2.5 text-sm text-[color:var(--text-dim)] shadow-none">
              <Search size={15} className="shrink-0" />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="搜索标签或联系人"
                className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(255,249,238,0.72)] pb-4">
            {notice ? (
              <div className="px-3 pt-3">
                <InlineNotice tone="info">{notice}</InlineNotice>
              </div>
            ) : null}
            {friendsQuery.isLoading ? (
              <div className="px-3 pt-3">
                <LoadingBlock label="正在读取标签..." />
              </div>
            ) : null}
            {friendsQuery.isError && friendsQuery.error instanceof Error ? (
              <div className="px-3 pt-3">
                <ErrorBlock message={friendsQuery.error.message} />
              </div>
            ) : null}
            {conversationsQuery.isError &&
            conversationsQuery.error instanceof Error ? (
              <div className="px-3 pt-3">
                <ErrorBlock message={conversationsQuery.error.message} />
              </div>
            ) : null}
            {blockedQuery.isError && blockedQuery.error instanceof Error ? (
              <div className="px-3 pt-3">
                <ErrorBlock message={blockedQuery.error.message} />
              </div>
            ) : null}

            {!friendsQuery.isLoading &&
            !friendsQuery.isError &&
            !tagGroups.length ? (
              <div className="px-3 pt-6">
                <EmptyState
                  title={
                    searchText.trim()
                      ? "没有找到匹配的标签"
                      : "还没有联系人标签"
                  }
                  description={
                    searchText.trim()
                      ? "换个标签名或联系人名称试试。"
                      : "先在联系人资料里给好友补上标签，标签页会自动聚合。"
                  }
                />
              </div>
            ) : null}

            {tagGroups.length ? (
              <>
                <section className="mt-3 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
                  {tagGroups.map((group, index) => (
                    <button
                      key={group.tag}
                      type="button"
                      onClick={() => setSelectedTag(group.tag)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        index > 0
                          ? "border-t border-[color:var(--border-faint)]"
                          : undefined,
                        selectedTag === group.tag
                          ? "bg-[rgba(7,193,96,0.10)]"
                          : "hover:bg-[rgba(7,193,96,0.05)]",
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#1fc86a,#07c160)] text-white shadow-[0_10px_20px_rgba(7,193,96,0.20)]">
                        <Tag size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {group.tag}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
                          {group.items.length} 位联系人
                        </div>
                      </div>
                    </button>
                  ))}
                </section>

                {selectedGroup ? (
                  <section className="mt-3 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
                    <div className="border-b border-[color:var(--border-faint)] px-4 py-3">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {selectedGroup.tag}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {selectedGroup.items.length} 位联系人
                      </div>
                    </div>

                    {selectedGroup.items.map((item, index) => (
                      <button
                        key={`${selectedGroup.tag}-${item.character.id}`}
                        type="button"
                        onClick={() =>
                          setSelectedCharacterId(item.character.id)
                        }
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          index > 0
                            ? "border-t border-[color:var(--border-faint)]"
                            : undefined,
                          selectedCharacterId === item.character.id
                            ? "bg-[rgba(7,193,96,0.08)]"
                            : "hover:bg-[rgba(7,193,96,0.04)]",
                        )}
                      >
                        <AvatarChip
                          name={item.character.name}
                          src={item.character.avatar}
                          size="wechat"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-[color:var(--text-primary)]">
                            {getFriendDisplayName(item)}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
                            {item.character.name}
                          </div>
                        </div>
                      </button>
                    ))}
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
        </section>

        <section className="min-w-0 flex-1">
          <ContactDetailPane
            character={selectedFriend?.character ?? null}
            friendship={selectedFriend?.friendship ?? null}
            commonGroups={commonGroups}
            onOpenGroup={(groupId) => {
              void navigate({ to: "/group/$groupId", params: { groupId } });
            }}
            onStartChat={
              selectedFriend
                ? () => startChatMutation.mutate(selectedFriend.character.id)
                : undefined
            }
            chatPending={
              selectedFriend?.character.id === startChatMutation.variables
            }
            isPinned={selectedConversation?.isPinned ?? false}
            pinPending={
              pinMutation.isPending &&
              pinMutation.variables?.characterId ===
                selectedFriend?.character.id
            }
            onTogglePinned={
              selectedFriend
                ? () =>
                    pinMutation.mutate({
                      characterId: selectedFriend.character.id,
                      pinned: !(selectedConversation?.isPinned ?? false),
                    })
                : undefined
            }
            isMuted={selectedConversation?.isMuted ?? false}
            mutePending={
              muteMutation.isPending &&
              muteMutation.variables?.characterId ===
                selectedFriend?.character.id
            }
            onToggleMuted={
              selectedFriend
                ? () =>
                    muteMutation.mutate({
                      characterId: selectedFriend.character.id,
                      muted: !(selectedConversation?.isMuted ?? false),
                    })
                : undefined
            }
            isStarred={selectedFriend?.friendship.isStarred ?? false}
            starPending={
              setStarredMutation.isPending &&
              setStarredMutation.variables?.characterId ===
                selectedFriend?.character.id
            }
            onToggleStarred={
              selectedFriend
                ? () =>
                    setStarredMutation.mutate({
                      characterId: selectedFriend.character.id,
                      starred: !selectedFriend.friendship.isStarred,
                    })
                : undefined
            }
            isBlocked={selectedFriendBlocked}
            blockPending={
              blockMutation.isPending &&
              blockMutation.variables?.characterId ===
                selectedFriend?.character.id
            }
            onToggleBlock={
              selectedFriend
                ? () =>
                    blockMutation.mutate({
                      characterId: selectedFriend.character.id,
                      blocked: selectedFriendBlocked,
                    })
                : undefined
            }
            deletePending={
              deleteFriendMutation.isPending &&
              deleteFriendMutation.variables === selectedFriend?.character.id
            }
            onDeleteFriend={
              selectedFriend
                ? () => deleteFriendMutation.mutate(selectedFriend.character.id)
                : undefined
            }
            onOpenProfile={() => {
              if (!selectedFriend) {
                return;
              }

              void navigate({
                to: "/character/$characterId",
                params: { characterId: selectedFriend.character.id },
              });
            }}
          />
        </section>
      </div>
    </AppPage>
  );
}

function buildContactTagGroups(
  friends: FriendListItem[],
  searchText: string,
): ContactTagGroup[] {
  const groups = new Map<string, FriendListItem[]>();

  for (const item of friends) {
    const tags =
      item.friendship.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];

    for (const tag of tags) {
      const currentItems = groups.get(tag) ?? [];
      currentItems.push(item);
      groups.set(tag, currentItems);
    }
  }

  const normalizedSearchText = searchText.trim().toLowerCase();

  return [...groups.entries()]
    .map(([tag, items]) => ({
      tag,
      items: [...items].sort((left, right) =>
        getFriendDisplayName(left).localeCompare(
          getFriendDisplayName(right),
          "zh-CN",
        ),
      ),
    }))
    .filter((group) => {
      if (!normalizedSearchText) {
        return true;
      }

      if (group.tag.toLowerCase().includes(normalizedSearchText)) {
        return true;
      }

      return group.items.some((item) => {
        const displayName = getFriendDisplayName(item).toLowerCase();
        return (
          displayName.includes(normalizedSearchText) ||
          matchesCharacterSearch(item.character, normalizedSearchText)
        );
      });
    })
    .sort((left, right) => left.tag.localeCompare(right.tag, "zh-CN"));
}

function getFriendDisplayName(item: FriendListItem) {
  return item.friendship.remarkName?.trim() || item.character.name;
}

function isDirectConversationForCharacter(
  conversation: ConversationListItem,
  characterId: string,
) {
  return (
    !isPersistedGroupConversation(conversation) &&
    conversation.participants.includes(characterId)
  );
}
