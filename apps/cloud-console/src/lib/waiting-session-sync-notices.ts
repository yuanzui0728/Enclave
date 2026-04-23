import {
  createBooleanOutcomeNotice,
  createRequestScopedNotice,
  type RequestScopedNotice,
} from "./request-scoped-notice";

type WaitingSessionSyncResponseWithMeta<TData> = {
  requestId?: string | null;
  data: TData;
};

type ReplayTaskResponse = WaitingSessionSyncResponseWithMeta<{
  replayedTaskIds: string[];
  skippedTaskIds: string[];
}>;

type ClearTaskResponse = WaitingSessionSyncResponseWithMeta<{
  clearedTaskIds: string[];
  skippedTaskIds: string[];
}>;

type FilteredReplayResponse = WaitingSessionSyncResponseWithMeta<{
  matchedCount: number;
  replayedCount: number;
  skippedCount: number;
}>;

type FilteredClearResponse = WaitingSessionSyncResponseWithMeta<{
  matchedCount: number;
  clearedCount: number;
  skippedCount: number;
}>;

type WaitingSessionSyncSnapshotNoticeOptions = {
  mode: "context" | "filtered" | "focus";
  format?: "json" | "csv";
  downloaded: boolean;
  taskCount: number;
  requestId?: string | null;
};

type WaitingSessionSyncContextGroupsNoticeOptions = {
  downloaded: boolean;
  groupCount: number;
  requestId?: string | null;
};

type WaitingSessionSyncCopyNoticeOptions = {
  copied: boolean;
  subject: "permalink" | "review-context" | "task-context";
};

export function createWaitingSessionSyncReplayTaskNotice(
  response: ReplayTaskResponse,
): RequestScopedNotice {
  if (response.data.replayedTaskIds.length > 0) {
    return createRequestScopedNotice(
      "Waiting sync task replay queued.",
      "success",
      response.requestId,
    );
  }

  return createRequestScopedNotice(
    "Waiting sync task replay was skipped.",
    "warning",
    response.requestId,
  );
}

export function createWaitingSessionSyncClearTaskNotice(
  response: ClearTaskResponse,
): RequestScopedNotice {
  if (response.data.clearedTaskIds.length > 0) {
    return createRequestScopedNotice(
      "Waiting sync task cleared.",
      "success",
      response.requestId,
    );
  }

  return createRequestScopedNotice(
    "Waiting sync task clear was skipped.",
    "warning",
    response.requestId,
  );
}

export function createWaitingSessionSyncFilteredReplayNotice(
  response: FilteredReplayResponse,
): RequestScopedNotice {
  if (response.data.matchedCount === 0) {
    return createRequestScopedNotice(
      "No matching failed waiting sync tasks to replay.",
      "info",
      response.requestId,
    );
  }

  return createRequestScopedNotice(
    `Queued replay for ${response.data.replayedCount} matching failed waiting sync task(s). Skipped ${response.data.skippedCount}.`,
    response.data.skippedCount > 0 ? "warning" : "success",
    response.requestId,
  );
}

export function createWaitingSessionSyncFilteredClearNotice(
  response: FilteredClearResponse,
): RequestScopedNotice {
  if (response.data.matchedCount === 0) {
    return createRequestScopedNotice(
      "No matching failed waiting sync tasks to clear.",
      "info",
      response.requestId,
    );
  }

  return createRequestScopedNotice(
    `Cleared ${response.data.clearedCount} matching failed waiting sync task(s). Skipped ${response.data.skippedCount}.`,
    response.data.skippedCount > 0 ? "warning" : "success",
    response.requestId,
  );
}

export function createWaitingSessionSyncSnapshotNotice({
  mode,
  format = "json",
  downloaded,
  taskCount,
  requestId,
}: WaitingSessionSyncSnapshotNoticeOptions): RequestScopedNotice {
  const successMessage =
    format === "csv"
      ? mode === "context"
        ? `Downloaded waiting sync context CSV for ${taskCount} task(s).`
        : mode === "focus"
          ? `Downloaded waiting sync focus CSV for ${taskCount} task(s).`
          : `Downloaded waiting sync CSV for ${taskCount} visible task(s).`
      : mode === "context"
        ? `Downloaded waiting sync context snapshot for ${taskCount} task(s).`
        : mode === "focus"
          ? `Downloaded waiting sync focus snapshot for ${taskCount} task(s).`
          : `Downloaded waiting sync snapshot for ${taskCount} visible task(s).`;
  const failureMessage =
    format === "csv"
      ? mode === "context"
        ? "Waiting sync context CSV download failed."
        : mode === "focus"
          ? "Waiting sync focus CSV download failed."
          : "Waiting sync CSV download failed."
      : mode === "context"
        ? "Waiting sync context snapshot download failed."
        : mode === "focus"
          ? "Waiting sync focus snapshot download failed."
          : "Waiting sync snapshot download failed.";

  return createBooleanOutcomeNotice({
    requestId,
    succeeded: downloaded,
    successMessage,
    failureMessage,
  });
}

export function createWaitingSessionSyncContextGroupsCsvNotice({
  downloaded,
  groupCount,
  requestId,
}: WaitingSessionSyncContextGroupsNoticeOptions): RequestScopedNotice {
  return createBooleanOutcomeNotice({
    requestId,
    succeeded: downloaded,
    successMessage: `Downloaded waiting sync context groups CSV for ${groupCount} group(s).`,
    failureMessage: "Waiting sync context groups CSV download failed.",
  });
}

export function createWaitingSessionSyncContextGroupsSnapshotNotice({
  downloaded,
  groupCount,
  requestId,
}: WaitingSessionSyncContextGroupsNoticeOptions): RequestScopedNotice {
  return createBooleanOutcomeNotice({
    requestId,
    succeeded: downloaded,
    successMessage: `Downloaded waiting sync context groups snapshot for ${groupCount} group(s).`,
    failureMessage: "Waiting sync context groups snapshot download failed.",
  });
}

export function createWaitingSessionSyncCopyNotice({
  copied,
  subject,
}: WaitingSessionSyncCopyNoticeOptions): RequestScopedNotice {
  return createBooleanOutcomeNotice({
    succeeded: copied,
    successMessage:
      subject === "permalink"
        ? "Waiting sync permalink copied."
        : subject === "review-context"
        ? "Waiting sync review context copied."
        : "Waiting sync task context copied.",
    failureMessage:
      subject === "permalink"
        ? "Waiting sync permalink copy failed."
        : subject === "review-context"
        ? "Waiting sync review context copy failed."
        : "Waiting sync task context copy failed.",
  });
}
