import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CloudComputeProviderSummary } from "@yinjie/contracts";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import type {
  InspectWorldInstanceResult,
  ProvisionWorldInstanceResult,
  WorldComputeProvider,
  WorldInstancePowerTransitionResult,
} from "./compute-provider.types";
import {
  buildWorldBootstrapConfig,
  resolveDeploymentMode,
  resolveProviderLabel,
  resolveRuntimeImage,
  resolveSuggestedWorldAdminUrl,
  resolveSuggestedWorldApiBaseUrl,
  resolveWorldComposeProjectName,
  resolveWorldContainerName,
  resolveWorldDataVolumeName,
  resolveWorldRemoteDeployPath,
} from "../orchestration/world-bootstrap-config";
import { ManualDockerRemoteExecutorService } from "./manual-docker-remote-executor.service";

@Injectable()
export class ManualDockerComputeProviderService implements WorldComputeProvider {
  readonly key = "manual-docker";

  constructor(
    private readonly configService: ConfigService,
    private readonly remoteExecutor: ManualDockerRemoteExecutorService,
  ) {}

  get summary(): CloudComputeProviderSummary {
    return {
      key: this.key,
      label: resolveProviderLabel(this.key, this.configService),
      description: this.remoteExecutor.isEnabled()
        ? "Pushes each world's compose/env package to a Docker host over SSH, then waits for runtime bootstrap and heartbeat callbacks before marking the world ready."
        : "Creates a per-world deployment package for a managed Docker host and waits for the runtime to call back before the world is marked ready.",
      provisionStrategy: "manual-docker",
      deploymentMode: resolveDeploymentMode(this.key, this.configService),
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

  async createInstance(world: CloudWorldEntity): Promise<ProvisionWorldInstanceResult> {
    const bootstrapConfig = buildWorldBootstrapConfig(world, this.configService);
    const containerName = resolveWorldContainerName(world);
    const volumeName = resolveWorldDataVolumeName(world);
    const image = resolveRuntimeImage(world.providerKey, this.configService);
    const projectName = resolveWorldComposeProjectName(world);
    const remoteDeployPath = resolveWorldRemoteDeployPath(world, this.configService);

    await this.remoteExecutor.deployWorld(world, bootstrapConfig);

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
        MANUAL_DOCKER_EXECUTOR_MODE: this.remoteExecutor.resolveExecutorMode(),
        DOCKER_IMAGE: image ?? "",
        DOCKER_CONTAINER_NAME: containerName,
        DOCKER_VOLUME_NAME: volumeName,
        DOCKER_PROJECT_NAME: projectName,
        DOCKER_REMOTE_DEPLOY_PATH: remoteDeployPath ?? "",
      },
    };
  }

  async startInstance(
    instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): Promise<WorldInstancePowerTransitionResult> {
    await this.remoteExecutor.startWorld(world);
    return {
      powerState: "running",
      providerSnapshotId: instance.providerSnapshotId,
    };
  }

  async stopInstance(
    instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): Promise<WorldInstancePowerTransitionResult> {
    await this.remoteExecutor.stopWorld(world);
    return {
      powerState: "stopped",
      providerSnapshotId: instance.providerSnapshotId,
    };
  }

  inspectInstance(
    instance: CloudInstanceEntity | null,
    world: CloudWorldEntity,
  ): Promise<InspectWorldInstanceResult> {
    return this.remoteExecutor.inspectWorld(world, instance?.providerInstanceId ?? resolveWorldContainerName(world));
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
