import { isNativeMobileBridgeAvailable } from "./mobile-bridge";

export type MobileShareSurface = "desktop" | "native-mobile" | "mobile-web";

export function resolveMobileShareSurface(input?: {
  isDesktopLayout?: boolean;
}): MobileShareSurface {
  if (input?.isDesktopLayout) {
    return "desktop";
  }

  return isNativeMobileBridgeAvailable() ? "native-mobile" : "mobile-web";
}

export function isNativeMobileShareSurface(input?: {
  isDesktopLayout?: boolean;
}) {
  return resolveMobileShareSurface(input) === "native-mobile";
}

export function isMobileWebShareSurface(input?: {
  isDesktopLayout?: boolean;
}) {
  return resolveMobileShareSurface(input) === "mobile-web";
}
