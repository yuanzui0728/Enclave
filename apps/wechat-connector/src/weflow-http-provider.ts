import type {
  ConnectorContactBundleOptions,
  ConnectorContactBundleRequest,
  ConnectorContactBundleMessageMode,
  WechatSyncContactBundle,
  WechatSyncEvidenceWindow,
  WechatSyncMessageDirection,
  WechatSyncMessageSample,
  WechatSyncMomentHighlight,
} from "./contracts.js";

interface WeFlowContactItem {
  username?: string;
  displayName?: string;
  remark?: string;
  nickname?: string;
  alias?: string;
  labels?: unknown;
  detailDescription?: string;
  region?: string;
  avatarUrl?: string;
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

interface WeFlowMomentItem {
  username?: string;
  nickname?: string;
  createTime?: number | string;
  timestamp?: number | string;
  contentDesc?: string;
  content?: string;
  desc?: string;
  media?: unknown;
  location?: unknown;
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
  alias: string | null;
  detailDescription: string | null;
  region: string | null;
  avatarUrl: string | null;
  tags: string[];
  isGroup: boolean;
}

interface NormalizedWeFlowSession {
  username: string;
  displayName: string;
  isGroup: boolean;
  messageCount: number;
  latestMessageAt: string | null;
}

interface MessageCorpusResult {
  messages: WechatSyncMessageSample[];
  hasMore: boolean;
}

interface NormalizedBundleOptions {
  messageMode: ConnectorContactBundleMessageMode;
  messageLimit: number | null;
  includeMoments: boolean;
  momentLimit: number;
}

const FETCH_TIMEOUT_MS = 12_000;
const ERROR_BODY_PREVIEW_LENGTH = 240;
const ENRICH_BATCH_SIZE = 2;
const DEFAULT_MESSAGE_LIMIT = 5_000;
const MAX_RECENT_MESSAGE_LIMIT = 5_000;
const MESSAGE_PAGE_SIZE = 1_000;
const DEFAULT_MOMENT_LIMIT = 20;
const MAX_MOMENT_LIMIT = 200;
const KEYWORD_LIMIT = 12;

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
        ? `已从 WeFlow 读取 ${contacts.length} 个联系人 / 会话摘要。`
        : "已连接 WeFlow，但当前没有返回可用联系人或会话。",
    };
  }

  async enrichBundles(
    baseUrl: string,
    accessToken: string,
    contacts: WechatSyncContactBundle[],
    request?: ConnectorContactBundleRequest,
  ): Promise<WechatSyncContactBundle[]> {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl, "weflowBaseUrl");
    const normalizedAccessToken = normalizeAccessToken(accessToken);
    const enriched: WechatSyncContactBundle[] = [];

    for (let index = 0; index < contacts.length; index += ENRICH_BATCH_SIZE) {
      const batch = contacts.slice(index, index + ENRICH_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((bundle) =>
          enrichBundle(
            normalizedBaseUrl,
            normalizedAccessToken,
            bundle,
            resolveBundleOptions(request, bundle.username),
          ),
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
  options: NormalizedBundleOptions,
) {
  const [messageCorpus, momentHighlights] = await Promise.all([
    fetchMessageCorpus(baseUrl, accessToken, bundle, options),
    options.includeMoments && !bundle.isGroup
      ? fetchMomentHighlights(baseUrl, accessToken, bundle.username, options.momentLimit)
      : Promise.resolve([] as WechatSyncMomentHighlight[]),
  ]);

  const sampleMessages = messageCorpus.messages;
  const ownerMessageCount = sampleMessages.filter(
    (sample) => sample.direction === "owner",
  ).length;
  const contactMessageCount = sampleMessages.filter(
    (sample) =>
      sample.direction === "contact" || sample.direction === "group_member",
  ).length;
  const latestMessageAt =
    inferLatestMessageAt(sampleMessages) ?? bundle.latestMessageAt ?? null;
  const topicKeywords = inferKeywords([
    ...sampleMessages.map((sample) => sample.text),
    ...momentHighlights.map((item) => item.text),
    ...bundle.tags,
    bundle.detailDescription ?? "",
  ]);
  const evidenceWindow: WechatSyncEvidenceWindow = {
    messageMode: options.messageMode,
    requestedMessageLimit: options.messageLimit,
    fetchedMessageCount: sampleMessages.length,
    includeMoments: options.includeMoments,
    requestedMomentLimit: options.includeMoments ? options.momentLimit : 0,
    fetchedMomentCount: momentHighlights.length,
  };

  if (!sampleMessages.length && !momentHighlights.length) {
    return {
      ...bundle,
      chatSummary:
        bundle.chatSummary ??
        (bundle.messageCount > 0
          ? `WeFlow 已同步 ${bundle.messageCount} 条会话摘要，但本轮没有读到可分析的聊天样本。`
          : "WeFlow 已同步联系人资料，当前会话暂无消息。"),
      evidenceWindow,
    };
  }

  const totalMessageCount = Math.max(bundle.messageCount, sampleMessages.length);

  return {
    ...bundle,
    messageCount: totalMessageCount,
    ownerMessageCount: Math.max(bundle.ownerMessageCount, ownerMessageCount),
    contactMessageCount: Math.max(bundle.contactMessageCount, contactMessageCount),
    latestMessageAt,
    chatSummary: buildChatSummary(
      totalMessageCount,
      sampleMessages,
      momentHighlights,
      evidenceWindow,
    ),
    topicKeywords,
    sampleMessages,
    momentHighlights,
    evidenceWindow,
  };
}

async function fetchMessageCorpus(
  baseUrl: string,
  accessToken: string,
  bundle: WechatSyncContactBundle,
  options: NormalizedBundleOptions,
): Promise<MessageCorpusResult> {
  const limit =
    options.messageMode === "all"
      ? Number.POSITIVE_INFINITY
      : options.messageLimit ?? DEFAULT_MESSAGE_LIMIT;
  const collected: WechatSyncMessageSample[] = [];
  let offset = 0;
  let hasMore = false;

  while (collected.length < limit) {
    const remaining = Number.isFinite(limit)
      ? Math.max(1, Math.min(MESSAGE_PAGE_SIZE, limit - collected.length))
      : MESSAGE_PAGE_SIZE;
    const payload = await fetchJson<unknown>(
      baseUrl,
      accessToken,
      `/api/v1/messages?talker=${encodeURIComponent(bundle.username)}&limit=${remaining}&offset=${offset}`,
    );
    const pageMessages = extractMessages(payload, bundle.isGroup);
    if (!pageMessages.length) {
      hasMore = false;
      break;
    }

    collected.push(...pageMessages);
    hasMore = extractHasMore(payload);
    offset += pageMessages.length;

    if (pageMessages.length < remaining) {
      hasMore = false;
      break;
    }
    if (!hasMore && Number.isFinite(limit) && collected.length >= limit) {
      break;
    }
    if (!hasMore && !Number.isFinite(limit)) {
      break;
    }
  }

  const normalizedMessages = dedupeMessageSamples(collected);
  return {
    messages:
      options.messageMode === "all"
        ? normalizedMessages
        : normalizedMessages.slice(
            -Math.max(1, options.messageLimit ?? DEFAULT_MESSAGE_LIMIT),
          ),
    hasMore:
      options.messageMode === "all"
        ? false
        : hasMore || normalizedMessages.length >= (options.messageLimit ?? DEFAULT_MESSAGE_LIMIT),
  };
}

async function fetchMomentHighlights(
  baseUrl: string,
  accessToken: string,
  username: string,
  limit: number,
) {
  const payload = await fetchJson<unknown>(
    baseUrl,
    accessToken,
    `/api/v1/sns/timeline?usernames=${encodeURIComponent(username)}&limit=${limit}&media=1&replace=1`,
  );
  return extractMomentHighlights(payload);
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
      `WeFlow HTTP 返回了非 JSON 响应：${url}${formatBodyPreview(rawBody)}${formatCause(error)}`,
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
        alias: contact?.alias ?? null,
        detailDescription: contact?.detailDescription ?? null,
        region: contact?.region ?? null,
        avatarUrl: contact?.avatarUrl ?? null,
        source: "weflow-http",
        tags: contact?.tags ?? [],
        isGroup,
        messageCount,
        ownerMessageCount: 0,
        contactMessageCount: 0,
        latestMessageAt,
        chatSummary:
          messageCount > 0
            ? `已从 WeFlow 同步 ${messageCount} 条会话摘要，生成预览时会按需拉取更长聊天历史。`
            : "已从 WeFlow 同步联系人资料，生成预览时会按需读取聊天与朋友圈线索。",
        topicKeywords: [],
        sampleMessages: [],
        momentHighlights: [],
        evidenceWindow: null,
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
      const alias = normalizeText(contact.alias);
      const displayName =
        normalizeText(contact.displayName) ??
        remarkName ??
        nickname ??
        alias ??
        username;

      return {
        username,
        displayName,
        nickname,
        remarkName,
        alias,
        detailDescription: normalizeText(contact.detailDescription),
        region: normalizeText(contact.region),
        avatarUrl: normalizeText(contact.avatarUrl),
        tags: normalizeStringList(contact.labels),
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
  return dedupeMessageSamples(
    extractArray(value, ["messages", "items", "data"])
      .filter(isRecord)
      .map((item) => normalizeMessageSample(item as WeFlowMessageItem, isGroup))
      .filter((item): item is WechatSyncMessageSample => Boolean(item)),
  );
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

function extractMomentHighlights(value: unknown): WechatSyncMomentHighlight[] {
  return dedupeMomentHighlights(
    extractArray(value, ["timeline", "posts", "items", "data"])
      .filter(isRecord)
      .map((item) => normalizeMomentHighlight(item as WeFlowMomentItem))
      .filter((item): item is WechatSyncMomentHighlight => Boolean(item)),
  );
}

function normalizeMomentHighlight(
  post: WeFlowMomentItem,
): WechatSyncMomentHighlight | null {
  const mediaHint = describeMomentMedia(post.media);
  const text =
    normalizeText(post.contentDesc) ??
    normalizeText(post.content) ??
    normalizeText(post.desc) ??
    (mediaHint ? `发了一条${mediaHint}` : null);
  if (!text) {
    return null;
  }

  return {
    postedAt:
      normalizeTimestamp(post.createTime) ??
      normalizeTimestamp(post.timestamp) ??
      null,
    text,
    location: formatMomentLocation(post.location),
    mediaHint,
  };
}

function extractMessageText(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of [
    "text",
    "content",
    "displayText",
    "title",
    "desc",
    "description",
  ]) {
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
  momentHighlights: WechatSyncMomentHighlight[],
  evidenceWindow: WechatSyncEvidenceWindow | null,
) {
  const scope = describeMessageScope(evidenceWindow, sampleMessages.length);
  const pieces = [`已分析 ${scope}`];
  const firstMessageAt = sampleMessages[0]?.timestamp ?? null;
  const latestMessageAt = sampleMessages.at(-1)?.timestamp ?? null;
  if (firstMessageAt && latestMessageAt) {
    pieces.push(
      `时间跨度 ${formatShortTimestamp(firstMessageAt)} 至 ${formatShortTimestamp(latestMessageAt)}`,
    );
  } else if (totalMessageCount > 0) {
    pieces.push(`累计消息量至少 ${totalMessageCount} 条`);
  }

  const keywords = inferKeywords([
    ...sampleMessages.map((sample) => sample.text),
    ...momentHighlights.map((item) => item.text),
  ]).slice(0, 5);
  if (keywords.length) {
    pieces.push(`高频话题：${keywords.join("、")}`);
  }

  const latest = sampleMessages.at(-1)?.text?.trim();
  if (latest) {
    pieces.push(`最近一条：${latest.slice(0, 80)}`);
  }
  if (momentHighlights.length > 0) {
    pieces.push(`朋友圈 / 近况线索 ${momentHighlights.length} 条`);
  }

  return pieces.join("；");
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
    .slice(0, KEYWORD_LIMIT)
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

function resolveBundleOptions(
  request: ConnectorContactBundleRequest | undefined,
  username: string,
): NormalizedBundleOptions {
  const defaultOptions = normalizeBundleOptions(request?.defaultOptions);
  const override = normalizeBundleOptions(
    request?.contactOverrides?.[username],
    defaultOptions,
  );
  return override;
}

function normalizeBundleOptions(
  value?: ConnectorContactBundleOptions,
  base?: NormalizedBundleOptions,
): NormalizedBundleOptions {
  const messageMode =
    normalizeMessageMode(value?.messageMode) ??
    base?.messageMode ??
    "recent";
  const messageLimit =
    messageMode === "all"
      ? null
      : clampPositiveInteger(
          value?.messageLimit,
          1,
          MAX_RECENT_MESSAGE_LIMIT,
          base?.messageLimit ?? DEFAULT_MESSAGE_LIMIT,
        );
  return {
    messageMode,
    messageLimit,
    includeMoments: value?.includeMoments ?? base?.includeMoments ?? true,
    momentLimit: clampPositiveInteger(
      value?.momentLimit,
      1,
      MAX_MOMENT_LIMIT,
      base?.momentLimit ?? DEFAULT_MOMENT_LIMIT,
    ),
  };
}

function normalizeMessageMode(value: unknown) {
  return value === "all" ? "all" : value === "recent" ? "recent" : null;
}

function clampPositiveInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(normalized)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(normalized)));
}

function dedupeMessageSamples(samples: WechatSyncMessageSample[]) {
  const seen = new Set<string>();
  const merged: WechatSyncMessageSample[] = [];

  for (const sample of samples) {
    const key = [
      sample.timestamp,
      sample.sender ?? "",
      sample.typeLabel ?? "",
      sample.direction ?? "",
      sample.text,
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({ ...sample });
  }

  return merged.sort((left, right) => {
    const leftTime = Date.parse(left.timestamp);
    const rightTime = Date.parse(right.timestamp);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      return leftTime - rightTime;
    }
    return left.timestamp.localeCompare(right.timestamp);
  });
}

function dedupeMomentHighlights(items: WechatSyncMomentHighlight[]) {
  const seen = new Set<string>();
  const merged: WechatSyncMomentHighlight[] = [];

  for (const item of items) {
    const key = [item.postedAt ?? "", item.location ?? "", item.text].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({ ...item });
  }

  return merged.sort((left, right) => {
    const leftTime = Date.parse(left.postedAt ?? "");
    const rightTime = Date.parse(right.postedAt ?? "");
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });
}

function describeMomentMedia(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const kinds = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const type = normalizeText(entry.type) ?? normalizeText(entry.mediaType);
    if (type) {
      kinds.add(type.toLowerCase());
    }
  }

  if (!kinds.size) {
    return `${value.length} 个媒体内容`;
  }
  if (kinds.has("video")) {
    return value.length > 1 ? `${value.length} 个视频 / 图片媒体` : "视频朋友圈";
  }
  if (kinds.has("livephoto")) {
    return value.length > 1 ? `${value.length} 张实况照片 / 图片` : "实况照片";
  }
  if (kinds.has("image")) {
    return value.length > 1 ? `${value.length} 张图片` : "图片朋友圈";
  }

  return `${value.length} 个媒体内容`;
}

function formatMomentLocation(value: unknown) {
  if (typeof value === "string") {
    return normalizeText(value);
  }
  if (!isRecord(value)) {
    return null;
  }

  const parts = [
    normalizeText(value.country),
    normalizeText(value.province),
    normalizeText(value.city),
    normalizeText(value.poiName),
    normalizeText(value.poiAddress),
  ].filter((item): item is string => Boolean(item));

  return parts.length ? [...new Set(parts)].join(" / ") : null;
}

function extractHasMore(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  const direct = value.hasMore;
  if (typeof direct === "boolean") {
    return direct;
  }
  if (isRecord(value.pagination) && typeof value.pagination.hasMore === "boolean") {
    return value.pagination.hasMore;
  }
  if (isRecord(value.sync) && typeof value.sync.hasMore === "boolean") {
    return value.sync.hasMore;
  }

  return false;
}

function describeMessageScope(
  evidenceWindow: WechatSyncEvidenceWindow | null,
  fallbackCount: number,
) {
  const fetchedCount = evidenceWindow?.fetchedMessageCount ?? fallbackCount;
  if (evidenceWindow?.messageMode === "all") {
    return `全部消息（本次共读取 ${fetchedCount} 条）`;
  }
  const requestedLimit = evidenceWindow?.requestedMessageLimit ?? fetchedCount;
  return `最近 ${requestedLimit} 条消息（本次实际读取 ${fetchedCount} 条）`;
}

function formatShortTimestamp(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toISOString().slice(0, 10);
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
    throw new Error(`${label} 只允许使用 http://127.0.0.1 或 http://localhost。`);
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

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return [
      ...new Set(value.map((item) => normalizeText(item)).filter((item): item is string => Boolean(item))),
    ];
  }
  if (typeof value === "string") {
    return [
      ...new Set(
        value
          .split(/[;,，、\n]/u)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }
  return [];
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
    return `无法读取 WeFlow API：${url}，Access Token 无效、缺失或尚未开启接口访问权限。`;
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
