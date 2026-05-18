import { _emitTyped, isInitialized } from "./index";
import {
  extractFirstUrlFromStack,
  isCurrentOriginLocalLike,
  isLocalLikeUrl,
} from "./runtime-environment";

let attached = false;

function emitInternal(
  eventName: string,
  eventType: "error" | "performance",
  props: Record<string, unknown>,
): void {
  _emitTyped(eventName, eventType, props);
}

const EXTENSION_STACK_PATTERN =
  /chrome-extension:\/\/|moz-extension:\/\/|safari-web-extension:\/\/|@user-script:/;

// 浏览器对网络瞬断给出的几种等价文案。当 stack 没有任何有用 frame 时（Safari 经常
// 整批 fetch 同一毫秒失败、stack=null），这条 rejection 没有调试价值，且对应的请求
// 失败已经被 apiCallObserver 记成 api_call ok=false，没必要再以 unhandled_rejection
// 双重上报。
const NETWORK_FAILURE_MESSAGES = new Set([
  "Load failed",
  "Failed to fetch",
  "Network request failed",
  "fetch failed",
  "NetworkError when attempting to fetch resource.",
]);

function isAbortLikeError(reason: unknown, message: string | null): boolean {
  if (
    reason &&
    typeof reason === "object" &&
    "name" in reason &&
    (reason as { name?: unknown }).name === "AbortError"
  ) {
    return true;
  }
  if (!message) return false;
  return (
    message === "signal is aborted without reason" ||
    message === "The operation was aborted." ||
    message === "The user aborted a request."
  );
}

function isApiRequestError(reason: unknown): boolean {
  return Boolean(
    reason &&
      typeof reason === "object" &&
      "name" in reason &&
      (reason as { name?: unknown }).name === "ApiRequestError",
  );
}

function hasUsefulStack(stack: string | null): boolean {
  if (!stack) return false;
  // "TypeError: Failed to fetch" 这种只有错误名、没有 frame 的不算有用
  const lines = stack.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return false;
  // 至少要有一行包含 ".js" 或 "at " 或 "@http" 之类的真实 frame 标记
  return lines.some((line) => /\.js|@http|\sat\s/.test(line));
}

function shouldDropUnhandled(
  reason: unknown,
  message: string | null,
  stack: string | null,
): boolean {
  if (isAbortLikeError(reason, message)) return true;
  if (stack && EXTENSION_STACK_PATTERN.test(stack)) return true;
  // dev / 内网 origin 上的报错：开发者本机 vite HMR、LAN 测试机、Tauri/Capacitor
  // shell 的 localhost origin 等。这些都不是生产用户能复现的真实事件，混进来
  // 只会把真错误淹没。stack 的第一行 URL 用来 attribute（topmost frame 才能
  // 代表"代码来自哪里"，而不是 location.hostname —— 公网 origin 加载了内网
  // 资源跑出来的错应该当生产看待）。
  if (isLocalLikeUrl(extractFirstUrlFromStack(stack))) return true;

  // ApiRequestError：服务端响应 4xx/5xx 已经被 apiCallObserver 记成 api_call，
  // 业务侧也有 apiRequestErrorHandler 全局通道；落到 unhandled_rejection 是双重上报。
  if (isApiRequestError(reason)) return true;

  // 网络瞬断（多浏览器变体）且 stack 没有真实 frame —— 无调试价值、且已被 api_call 覆盖。
  if (message && NETWORK_FAILURE_MESSAGES.has(message) && !hasUsefulStack(stack)) {
    return true;
  }

  const trimmed = message?.trim() ?? "";
  if (
    trimmed === "" ||
    trimmed === "{}" ||
    trimmed === "null" ||
    trimmed === "undefined"
  ) {
    return true;
  }
  return false;
}

function shouldDropFrontendError(event: ErrorEvent): boolean {
  if (event.message === "Script error." && !event.filename) return true;
  const stack = (event.error as Error | undefined)?.stack;
  if (stack && EXTENSION_STACK_PATTERN.test(stack)) return true;
  if (event.filename && EXTENSION_STACK_PATTERN.test(event.filename)) return true;
  // dev / 内网 origin（HMR `?t=...` 频繁出 useAppLocale/closest 之类的临时
  // 错，全是开发者本机的）：filename 是 dev origin 就 drop；filename 为空时
  // 退化到 stack 顶帧。
  if (event.filename && isLocalLikeUrl(event.filename)) return true;
  if (!event.filename && isLocalLikeUrl(extractFirstUrlFromStack(stack ?? null))) {
    return true;
  }
  return false;
}

// 资源加载错误（<img>/<script>/<link>/<audio>/<video>/<source>/<iframe> 拉 src 失败）
// 不会冒泡到 window，必须用 capture 阶段监听才能拿到。返回 null 表示不上报。
function buildResourceErrorProps(
  event: Event,
): Record<string, unknown> | null {
  const target = event.target;
  if (!(target instanceof Element) || target === (event.currentTarget as unknown)) {
    return null;
  }
  const tag = target.tagName.toLowerCase();
  // 业务里 <img src=""> 占位经常拿不到资源；先 narrow 一下感兴趣的标签。
  if (
    tag !== "img" &&
    tag !== "script" &&
    tag !== "link" &&
    tag !== "audio" &&
    tag !== "video" &&
    tag !== "source" &&
    tag !== "iframe"
  ) {
    return null;
  }
  // 不同标签 url 字段不同
  const anyEl = target as HTMLImageElement &
    HTMLLinkElement &
    HTMLScriptElement &
    HTMLMediaElement &
    HTMLSourceElement &
    HTMLIFrameElement;
  const url = anyEl.src || anyEl.href || anyEl.currentSrc || null;
  if (!url) return null;
  // 浏览器扩展注入的 <script>/<img> 不算业务错误
  if (EXTENSION_STACK_PATTERN.test(url)) return null;
  // data: / blob: 失败信息不全且大多是预期失败，忽略
  if (url.startsWith("data:") || url.startsWith("blob:")) return null;
  // 内网 / 本机资源 URL（如 http://192.168.x.x:3000/... 是开发者把 dev API
  // 序列化进了 store；切到公网后必然 404）。这些都是开发态噪声，不是
  // 生产事件，drop 掉避免淹没真信号——历史上 24h 累计 3650 条 LAN-IP
  // resource_error 把 wiki avatar 404 这种生产 bug 淹得几乎看不见。
  if (isLocalLikeUrl(url)) return null;
  return {
    tag,
    url: url.slice(0, 1000),
    // <link rel="stylesheet"> 的 type/rel 帮助分流 CSS vs preload
    rel: tag === "link" ? anyEl.rel || null : null,
  };
}

export function attachAutoCapture(): void {
  if (attached || typeof window === "undefined" || !isInitialized()) return;
  attached = true;

  window.addEventListener("error", (event) => {
    if (shouldDropFrontendError(event)) return;
    emitInternal("frontend_error", "error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: (event.error as Error | undefined)?.stack?.slice(0, 2000) ?? null,
    });
  });

  // 资源加载错误另起一条事件名，capture 阶段才拿得到。bubbling 的 'error' 监听器
  // 上面那个永远收不到 <img>/<script>/<link> 的失败，因为它们的 error 事件不冒泡。
  window.addEventListener(
    "error",
    (event) => {
      const props = buildResourceErrorProps(event);
      if (!props) return;
      emitInternal("resource_error", "error", props);
    },
    { capture: true },
  );

  // CSP 违规：浏览器会触发但不会进 window.error/onerror。
  // 没有 CSP 头时这个事件永远不会触发，挂上也没成本。
  if (typeof document !== "undefined") {
    document.addEventListener(
      "securitypolicyviolation",
      (event) => {
        emitInternal("csp_violation", "error", {
          blockedUri: event.blockedURI?.slice(0, 500) ?? null,
          violatedDirective: event.violatedDirective ?? null,
          effectiveDirective: event.effectiveDirective ?? null,
          sourceFile: event.sourceFile?.slice(0, 500) ?? null,
          lineNumber: event.lineNumber ?? null,
          columnNumber: event.columnNumber ?? null,
          disposition: event.disposition ?? null,
          sample: event.sample?.slice(0, 200) ?? null,
        });
      },
    );
  }

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    let message: string | null = null;
    let stack: string | null = null;
    if (reason instanceof Error) {
      message = reason.message;
      stack = reason.stack?.slice(0, 2000) ?? null;
    } else if (typeof reason === "string") {
      message = reason.slice(0, 1000);
    } else {
      try {
        message = JSON.stringify(reason).slice(0, 1000);
      } catch {
        message = String(reason).slice(0, 1000);
      }
    }
    if (shouldDropUnhandled(reason, message, stack)) return;
    emitInternal("unhandled_rejection", "error", { message, stack });
  });

  // White-screen heuristic
  window.setTimeout(() => {
    if (!document.body) return;
    const hasContent = document.body.children.length > 0 && document.body.scrollHeight > 0;
    if (!hasContent) {
      emitInternal("white_screen", "error", {
        url: location?.href ?? null,
      });
    }
  }, 5000);

  // Performance metrics
  if (typeof PerformanceObserver !== "undefined") {
    const perf: Record<string, number> = {};
    let emitted = false;

    const tryEmit = () => {
      if (emitted) return;
      if (perf.fcp || perf.lcp || perf.ttfb || perf.dcl) {
        emitted = true;
        emitInternal("performance", "performance", { ...perf });
      }
    };

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            perf.fcp = Math.round(entry.startTime);
          }
        }
      }).observe({ type: "paint", buffered: true });
    } catch {
      // ignore
    }

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) perf.lcp = Math.round(last.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // ignore
    }

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceNavigationTiming[]) {
          if (typeof entry.responseStart === "number") {
            perf.ttfb = Math.round(entry.responseStart);
          }
          if (typeof entry.domContentLoadedEventEnd === "number") {
            perf.dcl = Math.round(entry.domContentLoadedEventEnd);
          }
        }
      }).observe({ type: "navigation", buffered: true });
    } catch {
      // ignore
    }

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") tryEmit();
      },
      { once: false },
    );
    window.setTimeout(tryEmit, 8000);
  }
}
