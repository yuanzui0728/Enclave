import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  SCHEDULER_JOB_DEFINITIONS,
  type SchedulerCharacterEventKindValue,
  type SchedulerCharacterEventValue,
  type SchedulerJobId,
  type SchedulerJobStatusValue,
  type SchedulerRunRecordValue,
  type SchedulerRunResultValue,
} from './scheduler-telemetry.types';

type SchedulerJobRunHandle = {
  jobId: SchedulerJobId;
  startedAt: Date;
};

const MAX_RECENT_RUNS = 60;
const MAX_CHARACTER_EVENTS = 24;

@Injectable()
export class SchedulerTelemetryService {
  private readonly startedAt = new Date();
  private readonly jobs = new Map<SchedulerJobId, SchedulerJobStatusValue>();
  private readonly recentRuns: SchedulerRunRecordValue[] = [];
  private readonly characterEvents = new Map<string, SchedulerCharacterEventValue[]>();

  constructor() {
    for (const definition of SCHEDULER_JOB_DEFINITIONS) {
      this.jobs.set(definition.id, {
        ...definition,
        runCount: 0,
        running: false,
      });
    }
  }

  getStartedAt() {
    return this.startedAt.toISOString();
  }

  getWorldSnapshotCount() {
    return this.jobs.get('world_context_snapshot')?.runCount ?? 0;
  }

  getLastWorldSnapshotAt() {
    return this.jobs.get('world_context_snapshot')?.lastRunAt;
  }

  listJobs() {
    return SCHEDULER_JOB_DEFINITIONS.map((definition) => {
      const job = this.jobs.get(definition.id);
      return {
        ...definition,
        runCount: job?.runCount ?? 0,
        running: job?.running ?? false,
        lastRunAt: job?.lastRunAt,
        lastDurationMs: job?.lastDurationMs,
        lastResult: job?.lastResult,
      };
    });
  }

  listRecentRuns(options?: { limit?: number; jobIds?: SchedulerJobId[] }) {
    const jobIdSet = options?.jobIds?.length ? new Set(options.jobIds) : null;
    const filtered = jobIdSet
      ? this.recentRuns.filter((item) => jobIdSet.has(item.jobId))
      : this.recentRuns;
    return filtered.slice(0, options?.limit ?? 10);
  }

  listCharacterEvents(characterId: string, limit = 10) {
    return [...(this.characterEvents.get(characterId) ?? [])].slice(0, limit);
  }

  startJob(jobId: SchedulerJobId): SchedulerJobRunHandle {
    const job = this.jobs.get(jobId);
    if (job) {
      job.running = true;
    }

    return {
      jobId,
      startedAt: new Date(),
    };
  }

  finishJob(handle: SchedulerJobRunHandle, summary: string) {
    this.completeJob(handle, 'success', summary);
  }

  failJob(handle: SchedulerJobRunHandle, error: unknown) {
    const summary =
      error instanceof Error
        ? error.message || 'Unknown scheduler error'
        : String(error || 'Unknown scheduler error');
    this.completeJob(handle, 'error', summary);
  }

  recordCharacterEvent(input: {
    characterId: string;
    characterName: string;
    kind: SchedulerCharacterEventKindValue;
    title: string;
    summary: string;
    jobId: SchedulerJobId;
  }) {
    const definition = this.jobs.get(input.jobId);
    const record: SchedulerCharacterEventValue = {
      id: `scheduler_event_${randomUUID()}`,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      createdAt: new Date().toISOString(),
      jobId: input.jobId,
      jobName: definition?.name ?? input.jobId,
      characterId: input.characterId,
      characterName: input.characterName,
    };
    const current = this.characterEvents.get(input.characterId) ?? [];
    current.unshift(record);
    this.characterEvents.set(
      input.characterId,
      current.slice(0, MAX_CHARACTER_EVENTS),
    );
  }

  private completeJob(
    handle: SchedulerJobRunHandle,
    status: SchedulerRunResultValue,
    summary: string,
  ) {
    const finishedAt = new Date();
    const durationMs = Math.max(finishedAt.getTime() - handle.startedAt.getTime(), 0);
    const job = this.jobs.get(handle.jobId);
    if (job) {
      job.running = false;
      job.runCount += 1;
      job.lastRunAt = finishedAt.toISOString();
      job.lastDurationMs = durationMs;
      job.lastResult = summary;
    }

    const run: SchedulerRunRecordValue = {
      id: `scheduler_run_${randomUUID()}`,
      jobId: handle.jobId,
      jobName: job?.name ?? handle.jobId,
      status,
      startedAt: handle.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs,
      summary,
    };
    this.recentRuns.unshift(run);
    if (this.recentRuns.length > MAX_RECENT_RUNS) {
      this.recentRuns.length = MAX_RECENT_RUNS;
    }
  }
}
