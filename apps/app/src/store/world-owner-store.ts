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
const defaultSignature = "在现实之外，进入另一片世界。";

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
      signature: defaultSignature,
      hasCustomApiKey: false,
      customApiBase: null,
      createdAt: null,
      hydrateOwner: (owner) =>
        set({
          id: owner.id,
          username: owner.username,
          onboardingCompleted: owner.onboardingCompleted,
          avatar: resolveOwnerAvatar(owner.avatar),
          signature: owner.signature ?? defaultSignature,
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
          signature: defaultSignature,
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
          signature: defaultSignature,
          hasCustomApiKey: false,
          customApiBase: null,
          createdAt: null,
        }),
    }),
    {
      name: "yinjie-app-world-owner",
      storage: createSessionStateStorage(),
    },
  ),
);
