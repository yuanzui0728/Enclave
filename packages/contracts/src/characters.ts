export type RelationshipType =
  | "family"
  | "friend"
  | "expert"
  | "mentor"
  | "custom"
  | "self";
export type CharacterSourceType =
  | "default_seed"
  | "preset_catalog"
  | "manual_admin"
  | "need_generated"
  | "wechat_import";
export type CharacterDeletionPolicy = "protected" | "archive_allowed";
export type CharacterPresetGroupKey =
  | "technology_and_product"
  | "science_and_reasoning"
  | "business_and_investing"
  | "public_expression";
export type ResponseLength = "short" | "medium" | "long";
export type EmojiUsage = "none" | "occasional" | "frequent";

export interface PersonalityTraits {
  speechPatterns: string[];
  catchphrases: string[];
  topicsOfInterest: string[];
  emotionalTone: string;
  responseLength: ResponseLength;
  emojiUsage: EmojiUsage;
}

export interface CharacterIdentity {
  occupation: string;
  background: string;
  motivation: string;
  worldview: string;
}

export interface BehavioralPatterns {
  workStyle: string;
  socialStyle: string;
  taboos: string[];
  quirks: string[];
}

export interface CognitiveBoundaries {
  expertiseDescription: string;
  knowledgeLimits: string;
  refusalStyle: string;
}

export interface ReasoningConfig {
  enableCoT: boolean;
  enableReflection: boolean;
  enableRouting: boolean;
}

export interface MemoryLayers {
  coreMemory: string;
  recentSummary: string;
  forgettingCurve: number;
  /** 近期摘要提取提示词，留空使用全局默认。变量：{{name}}、{{chatHistory}} */
  recentSummaryPrompt?: string;
  /** 核心记忆提取提示词，留空使用全局默认。变量：{{name}}、{{interactionHistory}} */
  coreMemoryPrompt?: string;
}

export interface ScenePrompts {
  chat?: string; // 聊天回复
  moments_post?: string; // 发朋友圈
  moments_comment?: string; // 朋友圈评论/回复
  feed_post?: string; // 发 Feed 贴文
  channel_post?: string; // 发视频号内容
  feed_comment?: string; // Feed 评论反应
  greeting?: string; // 好友请求问候 / 摇一摇
  proactive?: string; // 主动提醒
}

export type RealityLinkApplyMode = "disabled" | "shadow" | "live";
export type RealityLinkSubjectType =
  | "living_public_figure"
  | "organization_proxy"
  | "historical_snapshot"
  | "fictional_or_private";
export type RealityMomentPolicy = "disabled" | "optional" | "force_one_daily";

export interface RealityLinkConfig {
  enabled: boolean;
  applyMode: RealityLinkApplyMode;
  subjectType: RealityLinkSubjectType;
  subjectName: string;
  aliases: string[];
  locale: string;
  queryTemplate: string;
  sourceAllowlist: string[];
  sourceBlocklist: string[];
  recencyHours: number;
  maxSignalsPerRun: number;
  minimumConfidence: number;
  chatWeight: number;
  contentWeight: number;
  realityMomentPolicy: RealityMomentPolicy;
  manualSteeringNotes: string;
  dailyDigestPrompt: string;
  scenePatchPrompt: string;
  realityMomentPrompt: string;
}

export interface RealWorldRuntimeContext {
  enabled: boolean;
  applyMode: RealityLinkApplyMode;
  subjectType?: RealityLinkSubjectType;
  subjectName?: string;
  digestId?: string | null;
  syncDate?: string | null;
  dailySummary?: string;
  behaviorSummary?: string;
  stanceShiftSummary?: string;
  globalOverlay?: string;
  realityMomentBrief?: string | null;
  sceneOverlays?: ScenePrompts;
  signalTitles?: string[];
}

export type WechatSyncImportMessageDirection =
  | "owner"
  | "contact"
  | "group_member"
  | "system"
  | "unknown";

export interface WechatSyncImportMessageSample {
  timestamp: string;
  text: string;
  sender?: string | null;
  typeLabel?: string | null;
  direction?: WechatSyncImportMessageDirection;
}

export interface WechatSyncImportMomentHighlight {
  postedAt?: string | null;
  text: string;
  location?: string | null;
  mediaHint?: string | null;
}

export interface WechatSyncImportContactSnapshot {
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
  sampleMessages: WechatSyncImportMessageSample[];
  momentHighlights: WechatSyncImportMomentHighlight[];
}

export interface WechatSyncImportDraftSnapshot {
  name: string;
  relationship: string;
  bio: string;
  expertDomains: string[];
  memorySummary: string;
}

export interface WechatSyncImportSnapshot {
  version: number;
  importedAt: string;
  status: "created" | "updated";
  autoAddFriend: boolean;
  seedMoments: boolean;
  seededMomentCount: number;
  contact: WechatSyncImportContactSnapshot;
  draftCharacter: WechatSyncImportDraftSnapshot;
}

export interface WechatSyncImportMetadata {
  currentSnapshot?: WechatSyncImportSnapshot | null;
  previousSnapshot?: WechatSyncImportSnapshot | null;
}

export interface PersonalityProfile {
  characterId: string;
  name: string;
  relationship: string;
  expertDomains: string[];
  /** 底层逻辑：注入所有场景，优先于 coreDirective */
  coreLogic?: string;
  /** 场景提示词：每个场景独立配置，叠加在底层逻辑之上 */
  scenePrompts?: ScenePrompts;
  /** @deprecated 使用 coreLogic 替代 */
  coreDirective?: string;
  /** @deprecated 使用 scenePrompts.chat 替代 */
  basePrompt?: string;
  /** @deprecated 直接使用 coreLogic + scenePrompts */
  systemPrompt?: string;
  /** @deprecated 使用 scenePrompts 各场景字段替代 */
  traits: PersonalityTraits;
  memorySummary: string;
  /** @deprecated */
  identity?: CharacterIdentity;
  /** @deprecated */
  behavioralPatterns?: BehavioralPatterns;
  /** @deprecated */
  cognitiveBoundaries?: CognitiveBoundaries;
  /** @deprecated */
  reasoningConfig?: ReasoningConfig;
  memory?: MemoryLayers;
  realWorldContext?: RealWorldRuntimeContext;
  wechatSyncImport?: WechatSyncImportMetadata;
}

export interface CharacterAiRelationship {
  characterId: string;
  relationshipType: string;
  strength: number;
}

export interface Character {
  id: string;
  name: string;
  avatar: string;
  relationship: string;
  relationshipType: RelationshipType;
  personality?: string;
  bio: string;
  isOnline: boolean;
  onlineMode?: "auto" | "manual";
  sourceType?: CharacterSourceType;
  sourceKey?: string | null;
  deletionPolicy?: CharacterDeletionPolicy;
  isTemplate: boolean;
  expertDomains: string[];
  profile: PersonalityProfile;
  activityFrequency: string;
  momentsFrequency: number;
  feedFrequency: number;
  activeHoursStart?: number | null;
  activeHoursEnd?: number | null;
  triggerScenes?: string[] | null;
  intimacyLevel: number;
  lastActiveAt?: string | null;
  aiRelationships?: CharacterAiRelationship[] | null;
  currentStatus?: string | null;
  currentActivity?: string | null;
  activityMode?: "auto" | "manual";
}

export interface CharacterPresetSummary {
  presetKey: string;
  groupKey: CharacterPresetGroupKey;
  groupLabel: string;
  groupDescription: string;
  groupOrder: number;
  id: string;
  name: string;
  avatar: string;
  relationship: string;
  description: string;
  expertDomains: string[];
  installed: boolean;
  installedCharacterId?: string | null;
  installedCharacterName?: string | null;
}

export interface InstallCharacterPresetsResult {
  presetKeys: string[];
  installedCount: number;
  installedCharacters: Character[];
}

export type CharacterDraft = Partial<Character>;
