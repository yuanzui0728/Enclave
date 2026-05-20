import type { ApiRequestError, ChatErrorPayload } from "@yinjie/contracts";
import { useWorldUnavailableDialogStore } from "../store/world-unavailable-dialog-store";

// cloud-api 的 world-api 反代在 world child 未启动 / 已休眠 / 已被 kill 时返：
//   - 503 WORLD_INSTANCE_NOT_READY（world-api-proxy.controller.ts）
//   - 502 WORLD_UPSTREAM_UNAVAILABLE（world-api-proxy.service.ts，上游 connect 失败）
//   - WebSocket upgrade 时同样返 503（world-api-ws-proxy.ts）
// 这些都对应"world 被 idle-suspend / spawn 失败 / 进程死了"，需要走「跳登陆 → 重登 → resume」闭环
// 而不是让前端一直 toast + 重试。
const WORLD_UNAVAILABLE_STATUS_CODES = new Set([502, 503]);
const WORLD_UNAVAILABLE_ERROR_CODES = new Set([
  "WORLD_INSTANCE_NOT_READY",
  "WORLD_UPSTREAM_UNAVAILABLE",
]);

function isWorldUnavailableStatus(statusCode: number, errorCode: string | null) {
  if (errorCode && WORLD_UNAVAILABLE_ERROR_CODES.has(errorCode)) {
    return true;
  }
  return WORLD_UNAVAILABLE_STATUS_CODES.has(statusCode);
}

export function openWorldUnavailableDialog(message: string) {
  useWorldUnavailableDialogStore.getState().openDialog({ message });
}

export function handleApiWorldUnavailableError(error: ApiRequestError) {
  if (!isWorldUnavailableStatus(error.statusCode, error.errorCode)) {
    return;
  }
  openWorldUnavailableDialog(error.message);
}

export function handleSocketWorldUnavailable(payload: ChatErrorPayload) {
  const message = payload.message ?? "";
  // socket.io 'connect_error' 抛 Error 对象，message 形如 "Bad request" / "websocket error" /
  // "xhr poll error: ..."；503 路径 server 端 ws-proxy 也会带上 WORLD_INSTANCE_NOT_READY。
  if (
    payload.code === "WORLD_INSTANCE_NOT_READY" ||
    payload.code === "WORLD_UPSTREAM_UNAVAILABLE" ||
    /WORLD_INSTANCE_NOT_READY|WORLD_UPSTREAM_UNAVAILABLE/.test(message) ||
    /\b50[23]\b/.test(message)
  ) {
    openWorldUnavailableDialog(message || "World is not running."); // i18n-ignore-line
    return true;
  }
  return false;
}
