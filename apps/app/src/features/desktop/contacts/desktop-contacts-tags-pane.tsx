import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
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
} from "@yinjie/contracts";
import { Search, Tag } from "lucide-react";
import { ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { buildCharacterDetailRouteHash } from "../../contacts/character-detail-route-state";
import {
  buildDesktopContactsRouteHash,
  parseDesktopContactsRouteState,
} from "../../contacts/contacts-route-state";
import { buildDesktopChatThreadPath } from "../chat/desktop-chat-route-state";
import { buildContactTagGroups } from "../../contacts/contact-tag-groups";
import { ContactDetailPane } from "../../contacts/contact-detail-pane";
import { getFriendDisplayName } from "../../contacts/contact-utils";
import { buildDesktopFriendMomentsRouteHash } from "../../moments/friend-moments-route-state";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function DesktopContactsTagsPane() {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = useMemo(() => parseDesktopContactsRouteState(hash), [hash]);
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const routeSelectedTag = routeState.pane === "tags" ? (routeState.tag ?? null) : null;
  const routeSelectedCharacterId =
    routeState.pane === "tags" ? (routeState.characterId ?? null) : null;
  const [searchText, setSearchText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(
    () => routeSelectedTag,
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState<
    string | null
  >(() => routeSelectedCharacterId);

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
      void navigate({
        to: buildDesktopChatThreadPath({
          conversationId: conversation.id,
        }),
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
      const selectedConversation =
        (conversationsQuery.data ?? []).find((conversation) =>
          isDirectConversationForCharacter(conversation, characterId),
        ) ?? null;
      const conversationId =
        selectedConversation?.id ??
        (await getOrCreateConversation({ characterId }, baseUrl)).id;

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
      const selectedConversation =
        (conversationsQuery.data ?? []).find((conversation) =>
          isDirectConversationForCharacter(conversation, characterId),
        ) ?? null;
      const conversationId =
        selectedConversation?.id ??
        (await getOrCreateConversation({ characterId }, baseUrl)).id;

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
    onSuccess: async (_, characterId) => {
      setNotice("已从通讯录删除联系人。");
      setSelectedCharacterId((current) =>
        current === characterId ? null : current,
      );
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
  const routeCharacterGroup = useMemo(
    () =>
      routeSelectedCharacterId
        ? (tagGroups.find((group) =>
            group.items.some(
              (item) => item.character.id === routeSelectedCharacterId,
            ),
          ) ?? null)
        : null,
    [routeSelectedCharacterId, tagGroups],
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
    setSelectedTag((current) =>
      current === routeSelectedTag ? current : routeSelectedTag,
    );
  }, [routeSelectedTag]);

  useEffect(() => {
    setSelectedCharacterId((current) =>
      current === routeSelectedCharacterId ? current : routeSelectedCharacterId,
    );
  }, [routeSelectedCharacterId]);

  useEffect(() => {
    if (
      selectedGroup &&
      tagGroups.some((group) => group.tag === selectedGroup.tag)
    ) {
      return;
    }

    setSelectedTag(routeCharacterGroup?.tag ?? tagGroups[0]?.tag ?? null);
  }, [routeCharacterGroup, selectedGroup, tagGroups]);

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

  useEffect(() => {
    if (routeState.pane !== "tags") {
      return;
    }

    const nextHash = buildDesktopContactsRouteHash({
      pane: "tags",
      tag: selectedTag ?? undefined,
      characterId: selectedCharacterId ?? undefined,
      showWorldCharacters: routeState.showWorldCharacters,
    });

    if ((nextHash ?? "") === normalizedHash) {
      return;
    }

    void navigate({
      to: "/tabs/contacts",
      hash: nextHash,
      replace: true,
    });
  }, [
    navigate,
    normalizedHash,
    routeState.pane,
    routeState.showWorldCharacters,
    selectedCharacterId,
    selectedTag,
  ]);

  const taggedFriendCount = useMemo(
    () =>
      new Set(
        tagGroups.flatMap((group) =>
          group.items.map((item) => item.character.id),
        ),
      ).size,
    [tagGroups],
  );
  const actionError =
    startChatMutation.error instanceof Error
      ? startChatMutation.error.message
      : setStarredMutation.error instanceof Error
        ? setStarredMutation.error.message
        : pinMutation.error instanceof Error
          ? pinMutation.error.message
          : muteMutation.error instanceof Error
            ? muteMutation.error.message
            : blockMutation.error instanceof Error
              ? blockMutation.error.message
              : deleteFriendMutation.error instanceof Error
                ? deleteFriendMutation.error.message
                : null;

  return (
    <div className="flex h-full min-h-0">
      <section className="flex w-[360px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
        <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-4 py-4 backdrop-blur-xl">
          <div className="text-base font-medium text-[color:var(--text-primary)]">
            标签
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {tagGroups.length} 个标签 · {taggedFriendCount} 位联系人
          </div>

          <label className="mt-3 flex items-center gap-2 rounded-[16px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-sm text-[color:var(--text-dim)] shadow-none">
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

        <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] pb-4">
          {notice ? (
            <div className="px-3 pt-3">
              <InlineNotice tone="info">{notice}</InlineNotice>
            </div>
          ) : null}
          {actionError ? (
            <div className="px-3 pt-3">
              <ErrorBlock message={actionError} />
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
                  searchText.trim() ? "没有找到匹配的标签" : "还没有联系人标签"
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
              <section className="mx-3 mt-3 overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
                {tagGroups.map((group, index) => (
                  <button
                    key={group.tag}
                    type="button"
                    onClick={() => {
                      setSelectedTag(group.tag);
                      setSelectedCharacterId(group.items[0]?.character.id ?? null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                      index > 0
                        ? "border-t border-[color:var(--border-faint)]"
                        : undefined,
                      selectedTag === group.tag
                        ? "bg-[rgba(7,193,96,0.10)]"
                        : "hover:bg-[color:var(--surface-console)]",
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)] text-[#17803d]">
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
                <section className="mx-3 mt-3 overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
                  <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-4 py-3 backdrop-blur-xl">
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
                      onClick={() => setSelectedCharacterId(item.character.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        index > 0
                          ? "border-t border-[color:var(--border-faint)]"
                          : undefined,
                        selectedCharacterId === item.character.id
                          ? "bg-[rgba(7,193,96,0.08)]"
                          : "hover:bg-[color:var(--surface-console)]",
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
                        {getFriendDisplayName(item) !== item.character.name ? (
                          <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
                            {item.character.name}
                          </div>
                        ) : null}
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
            void navigate({
              to: buildDesktopChatThreadPath({
                conversationId: groupId,
              }),
            });
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
            pinMutation.variables?.characterId === selectedFriend?.character.id
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
            muteMutation.variables?.characterId === selectedFriend?.character.id
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
          onOpenMoments={
            selectedFriend
              ? () => {
                  void navigate({
                    to: "/desktop/friend-moments/$characterId",
                    params: { characterId: selectedFriend.character.id },
                    hash: buildDesktopFriendMomentsRouteHash({
                      source: "tags",
                      returnPath: "/tabs/contacts",
                      returnHash: buildDesktopContactsRouteHash({
                        pane: "tags",
                        tag: selectedTag ?? undefined,
                        characterId: selectedFriend.character.id,
                        showWorldCharacters: routeState.showWorldCharacters,
                      }),
                    }),
                  });
                }
              : undefined
          }
          onOpenProfile={() => {
            if (!selectedFriend) {
              return;
            }

            void navigate({
              to: "/character/$characterId",
              params: { characterId: selectedFriend.character.id },
              hash: buildCharacterDetailRouteHash({
                returnPath: "/tabs/contacts",
                returnHash: buildDesktopContactsRouteHash({
                  pane: "tags",
                  tag: selectedTag ?? undefined,
                  characterId: selectedFriend.character.id,
                  showWorldCharacters: routeState.showWorldCharacters,
                }),
              }),
            });
          }}
        />
      </section>
    </div>
  );
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
