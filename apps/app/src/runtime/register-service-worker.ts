// SW 注册 + kill switch。
//
// 默认行为：注册 /sw.js（cache-first 白名单，详见 apps/app/public/sw.js）。
// Kill switch：URL `?nosw=1` 或 localStorage["yinjie:nosw"]="1" 触发完全卸载
// (unregister 所有 SW + 清光所有 caches + 一次 reload)；sessionStorage 守护
// 防止 reload 循环。
//
// 历史：vite-plugin-pwa precache 锁死旧 chunk 一度让 SW 被整体下线；自毁开关
// SW + 这里的兜底清理跑了几个迭代后，本次重启用 SW 是受控的 cache-first 设计。

const NOSW_QUERY_KEY = "nosw";
const NOSW_LOCALSTORAGE_KEY = "yinjie:nosw";
const CLEANUP_GUARD_KEY = "yinjie:sw-cleanup-done";

function hasSwSupport(): boolean {
  if (typeof navigator === "undefined") return false;
  return "serviceWorker" in navigator;
}

function killSwitchActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has(NOSW_QUERY_KEY)) return true;
  } catch {
    // ignore
  }
  try {
    if (window.localStorage.getItem(NOSW_LOCALSTORAGE_KEY) === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

async function unregisterAllAndClearCaches(): Promise<boolean> {
  if (!hasSwSupport()) return false;
  let didSomething = false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length > 0) {
      didSomething = true;
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      if (keys.length > 0) {
        didSomething = true;
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    }
  } catch {
    // ignore
  }
  return didSomething;
}

function runKillSwitch(): void {
  let alreadyCleaned = false;
  try {
    alreadyCleaned =
      window.sessionStorage.getItem(CLEANUP_GUARD_KEY) === "1";
  } catch {
    alreadyCleaned = true;
  }
  if (alreadyCleaned) return;

  void (async () => {
    const didCleanup = await unregisterAllAndClearCaches();
    try {
      window.sessionStorage.setItem(CLEANUP_GUARD_KEY, "1");
    } catch {
      // ignore
    }
    // 清 localStorage flag，避免下次刷新还反复触发 kill。?nosw=1 query 留在
    // URL 里没关系，reload 后再次命中也走 sessionStorage 守护短路。
    try {
      window.localStorage.removeItem(NOSW_LOCALSTORAGE_KEY);
    } catch {
      // ignore
    }
    if (didCleanup) {
      window.location.reload();
    }
  })();
}

function registerNow(): void {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // 注册失败不影响应用，退化到纯 HTTP cache。
  });
}

export function registerAppServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!hasSwSupport()) return;
  if (window.location.protocol === "file:") return; // Capacitor 原生壳

  if (killSwitchActive()) {
    runKillSwitch();
    return;
  }

  // 延后到 window.load 之后注册，不抢首屏带宽。
  if (document.readyState === "complete") {
    registerNow();
  } else {
    window.addEventListener("load", registerNow, { once: true });
  }
}
