#!/usr/bin/env node
/**
 * 同步仓库现有资产到 apps/site/public：
 *   docs/screenshots/core-{key}{,.en,.ja,.ko}.png  → public/screenshots/{locale}/{key}.png
 *   docs/assets/yinjie-core-loop{,.en,.ja,.ko}.gif → public/animations/{locale}.webp (动画 WebP，体积 ~80% 小于 GIF)
 *   apps/desktop/src-tauri/icons/icon.png          → public/favicon.png
 * 幂等：仅在源更新时复制。
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const siteRoot = path.dirname(path.dirname(__filename));
const repoRoot = path.resolve(siteRoot, "../../");

const LOCALE_SUFFIX = {
  "zh-CN": "",
  "en-US": ".en",
  "ja-JP": ".ja",
  "ko-KR": ".ko",
};

const SCREENSHOT_KEYS = [
  "chat",
  "moments",
  "feed",
  "group",
  "onboarding",
  "self-character",
];

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function copyIfChanged(src, dst) {
  if (!existsSync(src)) {
    return false;
  }
  if (existsSync(dst)) {
    const s = statSync(src).mtimeMs;
    const d = statSync(dst).mtimeMs;
    if (d >= s) {
      return false;
    }
  }
  ensureDir(path.dirname(dst));
  copyFileSync(src, dst);
  return true;
}

let copied = 0;
let skipped = 0;

// Screenshots
for (const [locale, suffix] of Object.entries(LOCALE_SUFFIX)) {
  for (const key of SCREENSHOT_KEYS) {
    const src = path.join(repoRoot, "docs", "screenshots", `core-${key}${suffix}.png`);
    const dst = path.join(siteRoot, "public", "screenshots", locale, `${key}.png`);
    if (copyIfChanged(src, dst)) copied++;
    else skipped++;
  }
}

// Animations: only emit animated WebP (LCP optimization).
// Sharp keeps animated WebP about 70-80% smaller than the source GIF, and
// hero-section.tsx only references the .webp — shipping the GIF too just
// bloats the public bundle.
const ANIM_SOURCES = Object.entries(LOCALE_SUFFIX).map(([locale, suffix]) => ({
  locale,
  src: path.join(repoRoot, "docs", "assets", `yinjie-core-loop${suffix}.gif`),
  webpDst: path.join(siteRoot, "public", "animations", `${locale}.webp`),
}));

async function emitAnimatedWebp() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn("[site:sync-assets] sharp unavailable, skipping animated WebP");
    return 0;
  }
  let written = 0;
  for (const { src, webpDst } of ANIM_SOURCES) {
    if (!existsSync(src)) continue;
    if (existsSync(webpDst)) {
      const s = statSync(src).mtimeMs;
      const d = statSync(webpDst).mtimeMs;
      if (d >= s) continue;
    }
    await sharp(src, { animated: true })
      .webp({ quality: 80, effort: 4 })
      .toFile(webpDst);
    written++;
  }
  return written;
}

const webpExtra = await emitAnimatedWebp();
copied += webpExtra;

// Favicon (Tauri icon as PNG source)
const faviconSrc = path.join(repoRoot, "apps", "desktop", "src-tauri", "icons", "icon.png");
const faviconDst = path.join(siteRoot, "public", "favicon.png");
if (copyIfChanged(faviconSrc, faviconDst)) copied++;
else skipped++;

// Press kit logo uses a stable public path so media downloads are not coupled to
// favicon filenames.
const pressKitLogoDst = path.join(siteRoot, "public", "press-kit", "enclave-logo-mark-512.png");
if (copyIfChanged(faviconSrc, pressKitLogoDst)) copied++;
else skipped++;

// Multi-size favicons via sharp (16/32/180/192/512)
async function emitFaviconSizes() {
  if (!existsSync(faviconSrc)) return 0;
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn("[site:sync-assets] sharp unavailable, skipping favicon resizing");
    return 0;
  }
  const sizes = [
    [16, "favicon-16.png"],
    [32, "favicon-32.png"],
    [180, "apple-touch-icon.png"],
    [192, "icon-192.png"],
    [512, "icon-512.png"],
  ];
  let written = 0;
  for (const [size, name] of sizes) {
    const dst = path.join(siteRoot, "public", name);
    if (existsSync(dst)) {
      const s = statSync(faviconSrc).mtimeMs;
      const d = statSync(dst).mtimeMs;
      if (d >= s) continue;
    }
    await sharp(faviconSrc).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(dst);
    written++;
  }
  return written;
}

const faviconExtra = await emitFaviconSizes();
copied += faviconExtra;

console.log(`[site:sync-assets] copied=${copied} skipped=${skipped}`);
