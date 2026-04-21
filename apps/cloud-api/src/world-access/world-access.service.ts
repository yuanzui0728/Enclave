import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  ResolveWorldAccessRequest,
  ResolveWorldAccessResponse,
  WorldAccessSessionSummary,
  WorldAccessSessionStatus,
  WorldLifecycleJobType,
  WorldAccessPhase,
  CloudWorldRequestStatus,
} from "@yinjie/contracts";
import { randomUUID } from "node:crypto";
import { In, Repository } from "typeorm";
import { PhoneAuthService } from "../auth/phone-auth.service";
import { createCloudWorldSlug } from "../cloud-world-slug";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { CloudWorldRequestEntity } from "../entities/cloud-world-request.entity";
import { WorldAccessSessionEntity } from "../entities/world-access-session.entity";
import { WorldLifecycleJobEntity } from "../entities/world-lifecycle-job.entity";
import { ComputeProviderRegistryService } from "../providers/compute-provider-registry.service";
import { isRequestGatePlaceholderWorld } from "../request-gate-placeholder";
import { getRequestGateState } from "../request-gate-state";
import { getRequestVisibleWorldProjection } from "../request-world-sync-state";
import { buildWorldAccessSnapshot, type WorldAccessSnapshot } from "./world-access-state";

const PHONE_CHANGE_INVALIDATED_ACCESS_SESSION_REASON =
  "该申请绑定的手机号已变更，请使用新的手机号重新发起进入。";

@Injectable()
export class WorldAccessService {
  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(CloudInstanceEntity)
    private readonly instanceRepo: Repository<CloudInstanceEntity>,
    @InjectRepository(CloudWorldRequestEntity)
    private readonly requestRepo: Repository<CloudWorldRequestEntity>,
    @InjectRepository(WorldLifecycleJobEntity)
    private readonly jobRepo: Repository<WorldLifecycleJobEntity>,
    @InjectRepository(WorldAccessSessionEntity)
    private readonly accessSessionRepo: Repository<WorldAccessSessionEntity>,
    private readonly computeProviderRegistry: ComputeProviderRegistryService,
    private readonly phoneAuthService: PhoneAuthService,
  ) {}

  async resolveWorldAccessByPhone(phone: string, payload: ResolveWorldAccessRequest): Promise<ResolveWorldAccessResponse> {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const now = new Date();

    let [world, latestRequest] = await Promise.all([
      this.worldRepo.findOne({
        where: { phone: normalizedPhone },
      }),
      this.requestRepo.findOne({
        where: { phone: normalizedPhone },
        order: { updatedAt: "DESC" },
      }),
    ]);

    if (this.shouldGateWorldAccess(latestRequest)) {
      if (!world || isRequestGatePlaceholderWorld(world)) {
        world = await this.ensureRequestGatePlaceholderWorld(
          normalizedPhone,
          latestRequest,
          world,
        );
      }

      const session = await this.createAccessSession(
        world,
        payload,
        now,
        this.buildRequestGateSnapshot(latestRequest),
      );
      return this.serializeAccessSession(session, world, {
        hideWorldId: true,
      });
    }

    if (world && isRequestGatePlaceholderWorld(world)) {
      world = await this.restoreRequestGatePlaceholderWorld(
        world,
        latestRequest,
      );
    }

    if (!world) {
      const defaultProvider = this.computeProviderRegistry.getProvider(this.resolveDefaultProviderKey());
      world = await this.worldRepo.save(
        this.worldRepo.create({
          phone: normalizedPhone,
          name: this.createDefaultWorldName(normalizedPhone),
          slug: createCloudWorldSlug(normalizedPhone),
          status: "queued",
          desiredState: "running",
          provisionStrategy: defaultProvider.summary.provisionStrategy,
          providerKey: defaultProvider.key,
          providerRegion: payload.preferredRegion?.trim() || defaultProvider.summary.defaultRegion || null,
          providerZone: defaultProvider.summary.defaultZone ?? null,
          apiBaseUrl: null,
          adminUrl: null,
          runtimeVersion: defaultProvider.key === "mock" ? "mock-runtime-v1" : null,
          callbackToken: randomUUID(),
          healthStatus: "queued",
          healthMessage: "世界已进入创建队列。",
          lastAccessedAt: now,
          lastInteractiveAt: null,
          lastBootedAt: null,
          lastHeartbeatAt: null,
          lastSuspendedAt: null,
          failureCode: null,
          failureMessage: null,
          retryCount: 0,
          note: null,
        }),
      );
      await this.ensureLifecycleJob(world.id, "provision", {
        source: "world-access",
        phone: normalizedPhone,
      });
    } else {
      world = await this.prepareWorldForAccess(world, now);
    }

    const session = await this.createAccessSession(world, payload, now);
    return this.serializeAccessSession(session, world);
  }

  async getWorldAccessSessionByPhone(phone: string, sessionId: string): Promise<WorldAccessSessionSummary> {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const session = await this.accessSessionRepo.findOne({
      where: { id: sessionId, phone: normalizedPhone },
    });
    if (!session) {
      throw new NotFoundException("找不到这次进入世界会话。");
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now() && !this.isFinalSessionStatus(session.status)) {
      session.status = "expired";
      session.failureReason = session.failureReason ?? "这次进入世界会话已过期，请重新发起。";
      await this.accessSessionRepo.save(session);
    }

    const [world, latestRequest] = await Promise.all([
      this.worldRepo.findOne({
        where: { id: session.worldId },
      }),
      this.requestRepo.findOne({
        where: { phone: normalizedPhone },
        order: { updatedAt: "DESC" },
      }),
    ]);

    return this.serializeAccessSession(session, world, {
      hideWorldId:
        session.failureReason === PHONE_CHANGE_INVALIDATED_ACCESS_SESSION_REASON ||
        (!world && !!latestRequest && this.shouldGateWorldAccess(latestRequest)) ||
        (!!world && isRequestGatePlaceholderWorld(world)),
    });
  }

  async invalidateWaitingSessionsForPhone(phone: string) {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const sessions = await this.accessSessionRepo.find({
      where: {
        phone: normalizedPhone,
        status: In(["pending", "resolving", "waiting"]),
      },
    });
    if (!sessions.length) {
      return;
    }

    await this.applySnapshotToSessions(
      sessions,
      this.buildPhoneChangeInvalidationSnapshot(),
    );
  }

  async refreshWaitingSessionsForPhone(phone: string) {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const [world, latestRequest, sessions] = await Promise.all([
      this.worldRepo.findOne({
        where: { phone: normalizedPhone },
      }),
      this.requestRepo.findOne({
        where: { phone: normalizedPhone },
        order: { updatedAt: "DESC" },
      }),
      this.accessSessionRepo.find({
        where: {
          phone: normalizedPhone,
          status: In(["pending", "resolving", "waiting"]),
        },
      }),
    ]);

    if (!sessions.length) {
      return;
    }

    const snapshot =
      latestRequest && this.shouldGateWorldAccess(latestRequest)
        ? this.buildRequestGateSnapshot(latestRequest)
        : world
          ? buildWorldAccessSnapshot(world)
          : null;
    if (!snapshot) {
      return;
    }

    await this.applySnapshotToSessions(sessions, snapshot);
  }

  async refreshWaitingSessionsForWorld(worldId: string) {
    const world = await this.worldRepo.findOne({
      where: { id: worldId },
    });
    if (!world) {
      return;
    }

    const sessions = await this.accessSessionRepo.find({
      where: {
        worldId,
        status: In(["pending", "resolving", "waiting"]),
      },
    });
    if (!sessions.length) {
      return;
    }

    const latestRequest = isRequestGatePlaceholderWorld(world)
      ? await this.requestRepo.findOne({
          where: { phone: world.phone },
          order: { updatedAt: "DESC" },
        })
      : null;
    const snapshot =
      latestRequest && this.shouldGateWorldAccess(latestRequest)
        ? this.buildRequestGateSnapshot(latestRequest)
        : buildWorldAccessSnapshot(world);

    await this.applySnapshotToSessions(sessions, snapshot);
  }

  private async prepareWorldForAccess(world: CloudWorldEntity, now: Date) {
    let dirty = false;
    const provider = this.computeProviderRegistry.getProvider(world.providerKey ?? this.resolveDefaultProviderKey());

    switch (world.status) {
      case "active":
        world.status = "ready";
        dirty = true;
        break;
      case "provisioning":
        world.status = "creating";
        dirty = true;
        break;
      case "pending":
        world.status = "queued";
        dirty = true;
        break;
      case "rejected":
        world.status = "failed";
        dirty = true;
        break;
      default:
        break;
    }

    if (world.status !== "disabled" && world.status !== "deleting") {
      world.lastAccessedAt = now;
      dirty = true;
    }

    if (world.status === "ready" && !world.apiBaseUrl) {
      const jobType = await this.chooseRecoveryJobType(world.id);
      world.status = jobType === "resume" ? "starting" : "queued";
      world.healthStatus = jobType === "resume" ? "starting" : "queued";
      world.healthMessage = jobType === "resume" ? "正在唤起你之前的世界。" : "正在重新创建你的世界。";
      dirty = true;
      await this.ensureLifecycleJob(world.id, jobType, {
        source: "world-access-missing-api-base",
        phone: world.phone,
      });
    }

    switch (world.status) {
      case "sleeping":
        world.status = "starting";
        world.desiredState = "running";
        world.healthStatus = "starting";
        world.healthMessage = "正在唤起你之前的世界。";
        world.failureCode = null;
        world.failureMessage = null;
        dirty = true;
        await this.ensureLifecycleJob(world.id, "resume", {
          source: "world-access",
          phone: world.phone,
        });
        break;
      case "failed": {
        const jobType = await this.chooseRecoveryJobType(world.id);
        world.status = jobType === "resume" ? "starting" : "queued";
        world.desiredState = "running";
        world.healthStatus = jobType === "resume" ? "starting" : "queued";
        world.healthMessage = jobType === "resume" ? "正在重试唤起你的世界。" : "正在重新创建你的世界。";
        world.failureCode = null;
        world.failureMessage = null;
        dirty = true;
        await this.ensureLifecycleJob(world.id, jobType, {
          source: "world-access-retry",
          phone: world.phone,
        });
        break;
      }
      case "queued":
      case "creating":
      case "bootstrapping":
        await this.ensureLifecycleJob(world.id, "provision", {
          source: "world-access-recheck",
          phone: world.phone,
        });
        break;
      case "starting":
        await this.ensureLifecycleJob(world.id, "resume", {
          source: "world-access-recheck",
          phone: world.phone,
        });
        break;
      default:
        break;
    }

    if (!world.slug) {
      world.slug = createCloudWorldSlug(world.phone);
      dirty = true;
    }
    if (!world.callbackToken) {
      world.callbackToken = randomUUID();
      dirty = true;
    }
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

    if (dirty) {
      return this.worldRepo.save(world);
    }

    return world;
  }

  private async createAccessSession(
    world: CloudWorldEntity,
    payload: ResolveWorldAccessRequest,
    now: Date,
    snapshot = buildWorldAccessSnapshot(world),
  ) {
    return this.accessSessionRepo.save(
      this.accessSessionRepo.create({
        worldId: world.id,
        phone: world.phone,
        status: snapshot.status,
        phase: snapshot.phase,
        displayStatus: snapshot.displayStatus,
        resolvedApiBaseUrl: snapshot.resolvedApiBaseUrl,
        retryAfterSeconds: snapshot.retryAfterSeconds,
        estimatedWaitSeconds: snapshot.estimatedWaitSeconds,
        failureReason: snapshot.failureReason,
        clientPlatform: payload.clientPlatform?.trim() || null,
        clientVersion: payload.clientVersion?.trim() || null,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        resolvedAt: snapshot.status === "ready" ? now : null,
      }),
    );
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
        priority: jobType === "resume" ? 50 : 100,
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

  private serializeAccessSession(
    session: WorldAccessSessionEntity,
    world?: CloudWorldEntity | null,
    options?: { hideWorldId?: boolean },
  ): WorldAccessSessionSummary {
    return {
      id: session.id,
      worldId: options?.hideWorldId ? null : session.worldId,
      phone: session.phone,
      status: session.status as WorldAccessSessionSummary["status"],
      phase: session.phase as WorldAccessSessionSummary["phase"],
      displayStatus: session.displayStatus,
      resolvedApiBaseUrl: session.resolvedApiBaseUrl,
      retryAfterSeconds: session.retryAfterSeconds,
      estimatedWaitSeconds: session.estimatedWaitSeconds,
      failureReason: session.failureReason,
      expiresAt: session.expiresAt?.toISOString() ?? null,
      resolvedAt: session.resolvedAt?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private async applySnapshotToSessions(
    sessions: WorldAccessSessionEntity[],
    snapshot: WorldAccessSnapshot,
  ) {
    const resolvedAt = snapshot.status === "ready" ? new Date() : null;

    for (const session of sessions) {
      session.status = snapshot.status;
      session.phase = snapshot.phase;
      session.displayStatus = snapshot.displayStatus;
      session.resolvedApiBaseUrl = snapshot.resolvedApiBaseUrl;
      session.retryAfterSeconds = snapshot.retryAfterSeconds;
      session.estimatedWaitSeconds = snapshot.estimatedWaitSeconds;
      session.failureReason = snapshot.failureReason;
      if (resolvedAt) {
        session.resolvedAt = resolvedAt;
      }
    }

    await this.accessSessionRepo.save(sessions);
  }

  private buildPhoneChangeInvalidationSnapshot(): WorldAccessSnapshot {
    return {
      status: "failed",
      phase: "failed",
      displayStatus: "这次进入世界会话已失效。",
      resolvedApiBaseUrl: null,
      retryAfterSeconds: 0,
      estimatedWaitSeconds: null,
      failureReason: PHONE_CHANGE_INVALIDATED_ACCESS_SESSION_REASON,
    };
  }

  private createDefaultWorldName(phone: string) {
    return `隐界世界-${phone.slice(-4)}`;
  }

  private shouldGateWorldAccess(
    latestRequest: Pick<CloudWorldRequestEntity, "status"> | null,
  ): latestRequest is Pick<CloudWorldRequestEntity, "status"> {
    return Boolean(
      latestRequest &&
        (latestRequest.status === "pending" ||
          latestRequest.status === "rejected" ||
          latestRequest.status === "disabled"),
    );
  }

  private buildRequestGateSnapshot(
    request: Pick<CloudWorldRequestEntity, "status" | "note">,
  ): WorldAccessSnapshot {
    const state = getRequestGateState(
      request.status as CloudWorldRequestStatus,
      request.note,
    );
    return {
      status: state.accessStatus,
      phase: state.accessPhase,
      displayStatus: state.displayStatus,
      resolvedApiBaseUrl: null,
      retryAfterSeconds: state.retryAfterSeconds,
      estimatedWaitSeconds: state.estimatedWaitSeconds,
      failureReason: state.failureReason,
    };
  }

  private async ensureRequestGatePlaceholderWorld(
    phone: string,
    request: Pick<CloudWorldRequestEntity, "worldName" | "status" | "note">,
    existingWorld?: CloudWorldEntity | null,
  ) {
    const defaultProvider = this.computeProviderRegistry.getProvider(
      this.resolveDefaultProviderKey(),
    );
    const snapshot = this.buildRequestGateSnapshot(request);
    const state = getRequestGateState(
      request.status as CloudWorldRequestStatus,
      request.note,
    );

    const world =
      existingWorld && isRequestGatePlaceholderWorld(existingWorld)
        ? existingWorld
        : this.worldRepo.create({
            phone,
            slug: createCloudWorldSlug(phone),
            callbackToken: randomUUID(),
          });
    world.phone = phone;
    world.name = request.worldName;
    world.slug = world.slug || createCloudWorldSlug(phone);
    world.status = "disabled";
    world.desiredState = "sleeping";
    world.provisionStrategy =
      world.provisionStrategy || defaultProvider.summary.provisionStrategy;
    world.providerKey = world.providerKey || defaultProvider.key;
    world.providerRegion =
      world.providerRegion ?? defaultProvider.summary.defaultRegion ?? null;
    world.providerZone =
      world.providerZone ?? defaultProvider.summary.defaultZone ?? null;
    world.apiBaseUrl = null;
    world.adminUrl = null;
    world.runtimeVersion =
      world.runtimeVersion ??
      (defaultProvider.key === "mock" ? "mock-runtime-v1" : null);
    world.callbackToken = world.callbackToken || randomUUID();
    world.healthStatus = state.placeholderHealthStatus;
    world.healthMessage = snapshot.displayStatus;
    world.lastAccessedAt = null;
    world.lastInteractiveAt = null;
    world.lastBootedAt = null;
    world.lastHeartbeatAt = null;
    world.lastSuspendedAt = null;
    world.failureCode = state.failureCode;
    world.failureMessage = snapshot.failureReason;
    world.retryCount = 0;
    world.note = request.note ?? null;

    return this.worldRepo.save(
      world,
    );
  }

  private async restoreRequestGatePlaceholderWorld(
    world: CloudWorldEntity,
    latestRequest: Pick<
      CloudWorldRequestEntity,
      "status" | "worldName" | "note"
    > | null,
  ) {
    const provider = this.computeProviderRegistry.getProvider(
      world.providerKey ?? this.resolveDefaultProviderKey(),
    );
    const queuedProjection = getRequestVisibleWorldProjection("pending");
    const nextProjection =
      latestRequest?.status === "active" && !this.trimToNull(world.apiBaseUrl)
        ? queuedProjection
        : latestRequest
          ? getRequestVisibleWorldProjection(
              latestRequest.status as CloudWorldRequestStatus,
              latestRequest.note,
            )
          : queuedProjection;

    world.name =
      latestRequest?.worldName?.trim() || world.name || this.createDefaultWorldName(world.phone);
    world.status = nextProjection.worldStatus;
    world.desiredState = nextProjection.desiredState;
    world.provisionStrategy =
      world.provisionStrategy || provider.summary.provisionStrategy;
    world.providerKey = world.providerKey || provider.key;
    world.providerRegion = world.providerRegion ?? provider.summary.defaultRegion ?? null;
    world.providerZone = world.providerZone ?? provider.summary.defaultZone ?? null;
    world.slug = world.slug || createCloudWorldSlug(world.phone);
    world.callbackToken = world.callbackToken || randomUUID();
    world.failureCode = nextProjection.failureCode;
    world.failureMessage = nextProjection.failureMessage;
    world.note = latestRequest?.note ?? null;

    if (
      nextProjection.worldStatus === "ready" &&
      this.trimToNull(world.apiBaseUrl)
    ) {
      world.healthStatus = world.healthStatus || nextProjection.healthStatus;
      world.healthMessage =
        this.trimToNull(world.healthMessage) || nextProjection.healthMessage;
    } else {
      world.healthStatus = nextProjection.healthStatus;
      world.healthMessage = nextProjection.healthMessage;
    }

    return this.worldRepo.save(world);
  }

  private resolveDefaultProviderKey() {
    return this.computeProviderRegistry.getDefaultProviderKey();
  }

  private isFinalSessionStatus(status: string) {
    return status === "ready" || status === "failed" || status === "disabled" || status === "expired";
  }

  private trimToNull(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
