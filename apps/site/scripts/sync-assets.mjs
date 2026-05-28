#!/usr/bin/env node
/**
 * 同步仓库现有资产到 apps/site/public：
 *   apps/desktop/src-tauri/icons/icon.png → public/favicon.png + 多尺寸 favicon + press-kit logo
 * 幂等：仅在源更新时复制。
 *
 * 注意：产品截图 public/screenshots/{locale}/*.png 由 scripts/capture-app-screenshots.mjs
 * 直接从真实 app 截取，不再从 docs 同步，本脚本不碰它们（避免覆盖真实截图）。
 * 首页 Hero 已改用真实截图，不再使用动画 WebP。
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const siteRoot = path.dirname(path.dirname(__filename));
const repoRoot = path.resolve(siteRoot, "../../");

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
