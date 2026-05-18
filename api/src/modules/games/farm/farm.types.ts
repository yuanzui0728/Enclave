export type FarmCropId =
  // 一阶（lv 1-2，平民蔬菜）
  | 'cabbage'
  | 'potato'
  | 'carrot'
  | 'radish'
  | 'lettuce'
  | 'spinach'
  | 'onion'
  // 二阶（lv 2-4，主粮 + 普通收益）
  | 'wheat'
  | 'corn'
  | 'peanut'
  | 'soybean'
  | 'tomato'
  | 'strawberry'
  | 'sunflower'
  | 'rice'
  | 'eggplant'
  | 'cucumber'
  // 三阶（lv 4-6，高价 + 罕见）
  | 'pumpkin'
  | 'watermelon'
  | 'sugarcane'
  | 'lavender'
  | 'mint'
  | 'goji'
  | 'dragon_fruit'
  // 多年生果树（lv 7-9，一次种、多季收）
  | 'apple_tree'
  | 'peach_tree'
  | 'grape_vine'
  | 'orange_tree'
  | 'cherry_tree'
  // 顶级药材 / 节日特供
  | 'ginseng'
  | 'snow_lotus'
  | 'plum_blossom'
  | 'osmanthus';

export type FarmPlotStage =
  | 'empty'
  | 'seed'
  | 'sprout'
  | 'growing'
  | 'ripe'
  | 'rotten';

export type FarmCropRarity = 'common' | 'uncommon' | 'rare';

export type FarmActorType = 'owner' | 'character';

export type FarmEventKind =
  | 'plant'
  | 'harvest'
  | 'uproot'
  | 'water'
  | 'weed'
  | 'debug'
  | 'fertilize'
  | 'pesticide'
  | 'buy'
  | 'sell'
  | 'level_up'
  | 'steal'
  | 'steal_blocked'
  | 'dog_buy'
  | 'dog_feed'
  | 'dog_upgrade'
  | 'decorate'
  | 'visit'
  | 'intimacy_change'
  | 'incident_broadcast';

export type FarmConsumableId = 'fertilizer' | 'pesticide' | 'dog_food';

export interface FarmConsumableDefinition {
  id: FarmConsumableId;
  nameZh: string;
  emoji: string;
  price: number;
  unlockLevel: number;
  descriptionZh: string;
}

export interface FarmPlot {
  index: number;
  cropId: FarmCropId | null;
  plantedAt: number | null;
  maturedAt: number | null;
  stage: FarmPlotStage;
  watered: boolean;
  weeds: number;
  bugs: number;
  stolenBy: string[];
  plantedBy?: string;
  yieldOverride?: number | null;
  // QQ 农场化肥：一次性把剩余成长时间砍 50%，每株作物只生效一次。
  // 持久化用 maturedAt 直接前移；这里仅记录"已用过"以禁止叠加。
  fertilized?: boolean;
  // 农药 cooling-off 截止时间。在此 ms 之前，bugs 不再随机生成。
  pesticideUntilMs?: number | null;
  // 多年生果树已收获过的次数；不是空地就 ≥0，第 0 茬未收就 0。
  harvestCount?: number;
}

export interface FarmDogState {
  level: number; // 0 表示没养狗；1-5 对应不同等级
  energy: number; // 0-100，每日衰减；低于 30 防偷率减半
  lastFedAt: number | null;
}

export const FARM_DOG_LEVEL_CAP = 5;
export const FARM_DOG_BUY_COST = 800;
export const FARM_DOG_UPGRADE_COSTS: ReadonlyArray<number> = [
  0,    // level 0 占位
  800,  // 升到 lvl 1（即买狗成本）
  1600, // 升到 lvl 2
  3200,
  6400,
  12800, // 升到 lvl 5
];
export const FARM_DOG_FOOD_COST = 50;
export const FARM_DOG_UNLOCK_LEVEL = 5; // 玩家等级 ≥5 才能买狗
export const FARM_DOG_ENERGY_DECAY_PER_HOUR = 4; // 每小时掉 4 点
export const FARM_DOG_FEED_RESTORE = 60; // 每次喂食回复 60 能量
export const FARM_FERTILIZER_SHRINK_RATIO = 0.5; // 化肥砍掉剩余 50% 时间
export const FARM_PESTICIDE_PROTECT_HOURS = 12; // 农药免疫期 12h
export const FARM_DOG_BLOCK_BASE_RATE = 0.18; // 每级狗增加 18% 拦截率（lvl5 上限 90%）

export interface FarmCharacterMood {
  energy: number;
  diligence: number;
  pickpocketBias: number;
}

export interface FarmStolenLogEntry {
  thiefCharacterId: string;
  thiefName: string;
  cropId: FarmCropId;
  amount: number;
  atMs: number;
}

export interface FarmCropDefinition {
  id: FarmCropId;
  nameZh: string;
  emoji: string;
  seedCost: number;
  sellPrice: number;
  growHours: number;
  yieldRange: [number, number];
  preferredDomains: string[];
  unlockLevel: number;
  rarity: FarmCropRarity;
  experience: number;
  // 多年生作物：一次播种、多季收获。perennialCycleHours 是收获后的下一茬周期。
  isPerennial?: boolean;
  perennialCycleHours?: number;
  // 节日限定：仅在 festivalWindow 启用日期内可购买与播种（默认 disabled）。
  festival?: 'spring' | 'mid_autumn' | 'halloween';
}

export type FarmDecorationId =
  | 'scarecrow'
  | 'windmill'
  | 'wood_fence'
  | 'pond'
  | 'flower_bed'
  | 'lantern'
  | 'statue'
  | 'hammock'
  | 'beehive'
  | 'mailbox';

export interface FarmDecorationDefinition {
  id: FarmDecorationId;
  nameZh: string;
  emoji: string;
  price: number;
  unlockLevel: number;
  descriptionZh: string;
  // 偶发功能：scarecrow 减少害虫生成几率；其他都是纯装饰。
  effect?: 'reduce_bugs';
}

export interface FarmDecorationPlacement {
  id: string; // 唯一实例 id，UUID
  type: FarmDecorationId;
  x: number; // 0-100 百分比坐标（农场背景层）
  y: number;
}

export interface FarmPlayerStateView {
  ownerId: string;
  coins: number;
  experience: number;
  level: number;
  plotCount: number;
  plots: FarmPlot[];
  warehouse: Record<string, number>;
  seedBag: Record<string, number>;
  consumables: Record<FarmConsumableId, number>;
  dog: FarmDogState;
  // 已购但未必摆出的装饰库存：按 type 计数；
  // placedDecorations 是当前摆在农场背景里的具体实例。
  decorationInventory: Record<FarmDecorationId, number>;
  placedDecorations: FarmDecorationPlacement[];
  weeklyStolenLog: FarmStolenLogEntry[];
  serverNowMs: number;
  updatedAt: string;
}

export interface FarmNeighborSummary {
  characterId: string;
  characterName: string;
  characterAvatar?: string | null;
  intimacyLevel: number;
  isOnline: boolean;
  ripePlotCount: number;
  totalPlotCount: number;
  level: number;
  coins: number;
  lastActedAt: string | null;
  expertDomains: string[];
  relationship?: string | null;
}

export interface FarmEventView {
  id: string;
  kind: FarmEventKind;
  actorType: FarmActorType;
  actorId: string;
  actorName: string;
  targetType?: FarmActorType | null;
  targetId?: string | null;
  cropId?: FarmCropId | null;
  intimacyDelta?: number | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface FarmNeighborDetail extends FarmNeighborSummary {
  plots: FarmPlot[];
  recentEvents: FarmEventView[];
  serverNowMs: number;
}

export interface FarmHarvestResult {
  player: FarmPlayerStateView;
  harvested: {
    cropId: FarmCropId;
    amount: number;
    coinsGained: number;
    experienceGained: number;
    leveledUp: boolean;
  };
}

export interface FarmStealResult {
  player: FarmPlayerStateView;
  target: FarmNeighborSummary;
  stolen: {
    cropId: FarmCropId;
    amount: number;
    coinsGained: number;
    intimacyDelta: number;
  };
}

export interface FarmDogPurchaseResult {
  player: FarmPlayerStateView;
  dog: FarmDogState;
  coinsSpent: number;
}

export interface FarmConsumablePurchaseResult {
  player: FarmPlayerStateView;
  consumableId: FarmConsumableId;
  quantity: number;
  coinsSpent: number;
}

export interface FarmDecorationPurchaseResult {
  player: FarmPlayerStateView;
  decorationId: FarmDecorationId;
  quantity: number;
  coinsSpent: number;
}

export interface FarmDecorationPlaceResult {
  player: FarmPlayerStateView;
  placement: FarmDecorationPlacement;
}

export type FarmLeaderboardType = 'level' | 'harvest' | 'coins';

export interface FarmLeaderboardEntry {
  rank: number;
  isOwner: boolean;
  characterId: string | null; // null = 玩家自己
  name: string;
  avatar: string | null;
  level: number;
  totalHarvested: number;
  coins: number;
  intimacyLevel?: number | null;
}

export interface FarmLeaderboardView {
  type: FarmLeaderboardType;
  generatedAt: string;
  entries: FarmLeaderboardEntry[];
  ownerRank: number; // 玩家自己排第几
}

export interface FarmGiftCoinsResult {
  player: FarmPlayerStateView;
  target: FarmNeighborSummary;
  coinsGifted: number;
  intimacyDelta: number;
}

export interface FarmGiftItemResult {
  player: FarmPlayerStateView;
  target: FarmNeighborSummary;
  itemKind: 'crop' | 'seed' | 'consumable';
  itemId: string;
  quantity: number;
  intimacyDelta: number;
}

export const FARM_GIFT_DAILY_LIMIT_COINS = 2000;
export const FARM_GIFT_INTIMACY_PER_100_COINS = 1;
export const FARM_GIFT_INTIMACY_PER_ITEM = 2;

export interface FarmCheckinDayReward {
  day: number; // 1-7
  coins: number;
  consumableId?: 'fertilizer' | 'pesticide' | 'dog_food';
  consumableCount?: number;
  seedCropId?: string;
  seedCount?: number;
}

// 七日连签奖励曲线：QQ农场签到的经典节奏——前几天小礼，第 7 天大礼包。
export const FARM_CHECKIN_REWARDS: ReadonlyArray<FarmCheckinDayReward> = [
  { day: 1, coins: 50 },
  { day: 2, coins: 80 },
  { day: 3, coins: 120, consumableId: 'fertilizer', consumableCount: 1 },
  { day: 4, coins: 160 },
  { day: 5, coins: 220, consumableId: 'pesticide', consumableCount: 1 },
  { day: 6, coins: 300 },
  { day: 7, coins: 500, consumableId: 'fertilizer', consumableCount: 2 },
];

export interface FarmCheckinView {
  ownerId: string;
  lastCheckinDate: string | null;
  streak: number;
  totalCheckins: number;
  canCheckinToday: boolean;
  todayReward: FarmCheckinDayReward; // 今天签到能领什么
  rewards: ReadonlyArray<FarmCheckinDayReward>;
}

export interface FarmCheckinResult {
  player: FarmPlayerStateView;
  checkin: FarmCheckinView;
  reward: FarmCheckinDayReward;
}

export type FarmQuestId =
  | 'daily_plant_3'
  | 'daily_water_5'
  | 'daily_harvest_3'
  | 'daily_steal_1'
  | 'daily_gift_1'
  | 'achievement_harvest_100'
  | 'achievement_harvest_1000'
  | 'achievement_level_5'
  | 'achievement_level_10'
  | 'achievement_buy_dog';

export type FarmQuestKind = 'daily' | 'achievement';

export interface FarmQuestDefinition {
  id: FarmQuestId;
  kind: FarmQuestKind;
  nameZh: string;
  descriptionZh: string;
  goal: number;
  rewardCoins: number;
  rewardExperience: number;
}

export interface FarmQuestProgress {
  id: FarmQuestId;
  progress: number;
  goal: number;
  kind: FarmQuestKind;
  nameZh: string;
  descriptionZh: string;
  rewardCoins: number;
  rewardExperience: number;
  claimed: boolean;
  // daily 任务的"今天"日期；achievement 则是 null。
  dailyResetDate?: string | null;
}

export interface FarmQuestsView {
  ownerId: string;
  generatedAt: string;
  quests: FarmQuestProgress[];
}

export interface FarmQuestClaimResult {
  player: FarmPlayerStateView;
  quest: FarmQuestProgress;
}

export interface FarmTickSummary {
  scannedCharacterCount: number;
  actedCount: number;
  plantCount: number;
  harvestCount: number;
  stealCount: number;
  incidentBroadcastCount: number;
  durationMs: number;
}

export const FARM_DEFAULT_PLOT_COUNT = 6;
export const FARM_DEFAULT_PLAYER_COINS = 200;
export const FARM_DEFAULT_NPC_COINS = 100;
export const FARM_DEFAULT_NPC_PLOT_COUNT = 4;
export const FARM_FARMING_DOMAIN_NPC_PLOT_COUNT = 6;
export const FARM_RIPE_TO_ROTTEN_HOURS = 24;
export const FARM_PLAYER_DAILY_STEAL_LIMIT = 10;
export const FARM_NPC_TICK_CRON = '*/10 * * * *';
export const FARM_INCIDENT_BROADCAST_CHANCE = 0.08;

export const FARM_LEVEL_PLOT_UNLOCKS: ReadonlyArray<{ level: number; plotCount: number }> = [
  { level: 1, plotCount: 6 },
  { level: 4, plotCount: 9 },
  { level: 8, plotCount: 12 },
  { level: 12, plotCount: 15 },
  { level: 16, plotCount: 18 },
  { level: 20, plotCount: 22 },
  { level: 25, plotCount: 26 },
  { level: 30, plotCount: 30 },
];

export const FARM_LEVEL_EXPERIENCE_THRESHOLDS: ReadonlyArray<number> = [
  0, 100, 260, 480, 760, 1120, 1560, 2080, 2680, 3360,
  4120, 4960, 5880, 6880, 7960, 9120, 10360, 11680, 13080, 14560,
  16120, 17760, 19480, 21280, 23160, 25120, 27160, 29280, 31480, 33760,
];

export const FARM_DEFAULT_PLAYER_SEED_BAG: Record<FarmCropId, number> = {
  cabbage: 5,
  potato: 3,
  carrot: 0,
  radish: 0,
  lettuce: 0,
  spinach: 0,
  onion: 0,
  wheat: 0,
  corn: 0,
  peanut: 0,
  soybean: 0,
  tomato: 0,
  strawberry: 0,
  sunflower: 0,
  rice: 0,
  eggplant: 0,
  cucumber: 0,
  pumpkin: 0,
  watermelon: 0,
  sugarcane: 0,
  lavender: 0,
  mint: 0,
  goji: 0,
  dragon_fruit: 0,
  apple_tree: 0,
  peach_tree: 0,
  grape_vine: 0,
  orange_tree: 0,
  cherry_tree: 0,
  ginseng: 0,
  snow_lotus: 0,
  plum_blossom: 0,
  osmanthus: 0,
};

export const FARM_EXCLUDED_CHARACTER_IDS = new Set<string>([
  // Legacy bare ids (kept defensively in case older fixtures still use them).
  'self',
  'self-character',
  'reminder',
  'reminder-character',
  'world-news-desk',
  'system',
  'system-character',
  // Actual default-character ids in this codebase. 漏掉这些会让 "我自己 / 小盯 /
  // 界闻" 这些系统 NPC 出现在邻居列表，并且能被串门 / 偷菜。
  'char-default-self',
  'char-default-reminder',
  'char-default-world-news-desk',
]);

export const FARM_PLAYER_ACTOR_ID = 'owner';
