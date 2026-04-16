import type { CloudComputeProviderSummary } from "@yinjie/contracts";
import type { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import type { CloudWorldEntity } from "../entities/cloud-world.entity";

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

export interface WorldComputeProvider {
  readonly key: string;
  readonly summary: CloudComputeProviderSummary;
  createInstance(world: CloudWorldEntity): ProvisionWorldInstanceResult;
  startInstance(
    instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): WorldInstancePowerTransitionResult;
  stopInstance(
    instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): WorldInstancePowerTransitionResult;
}
