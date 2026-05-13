// i18n-ignore-start: provider adapter — internal constants only.

// 2026-05-13: 上限改成可被 env 覆盖
// cloud-api spawn world child 时按"全 world 总数 / 共享同一 key 的 world 数"
// 注入 per-world 配额（MINIMAX_DAILY_LIMIT_*），实现跨 world 公平分配。
// env 未注入时回落到下方 fallback（= 单 API key 在 token plan 下的官方日限额）。
const FALLBACK_TOKEN_PLAN_DAILY_LIMITS: Record<string, number> = {
  'MiniMax-Hailuo-2.3-Fast': 2,
  'MiniMax-Hailuo-2.3': 2,
  'music-2.6': 100,
  'music-2.5': 4,
  'image-01': 120,
  'lyrics': 100,
};

const ENV_KEY_BY_MODEL: Record<string, string> = {
  'MiniMax-Hailuo-2.3-Fast': 'MINIMAX_DAILY_LIMIT_HAILUO_FAST',
  'MiniMax-Hailuo-2.3': 'MINIMAX_DAILY_LIMIT_HAILUO',
  'music-2.6': 'MINIMAX_DAILY_LIMIT_MUSIC_26',
  'music-2.5': 'MINIMAX_DAILY_LIMIT_MUSIC_25',
  'image-01': 'MINIMAX_DAILY_LIMIT_IMAGE_01',
  'lyrics': 'MINIMAX_DAILY_LIMIT_LYRICS',
};

function readLimit(model: string): number {
  const envKey = ENV_KEY_BY_MODEL[model];
  const raw = envKey ? process.env[envKey] : undefined;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return FALLBACK_TOKEN_PLAN_DAILY_LIMITS[model] ?? 0;
}

// child 进程内 env 不变，启动时一次性物化即可
export const TOKEN_PLAN_DAILY_LIMITS: Record<string, number> = Object.fromEntries(
  Object.keys(FALLBACK_TOKEN_PLAN_DAILY_LIMITS).map((model) => [model, readLimit(model)]),
);

export function getDailyLimit(model: string): number {
  return TOKEN_PLAN_DAILY_LIMITS[model] ?? 0;
}

// i18n-ignore-end
