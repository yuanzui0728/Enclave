import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { WorldAccessSessionEntity } from "../entities/world-access-session.entity";
import { WorldLifecycleJobEntity } from "../entities/world-lifecycle-job.entity";
import { ComputeProviderRegistryService } from "../providers/compute-provider-registry.service";
import { WorldAccessService } from "../world-access/world-access.service";
import { resolveSuggestedWorldAdminUrl, resolveSuggestedWorldApiBaseUrl } from "./world-bootstrap-config";

@Injectable()
export class WorldLifecycleWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldLifecycleWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private lastMaintenanceAt = 0;
  private readonly idleSuspendSeconds: number;

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
    private readonly computeProviderRegistry: ComputeProviderRegistryService,
    private readonly worldAccessService: WorldAccessService,
  ) {
    this.idleSuspendSeconds = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_WORLD_IDLE_SUSPEND_SECONDS"),
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
      const job = await this.jobRepo
        .createQueryBuilder("job")
        .where("job.status = :status", { status: "pending" })
        .andWhere("(job.availableAt IS NULL OR job.availableAt <= :now)", { now: new Date() })
        .orderBy("job.priority", "ASC")
        .addOrderBy("job.createdAt", "ASC")
        .getOne();

      if (job) {
        await this.runJob(job);
      }

      if (Date.now() - this.lastMaintenanceAt >= 5_000) {
        this.lastMaintenanceAt = Date.now();
        await this.autoSuspendIdleWorlds();
      }
    } finally {
      this.ticking = false;
    }
  }

  private async runJob(job: WorldLifecycleJobEntity) {
    const world = await this.worldRepo.findOne({
      where: { id: job.worldId },
    });
    if (!world) {
      job.status = "cancelled";
      job.failureCode = "world_missing";
      job.failureMessage = "Target world no longer exists, so the job was cancelled.";
      job.finishedAt = new Date();
      await this.jobRepo.save(job);
      return;
    }

    job.status = "running";
    job.attempt += 1;
    job.startedAt = new Date();
    job.finishedAt = null;
    job.failureCode = null;
    job.failureMessage = null;
    await this.jobRepo.save(job);

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

      job.status = "succeeded";
      job.finishedAt = new Date();
      job.resultPayload = {
        worldStatus: world.status,
        apiBaseUrl: world.apiBaseUrl,
      };
      await this.jobRepo.save(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown orchestration error.";
      this.logger.error(`World lifecycle job failed: ${job.id} ${message}`);

      const canRetry = job.attempt < job.maxAttempts;
      job.failureCode = "job_failed";
      job.failureMessage = message;

      if (canRetry) {
        job.status = "pending";
        job.finishedAt = null;
        job.availableAt = new Date(Date.now() + job.attempt * 10_000);
        await this.jobRepo.save(job);
      } else {
        job.status = "failed";
        job.finishedAt = new Date();
        await this.jobRepo.save(job);

        world.status = "failed";
        world.healthStatus = "failed";
        world.healthMessage = message;
        world.failureCode = "job_failed";
        world.failureMessage = message;
        world.retryCount += 1;
        await this.worldRepo.save(world);

        const instance = await this.instanceRepo.findOne({
          where: { worldId: world.id },
        });
        if (instance) {
          instance.powerState = "error";
          await this.instanceRepo.save(instance);
        }

        await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
      }
    }
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
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);

    await this.sleep(600);

    const provisioned = provider.createInstance(world);
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
    await this.instanceRepo.save(instance);
    await this.worldRepo.save(world);

    world.status = "bootstrapping";
    world.healthStatus = "bootstrapping";
    world.healthMessage = "Instance is online and bootstrap is running.";
    await this.worldRepo.save(world);
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);

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
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
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
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);

    instance.powerState = "starting";
    instance.lastOperationAt = new Date();
    await this.instanceRepo.save(instance);

    await this.sleep(600);

    const resumeResult = provider.startInstance(instance, world);
    instance.powerState = resumeResult.powerState;
    instance.providerSnapshotId = resumeResult.providerSnapshotId ?? instance.providerSnapshotId;
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
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
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
      const suspendResult = provider.stopInstance(instance, world);
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
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
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
      await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);

      this.logger.log(
        `Queued idle suspend for world ${world.id} after ${this.idleSuspendSeconds}s of inactivity.`,
      );
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

  private parsePositiveInteger(rawValue: string | undefined) {
    const parsed = Number(rawValue ?? "0");
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    return Math.floor(parsed);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
