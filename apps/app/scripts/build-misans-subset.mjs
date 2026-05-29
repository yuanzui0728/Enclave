#!/usr/bin/env node
// 生成 apps/app/src/fonts/misans/ 下的 MiSans 自托管 webfont 子集。
//
// 为什么这样做：全 App 几乎都是中文，中文整字体每 weight 数 MB，naive 加载会拖垮
// 首屏。MiSans（小米，免费可商用）经 unicode-range 切成上百个小 woff2 块 +
// font-display:swap 后，浏览器只下载当前页面用到的字形块（每页约几十 KB），首屏
// 先用系统字体渲染、字体块到位后无闪烁替换。详见 .claude/plans/app-jazzy-valley.md。
//
// 字形切分不是我们手切的 —— 直接复用社区维护的 `misans` npm 包（DSRKafuU,
// Apache-2.0，包了 Xiaomi 免费 MiSans）。它的 lib/Normal/ 就是简体中文 CJK 家族，
// 每个 weight 已切成 100 个 unicode-range 块 + 带 font-display:swap 的 @font-face CSS。
// 该包用「视觉等比」的非标准 font-weight 值（Regular=330 … Heavy=700），与本 App
// 设计 token 的 400/500/600/700 不对应，所以这里把选用的 4 个 weight 归一化成标准值。
//
// 用法：
//   1) 取得 misans 包源（任选其一）
//        npm pack misans            # 得到 misans-<ver>.tgz，解压
//        npm i misans --no-save     # 落到 node_modules/misans
//   2) MISANS_PKG=/path/to/misans/package node apps/app/scripts/build-misans-subset.mjs
//      （默认找 node_modules/misans）
//
// 换字体只需换 SOURCE_DIR/家族与下面的 WEIGHTS 映射，重跑即可，零返工。

import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(APP_ROOT, "..", "..");

const PKG_ROOT =
  process.env.MISANS_PKG ||
  join(REPO_ROOT, "node_modules", "misans") ||
  join(APP_ROOT, "node_modules", "misans");

// 简体中文 CJK 家族 = lib/Normal。每项: 源 weight 文件前缀 → 归一化后的标准 font-weight。
const FAMILY_DIR = join(PKG_ROOT, "lib", "Normal");
const WEIGHTS = [
  { src: "MiSans-Regular", weight: 400 },
  { src: "MiSans-Medium", weight: 500 },
  { src: "MiSans-Semibold", weight: 600 },
  { src: "MiSans-Bold", weight: 700 },
];

// 放 public/ 而非 src/：让字体清单作为独立异步样式表加载，不并进首屏关键 CSS
// （并进去会把关键 CSS 体积翻几倍、拖慢真正的 App UI 上样式）。public 下文件原样
// 进 dist，文件名稳定、内容不变 → 走 HTTP 缓存即可。
const OUT_DIR = join(APP_ROOT, "public", "fonts", "misans");

function fail(msg) {
  console.error(`[build-misans-subset] ${msg}`);
  process.exit(1);
}

if (!existsSync(FAMILY_DIR)) {
  fail(
    `找不到 MiSans 包: ${FAMILY_DIR}\n` +
      `先 \`npm pack misans\` 解压，或 \`npm i misans --no-save\`，再用 MISANS_PKG=... 指过来。`,
  );
}

// 清空重建，保证删 weight 时不留旧块。
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

let combinedCss = `/* MiSans 自托管子集 —— 由 apps/app/scripts/build-misans-subset.mjs 生成，勿手改。\n   源: misans npm 包 (Apache-2.0, 包 Xiaomi 免费 MiSans)。font-weight 已归一化为 400/500/600/700。 */\n`;
let copied = 0;

for (const { src, weight } of WEIGHTS) {
  const cssPath = join(FAMILY_DIR, `${src}.min.css`);
  if (!existsSync(cssPath)) fail(`缺 weight CSS: ${cssPath}`);

  // 复制该 weight 的全部 woff2 块（文件名 src.N.woff2，url() 相对引用，复制到同目录即生效）。
  const chunks = readdirSync(FAMILY_DIR).filter((f) => f.startsWith(`${src}.`) && f.endsWith(".woff2"));
  if (chunks.length === 0) fail(`${src} 没有 woff2 块`);
  for (const chunk of chunks) {
    copyFileSync(join(FAMILY_DIR, chunk), join(OUT_DIR, chunk));
    copied += 1;
  }

  // 归一化 font-weight：包里是视觉等比的非标准值，全部替换成本 weight 的标准值。
  let css = readFileSync(cssPath, "utf8");
  css = css.replace(/font-weight:\d+/g, `font-weight:${weight}`);
  combinedCss += `\n/* ${src} -> font-weight ${weight} (${chunks.length} chunks) */\n${css}\n`;
  console.log(`[build-misans-subset] ${src}: ${chunks.length} chunks -> font-weight ${weight}`);
}

writeFileSync(join(OUT_DIR, "misans.css"), combinedCss, "utf8");

// 随产物带上许可证，满足再分发条款。
const licenseSrc = join(PKG_ROOT, "LICENSE");
if (existsSync(licenseSrc)) copyFileSync(licenseSrc, join(OUT_DIR, "LICENSE"));

console.log(`[build-misans-subset] 完成: ${copied} 个 woff2 + misans.css -> ${OUT_DIR}`);
