import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  WechatSyncContactBundle,
  WechatSyncMessageDirection,
  WechatSyncMessageSample,
  WechatSyncMomentHighlight,
} from "./contracts.js";

export interface ManualJsonScanResult {
  contacts: WechatSyncContactBundle[];
  sourceSummary: string;
  message: string;
}

export class ManualJsonProvider {
  async scanFromPath(filePath: string): Promise<ManualJsonScanResult> {
    const raw = await readFile(filePath, "utf8");
    return this.scanFromValue(JSON.parse(raw) as unknown, path.basename(filePath));
  }

  scanFromValue(value: unknown, sourceLabel = "request-body"): ManualJsonScanResult {
    const contacts = extractContactArray(value)
      .map((item, index) => normalizeBundle(item, index))
      .filter((item): item is WechatSyncContactBundle => Boolean(item));

    return {
      contacts,
      sourceSummary: `manual-json:${sourceLabel}`,
      message: contacts.length
        ? `已读取 ${contacts.length} 个联系人。`
        : "连接器已启动，但当前输入里没有可用联系人。",
    };
  }
}

export function toContactSummary(
  bundle: WechatSyncContactBundle,
): {
  username: string;
  displayName: string;
  nickname?: string | null;
  remarkName?: string | null;
  tags: string[];
  isGroup: boolean;
  messageCount: number;
  ownerMessageCount: number;
  contactMessageCount: number;
  latestMessageAt?: string | null;
  sampleSnippet?: string | null;
} {
  return {
    username: bundle.username,
    displayName: bundle.displayName,
    nickname: bundle.nickname,
    remarkName: bundle.remarkName,
    tags: bundle.tags,
    isGroup: bundle.isGroup,
    messageCount: bundle.messageCount,
    ownerMessageCount: bundle.ownerMessageCount,
    contactMessageCount: bundle.contactMessageCount,
    latestMessageAt: bundle.latestMessageAt,
    sampleSnippet:
      bundle.sampleMessages.find((sample) => sample.text.trim())?.text ?? null,
  };
}

function extractContactArray(value: unknown): unknown[] {
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

function normalizeBundle(
  value: unknown,
  index: number,
): WechatSyncContactBundle | null {
  if (!isRecord(value)) {
    return null;
  }

  const username =
    readString(value, "username") ??
    readString(value, "wxid") ??
    readString(value, "contactId") ??
    readString(value, "id");

  if (!username) {
    return null;
  }

  const nickname =
    readString(value, "nickname") ?? readString(value, "nickName");
  const remarkName =
    readString(value, "remarkName") ?? readString(value, "remark");
  const displayName =
    readString(value, "displayName") ??
    remarkName ??
    nickname ??
    readString(value, "name") ??
    username;
  const sampleMessages = readMessageSamples(value["sampleMessages"]);
  const latestMessageAt =
    readString(value, "latestMessageAt") ??
    inferLatestMessageAt(sampleMessages) ??
    null;
  const ownerMessageCount =
    readNumber(value, "ownerMessageCount") ??
    sampleMessages.filter((sample) => sample.direction === "owner").length;
  const contactMessageCount =
    readNumber(value, "contactMessageCount") ??
    sampleMessages.filter((sample) => sample.direction === "contact").length;
  const messageCount =
    readNumber(value, "messageCount") ??
    Math.max(sampleMessages.length, ownerMessageCount + contactMessageCount);
  const tags = readStringArray(value["tags"]);
  const topicKeywords =
    readStringArray(value["topicKeywords"]).length > 0
      ? readStringArray(value["topicKeywords"])
      : inferKeywords([
          readString(value, "chatSummary"),
          ...sampleMessages.map((sample) => sample.text),
        ]);

  return {
    username,
    displayName,
    nickname,
    remarkName,
    region: readString(value, "region"),
    source: readString(value, "source") ?? "manual-json",
    tags,
    isGroup: readBoolean(value, "isGroup") ?? username.endsWith("@chatroom"),
    messageCount,
    ownerMessageCount,
    contactMessageCount,
    latestMessageAt,
    chatSummary: readString(value, "chatSummary"),
    topicKeywords,
    sampleMessages,
    momentHighlights: readMomentHighlights(value["momentHighlights"]),
  };
}

function readMessageSamples(value: unknown): WechatSyncMessageSample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): WechatSyncMessageSample | null => {
      if (!isRecord(item)) {
        return null;
      }

      const text = readString(item, "text") ?? readString(item, "content");
      if (!text) {
        return null;
      }

      return {
        timestamp:
          readString(item, "timestamp") ??
          readString(item, "createdAt") ??
          new Date(0).toISOString(),
        text,
        sender: readString(item, "sender"),
        typeLabel: readString(item, "typeLabel") ?? readString(item, "type"),
        direction: normalizeDirection(readString(item, "direction")),
      };
    })
    .filter((sample): sample is WechatSyncMessageSample => Boolean(sample))
    .slice(0, 40);
}

function readMomentHighlights(value: unknown): WechatSyncMomentHighlight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): WechatSyncMomentHighlight | null => {
      if (!isRecord(item)) {
        return null;
      }

      const text = readString(item, "text") ?? readString(item, "content");
      if (!text) {
        return null;
      }

      return {
        postedAt: readString(item, "postedAt") ?? readString(item, "timestamp"),
        text,
        location: readString(item, "location"),
        mediaHint: readString(item, "mediaHint"),
      };
    })
    .filter((item): item is WechatSyncMomentHighlight => Boolean(item))
    .slice(0, 20);
}

function normalizeDirection(
  value: string | null,
): WechatSyncMessageDirection | undefined {
  if (
    value === "owner" ||
    value === "contact" ||
    value === "group_member" ||
    value === "system" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
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

function inferKeywords(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    for (const token of (value ?? "").match(/[\p{L}\p{N}_]{2,}/gu) ?? []) {
      const normalized = token.toLowerCase();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([token]) => token);
}

function readString(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed || null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

function readNumber(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.trunc(raw));
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return null;
}

function readBoolean(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
