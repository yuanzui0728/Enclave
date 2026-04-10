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
export const HISTORY_WINDOW_BASE = 8;
export const HISTORY_WINDOW_RANGE = 22;

export const NARRATIVE_PROGRESS_STEPS = [
  { threshold: 4, label: 'first_breakthrough', progress: 15 },
  { threshold: 8, label: 'shared_context', progress: 32 },
  { threshold: 12, label: 'growing_trust', progress: 54 },
  { threshold: 18, label: 'inner_circle', progress: 78 },
  { threshold: 24, label: 'story_complete', progress: 100 },
] as const;

export function calculateHistoryWindow(forgettingCurve?: number) {
  const normalized = Math.min(
    100,
    Math.max(0, Math.round(forgettingCurve ?? 70)),
  );
  return Math.round(HISTORY_WINDOW_BASE + (normalized / 100) * HISTORY_WINDOW_RANGE);
}
