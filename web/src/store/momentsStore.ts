import { create } from 'zustand';
import type { Moment } from '../types/moment';
import { api } from '../services/api';
import { useAuthStore } from './authStore';

interface MomentsStore {
  moments: Moment[];
  loading: boolean;
  fetchMoments: (authorId?: string) => Promise<void>;
  postMoment: (userId: string, authorName: string, authorAvatar: string, text: string) => Promise<void>;
  setMoments: (moments: Moment[]) => void;
  toggleLike: (momentId: string) => Promise<void>;
  addComment: (momentId: string, text: string) => Promise<void>;
}

function normalizeMoment(raw: Record<string, unknown>): Moment {
  return {
    ...raw,
    postedAt: new Date(raw.postedAt as string),
    interactions: ((raw.interactions ?? []) as Record<string, unknown>[]).map((i) => ({
      ...i,
      createdAt: new Date(i.createdAt as string),
    })),
  } as Moment;
}

export const useMomentsStore = create<MomentsStore>((set, get) => ({
  moments: [],
  loading: false,

  fetchMoments: async (authorId?: string) => {
    set({ loading: true });
    try {
      const data = await api.getMoments(authorId);
      set({ moments: (data as Record<string, unknown>[]).map(normalizeMoment) });
    } finally {
      set({ loading: false });
    }
  },

  postMoment: async (userId, authorName, authorAvatar, text) => {
    await api.postUserMoment(userId, authorName, authorAvatar, text);
  },

  setMoments: (moments) => set({ moments }),

  toggleLike: async (momentId) => {
    const { userId, username } = useAuthStore.getState();
    if (!userId || !username) return;
    // Optimistic update
    set((state) => ({
      moments: state.moments.map((m) => {
        if (m.id !== momentId) return m;
        if (m.userInteraction?.type === 'like') {
          return { ...m, userInteraction: undefined };
        }
        return { ...m, userInteraction: { type: 'like', createdAt: new Date() } };
      }),
    }));
    try {
      await api.toggleMomentLike(momentId, userId, username, '🙂');
    } catch {
      // revert on error
      await get().fetchMoments();
    }
  },

  addComment: async (momentId, text) => {
    const { userId, username } = useAuthStore.getState();
    if (!userId || !username) return;
    // Optimistic update
    set((state) => ({
      moments: state.moments.map((m) => {
        if (m.id !== momentId) return m;
        return { ...m, userInteraction: { type: 'comment', commentText: text, createdAt: new Date() } };
      }),
    }));
    try {
      await api.addMomentComment(momentId, userId, username, '🙂', text);
    } catch {
      await get().fetchMoments();
    }
  },
}));
