import type {
  CloudWorldLifecycleStatus,
  CloudWorldRequestStatus,
} from "@yinjie/contracts";

export type ProjectedDesiredState = "running" | "sleeping";

const REQUEST_STATUS_LABELS: Record<CloudWorldRequestStatus, string> = {
  pending: "Pending",
  provisioning: "Provisioning",
  active: "Active",
  rejected: "Rejected",
  disabled: "Disabled",
};

const PROJECTED_WORLD_STATUS_LABELS: Record<CloudWorldLifecycleStatus, string> = {
  queued: "Queued",
  creating: "Creating",
  bootstrapping: "Bootstrapping",
  starting: "Starting",
  ready: "Ready",
  sleeping: "Sleeping",
  stopping: "Stopping",
  failed: "Failed",
  disabled: "Disabled",
  deleting: "Deleting",
};

const PROJECTED_DESIRED_STATE_LABELS: Record<ProjectedDesiredState, string> = {
  running: "Running",
  sleeping: "Sleeping",
};

export const REQUEST_STATUSES = [
  "pending",
  "provisioning",
  "active",
  "rejected",
  "disabled",
] as const satisfies readonly CloudWorldRequestStatus[];

export const REQUEST_WORKFLOW_CARD_STATUSES = [
  "pending",
  "provisioning",
  "rejected",
  "disabled",
] as const satisfies readonly CloudWorldRequestStatus[];

type RequestStatusMeta = {
  guidance: string;
  projectedWorldStatus: CloudWorldLifecycleStatus;
  projectedDesiredState: ProjectedDesiredState;
  terminal: boolean;
  requiresOpsNote: boolean;
  requiresApiBaseUrl: boolean;
};

const REQUEST_STATUS_META: Record<CloudWorldRequestStatus, RequestStatusMeta> = {
  pending: {
    guidance: "means the request is still awaiting staff action.",
    projectedWorldStatus: "queued",
    projectedDesiredState: "running",
    terminal: false,
    requiresOpsNote: false,
    requiresApiBaseUrl: false,
  },
  provisioning: {
    guidance:
      "means staff accepted it and the world is being prepared outside of the old orchestration path.",
    projectedWorldStatus: "creating",
    projectedDesiredState: "running",
    terminal: false,
    requiresOpsNote: false,
    requiresApiBaseUrl: false,
  },
  active: {
    guidance:
      "should only be used when the world already has a reachable `apiBaseUrl`.",
    projectedWorldStatus: "ready",
    projectedDesiredState: "running",
    terminal: false,
    requiresOpsNote: false,
    requiresApiBaseUrl: true,
  },
  rejected: {
    guidance: "should always be paired with a clear ops note.",
    projectedWorldStatus: "failed",
    projectedDesiredState: "running",
    terminal: true,
    requiresOpsNote: true,
    requiresApiBaseUrl: false,
  },
  disabled: {
    guidance: "should always be paired with a clear ops note.",
    projectedWorldStatus: "disabled",
    projectedDesiredState: "sleeping",
    terminal: true,
    requiresOpsNote: true,
    requiresApiBaseUrl: false,
  },
};

export function isTerminalRequestStatus(status: CloudWorldRequestStatus) {
  return REQUEST_STATUS_META[status].terminal;
}

export function requiresRequestOpsNote(status: CloudWorldRequestStatus) {
  return REQUEST_STATUS_META[status].requiresOpsNote;
}

export function requiresRequestApiBaseUrl(status: CloudWorldRequestStatus) {
  return REQUEST_STATUS_META[status].requiresApiBaseUrl;
}

export function getRequestEndpointLockMessage(
  status: CloudWorldRequestStatus,
) {
  if (!isTerminalRequestStatus(status)) {
    return null;
  }

  return "Endpoint edits are locked while this request is rejected or disabled.";
}

export function isRequestWorkflowCardStatus(
  status: CloudWorldRequestStatus,
): status is (typeof REQUEST_WORKFLOW_CARD_STATUSES)[number] {
  return REQUEST_WORKFLOW_CARD_STATUSES.includes(
    status as (typeof REQUEST_WORKFLOW_CARD_STATUSES)[number],
  );
}

export function formatRequestStatusLabel(
  status?: CloudWorldRequestStatus | "all" | null,
) {
  if (!status) {
    return "Unknown";
  }

  if (status === "all") {
    return "All";
  }

  return REQUEST_STATUS_LABELS[status];
}

export function formatProjectedWorldStatus(
  status?: CloudWorldLifecycleStatus | "all" | null,
) {
  if (!status) {
    return "Unknown";
  }

  if (status === "all") {
    return "All";
  }

  return PROJECTED_WORLD_STATUS_LABELS[status];
}

export function formatProjectedDesiredState(
  desiredState?: ProjectedDesiredState | "all" | null,
) {
  if (!desiredState) {
    return "Unknown";
  }

  if (desiredState === "all") {
    return "All";
  }

  return PROJECTED_DESIRED_STATE_LABELS[desiredState];
}

export function getRequestWorkflowProjection(status: CloudWorldRequestStatus) {
  const requestStatus = REQUEST_STATUS_META[status];

  return {
    projectedWorldStatus: requestStatus.projectedWorldStatus,
    projectedDesiredState: requestStatus.projectedDesiredState,
  };
}

export function getRequestWorkflowDescription(status: CloudWorldRequestStatus) {
  const requestStatus = getRequestWorkflowProjection(status);

  return `Projected ${formatProjectedWorldStatus(
    requestStatus.projectedWorldStatus,
  ).toLowerCase()} · desired ${formatProjectedDesiredState(
    requestStatus.projectedDesiredState,
  ).toLowerCase()}`;
}

function formatGuidanceStatuses(statuses: readonly CloudWorldRequestStatus[]) {
  if (statuses.length === 1) {
    return `\`${statuses[0]}\``;
  }

  return `${statuses
    .slice(0, -1)
    .map((status) => `\`${status}\``)
    .join(", ")} and \`${statuses.at(-1)}\``;
}

export function getRequestGuidanceParagraphs() {
  const groupedParagraphs: Array<{
    guidance: string;
    statuses: CloudWorldRequestStatus[];
  }> = [];

  for (const status of REQUEST_STATUSES) {
    const guidance = REQUEST_STATUS_META[status].guidance;
    const previousParagraph = groupedParagraphs.at(-1);

    if (previousParagraph?.guidance === guidance) {
      previousParagraph.statuses.push(status);
      continue;
    }

    groupedParagraphs.push({
      guidance,
      statuses: [status],
    });
  }

  return groupedParagraphs.map(
    ({ guidance, statuses }) => `${formatGuidanceStatuses(statuses)} ${guidance}`,
  );
}
