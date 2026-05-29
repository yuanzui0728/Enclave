import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage, useRuntimeTranslator } from "@yinjie/i18n";
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
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const titleId = useId();
  const shareHistoryPanelId = useId();
  const [searchTerm, setSearchTerm] = useState("");
  // 走查 R2：和移动端 create-group-page.tsx commit 456d91ecc 同款问题。
  // filteredFriends 直接吃 searchTerm，yuanzui0728_5999 测号 70+ 好友时每个
  // keystroke 都同步 toLowerCase + matchesFriendSearch(remarkName/region/
  // source/tags 多路 haystack 各 lowercase 一次) + buildContactSections 分桶，
  // 输入框肉眼可见 backlog。useDeferredValue 让 React 优先把字打进输入框、
  // 过滤排到下个 idle 帧。和姊妹移动页 + 桌面同类页同口径。
  const deferredSearchTerm = useDeferredValue(searchTerm);
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

  // 走查新会话桌面端群聊 R2：原版用独立 cache key 「desktop-create-group-friends」，
  // 不和其它入口（chat-details-panel / group-chat-thread-panel / message-avatar-
  // popover / contacts-page 全部用「app-friends」)共享 cache。从群聊里点
  //「发起群聊」/「添加成员」时，contacts/details 已经在 ~600ms 前刚拉过 friends，
  // 这里又得在公网隧道再走一发 getFriends。统一到 "app-friends" key + staleTime
  // 15s（和其它入口对齐），cache 复用 → 弹层立刻有数据。
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open,
    staleTime: 15_000,
  });
  // 走查电脑端群聊 R98：和姊妹 R97 / friendsQuery 同款修法——本 query 是
  // 「发起群聊」弹层「分享聊天内容」分支拉源对话最近 100 条消息（用于挑哪
  // 些消息要带进新群）。dedicated cache key "desktop-create-group-shareable-
  // messages" 不和其它路径共享，但开关弹层 / 切「分享聊天内容」开关 / 切
  // 源 conversation 都会触发 enabled 转换 → mount + refetchOnMount(stale)
  // 走完整 RTT。用户犹豫一下关掉重开（"算了再选一遍要分享哪几条"是常见
  // 行为），公网隧道 ~600ms 又拉一次。15s 内的 reopen 复用 cache，体感
  // 立刻有数据，避免每次都看到 LoadingBlock。
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
    staleTime: 15_000,
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
  // 走查 R66：和姊妹 desktop-group-member-picker R66 / desktop-group-member-
  // removal-picker R66 同款修法。下方 renderFriendRow / shareableMessages map
  // 内 selectedIds.includes / selectedMessageIds.includes 都是 O(K) 线性扫，
  // 70+ 好友 × 多选时每次父帧 re-render（query refetch / mutation pending /
  // shareHistory toggle / preset chip click 等）热路径 N × K 次比较。Set 一份
  // 复用。selectedFriends 走 selectedIds 顺序保留 → 在 selectedIdSet 上 .has()
  // 不能保序，仍按 selectedIds 顺序 map 出 directory items。
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedMessageIdSet = useMemo(
    () => new Set(selectedMessageIds),
    [selectedMessageIds],
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
    const keyword = deferredSearchTerm.trim().toLowerCase();
    return sortedFriendItems.filter((item) => {
      if (item.friendship.status === "removed") {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return matchesFriendSearch(item, keyword);
    });
  }, [deferredSearchTerm, sortedFriendItems]);
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

  const createMutationResetRef = useRef(createMutation.reset);
  createMutationResetRef.current = createMutation.reset;

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
    createMutationResetRef.current();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
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

    if (friendsQuery.isLoading) {
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

  // 走查电脑端群聊 R11（和姊妹 desktop 单聊 R11 commit 7f2669731 / 群聊 R11
  // 3 个 member dialog 同款）：原 deps=[clearSearch, isPending, onClose, open,
  // searchTerm]，onClose 是 workspace inline arrow（`onClose={() =>
  // setCreateGroupDialogState(null)}`），父 workspace 60s conversations 轮询 +
  // window focus refetch + chat-message-list typing tick + mutation pending
  // false→true→false 等多路 re-render，每次 onClose 换新引用 → 拆装一次 keydown
  // listener。clearSearch 是稳定 useCallback([])，无影响；searchTerm 仅在用户
  // 真打字时变（rare），保留在 deps 不影响。ref 镜像 onClose、deps 收紧只去
  // onClose 这一项。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      // 走查 R148：发起群聊 dialog 顶部就是搜索 TextField 选成员，CJK 用户
      // 用拼音 / 假名 / 한글 拼"张三 zhangsan"还在候选词阶段按 Esc 想退候
      // 选 → 原 handler 抢 Esc 清搜索词 / 关 dialog → 半截草稿丢失，群聊创
      // 建流程被打断。先让 IME 吃 Esc，候选词退后再按一次才走原 fallback
      // 路径（清 search → 关 dialog）。
      if (event.isComposing) {
        return;
      }

      // 走查电脑端群聊 R6（和 R5 text-edit/confirm dialog 同款）：原版
      // pending 时直接 early return 让 Esc 透传——workspace queueMicrotask
      // 兜底看到 defaultPrevented=false 仍跑 dismissSidePanel 把背后的
      //"聊天信息"侧栏偷关掉，本 dialog 因为 pending 不真关，结果"按 Esc 没关
      // 弹窗倒把侧栏弄没了"。pending 期间仍消费 Esc 防 dismiss。
      event.preventDefault();
      event.stopPropagation();
      if (createMutation.isPending) {
        return;
      }

      if (searchTerm.trim()) {
        clearSearch();
        return;
      }

      // 该 dialog 多数情况下是从右侧"聊天信息"侧栏的"发起群聊"打开。
      // Esc 关 dialog 时阻止冒泡，否则 workspace 的 dismissSidePanel 会
      // 把背后的详情侧栏也关掉。
      onCloseRef.current();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSearch, createMutation.isPending, open, searchTerm]);

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
          t(msg`最多选择 ${MAX_SHARED_MESSAGE_COUNT} 条聊天记录。`),
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
        t(msg`最多选择 ${MAX_SHARED_MESSAGE_COUNT} 条聊天记录。`),
      );
    }

    setSelectedMessageIds(dedupedIds.slice(0, MAX_SHARED_MESSAGE_COUNT));
  };

  const selectRecentMessages = (count: number) => {
    applyMessageSelection(
      shareableMessages.slice(-Math.max(0, count)).map((message) => message.id),
    );
  };

  // 走查新一轮 R3：「完成」按钮 + Cmd/Ctrl+Enter 快捷键都只靠
  // disabled/createMutation.isPending 兜双触发，isPending 是 React state
  // 要等 commit 才进 DOM。同帧连点 / 同帧两次快捷键都能同时通过
  // !isPending → createMutation.mutate() 飞两次 → 后端建出 2 个名字/成员
  // 完全一样但 id 不同的群，消息列表里多冒出一个孤立群。
  // 用 sync ref 锁同帧；onSuccess/onError 都会让 isPending 翻 false，
  // useEffect 跟着复位 ref。
  const createSubmittingRef = useRef(false);
  useEffect(() => {
    if (!createMutation.isPending) {
      createSubmittingRef.current = false;
    }
  }, [createMutation.isPending]);

  const handleCreate = () => {
    if (
      !selectedIds.length ||
      createMutation.isPending ||
      createSubmittingRef.current
    ) {
      return;
    }

    createSubmittingRef.current = true;
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
    // 走查再走一轮 R5：R150 只给 Enter 补了 isComposing 守卫；但本搜索框是发起
    // 群聊里挑联系人的核心入口，CJK IME 用户拼"张三 zhangsan"候选词期间还会
    // 按 ArrowUp/ArrowDown 翻页 + Backspace 删 pinyin 字母。原 handler 三条
    // fallback 全走 preventDefault：
    // · ArrowDown/ArrowUp 在 composing 中把 IME 翻候选词的键吞掉去切
    //   focusedFriendIndex，用户在 IME 候选窗口里翻页同时 focused friend 也
    //   被偷偷换掉，再敲 Enter 选错朋友。
    // · Backspace 在 composing 中 input.value 为""（pinyin pre-edit 不算
    //   value）→ searchTerm.trim()=空 → 命中 `!searchTerm.trim() &&
    //   selectedIds.length` 分支把已选朋友里最末一个移出群聊草稿。用户只是
    //   想从"zhang"删掉个"g"退到"zhan"，结果群聊草稿少一个人。
    // 整段四条 fallback 用统一 isComposing 早返收口，候选词阶段一律让 IME 消
    // 费。和姊妹 R148/R150 / chat-composer mention picker (R150 注释引用) 同款。
    if (event.nativeEvent.isComposing) {
      return;
    }

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
    const checked = selectedIdSet.has(item.character.id);
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
            ? "bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)]"
            : isSourceFriend
              ? "bg-[color-mix(in_srgb,var(--brand-primary)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)]"
              : "hover:bg-[rgba(0,0,0,0.028)]",
          focused ? "bg-[color-mix(in_srgb,var(--brand-primary)_5%,transparent)]" : "",
        )}
      >
        <AvatarChip name={displayName} src={item.character.avatar} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[length:var(--text-body)] text-[color:var(--text-primary)]">
              {displayName}
            </div>
            {isSourceFriend ? (
              <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)] px-1.5 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
                {t(msg`当前聊天`)}
              </span>
            ) : null}
            {aliasName ? (
              <span className="shrink-0 rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-dim)]">
                {aliasName}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
            {item.character.relationship || t(msg`世界联系人`)}
          </div>
        </div>
        <div
          className={cn(
            "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
            checked
              ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)]"
              : "border-[color:var(--state-info-bg)] bg-[color:var(--surface-card)] text-transparent",
          )}
        >
          <Check size={12} strokeWidth={3} />
        </div>
      </button>
    );
  };

  // 走查电脑端群聊 R75：原版这两条计算放在 `if (!open) return null;` 后但
  // 在 JSX 之前，每次 dialog 重渲都跑（搜索关键字 keystroke / selectedIds
  // 变化 / shareHistory toggle / focusedFriendIndex 键盘导航 / mutation
  // pending 翻转都触发整个 dialog 重渲）。recentPresetSelectionState 还
  // 在每帧 new Map + 3 路 .slice + .map + areSameIds 比对（3 个 preset
  // count）= 3 个数组分配 / 帧。最大的浪费：这两个值只在 `conversationId &&
  // shareHistory` 块（line ~985）里用，shareHistory=false 时整段渲染路径
  // 都不读 → 白白计算。提到 useMemo 锁住引用 + 用 selectedMessageIds /
  // shareableMessages 作 deps；shareHistory=false 时仍 build 但 React.memo
  // 不会作 prop 比对（这俩是局部变量），useMemo 同 deps 直接返回旧引用。
  const allShareableMessagesSelected = useMemo(
    () =>
      shareableMessages.length > 0 &&
      selectedMessageIds.length === shareableMessages.length,
    [selectedMessageIds.length, shareableMessages.length],
  );
  const recentPresetSelectionState = useMemo(
    () =>
      new Map(
        SHARE_HISTORY_PRESET_COUNTS.map((count) => [
          count,
          areSameIds(
            selectedMessageIds,
            shareableMessages.slice(-count).map((message) => message.id),
          ),
        ]),
      ),
    [selectedMessageIds, shareableMessages],
  );

  if (!open) {
    return null;
  }

  return (
    // 走查新一轮 R12：和姊妹 confirm/text-edit/forward dialog 同款
    // portal-shield。create-group dialog 从 workspace「+」快捷菜单 /
    // 详情侧栏「发起群聊」打开，背后通常有侧栏；用户在 dialog 内点
    // 搜索框 / 联系人 row 时 workspace pointerdown capture 偷关侧栏，
    // 用户点取消时回不到原详情视图。Esc 路径已 stopPropagation。
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--state-info-bg)] p-6 backdrop-blur-[2px]"
      data-yj-portal-shield="desktop-create-group-dialog"
    >
      <button
        type="button"
        aria-label={t(msg`关闭发起群聊弹层`)}
        onClick={() => {
          if (!createMutation.isPending) {
            onClose();
          }
        }}
        // 走查电脑端单聊 R112：和姊妹 R107-R111 同款 —— 发起群聊 dialog 的
        // backdrop <button> (absolute inset-0) 视觉不可见、纯 mouse"点击背景
        // 关闭"affordance，但 DOM 顺序在 dialog 子树第一位。用户在单聊 +
        // 菜单「发起群聊」/「聊天信息」侧栏「发起群聊」/ 头像 popover「发起
        // 群聊」打开 dialog 后按 Tab → 焦点先落到这张不可见 backdrop → 再按
        // Enter dialog 秒关，已勾选的联系人 + 已分享的消息一并丢失。Esc
        // keydown 已挂 (line 449-469)，键盘用户走 Esc 关 dialog。
        tabIndex={-1}
        className="absolute inset-0"
      />

      {/* 走查 R3：和姊妹 forward / note-send / confirm / text-edit 同款 a11y
          缺漏——modal 但没挂 role="dialog" + aria-modal + aria-labelledby。
          单聊里 + 菜单「发起群聊」/ 详情侧栏「发起群聊」会弹这个；盲人屏幕
          阅读器只听到「关闭发起群聊弹层 按钮」+ 搜索框 + 联系人行，听不到
          「选择联系人」title。补语义。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-[min(700px,82vh)] w-full max-w-[560px] flex-col overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]/96 shadow-[var(--shadow-overlay)]"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="relative border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-6 py-4 text-center">
          <div
            id={titleId}
            className="text-[length:var(--text-title)] font-medium tracking-[0.01em] text-[color:var(--text-primary)]"
          >
            {t(msg`选择联系人`)}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!createMutation.isPending) {
                onClose();
              }
            }}
            disabled={createMutation.isPending}
            aria-label={t(msg`关闭`)}
            className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-black/[0.04] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-3">
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
              placeholder={t(msg`搜索联系人`)}
              // 走查 R5：和姊妹移动端 group-member-picker R3 / 桌面 chat-history
              // R24 / chat-files / forward-dialog 同款 a11y 修法——父 label 只
              // 含 Search 图标 + input，无文本子节点，等于 input 没有 accessible
              // name。SR focus 进来只听到「编辑栏 搜索联系人 空」（placeholder
              // 部分实现读、部分不读），盲人用户得自己摸 dialog 标题猜 scope。
              aria-label={t(msg`搜索联系人`)}
              className="h-10 w-full rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] pl-10 pr-10 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)]"
            />
            {searchTerm.trim() ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={t(msg`清空联系人搜索`)}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--text-dim)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
              >
                <X size={14} />
              </button>
            ) : null}
          </label>

          <div className="mt-3 min-h-[72px] rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-3">
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
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-[color:var(--text-on-brand)]">
                          <X size={10} />
                        </span>
                      </div>
                      <span className="w-full truncate text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
                        {displayName}
                      </span>
                      {isSourceFriend ? (
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)] px-1.5 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
                          {t(msg`当前`)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[42px] items-center text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                {t(msg`已选联系人会显示在这里`)}
              </div>
            )}
          </div>
          {seedMemberIds.length ? (
            <div className="mt-2 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
              {sourceFriendName
                ? t(msg`已默认选择 “${sourceFriendName}”`)
                : t(msg`已默认选择当前聊天对象`)}
            </div>
          ) : null}
        </div>

        <div
          ref={friendListScrollRef}
          className="min-h-0 flex-1 overflow-auto bg-[color:var(--surface-card)]"
        >
          {friendsQuery.isLoading ? (
            <LoadingBlock
              className="px-4 py-5 text-left"
              label={t(msg`正在读取联系人...`)}
            />
          ) : null}
          {/* R49：发起群聊 dialog 3 个 ErrorBlock 全部裸 <div>，没 role —
              friendsQuery / createMutation 失败时盲人 SR 完全静默。
              createMutation 尤其坑：用户选好成员点「创建群聊」后按钮短暂
              pending 又恢复 enabled，没反馈 → 反复点同一按钮。挂 role="alert"。 */}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? (
            <div className="px-4 py-3">
              <ErrorBlock role="alert" message={friendsQuery.error.message} />
            </div>
          ) : null}
          {createMutation.isError && createMutation.error instanceof Error ? (
            <div className="px-4 py-3">
              <ErrorBlock role="alert" message={createMutation.error.message} />
            </div>
          ) : null}

          {!friendsQuery.isLoading &&
          !friendsQuery.isError &&
          !friendItems.length ? (
            <div className="px-4 py-10">
              <EmptyState
                title={t(msg`还没有可拉进群的人`)}
                description={t(msg`先去通讯录里建立一些关系，再回来创建群聊。`)}
              />
            </div>
          ) : null}

          {!friendsQuery.isLoading &&
          !friendsQuery.isError &&
          friendItems.length > 0 &&
          !filteredFriends.length ? (
            <div className="px-4 py-10">
              <EmptyState
                title={t(msg`没有匹配的联系人`)}
                description={t(msg`换个名字、备注名或关系关键词试试。`)}
              />
            </div>
          ) : null}

          {!friendsQuery.isLoading &&
          !friendsQuery.isError &&
          filteredFriends.length ? (
            <div className="border-b border-[color:var(--border-faint)] px-4 py-2 text-[length:var(--text-eyebrow)] text-[color:var(--text-dim)]">
              {searchTerm.trim()
                ? t(msg`搜索结果 ${filteredFriends.length} 位联系人`)
                : t(msg`共 ${filteredFriends.length} 位联系人`)}
            </div>
          ) : null}

          <div>
            <div className="space-y-3">
              {pinnedSourceFriend ? (
                <div>
                  <div className="border-b border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2 text-[length:var(--text-eyebrow)] font-medium tracking-[0.08em] text-[color:var(--brand-primary)]">
                    {t(msg`当前聊天`)}
                  </div>
                  {renderFriendRow(pinnedSourceFriend)}
                </div>
              ) : null}

              {friendSections.map((section) => (
                <div key={section.key}>
                  <div className="sticky top-0 z-[1] border-b border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2 text-[length:var(--text-eyebrow)] font-medium tracking-[0.08em] text-[color:var(--text-dim)]">
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
          <div
            id={shareHistoryPanelId}
            className="border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-3"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
                {t(msg`分享聊天内容`)}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShareHistory(false);
                  setSelectedMessageIds([]);
                  setMessageSelectionNotice(null);
                }}
                className="text-[length:var(--text-caption)] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
              >
                {t(msg`收起`)}
              </button>
            </div>

            {messageSelectionNotice ? (
              // R44：messageSelectionNotice 是用户选择超量 / 不可分享消息时的
              // tone="muted" 提示（"已达 50 条上限"、"撤回 / 已删除的消息不会
              // 转发"等）。原版普通 div SR 感知不到。polite 不抢断 SR。
              <InlineNotice
                role="status"
                aria-live="polite"
                className="mb-3 text-xs"
                tone="muted"
              >
                {messageSelectionNotice}
              </InlineNotice>
            ) : null}
            {shareableMessagesQuery.isLoading ? (
              <LoadingBlock
                className="px-0 py-3 text-left"
                label={t(msg`正在读取最近聊天记录...`)}
              />
            ) : null}
            {shareableMessagesQuery.isError &&
            shareableMessagesQuery.error instanceof Error ? (
              // R49 续：shareableMessages 读取失败时盲人不知道列表为何空。
              <ErrorBlock
                role="alert"
                message={shareableMessagesQuery.error.message}
              />
            ) : null}
            {!shareableMessagesQuery.isLoading &&
            !shareableMessagesQuery.isError &&
            !shareableMessages.length ? (
              <div className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-3 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                {t(msg`当前单聊里还没有可分享的消息。`)}
              </div>
            ) : null}
            {!shareableMessagesQuery.isLoading &&
            !shareableMessagesQuery.isError &&
            shareableMessages.length ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                    {t(
                      msg`已选择 ${selectedMessageIds.length} / ${Math.min(MAX_SHARED_MESSAGE_COUNT, shareableMessages.length)} 条`,
                    )}
                  </div>
                  {/* 走查 R33：preset chip「最近 N 条」+「全选」+「清空」是
                      shareable 消息批量选择的快捷预设。前面的 chip + 全选都通过
                      recentPresetSelectionState / allShareableMessagesSelected 表达
                      当前 selectedMessageIds 是否正好匹配这条预设，原版只用绿底
                      视觉差区分 active。盲人 SR 走过去听到「最近 5 条 / 最近 10
                      条 / 最近 20 条 / 全选」一串裸 label，无法识别当前选择正好
                      匹配哪条预设。补 aria-pressed = 是否匹配此预设。清空按钮
                      不挂——它是命令式 action（点了变 0），不属于 toggle 类。 */}
                  <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-caption)]">
                    {SHARE_HISTORY_PRESET_COUNTS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => selectRecentMessages(count)}
                        aria-pressed={recentPresetSelectionState.get(count) ?? false}
                        className={cn(
                          "rounded-full border px-2.5 py-1 transition",
                          recentPresetSelectionState.get(count)
                            ? "border-[color-mix(in_srgb,var(--brand-primary)_16%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)] text-[color:var(--brand-primary)]"
                            : "border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] hover:bg-[rgba(0,0,0,0.03)]",
                        )}
                      >
                        {t(msg`最近 ${count} 条`)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        applyMessageSelection(
                          shareableMessages.map((message) => message.id),
                        )
                      }
                      aria-pressed={allShareableMessagesSelected}
                      className={cn(
                        "rounded-full border px-2.5 py-1 transition",
                        allShareableMessagesSelected
                          ? "border-[color-mix(in_srgb,var(--brand-primary)_16%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)] text-[color:var(--brand-primary)]"
                          : "border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] hover:bg-[rgba(0,0,0,0.03)]",
                      )}
                    >
                      {t(msg`全选`)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMessageIds([])}
                      className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2.5 py-1 text-[color:var(--text-secondary)] transition hover:bg-[rgba(0,0,0,0.03)]"
                    >
                      {t(msg`清空`)}
                    </button>
                  </div>
                </div>

                <div
                  tabIndex={0}
                  onKeyDown={handleSharedMessagesKeyDown}
                  className="max-h-56 overflow-auto rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] outline-none ring-offset-0 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)]"
                  aria-label={t(msg`可分享聊天记录列表`)}
                >
                  {shareableMessageSections.map((section) => (
                    <div key={section.key}>
                      <div className="sticky top-0 z-10 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-[length:var(--text-eyebrow)] font-medium text-[color:var(--text-dim)]">
                        {section.label}
                      </div>
                      <div>
                        {section.items.map((message) => {
                          const checked = selectedMessageIdSet.has(message.id);
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
                                "flex w-full items-start gap-3 border-b border-[color:var(--border-faint)] px-3 py-2.5 text-left transition",
                                checked
                                  ? "bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)]"
                                  : "hover:bg-[rgba(0,0,0,0.028)]",
                                focused ? "bg-[color-mix(in_srgb,var(--brand-primary)_5%,transparent)]" : "",
                              )}
                            >
                              <div
                                className={cn(
                                  "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                                  checked
                                    ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)]"
                                    : "border-[color:var(--state-info-bg)] bg-[color:var(--surface-card)] text-transparent",
                                )}
                              >
                                <Check size={12} strokeWidth={3} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-[length:var(--text-eyebrow)] text-[color:var(--text-dim)]">
                                  <span className="truncate text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
                                    {message.senderName}
                                  </span>
                                  <span>
                                    {formatShareableMessageTime(
                                      message.createdAt,
                                    )}
                                  </span>
                                  <span>{formatMessageTypeLabel(message)}</span>
                                </div>
                                <div className="mt-1 line-clamp-2 text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]">
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

        <div className="flex items-center justify-between gap-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
            <span>{t(msg`已选择 ${selectedIds.length} 位联系人`)}</span>
            {conversationId ? (
              // 走查电脑端群聊 R100：原版「分享聊天内容」chip 是 disclosure 模式——
              // 点击展开/收起上方 `{conversationId && shareHistory ? (...)` 整段
              // 消息选择面板（line ~1021，含 messageSelectionNotice / preset chip
              // 行 / shareable message 列表）。但 button 只用绿底/灰底 + 文案在
              //「分享聊天内容」↔「已分享 N 条聊天内容」翻转做视觉区分，盲人 SR
              // 走过去只听到当前 label，不知道该按钮控制一个可展开的区域，更不
              // 知道当前是展开还是收起态——内置 disclosure 语义缺失。补
              // aria-expanded 表达 toggle 状态；aria-controls 把整段面板 div 挂
              // 上 id 锚定，让 SR 跳到 disclosure 内容时能识别归属。同步「收起」
              // (line ~1033) 仅命令式 action 不挂 aria-expanded（按钮自身不持
              //"展开/收起"状态，按下后总是变成 hide）。
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
                aria-expanded={shareHistory}
                aria-controls={shareHistory ? shareHistoryPanelId : undefined}
                className={cn(
                  "rounded-full px-3 py-1 transition",
                  shareHistory
                    ? "bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)] text-[color:var(--brand-primary)]"
                    : "bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] hover:bg-[rgba(0,0,0,0.03)]",
                )}
              >
                {shareHistory && selectedMessageIds.length
                  ? t(msg`已分享 ${selectedMessageIds.length} 条聊天内容`)
                  : t(msg`分享聊天内容`)}
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
              className="rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`取消`)}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleCreate}
              disabled={!selectedIds.length || createMutation.isPending}
              className="rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-[color:var(--text-on-brand)] hover:opacity-95"
            >
              {createMutation.isPending ? t(msg`正在创建...`) : t(msg`完成`)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getMessagePreviewText(message: Message) {
  if (message.type === "system") {
    return message.text.trim() || translateRuntimeMessage(msg`[系统消息]`);
  }

  return (
    resolveMessageSemanticPreview(message, {
      maxChars: 160,
      bracketedFallback: true,
    }) || translateRuntimeMessage(msg`[文本消息]`)
  );
}

function formatMessageTypeLabel(message: Message) {
  if (message.type === "text" || message.type === "proactive") {
    return translateRuntimeMessage(msg`文字`);
  }

  if (message.type === "system") {
    return translateRuntimeMessage(msg`系统`);
  }

  if (message.type === "sticker") {
    return translateRuntimeMessage(msg`表情`);
  }

  if (message.type === "image") {
    return translateRuntimeMessage(msg`图片`);
  }

  if (message.type === "file") {
    return translateRuntimeMessage(msg`文件`);
  }

  if (message.type === "voice") {
    return translateRuntimeMessage(msg`语音`);
  }

  if (message.type === "contact_card") {
    return translateRuntimeMessage(msg`名片`);
  }

  if (message.type === "note_card") {
    return translateRuntimeMessage(msg`笔记`);
  }

  return translateRuntimeMessage(msg`位置`);
}

function buildDefaultGroupName(
  items: Array<Pick<FriendListItem, "friendship" | "character">>,
) {
  const names = items
    .map((item) => getFriendDisplayName(item))
    .filter(Boolean)
    .slice(0, 3);

  if (!names.length) {
    return translateRuntimeMessage(msg`临时群聊`);
  }

  if (items.length > 3) {
    return translateRuntimeMessage(
      msg`${names.join("、")}等${items.length}人`,
    );
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
    return translateRuntimeMessage(msg`未知时间`);
  }

  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameCalendarDay(date, now)) {
    return translateRuntimeMessage(msg`今天`);
  }

  if (isSameCalendarDay(date, yesterday)) {
    return translateRuntimeMessage(msg`昨天`);
  }

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(undefined, {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
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

  return new Intl.DateTimeFormat(undefined, {
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
