import { describe, expect, it } from "vitest";
import {
  buildWaitingSessionSyncContextGroupsCsv,
  buildWaitingSessionSyncArtifactFilename,
  buildWaitingSessionSyncContextReviewCopy,
  buildWaitingSessionSyncPermalink,
  buildWaitingSessionSyncTaskReviewCopy,
  describeWaitingSessionSyncBatchActionSummary,
  describeWaitingSessionSyncFocusGuardCopy,
  serializeWaitingSessionSyncContextGroupArtifact,
} from "../src/lib/waiting-session-sync-helpers";
import {
  mockWaitingSessionSyncAllFilters,
  mockWaitingSessionSyncReviewGroup,
  mockWaitingSessionSyncReviewTasks,
} from "./waiting-session-sync-test-helpers";

describe("waiting session sync copy", () => {
  it("builds stable artifact filenames for filtered, grouped, and focused exports", () => {
    expect(
      buildWaitingSessionSyncArtifactFilename({
        mode: "filtered",
        filters: {
          status: "failed",
          taskType: "refresh_world",
          query: " runtime.heartbeat ",
        },
        extension: "json",
      }),
    ).toBe("waiting-sync-filtered-failed-refresh_world-runtime-heartbeat.json");

    expect(
      buildWaitingSessionSyncArtifactFilename({
        mode: "context-groups",
        filters: {
          status: "pending",
          taskType: "refresh_phone",
          query: "  heartbeat/focus  ",
        },
        extension: "csv",
      }),
    ).toBe("waiting-sync-context-groups-pending-refresh_phone-heartbeat-focus.csv");

    expect(
      buildWaitingSessionSyncArtifactFilename({
        mode: "context",
        filters: {
          status: "all",
          taskType: "all",
          query: "",
        },
        query: " runtime.heartbeat/v2 ",
        extension: "csv",
      }),
    ).toBe("waiting-sync-context-runtime-heartbeat-v2.csv");

    expect(
      buildWaitingSessionSyncArtifactFilename({
        mode: "focus",
        filters: {
          status: "all",
          taskType: "refresh_phone",
          query: "   ",
        },
        extension: "json",
      }),
    ).toBe("waiting-sync-focus-all.json");

    expect(
      buildWaitingSessionSyncPermalink({
        status: "pending",
        taskType: "refresh_phone",
        query: "runtime.heartbeat",
        reviewContext: "cloud.updateWorld",
        reviewTaskId: "44444444-4444-4444-8444-444444444444",
        page: 2,
        pageSize: 10,
      }),
    ).toBe(
      "/waiting-sync?status=pending&taskType=refresh_phone&query=runtime.heartbeat&reviewContext=cloud.updateWorld&reviewTaskId=44444444-4444-4444-8444-444444444444&page=2&pageSize=10",
    );
  });

  it("describes batch action guard copy from one shared helper", () => {
    expect(
      describeWaitingSessionSyncBatchActionSummary({
        actionsEnabled: false,
        taskTypeLabel: "Refresh world",
        query: "runtime.heartbeat",
      }),
    ).toBe(
      "Switch status to All or Failed before running batch failed-task actions.",
    );

    expect(
      describeWaitingSessionSyncBatchActionSummary({
        actionsEnabled: true,
        taskTypeLabel: "All",
        query: "   ",
      }),
    ).toBe("All failed tasks across every page.");

    expect(
      describeWaitingSessionSyncBatchActionSummary({
        actionsEnabled: true,
        taskTypeLabel: "Refresh world",
        query: " runtime.heartbeat ",
      }),
    ).toBe(
      'All matching failed tasks for task type Refresh world and search "runtime.heartbeat".',
    );
  });

  it("describes focus export guard copy from one shared helper", () => {
    expect(
      describeWaitingSessionSyncFocusGuardCopy({
        query: "",
      }),
    ).toBe(
      "Add a context or target query to export a tighter investigation snapshot.",
    );

    expect(
      describeWaitingSessionSyncFocusGuardCopy({
        query: " runtime.heartbeat ",
      }),
    ).toBe(
      "Focus snapshot appears when the current query exactly matches a visible context or target.",
    );

    expect(
      describeWaitingSessionSyncFocusGuardCopy({
        query: "runtime.heartbeat",
        matchingTaskCount: 2,
      }),
    ).toBe(
      'Focus snapshot ready for query "runtime.heartbeat" with 2 exact context/target match(es).',
    );
  });

  it("serializes context-group artifacts with related task references", () => {
    expect(
      serializeWaitingSessionSyncContextGroupArtifact(
        mockWaitingSessionSyncReviewGroup,
        mockWaitingSessionSyncAllFilters,
        mockWaitingSessionSyncReviewTasks,
      ),
    ).toEqual({
      context: "runtime.heartbeat",
      total: 2,
      failed: 1,
      pending: 1,
      running: 0,
      latestUpdatedAt: "2026-04-21T00:00:00.000Z",
      taskTypes: ["refresh_world", "refresh_phone"],
      refreshWorldTarget: "world-1",
      taskTypeLabels: ["Refresh world", "Refresh phone"],
      focusPath:
        "/waiting-sync?status=all&taskType=all&query=runtime.heartbeat&page=1&pageSize=20",
      worldDetailPath: "/worlds/world-1",
      taskIds: [
        "44444444-4444-4444-8444-444444444444",
        "77777777-7777-4777-8777-777777777777",
      ],
      taskKeys: [
        "refresh-world:world-1",
        "refresh-phone:+8613800138099",
      ],
      targetValues: ["world-1", "+8613800138099"],
    });
  });

  it("builds context-group CSV rows with related task columns", () => {
    const csv = buildWaitingSessionSyncContextGroupsCsv(
      [mockWaitingSessionSyncReviewGroup],
      {
        ...mockWaitingSessionSyncAllFilters,
        status: "failed",
      },
      mockWaitingSessionSyncReviewTasks,
    );

    expect(csv).toContain("taskIds");
    expect(csv).toContain("taskKeys");
    expect(csv).toContain("targetValues");
    expect(csv).toContain(
      "44444444-4444-4444-8444-444444444444 | 77777777-7777-4777-8777-777777777777",
    );
    expect(csv).toContain(
      "refresh-world:world-1 | refresh-phone:+8613800138099",
    );
    expect(csv).toContain("world-1 | +8613800138099");
  });

  it("builds review copy for a reviewed context and task", () => {
    const contextArtifact = serializeWaitingSessionSyncContextGroupArtifact(
      mockWaitingSessionSyncReviewGroup,
      mockWaitingSessionSyncAllFilters,
      mockWaitingSessionSyncReviewTasks,
    );

    expect(
      buildWaitingSessionSyncContextReviewCopy({
        artifact: contextArtifact,
        reviewPath:
          "/waiting-sync?status=all&taskType=all&query=&page=1&pageSize=20",
        summary: {
          failed: 1,
          pending: 1,
          running: 0,
        },
      }),
    ).toBe(
      [
        "Context: runtime.heartbeat",
        "Visible tasks: 2",
        "Failed: 1",
        "Pending: 1",
        "Running: 0",
        "Task types: Refresh world | Refresh phone",
        "Latest update: 2026-04-21T00:00:00.000Z",
        "Review permalink: /waiting-sync?status=all&taskType=all&query=&page=1&pageSize=20",
        "Focus path: /waiting-sync?status=all&taskType=all&query=runtime.heartbeat&page=1&pageSize=20",
        "World detail: /worlds/world-1",
        "Task ids: 44444444-4444-4444-8444-444444444444 | 77777777-7777-4777-8777-777777777777",
        "Task keys: refresh-world:world-1 | refresh-phone:+8613800138099",
        "Target values: world-1 | +8613800138099",
      ].join("\n"),
    );

    expect(
      buildWaitingSessionSyncTaskReviewCopy({
        reviewPath:
          "/waiting-sync?status=all&taskType=all&query=&reviewContext=runtime.heartbeat&reviewTaskId=44444444-4444-4444-8444-444444444444&page=1&pageSize=20",
        task: mockWaitingSessionSyncReviewTasks[0],
      }),
    ).toBe(
      [
        "Task key: refresh-world:world-1",
        "Task type: Refresh world",
        "Status: Failed",
        "Target: world-1",
        "Context: runtime.heartbeat",
        "Attempt: 3 / 3",
        "Available: 2026-04-20T00:15:00.000Z",
        "Updated: 2026-04-20T00:16:00.000Z",
        "Finished: 2026-04-20T00:16:00.000Z",
        "Lease owner: Not available",
        "Last error: heartbeat callback failed",
        "Review permalink: /waiting-sync?status=all&taskType=all&query=&reviewContext=runtime.heartbeat&reviewTaskId=44444444-4444-4444-8444-444444444444&page=1&pageSize=20",
        "Requests path: /requests?status=all&projectedWorldStatus=all&desiredState=all&query=world-1",
        "Worlds path: /worlds?status=all&provider=all&powerState=all&attention=all&health=all&query=world-1",
        "World detail: /worlds/world-1",
      ].join("\n"),
    );
  });
});
