// 角色人格画像结构
export interface PersonalityProfile {
  characterId: string;
  name: string;
  relationship: string;
  expertDomains: string[];
  basePrompt?: string;          // 角色身份定义（固定，不含性格描述）
  traits: {
    speechPatterns: string[];   // 说话习惯
    catchphrases: string[];     // 口头禅
    topicsOfInterest: string[]; // 常聊话题
    emotionalTone: string;      // 情感基调
    responseLength: 'short' | 'medium' | 'long';
    emojiUsage: 'none' | 'occasional' | 'frequent';
  };
  memorySummary: string;        // 压缩的长期记忆
  systemPrompt?: string;        // 自定义 system prompt（可选覆盖）
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  characterId?: string; // 群聊中标识是哪个 AI 说的
}

export interface GenerateReplyOptions {
  profile: PersonalityProfile;
  conversationHistory: ChatMessage[];
  userMessage: string;
  isGroupChat?: boolean;
  otherParticipants?: PersonalityProfile[]; // 群聊中其他 AI
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
