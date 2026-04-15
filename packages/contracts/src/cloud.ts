export type CloudWorldRequestStatus =
  | "pending"
  | "provisioning"
  | "active"
  | "rejected"
  | "disabled";

export type CloudWorldLifecycleStatus =
  | "queued"
  | "creating"
  | "bootstrapping"
  | "starting"
  | "ready"
  | "sleeping"
  | "stopping"
  | "failed"
  | "disabled"
  | "deleting";

export type CloudWorldStatus =
  | CloudWorldRequestStatus
  | CloudWorldLifecycleStatus;

export type CloudWorldLookupStatus = "none" | CloudWorldStatus;

export type CloudInstancePowerState =
  | "absent"
  | "provisioning"
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "error";

export type WorldLifecycleJobType = "provision" | "resume" | "suspend";

export type WorldLifecycleJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorldAccessSessionStatus =
  | "pending"
  | "resolving"
  | "waiting"
  | "ready"
  | "failed"
  | "disabled"
  | "expired";

export type WorldAccessPhase =
  | "creating"
  | "starting"
  | "ready"
  | "failed"
  | "disabled";

export interface SendPhoneCodeRequest {
  phone: string;
}

export interface SendPhoneCodeResponse {
  phone: string;
  expiresAt: string;
  debugCode?: string | null;
}

export interface VerifyPhoneCodeRequest {
  phone: string;
  code: string;
}

export interface VerifyPhoneCodeResponse {
  accessToken: string;
  phone: string;
  expiresAt: string;
}

export interface CreateCloudWorldRequest {
  worldName: string;
}

export interface ResolveWorldAccessRequest {
  clientPlatform?: string;
  clientVersion?: string;
  preferredRegion?: string;
}

export interface CloudWorldSummary {
  id: string;
  phone: string;
  name: string;
  status: CloudWorldLifecycleStatus;
  desiredState?: "running" | "sleeping";
  apiBaseUrl?: string | null;
  adminUrl?: string | null;
  healthStatus?: string | null;
  healthMessage?: string | null;
  providerKey?: string | null;
  providerRegion?: string | null;
  providerZone?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  lastAccessedAt?: string | null;
  lastInteractiveAt?: string | null;
  lastBootedAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastSuspendedAt?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorldRequestRecord {
  id: string;
  phone: string;
  worldName: string;
  status: CloudWorldRequestStatus;
  apiBaseUrl?: string | null;
  adminUrl?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudInstanceSummary {
  id: string;
  worldId: string;
  providerKey?: string | null;
  providerInstanceId?: string | null;
  name: string;
  region?: string | null;
  zone?: string | null;
  privateIp?: string | null;
  publicIp?: string | null;
  powerState: CloudInstancePowerState;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorldCallbackEndpoints {
  bootstrap: string;
  heartbeat: string;
  activity: string;
  health: string;
  fail: string;
}

export interface CloudWorldBootstrapConfig {
  worldId: string;
  worldName: string;
  phone: string;
  slug?: string | null;
  providerKey?: string | null;
  cloudPlatformBaseUrl: string;
  suggestedApiBaseUrl?: string | null;
  suggestedAdminUrl?: string | null;
  callbackToken: string;
  callbackEndpoints: CloudWorldCallbackEndpoints;
  env: Record<string, string>;
  envFileContent: string;
  dockerComposeSnippet: string;
  notes: string[];
}

export interface WorldLifecycleJobSummary {
  id: string;
  worldId: string;
  jobType: WorldLifecycleJobType;
  status: WorldLifecycleJobStatus;
  attempt: number;
  maxAttempts: number;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface WorldAccessSessionSummary {
  id: string;
  worldId: string;
  phone: string;
  status: WorldAccessSessionStatus;
  phase: WorldAccessPhase;
  displayStatus: string;
  resolvedApiBaseUrl?: string | null;
  retryAfterSeconds: number;
  estimatedWaitSeconds?: number | null;
  failureReason?: string | null;
  expiresAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolveWorldAccessResponse extends WorldAccessSessionSummary {}

export interface CloudWorldLookupResponse {
  phone: string;
  status: CloudWorldLookupStatus;
  world: CloudWorldSummary | null;
  latestRequest: CloudWorldRequestRecord | null;
}
