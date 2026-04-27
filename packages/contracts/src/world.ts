import type { ChatBackgroundAsset } from "./chat-backgrounds";

export type WorldLanguageCode = "zh-CN" | "en-US" | "ja-JP" | "ko-KR";

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
}

export interface UpdateWorldOwnerRequest {
  username?: string;
  avatar?: string;
  signature?: string;
  onboardingCompleted?: boolean;
}

export interface UpdateWorldOwnerApiKeyRequest {
  apiKey: string;
  apiBase?: string;
}
