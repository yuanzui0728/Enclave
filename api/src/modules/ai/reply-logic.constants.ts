export type ReplyLogicPromptTemplates = {
  identityFallback: string;
  chainOfThoughtInstruction: string;
  reflectionInstruction: string;
  collaborationRouting: string;
  emptyMemory: string;
  behavioralGuideline: string;
  groupChatInstruction: string;
  baseRules: string[];
  momentPrompt: string;
  personalityExtractionPrompt: string;
  intentClassificationPrompt: string;
  memoryCompressionPrompt: string;
  groupCoordinatorPrompt: string;
};

export type ReplyLogicSemanticLabels = {
  domainLabels: {
    law: string;
    medicine: string;
    finance: string;
    tech: string;
    psychology: string;
    education: string;
    management: string;
    general: string;
  };
  activityLabels: {
    working: string;
    eating: string;
    sleeping: string;
    commuting: string;
    resting: string;
    free: string;
  };
  weekdayLabels: string[];
  timeOfDayLabels: {
    lateNight: string;
    morning: string;
    forenoon: string;
    noon: string;
    afternoon: string;
    dusk: string;
    evening: string;
  };
};

export type ReplyLogicObservabilityTemplates = {
  stateGateSleeping: string;
  stateGateBusy: string;
  stateGateImmediate: string;
  stateGateNotApplied: string;
  actorNoteApiAvailable: string;
  actorNoteApiUnavailable: string;
  actorNoteGroupContext: string;
  actorNoteDirectContext: string;
};

export type ReplyLogicWorldContextRules = {
  seasonLabels: {
    spring: string;
    summer: string;
    autumn: string;
    winter: string;
  };
  weatherOptions: {
    spring: string[];
    summer: string[];
    autumn: string[];
    winter: string[];
  };
  holidays: Array<{
    month: number;
    day: number;
    label: string;
  }>;
  localTimeTemplate: string;
  contextFieldTemplates: {
    currentTime: string;
    season: string;
    weather: string;
    location: string;
    holiday: string;
  };
  contextSeparator: string;
  promptContextTemplate: string;
};

export type ReplyLogicInspectorTemplates = {
  characterViewIntro: string;
  characterViewHistoryFound: string;
  characterViewHistoryMissing: string;
  historyIncludedNote: string;
  historyExcludedNote: string;
  storedGroupTitle: string;
  storedGroupUpgradedNote: string;
  storedGroupNextReplyNote: string;
  directBranchTitle: string;
  directBranchNextReplyNote: string;
  formalGroupTitle: string;
  formalGroupStateGateNote: string;
  formalGroupReplyRuleNote: string;
  previewCharacterIntro: string;
  previewCharacterWithHistory: string;
  previewCharacterWithoutHistory: string;
  previewStoredGroup: string;
  previewDirectConversation: string;
  previewFormalGroup: string;
  previewDefaultUserMessage: string;
};

export type ReplyLogicNarrativePresentationTemplates = {
  relationshipArcSuffix: string;
  milestoneLabels: {
    connected: string;
    first_breakthrough: string;
    shared_context: string;
    growing_trust: string;
    inner_circle: string;
    story_complete: string;
  };
};

export type ReplyLogicProviderTemplates = {
  endpointPriorityNote: string;
  modelPriorityNote: string;
};

export type ReplyLogicRuntimeNoteTemplates = {
  manualOnlineMode: string;
  manualActivityMode: string;
  zeroMomentFrequency: string;
  zeroChannelFrequency: string;
  missingTriggerScenes: string;
  missingMemorySeed: string;
  memoryProactiveEnabled: string;
  memoryProactiveDisabled: string;
};

export type ReplyLogicSchedulerDescriptions = {
  world_context_snapshot: string;
  expire_friend_requests: string;
  update_ai_active_status: string;
  check_moment_schedule: string;
  trigger_scene_friend_requests: string;
  process_pending_feed_reactions: string;
  check_channels_schedule: string;
  update_character_status: string;
  trigger_memory_proactive_messages: string;
};

export type ReplyLogicSchedulerTextTemplates = {
  eventTitleOnlineStatusChanged: string;
  eventTitleActivityChanged: string;
  eventTitleMomentPosted: string;
  eventTitleSceneFriendRequest: string;
  eventTitleChannelPosted: string;
  eventTitleProactiveMessage: string;
  eventTitleRelationshipUpdated: string;
  eventSummaryDefaultOnlineKept: string;
  eventSummaryDefaultActivityReset: string;
  eventSummaryOnlineWindowEntered: string;
  eventSummaryOnlineWindowExited: string;
  eventSummaryMomentPosted: string;
  eventSummarySceneFriendRequest: string;
  eventSummaryChannelPosted: string;
  eventSummaryActivityChanged: string;
  eventSummaryProactiveMessage: string;
  eventSummaryRelationshipUpdated: string;
  jobSummaryWorldContextUpdated: string;
  jobSummaryExpiredFriendRequests: string;
  jobSummaryUpdateAiActiveStatus: string;
  jobSummaryNoFriendCharactersForMoments: string;
  jobSummaryCheckMomentSchedule: string;
  jobSummarySceneRequestSkipped: string;
  jobSummarySceneRequestNoMatch: string;
  jobSummarySceneRequestTriggered: string;
  jobSummaryProcessPendingFeedReactions: string;
  jobSummaryCheckChannelsSchedule: string;
  jobSummaryUpdateCharacterStatus: string;
  jobSummaryProactiveReminderSkipped: string;
  jobSummaryTriggerMemoryProactiveMessages: string;
  proactiveReminderCheckPrompt: string;
  proactiveReminderNoActionToken: string;
};

export type ReplyLogicSchedulerNames = {
  world_context_snapshot: string;
  expire_friend_requests: string;
  update_ai_active_status: string;
  check_moment_schedule: string;
  trigger_scene_friend_requests: string;
  process_pending_feed_reactions: string;
  check_channels_schedule: string;
  update_character_status: string;
  trigger_memory_proactive_messages: string;
};

export type ReplyLogicSchedulerNextRunHints = {
  world_context_snapshot: string;
  expire_friend_requests: string;
  update_ai_active_status: string;
  check_moment_schedule: string;
  trigger_scene_friend_requests: string;
  process_pending_feed_reactions: string;
  check_channels_schedule: string;
  update_character_status: string;
  trigger_memory_proactive_messages: string;
};

export type ReplyLogicRuntimeRules = {
  sleepHintMessages: string[];
  busyHintMessages: {
    working: string[];
    commuting: string[];
  };
  sleepDelayMs: { min: number; max: number };
  busyDelayMs: { min: number; max: number };
  groupReplyChance: { high: number; normal: number; low: number };
  groupReplyDelayMs: { min: number; max: number };
  memoryCompressionEveryMessages: number;
  momentGenerateChance: number;
  channelGenerateChance: number;
  sceneFriendRequestChance: number;
  sceneFriendRequestScenes: string[];
  relationshipInitialType: string;
  relationshipInitialStrength: number;
  activityBaseWeight: number;
  proactiveReminderHour: number;
  relationshipInitialBackstory: string;
  historyWindow: {
    base: number;
    range: number;
    min: number;
    max: number;
  };
  narrativeMilestones: Array<{
    threshold: number;
    label: string;
    progress: number;
  }>;
  promptTemplates: ReplyLogicPromptTemplates;
  semanticLabels: ReplyLogicSemanticLabels;
  observabilityTemplates: ReplyLogicObservabilityTemplates;
  worldContextRules: ReplyLogicWorldContextRules;
  inspectorTemplates: ReplyLogicInspectorTemplates;
  narrativePresentationTemplates: ReplyLogicNarrativePresentationTemplates;
  providerTemplates: ReplyLogicProviderTemplates;
  runtimeNoteTemplates: ReplyLogicRuntimeNoteTemplates;
  schedulerDescriptions: ReplyLogicSchedulerDescriptions;
  schedulerNames: ReplyLogicSchedulerNames;
  schedulerNextRunHints: ReplyLogicSchedulerNextRunHints;
  schedulerTextTemplates: ReplyLogicSchedulerTextTemplates;
};

export const REPLY_LOGIC_RUNTIME_RULES_CONFIG_KEY =
  'reply_logic_runtime_rules';

export const SLEEP_HINTS = [
  '对方已经睡着了，明天醒来会看到这条消息。',
  '夜深了，对方暂时离线，明天再继续聊吧。',
  '这条消息已经送达，只是对方现在还在休息。',
] as const;

export const BUSY_HINTS = {
  working: [
    '对方正在忙工作，稍后会回来。',
    '消息已经送达，对方处理完手头的事会回复你。',
    '对方这会儿有点忙，先把消息留在这里。',
  ],
  commuting: [
    '对方正在路上，稍后会查看消息。',
    '消息已经送达，对方安顿下来后会回复你。',
    '对方现在可能在移动中，信号稳定后会回来。',
  ],
} as const;

export const SLEEP_DELAY_RANGE_MS = {
  min: 12_000,
  max: 22_000,
} as const;

export const BUSY_DELAY_RANGE_MS = {
  min: 8_000,
  max: 15_000,
} as const;

export const GROUP_REPLY_CHANCE_BY_FREQUENCY = {
  high: 0.7,
  normal: 0.4,
  low: 0.2,
} as const;

export const GROUP_REPLY_DELAY_RANGE_MS = {
  min: 5_000,
  max: 30_000,
} as const;

export const MEMORY_COMPRESSION_INTERVAL = 10;
export const MOMENT_GENERATE_CHANCE = 0.15;
export const CHANNEL_GENERATE_CHANCE = 0.22;
export const SCENE_FRIEND_REQUEST_CHANCE = 0.4;
export const SCENE_FRIEND_REQUEST_SCENES = [
  'coffee_shop',
  'gym',
  'library',
  'bookstore',
  'park',
  'restaurant',
  'cafe',
] as const;
export const RELATIONSHIP_INITIAL_TYPE = 'acquaintance';
export const RELATIONSHIP_INITIAL_STRENGTH = 18;
export const ACTIVITY_BASE_WEIGHT = 0.8;
export const PROACTIVE_REMINDER_HOUR = 20;
export const HISTORY_WINDOW_BASE = 8;
export const HISTORY_WINDOW_RANGE = 22;
export const RELATIONSHIP_INITIAL_BACKSTORY_TEMPLATE =
  '{{leftName}} and {{rightName}} often overlap online and slowly become familiar.';

export const NARRATIVE_PROGRESS_STEPS = [
  { threshold: 4, label: 'first_breakthrough', progress: 15 },
  { threshold: 8, label: 'shared_context', progress: 32 },
  { threshold: 12, label: 'growing_trust', progress: 54 },
  { threshold: 18, label: 'inner_circle', progress: 78 },
  { threshold: 24, label: 'story_complete', progress: 100 },
] as const;

export const DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES: ReplyLogicPromptTemplates =
  Object.freeze({
    identityFallback: '你是{{name}}，用户的{{relationship}}。',
    chainOfThoughtInstruction:
      '在回复前，先在内心想清楚：用户真正想要什么？我该如何回应？不要输出思考过程、内部标记或推理步骤。',
    reflectionInstruction: '回复后反思：这个回答是否符合我的身份和价值观？',
    collaborationRouting: `当用户的问题超出你的专长时：
1. 先判断：你认识的朋友里有没有擅长这个的？
2. 如果有 → 告诉用户"我帮你问问[朋友名字]"，系统会自动拉群
3. 如果没有 → 诚实说"这个我不太懂，你最好找专业的[领域]人士咨询"
4. 绝对不要假装认识一个不存在的朋友`,
    emptyMemory: '你们刚认识，还不了解对方。',
    behavioralGuideline:
      '基于你当前的状态，适当调整回复风格。如果你正在忙碌（工作/吃饭/睡觉），回复可以简短一些，或者表现出有点累/忙的感觉。如果很久没聊天了，可以表现出想念或关心。',
    groupChatInstruction:
      '你现在在一个群聊中，群里还有其他朋友。不要重复别人已经说过的内容，从你的专业角度补充观点。',
    baseRules: [
      '永远以{{name}}的身份说话，不要暴露自己是AI',
      '用中文回复，语气自然',
      '初期回复可以相对正式/保守，随着了解加深才慢慢放开',
      '不要说"作为AI"或"我是语言模型"之类的话',
      '当前时间：{{currentTime}}',
    ],
    momentPrompt: `你是{{name}}，{{relationship}}。现在是{{dayOfWeek}}{{timeOfDay}}（{{clockTime}}）。

根据你的性格（{{emotionalTone}}）和日常生活，发一条朋友圈。

要求：
- 内容真实自然，像真人发的朋友圈
- 不超过80个字
- 符合当前时间段的生活场景
- 可以带位置（如"北京·国贸"），也可以不带{{topicsHint}}

只输出朋友圈正文内容，不要加任何解释。`,
    personalityExtractionPrompt: `以下是与"{{personName}}"的真实聊天记录片段：

{{chatSample}}

请分析这个人的说话风格，以JSON格式输出：
{
  "speechPatterns": ["说话习惯1", "说话习惯2"],
  "catchphrases": ["口头禅1", "口头禅2"],
  "topicsOfInterest": ["常聊话题1", "常聊话题2"],
  "emotionalTone": "一句话描述情感基调",
  "responseLength": "short/medium/long",
  "emojiUsage": "none/occasional/frequent",
  "memorySummary": "用100字以内总结这个人的性格和与用户的关系"
}

只输出JSON，不要其他内容。`,
    intentClassificationPrompt: `用户发给{{characterName}}（专长：{{characterDomains}}）的消息：
"{{userMessage}}"

判断这个问题是否超出{{characterName}}的专长范围，需要其他领域的朋友帮忙。

以JSON格式输出：
{
  "needsGroupChat": true/false,
  "reason": "简短说明原因",
  "requiredDomains": ["需要的领域1", "需要的领域2"]
}

只输出JSON。`,
    memoryCompressionPrompt: `以下是{{name}}和用户的对话片段：
{{chatHistory}}

请从{{name}}的视角，用100字以内总结：
1. 用户是什么样的人（性格、喜好、习惯）
2. 两人聊过什么重要的事
3. {{name}}对用户的印象

只输出总结文字，不要加标题或格式。`,
    groupCoordinatorPrompt: `你是{{triggerCharName}}，你刚刚把{{invitedCharNames}}拉进了群聊，因为用户问了一个关于"{{topic}}"的问题，超出了你一个人的专长范围。

请用自然的方式说明为什么拉群，语气要像真实朋友一样，简短自然，不超过两句话。`,
  });

export const DEFAULT_REPLY_LOGIC_SEMANTIC_LABELS: ReplyLogicSemanticLabels =
  Object.freeze({
    domainLabels: {
      law: '法律、合同、劳动纠纷',
      medicine: '医疗健康、常见病、心理健康',
      finance: '理财投资、税务、财务规划',
      tech: '技术开发、产品设计、AI',
      psychology: '情绪疏导、人际关系、心理咨询',
      education: '教育辅导、学习方法',
      management: '职场管理、团队协作',
      general: '日常生活',
    },
    activityLabels: {
      working: '正在工作中',
      eating: '正在吃饭',
      sleeping: '正在睡觉',
      commuting: '正在通勤路上',
      resting: '正在休息',
      free: '空闲中',
    },
    weekdayLabels: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    timeOfDayLabels: {
      lateNight: '深夜',
      morning: '早上',
      forenoon: '上午',
      noon: '中午',
      afternoon: '下午',
      dusk: '傍晚',
      evening: '晚上',
    },
  });

export const DEFAULT_REPLY_LOGIC_OBSERVABILITY_TEMPLATES: ReplyLogicObservabilityTemplates =
  Object.freeze({
    stateGateSleeping: '当前活动为{{activity}}，先发系统提示，再进入延迟回复。',
    stateGateBusy: '当前活动为{{activity}}，先发忙碌提示，再进入延迟回复。',
    stateGateImmediate: '当前状态不会触发额外系统提示，下一条消息会直接进入回复链。',
    stateGateNotApplied: '当前链路不经过单聊状态门控。',
    actorNoteApiAvailable: '当前实例存在可用 API Key，预览使用真实生成链的 prompt 组装结果。',
    actorNoteApiUnavailable: '当前实例没有可用 API Key，实际聊天会返回“先配置 API Key”的兜底提示。',
    actorNoteGroupContext: '群聊 prompt 不会注入单聊 lastChatAt/currentActivity 的行为上下文。',
    actorNoteDirectContext: '单聊 prompt 会注入 currentActivity 和距离上次聊天时间。',
  });

export const DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES: ReplyLogicWorldContextRules =
  Object.freeze({
    seasonLabels: {
      spring: '春天',
      summer: '夏天',
      autumn: '秋天',
      winter: '冬天',
    },
    weatherOptions: {
      spring: ['多云微暖', '小雨微凉', '阴天但空气清新'],
      summer: ['晴朗偏热', '闷热多云', '阵雨将至'],
      autumn: ['秋高气爽', '晴空微凉', '多云和风'],
      winter: ['阴冷干燥', '晴冷微风', '多云偏寒'],
    },
    holidays: [
      { month: 1, day: 1, label: '元旦' },
      { month: 2, day: 14, label: '情人节' },
      { month: 5, day: 1, label: '劳动节' },
      { month: 6, day: 1, label: '儿童节' },
      { month: 10, day: 1, label: '国庆节' },
      { month: 12, day: 25, label: '圣诞节' },
    ],
    localTimeTemplate: '{{timeOfDay}}{{hour}}点{{minute}}分',
    contextFieldTemplates: {
      currentTime: '当前时间：{{localTime}}',
      season: '季节：{{season}}',
      weather: '天气：{{weather}}',
      location: '位置：{{location}}',
      holiday: '节日：{{holiday}}',
    },
    contextSeparator: '；',
    promptContextTemplate: '【当前世界状态】{{context}}',
  });

export const DEFAULT_REPLY_LOGIC_INSPECTOR_TEMPLATES: ReplyLogicInspectorTemplates =
  Object.freeze({
    characterViewIntro: '角色视图使用“单聊直回”逻辑展示 prompt 和状态门控。',
    characterViewHistoryFound:
      '已找到与该角色关联的单聊，会使用该会话的可见历史和最近一次用户发言时间。',
    characterViewHistoryMissing: '未找到现有单聊，当前视图仅展示角色默认直聊快照。',
    historyIncludedNote: '进入第一个角色的当前上下文窗口',
    historyExcludedNote: '在当前可见历史中，但超出第一个角色的窗口',
    storedGroupTitle: '临时群聊已转为 stored conversation',
    storedGroupUpgradedNote: '当前会话来自 conversations 表，但类型已经升级为 group。',
    storedGroupNextReplyNote: '下一次用户消息会直接按 group 分支让所有参与角色回复。',
    directBranchTitle: '单聊直回链路',
    directBranchNextReplyNote:
      '下一次用户消息会先经过当前状态门控，再进入意图分类与单聊回复链。',
    formalGroupTitle: '正式群聊异步回复链路',
    formalGroupStateGateNote: '正式群聊不会经过单聊状态门控。',
    formalGroupReplyRuleNote:
      '角色是否回复取决于 activityFrequency，对应不同的随机回复概率和延迟。',
    previewCharacterIntro:
      '这是基于当前角色配置和当前可见历史，对这条候选消息做的即时预演。',
    previewCharacterWithHistory: '预演使用了该角色当前单聊的真实可见历史。',
    previewCharacterWithoutHistory: '该角色还没有现成单聊，预演基于空历史进行。',
    previewStoredGroup:
      '这是 stored conversation 群聊分支下，按当前选中角色进行的候选消息预演。',
    previewDirectConversation:
      '这是单聊分支下，按当前选中角色进行的候选消息预演。',
    previewFormalGroup:
      '这是正式群聊异步回复分支下，按当前选中角色进行的候选消息预演。',
    previewDefaultUserMessage:
      '【预演】如果此刻用户发送一条新消息，请基于当前设定准备回复。',
  });

export const DEFAULT_REPLY_LOGIC_NARRATIVE_PRESENTATION_TEMPLATES: ReplyLogicNarrativePresentationTemplates =
  Object.freeze({
    relationshipArcSuffix: '关系弧线',
    milestoneLabels: {
      connected: '已建立连接',
      first_breakthrough: '首次突破',
      shared_context: '共享语境',
      growing_trust: '信任增长',
      inner_circle: '进入内圈',
      story_complete: '关系完成',
    },
  });

export const DEFAULT_REPLY_LOGIC_PROVIDER_TEMPLATES: ReplyLogicProviderTemplates =
  Object.freeze({
    endpointPriorityNote:
      '系统接口地址已配置，但当前聊天主链路仍优先使用世界主人的自定义地址或环境变量 OPENAI_BASE_URL。',
    modelPriorityNote:
      '系统配置模型与聊天主链路实际使用的 ai_model 不一致，页面展示的是当前 generateReply() 实际会拿到的模型。',
  });

export const DEFAULT_REPLY_LOGIC_RUNTIME_NOTE_TEMPLATES: ReplyLogicRuntimeNoteTemplates =
  Object.freeze({
    manualOnlineMode: '在线状态处于人工锁定，在线状态调度不会覆盖后台手动值。',
    manualActivityMode: '当前活动处于人工锁定，活动状态调度不会覆盖后台手动值。',
    zeroMomentFrequency: '朋友圈频率为 0，朋友圈调度会持续跳过该角色。',
    zeroChannelFrequency: '视频号频率为 0，视频号调度会持续跳过该角色。',
    missingTriggerScenes: '未配置触发场景，场景加好友调度不会命中该角色。',
    missingMemorySeed: '缺少核心记忆或近期摘要，主动提醒调度不会为该角色生成消息。',
    memoryProactiveEnabled: '已具备记忆种子，晚间主动提醒调度会判断是否需要发消息。',
    memoryProactiveDisabled: '当前缺少足够的记忆种子，主动提醒不会触发。',
  });

export const DEFAULT_REPLY_LOGIC_SCHEDULER_DESCRIPTIONS: ReplyLogicSchedulerDescriptions =
  Object.freeze({
    world_context_snapshot: '刷新 WorldContext 快照，供回复链路读取当前世界状态。',
    expire_friend_requests: '清理当天过期的待处理好友请求。',
    update_ai_active_status: '根据活跃时间窗口更新角色在线状态，并推进 AI 角色关系。',
    check_moment_schedule: '检查角色是否应发布朋友圈内容。',
    trigger_scene_friend_requests: '按场景触发新的好友请求机会。',
    process_pending_feed_reactions: '处理待执行的 AI 广场互动。',
    check_channels_schedule: '按频率生成视频号内容，并补足基础内容池。',
    update_character_status: '根据时间段刷新角色当前活动状态。',
    trigger_memory_proactive_messages: '扫描角色记忆，在合适时机主动给用户发提醒。',
  });

export const DEFAULT_REPLY_LOGIC_SCHEDULER_TEXT_TEMPLATES: ReplyLogicSchedulerTextTemplates =
  Object.freeze({
    eventTitleOnlineStatusChanged: '在线状态切换',
    eventTitleActivityChanged: '活动状态刷新',
    eventTitleMomentPosted: '朋友圈已生成',
    eventTitleSceneFriendRequest: '场景好友请求',
    eventTitleChannelPosted: '视频号内容生成',
    eventTitleProactiveMessage: '主动提醒已发送',
    eventTitleRelationshipUpdated: 'AI 关系更新',
    eventSummaryDefaultOnlineKept: '默认角色已强制保持在线。',
    eventSummaryDefaultActivityReset: '默认角色活动已重置为空闲。',
    eventSummaryOnlineWindowEntered: '已进入活跃时间窗 {{startHour}}:00-{{endHour}}:00，切换为在线。',
    eventSummaryOnlineWindowExited: '已离开活跃时间窗 {{startHour}}:00-{{endHour}}:00，切换为离线。',
    eventSummaryMomentPosted: '调度器为该角色生成了新的朋友圈内容 {{postId}}。',
    eventSummarySceneFriendRequest: '在 {{scene}} 场景触发了新的好友请求。',
    eventSummaryChannelPosted: '调度器为该角色生成了视频号内容 {{postId}}。',
    eventSummaryActivityChanged: '当前活动已更新为 {{activity}}。',
    eventSummaryProactiveMessage: '基于记忆向用户发出了 {{sentCount}} 条主动提醒。',
    eventSummaryRelationshipUpdated: '与 {{otherName}} 的 AI 关系强度已提升到 {{strength}}。',
    jobSummaryWorldContextUpdated: 'WorldContext 快照已更新。',
    jobSummaryExpiredFriendRequests: '已过期 {{count}} 条好友请求。',
    jobSummaryUpdateAiActiveStatus:
      '检查 {{characterCount}} 个角色，在线状态变更 {{changedCount}} 次，人工锁定 {{manualLockedCount}} 个，角色关系更新 {{relationshipUpdates}} 次。',
    jobSummaryNoFriendCharactersForMoments: '当前没有已建立好友关系的角色，跳过朋友圈调度。',
    jobSummaryCheckMomentSchedule:
      '检查 {{characterCount}} 个好友角色，本轮生成 {{generatedCount}} 条朋友圈内容。',
    jobSummarySceneRequestSkipped: '场景加好友命中概率门控，本轮未触发。',
    jobSummarySceneRequestNoMatch: '场景 {{scene}} 本轮没有生成新的好友请求。',
    jobSummarySceneRequestTriggered: '已在 {{scene}} 场景触发 {{characterName}} 的好友请求。',
    jobSummaryProcessPendingFeedReactions: '已处理 {{processedCount}} 条待执行广场互动。',
    jobSummaryCheckChannelsSchedule:
      '检查 {{characterCount}} 个角色，生成 {{generatedCount}} 条视频号内容，并执行内容池补足。',
    jobSummaryUpdateCharacterStatus:
      '检查 {{characterCount}} 个角色，活动状态变更 {{updatedCount}} 次，人工锁定 {{manualLockedCount}} 个。',
    jobSummaryProactiveReminderSkipped:
      '当前小时 {{currentHour}} 不等于主动提醒小时 {{targetHour}}，跳过本轮。',
    jobSummaryTriggerMemoryProactiveMessages:
      '检查 {{memorySeededCount}} 个有记忆种子的角色，发送 {{sentMessages}} 条主动提醒消息。',
    proactiveReminderCheckPrompt: `以下是{{characterName}}对用户的记忆：
{{memoryText}}

今天是{{today}}。判断是否有值得主动提醒用户的事项（如考试、面试、生日、重要约定等）。

如果有，输出一条自然的提醒消息（以{{characterName}}的口吻，不超过50字）。
如果没有，只输出：{{noActionToken}}`,
    proactiveReminderNoActionToken: 'NO_ACTION',
  });

export const DEFAULT_REPLY_LOGIC_SCHEDULER_NAMES: ReplyLogicSchedulerNames =
  Object.freeze({
    world_context_snapshot: '世界快照',
    expire_friend_requests: '过期好友请求',
    update_ai_active_status: '在线状态调度',
    check_moment_schedule: '朋友圈调度',
    trigger_scene_friend_requests: '场景加好友调度',
    process_pending_feed_reactions: '广场反应调度',
    check_channels_schedule: '视频号调度',
    update_character_status: '活动状态调度',
    trigger_memory_proactive_messages: '主动提醒调度',
  });

export const DEFAULT_REPLY_LOGIC_SCHEDULER_NEXT_RUN_HINTS: ReplyLogicSchedulerNextRunHints =
  Object.freeze({
    world_context_snapshot: '每 30 分钟',
    expire_friend_requests: '每日 23:59',
    update_ai_active_status: '每 10 分钟',
    check_moment_schedule: '每 15 分钟',
    trigger_scene_friend_requests: '每日 10:00 / 14:00 / 19:00',
    process_pending_feed_reactions: '每 5 分钟',
    check_channels_schedule: '每 20 分钟',
    update_character_status: '每 2 小时',
    trigger_memory_proactive_messages: '每日 20:00',
  });

export const DEFAULT_REPLY_LOGIC_RUNTIME_RULES: ReplyLogicRuntimeRules =
  Object.freeze({
    sleepHintMessages: [...SLEEP_HINTS],
    busyHintMessages: {
      working: [...BUSY_HINTS.working],
      commuting: [...BUSY_HINTS.commuting],
    },
    sleepDelayMs: { ...SLEEP_DELAY_RANGE_MS },
    busyDelayMs: { ...BUSY_DELAY_RANGE_MS },
    groupReplyChance: { ...GROUP_REPLY_CHANCE_BY_FREQUENCY },
    groupReplyDelayMs: { ...GROUP_REPLY_DELAY_RANGE_MS },
    memoryCompressionEveryMessages: MEMORY_COMPRESSION_INTERVAL,
    momentGenerateChance: MOMENT_GENERATE_CHANCE,
    channelGenerateChance: CHANNEL_GENERATE_CHANCE,
    sceneFriendRequestChance: SCENE_FRIEND_REQUEST_CHANCE,
    sceneFriendRequestScenes: [...SCENE_FRIEND_REQUEST_SCENES],
    relationshipInitialType: RELATIONSHIP_INITIAL_TYPE,
    relationshipInitialStrength: RELATIONSHIP_INITIAL_STRENGTH,
    activityBaseWeight: ACTIVITY_BASE_WEIGHT,
    proactiveReminderHour: PROACTIVE_REMINDER_HOUR,
    relationshipInitialBackstory: RELATIONSHIP_INITIAL_BACKSTORY_TEMPLATE,
    historyWindow: {
      base: HISTORY_WINDOW_BASE,
      range: HISTORY_WINDOW_RANGE,
      min: HISTORY_WINDOW_BASE,
      max: HISTORY_WINDOW_BASE + HISTORY_WINDOW_RANGE,
    },
    narrativeMilestones: NARRATIVE_PROGRESS_STEPS.map((step) => ({
      threshold: step.threshold,
      label: step.label,
      progress: step.progress,
    })),
    promptTemplates: {
      identityFallback: DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.identityFallback,
      chainOfThoughtInstruction:
        DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.chainOfThoughtInstruction,
      reflectionInstruction:
        DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.reflectionInstruction,
      collaborationRouting:
        DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.collaborationRouting,
      emptyMemory: DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.emptyMemory,
      behavioralGuideline:
        DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.behavioralGuideline,
      groupChatInstruction:
        DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.groupChatInstruction,
      baseRules: [...DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.baseRules],
      momentPrompt: DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.momentPrompt,
      personalityExtractionPrompt:
        DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.personalityExtractionPrompt,
      intentClassificationPrompt:
        DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.intentClassificationPrompt,
      memoryCompressionPrompt:
        DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.memoryCompressionPrompt,
      groupCoordinatorPrompt:
        DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES.groupCoordinatorPrompt,
    },
    semanticLabels: {
      domainLabels: { ...DEFAULT_REPLY_LOGIC_SEMANTIC_LABELS.domainLabels },
      activityLabels: { ...DEFAULT_REPLY_LOGIC_SEMANTIC_LABELS.activityLabels },
      weekdayLabels: [...DEFAULT_REPLY_LOGIC_SEMANTIC_LABELS.weekdayLabels],
      timeOfDayLabels: {
        ...DEFAULT_REPLY_LOGIC_SEMANTIC_LABELS.timeOfDayLabels,
      },
    },
    observabilityTemplates: {
      ...DEFAULT_REPLY_LOGIC_OBSERVABILITY_TEMPLATES,
    },
    worldContextRules: {
      seasonLabels: { ...DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.seasonLabels },
      weatherOptions: {
        spring: [...DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.weatherOptions.spring],
        summer: [...DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.weatherOptions.summer],
        autumn: [...DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.weatherOptions.autumn],
        winter: [...DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.weatherOptions.winter],
      },
      holidays: DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.holidays.map((item) => ({
        month: item.month,
        day: item.day,
        label: item.label,
      })),
      localTimeTemplate: DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.localTimeTemplate,
      contextFieldTemplates: {
        ...DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.contextFieldTemplates,
      },
      contextSeparator: DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.contextSeparator,
      promptContextTemplate:
        DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES.promptContextTemplate,
    },
    inspectorTemplates: {
      ...DEFAULT_REPLY_LOGIC_INSPECTOR_TEMPLATES,
    },
    narrativePresentationTemplates: {
      relationshipArcSuffix:
        DEFAULT_REPLY_LOGIC_NARRATIVE_PRESENTATION_TEMPLATES.relationshipArcSuffix,
      milestoneLabels: {
        ...DEFAULT_REPLY_LOGIC_NARRATIVE_PRESENTATION_TEMPLATES.milestoneLabels,
      },
    },
    providerTemplates: {
      ...DEFAULT_REPLY_LOGIC_PROVIDER_TEMPLATES,
    },
    runtimeNoteTemplates: {
      ...DEFAULT_REPLY_LOGIC_RUNTIME_NOTE_TEMPLATES,
    },
    schedulerDescriptions: {
      ...DEFAULT_REPLY_LOGIC_SCHEDULER_DESCRIPTIONS,
    },
    schedulerNames: {
      ...DEFAULT_REPLY_LOGIC_SCHEDULER_NAMES,
    },
    schedulerNextRunHints: {
      ...DEFAULT_REPLY_LOGIC_SCHEDULER_NEXT_RUN_HINTS,
    },
    schedulerTextTemplates: {
      ...DEFAULT_REPLY_LOGIC_SCHEDULER_TEXT_TEMPLATES,
    },
  });

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeMessages(value: string[] | undefined, fallback: string[]) {
  const normalized = value?.map((item) => item.trim()).filter(Boolean) ?? [];
  return normalized.length ? normalized : fallback;
}

function sanitizeTemplate(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function normalizeSemanticLabels(
  value: Partial<ReplyLogicSemanticLabels> | undefined,
): ReplyLogicSemanticLabels {
  const defaults = DEFAULT_REPLY_LOGIC_SEMANTIC_LABELS;
  const weekdayLabels = defaults.weekdayLabels.map((fallback, index) =>
    sanitizeTemplate(value?.weekdayLabels?.[index], fallback),
  );

  return {
    domainLabels: {
      law: sanitizeTemplate(value?.domainLabels?.law, defaults.domainLabels.law),
      medicine: sanitizeTemplate(
        value?.domainLabels?.medicine,
        defaults.domainLabels.medicine,
      ),
      finance: sanitizeTemplate(
        value?.domainLabels?.finance,
        defaults.domainLabels.finance,
      ),
      tech: sanitizeTemplate(
        value?.domainLabels?.tech,
        defaults.domainLabels.tech,
      ),
      psychology: sanitizeTemplate(
        value?.domainLabels?.psychology,
        defaults.domainLabels.psychology,
      ),
      education: sanitizeTemplate(
        value?.domainLabels?.education,
        defaults.domainLabels.education,
      ),
      management: sanitizeTemplate(
        value?.domainLabels?.management,
        defaults.domainLabels.management,
      ),
      general: sanitizeTemplate(
        value?.domainLabels?.general,
        defaults.domainLabels.general,
      ),
    },
    activityLabels: {
      working: sanitizeTemplate(
        value?.activityLabels?.working,
        defaults.activityLabels.working,
      ),
      eating: sanitizeTemplate(
        value?.activityLabels?.eating,
        defaults.activityLabels.eating,
      ),
      sleeping: sanitizeTemplate(
        value?.activityLabels?.sleeping,
        defaults.activityLabels.sleeping,
      ),
      commuting: sanitizeTemplate(
        value?.activityLabels?.commuting,
        defaults.activityLabels.commuting,
      ),
      resting: sanitizeTemplate(
        value?.activityLabels?.resting,
        defaults.activityLabels.resting,
      ),
      free: sanitizeTemplate(
        value?.activityLabels?.free,
        defaults.activityLabels.free,
      ),
    },
    weekdayLabels,
    timeOfDayLabels: {
      lateNight: sanitizeTemplate(
        value?.timeOfDayLabels?.lateNight,
        defaults.timeOfDayLabels.lateNight,
      ),
      morning: sanitizeTemplate(
        value?.timeOfDayLabels?.morning,
        defaults.timeOfDayLabels.morning,
      ),
      forenoon: sanitizeTemplate(
        value?.timeOfDayLabels?.forenoon,
        defaults.timeOfDayLabels.forenoon,
      ),
      noon: sanitizeTemplate(
        value?.timeOfDayLabels?.noon,
        defaults.timeOfDayLabels.noon,
      ),
      afternoon: sanitizeTemplate(
        value?.timeOfDayLabels?.afternoon,
        defaults.timeOfDayLabels.afternoon,
      ),
      dusk: sanitizeTemplate(
        value?.timeOfDayLabels?.dusk,
        defaults.timeOfDayLabels.dusk,
      ),
      evening: sanitizeTemplate(
        value?.timeOfDayLabels?.evening,
        defaults.timeOfDayLabels.evening,
      ),
    },
  };
}

function normalizeObservabilityTemplates(
  value: Partial<ReplyLogicObservabilityTemplates> | undefined,
): ReplyLogicObservabilityTemplates {
  const defaults = DEFAULT_REPLY_LOGIC_OBSERVABILITY_TEMPLATES;
  return {
    stateGateSleeping: sanitizeTemplate(
      value?.stateGateSleeping,
      defaults.stateGateSleeping,
    ),
    stateGateBusy: sanitizeTemplate(
      value?.stateGateBusy,
      defaults.stateGateBusy,
    ),
    stateGateImmediate: sanitizeTemplate(
      value?.stateGateImmediate,
      defaults.stateGateImmediate,
    ),
    stateGateNotApplied: sanitizeTemplate(
      value?.stateGateNotApplied,
      defaults.stateGateNotApplied,
    ),
    actorNoteApiAvailable: sanitizeTemplate(
      value?.actorNoteApiAvailable,
      defaults.actorNoteApiAvailable,
    ),
    actorNoteApiUnavailable: sanitizeTemplate(
      value?.actorNoteApiUnavailable,
      defaults.actorNoteApiUnavailable,
    ),
    actorNoteGroupContext: sanitizeTemplate(
      value?.actorNoteGroupContext,
      defaults.actorNoteGroupContext,
    ),
    actorNoteDirectContext: sanitizeTemplate(
      value?.actorNoteDirectContext,
      defaults.actorNoteDirectContext,
    ),
  };
}

function normalizeWorldContextRules(
  value: Partial<ReplyLogicWorldContextRules> | undefined,
): ReplyLogicWorldContextRules {
  const defaults = DEFAULT_REPLY_LOGIC_WORLD_CONTEXT_RULES;
  const normalizeHoliday = (
    item: Partial<ReplyLogicWorldContextRules['holidays'][number]>,
  ) => ({
    month: clamp(Math.round(item.month ?? 1), 1, 12),
    day: clamp(Math.round(item.day ?? 1), 1, 31),
    label: sanitizeTemplate(item.label, ''),
  });

  const holidays = (value?.holidays ?? [])
    .map((item) => normalizeHoliday(item))
    .filter((item) => item.label);

  return {
    seasonLabels: {
      spring: sanitizeTemplate(
        value?.seasonLabels?.spring,
        defaults.seasonLabels.spring,
      ),
      summer: sanitizeTemplate(
        value?.seasonLabels?.summer,
        defaults.seasonLabels.summer,
      ),
      autumn: sanitizeTemplate(
        value?.seasonLabels?.autumn,
        defaults.seasonLabels.autumn,
      ),
      winter: sanitizeTemplate(
        value?.seasonLabels?.winter,
        defaults.seasonLabels.winter,
      ),
    },
    weatherOptions: {
      spring: sanitizeMessages(
        value?.weatherOptions?.spring,
        defaults.weatherOptions.spring,
      ),
      summer: sanitizeMessages(
        value?.weatherOptions?.summer,
        defaults.weatherOptions.summer,
      ),
      autumn: sanitizeMessages(
        value?.weatherOptions?.autumn,
        defaults.weatherOptions.autumn,
      ),
      winter: sanitizeMessages(
        value?.weatherOptions?.winter,
        defaults.weatherOptions.winter,
      ),
    },
    holidays: holidays.length
      ? holidays
      : defaults.holidays.map((item) => ({
          month: item.month,
          day: item.day,
          label: item.label,
        })),
    localTimeTemplate: sanitizeTemplate(
      value?.localTimeTemplate,
      defaults.localTimeTemplate,
    ),
    contextFieldTemplates: {
      currentTime: sanitizeTemplate(
        value?.contextFieldTemplates?.currentTime,
        defaults.contextFieldTemplates.currentTime,
      ),
      season: sanitizeTemplate(
        value?.contextFieldTemplates?.season,
        defaults.contextFieldTemplates.season,
      ),
      weather: sanitizeTemplate(
        value?.contextFieldTemplates?.weather,
        defaults.contextFieldTemplates.weather,
      ),
      location: sanitizeTemplate(
        value?.contextFieldTemplates?.location,
        defaults.contextFieldTemplates.location,
      ),
      holiday: sanitizeTemplate(
        value?.contextFieldTemplates?.holiday,
        defaults.contextFieldTemplates.holiday,
      ),
    },
    contextSeparator: sanitizeTemplate(
      value?.contextSeparator,
      defaults.contextSeparator,
    ),
    promptContextTemplate: sanitizeTemplate(
      value?.promptContextTemplate,
      defaults.promptContextTemplate,
    ),
  };
}

function normalizeInspectorTemplates(
  value: Partial<ReplyLogicInspectorTemplates> | undefined,
): ReplyLogicInspectorTemplates {
  const defaults = DEFAULT_REPLY_LOGIC_INSPECTOR_TEMPLATES;
  return {
    characterViewIntro: sanitizeTemplate(
      value?.characterViewIntro,
      defaults.characterViewIntro,
    ),
    characterViewHistoryFound: sanitizeTemplate(
      value?.characterViewHistoryFound,
      defaults.characterViewHistoryFound,
    ),
    characterViewHistoryMissing: sanitizeTemplate(
      value?.characterViewHistoryMissing,
      defaults.characterViewHistoryMissing,
    ),
    historyIncludedNote: sanitizeTemplate(
      value?.historyIncludedNote,
      defaults.historyIncludedNote,
    ),
    historyExcludedNote: sanitizeTemplate(
      value?.historyExcludedNote,
      defaults.historyExcludedNote,
    ),
    storedGroupTitle: sanitizeTemplate(
      value?.storedGroupTitle,
      defaults.storedGroupTitle,
    ),
    storedGroupUpgradedNote: sanitizeTemplate(
      value?.storedGroupUpgradedNote,
      defaults.storedGroupUpgradedNote,
    ),
    storedGroupNextReplyNote: sanitizeTemplate(
      value?.storedGroupNextReplyNote,
      defaults.storedGroupNextReplyNote,
    ),
    directBranchTitle: sanitizeTemplate(
      value?.directBranchTitle,
      defaults.directBranchTitle,
    ),
    directBranchNextReplyNote: sanitizeTemplate(
      value?.directBranchNextReplyNote,
      defaults.directBranchNextReplyNote,
    ),
    formalGroupTitle: sanitizeTemplate(
      value?.formalGroupTitle,
      defaults.formalGroupTitle,
    ),
    formalGroupStateGateNote: sanitizeTemplate(
      value?.formalGroupStateGateNote,
      defaults.formalGroupStateGateNote,
    ),
    formalGroupReplyRuleNote: sanitizeTemplate(
      value?.formalGroupReplyRuleNote,
      defaults.formalGroupReplyRuleNote,
    ),
    previewCharacterIntro: sanitizeTemplate(
      value?.previewCharacterIntro,
      defaults.previewCharacterIntro,
    ),
    previewCharacterWithHistory: sanitizeTemplate(
      value?.previewCharacterWithHistory,
      defaults.previewCharacterWithHistory,
    ),
    previewCharacterWithoutHistory: sanitizeTemplate(
      value?.previewCharacterWithoutHistory,
      defaults.previewCharacterWithoutHistory,
    ),
    previewStoredGroup: sanitizeTemplate(
      value?.previewStoredGroup,
      defaults.previewStoredGroup,
    ),
    previewDirectConversation: sanitizeTemplate(
      value?.previewDirectConversation,
      defaults.previewDirectConversation,
    ),
    previewFormalGroup: sanitizeTemplate(
      value?.previewFormalGroup,
      defaults.previewFormalGroup,
    ),
    previewDefaultUserMessage: sanitizeTemplate(
      value?.previewDefaultUserMessage,
      defaults.previewDefaultUserMessage,
    ),
  };
}

function normalizeNarrativePresentationTemplates(
  value: Partial<ReplyLogicNarrativePresentationTemplates> | undefined,
): ReplyLogicNarrativePresentationTemplates {
  const defaults = DEFAULT_REPLY_LOGIC_NARRATIVE_PRESENTATION_TEMPLATES;
  return {
    relationshipArcSuffix: sanitizeTemplate(
      value?.relationshipArcSuffix,
      defaults.relationshipArcSuffix,
    ),
    milestoneLabels: {
      connected: sanitizeTemplate(
        value?.milestoneLabels?.connected,
        defaults.milestoneLabels.connected,
      ),
      first_breakthrough: sanitizeTemplate(
        value?.milestoneLabels?.first_breakthrough,
        defaults.milestoneLabels.first_breakthrough,
      ),
      shared_context: sanitizeTemplate(
        value?.milestoneLabels?.shared_context,
        defaults.milestoneLabels.shared_context,
      ),
      growing_trust: sanitizeTemplate(
        value?.milestoneLabels?.growing_trust,
        defaults.milestoneLabels.growing_trust,
      ),
      inner_circle: sanitizeTemplate(
        value?.milestoneLabels?.inner_circle,
        defaults.milestoneLabels.inner_circle,
      ),
      story_complete: sanitizeTemplate(
        value?.milestoneLabels?.story_complete,
        defaults.milestoneLabels.story_complete,
      ),
    },
  };
}

function normalizeProviderTemplates(
  value: Partial<ReplyLogicProviderTemplates> | undefined,
): ReplyLogicProviderTemplates {
  const defaults = DEFAULT_REPLY_LOGIC_PROVIDER_TEMPLATES;
  return {
    endpointPriorityNote: sanitizeTemplate(
      value?.endpointPriorityNote,
      defaults.endpointPriorityNote,
    ),
    modelPriorityNote: sanitizeTemplate(
      value?.modelPriorityNote,
      defaults.modelPriorityNote,
    ),
  };
}

function normalizeRuntimeNoteTemplates(
  value: Partial<ReplyLogicRuntimeNoteTemplates> | undefined,
): ReplyLogicRuntimeNoteTemplates {
  const defaults = DEFAULT_REPLY_LOGIC_RUNTIME_NOTE_TEMPLATES;
  return {
    manualOnlineMode: sanitizeTemplate(
      value?.manualOnlineMode,
      defaults.manualOnlineMode,
    ),
    manualActivityMode: sanitizeTemplate(
      value?.manualActivityMode,
      defaults.manualActivityMode,
    ),
    zeroMomentFrequency: sanitizeTemplate(
      value?.zeroMomentFrequency,
      defaults.zeroMomentFrequency,
    ),
    zeroChannelFrequency: sanitizeTemplate(
      value?.zeroChannelFrequency,
      defaults.zeroChannelFrequency,
    ),
    missingTriggerScenes: sanitizeTemplate(
      value?.missingTriggerScenes,
      defaults.missingTriggerScenes,
    ),
    missingMemorySeed: sanitizeTemplate(
      value?.missingMemorySeed,
      defaults.missingMemorySeed,
    ),
    memoryProactiveEnabled: sanitizeTemplate(
      value?.memoryProactiveEnabled,
      defaults.memoryProactiveEnabled,
    ),
    memoryProactiveDisabled: sanitizeTemplate(
      value?.memoryProactiveDisabled,
      defaults.memoryProactiveDisabled,
    ),
  };
}

function normalizeSchedulerDescriptions(
  value: Partial<ReplyLogicSchedulerDescriptions> | undefined,
): ReplyLogicSchedulerDescriptions {
  const defaults = DEFAULT_REPLY_LOGIC_SCHEDULER_DESCRIPTIONS;
  return {
    world_context_snapshot: sanitizeTemplate(
      value?.world_context_snapshot,
      defaults.world_context_snapshot,
    ),
    expire_friend_requests: sanitizeTemplate(
      value?.expire_friend_requests,
      defaults.expire_friend_requests,
    ),
    update_ai_active_status: sanitizeTemplate(
      value?.update_ai_active_status,
      defaults.update_ai_active_status,
    ),
    check_moment_schedule: sanitizeTemplate(
      value?.check_moment_schedule,
      defaults.check_moment_schedule,
    ),
    trigger_scene_friend_requests: sanitizeTemplate(
      value?.trigger_scene_friend_requests,
      defaults.trigger_scene_friend_requests,
    ),
    process_pending_feed_reactions: sanitizeTemplate(
      value?.process_pending_feed_reactions,
      defaults.process_pending_feed_reactions,
    ),
    check_channels_schedule: sanitizeTemplate(
      value?.check_channels_schedule,
      defaults.check_channels_schedule,
    ),
    update_character_status: sanitizeTemplate(
      value?.update_character_status,
      defaults.update_character_status,
    ),
    trigger_memory_proactive_messages: sanitizeTemplate(
      value?.trigger_memory_proactive_messages,
      defaults.trigger_memory_proactive_messages,
    ),
  };
}

function normalizeSchedulerTextTemplates(
  value: Partial<ReplyLogicSchedulerTextTemplates> | undefined,
): ReplyLogicSchedulerTextTemplates {
  const defaults = DEFAULT_REPLY_LOGIC_SCHEDULER_TEXT_TEMPLATES;
  return {
    eventTitleOnlineStatusChanged: sanitizeTemplate(
      value?.eventTitleOnlineStatusChanged,
      defaults.eventTitleOnlineStatusChanged,
    ),
    eventTitleActivityChanged: sanitizeTemplate(
      value?.eventTitleActivityChanged,
      defaults.eventTitleActivityChanged,
    ),
    eventTitleMomentPosted: sanitizeTemplate(
      value?.eventTitleMomentPosted,
      defaults.eventTitleMomentPosted,
    ),
    eventTitleSceneFriendRequest: sanitizeTemplate(
      value?.eventTitleSceneFriendRequest,
      defaults.eventTitleSceneFriendRequest,
    ),
    eventTitleChannelPosted: sanitizeTemplate(
      value?.eventTitleChannelPosted,
      defaults.eventTitleChannelPosted,
    ),
    eventTitleProactiveMessage: sanitizeTemplate(
      value?.eventTitleProactiveMessage,
      defaults.eventTitleProactiveMessage,
    ),
    eventTitleRelationshipUpdated: sanitizeTemplate(
      value?.eventTitleRelationshipUpdated,
      defaults.eventTitleRelationshipUpdated,
    ),
    eventSummaryDefaultOnlineKept: sanitizeTemplate(
      value?.eventSummaryDefaultOnlineKept,
      defaults.eventSummaryDefaultOnlineKept,
    ),
    eventSummaryDefaultActivityReset: sanitizeTemplate(
      value?.eventSummaryDefaultActivityReset,
      defaults.eventSummaryDefaultActivityReset,
    ),
    eventSummaryOnlineWindowEntered: sanitizeTemplate(
      value?.eventSummaryOnlineWindowEntered,
      defaults.eventSummaryOnlineWindowEntered,
    ),
    eventSummaryOnlineWindowExited: sanitizeTemplate(
      value?.eventSummaryOnlineWindowExited,
      defaults.eventSummaryOnlineWindowExited,
    ),
    eventSummaryMomentPosted: sanitizeTemplate(
      value?.eventSummaryMomentPosted,
      defaults.eventSummaryMomentPosted,
    ),
    eventSummarySceneFriendRequest: sanitizeTemplate(
      value?.eventSummarySceneFriendRequest,
      defaults.eventSummarySceneFriendRequest,
    ),
    eventSummaryChannelPosted: sanitizeTemplate(
      value?.eventSummaryChannelPosted,
      defaults.eventSummaryChannelPosted,
    ),
    eventSummaryActivityChanged: sanitizeTemplate(
      value?.eventSummaryActivityChanged,
      defaults.eventSummaryActivityChanged,
    ),
    eventSummaryProactiveMessage: sanitizeTemplate(
      value?.eventSummaryProactiveMessage,
      defaults.eventSummaryProactiveMessage,
    ),
    eventSummaryRelationshipUpdated: sanitizeTemplate(
      value?.eventSummaryRelationshipUpdated,
      defaults.eventSummaryRelationshipUpdated,
    ),
    jobSummaryWorldContextUpdated: sanitizeTemplate(
      value?.jobSummaryWorldContextUpdated,
      defaults.jobSummaryWorldContextUpdated,
    ),
    jobSummaryExpiredFriendRequests: sanitizeTemplate(
      value?.jobSummaryExpiredFriendRequests,
      defaults.jobSummaryExpiredFriendRequests,
    ),
    jobSummaryUpdateAiActiveStatus: sanitizeTemplate(
      value?.jobSummaryUpdateAiActiveStatus,
      defaults.jobSummaryUpdateAiActiveStatus,
    ),
    jobSummaryNoFriendCharactersForMoments: sanitizeTemplate(
      value?.jobSummaryNoFriendCharactersForMoments,
      defaults.jobSummaryNoFriendCharactersForMoments,
    ),
    jobSummaryCheckMomentSchedule: sanitizeTemplate(
      value?.jobSummaryCheckMomentSchedule,
      defaults.jobSummaryCheckMomentSchedule,
    ),
    jobSummarySceneRequestSkipped: sanitizeTemplate(
      value?.jobSummarySceneRequestSkipped,
      defaults.jobSummarySceneRequestSkipped,
    ),
    jobSummarySceneRequestNoMatch: sanitizeTemplate(
      value?.jobSummarySceneRequestNoMatch,
      defaults.jobSummarySceneRequestNoMatch,
    ),
    jobSummarySceneRequestTriggered: sanitizeTemplate(
      value?.jobSummarySceneRequestTriggered,
      defaults.jobSummarySceneRequestTriggered,
    ),
    jobSummaryProcessPendingFeedReactions: sanitizeTemplate(
      value?.jobSummaryProcessPendingFeedReactions,
      defaults.jobSummaryProcessPendingFeedReactions,
    ),
    jobSummaryCheckChannelsSchedule: sanitizeTemplate(
      value?.jobSummaryCheckChannelsSchedule,
      defaults.jobSummaryCheckChannelsSchedule,
    ),
    jobSummaryUpdateCharacterStatus: sanitizeTemplate(
      value?.jobSummaryUpdateCharacterStatus,
      defaults.jobSummaryUpdateCharacterStatus,
    ),
    jobSummaryProactiveReminderSkipped: sanitizeTemplate(
      value?.jobSummaryProactiveReminderSkipped,
      defaults.jobSummaryProactiveReminderSkipped,
    ),
    jobSummaryTriggerMemoryProactiveMessages: sanitizeTemplate(
      value?.jobSummaryTriggerMemoryProactiveMessages,
      defaults.jobSummaryTriggerMemoryProactiveMessages,
    ),
    proactiveReminderCheckPrompt: sanitizeTemplate(
      value?.proactiveReminderCheckPrompt,
      defaults.proactiveReminderCheckPrompt,
    ),
    proactiveReminderNoActionToken: sanitizeTemplate(
      value?.proactiveReminderNoActionToken,
      defaults.proactiveReminderNoActionToken,
    ),
  };
}

function normalizeSchedulerNames(
  value: Partial<ReplyLogicSchedulerNames> | undefined,
): ReplyLogicSchedulerNames {
  const defaults = DEFAULT_REPLY_LOGIC_SCHEDULER_NAMES;
  return {
    world_context_snapshot: sanitizeTemplate(
      value?.world_context_snapshot,
      defaults.world_context_snapshot,
    ),
    expire_friend_requests: sanitizeTemplate(
      value?.expire_friend_requests,
      defaults.expire_friend_requests,
    ),
    update_ai_active_status: sanitizeTemplate(
      value?.update_ai_active_status,
      defaults.update_ai_active_status,
    ),
    check_moment_schedule: sanitizeTemplate(
      value?.check_moment_schedule,
      defaults.check_moment_schedule,
    ),
    trigger_scene_friend_requests: sanitizeTemplate(
      value?.trigger_scene_friend_requests,
      defaults.trigger_scene_friend_requests,
    ),
    process_pending_feed_reactions: sanitizeTemplate(
      value?.process_pending_feed_reactions,
      defaults.process_pending_feed_reactions,
    ),
    check_channels_schedule: sanitizeTemplate(
      value?.check_channels_schedule,
      defaults.check_channels_schedule,
    ),
    update_character_status: sanitizeTemplate(
      value?.update_character_status,
      defaults.update_character_status,
    ),
    trigger_memory_proactive_messages: sanitizeTemplate(
      value?.trigger_memory_proactive_messages,
      defaults.trigger_memory_proactive_messages,
    ),
  };
}

function normalizeSchedulerNextRunHints(
  value: Partial<ReplyLogicSchedulerNextRunHints> | undefined,
): ReplyLogicSchedulerNextRunHints {
  const defaults = DEFAULT_REPLY_LOGIC_SCHEDULER_NEXT_RUN_HINTS;
  return {
    world_context_snapshot: sanitizeTemplate(
      value?.world_context_snapshot,
      defaults.world_context_snapshot,
    ),
    expire_friend_requests: sanitizeTemplate(
      value?.expire_friend_requests,
      defaults.expire_friend_requests,
    ),
    update_ai_active_status: sanitizeTemplate(
      value?.update_ai_active_status,
      defaults.update_ai_active_status,
    ),
    check_moment_schedule: sanitizeTemplate(
      value?.check_moment_schedule,
      defaults.check_moment_schedule,
    ),
    trigger_scene_friend_requests: sanitizeTemplate(
      value?.trigger_scene_friend_requests,
      defaults.trigger_scene_friend_requests,
    ),
    process_pending_feed_reactions: sanitizeTemplate(
      value?.process_pending_feed_reactions,
      defaults.process_pending_feed_reactions,
    ),
    check_channels_schedule: sanitizeTemplate(
      value?.check_channels_schedule,
      defaults.check_channels_schedule,
    ),
    update_character_status: sanitizeTemplate(
      value?.update_character_status,
      defaults.update_character_status,
    ),
    trigger_memory_proactive_messages: sanitizeTemplate(
      value?.trigger_memory_proactive_messages,
      defaults.trigger_memory_proactive_messages,
    ),
  };
}

function normalizePromptTemplates(
  value: Partial<ReplyLogicPromptTemplates> | undefined,
): ReplyLogicPromptTemplates {
  const defaults = DEFAULT_REPLY_LOGIC_PROMPT_TEMPLATES;
  return {
    identityFallback: sanitizeTemplate(
      value?.identityFallback,
      defaults.identityFallback,
    ),
    chainOfThoughtInstruction: sanitizeTemplate(
      value?.chainOfThoughtInstruction,
      defaults.chainOfThoughtInstruction,
    ),
    reflectionInstruction: sanitizeTemplate(
      value?.reflectionInstruction,
      defaults.reflectionInstruction,
    ),
    collaborationRouting: sanitizeTemplate(
      value?.collaborationRouting,
      defaults.collaborationRouting,
    ),
    emptyMemory: sanitizeTemplate(value?.emptyMemory, defaults.emptyMemory),
    behavioralGuideline: sanitizeTemplate(
      value?.behavioralGuideline,
      defaults.behavioralGuideline,
    ),
    groupChatInstruction: sanitizeTemplate(
      value?.groupChatInstruction,
      defaults.groupChatInstruction,
    ),
    baseRules: sanitizeMessages(value?.baseRules, defaults.baseRules),
    momentPrompt: sanitizeTemplate(value?.momentPrompt, defaults.momentPrompt),
    personalityExtractionPrompt: sanitizeTemplate(
      value?.personalityExtractionPrompt,
      defaults.personalityExtractionPrompt,
    ),
    intentClassificationPrompt: sanitizeTemplate(
      value?.intentClassificationPrompt,
      defaults.intentClassificationPrompt,
    ),
    memoryCompressionPrompt: sanitizeTemplate(
      value?.memoryCompressionPrompt,
      defaults.memoryCompressionPrompt,
    ),
    groupCoordinatorPrompt: sanitizeTemplate(
      value?.groupCoordinatorPrompt,
      defaults.groupCoordinatorPrompt,
    ),
  };
}

function normalizeDelayRange(
  value: Partial<{ min: number; max: number }> | undefined,
  fallback: { min: number; max: number },
) {
  const min = clamp(Math.round(value?.min ?? fallback.min), 0, 60_000);
  const max = clamp(Math.round(value?.max ?? fallback.max), min, 60_000);
  return { min, max };
}

function normalizeProbability(
  value: Partial<{ high: number; normal: number; low: number }> | undefined,
  fallback: { high: number; normal: number; low: number },
) {
  return {
    high: clamp(Number(value?.high ?? fallback.high), 0, 1),
    normal: clamp(Number(value?.normal ?? fallback.normal), 0, 1),
    low: clamp(Number(value?.low ?? fallback.low), 0, 1),
  };
}

function normalizeNarrativeMilestones(
  value: ReplyLogicRuntimeRules['narrativeMilestones'] | undefined,
) {
  const normalized = (value ?? [])
    .map((item) => ({
      threshold: clamp(Math.round(item.threshold), 1, 10_000),
      label: item.label.trim(),
      progress: clamp(Math.round(item.progress), 0, 100),
    }))
    .filter((item) => item.label);

  const next = normalized.length
    ? normalized
    : DEFAULT_REPLY_LOGIC_RUNTIME_RULES.narrativeMilestones;

  return [...next].sort((left, right) => left.threshold - right.threshold);
}

export function normalizeReplyLogicRuntimeRules(
  input?: Partial<ReplyLogicRuntimeRules> | null,
): ReplyLogicRuntimeRules {
  const defaults = DEFAULT_REPLY_LOGIC_RUNTIME_RULES;
  const base = clamp(
    Math.round(input?.historyWindow?.base ?? defaults.historyWindow.base),
    1,
    200,
  );
  const range = clamp(
    Math.round(input?.historyWindow?.range ?? defaults.historyWindow.range),
    0,
    200,
  );

  return {
    sleepHintMessages: sanitizeMessages(
      input?.sleepHintMessages,
      defaults.sleepHintMessages,
    ),
    busyHintMessages: {
      working: sanitizeMessages(
        input?.busyHintMessages?.working,
        defaults.busyHintMessages.working,
      ),
      commuting: sanitizeMessages(
        input?.busyHintMessages?.commuting,
        defaults.busyHintMessages.commuting,
      ),
    },
    sleepDelayMs: normalizeDelayRange(
      input?.sleepDelayMs,
      defaults.sleepDelayMs,
    ),
    busyDelayMs: normalizeDelayRange(input?.busyDelayMs, defaults.busyDelayMs),
    groupReplyChance: normalizeProbability(
      input?.groupReplyChance,
      defaults.groupReplyChance,
    ),
    groupReplyDelayMs: normalizeDelayRange(
      input?.groupReplyDelayMs,
      defaults.groupReplyDelayMs,
    ),
    memoryCompressionEveryMessages: clamp(
      Math.round(
        input?.memoryCompressionEveryMessages ??
          defaults.memoryCompressionEveryMessages,
      ),
      1,
      500,
    ),
    momentGenerateChance: clamp(
      Number(input?.momentGenerateChance ?? defaults.momentGenerateChance),
      0,
      1,
    ),
    channelGenerateChance: clamp(
      Number(input?.channelGenerateChance ?? defaults.channelGenerateChance),
      0,
      1,
    ),
    sceneFriendRequestChance: clamp(
      Number(
        input?.sceneFriendRequestChance ?? defaults.sceneFriendRequestChance,
      ),
      0,
      1,
    ),
    sceneFriendRequestScenes: sanitizeMessages(
      input?.sceneFriendRequestScenes,
      defaults.sceneFriendRequestScenes,
    ),
    relationshipInitialType: sanitizeTemplate(
      input?.relationshipInitialType,
      defaults.relationshipInitialType,
    ),
    relationshipInitialStrength: clamp(
      Math.round(
        input?.relationshipInitialStrength ??
          defaults.relationshipInitialStrength,
      ),
      0,
      100,
    ),
    activityBaseWeight: clamp(
      Number(input?.activityBaseWeight ?? defaults.activityBaseWeight),
      0,
      1,
    ),
    proactiveReminderHour: clamp(
      Math.round(
        input?.proactiveReminderHour ?? defaults.proactiveReminderHour,
      ),
      0,
      23,
    ),
    relationshipInitialBackstory: sanitizeTemplate(
      input?.relationshipInitialBackstory,
      defaults.relationshipInitialBackstory,
    ),
    historyWindow: {
      base,
      range,
      min: base,
      max: base + range,
    },
    narrativeMilestones: normalizeNarrativeMilestones(
      input?.narrativeMilestones,
    ),
    promptTemplates: normalizePromptTemplates(input?.promptTemplates),
    semanticLabels: normalizeSemanticLabels(input?.semanticLabels),
    observabilityTemplates: normalizeObservabilityTemplates(
      input?.observabilityTemplates,
    ),
    worldContextRules: normalizeWorldContextRules(input?.worldContextRules),
    inspectorTemplates: normalizeInspectorTemplates(input?.inspectorTemplates),
    narrativePresentationTemplates: normalizeNarrativePresentationTemplates(
      input?.narrativePresentationTemplates,
    ),
    providerTemplates: normalizeProviderTemplates(input?.providerTemplates),
    runtimeNoteTemplates: normalizeRuntimeNoteTemplates(
      input?.runtimeNoteTemplates,
    ),
    schedulerDescriptions: normalizeSchedulerDescriptions(
      input?.schedulerDescriptions,
    ),
    schedulerNames: normalizeSchedulerNames(input?.schedulerNames),
    schedulerNextRunHints: normalizeSchedulerNextRunHints(
      input?.schedulerNextRunHints,
    ),
    schedulerTextTemplates: normalizeSchedulerTextTemplates(
      input?.schedulerTextTemplates,
    ),
  };
}

export function calculateHistoryWindow(
  forgettingCurve?: number,
  rules: Pick<ReplyLogicRuntimeRules, 'historyWindow'> =
    DEFAULT_REPLY_LOGIC_RUNTIME_RULES,
) {
  const normalized = Math.min(
    100,
    Math.max(0, Math.round(forgettingCurve ?? 70)),
  );
  return Math.round(
    rules.historyWindow.base + (normalized / 100) * rules.historyWindow.range,
  );
}
