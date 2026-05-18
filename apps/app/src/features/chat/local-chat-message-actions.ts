import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import { useEffect, useState } from "react";

export type LocalChatMessageActionState = {
  updatedAt: string | null;
  hiddenMessageIds: string[];
  recalledMessageIds: string[];
  reminders: LocalChatMessageReminderRecord[];
};

export type LocalChatMessageReminderRecord = {
  messageId: string;
  remindAt: string;
  threadId: string;
  threadType: "direct" | "group";
  threadTitle?: string;
  previewText?: string;
  notifiedAt?: string;
};

const STORAGE_KEY = "yinjie-chat-local-message-actions";
const CHANGE_EVENT = "yinjie-chat-local-message-actions-change";

const EMPTY_STATE: LocalChatMessageActionState = {
  updatedAt: null,
  hiddenMessageIds: [],
  recalledMessageIds: [],
  reminders: [],
};
let localChatMessageActionsNativeWriteQueue: Promise<void> = Promise.resolve();

export function readLocalChatMessageActionState(): LocalChatMessageActionState {
  if (typeof window === "undefined") {
    return EMPTY_STATE;
  }

  // R17：和姊妹 chat-image-viewer-route-state R10 同款 —— Safari iOS 隐私模式 /
  // 部分浏览器禁用 storage 时 getItem 本身可能抛 SecurityError。本函数被 chat-
  // message-list useState lazy init / useLocalChatMessageActionState 的 syncState
  // visibility/focus/storage/CHANGE_EVENT 回访同步路径反复调用，抛出会顺栈炸到
  // ChatMessageList 整组件 mount → 桌面单聊「打不开」。同款 setItem 已在
  // writeLocalChatMessageActionState (line 256-) try/catch；这里读路径同款保护。
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_STATE;
  }
  if (!raw) {
    return EMPTY_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalChatMessageActionState>;
    return normalizeState(parsed);
  } catch {
    return EMPTY_STATE;
  }
}

export function hideLocalChatMessage(messageId: string) {
  const current = readLocalChatMessageActionState();
  if (current.hiddenMessageIds.includes(messageId)) {
    return current;
  }

  const nextState = buildWritableState({
    hiddenMessageIds: [...current.hiddenMessageIds, messageId],
    recalledMessageIds: current.recalledMessageIds.filter(
      (item) => item !== messageId,
    ),
    reminders: current.reminders.filter((item) => item.messageId !== messageId),
  });
  writeState(nextState);
  return nextState;
}

export function recallLocalChatMessage(messageId: string) {
  const current = readLocalChatMessageActionState();
  if (current.recalledMessageIds.includes(messageId)) {
    return current;
  }

  const nextState = buildWritableState({
    hiddenMessageIds: current.hiddenMessageIds.filter(
      (item) => item !== messageId,
    ),
    recalledMessageIds: [...current.recalledMessageIds, messageId],
    reminders: current.reminders.filter((item) => item.messageId !== messageId),
  });
  writeState(nextState);
  return nextState;
}

export function upsertLocalChatMessageReminder(
  reminder: LocalChatMessageReminderRecord,
) {
  const current = readLocalChatMessageActionState();
  const nextState = buildWritableState({
    hiddenMessageIds: current.hiddenMessageIds,
    recalledMessageIds: current.recalledMessageIds,
    reminders: [
      reminder,
      ...current.reminders.filter(
        (item) => item.messageId !== reminder.messageId,
      ),
    ],
  });
  writeState(nextState);
  return nextState;
}

export function markLocalChatMessageReminderNotified(
  messageId: string,
  notifiedAt = new Date().toISOString(),
) {
  const current = readLocalChatMessageActionState();
  const nextState = buildWritableState({
    hiddenMessageIds: current.hiddenMessageIds,
    recalledMessageIds: current.recalledMessageIds,
    reminders: current.reminders.map((item) =>
      item.messageId === messageId
        ? {
            ...item,
            notifiedAt,
          }
        : item,
    ),
  });
  writeState(nextState);
  return nextState;
}

export function replaceLocalChatMessageReminders(
  reminders: LocalChatMessageReminderRecord[],
) {
  const current = readLocalChatMessageActionState();
  const nextState = buildWritableState({
    hiddenMessageIds: current.hiddenMessageIds,
    recalledMessageIds: current.recalledMessageIds,
    reminders,
  });
  writeState(nextState);
  return nextState;
}

export function removeLocalChatMessageReminder(messageId: string) {
  const current = readLocalChatMessageActionState();
  const nextState = buildWritableState({
    hiddenMessageIds: current.hiddenMessageIds,
    recalledMessageIds: current.recalledMessageIds,
    reminders: current.reminders.filter((item) => item.messageId !== messageId),
  });
  writeState(nextState);
  return nextState;
}

export function useLocalChatMessageActionState() {
  const [state, setState] = useState(() => readLocalChatMessageActionState());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    const syncState = async () => {
      const nextState = isDesktopRuntimeAvailable()
        ? await hydrateLocalChatMessageActionStateFromNative()
        : readLocalChatMessageActionState();
      if (cancelled) {
        return;
      }

      // 用 updatedAt 当 cheap hash：buildWritableState 每次写都会刷一遍 ISO
      // 串，没动过就一定相同。focus/visibility/storage/CHANGE_EVENT 回访时
      // readLocalChatMessageActionState 每次都 JSON.parse 出一个新对象引用 —
      // 不做这一层 bail-out，下游（chat-list / desktop workspace 整列会话卡
      // 片 / use-message-reminders / search-index）每次 cmd-tab 回前台都跟
      // 着 state 引用变白白重渲染一轮。
      setState((current) => {
        if (current.updatedAt === nextState.updatedAt) {
          return current;
        }
        return nextState;
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncState();
      }
    };

    void syncState();

    const handleSync = () => {
      void syncState();
    };
    // 走查新一轮 R8：和 chat-room-page / group-chat-page / group-qr-page R1
    // 同款 storage event 漏 gate 问题——本 hook 是被 chat-list-page /
    // chat-message-list / use-message-reminders / desktop workspace / search-index
    // 等 5+ 个 surface 同时挂着的全局 hook，原版 storage 监听对任何 OTHER tab
    // 的 localStorage 写入（主题、草稿、last viewed page、收藏 fingerprint、
    // 视频号关注等等）都触发 syncState → desktop 走 hydrateFromNative 拍 IPC、
    // 移动端走 readLocalChatMessageActionState 全量 JSON.parse storage。下游
    // 虽然有 updatedAt 兜底跳 setState，但 IPC + JSON.parse 是无谓硬开销，
    // 同一份 storage 在活跃 multi-tab 用户那里每秒可能被打数十次。
    // 用 STORAGE_KEY gate 一下：只在自己关心的 yinjie-chat-local-message-actions
    // key 上才同步；老 Safari 的 localStorage.clear() (event.key=null) 仍按
    // 全量同步对待，避免静默 stale。
    const handleStorageSync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY) {
        return;
      }
      void syncState();
    };

    window.addEventListener("focus", handleSync);
    window.addEventListener("storage", handleStorageSync);
    window.addEventListener(CHANGE_EVENT, handleSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleSync);
      window.removeEventListener("storage", handleStorageSync);
      window.removeEventListener(CHANGE_EVENT, handleSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return state;
}

export function shouldHideSearchableChatMessage(
  messageId: string,
  state: LocalChatMessageActionState,
) {
  return (
    state.hiddenMessageIds.includes(messageId) ||
    state.recalledMessageIds.includes(messageId)
  );
}

export function filterSearchableChatMessages<T extends { id: string }>(
  messages: readonly T[],
  state: LocalChatMessageActionState,
) {
  return messages.filter(
    (message) => !shouldHideSearchableChatMessage(message.id, state),
  );
}

function writeState(
  state: LocalChatMessageActionState,
  options?: {
    syncNative?: boolean;
  },
) {
  if (typeof window === "undefined") {
    return;
  }

  // 走查新一轮 R4：本地隐藏/撤回/提醒状态被群聊 + 单聊的消息长按菜单
  // 「删除」/「撤回」/「提醒」共用，hideLocalChatMessage / markLocalChat* /
  // setChatMessageReminder 全部走这里。setItem 在配额满 / Safari iOS 隐私
  // 模式都抛——React 17+ 合成事件 handler 抛错不会崩组件树但会冒到
  // window.onerror 污染 telemetry，更糟糕的是 dispatchEvent(CHANGE_EVENT)
  // 永远不会发出，订阅 CHANGE_EVENT 的全部 useLocalChatMessageActionState
  // 都拿不到本次更新，UI 上 "删除" / "撤回" 操作看着没反应。
  // 同 R2/R3 修法：setItem 裹 try/catch 静默降级；CHANGE_EVENT 仍然 dispatch
  // 让 hook 订阅方至少能读到最新 in-memory state（同帧内被 readState 读到
  // 上一个 localStorage 落库值——下次写成功再覆盖即可）。
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 配额满 / Safari 隐私模式 —— 静默降级
  }
  if (options?.syncNative !== false) {
    queueNativeLocalChatMessageActionStateWrite(state);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function normalizeState(
  input?: Partial<LocalChatMessageActionState>,
): LocalChatMessageActionState {
  return {
    updatedAt: typeof input?.updatedAt === "string" ? input.updatedAt : null,
    hiddenMessageIds: normalizeIdList(input?.hiddenMessageIds),
    recalledMessageIds: normalizeIdList(input?.recalledMessageIds),
    reminders: normalizeReminderList(input?.reminders),
  };
}

function buildWritableState(
  input?: Partial<LocalChatMessageActionState>,
): LocalChatMessageActionState {
  return normalizeState({
    ...input,
    updatedAt: new Date().toISOString(),
  });
}

function hasLocalChatMessageActionStateData(state: LocalChatMessageActionState) {
  return Boolean(
    state.hiddenMessageIds.length ||
      state.recalledMessageIds.length ||
      state.reminders.length,
  );
}

function getLocalChatMessageActionStateTimestamp(
  state: LocalChatMessageActionState,
) {
  const updatedAt = state.updatedAt ? Date.parse(state.updatedAt) : Number.NaN;
  return Number.isFinite(updatedAt) ? updatedAt : 0;
}

function queueNativeLocalChatMessageActionStateWrite(
  state: LocalChatMessageActionState,
) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(state);
  localChatMessageActionsNativeWriteQueue =
    localChatMessageActionsNativeWriteQueue
      .catch(() => undefined)
      .then(async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("desktop_write_chat_message_actions_store", {
          contents,
        });
      })
      .catch(() => undefined);
}

export async function hydrateLocalChatMessageActionStateFromNative() {
  const localState = readLocalChatMessageActionState();
  if (!isDesktopRuntimeAvailable()) {
    return localState;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_chat_message_actions_store");

    if (!result.exists) {
      if (hasLocalChatMessageActionStateData(localState)) {
        queueNativeLocalChatMessageActionStateWrite(localState);
      }
      return localState;
    }

    const nativeState = normalizeState(
      result.contents ? (JSON.parse(result.contents) as Partial<LocalChatMessageActionState>) : undefined,
    );
    if (
      getLocalChatMessageActionStateTimestamp(localState) >
      getLocalChatMessageActionStateTimestamp(nativeState)
    ) {
      if (hasLocalChatMessageActionStateData(localState)) {
        queueNativeLocalChatMessageActionStateWrite(localState);
      }
      return localState;
    }

    writeState(nativeState, {
      syncNative: false,
    });
    return nativeState;
  } catch {
    return localState;
  }
}

function normalizeIdList(input: unknown) {
  if (!Array.isArray(input)) {
    return [] as string[];
  }

  return Array.from(
    new Set(input.filter((item): item is string => typeof item === "string")),
  );
}

function normalizeReminderList(input: unknown) {
  if (!Array.isArray(input)) {
    return [] as LocalChatMessageReminderRecord[];
  }

  const reminders = input.filter(
    (item): item is LocalChatMessageReminderRecord =>
      typeof item === "object" &&
      item !== null &&
      typeof item.messageId === "string" &&
      typeof item.remindAt === "string" &&
      typeof item.threadId === "string" &&
      (item.threadType === "direct" || item.threadType === "group"),
  );

  const seenMessageIds = new Set<string>();
  return reminders
    .filter((item) => {
      if (seenMessageIds.has(item.messageId)) {
        return false;
      }

      seenMessageIds.add(item.messageId);
      return true;
    })
    .map((item) => ({
      messageId: item.messageId,
      remindAt: item.remindAt,
      threadId: item.threadId,
      threadType: item.threadType,
      threadTitle:
        typeof item.threadTitle === "string" ? item.threadTitle : undefined,
      previewText:
        typeof item.previewText === "string" ? item.previewText : undefined,
      notifiedAt:
        typeof item.notifiedAt === "string" ? item.notifiedAt : undefined,
    }));
}
