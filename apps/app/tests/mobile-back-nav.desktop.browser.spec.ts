import { expect, test, type Page } from "@playwright/test";

// 走查：从「世界」tab 和「我」tab 进入的镜像入口页，点返回都应回到“来处”那一 tab。
// 之前这些页 goBack 硬编码 expectedPreviousPath=/tabs/profile，从世界进来返回会被
// 甩到「我」tab。本 spec 用移动视口（width<960 → MobileShell）逐页两向走查。
//
// requireWorldReady 仅看客户端 useWorldOwnerStore.onboardingCompleted（非后端），
// 故无需真后端：直接走已部署的 nginx :5180 dist（= 用户实际拿到的包），注入
// runtime + world-owner 即可进入；/api 请求一律 abort（导航行为不依赖后端）。

const BASE_URL = process.env.WALK_BASE_URL ?? "http://127.0.0.1:5180";
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const ENTRIES: { key: string; path: string }[] = [
  { key: "knowledge", path: "/profile/knowledge" },
  { key: "favorites", path: "/profile/favorites" },
  { key: "moments", path: "/profile/moments" },
  { key: "feed", path: "/profile/feed" },
  { key: "character-import", path: "/profile/character-import" },
  { key: "feedback", path: "/profile/feedback" },
  { key: "wallet", path: "/profile/wallet" },
  { key: "subscription", path: "/profile/subscription" },
  // 未改动的相邻入口，确认无回归（它们本就用 history.back，fallback=探索首页）。
  { key: "gift-cabinet", path: "/gift-cabinet" },
  { key: "shop", path: "/shop" },
];

test.beforeEach(async ({ page, context }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);

  // 后端无关：把 /api、/cloud 全部 abort → react-query 进 error 态（被各页优雅
  // 处理），而不是返回畸形 {} 导致渲染 throw 触发全局 ErrorBoundary。
  await context.route(/\/(api|cloud)\//, (route) => route.abort());

  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[console.error] ${msg.text()}`);
  });

  await page.addInitScript(() => {
    const runtimeConfig = {
      apiBaseUrl: window.location.origin,
      socketBaseUrl: window.location.origin,
      environment: "development",
      appPlatform: "web",
      channel: "web",
      bootstrapSource: "window",
      configStatus: "validated",
      publicAppName: "Yinjie",
      worldAccessMode: "local",
    };
    window.localStorage.setItem(
      "yinjie-app-runtime-config",
      JSON.stringify(runtimeConfig),
    );
    window.localStorage.setItem(
      "yinjie-app-runtime-config-updated-at",
      new Date().toISOString(),
    );
    (window as unknown as { __YINJIE_RUNTIME_CONFIG__: unknown }).__YINJIE_RUNTIME_CONFIG__ =
      runtimeConfig;
    window.localStorage.setItem(
      "yinjie-app-world-owner",
      JSON.stringify({
        state: {
          id: "walk-owner",
          username: "走查主人",
          onboardingCompleted: true,
          avatar: "",
          signature: "",
          createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        },
        version: 0,
      }),
    );
  });
});

function pathnameOf(page: Page) {
  return page.evaluate(() => window.location.pathname);
}

async function gotoTab(page: Page, label: string, expectedPath: string) {
  await page.locator(`a[aria-label="${label}"]`).first().click();
  await expect.poll(() => pathnameOf(page)).toBe(expectedPath);
}

async function assertNoCrash(page: Page, where: string) {
  const crashed = await page.getByText("Something went wrong!").count();
  if (crashed > 0) {
    throw new Error(`页面崩溃（ErrorBoundary）于：${where}`);
  }
}

async function clickBack(page: Page) {
  await page.locator('button[aria-label="返回"]:visible').first().click();
}

test("从「世界」tab 进入镜像入口页，返回回到世界 tab", async ({ page }) => {
  await page.goto(`${BASE_URL}/tabs/world`);
  await expect.poll(() => pathnameOf(page)).toBe("/tabs/world");

  for (const entry of ENTRIES) {
    // 「更多」折叠组：先展开，镜像入口才在 DOM 里。
    await page
      .locator("button[aria-expanded]")
      .filter({ hasText: "更多" })
      .first()
      .click();

    const tile = page.locator(`a[href="${entry.path}"]`).first();
    await expect(tile, `${entry.key} tile 应可见`).toBeVisible();
    await tile.click();
    await expect
      .poll(() => pathnameOf(page), { message: `进入 ${entry.key}` })
      .toBe(entry.path);
    await assertNoCrash(page, `world→${entry.key}`);

    await clickBack(page);
    await expect
      .poll(() => pathnameOf(page), { message: `${entry.key} 返回应回到世界 tab` })
      .toBe("/tabs/world");
  }
});

test("从「我」tab 进入镜像入口页，返回回到我 tab", async ({ page }) => {
  await page.goto(`${BASE_URL}/tabs/profile`);
  await expect.poll(() => pathnameOf(page)).toBe("/tabs/profile");

  for (const entry of ENTRIES) {
    const link = page.locator(`a[href="${entry.path}"]`).first();
    await expect(link, `${entry.key} 我-tab 入口应可见`).toBeVisible();
    await link.click();
    await expect
      .poll(() => pathnameOf(page), { message: `进入 ${entry.key}` })
      .toBe(entry.path);
    await assertNoCrash(page, `profile→${entry.key}`);

    await clickBack(page);
    await expect
      .poll(() => pathnameOf(page), { message: `${entry.key} 返回应回到我 tab` })
      .toBe("/tabs/profile");
  }
});
