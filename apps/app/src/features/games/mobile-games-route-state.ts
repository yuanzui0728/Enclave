import { gameCenterFriendActivities, getGameCenterGame } from "./game-center-data";
import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileGamesRouteState = {
  gameId?: string;
  inviteId?: string;
  returnHash?: string;
  returnPath?: string;
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

export function parseMobileGamesRouteSearch(
  search: unknown,
): MobileGamesRouteState {
  const searchString = typeof search === "string" ? search : "";
  const normalizedSearch = searchString.startsWith("?")
    ? searchString.slice(1)
    : searchString;
  if (!normalizedSearch) {
    return {};
  }

  const params = new URLSearchParams(normalizedSearch);
  const inviteId = params.get("invite")?.trim() ?? "";
  const inviteActivity = inviteId
    ? gameCenterFriendActivities.find((item) => item.id === inviteId) ?? null
    : null;
  const gameId = inviteActivity?.gameId ?? params.get("game")?.trim() ?? "";
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    ...(gameId && getGameCenterGame(gameId) ? { gameId } : {}),
    ...(inviteActivity ? { inviteId: inviteActivity.id } : {}),
    ...(returnPath ? { returnPath } : {}),
    ...(returnPath && normalizeHash(params.get("returnHash"))
      ? { returnHash: normalizeHash(params.get("returnHash")) }
      : {}),
  };
}

export function buildMobileGamesRouteSearch(state: MobileGamesRouteState) {
  const params = new URLSearchParams();
  const inviteId = state.inviteId?.trim() ?? "";
  const inviteActivity = inviteId
    ? gameCenterFriendActivities.find((item) => item.id === inviteId) ?? null
    : null;
  const gameId = state.gameId?.trim() ?? "";
  const returnPath = normalizeReturnPath(state.returnPath);
  const returnHash = normalizeHash(state.returnHash);

  if (gameId && getGameCenterGame(gameId)) {
    params.set("game", gameId);
  }

  if (inviteActivity) {
    params.set("invite", inviteActivity.id);
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  const search = params.toString();
  return search ? `?${search}` : undefined;
}
