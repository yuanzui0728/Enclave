#!/usr/bin/env node
// UI 风格统一 · 字阶/圆角 codemod：把 className 里的 magic-number 字号/圆角换成
// index.css 已定义的 --text-* / --radius-* token。
//
// 设计取舍（低回归优先）：
//   字号——在 scale 上的（11/12/14/15/17/22/28px）做「等值 token 化」零视觉变化；
//         另把两个最普遍的 off-by-one（13→caption 12 / 16→title 17）就近 snap，
//         这正是要消除的「乱跳一像素」。sub-11（10/9/8px 微标记）和大/罕见字号留手工。
//   圆角——只做等值 token 化（12/16/20/24 → sm/md/lg/xl）零视觉变化；
//         off-scale（8/10/14/18px）保留字面量——小 chip/图标块 snap 易过度圆角，留手工。
//
// 只匹配 className 内的 `text-[Npx]` / `rounded[-dir]-[Npx]`，天然不碰：
//   - `size={16}`（lucide 图标尺寸，非 class）
//   - `text-[color:var(...)]` / `text-[length:var(...)]`（已 token 化，无 \d+px）
//   - 中文注释里的「11px」散文（不是 `text-[11px]` 形态）
//
// 用法：node scripts/tokenize-scale-codemod.mjs [--apply]
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");

// px → token；缺省（不在表里）= 保留字面量
const TEXT_MAP = {
  11: "--text-eyebrow", // 11 等值
  12: "--text-caption", // 12 等值
  13: "--text-caption", // 13→12 snap（消 off-by-one）
  14: "--text-body", // 14 等值
  15: "--text-base", // 15 等值
  16: "--text-title", // 16→17 snap
  17: "--text-title", // 17 等值
  22: "--text-section", // 22 等值
  28: "--text-display", // 28 等值
  36: "--text-hero", // 36 等值
};
const RADIUS_MAP = {
  12: "--radius-sm",
  16: "--radius-md",
  20: "--radius-lg",
  24: "--radius-xl",
};

const RE_TEXT = /\btext-\[(\d+)px\]/g;
const RE_ROUNDED = /\b(rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|ee|es))?)-\[(\d+)px\]/g;

export function transformSource(src, sink) {
  let out = src;
  out = out.replace(RE_TEXT, (m, px) => {
    const tok = TEXT_MAP[+px];
    if (!tok) { sink?.skip(`text-[${px}px]`); return m; }
    sink?.hit();
    return `text-[length:var(${tok})]`;
  });
  out = out.replace(RE_ROUNDED, (m, util, px) => {
    const tok = RADIUS_MAP[+px];
    if (!tok) { sink?.skip(`${util}-[${px}px]`); return m; }
    sink?.hit();
    return `${util}-[var(${tok})]`;
  });
  return out;
}

const SKIP_FILE_SUBSTR = ["share-card-modal", "feed-post-share-card-modal"];

export function listTargetFiles() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  return execSync("git ls-tree -r --name-only HEAD apps/app/src", {
    encoding: "utf8",
    cwd: repoRoot,
  })
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !SKIP_FILE_SUBSTR.some((s) => f.includes(s)));
}

function main() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  let totalHits = 0;
  const skipped = new Map();
  const changed = [];
  for (const rel of listTargetFiles()) {
    const file = `${repoRoot}/${rel}`;
    let fileHits = 0;
    const sink = {
      hit: () => { fileHits++; totalHits++; },
      skip: (v) => skipped.set(v, (skipped.get(v) || 0) + 1),
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
  const skipArr = [...skipped.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n=== 保留字面量（off-scale，未替换）===`);
  for (const [v, c] of skipArr) console.log(`  ${String(c).padStart(3)}  ${v}`);
  console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"}: 替换 ${totalHits} 处 / ${changed.length} 文件。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
