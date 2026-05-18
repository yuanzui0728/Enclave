import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFavorites, type FavoriteRecord } from "@yinjie/contracts";
import { formatTimestamp, parseTimestamp } from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  hydrateDesktopFavoritesFromNative,
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
} from "../favorites/favorites-storage";
import {
  getMiniProgramEntry,
  miniProgramEntries,
  type MiniProgramEntry,
} from "../mini-programs/mini-programs-data";
import { useMiniProgramsState } from "../mini-programs/use-mini-programs-state";
import { type SearchResultItem } from "./search-types";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

const t = translateRuntimeMessage;

export type SearchQuickLink = {
  id: string;
  title: string;
  description: string;
  meta: string;
  badge: string;
  to: string;
  hash?: string;
  search?: string;
  avatarName?: string;
  avatarSrc?: string;
};

type MiniProgramSearchStateSnapshot = {
  recentMiniProgramIds: string[];
  pinnedMiniProgramIds: string[];
  launchCountById: Record<string, number>;
  lastOpenedAtById: Record<string, string>;
};

const FAVORITE_CATEGORY_LABELS: Record<FavoriteRecord["category"], string> = {
  messages: t(msg`收藏消息`),
  notes: t(msg`笔记`),
  contacts: t(msg`收藏联系人`),
  officialAccounts: t(msg`收藏公众号`),
  moments: t(msg`收藏朋友圈`),
  feed: t(msg`收藏广场动态`),
  channels: t(msg`收藏视频号`),
};

export function useSearchQuickLinks(
  keyword: string,
  isDesktopLayout = true,
) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const isNativeDesktop = runtimeConfig.appPlatform === "desktop";
  const [localFavorites, setLocalFavorites] = useState(() =>
    readDesktopFavorites(),
  );
  const miniProgramsState = useMiniProgramsState();
  const normalizedKeyword = keyword.trim().toLowerCase();
  const miniProgramSearchState = useMemo<MiniProgramSearchStateSnapshot>(
    () => ({
      recentMiniProgramIds: miniProgramsState.recentMiniProgramIds,
      pinnedMiniProgramIds: miniProgramsState.pinnedMiniProgramIds,
      launchCountById: miniProgramsState.launchCountById,
      lastOpenedAtById: miniProgramsState.lastOpenedAtById,
    }),
    [
      miniProgramsState.lastOpenedAtById,
      miniProgramsState.launchCountById,
      miniProgramsState.pinnedMiniProgramIds,
      miniProgramsState.recentMiniProgramIds,
    ],
  );

  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
  });

  useEffect(() => {
    if (!isNativeDesktop) {
      setLocalFavorites(readDesktopFavorites());
      return;
    }

    let cancelled = false;

    const syncFavorites = async () => {
      const favorites = await hydrateDesktopFavoritesFromNative();
      if (cancelled) {
        return;
      }

      setLocalFavorites((current) =>
        JSON.stringify(current) === JSON.stringify(favorites)
          ? current
          : favorites,
      );
    };

    const handleFocus = () => {
      void syncFavorites();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncFavorites();
    };

    void syncFavorites();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isNativeDesktop]);

  const mergedFavorites = useMemo(
    () =>
      mergeDesktopFavoriteRecords(favoritesQuery.data ?? [], localFavorites),
    [favoritesQuery.data, localFavorites],
  );
  const favoriteSearchResults = useMemo(
    () => mergedFavorites.map(buildFavoriteSearchResult),
    [mergedFavorites],
  );

  const recentFavorites = useMemo(
    () => mergedFavorites.slice(0, 4).map(buildFavoriteQuickLink),
    [mergedFavorites],
  );

  const favoriteMatches = useMemo(() => {
    if (!normalizedKeyword) {
      return [] as SearchQuickLink[];
    }

    return mergedFavorites
      .filter((item) => matchesFavoriteKeyword(item, normalizedKeyword))
      .slice(0, 4)
      .map(buildFavoriteQuickLink);
  }, [mergedFavorites, normalizedKeyword]);
  const miniProgramSearchResults = useMemo(
    () =>
      miniProgramEntries.map((item) =>
        buildMiniProgramSearchResult(
          item,
          miniProgramSearchState,
          isDesktopLayout,
        ),
      ),
    [isDesktopLayout, miniProgramSearchState],
  );

  const recentMiniPrograms = useMemo(() => {
    const seen = new Set<string>();
    const candidateIds = [
      ...miniProgramSearchState.recentMiniProgramIds,
      ...miniProgramSearchState.pinnedMiniProgramIds,
    ];

    return candidateIds
      .filter((id) => {
        if (seen.has(id)) {
          return false;
        }

        seen.add(id);
        return Boolean(getMiniProgramEntry(id));
      })
      .slice(0, 4)
      .flatMap((id) => {
        const entry = getMiniProgramEntry(id);
        return entry
          ? [
              buildMiniProgramQuickLink(
                entry,
                miniProgramSearchState,
                isDesktopLayout,
              ),
            ]
          : [];
      });
  }, [isDesktopLayout, miniProgramSearchState]);

  // 走查 R1：之前还有一份 `miniProgramMatches`（按 keyword 过 miniProgramEntries
  // 后取前 4 条），desktop-search-launcher / mobile-search-workspace / use-search-index
  // 全代码库无一个消费者——但仍然每次 keyword 变就 filter+sort+slice+map 一遍，
  // 顺便把 buildMiniProgramQuickLink 跑 4 次。直接删掉；要恢复"小程序快速命中"
  // 时复用 miniProgramSearchResults（按完整索引出，category=miniPrograms）。

  return {
    favoriteMatches,
    favoriteSearchResults,
    favoritesError:
      favoritesQuery.error instanceof Error
        ? favoritesQuery.error.message
        : null,
    favoritesLoading: favoritesQuery.isLoading,
    mergedFavorites,
    miniProgramSearchResults,
    recentFavorites,
    recentMiniPrograms,
  };
}

function buildFavoriteQuickLink(favorite: FavoriteRecord): SearchQuickLink {
  return {
    id: `favorite-${favorite.sourceId}`,
    title: favorite.title,
    description: favorite.description || t(msg`打开这条收藏内容。`),
    meta:
      favorite.meta.trim() ||
      `${FAVORITE_CATEGORY_LABELS[favorite.category]} · ${formatTimestamp(favorite.collectedAt)}`,
    badge: FAVORITE_CATEGORY_LABELS[favorite.category],
    to: favorite.to,
    avatarName: favorite.avatarName ?? favorite.title,
    avatarSrc: favorite.avatarSrc,
  };
}

function buildFavoriteSearchResult(favorite: FavoriteRecord): SearchResultItem {
  const collectedAtLabel = formatTimestamp(favorite.collectedAt);
  const favoriteLabel = FAVORITE_CATEGORY_LABELS[favorite.category];

  return {
    id: `favorite-result-${favorite.sourceId}`,
    category: "favorites",
    title: favorite.title,
    description: favorite.description || t(msg`打开这条收藏内容。`),
    meta: favorite.meta.trim()
      ? t(msg`收藏 · ${favorite.meta}`)
      : t(msg`收藏 · ${collectedAtLabel}`),
    keywords: [
      favorite.title,
      favorite.description,
      favorite.meta,
      favorite.badge,
      favoriteLabel,
      collectedAtLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    to: favorite.to,
    badge: favorite.badge.trim() || favoriteLabel,
    avatarName: favorite.avatarName ?? favorite.title,
    avatarSrc: favorite.avatarSrc,
    sortTime: parseTimestamp(favorite.collectedAt) ?? 0,
  };
}

function matchesFavoriteKeyword(favorite: FavoriteRecord, keyword: string) {
  return [
    favorite.title,
    favorite.description,
    favorite.meta,
    favorite.badge,
    FAVORITE_CATEGORY_LABELS[favorite.category],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(keyword);
}

function buildMiniProgramQuickLink(
  miniProgram: MiniProgramEntry,
  state: MiniProgramSearchStateSnapshot,
  isDesktopLayout: boolean,
): SearchQuickLink {
  const launchCount = state.launchCountById[miniProgram.id] ?? 0;
  const lastOpenedAt = state.lastOpenedAtById[miniProgram.id];
  const pinned = state.pinnedMiniProgramIds.includes(miniProgram.id);
  const target = resolveMiniProgramNavigationTarget(
    miniProgram.id,
    isDesktopLayout,
  );

  return {
    id: `mini-program-${miniProgram.id}`,
    title: miniProgram.name,
    description: miniProgram.slogan,
    meta: lastOpenedAt
      ? `${pinned ? t(msg`我的小程序`) : t(msg`最近使用`)} · ${formatTimestamp(lastOpenedAt)}`
      : `${pinned ? t(msg`我的小程序`) : t(msg`小程序`)} · ${miniProgram.developer}`,
    badge: launchCount > 0 ? t(msg`已打开 ${launchCount} 次`) : t(msg`打开小程序`),
    to: target.to,
    search: target.search,
    avatarName: miniProgram.name,
  };
}

function buildMiniProgramSearchResult(
  miniProgram: MiniProgramEntry,
  state: MiniProgramSearchStateSnapshot,
  isDesktopLayout: boolean,
): SearchResultItem {
  const lastOpenedAt = state.lastOpenedAtById[miniProgram.id];
  const pinned = state.pinnedMiniProgramIds.includes(miniProgram.id);
  const target = resolveMiniProgramNavigationTarget(
    miniProgram.id,
    isDesktopLayout,
  );

  return {
    id: `mini-program-result-${miniProgram.id}`,
    category: "miniPrograms",
    title: miniProgram.name,
    description: miniProgram.description || miniProgram.slogan,
    meta: lastOpenedAt
      ? `${pinned ? t(msg`我的小程序`) : t(msg`最近使用`)} · ${formatTimestamp(lastOpenedAt)}`
      : t(msg`小程序 · ${miniProgram.developer}`),
    keywords: [
      miniProgram.name,
      miniProgram.slogan,
      miniProgram.description,
      miniProgram.developer,
      miniProgram.badge,
      miniProgram.deckLabel,
      miniProgram.openHint,
      ...miniProgram.tags,
    ]
      .join(" ")
      .toLowerCase(),
    to: target.to,
    search: target.search,
    badge: t(msg`小程序`),
    avatarName: miniProgram.name,
    sortTime: getMiniProgramMatchScore(miniProgram, state),
  };
}

function getMiniProgramMatchScore(
  miniProgram: MiniProgramEntry,
  state: MiniProgramSearchStateSnapshot,
) {
  const openedAt = parseTimestamp(state.lastOpenedAtById[miniProgram.id]) ?? 0;
  const launchCount = state.launchCountById[miniProgram.id] ?? 0;
  const pinned = state.pinnedMiniProgramIds.includes(miniProgram.id) ? 1 : 0;
  return openedAt + launchCount * 1000 + pinned * 100;
}

function resolveMiniProgramNavigationTarget(
  miniProgramId: string,
  isDesktopLayout: boolean,
) {
  const params = new URLSearchParams();
  params.set("miniProgram", miniProgramId);

  return {
    to: isDesktopLayout ? "/tabs/mini-programs" : "/discover/mini-programs",
    search: `?${params.toString()}`,
  };
}
