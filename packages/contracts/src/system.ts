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

export interface SchedulerJobStatus {
  id: string;
  name: string;
  cadence: string;
  description: string;
  enabled: boolean;
  nextRunHint: string;
  runCount: number;
  running: boolean;
  lastRunAt?: string;
  lastDurationMs?: number;
  lastResult?: string;
}

export interface SchedulerStatus {
  healthy: boolean;
  mode: "scaffolded" | "parity" | "production";
  coldStartEnabled: boolean;
  worldSnapshots: number;
  lastWorldSnapshotAt?: string;
  jobs: SchedulerJobStatus[];
  startedAt?: string;
  recentRuns: string[];
}

export interface RealtimeRoomStatus {
  roomId: string;
  subscriberCount: number;
}

export interface RealtimeStatus {
  healthy: boolean;
  namespace: string;
  socketPath: string;
  connectedClients: number;
  activeRooms: number;
  eventNames: string[];
  rooms: RealtimeRoomStatus[];
  recentEvents: string[];
  lastEventAt?: string;
  lastMessageAt?: string;
}

export interface SystemStatus {
  coreApi: ServiceHealth;
  desktopShell: ServiceHealth;
  database: DatabaseStatus;
  inferenceGateway: InferenceStatus;
  legacySurface: LegacySurfaceStatus;
  scheduler: SchedulerStatus;
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
