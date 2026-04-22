import { In, QueryFailedError, Repository } from "typeorm";
import { WorldLifecycleJobEntity } from "../entities/world-lifecycle-job.entity";

export const ACTIVE_WORLD_LIFECYCLE_JOB_STATUSES = [
  "pending",
  "running",
] as const;
export const SERIALIZED_WORLD_LIFECYCLE_JOB_TYPES = [
  "provision",
  "resume",
  "suspend",
] as const;
export const ACTIVE_WORLD_LIFECYCLE_JOB_UNIQUE_INDEX =
  "IDX_world_lifecycle_jobs_active_world";
export const SUPERSEDED_LIFECYCLE_JOB_FAILURE_CODE =
  "superseded_by_new_job";

function isSerializedLifecycleJobType(
  value: unknown,
): value is (typeof SERIALIZED_WORLD_LIFECYCLE_JOB_TYPES)[number] {
  return (
    typeof value === "string" &&
    SERIALIZED_WORLD_LIFECYCLE_JOB_TYPES.includes(
      value as (typeof SERIALIZED_WORLD_LIFECYCLE_JOB_TYPES)[number],
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getSupersededLifecycleJobMetadata(
  job: Pick<WorldLifecycleJobEntity, "failureCode" | "resultPayload">,
) {
  if (job.failureCode !== SUPERSEDED_LIFECYCLE_JOB_FAILURE_CODE) {
    return null;
  }

  const resultPayload = isRecord(job.resultPayload) ? job.resultPayload : null;
  if (!resultPayload) {
    return {
      supersededByJobType: null,
      supersededByPayload: null,
    };
  }

  return {
    supersededByJobType: isSerializedLifecycleJobType(
      resultPayload.supersededByJobType,
    )
      ? resultPayload.supersededByJobType
      : null,
    supersededByPayload: isRecord(resultPayload.supersededByPayload)
      ? resultPayload.supersededByPayload
      : null,
  };
}

export async function findActiveLifecycleJob(
  jobRepo: Repository<WorldLifecycleJobEntity>,
  worldId: string,
  jobType: string,
) {
  return jobRepo.findOne({
    where: {
      worldId,
      jobType,
      status: In([...ACTIVE_WORLD_LIFECYCLE_JOB_STATUSES]),
    },
    order: {
      createdAt: "DESC",
    },
  });
}

export async function findActiveSerializedLifecycleJobs(
  jobRepo: Repository<WorldLifecycleJobEntity>,
  worldId: string,
) {
  return jobRepo.find({
    where: {
      worldId,
      jobType: In([...SERIALIZED_WORLD_LIFECYCLE_JOB_TYPES]),
      status: In([...ACTIVE_WORLD_LIFECYCLE_JOB_STATUSES]),
    },
    order: {
      createdAt: "DESC",
    },
  });
}

export function isActiveLifecycleJobUniqueConstraintError(error: unknown) {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as
    | { code?: string; message?: string }
    | undefined;
  const code = driverError?.code ?? "";
  const message = `${error.message} ${driverError?.message ?? ""}`.toLowerCase();

  if (
    code !== "SQLITE_CONSTRAINT" &&
    code !== "SQLITE_CONSTRAINT_UNIQUE"
  ) {
    return false;
  }

  return (
    message.includes(ACTIVE_WORLD_LIFECYCLE_JOB_UNIQUE_INDEX.toLowerCase()) ||
    message.includes("world_lifecycle_jobs.worldid")
  );
}

export async function ensureUniqueActiveLifecycleJob(
  jobRepo: Repository<WorldLifecycleJobEntity>,
  params: {
    worldId: string;
    jobType: string;
    create: () => WorldLifecycleJobEntity;
  },
) {
  const nextJob = params.create();
  const activeJobs = await findActiveSerializedLifecycleJobs(
    jobRepo,
    params.worldId,
  );
  const sameTypeJob =
    activeJobs.find((job) => job.jobType === nextJob.jobType) ?? null;
  if (sameTypeJob) {
    return sameTypeJob;
  }

  const pendingConflictingJobs = activeJobs.filter(
    (job) => job.jobType !== nextJob.jobType && job.status === "pending",
  );
  if (pendingConflictingJobs.length > 0) {
    const cancelledAt = new Date();
    await jobRepo.save(
      pendingConflictingJobs.map((job) =>
        jobRepo.create({
          ...job,
          status: "cancelled",
          availableAt: null,
          startedAt: null,
          finishedAt: cancelledAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          failureCode: SUPERSEDED_LIFECYCLE_JOB_FAILURE_CODE,
          failureMessage: `Pending ${job.jobType} job was superseded by a newer ${nextJob.jobType} request.`,
          resultPayload: {
            action: "superseded_by_new_job",
            supersededByJobType: nextJob.jobType,
            supersededByPayload:
              (nextJob.payload as Record<string, unknown> | null) ?? null,
            previousJobType: job.jobType,
          },
        }),
      ),
    );
  }

  const runningConflictingJob = activeJobs.find(
    (job) => job.jobType !== nextJob.jobType && job.status === "running",
  );
  if (runningConflictingJob) {
    return runningConflictingJob;
  }

  try {
    return await jobRepo.save(nextJob);
  } catch (error) {
    if (!isActiveLifecycleJobUniqueConstraintError(error)) {
      throw error;
    }

    const concurrentJob = (
      await findActiveSerializedLifecycleJobs(jobRepo, params.worldId)
    ).find(
      (job) =>
        job.jobType === nextJob.jobType ||
        job.status === "running",
    );
    if (concurrentJob) {
      return concurrentJob;
    }

    throw error;
  }
}
