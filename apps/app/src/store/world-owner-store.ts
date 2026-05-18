import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorldOwner } from "@yinjie/contracts";
import defaultOwnerAvatar from "../assets/default-owner-avatar.svg";
import { createSessionStateStorage } from "../runtime/session-storage";

type WorldOwnerState = {
  id: string | null;
  username: string | null;
  onboardingCompleted: boolean;
  avatar: string;
  signature: string;
  hasCustomApiKey: boolean;
  customApiBase: string | null;
  createdAt: string | null;
  hydrateOwner: (owner: WorldOwner) => void;
  updateOwner: (input: {
    username?: string;
    avatar?: string;
    signature?: string;
    onboardingCompleted?: boolean;
    hasCustomApiKey?: boolean;
    customApiBase?: string | null;
  }) => void;
  updateProfile: (input: {
    username?: string;
    avatar?: string;
    signature?: string;
  }) => void;
  logout: () => void;
  clearOwner: () => void;
};

const defaultAvatar = defaultOwnerAvatar;
// signature 一开始是「在现实之外，进入另一片世界。」这种诗意 placeholder，
// 但它直接占用 state.signature 字段，下游 profile-page / profile-info-page
// 「signature?.trim() || 兜底」逻辑会把它当成「用户已经填了签名」展示出去 —
// 在新用户 cold start、welcome 还没 hydrate API 那一小段时间，「我」页面就
// 给人看到一行根本不是用户写的诗。把 state 用空字符串当 default，需要诗意
// 兜底的页面（如 desktop-message-avatar-popover）自己在 render 层提供 fallback。
const DEFAULT_SIGNATURE = "";

function resolveOwnerAvatar(avatar?: string | null) {
  return avatar && avatar.trim() ? avatar : defaultAvatar;
}

export const useWorldOwnerStore = create<WorldOwnerState>()(
  persist(
    (set) => ({
      id: null,
      username: null,
      onboardingCompleted: false,
      avatar: resolveOwnerAvatar(),
      signature: DEFAULT_SIGNATURE,
      hasCustomApiKey: false,
      customApiBase: null,
      createdAt: null,
      hydrateOwner: (owner) =>
        set({
          id: owner.id,
          username: owner.username,
          onboardingCompleted: owner.onboardingCompleted,
          avatar: resolveOwnerAvatar(owner.avatar),
          signature: owner.signature ?? DEFAULT_SIGNATURE,
          hasCustomApiKey: owner.hasCustomApiKey,
          customApiBase: owner.customApiBase ?? null,
          createdAt: owner.createdAt,
        }),
      updateOwner: (input) =>
        set((state) => ({
          username: input.username ?? state.username,
          avatar:
            input.avatar === undefined
              ? state.avatar
              : resolveOwnerAvatar(input.avatar),
          signature: input.signature ?? state.signature,
          onboardingCompleted: input.onboardingCompleted ?? state.onboardingCompleted,
          hasCustomApiKey: input.hasCustomApiKey ?? state.hasCustomApiKey,
          customApiBase:
            input.customApiBase === undefined ? state.customApiBase : input.customApiBase,
        })),
      updateProfile: (input) =>
        set((state) => ({
          username: input.username ?? state.username,
          avatar:
            input.avatar === undefined
              ? state.avatar
              : resolveOwnerAvatar(input.avatar),
          signature: input.signature ?? state.signature,
        })),
      logout: () =>
        set({
          id: null,
          username: null,
          onboardingCompleted: false,
          avatar: resolveOwnerAvatar(),
          signature: DEFAULT_SIGNATURE,
          hasCustomApiKey: false,
          customApiBase: null,
          createdAt: null,
        }),
      clearOwner: () =>
        set({
          id: null,
          username: null,
          onboardingCompleted: false,
          avatar: resolveOwnerAvatar(),
          signature: DEFAULT_SIGNATURE,
          hasCustomApiKey: false,
          customApiBase: null,
          createdAt: null,
        }),
    }),
    {
      name: "yinjie-app-world-owner", // i18n-ignore-line
      storage: createSessionStateStorage(),
    },
  ),
);
