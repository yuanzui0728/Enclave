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
import { ChevronRight, Clock3, CornerDownLeft, Search } from "lucide-react";
import {
  getConversations,
  getFriends,
  listOfficialAccounts,
  listCharacters,
} from "@yinjie/contracts";
import { Button, cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { getConversationPreviewParts } from "../../lib/conversation-preview";
import {
  getConversationThreadLabel,
  getConversationThreadPath,
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
import { useLocalChatMessageActionState } from "../chat/local-chat-message-actions";
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
  const conversationQuickLinks = useMemo(() => {
    return (conversationsQuery.data ?? []).map((conversation) => {
      const preview = getConversationPreviewParts(
        conversation,
        localMessageActionState,
      );

      return {
        id: `conversation-${conversation.id}`,
        title: conversation.title,
        description: `${preview.prefix}${preview.text}`,
        meta: `${getConversationThreadLabel(conversation)} · ${conversation.participants.length} 位参与者`,
        badge: getConversationThreadLabel(conversation),
        to: getConversationThreadPath(conversation),
        avatarName: conversation.title,
      } satisfies DesktopSearchQuickLink;
    });
  }, [conversationsQuery.data, localMessageActionState]);
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
  const recentConversations = useMemo(
    () => conversationQuickLinks.slice(0, 4),
    [conversationQuickLinks],
  );
  const officialQuickLinks = useMemo(() => {
    return (officialAccountsQuery.data ?? []).flatMap((account) => {
      const accountLink = {
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

      if (!account.recentArticle) {
        return [accountLink];
      }

      return [
        accountLink,
        {
          id: `official-article-${account.recentArticle.id}`,
          title: account.recentArticle.title,
          description:
            account.recentArticle.summary || `来自 ${account.name} 的最近文章`,
          meta: `公众号文章 · ${account.name}`,
          badge: "公众号文章",
          to: `/official-accounts/articles/${account.recentArticle.id}`,
          avatarName: account.name,
          avatarSrc: account.avatar,
        } satisfies DesktopSearchQuickLink,
      ];
    });
  }, [officialAccountsQuery.data]);
  const officialMatches = useMemo(() => {
    if (!normalizedKeyword) {
      return [] as DesktopSearchQuickLink[];
    }

    return officialQuickLinks
      .filter((item) =>
        [item.title, item.description, item.meta, item.badge]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword),
      )
      .slice(0, 4);
  }, [normalizedKeyword, officialQuickLinks]);
  const recentOfficials = useMemo(() => {
    return (officialAccountsQuery.data ?? [])
      .slice()
      .sort((left, right) => {
        const rightTime = Date.parse(
          right.recentArticle?.publishedAt ?? right.lastPublishedAt ?? "",
        );
        const leftTime = Date.parse(
          left.recentArticle?.publishedAt ?? left.lastPublishedAt ?? "",
        );

        return (Number.isNaN(rightTime) ? 0 : rightTime) -
          (Number.isNaN(leftTime) ? 0 : leftTime);
      })
      .slice(0, 4)
      .map((account) =>
        account.recentArticle
          ? ({
              id: `recent-official-article-${account.recentArticle.id}`,
              title: account.recentArticle.title,
              description:
                account.recentArticle.summary ||
                `继续阅读 ${account.name} 的最近文章`,
              meta: `公众号文章 · ${account.name}`,
              badge: "公众号文章",
              to: `/official-accounts/articles/${account.recentArticle.id}`,
              avatarName: account.name,
              avatarSrc: account.avatar,
            } satisfies DesktopSearchQuickLink)
          : ({
              id: `recent-official-account-${account.id}`,
              title: account.name,
              description: account.description || "打开公众号主页",
              meta: `${account.accountType === "service" ? "服务号" : "订阅号"} · @${
                account.handle
              }`,
              badge: account.accountType === "service" ? "服务号" : "订阅号",
              to: `/official-accounts/${account.id}`,
              avatarName: account.name,
              avatarSrc: account.avatar,
            } satisfies DesktopSearchQuickLink),
      );
  }, [officialAccountsQuery.data]);

  const suggestionsLoading =
    shouldLoadSuggestions &&
    (friendsQuery.isLoading ||
      charactersQuery.isLoading ||
      conversationsQuery.isLoading ||
      officialAccountsQuery.isLoading);
  const suggestionsError =
    shouldLoadSuggestions &&
    (friendsQuery.error instanceof Error ||
      charactersQuery.error instanceof Error ||
      conversationsQuery.error instanceof Error ||
      officialAccountsQuery.error instanceof Error);
  const hasSuggestionResults =
    conversationMatches.length > 0 ||
    friendMatches.length > 0 ||
    worldCharacterMatches.length > 0 ||
    officialMatches.length > 0 ||
    favoriteMatches.length > 0 ||
    miniProgramMatches.length > 0;
  const [activeActionId, setActiveActionId] =
    useState<string>("launcher-search");

  const handleOpenQuickLink = useCallback(
    (item: DesktopSearchQuickLink) => {
      onClose?.();
      void navigate({
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
      conversationMatches.forEach((item) => {
        items.push({
          id: item.id,
          onSelect: () => handleOpenQuickLink(item),
        });
      });

      officialMatches.forEach((item) => {
        items.push({
          id: item.id,
          onSelect: () => handleOpenQuickLink(item),
        });
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

      recentOfficials.forEach((item) => {
        items.push({
          id: item.id,
          onSelect: () => handleOpenQuickLink(item),
        });
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
          id: `history-${item.keyword}`,
          onSelect: () => onOpenSearch(item.keyword),
        });
      });
    }

    return items;
  }, [
    conversationMatches,
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

  useEffect(() => {
    setActiveActionId((current) => {
      if (actionItems.some((item) => item.id === current)) {
        return current;
      }

      return actionItems[0]?.id ?? "launcher-search";
    });
  }, [actionItems]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
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

      const currentIndex = actionItems.findIndex(
        (item) => item.id === activeActionId,
      );

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex =
          currentIndex >= 0 ? (currentIndex + 1) % actionItems.length : 0;
        setActiveActionId(actionItems[nextIndex]?.id ?? "launcher-search");
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex =
          currentIndex >= 0
            ? (currentIndex - 1 + actionItems.length) % actionItems.length
            : actionItems.length - 1;
        setActiveActionId(actionItems[nextIndex]?.id ?? "launcher-search");
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const activeItem =
          actionItems[currentIndex >= 0 ? currentIndex : 0] ?? null;
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
  }, [actionItems, activeActionId, keyword, onClose, onOpenSearch]);

  return (
    <div
      className={cn(
        "absolute left-0 right-0 top-[calc(100%+0.45rem)] z-30 overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-white/98 p-2.5 shadow-[var(--shadow-overlay)] backdrop-blur-xl",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onOpenSearch(keyword)}
        onMouseEnter={() => setActiveActionId("launcher-search")}
        className={cn(
          "flex w-full min-w-0 items-center gap-3 rounded-[12px] px-3.5 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
          activeActionId === "launcher-search"
            ? "bg-[rgba(7,193,96,0.13)]"
            : "bg-[rgba(7,193,96,0.08)] hover:bg-[rgba(7,193,96,0.13)]",
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-[color:var(--brand-primary)]">
          <Search size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            搜一搜
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
            {trimmedKeyword ? `搜索“${trimmedKeyword}”` : "打开全局搜索工作区"}
          </div>
        </div>
        <CornerDownLeft
          size={14}
          className="shrink-0 text-[color:var(--text-dim)]"
        />
      </button>

      {speechStatus !== "idle" || speechError ? (
        <div
          className={cn(
            "mt-2 rounded-[12px] px-3 py-2.5 text-xs leading-6",
            speechError
              ? "bg-[rgba(225,29,72,0.08)] text-[#be123c]"
              : "bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
          )}
        >
          {speechError
            ? speechError
            : speechStatus === "requesting-permission"
              ? "正在请求麦克风权限..."
              : speechStatus === "listening"
                ? "正在听你说，完成后再点一次语音图标。"
                : speechStatus === "processing"
                  ? "正在整理语音内容..."
                  : speechDisplayText
                    ? `识别结果：${speechDisplayText}`
                    : "语音输入已完成。"}
        </div>
      ) : null}

      {trimmedKeyword ? (
        <SearchLauncherSection title="搜索建议" className="mt-3">
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
              {conversationMatches.length ? (
                <div>
                  <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                    聊天
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {conversationMatches.map((item) => (
                      <SearchLauncherQuickLinkRow
                        key={item.id}
                        active={activeActionId === item.id}
                        item={item}
                        onMouseEnter={() => setActiveActionId(item.id)}
                        onClick={() => handleOpenQuickLink(item)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {officialMatches.length ? (
                <div>
                  <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                    公众号
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {officialMatches.map((item) => (
                      <SearchLauncherQuickLinkRow
                        key={item.id}
                        active={activeActionId === item.id}
                        item={item}
                        onMouseEnter={() => setActiveActionId(item.id)}
                        onClick={() => handleOpenQuickLink(item)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {friendMatches.length ? (
                <div>
                  <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                    联系人
                  </div>
                  <div className="mt-1.5 space-y-1.5">
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
                        title={getFriendDisplayName(item)}
                        onMouseEnter={() =>
                          setActiveActionId(`friend-${item.character.id}`)
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
                </div>
              ) : null}

              {worldCharacterMatches.length ? (
                <div>
                  <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                    世界角色
                  </div>
                  <div className="mt-1.5 space-y-1.5">
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
                        title={item.character.name}
                        onMouseEnter={() =>
                          setActiveActionId(
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
                </div>
              ) : null}

              {favoriteMatches.length ? (
                <div>
                  <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                    收藏
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {favoriteMatches.map((item) => (
                      <SearchLauncherQuickLinkRow
                        key={item.id}
                        active={activeActionId === item.id}
                        item={item}
                        onMouseEnter={() => setActiveActionId(item.id)}
                        onClick={() => handleOpenQuickLink(item)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {miniProgramMatches.length ? (
                <div>
                  <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                    小程序
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {miniProgramMatches.map((item) => (
                      <SearchLauncherQuickLinkRow
                        key={item.id}
                        active={activeActionId === item.id}
                        item={item}
                        onMouseEnter={() => setActiveActionId(item.id)}
                        onClick={() => handleOpenQuickLink(item)}
                      />
                    ))}
                  </div>
                </div>
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
        <SearchLauncherSection title="快捷访问" className="mt-3">
          <div className="space-y-3">
            {recentConversations.length ? (
              <div>
                <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                  最近聊天
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {recentConversations.map((item) => (
                    <SearchLauncherQuickLinkRow
                      key={item.id}
                      active={activeActionId === item.id}
                      item={item}
                      onMouseEnter={() => setActiveActionId(item.id)}
                      onClick={() => handleOpenQuickLink(item)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {recentOfficials.length ? (
              <div>
                <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                  最近公众号
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {recentOfficials.map((item) => (
                    <SearchLauncherQuickLinkRow
                      key={item.id}
                      active={activeActionId === item.id}
                      item={item}
                      onMouseEnter={() => setActiveActionId(item.id)}
                      onClick={() => handleOpenQuickLink(item)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {recentMiniPrograms.length ? (
              <div>
                <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                  最近使用的小程序
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {recentMiniPrograms.map((item) => (
                    <SearchLauncherQuickLinkRow
                      key={item.id}
                      active={activeActionId === item.id}
                      item={item}
                      onMouseEnter={() => setActiveActionId(item.id)}
                      onClick={() => handleOpenQuickLink(item)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {favoritesLoading ? (
              <div className="rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
                正在同步最近收藏...
              </div>
            ) : null}

            {!favoritesLoading && recentFavorites.length ? (
              <div>
                <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                  最近收藏
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {recentFavorites.map((item) => (
                    <SearchLauncherQuickLinkRow
                      key={item.id}
                      active={activeActionId === item.id}
                      item={item}
                      onMouseEnter={() => setActiveActionId(item.id)}
                      onClick={() => handleOpenQuickLink(item)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </SearchLauncherSection>
      ) : null}

      <SearchLauncherSection title="历史搜索" className="mt-3">
        {history.length ? (
          <div className="space-y-1.5">
            {history.map((item) => (
              <button
                key={item.keyword}
                type="button"
                onClick={() => onOpenSearch(item.keyword)}
                onMouseEnter={() =>
                  setActiveActionId(`history-${item.keyword}`)
                }
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-sm transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                  activeActionId === `history-${item.keyword}`
                    ? "bg-[color:var(--surface-console)] text-[color:var(--text-primary)]"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
                )}
              >
                <Clock3
                  size={14}
                  className="shrink-0 text-[color:var(--text-dim)]"
                />
                <span className="truncate">{item.keyword}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
            进入搜一搜并完成一次搜索后，历史关键词会出现在这里。
          </div>
        )}
      </SearchLauncherSection>
    </div>
  );
}

function SearchLauncherSection({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-[color:var(--text-primary)]">
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

function SearchLauncherQuickLinkRow({
  active = false,
  item,
  onMouseEnter,
  onClick,
}: {
  active?: boolean;
  item: DesktopSearchQuickLink;
  onMouseEnter?: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center gap-3 rounded-[12px] border border-[color:var(--border-faint)] px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "bg-[color:var(--surface-console)]"
          : "bg-white hover:bg-[color:var(--surface-console)]",
      )}
    >
      <AvatarChip
        name={item.avatarName ?? item.title}
        src={item.avatarSrc}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {item.title}
          </span>
          <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
            {item.badge}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
          {item.meta}
        </div>
        <div className="mt-1 truncate text-[11px] text-[color:var(--text-secondary)]">
          {item.description}
        </div>
      </div>
      <ChevronRight
        size={14}
        className="shrink-0 text-[color:var(--text-dim)]"
      />
    </button>
  );
}

function SearchLauncherCharacterRow({
  active = false,
  avatarName,
  avatarSrc,
  badge,
  description,
  onMouseEnter,
  onClick,
  title,
}: {
  active?: boolean;
  avatarName: string;
  avatarSrc?: string | null;
  badge: string;
  description: string;
  onMouseEnter?: () => void;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center gap-3 rounded-[12px] border border-[color:var(--border-faint)] px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "bg-[color:var(--surface-console)]"
          : "bg-white hover:bg-[color:var(--surface-console)]",
      )}
    >
      <AvatarChip name={avatarName} src={avatarSrc} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {title}
          </span>
          <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
            {badge}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
          {description}
        </div>
      </div>
      <ChevronRight
        size={14}
        className="shrink-0 text-[color:var(--text-dim)]"
      />
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
