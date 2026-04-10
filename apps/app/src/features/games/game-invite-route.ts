import {
  gameCenterFriendActivities,
  getGameCenterGame,
} from "./game-center-data";

type BuildGameInvitePathInput = {
  gameId?: string;
  inviteId?: string;
};

export type GameInviteRouteContext = {
  actionLabel: string;
  description: string;
  gameId: string;
  inviteId?: string;
  returnPath: string;
};

export function buildGameInvitePath(
  basePath: string,
  input: BuildGameInvitePathInput,
) {
  const params = new URLSearchParams();

  if (input.gameId) {
    params.set("game", input.gameId);
  }

  if (input.inviteId) {
    params.set("invite", input.inviteId);
  }

  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

export function resolveGameInviteRouteContext(
  search: string,
): GameInviteRouteContext | null {
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
      }),
    };
  }

  return {
    actionLabel: "回到游戏",
    description: `这条会话来自《${game.name}》的游戏中心接力。`,
    gameId: game.id,
    returnPath: buildGameInvitePath("/discover/games", {
      gameId: game.id,
    }),
  };
}
