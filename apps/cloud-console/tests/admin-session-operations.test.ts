import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_FOCUSED_SOURCE_SNAPSHOT_UNAVAILABLE_MESSAGE,
  createAdminSessionRiskTimelineNotReadyNotice,
  createErrorHighlightedOperationReceipt,
  createHighlightedOperationReceipt,
  createNoticeHighlightedOperationReceipt,
  createRiskGroupRevokeNotice,
  createSessionRevokeNotice,
  formatHighlightedOperationReceiptLabel,
  getAdminSessionSourceRiskGuardMessage,
  getAdminSessionSourceRiskSelectionPrompt,
  getHighlightedOperationReceiptTone,
  HIGHLIGHTED_OPERATION_RECEIPT_LIMIT,
  matchesHighlightedOperationReceiptContext,
  prependHighlightedOperationReceipt,
  type HighlightedSessionOperationReceipt,
} from "../src/lib/admin-session-operations";
import { createRequestScopedNotice } from "../src/lib/request-scoped-notice";

describe("admin session operations", () => {
  it("builds revoke notices with skipped counts and current-session warnings", () => {
    expect(
      createSessionRevokeNotice({
        requestId: "req-revoke",
        revokedCount: 2,
        skippedCount: 1,
        revokedCurrentSession: true,
        zeroMessage: "Nothing revoked.",
        successMessage: (count) => `Revoked ${count} session(s).`,
        skippedMessage: (count) => `${count} session(s) were skipped.`,
      }),
    ).toEqual({
      message:
        "Revoked 2 session(s). 1 session(s) were skipped. The current console session was included, so the next admin request will re-issue a short-lived token.",
      tone: "warning",
      requestId: "req-revoke",
    });

    expect(
      createSessionRevokeNotice({
        revokedCount: 0,
        skippedCount: 0,
        revokedCurrentSession: false,
        zeroMessage: "Nothing revoked.",
        successMessage: (count) => `Revoked ${count} session(s).`,
        skippedMessage: (count) => `${count} session(s) were skipped.`,
      }),
    ).toEqual({
      message: "Nothing revoked.",
      tone: "warning",
      requestId: undefined,
    });
  });

  it("builds risk-group revoke notices for empty and successful batches", () => {
    expect(
      createRiskGroupRevokeNotice({
        matchedGroupCount: 0,
        revokedGroupCount: 0,
        revokedSessionCount: 0,
        skippedSessionCount: 0,
        revokedCurrentSession: false,
      }),
    ).toEqual({
      message: "No source groups matched the selected risk filter.",
      tone: "warning",
      requestId: undefined,
    });

    expect(
      createRiskGroupRevokeNotice({
        requestId: "req-risk",
        matchedGroupCount: 3,
        revokedGroupCount: 2,
        revokedSessionCount: 4,
        skippedSessionCount: 1,
        revokedCurrentSession: false,
      }),
    ).toEqual({
      message:
        "Revoked 4 active session(s) across 2 risk group(s). 1 session(s) were already unavailable.",
      tone: "success",
      requestId: "req-risk",
    });
  });

  it("keeps source-risk and focused-source guard copy aligned", () => {
    expect(ADMIN_SESSION_FOCUSED_SOURCE_SNAPSHOT_UNAVAILABLE_MESSAGE).toBe(
      "Focused source snapshot is not available.",
    );
    expect(getAdminSessionSourceRiskGuardMessage("snapshot")).toBe(
      "Select a source risk filter before exporting a snapshot.",
    );
    expect(getAdminSessionSourceRiskGuardMessage("groups-csv")).toBe(
      "Select a source risk filter before exporting CSV.",
    );
    expect(getAdminSessionSourceRiskGuardMessage("sessions-csv")).toBe(
      "Select a source risk filter before exporting session CSV.",
    );
    expect(getAdminSessionSourceRiskGuardMessage("revoke")).toBe(
      "Select a source risk filter before revoking groups.",
    );
    expect(getAdminSessionSourceRiskSelectionPrompt()).toBe(
      "Select a source risk filter to batch-revoke risky groups.",
    );
    expect(createAdminSessionRiskTimelineNotReadyNotice()).toEqual({
      message: "Risk timeline data is not ready for export yet.",
      tone: "warning",
      requestId: undefined,
    });
  });

  it("formats highlighted receipt labels and tones consistently", () => {
    expect(formatHighlightedOperationReceiptLabel("session-revoke")).toBe(
      "Session revoke",
    );
    expect(
      formatHighlightedOperationReceiptLabel("focused-source-revoke"),
    ).toBe("Focused source revoke");
    expect(
      formatHighlightedOperationReceiptLabel("focused-source-snapshot"),
    ).toBe("Focused source snapshot");

    expect(getHighlightedOperationReceiptTone("success")).toBe(
      "border-emerald-300/40 bg-emerald-500/10 text-emerald-100",
    );
    expect(getHighlightedOperationReceiptTone("warning")).toBe(
      "border-amber-300/40 bg-amber-500/10 text-amber-100",
    );
    expect(getHighlightedOperationReceiptTone("danger")).toBe(
      "border-rose-300/40 bg-rose-500/10 text-rose-200",
    );
    expect(getHighlightedOperationReceiptTone("info")).toBe(
      "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
    );
  });

  it("matches and prepends highlighted receipts with a stable limit", () => {
    const previous: HighlightedSessionOperationReceipt[] = Array.from(
      { length: HIGHLIGHTED_OPERATION_RECEIPT_LIMIT },
      (_, index) => ({
        kind: "session-revoke",
        tone: "success",
        message: `Receipt ${index + 1}`,
        createdAt: `2026-04-21T00:00:0${index}.000Z`,
        sessionId: "session-1",
        sourceKey: "source-1",
      }),
    );

    const next = prependHighlightedOperationReceipt(
      previous,
      {
        kind: "focused-source-snapshot",
        tone: "warning",
        message: "Latest receipt",
        sessionId: "session-1",
        sourceKey: "source-1",
      },
      undefined,
      "2026-04-21T00:00:10.000Z",
    );

    expect(next).toHaveLength(HIGHLIGHTED_OPERATION_RECEIPT_LIMIT);
    expect(next[0]).toEqual({
      kind: "focused-source-snapshot",
      tone: "warning",
      message: "Latest receipt",
      createdAt: "2026-04-21T00:00:10.000Z",
      sessionId: "session-1",
      sourceKey: "source-1",
    });
    expect(next.at(-1)?.message).toBe("Receipt 2");

    expect(
      matchesHighlightedOperationReceiptContext(next[0], "session-1", "source-1"),
    ).toBe(true);
    expect(
      matchesHighlightedOperationReceiptContext(next[0], "session-2", "source-1"),
    ).toBe(false);
    expect(
      matchesHighlightedOperationReceiptContext(next[0], "session-1", "source-2"),
    ).toBe(false);
  });

  it("builds highlighted receipt payloads from generic, notice, and error outcomes", () => {
    expect(
      createHighlightedOperationReceipt(
        "session-revoke",
        {
          sessionId: "session-1",
          sourceKey: "source-1",
          sourceIssuedFromIp: "127.0.0.1",
          sourceIssuedUserAgent: "UA",
        },
        {
          tone: "success",
          message: "Revoked.",
          requestId: "req-generic",
        },
      ),
    ).toEqual({
      kind: "session-revoke",
      tone: "success",
      message: "Revoked.",
      requestId: "req-generic",
      sessionId: "session-1",
      sourceKey: "source-1",
      sourceIssuedFromIp: "127.0.0.1",
      sourceIssuedUserAgent: "UA",
    });

    expect(
      createNoticeHighlightedOperationReceipt(
        "focused-source-revoke",
        {
          sourceKey: "source-2",
          sessionId: "session-2",
        },
        createRequestScopedNotice("Snapshot ready.", "warning", "req-notice"),
      ),
    ).toEqual({
      kind: "focused-source-revoke",
      tone: "warning",
      message: "Snapshot ready.",
      requestId: "req-notice",
      sessionId: "session-2",
      sourceKey: "source-2",
      sourceIssuedFromIp: undefined,
      sourceIssuedUserAgent: undefined,
    });

    expect(
      createErrorHighlightedOperationReceipt(
        "focused-source-snapshot",
        {
          sourceKey: "source-3",
          sourceIssuedFromIp: "10.0.0.1",
        },
        "Download failed.",
        "req-error",
      ),
    ).toEqual({
      kind: "focused-source-snapshot",
      tone: "danger",
      message: "Download failed.",
      requestId: "req-error",
      sessionId: undefined,
      sourceKey: "source-3",
      sourceIssuedFromIp: "10.0.0.1",
      sourceIssuedUserAgent: undefined,
    });
  });
});
