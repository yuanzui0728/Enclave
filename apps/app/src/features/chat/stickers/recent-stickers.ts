const RECENT_STICKERS_STORAGE_KEY = "yinjie.chat.recent-stickers";
const RECENT_STICKERS_LIMIT = 20;

export type RecentStickerItem = {
  packId: string;
  stickerId: string;
  usedAt: number;
};

export function loadRecentStickers(): RecentStickerItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_STICKERS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as RecentStickerItem[];
    return parsed
      .filter((item) => item?.packId && item?.stickerId)
      .sort((left, right) => right.usedAt - left.usedAt)
      .slice(0, RECENT_STICKERS_LIMIT);
  } catch {
    return [];
  }
}

export function pushRecentSticker(packId: string, stickerId: string) {
  if (typeof window === "undefined") {
    return [];
  }

  const next = [
    { packId, stickerId, usedAt: Date.now() },
    ...loadRecentStickers().filter((item) => !(item.packId === packId && item.stickerId === stickerId)),
  ].slice(0, RECENT_STICKERS_LIMIT);

  window.localStorage.setItem(RECENT_STICKERS_STORAGE_KEY, JSON.stringify(next));
  return next;
}
