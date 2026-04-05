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
};

export type DesktopOperationResult = {
  success: boolean;
  message: string;
};

export type DesktopRuntimeDiagnostics = {
  platform: string;
  coreApiCommand: string;
  coreApiCommandResolved: boolean;
  linuxMissingPackages: string[];
  summary: string;
};

async function invokeDesktop<T>(command: string): Promise<T> {
  const tauriWindow = window as TauriWindow;
  if (!tauriWindow.__TAURI_INTERNALS__?.invoke) {
    throw new Error("Desktop runtime commands are only available inside the Tauri shell.");
  }

  return tauriWindow.__TAURI_INTERNALS__.invoke(command) as Promise<T>;
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
