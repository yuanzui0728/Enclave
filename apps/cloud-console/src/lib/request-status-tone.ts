import type {
  CloudWorldLifecycleStatus,
  CloudWorldRequestStatus,
} from "@yinjie/contracts";

export type RequestStatusTone = "warning" | "danger" | "success" | "neutral";

export function getRequestStatusTone(
  status: CloudWorldRequestStatus,
): RequestStatusTone {
  switch (status) {
    case "active":
      return "success";
    case "rejected":
    case "disabled":
      return "danger";
    case "pending":
    case "provisioning":
    default:
      return "warning";
  }
}

export function getProjectedWorldStatusTone(
  status?: CloudWorldLifecycleStatus | null,
): RequestStatusTone {
  switch (status) {
    case "ready":
      return "success";
    case "failed":
    case "disabled":
      return "danger";
    case "queued":
    case "creating":
    case "bootstrapping":
    case "starting":
      return "warning";
    case "sleeping":
    case "stopping":
    case "deleting":
    default:
      return "neutral";
  }
}

export function getRequestToneStyles(tone: RequestStatusTone) {
  switch (tone) {
    case "success":
      return {
        panel:
          "border-emerald-300/50 bg-emerald-500/10 hover:border-emerald-200/80",
        count: "text-emerald-50",
        detail: "text-emerald-100/85",
        badge:
          "border-emerald-300/50 bg-emerald-500/10 text-emerald-100",
      };
    case "danger":
      return {
        panel:
          "border-rose-300/60 bg-rose-500/10 hover:border-rose-200/80",
        count: "text-rose-100",
        detail: "text-rose-100/80",
        badge: "border-rose-300/60 bg-rose-500/10 text-rose-200",
      };
    case "neutral":
      return {
        panel:
          "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] hover:border-[color:var(--border-strong)]",
        count: "text-[color:var(--text-primary)]",
        detail: "text-[color:var(--text-secondary)]",
        badge:
          "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]",
      };
    case "warning":
    default:
      return {
        panel:
          "border-amber-300/50 bg-amber-500/10 hover:border-amber-200/70",
        count: "text-amber-50",
        detail: "text-amber-100/85",
        badge: "border-amber-300/50 bg-amber-500/10 text-amber-100",
      };
  }
}

export function getRequestStatusToneStyles(status: CloudWorldRequestStatus) {
  return getRequestToneStyles(getRequestStatusTone(status));
}

export function getProjectedWorldStatusToneStyles(
  status?: CloudWorldLifecycleStatus | null,
) {
  return getRequestToneStyles(getProjectedWorldStatusTone(status));
}

export function getProjectedDesiredStateTone(
  desiredState?: "running" | "sleeping" | null,
): RequestStatusTone {
  switch (desiredState) {
    case "running":
      return "success";
    case "sleeping":
    default:
      return "neutral";
  }
}

export function getProjectedDesiredStateToneStyles(
  desiredState?: "running" | "sleeping" | null,
) {
  return getRequestToneStyles(getProjectedDesiredStateTone(desiredState));
}
