#!/usr/bin/env node
// 批量生成 9 张陪伴/亲密陪伴/恋爱助手角色头像 SVG
// 风格参考 lin-chen-sleep-support.svg / jian-ning-relationship-expert.svg
// 输出到 api/public/character-assets/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../api/public/character-assets');

const AVATARS = [
  {
    slug: 'companion-morning-warmth-an-he',
    glyph: '禾',
    bgFrom: '#E8945A',
    bgTo: '#FFD9B0',
    glowFrom: 'rgba(255, 224, 178, 0.55)',
    accent: 'rgba(255, 224, 178, 0.34)',
    accent2: 'rgba(255, 224, 178, 0.14)',
    glyphColor: '#FFFFFF',
  },
  {
    slug: 'companion-late-night-listener-ye-chi',
    glyph: '夜',
    bgFrom: '#2A2A52',
    bgTo: '#5C5C8A',
    glowFrom: 'rgba(180, 180, 255, 0.45)',
    accent: 'rgba(180, 180, 255, 0.30)',
    accent2: 'rgba(180, 180, 255, 0.12)',
    glyphColor: '#E8E8FF',
  },
  {
    slug: 'companion-silent-presence-mu-ze',
    glyph: '沐',
    bgFrom: '#5A6F75',
    bgTo: '#B8C8C9',
    glowFrom: 'rgba(220, 230, 230, 0.50)',
    accent: 'rgba(220, 230, 230, 0.28)',
    accent2: 'rgba(220, 230, 230, 0.12)',
    glyphColor: '#FFFFFF',
  },
  {
    slug: 'intimate-companion-steady-male-shen-yan',
    glyph: '砚',
    bgFrom: '#3F5870',
    bgTo: '#90A8B8',
    glowFrom: 'rgba(200, 215, 230, 0.46)',
    accent: 'rgba(200, 215, 230, 0.30)',
    accent2: 'rgba(200, 215, 230, 0.12)',
    glyphColor: '#FFFFFF',
  },
  {
    slug: 'intimate-companion-warm-female-lin-zhi-xia',
    glyph: '夏',
    bgFrom: '#D17F87',
    bgTo: '#FFCFC9',
    glowFrom: 'rgba(255, 220, 220, 0.55)',
    accent: 'rgba(255, 220, 220, 0.32)',
    accent2: 'rgba(255, 220, 220, 0.14)',
    glyphColor: '#FFFFFF',
  },
  {
    slug: 'intimate-companion-soulmate-chi-yi',
    glyph: '一',
    bgFrom: '#6E5B8F',
    bgTo: '#C4B0DA',
    glowFrom: 'rgba(220, 200, 245, 0.52)',
    accent: 'rgba(220, 200, 245, 0.32)',
    accent2: 'rgba(220, 200, 245, 0.14)',
    glyphColor: '#FFFFFF',
  },
  {
    slug: 'dating-aide-direct-zhou-jin',
    glyph: '谨',
    bgFrom: '#3F7A5C',
    bgTo: '#A4D2B5',
    glowFrom: 'rgba(210, 240, 220, 0.50)',
    accent: 'rgba(210, 240, 220, 0.30)',
    accent2: 'rgba(210, 240, 220, 0.12)',
    glyphColor: '#FFFFFF',
  },
  {
    slug: 'dating-aide-gentle-signal-reader-he-ling',
    glyph: '泠',
    bgFrom: '#B07090',
    bgTo: '#FAD4DC',
    glowFrom: 'rgba(250, 220, 230, 0.55)',
    accent: 'rgba(250, 220, 230, 0.32)',
    accent2: 'rgba(250, 220, 230, 0.14)',
    glyphColor: '#FFFFFF',
  },
  {
    slug: 'dating-aide-data-driven-su-li',
    glyph: '理',
    bgFrom: '#2F6B7E',
    bgTo: '#A8CFD8',
    glowFrom: 'rgba(200, 230, 240, 0.50)',
    accent: 'rgba(200, 230, 240, 0.30)',
    accent2: 'rgba(200, 230, 240, 0.12)',
    glyphColor: '#FFFFFF',
  },
];

function svgFor(spec) {
  const id = `${spec.slug}-svg`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
  <defs>
    <linearGradient id="bg-${id}" x1="96" y1="64" x2="944" y2="976" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${spec.bgFrom}" />
      <stop offset="1" stop-color="${spec.bgTo}" />
    </linearGradient>
    <radialGradient id="glow-${id}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(760 212) rotate(126) scale(512)">
      <stop stop-color="${spec.glowFrom}" />
      <stop offset="1" stop-color="rgba(255, 255, 255, 0)" />
    </radialGradient>
    <linearGradient id="sheen-${id}" x1="180" y1="100" x2="840" y2="920" gradientUnits="userSpaceOnUse">
      <stop stop-color="rgba(255,255,255,0.34)" />
      <stop offset="0.45" stop-color="rgba(255,255,255,0.08)" />
      <stop offset="1" stop-color="rgba(255,255,255,0.02)" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="232" fill="url(#bg-${id})" />
  <rect width="1024" height="1024" rx="232" fill="url(#glow-${id})" />
  <circle cx="770" cy="214" r="178" fill="rgba(255, 255, 255, 0.08)" />
  <circle cx="256" cy="826" r="154" fill="${spec.accent2}" />
  <rect x="96" y="96" width="832" height="832" rx="196" fill="url(#sheen-${id})" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2" />
  <circle cx="512" cy="488" r="270" fill="rgba(255, 255, 255, 0.10)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="2" />
  <circle cx="820" cy="164" r="32" fill="${spec.accent}" />
  <circle cx="206" cy="200" r="18" fill="rgba(255, 255, 255, 0.18)" />
  <text x="512" y="588" text-anchor="middle" font-family="'Noto Sans CJK SC', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif" font-size="340" font-weight="600" fill="${spec.glyphColor}" letter-spacing="-12">${spec.glyph}</text>
</svg>
`;
}

if (!fs.existsSync(OUT_DIR)) {
  console.error(`output dir not found: ${OUT_DIR}`);
  process.exit(1);
}

let written = 0;
for (const spec of AVATARS) {
  const file = path.join(OUT_DIR, `${spec.slug}.svg`);
  fs.writeFileSync(file, svgFor(spec));
  written += 1;
  console.log(`wrote ${file}`);
}
console.log(`done: ${written} svgs.`);
