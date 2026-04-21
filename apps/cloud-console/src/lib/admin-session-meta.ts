import type {
  CloudAdminSessionRevocationReason,
  CloudAdminSessionSourceGroupRiskLevel,
  CloudAdminSessionSourceGroupRiskSignal,
  CloudAdminSessionSourceGroupSortField,
  CloudAdminSessionSortDirection,
  CloudAdminSessionSortField,
  CloudAdminSessionStatus,
} from "@yinjie/contracts";

export type AdminSessionTone = "success" | "warning" | "danger" | "neutral";

const ADMIN_SESSION_STATUS_LABELS: Record<CloudAdminSessionStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

const ADMIN_SESSION_STATUS_FILTER_LABELS: Record<
  CloudAdminSessionStatus | "all",
  string
> = {
  all: "All statuses",
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

const ADMIN_SESSION_REVOCATION_REASON_LABELS: Record<
  CloudAdminSessionRevocationReason,
  string
> = {
  logout: "Logout",
  "manual-revocation": "Manual revoke",
  "refresh-token-reuse": "Refresh reuse",
};

const ADMIN_SESSION_REASON_FILTER_LABELS: Record<
  CloudAdminSessionRevocationReason | "all",
  string
> = {
  all: "All reasons",
  ...ADMIN_SESSION_REVOCATION_REASON_LABELS,
};

const ADMIN_SESSION_SCOPE_LABELS = {
  all: "All sessions",
  current: "Current only",
} as const;

const ADMIN_SESSION_SORT_FIELD_LABELS: Record<
  CloudAdminSessionSortField,
  string
> = {
  updatedAt: "Updated",
  createdAt: "Created",
  expiresAt: "Refresh expiry",
  lastUsedAt: "Last used",
  revokedAt: "Revoked at",
};

const ADMIN_SESSION_SORT_DIRECTION_LABELS: Record<
  CloudAdminSessionSortDirection,
  string
> = {
  asc: "Ascending",
  desc: "Descending",
};

const ADMIN_SESSION_SOURCE_GROUP_SORT_FIELD_LABELS: Record<
  CloudAdminSessionSourceGroupSortField,
  string
> = {
  activeSessions: "Active sessions",
  totalSessions: "Total sessions",
  latestLastUsedAt: "Latest used",
  latestCreatedAt: "Latest created",
  latestRevokedAt: "Latest revoked",
};

const ADMIN_SESSION_SOURCE_GROUP_RISK_FILTER_LABELS: Record<
  CloudAdminSessionSourceGroupRiskLevel | "all",
  string
> = {
  all: "All risk levels",
  critical: "Critical only",
  watch: "Watch only",
  normal: "Normal only",
};

const ADMIN_SESSION_SOURCE_GROUP_RISK_LEVEL_LABELS: Record<
  CloudAdminSessionSourceGroupRiskLevel,
  string
> = {
  critical: "Critical risk",
  watch: "Watch risk",
  normal: "Normal risk",
};

const ADMIN_SESSION_SOURCE_GROUP_RISK_SIGNAL_LABELS: Record<
  CloudAdminSessionSourceGroupRiskSignal,
  string
> = {
  "refresh-token-reuse": "Refresh reuse detected",
  "repeated-revocations": "Repeated revocations",
  "multiple-active-sessions": "Multiple active sessions",
};

const ADMIN_SESSION_STATUS_TONES: Record<
  CloudAdminSessionStatus,
  AdminSessionTone
> = {
  active: "success",
  expired: "warning",
  revoked: "danger",
};

const ADMIN_SESSION_SOURCE_GROUP_RISK_TONES: Record<
  CloudAdminSessionSourceGroupRiskLevel,
  AdminSessionTone
> = {
  critical: "danger",
  watch: "warning",
  normal: "neutral",
};

const ADMIN_SESSION_TONE_STYLES: Record<
  AdminSessionTone,
  { badge: string }
> = {
  success: {
    badge: "border-emerald-300/50 bg-emerald-500/10 text-emerald-100",
  },
  warning: {
    badge: "border-amber-300/50 bg-amber-500/10 text-amber-100",
  },
  danger: {
    badge: "border-rose-300/60 bg-rose-500/10 text-rose-200",
  },
  neutral: {
    badge:
      "border-[color:var(--border-faint)] bg-[color:var(--surface-input)] text-[color:var(--text-secondary)]",
  },
};

export function formatAdminSessionStatusLabel(
  status?: CloudAdminSessionStatus | null,
) {
  if (!status) {
    return "Unknown";
  }

  return ADMIN_SESSION_STATUS_LABELS[status];
}

export function formatAdminSessionStatusFilterLabel(
  status?: CloudAdminSessionStatus | "all" | null,
) {
  if (!status) {
    return "Unknown";
  }

  return ADMIN_SESSION_STATUS_FILTER_LABELS[status];
}

export function formatAdminSessionRevocationReasonLabel(
  reason?: CloudAdminSessionRevocationReason | null,
) {
  if (!reason) {
    return "Not available";
  }

  return ADMIN_SESSION_REVOCATION_REASON_LABELS[reason];
}

export function formatAdminSessionReasonFilterLabel(
  reason?: CloudAdminSessionRevocationReason | "all" | null,
) {
  if (!reason) {
    return "Unknown";
  }

  return ADMIN_SESSION_REASON_FILTER_LABELS[reason];
}

export function formatAdminSessionScopeLabel(
  scope?: keyof typeof ADMIN_SESSION_SCOPE_LABELS | null,
) {
  if (!scope) {
    return "Unknown";
  }

  return ADMIN_SESSION_SCOPE_LABELS[scope];
}

export function formatAdminSessionSortFieldLabel(
  sortField?: CloudAdminSessionSortField | null,
) {
  if (!sortField) {
    return "Unknown";
  }

  return ADMIN_SESSION_SORT_FIELD_LABELS[sortField];
}

export function formatAdminSessionSortDirectionLabel(
  direction?: CloudAdminSessionSortDirection | null,
) {
  if (!direction) {
    return "Unknown";
  }

  return ADMIN_SESSION_SORT_DIRECTION_LABELS[direction];
}

export function formatAdminSessionSourceGroupSortFieldLabel(
  sortField?: CloudAdminSessionSourceGroupSortField | null,
) {
  if (!sortField) {
    return "Unknown";
  }

  return ADMIN_SESSION_SOURCE_GROUP_SORT_FIELD_LABELS[sortField];
}

export function formatAdminSessionSourceGroupSortDirectionLabel(
  direction?: CloudAdminSessionSortDirection | null,
) {
  return formatAdminSessionSortDirectionLabel(direction);
}

export function formatAdminSessionSourceGroupRiskFilterLabel(
  riskLevel?: CloudAdminSessionSourceGroupRiskLevel | "all" | null,
) {
  if (!riskLevel) {
    return "Unknown";
  }

  return ADMIN_SESSION_SOURCE_GROUP_RISK_FILTER_LABELS[riskLevel];
}

export function formatAdminSessionSourceGroupRiskLevelLabel(
  riskLevel?: CloudAdminSessionSourceGroupRiskLevel | null,
) {
  if (!riskLevel) {
    return "Unknown";
  }

  return ADMIN_SESSION_SOURCE_GROUP_RISK_LEVEL_LABELS[riskLevel];
}

export function formatAdminSessionSourceGroupRiskSignalLabel(
  signal?: CloudAdminSessionSourceGroupRiskSignal | null,
) {
  if (!signal) {
    return "Unknown";
  }

  return ADMIN_SESSION_SOURCE_GROUP_RISK_SIGNAL_LABELS[signal];
}

export function getAdminSessionToneStyles(tone: AdminSessionTone) {
  return ADMIN_SESSION_TONE_STYLES[tone];
}

export function getAdminSessionStatusTone(status: CloudAdminSessionStatus) {
  return ADMIN_SESSION_STATUS_TONES[status];
}

export function getAdminSessionStatusToneStyles(
  status: CloudAdminSessionStatus,
) {
  return getAdminSessionToneStyles(getAdminSessionStatusTone(status));
}

export function getAdminSessionSourceGroupRiskTone(
  riskLevel: CloudAdminSessionSourceGroupRiskLevel,
) {
  return ADMIN_SESSION_SOURCE_GROUP_RISK_TONES[riskLevel];
}

export function getAdminSessionSourceGroupRiskToneStyles(
  riskLevel: CloudAdminSessionSourceGroupRiskLevel,
) {
  return getAdminSessionToneStyles(
    getAdminSessionSourceGroupRiskTone(riskLevel),
  );
}
