import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { WechatSyncContactBundle } from "./contracts.js";
import {
  mergeWechatSyncContactBundles,
  parseWechatSyncContactBundlesFromText,
  parseWechatSyncContactBundlesFromValue,
  type ParsedWechatSyncContactBundleResult,
} from "./contact-import-parser.js";

export interface ManualJsonScanResult {
  contacts: WechatSyncContactBundle[];
  sourceSummary: string;
  message: string;
}

const SUPPORTED_IMPORT_FILE_PATTERN = /\.(json|jsonl)$/iu;

export class ManualJsonProvider {
  async scanFromPath(filePath: string): Promise<ManualJsonScanResult> {
    const resolvedPath = path.resolve(filePath);
    const target = await stat(resolvedPath);

    if (target.isDirectory()) {
      return this.scanFromDirectory(resolvedPath);
    }

    const raw = await readFile(resolvedPath, "utf8");
    const parsed = parseWechatSyncContactBundlesFromText(raw);
    return buildManualJsonScanResult(
      parsed,
      path.basename(resolvedPath),
      `manual-json:${resolvedPath}`,
    );
  }

  scanFromValue(value: unknown, sourceLabel = "request-body"): ManualJsonScanResult {
    const parsed = parseWechatSyncContactBundlesFromValue(value);
    return buildManualJsonScanResult(
      parsed,
      sourceLabel,
      `manual-json:${sourceLabel}`,
    );
  }

  private async scanFromDirectory(directoryPath: string) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const candidateFiles = entries
      .filter((entry) => entry.isFile() && SUPPORTED_IMPORT_FILE_PATTERN.test(entry.name))
      .map((entry) => path.join(directoryPath, entry.name))
      .sort((left, right) => left.localeCompare(right));

    if (!candidateFiles.length) {
      throw new Error(
        "指定目录里没有可读取的 .json 或 .jsonl 联系人导入文件。",
      );
    }

    const parsedFiles = await Promise.all(
      candidateFiles.map(async (candidatePath) => {
        const raw = await readFile(candidatePath, "utf8");
        try {
          return parseWechatSyncContactBundlesFromText(raw);
        } catch (error) {
          throw new Error(
            `无法解析 ${path.basename(candidatePath)}：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );

    const contacts = mergeWechatSyncContactBundles(
      parsedFiles.flatMap((item) => item.contacts),
    );
    const parsed = {
      contacts,
      format:
        parsedFiles.length === 1
          ? parsedFiles[0]!.format
          : "contact-import-bundles-json",
      platforms: [
        ...new Set(parsedFiles.flatMap((item) => item.platforms)),
      ],
    } satisfies ParsedWechatSyncContactBundleResult;

    return buildManualJsonScanResult(
      parsed,
      `${path.basename(directoryPath)} (${candidateFiles.length} files)`,
      `manual-json:${directoryPath}`,
    );
  }
}

export function toContactSummary(
  bundle: WechatSyncContactBundle,
): {
  username: string;
  displayName: string;
  nickname?: string | null;
  remarkName?: string | null;
  region?: string | null;
  avatarUrl?: string | null;
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
    region: bundle.region ?? null,
    avatarUrl: bundle.avatarUrl ?? null,
    tags: bundle.tags,
    isGroup: bundle.isGroup,
    messageCount: bundle.messageCount,
    ownerMessageCount: bundle.ownerMessageCount,
    contactMessageCount: bundle.contactMessageCount,
    latestMessageAt: bundle.latestMessageAt,
    sampleSnippet:
      bundle.sampleMessages.find((sample) => sample.text.trim())?.text ??
      bundle.chatSummary ??
      null,
  };
}

function buildManualJsonScanResult(
  parsed: ParsedWechatSyncContactBundleResult,
  sourceLabel: string,
  sourceSummary: string,
): ManualJsonScanResult {
  const platformsLabel = formatPlatforms(parsed.platforms);
  const formatLabel = formatImportFormat(parsed.format);

  return {
    contacts: parsed.contacts,
    sourceSummary,
    message: parsed.contacts.length
      ? `已读取 ${parsed.contacts.length} 个联系人，来源格式：${formatLabel}，平台：${platformsLabel}。`
      : "连接器已启动，但当前输入里没有可用联系人。",
  };
}

function formatImportFormat(format: ParsedWechatSyncContactBundleResult["format"]) {
  switch (format) {
    case "chatlab-json":
      return "ChatLab JSON";
    case "chatlab-jsonl":
      return "ChatLab JSONL";
    case "contact-import-bundles-json":
      return "ContactImportBundle JSON";
    default:
      return "WechatSyncContactBundle JSON";
  }
}

function formatPlatforms(platforms: ParsedWechatSyncContactBundleResult["platforms"]) {
  if (!platforms.length) {
    return "unknown";
  }

  return platforms
    .map((platform) => {
      switch (platform) {
        case "wechat":
          return "WeChat";
        case "qq":
          return "QQ";
        case "telegram":
          return "Telegram";
        case "discord":
          return "Discord";
        case "whatsapp":
          return "WhatsApp";
        case "line":
          return "LINE";
        case "instagram":
          return "Instagram";
        case "slack":
          return "Slack";
        default:
          return "Unknown";
      }
    })
    .join(" / ");
}
