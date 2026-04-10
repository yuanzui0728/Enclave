import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { DesktopSearchWorkspace } from "../features/search/desktop-search-workspace";
import {
  clearSearchHistory,
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

export function SearchPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseSearchRouteState(hash);
  const [searchText, setSearchText] = useState(routeState.keyword);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>(
    routeState.category,
  );
  const [history, setHistory] = useState(() => loadSearchHistory());
  const {
    error,
    filteredResults,
    groupedResults,
    hasKeyword,
    loading,
    matchedCounts,
    scopeCounts,
    searchingMessages,
  } = useSearchIndex(searchText, activeCategory);

  useEffect(() => {
    if (searchText !== routeState.keyword) {
      setSearchText(routeState.keyword);
    }
    if (activeCategory !== routeState.category) {
      setActiveCategory(routeState.category);
    }
  }, [activeCategory, routeState.category, routeState.keyword, searchText]);

  useEffect(() => {
    const nextHash = buildSearchRouteHash({
      category: activeCategory,
      keyword: searchText,
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
  }, [activeCategory, hash, navigate, searchText]);

  function handleCommitSearch(keyword: string) {
    setHistory(pushSearchHistory(keyword));
  }

  function handleApplyHistory(keyword: string) {
    setSearchText(keyword);
    setHistory(pushSearchHistory(keyword));
  }

  function handleRemoveHistory(keyword: string) {
    setHistory(removeSearchHistory(keyword));
  }

  function handleClearHistory() {
    setHistory(clearSearchHistory());
  }

  function handleOpenResult(item: SearchResultItem) {
    handleCommitSearch(searchText);
    void navigate({
      to: item.to as never,
      hash: item.hash,
    });
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    void navigate({ to: "/tabs/chat" });
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
        onApplyHistory={handleApplyHistory}
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
