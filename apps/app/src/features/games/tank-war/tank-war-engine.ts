// 坦克大战核心引擎 — 纯函数式 tick + 直接 mutate 传入的 world。
// 设计为 60fps 调用：tick(world, dtMs, input, audio)

import {
  BATTLEFIELD,
  BULLET_SPEED_BASE,
  BULLET_SPEED_FAST,
  ENEMY_SHIELD_MS,
  ENEMY_SPAWN_POINTS,
  ENEMY_SPEED,
  FIRE_COOLDOWN_ENEMY_MAX,
  FIRE_COOLDOWN_ENEMY_MIN,
  FIRE_COOLDOWN_PLAYER,
  HALF,
  HALF_W,
  HALF_H,
  HELMET_MS,
  MAX_ENEMIES_ONFIELD,
  P1_SPAWN,
  P2_SPAWN,
  PLAYER_SHIELD_MS,
  PLAYER_SPEED,
  POWER_UP_LIFETIME_MS,
  SCORES,
  SHOVEL_MS,
  SPAWN_INTERVAL_MS,
  STAGE_INTRO_MS,
  TILE_SIZE,
  TIMER_MS,
  maxBulletsFor,
} from "./tank-war-data";
import { rngInt, rngPick } from "./tank-war-rng";
import { decodeStage, rosterFor } from "./tank-war-stages";
import {
  DIR_DOWN,
  DIR_LEFT,
  DIR_RIGHT,
  DIR_UP,
  TILE_BASE,
  TILE_BRICK,
  TILE_EMPTY,
  TILE_ICE,
  TILE_STEEL,
  TILE_WATER,
  createEmptyInput,
  type Bullet,
  type Direction,
  type GameWorld,
  type InputState,
  type Owner,
  type PlayerMode,
  type PowerUpKind,
  type Tank,
  type TankKind,
  type TileKind,
} from "./tank-war-types";
import { dirToward, pickEnemyTarget } from "./tank-war-ai";

const POWER_KINDS: PowerUpKind[] = [
  "star",
  "tank",
  "grenade",
  "helmet",
  "shovel",
  "timer",
  "gun",
];

export type AudioHook = {
  play: (
    id:
      | "fire"
      | "hit"
      | "explodeSmall"
      | "explodeBig"
      | "pickup"
      | "powerup"
      | "stageStart"
      | "gameOver"
      | "pause",
  ) => void;
  setMoveActive: (on: boolean) => void;
  setMuted: (b: boolean) => void;
};

export function createWorld(): GameWorld {
  const world: GameWorld = {
    status: "boot",
    mode: "one-player",
    stage: 1,
    grid: new Uint8Array(HALF_W * HALF_H),
    brickDamage: new Uint8Array(13 * 13 * 2),
    shovelRestoreAt: 0,
    tanks: [],
    bullets: [],
    powerUps: [],
    explosions: [],
    floats: [],
    nextId: 1,
    enemyQueue: [],
    enemyKilled: 0,
    spawnCursor: 0,
    nextSpawnAt: 0,
    bonusFlags: [],
    livesP1: 2,
    livesP2: 2,
    scoreP1: 0,
    scoreP2: 0,
    killsByKindP1: { player1: 0, player2: 0, light: 0, fast: 0, armor: 0, power: 0 },
    killsByKindP2: { player1: 0, player2: 0, light: 0, fast: 0, armor: 0, power: 0 },
    baseAlive: true,
    stageStartedAt: 0,
    stageClearAt: null,
    transitionUntilMs: 0,
    pausedAt: 0,
    freezeUntilMs: 0,
    rngState: 1,
    frame: 0,
    muted: false,
    p1SpawnX: P1_SPAWN.x,
    p1SpawnY: P1_SPAWN.y,
    p2SpawnX: P2_SPAWN.x,
    p2SpawnY: P2_SPAWN.y,
  };
  return world;
}

export function startStage(
  world: GameWorld,
  stage: number,
  mode: PlayerMode,
  options?: { resetLives?: boolean; resetScores?: boolean },
): void {
  world.stage = stage;
  world.mode = mode;
  world.grid = decodeStage(stage);
  world.brickDamage = new Uint8Array(13 * 13 * 2);
  world.tanks = [];
  world.bullets = [];
  world.powerUps = [];
  world.explosions = [];
  world.floats = [];
  world.enemyQueue = rosterFor(stage) as TankKind[];
  world.spawnCursor = 0;
  world.enemyKilled = 0;
  world.nextSpawnAt = performance.now() + STAGE_INTRO_MS;
  world.bonusFlags = world.enemyQueue.map((_, i) => i === 3 || i === 10);
  world.shovelRestoreAt = 0;
  world.freezeUntilMs = 0;
  world.baseAlive = true;
  world.stageStartedAt = performance.now();
  world.stageClearAt = null;
  world.transitionUntilMs = performance.now() + 500;
  world.status = "playing";
  world.rngState = (stage * 9301 + 49297) >>> 0;
  if (options?.resetLives) {
    world.livesP1 = 2;
    world.livesP2 = 2;
  }
  if (options?.resetScores) {
    world.scoreP1 = 0;
    world.scoreP2 = 0;
  }
  spawnPlayer(world, "p1");
  if (mode === "two-player") {
    spawnPlayer(world, "p2");
  }
}

function spawnPlayer(world: GameWorld, who: "p1" | "p2"): void {
  if (who === "p1" && world.livesP1 <= 0) return;
  if (who === "p2" && world.livesP2 <= 0) return;
  const x = who === "p1" ? world.p1SpawnX : world.p2SpawnX;
  const y = who === "p1" ? world.p1SpawnY : world.p2SpawnY;
  // FC 经典：复活点被敌坦克占据时，敌坦克被爆掉，让玩家上来
  const survivors: Tank[] = [];
  for (const o of world.tanks) {
    if (o.owner === "enemy" && aabbOverlap(x, y, 16, 16, o.x, o.y, 16, 16)) {
      addExplosion(world, o.x + 8, o.y + 8, true);
    } else {
      survivors.push(o);
    }
  }
  world.tanks = survivors;
  const tank: Tank = {
    id: world.nextId++,
    kind: who === "p1" ? "player1" : "player2",
    owner: who,
    x,
    y,
    dir: DIR_UP,
    moving: false,
    level: 0,
    hp: 1,
    shieldUntilMs: performance.now() + PLAYER_SHIELD_MS,
    spawnAnimUntilMs: performance.now() + 600,
    reloadAtMs: 0,
    bonus: false,
    frozen: false,
    freezeUntilMs: 0,
    iceSlideDx: 0,
    iceSlideDy: 0,
    iceSlideRemaining: 0,
    nextDecideAt: 0,
    nextFireAt: 0,
  };
  world.tanks.push(tank);
}

function trySpawnEnemy(world: GameWorld, now: number): void {
  if (world.spawnCursor >= world.enemyQueue.length) return;
  if (countEnemiesOnField(world) >= MAX_ENEMIES_ONFIELD) return;
  if (now < world.nextSpawnAt) return;
  const rng = getRng(world);
  // 选未被占用的 spawn point
  const order = [0, 1, 2].sort(() => rng.next() - 0.5);
  let chosen = -1;
  for (const i of order) {
    const sp = ENEMY_SPAWN_POINTS[i];
    if (!sp) continue;
    if (isAreaClear(world, sp.x, sp.y)) {
      chosen = i;
      break;
    }
  }
  if (chosen < 0) return;
  const sp = ENEMY_SPAWN_POINTS[chosen]!;
  const kind = world.enemyQueue[world.spawnCursor] as TankKind;
  const isBonus = world.bonusFlags[world.spawnCursor] === true;
  const hp = kind === "power" ? 4 : 1;
  // 若 timer 道具 freeze 还没过期，新出生的敌坦克也要被冻住；FC 原版表现是一只
  // 蓝色冰冻坦克在 spawn 点 — 不能让它从队列里跳出来照常走动/开火。
  const frozenNow = now < world.freezeUntilMs;
  const tank: Tank = {
    id: world.nextId++,
    kind,
    owner: "enemy",
    x: sp.x,
    y: sp.y,
    dir: DIR_DOWN,
    moving: true,
    level: 0,
    hp,
    shieldUntilMs: now + ENEMY_SHIELD_MS,
    spawnAnimUntilMs: now + 600,
    reloadAtMs: now + 800,
    bonus: isBonus,
    frozen: frozenNow,
    freezeUntilMs: frozenNow ? world.freezeUntilMs : 0,
    iceSlideDx: 0,
    iceSlideDy: 0,
    iceSlideRemaining: 0,
    nextDecideAt: now + 200,
    nextFireAt: now + rngInt(rng, FIRE_COOLDOWN_ENEMY_MIN, FIRE_COOLDOWN_ENEMY_MAX),
  };
  world.tanks.push(tank);
  world.spawnCursor++;
  world.nextSpawnAt = now + SPAWN_INTERVAL_MS;
}

function isAreaClear(world: GameWorld, x: number, y: number): boolean {
  // 既要没坦克挡，又要地形可站。原版只查坦克 AABB——如果关卡 row 0 在 col
  // 0/6/12 写了 steel/water/brick (历史上 stage 7/18/22/24/26/29/31/33 都中过)，
  // 新坦克会落在墙里直接卡死。selfId=-1 因为还没生成；canTankBeAt 内部 if
  // (o.id === selfId) continue 跳不到我们。
  return canTankBeAt(world, x, y, -1);
}

function countEnemiesOnField(world: GameWorld): number {
  let n = 0;
  for (const t of world.tanks) if (t.owner === "enemy") n++;
  return n;
}

// 模块级单例 RNG 包装：以前每次 getRng() 都 new 一个闭包对象，AI 每个敌坦克
// 每帧都要拿 rng → 4 enemies × 60fps = 240 个临时闭包/秒。tick 是单线程串行，
// 用 _rngWorld 共享指针把 wrapper 复用掉，行为与旧版完全一致（mulberry32
// 内部 s 的增量 = world.rngState 的增量 = 0x6d2b79f5，序列等价）。
let _rngWorld: GameWorld | null = null;
const _sharedRng: { next: () => number } = {
  next(): number {
    const w = _rngWorld!;
    w.rngState = (w.rngState + 0x6d2b79f5) >>> 0;
    let t = w.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
};

function getRng(world: GameWorld) {
  _rngWorld = world;
  return _sharedRng;
}

function aabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// 检查 16x16 坦克 AABB 是否能放在 (x,y) 不冲突地形
function canTankBeAt(
  world: GameWorld,
  x: number,
  y: number,
  selfId: number,
): boolean {
  if (x < 0 || y < 0) return false;
  if (x + 16 > BATTLEFIELD || y + 16 > BATTLEFIELD) return false;
  // 检查 4 个角对应的半砖
  const corners = [
    [x, y],
    [x + 15, y],
    [x, y + 15],
    [x + 15, y + 15],
  ];
  for (const [cx, cy] of corners) {
    const tc = Math.floor((cx as number) / HALF);
    const tr = Math.floor((cy as number) / HALF);
    const tile = world.grid[tr * HALF_W + tc] as TileKind | undefined;
    if (tile === TILE_BRICK || tile === TILE_STEEL || tile === TILE_WATER || tile === TILE_BASE) {
      return false;
    }
  }
  // 检查与其他坦克碰撞
  for (const o of world.tanks) {
    if (o.id === selfId) continue;
    if (aabbOverlap(x, y, 16, 16, o.x, o.y, 16, 16)) return false;
  }
  return true;
}

function isOnIce(world: GameWorld, x: number, y: number): boolean {
  // 用中心点判断
  const cx = Math.floor((x + 8) / HALF);
  const cy = Math.floor((y + 8) / HALF);
  return world.grid[cy * HALF_W + cx] === TILE_ICE;
}

function moveTank(
  world: GameWorld,
  t: Tank,
  dir: Direction,
  speed: number,
): boolean {
  t.dir = dir;
  // 4-direction snap: 移动方向上 8px 网格对齐
  let nx = t.x;
  let ny = t.y;
  let dx = 0;
  let dy = 0;
  if (dir === DIR_UP) dy = -speed;
  else if (dir === DIR_DOWN) dy = speed;
  else if (dir === DIR_LEFT) dx = -speed;
  else if (dir === DIR_RIGHT) dx = speed;
  nx += dx;
  ny += dy;
  // 对齐：水平移动时 y 对齐 8px；垂直移动时 x 对齐 8px（FC 半砖单位）
  if (dx !== 0) {
    ny = Math.round(t.y / HALF) * HALF;
  } else {
    nx = Math.round(t.x / HALF) * HALF;
  }
  if (canTankBeAt(world, nx, ny, t.id)) {
    t.x = nx;
    t.y = ny;
    t.moving = true;
    return true;
  }
  // 卡墙时尝试仅在主方向轴上推进（让对齐生效，但不勉强通过墙）
  if (dx !== 0) {
    if (canTankBeAt(world, nx, t.y, t.id)) {
      t.x = nx;
      t.moving = true;
      return true;
    }
  } else {
    if (canTankBeAt(world, t.x, ny, t.id)) {
      t.y = ny;
      t.moving = true;
      return true;
    }
  }
  t.moving = false;
  return false;
}

function fireBullet(world: GameWorld, t: Tank, audio: AudioHook | null): void {
  const max = t.owner === "enemy" ? 1 : maxBulletsFor(t.level);
  // 玩家按住开火时 fireBullet 每 tick 都被调；用计数器代替 .filter 避免每帧
  // 分配一个临时数组 — 60fps × 玩家+AI ≈ 数百次/秒的小对象都能省。
  let ownerBullets = 0;
  for (const b of world.bullets) {
    if (b.ownerId === t.id) ownerBullets++;
  }
  if (ownerBullets >= max) return;
  const now = performance.now();
  if (now < t.reloadAtMs) return;
  t.reloadAtMs = now + FIRE_COOLDOWN_PLAYER;
  let bx = t.x + 8;
  let by = t.y + 8;
  if (t.dir === DIR_UP) by = t.y;
  else if (t.dir === DIR_DOWN) by = t.y + 16;
  else if (t.dir === DIR_LEFT) bx = t.x;
  else if (t.dir === DIR_RIGHT) bx = t.x + 16;
  const speed =
    t.level >= 1 ? BULLET_SPEED_FAST : BULLET_SPEED_BASE;
  const bullet: Bullet = {
    id: world.nextId++,
    ownerId: t.id,
    owner: t.owner,
    x: bx,
    y: by,
    dir: t.dir,
    speed,
    level: t.level,
  };
  world.bullets.push(bullet);
  if (audio && t.owner !== "enemy") audio.play("fire");
}

function processInputForPlayer(
  world: GameWorld,
  tank: Tank,
  input: InputState,
  audio: AudioHook | null,
): void {
  const isP1 = tank.kind === "player1";
  const up = isP1 ? input.p1Up : input.p2Up;
  const down = isP1 ? input.p1Down : input.p2Down;
  const left = isP1 ? input.p1Left : input.p2Left;
  const right = isP1 ? input.p1Right : input.p2Right;
  const fire = isP1 ? input.p1Fire : input.p2Fire;

  let dir: Direction | null = null;
  if (up) dir = DIR_UP;
  else if (down) dir = DIR_DOWN;
  else if (left) dir = DIR_LEFT;
  else if (right) dir = DIR_RIGHT;

  if (dir !== null) {
    moveTank(world, tank, dir, PLAYER_SPEED);
  } else {
    tank.moving = false;
  }
  // 冰面滑行：FC 经典 ≈4 半砖 (32px) 惯性，~40 帧 × 0.75 = 30px
  if (tank.moving && isOnIce(world, tank.x, tank.y)) {
    tank.iceSlideRemaining = 40;
    tank.iceSlideDx =
      tank.dir === DIR_LEFT ? -1 : tank.dir === DIR_RIGHT ? 1 : 0;
    tank.iceSlideDy = tank.dir === DIR_UP ? -1 : tank.dir === DIR_DOWN ? 1 : 0;
  }
  if (dir === null && tank.iceSlideRemaining > 0) {
    const nx = tank.x + tank.iceSlideDx * PLAYER_SPEED;
    const ny = tank.y + tank.iceSlideDy * PLAYER_SPEED;
    if (canTankBeAt(world, nx, ny, tank.id)) {
      tank.x = nx;
      tank.y = ny;
      tank.iceSlideRemaining--;
      tank.moving = true;
    } else {
      tank.iceSlideRemaining = 0;
    }
  }
  // FC 经典：按住开火持续发射（受 reloadAtMs + maxBullets 限制）
  if (fire) {
    fireBullet(world, tank, audio);
  }
}

function processAi(world: GameWorld, t: Tank, audio: AudioHook | null): void {
  if (t.frozen) {
    t.moving = false;
    return;
  }
  const now = performance.now();
  const rng = getRng(world);
  if (now >= t.nextDecideAt) {
    const baseX = 6 * TILE_SIZE;
    const baseY = 12 * TILE_SIZE;
    // 找一个玩家作为参考位置（双人时取最近的一个）
    let playerX: number | null = null;
    let playerY: number | null = null;
    let bestD = Infinity;
    for (const o of world.tanks) {
      if (o.owner !== "p1" && o.owner !== "p2") continue;
      const d = Math.abs(o.x - t.x) + Math.abs(o.y - t.y);
      if (d < bestD) {
        bestD = d;
        playerX = o.x;
        playerY = o.y;
      }
    }
    const target = pickEnemyTarget(t, baseX, baseY, playerX, playerY, rng);
    t.dir = dirToward(t.x, t.y, target.x, target.y, rng);
    t.nextDecideAt = now + rngInt(rng, 1500, 2500);
  }
  const moved = moveTank(world, t, t.dir, ENEMY_SPEED[t.kind]);
  if (!moved) {
    t.nextDecideAt = now + 600;
    // 卡墙强制换向
    const choices: Direction[] = [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    t.dir = rngPick(rng, choices) as Direction;
  }
  if (now >= t.nextFireAt) {
    fireBullet(world, t, audio);
    t.nextFireAt =
      now + rngInt(rng, FIRE_COOLDOWN_ENEMY_MIN, FIRE_COOLDOWN_ENEMY_MAX);
  }
}

function moveBullets(world: GameWorld, audio: AudioHook | null): void {
  const removed: Set<number> = new Set();
  for (const b of world.bullets) {
    if (b.dir === DIR_UP) b.y -= b.speed;
    else if (b.dir === DIR_DOWN) b.y += b.speed;
    else if (b.dir === DIR_LEFT) b.x -= b.speed;
    else if (b.dir === DIR_RIGHT) b.x += b.speed;
    // 出界
    if (
      b.x < 0 ||
      b.y < 0 ||
      b.x >= BATTLEFIELD ||
      b.y >= BATTLEFIELD
    ) {
      removed.add(b.id);
      addExplosion(world, b.x, b.y, false);
      if (audio) audio.play("hit");
      continue;
    }
    // 地形碰撞
    const hit = bulletHitTerrain(world, b);
    if (hit) {
      removed.add(b.id);
      addExplosion(world, b.x, b.y, false);
      if (audio) audio.play("hit");
    }
  }
  if (removed.size > 0) {
    world.bullets = world.bullets.filter((b) => !removed.has(b.id));
  }
  // 子弹-子弹：只在 player ↔ enemy 之间互消，p1-p2 是同阵营不能互相抵消
  // (双人 co-op 一起朝同方向打同一只敌坦克时，p1 和 p2 的子弹经过同一格
  //  就两发同归于尽，玩家眼里"打了个空炮"——FC 原版双人友军弹不互消)。
  const consumed: Set<number> = new Set();
  for (let i = 0; i < world.bullets.length; i++) {
    for (let j = i + 1; j < world.bullets.length; j++) {
      const a = world.bullets[i];
      const c = world.bullets[j];
      if (!a || !c) continue;
      if (a.owner === c.owner) continue;
      // 双方都是玩家阵营（p1/p2）— 同队，跳过互消
      if (a.owner !== "enemy" && c.owner !== "enemy") continue;
      if (Math.abs(a.x - c.x) < 6 && Math.abs(a.y - c.y) < 6) {
        consumed.add(a.id);
        consumed.add(c.id);
        addExplosion(world, a.x, a.y, false);
      }
    }
  }
  if (consumed.size > 0) {
    world.bullets = world.bullets.filter((b) => !consumed.has(b.id));
  }
  // 子弹-坦克
  resolveBulletTank(world, audio);
}

function addExplosion(
  world: GameWorld,
  x: number,
  y: number,
  big: boolean,
): void {
  world.explosions.push({
    id: world.nextId++,
    x,
    y,
    startedAt: performance.now(),
    big,
  });
}

function bulletHitTerrain(world: GameWorld, b: Bullet): boolean {
  const tc = Math.floor(b.x / HALF);
  const tr = Math.floor(b.y / HALF);
  if (tc < 0 || tr < 0 || tc >= HALF_W || tr >= HALF_H) return true;
  const tile = world.grid[tr * HALF_W + tc] as TileKind | undefined;
  if (tile === TILE_BRICK) {
    damageBrickAt(world, b);
    return true;
  }
  if (tile === TILE_STEEL) {
    if (b.level >= 3) {
      // 钢墙被打破：清除该半砖
      world.grid[tr * HALF_W + tc] = TILE_EMPTY;
    }
    return true;
  }
  if (tile === TILE_BASE) {
    world.baseAlive = false;
    addExplosion(world, b.x, b.y, true);
    return true;
  }
  return false;
}

function damageBrickAt(world: GameWorld, b: Bullet): void {
  const tc = Math.floor(b.x / HALF);
  const tr = Math.floor(b.y / HALF);
  // 8x8 半砖里再分 4 个 4x4 quadrant，按子弹方向破坏对应一侧
  // quadrant 索引: q=0 TL, q=1 TR, q=2 BL, q=3 BR
  // - 子弹 UP (向上飞，撞砖块下沿) → 破坏砖块下半 = BL+BR = q 2,3 = bits 0x4|0x8 = 0xc
  // - 子弹 DOWN (向下飞，撞砖块上沿) → 破坏砖块上半 = TL+TR = q 0,1 = bits 0x1|0x2 = 0x3
  // - 子弹 LEFT (向左飞，撞砖块右沿) → 破坏砖块右半 = TR+BR = q 1,3 = bits 0x2|0x8 = 0xa
  // - 子弹 RIGHT (向右飞，撞砖块左沿) → 破坏砖块左半 = TL+BL = q 0,2 = bits 0x1|0x4 = 0x5
  let mask = 0xf;
  if (b.dir === DIR_UP) mask = 0xc;
  else if (b.dir === DIR_DOWN) mask = 0x3;
  else if (b.dir === DIR_LEFT) mask = 0xa;
  else if (b.dir === DIR_RIGHT) mask = 0x5;
  const gc = tc >> 1;
  const gr = tr >> 1;
  const halfIdxInGrid = (tr & 1) * 2 + (tc & 1);
  const byteIdx = (gr * 13 + gc) * 2 + (halfIdxInGrid >= 2 ? 1 : 0);
  const isHigh = halfIdxInGrid % 2 !== 0;
  const cur = world.brickDamage[byteIdx] ?? 0;
  const oldNibble = isHigh ? (cur >> 4) & 0xf : cur & 0xf;
  const newNibble = (oldNibble | mask) & 0xf;
  const newByte = isHigh
    ? (cur & 0x0f) | (newNibble << 4)
    : (cur & 0xf0) | newNibble;
  world.brickDamage[byteIdx] = newByte;
  if (newNibble === 0xf) {
    world.grid[tr * HALF_W + tc] = TILE_EMPTY;
  }
}

function resolveBulletTank(world: GameWorld, audio: AudioHook | null): void {
  const removedBullets: Set<number> = new Set();
  // 用 Set 而非 Array，确保同 tick 多发子弹击中同一目标只算一次"击毙"
  const killedTankIds: Set<number> = new Set();
  const killedTanks: Tank[] = [];
  for (const b of world.bullets) {
    if (removedBullets.has(b.id)) continue;
    for (const t of world.tanks) {
      if (t.id === b.ownerId) continue;
      // 已经在本 tick 被击毙的坦克，后续子弹直接消耗但不再加分/扣命
      if (killedTankIds.has(t.id)) {
        if (aabbOverlap(b.x - 2, b.y - 2, 4, 4, t.x, t.y, 16, 16)) {
          removedBullets.add(b.id);
          addExplosion(world, b.x, b.y, false);
          if (audio) audio.play("hit");
          break;
        }
        continue;
      }
      // 同阵营不伤害（玩家对玩家、敌对敌）
      if (
        (b.owner === "p1" || b.owner === "p2") &&
        (t.owner === "p1" || t.owner === "p2")
      ) {
        continue;
      }
      if (b.owner === "enemy" && t.owner === "enemy") continue;
      if (!aabbOverlap(b.x - 2, b.y - 2, 4, 4, t.x, t.y, 16, 16)) continue;
      // 命中
      removedBullets.add(b.id);
      const now = performance.now();
      if (now < t.shieldUntilMs) {
        addExplosion(world, b.x, b.y, false);
        if (audio) audio.play("hit");
        break;
      }
      if (t.owner === "enemy") {
        const dropped = t.bonus;
        t.hp -= 1;
        if (t.hp <= 0) {
          killedTanks.push(t);
          killedTankIds.add(t.id);
          if (dropped) spawnRandomPowerUp(world);
          const owner = b.owner;
          const score = SCORES[t.kind];
          if (owner === "p1") {
            world.scoreP1 += score;
            (world.killsByKindP1 as any)[t.kind] += 1;
          } else if (owner === "p2") {
            world.scoreP2 += score;
            (world.killsByKindP2 as any)[t.kind] += 1;
          }
          world.floats.push({
            id: world.nextId++,
            x: t.x,
            y: t.y,
            value: score,
            startedAt: now,
          });
          world.enemyKilled++;
          addExplosion(world, t.x + 8, t.y + 8, true);
          if (audio) audio.play("explodeBig");
        } else {
          addExplosion(world, b.x, b.y, false);
          if (audio) audio.play("hit");
        }
      } else {
        // 玩家被击中（1 HP，必死）
        killedTanks.push(t);
        killedTankIds.add(t.id);
        addExplosion(world, t.x + 8, t.y + 8, true);
        if (audio) audio.play("explodeBig");
      }
      break;
    }
  }
  if (removedBullets.size > 0) {
    world.bullets = world.bullets.filter((b) => !removedBullets.has(b.id));
  }
  if (killedTanks.length > 0) {
    world.tanks = world.tanks.filter((t) => !killedTankIds.has(t.id));
    for (const t of killedTanks) {
      if (t.owner === "p1") {
        world.livesP1--;
        if (world.livesP1 > 0) spawnPlayer(world, "p1");
      } else if (t.owner === "p2") {
        world.livesP2--;
        if (world.livesP2 > 0) spawnPlayer(world, "p2");
      }
    }
  }
}

function spawnRandomPowerUp(world: GameWorld): void {
  const rng = getRng(world);
  const kind = rngPick(rng, POWER_KINDS) as PowerUpKind;
  // 战场随机位置
  let x = rngInt(rng, 0, 12) * TILE_SIZE;
  let y = rngInt(rng, 0, 12) * TILE_SIZE;
  // 避开基地
  if (x === 6 * TILE_SIZE && y === 12 * TILE_SIZE) {
    x = 4 * TILE_SIZE;
    y = 4 * TILE_SIZE;
  }
  const now = performance.now();
  world.powerUps.push({
    id: world.nextId++,
    kind,
    x,
    y,
    spawnedAt: now,
    expiresAt: now + POWER_UP_LIFETIME_MS,
  });
}

function resolveTankPickup(world: GameWorld, audio: AudioHook | null): void {
  const removed: Set<number> = new Set();
  const now = performance.now();
  for (const pu of world.powerUps) {
    if (now >= pu.expiresAt) {
      removed.add(pu.id);
      continue;
    }
    for (const t of world.tanks) {
      if (t.owner !== "p1" && t.owner !== "p2") continue;
      if (!aabbOverlap(pu.x, pu.y, 16, 16, t.x, t.y, 16, 16)) continue;
      applyPickup(world, t, pu.kind, audio);
      removed.add(pu.id);
      world.floats.push({
        id: world.nextId++,
        x: pu.x,
        y: pu.y,
        value: 500,
        startedAt: now,
      });
      if (t.owner === "p1") world.scoreP1 += 500;
      else world.scoreP2 += 500;
      break;
    }
  }
  if (removed.size > 0) {
    world.powerUps = world.powerUps.filter((p) => !removed.has(p.id));
  }
}

function applyPickup(
  world: GameWorld,
  t: Tank,
  kind: PowerUpKind,
  audio: AudioHook | null,
): void {
  const now = performance.now();
  if (audio) audio.play("pickup");
  switch (kind) {
    case "star":
      t.level = Math.min(3, t.level + 1) as 0 | 1 | 2 | 3;
      if (audio) audio.play("powerup");
      break;
    case "gun":
      t.level = 3;
      if (audio) audio.play("powerup");
      break;
    case "tank":
      if (t.owner === "p1") world.livesP1++;
      else world.livesP2++;
      break;
    case "grenade":
      grenadeClear(world, t.owner, audio);
      break;
    case "helmet":
      t.shieldUntilMs = now + HELMET_MS;
      break;
    case "shovel":
      shovelize(world, now + SHOVEL_MS);
      break;
    case "timer":
      world.freezeUntilMs = now + TIMER_MS;
      for (const o of world.tanks) {
        if (o.owner === "enemy") {
          o.frozen = true;
          o.freezeUntilMs = now + TIMER_MS;
        }
      }
      break;
  }
}

function grenadeClear(
  world: GameWorld,
  by: Owner,
  audio: AudioHook | null,
): void {
  const survivors: Tank[] = [];
  for (const t of world.tanks) {
    if (t.owner === "enemy") {
      addExplosion(world, t.x + 8, t.y + 8, true);
      const score = SCORES[t.kind];
      if (by === "p1") world.scoreP1 += score;
      else if (by === "p2") world.scoreP2 += score;
      world.enemyKilled++;
    } else {
      survivors.push(t);
    }
  }
  world.tanks = survivors;
  if (audio) audio.play("explodeBig");
}

function shovelize(world: GameWorld, restoreAt: number): void {
  world.shovelRestoreAt = restoreAt;
  // 把基地周围 8 个半砖位置改成 STEEL
  const baseHcSet = baseSurroundingHalfCells();
  for (const [hc, hr] of baseHcSet) {
    if (world.grid[hr * HALF_W + hc] !== TILE_BASE) {
      world.grid[hr * HALF_W + hc] = TILE_STEEL;
    }
  }
}

function baseSurroundingHalfCells(): Array<[number, number]> {
  // 基地在整砖 (6,12) → 半砖 (12,24)..(13,25)
  // 围绕半砖：(10..15) × (22..25) 减去基地本身
  const out: Array<[number, number]> = [];
  for (let hc = 10; hc <= 15; hc++) {
    for (let hr = 22; hr <= 25; hr++) {
      const isBase = hc >= 12 && hc <= 13 && hr >= 24 && hr <= 25;
      if (isBase) continue;
      out.push([hc, hr]);
    }
  }
  return out;
}

function restoreShovelIfExpired(world: GameWorld): void {
  if (world.shovelRestoreAt === 0) return;
  if (performance.now() < world.shovelRestoreAt) return;
  const cells = baseSurroundingHalfCells();
  for (const [hc, hr] of cells) {
    if (world.grid[hr * HALF_W + hc] === TILE_STEEL) {
      world.grid[hr * HALF_W + hc] = TILE_BRICK;
      // 清零该半砖对应的 quadrant 破损位（恢复成全新砖块）
      clearBrickDamageAtHalf(world, hc, hr);
    }
  }
  world.shovelRestoreAt = 0;
}

function clearBrickDamageAtHalf(world: GameWorld, hc: number, hr: number): void {
  const gc = hc >> 1;
  const gr = hr >> 1;
  const halfIdxInGrid = (hr & 1) * 2 + (hc & 1);
  const byteIdx = (gr * 13 + gc) * 2 + (halfIdxInGrid >= 2 ? 1 : 0);
  const isHigh = halfIdxInGrid % 2 !== 0;
  const cur = world.brickDamage[byteIdx] ?? 0;
  world.brickDamage[byteIdx] = isHigh ? cur & 0x0f : cur & 0xf0;
}

function thawFrozenEnemies(world: GameWorld): void {
  const now = performance.now();
  for (const t of world.tanks) {
    if (t.frozen && now >= t.freezeUntilMs) {
      t.frozen = false;
    }
  }
}

export function tick(
  world: GameWorld,
  input: InputState,
  audio: AudioHook | null,
): void {
  // frame 始终自增，让 PAUSE 闪烁 / Game Over 红字滚入 / 出生闪烁等动画在非 playing 状态也能继续
  world.frame++;
  if (world.status !== "playing") {
    if (audio) audio.setMoveActive(false);
    return;
  }
  const now = performance.now();
  // 出生护盾倒计时通过 shieldUntilMs 比较 now，无需 tick
  thawFrozenEnemies(world);
  restoreShovelIfExpired(world);

  // 输入处理：先动玩家
  for (const t of world.tanks) {
    if (t.owner === "p1" || t.owner === "p2") {
      processInputForPlayer(world, t, input, audio);
    }
  }
  // 移动音效（任一玩家移动）
  if (audio) {
    const anyMoving = world.tanks.some(
      (t) => (t.owner === "p1" || t.owner === "p2") && t.moving,
    );
    audio.setMoveActive(anyMoving);
  }

  // AI
  for (const t of world.tanks) {
    if (t.owner === "enemy") processAi(world, t, audio);
  }

  // spawn 敌人
  trySpawnEnemy(world, now);

  // 子弹
  moveBullets(world, audio);

  // 道具拾取
  resolveTankPickup(world, audio);

  // 清理过期 explosion / floats
  world.explosions = world.explosions.filter(
    (ex) => now - ex.startedAt < (ex.big ? 480 : 300),
  );
  world.floats = world.floats.filter((f) => now - f.startedAt < 700);

  // 关卡完成 / Game Over 判定
  if (!world.baseAlive) {
    triggerGameOver(world, audio);
    return;
  }
  const allPlayersDead =
    world.mode === "two-player"
      ? world.livesP1 <= 0 && world.livesP2 <= 0
      : world.livesP1 <= 0;
  if (allPlayersDead) {
    triggerGameOver(world, audio);
    return;
  }
  if (
    world.spawnCursor >= world.enemyQueue.length &&
    countEnemiesOnField(world) === 0
  ) {
    world.status = "stage-clear";
    world.stageClearAt = now;
    if (audio) audio.play("stageStart");
  }
}

function triggerGameOver(world: GameWorld, audio: AudioHook | null): void {
  if (world.status === "game-over") return;
  world.status = "game-over";
  // 记录 Game Over 起始时间，供 renderer 计算红字滚入动画
  world.stageClearAt = performance.now();
  if (audio) {
    audio.setMoveActive(false);
    audio.play("gameOver");
  }
}

export function togglePause(world: GameWorld, audio: AudioHook | null): void {
  if (world.status === "playing") {
    world.status = "paused";
    world.pausedAt = performance.now();
    if (audio) {
      audio.play("pause");
      audio.setMoveActive(false);
    }
  } else if (world.status === "paused") {
    // 引擎里所有定时器都用 performance.now() 当 absolute timestamp（shield、
    // reload、enemy freeze、powerup expires、shovel restore、nextSpawn 等）；
    // 暂停期间 wall clock 照常推进，恢复时一查全过期。把所有时间戳往后挪一个
    // 暂停时长，相当于 FC 的"暂停冻结"。visibility 自动暂停切回 tab 时这条路
    // 径尤其重要：用户可能离开 30s+。
    const delta = performance.now() - world.pausedAt;
    if (delta > 0) shiftTimersBy(world, delta);
    world.status = "playing";
    if (audio) audio.play("pause");
  }
}

function shiftTimersBy(world: GameWorld, delta: number): void {
  for (const t of world.tanks) {
    t.shieldUntilMs += delta;
    t.spawnAnimUntilMs += delta;
    t.reloadAtMs += delta;
    if (t.freezeUntilMs) t.freezeUntilMs += delta;
    t.nextDecideAt += delta;
    t.nextFireAt += delta;
  }
  for (const pu of world.powerUps) {
    pu.spawnedAt += delta;
    pu.expiresAt += delta;
  }
  for (const ex of world.explosions) ex.startedAt += delta;
  for (const f of world.floats) f.startedAt += delta;
  if (world.shovelRestoreAt) world.shovelRestoreAt += delta;
  if (world.freezeUntilMs) world.freezeUntilMs += delta;
  world.nextSpawnAt += delta;
  if (world.transitionUntilMs) world.transitionUntilMs += delta;
  // stageStartedAt 没人读；stageClearAt / pausedAt 不挪：前者只在 stage-clear /
  // game-over 状态用到，那时根本不会走暂停；后者下次进入 pause 时会被重置。
}

export function setMuted(world: GameWorld, audio: AudioHook | null, b: boolean): void {
  world.muted = b;
  if (audio) audio.setMuted(b);
}

export function emptyInput(): InputState {
  return createEmptyInput();
}

export function isStageBeaten(world: GameWorld): boolean {
  return world.status === "stage-clear";
}

export function isGameOver(world: GameWorld): boolean {
  return world.status === "game-over";
}

