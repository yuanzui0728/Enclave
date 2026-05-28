import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

// 用户外观偏好：浅色 / 深色 / 跟随系统。默认浅色（白天·兰花薰衣）。
export type AppearanceMode = "light" | "dark" | "system";
// 解析后真正生效的主题，对应 .yj-mobile-shell 的 data-appearance 值。
export type ResolvedAppearance = "day" | "night";

type AppearanceState = {
  mode: AppearanceMode;
  setMode: (mode: AppearanceMode) => void;
};

// 主题偏好不是敏感信息，特意不走 createSessionStateStorage（它在原生壳上用
// async 的 native secure storage，rehydrate 晚于首帧 → 会闪一下错主题）。
// 这里用同步 localStorage：persist 同步 rehydrate，配合在 render 期直接算出
// data-appearance（见 use-appearance.ts），可做到零闪烁。localStorage 不可用
// （隐私模式 / SSR）时退回内存 Map，不持久但不报错。
function createAppearanceStorage() {
  return createJSONStorage<AppearanceState>(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage;
      }
    } catch {
      /* localStorage 被禁用，落到内存兜底 */
    }
    const mem = new Map<string, string>();
    const fallback: StateStorage = {
      getItem: (key) => mem.get(key) ?? null,
      setItem: (key, value) => {
        mem.set(key, value);
      },
      removeItem: (key) => {
        mem.delete(key);
      },
    };
    return fallback;
  });
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      mode: "light",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "yinjie-app-appearance", // i18n-ignore-line
      storage: createAppearanceStorage(),
      version: 1,
    },
  ),
);
