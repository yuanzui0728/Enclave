import type {
  WechatSyncContactBundle,
  WechatSyncMessageDirection,
  WechatSyncMessageSample,
  WechatSyncMomentHighlight,
} from "./contracts.js";
import type { ContactImportPlatformKey } from "./platforms.js";

export type StandardizedContactImportFormat =
  | "wechat-sync-bundles-json"
  | "contact-import-bundles-json"
  | "chatlab-json"
  | "chatlab-jsonl";

export interface ParsedWechatSyncContactBundleResult {
  contacts: WechatSyncContactBundle[];
  format: StandardizedContactImportFormat;
  platforms: ContactImportPlatformKey[];
}

interface ChatLabHeaderRecord {
  _type?: string;
  chatlab?: unknown;
  meta?: unknown;
}

interface ChatLabMemberRecord {
  _type?: string;
  platformId?: unknown;
  accountName?: unknown;
  groupNickname?: unknown;
}

interface ChatLabMessageRecord {
  _type?: string;
  sender?: unknown;
  accountName?: unknown;
  groupNickname?: unknown;
  timestamp?: unknown;
  type?: unknown;
  content?: unknown;
}

interface NormalizedChatLabMember {
  platformId: string;
  accountName: string | null;
  groupNickname: string | null;
}

interface NormalizedChatLabMessage {
  senderId: string | null;
  senderLabel: string | null;
  timestamp: string;
  text: string;
  typeLabel: string | null;
  direction: WechatSyncMessageDirection;
}

const CHATLAB_MESSAGE_LABELS = new Map<number, string>([
  [0, "TEXT"],
  [1, "IMAGE"],
  [2, "VOICE"],
  [3, "VIDEO"],
  [4, "FILE"],
  [5, "EMOJI"],
  [7, "LINK"],
  [8, "LOCATION"],
  [20, "RED_PACKET"],
  [21, "TRANSFER"],
  [22, "POKE"],
  [23, "CALL"],
  [24, "SHARE"],
  [25, "REPLY"],
  [26, "FORWARD"],
  [27, "CONTACT"],
  [80, "SYSTEM"],
  [81, "RECALL"],
  [99, "OTHER"],
]);

const KNOWN_PLATFORMS = new Set<ContactImportPlatformKey>([
  "wechat",
  "qq",
  "telegram",
  "discord",
  "whatsapp",
  "line",
  "instagram",
  "slack",
  "unknown",
]);

const CONTACT_IMPORT_MAX_SAMPLE_MESSAGES = 50_000;
const CONTACT_IMPORT_MAX_MOMENT_HIGHLIGHTS = 200;

export function parseWechatSyncContactBundlesFromText(
  raw: string,
): ParsedWechatSyncContactBundleResult {
  const normalized = raw.trim();
  if (!normalized) {
    throw new Error("联系人导入内容为空。");
  }

  try {
    return parseWechatSyncContactBundlesFromValue(JSON.parse(normalized));
  } catch (jsonError) {
    if (!looksLikeJsonl(normalized)) {
      throw new Error("联系人导入内容不是合法 JSON 或 ChatLab JSONL。");
    }

    try {
      return parseChatLabJsonl(normalized);
    } catch (jsonlError) {
      throw buildCombinedParseError(jsonError, jsonlError);
    }
  }
}

export function parseWechatSyncContactBundlesFromValue(
  value: unknown,
): ParsedWechatSyncContactBundleResult {
  if (isChatLabExport(value)) {
    const bundle = parseChatLabExport(value);
    return {
      contacts: [bundle],
      format: "chatlab-json",
      platforms: [inferContactImportPlatform(bundle.source, bundle.username)],
    };
  }

  const entries = extractBundleEntries(value);
  if (!entries.length) {
    throw new Error("联系人导入内容里没有可用的联系人或 ChatLab 会话。");
  }

  const hasGenericPlatformFields = entries.some(
    (entry) =>
      isRecord(entry) &&
      (readText(entry.platform) != null || readText(entry.platformId) != null),
  );

  const contacts = mergeWechatSyncContactBundles(
    entries.map((entry, index) => normalizeBundleEntry(entry, index)),
  );
  if (!contacts.length) {
    throw new Error("联系人导入内容为空，无法生成预览。");
  }

  return {
    contacts,
    format: hasGenericPlatformFields
      ? "contact-import-bundles-json"
      : "wechat-sync-bundles-json",
    platforms: collectPlatforms(contacts),
  };
}

export function mergeWechatSyncContactBundles(
  bundles: WechatSyncContactBundle[],
): WechatSyncContactBundle[] {
  const merged = new Map<string, WechatSyncContactBundle>();

  for (const bundle of bundles) {
    const current = merged.get(bundle.username);
    if (!current) {
      merged.set(bundle.username, cloneBundle(bundle));
      continue;
    }

    const sampleMessages = mergeMessageSamples(
      current.sampleMessages,
      bundle.sampleMessages,
    );
    const momentHighlights = mergeMomentHighlights(
      current.momentHighlights,
      bundle.momentHighlights,
    );
    const messageCount = Math.max(
      current.messageCount,
      bundle.messageCount,
      sampleMessages.length,
    );
    const ownerMessageCount = Math.max(
      current.ownerMessageCount,
      bundle.ownerMessageCount,
      sampleMessages.filter((item) => item.direction === "owner").length,
    );
    const contactMessageCount = Math.max(
      current.contactMessageCount,
      bundle.contactMessageCount,
      sampleMessages.filter(
        (item) =>
          item.direction === "contact" || item.direction === "group_member",
      ).length,
    );
    const latestMessageAt = pickLatestTimestamp(
      current.latestMessageAt ?? null,
      bundle.latestMessageAt ?? null,
    );

    merged.set(bundle.username, {
      username: bundle.username,
      displayName: pickPreferredLabel(
        current.displayName,
        bundle.displayName,
        bundle.username,
      ),
      nickname: pickNullableLabel(
        current.nickname ?? null,
        bundle.nickname ?? null,
        bundle.username,
      ),
      remarkName: pickNullableLabel(
        current.remarkName ?? null,
        bundle.remarkName ?? null,
        bundle.username,
      ),
      alias: pickNullableLabel(
        current.alias ?? null,
        bundle.alias ?? null,
        bundle.username,
      ),
      detailDescription: pickNullableLabel(
        current.detailDescription ?? null,
        bundle.detailDescription ?? null,
        bundle.username,
      ),
      region: pickNullableLabel(
        current.region ?? null,
        bundle.region ?? null,
        bundle.username,
      ),
      avatarUrl: pickNullableLabel(
        current.avatarUrl ?? null,
        bundle.avatarUrl ?? null,
        bundle.username,
      ),
      source: pickPreferredSource(current.source ?? null, bundle.source ?? null),
      tags: mergeStringLists(current.tags, bundle.tags),
      isGroup: current.isGroup || bundle.isGroup,
      messageCount,
      ownerMessageCount,
      contactMessageCount,
      latestMessageAt,
      chatSummary: pickPreferredSummary(
        current.chatSummary ?? null,
        bundle.chatSummary ?? null,
        latestMessageAt,
        current.latestMessageAt ?? null,
        bundle.latestMessageAt ?? null,
      ),
      topicKeywords: mergeStringLists(
        current.topicKeywords,
        bundle.topicKeywords,
      ).slice(0, 8),
      sampleMessages,
      momentHighlights,
      evidenceWindow:
        bundle.evidenceWindow ??
        current.evidenceWindow ??
        null,
    });
  }

  return [...merged.values()].sort(compareBundles);
}

export function inferContactImportPlatform(
  source?: string | null,
  username?: string | null,
): ContactImportPlatformKey {
  const normalizedSource = source?.trim().toLowerCase() ?? "";
  if (normalizedSource.includes("telegram")) {
    return "telegram";
  }
  if (normalizedSource.includes("discord")) {
    return "discord";
  }
  if (normalizedSource.includes("whatsapp")) {
    return "whatsapp";
  }
  if (normalizedSource.includes("instagram")) {
    return "instagram";
  }
  if (normalizedSource.includes("slack")) {
    return "slack";
  }
  if (normalizedSource.includes("line")) {
    return "line";
  }
  if (
    normalizedSource.includes("wechat") ||
    normalizedSource.includes("weflow")
  ) {
    return "wechat";
  }
  if (normalizedSource.includes("qq")) {
    return "qq";
  }

  const normalizedUsername = username?.trim().toLowerCase() ?? "";
  if (normalizedUsername.startsWith("telegram:")) {
    return "telegram";
  }
  if (normalizedUsername.startsWith("discord:")) {
    return "discord";
  }
  if (normalizedUsername.startsWith("qq:")) {
    return "qq";
  }
  if (normalizedUsername.startsWith("whatsapp:")) {
    return "whatsapp";
  }
  if (normalizedUsername.startsWith("line:")) {
    return "line";
  }
  if (normalizedUsername.startsWith("instagram:")) {
    return "instagram";
  }
  if (normalizedUsername.startsWith("slack:")) {
    return "slack";
  }
  if (
    normalizedUsername.startsWith("wxid_") ||
    normalizedUsername.endsWith("@chatroom") ||
    normalizedUsername.startsWith("wechat:")
  ) {
    return "wechat";
  }

  return "unknown";
}

function parseChatLabJsonl(
  raw: string,
): ParsedWechatSyncContactBundleResult {
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (!lines.length) {
    throw new Error("ChatLab JSONL 文件为空。");
  }

  let header: ChatLabHeaderRecord | null = null;
  const members: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];

  for (const [index, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(index === 0 ? stripBom(line) : line);
    } catch {
      throw new Error(`ChatLab JSONL 第 ${index + 1} 行不是合法 JSON。`);
    }

    if (!isRecord(parsed)) {
      throw new Error(`ChatLab JSONL 第 ${index + 1} 行不是对象。`);
    }

    const rowType = readText(parsed._type);
    if (rowType === "header") {
      header = parsed as ChatLabHeaderRecord;
      continue;
    }
    if (rowType === "member") {
      members.push(parsed);
      continue;
    }
    if (rowType === "message") {
      messages.push(parsed);
      continue;
    }

    throw new Error(`ChatLab JSONL 第 ${index + 1} 行的 _type 不受支持。`);
  }

  if (!header || !isRecord(header.chatlab) || !isRecord(header.meta)) {
    throw new Error("ChatLab JSONL 缺少 header/chatlab/meta。");
  }

  const bundle = parseChatLabExport({
    chatlab: header.chatlab,
    meta: header.meta,
    members,
    messages,
  });

  return {
    contacts: [bundle],
    format: "chatlab-jsonl",
    platforms: [inferContactImportPlatform(bundle.source, bundle.username)],
  };
}

function parseChatLabExport(value: unknown): WechatSyncContactBundle {
  if (!isRecord(value) || !isRecord(value.meta)) {
    throw new Error("ChatLab 导出缺少 meta。");
  }

  const meta = value.meta;
  const platform = normalizePlatform(readText(meta.platform));
  const name = readText(meta.name);
  const isGroup = normalizeChatType(readText(meta.type)) === "group";
  const ownerId = readText(meta.ownerId);
  const members = normalizeChatLabMembers(value.members);
  const memberMap = new Map(
    members.map((member) => [member.platformId, member]),
  );
  const messages = normalizeChatLabMessages(
    value.messages,
    memberMap,
    ownerId,
    isGroup,
  );
  const identity = isGroup
    ? resolveGroupIdentity(meta, platform, name)
    : resolvePrivateIdentity(meta, platform, name, ownerId, memberMap, messages);
  const latestMessageAt = inferLatestMessageAt(messages);
  const messageCount = messages.length;
  const ownerMessageCount = messages.filter(
    (item) => item.direction === "owner",
  ).length;
  const contactMessageCount = messages.filter(
    (item) =>
      item.direction === "contact" || item.direction === "group_member",
  ).length;
  const sampleMessages = messages
    .slice(-CONTACT_IMPORT_MAX_SAMPLE_MESSAGES)
    .map((item) => ({
    timestamp: item.timestamp,
    text: item.text,
    sender: item.senderLabel,
    typeLabel: item.typeLabel,
    direction: item.direction,
    }));

  return {
    username: identity.username,
    displayName: identity.displayName,
    nickname: identity.nickname,
    remarkName: identity.remarkName,
    alias: null,
    detailDescription: null,
    region: null,
    avatarUrl: null,
    source: `chatlab:${platform}`,
    tags: [],
    isGroup,
    messageCount,
    ownerMessageCount,
    contactMessageCount,
    latestMessageAt,
    chatSummary: buildChatSummary(identity.displayName, messageCount, sampleMessages),
    topicKeywords: inferKeywords(messages.map((item) => item.text)),
    sampleMessages,
    momentHighlights: [],
    evidenceWindow: {
      messageMode: "recent",
      requestedMessageLimit: sampleMessages.length,
      fetchedMessageCount: sampleMessages.length,
      includeMoments: false,
      requestedMomentLimit: 0,
      fetchedMomentCount: 0,
    },
  };
}

function normalizeBundleEntry(
  value: unknown,
  index: number,
): WechatSyncContactBundle {
  if (!isRecord(value)) {
    throw new Error(`第 ${index + 1} 个联系人不是对象。`);
  }

  const platform = normalizePlatform(
    readText(value.platform) ??
      inferContactImportPlatform(
        readText(value.source),
        readText(value.username) ??
          readText(value.platformId) ??
          readText(value.id),
      ),
  );
  const platformId = readText(value.platformId);
  const legacyId =
    readText(value.username) ??
    readText(value.wxid) ??
    readText(value.contactId) ??
    readText(value.id);
  const rawUsername = platformId
    ? buildImportedUsername(platform, platformId)
    : legacyId;

  if (!rawUsername) {
    throw new Error(`第 ${index + 1} 个联系人缺少 username 或 platformId。`);
  }

  const nickname =
    readText(value.nickname) ?? readText(value.nickName) ?? null;
  const remarkName = readText(value.remarkName) ?? readText(value.remark) ?? null;
  const displayName =
    readText(value.displayName) ??
    readText(value.name) ??
    remarkName ??
    nickname ??
    rawUsername;
  const sampleMessages = normalizeMessageSamples(value.sampleMessages);
  const latestMessageAt =
    normalizeTimestamp(value.latestMessageAt) ?? inferLatestMessageAt(sampleMessages);
  const ownerMessageCount =
    normalizeCount(value.ownerMessageCount) ??
    sampleMessages.filter((item) => item.direction === "owner").length;
  const contactMessageCount =
    normalizeCount(value.contactMessageCount) ??
    sampleMessages.filter(
      (item) =>
        item.direction === "contact" || item.direction === "group_member",
    ).length;
  const messageCount =
    normalizeCount(value.messageCount) ??
    Math.max(sampleMessages.length, ownerMessageCount + contactMessageCount);

  return {
    username:
      platform !== "wechat" ? buildImportedUsername(platform, rawUsername) : rawUsername,
    displayName,
    nickname,
    remarkName,
    alias: readText(value.alias) ?? readText(value.wechatNumber) ?? null,
    detailDescription:
      readText(value.detailDescription) ??
      readText(value.signature) ??
      readText(value.bio) ??
      null,
    region: readText(value.region) ?? null,
    avatarUrl: readText(value.avatarUrl) ?? readText(value.avatar) ?? null,
    source:
      readText(value.source) ??
      (platformId ? `contact-import:${platform}` : "manual-json"),
    tags: normalizeStringList(value.tags),
    isGroup:
      normalizeBoolean(value.isGroup) ??
      inferIsGroup(readText(value.type), rawUsername),
    messageCount,
    ownerMessageCount,
    contactMessageCount,
    latestMessageAt,
    chatSummary:
      readText(value.chatSummary) ??
      buildChatSummary(displayName, messageCount, sampleMessages),
    topicKeywords:
      normalizeStringList(value.topicKeywords).length > 0
        ? normalizeStringList(value.topicKeywords)
        : inferKeywords(sampleMessages.map((item) => item.text)),
    sampleMessages,
    momentHighlights: normalizeMomentHighlights(value.momentHighlights),
    evidenceWindow: normalizeEvidenceWindow(value.evidenceWindow),
  };
}

function extractBundleEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return [];
  }

  for (const key of ["contacts", "items", "data", "bundles"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function normalizeChatLabMembers(value: unknown): NormalizedChatLabMember[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const record = entry as ChatLabMemberRecord;
      const platformId = readText(record.platformId);
      if (!platformId) {
        return null;
      }

      return {
        platformId,
        accountName: readText(record.accountName) ?? null,
        groupNickname: readText(record.groupNickname) ?? null,
      } satisfies NormalizedChatLabMember;
    })
    .filter((entry): entry is NormalizedChatLabMember => Boolean(entry));
}

function normalizeChatLabMessages(
  value: unknown,
  memberMap: Map<string, NormalizedChatLabMember>,
  ownerId: string | null,
  isGroup: boolean,
): NormalizedChatLabMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const record = entry as ChatLabMessageRecord;
      const senderId = readText(record.sender);
      const typeValue = normalizeCount(record.type);
      const typeLabel =
        typeValue != null ? CHATLAB_MESSAGE_LABELS.get(typeValue) ?? null : null;
      const text =
        readText(record.content) ??
        (typeLabel ? `[${typeLabel}]` : null);
      if (!text) {
        return null;
      }

      const senderMember = senderId ? memberMap.get(senderId) : undefined;
      const senderLabel =
        readText(record.groupNickname) ??
        readText(record.accountName) ??
        senderMember?.groupNickname ??
        senderMember?.accountName ??
        senderId ??
        null;

      return {
        senderId,
        senderLabel,
        timestamp: normalizeTimestamp(record.timestamp) ?? new Date(0).toISOString(),
        text,
        typeLabel,
        direction: normalizeChatLabDirection(typeValue, senderId, ownerId, isGroup),
      } satisfies NormalizedChatLabMessage;
    })
    .filter((entry): entry is NormalizedChatLabMessage => Boolean(entry))
    .sort((left, right) => {
      const leftTime = Date.parse(left.timestamp);
      const rightTime = Date.parse(right.timestamp);
      return leftTime - rightTime;
    });
}

function resolveGroupIdentity(
  meta: Record<string, unknown>,
  platform: ContactImportPlatformKey,
  name: string | null,
) {
  const groupId = readText(meta.groupId) ?? name ?? "group";
  return {
    username: buildImportedUsername(platform, groupId),
    displayName: name ?? groupId,
    nickname: null,
    remarkName: null,
  };
}

function resolvePrivateIdentity(
  meta: Record<string, unknown>,
  platform: ContactImportPlatformKey,
  name: string | null,
  ownerId: string | null,
  memberMap: Map<string, NormalizedChatLabMember>,
  messages: NormalizedChatLabMessage[],
) {
  const memberIds = [...memberMap.keys()].filter((id) => id !== ownerId);
  const frequency = new Map<string, number>();
  for (const message of messages) {
    if (!message.senderId || message.senderId === ownerId) {
      continue;
    }
    frequency.set(message.senderId, (frequency.get(message.senderId) ?? 0) + 1);
  }

  const rankedIds = [...frequency.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([id]) => id);
  const platformId =
    rankedIds[0] ?? memberIds[0] ?? readText(meta.groupId) ?? name ?? "contact";
  const member = memberMap.get(platformId);
  const displayName =
    member?.groupNickname ??
    member?.accountName ??
    name ??
    platformId;

  return {
    username: buildImportedUsername(platform, platformId),
    displayName,
    nickname: member?.accountName ?? null,
    remarkName: member?.groupNickname ?? null,
  };
}

function normalizeMessageSamples(value: unknown): WechatSyncMessageSample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: WechatSyncMessageSample[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const text = readText(entry.text) ?? readText(entry.content);
    if (!text) {
      continue;
    }

    normalized.push({
      timestamp:
        normalizeTimestamp(entry.timestamp) ??
        normalizeTimestamp(entry.createdAt) ??
        new Date(0).toISOString(),
      text,
      sender: readText(entry.sender) ?? null,
      typeLabel: readText(entry.typeLabel) ?? readText(entry.type) ?? null,
      direction: normalizeDirection(
        readText(entry.direction) as WechatSyncMessageDirection | null,
      ),
    });
  }

  return normalized
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .slice(-CONTACT_IMPORT_MAX_SAMPLE_MESSAGES);
}

function normalizeMomentHighlights(value: unknown): WechatSyncMomentHighlight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: WechatSyncMomentHighlight[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const text = readText(entry.text) ?? readText(entry.content);
    if (!text) {
      continue;
    }

    normalized.push({
      postedAt:
        normalizeTimestamp(entry.postedAt) ??
        normalizeTimestamp(entry.timestamp) ??
        null,
      text,
      location: readText(entry.location) ?? null,
      mediaHint: readText(entry.mediaHint) ?? null,
    });
  }

  return normalized.slice(-CONTACT_IMPORT_MAX_MOMENT_HIGHLIGHTS);
}

function normalizeEvidenceWindow(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const messageMode = value.messageMode === "all" ? "all" : "recent";
  return {
    messageMode,
    requestedMessageLimit: normalizeCount(value.requestedMessageLimit) ?? null,
    fetchedMessageCount: normalizeCount(value.fetchedMessageCount) ?? null,
    includeMoments: normalizeBoolean(value.includeMoments) ?? true,
    requestedMomentLimit: normalizeCount(value.requestedMomentLimit) ?? null,
    fetchedMomentCount: normalizeCount(value.fetchedMomentCount) ?? null,
  } satisfies NonNullable<WechatSyncContactBundle["evidenceWindow"]>;
}

function normalizeDirection(
  value: WechatSyncMessageDirection | null,
): WechatSyncMessageDirection {
  switch (value) {
    case "owner":
    case "contact":
    case "group_member":
    case "system":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function normalizeChatLabDirection(
  typeValue: number | null,
  senderId: string | null,
  ownerId: string | null,
  isGroup: boolean,
): WechatSyncMessageDirection {
  if (typeValue === 80 || typeValue === 81 || typeValue === 99) {
    return "system";
  }
  if (senderId && ownerId && senderId === ownerId) {
    return "owner";
  }
  if (isGroup && senderId) {
    return "group_member";
  }
  if (senderId) {
    return "contact";
  }
  return "unknown";
}

function normalizePlatform(value: string | null): ContactImportPlatformKey {
  if (value && KNOWN_PLATFORMS.has(value as ContactImportPlatformKey)) {
    return value as ContactImportPlatformKey;
  }
  return "unknown";
}

function normalizeChatType(value: string | null) {
  if (value === "group" || value === "private") {
    return value;
  }
  return "private";
}

function inferIsGroup(type: string | null, username: string) {
  return (
    normalizeChatType(type) === "group" || username.trim().endsWith("@chatroom")
  );
}

function buildImportedUsername(
  platform: ContactImportPlatformKey,
  platformId: string,
) {
  const normalized = platformId.trim();
  if (!normalized) {
    return normalized;
  }
  if (platform === "wechat") {
    return normalized.replace(/^wechat:/u, "");
  }
  return normalized.startsWith(`${platform}:`) ? normalized : `${platform}:${normalized}`;
}

function buildChatSummary(
  displayName: string,
  totalMessageCount: number,
  sampleMessages: WechatSyncMessageSample[],
) {
  const latest = sampleMessages.at(-1)?.text?.trim();
  if (latest) {
    return `已导入 ${Math.max(totalMessageCount, sampleMessages.length)} 条消息，最近一条：${latest.slice(0, 80)}`;
  }
  if (totalMessageCount > 0) {
    return `已从 ${displayName} 导入 ${totalMessageCount} 条消息。`;
  }
  return null;
}

function inferLatestMessageAt(
  samples: Array<{ timestamp: string }>,
): string | null {
  const timestamps = samples
    .map((item) => Date.parse(item.timestamp))
    .filter((item) => Number.isFinite(item));
  if (!timestamps.length) {
    return null;
  }
  return new Date(Math.max(...timestamps)).toISOString();
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

function collectPlatforms(bundles: WechatSyncContactBundle[]) {
  return [
    ...new Set(
      bundles.map((bundle) =>
        inferContactImportPlatform(bundle.source, bundle.username),
      ),
    ),
  ];
}

function compareBundles(left: WechatSyncContactBundle, right: WechatSyncContactBundle) {
  const leftTime = Date.parse(left.latestMessageAt ?? "");
  const rightTime = Date.parse(right.latestMessageAt ?? "");
  return (
    (Number.isFinite(rightTime) ? rightTime : 0) -
      (Number.isFinite(leftTime) ? leftTime : 0) ||
    right.messageCount - left.messageCount ||
    left.displayName.localeCompare(right.displayName)
  );
}

function cloneBundle(bundle: WechatSyncContactBundle): WechatSyncContactBundle {
  return {
    ...bundle,
    tags: [...bundle.tags],
    topicKeywords: [...bundle.topicKeywords],
    sampleMessages: bundle.sampleMessages.map((item) => ({ ...item })),
    momentHighlights: bundle.momentHighlights.map((item) => ({ ...item })),
    evidenceWindow: bundle.evidenceWindow
      ? { ...bundle.evidenceWindow }
      : null,
  };
}

function mergeMessageSamples(
  left: WechatSyncMessageSample[],
  right: WechatSyncMessageSample[],
) {
  const seen = new Set<string>();
  const merged: WechatSyncMessageSample[] = [];

  for (const sample of [...left, ...right]) {
    const key = [
      sample.timestamp,
      sample.sender ?? "",
      sample.direction ?? "",
      sample.text,
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({ ...sample });
  }

  return merged
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-CONTACT_IMPORT_MAX_SAMPLE_MESSAGES);
}

function mergeMomentHighlights(
  left: WechatSyncMomentHighlight[],
  right: WechatSyncMomentHighlight[],
) {
  const seen = new Set<string>();
  const merged: WechatSyncMomentHighlight[] = [];

  for (const item of [...left, ...right]) {
    const key = [item.postedAt ?? "", item.location ?? "", item.text].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({ ...item });
  }

  return merged
    .sort((a, b) => Date.parse(a.postedAt ?? "") - Date.parse(b.postedAt ?? ""))
    .slice(-CONTACT_IMPORT_MAX_MOMENT_HIGHLIGHTS);
}

function mergeStringLists(left: string[], right: string[]) {
  return [...new Set([...left, ...right].map((item) => item.trim()).filter(Boolean))];
}

function pickLatestTimestamp(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function pickPreferredSource(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (left === "manual-json" && right !== "manual-json") {
    return right;
  }
  if (right.length > left.length) {
    return right;
  }
  return left;
}

function pickPreferredSummary(
  left: string | null,
  right: string | null,
  latestMessageAt: string | null,
  leftLatestMessageAt: string | null,
  rightLatestMessageAt: string | null,
) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (
    latestMessageAt &&
    rightLatestMessageAt &&
    latestMessageAt === rightLatestMessageAt &&
    latestMessageAt !== leftLatestMessageAt
  ) {
    return right;
  }
  return right.length > left.length ? right : left;
}

function pickPreferredLabel(
  left: string,
  right: string,
  fallback: string,
) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (left === fallback && right !== fallback) {
    return right;
  }
  if (right === fallback && left !== fallback) {
    return left;
  }
  return right.length > left.length ? right : left;
}

function pickNullableLabel(
  left: string | null,
  right: string | null,
  fallback: string,
) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return pickPreferredLabel(left, right, fallback);
}

function looksLikeJsonl(value: string) {
  return value.includes("\n") && value.includes("\"_type\"");
}

function isChatLabExport(value: unknown) {
  return (
    isRecord(value) &&
    isRecord(value.chatlab) &&
    isRecord(value.meta) &&
    Array.isArray(value.messages)
  );
}

function buildCombinedParseError(jsonError: unknown, jsonlError: unknown) {
  const jsonMessage =
    jsonError instanceof Error ? jsonError.message : "未知 JSON 错误";
  const jsonlMessage =
    jsonlError instanceof Error ? jsonlError.message : "未知 JSONL 错误";
  return new Error(
    `联系人导入内容无法解析为 JSON 或 ChatLab JSONL。JSON: ${jsonMessage}; JSONL: ${jsonlMessage}`,
  );
}

function stripBom(value: string) {
  return value.replace(/^\uFEFF/u, "");
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const direct = Date.parse(trimmed);
    if (Number.isFinite(direct)) {
      return new Date(direct).toISOString();
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return normalizeTimestamp(numeric);
    }
  }
  return null;
}

function normalizeCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return null;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => readText(item) ?? "").filter(Boolean))];
}

function readText(value: unknown) {
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
