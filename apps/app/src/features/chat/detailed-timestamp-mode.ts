import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type DetailedTimestampModeState = {
  enabled: boolean;
  updatedAt: string | null;
};

const DETAILED_TIMESTAMP_MODE_STORAGE_KEY = "chat-detailed-timestamp-mode";
const DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY =
  "chat-detailed-timestamp-mode-updated-at";
const defaultState: DetailedTimestampModeState = {
  enabled: false,
  updatedAt: null,
};
let detailedTimestampModeNativeWriteQueue: Promise<void> = Promise.resolve();

function normalizeState(
  value?: Partial<DetailedTimestampModeState> | null,
): DetailedTimestampModeState {
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : false,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  };
}

function parseState(raw: string | null | undefined) {
  if (!raw) {
    return defaultState;
  }

  if (raw === "1" || raw === "0") {
    return {
      enabled: raw === "1",
      updatedAt: null,
    } satisfies DetailedTimestampModeState;
  }

  try {
    return normalizeState(JSON.parse(raw) as Partial<DetailedTimestampModeState>);
  } catch {
    return defaultState;
  }
}

function readLocalState() {
  if (typeof window === "undefined") {
    return defaultState;
  }

  const raw = window.localStorage.getItem(DETAILED_TIMESTAMP_MODE_STORAGE_KEY);
  const rawUpdatedAt = window.localStorage.getItem(
    DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY,
  );
  const parsed = parseState(raw);

  if (parsed.updatedAt) {
    return parsed;
  }

  return normalizeState({
    ...parsed,
    updatedAt: rawUpdatedAt,
  });
}

function hasStateData(state: DetailedTimestampModeState) {
  return state.enabled || state.updatedAt !== null;
}

function getStateTimestamp(state: DetailedTimestampModeState) {
  const timestamp = Date.parse(state.updatedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function queueNativeWrite(state: DetailedTimestampModeState) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(state);
  detailedTimestampModeNativeWriteQueue = detailedTimestampModeNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_detailed_timestamp_mode_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

function writeLocalState(
  state: DetailedTimestampModeState,
  options?: {
    syncNative?: boolean;
  },
) {
  if (typeof window !== "undefined") {
    if (hasStateData(state)) {
      window.localStorage.setItem(
        DETAILED_TIMESTAMP_MODE_STORAGE_KEY,
        state.enabled ? "1" : "0",
      );
      if (state.updatedAt) {
        window.localStorage.setItem(
          DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY,
          state.updatedAt,
        );
      } else {
        window.localStorage.removeItem(
          DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY,
        );
      }
    } else {
      window.localStorage.removeItem(DETAILED_TIMESTAMP_MODE_STORAGE_KEY);
      window.localStorage.removeItem(
        DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY,
      );
    }
  }

  if (options?.syncNative !== false) {
    queueNativeWrite(state);
  }

  return state;
}

export function readDetailedTimestampModeEnabled() {
  return readLocalState().enabled;
}

export function writeDetailedTimestampModeEnabled(enabled: boolean) {
  return writeLocalState({
    enabled,
    updatedAt: new Date().toISOString(),
  });
}

export async function hydrateDetailedTimestampModeFromNative() {
  const localState = readLocalState();
  if (!isDesktopRuntimeAvailable()) {
    return localState;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_detailed_timestamp_mode_store");

    if (!result.exists) {
      if (hasStateData(localState)) {
        queueNativeWrite(localState);
      }
      return localState;
    }

    const nativeState = parseState(result.contents ?? null);
    if (getStateTimestamp(localState) > getStateTimestamp(nativeState)) {
      if (hasStateData(localState)) {
        queueNativeWrite(localState);
      }
      return localState;
    }

    if (
      getStateTimestamp(localState) === getStateTimestamp(nativeState) &&
      hasStateData(localState) &&
      !hasStateData(nativeState)
    ) {
      queueNativeWrite(localState);
      return localState;
    }

    writeLocalState(nativeState, {
      syncNative: false,
    });
    return nativeState;
  } catch {
    return localState;
  }
}
