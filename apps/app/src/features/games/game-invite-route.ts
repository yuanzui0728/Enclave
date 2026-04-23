import {
  gameCenterFriendActivities,
  getGameCenterGame,
} from "./game-center-data";
import { isDesktopOnlyPath } from "../../lib/history-back";
import { normalizePathname } from "../../lib/normalize-pathname";
import { parseMobileGamesRouteSearch } from "./mobile-games-route-state";

type BuildGameInvitePathInput = {
  gameId?: string;
  inviteId?: string;
  returnHash?: string;
  returnPath?: string;
};

export type GameInviteRouteContext = {
  actionLabel: string;
  description: string;
  gameId: string;
  inviteId?: string;
  returnPath: string;
};

export function normalizeDesktopGameInviteReturnPath(
  path: string,
  isDesktopLayout: boolean,
) {
  if (!isDesktopLayout) {
    return path;
  }

  const [pathname, ...searchParts] = path.split("?");
  const normalizedPathname = normalizePathname(pathname);
  if (
    normalizedPathname !== "/games" &&
    normalizedPathname !== "/discover/games"
  ) {
    return path;
  }

  const search = searchParts.join("?");
  return search ? `/tabs/games?${search}` : "/tabs/games";
}

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    isDesktopOnlyPath(nextValue)
  ) {
    return undefined;
  }

  return normalizePathname(nextValue);
}

function normalizeHash(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return undefined;
  }

  return nextValue.startsWith("#") ? nextValue.slice(1) : nextValue;
}

export function buildGameInvitePath(
  basePath: string,
  input: BuildGameInvitePathInput,
) {
  const params = new URLSearchParams();
  const returnPath = normalizeReturnPath(input.returnPath);
  const returnHash = normalizeHash(input.returnHash);

  if (input.gameId) {
    params.set("game", input.gameId);
  }

  if (input.inviteId) {
    params.set("invite", input.inviteId);
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

export function resolveGameInviteRouteContext(
  search: string,
): GameInviteRouteContext | null {
  const routeState = parseMobileGamesRouteSearch(search);
  const params = new URLSearchParams(search);
  const inviteId = params.get("invite")?.trim() || undefined;
  const activity = inviteId
    ? gameCenterFriendActivities.find((item) => item.id === inviteId)
    : undefined;
  const searchGameId = params.get("game")?.trim() || undefined;
  const gameId = activity?.gameId ?? searchGameId;
  const game = gameId ? getGameCenterGame(gameId) : null;
  if (!game) {
    return null;
  }

  if (activity) {
    return {
      actionLabel: "回到组局",
      description: `这条会话来自 ${activity.friendName} 的《${game.name}》组局邀约。`,
      gameId: game.id,
      inviteId: activity.id,
      returnPath: buildGameInvitePath("/discover/games", {
        gameId: game.id,
        inviteId: activity.id,
        returnPath: routeState.returnPath,
        returnHash: routeState.returnHash,
      }),
    };
  }

  return {
    actionLabel: "回到游戏",
    description: `这条会话来自《${game.name}》的游戏中心接力。`,
    gameId: game.id,
    returnPath: buildGameInvitePath("/discover/games", {
      gameId: game.id,
      returnPath: routeState.returnPath,
      returnHash: routeState.returnHash,
    }),
  };
}
