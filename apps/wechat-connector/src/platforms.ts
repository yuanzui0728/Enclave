import type { ConnectorProviderKey } from "./config.js";

export type ContactImportPlatformKey =
  | "wechat"
  | "qq"
  | "telegram"
  | "discord"
  | "whatsapp"
  | "line"
  | "instagram"
  | "slack"
  | "unknown";

export type ContactImportSupportPhase =
  | "implemented"
  | "standardized"
  | "planned";

export interface ConnectorProviderDescriptor {
  key: ConnectorProviderKey;
  label: string;
  livePlatforms: ContactImportPlatformKey[];
  notes: string;
}

export interface ContactImportPlatformDescriptor {
  key: ContactImportPlatformKey;
  label: string;
  phase: ContactImportSupportPhase;
  liveProviderKeys: ConnectorProviderKey[];
  roadmapSourceKinds: string[];
  notes: string;
}

const CONNECTOR_PROVIDER_CATALOG: ConnectorProviderDescriptor[] = [
  {
    key: "manual-json",
    label: "Standardized file / JSON",
    livePlatforms: ["wechat", "qq", "telegram", "discord"],
    notes:
      "Reads WechatSync bundle JSON, platform-agnostic ContactImportBundle JSON, and ChatLab JSON/JSONL files as the standardized file-import path.",
  },
  {
    key: "wechat-decrypt-http",
    label: "wechat-decrypt HTTP",
    livePlatforms: ["wechat"],
    notes:
      "The live WeChat path today. Reads local WeChat 4.x history and tags from the loopback 5678 service.",
  },
  {
    key: "weflow-http",
    label: "WeFlow HTTP",
    livePlatforms: ["wechat"],
    notes:
      "A live WeChat-oriented bridge path for WeFlow exports and contact snapshots exposed over loopback HTTP.",
  },
];

const CONTACT_IMPORT_PLATFORM_CATALOG: ContactImportPlatformDescriptor[] = [
  {
    key: "wechat",
    label: "WeChat",
    phase: "implemented",
    liveProviderKeys: ["manual-json", "wechat-decrypt-http", "weflow-http"],
    roadmapSourceKinds: ["chatlab-json", "chatlab-jsonl", "weflow-json"],
    notes:
      "The only fully landed import platform today. The admin flow still writes WeChat-specific source metadata downstream.",
  },
  {
    key: "qq",
    label: "QQ",
    phase: "implemented",
    liveProviderKeys: ["manual-json"],
    roadmapSourceKinds: ["chatlab-json", "chatlab-jsonl", "qq-native-txt"],
    notes:
      "Implemented through the standardized file-import path. Recommended input today is ChatLab JSON/JSONL or a normalized ContactImportBundle export.",
  },
  {
    key: "telegram",
    label: "Telegram",
    phase: "implemented",
    liveProviderKeys: ["manual-json"],
    roadmapSourceKinds: [
      "chatlab-json",
      "chatlab-jsonl",
      "telegram-native-json",
    ],
    notes:
      "Implemented through the standardized file-import path. Current scope is export-file imports, not a live bot bridge.",
  },
  {
    key: "discord",
    label: "Discord",
    phase: "implemented",
    liveProviderKeys: ["manual-json"],
    roadmapSourceKinds: ["chatlab-json", "chatlab-jsonl", "discord-export"],
    notes:
      "Implemented through the standardized file-import path and shares the same normalized export model as QQ and Telegram.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    phase: "planned",
    liveProviderKeys: [],
    roadmapSourceKinds: ["chatlab-json", "chatlab-jsonl", "whatsapp-native-txt"],
    notes:
      "Planned after the first generic file-import milestones. Best fit is the text-export path plus the normalized model.",
  },
  {
    key: "line",
    label: "LINE",
    phase: "planned",
    liveProviderKeys: [],
    roadmapSourceKinds: ["chatlab-json", "chatlab-jsonl", "line-native-txt"],
    notes:
      "Planned as a standardized export adapter once the parser registry and downstream source metadata are generalized.",
  },
  {
    key: "instagram",
    label: "Instagram",
    phase: "planned",
    liveProviderKeys: [],
    roadmapSourceKinds: ["chatlab-json", "chatlab-jsonl", "instagram-export"],
    notes:
      "An export-file target, not a live connector target. It shares the same normalized conversation pipeline.",
  },
  {
    key: "slack",
    label: "Slack",
    phase: "planned",
    liveProviderKeys: [],
    roadmapSourceKinds: ["chatlab-json", "chatlab-jsonl", "slack-export"],
    notes:
      "Reserved for future workspace exports once the generic import bundle is wired through admin and backend.",
  },
];

export function getConnectorProviderCatalog(): ConnectorProviderDescriptor[] {
  return CONNECTOR_PROVIDER_CATALOG.map((item) => ({
    ...item,
    livePlatforms: [...item.livePlatforms],
  }));
}

export function getContactImportPlatformCatalog(): ContactImportPlatformDescriptor[] {
  return CONTACT_IMPORT_PLATFORM_CATALOG.map((item) => ({
    ...item,
    liveProviderKeys: [...item.liveProviderKeys],
    roadmapSourceKinds: [...item.roadmapSourceKinds],
  }));
}
