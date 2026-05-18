import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  refreshCloudAccessToken,
  type CloudProfileResponse,
} from "@yinjie/contracts";
import { createSessionStateStorage } from "../runtime/session-storage";

// token 临到期阈值：剩余时间小于这个值就主动续，避免落到 0 时 401。
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1d
// in-flight refresh 复用，避免多处并发触发同时打 N 次 refresh。
let inflightRefresh: Promise<boolean> | null = null;

export type CloudSessionSnapshot = {
  accessToken: string | null;
  expiresAt: string | null;
  phone: string | null;
  // 邮箱 / Google 登录路径要把邮箱回写进来，否则 mobile 反馈面板
  // 拿不到真实联系方式，admin 控制台只剩世界主人名可以认人。
  email: string | null;
  profile: CloudProfileResponse | null;
};

type CloudSessionState = CloudSessionSnapshot & {
  hydrated: boolean;
  setSession: (input: CloudSessionSnapshot) => void;
  setProfile: (profile: CloudProfileResponse | null) => void;
  clearSession: () => void;
  markHydrated: () => void;
};

const emptySnapshot: CloudSessionSnapshot = {
  accessToken: null,
  expiresAt: null,
  phone: null,
  email: null,
  profile: null,
};

export function isCloudSessionExpired(expiresAt?: string | null) {
  if (!expiresAt) {
    return true;
  }

  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

export const useCloudSessionStore = create<CloudSessionState>()(
  persist(
    (set) => ({
      ...emptySnapshot,
      hydrated: false,
      setSession: (input) =>
        set({
          accessToken: input.accessToken?.trim() || null,
          expiresAt: input.expiresAt?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim().toLowerCase() || null,
          profile: input.profile ?? null,
        }),
      setProfile: (profile) => set({ profile }),
      clearSession: () =>
        set({
          ...emptySnapshot,
        }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "yinjie-app-cloud-session", // i18n-ignore-line
      storage: createSessionStateStorage(),
      partialize: (state) => ({
        accessToken: state.accessToken,
        expiresAt: state.expiresAt,
        phone: state.phone,
        email: state.email,
        profile: state.profile,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

export async function hydrateCloudSessionStore() {
  await useCloudSessionStore.persist.rehydrate();
  if (!useCloudSessionStore.getState().hydrated) {
    useCloudSessionStore.getState().markHydrated();
  }
  return useCloudSessionStore.getState();
}

// Sliding TTL：token 还活着但剩余 < 1d 时主动调 cloud-api 续命；过期则不动，
// 让上层显式引导用户重发验证码。返回 true 表示发起了 refresh（成功或失败均
// 算"已尝试"，调用方据此决定要不要重抓最新 state）。
export async function refreshCloudSessionIfNeeded(
  cloudApiBaseUrl?: string,
): Promise<boolean> {
  const state = useCloudSessionStore.getState();
  if (!state.accessToken || !state.expiresAt) return false;
  const expiresMs = Date.parse(state.expiresAt);
  if (!Number.isFinite(expiresMs)) return false;
  const remaining = expiresMs - Date.now();
  if (remaining <= 0) return false; // i18n-ignore-line: dev comment - 已过期，留给登录流程兜底
  if (remaining > REFRESH_THRESHOLD_MS) return false;

  if (inflightRefresh) {
    return inflightRefresh;
  }

  inflightRefresh = (async () => {
    try {
      const result = await refreshCloudAccessToken(
        state.accessToken!,
        cloudApiBaseUrl,
      );
      useCloudSessionStore.getState().setSession({
        accessToken: result.accessToken,
        expiresAt: result.expiresAt,
        phone: state.phone,
        email: state.email,
        profile: state.profile,
      });
      return true;
    } catch {
      // 失败不抛，留给后续 401 走登录兜底；下次再尝试时入口仍开着。
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}
