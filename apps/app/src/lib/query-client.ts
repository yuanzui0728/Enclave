import { QueryClient } from "@tanstack/react-query";
import { detectAppPlatform } from "../runtime/platform";

const MOBILE_BROWSER_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Windows Phone/i;
const MOBILE_WEB_STALE_TIME_MS = 60_000;
const MOBILE_WEB_GC_TIME_MS = 30 * 60_000;

function isMobileWebRuntime() {
  if (detectAppPlatform() !== "web" || typeof window === "undefined") {
    return false;
  }

  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarsePointer || MOBILE_BROWSER_PATTERN.test(userAgent);
}

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
