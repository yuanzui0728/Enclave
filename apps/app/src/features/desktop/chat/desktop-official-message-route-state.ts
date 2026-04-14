export type DesktopOfficialMessageRouteState = {
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
  const articleId = params.get("articleId")?.trim();

  return articleId ? { articleId } : {};
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
