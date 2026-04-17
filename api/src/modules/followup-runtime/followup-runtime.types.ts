export type FollowupRunTriggerTypeValue = 'scheduler' | 'manual' | 'event';
export type FollowupRunStatusValue = 'success' | 'skipped' | 'failed';
export type FollowupRuntimeExecutionModeValue = 'dry_run' | 'emit_messages';
export type FollowupOpenLoopStatusValue =
  | 'open'
  | 'watching'
  | 'recommended'
  | 'resolved'
  | 'dismissed'
  | 'expired';
export type FollowupRecommendationStatusValue =
  | 'draft'
  | 'sent'
  | 'opened'
  | 'friend_request_started'
  | 'friend_request_pending'
  | 'friend_added'
  | 'chat_started'
  | 'resolved'
  | 'dismissed'
  | 'expired';
export type FollowupSourceThreadTypeValue = 'direct' | 'group';
export type FollowupRecommendationRelationshipStateValue =
  | 'friend'
  | 'pending'
  | 'not_friend';

export type FollowupRuntimeCandidateWeightsValue = {
  existingFriendBoost: number;
  domainMatchWeight: number;
  relationshipMatchWeight: number;
  sameSourcePenalty: number;
  pendingRequestPenalty: number;
  recentRecommendationPenalty: number;
};

export type FollowupRuntimePromptTemplatesValue = {
  openLoopExtractionPrompt: string;
  handoffMessagePrompt: string;
};

export type FollowupRuntimeTextTemplatesValue = {
  jobSummarySuccess: string;
  jobSummarySkippedDisabled: string;
  jobSummarySkippedNoSignals: string;
  fallbackMessage: string;
  recommendationBadge: string;
};

export type FollowupRuntimeRulesValue = {
  enabled: boolean;
  executionMode: FollowupRuntimeExecutionModeValue;
  scanIntervalMinutes: number;
  lookbackHours: number;
  quietHoursThreshold: number;
  maxSourceMessagesPerThread: number;
  maxOpenLoopsPerRun: number;
  maxRecommendationsPerRun: number;
  dailyRecommendationLimit: number;
  minOpenLoopScore: number;
  minHandoffNeedScore: number;
  sameTopicCooldownHours: number;
  candidateWeights: FollowupRuntimeCandidateWeightsValue;
  promptTemplates: FollowupRuntimePromptTemplatesValue;
  textTemplates: FollowupRuntimeTextTemplatesValue;
};

export type FollowupRunRecordValue = {
  id: string;
  triggerType: FollowupRunTriggerTypeValue;
  status: FollowupRunStatusValue;
  startedAt: string;
  finishedAt?: string | null;
  sourceWindowStartedAt?: string | null;
  sourceWindowEndedAt?: string | null;
  candidateLoopCount: number;
  selectedLoopCount: number;
  emittedRecommendationCount: number;
  summary?: string | null;
  skipReason?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FollowupOpenLoopRecordValue = {
  id: string;
  topicKey: string;
  status: FollowupOpenLoopStatusValue;
  summary: string;
  sourceThreadId: string;
  sourceThreadType: FollowupSourceThreadTypeValue;
  sourceThreadTitle?: string | null;
  sourceMessageId?: string | null;
  sourceCharacterIds: string[];
  domainHints: string[];
  targetRelationshipType?: string | null;
  urgencyScore: number;
  closureScore: number;
  handoffNeedScore: number;
  reasonSummary?: string | null;
  lastMentionedAt: string;
  recommendedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FollowupRecommendationAttachmentMetadataValue = {
  recommendationId: string;
  reasonSummary: string;
  sourceThreadId: string;
  sourceThreadType: FollowupSourceThreadTypeValue;
  sourceThreadTitle?: string | null;
  sourceMessageId?: string | null;
  relationshipState: FollowupRecommendationRelationshipStateValue;
  badgeLabel?: string | null;
};

export type FollowupRecommendationRecordValue = {
  id: string;
  openLoopId: string;
  status: FollowupRecommendationStatusValue;
  recommenderCharacterId: string;
  recommenderCharacterName: string;
  targetCharacterId: string;
  targetCharacterName: string;
  targetCharacterAvatar?: string | null;
  targetCharacterRelationship?: string | null;
  relationshipState: FollowupRecommendationRelationshipStateValue;
  reasonSummary: string;
  handoffSummary?: string | null;
  sourceThreadId: string;
  sourceThreadType: FollowupSourceThreadTypeValue;
  sourceThreadTitle?: string | null;
  messageConversationId?: string | null;
  messageId?: string | null;
  cardMessageId?: string | null;
  friendRequestId?: string | null;
  openedAt?: string | null;
  friendRequestStartedAt?: string | null;
  friendAddedAt?: string | null;
  chatStartedAt?: string | null;
  resolvedAt?: string | null;
  dismissedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FollowupRuntimeStatsValue = {
  activeOpenLoopCount: number;
  recommendedOpenLoopCount: number;
  sentRecommendationCount: number;
  openedRecommendationCount: number;
  friendRequestPendingCount: number;
  friendAddedCount: number;
  recentRunCount: number;
};

export type FollowupRuntimeOverviewValue = {
  rules: FollowupRuntimeRulesValue;
  stats: FollowupRuntimeStatsValue;
  recentRuns: FollowupRunRecordValue[];
  activeOpenLoops: FollowupOpenLoopRecordValue[];
  recentRecommendations: FollowupRecommendationRecordValue[];
};

export type FollowupSignalThreadMessageValue = {
  id: string;
  senderType: 'user' | 'character' | 'system';
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
};

export type FollowupDirectThreadSnapshotValue = {
  threadId: string;
  threadTitle: string;
  sourceCharacterId: string;
  sourceCharacterName: string;
  lastActivityAt: string;
  messages: FollowupSignalThreadMessageValue[];
};

export type FollowupReminderSnapshotValue = {
  sourceId: string;
  threadId: string;
  threadType: FollowupSourceThreadTypeValue;
  threadTitle?: string;
  messageId: string;
  remindAt: string;
  previewText: string;
};

export type FollowupSignalSnapshotValue = {
  directThreads: FollowupDirectThreadSnapshotValue[];
  reminders: FollowupReminderSnapshotValue[];
  domainCatalog: string[];
};

export type FollowupExtractedOpenLoopValue = {
  topicKey: string;
  summary: string;
  sourceThreadId: string;
  sourceThreadType: FollowupSourceThreadTypeValue;
  sourceThreadTitle?: string | null;
  sourceMessageId?: string | null;
  sourceCharacterIds: string[];
  domainHints: string[];
  targetRelationshipType?: string | null;
  urgencyScore: number;
  closureScore: number;
  handoffNeedScore: number;
  reasonSummary?: string | null;
};

export type FollowupRecommendationEventResultValue = {
  id: string;
  status: FollowupRecommendationStatusValue;
  updatedAt: string;
};

export type MarkFollowupRecommendationFriendRequestPendingRequestValue = {
  friendRequestId: string;
};

export const FOLLOWUP_RUNTIME_RULES_CONFIG_KEY = 'followup_runtime_rules';

export const DEFAULT_FOLLOWUP_RUNTIME_RULES: FollowupRuntimeRulesValue = {
  enabled: true,
  executionMode: 'emit_messages',
  scanIntervalMinutes: 60,
  lookbackHours: 72,
  quietHoursThreshold: 6,
  maxSourceMessagesPerThread: 10,
  maxOpenLoopsPerRun: 3,
  maxRecommendationsPerRun: 2,
  dailyRecommendationLimit: 3,
  minOpenLoopScore: 0.68,
  minHandoffNeedScore: 0.58,
  sameTopicCooldownHours: 48,
  candidateWeights: {
    existingFriendBoost: 0.45,
    domainMatchWeight: 0.8,
    relationshipMatchWeight: 0.35,
    sameSourcePenalty: 0.9,
    pendingRequestPenalty: 0.2,
    recentRecommendationPenalty: 0.35,
  },
  promptTemplates: {
    openLoopExtractionPrompt: `你是隐界里的 open loop 跟进分析器。你的任务是从最近安静下来的聊天里，找出“用户明显还没处理完、值得后续跟进”的事项。

输入会给你：
- 最近安静下来的私聊线程摘要
- 用户手动设置的消息提醒
- 当前世界角色常见领域标签

你要识别的是：
- 用户明确提过，但还没有推进结果的决定 / 任务 / 联系动作
- 用户说过“回头再看”“晚点处理”“还没想好”的事情
- 适合换一个更懂的人继续聊的议题

不要输出：
- 纯闲聊
- 已经明显结束的话题
- 只是情绪表达、但没有推进必要的内容
- 需要日历提醒才能处理的琐事

领域标签尽量复用给定的现有领域词，不要随意发明新标签。

只输出 JSON：
{
  "loops": [
    {
      "topicKey": "stable_key_optional",
      "summary": "一句话概括这个未闭环事项",
      "sourceThreadId": "direct_xxx",
      "sourceThreadType": "direct",
      "sourceThreadTitle": "线程标题",
      "sourceMessageId": "msg_xxx",
      "sourceCharacterIds": ["char_xxx"],
      "domainHints": ["职业判断", "沟通策略"],
      "targetRelationshipType": "expert",
      "urgencyScore": 0.74,
      "closureScore": 0.22,
      "handoffNeedScore": 0.78,
      "reasonSummary": "为什么值得跟进，为什么适合交给别人接着聊"
    }
  ]
}

如果没有合适候选，返回 {"loops": []}。`,
    handoffMessagePrompt: `你现在代表“我自己”这个角色，要给用户发一条很短的主动跟进消息。

未闭环事项：
{{loopSummary}}

原线程：
{{sourceThreadTitle}}

推荐角色：
{{targetCharacterName}}（{{targetCharacterRelationship}}）

推荐理由：
{{reasonSummary}}

要求：
- 只写 1-2 句话
- 先轻轻指出这件事还没真正落下，再自然把人推荐过去
- 不要像系统通知，不要像任务管理器
- 不要用项目符号，不要加引号
- 结尾不要加“你看要不要”这种过度客气拖沓的话
- 保持“我自己”那种克制、直接、像内心提醒的语气`,
  },
  textTemplates: {
    jobSummarySuccess:
      '扫描到 {{candidateLoopCount}} 个候选 open loop，命中 {{selectedLoopCount}} 个并发出 {{emittedRecommendationCount}} 条推荐。',
    jobSummarySkippedDisabled: '主动跟进已停用，跳过本次扫描。',
    jobSummarySkippedNoSignals: '没有命中适合回捞的安静线程或手动提醒。',
    fallbackMessage:
      '这件事其实还没真正放下。继续往下聊的话，{{targetCharacterName}}会更合适。',
    recommendationBadge: '继续聊',
  },
};

export function normalizeFollowupRuntimeRules(
  input?: Partial<FollowupRuntimeRulesValue> | null,
): FollowupRuntimeRulesValue {
  const defaults = DEFAULT_FOLLOWUP_RUNTIME_RULES;
  const candidateWeights: Partial<FollowupRuntimeCandidateWeightsValue> =
    input?.candidateWeights ?? {};
  const promptTemplates: Partial<FollowupRuntimePromptTemplatesValue> =
    input?.promptTemplates ?? {};
  const textTemplates: Partial<FollowupRuntimeTextTemplatesValue> =
    input?.textTemplates ?? {};

  return {
    enabled: input?.enabled ?? defaults.enabled,
    executionMode:
      input?.executionMode === 'dry_run' ? 'dry_run' : defaults.executionMode,
    scanIntervalMinutes: clampInt(
      input?.scanIntervalMinutes,
      defaults.scanIntervalMinutes,
      10,
      24 * 60,
    ),
    lookbackHours: clampInt(
      input?.lookbackHours,
      defaults.lookbackHours,
      6,
      14 * 24,
    ),
    quietHoursThreshold: clampInt(
      input?.quietHoursThreshold,
      defaults.quietHoursThreshold,
      1,
      7 * 24,
    ),
    maxSourceMessagesPerThread: clampInt(
      input?.maxSourceMessagesPerThread,
      defaults.maxSourceMessagesPerThread,
      4,
      30,
    ),
    maxOpenLoopsPerRun: clampInt(
      input?.maxOpenLoopsPerRun,
      defaults.maxOpenLoopsPerRun,
      0,
      10,
    ),
    maxRecommendationsPerRun: clampInt(
      input?.maxRecommendationsPerRun,
      defaults.maxRecommendationsPerRun,
      0,
      10,
    ),
    dailyRecommendationLimit: clampInt(
      input?.dailyRecommendationLimit,
      defaults.dailyRecommendationLimit,
      0,
      20,
    ),
    minOpenLoopScore: clampFloat(
      input?.minOpenLoopScore,
      defaults.minOpenLoopScore,
      0,
      1,
    ),
    minHandoffNeedScore: clampFloat(
      input?.minHandoffNeedScore,
      defaults.minHandoffNeedScore,
      0,
      1,
    ),
    sameTopicCooldownHours: clampInt(
      input?.sameTopicCooldownHours,
      defaults.sameTopicCooldownHours,
      1,
      30 * 24,
    ),
    candidateWeights: {
      existingFriendBoost: clampFloat(
        candidateWeights.existingFriendBoost,
        defaults.candidateWeights.existingFriendBoost,
        0,
        2,
      ),
      domainMatchWeight: clampFloat(
        candidateWeights.domainMatchWeight,
        defaults.candidateWeights.domainMatchWeight,
        0,
        2,
      ),
      relationshipMatchWeight: clampFloat(
        candidateWeights.relationshipMatchWeight,
        defaults.candidateWeights.relationshipMatchWeight,
        0,
        2,
      ),
      sameSourcePenalty: clampFloat(
        candidateWeights.sameSourcePenalty,
        defaults.candidateWeights.sameSourcePenalty,
        0,
        2,
      ),
      pendingRequestPenalty: clampFloat(
        candidateWeights.pendingRequestPenalty,
        defaults.candidateWeights.pendingRequestPenalty,
        0,
        2,
      ),
      recentRecommendationPenalty: clampFloat(
        candidateWeights.recentRecommendationPenalty,
        defaults.candidateWeights.recentRecommendationPenalty,
        0,
        2,
      ),
    },
    promptTemplates: {
      openLoopExtractionPrompt: sanitizeTemplate(
        promptTemplates.openLoopExtractionPrompt,
        defaults.promptTemplates.openLoopExtractionPrompt,
      ),
      handoffMessagePrompt: sanitizeTemplate(
        promptTemplates.handoffMessagePrompt,
        defaults.promptTemplates.handoffMessagePrompt,
      ),
    },
    textTemplates: {
      jobSummarySuccess: sanitizeTemplate(
        textTemplates.jobSummarySuccess,
        defaults.textTemplates.jobSummarySuccess,
      ),
      jobSummarySkippedDisabled: sanitizeTemplate(
        textTemplates.jobSummarySkippedDisabled,
        defaults.textTemplates.jobSummarySkippedDisabled,
      ),
      jobSummarySkippedNoSignals: sanitizeTemplate(
        textTemplates.jobSummarySkippedNoSignals,
        defaults.textTemplates.jobSummarySkippedNoSignals,
      ),
      fallbackMessage: sanitizeTemplate(
        textTemplates.fallbackMessage,
        defaults.textTemplates.fallbackMessage,
      ),
      recommendationBadge: sanitizeTemplate(
        textTemplates.recommendationBadge,
        defaults.textTemplates.recommendationBadge,
      ),
    },
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function clampFloat(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
}

function sanitizeTemplate(value: unknown, fallback: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}
