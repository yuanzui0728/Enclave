import type { ReactNode } from "react";
import {
  emptySearchMatchCounts,
  searchCategoryLabels,
  type SearchCategory,
  type SearchMatchCounts,
  type SearchResultItem,
  type SearchResultCategory,
} from "./search-types";

const categoryOrder: Record<SearchResultCategory, number> = {
  messages: 0,
  contacts: 1,
  officialAccounts: 2,
  moments: 3,
  feed: 4,
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

  return left.title.localeCompare(right.title, "zh-CN");
}

export function groupSearchResults(results: SearchResultItem[]) {
  return searchCategoryLabels
    .filter((item) => item.id !== "all")
    .map((item) => ({
      category: item.id as SearchResultCategory,
      label: item.label,
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
  const previewStart = Math.max(0, start - contextRadius);
  const previewEnd = Math.min(
    text.length,
    start + keyword.length + contextRadius,
  );
  const prefix = previewStart > 0 ? "..." : "";
  const suffix = previewEnd < text.length ? "..." : "";
  return `${prefix}${text.slice(previewStart, previewEnd)}${suffix}`;
}

export function renderHighlightedText(text: string, keyword: string): ReactNode {
  if (!keyword) {
    return text;
  }

  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword);
  if (start === -1) {
    return text;
  }

  const end = start + keyword.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-[rgba(255,214,102,0.5)] px-0.5 text-current">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
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
