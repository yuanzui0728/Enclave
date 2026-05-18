// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  FARM_DEFAULT_PLOT_COUNT,
  FARM_DOG_BLOCK_BASE_RATE,
  FARM_DOG_ENERGY_DECAY_PER_HOUR,
  FARM_LEVEL_EXPERIENCE_THRESHOLDS,
  FARM_LEVEL_PLOT_UNLOCKS,
  FarmConsumableDefinition,
  FarmConsumableId,
  FarmCropDefinition,
  FarmCropId,
  FarmDecorationDefinition,
  FarmDecorationId,
  FarmDogState,
} from './farm.types';

export const FARM_CROP_CATALOG: Record<FarmCropId, FarmCropDefinition> = {
  cabbage: {
    id: 'cabbage',
    nameZh: '白菜',
    emoji: '🥬',
    seedCost: 20,
    sellPrice: 50,
    growHours: 2,
    yieldRange: [2, 4],
    preferredDomains: ['cooking', 'wellness', 'life'],
    unlockLevel: 1,
    rarity: 'common',
    experience: 5,
  },
  potato: {
    id: 'potato',
    nameZh: '土豆',
    emoji: '🥔',
    seedCost: 30,
    sellPrice: 80,
    growHours: 3,
    yieldRange: [2, 4],
    preferredDomains: ['cooking', 'life'],
    unlockLevel: 1,
    rarity: 'common',
    experience: 7,
  },
  carrot: {
    id: 'carrot',
    nameZh: '胡萝卜',
    emoji: '🥕',
    seedCost: 35,
    sellPrice: 100,
    growHours: 4,
    yieldRange: [2, 5],
    preferredDomains: ['cooking', 'wellness'],
    unlockLevel: 1,
    rarity: 'common',
    experience: 8,
  },
  wheat: {
    id: 'wheat',
    nameZh: '小麦',
    emoji: '🌾',
    seedCost: 45,
    sellPrice: 130,
    growHours: 5,
    yieldRange: [3, 5],
    preferredDomains: ['cooking', 'farming'],
    unlockLevel: 2,
    rarity: 'common',
    experience: 10,
  },
  corn: {
    id: 'corn',
    nameZh: '玉米',
    emoji: '🌽',
    seedCost: 60,
    sellPrice: 180,
    growHours: 6,
    yieldRange: [3, 5],
    preferredDomains: ['cooking', 'farming'],
    unlockLevel: 2,
    rarity: 'common',
    experience: 12,
  },
  strawberry: {
    id: 'strawberry',
    nameZh: '草莓',
    emoji: '🍓',
    seedCost: 90,
    sellPrice: 260,
    growHours: 8,
    yieldRange: [3, 6],
    preferredDomains: ['fashion', 'life', 'romance'],
    unlockLevel: 2,
    rarity: 'uncommon',
    experience: 16,
  },
  tomato: {
    id: 'tomato',
    nameZh: '西红柿',
    emoji: '🍅',
    seedCost: 80,
    sellPrice: 240,
    growHours: 12,
    yieldRange: [3, 6],
    preferredDomains: ['cooking'],
    unlockLevel: 3,
    rarity: 'uncommon',
    experience: 18,
  },
  sunflower: {
    id: 'sunflower',
    nameZh: '向日葵',
    emoji: '🌻',
    seedCost: 100,
    sellPrice: 280,
    growHours: 9,
    yieldRange: [2, 4],
    preferredDomains: ['fashion', 'art'],
    unlockLevel: 3,
    rarity: 'uncommon',
    experience: 18,
  },
  rice: {
    id: 'rice',
    nameZh: '稻米',
    emoji: '🌾',
    seedCost: 110,
    sellPrice: 320,
    growHours: 10,
    yieldRange: [3, 5],
    preferredDomains: ['cooking', 'farming'],
    unlockLevel: 3,
    rarity: 'uncommon',
    experience: 20,
  },
  pumpkin: {
    id: 'pumpkin',
    nameZh: '南瓜',
    emoji: '🎃',
    seedCost: 160,
    sellPrice: 480,
    growHours: 14,
    yieldRange: [2, 4],
    preferredDomains: ['cooking', 'art'],
    unlockLevel: 4,
    rarity: 'uncommon',
    experience: 28,
  },
  lavender: {
    id: 'lavender',
    nameZh: '薰衣草',
    emoji: '💜',
    seedCost: 200,
    sellPrice: 620,
    growHours: 18,
    yieldRange: [2, 4],
    preferredDomains: ['psychology', 'romance', 'fashion'],
    unlockLevel: 4,
    rarity: 'rare',
    experience: 36,
  },
  goji: {
    id: 'goji',
    nameZh: '枸杞',
    emoji: '🔴',
    seedCost: 280,
    sellPrice: 920,
    growHours: 30,
    yieldRange: [2, 4],
    preferredDomains: ['medicine', 'wellness'],
    unlockLevel: 4,
    rarity: 'rare',
    experience: 50,
  },
  ginseng: {
    id: 'ginseng',
    nameZh: '人参',
    emoji: '🪴',
    seedCost: 600,
    sellPrice: 2200,
    growHours: 48,
    yieldRange: [1, 2],
    preferredDomains: ['medicine'],
    unlockLevel: 5,
    rarity: 'rare',
    experience: 110,
  },
  snow_lotus: {
    id: 'snow_lotus',
    nameZh: '雪莲',
    emoji: '❄️',
    seedCost: 1100,
    sellPrice: 4200,
    growHours: 72,
    yieldRange: [1, 1],
    preferredDomains: ['medicine'],
    unlockLevel: 6,
    rarity: 'rare',
    experience: 220,
  },
  // ===== Phase 2 新增蔬菜（lv 1-2）=====
  radish: {
    id: 'radish',
    nameZh: '萝卜',
    emoji: '🥕',
    seedCost: 25,
    sellPrice: 65,
    growHours: 2,
    yieldRange: [2, 5],
    preferredDomains: ['cooking', 'life'],
    unlockLevel: 1,
    rarity: 'common',
    experience: 6,
  },
  lettuce: {
    id: 'lettuce',
    nameZh: '生菜',
    emoji: '🥗',
    seedCost: 22,
    sellPrice: 55,
    growHours: 2,
    yieldRange: [2, 4],
    preferredDomains: ['cooking', 'wellness'],
    unlockLevel: 1,
    rarity: 'common',
    experience: 5,
  },
  spinach: {
    id: 'spinach',
    nameZh: '菠菜',
    emoji: '🥬',
    seedCost: 30,
    sellPrice: 75,
    growHours: 3,
    yieldRange: [2, 4],
    preferredDomains: ['cooking', 'wellness'],
    unlockLevel: 2,
    rarity: 'common',
    experience: 8,
  },
  onion: {
    id: 'onion',
    nameZh: '洋葱',
    emoji: '🧅',
    seedCost: 35,
    sellPrice: 95,
    growHours: 4,
    yieldRange: [2, 4],
    preferredDomains: ['cooking'],
    unlockLevel: 2,
    rarity: 'common',
    experience: 9,
  },
  // ===== Phase 2 新增主粮 / 普通收益（lv 2-4）=====
  peanut: {
    id: 'peanut',
    nameZh: '花生',
    emoji: '🥜',
    seedCost: 50,
    sellPrice: 150,
    growHours: 6,
    yieldRange: [3, 5],
    preferredDomains: ['cooking', 'farming'],
    unlockLevel: 2,
    rarity: 'common',
    experience: 11,
  },
  soybean: {
    id: 'soybean',
    nameZh: '大豆',
    emoji: '🫘',
    seedCost: 55,
    sellPrice: 165,
    growHours: 7,
    yieldRange: [3, 5],
    preferredDomains: ['cooking', 'farming'],
    unlockLevel: 3,
    rarity: 'common',
    experience: 13,
  },
  eggplant: {
    id: 'eggplant',
    nameZh: '茄子',
    emoji: '🍆',
    seedCost: 85,
    sellPrice: 250,
    growHours: 9,
    yieldRange: [3, 5],
    preferredDomains: ['cooking'],
    unlockLevel: 3,
    rarity: 'uncommon',
    experience: 18,
  },
  cucumber: {
    id: 'cucumber',
    nameZh: '黄瓜',
    emoji: '🥒',
    seedCost: 70,
    sellPrice: 210,
    growHours: 7,
    yieldRange: [3, 5],
    preferredDomains: ['cooking', 'wellness'],
    unlockLevel: 3,
    rarity: 'uncommon',
    experience: 15,
  },
  // ===== Phase 2 新增高价（lv 4-6）=====
  watermelon: {
    id: 'watermelon',
    nameZh: '西瓜',
    emoji: '🍉',
    seedCost: 200,
    sellPrice: 620,
    growHours: 16,
    yieldRange: [2, 3],
    preferredDomains: ['cooking', 'life'],
    unlockLevel: 4,
    rarity: 'uncommon',
    experience: 32,
  },
  sugarcane: {
    id: 'sugarcane',
    nameZh: '甘蔗',
    emoji: '🎋',
    seedCost: 240,
    sellPrice: 760,
    growHours: 20,
    yieldRange: [2, 4],
    preferredDomains: ['cooking'],
    unlockLevel: 4,
    rarity: 'uncommon',
    experience: 40,
  },
  mint: {
    id: 'mint',
    nameZh: '薄荷',
    emoji: '🌿',
    seedCost: 180,
    sellPrice: 560,
    growHours: 15,
    yieldRange: [3, 5],
    preferredDomains: ['psychology', 'wellness', 'fashion'],
    unlockLevel: 4,
    rarity: 'uncommon',
    experience: 30,
  },
  dragon_fruit: {
    id: 'dragon_fruit',
    nameZh: '火龙果',
    emoji: '🐉',
    seedCost: 360,
    sellPrice: 1180,
    growHours: 26,
    yieldRange: [2, 4],
    preferredDomains: ['cooking', 'fashion'],
    unlockLevel: 6,
    rarity: 'rare',
    experience: 65,
  },
  // ===== Phase 2 多年生果树（lv 7-9）=====
  // 一次种、可多次收；harvestCount 每收一次 +1，下次成熟 = now + perennialCycleHours
  apple_tree: {
    id: 'apple_tree',
    nameZh: '苹果树',
    emoji: '🍎',
    seedCost: 1500,
    sellPrice: 380,
    growHours: 36, // 第一茬挂果
    yieldRange: [4, 7],
    preferredDomains: ['cooking', 'life'],
    unlockLevel: 7,
    rarity: 'rare',
    experience: 80,
    isPerennial: true,
    perennialCycleHours: 18,
  },
  peach_tree: {
    id: 'peach_tree',
    nameZh: '桃树',
    emoji: '🍑',
    seedCost: 1600,
    sellPrice: 420,
    growHours: 40,
    yieldRange: [4, 7],
    preferredDomains: ['fashion', 'romance', 'life'],
    unlockLevel: 7,
    rarity: 'rare',
    experience: 88,
    isPerennial: true,
    perennialCycleHours: 20,
  },
  grape_vine: {
    id: 'grape_vine',
    nameZh: '葡萄藤',
    emoji: '🍇',
    seedCost: 2000,
    sellPrice: 520,
    growHours: 44,
    yieldRange: [4, 6],
    preferredDomains: ['cooking', 'fashion'],
    unlockLevel: 8,
    rarity: 'rare',
    experience: 100,
    isPerennial: true,
    perennialCycleHours: 22,
  },
  orange_tree: {
    id: 'orange_tree',
    nameZh: '橙子树',
    emoji: '🍊',
    seedCost: 1800,
    sellPrice: 460,
    growHours: 38,
    yieldRange: [4, 7],
    preferredDomains: ['cooking', 'wellness'],
    unlockLevel: 8,
    rarity: 'rare',
    experience: 96,
    isPerennial: true,
    perennialCycleHours: 20,
  },
  cherry_tree: {
    id: 'cherry_tree',
    nameZh: '樱桃树',
    emoji: '🍒',
    seedCost: 2400,
    sellPrice: 620,
    growHours: 48,
    yieldRange: [3, 6],
    preferredDomains: ['fashion', 'romance', 'art'],
    unlockLevel: 9,
    rarity: 'rare',
    experience: 130,
    isPerennial: true,
    perennialCycleHours: 24,
  },
  // ===== Phase 2 节日限定（默认 disabled，按 isCropAvailableNow 判定）=====
  plum_blossom: {
    id: 'plum_blossom',
    nameZh: '梅花',
    emoji: '🌸',
    seedCost: 500,
    sellPrice: 1800,
    growHours: 20,
    yieldRange: [2, 3],
    preferredDomains: ['art', 'romance'],
    unlockLevel: 5,
    rarity: 'rare',
    experience: 70,
    festival: 'spring',
  },
  osmanthus: {
    id: 'osmanthus',
    nameZh: '桂花',
    emoji: '💛',
    seedCost: 550,
    sellPrice: 1900,
    growHours: 22,
    yieldRange: [2, 3],
    preferredDomains: ['cooking', 'art'],
    unlockLevel: 5,
    rarity: 'rare',
    experience: 72,
    festival: 'mid_autumn',
  },
};

export const FARM_CROP_IDS: FarmCropId[] = Object.keys(FARM_CROP_CATALOG) as FarmCropId[];

export function getCropDefinition(cropId: FarmCropId): FarmCropDefinition {
  const def = FARM_CROP_CATALOG[cropId];
  if (!def) throw new Error(`Unknown crop id: ${cropId}`);
  return def;
}

export function isFarmCropId(value: string): value is FarmCropId {
  return Object.prototype.hasOwnProperty.call(FARM_CROP_CATALOG, value);
}

export function computeMaturedAtMs(cropId: FarmCropId, plantedAtMs: number): number {
  return plantedAtMs + getCropDefinition(cropId).growHours * 3600 * 1000;
}

export function computeRottenAtMs(cropId: FarmCropId, plantedAtMs: number): number {
  return computeMaturedAtMs(cropId, plantedAtMs) + 24 * 3600 * 1000;
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
    id: 'fertilizer',
    nameZh: '化肥',
    emoji: '💩',
    price: 120,
    unlockLevel: 2,
    descriptionZh: '把作物剩余成长时间砍掉一半，每株作物只能用一次。',
  },
  pesticide: {
    id: 'pesticide',
    nameZh: '农药',
    emoji: '🧴',
    price: 80,
    unlockLevel: 2,
    descriptionZh: '立刻清掉害虫，并在 12 小时内免疫虫害。',
  },
  dog_food: {
    id: 'dog_food',
    nameZh: '狗粮',
    emoji: '🦴',
    price: 50,
    unlockLevel: 5,
    descriptionZh: '喂一次看家狗：回复 60 点能量，让它继续帮你看菜地。',
  },
};

export const FARM_CONSUMABLE_IDS: FarmConsumableId[] = Object.keys(
  FARM_CONSUMABLE_CATALOG,
) as FarmConsumableId[];

export function getConsumableDefinition(id: FarmConsumableId): FarmConsumableDefinition {
  const def = FARM_CONSUMABLE_CATALOG[id];
  if (!def) throw new Error(`Unknown consumable id: ${id}`);
  return def;
}

export function isFarmConsumableId(value: string): value is FarmConsumableId {
  return Object.prototype.hasOwnProperty.call(FARM_CONSUMABLE_CATALOG, value);
}

export function createDefaultDog(): FarmDogState {
  return { level: 0, energy: 0, lastFedAt: null };
}

// 按 (now - lastFedAt) 算出当前能量，不写库，纯计算函数。
export function computeDogEnergy(dog: FarmDogState | null | undefined, nowMs: number): number {
  if (!dog || dog.level <= 0) return 0;
  if (dog.lastFedAt == null) return dog.energy;
  const hours = Math.max(0, (nowMs - dog.lastFedAt) / 3_600_000);
  const decayed = dog.energy - FARM_DOG_ENERGY_DECAY_PER_HOUR * hours;
  return Math.max(0, Math.min(100, decayed));
}

// 看家狗拦截偷菜：能量越足、等级越高，拦截率越高。
// energy<30 防御减半（狗饿了）；level=0 直接 0。
export function computeDogBlockRate(dog: FarmDogState | null | undefined, nowMs: number): number {
  if (!dog || dog.level <= 0) return 0;
  const energy = computeDogEnergy(dog, nowMs);
  const baseRate = FARM_DOG_BLOCK_BASE_RATE * dog.level;
  const energyMultiplier = energy < 30 ? 0.5 : 1;
  return Math.min(0.92, baseRate * energyMultiplier);
}

export const FARM_DECORATION_CATALOG: Record<FarmDecorationId, FarmDecorationDefinition> = {
  scarecrow: {
    id: 'scarecrow',
    nameZh: '稻草人',
    emoji: '🌾',
    price: 600,
    unlockLevel: 3,
    descriptionZh: '让害虫敬而远之：田里随机长虫概率减半。',
    effect: 'reduce_bugs',
  },
  windmill: {
    id: 'windmill',
    nameZh: '风车',
    emoji: '🌬️',
    price: 1200,
    unlockLevel: 4,
    descriptionZh: '欧式风车，吱呀吱呀的转，给农场加一点欧风。',
  },
  wood_fence: {
    id: 'wood_fence',
    nameZh: '木栅栏',
    emoji: '🪵',
    price: 200,
    unlockLevel: 1,
    descriptionZh: '一段段拼起来的木栅栏，常见的农场装饰。',
  },
  pond: {
    id: 'pond',
    nameZh: '池塘',
    emoji: '🪷',
    price: 1500,
    unlockLevel: 5,
    descriptionZh: '能听见蛙叫的小池塘，里面也许会有小鱼。',
  },
  flower_bed: {
    id: 'flower_bed',
    nameZh: '花圃',
    emoji: '🌷',
    price: 500,
    unlockLevel: 2,
    descriptionZh: '五颜六色的花圃，路过的角色都会多停一会儿。',
  },
  lantern: {
    id: 'lantern',
    nameZh: '灯笼',
    emoji: '🏮',
    price: 350,
    unlockLevel: 2,
    descriptionZh: '红灯笼一挂，节日气氛立马上来。',
  },
  statue: {
    id: 'statue',
    nameZh: '石像',
    emoji: '🗿',
    price: 2000,
    unlockLevel: 6,
    descriptionZh: '神秘石像，据说看着就让人想认真种地。',
  },
  hammock: {
    id: 'hammock',
    nameZh: '吊床',
    emoji: '🛌',
    price: 800,
    unlockLevel: 4,
    descriptionZh: '挂在两棵树之间的吊床，自己睡也好看人睡也好。',
  },
  beehive: {
    id: 'beehive',
    nameZh: '蜂箱',
    emoji: '🐝',
    price: 1000,
    unlockLevel: 4,
    descriptionZh: '勤劳的蜜蜂在嗡嗡嗡，给农场带来好兆头。',
  },
  mailbox: {
    id: 'mailbox',
    nameZh: '邮筒',
    emoji: '📮',
    price: 400,
    unlockLevel: 2,
    descriptionZh: '老式红色邮筒，邻居说他们都看不腻。',
  },
};

export const FARM_DECORATION_IDS: FarmDecorationId[] = Object.keys(
  FARM_DECORATION_CATALOG,
) as FarmDecorationId[];

export function getDecorationDefinition(id: FarmDecorationId): FarmDecorationDefinition {
  const def = FARM_DECORATION_CATALOG[id];
  if (!def) throw new Error(`Unknown decoration id: ${id}`);
  return def;
}

export function isFarmDecorationId(value: string): value is FarmDecorationId {
  return Object.prototype.hasOwnProperty.call(FARM_DECORATION_CATALOG, value);
}

// 节日窗口判定：spring=农历春节大概 1-2 月，mid_autumn=9 月，halloween=10 月底。
// 简化：用阳历月份近似，不真正算农历。Phase 4 可换更精确的农历库。
const FESTIVAL_MONTHS: Record<'spring' | 'mid_autumn' | 'halloween', number[]> = {
  spring: [1, 2],
  mid_autumn: [9],
  halloween: [10],
};

export function isCropAvailableNow(
  cropId: FarmCropId,
  now: Date = new Date(),
): boolean {
  const def = FARM_CROP_CATALOG[cropId];
  if (!def) return false;
  if (!def.festival) return true;
  const months = FESTIVAL_MONTHS[def.festival] ?? [];
  return months.includes(now.getMonth() + 1);
}
// i18n-ignore-end
