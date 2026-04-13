import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import type { SearchHistoryItem } from "./search-types";

const SEARCH_HISTORY_STORAGE_KEY = "yinjie.app.search-history";
const SEARCH_HISTORY_LIMIT = 8;
let searchHistoryNativeWriteQueue: Promise<void> = Promise.resolve();

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function normalizeSearchHistory(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as SearchHistoryItem[];
  }

  return value
    .filter(
      (item): item is SearchHistoryItem =>
        typeof item?.keyword === "string" && typeof item?.usedAt === "number",
    )
    .sort((left, right) => right.usedAt - left.usedAt)
    .slice(0, SEARCH_HISTORY_LIMIT);
}

function parseSearchHistory(raw: string | null | undefined) {
  if (!raw) {
    return [] as SearchHistoryItem[];
  }

  try {
    return normalizeSearchHistory(JSON.parse(raw) as SearchHistoryItem[]);
  } catch {
    return [] as SearchHistoryItem[];
  }
}

function readSearchHistoryFromLocal() {
  const storage = getStorage();
  if (!storage) {
    return [] as SearchHistoryItem[];
  }

  return parseSearchHistory(storage.getItem(SEARCH_HISTORY_STORAGE_KEY));
}

function getLatestSearchHistoryTimestamp(history: SearchHistoryItem[]) {
  return history.reduce(
    (latest, item) => (item.usedAt > latest ? item.usedAt : latest),
    0,
  );
}

function queueNativeSearchHistoryWrite(history: SearchHistoryItem[]) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(history);
  searchHistoryNativeWriteQueue = searchHistoryNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_search_history_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

function writeSearchHistory(
  history: SearchHistoryItem[],
  options?: {
    syncNative?: boolean;
  },
) {
  const storage = getStorage();
  if (!storage) {
    return history;
  }

  if (history.length) {
    storage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } else {
    storage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
  }

  if (options?.syncNative !== false) {
    queueNativeSearchHistoryWrite(history);
  }

  return history;
}

export function loadSearchHistory() {
  return readSearchHistoryFromLocal();
}

export function pushSearchHistory(keyword: string) {
  const trimmedKeyword = keyword.trim();
  if (!trimmedKeyword) {
    return loadSearchHistory();
  }

  const nextHistory = [
    { keyword: trimmedKeyword, usedAt: Date.now() },
    ...loadSearchHistory().filter((item) => item.keyword !== trimmedKeyword),
  ].slice(0, SEARCH_HISTORY_LIMIT);

  writeSearchHistory(nextHistory);
  return nextHistory;
}

export function removeSearchHistory(keyword: string) {
  const nextHistory = loadSearchHistory().filter(
    (item) => item.keyword !== keyword,
  );
  writeSearchHistory(nextHistory);
  return nextHistory;
}

export function clearSearchHistory() {
  writeSearchHistory([]);
  return [] as SearchHistoryItem[];
}

export async function hydrateSearchHistoryFromNative() {
  const localHistory = readSearchHistoryFromLocal();
  if (!isDesktopRuntimeAvailable()) {
    return localHistory;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_search_history_store");

    if (!result.exists) {
      if (localHistory.length) {
        queueNativeSearchHistoryWrite(localHistory);
      }
      return localHistory;
    }

    const nativeHistory = parseSearchHistory(result.contents ?? null);
    if (
      getLatestSearchHistoryTimestamp(localHistory) >
      getLatestSearchHistoryTimestamp(nativeHistory)
    ) {
      if (localHistory.length) {
        queueNativeSearchHistoryWrite(localHistory);
      }
      return localHistory;
    }

    writeSearchHistory(nativeHistory, {
      syncNative: false,
    });
    return nativeHistory;
  } catch {
    return localHistory;
  }
}
