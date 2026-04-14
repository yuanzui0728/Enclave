export type DesktopChatOfficialView =
  | "subscription-inbox"
  | "service-account"
  | "official-accounts";

export type DesktopChatRouteState = {
  officialView?: DesktopChatOfficialView;
  accountId?: string;
  articleId?: string;
};

export function parseDesktopChatRouteHash(hash: string): DesktopChatRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const officialView = params.get("officialView")?.trim();
  const accountId = params.get("accountId")?.trim() || undefined;
  const articleId = params.get("articleId")?.trim() || undefined;

  if (
    officialView !== "subscription-inbox" &&
    officialView !== "service-account" &&
    officialView !== "official-accounts"
  ) {
    return {};
  }

  return {
    officialView,
    accountId,
    articleId,
  };
}

export function buildDesktopChatRouteHash(state: DesktopChatRouteState) {
  if (!state.officialView) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("officialView", state.officialView);

  if (state.accountId?.trim()) {
    params.set("accountId", state.accountId.trim());
  }

  if (state.articleId?.trim()) {
    params.set("articleId", state.articleId.trim());
  }

  return params.toString();
}
