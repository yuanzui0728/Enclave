import type {
  WechatSyncContactBundle,
  WechatSyncMessageDirection,
  WechatSyncMessageSample,
} from "./contracts.js";

interface WechatDecryptHistoryMessage {
  timestamp?: number | string;
  chat?: string;
  username?: string;
  is_group?: boolean;
  sender?: string;
  type?: string;
  content?: string;
}

interface WechatDecryptTag {
  name?: string;
  label_name_?: string;
  members?: Array<{
    username?: string;
    display_name?: string;
  }>;
}

interface ContactAccumulator {
  username: string;
  displayName: string;
  tags: Set<string>;
  isGroup: boolean;
  messageCount: number;
  ownerMessageCount: number;
  contactMessageCount: number;
  latestMessageAt: string | null;
  sampleMessages: WechatSyncMessageSample[];
}

export interface WechatDecryptHttpScanResult {
  contacts: WechatSyncContactBundle[];
  sourceSummary: string;
  message: string;
}

export class WechatDecryptHttpProvider {
  async scan(baseUrl: string): Promise<WechatDecryptHttpScanResult> {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const [history, tags] = await Promise.all([
      fetchJson<unknown>(`${normalizedBaseUrl}/api/history?limit=2000`),
      fetchJson<unknown>(`${normalizedBaseUrl}/api/tags`).catch(() => []),
    ]);
    const tagMap = buildTagMap(tags);
    const contacts = aggregateHistory(extractHistoryMessages(history), tagMap);

    return {
      contacts,
      sourceSummary: `wechat-decrypt-http:${normalizedBaseUrl}`,
      message: contacts.length
        ? `已从 wechat-decrypt 读取 ${contacts.length} 个联系人。`
        : "已连接 wechat-decrypt，但 /api/history 暂无可聚合消息。",
    };
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`wechat-decrypt HTTP 请求失败：${response.status} ${url}`);
  }

  return (await response.json()) as T;
}

function normalizeBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("请先配置 wechatDecryptBaseUrl。");
  }

  const url = new URL(normalized);
  if (
    url.protocol !== "http:" ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
  ) {
    throw new Error("wechatDecryptBaseUrl 只允许 http://127.0.0.1 或 localhost。");
  }

  return url.toString().replace(/\/+$/, "");
}

function extractHistoryMessages(value: unknown): WechatDecryptHistoryMessage[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord) as WechatDecryptHistoryMessage[];
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of ["messages", "history", "items", "data"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord) as WechatDecryptHistoryMessage[];
    }
  }

  return [];
}

function buildTagMap(value: unknown) {
  const tags = Array.isArray(value) ? value.filter(isRecord) : [];
  const map = new Map<string, Set<string>>();

  for (const tag of tags as WechatDecryptTag[]) {
    const tagName = tag.name ?? tag.label_name_;
    if (!tagName) {
      continue;
    }

    for (const member of tag.members ?? []) {
      if (!member.username) {
        continue;
      }

      const current = map.get(member.username) ?? new Set<string>();
      current.add(tagName);
      map.set(member.username, current);
    }
  }

  return map;
}

function aggregateHistory(
  messages: WechatDecryptHistoryMessage[],
  tagMap: Map<string, Set<string>>,
): WechatSyncContactBundle[] {
  const contacts = new Map<string, ContactAccumulator>();

  for (const message of messages) {
    const username = normalizeText(message.username) ?? normalizeText(message.chat);
    if (!username) {
      continue;
    }

    const contact = getOrCreateContact(contacts, username, message, tagMap);
    const timestamp = normalizeTimestamp(message.timestamp);
    const content = normalizeText(message.content) ?? `[${message.type ?? "消息"}]`;
    const direction = inferDirection(message);

    contact.messageCount += 1;
    if (direction === "owner") {
      contact.ownerMessageCount += 1;
    } else if (direction === "contact" || direction === "group_member") {
      contact.contactMessageCount += 1;
    }

    if (
      timestamp &&
      (!contact.latestMessageAt ||
        Date.parse(timestamp) > Date.parse(contact.latestMessageAt))
    ) {
      contact.latestMessageAt = timestamp;
    }

    if (content && contact.sampleMessages.length < 40) {
      contact.sampleMessages.push({
        timestamp: timestamp ?? new Date(0).toISOString(),
        text: content,
        sender: normalizeText(message.sender),
        typeLabel: normalizeText(message.type),
        direction,
      });
    }
  }

  return [...contacts.values()].map((contact) => ({
    username: contact.username,
    displayName: contact.displayName,
    nickname: null,
    remarkName: null,
    region: null,
    source: "wechat-decrypt-http",
    tags: [...contact.tags],
    isGroup: contact.isGroup,
    messageCount: contact.messageCount,
    ownerMessageCount: contact.ownerMessageCount,
    contactMessageCount: contact.contactMessageCount,
    latestMessageAt: contact.latestMessageAt,
    chatSummary: buildChatSummary(contact),
    topicKeywords: inferKeywords(contact.sampleMessages.map((sample) => sample.text)),
    sampleMessages: contact.sampleMessages,
    momentHighlights: [],
  }));
}

function getOrCreateContact(
  contacts: Map<string, ContactAccumulator>,
  username: string,
  message: WechatDecryptHistoryMessage,
  tagMap: Map<string, Set<string>>,
) {
  const current = contacts.get(username);
  if (current) {
    return current;
  }

  const displayName = normalizeText(message.chat) ?? username;
  const contact: ContactAccumulator = {
    username,
    displayName,
    tags: new Set(tagMap.get(username) ?? []),
    isGroup: Boolean(message.is_group) || username.includes("@chatroom"),
    messageCount: 0,
    ownerMessageCount: 0,
    contactMessageCount: 0,
    latestMessageAt: null,
    sampleMessages: [],
  };
  contacts.set(username, contact);
  return contact;
}

function inferDirection(
  message: WechatDecryptHistoryMessage,
): WechatSyncMessageDirection {
  if (message.type === "系统") {
    return "system";
  }

  if (message.is_group && message.sender) {
    return "group_member";
  }

  return "contact";
}

function normalizeTimestamp(value: number | string | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return normalizeTimestamp(numeric);
    }
  }

  return null;
}

function buildChatSummary(contact: ContactAccumulator) {
  const latest = contact.sampleMessages.at(-1)?.text;
  if (!latest) {
    return null;
  }

  return `最近 ${contact.messageCount} 条消息，最后聊到：${latest.slice(0, 80)}`;
}

function inferKeywords(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    for (const token of value.match(/[\p{L}\p{N}_]{2,}/gu) ?? []) {
      const normalized = token.toLowerCase();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([token]) => token);
}

function normalizeText(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
