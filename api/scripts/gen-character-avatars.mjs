#!/usr/bin/env node
// 2026-05-29 全角色头像权威生成器：取代 gen-workplace-ops-avatars.mjs。
// 统一风格 = 渐变玻璃质感骨架 + 居中 lucide 字形（1024×1024）。
//
// 两部分产物：
//   (a) 24 个个人智囊团（intelligence-council）角色：手工新规格，按席位逻辑配色 + 字形。
//   (b) 既有 public/character-assets/*.svg 中【结构完全匹配本模板】的文件：抽取其
//       渐变色 + 字形 + transform，用同一模板忠实重渲染（输出与原文件等价）。
//       对 bespoke 变体（teacher 的 id="bg" + <text>、gu-he 多字形 + 自定义装饰路径、
//       名人头像里的额外元素等）一律 SKIP 不覆盖 → 零回归。
//
// 跑法：node api/scripts/gen-character-avatars.mjs
// 工程性 asset generator，不参与运行时。
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'character-assets');

// ---------------------------------------------------------------------------
// (a) 24 个智囊团角色：slug = presetKey 下划线转连字符。
//     每个 glyph 是 lucide 24x24 viewBox 路径（多段以 M 分隔），居中后约占画布 ~31%。
// ---------------------------------------------------------------------------
const COUNCIL = [
  {
    slug: 'council-decision-architect-shen-ju', // 决策架构师
    colorA: '#243B6B', colorB: '#AEC0F0',
    // compass
    glyph: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z',
  },
  {
    slug: 'council-red-team-bai-ta', // 红队审查官
    colorA: '#7A1F2A', colorB: '#F0B8BE',
    // shield-alert
    glyph: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M12 8v4 M12 16h.01',
  },
  {
    slug: 'council-research-curator-luo-yin', // 资料研究员
    colorA: '#2F5A4A', colorB: '#B8DCCC',
    // library
    glyph: 'M16 6l4 14 M12 6v14 M8 8l-4 12 M4 4h16',
  },
  {
    slug: 'council-campaign-chief-he-ran', // 项目执行管家
    colorA: '#1F4D7A', colorB: '#B0CDEA',
    // flag
    glyph: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  },
  {
    slug: 'council-user-researcher-ye-qing', // 用户研究员
    colorA: '#265A7A', colorB: '#AEDAE8',
    // search
    glyph: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M21 21l-4.3-4.3',
  },
  {
    slug: 'council-writing-editor-lu-yan', // 写作主编
    colorA: '#5A1F5C', colorB: '#E0B0E2',
    // feather
    glyph: 'M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z M16 8 2 22 M17.5 15H9',
  },
  {
    slug: 'council-negotiation-agent-gu-tang', // 谈判顾问
    colorA: '#5A3A1F', colorB: '#E0C4A0',
    // scale (balance)
    glyph: 'M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z M7 21h10 M12 3v18 M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2',
  },
  {
    slug: 'council-safety-gatekeeper-deng-ta', // 安全守门人
    colorA: '#14304A', colorB: '#A6C4E0',
    // lock
    glyph: 'M5 11a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z M8 11V7a4 4 0 0 1 8 0v4',
  },
  {
    slug: 'council-growth-experimenter-cheng-jing', // 增长实验官
    colorA: '#7A3A1F', colorB: '#F0C8A8',
    // trending-up
    glyph: 'M16 7h6v6 M22 7l-8.5 8.5-5-5L2 17',
  },
  {
    slug: 'council-brand-director-wu-ye', // 品牌叙事顾问
    colorA: '#7A1F4A', colorB: '#F0B0CC',
    // megaphone
    glyph: 'M3 11l18-5v12L3 14v-3z M11.6 16.8a3 3 0 1 1-5.8-1.6',
  },
  {
    slug: 'council-engineering-commander-tie-niao', // 工程交付指挥
    colorA: '#3A3A44', colorB: '#C0C0CC',
    // wrench
    glyph: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  },
  {
    slug: 'council-ai-architect-lin-qi', // AI应用架构师
    colorA: '#3A2A7A', colorB: '#C2B4F0',
    // cpu
    glyph: 'M16 18H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2z M9 9h6v6H9z M9 2v2 M15 2v2 M9 20v2 M15 20v2 M2 9h2 M2 15h2 M20 9h2 M20 15h2',
  },
  {
    slug: 'council-finance-quartermaster-su-heng', // 财务规划顾问
    colorA: '#14524A', colorB: '#A6D8CC',
    // calculator
    glyph: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M8 6h8 M8 10h.01 M12 10h.01 M16 10h.01 M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01 M16 18h.01',
  },
  {
    slug: 'council-recovery-officer-qiao-lan', // 精力恢复顾问
    colorA: '#2A2A5A', colorB: '#B8B8E0',
    // moon
    glyph: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  },
  {
    slug: 'council-space-organizer-mo-he', // 空间整理师
    colorA: '#2F5A2F', colorB: '#B8E0B0',
    // layout-grid
    glyph: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  },
  {
    slug: 'council-social-operator-ling-xiaoman', // 社交节奏顾问
    colorA: '#7A2A4A', colorB: '#F0B8C8',
    // messages-square
    glyph: 'M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1',
  },
  {
    slug: 'council-conflict-mediator-wen-yue', // 冲突调停顾问
    colorA: '#2F5A5A', colorB: '#B8DCDC',
    // heart
    glyph: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z',
  },
  {
    slug: 'council-relationship-observer-lu-zhi', // 关系模式观察员
    colorA: '#5A2A4A', colorB: '#E0B8CC',
    // eye
    glyph: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  },
  {
    slug: 'council-aesthetic-director-huai-xu', // 审美顾问
    colorA: '#6A2A6A', colorB: '#E8B8E8',
    // palette
    glyph: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 10 10 2 2 0 0 1-2 2h-2.5a2 2 0 0 0-1.79 2.89A2 2 0 0 1 12 22z M13.5 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M17.5 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M8.5 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M6.5 12.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  },
  {
    slug: 'council-story-worldwriter-tang-wei', // 剧情编剧
    colorA: '#3A2A5A', colorB: '#C4B8E0',
    // book-open
    glyph: 'M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  },
  {
    slug: 'council-content-editor-bai-zhou', // 视频剪辑师
    colorA: '#5A1F3A', colorB: '#E0B0C4',
    // clapperboard
    glyph: 'M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z M6.2 5.3l3.1 3.9 M12.4 3.4l3.1 4 M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  },
  {
    slug: 'council-trend-radar-guan-lan', // 趋势分析师
    colorA: '#2A3F7A', colorB: '#B8C2EE',
    // satellite-dish
    glyph: 'M4 10a7.31 7.31 0 0 0 10 10z M9 15l3-3 M17 13a6 6 0 0 0-6-6 M21 13A10 10 0 0 0 11 3',
  },
  {
    slug: 'council-learning-designer-shen-yu', // 学习设计师
    colorA: '#8A6A12', colorB: '#F0DCA0',
    // puzzle
    glyph: 'M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02z',
  },
  {
    slug: 'council-long-cycle-strategist-xing-pan', // 长期战略顾问
    colorA: '#2C2C66', colorB: '#BCBCE6',
    // telescope
    glyph: 'M10.065 12.493l-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44 M13.56 11.747l4.332-.924 M16 21l-3.105-6.21 M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z M6.158 8.633l1.114 4.456 M8 21l3.105-6.21 M9.5 17a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
  },
];

// 居中常量：24x24 viewbox → scale 13.5 ≈ 324px；translate((1024-324)/2=350, 320)
const DEFAULT_TRANSFORM = 'translate(350 320) scale(13.5)';

const TEMPLATE = ({ slug, colorA, colorB, glyph, transform = DEFAULT_TRANSFORM }) => {
  const id = slug;
  const paths = glyph
    .split(/\s*(?=M)/)
    .filter(Boolean)
    .map((d) => `    <path d="${d.trim()}" />`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
  <defs>
    <linearGradient id="bg-${id}-svg" x1="96" y1="64" x2="944" y2="976" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${colorA}" />
      <stop offset="1" stop-color="${colorB}" />
    </linearGradient>
    <radialGradient id="glow-${id}-svg" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(760 212) rotate(126) scale(512)">
      <stop stop-color="rgba(255, 255, 255, 0.5)" />
      <stop offset="1" stop-color="rgba(255, 255, 255, 0)" />
    </radialGradient>
    <linearGradient id="sheen-${id}-svg" x1="180" y1="100" x2="840" y2="920" gradientUnits="userSpaceOnUse">
      <stop stop-color="rgba(255,255,255,0.34)" />
      <stop offset="0.45" stop-color="rgba(255,255,255,0.08)" />
      <stop offset="1" stop-color="rgba(255,255,255,0.02)" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="232" fill="url(#bg-${id}-svg)" />
  <rect width="1024" height="1024" rx="232" fill="url(#glow-${id}-svg)" />
  <circle cx="770" cy="214" r="178" fill="rgba(255, 255, 255, 0.08)" />
  <circle cx="256" cy="826" r="154" fill="rgba(255, 255, 255, 0.12)" />
  <rect x="96" y="96" width="832" height="832" rx="196" fill="url(#sheen-${id}-svg)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2" />
  <circle cx="512" cy="512" r="248" fill="rgba(255, 255, 255, 0.12)" stroke="rgba(255, 255, 255, 0.14)" stroke-width="2" />
  <circle cx="820" cy="164" r="32" fill="rgba(255, 255, 255, 0.32)" />
  <circle cx="206" cy="200" r="18" fill="rgba(255, 255, 255, 0.18)" />
  <g transform="${transform}" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity="1">
${paths}
  </g>
</svg>
`;
};

// ---------------------------------------------------------------------------
// (b) 既有文件忠实重渲染：仅当结构与本模板签名完全一致时才重写。
//     签名 = 恰好一个 <g> 字形组、零顶层 <path>、零 <text>、bg-<slug>-svg 渐变。
// ---------------------------------------------------------------------------
function extractCanonical(svg, slug) {
  if (svg.includes('<text')) return null; // teacher 等 bespoke
  const gMatches = svg.match(/<g\b/g) || [];
  if (gMatches.length !== 1) return null; // gu-he 多字形组等
  // bg 渐变必须是 bg-<slug>-svg
  const bgRe = new RegExp(
    `<linearGradient id="bg-${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-svg"[\\s\\S]*?<stop offset="0" stop-color="(#[0-9A-Fa-f]{3,8})"[\\s\\S]*?<stop offset="1" stop-color="(#[0-9A-Fa-f]{3,8})"`,
  );
  const bg = svg.match(bgRe);
  if (!bg) return null;
  // 字形组：transform + 内部 path d 列表
  const gRe = /<g transform="([^"]+)"[^>]*stroke="#FFFFFF"[^>]*>([\s\S]*?)<\/g>/;
  const g = svg.match(gRe);
  if (!g) return null;
  const transform = g[1];
  const ds = [...g[2].matchAll(/<path d="([^"]+)"\s*\/>/g)].map((m) => m[1]);
  if (ds.length === 0) return null;
  // 顶层 <path>（g 之外）→ 自定义装饰，跳过
  const outsideG = svg.replace(g[0], '');
  if (/<path\b/.test(outsideG)) return null;
  return { slug, colorA: bg[1], colorB: bg[2], glyph: ds.join(' '), transform };
}

(async () => {
  let written = 0;
  const skipped = [];

  // (a) 智囊团 24 个
  for (const spec of COUNCIL) {
    await writeFile(join(OUT_DIR, `${spec.slug}.svg`), TEMPLATE(spec), 'utf8');
    written += 1;
    console.log('wrote (council)', `${spec.slug}.svg`);
  }
  const councilSlugs = new Set(COUNCIL.map((c) => c.slug));

  // (b) 既有文件忠实重渲染
  const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.svg'));
  for (const file of files) {
    const slug = file.replace(/\.svg$/, '');
    if (councilSlugs.has(slug)) continue; // 已在 (a) 写过
    const svg = await readFile(join(OUT_DIR, file), 'utf8');
    const spec = extractCanonical(svg, slug);
    if (!spec) {
      skipped.push(file);
      continue;
    }
    await writeFile(join(OUT_DIR, file), TEMPLATE(spec), 'utf8');
    written += 1;
    console.log('re-rendered (canonical)', file);
  }

  console.log(`\ndone: wrote ${written} svg(s); skipped ${skipped.length} bespoke file(s).`);
  if (skipped.length) console.log('SKIP:', skipped.join(', '));
})();
