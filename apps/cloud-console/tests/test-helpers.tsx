import type {
  CloudWorldLifecycleJobAggregateSummary,
  CloudWorldLifecycleJobListResponse,
  WorldLifecycleJobSummary,
} from "@yinjie/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { matchesQueueStateFilter } from "../src/lib/job-queue-state";
import {
  getJobAuditBadgeLabel,
  getJobSupersededByJobType,
} from "../src/lib/job-result";
import { createAppRouter } from "../src/router";
import type { WorldLifecycleAction } from "../src/lib/world-lifecycle-actions";

const ADMIN_SECRET_KEY = "yinjie_cloud_admin_secret";
const ADMIN_ACCESS_TOKEN_KEY = "yinjie_cloud_admin_access_token";
const ADMIN_ACCESS_TOKEN_EXPIRES_AT_KEY =
  "yinjie_cloud_admin_access_token_expires_at";
const ADMIN_REFRESH_TOKEN_KEY = "yinjie_cloud_admin_refresh_token";
const ADMIN_REFRESH_TOKEN_EXPIRES_AT_KEY =
  "yinjie_cloud_admin_refresh_token_expires_at";
const TEST_SECRET = "test-secret";
const TEST_ADMIN_ACCESS_TOKEN = "test-admin-access-token";
const TEST_ADMIN_ACCESS_TOKEN_EXPIRES_AT = "2026-04-20T01:00:00.000Z";
const TEST_ADMIN_REFRESH_TOKEN = "test-admin-refresh-token";
const TEST_ADMIN_REFRESH_TOKEN_EXPIRES_AT = "2026-04-27T01:00:00.000Z";

export const mockRequest = {
  id: "request-1",
  phone: "+8613800138000",
  worldName: "Mock Request World",
  status: "pending" as const,
  displayStatus: "世界申请审核中。",
  failureReason: "Needs manual review.",
  projectedWorldStatus: "queued" as const,
  projectedDesiredState: "running" as const,
  apiBaseUrl: "https://world-api.mock.example.com",
  adminUrl: "https://world-admin.mock.example.com",
  note: "Needs manual review.",
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:05:00.000Z",
};

export const mockWorld = {
  id: "world-1",
  phone: "+8613800138000",
  name: "Mock World",
  status: "ready" as const,
  desiredState: "running" as const,
  apiBaseUrl: "https://world-api.mock.example.com",
  adminUrl: "https://world-admin.mock.example.com",
  healthStatus: "healthy",
  healthMessage: "World is healthy.",
  provisionStrategy: "manual-docker",
  providerKey: "manual-docker",
  providerRegion: "cn-east-1",
  providerZone: "cn-east-1a",
  failureCode: null,
  failureMessage: null,
  lastAccessedAt: "2026-04-20T00:03:00.000Z",
  lastInteractiveAt: "2026-04-20T00:04:00.000Z",
  lastBootedAt: "2026-04-20T00:02:00.000Z",
  lastHeartbeatAt: "2026-04-20T00:05:00.000Z",
  lastSuspendedAt: null,
  note: "Healthy world.",
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:05:00.000Z",
};

export const mockJob = {
  id: "job-1",
  worldId: "world-1",
  jobType: "resume" as const,
  status: "succeeded" as const,
  attempt: 1,
  maxAttempts: 3,
  failureCode: null,
  failureMessage: null,
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:05:00.000Z",
  startedAt: "2026-04-20T00:01:00.000Z",
  finishedAt: "2026-04-20T00:02:00.000Z",
  payload: { source: "test" },
  resultPayload: { action: "resumed" },
  supersededByJobType: null,
  supersededByPayload: null,
};

export const mockInstance = {
  id: "instance-1",
  worldId: "world-1",
  providerKey: "manual-docker",
  providerInstanceId: "provider-instance-1",
  providerVolumeId: "provider-volume-1",
  providerSnapshotId: "provider-snapshot-1",
  name: "Mock Instance",
  region: "cn-east-1",
  zone: "cn-east-1a",
  privateIp: "10.0.0.10",
  publicIp: "203.0.113.10",
  powerState: "running" as const,
  imageId: "image-1",
  flavor: "small",
  diskSizeGb: 40,
  launchConfig: { APP_ENV: "production" },
  bootstrappedAt: "2026-04-20T00:02:00.000Z",
  lastHeartbeatAt: "2026-04-20T00:05:00.000Z",
  lastOperationAt: "2026-04-20T00:05:00.000Z",
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:05:00.000Z",
};

export const mockBootstrapConfig = {
  worldId: "world-1",
  worldName: "Mock World",
  phone: "+8613800138000",
  slug: "mock-world",
  providerKey: "manual-docker",
  providerLabel: "Manual Docker",
  deploymentMode: "remote-docker",
  executorMode: "ssh",
  cloudPlatformBaseUrl: "https://cloud.mock.example.com",
  suggestedApiBaseUrl: "https://world-api.mock.example.com",
  suggestedAdminUrl: "https://world-admin.mock.example.com",
  image: "yinjie/world:latest",
  containerName: "mock-world-container",
  volumeName: "mock-world-volume",
  projectName: "mock-world-project",
  remoteDeployPath: "/srv/mock-world",
  callbackToken: "callback-token-1",
  callbackEndpoints: {
    bootstrap:
      "https://cloud.mock.example.com/internal/worlds/world-1/bootstrap",
    heartbeat:
      "https://cloud.mock.example.com/internal/worlds/world-1/heartbeat",
    activity: "https://cloud.mock.example.com/internal/worlds/world-1/activity",
    health: "https://cloud.mock.example.com/internal/worlds/world-1/health",
    fail: "https://cloud.mock.example.com/internal/worlds/world-1/fail",
  },
  env: {
    WORLD_ID: "world-1",
  },
  envFileContent: "WORLD_ID=world-1",
  dockerComposeSnippet: "services:\n  app:\n    image: yinjie/world:latest",
  notes: ["Redeploy after rotating callback credentials."],
};

export const mockRuntimeStatus = {
  worldId: "world-1",
  providerKey: "manual-docker",
  deploymentMode: "remote-docker",
  executorMode: "ssh",
  remoteHost: "mock-host",
  remoteDeployPath: "/srv/mock-world",
  projectName: "mock-world-project",
  containerName: "mock-world-container",
  deploymentState: "running" as const,
  providerMessage: "Runtime healthy.",
  rawStatus: "running",
  observedAt: "2026-04-20T00:05:00.000Z",
};

export const mockAlertSummary = {
  generatedAt: "2026-04-20T00:05:00.000Z",
  thresholds: {
    retryCount: 3,
    criticalHeartbeatStaleSeconds: 600,
  },
  item: null,
};

export const mockAttentionItem = {
  worldId: "world-1",
  worldName: "Mock World",
  phone: "+8613800138000",
  severity: "critical" as const,
  reason: "recovery_queued" as const,
  escalated: false,
  escalationReason: null,
  worldStatus: "ready" as const,
  desiredState: "running" as const,
  providerKey: "manual-docker",
  observedDeploymentState: "running" as const,
  activeJobType: "resume" as const,
  retryCount: 1,
  staleHeartbeatSeconds: null,
  message: "Recovery job queued for this world.",
  lastHeartbeatAt: "2026-04-20T00:05:00.000Z",
  updatedAt: "2026-04-20T00:05:00.000Z",
};

export const mockDriftSummary = {
  generatedAt: "2026-04-20T00:05:00.000Z",
  totalWorlds: 1,
  readyWorlds: 1,
  sleepingWorlds: 0,
  failedWorlds: 0,
  attentionWorlds: 1,
  criticalAttentionWorlds: 1,
  warningAttentionWorlds: 0,
  escalatedWorlds: 0,
  heartbeatStaleWorlds: 0,
  providerDriftWorlds: 0,
  recoveryQueuedWorlds: 1,
  attentionItems: [mockAttentionItem],
};

export const mockProviders = [
  {
    key: "manual-docker",
    label: "Manual Docker",
    description: "Mocked provider catalog entry.",
    provisionStrategy: "manual-docker",
    deploymentMode: "remote-docker",
    defaultRegion: "cn-east-1",
    defaultZone: "cn-east-1a",
    capabilities: {
      managedProvisioning: false,
      managedLifecycle: true,
      bootstrapPackage: true,
      snapshots: true,
    },
  },
];

export const mockAdminSessions = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    status: "active" as const,
    isCurrent: true,
    expiresAt: "2026-04-27T01:30:00.000Z",
    issuedFromIp: "198.51.100.10",
    issuedUserAgent: "Cloud Console/1.0",
    lastUsedAt: "2026-04-20T00:35:00.000Z",
    lastUsedIp: "198.51.100.12",
    lastUsedUserAgent: "Cloud Console/1.1",
    lastRefreshedAt: "2026-04-20T00:30:00.000Z",
    revokedAt: null,
    revokedBySessionId: null,
    revocationReason: null,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:35:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    status: "active" as const,
    isCurrent: false,
    expiresAt: "2026-04-26T06:00:00.000Z",
    issuedFromIp: "203.0.113.24",
    issuedUserAgent: "Mobile Safari",
    lastUsedAt: "2026-04-19T18:00:00.000Z",
    lastUsedIp: "203.0.113.25",
    lastUsedUserAgent: "Mobile Safari",
    lastRefreshedAt: "2026-04-19T17:40:00.000Z",
    revokedAt: null,
    revokedBySessionId: null,
    revocationReason: null,
    createdAt: "2026-04-19T17:00:00.000Z",
    updatedAt: "2026-04-19T18:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    status: "revoked" as const,
    isCurrent: false,
    expiresAt: "2026-04-24T09:00:00.000Z",
    issuedFromIp: "192.0.2.42",
    issuedUserAgent: "CLI Script",
    lastUsedAt: "2026-04-18T09:05:00.000Z",
    lastUsedIp: "192.0.2.42",
    lastUsedUserAgent: "CLI Script",
    lastRefreshedAt: null,
    revokedAt: "2026-04-18T09:06:00.000Z",
    revokedBySessionId: "11111111-1111-4111-8111-111111111111",
    revocationReason: "manual-revocation" as const,
    createdAt: "2026-04-18T09:00:00.000Z",
    updatedAt: "2026-04-18T09:06:00.000Z",
  },
];

export const mockWaitingSessionSyncTasks = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    taskKey: "refresh-world:world-1",
    taskType: "refresh_world" as const,
    targetValue: "world-1",
    context: "runtime.heartbeat",
    status: "failed" as const,
    attempt: 3,
    maxAttempts: 3,
    availableAt: "2026-04-20T00:15:00.000Z",
    leaseOwner: null,
    leaseExpiresAt: null,
    leaseRemainingSeconds: null,
    lastError: "heartbeat callback failed",
    finishedAt: "2026-04-20T00:16:00.000Z",
    createdAt: "2026-04-20T00:10:00.000Z",
    updatedAt: "2026-04-20T00:16:00.000Z",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    taskKey: "refresh-phone:+8613800138001",
    taskType: "refresh_phone" as const,
    targetValue: "+8613800138001",
    context: "cloud.updateRequest",
    status: "pending" as const,
    attempt: 1,
    maxAttempts: 3,
    availableAt: "2026-04-20T00:20:00.000Z",
    leaseOwner: null,
    leaseExpiresAt: null,
    leaseRemainingSeconds: null,
    lastError: "temporary phone refresh failure",
    finishedAt: null,
    createdAt: "2026-04-20T00:12:00.000Z",
    updatedAt: "2026-04-20T00:18:00.000Z",
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    taskKey: "invalidate-phone:+8613800138002",
    taskType: "invalidate_phone" as const,
    targetValue: "+8613800138002",
    context: "cloud.updateWorld",
    status: "running" as const,
    attempt: 2,
    maxAttempts: 3,
    availableAt: "2026-04-20T00:11:00.000Z",
    leaseOwner: "worker-1",
    leaseExpiresAt: "2026-04-20T00:19:00.000Z",
    leaseRemainingSeconds: 45,
    lastError: "invalidating old waiting sessions",
    finishedAt: null,
    createdAt: "2026-04-20T00:11:00.000Z",
    updatedAt: "2026-04-20T00:17:00.000Z",
  },
];

let mockResponseRequestIdCounter = 0;

function createMockResponseHeaders() {
  return new Headers({
    "X-Request-Id": `mock-request-${++mockResponseRequestIdCounter}`,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: createMockResponseHeaders(),
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: createMockResponseHeaders(),
    text: async () => body,
  } as Response;
}

export type CloudAdminRequestLog = {
  url: string;
  pathWithSearch: string;
  method: string;
  body?: Record<string, unknown>;
};

type RenderRouteOptions = {
  adminSecret?: string;
  adminAccessToken?: string;
  adminAccessTokenExpiresAt?: string;
  adminRefreshToken?: string;
  adminRefreshTokenExpiresAt?: string;
};

type CloudAdminMockOverrides = {
  request?: Partial<typeof mockRequest>;
  requests?: Array<Partial<typeof mockRequest>>;
  world?: Partial<typeof mockWorld>;
  job?: Partial<typeof mockJob>;
  jobs?: Array<Partial<typeof mockJob>>;
  jobSummary?: Partial<CloudWorldLifecycleJobAggregateSummary>;
  instance?: Partial<typeof mockInstance>;
  attentionItem?: Partial<typeof mockAttentionItem>;
  driftSummary?: Partial<typeof mockDriftSummary>;
  actionErrors?: Partial<Record<WorldLifecycleAction, string>>;
  updateRequestError?: string;
  updateWorldError?: string;
  rotateCallbackTokenError?: string;
  adminSessions?: typeof mockAdminSessions;
  waitingSessionSyncTasks?: typeof mockWaitingSessionSyncTasks;
  revokeAdminSessionError?: string;
  bulkRevokeAdminSessionsError?: string;
  filteredRevokeAdminSessionsError?: string;
  revokeAdminSessionSourceGroupError?: string;
  createAdminSessionSourceGroupSnapshotError?: string;
  createAdminSessionSourceGroupRiskSnapshotError?: string;
  replayFailedWaitingSessionSyncTasksError?: string;
  clearFailedWaitingSessionSyncTasksError?: string;
  replayFilteredFailedWaitingSessionSyncTasksError?: string;
  clearFilteredFailedWaitingSessionSyncTasksError?: string;
  bulkRevokeUnavailableSessionIds?: string[];
};

type MockAdminSession = (typeof mockAdminSessions)[number];
type MockWaitingSessionSyncTask = (typeof mockWaitingSessionSyncTasks)[number];
type MockAdminSessionSourceGroup = {
  sourceKey: string;
  issuedFromIp?: string | null;
  issuedUserAgent?: string | null;
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  revokedSessions: number;
  refreshTokenReuseRevocations: number;
  currentSessions: number;
  riskLevel: "normal" | "watch" | "critical";
  riskSignals: Array<
    | "multiple-active-sessions"
    | "repeated-revocations"
    | "refresh-token-reuse"
  >;
  latestCreatedAt?: string | null;
  latestLastUsedAt?: string | null;
  latestRevokedAt?: string | null;
};

type MockAdminSessionSourceGroupSnapshot = {
  generatedAt: string;
  filters: {
    status?: string;
    revocationReason?: string;
    currentOnly?: boolean;
    query?: string;
    sourceKey?: string;
  };
  group: MockAdminSessionSourceGroup;
  sessions: MockAdminSession[];
};

type MockAdminSessionSourceGroupRiskSnapshot = {
  generatedAt: string;
  filters: {
    status?: string;
    revocationReason?: string;
    currentOnly?: boolean;
    query?: string;
    sourceKey?: string;
    riskLevel?: "normal" | "watch" | "critical";
  };
  totalGroups: number;
  totalSessions: number;
  groups: MockAdminSessionSourceGroup[];
  sessions: MockAdminSession[];
};

function normalizePositiveInteger(value: string | null, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function parseSortableTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareOptionalTimestamps(
  left?: string | null,
  right?: string | null,
  direction: "asc" | "desc" = "desc",
) {
  const leftValue = parseSortableTimestamp(left);
  const rightValue = parseSortableTimestamp(right);

  if (leftValue === null && rightValue === null) {
    return 0;
  }
  if (leftValue === null) {
    return 1;
  }
  if (rightValue === null) {
    return -1;
  }
  if (leftValue === rightValue) {
    return 0;
  }

  return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
}

function compareAdminSessions(
  left: MockAdminSession,
  right: MockAdminSession,
  sortBy: string,
  sortDirection: "asc" | "desc",
) {
  const primaryResult = compareOptionalTimestamps(
    left[sortBy as keyof MockAdminSession] as string | null | undefined,
    right[sortBy as keyof MockAdminSession] as string | null | undefined,
    sortDirection,
  );
  if (primaryResult !== 0) {
    return primaryResult;
  }

  const updatedResult = compareOptionalTimestamps(
    left.updatedAt,
    right.updatedAt,
    "desc",
  );
  if (updatedResult !== 0) {
    return updatedResult;
  }

  const createdResult = compareOptionalTimestamps(
    left.createdAt,
    right.createdAt,
    "desc",
  );
  if (createdResult !== 0) {
    return createdResult;
  }

  return left.id.localeCompare(right.id);
}

function applyMockSourceGroupRisk(group: MockAdminSessionSourceGroup) {
  const riskSignals: MockAdminSessionSourceGroup["riskSignals"] = [];
  if (group.activeSessions >= 2) {
    riskSignals.push("multiple-active-sessions");
  }
  if (group.revokedSessions >= 2) {
    riskSignals.push("repeated-revocations");
  }
  if (group.refreshTokenReuseRevocations > 0) {
    riskSignals.push("refresh-token-reuse");
  }

  group.riskSignals = riskSignals;
  group.riskLevel =
    group.refreshTokenReuseRevocations > 0 || group.activeSessions >= 4
      ? "critical"
      : riskSignals.length > 0
        ? "watch"
        : "normal";
}

function matchesMockSourceGroupRisk(
  group: MockAdminSessionSourceGroup,
  riskLevel: string | null,
) {
  if (!riskLevel) {
    return true;
  }

  return group.riskLevel === riskLevel;
}

function revokeMockAdminSession(
  session: MockAdminSession,
  revokedBySessionId = "11111111-1111-4111-8111-111111111111",
  revokedAt = "2026-04-20T00:40:00.000Z",
) {
  session.status = "revoked";
  session.revokedAt = revokedAt;
  session.revokedBySessionId = revokedBySessionId;
  session.revocationReason = "manual-revocation";
  session.updatedAt = revokedAt;
}

function createAdminSessionSourceKey(
  issuedFromIp?: string | null,
  issuedUserAgent?: string | null,
) {
  return Buffer.from(
    JSON.stringify([issuedFromIp ?? null, issuedUserAgent ?? null]),
    "utf8",
  ).toString("base64url");
}

function filterAdminSessions(
  sessions: typeof mockAdminSessions,
  searchParams: URLSearchParams,
) {
  const status = searchParams.get("status");
  const revocationReason = searchParams.get("revocationReason");
  const currentOnly = searchParams.get("currentOnly") === "true";
  const query = searchParams.get("query")?.trim().toLowerCase() ?? "";
  const sourceKey = searchParams.get("sourceKey")?.trim() ?? "";
  const sortBy = searchParams.get("sortBy") ?? "updatedAt";
  const sortDirection =
    searchParams.get("sortDirection") === "asc" ? "asc" : "desc";

  const filteredSessions = sessions.filter((session) => {
    if (status && session.status !== status) {
      return false;
    }
    if (
      revocationReason &&
      (session.revocationReason ?? null) !== revocationReason
    ) {
      return false;
    }
    if (currentOnly && !session.isCurrent) {
      return false;
    }
    if (
      sourceKey &&
      createAdminSessionSourceKey(
        session.issuedFromIp,
        session.issuedUserAgent,
      ) !== sourceKey
    ) {
      return false;
    }
    if (!query) {
      return true;
    }

    const haystack = [
      session.id,
      session.issuedFromIp,
      session.issuedUserAgent,
      session.lastUsedIp,
      session.lastUsedUserAgent,
      session.revokedBySessionId,
      session.revocationReason,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  const sortedSessions = [...filteredSessions].sort((left, right) =>
    compareAdminSessions(left, right, sortBy, sortDirection),
  );

  return {
    items: sortedSessions,
    total: sortedSessions.length,
  };
}

function paginateAdminSessions(
  filteredSessions: ReturnType<typeof filterAdminSessions>,
  page: number,
  pageSize: number,
) {
  const start = (page - 1) * pageSize;
  const items = filteredSessions.items.slice(start, start + pageSize);
  return {
    items,
    total: filteredSessions.total,
    page,
    pageSize,
    totalPages:
      filteredSessions.total === 0
        ? 1
        : Math.ceil(filteredSessions.total / pageSize),
  };
}

function listAdminSessions(
  sessions: typeof mockAdminSessions,
  searchParams: URLSearchParams,
) {
  const page = normalizePositiveInteger(searchParams.get("page"), 1);
  const pageSize = normalizePositiveInteger(searchParams.get("pageSize"), 10);
  const filteredSessions = filterAdminSessions(sessions, searchParams);

  return paginateAdminSessions(filteredSessions, page, pageSize);
}

function filterWaitingSessionSyncTasks(
  tasks: typeof mockWaitingSessionSyncTasks,
  searchParams: URLSearchParams,
) {
  const status = searchParams.get("status");
  const taskType = searchParams.get("taskType");
  const query = searchParams.get("query")?.trim().toLowerCase() ?? "";

  const filteredTasks = tasks.filter((task) => {
    if (status && task.status !== status) {
      return false;
    }
    if (taskType && task.taskType !== taskType) {
      return false;
    }
    if (!query) {
      return true;
    }

    const haystack = [
      task.id,
      task.taskKey,
      task.taskType,
      task.targetValue,
      task.context,
      task.status,
      task.lastError,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  const sortedTasks = [...filteredTasks].sort((left, right) => {
    const updatedResult = compareOptionalTimestamps(
      left.updatedAt,
      right.updatedAt,
    );
    if (updatedResult !== 0) {
      return updatedResult;
    }

    const createdResult = compareOptionalTimestamps(
      left.createdAt,
      right.createdAt,
    );
    if (createdResult !== 0) {
      return createdResult;
    }

    return left.id.localeCompare(right.id);
  });

  return {
    items: sortedTasks,
    total: sortedTasks.length,
  };
}

function listWaitingSessionSyncTasks(
  tasks: typeof mockWaitingSessionSyncTasks,
  searchParams: URLSearchParams,
) {
  const page = normalizePositiveInteger(searchParams.get("page"), 1);
  const pageSize = normalizePositiveInteger(searchParams.get("pageSize"), 20);
  const filteredTasks = filterWaitingSessionSyncTasks(tasks, searchParams);
  const start = (page - 1) * pageSize;
  const items = filteredTasks.items.slice(start, start + pageSize);

  return {
    items,
    total: filteredTasks.total,
    page,
    pageSize,
    totalPages:
      filteredTasks.total === 0
        ? 1
        : Math.ceil(filteredTasks.total / pageSize),
  };
}

function buildWaitingSessionSyncFilterSearchParams(body?: Record<string, unknown>) {
  const searchParams = new URLSearchParams();
  if (typeof body?.taskType === "string") {
    searchParams.set("taskType", body.taskType);
  }
  if (typeof body?.query === "string") {
    searchParams.set("query", body.query);
  }

  return searchParams;
}

function replayMockWaitingSessionSyncTask(task: MockWaitingSessionSyncTask) {
  task.status = "pending";
  task.attempt = 0;
  task.leaseOwner = null;
  task.leaseExpiresAt = null;
  task.leaseRemainingSeconds = null;
  task.finishedAt = null;
  task.updatedAt = "2026-04-20T02:10:00.000Z";
}

function listAdminSessionSourceGroups(
  sessions: typeof mockAdminSessions,
  searchParams: URLSearchParams,
) {
  const page = normalizePositiveInteger(searchParams.get("page"), 1);
  const pageSize = normalizePositiveInteger(searchParams.get("pageSize"), 6);
  const sortBy = searchParams.get("sortBy") ?? "activeSessions";
  const sortDirection =
    searchParams.get("sortDirection") === "asc" ? "asc" : "desc";
  const groups = new Map<string, MockAdminSessionSourceGroup>();
  const filteredSessionSearchParams = pickAdminSessionFilterSearchParams(searchParams);

  for (const session of filterAdminSessions(sessions, filteredSessionSearchParams).items) {
    const sourceKey = createAdminSessionSourceKey(
      session.issuedFromIp,
      session.issuedUserAgent,
    );
    const existingGroup = groups.get(sourceKey);
    if (!existingGroup) {
      groups.set(sourceKey, {
        sourceKey,
        issuedFromIp: session.issuedFromIp,
        issuedUserAgent: session.issuedUserAgent,
        totalSessions: 1,
        activeSessions: session.status === "active" ? 1 : 0,
        expiredSessions: session.status === "expired" ? 1 : 0,
        revokedSessions: session.status === "revoked" ? 1 : 0,
        refreshTokenReuseRevocations:
          session.revocationReason === "refresh-token-reuse" ? 1 : 0,
        currentSessions: session.isCurrent ? 1 : 0,
        riskLevel: "normal",
        riskSignals: [],
        latestCreatedAt: session.createdAt,
        latestLastUsedAt: session.lastUsedAt,
        latestRevokedAt: session.revokedAt,
      });
      continue;
    }

    existingGroup.totalSessions += 1;
    if (session.status === "active") {
      existingGroup.activeSessions += 1;
    } else if (session.status === "expired") {
      existingGroup.expiredSessions += 1;
    } else {
      existingGroup.revokedSessions += 1;
    }
    if (session.revocationReason === "refresh-token-reuse") {
      existingGroup.refreshTokenReuseRevocations += 1;
    }
    if (session.isCurrent) {
      existingGroup.currentSessions += 1;
    }
    if (
      compareOptionalTimestamps(session.createdAt, existingGroup.latestCreatedAt) < 0
    ) {
      existingGroup.latestCreatedAt = session.createdAt;
    }
    if (
      compareOptionalTimestamps(session.lastUsedAt, existingGroup.latestLastUsedAt) < 0
    ) {
      existingGroup.latestLastUsedAt = session.lastUsedAt;
    }
    if (
      compareOptionalTimestamps(session.revokedAt, existingGroup.latestRevokedAt) < 0
    ) {
      existingGroup.latestRevokedAt = session.revokedAt;
    }
  }

  groups.forEach((group) => {
    applyMockSourceGroupRisk(group);
  });

  const filteredGroups = [...groups.values()].filter((group) =>
    matchesMockSourceGroupRisk(group, searchParams.get("riskLevel")),
  );
  const sortedGroups = filteredGroups.sort((left, right) => {
    let primaryResult = 0;

    switch (sortBy) {
      case "totalSessions":
        primaryResult =
          sortDirection === "asc"
            ? left.totalSessions - right.totalSessions
            : right.totalSessions - left.totalSessions;
        break;
      case "latestCreatedAt":
        primaryResult =
          sortDirection === "asc"
            ? compareOptionalTimestamps(right.latestCreatedAt, left.latestCreatedAt)
            : compareOptionalTimestamps(left.latestCreatedAt, right.latestCreatedAt);
        break;
      case "latestLastUsedAt":
        primaryResult =
          sortDirection === "asc"
            ? compareOptionalTimestamps(right.latestLastUsedAt, left.latestLastUsedAt)
            : compareOptionalTimestamps(left.latestLastUsedAt, right.latestLastUsedAt);
        break;
      case "latestRevokedAt":
        primaryResult =
          sortDirection === "asc"
            ? compareOptionalTimestamps(right.latestRevokedAt, left.latestRevokedAt)
            : compareOptionalTimestamps(left.latestRevokedAt, right.latestRevokedAt);
        break;
      case "activeSessions":
      default:
        primaryResult =
          sortDirection === "asc"
            ? left.activeSessions - right.activeSessions
            : right.activeSessions - left.activeSessions;
        break;
    }
    if (primaryResult !== 0) {
      return primaryResult;
    }
    if (left.activeSessions !== right.activeSessions) {
      return right.activeSessions - left.activeSessions;
    }
    if (left.totalSessions !== right.totalSessions) {
      return right.totalSessions - left.totalSessions;
    }

    const lastUsedResult = compareOptionalTimestamps(
      left.latestLastUsedAt,
      right.latestLastUsedAt,
    );
    if (lastUsedResult !== 0) {
      return lastUsedResult;
    }

    const createdResult = compareOptionalTimestamps(
      left.latestCreatedAt,
      right.latestCreatedAt,
    );
    if (createdResult !== 0) {
      return createdResult;
    }

    return left.sourceKey.localeCompare(right.sourceKey);
  });
  const start = (page - 1) * pageSize;
  const items = sortedGroups.slice(start, start + pageSize);

  return {
    items,
    total: sortedGroups.length,
    page,
    pageSize,
    totalPages: sortedGroups.length === 0 ? 1 : Math.ceil(sortedGroups.length / pageSize),
  };
}

function createAdminSessionSourceGroupSnapshot(
  sessions: typeof mockAdminSessions,
  body?: Record<string, unknown>,
): MockAdminSessionSourceGroupSnapshot {
  const searchParams = buildAdminSessionFilterSearchParams(body);
  const filteredSessions = filterAdminSessions(sessions, searchParams).items;
  const sourceKey = searchParams.get("sourceKey") ?? "";
  const snapshotGroup = filteredSessions.reduce<MockAdminSessionSourceGroup>(
    (group, session) => {
      group.totalSessions += 1;
      if (session.status === "active") {
        group.activeSessions += 1;
      } else if (session.status === "expired") {
        group.expiredSessions += 1;
      } else {
        group.revokedSessions += 1;
      }
      if (session.revocationReason === "refresh-token-reuse") {
        group.refreshTokenReuseRevocations += 1;
      }
      if (session.isCurrent) {
        group.currentSessions += 1;
      }
      if (
        compareOptionalTimestamps(session.createdAt, group.latestCreatedAt) < 0
      ) {
        group.latestCreatedAt = session.createdAt;
      }
      if (
        compareOptionalTimestamps(session.lastUsedAt, group.latestLastUsedAt) < 0
      ) {
        group.latestLastUsedAt = session.lastUsedAt;
      }
      if (
        compareOptionalTimestamps(session.revokedAt, group.latestRevokedAt) < 0
      ) {
        group.latestRevokedAt = session.revokedAt;
      }
      return group;
    },
    {
      sourceKey,
      issuedFromIp: filteredSessions[0]?.issuedFromIp ?? null,
      issuedUserAgent: filteredSessions[0]?.issuedUserAgent ?? null,
      totalSessions: 0,
      activeSessions: 0,
      expiredSessions: 0,
      revokedSessions: 0,
      refreshTokenReuseRevocations: 0,
      currentSessions: 0,
      riskLevel: "normal",
      riskSignals: [],
      latestCreatedAt: null as string | null,
      latestLastUsedAt: null,
      latestRevokedAt: null,
    },
  );

  applyMockSourceGroupRisk(snapshotGroup);

  return {
    generatedAt: "2026-04-20T02:00:00.000Z",
    filters: {
      status: typeof body?.status === "string" ? body.status : undefined,
      revocationReason:
        typeof body?.revocationReason === "string"
          ? body.revocationReason
          : undefined,
      currentOnly:
        typeof body?.currentOnly === "boolean" ? body.currentOnly : undefined,
      query: typeof body?.query === "string" ? body.query : undefined,
      sourceKey: typeof body?.sourceKey === "string" ? body.sourceKey : undefined,
    },
    group: snapshotGroup,
    sessions: filteredSessions,
  };
}

function createAdminSessionSourceGroupRiskSnapshot(
  sessions: typeof mockAdminSessions,
  body?: Record<string, unknown>,
): MockAdminSessionSourceGroupRiskSnapshot {
  const searchParams = buildAdminSessionFilterSearchParams(body);
  searchParams.set("page", "1");
  searchParams.set("pageSize", String(Math.max(sessions.length, 1)));
  const groups = listAdminSessionSourceGroups(sessions, searchParams).items;
  const matchingSourceKeys = new Set(groups.map((group) => group.sourceKey));
  const filteredSessions = filterAdminSessions(sessions, searchParams).items.filter(
    (session) =>
      matchingSourceKeys.has(
        createAdminSessionSourceKey(
          session.issuedFromIp,
          session.issuedUserAgent,
        ),
      ),
  );

  return {
    generatedAt: "2026-04-20T02:05:00.000Z",
    filters: {
      status: typeof body?.status === "string" ? body.status : undefined,
      revocationReason:
        typeof body?.revocationReason === "string"
          ? body.revocationReason
          : undefined,
      currentOnly:
        typeof body?.currentOnly === "boolean" ? body.currentOnly : undefined,
      query: typeof body?.query === "string" ? body.query : undefined,
      sourceKey: typeof body?.sourceKey === "string" ? body.sourceKey : undefined,
      riskLevel:
        body?.riskLevel === "normal" ||
        body?.riskLevel === "watch" ||
        body?.riskLevel === "critical"
          ? body.riskLevel
          : undefined,
    },
    totalGroups: groups.length,
    totalSessions: filteredSessions.length,
    groups,
    sessions: filteredSessions,
  };
}

function buildAdminSessionFilterSearchParams(body?: Record<string, unknown>) {
  const searchParams = new URLSearchParams();
  if (typeof body?.status === "string") {
    searchParams.set("status", body.status);
  }
  if (typeof body?.revocationReason === "string") {
    searchParams.set("revocationReason", body.revocationReason);
  }
  if (typeof body?.currentOnly === "boolean") {
    searchParams.set("currentOnly", String(body.currentOnly));
  }
  if (typeof body?.query === "string") {
    searchParams.set("query", body.query);
  }
  if (typeof body?.sourceKey === "string") {
    searchParams.set("sourceKey", body.sourceKey);
  }
  if (typeof body?.riskLevel === "string") {
    searchParams.set("riskLevel", body.riskLevel);
  }

  return searchParams;
}

function pickAdminSessionFilterSearchParams(searchParams: URLSearchParams) {
  const nextSearchParams = new URLSearchParams();
  for (const key of [
    "status",
    "revocationReason",
    "currentOnly",
    "query",
    "sourceKey",
  ]) {
    const value = searchParams.get(key);
    if (value) {
      nextSearchParams.set(key, value);
    }
  }

  return nextSearchParams;
}

function selectLifecycleJobs(
  jobs: WorldLifecycleJobSummary[],
  world: typeof mockWorld,
  searchParams: URLSearchParams,
): WorldLifecycleJobSummary[] {
  const status = searchParams.get("status");
  const jobType = searchParams.get("jobType");
  const worldId = searchParams.get("worldId");
  const provider = searchParams.get("provider");
  const queueState = searchParams.get("queueState");
  const audit = searchParams.get("audit");
  const supersededBy = searchParams.get("supersededBy");
  const query = searchParams.get("query")?.trim().toLowerCase() ?? "";
  const sortBy = searchParams.get("sortBy") ?? "updatedAt";
  const sortDirection =
    searchParams.get("sortDirection") === "asc" ? "asc" : "desc";
  const providerKey = world.providerKey?.trim() ?? "";
  const providerLabel =
    mockProviders.find((item) => item.key === providerKey)?.label ?? providerKey;

  const filteredJobs = jobs.filter((job) => {
    if (worldId && job.worldId !== worldId) {
      return false;
    }
    if (status && job.status !== status) {
      return false;
    }
    if (jobType && job.jobType !== jobType) {
      return false;
    }
    if (provider) {
      if (provider === "__unassigned__") {
        if (providerKey) {
          return false;
        }
      } else if (providerKey !== provider) {
        return false;
      }
    }
    if (
      queueState &&
      !matchesQueueStateFilter(
        job,
        queueState as "running_now" | "lease_expired" | "delayed",
      )
    ) {
      return false;
    }

    const auditBadgeLabel = getJobAuditBadgeLabel(job);
    if (audit === "superseded" && !auditBadgeLabel) {
      return false;
    }

    const supersededByJobType = getJobSupersededByJobType(job);
    if (supersededBy && supersededByJobType !== supersededBy) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      job.id,
      job.worldId,
      job.jobType,
      job.status,
      job.leaseOwner,
      job.failureCode,
      job.failureMessage,
      job.supersededByJobType,
      supersededByJobType,
      auditBadgeLabel,
      world.name,
      world.phone,
      providerLabel,
      providerKey,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  const sortedJobs = [...filteredJobs].sort((left, right) => {
    const sortKey = sortBy as
      | "updatedAt"
      | "createdAt"
      | "availableAt"
      | "startedAt"
      | "finishedAt";
    const leftValue = left[sortKey] ?? null;
    const rightValue = right[sortKey] ?? null;

    if (leftValue == null && rightValue == null) {
      return right.updatedAt.localeCompare(left.updatedAt);
    }
    if (leftValue == null) {
      return 1;
    }
    if (rightValue == null) {
      return -1;
    }

    const compared =
      sortDirection === "asc"
        ? leftValue.localeCompare(rightValue)
        : rightValue.localeCompare(leftValue);
    if (compared !== 0) {
      return compared;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });

  return sortedJobs;
}

function filterLifecycleJobs(
  jobs: WorldLifecycleJobSummary[],
  world: typeof mockWorld,
  searchParams: URLSearchParams,
): CloudWorldLifecycleJobListResponse {
  const page = Math.max(
    1,
    Number.parseInt(searchParams.get("page") ?? "1", 10) || 1,
  );
  const pageSize = Math.max(
    1,
    Number.parseInt(searchParams.get("pageSize") ?? "20", 10) || 20,
  );
  const sortedJobs = selectLifecycleJobs(jobs, world, searchParams);
  const items = sortedJobs.slice((page - 1) * pageSize, page * pageSize);
  return {
    items,
    total: sortedJobs.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(sortedJobs.length / pageSize)),
  };
}

function summarizeLifecycleJobs(
  jobs: WorldLifecycleJobSummary[],
): CloudWorldLifecycleJobAggregateSummary {
  const summary: CloudWorldLifecycleJobAggregateSummary = {
    totalJobs: jobs.length,
    activeJobs: 0,
    failedJobs: 0,
    supersededJobs: 0,
    queueState: {
      runningNow: 0,
      leaseExpired: 0,
      delayed: 0,
    },
  };

  for (const job of jobs) {
    if (job.status === "pending" || job.status === "running") {
      summary.activeJobs += 1;
    }
    if (job.status === "failed") {
      summary.failedJobs += 1;
    }
    if (getJobAuditBadgeLabel(job) !== null) {
      summary.supersededJobs += 1;
    }
    if (matchesQueueStateFilter(job, "running_now")) {
      summary.queueState.runningNow += 1;
    }
    if (matchesQueueStateFilter(job, "lease_expired")) {
      summary.queueState.leaseExpired += 1;
    }
    if (matchesQueueStateFilter(job, "delayed")) {
      summary.queueState.delayed += 1;
    }
  }

  return summary;
}

export function installCloudAdminApiMock(
  overrides?: CloudAdminMockOverrides,
) {
  const requests: CloudAdminRequestLog[] = [];
  let currentAccessToken = TEST_ADMIN_ACCESS_TOKEN;
  let currentAccessTokenExpiresAt = TEST_ADMIN_ACCESS_TOKEN_EXPIRES_AT;
  let currentRefreshToken = TEST_ADMIN_REFRESH_TOKEN;
  let currentRefreshTokenExpiresAt = TEST_ADMIN_REFRESH_TOKEN_EXPIRES_AT;
  const adminSessions = (overrides?.adminSessions ?? mockAdminSessions).map(
    (session) => ({ ...session }),
  );
  const waitingSessionSyncTasks = (
    overrides?.waitingSessionSyncTasks ?? mockWaitingSessionSyncTasks
  ).map((task) => ({ ...task }));
  const bulkRevokeUnavailableSessionIds = new Set(
    overrides?.bulkRevokeUnavailableSessionIds ?? [],
  );
  const resolvedRequests = (overrides?.requests?.length
    ? overrides.requests.map((request, index) => ({
        ...mockRequest,
        id: request.id ?? `request-${index + 1}`,
        ...request,
      }))
    : [
        {
          ...mockRequest,
          ...(overrides?.request ?? {}),
        },
      ]).map((request) => ({ ...request }));
  const getResolvedRequest = (requestId: string) =>
    resolvedRequests.find((request) => request.id === requestId) ?? null;
  const resolvedWorld = {
    ...mockWorld,
    ...(overrides?.world ?? {}),
  };
  const resolvedJobs = (overrides?.jobs?.length
    ? overrides.jobs.map((job) => ({
        ...mockJob,
        worldId: resolvedWorld.id,
        ...job,
      }))
    : [
        {
          ...mockJob,
          worldId: resolvedWorld.id,
          ...(overrides?.job ?? {}),
        },
      ]) as WorldLifecycleJobSummary[];
  const resolvedJob = resolvedJobs[0];
  const resolvedInstance = {
    ...mockInstance,
    worldId: resolvedWorld.id,
    ...(overrides?.instance ?? {}),
  };
  const resolvedAttentionItem = {
    ...mockAttentionItem,
    ...(overrides?.attentionItem ?? {}),
  };
  const resolvedDriftSummary = {
    ...mockDriftSummary,
    attentionItems: [resolvedAttentionItem],
    ...(overrides?.driftSummary ?? {}),
  };
  const actionErrors = overrides?.actionErrors ?? {};
  const updateRequestError = overrides?.updateRequestError;
  const updateWorldError = overrides?.updateWorldError;
  const rotateCallbackTokenError = overrides?.rotateCallbackTokenError;
  const revokeAdminSessionError = overrides?.revokeAdminSessionError;
  const bulkRevokeAdminSessionsError = overrides?.bulkRevokeAdminSessionsError;
  const filteredRevokeAdminSessionsError =
    overrides?.filteredRevokeAdminSessionsError;
  const revokeAdminSessionSourceGroupError =
    overrides?.revokeAdminSessionSourceGroupError;
  const createAdminSessionSourceGroupSnapshotError =
    overrides?.createAdminSessionSourceGroupSnapshotError;
  const createAdminSessionSourceGroupRiskSnapshotError =
    overrides?.createAdminSessionSourceGroupRiskSnapshotError;
  const replayFailedWaitingSessionSyncTasksError =
    overrides?.replayFailedWaitingSessionSyncTasksError;
  const clearFailedWaitingSessionSyncTasksError =
    overrides?.clearFailedWaitingSessionSyncTasksError;
  const replayFilteredFailedWaitingSessionSyncTasksError =
    overrides?.replayFilteredFailedWaitingSessionSyncTasksError;
  const clearFilteredFailedWaitingSessionSyncTasksError =
    overrides?.clearFilteredFailedWaitingSessionSyncTasksError;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const url = new URL(requestUrl, window.location.origin);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;

      requests.push({
        url: `${method} ${url.pathname}`,
        pathWithSearch: `${method} ${url.pathname}${url.search}`,
        method,
        body,
      });

      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/auth/token"
      ) {
        if (headers.get("X-Admin-Secret") !== TEST_SECRET) {
          return textResponse("Unauthorized", 401);
        }

        return jsonResponse({
          accessToken: currentAccessToken,
          expiresAt: currentAccessTokenExpiresAt,
          refreshToken: currentRefreshToken,
          refreshExpiresAt: currentRefreshTokenExpiresAt,
          tokenType: "Bearer",
        });
      }

      if (method === "POST" && url.pathname === "/admin/cloud/auth/refresh") {
        if (body?.refreshToken !== currentRefreshToken) {
          return textResponse("Unauthorized", 401);
        }

        currentAccessToken = `${currentAccessToken}-rotated`;
        currentAccessTokenExpiresAt = "2026-04-20T01:30:00.000Z";
        currentRefreshToken = `${currentRefreshToken}-rotated`;
        currentRefreshTokenExpiresAt = "2026-04-27T01:30:00.000Z";
        return jsonResponse({
          accessToken: currentAccessToken,
          expiresAt: currentAccessTokenExpiresAt,
          refreshToken: currentRefreshToken,
          refreshExpiresAt: currentRefreshTokenExpiresAt,
          tokenType: "Bearer",
        });
      }

      if (method === "POST" && url.pathname === "/admin/cloud/auth/logout") {
        if (body?.refreshToken !== currentRefreshToken) {
          return textResponse("Unauthorized", 401);
        }

        currentAccessToken = "revoked-admin-access-token";
        currentRefreshToken = "revoked-admin-refresh-token";
        return jsonResponse({
          success: true,
        });
      }

      const isAuthorized =
        headers.get("X-Admin-Secret") === TEST_SECRET ||
        headers.get("Authorization") ===
          `Bearer ${currentAccessToken}`;
      if (!isAuthorized) {
        return textResponse("Unauthorized", 401);
      }

      if (method === "GET" && url.pathname === "/admin/cloud/world-requests") {
        const status = url.searchParams.get("status");
        return jsonResponse(
          status
            ? resolvedRequests.filter((request) => request.status === status)
            : resolvedRequests,
        );
      }
      if (
        method === "GET" &&
        url.pathname.startsWith("/admin/cloud/world-requests/")
      ) {
        const requestId = url.pathname.split("/").pop() ?? "";
        const resolvedRequest = getResolvedRequest(requestId);
        if (!resolvedRequest) {
          return textResponse("Not found", 404);
        }
        return jsonResponse(resolvedRequest);
      }
      if (
        method === "PATCH" &&
        url.pathname.startsWith("/admin/cloud/world-requests/")
      ) {
        if (updateRequestError) {
          return textResponse(updateRequestError, 500);
        }
        const requestId = url.pathname.split("/").pop() ?? "";
        const requestIndex = resolvedRequests.findIndex(
          (request) => request.id === requestId,
        );
        if (requestIndex < 0) {
          return textResponse("Not found", 404);
        }
        const nextRequest = {
          ...resolvedRequests[requestIndex],
          ...(body ?? {}),
        };
        resolvedRequests[requestIndex] = nextRequest;
        return jsonResponse(nextRequest);
      }
      if (method === "GET" && url.pathname === "/admin/cloud/worlds") {
        return jsonResponse([resolvedWorld]);
      }
      if (method === "GET" && url.pathname === "/admin/cloud/drift-summary") {
        return jsonResponse(resolvedDriftSummary);
      }
      if (method === "GET" && url.pathname === "/admin/cloud/instances") {
        return jsonResponse([
          {
            world: resolvedWorld,
            instance: resolvedInstance,
          },
        ]);
      }
      if (method === "GET" && url.pathname === "/admin/cloud/worlds/world-1") {
        return jsonResponse(resolvedWorld);
      }
      if (
        method === "PATCH" &&
        url.pathname === "/admin/cloud/worlds/world-1"
      ) {
        if (updateWorldError) {
          return textResponse(updateWorldError, 500);
        }
        return jsonResponse({
          ...resolvedWorld,
          ...(body ?? {}),
        });
      }
      if (method === "GET" && url.pathname === "/admin/cloud/providers") {
        return jsonResponse(mockProviders);
      }
      if (method === "GET" && url.pathname === "/admin/cloud/admin-sessions") {
        return jsonResponse(listAdminSessions(adminSessions, url.searchParams));
      }
      if (
        method === "GET" &&
        url.pathname === "/admin/cloud/waiting-session-sync-tasks"
      ) {
        return jsonResponse(
          listWaitingSessionSyncTasks(waitingSessionSyncTasks, url.searchParams),
        );
      }
      if (
        method === "GET" &&
        url.pathname === "/admin/cloud/admin-session-source-groups"
      ) {
        return jsonResponse(
          listAdminSessionSourceGroups(adminSessions, url.searchParams),
        );
      }
      if (method === "POST" && url.pathname === "/admin/cloud/admin-sessions/revoke") {
        if (bulkRevokeAdminSessionsError) {
          return textResponse(bulkRevokeAdminSessionsError, 500);
        }
        const requestedSessionIds = Array.isArray(body?.sessionIds)
          ? body.sessionIds.filter((value): value is string => typeof value === "string")
          : [];
        const revokedSessionIds: string[] = [];
        const skippedSessionIds: string[] = [];

        requestedSessionIds.forEach((sessionId, index) => {
          const session = adminSessions.find((item) => item.id === sessionId);
          if (
            !session ||
            session.revokedAt ||
            bulkRevokeUnavailableSessionIds.has(sessionId)
          ) {
            skippedSessionIds.push(sessionId);
            return;
          }

          revokeMockAdminSession(
            session,
            "11111111-1111-4111-8111-111111111111",
            `2026-04-20T00:${String(40 + index).padStart(2, "0")}:00.000Z`,
          );
          revokedSessionIds.push(sessionId);
        });

        return jsonResponse({
          success: true,
          revokedSessionIds,
          skippedSessionIds,
        });
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/waiting-session-sync-tasks/replay-failed"
      ) {
        if (replayFailedWaitingSessionSyncTasksError) {
          return textResponse(replayFailedWaitingSessionSyncTasksError, 500);
        }
        const requestedTaskIds = Array.isArray(body?.taskIds)
          ? body.taskIds.filter((value): value is string => typeof value === "string")
          : [];
        const replayedTaskIds: string[] = [];
        const skippedTaskIds: string[] = [];

        requestedTaskIds.forEach((taskId) => {
          const task = waitingSessionSyncTasks.find((item) => item.id === taskId);
          if (!task || task.status !== "failed") {
            skippedTaskIds.push(taskId);
            return;
          }

          replayMockWaitingSessionSyncTask(task);
          replayedTaskIds.push(taskId);
        });

        return jsonResponse({
          success: true,
          replayedTaskIds,
          skippedTaskIds,
        });
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/waiting-session-sync-tasks/clear-failed"
      ) {
        if (clearFailedWaitingSessionSyncTasksError) {
          return textResponse(clearFailedWaitingSessionSyncTasksError, 500);
        }
        const requestedTaskIds = Array.isArray(body?.taskIds)
          ? body.taskIds.filter((value): value is string => typeof value === "string")
          : [];
        const clearedTaskIds: string[] = [];
        const skippedTaskIds: string[] = [];

        requestedTaskIds.forEach((taskId) => {
          const index = waitingSessionSyncTasks.findIndex((item) => item.id === taskId);
          if (index < 0 || waitingSessionSyncTasks[index]?.status !== "failed") {
            skippedTaskIds.push(taskId);
            return;
          }

          waitingSessionSyncTasks.splice(index, 1);
          clearedTaskIds.push(taskId);
        });

        return jsonResponse({
          success: true,
          clearedTaskIds,
          skippedTaskIds,
        });
      }
      if (
        method === "POST" &&
        url.pathname ===
          "/admin/cloud/waiting-session-sync-tasks/replay-filtered-failed"
      ) {
        if (replayFilteredFailedWaitingSessionSyncTasksError) {
          return textResponse(replayFilteredFailedWaitingSessionSyncTasksError, 500);
        }
        const searchParams = buildWaitingSessionSyncFilterSearchParams(body);
        searchParams.set("status", "failed");
        const matchingTasks = filterWaitingSessionSyncTasks(
          waitingSessionSyncTasks,
          searchParams,
        ).items;

        matchingTasks.forEach((task) => {
          const persisted = waitingSessionSyncTasks.find((item) => item.id === task.id);
          if (persisted && persisted.status === "failed") {
            replayMockWaitingSessionSyncTask(persisted);
          }
        });

        return jsonResponse({
          success: true,
          matchedCount: matchingTasks.length,
          replayedCount: matchingTasks.length,
          skippedCount: 0,
        });
      }
      if (
        method === "POST" &&
        url.pathname ===
          "/admin/cloud/waiting-session-sync-tasks/clear-filtered-failed"
      ) {
        if (clearFilteredFailedWaitingSessionSyncTasksError) {
          return textResponse(clearFilteredFailedWaitingSessionSyncTasksError, 500);
        }
        const searchParams = buildWaitingSessionSyncFilterSearchParams(body);
        searchParams.set("status", "failed");
        const matchingTaskIds = new Set(
          filterWaitingSessionSyncTasks(waitingSessionSyncTasks, searchParams).items.map(
            (task) => task.id,
          ),
        );
        const matchedCount = matchingTaskIds.size;

        for (let index = waitingSessionSyncTasks.length - 1; index >= 0; index -= 1) {
          if (matchingTaskIds.has(waitingSessionSyncTasks[index].id)) {
            waitingSessionSyncTasks.splice(index, 1);
          }
        }

        return jsonResponse({
          success: true,
          matchedCount,
          clearedCount: matchedCount,
          skippedCount: 0,
        });
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/admin-sessions/revoke-filtered"
      ) {
        if (filteredRevokeAdminSessionsError) {
          return textResponse(filteredRevokeAdminSessionsError, 500);
        }
        const searchParams = buildAdminSessionFilterSearchParams(body);

        const matchingSessions = filterAdminSessions(
          adminSessions,
          searchParams,
        ).items.filter((session) => session.status === "active");
        const revokedCurrentSession = matchingSessions.some(
          (session) => session.isCurrent,
        );

        matchingSessions.forEach((session, index) => {
          const persisted = adminSessions.find((item) => item.id === session.id);
          if (persisted) {
            revokeMockAdminSession(
              persisted,
              "11111111-1111-4111-8111-111111111111",
              `2026-04-20T01:${String(10 + index).padStart(2, "0")}:00.000Z`,
            );
          }
        });

        return jsonResponse({
          success: true,
          revokedCount: matchingSessions.length,
          skippedCount: 0,
          revokedCurrentSession,
        });
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/admin-session-source-groups/revoke"
      ) {
        if (revokeAdminSessionSourceGroupError) {
          return textResponse(revokeAdminSessionSourceGroupError, 500);
        }

        const sourceKey =
          typeof body?.sourceKey === "string" ? body.sourceKey : "";
        const matchingSessions = filterAdminSessions(
          adminSessions,
          buildAdminSessionFilterSearchParams(body),
        ).items.filter(
          (session) =>
            session.status === "active" &&
            createAdminSessionSourceKey(
              session.issuedFromIp,
              session.issuedUserAgent,
            ) === sourceKey,
        );
        const revokedCurrentSession = matchingSessions.some(
          (session) => session.isCurrent,
        );

        matchingSessions.forEach((session, index) => {
          const persisted = adminSessions.find((item) => item.id === session.id);
          if (persisted) {
            revokeMockAdminSession(
              persisted,
              "11111111-1111-4111-8111-111111111111",
              `2026-04-20T01:${String(30 + index).padStart(2, "0")}:00.000Z`,
            );
          }
        });

        return jsonResponse({
          success: true,
          revokedCount: matchingSessions.length,
          skippedCount: 0,
          revokedCurrentSession,
        });
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/admin-session-source-groups/revoke-risk"
      ) {
        const sourceGroupSearchParams = buildAdminSessionFilterSearchParams(body);
        if (typeof body?.riskLevel === "string") {
          sourceGroupSearchParams.set("riskLevel", body.riskLevel);
        }
        const matchingGroups = listAdminSessionSourceGroups(
          adminSessions,
          sourceGroupSearchParams,
        ).items;
        const matchingSourceKeys = new Set(
          matchingGroups.map((group) => group.sourceKey),
        );
        const matchingSessions = filterAdminSessions(
          adminSessions,
          buildAdminSessionFilterSearchParams(body),
        ).items.filter((session) =>
          matchingSourceKeys.has(
            createAdminSessionSourceKey(
              session.issuedFromIp,
              session.issuedUserAgent,
            ),
          ),
        );
        const revokedSourceKeys = new Set<string>();
        let revokedSessionCount = 0;
        let skippedSessionCount = 0;
        let revokedCurrentSession = false;

        matchingSessions.forEach((session, index) => {
          if (session.status !== "active") {
            skippedSessionCount += 1;
            return;
          }

          const persisted = adminSessions.find((item) => item.id === session.id);
          if (!persisted) {
            skippedSessionCount += 1;
            return;
          }

          revokeMockAdminSession(
            persisted,
            "11111111-1111-4111-8111-111111111111",
            `2026-04-20T01:${String(45 + index).padStart(2, "0")}:00.000Z`,
          );
          revokedSourceKeys.add(
            createAdminSessionSourceKey(
              session.issuedFromIp,
              session.issuedUserAgent,
            ),
          );
          revokedSessionCount += 1;
          if (session.isCurrent) {
            revokedCurrentSession = true;
          }
        });

        return jsonResponse({
          success: true,
          matchedGroupCount: matchingGroups.length,
          revokedGroupCount: revokedSourceKeys.size,
          revokedSessionCount,
          skippedSessionCount,
          revokedCurrentSession,
        });
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/admin-session-source-groups/snapshot"
      ) {
        if (createAdminSessionSourceGroupSnapshotError) {
          return textResponse(createAdminSessionSourceGroupSnapshotError, 500);
        }

        return jsonResponse(
          createAdminSessionSourceGroupSnapshot(adminSessions, body),
        );
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/admin-session-source-groups/risk-snapshot"
      ) {
        if (createAdminSessionSourceGroupRiskSnapshotError) {
          return textResponse(createAdminSessionSourceGroupRiskSnapshotError, 500);
        }

        return jsonResponse(
          createAdminSessionSourceGroupRiskSnapshot(adminSessions, body),
        );
      }
      const revokeAdminSessionMatch = url.pathname.match(
        /^\/admin\/cloud\/admin-sessions\/([^/]+)\/revoke$/,
      );
      if (method === "POST" && revokeAdminSessionMatch) {
        if (revokeAdminSessionError) {
          return textResponse(revokeAdminSessionError, 500);
        }
        const sessionId = revokeAdminSessionMatch[1];
        const session = adminSessions.find(
          (item) => item.id === sessionId,
        );
        if (session) {
          revokeMockAdminSession(session);
        }
        return jsonResponse({ success: true });
      }
      if (method === "GET" && url.pathname === "/admin/cloud/jobs") {
        return jsonResponse(
          filterLifecycleJobs(resolvedJobs, resolvedWorld, url.searchParams),
        );
      }
      if (method === "GET" && url.pathname === "/admin/cloud/jobs/summary") {
        const filteredJobSummary = summarizeLifecycleJobs(
          selectLifecycleJobs(resolvedJobs, resolvedWorld, url.searchParams),
        );
        return jsonResponse({
          ...filteredJobSummary,
          ...(overrides?.jobSummary ?? {}),
          queueState: {
            ...filteredJobSummary.queueState,
            ...(overrides?.jobSummary?.queueState ?? {}),
          },
        } satisfies CloudWorldLifecycleJobAggregateSummary);
      }
      if (
        method === "GET" &&
        url.pathname === "/admin/cloud/worlds/world-1/instance"
      ) {
        return jsonResponse(resolvedInstance);
      }
      if (
        method === "GET" &&
        url.pathname === "/admin/cloud/worlds/world-1/bootstrap-config"
      ) {
        return jsonResponse(mockBootstrapConfig);
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/worlds/world-1/rotate-callback-token"
      ) {
        if (rotateCallbackTokenError) {
          return textResponse(rotateCallbackTokenError, 500);
        }
        return jsonResponse({
          ...mockBootstrapConfig,
          callbackToken: "rotated-token-2",
        });
      }
      if (
        method === "GET" &&
        url.pathname === "/admin/cloud/worlds/world-1/runtime-status"
      ) {
        return jsonResponse(mockRuntimeStatus);
      }
      if (
        method === "GET" &&
        url.pathname === "/admin/cloud/worlds/world-1/alert-summary"
      ) {
        return jsonResponse(mockAlertSummary);
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/worlds/world-1/resume"
      ) {
        if (actionErrors.resume) {
          return textResponse(actionErrors.resume, 500);
        }
        return jsonResponse({
          ...resolvedWorld,
          status: "starting",
        });
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/worlds/world-1/suspend"
      ) {
        if (actionErrors.suspend) {
          return textResponse(actionErrors.suspend, 500);
        }
        return jsonResponse({
          ...resolvedWorld,
          status: "stopping",
          desiredState: "sleeping",
        });
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/worlds/world-1/retry"
      ) {
        if (actionErrors.retry) {
          return textResponse(actionErrors.retry, 500);
        }
        return jsonResponse({
          ...resolvedWorld,
          status: "starting",
        });
      }
      if (
        method === "POST" &&
        url.pathname === "/admin/cloud/worlds/world-1/reconcile"
      ) {
        if (actionErrors.reconcile) {
          return textResponse(actionErrors.reconcile, 500);
        }
        return jsonResponse(resolvedWorld);
      }

      throw new Error(
        `Unhandled cloud admin request: ${method} ${url.toString()}`,
      );
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    requests,
  };
}

export function renderRoute(path: string, options?: RenderRouteOptions) {
  window.history.replaceState({}, "", path);
  window.localStorage.setItem(
    ADMIN_SECRET_KEY,
    options?.adminSecret ?? TEST_SECRET,
  );
  if (options?.adminAccessToken) {
    window.localStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, options.adminAccessToken);
  } else {
    window.localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  }
  if (options?.adminAccessTokenExpiresAt) {
    window.localStorage.setItem(
      ADMIN_ACCESS_TOKEN_EXPIRES_AT_KEY,
      options.adminAccessTokenExpiresAt,
    );
  } else {
    window.localStorage.removeItem(ADMIN_ACCESS_TOKEN_EXPIRES_AT_KEY);
  }
  if (options?.adminRefreshToken) {
    window.localStorage.setItem(ADMIN_REFRESH_TOKEN_KEY, options.adminRefreshToken);
  } else {
    window.localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY);
  }
  if (options?.adminRefreshTokenExpiresAt) {
    window.localStorage.setItem(
      ADMIN_REFRESH_TOKEN_EXPIRES_AT_KEY,
      options.adminRefreshTokenExpiresAt,
    );
  } else {
    window.localStorage.removeItem(ADMIN_REFRESH_TOKEN_EXPIRES_AT_KEY);
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  const router = createAppRouter();

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { queryClient, router };
}
