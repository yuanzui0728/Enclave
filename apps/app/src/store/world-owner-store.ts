import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionPayload, WorldOwner } from "@yinjie/contracts";
import { createSessionStateStorage } from "../runtime/session-storage";

type WorldOwnerState = {
  id: string | null;
  userId: string | null;
  token: string | null;
  username: string | null;
  onboardingCompleted: boolean;
  avatar: string;
  signature: string;
  hasCustomApiKey: boolean;
  customApiBase: string | null;
  createdAt: string | null;
  hydrateSession: (session: SessionPayload) => void;
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
  completeOnboarding: () => void;
  logout: () => void;
  clearOwner: () => void;
};

const defaultAvatar = "";
const defaultSignature = "在现实之外，进入另一片世界。";

export const useWorldOwnerStore = create<WorldOwnerState>()(
  persist(
    (set) => ({
      id: null,
      userId: null,
      token: null,
      username: null,
      onboardingCompleted: false,
      avatar: defaultAvatar,
      signature: defaultSignature,
      hasCustomApiKey: false,
      customApiBase: null,
      createdAt: null,
      hydrateSession: (session) =>
        set({
          id: session.userId,
          userId: session.userId,
          token: session.token,
          username: session.username,
          onboardingCompleted: session.onboardingCompleted,
          avatar: session.avatar ?? defaultAvatar,
          signature: session.signature ?? defaultSignature,
          hasCustomApiKey: session.hasCustomApiKey,
          customApiBase: session.customApiBase ?? null,
        }),
      hydrateOwner: (owner) =>
        set({
          id: owner.id,
          userId: owner.id,
          username: owner.username,
          onboardingCompleted: owner.onboardingCompleted,
          avatar: owner.avatar ?? defaultAvatar,
          signature: owner.signature ?? defaultSignature,
          hasCustomApiKey: owner.hasCustomApiKey,
          customApiBase: owner.customApiBase ?? null,
          createdAt: owner.createdAt,
        }),
      updateOwner: (input) =>
        set((state) => ({
          username: input.username ?? state.username,
          avatar: input.avatar ?? state.avatar,
          signature: input.signature ?? state.signature,
          onboardingCompleted: input.onboardingCompleted ?? state.onboardingCompleted,
          hasCustomApiKey: input.hasCustomApiKey ?? state.hasCustomApiKey,
          customApiBase:
            input.customApiBase === undefined ? state.customApiBase : input.customApiBase,
        })),
      updateProfile: (input) =>
        set((state) => ({
          username: input.username ?? state.username,
          avatar: input.avatar ?? state.avatar,
          signature: input.signature ?? state.signature,
        })),
      completeOnboarding: () => set({ onboardingCompleted: true }),
      logout: () =>
        set({
          id: null,
          userId: null,
          token: null,
          username: null,
          onboardingCompleted: false,
          avatar: defaultAvatar,
          signature: defaultSignature,
          hasCustomApiKey: false,
          customApiBase: null,
          createdAt: null,
        }),
      clearOwner: () =>
        set({
          id: null,
          userId: null,
          token: null,
          username: null,
          onboardingCompleted: false,
          avatar: defaultAvatar,
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
