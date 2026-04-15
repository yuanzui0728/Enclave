import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { resolveSuggestedWorldAdminUrl, resolveSuggestedWorldApiBaseUrl } from "./world-bootstrap-config";

type ProvisionedInstance = {
  providerKey: string;
  providerInstanceId: string;
  region: string;
  zone: string;
  privateIp: string;
  publicIp: string | null;
  apiBaseUrl: string;
  adminUrl: string | null;
};

@Injectable()
export class MockComputeProviderService {
  constructor(private readonly configService: ConfigService) {}

  createInstance(world: CloudWorldEntity): ProvisionedInstance {
    return {
      providerKey: "mock",
      providerInstanceId: `mock-instance-${randomUUID()}`,
      region: world.providerRegion ?? "mock-local",
      zone: world.providerZone ?? "mock-a",
      privateIp: "127.0.0.1",
      publicIp: null,
      apiBaseUrl: this.resolveApiBaseUrl(world),
      adminUrl: this.resolveAdminUrl(world),
    };
  }

  startInstance(instance: CloudInstanceEntity) {
    return {
      ...instance,
      powerState: "running",
    };
  }

  stopInstance(instance: CloudInstanceEntity) {
    return {
      ...instance,
      powerState: "stopped",
    };
  }

  resolveApiBaseUrl(world: CloudWorldEntity) {
    return resolveSuggestedWorldApiBaseUrl(world, this.configService) ?? "http://localhost:3000";
  }

  resolveAdminUrl(world: CloudWorldEntity) {
    return resolveSuggestedWorldAdminUrl(world, this.configService);
  }
}
