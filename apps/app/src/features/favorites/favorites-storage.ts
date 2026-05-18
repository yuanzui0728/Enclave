import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { FavoriteCategory, FavoriteRecord } from "@yinjie/contracts";
import { isDesktopRuntimeAvailable } from "@yinjie/ui";

const t = translateRuntimeMessage;

export type DesktopFavoriteCategory = FavoriteCategory;
export type DesktopFavoriteRecord = FavoriteRecord;

export const DESKTOP_FAVORITES_STORAGE_KEY = "yinjie-desktop-favorites";
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
    .sort((left, right) =>
      right.collectedAt < left.collectedAt
        ? -1
        : right.collectedAt > left.collectedAt
          ? 1
          : 0,
    );
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
    try {
      storage.setItem(DESKTOP_FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      // localStorage 满（典型 5-10MB）时 setItem 抛 QuotaExceededError，
      // 之前未捕获，会顺着 upsertDesktopFavorite 冒到 React 点击 handler 里
      // 让组件崩。这里降级：原子 native 同步还能继续，仅本地 web 存储未持久化。
      // 不主动驱逐，避免一次写入把用户辛苦收藏的旧内容也吞了。
      if (typeof console !== 'undefined') {
        console.warn(
          'Failed to persist desktop favorites to localStorage',
          error,
        );
      }
    }
  } else {
    // R23：和姊妹 note-drafts-storage R20 同款—— Safari iOS 隐私模式 / 浏览器
    // 禁用 storage 时 removeItem 也可能抛 SecurityError。本路径在用户清空收藏
    // 时跑（favorites.length=0 这条 else）。抛了会让 chat-composer 收藏面板
    // refresh 链路 throw。静默降级。
    try {
      storage.removeItem(DESKTOP_FAVORITES_STORAGE_KEY);
    } catch {
      // 静默
    }
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

  // R19：和 R17/R18 同款 —— Safari iOS 隐私模式 / 部分浏览器禁用 storage 时
  // getItem 本身可能抛 SecurityError。chat-composer 「+ → 收藏」面板打开时通过
  // line 1107/1135 直接调本函数；抛错会让 composer hydration effect 整个崩，
  // 用户在桌面单聊点 + 看收藏列表整页空白且没法继续打字。
  let raw: string | null;
  try {
    raw = storage.getItem(DESKTOP_FAVORITES_STORAGE_KEY);
  } catch {
    return [] as DesktopFavoriteRecord[];
  }
  return parseDesktopFavorites(raw);
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

/**
 * 走查 2026-05-18 R2：用于「乐观取消收藏 → 网络失败 → 把原记录放回去」的兜底
 * 路径。原 channels-page onError 走 upsertDesktopFavorite(restored) 把
 * collectedAt 字段 destructure 扔掉，重写为 now → favorite 在"我 → 收藏"列表里
 * 神秘跳到顶部（按 collectedAt DESC 排序）。restore 路径完整保留 collectedAt，
 * favorite 留在原本的位置。
 */
export function restoreDesktopFavorite(record: DesktopFavoriteRecord) {
  const current = readDesktopFavorites();
  const nextFavorites = [
    record,
    ...current.filter((item) => item.sourceId !== record.sourceId),
  ];
  // normalizeDesktopFavorites 在 readDesktopFavorites 内部按 collectedAt DESC
  // 排序——这里 prepend 是为了去重 + 触发后续 write 时 normalize 用同款 sort
  // 把 record 落回正确位置（不依赖 prepend 的"最新"假设）。
  writeDesktopFavorites(
    [...nextFavorites].sort((left, right) =>
      right.collectedAt < left.collectedAt
        ? -1
        : right.collectedAt > left.collectedAt
          ? 1
          : 0,
    ),
  );
  return nextFavorites;
}

export function buildFavoriteShareText(item: DesktopFavoriteRecord) {
  const title = item.title.trim();
  const description = item.description.trim();
  const lines = [t(msg`[收藏] ${title || item.title}`)];

  // 走查 R2：现网 yuanzui0728 的 10 条收藏里 8 条都是 description === title
  // （笔记类纯文本 favorite 默认把 title 复用进 description），share text 第二行
  //  把 title 又写一遍肉眼像 bug：
  //    [收藏] R5 重要内容：明天 14:00 团队评审
  //    R5 重要内容：明天 14:00 团队评审   ← 重复
  //    来自 笔记
  //    5月17日 10:55
  if (description && description !== title) {
    lines.push(description);
  }

  lines.push(t(msg`来自 ${item.badge}`));

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

  // ISO-8601 字符串本身就字典序可比，不必走 localeCompare 的 Collator 路径。
  return [
    ...remoteFavorites,
    ...localFavorites.filter(
      (favorite) => !remoteSourceIdSet.has(favorite.sourceId),
    ),
  ].sort((left, right) =>
    right.collectedAt < left.collectedAt
      ? -1
      : right.collectedAt > left.collectedAt
        ? 1
        : 0,
  );
}

// Tauri 桌面 focus/visibilitychange 上 setFavorites 的兜底比较器。
// 之前是 JSON.stringify(700 项) === JSON.stringify(700 项)，每次 focus 都新建 ~700KB
// 字符串。改成 sourceId + collectedAt 的轻量指纹：长度不同直接返回 false，
// 否则按下标拼一个紧凑串，跳过 title/description/avatar 等大字段。
export function computeDesktopFavoritesFingerprint(
  favorites: DesktopFavoriteRecord[],
) {
  if (favorites.length === 0) return "0|";
  let fingerprint = `${favorites.length}|`;
  for (const item of favorites) {
    fingerprint += `${item.sourceId}@${item.collectedAt};`;
  }
  return fingerprint;
}
