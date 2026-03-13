import type { Character } from '../types/character';

const API_BASE = 'http://localhost:3000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const adminApi = {
  list: () => request<Character[]>('/characters'),
  get: (id: string) => request<Character>(`/characters/${id}`),
  create: (data: Partial<Character>) =>
    request<Character>('/characters', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Character>) =>
    request<Character>(`/characters/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/characters/${id}`, { method: 'DELETE' }),

  getAiModel: () => request<{ model: string }>('/config/ai-model'),
  setAiModel: (model: string) =>
    request<{ success: boolean }>('/config/ai-model', { method: 'PUT', body: JSON.stringify({ model }) }),
  getAvailableModels: () => request<{ models: string[] }>('/config/available-models'),
};
