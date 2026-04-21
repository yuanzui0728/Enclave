import { describe, expect, it } from "vitest";
import {
  formatAdminSessionReasonFilterLabel,
  formatAdminSessionRevocationReasonLabel,
  formatAdminSessionScopeLabel,
  formatAdminSessionSortDirectionLabel,
  formatAdminSessionSortFieldLabel,
  formatAdminSessionSourceGroupRiskFilterLabel,
  formatAdminSessionSourceGroupRiskLevelLabel,
  formatAdminSessionSourceGroupRiskSignalLabel,
  formatAdminSessionSourceGroupSortDirectionLabel,
  formatAdminSessionSourceGroupSortFieldLabel,
  formatAdminSessionStatusFilterLabel,
  formatAdminSessionStatusLabel,
  getAdminSessionSourceGroupRiskTone,
  getAdminSessionSourceGroupRiskToneStyles,
  getAdminSessionStatusTone,
  getAdminSessionStatusToneStyles,
  getAdminSessionToneStyles,
} from "../src/lib/admin-session-meta";

describe("admin session metadata", () => {
  it("formats session status, reason, scope, and sort labels consistently", () => {
    expect(formatAdminSessionStatusLabel("active")).toBe("Active");
    expect(formatAdminSessionStatusLabel("expired")).toBe("Expired");
    expect(formatAdminSessionStatusLabel("revoked")).toBe("Revoked");
    expect(formatAdminSessionStatusLabel(null)).toBe("Unknown");

    expect(formatAdminSessionStatusFilterLabel("all")).toBe("All statuses");
    expect(formatAdminSessionStatusFilterLabel("active")).toBe("Active");
    expect(formatAdminSessionStatusFilterLabel("expired")).toBe("Expired");
    expect(formatAdminSessionStatusFilterLabel("revoked")).toBe("Revoked");

    expect(formatAdminSessionRevocationReasonLabel("logout")).toBe("Logout");
    expect(formatAdminSessionRevocationReasonLabel("manual-revocation")).toBe(
      "Manual revoke",
    );
    expect(
      formatAdminSessionRevocationReasonLabel("refresh-token-reuse"),
    ).toBe("Refresh reuse");
    expect(formatAdminSessionRevocationReasonLabel(null)).toBe("Not available");

    expect(formatAdminSessionReasonFilterLabel("all")).toBe("All reasons");
    expect(formatAdminSessionReasonFilterLabel("logout")).toBe("Logout");
    expect(
      formatAdminSessionReasonFilterLabel("manual-revocation"),
    ).toBe("Manual revoke");
    expect(
      formatAdminSessionReasonFilterLabel("refresh-token-reuse"),
    ).toBe("Refresh reuse");

    expect(formatAdminSessionScopeLabel("all")).toBe("All sessions");
    expect(formatAdminSessionScopeLabel("current")).toBe("Current only");

    expect(formatAdminSessionSortFieldLabel("updatedAt")).toBe("Updated");
    expect(formatAdminSessionSortFieldLabel("createdAt")).toBe("Created");
    expect(formatAdminSessionSortFieldLabel("expiresAt")).toBe(
      "Refresh expiry",
    );
    expect(formatAdminSessionSortFieldLabel("lastUsedAt")).toBe("Last used");
    expect(formatAdminSessionSortFieldLabel("revokedAt")).toBe("Revoked at");

    expect(formatAdminSessionSortDirectionLabel("asc")).toBe("Ascending");
    expect(formatAdminSessionSortDirectionLabel("desc")).toBe("Descending");
  });

  it("formats source-group risk and sort labels consistently", () => {
    expect(formatAdminSessionSourceGroupSortFieldLabel("activeSessions")).toBe(
      "Active sessions",
    );
    expect(formatAdminSessionSourceGroupSortFieldLabel("totalSessions")).toBe(
      "Total sessions",
    );
    expect(
      formatAdminSessionSourceGroupSortFieldLabel("latestLastUsedAt"),
    ).toBe("Latest used");
    expect(
      formatAdminSessionSourceGroupSortFieldLabel("latestCreatedAt"),
    ).toBe("Latest created");
    expect(
      formatAdminSessionSourceGroupSortFieldLabel("latestRevokedAt"),
    ).toBe("Latest revoked");

    expect(formatAdminSessionSourceGroupSortDirectionLabel("asc")).toBe(
      "Ascending",
    );
    expect(formatAdminSessionSourceGroupSortDirectionLabel("desc")).toBe(
      "Descending",
    );

    expect(formatAdminSessionSourceGroupRiskFilterLabel("all")).toBe(
      "All risk levels",
    );
    expect(formatAdminSessionSourceGroupRiskFilterLabel("critical")).toBe(
      "Critical only",
    );
    expect(formatAdminSessionSourceGroupRiskFilterLabel("watch")).toBe(
      "Watch only",
    );
    expect(formatAdminSessionSourceGroupRiskFilterLabel("normal")).toBe(
      "Normal only",
    );

    expect(formatAdminSessionSourceGroupRiskLevelLabel("critical")).toBe(
      "Critical risk",
    );
    expect(formatAdminSessionSourceGroupRiskLevelLabel("watch")).toBe(
      "Watch risk",
    );
    expect(formatAdminSessionSourceGroupRiskLevelLabel("normal")).toBe(
      "Normal risk",
    );

    expect(
      formatAdminSessionSourceGroupRiskSignalLabel("multiple-active-sessions"),
    ).toBe("Multiple active sessions");
    expect(
      formatAdminSessionSourceGroupRiskSignalLabel("repeated-revocations"),
    ).toBe("Repeated revocations");
    expect(
      formatAdminSessionSourceGroupRiskSignalLabel("refresh-token-reuse"),
    ).toBe("Refresh reuse detected");
  });

  it("keeps tone mappings aligned with shared badge styles", () => {
    expect(getAdminSessionToneStyles("success").badge).toBe(
      "border-emerald-300/50 bg-emerald-500/10 text-emerald-100",
    );
    expect(getAdminSessionToneStyles("warning").badge).toBe(
      "border-amber-300/50 bg-amber-500/10 text-amber-100",
    );
    expect(getAdminSessionToneStyles("danger").badge).toBe(
      "border-rose-300/60 bg-rose-500/10 text-rose-200",
    );
    expect(getAdminSessionToneStyles("neutral").badge).toBe(
      "border-[color:var(--border-faint)] bg-[color:var(--surface-input)] text-[color:var(--text-secondary)]",
    );

    expect(getAdminSessionStatusTone("active")).toBe("success");
    expect(getAdminSessionStatusTone("expired")).toBe("warning");
    expect(getAdminSessionStatusTone("revoked")).toBe("danger");
    expect(getAdminSessionStatusToneStyles("active")).toEqual(
      getAdminSessionToneStyles("success"),
    );
    expect(getAdminSessionStatusToneStyles("expired")).toEqual(
      getAdminSessionToneStyles("warning"),
    );
    expect(getAdminSessionStatusToneStyles("revoked")).toEqual(
      getAdminSessionToneStyles("danger"),
    );

    expect(getAdminSessionSourceGroupRiskTone("critical")).toBe("danger");
    expect(getAdminSessionSourceGroupRiskTone("watch")).toBe("warning");
    expect(getAdminSessionSourceGroupRiskTone("normal")).toBe("neutral");
    expect(getAdminSessionSourceGroupRiskToneStyles("critical")).toEqual(
      getAdminSessionToneStyles("danger"),
    );
    expect(getAdminSessionSourceGroupRiskToneStyles("watch")).toEqual(
      getAdminSessionToneStyles("warning"),
    );
    expect(getAdminSessionSourceGroupRiskToneStyles("normal")).toEqual(
      getAdminSessionToneStyles("neutral"),
    );
  });
});
