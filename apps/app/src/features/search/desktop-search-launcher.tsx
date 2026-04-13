import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  BookUser,
  ChevronRight,
  Clock3,
  CornerDownLeft,
  Search,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { getFriends, listCharacters } from "@yinjie/contracts";
import { cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import {
  createFriendDirectoryItems,
  createWorldCharacterDirectoryItems,
  matchesCharacterSearch,
  type FriendDirectoryItem,
  type WorldCharacterDirectoryItem,
} from "../contacts/contact-utils";
import { buildWorldCharactersRouteHash } from "../contacts/world-characters-route-state";
import { useSpeechInput } from "../chat/use-speech-input";
import type { SpeechInputStatus } from "../chat/speech-input-types";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { buildSearchRouteHash, type SearchRouteSource } from "./search-route-state";
import {
  hydrateSearchHistoryFromNative,
  loadSearchHistory,
  pushSearchHistory,
} from "./search-history";
import type { SearchHistoryItem } from "./search-types";

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

type LauncherActionEntry = {
  key: string;
  title: string;
  description: string;
  icon: typeof Search;
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
  const trimmedKeyword = keyword.trim();
  const normalizedKeyword = trimmedKeyword.toLowerCase();
  const shouldLoadSuggestions = Boolean(normalizedKeyword);

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

  const friendMatches = useMemo(() => {
    if (!normalizedKeyword) {
      return [] as FriendDirectoryItem[];
    }

    return createFriendDirectoryItems(friendsQuery.data ?? [])
      .filter((item) => matchesFriendDirectorySearch(item, normalizedKeyword))
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
      (charactersQuery.data ?? []).filter((character) => !friendIds.has(character.id)),
    )
      .filter((item) => matchesCharacterSearch(item.character, normalizedKeyword))
      .slice(0, 4);
  }, [charactersQuery.data, friendsQuery.data, normalizedKeyword]);

  const featureEntries: LauncherActionEntry[] = [
    {
      key: "add-friend",
      title: "添加朋友",
      description: trimmedKeyword
        ? `去世界角色里找“${trimmedKeyword}”，再发起好友申请`
        : "去世界角色里找人并发起好友申请",
      icon: UserPlus,
      onSelect: () => {
        onClose?.();
        void navigate({
          to: "/contacts/world-characters",
          hash: buildWorldCharactersRouteHash({
            keyword: trimmedKeyword,
          }),
        });
      },
    },
    ...(!trimmedKeyword || matchesFeatureKeyword(normalizedKeyword, [
      "新的朋友",
      "好友申请",
      "申请",
    ])
      ? [
          {
            key: "new-friends",
            title: "新的朋友",
            description: "查看待处理的好友申请记录",
            icon: UsersRound,
            onSelect: () => {
              onClose?.();
              void navigate({ to: "/friend-requests" });
            },
          } satisfies LauncherActionEntry,
        ]
      : []),
    ...(!trimmedKeyword || matchesFeatureKeyword(normalizedKeyword, [
      "世界角色",
      "角色",
    ])
      ? [
          {
            key: "world-characters",
            title: "世界角色",
            description: trimmedKeyword
              ? `浏览与“${trimmedKeyword}”相关的世界角色`
              : "浏览尚未加入通讯录的世界角色",
            icon: BookUser,
            onSelect: () => {
              onClose?.();
              void navigate({
                to: "/contacts/world-characters",
                hash: buildWorldCharactersRouteHash({
                  keyword: trimmedKeyword,
                }),
              });
            },
          } satisfies LauncherActionEntry,
        ]
      : []),
  ];

  const suggestionsLoading =
    shouldLoadSuggestions && (friendsQuery.isLoading || charactersQuery.isLoading);
  const suggestionsError =
    shouldLoadSuggestions &&
    (friendsQuery.error instanceof Error || charactersQuery.error instanceof Error);
  const hasSuggestionResults =
    featureEntries.length > 0 ||
    friendMatches.length > 0 ||
    worldCharacterMatches.length > 0;

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
        className="flex w-full min-w-0 items-center gap-3 rounded-[12px] bg-[rgba(7,193,96,0.08)] px-3.5 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[rgba(7,193,96,0.13)]"
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

      <SearchLauncherSection title="功能" className="mt-3">
        <div className="space-y-1.5">
          {featureEntries.map((entry) => (
            <SearchLauncherActionRow key={entry.key} entry={entry} />
          ))}
        </div>
      </SearchLauncherSection>

      {trimmedKeyword ? (
        <SearchLauncherSection title="搜索建议" className="mt-3">
          {suggestionsLoading ? (
            <div className="rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
              正在整理联系人和世界角色结果...
            </div>
          ) : null}

          {suggestionsError ? (
            <div className="rounded-[12px] bg-[rgba(225,29,72,0.08)] px-3 py-3 text-xs leading-6 text-[#be123c]">
              联系人目录暂时读取失败，请先试试搜一搜。
            </div>
          ) : null}

          {!suggestionsLoading && !suggestionsError ? (
            <div className="space-y-3">
              {friendMatches.length ? (
                <div>
                  <div className="px-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                    联系人
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {friendMatches.map((item) => (
                      <SearchLauncherCharacterRow
                        key={`friend-${item.character.id}`}
                        avatarName={item.character.name}
                        avatarSrc={item.character.avatar}
                        badge="联系人"
                        description={buildFriendSuggestionDescription(item)}
                        title={item.friendship.remarkName?.trim() || item.character.name}
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
                        avatarName={item.character.name}
                        avatarSrc={item.character.avatar}
                        badge="可添加"
                        description={
                          item.character.relationship?.trim() ||
                          item.character.currentStatus?.trim() ||
                          "打开资料卡后可发起好友申请"
                        }
                        title={item.character.name}
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

              {!hasSuggestionResults ? (
                <div className="rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
                  没有直接命中的联系人或角色，可以继续用搜一搜，或去“添加朋友”里找。
                </div>
              ) : null}
            </div>
          ) : null}
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
                className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-sm text-[color:var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
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

function SearchLauncherActionRow({ entry }: { entry: LauncherActionEntry }) {
  const Icon = entry.icon;

  return (
    <button
      type="button"
      onClick={entry.onSelect}
      className="flex w-full items-center gap-3 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-[color:var(--brand-primary)]">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          {entry.title}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
          {entry.description}
        </div>
      </div>
      <ChevronRight size={14} className="shrink-0 text-[color:var(--text-dim)]" />
    </button>
  );
}

function SearchLauncherCharacterRow({
  avatarName,
  avatarSrc,
  badge,
  description,
  onClick,
  title,
}: {
  avatarName: string;
  avatarSrc?: string | null;
  badge: string;
  description: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[12px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-console)]"
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
      <ChevronRight size={14} className="shrink-0 text-[color:var(--text-dim)]" />
    </button>
  );
}

function matchesFeatureKeyword(keyword: string, aliases: string[]) {
  return aliases.some((item) => {
    const normalizedItem = item.trim().toLowerCase();
    return (
      normalizedItem.includes(keyword) || keyword.includes(normalizedItem)
    );
  });
}

function matchesFriendDirectorySearch(
  item: FriendDirectoryItem,
  normalizedSearchText: string,
) {
  if (matchesCharacterSearch(item.character, normalizedSearchText)) {
    return true;
  }

  const haystacks = [
    item.friendship.remarkName ?? "",
    item.friendship.region ?? "",
    item.friendship.source ?? "",
    item.friendship.tags?.join(" ") ?? "",
  ];

  return haystacks.some((value) =>
    value.toLowerCase().includes(normalizedSearchText),
  );
}

function buildFriendSuggestionDescription(item: FriendDirectoryItem) {
  const remarkName = item.friendship.remarkName?.trim();
  if (remarkName && remarkName !== item.character.name) {
    return `角色名 ${item.character.name}`;
  }

  const tags = item.friendship.tags?.filter(Boolean).join("、");
  return (
    item.character.relationship?.trim() ||
    tags ||
    item.character.currentStatus?.trim() ||
    "打开联系人资料"
  );
}
