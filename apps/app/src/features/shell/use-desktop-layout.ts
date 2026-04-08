import { useMemo } from "react";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { resolveAppRuntimeContext } from "../../runtime/platform";

export function useDesktopLayout() {
  const runtimeConfig = useAppRuntimeConfig();

  return useMemo(() => {
    const runtimeContext = resolveAppRuntimeContext(runtimeConfig.appPlatform);
    return runtimeContext.channel === "desktop";
  }, [runtimeConfig.appPlatform]);
}
