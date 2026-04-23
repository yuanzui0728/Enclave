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
    label: "Manual JSON bundle",
    livePlatforms: ["wechat"],
    notes:
      "Reads the current WeChat-shaped bundle JSON and works as the lowest-friction fallback source.",
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
    phase: "standardized",
    liveProviderKeys: [],
    roadmapSourceKinds: ["chatlab-json", "chatlab-jsonl", "qq-native-txt"],
    notes:
      "Next in line once the downstream WeChat-specific source contract is generalized into a platform-agnostic contact import contract.",
  },
  {
    key: "telegram",
    label: "Telegram",
    phase: "standardized",
    liveProviderKeys: [],
    roadmapSourceKinds: [
      "chatlab-json",
      "chatlab-jsonl",
      "telegram-native-json",
    ],
    notes:
      "Fits the same parser-registry approach as ChatLab. Planned as a file-export adapter first, not a live bot bridge.",
  },
  {
    key: "discord",
    label: "Discord",
    phase: "standardized",
    liveProviderKeys: [],
    roadmapSourceKinds: ["chatlab-json", "chatlab-jsonl", "discord-export"],
    notes:
      "Will share the same normalized session/member/message model as QQ and Telegram once the import layer is generalized.",
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
