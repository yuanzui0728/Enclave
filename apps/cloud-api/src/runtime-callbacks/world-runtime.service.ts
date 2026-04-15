import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { WorldAccessService } from "../world-access/world-access.service";

type RuntimeCallbackPayload = {
  callbackToken?: string | null;
  apiBaseUrl?: string | null;
  adminUrl?: string | null;
  runtimeVersion?: string | null;
  healthStatus?: string | null;
  healthMessage?: string | null;
  reportedAt?: string | null;
  lastInteractiveAt?: string | null;
};

type RuntimeFailurePayload = RuntimeCallbackPayload & {
  failureCode?: string | null;
  failureMessage?: string | null;
};

type RuntimeSignalKind = "bootstrap" | "heartbeat" | "activity" | "health";

@Injectable()
export class WorldRuntimeService {
  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(CloudInstanceEntity)
    private readonly instanceRepo: Repository<CloudInstanceEntity>,
    private readonly worldAccessService: WorldAccessService,
  ) {}

  async reportBootstrap(worldId: string, payload: RuntimeCallbackPayload, headerToken?: string) {
    return this.handleRuntimeSignal(worldId, payload, headerToken, "bootstrap");
  }

  async reportHeartbeat(worldId: string, payload: RuntimeCallbackPayload, headerToken?: string) {
    return this.handleRuntimeSignal(worldId, payload, headerToken, "heartbeat");
  }

  async reportActivity(worldId: string, payload: RuntimeCallbackPayload, headerToken?: string) {
    return this.handleRuntimeSignal(worldId, payload, headerToken, "activity");
  }

  async reportHealth(worldId: string, payload: RuntimeCallbackPayload, headerToken?: string) {
    return this.handleRuntimeSignal(worldId, payload, headerToken, "health");
  }

  async reportFailure(worldId: string, payload: RuntimeFailurePayload, headerToken?: string) {
    const world = await this.getWorldOrThrow(worldId);
    this.assertCallbackToken(world, headerToken, payload.callbackToken);

    const reportedAt = this.parseOptionalDate(payload.reportedAt, "reportedAt") ?? new Date();
    const lastInteractiveAt = this.parseOptionalDate(payload.lastInteractiveAt, "lastInteractiveAt");
    const instance = await this.instanceRepo.findOne({
      where: { worldId },
    });

    this.applyWorldMetadata(world, payload);
    if (lastInteractiveAt && this.isNewerTimestamp(world.lastInteractiveAt, lastInteractiveAt)) {
      world.lastInteractiveAt = lastInteractiveAt;
    }

    const failureMessage =
      this.trimToNull(payload.failureMessage) ??
      this.trimToNull(payload.healthMessage) ??
      "World runtime reported a failure.";

    world.status = "failed";
    world.healthStatus = "failed";
    world.healthMessage = failureMessage;
    world.failureCode = this.trimToNull(payload.failureCode) ?? "runtime_failure";
    world.failureMessage = failureMessage;
    world.lastHeartbeatAt = reportedAt;

    if (instance) {
      instance.powerState = "error";
      instance.lastHeartbeatAt = reportedAt;
      await this.instanceRepo.save(instance);
    }

    await this.worldRepo.save(world);
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);
    return {
      ok: true,
      worldId: world.id,
      status: world.status,
    };
  }

  private async handleRuntimeSignal(
    worldId: string,
    payload: RuntimeCallbackPayload,
    headerToken: string | undefined,
    signal: RuntimeSignalKind,
  ) {
    const world = await this.getWorldOrThrow(worldId);
    this.assertCallbackToken(world, headerToken, payload.callbackToken);

    const reportedAt = this.parseOptionalDate(payload.reportedAt, "reportedAt") ?? new Date();
    const lastInteractiveAt = this.parseOptionalDate(payload.lastInteractiveAt, "lastInteractiveAt");
    const instance =
      signal === "bootstrap" || signal === "heartbeat"
        ? await this.findOrCreateInstance(world)
        : await this.instanceRepo.findOne({
            where: { worldId },
          });

    this.applyWorldMetadata(world, payload);

    if (lastInteractiveAt && this.isNewerTimestamp(world.lastInteractiveAt, lastInteractiveAt)) {
      world.lastInteractiveAt = lastInteractiveAt;
    }

    if (signal === "bootstrap") {
      world.desiredState = "running";
      world.lastBootedAt = reportedAt;
    }

    if (signal === "bootstrap" || signal === "heartbeat") {
      world.desiredState = "running";
      world.lastHeartbeatAt = reportedAt;
      world.failureCode = null;
      world.failureMessage = null;

      if (instance) {
        instance.powerState = "running";
        instance.lastHeartbeatAt = reportedAt;
        if (signal === "bootstrap" || !instance.bootstrappedAt) {
          instance.bootstrappedAt = reportedAt;
        }
      }
    }

    const normalizedHealthStatus = this.trimToNull(payload.healthStatus);
    const shouldPromoteReady =
      signal !== "activity" &&
      normalizedHealthStatus !== "failed" &&
      world.desiredState === "running" &&
      Boolean(this.trimToNull(world.apiBaseUrl));

    if (shouldPromoteReady) {
      world.status = "ready";
      world.healthStatus = normalizedHealthStatus ?? "healthy";
      world.healthMessage =
        this.trimToNull(payload.healthMessage) ??
        this.trimToNull(world.healthMessage) ??
        "World runtime is healthy.";
      world.failureCode = null;
      world.failureMessage = null;
      if (!world.lastBootedAt) {
        world.lastBootedAt = reportedAt;
      }
      if (signal !== "health") {
        world.lastHeartbeatAt = reportedAt;
      }
    }

    await this.worldRepo.save(world);
    if (instance) {
      await this.instanceRepo.save(instance);
    }
    await this.worldAccessService.refreshWaitingSessionsForWorld(world.id);

    return {
      ok: true,
      worldId: world.id,
      status: world.status,
    };
  }

  private async getWorldOrThrow(worldId: string) {
    const world = await this.worldRepo.findOne({
      where: { id: worldId },
    });
    if (!world) {
      throw new NotFoundException("World not found.");
    }

    return world;
  }

  private async findOrCreateInstance(world: CloudWorldEntity) {
    let instance = await this.instanceRepo.findOne({
      where: { worldId: world.id },
    });

    if (!instance) {
      instance = this.instanceRepo.create({
        worldId: world.id,
        providerKey: world.providerKey ?? "runtime",
        providerInstanceId: null,
        name: `${world.slug ?? world.id}-vm`,
        region: world.providerRegion,
        zone: world.providerZone,
        privateIp: null,
        publicIp: null,
        powerState: "running",
        imageId: null,
        flavor: null,
        diskSizeGb: 20,
        bootstrappedAt: null,
        lastHeartbeatAt: null,
      });
    }

    return instance;
  }

  private assertCallbackToken(
    world: Pick<CloudWorldEntity, "callbackToken">,
    headerToken?: string,
    bodyToken?: string | null,
  ) {
    const expectedToken = this.trimToNull(world.callbackToken);
    const actualToken = this.trimToNull(headerToken) ?? this.trimToNull(bodyToken);

    if (!expectedToken) {
      throw new UnauthorizedException("World callback token is not configured.");
    }

    if (!actualToken || actualToken !== expectedToken) {
      throw new UnauthorizedException("Invalid world callback token.");
    }
  }

  private applyWorldMetadata(world: CloudWorldEntity, payload: RuntimeCallbackPayload) {
    if (payload.apiBaseUrl !== undefined) {
      world.apiBaseUrl = this.trimToNull(payload.apiBaseUrl);
    }
    if (payload.adminUrl !== undefined) {
      world.adminUrl = this.trimToNull(payload.adminUrl);
    }
    if (payload.runtimeVersion !== undefined) {
      world.runtimeVersion = this.trimToNull(payload.runtimeVersion);
    }
    if (payload.healthStatus !== undefined) {
      world.healthStatus = this.trimToNull(payload.healthStatus);
    }
    if (payload.healthMessage !== undefined) {
      world.healthMessage = this.trimToNull(payload.healthMessage);
    }
  }

  private parseOptionalDate(value: string | null | undefined, field: string) {
    const normalizedValue = this.trimToNull(value);
    if (!normalizedValue) {
      return null;
    }

    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date string.`);
    }

    return parsed;
  }

  private isNewerTimestamp(currentValue: Date | null, nextValue: Date) {
    return !currentValue || nextValue.getTime() >= currentValue.getTime();
  }

  private trimToNull(value: string | null | undefined) {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
  }
}
