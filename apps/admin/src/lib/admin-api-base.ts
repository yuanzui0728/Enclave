import { resolveAdminCoreApiBaseUrl } from "./core-api-base";

export function resolveAdminApiBase(baseUrl?: string) {
  const configuredBase = import.meta.env.VITE_API_BASE?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }

  const resolvedCoreBase = (baseUrl || resolveAdminCoreApiBaseUrl()).replace(
    /\/+$/,
    "",
  );

  return resolvedCoreBase.endsWith("/api")
    ? resolvedCoreBase
    : `${resolvedCoreBase}/api`;
}
