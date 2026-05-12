#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const siteRoot = path.dirname(path.dirname(__filename));
const publicRoot = path.join(siteRoot, "public");
const brandRoot = path.join(publicRoot, "brand");

const COLORS = {
  brandPrimary: "#f97316",
  brandSecondary: "#fb923c",
  brandAmber: "#fbbf24",
  brandAccent: "#10b981",
  canvas: "#fffcf5",
  white: "#ffffff",
  textPrimary: "#1a0f05",
  textSecondary: "#4a3728",
  textMuted: "#7a6454",
};

const COLOR_LIST = [
  { name: "Brand Primary", token: "--brand-primary", hex: COLORS.brandPrimary, usage: "Primary actions and logo gradient depth" },
  { name: "Brand Secondary", token: "--brand-secondary", hex: COLORS.brandSecondary, usage: "Hover states and warm highlights" },
  { name: "Brand Amber", token: "--brand-gradient-start", hex: COLORS.brandAmber, usage: "Gradient start and sunny accents" },
  { name: "Brand Accent", token: "--brand-accent", hex: COLORS.brandAccent, usage: "Success accents and contrast detail" },
  { name: "Canvas", token: "--bg-canvas", hex: COLORS.canvas, usage: "Warm page and poster background" },
  { name: "Surface", token: "--surface-section", hex: COLORS.white, usage: "Cards, phone frames, and elevated surfaces" },
  { name: "Text Primary", token: "--text-primary", hex: COLORS.textPrimary, usage: "Primary copy" },
  { name: "Text Secondary", token: "--text-secondary", hex: COLORS.textSecondary, usage: "Body copy" },
  { name: "Text Muted", token: "--text-muted", hex: COLORS.textMuted, usage: "Labels and metadata" },
];

const POSTER_THEMES = [
  {
    key: "private-world",
    screenshots: ["onboarding", "self-character"],
    zh: {
      eyebrow: "隐界 Enclave",
      titleLines: ["一个属于你的", "AI 虚拟世界"],
      subtitleLines: ["私人 AI 居民、朋友圈、群聊、电话，", "浏览器即开即用。"],
      tag: "一人一世界",
    },
    en: {
      eyebrow: "Enclave",
      titleLines: ["Your Private", "AI World"],
      subtitleLines: ["AI residents, moments, groups, and calls", "in one browser-ready world."],
      tag: "One person, one world",
    },
  },
  {
    key: "ai-companion",
    screenshots: ["chat", "self-character"],
    zh: {
      eyebrow: "AI 陪伴",
      titleLines: ["真正记得你的", "AI 朋友"],
      subtitleLines: ["长期记忆、作息、主动联系，", "让陪伴不再是问一句答一句。"],
      tag: "长期关系",
    },
    en: {
      eyebrow: "AI Companion",
      titleLines: ["AI Friends", "That Remember"],
      subtitleLines: ["Long-term memory, daily rhythms,", "and proactive connection."],
      tag: "Long-term bonds",
    },
  },
  {
    key: "group-chat",
    screenshots: ["group", "chat"],
    zh: {
      eyebrow: "群聊角色扮演",
      titleLines: ["让多个 AI 角色", "一起开聊"],
      subtitleLines: ["角色之间有关系、有节奏，", "也能和你共同推进故事。"],
      tag: "多角色同场",
    },
    en: {
      eyebrow: "Group Roleplay",
      titleLines: ["Group Chats With", "AI Characters"],
      subtitleLines: ["Bring multiple personalities into", "one shared room."],
      tag: "Shared rooms",
    },
  },
  {
    key: "moments-calls",
    screenshots: ["moments", "chat"],
    zh: {
      eyebrow: "日常互动",
      titleLines: ["动态、电话", "与日常感"],
      subtitleLines: ["AI 会发朋友圈、互动、语音或视频通话，", "像世界正在运转。"],
      tag: "鲜活日常",
    },
    en: {
      eyebrow: "Daily Life",
      titleLines: ["Moments, Calls,", "and Daily Life"],
      subtitleLines: ["Characters post, react, call,", "and make the world feel alive."],
      tag: "Living rhythm",
    },
  },
  {
    key: "self-hosted-privacy",
    screenshots: ["feed", "onboarding"],
    zh: {
      eyebrow: "自部署 / 隐私",
      titleLines: ["你的对话", "只属于你"],
      subtitleLines: ["开源、自部署、可导出，", "数据留在你自己的世界里。"],
      tag: "数据自主",
    },
    en: {
      eyebrow: "Self-hosted Privacy",
      titleLines: ["Your Conversations", "Stay Yours"],
      subtitleLines: ["Open source, self-hostable, exportable,", "and under your control."],
      tag: "User controlled",
    },
  },
];

const LOCALES = [
  { key: "zh-CN", contentKey: "zh", brand: "隐界", font: "Noto Sans CJK SC, Noto Sans SC, Inter, Arial, sans-serif" },
  { key: "en-US", contentKey: "en", brand: "Enclave", font: "Inter, Arial, sans-serif" },
];

const FORMATS = [
  { key: "1080x1350", width: 1080, height: 1350, orientation: "portrait" },
  { key: "1920x1080", width: 1920, height: 1080, orientation: "landscape" },
];

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function imageDataUri(locale, key) {
  const file = path.join(publicRoot, "screenshots", locale, `${key}.png`);
  if (!existsSync(file)) {
    throw new Error(`Missing screenshot: ${file}`);
  }
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

function logoSvg(size = 512) {
  const r = Math.round(size * 0.18);
  const scale = size / 512;
  const transform = scale === 1 ? "" : ` transform="scale(${scale})"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Enclave logo">
  <defs>
    <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffa32f"/>
      <stop offset="1" stop-color="#ff741a"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#logo-bg)"/>
  <g${transform}>
    <path d="M203 177h29l24 58 31-69h31l-47 100v58h-31v-58z" fill="#8a3a08" opacity=".78"/>
    <path d="M194 166h31l31 69 31-69h31l-47 100v58h-31v-58z" fill="#fffdf7"/>
  </g>
</svg>
`;
}

function writeBrandScalars() {
  const colorsJson = {
    name: "Enclave brand colors",
    updatedAt: "2026-05-11",
    colors: COLOR_LIST,
  };
  writeFileSync(path.join(brandRoot, "colors.json"), `${JSON.stringify(colorsJson, null, 2)}\n`);

  const rows = COLOR_LIST.map((color) => `| ${color.name} | \`${color.token}\` | \`${color.hex}\` | ${color.usage} |`).join("\n");
  writeFileSync(
    path.join(brandRoot, "colors.md"),
    `# Enclave Brand Colors\n\n| Name | Token | Hex | Usage |\n| --- | --- | --- | --- |\n${rows}\n`,
  );

  writeFileSync(path.join(brandRoot, "logo.svg"), logoSvg(512));
}

function filterDefs(id) {
  return `<defs>
    <linearGradient id="bg-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLORS.canvas}"/>
      <stop offset=".62" stop-color="#fff4e0"/>
      <stop offset="1" stop-color="#ffe4bf"/>
    </linearGradient>
    <linearGradient id="brand-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLORS.brandAmber}"/>
      <stop offset="1" stop-color="${COLORS.brandPrimary}"/>
    </linearGradient>
    <pattern id="grid-${id}" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0v48" fill="none" stroke="#ffffff" stroke-width="1" opacity=".5"/>
    </pattern>
    <filter id="shadow-${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="22" flood-color="#a05a0a" flood-opacity=".18"/>
    </filter>
    <filter id="phone-${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="#7a3d05" flood-opacity=".22"/>
    </filter>
  </defs>`;
}

function renderTextLines({ lines, x, y, fontSize, lineHeight, weight = 700, color, family, anchor = "start" }) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${fontSize}" font-weight="${weight}" fill="${color}">
    ${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("\n")}
  </text>`;
}

function renderLogoLockup({ x, y, locale, size, family, brandLabel }) {
  const logo = logoSvg(size).replace("<svg ", `<svg x="${x}" y="${y}" `);
  const textX = x + size + 18;
  return `${logo}
  <text x="${textX}" y="${y + size * 0.45}" font-family="${family}" font-size="${Math.round(size * 0.28)}" font-weight="700" fill="${COLORS.textPrimary}">${escapeXml(brandLabel)}</text>
  <text x="${textX}" y="${y + size * 0.72}" font-family="${family}" font-size="${Math.round(size * 0.16)}" font-weight="600" fill="${COLORS.textMuted}">${locale.key}</text>`;
}

function renderPhone({ id, href, x, y, width, rotate = 0 }) {
  const height = Math.round(width * 844 / 390);
  const cx = x + width / 2;
  const cy = y + height / 2;
  return `<g transform="rotate(${rotate} ${cx} ${cy})" filter="url(#phone-${id})">
    <rect x="${x - 13}" y="${y - 13}" width="${width + 26}" height="${height + 26}" rx="44" fill="${COLORS.white}" opacity=".94"/>
    <clipPath id="clip-${id}-${Math.round(x)}-${Math.round(y)}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="32"/>
    </clipPath>
    <image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${id}-${Math.round(x)}-${Math.round(y)})"/>
  </g>`;
}

function renderBadge({ x, y, text, family, id }) {
  const width = Math.max(210, text.length * 16 + 70);
  return `<g filter="url(#shadow-${id})">
    <rect x="${x}" y="${y}" width="${width}" height="54" rx="27" fill="${COLORS.white}" opacity=".86"/>
    <circle cx="${x + 29}" cy="${y + 27}" r="8" fill="${COLORS.brandAccent}"/>
    <text x="${x + 50}" y="${y + 35}" font-family="${family}" font-size="19" font-weight="700" fill="${COLORS.textSecondary}">${escapeXml(text)}</text>
  </g>`;
}

function renderPortrait({ id, theme, content, locale, format }) {
  const family = locale.font;
  const [primaryShot, secondaryShot] = theme.screenshots.map((key) => imageDataUri(locale.key, key));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${format.width}" height="${format.height}" viewBox="0 0 ${format.width} ${format.height}" role="img" aria-label="${escapeXml(content.titleLines.join(" "))}">
  ${filterDefs(id)}
  <rect width="1080" height="1350" fill="url(#bg-${id})"/>
  <rect width="1080" height="1350" fill="url(#grid-${id})" opacity=".42"/>
  <path d="M0 1000 C210 920 330 1090 520 990 C730 880 890 920 1080 805 V1350 H0 Z" fill="${COLORS.brandAccent}" opacity=".1"/>
  <path d="M700 0 H1080 V310 C950 250 840 172 700 0 Z" fill="${COLORS.brandPrimary}" opacity=".12"/>
  ${renderLogoLockup({ x: 82, y: 72, locale, size: 76, family, brandLabel: locale.brand })}
  <text x="82" y="214" font-family="${family}" font-size="24" font-weight="800" letter-spacing="2" fill="${COLORS.brandPrimary}">${escapeXml(content.eyebrow)}</text>
  ${renderTextLines({ lines: content.titleLines, x: 82, y: 315, fontSize: 88, lineHeight: 104, weight: 800, color: COLORS.textPrimary, family })}
  ${renderTextLines({ lines: content.subtitleLines, x: 86, y: 514, fontSize: 32, lineHeight: 48, weight: 500, color: COLORS.textSecondary, family })}
  ${renderPhone({ id: `${id}-a`, href: primaryShot, x: 92, y: 646, width: 336, rotate: -3 })}
  ${renderPhone({ id: `${id}-b`, href: secondaryShot, x: 548, y: 586, width: 352, rotate: 4 })}
  ${renderBadge({ x: 82, y: 616, text: content.tag, family, id })}
</svg>
`;
}

function renderLandscape({ id, theme, content, locale, format }) {
  const family = locale.font;
  const [primaryShot, secondaryShot] = theme.screenshots.map((key) => imageDataUri(locale.key, key));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${format.width}" height="${format.height}" viewBox="0 0 ${format.width} ${format.height}" role="img" aria-label="${escapeXml(content.titleLines.join(" "))}">
  ${filterDefs(id)}
  <rect width="1920" height="1080" fill="url(#bg-${id})"/>
  <rect width="1920" height="1080" fill="url(#grid-${id})" opacity=".38"/>
  <path d="M1050 0 H1920 V1080 H1500 C1340 792 1170 472 1050 0 Z" fill="${COLORS.brandPrimary}" opacity=".1"/>
  <path d="M0 815 C250 745 450 895 655 790 C850 690 1010 748 1160 660 V1080 H0 Z" fill="${COLORS.brandAccent}" opacity=".1"/>
  ${renderLogoLockup({ x: 110, y: 90, locale, size: 78, family, brandLabel: locale.brand })}
  <text x="112" y="282" font-family="${family}" font-size="25" font-weight="800" letter-spacing="2" fill="${COLORS.brandPrimary}">${escapeXml(content.eyebrow)}</text>
  ${renderTextLines({ lines: content.titleLines, x: 110, y: 395, fontSize: 94, lineHeight: 112, weight: 800, color: COLORS.textPrimary, family })}
  ${renderTextLines({ lines: content.subtitleLines, x: 116, y: 646, fontSize: 34, lineHeight: 52, weight: 500, color: COLORS.textSecondary, family })}
  ${renderBadge({ x: 112, y: 780, text: content.tag, family, id })}
  <text x="112" y="955" font-family="${family}" font-size="23" font-weight="700" fill="${COLORS.textMuted}">enclave.yinjie.app</text>
  ${renderPhone({ id: `${id}-a`, href: primaryShot, x: 1038, y: 184, width: 322, rotate: -4 })}
  ${renderPhone({ id: `${id}-b`, href: secondaryShot, x: 1400, y: 126, width: 365, rotate: 4 })}
</svg>
`;
}

async function writePoster(theme, locale, format) {
  const content = theme[locale.contentKey];
  const id = `${theme.key}-${locale.key}-${format.key}`.replaceAll(/[^a-zA-Z0-9]/g, "-");
  const svg = format.orientation === "portrait"
    ? renderPortrait({ id, theme, content, locale, format })
    : renderLandscape({ id, theme, content, locale, format });
  const base = `poster-${theme.key}-${locale.key}-${format.key}`;
  const svgPath = path.join(brandRoot, `${base}.svg`);
  const pngPath = path.join(brandRoot, `${base}.png`);
  writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
}

async function main() {
  ensureDir(brandRoot);
  writeBrandScalars();
  for (const theme of POSTER_THEMES) {
    for (const locale of LOCALES) {
      for (const format of FORMATS) {
        await writePoster(theme, locale, format);
      }
    }
  }
  console.log(`[site:brand] generated brand package in ${path.relative(siteRoot, brandRoot)}`);
}

main().catch((error) => {
  console.error(`[site:brand] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
