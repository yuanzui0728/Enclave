import type { ReactNode } from "react";
import {
  emptySearchMatchCounts,
  searchCategoryLabelDescriptors,
  type SearchCategory,
  type SearchMatchCounts,
  type SearchResultItem,
  type SearchResultCategory,
} from "./search-types";

const categoryOrder: Record<SearchResultCategory, number> = {
  messages: 0,
  contacts: 1,
  favorites: 2,
  officialAccounts: 3,
  miniPrograms: 4,
  moments: 5,
  feed: 6,
};

export function normalizeSearchKeyword(keyword: string) {
  return keyword.trim().toLowerCase();
}

export function matchesSearchKeyword(
  item: Pick<SearchResultItem, "title" | "description" | "meta" | "keywords">,
  keyword: string,
) {
  if (!keyword) {
    return true;
  }

  return (
    item.title.toLowerCase().includes(keyword) ||
    item.description.toLowerCase().includes(keyword) ||
    item.meta.toLowerCase().includes(keyword) ||
    item.keywords.includes(keyword)
  );
}

export function getSearchResultMatchRank(
  item: Pick<SearchResultItem, "title" | "description" | "meta" | "keywords">,
  keyword: string,
) {
  if (!keyword) {
    return 0;
  }

  if (item.title.toLowerCase().includes(keyword)) {
    return 0;
  }

  if (item.description.toLowerCase().includes(keyword)) {
    return 1;
  }

  if (item.meta.toLowerCase().includes(keyword)) {
    return 2;
  }

  if (item.keywords.includes(keyword)) {
    return 3;
  }

  return 4;
}

export function sortSearchResults(
  left: SearchResultItem,
  right: SearchResultItem,
  keyword: string,
) {
  const categoryDelta = categoryOrder[left.category] - categoryOrder[right.category];
  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  const rankDelta =
    getSearchResultMatchRank(left, keyword) -
    getSearchResultMatchRank(right, keyword);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  if (left.sortTime !== right.sortTime) {
    return right.sortTime - left.sortTime;
  }

  return left.title.localeCompare(right.title, "zh-CN"); // i18n-ignore-line
}

export function groupSearchResults(results: SearchResultItem[]) {
  return searchCategoryLabelDescriptors
    .filter((item) => item.id !== "all")
    .map((item) => ({
      category: item.id as SearchResultCategory,
      results: results.filter((result) => result.category === item.id),
    }))
    .filter((section) => section.results.length > 0);
}

export function buildSearchMatchCounts(
  results: SearchResultItem[],
): SearchMatchCounts {
  const nextCounts = { ...emptySearchMatchCounts };

  for (const result of results) {
    nextCounts[result.category] += 1;
  }

  return nextCounts;
}

export function buildSearchPreview(text: string, keyword: string) {
  if (!keyword) {
    return text;
  }

  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword);
  if (start === -1) {
    return text;
  }

  const contextRadius = 20;
  let previewStart = Math.max(0, start - contextRadius);
  let previewEnd = Math.min(
    text.length,
    start + keyword.length + contextRadius,
  );
  // 走查新一轮：start ± contextRadius 是任意整数偏移，会落在 UTF-16
  // surrogate pair 的高/低代理之间。emoji（😀 🌹）/ CJK 扩展区 4 字节
  // 字符占两个 code unit；slice 端点落进代理对中间 → 切出残缺代理项
  // 渲染成 □ / ? / 黑色菱形问号。本 helper 用在桌面顶部全局搜索 /
  // mobile useSearchIndex 的消息预览（apps/app/src/routes/search-page.tsx +
  // features/search/desktop-search-launcher.tsx），命中关键词附近一旦
  // 有 emoji 就破。和 desktop-chat-history-panel buildSearchPreview
  // R15 / PreviewAvatar fallback 234f5e76f 同款修法。把切点往外推到下
  // 一个完整 code point 边界，宁可多带一个字符也别把表情切坏。
  if (previewStart > 0 && previewStart < text.length) {
    const code = text.charCodeAt(previewStart);
    if (code >= 0xdc00 && code <= 0xdfff) {
      previewStart -= 1;
    }
  }
  if (previewEnd > 0 && previewEnd < text.length) {
    const code = text.charCodeAt(previewEnd - 1);
    if (code >= 0xd800 && code <= 0xdbff) {
      previewEnd += 1;
    }
  }
  const prefix = previewStart > 0 ? "..." : "";
  const suffix = previewEnd < text.length ? "..." : "";
  return `${prefix}${text.slice(previewStart, previewEnd)}${suffix}`;
}

export function renderHighlightedText(text: string, keyword: string): ReactNode {
  if (!keyword) {
    return text;
  }

  const normalized = text.toLowerCase();
  if (normalized.indexOf(keyword) === -1) {
    return text;
  }

  // 命中可能出现多次（例如搜「我」匹配「我自己 · 我等你」），原先只染第一处，
  // 后面那些跟黑色正文混在一起——用户看着像"高亮 bug"。逐个找出所有 occurrence
  // 拼成 fragment 节点序列，每个 <mark> 都给独立 key（起始位置就足够稳定）。
  const parts: ReactNode[] = [];
  let cursor = 0;
  while (cursor <= text.length) {
    const matchStart = normalized.indexOf(keyword, cursor);
    if (matchStart === -1) {
      if (cursor < text.length) {
        parts.push(text.slice(cursor));
      }
      break;
    }

    if (matchStart > cursor) {
      parts.push(text.slice(cursor, matchStart));
    }

    const matchEnd = matchStart + keyword.length;
    parts.push(
      <mark
        key={`m-${matchStart}`}
        className="rounded bg-[#e6f4ea] px-0.5 text-current"
      >
        {text.slice(matchStart, matchEnd)}
      </mark>,
    );
    cursor = matchEnd;
  }

  return <>{parts}</>;
}

export function filterSearchResults(
  results: SearchResultItem[],
  keyword: string,
  category: SearchCategory,
) {
  if (!keyword) {
    return [] as SearchResultItem[];
  }

  return results
    .filter((item) => {
      if (category !== "all" && item.category !== category) {
        return false;
      }

      return matchesSearchKeyword(item, keyword);
    })
    .sort((left, right) => sortSearchResults(left, right, keyword));
}
