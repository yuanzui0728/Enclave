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
    request<{ token: string; userId: string; username: string; onboardingCompleted: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; userId: string; username: string; onboardingCompleted: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  // Onboarding: create user with just a name
  initUser: (username: string) =>
    request<{ token: string; userId: string; username: string; onboardingCompleted: boolean }>('/auth/init', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
  completeOnboarding: (userId: string) =>
    request<{ success: boolean }>(`/auth/users/${userId}/onboarding-complete`, { method: 'PATCH' }),

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
  markConversationRead: (conversationId: string) =>
    request<void>(`/conversations/${conversationId}/read`, { method: 'POST' }),
  getOrCreateConversation: (userId: string, characterId: string) =>
    request<{ id: string }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ userId, characterId }),
    }),

  getMoments: (authorId?: string) => request<unknown[]>(authorId ? `/moments?authorId=${authorId}` : '/moments'),
  postUserMoment: (userId: string, authorName: string, authorAvatar: string, text: string) =>
    request<unknown>('/moments/user-post', {
      method: 'POST',
      body: JSON.stringify({ userId, authorName, authorAvatar, text }),
    }),
  addMomentComment: (postId: string, authorId: string, authorName: string, authorAvatar: string, text: string) =>
    request<unknown>(`/moments/${postId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ authorId, authorName, authorAvatar, text }),
    }),
  toggleMomentLike: (postId: string, authorId: string, authorName: string, authorAvatar: string) =>
    request<{ liked: boolean }>(`/moments/${postId}/like`, {
      method: 'POST',
      body: JSON.stringify({ authorId, authorName, authorAvatar }),
    }),
  generateMoment: (characterId: string) =>
    request<unknown>(`/moments/generate/${characterId}`, { method: 'POST' }),
  generateAllMoments: () =>
    request<unknown[]>('/moments/generate-all', { method: 'POST' }),

  // Feed (视频号)
  getFeed: (page = 1) => request<{ posts: unknown[]; total: number }>(`/feed?page=${page}`),
  createFeedPost: (authorId: string, authorName: string, authorAvatar: string, text: string) =>
    request<unknown>('/feed', {
      method: 'POST',
      body: JSON.stringify({ authorId, authorName, authorAvatar, text }),
    }),
  addFeedComment: (postId: string, authorId: string, authorName: string, authorAvatar: string, text: string) =>
    request<unknown>(`/feed/${postId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ authorId, authorName, authorAvatar, text }),
    }),
  likeFeedPost: (postId: string, userId: string) =>
    request<void>(`/feed/${postId}/like`, { method: 'POST', body: JSON.stringify({ userId }) }),

  // Social
  getFriendRequests: (userId: string) => request<unknown[]>(`/social/friend-requests?userId=${userId}`),
  acceptFriendRequest: (requestId: string, userId: string) =>
    request<unknown>(`/social/friend-requests/${requestId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  declineFriendRequest: (requestId: string, userId: string) =>
    request<unknown>(`/social/friend-requests/${requestId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  getFriends: (userId: string) => request<unknown[]>(`/social/friends?userId=${userId}`),

  // Groups
  createGroup: (name: string, creatorId: string, memberIds: string[]) =>
    request<{ id: string; name: string }>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, creatorId, creatorType: 'user', memberIds }),
    }),
  getGroup: (id: string) => request<unknown>(`/groups/${id}`),
  getGroupMembers: (id: string) => request<unknown[]>(`/groups/${id}/members`),
  getGroupMessages: (id: string) => request<unknown[]>(`/groups/${id}/messages`),

  // Shake (摇一摇)
  shake: (userId: string) =>
    request<{ character: { id: string; name: string; avatar: string; relationship: string; expertDomains: string[] }; greeting: string } | null>('/social/shake', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  sendFriendRequest: (userId: string, characterId: string, greeting: string) =>
    request<unknown>('/social/friend-requests/send', {
      method: 'POST',
      body: JSON.stringify({ userId, characterId, greeting }),
    }),

  // User profile update
  updateUser: (userId: string, data: { username?: string; avatar?: string; signature?: string }) =>
    request<unknown>(`/auth/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),

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

