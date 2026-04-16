import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  CloudComputeProviderSummary,
  CloudWorldBootstrapConfig,
  CloudWorldRuntimeStatusSummary,
  CloudInstanceSummary,
  CloudWorldLifecycleStatus,
  CloudWorldLookupResponse,
  CloudWorldRequestRecord,
  CloudWorldRequestStatus,
  CloudWorldSummary,
  WorldLifecycleJobStatus,
  WorldLifecycleJobSummary,
  WorldLifecycleJobType,
} from "@yinjie/contracts";
import { randomUUID } from "node:crypto";
import { In, Repository } from "typeorm";
import { PhoneAuthService } from "../auth/phone-auth.service";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { CloudWorldRequestEntity } from "../entities/cloud-world-request.entity";
import { WorldLifecycleJobEntity } from "../entities/world-lifecycle-job.entity";
import { buildWorldBootstrapConfig, resolveSuggestedWorldAdminUrl, resolveSuggestedWorldApiBaseUrl } from "../orchestration/world-bootstrap-config";
import { ComputeProviderRegistryService } from "../providers/compute-provider-registry.service";
import { WorldAccessService } from "../world-access/world-access.service";

@Injectable()
export class CloudService {
  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(CloudInstanceEntity)
    private readonly instanceRepo: Repository<CloudInstanceEntity>,
    @InjectRepository(CloudWorldRequestEntity)
    private readonly requestRepo: Repository<CloudWorldRequestEntity>,
    @InjectRepository(WorldLifecycleJobEntity)
    private readonly jobRepo: Repository<WorldLifecycleJobEntity>,
    private readonly configService: ConfigService,
    private readonly phoneAuthService: PhoneAuthService,
    private readonly computeProviderRegistry: ComputeProviderRegistryService,
    private readonly worldAccessService: WorldAccessService,
  ) {}

  async getWorldLookupByPhone(phone: string): Promise<CloudWorldLookupResponse> {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const [world, latestRequest] = await Promise.all([
      this.worldRepo.findOne({
        where: { phone: normalizedPhone },
      }),
      this.requestRepo.findOne({
        where: { phone: normalizedPhone },
        order: { updatedAt: "DESC" },
      }),
    ]);

    return {
      phone: normalizedPhone,
      status: world
        ? this.toWorldStatus(world.status)
        : latestRequest
          ? this.toRequestStatus(latestRequest.status)
          : "none",
      world: world ? this.serializeWorld(world) : null,
      latestRequest: latestRequest ? this.serializeRequest(latestRequest, world) : null,
    };
  }

  async getLatestRequestByPhone(phone: string) {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const latestRequest = await this.requestRepo.findOne({
      where: { phone: normalizedPhone },
      order: { updatedAt: "DESC" },
    });
    if (!latestRequest) {
      return null;
    }

    const world = await this.worldRepo.findOne({
      where: { phone: normalizedPhone },
    });
    return this.serializeRequest(latestRequest, world);
  }

  async createWorldRequest(phone: string, worldName: string) {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const normalizedName = worldName.trim();
    if (!normalizedName) {
      throw new BadRequestException("世界名称不能为空。");
    }

    const [world, latestRequest] = await Promise.all([
      this.worldRepo.findOne({
        where: { phone: normalizedPhone },
      }),
      this.requestRepo.findOne({
        where: { phone: normalizedPhone },
        order: { updatedAt: "DESC" },
      }),
    ]);
    if (world) {
      throw new BadRequestException("该手机号已经存在云世界记录，不能重复创建。");
    }
    if (latestRequest && latestRequest.status !== "rejected") {
      throw new BadRequestException("该手机号已经存在待处理申请，不能重复创建。");
    }

    const entity = this.requestRepo.create({
      phone: normalizedPhone,
      worldName: normalizedName,
      status: "pending",
      note: null,
      source: "app",
    });
    await this.requestRepo.save(entity);
    return this.serializeRequest(entity);
  }

  async listRequests(status?: CloudWorldRequestStatus) {
    const where = status ? { status } : undefined;
    const items = await this.requestRepo.find({
      where,
      order: { updatedAt: "DESC" },
    });
    const worldsByPhone = await this.loadWorldsByPhone(items.map((item) => item.phone));
    return items.map((item) => this.serializeRequest(item, worldsByPhone.get(item.phone)));
  }

  async getRequestById(id: string) {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException("找不到该云世界申请。");
    }
    const world = await this.worldRepo.findOne({
      where: { phone: request.phone },
    });
    return this.serializeRequest(request, world);
  }

  async updateRequest(
    id: string,
    payload: {
      phone?: string;
      worldName?: string;
      status?: CloudWorldRequestStatus;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException("找不到该云世界申请。");
    }

    const nextPhone = payload.phone ? this.phoneAuthService.normalizePhone(payload.phone) : request.phone;
    const nextWorldName = payload.worldName?.trim() || request.worldName;
    const nextStatus = payload.status ?? this.toRequestStatus(request.status);
    const normalizedApiBaseUrl = this.normalizeUrl(payload.apiBaseUrl);
    const normalizedAdminUrl = this.normalizeUrl(payload.adminUrl);

    request.phone = nextPhone;
    request.worldName = nextWorldName;
    request.status = nextStatus;
    request.note = payload.note?.trim() || null;
    await this.requestRepo.save(request);

    await this.syncWorldForRequest(request, {
      apiBaseUrl: normalizedApiBaseUrl,
      adminUrl: normalizedAdminUrl,
    });

    const world = await this.worldRepo.findOne({
      where: { phone: request.phone },
    });
    return this.serializeRequest(request, world);
  }

  async listWorlds(status?: CloudWorldLifecycleStatus) {
    const where = status ? { status } : undefined;
    const items = await this.worldRepo.find({
      where,
      order: { updatedAt: "DESC" },
    });
    return items.map((item) => this.serializeWorld(item));
  }

  async getWorldById(id: string) {
    const world = await this.worldRepo.findOne({ where: { id } });
    if (!world) {
      throw new NotFoundException("找不到该云世界。");
    }
    return this.serializeWorld(world);
  }

  listProviders(): CloudComputeProviderSummary[] {
    return this.computeProviderRegistry.listProviders();
  }

  async updateWorld(
    id: string,
    payload: {
      phone?: string;
      name?: string;
      status?: CloudWorldLifecycleStatus;
      provisionStrategy?: string;
      providerKey?: string | null;
      providerRegion?: string | null;
      providerZone?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
      note?: string | null;
    },
  ) {
    const world = await this.worldRepo.findOne({ where: { id } });
    if (!world) {
      throw new NotFoundException("找不到该云世界。");
    }

    const hasExplicitProviderChange = payload.providerKey !== undefined;
    const nextProvider = hasExplicitProviderChange
      ? this.computeProviderRegistry.getProvider(payload.providerKey)
      : this.computeProviderRegistry.getProvider(world.providerKey ?? this.resolveDefaultProviderKey());
    const nextPhone = payload.phone ? this.phoneAuthService.normalizePhone(payload.phone) : world.phone;
    const nextStatus = payload.status ?? this.toWorldStatus(world.status);
    const nextApiBaseUrl = payload.apiBaseUrl !== undefined ? this.normalizeUrl(payload.apiBaseUrl) : world.apiBaseUrl;
    const nextProvisionStrategy =
      payload.provisionStrategy !== undefined
        ? payload.provisionStrategy?.trim() || nextProvider.summary.provisionStrategy
        : hasExplicitProviderChange
          ? nextProvider.summary.provisionStrategy
          : world.provisionStrategy || nextProvider.summary.provisionStrategy;
    if (nextStatus === "ready" && !nextApiBaseUrl) {
      throw new BadRequestException("世界进入 ready 状态时必须提供 apiBaseUrl。");
    }

    world.phone = nextPhone;
    world.name = payload.name?.trim() || world.name;
    world.status = nextStatus;
    world.provisionStrategy = nextProvisionStrategy;
    world.providerKey = nextProvider.key;
    world.providerRegion =
      payload.providerRegion !== undefined
        ? payload.providerRegion?.trim() || null
        : hasExplicitProviderChange
          ? nextProvider.summary.defaultRegion ?? null
          : world.providerRegion;
    world.providerZone =
      payload.providerZone !== undefined
        ? payload.providerZone?.trim() || null
        : hasExplicitProviderChange
          ? nextProvider.summary.defaultZone ?? null
          : world.providerZone;
    world.apiBaseUrl = nextApiBaseUrl;
    world.adminUrl = payload.adminUrl !== undefined ? this.normalizeUrl(payload.adminUrl) : world.adminUrl;
    world.note = payload.note?.trim() || null;
    world.failureCode = nextStatus === "failed" ? world.failureCode ?? "manual_failure" : null;
    world.failureMessage = nextStatus === "failed" ? world.failureMessage ?? "管理员手动将世界标记为失败。" : null;
    world.healthStatus = nextStatus === "ready" ? "healthy" : nextStatus === "sleeping" ? "sleeping" : world.healthStatus;
    await this.worldRepo.save(world);
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);

    return this.serializeWorld(world);
  }

  async listJobs(filters?: {
    worldId?: string;
    status?: WorldLifecycleJobStatus;
    jobType?: WorldLifecycleJobType;
  }) {
    const where: {
      worldId?: string;
      status?: WorldLifecycleJobStatus;
      jobType?: WorldLifecycleJobType;
    } = {};

    if (filters?.worldId) {
      where.worldId = filters.worldId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.jobType) {
      where.jobType = filters.jobType;
    }

    const jobs = await this.jobRepo.find({
      where,
      order: {
        createdAt: "DESC",
      },
      take: filters?.worldId ? 20 : 100,
    });

    return jobs.map((job) => this.serializeJob(job));
  }

  async getJobById(id: string) {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException("找不到该生命周期任务。");
    }

    return this.serializeJob(job);
  }

  async getWorldInstance(worldId: string) {
    const world = await this.worldRepo.findOne({ where: { id: worldId } });
    if (!world) {
      throw new NotFoundException("找不到该云世界。");
    }

    const instance = await this.instanceRepo.findOne({
      where: { worldId },
    });
    return instance ? this.serializeInstance(instance) : null;
  }

  async getWorldBootstrapConfig(worldId: string): Promise<CloudWorldBootstrapConfig> {
    const world = await this.requireWorld(worldId);
    const preparedWorld = await this.ensureWorldBootstrapCredentials(world);
    return buildWorldBootstrapConfig(preparedWorld, this.configService);
  }

  async getWorldRuntimeStatus(worldId: string): Promise<CloudWorldRuntimeStatusSummary> {
    const world = await this.requireWorld(worldId);
    const instance = await this.instanceRepo.findOne({
      where: { worldId },
    });
    const provider = this.computeProviderRegistry.getProvider(world.providerKey ?? this.resolveDefaultProviderKey());
    const observedStatus = await provider.inspectInstance(instance, world);

    return {
      worldId: world.id,
      providerKey: observedStatus.providerKey ?? provider.key,
      deploymentMode: observedStatus.deploymentMode ?? provider.summary.deploymentMode,
      executorMode: observedStatus.executorMode ?? null,
      remoteHost: observedStatus.remoteHost ?? null,
      remoteDeployPath: observedStatus.remoteDeployPath ?? null,
      projectName: observedStatus.projectName ?? null,
      containerName: observedStatus.containerName ?? null,
      deploymentState: observedStatus.deploymentState,
      providerMessage: observedStatus.providerMessage ?? null,
      rawStatus: observedStatus.rawStatus ?? null,
      observedAt: new Date().toISOString(),
    };
  }

  async rotateWorldCallbackToken(worldId: string): Promise<CloudWorldBootstrapConfig> {
    const world = await this.requireWorld(worldId);
    world.callbackToken = randomUUID();
    if (!world.slug) {
      world.slug = this.createWorldSlug(world.phone);
    }
    const savedWorld = await this.worldRepo.save(world);
    return buildWorldBootstrapConfig(savedWorld, this.configService);
  }

  async resumeWorld(id: string) {
    const world = await this.requireWorld(id);
    if (world.status === "disabled" || world.status === "deleting") {
      throw new BadRequestException("当前世界不可唤起。");
    }
    if (world.status === "ready" || world.status === "starting" || world.status === "bootstrapping" || world.status === "creating") {
      return this.serializeWorld(world);
    }

    const jobType = await this.chooseRecoveryJobType(world.id);
    world.status = jobType === "resume" ? "starting" : "queued";
    world.desiredState = "running";
    world.healthStatus = jobType === "resume" ? "starting" : "queued";
    world.healthMessage = jobType === "resume" ? "管理员手动唤起该世界。" : "管理员手动重建该世界。";
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.ensureLifecycleJob(world.id, jobType, {
      source: "admin-resume",
    });
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
    return this.serializeWorld(world);
  }

  async suspendWorld(id: string) {
    const world = await this.requireWorld(id);
    if (world.status === "disabled" || world.status === "deleting") {
      throw new BadRequestException("当前世界不可休眠。");
    }
    if (world.status === "sleeping" || world.status === "stopping") {
      return this.serializeWorld(world);
    }

    world.status = "stopping";
    world.desiredState = "sleeping";
    world.healthStatus = "stopping";
    world.healthMessage = "管理员正在让世界休眠。";
    await this.worldRepo.save(world);
    await this.ensureLifecycleJob(world.id, "suspend", {
      source: "admin-suspend",
    });
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
    return this.serializeWorld(world);
  }

  async retryWorld(id: string) {
    const world = await this.requireWorld(id);
    if (world.status === "disabled" || world.status === "deleting") {
      throw new BadRequestException("当前世界不可重试。");
    }

    const jobType = await this.chooseRecoveryJobType(world.id);
    world.status = jobType === "resume" ? "starting" : "queued";
    world.desiredState = "running";
    world.healthStatus = jobType === "resume" ? "starting" : "queued";
    world.healthMessage = jobType === "resume" ? "正在重试唤起该世界。" : "正在重试创建该世界。";
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.ensureLifecycleJob(world.id, jobType, {
      source: "admin-retry",
    });
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
    return this.serializeWorld(world);
  }

  private async syncWorldForRequest(
    request: CloudWorldRequestEntity,
    payload: {
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) {
    if (request.status === "pending") {
      return;
    }

    let world = await this.worldRepo.findOne({
      where: { phone: request.phone },
    });

    if (!world) {
      const provider = this.computeProviderRegistry.getProvider("manual-docker");
      world = this.worldRepo.create({
        phone: request.phone,
        name: request.worldName,
        status: this.mapRequestStatusToWorldStatus(this.toRequestStatus(request.status)),
        slug: this.createWorldSlug(request.phone),
        desiredState: request.status === "disabled" ? "sleeping" : "running",
        provisionStrategy: provider.summary.provisionStrategy,
        providerKey: provider.key,
        providerRegion: provider.summary.defaultRegion ?? null,
        providerZone: provider.summary.defaultZone ?? null,
        apiBaseUrl: null,
        adminUrl: null,
        runtimeVersion: null,
        callbackToken: randomUUID(),
        healthStatus: null,
        healthMessage: null,
        lastAccessedAt: null,
        lastInteractiveAt: null,
        lastBootedAt: null,
        lastHeartbeatAt: null,
        lastSuspendedAt: null,
        failureCode: null,
        failureMessage: null,
        retryCount: 0,
        note: null,
      });
    }

    world.phone = request.phone;
    world.name = request.worldName;
    world.status = this.mapRequestStatusToWorldStatus(this.toRequestStatus(request.status));
    world.note = request.note ?? null;
    world.adminUrl = payload.adminUrl ?? world.adminUrl ?? null;

    if (!world.slug) {
      world.slug = this.createWorldSlug(request.phone);
    }
    if (!world.callbackToken) {
      world.callbackToken = randomUUID();
    }

    if (request.status === "active") {
      if (!payload.apiBaseUrl && !world.apiBaseUrl) {
        throw new BadRequestException("激活云世界时必须提供 apiBaseUrl。");
      }
      world.apiBaseUrl = payload.apiBaseUrl ?? world.apiBaseUrl;
      world.healthStatus = "healthy";
      world.healthMessage = "人工交付的世界已准备好。";
    } else if (payload.apiBaseUrl !== undefined) {
      world.apiBaseUrl = payload.apiBaseUrl;
    }

    if (request.status === "rejected") {
      world.failureCode = "request_rejected";
      world.failureMessage = request.note ?? "申请已被拒绝。";
      world.healthStatus = "failed";
      world.healthMessage = world.failureMessage;
    } else if (request.status === "disabled") {
      world.failureCode = "manually_disabled";
      world.failureMessage = request.note ?? "该世界已被停用。";
      world.healthStatus = "disabled";
      world.healthMessage = world.failureMessage;
    } else {
      world.failureCode = null;
      world.failureMessage = null;
    }

    await this.worldRepo.save(world);
  }

  private serializeWorld(world: CloudWorldEntity): CloudWorldSummary {
    return {
      id: world.id,
      phone: world.phone,
      name: world.name,
      status: this.toWorldStatus(world.status),
      desiredState: world.desiredState === "sleeping" ? "sleeping" : "running",
      apiBaseUrl: world.apiBaseUrl,
      adminUrl: world.adminUrl,
      healthStatus: world.healthStatus,
      healthMessage: world.healthMessage,
      provisionStrategy: world.provisionStrategy,
      providerKey: world.providerKey,
      providerRegion: world.providerRegion,
      providerZone: world.providerZone,
      failureCode: world.failureCode,
      failureMessage: world.failureMessage,
      lastAccessedAt: world.lastAccessedAt?.toISOString() ?? null,
      lastInteractiveAt: world.lastInteractiveAt?.toISOString() ?? null,
      lastBootedAt: world.lastBootedAt?.toISOString() ?? null,
      lastHeartbeatAt: world.lastHeartbeatAt?.toISOString() ?? null,
      lastSuspendedAt: world.lastSuspendedAt?.toISOString() ?? null,
      note: world.note,
      createdAt: world.createdAt.toISOString(),
      updatedAt: world.updatedAt.toISOString(),
    };
  }

  private serializeRequest(request: CloudWorldRequestEntity, world?: CloudWorldEntity | null): CloudWorldRequestRecord {
    return {
      id: request.id,
      phone: request.phone,
      worldName: request.worldName,
      status: this.toRequestStatus(request.status),
      apiBaseUrl: world?.apiBaseUrl ?? null,
      adminUrl: world?.adminUrl ?? null,
      note: request.note,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private serializeJob(job: WorldLifecycleJobEntity): WorldLifecycleJobSummary {
    return {
      id: job.id,
      worldId: job.worldId,
      jobType: this.toJobType(job.jobType),
      status: this.toJobStatus(job.status),
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      failureCode: job.failureCode,
      failureMessage: job.failureMessage,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    };
  }

  private serializeInstance(instance: CloudInstanceEntity): CloudInstanceSummary {
    return {
      id: instance.id,
      worldId: instance.worldId,
      providerKey: instance.providerKey,
      providerInstanceId: instance.providerInstanceId,
      providerVolumeId: instance.providerVolumeId,
      providerSnapshotId: instance.providerSnapshotId,
      name: instance.name,
      region: instance.region,
      zone: instance.zone,
      privateIp: instance.privateIp,
      publicIp: instance.publicIp,
      powerState: this.toPowerState(instance.powerState),
      imageId: instance.imageId,
      flavor: instance.flavor,
      diskSizeGb: instance.diskSizeGb,
      launchConfig: instance.launchConfig,
      bootstrappedAt: instance.bootstrappedAt?.toISOString() ?? null,
      lastHeartbeatAt: instance.lastHeartbeatAt?.toISOString() ?? null,
      lastOperationAt: instance.lastOperationAt?.toISOString() ?? null,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString(),
    };
  }

  private async requireWorld(id: string) {
    const world = await this.worldRepo.findOne({ where: { id } });
    if (!world) {
      throw new NotFoundException("找不到该云世界。");
    }

    return world;
  }

  private async ensureLifecycleJob(worldId: string, jobType: WorldLifecycleJobType, payload: Record<string, unknown>) {
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
        priority: jobType === "resume" ? 50 : jobType === "suspend" ? 80 : 100,
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

  private async chooseRecoveryJobType(worldId: string): Promise<WorldLifecycleJobType> {
    const instance = await this.instanceRepo.findOne({
      where: { worldId },
    });
    return instance ? "resume" : "provision";
  }

  private async loadWorldsByPhone(phones: string[]) {
    const uniquePhones = [...new Set(phones)];
    if (!uniquePhones.length) {
      return new Map<string, CloudWorldEntity>();
    }

    const worlds = await this.worldRepo
      .createQueryBuilder("world")
      .where("world.phone IN (:...phones)", { phones: uniquePhones })
      .getMany();

    return new Map(worlds.map((world) => [world.phone, world]));
  }

  private toRequestStatus(value: string): CloudWorldRequestStatus {
    switch (value) {
      case "pending":
      case "provisioning":
      case "active":
      case "rejected":
      case "disabled":
        return value;
      default:
        throw new BadRequestException("不支持的云世界申请状态。");
    }
  }

  private toWorldStatus(value: string): CloudWorldLifecycleStatus {
    switch (value) {
      case "queued":
      case "creating":
      case "bootstrapping":
      case "starting":
      case "ready":
      case "sleeping":
      case "stopping":
      case "failed":
      case "disabled":
      case "deleting":
        return value;
      case "pending":
        return "queued";
      case "provisioning":
        return "creating";
      case "active":
        return "ready";
      case "rejected":
        return "failed";
      default:
        throw new BadRequestException("不支持的云世界状态。");
    }
  }

  private mapRequestStatusToWorldStatus(status: CloudWorldRequestStatus): CloudWorldLifecycleStatus {
    switch (status) {
      case "active":
        return "ready";
      case "disabled":
        return "disabled";
      case "rejected":
        return "failed";
      case "provisioning":
        return "creating";
      case "pending":
      default:
        return "queued";
    }
  }

  private toJobStatus(value: string): WorldLifecycleJobStatus {
    switch (value) {
      case "pending":
      case "running":
      case "succeeded":
      case "failed":
      case "cancelled":
        return value;
      default:
        throw new BadRequestException("不支持的任务状态。");
    }
  }

  private toJobType(value: string): WorldLifecycleJobType {
    switch (value) {
      case "resume":
      case "suspend":
      case "provision":
        return value;
      default:
        throw new BadRequestException("不支持的任务类型。");
    }
  }

  private toPowerState(value: string): CloudInstanceSummary["powerState"] {
    switch (value) {
      case "provisioning":
      case "running":
      case "stopped":
      case "starting":
      case "stopping":
      case "error":
        return value;
      default:
        return "absent";
    }
  }

  private async ensureWorldBootstrapCredentials(world: CloudWorldEntity) {
    let dirty = false;
    const provider = this.computeProviderRegistry.getProvider(world.providerKey ?? this.resolveDefaultProviderKey());

    if (world.providerKey !== provider.key) {
      world.providerKey = provider.key;
      dirty = true;
    }
    if (!world.provisionStrategy) {
      world.provisionStrategy = provider.summary.provisionStrategy;
      dirty = true;
    }
    if (!world.providerRegion && provider.summary.defaultRegion) {
      world.providerRegion = provider.summary.defaultRegion;
      dirty = true;
    }
    if (!world.providerZone && provider.summary.defaultZone) {
      world.providerZone = provider.summary.defaultZone;
      dirty = true;
    }
    if (!world.slug) {
      world.slug = this.createWorldSlug(world.phone);
      dirty = true;
    }
    if (!world.callbackToken) {
      world.callbackToken = randomUUID();
      dirty = true;
    }
    if (!world.apiBaseUrl) {
      const suggestedApiBaseUrl = resolveSuggestedWorldApiBaseUrl(world, this.configService);
      if (suggestedApiBaseUrl) {
        world.apiBaseUrl = suggestedApiBaseUrl;
        dirty = true;
      }
    }
    if (!world.adminUrl) {
      const suggestedAdminUrl = resolveSuggestedWorldAdminUrl(world, this.configService);
      if (suggestedAdminUrl) {
        world.adminUrl = suggestedAdminUrl;
        dirty = true;
      }
    }

    if (!dirty) {
      return world;
    }

    return this.worldRepo.save(world);
  }

  private normalizeUrl(value?: string | null) {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }
    return normalized.replace(/\/+$/, "");
  }

  private resolveDefaultProviderKey() {
    return this.computeProviderRegistry.getDefaultProviderKey();
  }

  private createWorldSlug(phone: string) {
    const digits = phone.replace(/\D+/g, "");
    return `world-${digits.slice(-4)}-${digits.slice(0, 4) || "0000"}`;
  }
}
