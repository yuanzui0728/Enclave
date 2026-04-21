import { isDesktopOnlyPath } from "../../lib/history-back";

export type WorldCharactersRouteState = {
  keyword: string;
  returnPath?: string;
  returnHash?: string;
};

const DEFAULT_WORLD_CHARACTERS_ROUTE_STATE: WorldCharactersRouteState = {
  keyword: "",
};

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    isDesktopOnlyPath(nextValue)
  ) {
    return undefined;
  }

  return nextValue;
}

function normalizeHash(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return undefined;
  }

  return nextValue.startsWith("#") ? nextValue.slice(1) : nextValue;
}

export function parseWorldCharactersRouteState(
  hash: string,
): WorldCharactersRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return DEFAULT_WORLD_CHARACTERS_ROUTE_STATE;
  }

  const params = new URLSearchParams(normalizedHash);
  const returnPath = normalizeReturnPath(params.get("returnPath"));
  return {
    keyword: params.get("q")?.trim() ?? "",
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
  };
}

export function buildWorldCharactersRouteHash(
  state: WorldCharactersRouteState,
) {
  const params = new URLSearchParams();
  const keyword = state.keyword.trim();
  const returnPath = normalizeReturnPath(state.returnPath);

  if (keyword) {
    params.set("q", keyword);
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  const returnHash = normalizeHash(state.returnHash);
  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  return params.toString() || undefined;
}
