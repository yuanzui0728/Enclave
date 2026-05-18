export const SELF_CHARACTER_SOURCE_KEY = "self" as const;
export const ACTION_OPERATOR_SOURCE_KEY = "action_operator" as const;
// 「我自己」角色的 ID——前端用来识别"这条 feed/视频号 post 的作者是不是用户自己的
// 代理角色"，从而隐藏关注按钮、特殊化交互等。和 api/.../default-characters.ts
// 里的 SELF_CHARACTER_ID 保持一致。
export const SELF_CHARACTER_ID = "char-default-self" as const;

export type RelationshipType =
  | "family"
  | "friend"
  | "expert"
  | "mentor"
  | "custom"
  | "self"
  | (string & {});

// 关系类型预设：固定的几个枚举值。任何不在这里且不等于 "self" 的字符串都是
// 用户在「自定义」输入框里填写的（如 "师傅" / "房东" / "邻居"），存表时直接
// 落到 relationshipType 字段。"custom" 是 UI 上的哨兵值，不应作为最终存储值。
export const RELATIONSHIP_TYPE_PRESETS = [
  "friend",
  "family",
  "mentor",
  "expert",
] as const;
export function isCustomRelationshipType(value: string): boolean {
  if (value === "self") return false;
  return !(RELATIONSHIP_TYPE_PRESETS as readonly string[]).includes(value);
}
export type CharacterSourceType =
  | "default_seed"
  | "preset_catalog"
  | "manual_admin"
  | "need_generated"
  | "shake_generated"
  | "ai_generated"
  | "wiki_contributed"
  | "wechat_import"
  | "model_persona"
  | "private_import";
export type CharacterDeletionPolicy = "protected" | "archive_allowed";
export type CharacterModelRoutingMode =
  | "inherit_default"
  | "character_override";
export type CharacterPresetGroupKey =
  | "technology_and_product"
  | "science_and_reasoning"
  | "academic_teachers"
  | "business_and_investing"
  | "public_expression"
  | "relationships_and_emotions"
  | "health_and_wellness";
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

export type WechatSyncImportEvidenceMessageMode = "recent" | "all";

export interface WechatSyncImportEvidenceWindow {
  messageMode?: WechatSyncImportEvidenceMessageMode;
  requestedMessageLimit?: number | null;
  fetchedMessageCount?: number | null;
  includeMoments?: boolean;
  requestedMomentLimit?: number | null;
  fetchedMomentCount?: number | null;
}

export interface WechatSyncImportContactSnapshot {
  username: string;
  displayName: string;
  nickname?: string | null;
  remarkName?: string | null;
  alias?: string | null;
  detailDescription?: string | null;
  region?: string | null;
  avatarUrl?: string | null;
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
  evidenceWindow?: WechatSyncImportEvidenceWindow | null;
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

export type WechatSyncImportMode = "preview_import" | "snapshot_restore";

export interface WechatSyncImportChangeDiff {
  label: string;
  previousValue: string;
  nextValue: string;
  changed: boolean;
}

export interface WechatSyncImportChangeRecord {
  id: string;
  recordedAt: string;
  mode: WechatSyncImportMode;
  previousVersion?: number | null;
  restoredFromVersion?: number | null;
  toVersion: number;
  summary: string;
  changedFields: string[];
  diffs?: WechatSyncImportChangeDiff[];
  resultSnapshot?: WechatSyncImportSnapshot | null;
}

export interface WechatSyncImportMetadata {
  currentSnapshot?: WechatSyncImportSnapshot | null;
  previousSnapshot?: WechatSyncImportSnapshot | null;
  snapshotHistory?: WechatSyncImportSnapshot[];
  changeHistory?: WechatSyncImportChangeRecord[];
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
  socialOpenness?: "open" | "normal" | "private";
  proactiveBrowseChance?: number;
  lastActiveAt?: string | null;
  aiRelationships?: CharacterAiRelationship[] | null;
  currentStatus?: string | null;
  currentActivity?: string | null;
  activityMode?: "auto" | "manual";
  modelRoutingMode?: CharacterModelRoutingMode;
  inferenceProviderAccountId?: string | null;
  inferenceModelId?: string | null;
  allowOwnerKeyOverride?: boolean;
  modelRoutingNotes?: string | null;
  region?: string | null;
  defaultVoiceReply?: boolean;
}

export interface CharacterPresetSummary {
  presetKey: string;
  groupKey: CharacterPresetGroupKey;
  autoSeed?: boolean;
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
