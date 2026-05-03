import { clearSession, getToken } from "./auth-store";

const API_BASE = "/api";

export class WikiApiError extends Error {
  constructor(
    public status: number,
    public payload: unknown,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.auth !== false) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!res.ok) {
    if (res.status === 401) clearSession();
    const message =
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : null) ?? `请求失败 (${res.status})`;
    throw new WikiApiError(res.status, payload, message);
  }
  return payload as T;
}

export type AuthSession = {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    userType: string;
    avatar?: string;
  };
};

export type WikiContentSnapshot = {
  name: string;
  avatar: string;
  bio: string;
  personality?: string;
  expertDomains: string[];
  triggerScenes?: string[];
  relationship: string;
  relationshipType: string;
};

export type WikiPageView = {
  characterId: string;
  page: {
    characterId: string;
    currentRevisionId: string | null;
    protectionLevel: string;
    isPatrolled: boolean;
    watcherCount: number;
    editCount: number;
    isDeleted: boolean;
  };
  currentRevision: WikiRevisionSummary | null;
  content: WikiContentSnapshot;
  exists: boolean;
};

export type WikiRevisionSummary = {
  id: string;
  characterId: string;
  version: number;
  parentRevisionId: string | null;
  baseRevisionId: string | null;
  contentSnapshot: WikiContentSnapshot;
  diffFromParent: { changed?: string[] } | null;
  editorUserId: string;
  editorRoleAtTime: string;
  editSummary: string;
  status: string;
  changeSource: string;
  isMinor: boolean;
  isPatrolled: boolean;
  patrolledBy: string | null;
  patrolledAt: string | null;
  createdAt: string;
};

export type EditSubmission = {
  id: string;
  revisionId: string;
  characterId: string;
  submitterId: string;
  decision: string | null;
  reviewerId: string | null;
  decidedAt: string | null;
  reviewerNote: string | null;
  priority: number;
  createdAt: string;
};

export type PendingReviewItem = {
  submission: EditSubmission;
  revision: WikiRevisionSummary;
};

export type CharacterListItem = {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  relationship: string;
  relationshipType: string;
  sourceType: string;
};

export const wikiApi = {
  register(username: string, password: string) {
    return request<AuthSession>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      auth: false,
    });
  },
  login(username: string, password: string) {
    return request<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      auth: false,
    });
  },
  me() {
    return request<{
      id: string;
      username: string;
      role: string;
      userType: string;
    }>("/auth/me");
  },
  listCharacters() {
    return request<CharacterListItem[]>("/characters");
  },
  getPage(characterId: string) {
    return request<WikiPageView>(
      `/wiki/pages/${encodeURIComponent(characterId)}`,
      { auth: false },
    );
  },
  getHistory(characterId: string, limit = 50) {
    return request<WikiRevisionSummary[]>(
      `/wiki/pages/${encodeURIComponent(characterId)}/history?limit=${limit}`,
      { auth: false },
    );
  },
  submitEdit(
    characterId: string,
    payload: {
      contentSnapshot: WikiContentSnapshot;
      baseRevisionId?: string | null;
      editSummary?: string;
      isMinor?: boolean;
    },
  ) {
    return request<{
      revisionId: string;
      status: string;
      isPatrolled: boolean;
      appliedToCharacter: boolean;
    }>(`/wiki/pages/${encodeURIComponent(characterId)}/edits`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  listPending(limit = 50) {
    return request<PendingReviewItem[]>(`/wiki/pending-reviews?limit=${limit}`);
  },
  decide(
    revisionId: string,
    decision: "approve" | "reject" | "request_changes",
    note?: string,
  ) {
    return request<{ status: string; pageId: string }>(
      `/wiki/edits/${encodeURIComponent(revisionId)}/review`,
      {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      },
    );
  },
};
