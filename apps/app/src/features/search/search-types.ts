export type SearchResultCategory =
  | "messages"
  | "contacts"
  | "officialAccounts"
  | "moments"
  | "feed";

export type SearchCategory = "all" | SearchResultCategory;

export type SearchResultItem = {
  id: string;
  category: SearchResultCategory;
  title: string;
  description: string;
  meta: string;
  keywords: string;
  to: string;
  hash?: string;
  badge: string;
  avatarName?: string;
  avatarSrc?: string;
  sortTime: number;
};

export type SearchMatchCounts = Record<SearchResultCategory, number>;

export type SearchScopeCounts = {
  conversations: number;
  contacts: number;
  officialAccounts: number;
  moments: number;
  feed: number;
};

export type SearchHistoryItem = {
  keyword: string;
  usedAt: number;
};

export const searchCategoryLabels: Array<{
  id: SearchCategory;
  label: string;
}> = [
  { id: "all", label: "全部" },
  { id: "messages", label: "聊天记录" },
  { id: "contacts", label: "联系人" },
  { id: "officialAccounts", label: "公众号" },
  { id: "moments", label: "朋友圈" },
  { id: "feed", label: "广场动态" },
];

export const searchCategoryTitles: Record<SearchResultCategory, string> = {
  messages: "聊天记录",
  contacts: "联系人",
  officialAccounts: "公众号",
  moments: "朋友圈",
  feed: "广场动态",
};

export const emptySearchMatchCounts: SearchMatchCounts = {
  messages: 0,
  contacts: 0,
  officialAccounts: 0,
  moments: 0,
  feed: 0,
};

export const emptySearchScopeCounts: SearchScopeCounts = {
  conversations: 0,
  contacts: 0,
  officialAccounts: 0,
  moments: 0,
  feed: 0,
};
