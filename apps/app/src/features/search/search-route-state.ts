import {
  searchCategoryLabels,
  type SearchCategory,
} from "./search-types";

export type SearchRouteState = {
  category: SearchCategory;
  keyword: string;
};

const DEFAULT_SEARCH_ROUTE_STATE: SearchRouteState = {
  category: "all",
  keyword: "",
};

const validSearchCategories = new Set(
  searchCategoryLabels.map((item) => item.id),
);

export function parseSearchRouteState(hash: string): SearchRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return DEFAULT_SEARCH_ROUTE_STATE;
  }

  const params = new URLSearchParams(normalizedHash);
  const keyword = params.get("q")?.trim() ?? "";
  const category = params.get("category")?.trim();

  if (!category || !validSearchCategories.has(category as SearchCategory)) {
    return {
      ...DEFAULT_SEARCH_ROUTE_STATE,
      keyword,
    };
  }

  return {
    category: category as SearchCategory,
    keyword,
  };
}

export function buildSearchRouteHash(state: SearchRouteState) {
  const params = new URLSearchParams();
  const keyword = state.keyword.trim();

  if (keyword) {
    params.set("q", keyword);
  }

  if (state.category !== "all") {
    params.set("category", state.category);
  }

  return params.toString() || undefined;
}
