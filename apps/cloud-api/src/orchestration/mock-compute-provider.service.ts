import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import type {
  ProvisionWorldInstanceResult,
  WorldComputeProvider,
  WorldInstancePowerTransitionResult,
} from "../providers/compute-provider.types";
import {
  buildWorldBootstrapConfig,
  resolveSuggestedWorldAdminUrl,
  resolveSuggestedWorldApiBaseUrl,
} from "./world-bootstrap-config";

@Injectable()
export class MockComputeProviderService implements WorldComputeProvider {
  readonly key = "mock";

  constructor(private readonly configService: ConfigService) {}

  createInstance(world: CloudWorldEntity): ProvisionWorldInstanceResult {
    const bootstrapConfig = buildWorldBootstrapConfig(world, this.configService);

    return {
      providerKey: this.key,
      providerInstanceId: `mock-instance-${randomUUID()}`,
      providerVolumeId: `mock-volume-${world.slug ?? world.id}`,
      providerSnapshotId: null,
      region: world.providerRegion ?? "mock-local",
      zone: world.providerZone ?? "mock-a",
      privateIp: "127.0.0.1",
      publicIp: null,
      apiBaseUrl: this.resolveApiBaseUrl(world),
      adminUrl: this.resolveAdminUrl(world),
      imageId: "mock-image-v1",
      flavor: "mock.small",
      diskSizeGb: 20,
      launchConfig: bootstrapConfig.env,
    };
  }

  startInstance(
    instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): WorldInstancePowerTransitionResult {
    return {
      powerState: "running",
      providerSnapshotId:
        instance.providerSnapshotId ?? `mock-snapshot-${world.slug ?? world.id}`,
    };
  }

  stopInstance(
    instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): WorldInstancePowerTransitionResult {
    return {
      powerState: "stopped",
      providerSnapshotId:
        instance.providerSnapshotId ?? `mock-snapshot-${world.slug ?? world.id}`,
    };
  }

  resolveApiBaseUrl(world: CloudWorldEntity) {
    return resolveSuggestedWorldApiBaseUrl(world, this.configService) ?? "http://localhost:3000";
  }

  resolveAdminUrl(world: CloudWorldEntity) {
    return resolveSuggestedWorldAdminUrl(world, this.configService);
  }
}
