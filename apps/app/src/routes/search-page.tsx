import {
  Suspense,
  lazy,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { normalizePathname } from "../lib/normalize-pathname";
import { searchStringToObject } from "../lib/route-search";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { recordSearchActivity } from "@yinjie/contracts";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

const t = translateRuntimeMessage;

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
  const rawEffectiveSearchText = isDesktopLayout
    ? committedSearchText
    : searchText;
  // 移动端 search 直接 bind searchText，每次按键都会重跑 useSearchIndex（涉及
  // 全表 fuzzy 匹配 + 多类别聚合）。useDeferredValue 让连续输入期间 React 跳
  // 过中间帧的重渲染，保留输入响应感。
  const effectiveSearchText = useDeferredValue(rawEffectiveSearchText);
  const desktopSearchPath = "/tabs/search";
  const normalizedPathname = normalizePathname(pathname);
  const desktopPathMismatch =
    isDesktopLayout && normalizedPathname !== desktopSearchPath;
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

    // 用户从搜索页打开结果（如 /character/$id）后，路由 pathname 已经离开
    // /tabs/search；此时不能再 replace 回 /tabs/search，否则会把已经触发的目标
    // 导航吞掉，表现为"点击搜索结果没反应"。
    if (desktopPathMismatch) {
      return;
    }

    const routeStateApplied =
      searchText === routeState.keyword &&
      activeCategory === routeState.category &&
      committedSearchText === routeState.keyword;

    if (syncingRouteStateRef.current) {
      if (!routeStateApplied) {
        return;
      }

      syncingRouteStateRef.current = false;
    }

    const nextHash = currentSearchRouteHash;
    if (normalizedHash === (nextHash ?? "")) {
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

  // 后端 POST /search/history 这条端点存在并被 cyber-avatar /
  // shake-discovery / need-discovery 三个 AI 推荐特性消费，但前端从
  // 来没调过——这些 AI 看到的搜索行为永远是空的。在 commit / apply
  // history 两个真正"用户主动定型一次搜索意图"的入口里 fire-and-
  // forget 上报；失败默默吞掉（埋点，不影响主流程）。
  //
  // 走查 R5 真机：handleOpenResult 里也调 handleCommitSearch（"打开结果
  // 也算定型一次搜索意图"），导致用户「打 '苏' → Enter → 点结果」一个
  // 行为段上报两次相同 query。会在后端 owner_search_history_records 里
  // 堆同 query 时间相邻的行，cyber-avatar 信号被同一意图重复加权。用 ref
  // 记上一次刚 fire 出去的 query，相同 query 直接 short-circuit；下一个
  // 不同 query 会自动重置（覆盖 ref）。
  const lastRecordedQueryRef = useRef<string | null>(null);
  function recordSearchActivityFireAndForget(query: string) {
    if (!query) {
      return;
    }
    if (lastRecordedQueryRef.current === query) {
      return;
    }
    lastRecordedQueryRef.current = query;
    void recordSearchActivity(
      {
        query,
        source: isDesktopLayout ? "desktop-search" : "mobile-search",
      },
      runtimeConfig.apiBaseUrl,
    ).catch(() => undefined);
  }

  function handleCommitSearch(keyword: string) {
    const normalizedKeyword = keyword.trim();
    setSearchText(normalizedKeyword);

    if (isDesktopLayout) {
      setCommittedSearchText(normalizedKeyword);
    }

    if (normalizedKeyword) {
      setHistory(pushSearchHistory(normalizedKeyword));
      recordSearchActivityFireAndForget(normalizedKeyword);
    }
  }

  function handleApplyHistory(keyword: string) {
    setSearchText(keyword);
    if (isDesktopLayout) {
      setCommittedSearchText(keyword);
    }
    setHistory(pushSearchHistory(keyword));
    recordSearchActivityFireAndForget(keyword.trim());
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

  // 移动端不像桌面那样把 keyword / category 实时同步进 URL hash（避免
  // 每次按键都 push 一条 history entry），URL 一直停在用户首次进入时的状态。
  // 用户点结果跳过去后再按返回，搜索页就 remount 出 hash 里没 keyword 的
  // 初始状态——输入框空白，要重新打一遍。这里在导航离开前用
  // history.replaceState 把当前 keyword / category baked 进当前条目，
  // 这样返回时 URL 仍带 q=...，组件 mount 后能从 hash 读回来恢复输入。
  function persistSearchStateInUrlBeforeLeave() {
    if (isDesktopLayout) {
      return;
    }

    const trimmedKeyword = effectiveSearchText.trim();
    if (!trimmedKeyword && activeCategory === "all") {
      return;
    }

    const nextHash = buildSearchRouteHash({
      category: activeCategory,
      keyword: trimmedKeyword,
      source: routeState.source,
    });

    const targetHash = nextHash ? `#${nextHash}` : "";
    if (typeof window !== "undefined" && window.location.hash !== targetHash) {
      const newUrl = `${window.location.pathname}${window.location.search}${targetHash}`;
      window.history.replaceState(window.history.state, "", newUrl);
    }
  }

  function handleOpenResult(item: SearchResultItem) {
    const navigationTarget = applySearchNavigationContext(
      resolveSearchNavigationTarget(item, {
        desktopLayout: isDesktopLayout,
      }),
    );
    handleCommitSearch(effectiveSearchText);
    persistSearchStateInUrlBeforeLeave();
    void navigate({
      to: navigationTarget.to as never,
      search: searchStringToObject(navigationTarget.search) as never,
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
    persistSearchStateInUrlBeforeLeave();
    void navigate({
      to: navigationTarget.to as never,
      search: searchStringToObject(navigationTarget.search) as never,
      hash: navigationTarget.hash,
    });
  }

  function handleBack() {
    const fallbackTarget =
      routeState.source === "contacts" ? "/tabs/contacts" : "/tabs/chat";
    navigateBackOrFallback(
      () => {
        void navigate({ to: fallbackTarget });
      },
      fallbackTarget,
    );
  }

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面搜索`)}
            description={t(msg`正在载入桌面搜索工作区，马上同步当前搜索条件。`)}
            loadingLabel={t(msg`载入桌面搜索...`)}
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
          onRetryLoad={retryLoad}
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
      // searchText 是用户实时输入（受控 input 必须用它），effectiveSearchText 是
      // useDeferredValue 过的副本，filter / 卡片实际渲染都跟它走。把 effective
      // 单独传一份用于高亮 keyword：之前卡片用 searchText.trim() 当 keyword，
      // 快速连打 "ab" 时 searchText 已是 "ab" 但 visibleResults 还是按 "a" 过出来的，
      // 卡片文本只含 "a" 不含 "ab"，<mark> 高亮直接全部消失再回填，观感像"高亮丢了"。
      highlightKeyword={effectiveSearchText}
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
