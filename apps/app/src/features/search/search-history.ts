import type { SearchHistoryItem } from "./search-types";

const SEARCH_HISTORY_STORAGE_KEY = "yinjie.app.search-history";
const SEARCH_HISTORY_LIMIT = 8;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function writeSearchHistory(history: SearchHistoryItem[]) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

export function loadSearchHistory() {
  const storage = getStorage();
  if (!storage) {
    return [] as SearchHistoryItem[];
  }

  const raw = storage.getItem(SEARCH_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [] as SearchHistoryItem[];
  }

  try {
    const parsed = JSON.parse(raw) as SearchHistoryItem[];
    if (!Array.isArray(parsed)) {
      return [] as SearchHistoryItem[];
    }

    return parsed
      .filter(
        (item) =>
          typeof item?.keyword === "string" && typeof item?.usedAt === "number",
      )
      .sort((left, right) => right.usedAt - left.usedAt)
      .slice(0, SEARCH_HISTORY_LIMIT);
  } catch {
    return [] as SearchHistoryItem[];
  }
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
