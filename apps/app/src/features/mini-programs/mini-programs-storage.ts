export type MiniProgramsStoredState = {
  activeMiniProgramId: string | null;
  recentMiniProgramIds: string[];
  pinnedMiniProgramIds: string[];
  launchCountById: Record<string, number>;
  lastOpenedAtById: Record<string, string>;
  completedTaskIdsByMiniProgramId: Record<string, string[]>;
  groupRelayPublishCountBySourceGroupId: Record<string, number>;
};

const MINI_PROGRAMS_STORAGE_KEY = "yinjie-mini-programs-state";
const MAX_RECENT_MINI_PROGRAMS = 8;

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

function sanitizeStringArrayRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, string[]>;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap((entry) => {
      if (typeof entry[0] !== "string" || !Array.isArray(entry[1])) {
        return [];
      }

      return [
        [
          entry[0],
          entry[1].filter((item): item is string => typeof item === "string"),
        ] as const,
      ];
    }),
  );
}

function sanitizeNumberRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, number>;
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[0] === "string" && typeof entry[1] === "number",
    ),
  );
}

export function getDefaultMiniProgramsState(): MiniProgramsStoredState {
  return {
    activeMiniProgramId: "schedule-assistant",
    recentMiniProgramIds: [
      "schedule-assistant",
      "group-relay",
      "resident-services",
      "file-drop",
    ],
    pinnedMiniProgramIds: [
      "schedule-assistant",
      "file-drop",
      "world-map",
      "read-later",
    ],
    launchCountById: {
      "schedule-assistant": 11,
      "group-relay": 6,
      "resident-services": 4,
      "file-drop": 8,
      "world-map": 3,
      "read-later": 5,
    },
    lastOpenedAtById: {
      "schedule-assistant": "2026-04-10T15:08:00.000Z",
      "group-relay": "2026-04-10T12:46:00.000Z",
      "resident-services": "2026-04-10T10:18:00.000Z",
      "file-drop": "2026-04-09T21:05:00.000Z",
      "world-map": "2026-04-09T18:42:00.000Z",
      "read-later": "2026-04-09T14:20:00.000Z",
    },
    completedTaskIdsByMiniProgramId: {
      "schedule-assistant": ["review-today"],
      "file-drop": ["sort-temp-files"],
      "read-later": ["sort-by-source"],
    },
    groupRelayPublishCountBySourceGroupId: {},
  };
}

export function readMiniProgramsState() {
  const storage = getStorage();
  if (!storage) {
    return getDefaultMiniProgramsState();
  }

  const raw = storage.getItem(MINI_PROGRAMS_STORAGE_KEY);
  if (!raw) {
    return getDefaultMiniProgramsState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MiniProgramsStoredState>;
    return {
      activeMiniProgramId:
        typeof parsed.activeMiniProgramId === "string"
          ? parsed.activeMiniProgramId
          : null,
      recentMiniProgramIds: sanitizeIds(parsed.recentMiniProgramIds).slice(
        0,
        MAX_RECENT_MINI_PROGRAMS,
      ),
      pinnedMiniProgramIds: sanitizeIds(parsed.pinnedMiniProgramIds),
      launchCountById: Object.fromEntries(
        Object.entries(parsed.launchCountById ?? {}).filter(
          (entry): entry is [string, number] =>
            typeof entry[0] === "string" && typeof entry[1] === "number",
        ),
      ),
      lastOpenedAtById: sanitizeTimestampRecord(parsed.lastOpenedAtById),
      completedTaskIdsByMiniProgramId: sanitizeStringArrayRecord(
        parsed.completedTaskIdsByMiniProgramId,
      ),
      groupRelayPublishCountBySourceGroupId: sanitizeNumberRecord(
        parsed.groupRelayPublishCountBySourceGroupId,
      ),
    };
  } catch {
    return getDefaultMiniProgramsState();
  }
}

export function writeMiniProgramsState(state: MiniProgramsStoredState) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(MINI_PROGRAMS_STORAGE_KEY, JSON.stringify(state));
}

export function markMiniProgramOpened(
  state: MiniProgramsStoredState,
  miniProgramId: string,
): MiniProgramsStoredState {
  const openedAt = new Date().toISOString();

  return {
    activeMiniProgramId: miniProgramId,
    recentMiniProgramIds: [
      miniProgramId,
      ...state.recentMiniProgramIds.filter((id) => id !== miniProgramId),
    ].slice(0, MAX_RECENT_MINI_PROGRAMS),
    pinnedMiniProgramIds: state.pinnedMiniProgramIds,
    launchCountById: {
      ...state.launchCountById,
      [miniProgramId]: (state.launchCountById[miniProgramId] ?? 0) + 1,
    },
    lastOpenedAtById: {
      ...state.lastOpenedAtById,
      [miniProgramId]: openedAt,
    },
    completedTaskIdsByMiniProgramId: state.completedTaskIdsByMiniProgramId,
    groupRelayPublishCountBySourceGroupId:
      state.groupRelayPublishCountBySourceGroupId,
  };
}

export function togglePinnedMiniProgram(
  state: MiniProgramsStoredState,
  miniProgramId: string,
): MiniProgramsStoredState {
  const alreadyPinned = state.pinnedMiniProgramIds.includes(miniProgramId);

  return {
    ...state,
    pinnedMiniProgramIds: alreadyPinned
      ? state.pinnedMiniProgramIds.filter((id) => id !== miniProgramId)
      : [miniProgramId, ...state.pinnedMiniProgramIds],
  };
}

export function dismissActiveMiniProgram(
  state: MiniProgramsStoredState,
): MiniProgramsStoredState {
  return {
    ...state,
    activeMiniProgramId: null,
  };
}

export function toggleMiniProgramTaskCompletion(
  state: MiniProgramsStoredState,
  input: {
    miniProgramId: string;
    taskId: string;
  },
): MiniProgramsStoredState {
  const currentTaskIds =
    state.completedTaskIdsByMiniProgramId[input.miniProgramId] ?? [];
  const completed = currentTaskIds.includes(input.taskId);

  return {
    ...state,
    completedTaskIdsByMiniProgramId: {
      ...state.completedTaskIdsByMiniProgramId,
      [input.miniProgramId]: completed
        ? currentTaskIds.filter((taskId) => taskId !== input.taskId)
        : [...currentTaskIds, input.taskId],
    },
  };
}

export function recordGroupRelayPublish(
  state: MiniProgramsStoredState,
  sourceGroupId: string,
): MiniProgramsStoredState {
  if (!sourceGroupId.trim()) {
    return state;
  }

  return {
    ...state,
    groupRelayPublishCountBySourceGroupId: {
      ...state.groupRelayPublishCountBySourceGroupId,
      [sourceGroupId]:
        (state.groupRelayPublishCountBySourceGroupId[sourceGroupId] ?? 0) + 1,
    },
  };
}
