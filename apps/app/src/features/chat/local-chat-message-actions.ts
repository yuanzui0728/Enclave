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

  const raw = window.localStorage.getItem(STORAGE_KEY);
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

      setState(nextState);
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

    window.addEventListener("focus", handleSync);
    window.addEventListener("storage", handleSync);
    window.addEventListener(CHANGE_EVENT, handleSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleSync);
      window.removeEventListener("storage", handleSync);
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

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
