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

export type CloudWorldDeploymentState =
  | "unknown"
  | "package_only"
  | "running"
  | "starting"
  | "stopped"
  | "missing"
  | "error";

export type WorldLifecycleJobType = "provision" | "resume" | "suspend" | "reconcile";

export type WorldLifecycleJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorldLifecycleJobAuditFilter = "superseded";
export type CloudWorldLifecycleJobQueueStateFilter =
  | "running_now"
  | "lease_expired"
  | "delayed";

export type CloudWaitingSessionSyncTaskType =
  | "refresh_phone"
  | "invalidate_phone"
  | "refresh_world";

export type CloudWaitingSessionSyncTaskStatus =
  | "pending"
  | "running"
  | "failed";

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

export interface IssueCloudAdminAccessTokenResponse {
  accessToken: string;
  expiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  tokenType: "Bearer";
}

export interface RefreshCloudAdminAccessTokenRequest {
  refreshToken: string;
}

export interface RevokeCloudAdminSessionRequest {
  refreshToken: string;
}

export interface RevokeCloudAdminSessionResponse {
  success: true;
}

export interface RevokeCloudAdminSessionsByIdRequest {
  sessionIds: string[];
}

export interface RevokeCloudAdminSessionsByIdResponse {
  success: true;
  revokedSessionIds: string[];
  skippedSessionIds: string[];
}

export interface RevokeCloudAdminSessionsByFilterRequest {
  status?: CloudAdminSessionStatus;
  revocationReason?: CloudAdminSessionRevocationReason;
  currentOnly?: boolean;
  query?: string;
  sourceKey?: string;
}

export interface RevokeCloudAdminSessionsByFilterResponse {
  success: true;
  revokedCount: number;
  skippedCount: number;
  revokedCurrentSession: boolean;
}

export interface CloudAdminSessionSourceGroupQuery {
  status?: CloudAdminSessionStatus;
  revocationReason?: CloudAdminSessionRevocationReason;
  currentOnly?: boolean;
  query?: string;
  sourceKey?: string;
  riskLevel?: CloudAdminSessionSourceGroupRiskLevel;
  sortBy?: CloudAdminSessionSourceGroupSortField;
  sortDirection?: CloudAdminSessionSortDirection;
  page?: number;
  pageSize?: number;
}

export interface CloudAdminSessionSourceGroupSummary {
  sourceKey: string;
  issuedFromIp?: string | null;
  issuedUserAgent?: string | null;
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  revokedSessions: number;
  refreshTokenReuseRevocations: number;
  currentSessions: number;
  riskLevel: CloudAdminSessionSourceGroupRiskLevel;
  riskSignals: CloudAdminSessionSourceGroupRiskSignal[];
  latestCreatedAt: string;
  latestLastUsedAt?: string | null;
  latestRevokedAt?: string | null;
}

export interface RevokeCloudAdminSessionSourceGroupRequest
  extends CloudAdminSessionSourceGroupQuery {
  sourceKey: string;
}

export type RevokeCloudAdminSessionSourceGroupResponse =
  RevokeCloudAdminSessionsByFilterResponse;

export interface CreateCloudAdminSessionSourceGroupSnapshotRequest
  extends RevokeCloudAdminSessionSourceGroupRequest {}

export interface CreateCloudAdminSessionSourceGroupRiskSnapshotRequest
  extends RevokeCloudAdminSessionsByFilterRequest {
  riskLevel: CloudAdminSessionSourceGroupRiskLevel;
}

export interface RevokeCloudAdminSessionSourceGroupsByRiskRequest
  extends RevokeCloudAdminSessionsByFilterRequest {
  riskLevel: CloudAdminSessionSourceGroupRiskLevel;
}

export interface RevokeCloudAdminSessionSourceGroupsByRiskResponse {
  success: true;
  matchedGroupCount: number;
  revokedGroupCount: number;
  revokedSessionCount: number;
  skippedSessionCount: number;
  revokedCurrentSession: boolean;
}

export interface CloudAdminSessionSourceGroupSnapshotSummary {
  sourceKey: string;
  issuedFromIp?: string | null;
  issuedUserAgent?: string | null;
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  revokedSessions: number;
  refreshTokenReuseRevocations: number;
  currentSessions: number;
  riskLevel: CloudAdminSessionSourceGroupRiskLevel;
  riskSignals: CloudAdminSessionSourceGroupRiskSignal[];
  latestCreatedAt?: string | null;
  latestLastUsedAt?: string | null;
  latestRevokedAt?: string | null;
}

export interface CloudAdminSessionSourceGroupSnapshot {
  generatedAt: string;
  filters: RevokeCloudAdminSessionsByFilterRequest;
  group: CloudAdminSessionSourceGroupSnapshotSummary;
  sessions: CloudAdminSessionSummary[];
}

export interface CloudAdminSessionSourceGroupRiskSnapshot {
  generatedAt: string;
  filters: RevokeCloudAdminSessionsByFilterRequest & {
    riskLevel: CloudAdminSessionSourceGroupRiskLevel;
  };
  totalGroups: number;
  totalSessions: number;
  groups: CloudAdminSessionSourceGroupSnapshotSummary[];
  sessions: CloudAdminSessionSummary[];
}

export type CloudAdminSessionStatus = "active" | "expired" | "revoked";
export type CloudAdminSessionRevocationReason =
  | "logout"
  | "manual-revocation"
  | "refresh-token-reuse";
export type CloudAdminSessionSourceGroupSortField =
  | "activeSessions"
  | "totalSessions"
  | "latestCreatedAt"
  | "latestLastUsedAt"
  | "latestRevokedAt";
export type CloudAdminSessionSourceGroupRiskLevel =
  | "normal"
  | "watch"
  | "critical";
export type CloudAdminSessionSourceGroupRiskSignal =
  | "multiple-active-sessions"
  | "repeated-revocations"
  | "refresh-token-reuse";
export type CloudAdminSessionSortField =
  | "updatedAt"
  | "createdAt"
  | "expiresAt"
  | "lastUsedAt"
  | "revokedAt";
export type CloudAdminSessionSortDirection = "asc" | "desc";

export interface CloudAdminSessionListQuery {
  status?: CloudAdminSessionStatus;
  revocationReason?: CloudAdminSessionRevocationReason;
  currentOnly?: boolean;
  query?: string;
  sourceKey?: string;
  sortBy?: CloudAdminSessionSortField;
  sortDirection?: CloudAdminSessionSortDirection;
  page?: number;
  pageSize?: number;
}

export interface CloudAdminSessionSummary {
  id: string;
  status: CloudAdminSessionStatus;
  isCurrent: boolean;
  expiresAt: string;
  issuedFromIp?: string | null;
  issuedUserAgent?: string | null;
  lastUsedAt?: string | null;
  lastUsedIp?: string | null;
  lastUsedUserAgent?: string | null;
  lastRefreshedAt?: string | null;
  revokedAt?: string | null;
  revokedBySessionId?: string | null;
  revocationReason?: CloudAdminSessionRevocationReason | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudAdminSessionListResponse {
  items: CloudAdminSessionSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CloudWaitingSessionSyncTaskListQuery {
  status?: CloudWaitingSessionSyncTaskStatus;
  taskType?: CloudWaitingSessionSyncTaskType;
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface CloudWorldLifecycleJobListQuery {
  worldId?: string;
  status?: WorldLifecycleJobStatus;
  jobType?: WorldLifecycleJobType;
  provider?: string;
  queueState?: CloudWorldLifecycleJobQueueStateFilter;
  audit?: WorldLifecycleJobAuditFilter;
  supersededBy?: WorldLifecycleJobType;
  query?: string;
}

export interface CloudWaitingSessionSyncTaskSummary {
  id: string;
  taskKey: string;
  taskType: CloudWaitingSessionSyncTaskType;
  targetValue: string;
  context: string;
  status: CloudWaitingSessionSyncTaskStatus;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  leaseRemainingSeconds?: number | null;
  lastError?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWaitingSessionSyncTaskListResponse {
  items: CloudWaitingSessionSyncTaskSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ReplayFailedCloudWaitingSessionSyncTasksRequest {
  taskIds: string[];
}

export interface ReplayFailedCloudWaitingSessionSyncTasksResponse {
  success: true;
  replayedTaskIds: string[];
  skippedTaskIds: string[];
}

export interface ClearFailedCloudWaitingSessionSyncTasksRequest {
  taskIds: string[];
}

export interface ClearFailedCloudWaitingSessionSyncTasksResponse {
  success: true;
  clearedTaskIds: string[];
  skippedTaskIds: string[];
}

export interface ReplayFilteredFailedCloudWaitingSessionSyncTasksRequest {
  taskType?: CloudWaitingSessionSyncTaskType;
  query?: string;
}

export interface ReplayFilteredFailedCloudWaitingSessionSyncTasksResponse {
  success: true;
  matchedCount: number;
  replayedCount: number;
  skippedCount: number;
}

export interface ClearFilteredFailedCloudWaitingSessionSyncTasksRequest {
  taskType?: CloudWaitingSessionSyncTaskType;
  query?: string;
}

export interface ClearFilteredFailedCloudWaitingSessionSyncTasksResponse {
  success: true;
  matchedCount: number;
  clearedCount: number;
  skippedCount: number;
}

export interface CloudAdminSessionSourceGroupListResponse {
  items: CloudAdminSessionSourceGroupSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  provisionStrategy?: string | null;
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
  displayStatus?: string | null;
  failureReason?: string | null;
  projectedWorldStatus?: CloudWorldLifecycleStatus;
  projectedDesiredState?: "running" | "sleeping";
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
  providerVolumeId?: string | null;
  providerSnapshotId?: string | null;
  name: string;
  region?: string | null;
  zone?: string | null;
  privateIp?: string | null;
  publicIp?: string | null;
  powerState: CloudInstancePowerState;
  imageId?: string | null;
  flavor?: string | null;
  diskSizeGb?: number | null;
  launchConfig?: Record<string, string> | null;
  bootstrappedAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastOperationAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorldInstanceFleetItem {
  world: CloudWorldSummary;
  instance: CloudInstanceSummary | null;
}

export interface CloudWorldCallbackEndpoints {
  bootstrap: string;
  heartbeat: string;
  activity: string;
  health: string;
  fail: string;
}

export interface CloudComputeProviderCapabilities {
  managedProvisioning: boolean;
  managedLifecycle: boolean;
  bootstrapPackage: boolean;
  snapshots: boolean;
}

export interface CloudComputeProviderSummary {
  key: string;
  label: string;
  description: string;
  provisionStrategy: string;
  deploymentMode: string;
  defaultRegion?: string | null;
  defaultZone?: string | null;
  capabilities: CloudComputeProviderCapabilities;
}

export interface CloudWorldBootstrapConfig {
  worldId: string;
  worldName: string;
  phone: string;
  slug?: string | null;
  providerKey?: string | null;
  providerLabel?: string | null;
  deploymentMode?: string | null;
  executorMode?: string | null;
  cloudPlatformBaseUrl: string;
  suggestedApiBaseUrl?: string | null;
  suggestedAdminUrl?: string | null;
  image?: string | null;
  containerName?: string | null;
  volumeName?: string | null;
  projectName?: string | null;
  remoteDeployPath?: string | null;
  callbackToken: string;
  callbackEndpoints: CloudWorldCallbackEndpoints;
  env: Record<string, string>;
  envFileContent: string;
  dockerComposeSnippet: string;
  notes: string[];
}

export interface CloudWorldRuntimeStatusSummary {
  worldId: string;
  providerKey?: string | null;
  deploymentMode?: string | null;
  executorMode?: string | null;
  remoteHost?: string | null;
  remoteDeployPath?: string | null;
  projectName?: string | null;
  containerName?: string | null;
  deploymentState: CloudWorldDeploymentState;
  providerMessage?: string | null;
  rawStatus?: string | null;
  observedAt: string;
}

export type CloudWorldAttentionSeverity = "info" | "warning" | "critical";

export type CloudWorldAttentionReason =
  | "failed_world"
  | "provider_error"
  | "deployment_drift"
  | "sleep_drift"
  | "heartbeat_stale"
  | "recovery_queued";

export type CloudWorldAttentionEscalationReason =
  | "world_failed"
  | "provider_error"
  | "retry_threshold"
  | "heartbeat_duration";

export interface CloudWorldAttentionItem {
  worldId: string;
  worldName: string;
  phone: string;
  severity: CloudWorldAttentionSeverity;
  reason: CloudWorldAttentionReason;
  escalated: boolean;
  escalationReason?: CloudWorldAttentionEscalationReason | null;
  worldStatus: CloudWorldLifecycleStatus;
  desiredState?: "running" | "sleeping";
  providerKey?: string | null;
  observedDeploymentState?: CloudWorldDeploymentState;
  activeJobType?: WorldLifecycleJobType | null;
  retryCount: number;
  staleHeartbeatSeconds?: number | null;
  message: string;
  lastHeartbeatAt?: string | null;
  updatedAt: string;
}

export interface CloudWorldAlertThresholds {
  retryCount: number;
  criticalHeartbeatStaleSeconds: number;
}

export interface CloudWorldAlertSummary {
  generatedAt: string;
  thresholds: CloudWorldAlertThresholds;
  item: CloudWorldAttentionItem | null;
}

export interface CloudWorldDriftSummary {
  generatedAt: string;
  totalWorlds: number;
  readyWorlds: number;
  sleepingWorlds: number;
  failedWorlds: number;
  attentionWorlds: number;
  criticalAttentionWorlds: number;
  warningAttentionWorlds: number;
  escalatedWorlds: number;
  heartbeatStaleWorlds: number;
  providerDriftWorlds: number;
  recoveryQueuedWorlds: number;
  attentionItems: CloudWorldAttentionItem[];
}

export interface WorldLifecycleJobSummary {
  id: string;
  worldId: string;
  jobType: WorldLifecycleJobType;
  status: WorldLifecycleJobStatus;
  attempt: number;
  maxAttempts: number;
  availableAt?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  leaseRemainingSeconds?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  payload?: Record<string, unknown> | null;
  resultPayload?: Record<string, unknown> | null;
  supersededByJobType?: WorldLifecycleJobType | null;
  supersededByPayload?: Record<string, unknown> | null;
}

export interface WorldAccessSessionSummary {
  id: string;
  worldId: string | null;
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
