import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search, Star } from "lucide-react";
import {
  getFriends,
  getOrCreateConversation,
  setFriendStarred,
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
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function StarredFriendsPage() {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopStarredFriendsPage />;
  }

  return <MobileStarredFriendsPage />;
}

function MobileStarredFriendsPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const starredFriends = useMemo(
    () =>
      (friendsQuery.data ?? [])
        .filter((item) => item.friendship.isStarred)
        .sort(compareStarredFriends),
    [friendsQuery.data],
  );
  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredFriends = useMemo(() => {
    if (!normalizedSearchText) {
      return starredFriends;
    }

    return starredFriends.filter((item) =>
      matchesCharacterSearch(item.character, normalizedSearchText),
    );
  }, [normalizedSearchText, starredFriends]);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="星标朋友"
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,248,239,0.94))] px-4 py-3 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)]"
            onClick={() => {
              void navigate({ to: "/tabs/contacts" });
            }}
            aria-label="返回通讯录"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      >
        <div className="pt-3">
          <label className="flex items-center gap-2 rounded-[10px] border border-[color:var(--border-faint)] bg-[rgba(255,249,238,0.85)] px-3 py-2.5 text-sm text-[color:var(--text-dim)]">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索星标朋友"
              className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {friendsQuery.isLoading ? (
          <div className="px-3 pt-3">
            <LoadingBlock label="正在读取星标朋友..." />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={friendsQuery.error.message} />
          </div>
        ) : null}

        {!friendsQuery.isLoading && !friendsQuery.isError && !filteredFriends.length ? (
          <div className="px-3 pt-6">
            <EmptyState
              title={normalizedSearchText ? "没有找到匹配的星标朋友" : "还没有星标朋友"}
              description={
                normalizedSearchText
                  ? "换个关键词再试试。"
                  : "先去联系人资料里把常联系的好友设为星标朋友。"
              }
            />
          </div>
        ) : null}

        {filteredFriends.length ? (
          <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {filteredFriends.map((item, index) => (
              <button
                key={item.character.id}
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/character/$characterId",
                    params: { characterId: item.character.id },
                  });
                }}
                className={cn(
                  "flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] px-4 py-3 text-left transition-colors hover:bg-[rgba(249,115,22,0.05)]",
                  index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
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
                    {item.character.currentStatus?.trim() ||
                      `${item.character.relationship} · 亲密度 ${item.friendship.intimacyLevel}`}
                  </div>
                </div>
                <Star
                  size={16}
                  className="shrink-0 text-[#f59e0b]"
                  fill="currentColor"
                />
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </AppPage>
  );
}

function DesktopStarredFriendsPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null,
  );

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
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
      await friendsQuery.refetch();
    },
  });

  const starredFriends = useMemo(
    () =>
      (friendsQuery.data ?? [])
        .filter((item) => item.friendship.isStarred)
        .sort(compareStarredFriends),
    [friendsQuery.data],
  );
  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredFriends = useMemo(() => {
    if (!normalizedSearchText) {
      return starredFriends;
    }

    return starredFriends.filter((item) =>
      matchesCharacterSearch(item.character, normalizedSearchText),
    );
  }, [normalizedSearchText, starredFriends]);
  const selectedFriend = useMemo(
    () =>
      filteredFriends.find((item) => item.character.id === selectedCharacterId) ??
      null,
    [filteredFriends, selectedCharacterId],
  );

  useEffect(() => {
    if (selectedFriend) {
      return;
    }

    setSelectedCharacterId(filteredFriends[0]?.character.id ?? null);
  }, [filteredFriends, selectedFriend]);

  return (
    <AppPage className="h-full min-h-0 space-y-0 bg-[linear-gradient(180deg,rgba(255,252,245,0.96),rgba(255,248,236,0.98))] px-0 py-0">
      <div className="flex h-full min-h-0">
        <section className="flex w-[340px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,248,238,0.96))]">
          <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-medium text-[color:var(--text-primary)]">
                  星标朋友
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {starredFriends.length} 位联系人
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  void navigate({ to: "/tabs/contacts" });
                }}
              >
                返回通讯录
              </Button>
            </div>

            <label className="mt-3 flex items-center gap-2 rounded-[16px] border border-[color:var(--border-faint)] bg-[rgba(255,249,238,0.85)] px-3 py-2.5 text-sm text-[color:var(--text-dim)] shadow-none">
              <Search size={15} className="shrink-0" />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="搜索星标朋友"
                className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(255,249,238,0.72)] pb-4">
            {notice ? (
              <div className="px-3 pt-3">
                <InlineNotice tone="success">{notice}</InlineNotice>
              </div>
            ) : null}
            {friendsQuery.isLoading ? (
              <LoadingBlock
                className="px-4 py-6 text-left"
                label="正在读取星标朋友..."
              />
            ) : null}
            {friendsQuery.isError && friendsQuery.error instanceof Error ? (
              <div className="px-3 pt-3">
                <ErrorBlock message={friendsQuery.error.message} />
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

            {!friendsQuery.isLoading &&
            !friendsQuery.isError &&
            !filteredFriends.length ? (
              <div className="px-3 pt-3">
                <EmptyState
                  title={normalizedSearchText ? "没有找到匹配的星标朋友" : "还没有星标朋友"}
                  description={
                    normalizedSearchText
                      ? "换个关键词再试试。"
                      : "去联系人资料页把常联系的好友设为星标朋友。"
                  }
                />
              </div>
            ) : null}

            {filteredFriends.length ? (
              <section className="mt-3 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
                {filteredFriends.map((item, index) => (
                  <button
                    key={item.character.id}
                    type="button"
                    onClick={() => setSelectedCharacterId(item.character.id)}
                    onDoubleClick={() =>
                      startChatMutation.mutate(item.character.id)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] px-4 py-3.5 text-left transition-colors hover:bg-[rgba(249,115,22,0.05)]",
                      index > 0
                        ? "border-t border-[color:var(--border-faint)]"
                        : undefined,
                      selectedCharacterId === item.character.id
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
                        {startChatMutation.isPending &&
                        startChatMutation.variables === item.character.id
                          ? "正在打开会话..."
                          : item.character.currentStatus?.trim() ||
                            `${item.character.relationship} · 亲密度 ${item.friendship.intimacyLevel}`}
                      </div>
                    </div>
                    <Star
                      size={16}
                      className="shrink-0 text-[#f59e0b]"
                      fill="currentColor"
                    />
                  </button>
                ))}
              </section>
            ) : null}
          </div>
        </section>

        <section className="min-w-0 flex-1">
          <ContactDetailPane
            character={selectedFriend?.character ?? null}
            friendship={selectedFriend?.friendship ?? null}
            onStartChat={
              selectedFriend
                ? () => startChatMutation.mutate(selectedFriend.character.id)
                : undefined
            }
            chatPending={startChatMutation.variables === selectedFriend?.character.id}
            isStarred={selectedFriend?.friendship.isStarred ?? false}
            starPending={
              setStarredMutation.isPending &&
              setStarredMutation.variables?.characterId === selectedFriend?.character.id
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

function compareStarredFriends(left: FriendListItem, right: FriendListItem) {
  const starredAtDelta =
    getSortableTimestamp(right.friendship.starredAt) -
    getSortableTimestamp(left.friendship.starredAt);

  if (starredAtDelta !== 0) {
    return starredAtDelta;
  }

  const nameDiff = left.character.name.localeCompare(
    right.character.name,
    "zh-CN",
  );
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return left.character.id.localeCompare(right.character.id);
}

function getSortableTimestamp(value?: string) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
