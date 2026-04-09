import { setCoreApiBaseUrlProvider } from "@yinjie/contracts";

export function resolveAdminCoreApiBaseUrl() {
  const configuredBase = import.meta.env.VITE_CORE_API_BASE_URL?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function configureAdminContractsRuntime() {
  setCoreApiBaseUrlProvider(() => resolveAdminCoreApiBaseUrl());
}
