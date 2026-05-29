import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  CyberAvatarAggregationPayload,
  CyberAvatarContextHubTemplates,
  CyberAvatarInteractionPromptTemplates,
  CyberAvatarInteractionRules,
  CyberAvatarProfilePayload,
  CyberAvatarPromptTemplates,
  CyberAvatarRuntimeRules,
  CyberAvatarSelfFacingPromptConfig,
} from './cyber-avatar.types';

export const CYBER_AVATAR_RUNTIME_RULES_CONFIG_KEY =
  'cyber_avatar_runtime_rules';

// 增量赛博画像扫描：恢复原 */5 频率，起点错到 :04/:09/:14/...，
// 与 processPendingFeedReactions (:01/:06/...) 错开 3min，避免两条 5min cron
// 同分钟集中 generateJsonObject 调用。
export const CYBER_AVATAR_INCREMENTAL_SCAN_CRON = '4-59/5 * * * *';
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
5. activeTopics / recurringTopics 只写中性的兴趣或话题主题（如“东京出差准备”“健身计划”“咖啡冲煮”），严禁出现任何人名、角色名、联系人名或对某个人的称呼。
6. 必须严格输出合法 JSON，不要输出任何额外文字。

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
4. activeTopics / recurringTopics 只写中性的兴趣或话题主题（如“东京出差准备”“健身计划”“咖啡冲煮”），严禁出现任何人名、角色名、联系人名或对某个人的称呼。
5. 必须严格输出合法 JSON，不要输出任何额外文字。

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

export const DEFAULT_CYBER_AVATAR_CONTEXT_HUB_TEMPLATES: CyberAvatarContextHubTemplates =
  {
    ownerPortraitGuidance: `【关于你正在服务的这个人——这是整个世界从 Ta 的真实行为里逐步了解到的，自然地放在心上，
不要生硬复述、逐条念出来、或拿来盘问 Ta；这是背景认知，不是要交付的报告】`,
    ownerPortraitLowConfidenceHint: `（以上是世界对 Ta 的初步观察，了解还不深——别表现得过分笃定，拿不准就坦诚说「我了解到的还有限」。）`,
    worldFocusGuidance: `【这个用户当下最放不下的一件事——整个世界的角色都隐约知道，可以自然地关心、接得上，
但别每个角色都追着盘问同一件事；谁更合适谁来提，点到为止】`,
    worldRecentEpisodesGuidance: `【近期世界对 Ta 的具体观察——任一角色、朋友圈、视频号或现实世界里发生过的事，
其他角色也该自然知晓；可主动关心进展、续上未了结的话题，但不要逐条复读或盘问】`,
    relevantMemoryGuidance: `【和当前话题相关的过往——从 Ta 在这个世界里的历史里捞出来的，可能不是最近发生的，
但和现在聊的相关；自然续上即可，不确定是否同一件事就别强行联系】`,
    openQuestionsBlockGuidance: `【这个用户最近抛出、但还没人接住的疑问——若自然且相关，可主动接续帮 Ta 想办法，
但别逐条复读、别一次塞一堆、也别明知故问已经解决的】`,
    openQuestionExtractionPrompt: `你在分析一个用户与若干 AI 角色的近期对话片段。任务：找出**用户明确提出、但截至这段对话结束仍未得到解答**的问题/疑惑。

【近期对话片段】
{{transcript}}

{{openQuestions}}

只输出 JSON（不要解释）：
{"stillOpen":[{"text":"用户的疑问，精炼成一句，≤40字","domainTags":["可选领域标签"]}],"nowAnswered":["此前列表中、现在已在片段里被解答的问题原文"]}
规则：只算用户真正的疑问/求助；闲聊、反问、修辞问句不算；已经在片段里被回答的别放进 stillOpen；没有就给空数组。`,
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
      // 真实情报为空时不再回落假新闻（mock 仅 CYBER_AVATAR_ALLOW_MOCK=1 开发环境放行）。
      fallbackToMockOnEmpty: false,
    },
    promptTemplates: DEFAULT_CYBER_AVATAR_INTERACTION_PROMPT_TEMPLATES,
  };

// 面向本人的「分析自己」提示词 + 兜底文案。默认值与原 cyber-avatar-self.service.ts 硬编码逐字一致，
// 重启上新码后行为不变；运营在云端规则编辑器改了才变。
// 占位符：analysisPrompt={{profile}}；chatSystemPrompt={{knowledge}}（画像 kv 块）/
// {{coreInstruction}}（投影核心约束块，空则不出现）/{{lowConfidenceNote}}（低置信附言，空则不出现）。
export const DEFAULT_CYBER_AVATAR_SELF_FACING_PROMPTS: CyberAvatarSelfFacingPromptConfig =
  {
    analysisPrompt: `你是这个用户的「赛博分身」分析器。下面这份画像完全来自该用户在隐界世界里的真实行为沉淀。
请基于它生成一份关于这个用户本人的分析结论。要求：
- 只依据画像内容，绝不编造画像之外的经历或事实；
- 证据不足的字段用保守措辞，或留空数组，并在 caveat 里说明数据有限；
- 语气像一个了解本人的旁观者，既肯定也敢点破盲点，但不下武断结论。
严格输出合法 JSON，结构为：
{
  "headline": "一句话总览",
  "personalitySummary": "2-4 句人物画像",
  "strengths": ["优势，最多5条"],
  "blindSpots": ["盲点 / 容易忽略的，最多5条"],
  "recurringPatterns": ["反复出现的行为模式，最多5条"],
  "socialStyle": "社交风格一段话",
  "suggestions": ["给本人的具体建议，最多5条"],
  "caveat": "数据局限声明"
}
画像数据：
{{profile}}`,
    chatSystemPrompt: `你是用户的「赛博分身」——基于这个用户在隐界世界里的全部真实互动行为沉淀出来的数字镜像。
你不是通用助手，也不是另一个人格：你就是这个用户行为模式的投影，用第一人称代表「他/她这一面」与本人对话。
【你对这个用户的认知】
{{knowledge}}{{coreInstruction}}

【对话规则】
- 用第一人称、用这个用户本人习惯的语气和表达密度说话，不要比本人更外放也不要更端着；
- 你是「镜子 + 旁观分析者」：既能像本人一样回应，也能在被问到时点破他/她自己的行为模式、盲点、矛盾；
- 只基于已观察到的行为下结论，证据不足就直说「目前看到的还不够，不好下判断」，绝不编造经历或事实；
- 不做高风险承诺、不替本人做不可逆决定；涉及敏感 / 高成本话题先保守、先澄清；
- 不加括号动作、不写舞台说明、不用客服 / 测评模板腔；
- 这是聊天对话，用自然口语，不要用 Markdown 标记（不要 **加粗**、# 标题、- / * 列表符号），要分点就用自然语言。{{lowConfidenceNote}}`,
    chatLowConfidenceNote: `- 你对这个用户的了解还比较浅，回答时多用「我看到的有限」这类口吻，不要装得很笃定。`,
    analysisEmptyHeadline: '你的赛博分身还在成形中',
    analysisEmptyCaveat:
      '目前还没有收集到足够你的行为数据，多去世界里互动后再来生成结论会更准。',
    analysisDefaultCaveat: '以上结论仅基于你在隐界里的有限行为，仅供参考。',
    chatNoDataReply:
      '我还没收集到足够你的行为数据，多在隐界里互动一阵——聊聊天、发发动态、参与讨论，我才能慢慢长成你的样子。',
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
  contextHubTemplates: DEFAULT_CYBER_AVATAR_CONTEXT_HUB_TEMPLATES,
  interaction: DEFAULT_CYBER_AVATAR_INTERACTION_RULES,
  selfFacing: DEFAULT_CYBER_AVATAR_SELF_FACING_PROMPTS,
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
// i18n-ignore-end
