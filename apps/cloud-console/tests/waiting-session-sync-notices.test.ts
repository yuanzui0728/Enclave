import { describe, expect, it } from "vitest";
import {
  createWaitingSessionSyncCopyNotice,
  createWaitingSessionSyncContextGroupsCsvNotice,
  createWaitingSessionSyncContextGroupsSnapshotNotice,
  createWaitingSessionSyncClearTaskNotice,
  createWaitingSessionSyncFilteredClearNotice,
  createWaitingSessionSyncFilteredReplayNotice,
  createWaitingSessionSyncReplayTaskNotice,
  createWaitingSessionSyncSnapshotNotice,
} from "../src/lib/waiting-session-sync-helpers";

describe("waiting session sync notices", () => {
  it("builds single-task replay and clear notices", () => {
    expect(
      createWaitingSessionSyncReplayTaskNotice({
        requestId: "req-replay",
        data: {
          replayedTaskIds: ["task-1"],
          skippedTaskIds: [],
        },
      }),
    ).toEqual({
      message: "Waiting sync task replay queued.",
      tone: "success",
      requestId: "req-replay",
    });

    expect(
      createWaitingSessionSyncReplayTaskNotice({
        data: {
          replayedTaskIds: [],
          skippedTaskIds: ["task-2"],
        },
      }),
    ).toEqual({
      message: "Waiting sync task replay was skipped.",
      tone: "warning",
      requestId: undefined,
    });

    expect(
      createWaitingSessionSyncClearTaskNotice({
        requestId: "req-clear",
        data: {
          clearedTaskIds: ["task-3"],
          skippedTaskIds: [],
        },
      }),
    ).toEqual({
      message: "Waiting sync task cleared.",
      tone: "success",
      requestId: "req-clear",
    });

    expect(
      createWaitingSessionSyncClearTaskNotice({
        data: {
          clearedTaskIds: [],
          skippedTaskIds: ["task-4"],
        },
      }),
    ).toEqual({
      message: "Waiting sync task clear was skipped.",
      tone: "warning",
      requestId: undefined,
    });
  });

  it("builds filtered replay notices for empty, success, and partial outcomes", () => {
    expect(
      createWaitingSessionSyncFilteredReplayNotice({
        requestId: "req-empty",
        data: {
          matchedCount: 0,
          replayedCount: 0,
          skippedCount: 0,
        },
      }),
    ).toEqual({
      message: "No matching failed waiting sync tasks to replay.",
      tone: "info",
      requestId: "req-empty",
    });

    expect(
      createWaitingSessionSyncFilteredReplayNotice({
        data: {
          matchedCount: 3,
          replayedCount: 3,
          skippedCount: 0,
        },
      }),
    ).toEqual({
      message:
        "Queued replay for 3 matching failed waiting sync task(s). Skipped 0.",
      tone: "success",
      requestId: undefined,
    });

    expect(
      createWaitingSessionSyncFilteredReplayNotice({
        data: {
          matchedCount: 4,
          replayedCount: 2,
          skippedCount: 2,
        },
      }),
    ).toEqual({
      message:
        "Queued replay for 2 matching failed waiting sync task(s). Skipped 2.",
      tone: "warning",
      requestId: undefined,
    });
  });

  it("builds filtered clear notices for empty, success, and partial outcomes", () => {
    expect(
      createWaitingSessionSyncFilteredClearNotice({
        requestId: "req-empty-clear",
        data: {
          matchedCount: 0,
          clearedCount: 0,
          skippedCount: 0,
        },
      }),
    ).toEqual({
      message: "No matching failed waiting sync tasks to clear.",
      tone: "info",
      requestId: "req-empty-clear",
    });

    expect(
      createWaitingSessionSyncFilteredClearNotice({
        data: {
          matchedCount: 2,
          clearedCount: 2,
          skippedCount: 0,
        },
      }),
    ).toEqual({
      message:
        "Cleared 2 matching failed waiting sync task(s). Skipped 0.",
      tone: "success",
      requestId: undefined,
    });

    expect(
      createWaitingSessionSyncFilteredClearNotice({
        data: {
          matchedCount: 5,
          clearedCount: 4,
          skippedCount: 1,
        },
      }),
    ).toEqual({
      message:
        "Cleared 4 matching failed waiting sync task(s). Skipped 1.",
      tone: "warning",
      requestId: undefined,
    });
  });

  it("builds waiting sync snapshot notices for each artifact mode", () => {
    expect(
      createWaitingSessionSyncSnapshotNotice({
        mode: "context",
        downloaded: true,
        taskCount: 6,
        requestId: "req-context",
      }),
    ).toEqual({
      message: "Downloaded waiting sync context snapshot for 6 task(s).",
      tone: "success",
      requestId: "req-context",
    });

    expect(
      createWaitingSessionSyncSnapshotNotice({
        mode: "filtered",
        downloaded: false,
        taskCount: 3,
      }),
    ).toEqual({
      message: "Waiting sync snapshot download failed.",
      tone: "warning",
      requestId: undefined,
    });

    expect(
      createWaitingSessionSyncSnapshotNotice({
        mode: "focus",
        downloaded: true,
        taskCount: 1,
      }),
    ).toEqual({
      message: "Downloaded waiting sync focus snapshot for 1 task(s).",
      tone: "success",
      requestId: undefined,
    });
  });

  it("builds waiting sync context-group CSV notices", () => {
    expect(
      createWaitingSessionSyncContextGroupsCsvNotice({
        downloaded: true,
        groupCount: 3,
        requestId: "req-groups",
      }),
    ).toEqual({
      message: "Downloaded waiting sync context groups CSV for 3 group(s).",
      tone: "success",
      requestId: "req-groups",
    });

    expect(
      createWaitingSessionSyncContextGroupsCsvNotice({
        downloaded: false,
        groupCount: 2,
      }),
    ).toEqual({
      message: "Waiting sync context groups CSV download failed.",
      tone: "warning",
      requestId: undefined,
    });
  });

  it("builds waiting sync context-group snapshot notices", () => {
    expect(
      createWaitingSessionSyncContextGroupsSnapshotNotice({
        downloaded: true,
        groupCount: 4,
        requestId: "req-groups-json",
      }),
    ).toEqual({
      message: "Downloaded waiting sync context groups snapshot for 4 group(s).",
      tone: "success",
      requestId: "req-groups-json",
    });

    expect(
      createWaitingSessionSyncContextGroupsSnapshotNotice({
        downloaded: false,
        groupCount: 1,
      }),
    ).toEqual({
      message: "Waiting sync context groups snapshot download failed.",
      tone: "warning",
      requestId: undefined,
    });
  });

  it("builds waiting sync copy notices for review and task contexts", () => {
    expect(
      createWaitingSessionSyncCopyNotice({
        copied: true,
        subject: "review-context",
      }),
    ).toEqual({
      message: "Waiting sync review context copied.",
      tone: "success",
      requestId: undefined,
    });

    expect(
      createWaitingSessionSyncCopyNotice({
        copied: false,
        subject: "task-context",
      }),
    ).toEqual({
      message: "Waiting sync task context copy failed.",
      tone: "warning",
      requestId: undefined,
    });
  });
});
