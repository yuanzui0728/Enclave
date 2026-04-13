export type DesktopAddFriendRouteState = {
  keyword: string;
  characterId?: string;
  openCompose?: boolean;
};

const DEFAULT_DESKTOP_ADD_FRIEND_ROUTE_STATE: DesktopAddFriendRouteState = {
  keyword: "",
  characterId: undefined,
  openCompose: false,
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
    characterId: params.get("characterId")?.trim() || undefined,
    openCompose: params.get("compose") === "1",
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

  if (state.characterId?.trim()) {
    params.set("characterId", state.characterId.trim());
  }

  if (state.openCompose) {
    params.set("compose", "1");
  }

  return params.toString() || undefined;
}
