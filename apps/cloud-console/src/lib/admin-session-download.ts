import { downloadJsonFile, downloadTextFile } from "./download";
import {
  createBooleanOutcomeNotice,
  type RequestScopedNotice,
} from "./request-scoped-notice";

type AdminSessionDownloadNoticeOptions = {
  requestId?: string | null;
  downloaded: boolean;
  successMessage: string;
  failureMessage: string;
};

export type AdminSessionTimelineCsvView = "events" | "daily" | "weekly";

export type AdminSessionArtifactDownloadNoticeOptions =
  | {
      kind: "admin-session-audit-snapshot";
      requestId?: string | null;
      downloaded: boolean;
      totalSessions: number;
    }
  | {
      kind: "focused-source-snapshot";
      requestId?: string | null;
      downloaded: boolean;
      totalSessions: number;
    }
  | {
      kind: "risk-snapshot";
      requestId?: string | null;
      downloaded: boolean;
      totalGroups: number;
      totalSessions: number;
    }
  | {
      kind: "risk-groups-csv";
      requestId?: string | null;
      downloaded: boolean;
      totalGroups: number;
    }
  | {
      kind: "risk-sessions-csv";
      requestId?: string | null;
      downloaded: boolean;
      totalSessions: number;
    }
  | {
      kind: "risk-timeline-csv";
      requestId?: string | null;
      downloaded: boolean;
      pointCount: number;
      view: AdminSessionTimelineCsvView;
    };

function formatAdminSessionTimelineCsvSuccessMessage(
  pointCount: number,
  view: AdminSessionTimelineCsvView,
) {
  if (view === "daily") {
    return `Downloaded daily risk timeline CSV for ${pointCount} point(s).`;
  }

  if (view === "weekly") {
    return `Downloaded weekly risk timeline CSV for ${pointCount} point(s).`;
  }

  return `Downloaded risk timeline CSV for ${pointCount} point(s).`;
}

function resolveAdminSessionArtifactDownloadCopy(
  options: AdminSessionArtifactDownloadNoticeOptions,
) {
  switch (options.kind) {
    case "admin-session-audit-snapshot":
      return {
        successMessage: `Downloaded admin session audit snapshot for ${options.totalSessions} session(s).`,
        failureMessage:
          "Admin session audit snapshot is ready, but this browser could not start the download.",
      };
    case "focused-source-snapshot":
      return {
        successMessage: `Downloaded focused source snapshot for ${options.totalSessions} session(s).`,
        failureMessage:
          "Focused source snapshot is ready, but this browser could not start the download.",
      };
    case "risk-snapshot":
      return {
        successMessage: `Downloaded risk snapshot for ${options.totalGroups} group(s) and ${options.totalSessions} session(s).`,
        failureMessage:
          "Risk snapshot is ready, but this browser could not start the download.",
      };
    case "risk-groups-csv":
      return {
        successMessage: `Downloaded risk groups CSV for ${options.totalGroups} group(s).`,
        failureMessage:
          "Risk groups CSV is ready, but this browser could not start the download.",
      };
    case "risk-sessions-csv":
      return {
        successMessage: `Downloaded risk sessions CSV for ${options.totalSessions} session(s).`,
        failureMessage:
          "Risk sessions CSV is ready, but this browser could not start the download.",
      };
    case "risk-timeline-csv":
    default:
      return {
        successMessage: formatAdminSessionTimelineCsvSuccessMessage(
          options.pointCount,
          options.view,
        ),
        failureMessage:
          "Risk timeline CSV is ready, but this browser could not start the download.",
      };
  }
}

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
