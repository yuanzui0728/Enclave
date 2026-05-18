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
  // 这里挑要触发 re-render 的字段做引用更新；token / id / role 老就有，
  // username 是新加的：changeUsername 流程下 token+id+role 都不变只有
  // username 变，要是不列进来，跨 tab storage 事件触发 notify() 后这个函
  // 数返回的还是旧 cache（同引用），React 认为无变化，UserMenu 等订阅了
  // useAuth() 的组件不会重新渲染，UI 还是旧名字。
  if (
    next.token !== cache.token ||
    next.user?.id !== cache.user?.id ||
    next.user?.role !== cache.user?.role ||
    next.user?.username !== cache.user?.username
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
