// 角色人格画像结构
export interface PersonalityProfile {
  characterId: string;
  name: string;
  relationship: string;
  expertDomains: string[];
  basePrompt?: string; // 角色身份定义（固定，不含性格描述）
  traits: {
    speechPatterns: string[]; // 说话习惯
    catchphrases: string[]; // 口头禅
    topicsOfInterest: string[]; // 常聊话题
    emotionalTone: string; // 情感基调
    responseLength: 'short' | 'medium' | 'long';
    emojiUsage: 'none' | 'occasional' | 'frequent';
  };
  memorySummary: string; // 压缩的长期记忆（旧字段，向后兼容）
  systemPrompt?: string; // 自定义 system prompt（可选覆盖）

  // 深度人格模块
  identity?: {
    occupation: string; // 职业/身份
    background: string; // 背景故事
    motivation: string; // 核心动机/价值观
    worldview: string; // 世界观
  };
  behavioralPatterns?: {
    workStyle: string; // 工作/思考方式
    socialStyle: string; // 社交风格
    taboos: string[]; // 语言/行为禁忌
    quirks: string[]; // 个人癖好
  };
  cognitiveBoundaries?: {
    expertiseDescription: string; // 专长详细描述
    knowledgeLimits: string; // 知识边界说明
    refusalStyle: string; // 超出边界时的拒绝风格
  };

  // 推理机制开关
  reasoningConfig?: {
    enableCoT: boolean; // 思维链（默认 true）
    enableReflection: boolean; // 自我反思（默认 true）
    enableRouting: boolean; // 跨角色路由（默认 true）
  };

  // 分层记忆
  memory?: {
    coreMemory: string; // 永久核心记忆（手动设置，不会遗忘）
    recentSummary: string; // 近期摘要（每10条自动更新）
    forgettingCurve: number; // 0-100，越低越容易遗忘细节（默认 70）
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
}

export interface GenerateReplyResult {
  text: string;
  tokensUsed: number;
}

export interface GenerateMomentOptions {
  profile: PersonalityProfile;
  currentTime: Date;
  recentTopics?: string[];
}
