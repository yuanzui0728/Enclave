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
  inFlightRequests: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastSuccessAt?: string;
  lastError?: string;
}

export interface WorldSurfaceStatus {
  apiPrefix: string;
  migratedModules: string[];
  ownerCount: number;
  charactersCount: number;
  narrativeArcsCount: number;
  behaviorLogsCount: number;
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

export type SchedulerRunResult = "success" | "error";

export interface SchedulerRunRecord {
  id: string;
  jobId: string;
  jobName: string;
  status: SchedulerRunResult;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  summary: string;
}

export interface SchedulerStatus {
  healthy: boolean;
  mode: "scaffolded" | "parity" | "production";
  coldStartEnabled: boolean;
  worldSnapshots: number;
  lastWorldSnapshotAt?: string;
  jobs: SchedulerJobStatus[];
  startedAt?: string;
  recentRuns: SchedulerRunRecord[];
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
  worldSurface: WorldSurfaceStatus;
  scheduler: SchedulerStatus;
  appMode: "development" | "desktop" | "production";
}

export interface ProviderTestRequest {
  endpoint: string;
  model: string;
  apiKey?: string;
  mode?: string;
  apiStyle?: string;
}

export interface ProviderTestResult {
  success: boolean;
  message: string;
  normalizedEndpoint?: string;
  statusCode?: number;
}

export interface ProviderConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
  mode: string;
  apiStyle: string;
}

export interface InferencePreviewRequest {
  prompt: string;
  model?: string;
  systemPrompt?: string;
}

export interface InferenceUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface InferencePreviewResponse {
  success: boolean;
  output?: string;
  model?: string;
  finishReason?: string;
  usage?: InferenceUsage;
  error?: string;
}

export interface OperationResult {
  success: boolean;
  message: string;
}

export type LogIndexResponse = string[];
