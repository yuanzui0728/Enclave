import type {
  WechatSyncContactBundle,
  WechatSyncMessageDirection,
  WechatSyncMessageSample,
} from "./contracts.js";

interface WeFlowContactItem {
  username?: string;
  displayName?: string;
  remark?: string;
  nickname?: string;
  alias?: string;
  type?: string;
}

interface WeFlowRawSessionItem {
  username?: string;
  displayName?: string;
  type?: string;
  lastTimestamp?: number | string;
}

interface WeFlowChatLabSessionItem {
  id?: string;
  name?: string;
  type?: string;
  messageCount?: number | string;
  lastMessageAt?: number | string;
}

interface WeFlowMessageItem {
  createTime?: number | string;
  timestamp?: number | string;
  isSend?: boolean | number | string;
  senderUsername?: string;
  senderDisplayName?: string;
  senderNickname?: string;
  sender?: string;
  content?: string;
  parsedContent?: unknown;
  msgTypeName?: string;
  mediaType?: string;
  type?: string;
  messageType?: string;
}

interface WeFlowScanResult {
  contacts: WechatSyncContactBundle[];
  sourceSummary: string;
  message: string;
}

interface NormalizedWeFlowContact {
  username: string;
  displayName: string;
  nickname: string | null;
  remarkName: string | null;
  isGroup: boolean;
}

interface NormalizedWeFlowSession {
  username: string;
  displayName: string;
  isGroup: boolean;
  messageCount: number;
  latestMessageAt: string | null;
}

const FETCH_TIMEOUT_MS = 5_000;
const ERROR_BODY_PREVIEW_LENGTH = 240;
const ENRICH_BATCH_SIZE = 4;

export class WeFlowHttpProvider {
  async scan(baseUrl: string, accessToken: string): Promise<WeFlowScanResult> {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl, "weflowBaseUrl");
    const normalizedAccessToken = normalizeAccessToken(accessToken);
    const [contactsValue, rawSessionsValue, chatlabSessionsValue] =
      await Promise.all([
        fetchJson<unknown>(
          normalizedBaseUrl,
          normalizedAccessToken,
          "/api/v1/contacts?limit=1000",
        ),
        fetchJson<unknown>(
          normalizedBaseUrl,
          normalizedAccessToken,
          "/api/v1/sessions?limit=1000",
        ),
        fetchJson<unknown>(
          normalizedBaseUrl,
          normalizedAccessToken,
          "/api/v1/sessions?format=chatlab&limit=1000",
        ),
      ]);

    const contacts = buildBundles(
      extractContacts(contactsValue),
      extractRawSessions(rawSessionsValue),
      extractChatLabSessions(chatlabSessionsValue),
    );

    return {
      contacts,
      sourceSummary: `weflow-http:${normalizedBaseUrl}`,
      message: contacts.length
        ? `已从 WeFlow 读取 ${contacts.length} 个联系人/会话摘要。`
        : "已连接 WeFlow，但当前没有返回可用联系人或会话。",
    };
  }

  async enrichBundles(
    baseUrl: string,
    accessToken: string,
    contacts: WechatSyncContactBundle[],
  ): Promise<WechatSyncContactBundle[]> {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl, "weflowBaseUrl");
    const normalizedAccessToken = normalizeAccessToken(accessToken);
    const enriched: WechatSyncContactBundle[] = [];

    for (let index = 0; index < contacts.length; index += ENRICH_BATCH_SIZE) {
      const batch = contacts.slice(index, index + ENRICH_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((bundle) =>
          enrichBundle(normalizedBaseUrl, normalizedAccessToken, bundle),
        ),
      );
      enriched.push(...batchResults);
    }

    return enriched;
  }
}

async function enrichBundle(
  baseUrl: string,
  accessToken: string,
  bundle: WechatSyncContactBundle,
) {
  const payload = await fetchJson<unknown>(
    baseUrl,
    accessToken,
    `/api/v1/messages?talker=${encodeURIComponent(bundle.username)}&limit=40`,
  );
  const sampleMessages = extractMessages(payload, bundle.isGroup);
  if (!sampleMessages.length) {
    return {
      ...bundle,
      chatSummary:
        bundle.chatSummary ??
        (bundle.messageCount > 0
          ? `WeFlow 已同步 ${bundle.messageCount} 条会话摘要，但该会话暂时没有可读消息样本。`
          : "WeFlow 已同步联系人资料，当前会话暂无消息。"),
    };
  }

  const ownerMessageCount = sampleMessages.filter(
    (sample) => sample.direction === "owner",
  ).length;
  const contactMessageCount = sampleMessages.filter(
    (sample) =>
      sample.direction === "contact" || sample.direction === "group_member",
  ).length;
  const latestMessageAt =
    inferLatestMessageAt(sampleMessages) ?? bundle.latestMessageAt ?? null;

  return {
    ...bundle,
    ownerMessageCount: Math.max(bundle.ownerMessageCount, ownerMessageCount),
    contactMessageCount: Math.max(
      bundle.contactMessageCount,
      contactMessageCount,
    ),
    latestMessageAt,
    chatSummary: buildChatSummary(bundle.messageCount, sampleMessages),
    topicKeywords: inferKeywords(sampleMessages.map((sample) => sample.text)),
    sampleMessages,
  };
}

async function fetchJson<T>(
  baseUrl: string,
  accessToken: string,
  path: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const url = new URL(path, `${baseUrl}/`).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(formatFetchFailure(url, error));
  } finally {
    clearTimeout(timeout);
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(formatResponseFailure(url, response, rawBody));
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch (error) {
    throw new Error(
      `WeFlow HTTP 响应不是合法 JSON：${url}${formatBodyPreview(rawBody)}${formatCause(error)}`,
    );
  }
}

function buildBundles(
  contacts: NormalizedWeFlowContact[],
  rawSessions: NormalizedWeFlowSession[],
  chatlabSessions: NormalizedWeFlowSession[],
) {
  const contactMap = new Map(contacts.map((contact) => [contact.username, contact]));
  const sessionMap = new Map<string, NormalizedWeFlowSession>();

  for (const session of [...rawSessions, ...chatlabSessions]) {
    const current = sessionMap.get(session.username);
    sessionMap.set(
      session.username,
      current
        ? {
            ...current,
            displayName:
              session.displayName !== session.username
                ? session.displayName
                : current.displayName,
            isGroup: current.isGroup || session.isGroup,
            messageCount: Math.max(current.messageCount, session.messageCount),
            latestMessageAt: pickLatestTimestamp(
              current.latestMessageAt,
              session.latestMessageAt,
            ),
          }
        : session,
    );
  }

  const usernames = new Set<string>([
    ...contactMap.keys(),
    ...sessionMap.keys(),
  ]);

  return [...usernames]
    .map((username) => {
      const contact = contactMap.get(username);
      const session = sessionMap.get(username);
      const displayName =
        contact?.displayName ??
        session?.displayName ??
        contact?.remarkName ??
        contact?.nickname ??
        username;
      const isGroup =
        Boolean(contact?.isGroup) ||
        Boolean(session?.isGroup) ||
        username.endsWith("@chatroom");
      const messageCount = session?.messageCount ?? 0;
      const latestMessageAt = session?.latestMessageAt ?? null;

      return {
        username,
        displayName,
        nickname: contact?.nickname ?? null,
        remarkName: contact?.remarkName ?? null,
        region: null,
        source: "weflow-http",
        tags: [],
        isGroup,
        messageCount,
        ownerMessageCount: 0,
        contactMessageCount: 0,
        latestMessageAt,
        chatSummary:
          messageCount > 0
            ? `已从 WeFlow 同步 ${messageCount} 条会话摘要，生成预览时会按需读取最近消息。`
            : "已从 WeFlow 同步联系人资料，生成预览时会按需读取最近消息。",
        topicKeywords: [],
        sampleMessages: [],
        momentHighlights: [],
      } satisfies WechatSyncContactBundle;
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.latestMessageAt ?? "");
      const rightTime = Date.parse(right.latestMessageAt ?? "");
      return (
        (Number.isFinite(rightTime) ? rightTime : 0) -
          (Number.isFinite(leftTime) ? leftTime : 0) ||
        right.messageCount - left.messageCount ||
        left.displayName.localeCompare(right.displayName)
      );
    });
}

function extractContacts(value: unknown): NormalizedWeFlowContact[] {
  return extractArray(value, ["contacts", "items", "data"])
    .filter(isRecord)
    .map((item) => {
      const contact = item as WeFlowContactItem;
      const username = normalizeText(contact.username);
      if (!username) {
        return null;
      }

      const remarkName = normalizeText(contact.remark);
      const nickname = normalizeText(contact.nickname);
      const displayName =
        normalizeText(contact.displayName) ??
        remarkName ??
        nickname ??
        normalizeText(contact.alias) ??
        username;

      return {
        username,
        displayName,
        nickname,
        remarkName,
        isGroup: inferIsGroup(contact.type, username),
      } satisfies NormalizedWeFlowContact;
    })
    .filter((item): item is NormalizedWeFlowContact => Boolean(item));
}

function extractRawSessions(value: unknown): NormalizedWeFlowSession[] {
  return extractArray(value, ["sessions", "items", "data"])
    .filter(isRecord)
    .map((item) => {
      const session = item as WeFlowRawSessionItem;
      const username = normalizeText(session.username);
      if (!username) {
        return null;
      }

      return {
        username,
        displayName: normalizeText(session.displayName) ?? username,
        isGroup: inferIsGroup(session.type, username),
        messageCount: 0,
        latestMessageAt: normalizeTimestamp(session.lastTimestamp),
      } satisfies NormalizedWeFlowSession;
    })
    .filter((item): item is NormalizedWeFlowSession => Boolean(item));
}

function extractChatLabSessions(value: unknown): NormalizedWeFlowSession[] {
  return extractArray(value, ["sessions", "items", "data"])
    .filter(isRecord)
    .map((item) => {
      const session = item as WeFlowChatLabSessionItem;
      const username = normalizeText(session.id);
      if (!username) {
        return null;
      }

      return {
        username,
        displayName: normalizeText(session.name) ?? username,
        isGroup: inferIsGroup(session.type, username),
        messageCount: normalizeCount(session.messageCount),
        latestMessageAt: normalizeTimestamp(session.lastMessageAt),
      } satisfies NormalizedWeFlowSession;
    })
    .filter((item): item is NormalizedWeFlowSession => Boolean(item));
}

function extractMessages(
  value: unknown,
  isGroup: boolean,
): WechatSyncMessageSample[] {
  return extractArray(value, ["messages", "items", "data"])
    .filter(isRecord)
    .map((item) => normalizeMessageSample(item as WeFlowMessageItem, isGroup))
    .filter((item): item is WechatSyncMessageSample => Boolean(item))
    .sort((left, right) => {
      const leftTime = Date.parse(left.timestamp);
      const rightTime = Date.parse(right.timestamp);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return leftTime - rightTime;
      }
      return 0;
    })
    .slice(-40);
}

function normalizeMessageSample(
  message: WeFlowMessageItem,
  isGroup: boolean,
): WechatSyncMessageSample | null {
  const typeLabel =
    normalizeText(message.msgTypeName) ??
    normalizeText(message.mediaType) ??
    normalizeText(message.type) ??
    normalizeText(message.messageType);
  const text =
    extractMessageText(message.parsedContent) ??
    normalizeText(message.content) ??
    (typeLabel ? `[${typeLabel}]` : null);

  if (!text) {
    return null;
  }

  return {
    timestamp:
      normalizeTimestamp(message.createTime) ??
      normalizeTimestamp(message.timestamp) ??
      new Date(0).toISOString(),
    text,
    sender:
      normalizeText(message.senderDisplayName) ??
      normalizeText(message.senderNickname) ??
      normalizeText(message.sender) ??
      normalizeText(message.senderUsername),
    typeLabel,
    direction: inferDirection(message, isGroup, typeLabel),
  };
}

function extractMessageText(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of ["text", "content", "displayText", "title", "desc", "description"]) {
    const candidate = normalizeText(value[key]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function inferDirection(
  message: WeFlowMessageItem,
  isGroup: boolean,
  typeLabel: string | null,
): WechatSyncMessageDirection {
  if (parseBooleanish(message.isSend)) {
    return "owner";
  }

  const normalizedTypeLabel = typeLabel?.toLowerCase() ?? "";
  if (
    normalizedTypeLabel.includes("system") ||
    normalizedTypeLabel.includes("系统")
  ) {
    return "system";
  }

  if (isGroup && normalizeText(message.senderUsername)) {
    return "group_member";
  }

  return "contact";
}

function buildChatSummary(
  totalMessageCount: number,
  sampleMessages: WechatSyncMessageSample[],
) {
  const latest = sampleMessages.at(-1)?.text;
  if (!latest) {
    return totalMessageCount > 0
      ? `已从 WeFlow 同步 ${totalMessageCount} 条会话摘要。`
      : null;
  }

  return `最近 ${Math.max(totalMessageCount, sampleMessages.length)} 条消息里，最近一条是：${latest.slice(0, 80)}`;
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

function inferLatestMessageAt(samples: WechatSyncMessageSample[]) {
  const timestamps = samples
    .map((sample) => Date.parse(sample.timestamp))
    .filter((timestamp) => Number.isFinite(timestamp));

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function extractArray(value: unknown, keys: string[]) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function pickLatestTimestamp(
  left: string | null,
  right: string | null,
): string | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function normalizeBaseUrl(value: string, label: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error(`请先配置 ${label}。`);
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${label} 不是合法的本机 HTTP 地址。`);
  }

  if (
    url.protocol !== "http:" ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
  ) {
    throw new Error(`${label} 只允许 http://127.0.0.1 或 http://localhost。`);
  }

  return url.toString().replace(/\/+$/, "");
}

function normalizeAccessToken(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error("请先配置 WeFlow API Access Token。");
  }
  return normalized;
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

function normalizeCount(value: number | string | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return 0;
}

function inferIsGroup(type: string | undefined, username: string) {
  const normalizedType = normalizeText(type)?.toLowerCase();
  return Boolean(
    username.endsWith("@chatroom") ||
      normalizedType === "group" ||
      normalizedType === "chatroom",
  );
}

function parseBooleanish(value: boolean | number | string | undefined) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

function normalizeText(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatFetchFailure(url: string, error: unknown) {
  const timeoutHint =
    error instanceof Error && error.name === "AbortError"
      ? `，请求超过 ${FETCH_TIMEOUT_MS / 1000} 秒未响应`
      : "";

  return `无法连接 WeFlow 服务：${url}${timeoutHint}。请确认 WeFlow API 已启动、地址可从本机访问，并且 Token 已正确配置。${formatCause(error)}`;
}

function formatResponseFailure(
  url: string,
  response: Response,
  rawBody: string,
) {
  if (response.status === 401 || response.status === 403) {
    return `无法读取 WeFlow API：${url}，Access Token 无效、缺失或未开启接口访问权限。`;
  }

  return `WeFlow HTTP 请求失败：${response.status} ${response.statusText} ${url}${formatBodyPreview(rawBody)}`;
}

function formatBodyPreview(rawBody: string) {
  const normalized = rawBody.trim();
  if (!normalized) {
    return "";
  }

  return `，响应：${normalized.slice(0, ERROR_BODY_PREVIEW_LENGTH)}`;
}

function formatCause(error: unknown) {
  return error instanceof Error && error.message
    ? ` 原始错误：${error.message}`
    : "";
}
