import type { TankKind } from "./tank-war-types";

// Logical canvas: 208x208 battlefield + 48px right HUD = 256x224 (FC-ish)
export const LOGIC_WIDTH = 256;
export const LOGIC_HEIGHT = 224;
export const BATTLEFIELD = 208;
export const HUD_X = 208;
export const HUD_WIDTH = 48;

export const TILE_SIZE = 16;
export const HALF = 8;
export const GRID_W = 13;
export const HALF_W = 26;
export const HALF_H = 26;

// speeds in px/frame (60fps target)
export const PLAYER_SPEED = 0.75;
export const ENEMY_SPEED: Record<TankKind, number> = {
  player1: PLAYER_SPEED,
  player2: PLAYER_SPEED,
  light: 0.5,
  fast: 1.5,
  armor: 1.0,
  power: 0.5,
};
export const BULLET_SPEED_BASE = 2.0;
export const BULLET_SPEED_FAST = 3.5; // level >= 1

export const ENEMY_QUOTA = 20;
export const MAX_ENEMIES_ONFIELD = 4;
export const SPAWN_INTERVAL_MS = 2400;
export const STAGE_INTRO_MS = 1600;
export const STAGE_CLEAR_MS = 2200;

// Spawn coordinates (top edge), x in px
export const ENEMY_SPAWN_POINTS = [
  { x: 0, y: 0 },
  { x: 6 * TILE_SIZE, y: 0 },
  { x: 12 * TILE_SIZE, y: 0 },
];

// player spawn positions (relative to battlefield top-left)
export const P1_SPAWN = { x: 4 * TILE_SIZE, y: 12 * TILE_SIZE };
export const P2_SPAWN = { x: 8 * TILE_SIZE, y: 12 * TILE_SIZE };

// timers
export const PLAYER_SHIELD_MS = 3000;
export const ENEMY_SHIELD_MS = 1500;
export const POWER_UP_LIFETIME_MS = 25000;
export const POWER_UP_BLINK_MS = 5000;
export const HELMET_MS = 10000;
export const SHOVEL_MS = 20000;
export const TIMER_MS = 10000;
export const FIRE_COOLDOWN_PLAYER = 250; // ms between shots
export const FIRE_COOLDOWN_ENEMY_MIN = 800;
export const FIRE_COOLDOWN_ENEMY_MAX = 2000;

// scores
export const SCORES: Record<TankKind, number> = {
  player1: 0,
  player2: 0,
  light: 100,
  fast: 200,
  armor: 300,
  power: 400,
};

// max bullets per tank
export function maxBulletsFor(level: number): number {
  return level >= 2 ? 2 : 1;
}
