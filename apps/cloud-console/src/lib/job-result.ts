import type { WorldLifecycleJobSummary, WorldLifecycleJobType } from "@yinjie/contracts";

const WORLD_LIFECYCLE_JOB_TYPES = [
  "provision",
  "resume",
  "suspend",
  "reconcile",
] as const satisfies WorldLifecycleJobType[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWorldLifecycleJobType(value: unknown): value is WorldLifecycleJobType {
  return (
    typeof value === "string" &&
    WORLD_LIFECYCLE_JOB_TYPES.includes(value as WorldLifecycleJobType)
  );
}

export function getJobSupersededByJobType(job: WorldLifecycleJobSummary) {
  if (isWorldLifecycleJobType(job.supersededByJobType)) {
    return job.supersededByJobType;
  }

  const resultPayload = isRecord(job.resultPayload) ? job.resultPayload : null;
  if (isWorldLifecycleJobType(resultPayload?.supersededByJobType)) {
    return resultPayload.supersededByJobType;
  }

  return null;
}

export function getJobAuditBadgeLabel(job: WorldLifecycleJobSummary) {
  const supersededByJobType = getJobSupersededByJobType(job);
  if (
    job.failureCode === "superseded_by_new_job" ||
    job.resultPayload?.action === "superseded_by_new_job"
  ) {
    if (supersededByJobType) {
      return `Superseded by ${supersededByJobType}`;
    }

    return "Superseded";
  }

  return null;
}

export function describeJobResult(job: WorldLifecycleJobSummary) {
  const auditBadgeLabel = getJobAuditBadgeLabel(job);
  if (auditBadgeLabel) {
    const supersededByJobType = getJobSupersededByJobType(job);
    if (supersededByJobType) {
      return `Superseded by newer ${supersededByJobType} request.`;
    }

    return "Superseded by newer lifecycle request.";
  }

  if (typeof job.resultPayload?.action === "string") {
    return job.resultPayload.action;
  }

  return job.failureMessage ?? "None";
}
