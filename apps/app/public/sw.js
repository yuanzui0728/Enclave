// 隐界 app Service Worker — cache-first 白名单
//
// 历史：vite-plugin-pwa generateSW 当年 precache 所有 chunk + CacheFirst 拦截，
// 重新构建后用户死活拿不到新 chunk（precache 锁死旧 hash），整个 SW 被下线。
// 旧版本 sw.js 是「自毁开关」，浏览器拿到后 claim → 清 caches → reload → unregister。
//
// 现在重启用 SW，专门解决公网花生壳隧道 (~430ms RTT) 下重访下载 ~2MB hashed chunk
// 要 ~7 秒的问题。设计原则：
//   1) 只缓存带 hash 的 /assets/* 文件 —— hash 变即 cache miss 自动走网络拿新版本，
//      不会再有"precache 锁死旧 chunk"问题。
//   2) 不 precache、不 stale-while-revalidate，纯 cache-first runtime。
//   3) CACHE_NAME 写死 v1 —— 改名 = 全量重下载，违背缓存初衷。
//   4) index.html、runtime-config.json、/api/*、/socket.io/*、/cloud/* 一律绕过 SW
//      走网络，避免任何形式的过期数据。
//   5) Kill switch 在 client 端（apps/app/index.html inline + register-service-worker.ts）：
//      ?nosw=1 query 或 localStorage["yinjie:nosw"]="1" 触发 unregister + 清 cache + reload。

const CACHE_NAME = "yinjie-app-cache-v1";

// 匹配形如 /assets/<chunk-name>-<hash6+>.<ext>
// 例:  /assets/vendor-react-8JJXYe_i.js
//     /assets/use-thread-entry-scroll-to-bottom-CxuskbP_.js
//     /assets/index-B_bfOIIF.css
//     /assets/zh-CN-t5b0ftOD.js
const ASSET_PATTERN =
  /^\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.(?:js|css|woff2?|ttf|otf|eot)(?:\?.*)?$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // 创建 cache + marker，让 inline kill switch 能区分"我们 vs 老的破 SW"。
        const cache = await caches.open(CACHE_NAME);
        await cache.put(
          "/__sw_marker__",
          new Response("yinjie-app-cache-v1", {
            headers: { "Content-Type": "text/plain" },
          }),
        );
      } catch (_) {
        // ignore
      }
      try {
        await self.skipWaiting();
      } catch (_) {
        // ignore
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // 清掉所有非本版本 cache（precache 残留、历史 cache 名）。
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        );
      } catch (_) {
        // ignore
      }
      try {
        await self.clients.claim();
      } catch (_) {
        // ignore
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!ASSET_PATTERN.test(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        // 只缓存成功的 (2xx) 与 opaque（跨域 CDN）响应。
        if (
          response &&
          (response.status === 0 ||
            (response.status >= 200 && response.status < 300))
        ) {
          try {
            await cache.put(request, response.clone());
          } catch (_) {
            // ignore (e.g. quota exceeded)
          }
        }
        return response;
      } catch (err) {
        // 网络失败时再尝试一次 cache（罕见 race condition），最终都不行就抛出。
        const fallback = await cache.match(request);
        if (fallback) return fallback;
        throw err;
      }
    })(),
  );
});
