export type DesktopOfficialMessageRouteState = {
  officialView?: "subscription-inbox" | "service-account";
  accountId?: string;
  articleId?: string;
};

export function parseDesktopOfficialMessageRouteHash(
  hash: string,
): DesktopOfficialMessageRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const officialView = params.get("officialView")?.trim();
  const accountId = params.get("accountId")?.trim() || undefined;
  const articleId = params.get("articleId")?.trim();

  if (
    officialView !== "subscription-inbox" &&
    officialView !== "service-account"
  ) {
    return articleId ? { articleId } : {};
  }

  return {
    officialView,
    accountId: officialView === "service-account" ? accountId : undefined,
    articleId: articleId || undefined,
  };
}

export function resolveDesktopSubscriptionMessageArticleId(
  state: DesktopOfficialMessageRouteState,
) {
  if (!state.articleId) {
    return undefined;
  }

  if (!state.officialView) {
    return state.articleId;
  }

  return state.officialView === "subscription-inbox"
    ? state.articleId
    : undefined;
}

export function resolveDesktopServiceMessageArticleId(
  state: DesktopOfficialMessageRouteState,
  accountId: string | undefined,
) {
  if (!state.articleId) {
    return undefined;
  }

  if (!state.officialView) {
    return state.articleId;
  }

  return state.officialView === "service-account" &&
    state.accountId === accountId
    ? state.articleId
    : undefined;
}

export function buildDesktopOfficialMessageRouteHash(
  state: DesktopOfficialMessageRouteState,
) {
  if (!state.articleId?.trim()) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("articleId", state.articleId.trim());
  return params.toString();
}
