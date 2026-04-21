import { describe, expect, it } from "vitest";
import * as adminSessionControls from "../src/components/admin-session-controls";
import { AdminSessionActionButton } from "../src/components/admin-session-action-button";
import { AdminSessionBrandBadge } from "../src/components/admin-session-brand-badge";
import { AdminSessionBrandEyebrow } from "../src/components/admin-session-brand-eyebrow";
import { AdminSessionFilterControls } from "../src/components/admin-session-filter-controls";
import { AdminSessionQuickViewButtons } from "../src/components/admin-session-quick-view-buttons";
import { AdminSessionSectionHeader } from "../src/components/admin-session-section-header";
import { AdminSessionSourceGroupFilterControls } from "../src/components/admin-session-source-group-filter-controls";
import { AdminSessionSourceGroupRiskBadge } from "../src/components/admin-session-source-group-risk-badge";
import { AdminSessionSourceGroupRiskSignals } from "../src/components/admin-session-source-group-risk-signals";
import { AdminSessionSourceGroupSummaryPills } from "../src/components/admin-session-source-group-summary-pills";
import { AdminSessionStatusBadge } from "../src/components/admin-session-status-badge";
import { AdminSessionSummaryChip } from "../src/components/admin-session-summary-chip";
import * as adminSessionHelpers from "../src/lib/admin-session-helpers";
import * as adminSessionMeta from "../src/lib/admin-session-meta";

describe("admin session barrels", () => {
  it("keeps the admin-session-controls barrel aligned with the shared admin-session components", () => {
    expect(Object.keys(adminSessionControls).sort()).toEqual([
      "AdminSessionActionButton",
      "AdminSessionBrandBadge",
      "AdminSessionBrandEyebrow",
      "AdminSessionFilterControls",
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
      "getAdminSessionSourceGroupRiskTone",
      "getAdminSessionSourceGroupRiskToneStyles",
      "getAdminSessionStatusTone",
      "getAdminSessionStatusToneStyles",
      "getAdminSessionToneStyles",
    ]);

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
  });
});
