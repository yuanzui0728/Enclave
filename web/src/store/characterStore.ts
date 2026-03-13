import { create } from 'zustand';
import type { Character } from '../types/character';
import { api } from '../services/api';

interface CharacterStore {
  characters: Character[];
  loading: boolean;
  fetchCharacters: () => Promise<void>;
  getById: (id: string) => Character | undefined;
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: [],
  loading: false,
  fetchCharacters: async () => {
    set({ loading: true });
    try {
      const data = await api.getCharacters();
      set({ characters: data as Character[] });
    } catch (error) {
      console.error('Failed to fetch characters:', error);
    } finally {
      set({ loading: false });
    }
  },
  getById: (id) => get().characters.find((c) => c.id === id),
}));
