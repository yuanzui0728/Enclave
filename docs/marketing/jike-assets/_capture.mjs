// Capture admin screenshots for Jike Day 3 / Day 4.
// Usage: cd apps/app && node ../../docs/marketing/jike-assets/_capture.mjs
// Pre: admin must be running at http://127.0.0.1:5181 (pnpm dev:admin),
//      api must be running at http://127.0.0.1:3000 (pnpm dev:api).

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
// pnpm stores it under .pnpm; use a glob to be robust to version bumps.
import { globSync } from "node:fs";
const matches = globSync(
  path.join(repoRoot, "node_modules", ".pnpm", "@playwright+test@*", "node_modules", "@playwright", "test", "index.mjs"),
);
if (matches.length === 0) {
  throw new Error("Could not locate @playwright/test in node_modules/.pnpm");
}
const { chromium } = await import(pathToFileURL(matches[0]).href);
const OUT_DIR = __dirname;

const ADMIN_URL = "http://127.0.0.1:5181";
const ADMIN_SECRET =
  process.env.ADMIN_SECRET ||
  "2d3a38251898df5dac826e40dfdef71192c26c3a8f853640c20674e58b8db365";

const SHOTS = [
  {
    label: "Day 3 · character editor (Zhou Ran fitness coach)",
    route: "/characters/char-preset-zhou-ran-fitness-coach",
    out: "day3/01-character-editor.png",
    waitMs: 4500,
  },
  {
    label: "Day 3 · character factory (auto schedule + relations)",
    route: "/characters/char-preset-zhou-ran-fitness-coach/factory",
    out: "day3/03-character-factory.png",
    waitMs: 4500,
  },
  {
    label: "Day 4 · self-agent dashboard",
    route: "/self-agent",
    out: "day4/01-self-agent-modes.png",
    waitMs: 4500,
  },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    locale: "zh-CN",
  });

  // Seed both legacy admin secret + new cloud-runtime so the bootstrap gate
  // and the API client are both happy without going through email login.
  await ctx.addInitScript(`
    try {
      window.localStorage.setItem("yinjie_admin_secret", ${JSON.stringify(ADMIN_SECRET)});
      window.localStorage.setItem("yinjie-admin-runtime", JSON.stringify({
        apiBaseUrl: "http://127.0.0.1:3000",
        cloudApiBaseUrl: "http://127.0.0.1:3001",
        cloudEmail: "dev@local",
        accessToken: "dev-bypass",
      }));
    } catch (e) {}
  `);

  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("  pageerror:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("  console.err:", m.text().slice(0, 200));
  });

  for (const shot of SHOTS) {
    console.log(`→ ${shot.label}`);
    console.log(`  GET ${shot.route}`);
    const outPath = path.join(OUT_DIR, shot.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    try {
      await page.goto(`${ADMIN_URL}${shot.route}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(shot.waitMs);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`  saved → ${shot.out}`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }

  await browser.close();
  console.log("DONE");
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exit(1);
});
