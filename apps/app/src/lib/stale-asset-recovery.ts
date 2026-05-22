// 集中处理"动态 chunk 加载失败 / 导出消失"这类 stale-asset 状况：
// 1) 全局 vite:preloadError、window.error 监听（已在 main.tsx 安装）触发
// 2) router.tsx 里 lazyNamed() 拿到空 namespace / 缺命名导出时触发
//
// 历史背景：apps/app/vite.config.ts shouldEmptyOutDir() 已被改成永远清空 dist，
// 老 tab 持有的旧 entry bundle 拉旧 hash chunk 必 404；这条恢复路径就是兜底
// 让那种 tab 自动 reload 到一致状态，避免用户卡在 ErrorBoundary 的 fallback。

const VITE_PRELOAD_RECOVERY_KEY = "yinjie-app-vite-preload-recovery";

function isCapacitorNativeShell() {
  if (typeof window === "undefined") return false;
  const capacitor = (
    window as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function shouldRecoverFromStaleAssets() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (window.sessionStorage.getItem(VITE_PRELOAD_RECOVERY_KEY) === "1") {
      return false;
    }

    window.sessionStorage.setItem(VITE_PRELOAD_RECOVERY_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

export function recoverFromStaleAssets() {
  if (!shouldRecoverFromStaleAssets()) {
    return;
  }

  // Capacitor 原生壳的 chunk 全打包在 .ipa / .apk 里，理论上不会 "stale"，
  // 但万一 OS/WKWebView 缓存抽风触发了 dynamic import 失败，window.location
  // .reload() 在深路径下会变成灾难：当前 URL 形如 capacitor://localhost/
  // tabs/chat，Capacitor router 的 SPA fallback 把 index.html 内容塞回去，
  // 但 document URL 还停在 /tabs/chat —— index.html 里的 ./assets/xxx.js
  // 相对 URL 解到 /tabs/assets/xxx.js，router 看 .js 后缀直接 404，整个 app
  // 加载不出来，用户只能强杀重开。改成跳回根再载入即可避开。
  if (isCapacitorNativeShell()) {
    window.location.replace("/");
    return;
  }

  window.location.reload();
}
