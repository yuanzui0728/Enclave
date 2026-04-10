import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Search, X } from "lucide-react";
import {
  createGroup,
  getConversationMessages,
  getFriends,
  type FriendListItem,
  type Message,
} from "@yinjie/contracts";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import {
  createFriendDirectoryItems,
  type FriendDirectoryItem,
} from "../../contacts/contact-utils";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";

const MAX_SHARED_MESSAGE_COUNT = 100;
const DEFAULT_SHARED_MESSAGE_COUNT = 3;

type DesktopCreateGroupDialogProps = {
  open: boolean;
  conversationId?: string;
  seedMemberIds?: string[];
  onClose: () => void;
};

export function DesktopCreateGroupDialog({
  open,
  conversationId,
  seedMemberIds = [],
  onClose,
}: DesktopCreateGroupDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shareHistory, setShareHistory] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [messageSelectionNotice, setMessageSelectionNotice] = useState<
    string | null
  >(null);
  const [focusedFriendIndex, setFocusedFriendIndex] = useState(0);
  const [focusedMessageIndex, setFocusedMessageIndex] = useState(0);
  const seededSelectionRef = useRef("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const friendItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const messageItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const friendsQuery = useQuery({
    queryKey: ["desktop-create-group-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open,
  });
  const shareableMessagesQuery = useQuery({
    queryKey: ["desktop-create-group-shareable-messages", baseUrl, conversationId],
    queryFn: () =>
      getConversationMessages(conversationId!, baseUrl, {
        limit: MAX_SHARED_MESSAGE_COUNT,
      }),
    enabled: open && Boolean(conversationId),
  });

  const friendItems = useMemo(() => friendsQuery.data ?? [], [friendsQuery.data]);
  const sortedFriendItems = useMemo(
    () => createFriendDirectoryItems(friendItems),
    [friendItems],
  );
  const friendMap = useMemo(
    () =>
      new Map(
        sortedFriendItems.map(
          (item) =>
            [item.character.id, item] satisfies [string, FriendDirectoryItem],
        ),
      ),
    [sortedFriendItems],
  );
  const selectedFriends = useMemo(
    () =>
      selectedIds
        .map((id) => friendMap.get(id))
        .filter((item): item is FriendDirectoryItem => Boolean(item)),
    [friendMap, selectedIds],
  );
  const filteredFriends = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return sortedFriendItems.filter((item) => {
      if (item.friendship.status === "removed") {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        item.character.name,
        item.friendship.remarkName ?? "",
        item.character.relationship ?? "",
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [searchTerm, sortedFriendItems]);
  const defaultGroupName = useMemo(
    () => buildDefaultGroupName(selectedFriends),
    [selectedFriends],
  );
  const shareableMessages = useMemo(
    () =>
      (shareableMessagesQuery.data ?? []).filter(
        (message) => message.type !== "system",
      ),
    [shareableMessagesQuery.data],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createGroup(
        {
          name: defaultGroupName,
          memberIds: selectedIds,
          sourceConversationId:
            shareHistory && selectedMessageIds.length ? conversationId : undefined,
          sharedMessageIds:
            shareHistory && selectedMessageIds.length ? selectedMessageIds : undefined,
        },
        baseUrl,
      ),
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      onClose();
      void navigate({ to: "/group/$groupId", params: { groupId: group.id } });
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
    setSelectedIds([]);
    setShareHistory(false);
    setSelectedMessageIds([]);
    setMessageSelectionNotice(null);
    setFocusedFriendIndex(0);
    setFocusedMessageIndex(0);
    seededSelectionRef.current = "";
    createMutation.reset();
  }, [createMutation, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (!messageSelectionNotice) {
      return;
    }

    const timer = window.setTimeout(() => setMessageSelectionNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [messageSelectionNotice]);

  useEffect(() => {
    if (!open || !shareHistory || selectedMessageIds.length > 0) {
      return;
    }

    if (!shareableMessages.length) {
      return;
    }

    const nextSelection = shareableMessages
      .slice(-DEFAULT_SHARED_MESSAGE_COUNT)
      .map((message) => message.id);
    if (!nextSelection.length) {
      return;
    }

    setSelectedMessageIds(nextSelection);
  }, [open, selectedMessageIds.length, shareHistory, shareableMessages]);

  useEffect(() => {
    if (!filteredFriends.length) {
      setFocusedFriendIndex(0);
      return;
    }

    setFocusedFriendIndex((current) =>
      Math.min(Math.max(current, 0), filteredFriends.length - 1),
    );
  }, [filteredFriends.length]);

  useEffect(() => {
    if (!shareableMessages.length) {
      setFocusedMessageIndex(0);
      return;
    }

    setFocusedMessageIndex((current) =>
      Math.min(Math.max(current, 0), shareableMessages.length - 1),
    );
  }, [shareableMessages.length]);

  useEffect(() => {
    const focusedFriend = filteredFriends[focusedFriendIndex];
    if (!focusedFriend) {
      return;
    }

    friendItemRefs.current[focusedFriend.character.id]?.scrollIntoView({
      block: "nearest",
    });
  }, [filteredFriends, focusedFriendIndex]);

  useEffect(() => {
    const focusedMessage = shareableMessages[focusedMessageIndex];
    if (!focusedMessage) {
      return;
    }

    messageItemRefs.current[focusedMessage.id]?.scrollIntoView({
      block: "nearest",
    });
  }, [focusedMessageIndex, shareableMessages]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const seedKey = seedMemberIds.join(",");
    if (seededSelectionRef.current === seedKey) {
      return;
    }

    if (!seedMemberIds.length) {
      seededSelectionRef.current = seedKey;
      return;
    }

    if (!sortedFriendItems.length) {
      if (!friendsQuery.isLoading) {
        seededSelectionRef.current = seedKey;
      }
      return;
    }

    const validSeedIds = seedMemberIds.filter((id) => friendMap.has(id));
    seededSelectionRef.current = seedKey;

    if (!validSeedIds.length) {
      return;
    }

    setSelectedIds((current) => {
      const restIds = current.filter((id) => !validSeedIds.includes(id));
      return [...validSeedIds, ...restIds];
    });
  }, [
    friendMap,
    friendsQuery.isLoading,
    open,
    seedMemberIds,
    sortedFriendItems.length,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || createMutation.isPending) {
        return;
      }

      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createMutation.isPending, onClose, open]);

  const toggleSelection = (characterId: string) => {
    setSelectedIds((current) =>
      current.includes(characterId)
        ? current.filter((item) => item !== characterId)
        : [...current, characterId],
    );
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessageIds((current) => {
      if (current.includes(messageId)) {
        return current.filter((item) => item !== messageId);
      }

      if (current.length >= MAX_SHARED_MESSAGE_COUNT) {
        setMessageSelectionNotice(
          `最多选择 ${MAX_SHARED_MESSAGE_COUNT} 条聊天记录。`,
        );
        return current;
      }

      return [...current, messageId];
    });
  };

  const applyMessageSelection = (messageIds: string[]) => {
    const dedupedIds = [...new Set(messageIds)];
    if (dedupedIds.length > MAX_SHARED_MESSAGE_COUNT) {
      setMessageSelectionNotice(
        `最多选择 ${MAX_SHARED_MESSAGE_COUNT} 条聊天记录。`,
      );
    }

    setSelectedMessageIds(dedupedIds.slice(0, MAX_SHARED_MESSAGE_COUNT));
  };

  const handleCreate = () => {
    if (!selectedIds.length || createMutation.isPending) {
      return;
    }

    createMutation.mutate();
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      /^[a-z]$/i.test(event.key)
    ) {
      const nextIndex = findFriendIndexByJumpKey(
        filteredFriends,
        event.key.toUpperCase(),
      );
      if (nextIndex !== -1) {
        event.preventDefault();
        setFocusedFriendIndex(nextIndex);
        searchInputRef.current?.focus();
      }
      return;
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      event.key === "Enter" &&
      selectedIds.length &&
      !createMutation.isPending
    ) {
      event.preventDefault();
      handleCreate();
    }
  };

  const handleSearchKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "ArrowDown") {
      if (!filteredFriends.length) {
        return;
      }

      event.preventDefault();
      setFocusedFriendIndex((current) =>
        current >= filteredFriends.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      if (!filteredFriends.length) {
        return;
      }

      event.preventDefault();
      setFocusedFriendIndex((current) =>
        current <= 0 ? filteredFriends.length - 1 : current - 1,
      );
      return;
    }

    if (
      event.key === "Backspace" &&
      !searchTerm.trim() &&
      selectedIds.length &&
      !createMutation.isPending
    ) {
      event.preventDefault();
      setSelectedIds((current) => current.slice(0, -1));
      return;
    }

    if (event.key === "Enter") {
      const focusedFriend = filteredFriends[focusedFriendIndex];
      if (!focusedFriend || createMutation.isPending) {
        return;
      }

      event.preventDefault();
      toggleSelection(focusedFriend.character.id);
    }
  };

  const handleSharedMessagesKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (!shareableMessages.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedMessageIndex((current) =>
        current >= shareableMessages.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedMessageIndex((current) =>
        current <= 0 ? shareableMessages.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      const focusedMessage = shareableMessages[focusedMessageIndex];
      if (!focusedMessage) {
        return;
      }

      event.preventDefault();
      toggleMessageSelection(focusedMessage.id);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.24)] p-6">
      <button
        type="button"
        aria-label="关闭发起群聊弹层"
        onClick={() => {
          if (!createMutation.isPending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <div
        className="relative flex h-[min(720px,82vh)] w-full max-w-[640px] flex-col overflow-hidden rounded-[20px] border border-black/8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
          <div>
            <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
              发起群聊
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              群名称会按成员自动生成，创建后可在聊天信息里修改。
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!createMutation.isPending) {
                onClose();
              }
            }}
            disabled={createMutation.isPending}
            aria-label="关闭"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/6 text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-black/6 px-6 py-4">
          {seedMemberIds.length ? (
            <div className="mb-3 rounded-[12px] bg-[#f3fff8] px-3 py-2.5 text-[12px] leading-5 text-[#2f7a4c]">
              已按当前聊天默认勾选对方，你可以继续添加其他联系人。
            </div>
          ) : null}

          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
            />
            <input
              ref={searchInputRef}
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜索联系人"
              className="h-11 w-full rounded-[12px] border border-black/8 bg-[#f8f8f8] pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-black/12 focus:bg-white"
            />
          </label>

          <div className="mt-3 min-h-9">
            {selectedFriends.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedFriends.map((item) => {
                  const displayName = getFriendDisplayName(item);
                  return (
                    <button
                      key={item.character.id}
                      type="button"
                      onClick={() => toggleSelection(item.character.id)}
                      className="flex items-center gap-2 rounded-full bg-[#f1f1f1] px-3 py-1.5 text-left text-[12px] text-[color:var(--text-primary)] transition hover:bg-[#e9e9e9]"
                    >
                      <AvatarChip
                        name={displayName}
                        src={item.character.avatar}
                        size="sm"
                      />
                      <span className="max-w-24 truncate">{displayName}</span>
                      <X size={12} className="text-[color:var(--text-muted)]" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-[color:var(--text-muted)]">
                先选择联系人，再开始一个新的群聊。
              </div>
            )}
          </div>

          {conversationId ? (
            <div className="mt-4 rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-3">
              <label className="flex items-start gap-3 text-left">
                <input
                  type="checkbox"
                  checked={shareHistory}
                  onChange={(event) => {
                    const nextChecked = event.target.checked;
                    setShareHistory(nextChecked);
                    setMessageSelectionNotice(null);
                    if (!nextChecked) {
                      setSelectedMessageIds([]);
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-black/20 text-[#07c160] focus:ring-[#07c160]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[color:var(--text-primary)]">
                    分享聊天记录
                  </span>
                  <span className="mt-1 block text-[12px] leading-5 text-[color:var(--text-muted)]">
                    从当前单聊里挑选几条最近消息，一并带进新群。
                  </span>
                </span>
              </label>

              {shareHistory ? (
                <div className="mt-3">
                  {messageSelectionNotice ? (
                    <InlineNotice className="mb-3 text-xs" tone="muted">
                      {messageSelectionNotice}
                    </InlineNotice>
                  ) : null}
                  {shareableMessagesQuery.isLoading ? (
                    <LoadingBlock
                      className="px-0 py-3 text-left"
                      label="正在读取最近聊天记录..."
                    />
                  ) : null}
                  {shareableMessagesQuery.isError &&
                  shareableMessagesQuery.error instanceof Error ? (
                    <ErrorBlock message={shareableMessagesQuery.error.message} />
                  ) : null}
                  {!shareableMessagesQuery.isLoading &&
                  !shareableMessagesQuery.isError &&
                  !shareableMessages.length ? (
                    <div className="rounded-[10px] bg-white px-3 py-3 text-[12px] text-[color:var(--text-muted)]">
                      当前单聊里还没有可分享的消息。
                    </div>
                  ) : null}
                  {!shareableMessagesQuery.isLoading &&
                  !shareableMessagesQuery.isError &&
                  shareableMessages.length ? (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-[12px] text-[color:var(--text-muted)]">
                          已选择 {selectedMessageIds.length} /{" "}
                          {Math.min(
                            MAX_SHARED_MESSAGE_COUNT,
                            shareableMessages.length,
                          )} 条
                        </div>
                        <div className="flex items-center gap-2 text-[12px]">
                          <button
                            type="button"
                            onClick={() =>
                              applyMessageSelection(
                                shareableMessages
                                  .slice(-DEFAULT_SHARED_MESSAGE_COUNT)
                                  .map((message) => message.id),
                              )
                            }
                            className="text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
                          >
                            最近{DEFAULT_SHARED_MESSAGE_COUNT}条
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              applyMessageSelection(
                                shareableMessages.map((message) => message.id),
                              )
                            }
                            className="text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
                          >
                            全选
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedMessageIds([])}
                            className="text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
                          >
                            清空
                          </button>
                        </div>
                      </div>
                      <div
                        tabIndex={0}
                        onKeyDown={handleSharedMessagesKeyDown}
                        className="max-h-56 space-y-1 overflow-auto rounded-[10px] bg-white p-1.5 outline-none ring-offset-0 focus:ring-2 focus:ring-[rgba(7,193,96,0.22)]"
                        aria-label="可分享聊天记录列表"
                      >
                        {shareableMessages.map((message) => {
                          const checked = selectedMessageIds.includes(message.id);
                          const focused =
                            focusedMessageIndex ===
                            shareableMessages.findIndex(
                              (item) => item.id === message.id,
                            );
                          return (
                            <button
                              key={message.id}
                              type="button"
                              ref={(node) => {
                                messageItemRefs.current[message.id] = node;
                              }}
                              onClick={() => toggleMessageSelection(message.id)}
                              className={cn(
                                "flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition",
                                checked
                                  ? "bg-[rgba(7,193,96,0.08)]"
                                  : "hover:bg-[#f7f7f7]",
                                focused
                                  ? "ring-1 ring-[rgba(7,193,96,0.24)]"
                                  : "",
                              )}
                            >
                              <div
                                className={cn(
                                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                                  checked
                                    ? "border-[#07c160] bg-[#07c160] text-white"
                                    : "border-black/10 bg-[#f5f5f5] text-transparent",
                                )}
                              >
                                <Check size={12} strokeWidth={2.8} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] font-medium text-[color:var(--text-primary)]">
                                    {message.senderName}
                                  </span>
                                  <span className="text-[11px] text-[color:var(--text-dim)]">
                                    {formatMessageTypeLabel(message)}
                                  </span>
                                </div>
                                <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">
                                  {getMessagePreviewText(message)}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          {friendsQuery.isLoading ? (
            <LoadingBlock className="px-3 py-4 text-left" label="正在读取联系人..." />
          ) : null}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? (
            <div className="px-3 py-2">
              <ErrorBlock message={friendsQuery.error.message} />
            </div>
          ) : null}
          {createMutation.isError && createMutation.error instanceof Error ? (
            <div className="px-3 py-2">
              <ErrorBlock message={createMutation.error.message} />
            </div>
          ) : null}

          {!friendsQuery.isLoading &&
          !friendsQuery.isError &&
          !friendItems.length ? (
            <div className="px-3 py-8">
              <EmptyState
                title="还没有可拉进群的人"
                description="先去通讯录里建立一些关系，再回来创建群聊。"
              />
            </div>
          ) : null}

          {!friendsQuery.isLoading &&
          !friendsQuery.isError &&
          friendItems.length > 0 &&
          !filteredFriends.length ? (
            <div className="px-3 py-8">
              <EmptyState
                title="没有匹配的联系人"
                description="换个名字、备注名或关系关键词试试。"
              />
            </div>
          ) : null}

          <div className="space-y-1">
            {filteredFriends.map((item, index) => {
              const displayName = getFriendDisplayName(item);
              const checked = selectedIds.includes(item.character.id);
              const focused = index === focusedFriendIndex;
              return (
                <button
                  key={item.character.id}
                  type="button"
                  ref={(node) => {
                    friendItemRefs.current[item.character.id] = node;
                  }}
                  disabled={createMutation.isPending}
                  onClick={() => toggleSelection(item.character.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[12px] px-4 py-3 text-left transition disabled:opacity-60",
                    checked
                      ? "bg-[rgba(7,193,96,0.08)]"
                      : "hover:bg-[#f7f7f7]",
                    focused ? "ring-1 ring-[rgba(7,193,96,0.24)]" : "",
                  )}
                >
                  <AvatarChip
                    name={displayName}
                    src={item.character.avatar}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] text-[color:var(--text-primary)]">
                      {displayName}
                    </div>
                    <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
                      {item.character.relationship || "世界联系人"}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      checked
                        ? "border-[#07c160] bg-[#07c160] text-white"
                        : "border-black/10 bg-[#f5f5f5] text-transparent",
                    )}
                  >
                    <Check size={12} strokeWidth={2.8} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-black/6 px-6 py-4">
          <div className="text-[12px] text-[color:var(--text-muted)]">
            已选择 {selectedIds.length} 位成员
            {selectedIds.length ? `，将创建“${defaultGroupName}”。` : "。"}
            {shareHistory && selectedMessageIds.length
              ? ` 会同步 ${selectedMessageIds.length} 条聊天记录。`
              : ""}
            {" "}快捷键：`↑/↓` 选联系人，`Enter` 勾选，`Backspace` 删除最后一个已选，`Alt+字母` 首字母跳转，`Ctrl/Cmd+Enter` 创建。
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="rounded-2xl"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleCreate}
              disabled={!selectedIds.length || createMutation.isPending}
              className="rounded-2xl px-6"
            >
              {createMutation.isPending ? "正在创建..." : "创建群聊"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getMessagePreviewText(message: Message) {
  if (message.type === "image") {
    return message.text.trim() || "[图片]";
  }

  if (message.type === "file") {
    return message.attachment?.kind === "file"
      ? `[文件] ${message.attachment.fileName}`
      : "[文件]";
  }

  if (message.type === "voice") {
    return message.text.trim() || "[语音]";
  }

  if (message.type === "contact_card") {
    return message.attachment?.kind === "contact_card"
      ? `[名片] ${message.attachment.name}`
      : "[名片]";
  }

  if (message.type === "location_card") {
    return message.attachment?.kind === "location_card"
      ? `[位置] ${message.attachment.title}`
      : "[位置]";
  }

  if (message.type === "sticker") {
    return message.attachment?.kind === "sticker"
      ? `[表情] ${message.attachment.label ?? message.attachment.stickerId}`
      : "[表情]";
  }

  if (message.type === "system") {
    return message.text.trim() || "[系统消息]";
  }

  return message.text.trim() || "[文本消息]";
}

function formatMessageTypeLabel(message: Message) {
  if (message.type === "text" || message.type === "proactive") {
    return "文字";
  }

  if (message.type === "system") {
    return "系统";
  }

  if (message.type === "sticker") {
    return "表情";
  }

  if (message.type === "image") {
    return "图片";
  }

  if (message.type === "file") {
    return "文件";
  }

  if (message.type === "voice") {
    return "语音";
  }

  if (message.type === "contact_card") {
    return "名片";
  }

  return "位置";
}

function buildDefaultGroupName(
  items: Array<Pick<FriendListItem, "friendship" | "character">>,
) {
  const names = items
    .map((item) => getFriendDisplayName(item))
    .filter(Boolean)
    .slice(0, 3);

  if (!names.length) {
    return "临时群聊";
  }

  if (items.length > 3) {
    return `${names.join("、")}等${items.length}人`;
  }

  return names.join("、");
}

function getFriendDisplayName(
  item: Pick<FriendListItem, "friendship" | "character">,
) {
  return item.friendship.remarkName?.trim() || item.character.name;
}

function findFriendIndexByJumpKey(
  items: FriendDirectoryItem[],
  jumpKey: string,
) {
  const normalizedKey = jumpKey.trim().toUpperCase();
  if (!normalizedKey) {
    return -1;
  }

  const sectionMatchIndex = items.findIndex(
    (item) => item.indexLabel.toUpperCase() === normalizedKey,
  );
  if (sectionMatchIndex !== -1) {
    return sectionMatchIndex;
  }

  return items.findIndex((item) =>
    getFriendDisplayName(item).trim().toUpperCase().startsWith(normalizedKey),
  );
}
