// 场景提示词：每个场景独立配置
export interface ScenePrompts {
  chat?: string;            // 聊天回复
  moments_post?: string;    // 发朋友圈
  moments_comment?: string; // 朋友圈评论/回复
  feed_post?: string;       // 发 Feed 贴文
  channel_post?: string;    // 发视频号内容
  feed_comment?: string;    // Feed 评论反应
  greeting?: string;        // 好友请求问候 / 摇一摇
  proactive?: string;       // 主动提醒
}

export type SceneKey = keyof ScenePrompts;

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
    /** 近期摘要提取提示词，留空使用全局默认。变量：{{name}}、{{chatHistory}} */
    recentSummaryPrompt?: string;
    /** 核心记忆提取提示词，留空使用全局默认。变量：{{name}}、{{interactionHistory}} */
    coreMemoryPrompt?: string;
  };
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

export interface GenerateReplyOptions {
  profile: PersonalityProfile;
  conversationHistory: ChatMessage[];
  userMessage: string;
  userMessageParts?: AiMessagePart[];
  isGroupChat?: boolean;
  otherParticipants?: PersonalityProfile[]; // 群聊中其他 AI
  chatContext?: { currentActivity?: string; lastChatAt?: Date };
  aiKeyOverride?: AiKeyOverride;
  usageContext?: AiUsageContext;
}

export interface GenerateReplyResult {
  text: string;
  tokensUsed: number;
  usage?: AiUsageMetrics;
  model?: string;
  billingSource?: AiUsageBillingSource;
}

export interface GenerateMomentOptions {
  profile: PersonalityProfile;
  currentTime: Date;
  recentTopics?: string[];
  usageContext?: AiUsageContext;
}
