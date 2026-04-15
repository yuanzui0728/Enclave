import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockComputeProviderService } from "../orchestration/mock-compute-provider.service";
import type { WorldComputeProvider } from "./compute-provider.types";

@Injectable()
export class ComputeProviderRegistryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly mockComputeProvider: MockComputeProviderService,
  ) {}

  getDefaultProviderKey() {
    return this.configService.get<string>("CLOUD_DEFAULT_PROVIDER_KEY")?.trim() || this.mockComputeProvider.key;
  }

  getProvider(providerKey?: string | null): WorldComputeProvider {
    const normalizedProviderKey = providerKey?.trim() || this.getDefaultProviderKey();

    switch (normalizedProviderKey) {
      case this.mockComputeProvider.key:
        return this.mockComputeProvider;
      default:
        return this.mockComputeProvider;
    }
  }
}
