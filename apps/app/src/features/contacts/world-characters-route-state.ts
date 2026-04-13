export type WorldCharactersRouteState = {
  keyword: string;
};

const DEFAULT_WORLD_CHARACTERS_ROUTE_STATE: WorldCharactersRouteState = {
  keyword: "",
};

export function parseWorldCharactersRouteState(
  hash: string,
): WorldCharactersRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return DEFAULT_WORLD_CHARACTERS_ROUTE_STATE;
  }

  const params = new URLSearchParams(normalizedHash);
  return {
    keyword: params.get("q")?.trim() ?? "",
  };
}

export function buildWorldCharactersRouteHash(
  state: WorldCharactersRouteState,
) {
  const params = new URLSearchParams();
  const keyword = state.keyword.trim();

  if (keyword) {
    params.set("q", keyword);
  }

  return params.toString() || undefined;
}
