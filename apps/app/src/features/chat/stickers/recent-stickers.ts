import { isDesktopRuntimeAvailable } from "@yinjie/ui";

const RECENT_STICKERS_STORAGE_KEY = "yinjie.chat.recent-stickers";
const RECENT_STICKERS_LIMIT = 20;
let recentStickersNativeWriteQueue: Promise<void> = Promise.resolve();

export type RecentStickerItem = {
  sourceType?: "builtin" | "custom";
  packId?: string;
  stickerId: string;
  usedAt: number;
};

function normalizeRecentStickerItems(value: unknown): RecentStickerItem[] {
  if (!Array.isArray(value)) {
    return [] as RecentStickerItem[];
  }

  return value
    .filter(
      (item): item is RecentStickerItem =>
        typeof item?.stickerId === "string" &&
        typeof item?.usedAt === "number" &&
        ((item?.sourceType ?? "builtin") === "custom"
          ? true
          : typeof item?.packId === "string"),
    )
    .map<RecentStickerItem>((item) => ({
      sourceType: item.sourceType === "custom" ? "custom" : "builtin",
      packId: item.packId,
      stickerId: item.stickerId,
      usedAt: item.usedAt,
    }))
    .sort((left, right) => right.usedAt - left.usedAt)
    .slice(0, RECENT_STICKERS_LIMIT);
}

function parseRecentStickerItems(raw: string | null | undefined) {
  if (!raw) {
    return [] as RecentStickerItem[];
  }

  try {
    return normalizeRecentStickerItems(JSON.parse(raw) as RecentStickerItem[]);
  } catch {
    return [] as RecentStickerItem[];
  }
}

function readRecentStickersFromLocal() {
  if (typeof window === "undefined") {
    return [] as RecentStickerItem[];
  }

  return parseRecentStickerItems(
    window.localStorage.getItem(RECENT_STICKERS_STORAGE_KEY),
  );
}

function getLatestRecentStickerTimestamp(items: RecentStickerItem[]) {
  return items.reduce(
    (latest, item) => (item.usedAt > latest ? item.usedAt : latest),
    0,
  );
}

function queueNativeRecentStickersWrite(items: RecentStickerItem[]) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(items);
  recentStickersNativeWriteQueue = recentStickersNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_recent_stickers_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

function writeRecentStickers(
  items: RecentStickerItem[],
  options?: {
    syncNative?: boolean;
  },
) {
  if (typeof window === "undefined") {
    return items;
  }

  if (items.length) {
    window.localStorage.setItem(
      RECENT_STICKERS_STORAGE_KEY,
      JSON.stringify(items),
    );
  } else {
    window.localStorage.removeItem(RECENT_STICKERS_STORAGE_KEY);
  }

  if (options?.syncNative !== false) {
    queueNativeRecentStickersWrite(items);
  }

  return items;
}

export function loadRecentStickers(): RecentStickerItem[] {
  return readRecentStickersFromLocal();
}

export function pushRecentSticker(input: {
  sourceType?: "builtin" | "custom";
  packId?: string;
  stickerId: string;
}) {
  if (typeof window === "undefined") {
    return [];
  }

  const next: RecentStickerItem[] = [
    {
      sourceType: input.sourceType ?? "builtin",
      packId: input.packId,
      stickerId: input.stickerId,
      usedAt: Date.now(),
    },
    ...loadRecentStickers().filter(
      (item) =>
        !(
          (item.sourceType ?? "builtin") === (input.sourceType ?? "builtin") &&
          (item.packId ?? "") === (input.packId ?? "") &&
          item.stickerId === input.stickerId
        ),
    ),
  ].slice(0, RECENT_STICKERS_LIMIT);

  writeRecentStickers(next);
  return next;
}

export async function hydrateRecentStickersFromNative() {
  const localItems = readRecentStickersFromLocal();
  if (!isDesktopRuntimeAvailable()) {
    return localItems;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_recent_stickers_store");

    if (!result.exists) {
      if (localItems.length) {
        queueNativeRecentStickersWrite(localItems);
      }
      return localItems;
    }

    const nativeItems = parseRecentStickerItems(result.contents ?? null);
    if (
      getLatestRecentStickerTimestamp(localItems) >
      getLatestRecentStickerTimestamp(nativeItems)
    ) {
      if (localItems.length) {
        queueNativeRecentStickersWrite(localItems);
      }
      return localItems;
    }

    writeRecentStickers(nativeItems, {
      syncNative: false,
    });
    return nativeItems;
  } catch {
    return localItems;
  }
}
