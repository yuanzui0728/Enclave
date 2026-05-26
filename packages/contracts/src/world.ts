import type { ChatBackgroundAsset } from "./chat-backgrounds";
import type { SupportedLocaleCode } from "./locales";

export type WorldLanguageCode = SupportedLocaleCode;

export interface WorldLanguageOption {
  code: WorldLanguageCode;
  label: string;
  nativeLabel: string;
}

export const WORLD_LANGUAGE_OPTIONS: WorldLanguageOption[] = [
  { code: "zh-CN", label: "Chinese", nativeLabel: "简体中文" },
  { code: "en-US", label: "English", nativeLabel: "English" },
  { code: "ja-JP", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko-KR", label: "Korean", nativeLabel: "한국어" },
];

export interface WorldLanguageConfig {
  language: WorldLanguageCode;
  label: string;
  nativeLabel: string;
  changedAt: string | null;
  options: WorldLanguageOption[];
}

export interface UpdateWorldLanguageRequest {
  language: WorldLanguageCode;
}

export interface WorldContext {
  id: string;
  localTime: string;
  weather?: string;
  location?: string;
  season?: string;
  holiday?: string;
  recentEvents?: string[];
  timestamp: string;
}

export interface WorldOwner {
  id: string;
  username: string;
  onboardingCompleted: boolean;
  avatar?: string;
  signature?: string;
  hasCustomApiKey: boolean;
  customApiBase?: string | null;
  defaultChatBackground?: ChatBackgroundAsset | null;
  createdAt: string;
  /** 分身相遇：仅在双方都「想要」时披露给对方的真实联系方式（微信/手机号等）。 */
  contact?: string | null;
  /** 联系方式类型，决定前端展示文案。 */
  contactKind?: "wechat" | "phone" | "other" | null;
  /** 是否允许我的分身参与社交相遇（默认 true）。关闭后从匹配池移除。 */
  encounterOptedIn?: boolean;
}

export interface UpdateWorldOwnerRequest {
  username?: string;
  avatar?: string;
  signature?: string;
  onboardingCompleted?: boolean;
  contact?: string;
  contactKind?: "wechat" | "phone" | "other";
  encounterOptedIn?: boolean;
}

export interface UpdateWorldOwnerApiKeyRequest {
  apiKey: string;
  apiBase?: string;
}
