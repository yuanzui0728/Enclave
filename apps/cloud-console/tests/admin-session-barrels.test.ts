import { describe, expect, it } from "vitest";
import * as adminSessionControls from "../src/components/admin-session-controls";
import { AdminSessionActionButton } from "../src/components/admin-session-action-button";
import { AdminSessionBrandBadge } from "../src/components/admin-session-brand-badge";
import { AdminSessionBrandEyebrow } from "../src/components/admin-session-brand-eyebrow";
import { AdminSessionFilterControls } from "../src/components/admin-session-filter-controls";
import { AdminSessionNeutralChip } from "../src/components/admin-session-neutral-chip";
import { AdminSessionQuickViewButtons } from "../src/components/admin-session-quick-view-buttons";
import { AdminSessionSectionHeader } from "../src/components/admin-session-section-header";
import { AdminSessionSourceGroupFilterControls } from "../src/components/admin-session-source-group-filter-controls";
import { AdminSessionSourceGroupRiskBadge } from "../src/components/admin-session-source-group-risk-badge";
import { AdminSessionSourceGroupRiskSignals } from "../src/components/admin-session-source-group-risk-signals";
import { AdminSessionSourceGroupSummaryPills } from "../src/components/admin-session-source-group-summary-pills";
import { AdminSessionStatusBadge } from "../src/components/admin-session-status-badge";
import { AdminSessionSummaryChip } from "../src/components/admin-session-summary-chip";
import * as adminSessionDownload from "../src/lib/admin-session-download";
import * as adminSessionHelpers from "../src/lib/admin-session-helpers";
import * as adminSessionMeta from "../src/lib/admin-session-meta";
import * as adminSessionOperations from "../src/lib/admin-session-operations";

describe("admin session barrels", () => {
  it("keeps the admin-session-controls barrel aligned with the shared admin-session components", () => {
    expect(Object.keys(adminSessionControls).sort()).toEqual([
      "AdminSessionActionButton",
      "AdminSessionBrandBadge",
      "AdminSessionBrandEyebrow",
      "AdminSessionFilterControls",
      "AdminSessionNeutralChip",
      "AdminSessionQuickViewButtons",
      "AdminSessionSectionHeader",
      "AdminSessionSourceGroupFilterControls",
      "AdminSessionSourceGroupRiskBadge",
      "AdminSessionSourceGroupRiskSignals",
      "AdminSessionSourceGroupSummaryPills",
      "AdminSessionStatusBadge",
      "AdminSessionSummaryChip",
    ]);

    expect(adminSessionControls.AdminSessionActionButton).toBe(
      AdminSessionActionButton,
    );
    expect(adminSessionControls.AdminSessionBrandBadge).toBe(
      AdminSessionBrandBadge,
    );
    expect(adminSessionControls.AdminSessionBrandEyebrow).toBe(
      AdminSessionBrandEyebrow,
    );
    expect(adminSessionControls.AdminSessionFilterControls).toBe(
      AdminSessionFilterControls,
    );
    expect(adminSessionControls.AdminSessionNeutralChip).toBe(
      AdminSessionNeutralChip,
    );
    expect(adminSessionControls.AdminSessionQuickViewButtons).toBe(
      AdminSessionQuickViewButtons,
    );
    expect(adminSessionControls.AdminSessionSectionHeader).toBe(
      AdminSessionSectionHeader,
    );
    expect(adminSessionControls.AdminSessionSourceGroupFilterControls).toBe(
      AdminSessionSourceGroupFilterControls,
    );
    expect(adminSessionControls.AdminSessionSourceGroupRiskBadge).toBe(
      AdminSessionSourceGroupRiskBadge,
    );
    expect(adminSessionControls.AdminSessionSourceGroupRiskSignals).toBe(
      AdminSessionSourceGroupRiskSignals,
    );
    expect(adminSessionControls.AdminSessionSourceGroupSummaryPills).toBe(
      AdminSessionSourceGroupSummaryPills,
    );
    expect(adminSessionControls.AdminSessionStatusBadge).toBe(
      AdminSessionStatusBadge,
    );
    expect(adminSessionControls.AdminSessionSummaryChip).toBe(
      AdminSessionSummaryChip,
    );
  });

  it("keeps the admin-session-helpers barrel aligned with admin-session metadata", () => {
    expect(Object.keys(adminSessionHelpers).sort()).toEqual([
      "ADMIN_SESSION_FOCUSED_SOURCE_SNAPSHOT_UNAVAILABLE_MESSAGE",
      "HIGHLIGHTED_OPERATION_RECEIPT_LIMIT",
      "createAdminSessionArtifactDownloadNotice",
      "createAdminSessionDownloadNotice",
      "createAdminSessionRiskTimelineNotReadyNotice",
      "createErrorHighlightedOperationReceipt",
      "createHighlightedOperationReceipt",
      "createNoticeHighlightedOperationReceipt",
      "createRiskGroupRevokeNotice",
      "createSessionRevokeNotice",
      "formatAdminSessionReasonFilterLabel",
      "formatAdminSessionRevocationReasonLabel",
      "formatAdminSessionScopeLabel",
      "formatAdminSessionSortDirectionLabel",
      "formatAdminSessionSortFieldLabel",
      "formatAdminSessionSourceGroupRiskFilterLabel",
      "formatAdminSessionSourceGroupRiskLevelLabel",
      "formatAdminSessionSourceGroupRiskSignalLabel",
      "formatAdminSessionSourceGroupSortDirectionLabel",
      "formatAdminSessionSourceGroupSortFieldLabel",
      "formatAdminSessionStatusFilterLabel",
      "formatAdminSessionStatusLabel",
      "formatHighlightedOperationReceiptLabel",
      "getAdminSessionSourceGroupRiskTone",
      "getAdminSessionSourceGroupRiskToneStyles",
      "getAdminSessionSourceRiskGuardMessage",
      "getAdminSessionSourceRiskSelectionPrompt",
      "getAdminSessionStatusTone",
      "getAdminSessionStatusToneStyles",
      "getAdminSessionToneStyles",
      "getHighlightedOperationReceiptTone",
      "matchesHighlightedOperationReceiptContext",
      "prependHighlightedOperationReceipt",
      "withDownloadedJsonFile",
      "withDownloadedTextFile",
    ]);

    expect(adminSessionHelpers.createAdminSessionDownloadNotice).toBe(
      adminSessionDownload.createAdminSessionDownloadNotice,
    );
    expect(adminSessionHelpers.createAdminSessionArtifactDownloadNotice).toBe(
      adminSessionDownload.createAdminSessionArtifactDownloadNotice,
    );
    expect(
      adminSessionHelpers.ADMIN_SESSION_FOCUSED_SOURCE_SNAPSHOT_UNAVAILABLE_MESSAGE,
    ).toBe(
      adminSessionOperations.ADMIN_SESSION_FOCUSED_SOURCE_SNAPSHOT_UNAVAILABLE_MESSAGE,
    );
    expect(adminSessionHelpers.createAdminSessionRiskTimelineNotReadyNotice).toBe(
      adminSessionOperations.createAdminSessionRiskTimelineNotReadyNotice,
    );
    expect(adminSessionHelpers.createErrorHighlightedOperationReceipt).toBe(
      adminSessionOperations.createErrorHighlightedOperationReceipt,
    );
    expect(adminSessionHelpers.createHighlightedOperationReceipt).toBe(
      adminSessionOperations.createHighlightedOperationReceipt,
    );
    expect(adminSessionHelpers.createNoticeHighlightedOperationReceipt).toBe(
      adminSessionOperations.createNoticeHighlightedOperationReceipt,
    );
    expect(adminSessionHelpers.createRiskGroupRevokeNotice).toBe(
      adminSessionOperations.createRiskGroupRevokeNotice,
    );
    expect(adminSessionHelpers.createSessionRevokeNotice).toBe(
      adminSessionOperations.createSessionRevokeNotice,
    );
    expect(adminSessionHelpers.formatAdminSessionStatusLabel).toBe(
      adminSessionMeta.formatAdminSessionStatusLabel,
    );
    expect(adminSessionHelpers.formatAdminSessionStatusFilterLabel).toBe(
      adminSessionMeta.formatAdminSessionStatusFilterLabel,
    );
    expect(adminSessionHelpers.formatAdminSessionRevocationReasonLabel).toBe(
      adminSessionMeta.formatAdminSessionRevocationReasonLabel,
    );
    expect(adminSessionHelpers.formatAdminSessionReasonFilterLabel).toBe(
      adminSessionMeta.formatAdminSessionReasonFilterLabel,
    );
    expect(adminSessionHelpers.formatAdminSessionScopeLabel).toBe(
      adminSessionMeta.formatAdminSessionScopeLabel,
    );
    expect(adminSessionHelpers.formatAdminSessionSortFieldLabel).toBe(
      adminSessionMeta.formatAdminSessionSortFieldLabel,
    );
    expect(adminSessionHelpers.formatAdminSessionSortDirectionLabel).toBe(
      adminSessionMeta.formatAdminSessionSortDirectionLabel,
    );
    expect(
      adminSessionHelpers.formatAdminSessionSourceGroupSortFieldLabel,
    ).toBe(adminSessionMeta.formatAdminSessionSourceGroupSortFieldLabel);
    expect(
      adminSessionHelpers.formatAdminSessionSourceGroupSortDirectionLabel,
    ).toBe(adminSessionMeta.formatAdminSessionSourceGroupSortDirectionLabel);
    expect(adminSessionHelpers.formatAdminSessionSourceGroupRiskFilterLabel).toBe(
      adminSessionMeta.formatAdminSessionSourceGroupRiskFilterLabel,
    );
    expect(adminSessionHelpers.formatAdminSessionSourceGroupRiskLevelLabel).toBe(
      adminSessionMeta.formatAdminSessionSourceGroupRiskLevelLabel,
    );
    expect(adminSessionHelpers.formatAdminSessionSourceGroupRiskSignalLabel).toBe(
      adminSessionMeta.formatAdminSessionSourceGroupRiskSignalLabel,
    );
    expect(adminSessionHelpers.formatHighlightedOperationReceiptLabel).toBe(
      adminSessionOperations.formatHighlightedOperationReceiptLabel,
    );
    expect(adminSessionHelpers.getHighlightedOperationReceiptTone).toBe(
      adminSessionOperations.getHighlightedOperationReceiptTone,
    );
    expect(adminSessionHelpers.getAdminSessionSourceRiskGuardMessage).toBe(
      adminSessionOperations.getAdminSessionSourceRiskGuardMessage,
    );
    expect(adminSessionHelpers.getAdminSessionSourceRiskSelectionPrompt).toBe(
      adminSessionOperations.getAdminSessionSourceRiskSelectionPrompt,
    );
    expect(adminSessionHelpers.HIGHLIGHTED_OPERATION_RECEIPT_LIMIT).toBe(
      adminSessionOperations.HIGHLIGHTED_OPERATION_RECEIPT_LIMIT,
    );
    expect(adminSessionHelpers.getAdminSessionToneStyles).toBe(
      adminSessionMeta.getAdminSessionToneStyles,
    );
    expect(adminSessionHelpers.getAdminSessionStatusTone).toBe(
      adminSessionMeta.getAdminSessionStatusTone,
    );
    expect(adminSessionHelpers.getAdminSessionStatusToneStyles).toBe(
      adminSessionMeta.getAdminSessionStatusToneStyles,
    );
    expect(adminSessionHelpers.getAdminSessionSourceGroupRiskTone).toBe(
      adminSessionMeta.getAdminSessionSourceGroupRiskTone,
    );
    expect(adminSessionHelpers.getAdminSessionSourceGroupRiskToneStyles).toBe(
      adminSessionMeta.getAdminSessionSourceGroupRiskToneStyles,
    );
    expect(adminSessionHelpers.matchesHighlightedOperationReceiptContext).toBe(
      adminSessionOperations.matchesHighlightedOperationReceiptContext,
    );
    expect(adminSessionHelpers.prependHighlightedOperationReceipt).toBe(
      adminSessionOperations.prependHighlightedOperationReceipt,
    );
    expect(adminSessionHelpers.withDownloadedJsonFile).toBe(
      adminSessionDownload.withDownloadedJsonFile,
    );
    expect(adminSessionHelpers.withDownloadedTextFile).toBe(
      adminSessionDownload.withDownloadedTextFile,
    );
  });
});
