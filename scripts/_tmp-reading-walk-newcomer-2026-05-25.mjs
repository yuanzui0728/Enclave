#!/usr/bin/env node
// 角色目录「阅读」端到端走查（newcomer / 真实 UI：vite preview 5184 + wiki-api 3500）
// 纯读路径，不触发写额度（不 edit/create/talk/delete），因此可反复跑多轮。
// 唯一会烧配额的是「朗读全文」TTS——本走查只验证按钮存在/禁用态，绝不点合成。
// 覆盖：列表渲染/排序/计数/错误兜底/空态/XSS、详情读视图（h1/tabs/版本条隐藏/
// relationship 本地化/分区/footer/朗读按钮）、读 API 正确性、历史读（无回滚入口）、
// diff 读、搜索读、边缘态（deleted/pending_create/不存在/半保护）。
import pkg from "/home/ps/claude/yinjie-app/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js";
const { chromium } = pkg;
import { setTimeout as sleep } from "node:timers/promises";

const WIKI = "http://127.0.0.1:5184";
const API = "http://127.0.0.1:3500/api";
const TEST_CID = "char_wiki_wiki-walkthrough-test"; // active, relationshipType=expert, relationship=测试伙伴
const DELETED_CID = "char_wiki_1778888697027_67e67c25";
const PENDING_CREATE_CID = "char_wiki_iixuan_05";
const PROTECTED_CID = "char_wiki_1779688391683_0c9c71e7"; // semi
const ROUND = process.env.ROUND || "R?";
const WALK_USER = process.env.WALK_USER || "_zwalk_newcomer";
// 详情页 relationshipType 不该露出的英文哨兵 / 脏数据
const SENTINELS = ["friend", "expert", "mentor", "family", "self", "custom"];

const passes = [], issues = [];
const pass = (s) => { console.log(`  ✅ ${s}`); passes.push(s); };
const fail = (s, d = "") => { console.log(`  ❌ ${s}${d ? "\n     " + d : ""}`); issues.push({ s, d }); };
const info = (s) => console.log(`  ·  ${s}`);

// wiki-api(3500) 偶发被重启（无稳定常驻 respawner），重启窗口里裸 fetch 直接
// ECONNREFUSED。所有顶层 fetch 走带退避重试的 fetchJson；并在开跑前先 waitForApi
// 轮询 /wiki/pages 直到 200，把环境抖动和真正的产品缺陷分开。
async function fetchJson(url, opts, tries = 10) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await (await fetch(url, opts)).json(); }
    catch (e) { lastErr = e; await sleep(700); }
  }
  throw lastErr;
}
async function waitForApi() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${API}/wiki/pages`); if (r.ok) return; } catch { /* retry */ }
    await sleep(700);
  }
}
await waitForApi();
const login = await fetchJson(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: WALK_USER, password: "123456" }) });
const { token, user } = login;
if (!token || user?.role !== "newcomer") { console.error("login failed / not newcomer:", JSON.stringify(login).slice(0, 300)); process.exit(1); }
const realRows = await fetchJson(`${API}/wiki/pages`);
const apiHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const browser = await chromium.launch({ headless: true });
async function freshPage({ anon = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "zh-CN" });
  const p = await ctx.newPage();
  if (!anon) await p.addInitScript(([t, u]) => { localStorage.setItem("yinjie.wiki.token", t); localStorage.setItem("yinjie.wiki.user", JSON.stringify(u)); }, [token, user]);
  // vite preview(5184) 有外部 respawner，偶发被 kill→重启，期间 ERR_CONNECTION_REFUSED。
  // 包一层 goto 重试，避免这类纯环境抖动把整轮走查打断（非产品缺陷）。
  const origGoto = p.goto.bind(p);
  p.goto = async (url, opts) => {
    let lastErr;
    for (let i = 0; i < 8; i++) {
      try { return await origGoto(url, opts); }
      catch (e) { if (!/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/.test(String(e?.message))) throw e; lastErr = e; await sleep(600); }
    }
    throw lastErr;
  };
  const errs = [];
  const benign = (txt) => /Failed to load resource|the server responded with a status of|net::ERR_|favicon/i.test(txt);
  p.on("console", (m) => { if (m.type() === "error" && !benign(m.text())) errs.push(m.text().slice(0, 240)); });
  p.on("pageerror", (e) => errs.push("pageerror:" + (e?.message ?? e)));
  return { ctx, p, errs };
}

// 共享 wiki-api(3500) 被并发会话（创建角色走查）按轮重启以重置写额度桶——纯读走查
// 命中重启窗口时，5184 仍在但代理上游 3500 报错 → react-query error，依赖真实内容
// 渲染的 selector（如 header h2 / ul.grid>li）等不到，会被误判成产品缺陷。loadUntil
// goto 后等目标 selector，超时就 reload 重试几次（API 恢复后即成功），把环境抖动
// 与真缺陷分开。selector 始终不出现（真错误）则抛错，让对应断言照常失败。
async function loadUntil(p, url, selector, { tries = 4, timeout = 7000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      if (i === 0) await p.goto(url, { waitUntil: "domcontentloaded" });
      else await p.reload({ waitUntil: "domcontentloaded" });
      await p.waitForSelector(selector, { timeout });
      return true;
    } catch (e) { lastErr = e; await sleep(800); }
  }
  throw lastErr;
}

console.log(`\n========== newcomer「阅读」走查 ${ROUND} ==========`);

// ── A. 列表渲染 / 计数 / 下沉 / 孤立分隔符 / 英文哨兵 / focus / console ──
console.log("\n=== A. 角色目录列表 ===");
{
  const { ctx, p, errs } = await freshPage();
  await loadUntil(p, `${WIKI}/`, "ul.grid > li", { timeout: 10000 });
  const countText = (await p.locator('text=/共 \\d+ 个词条/').first().textContent().catch(() => null))?.trim();
  if (countText && /共 \d+ 个词条/.test(countText)) pass(`计数行已落定: "${countText}"`); else fail("计数行未显示 共N个词条", String(countText));
  if (await p.locator('text=正在加载词条').count() === 0) pass("计数行无残留『正在加载词条…』"); else fail("计数行卡在加载中");
  const names = await p.locator('ul.grid > li h2').allTextContents();
  const firstU = names.findIndex((n) => n.trim().startsWith("_"));
  const lastNonU = names.map((n) => n.trim().startsWith("_")).lastIndexOf(false);
  if (firstU === -1 || firstU > lastNonU) pass(`下划线测试角色已下沉末尾（${names.length} 张卡）`); else fail("下划线角色未下沉", `首下划线@${firstU} < 末正常@${lastNonU}`);
  const relTexts = await p.locator('ul.grid > li > a > div:first-child div.truncate').allTextContents();
  const orphan = relTexts.filter((tx) => /^\s*·|·\s*$/.test(tx.trim()));
  if (orphan.length === 0) pass(`列表 relationship 无孤立分隔符（${relTexts.length} 行）`); else fail("列表孤立 · 分隔符", JSON.stringify(orphan.slice(0, 3)));
  const sentinel = relTexts.filter((tx) => SENTINELS.some((s) => new RegExp(`(^|\\s·\\s)${s}\\s*$`).test(tx.trim())));
  if (sentinel.length === 0) pass(`列表 relationship 已本地化（无英文哨兵，${relTexts.length} 行）`); else fail("列表露出英文哨兵", JSON.stringify(sentinel.slice(0, 3)));
  const firstCard = p.locator('ul.grid > li a').first();
  await firstCard.focus();
  const outline = await firstCard.evaluate((el) => getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth);
  if (/solid/.test(outline) && !/(^|\s)0px/.test(outline)) pass(`卡片键盘 focus 可见 (${outline})`); else fail("卡片 focus 不可见", outline);
  if (errs.length === 0) pass("列表无 console error"); else fail("列表 console error", errs.join(" | "));
  await ctx.close();
}

// ── B. 列表加载失败兜底 ──
console.log("\n=== B. 列表加载失败兜底 ===");
{
  const { ctx, p } = await freshPage();
  await p.route("**/api/wiki/pages", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "走查注入故障" }) }));
  await p.goto(`${WIKI}/`, { waitUntil: "domcontentloaded" });
  await sleep(1200);
  if (await p.locator('text=正在加载词条').count() === 0) pass("加载失败时计数行不再卡『正在加载词条…』"); else fail("加载失败仍卡在加载中文案");
  if (await p.locator('[role="alert"]').count() > 0) pass("加载失败展示 ErrorBlock(role=alert)"); else fail("加载失败无 ErrorBlock");
  await ctx.close();
}

// ── C. 列表空态 ──
console.log("\n=== C. 列表空态 ===");
{
  const { ctx, p } = await freshPage();
  await p.route("**/api/wiki/pages", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await p.goto(`${WIKI}/`, { waitUntil: "domcontentloaded" });
  await sleep(900);
  const body = await p.textContent("body");
  if (/还没有任何角色词条/.test(body)) pass("空态展示 PanelEmpty 文案"); else fail("空态未展示空文案", body.slice(0, 120));
  if (await p.locator("ul.grid > li").count() === 0) pass("空态无残留卡片"); else fail("空态仍渲染卡片");
  await ctx.close();
}

// ── D. XSS：name/bio 纯文本渲染 ──
console.log("\n=== D. 列表 XSS 安全 ===");
{
  const { ctx, p } = await freshPage();
  const rows = JSON.parse(JSON.stringify(realRows));
  if (rows[0]) { rows[0].name = "<img src=x onerror=window.__xss=1>注入名"; rows[0].bio = "<script>window.__xss=1</script>注入简介"; }
  await p.route("**/api/wiki/pages", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) }));
  let xssFired = false;
  await p.exposeFunction("__reportXss", () => { xssFired = true; });
  await p.addInitScript(() => { Object.defineProperty(window, "__xss", { set() { window.__reportXss?.(); } }); });
  await p.goto(`${WIKI}/`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("ul.grid > li"); await sleep(500);
  const body = await p.textContent("body");
  if (!xssFired && body.includes("注入名")) pass("name/bio 作为纯文本渲染，未执行注入脚本"); else fail("疑似 XSS 执行", `xss=${xssFired}`);
  await ctx.close();
}

// ── E. 详情读视图（newcomer）──
console.log("\n=== E. 角色详情读视图（newcomer）===");
{
  const { ctx, p, errs } = await freshPage();
  // 等 header h2（真实内容），不是 tablist——tablist 在 pageQ.data 缺失时也会渲染，
  // 共享 API 重启窗口里会出现"有 tab 没正文"假象。等不到内容就 reload 重试。
  await loadUntil(p, `${WIKI}/character/${TEST_CID}`, "header h2", { timeout: 10000 });
  await sleep(400);
  const srH1 = await p.locator("h1.sr-only").count();
  if (srH1 === 1) pass("详情挂 1 个 sr-only h1（tab 切换不丢标题）"); else fail("sr-only h1 数量异常", `count=${srH1}`);
  const h1Total = await p.locator("h1").count();
  if (h1Total === 1) pass("全页仅 1 个 h1（WCAG 单 h1）"); else fail("h1 数量非 1", `count=${h1Total}`);
  const h2 = (await p.locator("h2").first().textContent().catch(() => ""))?.trim();
  if (h2) pass(`详情可视化 h2 渲染: "${h2}"`); else fail("详情无可视 h2");
  const verBar = await p.locator('[role="tab"]:has-text("稳定版"), [role="tab"]:has-text("最新版")').count();
  if (verBar === 0) pass("newcomer 无『稳定版/最新版』版本切换条"); else fail("newcomer 错误看到版本切换条", `count=${verBar}`);
  // 关键：relationship 本地化（expert → 专家，不露英文）
  const relLine = (await p.locator('header div.text-\\[var\\(--text-muted\\)\\]').first().textContent().catch(() => "")) || (await p.locator("header").first().textContent().catch(() => ""));
  const detailSentinel = SENTINELS.filter((s) => new RegExp(`(^|\\s·\\s|\\b)${s}(\\s|$)`).test(relLine));
  if (detailSentinel.length === 0) pass(`详情 relationship 本地化无英文哨兵（"${relLine.trim().slice(0,40)}"）`); else fail("详情 relationship 露出英文哨兵", `${detailSentinel} in "${relLine.trim()}"`);
  if (/专家/.test(relLine)) pass("详情 relationshipType=expert 正确显示为『专家』"); else info(`详情 relationship 行="${relLine.trim().slice(0,60)}"`);
  // 分区渲染
  for (const sec of ["简介", "核心逻辑", "聊天场景提示词"]) {
    if (await p.locator(`h3:has-text("${sec}"), section:has-text("${sec}")`).count() > 0) info(`分区『${sec}』在`); else fail(`详情缺分区: ${sec}`);
  }
  // 4 tab 切换
  for (const tabName of ["阅读", "编辑", "历史", "讨论"]) {
    const tab = p.locator(`[role="tab"]:has-text("${tabName}")`).first();
    if (await tab.count() === 0) { fail(`主 tab 缺失: ${tabName}`); continue; }
    await tab.click(); await sleep(250);
    if (await tab.getAttribute("aria-selected") === "true") info(`tab『${tabName}』可切换`); else fail(`tab『${tabName}』点击后未选中`);
  }
  // 朗读按钮存在（不点合成，避免烧 TTS 配额）
  await p.locator('[role="tab"]:has-text("阅读")').first().click(); await sleep(300);
  const listenBtn = p.locator('button[aria-label="朗读全文"]');
  if (await listenBtn.count() > 0) pass("阅读视图含『朗读全文』按钮"); else info("无朗读按钮（narrationText 为空？）");
  if (errs.length === 0) pass("详情页无 console error"); else fail("详情 console error", errs.join(" | "));
  await ctx.close();
}

// ── E2. relationship 本地化全哨兵 + 脏数据（route 注入，确定性验证）──
// 每个用例用独立 context（绕开 react-query 缓存：同 characterId/viewMode 不会重拉），
// 只拦详情读端点（GET /wiki/pages/<cid>[?view=]，不碰 /history /watch /diff），
// 读卡片 header 内 text-muted 的 relationship/region 行（不是站点顶部 nav header）。
console.log("\n=== E2. relationship 本地化（注入全哨兵/脏数据）===");
{
  const baseView = await (await fetch(`${API}/wiki/pages/${TEST_CID}?view=stable`, { headers: apiHeaders })).json();
  const readRe = new RegExp(`/api/wiki/pages/${TEST_CID.replace(/[-/]/g, "\\$&")}(\\?view=[^/]*)?$`);
  const cases = [
    { type: "friend", rel: "老友", expectIncl: "朋友", expectExcl: "friend" },
    { type: "mentor", rel: "师父", expectIncl: "导师", expectExcl: "mentor" },
    { type: "self", rel: "", expectIncl: "本人", expectExcl: "self" },
    { type: "custom", rel: "邻居大叔", expectIncl: "邻居大叔", expectExcl: "custom" }, // custom→空，只剩 relationship
    { type: "。", rel: "ai男友", expectIncl: "ai男友", expectExcl: "。" }, // 纯标点→空
  ];
  let ok = 0;
  for (const cse of cases) {
    const { ctx, p } = await freshPage();
    const v = JSON.parse(JSON.stringify(baseView));
    v.content.relationship = cse.rel; v.content.relationshipType = cse.type;
    if (v.visibleContent) { v.visibleContent.relationship = cse.rel; v.visibleContent.relationshipType = cse.type; }
    await p.route((url) => readRe.test(url.toString()), (r) =>
      r.request().method() === "GET"
        ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) })
        : r.continue());
    await p.goto(`${WIKI}/character/${TEST_CID}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("header h2", { timeout: 8000 }); await sleep(250);
    // 卡片 header 内 text-muted 的行（relationship + region）
    const relText = (await p.locator('header div.text-\\[var\\(--text-muted\\)\\]').allTextContents()).join(" | ");
    const inclOk = cse.expectIncl ? relText.includes(cse.expectIncl) : true;
    const exclOk = cse.expectExcl === "。" ? !/·\s*。|。\s*$/.test(relText) : !new RegExp(`\\b${cse.expectExcl}\\b`).test(relText);
    if (inclOk && exclOk) { ok++; } else fail(`relationship 注入用例失败 type=${cse.type}`, `relLine="${relText.trim().slice(0,80)}" 期望含"${cse.expectIncl}" 不含"${cse.expectExcl}"`);
    await ctx.close();
  }
  if (ok === cases.length) pass(`relationship 本地化全部 ${cases.length} 用例通过（哨兵翻译/custom·纯标点抑制）`);
}

// ── E3. 朗读失败可见反馈（注入 503，不烧真实 TTS 配额）──
console.log("\n=== E3. 朗读失败可见反馈 ===");
{
  const { ctx, p, errs } = await freshPage();
  await p.route("**/api/ai/speech", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "LEGACY_ERROR", message: "走查注入 TTS 故障" }) }));
  await loadUntil(p, `${WIKI}/character/${TEST_CID}`, "header h2", { timeout: 10000 });
  const btn = p.locator('button[aria-label="朗读全文"]');
  if (await btn.count() === 0) { info("无朗读按钮，跳过 E3"); }
  else {
    await btn.click();
    await sleep(1200);
    const alertCount = await p.locator('[role="alert"]').count();
    const alertText = alertCount ? (await p.locator('[role="alert"]').first().textContent())?.trim() : "";
    if (alertCount > 0 && /服务暂时不可用|503|失败|不可用/.test(alertText || "")) pass(`朗读失败有可见 role=alert 反馈（"${(alertText||"").slice(0,40)}"）`); else fail("朗读失败无可见错误反馈（仍只在 title 里）", `alertCount=${alertCount} text="${alertText}"`);
    if (await p.locator("audio").count() === 0) pass("朗读失败不渲染空 audio 元素"); else fail("朗读失败仍渲染 audio");
    // 按钮回弹可重试
    if (!(await btn.isDisabled())) pass("朗读失败后按钮恢复可点（可重试）"); else fail("朗读失败后按钮仍禁用");
  }
  if (errs.length === 0) pass("朗读失败无 console error / 无崩溃"); else fail("朗读失败 console error", errs.join(" | "));
  await ctx.close();
}

// ── E4. recipe 子对象缺失防白屏（注入删 prompting/scenePrompts/lifeStrategy）──
// recipeSnapshot 类型上 prompting/scenePrompts/lifeStrategy/memorySeed 都必填，但
// 实际存库/工厂兜底/schema 漂移的快照不保证齐全。ReadView 渲染若裸取这些子对象，
// 缺任一就抛错冒泡到根 TelemetryErrorBoundary → 整个 SPA 白屏（不只这一页）。
// 注入删每个子对象，验证 ReadView 仍渲染 header h2（降级成 "—"），不再崩页。
console.log("\n=== E4. recipe 子对象缺失防白屏 ===");
{
  const base = await (await fetch(`${API}/wiki/pages/${TEST_CID}?view=stable`, { headers: apiHeaders })).json();
  const readRe = new RegExp(`/api/wiki/pages/${TEST_CID.replace(/[-/]/g, "\\$&")}(\\?view=[^/]*)?$`);
  let ok = 0;
  const drops = ["prompting", "prompting.scenePrompts", "lifeStrategy", "memorySeed"];
  for (const drop of drops) {
    const { ctx, p, errs } = await freshPage();
    const v = JSON.parse(JSON.stringify(base));
    if (v.recipe) { if (drop === "prompting.scenePrompts") delete v.recipe.prompting?.scenePrompts; else delete v.recipe[drop]; }
    await p.route((url) => readRe.test(url.toString()), (r) => r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) }) : r.continue());
    await p.goto(`${WIKI}/character/${TEST_CID}`, { waitUntil: "domcontentloaded" });
    await sleep(900);
    const hasH2 = await p.locator("header h2").count();
    if (hasH2 === 1 && errs.length === 0) ok++; else fail(`recipe 缺 ${drop} 白屏/崩页`, `headerH2=${hasH2} errs=${errs.join("|").slice(0,120)}`);
    await ctx.close();
  }
  if (ok === drops.length) pass(`recipe 子对象缺失全部 ${drops.length} 例优雅降级（prompting/scenePrompts/lifeStrategy/memorySeed 均不崩页）`);
}

// ── F. 读 API 正确性（perf fast-path 不丢字段 + newcomer 钳 stable）──
console.log("\n=== F. 读 API 正确性 ===");
{
  const v = await (await fetch(`${API}/wiki/pages/${TEST_CID}?view=stable`, { headers: apiHeaders })).json();
  if (v.content?.name && v.recipe) pass("stable 读返回 content+recipe（fast-path 无丢字段）"); else fail("stable 读缺 content/recipe", `name=${!!v.content?.name} recipe=${!!v.recipe}`);
  if (v.viewerCanSeeCurrent === false) pass("viewerCanSeeCurrent=false（newcomer 钳到 stable）"); else fail("viewerCanSeeCurrent 非 false", String(v.viewerCanSeeCurrent));
  // newcomer 即便强行请求 ?view=current 也应被钳回 stable（不能偷看未审版本）
  const vc = await (await fetch(`${API}/wiki/pages/${TEST_CID}?view=current`, { headers: apiHeaders })).json();
  if (vc.viewMode === "stable" || vc.viewerCanSeeCurrent === false) pass("newcomer 强请求 view=current 被钳回 stable"); else fail("newcomer 越权看到 current", `viewMode=${vc.viewMode} canSee=${vc.viewerCanSeeCurrent}`);
}

// ── G. 历史读（newcomer 无回滚入口）──
console.log("\n=== G. 历史读（newcomer）===");
let diffFrom = null, diffTo = null;
{
  const { ctx, p, errs } = await freshPage();
  await p.goto(`${WIKI}/character/${TEST_CID}`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[role="tablist"]');
  await p.locator('[role="tab"]:has-text("历史")').first().click(); await sleep(600);
  const revCards = await p.locator('main .text-sm:has-text("v"), [class*="font-mono"]').count();
  const body = await p.textContent("body");
  if (/还没有任何编辑记录/.test(body) || revCards > 0) pass("历史 tab 渲染（版本卡或空态）"); else fail("历史 tab 未渲染");
  // newcomer 不该出现回滚入口
  if (await p.locator('button:has-text("回滚到此版本")').count() === 0) pass("newcomer 历史无『回滚到此版本』入口"); else fail("newcomer 错误出现回滚入口");
  // 历史卡无裸英文枚举
  const enumLeak = /\b(approved|pending|rejected|create|soft_delete|recipe|lifecycle|content)\b/.test(body) && !/Prompt/.test("recipe");
  const rawEnum = ["approved","pending_review","rejected","soft_delete","recipe_edit","lifecycle"].filter((e) => new RegExp(`\\b${e}\\b`).test(body));
  if (rawEnum.length === 0) pass("历史卡无裸后端英文枚举"); else fail("历史卡露出英文枚举", JSON.stringify(rawEnum));
  // diff toggle
  const diffBtn = p.locator('button:has-text("查看对比")').first();
  if (await diffBtn.count() > 0) {
    await diffBtn.click(); await sleep(300);
    if (await p.locator('button:has-text("收起对比")').count() > 0) pass("历史『查看对比』可展开"); else info("查看对比点击后未见收起");
  } else info("无『查看对比』按钮（可能仅 1 版本）");
  // 抓 from/to 给 diff page 用
  const hist = await (await fetch(`${API}/wiki/pages/${TEST_CID}/history?limit=10`)).json();
  const approved = hist.filter((r) => r.status === "approved");
  if (approved.length >= 2) { diffFrom = approved[1].id; diffTo = approved[0].id; }
  if (errs.length === 0) pass("历史读无 console error"); else fail("历史 console error", errs.join(" | "));
  await ctx.close();
}

// ── H. diff 页读 ──
console.log("\n=== H. diff 页读 ===");
{
  if (diffFrom && diffTo) {
    const { ctx, p, errs } = await freshPage();
    await p.goto(`${WIKI}/character/${TEST_CID}/diff?from=${diffFrom}&to=${diffTo}`, { waitUntil: "domcontentloaded" });
    await sleep(900);
    const body = await p.textContent("body");
    if (/对比/.test(body) && await p.locator("h1").count() > 0) pass("diff 页渲染 vN 对比 vM 标题"); else fail("diff 页未渲染对比标题", body.slice(0, 120));
    if (errs.length === 0) pass("diff 页无 console error"); else fail("diff console error", errs.join(" | "));
    await ctx.close();
  } else info("只有 ≤1 个 approved 版本，跳过 diff 页（非缺陷）");
  // 缺参兜底
  const { ctx, p } = await freshPage();
  await p.goto(`${WIKI}/character/${TEST_CID}/diff`, { waitUntil: "domcontentloaded" });
  await sleep(500);
  if (/缺少对比版本参数/.test(await p.textContent("body"))) pass("diff 缺参展示友好提示"); else fail("diff 缺参未兜底");
  await ctx.close();
}

// ── I. 搜索读 ──
console.log("\n=== I. 搜索读 ===");
{
  const { ctx, p, errs } = await freshPage();
  const term = (realRows.find((r) => !r.name.startsWith("_"))?.name || "").slice(0, 2);
  await p.goto(`${WIKI}/search?q=${encodeURIComponent(term)}`, { waitUntil: "domcontentloaded" });
  await sleep(1000);
  const body = await p.textContent("body");
  const hits = await p.locator('main a[href*="/character/"]').count();
  info(`搜索"${term}" 命中链接=${hits}`);
  if (body.includes("命中") || hits > 0 || body.includes("没有匹配") || body.includes("没有")) pass("搜索页正常渲染（命中/空态）"); else fail("搜索页渲染异常");
  if (hits > 0) { await p.locator('main a[href*="/character/"]').first().click(); await sleep(700); if (/\/character\//.test(p.url())) pass("搜索结果点击进详情"); else fail("搜索结果点击未跳详情", p.url()); }
  if (errs.length === 0) pass("搜索读无 console error"); else fail("搜索 console error", errs.join(" | "));
  await ctx.close();
}

// ── I2. 多词搜索的专长标签高亮（前端命中口径与后端逐词对齐）──
// 后端把 query 按空白拆词、每词在 expertDomains 里 some(includes) 命中（AND 跨词
// /OR 跨域）。"finance management" 命中查理·芒格/纳瓦尔（domains 含两词）。验证：
// 命中卡里 finance/management 标签拿到 accent 高亮（fuchsia 类），未命中的 general 不高亮。
console.log("\n=== I2. 多词搜索专长标签高亮 ===");
{
  const probe = await (await fetch(`${API}/wiki/search?q=${encodeURIComponent("finance management")}&limit=5`)).json();
  const target = probe.find((r) => Array.isArray(r.expertDomains) && r.expertDomains.includes("finance") && r.expertDomains.includes("management") && r.expertDomains.includes("general"));
  if (!target) { info("无 finance+management+general 多域命中样本，跳过 I2（非缺陷）"); }
  else {
    const { ctx, p, errs } = await freshPage();
    await p.goto(`${WIKI}/search?q=${encodeURIComponent("finance management")}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector('main a[href*="/character/"]', { timeout: 8000 }); await sleep(400);
    const card = p.locator("main ul > li").filter({ hasText: target.name }).first();
    const tagClass = async (label) => (await card.locator("span", { hasText: new RegExp(`^${label}$`) }).first().getAttribute("class").catch(() => "")) || "";
    const financeHi = /fuchsia/.test(await tagClass("finance"));
    const mgmtHi = /fuchsia/.test(await tagClass("management"));
    const generalHi = /fuchsia/.test(await tagClass("general"));
    if (financeHi && mgmtHi) pass(`多词搜索命中标签高亮: finance+management 均 accent（card="${target.name}"）`); else fail("多词搜索命中标签未高亮", `finance=${financeHi} management=${mgmtHi}`);
    if (!generalHi) pass("未命中标签 general 不误高亮"); else fail("未命中标签 general 被误高亮");
    if (errs.length === 0) pass("多词搜索高亮无 console error"); else fail("多词搜索 console error", errs.join(" | "));
    await ctx.close();
  }
}

// ── J. 边缘态读 ──
console.log("\n=== J. 边缘态读 ===");
{
  // J1 deleted
  const { ctx, p, errs } = await freshPage();
  await p.goto(`${WIKI}/character/${DELETED_CID}`, { waitUntil: "domcontentloaded" });
  await sleep(900);
  const body1 = await p.textContent("body");
  if (/已删除|红链/.test(body1)) pass("deleted 角色读：显示已删除/红链提示"); else fail("deleted 角色无删除提示", body1.slice(0, 120));
  if (errs.length === 0) pass("deleted 读无 console error"); else fail("deleted console error", errs.join(" | "));
  await ctx.close();
}
{
  // J2 pending_create
  const { ctx, p, errs } = await freshPage();
  await p.goto(`${WIKI}/character/${PENDING_CREATE_CID}`, { waitUntil: "domcontentloaded" });
  await sleep(900);
  const body2 = await p.textContent("body");
  if (/待创建/.test(body2)) pass("pending_create 角色读：显示待创建提示"); else fail("pending_create 无待创建提示", body2.slice(0, 120));
  // pending_create 不应出现『编辑』tab
  if (await p.locator('[role="tab"]:has-text("编辑")').count() === 0) pass("pending_create 隐藏『编辑』tab"); else fail("pending_create 仍显示编辑 tab");
  if (errs.length === 0) pass("pending_create 读无 console error"); else fail("pending_create console error", errs.join(" | "));
  await ctx.close();
}
{
  // J3 不存在角色
  const { ctx, p } = await freshPage();
  const resp = await p.goto(`${WIKI}/character/char_does_not_exist_zzz`, { waitUntil: "domcontentloaded" });
  await sleep(900);
  const body3 = await p.textContent("body");
  // 不应白屏 / 不应露后端英文 dump
  if (body3.trim().length > 20 && !/Cannot GET|Internal Server Error|undefined is not/.test(body3)) pass("不存在角色读：有友好兜底，无白屏/英文 dump"); else fail("不存在角色读异常", body3.slice(0, 160));
  await ctx.close();
}
{
  // J4 半保护
  const { ctx, p } = await freshPage();
  await p.goto(`${WIKI}/character/${PROTECTED_CID}`, { waitUntil: "domcontentloaded" });
  await sleep(900);
  const body4 = await p.textContent("body");
  if (/半保护|保护/.test(body4)) pass("半保护角色读：显示保护标识"); else info("半保护标识未显式出现（可能 protectionLevel 已变）");
  await ctx.close();
}

console.log(`\n========== ${ROUND} 汇总: ${passes.length} PASS / ${issues.length} ISSUE ==========`);
if (issues.length) for (const i of issues) console.log(`  ✗ ${i.s}${i.d ? " :: " + i.d.slice(0, 200) : ""}`);
await browser.close();
process.exit(issues.length ? 2 : 0);
