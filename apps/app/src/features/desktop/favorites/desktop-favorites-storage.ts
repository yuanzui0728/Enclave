export type DesktopFavoriteCategory =
  | "messages"
  | "contacts"
  | "officialAccounts"
  | "moments"
  | "feed";

export type DesktopFavoriteRecord = {
  id: string;
  sourceId: string;
  category: DesktopFavoriteCategory;
  title: string;
  description: string;
  meta: string;
  to: string;
  badge: string;
  avatarName?: string;
  avatarSrc?: string;
  collectedAt: string;
};

const DESKTOP_FAVORITES_STORAGE_KEY = "yinjie-desktop-favorites";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function writeDesktopFavorites(favorites: DesktopFavoriteRecord[]) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(DESKTOP_FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
}

export function readDesktopFavorites() {
  const storage = getStorage();
  if (!storage) {
    return [] as DesktopFavoriteRecord[];
  }

  const raw = storage.getItem(DESKTOP_FAVORITES_STORAGE_KEY);
  if (!raw) {
    return [] as DesktopFavoriteRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as DesktopFavoriteRecord[];
    if (!Array.isArray(parsed)) {
      return [] as DesktopFavoriteRecord[];
    }

    return parsed
      .filter(
        (item) =>
          typeof item?.id === "string" &&
          typeof item?.sourceId === "string" &&
          typeof item?.category === "string" &&
          typeof item?.title === "string" &&
          typeof item?.description === "string" &&
          typeof item?.meta === "string" &&
          typeof item?.to === "string" &&
          typeof item?.badge === "string" &&
          typeof item?.collectedAt === "string",
      )
      .sort((left, right) => right.collectedAt.localeCompare(left.collectedAt));
  } catch {
    return [] as DesktopFavoriteRecord[];
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
