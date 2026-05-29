#!/usr/bin/env node
// UI 风格统一 · 游戏美术收敛：把 features/games 下的多色美术（农场作物/坦克精灵/
// 游戏卡主题色）色相统一到品牌紫(≈256°)，保留各自的明度/饱和度结构 → 形状/明暗
// 仍可读，但整体落到品牌紫色系，消除「彩虹游戏」。
//
// 为何不走 token：精灵多是 canvas/SVG 字面量（JS 调色板、fill 串），CSS var 不解析，
// 必须替成字面紫 hex。中性黑/白（饱和度 0）天然保留——purpleize 只改色相不动 S/L。
//
// 处理三种形态：#RRGGBB / #RGB / rgba(r,g,b,a)（rgba 保留 alpha）。
// 用法：node scripts/tokenize-game-art-codemod.mjs [--apply]
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");
const BRAND_HUE = 256; // #7c5bd9 的色相
const SAT_CAP = 0.62; // 品牌紫饱和度上限

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

const hx = (n) => n.toString(16).padStart(2, "0");

// 任意 (r,g,b) → 品牌紫色相、原 S(限幅)/L 的 (r,g,b)
function purpleizeRgb(r, g, b) {
  const { s, l } = rgbToHsl(r, g, b);
  return hslToRgb(BRAND_HUE, Math.min(s, SAT_CAP), l);
}

function expand3(hex3) {
  return hex3.split("").map((c) => c + c).join("");
}

export function transformSource(src, sink) {
  let out = src;
  // #RRGGBB —— 用负向前瞻而非 \b：Tailwind 渐变用下划线分隔(#214c33_0%)，
  // `3` 与 `_` 都是 \w，\b 不成立会漏掉渐变里的色；lookahead 对 _/%/,/] 一视同仁。
  out = out.replace(/#([0-9a-fA-F]{6})(?![0-9a-fA-F])/g, (m, h) => {
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const [R, G, B] = purpleizeRgb(r, g, b);
    sink?.hit();
    return `#${hx(R)}${hx(G)}${hx(B)}`;
  });
  // #RGB（上面已先吃 6 位；lookahead 防把 6 位的前 3 位再当 3 位处理）
  out = out.replace(/#([0-9a-fA-F]{3})(?![0-9a-fA-F])/g, (m, h3) => {
    const h = expand3(h3);
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const [R, G, B] = purpleizeRgb(r, g, b);
    sink?.hit();
    return `#${hx(R)}${hx(G)}${hx(B)}`;
  });
  // rgba(r,g,b,a) / rgb(r,g,b) — 保留 alpha
  out = out.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (m, r, g, b, a) => {
    const [R, G, B] = purpleizeRgb(+r, +g, +b);
    sink?.hit();
    return a === undefined ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${a})`;
  });
  return out;
}

export function listTargetFiles() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  return execSync("git ls-tree -r --name-only HEAD apps/app/src/features/games", {
    encoding: "utf8",
    cwd: repoRoot,
  })
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f));
}

function main() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  let total = 0;
  const changed = [];
  for (const rel of listTargetFiles()) {
    const file = `${repoRoot}/${rel}`;
    let hits = 0;
    const out = transformSource(readFileSync(file, "utf8"), { hit: () => { hits++; total++; } });
    if (hits > 0) {
      changed.push([file, hits]);
      if (APPLY) writeFileSync(file, out);
    }
  }
  changed.sort((a, b) => b[1] - a[1]);
  for (const [file, hits] of changed) {
    console.log(`  ${String(hits).padStart(3)}  ${file.replace(repoRoot + "/", "")}`);
  }
  console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"}: 收敛 ${total} 处颜色 / ${changed.length} 文件。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
