import {
  BATTLEFIELD,
  HUD_X,
  HUD_WIDTH,
  HALF,
  LOGIC_HEIGHT,
  TILE_SIZE,
  MAX_ENEMIES_ONFIELD,
  POWER_UP_BLINK_MS,
} from "./tank-war-data";
import {
  TILE_BRICK,
  TILE_STEEL,
  TILE_TREE,
  TILE_ICE,
  TILE_WATER,
  TILE_BASE,
  type GameWorld,
  type Tank,
} from "./tank-war-types";
import { HALF_W, HALF_H } from "./tank-war-data";
import type { SpriteSheet, TankDirSet } from "./tank-war-bake-sprites";

const DIR_KEYS = ["up", "right", "down", "left"] as const;

function tankSet(world: GameWorld, t: Tank, sheet: SpriteSheet): TankDirSet {
  if (t.bonus) {
    return (world.frame >> 2) % 2 === 0 ? sheet.bonusRed : sheet.bonusWhite;
  }
  switch (t.kind) {
    case "player1":
      return sheet.player1;
    case "player2":
      return sheet.player2;
    case "light":
      return sheet.enemyLight;
    case "fast":
      return sheet.enemyFast;
    case "armor":
      return sheet.enemyArmor;
    case "power":
      if (t.hp >= 4) return sheet.enemyPower4;
      if (t.hp === 3) return sheet.enemyPower3;
      if (t.hp === 2) return sheet.enemyPower2;
      return sheet.enemyPower1;
    default:
      return sheet.enemyLight;
  }
}

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  sheet: SpriteSheet,
  layer: "ground" | "treesOnly",
): void {
  const waterFrame = (world.frame >> 4) % 2 === 0 ? sheet.waterA : sheet.waterB;
  for (let r = 0; r < HALF_H; r++) {
    for (let c = 0; c < HALF_W; c++) {
      const tile = world.grid[r * HALF_W + c];
      if (!tile) continue;
      if (layer === "ground" && tile === TILE_TREE) continue;
      if (layer === "treesOnly" && tile !== TILE_TREE) continue;
      const x = c * HALF;
      const y = r * HALF;
      switch (tile) {
        case TILE_BRICK: {
          // 每砖 16x16 由 2x2 半砖组成；每个 8x8 半砖再细分为 4 个 4x4 quadrant，
          // brickDamage 用 (r/2,c/2) 整砖 + quadrant idx 标记是否被打掉。
          drawBrickHalf(ctx, world, sheet, c, r, x, y);
          break;
        }
        case TILE_STEEL:
          ctx.drawImage(sheet.steel, x, y);
          break;
        case TILE_TREE:
          ctx.drawImage(sheet.tree, x, y);
          break;
        case TILE_ICE:
          ctx.drawImage(sheet.ice, x, y);
          break;
        case TILE_WATER:
          ctx.drawImage(waterFrame, x, y);
          break;
        case TILE_BASE:
          // base only drawn at canonical position once below
          break;
      }
    }
  }
}

function drawBrickHalf(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  sheet: SpriteSheet,
  hc: number,
  hr: number,
  x: number,
  y: number,
): void {
  // brickDamage 索引：以整砖坐标 (gc, gr) = (hc>>1, hr>>1) 存储，每整砖 16 个 4x4 quadrant (4x4)
  // 但我们存简化版：每整砖 4 个 quadrant 对应 4 个 8x8 半砖；进一步每半砖 4 个 4x4 quadrant
  // 共每整砖 16 bits。brickDamage 是 Uint8Array(GRID_W*GRID_H*2) 存 2 个 byte。
  const gc = hc >> 1;
  const gr = hr >> 1;
  const halfIdxInGrid = (hr & 1) * 2 + (hc & 1); // 0 TL, 1 TR, 2 BL, 3 BR
  const idx = (gr * 13 + gc) * 2 + (halfIdxInGrid >= 2 ? 1 : 0);
  const byte = world.brickDamage[idx] ?? 0;
  const nibble = halfIdxInGrid % 2 === 0 ? byte & 0xf : (byte >> 4) & 0xf;
  if (nibble === 0xf) return; // fully destroyed
  // 画完整 8x8 半砖
  ctx.drawImage(sheet.brick, x, y);
  if (nibble === 0) return;
  // 擦除被破坏的 4 个 4x4 quadrant
  ctx.fillStyle = "#000";
  for (let q = 0; q < 4; q++) {
    if (((nibble >> q) & 1) === 0) continue;
    const qx = x + (q & 1) * 4;
    const qy = y + ((q >> 1) & 1) * 4;
    ctx.fillRect(qx, qy, 4, 4);
  }
}

function drawTank(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  sheet: SpriteSheet,
  t: Tank,
): void {
  const set = tankSet(world, t, sheet);
  const dirKey = DIR_KEYS[t.dir] ?? "up";
  const frameIdx = t.moving ? (world.frame >> 1) % 2 : 0;
  const sprite = (set as any)[dirKey][frameIdx] as HTMLCanvasElement;
  const now = performance.now();
  if (now < t.spawnAnimUntilMs) {
    // 出生闪烁动画
    const blink = (world.frame >> 1) % 2 === 0 ? sheet.spawnA : sheet.spawnB;
    ctx.drawImage(blink, t.x, t.y);
    return;
  }
  ctx.drawImage(sprite, t.x, t.y);
  if (t.frozen) {
    ctx.fillStyle = "rgba(120, 200, 255, 0.4)";
    ctx.fillRect(t.x, t.y, 16, 16);
  }
  if (now < t.shieldUntilMs) {
    if ((world.frame >> 1) % 2 === 0) {
      ctx.drawImage(sheet.shield, t.x, t.y);
    }
  }
}

function drawBase(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  sheet: SpriteSheet,
): void {
  // 基地占整砖 (col=6, row=12)
  const x = 6 * TILE_SIZE;
  const y = 12 * TILE_SIZE;
  ctx.drawImage(world.baseAlive ? sheet.base : sheet.baseDestroyed, x, y);
}

function drawBullets(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  sheet: SpriteSheet,
): void {
  for (const b of world.bullets) {
    const dirKey = DIR_KEYS[b.dir] ?? "up";
    const sprite = (sheet.bullet as any)[dirKey][0] as HTMLCanvasElement;
    // 子弹 4x4 实体居中：sprite 是 16x16，但 BULLET_PIXELS 中只有中间 4x4 有内容
    ctx.drawImage(sprite, b.x - 8, b.y - 8);
  }
}

function drawPowerUps(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  sheet: SpriteSheet,
): void {
  const now = performance.now();
  for (const pu of world.powerUps) {
    const remaining = pu.expiresAt - now;
    if (remaining < POWER_UP_BLINK_MS && (world.frame >> 2) % 2 === 0) continue;
    const sprite = (sheet.powerUps as any)[pu.kind] as HTMLCanvasElement;
    ctx.drawImage(sprite, pu.x, pu.y);
  }
}

function drawExplosions(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  sheet: SpriteSheet,
): void {
  const now = performance.now();
  for (const ex of world.explosions) {
    const elapsed = now - ex.startedAt;
    const total = ex.big ? 480 : 300;
    if (elapsed >= total) continue;
    const frameIdx = ex.big
      ? elapsed < total * 0.33
        ? 0
        : elapsed < total * 0.66
          ? 1
          : 2
      : elapsed < total * 0.5
        ? 0
        : 1;
    const sprite =
      frameIdx === 0
        ? sheet.explosionA
        : frameIdx === 1
          ? sheet.explosionB
          : sheet.explosionC;
    ctx.drawImage(sprite, ex.x - 8, ex.y - 8);
  }
}

function drawFloats(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
): void {
  const now = performance.now();
  ctx.fillStyle = "#fff";
  ctx.font = "8px monospace";
  for (const f of world.floats) {
    const dt = now - f.startedAt;
    if (dt >= 700) continue;
    ctx.fillText(`${f.value}`, f.x, f.y - Math.floor(dt / 80));
  }
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  sheet: SpriteSheet,
): void {
  // HUD 背景：用 LOGIC_HEIGHT(224) 而非 BATTLEFIELD(208)，否则右侧 HUD 下沿
  // 会缺 16px 灰条 — 玩家眼里看到一截黑边贴着 HUD 柱子。
  ctx.fillStyle = "#7c7c7c";
  ctx.fillRect(HUD_X, 0, HUD_WIDTH, LOGIC_HEIGHT);
  ctx.fillStyle = "#000";
  ctx.font = "8px monospace";

  // 敌人剩余 icons
  const remaining = Math.max(
    0,
    world.enemyQueue.length -
      world.spawnCursor +
      enemiesOnField(world),
  );
  // 简化：直接显示数字
  const offsetX = HUD_X + 8;
  let lineY = 8;
  ctx.fillText("ENEMY", offsetX, lineY);
  lineY += 10;
  ctx.fillText(`x ${remaining}`, offsetX, lineY);
  lineY += 16;
  ctx.fillText(`STAGE`, offsetX, lineY);
  lineY += 10;
  ctx.fillText(`${world.stage}`, offsetX, lineY);
  lineY += 16;
  ctx.fillText("IP", offsetX, lineY);
  lineY += 10;
  drawSmallPlayer(ctx, sheet, offsetX, lineY, "player1");
  ctx.fillText(`x ${world.livesP1}`, offsetX + 18, lineY + 8);
  lineY += 24;
  if (world.mode === "two-player") {
    ctx.fillText("IIP", offsetX, lineY);
    lineY += 10;
    drawSmallPlayer(ctx, sheet, offsetX, lineY, "player2");
    ctx.fillText(`x ${world.livesP2}`, offsetX + 18, lineY + 8);
  }
}

function drawSmallPlayer(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  x: number,
  y: number,
  kind: "player1" | "player2",
): void {
  const set = kind === "player1" ? sheet.player1 : sheet.player2;
  ctx.drawImage(set.up[0], x, y);
}

function enemiesOnField(world: GameWorld): number {
  let n = 0;
  for (const t of world.tanks) {
    if (t.owner === "enemy") n++;
  }
  return Math.min(n, MAX_ENEMIES_ONFIELD);
}

function drawTransition(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
): void {
  const now = performance.now();
  const remaining = world.transitionUntilMs - now;
  if (remaining <= 0) return;
  // 30 帧上下擦除 (~500ms)
  const total = 500;
  const p = Math.max(0, Math.min(1, 1 - remaining / total));
  // p=0 完全黑，p=1 完全打开
  const half = (BATTLEFIELD / 2) * (1 - p);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, BATTLEFIELD, half);
  ctx.fillRect(0, BATTLEFIELD - half, BATTLEFIELD, half);
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: GameWorld | null,
  sheet: SpriteSheet | null,
): void {
  // 全局黑底
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 256, 224);
  if (!sheet) return;
  if (!world || world.status === "boot") {
    ctx.fillStyle = "#fff";
    ctx.font = "16px monospace";
    ctx.fillText("TANK WAR", 80, 110);
    ctx.font = "8px monospace";
    ctx.fillStyle = "#fcfcfc";
    ctx.fillText("PRESS START", 92, 134);
    return;
  }
  // 战场区
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, BATTLEFIELD, BATTLEFIELD);
  ctx.clip();

  drawTerrain(ctx, world, sheet, "ground");
  drawBase(ctx, world, sheet);
  drawPowerUps(ctx, world, sheet);
  for (const t of world.tanks) drawTank(ctx, world, sheet, t);
  drawBullets(ctx, world, sheet);
  drawTerrain(ctx, world, sheet, "treesOnly"); // 树丛盖在坦克上方
  drawExplosions(ctx, world, sheet);
  drawFloats(ctx, world);
  drawTransition(ctx, world);

  // PAUSE 闪烁
  if (world.status === "paused") {
    if ((world.frame >> 4) % 2 === 0) {
      ctx.fillStyle = "#fc0000";
      ctx.font = "16px monospace";
      ctx.fillText("PAUSE", BATTLEFIELD / 2 - 24, BATTLEFIELD / 2);
    }
  }

  // Game Over 红字从底部滚到中央 (~1.5s 线性，到达后停留)
  if (world.status === "game-over") {
    const startedAt = world.stageClearAt ?? performance.now();
    const dur = 1500;
    const t = Math.max(0, Math.min(1, (performance.now() - startedAt) / dur));
    const targetY = BATTLEFIELD / 2;
    const fromY = BATTLEFIELD - 8;
    const y = fromY + (targetY - fromY) * t;
    ctx.fillStyle = "#fc0000";
    ctx.font = "16px monospace";
    ctx.fillText("GAME", BATTLEFIELD / 2 - 32, y);
    ctx.fillText("OVER", BATTLEFIELD / 2 - 32, y + 16);
  }

  ctx.restore();

  drawHud(ctx, world, sheet);
}
