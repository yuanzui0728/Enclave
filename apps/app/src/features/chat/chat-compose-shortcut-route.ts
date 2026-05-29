export type ChatComposeShortcutAction = "voice-message" | "camera" | "album";
export type ChatCallFallbackKind = "voice" | "video";
export type ChatCallReturnKind = "voice" | "video";

const CHAT_COMPOSE_SHORTCUT_QUERY_KEY = "composeShortcut";
const CHAT_CALL_RETURN_QUERY_KEY = "callReturn";
const CHAT_COMPOSE_TEXT_QUERY_KEY = "composeText";
const CHAT_COMPOSE_SEND_QUERY_KEY = "composeSend";

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
}): Record<string, string> | undefined {
  const params = toSearchParams(input?.search);

  if (input?.action) {
    params.set(CHAT_COMPOSE_SHORTCUT_QUERY_KEY, input.action);
  } else {
    params.delete(CHAT_COMPOSE_SHORTCUT_QUERY_KEY);
  }

  // 走查 Round 1：原版返回 `?<qs>` 字符串，调用方 `navigate({ search: nextSearch || undefined })`
  // 把字符串直接交给 tanstack-router 的 search 字段——router 用 Object.entries 迭代会拆字符
  // 为 `?0=?&1=c&2=a&3=l&...` 类的脏 URL。返回 Record 对象，调用方语法 (|| undefined) 行为不变。
  return searchParamsToRecord(params);
}

// 世界 tab 底部「和我快聊」快捷栏：把用户在世界页敲的文字经 search 参数带到
// /chat/$conversationId，聊天页解析后预填 composer（用完即被 navigate replace 抹掉）。
export function parseChatComposeText(
  search: ChatComposeShortcutSearchInput,
): string | null {
  const text = toSearchParams(search).get(CHAT_COMPOSE_TEXT_QUERY_KEY)?.trim();
  return text ? text : null;
}

// 世界 tab「和我快聊」自动发送开关：开了之后聊天页不预填 composer，而是直接把
// composeText 经成熟发送链路发出去。和 composeText 同生命周期（一次性、用完即抹）。
export function parseChatComposeAutoSend(
  search: ChatComposeShortcutSearchInput,
): boolean {
  return (
    toSearchParams(search).get(CHAT_COMPOSE_SEND_QUERY_KEY)?.trim() === "1"
  );
}

export function buildChatComposeTextSearch(input?: {
  search?: ChatComposeShortcutSearchInput;
  text?: string | null;
  autoSend?: boolean;
}): Record<string, string> | undefined {
  const params = toSearchParams(input?.search);

  const text = input?.text?.trim();
  if (text) {
    params.set(CHAT_COMPOSE_TEXT_QUERY_KEY, text);
    if (input?.autoSend) {
      params.set(CHAT_COMPOSE_SEND_QUERY_KEY, "1");
    } else {
      params.delete(CHAT_COMPOSE_SEND_QUERY_KEY);
    }
  } else {
    // text 清空时把自动发送开关一起抹掉，这样聊天页清 URL（text:null）会同时清掉
    // composeText + composeSend，调用方无需单独处理。
    params.delete(CHAT_COMPOSE_TEXT_QUERY_KEY);
    params.delete(CHAT_COMPOSE_SEND_QUERY_KEY);
  }

  // 同 buildChatComposeShortcutSearch：返回 Record 而非 `?<qs>` 字符串，否则
  // navigate({ search }) 会把字符串按字符序列化成脏 URL。
  return searchParamsToRecord(params);
}

export function parseChatCallReturnKind(
  search: ChatComposeShortcutSearchInput,
): ChatCallReturnKind | null {
  const kind = toSearchParams(search).get(CHAT_CALL_RETURN_QUERY_KEY)?.trim();
  return kind === "voice" || kind === "video" ? kind : null;
}

export function buildChatCallReturnSearch(input?: {
  search?: ChatComposeShortcutSearchInput;
  kind?: ChatCallReturnKind | null;
}): Record<string, string> | undefined {
  const params = toSearchParams(input?.search);

  if (input?.kind) {
    params.set(CHAT_CALL_RETURN_QUERY_KEY, input.kind);
  } else {
    params.delete(CHAT_CALL_RETURN_QUERY_KEY);
  }

  // 同 buildChatComposeShortcutSearch：返回 Record 而非 `?<qs>` 字符串，
  // 否则 navigate({ search }) 会把字符串按字符序列化成 ?0=?&1=c&... 脏 URL。
  return searchParamsToRecord(params);
}

export function resolveChatCallFallbackShortcutAction(
  kind: ChatCallFallbackKind,
): ChatComposeShortcutAction {
  return kind === "voice" ? "voice-message" : "camera";
}

export function buildChatCallFallbackShortcutSearch(input: {
  kind: ChatCallFallbackKind;
  search?: ChatComposeShortcutSearchInput;
}) {
  return buildChatComposeShortcutSearch({
    search: input.search,
    action: resolveChatCallFallbackShortcutAction(input.kind),
  });
}

function searchParamsToRecord(
  params: URLSearchParams,
): Record<string, string> | undefined {
  const record: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    record[key] = value;
  }
  return Object.keys(record).length ? record : undefined;
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
