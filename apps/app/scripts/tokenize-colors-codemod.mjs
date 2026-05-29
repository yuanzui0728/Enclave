#!/usr/bin/env node
// UI 风格统一 · 颜色 codemod：把 Tailwind class 形态的硬编码颜色（hex / rgba）
// 收敛到 index.css 已定义的语义 token（brand/surface/text/border/state）。
//
// 与既有 derainbow-citrus-codemod.mjs 的区别：
//   1. 含 features/desktop（用户要求移动端+桌面端一起统一）。映射到 token 而非
//      硬编码紫——token 在 .yj-desktop-window 下解析回各自值（如 --brand-primary
//      在桌面=#07c160 绿），所以「桌面绿→var(--brand-primary)」是语义无变化的安全
//      替换，只去掉字面量；移动端则解析成紫。
//   2. 用 HSL 色相分类器把 235 个 distinct hex 归类（neutral→text/surface/border，
//      violet→brand，green→success，red→danger，amber→warning，blue→info），
//      配合 EXPLICIT 精确覆盖（品牌绿）和 KEEP 跳过集（海报深底/微信链接蓝/导图）。
//   3. 拿不准的 → FLAGGED 报告，人工裁决，绝不瞎猜。
//
// 游戏美术（features/games/**）收敛进品牌紫 ramp 是独立 pass（精灵多为 canvas/SVG
// 字面量，CSS var 不解析，需替成字面紫 hex），不在本脚本，由 tokenize-game-art 处理。
//
// 用法：node scripts/tokenize-colors-codemod.mjs [--apply]
//   缺省 dry-run，打印命中/FLAGGED/KEEP 统计；--apply 才写盘。
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");

// ── 工具分组：决定取哪个 token 变体（文字色/底色/描边色/渐变） ──────────────
const TEXT_UTILS = new Set(["text", "caret", "decoration", "accent", "placeholder"]);
const BG_UTILS = new Set(["bg", "fill"]);
const BORDER_UTILS = new Set([
  "border", "border-t", "border-b", "border-l", "border-r", "border-x", "border-y",
  "ring", "outline", "divide", "stroke",
]);
const GRADIENT_UTILS = new Set(["from", "via", "to"]);

function utilGroup(util) {
  if (TEXT_UTILS.has(util)) return "text";
  if (BG_UTILS.has(util)) return "bg";
  if (BORDER_UTILS.has(util)) return "border";
  if (GRADIENT_UTILS.has(util)) return "gradient";
  return "other";
}

// ── EXPLICIT：精确 hex（小写无#）→ token，先于色相分类器命中 ────────────────
// 品牌绿（桌面 --brand-primary 取值及其近邻）→ brand，避免被当成 success 绿。
const EXPLICIT = {
  "07c160": "--brand-primary",
  "06ad56": "--brand-primary",
  "06ad57": "--brand-primary",
  "14d86f": "--brand-primary",
  "1cd777": "--brand-primary",
  // 移动品牌紫精确值
  "7c5bd9": "--brand-primary",
  "9b7deb": "--brand-secondary",
  "c77dff": "--brand-accent",
  "8b7bf0": "--brand-primary",
};

// ── KEEP：保留字面量（有意的第三方/美术色，无对应 token 或 token 会破坏语义） ──
const KEEP_HEX = new Set([
  "576b95", // 微信链接蓝，刻意保留品牌识别
  "1f2533", "0a0c10", "0f1115", "0d0e12", "0b0b0c", "101013", "0f172a",
  "1f1f1f", "181818", "242424", "2a2a2a", "2b2b2b", "2c2c2c", "343434",
  "111111", // 海报/代码/深色画布底，非主题表面
]);

// 整文件跳过（html2canvas 导图：CSS var 不在 canvas 解析）
const SKIP_FILE_SUBSTR = [
  "share-card-modal",
  "feed-post-share-card-modal",
];

// ── HSL 分类器 ─────────────────────────────────────────────────────────────
function hexToHsl(hex) {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
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

function hueFamily(h) {
  if (h < 18 || h >= 345) return "red";
  if (h < 70) return "amber"; // 橙+黄 → warning/accent
  if (h < 165) return "green";
  if (h < 200) return "teal"; // 青/蓝绿 → 暧昧，FLAG
  if (h < 258) return "blue";
  if (h < 320) return "violet";
  return "pink"; // 品红 → 暧昧，FLAG
}

// 色相族 × 工具组 → token；返回 null 表示 FLAG
const CHROMATIC = {
  violet: { text: "--brand-primary", bg: "--brand-soft", border: "--border-brand", gradient: "--brand-primary", other: "--brand-primary" },
  green: { text: "--state-success-text", bg: "--state-success-bg", border: "--state-success-bg", gradient: null, other: "--state-success-text" },
  red: { text: "--state-danger-text", bg: "--state-danger-bg", border: "--state-danger-bg", gradient: null, other: "--state-danger-text" },
  amber: { text: "--state-warning-text", bg: "--state-warning-bg", border: "--state-warning-bg", gradient: null, other: "--state-warning-text" },
  blue: { text: "--state-info-text", bg: "--state-info-bg", border: "--state-info-bg", gradient: null, other: "--state-info-text" },
  teal: { text: null, bg: null, border: null, gradient: null, other: null },
  pink: { text: null, bg: null, border: null, gradient: null, other: null },
};

// 返回 {token} | {keep:true} | {flag:true}
function classifyHex(hex, group) {
  const lc = hex.toLowerCase();
  if (KEEP_HEX.has(lc)) return { keep: true };
  if (EXPLICIT[lc]) return { token: EXPLICIT[lc] };

  const { h, s, l } = hexToHsl(lc);

  // 极深色（不论 HSL 饱和度）按墨色处理：slate-900/#111827、深紫 #1c1430 等
  // 计算出的饱和度很高却本质是「黑字」，不能落到 info/brand。
  if (l < 0.2) {
    if (group === "text") return { token: "--text-primary" };
    if (group === "border") return { token: "--border-strong" };
    return { flag: true }; // 深色底 = 深表面/海报美术，人工裁决
  }

  // 近灰阶
  if (s < 0.12) {
    if (group === "text") {
      if (l < 0.22) return { token: "--text-primary" };
      if (l < 0.42) return { token: "--text-secondary" };
      if (l < 0.64) return { token: "--text-muted" };
      if (l < 0.88) return { token: "--text-dim" };
      return { token: "--text-on-brand" }; // 近白文字（多在品牌底上）
    }
    if (group === "bg") {
      if (l >= 0.93) return { token: "--surface-card" };
      if (l >= 0.82) return { token: "--surface-soft" };
      return { flag: true }; // 中/深灰底：多为美术/scrim
    }
    if (group === "border") {
      if (l >= 0.80) return { token: "--border-subtle" };
      if (l >= 0.55) return { token: "--border-strong" };
      return { flag: true };
    }
    if (group === "gradient") return { flag: true };
    return { flag: true };
  }

  // 彩色
  const fam = hueFamily(h);
  const tok = CHROMATIC[fam][group];
  return tok ? { token: tok } : { flag: true };
}

// ── rgba 显式表（覆盖高频）+ 分类器兜底 ─────────────────────────────────────
// key 为去空白小写的 rgba 串；值为 token / "KEEP" / "FLAG"。
const RGBA_EXPLICIT = {
  // 品牌紫 tint（移动 brand-soft=rgba(124,91,217,0.10)）
  "rgba(124,91,217,0.14)": "--brand-soft",
  "rgba(124,91,217,0.18)": "--brand-soft",
  "rgba(124,91,217,0.12)": "--brand-soft",
  "rgba(124,91,217,0.10)": "--brand-soft",
  "rgba(124,91,217,0.16)": "--brand-soft",
  "rgba(124,91,217,0.24)": "--brand-soft",
  "rgba(124,91,217,0.22)": "--brand-soft",
  "rgba(124,91,217,0.07)": "--brand-soft",
  // 紫调描边（mobile --border-*: rgba(76,40,130,α)）
  "rgba(60,40,110,0.02)": "--border-faint",
  "rgba(60,40,110,0.03)": "--border-faint",
  "rgba(60,40,110,0.035)": "--border-faint",
  "rgba(60,40,110,0.045)": "--border-faint",
  "rgba(60,40,110,0.05)": "--border-faint",
  "rgba(60,40,110,0.06)": "--border-faint",
  "rgba(60,40,110,0.08)": "--border-subtle",
  "rgba(60,40,110,0.14)": "--border-strong",
  // slate 描边（desktop --border-*: rgba(15,23,42,α)）
  "rgba(15,23,42,0.04)": "--border-faint",
  "rgba(15,23,42,0.05)": "--border-faint",
  "rgba(15,23,42,0.06)": "--border-faint",
  "rgba(15,23,42,0.08)": "--border-subtle",
  "rgba(15,23,42,0.10)": "--border-strong",
  // danger 底（rgba(220,38,38,α) / rgba(239,68,68,α)）
  "rgba(220,38,38,0.08)": "--state-danger-bg",
  "rgba(220,38,38,0.14)": "--state-danger-bg",
  "rgba(220,38,38,0.18)": "--state-danger-bg",
  "rgba(239,68,68,0.10)": "--state-danger-bg",
  "rgba(239,68,68,0.12)": "--state-danger-bg",
  "rgba(254,242,242,0.96)": "--state-danger-bg",
  "rgba(254,242,242,0.92)": "--state-danger-bg",
  "rgba(255,245,245,0.96)": "--state-danger-bg",
  "rgba(225,29,72,0.06)": "--state-danger-bg",
  // success 底
  "rgba(22,163,74,0.14)": "--state-success-bg",
  "rgba(34,197,94,0.14)": "--state-success-bg",
  "rgba(47,122,63,0.12)": "--state-success-bg",
  "rgba(134,181,96,0.14)": "--state-success-bg",
  // info 底
  "rgba(96,165,250,0.16)": "--state-info-bg",
  "rgba(59,130,246,0.12)": "--state-info-bg",
  "rgba(59,130,246,0.14)": "--state-info-bg",
  "rgba(59,130,246,0.16)": "--state-info-bg",
  // warning 底
  "rgba(180,132,23,0.12)": "--state-warning-bg",
  // desktop 浅表面（rgba(247,250,250,α) / 近白分组底）
  "rgba(247,250,250,0.88)": "--surface-shell",
  "rgba(247,250,250,0.92)": "--surface-shell",
  "rgba(247,250,250,0.72)": "--surface-shell",
  "rgba(247,250,250,0.62)": "--surface-shell",
  "rgba(242,246,245,0.76)": "--surface-shell",
  "rgba(245,248,247,0.96)": "--surface-section",
  "rgba(244,247,246,0.98)": "--surface-section",
  // 纯黑/深底 scrim 与纯白浮层：保留（无对应 token，刻意半透明）
  "rgba(0,0,0,0.02)": "KEEP", "rgba(0,0,0,0.03)": "KEEP", "rgba(0,0,0,0.04)": "KEEP",
  "rgba(0,0,0,0.045)": "KEEP", "rgba(0,0,0,0.06)": "KEEP",
  "rgba(17,24,39,0.28)": "KEEP", "rgba(17,24,39,0.32)": "KEEP",
  "rgba(17,24,39,0.42)": "KEEP", "rgba(17,24,39,0.45)": "KEEP",
  "rgba(2,6,23,0.44)": "KEEP",
  "rgba(255,255,255,0.62)": "KEEP", "rgba(255,255,255,0.78)": "KEEP",
  "rgba(255,255,255,0.85)": "KEEP", "rgba(255,255,255,0.94)": "KEEP",
  "rgba(148,163,184,0.45)": "KEEP", // slate scrim 描边
  "rgba(71,85,105,0.16)": "KEEP",
};

function normRgba(s) {
  return s.replace(/\s+/g, "").toLowerCase();
}

// 把 rgba(r,g,b,a) 解析出 r,g,b（兜底分类用）
function rgbaParts(s) {
  const m = normRgba(s).match(/rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

function toHex2(n) {
  return n.toString(16).padStart(2, "0");
}

function classifyRgba(raw, group) {
  const key = normRgba(raw);
  if (RGBA_EXPLICIT[key] !== undefined) {
    const v = RGBA_EXPLICIT[key];
    if (v === "KEEP") return { keep: true };
    if (v === "FLAG") return { flag: true };
    return { token: v };
  }

  const p = rgbaParts(raw);
  if (!p) return { flag: true };
  // 纯黑/纯白半透明一律保留（scrim/浮层）
  if ((p.r === 0 && p.g === 0 && p.b === 0) || (p.r === 255 && p.g === 255 && p.b === 255)) {
    return { keep: true };
  }

  const hex = `${toHex2(p.r)}${toHex2(p.g)}${toHex2(p.b)}`;
  const { h, s, l } = hexToHsl(hex);

  // 近灰阶半透明
  if (s < 0.12) {
    if (group === "text") return classifyHex(hex, "text");
    if (group === "border") return l >= 0.55 ? { token: "--border-subtle" } : { keep: true };
    if (group === "bg") {
      if (l >= 0.85) return { token: "--surface-soft" };
      return { keep: true }; // 中/深灰半透明 = scrim / 深表面，保留
    }
    return { keep: true };
  }

  // 彩色半透明 → 语义状态 token（描边也用 -bg 这个半透明 tint）
  const fam = hueFamily(h);
  if (fam === "teal" || fam === "pink") return { flag: true };
  if (group === "text") {
    const t = CHROMATIC[fam].text;
    return t ? { token: t } : { flag: true };
  }
  if (group === "bg" || group === "border") {
    if (fam === "violet") return { token: group === "border" ? "--border-brand" : "--brand-soft" };
    const t = CHROMATIC[fam].bg;
    return t ? { token: t } : { flag: true };
  }
  return { flag: true };
}

// ── 替换主体 ───────────────────────────────────────────────────────────────
const UTIL_ALT =
  "bg|text|caret|decoration|accent|placeholder|fill|stroke|ring|outline|divide|from|via|to|border-[trblxy]|border";

// bg-[#abc123] / text-[#abc123]（不含 /opacity 后缀的简单形态；带后缀 FLAG 留待人工）
const RE_HEX = new RegExp(`\\b(${UTIL_ALT})-\\[(?:color:)?#([0-9a-fA-F]{6})\\](?!/)`, "g");
const RE_HEX_OPACITY = new RegExp(`\\b(${UTIL_ALT})-\\[(?:color:)?#[0-9a-fA-F]{6}\\]/\\d+`, "g");
const RE_RGBA = new RegExp(`\\b(${UTIL_ALT})-\\[(?:color:)?(rgba?\\([^\\]]*\\))\\]`, "g");

export function transformSource(src, sink) {
  // sink: {flag(value,group), keepHit(), hit()} 用于报告统计
  let out = src;

  out = out.replace(RE_HEX, (m, util, hex) => {
    const r = classifyHex(hex, utilGroup(util));
    if (r.keep) { sink?.keepHit(); return m; }
    if (r.flag) { sink?.flag(`#${hex.toLowerCase()}`, util); return m; }
    sink?.hit();
    return `${util}-[color:var(${r.token})]`;
  });

  out = out.replace(RE_RGBA, (m, util, rgba) => {
    const r = classifyRgba(rgba, utilGroup(util));
    if (r.keep) { sink?.keepHit(); return m; }
    if (r.flag) { sink?.flag(normRgba(rgba), util); return m; }
    sink?.hit();
    return `${util}-[color:var(${r.token})]`;
  });

  // 带 /opacity 后缀的 hex：只记 FLAG，不动（var()+opacity 修饰符在 Tailwind v4 不可靠）
  let mm;
  while ((mm = RE_HEX_OPACITY.exec(out)) !== null) {
    sink?.flag(`${mm[0]} (/opacity)`, mm[1]);
  }

  return out;
}

export function listTargetFiles() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  return execSync("git ls-tree -r --name-only HEAD apps/app/src", {
    encoding: "utf8",
    cwd: repoRoot,
  })
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !f.includes("/features/games/")) // 游戏美术独立 pass
    .filter((f) => !SKIP_FILE_SUBSTR.some((s) => f.includes(s)));
}

function main() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  let totalHits = 0;
  let totalKeep = 0;
  const flagged = new Map(); // value → {count, utils:Set}
  const changed = [];

  for (const rel of listTargetFiles()) {
    const file = `${repoRoot}/${rel}`;
    let fileHits = 0;
    const sink = {
      hit: () => { fileHits++; totalHits++; },
      keepHit: () => { totalKeep++; },
      flag: (value, util) => {
        const e = flagged.get(value) || { count: 0, utils: new Set() };
        e.count++; e.utils.add(util); flagged.set(value, e);
      },
    };
    const out = transformSource(readFileSync(file, "utf8"), sink);
    if (fileHits > 0) {
      changed.push([file, fileHits]);
      if (APPLY) writeFileSync(file, out);
    }
  }

  changed.sort((a, b) => b[1] - a[1]);
  console.log("=== 替换文件（命中数 降序）===");
  for (const [file, hits] of changed) {
    console.log(`  ${String(hits).padStart(3)}  ${file.replace(repoRoot + "/", "")}`);
  }

  const flagArr = [...flagged.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`\n=== FLAGGED（未替换，人工裁决）${flagArr.length} 个 distinct 值 ===`);
  for (const [value, e] of flagArr) {
    console.log(`  ${String(e.count).padStart(3)}  ${value}   [${[...e.utils].join(",")}]`);
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY-RUN"}: 替换 ${totalHits} 处 / ${changed.length} 文件；` +
    `KEEP ${totalKeep} 处；FLAGGED ${flagArr.length} 种值。`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
