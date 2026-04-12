import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type GameCenterStoredState = {
  activeGameId: string | null;
  recentGameIds: string[];
  pinnedGameIds: string[];
  launchCountById: Record<string, number>;
  lastOpenedAtById: Record<string, string>;
  eventActionStatusById: Record<string, string>;
  lastInviteConversationIdByActivityId: Record<string, string>;
  lastInviteConversationPathByActivityId: Record<string, string>;
  lastInviteConversationTitleByActivityId: Record<string, string>;
  friendInviteStatusByActivityId: Record<string, string>;
  friendInviteSentAtByActivityId: Record<string, string>;
};

const GAME_CENTER_STORAGE_KEY = "yinjie-game-center-state";
const MAX_RECENT_GAMES = 6;
let gameCenterNativeWriteQueue: Promise<void> = Promise.resolve();

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
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
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
    lastInviteConversationIdByActivityId: {
      "activity-lu": "group-weekend",
    },
    lastInviteConversationPathByActivityId: {
      "activity-lu": "/group/group-weekend",
    },
    lastInviteConversationTitleByActivityId: {
      "activity-lu": "周末搭子群",
    },
    friendInviteStatusByActivityId: {
      "activity-lu": "invited",
    },
    friendInviteSentAtByActivityId: {
      "activity-lu": "2026-04-10T11:40:00.000Z",
    },
  };
}

function normalizeGameCenterState(
  state: Partial<GameCenterStoredState> | null | undefined,
): GameCenterStoredState {
  return {
    activeGameId:
      typeof state?.activeGameId === "string" ? state.activeGameId : null,
    recentGameIds: sanitizeIds(state?.recentGameIds).slice(0, MAX_RECENT_GAMES),
    pinnedGameIds: sanitizeIds(state?.pinnedGameIds),
    launchCountById: Object.fromEntries(
      Object.entries(state?.launchCountById ?? {}).filter(
        (entry): entry is [string, number] =>
          typeof entry[0] === "string" && typeof entry[1] === "number",
      ),
    ),
    lastOpenedAtById: sanitizeTimestampRecord(state?.lastOpenedAtById),
    eventActionStatusById: sanitizeTimestampRecord(state?.eventActionStatusById),
    lastInviteConversationIdByActivityId: sanitizeTimestampRecord(
      state?.lastInviteConversationIdByActivityId,
    ),
    lastInviteConversationPathByActivityId: sanitizeTimestampRecord(
      state?.lastInviteConversationPathByActivityId,
    ),
    lastInviteConversationTitleByActivityId: sanitizeTimestampRecord(
      state?.lastInviteConversationTitleByActivityId,
    ),
    friendInviteStatusByActivityId: sanitizeTimestampRecord(
      state?.friendInviteStatusByActivityId,
    ),
    friendInviteSentAtByActivityId: sanitizeTimestampRecord(
      state?.friendInviteSentAtByActivityId,
    ),
  };
}

function parseGameCenterState(raw: string | null | undefined) {
  if (!raw) {
    return getDefaultGameCenterState();
  }

  try {
    return normalizeGameCenterState(JSON.parse(raw) as Partial<GameCenterStoredState>);
  } catch {
    return getDefaultGameCenterState();
  }
}

function getLatestGameCenterTimestamp(state: GameCenterStoredState) {
  return Object.values({
    ...state.lastOpenedAtById,
    ...state.friendInviteSentAtByActivityId,
  }).reduce((latest, value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
  }, 0);
}

function queueNativeGameCenterStateWrite(state: GameCenterStoredState) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(state);
  gameCenterNativeWriteQueue = gameCenterNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_game_center_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

export function readGameCenterState() {
  const storage = getStorage();
  if (!storage) {
    return getDefaultGameCenterState();
  }

  return parseGameCenterState(storage.getItem(GAME_CENTER_STORAGE_KEY));
}

export function writeGameCenterState(
  state: GameCenterStoredState,
  options?: {
    syncNative?: boolean;
  },
) {
  const storage = getStorage();
  if (!storage) {
    return state;
  }

  storage.setItem(GAME_CENTER_STORAGE_KEY, JSON.stringify(state));
  if (options?.syncNative !== false) {
    queueNativeGameCenterStateWrite(state);
  }

  return state;
}

export async function hydrateGameCenterStateFromNative() {
  const localState = readGameCenterState();
  if (!isDesktopRuntimeAvailable()) {
    return localState;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_game_center_store");

    if (!result.exists) {
      queueNativeGameCenterStateWrite(localState);
      return localState;
    }

    const nativeState = parseGameCenterState(result.contents ?? null);
    if (getLatestGameCenterTimestamp(localState) > getLatestGameCenterTimestamp(nativeState)) {
      queueNativeGameCenterStateWrite(localState);
      return localState;
    }

    writeGameCenterState(nativeState, {
      syncNative: false,
    });
    return nativeState;
  } catch {
    return localState;
  }
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
    lastInviteConversationIdByActivityId: state.lastInviteConversationIdByActivityId,
    lastInviteConversationPathByActivityId:
      state.lastInviteConversationPathByActivityId,
    lastInviteConversationTitleByActivityId:
      state.lastInviteConversationTitleByActivityId,
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

export function markGameCenterInviteDelivered(
  state: GameCenterStoredState,
  input: {
    activityId: string;
    conversationId: string;
    conversationPath: string;
    conversationTitle: string;
  },
): GameCenterStoredState {
  return {
    ...state,
    lastInviteConversationIdByActivityId: {
      ...state.lastInviteConversationIdByActivityId,
      [input.activityId]: input.conversationId,
    },
    lastInviteConversationPathByActivityId: {
      ...state.lastInviteConversationPathByActivityId,
      [input.activityId]: input.conversationPath,
    },
    lastInviteConversationTitleByActivityId: {
      ...state.lastInviteConversationTitleByActivityId,
      [input.activityId]: input.conversationTitle,
    },
    friendInviteStatusByActivityId: {
      ...state.friendInviteStatusByActivityId,
      [input.activityId]: "invited",
    },
    friendInviteSentAtByActivityId: {
      ...state.friendInviteSentAtByActivityId,
      [input.activityId]: new Date().toISOString(),
    },
  };
}
