import { isApiRequestError, type ApiRequestError } from "@yinjie/contracts";
import { useCloudSessionStore } from "../store/cloud-session-store";
import { clearCloudRuntimeSession } from "./cloud-session";
import { disconnectChatSocket } from "./socket";
import { triggerLoginRedirect } from "./login-redirect";

// cloud-api 的 CloudClientAuthGuard / ban guard 直接抛裸英文 message——
// 服务端有意保留英文（cloud-client-auth.guard.ts 有 i18n-ignore-start 注释）。
// 这里只用于「按 status + 已知 message 集合」精确识别鉴权失效，不参与展示。
// request-error.ts 也从这里 import 同一份常量做 toast 翻译，单源防漂移。
export const CLOUD_AUTH_401_MESSAGES = new Set([
  "Missing cloud access token.",
  "Invalid or expired cloud access token.",
  "Invalid cloud access token.",
]);
export const CLOUD_ACCOUNT_FORBIDDEN_MESSAGES = new Set([
  "This cloud account has been banned.",
  "This cloud account has been archived.",
]);

// 只命中服务端那几条「鉴权哨兵 message」而非裸 401/403，避免误杀业务 401
// （业务 401 仍走 request-error.ts 的 translateAppErrorCode）。
export function isCloudAuthExpiredError(error: unknown): boolean {
  if (!isApiRequestError(error)) return false;
  const message = error.message.trim();
  if (error.statusCode === 401 && CLOUD_AUTH_401_MESSAGES.has(message)) {
    return true;
  }
  if (error.statusCode === 403 && CLOUD_ACCOUNT_FORBIDDEN_MESSAGES.has(message)) {
    return true;
  }
  return false;
}

// welcome 页本身就在引导登录，鉴权失效跳转会打断它（且 token 此时常已清掉），
// 直接跳过。与 world-unavailable.ts 的 isOnWelcomeRoute 同款。
function isOnWelcomeRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/welcome";
}

// 全局错误处理器分支：云会话在服务端失效（token 过期 / JWT 密钥轮换 / 账号被
// 封禁注销）时，客户端可能仍以为 token 有效 → 每个 world-API 请求恒 401/403。
// 历史上这里没有分支，导致 toast + DesktopRuntimeGuard 覆盖层无限刷新且无登录
// 入口。现统一：断 socket → 清 user-scoped 状态（含会话）→ 静默跳 /welcome。
export function handleApiCloudAuthExpiredError(error: ApiRequestError) {
  if (!isCloudAuthExpiredError(error)) return;
  if (isOnWelcomeRoute()) return;
  // 幂等：N 个并发请求同帧 401 时，zustand clearSession() 同步生效，首个清掉
  // token 后其余 fire 看到 accessToken=null 直接返回，不重复断 socket / 跳转。
  // 未登录（从无 token）时也走这条短路，避免在没有会话的页面被误触发跳转。
  if (!useCloudSessionStore.getState().accessToken) return;
  disconnectChatSocket();
  clearCloudRuntimeSession();
  triggerLoginRedirect();
}
