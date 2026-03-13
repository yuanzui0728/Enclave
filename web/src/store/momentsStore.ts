import { create } from 'zustand';
import type { Moment } from '../types/moment';
import { api } from '../services/api';

interface MomentsStore {
  moments: Moment[];
  loading: boolean;
  fetchMoments: () => Promise<void>;
  setMoments: (moments: Moment[]) => void;
  toggleLike: (momentId: string) => void;
  addComment: (momentId: string, text: string) => void;
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

export const useMomentsStore = create<MomentsStore>((set) => ({
  moments: [],
  loading: false,

  fetchMoments: async () => {
    set({ loading: true });
    try {
      const data = await api.getMoments();
      set({ moments: (data as Record<string, unknown>[]).map(normalizeMoment) });
    } finally {
      set({ loading: false });
    }
  },

  setMoments: (moments) => set({ moments }),

  toggleLike: (momentId) => {
    set((state) => ({
      moments: state.moments.map((m) => {
        if (m.id !== momentId) return m;
        if (m.userInteraction?.type === 'like') {
          return { ...m, userInteraction: undefined };
        }
        return { ...m, userInteraction: { type: 'like', createdAt: new Date() } };
      }),
    }));
  },

  addComment: (momentId, text) => {
    set((state) => ({
      moments: state.moments.map((m) => {
        if (m.id !== momentId) return m;
        return {
          ...m,
          userInteraction: { type: 'comment', commentText: text, createdAt: new Date() },
        };
      }),
    }));
  },
}));
