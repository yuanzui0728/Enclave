export interface ServiceHealth {
  name: string;
  healthy: boolean;
  version: string;
  message?: string;
}

export interface DatabaseStatus {
  path: string;
  walEnabled: boolean;
  connected: boolean;
}

export interface InferenceStatus {
  healthy: boolean;
  activeProvider?: string;
  queueDepth: number;
  maxConcurrency: number;
}

export interface LegacySurfaceStatus {
  apiPrefix: string;
  migratedModules: string[];
  usersCount: number;
  charactersCount: number;
}

export interface SystemStatus {
  coreApi: ServiceHealth;
  desktopShell: ServiceHealth;
  database: DatabaseStatus;
  inferenceGateway: InferenceStatus;
  legacySurface: LegacySurfaceStatus;
  appMode: "development" | "desktop" | "production";
}

export interface ProviderTestRequest {
  endpoint: string;
  model: string;
  apiKey?: string;
}

export interface ProviderTestResult {
  success: boolean;
  message: string;
  normalizedEndpoint?: string;
}

export interface OperationResult {
  success: boolean;
  message: string;
}

export type LogIndexResponse = string[];
