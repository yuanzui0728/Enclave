import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type DetailedTimestampModeState = {
  enabled: boolean;
  updatedAt: string | null;
};

export const DETAILED_TIMESTAMP_MODE_STORAGE_KEY = "chat-detailed-timestamp-mode";
export const DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY =
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

  // R18：和 R17 readLocalChatMessageActionState 同款 —— Safari iOS 隐私模式 /
  // 部分浏览器禁用 storage 时 getItem 本身可能抛 SecurityError。这两条 getItem
  // 给 readDetailedTimestampModeEnabled / hydrateDetailedTimestampModeFromNative
  // 用，后者最终通过 chat-message-list line 572 useState lazy init 跑 → 抛错
  // 让整个 ChatMessageList 组件 mount 失败 → 桌面单聊整页打不开。setItem 已在
  // writeLocalState (line 99-) 走 try/catch；读路径同款保护。
  let raw: string | null;
  let rawUpdatedAt: string | null;
  try {
    raw = window.localStorage.getItem(DETAILED_TIMESTAMP_MODE_STORAGE_KEY);
    rawUpdatedAt = window.localStorage.getItem(
      DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY,
    );
  } catch {
    return defaultState;
  }
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

// 走查新一轮 R3：localStorage.setItem 配额满 / Safari iOS 隐私模式下抛错。
// 这条 writeLocalState 通过 writeDetailedTimestampModeEnabled 被
// chat-message-list.tsx line 689 在 useEffect 内同步调——抛错会冒到 React
// error boundary，把整条聊天消息列表（单聊 + 群聊共享渲染）整片白屏。
// 跟 R2 的 group-invite-delivery 是同一类问题；这里走同款修法：每段
// setItem/removeItem 各裹 try/catch，单段失败不影响其它段，业务上做"持久化
// 降级"——内存里的 React state 仍正确，下次再写就 OK。
function writeLocalState(
  state: DetailedTimestampModeState,
  options?: {
    syncNative?: boolean;
  },
) {
  if (typeof window !== "undefined") {
    if (hasStateData(state)) {
      try {
        window.localStorage.setItem(
          DETAILED_TIMESTAMP_MODE_STORAGE_KEY,
          state.enabled ? "1" : "0",
        );
      } catch {
        // 配额满 / Safari 隐私模式 —— 静默降级
      }
      if (state.updatedAt) {
        try {
          window.localStorage.setItem(
            DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY,
            state.updatedAt,
          );
        } catch {
          // 同上
        }
      } else {
        try {
          window.localStorage.removeItem(
            DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY,
          );
        } catch {
          // 同上
        }
      }
    } else {
      try {
        window.localStorage.removeItem(DETAILED_TIMESTAMP_MODE_STORAGE_KEY);
      } catch {
        // 同上
      }
      try {
        window.localStorage.removeItem(
          DETAILED_TIMESTAMP_MODE_UPDATED_AT_STORAGE_KEY,
        );
      } catch {
        // 同上
      }
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
