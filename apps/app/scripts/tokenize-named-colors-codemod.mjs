#!/usr/bin/env node
// UI 风格统一 · 命名色工具收敛：把 Tailwind 命名调色板工具（bg-white/text-white/
// bg-gray-100/text-emerald-600 …）收敛到语义 token。
//
// 为什么必须做：首轮 hex/rgba codemod 把 `text-[#333]` 这类换成 token（夜间变浅），
// 但同元素若 bg 还是命名 `bg-white`（夜间不变=仍白）→ 夜间浅字压白底=不可见。
// 必须把 bg-white 也→--surface-card（白天 --surface-card 就是 #fff，零视觉变化；
// 只在夜间随主题变深，与已 token 化的文字配对正确）。text-white→--text-on-brand
// 两主题都是 #fff，纯一致化零变化。
//
// 保留：纯 bg-black/text-black（有意纯黑）、bg-black/NN 半透明压暗（press 态，主题无关）。
// /opacity 修饰符（bg-white/84）保留——Tailwind v4 对 [color:var(--x)]/NN 走 color-mix 有效。
//
// 用法：node scripts/tokenize-named-colors-codemod.mjs [--apply]
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");

const NEUTRAL = new Set(["gray", "slate", "zinc", "neutral", "stone"]);
const FAM = {
  red: "danger", rose: "danger",
  orange: "warning", amber: "warning", yellow: "warning",
  green: "success", emerald: "success", lime: "success",
  teal: "info", cyan: "info", sky: "info", blue: "info", indigo: "info",
  violet: "brand", purple: "brand", fuchsia: "brand", pink: "brand",
};

function groupOf(util) {
  if (util === "text" || util === "caret" || util === "accent" || util === "decoration" || util === "placeholder") return "text";
  if (util === "bg" || util === "fill" || util === "from" || util === "via" || util === "to") return "bg";
  return "border"; // border*, ring, outline, divide, stroke
}

// 返回 token 字符串 或 null(保留原样)
function pickToken(util, family, shadeStr) {
  const g = groupOf(util);
  const shade = shadeStr ? +shadeStr : null;

  if (family === "white") {
    if (g === "text") return "--text-on-brand";
    if (g === "bg") return "--surface-card";
    return "--border-faint";
  }
  if (family === "black") return null; // 纯黑/压暗保留

  if (NEUTRAL.has(family)) {
    if (shade == null) return null;
    if (g === "text") {
      if (shade >= 800) return "--text-primary";
      if (shade >= 700) return "--text-secondary";
      if (shade >= 500) return "--text-muted";
      if (shade >= 300) return "--text-dim";
      return null; // 50-200 文字罕见，保留
    }
    if (g === "bg") {
      if (shade <= 200) return "--surface-soft";
      return null; // 中/深灰底多为有意，保留
    }
    // border
    if (shade <= 200) return "--border-subtle";
    if (shade <= 400) return "--border-strong";
    return null;
  }

  const fam = FAM[family];
  if (!fam) return null;
  if (fam === "brand") {
    if (g === "text") return "--brand-primary";
    if (g === "bg") return shade != null && shade >= 400 ? "--brand-primary" : "--brand-soft";
    return "--border-brand";
  }
  // danger/warning/success/info
  if (g === "text") return `--state-${fam}-text`;
  if (g === "bg") return shade != null && shade >= 400 ? `--state-${fam}-text` : `--state-${fam}-bg`;
  return `--state-${fam}-bg`;
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

const SKIP_FILE_SUBSTR = ["share-card-modal", "feed-post-share-card-modal"];

export function listTargetFiles() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  return execSync("git ls-tree -r --name-only HEAD apps/app/src", { encoding: "utf8", cwd: repoRoot })
    .split("\n").filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !f.includes("/features/games/")) // 游戏走 purpleize，命名色另算
    .filter((f) => !SKIP_FILE_SUBSTR.some((s) => f.includes(s)));
}

function main() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  let total = 0;
  const skipped = new Map();
  const changed = [];
  for (const rel of listTargetFiles()) {
    const file = `${repoRoot}/${rel}`;
    let hits = 0;
    const out = transformSource(readFileSync(file, "utf8"), {
      hit: () => { hits++; total++; },
      skip: (v) => skipped.set(v, (skipped.get(v) || 0) + 1),
    });
    if (hits > 0) { changed.push([file, hits]); if (APPLY) writeFileSync(file, out); }
  }
  changed.sort((a, b) => b[1] - a[1]);
  console.log("=== 替换文件（命中降序）===");
  for (const [file, hits] of changed) console.log(`  ${String(hits).padStart(3)}  ${file.replace(repoRoot + "/", "")}`);
  const sk = [...skipped.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n=== 保留（未映射，前30）===`);
  for (const [v, c] of sk.slice(0, 30)) console.log(`  ${String(c).padStart(3)}  ${v}`);
  console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"}: 替换 ${total} 处 / ${changed.length} 文件；保留 ${sk.length} 种。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
