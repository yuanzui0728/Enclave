import { useEffect, useState } from "react";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  isMobileWebRuntime,
  type AppPlatform,
} from "../../runtime/platform";

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

  // 原生壳 (Capacitor) 在 runtimeConfig.appPlatform 还没 hydrate 完的瞬间
  // 会被 detectAppPlatform 报成 "web"，落到下面的 innerWidth 判断；模拟器/
  // 平板宽度 >= 960 会被判定为 desktop 走 DesktopShell，hydrate 完才切回
  // MobileShell。这中间 1-2s DesktopShell 的顶部导航条会闪一下。
  // 任何时刻只要 Capacitor.isNativePlatform() 为 true，强制走 mobile，
  // 不再走宽度判断。
  const capacitorWindow = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (capacitorWindow.Capacitor?.isNativePlatform?.()) {
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
