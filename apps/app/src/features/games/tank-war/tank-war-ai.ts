// FC 敌坦克 AI — 朴素策略：
// - 每 1.5~2.5s 重新决策方向；目标随机加权 random | base | player
// - 撞墙立即换向（800ms 冷却）
// - 间隔 0.8~2s 开火（受冷却限制）

import {
  DIR_DOWN,
  DIR_LEFT,
  DIR_RIGHT,
  DIR_UP,
  type Direction,
  type Tank,
} from "./tank-war-types";
import { rngInt, rngPick } from "./tank-war-rng";

const DIRS: Direction[] = [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT];

export function dirToward(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  rng: { next: () => number },
): Direction {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? DIR_RIGHT : DIR_LEFT;
  }
  if (Math.abs(dy) > 0) {
    return dy > 0 ? DIR_DOWN : DIR_UP;
  }
  return rngPick(rng, DIRS) as Direction;
}

export function pickEnemyTarget(
  _t: Tank,
  baseX: number,
  baseY: number,
  playerX: number | null,
  playerY: number | null,
  rng: { next: () => number },
): { x: number; y: number } {
  const roll = rng.next();
  if (roll < 0.6) {
    return {
      x: rngInt(rng, 0, 192),
      y: rngInt(rng, 0, 192),
    };
  }
  if (roll < 0.9) return { x: baseX, y: baseY };
  if (playerX !== null && playerY !== null) {
    return { x: playerX, y: playerY };
  }
  return { x: baseX, y: baseY };
}
