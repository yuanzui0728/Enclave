import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  ClearFilteredFailedCloudWaitingSessionSyncTasksResponse,
  ClearFailedCloudWaitingSessionSyncTasksResponse,
  CloudWorldLifecycleJobListQuery,
  CloudWaitingSessionSyncTaskListResponse,
  CloudWaitingSessionSyncTaskStatus,
  CloudWaitingSessionSyncTaskSummary,
  CloudWaitingSessionSyncTaskType,
  CloudWorldAlertSummary,
  CloudComputeProviderSummary,
  CloudWorldAttentionItem,
  CloudWorldAttentionEscalationReason,
  CloudWorldBootstrapConfig,
  CloudWorldDeploymentState,
  CloudWorldDriftSummary,
  CloudWorldInstanceFleetItem,
  CloudWorldRuntimeStatusSummary,
  CloudInstanceSummary,
  CloudWorldLifecycleStatus,
  CloudWorldLookupResponse,
  CloudWorldRequestRecord,
  CloudWorldRequestStatus,
  CloudWorldSummary,
  ReplayFilteredFailedCloudWaitingSessionSyncTasksResponse,
  ReplayFailedCloudWaitingSessionSyncTasksResponse,
  WorldLifecycleJobStatus,
  WorldLifecycleJobSummary,
  WorldLifecycleJobType,
} from "@yinjie/contracts";
import { randomUUID } from "node:crypto";
import { Brackets, EntityManager, In, Repository } from "typeorm";
import { PhoneAuthService } from "../auth/phone-auth.service";
import { createCloudWorldSlug } from "../cloud-world-slug";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { CloudWorldRequestEntity } from "../entities/cloud-world-request.entity";
import { WaitingSessionSyncTaskEntity } from "../entities/waiting-session-sync-task.entity";
import { WorldLifecycleJobEntity } from "../entities/world-lifecycle-job.entity";
import {
  buildWorldBootstrapConfig,
  resolveSuggestedWorldAdminUrl,
  resolveSuggestedWorldApiBaseUrl,
} from "../orchestration/world-bootstrap-config";
import {
  ensureUniqueActiveLifecycleJob,
  getSupersededLifecycleJobMetadata,
} from "../orchestration/world-lifecycle-job-queue";
import { WorldLifecycleWorkerService } from "../orchestration/world-lifecycle-worker.service";
import { ComputeProviderRegistryService } from "../providers/compute-provider-registry.service";
import { isRequestGatePlaceholderWorld as isRequestGatePlaceholder } from "../request-gate-placeholder";
import { getRequestPhoneAvailability } from "../request-phone-availability";
import {
  getRequestGateState,
  REQUEST_GATE_FAILURE_CODES,
} from "../request-gate-state";
import {
  getRequestRecordProjection,
  getRequestWorldSyncDecision,
  getRequestVisibleWorldProjection,
} from "../request-world-sync-state";
import { WaitingSessionSyncService } from "../world-access/waiting-session-sync.service";

type CloudRequestWriteRepositories = {
  worldRepo: Repository<CloudWorldEntity>;
  requestRepo: Repository<CloudWorldRequestEntity>;
};

type WaitingSessionSyncTaskFilters = {
  status?: CloudWaitingSessionSyncTaskStatus;
  taskType?: CloudWaitingSessionSyncTaskType;
  query?: string;
};

type WorldLifecycleJobFilters = CloudWorldLifecycleJobListQuery;
const UNASSIGNED_PROVIDER_FILTER = "__unassigned__";

@Injectable()
export class CloudService {
  private readonly staleHeartbeatSeconds: number;
  private readonly alertRetryThreshold: number;
  private readonly criticalHeartbeatStaleSeconds: number;

  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(CloudInstanceEntity)
    private readonly instanceRepo: Repository<CloudInstanceEntity>,
    @InjectRepository(CloudWorldRequestEntity)
    private readonly requestRepo: Repository<CloudWorldRequestEntity>,
    @InjectRepository(WorldLifecycleJobEntity)
    private readonly jobRepo: Repository<WorldLifecycleJobEntity>,
    @InjectRepository(WaitingSessionSyncTaskEntity)
    private readonly waitingSessionSyncTaskRepo: Repository<WaitingSessionSyncTaskEntity>,
    private readonly configService: ConfigService,
    private readonly phoneAuthService: PhoneAuthService,
    private readonly computeProviderRegistry: ComputeProviderRegistryService,
    private readonly worldLifecycleWorker: WorldLifecycleWorkerService,
    private readonly waitingSessionSyncService: WaitingSessionSyncService,
  ) {
    this.staleHeartbeatSeconds = this.parsePositiveInteger(
      this.configService.get<string>(
        "CLOUD_WORLD_RECONCILE_STALE_HEARTBEAT_SECONDS",
      ),
    );
    this.alertRetryThreshold = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_WORLD_ALERT_RETRY_THRESHOLD"),
      3,
    );
    this.criticalHeartbeatStaleSeconds = this.parsePositiveInteger(
      this.configService.get<string>(
        "CLOUD_WORLD_ALERT_CRITICAL_HEARTBEAT_STALE_SECONDS",
      ),
      this.staleHeartbeatSeconds > 0 ? this.staleHeartbeatSeconds * 3 : 0,
    );
  }

  async getWorldLookupByPhone(
    phone: string,
  ): Promise<CloudWorldLookupResponse> {
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
    const visibleWorld = this.toVisibleWorld(world);
    const hasHiddenPlaceholder = !!world && !visibleWorld;

    return {
      phone: normalizedPhone,
      status: hasHiddenPlaceholder && latestRequest
        ? this.toRequestStatus(latestRequest.status)
        : visibleWorld
        ? this.toWorldStatus(visibleWorld.status)
        : latestRequest
          ? this.toRequestStatus(latestRequest.status)
          : "none",
      world: visibleWorld ? this.serializeWorld(visibleWorld) : null,
      latestRequest: latestRequest
        ? this.serializeRequest(
            latestRequest,
            visibleWorld,
          )
        : null,
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

    const world = this.toVisibleWorld(
      await this.worldRepo.findOne({
        where: { phone: normalizedPhone },
      }),
    );
    return this.serializeRequest(latestRequest, world);
  }

  async createWorldRequest(phone: string, worldName: string) {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const normalizedName = worldName.trim();
    if (!normalizedName) {
      throw new BadRequestException("世界名称不能为空。");
    }

    await this.assertRequestPhoneAvailable(normalizedPhone, {
      duplicateWorldMessage: "该手机号已经存在云世界记录，不能重复创建。",
      duplicateRequestMessage: "该手机号已经存在待处理申请，不能重复创建。",
    });

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
    const worldsByPhone = await this.loadWorldsByPhone(
      items.map((item) => item.phone),
    );
    return items.map((item) =>
      this.serializeRequest(item, worldsByPhone.get(item.phone)),
    );
  }

  async getRequestById(id: string) {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException("找不到该云世界申请。");
    }
    const world = this.toVisibleWorld(
      await this.worldRepo.findOne({
        where: { phone: request.phone },
      }),
    );
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
    const normalizedApiBaseUrl =
      payload.apiBaseUrl === undefined
        ? undefined
        : this.normalizeOptionalUrl(payload.apiBaseUrl);
    const normalizedAdminUrl =
      payload.adminUrl === undefined
        ? undefined
        : this.normalizeOptionalUrl(payload.adminUrl);
    const normalizedNote =
      payload.note === undefined
        ? undefined
        : this.normalizeOptionalText(payload.note);
    const { previousPhone, request } = await this.requestRepo.manager.transaction(
      async (manager: EntityManager) => {
        const repos = this.getCloudRequestWriteRepositories(manager);
        const request = await repos.requestRepo.findOne({ where: { id } });
        if (!request) {
          throw new NotFoundException("找不到该云世界申请。");
        }

        const previousPhone = request.phone;
        const nextPhone = payload.phone
          ? this.phoneAuthService.normalizePhone(payload.phone)
          : request.phone;
        const nextWorldName = payload.worldName?.trim() || request.worldName;
        const nextStatus = payload.status ?? this.toRequestStatus(request.status);

        if (previousPhone !== nextPhone) {
          await this.assertRequestPhoneAvailable(
            nextPhone,
            {
              excludeRequestId: request.id,
              duplicateWorldMessage:
                "该手机号已经存在云世界记录，不能改绑到这个手机号。",
              duplicateRequestMessage:
                "该手机号已经存在待处理申请，不能改绑到这个手机号。",
            },
            repos,
          );
        }

        request.phone = nextPhone;
        request.worldName = nextWorldName;
        request.status = nextStatus;
        request.note =
          normalizedNote !== undefined ? normalizedNote : request.note;
        await repos.requestRepo.save(request);

        await this.syncWorldForRequest(
          request,
          {
            apiBaseUrl: normalizedApiBaseUrl,
            adminUrl: normalizedAdminUrl,
            previousPhone,
          },
          repos,
        );

        return {
          previousPhone,
          request,
        };
      },
    );

    if (previousPhone !== request.phone) {
      await this.waitingSessionSyncService.invalidateWaitingSessionsForPhone(
        previousPhone,
        "cloud.updateRequest",
      );
    }
    await this.waitingSessionSyncService.refreshWaitingSessionsForPhone(
      request.phone,
      "cloud.updateRequest",
    );
    const world = await this.worldRepo.findOne({
      where: { phone: request.phone },
    });
    return this.serializeRequest(request, this.toVisibleWorld(world));
  }

  async listWorlds(status?: CloudWorldLifecycleStatus) {
    const where = status ? { status } : undefined;
    const items = this.filterVisibleWorlds(await this.worldRepo.find({
      where,
      order: { updatedAt: "DESC" },
    }));
    return items.map((item) => this.serializeWorld(item));
  }

  async listWorldInstances(
    status?: CloudWorldLifecycleStatus,
  ): Promise<CloudWorldInstanceFleetItem[]> {
    const where = status ? { status } : undefined;
    const worlds = this.filterVisibleWorlds(await this.worldRepo.find({
      where,
      order: { updatedAt: "DESC" },
    }));
    const worldIds = worlds.map((world) => world.id);
    const instances = worldIds.length
      ? await this.instanceRepo.find({
          where: { worldId: In(worldIds) },
          order: { updatedAt: "DESC" },
        })
      : [];
    const instanceByWorldId = new Map(
      instances.map((instance) => [instance.worldId, instance] as const),
    );

    return worlds.map((world) => ({
      world: this.serializeWorld(world),
      instance: instanceByWorldId.get(world.id)
        ? this.serializeInstance(instanceByWorldId.get(world.id)!)
        : null,
    }));
  }

  async getWorldById(id: string) {
    const world = await this.requireWorld(id);
    return this.serializeWorld(world);
  }

  async getWorldDriftSummary(): Promise<CloudWorldDriftSummary> {
    const worlds = this.filterVisibleWorlds(await this.worldRepo.find({
      order: { updatedAt: "DESC" },
    }));
    const worldIds = worlds.map((world) => world.id);
    const [instances, activeJobs] = await Promise.all([
      worldIds.length
        ? this.instanceRepo.find({
            where: { worldId: In(worldIds) },
          })
        : [],
      worldIds.length
        ? this.jobRepo.find({
            where: {
              worldId: In(worldIds),
              status: In(["pending", "running"]),
            },
            order: {
              createdAt: "DESC",
            },
          })
        : [],
    ]);

    const instanceByWorldId = new Map<string, CloudInstanceEntity>(
      instances.map((instance) => [instance.worldId, instance] as const),
    );
    const activeJobByWorldId = new Map<string, WorldLifecycleJobEntity>();
    for (const job of activeJobs) {
      if (!activeJobByWorldId.has(job.worldId)) {
        activeJobByWorldId.set(job.worldId, job);
      }
    }

    const observedByWorldId = new Map<
      string,
      {
        deploymentState: CloudWorldDeploymentState;
        providerMessage?: string | null;
      }
    >();

    await Promise.all(
      worlds.map(async (world) => {
        const provider = this.computeProviderRegistry.getProvider(
          world.providerKey ?? this.resolveDefaultProviderKey(),
        );
        try {
          const observed = await provider.inspectInstance(
            instanceByWorldId.get(world.id) ?? null,
            world,
          );
          observedByWorldId.set(world.id, {
            deploymentState: observed.deploymentState,
            providerMessage: observed.providerMessage ?? null,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to inspect provider runtime state.";
          observedByWorldId.set(world.id, {
            deploymentState: "error",
            providerMessage: message,
          });
        }
      }),
    );

    let readyWorlds = 0;
    let sleepingWorlds = 0;
    let failedWorlds = 0;
    let criticalAttentionWorlds = 0;
    let warningAttentionWorlds = 0;
    let escalatedWorlds = 0;
    let heartbeatStaleWorlds = 0;
    let providerDriftWorlds = 0;
    let recoveryQueuedWorlds = 0;
    const attentionItems: CloudWorldAttentionItem[] = [];

    for (const world of worlds) {
      if (world.status === "ready") {
        readyWorlds += 1;
      }
      if (world.status === "sleeping") {
        sleepingWorlds += 1;
      }
      if (world.status === "failed") {
        failedWorlds += 1;
      }

      const desiredState =
        world.desiredState === "sleeping" ? "sleeping" : "running";
      const observed = observedByWorldId.get(world.id);
      const activeJob = activeJobByWorldId.get(world.id);
      const hasRecoveryJob =
        activeJob?.jobType === "resume" || activeJob?.jobType === "provision";
      const isHeartbeatStale = this.isHeartbeatStale(world.lastHeartbeatAt);
      const providerRunning =
        observed?.deploymentState === "running" ||
        observed?.deploymentState === "starting";
      const providerMissingOrStopped =
        observed?.deploymentState === "missing" ||
        observed?.deploymentState === "stopped";
      const hasRunningDrift =
        desiredState === "running" && providerMissingOrStopped;
      const hasSleepingDrift = desiredState === "sleeping" && providerRunning;
      const shouldCountHeartbeatStale =
        desiredState === "running" &&
        isHeartbeatStale &&
        (providerRunning || observed?.deploymentState === "package_only") &&
        world.status !== "failed" &&
        world.status !== "disabled" &&
        world.status !== "deleting";

      if (shouldCountHeartbeatStale) {
        heartbeatStaleWorlds += 1;
      }
      if (hasRunningDrift || hasSleepingDrift) {
        providerDriftWorlds += 1;
      }
      if (hasRecoveryJob) {
        recoveryQueuedWorlds += 1;
      }

      const attentionItem = this.buildWorldAttentionItem({
        world,
        desiredState,
        observedDeploymentState: observed?.deploymentState,
        observedMessage: observed?.providerMessage ?? null,
        activeJobType: activeJob ? this.toJobType(activeJob.jobType) : null,
        isHeartbeatStale: shouldCountHeartbeatStale,
      });

      if (attentionItem) {
        if (attentionItem.severity === "critical") {
          criticalAttentionWorlds += 1;
        } else if (attentionItem.severity === "warning") {
          warningAttentionWorlds += 1;
        }
        if (attentionItem.escalated) {
          escalatedWorlds += 1;
        }
        attentionItems.push(attentionItem);
      }
    }

    attentionItems.sort((left, right) => {
      const severityScore =
        this.getAttentionSeverityScore(right.severity) -
        this.getAttentionSeverityScore(left.severity);
      if (severityScore !== 0) {
        return severityScore;
      }

      return (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    });

    return {
      generatedAt: new Date().toISOString(),
      totalWorlds: worlds.length,
      readyWorlds,
      sleepingWorlds,
      failedWorlds,
      attentionWorlds: attentionItems.length,
      criticalAttentionWorlds,
      warningAttentionWorlds,
      escalatedWorlds,
      heartbeatStaleWorlds,
      providerDriftWorlds,
      recoveryQueuedWorlds,
      attentionItems: attentionItems.slice(0, 12),
    };
  }

  async getWorldAlertSummary(worldId: string): Promise<CloudWorldAlertSummary> {
    const world = await this.requireWorld(worldId);
    const instance = await this.instanceRepo.findOne({
      where: { worldId },
    });
    const activeJob = await this.jobRepo.findOne({
      where: {
        worldId,
        status: In(["pending", "running"]),
      },
      order: {
        createdAt: "DESC",
      },
    });
    const provider = this.computeProviderRegistry.getProvider(
      world.providerKey ?? this.resolveDefaultProviderKey(),
    );

    let observedDeploymentState: CloudWorldDeploymentState | undefined;
    let observedMessage: string | null = null;
    try {
      const observed = await provider.inspectInstance(instance, world);
      observedDeploymentState = observed.deploymentState;
      observedMessage = observed.providerMessage ?? null;
    } catch (error) {
      observedDeploymentState = "error";
      observedMessage =
        error instanceof Error
          ? error.message
          : "Failed to inspect provider runtime state.";
    }

    return {
      generatedAt: new Date().toISOString(),
      thresholds: {
        retryCount: this.alertRetryThreshold,
        criticalHeartbeatStaleSeconds: this.criticalHeartbeatStaleSeconds,
      },
      item: this.buildWorldAttentionItem({
        world,
        desiredState:
          world.desiredState === "sleeping" ? "sleeping" : "running",
        observedDeploymentState,
        observedMessage,
        activeJobType: activeJob ? this.toJobType(activeJob.jobType) : null,
        isHeartbeatStale:
          (world.desiredState === "sleeping" ? "sleeping" : "running") ===
            "running" &&
          this.isHeartbeatStale(world.lastHeartbeatAt) &&
          (observedDeploymentState === "running" ||
            observedDeploymentState === "starting" ||
            observedDeploymentState === "package_only") &&
          world.status !== "failed" &&
          world.status !== "disabled" &&
          world.status !== "deleting",
      }),
    };
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
    const world = await this.requireWorld(id);
    const previousPhone = world.phone;

    const hasExplicitProviderChange = payload.providerKey !== undefined;
    const nextProvider = hasExplicitProviderChange
      ? this.computeProviderRegistry.requireProvider(payload.providerKey)
      : this.computeProviderRegistry.getProvider(
          world.providerKey ?? this.resolveDefaultProviderKey(),
        );
    const nextPhone = payload.phone
      ? this.phoneAuthService.normalizePhone(payload.phone)
      : world.phone;
    if (previousPhone !== nextPhone) {
      await this.assertRequestPhoneAvailable(nextPhone, {
        duplicateWorldMessage: "该手机号已经存在云世界记录，不能改绑到这个手机号。",
        duplicateRequestMessage: "该手机号已经存在待处理申请，不能改绑到这个手机号。",
      });
    }
    const nextStatus = payload.status ?? this.toWorldStatus(world.status);
    let nextApiBaseUrl = world.apiBaseUrl;
    if (payload.apiBaseUrl !== undefined) {
      nextApiBaseUrl = this.normalizeOptionalUrl(payload.apiBaseUrl);
    }

    let nextAdminUrl = world.adminUrl;
    if (payload.adminUrl !== undefined) {
      nextAdminUrl = this.normalizeOptionalUrl(payload.adminUrl);
    }

    let nextNote = world.note;
    if (payload.note !== undefined) {
      nextNote = this.normalizeOptionalText(payload.note);
    }
    const nextProvisionStrategy =
      payload.provisionStrategy !== undefined
        ? payload.provisionStrategy?.trim() ||
          nextProvider.summary.provisionStrategy
        : hasExplicitProviderChange
          ? nextProvider.summary.provisionStrategy
          : world.provisionStrategy || nextProvider.summary.provisionStrategy;
    if (nextStatus === "ready" && !nextApiBaseUrl) {
      throw new BadRequestException(
        "世界进入 ready 状态时必须提供 apiBaseUrl。",
      );
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
          ? (nextProvider.summary.defaultRegion ?? null)
          : world.providerRegion;
    world.providerZone =
      payload.providerZone !== undefined
        ? payload.providerZone?.trim() || null
        : hasExplicitProviderChange
          ? (nextProvider.summary.defaultZone ?? null)
          : world.providerZone;
    world.apiBaseUrl = nextApiBaseUrl;
    world.adminUrl = nextAdminUrl;
    world.note = nextNote;
    world.failureCode =
      nextStatus === "failed" ? (world.failureCode ?? "manual_failure") : null;
    world.failureMessage =
      nextStatus === "failed"
        ? (world.failureMessage ?? "管理员手动将世界标记为失败。")
        : null;
    world.healthStatus =
      nextStatus === "ready"
        ? "healthy"
        : nextStatus === "sleeping"
          ? "sleeping"
          : world.healthStatus;
    await this.worldRepo.save(world);
    if (previousPhone !== world.phone) {
      await this.waitingSessionSyncService.invalidateWaitingSessionsForPhone(
        previousPhone,
        "cloud.updateWorld",
      );
    }
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "cloud.updateWorld",
    );

    return this.serializeWorld(world);
  }

  async listJobs(filters?: WorldLifecycleJobFilters) {
    if (filters?.worldId) {
      await this.requireWorld(filters.worldId);
    }

    const jobs = await this.createJobQueryBuilder(filters)
      .take(filters?.worldId ? 20 : 100)
      .getMany();
    return jobs.map((job) => this.serializeJob(job));
  }

  async listWaitingSessionSyncTasks(filters?: {
    status?: CloudWaitingSessionSyncTaskStatus;
    taskType?: CloudWaitingSessionSyncTaskType;
    query?: string;
    page?: number;
    pageSize?: number;
  }): Promise<CloudWaitingSessionSyncTaskListResponse> {
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const pageSize =
      filters?.pageSize && filters.pageSize > 0
        ? Math.min(filters.pageSize, 100)
        : 20;

    const queryBuilder = this.createWaitingSessionSyncTaskQueryBuilder(filters)
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await queryBuilder.getManyAndCount();
    return {
      items: items.map((item) => this.serializeWaitingSessionSyncTask(item)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async replayFailedWaitingSessionSyncTasks(
    taskIds: string[],
  ): Promise<ReplayFailedCloudWaitingSessionSyncTasksResponse> {
    return this.waitingSessionSyncService.replayFailedTasks(taskIds);
  }

  async clearFailedWaitingSessionSyncTasks(
    taskIds: string[],
  ): Promise<ClearFailedCloudWaitingSessionSyncTasksResponse> {
    return this.waitingSessionSyncService.clearFailedTasks(taskIds);
  }

  async replayFilteredFailedWaitingSessionSyncTasks(filters?: {
    taskType?: CloudWaitingSessionSyncTaskType;
    query?: string;
  }): Promise<ReplayFilteredFailedCloudWaitingSessionSyncTasksResponse> {
    const matchedTaskIds = await this.listWaitingSessionSyncTaskIds({
      status: "failed",
      taskType: filters?.taskType,
      query: filters?.query,
    });
    if (matchedTaskIds.length === 0) {
      return {
        success: true,
        matchedCount: 0,
        replayedCount: 0,
        skippedCount: 0,
      };
    }

    const result =
      await this.waitingSessionSyncService.replayFailedTasks(matchedTaskIds);
    return {
      success: true,
      matchedCount: matchedTaskIds.length,
      replayedCount: result.replayedTaskIds.length,
      skippedCount: result.skippedTaskIds.length,
    };
  }

  async clearFilteredFailedWaitingSessionSyncTasks(filters?: {
    taskType?: CloudWaitingSessionSyncTaskType;
    query?: string;
  }): Promise<ClearFilteredFailedCloudWaitingSessionSyncTasksResponse> {
    const matchedTaskIds = await this.listWaitingSessionSyncTaskIds({
      status: "failed",
      taskType: filters?.taskType,
      query: filters?.query,
    });
    if (matchedTaskIds.length === 0) {
      return {
        success: true,
        matchedCount: 0,
        clearedCount: 0,
        skippedCount: 0,
      };
    }

    const result =
      await this.waitingSessionSyncService.clearFailedTasks(matchedTaskIds);
    return {
      success: true,
      matchedCount: matchedTaskIds.length,
      clearedCount: result.clearedTaskIds.length,
      skippedCount: result.skippedTaskIds.length,
    };
  }

  async getJobById(id: string) {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException("找不到该生命周期任务。");
    }

    try {
      await this.requireWorld(job.worldId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException("找不到该生命周期任务。");
      }
      throw error;
    }
    return this.serializeJob(job);
  }

  async getWorldInstance(worldId: string) {
    await this.requireWorld(worldId);
    const instance = await this.instanceRepo.findOne({
      where: { worldId },
    });
    return instance ? this.serializeInstance(instance) : null;
  }

  async getWorldBootstrapConfig(
    worldId: string,
  ): Promise<CloudWorldBootstrapConfig> {
    const world = await this.requireWorld(worldId);
    const preparedWorld = await this.ensureWorldBootstrapCredentials(world);
    return buildWorldBootstrapConfig(preparedWorld, this.configService);
  }

  async getWorldRuntimeStatus(
    worldId: string,
  ): Promise<CloudWorldRuntimeStatusSummary> {
    const world = await this.requireWorld(worldId);
    const instance = await this.instanceRepo.findOne({
      where: { worldId },
    });
    const provider = this.computeProviderRegistry.getProvider(
      world.providerKey ?? this.resolveDefaultProviderKey(),
    );
    const observedStatus = await provider.inspectInstance(instance, world);

    return {
      worldId: world.id,
      providerKey: observedStatus.providerKey ?? provider.key,
      deploymentMode:
        observedStatus.deploymentMode ?? provider.summary.deploymentMode,
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

  async reconcileWorld(worldId: string) {
    await this.requireWorld(worldId);
    const reconciledWorld =
      await this.worldLifecycleWorker.reconcileWorldNow(worldId);
    if (!reconciledWorld) {
      throw new NotFoundException("找不到该云世界。");
    }

    return this.serializeWorld(reconciledWorld);
  }

  async rotateWorldCallbackToken(
    worldId: string,
  ): Promise<CloudWorldBootstrapConfig> {
    const world = await this.requireWorld(worldId);
    world.callbackToken = randomUUID();
    if (!world.slug) {
      world.slug = createCloudWorldSlug(world.phone);
    }
    const savedWorld = await this.worldRepo.save(world);
    return buildWorldBootstrapConfig(savedWorld, this.configService);
  }

  async resumeWorld(id: string) {
    const world = await this.requireWorld(id);
    if (world.status === "disabled" || world.status === "deleting") {
      throw new BadRequestException("当前世界不可唤起。");
    }
    if (
      world.status === "ready" ||
      world.status === "starting" ||
      world.status === "bootstrapping" ||
      world.status === "creating"
    ) {
      return this.serializeWorld(world);
    }

    const jobType = await this.chooseRecoveryJobType(world.id);
    world.status = jobType === "resume" ? "starting" : "queued";
    world.desiredState = "running";
    world.healthStatus = jobType === "resume" ? "starting" : "queued";
    world.healthMessage =
      jobType === "resume"
        ? "管理员手动唤起该世界。"
        : "管理员手动重建该世界。";
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.ensureLifecycleJob(world.id, jobType, {
      source: "admin-resume",
    });
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "cloud.resumeWorld",
    );
    return this.serializeWorld(world);
  }

  async suspendWorld(id: string) {
    const world = await this.requireWorld(id);
    const currentStatus = this.toWorldStatus(world.status);
    if (currentStatus === "disabled" || currentStatus === "deleting") {
      throw new BadRequestException("当前世界不可休眠。");
    }
    if (currentStatus === "sleeping" || currentStatus === "stopping") {
      return this.serializeWorld(world);
    }
    if (currentStatus !== "ready" && currentStatus !== "starting") {
      throw new BadRequestException("只有处于活跃中的世界才可以进入休眠。");
    }

    world.status = "stopping";
    world.desiredState = "sleeping";
    world.healthStatus = "stopping";
    world.healthMessage = "管理员正在让世界休眠。";
    await this.worldRepo.save(world);
    await this.ensureLifecycleJob(world.id, "suspend", {
      source: "admin-suspend",
    });
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "cloud.suspendWorld",
    );
    return this.serializeWorld(world);
  }

  async retryWorld(id: string) {
    const world = await this.requireWorld(id);
    const currentStatus = this.toWorldStatus(world.status);
    if (currentStatus === "disabled" || currentStatus === "deleting") {
      throw new BadRequestException("当前世界不可重试。");
    }
    if (
      currentStatus !== "failed" &&
      currentStatus !== "queued" &&
      currentStatus !== "creating" &&
      currentStatus !== "bootstrapping" &&
      currentStatus !== "starting"
    ) {
      throw new BadRequestException("当前世界状态不支持重试。");
    }

    const jobType = await this.chooseRecoveryJobType(world.id);
    world.status = jobType === "resume" ? "starting" : "queued";
    world.desiredState = "running";
    world.healthStatus = jobType === "resume" ? "starting" : "queued";
    world.healthMessage =
      jobType === "resume" ? "正在重试唤起该世界。" : "正在重试创建该世界。";
    world.failureCode = null;
    world.failureMessage = null;
    await this.worldRepo.save(world);
    await this.ensureLifecycleJob(world.id, jobType, {
      source: "admin-retry",
    });
    await this.waitingSessionSyncService.refreshWaitingSessionsForWorld(
      world.id,
      "cloud.retryWorld",
    );
    return this.serializeWorld(world);
  }

  private async syncWorldForRequest(
    request: CloudWorldRequestEntity,
    payload: {
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
      previousPhone?: string;
    },
    repos: Pick<CloudRequestWriteRepositories, "worldRepo"> = {
      worldRepo: this.worldRepo,
    },
  ) {
    const [currentWorld, previousWorld] = await Promise.all([
      repos.worldRepo.findOne({
        where: { phone: request.phone },
      }),
      payload.previousPhone && payload.previousPhone !== request.phone
        ? repos.worldRepo.findOne({
            where: { phone: payload.previousPhone },
          })
        : Promise.resolve(null),
    ]);
    let world = currentWorld ?? previousWorld;
    const requestStatus = this.toRequestStatus(request.status);

    if (
      currentWorld &&
      previousWorld &&
      previousWorld.id !== currentWorld.id &&
      this.isRequestGatePlaceholderWorld(previousWorld)
    ) {
      await repos.worldRepo.delete({ id: previousWorld.id });
    }

    const syncDecision = getRequestWorldSyncDecision({
      requestStatus,
      hasWorld: !!world,
      hasGatePlaceholderWorld: !!world && this.isRequestGatePlaceholderWorld(world),
    });

    if (syncDecision.action === "sync_gate_placeholder") {
      if (world) {
        await this.syncRequestGatePlaceholderWorld(world, request, repos.worldRepo);
      }
      return;
    }

    if (syncDecision.action === "delete_gate_placeholder") {
      if (world) {
        await repos.worldRepo.delete({ id: world.id });
      }
      return;
    }

    if (syncDecision.action === "skip") {
      return;
    }

    const worldProjection = getRequestVisibleWorldProjection(
      requestStatus,
      request.note,
    );

    if (!world) {
      const provider = this.computeProviderRegistry.getProvider(
        this.resolveDefaultProviderKey(),
      );
      world = this.worldRepo.create({
        phone: request.phone,
        name: request.worldName,
        status: worldProjection.worldStatus,
        slug: createCloudWorldSlug(request.phone),
        desiredState: worldProjection.desiredState,
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
    world.status = worldProjection.worldStatus;
    world.desiredState = worldProjection.desiredState;
    world.note = request.note ?? null;

    if (!world.slug) {
      world.slug = createCloudWorldSlug(request.phone);
    }
    if (!world.callbackToken) {
      world.callbackToken = randomUUID();
    }

    if (payload.adminUrl !== undefined) {
      world.adminUrl = payload.adminUrl;
    }

    if (requestStatus === "active") {
      const nextApiBaseUrl =
        payload.apiBaseUrl !== undefined
          ? payload.apiBaseUrl
          : world.apiBaseUrl;
      if (!nextApiBaseUrl) {
        throw new BadRequestException("激活云世界时必须提供 apiBaseUrl。");
      }
      world.apiBaseUrl = nextApiBaseUrl;
    } else if (payload.apiBaseUrl !== undefined) {
      world.apiBaseUrl = payload.apiBaseUrl;
    }

    world.healthStatus = worldProjection.healthStatus;
    world.healthMessage = worldProjection.healthMessage;
      world.failureCode = worldProjection.failureCode;
      world.failureMessage = worldProjection.failureMessage;

    await repos.worldRepo.save(world);
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

  private serializeRequest(
    request: CloudWorldRequestEntity,
    world?: CloudWorldEntity | null,
  ): CloudWorldRequestRecord {
    const visibleWorld = this.toVisibleWorld(world);
    const requestStatus = this.toRequestStatus(request.status);
    const requestProjection = getRequestRecordProjection(
      requestStatus,
      request.note,
    );
    return {
      id: request.id,
      phone: request.phone,
      worldName: request.worldName,
      status: requestStatus,
      displayStatus: requestProjection.displayStatus,
      failureReason: requestProjection.failureReason,
      projectedWorldStatus: requestProjection.projectedWorldStatus,
      projectedDesiredState: requestProjection.projectedDesiredState,
      apiBaseUrl: visibleWorld?.apiBaseUrl ?? null,
      adminUrl: visibleWorld?.adminUrl ?? null,
      note: request.note,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private serializeJob(job: WorldLifecycleJobEntity): WorldLifecycleJobSummary {
    const leaseRemainingSeconds = job.leaseExpiresAt
      ? Math.max(
          0,
          Math.ceil((job.leaseExpiresAt.getTime() - Date.now()) / 1000),
        )
      : null;
    const supersededMetadata = getSupersededLifecycleJobMetadata(job);

    return {
      id: job.id,
      worldId: job.worldId,
      jobType: this.toJobType(job.jobType),
      status: this.toJobStatus(job.status),
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      availableAt: job.availableAt?.toISOString() ?? null,
      leaseOwner: job.leaseOwner,
      leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
      leaseRemainingSeconds,
      failureCode: job.failureCode,
      failureMessage: job.failureMessage,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      payload: job.payload,
      resultPayload: job.resultPayload,
      supersededByJobType: supersededMetadata?.supersededByJobType ?? null,
      supersededByPayload: supersededMetadata?.supersededByPayload ?? null,
    };
  }

  private serializeWaitingSessionSyncTask(
    task: WaitingSessionSyncTaskEntity,
  ): CloudWaitingSessionSyncTaskSummary {
    const leaseRemainingSeconds = task.leaseExpiresAt
      ? Math.max(
          0,
          Math.ceil((task.leaseExpiresAt.getTime() - Date.now()) / 1000),
        )
      : null;

    return {
      id: task.id,
      taskKey: task.taskKey,
      taskType: this.toWaitingSessionSyncTaskType(task.taskType),
      targetValue: task.targetValue,
      context: task.context,
      status: this.toWaitingSessionSyncTaskStatus(task.status),
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      availableAt: task.availableAt.toISOString(),
      leaseOwner: task.leaseOwner,
      leaseExpiresAt: task.leaseExpiresAt?.toISOString() ?? null,
      leaseRemainingSeconds,
      lastError: task.lastError,
      finishedAt: task.finishedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private createWaitingSessionSyncTaskQueryBuilder(
    filters?: WaitingSessionSyncTaskFilters,
  ) {
    const queryBuilder = this.waitingSessionSyncTaskRepo
      .createQueryBuilder("task")
      .orderBy("task.updatedAt", "DESC")
      .addOrderBy("task.createdAt", "DESC");
    this.applyWaitingSessionSyncTaskFilters(queryBuilder, filters);
    return queryBuilder;
  }

  private applyWaitingSessionSyncTaskFilters(
    queryBuilder: ReturnType<Repository<WaitingSessionSyncTaskEntity>["createQueryBuilder"]>,
    filters?: WaitingSessionSyncTaskFilters,
  ) {
    if (filters?.status) {
      queryBuilder.andWhere("task.status = :status", {
        status: filters.status,
      });
    }
    if (filters?.taskType) {
      queryBuilder.andWhere("task.taskType = :taskType", {
        taskType: filters.taskType,
      });
    }
    if (filters?.query?.trim()) {
      const query = `%${filters.query.trim().toLowerCase()}%`;
      queryBuilder.andWhere(
        `(
          LOWER(task.taskKey) LIKE :query OR
          LOWER(task.targetValue) LIKE :query OR
          LOWER(task.context) LIKE :query OR
          LOWER(COALESCE(task.lastError, '')) LIKE :query
        )`,
        { query },
      );
    }
  }

  private async listWaitingSessionSyncTaskIds(
    filters?: WaitingSessionSyncTaskFilters,
  ) {
    const tasks = await this.createWaitingSessionSyncTaskQueryBuilder(filters)
      .select("task.id", "id")
      .getRawMany<{ id: string }>();
    return tasks.map((task) => task.id);
  }

  private createJobQueryBuilder(filters?: WorldLifecycleJobFilters) {
    const queryBuilder = this.jobRepo
      .createQueryBuilder("job")
      .orderBy("job.updatedAt", "DESC")
      .addOrderBy("job.createdAt", "DESC");
    this.applyJobFilters(queryBuilder, filters);
    return queryBuilder;
  }

  private applyJobFilters(
    queryBuilder: ReturnType<Repository<WorldLifecycleJobEntity>["createQueryBuilder"]>,
    filters?: WorldLifecycleJobFilters,
  ) {
    queryBuilder.innerJoin(CloudWorldEntity, "world", "world.id = job.worldId");

    if (!filters?.worldId) {
      queryBuilder.andWhere(
        new Brackets((placeholderQuery) => {
          placeholderQuery.where(
            `NOT (
              world.status = :requestGatePlaceholderStatus AND
              world.failureCode IN (:...requestGateFailureCodes) AND
              COALESCE(world.apiBaseUrl, '') = '' AND
              COALESCE(world.adminUrl, '') = '' AND
              world.lastAccessedAt IS NULL AND
              world.lastInteractiveAt IS NULL AND
              world.lastBootedAt IS NULL AND
              world.lastHeartbeatAt IS NULL AND
              world.lastSuspendedAt IS NULL
            )`,
            {
              requestGatePlaceholderStatus: "disabled",
              requestGateFailureCodes: REQUEST_GATE_FAILURE_CODES,
            },
          );
        }),
      );
    }

    if (filters?.worldId) {
      queryBuilder.andWhere("job.worldId = :worldId", {
        worldId: filters.worldId,
      });
    }
    if (filters?.status) {
      queryBuilder.andWhere("job.status = :status", {
        status: filters.status,
      });
    }
    if (filters?.jobType) {
      queryBuilder.andWhere("job.jobType = :jobType", {
        jobType: filters.jobType,
      });
    }
    if (filters?.provider) {
      if (filters.provider === UNASSIGNED_PROVIDER_FILTER) {
        queryBuilder.andWhere(
          "(world.providerKey IS NULL OR TRIM(world.providerKey) = '')",
        );
      } else {
        queryBuilder.andWhere("world.providerKey = :providerKey", {
          providerKey: filters.provider,
        });
      }
    }
    if (filters?.queueState === "running_now") {
      queryBuilder.andWhere("job.status = :runningJobStatus", {
        runningJobStatus: "running",
      });
    }
    if (filters?.queueState === "lease_expired") {
      queryBuilder.andWhere("job.failureCode = :leaseExpiredFailureCode", {
        leaseExpiredFailureCode: "lease_expired",
      });
    }
    if (filters?.queueState === "delayed") {
      queryBuilder
        .andWhere("job.status = :pendingJobStatus", {
          pendingJobStatus: "pending",
        })
        .andWhere("job.availableAt IS NOT NULL")
        .andWhere("datetime(job.availableAt) > datetime(:queueDelayedNow)", {
          queueDelayedNow: new Date().toISOString(),
        });
    }

    this.applyJobAuditFilters(queryBuilder, filters);
    this.applyJobSearchFilter(queryBuilder, filters);
  }

  private applyJobAuditFilters(
    queryBuilder: ReturnType<Repository<WorldLifecycleJobEntity>["createQueryBuilder"]>,
    filters?: Pick<WorldLifecycleJobFilters, "audit" | "supersededBy">,
  ) {
    if (filters?.audit === "superseded" || filters?.supersededBy) {
      queryBuilder.andWhere(
        new Brackets((auditQuery) => {
          auditQuery
            .where("job.failureCode = :supersededFailureCode", {
              supersededFailureCode: "superseded_by_new_job",
            })
            .orWhere(
              "json_extract(job.resultPayload, '$.action') = :supersededAction",
              {
                supersededAction: "superseded_by_new_job",
              },
            );
        }),
      );
    }

    if (filters?.supersededBy) {
      queryBuilder.andWhere(
        "json_extract(job.resultPayload, '$.supersededByJobType') = :supersededByJobType",
        {
          supersededByJobType: filters.supersededBy,
        },
      );
    }
  }

  private applyJobSearchFilter(
    queryBuilder: ReturnType<Repository<WorldLifecycleJobEntity>["createQueryBuilder"]>,
    filters?: Pick<WorldLifecycleJobFilters, "query">,
  ) {
    if (!filters?.query?.trim()) {
      return;
    }

    const query = `%${filters.query.trim().toLowerCase()}%`;
    queryBuilder.andWhere(
      `(
        LOWER(job.id) LIKE :query OR
        LOWER(job.worldId) LIKE :query OR
        LOWER(job.jobType) LIKE :query OR
        LOWER(job.status) LIKE :query OR
        LOWER(COALESCE(job.leaseOwner, '')) LIKE :query OR
        LOWER(COALESCE(job.failureCode, '')) LIKE :query OR
        LOWER(COALESCE(job.failureMessage, '')) LIKE :query OR
        LOWER(COALESCE(json_extract(job.resultPayload, '$.supersededByJobType'), '')) LIKE :query OR
        LOWER(world.name) LIKE :query OR
        LOWER(world.phone) LIKE :query OR
        LOWER(COALESCE(world.providerKey, '')) LIKE :query
      )`,
      { query },
    );
  }

  private serializeInstance(
    instance: CloudInstanceEntity,
  ): CloudInstanceSummary {
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

  private async requireWorld(
    id: string,
    options?: { includePlaceholder?: boolean },
  ) {
    const world = await this.worldRepo.findOne({ where: { id } });
    if (
      !world ||
      (!options?.includePlaceholder &&
        this.isRequestGatePlaceholderWorld(world))
    ) {
      throw new NotFoundException("找不到该云世界。");
    }

    return world;
  }

  private async ensureLifecycleJob(
    worldId: string,
    jobType: WorldLifecycleJobType,
    payload: Record<string, unknown>,
  ) {
    return ensureUniqueActiveLifecycleJob(this.jobRepo, {
      worldId,
      jobType,
      create: () =>
        this.jobRepo.create({
          worldId,
          jobType,
          status: "pending",
          priority:
            jobType === "resume" ? 50 : jobType === "suspend" ? 80 : 100,
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
    });
  }

  private async chooseRecoveryJobType(
    worldId: string,
  ): Promise<WorldLifecycleJobType> {
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

    return new Map(
      this.filterVisibleWorlds(worlds).map((world) => [world.phone, world]),
    );
  }

  private toVisibleWorld(world?: CloudWorldEntity | null) {
    if (!world || this.isRequestGatePlaceholderWorld(world)) {
      return null;
    }

    return world;
  }

  private filterVisibleWorlds(worlds: CloudWorldEntity[]) {
    return worlds.filter((world) => !this.isRequestGatePlaceholderWorld(world));
  }

  private async loadVisibleWorldIdSet(worldIds: string[]) {
    const uniqueWorldIds = Array.from(new Set(worldIds));
    if (uniqueWorldIds.length === 0) {
      return new Set<string>();
    }

    const worlds = await this.worldRepo.find({
      where: { id: In(uniqueWorldIds) },
    });
    return new Set(this.filterVisibleWorlds(worlds).map((world) => world.id));
  }

  private async assertRequestPhoneAvailable(
    phone: string,
    options: {
      excludeRequestId?: string;
      duplicateWorldMessage: string;
      duplicateRequestMessage: string;
    },
    repos: CloudRequestWriteRepositories = {
      worldRepo: this.worldRepo,
      requestRepo: this.requestRepo,
    },
  ) {
    let [world, requests] = await Promise.all([
      repos.worldRepo.findOne({
        where: { phone },
      }),
      repos.requestRepo.find({
        where: { phone },
        order: { updatedAt: "DESC" },
      }),
    ]);
    const latestRequest =
      requests.find((item) => item.id !== options?.excludeRequestId) ?? null;

    switch (getRequestPhoneAvailability({ world, latestRequest })) {
      case "cleanup_rejected_placeholder":
        if (world) {
          await repos.worldRepo.delete({ id: world.id });
        }
        return;
      case "conflict_world":
        throw new BadRequestException(options.duplicateWorldMessage);
      case "conflict_request":
        throw new BadRequestException(options.duplicateRequestMessage);
      case "available":
      default:
        return;
    }
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
      case "reconcile":
      case "resume":
      case "suspend":
      case "provision":
        return value;
      default:
        throw new BadRequestException("不支持的任务类型。");
    }
  }

  private toWaitingSessionSyncTaskStatus(
    value: string,
  ): CloudWaitingSessionSyncTaskStatus {
    switch (value) {
      case "pending":
      case "running":
      case "failed":
        return value;
      default:
        throw new BadRequestException("不支持的 waiting session 补偿任务状态。");
    }
  }

  private toWaitingSessionSyncTaskType(
    value: string,
  ): CloudWaitingSessionSyncTaskType {
    switch (value) {
      case "refresh_phone":
      case "invalidate_phone":
      case "refresh_world":
        return value;
      default:
        throw new BadRequestException("不支持的 waiting session 补偿任务类型。");
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
    const provider = this.computeProviderRegistry.getProvider(
      world.providerKey ?? this.resolveDefaultProviderKey(),
    );

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
      world.slug = createCloudWorldSlug(world.phone);
      dirty = true;
    }
    if (!world.callbackToken) {
      world.callbackToken = randomUUID();
      dirty = true;
    }
    if (!world.apiBaseUrl) {
      const suggestedApiBaseUrl = resolveSuggestedWorldApiBaseUrl(
        world,
        this.configService,
      );
      if (suggestedApiBaseUrl) {
        world.apiBaseUrl = suggestedApiBaseUrl;
        dirty = true;
      }
    }
    if (!world.adminUrl) {
      const suggestedAdminUrl = resolveSuggestedWorldAdminUrl(
        world,
        this.configService,
      );
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

  private normalizeOptionalUrl(value: string | null): string | null;
  private normalizeOptionalUrl(value: undefined): undefined;
  private normalizeOptionalUrl(value?: string | null) {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return normalized.replace(/\/+$/, "");
  }

  private resolveDefaultProviderKey() {
    return this.computeProviderRegistry.getDefaultProviderKey();
  }

  private isRequestGatePlaceholderWorld(
    world: CloudWorldEntity,
  ) {
    return isRequestGatePlaceholder(world);
  }

  private async syncRequestGatePlaceholderWorld(
    world: CloudWorldEntity,
    request: Pick<
      CloudWorldRequestEntity,
      "phone" | "worldName" | "note" | "status"
    >,
    worldRepo: Repository<CloudWorldEntity> = this.worldRepo,
  ) {
    const state = getRequestGateState(this.toRequestStatus(request.status), request.note);
    const provider = this.computeProviderRegistry.getProvider(
      world.providerKey ?? this.resolveDefaultProviderKey(),
    );
    world.phone = request.phone;
    world.name = request.worldName;
    world.status = "disabled";
    world.desiredState = "sleeping";
    world.provisionStrategy =
      world.provisionStrategy || provider.summary.provisionStrategy;
    world.providerKey = world.providerKey || provider.key;
    world.providerRegion =
      world.providerRegion ?? provider.summary.defaultRegion ?? null;
    world.providerZone =
      world.providerZone ?? provider.summary.defaultZone ?? null;
    world.slug = world.slug || createCloudWorldSlug(request.phone);
    world.callbackToken = world.callbackToken || randomUUID();
    world.apiBaseUrl = null;
    world.adminUrl = null;
    world.healthStatus = state.placeholderHealthStatus;
    world.healthMessage = state.displayStatus;
    world.failureCode = state.failureCode;
    world.failureMessage = state.failureReason;
    world.lastAccessedAt = null;
    world.lastInteractiveAt = null;
    world.lastBootedAt = null;
    world.lastHeartbeatAt = null;
    world.lastSuspendedAt = null;
    world.retryCount = 0;
    world.note = request.note ?? null;
    await worldRepo.save(world);
  }

  private getCloudRequestWriteRepositories(
    manager: EntityManager,
  ): CloudRequestWriteRepositories {
    return {
      worldRepo: manager.getRepository(CloudWorldEntity),
      requestRepo: manager.getRepository(CloudWorldRequestEntity),
    };
  }

  private normalizeOptionalText(value: string | null): string | null;
  private normalizeOptionalText(value: undefined): undefined;
  private normalizeOptionalText(value?: string | null) {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private buildWorldAttentionItem(params: {
    world: CloudWorldEntity;
    desiredState: "running" | "sleeping";
    observedDeploymentState?: CloudWorldDeploymentState;
    observedMessage?: string | null;
    activeJobType: WorldLifecycleJobType | null;
    isHeartbeatStale: boolean;
  }): CloudWorldAttentionItem | null {
    const {
      world,
      desiredState,
      observedDeploymentState,
      observedMessage,
      activeJobType,
      isHeartbeatStale,
    } = params;
    const staleHeartbeatSeconds = this.getHeartbeatAgeSeconds(
      world.lastHeartbeatAt,
    );
    const retryThresholdReached =
      this.alertRetryThreshold > 0 &&
      world.retryCount >= this.alertRetryThreshold;
    const heartbeatThresholdReached =
      isHeartbeatStale &&
      this.criticalHeartbeatStaleSeconds > 0 &&
      staleHeartbeatSeconds !== null &&
      staleHeartbeatSeconds >= this.criticalHeartbeatStaleSeconds;
    const baseItem = {
      worldId: world.id,
      worldName: world.name,
      phone: world.phone,
      worldStatus: this.toWorldStatus(world.status),
      escalated: false,
      escalationReason: null,
      desiredState,
      providerKey: world.providerKey,
      observedDeploymentState,
      activeJobType,
      retryCount: world.retryCount,
      staleHeartbeatSeconds,
      lastHeartbeatAt: world.lastHeartbeatAt?.toISOString() ?? null,
      updatedAt: world.updatedAt.toISOString(),
    } satisfies Omit<
      CloudWorldAttentionItem,
      "severity" | "reason" | "message"
    >;

    if (world.status === "failed" || world.healthStatus === "failed") {
      return {
        ...baseItem,
        severity: "critical",
        reason: "failed_world",
        escalated: true,
        escalationReason: "world_failed",
        message:
          world.failureMessage ??
          world.healthMessage ??
          "World is currently marked as failed.",
      };
    }

    if (observedDeploymentState === "error") {
      return {
        ...baseItem,
        severity: "critical",
        reason: "provider_error",
        escalated: true,
        escalationReason: "provider_error",
        message:
          observedMessage ?? "Provider inspection reported a deployment error.",
      };
    }

    if (
      desiredState === "running" &&
      (observedDeploymentState === "missing" ||
        observedDeploymentState === "stopped")
    ) {
      const escalated = retryThresholdReached;
      return {
        ...baseItem,
        severity: escalated
          ? "critical"
          : activeJobType === "resume" || activeJobType === "provision"
            ? "warning"
            : "critical",
        reason:
          activeJobType === "resume" || activeJobType === "provision"
            ? "recovery_queued"
            : "deployment_drift",
        escalated,
        escalationReason: this.resolveEscalationReason(
          escalated,
          "retry_threshold",
        ),
        message:
          activeJobType === "resume" || activeJobType === "provision"
            ? escalated
              ? `Provider reports ${observedDeploymentState}; ${activeJobType} is queued, but retry threshold has been exceeded.`
              : `Provider reports ${observedDeploymentState}; ${activeJobType} has already been queued.`
            : escalated
              ? `Provider reports ${observedDeploymentState} while the world should be running, and retry threshold has been exceeded.`
              : `Provider reports ${observedDeploymentState} while the world should be running.`,
      };
    }

    if (
      desiredState === "sleeping" &&
      (observedDeploymentState === "running" ||
        observedDeploymentState === "starting")
    ) {
      return {
        ...baseItem,
        severity: "warning",
        reason: "sleep_drift",
        escalated: false,
        escalationReason: null,
        message:
          "Provider reports the deployment is still active while desired state is sleeping.",
      };
    }

    if (isHeartbeatStale) {
      const escalated = heartbeatThresholdReached;
      return {
        ...baseItem,
        severity:
          escalated || world.status === "ready" ? "critical" : "warning",
        reason: "heartbeat_stale",
        escalated,
        escalationReason: this.resolveEscalationReason(
          escalated,
          "heartbeat_duration",
        ),
        message:
          escalated && staleHeartbeatSeconds !== null
            ? `Runtime heartbeat has been stale for ${staleHeartbeatSeconds}s and crossed the critical threshold.`
            : world.status === "ready"
              ? "Runtime heartbeat is stale even though the world still appears active."
              : "Runtime heartbeat is stale while the world is still starting.",
      };
    }

    return null;
  }

  private getAttentionSeverityScore(
    severity: CloudWorldAttentionItem["severity"],
  ) {
    switch (severity) {
      case "critical":
        return 3;
      case "warning":
        return 2;
      case "info":
      default:
        return 1;
    }
  }

  private isHeartbeatStale(lastHeartbeatAt: Date | null) {
    if (this.staleHeartbeatSeconds <= 0) {
      return false;
    }
    if (!lastHeartbeatAt) {
      return true;
    }

    return (
      Date.now() - lastHeartbeatAt.getTime() > this.staleHeartbeatSeconds * 1000
    );
  }

  private getHeartbeatAgeSeconds(lastHeartbeatAt: Date | null) {
    if (!lastHeartbeatAt) {
      return null;
    }

    return Math.max(
      0,
      Math.floor((Date.now() - lastHeartbeatAt.getTime()) / 1000),
    );
  }

  private resolveEscalationReason(
    escalated: boolean,
    reason: CloudWorldAttentionEscalationReason,
  ) {
    return escalated ? reason : null;
  }

  private parsePositiveInteger(rawValue: string | undefined, fallback = 0) {
    const parsed = Number(rawValue ?? "0");
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }
}
