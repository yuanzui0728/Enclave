import type { ConsoleNoticeTone } from "../components/console-notice";
import { createRequestScopedNotice, type RequestScopedNotice } from "./request-scoped-notice";

const CURRENT_SESSION_REISSUE_NOTICE =
  "The current console session was included, so the next admin request will re-issue a short-lived token.";

type SessionRevokeNoticeOptions = {
  requestId?: string | null;
  revokedCount: number;
  skippedCount: number;
  revokedCurrentSession: boolean;
  zeroMessage: string;
  successMessage: (revokedCount: number) => string;
  skippedMessage: (skippedCount: number) => string;
};

type RiskGroupRevokeNoticeOptions = {
  requestId?: string | null;
  matchedGroupCount: number;
  revokedGroupCount: number;
  revokedSessionCount: number;
  skippedSessionCount: number;
  revokedCurrentSession: boolean;
};

export type AdminSessionSourceRiskGuardAction =
  | "snapshot"
  | "groups-csv"
  | "sessions-csv"
  | "revoke";

export type HighlightedSessionOperationReceiptKind =
  | "session-revoke"
  | "focused-source-revoke"
  | "focused-source-snapshot";

export type HighlightedSessionOperationReceipt = {
  kind: HighlightedSessionOperationReceiptKind;
  tone: ConsoleNoticeTone;
  message: string;
  createdAt: string;
  requestId?: string | null;
  sessionId?: string;
  sourceKey?: string;
  sourceIssuedFromIp?: string | null;
  sourceIssuedUserAgent?: string | null;
};

export type HighlightedSessionOperationReceiptInput = Omit<
  HighlightedSessionOperationReceipt,
  "createdAt"
>;

export const HIGHLIGHTED_OPERATION_RECEIPT_LIMIT = 3;
export const ADMIN_SESSION_FOCUSED_SOURCE_SNAPSHOT_UNAVAILABLE_MESSAGE =
  "Focused source snapshot is not available.";

type HighlightedSessionOperationReceiptContext = {
  sessionId?: string;
  sourceKey?: string;
  sourceIssuedFromIp?: string | null;
  sourceIssuedUserAgent?: string | null;
};

type HighlightedSessionOperationReceiptOutcome = {
  tone: ConsoleNoticeTone;
  message: string;
  requestId?: string | null;
};

export function createSessionRevokeNotice({
  requestId,
  revokedCount,
  skippedCount,
  revokedCurrentSession,
  zeroMessage,
  successMessage,
  skippedMessage,
}: SessionRevokeNoticeOptions): RequestScopedNotice {
  if (revokedCount === 0) {
    return createRequestScopedNotice(zeroMessage, "warning", requestId);
  }

  const messageParts = [successMessage(revokedCount)];
  if (skippedCount > 0) {
    messageParts.push(skippedMessage(skippedCount));
  }
  if (revokedCurrentSession) {
    messageParts.push(CURRENT_SESSION_REISSUE_NOTICE);
  }

  return createRequestScopedNotice(
    messageParts.join(" "),
    revokedCurrentSession ? "warning" : "success",
    requestId,
  );
}

export function createRiskGroupRevokeNotice({
  matchedGroupCount,
  requestId,
  revokedCurrentSession,
  revokedGroupCount,
  revokedSessionCount,
  skippedSessionCount,
}: RiskGroupRevokeNoticeOptions): RequestScopedNotice {
  if (revokedSessionCount === 0) {
    return createRequestScopedNotice(
      matchedGroupCount === 0
        ? "No source groups matched the selected risk filter."
        : "No active admin sessions were revoked in the matching risk groups.",
      "warning",
      requestId,
    );
  }

  return createSessionRevokeNotice({
    requestId,
    revokedCount: revokedSessionCount,
    skippedCount: skippedSessionCount,
    revokedCurrentSession,
    zeroMessage: "No active admin sessions were revoked in the matching risk groups.",
    successMessage: (revokedCount) =>
      `Revoked ${revokedCount} active session(s) across ${revokedGroupCount} risk group(s).`,
    skippedMessage: (skippedCount) =>
      `${skippedCount} session(s) were already unavailable.`,
  });
}

export function getAdminSessionSourceRiskGuardMessage(
  action: AdminSessionSourceRiskGuardAction,
) {
  switch (action) {
    case "snapshot":
      return "Select a source risk filter before exporting a snapshot.";
    case "groups-csv":
      return "Select a source risk filter before exporting CSV.";
    case "sessions-csv":
      return "Select a source risk filter before exporting session CSV.";
    case "revoke":
    default:
      return "Select a source risk filter before revoking groups.";
  }
}

export function getAdminSessionSourceRiskSelectionPrompt() {
  return "Select a source risk filter to batch-revoke risky groups.";
}

export function createAdminSessionRiskTimelineNotReadyNotice() {
  return createRequestScopedNotice(
    "Risk timeline data is not ready for export yet.",
    "warning",
  );
}

export function formatHighlightedOperationReceiptLabel(
  kind: HighlightedSessionOperationReceiptKind,
) {
  switch (kind) {
    case "focused-source-snapshot":
      return "Focused source snapshot";
    case "focused-source-revoke":
      return "Focused source revoke";
    case "session-revoke":
    default:
      return "Session revoke";
  }
}

export function getHighlightedOperationReceiptTone(tone: ConsoleNoticeTone) {
  switch (tone) {
    case "success":
      return "border-emerald-300/40 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    case "danger":
      return "border-rose-300/40 bg-rose-500/10 text-rose-200";
    case "info":
    default:
      return "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]";
  }
}

export function matchesHighlightedOperationReceiptContext(
  receipt: HighlightedSessionOperationReceipt,
  highlightedSessionId: string,
  sourceKey?: string,
) {
  if (receipt.sessionId && receipt.sessionId !== highlightedSessionId) {
    return false;
  }

  if (receipt.sourceKey && receipt.sourceKey !== sourceKey) {
    return false;
  }

  return true;
}

export function createHighlightedOperationReceipt(
  kind: HighlightedSessionOperationReceiptKind,
  context: HighlightedSessionOperationReceiptContext,
  outcome: HighlightedSessionOperationReceiptOutcome,
): HighlightedSessionOperationReceiptInput {
  return {
    kind,
    tone: outcome.tone,
    message: outcome.message,
    requestId: outcome.requestId,
    sessionId: context.sessionId,
    sourceKey: context.sourceKey,
    sourceIssuedFromIp: context.sourceIssuedFromIp,
    sourceIssuedUserAgent: context.sourceIssuedUserAgent,
  };
}

export function createNoticeHighlightedOperationReceipt(
  kind: HighlightedSessionOperationReceiptKind,
  context: HighlightedSessionOperationReceiptContext,
  notice: RequestScopedNotice,
): HighlightedSessionOperationReceiptInput {
  return createHighlightedOperationReceipt(kind, context, {
    tone: notice.tone,
    message: notice.message,
    requestId: notice.requestId,
  });
}

export function createErrorHighlightedOperationReceipt(
  kind: HighlightedSessionOperationReceiptKind,
  context: HighlightedSessionOperationReceiptContext,
  message: string,
  requestId?: string | null,
): HighlightedSessionOperationReceiptInput {
  return createHighlightedOperationReceipt(kind, context, {
    tone: "danger",
    message,
    requestId,
  });
}

export function prependHighlightedOperationReceipt(
  previous: HighlightedSessionOperationReceipt[],
  receipt: HighlightedSessionOperationReceiptInput,
  limit = HIGHLIGHTED_OPERATION_RECEIPT_LIMIT,
  createdAt = new Date().toISOString(),
): HighlightedSessionOperationReceipt[] {
  return [
    {
      ...receipt,
      createdAt,
    },
    ...previous,
  ].slice(0, limit);
}
