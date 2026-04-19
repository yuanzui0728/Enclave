import type { FavoriteCategory, FavoriteRecord } from "@yinjie/contracts";
import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type DesktopFavoriteCategory = FavoriteCategory;
export type DesktopFavoriteRecord = FavoriteRecord;

const DESKTOP_FAVORITES_STORAGE_KEY = "yinjie-desktop-favorites";
let desktopFavoritesNativeWriteQueue: Promise<void> = Promise.resolve();

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function normalizeDesktopFavorites(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as DesktopFavoriteRecord[];
  }

  return value
    .filter(
      (item): item is DesktopFavoriteRecord =>
        typeof item?.id === "string" &&
        typeof item.sourceId === "string" &&
        typeof item.category === "string" &&
        typeof item.title === "string" &&
        typeof item.description === "string" &&
        typeof item.meta === "string" &&
        typeof item.to === "string" &&
        typeof item.badge === "string" &&
        typeof item.collectedAt === "string",
    )
    .sort((left, right) => right.collectedAt.localeCompare(left.collectedAt));
}

function parseDesktopFavorites(raw: string | null | undefined) {
  if (!raw) {
    return [] as DesktopFavoriteRecord[];
  }

  try {
    return normalizeDesktopFavorites(JSON.parse(raw));
  } catch {
    return [] as DesktopFavoriteRecord[];
  }
}

function getLatestDesktopFavoriteTimestamp(favorites: DesktopFavoriteRecord[]) {
  return favorites.reduce((latest, item) => {
    const collectedAt = Date.parse(item.collectedAt);
    return Number.isFinite(collectedAt) && collectedAt > latest
      ? collectedAt
      : latest;
  }, 0);
}

function queueNativeDesktopFavoritesWrite(favorites: DesktopFavoriteRecord[]) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(favorites);
  desktopFavoritesNativeWriteQueue = desktopFavoritesNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_favorites_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

function writeDesktopFavorites(
  favorites: DesktopFavoriteRecord[],
  options?: {
    syncNative?: boolean;
  },
) {
  const storage = getStorage();
  if (!storage) {
    return favorites;
  }

  if (favorites.length) {
    storage.setItem(DESKTOP_FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } else {
    storage.removeItem(DESKTOP_FAVORITES_STORAGE_KEY);
  }

  if (options?.syncNative !== false) {
    queueNativeDesktopFavoritesWrite(favorites);
  }

  return favorites;
}

export function readDesktopFavorites() {
  const storage = getStorage();
  if (!storage) {
    return [] as DesktopFavoriteRecord[];
  }

  return parseDesktopFavorites(storage.getItem(DESKTOP_FAVORITES_STORAGE_KEY));
}

export async function hydrateDesktopFavoritesFromNative() {
  const localFavorites = readDesktopFavorites();
  if (!isDesktopRuntimeAvailable()) {
    return localFavorites;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_favorites_store");

    if (!result.exists) {
      if (localFavorites.length) {
        queueNativeDesktopFavoritesWrite(localFavorites);
      }
      return localFavorites;
    }

    const nativeFavorites = parseDesktopFavorites(result.contents ?? null);
    if (
      getLatestDesktopFavoriteTimestamp(localFavorites) >
      getLatestDesktopFavoriteTimestamp(nativeFavorites)
    ) {
      if (localFavorites.length) {
        queueNativeDesktopFavoritesWrite(localFavorites);
      }
      return localFavorites;
    }

    writeDesktopFavorites(nativeFavorites, {
      syncNative: false,
    });
    return nativeFavorites;
  } catch {
    return localFavorites;
  }
}

export function isDesktopFavorite(sourceId: string) {
  return readDesktopFavorites().some((item) => item.sourceId === sourceId);
}

export function upsertDesktopFavorite(
  input: Omit<DesktopFavoriteRecord, "collectedAt">,
) {
  const now = new Date().toISOString();
  const current = readDesktopFavorites();
  const nextRecord: DesktopFavoriteRecord = {
    ...input,
    collectedAt: now,
  };

  const nextFavorites = [
    nextRecord,
    ...current.filter((item) => item.sourceId !== input.sourceId),
  ];

  writeDesktopFavorites(nextFavorites);
  return nextFavorites;
}

export function removeDesktopFavorite(sourceId: string) {
  const nextFavorites = readDesktopFavorites().filter(
    (item) => item.sourceId !== sourceId,
  );
  writeDesktopFavorites(nextFavorites);
  return nextFavorites;
}

export function buildFavoriteShareText(item: DesktopFavoriteRecord) {
  const lines = [`[收藏] ${item.title}`];

  if (item.description.trim()) {
    lines.push(item.description.trim());
  }

  lines.push(`来自 ${item.badge}`);

  if (item.meta.trim()) {
    lines.push(item.meta.trim());
  }

  return lines.join("\n");
}

export function mergeDesktopFavoriteRecords(
  remoteFavorites: DesktopFavoriteRecord[],
  localFavorites = readDesktopFavorites(),
) {
  const remoteSourceIdSet = new Set(
    remoteFavorites.map((favorite) => favorite.sourceId),
  );

  return [
    ...remoteFavorites,
    ...localFavorites.filter(
      (favorite) => !remoteSourceIdSet.has(favorite.sourceId),
    ),
  ].sort((left, right) => right.collectedAt.localeCompare(left.collectedAt));
}
