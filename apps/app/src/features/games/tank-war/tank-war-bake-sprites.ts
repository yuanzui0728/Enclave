// 把字符画 sprite 一次性烘焙到 OffscreenCanvas，运行期用 drawImage 取，
// 避免每帧重新解释字符串。

import {
  PALETTE,
  PLAYER1_L1_UP_A,
  PLAYER1_L1_UP_B,
  PLAYER2_L1_UP_A,
  PLAYER2_L1_UP_B,
  ENEMY_LIGHT_UP_A,
  ENEMY_LIGHT_UP_B,
  ENEMY_FAST_UP_A,
  ENEMY_FAST_UP_B,
  ENEMY_ARMOR_UP_A,
  ENEMY_ARMOR_UP_B,
  ENEMY_BASE_UP_A,
  ENEMY_BASE_UP_B,
  BULLET_PIXELS,
  BRICK_HALF,
  STEEL_HALF,
  TREE_HALF,
  ICE_HALF,
  WATER_HALF_A,
  WATER_HALF_B,
  BASE_PIXELS,
  BASE_DESTROYED,
  SPAWN_A,
  SPAWN_B,
  SHIELD,
  EXPLOSION_S1,
  EXPLOSION_S2,
  EXPLOSION_S3,
  POWERUP_STAR,
  POWERUP_TANK,
  POWERUP_GRENADE,
  POWERUP_HELMET,
  POWERUP_SHOVEL,
  POWERUP_TIMER,
  POWERUP_GUN,
  flipV,
  rotateCW,
  rotateCCW,
  recolor,
  type Pixels,
  type HalfPixels,
} from "./tank-war-sprites";

export type CanvasOrOffscreen = HTMLCanvasElement;

function drawPixels(
  canvas: CanvasOrOffscreen,
  pixels: Pixels | HalfPixels,
  size: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  for (let r = 0; r < pixels.length; r++) {
    const row = pixels[r] as string;
    for (let c = 0; c < row.length; c++) {
      const ch = row.charAt(c);
      if (ch === " ") continue;
      const color = PALETTE[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(c, r, 1, 1);
    }
  }
}

function mkSprite(pixels: Pixels | HalfPixels, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  drawPixels(c, pixels, size);
  return c;
}

// 4 directions × 2 frames for a tank kind/level
export type TankDirSet = {
  up: [HTMLCanvasElement, HTMLCanvasElement];
  right: [HTMLCanvasElement, HTMLCanvasElement];
  down: [HTMLCanvasElement, HTMLCanvasElement];
  left: [HTMLCanvasElement, HTMLCanvasElement];
};

function bakeTankSet(upA: Pixels, upB: Pixels): TankDirSet {
  const downA = flipV(upA);
  const downB = flipV(upB);
  const leftA = rotateCCW(upA);
  const leftB = rotateCCW(upB);
  const rightA = rotateCW(upA);
  const rightB = rotateCW(upB);
  return {
    up: [mkSprite(upA, 16), mkSprite(upB, 16)],
    right: [mkSprite(rightA, 16), mkSprite(rightB, 16)],
    down: [mkSprite(downA, 16), mkSprite(downB, 16)],
    left: [mkSprite(leftA, 16), mkSprite(leftB, 16)],
  };
}

export type SpriteSheet = {
  player1: TankDirSet;
  player2: TankDirSet;
  enemyLight: TankDirSet;
  enemyFast: TankDirSet;
  enemyArmor: TankDirSet;
  enemyPower4: TankDirSet;
  enemyPower3: TankDirSet;
  enemyPower2: TankDirSet;
  enemyPower1: TankDirSet;
  bonusRed: TankDirSet;
  bonusWhite: TankDirSet;
  bullet: TankDirSet;
  brick: HTMLCanvasElement;
  steel: HTMLCanvasElement;
  tree: HTMLCanvasElement;
  ice: HTMLCanvasElement;
  waterA: HTMLCanvasElement;
  waterB: HTMLCanvasElement;
  base: HTMLCanvasElement;
  baseDestroyed: HTMLCanvasElement;
  spawnA: HTMLCanvasElement;
  spawnB: HTMLCanvasElement;
  shield: HTMLCanvasElement;
  explosionA: HTMLCanvasElement;
  explosionB: HTMLCanvasElement;
  explosionC: HTMLCanvasElement;
  powerUps: {
    star: HTMLCanvasElement;
    tank: HTMLCanvasElement;
    grenade: HTMLCanvasElement;
    helmet: HTMLCanvasElement;
    shovel: HTMLCanvasElement;
    timer: HTMLCanvasElement;
    gun: HTMLCanvasElement;
  };
};

function bakeBulletSet(): TankDirSet {
  // 子弹有 4 个方向变体（视觉上一致；FC 原版子弹其实是不同方向的"指向"标志）
  const up = BULLET_PIXELS;
  return {
    up: [mkSprite(up, 16), mkSprite(up, 16)],
    right: [mkSprite(rotateCW(up), 16), mkSprite(rotateCW(up), 16)],
    down: [mkSprite(flipV(up), 16), mkSprite(flipV(up), 16)],
    left: [mkSprite(rotateCCW(up), 16), mkSprite(rotateCCW(up), 16)],
  };
}

function bake8(pixels: HalfPixels): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  drawPixels(c, pixels, 8);
  return c;
}

function bake16(pixels: Pixels): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  drawPixels(c, pixels, 16);
  return c;
}

// 模块级缓存：TankWarGame 每次挂载都会 bakeSprites()，要 new 50+ HTMLCanvasElement
// + drawImage 一遍像素串字面量。用户在 /tabs/games 点 X 退出后再次点 tank-war
// 入口，TankWarGame 重新挂载就又跑一次（~10ms 帧抖 + 短期内存压力）。Sprite
// 全是模块常量、跟 world 无关，烘焙一次永久复用。
let _cachedSheet: SpriteSheet | null = null;

export function bakeSprites(): SpriteSheet {
  if (_cachedSheet) return _cachedSheet;
  _cachedSheet = bakeSpritesUncached();
  return _cachedSheet;
}

function bakeSpritesUncached(): SpriteSheet {
  // power tank 4 levels HP=4..1 颜色不同
  const powerUpsRecolor = (hp: number) => {
    const map =
      hp === 4
        ? { G: "R", D: "r" }
        : hp === 3
          ? { G: "N", D: "n" }
          : hp === 2
            ? { G: "Q", D: "q" }
            : { G: "G", D: "D" };
    return [recolor(ENEMY_BASE_UP_A, map), recolor(ENEMY_BASE_UP_B, map)] as [
      Pixels,
      Pixels,
    ];
  };
  const [p4a, p4b] = powerUpsRecolor(4);
  const [p3a, p3b] = powerUpsRecolor(3);
  const [p2a, p2b] = powerUpsRecolor(2);
  const [p1a, p1b] = powerUpsRecolor(1);

  return {
    player1: bakeTankSet(PLAYER1_L1_UP_A, PLAYER1_L1_UP_B),
    player2: bakeTankSet(PLAYER2_L1_UP_A, PLAYER2_L1_UP_B),
    enemyLight: bakeTankSet(ENEMY_LIGHT_UP_A, ENEMY_LIGHT_UP_B),
    enemyFast: bakeTankSet(ENEMY_FAST_UP_A, ENEMY_FAST_UP_B),
    enemyArmor: bakeTankSet(ENEMY_ARMOR_UP_A, ENEMY_ARMOR_UP_B),
    enemyPower4: bakeTankSet(p4a, p4b),
    enemyPower3: bakeTankSet(p3a, p3b),
    enemyPower2: bakeTankSet(p2a, p2b),
    enemyPower1: bakeTankSet(p1a, p1b),
    bonusRed: bakeTankSet(
      recolor(ENEMY_BASE_UP_A, { G: "R", D: "r" }),
      recolor(ENEMY_BASE_UP_B, { G: "R", D: "r" }),
    ),
    bonusWhite: bakeTankSet(
      recolor(ENEMY_BASE_UP_A, { G: "W", D: "G" }),
      recolor(ENEMY_BASE_UP_B, { G: "W", D: "G" }),
    ),
    bullet: bakeBulletSet(),
    brick: bake8(BRICK_HALF),
    steel: bake8(STEEL_HALF),
    tree: bake8(TREE_HALF),
    ice: bake8(ICE_HALF),
    waterA: bake8(WATER_HALF_A),
    waterB: bake8(WATER_HALF_B),
    base: bake16(BASE_PIXELS),
    baseDestroyed: bake16(BASE_DESTROYED),
    spawnA: bake16(SPAWN_A),
    spawnB: bake16(SPAWN_B),
    shield: bake16(SHIELD),
    explosionA: bake16(EXPLOSION_S1),
    explosionB: bake16(EXPLOSION_S2),
    explosionC: bake16(EXPLOSION_S3),
    powerUps: {
      star: bake16(POWERUP_STAR),
      tank: bake16(POWERUP_TANK),
      grenade: bake16(POWERUP_GRENADE),
      helmet: bake16(POWERUP_HELMET),
      shovel: bake16(POWERUP_SHOVEL),
      timer: bake16(POWERUP_TIMER),
      gun: bake16(POWERUP_GUN),
    },
  };
}
