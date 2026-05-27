import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { Squadmate } from "./signal-squad-types";

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
const t = translateRuntimeMessage;

export const ROUND_DURATION_MS = 3 * 60 * 1000; // 3 分钟
export const TOWER_VICTORY = 100;
export const SYNC_SKILL_COOLDOWN_MS = 30 * 1000;
export const SYNC_SKILL_TOWER_GAIN = 18;
export const EVENT_SPAWN_MIN_MS = 4000;
export const EVENT_SPAWN_MAX_MS = 7000;
export const EVENT_DURATION_MS = 5000;
export const SQUADMATE_BUSY_MS = 1200;
export const TOWER_NATURAL_GAIN_PER_SEC = 0.4; // 队员存活时缓慢推进
export const ENEMY_PENALTY_HP = 12;
export const ENEMY_PENALTY_MORALE = 8;
export const MISSED_TOWER_PENALTY = 6;
export const SYNC_OK_TOWER = 14;
export const ENEMY_OK_TOWER = 10;
export const SUPPLY_OK_TOWER = 6;
export const SUPPLY_MORALE_RESTORE = 12;
export const SUPPLY_HP_RESTORE = 8;
export const LOG_LIMIT = 32;
export const SELECTED_SQUAD_SIZE = 3;

// 队员候选名单。worldCharacterId 指向 fixed-world-character-presets / default-characters，
// 与 parking-war-data.ts 同源；新加的角色用 char-* 占位即可，UI 端只用 emoji 渲染。
export const SQUADMATE_POOL: Squadmate[] = [
  {
    id: "squad-zhouran",
    name: t(msg`周冉`),
    worldCharacterId: "char-manual-zhou-ran",
    emoji: "💪",
    blurb: t(msg`一击就能把敌方信号源敲哑。`),
    skill: "sniper",
    maxHp: 110,
    maxMorale: 90,
  },
  {
    id: "squad-suyu",
    name: t(msg`苏屿`),
    worldCharacterId: "char-manual-su-yu",
    emoji: "🌸",
    blurb: t(msg`包扎和递水的速度比谁都快。`),
    skill: "medic",
    maxHp: 95,
    maxMorale: 110,
  },
  {
    id: "squad-xuzhe",
    name: t(msg`徐喆`),
    worldCharacterId: "char-manual-xu-zhe",
    emoji: "💼",
    blurb: t(msg`谁来都先掏出名片，再说后面的事。`),
    skill: "scout",
    maxHp: 90,
    maxMorale: 105,
  },
  {
    id: "squad-linchen",
    name: t(msg`林沉`),
    worldCharacterId: "char-manual-lin-chen",
    emoji: "🌙",
    blurb: t(msg`深夜动作精准到一毫秒。`),
    skill: "sniper",
    maxHp: 100,
    maxMorale: 95,
  },
  {
    id: "squad-linmian",
    name: t(msg`林眠`),
    worldCharacterId: "char-manual-lin-mian",
    emoji: "😴",
    blurb: t(msg`犯困也能补给，醒着更狠。`),
    skill: "medic",
    maxHp: 105,
    maxMorale: 100,
  },
];

export const SKILL_LABEL: Record<string, string> = {
  scout: t(msg`斥候`),
  sniper: t(msg`狙击`),
  medic: t(msg`医疗`),
};

export const SKILL_EMOJI: Record<string, string> = {
  scout: "🔭",
  sniper: "🎯",
  medic: "💉",
};

export function getSquadmate(id: string): Squadmate | undefined {
  return SQUADMATE_POOL.find((mate) => mate.id === id);
}
// i18n-ignore-end
