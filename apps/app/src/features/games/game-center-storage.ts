export type GameCenterStoredState = {
  activeGameId: string | null;
  recentGameIds: string[];
  pinnedGameIds: string[];
  launchCountById: Record<string, number>;
  lastOpenedAtById: Record<string, string>;
  eventActionStatusById: Record<string, string>;
  friendInviteStatusByActivityId: Record<string, string>;
  friendInviteSentAtByActivityId: Record<string, string>;
};

const GAME_CENTER_STORAGE_KEY = "yinjie-game-center-state";
const MAX_RECENT_GAMES = 6;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function sanitizeIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function sanitizeTimestampRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, string>;
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

export function getDefaultGameCenterState(): GameCenterStoredState {
  return {
    activeGameId: "signal-squad",
    recentGameIds: ["signal-squad", "night-market", "cat-inn"],
    pinnedGameIds: ["signal-squad", "cloud-farm"],
    launchCountById: {
      "signal-squad": 8,
      "night-market": 5,
      "cat-inn": 2,
      "cloud-farm": 4,
    },
    lastOpenedAtById: {
      "signal-squad": "2026-04-10T14:18:00.000Z",
      "night-market": "2026-04-10T12:36:00.000Z",
      "cat-inn": "2026-04-09T19:22:00.000Z",
      "cloud-farm": "2026-04-08T20:10:00.000Z",
    },
    eventActionStatusById: {
      "market-night": "reminder_set",
    },
    friendInviteStatusByActivityId: {
      "activity-lu": "invited",
    },
    friendInviteSentAtByActivityId: {
      "activity-lu": "2026-04-10T11:40:00.000Z",
    },
  };
}

export function readGameCenterState() {
  const storage = getStorage();
  if (!storage) {
    return getDefaultGameCenterState();
  }

  const raw = storage.getItem(GAME_CENTER_STORAGE_KEY);
  if (!raw) {
    return getDefaultGameCenterState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GameCenterStoredState>;
    return {
      activeGameId: typeof parsed.activeGameId === "string" ? parsed.activeGameId : null,
      recentGameIds: sanitizeIds(parsed.recentGameIds).slice(0, MAX_RECENT_GAMES),
      pinnedGameIds: sanitizeIds(parsed.pinnedGameIds),
      launchCountById: Object.fromEntries(
        Object.entries(parsed.launchCountById ?? {}).filter(
          (entry): entry is [string, number] =>
            typeof entry[0] === "string" && typeof entry[1] === "number",
        ),
      ),
      lastOpenedAtById: sanitizeTimestampRecord(parsed.lastOpenedAtById),
      eventActionStatusById: sanitizeTimestampRecord(parsed.eventActionStatusById),
      friendInviteStatusByActivityId: sanitizeTimestampRecord(
        parsed.friendInviteStatusByActivityId,
      ),
      friendInviteSentAtByActivityId: sanitizeTimestampRecord(
        parsed.friendInviteSentAtByActivityId,
      ),
    };
  } catch {
    return getDefaultGameCenterState();
  }
}

export function writeGameCenterState(state: GameCenterStoredState) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(GAME_CENTER_STORAGE_KEY, JSON.stringify(state));
}

export function markGameOpened(
  state: GameCenterStoredState,
  gameId: string,
): GameCenterStoredState {
  const openedAt = new Date().toISOString();
  return {
    activeGameId: gameId,
    recentGameIds: [gameId, ...state.recentGameIds.filter((id) => id !== gameId)].slice(
      0,
      MAX_RECENT_GAMES,
    ),
    pinnedGameIds: state.pinnedGameIds,
    launchCountById: {
      ...state.launchCountById,
      [gameId]: (state.launchCountById[gameId] ?? 0) + 1,
    },
    lastOpenedAtById: {
      ...state.lastOpenedAtById,
      [gameId]: openedAt,
    },
    eventActionStatusById: state.eventActionStatusById,
    friendInviteStatusByActivityId: state.friendInviteStatusByActivityId,
    friendInviteSentAtByActivityId: state.friendInviteSentAtByActivityId,
  };
}

export function togglePinnedGame(
  state: GameCenterStoredState,
  gameId: string,
): GameCenterStoredState {
  const alreadyPinned = state.pinnedGameIds.includes(gameId);
  return {
    ...state,
    pinnedGameIds: alreadyPinned
      ? state.pinnedGameIds.filter((id) => id !== gameId)
      : [gameId, ...state.pinnedGameIds],
  };
}

export function dismissActiveGame(state: GameCenterStoredState): GameCenterStoredState {
  return {
    ...state,
    activeGameId: null,
  };
}

export function markGameCenterEventAction(
  state: GameCenterStoredState,
  input: {
    eventId: string;
    status: string;
  },
): GameCenterStoredState {
  return {
    ...state,
    eventActionStatusById: {
      ...state.eventActionStatusById,
      [input.eventId]: input.status,
    },
  };
}

export function markGameCenterFriendInvite(
  state: GameCenterStoredState,
  input: {
    activityId: string;
    status: string;
  },
): GameCenterStoredState {
  return {
    ...state,
    friendInviteStatusByActivityId: {
      ...state.friendInviteStatusByActivityId,
      [input.activityId]: input.status,
    },
    friendInviteSentAtByActivityId: {
      ...state.friendInviteSentAtByActivityId,
      [input.activityId]: new Date().toISOString(),
    },
  };
}
