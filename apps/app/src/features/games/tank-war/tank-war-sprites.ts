// 像素艺术定义：用 16x16 字符串行表达每像素的色板索引。
// 调色板贴近 FC 红白机原版色（雅达利 NES 调色板的近似 hex）。
//
// 字符表：' ' = 透明
// 大写字符 = 调色板键（见 PALETTE）

export const PALETTE: Record<string, string> = {
  // base
  K: "#000000", // black
  W: "#fcfcfc", // white
  G: "#7c7c7c", // gray
  D: "#3c3c3c", // dark gray
  // yellow (player 1)
  Y: "#ffe300", // bright yellow
  y: "#cd9a00", // dark yellow
  // green (player 2 / power tank green / tree)
  N: "#00a800", // emerald
  n: "#005800", // dark green
  // brick orange
  O: "#cc4824", // brick mid
  o: "#a02b1c", // brick dark
  P: "#fcc090", // brick highlight
  // steel blue/gray
  S: "#bcbcbc",
  s: "#7c7c7c",
  // ice
  I: "#bce8fc",
  i: "#5cbcfc",
  // water (animated frame 1)
  Q: "#0058f8",
  q: "#0000bc",
  // tree dark
  T: "#003800",
  // red (power 4hp / explosion / game over)
  R: "#fc0000",
  r: "#a01818",
  // bonus pickup background
  B: "#fcfcfc",
  // explosion orange
  E: "#fcb800",
  e: "#fc7800",
  // shadow purple
  V: "#6844fc",
  // base eagle accents
  X: "#a05030",
};

// 16x16 sprite rendered as 16 strings of 16 chars
export type Pixels = string[];

function p(rows: string[]): Pixels {
  if (rows.length !== 16) throw new Error("sprite rows != 16");
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] as string).length !== 16) {
      throw new Error(`sprite row ${i} length != 16`);
    }
  }
  return rows;
}

// ============================
//   TANK SPRITES — Player L1
// ============================
// FC 玩家坦克：黄色，履带 + 炮塔。我们做 4 个方向 × 2 帧（履带切换）。
// 颜色：Y=亮黄 y=暗黄

export const PLAYER1_L1_UP_A: Pixels = p([
  "  Y          Y  ",
  " yY    Y    Yy  ",
  " yY   YYY   Yy  ",
  " yY   YYY   Yy  ",
  " yY  YYYYY  Yy  ",
  " yYYYYYYYYYYYy  ",
  " yY YYYYYYY Yy  ",
  " yY YY Y YY Yy  ",
  " yY YYYYYYY Yy  ",
  " yY YYYYYYY Yy  ",
  " yY YY Y YY Yy  ",
  " yY YYYYYYY Yy  ",
  " yYYYYYYYYYYYy  ",
  " yY  YYYYY  Yy  ",
  " yY         Yy  ",
  "  y          y  ",
]);

export const PLAYER1_L1_UP_B: Pixels = p([
  "  y          y  ",
  " Yy    Y    yY  ",
  " Yy   YYY   yY  ",
  " Yy   YYY   yY  ",
  " Yy  YYYYY  yY  ",
  " YyYYYYYYYYYyY  ",
  " Yy YYYYYYY yY  ",
  " Yy YY Y YY yY  ",
  " Yy YYYYYYY yY  ",
  " Yy YYYYYYY yY  ",
  " Yy YY Y YY yY  ",
  " Yy YYYYYYY yY  ",
  " YyYYYYYYYYYyY  ",
  " Yy  YYYYY  yY  ",
  " Yy         yY  ",
  "  Y          Y  ",
]);

// Down: 倒转上下
function flipV(src: Pixels): Pixels {
  return [...src].reverse();
}
// 90 deg CW
function rotateCW(src: Pixels): Pixels {
  const n = src.length;
  const out: string[] = [];
  for (let r = 0; r < n; r++) {
    let line = "";
    for (let c = 0; c < n; c++) {
      line += (src[n - 1 - c] as string).charAt(r);
    }
    out.push(line);
  }
  return out;
}
function rotateCCW(src: Pixels): Pixels {
  return rotateCW(rotateCW(rotateCW(src)));
}

// ============================
//   Player L2/L3/L4 — 同形状不同颜色细节，简化：基础坦克 + 炮塔加宽
// ============================
// 为简化，玩家所有 level 用同一 sprite，仅炮口绘制和子弹尺寸不同；level >= 3 添加 highlight 边。
// 后续可在 baker 内做颜色变换。

// Player 2 = green
export function recolorPlayer2(src: Pixels): Pixels {
  // Y -> N, y -> n
  return src.map((row) =>
    row.replace(/Y/g, "N").replace(/y/g, "n"),
  );
}

export const PLAYER2_L1_UP_A = recolorPlayer2(PLAYER1_L1_UP_A);
export const PLAYER2_L1_UP_B = recolorPlayer2(PLAYER1_L1_UP_B);

// ============================
//   ENEMY TANKS — 4 种
// ============================
// 简化：用同一模板，不同颜色。底色 G(gray) 用于 light/fast，y(暗黄)+W 用于 armor，R/N/Q/G 随 HP 用于 power
// 实际 FC 不同 kind 有细节差异（履带、装甲、炮塔形状），我们用色板凸显类型。

export const ENEMY_BASE_UP_A: Pixels = p([
  "  G          G  ",
  " DG    G    GD  ",
  " DG   GGG   GD  ",
  " DG   GGG   GD  ",
  " DG  GGGGG  GD  ",
  " DGGGGGGGGGGGD  ",
  " DG GGGGGGG GD  ",
  " DG GG G GG GD  ",
  " DG GGGGGGG GD  ",
  " DG GGGGGGG GD  ",
  " DG GG G GG GD  ",
  " DG GGGGGGG GD  ",
  " DGGGGGGGGGGGD  ",
  " DG  GGGGG  GD  ",
  " DG         GD  ",
  "  D          D  ",
]);

export const ENEMY_BASE_UP_B: Pixels = p([
  "  D          D  ",
  " GD    G    DG  ",
  " GD   GGG   DG  ",
  " GD   GGG   DG  ",
  " GD  GGGGG  DG  ",
  " GDGGGGGGGGGDG  ",
  " GD GGGGGGG DG  ",
  " GD GG G GG DG  ",
  " GD GGGGGGG DG  ",
  " GD GGGGGGG DG  ",
  " GD GG G GG DG  ",
  " GD GGGGGGG DG  ",
  " GDGGGGGGGGGDG  ",
  " GD  GGGGG  DG  ",
  " GD         DG  ",
  "  G          G  ",
]);

function recolor(src: Pixels, mapping: Record<string, string>): Pixels {
  return src.map((row) => {
    let out = "";
    for (const ch of row) out += mapping[ch] ?? ch;
    return out;
  });
}

export const ENEMY_LIGHT_UP_A = ENEMY_BASE_UP_A;
export const ENEMY_LIGHT_UP_B = ENEMY_BASE_UP_B;

// Fast: 灰白快速 = 替换 G->W
export const ENEMY_FAST_UP_A = recolor(ENEMY_BASE_UP_A, { G: "W", D: "G" });
export const ENEMY_FAST_UP_B = recolor(ENEMY_BASE_UP_B, { G: "W", D: "G" });

// Armor: 黄装甲
export const ENEMY_ARMOR_UP_A = recolor(ENEMY_BASE_UP_A, { G: "Y", D: "y" });
export const ENEMY_ARMOR_UP_B = recolor(ENEMY_BASE_UP_B, { G: "Y", D: "y" });

// Power tank HP 颜色变化 + Bonus 红白闪烁 — 由 bake-sprites.ts 直接调 recolor 处理

// ============================
//   BULLET — 4×4 单色
// ============================
// 子弹：4x4 白色
export const BULLET_PIXELS: Pixels = (() => {
  const rows: string[] = [];
  for (let i = 0; i < 16; i++) rows.push("                ");
  rows[7] = "       WW       ";
  rows[8] = "      WWWW      ";
  rows[9] = "      WWWW      ";
  rows[10] = "       WW       ";
  return rows;
})();

// ============================
//   TERRAIN TILES — 8×8 半砖
// ============================
// 半砖单位 8x8 像素。每种地形定义一个 8x8 pattern。
// 我们用 8 行 8 字符。

export type HalfPixels = string[];

function h8(rows: string[]): HalfPixels {
  if (rows.length !== 8) throw new Error("half tile rows != 8");
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] as string).length !== 8) {
      throw new Error(`half tile row ${i} length != 8`);
    }
  }
  return rows;
}

// 砖块 (经典 FC 红砖)
export const BRICK_HALF: HalfPixels = h8([
  "OOOPOOOP",
  "oooKoooK",
  "OOOOOOOO",
  "KoooKooo",
  "OOOPOOOP",
  "oooKoooK",
  "OOOOOOOO",
  "KoooKooo",
]);

// 钢墙
export const STEEL_HALF: HalfPixels = h8([
  "SSSSSSSS",
  "SsssSsss",
  "SsssSsss",
  "SSSSSSSS",
  "SSSSSSSS",
  "SsssSsss",
  "SsssSsss",
  "SSSSSSSS",
]);

// 树丛
export const TREE_HALF: HalfPixels = h8([
  "NTNTNTNT",
  "TNTNTNTN",
  "NTNTNTNT",
  "TNTNTNTN",
  "NTNTNTNT",
  "TNTNTNTN",
  "NTNTNTNT",
  "TNTNTNTN",
]);

// 冰
export const ICE_HALF: HalfPixels = h8([
  "IIIIIIII",
  "IiIIIiII",
  "IIIIIIII",
  "iIIIIIIi",
  "IIIIIIII",
  "IIiIIIIi",
  "IIIIIIII",
  "iIIIIIII",
]);

// 水
export const WATER_HALF_A: HalfPixels = h8([
  "QQqQQqQQ",
  "QQQQQQQQ",
  "qQQqQQqQ",
  "QQQQQQQQ",
  "QQqQQqQQ",
  "QQQQQQQQ",
  "qQQqQQqQ",
  "QQQQQQQQ",
]);
export const WATER_HALF_B: HalfPixels = h8([
  "QqQQqQQq",
  "QQQQQQQQ",
  "QQqQQqQQ",
  "QQQQQQQQ",
  "QqQQqQQq",
  "QQQQQQQQ",
  "QQqQQqQQ",
  "QQQQQQQQ",
]);

// 基地：鹰 (16x16 整砖)
export const BASE_PIXELS: Pixels = p([
  "                ",
  "                ",
  "      KK        ",
  "     KKKK       ",
  "    KKWWKK      ",
  "   KKKWWKKK     ",
  "  KKKK WWKKKK   ",
  "  KKWWWWWWKK    ",
  "  KKWWWWWWKKK   ",
  "   KKWWWWWWKK   ",
  "    KKKWWKKK    ",
  "    KKKWWKKK    ",
  "     KKKKK      ",
  "      KKK       ",
  "                ",
  "                ",
]);

export const BASE_DESTROYED: Pixels = p([
  "                ",
  "                ",
  "                ",
  "    KK   KK     ",
  "    DD   DD     ",
  "   DDDD DDDD    ",
  "   DDDDDDDDD    ",
  "    DDDDDDD     ",
  "     DDDDD      ",
  "      DDD       ",
  "      DDD       ",
  "       D        ",
  "                ",
  "                ",
  "                ",
  "                ",
]);

// 出生闪烁动画 (16x16)
export const SPAWN_A: Pixels = p([
  "                ",
  "  W  W   W  W   ",
  "  WW WW WW WW   ",
  "                ",
  "   W   WW   W   ",
  "    W W  W W    ",
  "     W    W     ",
  "      W  W      ",
  "      W  W      ",
  "     W    W     ",
  "    W W  W W    ",
  "   W   WW   W   ",
  "                ",
  "  WW WW WW WW   ",
  "  W  W   W  W   ",
  "                ",
]);
export const SPAWN_B: Pixels = p([
  "                ",
  "                ",
  "    WW    WW    ",
  "   W  W  W  W   ",
  "  W    WW    W  ",
  "  W   W  W   W  ",
  "   W W    W W   ",
  "    W      W    ",
  "    W      W    ",
  "   W W    W W   ",
  "  W   W  W   W  ",
  "  W    WW    W  ",
  "   W  W  W  W   ",
  "    WW    WW    ",
  "                ",
  "                ",
]);

// 护盾 (16x16 outline)
export const SHIELD: Pixels = p([
  "                ",
  "                ",
  "   WW WW WW WW  ",
  "  W          W  ",
  "  W          W  ",
  "  W          W  ",
  "  W          W  ",
  "  W          W  ",
  "  W          W  ",
  "  W          W  ",
  "  W          W  ",
  "  W          W  ",
  "  W          W  ",
  "   WW WW WW WW  ",
  "                ",
  "                ",
]);

// 爆炸 3 帧
export const EXPLOSION_S1: Pixels = p([
  "                ",
  "                ",
  "      EE        ",
  "     EeeE       ",
  "    EeeeeE      ",
  "    EeeeeE      ",
  "     EeeE       ",
  "      EE        ",
  "                ",
  "                ",
  "                ",
  "                ",
  "                ",
  "                ",
  "                ",
  "                ",
]);
export const EXPLOSION_S2: Pixels = p([
  "                ",
  "    EE    EE    ",
  "   EeeE  EeeE   ",
  "  EeeeeEEeeeeE  ",
  "  EeeeeEEeeeeE  ",
  "   EEeeeeeeEE   ",
  "    EeeeeeeE    ",
  "    EeeeeeeE    ",
  "    EeeeeeeE    ",
  "    EeeeeeeE    ",
  "   EEeeeeeeEE   ",
  "  EeeeeEEeeeeE  ",
  "  EeeeeEEeeeeE  ",
  "   EeeE  EeeE   ",
  "    EE    EE    ",
  "                ",
]);
export const EXPLOSION_S3: Pixels = p([
  "RR  RR    RR  RR",
  "RR   RR  RR   RR",
  "  RR   EE   RR  ",
  "   RR EEEE RR   ",
  " RR  EeeeeE  RR ",
  "    EeeeeeeE    ",
  "   EeeeeeeeeE   ",
  " R EeeeeeeeeE R ",
  " R EeeeeeeeeE R ",
  "   EeeeeeeeeE   ",
  "    EeeeeeeE    ",
  " RR  EeeeeE  RR ",
  "   RR EEEE RR   ",
  "  RR   EE   RR  ",
  "RR   RR  RR   RR",
  "RR  RR    RR  RR",
]);

// ============================
//   POWER UPS (16x16)
// ============================
function withFrame(inner: Pixels): Pixels {
  // 边框+底色 (BB 白底)
  const rows: string[] = [];
  for (let r = 0; r < 16; r++) {
    const inner_row = inner[r] ?? "                ";
    let out = "";
    for (let c = 0; c < 16; c++) {
      const ch = inner_row.charAt(c);
      out += ch === " " ? "B" : ch;
    }
    rows.push(out);
  }
  // black border 1px
  const stamped: string[] = [];
  for (let r = 0; r < 16; r++) {
    let line = "";
    for (let c = 0; c < 16; c++) {
      if (r === 0 || r === 15 || c === 0 || c === 15) line += "K";
      else line += (rows[r] as string).charAt(c);
    }
    stamped.push(line);
  }
  return stamped as Pixels;
}

export const POWERUP_STAR = withFrame(
  p([
    "                ",
    "                ",
    "                ",
    "      KK        ",
    "     KKKK       ",
    "    KKKKKK      ",
    " KKKKKKKKKKKK   ",
    "  KKKKKKKKKK    ",
    "   KKKKKKKK     ",
    "    KKKKKK      ",
    "   KKKKKKKK     ",
    "  KKKK  KKKK    ",
    " KKK      KKK   ",
    "                ",
    "                ",
    "                ",
  ]),
);

export const POWERUP_TANK = withFrame(PLAYER1_L1_UP_A);

export const POWERUP_GRENADE = withFrame(
  p([
    "                ",
    "                ",
    "       KK       ",
    "      KDDK      ",
    "      KDDK      ",
    "     KKKKKK     ",
    "    KKDDDDKK    ",
    "    KDDDDDDK    ",
    "    KDDKKDDK    ",
    "    KDDKKDDK    ",
    "    KDDDDDDK    ",
    "    KKDDDDKK    ",
    "     KKKKKK     ",
    "                ",
    "                ",
    "                ",
  ]),
);

export const POWERUP_HELMET = withFrame(
  p([
    "                ",
    "                ",
    "     KKKKKK     ",
    "    KSSSSSSK    ",
    "   KSSSSSSSSK   ",
    "  KSSSSSSSSSSK  ",
    "  KSsssssssssK  ",
    "  KSsssssssssK  ",
    "  KSsssssssssK  ",
    "  KKKKKKKKKKKK  ",
    "    KK    KK    ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
  ]),
);

export const POWERUP_SHOVEL = withFrame(
  p([
    "                ",
    "                ",
    "       KK       ",
    "      KDDK      ",
    "      KDDK      ",
    "      KDDK      ",
    "      KDDK      ",
    "    KKDDDDKK    ",
    "   KDDDDDDDDK   ",
    "  KSSSSSSSSSSK  ",
    "  KSsssssssssK  ",
    "  KSsssssssssK  ",
    "  KKKKKKKKKKKK  ",
    "                ",
    "                ",
    "                ",
  ]),
);

export const POWERUP_TIMER = withFrame(
  p([
    "                ",
    "                ",
    "      KKKK      ",
    "     KQQQQK     ",
    "    KQQKKQQK    ",
    "   KQQK  KQQK   ",
    "   KQQ KK QQK   ",
    "   KQQ K  QQK   ",
    "   KQQ K  QQK   ",
    "   KQQK  KQQK   ",
    "    KQQQQQQK    ",
    "     KQQQQK     ",
    "      KKKK      ",
    "                ",
    "                ",
    "                ",
  ]),
);

export const POWERUP_GUN = withFrame(
  p([
    "                ",
    "                ",
    "        KK      ",
    "       KKKK     ",
    "      KKKKKKK   ",
    "     KKKKKKKKK  ",
    "    KKKKKKKKK   ",
    "   KKKKKKKK     ",
    "  KKKKKKKK      ",
    "  KKKKKKK       ",
    "  KKKKKK        ",
    "  KKKKK         ",
    "                ",
    "                ",
    "                ",
    "                ",
  ]),
);

export { flipV, rotateCW, rotateCCW, recolor };
