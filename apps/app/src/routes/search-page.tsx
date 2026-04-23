import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
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
import {
  applyDesktopSearchReturnContext,
  resolveSearchNavigationTarget,
} from "../features/search/search-navigation";
import {
  buildCharacterDetailRouteHash,
  parseCharacterDetailRouteState,
} from "../features/contacts/character-detail-route-state";
import {
  buildMobileChatRouteHash,
  parseMobileChatRouteState,
} from "../features/chat/mobile-chat-route-state";
import {
  buildDesktopMomentsRouteHash,
  parseDesktopMomentsRouteState,
} from "../features/moments/moments-route-state";
import {
  buildFeedRouteHash,
  parseFeedRouteHash,
} from "../features/feed/feed-route-state";
import {
  buildDesktopChannelsRouteHash,
  parseDesktopChannelsRouteHash,
} from "../features/channels/channels-route-state";
import {
  buildMobileMiniProgramsRouteSearch,
  parseMobileMiniProgramsRouteSearch,
} from "../features/mini-programs/mobile-mini-programs-route-state";
import { buildMobileOfficialRouteHash } from "../features/official-accounts/mobile-official-route-state";
import { buildMobileGroupRouteHash, parseMobileGroupRouteState } from "../features/chat/mobile-group-route-state";
import { RouteRedirectState } from "../components/route-redirect-state";
import { MobileSearchWorkspace } from "../features/search/mobile-search-workspace";
import type {
  SearchCategory,
  SearchResultItem,
} from "../features/search/search-types";
import { useSearchIndex } from "../features/search/use-search-index";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopSearchWorkspace = lazy(async () => {
  const mod = await import("../features/search/desktop-search-workspace");
  return { default: mod.DesktopSearchWorkspace };
});

export function SearchPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopSearchHistory = runtimeConfig.appPlatform === "desktop";
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const routeState = parseSearchRouteState(hash);
  const syncingRouteStateRef = useRef(false);
  const [searchText, setSearchText] = useState(routeState.keyword);
  const [committedSearchText, setCommittedSearchText] = useState(
    routeState.keyword,
  );
  const [activeCategory, setActiveCategory] = useState<SearchCategory>(
    routeState.category,
  );
  const [history, setHistory] = useState(() => loadSearchHistory());
  const effectiveSearchText = isDesktopLayout
    ? committedSearchText
    : searchText;
  const desktopSearchPath = "/tabs/search";
  const desktopPathMismatch = isDesktopLayout && pathname !== "/tabs/search";
  const currentSearchRouteHash = buildSearchRouteHash({
    category: activeCategory,
    keyword: effectiveSearchText,
    source: routeState.source,
  });
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
    retryLoad,
    scopeCounts,
    searchingMessages,
  } = useSearchIndex(effectiveSearchText, activeCategory, isDesktopLayout);

  useEffect(() => {
    syncingRouteStateRef.current = true;
    setSearchText(routeState.keyword);
    if (isDesktopLayout) {
      setCommittedSearchText(routeState.keyword);
    }
  }, [isDesktopLayout, routeState.keyword]);

  useEffect(() => {
    syncingRouteStateRef.current = true;
    setActiveCategory(routeState.category);
  }, [routeState.category]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    const routeStateApplied =
      searchText === routeState.keyword &&
      activeCategory === routeState.category &&
      committedSearchText === routeState.keyword;

    if (syncingRouteStateRef.current && !desktopPathMismatch) {
      if (!routeStateApplied) {
        return;
      }

      syncingRouteStateRef.current = false;
    }

    const nextHash = currentSearchRouteHash;
    if (!desktopPathMismatch && normalizedHash === (nextHash ?? "")) {
      return;
    }

    void navigate({
      to: desktopSearchPath,
      hash: nextHash,
      replace: true,
    });
  }, [
    activeCategory,
    committedSearchText,
    currentSearchRouteHash,
    desktopPathMismatch,
    desktopSearchPath,
    effectiveSearchText,
    isDesktopLayout,
    navigate,
    normalizedHash,
    routeState.category,
    routeState.keyword,
    routeState.source,
    searchText,
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

  function applySearchNavigationContext(
    navigationTarget: ReturnType<typeof resolveSearchNavigationTarget>,
  ) {
    if (isDesktopLayout) {
      return applyDesktopSearchReturnContext(
        navigationTarget,
        currentSearchRouteHash,
      );
    }

    if (navigationTarget.to === "/discover/moments") {
      const targetRouteState = parseDesktopMomentsRouteState(
        navigationTarget.hash ?? "",
      );
      return {
        ...navigationTarget,
        hash: buildDesktopMomentsRouteHash({
          ...targetRouteState,
          returnPath: pathname,
          returnHash: currentSearchRouteHash || undefined,
        }),
      };
    }

    if (navigationTarget.to === "/discover/feed") {
      const targetRouteState = parseFeedRouteHash(navigationTarget.hash ?? "");
      return {
        ...navigationTarget,
        hash: buildFeedRouteHash({
          postId: targetRouteState.postId,
          returnPath: pathname,
          returnHash: currentSearchRouteHash || undefined,
        }),
      };
    }

    if (
      navigationTarget.to === "/discover/channels" ||
      navigationTarget.to === "/tabs/channels"
    ) {
      const targetRouteState = parseDesktopChannelsRouteHash(
        navigationTarget.hash ?? "",
      );
      return {
        ...navigationTarget,
        to: "/discover/channels",
        hash: buildDesktopChannelsRouteHash({
          authorId: targetRouteState.authorId,
          postId: targetRouteState.postId,
          returnPath: pathname,
          returnHash: currentSearchRouteHash || undefined,
          section: targetRouteState.section,
        }),
      };
    }

    if (navigationTarget.to === "/discover/mini-programs") {
      const targetRouteState = parseMobileMiniProgramsRouteSearch(
        navigationTarget.search ?? "",
      );
      return {
        ...navigationTarget,
        search: buildMobileMiniProgramsRouteSearch({
          ...targetRouteState,
          returnPath: pathname,
          returnHash: currentSearchRouteHash || undefined,
        }),
      };
    }

    if (navigationTarget.to.startsWith("/chat/")) {
      const targetRouteState = parseMobileChatRouteState(
        navigationTarget.hash ?? "",
      );
      return {
        ...navigationTarget,
        hash: buildMobileChatRouteHash({
          highlightedMessageId: targetRouteState.highlightedMessageId,
          returnPath: pathname,
          returnHash: currentSearchRouteHash || undefined,
        }),
      };
    }

    if (navigationTarget.to.startsWith("/group/")) {
      const targetRouteState = parseMobileGroupRouteState(
        navigationTarget.hash ?? "",
      );
      return {
        ...navigationTarget,
        hash: buildMobileGroupRouteHash({
          highlightedMessageId: targetRouteState.highlightedMessageId,
          returnPath: pathname,
          returnHash: currentSearchRouteHash || undefined,
        }),
      };
    }

    if (navigationTarget.to.startsWith("/character/")) {
      const targetRouteState = parseCharacterDetailRouteState(
        navigationTarget.hash ?? "",
      );
      return {
        ...navigationTarget,
        hash: buildCharacterDetailRouteHash({
          ...targetRouteState,
          returnPath: pathname,
          returnHash: currentSearchRouteHash || undefined,
        }),
      };
    }

    if (
      navigationTarget.to.startsWith("/official-accounts/") &&
      navigationTarget.to !== "/contacts/official-accounts"
    ) {
      return {
        ...navigationTarget,
        hash: buildMobileOfficialRouteHash({
          returnPath: pathname,
          returnHash: currentSearchRouteHash || undefined,
        }),
      };
    }

    return navigationTarget;
  }

  function handleOpenResult(item: SearchResultItem) {
    const navigationTarget = applySearchNavigationContext(
      resolveSearchNavigationTarget(item, {
        desktopLayout: isDesktopLayout,
      }),
    );
    handleCommitSearch(effectiveSearchText);
    void navigate({
      to: navigationTarget.to as never,
      search: navigationTarget.search as never,
      hash: navigationTarget.hash,
    });
  }

  function handleOpenQuickLink(item: {
    to: string;
    search?: string;
    hash?: string;
  }) {
    const navigationTarget = applySearchNavigationContext(
      resolveSearchNavigationTarget(item, {
        desktopLayout: isDesktopLayout,
      }),
    );
    void navigate({
      to: navigationTarget.to as never,
      search: navigationTarget.search as never,
      hash: navigationTarget.hash,
    });
  }

  function handleBack() {
    navigateBackOrFallback(() => {
      void navigate({
        to: routeState.source === "contacts" ? "/tabs/contacts" : "/tabs/chat",
      });
    });
  }

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在打开桌面搜索"
            description="正在载入桌面搜索工作区，马上同步当前搜索条件。"
            loadingLabel="载入桌面搜索..."
          />
        }
      >
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
      </Suspense>
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
      onRetryLoad={retryLoad}
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
