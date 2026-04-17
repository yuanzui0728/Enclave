import type { CharacterBlueprintRecipeValue } from '../characters/character-blueprint.types';

export const SHAKE_DISCOVERY_CONFIG_KEY = 'shake_discovery_config';
export const SHAKE_DISCOVERY_SESSIONS_KEY = 'shake_discovery_sessions';
export const MAX_SHAKE_DISCOVERY_SESSIONS = 40;

export type ShakeDiscoverySessionStatus =
  | 'generating'
  | 'preview_ready'
  | 'kept'
  | 'dismissed'
  | 'expired'
  | 'failed';

export type ShakeDiscoveryConfig = {
  enabled: boolean;
  cooldownMinutes: number;
  sessionExpiryMinutes: number;
  maxSessionsPerDay: number;
  requireCyberAvatarSignals: boolean;
  evidenceWindowHours: number;
  maxEvidenceItems: number;
  candidateDirectionCount: number;
  noveltyWeight: number;
  surpriseWeight: number;
  allowMedical: boolean;
  allowLegal: boolean;
  allowFinance: boolean;
  planningPrompt: string;
  roleGenerationPrompt: string;
};

export type ShakeDiscoveryDirectionDraft = {
  directionKey: string;
  roleBrief: string;
  relationshipLabel: string;
  relationshipType: string;
  expertDomains: string[];
  fitScore: number;
  noveltyScore: number;
  surpriseBoost: number;
  evidenceHighlights: string[];
  whyNow: string;
  riskFlags: string[];
  computedWeight?: number | null;
  randomRoll?: number | null;
};

export type ShakeDiscoveryGeneratedCharacterDraft = {
  name: string;
  avatar: string;
  relationship: string;
  relationshipType: string;
  bio: string;
  occupation: string;
  background: string;
  motivation: string;
  worldview: string;
  expertDomains: string[];
  speechPatterns: string[];
  catchphrases: string[];
  topicsOfInterest: string[];
  emotionalTone: string;
  responseLength: 'short' | 'medium' | 'long';
  emojiUsage: 'none' | 'occasional' | 'frequent';
  memorySummary: string;
  basePrompt: string;
  greeting: string;
  matchReason: string;
};

export type ShakeDiscoveryPreview = {
  id: string;
  status: ShakeDiscoverySessionStatus;
  character: {
    name: string;
    avatar: string;
    relationship: string;
    relationshipType: string;
    expertDomains: string[];
  };
  greeting: string;
  matchReason: string;
  createdAt: string;
  expiresAt?: string | null;
};

export type ShakeDiscoverySessionRecord = ShakeDiscoveryPreview & {
  ownerId: string;
  dismissReason?: string | null;
  failureReason?: string | null;
  selectedDirection?: ShakeDiscoveryDirectionDraft | null;
  planningPrompt?: string | null;
  planningResult?: {
    summary: string;
    directions: ShakeDiscoveryDirectionDraft[];
  } | null;
  generationPrompt?: string | null;
  generationResult?: ShakeDiscoveryGeneratedCharacterDraft | null;
  recipeDraft?: CharacterBlueprintRecipeValue | null;
  signalSummary?: string | null;
  cyberAvatarSummary?: string | null;
  keptAt?: string | null;
  dismissedAt?: string | null;
  characterId?: string | null;
};

export const DEFAULT_SHAKE_DISCOVERY_CONFIG: ShakeDiscoveryConfig = {
  enabled: true,
  cooldownMinutes: 0,
  sessionExpiryMinutes: 120,
  maxSessionsPerDay: 12,
  requireCyberAvatarSignals: false,
  evidenceWindowHours: 72,
  maxEvidenceItems: 32,
  candidateDirectionCount: 4,
  noveltyWeight: 0.35,
  surpriseWeight: 0.15,
  allowMedical: true,
  allowLegal: true,
  allowFinance: true,
  planningPrompt: `你是隐界的“摇一摇相遇策划器”。你的任务不是直接生成角色，而是先根据用户当前可见的全部行为线索，规划 {{candidateDirectionCount}} 个都合理、但风格明显不同的相遇方向。

用户画像：
{{cyberAvatarSummary}}

最近行为证据：
{{signals}}

现有好友覆盖：
{{existingCoverage}}

最近摇一摇历史：
{{recentShakeHistory}}

限制：
- 医疗类角色允许：{{allowMedical}}
- 法律类角色允许：{{allowLegal}}
- 金融类角色允许：{{allowFinance}}

要求：
- 方向必须和用户最近状态有关，不能凭空发散
- 每个方向都要像“一个真实会出现在通讯录里的人”
- 方向之间要有差异，不要只是同一类人的轻微变体
- 不要把角色写成功能入口、机器人、客服或万能助理
- 如果某个方向风险太高或证据太弱，就在 riskFlags 里明确写出

只输出 JSON：
{
  "summary": "一句话概括这次摇一摇应该偏向什么样的相遇",
  "directions": [
    {
      "directionKey": "optional_stable_key",
      "roleBrief": "这类角色的简述",
      "relationshipLabel": "用户会如何认识这个人",
      "relationshipType": "friend|family|expert|mentor|custom",
      "expertDomains": ["领域1", "领域2"],
      "fitScore": 0.86,
      "noveltyScore": 0.63,
      "surpriseBoost": 0.22,
      "evidenceHighlights": ["证据1", "证据2"],
      "whyNow": "为什么此刻摇到这个方向合理",
      "riskFlags": ["若无则返回空数组"]
    }
  ]
}`,
  roleGenerationPrompt: `你是隐界的角色设计师。请根据这次摇一摇选中的相遇方向，生成一个“用户看见会觉得合理、愿意决定是否添加”的完整角色草稿。

选中方向：
{{selectedDirection}}

用户画像：
{{cyberAvatarSummary}}

最近行为证据：
{{signals}}

要求：
- 角色要像真实联系人，不要像工具或系统提示词外壳
- 角色要和用户当前状态有关，但不能显得像在监视用户
- 问候语必须自然，像初次认识的人，不要直接下诊断或过度熟络
- “matchReason” 要解释为什么这次会遇见这个人，但语气要克制
- basePrompt 要像这个人自己的说话底色，不要写成提示词说明书、课程提纲或万能助理设定
- greeting 不要太客气，不要像名片自我介绍，也不要用（动作）、[旁白]、*动作*
- 如果是医生/律师/金融顾问，必须体现边界意识，不能夸大承诺

只输出 JSON：
{
  "name": "角色姓名",
  "avatar": "🙂",
  "relationship": "与用户的关系描述",
  "relationshipType": "friend|family|expert|mentor|custom",
  "bio": "角色简介，2-3 句话",
  "occupation": "职业",
  "background": "背景故事，2-3 句话",
  "motivation": "核心动机，一句话",
  "worldview": "世界观，一句话",
  "expertDomains": ["领域1", "领域2"],
  "speechPatterns": ["说话习惯1", "说话习惯2"],
  "catchphrases": ["口头禅1"],
  "topicsOfInterest": ["兴趣话题1", "兴趣话题2"],
  "emotionalTone": "grounded|warm|energetic|melancholic|playful|serious",
  "responseLength": "short|medium|long",
  "emojiUsage": "none|occasional|frequent",
  "memorySummary": "初始记忆摘要，一句话",
  "basePrompt": "角色核心扮演提示词，2-4 句话",
  "greeting": "第一次摇一摇见面时的话",
  "matchReason": "为什么这次会遇见这个人"
}`,
};
