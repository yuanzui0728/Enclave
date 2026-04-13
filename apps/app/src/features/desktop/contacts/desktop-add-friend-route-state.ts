export type DesktopAddFriendRouteState = {
  keyword: string;
};

const DEFAULT_DESKTOP_ADD_FRIEND_ROUTE_STATE: DesktopAddFriendRouteState = {
  keyword: "",
};

export function parseDesktopAddFriendRouteState(
  hash: string,
): DesktopAddFriendRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return DEFAULT_DESKTOP_ADD_FRIEND_ROUTE_STATE;
  }

  const params = new URLSearchParams(normalizedHash);
  return {
    keyword: params.get("q")?.trim() ?? "",
  };
}

export function buildDesktopAddFriendRouteHash(
  state: DesktopAddFriendRouteState,
) {
  const params = new URLSearchParams();
  const keyword = state.keyword.trim();

  if (keyword) {
    params.set("q", keyword);
  }

  return params.toString() || undefined;
}
