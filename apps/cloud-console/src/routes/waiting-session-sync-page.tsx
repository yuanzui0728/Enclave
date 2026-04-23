import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { CloudWaitingSessionSyncTaskSummary } from "@yinjie/contracts";
import {
  CloudAdminErrorBlock,
  showCloudAdminErrorNotice,
} from "../components/cloud-admin-error-block";
import { ConsoleConfirmDialog } from "../components/console-confirm-dialog";
import { RequestsPermalinkLink } from "../components/requests-permalink-link";
import { useConsoleNotice } from "../components/console-notice";
import {
  getWaitingSessionSyncActionLinkClassName,
  WaitingSessionSyncActionAnchor,
  WaitingSessionSyncActionButton,
  WaitingSessionSyncArtifactSummary,
  WaitingSessionSyncCountChip,
  WaitingSessionSyncFilterControls,
  WaitingSessionSyncPaginationControls,
  WaitingSessionSyncStatusPills,
  WaitingSessionSyncTaskStatusBadge,
} from "../components/waiting-session-sync-controls";
import { WorldsPermalinkLink } from "../components/worlds-permalink-link";
import {
  cloudAdminApi,
  getCloudAdminApiErrorRequestId,
} from "../lib/cloud-admin-api";
import {
  buildWaitingSessionSyncRouteSearch,
  DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH,
  WAITING_SESSION_SYNC_PAGE_SIZE_OPTIONS,
  WAITING_SESSION_SYNC_STATUS_FILTERS,
  WAITING_SESSION_SYNC_TASK_TYPE_FILTERS,
  buildWaitingSessionSyncArtifactFilename,
  buildWaitingSessionSyncContextReviewCopy,
  buildWaitingSessionSyncContextGroupsCsv,
  createWaitingSessionSyncContextGroupsSnapshotPayload,
  buildWaitingSessionSyncPermalink,
  buildWaitingSessionSyncTaskReviewCopy,
  createWaitingSessionSyncContextSnapshotPayload,
  createWaitingSessionSyncCopyNotice,
  createWaitingSessionSyncClearTaskNotice,
  createWaitingSessionSyncContextGroupsCsvNotice,
  createWaitingSessionSyncContextGroupsSnapshotNotice,
  createWaitingSessionSyncFilteredSnapshotPayload,
  createWaitingSessionSyncFilteredClearNotice,
  createWaitingSessionSyncFilteredReplayNotice,
  createWaitingSessionSyncFocusSnapshotPayload,
  createWaitingSessionSyncReplayTaskNotice,
  createWaitingSessionSyncSnapshotNotice,
  describeWaitingSessionSyncBatchActionSummary,
  describeWaitingSessionSyncFocusGuardCopy,
  serializeWaitingSessionSyncContextGroupArtifact,
  summarizeWaitingSessionSyncTasks,
  type WaitingSessionSyncRouteSearch,
  buildWaitingSessionSyncTasksCsv,
} from "../lib/waiting-session-sync-helpers";
import { copyTextToClipboard } from "../lib/clipboard";
import {
  showRequestScopedNotice,
  showRequestScopedNoticeAndInvalidate,
  type RequestScopedNotice,
} from "../lib/request-scoped-notice";
import { downloadJsonFile, downloadTextFile } from "../lib/download";

type ClearConfirmState =
  | {
      mode: "single";
      task: CloudWaitingSessionSyncTaskSummary;
    }
  | {
      mode: "filtered";
    }
  | null;

type WaitingSessionSyncContextGroup = {
  context: string;
  total: number;
  failed: number;
  pending: number;
  running: number;
  latestUpdatedAt?: string | null;
  taskTypes: CloudWaitingSessionSyncTaskSummary["taskType"][];
  refreshWorldTarget?: string | null;
};

type WaitingSessionSyncStatusSummary = {
  failed: number;
  pending: number;
  running: number;
};

type WaitingSessionSyncTargetFocus = WaitingSessionSyncStatusSummary & {
  targetValue: string;
  total: number;
  taskTypes: CloudWaitingSessionSyncTaskSummary["taskType"][];
  latestUpdatedAt?: string | null;
};

type WaitingSessionSyncFocusSnapshot = {
  query: string;
  matchingTasks: CloudWaitingSessionSyncTaskSummary[];
  focusedContextGroup: WaitingSessionSyncContextGroup | null;
  focusedTarget: WaitingSessionSyncTargetFocus | null;
};

type WaitingSessionSyncTaskOperationReceiptKind =
  | "task-replay"
  | "task-clear";

type WaitingSessionSyncTaskOperationReceipt = {
  kind: WaitingSessionSyncTaskOperationReceiptKind;
  tone: RequestScopedNotice["tone"];
  message: string;
  createdAt: string;
  requestId?: string | null;
  taskId: string;
  taskKey: string;
  taskType: CloudWaitingSessionSyncTaskSummary["taskType"];
  context: string;
  targetValue: string;
  reviewPath: string;
};

const WAITING_SESSION_SYNC_TASK_RECEIPT_LIMIT = 12;
const WAITING_SESSION_SYNC_VISIBLE_TASK_RECEIPT_LIMIT = 3;

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

function formatTaskType(taskType: CloudWaitingSessionSyncTaskSummary["taskType"]) {
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

function formatStatus(status: CloudWaitingSessionSyncTaskSummary["status"]) {
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

function formatWaitingSessionSyncTaskReceiptLabel(
  kind: WaitingSessionSyncTaskOperationReceiptKind,
) {
  switch (kind) {
    case "task-clear":
      return "Clear task";
    case "task-replay":
    default:
      return "Replay task";
  }
}

function getWaitingSessionSyncTaskReceiptTone(
  tone: RequestScopedNotice["tone"],
) {
  switch (tone) {
    case "success":
      return "border-emerald-300/40 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    case "danger":
      return "border-rose-300/40 bg-rose-500/10 text-rose-200";
    case "info":
    default:
      return "border-sky-300/40 bg-sky-500/10 text-sky-100";
  }
}

function prependWaitingSessionSyncTaskReceipt(
  previous: WaitingSessionSyncTaskOperationReceipt[],
  receipt: Omit<WaitingSessionSyncTaskOperationReceipt, "createdAt">,
  limit = WAITING_SESSION_SYNC_TASK_RECEIPT_LIMIT,
  createdAt = new Date().toISOString(),
) {
  return [
    {
      ...receipt,
      createdAt,
    },
    ...previous,
  ].slice(0, limit);
}

function buildWaitingSessionSyncContextGroups(
  tasks: readonly CloudWaitingSessionSyncTaskSummary[],
): WaitingSessionSyncContextGroup[] {
  const groups = new Map<string, WaitingSessionSyncContextGroup>();

  for (const task of tasks) {
    const existing = groups.get(task.context);
    if (existing) {
      existing.total += 1;
      existing.latestUpdatedAt =
        existing.latestUpdatedAt &&
        new Date(existing.latestUpdatedAt).getTime() >
          new Date(task.updatedAt).getTime()
          ? existing.latestUpdatedAt
          : task.updatedAt;
      if (!existing.taskTypes.includes(task.taskType)) {
        existing.taskTypes.push(task.taskType);
      }
      if (!existing.refreshWorldTarget && task.taskType === "refresh_world") {
        existing.refreshWorldTarget = task.targetValue;
      }
      if (task.status === "failed") {
        existing.failed += 1;
      } else if (task.status === "pending") {
        existing.pending += 1;
      } else if (task.status === "running") {
        existing.running += 1;
      }
      continue;
    }

    groups.set(task.context, {
      context: task.context,
      total: 1,
      failed: task.status === "failed" ? 1 : 0,
      pending: task.status === "pending" ? 1 : 0,
      running: task.status === "running" ? 1 : 0,
      latestUpdatedAt: task.updatedAt,
      taskTypes: [task.taskType],
      refreshWorldTarget:
        task.taskType === "refresh_world" ? task.targetValue : null,
    });
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (right.failed !== left.failed) {
      return right.failed - left.failed;
    }
    if (right.running !== left.running) {
      return right.running - left.running;
    }
    if (right.total !== left.total) {
      return right.total - left.total;
    }
    return left.context.localeCompare(right.context);
  });
}

function buildWaitingSessionSyncTargetFocus(
  targetValue: string,
  tasks: readonly CloudWaitingSessionSyncTaskSummary[],
): WaitingSessionSyncTargetFocus | null {
  if (tasks.length === 0) {
    return null;
  }

  const taskTypes = new Set<CloudWaitingSessionSyncTaskSummary["taskType"]>();
  let latestUpdatedAt: string | null = tasks[0]?.updatedAt ?? null;

  for (const task of tasks) {
    taskTypes.add(task.taskType);
    if (
      !latestUpdatedAt ||
      new Date(task.updatedAt).getTime() > new Date(latestUpdatedAt).getTime()
    ) {
      latestUpdatedAt = task.updatedAt;
    }
  }

  return {
    targetValue,
    total: tasks.length,
    latestUpdatedAt,
    taskTypes: Array.from(taskTypes),
    ...summarizeWaitingSessionSyncTasks(tasks),
  };
}

function describeContextGroupTaskTypes(
  taskTypes: readonly CloudWaitingSessionSyncTaskSummary["taskType"][],
) {
  return taskTypes.map((taskType) => formatTaskType(taskType)).join(" · ");
}

export function WaitingSessionSyncPage() {
  const navigate = useNavigate({ from: "/waiting-sync" });
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();
  const filters = useSearch({ from: "/waiting-sync" });
  const [clearConfirmState, setClearConfirmState] =
    useState<ClearConfirmState>(null);
  const [taskOperationReceipts, setTaskOperationReceipts] = useState<
    WaitingSessionSyncTaskOperationReceipt[]
  >([]);
  const status = filters.status;
  const taskType = filters.taskType;
  const query = filters.query;
  const reviewedContext = filters.reviewContext.trim();
  const reviewedTaskId = filters.reviewTaskId.trim();
  const waitingSyncQueryKey = ["cloud-console", "waiting-sync"] as const;

  function showWaitingSessionSyncNotice(notice: RequestScopedNotice) {
    showRequestScopedNotice(showNotice, notice);
  }

  function showWaitingSessionSyncMutationNotice(notice: RequestScopedNotice) {
    showRequestScopedNoticeAndInvalidate(showNotice, notice, {
      queryClient,
      queryKey: waitingSyncQueryKey,
    });
  }

  function showWaitingSessionSyncErrorNotice(error: unknown) {
    showCloudAdminErrorNotice(showNotice, error);
  }

  function getWaitingSessionSyncErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return "Waiting sync task action failed.";
  }

  function updateFilters(next: Partial<WaitingSessionSyncRouteSearch>) {
    void navigate({
      replace: true,
      search: (previous) =>
        buildWaitingSessionSyncRouteSearch({
          ...previous,
          ...next,
        }),
    });
  }

  const tasksQuery = useQuery({
    queryKey: [
      "cloud-console",
      "waiting-sync",
      status,
      taskType,
      query,
      filters.page,
      filters.pageSize,
    ],
    queryFn: () =>
      cloudAdminApi.listWaitingSessionSyncTasks({
        status: status === "all" ? undefined : status,
        taskType: taskType === "all" ? undefined : taskType,
        query: query.trim() || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
    refetchInterval: 15_000,
  });

  function recordTaskOperationReceipt(
    kind: WaitingSessionSyncTaskOperationReceiptKind,
    task: Pick<
      CloudWaitingSessionSyncTaskSummary,
      "id" | "taskKey" | "taskType" | "context" | "targetValue"
    >,
    outcome: {
      message: string;
      tone: RequestScopedNotice["tone"];
      requestId?: string | null;
    },
  ) {
    setTaskOperationReceipts((previous) =>
      prependWaitingSessionSyncTaskReceipt(previous, {
        kind,
        tone: outcome.tone,
        message: outcome.message,
        requestId: outcome.requestId,
        taskId: task.id,
        taskKey: task.taskKey,
        taskType: task.taskType,
        context: task.context,
        targetValue: task.targetValue,
        reviewPath: buildWaitingSessionSyncPermalink({
          ...filters,
          reviewContext: task.context,
          reviewTaskId: task.id,
        }),
      }),
    );
  }

  const replayTaskMutation = useMutation({
    mutationFn: (task: CloudWaitingSessionSyncTaskSummary) =>
      cloudAdminApi.replayFailedWaitingSessionSyncTasksWithMeta([task.id]),
    onSuccess: (response, task) => {
      const notice = createWaitingSessionSyncReplayTaskNotice(response);
      recordTaskOperationReceipt("task-replay", task, notice);
      showWaitingSessionSyncMutationNotice(notice);
    },
    onError: (error, task) => {
      recordTaskOperationReceipt("task-replay", task, {
        message: getWaitingSessionSyncErrorMessage(error),
        tone: "danger",
        requestId: getCloudAdminApiErrorRequestId(error),
      });
      showWaitingSessionSyncErrorNotice(error);
    },
  });

  const clearTaskMutation = useMutation({
    mutationFn: (task: CloudWaitingSessionSyncTaskSummary) =>
      cloudAdminApi.clearFailedWaitingSessionSyncTasksWithMeta([task.id]),
    onSuccess: (response, task) => {
      const notice = createWaitingSessionSyncClearTaskNotice(response);
      recordTaskOperationReceipt("task-clear", task, notice);
      showWaitingSessionSyncMutationNotice(notice);
      setClearConfirmState(null);
    },
    onError: (error, task) => {
      recordTaskOperationReceipt("task-clear", task, {
        message: getWaitingSessionSyncErrorMessage(error),
        tone: "danger",
        requestId: getCloudAdminApiErrorRequestId(error),
      });
      showWaitingSessionSyncErrorNotice(error);
    },
  });

  const replayFilteredMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.replayFilteredFailedWaitingSessionSyncTasksWithMeta({
        taskType: taskType === "all" ? undefined : taskType,
        query: query.trim() || undefined,
      }),
    onSuccess: (response) => {
      showWaitingSessionSyncMutationNotice(
        createWaitingSessionSyncFilteredReplayNotice(response),
      );
    },
    onError: (error) => {
      showWaitingSessionSyncErrorNotice(error);
    },
  });

  const clearFilteredMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.clearFilteredFailedWaitingSessionSyncTasksWithMeta({
        taskType: taskType === "all" ? undefined : taskType,
        query: query.trim() || undefined,
      }),
    onSuccess: (response) => {
      showWaitingSessionSyncMutationNotice(
        createWaitingSessionSyncFilteredClearNotice(response),
      );
      setClearConfirmState(null);
    },
    onError: (error) => {
      showWaitingSessionSyncErrorNotice(error);
    },
  });

  const tasks = tasksQuery.data?.items ?? [];
  const visibleSummary = useMemo(
    () => summarizeWaitingSessionSyncTasks(tasks),
    [tasks],
  );
  const normalizedQuery = query.trim();
  const contextGroups = useMemo(
    () => buildWaitingSessionSyncContextGroups(tasks),
    [tasks],
  );
  const focusedContextGroup =
    normalizedQuery.length === 0
      ? null
      : contextGroups.find((group) => group.context === normalizedQuery) ?? null;
  const focusedTargetTasks = useMemo(
    () =>
      normalizedQuery.length === 0
        ? []
        : tasks.filter((task) => task.targetValue === normalizedQuery),
    [normalizedQuery, tasks],
  );
  const focusedTarget = useMemo(
    () => buildWaitingSessionSyncTargetFocus(normalizedQuery, focusedTargetTasks),
    [focusedTargetTasks, normalizedQuery],
  );
  const focusSnapshot = useMemo<WaitingSessionSyncFocusSnapshot | null>(() => {
    if (normalizedQuery.length === 0) {
      return null;
    }

    const matchingTasks = tasks.filter(
      (task) =>
        task.context === normalizedQuery || task.targetValue === normalizedQuery,
    );

    if (matchingTasks.length === 0 && !focusedContextGroup && !focusedTarget) {
      return null;
    }

    return {
      query: normalizedQuery,
      matchingTasks,
      focusedContextGroup,
      focusedTarget,
    };
  }, [focusedContextGroup, focusedTarget, normalizedQuery, tasks]);
  const reviewedContextGroup = useMemo(
    () =>
      reviewedContext.length > 0
        ? contextGroups.find((group) => group.context === reviewedContext) ?? null
        : null,
    [contextGroups, reviewedContext],
  );
  const reviewedContextTasks = useMemo(
    () =>
      reviewedContextGroup
        ? tasks.filter((task) => task.context === reviewedContextGroup.context)
        : [],
    [reviewedContextGroup, tasks],
  );
  const reviewedContextSummary = useMemo(
    () => summarizeWaitingSessionSyncTasks(reviewedContextTasks),
    [reviewedContextTasks],
  );
  const visibleHighlightedTaskReceipts = useMemo(
    () =>
      reviewedTaskId.length === 0
        ? []
        : taskOperationReceipts
            .filter(
              (receipt) =>
                receipt.taskId === reviewedTaskId &&
                (reviewedContext.length === 0 ||
                  receipt.context === reviewedContext),
            )
            .slice(0, WAITING_SESSION_SYNC_VISIBLE_TASK_RECEIPT_LIMIT),
    [reviewedContext, reviewedTaskId, taskOperationReceipts],
  );
  const highlightedReviewedTask = useMemo(
    () =>
      reviewedTaskId.length > 0
        ? reviewedContextTasks.find((task) => task.id === reviewedTaskId) ?? null
        : null,
    [reviewedContextTasks, reviewedTaskId],
  );
  const latestHighlightedTaskReceipt = visibleHighlightedTaskReceipts[0] ?? null;
  const reviewedContextArtifact = useMemo(
    () =>
      reviewedContextGroup
        ? serializeWaitingSessionSyncContextGroupArtifact(
            reviewedContextGroup,
            filters,
            tasks,
          )
        : null,
    [filters, reviewedContextGroup, tasks],
  );
  const reviewSectionContext =
    reviewedContextGroup?.context ??
    latestHighlightedTaskReceipt?.context ??
    reviewedContext;
  const showReviewedContextSection =
    reviewSectionContext.length > 0 &&
    (reviewedContextGroup !== null ||
      reviewedContextTasks.length > 0 ||
      latestHighlightedTaskReceipt !== null);

  const filteredBatchActionsEnabled = status === "all" || status === "failed";
  const batchActionSummary = describeWaitingSessionSyncBatchActionSummary({
    actionsEnabled: filteredBatchActionsEnabled,
    taskTypeLabel: taskType === "all" ? "All" : formatTaskType(taskType),
    query,
  });

  const clearDialogOpen = clearConfirmState !== null;
  const clearDialogPending =
    clearConfirmState?.mode === "single"
      ? clearTaskMutation.isPending
      : clearFilteredMutation.isPending;
  const currentPermalink = useMemo(
    () => buildWaitingSessionSyncPermalink(filters),
    [filters],
  );

  function buildReviewedTaskPermalink(task: CloudWaitingSessionSyncTaskSummary) {
    return buildWaitingSessionSyncPermalink({
      ...filters,
      reviewContext: reviewedContextGroup?.context ?? task.context,
      reviewTaskId: task.id,
    });
  }

  function clearVisibleHighlightedTaskReceipts() {
    if (reviewedTaskId.length === 0) {
      return;
    }

    setTaskOperationReceipts((previous) =>
      previous.filter((receipt) => receipt.taskId !== reviewedTaskId),
    );
  }

  function exportContextSnapshot(group: WaitingSessionSyncContextGroup) {
    const contextTasks = tasks.filter((task) => task.context === group.context);
    const downloaded = downloadJsonFile(
      buildWaitingSessionSyncArtifactFilename({
        mode: "context",
        filters,
        query: group.context,
        extension: "json",
      }),
      createWaitingSessionSyncContextSnapshotPayload({
        generatedAt: new Date().toISOString(),
        filters,
        context: group.context,
        tasks: contextTasks,
        focusedContextGroup: group,
      }),
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncSnapshotNotice({
        mode: "context",
        downloaded,
        taskCount: contextTasks.length,
      }),
    );
  }

  function exportContextCsv(group: WaitingSessionSyncContextGroup) {
    const contextTasks = tasks.filter((task) => task.context === group.context);
    const downloaded = downloadTextFile(
      buildWaitingSessionSyncArtifactFilename({
        mode: "context",
        filters,
        query: group.context,
        extension: "csv",
      }),
      buildWaitingSessionSyncTasksCsv(contextTasks),
      "text/csv;charset=utf-8",
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncSnapshotNotice({
        mode: "context",
        format: "csv",
        downloaded,
        taskCount: contextTasks.length,
      }),
    );
  }

  function exportFilteredSnapshot() {
    const downloaded = downloadJsonFile(
      buildWaitingSessionSyncArtifactFilename({
        mode: "filtered",
        filters,
        extension: "json",
      }),
      createWaitingSessionSyncFilteredSnapshotPayload({
        generatedAt: new Date().toISOString(),
        filters,
        pagination: {
          page: tasksQuery.data?.page ?? filters.page,
          pageSize: tasksQuery.data?.pageSize ?? filters.pageSize,
          total: tasksQuery.data?.total ?? 0,
          totalPages: tasksQuery.data?.totalPages ?? 1,
        },
        visibleSummary,
        contextGroups,
        tasks,
      }),
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncSnapshotNotice({
        mode: "filtered",
        downloaded,
        taskCount: tasks.length,
      }),
    );
  }

  function exportFilteredCsv() {
    const downloaded = downloadTextFile(
      buildWaitingSessionSyncArtifactFilename({
        mode: "filtered",
        filters,
        extension: "csv",
      }),
      buildWaitingSessionSyncTasksCsv(tasks),
      "text/csv;charset=utf-8",
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncSnapshotNotice({
        mode: "filtered",
        format: "csv",
        downloaded,
        taskCount: tasks.length,
      }),
    );
  }

  function exportContextGroupsCsv() {
    const downloaded = downloadTextFile(
      buildWaitingSessionSyncArtifactFilename({
        mode: "context-groups",
        filters,
        extension: "csv",
      }),
      buildWaitingSessionSyncContextGroupsCsv(contextGroups, filters, tasks),
      "text/csv;charset=utf-8",
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncContextGroupsCsvNotice({
        downloaded,
        groupCount: contextGroups.length,
      }),
    );
  }

  function exportContextGroupsSnapshot() {
    const downloaded = downloadJsonFile(
      buildWaitingSessionSyncArtifactFilename({
        mode: "context-groups",
        filters,
        extension: "json",
      }),
      createWaitingSessionSyncContextGroupsSnapshotPayload({
        generatedAt: new Date().toISOString(),
        filters,
        visibleSummary,
        pagination: {
          page: tasksQuery.data?.page ?? filters.page,
          pageSize: tasksQuery.data?.pageSize ?? filters.pageSize,
          total: tasksQuery.data?.total ?? 0,
          totalPages: tasksQuery.data?.totalPages ?? 1,
        },
        contextGroups,
        tasks,
      }),
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncContextGroupsSnapshotNotice({
        downloaded,
        groupCount: contextGroups.length,
      }),
    );
  }

  function exportFocusSnapshot() {
    if (!focusSnapshot) {
      return;
    }

    const downloaded = downloadJsonFile(
      buildWaitingSessionSyncArtifactFilename({
        mode: "focus",
        filters,
        extension: "json",
      }),
      createWaitingSessionSyncFocusSnapshotPayload({
        generatedAt: new Date().toISOString(),
        filters,
        visibleSummary,
        focusSnapshot,
      }),
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncSnapshotNotice({
        mode: "focus",
        downloaded,
        taskCount: focusSnapshot.matchingTasks.length,
      }),
    );
  }

  function exportFocusCsv() {
    if (!focusSnapshot) {
      return;
    }

    const downloaded = downloadTextFile(
      buildWaitingSessionSyncArtifactFilename({
        mode: "focus",
        filters,
        extension: "csv",
      }),
      buildWaitingSessionSyncTasksCsv(focusSnapshot.matchingTasks),
      "text/csv;charset=utf-8",
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncSnapshotNotice({
        mode: "focus",
        format: "csv",
        downloaded,
        taskCount: focusSnapshot.matchingTasks.length,
      }),
    );
  }

  async function copyReviewedContext() {
    if (!reviewedContextArtifact) {
      return;
    }

    const copied = await copyTextToClipboard(
      buildWaitingSessionSyncContextReviewCopy({
        artifact: reviewedContextArtifact,
        reviewPath: currentPermalink,
        summary: reviewedContextSummary,
      }),
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncCopyNotice({
        copied,
        subject: "review-context",
      }),
    );
  }

  async function copyWaitingSessionSyncPermalink() {
    const absolutePermalink =
      typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}${currentPermalink}`
        : currentPermalink;
    const copied = await copyTextToClipboard(absolutePermalink);

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncCopyNotice({
        copied,
        subject: "permalink",
      }),
    );
  }

  async function copyReviewedTask(task: CloudWaitingSessionSyncTaskSummary) {
    const copied = await copyTextToClipboard(
      buildWaitingSessionSyncTaskReviewCopy({
        reviewPath: buildReviewedTaskPermalink(task),
        task,
      }),
    );

    showWaitingSessionSyncNotice(
      createWaitingSessionSyncCopyNotice({
        copied,
        subject: "task-context",
      }),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-overlay)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              Durable Recovery
            </div>
            <h1 className="mt-2 text-2xl font-semibold">Waiting session sync</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--text-secondary)]">
              Inspect durable waiting-session compensation tasks, replay exhausted
              retries, and clear stale failures without leaving the console.
            </p>
          </div>

          <div className="grid min-w-[240px] grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
              <div className="text-[color:var(--text-muted)]">Total results</div>
              <div className="mt-2 text-2xl font-semibold">
                {tasksQuery.data?.total ?? 0}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
              <div className="text-[color:var(--text-muted)]">Visible failed</div>
              <div className="mt-2 text-2xl font-semibold text-rose-200">
                {visibleSummary.failed}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
              <div className="text-[color:var(--text-muted)]">Visible pending</div>
              <div className="mt-2 text-2xl font-semibold text-amber-100">
                {visibleSummary.pending}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
              <div className="text-[color:var(--text-muted)]">Visible running</div>
              <div className="mt-2 text-2xl font-semibold text-sky-100">
                {visibleSummary.running}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[28px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-overlay)]">
          <WaitingSessionSyncFilterControls
            status={status}
            taskType={taskType}
            query={query}
            statusOptions={WAITING_SESSION_SYNC_STATUS_FILTERS}
            taskTypeOptions={WAITING_SESSION_SYNC_TASK_TYPE_FILTERS}
            getStatusLabel={(option) =>
              option === "all" ? "All statuses" : formatStatus(option)
            }
            getTaskTypeLabel={(option) =>
              option === "all" ? "All task types" : formatTaskType(option)
            }
            onStatusChange={(nextStatus) =>
              updateFilters({
                status: nextStatus,
                page: 1,
              })
            }
            onTaskTypeChange={(nextTaskType) =>
              updateFilters({
                taskType: nextTaskType,
                page: 1,
              })
            }
            onQueryChange={(nextQuery) =>
              updateFilters({ query: nextQuery, page: 1 })
            }
          />
        </div>

        <div className="rounded-[28px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-overlay)]">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            Batch actions
          </div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            {batchActionSummary}
          </div>

          <div className="mt-4 space-y-3">
            <WaitingSessionSyncActionButton
              tone="brand"
              size="regular"
              className="w-full"
              disabled={!filteredBatchActionsEnabled || replayFilteredMutation.isPending}
              onClick={() => replayFilteredMutation.mutate()}
            >
              {replayFilteredMutation.isPending
                ? "Queuing replay..."
                : "Replay matching failed tasks"}
            </WaitingSessionSyncActionButton>
            <WaitingSessionSyncActionButton
              tone="danger"
              size="regular"
              className="w-full"
              disabled={!filteredBatchActionsEnabled || clearFilteredMutation.isPending}
              onClick={() => setClearConfirmState({ mode: "filtered" })}
            >
              Clear matching failed tasks
            </WaitingSessionSyncActionButton>
            <WaitingSessionSyncActionButton
              tone="neutral"
              size="regular"
              className="w-full"
              disabled={tasksQuery.isLoading || tasks.length === 0}
              onClick={exportFilteredSnapshot}
            >
              Export filtered snapshot
            </WaitingSessionSyncActionButton>
            <WaitingSessionSyncActionButton
              tone="neutral"
              size="regular"
              className="w-full"
              disabled={tasksQuery.isLoading || tasks.length === 0}
              onClick={exportFilteredCsv}
            >
              Export filtered CSV
            </WaitingSessionSyncActionButton>
            <WaitingSessionSyncActionButton
              tone="neutral"
              size="regular"
              className="w-full"
              disabled={tasksQuery.isLoading || contextGroups.length === 0}
              onClick={exportContextGroupsSnapshot}
            >
              Export context groups snapshot
            </WaitingSessionSyncActionButton>
            <WaitingSessionSyncActionButton
              tone="neutral"
              size="regular"
              className="w-full"
              disabled={tasksQuery.isLoading || contextGroups.length === 0}
              onClick={exportContextGroupsCsv}
            >
              Export context groups CSV
            </WaitingSessionSyncActionButton>
          </div>

          <div className="mt-4 text-xs leading-6 text-[color:var(--text-muted)]">
            {describeWaitingSessionSyncFocusGuardCopy({
              query: normalizedQuery,
              matchingTaskCount: focusSnapshot?.matchingTasks.length,
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <WaitingSessionSyncActionButton
              tone="neutral"
              variant="ghost"
              size="regular"
              className="underline decoration-dotted underline-offset-4"
              onClick={copyWaitingSessionSyncPermalink}
            >
              Copy waiting sync permalink
            </WaitingSessionSyncActionButton>
            <WaitingSessionSyncActionAnchor
              tone="neutral"
              variant="ghost"
              size="regular"
              href={currentPermalink}
              target="_blank"
              rel="noreferrer"
            >
              Open waiting sync permalink
            </WaitingSessionSyncActionAnchor>
            <WaitingSessionSyncActionButton
              tone="neutral"
              variant="ghost"
              size="regular"
              className="underline decoration-dotted underline-offset-4"
              onClick={() =>
                updateFilters(DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH)
              }
            >
              Reset filters
            </WaitingSessionSyncActionButton>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-overlay)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              Context groups
            </div>
            <div className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--text-secondary)]">
              Visible contexts from the current page. Use these cards to focus a
              single recovery path before replaying or clearing failed tasks.
            </div>
          </div>

          {focusedContextGroup ? (
            <div className="rounded-2xl border border-sky-300/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-50">
              <div className="font-medium">Focused context</div>
              <div className="mt-1 break-all font-mono text-xs">
                {focusedContextGroup.context}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <WaitingSessionSyncActionButton
                  tone="sky"
                  disabled={!focusSnapshot}
                  onClick={exportFocusSnapshot}
                >
                  Export focus snapshot
                </WaitingSessionSyncActionButton>
                <WaitingSessionSyncActionButton
                  tone="sky"
                  disabled={!focusSnapshot}
                  onClick={exportFocusCsv}
                >
                  Export focus CSV
                </WaitingSessionSyncActionButton>
                <WaitingSessionSyncActionButton
                  tone="sky"
                  variant="ghost"
                  className="uppercase tracking-[0.18em]"
                  onClick={() => updateFilters({ query: "", page: 1 })}
                >
                  Clear context focus
                </WaitingSessionSyncActionButton>
              </div>
            </div>
          ) : null}

          {focusedTarget ? (
            <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
              <div className="font-medium">Focused target</div>
              <div className="mt-1 break-all font-mono text-xs">
                {focusedTarget.targetValue}
              </div>
              <div className="mt-2 text-xs text-emerald-100/90">
                {focusedTarget.total} visible task(s) · latest update{" "}
                {formatDateTime(focusedTarget.latestUpdatedAt)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <WaitingSessionSyncActionButton
                  tone="emerald"
                  disabled={!focusSnapshot}
                  onClick={exportFocusSnapshot}
                >
                  Export focus snapshot
                </WaitingSessionSyncActionButton>
                <WaitingSessionSyncActionButton
                  tone="emerald"
                  disabled={!focusSnapshot}
                  onClick={exportFocusCsv}
                >
                  Export focus CSV
                </WaitingSessionSyncActionButton>
                <RequestsPermalinkLink
                  search={{
                    query: focusedTarget.targetValue,
                  }}
                  className={getWaitingSessionSyncActionLinkClassName({
                    tone: "emerald",
                  })}
                >
                  Open requests
                </RequestsPermalinkLink>
                <WorldsPermalinkLink
                  search={{
                    query: focusedTarget.targetValue,
                  }}
                  className={getWaitingSessionSyncActionLinkClassName({
                    tone: "emerald",
                  })}
                >
                  Open worlds
                </WorldsPermalinkLink>
              </div>
            </div>
          ) : null}
        </div>

        {contextGroups.length === 0 ? (
          <div className="mt-4 text-sm text-[color:var(--text-secondary)]">
            No visible contexts on this page yet.
          </div>
        ) : (
          <>
            {showReviewedContextSection ? (
              <section
                aria-label="Context task review"
                className="mt-5 rounded-[26px] border border-sky-300/30 bg-sky-500/10 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-sky-100/80">
                      Context task review
                    </div>
                    <h2 className="mt-2 text-lg font-medium text-sky-50">
                      Reviewing {reviewedContextTasks.length} visible task(s) from{" "}
                      {reviewSectionContext}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-sky-50/85">
                      Local review from the current page. Inspect related task
                      keys, targets, and failure state here before changing the
                      main filter or exporting artifacts.
                    </p>
                    {!reviewedContextGroup && latestHighlightedTaskReceipt ? (
                      <p className="mt-2 text-xs leading-6 text-sky-100/75">
                        No visible tasks from this context remain on the current
                        page. Recent receipts are still pinned to this review
                        permalink.
                      </p>
                    ) : null}
                  </div>

                  {reviewedContextArtifact ? (
                    <WaitingSessionSyncArtifactSummary
                      artifact={reviewedContextArtifact}
                    />
                  ) : null}
                </div>

                <WaitingSessionSyncStatusPills
                  summary={reviewedContextSummary}
                  className="mt-4"
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <WaitingSessionSyncActionButton
                    tone="sky"
                    disabled={normalizedQuery === reviewSectionContext}
                    onClick={() =>
                      updateFilters({
                        query: reviewSectionContext,
                        page: 1,
                      })
                    }
                  >
                    {normalizedQuery === reviewSectionContext
                      ? "Context focused"
                      : "Focus context"}
                  </WaitingSessionSyncActionButton>
                  {reviewedContextGroup ? (
                    <>
                      <WaitingSessionSyncActionButton
                        tone="sky"
                        onClick={() => exportContextSnapshot(reviewedContextGroup)}
                      >
                        Export context snapshot
                      </WaitingSessionSyncActionButton>
                      <WaitingSessionSyncActionButton
                        tone="sky"
                        onClick={() => exportContextCsv(reviewedContextGroup)}
                      >
                        Export context CSV
                      </WaitingSessionSyncActionButton>
                      <WaitingSessionSyncActionButton
                        tone="sky"
                        onClick={() => void copyReviewedContext()}
                      >
                        Copy review context
                      </WaitingSessionSyncActionButton>
                    </>
                  ) : null}
                  <WaitingSessionSyncActionAnchor
                    tone="sky"
                    href={currentPermalink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open review permalink
                  </WaitingSessionSyncActionAnchor>
                  <WaitingSessionSyncActionButton
                    tone="sky"
                    variant="ghost"
                    onClick={() =>
                      updateFilters({
                        reviewContext: "",
                        reviewTaskId: "",
                      })
                    }
                  >
                    Close review
                  </WaitingSessionSyncActionButton>
                </div>

                {highlightedReviewedTask || latestHighlightedTaskReceipt ? (
                  <div className="mt-4 rounded-2xl border border-sky-200/30 bg-sky-950/30 p-4 text-sm text-sky-50">
                    <div className="text-xs uppercase tracking-[0.18em] text-sky-100/75">
                      Task permalink focus
                    </div>
                    <div className="mt-2 font-medium">
                      {formatTaskType(
                        highlightedReviewedTask?.taskType ??
                          latestHighlightedTaskReceipt!.taskType,
                      )}
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-sky-100/80">
                      {highlightedReviewedTask?.taskKey ??
                        latestHighlightedTaskReceipt!.taskKey}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-sky-100/80">
                      <div>
                        Target:{" "}
                        {highlightedReviewedTask?.targetValue ??
                          latestHighlightedTaskReceipt!.targetValue}
                      </div>
                      <div>
                        Status:{" "}
                        {highlightedReviewedTask
                          ? formatStatus(highlightedReviewedTask.status)
                          : "No longer visible on this page"}
                      </div>
                    </div>
                    {!highlightedReviewedTask && latestHighlightedTaskReceipt ? (
                      <div className="mt-2 text-xs leading-6 text-sky-100/75">
                        This task is no longer visible in the current result set,
                        but recent receipts still match this task permalink.
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <WaitingSessionSyncActionButton
                        tone="sky"
                        variant="ghost"
                        onClick={() => updateFilters({ reviewTaskId: "" })}
                      >
                        Clear task highlight
                      </WaitingSessionSyncActionButton>
                      <WaitingSessionSyncActionAnchor
                        tone="sky"
                        href={
                          highlightedReviewedTask
                            ? buildReviewedTaskPermalink(highlightedReviewedTask)
                            : latestHighlightedTaskReceipt!.reviewPath
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open task permalink
                      </WaitingSessionSyncActionAnchor>
                    </div>

                    {visibleHighlightedTaskReceipts.length > 0 ? (
                      <div
                        role="region"
                        aria-label="Recent task receipts"
                        className="mt-4 rounded-2xl border border-sky-200/20 bg-[color:var(--surface-console)]/40 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-sky-100/75">
                              Recent task receipts
                            </div>
                            <div className="mt-2 text-xs leading-6 text-sky-100/75">
                              Showing the latest {visibleHighlightedTaskReceipts.length} of up
                              to {WAITING_SESSION_SYNC_VISIBLE_TASK_RECEIPT_LIMIT} receipt(s)
                              for this review task.
                            </div>
                          </div>
                          <WaitingSessionSyncActionButton
                            tone="sky"
                            variant="ghost"
                            onClick={clearVisibleHighlightedTaskReceipts}
                          >
                            Clear receipts
                          </WaitingSessionSyncActionButton>
                        </div>

                        <div className="mt-4 space-y-3" role="list">
                          {visibleHighlightedTaskReceipts.map((receipt) => (
                            <div
                              role="listitem"
                              key={`${receipt.createdAt}-${receipt.kind}-${receipt.message}`}
                              className={`rounded-2xl border p-4 ${getWaitingSessionSyncTaskReceiptTone(
                                receipt.tone,
                              )}`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="text-xs uppercase tracking-[0.18em]">
                                  {formatWaitingSessionSyncTaskReceiptLabel(receipt.kind)}
                                </div>
                                <WaitingSessionSyncCountChip className="border-current/20 bg-transparent text-current">
                                  {formatDateTime(receipt.createdAt)}
                                </WaitingSessionSyncCountChip>
                              </div>
                              <div className="mt-2 text-sm leading-7">
                                {receipt.message}
                              </div>
                              <div className="mt-3 grid gap-3 text-[11px] text-current/90 md:grid-cols-2 xl:grid-cols-4">
                                <div>
                                  <div className="uppercase tracking-[0.12em] opacity-80">
                                    Task key
                                  </div>
                                  <div
                                    className="mt-1 max-w-[18rem] truncate font-mono text-[color:var(--text-primary)]"
                                    title={receipt.taskKey}
                                  >
                                    {receipt.taskKey}
                                  </div>
                                </div>
                                <div>
                                  <div className="uppercase tracking-[0.12em] opacity-80">
                                    Context
                                  </div>
                                  <div
                                    className="mt-1 max-w-[18rem] truncate font-mono text-[color:var(--text-primary)]"
                                    title={receipt.context}
                                  >
                                    {receipt.context}
                                  </div>
                                </div>
                                <div>
                                  <div className="uppercase tracking-[0.12em] opacity-80">
                                    Target
                                  </div>
                                  <div
                                    className="mt-1 max-w-[18rem] truncate font-mono text-[color:var(--text-primary)]"
                                    title={receipt.targetValue}
                                  >
                                    {receipt.targetValue}
                                  </div>
                                </div>
                                <div>
                                  <div className="uppercase tracking-[0.12em] opacity-80">
                                    Request id
                                  </div>
                                  <div
                                    className="mt-1 max-w-[18rem] break-all font-mono text-[color:var(--text-primary)]"
                                    title={receipt.requestId || undefined}
                                  >
                                    {receipt.requestId || "Not available"}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3">
                                <WaitingSessionSyncActionAnchor
                                  tone="sky"
                                  href={receipt.reviewPath}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open task permalink
                                </WaitingSessionSyncActionAnchor>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {reviewedContextTasks.map((task) => (
                    <article
                      key={task.id}
                      className={`rounded-2xl border p-4 ${
                        highlightedReviewedTask?.id === task.id
                          ? "border-sky-300/50 bg-sky-400/15 shadow-[0_0_0_1px_rgba(125,211,252,0.18)]"
                          : "border-sky-200/20 bg-[color:var(--surface-console)]/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-sky-50">
                            {formatTaskType(task.taskType)}
                          </div>
                          <div className="mt-1 break-all font-mono text-xs text-sky-100/80">
                            {task.taskKey}
                          </div>
                          {highlightedReviewedTask?.id === task.id ? (
                            <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-sky-100/70">
                              Task highlighted
                            </div>
                          ) : null}
                        </div>
                        <WaitingSessionSyncTaskStatusBadge status={task.status} />
                      </div>

                      <div className="mt-3 text-xs leading-6 text-sky-50/85">
                        <div>Target: {task.targetValue}</div>
                        <div>
                          Attempt: {task.attempt} / {task.maxAttempts}
                        </div>
                        <div>Updated: {formatDateTime(task.updatedAt)}</div>
                        <div>Last error: {task.lastError ? task.lastError : "None"}</div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <WaitingSessionSyncActionButton
                          tone="sky"
                          disabled={highlightedReviewedTask?.id === task.id}
                          onClick={() =>
                            updateFilters({
                              reviewContext: reviewSectionContext,
                              reviewTaskId: task.id,
                            })
                          }
                        >
                          {highlightedReviewedTask?.id === task.id
                            ? "Task highlighted"
                            : "Highlight task"}
                        </WaitingSessionSyncActionButton>
                        <WaitingSessionSyncActionAnchor
                          tone="sky"
                          href={buildReviewedTaskPermalink(task)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open task permalink
                        </WaitingSessionSyncActionAnchor>
                        <WaitingSessionSyncActionButton
                          tone="sky"
                          aria-label={`Focus target ${task.targetValue}`}
                          disabled={normalizedQuery === task.targetValue}
                          onClick={() =>
                            updateFilters({
                              query: task.targetValue,
                              page: 1,
                            })
                          }
                        >
                          {normalizedQuery === task.targetValue
                            ? "Target focused"
                            : "Focus target"}
                        </WaitingSessionSyncActionButton>
                        <WaitingSessionSyncActionButton
                          tone="sky"
                          onClick={() => void copyReviewedTask(task)}
                        >
                          Copy task context
                        </WaitingSessionSyncActionButton>
                        {task.taskType === "refresh_world" ? (
                          <Link
                            to="/worlds/$worldId"
                            params={{ worldId: task.targetValue }}
                            className={getWaitingSessionSyncActionLinkClassName({
                              tone: "sky",
                            })}
                          >
                            Open world
                          </Link>
                        ) : (
                          <>
                            <RequestsPermalinkLink
                              search={{
                                query: task.targetValue,
                              }}
                              className={getWaitingSessionSyncActionLinkClassName({
                                tone: "sky",
                              })}
                            >
                              Open requests
                            </RequestsPermalinkLink>
                            <WorldsPermalinkLink
                              search={{
                                query: task.targetValue,
                              }}
                              className={getWaitingSessionSyncActionLinkClassName({
                                tone: "sky",
                              })}
                            >
                              Open worlds
                            </WorldsPermalinkLink>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {contextGroups.map((group) => {
                const contextFocused = normalizedQuery === group.context;
                const contextReviewed = reviewedContext === group.context;

                return (
                  <article
                    key={group.context}
                    className={`rounded-2xl border p-4 ${
                      contextFocused
                        ? "border-sky-300/50 bg-sky-500/10"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                          Context
                        </div>
                        <div className="mt-2 break-all font-mono text-sm text-[color:var(--text-primary)]">
                          {group.context}
                        </div>
                      </div>
                      <WaitingSessionSyncCountChip>
                        {group.total} visible
                      </WaitingSessionSyncCountChip>
                    </div>

                    <WaitingSessionSyncStatusPills summary={group} className="mt-4" />

                    <div className="mt-4 text-xs leading-6 text-[color:var(--text-secondary)]">
                      <div>Task types: {describeContextGroupTaskTypes(group.taskTypes)}</div>
                      <div>Latest update: {formatDateTime(group.latestUpdatedAt)}</div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <WaitingSessionSyncActionButton
                        tone="neutral"
                        disabled={contextReviewed}
                        onClick={() =>
                          updateFilters({
                            reviewContext: group.context,
                            reviewTaskId: "",
                          })
                        }
                      >
                        {contextReviewed ? "Reviewing tasks" : "Review tasks"}
                      </WaitingSessionSyncActionButton>
                      <WaitingSessionSyncActionButton
                        tone="neutral"
                        disabled={contextFocused}
                        onClick={() =>
                          updateFilters({
                            query: group.context,
                            page: 1,
                          })
                        }
                      >
                        {contextFocused ? "Context focused" : "Focus context"}
                      </WaitingSessionSyncActionButton>
                      <WaitingSessionSyncActionButton
                        tone="neutral"
                        onClick={() => exportContextSnapshot(group)}
                      >
                        Export context snapshot
                      </WaitingSessionSyncActionButton>
                      <WaitingSessionSyncActionButton
                        tone="neutral"
                        onClick={() => exportContextCsv(group)}
                      >
                        Export context CSV
                      </WaitingSessionSyncActionButton>
                      {group.refreshWorldTarget ? (
                        <Link
                          to="/worlds/$worldId"
                          params={{ worldId: group.refreshWorldTarget }}
                          className={getWaitingSessionSyncActionLinkClassName({
                            tone: "neutral",
                            className: "hover:text-[color:var(--text-secondary)]",
                          })}
                        >
                          Open world
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="rounded-[28px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-overlay)]">
        {tasksQuery.error ? (
          <CloudAdminErrorBlock
            error={tasksQuery.error}
            title="Unable to load waiting sync tasks"
          />
        ) : tasksQuery.isLoading ? (
          <div className="text-sm text-[color:var(--text-secondary)]">
            Loading waiting sync tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-[color:var(--text-secondary)]">
            No tasks match this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[color:var(--text-muted)]">
                <tr className="border-b border-[color:var(--border-faint)]">
                  <th className="px-3 py-3 font-medium">Task</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Attempt</th>
                  <th className="px-3 py-3 font-medium">Timing</th>
                  <th className="px-3 py-3 font-medium">Last error</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-[color:var(--border-faint)] align-top"
                  >
                    <td className="px-3 py-4">
                      <div className="font-medium text-[color:var(--text-primary)]">
                        {formatTaskType(task.taskType)}
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-[color:var(--text-muted)]">
                        {task.taskKey}
                      </div>
                      <div className="mt-2 text-[color:var(--text-secondary)]">
                        {task.targetValue}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {task.context}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <WaitingSessionSyncActionButton
                          tone="neutral"
                          variant="chip"
                          disabled={normalizedQuery === task.context}
                          onClick={() =>
                            updateFilters({
                              query: task.context,
                              page: 1,
                            })
                          }
                        >
                          {normalizedQuery === task.context
                            ? "Context focused"
                            : "Focus context"}
                        </WaitingSessionSyncActionButton>
                        <WaitingSessionSyncActionButton
                          tone="neutral"
                          variant="chip"
                          disabled={normalizedQuery === task.targetValue}
                          onClick={() =>
                            updateFilters({
                              query: task.targetValue,
                              page: 1,
                            })
                          }
                        >
                          {normalizedQuery === task.targetValue
                            ? "Target focused"
                            : "Focus target"}
                        </WaitingSessionSyncActionButton>
                        {task.taskType === "refresh_world" ? (
                          <Link
                            to="/worlds/$worldId"
                            params={{ worldId: task.targetValue }}
                            className={getWaitingSessionSyncActionLinkClassName({
                              tone: "neutral",
                              variant: "chip",
                            })}
                          >
                            Open world
                          </Link>
                        ) : (
                          <>
                            <RequestsPermalinkLink
                              search={{
                                query: task.targetValue,
                              }}
                              className={getWaitingSessionSyncActionLinkClassName({
                                tone: "neutral",
                                variant: "chip",
                              })}
                            >
                              Open requests
                            </RequestsPermalinkLink>
                            <WorldsPermalinkLink
                              search={{
                                query: task.targetValue,
                              }}
                              className={getWaitingSessionSyncActionLinkClassName({
                                tone: "neutral",
                                variant: "chip",
                              })}
                            >
                              Open worlds
                            </WorldsPermalinkLink>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <WaitingSessionSyncTaskStatusBadge status={task.status} />
                      {task.leaseOwner ? (
                        <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                          Lease {task.leaseOwner}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-4 text-[color:var(--text-secondary)]">
                      {task.attempt} / {task.maxAttempts}
                    </td>
                    <td className="px-3 py-4 text-xs leading-6 text-[color:var(--text-secondary)]">
                      <div>Available: {formatDateTime(task.availableAt)}</div>
                      <div>Updated: {formatDateTime(task.updatedAt)}</div>
                      {task.finishedAt ? (
                        <div>Finished: {formatDateTime(task.finishedAt)}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-4 text-xs leading-6 text-[color:var(--text-secondary)]">
                      {task.lastError ? task.lastError : "None"}
                    </td>
                    <td className="px-3 py-4">
                      {task.status === "failed" ? (
                        <div className="flex flex-col gap-2">
                          <WaitingSessionSyncActionButton
                            tone="brand"
                            size="regular"
                            disabled={replayTaskMutation.isPending}
                            onClick={() => replayTaskMutation.mutate(task)}
                          >
                            Replay now
                          </WaitingSessionSyncActionButton>
                          <WaitingSessionSyncActionButton
                            tone="danger"
                            size="regular"
                            disabled={clearTaskMutation.isPending}
                            onClick={() =>
                              setClearConfirmState({
                                mode: "single",
                                task,
                              })
                            }
                          >
                            Clear now
                          </WaitingSessionSyncActionButton>
                        </div>
                      ) : (
                        <span className="text-xs text-[color:var(--text-muted)]">
                          No manual action
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <WaitingSessionSyncPaginationControls
          page={tasksQuery.data?.page ?? filters.page}
          totalPages={tasksQuery.data?.totalPages ?? 1}
          pageSize={filters.pageSize}
          pageSizeOptions={WAITING_SESSION_SYNC_PAGE_SIZE_OPTIONS}
          onPageSizeChange={(pageSize) =>
            updateFilters({
              pageSize,
              page: 1,
            })
          }
          onPrevious={() => updateFilters({ page: filters.page - 1 })}
          onNext={() => updateFilters({ page: filters.page + 1 })}
        />
      </section>

      <ConsoleConfirmDialog
        open={clearDialogOpen}
        title={
          clearConfirmState?.mode === "single"
            ? "Clear failed task"
            : "Clear matching failed tasks"
        }
        description={
          clearConfirmState?.mode === "single"
            ? `Delete failed task ${clearConfirmState.task.taskKey}. This removes the durable record from the retry queue.`
            : "Delete all matching failed waiting sync tasks for the current task type and search filters."
        }
        confirmLabel="Clear failed task"
        pendingLabel="Clearing..."
        danger
        pending={clearDialogPending}
        onClose={() => {
          if (!clearDialogPending) {
            setClearConfirmState(null);
          }
        }}
        onConfirm={() => {
          if (!clearConfirmState) {
            return;
          }

          if (clearConfirmState.mode === "single") {
            clearTaskMutation.mutate(clearConfirmState.task);
            return;
          }

          clearFilteredMutation.mutate();
        }}
      />
    </div>
  );
}
