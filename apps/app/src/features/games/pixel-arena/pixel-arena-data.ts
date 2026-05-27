import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
const t = translateRuntimeMessage;

// 像素擂台 — MVP：5 回合像素对打，攻 / 防 / 杀 三选一，回合制结算。

export type Move = "attack" | "defend" | "special";

export type Fighter = {
  id: string;
  name: string;
  emoji: string;
  worldCharacterId?: string;
  hp: number;
  atkBonus: number; // 出招伤害额外加成
  defBonus: number; // 受击伤害额外减免
  specialBias: "balance" | "aggressive" | "defensive";
  blurb: string;
};

export const ROUND_COUNT = 5;
export const BASE_ATTACK_DAMAGE = 8;
export const SPECIAL_DAMAGE = 12;
export const SPECIAL_VS_DEFEND_DAMAGE = 18;
export const STREAK_TOKEN_MILESTONE = 3;
export const LOG_LIMIT = 24;

export const FIGHTERS: Fighter[] = [
  {
    id: "fighter-zhouran",
    name: t(msg`周冉`),
    emoji: "💪",
    worldCharacterId: "char-manual-zhou-ran",
    hp: 70,
    atkBonus: 3,
    defBonus: 0,
    specialBias: "aggressive",
    blurb: t(msg`一拳贴墙，特技节奏猛。`),
  },
  {
    id: "fighter-suyu",
    name: t(msg`苏屿`),
    emoji: "🌸",
    worldCharacterId: "char-manual-su-yu",
    hp: 80,
    atkBonus: 0,
    defBonus: 4,
    specialBias: "defensive",
    blurb: t(msg`守得稳，反打才出特技。`),
  },
  {
    id: "fighter-linchen",
    name: t(msg`林沉`),
    emoji: "🌙",
    worldCharacterId: "char-manual-lin-chen",
    hp: 65,
    atkBonus: 2,
    defBonus: 1,
    specialBias: "balance",
    blurb: t(msg`深夜节拍，特技精准。`),
  },
  {
    id: "fighter-linmian",
    name: t(msg`林眠`),
    emoji: "😴",
    worldCharacterId: "char-manual-lin-mian",
    hp: 78,
    atkBonus: 0,
    defBonus: 3,
    specialBias: "defensive",
    blurb: t(msg`睡眼朦胧时反打最猛。`),
  },
  {
    id: "fighter-yueyi",
    name: t(msg`月一`),
    emoji: "🌝",
    hp: 68,
    atkBonus: 4,
    defBonus: 0,
    specialBias: "aggressive",
    blurb: t(msg`月光暴击，攻击优先。`),
  },
];

export function getFighter(id: string): Fighter | undefined {
  return FIGHTERS.find((f) => f.id === id);
}

// 简单 RPS-like 结算：返回 { playerDamage, npcDamage, summary }
export type RoundOutcome = {
  playerDamage: number; // 玩家本回合受到的伤害
  npcDamage: number; // NPC 本回合受到的伤害
  summary: "p_hits" | "n_hits" | "trade" | "block" | "stalemate";
};

export function resolveMoves(
  player: Fighter,
  playerMove: Move,
  npc: Fighter,
  npcMove: Move,
): RoundOutcome {
  const atkP = BASE_ATTACK_DAMAGE + player.atkBonus;
  const atkN = BASE_ATTACK_DAMAGE + npc.atkBonus;
  const defP = player.defBonus;
  const defN = npc.defBonus;
  const spP = SPECIAL_DAMAGE + player.atkBonus;
  const spN = SPECIAL_DAMAGE + npc.atkBonus;

  if (playerMove === "attack" && npcMove === "attack") {
    return {
      playerDamage: Math.max(0, atkN - defP / 2),
      npcDamage: Math.max(0, atkP - defN / 2),
      summary: "trade",
    };
  }
  if (playerMove === "attack" && npcMove === "defend") {
    return { playerDamage: 0, npcDamage: 0, summary: "block" };
  }
  if (playerMove === "attack" && npcMove === "special") {
    return {
      playerDamage: 0,
      npcDamage: Math.max(0, atkP - defN / 2),
      summary: "p_hits",
    };
  }
  if (playerMove === "defend" && npcMove === "attack") {
    return { playerDamage: 0, npcDamage: 0, summary: "block" };
  }
  if (playerMove === "defend" && npcMove === "defend") {
    return { playerDamage: 0, npcDamage: 0, summary: "stalemate" };
  }
  if (playerMove === "defend" && npcMove === "special") {
    return {
      playerDamage: Math.max(2, SPECIAL_VS_DEFEND_DAMAGE - defP),
      npcDamage: 0,
      summary: "n_hits",
    };
  }
  if (playerMove === "special" && npcMove === "attack") {
    return {
      playerDamage: Math.max(0, atkN - defP / 2),
      npcDamage: 0,
      summary: "n_hits",
    };
  }
  if (playerMove === "special" && npcMove === "defend") {
    return {
      playerDamage: 0,
      npcDamage: Math.max(2, SPECIAL_VS_DEFEND_DAMAGE - defN),
      summary: "p_hits",
    };
  }
  // special vs special
  return { playerDamage: 0, npcDamage: 0, summary: "stalemate" };
}

export function pickNpcMove(
  npc: Fighter,
  rng: () => number,
  playerLastMove: Move | null,
): Move {
  // 偏好 + 简单读招（如果玩家上回合 attack，NPC 倾向 defend）
  const r = rng();
  if (npc.specialBias === "aggressive") {
    if (playerLastMove === "defend" && r < 0.6) return "special";
    return r < 0.55 ? "attack" : r < 0.85 ? "special" : "defend";
  }
  if (npc.specialBias === "defensive") {
    if (playerLastMove === "attack" && r < 0.5) return "defend";
    if (playerLastMove === "defend" && r < 0.5) return "special";
    return r < 0.4 ? "defend" : r < 0.75 ? "attack" : "special";
  }
  // balance
  if (playerLastMove === "attack" && r < 0.45) return "defend";
  return r < 0.4 ? "attack" : r < 0.7 ? "defend" : "special";
}
// i18n-ignore-end
