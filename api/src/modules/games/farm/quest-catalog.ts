// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { FarmQuestDefinition, FarmQuestId } from './farm.types';

export const FARM_QUEST_CATALOG: Record<FarmQuestId, FarmQuestDefinition> = {
  daily_plant_3: {
    id: 'daily_plant_3',
    kind: 'daily',
    nameZh: '今日种 3 株',
    descriptionZh: '在自己的田里种 3 株任何作物',
    goal: 3,
    rewardCoins: 60,
    rewardExperience: 12,
  },
  daily_water_5: {
    id: 'daily_water_5',
    kind: 'daily',
    nameZh: '今日浇水 5 次',
    descriptionZh: '给田里的作物浇水 5 次',
    goal: 5,
    rewardCoins: 50,
    rewardExperience: 10,
  },
  daily_harvest_3: {
    id: 'daily_harvest_3',
    kind: 'daily',
    nameZh: '今日收 3 茬',
    descriptionZh: '收获 3 株成熟的作物',
    goal: 3,
    rewardCoins: 100,
    rewardExperience: 20,
  },
  daily_steal_1: {
    id: 'daily_steal_1',
    kind: 'daily',
    nameZh: '今日偷一次菜',
    descriptionZh: '去邻居家偷 1 次菜',
    goal: 1,
    rewardCoins: 80,
    rewardExperience: 15,
  },
  daily_gift_1: {
    id: 'daily_gift_1',
    kind: 'daily',
    nameZh: '送 1 次礼',
    descriptionZh: '给任意邻居送一次礼物（金币或物品）',
    goal: 1,
    rewardCoins: 60,
    rewardExperience: 10,
  },
  achievement_harvest_100: {
    id: 'achievement_harvest_100',
    kind: 'achievement',
    nameZh: '累计收 100 个',
    descriptionZh: '累计收获 100 个作物',
    goal: 100,
    rewardCoins: 500,
    rewardExperience: 100,
  },
  achievement_harvest_1000: {
    id: 'achievement_harvest_1000',
    kind: 'achievement',
    nameZh: '累计收 1000 个',
    descriptionZh: '累计收获 1000 个作物',
    goal: 1000,
    rewardCoins: 4000,
    rewardExperience: 600,
  },
  achievement_level_5: {
    id: 'achievement_level_5',
    kind: 'achievement',
    nameZh: '达到 5 级',
    descriptionZh: '把农场玩到 5 级',
    goal: 5,
    rewardCoins: 300,
    rewardExperience: 0,
  },
  achievement_level_10: {
    id: 'achievement_level_10',
    kind: 'achievement',
    nameZh: '达到 10 级',
    descriptionZh: '把农场玩到 10 级',
    goal: 10,
    rewardCoins: 1500,
    rewardExperience: 0,
  },
  achievement_buy_dog: {
    id: 'achievement_buy_dog',
    kind: 'achievement',
    nameZh: '养一条狗',
    descriptionZh: '买下你的第一条看家狗',
    goal: 1,
    rewardCoins: 200,
    rewardExperience: 30,
  },
};

export const FARM_QUEST_IDS: FarmQuestId[] = Object.keys(
  FARM_QUEST_CATALOG,
) as FarmQuestId[];

export function isFarmQuestId(value: string): value is FarmQuestId {
  return Object.prototype.hasOwnProperty.call(FARM_QUEST_CATALOG, value);
}

export function getQuestDefinition(id: FarmQuestId): FarmQuestDefinition {
  const def = FARM_QUEST_CATALOG[id];
  if (!def) throw new Error(`Unknown quest id: ${id}`);
  return def;
}

// 按当前 action 推进哪些 daily 任务。
export const FARM_QUEST_TRIGGERS: Record<string, FarmQuestId[]> = {
  plant: ['daily_plant_3'],
  water: ['daily_water_5'],
  harvest: ['daily_harvest_3', 'achievement_harvest_100', 'achievement_harvest_1000'],
  steal: ['daily_steal_1'],
  gift: ['daily_gift_1'],
  level_change: ['achievement_level_5', 'achievement_level_10'],
  buy_dog: ['achievement_buy_dog'],
};

export function todayLocalDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function yesterdayLocalDate(now: Date = new Date()): string {
  const y = new Date(now.getTime() - 24 * 3600 * 1000);
  return todayLocalDate(y);
}
// i18n-ignore-end
