import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { DesktopSearchWorkspace } from "../features/search/desktop-search-workspace";
import {
  clearSearchHistory,
  hydrateSearchHistoryFromNative,
  loadSearchHistory,
  pushSearchHistory,
  removeSearchHistory,
} from "../features/search/search-history";
import {
  buildSearchRouteHash,
  parseSearchRouteState,
} from "../features/search/search-route-state";
import { MobileSearchWorkspace } from "../features/search/mobile-search-workspace";
import type {
  SearchCategory,
  SearchResultItem,
} from "../features/search/search-types";
import { useSearchIndex } from "../features/search/use-search-index";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function SearchPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopSearchHistory = runtimeConfig.appPlatform === "desktop";
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseSearchRouteState(hash);
  const [searchText, setSearchText] = useState(routeState.keyword);
  const [committedSearchText, setCommittedSearchText] = useState(
    routeState.keyword,
  );
  const [activeCategory, setActiveCategory] = useState<SearchCategory>(
    routeState.category,
  );
  const [history, setHistory] = useState(() => loadSearchHistory());
  const effectiveSearchText = isDesktopLayout ? committedSearchText : searchText;
  const {
    error,
    filteredResults,
    groupedResults,
    hasKeyword,
    loading,
    matchedCounts,
    messageGroups,
    officialAccountGroups,
    recentFavorites,
    recentMiniPrograms,
    scopeCounts,
    searchingMessages,
  } = useSearchIndex(effectiveSearchText, activeCategory, isDesktopLayout);

  useEffect(() => {
    setSearchText(routeState.keyword);
    if (isDesktopLayout) {
      setCommittedSearchText(routeState.keyword);
    }
  }, [isDesktopLayout, routeState.keyword]);

  useEffect(() => {
    setActiveCategory(routeState.category);
  }, [routeState.category]);

  useEffect(() => {
    if (pathname !== "/tabs/search") {
      return;
    }

    const nextHash = buildSearchRouteHash({
      category: activeCategory,
      keyword: effectiveSearchText,
      source: routeState.source,
    });
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if (normalizedHash === (nextHash ?? "")) {
      return;
    }

    void navigate({
      to: "/tabs/search",
      hash: nextHash,
      replace: true,
    });
  }, [
    activeCategory,
    effectiveSearchText,
    hash,
    navigate,
    pathname,
    routeState.source,
  ]);

  useEffect(() => {
    if (!isDesktopLayout || !nativeDesktopSearchHistory) {
      return;
    }

    let cancelled = false;

    const syncSearchHistory = async () => {
      const nextHistory = await hydrateSearchHistoryFromNative();
      if (cancelled) {
        return;
      }

      setHistory((current) =>
        JSON.stringify(current) === JSON.stringify(nextHistory)
          ? current
          : nextHistory,
      );
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

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isDesktopLayout, nativeDesktopSearchHistory]);

  function handleCommitSearch(keyword: string) {
    const normalizedKeyword = keyword.trim();
    setSearchText(normalizedKeyword);

    if (isDesktopLayout) {
      setCommittedSearchText(normalizedKeyword);
    }

    if (normalizedKeyword) {
      setHistory(pushSearchHistory(normalizedKeyword));
    }
  }

  function handleApplyHistory(keyword: string) {
    setSearchText(keyword);
    if (isDesktopLayout) {
      setCommittedSearchText(keyword);
    }
    setHistory(pushSearchHistory(keyword));
  }

  function handleRemoveHistory(keyword: string) {
    setHistory(removeSearchHistory(keyword));
  }

  function handleClearHistory() {
    setHistory(clearSearchHistory());
  }

  function handleOpenResult(item: SearchResultItem) {
    handleCommitSearch(effectiveSearchText);
    void navigate({
      to: item.to as never,
      search: item.search as never,
      hash: item.hash,
    });
  }

  function handleOpenQuickLink(item: { to: string; search?: string }) {
    void navigate({
      to: item.to as never,
      search: item.search as never,
    });
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    void navigate({
      to: routeState.source === "contacts" ? "/tabs/contacts" : "/tabs/chat",
    });
  }

  if (isDesktopLayout) {
    return (
      <DesktopSearchWorkspace
        activeCategory={activeCategory}
        error={error}
        groupedResults={groupedResults}
        hasKeyword={hasKeyword}
        history={history}
        loading={loading}
        matchedCounts={matchedCounts}
        messageGroups={messageGroups}
        officialAccountGroups={officialAccountGroups}
        onApplyHistory={handleApplyHistory}
        onClearHistory={handleClearHistory}
        onClearKeyword={() => {
          setSearchText("");
          setCommittedSearchText("");
        }}
        onCommitSearch={handleCommitSearch}
        committedSearchText={committedSearchText}
        onOpenQuickLink={handleOpenQuickLink}
        onOpenResult={handleOpenResult}
        onRemoveHistory={handleRemoveHistory}
        recentFavorites={recentFavorites}
        recentMiniPrograms={recentMiniPrograms}
        scopeCounts={scopeCounts}
        searchText={searchText}
        searchingMessages={searchingMessages}
        setActiveCategory={setActiveCategory}
        setSearchText={setSearchText}
        visibleResults={filteredResults}
      />
    );
  }

  return (
    <MobileSearchWorkspace
      activeCategory={activeCategory}
      error={error}
      groupedResults={groupedResults}
      hasKeyword={hasKeyword}
      history={history}
      loading={loading}
      matchedCounts={matchedCounts}
      onApplyHistory={handleApplyHistory}
      onBack={handleBack}
      onClearHistory={handleClearHistory}
      onClearKeyword={() => setSearchText("")}
      onCommitSearch={handleCommitSearch}
      onOpenResult={handleOpenResult}
      onRemoveHistory={handleRemoveHistory}
      scopeCounts={scopeCounts}
      searchText={searchText}
      searchingMessages={searchingMessages}
      setActiveCategory={setActiveCategory}
      setSearchText={setSearchText}
      visibleResults={filteredResults}
    />
  );
}
