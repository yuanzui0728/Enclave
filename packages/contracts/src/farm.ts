export type FarmCropId =
  | "cabbage"
  | "potato"
  | "carrot"
  | "radish"
  | "lettuce"
  | "spinach"
  | "onion"
  | "wheat"
  | "corn"
  | "peanut"
  | "soybean"
  | "tomato"
  | "strawberry"
  | "sunflower"
  | "rice"
  | "eggplant"
  | "cucumber"
  | "pumpkin"
  | "watermelon"
  | "sugarcane"
  | "lavender"
  | "mint"
  | "goji"
  | "dragon_fruit"
  | "apple_tree"
  | "peach_tree"
  | "grape_vine"
  | "orange_tree"
  | "cherry_tree"
  | "ginseng"
  | "snow_lotus"
  | "plum_blossom"
  | "osmanthus";

export type FarmPlotStage =
  | "empty"
  | "seed"
  | "sprout"
  | "growing"
  | "ripe"
  | "rotten";

export type FarmCropRarity = "common" | "uncommon" | "rare";

export type FarmActorType = "owner" | "character";

export type FarmEventKind =
  | "plant"
  | "harvest"
  | "uproot"
  | "water"
  | "weed"
  | "debug"
  | "fertilize"
  | "pesticide"
  | "buy"
  | "sell"
  | "level_up"
  | "steal"
  | "steal_blocked"
  | "dog_buy"
  | "dog_feed"
  | "dog_upgrade"
  | "decorate"
  | "visit"
  | "intimacy_change"
  | "incident_broadcast";

export type FarmConsumableId = "fertilizer" | "pesticide" | "dog_food";

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
  fertilized?: boolean;
  pesticideUntilMs?: number | null;
  harvestCount?: number;
}

export type FarmDecorationId =
  | "scarecrow"
  | "windmill"
  | "wood_fence"
  | "pond"
  | "flower_bed"
  | "lantern"
  | "statue"
  | "hammock"
  | "beehive"
  | "mailbox";

export interface FarmDecorationDefinition {
  id: FarmDecorationId;
  nameZh: string;
  emoji: string;
  price: number;
  unlockLevel: number;
  descriptionZh: string;
  effect?: "reduce_bugs";
}

export interface FarmDecorationPlacement {
  id: string;
  type: FarmDecorationId;
  x: number;
  y: number;
}

export interface FarmDogState {
  level: number;
  energy: number;
  lastFedAt: number | null;
}

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
  isPerennial?: boolean;
  perennialCycleHours?: number;
  festival?: "spring" | "mid_autumn" | "halloween";
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

export type FarmLeaderboardType = "level" | "harvest" | "coins";

export interface FarmLeaderboardEntry {
  rank: number;
  isOwner: boolean;
  characterId: string | null;
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
  ownerRank: number;
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
  itemKind: "crop" | "seed" | "consumable";
  itemId: string;
  quantity: number;
  intimacyDelta: number;
}

export const FARM_GIFT_DAILY_LIMIT_COINS = 2000;

export interface FarmCheckinDayReward {
  day: number;
  coins: number;
  consumableId?: "fertilizer" | "pesticide" | "dog_food";
  consumableCount?: number;
  seedCropId?: string;
  seedCount?: number;
}

export const FARM_CHECKIN_REWARDS: ReadonlyArray<FarmCheckinDayReward> = [
  { day: 1, coins: 50 },
  { day: 2, coins: 80 },
  { day: 3, coins: 120, consumableId: "fertilizer", consumableCount: 1 },
  { day: 4, coins: 160 },
  { day: 5, coins: 220, consumableId: "pesticide", consumableCount: 1 },
  { day: 6, coins: 300 },
  { day: 7, coins: 500, consumableId: "fertilizer", consumableCount: 2 },
];

export interface FarmCheckinView {
  ownerId: string;
  lastCheckinDate: string | null;
  streak: number;
  totalCheckins: number;
  canCheckinToday: boolean;
  todayReward: FarmCheckinDayReward;
  rewards: ReadonlyArray<FarmCheckinDayReward>;
}

export interface FarmCheckinResult {
  player: FarmPlayerStateView;
  checkin: FarmCheckinView;
  reward: FarmCheckinDayReward;
}

export type FarmQuestId =
  | "daily_plant_3"
  | "daily_water_5"
  | "daily_harvest_3"
  | "daily_steal_1"
  | "daily_gift_1"
  | "achievement_harvest_100"
  | "achievement_harvest_1000"
  | "achievement_level_5"
  | "achievement_level_10"
  | "achievement_buy_dog";

export type FarmQuestKind = "daily" | "achievement";

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

export interface FarmDogPurchaseResult {
  player: FarmPlayerStateView;
  dog: FarmDogState;
  coinsSpent: number;
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

export interface FarmNeighborDetail extends FarmNeighborSummary {
  plots: FarmPlot[];
  recentEvents: FarmEventView[];
  serverNowMs: number;
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

export interface FarmTickSummary {
  scannedCharacterCount: number;
  actedCount: number;
  plantCount: number;
  harvestCount: number;
  stealCount: number;
  incidentBroadcastCount: number;
  durationMs: number;
}

export interface FarmPlantInput {
  plotIndex: number;
  cropId: FarmCropId;
}

export interface FarmPlotActionInput {
  plotIndex: number;
  characterId?: string;
}

export interface FarmStealInput {
  characterId: string;
  plotIndex: number;
}

export interface FarmSeedTransactionInput {
  cropId: FarmCropId;
  quantity: number;
}

export const FARM_CROP_CATALOG: Record<FarmCropId, FarmCropDefinition> = {
  cabbage: {
    id: "cabbage",
    nameZh: "白菜",
    emoji: "🥬",
    seedCost: 20,
    sellPrice: 50,
    growHours: 2,
    yieldRange: [2, 4],
    preferredDomains: ["cooking", "wellness", "life"],
    unlockLevel: 1,
    rarity: "common",
    experience: 5,
  },
  potato: {
    id: "potato",
    nameZh: "土豆",
    emoji: "🥔",
    seedCost: 30,
    sellPrice: 80,
    growHours: 3,
    yieldRange: [2, 4],
    preferredDomains: ["cooking", "life"],
    unlockLevel: 1,
    rarity: "common",
    experience: 7,
  },
  carrot: {
    id: "carrot",
    nameZh: "胡萝卜",
    emoji: "🥕",
    seedCost: 35,
    sellPrice: 100,
    growHours: 4,
    yieldRange: [2, 5],
    preferredDomains: ["cooking", "wellness"],
    unlockLevel: 1,
    rarity: "common",
    experience: 8,
  },
  wheat: {
    id: "wheat",
    nameZh: "小麦",
    emoji: "🌾",
    seedCost: 45,
    sellPrice: 130,
    growHours: 5,
    yieldRange: [3, 5],
    preferredDomains: ["cooking", "farming"],
    unlockLevel: 2,
    rarity: "common",
    experience: 10,
  },
  corn: {
    id: "corn",
    nameZh: "玉米",
    emoji: "🌽",
    seedCost: 60,
    sellPrice: 180,
    growHours: 6,
    yieldRange: [3, 5],
    preferredDomains: ["cooking", "farming"],
    unlockLevel: 2,
    rarity: "common",
    experience: 12,
  },
  strawberry: {
    id: "strawberry",
    nameZh: "草莓",
    emoji: "🍓",
    seedCost: 90,
    sellPrice: 260,
    growHours: 8,
    yieldRange: [3, 6],
    preferredDomains: ["fashion", "life", "romance"],
    unlockLevel: 2,
    rarity: "uncommon",
    experience: 16,
  },
  tomato: {
    id: "tomato",
    nameZh: "西红柿",
    emoji: "🍅",
    seedCost: 80,
    sellPrice: 240,
    growHours: 12,
    yieldRange: [3, 6],
    preferredDomains: ["cooking"],
    unlockLevel: 3,
    rarity: "uncommon",
    experience: 18,
  },
  sunflower: {
    id: "sunflower",
    nameZh: "向日葵",
    emoji: "🌻",
    seedCost: 100,
    sellPrice: 280,
    growHours: 9,
    yieldRange: [2, 4],
    preferredDomains: ["fashion", "art"],
    unlockLevel: 3,
    rarity: "uncommon",
    experience: 18,
  },
  rice: {
    id: "rice",
    nameZh: "稻米",
    emoji: "🌾",
    seedCost: 110,
    sellPrice: 320,
    growHours: 10,
    yieldRange: [3, 5],
    preferredDomains: ["cooking", "farming"],
    unlockLevel: 3,
    rarity: "uncommon",
    experience: 20,
  },
  pumpkin: {
    id: "pumpkin",
    nameZh: "南瓜",
    emoji: "🎃",
    seedCost: 160,
    sellPrice: 480,
    growHours: 14,
    yieldRange: [2, 4],
    preferredDomains: ["cooking", "art"],
    unlockLevel: 4,
    rarity: "uncommon",
    experience: 28,
  },
  lavender: {
    id: "lavender",
    nameZh: "薰衣草",
    emoji: "💜",
    seedCost: 200,
    sellPrice: 620,
    growHours: 18,
    yieldRange: [2, 4],
    preferredDomains: ["psychology", "romance", "fashion"],
    unlockLevel: 4,
    rarity: "rare",
    experience: 36,
  },
  goji: {
    id: "goji",
    nameZh: "枸杞",
    emoji: "🔴",
    seedCost: 280,
    sellPrice: 920,
    growHours: 30,
    yieldRange: [2, 4],
    preferredDomains: ["medicine", "wellness"],
    unlockLevel: 4,
    rarity: "rare",
    experience: 50,
  },
  ginseng: {
    id: "ginseng",
    nameZh: "人参",
    emoji: "🪴",
    seedCost: 600,
    sellPrice: 2200,
    growHours: 48,
    yieldRange: [1, 2],
    preferredDomains: ["medicine"],
    unlockLevel: 5,
    rarity: "rare",
    experience: 110,
  },
  snow_lotus: {
    id: "snow_lotus",
    nameZh: "雪莲",
    emoji: "❄️",
    seedCost: 1100,
    sellPrice: 4200,
    growHours: 72,
    yieldRange: [1, 1],
    preferredDomains: ["medicine"],
    unlockLevel: 6,
    rarity: "rare",
    experience: 220,
  },
  radish: { id: "radish", nameZh: "萝卜", emoji: "🥕", seedCost: 25, sellPrice: 65, growHours: 2, yieldRange: [2, 5], preferredDomains: ["cooking", "life"], unlockLevel: 1, rarity: "common", experience: 6 },
  lettuce: { id: "lettuce", nameZh: "生菜", emoji: "🥗", seedCost: 22, sellPrice: 55, growHours: 2, yieldRange: [2, 4], preferredDomains: ["cooking", "wellness"], unlockLevel: 1, rarity: "common", experience: 5 },
  spinach: { id: "spinach", nameZh: "菠菜", emoji: "🥬", seedCost: 30, sellPrice: 75, growHours: 3, yieldRange: [2, 4], preferredDomains: ["cooking", "wellness"], unlockLevel: 2, rarity: "common", experience: 8 },
  onion: { id: "onion", nameZh: "洋葱", emoji: "🧅", seedCost: 35, sellPrice: 95, growHours: 4, yieldRange: [2, 4], preferredDomains: ["cooking"], unlockLevel: 2, rarity: "common", experience: 9 },
  peanut: { id: "peanut", nameZh: "花生", emoji: "🥜", seedCost: 50, sellPrice: 150, growHours: 6, yieldRange: [3, 5], preferredDomains: ["cooking", "farming"], unlockLevel: 2, rarity: "common", experience: 11 },
  soybean: { id: "soybean", nameZh: "大豆", emoji: "🫘", seedCost: 55, sellPrice: 165, growHours: 7, yieldRange: [3, 5], preferredDomains: ["cooking", "farming"], unlockLevel: 3, rarity: "common", experience: 13 },
  eggplant: { id: "eggplant", nameZh: "茄子", emoji: "🍆", seedCost: 85, sellPrice: 250, growHours: 9, yieldRange: [3, 5], preferredDomains: ["cooking"], unlockLevel: 3, rarity: "uncommon", experience: 18 },
  cucumber: { id: "cucumber", nameZh: "黄瓜", emoji: "🥒", seedCost: 70, sellPrice: 210, growHours: 7, yieldRange: [3, 5], preferredDomains: ["cooking", "wellness"], unlockLevel: 3, rarity: "uncommon", experience: 15 },
  watermelon: { id: "watermelon", nameZh: "西瓜", emoji: "🍉", seedCost: 200, sellPrice: 620, growHours: 16, yieldRange: [2, 3], preferredDomains: ["cooking", "life"], unlockLevel: 4, rarity: "uncommon", experience: 32 },
  sugarcane: { id: "sugarcane", nameZh: "甘蔗", emoji: "🎋", seedCost: 240, sellPrice: 760, growHours: 20, yieldRange: [2, 4], preferredDomains: ["cooking"], unlockLevel: 4, rarity: "uncommon", experience: 40 },
  mint: { id: "mint", nameZh: "薄荷", emoji: "🌿", seedCost: 180, sellPrice: 560, growHours: 15, yieldRange: [3, 5], preferredDomains: ["psychology", "wellness", "fashion"], unlockLevel: 4, rarity: "uncommon", experience: 30 },
  dragon_fruit: { id: "dragon_fruit", nameZh: "火龙果", emoji: "🐉", seedCost: 360, sellPrice: 1180, growHours: 26, yieldRange: [2, 4], preferredDomains: ["cooking", "fashion"], unlockLevel: 6, rarity: "rare", experience: 65 },
  apple_tree: { id: "apple_tree", nameZh: "苹果树", emoji: "🍎", seedCost: 1500, sellPrice: 380, growHours: 36, yieldRange: [4, 7], preferredDomains: ["cooking", "life"], unlockLevel: 7, rarity: "rare", experience: 80, isPerennial: true, perennialCycleHours: 18 },
  peach_tree: { id: "peach_tree", nameZh: "桃树", emoji: "🍑", seedCost: 1600, sellPrice: 420, growHours: 40, yieldRange: [4, 7], preferredDomains: ["fashion", "romance", "life"], unlockLevel: 7, rarity: "rare", experience: 88, isPerennial: true, perennialCycleHours: 20 },
  grape_vine: { id: "grape_vine", nameZh: "葡萄藤", emoji: "🍇", seedCost: 2000, sellPrice: 520, growHours: 44, yieldRange: [4, 6], preferredDomains: ["cooking", "fashion"], unlockLevel: 8, rarity: "rare", experience: 100, isPerennial: true, perennialCycleHours: 22 },
  orange_tree: { id: "orange_tree", nameZh: "橙子树", emoji: "🍊", seedCost: 1800, sellPrice: 460, growHours: 38, yieldRange: [4, 7], preferredDomains: ["cooking", "wellness"], unlockLevel: 8, rarity: "rare", experience: 96, isPerennial: true, perennialCycleHours: 20 },
  cherry_tree: { id: "cherry_tree", nameZh: "樱桃树", emoji: "🍒", seedCost: 2400, sellPrice: 620, growHours: 48, yieldRange: [3, 6], preferredDomains: ["fashion", "romance", "art"], unlockLevel: 9, rarity: "rare", experience: 130, isPerennial: true, perennialCycleHours: 24 },
  plum_blossom: { id: "plum_blossom", nameZh: "梅花", emoji: "🌸", seedCost: 500, sellPrice: 1800, growHours: 20, yieldRange: [2, 3], preferredDomains: ["art", "romance"], unlockLevel: 5, rarity: "rare", experience: 70, festival: "spring" },
  osmanthus: { id: "osmanthus", nameZh: "桂花", emoji: "💛", seedCost: 550, sellPrice: 1900, growHours: 22, yieldRange: [2, 3], preferredDomains: ["cooking", "art"], unlockLevel: 5, rarity: "rare", experience: 72, festival: "mid_autumn" },
};

export const FARM_DEFAULT_PLOT_COUNT = 6;
export const FARM_DEFAULT_PLAYER_COINS = 200;
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

export const FARM_DEFAULT_NPC_COINS = 100;
export const FARM_DEFAULT_NPC_PLOT_COUNT = 4;
export const FARM_FARMING_DOMAIN_NPC_PLOT_COUNT = 6;

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

export const FARM_RIPE_TO_ROTTEN_HOURS = 24;

export const FARM_PLAYER_DAILY_STEAL_LIMIT = 10;

export const FARM_NPC_TICK_CRON = "*/10 * * * *";

export const FARM_INCIDENT_BROADCAST_CHANCE = 0.08;

export function computeMaturedAtMs(
  cropId: FarmCropId,
  plantedAtMs: number,
): number {
  return plantedAtMs + FARM_CROP_CATALOG[cropId].growHours * 3600 * 1000;
}

export function computeRottenAtMs(
  cropId: FarmCropId,
  plantedAtMs: number,
): number {
  return (
    computeMaturedAtMs(cropId, plantedAtMs) +
    FARM_RIPE_TO_ROTTEN_HOURS * 3600 * 1000
  );
}

export function computeLevelFromExperience(experience: number): number {
  let level = 1;
  for (let i = 0; i < FARM_LEVEL_EXPERIENCE_THRESHOLDS.length; i += 1) {
    if (experience >= FARM_LEVEL_EXPERIENCE_THRESHOLDS[i]!) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

export function computePlotCountForLevel(level: number): number {
  let plotCount = FARM_DEFAULT_PLOT_COUNT;
  for (const entry of FARM_LEVEL_PLOT_UNLOCKS) {
    if (level >= entry.level) plotCount = entry.plotCount;
  }
  return plotCount;
}

export const FARM_CONSUMABLE_CATALOG: Record<FarmConsumableId, FarmConsumableDefinition> = {
  fertilizer: {
    id: "fertilizer",
    nameZh: "化肥",
    emoji: "💩",
    price: 120,
    unlockLevel: 2,
    descriptionZh: "把作物剩余成长时间砍掉一半，每株作物只能用一次。",
  },
  pesticide: {
    id: "pesticide",
    nameZh: "农药",
    emoji: "🧴",
    price: 80,
    unlockLevel: 2,
    descriptionZh: "立刻清掉害虫，并在 12 小时内免疫虫害。",
  },
  dog_food: {
    id: "dog_food",
    nameZh: "狗粮",
    emoji: "🦴",
    price: 50,
    unlockLevel: 5,
    descriptionZh: "喂一次看家狗：回复 60 点能量，让它继续帮你看菜地。",
  },
};

export const FARM_CONSUMABLE_IDS: FarmConsumableId[] = Object.keys(
  FARM_CONSUMABLE_CATALOG,
) as FarmConsumableId[];

export const FARM_DOG_LEVEL_CAP = 5;
export const FARM_DOG_BUY_COST = 800;
export const FARM_DOG_UPGRADE_COSTS: ReadonlyArray<number> = [
  0, 800, 1600, 3200, 6400, 12800,
];
export const FARM_DOG_FOOD_COST = 50;
export const FARM_DOG_UNLOCK_LEVEL = 5;
export const FARM_DOG_ENERGY_DECAY_PER_HOUR = 4;
export const FARM_DOG_FEED_RESTORE = 60;
export const FARM_FERTILIZER_SHRINK_RATIO = 0.5;
export const FARM_PESTICIDE_PROTECT_HOURS = 12;

export const FARM_DECORATION_CATALOG: Record<FarmDecorationId, FarmDecorationDefinition> = {
  scarecrow: { id: "scarecrow", nameZh: "稻草人", emoji: "🌾", price: 600, unlockLevel: 3, descriptionZh: "让害虫敬而远之：田里随机长虫概率减半。", effect: "reduce_bugs" },
  windmill: { id: "windmill", nameZh: "风车", emoji: "🌬️", price: 1200, unlockLevel: 4, descriptionZh: "欧式风车，吱呀吱呀的转，给农场加一点欧风。" },
  wood_fence: { id: "wood_fence", nameZh: "木栅栏", emoji: "🪵", price: 200, unlockLevel: 1, descriptionZh: "一段段拼起来的木栅栏，常见的农场装饰。" },
  pond: { id: "pond", nameZh: "池塘", emoji: "🪷", price: 1500, unlockLevel: 5, descriptionZh: "能听见蛙叫的小池塘，里面也许会有小鱼。" },
  flower_bed: { id: "flower_bed", nameZh: "花圃", emoji: "🌷", price: 500, unlockLevel: 2, descriptionZh: "五颜六色的花圃，路过的角色都会多停一会儿。" },
  lantern: { id: "lantern", nameZh: "灯笼", emoji: "🏮", price: 350, unlockLevel: 2, descriptionZh: "红灯笼一挂，节日气氛立马上来。" },
  statue: { id: "statue", nameZh: "石像", emoji: "🗿", price: 2000, unlockLevel: 6, descriptionZh: "神秘石像，据说看着就让人想认真种地。" },
  hammock: { id: "hammock", nameZh: "吊床", emoji: "🛌", price: 800, unlockLevel: 4, descriptionZh: "挂在两棵树之间的吊床，自己睡也好看人睡也好。" },
  beehive: { id: "beehive", nameZh: "蜂箱", emoji: "🐝", price: 1000, unlockLevel: 4, descriptionZh: "勤劳的蜜蜂在嗡嗡嗡，给农场带来好兆头。" },
  mailbox: { id: "mailbox", nameZh: "邮筒", emoji: "📮", price: 400, unlockLevel: 2, descriptionZh: "老式红色邮筒，邻居说他们都看不腻。" },
};

export const FARM_DECORATION_IDS: FarmDecorationId[] = Object.keys(
  FARM_DECORATION_CATALOG,
) as FarmDecorationId[];

// 节日窗口判定（与后端 crop-catalog.ts 同步）：用阳历月份近似农历。
const FARM_FESTIVAL_MONTHS: Record<"spring" | "mid_autumn" | "halloween", number[]> = {
  spring: [1, 2],
  mid_autumn: [9],
  halloween: [10],
};

export function isFarmCropInSeason(
  cropId: FarmCropId,
  now: Date = new Date(),
): boolean {
  const def = FARM_CROP_CATALOG[cropId];
  if (!def) return false;
  if (!def.festival) return true;
  return (FARM_FESTIVAL_MONTHS[def.festival] ?? []).includes(now.getMonth() + 1);
}
