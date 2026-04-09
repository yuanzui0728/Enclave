export type DirectChatDetailPreferences = {
  muted: boolean;
  strongReminder: boolean;
  backgroundLabel: string;
};

export type GroupChatDetailPreferences = {
  muted: boolean;
  showMemberNicknames: boolean;
  backgroundLabel: string;
};

const directDefaults: DirectChatDetailPreferences = {
  muted: false,
  strongReminder: false,
  backgroundLabel: "默认",
};

const groupDefaults: GroupChatDetailPreferences = {
  muted: false,
  showMemberNicknames: true,
  backgroundLabel: "默认",
};

export function readDirectChatDetailPreferences(conversationId: string) {
  return readPreferences(
    `yinjie.direct-chat-details.${conversationId}`,
    directDefaults,
  );
}

export function writeDirectChatDetailPreferences(
  conversationId: string,
  value: DirectChatDetailPreferences,
) {
  writePreferences(`yinjie.direct-chat-details.${conversationId}`, value);
}

export function readGroupChatDetailPreferences(groupId: string) {
  return readPreferences(`yinjie.group-chat-details.${groupId}`, groupDefaults);
}

export function writeGroupChatDetailPreferences(
  groupId: string,
  value: GroupChatDetailPreferences,
) {
  writePreferences(`yinjie.group-chat-details.${groupId}`, value);
}

function readPreferences<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function writePreferences<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}
