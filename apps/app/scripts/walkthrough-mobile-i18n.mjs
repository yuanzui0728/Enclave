// 多语言走查：对每个 mobile route × 每个非中文 locale 真打开页面，
// 取 body.innerText，按"出现了简体中文专属字符"判定有未翻译漏出。
//
// 用法：
//   node apps/app/scripts/walkthrough-mobile-i18n.mjs [--locale ja-JP,ko-KR,en-US]
//     [--route /tabs/chat,...] [--out logs/i18n-walkthrough]
//
// 退出码：发现 leak 时 1，否则 0。

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  appDir,
  extendedRoutePaths,
  installApiMocks,
  resolveAuditServer,
  routeIdleTimeoutMs,
  routeSettleMs,
  runtimeConfigTemplate,
  seedAuditLocalStorage,
  shouldIgnoreConsoleError,
  systemStatus,
} from "./lib/mobile-audit-fixtures.mjs";

const repoRoot = resolve(appDir, "..", "..");

// 简体中文专属字符（日语 kanji 不使用 / 用其它写法的简体字）。
// 命中说明文本是从 zh-CN 漏出来的，不是 ja-JP 偶然撞到的相同 kanji。
const SIMP_CN_ONLY = new RegExp(
  "[" +
    [
      "这", "为", "时", "对", "队", "关", "务", "续", "联", "调", "实",
      "测", "门", "复", "义", "错", "读", "优", "级", "险", "备", "启",
      "线", "题", "饭", "顾", "顺", "颜", "顶", "频", "顿", "频", "饮",
      "馆", "馈", "馆", "饮", "饿", "馍", "饼",
      // 仅简体 / 不是日语常用写法的
      "贝", "财", "买", "卖", "费", "贵", "资", "贷", "购", "贸",
      "门", "问", "间", "闻", "闹", "闭", "闪",
      "马", "驾", "驶", "骑", "驱", "驻", "骄",
      "鸟", "鸡", "鸭", "鹅", "鸿",
      "鱼", "鲜", "鳥",
      "见", "现", "观", "规", "视", "览",
      "车", "辆", "运", "连", "进",
      "国", "图", "园", "围", "团", "圆",
      "电", "无", "众", "众",
      // 已经在前两轮里发现过的标记字
      "题", "复", "继", "续", "终",
    ].join("") +
    "]",
);

// 提取 viewport 里"可见可读"的文本节点的最小 puppeteer 函数。
function buildTextScraper() {
  return () => {
    const isVisible = (el) => {
      if (!(el instanceof Element)) return true;
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") {
        return false;
      }
      if (Number(style.opacity || "1") === 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return true;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue?.trim() ?? "";
        if (!text) return NodeFilter.FILTER_REJECT;
        let parent = node.parentElement;
        while (parent && parent !== document.body) {
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
          parent = parent.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const out = [];
    let node;
    while ((node = walker.nextNode())) {
      const tag = node.parentElement?.tagName ?? "BODY";
      const cls = node.parentElement?.className ?? "";
      out.push({ text: node.nodeValue.trim(), tag, cls: typeof cls === "string" ? cls.slice(0, 80) : "" });
    }
    // Also include aria-label / placeholder / title attributes that render to AT
    const attrEls = document.querySelectorAll(
      "[aria-label],[placeholder],[title]",
    );
    for (const el of attrEls) {
      if (!isVisible(el)) continue;
      for (const attr of ["aria-label", "placeholder", "title"]) {
        const v = el.getAttribute(attr);
        if (v && v.trim()) out.push({ text: v.trim(), tag: el.tagName, cls: "@" + attr });
      }
    }
    return out;
  };
}

function parseArgs(argv) {
  const opts = {
    locales: ["en-US", "ja-JP", "ko-KR"],
    routes: extendedRoutePaths,
    outDir: null,
    viewport: "mobile",
    clickEvery: 6, // click up to N buttons per page in turn, scraping after each.
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--locale") opts.locales = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--locale=")) opts.locales = a.slice("--locale=".length).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--route") opts.routes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--route=")) opts.routes = a.slice("--route=".length).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--out") opts.outDir = argv[++i];
    else if (a.startsWith("--out=")) opts.outDir = a.slice("--out=".length);
    else if (a === "--viewport") opts.viewport = argv[++i];
    else if (a.startsWith("--viewport=")) opts.viewport = a.slice("--viewport=".length);
    else if (a === "--click-every") opts.clickEvery = Number(argv[++i]);
    else if (a.startsWith("--click-every=")) opts.clickEvery = Number(a.slice("--click-every=".length));
  }
  return opts;
}

// Native language names that are intentionally shown in their own script
// (so users can find their language in the picker regardless of current UI locale).
const NATIVE_LOCALE_LABELS = new Set([
  "简体中文",
  "日本語",
  "한국어",
  "English",
]);

// CSS class names on the bootstrap splash. BootstrapScreen renders raw zh-CN
// source while waiting for the i18n catalog to hydrate (by design — translation
// macros can't resolve until the catalog loads). Any text node inside one of
// these classes is a splash artifact, not a leak in the actual app UI.
const BOOTSTRAP_CLASSES = new Set([
  "boot-logo",
  "boot-title",
  "boot-copy",
  "boot-step-value",
  "boot-notice",
]);

function isBootstrapNode(item) {
  if (!item.cls) return false;
  for (const cls of BOOTSTRAP_CLASSES) {
    if (item.cls.includes(cls)) return true;
  }
  return false;
}

function isLeak(text, locale, item) {
  // Native language picker labels are not leaks.
  if (NATIVE_LOCALE_LABELS.has(text.trim())) return false;
  // Bootstrap splash copy renders raw zh-CN by design.
  if (item && isBootstrapNode(item)) return false;
  // CJK ideograph range
  const CJK = /[㐀-䶿一-鿿]/;
  const KANA = /[぀-ヿ]/;
  const HANGUL = /[가-힯]/;
  // Stage-1 filter: must contain CJK ideograph at all
  if (!CJK.test(text)) return false;

  // Strip placeholders like {0}, {name} that are not leaks
  const stripped = text.replace(/\{[^}]*\}/g, "");
  if (!CJK.test(stripped)) return false;

  if (locale === "en-US") return true; // any CJK in en-US is a leak
  if (locale === "ja-JP") {
    // ja-JP: leak only if there's a simplified-Chinese-only char AND no kana
    if (KANA.test(stripped)) return false;
    return SIMP_CN_ONLY.test(stripped);
  }
  if (locale === "ko-KR") {
    // ko-KR: any CJK without Hangul anywhere in the string is a leak
    if (HANGUL.test(stripped)) return false;
    return true;
  }
  return false;
}

async function visitRoute(page, baseUrl, route, locale, clickBudget) {
  const url = `${baseUrl}${route}?locale=${encodeURIComponent(locale)}`;
  const errors = [];
  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
  page.on("pageerror", (e) => errors.push(`pageerror: ${e?.message ?? e}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !shouldIgnoreConsoleError(msg.text())) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch (err) {
    errors.push(`goto: ${err?.message ?? err}`);
  }
  await page.waitForLoadState("networkidle", { timeout: routeIdleTimeoutMs }).catch(() => undefined);
  await page.waitForTimeout(routeSettleMs);
  // Wait up to 20s for the bootstrap screen to disappear (catalog hydrate).
  // Catalog is ~106KB gzipped — on a cold cache run plus Vite hot-compile,
  // hydration plus first paint can occasionally exceed 10s.
  let stillBootstrapping = false;
  try {
    await page.waitForFunction(
      () => !document.querySelector(".boot-logo"),
      null,
      { timeout: 20000 },
    );
  } catch {
    stillBootstrapping = await page
      .evaluate(() => !!document.querySelector(".boot-logo"))
      .catch(() => false);
  }
  // If the page is *still* stuck on bootstrap copy, the audit env failed to
  // hydrate — don't pollute the leak report with raw zh-CN source strings
  // from the bootstrap screen (which renders raw msg.message when catalog
  // is not yet ready, by design).
  if (stillBootstrapping) {
    return {
      url,
      errors: [...errors, "bootstrap-screen-never-hydrated"],
      totalNodes: 0,
      items: [],
      leaks: [],
    };
  }
  // Scroll to bottom and back to render off-screen lazy content. Wrap in
  // try/catch because the page can navigate mid-scroll (e.g. some routes
  // auto-redirect after mount) which destroys the execution context.
  try {
    await page.evaluate(async () => {
      const main = document.scrollingElement || document.body;
      main.scrollTo({ top: main.scrollHeight, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 200));
      main.scrollTo({ top: 0, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 100));
    });
  } catch {
    // Navigation cancelled the eval; keep going with whatever rendered.
  }
  const allItems = [];
  const seenTexts = new Set();
  const addItems = (items) => {
    for (const it of items) {
      const k = it.text + "|" + it.tag;
      if (seenTexts.has(k)) continue;
      seenTexts.add(k);
      allItems.push(it);
    }
  };
  addItems(await page.evaluate(buildTextScraper()));

  // Try clicking up to clickBudget unique buttons in sequence, scraping text
  // between each. This exposes modals, panels, in-game UI etc. that don't
  // appear in the landing state. We deliberately skip anchor tags / role=link
  // to stay on-route. Also skip the language picker — clicking a locale there
  // switches the app locale mid-audit and pollutes subsequent scrapes.
  const isGameRoute = route.includes("/games") || route.includes("game=");
  const isLocalePickerRoute = route.startsWith("/profile/settings");
  if (isLocalePickerRoute) {
    // Render landing state only; do not interact (avoids triggering locale change).
    const leaks = allItems.filter((it) => isLeak(it.text, locale, it));
    return { url, errors, totalNodes: allItems.length, items: allItems, leaks };
  }
  const budget = isGameRoute ? Math.max(clickBudget, 6) : clickBudget;
  for (let i = 0; i < budget; i += 1) {
    let clicked;
    try {
      clicked = await page.evaluate(
      ({ skipIndex, isGameRoute }) => {
        const buttons = Array.from(
          document.querySelectorAll("button, [role=button]"),
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          // Skip nav-style tabs and back buttons so we stay on this route.
          const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
          const text = (el.textContent || "").trim();
          if (
            /back|close|关闭|返回|戻る|닫기|뒤로|キャンセル|cancel|取消|취소/i.test(
              ariaLabel + " " + text,
            )
          ) {
            return false;
          }
          // For non-game routes, also avoid tab bar buttons (they switch tabs).
          if (!isGameRoute && el.closest("[data-tab-bar],[role=tablist]")) {
            return false;
          }
          return true;
        });
        if (skipIndex >= buttons.length) return null;
        const btn = buttons[skipIndex];
        try {
          btn.click();
        } catch {
          return null;
        }
        return btn.textContent?.trim().slice(0, 60) ?? "";
      },
      { skipIndex: i, isGameRoute },
      );
    } catch {
      // Page navigated during the click evaluate; stop this route's click loop.
      break;
    }
    if (clicked === null) break;
    await page.waitForTimeout(350);
    // If the click navigated away or destroyed the execution context (e.g., a
    // link click), our subsequent page.evaluate calls will throw "Execution
    // context was destroyed". Treat any such failure as "state broken" and abort.
    let stateBroken = false;
    try {
      stateBroken = await page.evaluate(
        ({ expectedLocale }) => {
          const stored = localStorage.getItem("yinjie-i18n-locale:app");
          return stored !== expectedLocale;
        },
        { expectedLocale: locale },
      );
    } catch {
      stateBroken = true;
    }
    if (stateBroken) {
      try {
        await page.evaluate(
          ({ expectedLocale }) => {
            localStorage.setItem("yinjie-i18n-locale:app", expectedLocale);
          },
          { expectedLocale: locale },
        );
      } catch {
        // page may still be navigating; nothing to restore.
      }
      break;
    }
    try {
      addItems(await page.evaluate(buildTextScraper()));
    } catch {
      // Page navigated mid-scrape; stop the click loop for this route.
      break;
    }
    // Close any dialog opened (Escape) so the next click can target fresh elements.
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(120);
  }

  const leaks = allItems.filter((it) => isLeak(it.text, locale, it));
  return { url, errors, totalNodes: allItems.length, items: allItems, leaks };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = opts.outDir
    ? resolve(repoRoot, opts.outDir)
    : resolve(repoRoot, "logs", "i18n-walkthrough", runStamp);
  await mkdir(outDir, { recursive: true });
  const server = await resolveAuditServer();

  const summary = { runStamp, baseUrl: server.baseUrl, locales: opts.locales, routes: opts.routes, results: [] };
  let totalLeaks = 0;
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const viewportConfig =
        opts.viewport === "desktop"
          ? {
              viewport: { width: 1280, height: 800 },
              isMobile: false,
              hasTouch: false,
              userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
            }
          : {
              viewport: { width: 375, height: 812 },
              isMobile: true,
              hasTouch: true,
              userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
            };
      for (const locale of opts.locales) {
        const context = await browser.newContext(viewportConfig);
        const runtimeConfig = { ...runtimeConfigTemplate, apiBaseUrl: server.baseUrl, socketBaseUrl: server.baseUrl };
        await seedAuditLocalStorage(context, runtimeConfig);
        await context.addInitScript((targetLocale) => {
          localStorage.setItem("yinjie-i18n-locale:app", targetLocale);
        }, locale);

        for (const route of opts.routes) {
          // Use a fresh page per route so prior-route click side effects
          // (saved drafts, retry queues, error toasts in zustand store) don't
          // bleed into subsequent route's scrape and produce spurious leaks.
          const page = await context.newPage();
          await installApiMocks(page, systemStatus);
          const result = await visitRoute(page, server.baseUrl, route, locale, opts.clickEvery);
          totalLeaks += result.leaks.length;
          summary.results.push({ locale, route, ...result });
          if (result.leaks.length || result.errors.length) {
            const prefix = `[${locale} ${route}]`;
            for (const e of result.errors.slice(0, 3)) console.warn(`${prefix} ${e}`);
            for (const leak of result.leaks.slice(0, 5)) {
              console.warn(`${prefix} leak: ${JSON.stringify(leak.text)} <${leak.tag}.${leak.cls}>`);
            }
            if (result.leaks.length > 5) console.warn(`${prefix} ...and ${result.leaks.length - 5} more leaks`);
          } else {
            console.log(`[${locale} ${route}] OK (${result.totalNodes} text nodes)`);
          }
          await page.close();
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
  await writeFile(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`\nWrote ${resolve(outDir, "summary.json")} · total leaks: ${totalLeaks}`);
  process.exit(totalLeaks > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
