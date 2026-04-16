import type { CloudComputeProviderSummary, CloudWorldDeploymentState } from "@yinjie/contracts";
import type { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import type { CloudWorldEntity } from "../entities/cloud-world.entity";

export type Awaitable<T> = T | Promise<T>;

export type ProvisionWorldInstanceResult = {
  providerKey: string;
  providerInstanceId: string;
  providerVolumeId?: string | null;
  providerSnapshotId?: string | null;
  region: string;
  zone: string;
  privateIp: string;
  publicIp: string | null;
  apiBaseUrl: string;
  adminUrl: string | null;
  imageId?: string | null;
  flavor?: string | null;
  diskSizeGb?: number | null;
  launchConfig?: Record<string, string> | null;
};

export type WorldInstancePowerTransitionResult = {
  powerState: string;
  providerSnapshotId?: string | null;
};

export type InspectWorldInstanceResult = {
  providerKey?: string | null;
  deploymentMode?: string | null;
  executorMode?: string | null;
  remoteHost?: string | null;
  remoteDeployPath?: string | null;
  projectName?: string | null;
  containerName?: string | null;
  deploymentState: CloudWorldDeploymentState;
  providerMessage?: string | null;
  rawStatus?: string | null;
};

export interface WorldComputeProvider {
  readonly key: string;
  readonly summary: CloudComputeProviderSummary;
  createInstance(world: CloudWorldEntity): Awaitable<ProvisionWorldInstanceResult>;
  startInstance(
    instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): Awaitable<WorldInstancePowerTransitionResult>;
  stopInstance(
    instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): Awaitable<WorldInstancePowerTransitionResult>;
  inspectInstance(
    instance: CloudInstanceEntity | null,
    world: CloudWorldEntity,
  ): Awaitable<InspectWorldInstanceResult>;
}
