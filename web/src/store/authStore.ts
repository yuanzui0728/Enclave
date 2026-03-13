import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthStore {
  token: string | null;
  userId: string | null;
  username: string | null;
  login: (token: string, userId: string, username: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      username: null,
      login: (token, userId, username) => set({ token, userId, username }),
      logout: () => set({ token: null, userId: null, username: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
