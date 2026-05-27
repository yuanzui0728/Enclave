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
  /** 个人资料：注入 AI 角色对话 prompt 的结构化信息（联系方式故意不在此列、不进 prompt）。 */
  gender?: "male" | "female" | "other" | null;
  age?: number | null;
  occupation?: string | null;
  /** 常驻城市/所在地，用户手填（区别于 GPS 派生定位）。 */
  region?: string | null;
  interests?: string | null;
  /** 希望 AI 怎么称呼你 / 语气偏好。 */
  aiAddressTone?: string | null;
  /** 不希望聊到的话题。 */
  avoidTopics?: string | null;
}

export interface UpdateWorldOwnerRequest {
  username?: string;
  avatar?: string;
  signature?: string;
  onboardingCompleted?: boolean;
  contact?: string;
  contactKind?: "wechat" | "phone" | "other";
  encounterOptedIn?: boolean;
  gender?: "male" | "female" | "other" | null;
  age?: number | null;
  occupation?: string;
  region?: string;
  interests?: string;
  aiAddressTone?: string;
  avoidTopics?: string;
}

export interface UpdateWorldOwnerApiKeyRequest {
  apiKey: string;
  apiBase?: string;
}
