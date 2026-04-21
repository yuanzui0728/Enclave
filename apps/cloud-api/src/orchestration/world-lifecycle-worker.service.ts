import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { In, Repository } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import type { CloudInstancePowerState, WorldLifecycleJobType } from "@yinjie/contracts";
import { CloudAlertNotifierService } from "../alerts/cloud-alert-notifier.service";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { WorldAccessSessionEntity } from "../entities/world-access-session.entity";
import { WorldLifecycleJobEntity } from "../entities/world-lifecycle-job.entity";
import { ComputeProviderRegistryService } from "../providers/compute-provider-registry.service";
import type { InspectWorldInstanceResult } from "../providers/compute-provider.types";
import { WaitingSessionSyncService } from "../world-access/waiting-session-sync.service";
import { resolveSuggestedWorldAdminUrl, resolveSuggestedWorldApiBaseUrl } from "./world-bootstrap-config";

@Injectable()
export class WorldLifecycleWorkerService implements OnModuleInit, OnModuleDestroy {
  private static readonly DEFAULT_JOB_LEASE_SECONDS = 10 * 60;
  private static readonly MAX_JOB_CLAIM_ATTEMPTS = 5;
  private readonly logger = new Logger(WorldLifecycleWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private lastMaintenanceAt = 0;
  private readonly idleSuspendSeconds: number;
  private readonly staleHeartbeatSeconds: number;
  private readonly jobLeaseSeconds: number;
  private readonly workerId = randomUUID();

  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(CloudInstanceEntity)
    private readonly instanceRepo: Repository<CloudInstanceEntity>,
    @InjectRepository(WorldLifecycleJobEntity)
    private readonly jobRepo: Repository<WorldLifecycleJobEntity>,
    @InjectRepository(WorldAccessSessionEntity)
    private readonly accessSessionRepo: Repository<WorldAccessSessionEntity>,
    private readonly configService: ConfigService,
    private readonly cloudAlertNotifier: CloudAlertNotifierService,
    private readonly computeProviderRegistry: ComputeProviderRegistryService,
    private readonly waitingSessionSyncService: WaitingSessionSyncService,
  ) {
    this.idleSuspendSeconds = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_WORLD_IDLE_SUSPEND_SECONDS"),
    );
    this.staleHeartbeatSeconds = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_WORLD_RECONCILE_STALE_HEARTBEAT_SECONDS"),
    );
    this.jobLeaseSeconds = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_WORLD_JOB_LEASE_SECONDS"),
      WorldLifecycleWorkerService.DEFAULT_JOB_LEASE_SECONDS,
    );
  }

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 1500);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.ticking) {
      return;
    }

    this.ticking = true;
    try {
      await this.recoverExpiredRunningJobs();
      const job = await this.claimNextPendingJob();

      if (job) {
        await this.runJob(job);
      }

      if (Date.now() - this.lastMaintenanceAt >= 5_000) {
        this.lastMaintenanceAt = Date.now();
        await this.reconcileObservedWorlds();
        await this.autoSuspendIdleWorlds();
      }
    } finally {
      this.ticking = false;
    }
  }

  async reconcileWorldNow(worldId: string, source = "admin-reconcile") {
    const world = await this.worldRepo.findOne({
      where: { id: worldId },
    });
    if (!world) {
      return null;
    }

    await this.reconcileObservedWorld(world, source);
    return this.worldRepo.findOne({
      where: { id: worldId },
    });
  }

  private async runJob(job: WorldLifecycleJobEntity) {
    const world = await this.worldRepo.findOne({
      where: { id: job.worldId },
    });
    if (!world) {
      const persisted = await this.persistClaimedJob(job, {
        status: "cancelled",
        failureCode: "world_missing",
        failureMessage: "Target world no longer exists, so the job was cancelled.",
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      if (!persisted) {
        return;
      }
      return;
    }

    try {
      switch (job.jobType) {
        case "resume":
          await this.handleResume(world);
          break;
        case "suspend":
          await this.handleSuspend(world);
          break;
        case "provision":
        default:
          await this.handleProvision(world);
          break;
      }

      const persisted = await this.persistClaimedJob(job, {
        status: "succeeded",
        finishedAt: new Date(),
        resultPayload: {
          worldStatus: world.status,
          apiBaseUrl: world.apiBaseUrl ?? undefined,
        },
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      if (!persisted) {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown orchestration error.";
      this.logger.error(`World lifecycle job failed: ${job.id} ${message}`);

      const canRetry = job.attempt < job.maxAttempts;

      if (canRetry) {
        const persisted = await this.persistClaimedJob(job, {
          status: "pending",
          startedAt: null,
          finishedAt: null,
          availableAt: new Date(Date.now() + job.attempt * 10_000),
          failureCode: "job_failed",
          failureMessage: message,
          resultPayload: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        });
        if (!persisted) {
          return;
        }
      } else {
        const persisted = await this.persistClaimedJob(job, {
          status: "failed",
          finishedAt: new Date(),
          failureCode: "job_failed",
          failureMessage: message,
          leaseOwner: null,
          leaseExpiresAt: null,
        });
        if (!persisted) {
          return;
        }

        world.status = "failed";
        world.healthStatus = "failed";
        world.healthMessage = message;
        world.failureCode = "job_failed";
        world.failureMessage = message;
        world.retryCount += 1;
        await this.worldRepo.save(world);
        await this.cloudAlertNotifier.notifyJobFailed(world, {
          jobId: job.id,
          jobType: job.jobType,
          failureCode: job.failureCode,
          failureMessage: message,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
        });

        const instance = await this.instanceRepo.findOne({
          where: { worldId: world.id },
        });
        if (instance) {
          instance.powerState = "error";
          await this.instanceRepo.save(instance);
        }

        await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
          world.id,
          "world-lifecycle.final-failure",
        );
      }
    }
  }

  private async claimNextPendingJob() {
    for (let attempt = 0; attempt < WorldLifecycleWorkerService.MAX_JOB_CLAIM_ATTEMPTS; attempt += 1) {
      const now = new Date();
      const candidate = await this.jobRepo
        .createQueryBuilder("job")
        .where("job.status = :status", { status: "pending" })
        .andWhere("job.attempt < job.maxAttempts")
        .andWhere("(job.availableAt IS NULL OR job.availableAt <= :now)", { now })
        .andWhere("(job.leaseExpiresAt IS NULL OR job.leaseExpiresAt <= :now)", { now })
        .orderBy("job.priority", "ASC")
        .addOrderBy("job.createdAt", "ASC")
        .getOne();

      if (!candidate) {
        return null;
      }

      const leaseExpiresAt = this.createJobLeaseExpiry(now);
      const result = await this.jobRepo
        .createQueryBuilder()
        .update(WorldLifecycleJobEntity)
        .set({
          status: "running",
          attempt: () => "attempt + 1",
          startedAt: now,
          finishedAt: null,
          availableAt: null,
          failureCode: null,
          failureMessage: null,
          resultPayload: null,
          leaseOwner: this.workerId,
          leaseExpiresAt,
        })
        .where("id = :id", { id: candidate.id })
        .andWhere("status = :status", { status: "pending" })
        .andWhere("attempt < maxAttempts")
        .andWhere("(availableAt IS NULL OR availableAt <= :now)", { now })
        .andWhere("(leaseExpiresAt IS NULL OR leaseExpiresAt <= :now)", { now })
        .execute();

      if ((result.affected ?? 0) !== 1) {
        continue;
      }

      candidate.status = "running";
      candidate.attempt += 1;
      candidate.startedAt = now;
      candidate.finishedAt = null;
      candidate.availableAt = null;
      candidate.failureCode = null;
      candidate.failureMessage = null;
      candidate.resultPayload = null;
      candidate.leaseOwner = this.workerId;
      candidate.leaseExpiresAt = leaseExpiresAt;
      return candidate;
    }

    return null;
  }

  private async recoverExpiredRunningJobs() {
    const now = new Date();
    const expiredJobs = await this.jobRepo
      .createQueryBuilder("job")
      .where("job.status = :status", { status: "running" })
      .andWhere("job.leaseExpiresAt IS NOT NULL")
      .andWhere("job.leaseExpiresAt <= :now", { now })
      .getMany();

    let recoveredCount = 0;
    let failedCount = 0;

    for (const job of expiredJobs) {
      const reachedRetryLimit = job.attempt >= job.maxAttempts;
      const failureMessage = reachedRetryLimit
        ? "Worker lease expired during the final lifecycle attempt. The job reached its retry limit and was marked failed."
        : "Worker lease expired while the lifecycle job was running. The job was re-queued.";
      const patch: QueryDeepPartialEntity<WorldLifecycleJobEntity> = reachedRetryLimit
        ? {
            status: "failed",
            finishedAt: now,
            availableAt: null,
            failureCode: "lease_expired",
            failureMessage,
            leaseOwner: null,
            leaseExpiresAt: null,
          }
        : {
            status: "pending",
            startedAt: null,
            finishedAt: null,
            availableAt: now,
            failureCode: "lease_expired",
            failureMessage,
            leaseOwner: null,
            leaseExpiresAt: null,
          };
      const result = await this.jobRepo
        .createQueryBuilder()
        .update(WorldLifecycleJobEntity)
        .set(patch)
        .where("id = :id", { id: job.id })
        .andWhere("status = :status", { status: "running" })
        .andWhere("leaseExpiresAt IS NOT NULL")
        .andWhere("leaseExpiresAt <= :now", { now })
        .execute();

      if ((result.affected ?? 0) !== 1) {
        continue;
      }

      if (reachedRetryLimit) {
        failedCount += 1;
        await this.markLeaseExpiredJobFailed(job, failureMessage);
      } else {
        recoveredCount += 1;
      }
    }

    if (recoveredCount > 0) {
      this.logger.warn(`Recovered ${recoveredCount} expired world lifecycle job lease(s).`);
    }
    if (failedCount > 0) {
      this.logger.error(
        `Marked ${failedCount} expired world lifecycle job lease(s) failed after reaching the retry limit.`,
      );
    }
  }

  private async markLeaseExpiredJobFailed(
    job: Pick<
      WorldLifecycleJobEntity,
      "id" | "worldId" | "jobType" | "attempt" | "maxAttempts"
    >,
    failureMessage: string,
  ) {
    const world = await this.worldRepo.findOne({
      where: { id: job.worldId },
    });
    if (!world) {
      return;
    }

    world.status = "failed";
    world.healthStatus = "failed";
    world.healthMessage = failureMessage;
    world.failureCode = "lease_expired";
    world.failureMessage = failureMessage;
    world.retryCount += 1;
    await this.worldRepo.save(world);
    await this.cloudAlertNotifier.notifyJobFailed(world, {
      jobId: job.id,
      jobType: job.jobType,
      failureCode: "lease_expired",
      failureMessage,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
    });

    const instance = await this.instanceRepo.findOne({
      where: { worldId: world.id },
    });
    if (instance) {
      instance.powerState = "error";
      await this.instanceRepo.save(instance);
    }

    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "world-lifecycle.lease-expired-failure",
    );
  }

  private async persistClaimedJob(
    job: WorldLifecycleJobEntity,
    patch: QueryDeepPartialEntity<WorldLifecycleJobEntity>,
  ) {
    const result = await this.jobRepo
      .createQueryBuilder()
      .update(WorldLifecycleJobEntity)
      .set(patch)
      .where("id = :id", { id: job.id })
      .andWhere("leaseOwner = :leaseOwner", { leaseOwner: this.workerId })
      .execute();

    if ((result.affected ?? 0) !== 1) {
      this.logger.warn(`Skipped lifecycle job update after losing lease ownership for job ${job.id}.`);
      return false;
    }

    Object.assign(job, patch as Partial<WorldLifecycleJobEntity>);
    return true;
  }

  private async handleProvision(world: CloudWorldEntity) {
    const provider = this.computeProviderRegistry.getProvider(world.providerKey);
    world.status = "creating";
    world.desiredState = "running";
    world.healthStatus = "creating";
    world.healthMessage = "Provisioning a new world instance.";
    world.failureCode = null;
    world.failureMessage = null;
    world.providerKey = provider.key;
    await this.worldRepo.save(world);
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "world-lifecycle.provision.creating",
    );

    await this.sleep(600);

    const provisioned = await provider.createInstance(world);
    let instance = await this.instanceRepo.findOne({
      where: { worldId: world.id },
    });

    if (!instance) {
      instance = this.instanceRepo.create({
        worldId: world.id,
        providerKey: provisioned.providerKey,
        providerInstanceId: provisioned.providerInstanceId,
        providerVolumeId: provisioned.providerVolumeId ?? null,
        providerSnapshotId: provisioned.providerSnapshotId ?? null,
        name: `${world.slug ?? world.id}-vm`,
        region: provisioned.region,
        zone: provisioned.zone,
        privateIp: provisioned.privateIp,
        publicIp: provisioned.publicIp,
        powerState: "provisioning",
        imageId: provisioned.imageId ?? null,
        flavor: provisioned.flavor ?? null,
        diskSizeGb: provisioned.diskSizeGb ?? 20,
        launchConfig: provisioned.launchConfig ?? null,
        bootstrappedAt: null,
        lastHeartbeatAt: null,
        lastOperationAt: new Date(),
      });
    } else {
      instance.providerKey = provisioned.providerKey;
      instance.providerInstanceId = provisioned.providerInstanceId;
      instance.providerVolumeId = provisioned.providerVolumeId ?? instance.providerVolumeId;
      instance.providerSnapshotId = provisioned.providerSnapshotId ?? instance.providerSnapshotId;
      instance.region = provisioned.region;
      instance.zone = provisioned.zone;
      instance.privateIp = provisioned.privateIp;
      instance.publicIp = provisioned.publicIp;
      instance.powerState = "provisioning";
      instance.imageId = provisioned.imageId ?? instance.imageId;
      instance.flavor = provisioned.flavor ?? instance.flavor;
      instance.diskSizeGb = provisioned.diskSizeGb ?? instance.diskSizeGb;
      instance.launchConfig = provisioned.launchConfig ?? instance.launchConfig;
      instance.lastOperationAt = new Date();
    }

    world.providerKey = provisioned.providerKey;
    world.providerRegion = provisioned.region;
    world.providerZone = provisioned.zone;
    world.apiBaseUrl = provisioned.apiBaseUrl;
    world.adminUrl = provisioned.adminUrl;
    await this.instanceRepo.save(instance);
    await this.worldRepo.save(world);

    world.status = "bootstrapping";
    world.healthStatus = "bootstrapping";
    world.healthMessage = provider.summary.capabilities.managedProvisioning
      ? "Instance is online and bootstrap is running."
      : provider.summary.deploymentMode === "manual-docker-ssh"
        ? "Compose stack was pushed to the Docker host. Waiting for the world runtime to report bootstrap."
        : "Bootstrap package is ready. Waiting for the world runtime to report bootstrap.";
    await this.worldRepo.save(world);
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "world-lifecycle.provision.bootstrapping",
    );

    if (!provider.summary.capabilities.managedProvisioning) {
      instance.powerState = "starting";
      instance.lastOperationAt = new Date();
      await this.instanceRepo.save(instance);
      return;
    }

    await this.sleep(700);

    const now = new Date();
    instance.powerState = "running";
    instance.bootstrappedAt = now;
    instance.lastHeartbeatAt = now;
    instance.lastOperationAt = now;
    await this.instanceRepo.save(instance);

    world.status = "ready";
    world.apiBaseUrl = provisioned.apiBaseUrl;
    world.adminUrl = provisioned.adminUrl;
    world.healthStatus = "healthy";
    world.healthMessage = "World is ready.";
    world.lastBootedAt = now;
    world.lastHeartbeatAt = now;
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "world-lifecycle.provision.ready",
    );
  }

  private async handleResume(world: CloudWorldEntity) {
    const provider = this.computeProviderRegistry.getProvider(world.providerKey);
    let instance = await this.instanceRepo.findOne({
      where: { worldId: world.id },
    });
    if (!instance) {
      await this.handleProvision(world);
      return;
    }

    world.status = "starting";
    world.desiredState = "running";
    world.healthStatus = "starting";
    world.healthMessage = "Waking the existing world.";
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "world-lifecycle.resume.starting",
    );

    instance.powerState = "starting";
    instance.lastOperationAt = new Date();
    await this.instanceRepo.save(instance);

    await this.sleep(600);

    const resumeResult = await provider.startInstance(instance, world);
    instance.powerState = resumeResult.powerState;
    instance.providerSnapshotId = resumeResult.providerSnapshotId ?? instance.providerSnapshotId;
    instance.lastOperationAt = new Date();
    await this.instanceRepo.save(instance);

    if (!provider.summary.capabilities.managedLifecycle) {
      world.apiBaseUrl = world.apiBaseUrl ?? resolveSuggestedWorldApiBaseUrl(world, this.configService);
      world.adminUrl = world.adminUrl ?? resolveSuggestedWorldAdminUrl(world, this.configService);
      world.healthStatus = "starting";
      world.healthMessage =
        provider.summary.deploymentMode === "manual-docker-ssh"
          ? "Resume command sent to the Docker host. Waiting for the world runtime heartbeat."
          : "Resume requested. Waiting for the world runtime heartbeat.";
      await this.worldRepo.save(world);
      await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
        world.id,
        "world-lifecycle.resume.waiting-heartbeat",
      );
      return;
    }

    const now = new Date();
    instance.lastHeartbeatAt = now;
    instance.lastOperationAt = now;
    await this.instanceRepo.save(instance);

    world.status = "ready";
    world.apiBaseUrl = world.apiBaseUrl ?? resolveSuggestedWorldApiBaseUrl(world, this.configService);
    world.adminUrl = world.adminUrl ?? resolveSuggestedWorldAdminUrl(world, this.configService);
    world.healthStatus = "healthy";
    world.healthMessage = "World has resumed.";
    world.lastBootedAt = now;
    world.lastHeartbeatAt = now;
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "world-lifecycle.resume.ready",
    );
  }

  private async handleSuspend(world: CloudWorldEntity) {
    const provider = this.computeProviderRegistry.getProvider(world.providerKey);
    world.status = "stopping";
    world.desiredState = "sleeping";
    world.healthStatus = "stopping";
    world.healthMessage = "Suspending the world.";
    await this.worldRepo.save(world);

    const instance = await this.instanceRepo.findOne({
      where: { worldId: world.id },
    });
    if (instance) {
      const suspendResult = await provider.stopInstance(instance, world);
      instance.powerState = suspendResult.powerState;
      instance.providerSnapshotId = suspendResult.providerSnapshotId ?? instance.providerSnapshotId;
      instance.lastOperationAt = new Date();
      await this.instanceRepo.save(instance);
    }

    await this.sleep(500);

    world.status = "sleeping";
    world.healthStatus = "sleeping";
    world.healthMessage = "World is sleeping.";
    world.lastSuspendedAt = new Date();
    await this.worldRepo.save(world);
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "world-lifecycle.suspend.sleeping",
    );
  }

  private async autoSuspendIdleWorlds() {
    if (this.idleSuspendSeconds <= 0) {
      return;
    }

    const cutoff = Date.now() - this.idleSuspendSeconds * 1000;
    const worlds = await this.worldRepo.find({
      where: {
        status: "ready",
        desiredState: "running",
      },
      order: {
        updatedAt: "ASC",
      },
    });

    for (const world of worlds) {
      const lastInteractiveAt = world.lastInteractiveAt ?? world.lastAccessedAt ?? world.lastHeartbeatAt;
      if (!lastInteractiveAt || lastInteractiveAt.getTime() > cutoff) {
        continue;
      }

      const [activeJobCount, pendingSessionCount] = await Promise.all([
        this.jobRepo.count({
          where: {
            worldId: world.id,
            status: In(["pending", "running"]),
          },
        }),
        this.accessSessionRepo.count({
          where: {
            worldId: world.id,
            status: In(["pending", "resolving", "waiting"]),
          },
        }),
      ]);

      if (activeJobCount > 0 || pendingSessionCount > 0) {
        continue;
      }

      world.status = "stopping";
      world.desiredState = "sleeping";
      world.healthStatus = "stopping";
      world.healthMessage = `World idle for ${this.idleSuspendSeconds}s, preparing suspend.`;
      world.failureCode = null;
      world.failureMessage = null;
      await this.worldRepo.save(world);

      await this.ensureLifecycleJob(world.id, "suspend", {
        source: "idle-suspend",
        idleSeconds: this.idleSuspendSeconds,
        lastInteractiveAt: lastInteractiveAt.toISOString(),
      });
      await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
        world.id,
        "world-lifecycle.auto-suspend",
      );

      this.logger.log(
        `Queued idle suspend for world ${world.id} after ${this.idleSuspendSeconds}s of inactivity.`,
      );
    }
  }

  private async reconcileObservedWorlds() {
    const worlds = await this.worldRepo.find({
      where: {
        status: In(["bootstrapping", "starting", "ready", "sleeping", "stopping"]),
      },
      order: {
        updatedAt: "ASC",
      },
      take: 20,
    });

    for (const world of worlds) {
      await this.reconcileObservedWorld(world, "maintenance-reconcile");
    }
  }

  private async reconcileObservedWorld(world: CloudWorldEntity, source: string) {
    const worldStatusBefore = world.status;
    const healthStatusBefore = world.healthStatus;
    const activeJobCount = await this.jobRepo.count({
      where: {
        worldId: world.id,
        status: In(["pending", "running"]),
      },
    });
    if (activeJobCount > 0) {
      return;
    }

    const provider = this.computeProviderRegistry.getProvider(world.providerKey);
    const instance = await this.instanceRepo.findOne({
      where: { worldId: world.id },
    });
    const observedStatus = await provider.inspectInstance(instance, world);
    const nextPowerState = this.mapObservedDeploymentStateToPowerState(
      observedStatus,
      this.normalizeStoredPowerState(instance?.powerState),
    );
    const previousPowerState = instance ? this.normalizeStoredPowerState(instance.powerState) : "absent";

    let instanceDirty = false;
    if (instance && instance.powerState !== nextPowerState) {
      instance.powerState = nextPowerState;
      instance.lastOperationAt = new Date();
      instanceDirty = true;
    }

    let worldDirty = false;
    let queuedJobType: "provision" | "resume" | null = null;
    let reconcileAction = "none";
    let shouldNotifyProviderError = false;

    if (observedStatus.deploymentState === "error") {
      const previousFailureMessage = world.failureMessage;
      const nextFailureMessage = observedStatus.providerMessage ?? "Provider reported a deployment error.";
      if (world.status !== "failed") {
        world.status = "failed";
        worldDirty = true;
      }
      if (world.healthStatus !== "failed") {
        world.healthStatus = "failed";
        worldDirty = true;
      }
      if (world.healthMessage !== nextFailureMessage) {
        world.healthMessage = nextFailureMessage;
        worldDirty = true;
      }
      if (world.failureCode !== "provider_error") {
        world.failureCode = "provider_error";
        worldDirty = true;
      }
      if (world.failureMessage !== nextFailureMessage) {
        world.failureMessage = nextFailureMessage;
        worldDirty = true;
      }
      shouldNotifyProviderError =
        worldStatusBefore !== "failed" || previousFailureMessage !== nextFailureMessage;
      reconcileAction = "mark_failed";
    } else if (world.desiredState === "running") {
      if (observedStatus.deploymentState === "running") {
        if (world.status === "sleeping" || world.status === "stopping") {
          world.status = "starting";
          world.healthStatus = "starting";
          world.healthMessage = "Provider reconcile detected a running deployment. Waiting for runtime heartbeat.";
          world.failureCode = null;
          world.failureMessage = null;
          worldDirty = true;
          reconcileAction = "resume_waiting_heartbeat";
        } else if (
          (world.status === "bootstrapping" || world.status === "starting") &&
          this.isHeartbeatStale(world.lastHeartbeatAt)
        ) {
          const nextHealthMessage = "Provider reports the deployment is running. Waiting for runtime heartbeat.";
          if (world.healthStatus !== "starting" || world.healthMessage !== nextHealthMessage) {
            world.healthStatus = "starting";
            world.healthMessage = nextHealthMessage;
            worldDirty = true;
            reconcileAction = "running_but_waiting_heartbeat";
          }
        }
      } else if (observedStatus.deploymentState === "starting" || observedStatus.deploymentState === "package_only") {
        const nextWorldStatus = observedStatus.deploymentState === "package_only" ? "bootstrapping" : "starting";
        const nextHealthMessage =
          observedStatus.providerMessage ??
          (observedStatus.deploymentState === "package_only"
            ? "Provider reconcile confirmed deployment package delivery. Waiting for runtime bootstrap."
            : "Provider reconcile reports the deployment is starting.");
        if (world.status !== nextWorldStatus) {
          world.status = nextWorldStatus;
          worldDirty = true;
        }
        if (world.healthStatus !== "starting" || world.healthMessage !== nextHealthMessage) {
          world.healthStatus = "starting";
          world.healthMessage = nextHealthMessage;
          worldDirty = true;
        }
        reconcileAction =
          observedStatus.deploymentState === "package_only" ? "package_delivered_waiting_bootstrap" : "provider_starting";
      } else if (observedStatus.deploymentState === "stopped" || observedStatus.deploymentState === "missing") {
        queuedJobType = await this.chooseRecoveryJobType(world.id);
        await this.ensureLifecycleJob(world.id, queuedJobType, {
          source,
          reconcileState: observedStatus.deploymentState,
          providerMessage: observedStatus.providerMessage,
        });
        const nextWorldStatus = queuedJobType === "resume" ? "starting" : "queued";
        const nextHealthStatus = queuedJobType === "resume" ? "starting" : "queued";
        const nextHealthMessage =
          observedStatus.deploymentState === "missing"
            ? "Provider reconcile detected that the deployment is missing. Queued recovery."
            : "Provider reconcile detected that the deployment is stopped. Queued recovery.";
        if (world.status !== nextWorldStatus) {
          world.status = nextWorldStatus;
          worldDirty = true;
        }
        if (world.healthStatus !== nextHealthStatus || world.healthMessage !== nextHealthMessage) {
          world.healthStatus = nextHealthStatus;
          world.healthMessage = nextHealthMessage;
          worldDirty = true;
        }
        if (world.failureCode || world.failureMessage) {
          world.failureCode = null;
          world.failureMessage = null;
          worldDirty = true;
        }
        reconcileAction = queuedJobType === "resume" ? "queue_resume" : "queue_provision";
      }
    } else if (world.desiredState === "sleeping") {
      if (observedStatus.deploymentState === "running" || observedStatus.deploymentState === "starting") {
        await this.ensureLifecycleJob(world.id, "suspend", {
          source,
          reconcileState: observedStatus.deploymentState,
          providerMessage: observedStatus.providerMessage,
        });
        if (world.status !== "stopping") {
          world.status = "stopping";
          worldDirty = true;
        }
        if (
          world.healthStatus !== "stopping" ||
          world.healthMessage !== "Provider reconcile detected a running deployment while desired state is sleeping. Queued suspend."
        ) {
          world.healthStatus = "stopping";
          world.healthMessage =
            "Provider reconcile detected a running deployment while desired state is sleeping. Queued suspend.";
          worldDirty = true;
        }
        reconcileAction = "queue_suspend";
      } else if (
        observedStatus.deploymentState === "stopped" ||
        observedStatus.deploymentState === "missing" ||
        observedStatus.deploymentState === "package_only"
      ) {
        if (world.status !== "sleeping") {
          world.status = "sleeping";
          worldDirty = true;
        }
        if (world.healthStatus !== "sleeping" || world.healthMessage !== "Provider reports the world is sleeping.") {
          world.healthStatus = "sleeping";
          world.healthMessage = "Provider reports the world is sleeping.";
          worldDirty = true;
        }
        if (world.failureCode || world.failureMessage) {
          world.failureCode = null;
          world.failureMessage = null;
          worldDirty = true;
        }
        reconcileAction = "normalize_sleeping";
      }
    }

    if (instanceDirty && instance) {
      await this.instanceRepo.save(instance);
    }
    if (worldDirty) {
      await this.worldRepo.save(world);
      if (shouldNotifyProviderError) {
        await this.cloudAlertNotifier.notifyProviderError(world, {
          source,
          deploymentState: observedStatus.deploymentState,
          providerMessage: observedStatus.providerMessage ?? null,
          rawStatus: observedStatus.rawStatus ?? null,
        });
      }
      await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
        world.id,
        "world-lifecycle.reconcile",
      );
      if (queuedJobType) {
        this.logger.warn(
          `Queued ${queuedJobType} during reconcile for world ${world.id} after observing ${observedStatus.deploymentState}.`,
        );
      }
    }

    if (source === "admin-reconcile" || worldDirty || instanceDirty || queuedJobType) {
      await this.recordReconcileAuditJob({
        worldId: world.id,
        source,
        observedStatus,
        reconcileAction,
        worldStatusBefore,
        worldStatusAfter: world.status,
        healthStatusBefore,
        healthStatusAfter: world.healthStatus,
        previousPowerState,
        nextPowerState,
        queuedJobType,
      });
    }
  }

  private async ensureLifecycleJob(
    worldId: string,
    jobType: "provision" | "resume" | "suspend",
    payload: Record<string, unknown>,
  ) {
    const existing = await this.jobRepo.findOne({
      where: {
        worldId,
        jobType,
        status: In(["pending", "running"]),
      },
      order: {
        createdAt: "DESC",
      },
    });
    if (existing) {
      return existing;
    }

    return this.jobRepo.save(
      this.jobRepo.create({
        worldId,
        jobType,
        status: "pending",
        priority: jobType === "resume" ? 50 : jobType === "suspend" ? 120 : 100,
        payload,
        attempt: 0,
        maxAttempts: jobType === "resume" ? 5 : 3,
        leaseOwner: null,
        leaseExpiresAt: null,
        availableAt: new Date(),
        startedAt: null,
        finishedAt: null,
        failureCode: null,
        failureMessage: null,
        resultPayload: null,
      }),
    );
  }

  private async recordReconcileAuditJob(params: {
    worldId: string;
    source: string;
    observedStatus: InspectWorldInstanceResult;
    reconcileAction: string;
    worldStatusBefore: string;
    worldStatusAfter: string;
    healthStatusBefore: string | null;
    healthStatusAfter: string | null;
    previousPowerState: CloudInstancePowerState;
    nextPowerState: CloudInstancePowerState;
    queuedJobType: "provision" | "resume" | null;
  }) {
    const now = new Date();
    await this.jobRepo.save(
      this.jobRepo.create({
        worldId: params.worldId,
        jobType: "reconcile",
        status: params.observedStatus.deploymentState === "error" ? "failed" : "succeeded",
        priority: 140,
        payload: {
          source: params.source,
          observedDeploymentState: params.observedStatus.deploymentState,
          rawStatus: params.observedStatus.rawStatus,
        },
        attempt: 1,
        maxAttempts: 1,
        leaseOwner: null,
        leaseExpiresAt: null,
        availableAt: now,
        startedAt: now,
        finishedAt: now,
        failureCode: params.observedStatus.deploymentState === "error" ? "provider_error" : null,
        failureMessage: params.observedStatus.deploymentState === "error" ? params.observedStatus.providerMessage ?? null : null,
        resultPayload: {
          action: params.reconcileAction,
          queuedJobType: params.queuedJobType,
          deploymentState: params.observedStatus.deploymentState,
          providerMessage: params.observedStatus.providerMessage,
          deploymentMode: params.observedStatus.deploymentMode,
          executorMode: params.observedStatus.executorMode,
          remoteHost: params.observedStatus.remoteHost,
          remoteDeployPath: params.observedStatus.remoteDeployPath,
          containerName: params.observedStatus.containerName,
          rawStatus: params.observedStatus.rawStatus,
          worldStatusBefore: params.worldStatusBefore,
          worldStatusAfter: params.worldStatusAfter,
          healthStatusBefore: params.healthStatusBefore,
          healthStatusAfter: params.healthStatusAfter,
          powerStateBefore: params.previousPowerState,
          powerStateAfter: params.nextPowerState,
        },
      }),
    );
  }

  private async chooseRecoveryJobType(worldId: string): Promise<"resume" | "provision"> {
    const instance = await this.instanceRepo.findOne({
      where: { worldId },
    });
    return instance ? "resume" : "provision";
  }

  private parsePositiveInteger(rawValue: string | undefined, fallback = 0) {
    const parsed = Number(rawValue ?? "0");
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private createJobLeaseExpiry(referenceTime = new Date()) {
    return new Date(referenceTime.getTime() + this.jobLeaseSeconds * 1000);
  }

  private isHeartbeatStale(lastHeartbeatAt: Date | null) {
    if (this.staleHeartbeatSeconds <= 0) {
      return false;
    }
    if (!lastHeartbeatAt) {
      return true;
    }

    return Date.now() - lastHeartbeatAt.getTime() > this.staleHeartbeatSeconds * 1000;
  }

  private mapObservedDeploymentStateToPowerState(
    observedStatus: InspectWorldInstanceResult,
    fallbackPowerState: CloudInstancePowerState,
  ): CloudInstancePowerState {
    switch (observedStatus.deploymentState) {
      case "running":
        return "running";
      case "starting":
      case "package_only":
        return "starting";
      case "stopped":
        return "stopped";
      case "missing":
        return "absent";
      case "error":
        return "error";
      case "unknown":
      default:
        return fallbackPowerState;
    }
  }

  private normalizeStoredPowerState(rawValue?: string | null): CloudInstancePowerState {
    switch (rawValue) {
      case "provisioning":
      case "running":
      case "stopped":
      case "starting":
      case "stopping":
      case "error":
        return rawValue;
      default:
        return "absent";
    }
  }
}
