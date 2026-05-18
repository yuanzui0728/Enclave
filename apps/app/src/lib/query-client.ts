import { QueryClient } from "@tanstack/react-query";
import { isApiRequestError } from "@yinjie/contracts";
import { isMobileWebRuntime } from "../runtime/platform";

const MOBILE_WEB_STALE_TIME_MS = 60_000;
const MOBILE_WEB_GC_TIME_MS = 30 * 60_000;

const mobileWebRuntime = isMobileWebRuntime();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: mobileWebRuntime ? false : undefined,
      staleTime: mobileWebRuntime ? MOBILE_WEB_STALE_TIME_MS : 10_000,
      gcTime: mobileWebRuntime ? MOBILE_WEB_GC_TIME_MS : undefined,
    },
    mutations: {
      // 兜底：caller 没写 onError 时，React Query 会把 reject rethrow 到
      // unhandledrejection。ApiRequestError 已有全局 toast 处理（runtime-config.ts），
      // 其它（socket-disconnected / Network request failed / 服务端 5xx 等）这里
      // 静默 warn，避免污染 telemetry errors 列表。需要业务感知的 callsite 仍可
      // 自己加 onError 覆盖。
      onError: (error) => {
        if (isApiRequestError(error)) return;
        console.warn("[query-client] unhandled mutation error", error);
      },
    },
  },
});
