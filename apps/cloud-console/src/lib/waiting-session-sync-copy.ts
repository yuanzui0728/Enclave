import type { CloudWaitingSessionSyncTaskSummary } from "@yinjie/contracts";
import {
  buildWaitingSessionSyncSnapshotLookup,
  type WaitingSessionSyncContextGroupArtifact,
  type WaitingSessionSyncStatusSummary,
} from "./waiting-session-sync-artifacts";
import {
  buildCompactWaitingSessionSyncRouteSearch,
  buildWaitingSessionSyncRouteSearch,
  type WaitingSessionSyncRouteSearch,
} from "./waiting-session-sync-route-search";
import {
  selectCloudConsoleText,
  translateCloudConsoleText,
} from "./cloud-console-i18n";

// i18n-ignore-start: Artifact names and copied investigation text are localized through explicit locale branches.
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
  locale?: string | null;
};

type WaitingSessionSyncBatchActionSummaryOptions = {
  actionsEnabled: boolean;
  taskTypeLabel: string;
  query: string;
  locale?: string | null;
};

type WaitingSessionSyncFocusGuardCopyOptions = {
  query: string;
  matchingTaskCount?: number;
  locale?: string | null;
};

type BuildWaitingSessionSyncContextReviewCopyOptions = {
  artifact: WaitingSessionSyncContextGroupArtifact;
  reviewPath: string;
  summary: WaitingSessionSyncStatusSummary;
  locale?: string | null;
};

type BuildWaitingSessionSyncTaskReviewCopyOptions = {
  reviewPath: string;
  task: CloudWaitingSessionSyncTaskSummary;
  locale?: string | null;
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
  locale?: string | null,
) {
  switch (taskType) {
    case "refresh_world":
      return translateCloudConsoleText("Refresh world", locale);
    case "refresh_phone":
      return translateCloudConsoleText("Refresh phone", locale);
    case "invalidate_phone":
      return translateCloudConsoleText("Invalidate phone", locale);
    default:
      return taskType;
  }
}

function formatWaitingSessionSyncStatus(
  status: CloudWaitingSessionSyncTaskSummary["status"],
  locale?: string | null,
) {
  switch (status) {
    case "failed":
      return translateCloudConsoleText("Failed", locale);
    case "pending":
      return translateCloudConsoleText("Pending", locale);
    case "running":
      return translateCloudConsoleText("Running", locale);
    default:
      return status;
  }
}

function formatCopyLine(label: string, value: string, locale?: string | null) {
  return `${translateCloudConsoleText(label, locale)}: ${value}`;
}

export function buildWaitingSessionSyncArtifactFilename({
  mode,
  filters,
  extension,
  locale,
  query,
}: BuildWaitingSessionSyncArtifactFilenameOptions) {
  const effectiveQuery = query ?? filters.query;
  const prefix = selectCloudConsoleText(locale, {
    "en-US": "waiting-sync",
    "zh-CN": "等待同步",
    "ja-JP": "待機同期",
    "ko-KR": "대기동기화",
  });
  const localizedMode = selectCloudConsoleText(locale, {
    "en-US": mode,
    "zh-CN":
      mode === "context"
        ? "上下文"
        : mode === "context-groups"
          ? "上下文分组"
          : mode === "focus"
            ? "聚焦"
            : "筛选",
    "ja-JP":
      mode === "context"
        ? "コンテキスト"
        : mode === "context-groups"
          ? "コンテキストグループ"
          : mode === "focus"
            ? "フォーカス"
            : "フィルター",
    "ko-KR":
      mode === "context"
        ? "컨텍스트"
        : mode === "context-groups"
          ? "컨텍스트그룹"
          : mode === "focus"
            ? "포커스"
            : "필터",
  });
  const parts =
    mode === "filtered" || mode === "context-groups"
      ? [
          prefix,
          localizedMode,
          filters.status,
          filters.taskType,
          normalizeSnapshotFilenameSegment(effectiveQuery),
        ]
      : [
          prefix,
          localizedMode,
          normalizeSnapshotFilenameSegment(effectiveQuery),
        ];

  return `${parts.join("-")}.${extension}`;
}

export function describeWaitingSessionSyncBatchActionSummary({
  actionsEnabled,
  locale,
  taskTypeLabel,
  query,
}: WaitingSessionSyncBatchActionSummaryOptions) {
  if (!actionsEnabled) {
    return selectCloudConsoleText(locale, {
      "en-US":
        "Switch status to All or Failed before running batch failed-task actions.",
      "zh-CN": "请先将状态切换为全部或失败，再执行失败任务批量操作。",
      "ja-JP":
        "失敗タスクの一括操作を実行する前に、ステータスを All または Failed に切り替えてください。",
      "ko-KR":
        "실패 작업 일괄 작업을 실행하기 전에 상태를 All 또는 Failed로 전환하세요.",
    });
  }

  const normalizedQuery = query.trim();
  if (taskTypeLabel === "All" && normalizedQuery.length === 0) {
    return selectCloudConsoleText(locale, {
      "en-US": "All failed tasks across every page.",
      "zh-CN": "所有页面中的全部失败任务。",
      "ja-JP": "全ページのすべての失敗タスク。",
      "ko-KR": "모든 페이지의 전체 실패 작업.",
    });
  }

  return selectCloudConsoleText(locale, {
    "en-US": `All matching failed tasks for task type ${taskTypeLabel}${
      normalizedQuery ? ` and search "${normalizedQuery}".` : "."
    }`,
    "zh-CN": `任务类型 ${taskTypeLabel} 的全部匹配失败任务${
      normalizedQuery ? `，搜索条件“${normalizedQuery}”。` : "。"
    }`,
    "ja-JP": `タスクタイプ ${taskTypeLabel} の一致する失敗タスクすべて${
      normalizedQuery ? `、検索「${normalizedQuery}」。` : "。"
    }`,
    "ko-KR": `작업 유형 ${taskTypeLabel}의 일치하는 모든 실패 작업${
      normalizedQuery ? `, 검색어 "${normalizedQuery}".` : "."
    }`,
  });
}

export function describeWaitingSessionSyncFocusGuardCopy({
  locale,
  query,
  matchingTaskCount,
}: WaitingSessionSyncFocusGuardCopyOptions) {
  const normalizedQuery = query.trim();

  if (typeof matchingTaskCount === "number") {
    return selectCloudConsoleText(locale, {
      "en-US": `Focus snapshot ready for query "${normalizedQuery}" with ${matchingTaskCount} exact context/target match(es).`,
      "zh-CN": `查询“${normalizedQuery}”的聚焦快照已就绪，共 ${matchingTaskCount} 个精确上下文/目标匹配。`,
      "ja-JP": `検索「${normalizedQuery}」のフォーカススナップショットが準備できました。完全一致するコンテキスト/ターゲットは ${matchingTaskCount} 件です。`,
      "ko-KR": `"${normalizedQuery}" 검색의 포커스 스냅샷이 준비되었습니다. 정확한 컨텍스트/대상 일치 ${matchingTaskCount}개.`,
    });
  }

  if (normalizedQuery.length > 0) {
    return selectCloudConsoleText(locale, {
      "en-US":
        "Focus snapshot appears when the current query exactly matches a visible context or target.",
      "zh-CN": "当前查询精确匹配可见上下文或目标时，将显示聚焦快照。",
      "ja-JP":
        "現在の検索が表示中のコンテキストまたはターゲットに完全一致すると、フォーカススナップショットが表示されます。",
      "ko-KR":
        "현재 검색어가 표시된 컨텍스트 또는 대상과 정확히 일치하면 포커스 스냅샷이 표시됩니다.",
    });
  }

  return selectCloudConsoleText(locale, {
    "en-US":
      "Add a context or target query to export a tighter investigation snapshot.",
    "zh-CN": "请输入上下文或目标查询，以导出更聚焦的排查快照。",
    "ja-JP":
      "より絞り込んだ調査スナップショットを出力するには、コンテキストまたはターゲット検索を入力してください。",
    "ko-KR":
      "더 좁은 조사 스냅샷을 내보내려면 컨텍스트 또는 대상 검색어를 입력하세요.",
  });
}

export function buildWaitingSessionSyncPermalink(
  search: WaitingSessionSyncRouteSearch,
) {
  return buildRouteSearchPath(
    "/waiting-sync",
    buildCompactWaitingSessionSyncRouteSearch(
      buildWaitingSessionSyncRouteSearch(search),
    ),
  );
}

export function buildWaitingSessionSyncContextReviewCopy({
  artifact,
  locale,
  reviewPath,
  summary,
}: BuildWaitingSessionSyncContextReviewCopyOptions) {
  return [
    formatCopyLine("Context", artifact.context, locale),
    formatCopyLine("Visible tasks", String(artifact.total), locale),
    formatCopyLine("Failed", String(summary.failed), locale),
    formatCopyLine("Pending", String(summary.pending), locale),
    formatCopyLine("Running", String(summary.running), locale),
    formatCopyLine("Task types", artifact.taskTypeLabels.join(" | "), locale),
    formatCopyLine(
      "Latest update",
      artifact.latestUpdatedAt ??
        translateCloudConsoleText("Not available", locale),
      locale,
    ),
    formatCopyLine("Review permalink", reviewPath, locale),
    formatCopyLine("Focus path", artifact.focusPath, locale),
    formatCopyLine(
      "World detail",
      artifact.worldDetailPath ??
        translateCloudConsoleText("Not available", locale),
      locale,
    ),
    formatCopyLine("Task ids", artifact.taskIds.join(" | "), locale),
    formatCopyLine("Task keys", artifact.taskKeys.join(" | "), locale),
    formatCopyLine("Target values", artifact.targetValues.join(" | "), locale),
  ].join("\n");
}

export function buildWaitingSessionSyncTaskReviewCopy(
  options: BuildWaitingSessionSyncTaskReviewCopyOptions,
) {
  const { reviewPath, task } = options;
  const { locale } = options;
  const lookup = buildWaitingSessionSyncSnapshotLookup(task);

  return [
    formatCopyLine("Task key", task.taskKey, locale),
    formatCopyLine(
      "Task type",
      formatWaitingSessionSyncTaskType(task.taskType, locale),
      locale,
    ),
    formatCopyLine(
      "Status",
      formatWaitingSessionSyncStatus(task.status, locale),
      locale,
    ),
    formatCopyLine("Target", task.targetValue, locale),
    formatCopyLine("Context", task.context, locale),
    formatCopyLine("Attempt", `${task.attempt} / ${task.maxAttempts}`, locale),
    formatCopyLine("Available", task.availableAt, locale),
    formatCopyLine("Updated", task.updatedAt, locale),
    formatCopyLine(
      "Finished",
      task.finishedAt ?? translateCloudConsoleText("Not available", locale),
      locale,
    ),
    formatCopyLine(
      "Lease owner",
      task.leaseOwner ?? translateCloudConsoleText("Not available", locale),
      locale,
    ),
    formatCopyLine(
      "Last error",
      task.lastError ?? translateCloudConsoleText("None", locale),
      locale,
    ),
    formatCopyLine("Review permalink", reviewPath, locale),
    formatCopyLine("Requests path", lookup.requestsPath, locale),
    formatCopyLine("Worlds path", lookup.worldsPath, locale),
    formatCopyLine(
      "World detail",
      lookup.worldDetailPath ?? translateCloudConsoleText("Not available", locale),
      locale,
    ),
  ].join("\n");
}
// i18n-ignore-end
