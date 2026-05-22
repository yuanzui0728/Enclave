import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

const t = translateRuntimeMessage;
export type SearchResultCategory =
  | "messages"
  | "contacts"
  | "favorites"
  | "officialAccounts"
  | "miniPrograms"
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
  search?: string;
  hash?: string;
  badge: string;
  avatarName?: string;
  avatarSrc?: string;
  sortTime: number;
};

export type SearchMatchCounts = Record<SearchResultCategory, number>;

export type SearchResultSection = {
  category: SearchResultCategory;
  results: SearchResultItem[];
};

export type SearchMessageGroup = {
  id: string;
  header: SearchResultItem;
  messages: SearchResultItem[];
  sortTime: number;
  totalHits: number;
};

export type SearchOfficialAccountGroup = {
  id: string;
  header: SearchResultItem;
  articles: SearchResultItem[];
  sortTime: number;
  totalHits: number;
};

export type SearchScopeCounts = {
  conversations: number;
  contacts: number;
  favorites: number;
  officialAccounts: number;
  miniPrograms: number;
  moments: number;
  feed: number;
};

export type SearchHistoryItem = {
  keyword: string;
  usedAt: number;
};

import type { MessageDescriptor } from "@lingui/core";
import { useCallback } from "react";
import { useRuntimeTranslator } from "@yinjie/i18n";

// officialAccounts / miniPrograms 暂时从搜索 UI 隐藏（chip / 标题 / 路由白名单
// 全走这几个 descriptor 数组派生）：公众号入口先不接、小程序整段还是「敬请期待」
// 挂个 chip 反像 broken feature。类型联合 SearchResultCategory 等保留这两个
// 成员是有意的——日后想恢复只要把对应条目塞回 4 个数组并解开两条
// useQuery 即可，不需要重建数据契约。
export const searchCategoryLabels: Array<{
  id: SearchCategory;
  label: string;
}> = [
  { id: "all", label: t(msg`全部`) },
  { id: "messages", label: t(msg`聊天记录`) },
  { id: "contacts", label: t(msg`联系人`) },
  { id: "favorites", label: t(msg`收藏`) },
  { id: "moments", label: t(msg`朋友圈`) },
  { id: "feed", label: t(msg`广场动态`) },
];

export const searchCategoryTitles: Record<SearchResultCategory, string> = {
  messages: t(msg`聊天记录`),
  contacts: t(msg`联系人`),
  favorites: t(msg`收藏`),
  // officialAccounts / miniPrograms 保留键位但运行时不会被命中——
  // allMatchedResults 里相关结果块全砍了，scopeCounts 永远 0。
  officialAccounts: t(msg`公众号`),
  miniPrograms: t(msg`小程序`),
  moments: t(msg`朋友圈`),
  feed: t(msg`广场动态`),
};

export const searchCategoryLabelDescriptors: Array<{
  id: SearchCategory;
  label: MessageDescriptor;
}> = [
  { id: "all", label: msg`全部` },
  { id: "messages", label: msg`聊天记录` },
  { id: "contacts", label: msg`联系人` },
  { id: "favorites", label: msg`收藏` },
  { id: "moments", label: msg`朋友圈` },
  { id: "feed", label: msg`广场动态` },
];

export const searchCategoryTitleDescriptors: Record<
  SearchResultCategory,
  MessageDescriptor
> = {
  messages: msg`聊天记录`,
  contacts: msg`联系人`,
  favorites: msg`收藏`,
  officialAccounts: msg`公众号`,
  miniPrograms: msg`小程序`,
  moments: msg`朋友圈`,
  feed: msg`广场动态`,
};

export function useSearchCategoryLabels(): Array<{
  id: SearchCategory;
  label: string;
}> {
  const t = useRuntimeTranslator();
  return searchCategoryLabelDescriptors.map((entry) => ({
    id: entry.id,
    label: t(entry.label),
  }));
}

export function useSearchCategoryTitle() {
  const t = useRuntimeTranslator();
  return useCallback(
    (category: SearchResultCategory) => t(searchCategoryTitleDescriptors[category]),
    [t],
  );
}

export const emptySearchMatchCounts: SearchMatchCounts = {
  messages: 0,
  contacts: 0,
  favorites: 0,
  officialAccounts: 0,
  miniPrograms: 0,
  moments: 0,
  feed: 0,
};

export const emptySearchScopeCounts: SearchScopeCounts = {
  conversations: 0,
  contacts: 0,
  favorites: 0,
  officialAccounts: 0,
  miniPrograms: 0,
  moments: 0,
  feed: 0,
};
