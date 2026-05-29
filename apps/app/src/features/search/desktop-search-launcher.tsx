import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Clock3 } from "lucide-react";
import {
  getConversations,
  getFriends,
  listCharacters,
  recordSearchActivity,
  searchConversationMessages,
  searchGroupMessages,
} from "@yinjie/contracts";
import { cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import {
  getConversationDisplayTitle,
  getConversationPreviewParts,
} from "../../lib/conversation-preview";
import { formatMessageTimestamp } from "../../lib/format";
import { searchStringToObject } from "../../lib/route-search";
import {
  getConversationThreadLabel,
  isPersistedGroupConversation,
} from "../../lib/conversation-route";
import {
  createFriendDirectoryItems,
  createWorldCharacterDirectoryItems,
  getFriendDisplayName,
  matchesCharacterSearch,
  matchesFriendSearch,
  shouldIncludeInWorldCharacterDirectory,
  type FriendDirectoryItem,
  type WorldCharacterDirectoryItem,
} from "../contacts/contact-utils";
import {
  shouldHideSearchableChatMessage,
  useLocalChatMessageActionState,
} from "../chat/local-chat-message-actions";
import { useSpeechInput } from "../chat/use-speech-input";
import type { SpeechInputStatus } from "../chat/speech-input-types";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  buildSearchRouteHash,
  type SearchRouteSource,
} from "./search-route-state";
import type { SearchCategory } from "./search-types";
import {
  applyDesktopSearchReturnContext,
  resolveSearchNavigationTarget,
} from "./search-navigation";
import { buildDesktopChatThreadPath } from "../desktop/chat/desktop-chat-route-state";
import {
  hydrateSearchHistoryFromNative,
  loadSearchHistory,
  pushSearchHistory,
  SEARCH_HISTORY_STORAGE_KEY,
} from "./search-history";
import { buildSearchPreview, renderHighlightedText } from "./search-utils";
import type { SearchHistoryItem } from "./search-types";
import {
  type SearchQuickLink as DesktopSearchQuickLink,
  useSearchQuickLinks,
} from "./search-quick-links";

type UseDesktopSearchLauncherOptions = {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  source: SearchRouteSource;
};

type DesktopSearchDropdownPanelProps = {
  className?: string;
  history: SearchHistoryItem[];
  keyword: string;
  onOpenSearch: (keyword?: string) => void;
  onClose?: () => void;
  source: SearchRouteSource;
  speechDisplayText: string;
  speechError: string | null;
  speechStatus: SpeechInputStatus;
};

type SearchLauncherActionItem = {
  id: string;
  onSelect: () => void;
};

type SearchLauncherConversationMessageRow = {
  conversationId: string;
  createdAt: string;
  messageId: string;
  senderName: string;
  text: string;
};

type SearchLauncherConversationGroup = {
  header: DesktopSearchQuickLink;
  id: string;
  messages: DesktopSearchQuickLink[];
  sortTime: number;
  totalHits: number;
};

type SearchLauncherNavigationLayer = "input" | "panel";

type LauncherResultEntry = {
  id: string;
  title: string;
  description?: string;
  avatarName: string;
  avatarSrc?: string | null;
  onSelect: () => void;
};

type LauncherCategoryConfig = {
  category: SearchCategory;
  entries: LauncherResultEntry[];
  title: string;
  viewMoreActionId: string;
};

function buildSearchLauncherHistoryActionId(keyword: string) {
  return `history-${keyword}`;
}

const REMOTE_SEARCH_DEBOUNCE_MS = 280;

// eslint-disable-next-line react-refresh/only-export-components
export function useDesktopSearchLauncher({
  keyword,
  onKeywordChange,
  source,
}: UseDesktopSearchLauncherOptions) {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopSearchHistory = runtimeConfig.appPlatform === "desktop";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState(() => loadSearchHistory());
  const speech = useSpeechInput({
    baseUrl: runtimeConfig.apiBaseUrl,
    conversationId: "",
    enabled: true,
    mode: "dictation",
  });
  const speechCanCommit = speech.canCommit;
  const speechCommitToInput = speech.commitToInput;
  const speechStatus = speech.status;

  useEffect(() => {
    if (speechStatus !== "ready" || !speechCanCommit) {
      return;
    }

    onKeywordChange(speechCommitToInput(keyword));
  }, [
    keyword,
    onKeywordChange,
    speechCanCommit,
    speechCommitToInput,
    speechStatus,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const syncSearchHistory = async () => {
      const nextHistory = nativeDesktopSearchHistory
        ? await hydrateSearchHistoryFromNative()
        : loadSearchHistory();

      if (cancelled) {
        return;
      }

      setHistory((current) =>
        JSON.stringify(current) === JSON.stringify(nextHistory)
          ? current
          : nextHistory,
      );
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      // 走查电脑端群聊新会话 R110：和姊妹 R109 chat-composer sticker/plus
      // menu 同款 race —— 桌面工作区顶部「搜索聊天和联系人」框是 DesktopSearch
      // DropdownPanel，开着「聊天信息」侧栏在群聊里点搜索框输入时，按 Esc 关
      // 搜索 dropdown 会顺手把侧栏一起关掉：dropdown panel 根元素是裸 <div>
      // 没 role="dialog"/role="menu"，workspace dismissSidePanel microtask
      // DOM 查询命中不到 → 直接 dismiss。capture-phase + stopImmediatePropagation
      // 阻断 workspace bubble Esc handler。
      event.preventDefault();
      event.stopImmediatePropagation();
      setIsOpen(false);
    };
    const handleFocus = () => {
      void syncSearchHistory();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncSearchHistory();
    };
    // 走查 R2（新一轮）：和姊妹 chat-message-list R1 / detailedTimestamp 同款 —
    // 原版 storage 监听直接复用 handleFocus 不 gate key，多 tab 时主题切换 /
    // 草稿落盘 / 收藏指纹更新 / 任何 OTHER tab 写 localStorage 都触发
    // syncSearchHistory → desktop shell 拍一次 hydrateSearchHistoryFromNative
    // 的 Tauri invoke IPC + JSON.parse 整份 search-history。本 launcher 同时
    // 挂在 desktop-chat-workspace 和 contacts-workspace-shell 两个入口，单聊
    // 工作区只要打开搜索框就开始无效抖动。按 SEARCH_HISTORY_STORAGE_KEY gate；
    // event.key=null 是 Safari localStorage.clear()，按全量处理避免静默 stale。
    const handleStorageSync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SEARCH_HISTORY_STORAGE_KEY) {
        return;
      }
      void syncSearchHistory();
    };

    void syncSearchHistory();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorageSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorageSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isOpen, nativeDesktopSearchHistory]);

  function openSearch(nextKeyword = keyword) {
    const normalizedKeyword = nextKeyword.trim();

    if (normalizedKeyword) {
      setHistory(pushSearchHistory(normalizedKeyword));
      // 跟 search-page.handleCommitSearch 对齐——把搜索行为上报到
      // cyber-avatar / shake-discovery / need-discovery 的信号源。
      void recordSearchActivity(
        { query: normalizedKeyword, source: "desktop-launcher" },
        runtimeConfig.apiBaseUrl,
      ).catch(() => undefined);
    }

    setIsOpen(false);
    void navigate({
      to: "/tabs/search",
      hash: buildSearchRouteHash({
        category: "all",
        keyword: normalizedKeyword,
        source,
      }),
    });
  }

  const speechBusy =
    speech.status === "requesting-permission" || speech.status === "processing";
  const speechListening = speech.status === "listening";
  const speechButtonDisabled = speechBusy && !speechListening;

  function handleSpeechButtonClick() {
    setIsOpen(true);

    if (speechListening) {
      speech.stop();
      return;
    }

    if (speech.status !== "idle") {
      speech.cancel();
    }

    void speech.start();
  }

  return {
    close: () => setIsOpen(false),
    containerRef,
    handleSpeechButtonClick,
    history,
    isOpen,
    openSearch,
    setIsOpen,
    speechButtonDisabled,
    speechDisplayText: speech.displayText,
    speechError: speech.error,
    speechListening,
    speechStatus: speech.status,
    speechSupported: speech.supported,
  };
}

export function DesktopSearchDropdownPanel({
  className,
  history,
  keyword,
  onOpenSearch,
  onClose,
  source,
  speechDisplayText,
  speechError,
  speechStatus,
}: DesktopSearchDropdownPanelProps) {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const localMessageActionState = useLocalChatMessageActionState();
  const trimmedKeyword = keyword.trim();
  const normalizedKeyword = trimmedKeyword.toLowerCase();
  // 消息全文搜索是对**全部会话**并行打 HTTP（searchConversationMessages
  // / searchGroupMessages），每按一个键就是一整轮 fan-out。N=50 会话 +
  // 用户每秒打 4 个字 = 200 个并发请求/秒，公网隧道 RTT 600ms 会瞬间被
  // 排满。本地命中（friends / world characters / favorites / 会话标题）
  // 都是同步 filter，仍然用即时的 normalizedKeyword 给出实时反馈；只把
  // 远程的消息搜索 debounce 一下即可。和 desktop-chat-history-panel
  // 自己的搜索框 SEARCH_DEBOUNCE_MS=280 对齐。
  const [debouncedRemoteKeyword, setDebouncedRemoteKeyword] = useState(
    normalizedKeyword,
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedRemoteKeyword(normalizedKeyword);
    }, REMOTE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [normalizedKeyword]);
  const currentSearchRouteHash = useMemo(
    () =>
      buildSearchRouteHash({
        category: "all",
        keyword: trimmedKeyword,
        source,
      }),
    [source, trimmedKeyword],
  );
  const shouldLoadSuggestions = true;
  const { favoriteMatches } = useSearchQuickLinks(trimmedKeyword);

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: shouldLoadSuggestions,
    staleTime: 30_000,
  });
  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
    enabled: shouldLoadSuggestions,
    staleTime: 30_000,
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: shouldLoadSuggestions,
    staleTime: 30_000,
  });
  // officialAccounts 暂时从搜索 UI 隐藏：launcher 的"公众号"建议块同步撤掉，
  // 不发起 listOfficialAccounts 拉取。独立 /contacts/official-accounts 页
  // 还有它自己的 query，互不影响。

  const friendMatches = useMemo(() => {
    if (!normalizedKeyword) {
      return [] as FriendDirectoryItem[];
    }

    return createFriendDirectoryItems(friendsQuery.data ?? [])
      .filter((item) => matchesFriendSearch(item, normalizedKeyword))
      .slice(0, 4);
  }, [friendsQuery.data, normalizedKeyword]);

  const worldCharacterMatches = useMemo(() => {
    if (!normalizedKeyword) {
      return [] as WorldCharacterDirectoryItem[];
    }

    const friendIds = new Set(
      (friendsQuery.data ?? []).map((item) => item.character.id),
    );

    return createWorldCharacterDirectoryItems(
      (charactersQuery.data ?? []).filter((character) =>
        shouldIncludeInWorldCharacterDirectory(character, friendIds),
      ),
    )
      .filter((item) =>
        matchesCharacterSearch(item.character, normalizedKeyword),
      )
      .slice(0, 4);
  }, [charactersQuery.data, friendsQuery.data, normalizedKeyword]);
  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );
  const conversationsSearchKey = useMemo(
    () =>
      conversations
        .map(
          (item) =>
            `${item.source ?? item.type}:${item.id}:${item.lastActivityAt}`,
        )
        .join("|"),
    [conversations],
  );
  const conversationQuickLinks = useMemo(() => {
    return conversations.map((conversation) => {
      const preview = getConversationPreviewParts(
        conversation,
        localMessageActionState,
      );
      // R8：服务端 normalizeLegacyConversationEntity 在 direct 会话 title fallback
      // 全部失败时持久化字面量「未知联系人」/「Direct conversation」。桌面搜索浮层
      // （Ctrl/Cmd+K）quicklink title 和 AvatarChip 的 name fallback（用来取首字）
      // 都直接拿 raw title → en-US/ja-JP/ko-KR 用户在搜索结果里看到中文 sentinel，
      // AvatarChip 首字也取「未」/「D」不合 locale。和 ConversationCardLink R1 同款。
      const displayTitle = getConversationDisplayTitle(conversation.title);

      const quickLink: DesktopSearchQuickLink = {
        id: `conversation-${conversation.id}`,
        title: displayTitle,
        description: `${preview.prefix}${preview.text}`, // i18n-ignore-line
        meta: t(msg`${getConversationThreadLabel(conversation)} · ${conversation.participants.length} 位参与者`),
        badge: getConversationThreadLabel(conversation),
        to: buildDesktopChatThreadPath({
          conversationId: conversation.id,
        }),
        avatarName: displayTitle,
      };

      return quickLink;
    });
  }, [conversations, localMessageActionState, t]);
  const conversationQuickLinkById = useMemo(
    () =>
      new Map(
        conversationQuickLinks.map((item) => [
          item.id.replace(/^conversation-/, ""),
          item,
        ]),
      ),
    [conversationQuickLinks],
  );
  const conversationMessageMatchesQuery = useQuery({
    queryKey: [
      "desktop-search-launcher-message-matches",
      baseUrl,
      conversationsSearchKey,
      debouncedRemoteKeyword,
    ],
    enabled:
      shouldLoadSuggestions &&
      Boolean(debouncedRemoteKeyword) &&
      conversations.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const settledResults = await Promise.allSettled(
        conversations.map(async (conversation) => {
          const response = isPersistedGroupConversation(conversation)
            ? await searchGroupMessages(
                conversation.id,
                {
                  keyword: debouncedRemoteKeyword,
                  limit: 3,
                },
                baseUrl,
              )
            : await searchConversationMessages(
                conversation.id,
                {
                  keyword: debouncedRemoteKeyword,
                  limit: 3,
                },
                baseUrl,
              );

          return response.items.map((message) => ({
            conversationId: conversation.id,
            createdAt: message.createdAt,
            messageId: message.messageId,
            senderName: message.senderName,
            text: message.previewText || t(msg`这条消息没有可展示文本。`),
          }));
        }),
      );

      return settledResults.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      ) as SearchLauncherConversationMessageRow[];
    },
  });
  const conversationMessageGroups = useMemo<
    SearchLauncherConversationGroup[]
  >(() => {
    if (!normalizedKeyword) {
      return [] as SearchLauncherConversationGroup[];
    }

    const groupedMessages = new Map<
      string,
      SearchLauncherConversationMessageRow[]
    >();
    const nextGroups: SearchLauncherConversationGroup[] = [];

    for (const message of conversationMessageMatchesQuery.data ?? []) {
      if (
        shouldHideSearchableChatMessage(
          message.messageId,
          localMessageActionState,
        )
      ) {
        continue;
      }

      const current = groupedMessages.get(message.conversationId);
      if (current) {
        current.push(message);
        continue;
      }

      groupedMessages.set(message.conversationId, [message]);
    }

    for (const [conversationId, messages] of groupedMessages.entries()) {
      const header = conversationQuickLinkById.get(conversationId);
      if (!header) {
        continue;
      }

      const sortedMessages = [...messages].sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      );
      const latestTime = Date.parse(sortedMessages[0]?.createdAt ?? "");
      const conversationForBadge = conversations.find(
        (item) => item.id === conversationId,
      );
      const isGroupConversation = conversationForBadge
        ? isPersistedGroupConversation(conversationForBadge)
        : false;

      nextGroups.push({
        header,
        id: `conversation-group-${conversationId}`,
        messages: sortedMessages.slice(0, 3).map((message) => ({
          avatarName: header.avatarName,
          avatarSrc: header.avatarSrc,
          badge: isGroupConversation ? t(msg`群聊记录`) : t(msg`单聊记录`),
          description: `${message.senderName}：${buildSearchPreview(
            message.text,
            normalizedKeyword,
          )}`,
          id: `conversation-message-${message.messageId}`,
          meta: t(msg`聊天记录 · ${formatMessageTimestamp(message.createdAt)}`),
          title: header.title,
          to: buildDesktopChatThreadPath({
            conversationId,
            messageId: message.messageId,
          }),
        })),
        sortTime: Number.isNaN(latestTime) ? 0 : latestTime,
        totalHits: messages.length,
      });
    }

    return nextGroups
      .sort((left, right) => right.sortTime - left.sortTime)
      .slice(0, 4);
  }, [
    conversationMessageMatchesQuery.data,
    conversationQuickLinkById,
    conversations,
    localMessageActionState,
    normalizedKeyword,
    t,
  ]);
  const conversationGroupHeaderIds = useMemo(
    () => new Set(conversationMessageGroups.map((item) => item.header.id)),
    [conversationMessageGroups],
  );
  const conversationMatches = useMemo(() => {
    if (!normalizedKeyword) {
      return [] as DesktopSearchQuickLink[];
    }

    return conversationQuickLinks
      .filter((item) =>
        [item.title, item.description, item.meta, item.badge]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword),
      )
      .slice(0, 4);
  }, [conversationQuickLinks, normalizedKeyword]);
  const conversationOnlyMatches = useMemo(
    () =>
      conversationMatches.filter(
        (item) => !conversationGroupHeaderIds.has(item.id),
      ),
    [conversationGroupHeaderIds, conversationMatches],
  );
  const suggestionsLoading =
    shouldLoadSuggestions &&
    (friendsQuery.isLoading ||
      charactersQuery.isLoading ||
      conversationsQuery.isLoading ||
      conversationMessageMatchesQuery.isLoading);
  const suggestionsError =
    shouldLoadSuggestions &&
    (friendsQuery.error instanceof Error ||
      charactersQuery.error instanceof Error ||
      conversationsQuery.error instanceof Error);
  const hasSuggestionResults =
    conversationMessageGroups.length > 0 ||
    conversationOnlyMatches.length > 0 ||
    friendMatches.length > 0 ||
    worldCharacterMatches.length > 0 ||
    favoriteMatches.length > 0;
  const [activeActionId, setActiveActionId] =
    useState<string>("launcher-search");
  const [navigationLayer, setNavigationLayer] =
    useState<SearchLauncherNavigationLayer>("input");

  const applyDesktopSearchReturn = useCallback(
    (navigationTarget: ReturnType<typeof resolveSearchNavigationTarget>) => {
      return applyDesktopSearchReturnContext(
        navigationTarget,
        currentSearchRouteHash,
      );
    },
    [currentSearchRouteHash],
  );

  const handleOpenQuickLink = useCallback(
    (item: DesktopSearchQuickLink) => {
      const navigationTarget = applyDesktopSearchReturn(
        resolveSearchNavigationTarget(item, {
          desktopLayout: true,
        }),
      );
      onClose?.();
      void navigate({
        hash: navigationTarget.hash,
        to: navigationTarget.to as never,
        search: searchStringToObject(navigationTarget.search) as never,
      });
    },
    [applyDesktopSearchReturn, navigate, onClose],
  );

  const handleOpenCharacterDetail = useCallback(
    (characterId: string) => {
      const navigationTarget = applyDesktopSearchReturn({
        to: `/character/${characterId}`,
      });
      onClose?.();
      void navigate({
        hash: navigationTarget.hash,
        to: navigationTarget.to as never,
      });
    },
    [applyDesktopSearchReturn, navigate, onClose],
  );

  const buildViewMoreNavigate = useCallback(
    (category: SearchCategory) => {
      return () => {
        onClose?.();
        void navigate({
          to: "/tabs/search",
          hash: buildSearchRouteHash({
            category,
            keyword: trimmedKeyword,
            source,
          }),
        });
      };
    },
    [navigate, onClose, source, trimmedKeyword],
  );

  const chatEntries = useMemo<LauncherResultEntry[]>(() => {
    if (!trimmedKeyword) {
      return [];
    }

    const out: LauncherResultEntry[] = [];
    for (const group of conversationMessageGroups) {
      const firstMessage = group.messages[0];
      if (!firstMessage) {
        continue;
      }
      out.push({
        id: firstMessage.id,
        title: group.header.title,
        description: firstMessage.description,
        avatarName: group.header.avatarName ?? group.header.title,
        avatarSrc: group.header.avatarSrc,
        onSelect: () => handleOpenQuickLink(firstMessage),
      });
    }
    for (const item of conversationOnlyMatches) {
      out.push({
        id: item.id,
        title: item.title,
        description: item.description,
        avatarName: item.avatarName ?? item.title,
        avatarSrc: item.avatarSrc,
        onSelect: () => handleOpenQuickLink(item),
      });
    }
    return out;
  }, [
    conversationMessageGroups,
    conversationOnlyMatches,
    handleOpenQuickLink,
    trimmedKeyword,
  ]);

  const contactEntries = useMemo<LauncherResultEntry[]>(() => {
    if (!trimmedKeyword) {
      return [];
    }

    return friendMatches.map((item) => ({
      id: `friend-${item.character.id}`,
      title: getFriendDisplayName(item),
      description: buildFriendSuggestionDescription(item, t),
      avatarName: getFriendDisplayName(item),
      avatarSrc: item.character.avatar,
      onSelect: () => handleOpenCharacterDetail(item.character.id),
    }));
  }, [friendMatches, handleOpenCharacterDetail, t, trimmedKeyword]);

  const favoriteEntries = useMemo<LauncherResultEntry[]>(() => {
    if (!trimmedKeyword) {
      return [];
    }

    return favoriteMatches.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      avatarName: item.avatarName ?? item.title,
      avatarSrc: item.avatarSrc,
      onSelect: () => handleOpenQuickLink(item),
    }));
  }, [favoriteMatches, handleOpenQuickLink, trimmedKeyword]);

  const worldCharacterEntries = useMemo<LauncherResultEntry[]>(() => {
    if (!trimmedKeyword) {
      return [];
    }

    return worldCharacterMatches.map((item) => ({
      id: `world-character-${item.character.id}`,
      title: item.character.name,
      description:
        item.character.relationship?.trim() ||
        item.character.currentStatus?.trim() ||
        t(msg`打开资料卡后可发起好友申请`),
      avatarName: item.character.name,
      avatarSrc: item.character.avatar,
      onSelect: () => handleOpenCharacterDetail(item.character.id),
    }));
  }, [handleOpenCharacterDetail, t, trimmedKeyword, worldCharacterMatches]);

  const categories = useMemo<LauncherCategoryConfig[]>(
    () => [
      {
        category: "messages",
        entries: chatEntries,
        title: t(msg`聊天记录`),
        viewMoreActionId: "view-more-messages",
      },
      {
        category: "contacts",
        entries: contactEntries,
        title: t(msg`联系人`),
        viewMoreActionId: "view-more-contacts",
      },
      {
        category: "favorites",
        entries: favoriteEntries,
        title: t(msg`收藏`),
        viewMoreActionId: "view-more-favorites",
      },
      {
        category: "contacts",
        entries: worldCharacterEntries,
        title: t(msg`世界角色`),
        viewMoreActionId: "view-more-worldCharacters",
      },
    ],
    [
      chatEntries,
      contactEntries,
      favoriteEntries,
      t,
      worldCharacterEntries,
    ],
  );

  const actionItems = useMemo<SearchLauncherActionItem[]>(() => {
    const items: SearchLauncherActionItem[] = [
      {
        id: "launcher-search",
        onSelect: () => onOpenSearch(keyword),
      },
    ];

    if (trimmedKeyword) {
      categories.forEach((config) => {
        const visible = config.entries.slice(0, 3);
        visible.forEach((entry) => {
          items.push({ id: entry.id, onSelect: entry.onSelect });
        });
        if (config.entries.length > 3) {
          items.push({
            id: config.viewMoreActionId,
            onSelect: buildViewMoreNavigate(config.category),
          });
        }
      });
    } else {
      history.forEach((item) => {
        items.push({
          id: buildSearchLauncherHistoryActionId(item.keyword),
          onSelect: () => onOpenSearch(item.keyword),
        });
      });
    }

    return items;
  }, [
    buildViewMoreNavigate,
    categories,
    history,
    keyword,
    onOpenSearch,
    trimmedKeyword,
  ]);
  const panelActionItems = useMemo(
    () => actionItems.filter((item) => item.id !== "launcher-search"),
    [actionItems],
  );
  const panelActionIndex = useMemo(
    () => panelActionItems.findIndex((item) => item.id === activeActionId),
    [activeActionId, panelActionItems],
  );
  const preferredPanelActionId = useMemo(() => {
    if (
      activeActionId !== "launcher-search" &&
      panelActionItems.some((item) => item.id === activeActionId)
    ) {
      return activeActionId;
    }

    return panelActionItems[0]?.id ?? null;
  }, [activeActionId, panelActionItems]);
  const activateLauncherSearch = useCallback(() => {
    setNavigationLayer("input");
    setActiveActionId("launcher-search");
  }, []);
  const activatePanelAction = useCallback((actionId: string) => {
    setNavigationLayer("panel");
    setActiveActionId(actionId);
  }, []);

  useEffect(() => {
    setActiveActionId((current) => {
      if (actionItems.some((item) => item.id === current)) {
        return current;
      }

      if (navigationLayer === "panel" && panelActionItems[0]) {
        return panelActionItems[0].id;
      }

      return actionItems[0]?.id ?? "launcher-search";
    });
  }, [actionItems, navigationLayer, panelActionItems]);

  useEffect(() => {
    setNavigationLayer("input");
  }, [trimmedKeyword]);

  useEffect(() => {
    if (panelActionItems.length) {
      return;
    }

    setNavigationLayer("input");
    setActiveActionId("launcher-search");
  }, [panelActionItems.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Tab" && !event.shiftKey) {
        if (!panelActionItems.length) {
          return;
        }

        event.preventDefault();
        if (navigationLayer === "input") {
          activatePanelAction(
            preferredPanelActionId ?? panelActionItems[0]!.id,
          );
          return;
        }

        const nextIndex =
          panelActionIndex >= 0
            ? (panelActionIndex + 1) % panelActionItems.length
            : 0;
        activatePanelAction(
          panelActionItems[nextIndex]?.id ?? panelActionItems[0]!.id,
        );
        return;
      }

      if (event.key === "Tab" && event.shiftKey) {
        if (navigationLayer === "input") {
          return;
        }

        event.preventDefault();
        if (panelActionIndex <= 0) {
          activateLauncherSearch();
          return;
        }

        activatePanelAction(panelActionItems[panelActionIndex - 1]!.id);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (navigationLayer === "panel") {
          activateLauncherSearch();
          return;
        }

        onClose?.();
        return;
      }

      if (!actionItems.length) {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpenSearch(keyword);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!panelActionItems.length) {
          setNavigationLayer("input");
          setActiveActionId("launcher-search");
          return;
        }

        const nextIndex =
          navigationLayer === "panel" && panelActionIndex >= 0
            ? (panelActionIndex + 1) % panelActionItems.length
            : 0;
        activatePanelAction(
          panelActionItems[nextIndex]?.id ?? panelActionItems[0]!.id,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!panelActionItems.length) {
          setNavigationLayer("input");
          setActiveActionId("launcher-search");
          return;
        }

        const nextIndex =
          navigationLayer === "panel" && panelActionIndex >= 0
            ? (panelActionIndex - 1 + panelActionItems.length) %
              panelActionItems.length
            : panelActionItems.length - 1;
        activatePanelAction(
          panelActionItems[nextIndex]?.id ?? panelActionItems[0]!.id,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (navigationLayer === "input") {
          onOpenSearch(keyword);
          return;
        }

        const activeItem =
          panelActionItems[panelActionIndex >= 0 ? panelActionIndex : 0] ??
          null;
        if (activeItem) {
          activeItem.onSelect();
          return;
        }

        onOpenSearch(keyword);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    actionItems,
    activateLauncherSearch,
    activatePanelAction,
    activeActionId,
    keyword,
    navigationLayer,
    onClose,
    onOpenSearch,
    panelActionIndex,
    panelActionItems,
    preferredPanelActionId,
  ]);

  return (
    <div
      className={cn(
        "absolute left-0 right-0 top-[calc(100%+0.45rem)] z-30 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]/98 p-2.5 shadow-[var(--shadow-overlay)] backdrop-blur-xl",
        className,
      )}
    >
      {speechStatus !== "idle" || speechError ? (
        <SearchLauncherStatusCard
          description={
            speechError
              ? speechError
              : speechStatus === "requesting-permission"
                ? t(msg`正在请求麦克风权限...`)
                : speechStatus === "listening"
                  ? t(msg`正在听你说，完成后再点一次语音图标。`)
                  : speechStatus === "processing"
                    ? t(msg`正在整理语音内容...`)
                    : speechDisplayText
                      ? t(msg`识别结果：${speechDisplayText}`)
                      : t(msg`语音输入已完成。`)
          }
          status={
            speechError
              ? "error"
              : speechStatus === "listening"
                ? "recording"
                : speechStatus === "processing" ||
                    speechStatus === "requesting-permission"
                  ? "pending"
                  : "done"
          }
          title={t(msg`搜索输入`)}
        />
      ) : null}

      {trimmedKeyword ? (
        <div className="mt-1">
          {suggestionsLoading ? (
            <div className="px-2 py-3 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
              {t(msg`正在整理结果...`)}
            </div>
          ) : null}

          {!suggestionsLoading && suggestionsError ? (
            <div className="px-2 py-3 text-[length:var(--text-caption)] text-[color:var(--state-danger-text)]">
              {t(msg`搜索建议暂时读取失败，请按 Enter 进入完整搜索。`)}
            </div>
          ) : null}

          {!suggestionsLoading && !suggestionsError ? (
            <>
              {categories.map((config) => {
                if (!config.entries.length) {
                  return null;
                }

                const visible = config.entries.slice(0, 3);
                const hasMore = config.entries.length > 3;

                return (
                  <section
                    key={config.viewMoreActionId}
                    className="mt-1 first:mt-0"
                  >
                    <div className="px-2 pb-1 pt-2 text-[length:var(--text-eyebrow)] font-medium text-[color:var(--text-muted)]">
                      {config.title}
                    </div>
                    <div className="space-y-0.5">
                      {visible.map((entry) => (
                        <SearchLauncherResultRow
                          key={entry.id}
                          active={activeActionId === entry.id}
                          entry={entry}
                          keyword={trimmedKeyword}
                          onMouseEnter={() => activatePanelAction(entry.id)}
                        />
                      ))}
                      {hasMore ? (
                        <SearchLauncherViewMoreRow
                          active={
                            activeActionId === config.viewMoreActionId
                          }
                          label={t(msg`查看更多 ${config.entries.length} 条 ${config.title} →`)}
                          onMouseEnter={() =>
                            activatePanelAction(config.viewMoreActionId)
                          }
                          onClick={buildViewMoreNavigate(config.category)}
                        />
                      ) : null}
                    </div>
                  </section>
                );
              })}

              {!hasSuggestionResults ? (
                <div className="px-2 py-3 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                  {t(msg`没有直接命中的结果，按 Enter 进入完整搜索。`)}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {history.length ? (
        <section className="mt-1">
          <div className="px-2 pb-1 pt-2 text-[length:var(--text-eyebrow)] font-medium text-[color:var(--text-muted)]">
            {t(msg`搜索历史`)}
          </div>
          <div className="space-y-0.5">
            {history.map((item) => {
              const actionId = buildSearchLauncherHistoryActionId(item.keyword);
              const active = activeActionId === actionId;
              return (
                <button
                  key={item.keyword}
                  type="button"
                  onClick={() => onOpenSearch(item.keyword)}
                  onMouseEnter={() => activatePanelAction(actionId)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-left text-[length:var(--text-caption)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                    active
                      ? "bg-[color:var(--surface-console)] text-[color:var(--text-primary)]"
                      : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <Clock3
                    size={13}
                    className="shrink-0 text-[color:var(--text-dim)]"
                  />
                  <span className="truncate">
                    {renderHighlightedText(item.keyword, trimmedKeyword)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SearchLauncherResultRow({
  active,
  entry,
  keyword,
  onMouseEnter,
}: {
  active: boolean;
  entry: LauncherResultEntry;
  keyword: string;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={entry.onSelect}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "bg-[color:var(--surface-console)]"
          : "hover:bg-[color:var(--surface-console)]",
      )}
    >
      <AvatarChip name={entry.avatarName} src={entry.avatarSrc} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
          {renderHighlightedText(entry.title, keyword)}
        </div>
        {entry.description ? (
          <div className="mt-0.5 truncate text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
            {renderHighlightedText(entry.description, keyword)}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function SearchLauncherViewMoreRow({
  active,
  label,
  onClick,
  onMouseEnter,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-[8px] px-2 py-1.5 text-left text-[length:var(--text-caption)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "bg-[color:var(--surface-console)] text-[color:var(--text-primary)]"
          : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
      )}
    >
      <span className="truncate">{label}</span>
      <ChevronRight size={12} className="shrink-0" />
    </button>
  );
}

function SearchLauncherStatusCard({
  action,
  description,
  status,
  title,
}: {
  action?: ReactNode;
  description: string;
  status: "done" | "empty" | "error" | "pending" | "recording";
  title: string;
}) {
  const t = useRuntimeTranslator();
  const toneClassName =
    status === "error"
      ? "border-[color:var(--state-danger-bg)] bg-[color:var(--state-danger-bg)]"
      : status === "empty"
        ? "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
        : status === "recording"
          ? "border-[color-mix(in_srgb,var(--brand-primary)_18%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]";
  const badgeClassName =
    status === "error"
      ? "bg-[color:var(--surface-card)] text-[color:var(--state-danger-text)]"
      : status === "empty"
        ? "bg-[color:var(--surface-card)] text-[color:var(--text-muted)]"
        : status === "recording"
          ? "bg-[color:var(--surface-card)] text-[color:var(--brand-primary)]"
          : "bg-[color:var(--surface-card)] text-[color:var(--text-muted)]";
  const statusLabel =
    status === "error"
      ? t(msg`异常`)
      : status === "empty"
        ? t(msg`无结果`)
        : status === "recording"
          ? t(msg`录音中`)
          : status === "pending"
            ? t(msg`处理中`)
            : t(msg`已完成`);

  return (
    <section className={cn("mt-2 rounded-[var(--radius-md)] border p-3.5", toneClassName)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[length:var(--text-eyebrow)] font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        <div
          className={cn("rounded-full px-2.5 py-1 text-[10px]", badgeClassName)}
        >
          {statusLabel}
        </div>
      </div>
      <div
        className={cn(
          "mt-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-card)] px-3 py-2.5 text-xs leading-6",
          status === "error"
            ? "text-[color:var(--state-danger-text)]"
            : "text-[color:var(--text-secondary)]",
        )}
      >
        {description}
      </div>
      {action ? (
        <div className="mt-3 flex items-center justify-end">{action}</div>
      ) : null}
    </section>
  );
}

function buildFriendSuggestionDescription(
  item: FriendDirectoryItem,
  t: (descriptor: MessageDescriptor) => string,
) {
  if (getFriendDisplayName(item) !== item.character.name) {
    return t(msg`昵称：${item.character.name}`);
  }

  const tags = item.friendship.tags?.filter(Boolean).join("、");
  return (
    item.character.relationship?.trim() ||
    tags ||
    item.character.currentStatus?.trim() ||
    t(msg`打开联系人资料`)
  );
}


