import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Blocks,
  Bookmark,
  Clock3,
  CornerDownLeft,
  MessageSquareText,
  Newspaper,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import {
  getConversations,
  getFriends,
  listOfficialAccounts,
  listCharacters,
  searchConversationMessages,
  searchGroupMessages,
} from "@yinjie/contracts";
import { Button, cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { getConversationPreviewParts } from "../../lib/conversation-preview";
import { formatMessageTimestamp } from "../../lib/format";
import {
  getConversationThreadLabel,
  getConversationThreadPath,
  isPersistedGroupConversation,
} from "../../lib/conversation-route";
import {
  createFriendDirectoryItems,
  createWorldCharacterDirectoryItems,
  getFriendDisplayName,
  matchesCharacterSearch,
  matchesFriendSearch,
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
import { buildDesktopAddFriendRouteHash } from "../desktop/contacts/desktop-add-friend-route-state";
import {
  hydrateSearchHistoryFromNative,
  loadSearchHistory,
  pushSearchHistory,
} from "./search-history";
import { buildSearchPreview, renderHighlightedText } from "./search-utils";
import type { SearchHistoryItem } from "./search-types";
import {
  type DesktopSearchQuickLink,
  useDesktopSearchQuickLinks,
} from "./desktop-search-quick-links";

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
  speechDisplayText: string;
  speechError: string | null;
  speechStatus: SpeechInputStatus;
};

type SearchLauncherActionItem = {
  id: string;
  onSelect: () => void;
};

type SearchLauncherOfficialGroup = {
  article: DesktopSearchQuickLink | null;
  header: DesktopSearchQuickLink;
  id: string;
  sortTime: number;
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

type SearchLauncherFocusRegion =
  | "input"
  | "suggestions"
  | "quickAccess"
  | "history";

type SearchLauncherNavigationLayer = "input" | "panel";

type SearchLauncherFocusPanelId =
  | "chatSuggestions"
  | "officialSuggestions"
  | "contactSuggestions"
  | "worldCharacterSuggestions"
  | "favoriteSuggestions"
  | "miniProgramSuggestions"
  | "recentConversations"
  | "recentOfficials"
  | "recentMiniPrograms"
  | "recentFavorites"
  | "history"
  | null;

const searchLauncherFocusRegionLabels: Record<
  SearchLauncherFocusRegion,
  string
> = {
  input: "搜索框",
  suggestions: "建议区",
  quickAccess: "快捷访问",
  history: "历史搜索",
};

function buildSearchLauncherHistoryActionId(keyword: string) {
  return `history-${keyword}`;
}

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

  useEffect(() => {
    if (speech.status !== "ready" || !speech.canCommit) {
      return;
    }

    onKeywordChange(speech.commitToInput(keyword));
  }, [
    keyword,
    onKeywordChange,
    speech.canCommit,
    speech.commitToInput,
    speech.status,
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

    void syncSearchHistory();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isOpen, nativeDesktopSearchHistory]);

  function openSearch(nextKeyword = keyword) {
    const normalizedKeyword = nextKeyword.trim();

    if (normalizedKeyword) {
      setHistory(pushSearchHistory(normalizedKeyword));
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
  speechDisplayText,
  speechError,
  speechStatus,
}: DesktopSearchDropdownPanelProps) {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const localMessageActionState = useLocalChatMessageActionState();
  const trimmedKeyword = keyword.trim();
  const normalizedKeyword = trimmedKeyword.toLowerCase();
  const shouldLoadSuggestions = true;
  const {
    favoriteMatches,
    favoritesError,
    favoritesLoading,
    miniProgramMatches,
    recentFavorites,
    recentMiniPrograms,
  } = useDesktopSearchQuickLinks(trimmedKeyword);

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
  const officialAccountsQuery = useQuery({
    queryKey: ["app-official-accounts", baseUrl],
    queryFn: () => listOfficialAccounts(baseUrl),
    enabled: shouldLoadSuggestions,
    staleTime: 30_000,
  });

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
      (charactersQuery.data ?? []).filter(
        (character) => !friendIds.has(character.id),
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

      const quickLink: DesktopSearchQuickLink = {
        id: `conversation-${conversation.id}`,
        title: conversation.title,
        description: `${preview.prefix}${preview.text}`,
        meta: `${getConversationThreadLabel(conversation)} · ${conversation.participants.length} 位参与者`,
        badge: getConversationThreadLabel(conversation),
        to: getConversationThreadPath(conversation),
        avatarName: conversation.title,
      };

      return quickLink;
    });
  }, [conversations, localMessageActionState]);
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
      normalizedKeyword,
    ],
    enabled:
      shouldLoadSuggestions &&
      Boolean(normalizedKeyword) &&
      conversations.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const settledResults = await Promise.allSettled(
        conversations.map(async (conversation) => {
          const response = isPersistedGroupConversation(conversation)
            ? await searchGroupMessages(
                conversation.id,
                {
                  keyword: normalizedKeyword,
                  limit: 3,
                },
                baseUrl,
              )
            : await searchConversationMessages(
                conversation.id,
                {
                  keyword: normalizedKeyword,
                  limit: 3,
                },
                baseUrl,
              );

          return response.items.map((message) => ({
            conversationId: conversation.id,
            createdAt: message.createdAt,
            messageId: message.messageId,
            senderName: message.senderName,
            text: message.previewText || "这条消息没有可展示文本。",
          }));
        }),
      );

      return settledResults.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      ) as SearchLauncherConversationMessageRow[];
    },
  });
  const conversationMessageGroups = useMemo<SearchLauncherConversationGroup[]>(
    () => {
      if (!normalizedKeyword) {
        return [] as SearchLauncherConversationGroup[];
      }

      const groupedMessages = new Map<string, SearchLauncherConversationMessageRow[]>();
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
          (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
        );
        const latestTime = Date.parse(sortedMessages[0]?.createdAt ?? "");

        nextGroups.push({
            header,
            id: `conversation-group-${conversationId}`,
            messages: sortedMessages.slice(0, 3).map((message) => ({
              avatarName: header.avatarName,
              avatarSrc: header.avatarSrc,
              badge: header.badge === "群聊" ? "群聊记录" : "单聊记录",
              description: `${message.senderName}：${buildSearchPreview(
                message.text,
                normalizedKeyword,
              )}`,
              hash: `chat-message-${message.messageId}`,
              id: `conversation-message-${message.messageId}`,
              meta: `聊天记录 · ${formatMessageTimestamp(message.createdAt)}`,
              title: header.title,
              to: header.to,
            })),
            sortTime: Number.isNaN(latestTime) ? 0 : latestTime,
            totalHits: messages.length,
          });
      }

      return nextGroups
        .sort((left, right) => right.sortTime - left.sortTime)
        .slice(0, 4);
    },
    [
      conversationMessageMatchesQuery.data,
      conversationQuickLinkById,
      localMessageActionState,
      normalizedKeyword,
    ],
  );
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
  const recentConversations = useMemo(
    () => conversationQuickLinks.slice(0, 4),
    [conversationQuickLinks],
  );
  const officialGroups = useMemo<SearchLauncherOfficialGroup[]>(() => {
    return (officialAccountsQuery.data ?? []).map((account) => {
      const header = {
        id: `official-account-${account.id}`,
        title: account.name,
        description:
          account.description ||
          account.recentArticle?.summary ||
          "打开公众号主页与最近文章。",
        meta: `${account.accountType === "service" ? "服务号" : "订阅号"} · @${
          account.handle
        }`,
        badge: account.accountType === "service" ? "服务号" : "订阅号",
        to: `/official-accounts/${account.id}`,
        avatarName: account.name,
        avatarSrc: account.avatar,
      } satisfies DesktopSearchQuickLink;
      const article = account.recentArticle
        ? ({
            id: `official-article-${account.recentArticle.id}`,
            title: account.recentArticle.title,
            description:
              account.recentArticle.summary || `来自 ${account.name} 的最近文章`,
            meta: `公众号文章 · ${account.name}`,
            badge: "公众号文章",
            to: `/official-accounts/articles/${account.recentArticle.id}`,
            avatarName: account.name,
            avatarSrc: account.avatar,
          } satisfies DesktopSearchQuickLink)
        : null;
      const sortTime = Date.parse(
        account.recentArticle?.publishedAt ?? account.lastPublishedAt ?? "",
      );

      return {
        article,
        header,
        id: `official-group-${account.id}`,
        sortTime: Number.isNaN(sortTime) ? 0 : sortTime,
      };
    });
  }, [officialAccountsQuery.data]);
  const officialMatches = useMemo(() => {
    if (!normalizedKeyword) {
      return [] as SearchLauncherOfficialGroup[];
    }

    return officialGroups
      .filter(
        (group) =>
          matchesLauncherQuickLink(group.header, normalizedKeyword) ||
          (group.article
            ? matchesLauncherQuickLink(group.article, normalizedKeyword)
            : false),
      )
      .slice(0, 4);
  }, [normalizedKeyword, officialGroups]);
  const recentOfficials = useMemo(() => {
    return officialGroups
      .slice()
      .sort((left, right) => right.sortTime - left.sortTime)
      .slice(0, 4);
  }, [officialGroups]);

  const suggestionsLoading =
    shouldLoadSuggestions &&
    (friendsQuery.isLoading ||
      charactersQuery.isLoading ||
      conversationsQuery.isLoading ||
      conversationMessageMatchesQuery.isLoading ||
      officialAccountsQuery.isLoading);
  const suggestionsError =
    shouldLoadSuggestions &&
    (friendsQuery.error instanceof Error ||
      charactersQuery.error instanceof Error ||
      conversationsQuery.error instanceof Error ||
      officialAccountsQuery.error instanceof Error);
  const hasSuggestionResults =
    conversationMessageGroups.length > 0 ||
    conversationOnlyMatches.length > 0 ||
    friendMatches.length > 0 ||
    worldCharacterMatches.length > 0 ||
    officialMatches.length > 0 ||
    favoriteMatches.length > 0 ||
    miniProgramMatches.length > 0;
  const [activeActionId, setActiveActionId] =
    useState<string>("launcher-search");
  const [navigationLayer, setNavigationLayer] =
    useState<SearchLauncherNavigationLayer>("input");

  const handleOpenQuickLink = useCallback(
    (item: DesktopSearchQuickLink) => {
      onClose?.();
      void navigate({
        hash: item.hash as never,
        to: item.to as never,
        search: item.search as never,
      });
    },
    [navigate, onClose],
  );

  const actionItems = useMemo<SearchLauncherActionItem[]>(() => {
    const items: SearchLauncherActionItem[] = [
      {
        id: "launcher-search",
        onSelect: () => onOpenSearch(keyword),
      },
    ];

    if (trimmedKeyword) {
      conversationMessageGroups.forEach((group) => {
        items.push({
          id: group.header.id,
          onSelect: () => handleOpenQuickLink(group.header),
        });

        group.messages.forEach((item) => {
          items.push({
            id: item.id,
            onSelect: () => handleOpenQuickLink(item),
          });
        });
      });

      conversationOnlyMatches.forEach((item) => {
        items.push({
          id: item.id,
          onSelect: () => handleOpenQuickLink(item),
        });
      });

      officialMatches.forEach((group) => {
        items.push({
          id: group.header.id,
          onSelect: () => handleOpenQuickLink(group.header),
        });

        const article = group.article;
        if (article) {
          items.push({
            id: article.id,
            onSelect: () => handleOpenQuickLink(article),
          });
        }
      });

      friendMatches.forEach((item) => {
        items.push({
          id: `friend-${item.character.id}`,
          onSelect: () => {
            onClose?.();
            void navigate({
              to: "/character/$characterId",
              params: { characterId: item.character.id },
            });
          },
        });
      });

      worldCharacterMatches.forEach((item) => {
        items.push({
          id: `world-character-${item.character.id}`,
          onSelect: () => {
            onClose?.();
            void navigate({
              to: "/character/$characterId",
              params: { characterId: item.character.id },
            });
          },
        });
      });

      favoriteMatches.forEach((item) => {
        items.push({
          id: item.id,
          onSelect: () => handleOpenQuickLink(item),
        });
      });

      miniProgramMatches.forEach((item) => {
        items.push({
          id: item.id,
          onSelect: () => handleOpenQuickLink(item),
        });
      });
    } else {
      recentConversations.forEach((item) => {
        items.push({
          id: item.id,
          onSelect: () => handleOpenQuickLink(item),
        });
      });

      recentOfficials.forEach((group) => {
        items.push({
          id: group.header.id,
          onSelect: () => handleOpenQuickLink(group.header),
        });

        const article = group.article;
        if (article) {
          items.push({
            id: article.id,
            onSelect: () => handleOpenQuickLink(article),
          });
        }
      });

      recentMiniPrograms.forEach((item) => {
        items.push({
          id: item.id,
          onSelect: () => handleOpenQuickLink(item),
        });
      });

      recentFavorites.forEach((item) => {
        items.push({
          id: item.id,
          onSelect: () => handleOpenQuickLink(item),
        });
      });

      history.forEach((item) => {
        items.push({
          id: buildSearchLauncherHistoryActionId(item.keyword),
          onSelect: () => onOpenSearch(item.keyword),
        });
      });
    }

    return items;
  }, [
    conversationMessageGroups,
    conversationOnlyMatches,
    favoriteMatches,
    friendMatches,
    handleOpenQuickLink,
    history,
    keyword,
    miniProgramMatches,
    navigate,
    onClose,
    onOpenSearch,
    officialMatches,
    recentConversations,
    recentFavorites,
    recentOfficials,
    recentMiniPrograms,
    trimmedKeyword,
    worldCharacterMatches,
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
  const activeFocusContext = useMemo(() => {
    if (navigationLayer === "input") {
      return {
        panelId: null as SearchLauncherFocusPanelId,
        panelTitle: "搜一搜主入口",
        region: "input" as SearchLauncherFocusRegion,
      };
    }

    const historyIds = new Set(
      history.map((item) => buildSearchLauncherHistoryActionId(item.keyword)),
    );
    if (historyIds.has(activeActionId)) {
      return {
        panelId: "history" as SearchLauncherFocusPanelId,
        panelTitle: "最近搜索",
        region: "history" as SearchLauncherFocusRegion,
      };
    }

    if (trimmedKeyword) {
      const chatSuggestionIds = new Set<string>();
      conversationMessageGroups.forEach((group) => {
        chatSuggestionIds.add(group.header.id);
        group.messages.forEach((item) => {
          chatSuggestionIds.add(item.id);
        });
      });
      conversationOnlyMatches.forEach((item) => {
        chatSuggestionIds.add(item.id);
      });
      if (chatSuggestionIds.has(activeActionId)) {
        return {
          panelId: "chatSuggestions" as SearchLauncherFocusPanelId,
          panelTitle: "聊天",
          region: "suggestions" as SearchLauncherFocusRegion,
        };
      }

      const officialSuggestionIds = new Set<string>();
      officialMatches.forEach((group) => {
        officialSuggestionIds.add(group.header.id);
        if (group.article) {
          officialSuggestionIds.add(group.article.id);
        }
      });
      if (officialSuggestionIds.has(activeActionId)) {
        return {
          panelId: "officialSuggestions" as SearchLauncherFocusPanelId,
          panelTitle: "公众号",
          region: "suggestions" as SearchLauncherFocusRegion,
        };
      }

      const contactSuggestionIds = new Set(
        friendMatches.map((item) => `friend-${item.character.id}`),
      );
      if (contactSuggestionIds.has(activeActionId)) {
        return {
          panelId: "contactSuggestions" as SearchLauncherFocusPanelId,
          panelTitle: "联系人",
          region: "suggestions" as SearchLauncherFocusRegion,
        };
      }

      const worldCharacterSuggestionIds = new Set(
        worldCharacterMatches.map((item) => `world-character-${item.character.id}`),
      );
      if (worldCharacterSuggestionIds.has(activeActionId)) {
        return {
          panelId: "worldCharacterSuggestions" as SearchLauncherFocusPanelId,
          panelTitle: "世界角色",
          region: "suggestions" as SearchLauncherFocusRegion,
        };
      }

      const favoriteSuggestionIds = new Set(
        favoriteMatches.map((item) => item.id),
      );
      if (favoriteSuggestionIds.has(activeActionId)) {
        return {
          panelId: "favoriteSuggestions" as SearchLauncherFocusPanelId,
          panelTitle: "收藏",
          region: "suggestions" as SearchLauncherFocusRegion,
        };
      }

      const miniProgramSuggestionIds = new Set(
        miniProgramMatches.map((item) => item.id),
      );
      if (miniProgramSuggestionIds.has(activeActionId)) {
        return {
          panelId: "miniProgramSuggestions" as SearchLauncherFocusPanelId,
          panelTitle: "小程序",
          region: "suggestions" as SearchLauncherFocusRegion,
        };
      }

      return {
        panelId: null as SearchLauncherFocusPanelId,
        panelTitle: "搜索建议",
        region: "suggestions" as SearchLauncherFocusRegion,
      };
    }

    if (recentConversations.some((item) => item.id === activeActionId)) {
      return {
        panelId: "recentConversations" as SearchLauncherFocusPanelId,
        panelTitle: "最近聊天",
        region: "quickAccess" as SearchLauncherFocusRegion,
      };
    }

    const recentOfficialIds = new Set<string>();
    recentOfficials.forEach((group) => {
      recentOfficialIds.add(group.header.id);
      if (group.article) {
        recentOfficialIds.add(group.article.id);
      }
    });
    if (recentOfficialIds.has(activeActionId)) {
      return {
        panelId: "recentOfficials" as SearchLauncherFocusPanelId,
        panelTitle: "最近公众号",
        region: "quickAccess" as SearchLauncherFocusRegion,
      };
    }

    if (recentMiniPrograms.some((item) => item.id === activeActionId)) {
      return {
        panelId: "recentMiniPrograms" as SearchLauncherFocusPanelId,
        panelTitle: "最近使用的小程序",
        region: "quickAccess" as SearchLauncherFocusRegion,
      };
    }

    if (recentFavorites.some((item) => item.id === activeActionId)) {
      return {
        panelId: "recentFavorites" as SearchLauncherFocusPanelId,
        panelTitle: "最近收藏",
        region: "quickAccess" as SearchLauncherFocusRegion,
      };
    }

    return {
      panelId: null as SearchLauncherFocusPanelId,
      panelTitle: "快捷访问",
      region: "quickAccess" as SearchLauncherFocusRegion,
    };
  }, [
    activeActionId,
    conversationMessageGroups,
    conversationOnlyMatches,
    favoriteMatches,
    friendMatches,
    history,
    miniProgramMatches,
    officialMatches,
    recentConversations,
    recentFavorites,
    recentOfficials,
    recentMiniPrograms,
    trimmedKeyword,
    worldCharacterMatches,
    navigationLayer,
  ]);

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
          activatePanelAction(preferredPanelActionId ?? panelActionItems[0]!.id);
          return;
        }

        const nextIndex =
          panelActionIndex >= 0
            ? (panelActionIndex + 1) % panelActionItems.length
            : 0;
        activatePanelAction(panelActionItems[nextIndex]?.id ?? panelActionItems[0]!.id);
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
        activatePanelAction(panelActionItems[nextIndex]?.id ?? panelActionItems[0]!.id);
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
        activatePanelAction(panelActionItems[nextIndex]?.id ?? panelActionItems[0]!.id);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (navigationLayer === "input") {
          onOpenSearch(keyword);
          return;
        }

        const activeItem =
          panelActionItems[panelActionIndex >= 0 ? panelActionIndex : 0] ?? null;
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
        "absolute left-0 right-0 top-[calc(100%+0.45rem)] z-30 overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-white/98 p-2.5 shadow-[var(--shadow-overlay)] backdrop-blur-xl",
        className,
      )}
    >
      <SearchLauncherHeroCard
        active={navigationLayer === "input"}
        keyword={trimmedKeyword}
        onClick={() => onOpenSearch(keyword)}
        onMouseEnter={activateLauncherSearch}
      />

      {speechStatus !== "idle" || speechError ? (
        <SearchLauncherStatusCard
          description={
            speechError
              ? speechError
              : speechStatus === "requesting-permission"
                ? "正在请求麦克风权限..."
                : speechStatus === "listening"
                  ? "正在听你说，完成后再点一次语音图标。"
                  : speechStatus === "processing"
                    ? "正在整理语音内容..."
                    : speechDisplayText
                      ? `识别结果：${speechDisplayText}`
                      : "语音输入已完成。"
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
          title="语音输入"
        />
      ) : null}

      <SearchLauncherFocusStrip
        keyword={trimmedKeyword}
        layer={navigationLayer}
        panelTitle={activeFocusContext.panelTitle}
        region={activeFocusContext.region}
      />

      {trimmedKeyword ? (
        <SearchLauncherSection
          title="搜索建议"
          className="mt-3"
          highlighted={activeFocusContext.region === "suggestions"}
        >
          {suggestionsLoading ? (
            <div className="rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
              正在整理聊天、联系人、公众号、收藏和小程序结果...
            </div>
          ) : null}

          {suggestionsError ? (
            <div className="rounded-[12px] bg-[rgba(225,29,72,0.08)] px-3 py-3 text-xs leading-6 text-[#be123c]">
              搜索建议暂时读取失败，请先试试搜一搜。
            </div>
          ) : null}

          {favoritesError ? (
            <div className="rounded-[12px] bg-[rgba(225,29,72,0.08)] px-3 py-3 text-xs leading-6 text-[#be123c]">
              收藏列表暂时读取失败，可以直接进入搜一搜继续搜索。
            </div>
          ) : null}

          {!suggestionsLoading && !suggestionsError ? (
            <div className="space-y-3">
              {conversationMessageGroups.length || conversationOnlyMatches.length ? (
                <SearchLauncherCollectionCard
                  countLabel={`${conversationMessageGroups.length + conversationOnlyMatches.length} 组结果`}
                  highlighted={activeFocusContext.panelId === "chatSuggestions"}
                  title="聊天"
                >
                  <div className="space-y-2">
                    {conversationMessageGroups.map((group) => (
                      <SearchLauncherConversationGroupCard
                        key={group.id}
                        activeHeaderId={activeActionId}
                        activeMessageId={activeActionId}
                        group={group}
                        keyword={trimmedKeyword}
                        onOpenHeader={(item) => handleOpenQuickLink(item)}
                        onOpenMessage={(item) => handleOpenQuickLink(item)}
                        onSelectHeader={(item) => activatePanelAction(item.id)}
                        onSelectMessage={(item) => activatePanelAction(item.id)}
                      />
                    ))}

                    {conversationOnlyMatches.length ? (
                      <div className="rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3.5 py-3">
                        <div className="px-0.5 text-[11px] font-medium text-[color:var(--text-muted)]">
                          会话命中
                        </div>
                        <div className="mt-2.5 space-y-2">
                          {conversationOnlyMatches.map((item) => (
                            <SearchLauncherConversationThreadCard
                              key={item.id}
                              active={activeActionId === item.id}
                              item={item}
                              keyword={trimmedKeyword}
                              onMouseEnter={() => activatePanelAction(item.id)}
                              onClick={() => handleOpenQuickLink(item)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </SearchLauncherCollectionCard>
              ) : null}

              {officialMatches.length ? (
                <SearchLauncherCollectionCard
                  countLabel={`${officialMatches.length} 个入口`}
                  highlighted={
                    activeFocusContext.panelId === "officialSuggestions"
                  }
                  title="公众号"
                >
                  <div className="space-y-1.5">
                    {officialMatches.map((group) => (
                      <SearchLauncherOfficialGroupCard
                        key={group.id}
                        activeArticleId={activeActionId}
                        activeHeaderId={activeActionId}
                        group={group}
                        keyword={trimmedKeyword}
                        onOpenArticle={(item) => handleOpenQuickLink(item)}
                        onOpenHeader={(item) => handleOpenQuickLink(item)}
                        onSelectArticle={(item) => activatePanelAction(item.id)}
                        onSelectHeader={(item) => activatePanelAction(item.id)}
                      />
                    ))}
                  </div>
                </SearchLauncherCollectionCard>
              ) : null}

              {friendMatches.length ? (
                <SearchLauncherCollectionCard
                  countLabel={`${friendMatches.length} 位联系人`}
                  highlighted={
                    activeFocusContext.panelId === "contactSuggestions"
                  }
                  title="联系人"
                >
                  <div className="space-y-1.5">
                    {friendMatches.map((item) => (
                      <SearchLauncherCharacterRow
                        key={`friend-${item.character.id}`}
                        active={
                          activeActionId === `friend-${item.character.id}`
                        }
                        avatarName={getFriendDisplayName(item)}
                        avatarSrc={item.character.avatar}
                        badge="联系人"
                        description={buildFriendSuggestionDescription(item)}
                        keyword={trimmedKeyword}
                        title={getFriendDisplayName(item)}
                        variant="contact"
                        onMouseEnter={() =>
                          activatePanelAction(`friend-${item.character.id}`)
                        }
                        onClick={() => {
                          onClose?.();
                          void navigate({
                            to: "/character/$characterId",
                            params: { characterId: item.character.id },
                          });
                        }}
                      />
                    ))}
                  </div>
                </SearchLauncherCollectionCard>
              ) : null}

              {worldCharacterMatches.length ? (
                <SearchLauncherCollectionCard
                  countLabel={`${worldCharacterMatches.length} 位角色`}
                  highlighted={
                    activeFocusContext.panelId === "worldCharacterSuggestions"
                  }
                  title="世界角色"
                >
                  <div className="space-y-1.5">
                    {worldCharacterMatches.map((item) => (
                      <SearchLauncherCharacterRow
                        key={`world-character-${item.character.id}`}
                        active={
                          activeActionId ===
                          `world-character-${item.character.id}`
                        }
                        avatarName={item.character.name}
                        avatarSrc={item.character.avatar}
                        badge="可添加"
                        description={
                          item.character.relationship?.trim() ||
                          item.character.currentStatus?.trim() ||
                          "打开资料卡后可发起好友申请"
                        }
                        keyword={trimmedKeyword}
                        title={item.character.name}
                        variant="worldCharacter"
                        onMouseEnter={() =>
                          activatePanelAction(
                            `world-character-${item.character.id}`,
                          )
                        }
                        onClick={() => {
                          onClose?.();
                          void navigate({
                            to: "/character/$characterId",
                            params: { characterId: item.character.id },
                          });
                        }}
                      />
                    ))}
                  </div>
                </SearchLauncherCollectionCard>
              ) : null}

              {favoriteMatches.length ? (
                <SearchLauncherCollectionCard
                  countLabel={`${favoriteMatches.length} 条收藏`}
                  highlighted={
                    activeFocusContext.panelId === "favoriteSuggestions"
                  }
                  title="收藏"
                >
                  <div className="space-y-1.5">
                    {favoriteMatches.map((item) => (
                      <SearchLauncherFeatureRow
                        key={item.id}
                        active={activeActionId === item.id}
                        item={item}
                        keyword={trimmedKeyword}
                        variant="favorites"
                        onMouseEnter={() => activatePanelAction(item.id)}
                        onClick={() => handleOpenQuickLink(item)}
                      />
                    ))}
                  </div>
                </SearchLauncherCollectionCard>
              ) : null}

              {miniProgramMatches.length ? (
                <SearchLauncherCollectionCard
                  countLabel={`${miniProgramMatches.length} 个入口`}
                  highlighted={
                    activeFocusContext.panelId === "miniProgramSuggestions"
                  }
                  title="小程序"
                >
                  <div className="space-y-1.5">
                    {miniProgramMatches.map((item) => (
                      <SearchLauncherFeatureRow
                        key={item.id}
                        active={activeActionId === item.id}
                        item={item}
                        keyword={trimmedKeyword}
                        variant="miniPrograms"
                        onMouseEnter={() => activatePanelAction(item.id)}
                        onClick={() => handleOpenQuickLink(item)}
                      />
                    ))}
                  </div>
                </SearchLauncherCollectionCard>
              ) : null}

              {!hasSuggestionResults ? (
                <div className="rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3">
                  <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                    没有直接命中的聊天、联系人、公众号、收藏或小程序，可以继续用搜一搜，或去“添加朋友”里找。
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 shadow-none hover:bg-[color:var(--surface-card-hover)]"
                    onClick={() => {
                      onClose?.();
                      void navigate({
                        to: "/desktop/add-friend",
                        hash: buildDesktopAddFriendRouteHash({
                          keyword: trimmedKeyword,
                        }),
                      });
                    }}
                  >
                    去添加朋友
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SearchLauncherSection>
      ) : null}

      {!trimmedKeyword ? (
        <SearchLauncherSection
          title="快捷访问"
          className="mt-3"
          highlighted={activeFocusContext.region === "quickAccess"}
        >
          <div className="space-y-3">
            {recentConversations.length ? (
              <SearchLauncherCollectionCard
                countLabel={`${recentConversations.length} 个会话`}
                highlighted={activeFocusContext.panelId === "recentConversations"}
                title="最近聊天"
              >
                <div className="space-y-2">
                  {recentConversations.map((item) => (
                    <SearchLauncherConversationThreadCard
                      key={item.id}
                      active={activeActionId === item.id}
                      item={item}
                      keyword=""
                      onMouseEnter={() => activatePanelAction(item.id)}
                      onClick={() => handleOpenQuickLink(item)}
                    />
                  ))}
                </div>
              </SearchLauncherCollectionCard>
            ) : null}

            {recentOfficials.length ? (
              <SearchLauncherCollectionCard
                countLabel={`${recentOfficials.length} 个入口`}
                highlighted={activeFocusContext.panelId === "recentOfficials"}
                title="最近公众号"
              >
                <div className="space-y-1.5">
                  {recentOfficials.map((group) => (
                    <SearchLauncherOfficialGroupCard
                      key={group.id}
                      activeArticleId={activeActionId}
                      activeHeaderId={activeActionId}
                      group={group}
                      keyword=""
                      onOpenArticle={(item) => handleOpenQuickLink(item)}
                      onOpenHeader={(item) => handleOpenQuickLink(item)}
                      onSelectArticle={(item) => activatePanelAction(item.id)}
                      onSelectHeader={(item) => activatePanelAction(item.id)}
                    />
                  ))}
                </div>
              </SearchLauncherCollectionCard>
            ) : null}

            {recentMiniPrograms.length ? (
              <SearchLauncherCollectionCard
                countLabel={`${recentMiniPrograms.length} 个入口`}
                highlighted={activeFocusContext.panelId === "recentMiniPrograms"}
                title="最近使用的小程序"
              >
                <div className="space-y-1.5">
                  {recentMiniPrograms.map((item) => (
                    <SearchLauncherFeatureRow
                      key={item.id}
                      active={activeActionId === item.id}
                      item={item}
                      keyword=""
                      variant="miniPrograms"
                      onMouseEnter={() => activatePanelAction(item.id)}
                      onClick={() => handleOpenQuickLink(item)}
                    />
                  ))}
                </div>
              </SearchLauncherCollectionCard>
            ) : null}

            {favoritesLoading ? (
              <SearchLauncherCollectionCard
                highlighted={activeFocusContext.panelId === "recentFavorites"}
                title="最近收藏"
              >
                <div className="rounded-[12px] bg-white px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
                  正在同步最近收藏...
                </div>
              </SearchLauncherCollectionCard>
            ) : null}

            {!favoritesLoading && recentFavorites.length ? (
              <SearchLauncherCollectionCard
                countLabel={`${recentFavorites.length} 条收藏`}
                highlighted={activeFocusContext.panelId === "recentFavorites"}
                title="最近收藏"
              >
                <div className="space-y-1.5">
                  {recentFavorites.map((item) => (
                    <SearchLauncherFeatureRow
                      key={item.id}
                      active={activeActionId === item.id}
                      item={item}
                      keyword=""
                      variant="favorites"
                      onMouseEnter={() => activatePanelAction(item.id)}
                      onClick={() => handleOpenQuickLink(item)}
                    />
                  ))}
                </div>
              </SearchLauncherCollectionCard>
            ) : null}
          </div>
        </SearchLauncherSection>
      ) : null}

      <SearchLauncherSection
        title="历史搜索"
        className="mt-3"
        highlighted={activeFocusContext.region === "history"}
      >
        <SearchLauncherCollectionCard
          countLabel={history.length ? `${history.length} 条记录` : undefined}
          highlighted={activeFocusContext.region === "history"}
          title="最近搜索"
        >
          {history.length ? (
            <div className="space-y-1.5">
              {history.map((item) => (
                <button
                  key={item.keyword}
                  type="button"
                  onClick={() => onOpenSearch(item.keyword)}
                  onMouseEnter={() =>
                    activatePanelAction(
                      buildSearchLauncherHistoryActionId(item.keyword),
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[12px] bg-white px-3 py-2.5 text-left text-sm transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                    activeActionId === buildSearchLauncherHistoryActionId(item.keyword)
                      ? "text-[color:var(--text-primary)] shadow-[0_8px_18px_rgba(15,23,42,0.06)]"
                      : "text-[color:var(--text-secondary)] hover:bg-[rgba(7,193,96,0.04)] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <Clock3
                    size={14}
                    className="shrink-0 text-[color:var(--text-dim)]"
                  />
                  <span className="truncate">
                    {renderHighlightedText(item.keyword, trimmedKeyword)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[12px] bg-white px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
              进入搜一搜并完成一次搜索后，历史关键词会出现在这里。
            </div>
          )}
        </SearchLauncherCollectionCard>
      </SearchLauncherSection>
    </div>
  );
}

function SearchLauncherSection({
  children,
  className,
  highlighted = false,
  title,
}: {
  children: ReactNode;
  className?: string;
  highlighted?: boolean;
  title: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-center justify-between px-1">
        <span
          className={cn(
            "text-[11px] font-medium",
            highlighted
              ? "text-[color:var(--brand-primary)]"
              : "text-[color:var(--text-primary)]",
          )}
        >
          {title}
        </span>
        {highlighted ? (
          <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
            当前定位
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SearchLauncherFocusStrip({
  keyword,
  layer,
  panelTitle,
  region,
}: {
  keyword: string;
  layer: SearchLauncherNavigationLayer;
  panelTitle: string;
  region: SearchLauncherFocusRegion;
}) {
  const regionLabel = searchLauncherFocusRegionLabels[region];
  const toneClassName =
    region === "input"
      ? "bg-[rgba(7,193,96,0.10)] text-[color:var(--brand-primary)]"
      : region === "suggestions"
        ? "bg-[rgba(59,130,246,0.10)] text-[#1d4ed8]"
        : region === "quickAccess"
          ? "bg-[rgba(15,118,110,0.10)] text-[#226448]"
          : "bg-[rgba(180,132,23,0.10)] text-[#9a6b12]";
  const description =
    layer === "input"
      ? keyword
        ? `当前停留在搜索框，按 Tab 进入结果层，按 Enter 执行搜索“${keyword}”，按 Esc 关闭下拉。`
        : "当前停留在搜索框，继续输入关键词，或按 Tab 进入结果层；按 Enter 执行搜索，按 Esc 关闭下拉。"
      : region === "history"
        ? "当前停留在最近搜索，按 Tab / ↑ ↓ 切换当前项，按 Enter 打开当前项，按 Shift+Tab 或 Esc 回搜索框。"
        : `当前停留在${panelTitle}，按 Tab / ↑ ↓ 切换当前项，按 Enter 打开当前项，按 Shift+Tab 或 Esc 回搜索框。`;
  const keyboardHint =
    layer === "input"
      ? "Tab 进入结果层 · Enter 执行搜索 · Esc 关闭"
      : "Tab / ↑ ↓ 切换当前项 · Enter 打开当前项 · Shift+Tab / Esc 回搜索框";

  return (
    <section className="mt-2 rounded-[16px] border border-[rgba(7,193,96,0.14)] bg-[rgba(247,250,250,0.94)] px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--brand-primary)]">
          当前定位
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-medium",
            toneClassName,
          )}
        >
          {regionLabel}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
          {panelTitle}
        </span>
      </div>
      <div className="mt-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
        {description}
      </div>
      <div className="mt-2 inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
        {keyboardHint}
      </div>
    </section>
  );
}

function SearchLauncherHeroCard({
  active,
  keyword,
  onClick,
  onMouseEnter,
}: {
  active: boolean;
  keyword: string;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "w-full overflow-hidden rounded-[18px] border text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "border-[#cfe4d2] bg-[linear-gradient(135deg,rgba(7,193,96,0.18),rgba(7,193,96,0.08)_45%,white)]"
          : "border-[#dce9dd] bg-[linear-gradient(135deg,rgba(7,193,96,0.14),rgba(7,193,96,0.05)_45%,white)] hover:border-[#cfe4d2] hover:bg-[linear-gradient(135deg,rgba(7,193,96,0.18),rgba(7,193,96,0.08)_45%,white)]",
      )}
    >
      <div className="flex items-start gap-3 px-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-[color:var(--brand-primary)] shadow-[0_8px_18px_rgba(7,193,96,0.10)]">
          <Search size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              搜一搜
            </div>
            <div className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
              Enter
            </div>
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[color:var(--text-secondary)]">
            {keyword
              ? `执行搜索“${keyword}”，进入完整结果页继续查看。`
              : "执行一次全局搜索，进入完整结果页后继续按分类查看。"}
          </div>
        </div>
      </div>
      <div className="border-t border-white/80 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3 text-[11px] text-[color:var(--text-muted)]">
          <span>
            {keyword
              ? "Enter 执行搜索 · Tab 进入结果层"
              : "Tab 进入结果层 · 支持聊天、联系人、公众号、收藏和小程序"}
          </span>
          <CornerDownLeft size={14} className="shrink-0" />
        </div>
      </div>
    </button>
  );
}

function SearchLauncherStatusCard({
  description,
  status,
  title,
}: {
  description: string;
  status: "done" | "error" | "pending" | "recording";
  title: string;
}) {
  const toneClassName =
    status === "error"
      ? "border-[rgba(225,29,72,0.14)] bg-[rgba(225,29,72,0.06)]"
      : status === "recording"
        ? "border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.06)]"
        : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]";
  const badgeClassName =
    status === "error"
      ? "bg-white text-[#be123c]"
      : status === "recording"
        ? "bg-white text-[color:var(--brand-primary)]"
        : "bg-white text-[color:var(--text-muted)]";
  const statusLabel =
    status === "error"
      ? "异常"
      : status === "recording"
        ? "录音中"
        : status === "pending"
          ? "处理中"
          : "已完成";

  return (
    <section className={cn("mt-2 rounded-[16px] border p-3.5", toneClassName)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className={cn("rounded-full px-2.5 py-1 text-[10px]", badgeClassName)}>
          {statusLabel}
        </div>
      </div>
      <div
        className={cn(
          "mt-2 rounded-[12px] bg-white px-3 py-2.5 text-xs leading-6",
          status === "error"
            ? "text-[#be123c]"
            : "text-[color:var(--text-secondary)]",
        )}
      >
        {description}
      </div>
    </section>
  );
}

function SearchLauncherCollectionCard({
  children,
  countLabel,
  highlighted = false,
  title,
}: {
  children: ReactNode;
  countLabel?: string;
  highlighted?: boolean;
  title: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[18px] border p-3.5 transition-[border-color,box-shadow,background]",
        highlighted
          ? "border-[rgba(7,193,96,0.16)] bg-[linear-gradient(180deg,rgba(7,193,96,0.08),rgba(7,193,96,0.03)_40%,white)] shadow-[0_12px_28px_rgba(7,193,96,0.08)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="text-[11px] font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        {countLabel ? (
          <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
            {countLabel}
          </div>
        ) : null}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function SearchLauncherConversationGroupCard({
  activeHeaderId,
  activeMessageId,
  group,
  keyword,
  onOpenHeader,
  onOpenMessage,
  onSelectHeader,
  onSelectMessage,
}: {
  activeHeaderId: string;
  activeMessageId: string;
  group: SearchLauncherConversationGroup;
  keyword: string;
  onOpenHeader: (item: DesktopSearchQuickLink) => void;
  onOpenMessage: (item: DesktopSearchQuickLink) => void;
  onSelectHeader: (item: DesktopSearchQuickLink) => void;
  onSelectMessage: (item: DesktopSearchQuickLink) => void;
}) {
  const headerActive = activeHeaderId === group.header.id;

  return (
    <section className="overflow-hidden rounded-[16px] border border-[#dde8dc] bg-[linear-gradient(180deg,#f9fcfa,white)]">
      <button
        type="button"
        onClick={() => onOpenHeader(group.header)}
        onMouseEnter={() => onSelectHeader(group.header)}
        className={cn(
          "flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
          headerActive ? "bg-[rgba(7,193,96,0.06)]" : "hover:bg-[rgba(7,193,96,0.04)]",
        )}
      >
        <AvatarChip
          name={group.header.avatarName ?? group.header.title}
          src={group.header.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(group.header.title, keyword)}
            </span>
            <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
              {group.header.badge}
            </span>
          </div>
          <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
            {renderHighlightedText(group.header.meta, keyword)}
          </div>
          <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
            {renderHighlightedText(group.header.description, keyword)}
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
          {group.totalHits} 条相关记录
        </div>
      </button>

      <div className="border-t border-[color:var(--border-faint)] px-3.5 py-2.5">
        <div className="space-y-2">
          {group.messages.map((item) => {
            const active = activeMessageId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenMessage(item)}
                onMouseEnter={() => onSelectMessage(item)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                  active ? "bg-[rgba(7,193,96,0.06)]" : "bg-white hover:bg-[rgba(7,193,96,0.04)]",
                )}
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.10)] text-[#15803d]">
                  <MessageSquareText size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
                    {renderHighlightedText(item.description, keyword)}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
                    {renderHighlightedText(item.meta, keyword)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SearchLauncherConversationThreadCard({
  active = false,
  item,
  keyword,
  onMouseEnter,
  onClick,
}: {
  active?: boolean;
  item: DesktopSearchQuickLink;
  keyword: string;
  onMouseEnter?: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "w-full overflow-hidden rounded-[16px] border text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "border-[#d6e7d6] bg-[linear-gradient(180deg,#f6fbf6,white)]"
          : "border-[#e3ece3] bg-[linear-gradient(180deg,#fbfdfb,white)] hover:border-[#d6e7d6] hover:bg-[linear-gradient(180deg,#f6fbf6,white)]",
      )}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <AvatarChip
          name={item.avatarName ?? item.title}
          src={item.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(item.title, keyword)}
            </span>
            <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
              {item.badge}
            </span>
          </div>
          <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
            {renderHighlightedText(item.meta, keyword)}
          </div>
        </div>
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(7,193,96,0.10)] text-[#15803d]">
          <MessageSquareText size={15} />
        </div>
      </div>

      <div className="border-t border-[color:var(--border-faint)] px-3.5 py-2.5">
        <div className="rounded-[12px] bg-white px-3 py-2.5">
          <div className="line-clamp-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
            {renderHighlightedText(item.description, keyword)}
          </div>
        </div>
      </div>
    </button>
  );
}

function SearchLauncherOfficialGroupCard({
  activeArticleId,
  activeHeaderId,
  group,
  keyword,
  onOpenArticle,
  onOpenHeader,
  onSelectArticle,
  onSelectHeader,
}: {
  activeArticleId: string;
  activeHeaderId: string;
  group: SearchLauncherOfficialGroup;
  keyword: string;
  onOpenArticle: (item: DesktopSearchQuickLink) => void;
  onOpenHeader: (item: DesktopSearchQuickLink) => void;
  onSelectArticle: (item: DesktopSearchQuickLink) => void;
  onSelectHeader: (item: DesktopSearchQuickLink) => void;
}) {
  const headerActive = activeHeaderId === group.header.id;
  const articleActive = group.article
    ? activeArticleId === group.article.id
    : false;

  return (
    <section className="overflow-hidden rounded-[16px] border border-[#dfe7dd] bg-[linear-gradient(180deg,#fbfdfb,white)]">
      <button
        type="button"
        onClick={() => onOpenHeader(group.header)}
        onMouseEnter={() => onSelectHeader(group.header)}
        className={cn(
          "flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
          headerActive ? "bg-[rgba(7,193,96,0.06)]" : "hover:bg-[rgba(7,193,96,0.04)]",
        )}
      >
        <AvatarChip
          name={group.header.avatarName ?? group.header.title}
          src={group.header.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(group.header.title, keyword)}
            </span>
            <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
              {group.header.badge}
            </span>
          </div>
          <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
            {renderHighlightedText(group.header.meta, keyword)}
          </div>
          <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
            {renderHighlightedText(group.header.description, keyword)}
          </div>
        </div>
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(7,193,96,0.10)] text-[#1d6a37]">
          <Newspaper size={15} />
        </div>
      </button>

      {group.article ? (
        <div className="border-t border-[color:var(--border-faint)] px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => onOpenArticle(group.article!)}
            onMouseEnter={() => onSelectArticle(group.article!)}
            className={cn(
              "flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
              articleActive ? "bg-[rgba(7,193,96,0.06)]" : "bg-white hover:bg-[rgba(7,193,96,0.04)]",
            )}
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.10)] text-[#1d6a37]">
              <Newspaper size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                {renderHighlightedText(group.article.title, keyword)}
              </div>
              <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
                {renderHighlightedText(group.article.meta, keyword)}
              </div>
              <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
                {renderHighlightedText(group.article.description, keyword)}
              </div>
            </div>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SearchLauncherCharacterRow({
  active = false,
  avatarName,
  avatarSrc,
  badge,
  description,
  keyword,
  onMouseEnter,
  onClick,
  title,
  variant,
}: {
  active?: boolean;
  avatarName: string;
  avatarSrc?: string | null;
  badge: string;
  description: string;
  keyword: string;
  onMouseEnter?: () => void;
  onClick: () => void;
  title: string;
  variant: "contact" | "worldCharacter";
}) {
  const toneClassName =
    variant === "contact"
      ? active
        ? "border-[#cfe0cf] bg-[linear-gradient(180deg,#f5fbf6,white)]"
        : "border-[#d9e7d9] bg-[linear-gradient(180deg,#f9fcfa,white)] hover:border-[#cfe0cf] hover:bg-[linear-gradient(180deg,#f5fbf6,white)]"
      : active
        ? "border-[#e7e0c8] bg-[linear-gradient(180deg,#fffaf0,white)]"
        : "border-[#eee6ce] bg-[linear-gradient(180deg,#fffdf7,white)] hover:border-[#e7e0c8] hover:bg-[linear-gradient(180deg,#fffaf0,white)]";
  const badgeClassName =
    variant === "contact"
      ? "bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]"
      : "bg-[rgba(180,132,23,0.10)] text-[#9a6b12]";
  const metaTextClassName =
    variant === "contact"
      ? "text-[color:var(--text-muted)]"
      : "text-[#8a6a24]";
  const iconClassName =
    variant === "contact"
      ? "bg-[rgba(7,193,96,0.10)] text-[#15803d]"
      : "bg-[rgba(180,132,23,0.12)] text-[#a16207]";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        toneClassName,
      )}
    >
      <AvatarChip name={avatarName} src={avatarSrc} size="wechat" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {renderHighlightedText(title, keyword)}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px]",
              badgeClassName,
            )}
          >
            {badge}
          </span>
        </div>
        <div className={cn("mt-1 truncate text-[11px]", metaTextClassName)}>
          {renderHighlightedText(description, keyword)}
        </div>
      </div>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          iconClassName,
        )}
      >
        {variant === "contact" ? <UsersRound size={15} /> : <Sparkles size={15} />}
      </div>
    </button>
  );
}

function SearchLauncherFeatureRow({
  active = false,
  item,
  keyword,
  onMouseEnter,
  onClick,
  variant,
}: {
  active?: boolean;
  item: DesktopSearchQuickLink;
  keyword: string;
  onMouseEnter?: () => void;
  onClick: () => void;
  variant: "favorites" | "miniPrograms";
}) {
  const toneClassName =
    variant === "favorites"
      ? active
        ? "border-[#e7d8ad] bg-[linear-gradient(180deg,#fff9ee,white)]"
        : "border-[#efe2bf] bg-[linear-gradient(180deg,#fffdf7,white)] hover:border-[#e7d8ad] hover:bg-[linear-gradient(180deg,#fff9ee,white)]"
      : active
        ? "border-[#cfe2d8] bg-[linear-gradient(180deg,#f5faf7,white)]"
        : "border-[#d8e7df] bg-[linear-gradient(180deg,#f7fbf9,white)] hover:border-[#cfe2d8] hover:bg-[linear-gradient(180deg,#f5faf7,white)]";
  const badgeClassName =
    variant === "favorites"
      ? "bg-[rgba(180,132,23,0.10)] text-[#9a6b12]"
      : "bg-[rgba(15,118,110,0.10)] text-[#226448]";
  const iconClassName =
    variant === "favorites"
      ? "bg-[rgba(180,132,23,0.12)] text-[#a16207]"
      : "bg-[rgba(15,118,110,0.12)] text-[#0f766e]";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-start gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        toneClassName,
      )}
    >
      <AvatarChip
        name={item.avatarName ?? item.title}
        src={item.avatarSrc}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {renderHighlightedText(item.title, keyword)}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px]",
              badgeClassName,
            )}
          >
            {item.badge}
          </span>
        </div>
        <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
          {renderHighlightedText(item.meta, keyword)}
        </div>
        <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
          {renderHighlightedText(item.description, keyword)}
        </div>
      </div>
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          iconClassName,
        )}
      >
        {variant === "favorites" ? <Bookmark size={15} /> : <Blocks size={15} />}
      </div>
    </button>
  );
}

function buildFriendSuggestionDescription(item: FriendDirectoryItem) {
  if (getFriendDisplayName(item) !== item.character.name) {
    return `昵称：${item.character.name}`;
  }

  const tags = item.friendship.tags?.filter(Boolean).join("、");
  return (
    item.character.relationship?.trim() ||
    tags ||
    item.character.currentStatus?.trim() ||
    "打开联系人资料"
  );
}

function matchesLauncherQuickLink(
  item: DesktopSearchQuickLink,
  keyword: string,
) {
  return [item.title, item.description, item.meta, item.badge]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(keyword);
}
