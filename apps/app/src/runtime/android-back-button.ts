import { canSafelyNavigateBack } from "../lib/history-back";

import { isAndroidPlatform } from "./adapters/android";

const ANDROID_BACK_EVENT = "yinjie:android-back";
const DOUBLE_TAP_EXIT_WINDOW_MS = 1500;
const EXIT_TOAST_DURATION_MS = 1500;

let lastBackPressAt = 0;
let registered = false;

type CapacitorAppPlugin = {
  addListener: (
    event: "backButton",
    callback: (data: { canGoBack: boolean }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
  minimizeApp?: () => Promise<void>;
  exitApp: () => Promise<void>;
};

type CapacitorAppStateListenerHandle = { remove: () => Promise<void> };

export type AndroidBackInterceptor = (event: AndroidBackEvent) => boolean;

export type AndroidBackEvent = {
  /** Set by an interceptor to claim the back press — no further handling will run. */
  preventDefault: () => void;
  defaultPrevented: boolean;
  canGoBack: boolean;
};

const interceptors = new Set<AndroidBackInterceptor>();

/**
 * Register an interceptor that may claim the hardware back press.
 * Higher priority (later registered) interceptors run first.
 * Return `true` (or call `event.preventDefault()`) to consume the press.
 */
export function registerAndroidBackInterceptor(
  interceptor: AndroidBackInterceptor,
) {
  interceptors.add(interceptor);
  return () => {
    interceptors.delete(interceptor);
  };
}

// Capacitor 插件 Proxy 对任何属性访问都会响应（包括 `.then`），
// 直接 await 一个解析到 Proxy 的 Promise 会触发 Promise 解析链路追 thenable，
// Capacitor 实现里 then 没有 fulfill 路径就抛 "App.then() is not implemented on android"。
// 把它套一层 plain object，Promise 解析就不会再追下去。
async function importCapacitorApp(): Promise<{ app: CapacitorAppPlugin } | null> {
  try {
    const mod = (await import("@capacitor/app")) as { App: CapacitorAppPlugin };
    return mod.App ? { app: mod.App } : null;
  } catch {
    return null;
  }
}

function getOpenModalCount() {
  if (typeof document === "undefined") {
    return 0;
  }
  // 任何可见的 dialog / sheet / overlay 都应该用 [data-yinjie-dismissable] 标注
  return document.querySelectorAll(
    "[data-yinjie-dismissable='true'], dialog[open]",
  ).length;
}

function dispatchDismissEvent() {
  if (typeof window === "undefined") {
    return false;
  }
  const event = new CustomEvent(ANDROID_BACK_EVENT, { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function runInterceptors(canGoBack: boolean) {
  // 倒序触发（最后注册的最先生效）
  const ordered = Array.from(interceptors).reverse();
  let prevented = false;
  const event: AndroidBackEvent = {
    canGoBack,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
  for (const handler of ordered) {
    try {
      const consumed = handler(event);
      if (consumed === true || event.defaultPrevented) {
        prevented = true;
        break;
      }
    } catch {
      // 单个 interceptor 异常不应该卡死 back 链路
    }
  }
  return prevented;
}

// 这里不能用 lingui t/Trans —— android-back-button 在 React 树外，
// 也不在 AppLocaleProvider context 下。直接读 localStorage 的 locale
// 偏好（apps/app 自己维护的 key），加 navigator.language 做兜底。
const EXIT_HINT_MESSAGES: Record<string, string> = {
  "zh-CN": "再按一次返回键退出",
  "en-US": "Press back again to exit",
  "ja-JP": "もう一度押して終了",
  "ko-KR": "한 번 더 누르면 종료",
};

function resolveExitHintText(): string {
  try {
    const stored = window.localStorage.getItem("yinjie-i18n-locale:app");
    if (stored && EXIT_HINT_MESSAGES[stored]) {
      return EXIT_HINT_MESSAGES[stored];
    }
  } catch {
    // ignore
  }
  const lang = (
    typeof navigator !== "undefined" ? navigator.language : ""
  ).toLowerCase();
  if (lang.startsWith("zh")) return EXIT_HINT_MESSAGES["zh-CN"];
  if (lang.startsWith("ja")) return EXIT_HINT_MESSAGES["ja-JP"];
  if (lang.startsWith("ko")) return EXIT_HINT_MESSAGES["ko-KR"];
  if (lang.startsWith("en")) return EXIT_HINT_MESSAGES["en-US"];
  return EXIT_HINT_MESSAGES["zh-CN"];
}

function showExitHintToast() {
  if (typeof document === "undefined") {
    return;
  }
  const existing = document.getElementById("yj-android-exit-hint");
  if (existing) {
    existing.remove();
  }
  const node = document.createElement("div");
  node.id = "yj-android-exit-hint";
  node.textContent = resolveExitHintText();
  Object.assign(node.style, {
    position: "fixed",
    left: "50%",
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
    transform: "translateX(-50%)",
    padding: "10px 18px",
    borderRadius: "9999px",
    background: "rgba(20, 20, 20, 0.82)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "500",
    pointerEvents: "none",
    zIndex: "2147483647",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
    transition: "opacity 240ms ease",
    opacity: "1",
  } as CSSStyleDeclaration);
  document.body.appendChild(node);
  window.setTimeout(() => {
    node.style.opacity = "0";
  }, EXIT_TOAST_DURATION_MS - 240);
  window.setTimeout(() => {
    node.remove();
  }, EXIT_TOAST_DURATION_MS);
}

function isAtRootRoute() {
  if (typeof window === "undefined") {
    return true;
  }
  const path = window.location.pathname.replace(/\/+$/, "");
  // 4 个主 tab + 根路径 → 视为根
  return (
    path === "" ||
    path === "/" ||
    path === "/tabs/chat" ||
    path === "/tabs/contacts" ||
    path === "/tabs/discover" ||
    path === "/tabs/profile"
  );
}

async function handleBackPressed(
  app: CapacitorAppPlugin,
  data: { canGoBack: boolean },
) {
  // 1. 让 DOM 内的可关闭层（sheet/modal/drawer）优先消费
  if (getOpenModalCount() > 0 && dispatchDismissEvent()) {
    return;
  }
  if (dispatchDismissEvent()) {
    return;
  }

  // 2. 让业务 interceptor 消费
  if (runInterceptors(data.canGoBack)) {
    return;
  }

  // 3. 在根 tab（消息/通讯录/发现/我）：双击退出，不走 history.back
  //    canSafelyNavigateBack 在 history.length>1 的根 tab 上仍是 true，
  //    所以必须在 history.back 之前拦截，否则根 tab 上的 back 会
  //    被劫持成往后导航。
  if (isAtRootRoute()) {
    const now = Date.now();
    if (now - lastBackPressAt < DOUBLE_TAP_EXIT_WINDOW_MS) {
      lastBackPressAt = 0;
      try {
        if (app.minimizeApp) {
          await app.minimizeApp();
        } else {
          await app.exitApp();
        }
      } catch {
        // ignore
      }
      return;
    }
    lastBackPressAt = now;
    showExitHintToast();
    return;
  }

  // 4. 非根 tab：能 safe back → history.back
  if (canSafelyNavigateBack()) {
    window.history.back();
    return;
  }

  // 5. canSafelyNavigateBack 不严格判 webview 历史（看的是
  //    app-level sessionStorage chain）；webview canGoBack 通常更宽，
  //    在子页面（如 /friend-moments/xxx）也是 true。直接走 webview 后退，
  //    避免还能往回退却被报"不能"然后 minimize。
  if (data.canGoBack) {
    window.history.back();
    return;
  }

  // 6. 真的退无可退 → minimize app
  try {
    if (app.minimizeApp) {
      await app.minimizeApp();
      return;
    }
  } catch {
    // ignore
  }
}

export async function registerAndroidBackButton() {
  if (registered || !isAndroidPlatform()) {
    return;
  }
  const loaded = await importCapacitorApp();
  if (!loaded) {
    return;
  }
  registered = true;
  const { app } = loaded;
  await app.addListener("backButton", (data) => {
    void handleBackPressed(app, data);
  });
}

type AppStateChangeHandler = (state: { isActive: boolean }) => void;

const appStateHandlers = new Set<AppStateChangeHandler>();
let appStateRegistered = false;

export function registerAppStateChangeListener(handler: AppStateChangeHandler) {
  appStateHandlers.add(handler);
  return () => {
    appStateHandlers.delete(handler);
  };
}

export async function registerAndroidAppStateChange() {
  if (appStateRegistered || !isAndroidPlatform()) {
    return;
  }
  const loaded = await importCapacitorApp();
  if (!loaded) {
    return;
  }
  appStateRegistered = true;
  const { app } = loaded;
  type AppStatePlugin = CapacitorAppPlugin & {
    addListener: (
      event: "appStateChange",
      callback: (state: { isActive: boolean }) => void,
    ) => Promise<CapacitorAppStateListenerHandle>;
  };
  const appWithStateListener = app as unknown as AppStatePlugin;
  await appWithStateListener.addListener("appStateChange", (state) => {
    for (const handler of appStateHandlers) {
      try {
        handler(state);
      } catch {
        // 单个 handler 异常不应阻塞下一个
      }
    }
  });
}
