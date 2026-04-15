import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  ResolveWorldAccessRequest,
  ResolveWorldAccessResponse,
  WorldAccessSessionSummary,
  WorldLifecycleJobType,
} from "@yinjie/contracts";
import { createHash, randomUUID } from "node:crypto";
import { In, Repository } from "typeorm";
import { PhoneAuthService } from "../auth/phone-auth.service";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { WorldAccessSessionEntity } from "../entities/world-access-session.entity";
import { WorldLifecycleJobEntity } from "../entities/world-lifecycle-job.entity";
import { buildWorldAccessSnapshot } from "./world-access-state";

@Injectable()
export class WorldAccessService {
  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(CloudInstanceEntity)
    private readonly instanceRepo: Repository<CloudInstanceEntity>,
    @InjectRepository(WorldLifecycleJobEntity)
    private readonly jobRepo: Repository<WorldLifecycleJobEntity>,
    @InjectRepository(WorldAccessSessionEntity)
    private readonly accessSessionRepo: Repository<WorldAccessSessionEntity>,
    private readonly phoneAuthService: PhoneAuthService,
  ) {}

  async resolveWorldAccessByPhone(phone: string, payload: ResolveWorldAccessRequest): Promise<ResolveWorldAccessResponse> {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const now = new Date();

    let world = await this.worldRepo.findOne({
      where: { phone: normalizedPhone },
    });

    if (!world) {
      world = await this.worldRepo.save(
        this.worldRepo.create({
          phone: normalizedPhone,
          name: this.createDefaultWorldName(normalizedPhone),
          slug: this.createWorldSlug(normalizedPhone),
          status: "queued",
          desiredState: "running",
          provisionStrategy: "mock",
          providerKey: "mock",
          providerRegion: payload.preferredRegion?.trim() || "mock-local",
          providerZone: "mock-a",
          apiBaseUrl: null,
          adminUrl: null,
          runtimeVersion: "mock-runtime-v1",
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
    return this.serializeAccessSession(session);
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

    return this.serializeAccessSession(session);
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

    const snapshot = buildWorldAccessSnapshot(world);
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

  private async prepareWorldForAccess(world: CloudWorldEntity, now: Date) {
    let dirty = false;

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
      world.slug = this.createWorldSlug(world.phone);
      dirty = true;
    }
    if (!world.callbackToken) {
      world.callbackToken = randomUUID();
      dirty = true;
    }
    if (world.providerKey === null) {
      world.providerKey = "mock";
      dirty = true;
    }

    if (dirty) {
      return this.worldRepo.save(world);
    }

    return world;
  }

  private async createAccessSession(world: CloudWorldEntity, payload: ResolveWorldAccessRequest, now: Date) {
    const snapshot = buildWorldAccessSnapshot(world);
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

  private serializeAccessSession(session: WorldAccessSessionEntity): WorldAccessSessionSummary {
    return {
      id: session.id,
      worldId: session.worldId,
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

  private createDefaultWorldName(phone: string) {
    return `隐界世界-${phone.slice(-4)}`;
  }

  private createWorldSlug(phone: string) {
    const digits = phone.replace(/\D+/g, "");
    const suffix = createHash("sha1").update(phone).digest("hex").slice(0, 8);
    return `world-${digits.slice(-4)}-${suffix}`;
  }

  private isFinalSessionStatus(status: string) {
    return status === "ready" || status === "failed" || status === "disabled" || status === "expired";
  }
}
