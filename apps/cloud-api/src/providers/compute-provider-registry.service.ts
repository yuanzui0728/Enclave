import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockComputeProviderService } from "../orchestration/mock-compute-provider.service";
import { ManualDockerComputeProviderService } from "./manual-docker-compute-provider.service";
import type { WorldComputeProvider } from "./compute-provider.types";

@Injectable()
export class ComputeProviderRegistryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly mockComputeProvider: MockComputeProviderService,
    private readonly manualDockerComputeProvider: ManualDockerComputeProviderService,
  ) {}

  getDefaultProviderKey() {
    const configuredProviderKey = this.configService.get<string>("CLOUD_DEFAULT_PROVIDER_KEY")?.trim();
    if (!configuredProviderKey) {
      return this.mockComputeProvider.key;
    }

    return this.requireProvider(configuredProviderKey).key;
  }

  listProviders() {
    return [this.mockComputeProvider.summary, this.manualDockerComputeProvider.summary];
  }

  requireProvider(providerKey?: string | null): WorldComputeProvider {
    const normalizedProviderKey = providerKey?.trim();
    if (!normalizedProviderKey) {
      return this.requireProvider(this.getDefaultProviderKey());
    }

    switch (normalizedProviderKey) {
      case "manual":
      case this.manualDockerComputeProvider.key:
        return this.manualDockerComputeProvider;
      case this.mockComputeProvider.key:
        return this.mockComputeProvider;
      default:
        throw new BadRequestException(`Unsupported compute provider: ${normalizedProviderKey}`);
    }
  }

  getProvider(providerKey?: string | null): WorldComputeProvider {
    return this.requireProvider(providerKey);
  }
}
