import { stat } from "node:fs/promises";

import {
  CONNECTOR_VERSION,
  type ConnectorActiveConfig,
  type ConnectorConfigResponse,
  type ConnectorContactBundleRequest,
  type ConnectorContactSummary,
  type ConnectorHealth,
  type ConnectorScanRequest,
  type ConnectorScanResponse,
  toConfigResponse,
  type WechatSyncContactBundle,
} from "./contracts.js";
import {
  applyConfigPatch,
  type ConnectorConfig,
} from "./config.js";
import { ManualJsonProvider, toContactSummary } from "./manual-json-provider.js";

export class ConnectorRuntime {
  private config: ConnectorConfig;
  private readonly provider = new ManualJsonProvider();
  private contacts = new Map<string, WechatSyncContactBundle>();
  private lastScanAt: string | null = null;
  private sourceSummary: string | null = null;

  constructor(config: ConnectorConfig) {
    this.config = config;
    this.sourceSummary = config.manualJsonPath
      ? `manual-json:${config.manualJsonPath}`
      : null;
  }

  getConfig() {
    return this.config;
  }

  getConfigResponse(): ConnectorConfigResponse {
    return toConfigResponse(this.config);
  }

  patchConfig(patch: Partial<Pick<ConnectorConfig, "connectorLabel" | "manualJsonPath">>) {
    this.config = applyConfigPatch(this.config, patch);
    this.sourceSummary = this.config.manualJsonPath
      ? `manual-json:${this.config.manualJsonPath}`
      : null;
    return this.getConfigResponse();
  }

  getHealth(): ConnectorHealth {
    return {
      ok: true,
      version: CONNECTOR_VERSION,
      lastScanAt: this.lastScanAt,
      contactCount: this.contacts.size,
      activeConfig: this.getActiveConfig(),
    };
  }

  async scan(body: ConnectorScanRequest | null): Promise<ConnectorScanResponse> {
    const scannedAt = new Date().toISOString();
    const manualJsonPath = normalizeText(body?.manualJsonPath);
    if (manualJsonPath) {
      this.patchConfig({ manualJsonPath });
    }

    const result =
      body && Object.hasOwn(body, "contacts")
        ? this.provider.scanFromValue(body.contacts, body.sourceLabel ?? "request-body")
        : this.config.manualJsonPath
          ? await this.scanConfiguredPath(this.config.manualJsonPath)
          : {
              contacts: [],
              sourceSummary: "manual-json:未配置",
              message:
                "连接器已启动，尚未配置本地 JSON 数据源。可设置 WECHAT_CONNECTOR_MANUAL_JSON_PATH 或调用 PATCH /api/config。",
            };

    this.contacts = new Map(
      result.contacts.map((contact) => [contact.username, contact]),
    );
    this.lastScanAt = scannedAt;
    this.sourceSummary = result.sourceSummary;

    return {
      ok: true,
      message: result.message,
      lastScanAt: scannedAt,
      contactCount: this.contacts.size,
      latestMessageAt: this.getLatestMessageAt(),
      activeConfig: this.getActiveConfig(),
    };
  }

  listContacts(options: {
    query?: string | null;
    includeGroups?: boolean;
    limit?: number;
  }): ConnectorContactSummary[] {
    const query = normalizeText(options.query)?.toLowerCase();
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);

    return [...this.contacts.values()]
      .filter((contact) => options.includeGroups || !contact.isGroup)
      .filter((contact) => {
        if (!query) {
          return true;
        }

        return [
          contact.username,
          contact.displayName,
          contact.nickname,
          contact.remarkName,
          ...contact.tags,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
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
      })
      .slice(0, limit)
      .map(toContactSummary);
  }

  buildBundles(request: ConnectorContactBundleRequest): WechatSyncContactBundle[] {
    const usernames = request.usernames?.length
      ? request.usernames
      : [...this.contacts.keys()];

    return usernames
      .map((username) => this.contacts.get(username))
      .filter((contact): contact is WechatSyncContactBundle => Boolean(contact));
  }

  private async scanConfiguredPath(filePath: string) {
    await stat(filePath);
    return this.provider.scanFromPath(filePath);
  }

  private getActiveConfig(): ConnectorActiveConfig {
    return {
      connectorLabel: this.config.connectorLabel,
      sourceSummary: this.sourceSummary,
      providerKey: this.config.providerKey,
      manualJsonPath: this.config.manualJsonPath,
    };
  }

  private getLatestMessageAt() {
    const timestamps = [...this.contacts.values()]
      .map((contact) => Date.parse(contact.latestMessageAt ?? ""))
      .filter((timestamp) => Number.isFinite(timestamp));

    if (!timestamps.length) {
      return null;
    }

    return new Date(Math.max(...timestamps)).toISOString();
  }
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
