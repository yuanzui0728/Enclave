#!/usr/bin/env node
// 世界改造 P3 去彩虹 codemod（Batch 1）：把 Tailwind class 形态的硬编码 citrus
// hex（bg/text/border/ring/fill/stroke）换成语义 token var(--brand-*)。
//
// 为什么映射到 token 而非硬编码紫：共享组件在桌面端也渲染，token 会各自解析
// （移动 .yj-mobile-shell=紫 / 桌面=各自值），守住「桌面不换紫」红线；硬编码紫
// 会把紫泄漏到桌面。features/desktop 与 desktop-* 路由（桌面专属）整体排除。
//
// rgba(citrus,α) 渐变 / 品牌渐变留待 Batch 2（需 color-mix + 上下文判断）。
//
// 用法：node scripts/derainbow-citrus-codemod.mjs [--apply]
//   缺省 dry-run，只打印将改动的文件与计数；--apply 才写盘。
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");

// citrus hex → 语义 token
// 注意：#3b2206（旧 citrus 的 --text-on-brand 值）故意不在此表——它既用作
// brand 底上的按钮文字(该是白)，也用作浅底深棕标题(该留深)，无法一刀切；
// 留原值即可（深棕在紫底上 ~3.57 对比，粗体按钮可读；浅底标题正确）。
const HEX_TO_TOKEN = {
  f59e0b: "--brand-primary",
  f97316: "--brand-primary",
  fb923c: "--brand-primary",
  fdba74: "--brand-primary",
  b45309: "--brand-primary", // amber-700 文字
  d97706: "--brand-primary", // amber-600 hover/active
  "9a5a0a": "--brand-primary", // 深琥珀文字
  "92400e": "--brand-primary", // amber-800
  d48806: "--brand-primary",
  a16207: "--brand-primary",
  ca8a04: "--brand-primary",
  ea580c: "--brand-primary",
  "84cc16": "--brand-secondary",
  a3e635: "--brand-secondary",
  "65a30d": "--brand-secondary",
  "4d7c0f": "--brand-secondary",
  facc15: "--brand-accent",
  fbbf24: "--brand-accent",
  fde047: "--brand-accent",
  eab308: "--brand-accent",
};

// 只处理这些明确取颜色的 Tailwind 工具（都接受 [color:var(--x)] 提示）
const UTILS = "bg|text|border|ring|fill|stroke|outline|caret|accent|decoration|divide";
const hexAlt = Object.keys(HEX_TO_TOKEN).join("|");
// 形如 bg-[#f59e0b] / text-[#b45309]（不含 /opacity 后缀的简单形态）
const RE = new RegExp(`\\b(${UTILS})-\\[#(${hexAlt})\\]`, "g");

// 可复用的纯函数：对源码字符串做去彩虹替换，返回 [新串, 命中数]。
// commit 脚本会拿它对 HEAD 版内容做同样变换，生成「只含我的改动」的 blob。
export function transformSource(src) {
  let hits = 0;
  const out = src.replace(RE, (_m, util, hex) => {
    hits++;
    return `${util}-[color:var(${HEX_TO_TOKEN[hex]})]`;
  });
  return [out, hits];
}

// 收集目标文件：apps/app/src 下 tracked 的 .ts/.tsx，排除桌面专属。
export function listTargetFiles() {
  const repoRoot = execSync("git rev-parse --show-toplevel", {
    encoding: "utf8",
  }).trim();
  return execSync("git ls-files apps/app/src", { encoding: "utf8", cwd: repoRoot })
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !f.includes("/features/desktop/"))
    .filter((f) => !/\/routes\/desktop-[^/]+$/.test(f));
}

function main() {
  const repoRoot = execSync("git rev-parse --show-toplevel", {
    encoding: "utf8",
  }).trim();
  let totalHits = 0;
  const changed = [];
  for (const rel of listTargetFiles()) {
    const file = `${repoRoot}/${rel}`;
    const [out, hits] = transformSource(readFileSync(file, "utf8"));
    if (hits > 0) {
      totalHits += hits;
      changed.push([file, hits]);
      if (APPLY) {
        writeFileSync(file, out);
      }
    }
  }
  changed.sort((a, b) => b[1] - a[1]);
  for (const [file, hits] of changed) {
    console.log(`  ${String(hits).padStart(3)}  ${file}`);
  }
  console.log(
    `\n${APPLY ? "APPLIED" : "DRY-RUN"}: ${totalHits} 处替换，跨 ${changed.length} 个文件`,
  );
}

// 仅在被直接执行时跑 main；被 import（commit 脚本复用 transformSource）时不跑。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
