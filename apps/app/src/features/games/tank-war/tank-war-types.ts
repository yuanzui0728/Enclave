export type TileKind = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const TILE_EMPTY: TileKind = 0;
export const TILE_BRICK: TileKind = 1;
export const TILE_STEEL: TileKind = 2;
export const TILE_TREE: TileKind = 3;
export const TILE_ICE: TileKind = 4;
export const TILE_WATER: TileKind = 5;
export const TILE_BASE: TileKind = 6;

export type Direction = 0 | 1 | 2 | 3; // up right down left
export const DIR_UP: Direction = 0;
export const DIR_RIGHT: Direction = 1;
export const DIR_DOWN: Direction = 2;
export const DIR_LEFT: Direction = 3;

export type TankKind =
  | "player1"
  | "player2"
  | "light"
  | "fast"
  | "armor"
  | "power";

export type PowerUpKind =
  | "star"
  | "tank"
  | "grenade"
  | "helmet"
  | "shovel"
  | "timer"
  | "gun";

export type Owner = "p1" | "p2" | "enemy";

export type Tank = {
  id: number;
  kind: TankKind;
  owner: Owner;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  level: 0 | 1 | 2 | 3;
  hp: number;
  shieldUntilMs: number;
  spawnAnimUntilMs: number;
  reloadAtMs: number;
  bonus: boolean;
  frozen: boolean;
  freezeUntilMs: number;
  iceSlideDx: number;
  iceSlideDy: number;
  iceSlideRemaining: number;
  nextDecideAt: number;
  nextFireAt: number;
};

export type Bullet = {
  id: number;
  ownerId: number;
  owner: Owner;
  x: number;
  y: number;
  dir: Direction;
  speed: number;
  level: 0 | 1 | 2 | 3;
};

export type PowerUp = {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  spawnedAt: number;
  expiresAt: number;
};

export type Explosion = {
  id: number;
  x: number;
  y: number;
  startedAt: number;
  big: boolean;
};

export type FloatingScore = {
  id: number;
  x: number;
  y: number;
  value: number;
  startedAt: number;
};

export type PlayerMode = "one-player" | "two-player";

export type WorldStatus =
  | "boot"
  | "stage-intro"
  | "playing"
  | "paused"
  | "stage-clear"
  | "game-over";

export type InputState = {
  p1Up: boolean;
  p1Down: boolean;
  p1Left: boolean;
  p1Right: boolean;
  p1Fire: boolean;
  p2Up: boolean;
  p2Down: boolean;
  p2Left: boolean;
  p2Right: boolean;
  p2Fire: boolean;
  pauseToggle: boolean;
};

export function createEmptyInput(): InputState {
  return {
    p1Up: false,
    p1Down: false,
    p1Left: false,
    p1Right: false,
    p1Fire: false,
    p2Up: false,
    p2Down: false,
    p2Left: false,
    p2Right: false,
    p2Fire: false,
    pauseToggle: false,
  };
}

export type GameWorld = {
  status: WorldStatus;
  mode: PlayerMode;
  stage: number;
  // 26x26 half-tile grid (TileKind)
  grid: Uint8Array;
  // brick quadrant damage: 13x13 cells * 4 quadrants packed in low 4 bits (1=destroyed)
  brickDamage: Uint8Array;
  // shovel state restoring at this ms
  shovelRestoreAt: number;
  tanks: Tank[];
  bullets: Bullet[];
  powerUps: PowerUp[];
  explosions: Explosion[];
  floats: FloatingScore[];
  nextId: number;
  enemyQueue: TankKind[];
  enemyKilled: number;
  spawnCursor: number;
  nextSpawnAt: number;
  bonusFlags: boolean[];
  livesP1: number;
  livesP2: number;
  scoreP1: number;
  scoreP2: number;
  killsByKindP1: Record<TankKind, number>;
  killsByKindP2: Record<TankKind, number>;
  baseAlive: boolean;
  stageStartedAt: number;
  stageClearAt: number | null;
  transitionUntilMs: number;
  pausedAt: number;
  freezeUntilMs: number;
  rngState: number;
  // for blink/animation
  frame: number;
  // mute
  muted: boolean;
  // playerSpawnPoint cache
  p1SpawnX: number;
  p1SpawnY: number;
  p2SpawnX: number;
  p2SpawnY: number;
};

export type HudSnapshot = {
  status: WorldStatus;
  mode: PlayerMode;
  stage: number;
  lives: number;
  livesP2?: number;
  enemyRemaining: number;
  score: number;
  scoreP2?: number;
  muted: boolean;
  maxUnlockedStage: number;
};
