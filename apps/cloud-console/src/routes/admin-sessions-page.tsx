import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type {
  CloudAdminSessionSourceGroupSnapshotSummary,
  CloudAdminSessionSourceGroupSnapshot,
  CloudAdminSessionSourceGroupRiskSnapshot,
  CloudAdminSessionSourceGroupRiskLevel,
  CloudAdminSessionSourceGroupRiskSignal,
  CloudAdminSessionSourceGroupSummary,
  CloudAdminSessionStatus,
  CloudAdminSessionSummary,
} from "@yinjie/contracts";
import {
  AdminSessionActionButton,
  AdminSessionBrandBadge,
  AdminSessionBrandEyebrow,
  AdminSessionFilterControls,
  AdminSessionNeutralChip,
  AdminSessionQuickViewButtons,
  AdminSessionSectionHeader,
  AdminSessionSourceGroupFilterControls,
  AdminSessionSourceGroupRiskBadge,
  AdminSessionSourceGroupRiskSignals,
  AdminSessionSourceGroupSummaryPills,
  AdminSessionStatusBadge,
  AdminSessionSummaryChip,
} from "../components/admin-session-controls";
import {
  CloudAdminErrorBlock,
  showCloudAdminErrorNotice,
} from "../components/cloud-admin-error-block";
import { ConsoleConfirmDialog } from "../components/console-confirm-dialog";
import { useConsoleNotice } from "../components/console-notice";
import {
  DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH,
  buildAdminSessionsPermalink,
  buildAdminSessionsRouteSearch,
  type AdminSessionsRouteSearch,
} from "../lib/admin-sessions-route-search";
import {
  createAdminSessionArtifactDownloadNotice,
  ADMIN_SESSION_FOCUSED_SOURCE_SNAPSHOT_UNAVAILABLE_MESSAGE,
  createAdminSessionRiskTimelineNotReadyNotice,
  createErrorHighlightedOperationReceipt,
  createNoticeHighlightedOperationReceipt,
  createRiskGroupRevokeNotice,
  createSessionRevokeNotice,
  formatAdminSessionRevocationReasonLabel as formatRevocationReason,
  formatAdminSessionSourceGroupRiskFilterLabel as formatSourceGroupRiskFilterLabel,
  formatHighlightedOperationReceiptLabel,
  getAdminSessionSourceRiskGuardMessage,
  getAdminSessionSourceRiskSelectionPrompt,
  getHighlightedOperationReceiptTone,
  HIGHLIGHTED_OPERATION_RECEIPT_LIMIT,
  type HighlightedSessionOperationReceipt,
  matchesHighlightedOperationReceiptContext,
  prependHighlightedOperationReceipt,
  withDownloadedJsonFile,
  withDownloadedTextFile,
} from "../lib/admin-session-helpers";
import {
  cloudAdminApi,
  getCloudAdminApiErrorRequestId,
} from "../lib/cloud-admin-api";
import { copyTextToClipboard } from "../lib/clipboard";
import {
  createRequestScopedNotice,
  type RequestScopedNotice,
  showRequestScopedNotice,
  showRequestScopedNoticeAndInvalidate,
} from "../lib/request-scoped-notice";

const ADMIN_SESSION_ACTION_LINK_CLASS_NAME =
  "rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--text-primary)] transition hover:border-[color:var(--border-strong)]";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

function formatDateRange(startValue?: string | null, endValue?: string | null) {
  if (!startValue || !endValue) {
    return "Not available";
  }

  if (startValue === endValue) {
    return formatDate(startValue);
  }

  return `${formatDate(startValue)} - ${formatDate(endValue)}`;
}

function renderSessionSource(ip?: string | null, userAgent?: string | null) {
  if (!ip && !userAgent) {
    return (
      <span className="text-[color:var(--text-muted)]">Not available</span>
    );
  }

  return (
    <div className="space-y-1">
      <div className="font-mono text-xs text-[color:var(--text-primary)]">
        {ip || "Unknown IP"}
      </div>
      <div
        className="max-w-[22rem] truncate text-xs text-[color:var(--text-secondary)]"
        title={userAgent || undefined}
      >
        {userAgent || "Unknown client"}
      </div>
    </div>
  );
}

function renderRevocationDetails(session: CloudAdminSessionSummary) {
  if (
    !session.revokedAt &&
    !session.revocationReason &&
    !session.revokedBySessionId
  ) {
    return (
      <span className="text-[color:var(--text-muted)]">Not available</span>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-[color:var(--text-secondary)]">
        {formatDateTime(session.revokedAt)}
      </div>
      <div className="text-xs text-[color:var(--text-primary)]">
        {formatRevocationReason(session.revocationReason)}
      </div>
      <div
        className="max-w-[18rem] truncate font-mono text-[11px] text-[color:var(--text-muted)]"
        title={session.revokedBySessionId || undefined}
      >
        {session.revokedBySessionId
          ? `By ${session.revokedBySessionId}`
          : "By unknown session"}
      </div>
    </div>
  );
}

function formatTimelineViewLabel(view: SourceGroupRiskTimelineView) {
  switch (view) {
    case "daily":
      return "Daily summary";
    case "weekly":
      return "Weekly summary";
    case "events":
    default:
      return "Event view";
  }
}

function formatTimelinePointTimestampLabel(
  point: SourceGroupRiskTimelineDisplayPoint,
  view: SourceGroupRiskTimelineView,
) {
  if (view === "daily" && "day" in point) {
    return `${formatDate(point.day)} • Latest event ${formatDateTime(point.timestamp)}`;
  }

  if (view === "weekly" && "weekStart" in point) {
    return `${formatDateRange(point.weekStart, point.weekEnd)} • Latest event ${formatDateTime(point.timestamp)}`;
  }

  return formatDateTime(point.timestamp);
}

function describeVisibleRange(total: number, page: number, pageSize: number, count: number) {
  if (total === 0 || count === 0) {
    return "Showing 0 sessions";
  }

  const start = (page - 1) * pageSize + 1;
  const end = start + count - 1;
  return `Showing ${start}-${end} of ${total}`;
}

function describeSourceGroupRange(
  total: number,
  page: number,
  pageSize: number,
  count: number,
) {
  if (total === 0 || count === 0) {
    return "Showing 0 groups";
  }

  const start = (page - 1) * pageSize + 1;
  const end = start + count - 1;
  return `Showing ${start}-${end} of ${total} groups`;
}

function buildSourceGroupSnapshotFilename(group: { issuedFromIp?: string | null }) {
  const ipPart = (group.issuedFromIp ?? "unknown-ip").replace(/[^a-z0-9.-]+/gi, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `admin-session-source-group-${ipPart}-${timestamp}.json`;
}

function normalizeSourceGroupSummary(
  group:
    | CloudAdminSessionSourceGroupSummary
    | CloudAdminSessionSourceGroupSnapshotSummary,
): CloudAdminSessionSourceGroupSummary {
  return {
    sourceKey: group.sourceKey,
    issuedFromIp: group.issuedFromIp ?? null,
    issuedUserAgent: group.issuedUserAgent ?? null,
    totalSessions: group.totalSessions,
    activeSessions: group.activeSessions,
    expiredSessions: group.expiredSessions,
    revokedSessions: group.revokedSessions,
    refreshTokenReuseRevocations: group.refreshTokenReuseRevocations,
    currentSessions: group.currentSessions,
    riskLevel: group.riskLevel,
    riskSignals: group.riskSignals,
    latestCreatedAt: group.latestCreatedAt ?? "",
    latestLastUsedAt: group.latestLastUsedAt ?? null,
    latestRevokedAt: group.latestRevokedAt ?? null,
  };
}

function buildSourceGroupRiskSnapshotFilename(
  riskLevel: CloudAdminSessionSourceGroupRiskLevel,
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `admin-session-source-groups-${riskLevel}-risk-${timestamp}.json`;
}

function buildSourceGroupRiskCsvFilename(
  riskLevel: CloudAdminSessionSourceGroupRiskLevel,
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `admin-session-source-groups-${riskLevel}-risk-groups-${timestamp}.csv`;
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const normalized = value === null || value === undefined ? "" : String(value);
  if (!/[",\n]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function buildSourceGroupLookupKey(ip?: string | null, userAgent?: string | null) {
  return `${ip ?? ""}\u0000${userAgent ?? ""}`;
}

type SourceGroupRiskTimelinePoint = {
  id: string;
  timestamp: string;
  eventSummary: string;
  riskLevel: CloudAdminSessionSourceGroupRiskLevel;
  riskSignals: CloudAdminSessionSourceGroupRiskSignal[];
  activeSessions: number;
  expiredSessions: number;
  revokedSessions: number;
  refreshTokenReuseRevocations: number;
};

type SourceGroupRiskTimelineDailyPoint = SourceGroupRiskTimelinePoint & {
  day: string;
  pointCount: number;
};

type SourceGroupRiskTimelineWeeklyPoint = SourceGroupRiskTimelinePoint & {
  weekStart: string;
  weekEnd: string;
  pointCount: number;
};

type SourceGroupTimelineSessionMatchReason =
  | "active-threshold"
  | "revoked-threshold"
  | "refresh-reuse";

type SourceGroupTimelineMatchedSession = {
  session: CloudAdminSessionSummary;
  state: CloudAdminSessionStatus;
  reasons: SourceGroupTimelineSessionMatchReason[];
};

type SourceGroupRiskTimelineDisplayPoint =
  | SourceGroupRiskTimelinePoint
  | SourceGroupRiskTimelineDailyPoint
  | SourceGroupRiskTimelineWeeklyPoint;

type SourceGroupRiskTimelineView = "events" | "daily" | "weekly";
type PendingSourceGroupRevokeMode = "filtered" | "focused-source";
type PendingSourceGroupRevoke = {
  group: CloudAdminSessionSourceGroupSummary;
  mode: PendingSourceGroupRevokeMode;
};

type HighlightedOperationReceiptContext = Pick<
  HighlightedSessionOperationReceipt,
  "sessionId" | "sourceKey" | "sourceIssuedFromIp" | "sourceIssuedUserAgent"
>;

const WATCH_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD = 2;
const CRITICAL_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD = 4;
const WATCH_SOURCE_GROUP_REVOKED_SESSION_THRESHOLD = 2;
const SOURCE_GROUP_RISK_THRESHOLD_RULES = [
  {
    id: "watch",
    label: "Watch threshold",
    description: `${WATCH_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD}+ active or ${WATCH_SOURCE_GROUP_REVOKED_SESSION_THRESHOLD}+ revoked`,
    tone: "border-amber-300/50 bg-amber-500/10 text-amber-100",
  },
  {
    id: "critical",
    label: "Critical threshold",
    description: `${CRITICAL_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD}+ active or any refresh reuse`,
    tone: "border-rose-300/50 bg-rose-500/10 text-rose-200",
  },
] as const;

function parseTimelineTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addUtcDays(value: string, days: number) {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getTimelineWeekStart(timestampMs: number) {
  const date = new Date(timestampMs);
  const utcDay = date.getUTCDay();
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function resolveSourceGroupTimelineSessionState(
  session: CloudAdminSessionSummary,
  timestampMs: number,
) {
  const createdAt = parseTimelineTimestamp(session.createdAt);
  if (createdAt === null || timestampMs < createdAt) {
    return null;
  }

  const revokedAt = parseTimelineTimestamp(session.revokedAt);
  if (revokedAt !== null && timestampMs >= revokedAt) {
    return "revoked" as const;
  }

  const expiresAt = parseTimelineTimestamp(session.expiresAt);
  if (expiresAt !== null && timestampMs >= expiresAt) {
    return "expired" as const;
  }

  return "active" as const;
}

function resolveSourceGroupTimelineRiskState(counts: {
  activeSessions: number;
  revokedSessions: number;
  refreshTokenReuseRevocations: number;
}) {
  const riskSignals: CloudAdminSessionSourceGroupRiskSignal[] = [];
  if (counts.activeSessions >= WATCH_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD) {
    riskSignals.push("multiple-active-sessions");
  }
  if (counts.revokedSessions >= WATCH_SOURCE_GROUP_REVOKED_SESSION_THRESHOLD) {
    riskSignals.push("repeated-revocations");
  }
  if (counts.refreshTokenReuseRevocations > 0) {
    riskSignals.push("refresh-token-reuse");
  }

  let riskLevel: CloudAdminSessionSourceGroupRiskLevel = "normal";
  if (
    counts.refreshTokenReuseRevocations > 0 ||
    counts.activeSessions >= CRITICAL_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD
  ) {
    riskLevel = "critical";
  } else if (riskSignals.length > 0) {
    riskLevel = "watch";
  }

  return {
    riskLevel,
    riskSignals,
  };
}

function getRiskLevelSeverity(
  riskLevel: CloudAdminSessionSourceGroupRiskLevel,
) {
  switch (riskLevel) {
    case "critical":
      return 2;
    case "watch":
      return 1;
    case "normal":
    default:
      return 0;
  }
}

function describeSourceGroupTimelineRiskReasons(
  point: SourceGroupRiskTimelineDisplayPoint,
) {
  const reasons: string[] = [];

  if (point.refreshTokenReuseRevocations > 0) {
    reasons.push(
      `${point.refreshTokenReuseRevocations} refresh reuse revocation(s) hit the critical threshold.`,
    );
  }
  if (point.activeSessions >= CRITICAL_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD) {
    reasons.push(
      `${point.activeSessions} active sessions hit the critical threshold (${CRITICAL_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD}+ active).`,
    );
  } else if (point.activeSessions >= WATCH_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD) {
    reasons.push(
      `${point.activeSessions} active sessions hit the watch threshold (${WATCH_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD}+ active).`,
    );
  }
  if (point.revokedSessions >= WATCH_SOURCE_GROUP_REVOKED_SESSION_THRESHOLD) {
    reasons.push(
      `${point.revokedSessions} revoked sessions hit the watch threshold (${WATCH_SOURCE_GROUP_REVOKED_SESSION_THRESHOLD}+ revoked).`,
    );
  }

  if (!reasons.length) {
    return [
      "No watch or critical thresholds are currently hit for this timeline point.",
    ];
  }

  return reasons;
}

function formatSourceGroupTimelineSessionMatchReason(
  reason: SourceGroupTimelineSessionMatchReason,
) {
  switch (reason) {
    case "active-threshold":
      return "Active threshold match";
    case "revoked-threshold":
      return "Revoked threshold match";
    case "refresh-reuse":
    default:
      return "Refresh reuse match";
  }
}

function buildMatchedSessionRouteFilters(
  match: SourceGroupTimelineMatchedSession,
): Partial<AdminSessionsRouteSearch> {
  return {
    query: match.session.id,
    status: match.session.status,
    revocationReason:
      match.session.status === "revoked" && match.session.revocationReason
        ? match.session.revocationReason
        : "all",
    scope: match.session.isCurrent ? "current" : "all",
    page: 1,
  };
}

function buildSourceGroupTimelineMatchedSessions(
  snapshot: CloudAdminSessionSourceGroupSnapshot,
  point: SourceGroupRiskTimelineDisplayPoint,
) {
  const timestampMs = parseTimelineTimestamp(point.timestamp);
  if (timestampMs === null) {
    return [];
  }

  const includeActiveThreshold =
    point.activeSessions >= WATCH_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD;
  const includeRevokedThreshold =
    point.revokedSessions >= WATCH_SOURCE_GROUP_REVOKED_SESSION_THRESHOLD;
  const includeRefreshReuse = point.refreshTokenReuseRevocations > 0;

  return snapshot.sessions
    .flatMap((session) => {
      const state = resolveSourceGroupTimelineSessionState(session, timestampMs);
      if (!state) {
        return [];
      }

      const reasons: SourceGroupTimelineSessionMatchReason[] = [];
      if (includeActiveThreshold && state === "active") {
        reasons.push("active-threshold");
      }
      if (includeRevokedThreshold && state === "revoked") {
        reasons.push("revoked-threshold");
      }
      if (
        includeRefreshReuse &&
        state === "revoked" &&
        session.revocationReason === "refresh-token-reuse"
      ) {
        reasons.push("refresh-reuse");
      }

      if (!reasons.length) {
        return [];
      }

      return [
        {
          session,
          state,
          reasons,
        } satisfies SourceGroupTimelineMatchedSession,
      ];
    })
    .sort((left, right) => {
      if (left.session.isCurrent !== right.session.isCurrent) {
        return left.session.isCurrent ? -1 : 1;
      }

      const leftCreatedAt = parseTimelineTimestamp(left.session.createdAt) ?? 0;
      const rightCreatedAt = parseTimelineTimestamp(right.session.createdAt) ?? 0;
      if (leftCreatedAt !== rightCreatedAt) {
        return rightCreatedAt - leftCreatedAt;
      }

      return left.session.id.localeCompare(right.session.id);
    });
}

function describeSourceGroupTimelineEventSummary(
  labels: string[],
  fallback = "Source state changed",
) {
  if (!labels.length) {
    return fallback;
  }

  return labels.join(" • ");
}

function buildSourceGroupRiskTimeline(
  snapshot: CloudAdminSessionSourceGroupSnapshot,
) {
  const eventLabelsByTimestamp = new Map<string, string[]>();
  const addEventLabel = (timestamp: string | null | undefined, label: string) => {
    if (!timestamp) {
      return;
    }

    const parsed = parseTimelineTimestamp(timestamp);
    if (parsed === null) {
      return;
    }

    const existing = eventLabelsByTimestamp.get(timestamp) ?? [];
    existing.push(label);
    eventLabelsByTimestamp.set(timestamp, existing);
  };

  for (const session of snapshot.sessions) {
    addEventLabel(session.createdAt, "Session issued");

    const expiresAt = parseTimelineTimestamp(session.expiresAt);
    const revokedAt = parseTimelineTimestamp(session.revokedAt);
    if (
      expiresAt !== null &&
      (revokedAt === null || expiresAt < revokedAt)
    ) {
      addEventLabel(session.expiresAt, "Session expired");
    }

    if (session.revokedAt) {
      addEventLabel(
        session.revokedAt,
        session.revocationReason === "refresh-token-reuse"
          ? "Refresh reuse revoke"
          : "Session revoked",
      );
    }
  }

  addEventLabel(snapshot.generatedAt, "Current snapshot");

  return [...eventLabelsByTimestamp.entries()]
    .sort(
      ([leftTimestamp], [rightTimestamp]) =>
        (parseTimelineTimestamp(leftTimestamp) ?? 0) -
        (parseTimelineTimestamp(rightTimestamp) ?? 0),
    )
    .map(([timestamp, labels], index) => {
      const timestampMs = parseTimelineTimestamp(timestamp) ?? 0;
      const counts = {
        activeSessions: 0,
        expiredSessions: 0,
        revokedSessions: 0,
        refreshTokenReuseRevocations: 0,
      };

      for (const session of snapshot.sessions) {
        const state = resolveSourceGroupTimelineSessionState(session, timestampMs);
        if (!state) {
          continue;
        }

        if (state === "active") {
          counts.activeSessions += 1;
        } else if (state === "expired") {
          counts.expiredSessions += 1;
        } else {
          counts.revokedSessions += 1;
          if (session.revocationReason === "refresh-token-reuse") {
            counts.refreshTokenReuseRevocations += 1;
          }
        }
      }

      const risk = resolveSourceGroupTimelineRiskState({
        activeSessions: counts.activeSessions,
        revokedSessions: counts.revokedSessions,
        refreshTokenReuseRevocations: counts.refreshTokenReuseRevocations,
      });

      return {
        id: `${timestamp}-${index}`,
        timestamp,
        eventSummary: describeSourceGroupTimelineEventSummary(
          labels,
          "Current snapshot",
        ),
        riskLevel: risk.riskLevel,
        riskSignals: risk.riskSignals,
        activeSessions: counts.activeSessions,
        expiredSessions: counts.expiredSessions,
        revokedSessions: counts.revokedSessions,
        refreshTokenReuseRevocations: counts.refreshTokenReuseRevocations,
      } satisfies SourceGroupRiskTimelinePoint;
    });
}

function buildSourceGroupRiskDailyTimeline(
  timeline: SourceGroupRiskTimelinePoint[],
) {
  const pointsByDay = new Map<string, SourceGroupRiskTimelinePoint[]>();

  for (const point of timeline) {
    const timestampMs = parseTimelineTimestamp(point.timestamp);
    if (timestampMs === null) {
      continue;
    }

    const day = new Date(timestampMs).toISOString().slice(0, 10);
    const existing = pointsByDay.get(day) ?? [];
    existing.push(point);
    pointsByDay.set(day, existing);
  }

  return [...pointsByDay.entries()]
    .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
    .map(([day, points]) => {
      let representativePoint = points[0];
      let latestTimestampMs =
        parseTimelineTimestamp(points[0]?.timestamp) ?? Date.parse(`${day}T00:00:00.000Z`);

      for (const point of points.slice(1)) {
        const pointSeverity = getRiskLevelSeverity(point.riskLevel);
        const representativeSeverity = getRiskLevelSeverity(
          representativePoint.riskLevel,
        );
        const pointTimestampMs = parseTimelineTimestamp(point.timestamp) ?? 0;
        const representativeTimestampMs =
          parseTimelineTimestamp(representativePoint.timestamp) ?? 0;

        if (
          pointSeverity > representativeSeverity ||
          (pointSeverity === representativeSeverity &&
            pointTimestampMs > representativeTimestampMs)
        ) {
          representativePoint = point;
        }

        if (pointTimestampMs > latestTimestampMs) {
          latestTimestampMs = pointTimestampMs;
        }
      }

      return {
        ...representativePoint,
        id: `${day}-daily`,
        day,
        pointCount: points.length,
        timestamp: new Date(latestTimestampMs).toISOString(),
        eventSummary: `Daily summary of ${points.length} timeline point(s)`,
      } satisfies SourceGroupRiskTimelineDailyPoint;
    });
}

function buildSourceGroupRiskWeeklyTimeline(
  timeline: SourceGroupRiskTimelinePoint[],
) {
  const pointsByWeek = new Map<string, SourceGroupRiskTimelinePoint[]>();

  for (const point of timeline) {
    const timestampMs = parseTimelineTimestamp(point.timestamp);
    if (timestampMs === null) {
      continue;
    }

    const weekStart = getTimelineWeekStart(timestampMs);
    const existing = pointsByWeek.get(weekStart) ?? [];
    existing.push(point);
    pointsByWeek.set(weekStart, existing);
  }

  return [...pointsByWeek.entries()]
    .sort(([leftWeekStart], [rightWeekStart]) =>
      leftWeekStart.localeCompare(rightWeekStart),
    )
    .map(([weekStart, points]) => {
      let representativePoint = points[0];
      let latestTimestampMs =
        parseTimelineTimestamp(points[0]?.timestamp) ??
        Date.parse(`${weekStart}T00:00:00.000Z`);

      for (const point of points.slice(1)) {
        const pointSeverity = getRiskLevelSeverity(point.riskLevel);
        const representativeSeverity = getRiskLevelSeverity(
          representativePoint.riskLevel,
        );
        const pointTimestampMs = parseTimelineTimestamp(point.timestamp) ?? 0;
        const representativeTimestampMs =
          parseTimelineTimestamp(representativePoint.timestamp) ?? 0;

        if (
          pointSeverity > representativeSeverity ||
          (pointSeverity === representativeSeverity &&
            pointTimestampMs > representativeTimestampMs)
        ) {
          representativePoint = point;
        }

        if (pointTimestampMs > latestTimestampMs) {
          latestTimestampMs = pointTimestampMs;
        }
      }

      return {
        ...representativePoint,
        id: `${weekStart}-weekly`,
        weekStart,
        weekEnd: addUtcDays(weekStart, 6),
        pointCount: points.length,
        timestamp: new Date(latestTimestampMs).toISOString(),
        eventSummary: `Weekly summary of ${points.length} timeline point(s)`,
      } satisfies SourceGroupRiskTimelineWeeklyPoint;
    });
}

function buildSourceGroupRiskSnapshotCsv(
  snapshot: CloudAdminSessionSourceGroupRiskSnapshot,
) {
  const headers = [
    "sourceKey",
    "riskLevel",
    "riskSignals",
    "issuedFromIp",
    "issuedUserAgent",
    "totalSessions",
    "activeSessions",
    "expiredSessions",
    "revokedSessions",
    "refreshTokenReuseRevocations",
    "currentSessions",
    "latestCreatedAt",
    "latestLastUsedAt",
    "latestRevokedAt",
  ];
  const lines = [headers.join(",")];

  for (const group of snapshot.groups) {
    lines.push(
      [
        group.sourceKey,
        group.riskLevel,
        group.riskSignals.join(";"),
        group.issuedFromIp ?? "",
        group.issuedUserAgent ?? "",
        group.totalSessions,
        group.activeSessions,
        group.expiredSessions,
        group.revokedSessions,
        group.refreshTokenReuseRevocations,
        group.currentSessions,
        group.latestCreatedAt ?? "",
        group.latestLastUsedAt ?? "",
        group.latestRevokedAt ?? "",
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  }

  return lines.join("\n");
}

function buildSourceGroupRiskSessionsCsvFilename(
  riskLevel: CloudAdminSessionSourceGroupRiskLevel,
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `admin-session-source-groups-${riskLevel}-risk-sessions-${timestamp}.csv`;
}

function buildSourceGroupRiskSessionsCsv(
  snapshot: CloudAdminSessionSourceGroupRiskSnapshot,
) {
  const headers = [
    "sessionId",
    "sourceKey",
    "riskLevel",
    "riskSignals",
    "status",
    "isCurrent",
    "expiresAt",
    "issuedFromIp",
    "issuedUserAgent",
    "lastUsedAt",
    "lastUsedIp",
    "lastUsedUserAgent",
    "lastRefreshedAt",
    "revokedAt",
    "revokedBySessionId",
    "revocationReason",
    "createdAt",
    "updatedAt",
  ];
  const lines = [headers.join(",")];
  const groupBySource = new Map(
    snapshot.groups.map((group) => [
      buildSourceGroupLookupKey(group.issuedFromIp, group.issuedUserAgent),
      group,
    ]),
  );

  for (const session of snapshot.sessions) {
    const group = groupBySource.get(
      buildSourceGroupLookupKey(session.issuedFromIp, session.issuedUserAgent),
    );
    lines.push(
      [
        session.id,
        group?.sourceKey ?? "",
        group?.riskLevel ?? "",
        group?.riskSignals.join(";") ?? "",
        session.status,
        session.isCurrent,
        session.expiresAt,
        session.issuedFromIp ?? "",
        session.issuedUserAgent ?? "",
        session.lastUsedAt ?? "",
        session.lastUsedIp ?? "",
        session.lastUsedUserAgent ?? "",
        session.lastRefreshedAt ?? "",
        session.revokedAt ?? "",
        session.revokedBySessionId ?? "",
        session.revocationReason ?? "",
        session.createdAt,
        session.updatedAt,
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  }

  return lines.join("\n");
}

function buildSourceGroupRiskTimelineCsvFilename(
  snapshot: CloudAdminSessionSourceGroupSnapshot,
  view: SourceGroupRiskTimelineView,
) {
  const ipPart = (snapshot.group.issuedFromIp ?? "unknown-ip").replace(
    /[^a-z0-9.-]+/gi,
    "-",
  );
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix =
    view === "daily" ? "-daily" : view === "weekly" ? "-weekly" : "";
  return `admin-session-source-group-${ipPart}-risk-timeline${suffix}-${timestamp}.csv`;
}

function buildSourceGroupRiskTimelineCsv(
  snapshot: CloudAdminSessionSourceGroupSnapshot,
  timeline: SourceGroupRiskTimelineDisplayPoint[],
  view: SourceGroupRiskTimelineView,
) {
  const headers =
    view === "daily"
      ? [
          "sourceKey",
          "issuedFromIp",
          "issuedUserAgent",
          "day",
          "pointCount",
          "timestamp",
          "eventSummary",
          "riskLevel",
          "riskSignals",
          "activeSessions",
          "expiredSessions",
          "revokedSessions",
          "refreshTokenReuseRevocations",
        ]
      : view === "weekly"
        ? [
            "sourceKey",
            "issuedFromIp",
            "issuedUserAgent",
            "weekStart",
            "weekEnd",
            "pointCount",
            "timestamp",
            "eventSummary",
            "riskLevel",
            "riskSignals",
            "activeSessions",
            "expiredSessions",
            "revokedSessions",
            "refreshTokenReuseRevocations",
          ]
        : [
            "sourceKey",
            "issuedFromIp",
            "issuedUserAgent",
            "timestamp",
            "eventSummary",
            "riskLevel",
            "riskSignals",
            "activeSessions",
            "expiredSessions",
            "revokedSessions",
            "refreshTokenReuseRevocations",
          ];
  const lines = [headers.join(",")];

  for (const point of timeline) {
    lines.push(
      (
        view === "daily"
          ? [
              snapshot.group.sourceKey,
              snapshot.group.issuedFromIp ?? "",
              snapshot.group.issuedUserAgent ?? "",
              "day" in point ? point.day : "",
              "pointCount" in point ? point.pointCount : "",
              point.timestamp,
              point.eventSummary,
              point.riskLevel,
              point.riskSignals.join(";"),
              point.activeSessions,
              point.expiredSessions,
              point.revokedSessions,
              point.refreshTokenReuseRevocations,
            ]
          : view === "weekly"
            ? [
                snapshot.group.sourceKey,
                snapshot.group.issuedFromIp ?? "",
                snapshot.group.issuedUserAgent ?? "",
                "weekStart" in point ? point.weekStart : "",
                "weekEnd" in point ? point.weekEnd : "",
                "pointCount" in point ? point.pointCount : "",
                point.timestamp,
                point.eventSummary,
                point.riskLevel,
                point.riskSignals.join(";"),
                point.activeSessions,
                point.expiredSessions,
                point.revokedSessions,
                point.refreshTokenReuseRevocations,
              ]
          : [
              snapshot.group.sourceKey,
              snapshot.group.issuedFromIp ?? "",
              snapshot.group.issuedUserAgent ?? "",
              point.timestamp,
              point.eventSummary,
              point.riskLevel,
              point.riskSignals.join(";"),
              point.activeSessions,
              point.expiredSessions,
              point.revokedSessions,
              point.refreshTokenReuseRevocations,
            ]
      )
        .map(escapeCsvValue)
        .join(","),
    );
  }

  return lines.join("\n");
}

const ADMIN_SESSION_PRESETS: Array<{
  id: string;
  label: string;
  apply: Partial<AdminSessionsRouteSearch>;
}> = [
  {
    id: "current",
    label: "Current session",
    apply: {
      ...DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH,
      scope: "current",
    },
  },
  {
    id: "recently-revoked",
    label: "Recently revoked",
    apply: {
      ...DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH,
      status: "revoked",
      sortBy: "revokedAt",
      sortDirection: "desc",
    },
  },
  {
    id: "expiring-soon",
    label: "Expiring soon",
    apply: {
      ...DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH,
      status: "active",
      sortBy: "expiresAt",
      sortDirection: "asc",
    },
  },
];

export function AdminSessionsPage() {
  const cloudConsoleQueryKey = ["cloud-console"] as const;
  const navigate = useNavigate({ from: "/sessions" });
  const filters = useSearch({ from: "/sessions" });
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();
  const adminSessionsSectionRef = useRef<HTMLElement | null>(null);
  const [pendingSession, setPendingSession] =
    useState<CloudAdminSessionSummary | null>(null);
  const [pendingBulkSessionIds, setPendingBulkSessionIds] = useState<string[]>(
    [],
  );
  const [pendingFilteredRevoke, setPendingFilteredRevoke] = useState(false);
  const [pendingRiskGroupRevoke, setPendingRiskGroupRevoke] = useState(false);
  const [pendingSourceGroup, setPendingSourceGroup] =
    useState<PendingSourceGroupRevoke | null>(null);
  const [highlightedOperationReceipts, setHighlightedOperationReceipts] = useState<
    HighlightedSessionOperationReceipt[]
  >([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [highlightedSessionId, setHighlightedSessionId] = useState<string>("");
  const [expandedTimelinePointIds, setExpandedTimelinePointIds] = useState<
    string[]
  >([]);
  const [timelineView, setTimelineView] =
    useState<SourceGroupRiskTimelineView>("events");

  function recordHighlightedOperationReceipt(
    receipt: Omit<HighlightedSessionOperationReceipt, "createdAt">,
  ) {
    setHighlightedOperationReceipts((previous) =>
      prependHighlightedOperationReceipt(previous, receipt),
    );
  }

  function showAdminSessionsMutationNotice(notice: RequestScopedNotice) {
    showRequestScopedNoticeAndInvalidate(showNotice, notice, {
      queryClient,
      queryKey: cloudConsoleQueryKey,
    });
  }

  function showAdminSessionsNotice(notice: RequestScopedNotice) {
    showRequestScopedNotice(showNotice, notice);
  }

  function showAdminSessionsErrorNotice(error: unknown) {
    showCloudAdminErrorNotice(showNotice, error);
  }

  function requireSourceRiskFilter(
    action: Parameters<typeof getAdminSessionSourceRiskGuardMessage>[0],
  ) {
    if (filters.sourceRiskLevel === "all") {
      throw new Error(getAdminSessionSourceRiskGuardMessage(action));
    }

    return filters.sourceRiskLevel;
  }

  function requireFocusedSourceSnapshotSummary() {
    if (!highlightedFocusedSourceSummary) {
      throw new Error(ADMIN_SESSION_FOCUSED_SOURCE_SNAPSHOT_UNAVAILABLE_MESSAGE);
    }

    return highlightedFocusedSourceSummary;
  }

  function getAdminSessionsErrorMessage(error: unknown) {
    return error instanceof Error
      ? error.message
      : "Unknown admin sessions error.";
  }

  function buildHighlightedSessionReceiptContext(
    session: Pick<
      CloudAdminSessionSummary,
      "id" | "issuedFromIp" | "issuedUserAgent"
    >,
  ): HighlightedOperationReceiptContext {
    return {
      sessionId: session.id,
      sourceKey: sessionFilters.sourceKey,
      sourceIssuedFromIp: session.issuedFromIp,
      sourceIssuedUserAgent: session.issuedUserAgent,
    };
  }

  function buildHighlightedSourceReceiptContext(
    group: Pick<
      CloudAdminSessionSourceGroupSummary,
      "sourceKey" | "issuedFromIp" | "issuedUserAgent"
    >,
  ): HighlightedOperationReceiptContext {
    return {
      sourceKey: group.sourceKey,
      sessionId: highlightedSessionId || undefined,
      sourceIssuedFromIp: group.issuedFromIp,
      sourceIssuedUserAgent: group.issuedUserAgent,
    };
  }

  function buildFocusedSourceReceiptContext() {
    return highlightedFocusedSourceSummary
      ? buildHighlightedSourceReceiptContext(highlightedFocusedSourceSummary)
      : null;
  }

  function recordHighlightedNoticeReceipt(
    kind: HighlightedSessionOperationReceipt["kind"],
    context: HighlightedOperationReceiptContext,
    notice: RequestScopedNotice,
  ) {
    recordHighlightedOperationReceipt(
      createNoticeHighlightedOperationReceipt(kind, context, notice),
    );
  }

  function recordHighlightedErrorReceipt(
    kind: HighlightedSessionOperationReceipt["kind"],
    context: HighlightedOperationReceiptContext,
    error: unknown,
  ) {
    recordHighlightedOperationReceipt(
      createErrorHighlightedOperationReceipt(
        kind,
        context,
        getAdminSessionsErrorMessage(error),
        getCloudAdminApiErrorRequestId(error),
      ),
    );
  }

  function describeSourceRiskSelection() {
    return hasSourceRiskFilter
      ? `Risk filter: ${formatSourceGroupRiskFilterLabel(filters.sourceRiskLevel)}.`
      : getAdminSessionSourceRiskSelectionPrompt();
  }

  function clearSelectedAdminSessions() {
    setSelectedSessionIds([]);
  }

  function settlePendingSessionMutation() {
    setPendingSession(null);
  }

  function settlePendingBulkRevoke() {
    setPendingBulkSessionIds([]);
    clearSelectedAdminSessions();
  }

  function dismissPendingBulkRevoke() {
    setPendingBulkSessionIds([]);
  }

  function settlePendingFilteredRevoke() {
    setPendingFilteredRevoke(false);
    clearSelectedAdminSessions();
  }

  function dismissPendingFilteredRevoke() {
    setPendingFilteredRevoke(false);
  }

  function settlePendingSourceGroupRevoke() {
    setPendingSourceGroup(null);
    clearSelectedAdminSessions();
  }

  function dismissPendingSourceGroupRevoke() {
    setPendingSourceGroup(null);
  }

  function settlePendingRiskGroupRevoke() {
    setPendingRiskGroupRevoke(false);
    clearSelectedAdminSessions();
  }

  function dismissPendingRiskGroupRevoke() {
    setPendingRiskGroupRevoke(false);
  }

  function updateFilters(next: Partial<AdminSessionsRouteSearch>) {
    const shouldResetPages =
      Object.prototype.hasOwnProperty.call(next, "status") ||
      Object.prototype.hasOwnProperty.call(next, "revocationReason") ||
      Object.prototype.hasOwnProperty.call(next, "scope") ||
      Object.prototype.hasOwnProperty.call(next, "query") ||
      Object.prototype.hasOwnProperty.call(next, "sourceKey") ||
      Object.prototype.hasOwnProperty.call(next, "sourceIssuedFromIp") ||
      Object.prototype.hasOwnProperty.call(next, "sourceIssuedUserAgent") ||
      Object.prototype.hasOwnProperty.call(next, "sourceRiskLevel");
    const normalizedNext: Partial<AdminSessionsRouteSearch> = { ...next };
    if (shouldResetPages && normalizedNext.page === undefined) {
      normalizedNext.page = 1;
    }
    if (shouldResetPages && normalizedNext.sourcePage === undefined) {
      normalizedNext.sourcePage = 1;
    }

    void navigate({
      replace: true,
      search: (previous) =>
        buildAdminSessionsRouteSearch({ ...previous, ...normalizedNext }),
    });
  }

  const currentPermalink = useMemo(
    () => buildAdminSessionsPermalink(filters),
    [filters],
  );

  async function copyAdminSessionsPermalink() {
    const absolutePermalink =
      typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}${currentPermalink}`
        : currentPermalink;
    const copied = await copyTextToClipboard(absolutePermalink);

    showNotice(
      copied
        ? "Admin sessions permalink copied."
        : "Clipboard copy failed in this environment.",
      copied ? "success" : "danger",
    );
  }

  const sessionFilters = {
    status: filters.status === "all" ? undefined : filters.status,
    revocationReason:
      filters.revocationReason === "all"
        ? undefined
        : filters.revocationReason,
    currentOnly: filters.scope === "current" ? true : undefined,
    query: filters.query || undefined,
    sourceKey: filters.sourceKey || undefined,
  };
  const sourceGroupFilters = {
    ...sessionFilters,
    riskLevel:
      filters.sourceRiskLevel === "all"
        ? undefined
        : filters.sourceRiskLevel,
  };

  const sessionsQuery = useQuery({
    queryKey: [
      "cloud-console",
      "admin-sessions",
      filters.status,
      filters.revocationReason,
      filters.scope,
      filters.query,
      filters.sourceKey,
      filters.sortBy,
      filters.sortDirection,
      filters.page,
      filters.pageSize,
    ],
    queryFn: () =>
      cloudAdminApi.listAdminSessions({
        ...sessionFilters,
        sortBy: filters.sortBy,
        sortDirection: filters.sortDirection,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
    refetchInterval: 15_000,
  });
  const sourceGroupsQuery = useQuery({
    queryKey: [
      "cloud-console",
      "admin-session-source-groups",
      filters.status,
      filters.revocationReason,
      filters.scope,
      filters.query,
      filters.sourceKey,
      filters.sourceRiskLevel,
      filters.sourceSortBy,
      filters.sourceSortDirection,
      filters.sourcePage,
      filters.sourcePageSize,
    ],
    queryFn: () =>
      cloudAdminApi.listAdminSessionSourceGroups({
        ...sourceGroupFilters,
        sortBy: filters.sourceSortBy,
        sortDirection: filters.sourceSortDirection,
        page: filters.sourcePage,
        pageSize: filters.sourcePageSize,
    }),
    refetchInterval: 15_000,
  });
  const focusedSourceSnapshotQuery = useQuery({
    queryKey: [
      "cloud-console",
      "admin-session-source-group-snapshot",
      filters.status,
      filters.revocationReason,
      filters.scope,
      filters.query,
      filters.sourceKey,
    ],
    enabled: Boolean(filters.sourceKey),
    queryFn: () =>
      cloudAdminApi.createAdminSessionSourceGroupSnapshot({
        ...sessionFilters,
        sourceKey: filters.sourceKey,
      }),
    refetchInterval: 15_000,
  });
  const revokeMutation = useMutation({
    mutationFn: (session: CloudAdminSessionSummary) =>
      cloudAdminApi.revokeAdminSessionByIdWithMeta(session.id),
    onSuccess: (response, session) => {
      settlePendingSessionMutation();
      const notice = createRequestScopedNotice(
        session.isCurrent
          ? "Current admin session revoked. Console will re-issue a short-lived token on the next request."
          : "Admin session revoked.",
        session.isCurrent ? "warning" : "success",
        response.requestId,
      );
      showAdminSessionsMutationNotice(notice);
      if (session.id === highlightedSessionId) {
        recordHighlightedNoticeReceipt(
          "session-revoke",
          buildHighlightedSessionReceiptContext(session),
          notice,
        );
      }
    },
    onError: (error, session) => {
      settlePendingSessionMutation();
      showAdminSessionsErrorNotice(error);
      if (session.id === highlightedSessionId) {
        recordHighlightedErrorReceipt(
          "session-revoke",
          buildHighlightedSessionReceiptContext(session),
          error,
        );
      }
    },
  });
  const bulkRevokeMutation = useMutation({
    mutationFn: (sessionIds: string[]) =>
      cloudAdminApi.revokeAdminSessionsByIdWithMeta(sessionIds),
    onSuccess: (response, sessionIds) => {
      const revokedCount = response.data.revokedSessionIds.length;
      const skippedCount = response.data.skippedSessionIds.length;
      const revokedCurrentSession = sessionIds.some((sessionId) => {
        const session = sessionsQuery.data?.items.find((item) => item.id === sessionId);
        return session?.isCurrent;
      });

      settlePendingBulkRevoke();
      showAdminSessionsMutationNotice(
        createSessionRevokeNotice({
          requestId: response.requestId,
          revokedCount,
          skippedCount,
          revokedCurrentSession,
          zeroMessage:
            "No selected admin sessions were revoked. The list may already be stale.",
          successMessage: (count) => `Revoked ${count} selected session(s).`,
          skippedMessage: (count) =>
            `${count} session(s) were already unavailable.`,
        }),
      );
    },
    onError: (error) => {
      dismissPendingBulkRevoke();
      showAdminSessionsErrorNotice(error);
    },
  });
  const filteredRevokeMutation = useMutation({
    mutationFn: () => cloudAdminApi.revokeFilteredAdminSessionsWithMeta(sessionFilters),
    onSuccess: (response) => {
      settlePendingFilteredRevoke();
      showAdminSessionsMutationNotice(
        createSessionRevokeNotice({
          requestId: response.requestId,
          revokedCount: response.data.revokedCount,
          skippedCount: response.data.skippedCount,
          revokedCurrentSession: response.data.revokedCurrentSession,
          zeroMessage: "No matching active admin sessions were revoked.",
          successMessage: (count) =>
            `Revoked ${count} matching active session(s).`,
          skippedMessage: (count) =>
            `${count} session(s) were skipped because they were already unavailable.`,
        }),
      );
    },
    onError: (error) => {
      dismissPendingFilteredRevoke();
      showAdminSessionsErrorNotice(error);
    },
  });
  const sourceGroupRevokeMutation = useMutation({
    mutationFn: (payload: PendingSourceGroupRevoke) =>
      cloudAdminApi.revokeAdminSessionSourceGroupWithMeta({
        status: filters.status === "all" ? undefined : filters.status,
        revocationReason:
          filters.revocationReason === "all"
            ? undefined
            : filters.revocationReason,
        currentOnly:
          payload.mode === "filtered" && filters.scope === "current"
            ? true
            : undefined,
        query:
          payload.mode === "filtered" ? filters.query || undefined : undefined,
        sourceKey: payload.group.sourceKey,
      }),
    onSuccess: (response, payload) => {
      settlePendingSourceGroupRevoke();
      const notice = createSessionRevokeNotice({
        requestId: response.requestId,
        revokedCount: response.data.revokedCount,
        skippedCount: response.data.skippedCount,
        revokedCurrentSession: response.data.revokedCurrentSession,
        zeroMessage:
          "No active admin sessions in the selected source group were revoked.",
        successMessage: (count) =>
          `Revoked ${count} matching active session(s) in the selected source group.`,
        skippedMessage: (count) =>
          `${count} session(s) were skipped because they were already unavailable.`,
      });
      showAdminSessionsMutationNotice(notice);
      if (payload.mode === "focused-source") {
        recordHighlightedNoticeReceipt(
          "focused-source-revoke",
          buildHighlightedSourceReceiptContext(payload.group),
          notice,
        );
      }
    },
    onError: (error, payload) => {
      dismissPendingSourceGroupRevoke();
      showAdminSessionsErrorNotice(error);
      if (payload.mode === "focused-source") {
        recordHighlightedErrorReceipt(
          "focused-source-revoke",
          buildHighlightedSourceReceiptContext(payload.group),
          error,
        );
      }
    },
  });
  const sourceGroupSnapshotMutation = useMutation({
    mutationFn: async (group: CloudAdminSessionSourceGroupSummary) => {
      const response = await cloudAdminApi.createAdminSessionSourceGroupSnapshotWithMeta({
        ...sessionFilters,
        sourceKey: group.sourceKey,
      });
      return withDownloadedJsonFile(
        {
          snapshot: response.data,
          requestId: response.requestId,
        },
        buildSourceGroupSnapshotFilename(group),
        response.data,
      );
    },
    onSuccess: ({ snapshot, requestId, downloaded }) => {
      showAdminSessionsNotice(
        createAdminSessionArtifactDownloadNotice({
          kind: "admin-session-audit-snapshot",
          requestId,
          downloaded,
          totalSessions: snapshot.group.totalSessions,
        }),
      );
    },
    onError: (error) => {
      showAdminSessionsErrorNotice(error);
    },
  });
  const focusedSourceSnapshotExportMutation = useMutation({
    mutationFn: async () => {
      const focusedSourceSummary = requireFocusedSourceSnapshotSummary();

      const response = await cloudAdminApi.createAdminSessionSourceGroupSnapshotWithMeta(
        {
          ...sessionFilters,
          sourceKey: focusedSourceSummary.sourceKey,
        },
      );
      return withDownloadedJsonFile(
        {
          group: focusedSourceSummary,
          snapshot: response.data,
          requestId: response.requestId,
        },
        buildSourceGroupSnapshotFilename(focusedSourceSummary),
        response.data,
      );
    },
    onSuccess: ({ downloaded, group, requestId, snapshot }) => {
      const notice = createAdminSessionArtifactDownloadNotice({
        kind: "focused-source-snapshot",
        requestId,
        downloaded,
        totalSessions: snapshot.group.totalSessions,
      });
      showAdminSessionsNotice(notice);
      recordHighlightedNoticeReceipt(
        "focused-source-snapshot",
        buildHighlightedSourceReceiptContext(group),
        notice,
      );
    },
    onError: (error) => {
      showAdminSessionsErrorNotice(error);
      const context = buildFocusedSourceReceiptContext();
      if (!context) {
        return;
      }

      recordHighlightedErrorReceipt(
        "focused-source-snapshot",
        context,
        error,
      );
    },
  });
  const sourceGroupRiskSnapshotMutation = useMutation({
    mutationFn: async () => {
      const riskLevel = requireSourceRiskFilter("snapshot");

      const response = await cloudAdminApi.createAdminSessionSourceGroupRiskSnapshotWithMeta({
        ...sessionFilters,
        riskLevel,
      });
      return withDownloadedJsonFile(
        {
          snapshot: response.data,
          requestId: response.requestId,
        },
        buildSourceGroupRiskSnapshotFilename(riskLevel),
        response.data,
      );
    },
    onSuccess: ({ snapshot, requestId, downloaded }) => {
      showAdminSessionsNotice(
        createAdminSessionArtifactDownloadNotice({
          kind: "risk-snapshot",
          requestId,
          downloaded,
          totalGroups: snapshot.totalGroups,
          totalSessions: snapshot.totalSessions,
        }),
      );
    },
    onError: (error) => {
      showAdminSessionsErrorNotice(error);
    },
  });
  const sourceGroupRiskGroupsCsvMutation = useMutation({
    mutationFn: async () => {
      const riskLevel = requireSourceRiskFilter("groups-csv");

      const response = await cloudAdminApi.createAdminSessionSourceGroupRiskSnapshotWithMeta({
        ...sessionFilters,
        riskLevel,
      });
      return withDownloadedTextFile(
        {
          snapshot: response.data,
          requestId: response.requestId,
        },
        buildSourceGroupRiskCsvFilename(riskLevel),
        buildSourceGroupRiskSnapshotCsv(response.data),
        "text/csv;charset=utf-8",
      );
    },
    onSuccess: ({ snapshot, requestId, downloaded }) => {
      showAdminSessionsNotice(
        createAdminSessionArtifactDownloadNotice({
          kind: "risk-groups-csv",
          requestId,
          downloaded,
          totalGroups: snapshot.totalGroups,
        }),
      );
    },
    onError: (error) => {
      showAdminSessionsErrorNotice(error);
    },
  });
  const sourceGroupRiskSessionsCsvMutation = useMutation({
    mutationFn: async () => {
      const riskLevel = requireSourceRiskFilter("sessions-csv");

      const response = await cloudAdminApi.createAdminSessionSourceGroupRiskSnapshotWithMeta({
        ...sessionFilters,
        riskLevel,
      });
      return withDownloadedTextFile(
        {
          snapshot: response.data,
          requestId: response.requestId,
        },
        buildSourceGroupRiskSessionsCsvFilename(riskLevel),
        buildSourceGroupRiskSessionsCsv(response.data),
        "text/csv;charset=utf-8",
      );
    },
    onSuccess: ({ snapshot, requestId, downloaded }) => {
      showAdminSessionsNotice(
        createAdminSessionArtifactDownloadNotice({
          kind: "risk-sessions-csv",
          requestId,
          downloaded,
          totalSessions: snapshot.totalSessions,
        }),
      );
    },
    onError: (error) => {
      showAdminSessionsErrorNotice(error);
    },
  });
  const sourceGroupRiskRevokeMutation = useMutation({
    mutationFn: () => {
      const riskLevel = requireSourceRiskFilter("revoke");

      return cloudAdminApi.revokeAdminSessionSourceGroupsByRiskWithMeta({
        ...sessionFilters,
        riskLevel,
      });
    },
    onSuccess: (response) => {
      settlePendingRiskGroupRevoke();
      showAdminSessionsMutationNotice(
        createRiskGroupRevokeNotice({
          requestId: response.requestId,
          matchedGroupCount: response.data.matchedGroupCount,
          revokedGroupCount: response.data.revokedGroupCount,
          revokedSessionCount: response.data.revokedSessionCount,
          skippedSessionCount: response.data.skippedSessionCount,
          revokedCurrentSession: response.data.revokedCurrentSession,
        }),
      );
    },
    onError: (error) => {
      dismissPendingRiskGroupRevoke();
      showAdminSessionsErrorNotice(error);
    },
  });

  useEffect(() => {
    if (!sessionsQuery.data) {
      return;
    }
    if (filters.page <= sessionsQuery.data.totalPages) {
      return;
    }

    updateFilters({
      page: sessionsQuery.data.totalPages,
    });
  }, [filters.page, sessionsQuery.data]);

  useEffect(() => {
    if (!sourceGroupsQuery.data) {
      return;
    }
    if (filters.sourcePage <= sourceGroupsQuery.data.totalPages) {
      return;
    }

    updateFilters({
      sourcePage: sourceGroupsQuery.data.totalPages,
    });
  }, [filters.sourcePage, sourceGroupsQuery.data]);

  const sessions = sessionsQuery.data?.items ?? [];
  const sourceGroups = sourceGroupsQuery.data?.items ?? [];
  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === "active"),
    [sessions],
  );
  const activeSessionIds = useMemo(
    () => new Set(activeSessions.map((session) => session.id)),
    [activeSessions],
  );

  useEffect(() => {
    setSelectedSessionIds((previous) =>
      previous.filter((sessionId) => activeSessionIds.has(sessionId)),
    );
  }, [activeSessionIds]);

  useEffect(() => {
    setTimelineView("events");
  }, [filters.sourceKey]);

  useEffect(() => {
    setExpandedTimelinePointIds([]);
  }, [filters.sourceKey, timelineView]);

  const total = sessionsQuery.data?.total ?? 0;
  const totalPages = sessionsQuery.data?.totalPages ?? 1;
  const sourceGroupTotal = sourceGroupsQuery.data?.total ?? 0;
  const sourceGroupTotalPages = sourceGroupsQuery.data?.totalPages ?? 1;
  const hasSourceFocus = Boolean(filters.sourceKey);
  const hasSourceRiskFilter = filters.sourceRiskLevel !== "all";
  const selectedSessions = sessions.filter((session) =>
    selectedSessionIds.includes(session.id),
  );
  const selectedCurrentSession = selectedSessions.some(
    (session) => session.isCurrent,
  );
  const allActiveSelected =
    activeSessions.length > 0 && activeSessions.every((session) => selectedSessionIds.includes(session.id));
  const isRevoking =
    revokeMutation.isPending ||
    bulkRevokeMutation.isPending ||
    filteredRevokeMutation.isPending ||
    sourceGroupRevokeMutation.isPending ||
    sourceGroupRiskRevokeMutation.isPending;
  const summary = useMemo(
    () => describeVisibleRange(total, filters.page, filters.pageSize, sessions.length),
    [filters.page, filters.pageSize, sessions.length, total],
  );
  const sourceGroupSummary = useMemo(
    () =>
      describeSourceGroupRange(
        sourceGroupTotal,
        filters.sourcePage,
        filters.sourcePageSize,
        sourceGroups.length,
      ),
    [filters.sourcePage, filters.sourcePageSize, sourceGroupTotal, sourceGroups.length],
  );
  const focusedSourceRiskTimeline = useMemo(() => {
    if (!focusedSourceSnapshotQuery.data) {
      return [];
    }

    return buildSourceGroupRiskTimeline(focusedSourceSnapshotQuery.data);
  }, [focusedSourceSnapshotQuery.data]);
  const focusedSourceDailyRiskTimeline = useMemo(
    () => buildSourceGroupRiskDailyTimeline(focusedSourceRiskTimeline),
    [focusedSourceRiskTimeline],
  );
  const focusedSourceWeeklyRiskTimeline = useMemo(
    () => buildSourceGroupRiskWeeklyTimeline(focusedSourceRiskTimeline),
    [focusedSourceRiskTimeline],
  );
  const visibleFocusedSourceRiskTimeline = useMemo<
    SourceGroupRiskTimelineDisplayPoint[]
  >(
    () =>
      timelineView === "daily"
        ? focusedSourceDailyRiskTimeline
        : timelineView === "weekly"
          ? focusedSourceWeeklyRiskTimeline
        : focusedSourceRiskTimeline,
    [
      focusedSourceDailyRiskTimeline,
      focusedSourceRiskTimeline,
      focusedSourceWeeklyRiskTimeline,
      timelineView,
    ],
  );
  const focusedSourceTimelineSummary = useMemo(() => {
    if (!focusedSourceRiskTimeline.length) {
      return null;
    }

    if (timelineView === "daily") {
      return `${focusedSourceRiskTimeline.length} event point(s) grouped into ${focusedSourceDailyRiskTimeline.length} day(s).`;
    }

    if (timelineView === "weekly") {
      return `${focusedSourceRiskTimeline.length} event point(s) grouped into ${focusedSourceWeeklyRiskTimeline.length} week(s).`;
    }

    return `${focusedSourceRiskTimeline.length} event point(s).`;
  }, [
    focusedSourceDailyRiskTimeline.length,
    focusedSourceRiskTimeline.length,
    focusedSourceWeeklyRiskTimeline.length,
    timelineView,
  ]);
  const latestFocusedSourceRiskPoint =
    visibleFocusedSourceRiskTimeline[visibleFocusedSourceRiskTimeline.length - 1] ??
    null;
  const latestFocusedSourceRiskReasons = useMemo(
    () =>
      latestFocusedSourceRiskPoint
        ? describeSourceGroupTimelineRiskReasons(latestFocusedSourceRiskPoint)
        : [],
    [latestFocusedSourceRiskPoint],
  );
  const visibleFocusedSourceTimelineMatchedSessions = useMemo(() => {
    const matches = new Map<string, SourceGroupTimelineMatchedSession[]>();
    if (!focusedSourceSnapshotQuery.data) {
      return matches;
    }

    for (const point of visibleFocusedSourceRiskTimeline) {
      matches.set(
        point.id,
        buildSourceGroupTimelineMatchedSessions(
          focusedSourceSnapshotQuery.data,
          point,
        ),
      );
    }

    return matches;
  }, [focusedSourceSnapshotQuery.data, visibleFocusedSourceRiskTimeline]);
  const highlightedFocusedSourceSummary = useMemo(() => {
    if (!focusedSourceSnapshotQuery.data || !highlightedSessionId) {
      return null;
    }

    const containsHighlightedSession = focusedSourceSnapshotQuery.data.sessions.some(
      (session) => session.id === highlightedSessionId,
    );
    return containsHighlightedSession ? focusedSourceSnapshotQuery.data.group : null;
  }, [focusedSourceSnapshotQuery.data, highlightedSessionId]);
  const visibleHighlightedOperationReceipts = useMemo(
    () =>
      highlightedOperationReceipts.filter((receipt) =>
        matchesHighlightedOperationReceiptContext(
          receipt,
          highlightedSessionId,
          filters.sourceKey || undefined,
        ),
      ),
    [filters.sourceKey, highlightedOperationReceipts, highlightedSessionId],
  );
  const latestFocusedSourceMatchedSessions = useMemo(() => {
    if (!latestFocusedSourceRiskPoint) {
      return [];
    }

    return (
      visibleFocusedSourceTimelineMatchedSessions.get(latestFocusedSourceRiskPoint.id) ??
      []
    );
  }, [latestFocusedSourceRiskPoint, visibleFocusedSourceTimelineMatchedSessions]);

  function clearVisibleHighlightedOperationReceipts() {
    setHighlightedOperationReceipts((previous) =>
      previous.filter(
        (receipt) =>
          !matchesHighlightedOperationReceiptContext(
            receipt,
            highlightedSessionId,
            filters.sourceKey || undefined,
          ),
      ),
    );
  }

  function toggleSessionSelection(sessionId: string, checked: boolean) {
    setSelectedSessionIds((previous) => {
      if (checked) {
        return previous.includes(sessionId) ? previous : [...previous, sessionId];
      }

      return previous.filter((value) => value !== sessionId);
    });
  }

  function toggleAllVisibleActiveSessions(checked: boolean) {
    setSelectedSessionIds(checked ? activeSessions.map((session) => session.id) : []);
  }

  function toggleExpandedTimelinePoint(pointId: string) {
    setExpandedTimelinePointIds((previous) =>
      previous.includes(pointId)
        ? previous.filter((value) => value !== pointId)
        : [...previous, pointId],
    );
  }

  function scrollAdminSessionsSectionIntoView() {
    if (
      adminSessionsSectionRef.current &&
      typeof adminSessionsSectionRef.current.scrollIntoView === "function"
    ) {
      adminSessionsSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  function focusMatchedSessionInList(match: SourceGroupTimelineMatchedSession) {
    setHighlightedSessionId(match.session.id);
    updateFilters(buildMatchedSessionRouteFilters(match));
    scrollAdminSessionsSectionIntoView();
  }

  function openMatchedSessionRevoke(match: SourceGroupTimelineMatchedSession) {
    if (match.session.status !== "active") {
      return;
    }

    setHighlightedSessionId(match.session.id);
    setPendingSession(match.session);
  }

  function exportHighlightedFocusedSourceSnapshot() {
    if (!highlightedFocusedSourceSummary) {
      return;
    }

    focusedSourceSnapshotExportMutation.mutate();
  }

  const hasVisibleSessions = sessions.length > 0;
  const hasVisibleSourceGroups = sourceGroups.length > 0;
  const filteredRevokeDescription =
    filters.scope === "current"
      ? hasSourceFocus
        ? "This will revoke the current active admin session if it still matches the focused source group and current filters."
        : "This will revoke the current active admin session if it still matches the current filters."
      : hasSourceFocus
        ? "This will revoke every active admin session in the focused source group that still matches the current filters, including sessions on other pages."
        : "This will revoke every active admin session matching the current filters, including sessions on other pages.";
  const sourceGroupRevokeDescription = pendingSourceGroup
    ? pendingSourceGroup.mode === "focused-source"
      ? pendingSourceGroup.group.currentSessions > 0
        ? "This focused source group includes the current console session. Every active session in this focused source group will stop authorizing admin requests immediately, even if the current list is narrowed to one session, and the next admin request will need to exchange a fresh short-lived token."
        : "Every active session in this focused source group will stop authorizing admin requests immediately, even if the current list is narrowed to one session."
      : pendingSourceGroup.group.currentSessions > 0
        ? "This source group includes the current console session. Every matching active session in this source group will stop authorizing admin requests immediately, and the next admin request will need to exchange a fresh short-lived token."
        : "Every matching active session in this source group will stop authorizing admin requests immediately."
    : "Every matching active session in this source group will stop authorizing admin requests immediately.";
  const sourceGroupRiskRevokeDescription = hasSourceFocus
    ? `This will revoke every active session in source groups marked ${formatSourceGroupRiskFilterLabel(
        filters.sourceRiskLevel,
      ).toLowerCase()} that still match the focused source group and current filters.`
    : `This will revoke every active session in source groups marked ${formatSourceGroupRiskFilterLabel(
        filters.sourceRiskLevel,
      ).toLowerCase()} that still match the current filters, including groups on other pages.`;

  function focusSourceGroup(group: CloudAdminSessionSourceGroupSummary) {
    updateFilters({
      sourceKey: group.sourceKey,
      sourceIssuedFromIp: group.issuedFromIp ?? "",
      sourceIssuedUserAgent: group.issuedUserAgent ?? "",
    });
  }

  function clearSourceFocus() {
    updateFilters({
      sourceKey: "",
      sourceIssuedFromIp: "",
      sourceIssuedUserAgent: "",
    });
  }

  function openHighlightedFocusedSourceRevoke() {
    if (
      !highlightedFocusedSourceSummary ||
      highlightedFocusedSourceSummary.activeSessions === 0
    ) {
      return;
    }

    setPendingSourceGroup({
      group: normalizeSourceGroupSummary(highlightedFocusedSourceSummary),
      mode: "focused-source",
    });
  }

  function exportFocusedSourceRiskTimelineCsv() {
    if (
      !focusedSourceSnapshotQuery.data ||
      !visibleFocusedSourceRiskTimeline.length
    ) {
      showAdminSessionsNotice(createAdminSessionRiskTimelineNotReadyNotice());
      return;
    }

    const { downloaded } = withDownloadedTextFile(
      {
        pointCount: visibleFocusedSourceRiskTimeline.length,
      },
      buildSourceGroupRiskTimelineCsvFilename(
        focusedSourceSnapshotQuery.data,
        timelineView,
      ),
      buildSourceGroupRiskTimelineCsv(
        focusedSourceSnapshotQuery.data,
        visibleFocusedSourceRiskTimeline,
        timelineView,
      ),
      "text/csv;charset=utf-8",
    );
    showAdminSessionsNotice(
      createAdminSessionArtifactDownloadNotice({
        kind: "risk-timeline-csv",
        downloaded,
        pointCount: visibleFocusedSourceRiskTimeline.length,
        view: timelineView,
      }),
    );
  }

  return (
    <section
      ref={adminSessionsSectionRef}
      className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminSessionSectionHeader
          title="Admin sessions"
          description="Review live admin sessions, inspect where they were issued from, filter by revocation path, and page through longer audit history."
          variant="page"
        />
        <div className="flex flex-wrap items-center gap-3">
          <AdminSessionSummaryChip className="tracking-[0.2em]">
            {summary}
          </AdminSessionSummaryChip>
          <AdminSessionActionButton
            tone="neutral"
            onClick={copyAdminSessionsPermalink}
          >
            Copy sessions permalink
          </AdminSessionActionButton>
          <a
            href={currentPermalink}
            target="_blank"
            rel="noreferrer"
            className={ADMIN_SESSION_ACTION_LINK_CLASS_NAME}
          >
            Open sessions permalink
          </a>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="md:col-span-2 xl:col-span-5">
          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            Quick views
          </div>
          <AdminSessionQuickViewButtons
            presets={ADMIN_SESSION_PRESETS}
            onPresetSelect={updateFilters}
            onReset={() => updateFilters(DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH)}
          />
        </div>
        <AdminSessionFilterControls
          query={filters.query}
          status={filters.status}
          revocationReason={filters.revocationReason}
          scope={filters.scope}
          sortBy={filters.sortBy}
          sortDirection={filters.sortDirection}
          pageSize={filters.pageSize}
          onQueryChange={(query) => updateFilters({ query, page: 1 })}
          onStatusChange={(status) => updateFilters({ status, page: 1 })}
          onRevocationReasonChange={(revocationReason) =>
            updateFilters({ revocationReason, page: 1 })
          }
          onScopeChange={(scope) => updateFilters({ scope, page: 1 })}
          onSortByChange={(sortBy) => updateFilters({ sortBy, page: 1 })}
          onSortDirectionChange={(sortDirection) =>
            updateFilters({ sortDirection, page: 1 })
          }
          onPageSizeChange={(pageSize) => updateFilters({ pageSize, page: 1 })}
          className="md:col-span-2 xl:col-span-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5"
        />
      </div>

      <div className="mt-5 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AdminSessionSectionHeader
            title="Source groups"
            description="Aggregate sessions by issue IP and client under the current filters, then revoke an entire source in one action."
          />
          <AdminSessionSummaryChip>
            {sourceGroupSummary}
          </AdminSessionSummaryChip>
        </div>

        <AdminSessionSourceGroupFilterControls
          sourceSortBy={filters.sourceSortBy}
          sourceSortDirection={filters.sourceSortDirection}
          sourceRiskLevel={filters.sourceRiskLevel}
          sourcePageSize={filters.sourcePageSize}
          onSourceSortByChange={(sourceSortBy) =>
            updateFilters({ sourceSortBy, sourcePage: 1 })
          }
          onSourceSortDirectionChange={(sourceSortDirection) =>
            updateFilters({ sourceSortDirection, sourcePage: 1 })
          }
          onSourceRiskLevelChange={(sourceRiskLevel) =>
            updateFilters({ sourceRiskLevel, sourcePage: 1 })
          }
          onSourcePageSizeChange={(sourcePageSize) =>
            updateFilters({ sourcePageSize, sourcePage: 1 })
          }
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3">
          <div className="text-sm text-[color:var(--text-secondary)]">
            {describeSourceRiskSelection()}
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminSessionActionButton
              disabled={
                !hasSourceRiskFilter ||
                !hasVisibleSourceGroups ||
                sourceGroupRiskSnapshotMutation.isPending
              }
              onClick={() => {
                sourceGroupRiskSnapshotMutation.mutate();
              }}
            >
              Export risk snapshot
            </AdminSessionActionButton>
            <AdminSessionActionButton
              disabled={
                !hasSourceRiskFilter ||
                !hasVisibleSourceGroups ||
                sourceGroupRiskGroupsCsvMutation.isPending
              }
              onClick={() => {
                sourceGroupRiskGroupsCsvMutation.mutate();
              }}
            >
              Export risk groups CSV
            </AdminSessionActionButton>
            <AdminSessionActionButton
              disabled={
                !hasSourceRiskFilter ||
                !hasVisibleSourceGroups ||
                sourceGroupRiskSessionsCsvMutation.isPending
              }
              onClick={() => {
                sourceGroupRiskSessionsCsvMutation.mutate();
              }}
            >
              Export risk sessions CSV
            </AdminSessionActionButton>
            <AdminSessionActionButton
              disabled={!hasSourceRiskFilter || !hasVisibleSourceGroups || isRevoking}
              onClick={() => setPendingRiskGroupRevoke(true)}
            >
              Revoke matching risk groups
            </AdminSessionActionButton>
          </div>
        </div>

        {sourceGroupsQuery.isError && sourceGroupsQuery.error instanceof Error ? (
          <div className="mt-4">
            <CloudAdminErrorBlock error={sourceGroupsQuery.error} />
          </div>
        ) : null}

        {sourceGroupsQuery.isLoading ? (
          <div className="mt-4 text-sm text-[color:var(--text-muted)]">
            Loading source groups...
          </div>
        ) : null}

        {!sourceGroupsQuery.isLoading &&
        !sourceGroupsQuery.isError &&
        !sourceGroups.length ? (
          <div className="mt-4 text-sm text-[color:var(--text-muted)]">
            No source groups match this filter.
          </div>
        ) : null}

        {!sourceGroupsQuery.isLoading &&
        !sourceGroupsQuery.isError &&
        sourceGroups.length ? (
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {sourceGroups.map((group) => (
              <div
                key={group.sourceKey}
                className={`rounded-2xl border bg-[color:var(--surface-console)] p-4 ${
                  group.sourceKey === filters.sourceKey
                    ? "border-[color:var(--border-brand)] shadow-[0_0_0_1px_var(--brand-primary)]"
                    : "border-[color:var(--border-faint)]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>{renderSessionSource(group.issuedFromIp, group.issuedUserAgent)}</div>
                  <div className="flex flex-wrap gap-2">
                    <AdminSessionActionButton
                      onClick={() => focusSourceGroup(group)}
                      tone={group.sourceKey === filters.sourceKey ? "brand" : "neutral"}
                    >
                      {group.sourceKey === filters.sourceKey
                        ? "Viewing sessions"
                        : "View sessions"}
                    </AdminSessionActionButton>
                    <AdminSessionActionButton
                      disabled={sourceGroupSnapshotMutation.isPending}
                      onClick={() => sourceGroupSnapshotMutation.mutate(group)}
                    >
                      Export snapshot
                    </AdminSessionActionButton>
                    <AdminSessionActionButton
                      disabled={group.activeSessions === 0 || isRevoking}
                      onClick={() =>
                        setPendingSourceGroup({
                          group,
                          mode: "filtered",
                        })
                      }
                    >
                      Revoke group
                    </AdminSessionActionButton>
                  </div>
                </div>

                <div className="mt-3">
                  <AdminSessionSourceGroupRiskBadge
                    riskLevel={group.riskLevel}
                    className="px-2 py-1"
                  />
                  <AdminSessionSourceGroupSummaryPills
                    activeSessions={group.activeSessions}
                    totalSessions={group.totalSessions}
                    currentSessions={group.currentSessions}
                    expiredSessions={group.expiredSessions}
                    revokedSessions={group.revokedSessions}
                    refreshTokenReuseRevocations={
                      group.refreshTokenReuseRevocations
                    }
                    className="mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--text-secondary)]"
                  />
                </div>

                <AdminSessionSourceGroupRiskSignals
                  signals={group.riskSignals}
                  keyPrefix={group.sourceKey}
                  className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-secondary)]"
                />

                <div className="mt-3 grid gap-3 text-xs text-[color:var(--text-secondary)] sm:grid-cols-3">
                  <div>
                    <div className="uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                      Latest used
                    </div>
                    <div className="mt-1 text-[color:var(--text-primary)]">
                      {formatDateTime(group.latestLastUsedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                      Latest created
                    </div>
                    <div className="mt-1 text-[color:var(--text-primary)]">
                      {formatDateTime(group.latestCreatedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                      Latest revoked
                    </div>
                    <div className="mt-1 text-[color:var(--text-primary)]">
                      {formatDateTime(group.latestRevokedAt)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!sourceGroupsQuery.isLoading &&
        !sourceGroupsQuery.isError &&
        sourceGroupTotal > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--text-secondary)]">
            <div>{sourceGroupSummary}</div>
            <div className="flex items-center gap-3">
              <span>
                Page {filters.sourcePage} of {sourceGroupTotalPages}
              </span>
              <AdminSessionActionButton
                disabled={filters.sourcePage <= 1 || sourceGroupsQuery.isLoading}
                onClick={() => updateFilters({ sourcePage: filters.sourcePage - 1 })}
              >
                Previous groups
              </AdminSessionActionButton>
              <AdminSessionActionButton
                disabled={
                  filters.sourcePage >= sourceGroupTotalPages ||
                  sourceGroupsQuery.isLoading ||
                  sourceGroupTotal === 0
                }
                onClick={() => updateFilters({ sourcePage: filters.sourcePage + 1 })}
              >
                Next groups
              </AdminSessionActionButton>
            </div>
          </div>
        ) : null}
      </div>

      {hasSourceFocus ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-4 py-3">
          <div>
            <AdminSessionBrandEyebrow>
              Viewing source group
            </AdminSessionBrandEyebrow>
            <div className="mt-2">
              {renderSessionSource(
                filters.sourceIssuedFromIp || null,
                filters.sourceIssuedUserAgent || null,
              )}
            </div>
          </div>
          <AdminSessionActionButton
            tone="brand-outline"
            onClick={clearSourceFocus}
          >
            Clear source focus
          </AdminSessionActionButton>
        </div>
      ) : null}

      {hasSourceFocus ? (
        <div className="mt-5 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <AdminSessionSectionHeader
                title="Risk timeline"
                description="Derived from session issue, expiry, and revoke events inside the focused source group under the current filters."
              />
              {focusedSourceTimelineSummary ? (
                <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                  {focusedSourceTimelineSummary}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-secondary)]">
                {SOURCE_GROUP_RISK_THRESHOLD_RULES.map((rule) => (
                  <span
                    key={rule.id}
                    className={`rounded-full border px-2 py-1 ${rule.tone}`}
                  >
                    {rule.label}: {rule.description}
                  </span>
                ))}
              </div>
              {latestFocusedSourceRiskPoint ? (
                <div className="mt-3">
                  <AdminSessionSectionHeader
                    title="Current rationale"
                    variant="subsection"
                  />
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-secondary)]">
                    {latestFocusedSourceRiskReasons.map((reason) => (
                      <AdminSessionNeutralChip key={reason} size="compact">
                        {reason}
                      </AdminSessionNeutralChip>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-2">
                <AdminSessionActionButton
                  tone={timelineView === "events" ? "brand" : "neutral"}
                  onClick={() => setTimelineView("events")}
                >
                  Event view
                </AdminSessionActionButton>
                <AdminSessionActionButton
                  tone={timelineView === "daily" ? "brand" : "neutral"}
                  onClick={() => setTimelineView("daily")}
                >
                  Daily summary
                </AdminSessionActionButton>
                <AdminSessionActionButton
                  tone={timelineView === "weekly" ? "brand" : "neutral"}
                  onClick={() => setTimelineView("weekly")}
                >
                  Weekly summary
                </AdminSessionActionButton>
              </div>
              {latestFocusedSourceRiskPoint ? (
                <>
                  <AdminSessionSourceGroupRiskBadge
                    riskLevel={latestFocusedSourceRiskPoint.riskLevel}
                    className="px-2 py-1 text-xs"
                  />
                  <AdminSessionNeutralChip>
                    {timelineView === "daily" &&
                    "day" in latestFocusedSourceRiskPoint
                      ? formatDate(latestFocusedSourceRiskPoint.day)
                      : timelineView === "weekly" &&
                          "weekStart" in latestFocusedSourceRiskPoint
                        ? formatDateRange(
                            latestFocusedSourceRiskPoint.weekStart,
                            latestFocusedSourceRiskPoint.weekEnd,
                          )
                        : formatDateTime(latestFocusedSourceRiskPoint.timestamp)}
                  </AdminSessionNeutralChip>
                </>
              ) : null}
              <AdminSessionActionButton
                disabled={
                  focusedSourceSnapshotQuery.isLoading ||
                  visibleFocusedSourceRiskTimeline.length === 0
                }
                onClick={exportFocusedSourceRiskTimelineCsv}
              >
                Export timeline CSV
              </AdminSessionActionButton>
            </div>
          </div>

          {focusedSourceSnapshotQuery.isError &&
          focusedSourceSnapshotQuery.error instanceof Error ? (
            <div className="mt-4">
              <CloudAdminErrorBlock error={focusedSourceSnapshotQuery.error} />
            </div>
          ) : null}

          {focusedSourceSnapshotQuery.isLoading ? (
            <div className="mt-4 text-sm text-[color:var(--text-muted)]">
              Loading risk timeline...
            </div>
          ) : null}

          {!focusedSourceSnapshotQuery.isLoading &&
          !focusedSourceSnapshotQuery.isError &&
          !visibleFocusedSourceRiskTimeline.length ? (
            <div className="mt-4 text-sm text-[color:var(--text-muted)]">
              No timeline points are available for the focused source group.
            </div>
          ) : null}

          {!focusedSourceSnapshotQuery.isLoading &&
          !focusedSourceSnapshotQuery.isError &&
          visibleFocusedSourceRiskTimeline.length ? (
            <div className="mt-4 space-y-3">
              {[...visibleFocusedSourceRiskTimeline].reverse().map((point) => {
                const matchedSessions =
                  visibleFocusedSourceTimelineMatchedSessions.get(point.id) ?? [];
                const matchedSessionsExpanded =
                  expandedTimelinePointIds.includes(point.id);

                return (
                  <div
                    key={point.id}
                    className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-[color:var(--text-primary)]">
                          {point.eventSummary}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                          {timelineView === "daily" && "day" in point
                            ? `${formatDate(point.day)} • Latest event ${formatDateTime(
                                point.timestamp,
                              )}`
                            : timelineView === "weekly" && "weekStart" in point
                              ? `${formatDateRange(point.weekStart, point.weekEnd)} • Latest event ${formatDateTime(
                                  point.timestamp,
                                )}`
                              : formatDateTime(point.timestamp)}
                        </div>
                      </div>
                      <AdminSessionSourceGroupRiskBadge
                        riskLevel={point.riskLevel}
                        className="px-2 py-1 text-xs"
                      />
                    </div>

                    <div className="mt-3">
                      {timelineView !== "events" && "pointCount" in point ? (
                        <AdminSessionNeutralChip>
                          {point.pointCount} timeline point(s)
                        </AdminSessionNeutralChip>
                      ) : null}
                      <AdminSessionSourceGroupSummaryPills
                        activeSessions={point.activeSessions}
                        expiredSessions={point.expiredSessions}
                        revokedSessions={point.revokedSessions}
                        refreshTokenReuseRevocations={
                          point.refreshTokenReuseRevocations
                        }
                        className="mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--text-secondary)]"
                      />
                    </div>

                    <AdminSessionSourceGroupRiskSignals
                      signals={point.riskSignals}
                      keyPrefix={point.id}
                      className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-secondary)]"
                      emptyMessage="No risk signals at this point."
                      emptyClassName="mt-3 text-[11px] text-[color:var(--text-muted)]"
                    />

                    {matchedSessions.length ? (
                      <div className="mt-3">
                        <AdminSessionActionButton
                          onClick={() => toggleExpandedTimelinePoint(point.id)}
                          aria-label={`${
                            matchedSessionsExpanded ? "Hide" : "Show"
                          } matched sessions for ${point.eventSummary}`}
                        >
                          {matchedSessionsExpanded
                            ? "Hide matched sessions"
                            : "Show matched sessions"}
                        </AdminSessionActionButton>

                        {matchedSessionsExpanded ? (
                          <div className="mt-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
                            <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                              Matched sessions at this point
                            </div>
                            {timelineView !== "events" ? (
                              <div className="mt-1 text-[11px] text-[color:var(--text-secondary)]">
                                These sessions reflect the latest event captured in this summary.
                              </div>
                            ) : null}
                            <div className="mt-3 space-y-2">
                              {matchedSessions.map((match) => (
                                <div
                                  key={`${point.id}-${match.session.id}`}
                                  className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="font-mono text-xs text-[color:var(--text-primary)]">
                                      {match.session.id}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <AdminSessionStatusBadge
                                        status={match.state}
                                        className="px-2 py-1 text-[11px]"
                                      />
                                      {match.session.isCurrent ? (
                                        <AdminSessionBrandBadge size="compact">
                                          Current
                                        </AdminSessionBrandBadge>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap gap-2 text-[11px] text-[color:var(--text-secondary)]">
                                      {match.reasons.map((reason) => (
                                        <AdminSessionNeutralChip
                                          key={`${match.session.id}-${reason}`}
                                          size="compact"
                                        >
                                          {formatSourceGroupTimelineSessionMatchReason(
                                            reason,
                                          )}
                                        </AdminSessionNeutralChip>
                                      ))}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <AdminSessionActionButton
                                        size="compact"
                                        onClick={() =>
                                          focusMatchedSessionInList(match)
                                        }
                                        aria-label={`View ${match.session.id} in sessions list`}
                                      >
                                        View in sessions list
                                      </AdminSessionActionButton>
                                      {match.session.status === "active" ? (
                                        <AdminSessionActionButton
                                          tone="danger"
                                          size="compact"
                                          onClick={() =>
                                            openMatchedSessionRevoke(match)
                                          }
                                          aria-label={`Revoke ${match.session.id} from timeline`}
                                        >
                                          Revoke now
                                        </AdminSessionActionButton>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="mt-2 grid gap-2 text-[11px] text-[color:var(--text-secondary)] sm:grid-cols-3">
                                    <div>
                                      <div className="uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                                        Issued
                                      </div>
                                      <div className="mt-1 text-[color:var(--text-primary)]">
                                        {formatDateTime(match.session.createdAt)}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                                        Last used
                                      </div>
                                      <div className="mt-1 text-[color:var(--text-primary)]">
                                        {formatDateTime(match.session.lastUsedAt)}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                                        Revoked
                                      </div>
                                      <div className="mt-1 text-[color:var(--text-primary)]">
                                        {formatDateTime(match.session.revokedAt)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3">
        <div className="text-sm text-[color:var(--text-secondary)]">
          {selectedSessionIds.length > 0
            ? `${selectedSessionIds.length} active session(s) selected on this page.`
            : "Select active sessions on this page to revoke them in one action."}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminSessionActionButton
            disabled={!hasVisibleSessions || isRevoking}
            onClick={() => setPendingFilteredRevoke(true)}
          >
            Revoke all matching
          </AdminSessionActionButton>
          <AdminSessionActionButton
            disabled={selectedSessionIds.length === 0 || isRevoking}
            onClick={() => setPendingBulkSessionIds(selectedSessionIds)}
          >
            Revoke selected
          </AdminSessionActionButton>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-[color:var(--border-faint)]">
        <table className="min-w-[88rem] border-collapse text-left text-sm">
          <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all active admin sessions"
                  checked={allActiveSelected}
                  disabled={activeSessions.length === 0 || isRevoking}
                  onChange={(event) =>
                    toggleAllVisibleActiveSessions(event.target.checked)
                  }
                  className="h-4 w-4 rounded border-[color:var(--border-faint)] bg-[color:var(--surface-input)]"
                />
              </th>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Issued from</th>
              <th className="px-4 py-3">Last client</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Last used</th>
              <th className="px-4 py-3">Refresh expiry</th>
              <th className="px-4 py-3">Revocation</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <Fragment key={session.id}>
                <tr
                  className={`border-t ${
                    session.id === highlightedSessionId
                      ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)]"
                      : "border-[color:var(--border-faint)]"
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${session.id}`}
                      checked={selectedSessionIds.includes(session.id)}
                      disabled={session.status !== "active" || isRevoking}
                      onChange={(event) =>
                        toggleSessionSelection(session.id, event.target.checked)
                      }
                      className="h-4 w-4 rounded border-[color:var(--border-faint)] bg-[color:var(--surface-input)] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[color:var(--text-primary)]">
                        {session.id}
                      </span>
                      {session.isCurrent ? (
                        <AdminSessionBrandBadge>
                          Current
                        </AdminSessionBrandBadge>
                      ) : null}
                      {session.id === highlightedSessionId ? (
                        <AdminSessionBrandBadge variant="outline">
                          Timeline focus
                        </AdminSessionBrandBadge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <AdminSessionStatusBadge
                      status={session.status}
                      className="inline-flex px-2 py-1 text-[11px] uppercase tracking-[0.18em]"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {renderSessionSource(
                      session.issuedFromIp,
                      session.issuedUserAgent,
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {renderSessionSource(
                      session.lastUsedIp,
                      session.lastUsedUserAgent,
                    )}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                    {formatDateTime(session.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                    {formatDateTime(session.lastUsedAt)}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                    {formatDateTime(session.expiresAt)}
                  </td>
                  <td className="px-4 py-3">
                    {renderRevocationDetails(session)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AdminSessionActionButton
                      disabled={
                        session.status !== "active" ||
                        isRevoking
                      }
                      onClick={() => setPendingSession(session)}
                    >
                      Revoke
                    </AdminSessionActionButton>
                  </td>
                </tr>
                {session.id === highlightedSessionId ? (
                  <tr className="border-t-0">
                    <td colSpan={10} className="px-4 pb-4 pt-0">
                      <div className="rounded-2xl border border-[color:var(--border-brand)] bg-[color:var(--surface-soft)] p-4">
                        <AdminSessionBrandEyebrow size="compact">
                          Timeline audit detail
                        </AdminSessionBrandEyebrow>
                        <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                          Focused from the risk timeline so you can verify audit fields before taking session actions.
                        </div>
                        {highlightedFocusedSourceSummary ? (
                          <div className="mt-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                                  Focused source risk
                                </div>
                                <div className="mt-2">
                                  <AdminSessionSourceGroupRiskBadge
                                    riskLevel={
                                      highlightedFocusedSourceSummary.riskLevel
                                    }
                                    className="px-2 py-1"
                                  />
                                  <AdminSessionSourceGroupSummaryPills
                                    activeSessions={
                                      highlightedFocusedSourceSummary.activeSessions
                                    }
                                    totalSessions={
                                      highlightedFocusedSourceSummary.totalSessions
                                    }
                                    currentSessions={
                                      highlightedFocusedSourceSummary.currentSessions
                                    }
                                    refreshTokenReuseRevocations={
                                      highlightedFocusedSourceSummary.refreshTokenReuseRevocations
                                    }
                                    className="mt-2 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-secondary)]"
                                  />
                                </div>
                                <AdminSessionSourceGroupRiskSignals
                                  signals={highlightedFocusedSourceSummary.riskSignals}
                                  keyPrefix={highlightedFocusedSourceSummary.sourceKey}
                                  className="mt-2 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-secondary)]"
                                />
                              </div>
                              <AdminSessionActionButton
                                size="compact"
                                disabled={
                                  focusedSourceSnapshotExportMutation.isPending ||
                                  focusedSourceSnapshotQuery.isLoading
                                }
                                onClick={exportHighlightedFocusedSourceSnapshot}
                              >
                                Export focused source snapshot
                              </AdminSessionActionButton>
                              <AdminSessionActionButton
                                tone="danger"
                                size="compact"
                                disabled={
                                  highlightedFocusedSourceSummary.activeSessions === 0 ||
                                  isRevoking
                                }
                                onClick={openHighlightedFocusedSourceRevoke}
                              >
                                Revoke focused source
                              </AdminSessionActionButton>
                            </div>
                            {latestFocusedSourceRiskPoint ? (
                              <div className="mt-3 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                                      Latest timeline snapshot
                                    </div>
                                    <div className="mt-1 text-[11px] text-[color:var(--text-secondary)]">
                                      Synced with {formatTimelineViewLabel(timelineView)}.
                                    </div>
                                    <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                                      {latestFocusedSourceRiskPoint.eventSummary}
                                    </div>
                                    <div className="mt-1 text-[11px] text-[color:var(--text-secondary)]">
                                      {formatTimelinePointTimestampLabel(
                                        latestFocusedSourceRiskPoint,
                                        timelineView,
                                      )}
                                    </div>
                                  </div>
                                  <AdminSessionSourceGroupRiskBadge
                                    riskLevel={latestFocusedSourceRiskPoint.riskLevel}
                                    className="px-2 py-1 text-[11px]"
                                  />
                                </div>
                                <div className="mt-3">
                                  {timelineView !== "events" &&
                                  "pointCount" in latestFocusedSourceRiskPoint ? (
                                    <AdminSessionNeutralChip size="compact">
                                      {latestFocusedSourceRiskPoint.pointCount} timeline point(s)
                                    </AdminSessionNeutralChip>
                                  ) : null}
                                  <AdminSessionNeutralChip size="compact">
                                    {latestFocusedSourceMatchedSessions.length} matched session(s)
                                  </AdminSessionNeutralChip>
                                  <AdminSessionSourceGroupSummaryPills
                                    activeSessions={latestFocusedSourceRiskPoint.activeSessions}
                                    expiredSessions={latestFocusedSourceRiskPoint.expiredSessions}
                                    revokedSessions={latestFocusedSourceRiskPoint.revokedSessions}
                                    refreshTokenReuseRevocations={
                                      latestFocusedSourceRiskPoint.refreshTokenReuseRevocations
                                    }
                                    className="mt-2 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-secondary)]"
                                  />
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-secondary)]">
                                  {latestFocusedSourceRiskReasons.map((reason) => (
                                    <AdminSessionNeutralChip
                                      key={`latest-focused-source-reason-${reason}`}
                                      size="compact"
                                    >
                                      {reason}
                                    </AdminSessionNeutralChip>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {visibleHighlightedOperationReceipts.length ? (
                              <div
                                role="region"
                                aria-label="Recent operation receipts"
                                className="mt-3 rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <AdminSessionSectionHeader
                                    title="Recent operation receipts"
                                    description={`Showing the latest ${visibleHighlightedOperationReceipts.length} of up to ${HIGHLIGHTED_OPERATION_RECEIPT_LIMIT} receipt(s) for this focused session.`}
                                    variant="subsection"
                                  />
                                  <AdminSessionActionButton
                                    size="compact"
                                    onClick={clearVisibleHighlightedOperationReceipts}
                                  >
                                    Clear receipts
                                  </AdminSessionActionButton>
                                </div>
                                <div className="mt-3 space-y-3" role="list">
                                  {visibleHighlightedOperationReceipts.map((receipt) => (
                                    <div
                                      role="listitem"
                                      key={`${receipt.createdAt}-${receipt.kind}-${receipt.message}`}
                                      className={`rounded-xl border p-3 ${getHighlightedOperationReceiptTone(
                                        receipt.tone,
                                      )}`}
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <div className="text-[11px] uppercase tracking-[0.14em]">
                                            {formatHighlightedOperationReceiptLabel(
                                              receipt.kind,
                                            )}
                                          </div>
                                        </div>
                                        <AdminSessionNeutralChip
                                          variant="current"
                                          size="compact"
                                        >
                                          {formatDateTime(receipt.createdAt)}
                                        </AdminSessionNeutralChip>
                                      </div>
                                      <div className="mt-2 text-sm leading-6">
                                        {receipt.message}
                                      </div>
                                      <div className="mt-3 grid gap-3 text-[11px] text-current/90 md:grid-cols-3">
                                        <div>
                                          <div className="uppercase tracking-[0.12em] opacity-80">
                                            Session context
                                          </div>
                                          <div
                                            className="mt-1 max-w-[22rem] truncate font-mono text-[color:var(--text-primary)]"
                                            title={receipt.sessionId || undefined}
                                          >
                                            {receipt.sessionId || "Not available"}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="uppercase tracking-[0.12em] opacity-80">
                                            Source context
                                          </div>
                                          <div className="mt-1">
                                            {renderSessionSource(
                                              receipt.sourceIssuedFromIp,
                                              receipt.sourceIssuedUserAgent,
                                            )}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="uppercase tracking-[0.12em] opacity-80">
                                            Request id
                                          </div>
                                          <div
                                            className="mt-1 max-w-[22rem] break-all font-mono text-[color:var(--text-primary)]"
                                            title={receipt.requestId || undefined}
                                          >
                                            {receipt.requestId || "Not available"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-3 grid gap-3 text-xs text-[color:var(--text-secondary)] md:grid-cols-2 xl:grid-cols-3">
                          <div>
                            <div className="uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                              Issued from
                            </div>
                            <div className="mt-1">
                              {renderSessionSource(
                                session.issuedFromIp,
                                session.issuedUserAgent,
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                              Last client
                            </div>
                            <div className="mt-1">
                              {renderSessionSource(
                                session.lastUsedIp,
                                session.lastUsedUserAgent,
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                              Last refreshed
                            </div>
                            <div className="mt-1 text-[color:var(--text-primary)]">
                              {formatDateTime(session.lastRefreshedAt)}
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                              Updated
                            </div>
                            <div className="mt-1 text-[color:var(--text-primary)]">
                              {formatDateTime(session.updatedAt)}
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                              Revocation reason
                            </div>
                            <div className="mt-1 text-[color:var(--text-primary)]">
                              {formatRevocationReason(session.revocationReason)}
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                              Revoked by session
                            </div>
                            <div
                              className="mt-1 font-mono text-[11px] text-[color:var(--text-primary)]"
                              title={session.revokedBySessionId || undefined}
                            >
                              {session.revokedBySessionId || "Not available"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>

        {sessionsQuery.isError && sessionsQuery.error instanceof Error ? (
          <div className="p-4">
            <CloudAdminErrorBlock error={sessionsQuery.error} />
          </div>
        ) : null}

        {sessionsQuery.isLoading ? (
          <div className="p-4 text-sm text-[color:var(--text-muted)]">
            Loading admin sessions...
          </div>
        ) : null}

        {!sessionsQuery.isLoading &&
        !sessionsQuery.isError &&
        !sessions.length ? (
          <div className="p-4 text-sm text-[color:var(--text-muted)]">
            No admin sessions match this filter.
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--text-secondary)]">
        <div>{summary}</div>
        <div className="flex items-center gap-3">
          <span>
            Page {filters.page} of {totalPages}
          </span>
          <AdminSessionActionButton
            disabled={filters.page <= 1 || sessionsQuery.isLoading}
            onClick={() => updateFilters({ page: filters.page - 1 })}
          >
            Previous
          </AdminSessionActionButton>
          <AdminSessionActionButton
            disabled={
              filters.page >= totalPages ||
              sessionsQuery.isLoading ||
              total === 0
            }
            onClick={() => updateFilters({ page: filters.page + 1 })}
          >
            Next
          </AdminSessionActionButton>
        </div>
      </div>

      <ConsoleConfirmDialog
        open={Boolean(pendingSession)}
        title="Revoke admin session?"
        description={
          pendingSession?.isCurrent
            ? "This is the current console session. New admin requests will need to exchange a fresh short-lived token."
            : "The selected session will stop authorizing admin requests immediately."
        }
        confirmLabel="Revoke session"
        pendingLabel="Revoking..."
        danger
        pending={revokeMutation.isPending}
        onClose={() => setPendingSession(null)}
        onConfirm={() => {
          if (!pendingSession) {
            return;
          }
          revokeMutation.mutate(pendingSession);
        }}
      />

      <ConsoleConfirmDialog
        open={pendingBulkSessionIds.length > 0}
        title="Revoke selected admin sessions?"
        description={
          selectedCurrentSession
            ? `This selection includes the current console session. ${pendingBulkSessionIds.length} selected session(s) will stop authorizing admin requests immediately, and the next admin request will need to exchange a fresh short-lived token.`
            : `${pendingBulkSessionIds.length} selected session(s) will stop authorizing admin requests immediately.`
        }
        confirmLabel="Revoke selected"
        pendingLabel="Revoking..."
        danger
        pending={bulkRevokeMutation.isPending}
        onClose={() => setPendingBulkSessionIds([])}
        onConfirm={() => {
          if (pendingBulkSessionIds.length === 0) {
            return;
          }
          bulkRevokeMutation.mutate(pendingBulkSessionIds);
        }}
      />

      <ConsoleConfirmDialog
        open={pendingFilteredRevoke}
        title="Revoke all matching admin sessions?"
        description={filteredRevokeDescription}
        confirmLabel="Revoke matching sessions"
        pendingLabel="Revoking..."
        danger
        pending={filteredRevokeMutation.isPending}
        onClose={() => setPendingFilteredRevoke(false)}
        onConfirm={() => {
          filteredRevokeMutation.mutate();
        }}
      />

      <ConsoleConfirmDialog
        open={pendingRiskGroupRevoke}
        title="Revoke matching risk groups?"
        description={sourceGroupRiskRevokeDescription}
        confirmLabel="Revoke risk groups"
        pendingLabel="Revoking..."
        danger
        pending={sourceGroupRiskRevokeMutation.isPending}
        onClose={() => setPendingRiskGroupRevoke(false)}
        onConfirm={() => {
          sourceGroupRiskRevokeMutation.mutate();
        }}
      />

      <ConsoleConfirmDialog
        open={Boolean(pendingSourceGroup)}
        title="Revoke source group?"
        description={sourceGroupRevokeDescription}
        confirmLabel="Revoke group"
        pendingLabel="Revoking..."
        danger
        pending={sourceGroupRevokeMutation.isPending}
        onClose={() => setPendingSourceGroup(null)}
        onConfirm={() => {
          if (!pendingSourceGroup) {
            return;
          }
          sourceGroupRevokeMutation.mutate(pendingSourceGroup);
        }}
      />
    </section>
  );
}
