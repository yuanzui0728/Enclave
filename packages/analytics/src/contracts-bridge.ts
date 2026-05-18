import {
  _emitTyped,
  getApiCallSampleRate,
  getEndpoint,
  isInitialized,
} from "./index";

let attached = false;

// 失败请求按 (method, path, status) 30s 内去重，防止：
//   - DesktopRuntimeGuard 之外的轮询查询在 world 重启 / 用户离线时持续打错
//   - 历史最高 1 session 25s 内出 91 条 status=0（多个并行 query 同时失败）
// 第一次失败正常上报，30s 内同 key 再次失败 drop。每条会刷新 lastAt（让"持续
// 失败"的情况只保留首条），map 大小到 200 时整体清掉避免内存涨。
const FAILURE_DEDUP_WINDOW_MS = 30_000;
const FAILURE_DEDUP_MAX_KEYS = 200;
const recentFailureAt = new Map<string, number>();

export async function attachContractsBridge(): Promise<void> {
  if (attached || !isInitialized()) return;
  attached = true;

  let setApiCallObserver: ((fn: ApiCallObserver | null) => void) | null = null;
  try {
    const mod = (await import("@yinjie/contracts")) as Record<string, unknown>;
    const fn = mod.setApiCallObserver as
      | ((f: ApiCallObserver | null) => void)
      | undefined;
    if (typeof fn === "function") setApiCallObserver = fn;
  } catch {
    return;
  }
  if (!setApiCallObserver) return;

  setApiCallObserver((observation) => {
    try {
      const endpoint = getEndpoint();
      // Avoid recursion: drop calls to the telemetry endpoint itself.
      if (endpoint && observation.path && endpoint.endsWith(observation.path)) {
        return;
      }
      // 401 + 没带 Authorization = "用户还没登录 / cloud session 还在 rehydrate"。
      // 这是 boot 期的预期状态（DesktopRuntimeGuard 等 polling 在 token 注入前
      // 就会发请求），不是 bug。早期占据 cloud-console error-rate 视图里 1/3 体积，
      // 把真错误（500/真 502）的信号埋没了，从源头滤掉。
      if (observation.status === 401 && observation.hadAuth === false) {
        return;
      }
      // 失败请求 30s 内同 key 去重，挡掉用户离线 / world 重启时多个并行 query
      // 同时打错的放大噪声。第一次失败照常报。
      if (!observation.ok) {
        const now = Date.now();
        const key = `${observation.method}|${observation.path}|${observation.status}`;
        const lastAt = recentFailureAt.get(key);
        if (lastAt !== undefined && now - lastAt < FAILURE_DEDUP_WINDOW_MS) {
          return;
        }
        recentFailureAt.set(key, now);
        if (recentFailureAt.size > FAILURE_DEDUP_MAX_KEYS) {
          recentFailureAt.clear();
        }
      }
      const sampleRate = getApiCallSampleRate();
      if (sampleRate < 1 && Math.random() > sampleRate) return;
      _emitTyped("api_call", "api_call", {
        method: observation.method,
        path: observation.path,
        status: observation.status,
        durationMs: observation.durationMs,
        ok: observation.ok,
        errorCode: observation.errorCode ?? null,
      });
    } catch {
      // never let observer affect business code
    }
  });
}

type ApiCallObserver = (o: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ok: boolean;
  errorCode?: string | null;
  hadAuth?: boolean;
}) => void;
