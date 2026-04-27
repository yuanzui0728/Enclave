import {
  createBooleanOutcomeNotice,
  createRequestScopedNotice,
  type RequestScopedNotice,
} from "./request-scoped-notice";
import { selectCloudConsoleText } from "./cloud-console-i18n";

// i18n-ignore-start: Notice factory copy is localized through explicit locale branches.
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
  locale?: string | null;
};

type WaitingSessionSyncContextGroupsNoticeOptions = {
  downloaded: boolean;
  groupCount: number;
  requestId?: string | null;
  locale?: string | null;
};

type WaitingSessionSyncCopyNoticeOptions = {
  copied: boolean;
  subject: "permalink" | "review-context" | "task-context";
  locale?: string | null;
};

export function createWaitingSessionSyncReplayTaskNotice(
  response: ReplayTaskResponse,
  locale?: string | null,
): RequestScopedNotice {
  if (response.data.replayedTaskIds.length > 0) {
    return createRequestScopedNotice(
      selectCloudConsoleText(locale, {
        "en-US": "Waiting sync task replay queued.",
        "zh-CN": "等待同步任务重放已入队。",
        "ja-JP": "待機同期タスクの再実行をキューに追加しました。",
        "ko-KR": "대기 동기화 작업 재실행이 큐에 등록되었습니다.",
      }),
      "success",
      response.requestId,
    );
  }

  return createRequestScopedNotice(
    selectCloudConsoleText(locale, {
      "en-US": "Waiting sync task replay was skipped.",
      "zh-CN": "等待同步任务重放已跳过。",
      "ja-JP": "待機同期タスクの再実行はスキップされました。",
      "ko-KR": "대기 동기화 작업 재실행을 건너뛰었습니다.",
    }),
    "warning",
    response.requestId,
  );
}

export function createWaitingSessionSyncClearTaskNotice(
  response: ClearTaskResponse,
  locale?: string | null,
): RequestScopedNotice {
  if (response.data.clearedTaskIds.length > 0) {
    return createRequestScopedNotice(
      selectCloudConsoleText(locale, {
        "en-US": "Waiting sync task cleared.",
        "zh-CN": "等待同步任务已清理。",
        "ja-JP": "待機同期タスクをクリアしました。",
        "ko-KR": "대기 동기화 작업을 정리했습니다.",
      }),
      "success",
      response.requestId,
    );
  }

  return createRequestScopedNotice(
    selectCloudConsoleText(locale, {
      "en-US": "Waiting sync task clear was skipped.",
      "zh-CN": "等待同步任务清理已跳过。",
      "ja-JP": "待機同期タスクのクリアはスキップされました。",
      "ko-KR": "대기 동기화 작업 정리를 건너뛰었습니다.",
    }),
    "warning",
    response.requestId,
  );
}

export function createWaitingSessionSyncFilteredReplayNotice(
  response: FilteredReplayResponse,
  locale?: string | null,
): RequestScopedNotice {
  if (response.data.matchedCount === 0) {
    return createRequestScopedNotice(
      selectCloudConsoleText(locale, {
        "en-US": "No matching failed waiting sync tasks to replay.",
        "zh-CN": "没有匹配的失败等待同步任务可重放。",
        "ja-JP": "再実行できる一致した失敗待機同期タスクはありません。",
        "ko-KR": "재실행할 일치하는 실패 대기 동기화 작업이 없습니다.",
      }),
      "info",
      response.requestId,
    );
  }

  return createRequestScopedNotice(
    selectCloudConsoleText(locale, {
      "en-US": `Queued replay for ${response.data.replayedCount} matching failed waiting sync task(s). Skipped ${response.data.skippedCount}.`,
      "zh-CN": `已为 ${response.data.replayedCount} 个匹配的失败等待同步任务排队重放。已跳过 ${response.data.skippedCount} 个。`,
      "ja-JP": `${response.data.replayedCount} 件の一致した失敗待機同期タスクを再実行キューに追加しました。${response.data.skippedCount} 件をスキップしました。`,
      "ko-KR": `일치하는 실패 대기 동기화 작업 ${response.data.replayedCount}개를 재실행 큐에 등록했습니다. ${response.data.skippedCount}개를 건너뛰었습니다.`,
    }),
    response.data.skippedCount > 0 ? "warning" : "success",
    response.requestId,
  );
}

export function createWaitingSessionSyncFilteredClearNotice(
  response: FilteredClearResponse,
  locale?: string | null,
): RequestScopedNotice {
  if (response.data.matchedCount === 0) {
    return createRequestScopedNotice(
      selectCloudConsoleText(locale, {
        "en-US": "No matching failed waiting sync tasks to clear.",
        "zh-CN": "没有匹配的失败等待同步任务可清理。",
        "ja-JP": "クリアできる一致した失敗待機同期タスクはありません。",
        "ko-KR": "정리할 일치하는 실패 대기 동기화 작업이 없습니다.",
      }),
      "info",
      response.requestId,
    );
  }

  return createRequestScopedNotice(
    selectCloudConsoleText(locale, {
      "en-US": `Cleared ${response.data.clearedCount} matching failed waiting sync task(s). Skipped ${response.data.skippedCount}.`,
      "zh-CN": `已清理 ${response.data.clearedCount} 个匹配的失败等待同步任务。已跳过 ${response.data.skippedCount} 个。`,
      "ja-JP": `${response.data.clearedCount} 件の一致した失敗待機同期タスクをクリアしました。${response.data.skippedCount} 件をスキップしました。`,
      "ko-KR": `일치하는 실패 대기 동기화 작업 ${response.data.clearedCount}개를 정리했습니다. ${response.data.skippedCount}개를 건너뛰었습니다.`,
    }),
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
  locale,
}: WaitingSessionSyncSnapshotNoticeOptions): RequestScopedNotice {
  const successMessage =
    format === "csv"
      ? mode === "context"
        ? selectCloudConsoleText(locale, {
            "en-US": `Downloaded waiting sync context CSV for ${taskCount} task(s).`,
            "zh-CN": `已下载等待同步上下文 CSV：${taskCount} 个任务。`,
            "ja-JP": `待機同期コンテキスト CSV をダウンロードしました: ${taskCount} 件。`,
            "ko-KR": `대기 동기화 컨텍스트 CSV를 다운로드했습니다: ${taskCount}개 작업.`,
          })
        : mode === "focus"
          ? selectCloudConsoleText(locale, {
              "en-US": `Downloaded waiting sync focus CSV for ${taskCount} task(s).`,
              "zh-CN": `已下载等待同步聚焦 CSV：${taskCount} 个任务。`,
              "ja-JP": `待機同期フォーカス CSV をダウンロードしました: ${taskCount} 件。`,
              "ko-KR": `대기 동기화 포커스 CSV를 다운로드했습니다: ${taskCount}개 작업.`,
            })
          : selectCloudConsoleText(locale, {
              "en-US": `Downloaded waiting sync CSV for ${taskCount} visible task(s).`,
              "zh-CN": `已下载等待同步 CSV：${taskCount} 个可见任务。`,
              "ja-JP": `待機同期 CSV をダウンロードしました: ${taskCount} 件の表示タスク。`,
              "ko-KR": `대기 동기화 CSV를 다운로드했습니다: 표시된 작업 ${taskCount}개.`,
            })
      : mode === "context"
        ? selectCloudConsoleText(locale, {
            "en-US": `Downloaded waiting sync context snapshot for ${taskCount} task(s).`,
            "zh-CN": `已下载等待同步上下文快照：${taskCount} 个任务。`,
            "ja-JP": `待機同期コンテキストスナップショットをダウンロードしました: ${taskCount} 件。`,
            "ko-KR": `대기 동기화 컨텍스트 스냅샷을 다운로드했습니다: ${taskCount}개 작업.`,
          })
        : mode === "focus"
          ? selectCloudConsoleText(locale, {
              "en-US": `Downloaded waiting sync focus snapshot for ${taskCount} task(s).`,
              "zh-CN": `已下载等待同步聚焦快照：${taskCount} 个任务。`,
              "ja-JP": `待機同期フォーカススナップショットをダウンロードしました: ${taskCount} 件。`,
              "ko-KR": `대기 동기화 포커스 스냅샷을 다운로드했습니다: ${taskCount}개 작업.`,
            })
          : selectCloudConsoleText(locale, {
              "en-US": `Downloaded waiting sync snapshot for ${taskCount} visible task(s).`,
              "zh-CN": `已下载等待同步快照：${taskCount} 个可见任务。`,
              "ja-JP": `待機同期スナップショットをダウンロードしました: ${taskCount} 件の表示タスク。`,
              "ko-KR": `대기 동기화 스냅샷을 다운로드했습니다: 표시된 작업 ${taskCount}개.`,
            });
  const failureMessage =
    format === "csv"
      ? mode === "context"
        ? selectCloudConsoleText(locale, {
            "en-US": "Waiting sync context CSV download failed.",
            "zh-CN": "等待同步上下文 CSV 下载失败。",
            "ja-JP": "待機同期コンテキスト CSV のダウンロードに失敗しました。",
            "ko-KR": "대기 동기화 컨텍스트 CSV 다운로드에 실패했습니다.",
          })
        : mode === "focus"
          ? selectCloudConsoleText(locale, {
              "en-US": "Waiting sync focus CSV download failed.",
              "zh-CN": "等待同步聚焦 CSV 下载失败。",
              "ja-JP": "待機同期フォーカス CSV のダウンロードに失敗しました。",
              "ko-KR": "대기 동기화 포커스 CSV 다운로드에 실패했습니다.",
            })
          : selectCloudConsoleText(locale, {
              "en-US": "Waiting sync CSV download failed.",
              "zh-CN": "等待同步 CSV 下载失败。",
              "ja-JP": "待機同期 CSV のダウンロードに失敗しました。",
              "ko-KR": "대기 동기화 CSV 다운로드에 실패했습니다.",
            })
      : mode === "context"
        ? selectCloudConsoleText(locale, {
            "en-US": "Waiting sync context snapshot download failed.",
            "zh-CN": "等待同步上下文快照下载失败。",
            "ja-JP": "待機同期コンテキストスナップショットのダウンロードに失敗しました。",
            "ko-KR": "대기 동기화 컨텍스트 스냅샷 다운로드에 실패했습니다.",
          })
        : mode === "focus"
          ? selectCloudConsoleText(locale, {
              "en-US": "Waiting sync focus snapshot download failed.",
              "zh-CN": "等待同步聚焦快照下载失败。",
              "ja-JP": "待機同期フォーカススナップショットのダウンロードに失敗しました。",
              "ko-KR": "대기 동기화 포커스 스냅샷 다운로드에 실패했습니다.",
            })
          : selectCloudConsoleText(locale, {
              "en-US": "Waiting sync snapshot download failed.",
              "zh-CN": "等待同步快照下载失败。",
              "ja-JP": "待機同期スナップショットのダウンロードに失敗しました。",
              "ko-KR": "대기 동기화 스냅샷 다운로드에 실패했습니다.",
            });

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
  locale,
}: WaitingSessionSyncContextGroupsNoticeOptions): RequestScopedNotice {
  return createBooleanOutcomeNotice({
    requestId,
    succeeded: downloaded,
    successMessage: selectCloudConsoleText(locale, {
      "en-US": `Downloaded waiting sync context groups CSV for ${groupCount} group(s).`,
      "zh-CN": `已下载等待同步上下文分组 CSV：${groupCount} 个分组。`,
      "ja-JP": `待機同期コンテキストグループ CSV をダウンロードしました: ${groupCount} 件。`,
      "ko-KR": `대기 동기화 컨텍스트 그룹 CSV를 다운로드했습니다: ${groupCount}개 그룹.`,
    }),
    failureMessage: selectCloudConsoleText(locale, {
      "en-US": "Waiting sync context groups CSV download failed.",
      "zh-CN": "等待同步上下文分组 CSV 下载失败。",
      "ja-JP": "待機同期コンテキストグループ CSV のダウンロードに失敗しました。",
      "ko-KR": "대기 동기화 컨텍스트 그룹 CSV 다운로드에 실패했습니다.",
    }),
  });
}

export function createWaitingSessionSyncContextGroupsSnapshotNotice({
  downloaded,
  groupCount,
  requestId,
  locale,
}: WaitingSessionSyncContextGroupsNoticeOptions): RequestScopedNotice {
  return createBooleanOutcomeNotice({
    requestId,
    succeeded: downloaded,
    successMessage: selectCloudConsoleText(locale, {
      "en-US": `Downloaded waiting sync context groups snapshot for ${groupCount} group(s).`,
      "zh-CN": `已下载等待同步上下文分组快照：${groupCount} 个分组。`,
      "ja-JP": `待機同期コンテキストグループスナップショットをダウンロードしました: ${groupCount} 件。`,
      "ko-KR": `대기 동기화 컨텍스트 그룹 스냅샷을 다운로드했습니다: ${groupCount}개 그룹.`,
    }),
    failureMessage: selectCloudConsoleText(locale, {
      "en-US": "Waiting sync context groups snapshot download failed.",
      "zh-CN": "等待同步上下文分组快照下载失败。",
      "ja-JP":
        "待機同期コンテキストグループスナップショットのダウンロードに失敗しました。",
      "ko-KR": "대기 동기화 컨텍스트 그룹 스냅샷 다운로드에 실패했습니다.",
    }),
  });
}

export function createWaitingSessionSyncCopyNotice({
  copied,
  locale,
  subject,
}: WaitingSessionSyncCopyNoticeOptions): RequestScopedNotice {
  return createBooleanOutcomeNotice({
    succeeded: copied,
    successMessage:
      subject === "permalink"
        ? selectCloudConsoleText(locale, {
            "en-US": "Waiting sync permalink copied.",
            "zh-CN": "等待同步固定链接已复制。",
            "ja-JP": "待機同期の固定リンクをコピーしました。",
            "ko-KR": "대기 동기화 고정 링크를 복사했습니다.",
          })
        : subject === "review-context"
          ? selectCloudConsoleText(locale, {
              "en-US": "Waiting sync review context copied.",
              "zh-CN": "等待同步复核上下文已复制。",
              "ja-JP": "待機同期のレビューコンテキストをコピーしました。",
              "ko-KR": "대기 동기화 검토 컨텍스트를 복사했습니다.",
            })
          : selectCloudConsoleText(locale, {
              "en-US": "Waiting sync task context copied.",
              "zh-CN": "等待同步任务上下文已复制。",
              "ja-JP": "待機同期タスクのコンテキストをコピーしました。",
              "ko-KR": "대기 동기화 작업 컨텍스트를 복사했습니다.",
            }),
    failureMessage:
      subject === "permalink"
        ? selectCloudConsoleText(locale, {
            "en-US": "Waiting sync permalink copy failed.",
            "zh-CN": "等待同步固定链接复制失败。",
            "ja-JP": "待機同期の固定リンクをコピーできませんでした。",
            "ko-KR": "대기 동기화 고정 링크 복사에 실패했습니다.",
          })
        : subject === "review-context"
          ? selectCloudConsoleText(locale, {
              "en-US": "Waiting sync review context copy failed.",
              "zh-CN": "等待同步复核上下文复制失败。",
              "ja-JP":
                "待機同期のレビューコンテキストをコピーできませんでした。",
              "ko-KR": "대기 동기화 검토 컨텍스트 복사에 실패했습니다.",
            })
          : selectCloudConsoleText(locale, {
              "en-US": "Waiting sync task context copy failed.",
              "zh-CN": "等待同步任务上下文复制失败。",
              "ja-JP":
                "待機同期タスクのコンテキストをコピーできませんでした。",
              "ko-KR": "대기 동기화 작업 컨텍스트 복사에 실패했습니다.",
            }),
  });
}
// i18n-ignore-end
