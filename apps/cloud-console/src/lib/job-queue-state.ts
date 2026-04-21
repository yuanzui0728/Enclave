import type { WorldLifecycleJobSummary } from "@yinjie/contracts";

export type QueueStateFilter =
  | "all"
  | "running_now"
  | "lease_expired"
  | "delayed";

type JobQueueStateKey = "running_now" | "lease_expired" | "delayed" | "other";

export type JobQueueState = {
  key: JobQueueStateKey;
  label: string;
  tone: string;
  sortOrder: number;
};

export const QUEUE_STATE_FILTERS: Array<{
  value: QueueStateFilter;
  label: string;
}> = [
  { value: "all", label: "queue: all" },
  { value: "running_now", label: "queue: running" },
  { value: "lease_expired", label: "queue: lease expired" },
  { value: "delayed", label: "queue: delayed" },
];

export function resolveQueueState(
  job: WorldLifecycleJobSummary,
  now = Date.now(),
): JobQueueState {
  const availableAtMs = job.availableAt
    ? new Date(job.availableAt).getTime()
    : Number.NaN;

  if (job.status === "running") {
    return {
      key: "running_now",
      label: "Running",
      tone: "border-sky-300/50 bg-sky-500/10 text-sky-100",
      sortOrder: 0,
    };
  }

  if (job.failureCode === "lease_expired") {
    return {
      key: "lease_expired",
      label: "Lease expired",
      tone: "border-rose-300/60 bg-rose-500/10 text-rose-200",
      sortOrder: 1,
    };
  }

  if (
    job.status === "pending" &&
    Number.isFinite(availableAtMs) &&
    availableAtMs > now
  ) {
    return {
      key: "delayed",
      label: "Delayed",
      tone: "border-amber-300/50 bg-amber-500/10 text-amber-100",
      sortOrder: 2,
    };
  }

  return {
    key: "other",
    label: "Other",
    tone: "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]",
    sortOrder: 3,
  };
}

export function matchesQueueStateFilter(
  job: WorldLifecycleJobSummary,
  filter: QueueStateFilter,
  now = Date.now(),
) {
  if (filter === "all") {
    return true;
  }

  return resolveQueueState(job, now).key === filter;
}

export function groupJobsByQueueState(
  jobs: WorldLifecycleJobSummary[],
  now = Date.now(),
) {
  const groups = new Map<
    string,
    { state: JobQueueState; jobs: WorldLifecycleJobSummary[] }
  >();

  for (const job of jobs) {
    const state = resolveQueueState(job, now);
    const existing = groups.get(state.key);
    if (existing) {
      existing.jobs.push(job);
      continue;
    }

    groups.set(state.key, {
      state,
      jobs: [job],
    });
  }

  return [...groups.values()].sort(
    (left, right) => left.state.sortOrder - right.state.sortOrder,
  );
}
