import type { CloudWaitingSessionSyncTaskSummary } from "@yinjie/contracts";
import { buildWaitingSessionSyncRouteSearch } from "../src/lib/waiting-session-sync-helpers";
import { mockWaitingSessionSyncTasks } from "./test-helpers";

export const mockWaitingSessionSyncReviewTasks: CloudWaitingSessionSyncTaskSummary[] =
  [
    mockWaitingSessionSyncTasks[0],
    {
      ...mockWaitingSessionSyncTasks[1],
      id: "77777777-7777-4777-8777-777777777777",
      taskKey: "refresh-phone:+8613800138099",
      targetValue: "+8613800138099",
      context: "runtime.heartbeat",
      status: "pending",
    },
    mockWaitingSessionSyncTasks[2],
  ];

export const mockWaitingSessionSyncReviewGroup = {
  context: "runtime.heartbeat",
  total: 2,
  failed: 1,
  pending: 1,
  running: 0,
  latestUpdatedAt: "2026-04-21T00:00:00.000Z",
  taskTypes: ["refresh_world", "refresh_phone"] as const,
  refreshWorldTarget: "world-1",
};

export const mockWaitingSessionSyncAllFilters = buildWaitingSessionSyncRouteSearch(
  {
    status: "all",
    taskType: "all",
    query: "",
    reviewContext: "",
    reviewTaskId: "",
    page: 1,
    pageSize: 20,
  },
);

export const mockWaitingSessionSyncArtifactTasks: CloudWaitingSessionSyncTaskSummary[] =
  [
    {
      id: "task-1",
      taskKey: "refresh-world:world-1",
      taskType: "refresh_world",
      status: "failed",
      attempt: 2,
      maxAttempts: 4,
      targetValue: "world-1",
      context: "runtime.heartbeat",
      availableAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:01:00.000Z",
      finishedAt: "2026-04-21T00:02:00.000Z",
      lastError: "boom",
      leaseOwner: "worker-a",
      leaseExpiresAt: null,
      leaseRemainingSeconds: null,
      createdAt: "2026-04-21T00:00:00.000Z",
    },
    {
      id: "task-2",
      taskKey: "refresh-phone:+8613800138000",
      taskType: "refresh_phone",
      status: "running",
      attempt: 1,
      maxAttempts: 3,
      targetValue: "+8613800138000",
      context: "runtime.heartbeat",
      availableAt: "2026-04-21T00:03:00.000Z",
      updatedAt: "2026-04-21T00:04:00.000Z",
      finishedAt: null,
      lastError: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseRemainingSeconds: null,
      createdAt: "2026-04-21T00:03:00.000Z",
    },
  ];

export const mockWaitingSessionSyncArtifactFilters =
  buildWaitingSessionSyncRouteSearch({
    status: "failed",
    taskType: "refresh_world",
    query: "runtime.heartbeat",
    page: 1,
    pageSize: 20,
  });

export const mockWaitingSessionSyncArtifactGroup = {
  context: "runtime.heartbeat",
  total: 2,
  failed: 1,
  pending: 0,
  running: 1,
  latestUpdatedAt: "2026-04-21T00:04:00.000Z",
  taskTypes: ["refresh_world", "refresh_phone"] as const,
  refreshWorldTarget: "world-1",
};
