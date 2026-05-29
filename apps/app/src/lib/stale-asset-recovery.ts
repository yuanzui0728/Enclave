// 集中处理"动态 chunk 加载失败 / 导出消失"这类 stale-asset 状况：
// 1) 全局 vite:preloadError、window.error 监听（已在 main.tsx 安装）触发
// 2) router.tsx 里 lazyNamed() 拿到空 namespace / 缺命名导出时触发
//
// 历史背景：apps/app/vite.config.ts shouldEmptyOutDir() 已被改成永远清空 dist，
// 老 tab 持有的旧 entry bundle 拉旧 hash chunk 必 404；这条恢复路径就是兜底
// 让那种 tab 自动 reload 到一致状态，避免用户卡在 ErrorBoundary 的 fallback。
//
// 防循环策略（2026-05-29 修）：旧实现用一个「整 session 只自愈一次」的 sessionStorage
// 闸（key=="1" 后永不再 reload）。问题是线上会多次重新部署，第二次部署再撞 stale
// 时闸已是 "1"，于是不 reload、直接把用户摔进 ErrorBoundary，表现为「每次切 tab 都报错、
// 得手动刷新」。改成：
//   - 记录上次自愈 reload 的时间戳；reload 后若在 COOLDOWN 内又撞 stale，判定为
//     「这个 build 根本加载不出来」的死循环，放手让 ErrorBoundary 兜底；
//   - app 成功启动后调用 markStaleRecoverySuccess() 清掉时间戳，于是每一次「真正的
//     新部署」都能再拿到一次干净的自愈 reload，而不是一辈子只许一次。

const RECOVERY_TS_KEY = "yinjie-app-stale-recovery-ts";

// 两次自愈 reload 的最小间隔。reload 后只要 app 成功跑起来就会清掉时间戳（见
// markStaleRecoverySuccess），所以正常重新部署不受这个间隔限制；它只用来掐断
// 「reload→启动就又撞 stale→再 reload」的死循环。
const RECOVERY_COOLDOWN_MS = 10_000;

function isCapacitorNativeShell() {
  if (typeof window === "undefined") return false;
  const capacitor = (
    window as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function readLastRecoveryTs(): number | null {
  try {
    const raw = window.sessionStorage.getItem(RECOVERY_TS_KEY);
    if (!raw) return null;
    const ts = Number.parseInt(raw, 10);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function shouldRecoverFromStaleAssets() {
  if (typeof window === "undefined") {
    return false;
  }

  const now = Date.now();
  const last = readLastRecoveryTs();

  // 刚自愈过却在 COOLDOWN 内又撞 stale —— 不是「换了新 build」而是「当前 build
  // 加载不出来」，再 reload 只会无限循环，停手交给 ErrorBoundary。
  if (last !== null && now - last < RECOVERY_COOLDOWN_MS) {
    return false;
  }

  try {
    window.sessionStorage.setItem(RECOVERY_TS_KEY, String(now));
  } catch {
    // sessionStorage 不可用（隐私模式等）：宁可冒一次循环风险也要尽力自愈
  }
  return true;
}

// app 成功启动后由 main.tsx 调用：清掉自愈时间戳，让下一次真正的新部署能再次
// 触发干净的自愈 reload。若启动本身就因 stale 失败（死循环场景），这个清除不会
// 在 COOLDOWN 内发生，循环仍被掐断。
export function markStaleRecoverySuccess() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(RECOVERY_TS_KEY);
  } catch {
    // ignore
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
