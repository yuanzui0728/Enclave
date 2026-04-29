import { downloadJsonFile, downloadTextFile } from "./download";
import { selectCloudConsoleText } from "./cloud-console-i18n";
import {
  createBooleanOutcomeNotice,
  type RequestScopedNotice,
} from "./request-scoped-notice";

type AdminSessionDownloadNoticeOptions = {
  requestId?: string | null;
  downloaded: boolean;
  successMessage: string;
  failureMessage: string;
  locale?: string | null;
};

export type AdminSessionTimelineCsvView = "events" | "daily" | "weekly";

export type AdminSessionArtifactDownloadNoticeOptions =
  | {
      kind: "admin-session-audit-snapshot";
      requestId?: string | null;
      downloaded: boolean;
      totalSessions: number;
      locale?: string | null;
    }
  | {
      kind: "focused-source-snapshot";
      requestId?: string | null;
      downloaded: boolean;
      totalSessions: number;
      locale?: string | null;
    }
  | {
      kind: "risk-snapshot";
      requestId?: string | null;
      downloaded: boolean;
      totalGroups: number;
      totalSessions: number;
      locale?: string | null;
    }
  | {
      kind: "risk-groups-csv";
      requestId?: string | null;
      downloaded: boolean;
      totalGroups: number;
      locale?: string | null;
    }
  | {
      kind: "risk-sessions-csv";
      requestId?: string | null;
      downloaded: boolean;
      totalSessions: number;
      locale?: string | null;
    }
  | {
      kind: "risk-timeline-csv";
      requestId?: string | null;
      downloaded: boolean;
      pointCount: number;
      view: AdminSessionTimelineCsvView;
      locale?: string | null;
    };

// i18n-ignore-start: Dynamic notice copy is localized through explicit locale branches.
function formatAdminSessionTimelineCsvSuccessMessage(
  pointCount: number,
  view: AdminSessionTimelineCsvView,
  locale?: string | null,
) {
  if (view === "daily") {
    return selectCloudConsoleText(locale, {
      "en-US": `Downloaded daily risk timeline CSV for ${pointCount} point(s).`,
      "zh-CN": `已下载每日风险时间线 CSV：${pointCount} 个点位。`,
      "ja-JP": `日次リスクタイムライン CSV をダウンロードしました: ${pointCount} 件。`,
      "ko-KR": `일별 위험 타임라인 CSV를 다운로드했습니다: ${pointCount}개 지점.`,
    });
  }

  if (view === "weekly") {
    return selectCloudConsoleText(locale, {
      "en-US": `Downloaded weekly risk timeline CSV for ${pointCount} point(s).`,
      "zh-CN": `已下载每周风险时间线 CSV：${pointCount} 个点位。`,
      "ja-JP": `週次リスクタイムライン CSV をダウンロードしました: ${pointCount} 件。`,
      "ko-KR": `주별 위험 타임라인 CSV를 다운로드했습니다: ${pointCount}개 지점.`,
    });
  }

  return selectCloudConsoleText(locale, {
    "en-US": `Downloaded risk timeline CSV for ${pointCount} point(s).`,
    "zh-CN": `已下载风险时间线 CSV：${pointCount} 个点位。`,
    "ja-JP": `リスクタイムライン CSV をダウンロードしました: ${pointCount} 件。`,
    "ko-KR": `위험 타임라인 CSV를 다운로드했습니다: ${pointCount}개 지점.`,
  });
}

function resolveAdminSessionArtifactDownloadCopy(
  options: AdminSessionArtifactDownloadNoticeOptions,
) {
  switch (options.kind) {
    case "admin-session-audit-snapshot":
      return {
        successMessage: selectCloudConsoleText(options.locale, {
          "en-US": `Downloaded admin session audit snapshot for ${options.totalSessions} session(s).`,
          "zh-CN": `已下载管理会话审计快照：${options.totalSessions} 个会话。`,
          "ja-JP": `管理セッション監査スナップショットをダウンロードしました: ${options.totalSessions} 件。`,
          "ko-KR": `관리자 세션 감사 스냅샷을 다운로드했습니다: ${options.totalSessions}개 세션.`,
        }),
        failureMessage: selectCloudConsoleText(options.locale, {
          "en-US":
            "Admin session audit snapshot is ready, but this browser could not start the download.",
          "zh-CN":
            "管理会话审计快照已准备好，但当前浏览器无法开始下载。",
          "ja-JP":
            "管理セッション監査スナップショットは準備できていますが、このブラウザではダウンロードを開始できません。",
          "ko-KR":
            "관리자 세션 감사 스냅샷은 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
        }),
      };
    case "focused-source-snapshot":
      return {
        successMessage: selectCloudConsoleText(options.locale, {
          "en-US": `Downloaded focused source snapshot for ${options.totalSessions} session(s).`,
          "zh-CN": `已下载聚焦来源快照：${options.totalSessions} 个会话。`,
          "ja-JP": `フォーカス元スナップショットをダウンロードしました: ${options.totalSessions} 件。`,
          "ko-KR": `포커스 소스 스냅샷을 다운로드했습니다: ${options.totalSessions}개 세션.`,
        }),
        failureMessage: selectCloudConsoleText(options.locale, {
          "en-US":
            "Focused source snapshot is ready, but this browser could not start the download.",
          "zh-CN": "聚焦来源快照已准备好，但当前浏览器无法开始下载。",
          "ja-JP":
            "フォーカス元スナップショットは準備できていますが、このブラウザではダウンロードを開始できません。",
          "ko-KR":
            "포커스 소스 스냅샷은 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
        }),
      };
    case "risk-snapshot":
      return {
        successMessage: selectCloudConsoleText(options.locale, {
          "en-US": `Downloaded risk snapshot for ${options.totalGroups} group(s) and ${options.totalSessions} session(s).`,
          "zh-CN": `已下载风险快照：${options.totalGroups} 个分组，${options.totalSessions} 个会话。`,
          "ja-JP": `リスクスナップショットをダウンロードしました: ${options.totalGroups} グループ、${options.totalSessions} セッション。`,
          "ko-KR": `위험 스냅샷을 다운로드했습니다: ${options.totalGroups}개 그룹, ${options.totalSessions}개 세션.`,
        }),
        failureMessage: selectCloudConsoleText(options.locale, {
          "en-US":
            "Risk snapshot is ready, but this browser could not start the download.",
          "zh-CN": "风险快照已准备好，但当前浏览器无法开始下载。",
          "ja-JP":
            "リスクスナップショットは準備できていますが、このブラウザではダウンロードを開始できません。",
          "ko-KR":
            "위험 스냅샷은 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
        }),
      };
    case "risk-groups-csv":
      return {
        successMessage: selectCloudConsoleText(options.locale, {
          "en-US": `Downloaded risk groups CSV for ${options.totalGroups} group(s).`,
          "zh-CN": `已下载风险分组 CSV：${options.totalGroups} 个分组。`,
          "ja-JP": `リスクグループ CSV をダウンロードしました: ${options.totalGroups} 件。`,
          "ko-KR": `위험 그룹 CSV를 다운로드했습니다: ${options.totalGroups}개 그룹.`,
        }),
        failureMessage: selectCloudConsoleText(options.locale, {
          "en-US":
            "Risk groups CSV is ready, but this browser could not start the download.",
          "zh-CN": "风险分组 CSV 已准备好，但当前浏览器无法开始下载。",
          "ja-JP":
            "リスクグループ CSV は準備できていますが、このブラウザではダウンロードを開始できません。",
          "ko-KR":
            "위험 그룹 CSV는 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
        }),
      };
    case "risk-sessions-csv":
      return {
        successMessage: selectCloudConsoleText(options.locale, {
          "en-US": `Downloaded risk sessions CSV for ${options.totalSessions} session(s).`,
          "zh-CN": `已下载风险会话 CSV：${options.totalSessions} 个会话。`,
          "ja-JP": `リスクセッション CSV をダウンロードしました: ${options.totalSessions} 件。`,
          "ko-KR": `위험 세션 CSV를 다운로드했습니다: ${options.totalSessions}개 세션.`,
        }),
        failureMessage: selectCloudConsoleText(options.locale, {
          "en-US":
            "Risk sessions CSV is ready, but this browser could not start the download.",
          "zh-CN": "风险会话 CSV 已准备好，但当前浏览器无法开始下载。",
          "ja-JP":
            "リスクセッション CSV は準備できていますが、このブラウザではダウンロードを開始できません。",
          "ko-KR":
            "위험 세션 CSV는 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
        }),
      };
    case "risk-timeline-csv":
    default:
      return {
        successMessage: formatAdminSessionTimelineCsvSuccessMessage(
          options.pointCount,
          options.view,
          options.locale,
        ),
        failureMessage: selectCloudConsoleText(options.locale, {
          "en-US":
            "Risk timeline CSV is ready, but this browser could not start the download.",
          "zh-CN": "风险时间线 CSV 已准备好，但当前浏览器无法开始下载。",
          "ja-JP":
            "リスクタイムライン CSV は準備できていますが、このブラウザではダウンロードを開始できません。",
          "ko-KR":
            "위험 타임라인 CSV는 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
        }),
      };
  }
}
// i18n-ignore-end

export function createAdminSessionDownloadNotice({
  downloaded,
  failureMessage,
  requestId,
  successMessage,
}: AdminSessionDownloadNoticeOptions): RequestScopedNotice {
  return createBooleanOutcomeNotice({
    requestId,
    succeeded: downloaded,
    successMessage,
    failureMessage,
  });
}

export function createAdminSessionArtifactDownloadNotice(
  options: AdminSessionArtifactDownloadNoticeOptions,
): RequestScopedNotice {
  const { successMessage, failureMessage } =
    resolveAdminSessionArtifactDownloadCopy(options);

  return createAdminSessionDownloadNotice({
    requestId: options.requestId,
    downloaded: options.downloaded,
    successMessage,
    failureMessage,
  });
}

export function withDownloadedJsonFile<TExtra extends object>(
  result: TExtra,
  filename: string,
  value: unknown,
): TExtra & { downloaded: boolean } {
  return {
    ...result,
    downloaded: downloadJsonFile(filename, value),
  };
}

export function withDownloadedTextFile<TExtra extends object>(
  result: TExtra,
  filename: string,
  value: string,
  mimeType = "text/plain;charset=utf-8",
): TExtra & { downloaded: boolean } {
  return {
    ...result,
    downloaded: downloadTextFile(filename, value, mimeType),
  };
}
