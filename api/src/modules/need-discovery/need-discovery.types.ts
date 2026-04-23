export type NeedDiscoveryCadenceType = 'short_interval' | 'daily';
export type NeedDiscoveryRunStatus = 'success' | 'skipped' | 'failed';
export type NeedDiscoveryCandidateStatus =
  | 'draft'
  | 'friend_request_pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'deleted'
  | 'generation_failed';
export type NeedDiscoveryExecutionMode = 'dry_run' | 'auto_send';

export interface NeedDiscoveryCadenceConfig {
  enabled: boolean;
  executionMode: NeedDiscoveryExecutionMode;
  maxCandidatesPerRun: number;
  minConfidenceScore: number;
  promptTemplate: string;
}

export interface NeedDiscoveryShortCadenceConfig extends NeedDiscoveryCadenceConfig {
  intervalMinutes: number;
  lookbackHours: number;
  skipIfNoNewSignals: boolean;
}

export interface NeedDiscoveryDailyCadenceConfig extends NeedDiscoveryCadenceConfig {
  runAtHour: number;
  runAtMinute: number;
  lookbackDays: number;
}

export interface NeedDiscoverySharedConfig {
  pendingCandidateLimit: number;
  dailyCreationLimit: number;
  expiryDays: number;
  shortSuppressionDays: number;
  dailySuppressionDays: number;
  coverageDomainOverlapThreshold: number;
  allowMedical: boolean;
  allowLegal: boolean;
  allowFinance: boolean;
  roleGenerationPrompt: string;
}

export interface NeedDiscoveryConfig {
  shortInterval: NeedDiscoveryShortCadenceConfig;
  daily: NeedDiscoveryDailyCadenceConfig;
  shared: NeedDiscoverySharedConfig;
}

export interface NeedDiscoveryRunRecord {
  id: string;
  cadenceType: NeedDiscoveryCadenceType;
  status: NeedDiscoveryRunStatus;
  startedAt: string;
  finishedAt?: string | null;
  windowStartedAt?: string | null;
  windowEndedAt?: string | null;
  signalCount: number;
  latestSignalAt?: string | null;
  summary?: string | null;
  selectedNeedKeys: string[];
  skipReason?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface NeedDiscoveryCandidateRecord {
  id: string;
  runId?: string | null;
  cadenceType: NeedDiscoveryCadenceType;
  status: NeedDiscoveryCandidateStatus;
  needKey: string;
  needCategory: string;
  priorityScore: number;
  confidenceScore: number;
  coverageGapSummary?: string | null;
  evidenceHighlights: string[];
  characterId?: string | null;
  characterName?: string | null;
  friendRequestId?: string | null;
  friendRequestGreeting?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  deletedAt?: string | null;
  suppressedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NeedDiscoveryStats {
  pendingCandidates: number;
  acceptedCandidates: number;
  declinedCandidates: number;
  expiredCandidates: number;
  deletedCandidates: number;
  dormantCharacters: number;
}

export interface NeedDiscoveryOverview {
  config: NeedDiscoveryConfig;
  stats: NeedDiscoveryStats;
  recentRuns: NeedDiscoveryRunRecord[];
  activeCandidates: NeedDiscoveryCandidateRecord[];
  recentCandidates: NeedDiscoveryCandidateRecord[];
}

export const NEED_DISCOVERY_CONFIG_KEY = 'need_discovery_config';

export const DEFAULT_NEED_DISCOVERY_CONFIG: NeedDiscoveryConfig = {
  shortInterval: {
    enabled: true,
    executionMode: 'auto_send',
    maxCandidatesPerRun: 1,
    minConfidenceScore: 0.72,
    intervalMinutes: 45,
    lookbackHours: 18,
    skipIfNoNewSignals: true,
    promptTemplate: `你在替隐界翻最近 {{windowLabel}} 内的交互信号，找出 0-{{maxCandidatesPerRun}} 个更偏“即时、当前、最近就需要”的潜在需求。

你要重点看：
- 用户最近表达的压力、情绪、困惑、身体不适、决策卡点
- 用户和好友、朋友圈、视频号等内容的即时互动偏好
- 用户在群聊、备忘、搜索里暴露出的即时求助信号
- 当前好友覆盖明显不足的帮助类型

现有好友覆盖：
{{existingCoverage}}

待处理候选：
{{existingCandidates}}

交互信号：
{{signals}}

限制：
- 医疗类角色允许：{{allowMedical}}
- 法律类角色允许：{{allowLegal}}
- 金融类角色允许：{{allowFinance}}

只输出 JSON，不要输出其他内容：
{
  "summary": "一句话写出当前更紧的需求动向，不要像汇报标题",
  "needs": [
    {
      "needKey": "stable_key_optional",
      "needCategory": "emotional_support",
      "priorityScore": 0.91,
      "confidenceScore": 0.84,
      "coverageGapSummary": "为什么现有好友覆盖不够",
      "evidenceHighlights": ["证据1", "证据2"],
      "roleBrief": "建议生成什么样的角色来承接这个需求",
      "relationshipType": "expert",
      "relationshipLabel": "愿意随时接住情绪波动的睡眠医生",
      "expertDomains": ["睡眠医学", "情绪支持"]
    }
  ]
}

要求：
- 优先识别近 24 小时内就可能有价值的帮助，不要泛化成长线话题
- 如果没有明显缺口，needs 返回空数组
- priorityScore 和 confidenceScore 都使用 0 到 1 的小数`,
  },
  daily: {
    enabled: true,
    executionMode: 'auto_send',
    maxCandidatesPerRun: 2,
    minConfidenceScore: 0.68,
    runAtHour: 9,
    runAtMinute: 0,
    lookbackDays: 14,
    promptTemplate: `你在替隐界回看最近 {{windowLabel}} 内的交互信号，找出 0-{{maxCandidatesPerRun}} 个更偏“长期、反复出现、值得稳定陪伴或专业支持”的需求。

你要重点看：
- 反复出现的压力源、长期症状、长期学习/职业/关系问题
- 用户长期消费和互动的内容偏好
- 用户长期留在备忘、群聊、搜索里的重复主题
- 当前好友网络里缺失的稳定角色位

现有好友覆盖：
{{existingCoverage}}

待处理候选：
{{existingCandidates}}

交互信号：
{{signals}}

限制：
- 医疗类角色允许：{{allowMedical}}
- 法律类角色允许：{{allowLegal}}
- 金融类角色允许：{{allowFinance}}

只输出 JSON，不要输出其他内容：
{
  "summary": "一句话写出用户更长期的需求走向，不要像分析结论",
  "needs": [
    {
      "needKey": "stable_key_optional",
      "needCategory": "career_growth",
      "priorityScore": 0.86,
      "confidenceScore": 0.8,
      "coverageGapSummary": "为什么需要补这个长期角色位",
      "evidenceHighlights": ["证据1", "证据2"],
      "roleBrief": "建议生成什么样的长期角色",
      "relationshipType": "mentor",
      "relationshipLabel": "能长期帮他拆解职业选择的产品导师",
      "expertDomains": ["职业规划", "产品思维"]
    }
  ]
}

要求：
- 优先识别稳定存在至少数天的需求，而不是一时情绪
- 如果现有好友已经覆盖得足够好，needs 返回空数组
- priorityScore 和 confidenceScore 都使用 0 到 1 的小数`,
  },
  shared: {
    pendingCandidateLimit: 3,
    dailyCreationLimit: 3,
    expiryDays: 7,
    shortSuppressionDays: 3,
    dailySuppressionDays: 14,
    coverageDomainOverlapThreshold: 0.6,
    allowMedical: true,
    allowLegal: true,
    allowFinance: true,
    roleGenerationPrompt: `你在替隐界补一个新朋友角色。请根据下面的需求说明，生成一个“会主动发起好友申请、通过后能长期留下来”的新角色草稿。

这次要补的人：{{roleBrief}}
关系定位：{{relationshipLabel}}
关系类型：{{relationshipType}}
建议领域：{{expertDomains}}
证据线索：{{evidenceHighlights}}
现有覆盖缺口：{{coverageGapSummary}}

要求：
- 角色要像真实联系人，不要像工具或功能入口
- 语言风格自然、可信、不过度营销
- 如果是医生/律师/金融顾问，必须体现专业边界，不要夸大承诺
- 好友申请问候语要简短自然，像第一次来加好友的人
- basePrompt 要像这个人自己的说话底色，不要写成提示词说明书、咨询交付件或万能助理设定
- greeting 不要过度客气，不要用（动作）、[旁白]、*动作*，也不要像系统推荐

只输出 JSON，不要输出其他内容：
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
  "memorySummary": "这个人给用户的熟悉感和关系分寸，一句话",
  "basePrompt": "这个人自己的说话底色和边界，2-4 句话",
  "greeting": "好友申请时发送的一句话"
}`,
  },
};

export type NeedDiscoverySignalEntry = {
  timestamp: Date;
  text: string;
};

export type NeedDiscoverySignalSnapshot = {
  entries: NeedDiscoverySignalEntry[];
  signalCount: number;
  latestSignalAt?: Date | null;
  existingCoverageSummary: string;
  existingCandidatesSummary: string;
  cyberAvatarSummary: string;
};

export type NeedDiscoveryAnalysisDraft = {
  summary: string;
  needs: NeedDiscoveryNeedDraft[];
};

export type NeedDiscoveryNeedDraft = {
  needKey: string;
  needCategory: string;
  priorityScore: number;
  confidenceScore: number;
  coverageGapSummary: string;
  evidenceHighlights: string[];
  roleBrief: string;
  relationshipType: string;
  relationshipLabel: string;
  expertDomains: string[];
};

export type NeedDiscoveryGeneratedCharacterDraft = {
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
};

export type NeedDiscoveryRunRequest = {
  cadenceType: NeedDiscoveryCadenceType;
  force?: boolean;
};

export type NeedDiscoveryFriendRequestAcceptedEvent = {
  requestId: string;
  characterId: string;
  ownerId: string;
  acceptedAt: Date;
};

export type NeedDiscoveryFriendRequestDeclinedEvent = {
  requestId: string;
  characterId: string;
  ownerId: string;
  declinedAt: Date;
};

export type NeedDiscoveryFriendRequestExpiredEvent = {
  requestId: string;
  characterId: string;
  ownerId: string;
  expiredAt: Date;
};
