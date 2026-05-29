#!/usr/bin/env node
// 桌面去绿 codemod：把「桌面专属」代码里散落的硬编码微信绿换成语义 token，
// 配合 index.css 桌面块改紫后实现完整紫调换肤（移动端已先行）。
//
// 为什么用 color-mix(var(--brand-primary)) 而非硬编码紫 rgba：
//   桌面现已支持浅/深双主题（[data-appearance="night"] 改 --brand-primary 取值），
//   color-mix 跟随 --brand-primary，浅紫 #7c5bd9 / 夜亮紫 #8b7bf0 自动适配两套；
//   硬编码 rgba(124,91,217,α) 会在暗底上停留浅紫不提亮。且 color-mix 是纯色值，
//   可无差别用于 bg/border/ring 与 gradient stop / 多层 shadow 颜色槽，无需分上下文。
//
// 只扫「桌面作用域」文件（features/desktop、*/desktop-*、desktop-shell、
// profile-settings-desktop），不碰移动/共享组件（如 chat-composer 的同款 rgba 属移动端）
// 与 .css（index.css 桌面块/夜间块由手工维护）。
//
// 用法：node scripts/deviolet-desktop-codemod.mjs [--apply]
//   缺省 dry-run，只打印将改动的文件与计数；--apply 才写盘。
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");

// alpha → 百分比：0.1/0.10→10、0.07→7、0.2→20、0.34→34、0.65→65。
function alphaToPct(a) {
  return +(parseFloat(a) * 100).toFixed(4);
}

// Tailwind 任意值里空格须用下划线；所有命中都在 className 串中（已确认无 inline style）。
function rgbaToMix(varName, alpha) {
  return `color-mix(in_srgb,var(${varName})_${alphaToPct(alpha)}%,transparent)`;
}

// 简单 hex 颜色槽（bg-/text-/border-...）→ color:var() 包裹（与既有 derainbow codemod 一致）。
const HEX_TO_TOKEN = {
  "07c160": "--brand-primary", // 主品牌绿
  "06ad56": "--brand-secondary", // primary 按钮 hover 态（略浅）
  "0b7a3b": "--state-success-text", // 成功提示文字——保绿语义，不变紫
  dbffe8: "--brand-secondary", // 暗侧栏激活图标的浅色调 → 浅紫
};
const UTILS =
  "bg|text|border-[trblxy]|border|ring|fill|stroke|outline|caret|accent|decoration|divide";
const hexAlt = Object.keys(HEX_TO_TOKEN).join("|");
// 形如 bg-[#07c160] / text-[#0b7a3b]（大小写无关；不含 /opacity 后缀的简单形态）。
const HEX_RE = new RegExp(`\\b(${UTILS})-\\[#(${hexAlt})\\]`, "gi");

// 绿 rgba（含可选空格）→ 跟随 --brand-primary 的 color-mix。覆盖 bg/border/ring/shadow/gradient。
const GREEN_RGBA_RE = /rgba\(\s*7\s*,\s*193\s*,\s*96\s*,\s*([0-9.]+)\s*\)/g;
// 蓝氛围球 rgba（仅 desktop-shell 一处）→ 跟随 --brand-accent。
const BLUE_RGBA_RE = /rgba\(\s*56\s*,\s*189\s*,\s*248\s*,\s*([0-9.]+)\s*\)/g;

// 可复用的纯函数：对源码字符串做去绿替换，返回 [新串, 命中数]。
export function transformSource(src) {
  let hits = 0;
  let out = src.replace(GREEN_RGBA_RE, (_m, a) => {
    hits++;
    return rgbaToMix("--brand-primary", a);
  });
  out = out.replace(BLUE_RGBA_RE, (_m, a) => {
    hits++;
    return rgbaToMix("--brand-accent", a);
  });
  out = out.replace(HEX_RE, (_m, util, hex) => {
    hits++;
    return `${util}-[color:var(${HEX_TO_TOKEN[hex.toLowerCase()]})]`;
  });
  return [out, hits];
}

// 收集目标文件：HEAD 树里 apps/app/src 的 .ts/.tsx，只纳入桌面作用域。
// 用 ls-tree HEAD 而非 ls-files：并发会话会把部分文件搞成 staged-deletion，
// 那样 ls-files 不列它们就漏改。
export function listTargetFiles() {
  const repoRoot = execSync("git rev-parse --show-toplevel", {
    encoding: "utf8",
  }).trim();
  return execSync("git ls-tree -r --name-only HEAD apps/app/src", {
    encoding: "utf8",
    cwd: repoRoot,
  })
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter(
      (f) =>
        f.includes("/features/desktop/") ||
        /\/desktop-[^/]+\.(ts|tsx)$/.test(f) ||
        f.endsWith("/profile-settings-desktop.tsx"),
    );
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

// 仅在被直接执行时跑 main；被 import 复用 transformSource 时不跑。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
