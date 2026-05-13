import { chromium } from "/home/ps/claude/yinjie-app/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs";
import { setTimeout as wait } from "node:timers/promises";

const PUBLIC_URL = process.env.YINJIE_APP_TEST_URL || "https://1gw06751dd053.vicp.fun/";
const BUDGET_MS = Number(process.env.YINJIE_APP_TEST_BUDGET_MS || 25_000);

async function measure({ scenario, contextOptions = {}, extraHeaders, beforeNavigate }) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--no-proxy-server",
      "--proxy-server=direct://",
      "--proxy-bypass-list=*",
    ],
  });
  const context = await browser.newContext({
    bypassCSP: true,
    serviceWorkers: "allow",
    extraHTTPHeaders: extraHeaders,
    viewport: { width: 1280, height: 800 },
    ...contextOptions,
  });
  const page = await context.newPage();

  let bytesTransferred = 0;
  let bytesFromCache = 0;
  const requests = [];
  page.on("requestfinished", async (req) => {
    try {
      const sizes = await req.sizes();
      const resp = await req.response();
      const fromSw = resp?.fromServiceWorker?.() ?? false;
      const status = resp?.status() ?? 0;
      const total = (sizes.responseBodySize ?? 0) + (sizes.responseHeadersSize ?? 0);
      if (fromSw) {
        bytesFromCache += total;
      } else {
        bytesTransferred += total;
      }
      requests.push({
        url: req.url().slice(req.url().indexOf("/", 8)),
        method: req.method(),
        status,
        bytes: total,
        fromSw,
      });
    } catch {
      // some navigation may discard before resolve; ignore
    }
  });

  if (beforeNavigate) {
    await beforeNavigate(page, context);
  }

  const navStart = Date.now();
  await page.goto(PUBLIC_URL, { waitUntil: "commit", timeout: BUDGET_MS });
  // Wait for either DOMContentLoaded then for FCP / LCP via PerformanceObserver
  // Inject perf collectors before any further work
  await page.evaluate(() => {
    window.__perfMarks = window.__perfMarks || {};
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          window.__perfMarks.fcp = entry.startTime;
        }
      }
    }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__perfMarks.lcp = entry.startTime;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  await page
    .waitForLoadState("networkidle", { timeout: BUDGET_MS })
    .catch(() => {});

  // 等到 splash 真正离开 boot screen → router 落到 /welcome 或 /tabs/chat
  // 这才是用户能看见可交互 UI 的时刻。boot screen 写死的中文 "欢迎回到你
  // 的世界" 会被路由替换掉。
  const usefulPaintMs = await page.evaluate(async () => {
    const start = performance.now();
    const isStillBootScreen = () => {
      const root = document.querySelector("#root");
      if (!root) return true;
      // boot screen 用的是 .boot-card class
      return Boolean(root.querySelector(".boot-card"));
    };
    while (isStillBootScreen() && performance.now() - start < 25_000) {
      await new Promise((r) => setTimeout(r, 60));
    }
    return performance.now();
  });

  // Allow LCP a bit more time after networkidle to settle.
  await wait(400);

  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByType("paint");
    const fcpFromObserver = window.__perfMarks?.fcp;
    const fcpFromPaint = paint.find((p) => p.name === "first-contentful-paint")?.startTime;
    const swReg = navigator.serviceWorker?.controller ? "controlled" : "no-controller";
    return {
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      loadEvent: nav?.loadEventEnd ?? null,
      ttfb: nav?.responseStart ?? null,
      fcp: fcpFromObserver ?? fcpFromPaint ?? null,
      lcp: window.__perfMarks?.lcp ?? null,
      swReg,
      title: document.title,
      bodyTextLen: (document.body?.innerText ?? "").length,
    };
  });

  const navEnd = Date.now();
  const wallClock = navEnd - navStart;

  // For warm scenarios we may want SW activated; ensure it's done before next call
  await page.evaluate(async () => {
    if (navigator.serviceWorker?.ready) {
      await navigator.serviceWorker.ready.catch(() => {});
    }
  });

  const summary = {
    scenario,
    wallClockMs: wallClock,
    usefulPaintMs: usefulPaintMs?.toFixed?.(0) ?? null,
    ...perf,
    bytesTransferred,
    bytesFromCache,
    requestCount: requests.length,
  };

  await context.close();
  await browser.close();
  return { summary, requests };
}

function fmtBytes(n) {
  if (!n) return "0";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

function printSummary(s) {
  console.log(`  scenario          : ${s.scenario}`);
  console.log(`  wall clock        : ${s.wallClockMs}ms`);
  console.log(`  useful paint *    : ${s.usefulPaintMs ?? "n/a"}ms (boot screen 离开后)`);
  console.log(`  TTFB              : ${s.ttfb?.toFixed(0)}ms`);
  console.log(`  FCP (boot screen) : ${s.fcp?.toFixed(0) ?? "n/a"}ms`);
  console.log(`  LCP               : ${s.lcp?.toFixed(0) ?? "n/a"}ms`);
  console.log(`  DOMContentLoaded  : ${s.domContentLoaded?.toFixed(0) ?? "n/a"}ms`);
  console.log(`  load event      : ${s.loadEvent?.toFixed(0) ?? "n/a"}ms`);
  console.log(`  bytes from net  : ${fmtBytes(s.bytesTransferred)}`);
  console.log(`  bytes from SW   : ${fmtBytes(s.bytesFromCache)}`);
  console.log(`  request count   : ${s.requestCount}`);
  console.log(`  SW state        : ${s.swReg}`);
  console.log(`  title           : ${s.title}`);
  console.log(`  body text len   : ${s.bodyTextLen}`);
}

(async () => {
  console.log(`URL: ${PUBLIC_URL}`);
  console.log("");
  console.log("=== Scenario A: 冷启动（无 SW、无 cache） ===");
  const cold = await measure({ scenario: "cold" });
  printSummary(cold.summary);
  // Print top 8 largest requests
  console.log("  top 8 requests by bytes:");
  cold.requests
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8)
    .forEach((r) => {
      console.log(
        `    ${(r.bytes / 1024).toFixed(1).padStart(7)}KB  ${r.method} ${r.status} ${r.url}`,
      );
    });
  console.log("");

  console.log("=== Scenario B: SW 注册热身（首次访问 + 等 SW activate） ===");
  // Use shared storage by passing storageState, but easier: re-run navigation in same context.
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--no-proxy-server",
      "--proxy-server=direct://",
      "--proxy-bypass-list=*",
    ],
  });
  const context = await browser.newContext({
    serviceWorkers: "allow",
    viewport: { width: 1280, height: 800 },
  });
  const warmupPage = await context.newPage();
  warmupPage.on("console", (msg) => {
    if (msg.type() === "error") console.log(`  [warmup console.error] ${msg.text()}`);
  });
  await warmupPage.goto(PUBLIC_URL, { waitUntil: "load", timeout: BUDGET_MS });
  // 强制注册 SW（绕开 idle callback 的不确定性）
  const regResult = await warmupPage.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "no-sw-api";
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      // 等到 active 状态
      const start = Date.now();
      while (Date.now() - start < 15000) {
        if (reg.active) {
          return `active after ${Date.now() - start}ms; controller=${navigator.serviceWorker.controller ? "yes" : "no"}`;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return "timeout-no-active";
    } catch (e) {
      return `err: ${e?.message ?? e}`;
    }
  });
  console.log(`  SW register result: ${regResult}`);
  // 给 workbox precache + clientsClaim 一点时间
  await wait(3000);
  await warmupPage.close();

  console.log("=== Scenario C: 二次访问（同一 context，SW 已激活） ===");
  const warmPage = await context.newPage();
  let bytesTransferred = 0;
  let bytesFromCache = 0;
  const requests = [];
  warmPage.on("requestfinished", async (req) => {
    try {
      const sizes = await req.sizes();
      const resp = await req.response();
      const fromSw = resp?.fromServiceWorker?.() ?? false;
      const status = resp?.status() ?? 0;
      const total = (sizes.responseBodySize ?? 0) + (sizes.responseHeadersSize ?? 0);
      const bodyBytes = sizes.responseBodySize ?? 0;
      // Disk-cache hit在 chromium 里 responseBodySize=0 而 status=200 / 304
      const cacheHit = !fromSw && bodyBytes === 0 && status >= 200 && status < 400;
      if (fromSw) bytesFromCache += total;
      else if (!cacheHit) bytesTransferred += total;
      requests.push({
        url: req.url().slice(req.url().indexOf("/", 8)),
        method: req.method(),
        status,
        bytes: total,
        bodyBytes,
        fromSw,
        cacheHit,
      });
    } catch {}
  });
  const warmStart = Date.now();
  await warmPage.goto(PUBLIC_URL, { waitUntil: "commit", timeout: BUDGET_MS });
  await warmPage.evaluate(() => {
    window.__perfMarks = window.__perfMarks || {};
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") window.__perfMarks.fcp = entry.startTime;
      }
    }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__perfMarks.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await warmPage.waitForLoadState("networkidle", { timeout: BUDGET_MS }).catch(() => {});
  const warmUseful = await warmPage.evaluate(async () => {
    const start = performance.now();
    const isStillBootScreen = () => {
      const root = document.querySelector("#root");
      if (!root) return true;
      return Boolean(root.querySelector(".boot-card"));
    };
    while (isStillBootScreen() && performance.now() - start < 25_000) {
      await new Promise((r) => setTimeout(r, 60));
    }
    return performance.now();
  });
  await wait(400);
  const warmPerf = await warmPage.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      ttfb: nav?.responseStart,
      fcp: window.__perfMarks?.fcp ?? null,
      lcp: window.__perfMarks?.lcp ?? null,
      domContentLoaded: nav?.domContentLoadedEventEnd,
      loadEvent: nav?.loadEventEnd,
      swReg: navigator.serviceWorker?.controller ? "controlled" : "no-controller",
      title: document.title,
      bodyTextLen: (document.body?.innerText ?? "").length,
    };
  });
  const warmEnd = Date.now();
  printSummary({
    scenario: "warm",
    wallClockMs: warmEnd - warmStart,
    usefulPaintMs: warmUseful?.toFixed?.(0) ?? null,
    ...warmPerf,
    bytesTransferred,
    bytesFromCache,
    requestCount: requests.length,
  });
  // 分类汇总
  const swCount = requests.filter((r) => r.fromSw).length;
  const cacheCount = requests.filter((r) => r.cacheHit).length;
  const netCount = requests.filter((r) => !r.fromSw && !r.cacheHit).length;
  console.log(`  request breakdown: ${swCount} SW + ${cacheCount} HTTP cache + ${netCount} network`);
  console.log("  top 8 requests by bytes:");
  requests
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8)
    .forEach((r) => {
      const tag = r.fromSw ? "(SW)  " : r.cacheHit ? "(cache)" : "(net) ";
      console.log(
        `    ${(r.bytes / 1024).toFixed(1).padStart(7)}KB  ${r.method} ${r.status} ${tag} ${r.url}`,
      );
    });

  await context.close();
  await browser.close();
  console.log("");
  console.log("done.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
