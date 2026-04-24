import type { ConnectorConfig, ConnectorProviderKey } from "./config.js";
import type {
  ContactImportPlatformDescriptor,
  ConnectorProviderDescriptor,
} from "./platforms.js";
import {
  getContactImportPlatformCatalog,
  getConnectorProviderCatalog,
} from "./platforms.js";

export const CONNECTOR_VERSION = "0.1.0";

export type WechatSyncMessageDirection =
  | "owner"
  | "contact"
  | "group_member"
  | "system"
  | "unknown";

export interface WechatSyncMessageSample {
  timestamp: string;
  text: string;
  sender?: string | null;
  typeLabel?: string | null;
  direction?: WechatSyncMessageDirection;
}

export interface WechatSyncMomentHighlight {
  postedAt?: string | null;
  text: string;
  location?: string | null;
  mediaHint?: string | null;
}

export interface WechatSyncContactBundle {
  username: string;
  displayName: string;
  nickname?: string | null;
  remarkName?: string | null;
  region?: string | null;
  source?: string | null;
  tags: string[];
  isGroup: boolean;
  messageCount: number;
  ownerMessageCount: number;
  contactMessageCount: number;
  latestMessageAt?: string | null;
  chatSummary?: string | null;
  topicKeywords: string[];
  sampleMessages: WechatSyncMessageSample[];
  momentHighlights: WechatSyncMomentHighlight[];
}

export interface ConnectorActiveConfig {
  connectorLabel: string;
  sourceSummary: string | null;
  providerKey: ConnectorProviderKey;
  manualJsonPath?: string | null;
  wechatDecryptBaseUrl?: string | null;
  weflowBaseUrl?: string | null;
  weflowAccessToken?: string | null;
}

export interface ConnectorHealth {
  ok: boolean;
  version: string;
  lastScanAt?: string | null;
  contactCount: number;
  activeConfig: ConnectorActiveConfig;
  implementedProviders: ConnectorProviderDescriptor[];
  platformCatalog: ContactImportPlatformDescriptor[];
}

export interface ConnectorScanResponse {
  ok: boolean;
  message: string;
  lastScanAt: string;
  contactCount: number;
  latestMessageAt?: string | null;
  activeConfig: ConnectorActiveConfig;
  implementedProviders: ConnectorProviderDescriptor[];
  platformCatalog: ContactImportPlatformDescriptor[];
}

export interface ConnectorContactSummary {
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
}

export interface ConnectorConfigResponse {
  host: string;
  port: number;
  connectorLabel: string;
  providerKey: ConnectorProviderKey;
  manualJsonPath?: string | null;
  wechatDecryptBaseUrl?: string | null;
  weflowBaseUrl?: string | null;
  weflowAccessToken?: string | null;
  allowedOrigins: string[];
  implementedProviders: ConnectorProviderDescriptor[];
  platformCatalog: ContactImportPlatformDescriptor[];
}

export interface ConnectorScanRequest {
  contacts?: unknown;
  sourceLabel?: string | null;
  manualJsonPath?: string | null;
  providerKey?: ConnectorProviderKey;
  wechatDecryptBaseUrl?: string | null;
  weflowBaseUrl?: string | null;
  weflowAccessToken?: string | null;
}

export interface ConnectorContactBundleRequest {
  usernames?: string[];
}

export type LocalUpstreamServiceKey = "wechat-decrypt" | "weflow";

export type LocalUpstreamServiceStatus =
  | "idle"
  | "starting"
  | "running"
  | "error";

export interface LocalUpstreamServiceInfo {
  key: LocalUpstreamServiceKey;
  label: string;
  status: LocalUpstreamServiceStatus;
  baseUrl: string;
  healthUrl: string;
  healthOk: boolean;
  canStart: boolean;
  commandPreview?: string | null;
  cwd?: string | null;
  lastStartedAt?: string | null;
  lastExitedAt?: string | null;
  lastError?: string | null;
  notes: string[];
  logs: {
    stdout?: string | null;
    stderr?: string | null;
  };
}

export interface LocalUpstreamServiceActionResponse {
  ok: true;
  message: string;
  service: LocalUpstreamServiceInfo;
}

export type LocalUpstreamServiceStartResponse =
  LocalUpstreamServiceActionResponse;

export type LocalUpstreamServiceOpenResponse =
  LocalUpstreamServiceActionResponse;

export function toConfigResponse(config: ConnectorConfig): ConnectorConfigResponse {
  return {
    host: config.host,
    port: config.port,
    connectorLabel: config.connectorLabel,
    providerKey: config.providerKey,
    manualJsonPath: config.manualJsonPath,
    wechatDecryptBaseUrl: config.wechatDecryptBaseUrl,
    weflowBaseUrl: config.weflowBaseUrl,
    weflowAccessToken: config.weflowAccessToken,
    allowedOrigins: config.allowedOrigins,
    implementedProviders: getConnectorProviderCatalog(),
    platformCatalog: getContactImportPlatformCatalog(),
  };
}
