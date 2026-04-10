export type ChatComposeShortcutAction = "voice-message" | "camera" | "album";

const CHAT_COMPOSE_SHORTCUT_QUERY_KEY = "composeShortcut";

type ChatComposeShortcutSearchInput =
  | string
  | URLSearchParams
  | Record<string, unknown>
  | undefined;

export function parseChatComposeShortcutAction(
  search: ChatComposeShortcutSearchInput,
): ChatComposeShortcutAction | null {
  const action = toSearchParams(search)
    .get(CHAT_COMPOSE_SHORTCUT_QUERY_KEY)
    ?.trim();

  return action === "voice-message" || action === "camera" || action === "album"
    ? action
    : null;
}

export function buildChatComposeShortcutSearch(input?: {
  search?: ChatComposeShortcutSearchInput;
  action?: ChatComposeShortcutAction | null;
}) {
  const params = toSearchParams(input?.search);

  if (input?.action) {
    params.set(CHAT_COMPOSE_SHORTCUT_QUERY_KEY, input.action);
  } else {
    params.delete(CHAT_COMPOSE_SHORTCUT_QUERY_KEY);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

function toSearchParams(search: ChatComposeShortcutSearchInput) {
  if (!search) {
    return new URLSearchParams();
  }

  if (typeof search === "string" || search instanceof URLSearchParams) {
    return new URLSearchParams(search);
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      params.set(key, value);
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      params.set(key, String(value));
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean"
        ) {
          params.append(key, String(item));
        }
      }
    }
  }

  return params;
}
