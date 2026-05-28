// 场景提示词：每个场景独立配置
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
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

export type SceneKey = keyof ScenePrompts;

export type RealityLinkApplyModeValue = 'disabled' | 'shadow' | 'live';
export type RealityLinkSubjectTypeValue =
  | 'living_public_figure'
  | 'organization_proxy'
  | 'historical_snapshot'
  | 'fictional_or_private';

export interface RealWorldRuntimeContextValue {
  enabled: boolean;
  applyMode: RealityLinkApplyModeValue;
  subjectType?: RealityLinkSubjectTypeValue;
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

export type WechatSyncImportMessageDirectionValue =
  | 'owner'
  | 'contact'
  | 'group_member'
  | 'system'
  | 'unknown';

export interface WechatSyncImportMessageSampleValue {
  timestamp: string;
  text: string;
  sender?: string | null;
  typeLabel?: string | null;
  direction?: WechatSyncImportMessageDirectionValue;
}

export interface WechatSyncImportMomentHighlightValue {
  postedAt?: string | null;
  text: string;
  location?: string | null;
  mediaHint?: string | null;
}

export interface WechatSyncImportContactSnapshotValue {
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
  sampleMessages: WechatSyncImportMessageSampleValue[];
  momentHighlights: WechatSyncImportMomentHighlightValue[];
}

export interface WechatSyncImportDraftSnapshotValue {
  name: string;
  relationship: string;
  bio: string;
  expertDomains: string[];
  memorySummary: string;
}

export interface WechatSyncImportSnapshotValue {
  version: number;
  importedAt: string;
  status: 'created' | 'updated';
  autoAddFriend: boolean;
  seedMoments: boolean;
  seededMomentCount: number;
  contact: WechatSyncImportContactSnapshotValue;
  draftCharacter: WechatSyncImportDraftSnapshotValue;
}

export type WechatSyncImportModeValue = 'preview_import' | 'snapshot_restore';

export interface WechatSyncImportChangeDiffValue {
  label: string;
  previousValue: string;
  nextValue: string;
  changed: boolean;
}

export interface WechatSyncImportChangeRecordValue {
  id: string;
  recordedAt: string;
  mode: WechatSyncImportModeValue;
  previousVersion?: number | null;
  restoredFromVersion?: number | null;
  toVersion: number;
  summary: string;
  changedFields: string[];
  diffs?: WechatSyncImportChangeDiffValue[];
  resultSnapshot?: WechatSyncImportSnapshotValue | null;
}

export interface WechatSyncImportMetadataValue {
  currentSnapshot?: WechatSyncImportSnapshotValue | null;
  previousSnapshot?: WechatSyncImportSnapshotValue | null;
  snapshotHistory?: WechatSyncImportSnapshotValue[];
  changeHistory?: WechatSyncImportChangeRecordValue[];
}

// 角色人格画像结构
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
  traits: {
    speechPatterns: string[];
    catchphrases: string[];
    topicsOfInterest: string[];
    emotionalTone: string;
    responseLength: 'short' | 'medium' | 'long';
    emojiUsage: 'none' | 'occasional' | 'frequent';
  };
  memorySummary: string;

  /** @deprecated */
  identity?: {
    occupation: string;
    background: string;
    motivation: string;
    worldview: string;
  };
  /** @deprecated */
  behavioralPatterns?: {
    workStyle: string;
    socialStyle: string;
    taboos: string[];
    quirks: string[];
  };
  /** @deprecated */
  cognitiveBoundaries?: {
    expertiseDescription: string;
    knowledgeLimits: string;
    refusalStyle: string;
  };
  /** @deprecated */
  reasoningConfig?: {
    enableCoT: boolean;
    enableReflection: boolean;
    enableRouting: boolean;
  };

  memory?: {
    coreMemory: string;
    recentSummary: string;
    forgettingCurve: number;
    /** 近期记忆提示词，留空使用全局默认。变量：{{name}}、{{chatHistory}} */
    recentSummaryPrompt?: string;
    /** 长期记忆提示词，留空使用全局默认。变量：{{name}}、{{interactionHistory}} */
    coreMemoryPrompt?: string;
  };
  realWorldContext?: RealWorldRuntimeContextValue;
  wechatSyncImport?: WechatSyncImportMetadataValue;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: AiMessagePart[];
  characterId?: string; // 群聊中标识是哪个 AI 说的
}

export type AiMessagePart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      imageUrl: string;
      detail?: 'auto' | 'low' | 'high';
      altText?: string;
      mimeType?: string;
    }
  | {
      type: 'audio';
      audioUrl: string;
      mimeType?: string;
      fileName?: string;
      durationMs?: number;
      transcriptText?: string;
      summaryText: string;
    }
  | {
      type: 'video';
      videoUrl: string;
      mimeType?: string;
      fileName?: string;
      durationMs?: number;
      width?: number;
      height?: number;
      transcriptText?: string;
      summaryText: string;
    }
  | {
      type: 'document';
      url: string;
      mimeType?: string;
      fileName: string;
      extractedText?: string;
      summaryText: string;
    }
  | {
      type: 'file';
      fileName: string;
      mimeType: string;
      url: string;
      summaryText: string;
    }
  | {
      type: 'contact_card';
      name: string;
      relationship?: string;
      bio?: string;
      summaryText: string;
    }
  | {
      type: 'location_card';
      title: string;
      subtitle?: string;
      summaryText: string;
    }
  | {
      type: 'sticker';
      label?: string;
      summaryText: string;
    };

export interface AiKeyOverride {
  apiKey: string;
  apiBase?: string;
}

export type AiProviderAuthFailureSource = 'owner_custom' | 'instance_default';
export type AiUsageBillingSource = 'owner_custom' | 'instance_default';
export type AiUsageSurface = 'app' | 'admin' | 'scheduler' | 'system';
export type AiUsageScopeType =
  | 'character'
  | 'conversation'
  | 'group'
  | 'world'
  | 'admin_task';

export interface AiUsageContext {
  surface: AiUsageSurface;
  scene: string;
  scopeType: AiUsageScopeType;
  scopeId?: string;
  scopeLabel?: string;
  ownerId?: string;
  characterId?: string;
  characterName?: string;
  conversationId?: string;
  groupId?: string;
}

export interface AiUsageMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  raw?: Record<string, unknown> | null;
}

export class AiProviderAuthError extends Error {
  readonly source: AiProviderAuthFailureSource;

  constructor(source: AiProviderAuthFailureSource, message?: string) {
    super(
      message ??
        (source === 'owner_custom'
          ? 'OWNER_CUSTOM_API_KEY_INVALID'
          : 'INSTANCE_PROVIDER_API_KEY_INVALID'),
    );
    this.name = 'AiProviderAuthError';
    this.source = source;
  }
}

// 用户在「个人资料」里主动填写的信息，注入聊天 prompt 让角色更贴合地服务对方。
// 隐私边界：联系方式(分身相遇专用)故意不在此。定义放在 ai.types 避免 prompt-builder ↔ ai.types 循环依赖。
export interface UserProfileContext {
  displayName?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  age?: number | null;
  occupation?: string | null;
  region?: string | null;
  interests?: string | null;
  aiAddressTone?: string | null;
  avoidTopics?: string | null;
}

export interface GenerateReplyOptions {
  profile: PersonalityProfile;
  conversationHistory: ChatMessage[];
  userMessage: string;
  userMessageParts?: AiMessagePart[];
  isGroupChat?: boolean;
  otherParticipants?: PersonalityProfile[]; // 群聊中其他 AI
  chatContext?: {
    currentActivity?: string;
    lastChatAt?: Date;
    userProfile?: UserProfileContext;
    // 单人世界中枢渲染好的 <owner_portrait> 块（第三人称用户画像，Stratum A）。
    // 由调用方按当前 owner 装配后传入；prompt-builder 不依赖 cyber-avatar 模块（防循环）。
    ownerPortrait?: string;
    // 单人世界中枢的跨角色共享记忆块（Stratum B，<world_recent_episodes>）——
    // 把任一角色/朋友圈/视频号里发生过的具体事件传递给当前角色，实现「彻底打通」。
    ownerSharedMemory?: string;
    // 角色互知 + 用户社交全景（Stratum C，<character_relationships> + <world_social>）。
    socialContext?: string;
  };
  extraSystemPromptSections?: string[];
  aiKeyOverride?: AiKeyOverride;
  usageContext?: AiUsageContext;
  emptyTextFallback?: string;
}

export interface GenerateReplyResult {
  text: string;
  tokensUsed: number;
  usage?: AiUsageMetrics;
  model?: string;
  billingSource?: AiUsageBillingSource;
}

export interface MomentGenerationWorldContext {
  dateTimeText: string;
  timeText: string;
  weather?: string;
  location?: string;
  holiday?: string;
  localTime?: string;
}

export interface MomentGenerationRelationshipContext {
  hasRecentConversation: boolean;
  lastConversationAt?: Date;
  recentTopics: string[];
  recentUserIntentSummary?: string;
  avoidDirectQuote: boolean;
}

export interface MomentGenerationHints {
  anchorPriority: Array<
    'real_world' | 'weather' | 'location' | 'holiday' | 'recent_chat' | 'life'
  >;
  mustAvoidGeneric: boolean;
  preferObservationOverAnnouncement: boolean;
}

export interface MomentGenerationContext {
  worldContext?: MomentGenerationWorldContext;
  relationshipContext?: MomentGenerationRelationshipContext;
  generationHints?: MomentGenerationHints;
}

// 全局共享池（广场）专用的高质量管线开关。仅当调用方（MomentsService 在全局帧）
// 显式填充时启用；缺省 / candidateCount<=1 → 完全走现有单发 2 次重试路径，零行为变化。
export interface MomentQualityPipelineOptions {
  // 候选数 N（best-of-N）；缺省 1。
  candidateCount?: number;
  // 综合分低于此值则整条不发（返回 ''，调用方跳过）。0..1。
  minAcceptScore?: number;
  // 是否启用 LLM 评委（便宜默认模型，批量打分；失败回落启发式）。
  judge?: boolean;
  // 本角色 + 全局池近期帖文，供新颖度/近重复判定。
  recentTexts?: string[];
}

export interface GenerateMomentOptions {
  profile: PersonalityProfile;
  currentTime: Date;
  recentTopics?: string[];
  generationContext?: MomentGenerationContext;
  usageContext?: AiUsageContext;
  // 调用方可注入额外 system prompt 段（如 web_search 实时资料），追加到 systemPrompt 末尾。
  extraSystemPromptSections?: string[];
  // 全局共享池高质量管线（best-of-N + 打分 + 评委 + 遥测）。
  qualityPipeline?: MomentQualityPipelineOptions;
}
// i18n-ignore-end
