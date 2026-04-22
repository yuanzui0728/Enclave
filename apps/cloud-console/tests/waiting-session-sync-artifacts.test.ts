import { describe, expect, it } from "vitest";
import {
  buildWaitingSessionSyncContextGroupsCsv,
  createWaitingSessionSyncContextGroupsSnapshotPayload,
  createWaitingSessionSyncContextSnapshotPayload,
  createWaitingSessionSyncFilteredSnapshotPayload,
  createWaitingSessionSyncFocusSnapshotPayload,
} from "../src/lib/waiting-session-sync-helpers";
import {
  mockWaitingSessionSyncArtifactFilters as MOCK_FILTERS,
  mockWaitingSessionSyncArtifactGroup as MOCK_GROUP,
  mockWaitingSessionSyncArtifactTasks as MOCK_TASKS,
} from "./waiting-session-sync-test-helpers";

describe("waiting session sync artifact builders", () => {
  it("builds a context snapshot payload with query-specific filters and serialized tasks", () => {
    const payload = createWaitingSessionSyncContextSnapshotPayload({
      generatedAt: "2026-04-21T01:00:00.000Z",
      filters: MOCK_FILTERS,
      context: "runtime.heartbeat",
      tasks: MOCK_TASKS,
      focusedContextGroup: MOCK_GROUP,
    });

    expect(payload).toMatchObject({
      generatedAt: "2026-04-21T01:00:00.000Z",
      route: "waiting-sync",
      mode: "context",
      filters: {
        ...MOCK_FILTERS,
        query: "runtime.heartbeat",
      },
      visibleSummary: {
        failed: 1,
        pending: 0,
        running: 1,
      },
      focus: {
        context: MOCK_GROUP,
        target: null,
        matchingTaskCount: 2,
      },
    });
    expect(payload.tasks[0]?.lookup.worldDetailPath).toBe("/worlds/world-1");
  });

  it("builds filtered and focus snapshot payloads with serialized lookups", () => {
    const filteredPayload = createWaitingSessionSyncFilteredSnapshotPayload({
      generatedAt: "2026-04-21T01:05:00.000Z",
      filters: MOCK_FILTERS,
      pagination: {
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      },
      visibleSummary: {
        failed: 1,
        pending: 0,
        running: 1,
      },
      contextGroups: [MOCK_GROUP],
      tasks: MOCK_TASKS,
    });

    expect(filteredPayload).toMatchObject({
      mode: "filtered",
      pagination: {
        total: 2,
      },
      contextGroups: [MOCK_GROUP],
    });

    const focusPayload = createWaitingSessionSyncFocusSnapshotPayload({
      generatedAt: "2026-04-21T01:15:00.000Z",
      filters: MOCK_FILTERS,
      visibleSummary: {
        failed: 1,
        pending: 0,
        running: 1,
      },
      focusSnapshot: {
        query: "runtime.heartbeat",
        matchingTasks: MOCK_TASKS,
        focusedContextGroup: MOCK_GROUP,
        focusedTarget: {
          targetValue: "world-1",
          total: 1,
          failed: 1,
          pending: 0,
          running: 0,
          latestUpdatedAt: "2026-04-21T00:01:00.000Z",
          taskTypes: ["refresh_world"] as const,
        },
      },
    });

    expect(focusPayload).toMatchObject({
      mode: "focus",
      focus: {
        query: "runtime.heartbeat",
        matchingTaskCount: 2,
      },
    });
    expect(focusPayload.tasks[1]?.lookup.worldDetailPath).toBeUndefined();
  });

  it("builds context-group csv and snapshot payloads with focus paths and task ids", () => {
    const csv = buildWaitingSessionSyncContextGroupsCsv(
      [MOCK_GROUP],
      MOCK_FILTERS,
      MOCK_TASKS,
    );
    expect(csv).toContain("taskIds");
    expect(csv).toContain("Refresh world | Refresh phone");
    expect(csv).toContain("task-1 | task-2");

    const payload = createWaitingSessionSyncContextGroupsSnapshotPayload({
      generatedAt: "2026-04-21T01:10:00.000Z",
      filters: MOCK_FILTERS,
      visibleSummary: {
        failed: 1,
        pending: 0,
        running: 1,
      },
      pagination: {
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      },
      contextGroups: [MOCK_GROUP],
      tasks: MOCK_TASKS,
    });

    expect(payload.contextGroups[0]).toMatchObject({
      taskTypeLabels: ["Refresh world", "Refresh phone"],
      taskIds: ["task-1", "task-2"],
      targetValues: ["world-1", "+8613800138000"],
      worldDetailPath: "/worlds/world-1",
      focusPath:
        "/waiting-sync?status=failed&taskType=refresh_world&query=runtime.heartbeat&page=1&pageSize=20",
    });
  });
});
