export type LocalChatMessageActionState = {
  hiddenMessageIds: string[];
  recalledMessageIds: string[];
  reminders: LocalChatMessageReminderRecord[];
};

export type LocalChatMessageReminderRecord = {
  messageId: string;
  remindAt: string;
};

const STORAGE_KEY = "yinjie-chat-local-message-actions";

const EMPTY_STATE: LocalChatMessageActionState = {
  hiddenMessageIds: [],
  recalledMessageIds: [],
  reminders: [],
};

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

  const nextState = normalizeState({
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

  const nextState = normalizeState({
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
  const nextState = normalizeState({
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

function writeState(state: LocalChatMessageActionState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeState(
  input?: Partial<LocalChatMessageActionState>,
): LocalChatMessageActionState {
  return {
    hiddenMessageIds: normalizeIdList(input?.hiddenMessageIds),
    recalledMessageIds: normalizeIdList(input?.recalledMessageIds),
    reminders: normalizeReminderList(input?.reminders),
  };
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
      typeof item.remindAt === "string",
  );

  const seenMessageIds = new Set<string>();
  return reminders.filter((item) => {
    if (seenMessageIds.has(item.messageId)) {
      return false;
    }

    seenMessageIds.add(item.messageId);
    return true;
  });
}
