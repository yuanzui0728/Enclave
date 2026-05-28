/**
 * Capture REAL product screenshots from the live app UI for the marketing site.
 *
 * NOT a mock harness (cf. apps/app/scripts/screenshot-mobile-routes.mjs which
 * stubs /api/*). This drives the real app against a REAL isolated world so the
 * shots show genuine residents / chats / moments / feed.
 *
 * docs/screenshots is intentionally NOT the source of truth for these PNGs —
 * we write straight into apps/site/public/screenshots/{locale}/. sync-assets.mjs
 * only copies docs/* when it is NEWER, so freshly-written shots survive.
 *
 * Pre-reqs (see .claude/plans/fuzzy-toasting-cook.md):
 *   1. isolated shared-world on :4200 from a copied data-rich tenant DB
 *      (DATABASE_PATH=/tmp/site-shots/... SHARED_WORLD_PORT=4200 ...)
 *   2. isolated app dev server on :5190
 *      (VITE_CORE_API_BASE_URL=http://localhost:4200 vite --port 5190)
 *   NEVER point this at live :4100 / live app / live site.
 *
 * Tenant identity is injected at the network layer via the x-cloud-user-phone
 * header (the world trusts it on loopback; setExtraHTTPHeaders also covers
 * <img>/<video> subresources which can't set headers themselves). Locale is
 * forced per-context with ?locale= + the i18n localStorage key.
 *
 * Usage:
 *   node apps/site/scripts/capture-app-screenshots.mjs
 * Env overrides: APP_BASE_URL, WORLD_BASE_URL, TENANT_PHONE, LOCALES, SHOTS_OUT,
 *   OWNER_ID, OWNER_NAME.
 */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// @playwright/test lives in apps/app's node_modules, not the site's.
const appRequire = createRequire(
  "/home/ps/claude/yinjie-app/apps/app/package.json",
);
const { chromium } = appRequire("@playwright/test");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteDir = resolve(scriptDir, "..");

const APP_BASE_URL = (process.env.APP_BASE_URL || "http://localhost:5190").replace(/\/+$/, "");
const WORLD_BASE_URL = (process.env.WORLD_BASE_URL || "http://localhost:4200").replace(/\/+$/, "");
const TENANT_PHONE = process.env.TENANT_PHONE || "91173587559732";
const OWNER_ID = process.env.OWNER_ID || "5d90d579-8b8e-5ca3-b943-8028ee9e3ae1";
const OWNER_NAME = process.env.OWNER_NAME || "yz";
const SHOTS_OUT = process.env.SHOTS_OUT || resolve(siteDir, "public/screenshots");
const LOCALES = (process.env.LOCALES || "zh-CN,en-US,ja-JP,ko-KR").split(",").map((s) => s.trim()).filter(Boolean);

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

// key → in-app route. Settle gives REST results + media time to paint.
const SHOTS = [
  { key: "chatlist", path: "/tabs/chat", settle: 1800 },
  { key: "chat", path: "/chat/direct_char_need_3d1789f2-306", settle: 3500, scrollBottom: true },
  { key: "group", path: "/group/group-douyin-d2-trio", settle: 3500, scrollBottom: true },
  { key: "moments", path: "/discover/moments", settle: 2800 },
  { key: "feed", path: "/discover/feed", settle: 3200 },
  { key: "experts", path: "/contacts/world-characters", settle: 2200 },
  { key: "avatar", path: "/cyber-avatar", settle: 2600 },
  { key: "profile", path: "/tabs/profile", settle: 1800 },
];

// Chat/group render oldest-first and only jump to newest once the message list
// settles; force every scroll container (and the window) to the bottom so the
// shot shows recent real dialogue, not the "added friend" intro.
async function scrollAllToBottom(page) {
  // 1) brute-force any DOM scroll container to the bottom
  await page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll("*")).filter((e) => {
      const s = getComputedStyle(e);
      return (
        (s.overflowY === "auto" || s.overflowY === "scroll") &&
        e.scrollHeight > e.clientHeight + 40
      );
    });
    for (const e of scrollers) e.scrollTop = e.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  // 2) mouse-wheel over the message area for virtualized/transform scrollers
  //    that don't respond to scrollTop. Long threads need many ticks.
  await page.mouse.move(195, 480);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(90);
  }
  // 3) final scrollTop pin once height has settled
  await page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll("*")).filter((e) => {
      const s = getComputedStyle(e);
      return (
        (s.overflowY === "auto" || s.overflowY === "scroll") &&
        e.scrollHeight > e.clientHeight + 40
      );
    });
    for (const e of scrollers) e.scrollTop = e.scrollHeight;
  });
}

const owner = { id: OWNER_ID, username: OWNER_NAME, onboardingCompleted: true };

function runtimeConfigFor() {
  return {
    apiBaseUrl: WORLD_BASE_URL,
    socketBaseUrl: WORLD_BASE_URL,
    cloudApiBaseUrl: WORLD_BASE_URL,
    worldAccessMode: "local",
    configStatus: "validated",
    environment: "production",
    channel: "web",
    bootstrapSource: "storage",
    publicAppName: "Yinjie",
  };
}

function isBenignConsoleError(text) {
  return (
    (text.includes("/socket.io/") && text.includes("WebSocket")) ||
    text.includes("socket") ||
    text.includes("ResizeObserver")
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const locale of LOCALES) {
      const outDir = resolve(SHOTS_OUT, locale);
      await mkdir(outDir, { recursive: true });

      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA,
        locale,
      });
      await context.setExtraHTTPHeaders({ "x-cloud-user-phone": TENANT_PHONE });
      await context.addInitScript(
        ({ ownerValue, runtimeConfigValue, localeValue }) => {
          localStorage.setItem(
            "yinjie-app-world-owner",
            JSON.stringify({ state: ownerValue, version: 0 }),
          );
          localStorage.setItem(
            "yinjie-app-runtime-config",
            JSON.stringify(runtimeConfigValue),
          );
          localStorage.setItem(
            "yinjie-app-runtime-config-updated-at",
            new Date().toISOString(),
          );
          localStorage.setItem("yinjie-i18n-locale:app", localeValue);
        },
        { ownerValue: owner, runtimeConfigValue: runtimeConfigFor(), localeValue: locale },
      );

      for (const shot of SHOTS) {
        const page = await context.newPage();
        const errors = [];
        page.on("console", (m) => {
          if (m.type() === "error" && !isBenignConsoleError(m.text())) errors.push(m.text());
        });
        page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));

        const sep = shot.path.includes("?") ? "&" : "?";
        const url = `${APP_BASE_URL}${shot.path}${sep}locale=${locale}`;
        let navErr = null;
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForLoadState("networkidle", { timeout: 9000 }).catch(() => {});
          // The isolated world is cold/slow; wait out any "syncing messages"
          // interstitial (multi-locale) before measuring/scrolling.
          await page
            .waitForFunction(
              () =>
                !/正在读取|读取中|加载中|同步这段|载入|Loading|Syncing|読み込|동기화|불러오/.test(
                  document.body.innerText || "",
                ),
              { timeout: 16000 },
            )
            .catch(() => {});
          await page.waitForTimeout(shot.settle ?? 1800);
          if (shot.scrollBottom) {
            await scrollAllToBottom(page);
            await page.waitForTimeout(900);
            await scrollAllToBottom(page); // re-pin after late media reflow
            await page.waitForTimeout(500);
          }
        } catch (e) {
          navErr = e instanceof Error ? e.message : String(e);
        }

        const file = resolve(outDir, `${shot.key}.png`);
        let shotErr = null;
        try {
          await page.screenshot({ path: file, fullPage: false });
        } catch (e) {
          shotErr = e instanceof Error ? e.message : String(e);
        }

        // capture the final URL to detect onboarding-gate redirects to /welcome
        const finalUrl = page.url();
        await page.close();

        const redirected = /\/welcome\b/.test(finalUrl) && shot.path !== "/welcome";
        results.push({ locale, key: shot.key, file, navErr, shotErr, redirected, errCount: errors.length });
        process.stdout.write(
          `[${locale}] ${shot.key.padEnd(10)} ${redirected ? "REDIRECT→welcome " : ""}` +
            `${navErr ? "navErr=" + navErr + " " : ""}${shotErr ? "shotErr=" + shotErr + " " : ""}` +
            `errs=${errors.length}${errors.length ? " :: " + errors[0].slice(0, 120) : ""}\n`,
        );
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const bad = results.filter((r) => r.navErr || r.shotErr || r.redirected);
  console.log(`\ncaptured ${results.length} shots → ${SHOTS_OUT}`);
  if (bad.length) {
    console.log(`⚠ ${bad.length} problematic: ` + bad.map((b) => `${b.locale}/${b.key}`).join(", "));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : e);
  process.exit(1);
});
