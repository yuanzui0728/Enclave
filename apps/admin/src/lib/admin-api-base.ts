import { resolveAdminCoreApiBaseUrl } from "./core-api-base";

// 优先级（高 → 低）：
//   1. caller 显式传入 baseUrl
//   2. runtime store（云控制台"进入后台" hash bootstrap 写入的 world apiBaseUrl）
//   3. VITE_API_BASE / VITE_CORE_API_BASE_URL build-time env（dev 单机调试 fallback）
// 之前版本把 env 放在 runtime 之前，导致云控制台进任何世界后台 admin 都连到
// dev mode 的主 api（127.0.0.1:3000），所有世界看起来数据"一模一样"。
export function resolveAdminApiBase(baseUrl?: string) {
  const explicit = baseUrl?.trim();
  if (explicit) {
    const trimmed = explicit.replace(/\/+$/, "");
    return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
  }

  const runtimeBase = resolveAdminCoreApiBaseUrl().trim();
  if (runtimeBase) {
    const trimmed = runtimeBase.replace(/\/+$/, "");
    return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
  }

  const configuredBase = import.meta.env.VITE_API_BASE?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }

  return "";
}
