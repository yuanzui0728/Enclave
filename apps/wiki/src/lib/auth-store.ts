const TOKEN_KEY = "yinjie.wiki.token";
const USER_KEY = "yinjie.wiki.user";

export type WikiUser = {
  id: string;
  username: string;
  role: string;
  userType: string;
  avatar?: string;
};

const listeners = new Set<() => void>();

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUser(): WikiUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WikiUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: WikiUser): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  notify();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) cb();
}

export const ROLE_RANK: Record<string, number> = {
  newcomer: 0,
  autoconfirmed: 1,
  patroller: 2,
  admin: 3,
};

export function hasRole(
  user: WikiUser | null,
  required: keyof typeof ROLE_RANK,
): boolean {
  if (!user) return false;
  return (ROLE_RANK[user.role] ?? -1) >= ROLE_RANK[required];
}

export function roleLabel(role: string): string {
  switch (role) {
    case "admin":
      return "管理员";
    case "patroller":
      return "巡查员";
    case "autoconfirmed":
      return "自动确认";
    case "newcomer":
      return "新人";
    default:
      return role;
  }
}
