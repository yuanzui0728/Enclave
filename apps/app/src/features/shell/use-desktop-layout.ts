import { useEffect, useState } from "react";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { isMobileWebRuntime, type AppPlatform } from "../../runtime/platform";

const DESKTOP_LAYOUT_MIN_WIDTH = 960;

function shouldUseDesktopLayout(platform: AppPlatform) {
  if (platform === "desktop") {
    return true;
  }

  if (platform === "android" || platform === "ios") {
    return false;
  }

  if (typeof window === "undefined") {
    return false;
  }

  if (isMobileWebRuntime(platform)) {
    return false;
  }

  return window.innerWidth >= DESKTOP_LAYOUT_MIN_WIDTH;
}

export function useDesktopLayout() {
  const runtimeConfig = useAppRuntimeConfig();
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => shouldUseDesktopLayout(runtimeConfig.appPlatform));

  useEffect(() => {
    const syncLayout = () => {
      setIsDesktopLayout(shouldUseDesktopLayout(runtimeConfig.appPlatform));
    };

    syncLayout();

    if (runtimeConfig.appPlatform !== "web" || typeof window === "undefined") {
      return;
    }

    window.addEventListener("resize", syncLayout);

    return () => {
      window.removeEventListener("resize", syncLayout);
    };
  }, [runtimeConfig.appPlatform]);

  return isDesktopLayout;
}
