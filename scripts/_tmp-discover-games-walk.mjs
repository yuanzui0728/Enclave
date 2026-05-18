// 移动端 /discover/games 端到端走查（深度版）
//   yuanzui0728@gmail.com 账号；vite 代理 /api → 3000（已是 yuanzui0728 world）
//
// 覆盖：
//   1. 路由加载 + 顶栏 + 6 个 section 渲染
//   2. 11 款游戏（10 个内嵌 + yinjie-farm 独立路由）逐个 launch + 验 embedded slot 出现 + 验 onExit
//   3. banner 卡片点击
//   4. 我的游戏 tile 点击
//   5. 好友在玩 select + invite toggle
//   6. SectionHeader "更多" 按钮——目前 mobile 端没接 onClick，应该不渲染
//   7. 返回按钮回到 /tabs/discover
//   8. yinjie-farm 跳到独立路由
//
// 用法: node scripts/_tmp-discover-games-walk.mjs

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  "/home/ps/claude/yinjie-app/apps/app/node_modules/@playwright/test/index.js",
);

const BASE_URL = "http://127.0.0.1:5183";
const WORLD_API = BASE_URL; // vite proxy /api → 3000 = yuanzui0728 world

const findings = [];

function record(category, detail) {
  findings.push({ category, detail });
  console.log(`  ✗ [${category}] ${detail}`);
}

function note(msg) {
  console.log(`  · ${msg}`);
}

async function seed(context) {
  const ownerValue = {
    id: "816d9761-d814-4a70-994a-13758ad1f2bc",
    username: "w",
    onboardingCompleted: true,
    avatar: "",
    signature: "在现实之外，进入另一片世界。",
    hasCustomApiKey: false,
    customApiBase: null,
    createdAt: "2026-05-06T06:14:20.000Z",
  };
  const runtimeConfigValue = {
    apiBaseUrl: WORLD_API,
    socketBaseUrl: WORLD_API,
    environment: "development",
    appPlatform: "web",
    channel: "mobile",
    bootstrapSource: "user",
    configStatus: "validated",
    publicAppName: "Yinjie",
    worldAccessMode: "cloud",
    cloudPhone: "91173587559732",
  };
  // 把 game-center state 清成「空 active + 空 recent」，让 fresh load 时不会
  //   先把 signal-squad embedded slot 渲染出来，污染后续 li 行的 layout。
  const gameCenterClean = {
    activeGameId: null,
    recentGameIds: [],
    pinnedGameIds: [],
    launchCountById: {},
    lastOpenedAtById: {},
    eventActionStatusById: {},
    lastInviteConversationIdByActivityId: {},
    lastInviteConversationPathByActivityId: {},
    lastInviteConversationTitleByActivityId: {},
    friendInviteStatusByActivityId: {},
    friendInviteSentAtByActivityId: {},
  };

  await context.addInitScript(
    ({ ownerValue, runtimeConfigValue, gameCenterClean }) => {
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
      // 只在 game-center state 还不存在时种入 clean state；
      // 否则后续 goto 会一直把已积累的 recents 抹掉。
      if (!localStorage.getItem("yinjie-game-center-state")) {
        localStorage.setItem(
          "yinjie-game-center-state",
          JSON.stringify(gameCenterClean),
        );
      }
    },
    { ownerValue, runtimeConfigValue, gameCenterClean },
  );
}

function attachErrorListeners(page) {
  const consoleErrors = [];
  const consoleWarns = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") {
      if (
        text.includes("/socket.io/") &&
        text.includes("WebSocket connection")
      )
        return;
      if (text.includes("Failed to load resource")) return; // 跟 fetch 失败重叠
      consoleErrors.push(text);
      return;
    }
    if (msg.type() === "warning") {
      // 过滤掉 vite hmr / source map / 三方 lib 的常见噪音
      if (text.includes("[vite]")) return;
      if (text.includes("source map")) return;
      if (text.includes("DevTools")) return;
      // React 17/18 strict-mode dedupe 复述会以 console.error("Warning: ...") 出，
      // 这里只关注真正的 warning channel。
      consoleWarns.push(text);
    }
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  return { consoleErrors, consoleWarns, pageErrors };
}

async function loadGamesPage(page) {
  await page.goto(`${BASE_URL}/discover/games`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  // 新游榜 是页面最底下的 section；它出现 = 整页 list 已渲染完成。
  // 比固定 timeout 更稳。
  await page
    .locator('text="新游榜"')
    .first()
    .waitFor({ state: "visible", timeout: 6_000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

async function checkSections(page) {
  const titles = [
    "我的游戏",
    "好友在玩",
    "精选小游戏",
    "热门小游戏",
    "新游榜",
  ];
  for (const title of titles) {
    const visible = await page
      .locator(`text="${title}"`)
      .first()
      .isVisible()
      .catch(() => false);
    if (!visible) record("section-missing", title);
  }
}

const ALL_GAMES = [
  { name: "抢车位", id: "parking-war", embedded: true },
  { name: "信号小队", id: "signal-squad", embedded: true },
  { name: "夜市合伙人", id: "night-market", embedded: true },
  { name: "天空竞速", id: "sky-rally", embedded: true },
  { name: "猫咖旅馆", id: "cat-inn", embedded: true },
  { name: "星野列车", id: "forest-train", embedded: true },
  { name: "像素擂台", id: "pixel-arena", embedded: true },
  { name: "云上农场", id: "cloud-farm", embedded: true },
  { name: "岛屿演唱会", id: "island-concert", embedded: true },
  { name: "坦克大战", id: "tank-war", embedded: true },
  { name: "隐界农场", id: "yinjie-farm", embedded: false }, // 独立路由
];

async function snapshotListenerCounts(page) {
  // playwright + Chrome 没有直接的 listener API；用 Performance / WindowProxy 的
  // 副作用来 fingerprint 大致泄露趋势：count 已注册到 window/document 的
  // EventTarget._yinjieCount（由 instrumentListenerTracking 提前装上的 patch）。
  return await page.evaluate(() => {
    const w = window;
    const d = document;
    return {
      window: w.__yinjieListenerCount ?? -1,
      document: d.__yinjieListenerCount ?? -1,
    };
  });
}

async function instrumentListenerTracking(context) {
  // 在 page 加载前把 window/document.addEventListener 包一层计数器。
  // 不动 returned removeEventListener，因为 React 拿到的是 wrapper 引用，
  // remove 时 wrapper 一致才能解绑——为了避免破坏，只在 once: false 时累加，
  // 并在 remove 时减回。 wrapping 后行为对 listener 影响 minimal。
  await context.addInitScript(() => {
    const wrap = (target, label) => {
      const origAdd = target.addEventListener.bind(target);
      const origRemove = target.removeEventListener.bind(target);
      target.__yinjieListenerCount = 0;
      target.addEventListener = function (type, listener, options) {
        target.__yinjieListenerCount++;
        return origAdd(type, listener, options);
      };
      target.removeEventListener = function (type, listener, options) {
        target.__yinjieListenerCount = Math.max(
          0,
          target.__yinjieListenerCount - 1,
        );
        return origRemove(type, listener, options);
      };
      void label;
    };
    wrap(window, "window");
    wrap(document, "document");
  });
}

async function launchEmbedded(page, target, listeners) {
  const beforeConsole = listeners.consoleErrors.length;
  const beforePage = listeners.pageErrors.length;
  const beforeWarns = listeners.consoleWarns.length;
  const beforeListeners = await snapshotListenerCounts(page);

  // 在精选 / 热门 / 新游 / 我的游戏 任一处找一行
  const row = page
    .locator("li", { hasText: target.name })
    .filter({ has: page.locator('button:text-is("开始")') })
    .first();

  if ((await row.count()) === 0) {
    record("game-row-missing", target.name);
    return;
  }

  await row.locator('button:text-is("开始")').click();

  if (target.embedded) {
    // 全部 embedded 游戏统一用 aria-label="退出游戏" 标记 onExit 按钮
    // lazy import + suspense fallback=null → 实际加载完才出现，给到 5s
    const exitBtn = page.locator('button[aria-label="退出游戏"]').first();
    const hasExit = await exitBtn
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasExit) {
      record(
        "embedded-slot-missing",
        `${target.name}: 启动后 5s 内未出现 aria-label=退出游戏，embedded slot 未渲染`,
      );
    } else {
      // 点退出按钮 → embedded slot 应消失（活跃游戏被 dismiss）
      await exitBtn.click().catch(() => {});
      // 等 dismiss + localStorage flush；游戏太多迭代后 React 渲染会拖慢
      await page.waitForTimeout(800);
      const stillThere = await page
        .locator('button[aria-label="退出游戏"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (stillThere) {
        record("dismiss-fail", `${target.name}: 点击「退出游戏」后 slot 仍在`);
      }
    }
  } else {
    // 独立路由（yinjie-farm）：URL 应该变成 /tabs/games/yinjie-farm
    await page
      .waitForURL("**/tabs/games/yinjie-farm", { timeout: 4000 })
      .catch(() => {});
    const url = page.url();
    if (!url.includes("/tabs/games/yinjie-farm")) {
      record("farm-route-fail", `expected /tabs/games/yinjie-farm got ${url}`);
    }
  }

  const newConsole = listeners.consoleErrors.slice(beforeConsole);
  const newPage = listeners.pageErrors.slice(beforePage);
  const newWarns = listeners.consoleWarns.slice(beforeWarns);
  for (const m of newConsole)
    record("console.error-after-launch", `${target.name}: ${m}`);
  for (const m of newPage)
    record("pageerror-after-launch", `${target.name}: ${m}`);
  for (const m of newWarns)
    record("console.warn-after-launch", `${target.name}: ${m}`);

  // 退出后 listener count 应基本回到 launch 前 ±2 以内（runtime 本身有
  // 异步 telemetry / route 切换会留 1-2 个）；只在 embedded 模式做这件事
  // —— yinjie-farm 是独立路由整页 unmount，window 上的 hook 跟列表页不一致。
  if (target.embedded) {
    const afterListeners = await snapshotListenerCounts(page);
    const winDiff = afterListeners.window - beforeListeners.window;
    const docDiff = afterListeners.document - beforeListeners.document;
    // 单个游戏内的 launch+dismiss 不应让 window 残留 > 5 个 listener，
    // 不然每次进出叠加很快变成几十上百，长会话内存涨；阈值 5 给 React 内部
    // 异步重连留点余量。
    if (winDiff > 5) {
      record(
        "listener-leak-window",
        `${target.name}: launch+exit 后 window listener +${winDiff}（before=${beforeListeners.window} after=${afterListeners.window}）`,
      );
    }
    if (docDiff > 5) {
      record(
        "listener-leak-document",
        `${target.name}: launch+exit 后 document listener +${docDiff}（before=${beforeListeners.document} after=${afterListeners.document}）`,
      );
    }
  }
}

async function main() {
  console.log(`▶ walk discover/games as yuanzui0728 (mobile)`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  });
  await instrumentListenerTracking(context);
  await seed(context);

  const page = await context.newPage();
  const listeners = attachErrorListeners(page);

  // === 1. 初次加载 ===
  note("step 1: load /discover/games");
  await loadGamesPage(page);

  if (listeners.pageErrors.length)
    for (const m of listeners.pageErrors) record("pageerror-on-load", m);

  const top = await page
    .locator('text="游戏"')
    .first()
    .isVisible()
    .catch(() => false);
  if (!top) record("topbar-missing", "顶栏 '游戏' 不可见");

  await checkSections(page);

  // banner card 文案应包含 game name
  const bannerVisible = await page
    .locator('button:has-text("开始")')
    .first()
    .isVisible()
    .catch(() => false);
  if (!bannerVisible) record("banner-missing", "banner card 缺失");

  // === 2. SectionHeader 更多 按钮：mobile 端没接 onClick，应该不渲染（避免死按钮） ===
  note("step 2: SectionHeader 更多 should NOT render");
  const moreCount = await page.locator('text="更多"').count();
  if (moreCount > 0) {
    record(
      "section-more-deadbutton",
      `mobile 端出现了 ${moreCount} 个「更多」死按钮（SectionHeader 不接 onClick 时应隐藏）`,
    );
  }

  // === 3. 邀请好友 toggle ===
  note("step 3: invite toggle");
  const inviteBtn = page.locator('button:text-is("邀请")').first();
  if (await inviteBtn.isVisible().catch(() => false)) {
    await inviteBtn.click();
    await page.waitForTimeout(250);
    const invited = await page
      .locator('button:text-is("已邀约")')
      .first()
      .isVisible()
      .catch(() => false);
    if (!invited) record("invite-toggle-fail", "邀请后未出现「已邀约」状态");
    // 再点一次仍应是已邀约（应再次邀请文案）——但按钮文本仍为「已邀约」
    await page.locator('button:text-is("已邀约")').first().click().catch(() => {});
    await page.waitForTimeout(250);
  } else {
    record("invite-btn-missing", "未找到邀请按钮");
  }

  // === 4. 返回按钮（先做，避开 yinjie-farm 后历史栈污染）===
  note("step 4: back button → /tabs/discover");
  // navigate from discover-home to /discover/games via Link 一次，确保 back 有目标
  await page.goto(`${BASE_URL}/tabs/discover`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(300);
  // 通过 link 进入 /discover/games
  const gamesLink = page.locator('a[href^="/discover/games"]').first();
  if (await gamesLink.isVisible().catch(() => false)) {
    await gamesLink.click();
    await page
      .waitForURL("**/discover/games**", { timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400);
    const backBtn = page.locator('button[aria-label="返回"]').first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
      await page.waitForTimeout(500);
      const url = page.url();
      if (!url.includes("/discover") || url.includes("/discover/games")) {
        record("back-button-fail", `back didn't go to discover home, got ${url}`);
      }
    } else {
      record("back-btn-missing", "返回按钮不存在");
    }
  } else {
    record("nav-link-missing", "/discover 首页找不到游戏入口 link");
  }

  // === 5. 逐款游戏 launch ===
  note("step 5: launch each game (via 开始 button in lists)");
  for (const target of ALL_GAMES) {
    note(`  launching ${target.name} (${target.id})`);
    await loadGamesPage(page);
    await launchEmbedded(page, target, listeners);
  }

  // === 6. banner click（banner game = featuredGames[0] = yinjie-farm）===
  note("step 6: banner click should navigate to /tabs/games/yinjie-farm");
  await loadGamesPage(page);
  const banner = page.locator('button:has-text("隐界农场"):has-text("开始")').first();
  if (await banner.isVisible().catch(() => false)) {
    await banner.click();
    await page
      .waitForURL("**/tabs/games/yinjie-farm", { timeout: 6_000 })
      .catch(() => {});
    if (!page.url().includes("/tabs/games/yinjie-farm")) {
      record("banner-click-fail", `banner click 未跳到 yinjie-farm，url=${page.url()}`);
    } else {
      // 在 farm 页面里点 返回，正确的行为是回到 /discover/games / /tabs/discover / /tabs/games
      await page.waitForTimeout(600);
      const farmBack = page
        .locator('a:has-text("返回"), button:has-text("返回")')
        .first();
      if (await farmBack.isVisible().catch(() => false)) {
        await farmBack.click();
        await page.waitForTimeout(600);
        const afterBack = page.url();
        // 接受三种合法的去向：原 games 页（/discover/games or /tabs/games）
        //   或直接 /tabs/discover（farm 知道 returnPath=/discover 时）。
        const validBack =
          afterBack.includes("/discover/games") ||
          (afterBack.includes("/tabs/games") &&
            !afterBack.includes("/tabs/games/yinjie-farm")) ||
          afterBack.includes("/tabs/discover");
        if (!validBack) {
          record(
            "farm-back-fail",
            `farm 返回 后 url 不在合法目标内：${afterBack}`,
          );
        }
        // 若回到了 /tabs/games（中转游戏中心），再点一次 返回 必须能离开 games
        // 区域（不能 history.back 回到 farm 死循环）
        if (
          afterBack.includes("/tabs/games") &&
          !afterBack.includes("/tabs/games/yinjie-farm")
        ) {
          await page.waitForTimeout(300);
          const backBtn = page.locator('button[aria-label="返回"]').first();
          if (await backBtn.isVisible().catch(() => false)) {
            await backBtn.click();
            await page.waitForTimeout(500);
            const finalUrl = page.url();
            if (finalUrl.includes("/tabs/games/yinjie-farm")) {
              record(
                "farm-loop-trap",
                `farm → 返回 → /tabs/games → 返回 又回到 ${finalUrl}（应离开 games 区域）`,
              );
            }
          }
        }
      } else {
        record("farm-back-link-missing", "farm 页面没有可见的 返回 链接");
      }
    }
  } else {
    record("banner-not-found", "banner card 不可见");
  }

  // === 7. 我的游戏 tile click ===
  note("step 7: 我的游戏 tile click → embedded slot or farm route");
  await loadGamesPage(page);
  // GameIconTile 的 class 含 "w-14"，是当前页面里唯一用这宽度的 button
  const firstTile = page.locator("button.w-14").first();
  if (await firstTile.isVisible().catch(() => false)) {
    const tileText = (await firstTile.innerText().catch(() => "")).replace(
      /\n/g,
      " ",
    );
    note(`    first tile text="${tileText}"`);
    await firstTile.click();
    await page.waitForTimeout(1200);
    const url = page.url();
    const embeddedPresent = await page
      .locator('button[aria-label="退出游戏"]')
      .first()
      .isVisible()
      .catch(() => false);
    const farmRoute = url.includes("/tabs/games/yinjie-farm");
    if (!embeddedPresent && !farmRoute) {
      record(
        "mygames-tile-noop",
        `tile="${tileText}" 点击后既未唤起 embedded 也未跳 yinjie-farm, url=${url}`,
      );
    }
  } else {
    record("mygames-tile-missing", "我的游戏 第一个 tile 不可见");
  }

  // === 8. 好友在玩 行点击（"加入 ta 的局"——移动端 row body 直接 launch 游戏）===
  // 走查史：以前 row 点击只 setSelectedGameId、移动端无 preview pane = 死按钮；
  // games-page.tsx 已改成 onSelect={() => handleSelectAndLaunch(game.id)}。
  // 这里反过来检查：row 点击后应当出现 embedded slot（或跳 farm 独立路由）。
  note("step 8: friend activity row click launches game (deadbutton fix)");
  await loadGamesPage(page);
  const friendRow = page
    .locator("li", { hasText: "正在玩" })
    .first();
  if (await friendRow.isVisible().catch(() => false)) {
    await friendRow.locator("button").first().click();
    await page.waitForTimeout(800);
    const embeddedAfterRow = await page
      .locator('button[aria-label="退出游戏"]')
      .first()
      .isVisible()
      .catch(() => false);
    const farmRoute = page.url().includes("/tabs/games/yinjie-farm");
    if (!embeddedAfterRow && !farmRoute) {
      record(
        "friend-row-deadbutton",
        "点击 好友在玩 行未拉起游戏（既无 embedded slot 也未跳 farm route）= 视觉死按钮",
      );
    }
    // 把 slot dismiss 掉，避免后续 step 受 active 游戏影响
    if (embeddedAfterRow) {
      await page
        .locator('button[aria-label="退出游戏"]')
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(400);
    }
  } else {
    record("friend-row-missing", "好友在玩 行不可见");
  }

  // === 9. 实玩交互：抢车位 — 验证 onClick 不抛错、签到 / 关闭 sheet 不卡死 ===
  note("step 9: parking-war real interaction");
  await loadGamesPage(page);
  const parkingRow = page
    .locator("li", { hasText: "抢车位" })
    .filter({ has: page.locator('button:text-is("开始")') })
    .first();
  if ((await parkingRow.count()) > 0) {
    await parkingRow.locator('button:text-is("开始")').click();
    await page
      .locator('button[aria-label="退出游戏"]')
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => {});
    const beforeErr = listeners.consoleErrors.length;
    const beforePage = listeners.pageErrors.length;
    // 点签到（如果可点）
    const sign = page.locator('text="签到"').first();
    if (await sign.isVisible().catch(() => false)) {
      await sign.click().catch(() => {});
      await page.waitForTimeout(300);
    }
    // 打开「更多」sheet
    const more = page.locator('button[aria-label="更多"]').first();
    if (await more.isVisible().catch(() => false)) {
      await more.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const newErr = listeners.consoleErrors.slice(beforeErr);
    const newPage = listeners.pageErrors.slice(beforePage);
    for (const m of newErr)
      record("console.error-in-game", `抢车位 interact: ${m}`);
    for (const m of newPage)
      record("pageerror-in-game", `抢车位 interact: ${m}`);
  }

  // === 10. 实玩交互：坦克大战 — 验证 canvas 渲染 + 触屏控件 ===
  note("step 10: tank-war canvas + touch controls");
  await loadGamesPage(page);
  const tankRow = page
    .locator("li", { hasText: "坦克大战" })
    .filter({ has: page.locator('button:text-is("开始")') })
    .first();
  if ((await tankRow.count()) > 0) {
    await tankRow.locator('button:text-is("开始")').click();
    await page
      .locator('button[aria-label="退出游戏"]')
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => {});
    const beforeErr = listeners.consoleErrors.length;
    const canvas = page.locator("canvas").first();
    if (!(await canvas.isVisible().catch(() => false))) {
      record("tank-war-no-canvas", "坦克大战未渲染 canvas");
    }
    // 点 开始游戏（MenuOverlay）
    const startBtn = page.locator('button:has-text("开始游戏")').first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(800);
      // 等播放状态后，移动端应渲染 touch controls
      // touch controls 一般是 hud.status==="playing" 且 isTouch===true 才出
      const touchCtl = await page
        .locator('button:has-text("射击"), button:has-text("Fire"), [aria-label*="方向"], [aria-label*="开火"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (!touchCtl) {
        // 不强制——有些环境检测不到 ontouchstart；但 canvas 必须仍然在
        const stillCanvas = await canvas.isVisible().catch(() => false);
        if (!stillCanvas)
          record(
            "tank-war-canvas-gone",
            "开始游戏后 canvas 消失",
          );
      }
    }
    const newErr = listeners.consoleErrors.slice(beforeErr);
    for (const m of newErr) record("console.error-in-game", `坦克大战: ${m}`);
  }

  // === 11. successNotice 显示 + 在 2.8s 内自动消失 ===
  note("step 11: successNotice auto-dismiss");
  await loadGamesPage(page);
  // 邀请 → 出 success notice
  const inv = page.locator('button:text-is("邀请")').first();
  if (await inv.isVisible().catch(() => false)) {
    await inv.click();
    await page.waitForTimeout(500);
    // success notice 文案是 "已向 X 发出一起玩 Y 的邀约。"——含"发出"且不是按钮上的"已邀约"3字
    // 用 "发出.*邀约" 这种通用匹配
    const notice = page.locator('text=/发出.*邀约/').first();
    const visibleNow = await notice.isVisible().catch(() => false);
    if (!visibleNow) {
      record("success-notice-missing", "邀请后未出现 success notice");
    }
    // 等 3.5s 让 notice 自动消失
    await page.waitForTimeout(3500);
    const stillVisible = await notice.isVisible().catch(() => false);
    if (stillVisible) {
      record(
        "success-notice-stuck",
        "success notice 超过 2.8s 没自动消失",
      );
    }
  }

  // === 12.5. 同会话内连续 launch 5 个不同 embedded 游戏 —— 不重 load page
  //   ＝ 复现"用户反复换游戏"路径，捕捉 cumulative listener leak / 状态错乱。
  note("step 12.5: rapid game switch (no page reload) → cumulative leak check");
  await loadGamesPage(page);
  const switchTargets = [
    "信号小队",
    "夜市合伙人",
    "天空竞速",
    "像素擂台",
    "云上农场",
  ];
  const switchBeforeListeners = await snapshotListenerCounts(page);
  const switchBeforeErr = listeners.consoleErrors.length;
  const switchBeforePage = listeners.pageErrors.length;
  for (const name of switchTargets) {
    const row = page
      .locator("li", { hasText: name })
      .filter({ has: page.locator('button:text-is("开始")') })
      .first();
    if ((await row.count()) === 0) {
      record("switch-row-missing", name);
      continue;
    }
    await row.locator('button:text-is("开始")').click();
    // 等新 embedded slot 出现（exit btn 仍是同一个 aria-label，所以等到该游戏对应
    // 的内容稳定就靠 200ms 时间窗）
    await page.waitForTimeout(400);
  }
  // 全部跑完后 dismiss
  const finalExit = page.locator('button[aria-label="退出游戏"]').first();
  if (await finalExit.isVisible().catch(() => false)) {
    await finalExit.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const switchAfter = await snapshotListenerCounts(page);
  const winDelta = switchAfter.window - switchBeforeListeners.window;
  const docDelta = switchAfter.document - switchBeforeListeners.document;
  // 5 次切换 → 单次切换平均 = delta/5；window 平均 < 3 才算健康
  if (winDelta > 15) {
    record(
      "rapid-switch-window-leak",
      `5 次连切后 window listener +${winDelta}（平均 +${(winDelta / 5).toFixed(1)} / 切换）`,
    );
  }
  if (docDelta > 15) {
    record(
      "rapid-switch-document-leak",
      `5 次连切后 document listener +${docDelta}（平均 +${(docDelta / 5).toFixed(1)} / 切换）`,
    );
  }
  const newErr = listeners.consoleErrors.slice(switchBeforeErr);
  const newPage = listeners.pageErrors.slice(switchBeforePage);
  for (const m of newErr) record("rapid-switch-console-error", m);
  for (const m of newPage) record("rapid-switch-pageerror", m);

  // === 12. 小屏 320 宽（iPhone SE）排版不溢出 ===
  note("step 12: 320 viewport doesn't overflow");
  await page.setViewportSize({ width: 320, height: 568 });
  await loadGamesPage(page);
  const overflowing = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 2;
  });
  if (overflowing) {
    record("viewport-320-overflow", "320 宽视口下页面横向溢出");
  }
  // 还要把 viewport 恢复回 375，否则后续 step 受影响（已经是最后一步，无所谓）

  await browser.close();

  console.log("\n========== SUMMARY ==========");
  console.log(`findings: ${findings.length}`);
  if (findings.length) {
    for (const f of findings) console.log(`  - [${f.category}] ${f.detail}`);
    process.exit(1);
  }
  console.log("✅ 端到端走查无问题");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
