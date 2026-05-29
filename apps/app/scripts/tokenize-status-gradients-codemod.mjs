#!/usr/bin/env node
// UI 风格统一 · 状态卡浅色渐变收敛：把硬编码的「浅色 linear-gradient 状态卡底」
// （danger 粉/success 绿/warning 琥珀/info 蓝/lavender 紫/中性白）换成自适应 token，
// 否则夜间渐变保持浅色、文字 token 翻浅 → 不可读。
//
// 只处理「首色标为浅色(luminance>0.82)」的渐变（状态卡底）；深色渐变(通话屏/海报)、
// 饱和装饰渐变(头像/徽标)首标不浅 → 跳过。按首标色相分类到对应 --state-*-bg /
// --brand-soft / --surface-section。
//
// 用法：node scripts/tokenize-status-gradients-codemod.mjs [--apply]
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");

function parseStop(s) {
  let m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  m = s.match(/#([0-9a-fA-F]{6})/);
  if (m) return { r: parseInt(m[1].slice(0,2),16), g: parseInt(m[1].slice(2,4),16), b: parseInt(m[1].slice(4,6),16) };
  return null;
}

// 浅色首标 → token；返回 null=不处理（深色/无法分类）
// 仅命中「状态卡」签名：恰好 2 个色标 + 第二标近白(tint→white)。
// 这样排除装饰渐变(slate→slate 占位、分层 overlay、多标段头)，只收敛真状态卡底。
function classifyGradient(inner) {
  const stops = [...inner.matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{6}/g)].map((m) => parseStop(m[0])).filter(Boolean);
  if (stops.length !== 2) return null;
  const last = stops[1];
  if (Math.min(last.r, last.g, last.b) < 246) return null; // 第二标须近白
  const first = stops[0];
  const { r, g, b } = first;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.82) return null; // 非浅色状态卡，跳过

  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn <= 5) return "--surface-section"; // 近中性白
  // 色相判定（基于哪个通道偏高/偏低）
  const warm = r >= g && g >= b;            // r 最高、b 最低 = 暖(琥珀)
  const greenish = g >= r && g >= b && g - Math.min(r, b) >= 3;
  const bMax = b >= r && b >= g;
  if (greenish) return "--state-success-bg";
  if (warm) return "--state-warning-bg";
  if (bMax) {
    // 蓝(r<g<b, g 居中) vs 紫薰衣(g 最低, r&b 高)
    if (g <= r && g <= b) return "--brand-soft"; // 紫/薰衣草
    return "--state-info-bg"; // 蓝
  }
  return "--surface-section";
}

const RE = /bg-\[linear-gradient\(([^\]]*)\)\]/g;

export function transformSource(src, sink) {
  return src.replace(RE, (m, inner) => {
    const tok = classifyGradient(inner);
    if (!tok) { sink?.skip?.(m); return m; }
    sink?.hit?.(tok);
    return `bg-[color:var(${tok})]`;
  });
}

const SKIP = ["share-card-modal", "feed-post-share-card-modal"];
export function listTargetFiles() {
  const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  return execSync("git ls-tree -r --name-only HEAD apps/app/src", { encoding: "utf8", cwd: root })
    .split("\n").filter(Boolean).filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !f.includes("/features/games/")).filter((f) => !SKIP.some((s) => f.includes(s)));
}

function main() {
  const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  let total = 0; const byTok = new Map(); const changed = [];
  for (const rel of listTargetFiles()) {
    const file = `${root}/${rel}`; let hits = 0;
    const out = transformSource(readFileSync(file, "utf8"), { hit: (t) => { hits++; total++; byTok.set(t,(byTok.get(t)||0)+1); } });
    if (hits > 0) { changed.push([rel, hits]); if (APPLY) writeFileSync(file, out); }
  }
  changed.sort((a,b)=>b[1]-a[1]);
  for (const [f,h] of changed) console.log(`  ${String(h).padStart(3)}  ${f}`);
  console.log("\n按 token:"); for (const [t,c] of byTok) console.log(`  ${c}  ${t}`);
  console.log(`\n${APPLY?"APPLIED":"DRY-RUN"}: ${total} 处 / ${changed.length} 文件`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
