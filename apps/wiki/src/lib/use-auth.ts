import { useSyncExternalStore } from "react";
import {
  getToken,
  getUser,
  subscribe,
  type WikiUser,
} from "./auth-store";

type AuthState = {
  token: string | null;
  user: WikiUser | null;
};

const EMPTY: AuthState = { token: null, user: null };
let cache: AuthState = readNow();

function readNow(): AuthState {
  return { token: getToken(), user: getUser() };
}

function getSnapshot(): AuthState {
  const next = readNow();
  if (
    next.token !== cache.token ||
    next.user?.id !== cache.user?.id ||
    next.user?.role !== cache.user?.role
  ) {
    cache = next;
  }
  return cache;
}

function getServerSnapshot(): AuthState {
  return EMPTY;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
