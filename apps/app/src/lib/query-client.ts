import { QueryClient } from "@tanstack/react-query";
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
  },
});
