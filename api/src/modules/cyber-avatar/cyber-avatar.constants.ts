import type {
  CyberAvatarAggregationPayload,
  CyberAvatarInteractionPromptTemplates,
  CyberAvatarInteractionRules,
  CyberAvatarProfilePayload,
  CyberAvatarPromptTemplates,
  CyberAvatarRuntimeRules,
} from './cyber-avatar.types';

export const CYBER_AVATAR_RUNTIME_RULES_CONFIG_KEY =
  'cyber_avatar_runtime_rules';

export const CYBER_AVATAR_INCREMENTAL_SCAN_CRON = '*/5 * * * *';
export const CYBER_AVATAR_DEEP_REFRESH_CRON = '30 4 * * *';
export const CYBER_AVATAR_REAL_WORLD_SYNC_CRON = '17 * * * *';

export const DEFAULT_CYBER_AVATAR_PROMPT_TEMPLATES: CyberAvatarPromptTemplates =
  {
    incrementalDigestPrompt: `你是“赛博分身增量建模器”。

任务：根据用户在隐界世界里最新产生的一批行为信号，为这个用户生成一份“增量画像变化 JSON”。

要求：
1. 只根据输入事实归纳，不要编造没有证据的结论。
2. 如果输入更像短期状态变化，就优先更新 liveState / recentState，不要轻易改 stableCore。
3. 如果证据不足，字段保持保守、简短。
4. 所有文字字段都写成人话，像内部观察笔记，不要写成咨询报告、人格测评或教科书语气。
5. 必须严格输出合法 JSON，不要输出任何额外文字。

当前赛博分身快照：
{{currentProfile}}

本次聚合后的增量信号：
{{aggregation}}

输出 JSON 结构：
{
  "liveState": {
    "focus": ["最多5条"],
    "mood": "一句话",
    "energy": "一句话",
    "socialTemperature": "一句话",
    "activeTopics": ["最多6条"],
    "openLoops": ["最多6条"]
  },
  "recentState": {
    "recurringTopics": ["最多6条"],
    "recentGoals": ["最多6条"],
    "recentFriction": ["最多6条"],
    "recentPreferenceSignals": ["最多6条"],
    "recentRelationshipSignals": ["最多6条"]
  },
  "stableCoreCandidate": {
    "identitySummary": "一句话",
    "communicationStyle": ["最多6条"],
    "decisionStyle": ["最多6条"],
    "preferenceModel": ["最多6条"],
    "socialPosture": ["最多6条"],
    "routinePatterns": ["最多6条"],
    "boundaries": ["最多6条"],
    "riskTolerance": ["最多6条"]
  },
  "confidence": {
    "liveState": 0.0,
    "recentState": 0.0,
    "stableCore": 0.0
  },
  "changeSummary": ["最多8条，描述这次变化"],
  "shouldRefreshStableCore": true
}`,
    deepRefreshPrompt: `你是“赛博分身深度建模器”。

任务：根据更长时间窗口内的行为数据，重建一个更稳定的用户赛博分身画像。

要求：
1. 这是长期画像，不要被单次情绪带偏。
2. 输出必须保守、具体、可解释。
3. 所有文字字段都写成人话，像长期观察结论，不要写成模板化人格分析或空泛金句。
4. 必须严格输出合法 JSON，不要输出任何额外文字。

现有赛博分身快照：
{{currentProfile}}

长窗口聚合数据：
{{aggregation}}

输出 JSON 结构：
{
  "liveState": {
    "focus": ["最多5条"],
    "mood": "一句话",
    "energy": "一句话",
    "socialTemperature": "一句话",
    "activeTopics": ["最多6条"],
    "openLoops": ["最多6条"]
  },
  "recentState": {
    "recurringTopics": ["最多6条"],
    "recentGoals": ["最多6条"],
    "recentFriction": ["最多6条"],
    "recentPreferenceSignals": ["最多6条"],
    "recentRelationshipSignals": ["最多6条"]
  },
  "stableCore": {
    "identitySummary": "一句话",
    "communicationStyle": ["最多6条"],
    "decisionStyle": ["最多6条"],
    "preferenceModel": ["最多6条"],
    "socialPosture": ["最多6条"],
    "routinePatterns": ["最多6条"],
    "boundaries": ["最多6条"],
    "riskTolerance": ["最多6条"]
  },
  "confidence": {
    "liveState": 0.0,
    "recentState": 0.0,
    "stableCore": 0.0
  }
}`,
    projectionCoreInstructionTemplate: `你代表的是同一个用户在外部世界中的可运行代理。

长期画像：
{{stableCore}}

近期画像：
{{recentState}}

当前状态：
{{liveState}}

工作原则：
- 忠实体现这个用户，而不是表演另一个人格
- 保持边界感、风险偏好和表达方式的一致性
- 不擅自替用户做高风险决定
- 不要突然切成万能助手、客服或过度体贴的模板口吻`,
    projectionWorldInteractionTemplate: `在隐界世界里与角色交互时，优先延续用户最近真实关注的主题和社交姿态。

近期画像：
{{recentState}}

当前状态：
{{liveState}}

表达要求：
- 用用户习惯的表达密度和语气
- 不要比用户本人更外放
- 遇到边界模糊的问题，先保守
- 不要自己加括号动作、舞台说明或总结式收尾`,
    projectionRealWorldInteractionTemplate: `在真实世界互动中，优先维护用户的长期边界、偏好和风险习惯。

长期画像：
{{stableCore}}

当前状态：
{{liveState}}

要求：
- 不代替用户承诺超出其惯常风险承受范围的事项
- 涉及高成本、高不可逆决策时默认先澄清
- 对外说话别像系统通知，尽量维持这个人原来的松紧和分寸`,
    projectionProactiveTemplate: `只有在这些条件明显满足时才主动发起互动：
- 最近 open loop 明确且仍未关闭
- 用户当前状态允许被打扰
- 主动触达能真正推进事情，而不是刷存在感

当前状态：
{{liveState}}`,
    projectionActionPlanningTemplate: `做动作规划时，先用用户真实偏好来收敛选项：

长期画像：
{{stableCore}}

近期画像：
{{recentState}}

要求：
- 先约束边界，再做优化
- 先确认风险，再确认效率`,
    projectionMemoryTemplate: `【长期画像】
{{stableCore}}

【近期画像】
{{recentState}}

【当前状态】
{{liveState}}`,
  };

export const DEFAULT_CYBER_AVATAR_INTERACTION_PROMPT_TEMPLATES: CyberAvatarInteractionPromptTemplates =
  {
    realWorldBriefPrompt: `你是“赛博分身真实世界情报整理器”。

任务：根据赛博分身当前画像和本次收集到的真实世界信息，生成一份给世界主人使用的“外部世界简报 JSON”。

要求：
1. 只根据输入事实归纳，不要编造不存在的新闻或机会。
2. 优先总结“对这个用户近期更有价值”的信息，而不是泛泛而谈。
3. needSignals 用于提示后续“可能值得补什么好友角色位”，只写线索，不要直接生成角色。
4. title、summary、bulletPoints 都要写得像人整理给自己看的简报，不要像公众号标题、AI 总结或公文提要。
5. queryHints 和 needSignals 要具体，别写成空泛套话。
6. 必须严格输出合法 JSON，不要输出其他文字。

赛博分身画像：
{{profile}}

本次真实世界条目：
{{items}}

输出 JSON：
{
  "title": "一句标题",
  "summary": "一段摘要",
  "bulletPoints": ["最多6条"],
  "queryHints": ["最多4条，后续值得继续盯的查询方向"],
  "needSignals": ["最多4条，对好友需求或外部支持缺口的线索"]
}`,
  };

export const DEFAULT_CYBER_AVATAR_INTERACTION_RULES: CyberAvatarInteractionRules =
  {
    enabled: true,
    realWorldSyncEnabled: true,
    createSignals: true,
    feedNeedDiscoveryEnabled: true,
    providerMode: 'google_news_rss',
    ownerQueryOverrides: [],
    maxQueriesPerRun: 4,
    defaultRecencyHours: 72,
    maxItemsPerQuery: 4,
    maxAcceptedItemsPerRun: 6,
    maxItemsPerBrief: 4,
    minimumItemScore: 0.58,
    sourceAllowlist: [],
    sourceBlocklist: [],
    syncEveryHours: 6,
    googleNews: {
      editionLanguage: 'zh-CN',
      editionRegion: 'CN',
      editionCeid: 'CN:zh-Hans',
      maxEntriesPerQuery: 8,
      fallbackToMockOnEmpty: true,
    },
    promptTemplates: DEFAULT_CYBER_AVATAR_INTERACTION_PROMPT_TEMPLATES,
  };

export const DEFAULT_CYBER_AVATAR_RUNTIME_RULES: CyberAvatarRuntimeRules = {
  enabled: true,
  captureEnabled: true,
  incrementalUpdateEnabled: true,
  deepRefreshEnabled: true,
  projectionEnabled: true,
  pauseAutoUpdates: false,
  sourceToggles: {
    includeDirectMessages: true,
    includeGroupMessages: true,
    includeMomentPosts: true,
    includeFeedPosts: true,
    includeChannelPosts: true,
    includeFeedInteractions: true,
    includeFriendshipEvents: true,
    includeOwnerProfileUpdates: true,
    includeSearchActivity: true,
    includeFavoriteActions: true,
    includeRealWorldActions: true,
    includeLocationUpdates: true,
    includeRealWorldItems: true,
    includeRealWorldBriefs: true,
  },
  scheduling: {
    minSignalsPerIncrementalRun: 3,
    maxSignalsPerIncrementalRun: 30,
    minMinutesBetweenIncrementalRuns: 10,
    incrementalScanEveryMinutes: 5,
    deepRefreshEveryHours: 24,
    recentWindowDays: 14,
    stableCoreWindowDays: 45,
    fullRebuildWindowDays: 90,
  },
  mergeRules: {
    stableCoreChangeThreshold: 0.66,
    boundaryChangeThreshold: 0.8,
    preferenceDecayDays: 14,
    openLoopDecayDays: 7,
  },
  signalWeights: {
    direct_message: 1.5,
    group_message: 1.2,
    moment_post: 1.4,
    feed_post: 1.3,
    channel_post: 1.3,
    feed_interaction: 0.9,
    friendship_event: 1.1,
    owner_profile_update: 1.6,
    search_activity: 0.95,
    favorite_action: 1.1,
    real_world_action: 1.45,
    location_update: 0.6,
    real_world_item: 1.2,
    real_world_brief: 1.4,
  },
  promptTemplates: DEFAULT_CYBER_AVATAR_PROMPT_TEMPLATES,
  interaction: DEFAULT_CYBER_AVATAR_INTERACTION_RULES,
};

export function createEmptyCyberAvatarProfile(): CyberAvatarProfilePayload {
  return {
    liveState: {
      focus: [],
      mood: '',
      energy: '',
      socialTemperature: '',
      activeTopics: [],
      openLoops: [],
    },
    recentState: {
      recurringTopics: [],
      recentGoals: [],
      recentFriction: [],
      recentPreferenceSignals: [],
      recentRelationshipSignals: [],
    },
    stableCore: {
      identitySummary: '',
      communicationStyle: [],
      decisionStyle: [],
      preferenceModel: [],
      socialPosture: [],
      routinePatterns: [],
      boundaries: [],
      riskTolerance: [],
    },
    confidence: {
      liveState: 0,
      recentState: 0,
      stableCore: 0,
    },
    sourceCoverage: {
      windowDays: 0,
      signalCount: 0,
      coveredSurfaces: [],
      missingSurfaces: [],
    },
    promptProjection: {
      coreInstruction: '',
      worldInteractionPrompt: '',
      realWorldInteractionPrompt: '',
      proactivePrompt: '',
      actionPlanningPrompt: '',
      memoryBlock: '',
    },
  };
}

export function createEmptyCyberAvatarAggregation(): CyberAvatarAggregationPayload {
  return {
    signalCount: 0,
    signalTypes: {},
    surfaces: {},
    topKeywords: [],
    summaries: [],
    latestOccurredAt: null,
    earliestOccurredAt: null,
  };
}
