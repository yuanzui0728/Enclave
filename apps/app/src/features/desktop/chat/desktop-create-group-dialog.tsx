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
import { ContactIndexList } from "../../contacts/contact-index-list";
import {
  buildContactSections,
  createFriendDirectoryItems,
  type FriendDirectoryItem,
} from "../../contacts/contact-utils";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";

const MAX_SHARED_MESSAGE_COUNT = 100;
const DEFAULT_SHARED_MESSAGE_COUNT = 3;
const SHARE_HISTORY_PRESET_COUNTS = [DEFAULT_SHARED_MESSAGE_COUNT, 5, 9] as const;

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
  const [friendIndexIndicatorLabel, setFriendIndexIndicatorLabel] = useState<
    string | null
  >(null);
  const [activeFriendIndexKey, setActiveFriendIndexKey] = useState<string | null>(
    null,
  );
  const [focusedFriendIndex, setFocusedFriendIndex] = useState(0);
  const [focusedMessageIndex, setFocusedMessageIndex] = useState(0);
  const seededSelectionRef = useRef("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const friendListScrollRef = useRef<HTMLDivElement | null>(null);
  const friendItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const friendSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
  const sourceFriend = useMemo(
    () => seedMemberIds.map((id) => friendMap.get(id)).find(Boolean) ?? null,
    [friendMap, seedMemberIds],
  );
  const sourceFriendId = sourceFriend?.character.id ?? null;
  const sourceFriendName = sourceFriend ? getFriendDisplayName(sourceFriend) : null;
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
  const pinnedSourceFriend = useMemo(
    () =>
      sourceFriendId
        ? filteredFriends.find((item) => item.character.id === sourceFriendId) ?? null
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
      pinnedSourceFriend ? [pinnedSourceFriend, ...directoryFriends] : directoryFriends,
    [directoryFriends, pinnedSourceFriend],
  );
  const friendSections = useMemo(
    () => buildContactSections(directoryFriends),
    [directoryFriends],
  );
  const friendIndexItems = useMemo(
    () =>
      friendSections.map((section) => ({
        key: section.key,
        indexLabel: section.indexLabel,
      })),
    [friendSections],
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
    if (!friendIndexIndicatorLabel) {
      return;
    }

    const timer = window.setTimeout(() => setFriendIndexIndicatorLabel(null), 850);
    return () => window.clearTimeout(timer);
  }, [friendIndexIndicatorLabel]);

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
    const focusedFriend = orderedFilteredFriends[focusedFriendIndex];
    if (focusedFriend?.character.id === sourceFriendId) {
      setActiveFriendIndexKey(null);
      return;
    }

    setActiveFriendIndexKey(
      focusedFriend?.indexLabel ?? null,
    );
  }, [focusedFriendIndex, orderedFilteredFriends, sourceFriendId]);

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
        setFriendIndexIndicatorLabel(
          orderedFilteredFriends[nextIndex]?.indexLabel ?? null,
        );
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

  const jumpToFriendSection = (
    sectionKey: string,
    behavior: ScrollBehavior = "smooth",
  ) => {
    const targetSection = friendSections.find((section) => section.key === sectionKey);
    const firstItem = targetSection?.items[0];
    if (!targetSection || !firstItem) {
      return;
    }

    const nextIndex = friendPositionMap.get(firstItem.character.id);
    if (typeof nextIndex === "number") {
      setFocusedFriendIndex(nextIndex);
    }

    friendSectionRefs.current[sectionKey]?.scrollIntoView({
      block: "start",
      behavior,
    });
    searchInputRef.current?.focus();
  };

  const syncActiveFriendSectionFromScroll = useCallback(() => {
    const scrollContainer = friendListScrollRef.current;
    if (!scrollContainer || !friendSections.length) {
      return;
    }

    if (pinnedSourceFriend) {
      const pinnedNode = friendItemRefs.current[pinnedSourceFriend.character.id];
      if (pinnedNode) {
        const pinnedRect = pinnedNode.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        if (pinnedRect.bottom > containerRect.top + 24) {
          setActiveFriendIndexKey(null);
          return;
        }
      }
    }

    const containerTop = scrollContainer.getBoundingClientRect().top;
    let nextSectionKey = friendSections[0]?.key ?? null;

    for (const section of friendSections) {
      const sectionNode = friendSectionRefs.current[section.key];
      if (!sectionNode) {
        continue;
      }

      const offset = sectionNode.getBoundingClientRect().top - containerTop;
      if (offset <= 20) {
        nextSectionKey = section.key;
        continue;
      }

      break;
    }

    setActiveFriendIndexKey(nextSectionKey);
  }, [friendSections, pinnedSourceFriend]);

  useEffect(() => {
    if (searchTerm.trim()) {
      const focusedFriend = orderedFilteredFriends[focusedFriendIndex];
      setActiveFriendIndexKey(
        focusedFriend?.character.id === sourceFriendId
          ? null
          : focusedFriend?.indexLabel ?? null,
      );
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      syncActiveFriendSectionFromScroll();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    focusedFriendIndex,
    friendSections,
    open,
    orderedFilteredFriends,
    pinnedSourceFriend,
    searchTerm,
    syncActiveFriendSectionFromScroll,
    sourceFriendId,
  ]);

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
          "flex w-full items-center gap-3.5 rounded-[10px] border border-transparent px-3.5 py-2.5 text-left transition disabled:opacity-60",
          checked
            ? "border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)]"
            : isSourceFriend
              ? "border-[rgba(7,193,96,0.10)] bg-[rgba(7,193,96,0.04)] hover:border-[rgba(7,193,96,0.16)] hover:bg-[rgba(7,193,96,0.08)]"
              : "hover:border-black/6 hover:bg-white",
          focused ? "ring-1 ring-[rgba(7,193,96,0.24)]" : "",
        )}
      >
        <AvatarChip
          name={displayName}
          src={item.character.avatar}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[14px] text-[color:var(--text-primary)]">
              {displayName}
            </div>
            {isSourceFriend ? (
              <span className="shrink-0 rounded-full bg-[rgba(7,193,96,0.10)] px-1.5 py-0.5 text-[10px] text-[#17803d]">
                当前聊天
              </span>
            ) : null}
            {aliasName ? (
              <span className="shrink-0 rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] text-[color:var(--text-dim)]">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.24)] p-6 backdrop-blur-[3px]">
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
        className="relative flex h-[min(720px,82vh)] w-full max-w-[640px] flex-col overflow-hidden rounded-[18px] border border-black/8 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="flex items-center justify-between gap-4 border-b border-black/6 bg-[linear-gradient(180deg,#fbfbfb_0%,#f4f4f4_100%)] px-6 py-4">
          <div className="min-w-0">
            <div className="text-[18px] font-medium tracking-[0.01em] text-[color:var(--text-primary)]">
              发起群聊
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#07c160]" />
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
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/6 bg-white/85 text-[color:var(--text-secondary)] transition hover:border-black/10 hover:bg-white hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-black/6 px-6 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[12px] font-medium tracking-[0.08em] text-[color:var(--text-primary)]">
                选择成员
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
                先补齐要拉进群的人，再决定要不要带上聊天上下文。
              </div>
            </div>
            <div className="shrink-0 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]">
              已选 {selectedIds.length}
            </div>
          </div>

          {seedMemberIds.length ? (
            <div className="mb-3 rounded-[10px] border border-[rgba(7,193,96,0.14)] bg-[#f3fff8] px-3 py-2.5 text-[12px] leading-5 text-[#2f7a4c]">
              已按当前聊天默认勾选
              {sourceFriendName ? `“${sourceFriendName}”` : "对方"}
              ，你可以继续添加其他联系人。
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
              className="h-10 w-full rounded-[10px] border border-black/8 bg-white pl-10 pr-10 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-black/12"
            />
            {searchTerm.trim() ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="清空联系人搜索"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--text-dim)] transition hover:bg-[#f2f2f2] hover:text-[color:var(--text-primary)]"
              >
                <X size={14} />
              </button>
            ) : null}
          </label>

          <div className="mt-3 min-h-9 rounded-[10px] bg-[#fafafa] px-3 py-2.5">
            {selectedFriends.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedFriends.map((item) => {
                  const displayName = getFriendDisplayName(item);
                  const isSourceFriend = item.character.id === sourceFriendId;
                  return (
                    <button
                      key={item.character.id}
                      type="button"
                      onClick={() => toggleSelection(item.character.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-[8px] border px-3 py-1.5 text-left text-[12px] text-[color:var(--text-primary)] transition",
                        isSourceFriend
                          ? "border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.08)] hover:bg-[rgba(7,193,96,0.12)]"
                          : "border-black/6 bg-[#f5f5f5] hover:bg-[#ededed]",
                      )}
                    >
                      <AvatarChip
                        name={displayName}
                        src={item.character.avatar}
                        size="sm"
                      />
                      <span className="max-w-24 truncate">{displayName}</span>
                      {isSourceFriend ? (
                        <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-[#17803d]">
                          当前聊天
                        </span>
                      ) : null}
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
            <div className="mt-4 border-t border-dashed border-black/8 pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-medium tracking-[0.08em] text-[color:var(--text-primary)]">
                    聊天上下文
                  </div>
                  <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
                    {sourceFriendName
                      ? `从你和“${sourceFriendName}”的聊天里带几条最近消息进群，减少重新说明成本。`
                      : "从当前单聊里带几条最近消息进群，减少重新说明成本。"}
                  </div>
                </div>
                <div className="shrink-0 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]">
                  {shareHistory ? `已选 ${selectedMessageIds.length}` : "可选"}
                </div>
              </div>

              <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-3">
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
                      {sourceFriendName
                        ? `分享与“${sourceFriendName}”的聊天记录`
                        : "分享聊天记录"}
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
                          <div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
                            {SHARE_HISTORY_PRESET_COUNTS.map((count) => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => selectRecentMessages(count)}
                                className={cn(
                                  "rounded-[8px] border px-2.5 py-1 transition",
                                  recentPresetSelectionState.get(count)
                                    ? "border-[rgba(7,193,96,0.28)] bg-[rgba(7,193,96,0.10)] text-[#17803d]"
                                    : "border-black/8 bg-white text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
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
                                "rounded-[8px] border px-2.5 py-1 transition",
                                allShareableMessagesSelected
                                  ? "border-[rgba(7,193,96,0.28)] bg-[rgba(7,193,96,0.10)] text-[#17803d]"
                                  : "border-black/8 bg-white text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                              )}
                            >
                              全选
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedMessageIds([])}
                              className={cn(
                                "rounded-[8px] border px-2.5 py-1 transition",
                                selectedMessageIds.length === 0
                                  ? "border-[rgba(7,193,96,0.28)] bg-[rgba(7,193,96,0.10)] text-[#17803d]"
                                  : "border-black/8 bg-white text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                              )}
                            >
                              清空
                            </button>
                          </div>
                        </div>
                        <div
                          tabIndex={0}
                          onKeyDown={handleSharedMessagesKeyDown}
                          className="max-h-56 overflow-auto rounded-[10px] border border-black/6 bg-white p-1.5 outline-none ring-offset-0 focus:ring-2 focus:ring-[rgba(7,193,96,0.18)]"
                          aria-label="可分享聊天记录列表"
                        >
                          <div className="space-y-3">
                          {shareableMessageSections.map((section) => (
                            <div key={section.key} className="rounded-[10px] bg-[#fcfcfc] px-2 py-2">
                              <div className="sticky top-0 z-10 -mx-1.5 mb-1 bg-[rgba(255,255,255,0.92)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--text-dim)] backdrop-blur">
                                {section.label}
                              </div>
                              <div className="relative space-y-2 pl-12">
                                <div className="absolute bottom-3 left-[33px] top-3 w-px bg-[rgba(15,23,42,0.08)]" />
                                {section.items.map((message, index) => {
                                  const previousMessage = section.items[index - 1];
                                  const nextMessage = section.items[index + 1];
                                  const continuedFromPrevious =
                                    isShareableMessageContinuation(
                                      message,
                                      previousMessage,
                                    );
                                  const continuedToNext =
                                    isShareableMessageContinuation(
                                      nextMessage,
                                      message,
                                    );
                                  const messageGroupPosition =
                                    getShareableMessageGroupPosition(
                                      continuedFromPrevious,
                                      continuedToNext,
                                    );
                                  const checked = selectedMessageIds.includes(message.id);
                                  const focused =
                                    shareableMessagePositionMap.get(message.id) ===
                                    focusedMessageIndex;
                                  const isGroupLead = !continuedFromPrevious;
                                  const timeLabel = formatShareableMessageTime(
                                    message.createdAt,
                                  );
                                  return (
                                    <button
                                      key={message.id}
                                      type="button"
                                      ref={(node) => {
                                        messageItemRefs.current[message.id] = node;
                                      }}
                                      onClick={() =>
                                        toggleMessageSelection(message.id)
                                      }
                                      aria-pressed={checked}
                                      aria-current={focused ? "true" : undefined}
                                      className={cn(
                                        "group relative flex w-full items-start gap-3 rounded-[12px] px-2 text-left transition duration-150 active:translate-y-[1px]",
                                        continuedFromPrevious ? "py-0.5" : "py-1.5",
                                        checked
                                          ? "bg-[rgba(7,193,96,0.05)]"
                                          : "hover:bg-[#f7f7f7] active:bg-[#f3f3f3]",
                                        focused
                                          ? "ring-1 ring-[rgba(7,193,96,0.24)]"
                                          : "",
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "absolute left-7 flex -translate-x-1/2 items-center justify-center",
                                          continuedFromPrevious ? "top-3" : "top-4",
                                        )}
                                      >
                                        <div
                                          className={cn(
                                            "h-3 w-3 rounded-full border-2 bg-white transition-colors duration-150",
                                            checked
                                              ? "border-[#07c160] bg-[#07c160]"
                                            : focused
                                                ? "border-[rgba(7,193,96,0.58)] bg-[rgba(7,193,96,0.10)]"
                                                : "border-[rgba(15,23,42,0.14)] group-hover:border-[rgba(15,23,42,0.22)]",
                                          )}
                                        />
                                      </div>
                                      <div
                                        className={cn(
                                          "w-10 shrink-0 text-[11px] transition-colors duration-150",
                                          continuedFromPrevious ? "pt-0.5" : "pt-1",
                                          checked
                                            ? "text-[#17803d]"
                                            : "text-[color:var(--text-dim)] group-hover:text-[color:var(--text-muted)]",
                                        )}
                                      >
                                        <span
                                          aria-hidden={continuedFromPrevious}
                                          className={continuedFromPrevious ? "invisible" : undefined}
                                        >
                                          {timeLabel}
                                        </span>
                                      </div>
                                      <div
                                        className={cn(
                                          "relative min-w-0 flex-1 border px-3 transition",
                                          continuedFromPrevious ? "py-2" : "py-2.5",
                                          continuedFromPrevious ? "pr-10" : "",
                                          isGroupLead
                                            ? "shadow-[0_1px_0_rgba(15,23,42,0.02)]"
                                            : "shadow-none",
                                          messageGroupPosition === "single"
                                            ? "rounded-[10px]"
                                            : "",
                                          messageGroupPosition === "start"
                                            ? "rounded-[10px] rounded-bl-[6px]"
                                            : "",
                                          messageGroupPosition === "middle"
                                            ? "rounded-[6px]"
                                            : "",
                                          messageGroupPosition === "end"
                                            ? "rounded-[10px] rounded-tl-[6px]"
                                            : "",
                                          checked
                                            ? "border-[rgba(7,193,96,0.24)] bg-[rgba(7,193,96,0.10)] shadow-[0_0_0_1px_rgba(7,193,96,0.05)]"
                                            : isGroupLead
                                              ? "border-black/6 bg-white group-hover:border-black/10 group-hover:bg-[#fcfcfc] group-active:bg-[#f8f8f8]"
                                              : "border-[rgba(15,23,42,0.05)] bg-[#fcfcfc] group-hover:border-[rgba(15,23,42,0.08)] group-hover:bg-[#fafafa] group-active:bg-[#f5f5f5]",
                                          focused && !checked
                                            ? "shadow-[0_0_0_1px_rgba(7,193,96,0.05)]"
                                            : "",
                                        )}
                                      >
                                        {focused ? (
                                          <div className="absolute inset-y-1 left-1 w-[3px] rounded-full bg-[rgba(7,193,96,0.24)]" />
                                        ) : null}
                                        {!continuedFromPrevious ? (
                                          <div className="flex items-center gap-2">
                                            <span className="truncate text-[12px] font-medium text-[color:var(--text-primary)]">
                                              {message.senderName}
                                            </span>
                                            <span className="rounded-full bg-[#f4f4f4] px-1.5 py-0.5 text-[10px] text-[color:var(--text-dim)]">
                                              {formatMessageTypeLabel(message)}
                                            </span>
                                            {focused ? (
                                              <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-1.5 py-0.5 text-[10px] text-[#17803d]">
                                                键盘焦点
                                              </span>
                                            ) : null}
                                            <div
                                              className={cn(
                                                "ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                                                checked
                                                  ? "border-[#07c160] bg-[#07c160] text-white"
                                                  : "border-black/10 bg-[#f5f5f5] text-transparent",
                                              )}
                                            >
                                              <Check size={12} strokeWidth={2.8} />
                                            </div>
                                          </div>
                                        ) : (
                                          <div
                                            className={cn(
                                              "absolute right-3 top-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                                              checked
                                                ? "border-[#07c160] bg-[#07c160] text-white"
                                                : "border-black/10 bg-[#f5f5f5] text-transparent",
                                            )}
                                          >
                                            <Check size={12} strokeWidth={2.8} />
                                          </div>
                                        )}
                                        <div
                                          className={cn(
                                            "line-clamp-2 text-[12px] leading-5",
                                            continuedFromPrevious ? "" : "mt-1",
                                            isGroupLead
                                              ? "text-[color:var(--text-primary)]"
                                              : "text-[color:var(--text-secondary)]",
                                          )}
                                        >
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
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
            </div>
          ) : null}
        </div>

        <div
          ref={friendListScrollRef}
          onScroll={() => {
            if (!searchTerm.trim()) {
              syncActiveFriendSectionFromScroll();
            }
          }}
          className="min-h-0 flex-1 overflow-auto px-3 py-3"
        >
          <div className="mb-3 flex items-center justify-between gap-3 px-3">
            <div>
              <div className="text-[12px] font-medium tracking-[0.08em] text-[color:var(--text-primary)]">
                联系人列表
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
                可用 `↑/↓`、`Alt+字母` 或右侧索引快速定位联系人。
              </div>
            </div>
            <div className="shrink-0 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]">
              {searchTerm.trim()
                ? `${filteredFriends.length} 条结果`
                : `${filteredFriends.length} 位可选`}
            </div>
          </div>

          <div className="rounded-[14px] border border-black/6 bg-[#fcfcfc] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
          <div className="mb-2 flex items-center justify-between gap-3 rounded-[10px] bg-white/80 px-3 py-2 text-[11px] text-[color:var(--text-dim)]">
            <span>{searchTerm.trim() ? `搜索：${searchTerm.trim()}` : "联系人目录"}</span>
            <span>{searchTerm.trim() ? "按名称 / 备注 / 关系筛选，Esc 清空" : "按首字母分组"}</span>
          </div>
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

          <div className="relative pr-8">
            <div className="space-y-3">
              {pinnedSourceFriend ? (
                <div className="mb-3">
                  <div className="mb-1 rounded-[8px] bg-[rgba(7,193,96,0.08)] px-2 py-1 text-[11px] font-medium tracking-[0.12em] text-[#17803d]">
                    当前聊天
                  </div>
                  {renderFriendRow(pinnedSourceFriend)}
                </div>
              ) : null}

              {friendSections.map((section) => (
                <div
                  key={section.key}
                  ref={(node) => {
                    friendSectionRefs.current[section.key] = node;
                  }}
                >
                  <div className="sticky top-0 z-[1] mb-1 rounded-[8px] bg-[rgba(252,252,252,0.94)] px-2 py-1 text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-dim)] backdrop-blur">
                    {section.title}
                  </div>
                  <div className="space-y-1">
                    {section.items.map((item) => renderFriendRow(item))}
                  </div>
                </div>
              ))}
            </div>

            {!searchTerm.trim() && friendIndexItems.length > 1 ? (
              <ContactIndexList
                items={friendIndexItems}
                activeKey={activeFriendIndexKey}
                className="absolute right-0 top-0"
                onSelect={jumpToFriendSection}
              />
            ) : null}
          </div>

          {!searchTerm.trim() && friendIndexIndicatorLabel ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-[rgba(22,22,22,0.72)] text-[30px] font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] backdrop-blur">
                {friendIndexIndicatorLabel}
              </div>
            </div>
          ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-black/6 bg-[linear-gradient(180deg,#fbfbfb_0%,#f4f4f4_100%)] px-6 py-4">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
              已选择 {selectedIds.length} 位成员
              {selectedIds.length ? ` · ${defaultGroupName}` : ""}
              {shareHistory && selectedMessageIds.length
                ? ` · ${selectedMessageIds.length} 条聊天记录`
                : ""}
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              快捷键：`↑/↓` 选联系人，`Enter` 勾选，`Backspace` 删除最后一个已选，`Alt+字母` 首字母跳转，`Alt+数字` 选择最近 N 条聊天记录，`Ctrl/Cmd+Enter` 创建。
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleCreate}
              disabled={!selectedIds.length || createMutation.isPending}
              className="rounded-[10px] bg-[#07c160] px-6 text-white hover:bg-[#06ad56]"
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

function isShareableMessageContinuation(
  message: Message,
  previousMessage?: Message,
) {
  if (!previousMessage) {
    return false;
  }

  if (
    previousMessage.senderId !== message.senderId ||
    previousMessage.senderType !== message.senderType ||
    previousMessage.senderName !== message.senderName
  ) {
    return false;
  }

  const previousTimestamp = parseTimestamp(previousMessage.createdAt);
  const currentTimestamp = parseTimestamp(message.createdAt);
  if (previousTimestamp === null || currentTimestamp === null) {
    return false;
  }

  return currentTimestamp - previousTimestamp <= 5 * 60 * 1000;
}

function getShareableMessageGroupPosition(
  continuedFromPrevious: boolean,
  continuedToNext: boolean,
) {
  if (!continuedFromPrevious && !continuedToNext) {
    return "single";
  }

  if (!continuedFromPrevious && continuedToNext) {
    return "start";
  }

  if (continuedFromPrevious && continuedToNext) {
    return "middle";
  }

  return "end";
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
