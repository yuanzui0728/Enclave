import type { TelemetryEventInput, TelemetryEventType } from "@yinjie/contracts";
import { ensureAnonId } from "./anon-id";
import { attachAutoCapture } from "./auto-capture";
import { newSessionId } from "./session";
import {
  clearPending,
  persistPending,
  readPending,
  sendBatchBeacon,
  sendWithRetry,
} from "./transport";
import type { InitOptions, InternalState } from "./types";

const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BATCH_SIZE = 30;
const DEFAULT_API_CALL_SAMPLE_RATE = 1.0;
// Hard upper bound for one beacon body (most browsers cap sendBeacon at 64KB).
const BEACON_MAX_EVENTS = 200;
// Defensive cap on the in-memory queue. If the endpoint never resolves
// (e.g. user stays on a pre-login screen for hours) or the network is
// permanently down, drop the oldest events so memory can never grow
// unbounded.
const MAX_QUEUE_SIZE = 1000;

let state: InternalState | null = null;
let unloadHandlersInstalled = false;

function defaultProvider(): string | null {
  return null;
}

function getCurrentPagePath(): string {
  if (typeof location === "undefined") return "";
  return location.pathname + location.search;
}

function getCurrentReferrer(): string | null {
  if (typeof document === "undefined") return null;
  return document.referrer || null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function init(options: InitOptions): void {
  if (state?.initialized) {
    if (options.debug) {
      console.warn("[analytics] init called twice; ignoring");
    }
    return;
  }

  if (!options.endpoint && !options.endpointProvider) {
    if (options.debug) {
      console.warn("[analytics] init requires endpoint or endpointProvider");
    }
    return;
  }

  const wrappedUserIdProvider: () => string | null = () => {
    if (!options.userIdProvider) return null;
    try {
      const v = options.userIdProvider();
      return typeof v === "string" && v.length > 0 ? v : null;
    } catch {
      return null;
    }
  };

  const wrappedWorldIdProvider: () => string | null = () => {
    if (!options.worldIdProvider) return null;
    try {
      const v = options.worldIdProvider();
      return typeof v === "string" && v.length > 0 ? v : null;
    } catch {
      return null;
    }
  };

  const wrappedEndpointProvider: () => string | null = () => {
    try {
      if (options.endpointProvider) {
        const v = options.endpointProvider();
        if (typeof v === "string" && v.length > 0) return v;
      }
      if (options.endpoint && options.endpoint.length > 0) {
        return options.endpoint;
      }
      return null;
    } catch {
      return options.endpoint ?? null;
    }
  };

  const merged: InternalState["options"] = {
    appId: options.appId,
    endpointProvider: wrappedEndpointProvider,
    userIdProvider: options.userIdProvider ? wrappedUserIdProvider : defaultProvider,
    worldIdProvider: options.worldIdProvider
      ? wrappedWorldIdProvider
      : defaultProvider,
    release: options.release ?? null,
    flushIntervalMs: options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    maxBatchSize: options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
    apiCallSampleRate: options.apiCallSampleRate ?? DEFAULT_API_CALL_SAMPLE_RATE,
    debug: options.debug ?? false,
    enableAutoCapture: options.enableAutoCapture ?? true,
    enableAutoPageView: options.enableAutoPageView ?? true,
    enableContractsBridge: options.enableContractsBridge ?? true,
  };

  state = {
    options: merged,
    anonId: ensureAnonId(),
    sessionId: newSessionId(),
    sessionStartedAt: Date.now(),
    visibleSinceMs:
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? 0
        : Date.now(),
    visibleAccumMs: 0,
    pageMountedAt: Date.now(),
    currentPagePath: getCurrentPagePath(),
    queue: [],
    flushTimer: null,
    flushing: false,
    initialized: true,
  };

  installLifecycleHandlers();

  state.flushTimer = setInterval(() => {
    void flushInternal();
  }, merged.flushIntervalMs);
  const timerWithUnref = state.flushTimer as unknown as { unref?: () => void };
  if (timerWithUnref && typeof timerWithUnref.unref === "function") {
    timerWithUnref.unref();
  }

  if (merged.enableAutoCapture) {
    // 同步挂监听 —— 用 dynamic import 会让 window.error/unhandledrejection
    // 监听到 init() 返回之后才装上，期间触发的浏览器级报错全部丢失。
    // auto-capture 体积只有几 KB，无 split 价值。
    try {
      attachAutoCapture();
    } catch {
      // never let observer init affect business code
    }
  }
  if (merged.enableAutoPageView) {
    void import("./auto-page-view").then((m) => m.attachAutoPageView()).catch(() => {});
  }
  if (merged.enableContractsBridge) {
    void import("./contracts-bridge").then((m) => m.attachContractsBridge()).catch(() => {});
  }

  // Replay any pending events from prior sessions before emitting session_start.
  const pending = readPending();
  if (pending.length > 0) {
    state.queue.push(...pending);
    clearPending();
  }

  trackInternal("session_start", "session", {
    pageMountedAt: state.pageMountedAt,
  });

  if (typeof document !== "undefined") {
    trackInternal("page_view", "pv", {});
  }

  if (merged.debug) {
    type DebugWindow = Window & {
      __analytics?: {
        track: typeof track;
        trackPageView: typeof trackPageView;
        flush: typeof flush;
      };
    };
    if (typeof window !== "undefined") {
      (window as DebugWindow).__analytics = { track, trackPageView, flush };
    }
  }
}

export function track(eventName: string, props?: Record<string, unknown>): void {
  trackInternal(eventName, "business", props);
}

export function _emitTyped(
  eventName: string,
  eventType: TelemetryEventType,
  props?: Record<string, unknown>,
): void {
  trackInternal(eventName, eventType, props);
}

export function trackPageView(
  pagePath?: string,
  extra?: Record<string, unknown>,
): void {
  if (!state) return;
  const nextPath = pagePath ?? getCurrentPagePath();

  // Same-path dedup: TanStack/Next routers fire replaceState/popstate for
  // search-param updates without changing the path. Skip those.
  if (nextPath === state.currentPagePath) return;

  const previousPath = state.currentPagePath;
  const previousMountedAt = state.pageMountedAt;
  const previousDuration = Date.now() - previousMountedAt;

  if (previousPath) {
    // page_view_end carries time-on-page; it's a session-scoped measurement,
    // not a fresh page view. Using eventType='session' keeps it out of
    // pvCount (which would otherwise double-count every navigation).
    trackInternal("page_view_end", "session", {
      pagePath: previousPath,
      durationMs: previousDuration,
    });
  }

  state.currentPagePath = nextPath;
  state.pageMountedAt = Date.now();
  trackInternal("page_view", "pv", { ...extra });
}

export function identify(_userId: string | null): void {
  // userIdProvider is read on every event, so this is a no-op stub kept
  // for API parity. Consumers who want a static value can wrap a closure
  // and pass it via init.
}

export function flush(): Promise<void> {
  return flushInternal();
}

export function getAnonId(): string | null {
  return state?.anonId ?? null;
}

export function getSessionId(): string | null {
  return state?.sessionId ?? null;
}

export function getEndpoint(): string | null {
  return state?.options.endpointProvider() ?? null;
}

export function getAppId(): string | null {
  return state?.options.appId ?? null;
}

export function getApiCallSampleRate(): number {
  return state?.options.apiCallSampleRate ?? 1.0;
}

export function isInitialized(): boolean {
  return Boolean(state?.initialized);
}

function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  // Non-cryptographic fallback for non-secure contexts. Collision is extremely
  // unlikely in the analytics setting and a duplicate just gets dedup'd later.
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function trackInternal(
  eventName: string,
  eventType: TelemetryEventType,
  props?: Record<string, unknown>,
): void {
  if (!state) return;
  const userId = safeUserId();
  const worldId = safeWorldId();
  // Shallow-clone props so callers can mutate or recycle the object after
  // calling track() without corrupting the queued event.
  const clonedProps =
    props && Object.keys(props).length > 0 ? { ...props } : undefined;
  const event: TelemetryEventInput = {
    // Client-generated id makes the request idempotent: if a fetch is aborted
    // mid-flight (server received but response lost) and we retry — or if a
    // localStorage replay re-sends events from the previous session — the
    // server's INSERT OR IGNORE drops the duplicate by primary key.
    id: newEventId(),
    eventName,
    eventType,
    occurredAt: nowIso(),
    sessionId: state.sessionId,
    anonId: state.anonId,
    userId,
    worldId,
    pagePath: state.currentPagePath || null,
    referrer: getCurrentReferrer(),
    release: state.options.release,
    props: clonedProps,
  };

  state.queue.push(event);
  // Cap queue size — drop the oldest events first if we somehow run away
  // (endpoint never resolves, network down for hours, etc.).
  if (state.queue.length > MAX_QUEUE_SIZE) {
    state.queue.splice(0, state.queue.length - MAX_QUEUE_SIZE);
  }
  if (state.options.debug) {
    console.debug("[analytics] track", event);
  }
  if (state.queue.length >= state.options.maxBatchSize) {
    void flushInternal();
  }
}

function safeUserId(): string | null {
  if (!state) return null;
  try {
    const v = state.options.userIdProvider();
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function safeWorldId(): string | null {
  if (!state) return null;
  try {
    const v = state.options.worldIdProvider();
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

async function flushInternal(useBeaconHint = false): Promise<void> {
  if (!state || state.flushing || state.queue.length === 0) return;

  const endpoint = state.options.endpointProvider();
  if (!endpoint) {
    // No endpoint resolvable yet (e.g. user hasn't logged into cloud world);
    // keep events queued for later.
    return;
  }

  state.flushing = true;
  const batch = state.queue.splice(0, state.options.maxBatchSize);
  const body = { appId: state.options.appId, events: batch };
  try {
    let ok = false;
    if (useBeaconHint) {
      ok = sendBatchBeacon(endpoint, body);
    }
    if (!ok) {
      ok = await sendWithRetry(endpoint, body);
    }
    if (!ok) {
      persistPending(batch);
    }
  } finally {
    state.flushing = false;
  }
}

/**
 * Drain everything in the queue using sendBeacon (page is unloading).
 * Splits into <= BEACON_MAX_EVENTS batches; persists any leftover that
 * sendBeacon refused to take so the next session can replay them.
 */
function drainOnUnload(): void {
  if (!state) return;
  const endpoint = state.options.endpointProvider();
  if (!endpoint || state.queue.length === 0) return;

  const queue = state.queue.splice(0);
  const dropped: TelemetryEventInput[] = [];

  while (queue.length > 0) {
    const batch = queue.splice(0, BEACON_MAX_EVENTS);
    const ok = sendBatchBeacon(endpoint, {
      appId: state.options.appId,
      events: batch,
    });
    if (!ok) {
      dropped.push(...batch);
    }
  }

  if (dropped.length > 0) {
    persistPending(dropped);
  }
}

function installLifecycleHandlers(): void {
  if (unloadHandlersInstalled) return;
  if (typeof window === "undefined") return;
  unloadHandlersInstalled = true;

  const onHidden = () => {
    if (!state) return;
    const now = Date.now();
    if (state.visibleSinceMs > 0) {
      state.visibleAccumMs += now - state.visibleSinceMs;
      state.visibleSinceMs = 0;
    }
  };
  const onVisible = () => {
    if (!state) return;
    state.visibleSinceMs = Date.now();
  };
  const onUnload = () => {
    if (!state) return;
    const now = Date.now();
    if (state.visibleSinceMs > 0) {
      state.visibleAccumMs += now - state.visibleSinceMs;
      state.visibleSinceMs = 0;
    }
    trackInternal("session_end", "session", {
      durationMs: state.visibleAccumMs,
      wallClockMs: now - state.sessionStartedAt,
    });
    drainOnUnload();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      onHidden();
      drainOnUnload();
    } else {
      onVisible();
    }
  });
  window.addEventListener("pagehide", onUnload);
  window.addEventListener("beforeunload", onUnload);
}

export type { InitOptions } from "./types";
export {
  extractFirstUrlFromStack,
  isCurrentOriginLocalLike,
  isLocalLikeHostname,
  isLocalLikeUrl,
} from "./runtime-environment";
