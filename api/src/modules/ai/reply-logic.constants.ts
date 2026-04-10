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
  activityBaseWeight: number;
  proactiveReminderHour: number;
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
export const ACTIVITY_BASE_WEIGHT = 0.8;
export const PROACTIVE_REMINDER_HOUR = 20;
export const HISTORY_WINDOW_BASE = 8;
export const HISTORY_WINDOW_RANGE = 22;

export const NARRATIVE_PROGRESS_STEPS = [
  { threshold: 4, label: 'first_breakthrough', progress: 15 },
  { threshold: 8, label: 'shared_context', progress: 32 },
  { threshold: 12, label: 'growing_trust', progress: 54 },
  { threshold: 18, label: 'inner_circle', progress: 78 },
  { threshold: 24, label: 'story_complete', progress: 100 },
] as const;

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
    activityBaseWeight: ACTIVITY_BASE_WEIGHT,
    proactiveReminderHour: PROACTIVE_REMINDER_HOUR,
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
  });

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeMessages(value: string[] | undefined, fallback: string[]) {
  const normalized = value?.map((item) => item.trim()).filter(Boolean) ?? [];
  return normalized.length ? normalized : fallback;
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
    historyWindow: {
      base,
      range,
      min: base,
      max: base + range,
    },
    narrativeMilestones: normalizeNarrativeMilestones(
      input?.narrativeMilestones,
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
