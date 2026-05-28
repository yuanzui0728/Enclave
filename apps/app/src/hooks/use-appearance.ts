import { useSyncExternalStore } from "react";
import {
  useAppearanceStore,
  type AppearanceMode,
  type ResolvedAppearance,
} from "../store/appearance-store";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(DARK_QUERY).matches;
}

function subscribeSystemPrefersDark(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * 解析当前生效主题。mode 来自持久化 store（同步 rehydrate），system 模式下
 * 再叠加 matchMedia 的实时系统偏好。返回值可在 render 期直接当作
 * .yj-mobile-shell 的 data-appearance，无需 effect → 首帧即正确，零闪烁。
 */
export function useAppearance(): {
  mode: AppearanceMode;
  resolved: ResolvedAppearance;
  setMode: (mode: AppearanceMode) => void;
} {
  const mode = useAppearanceStore((state) => state.mode);
  const setMode = useAppearanceStore((state) => state.setMode);
  // SSR 兜底 false：本 app 是纯 CSR Vite SPA，运行期 window 恒在。
  const systemPrefersDark = useSyncExternalStore(
    subscribeSystemPrefersDark,
    getSystemPrefersDark,
    () => false,
  );

  const resolved: ResolvedAppearance =
    mode === "system"
      ? systemPrefersDark
        ? "night"
        : "day"
      : mode === "dark"
        ? "night"
        : "day";

  return { mode, resolved, setMode };
}
