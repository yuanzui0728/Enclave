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
import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useRuntimeTranslator } from "@yinjie/i18n";
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
  X,
} from "lucide-react";
import { AvatarChip } from "../../components/avatar-chip";
import { cn } from "@yinjie/ui";
import { type SearchQuickLink as DesktopSearchQuickLink } from "./search-quick-links";
import { renderHighlightedText } from "./search-utils";
import {
  searchCategoryLabelDescriptors,
  searchCategoryTitleDescriptors,
  useSearchCategoryTitle,
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
  committedSearchText: string;
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
  onRetryLoad: () => void;
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

const landingScopeCards: Array<{
  id:
    | "messages"
    | "contacts"
    | "favorites"
    | "officialAccounts"
    | "miniPrograms"
    | "moments"
    | "feed";
  icon: typeof MessageSquareText;
  title: MessageDescriptor;
  description: MessageDescriptor;
}> = [
  {
    id: "messages",
    icon: MessageSquareText,
    title: msg`聊天记录`,
    description: msg`优先定位会话和消息片段。`,
  },
  {
    id: "contacts",
    icon: UsersRound,
    title: msg`联系人`,
    description: msg`支持备注名、角色名和标签。`,
  },
  {
    id: "favorites",
    icon: Bookmark,
    title: msg`收藏`,
    description: msg`聚合消息、笔记和内容收藏。`,
  },
  {
    id: "officialAccounts",
    icon: Newspaper,
    title: msg`公众号`,
    description: msg`支持账号资料和文章命中。`,
  },
  {
    id: "miniPrograms",
    icon: Blocks,
    title: msg`小程序`,
    description: msg`覆盖最近使用和目录里的入口。`,
  },
  {
    id: "moments",
    icon: Star,
    title: msg`朋友圈`,
    description: msg`支持好友动态和评论命中。`,
  },
  {
    id: "feed",
    icon: Blocks,
    title: msg`内容流`,
    description: msg`继续承接广场动态结果。`,
  },
];

type DesktopSearchScopeCardCategory = (typeof landingScopeCards)[number]["id"];

export function DesktopSearchWorkspace({
  activeCategory,
  committedSearchText,
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
  onRetryLoad,
  recentFavorites,
  recentMiniPrograms,
  scopeCounts,
  searchText,
  searchingMessages,
  setActiveCategory,
  setSearchText,
  visibleResults,
}: DesktopSearchWorkspaceProps) {
  const t = useRuntimeTranslator();
  const getCategoryTitle = useSearchCategoryTitle();
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
  const trimmedInputKeyword = searchText.trim();
  const trimmedCommittedKeyword = committedSearchText.trim();
  const normalizedInputKeyword = trimmedInputKeyword.toLowerCase();
  const normalizedCommittedKeyword = trimmedCommittedKeyword.toLowerCase();
  const normalizedKeyword = normalizedCommittedKeyword;
  const searchPending = normalizedInputKeyword !== normalizedCommittedKeyword;
  // 桌面端把 miniPrograms / officialAccounts 这两个分区藏起来（landing scope
  // cards / 分类 chip / 全部视图分区都过滤）；这里把过滤后的 grouped / visible
  // 作为单一来源，否则 sticky context bar 的分区 chip、"全部"chip 计数、键盘
  // 导航、auto-select 都会引到不渲染的隐藏分区，体感是「点了没反应 / 计数对不
  // 上 / 焦点静默消失」。
  const desktopGroupedResults = useMemo(
    () =>
      groupedResults.filter((section) => !isDesktopHiddenCategory(section.category)),
    [groupedResults],
  );
  const desktopVisibleResults = useMemo(
    () =>
      activeCategory === "all"
        ? visibleResults.filter((item) => !isDesktopHiddenCategory(item.category))
        : visibleResults,
    [activeCategory, visibleResults],
  );
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
      desktopGroupedResults.map((section) => {
        const previewContentResults = isDesktopContentCategory(section.category)
          ? section.results.slice(0, 4)
          : [];
        const previewFeatureResults = isDesktopFeatureCardCategory(section.category)
          ? section.results.slice(0, section.category === "favorites" ? 3 : 4)
          : [];
        // 全部结果聚合视图里只露 3 个会话组、每组最多 3 条消息——drilldown
        // 视图（查看全部）才把每组完整命中（最多 8 条）展开。所以这里要二次
        // 切 messages，不能直接复用 hook 返回的 group。
        const previewMessageGroups =
          section.category === "messages"
            ? messageGroups.slice(0, 3).map((group) => ({
                ...group,
                messages: group.messages.slice(0, 3),
              }))
            : [];
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
      desktopGroupedResults,
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
        activeAllResultsSection ?? desktopGroupedResults[0]?.category ?? null;
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
    desktopGroupedResults,
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
    if (!viewport || !desktopGroupedResults.length) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const anchorTop = viewportRect.top + 220;
    let nextCategory = desktopGroupedResults[0]?.category ?? null;

    for (const section of desktopGroupedResults) {
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
    category === "all" ? t(msg`全部结果`) : getCategoryTitle(category);
  const resolveSpotlightPanelId = (
    category: SearchCategory,
  ): SearchCategory | null => {
    if (!hasKeyword) {
      return null;
    }

    if (category === "all") {
      return desktopGroupedResults[0]?.category ?? null;
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
      showTransitionHint(t(msg`已定位到${getCategoryTitle(category)}分区。`));
    },
  );
  const handleExpandAllResultsSection = useEffectEvent(
    (category: SearchResultCategory) => {
      setActiveCategory(category);
      scrollResultsToTop("smooth");
      focusSearchInput(Boolean(trimmedInputKeyword));
      showPanelSpotlight(category);
      showTransitionHint(t(msg`已展开${getCategoryTitle(category)}全部结果。`));
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
            ? t(msg`已切换到${resolveCategoryHintTitle(category)}，结果已回到顶部。`)
            : t(msg`已切换到${resolveCategoryHintTitle(category)}，继续输入关键词开始搜索。`),
        );
      }
      if (options?.focusInput) {
        focusSearchInput(Boolean(trimmedInputKeyword));
      }
    },
  );
  const handleApplyHistory = useEffectEvent((keyword: string) => {
    onApplyHistory(keyword);
    scrollResultsToTop("smooth");
    focusSearchInput(true);
    showTransitionHint(t(msg`已应用历史关键词“${keyword}”，结果已回到顶部。`));
  });
  const handleClearKeyword = useEffectEvent(() => {
    onClearKeyword();
    scrollResultsToTop("smooth");
    focusSearchInput(false);
    showTransitionHint(t(msg`已清空关键词，回到搜索首页。`));
  });

  const keywordLabel = trimmedCommittedKeyword;
  const contextCategoryTitle =
    activeCategory === "all" ? t(msg`全部结果`) : getCategoryTitle(activeCategory);
  const handleScrollToTopContext = useEffectEvent(() => {
    scrollResultsToTop("smooth");
    focusSearchInput(Boolean(trimmedInputKeyword));
    showPanelSpotlight(resolveSpotlightPanelId(activeCategory));
    showTransitionHint(t(msg`已回到顶部，可继续调整关键词或切换分类。`));
  });
  const handleBackToAllResults = useEffectEvent(
    (category: SearchResultCategory) => {
      pendingAllResultsJumpRef.current = category;
      setActiveAllResultsSection(category);
      setActiveCategory("all");
      focusSearchInput(Boolean(trimmedInputKeyword));
      showTransitionHint(t(msg`已回到全部结果，并定位到${getCategoryTitle(category)}分区。`));
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
      // 仅在桌面端可见的 chip 集合里循环移动，否则 arrow→ 会把焦点送到
      // miniPrograms/officialAccounts 这种没渲染的 chip，下一帧失焦消失，
      // 但 activeCategory 已经被切到隐藏分类、workspace 切到 drilldown
      // 视图，体感是「箭头键随机跳页」。
      const navigableChips = searchCategoryLabelDescriptors.filter(
        (item) => !isDesktopHiddenCategory(item.id),
      );
      const index = navigableChips.findIndex((item) => item.id === category);
      if (index === -1) {
        return;
      }

      const nextIndex = Math.min(
        Math.max(index + direction, 0),
        navigableChips.length - 1,
      );
      const nextCategory = navigableChips[nextIndex]?.id;
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
        ? t(msg`已回到搜索框，再按 Esc 可取消预选结果。`)
        : trimmedInputKeyword
          ? t(msg`已回到搜索框，再按 Esc 可清空关键词。`)
          : t(msg`已回到搜索框，可继续输入或切换分类。`),
    );
  });
  const handleClearSelectedResult = useEffectEvent(() => {
    autoSelectResultRef.current = false;
    setSelectedResultId(null);
    showTransitionHint(
      trimmedInputKeyword
        ? t(msg`已取消结果选择，再按 Esc 可清空关键词。`)
        : t(msg`已取消结果选择，可继续输入关键词。`),
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
          const navigableChips = searchCategoryLabelDescriptors.filter(
            (item) => !isDesktopHiddenCategory(item.id),
          );
          const lastCategory = navigableChips[navigableChips.length - 1]?.id;
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
        if (searchPending) {
          return;
        }

        if (!keyboardNavigableResults.length) {
          return;
        }

        event.preventDefault();
        handleMoveSelectedResult(1);
        return;
      }

      if (event.key === "ArrowUp") {
        if (searchPending) {
          return;
        }

        if (!keyboardNavigableResults.length) {
          return;
        }

        event.preventDefault();
        handleMoveSelectedResult(-1);
        return;
      }

      if (event.key === "Tab" && !event.shiftKey) {
        if (searchPending) {
          return;
        }

        const targetResultId = selectedResultId ?? preferredAutoSelectedResultId;
        if (!targetResultId) {
          return;
        }

        event.preventDefault();
        handleFocusSelectedResult();
        return;
      }

      if (event.key === "Escape" && !selectedResultId && trimmedInputKeyword) {
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

    setActiveAllResultsSection(desktopGroupedResults[0]?.category ?? null);
  }, [
    activeCategory,
    desktopGroupedResults,
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
  }, [activeCategory, desktopGroupedResults, hasKeyword, syncActiveAllResultsSection]);

  useEffect(() => {
    autoSelectResultRef.current = hasKeyword;
    setSelectedResultId(null);
  }, [activeCategory, committedSearchText, hasKeyword]);

  useEffect(() => {
    if (!searchPending) {
      return;
    }

    autoSelectResultRef.current = false;
    setSelectedResultId(null);
  }, [searchPending]);

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
      <header
        className={cn(
          "shrink-0 bg-[rgba(255,255,255,0.94)] backdrop-blur-xl transition-[padding,border-color]",
          hasKeyword
            ? "border-b border-[color:var(--border-faint)]"
            : "border-b border-transparent",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full px-6 transition-[max-width,padding]",
            hasKeyword
              ? "max-w-[1160px] pt-3"
              : "max-w-[560px] pt-[18vh] pb-2",
          )}
        >
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              onCommitSearch(searchText);
            }}
          >
            <button
              type="submit"
              aria-label={t(msg`执行搜索`)}
              title={t(msg`执行搜索`)}
              className={cn(
                "absolute left-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-[10px] transition",
                hasKeyword ? "h-7 w-7" : "h-8 w-8",
                searchPending && trimmedInputKeyword
                  ? "bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)] hover:bg-[rgba(7,193,96,0.16)]"
                  : "text-[color:var(--text-dim)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
              )}
            >
              <Search size={hasKeyword ? 15 : 17} />
            </button>
            <input
              ref={inputRef}
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={handleSearchInputKeyDown}
              placeholder={t(msg`搜索聊天记录、联系人、收藏和朋友圈`)}
              className={cn(
                "w-full rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] pr-20 text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow,height,font-size,padding] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.4)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(7,193,96,0.08)]",
                hasKeyword ? "h-9 pl-10 text-sm" : "h-11 pl-11 text-[15px]",
              )}
            />
            {searchText ? (
              <DesktopSearchActionButton
                className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={handleClearKeyword}
                priority="secondary"
                tone="neutral"
              >
                {t(msg`清空`)}
              </DesktopSearchActionButton>
            ) : null}
          </form>
          <div
            className={cn(
              "-mx-1 mt-2 flex gap-0.5 overflow-x-auto px-1 pb-1 transition-[background-color]",
              keyboardFocusRegion === "categories"
                ? "rounded-[8px] bg-[rgba(7,193,96,0.04)]"
                : null,
              !hasKeyword ? "justify-center" : null,
            )}
          >
            {searchCategoryLabelDescriptors
              .filter((item) => !isDesktopHiddenCategory(item.id))
              .map((item) => {
              const countLabel = !hasKeyword
                ? null
                : item.id === "all"
                  ? `${desktopVisibleResults.length}`
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
                    "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[13px] transition",
                    desktopSearchChipFocusClassName,
                    activeCategory === item.id
                      ? "bg-[rgba(7,193,96,0.10)] font-medium text-[color:var(--brand-primary)]"
                      : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <span>{t(item.label)}</span>
                  {countLabel ? (
                    <span
                      className={cn(
                        "text-[11px]",
                        activeCategory === item.id
                          ? "text-[color:var(--brand-primary)]"
                          : "text-[color:var(--text-muted)]",
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
      </header>

      <div ref={scrollViewportRef} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto flex w-full min-h-full flex-col px-6 py-3 transition-[max-width]",
            hasKeyword ? "max-w-[1160px]" : "max-w-[720px]",
          )}
        >
          {loading ? (
            <DesktopSearchStatusCard
              badgeLabel={t(msg`准备中`)}
              description={t(msg`正在准备桌面搜索索引，马上就能继续查看完整结果。`)}
              status="pending"
              title={t(msg`搜索准备`)}
            />
          ) : null}
          {error ? (
            <DesktopSearchStatusCard
              action={
                <DesktopSearchActionButton
                  onClick={onRetryLoad}
                  tone="brand"
                >
                  {t(msg`重试加载`)}
                </DesktopSearchActionButton>
              }
              description={error}
              status="error"
              title={t(msg`搜索异常`)}
            />
          ) : null}
          {!loading && !error && transitionHint ? (
            <DesktopSearchStatusCard
              description={transitionHint}
              status="done"
              title={t(msg`搜索定位`)}
            />
          ) : null}

          {!loading && !error && hasKeyword && searchingMessages ? (
            <DesktopSearchStatusCard
              description={t(msg`聊天记录结果还在继续补全，稍后会自动刷新更多命中。`)}
              status="pending"
              title={t(msg`搜索进度`)}
            />
          ) : null}
          {!loading && !error && hasKeyword ? (
            <DesktopSearchContextBar
              activeCategory={activeCategory}
              categoryTitle={contextCategoryTitle}
              count={desktopVisibleResults.length}
              keyword={keywordLabel}
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
                  ? desktopGroupedResults.map((section) => ({
                      category: section.category,
                      count: section.results.length,
                      label: getCategoryTitle(section.category),
                    }))
                  : undefined
              }
              activeSection={activeAllResultsSection}
            />
          ) : null}

          {!loading && !error && !hasKeyword ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {landingScopeCards
                  .filter((item) => !isDesktopHiddenCategory(item.id))
                  .map((item) => {
                    const Icon = item.icon;
                    const count = getDesktopSearchScopeCount(
                      scopeCounts,
                      item.id,
                    );
                    return (
                      <DesktopSearchScopeCard
                        key={item.id}
                        category={item.id}
                        count={count}
                        icon={Icon}
                        onClick={() =>
                          handleSelectCategory(item.id, { focusInput: true })
                        }
                        title={t(item.title)}
                      />
                    );
                  })}
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <DesktopSearchLandingPanel
                  action={
                    history.length ? (
                      <DesktopSearchActionButton
                        onClick={onClearHistory}
                        tone="neutral"
                      >
                        {t(msg`清空`)}
                      </DesktopSearchActionButton>
                    ) : null
                  }
                  countLabel={history.length ? `${history.length}` : undefined}
                  title={t(msg`最近搜索`)}
                >
                  {history.length ? (
                    <div className="space-y-0.5">
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
                    <div className="px-2 py-1.5 text-xs text-[color:var(--text-muted)]">
                      {t(msg`暂无记录`)}
                    </div>
                  )}
                </DesktopSearchLandingPanel>

                <DesktopQuickLinksPanel
                  title={t(msg`最近收藏`)}
                  emptyText={t(msg`暂无最近收藏`)}
                  items={recentFavorites}
                  onOpen={onOpenQuickLink}
                />
              </div>
            </div>
          ) : null}

          {!loading && !error && hasKeyword && !desktopVisibleResults.length ? (
            <DesktopSearchStatusCard
              action={
                <DesktopSearchActionButton
                  onClick={handleClearKeyword}
                  tone="neutral"
                >
                  {t(msg`清空关键词`)}
                </DesktopSearchActionButton>
              }
              description={t(msg`没有找到匹配内容，换个关键词试试，或者切到更具体的分类后继续找。`)}
              status="empty"
              title={t(msg`搜索结果`)}
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
                              {t(msg`查看全部`)}
                            </DesktopSearchActionButton>
                          ) : null
                        }
                        countLabel={t(msg`${section.results.length} 条命中`)}
                        description={t(getDesktopSearchSectionDescription(
                          section.category,
                        ))}
                        highlighted={spotlightPanelId === section.category}
                        panelRef={(node) => {
                          allResultSectionRefs.current[section.category] = node;
                        }}
                        title={getCategoryTitle(section.category)}
                      >
                        {section.category === "messages" ? (
                          <DesktopSearchMessageResults
                            conversationResults={
                              entry.previewMessageConversations
                            }
                            keyword={normalizedKeyword}
                            messageGroups={entry.previewMessageGroups}
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
                  countLabel={t(msg`${visibleResults.length} 条命中`)}
                  description={t(msg`从全部结果展开，继续查看${getCategoryTitle(activeCategory)}的完整命中。`)}
                  highlighted={spotlightPanelId === activeCategory}
                  title={t(msg`${getCategoryTitle(activeCategory)}全部结果`)}
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
  emptyText,
  items,
  onOpen,
  title,
}: {
  emptyText: string;
  items: DesktopSearchQuickLink[];
  onOpen: (item: DesktopSearchQuickLink) => void;
  title: string;
}) {
  return (
    <DesktopSearchLandingPanel
      countLabel={items.length ? `${items.length}` : undefined}
      title={title}
    >
      {items.length ? (
        <div className="space-y-0.5">
          {items.map((item) => (
            <DesktopQuickLinkRow key={item.id} item={item} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="px-2 py-1.5 text-xs text-[color:var(--text-muted)]">
          {emptyText}
        </div>
      )}
    </DesktopSearchLandingPanel>
  );
}

function DesktopSearchLandingPanel({
  action,
  children,
  countLabel,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  countLabel?: string;
  title: string;
}) {
  return (
    <section className="rounded-[14px] border border-[color:var(--border-faint)] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          {countLabel ? (
            <div className="text-[11px] text-[color:var(--text-muted)]">
              {countLabel}
            </div>
          ) : null}
        </div>
        {action}
      </div>
      {children}
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
  const t = useRuntimeTranslator();
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
      ? t(msg`异常`)
      : status === "pending"
        ? t(msg`补全中`)
        : status === "empty"
          ? t(msg`无结果`)
          : t(msg`已完成`);

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
  icon: Icon,
  onClick,
  title,
}: {
  category: DesktopSearchScopeCardCategory;
  count: number;
  description?: string;
  icon: typeof MessageSquareText;
  onClick: () => void;
  title: string;
}) {
  const t = useRuntimeTranslator();
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

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-[12px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-left transition hover:border-[rgba(7,193,96,0.20)] hover:bg-[rgba(7,193,96,0.04)]",
        desktopSearchCardFocusClassName,
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
          iconToneClassName,
        )}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          {t(msg`${count} 项`)}
        </div>
      </div>
    </button>
  );
}

function DesktopSearchContextBar({
  activeCategory,
  activeSection,
  categoryTitle,
  count,
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
  const t = useRuntimeTranslator();
  const getCategoryTitle = useSearchCategoryTitle();
  const activeSectionTitle = activeSection
    ? getCategoryTitle(activeSection)
    : null;

  return (
    <div className="sticky top-0 z-10 mb-2">
      <section
        data-search-context-bar=""
        className="rounded-[10px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.94)] px-3 py-1.5 shadow-[0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur"
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-[color:var(--text-secondary)]">
            <span className="truncate">
              <span className="font-medium text-[color:var(--text-primary)]">
                {categoryTitle}
              </span>
              <span className="mx-1.5 text-[color:var(--text-dim)]">·</span>
              <span>{t(msg`${count} 条命中`)}</span>
              {activeCategory === "all" && activeSectionTitle ? (
                <>
                  <span className="mx-1.5 text-[color:var(--text-dim)]">·</span>
                  <span>{t(msg`位于 ${activeSectionTitle}`)}</span>
                </>
              ) : null}
            </span>
            <span className="truncate text-[color:var(--text-muted)]">
              {t(msg`关键词“${keyword}”`)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onBackToAll ? (
              <DesktopSearchActionButton
                onClick={onBackToAll}
                priority="secondary"
                tone="brand"
              >
                {t(msg`回到全部`)}
              </DesktopSearchActionButton>
            ) : null}
            <DesktopSearchActionButton
              onClick={onScrollToTop}
              priority="secondary"
              tone="neutral"
            >
              {t(msg`回到顶部`)}
            </DesktopSearchActionButton>
            <DesktopSearchActionButton
              onClick={onClearKeyword}
              priority="secondary"
              tone="neutral"
            >
              {t(msg`清空`)}
            </DesktopSearchActionButton>
          </div>
        </div>
        {sectionItems?.length ? (
          <div className="mt-1.5 flex gap-0.5 overflow-x-auto border-t border-[color:var(--border-faint)] pt-1.5">
            {sectionItems.map((item) => (
              <button
                key={item.category}
                type="button"
                onClick={() => onSelectSection?.(item.category)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition",
                  desktopSearchChipFocusClassName,
                  activeSection === item.category
                    ? "bg-[rgba(7,193,96,0.10)] font-medium text-[color:var(--brand-primary)]"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
                )}
              >
                <span>{item.label}</span>
                <span
                  className={cn(
                    "text-[10px]",
                    activeSection === item.category
                      ? "text-[color:var(--brand-primary)]"
                      : "text-[color:var(--text-muted)]",
                  )}
                >
                  {item.count}
                </span>
              </button>
            ))}
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
  const t = useRuntimeTranslator();
  const getCategoryTitle = useSearchCategoryTitle();
  const categoryTitle = getCategoryTitle(category);
  return (
    <section className="rounded-[18px] border border-[#dce9dd] bg-[linear-gradient(135deg,rgba(7,193,96,0.10),rgba(7,193,96,0.04)_40%,white)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-dim)]">
            <span className="rounded-full bg-white px-2.5 py-1">{t(msg`全部结果`)}</span>
            <ChevronRight size={12} />
            <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[color:var(--brand-primary)]">
              {categoryTitle}
            </span>
          </div>
          <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
            {t(msg`已展开 ${categoryTitle} 全部结果`)}
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
            {t(msg`当前仍保留关键词“${keyword}”，共 ${count} 条命中；返回时会回到聚合页里的对应分区。`)}
          </div>
        </div>
        <DesktopSearchActionButton
          onClick={onBack}
          priority="secondary"
          tone="brand"
        >
          {t(msg`回到全部结果`)}
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
  const t = useRuntimeTranslator();
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
              {t(msg`刚刚定位`)}
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
  const t = useRuntimeTranslator();
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
        <DesktopSearchSubsectionPanel title={t(msg`会话命中`)}>
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
  const t = useRuntimeTranslator();
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
        <DesktopSearchSubsectionPanel title={t(msg`账号命中`)}>
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
  const t = useRuntimeTranslator();
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
      ? t(msg`查看资料与聊天入口`)
      : category === "favorites"
        ? t(msg`打开收藏内容`)
        : t(msg`打开小程序`);

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
            ? t(msg`进入资料`)
            : category === "favorites"
              ? t(msg`立即打开`)
              : t(msg`打开小程序`)
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
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition hover:bg-[color:var(--surface-console)]",
        desktopSearchRowFocusClassName,
      )}
    >
      <AvatarChip
        name={item.avatarName ?? item.title}
        src={item.avatarSrc}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
            {item.title}
          </span>
          <span className="shrink-0 text-[10px] text-[color:var(--text-muted)]">
            {item.badge}
          </span>
        </div>
        <div className="truncate text-[11px] text-[color:var(--text-muted)]">
          {item.meta}
        </div>
      </div>
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
  const t = useRuntimeTranslator();
  return (
    <div className="group/row flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[color:var(--surface-console)]">
      <button
        type="button"
        onClick={onApply}
        className={cn(
          "inline-flex min-w-0 flex-1 items-center gap-2 text-left",
          desktopSearchFocusRingClassName,
        )}
      >
        <Clock3 size={13} className="shrink-0 text-[color:var(--text-dim)]" />
        <span className="truncate text-[13px] text-[color:var(--text-primary)]">
          {keyword}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t(msg`移除`)}
        className="shrink-0 rounded p-1 text-[color:var(--text-dim)] opacity-0 transition hover:bg-white hover:text-[#be123c] group-hover/row:opacity-100 focus:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
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
  const t = useRuntimeTranslator();
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
            {t(msg`${group.totalHits} 条相关记录`)}
          </div>
          <DesktopSearchOpenCue compact label={t(msg`进入会话`)} tone="brand" />
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
              <DesktopSearchOpenCue compact label={t(msg`直达消息`)} tone="brand" />
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
  const t = useRuntimeTranslator();
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
            {t(msg`${group.totalHits} 篇相关文章`)}
          </div>
          <DesktopSearchOpenCue compact label={t(msg`进入账号`)} tone="brand" />
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
              <DesktopSearchOpenCue compact label={t(msg`读文章`)} tone="brand" />
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
  const t = useRuntimeTranslator();
  const toneClassName =
    item.category === "moments"
      ? "border-[#dce8d7] bg-[linear-gradient(180deg,#f9fcf7,white)]"
      : "border-[#dce5de] bg-[linear-gradient(180deg,#f6faf8,white)]";
  const badgeClassName =
    item.category === "moments"
      ? "bg-[rgba(134,181,96,0.12)] text-[#587d38]"
      : "bg-[rgba(15,23,42,0.08)] text-[#3c6a53]";
  const actionLabel =
    item.category === "moments" ? t(msg`打开朋友圈动态`) : t(msg`打开广场动态`);

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
        ctaLabel={t(msg`查看原内容`)}
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

// 桌面端目前把 miniPrograms / officialAccounts 这两个分类的入口藏起来（landing
// scope cards / 顶部分类 chip / 全部视图分区都过滤），但 useSearchIndex 仍会
// 算出对应结果。在 workspace 里凡是用来驱动「用户可见 / 可导航」的 derived
// state（context bar、键盘导航、auto-select、空态判断、chip 计数）都要走过这
// 个 helper，否则就会出现「点击没反应 / 焦点静默消失 / 计数对不上 / 全空白页」。
function isDesktopHiddenCategory(
  category: SearchCategory | SearchResultCategory,
) {
  return category === "miniPrograms" || category === "officialAccounts";
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
  const t = useRuntimeTranslator();
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
      <DesktopSearchOpenCue compact label={t(msg`打开结果`)} tone="brand" />
    </button>
  );
}

function getDesktopSearchSectionDescription(
  category: SearchCategory | SearchResultCategory,
): MessageDescriptor {
  if (category === "messages") {
    return msg`优先展示会话分组和命中的消息片段。`;
  }

  if (category === "officialAccounts") {
    return msg`先看账号分组，再看文章和账号命中。`;
  }

  if (category === "contacts") {
    return msg`按资料卡查看联系人和角色入口。`;
  }

  if (category === "favorites") {
    return msg`聚合消息、笔记和内容收藏结果。`;
  }

  if (category === "miniPrograms") {
    return msg`优先展示可直接打开的小程序入口。`;
  }

  if (category === "moments") {
    return msg`按内容卡查看朋友圈动态和评论命中。`;
  }

  if (category === "feed") {
    return msg`按内容卡查看广场动态结果。`;
  }

  return msg`按当前分类集中查看最相关的结果。`;
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

