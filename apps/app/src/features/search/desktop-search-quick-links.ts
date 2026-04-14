import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFavorites, type FavoriteRecord } from "@yinjie/contracts";
import { formatTimestamp, parseTimestamp } from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  hydrateDesktopFavoritesFromNative,
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
} from "../desktop/favorites/desktop-favorites-storage";
import {
  getMiniProgramEntry,
  miniProgramEntries,
  type MiniProgramEntry,
} from "../mini-programs/mini-programs-data";
import { useMiniProgramsState } from "../mini-programs/use-mini-programs-state";

export type DesktopSearchQuickLink = {
  id: string;
  title: string;
  description: string;
  meta: string;
  badge: string;
  to: string;
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
  messages: "收藏消息",
  notes: "笔记",
  contacts: "收藏联系人",
  officialAccounts: "收藏公众号",
  moments: "收藏朋友圈",
  feed: "收藏广场动态",
  channels: "收藏视频号",
};

export function useDesktopSearchQuickLinks(keyword: string) {
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

  const recentFavorites = useMemo(
    () => mergedFavorites.slice(0, 4).map(buildFavoriteQuickLink),
    [mergedFavorites],
  );

  const favoriteMatches = useMemo(() => {
    if (!normalizedKeyword) {
      return [] as DesktopSearchQuickLink[];
    }

    return mergedFavorites
      .filter((item) => matchesFavoriteKeyword(item, normalizedKeyword))
      .slice(0, 4)
      .map(buildFavoriteQuickLink);
  }, [mergedFavorites, normalizedKeyword]);

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
          ? [buildMiniProgramQuickLink(entry, miniProgramSearchState)]
          : [];
      });
  }, [miniProgramSearchState]);

  const miniProgramMatches = useMemo(() => {
    if (!normalizedKeyword) {
      return [] as DesktopSearchQuickLink[];
    }

    return miniProgramEntries
      .filter((item) => matchesMiniProgramKeyword(item, normalizedKeyword))
      .sort((left, right) => {
        const rightScore = getMiniProgramMatchScore(
          right,
          miniProgramSearchState,
        );
        const leftScore = getMiniProgramMatchScore(
          left,
          miniProgramSearchState,
        );
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return left.name.localeCompare(right.name, "zh-CN");
      })
      .slice(0, 4)
      .map((item) => buildMiniProgramQuickLink(item, miniProgramSearchState));
  }, [miniProgramSearchState, normalizedKeyword]);

  return {
    favoriteMatches,
    favoritesError:
      favoritesQuery.error instanceof Error ? favoritesQuery.error.message : null,
    favoritesLoading: favoritesQuery.isLoading,
    mergedFavorites,
    miniProgramMatches,
    recentFavorites,
    recentMiniPrograms,
  };
}

function buildFavoriteQuickLink(
  favorite: FavoriteRecord,
): DesktopSearchQuickLink {
  return {
    id: `favorite-${favorite.sourceId}`,
    title: favorite.title,
    description: favorite.description || "打开这条收藏内容。",
    meta:
      favorite.meta.trim() ||
      `${FAVORITE_CATEGORY_LABELS[favorite.category]} · ${formatTimestamp(favorite.collectedAt)}`,
    badge: FAVORITE_CATEGORY_LABELS[favorite.category],
    to: favorite.to,
    avatarName: favorite.avatarName ?? favorite.title,
    avatarSrc: favorite.avatarSrc,
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
): DesktopSearchQuickLink {
  const launchCount = state.launchCountById[miniProgram.id] ?? 0;
  const lastOpenedAt = state.lastOpenedAtById[miniProgram.id];
  const pinned = state.pinnedMiniProgramIds.includes(miniProgram.id);
  const params = new URLSearchParams();
  params.set("miniProgram", miniProgram.id);

  return {
    id: `mini-program-${miniProgram.id}`,
    title: miniProgram.name,
    description: miniProgram.slogan,
    meta: lastOpenedAt
      ? `${pinned ? "我的小程序" : "最近使用"} · ${formatTimestamp(lastOpenedAt)}`
      : `${pinned ? "我的小程序" : "小程序"} · ${miniProgram.developer}`,
    badge: launchCount > 0 ? `已打开 ${launchCount} 次` : "打开小程序",
    to: "/tabs/mini-programs",
    search: `?${params.toString()}`,
    avatarName: miniProgram.name,
  };
}

function matchesMiniProgramKeyword(
  miniProgram: MiniProgramEntry,
  keyword: string,
) {
  return [
    miniProgram.name,
    miniProgram.slogan,
    miniProgram.description,
    miniProgram.developer,
    miniProgram.deckLabel,
    miniProgram.openHint,
    ...miniProgram.tags,
  ]
    .join(" ")
    .toLowerCase()
    .includes(keyword);
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
