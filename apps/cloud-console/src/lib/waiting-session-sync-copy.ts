import type { CloudWaitingSessionSyncTaskSummary } from "@yinjie/contracts";
import {
  buildWaitingSessionSyncSnapshotLookup,
  type WaitingSessionSyncContextGroupArtifact,
  type WaitingSessionSyncStatusSummary,
} from "./waiting-session-sync-artifacts";
import {
  buildWaitingSessionSyncRouteSearch,
  type WaitingSessionSyncRouteSearch,
} from "./waiting-session-sync-route-search";

export type WaitingSessionSyncArtifactMode =
  | "context"
  | "context-groups"
  | "filtered"
  | "focus";

type BuildWaitingSessionSyncArtifactFilenameOptions = {
  mode: WaitingSessionSyncArtifactMode;
  filters: Pick<WaitingSessionSyncRouteSearch, "status" | "taskType" | "query">;
  extension: "json" | "csv";
  query?: string;
};

type WaitingSessionSyncBatchActionSummaryOptions = {
  actionsEnabled: boolean;
  taskTypeLabel: string;
  query: string;
};

type WaitingSessionSyncFocusGuardCopyOptions = {
  query: string;
  matchingTaskCount?: number;
};

type BuildWaitingSessionSyncContextReviewCopyOptions = {
  artifact: WaitingSessionSyncContextGroupArtifact;
  reviewPath: string;
  summary: WaitingSessionSyncStatusSummary;
};

type BuildWaitingSessionSyncTaskReviewCopyOptions = {
  reviewPath: string;
  task: CloudWaitingSessionSyncTaskSummary;
};

function normalizeSnapshotFilenameSegment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "all";
}

function buildRouteSearchPath(
  pathname: string,
  search: Record<string, string | number | boolean>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if ((key === "reviewContext" || key === "reviewTaskId") && value === "") {
      continue;
    }
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function formatWaitingSessionSyncTaskType(
  taskType: CloudWaitingSessionSyncTaskSummary["taskType"],
) {
  switch (taskType) {
    case "refresh_world":
      return "Refresh world";
    case "refresh_phone":
      return "Refresh phone";
    case "invalidate_phone":
      return "Invalidate phone";
    default:
      return taskType;
  }
}

function formatWaitingSessionSyncStatus(
  status: CloudWaitingSessionSyncTaskSummary["status"],
) {
  switch (status) {
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    default:
      return status;
  }
}

export function buildWaitingSessionSyncArtifactFilename({
  mode,
  filters,
  extension,
  query,
}: BuildWaitingSessionSyncArtifactFilenameOptions) {
  const effectiveQuery = query ?? filters.query;
  const parts =
    mode === "filtered" || mode === "context-groups"
      ? [
          "waiting-sync",
          mode,
          filters.status,
          filters.taskType,
          normalizeSnapshotFilenameSegment(effectiveQuery),
        ]
      : [
          "waiting-sync",
          mode,
          normalizeSnapshotFilenameSegment(effectiveQuery),
        ];

  return `${parts.join("-")}.${extension}`;
}

export function describeWaitingSessionSyncBatchActionSummary({
  actionsEnabled,
  taskTypeLabel,
  query,
}: WaitingSessionSyncBatchActionSummaryOptions) {
  if (!actionsEnabled) {
    return "Switch status to All or Failed before running batch failed-task actions.";
  }

  const normalizedQuery = query.trim();
  if (taskTypeLabel === "All" && normalizedQuery.length === 0) {
    return "All failed tasks across every page.";
  }

  return `All matching failed tasks for task type ${taskTypeLabel}${
    normalizedQuery ? ` and search "${normalizedQuery}".` : "."
  }`;
}

export function describeWaitingSessionSyncFocusGuardCopy({
  query,
  matchingTaskCount,
}: WaitingSessionSyncFocusGuardCopyOptions) {
  const normalizedQuery = query.trim();

  if (typeof matchingTaskCount === "number") {
    return `Focus snapshot ready for query "${normalizedQuery}" with ${matchingTaskCount} exact context/target match(es).`;
  }

  if (normalizedQuery.length > 0) {
    return "Focus snapshot appears when the current query exactly matches a visible context or target.";
  }

  return "Add a context or target query to export a tighter investigation snapshot.";
}

export function buildWaitingSessionSyncPermalink(
  search: WaitingSessionSyncRouteSearch,
) {
  return buildRouteSearchPath(
    "/waiting-sync",
    buildWaitingSessionSyncRouteSearch(search),
  );
}

export function buildWaitingSessionSyncContextReviewCopy({
  artifact,
  reviewPath,
  summary,
}: BuildWaitingSessionSyncContextReviewCopyOptions) {
  return [
    `Context: ${artifact.context}`,
    `Visible tasks: ${artifact.total}`,
    `Failed: ${summary.failed}`,
    `Pending: ${summary.pending}`,
    `Running: ${summary.running}`,
    `Task types: ${artifact.taskTypeLabels.join(" | ")}`,
    `Latest update: ${artifact.latestUpdatedAt ?? "Not available"}`,
    `Review permalink: ${reviewPath}`,
    `Focus path: ${artifact.focusPath}`,
    `World detail: ${artifact.worldDetailPath ?? "Not available"}`,
    `Task ids: ${artifact.taskIds.join(" | ")}`,
    `Task keys: ${artifact.taskKeys.join(" | ")}`,
    `Target values: ${artifact.targetValues.join(" | ")}`,
  ].join("\n");
}

export function buildWaitingSessionSyncTaskReviewCopy(
  options: BuildWaitingSessionSyncTaskReviewCopyOptions,
) {
  const { reviewPath, task } = options;
  const lookup = buildWaitingSessionSyncSnapshotLookup(task);

  return [
    `Task key: ${task.taskKey}`,
    `Task type: ${formatWaitingSessionSyncTaskType(task.taskType)}`,
    `Status: ${formatWaitingSessionSyncStatus(task.status)}`,
    `Target: ${task.targetValue}`,
    `Context: ${task.context}`,
    `Attempt: ${task.attempt} / ${task.maxAttempts}`,
    `Available: ${task.availableAt}`,
    `Updated: ${task.updatedAt}`,
    `Finished: ${task.finishedAt ?? "Not available"}`,
    `Lease owner: ${task.leaseOwner ?? "Not available"}`,
    `Last error: ${task.lastError ?? "None"}`,
    `Review permalink: ${reviewPath}`,
    `Requests path: ${lookup.requestsPath}`,
    `Worlds path: ${lookup.worldsPath}`,
    `World detail: ${lookup.worldDetailPath ?? "Not available"}`,
  ].join("\n");
}
