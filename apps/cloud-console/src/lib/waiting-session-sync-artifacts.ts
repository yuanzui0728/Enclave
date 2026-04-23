import type { CloudWaitingSessionSyncTaskSummary } from "@yinjie/contracts";
import {
  buildRequestsPermalink,
  buildRequestsRouteSearch,
} from "./request-route-search";
import {
  buildCompactWaitingSessionSyncRouteSearch,
  buildWaitingSessionSyncRouteSearch,
  type WaitingSessionSyncRouteSearch,
} from "./waiting-session-sync-route-search";
import { buildWorldsPermalink, buildWorldsRouteSearch } from "./world-route-search";

type WaitingSessionSyncContextGroupLike = {
  context: string;
  total: number;
  failed: number;
  pending: number;
  running: number;
  latestUpdatedAt?: string | null;
  taskTypes: CloudWaitingSessionSyncTaskSummary["taskType"][];
  refreshWorldTarget?: string | null;
};

export type WaitingSessionSyncStatusSummary = {
  failed: number;
  pending: number;
  running: number;
};

export type WaitingSessionSyncArtifactPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type WaitingSessionSyncSnapshotLookup = {
  requestsRoute: ReturnType<typeof buildRequestsRouteSearch>;
  requestsPath: string;
  worldsRoute: ReturnType<typeof buildWorldsRouteSearch>;
  worldsPath: string;
  worldDetailPath?: string;
};

export type WaitingSessionSyncSnapshotTask = CloudWaitingSessionSyncTaskSummary & {
  lookup: WaitingSessionSyncSnapshotLookup;
};

export type WaitingSessionSyncContextGroupArtifact =
  WaitingSessionSyncContextGroupLike & {
    taskTypeLabels: string[];
    focusPath: string;
    worldDetailPath?: string;
    taskIds: string[];
    taskKeys: string[];
    targetValues: string[];
  };

export type WaitingSessionSyncFocusSnapshotInput<TContextGroup, TTargetFocus> = {
  query: string;
  matchingTasks: readonly CloudWaitingSessionSyncTaskSummary[];
  focusedContextGroup: TContextGroup | null;
  focusedTarget: TTargetFocus | null;
};

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

function escapeCsvCell(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }

  return value;
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

export function summarizeWaitingSessionSyncTasks(
  tasks: readonly CloudWaitingSessionSyncTaskSummary[],
): WaitingSessionSyncStatusSummary {
  let failed = 0;
  let pending = 0;
  let running = 0;

  for (const task of tasks) {
    if (task.status === "failed") {
      failed += 1;
    } else if (task.status === "pending") {
      pending += 1;
    } else if (task.status === "running") {
      running += 1;
    }
  }

  return {
    failed,
    pending,
    running,
  };
}

export function buildWaitingSessionSyncSnapshotLookup(
  task: Pick<CloudWaitingSessionSyncTaskSummary, "targetValue" | "taskType">,
): WaitingSessionSyncSnapshotLookup {
  const requestsRoute = buildRequestsRouteSearch({
    query: task.targetValue,
  });
  const worldsRoute = buildWorldsRouteSearch({
    query: task.targetValue,
  });

  return {
    requestsRoute,
    requestsPath: buildRequestsPermalink(requestsRoute),
    worldsRoute,
    worldsPath: buildWorldsPermalink(worldsRoute),
    worldDetailPath:
      task.taskType === "refresh_world"
        ? `/worlds/${encodeURIComponent(task.targetValue)}`
        : undefined,
  };
}

export function serializeWaitingSessionSyncSnapshotTask(
  task: CloudWaitingSessionSyncTaskSummary,
): WaitingSessionSyncSnapshotTask {
  return {
    ...task,
    lookup: buildWaitingSessionSyncSnapshotLookup(task),
  };
}

function buildWaitingSessionSyncFocusPath(
  filters: WaitingSessionSyncRouteSearch,
  context: string,
) {
  return buildRouteSearchPath(
    "/waiting-sync",
    buildCompactWaitingSessionSyncRouteSearch(
      buildWaitingSessionSyncRouteSearch({
        ...filters,
        query: context,
        page: 1,
      }),
    ),
  );
}

export function serializeWaitingSessionSyncContextGroupArtifact(
  group: WaitingSessionSyncContextGroupLike,
  filters: WaitingSessionSyncRouteSearch,
  tasks: readonly CloudWaitingSessionSyncTaskSummary[],
): WaitingSessionSyncContextGroupArtifact {
  const matchingTasks = tasks.filter((task) => task.context === group.context);

  return {
    ...group,
    taskTypeLabels: group.taskTypes.map((taskType) =>
      formatWaitingSessionSyncTaskType(taskType),
    ),
    focusPath: buildWaitingSessionSyncFocusPath(filters, group.context),
    worldDetailPath: group.refreshWorldTarget
      ? `/worlds/${encodeURIComponent(group.refreshWorldTarget)}`
      : undefined,
    taskIds: matchingTasks.map((task) => task.id),
    taskKeys: matchingTasks.map((task) => task.taskKey),
    targetValues: Array.from(
      new Set(matchingTasks.map((task) => task.targetValue)),
    ),
  };
}

export function buildWaitingSessionSyncContextGroupsCsv(
  groups: readonly WaitingSessionSyncContextGroupLike[],
  filters: WaitingSessionSyncRouteSearch,
  tasks: readonly CloudWaitingSessionSyncTaskSummary[],
) {
  const serializedGroups = groups.map((group) =>
    serializeWaitingSessionSyncContextGroupArtifact(group, filters, tasks),
  );
  const headers = [
    "context",
    "total",
    "failed",
    "pending",
    "running",
    "taskTypes",
    "latestUpdatedAt",
    "refreshWorldTarget",
    "focusPath",
    "worldDetailPath",
    "taskIds",
    "taskKeys",
    "targetValues",
  ];
  const rows = serializedGroups.map((group) => [
    group.context,
    String(group.total),
    String(group.failed),
    String(group.pending),
    String(group.running),
    group.taskTypeLabels.join(" | "),
    group.latestUpdatedAt ?? "",
    group.refreshWorldTarget ?? "",
    group.focusPath,
    group.worldDetailPath ?? "",
    group.taskIds.join(" | "),
    group.taskKeys.join(" | "),
    group.targetValues.join(" | "),
  ]);

  return [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvCell(value)).join(","))
    .join("\n");
}

export function buildWaitingSessionSyncTasksCsv(
  tasks: readonly CloudWaitingSessionSyncTaskSummary[],
) {
  const headers = [
    "id",
    "taskKey",
    "taskType",
    "status",
    "attempt",
    "maxAttempts",
    "targetValue",
    "context",
    "availableAt",
    "updatedAt",
    "finishedAt",
    "lastError",
    "leaseOwner",
    "requestsPath",
    "worldsPath",
    "worldDetailPath",
  ];
  const rows = tasks.map((task) => {
    const lookup = buildWaitingSessionSyncSnapshotLookup(task);
    return [
      task.id,
      task.taskKey,
      task.taskType,
      task.status,
      String(task.attempt),
      String(task.maxAttempts),
      task.targetValue,
      task.context,
      task.availableAt,
      task.updatedAt,
      task.finishedAt ?? "",
      task.lastError ?? "",
      task.leaseOwner ?? "",
      lookup.requestsPath,
      lookup.worldsPath,
      lookup.worldDetailPath ?? "",
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvCell(value)).join(","))
    .join("\n");
}

export function createWaitingSessionSyncContextSnapshotPayload({
  generatedAt,
  filters,
  context,
  tasks,
  focusedContextGroup,
}: {
  generatedAt: string;
  filters: WaitingSessionSyncRouteSearch;
  context: string;
  tasks: readonly CloudWaitingSessionSyncTaskSummary[];
  focusedContextGroup: WaitingSessionSyncContextGroupLike;
}) {
  return {
    generatedAt,
    route: "waiting-sync" as const,
    mode: "context" as const,
    filters: {
      ...filters,
      query: context,
    },
    visibleSummary: summarizeWaitingSessionSyncTasks(tasks),
    focus: {
      context: focusedContextGroup,
      target: null,
      matchingTaskCount: tasks.length,
    },
    tasks: tasks.map(serializeWaitingSessionSyncSnapshotTask),
  };
}

export function createWaitingSessionSyncFilteredSnapshotPayload({
  generatedAt,
  filters,
  pagination,
  visibleSummary,
  contextGroups,
  tasks,
}: {
  generatedAt: string;
  filters: WaitingSessionSyncRouteSearch;
  pagination: WaitingSessionSyncArtifactPagination;
  visibleSummary: WaitingSessionSyncStatusSummary;
  contextGroups: readonly WaitingSessionSyncContextGroupLike[];
  tasks: readonly CloudWaitingSessionSyncTaskSummary[];
}) {
  return {
    generatedAt,
    route: "waiting-sync" as const,
    mode: "filtered" as const,
    filters,
    pagination,
    visibleSummary,
    contextGroups,
    tasks: tasks.map(serializeWaitingSessionSyncSnapshotTask),
  };
}

export function createWaitingSessionSyncContextGroupsSnapshotPayload({
  generatedAt,
  filters,
  visibleSummary,
  pagination,
  contextGroups,
  tasks,
}: {
  generatedAt: string;
  filters: WaitingSessionSyncRouteSearch;
  visibleSummary: WaitingSessionSyncStatusSummary;
  pagination: WaitingSessionSyncArtifactPagination;
  contextGroups: readonly WaitingSessionSyncContextGroupLike[];
  tasks: readonly CloudWaitingSessionSyncTaskSummary[];
}) {
  return {
    generatedAt,
    route: "waiting-sync" as const,
    mode: "context-groups" as const,
    filters,
    visibleSummary,
    pagination,
    groupCount: contextGroups.length,
    contextGroups: contextGroups.map((group) =>
      serializeWaitingSessionSyncContextGroupArtifact(group, filters, tasks),
    ),
  };
}

export function createWaitingSessionSyncFocusSnapshotPayload<
  TContextGroup,
  TTargetFocus,
>({
  generatedAt,
  filters,
  visibleSummary,
  focusSnapshot,
}: {
  generatedAt: string;
  filters: WaitingSessionSyncRouteSearch;
  visibleSummary: WaitingSessionSyncStatusSummary;
  focusSnapshot: WaitingSessionSyncFocusSnapshotInput<
    TContextGroup,
    TTargetFocus
  >;
}) {
  return {
    generatedAt,
    route: "waiting-sync" as const,
    mode: "focus" as const,
    filters,
    visibleSummary,
    focus: {
      query: focusSnapshot.query,
      focusedContextGroup: focusSnapshot.focusedContextGroup,
      focusedTarget: focusSnapshot.focusedTarget,
      matchingTaskCount: focusSnapshot.matchingTasks.length,
    },
    tasks: focusSnapshot.matchingTasks.map(
      serializeWaitingSessionSyncSnapshotTask,
    ),
  };
}
