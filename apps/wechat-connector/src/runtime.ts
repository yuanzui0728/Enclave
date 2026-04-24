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
import {
  getContactImportPlatformCatalog,
  getConnectorProviderCatalog,
} from "./platforms.js";
import { LocalUpstreamServiceManager } from "./upstream-service-manager.js";
import { WeFlowHttpProvider } from "./weflow-http-provider.js";
import { WechatDecryptHttpProvider } from "./wechat-decrypt-http-provider.js";

export class ConnectorRuntime {
  private config: ConnectorConfig;
  private readonly manualJsonProvider = new ManualJsonProvider();
  private readonly wechatDecryptHttpProvider = new WechatDecryptHttpProvider();
  private readonly weflowHttpProvider = new WeFlowHttpProvider();
  private readonly upstreamServiceManager = new LocalUpstreamServiceManager();
  private contacts = new Map<string, WechatSyncContactBundle>();
  private lastScanAt: string | null = null;
  private sourceSummary: string | null = null;

  constructor(config: ConnectorConfig) {
    this.config = config;
    this.sourceSummary = describeSourceSummary(config);
  }

  getConfig() {
    return this.config;
  }

  getConfigResponse(): ConnectorConfigResponse {
    return toConfigResponse(this.config);
  }

  patchConfig(
    patch: Partial<
      Pick<
        ConnectorConfig,
        | "connectorLabel"
        | "manualJsonPath"
        | "providerKey"
        | "wechatDecryptBaseUrl"
        | "weflowBaseUrl"
        | "weflowAccessToken"
      >
    >,
  ) {
    this.config = applyConfigPatch(this.config, patch);
    this.sourceSummary = describeSourceSummary(this.config);
    return this.getConfigResponse();
  }

  getHealth(): ConnectorHealth {
    return {
      ok: true,
      version: CONNECTOR_VERSION,
      lastScanAt: this.lastScanAt,
      contactCount: this.contacts.size,
      activeConfig: this.getActiveConfig(),
      implementedProviders: getConnectorProviderCatalog(),
      platformCatalog: getContactImportPlatformCatalog(),
    };
  }

  async scan(body: ConnectorScanRequest | null): Promise<ConnectorScanResponse> {
    const scannedAt = new Date().toISOString();
    const manualJsonPath = normalizeText(body?.manualJsonPath);
    if (manualJsonPath) {
      this.patchConfig({ manualJsonPath });
    }
    if (
      body?.providerKey ||
      body?.wechatDecryptBaseUrl ||
      body?.weflowBaseUrl ||
      body?.weflowAccessToken
    ) {
      this.patchConfig({
        providerKey: body.providerKey,
        wechatDecryptBaseUrl: body.wechatDecryptBaseUrl,
        weflowBaseUrl: body.weflowBaseUrl,
        weflowAccessToken: body.weflowAccessToken,
      });
    }

    const result =
      body && Object.hasOwn(body, "contacts")
        ? this.manualJsonProvider.scanFromValue(
            body.contacts,
            body.sourceLabel ?? "request-body",
          )
        : this.config.providerKey === "wechat-decrypt-http"
          ? await this.scanWechatDecryptHttp()
          : this.config.providerKey === "weflow-http"
            ? await this.scanWeFlowHttp()
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
      implementedProviders: getConnectorProviderCatalog(),
      platformCatalog: getContactImportPlatformCatalog(),
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

  async buildBundles(
    request: ConnectorContactBundleRequest,
  ): Promise<WechatSyncContactBundle[]> {
    const usernames = request.usernames?.length
      ? request.usernames
      : [...this.contacts.keys()];

    const baseBundles = usernames
      .map((username) => this.contacts.get(username))
      .filter((contact): contact is WechatSyncContactBundle => Boolean(contact));

    if (this.config.providerKey !== "weflow-http" || !baseBundles.length) {
      return baseBundles;
    }

    const enrichedBundles = await this.weflowHttpProvider.enrichBundles(
      this.config.weflowBaseUrl ?? "",
      this.config.weflowAccessToken ?? "",
      baseBundles,
    );

    for (const bundle of enrichedBundles) {
      this.contacts.set(bundle.username, bundle);
    }

    return usernames
      .map((username) => this.contacts.get(username))
      .filter((contact): contact is WechatSyncContactBundle => Boolean(contact));
  }

  async listUpstreamServices() {
    return this.upstreamServiceManager.listServices(this.config);
  }

  async startUpstreamService(key: "wechat-decrypt" | "weflow") {
    return this.upstreamServiceManager.startService(key, this.config);
  }

  private async scanConfiguredPath(filePath: string) {
    await stat(filePath);
    return this.manualJsonProvider.scanFromPath(filePath);
  }

  private async scanWechatDecryptHttp() {
    if (!this.config.wechatDecryptBaseUrl) {
      throw new Error(
        "请先设置 WECHAT_DECRYPT_BASE_URL 或调用 PATCH /api/config 配置 wechatDecryptBaseUrl。",
      );
    }

    return this.wechatDecryptHttpProvider.scan(this.config.wechatDecryptBaseUrl);
  }

  private async scanWeFlowHttp() {
    if (!this.config.weflowBaseUrl) {
      throw new Error(
        "请先设置 WEFLOW_BASE_URL，或调用 PATCH /api/config 配置 weflowBaseUrl。",
      );
    }

    if (!this.config.weflowAccessToken) {
      throw new Error(
        "请先设置 WEFLOW_ACCESS_TOKEN，或调用 PATCH /api/config 配置 weflowAccessToken。",
      );
    }

    return this.weflowHttpProvider.scan(
      this.config.weflowBaseUrl,
      this.config.weflowAccessToken,
    );
  }

  private getActiveConfig(): ConnectorActiveConfig {
    return {
      connectorLabel: this.config.connectorLabel,
      sourceSummary: this.sourceSummary,
      providerKey: this.config.providerKey,
      manualJsonPath: this.config.manualJsonPath,
      wechatDecryptBaseUrl: this.config.wechatDecryptBaseUrl,
      weflowBaseUrl: this.config.weflowBaseUrl,
      weflowAccessToken: this.config.weflowAccessToken,
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

function describeSourceSummary(config: ConnectorConfig) {
  if (config.providerKey === "wechat-decrypt-http" && config.wechatDecryptBaseUrl) {
    return `wechat-decrypt-http:${config.wechatDecryptBaseUrl}`;
  }

  if (config.providerKey === "weflow-http" && config.weflowBaseUrl) {
    return `weflow-http:${config.weflowBaseUrl}`;
  }

  if (config.manualJsonPath) {
    return `manual-json:${config.manualJsonPath}`;
  }

  return null;
}
