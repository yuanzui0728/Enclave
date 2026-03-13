import { useAuthStore } from '../store/authStore';

const API_BASE = import.meta.env.DEV ? '/api' : '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...headers, ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string; userId: string; username: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; userId: string; username: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getCharacters: () => request<unknown[]>('/characters'),
  getCharacter: (id: string) => request<unknown>(`/characters/${id}`),
  createCharacter: (data: unknown) =>
    request<unknown>('/characters', { method: 'POST', body: JSON.stringify(data) }),
  updateCharacter: (id: string, data: unknown) =>
    request<unknown>(`/characters/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCharacter: (id: string) =>
    request<unknown>(`/characters/${id}`, { method: 'DELETE' }),

  getConversations: (userId: string) => request<unknown[]>(`/conversations?userId=${userId}`),
  getMessages: (conversationId: string) => request<unknown[]>(`/conversations/${conversationId}/messages`),
  getOrCreateConversation: (userId: string, characterId: string) =>
    request<{ id: string }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ userId, characterId }),
    }),

  getMoments: () => request<unknown[]>('/moments'),
  generateMoment: (characterId: string) =>
    request<unknown>(`/moments/generate/${characterId}`, { method: 'POST' }),
  generateAllMoments: () =>
    request<unknown[]>('/moments/generate-all', { method: 'POST' }),

  startImport: (personName: string, fileContent: string) =>
    request<{ jobId: string }>('/import/start', {
      method: 'POST',
      body: JSON.stringify({ personName, fileContent }),
    }),
  getImportStatus: (jobId: string) =>
    request<{ status: string; progress: number; characterId?: string; error?: string }>(
      `/import/status/${jobId}`,
    ),
};
