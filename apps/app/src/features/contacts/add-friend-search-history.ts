// 「添加朋友」页面专属的搜索历史，不跟全局 /tabs/search 共用：
// - 隐界号 / 角色名搜索的语境跟全局 messages/contacts/feed 等多类别搜索完全
//   不同，串到一起会让 /tabs/search 的最近搜索里突然冒出大量隐界号串。
// - 全局 search-history 还需要 Tauri 桌面端文件同步（desktop_read_search_history_store），
//   添加朋友只在移动端 layout 下加载（桌面走 DesktopAddFriendWorkspace），不需要这层同步。
// 所以单独一份 storage key + 简化的 read/write，没有 native sync queue。

export type AddFriendSearchHistoryItem = {
  keyword: string;
  usedAt: number;
};

export const ADD_FRIEND_SEARCH_HISTORY_STORAGE_KEY =
  "yinjie.app.add-friend-search-history";
const ADD_FRIEND_SEARCH_HISTORY_LIMIT = 8;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

function normalize(value: unknown): AddFriendSearchHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (item): item is AddFriendSearchHistoryItem =>
        typeof item?.keyword === "string" && typeof item?.usedAt === "number",
    )
    .sort((left, right) => right.usedAt - left.usedAt)
    .slice(0, ADD_FRIEND_SEARCH_HISTORY_LIMIT);
}

function parse(raw: string | null | undefined): AddFriendSearchHistoryItem[] {
  if (!raw) {
    return [];
  }
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
}

function write(history: AddFriendSearchHistoryItem[]) {
  const storage = getStorage();
  if (!storage) {
    return history;
  }
  // 兜异常：iOS Safari 隐私模式 setItem 直接抛 SecurityError；
  // 普通模式 localStorage 配额满（典型 5MB）setItem 抛 QuotaExceededError。
  // 不抓的话用户搜一次 → submitSearch 调 push → write 抛 → page-level 没有
  // ErrorBoundary 兜，整页白屏。read 端 parse 已经 try/catch 了，write 对称
  // 也兜一下，让历史功能软退化为"this session only"，不影响搜索本身。
  try {
    if (history.length) {
      storage.setItem(
        ADD_FRIEND_SEARCH_HISTORY_STORAGE_KEY,
        JSON.stringify(history),
      );
    } else {
      storage.removeItem(ADD_FRIEND_SEARCH_HISTORY_STORAGE_KEY);
    }
  } catch {
    // 静默失败：返回的 history 仍是新值，UI 内存里的 pill 会照常显示，只是
    // 下次冷启动 reload 会丢；比让搜索流崩掉好。
  }
  return history;
}

export function loadAddFriendSearchHistory(): AddFriendSearchHistoryItem[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }
  return parse(storage.getItem(ADD_FRIEND_SEARCH_HISTORY_STORAGE_KEY));
}

export function pushAddFriendSearchHistory(keyword: string) {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return loadAddFriendSearchHistory();
  }
  // 搜索本身在 buildAddFriendSearchResults 里走 toLowerCase（normalizedKeyword）
  // —— "Alice" 和 "alice" 命中的角色完全一样。按 lowercase 去重避免历史里
  // 同时存 "Alice" 和 "alice" 两条 pill，删一条另一条还在，看着像没生效。
  // 保留新输入的原大小写让用户看到自己最近一次怎么打的。
  const lowerCased = trimmed.toLowerCase();
  const next = [
    { keyword: trimmed, usedAt: Date.now() },
    ...loadAddFriendSearchHistory().filter(
      (item) => item.keyword.toLowerCase() !== lowerCased,
    ),
  ].slice(0, ADD_FRIEND_SEARCH_HISTORY_LIMIT);
  return write(next);
}

export function removeAddFriendSearchHistory(keyword: string) {
  const next = loadAddFriendSearchHistory().filter(
    (item) => item.keyword !== keyword,
  );
  return write(next);
}

export function clearAddFriendSearchHistory() {
  write([]);
  return [] as AddFriendSearchHistoryItem[];
}
