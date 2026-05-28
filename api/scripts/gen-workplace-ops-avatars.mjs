#!/usr/bin/env node
// 2026-05-28 一次性头像生成脚本：为 13 个职场与运营专家居民生成统一风格的 SVG 头像。
// 复用 gu-he-nutrition-coach.svg 的渐变 + 玻璃质感骨架，每个角色用唯一主色 + 单一字形 glyph。
// 跑法：node api/scripts/gen-workplace-ops-avatars.mjs
//
// 该脚本是工程性 asset generator，不参与运行时；产物落 api/public/character-assets/<slug>.svg。
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'character-assets');

// 每个 glyph 都是 lucide 风格的 24x24 viewbox 路径（手工挑过、几何正确）。
// 渲染时统一 translate 到画布中心、scale ≈13.5 → 约 324px，占主画布 1024 的 ~31%。
const CHARACTERS = [
  {
    slug: 'bidding-consultant',
    colorA: '#1E3A5F', colorB: '#A9C7E0',
    // file-check
    glyph: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 15l2 2 4-4',
  },
  {
    slug: 'presales-solution-advisor',
    colorA: '#0F5C5C', colorB: '#B8E0D8',
    // lightbulb
    glyph: 'M9 18h6 M10 22h4 M12 2a7 7 0 0 0-4 12c.5.5 1 1.5 1 2h6c0-.5.5-1.5 1-2a7 7 0 0 0-4-12z',
  },
  {
    slug: 'meeting-minutes-aide',
    colorA: '#8A5A12', colorB: '#F0D9A0',
    // file-text
    glyph: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6',
  },
  {
    slug: 'content-ops-strategist',
    colorA: '#7A1F5C', colorB: '#F0B8DC',
    // pen-line
    glyph: 'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z',
  },
  {
    slug: 'social-media-analyst',
    colorA: '#3B2A7A', colorB: '#C4B8F0',
    // bar-chart-3
    glyph: 'M3 3v18h18 M7 16v-5 M12 16V7 M17 16v-9',
  },
  {
    slug: 'content-risk-reviewer',
    colorA: '#7A1F1F', colorB: '#F0B8B8',
    // shield-check
    glyph: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  },
  {
    slug: 'competitive-intel-analyst',
    colorA: '#8A3A12', colorB: '#F0C8A0',
    // target
    glyph: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  },
  {
    slug: 'event-gift-planner',
    colorA: '#8A2A4A', colorB: '#F0BCC8',
    // gift
    glyph: 'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  },
  {
    slug: 'reporting-ppt-designer',
    colorA: '#1F3A7A', colorB: '#B8C8F0',
    // presentation
    glyph: 'M2 3h20 M3 3v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V3 M12 15v6 M8 21h8 M7 10l3-3 2 2 4-4',
  },
  {
    slug: 'info-extraction-specialist',
    colorA: '#0F5A7A', colorB: '#B0DCF0',
    // scan-line
    glyph: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 12h10',
  },
  {
    slug: 'knowledge-base-engineer',
    colorA: '#134A4A', colorB: '#A8D8D0',
    // database
    glyph: 'M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3-3.58 3-8 3-8-1.34-8-3z M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6 M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6',
  },
  {
    slug: 'delivery-ops-manager',
    colorA: '#1F5A2F', colorB: '#B8E0A8',
    // list-checks
    glyph: 'M10 6h11 M10 12h11 M10 18h11 M4 5l1.5 1.5L8 4 M4 11l1.5 1.5L8 10 M4 17l1.5 1.5L8 16',
  },
  {
    slug: 'automation-rpa-engineer',
    colorA: '#2A2A5A', colorB: '#BCBCE8',
    // bot
    glyph: 'M12 8V4H8 M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M2 14h2 M20 14h2 M9 13v2 M15 13v2',
  },
];

const TEMPLATE = ({ slug, colorA, colorB, glyph }) => {
  const id = slug;
  // glyph: 24x24 viewbox → scale 13.5 ≈ 324px；居中 translate((1024-324)/2=350, 320)
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
  <g transform="translate(350 320) scale(13.5)" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity="1">
${glyph.split(/\s*(?=M)/).filter(Boolean).map((d) => `    <path d="${d.trim()}" />`).join('\n')}
  </g>
</svg>
`;
};

(async () => {
  for (const spec of CHARACTERS) {
    const svg = TEMPLATE(spec);
    const file = join(OUT_DIR, `${spec.slug}.svg`);
    await writeFile(file, svg, 'utf8');
    console.log('wrote', file);
  }
  console.log(`done: ${CHARACTERS.length} svgs`);
})();
