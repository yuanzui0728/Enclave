// i18n-ignore-start: data / seed / preset content — not user-facing UI.

import type {
  ParkingWarCarTier,
  ParkingWarLotSurface,
  ParkingWarRarity,
} from './parking-war.types';

/**
 * 经济单位说明：所有金额一律 ¥ × 100 存为整数（"分"），避免浮点漂移。
 * 前端展示时 / 100 即可。
 */

export const PARKING_WAR_DEFAULT_BALANCE_CENTS = 500_000; // ¥5000
export const PARKING_WAR_DEFAULT_GARAGE_SLOTS = 4;
export const PARKING_WAR_DEFAULT_LOT_SIZE = 4;
export const PARKING_WAR_LOT_SIZE_TIERS: ReadonlyArray<number> = [4, 6, 8, 12];
export const PARKING_WAR_DEFAULT_LOT_SURFACE: ParkingWarLotSurface = 'concrete';
export const PARKING_WAR_DEFAULT_LOT_MULTIPLIER_BP = 10_000; // 100%

export const PARKING_WAR_OFFLINE_CATCHUP_CAP_MS = 8 * 60 * 60 * 1000; // 8h
export const PARKING_WAR_DAILY_BONUS_BASE_CENTS = 5_000; // ¥50
export const PARKING_WAR_DAILY_BONUS_STREAK_BONUS_CENTS = 1_000; // 每连续日 +¥10，封顶 7 天 +¥70
export const PARKING_WAR_DAILY_BONUS_STREAK_CAP = 7;

// 偷停 / 贴条 每日上限
export const PARKING_WAR_DAILY_PARK_LIMIT = 8;
export const PARKING_WAR_DAILY_TICKET_LIMIT = 12;

// 警告 / 罚单 / 拖车 升级阈值（毫秒）
export const PARKING_WAR_WARNING_AT_MS = 5 * 60 * 1000;
export const PARKING_WAR_TICKET_AT_MS = 10 * 60 * 1000;
export const PARKING_WAR_TOWABLE_AT_MS = 20 * 60 * 1000;

// 罚单：场主从访客 pending 抽走的比例（10000 = 100%）
export const PARKING_WAR_TICKET_PENALTY_BP = 3_000; // 30%
// 拖车：除上述罚单外，访客额外被收取的拖车费（分）
export const PARKING_WAR_TOW_FEE_CENTS = 200;
// 拖车后该车冷却（分钟）
export const PARKING_WAR_TOW_COOLDOWN_MS = 30 * 60 * 1000;

// 召回收益归属：访客拿 70%，场主 NPC 拿 30%
export const PARKING_WAR_VISITOR_SHARE_BP = 7_000;

// Feed 广播概率
export const PARKING_WAR_INCIDENT_BROADCAST_CHANCE = 0.08;

// Tick cron（10 分钟一次，对齐 farm）
export const PARKING_WAR_TICK_CRON = '*/10 * * * *';

// 排行榜计分权重：balance + totalEarned * 0.1
export const PARKING_WAR_LEADERBOARD_TOTAL_WEIGHT_BP = 1_000;

export const PARKING_WAR_PLAYER_ACTOR_ID = 'owner';

// 系统角色黑名单：从 farm 沿用思路，避免 "我自己 / 小盯 / 界闻" 出现在邻居车场
export const PARKING_WAR_EXCLUDED_CHARACTER_IDS = new Set<string>([
  'self',
  'self-character',
  'reminder',
  'reminder-character',
  'world-news-desk',
  'system',
  'system-character',
  'char-default-self',
  'char-default-reminder',
  'char-default-world-news-desk',
]);

// 车辆基础每分钟收益（分）
export const PARKING_WAR_CAR_BASE_RATE_PER_MINUTE_CENTS: Record<
  ParkingWarCarTier,
  number
> = {
  starter: 5,
  family: 8,
  business: 14,
  performance: 22,
  luxury: 32,
  super: 48,
};

// 稀有度倍率（× 10000）
export const PARKING_WAR_RARITY_MULTIPLIER_BP: Record<ParkingWarRarity, number> = {
  common: 10_000,
  rare: 16_000,
  epic: 24_000,
  legend: 36_000,
};

// 地砖倍率（× 10000）
export const PARKING_WAR_SURFACE_MULTIPLIER_BP: Record<
  ParkingWarLotSurface,
  number
> = {
  concrete: 10_000, // 100%
  grass: 11_000, //   110%
  asphalt: 12_000, // 120%
  vip: 15_000, //     150%
};

// 升级地砖费用（分）
export const PARKING_WAR_LOT_SURFACE_UPGRADE_COST_CENTS: Record<
  ParkingWarLotSurface,
  number
> = {
  concrete: 0,
  grass: 20_000, // ¥200
  asphalt: 80_000, // ¥800
  vip: 300_000, // ¥3000
};

// VIP 地砖每天免罚单次数
export const PARKING_WAR_VIP_DAILY_SHIELD = 1;

// 扩容费用：4 -> 6 / 6 -> 8 / 8 -> 12（分）
export const PARKING_WAR_LOT_SIZE_UPGRADE_COST_CENTS: Record<number, number> = {
  6: 50_000, // ¥500
  8: 200_000, // ¥2000
  12: 800_000, // ¥8000
};

// 车辆购买价（按 tier × rarity 缩放）：basePrice × rarityMultiplier
export const PARKING_WAR_CAR_BASE_PRICE_CENTS: Record<ParkingWarCarTier, number> = {
  starter: 0,
  family: 20_000, // ¥200
  business: 60_000, // ¥600
  performance: 150_000, // ¥1500
  luxury: 450_000, // ¥4500
  super: 1_200_000, // ¥12000
};

// 车辆每分钟最高耐久损耗（被贴条 / 被拖会扣更多，见 service 里硬编码）
export const PARKING_WAR_CAR_DEFAULT_DURABILITY = 100;
export const PARKING_WAR_CAR_DURABILITY_LOSS_PER_TICKET = 10;
export const PARKING_WAR_CAR_DURABILITY_LOSS_PER_TOW = 20;
export const PARKING_WAR_CAR_REPAIR_COST_PER_POINT_CENTS = 80; // 每点 ¥0.8

// 车库扩容：每个新槽位的成本（递增）
export const PARKING_WAR_GARAGE_SLOT_BASE_COST_CENTS = 100_000; // ¥1000 / 槽
export const PARKING_WAR_GARAGE_MAX_SLOTS = 8;

// 升级车辆：基础消耗 × level²（分）
export const PARKING_WAR_CAR_UPGRADE_BASE_COST_CENTS = 20_000; // ¥200
export const PARKING_WAR_CAR_MAX_LEVEL = 10;
// 每级带来的收益加成 = 1 + 0.1 × (level - 1)
export const PARKING_WAR_CAR_LEVEL_BONUS_PER_LEVEL_BP = 1_000; // 10%

export function computeCarRatePerMinuteCents(opts: {
  tier: ParkingWarCarTier;
  rarity: ParkingWarRarity;
  level: number;
  surface: ParkingWarLotSurface;
  lotMultiplierBp: number;
}): number {
  // 分步乘除避免 4 次连乘超过 Number.MAX_SAFE_INTEGER（2^53）。
  const base = PARKING_WAR_CAR_BASE_RATE_PER_MINUTE_CENTS[opts.tier];
  const rarityBp = PARKING_WAR_RARITY_MULTIPLIER_BP[opts.rarity];
  const surfaceBp = PARKING_WAR_SURFACE_MULTIPLIER_BP[opts.surface];
  const levelBonusBp =
    10_000 +
    Math.max(0, opts.level - 1) * PARKING_WAR_CAR_LEVEL_BONUS_PER_LEVEL_BP;
  let acc = base * 1_000_000; // 乘 10^6 提精度
  acc = (acc * rarityBp) / 10_000;
  acc = (acc * surfaceBp) / 10_000;
  acc = (acc * levelBonusBp) / 10_000;
  acc = (acc * opts.lotMultiplierBp) / 10_000;
  return Math.max(0, Math.round(acc / 1_000_000));
}

export function computeCarUpgradeCostCents(level: number): number {
  // L 1 -> 2 = 200 × 4 = 800，L 9 -> 10 = 200 × 100 = 20000
  const next = Math.max(1, level + 1);
  return PARKING_WAR_CAR_UPGRADE_BASE_COST_CENTS * next * next;
}

export function computeCarBuyPriceCents(
  tier: ParkingWarCarTier,
  rarity: ParkingWarRarity,
): number {
  const base = PARKING_WAR_CAR_BASE_PRICE_CENTS[tier];
  const mul = PARKING_WAR_RARITY_MULTIPLIER_BP[rarity];
  return Math.round((base * mul) / 10_000);
}

// i18n-ignore-end
