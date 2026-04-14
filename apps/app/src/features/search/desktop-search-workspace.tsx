import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type Dispatch,
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
import { EmptyState } from "../../components/empty-state";
import { ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
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
  const pendingAllResultsJumpRef = useRef<SearchResultCategory | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const categoryTabRefs = useRef<
    Partial<Record<SearchCategory, HTMLButtonElement | null>>
  >({});
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const spotlightPanelTimeoutRef = useRef<number | null>(null);
  const transitionHintTimeoutRef = useRef<number | null>(null);
  const [activeAllResultsSection, setActiveAllResultsSection] =
    useState<SearchResultCategory | null>(null);
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-app)]">
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
                      placeholder="搜索聊天记录、联系人、公众号、收藏和小程序"
                      className="h-12 w-full rounded-[16px] border border-white/80 bg-white/96 pl-11 pr-20 text-sm text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.4)] focus:shadow-[0_0_0_4px_rgba(7,193,96,0.08)]"
                    />
                    {searchText ? (
                      <DesktopSearchActionButton
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        onClick={handleClearKeyword}
                        tone="neutral"
                      >
                        清空
                      </DesktopSearchActionButton>
                    ) : null}
                  </form>
                </div>
              </div>
            </div>

            <div className="border-t border-white/80 px-5 py-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {searchCategoryLabels.map((item) => {
                  const countLabel = !hasKeyword
                    ? null
                    : item.id === "all"
                      ? `${visibleResults.length}`
                      : `${matchedCounts[item.id]}`;

                  return (
                    <button
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
          {loading ? <LoadingBlock label="正在准备桌面搜索索引..." /> : null}
          {error ? <ErrorBlock message={error} /> : null}
          {!loading && !error && transitionHint ? (
            <DesktopSearchStatusCard
              description={transitionHint}
              status="done"
              title="定位反馈"
            />
          ) : null}

          {!loading && !error && hasKeyword && searchingMessages ? (
            <DesktopSearchStatusCard
              description="聊天记录结果还在继续补全，稍后会自动刷新更多命中。"
              status="pending"
              title="搜索状态"
            />
          ) : null}
          {!loading && !error && hasKeyword ? (
            <DesktopSearchContextBar
              activeCategory={activeCategory}
              categoryTitle={contextCategoryTitle}
              count={visibleResults.length}
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
                        清空
                      </DesktopSearchActionButton>
                    ) : null
                  }
                  countLabel={history.length ? `${history.length} 条记录` : undefined}
                  description="空态先展示你最近真正用过的关键词。"
                  title="最近搜索"
                >
                  {history.length ? (
                    <div className="space-y-2">
                      {history.map((item) => (
                        <div
                          key={item.keyword}
                          className="flex items-center gap-2 rounded-[14px] bg-white px-3 py-2.5"
                        >
                          <button
                            type="button"
                            onClick={() => handleApplyHistory(item.keyword)}
                            className="inline-flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <Clock3
                              size={14}
                              className="shrink-0 text-[color:var(--text-dim)]"
                            />
                            <span className="truncate text-sm text-[color:var(--text-secondary)]">
                              {item.keyword}
                            </span>
                          </button>
                          <DesktopSearchActionButton
                            onClick={() => onRemoveHistory(item.keyword)}
                            className="shrink-0"
                            tone="danger"
                          >
                            删除
                          </DesktopSearchActionButton>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-white px-4 py-6">
                      <EmptyState
                        title="还没有最近搜索"
                        description="从聊天、通讯录或左侧导航进入搜一搜后，这里会开始积累关键词。"
                      />
                    </div>
                  )}
                </DesktopSearchLandingPanel>

                <div className="space-y-4">
                  <DesktopQuickLinksPanel
                    title="最近使用的小程序"
                    description="桌面端先把最近打开的小程序放进搜一搜首页，方便从主搜索框直达。"
                    emptyText="打开过的小程序会先沉淀到这里。"
                    items={recentMiniPrograms}
                    onOpen={onOpenQuickLink}
                  />
                  <DesktopQuickLinksPanel
                    title="最近收藏"
                    description="高频回看的收藏会优先出现在桌面搜一搜首页。"
                    emptyText="收藏过内容后，这里会出现最近回访入口。"
                    items={recentFavorites}
                    onOpen={onOpenQuickLink}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {!loading && !error && hasKeyword && !visibleResults.length ? (
            <div className="rounded-[20px] border border-dashed border-[color:var(--border-faint)] bg-white/92 px-6 py-10">
              <EmptyState
                title="没有找到匹配结果"
                description="换个关键词试试，或者切换到更具体的分类后继续找。"
              />
            </div>
          ) : null}

          {!loading && !error && hasKeyword ? (
            activeCategory === "all" ? (
              <div className="space-y-6">
                {groupedResults.map((section) => {
                  const previewContentResults =
                    isDesktopContentCategory(section.category)
                      ? section.results.slice(0, 4)
                      : [];
                  const previewFeatureResults =
                    isDesktopFeatureCardCategory(section.category)
                      ? section.results.slice(
                          0,
                          section.category === "favorites" ? 3 : 4,
                        )
                      : [];
                  const previewMessageGroups =
                    section.category === "messages"
                      ? messageGroups.slice(0, 3)
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
                        ? officialAccountGroups.length >
                            previewOfficialAccountGroups.length ||
                          officialAccountOnlyResults.length >
                            previewOfficialAccounts.length
                      : isDesktopFeatureCardCategory(section.category)
                        ? section.results.length > previewFeatureResults.length
                      : isDesktopContentCategory(section.category)
                        ? section.results.length > previewContentResults.length
                      : section.results.length > previewResults.length;

                  return (
                    <DesktopSearchResultsPanel
                      key={section.category}
                      action={
                        hasMore ? (
                          <DesktopSearchActionButton
                            onClick={() =>
                              handleExpandAllResultsSection(section.category)
                            }
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
                          conversationResults={previewMessageConversations}
                          keyword={normalizedKeyword}
                          messageGroups={previewMessageGroups}
                          onOpen={onOpenResult}
                        />
                      ) : section.category === "officialAccounts" ? (
                        <DesktopSearchOfficialAccountResults
                          accountResults={previewOfficialAccounts}
                          keyword={normalizedKeyword}
                          officialAccountGroups={previewOfficialAccountGroups}
                          onOpen={onOpenResult}
                        />
                      ) : isDesktopFeatureCardCategory(section.category) ? (
                        <DesktopSearchFeatureResults
                          category={section.category}
                          items={previewFeatureResults}
                          keyword={normalizedKeyword}
                          onOpen={onOpenResult}
                        />
                      ) : isDesktopContentCategory(section.category) ? (
                        <DesktopSearchContentResults
                          items={previewContentResults}
                          keyword={normalizedKeyword}
                          onOpen={onOpenResult}
                        />
                      ) : (
                        <DesktopSearchResultStack>
                          {previewResults.map((item) => (
                            <DesktopSearchResultRow
                              key={item.id}
                              item={item}
                              keyword={normalizedKeyword}
                              onOpen={onOpenResult}
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
                    />
                  ) : activeCategory === "officialAccounts" ? (
                    <DesktopSearchOfficialAccountResults
                      accountResults={officialAccountOnlyResults}
                      keyword={normalizedKeyword}
                      officialAccountGroups={officialAccountGroups}
                      onOpen={onOpenResult}
                    />
                  ) : isDesktopFeatureCardCategory(activeCategory) ? (
                    <DesktopSearchFeatureResults
                      category={activeCategory}
                      items={visibleResults}
                      keyword={normalizedKeyword}
                      onOpen={onOpenResult}
                    />
                  ) : isDesktopContentCategory(activeCategory) ? (
                    <DesktopSearchContentResults
                      items={visibleResults}
                      keyword={normalizedKeyword}
                      onOpen={onOpenResult}
                    />
                  ) : (
                    <DesktopSearchResultStack>
                      {visibleResults.map((item) => (
                        <DesktopSearchResultRow
                          key={item.id}
                          item={item}
                          keyword={normalizedKeyword}
                          onOpen={onOpenResult}
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
  description,
  emptyText,
  items,
  onOpen,
  title,
}: {
  description: string;
  emptyText: string;
  items: DesktopSearchQuickLink[];
  onOpen: (item: DesktopSearchQuickLink) => void;
  title: string;
}) {
  return (
    <DesktopSearchLandingPanel
      countLabel={items.length ? `${items.length} 个入口` : undefined}
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
        <div className="rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-white px-4 py-6 text-xs leading-6 text-[color:var(--text-muted)]">
          {emptyText}
        </div>
      ) : null}
    </DesktopSearchLandingPanel>
  );
}

function DesktopSearchLandingPanel({
  action,
  children,
  countLabel,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  countLabel?: string;
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
  tone,
}: {
  children: ReactNode;
  className?: string;
  onClick: () => void;
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
      className={cn(
        "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] transition",
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
      ? "border-[rgba(180,132,23,0.14)] bg-[rgba(180,132,23,0.08)] text-[#9a6b12] group-hover:bg-[rgba(180,132,23,0.12)]"
      : tone === "teal"
        ? "border-[rgba(15,118,110,0.16)] bg-[rgba(15,118,110,0.08)] text-[#226448] group-hover:bg-[rgba(15,118,110,0.12)]"
        : tone === "olive"
          ? "border-[rgba(134,181,96,0.18)] bg-[rgba(134,181,96,0.10)] text-[#587d38] group-hover:bg-[rgba(134,181,96,0.14)]"
          : "border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)] group-hover:bg-[rgba(7,193,96,0.12)]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border transition-[transform,background-color,border-color,color] group-hover:translate-x-0.5",
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
  description,
  status,
  title,
}: {
  description: string;
  status: "done" | "error" | "pending";
  title: string;
}) {
  const toneClassName =
    status === "error"
      ? "border-[rgba(225,29,72,0.14)] bg-[rgba(225,29,72,0.06)]"
      : "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.05)]";
  const badgeClassName =
    status === "error"
      ? "bg-white text-[#be123c]"
      : status === "pending"
        ? "bg-white text-[color:var(--brand-primary)]"
        : "bg-white text-[color:var(--text-muted)]";
  const statusLabel =
    status === "error" ? "异常" : status === "pending" ? "补全中" : "已完成";

  return (
    <section className={cn("mb-4 rounded-[18px] border p-4", toneClassName)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className={cn("rounded-full px-2.5 py-1 text-[10px]", badgeClassName)}>
          {statusLabel}
        </div>
      </div>
      <div className="mt-2 rounded-[12px] bg-white px-3 py-2.5 text-xs leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
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
  const contextDescription =
    activeCategory === "all"
      ? "当前正在查看聚合结果，继续滚动时这条上下文会一直保留。"
      : `当前结果已收窄到${categoryTitle}，需要扩展范围时可随时回到全部结果。`;
  const activeSectionTitle = activeSection
    ? searchCategoryTitles[activeSection]
    : null;

  return (
    <div className="sticky top-0 z-10 mb-4 pt-1">
      <section className="rounded-[18px] border border-[rgba(7,193,96,0.14)] bg-[rgba(255,255,255,0.94)] p-4 shadow-[0_18px_42px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--brand-primary)]">
                当前搜索
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
            </div>
            <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
              关键词“{keyword}”
            </div>
            <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
              {contextDescription}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {onBackToAll ? (
              <DesktopSearchActionButton onClick={onBackToAll} tone="brand">
                回到全部结果
              </DesktopSearchActionButton>
            ) : null}
            <DesktopSearchActionButton onClick={onScrollToTop} tone="neutral">
              回到顶部
            </DesktopSearchActionButton>
            <DesktopSearchActionButton onClick={onClearKeyword} tone="neutral">
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
        <DesktopSearchActionButton onClick={onBack} tone="brand">
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
}: {
  conversationResults: SearchResultItem[];
  keyword: string;
  messageGroups: SearchMessageGroup[];
  onOpen: (item: SearchResultItem) => void;
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
        />
      ))}

      {conversationResults.length ? (
        <DesktopSearchSubsectionPanel title="会话命中">
          <div className="space-y-2">
            {conversationResults.map((item) => (
              <DesktopSearchResultRow
                key={item.id}
                item={item}
                keyword={keyword}
                onOpen={onOpen}
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
}: {
  accountResults: SearchResultItem[];
  keyword: string;
  officialAccountGroups: SearchOfficialAccountGroup[];
  onOpen: (item: SearchResultItem) => void;
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
        />
      ))}

      {accountResults.length ? (
        <DesktopSearchSubsectionPanel title="账号命中">
          <div className="space-y-2">
            {accountResults.map((item) => (
              <DesktopSearchResultRow
                key={item.id}
                item={item}
                keyword={keyword}
                onOpen={onOpen}
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
}: {
  category: "contacts" | "favorites" | "miniPrograms";
  items: SearchResultItem[];
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
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
          category={category}
          item={item}
          keyword={keyword}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function DesktopSearchContentResults({
  items,
  keyword,
  onOpen,
}: {
  items: SearchResultItem[];
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
}) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <DesktopSearchContentCard
          key={item.id}
          item={item}
          keyword={keyword}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function DesktopSearchFeatureCard({
  category,
  item,
  keyword,
  onOpen,
}: {
  category: "contacts" | "favorites" | "miniPrograms";
  item: SearchResultItem;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
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
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "group overflow-hidden rounded-[20px] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.08)]",
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
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group flex w-full items-center gap-3 rounded-[14px] bg-white px-3 py-3 text-left transition hover:bg-[rgba(7,193,96,0.04)]"
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
      <DesktopSearchOpenCue compact label="直达" tone="brand" />
    </button>
  );
}

function DesktopSearchMessageGroupCard({
  group,
  keyword,
  onOpen,
}: {
  group: SearchMessageGroup;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-[#dde8dc] bg-[linear-gradient(180deg,#fbfdfb,white)] shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
      <button
        type="button"
        onClick={() => onOpen(group.header)}
        className="group flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white"
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
              type="button"
              onClick={() => onOpen(item)}
              className="group flex w-full items-start gap-3 rounded-[14px] border border-[rgba(15,23,42,0.04)] bg-white px-3 py-3 text-left transition hover:bg-[rgba(7,193,96,0.04)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
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
}: {
  group: SearchOfficialAccountGroup;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-[#dde8dc] bg-[linear-gradient(180deg,#fbfdfb,white)] shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
      <button
        type="button"
        onClick={() => onOpen(group.header)}
        className="group flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white"
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
              type="button"
              onClick={() => onOpen(item)}
              className="group flex w-full items-start gap-3 rounded-[14px] border border-[rgba(15,23,42,0.04)] bg-white px-3 py-3 text-left transition hover:bg-[rgba(7,193,96,0.04)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
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
  item,
  keyword,
  onOpen,
}: {
  item: SearchResultItem;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
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
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "group overflow-hidden rounded-[20px] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(15,23,42,0.08)]",
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
  item,
  keyword,
  onOpen,
}: {
  item: SearchResultItem;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group flex w-full items-center gap-3 rounded-[16px] border border-[rgba(15,23,42,0.04)] bg-white px-3.5 py-3 text-left transition hover:bg-[rgba(7,193,96,0.04)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
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
