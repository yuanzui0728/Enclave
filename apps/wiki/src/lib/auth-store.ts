import { useCallback } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage, useAppLocale } from "@yinjie/i18n";

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

// 跨 tab 同步：浏览器 storage 事件只在「其他 tab 改了 localStorage」时触发，
// 同 tab 的 setSession/clearSession 走上面的 notify()。两条路径合起来才能让
// 「tab A 改名 / 登出」也立刻反映在 tab B 上 —— 不然 tab B 的 useAuth 拿的
// 还是旧 cache，UI 一直停在旧 username（changeUsername 这条新流程下尤其
// 明显，用户在改名 tab 操作后切回另一个 tab，名字没变会以为没生效）。
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === TOKEN_KEY || event.key === USER_KEY || event.key === null) {
      notify();
    }
  });
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
  const t = translateRuntimeMessage;
  switch (role) {
    case "admin":
      return t(msg`管理员`);
    case "patroller":
      return t(msg`巡查员`);
    case "autoconfirmed":
      return t(msg`自动确认`);
    case "newcomer":
      return t(msg`新人`);
    default:
      return role;
  }
}

export function useRoleLabel() {
  const { activationVersion, locale } = useAppLocale();
  return useCallback(
    (role: string) => roleLabel(role),
    [activationVersion, locale],
  );
}
