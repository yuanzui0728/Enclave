#!/usr/bin/env node
// 确认：阅读视图对 recipe 缺 prompting / scenePrompts / lifeStrategy 子对象时是否白屏。
// 注入式把读端点的 recipe 子对象删掉，看 ReadView 是否抛错触发根 ErrorBoundary。
import pkg from "/home/ps/claude/yinjie-app/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js";
const { chromium } = pkg;
import { setTimeout as sleep } from "node:timers/promises";
const WIKI = "http://127.0.0.1:5184";
const API = "http://127.0.0.1:3500/api";
const CID = "char_wiki_wiki-walkthrough-test";

const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "wiki_newcomer", password: "123456" }) })).json();
const { token, user } = login;
const base = await (await fetch(`${API}/wiki/pages/${CID}?view=stable`, { headers: { Authorization: `Bearer ${token}` } })).json();
const readRe = new RegExp(`/api/wiki/pages/${CID.replace(/[-/]/g, "\\$&")}(\\?view=[^/]*)?$`);
const browser = await chromium.launch({ headless: true });

for (const drop of ["prompting", "prompting.scenePrompts", "lifeStrategy", "memorySeed"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "zh-CN" });
  const p = await ctx.newPage();
  await p.addInitScript(([t, u]) => { localStorage.setItem("yinjie.wiki.token", t); localStorage.setItem("yinjie.wiki.user", JSON.stringify(u)); }, [token, user]);
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e?.message ?? e).slice(0, 120)));
  const v = JSON.parse(JSON.stringify(base));
  if (v.recipe) {
    if (drop === "prompting.scenePrompts") delete v.recipe.prompting.scenePrompts;
    else delete v.recipe[drop];
  }
  await p.route((url) => readRe.test(url.toString()), (r) => r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) }) : r.continue());
  await p.goto(`${WIKI}/character/${CID}`, { waitUntil: "domcontentloaded" });
  await sleep(1200);
  const hasH2 = await p.locator("header h2").count();
  const bodyText = (await p.textContent("body")) || "";
  const crashed = errs.length > 0 || /出错了|发生错误|something went wrong|Error/i.test(bodyText) && hasH2 === 0;
  console.log(`drop ${drop.padEnd(24)} → h2=${hasH2} pageerror=${errs.length} ${crashed ? "❌ CRASH" : "✅ ok"} ${errs[0] ? "[" + errs[0] + "]" : ""}`);
  await ctx.close();
}
await browser.close();
