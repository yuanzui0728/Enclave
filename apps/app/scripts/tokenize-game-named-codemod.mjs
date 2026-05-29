#!/usr/bin/env node
// UI 风格统一 · 游戏命名色收敛：features/games 下的 Tailwind 命名调色板工具
// （text-amber-600 / bg-emerald-300 / text-rose-500 …）全部收敛到品牌紫族——与
// tokenize-game-art 的 purpleize(hex→紫) 配套，让游戏 UI 不再彩虹。
//
// 与非游戏的 tokenize-named-colors 区别：那里彩色按语义分到 danger/success/info
// (仍保留红绿蓝)；游戏要「全部紫」，故所有彩色族一律→brand。中性灰/白照常按表，
// 纯黑/压暗保留。
//
// 用法：node scripts/tokenize-game-named-codemod.mjs [--apply]
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");
const NEUTRAL = new Set(["gray", "slate", "zinc", "neutral", "stone"]);
const COLORED = new Set([
  "red","rose","orange","amber","yellow","green","emerald","lime",
  "teal","cyan","sky","blue","indigo","violet","purple","fuchsia","pink",
]);

function groupOf(util) {
  if (util === "text" || util === "caret" || util === "accent" || util === "decoration" || util === "placeholder") return "text";
  if (util === "bg" || util === "fill" || util === "from" || util === "via" || util === "to") return "bg";
  return "border";
}

function pickToken(util, family, shadeStr) {
  const g = groupOf(util);
  const shade = shadeStr ? +shadeStr : null;
  if (family === "white") return g === "text" ? "--text-on-brand" : g === "bg" ? "--surface-card" : "--border-faint";
  if (family === "black") return null;
  if (NEUTRAL.has(family)) {
    if (shade == null) return null;
    if (g === "text") return shade >= 800 ? "--text-primary" : shade >= 700 ? "--text-secondary" : shade >= 500 ? "--text-muted" : shade >= 300 ? "--text-dim" : null;
    if (g === "bg") return shade <= 200 ? "--surface-soft" : null;
    return shade <= 200 ? "--border-subtle" : shade <= 400 ? "--border-strong" : null;
  }
  if (COLORED.has(family)) {
    // 全部彩色 → 品牌紫族
    if (g === "text") return "--brand-primary";
    if (g === "bg") return shade != null && shade >= 400 ? "--brand-primary" : "--brand-soft";
    return "--border-brand";
  }
  return null;
}

const UTIL = "bg|text|caret|accent|decoration|placeholder|fill|stroke|from|via|to|ring|outline|divide|border-[trblxy]|border";
const FAMILIES = "white|black|gray|slate|zinc|neutral|stone|red|rose|orange|amber|yellow|green|emerald|lime|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink";
const RE = new RegExp(`\\b(${UTIL})-(${FAMILIES})(?:-(\\d{2,3}))?(/\\d+)?\\b`, "g");

export function transformSource(src, sink) {
  return src.replace(RE, (m, util, family, shade, opacity) => {
    const tok = pickToken(util, family, shade);
    if (!tok) { sink?.skip?.(m); return m; }
    sink?.hit?.();
    return `${util}-[color:var(${tok})]${opacity || ""}`;
  });
}

export function listTargetFiles() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  return execSync("git ls-tree -r --name-only HEAD apps/app/src/features/games", { encoding: "utf8", cwd: repoRoot })
    .split("\n").filter(Boolean).filter((f) => /\.(ts|tsx)$/.test(f));
}

function main() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  let total = 0; const changed = [];
  for (const rel of listTargetFiles()) {
    const file = `${repoRoot}/${rel}`;
    let hits = 0;
    const out = transformSource(readFileSync(file, "utf8"), { hit: () => { hits++; total++; } });
    if (hits > 0) { changed.push([file, hits]); if (APPLY) writeFileSync(file, out); }
  }
  changed.sort((a, b) => b[1] - a[1]);
  for (const [file, hits] of changed) console.log(`  ${String(hits).padStart(3)}  ${file.replace(repoRoot + "/", "")}`);
  console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"}: 替换 ${total} 处 / ${changed.length} 文件。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
