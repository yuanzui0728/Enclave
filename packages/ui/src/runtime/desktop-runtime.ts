type TauriWindow = Window & {
  __TAURI_INTERNALS__?: {
    invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
};

export type DesktopRuntimeContext = {
  appDataDir: string;
  runtimeDataDir: string;
  databasePath: string;
  coreApiPort: number;
  coreApiBaseUrl: string;
  appUrl: string;
};

export type DesktopCoreApiStatus = {
  configuredPort: number;
  baseUrl: string;
  running: boolean;
  reachable: boolean;
  pid?: number | null;
  databasePath: string;
  message: string;
  command: string;
  commandSource: string;
  managedByDesktopShell: boolean;
};

export type DesktopOperationResult = {
  success: boolean;
  message: string;
};

export type DesktopLocaleResult = {
  locale: string;
  systemLocale?: string | null;
  source: "storage" | "system" | "default" | string;
};

export type DesktopRuntimeDiagnostics = {
  platform: string;
  coreApiCommand: string;
  coreApiCommandSource: string;
  coreApiCommandResolved: boolean;
  coreApiReachable: boolean;
  diagnosticsStatus: string;
  bundledCoreApiPath: string;
  bundledCoreApiExists: boolean;
  coreApiPortOccupied: boolean;
  managedByDesktopShell: boolean;
  managedChildPid?: number | null;
  desktopLogPath: string;
  lastCoreApiError?: string | null;
  linuxMissingPackages: string[];
  summary: string;
};

async function invokeDesktop<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const tauriWindow = window as TauriWindow;
  if (!tauriWindow.__TAURI_INTERNALS__?.invoke) {
    throw new Error("Desktop runtime commands are only available inside the Tauri shell.");
  }

  return tauriWindow.__TAURI_INTERNALS__.invoke(command, args) as Promise<T>;
}

export function isDesktopRuntimeAvailable() {
  return Boolean((window as TauriWindow).__TAURI_INTERNALS__?.invoke);
}

export function getDesktopRuntimeContext() {
  return invokeDesktop<DesktopRuntimeContext>("desktop_runtime_context");
}

export function getDesktopCoreApiStatus() {
  return invokeDesktop<DesktopCoreApiStatus>("desktop_core_api_status");
}

export function getDesktopLocale() {
  return invokeDesktop<DesktopLocaleResult>("desktop_get_locale");
}

export function setDesktopLocale(locale: string) {
  return invokeDesktop<DesktopOperationResult>("desktop_set_locale", {
    input: { locale },
  });
}

export function getDesktopRuntimeDiagnostics() {
  return invokeDesktop<DesktopRuntimeDiagnostics>("desktop_runtime_diagnostics");
}

export function probeDesktopCoreApiHealth() {
  return invokeDesktop<DesktopOperationResult>("probe_core_api_health");
}

export function startDesktopCoreApi() {
  return invokeDesktop<DesktopOperationResult>("start_core_api");
}

export function stopDesktopCoreApi() {
  return invokeDesktop<DesktopOperationResult>("stop_core_api");
}

export function restartDesktopCoreApi() {
  return invokeDesktop<DesktopOperationResult>("restart_core_api");
}
