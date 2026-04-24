import {
  useCallback,
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
  buildContactSections,
  createFriendDirectoryItems,
  getFriendDisplayName,
  matchesFriendSearch,
  type FriendDirectoryItem,
} from "../../contacts/contact-utils";
import { resolveMessageSemanticPreview } from "../../../lib/message-attachment-semantic";
import { buildDesktopChatThreadPath } from "./desktop-chat-route-state";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";

const MAX_SHARED_MESSAGE_COUNT = 100;
const DEFAULT_SHARED_MESSAGE_COUNT = 3;
const SHARE_HISTORY_PRESET_COUNTS = [
  DEFAULT_SHARED_MESSAGE_COUNT,
  5,
  9,
] as const;

type DesktopCreateGroupDialogProps = {
  open: boolean;
  conversationId?: string;
  seedMemberIds?: string[];
  onClose: () => void;
  onCreated?: (groupId: string) => void;
};

export function DesktopCreateGroupDialog({
  open,
  conversationId,
  seedMemberIds = [],
  onClose,
  onCreated,
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
  const friendListScrollRef = useRef<HTMLDivElement | null>(null);
  const friendItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const messageItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const friendsQuery = useQuery({
    queryKey: ["desktop-create-group-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open,
  });
  const shareableMessagesQuery = useQuery({
    queryKey: [
      "desktop-create-group-shareable-messages",
      baseUrl,
      conversationId,
    ],
    queryFn: () =>
      getConversationMessages(conversationId!, baseUrl, {
        limit: MAX_SHARED_MESSAGE_COUNT,
      }),
    enabled: open && Boolean(conversationId),
  });

  const friendItems = useMemo(
    () => friendsQuery.data ?? [],
    [friendsQuery.data],
  );
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
  const sourceFriend = useMemo(
    () => seedMemberIds.map((id) => friendMap.get(id)).find(Boolean) ?? null,
    [friendMap, seedMemberIds],
  );
  const sourceFriendId = sourceFriend?.character.id ?? null;
  const sourceFriendName = sourceFriend
    ? getFriendDisplayName(sourceFriend)
    : null;
  const filteredFriends = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return sortedFriendItems.filter((item) => {
      if (item.friendship.status === "removed") {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return matchesFriendSearch(item, keyword);
    });
  }, [searchTerm, sortedFriendItems]);
  const pinnedSourceFriend = useMemo(
    () =>
      sourceFriendId
        ? (filteredFriends.find(
            (item) => item.character.id === sourceFriendId,
          ) ?? null)
        : null,
    [filteredFriends, sourceFriendId],
  );
  const directoryFriends = useMemo(
    () =>
      sourceFriendId
        ? filteredFriends.filter((item) => item.character.id !== sourceFriendId)
        : filteredFriends,
    [filteredFriends, sourceFriendId],
  );
  const orderedFilteredFriends = useMemo(
    () =>
      pinnedSourceFriend
        ? [pinnedSourceFriend, ...directoryFriends]
        : directoryFriends,
    [directoryFriends, pinnedSourceFriend],
  );
  const friendSections = useMemo(
    () => buildContactSections(directoryFriends),
    [directoryFriends],
  );
  const friendPositionMap = useMemo(
    () =>
      new Map(
        orderedFilteredFriends.map(
          (item, index) =>
            [item.character.id, index] satisfies [string, number],
        ),
      ),
    [orderedFilteredFriends],
  );
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
  const shareableMessageSections = useMemo(
    () => buildShareableMessageSections(shareableMessages),
    [shareableMessages],
  );
  const shareableMessagePositionMap = useMemo(
    () =>
      new Map(
        shareableMessages.map(
          (message, index) => [message.id, index] satisfies [string, number],
        ),
      ),
    [shareableMessages],
  );
  const createMutation = useMutation({
    mutationFn: () =>
      createGroup(
        {
          name: defaultGroupName,
          memberIds: selectedIds,
          sourceConversationId:
            shareHistory && selectedMessageIds.length
              ? conversationId
              : undefined,
          sharedMessageIds:
            shareHistory && selectedMessageIds.length
              ? selectedMessageIds
              : undefined,
        },
        baseUrl,
      ),
    onSuccess: async (group) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-contact-groups", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      if (onCreated) {
        onCreated(group.id);
        return;
      }
      onClose();
      void navigate({
        to: buildDesktopChatThreadPath({
          conversationId: group.id,
        }),
      });
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

    const timer = window.setTimeout(
      () => setMessageSelectionNotice(null),
      2200,
    );
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
    if (!orderedFilteredFriends.length) {
      setFocusedFriendIndex(0);
      return;
    }

    setFocusedFriendIndex((current) =>
      Math.min(Math.max(current, 0), orderedFilteredFriends.length - 1),
    );
  }, [orderedFilteredFriends.length]);

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
    const resolvedFocusedFriend =
      orderedFilteredFriends[focusedFriendIndex] ?? focusedFriend;
    if (!resolvedFocusedFriend) {
      return;
    }

    friendItemRefs.current[resolvedFocusedFriend.character.id]?.scrollIntoView({
      block: "nearest",
    });
  }, [filteredFriends, focusedFriendIndex, orderedFilteredFriends]);

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

  const clearSearch = useCallback(() => {
    setSearchTerm("");
    setFocusedFriendIndex(0);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || createMutation.isPending) {
        return;
      }

      if (searchTerm.trim()) {
        clearSearch();
        return;
      }

      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSearch, createMutation.isPending, onClose, open, searchTerm]);

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

  const selectRecentMessages = (count: number) => {
    applyMessageSelection(
      shareableMessages.slice(-Math.max(0, count)).map((message) => message.id),
    );
  };

  const handleCreate = () => {
    if (!selectedIds.length || createMutation.isPending) {
      return;
    }

    createMutation.mutate();
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      shareHistory &&
      !event.metaKey &&
      !event.ctrlKey &&
      event.altKey &&
      /^[1-9]$/.test(event.key)
    ) {
      event.preventDefault();
      selectRecentMessages(Number(event.key));
      return;
    }

    if (
      event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      /^[a-z]$/i.test(event.key)
    ) {
      const nextIndex = findFriendIndexByJumpKey(
        orderedFilteredFriends,
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

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && searchTerm.trim()) {
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
      return;
    }

    if (event.key === "ArrowDown") {
      if (!orderedFilteredFriends.length) {
        return;
      }

      event.preventDefault();
      setFocusedFriendIndex((current) =>
        current >= orderedFilteredFriends.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      if (!orderedFilteredFriends.length) {
        return;
      }

      event.preventDefault();
      setFocusedFriendIndex((current) =>
        current <= 0 ? orderedFilteredFriends.length - 1 : current - 1,
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
      const focusedFriend = orderedFilteredFriends[focusedFriendIndex];
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

    if (event.altKey && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      selectRecentMessages(Number(event.key));
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

  const renderFriendRow = (item: FriendDirectoryItem) => {
    const displayName = getFriendDisplayName(item);
    const aliasName =
      item.friendship.remarkName?.trim() &&
      item.friendship.remarkName.trim() !== item.character.name
        ? item.character.name
        : null;
    const isSourceFriend = item.character.id === sourceFriendId;
    const checked = selectedIds.includes(item.character.id);
    const focused =
      friendPositionMap.get(item.character.id) === focusedFriendIndex;

    return (
      <button
        key={item.character.id}
        type="button"
        ref={(node) => {
          friendItemRefs.current[item.character.id] = node;
        }}
        disabled={createMutation.isPending}
        onClick={() => toggleSelection(item.character.id)}
        aria-pressed={checked}
        aria-current={focused ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-none border-b border-transparent px-4 py-2.5 text-left transition disabled:opacity-60",
          checked
            ? "bg-[rgba(7,193,96,0.08)]"
            : isSourceFriend
              ? "bg-[rgba(7,193,96,0.04)] hover:bg-[rgba(7,193,96,0.06)]"
              : "hover:bg-[rgba(0,0,0,0.028)]",
          focused ? "bg-[rgba(7,193,96,0.05)]" : "",
        )}
      >
        <AvatarChip name={displayName} src={item.character.avatar} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[14px] text-[color:var(--text-primary)]">
              {displayName}
            </div>
            {isSourceFriend ? (
              <span className="shrink-0 rounded-full bg-[rgba(7,193,96,0.08)] px-1.5 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
                当前聊天
              </span>
            ) : null}
            {aliasName ? (
              <span className="shrink-0 rounded-full border border-[color:var(--border-faint)] bg-white px-1.5 py-0.5 text-[10px] text-[color:var(--text-dim)]">
                {aliasName}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
            {item.character.relationship || "世界联系人"}
          </div>
        </div>
        <div
          className={cn(
            "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
            checked
              ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
              : "border-[rgba(15,23,42,0.14)] bg-white text-transparent",
          )}
        >
          <Check size={12} strokeWidth={3} />
        </div>
      </button>
    );
  };

  if (!open) {
    return null;
  }

  const allShareableMessagesSelected =
    shareableMessages.length > 0 &&
    selectedMessageIds.length === shareableMessages.length;
  const recentPresetSelectionState = new Map(
    SHARE_HISTORY_PRESET_COUNTS.map((count) => [
      count,
      areSameIds(
        selectedMessageIds,
        shareableMessages.slice(-count).map((message) => message.id),
      ),
    ]),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.18)] p-6 backdrop-blur-[2px]">
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
        className="relative flex h-[min(700px,82vh)] w-full max-w-[560px] flex-col overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="relative border-b border-[rgba(15,23,42,0.08)] bg-[#f7f7f7] px-6 py-4 text-center">
          <div className="text-[16px] font-medium tracking-[0.01em] text-[color:var(--text-primary)]">
            选择联系人
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
            className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-black/[0.04] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-[rgba(15,23,42,0.08)] bg-[#f7f7f7] px-4 py-3">
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
              className="h-10 w-full rounded-[10px] border border-[color:var(--border-faint)] bg-white pl-10 pr-10 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)]"
            />
            {searchTerm.trim() ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="清空联系人搜索"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--text-dim)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
              >
                <X size={14} />
              </button>
            ) : null}
          </label>

          <div className="mt-3 min-h-[72px] rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-3">
            {selectedFriends.length ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {selectedFriends.map((item) => {
                  const displayName = getFriendDisplayName(item);
                  const isSourceFriend = item.character.id === sourceFriendId;
                  return (
                    <button
                      key={item.character.id}
                      type="button"
                      onClick={() => toggleSelection(item.character.id)}
                      className="flex w-14 shrink-0 flex-col items-center gap-1 text-center"
                    >
                      <div className="relative">
                        <AvatarChip
                          name={displayName}
                          src={item.character.avatar}
                          size="wechat"
                        />
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white">
                          <X size={10} />
                        </span>
                      </div>
                      <span className="w-full truncate text-[11px] text-[color:var(--text-secondary)]">
                        {displayName}
                      </span>
                      {isSourceFriend ? (
                        <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-1.5 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
                          当前
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[42px] items-center text-[12px] text-[color:var(--text-muted)]">
                已选联系人会显示在这里
              </div>
            )}
          </div>
          {seedMemberIds.length ? (
            <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
              已默认选择
              {sourceFriendName ? `“${sourceFriendName}”` : "当前聊天对象"}
            </div>
          ) : null}
        </div>

        <div
          ref={friendListScrollRef}
          className="min-h-0 flex-1 overflow-auto bg-white"
        >
          {friendsQuery.isLoading ? (
            <LoadingBlock
              className="px-4 py-5 text-left"
              label="正在读取联系人..."
            />
          ) : null}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? (
            <div className="px-4 py-3">
              <ErrorBlock message={friendsQuery.error.message} />
            </div>
          ) : null}
          {createMutation.isError && createMutation.error instanceof Error ? (
            <div className="px-4 py-3">
              <ErrorBlock message={createMutation.error.message} />
            </div>
          ) : null}

          {!friendsQuery.isLoading &&
          !friendsQuery.isError &&
          !friendItems.length ? (
            <div className="px-4 py-10">
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
            <div className="px-4 py-10">
              <EmptyState
                title="没有匹配的联系人"
                description="换个名字、备注名或关系关键词试试。"
              />
            </div>
          ) : null}

          {!friendsQuery.isLoading &&
          !friendsQuery.isError &&
          filteredFriends.length ? (
            <div className="border-b border-[rgba(15,23,42,0.06)] px-4 py-2 text-[11px] text-[color:var(--text-dim)]">
              {searchTerm.trim()
                ? `搜索结果 ${filteredFriends.length} 位联系人`
                : `共 ${filteredFriends.length} 位联系人`}
            </div>
          ) : null}

          <div>
            <div className="space-y-3">
              {pinnedSourceFriend ? (
                <div>
                  <div className="border-b border-[rgba(15,23,42,0.06)] bg-[#fafafa] px-4 py-2 text-[11px] font-medium tracking-[0.08em] text-[color:var(--brand-primary)]">
                    当前聊天
                  </div>
                  {renderFriendRow(pinnedSourceFriend)}
                </div>
              ) : null}

              {friendSections.map((section) => (
                <div key={section.key}>
                  <div className="sticky top-0 z-[1] border-b border-[rgba(15,23,42,0.06)] bg-[#fafafa] px-4 py-2 text-[11px] font-medium tracking-[0.08em] text-[color:var(--text-dim)]">
                    {section.title}
                  </div>
                  <div>
                    {section.items.map((item) => renderFriendRow(item))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {conversationId && shareHistory ? (
          <div className="border-t border-[rgba(15,23,42,0.08)] bg-[#fafafa] px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                分享聊天内容
              </div>
              <button
                type="button"
                onClick={() => {
                  setShareHistory(false);
                  setSelectedMessageIds([]);
                  setMessageSelectionNotice(null);
                }}
                className="text-[12px] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
              >
                收起
              </button>
            </div>

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
              <div className="rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-3 text-[12px] text-[color:var(--text-muted)]">
                当前单聊里还没有可分享的消息。
              </div>
            ) : null}
            {!shareableMessagesQuery.isLoading &&
            !shareableMessagesQuery.isError &&
            shareableMessages.length ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-[12px] text-[color:var(--text-muted)]">
                    已选择 {selectedMessageIds.length} /{" "}
                    {Math.min(
                      MAX_SHARED_MESSAGE_COUNT,
                      shareableMessages.length,
                    )}{" "}
                    条
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    {SHARE_HISTORY_PRESET_COUNTS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => selectRecentMessages(count)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 transition",
                          recentPresetSelectionState.get(count)
                            ? "border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]"
                            : "border-[rgba(15,23,42,0.08)] bg-white text-[color:var(--text-secondary)] hover:bg-[rgba(0,0,0,0.03)]",
                        )}
                      >
                        最近{count}条
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        applyMessageSelection(
                          shareableMessages.map((message) => message.id),
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 transition",
                        allShareableMessagesSelected
                          ? "border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]"
                          : "border-[rgba(15,23,42,0.08)] bg-white text-[color:var(--text-secondary)] hover:bg-[rgba(0,0,0,0.03)]",
                      )}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMessageIds([])}
                      className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2.5 py-1 text-[color:var(--text-secondary)] transition hover:bg-[rgba(0,0,0,0.03)]"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div
                  tabIndex={0}
                  onKeyDown={handleSharedMessagesKeyDown}
                  className="max-h-56 overflow-auto rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white outline-none ring-offset-0 focus:ring-2 focus:ring-[rgba(7,193,96,0.14)]"
                  aria-label="可分享聊天记录列表"
                >
                  {shareableMessageSections.map((section) => (
                    <div key={section.key}>
                      <div className="sticky top-0 z-10 border-b border-[rgba(15,23,42,0.06)] bg-[#fafafa] px-3 py-2 text-[11px] font-medium text-[color:var(--text-dim)]">
                        {section.label}
                      </div>
                      <div>
                        {section.items.map((message) => {
                          const checked = selectedMessageIds.includes(
                            message.id,
                          );
                          const focused =
                            shareableMessagePositionMap.get(message.id) ===
                            focusedMessageIndex;

                          return (
                            <button
                              key={message.id}
                              type="button"
                              ref={(node) => {
                                messageItemRefs.current[message.id] = node;
                              }}
                              onClick={() => toggleMessageSelection(message.id)}
                              aria-pressed={checked}
                              aria-current={focused ? "true" : undefined}
                              className={cn(
                                "flex w-full items-start gap-3 border-b border-[rgba(15,23,42,0.05)] px-3 py-2.5 text-left transition",
                                checked
                                  ? "bg-[rgba(7,193,96,0.08)]"
                                  : "hover:bg-[rgba(0,0,0,0.028)]",
                                focused ? "bg-[rgba(7,193,96,0.05)]" : "",
                              )}
                            >
                              <div
                                className={cn(
                                  "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                                  checked
                                    ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
                                    : "border-[rgba(15,23,42,0.14)] bg-white text-transparent",
                                )}
                              >
                                <Check size={12} strokeWidth={3} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-[11px] text-[color:var(--text-dim)]">
                                  <span className="truncate text-[12px] font-medium text-[color:var(--text-primary)]">
                                    {message.senderName}
                                  </span>
                                  <span>
                                    {formatShareableMessageTime(
                                      message.createdAt,
                                    )}
                                  </span>
                                  <span>{formatMessageTypeLabel(message)}</span>
                                </div>
                                <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">
                                  {getMessagePreviewText(message)}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-[rgba(15,23,42,0.08)] bg-[#f7f7f7] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3 text-[12px] text-[color:var(--text-muted)]">
            <span>已选择 {selectedIds.length} 位联系人</span>
            {conversationId ? (
              <button
                type="button"
                onClick={() => {
                  const nextChecked = !shareHistory;
                  setShareHistory(nextChecked);
                  setMessageSelectionNotice(null);
                  if (!nextChecked) {
                    setSelectedMessageIds([]);
                  }
                }}
                className={cn(
                  "rounded-full px-3 py-1 transition",
                  shareHistory
                    ? "bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]"
                    : "bg-white text-[color:var(--text-secondary)] hover:bg-[rgba(0,0,0,0.03)]",
                )}
              >
                {shareHistory && selectedMessageIds.length
                  ? `已分享 ${selectedMessageIds.length} 条聊天内容`
                  : "分享聊天内容"}
              </button>
            ) : selectedIds.length ? (
              <span className="truncate">{defaultGroupName}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleCreate}
              disabled={!selectedIds.length || createMutation.isPending}
              className="rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-white hover:opacity-95"
            >
              {createMutation.isPending ? "正在创建..." : "完成"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getMessagePreviewText(message: Message) {
  if (message.type === "system") {
    return message.text.trim() || "[系统消息]";
  }

  return (
    resolveMessageSemanticPreview(message, {
      maxChars: 160,
      bracketedFallback: true,
    }) || "[文本消息]"
  );
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

  if (message.type === "note_card") {
    return "笔记";
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

function areSameIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
}

function buildShareableMessageSections(messages: Message[]) {
  const sections = new Map<
    string,
    { key: string; label: string; items: Message[] }
  >();

  for (const message of messages) {
    const key = resolveShareableMessageSectionKey(message.createdAt);
    const existingSection = sections.get(key);
    if (existingSection) {
      existingSection.items.push(message);
      continue;
    }

    sections.set(key, {
      key,
      label: resolveShareableMessageSectionLabel(message.createdAt),
      items: [message],
    });
  }

  return [...sections.values()];
}

function resolveShareableMessageSectionKey(createdAt: string) {
  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return "unknown";
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveShareableMessageSectionLabel(createdAt: string) {
  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return "未知时间";
  }

  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameCalendarDay(date, now)) {
    return "今天";
  }

  if (isSameCalendarDay(date, yesterday)) {
    return "昨天";
  }

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatShareableMessageTime(createdAt: string) {
  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
