import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ArrowUpRight,
  Blocks,
  Bookmark,
  ChevronRight,
  Clock3,
  MessageSquareText,
  Newspaper,
  Search,
  Star,
  UsersRound,
} from "lucide-react";
import { AvatarChip } from "../../components/avatar-chip";
import { cn } from "@yinjie/ui";
import { type DesktopSearchQuickLink } from "./desktop-search-quick-links";
import { renderHighlightedText } from "./search-utils";
import {
  searchCategoryLabels,
  searchCategoryTitles,
  type SearchCategory,
  type SearchHistoryItem,
  type SearchMatchCounts,
  type SearchMessageGroup,
  type SearchOfficialAccountGroup,
  type SearchResultCategory,
  type SearchResultItem,
  type SearchResultSection,
  type SearchScopeCounts,
} from "./search-types";

type DesktopSearchWorkspaceProps = {
  activeCategory: SearchCategory;
  error: string | null;
  groupedResults: SearchResultSection[];
  hasKeyword: boolean;
  history: SearchHistoryItem[];
  loading: boolean;
  matchedCounts: SearchMatchCounts;
  messageGroups: SearchMessageGroup[];
  officialAccountGroups: SearchOfficialAccountGroup[];
  onApplyHistory: (keyword: string) => void;
  onClearHistory: () => void;
  onClearKeyword: () => void;
  onCommitSearch: (keyword: string) => void;
  onOpenQuickLink: (item: DesktopSearchQuickLink) => void;
  onOpenResult: (item: SearchResultItem) => void;
  onRemoveHistory: (keyword: string) => void;
  recentFavorites: DesktopSearchQuickLink[];
  recentMiniPrograms: DesktopSearchQuickLink[];
  scopeCounts: SearchScopeCounts;
  searchText: string;
  searchingMessages: boolean;
  setActiveCategory: Dispatch<SetStateAction<SearchCategory>>;
  setSearchText: Dispatch<SetStateAction<string>>;
  visibleResults: SearchResultItem[];
};

const desktopSearchFocusRingClassName =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(7,193,96,0.22)] focus-visible:ring-offset-2 focus-visible:ring-offset-white";
const desktopSearchCardFocusClassName = cn(
  desktopSearchFocusRingClassName,
  "focus-visible:-translate-y-0.5 focus-visible:shadow-[0_18px_44px_rgba(7,193,96,0.12)]",
);
const desktopSearchRowFocusClassName = cn(
  desktopSearchFocusRingClassName,
  "focus-visible:shadow-[0_12px_28px_rgba(7,193,96,0.10)]",
);
const desktopSearchChipFocusClassName = cn(
  desktopSearchFocusRingClassName,
  "focus-visible:shadow-[0_10px_24px_rgba(7,193,96,0.08)]",
);
const desktopSearchSelectedCardClassName =
  "border-[rgba(7,193,96,0.24)] shadow-[0_20px_44px_rgba(7,193,96,0.10)]";
const desktopSearchSelectedRowClassName =
  "border-[rgba(7,193,96,0.20)] bg-[rgba(7,193,96,0.05)] shadow-[0_12px_28px_rgba(7,193,96,0.08)]";

type DesktopSearchFocusRegion = "input" | "categories" | "results";

const desktopSearchFocusRegionLabels: Record<
  DesktopSearchFocusRegion,
  string
> = {
  input: "搜索框",
  categories: "分类条",
  results: "结果区",
};

const landingScopeCards = [
  {
    id: "messages" as const,
    icon: MessageSquareText,
    title: "聊天记录",
    description: "优先定位会话和消息片段。",
  },
  {
    id: "contacts" as const,
    icon: UsersRound,
    title: "联系人",
    description: "支持备注名、角色名和标签。",
  },
  {
    id: "favorites" as const,
    icon: Bookmark,
    title: "收藏",
    description: "聚合消息、笔记和内容收藏。",
  },
  {
    id: "officialAccounts" as const,
    icon: Newspaper,
    title: "公众号",
    description: "支持账号资料和文章命中。",
  },
  {
    id: "miniPrograms" as const,
    icon: Blocks,
    title: "小程序",
    description: "覆盖最近使用和目录里的入口。",
  },
  {
    id: "moments" as const,
    icon: Star,
    title: "朋友圈",
    description: "支持好友动态和评论命中。",
  },
  {
    id: "feed" as const,
    icon: Blocks,
    title: "内容流",
    description: "继续承接广场动态结果。",
  },
];

type DesktopSearchScopeCardCategory = (typeof landingScopeCards)[number]["id"];

export function DesktopSearchWorkspace({
  activeCategory,
  error,
  groupedResults,
  hasKeyword,
  history,
  loading,
  matchedCounts,
  messageGroups,
  officialAccountGroups,
  onApplyHistory,
  onClearHistory,
  onClearKeyword,
  onCommitSearch,
  onOpenQuickLink,
  onOpenResult,
  onRemoveHistory,
  recentFavorites,
  recentMiniPrograms,
  scopeCounts,
  searchText,
  searchingMessages,
  setActiveCategory,
  setSearchText,
  visibleResults,
}: DesktopSearchWorkspaceProps) {
  const allResultSectionRefs = useRef<
    Partial<Record<SearchResultCategory, HTMLElement | null>>
  >({});
  const autoSelectResultRef = useRef(false);
  const pendingAllResultsJumpRef = useRef<SearchResultCategory | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const categoryTabRefs = useRef<
    Partial<Record<SearchCategory, HTMLButtonElement | null>>
  >({});
  const resultButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const spotlightPanelTimeoutRef = useRef<number | null>(null);
  const transitionHintTimeoutRef = useRef<number | null>(null);
  const [activeAllResultsSection, setActiveAllResultsSection] =
    useState<SearchResultCategory | null>(null);
  const [keyboardFocusRegion, setKeyboardFocusRegion] =
    useState<DesktopSearchFocusRegion>("input");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [spotlightPanelId, setSpotlightPanelId] = useState<SearchCategory | null>(
    null,
  );
  const [transitionHint, setTransitionHint] = useState<string | null>(null);
  const normalizedKeyword = searchText.trim().toLowerCase();
  const groupedMessageHeaderIds = useMemo(
    () => new Set(messageGroups.map((item) => item.header.id)),
    [messageGroups],
  );
  const messageConversationOnlyResults = useMemo(
    () =>
      visibleResults.filter(
        (item) =>
          item.category === "messages" &&
          item.id.startsWith("conversation-") &&
          !groupedMessageHeaderIds.has(item.id),
      ),
    [groupedMessageHeaderIds, visibleResults],
  );
  const groupedOfficialAccountHeaderIds = useMemo(
    () => new Set(officialAccountGroups.map((item) => item.header.id)),
    [officialAccountGroups],
  );
  const officialAccountOnlyResults = useMemo(
    () =>
      visibleResults.filter(
        (item) =>
          item.category === "officialAccounts" &&
          item.id.startsWith("official-") &&
          !item.id.startsWith("official-article:") &&
          !groupedOfficialAccountHeaderIds.has(item.id),
      ),
    [groupedOfficialAccountHeaderIds, visibleResults],
  );
  const allResultPreviewSections = useMemo(
    () =>
      groupedResults.map((section) => {
        const previewContentResults = isDesktopContentCategory(section.category)
          ? section.results.slice(0, 4)
          : [];
        const previewFeatureResults = isDesktopFeatureCardCategory(section.category)
          ? section.results.slice(0, section.category === "favorites" ? 3 : 4)
          : [];
        const previewMessageGroups =
          section.category === "messages" ? messageGroups.slice(0, 3) : [];
        const previewMessageConversations =
          section.category === "messages"
            ? messageConversationOnlyResults.slice(
                0,
                Math.max(0, 5 - previewMessageGroups.length),
              )
            : [];
        const previewOfficialAccountGroups =
          section.category === "officialAccounts"
            ? officialAccountGroups.slice(0, 3)
            : [];
        const previewOfficialAccounts =
          section.category === "officialAccounts"
            ? officialAccountOnlyResults.slice(
                0,
                Math.max(0, 5 - previewOfficialAccountGroups.length),
              )
            : [];
        const previewResults = section.results.slice(0, 6);
        const hasMore =
          section.category === "messages"
            ? messageGroups.length > previewMessageGroups.length ||
              messageConversationOnlyResults.length >
                previewMessageConversations.length
            : section.category === "officialAccounts"
              ? officialAccountGroups.length > previewOfficialAccountGroups.length ||
                officialAccountOnlyResults.length > previewOfficialAccounts.length
              : isDesktopFeatureCardCategory(section.category)
                ? section.results.length > previewFeatureResults.length
                : isDesktopContentCategory(section.category)
                  ? section.results.length > previewContentResults.length
                  : section.results.length > previewResults.length;

        return {
          hasMore,
          previewContentResults,
          previewFeatureResults,
          previewMessageConversations,
          previewMessageGroups,
          previewOfficialAccountGroups,
          previewOfficialAccounts,
          previewResults,
          section,
        };
      }),
    [
      groupedResults,
      messageConversationOnlyResults,
      messageGroups,
      officialAccountGroups,
      officialAccountOnlyResults,
    ],
  );
  const keyboardNavigableResults = useMemo(() => {
    if (!hasKeyword) {
      return [] as SearchResultItem[];
    }

    if (activeCategory === "all") {
      return allResultPreviewSections.flatMap((entry) => {
        const { section } = entry;

        if (section.category === "messages") {
          return [
            ...entry.previewMessageGroups.map((group) => group.header),
            ...entry.previewMessageGroups.flatMap((group) => group.messages),
            ...entry.previewMessageConversations,
          ];
        }

        if (section.category === "officialAccounts") {
          return [
            ...entry.previewOfficialAccountGroups.map((group) => group.header),
            ...entry.previewOfficialAccountGroups.flatMap(
              (group) => group.articles,
            ),
            ...entry.previewOfficialAccounts,
          ];
        }

        if (isDesktopFeatureCardCategory(section.category)) {
          return entry.previewFeatureResults;
        }

        if (isDesktopContentCategory(section.category)) {
          return entry.previewContentResults;
        }

        return entry.previewResults;
      });
    }

    if (activeCategory === "messages") {
      return [
        ...messageGroups.map((group) => group.header),
        ...messageGroups.flatMap((group) => group.messages),
        ...messageConversationOnlyResults,
      ];
    }

    if (activeCategory === "officialAccounts") {
      return [
        ...officialAccountGroups.map((group) => group.header),
        ...officialAccountGroups.flatMap((group) => group.articles),
        ...officialAccountOnlyResults,
      ];
    }

    return visibleResults;
  }, [
    activeCategory,
    allResultPreviewSections,
    hasKeyword,
    messageConversationOnlyResults,
    messageGroups,
    officialAccountGroups,
    officialAccountOnlyResults,
    visibleResults,
  ]);
  const preferredAutoSelectedResultId = useMemo(() => {
    if (!hasKeyword) {
      return null;
    }

    const resolveEntryPreferredResultId = (
      entry: (typeof allResultPreviewSections)[number] | undefined,
    ) => {
      if (!entry) {
        return null;
      }

      const { section } = entry;
      if (section.category === "messages") {
        return (
          entry.previewMessageGroups[0]?.header.id ??
          entry.previewMessageConversations[0]?.id ??
          null
        );
      }

      if (section.category === "officialAccounts") {
        return (
          entry.previewOfficialAccountGroups[0]?.header.id ??
          entry.previewOfficialAccounts[0]?.id ??
          null
        );
      }

      if (isDesktopFeatureCardCategory(section.category)) {
        return entry.previewFeatureResults[0]?.id ?? null;
      }

      if (isDesktopContentCategory(section.category)) {
        return entry.previewContentResults[0]?.id ?? null;
      }

      return entry.previewResults[0]?.id ?? null;
    };

    if (activeCategory === "all") {
      const preferredSectionCategory =
        activeAllResultsSection ?? groupedResults[0]?.category ?? null;
      const preferredEntry = preferredSectionCategory
        ? allResultPreviewSections.find(
            (entry) => entry.section.category === preferredSectionCategory,
          )
        : allResultPreviewSections[0];

      return (
        resolveEntryPreferredResultId(preferredEntry) ??
        keyboardNavigableResults[0]?.id ??
        null
      );
    }

    if (activeCategory === "messages") {
      return (
        messageGroups[0]?.header.id ??
        messageConversationOnlyResults[0]?.id ??
        keyboardNavigableResults[0]?.id ??
        null
      );
    }

    if (activeCategory === "officialAccounts") {
      return (
        officialAccountGroups[0]?.header.id ??
        officialAccountOnlyResults[0]?.id ??
        keyboardNavigableResults[0]?.id ??
        null
      );
    }

    return visibleResults[0]?.id ?? keyboardNavigableResults[0]?.id ?? null;
  }, [
    activeAllResultsSection,
    activeCategory,
    allResultPreviewSections,
    groupedResults,
    hasKeyword,
    keyboardNavigableResults,
    messageConversationOnlyResults,
    messageGroups,
    officialAccountGroups,
    officialAccountOnlyResults,
    visibleResults,
  ]);
  const selectedResultIndex = useMemo(
    () =>
      selectedResultId
        ? keyboardNavigableResults.findIndex((item) => item.id === selectedResultId)
        : -1,
    [keyboardNavigableResults, selectedResultId],
  );
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      categoryTabRefs.current[activeCategory]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    });
  }, [activeCategory]);

  useEffect(() => {
    return () => {
      if (spotlightPanelTimeoutRef.current !== null) {
        window.clearTimeout(spotlightPanelTimeoutRef.current);
      }
      if (transitionHintTimeoutRef.current !== null) {
        window.clearTimeout(transitionHintTimeoutRef.current);
      }
    };
  }, []);

  const focusSearchInput = useEffectEvent((moveCaretToEnd = false) => {
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      if (!moveCaretToEnd) {
        return;
      }

      const length = input.value.length;
      input.setSelectionRange(length, length);
    });
  });
  const scrollResultsToTop = useEffectEvent(
    (behavior: ScrollBehavior = "smooth") => {
      const viewport = scrollViewportRef.current;
      if (!viewport) {
        return;
      }

      if (behavior === "auto") {
        viewport.scrollTop = 0;
        return;
      }

      viewport.scrollTo({ top: 0, behavior });
    },
  );
  const showTransitionHint = useEffectEvent((message: string) => {
    if (transitionHintTimeoutRef.current !== null) {
      window.clearTimeout(transitionHintTimeoutRef.current);
    }

    setTransitionHint(message);
    transitionHintTimeoutRef.current = window.setTimeout(() => {
      setTransitionHint(null);
      transitionHintTimeoutRef.current = null;
    }, 2200);
  });
  const scrollSelectedResultIntoView = useEffectEvent(
    (resultId: string, behavior: ScrollBehavior = "smooth") => {
      resultButtonRefs.current[resultId]?.scrollIntoView({
        behavior,
        block: "nearest",
        inline: "nearest",
      });
    },
  );
  const showPanelSpotlight = useEffectEvent((panelId: SearchCategory | null) => {
    if (spotlightPanelTimeoutRef.current !== null) {
      window.clearTimeout(spotlightPanelTimeoutRef.current);
    }

    if (!panelId) {
      setSpotlightPanelId(null);
      spotlightPanelTimeoutRef.current = null;
      return;
    }

    setSpotlightPanelId(panelId);
    spotlightPanelTimeoutRef.current = window.setTimeout(() => {
      setSpotlightPanelId(null);
      spotlightPanelTimeoutRef.current = null;
    }, 2200);
  });
  const scrollAllResultsSectionIntoView = useEffectEvent(
    (category: SearchResultCategory, behavior: ScrollBehavior = "smooth") => {
      const viewport = scrollViewportRef.current;
      const panel = allResultSectionRefs.current[category];
      if (!viewport || !panel) {
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const nextTop = panelRect.top - viewportRect.top + viewport.scrollTop - 16;
      viewport.scrollTo({
        top: Math.max(0, nextTop),
        behavior,
      });
    },
  );
  const syncActiveAllResultsSection = useEffectEvent(() => {
    if (!hasKeyword || activeCategory !== "all") {
      return;
    }

    const viewport = scrollViewportRef.current;
    if (!viewport || !groupedResults.length) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const anchorTop = viewportRect.top + 220;
    let nextCategory = groupedResults[0]?.category ?? null;

    for (const section of groupedResults) {
      const panel = allResultSectionRefs.current[section.category];
      if (!panel) {
        continue;
      }

      const panelRect = panel.getBoundingClientRect();
      if (panelRect.top <= anchorTop) {
        nextCategory = section.category;
        continue;
      }

      break;
    }

    setActiveAllResultsSection((current) =>
      current === nextCategory ? current : nextCategory,
    );
  });
  const resolveCategoryHintTitle = (category: SearchCategory) =>
    category === "all" ? "全部结果" : searchCategoryTitles[category];
  const resolveSpotlightPanelId = (
    category: SearchCategory,
  ): SearchCategory | null => {
    if (!hasKeyword) {
      return null;
    }

    if (category === "all") {
      return groupedResults[0]?.category ?? null;
    }

    return category;
  };
  const handleJumpToAllResultsSection = useEffectEvent(
    (category: SearchResultCategory) => {
      autoSelectResultRef.current = true;
      setSelectedResultId(null);
      scrollAllResultsSectionIntoView(category, "smooth");
      setActiveAllResultsSection(category);
      showPanelSpotlight(category);
      showTransitionHint(`已定位到${searchCategoryTitles[category]}分区。`);
    },
  );
  const handleExpandAllResultsSection = useEffectEvent(
    (category: SearchResultCategory) => {
      setActiveCategory(category);
      scrollResultsToTop("smooth");
      focusSearchInput(Boolean(searchText.trim()));
      showPanelSpotlight(category);
      showTransitionHint(`已展开${searchCategoryTitles[category]}全部结果。`);
    },
  );
  const handleSelectCategory = useEffectEvent(
    (category: SearchCategory, options?: { focusInput?: boolean }) => {
      const categoryChanged = category !== activeCategory;
      setActiveCategory(category);
      scrollResultsToTop("smooth");
      if (categoryChanged) {
        showPanelSpotlight(resolveSpotlightPanelId(category));
        showTransitionHint(
          hasKeyword
            ? `已切换到${resolveCategoryHintTitle(category)}，结果已回到顶部。`
            : `已切换到${resolveCategoryHintTitle(category)}，继续输入关键词开始搜索。`,
        );
      }
      if (options?.focusInput) {
        focusSearchInput(Boolean(searchText.trim()));
      }
    },
  );
  const handleApplyHistory = useEffectEvent((keyword: string) => {
    onApplyHistory(keyword);
    scrollResultsToTop("smooth");
    focusSearchInput(true);
    showTransitionHint(`已应用历史关键词“${keyword}”，结果已回到顶部。`);
  });
  const handleClearKeyword = useEffectEvent(() => {
    onClearKeyword();
    scrollResultsToTop("smooth");
    focusSearchInput(false);
    showTransitionHint("已清空关键词，回到搜索首页。");
  });

  const categorySummary = useMemo(() => {
    if (!hasKeyword) {
      return "从聊天、联系人、公众号、收藏和小程序里继续找。";
    }

    if (activeCategory === "all") {
      return `关键词“${searchText.trim()}”命中 ${visibleResults.length} 条结果，可继续按分类收窄。`;
    }

    return `当前查看 ${searchCategoryTitles[activeCategory]}，共 ${visibleResults.length} 条结果。`;
  }, [activeCategory, hasKeyword, searchText, visibleResults.length]);
  const headerTitle = hasKeyword
    ? `搜索“${searchText.trim()}”`
    : "搜索聊天、联系人与内容";
  const headerBadge = !hasKeyword
    ? "桌面全局搜索"
    : activeCategory === "all"
      ? `${visibleResults.length} 条结果`
      : `${searchCategoryTitles[activeCategory]} · ${visibleResults.length}`;
  const keywordLabel = searchText.trim();
  const contextCategoryTitle =
    activeCategory === "all" ? "全部结果" : searchCategoryTitles[activeCategory];
  const contextKeyboardHint = useMemo(() => {
    if (keyboardFocusRegion === "results" && keyboardNavigableResults.length) {
      return "↑ ↓ 切换当前项 · Enter 打开当前项 · Esc 回搜索框 · Home 回顶部";
    }

    if (keyboardFocusRegion === "categories") {
      return "← → 切分类 · Home / End 跳转 · Esc 回搜索框";
    }

    if (keyboardNavigableResults.length) {
      return selectedResultId
        ? "Tab 进入结果层 · Enter 打开当前项 · Esc 取消预选"
        : "Tab 进入结果层 · ↑ ↓ 预选当前项 · Esc 清空关键词";
    }

    return "Enter 执行搜索 · Esc 清空关键词";
  }, [
    keyboardFocusRegion,
    keyboardNavigableResults.length,
    selectedResultId,
  ]);
  const handleScrollToTopContext = useEffectEvent(() => {
    scrollResultsToTop("smooth");
    focusSearchInput(Boolean(searchText.trim()));
    showPanelSpotlight(resolveSpotlightPanelId(activeCategory));
    showTransitionHint("已回到顶部，可继续调整关键词或切换分类。");
  });
  const handleBackToAllResults = useEffectEvent(
    (category: SearchResultCategory) => {
      pendingAllResultsJumpRef.current = category;
      setActiveAllResultsSection(category);
      setActiveCategory("all");
      focusSearchInput(Boolean(searchText.trim()));
      showTransitionHint(`已回到全部结果，并定位到${searchCategoryTitles[category]}分区。`);
    },
  );
  const handleSelectResult = useEffectEvent((resultId: string) => {
    autoSelectResultRef.current = false;
    setSelectedResultId(resultId);
  });
  const focusResultButton = useEffectEvent((resultId: string) => {
    window.requestAnimationFrame(() => {
      resultButtonRefs.current[resultId]?.focus();
    });
  });
  const focusCategoryChip = useEffectEvent((category: SearchCategory) => {
    window.requestAnimationFrame(() => {
      categoryTabRefs.current[category]?.focus();
    });
  });
  const handleMoveSelectedResult = useEffectEvent(
    (direction: -1 | 1, options?: { focusButton?: boolean }) => {
      if (!keyboardNavigableResults.length) {
        return;
      }

      const nextIndex =
        selectedResultIndex === -1
          ? direction === 1
            ? 0
            : keyboardNavigableResults.length - 1
          : Math.min(
              Math.max(selectedResultIndex + direction, 0),
              keyboardNavigableResults.length - 1,
            );
      const nextResult = keyboardNavigableResults[nextIndex];
      if (!nextResult) {
        return;
      }

      autoSelectResultRef.current = false;
      setSelectedResultId(nextResult.id);
      scrollSelectedResultIntoView(nextResult.id);
      if (options?.focusButton) {
        focusResultButton(nextResult.id);
      }
    },
  );
  const handleFocusSelectedResult = useEffectEvent(() => {
    const targetResultId = selectedResultId ?? preferredAutoSelectedResultId;
    if (!targetResultId) {
      return;
    }

    setSelectedResultId(targetResultId);
    scrollSelectedResultIntoView(targetResultId, "auto");
    focusResultButton(targetResultId);
  });
  const handleOpenSelectedResult = useEffectEvent((resultId: string) => {
    const result =
      keyboardNavigableResults.find((item) => item.id === resultId) ?? null;
    if (!result) {
      return;
    }

    autoSelectResultRef.current = false;
    setSelectedResultId(result.id);
    onOpenResult(result);
  });
  const handleMoveCategoryChip = useEffectEvent(
    (category: SearchCategory, direction: -1 | 1) => {
      const index = searchCategoryLabels.findIndex((item) => item.id === category);
      if (index === -1) {
        return;
      }

      const nextIndex = Math.min(
        Math.max(index + direction, 0),
        searchCategoryLabels.length - 1,
      );
      const nextCategory = searchCategoryLabels[nextIndex]?.id;
      if (!nextCategory) {
        return;
      }

      handleSelectCategory(nextCategory);
      focusCategoryChip(nextCategory);
    },
  );
  const handleReturnToSearchInput = useEffectEvent(() => {
    focusSearchInput(true);
    showTransitionHint(
      selectedResultId
        ? "已回到搜索框，再按 Esc 可取消预选结果。"
        : searchText.trim()
          ? "已回到搜索框，再按 Esc 可清空关键词。"
          : "已回到搜索框，可继续输入或切换分类。",
    );
  });
  const handleClearSelectedResult = useEffectEvent(() => {
    autoSelectResultRef.current = false;
    setSelectedResultId(null);
    showTransitionHint(
      searchText.trim()
        ? "已取消结果选择，再按 Esc 可清空关键词。"
        : "已取消结果选择，可继续输入关键词。",
    );
  });
  const handleWorkspaceKeyDownCapture = useEffectEvent(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const resultButton = target?.closest<HTMLElement>("[data-search-result-id]");
      if (resultButton) {
        const resultId = resultButton.dataset.searchResultId;
        if (!resultId) {
          return;
        }

        if (event.key === "Tab" && event.shiftKey) {
          event.preventDefault();
          focusSearchInput(true);
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          handleMoveSelectedResult(1, { focusButton: true });
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          handleMoveSelectedResult(-1, { focusButton: true });
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          handleOpenSelectedResult(resultId);
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          handleReturnToSearchInput();
          return;
        }

        if (event.key === "Home") {
          event.preventDefault();
          handleScrollToTopContext();
        }
        return;
      }

      const categoryChip = target?.closest<HTMLElement>("[data-search-category-chip]");
      if (categoryChip) {
        const category = categoryChip.dataset.searchCategoryChip as
          | SearchCategory
          | undefined;
        if (!category) {
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          handleMoveCategoryChip(category, 1);
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          handleMoveCategoryChip(category, -1);
          return;
        }

        if (event.key === "Home") {
          event.preventDefault();
          handleSelectCategory("all");
          focusCategoryChip("all");
          return;
        }

        if (event.key === "End") {
          event.preventDefault();
          const lastCategory =
            searchCategoryLabels[searchCategoryLabels.length - 1]?.id;
          if (!lastCategory) {
            return;
          }

          handleSelectCategory(lastCategory);
          focusCategoryChip(lastCategory);
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          handleReturnToSearchInput();
        }
      }
    },
  );
  const handleWorkspaceFocusCapture = useEffectEvent(
    (event: ReactFocusEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (target === inputRef.current) {
        setKeyboardFocusRegion("input");
        return;
      }

      if (target.closest("[data-search-category-chip]")) {
        setKeyboardFocusRegion("categories");
        return;
      }

      if (
        target.closest("[data-search-result-id]") ||
        target.closest("[data-search-context-bar]")
      ) {
        setKeyboardFocusRegion("results");
      }
    },
  );
  const handleSearchInputKeyDown = useEffectEvent(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      if (event.key === "ArrowDown") {
        if (!keyboardNavigableResults.length) {
          return;
        }

        event.preventDefault();
        handleMoveSelectedResult(1);
        return;
      }

      if (event.key === "ArrowUp") {
        if (!keyboardNavigableResults.length) {
          return;
        }

        event.preventDefault();
        handleMoveSelectedResult(-1);
        return;
      }

      if (event.key === "Tab" && !event.shiftKey) {
        const targetResultId = selectedResultId ?? preferredAutoSelectedResultId;
        if (!targetResultId) {
          return;
        }

        event.preventDefault();
        handleFocusSelectedResult();
        return;
      }

      if (event.key === "Enter" && selectedResultId) {
        event.preventDefault();
        handleOpenSelectedResult(selectedResultId);
        return;
      }

      if (event.key === "Escape" && !selectedResultId && searchText.trim()) {
        event.preventDefault();
        handleClearKeyword();
        return;
      }

      if (event.key === "Escape" && selectedResultId) {
        event.preventDefault();
        handleClearSelectedResult();
      }
    },
  );

  useEffect(() => {
    if (!hasKeyword || activeCategory !== "all") {
      setActiveAllResultsSection(null);
      return;
    }

    const pendingSection = pendingAllResultsJumpRef.current;
    if (pendingSection) {
      setActiveAllResultsSection(pendingSection);
      window.requestAnimationFrame(() => {
        scrollAllResultsSectionIntoView(pendingSection, "smooth");
        showPanelSpotlight(pendingSection);
        pendingAllResultsJumpRef.current = null;
      });
      return;
    }

    setActiveAllResultsSection(groupedResults[0]?.category ?? null);
  }, [
    activeCategory,
    groupedResults,
    hasKeyword,
    scrollAllResultsSectionIntoView,
    showPanelSpotlight,
  ]);

  useEffect(() => {
    if (!hasKeyword || activeCategory !== "all") {
      return;
    }

    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      syncActiveAllResultsSection();
    };

    syncActiveAllResultsSection();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [activeCategory, groupedResults, hasKeyword, syncActiveAllResultsSection]);

  useEffect(() => {
    autoSelectResultRef.current = hasKeyword;
    setSelectedResultId(null);
  }, [activeCategory, hasKeyword, searchText]);

  useEffect(() => {
    if (!selectedResultId) {
      return;
    }

    if (keyboardNavigableResults.some((item) => item.id === selectedResultId)) {
      return;
    }

    autoSelectResultRef.current = true;
    setSelectedResultId(null);
  }, [keyboardNavigableResults, selectedResultId]);

  useEffect(() => {
    if (!hasKeyword || !preferredAutoSelectedResultId) {
      return;
    }

    if (!autoSelectResultRef.current || selectedResultId) {
      return;
    }

    setSelectedResultId(preferredAutoSelectedResultId);
  }, [hasKeyword, preferredAutoSelectedResultId, selectedResultId]);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[color:var(--bg-app)]"
      onFocusCapture={handleWorkspaceFocusCapture}
      onKeyDownCapture={handleWorkspaceKeyDownCapture}
    >
      <header className="shrink-0 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.92)] backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1160px] px-6 py-5">
          <div className="overflow-hidden rounded-[24px] border border-[#dce9dd] bg-[linear-gradient(135deg,rgba(7,193,96,0.14),rgba(7,193,96,0.05)_40%,white)]">
            <div className="px-5 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white text-[color:var(--brand-primary)] shadow-[0_10px_24px_rgba(7,193,96,0.10)]">
                  <Search size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
                        搜一搜
                      </div>
                      <div className="mt-2 truncate text-lg font-medium text-[color:var(--text-primary)]">
                        {headerTitle}
                      </div>
                      <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                        {categorySummary}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full bg-white/90 px-3 py-1.5 text-[11px] text-[color:var(--text-muted)] shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                      {headerBadge}
                    </div>
                  </div>

                  <form
                    className="relative mt-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onCommitSearch(searchText);
                    }}
                  >
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-dim)]"
                    />
                    <input
                      ref={inputRef}
                      type="search"
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      onKeyDown={handleSearchInputKeyDown}
                      placeholder="搜索聊天记录、联系人、公众号、收藏和小程序"
                      className="h-12 w-full rounded-[16px] border border-white/80 bg-white/96 pl-11 pr-20 text-sm text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.4)] focus:shadow-[0_0_0_4px_rgba(7,193,96,0.08)]"
                    />
                    {searchText ? (
                      <DesktopSearchActionButton
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        onClick={handleClearKeyword}
                        priority="secondary"
                        tone="neutral"
                      >
                        清空
                      </DesktopSearchActionButton>
                    ) : null}
                  </form>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "border-t border-white/80 px-5 py-3 transition-[background-color,box-shadow]",
                keyboardFocusRegion === "categories"
                  ? "bg-[rgba(255,255,255,0.42)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_0_0_1px_rgba(7,193,96,0.08)]"
                  : null,
              )}
            >
              <div className="flex gap-2 overflow-x-auto pb-1">
                {searchCategoryLabels.map((item) => {
                  const countLabel = !hasKeyword
                    ? null
                    : item.id === "all"
                      ? `${visibleResults.length}`
                      : `${matchedCounts[item.id]}`;

                  return (
                    <button
                      data-search-category-chip={item.id}
                      key={item.id}
                      ref={(node) => {
                        categoryTabRefs.current[item.id] = node;
                      }}
                      type="button"
                      onClick={() =>
                        handleSelectCategory(item.id, { focusInput: true })
                      }
                      className={cn(
                        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition",
                        desktopSearchChipFocusClassName,
                        activeCategory === item.id
                          ? "border-[rgba(7,193,96,0.16)] bg-white text-[color:var(--text-primary)] shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                          : "border-white/70 bg-white/70 text-[color:var(--text-secondary)] hover:bg-white hover:text-[color:var(--text-primary)]",
                      )}
                    >
                      <span>{item.label}</span>
                      {countLabel ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px]",
                            activeCategory === item.id
                              ? "bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]"
                              : "bg-white text-[color:var(--text-muted)]",
                          )}
                        >
                          {countLabel}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div ref={scrollViewportRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1160px] min-h-full flex-col px-6 py-6">
          {loading ? (
            <DesktopSearchStatusCard
              badgeLabel="准备中"
              description="正在准备桌面搜索索引，马上就能继续查看完整结果。"
              status="pending"
              title="搜索准备"
            />
          ) : null}
          {error ? (
            <DesktopSearchStatusCard
              description={error}
              status="error"
              title="搜索异常"
            />
          ) : null}
          {!loading && !error && transitionHint ? (
            <DesktopSearchStatusCard
              description={transitionHint}
              status="done"
              title="搜索定位"
            />
          ) : null}

          {!loading && !error && hasKeyword && searchingMessages ? (
            <DesktopSearchStatusCard
              description="聊天记录结果还在继续补全，稍后会自动刷新更多命中。"
              status="pending"
              title="搜索进度"
            />
          ) : null}
          {!loading && !error && hasKeyword ? (
            <DesktopSearchContextBar
              activeCategory={activeCategory}
              categoryTitle={contextCategoryTitle}
              count={visibleResults.length}
              keyword={keywordLabel}
              keyboardHint={contextKeyboardHint}
              focusRegion={keyboardFocusRegion}
              onBackToAll={
                activeCategory === "all"
                  ? undefined
                  : () => handleBackToAllResults(activeCategory)
              }
              onClearKeyword={handleClearKeyword}
              onScrollToTop={handleScrollToTopContext}
              onSelectSection={
                activeCategory === "all"
                  ? handleJumpToAllResultsSection
                  : undefined
              }
              sectionItems={
                activeCategory === "all"
                  ? groupedResults.map((section) => ({
                      category: section.category,
                      count: section.results.length,
                      label: section.label,
                    }))
                  : undefined
              }
              activeSection={activeAllResultsSection}
            />
          ) : null}

          {!loading && !error && !hasKeyword ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {landingScopeCards.map((item) => {
                  const Icon = item.icon;
                  const count = getDesktopSearchScopeCount(scopeCounts, item.id);

                  return (
                    <DesktopSearchScopeCard
                      key={item.id}
                      category={item.id}
                      count={count}
                      description={item.description}
                      icon={Icon}
                      onClick={() =>
                        handleSelectCategory(item.id, { focusInput: true })
                      }
                      title={item.title}
                    />
                  );
                })}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <DesktopSearchLandingPanel
                  action={
                    history.length ? (
                      <DesktopSearchActionButton
                        onClick={onClearHistory}
                        tone="neutral"
                      >
                        清空记录
                      </DesktopSearchActionButton>
                    ) : null
                  }
                  countLabel={history.length ? `${history.length} 条记录` : undefined}
                  contextLabel="搜索记录"
                  description="优先展示最近真正用过的关键词。"
                  title="最近搜索"
                >
                  {history.length ? (
                    <div className="space-y-2">
                      {history.map((item) => (
                        <DesktopSearchHistoryRow
                          key={item.keyword}
                          keyword={item.keyword}
                          onApply={() => handleApplyHistory(item.keyword)}
                          onRemove={() => onRemoveHistory(item.keyword)}
                        />
                      ))}
                    </div>
                  ) : (
                    <DesktopSearchStatusCard
                      badgeLabel="等待记录"
                      className="mb-0 rounded-[16px] border-[color:var(--border-faint)] bg-white p-3.5"
                      description="从聊天、通讯录或左侧导航进入搜一搜后，这里会开始积累关键词。"
                      status="empty"
                      title="最近搜索"
                    />
                  )}
                </DesktopSearchLandingPanel>

                <div className="space-y-4">
                  <DesktopQuickLinksPanel
                    title="最近使用的小程序"
                    description="优先展示最近打开的小程序入口。"
                    emptyText="打开过的小程序会先沉淀到这里。"
                    items={recentMiniPrograms}
                    onOpen={onOpenQuickLink}
                  />
                  <DesktopQuickLinksPanel
                    title="最近收藏"
                    description="优先展示高频回看的收藏入口。"
                    emptyText="收藏过内容后，这里会出现最近回访入口。"
                    items={recentFavorites}
                    onOpen={onOpenQuickLink}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {!loading && !error && hasKeyword && !visibleResults.length ? (
            <DesktopSearchStatusCard
              action={
                <DesktopSearchActionButton
                  onClick={handleClearKeyword}
                  tone="neutral"
                >
                  清空关键词
                </DesktopSearchActionButton>
              }
              description="没有找到匹配内容，换个关键词试试，或者切到更具体的分类后继续找。"
              status="empty"
              title="搜索结果"
            />
          ) : null}

          {!loading && !error && hasKeyword ? (
            activeCategory === "all" ? (
              <div className="space-y-6">
                {allResultPreviewSections.map((entry) => {
                  const { section } = entry;
                  return (
                    <DesktopSearchResultsPanel
                      key={section.category}
                      action={
                        entry.hasMore ? (
                          <DesktopSearchActionButton
                            onClick={() =>
                              handleExpandAllResultsSection(section.category)
                            }
                            priority="secondary"
                            tone="brand"
                          >
                            查看全部
                          </DesktopSearchActionButton>
                        ) : null
                      }
                      countLabel={`${section.results.length} 条命中`}
                      description={getDesktopSearchSectionDescription(
                        section.category,
                      )}
                      highlighted={spotlightPanelId === section.category}
                      panelRef={(node) => {
                        allResultSectionRefs.current[section.category] = node;
                      }}
                      title={section.label}
                    >
                      {section.category === "messages" ? (
                        <DesktopSearchMessageResults
                          conversationResults={entry.previewMessageConversations}
                          keyword={normalizedKeyword}
                          messageGroups={entry.previewMessageGroups}
                          onOpen={onOpenResult}
                          onSelect={handleSelectResult}
                          registerResultRef={(resultId, node) => {
                            resultButtonRefs.current[resultId] = node;
                          }}
                          selectedResultId={selectedResultId}
                        />
                      ) : section.category === "officialAccounts" ? (
                        <DesktopSearchOfficialAccountResults
                          accountResults={entry.previewOfficialAccounts}
                          keyword={normalizedKeyword}
                          officialAccountGroups={entry.previewOfficialAccountGroups}
                          onOpen={onOpenResult}
                          onSelect={handleSelectResult}
                          registerResultRef={(resultId, node) => {
                            resultButtonRefs.current[resultId] = node;
                          }}
                          selectedResultId={selectedResultId}
                        />
                      ) : isDesktopFeatureCardCategory(section.category) ? (
                        <DesktopSearchFeatureResults
                          category={section.category}
                          items={entry.previewFeatureResults}
                          keyword={normalizedKeyword}
                          onOpen={onOpenResult}
                          onSelect={handleSelectResult}
                          registerResultRef={(resultId, node) => {
                            resultButtonRefs.current[resultId] = node;
                          }}
                          selectedResultId={selectedResultId}
                        />
                      ) : isDesktopContentCategory(section.category) ? (
                        <DesktopSearchContentResults
                          items={entry.previewContentResults}
                          keyword={normalizedKeyword}
                          onOpen={onOpenResult}
                          onSelect={handleSelectResult}
                          registerResultRef={(resultId, node) => {
                            resultButtonRefs.current[resultId] = node;
                          }}
                          selectedResultId={selectedResultId}
                        />
                      ) : (
                        <DesktopSearchResultStack>
                          {entry.previewResults.map((item) => (
                            <DesktopSearchResultRow
                              key={item.id}
                              buttonRef={(node) => {
                                resultButtonRefs.current[item.id] = node;
                              }}
                              item={item}
                              keyword={normalizedKeyword}
                              onOpen={onOpenResult}
                              onSelect={handleSelectResult}
                              selected={selectedResultId === item.id}
                            />
                          ))}
                        </DesktopSearchResultStack>
                      )}
                    </DesktopSearchResultsPanel>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <DesktopSearchDrilldownBanner
                  category={activeCategory}
                  count={visibleResults.length}
                  keyword={keywordLabel}
                  onBack={() => handleBackToAllResults(activeCategory)}
                />
                <DesktopSearchResultsPanel
                  countLabel={`${visibleResults.length} 条命中`}
                  description={`从全部结果展开，继续查看${searchCategoryTitles[activeCategory]}的完整命中。`}
                  highlighted={spotlightPanelId === activeCategory}
                  title={`${searchCategoryTitles[activeCategory]}全部结果`}
                >
                  {activeCategory === "messages" ? (
                  <DesktopSearchMessageResults
                    conversationResults={messageConversationOnlyResults}
                    keyword={normalizedKeyword}
                    messageGroups={messageGroups}
                    onOpen={onOpenResult}
                    onSelect={handleSelectResult}
                    registerResultRef={(resultId, node) => {
                      resultButtonRefs.current[resultId] = node;
                    }}
                    selectedResultId={selectedResultId}
                  />
                ) : activeCategory === "officialAccounts" ? (
                  <DesktopSearchOfficialAccountResults
                    accountResults={officialAccountOnlyResults}
                    keyword={normalizedKeyword}
                    officialAccountGroups={officialAccountGroups}
                    onOpen={onOpenResult}
                    onSelect={handleSelectResult}
                    registerResultRef={(resultId, node) => {
                      resultButtonRefs.current[resultId] = node;
                    }}
                    selectedResultId={selectedResultId}
                  />
                ) : isDesktopFeatureCardCategory(activeCategory) ? (
                  <DesktopSearchFeatureResults
                    category={activeCategory}
                    items={visibleResults}
                    keyword={normalizedKeyword}
                    onOpen={onOpenResult}
                    onSelect={handleSelectResult}
                    registerResultRef={(resultId, node) => {
                      resultButtonRefs.current[resultId] = node;
                    }}
                    selectedResultId={selectedResultId}
                  />
                ) : isDesktopContentCategory(activeCategory) ? (
                  <DesktopSearchContentResults
                    items={visibleResults}
                    keyword={normalizedKeyword}
                    onOpen={onOpenResult}
                    onSelect={handleSelectResult}
                    registerResultRef={(resultId, node) => {
                      resultButtonRefs.current[resultId] = node;
                    }}
                    selectedResultId={selectedResultId}
                  />
                ) : (
                  <DesktopSearchResultStack>
                    {visibleResults.map((item) => (
                      <DesktopSearchResultRow
                        key={item.id}
                        buttonRef={(node) => {
                          resultButtonRefs.current[item.id] = node;
                        }}
                        item={item}
                        keyword={normalizedKeyword}
                        onOpen={onOpenResult}
                        onSelect={handleSelectResult}
                        selected={selectedResultId === item.id}
                      />
                    ))}
                  </DesktopSearchResultStack>
                  )}
                </DesktopSearchResultsPanel>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DesktopQuickLinksPanel({
  contextLabel = "快捷入口",
  description,
  emptyText,
  items,
  onOpen,
  title,
}: {
  contextLabel?: string;
  description: string;
  emptyText: string;
  items: DesktopSearchQuickLink[];
  onOpen: (item: DesktopSearchQuickLink) => void;
  title: string;
}) {
  return (
    <DesktopSearchLandingPanel
      countLabel={items.length ? `${items.length} 个入口` : undefined}
      contextLabel={contextLabel}
      description={description}
      title={title}
    >
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <DesktopQuickLinkRow key={item.id} item={item} onOpen={onOpen} />
          ))}
        </div>
      ) : emptyText ? (
        <DesktopSearchStatusCard
          badgeLabel="等待回访"
          className="mb-0 rounded-[16px] border-[color:var(--border-faint)] bg-white p-3.5"
          description={emptyText}
          status="empty"
          title={title}
        />
      ) : null}
    </DesktopSearchLandingPanel>
  );
}

function DesktopSearchLandingPanel({
  action,
  children,
  countLabel,
  contextLabel = "首页入口",
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  countLabel?: string;
  contextLabel?: string;
  description: string;
  title: string;
}) {
  return (
    <section className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          {description ? (
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              {description}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {contextLabel ? (
            <div className="rounded-full bg-[rgba(7,193,96,0.08)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
              {contextLabel}
            </div>
          ) : null}
          {countLabel ? (
            <div className="rounded-full bg-white px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
              {countLabel}
            </div>
          ) : null}
          {action}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DesktopSearchActionButton({
  children,
  className,
  onClick,
  priority = "primary",
  tone,
}: {
  children: ReactNode;
  className?: string;
  onClick: () => void;
  priority?: "primary" | "secondary";
  tone: "brand" | "danger" | "neutral";
}) {
  const toneClassName =
    tone === "brand"
      ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)] hover:bg-[rgba(7,193,96,0.12)]"
      : tone === "danger"
        ? "border-[rgba(225,29,72,0.10)] bg-[rgba(225,29,72,0.06)] text-[#be123c] hover:bg-[rgba(225,29,72,0.10)]"
        : "border-[rgba(15,23,42,0.06)] bg-white text-[color:var(--text-muted)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]";

  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={priority === "secondary" ? -1 : undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] transition",
        desktopSearchChipFocusClassName,
        toneClassName,
        className,
      )}
    >
      {children}
    </button>
  );
}

function DesktopSearchOpenCue({
  className,
  compact = false,
  label,
  tone,
}: {
  className?: string;
  compact?: boolean;
  label: string;
  tone: "brand" | "gold" | "olive" | "teal";
}) {
  const toneClassName =
    tone === "gold"
      ? "border-[rgba(180,132,23,0.14)] bg-[rgba(180,132,23,0.08)] text-[#9a6b12] group-hover:bg-[rgba(180,132,23,0.12)] group-focus-visible:bg-[rgba(180,132,23,0.12)]"
      : tone === "teal"
        ? "border-[rgba(15,118,110,0.16)] bg-[rgba(15,118,110,0.08)] text-[#226448] group-hover:bg-[rgba(15,118,110,0.12)] group-focus-visible:bg-[rgba(15,118,110,0.12)]"
        : tone === "olive"
          ? "border-[rgba(134,181,96,0.18)] bg-[rgba(134,181,96,0.10)] text-[#587d38] group-hover:bg-[rgba(134,181,96,0.14)] group-focus-visible:bg-[rgba(134,181,96,0.14)]"
          : "border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)] group-hover:bg-[rgba(7,193,96,0.12)] group-focus-visible:bg-[rgba(7,193,96,0.12)]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border transition-[transform,background-color,border-color,color] group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5",
        compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-[11px]",
        toneClassName,
        className,
      )}
    >
      <span>{label}</span>
      <ArrowUpRight size={compact ? 11 : 12} />
    </span>
  );
}

function DesktopSearchFooterAffordance({
  ctaLabel,
  label,
  tone,
}: {
  ctaLabel: string;
  label: string;
  tone: "brand" | "gold" | "olive" | "teal";
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-xs">
      <span className="text-[color:var(--text-muted)]">{label}</span>
      <DesktopSearchOpenCue label={ctaLabel} tone={tone} />
    </div>
  );
}

function DesktopSearchStatusCard({
  action,
  badgeLabel,
  className,
  description,
  status,
  title,
}: {
  action?: ReactNode;
  badgeLabel?: string;
  className?: string;
  description: string;
  status: "done" | "empty" | "error" | "pending";
  title: string;
}) {
  const toneClassName =
    status === "error"
      ? "border-[rgba(225,29,72,0.14)] bg-[rgba(225,29,72,0.06)]"
      : status === "empty"
        ? "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
        : "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.05)]";
  const badgeClassName =
    status === "error"
      ? "bg-white text-[#be123c]"
      : status === "empty"
        ? "bg-white text-[color:var(--text-muted)]"
      : status === "pending"
        ? "bg-white text-[color:var(--brand-primary)]"
        : "bg-white text-[color:var(--text-muted)]";
  const statusLabel =
    status === "error"
      ? "异常"
      : status === "pending"
        ? "补全中"
        : status === "empty"
          ? "无结果"
          : "已完成";

  return (
    <section
      className={cn("mb-4 rounded-[18px] border p-4", toneClassName, className)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className={cn("rounded-full px-2.5 py-1 text-[10px]", badgeClassName)}>
          {badgeLabel ?? statusLabel}
        </div>
      </div>
      <div className="mt-2 rounded-[12px] bg-white px-3 py-2.5 text-xs leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
      {action ? <div className="mt-3 flex items-center justify-end">{action}</div> : null}
    </section>
  );
}

function DesktopSearchScopeCard({
  category,
  count,
  description,
  icon: Icon,
  onClick,
  title,
}: {
  category: DesktopSearchScopeCardCategory;
  count: number;
  description: string;
  icon: typeof MessageSquareText;
  onClick: () => void;
  title: string;
}) {
  const toneClassName =
    category === "messages"
      ? "border-[#dce9dd] bg-[linear-gradient(180deg,#f8fcf8,white)]"
      : category === "contacts"
        ? "border-[#d9e7d9] bg-[linear-gradient(180deg,#f9fcfa,white)]"
        : category === "favorites"
          ? "border-[#efe2bf] bg-[linear-gradient(180deg,#fffdf7,white)]"
          : category === "officialAccounts"
            ? "border-[#dfe7dd] bg-[linear-gradient(180deg,#fbfdfb,white)]"
            : category === "miniPrograms"
              ? "border-[#d8e7df] bg-[linear-gradient(180deg,#f7fbf9,white)]"
              : category === "moments"
                ? "border-[#dce8d7] bg-[linear-gradient(180deg,#f9fcf7,white)]"
                : "border-[#dce5de] bg-[linear-gradient(180deg,#f6faf8,white)]";
  const badgeClassName =
    category === "favorites"
      ? "bg-[rgba(180,132,23,0.10)] text-[#9a6b12]"
      : category === "miniPrograms"
        ? "bg-[rgba(15,118,110,0.10)] text-[#226448]"
        : category === "moments"
          ? "bg-[rgba(134,181,96,0.12)] text-[#587d38]"
          : category === "feed"
            ? "bg-[rgba(15,23,42,0.08)] text-[#3c6a53]"
            : "bg-[rgba(7,193,96,0.10)] text-[#1d6a37]";
  const iconToneClassName =
    category === "favorites"
      ? "bg-[rgba(180,132,23,0.12)] text-[#a16207]"
      : category === "miniPrograms"
        ? "bg-[rgba(15,118,110,0.12)] text-[#0f766e]"
        : category === "moments"
          ? "bg-[rgba(134,181,96,0.14)] text-[#5b7f3d]"
          : category === "feed"
            ? "bg-[rgba(15,23,42,0.08)] text-[#3c6a53]"
            : "bg-[rgba(7,193,96,0.10)] text-[#15803d]";
  const actionLabel =
    category === "messages"
      ? "进入聊天记录"
      : category === "contacts"
        ? "进入联系人结果"
        : category === "favorites"
          ? "进入收藏结果"
          : category === "officialAccounts"
            ? "进入公众号结果"
            : category === "miniPrograms"
              ? "进入小程序结果"
              : category === "moments"
                ? "进入朋友圈结果"
                : "进入内容流结果";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group overflow-hidden rounded-[20px] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.08)]",
        desktopSearchCardFocusClassName,
        toneClassName,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-[12px]",
            iconToneClassName,
          )}
        >
          <Icon size={18} />
        </div>
        <div
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-medium",
            badgeClassName,
          )}
        >
          当前覆盖 {count} 项
        </div>
      </div>

      <div className="mt-4 text-sm font-medium text-[color:var(--text-primary)]">
        {title}
      </div>

      <div className="mt-3 rounded-[16px] bg-[rgba(255,255,255,0.76)] px-4 py-4">
        <div className="text-xs leading-6 text-[color:var(--text-secondary)]">
          {description}
        </div>
      </div>

      <DesktopSearchFooterAffordance
        ctaLabel="查看该分类"
        label={actionLabel}
        tone={
          category === "favorites"
            ? "gold"
            : category === "miniPrograms"
              ? "teal"
              : category === "moments"
                ? "olive"
                : "brand"
        }
      />
    </button>
  );
}

function DesktopSearchContextBar({
  activeCategory,
  activeSection,
  categoryTitle,
  count,
  focusRegion,
  keyboardHint,
  keyword,
  onBackToAll,
  onClearKeyword,
  onScrollToTop,
  onSelectSection,
  sectionItems,
}: {
  activeCategory: SearchCategory;
  activeSection?: SearchResultCategory | null;
  categoryTitle: string;
  count: number;
  focusRegion: DesktopSearchFocusRegion;
  keyboardHint?: string;
  keyword: string;
  onBackToAll?: () => void;
  onClearKeyword: () => void;
  onScrollToTop: () => void;
  onSelectSection?: (category: SearchResultCategory) => void;
  sectionItems?: Array<{
    category: SearchResultCategory;
    count: number;
    label: string;
  }>;
}) {
  const contextDescription =
    activeCategory === "all"
      ? "当前正在查看聚合结果，继续滚动时这条上下文会一直保留。"
      : `当前结果已收窄到${categoryTitle}，需要扩展范围时可随时回到全部结果。`;
  const activeSectionTitle = activeSection
    ? searchCategoryTitles[activeSection]
    : null;
  const focusRegionLabel = desktopSearchFocusRegionLabels[focusRegion];
  const focusRegionToneClassName =
    focusRegion === "input"
      ? "bg-[rgba(7,193,96,0.10)] text-[color:var(--brand-primary)]"
      : focusRegion === "categories"
        ? "bg-[rgba(15,118,110,0.10)] text-[#226448]"
        : "bg-[rgba(59,130,246,0.10)] text-[#1d4ed8]";

  return (
    <div className="sticky top-0 z-10 mb-4 pt-1">
      <section
        data-search-context-bar=""
        className="rounded-[18px] border border-[rgba(7,193,96,0.14)] bg-[rgba(255,255,255,0.94)] p-4 shadow-[0_18px_42px_rgba(15,23,42,0.06)] backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--brand-primary)]">
                搜索上下文
              </span>
              <span className="rounded-full bg-[color:var(--surface-console)] px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
                {categoryTitle}
              </span>
              <span className="rounded-full bg-[color:var(--surface-console)] px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
                {count} 条命中
              </span>
              {activeCategory === "all" && activeSectionTitle ? (
                <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
                  当前位于 {activeSectionTitle}
                </span>
              ) : null}
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-medium",
                  focusRegionToneClassName,
                )}
              >
                当前位于 {focusRegionLabel}
              </span>
            </div>
            <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
              关键词“{keyword}”
            </div>
            <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
              {contextDescription}
            </div>
            {keyboardHint ? (
              <div className="mt-2 inline-flex items-center rounded-full bg-[rgba(7,193,96,0.08)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
                {keyboardHint}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {onBackToAll ? (
              <DesktopSearchActionButton
                onClick={onBackToAll}
                priority="secondary"
                tone="brand"
              >
                回到全部结果
              </DesktopSearchActionButton>
            ) : null}
            <DesktopSearchActionButton
              onClick={onScrollToTop}
              priority="secondary"
              tone="neutral"
            >
              回到顶部
            </DesktopSearchActionButton>
            <DesktopSearchActionButton
              onClick={onClearKeyword}
              priority="secondary"
              tone="neutral"
            >
              清空关键词
            </DesktopSearchActionButton>
          </div>
        </div>
        {sectionItems?.length ? (
          <div className="mt-4 border-t border-[rgba(15,23,42,0.06)] pt-4">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
              结果分区
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sectionItems.map((item) => (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => onSelectSection?.(item.category)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs transition",
                    desktopSearchChipFocusClassName,
                    activeSection === item.category
                      ? "border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]"
                      : "border-[rgba(15,23,42,0.06)] bg-white text-[color:var(--text-secondary)] hover:bg-[rgba(7,193,96,0.04)] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <span>{item.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px]",
                      activeSection === item.category
                        ? "bg-white text-[color:var(--brand-primary)]"
                        : "bg-[color:var(--surface-console)] text-[color:var(--text-muted)]",
                    )}
                  >
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DesktopSearchDrilldownBanner({
  category,
  count,
  keyword,
  onBack,
}: {
  category: SearchResultCategory;
  count: number;
  keyword: string;
  onBack: () => void;
}) {
  return (
    <section className="rounded-[18px] border border-[#dce9dd] bg-[linear-gradient(135deg,rgba(7,193,96,0.10),rgba(7,193,96,0.04)_40%,white)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-dim)]">
            <span className="rounded-full bg-white px-2.5 py-1">全部结果</span>
            <ChevronRight size={12} />
            <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[color:var(--brand-primary)]">
              {searchCategoryTitles[category]}
            </span>
          </div>
          <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
            已展开 {searchCategoryTitles[category]} 全部结果
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
            当前仍保留关键词“{keyword}”，共 {count} 条命中；返回时会回到聚合页里的对应分区。
          </div>
        </div>
        <DesktopSearchActionButton
          onClick={onBack}
          priority="secondary"
          tone="brand"
        >
          回到全部结果
        </DesktopSearchActionButton>
      </div>
    </section>
  );
}

function DesktopSearchResultsPanel({
  action,
  children,
  countLabel,
  description,
  highlighted = false,
  panelRef,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  countLabel: string;
  description: string;
  highlighted?: boolean;
  panelRef?: (node: HTMLElement | null) => void;
  title: string;
}) {
  return (
    <section
      ref={panelRef}
      className={cn(
        "scroll-mt-36 rounded-[20px] border bg-[color:var(--surface-console)] p-4 transition-[border-color,box-shadow,transform]",
        highlighted
          ? "border-[rgba(7,193,96,0.24)] shadow-[0_20px_44px_rgba(7,193,96,0.10)]"
          : "border-[color:var(--border-faint)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {description}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {highlighted ? (
            <div className="rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
              刚刚定位
            </div>
          ) : null}
          <div className="rounded-full bg-white px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
            {countLabel}
          </div>
          {action}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DesktopSearchResultStack({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="space-y-2">{children}</div>;
}

function DesktopSearchMessageResults({
  conversationResults,
  keyword,
  messageGroups,
  onOpen,
  onSelect,
  registerResultRef,
  selectedResultId,
}: {
  conversationResults: SearchResultItem[];
  keyword: string;
  messageGroups: SearchMessageGroup[];
  onOpen: (item: SearchResultItem) => void;
  onSelect: (resultId: string) => void;
  registerResultRef: (resultId: string, node: HTMLButtonElement | null) => void;
  selectedResultId: string | null;
}) {
  if (!messageGroups.length && !conversationResults.length) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      {messageGroups.map((group) => (
        <DesktopSearchMessageGroupCard
          key={group.id}
          group={group}
          keyword={keyword}
          onOpen={onOpen}
          onSelect={onSelect}
          registerResultRef={registerResultRef}
          selectedResultId={selectedResultId}
        />
      ))}

      {conversationResults.length ? (
        <DesktopSearchSubsectionPanel title="会话命中">
          <div className="space-y-2">
            {conversationResults.map((item) => (
              <DesktopSearchResultRow
                key={item.id}
                buttonRef={(node) => {
                  registerResultRef(item.id, node);
                }}
                item={item}
                keyword={keyword}
                onOpen={onOpen}
                onSelect={onSelect}
                selected={selectedResultId === item.id}
              />
            ))}
          </div>
        </DesktopSearchSubsectionPanel>
      ) : null}
    </div>
  );
}

function DesktopSearchOfficialAccountResults({
  accountResults,
  keyword,
  officialAccountGroups,
  onOpen,
  onSelect,
  registerResultRef,
  selectedResultId,
}: {
  accountResults: SearchResultItem[];
  keyword: string;
  officialAccountGroups: SearchOfficialAccountGroup[];
  onOpen: (item: SearchResultItem) => void;
  onSelect: (resultId: string) => void;
  registerResultRef: (resultId: string, node: HTMLButtonElement | null) => void;
  selectedResultId: string | null;
}) {
  if (!officialAccountGroups.length && !accountResults.length) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      {officialAccountGroups.map((group) => (
        <DesktopSearchOfficialAccountGroupCard
          key={group.id}
          group={group}
          keyword={keyword}
          onOpen={onOpen}
          onSelect={onSelect}
          registerResultRef={registerResultRef}
          selectedResultId={selectedResultId}
        />
      ))}

      {accountResults.length ? (
        <DesktopSearchSubsectionPanel title="账号命中">
          <div className="space-y-2">
            {accountResults.map((item) => (
              <DesktopSearchResultRow
                key={item.id}
                buttonRef={(node) => {
                  registerResultRef(item.id, node);
                }}
                item={item}
                keyword={keyword}
                onOpen={onOpen}
                onSelect={onSelect}
                selected={selectedResultId === item.id}
              />
            ))}
          </div>
        </DesktopSearchSubsectionPanel>
      ) : null}
    </div>
  );
}

function DesktopSearchSubsectionPanel({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-[18px] border border-[#dfe7dd] bg-[linear-gradient(180deg,#fbfdfb,white)] px-4 py-4">
      <div className="text-xs font-medium text-[color:var(--text-muted)]">
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DesktopSearchFeatureResults({
  category,
  items,
  keyword,
  onOpen,
  onSelect,
  registerResultRef,
  selectedResultId,
}: {
  category: "contacts" | "favorites" | "miniPrograms";
  items: SearchResultItem[];
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
  onSelect: (resultId: string) => void;
  registerResultRef: (resultId: string, node: HTMLButtonElement | null) => void;
  selectedResultId: string | null;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-4 gap-4",
        category === "favorites"
          ? "space-y-3"
          : "grid xl:grid-cols-2",
      )}
    >
      {items.map((item) => (
        <DesktopSearchFeatureCard
          key={item.id}
          buttonRef={(node) => {
            registerResultRef(item.id, node);
          }}
          category={category}
          item={item}
          keyword={keyword}
          onOpen={onOpen}
          onSelect={onSelect}
          selected={selectedResultId === item.id}
        />
      ))}
    </div>
  );
}

function DesktopSearchContentResults({
  items,
  keyword,
  onOpen,
  onSelect,
  registerResultRef,
  selectedResultId,
}: {
  items: SearchResultItem[];
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
  onSelect: (resultId: string) => void;
  registerResultRef: (resultId: string, node: HTMLButtonElement | null) => void;
  selectedResultId: string | null;
}) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <DesktopSearchContentCard
          key={item.id}
          buttonRef={(node) => {
            registerResultRef(item.id, node);
          }}
          item={item}
          keyword={keyword}
          onOpen={onOpen}
          onSelect={onSelect}
          selected={selectedResultId === item.id}
        />
      ))}
    </div>
  );
}

function DesktopSearchFeatureCard({
  buttonRef,
  category,
  item,
  keyword,
  onOpen,
  onSelect,
  selected,
}: {
  buttonRef?: (node: HTMLButtonElement | null) => void;
  category: "contacts" | "favorites" | "miniPrograms";
  item: SearchResultItem;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
  onSelect: (resultId: string) => void;
  selected: boolean;
}) {
  const toneClassName =
    category === "contacts"
      ? "border-[#d9e7d9] bg-[linear-gradient(180deg,#f9fcfa,white)]"
      : category === "favorites"
        ? "border-[#efe2bf] bg-[linear-gradient(180deg,#fffdf7,white)]"
        : "border-[#d8e7df] bg-[linear-gradient(180deg,#f7fbf9,white)]";
  const badgeClassName =
    category === "contacts"
      ? "bg-[rgba(7,193,96,0.10)] text-[#1d6a37]"
      : category === "favorites"
        ? "bg-[rgba(180,132,23,0.10)] text-[#9a6b12]"
        : "bg-[rgba(15,118,110,0.10)] text-[#226448]";
  const actionLabel =
    category === "contacts"
      ? "查看资料与聊天入口"
      : category === "favorites"
        ? "打开收藏内容"
        : "打开小程序";

  return (
    <button
      ref={buttonRef}
      aria-selected={selected}
      data-search-result-id={item.id}
      type="button"
      onClick={() => onOpen(item)}
      onFocus={() => onSelect(item.id)}
      onMouseEnter={() => onSelect(item.id)}
      className={cn(
        "group overflow-hidden rounded-[20px] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.08)]",
        desktopSearchCardFocusClassName,
        selected ? desktopSearchSelectedCardClassName : null,
        toneClassName,
      )}
    >
      <div className="flex items-start gap-3">
        <AvatarChip
          name={item.avatarName ?? item.title}
          src={item.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(item.title, keyword)}
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                badgeClassName,
              )}
            >
              {item.badge}
            </span>
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {renderHighlightedText(item.meta, keyword)}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "mt-4 rounded-[16px] px-4 py-4",
          category === "favorites"
            ? "bg-[rgba(255,247,230,0.72)]"
            : "bg-[color:var(--surface-console)]",
        )}
      >
        <div
          className={cn(
            "text-[color:var(--text-secondary)]",
            category === "favorites"
              ? "line-clamp-3 text-sm leading-6"
              : "line-clamp-3 text-sm leading-7",
          )}
        >
          {renderHighlightedText(item.description, keyword)}
        </div>
      </div>

      <DesktopSearchFooterAffordance
        ctaLabel={
          category === "contacts"
            ? "进入资料"
            : category === "favorites"
              ? "立即打开"
              : "打开小程序"
        }
        label={actionLabel}
        tone={
          category === "favorites"
            ? "gold"
            : category === "miniPrograms"
              ? "teal"
              : "brand"
        }
      />
    </button>
  );
}

function DesktopQuickLinkRow({
  item,
  onOpen,
}: {
  item: DesktopSearchQuickLink;
  onOpen: (item: DesktopSearchQuickLink) => void;
}) {
  const openLabel = getDesktopQuickLinkActionLabel(item);
  const openTone = getDesktopQuickLinkActionTone(item);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-[14px] bg-white px-3 py-3 text-left transition hover:bg-[rgba(7,193,96,0.04)]",
        desktopSearchRowFocusClassName,
      )}
    >
      <AvatarChip
        name={item.avatarName ?? item.title}
        src={item.avatarSrc}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {item.title}
          </div>
          <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
            {item.badge}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
          {item.meta}
        </div>
        <div className="mt-1 truncate text-xs text-[color:var(--text-secondary)]">
          {item.description}
        </div>
      </div>
      <DesktopSearchOpenCue compact label={openLabel} tone={openTone} />
    </button>
  );
}

function DesktopSearchHistoryRow({
  keyword,
  onApply,
  onRemove,
}: {
  keyword: string;
  onApply: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[14px] bg-white px-3 py-3">
      <button
        type="button"
        onClick={onApply}
        className={cn(
          "group inline-flex min-w-0 flex-1 items-center gap-3 text-left",
          desktopSearchFocusRingClassName,
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[color:var(--surface-console)] text-[color:var(--text-dim)]">
          <Clock3 size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {keyword}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
            重新执行这条搜索，继续查看完整结果。
          </div>
        </div>
        <DesktopSearchOpenCue compact label="重新搜索" tone="brand" />
      </button>
      <DesktopSearchActionButton
        onClick={onRemove}
        className="shrink-0"
        tone="danger"
      >
        移除
      </DesktopSearchActionButton>
    </div>
  );
}

function getDesktopQuickLinkActionLabel(item: DesktopSearchQuickLink) {
  if (item.id.startsWith("favorite-")) {
    return "打开收藏";
  }

  if (item.id.startsWith("mini-program-")) {
    return "打开小程序";
  }

  return "立即打开";
}

function getDesktopQuickLinkActionTone(
  item: DesktopSearchQuickLink,
): "brand" | "gold" | "olive" | "teal" {
  if (item.id.startsWith("favorite-")) {
    return "gold";
  }

  if (item.id.startsWith("mini-program-")) {
    return "teal";
  }

  return "brand";
}

function DesktopSearchMessageGroupCard({
  group,
  keyword,
  onOpen,
  onSelect,
  registerResultRef,
  selectedResultId,
}: {
  group: SearchMessageGroup;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
  onSelect: (resultId: string) => void;
  registerResultRef: (resultId: string, node: HTMLButtonElement | null) => void;
  selectedResultId: string | null;
}) {
  const isHeaderSelected = selectedResultId === group.header.id;
  const hasSelectedMessage = group.messages.some(
    (item) => item.id === selectedResultId,
  );

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[20px] border border-[#dde8dc] bg-[linear-gradient(180deg,#fbfdfb,white)] shadow-[0_10px_24px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow]",
        isHeaderSelected || hasSelectedMessage
          ? desktopSearchSelectedCardClassName
          : null,
      )}
    >
      <button
        ref={(node) => {
          registerResultRef(group.header.id, node);
        }}
        aria-selected={isHeaderSelected}
        data-search-result-id={group.header.id}
        type="button"
        onClick={() => onOpen(group.header)}
        onFocus={() => onSelect(group.header.id)}
        onMouseEnter={() => onSelect(group.header.id)}
        className={cn(
          "group flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white",
          desktopSearchRowFocusClassName,
          isHeaderSelected ? "bg-[rgba(7,193,96,0.05)]" : null,
        )}
      >
        <AvatarChip
          name={group.header.avatarName ?? group.header.title}
          src={group.header.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(group.header.title, keyword)}
            </div>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
              {group.header.badge}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
            {renderHighlightedText(group.header.meta, keyword)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
            {group.totalHits} 条相关记录
          </div>
          <DesktopSearchOpenCue compact label="进入会话" tone="brand" />
        </div>
      </button>

      <div className="border-t border-[rgba(15,23,42,0.06)] bg-[rgba(248,251,249,0.84)] px-4 py-3">
        <div className="space-y-2">
          {group.messages.map((item) => (
            <button
              key={item.id}
              ref={(node) => {
                registerResultRef(item.id, node);
              }}
              aria-selected={selectedResultId === item.id}
              data-search-result-id={item.id}
              type="button"
              onClick={() => onOpen(item)}
              onFocus={() => onSelect(item.id)}
              onMouseEnter={() => onSelect(item.id)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-[14px] border border-[rgba(15,23,42,0.04)] bg-white px-3 py-3 text-left transition hover:bg-[rgba(7,193,96,0.04)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.04)]",
                desktopSearchRowFocusClassName,
                selectedResultId === item.id ? desktopSearchSelectedRowClassName : null,
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.10)] text-[#15803d]">
                <MessageSquareText size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {renderHighlightedText(item.description, keyword)}
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {renderHighlightedText(item.meta, keyword)}
                </div>
              </div>
              <DesktopSearchOpenCue compact label="直达消息" tone="brand" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DesktopSearchOfficialAccountGroupCard({
  group,
  keyword,
  onOpen,
  onSelect,
  registerResultRef,
  selectedResultId,
}: {
  group: SearchOfficialAccountGroup;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
  onSelect: (resultId: string) => void;
  registerResultRef: (resultId: string, node: HTMLButtonElement | null) => void;
  selectedResultId: string | null;
}) {
  const isHeaderSelected = selectedResultId === group.header.id;
  const hasSelectedArticle = group.articles.some(
    (item) => item.id === selectedResultId,
  );

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[20px] border border-[#dde8dc] bg-[linear-gradient(180deg,#fbfdfb,white)] shadow-[0_10px_24px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow]",
        isHeaderSelected || hasSelectedArticle
          ? desktopSearchSelectedCardClassName
          : null,
      )}
    >
      <button
        ref={(node) => {
          registerResultRef(group.header.id, node);
        }}
        aria-selected={isHeaderSelected}
        data-search-result-id={group.header.id}
        type="button"
        onClick={() => onOpen(group.header)}
        onFocus={() => onSelect(group.header.id)}
        onMouseEnter={() => onSelect(group.header.id)}
        className={cn(
          "group flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white",
          desktopSearchRowFocusClassName,
          isHeaderSelected ? "bg-[rgba(7,193,96,0.05)]" : null,
        )}
      >
        <AvatarChip
          name={group.header.avatarName ?? group.header.title}
          src={group.header.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(group.header.title, keyword)}
            </div>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
              {group.header.badge}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
            {renderHighlightedText(group.header.meta, keyword)}
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
            {renderHighlightedText(group.header.description, keyword)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
            {group.totalHits} 篇相关文章
          </div>
          <DesktopSearchOpenCue compact label="进入账号" tone="brand" />
        </div>
      </button>

      <div className="border-t border-[rgba(15,23,42,0.06)] bg-[rgba(248,251,249,0.84)] px-4 py-3">
        <div className="space-y-2">
          {group.articles.map((item) => (
            <button
              key={item.id}
              ref={(node) => {
                registerResultRef(item.id, node);
              }}
              aria-selected={selectedResultId === item.id}
              data-search-result-id={item.id}
              type="button"
              onClick={() => onOpen(item)}
              onFocus={() => onSelect(item.id)}
              onMouseEnter={() => onSelect(item.id)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-[14px] border border-[rgba(15,23,42,0.04)] bg-white px-3 py-3 text-left transition hover:bg-[rgba(7,193,96,0.04)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.04)]",
                desktopSearchRowFocusClassName,
                selectedResultId === item.id ? desktopSearchSelectedRowClassName : null,
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.10)] text-[#15803d]">
                <Newspaper size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                  {renderHighlightedText(item.title, keyword)}
                </div>
                <div className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {renderHighlightedText(item.description, keyword)}
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {renderHighlightedText(item.meta, keyword)}
                </div>
              </div>
              <DesktopSearchOpenCue compact label="读文章" tone="brand" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DesktopSearchContentCard({
  buttonRef,
  item,
  keyword,
  onOpen,
  onSelect,
  selected,
}: {
  buttonRef?: (node: HTMLButtonElement | null) => void;
  item: SearchResultItem;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
  onSelect: (resultId: string) => void;
  selected: boolean;
}) {
  const toneClassName =
    item.category === "moments"
      ? "border-[#dce8d7] bg-[linear-gradient(180deg,#f9fcf7,white)]"
      : "border-[#dce5de] bg-[linear-gradient(180deg,#f6faf8,white)]";
  const badgeClassName =
    item.category === "moments"
      ? "bg-[rgba(134,181,96,0.12)] text-[#587d38]"
      : "bg-[rgba(15,23,42,0.08)] text-[#3c6a53]";
  const actionLabel =
    item.category === "moments" ? "打开朋友圈动态" : "打开广场动态";

  return (
    <button
      ref={buttonRef}
      aria-selected={selected}
      data-search-result-id={item.id}
      type="button"
      onClick={() => onOpen(item)}
      onFocus={() => onSelect(item.id)}
      onMouseEnter={() => onSelect(item.id)}
      className={cn(
        "group overflow-hidden rounded-[20px] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(15,23,42,0.08)]",
        desktopSearchCardFocusClassName,
        selected ? desktopSearchSelectedCardClassName : null,
        toneClassName,
      )}
    >
      <div className="flex items-center gap-3">
        <AvatarChip
          name={item.avatarName ?? item.title}
          src={item.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(item.title, keyword)}
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                badgeClassName,
              )}
            >
              {item.badge}
            </span>
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {renderHighlightedText(item.meta, keyword)}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[16px] bg-[color:var(--surface-console)] px-4 py-4">
        <div className="line-clamp-5 text-sm leading-7 text-[color:var(--text-secondary)]">
          {renderHighlightedText(item.description, keyword)}
        </div>
      </div>

      <DesktopSearchFooterAffordance
        ctaLabel="查看原内容"
        label={actionLabel}
        tone={item.category === "moments" ? "olive" : "brand"}
      />
    </button>
  );
}

function isDesktopContentCategory(
  category: SearchCategory | SearchResultCategory,
) {
  return category === "moments" || category === "feed";
}

function isDesktopFeatureCardCategory(
  category: SearchCategory | SearchResultCategory,
): category is "contacts" | "favorites" | "miniPrograms" {
  return (
    category === "contacts" ||
    category === "favorites" ||
    category === "miniPrograms"
  );
}

function DesktopSearchResultRow({
  buttonRef,
  item,
  keyword,
  onOpen,
  onSelect,
  selected,
}: {
  buttonRef?: (node: HTMLButtonElement | null) => void;
  item: SearchResultItem;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
  onSelect: (resultId: string) => void;
  selected: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      aria-selected={selected}
      data-search-result-id={item.id}
      type="button"
      onClick={() => onOpen(item)}
      onFocus={() => onSelect(item.id)}
      onMouseEnter={() => onSelect(item.id)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-[16px] border border-[rgba(15,23,42,0.04)] bg-white px-3.5 py-3 text-left transition hover:bg-[rgba(7,193,96,0.04)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.04)]",
        desktopSearchRowFocusClassName,
        selected ? desktopSearchSelectedRowClassName : null,
      )}
    >
      <AvatarChip
        name={item.avatarName ?? item.title}
        src={item.avatarSrc}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {renderHighlightedText(item.title, keyword)}
          </div>
          <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
            {item.badge}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
          {renderHighlightedText(item.meta, keyword)}
        </div>
        <div className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
          {renderHighlightedText(item.description, keyword)}
        </div>
      </div>
      <DesktopSearchOpenCue compact label="打开结果" tone="brand" />
    </button>
  );
}

function getDesktopSearchSectionDescription(
  category: SearchCategory | SearchResultCategory,
) {
  if (category === "messages") {
    return "优先展示会话分组和命中的消息片段。";
  }

  if (category === "officialAccounts") {
    return "先看账号分组，再看文章和账号命中。";
  }

  if (category === "contacts") {
    return "按资料卡查看联系人和角色入口。";
  }

  if (category === "favorites") {
    return "聚合消息、笔记和内容收藏结果。";
  }

  if (category === "miniPrograms") {
    return "优先展示可直接打开的小程序入口。";
  }

  if (category === "moments") {
    return "按内容卡查看朋友圈动态和评论命中。";
  }

  if (category === "feed") {
    return "按内容卡查看广场动态结果。";
  }

  return "按当前分类集中查看最相关的结果。";
}

function getDesktopSearchScopeCount(
  scopeCounts: SearchScopeCounts,
  category: DesktopSearchScopeCardCategory,
) {
  if (category === "messages") {
    return scopeCounts.conversations;
  }

  if (category === "contacts") {
    return scopeCounts.contacts;
  }

  if (category === "favorites") {
    return scopeCounts.favorites;
  }

  if (category === "officialAccounts") {
    return scopeCounts.officialAccounts;
  }

  if (category === "miniPrograms") {
    return scopeCounts.miniPrograms;
  }

  if (category === "moments") {
    return scopeCounts.moments;
  }

  return scopeCounts.feed;
}
