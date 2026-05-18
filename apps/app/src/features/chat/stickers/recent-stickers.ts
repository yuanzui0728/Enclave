import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export const RECENT_STICKERS_STORAGE_KEY = "yinjie.chat.recent-stickers";
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

  try {
    return parseRecentStickerItems(
      window.localStorage.getItem(RECENT_STICKERS_STORAGE_KEY),
    );
  } catch {
    // Safari ITP / iOS 私密模式 localStorage 访问偶发抛 SecurityError；正常
    // privacy + 配额超限场景统一吞错给空表，让外层的发送流程继续。
    return [] as RecentStickerItem[];
  }
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

  // 走查 R4：原版 setItem / removeItem 没 try/catch。Safari iOS 私密模式 +
  // 配额超限（用户已经塞了 5MB+ 在 localStorage 上）会抛同步异常，把外层
  // 调用 (chat-composer.tsx pushRecentSticker → emitChatMessage 之前) 炸掉。
  // 用户视角：选了表情、消息也发了…然后下一个动作没反应，因为整个 click
  // handler 已经在 setItem 那里栈展开了。和 local-chat-message-actions.ts
  // 已经做的 try/catch 模式对齐。
  try {
    if (items.length) {
      window.localStorage.setItem(
        RECENT_STICKERS_STORAGE_KEY,
        JSON.stringify(items),
      );
    } else {
      window.localStorage.removeItem(RECENT_STICKERS_STORAGE_KEY);
    }
  } catch {
    // recent stickers 是"最近用过"的便利缓存，写不进去对功能没有致命影响——
    // 用户下次重启 / 再选时 list 重新积累；不要让本地存储错误阻塞发送主路径。
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

export function removeRecentSticker(input: {
  sourceType?: "builtin" | "custom";
  packId?: string;
  stickerId: string;
}) {
  if (typeof window === "undefined") {
    return [];
  }

  const next = loadRecentStickers().filter(
    (item) =>
      !(
        (item.sourceType ?? "builtin") === (input.sourceType ?? "builtin") &&
        (item.packId ?? "") === (input.packId ?? "") &&
        item.stickerId === input.stickerId
      ),
  );

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
