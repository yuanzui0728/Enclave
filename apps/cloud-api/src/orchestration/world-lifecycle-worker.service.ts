import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { WorldLifecycleJobEntity } from "../entities/world-lifecycle-job.entity";
import { MockComputeProviderService } from "./mock-compute-provider.service";
import { WorldAccessService } from "../world-access/world-access.service";

@Injectable()
export class WorldLifecycleWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldLifecycleWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(CloudInstanceEntity)
    private readonly instanceRepo: Repository<CloudInstanceEntity>,
    @InjectRepository(WorldLifecycleJobEntity)
    private readonly jobRepo: Repository<WorldLifecycleJobEntity>,
    private readonly mockComputeProvider: MockComputeProviderService,
    private readonly worldAccessService: WorldAccessService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 1500);
    this.timer.unref?.();
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

      if (!job) {
        return;
      }

      await this.runJob(job);
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
      job.failureMessage = "目标世界不存在，任务已取消。";
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
      const message = error instanceof Error ? error.message : "未知编排错误。";
      this.logger.error(`World lifecycle job failed: ${job.id} ${message}`);

      const canRetry = job.attempt < job.maxAttempts;
      job.failureCode = "job_failed";
      job.failureMessage = message;

      if (canRetry) {
        // Exponential backoff: attempt * 10s
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
    world.status = "creating";
    world.desiredState = "running";
    world.healthStatus = "creating";
    world.healthMessage = "正在创建世界实例。";
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);

    await this.sleep(600);

    const provisioned = this.mockComputeProvider.createInstance(world);
    let instance = await this.instanceRepo.findOne({
      where: { worldId: world.id },
    });
    if (!instance) {
      instance = this.instanceRepo.create({
        worldId: world.id,
        providerKey: provisioned.providerKey,
        providerInstanceId: provisioned.providerInstanceId,
        name: `${world.slug ?? world.id}-vm`,
        region: provisioned.region,
        zone: provisioned.zone,
        privateIp: provisioned.privateIp,
        publicIp: provisioned.publicIp,
        powerState: "provisioning",
        imageId: "mock-image-v1",
        flavor: "mock.small",
        diskSizeGb: 20,
        bootstrappedAt: null,
        lastHeartbeatAt: null,
      });
    } else {
      instance.providerKey = provisioned.providerKey;
      instance.providerInstanceId = provisioned.providerInstanceId;
      instance.region = provisioned.region;
      instance.zone = provisioned.zone;
      instance.privateIp = provisioned.privateIp;
      instance.publicIp = provisioned.publicIp;
      instance.powerState = "provisioning";
    }

    world.providerKey = provisioned.providerKey;
    world.providerRegion = provisioned.region;
    world.providerZone = provisioned.zone;
    await this.instanceRepo.save(instance);
    await this.worldRepo.save(world);

    world.status = "bootstrapping";
    world.healthStatus = "bootstrapping";
    world.healthMessage = "世界实例已启动，正在准备世界服务。";
    await this.worldRepo.save(world);
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);

    await this.sleep(700);

    const now = new Date();
    instance.powerState = "running";
    instance.bootstrappedAt = now;
    instance.lastHeartbeatAt = now;
    await this.instanceRepo.save(instance);

    world.status = "ready";
    world.apiBaseUrl = provisioned.apiBaseUrl;
    world.adminUrl = provisioned.adminUrl;
    world.healthStatus = "healthy";
    world.healthMessage = "世界已准备好。";
    world.lastBootedAt = now;
    world.lastHeartbeatAt = now;
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
  }

  private async handleResume(world: CloudWorldEntity) {
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
    world.healthMessage = "正在唤起你之前的世界。";
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);

    instance.powerState = "starting";
    await this.instanceRepo.save(instance);

    await this.sleep(600);

    instance.powerState = this.mockComputeProvider.startInstance(instance).powerState;
    const now = new Date();
    instance.lastHeartbeatAt = now;
    await this.instanceRepo.save(instance);

    world.status = "ready";
    world.apiBaseUrl = world.apiBaseUrl ?? this.mockComputeProvider.resolveApiBaseUrl();
    world.healthStatus = "healthy";
    world.healthMessage = "世界已重新唤起。";
    world.lastBootedAt = now;
    world.lastHeartbeatAt = now;
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
  }

  private async handleSuspend(world: CloudWorldEntity) {
    world.status = "stopping";
    world.desiredState = "sleeping";
    world.healthStatus = "stopping";
    world.healthMessage = "正在让世界休眠。";
    await this.worldRepo.save(world);

    const instance = await this.instanceRepo.findOne({
      where: { worldId: world.id },
    });
    if (instance) {
      instance.powerState = this.mockComputeProvider.stopInstance(instance).powerState;
      await this.instanceRepo.save(instance);
    }

    await this.sleep(500);

    world.status = "sleeping";
    world.healthStatus = "sleeping";
    world.healthMessage = "世界已休眠。";
    world.lastSuspendedAt = new Date();
    await this.worldRepo.save(world);
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
