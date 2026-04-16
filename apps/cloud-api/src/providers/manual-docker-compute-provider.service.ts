import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CloudComputeProviderSummary } from "@yinjie/contracts";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import type {
  ProvisionWorldInstanceResult,
  WorldComputeProvider,
  WorldInstancePowerTransitionResult,
} from "./compute-provider.types";
import {
  buildWorldBootstrapConfig,
  resolveRuntimeImage,
  resolveSuggestedWorldAdminUrl,
  resolveSuggestedWorldApiBaseUrl,
  resolveWorldContainerName,
  resolveWorldDataVolumeName,
} from "../orchestration/world-bootstrap-config";

@Injectable()
export class ManualDockerComputeProviderService implements WorldComputeProvider {
  readonly key = "manual-docker";
  readonly summary: CloudComputeProviderSummary;

  constructor(private readonly configService: ConfigService) {
    this.summary = {
      key: this.key,
      label: "Manual Docker Host",
      description:
        "Creates a per-world deployment package for a managed Docker host and waits for the runtime to call back before the world is marked ready.",
      provisionStrategy: "manual-docker",
      deploymentMode: "manual-docker",
      defaultRegion: this.resolveDefaultRegion(),
      defaultZone: this.resolveDefaultZone(),
      capabilities: {
        managedProvisioning: false,
        managedLifecycle: false,
        bootstrapPackage: true,
        snapshots: false,
      },
    };
  }

  createInstance(world: CloudWorldEntity): ProvisionWorldInstanceResult {
    const bootstrapConfig = buildWorldBootstrapConfig(world, this.configService);
    const containerName = resolveWorldContainerName(world);
    const volumeName = resolveWorldDataVolumeName(world);
    const image = resolveRuntimeImage(world.providerKey, this.configService);

    return {
      providerKey: this.key,
      providerInstanceId: containerName,
      providerVolumeId: volumeName,
      providerSnapshotId: null,
      region: world.providerRegion ?? this.resolveDefaultRegion(),
      zone: world.providerZone ?? this.resolveDefaultZone(),
      privateIp: "docker-host",
      publicIp: null,
      apiBaseUrl: this.resolveApiBaseUrl(world),
      adminUrl: this.resolveAdminUrl(world),
      imageId: image,
      flavor: "docker-container",
      diskSizeGb: this.resolveDiskSizeGb(),
      launchConfig: {
        ...bootstrapConfig.env,
        DOCKER_IMAGE: image ?? "",
        DOCKER_CONTAINER_NAME: containerName,
        DOCKER_VOLUME_NAME: volumeName,
      },
    };
  }

  startInstance(
    instance: CloudInstanceEntity,
    _world: CloudWorldEntity,
  ): WorldInstancePowerTransitionResult {
    return {
      powerState: "running",
      providerSnapshotId: instance.providerSnapshotId,
    };
  }

  stopInstance(
    instance: CloudInstanceEntity,
    _world: CloudWorldEntity,
  ): WorldInstancePowerTransitionResult {
    return {
      powerState: "stopped",
      providerSnapshotId: instance.providerSnapshotId,
    };
  }

  private resolveApiBaseUrl(world: CloudWorldEntity) {
    return resolveSuggestedWorldApiBaseUrl(world, this.configService) ?? "http://localhost:3000";
  }

  private resolveAdminUrl(world: CloudWorldEntity) {
    return resolveSuggestedWorldAdminUrl(world, this.configService);
  }

  private resolveDefaultRegion() {
    return this.configService.get<string>("CLOUD_MANUAL_DOCKER_DEFAULT_REGION")?.trim() || "manual";
  }

  private resolveDefaultZone() {
    return this.configService.get<string>("CLOUD_MANUAL_DOCKER_DEFAULT_ZONE")?.trim() || "docker-host-a";
  }

  private resolveDiskSizeGb() {
    const parsed = Number(this.configService.get<string>("CLOUD_MANUAL_DOCKER_DISK_SIZE_GB") ?? "20");
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 20;
    }

    return Math.floor(parsed);
  }
}
